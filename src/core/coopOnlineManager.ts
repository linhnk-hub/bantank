/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import { getUserDisplayLabel } from './authManager.ts';
import type {
  BulletStructure,
  EnemyTank,
  GameCoreState,
  InputState,
  TankStructure,
} from './types.ts';

export type CoopRoomStatus = 'WAITING' | 'PLAYING' | 'FINISHED' | 'ABANDONED' | 'EXPIRED';
export type CoopPlayerRole = 'HOST' | 'GUEST' | null;
export type CoopRtcConnectionState =
  | 'NEW'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'FAILED';

export interface SequencedInputPacket {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
  seq: number;
  clientTimestamp: number;
}

export interface CoopAuthoritativeSnapshot {
  snapshotSeq: number;
  serverTimestamp: number;
  tickCount: number;
  p1: TankStructure;
  p1State: GameCoreState['p1State'];
  p2: TankStructure | null;
  p2State: GameCoreState['p2State'];
  bullets: BulletStructure[];
  enemies: EnemyTank[];
  enemyQueueLength: number;
  totalDefeatedEnemies: number;
  score: number;
  highScore: number;
  defeatedCounts: GameCoreState['defeatedCounts'];
  currentStageId: number;
  currentStageName: string;
  stageElapsedSeconds: number;
  brickSubTiles: Record<string, number>;
  isBaseDestroyed: boolean;
  isGameOver: boolean;
  isStageClear: boolean;
  gameOverReason: string | null;
  matchState: GameCoreState['matchState'];
}

export type CoopDataChannelMessage =
  | { type: 'GUEST_INPUT'; packet: SequencedInputPacket }
  | { type: 'HOST_SNAPSHOT'; snapshot: CoopAuthoritativeSnapshot }
  | { type: 'PING'; timestamp: number };

/**
 * Cấu trúc tài liệu `/coop_rooms/{roomCode}` trên Firestore (M7.3 FIX).
 * Firestore CHỈ dùng cho tạo/vào phòng, trạng thái Ready, WebRTC Signaling (Offer/Answer/ICE)
 * và kết quả cuối trận. KHÔNG ghi liên tục input 45ms hoặc snapshot vào Firestore.
 */
export interface CoopRoomDocument {
  roomCode: string;
  status: CoopRoomStatus;
  difficulty: 'DEFAULT' | 'EXTREME';
  hostUid: string;
  hostDisplayName: string;
  hostPhotoURL: string;
  hostReady: boolean;
  hostLastActiveAt: number;
  guestUid: string | null;
  guestDisplayName: string | null;
  guestPhotoURL: string | null;
  guestReady: boolean;
  guestLastActiveAt: number | null;
  rtcOffer: string | null;
  rtcAnswer: string | null;
  hostIceCandidates: string | null;
  guestIceCandidates: string | null;
  rtcConnectionState: CoopRtcConnectionState;
  finalScore: number;
  matchOutcome: 'VICTORY' | 'GAME_OVER' | null;
  createdAt: number;
  expiresAt: number;
  disconnectReason: string | null;
}

export interface CoopActionResult {
  success: boolean;
  errorCode?:
    | 'UNAUTHENTICATED'
    | 'INVALID_CODE_FORMAT'
    | 'ROOM_NOT_FOUND'
    | 'ROOM_EXPIRED'
    | 'ROOM_FULL'
    | 'MATCH_ALREADY_STARTED'
    | 'SAME_USER_AS_HOST'
    | 'NOT_HOST'
    | 'PLAYERS_NOT_READY'
    | 'WEBRTC_NOT_CONNECTED'
    | 'RATE_LIMITED'
    | 'OUT_OF_ORDER_SEQ'
    | 'INVALID_PACKET'
    | 'NETWORK_ERROR';
  message?: string;
  room?: CoopRoomDocument;
}

export interface CoopStorageAdapter {
  getRoom(roomCode: string): Promise<CoopRoomDocument | null>;
  setRoom(roomCode: string, room: CoopRoomDocument): Promise<void>;
  updateRoom(roomCode: string, partial: Partial<CoopRoomDocument>): Promise<void>;
  subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void;
}

export interface CoopP2PChannelAdapter {
  isOpen(): boolean;
  send(msg: CoopDataChannelMessage): boolean;
  close(): void;
}

export const COOP_ONLINE_CONFIG = {
  ROOM_CODE_LENGTH: 6,
  ROOM_TTL_MS: 15 * 60 * 1000, // 15 minutes
  SNAPSHOT_INTERVAL_MS: 50, // 20 Hz direct P2P WebRTC DataChannel sync (0 Firestore writes!)
  MIN_INPUT_INTERVAL_MS: 45, // Rate limit: max ~22 input packets/sec over DataChannel
  HEARTBEAT_INTERVAL_MS: 2000, // 2s P2P DataChannel ping
  DISCONNECT_WARNING_MS: 15000, // 15s without peer message -> warning
  DISCONNECT_TIMEOUT_MS: 45000, // 45s without peer message -> disconnect timeout
  WEBRTC_CONNECT_TIMEOUT_MS: 12000, // 12s timeout for WebRTC P2P establishment
  STUN_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
} as const;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Sinh mã phòng ngẫu nhiên gồm 6 ký tự chữ in hoa và số (loại bỏ O/0/I/1 dễ nhầm lẫn).
 */
export function generateRoomCode(existingCodes?: Set<string>): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < COOP_ONLINE_CONFIG.ROOM_CODE_LENGTH; i++) {
      const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[idx];
    }
    if (!existingCodes || !existingCodes.has(code)) {
      return code;
    }
  }
  return 'TANK88';
}

/**
 * Chuẩn hóa và kiểm tra định dạng mã phòng 6 ký tự.
 */
export function validateRoomCodeFormat(rawCode: string): { valid: boolean; normalized: string } {
  const normalized = (rawCode || '').trim().toUpperCase();
  const valid = /^[A-Z0-9]{6}$/.test(normalized);
  return { valid, normalized };
}

/**
 * Kiểm tra và chuẩn hóa gói tin điều khiển (Input Packet) từ Guest (P2).
 * Chống dữ liệu sai định dạng hoặc xung đột hướng di chuyển.
 */
export function sanitizeAndValidateInputPacket(
  packet: unknown
): { valid: boolean; sanitized?: SequencedInputPacket; reason?: string } {
  if (!packet || typeof packet !== 'object') {
    return { valid: false, reason: 'Gói tin điều khiển không phải object hợp lệ.' };
  }
  const p = packet as Record<string, unknown>;
  if (
    typeof p.up !== 'boolean' ||
    typeof p.down !== 'boolean' ||
    typeof p.left !== 'boolean' ||
    typeof p.right !== 'boolean' ||
    typeof p.shoot !== 'boolean' ||
    typeof p.seq !== 'number' ||
    !Number.isInteger(p.seq) ||
    p.seq <= 0 ||
    typeof p.clientTimestamp !== 'number' ||
    !Number.isFinite(p.clientTimestamp) ||
    p.clientTimestamp <= 0
  ) {
    return { valid: false, reason: 'Trường dữ liệu trong gói tin điều khiển không hợp lệ.' };
  }

  // Prevent simultaneous opposite directions
  const up = p.up && !p.down;
  const down = p.down && !p.up;
  const left = p.left && !p.right;
  const right = p.right && !p.left;

  return {
    valid: true,
    sanitized: {
      up,
      down,
      left,
      right,
      shoot: p.shoot,
      seq: p.seq,
      clientTimestamp: p.clientTimestamp,
    },
  };
}

/**
 * Tạo bản chụp trạng thái trận đấu (Snapshot) nhỏ gọn từ GameCoreState của Host.
 */
export function buildAuthoritativeSnapshot(
  state: Readonly<GameCoreState>,
  snapshotSeq: number,
  nowMs: number = Date.now()
): CoopAuthoritativeSnapshot {
  const damagedBricks: Record<string, number> = {};
  for (const [k, v] of Object.entries(state.terrain.brickSubTiles)) {
    if (v !== 15) {
      damagedBricks[k] = v;
    }
  }

  return {
    snapshotSeq,
    serverTimestamp: nowMs,
    tickCount: state.tickCount,
    p1: { ...state.p1 },
    p1State: { ...state.p1State },
    p2: state.p2 ? { ...state.p2 } : null,
    p2State: state.p2State ? { ...state.p2State } : null,
    bullets: state.bullets.map((b) => ({ ...b })),
    enemies: state.enemies.map((e) => ({
      ...e,
      path: [], // Omit transient A* path array to minimize network payload
    })),
    enemyQueueLength: state.enemyQueue.length,
    totalDefeatedEnemies: state.totalDefeatedEnemies,
    score: state.score,
    highScore: state.highScore,
    defeatedCounts: { ...state.defeatedCounts },
    currentStageId: state.currentStageId,
    currentStageName: state.currentStageName,
    stageElapsedSeconds: Number(state.stageElapsedSeconds.toFixed(2)),
    brickSubTiles: damagedBricks,
    isBaseDestroyed: state.terrain.isBaseDestroyed,
    isGameOver: state.isGameOver,
    isStageClear: state.isStageClear,
    gameOverReason: state.gameOverReason,
    matchState: state.matchState,
  };
}

/**
 * Kiểm tra điều kiện tham gia phòng Co-op Online (dùng chung cho cả luồng async và kiểm thử đồng bộ).
 */
export function evaluateJoinRoomCandidate(
  room: CoopRoomDocument | null,
  rawRoomCode: string,
  user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
  nowMs: number = Date.now()
): CoopActionResult {
  if (!user || !user.uid) {
    return {
      success: false,
      errorCode: 'UNAUTHENTICATED',
      message: 'Vui lòng đăng nhập Google trước khi tham gia phòng Co-op Online.',
    };
  }

  const { valid, normalized } = validateRoomCodeFormat(rawRoomCode);
  if (!valid) {
    return {
      success: false,
      errorCode: 'INVALID_CODE_FORMAT',
      message: 'Mã phòng không hợp lệ (cần đúng 6 ký tự chữ và số).',
    };
  }

  if (!room) {
    return {
      success: false,
      errorCode: 'ROOM_NOT_FOUND',
      message: `Không tìm thấy phòng với mã "${normalized}". Vui lòng kiểm tra lại.`,
    };
  }

  if (
    room.status === 'EXPIRED' ||
    room.status === 'ABANDONED' ||
    room.status === 'FINISHED' ||
    nowMs >= room.expiresAt
  ) {
    return {
      success: false,
      errorCode: 'ROOM_EXPIRED',
      message: 'Phòng chơi này đã hết hạn hoặc đã kết thúc.',
    };
  }

  if (room.hostUid === user.uid) {
    return {
      success: false,
      errorCode: 'SAME_USER_AS_HOST',
      message: 'Bạn đang là Chủ phòng (P1) của mã phòng này. Cần người chơi thứ 2 sử dụng tài khoản Google khác.',
    };
  }

  if (room.guestUid && room.guestUid !== user.uid) {
    return {
      success: false,
      errorCode: 'ROOM_FULL',
      message: 'Phòng đã đủ 2 người chơi (không cho phép người thứ 3 vào phòng).',
    };
  }

  if (room.status === 'PLAYING' && room.guestUid !== user.uid) {
    return {
      success: false,
      errorCode: 'MATCH_ALREADY_STARTED',
      message: 'Trận đấu trong phòng này đã bắt đầu.',
    };
  }

  return { success: true, room };
}

/**
 * Kiểm tra điều kiện bắt đầu trận đấu Co-op Online (dùng chung cho cả luồng async và kiểm thử đồng bộ).
 */
export function evaluateStartMatchCandidate(
  room: CoopRoomDocument | null,
  callerUid: string,
  role: CoopPlayerRole
): CoopActionResult {
  if (!room) {
    return { success: false, message: 'Không tìm thấy thông tin phòng.' };
  }

  if (room.hostUid !== callerUid || role !== 'HOST') {
    return {
      success: false,
      errorCode: 'NOT_HOST',
      message: 'Chỉ Chủ phòng (P1) mới có quyền bắt đầu trận đấu.',
    };
  }

  if (!room.guestUid || !room.hostReady || !room.guestReady) {
    return {
      success: false,
      errorCode: 'PLAYERS_NOT_READY',
      message: 'Cần đủ 2 người chơi trong phòng và cả 2 đều đã nhấn Sẵn sàng.',
    };
  }

  return { success: true, room };
}

/**
 * Bộ mô phỏng kiểm tra Firestore Rules cho `/coop_rooms/{roomCode}` (khớp 100% logic trong `firestore.rules`).
 * Dùng để kiểm chứng độc lập các nhánh phân quyền Host / Guest Join / Guest Update / Guest Leave / Chặn người thứ 3.
 */
export function evaluateCoopRoomRuleUpdate(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  existing: CoopRoomDocument;
  incoming: CoopRoomDocument;
}): { allowed: boolean; matchedBranch: string | null } {
  const { authUid, isVerifiedPersonalGmail, requestTimeMs, existing, incoming } = params;
  if (!authUid || !isVerifiedPersonalGmail) {
    return { allowed: false, matchedBranch: null };
  }

  // Reject any attempt to inject legacy continuous sync fields into Firestore
  const rawIncoming = incoming as unknown as Record<string, unknown>;
  if ('guestInput' in rawIncoming || 'snapshot' in rawIncoming) {
    return { allowed: false, matchedBranch: null };
  }

  // Immutable core fields check
  if (
    incoming.roomCode !== existing.roomCode ||
    !/^[A-Z0-9]{6}$/.test(incoming.roomCode) ||
    incoming.hostUid !== existing.hostUid ||
    incoming.hostDisplayName !== existing.hostDisplayName ||
    incoming.hostPhotoURL !== existing.hostPhotoURL ||
    incoming.difficulty !== existing.difficulty ||
    incoming.createdAt !== existing.createdAt ||
    incoming.expiresAt !== existing.expiresAt
  ) {
    return { allowed: false, matchedBranch: null };
  }

  // Find changed keys
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if ((existing as any)[k] !== (incoming as any)[k]) {
      affectedKeys.push(k);
    }
  }

  const isNotExpired = existing.status !== 'EXPIRED' && requestTimeMs < existing.expiresAt;

  // Branch 1: Host Update
  const hostAllowedKeys = new Set([
    'status',
    'hostReady',
    'hostLastActiveAt',
    'rtcOffer',
    'hostIceCandidates',
    'rtcConnectionState',
    'finalScore',
    'matchOutcome',
    'disconnectReason',
  ]);
  if (
    authUid === existing.hostUid &&
    (isNotExpired || ['ABANDONED', 'EXPIRED', 'FINISHED'].includes(incoming.status)) &&
    incoming.guestUid === existing.guestUid &&
    incoming.guestDisplayName === existing.guestDisplayName &&
    incoming.guestPhotoURL === existing.guestPhotoURL &&
    (incoming.status !== 'PLAYING' ||
      existing.status === 'PLAYING' ||
      (existing.status === 'WAITING' &&
        existing.guestUid !== null &&
        existing.hostReady === true &&
        existing.guestReady === true)) &&
    affectedKeys.every((k) => hostAllowedKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'HOST_UPDATE' };
  }

  // Branch 2: Guest Join
  const guestJoinAllowedKeys = new Set([
    'guestUid',
    'guestDisplayName',
    'guestPhotoURL',
    'guestReady',
    'guestLastActiveAt',
    'rtcAnswer',
    'guestIceCandidates',
    'rtcConnectionState',
    'disconnectReason',
  ]);
  if (
    isNotExpired &&
    existing.status === 'WAITING' &&
    existing.guestUid === null &&
    authUid !== existing.hostUid &&
    incoming.guestUid === authUid &&
    incoming.status === 'WAITING' &&
    incoming.guestReady === false &&
    affectedKeys.every((k) => guestJoinAllowedKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'GUEST_JOIN' };
  }

  // Branch 3: Guest Signaling or Ready Update
  const guestUpdateAllowedKeys = new Set([
    'guestReady',
    'guestLastActiveAt',
    'rtcAnswer',
    'guestIceCandidates',
    'rtcConnectionState',
  ]);
  if (
    isNotExpired &&
    (existing.status === 'WAITING' || existing.status === 'PLAYING') &&
    existing.guestUid !== null &&
    authUid === existing.guestUid &&
    incoming.guestUid === existing.guestUid &&
    incoming.guestDisplayName === existing.guestDisplayName &&
    incoming.guestPhotoURL === existing.guestPhotoURL &&
    incoming.status === existing.status &&
    affectedKeys.every((k) => guestUpdateAllowedKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'GUEST_SIGNALING_OR_READY' };
  }

  // Branch 4: Guest Leave
  const guestLeaveWaitingKeys = new Set([
    'guestUid',
    'guestDisplayName',
    'guestPhotoURL',
    'guestReady',
    'guestLastActiveAt',
    'rtcAnswer',
    'guestIceCandidates',
    'rtcConnectionState',
    'disconnectReason',
  ]);
  const guestLeavePlayingKeys = new Set([
    'status',
    'guestLastActiveAt',
    'rtcConnectionState',
    'disconnectReason',
  ]);
  if (existing.guestUid !== null && authUid === existing.guestUid) {
    if (
      existing.status === 'WAITING' &&
      incoming.status === 'WAITING' &&
      incoming.guestUid === null &&
      incoming.guestDisplayName === null &&
      incoming.guestPhotoURL === null &&
      incoming.guestReady === false &&
      incoming.guestLastActiveAt === null &&
      incoming.rtcAnswer === null &&
      incoming.guestIceCandidates === null &&
      affectedKeys.every((k) => guestLeaveWaitingKeys.has(k))
    ) {
      return { allowed: true, matchedBranch: 'GUEST_LEAVE_WAITING' };
    }
    if (
      existing.status === 'PLAYING' &&
      incoming.status === 'ABANDONED' &&
      incoming.guestUid === existing.guestUid &&
      affectedKeys.every((k) => guestLeavePlayingKeys.has(k))
    ) {
      return { allowed: true, matchedBranch: 'GUEST_LEAVE_PLAYING' };
    }
  }

  return { allowed: false, matchedBranch: null };
}

/**
 * In-memory storage adapter dùng cho kiểm thử tự động (M7.3 Test Harness)
 * có đếm số lượt đọc/ghi Firestore để xác minh không spam Firestore trong trận.
 */
export class InMemoryCoopStorageAdapter implements CoopStorageAdapter {
  private rooms: Map<string, CoopRoomDocument> = new Map();
  private listeners: Map<string, Set<(room: CoopRoomDocument | null) => void>> = new Map();
  private writeCount: number = 0;
  private readCount: number = 0;

  public getWriteCount(): number {
    return this.writeCount;
  }

  public getReadCount(): number {
    return this.readCount;
  }

  public resetCounters(): void {
    this.writeCount = 0;
    this.readCount = 0;
  }

  public getRoomSync(roomCode: string): CoopRoomDocument | null {
    this.readCount++;
    const r = this.rooms.get(roomCode);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  public setRoomSync(roomCode: string, room: CoopRoomDocument): void {
    this.writeCount++;
    const copy = JSON.parse(JSON.stringify(room));
    this.rooms.set(roomCode, copy);
    this.notify(roomCode);
  }

  public updateRoomSync(roomCode: string, partial: Partial<CoopRoomDocument>): void {
    this.writeCount++;
    const existing = this.rooms.get(roomCode);
    if (!existing) {
      throw new Error(`Room ${roomCode} does not exist`);
    }
    const updated: CoopRoomDocument = {
      ...existing,
      ...JSON.parse(JSON.stringify(partial)),
    };
    this.rooms.set(roomCode, updated);
    this.notify(roomCode);
  }

  public async getRoom(roomCode: string): Promise<CoopRoomDocument | null> {
    return this.getRoomSync(roomCode);
  }

  public async setRoom(roomCode: string, room: CoopRoomDocument): Promise<void> {
    this.setRoomSync(roomCode, room);
  }

  public async updateRoom(roomCode: string, partial: Partial<CoopRoomDocument>): Promise<void> {
    this.updateRoomSync(roomCode, partial);
  }

  public subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomDocument | null) => void
  ): () => void {
    if (!this.listeners.has(roomCode)) {
      this.listeners.set(roomCode, new Set());
    }
    const set = this.listeners.get(roomCode)!;
    set.add(onUpdate);
    const current = this.rooms.get(roomCode);
    onUpdate(current ? JSON.parse(JSON.stringify(current)) : null);
    return () => {
      set.delete(onUpdate);
    };
  }

  private notify(roomCode: string): void {
    const set = this.listeners.get(roomCode);
    if (!set) return;
    const current = this.rooms.get(roomCode);
    const snapshot = current ? JSON.parse(JSON.stringify(current)) : null;
    set.forEach((cb) => cb(snapshot));
  }

  public clear(): void {
    this.rooms.clear();
    this.listeners.clear();
    this.writeCount = 0;
    this.readCount = 0;
  }
}

/**
 * Kênh truyền P2P trực tiếp trong bộ nhớ (mô phỏng WebRTC RTCDataChannel giữa Host và Guest)
 * phục vụ kiểm thử tự động trong môi trường Node/CLI.
 */
export function createInMemoryP2PChannelPair(
  onHostReceive: (msg: CoopDataChannelMessage) => void,
  onGuestReceive: (msg: CoopDataChannelMessage) => void
): { hostChannel: CoopP2PChannelAdapter; guestChannel: CoopP2PChannelAdapter } {
  let open = true;
  const hostChannel: CoopP2PChannelAdapter = {
    isOpen: () => open,
    send: (msg) => {
      if (!open) return false;
      onGuestReceive(JSON.parse(JSON.stringify(msg)));
      return true;
    },
    close: () => {
      open = false;
    },
  };
  const guestChannel: CoopP2PChannelAdapter = {
    isOpen: () => open,
    send: (msg) => {
      if (!open) return false;
      onHostReceive(JSON.parse(JSON.stringify(msg)));
      return true;
    },
    close: () => {
      open = false;
    },
  };
  return { hostChannel, guestChannel };
}

/**
 * Firestore storage adapter kết nối trực tiếp tới collection `coop_rooms/{roomCode}`.
 */
export class FirestoreCoopStorageAdapter implements CoopStorageAdapter {
  private db = getFirebaseDb();

  public async getRoom(roomCode: string): Promise<CoopRoomDocument | null> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as CoopRoomDocument;
  }

  public async setRoom(roomCode: string, room: CoopRoomDocument): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    await setDoc(ref, room);
  }

  public async updateRoom(roomCode: string, partial: Partial<CoopRoomDocument>): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    await updateDoc(ref, partial as Record<string, any>);
  }

  public subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
        } else {
          onUpdate(snap.data() as CoopRoomDocument);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
    return unsub;
  }
}

export class CoopOnlineManager {
  private static instance: CoopOnlineManager | null = null;

  private adapter: CoopStorageAdapter;
  private currentRoom: CoopRoomDocument | null = null;
  private role: CoopPlayerRole = null;
  private unsubRoom: (() => void) | null = null;
  private listeners: Set<(room: CoopRoomDocument | null, role: CoopPlayerRole) => void> = new Set();

  // WebRTC PeerConnection & DataChannel state
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private customP2PChannel: CoopP2PChannelAdapter | null = null;
  private rtcState: CoopRtcConnectionState = 'NEW';
  private webrtcErrorMessage: string | null = null;
  private webrtcConnectTimer: ReturnType<typeof setTimeout> | null = null;
  private hasSentOfferForGuestUid: string | null = null;
  private hasAppliedRemoteAnswer: boolean = false;
  private hasSentAnswerForOffer: string | null = null;
  private addedRemoteCandidateSignatures: Set<string> = new Set();
  private lastPeerP2PActiveAt: number = 0;
  private lastPingSentAt: number = 0;

  // Sequencing & Rate-Limiting state (transmitted over WebRTC DataChannel)
  private guestOutgoingSeq: number = 0;
  private lastGuestInputSentAt: number = 0;
  private lastSentInputSignature: string = '';
  private hostLastProcessedGuestSeq: number = 0;
  private latestValidatedGuestInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };

  // Host Snapshot Throttling state (transmitted over WebRTC DataChannel)
  private hostSnapshotAccumulatorMs: number = 0;
  private hostOutgoingSnapshotSeq: number = 0;
  private lastBroadcastMatchState: string = '';
  private lastBroadcastStageId: number = -1;
  private hasRecordedMatchFinishInFirestore: boolean = false;

  // Guest Snapshot Application state
  private guestLastAppliedSnapshotSeq: number = 0;
  private snapshotListeners: Set<(snapshot: CoopAuthoritativeSnapshot) => void> = new Set();

  public constructor(customAdapter?: CoopStorageAdapter) {
    this.adapter = customAdapter ?? new FirestoreCoopStorageAdapter();
  }

  public static getInstance(): CoopOnlineManager {
    if (!CoopOnlineManager.instance) {
      CoopOnlineManager.instance = new CoopOnlineManager();
    }
    return CoopOnlineManager.instance;
  }

  public setStorageAdapter(adapter: CoopStorageAdapter): void {
    this.cleanupSubscription();
    this.closeWebRTC();
    this.adapter = adapter;
  }

  /**
   * Gắn kênh P2P trực tiếp tùy chỉnh (dùng cho kiểm thử tự động DataChannel).
   */
  public attachCustomP2PChannel(channel: CoopP2PChannelAdapter | null, nowMs: number = Date.now()): void {
    this.customP2PChannel = channel;
    if (channel && channel.isOpen()) {
      this.rtcState = 'CONNECTED';
      this.webrtcErrorMessage = null;
      this.lastPeerP2PActiveAt = nowMs;
      if (this.currentRoom) {
        this.currentRoom = { ...this.currentRoom, rtcConnectionState: 'CONNECTED' };
      }
      this.notifyListeners();
    }
  }

  public getCurrentRoom(): CoopRoomDocument | null {
    return this.currentRoom ? { ...this.currentRoom } : null;
  }

  public getRole(): CoopPlayerRole {
    return this.role;
  }

  public getLocalRole(): CoopPlayerRole {
    return this.role;
  }

  public getRtcConnectionState(): CoopRtcConnectionState {
    return this.rtcState;
  }

  public getWebrtcErrorMessage(): string | null {
    return this.webrtcErrorMessage;
  }

  public isP2PDataChannelOpen(): boolean {
    if (this.customP2PChannel) {
      return this.customP2PChannel.isOpen();
    }
    return Boolean(this.dataChannel && this.dataChannel.readyState === 'open');
  }

  public getHostLastProcessedGuestSeq(): number {
    return this.hostLastProcessedGuestSeq;
  }

  public getLatestValidatedGuestInput(): InputState {
    return { ...this.latestValidatedGuestInput };
  }

  public subscribe(
    listener: (room: CoopRoomDocument | null, role: CoopPlayerRole) => void
  ): () => void {
    this.listeners.add(listener);
    listener(this.getCurrentRoom(), this.role);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeSnapshots(
    listener: (snapshot: CoopAuthoritativeSnapshot) => void
  ): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const roomCopy = this.getCurrentRoom();
    this.listeners.forEach((fn) => {
      try {
        fn(roomCopy, this.role);
      } catch (e) {
        console.error('[CoopOnlineManager] listener error:', e);
      }
    });
  }

  /**
   * Tạo phòng Co-op Online mới với vai trò Chủ phòng (Host = P1).
   * Chỉ thực hiện 1 lần ghi Firestore (`setRoom`).
   */
  public async createRoom(
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
    difficulty: 'DEFAULT' | 'EXTREME',
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    if (!user || !user.uid) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Vui lòng đăng nhập Google trước khi tạo phòng Co-op Online.',
      };
    }

    this.cleanupSubscription();
    this.closeWebRTC();

    let roomCode = generateRoomCode();
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await this.adapter.getRoom(roomCode);
        if (!existing || existing.status === 'EXPIRED' || existing.status === 'ABANDONED' || nowMs >= existing.expiresAt) {
          break;
        }
        roomCode = generateRoomCode();
      }

      const newRoom: CoopRoomDocument = {
        roomCode,
        status: 'WAITING',
        difficulty,
        hostUid: user.uid,
        hostDisplayName: getUserDisplayLabel(user),
        hostPhotoURL: user.photoURL || '',
        hostReady: false,
        hostLastActiveAt: nowMs,
        guestUid: null,
        guestDisplayName: null,
        guestPhotoURL: null,
        guestReady: false,
        guestLastActiveAt: null,
        rtcOffer: null,
        rtcAnswer: null,
        hostIceCandidates: null,
        guestIceCandidates: null,
        rtcConnectionState: 'NEW',
        finalScore: 0,
        matchOutcome: null,
        createdAt: nowMs,
        expiresAt: nowMs + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
        disconnectReason: null,
      };

      await this.adapter.setRoom(roomCode, newRoom);
      this.currentRoom = newRoom;
      this.role = 'HOST';
      this.resetSyncCounters();
      this.listenToRoom(roomCode);
      this.notifyListeners();

      return {
        success: true,
        room: newRoom,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể tạo phòng Co-op Online do lỗi kết nối.',
      };
    }
  }

  /**
   * Tham gia phòng Co-op Online bằng mã phòng 6 ký tự với vai trò Khách (Guest = P2).
   * Chỉ thực hiện 1 lần đọc + 1 lần cập nhật Firestore (`updateRoom`).
   */
  public async joinRoom(
    rawRoomCode: string,
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    if (!user || !user.uid) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Vui lòng đăng nhập Google trước khi tham gia phòng Co-op Online.',
      };
    }

    const { valid, normalized } = validateRoomCodeFormat(rawRoomCode);
    if (!valid) {
      return {
        success: false,
        errorCode: 'INVALID_CODE_FORMAT',
        message: 'Mã phòng không hợp lệ (cần đúng 6 ký tự chữ và số).',
      };
    }

    try {
      const room = await this.adapter.getRoom(normalized);
      const joinCandidate = evaluateJoinRoomCandidate(room, normalized, user, nowMs);
      if (!joinCandidate.success || !room) {
        return joinCandidate;
      }

      this.cleanupSubscription();
      this.closeWebRTC();

      const updatedFields: Partial<CoopRoomDocument> = {
        guestUid: user.uid,
        guestDisplayName: getUserDisplayLabel(user),
        guestPhotoURL: user.photoURL || '',
        guestReady: false,
        guestLastActiveAt: nowMs,
        rtcAnswer: null,
        guestIceCandidates: null,
        rtcConnectionState: 'CONNECTING',
        disconnectReason: null,
      };

      await this.adapter.updateRoom(normalized, updatedFields);
      const updatedRoom: CoopRoomDocument = {
        ...room,
        ...updatedFields,
      };

      this.currentRoom = updatedRoom;
      this.role = 'GUEST';
      this.rtcState = 'CONNECTING';
      this.lastPeerP2PActiveAt = nowMs;
      this.resetSyncCounters();
      this.listenToRoom(normalized);
      this.notifyListeners();

      return {
        success: true,
        room: updatedRoom,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể tham gia phòng do lỗi kết nối.',
      };
    }
  }

  /**
   * Đặt trạng thái Sẵn sàng (Ready) cho P1 (Host) hoặc P2 (Guest).
   */
  public async setPlayerReady(ready: boolean, nowMs: number = Date.now()): Promise<CoopActionResult> {
    if (!this.currentRoom || !this.role) {
      return { success: false, message: 'Chưa ở trong phòng Co-op Online.' };
    }

    const code = this.currentRoom.roomCode;
    const partial: Partial<CoopRoomDocument> =
      this.role === 'HOST'
        ? { hostReady: ready, hostLastActiveAt: nowMs }
        : { guestReady: ready, guestLastActiveAt: nowMs };

    try {
      await this.adapter.updateRoom(code, partial);
      this.currentRoom = { ...this.currentRoom, ...partial };
      this.notifyListeners();
      return { success: true, room: this.currentRoom };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Lỗi cập nhật trạng thái Sẵn sàng.',
      };
    }
  }

  /**
   * Chủ phòng (Host) bắt đầu trận đấu khi cả 2 người chơi đã kết nối và xác nhận Sẵn sàng.
   * Chỉ cập nhật trạng thái `status: 'PLAYING'` lên Firestore 1 lần duy nhất;
   * Bản chụp trạng thái đầu tiên được gửi qua WebRTC DataChannel.
   */
  public async startOnlineMatch(
    callerUid: string,
    initialGameState?: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    const check = evaluateStartMatchCandidate(this.currentRoom, callerUid, this.role);
    if (!check.success || !this.currentRoom) {
      return check;
    }

    if (this.rtcState === 'FAILED') {
      return {
        success: false,
        errorCode: 'WEBRTC_NOT_CONNECTED',
        message:
          this.webrtcErrorMessage ||
          'Kết nối P2P trực tiếp (WebRTC) chưa sẵn sàng. Vui lòng nhấn "Thử kết nối lại P2P".',
      };
    }

    this.resetSyncCounters();
    this.lastPeerP2PActiveAt = nowMs;

    const partial: Partial<CoopRoomDocument> = {
      status: 'PLAYING',
      hostLastActiveAt: nowMs,
      disconnectReason: null,
    };

    try {
      await this.adapter.updateRoom(this.currentRoom.roomCode, partial);
      this.currentRoom = { ...this.currentRoom, ...partial };

      // Send initial snapshot over P2P DataChannel if open (ZERO Firestore snapshot payload!)
      if (initialGameState && this.isP2PDataChannelOpen()) {
        this.hostOutgoingSnapshotSeq = 1;
        const initialSnapshot = buildAuthoritativeSnapshot(initialGameState, 1, nowMs);
        this.sendOverDataChannel({ type: 'HOST_SNAPSHOT', snapshot: initialSnapshot });
      }

      this.notifyListeners();
      return { success: true, room: this.currentRoom };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể bắt đầu trận đấu do lỗi mạng.',
      };
    }
  }

  /**
   * Guest (P2) gửi gói tin điều khiển có đánh số thứ tự `seq` và `clientTimestamp`
   * trực tiếp qua WebRTC DataChannel (TUYỆT ĐỐI KHÔNG GHI VÀO FIRESTORE!).
   */
  public async submitGuestInput(
    input: InputState,
    nowMs: number = Date.now(),
    forceSend: boolean = false
  ): Promise<CoopActionResult> {
    if (!this.currentRoom || this.role !== 'GUEST') {
      return { success: false, message: 'Chỉ người chơi 2 (Guest) mới gửi gói điều khiển P2.' };
    }

    const sig = `${input.up ? 1 : 0}${input.down ? 1 : 0}${input.left ? 1 : 0}${input.right ? 1 : 0}${input.shoot ? 1 : 0}`;
    const elapsedSinceLast = nowMs - this.lastGuestInputSentAt;

    if (!forceSend && sig === this.lastSentInputSignature && elapsedSinceLast < COOP_ONLINE_CONFIG.HEARTBEAT_INTERVAL_MS) {
      return { success: true };
    }

    // Rate limiting check (45ms minimum interval)
    if (this.lastGuestInputSentAt > 0 && elapsedSinceLast < COOP_ONLINE_CONFIG.MIN_INPUT_INTERVAL_MS) {
      return {
        success: false,
        errorCode: 'RATE_LIMITED',
        message: 'Tốc độ gửi thao tác vượt quá giới hạn cho phép.',
      };
    }

    const nextSeq = this.guestOutgoingSeq + 1;
    const rawPacket: SequencedInputPacket = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      shoot: Boolean(input.shoot),
      seq: nextSeq,
      clientTimestamp: nowMs,
    };

    const validation = sanitizeAndValidateInputPacket(rawPacket);
    if (!validation.valid || !validation.sanitized) {
      return {
        success: false,
        errorCode: 'INVALID_PACKET',
        message: validation.reason || 'Gói tin điều khiển không hợp lệ.',
      };
    }

    if (!this.isP2PDataChannelOpen()) {
      return {
        success: false,
        errorCode: 'WEBRTC_NOT_CONNECTED',
        message: 'Kênh truyền P2P trực tiếp (WebRTC DataChannel) chưa mở. Không gửi lên Firestore để bảo vệ hạn mức.',
      };
    }

    this.guestOutgoingSeq = nextSeq;
    this.lastGuestInputSentAt = nowMs;
    this.lastSentInputSignature = sig;

    const sent = this.sendOverDataChannel({
      type: 'GUEST_INPUT',
      packet: validation.sanitized,
    });

    if (!sent) {
      return {
        success: false,
        errorCode: 'WEBRTC_NOT_CONNECTED',
        message: 'Không thể gửi gói điều khiển qua WebRTC DataChannel.',
      };
    }

    return { success: true };
  }

  /**
   * Host (P1) kiểm tra và áp dụng gói tin điều khiển từ Guest (P2) nhận qua DataChannel.
   * Bỏ qua gói tin trùng lặp hoặc sai thứ tự (`seq <= hostLastProcessedGuestSeq`).
   */
  public processIncomingGuestInput(
    rawPacket: unknown,
    nowMs: number = Date.now()
  ): { accepted: boolean; input?: InputState; errorCode?: CoopActionResult['errorCode'] } {
    const validation = sanitizeAndValidateInputPacket(rawPacket);
    if (!validation.valid || !validation.sanitized) {
      return { accepted: false, errorCode: 'INVALID_PACKET' };
    }

    const packet = validation.sanitized;
    if (packet.seq <= this.hostLastProcessedGuestSeq) {
      return { accepted: false, errorCode: 'OUT_OF_ORDER_SEQ' };
    }

    this.hostLastProcessedGuestSeq = packet.seq;
    this.lastPeerP2PActiveAt = nowMs;
    this.latestValidatedGuestInput = {
      up: packet.up,
      down: packet.down,
      left: packet.left,
      right: packet.right,
      shoot: packet.shoot,
    };

    return {
      accepted: true,
      input: { ...this.latestValidatedGuestInput },
    };
  }

  /**
   * Được gọi mỗi frame trên máy Chủ phòng (Host) để phát bản chụp trạng thái qua WebRTC DataChannel.
   * TUYỆT ĐỐI KHÔNG GHI SNAPSHOT VÀO FIRESTORE!
   * Chỉ khi trận đấu kết thúc (`state.isGameOver`), Host mới ghi 1 lần kết quả cuối trận lên Firestore.
   */
  public async onHostSimulationFrame(
    deltaMs: number,
    state: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): Promise<boolean> {
    if (!this.currentRoom || this.role !== 'HOST' || this.currentRoom.status !== 'PLAYING') {
      return false;
    }

    this.hostSnapshotAccumulatorMs += deltaMs;

    const isCriticalTransition =
      state.matchState !== this.lastBroadcastMatchState ||
      state.currentStageId !== this.lastBroadcastStageId ||
      state.isGameOver ||
      state.isStageClear;

    if (
      !isCriticalTransition &&
      this.hostSnapshotAccumulatorMs < COOP_ONLINE_CONFIG.SNAPSHOT_INTERVAL_MS
    ) {
      return false;
    }

    this.hostSnapshotAccumulatorMs = 0;
    this.lastBroadcastMatchState = state.matchState;
    this.lastBroadcastStageId = state.currentStageId;
    this.hostOutgoingSnapshotSeq += 1;

    const snapshot = buildAuthoritativeSnapshot(state, this.hostOutgoingSnapshotSeq, nowMs);
    const sentOverP2P = this.sendOverDataChannel({
      type: 'HOST_SNAPSHOT',
      snapshot,
    });

    // Chỉ ghi Firestore ĐÚNG 1 LẦN khi trận đấu kết thúc (Game Over)
    if (state.isGameOver && !this.hasRecordedMatchFinishInFirestore) {
      this.hasRecordedMatchFinishInFirestore = true;
      try {
        await this.adapter.updateRoom(this.currentRoom.roomCode, {
          status: 'FINISHED',
          finalScore: state.score,
          matchOutcome: 'GAME_OVER',
          hostLastActiveAt: nowMs,
        });
        this.currentRoom = {
          ...this.currentRoom,
          status: 'FINISHED',
          finalScore: state.score,
          matchOutcome: 'GAME_OVER',
          hostLastActiveAt: nowMs,
        };
        this.notifyListeners();
      } catch {
        // Ignore transient network failure on final summary write
      }
    }

    return sentOverP2P;
  }

  /**
   * Nhận thông điệp trực tiếp từ WebRTC DataChannel (hoặc InMemoryP2PChannel).
   */
  public handleIncomingDataChannelMessage(
    msg: CoopDataChannelMessage,
    nowMs: number = Date.now()
  ): void {
    if (!msg || typeof msg !== 'object') return;
    this.lastPeerP2PActiveAt = nowMs;

    if (msg.type === 'GUEST_INPUT' && this.role === 'HOST') {
      this.processIncomingGuestInput(msg.packet, nowMs);
    } else if (msg.type === 'HOST_SNAPSHOT' && this.role === 'GUEST') {
      const snap = msg.snapshot;
      if (snap && typeof snap.snapshotSeq === 'number' && snap.snapshotSeq > this.guestLastAppliedSnapshotSeq) {
        this.guestLastAppliedSnapshotSeq = snap.snapshotSeq;
        this.snapshotListeners.forEach((cb) => {
          try {
            cb(snap);
          } catch (e) {
            console.error('[CoopOnlineManager] snapshot listener error:', e);
          }
        });
      }
    }
  }

  private sendOverDataChannel(msg: CoopDataChannelMessage): boolean {
    if (this.customP2PChannel) {
      return this.customP2PChannel.send(msg);
    }
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify(msg));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Khởi tạo hoặc thử kết nối lại WebRTC P2P (Signaling qua Firestore 1 lần).
   */
  public async retryWebRTCConnection(nowMs: number = Date.now()): Promise<CoopActionResult> {
    if (!this.currentRoom || !this.role) {
      return { success: false, message: 'Chưa ở trong phòng Co-op Online.' };
    }
    this.closeWebRTC();
    this.webrtcErrorMessage = null;
    this.rtcState = 'CONNECTING';
    this.lastPeerP2PActiveAt = nowMs;

    try {
      if (this.role === 'HOST') {
        await this.adapter.updateRoom(this.currentRoom.roomCode, {
          rtcOffer: null,
          hostIceCandidates: null,
          rtcConnectionState: 'CONNECTING',
          hostLastActiveAt: nowMs,
        });
        if (this.currentRoom.guestUid) {
          await this.startHostWebRTCOffer(this.currentRoom.roomCode, this.currentRoom.guestUid);
        }
      } else if (this.role === 'GUEST') {
        await this.adapter.updateRoom(this.currentRoom.roomCode, {
          rtcAnswer: null,
          guestIceCandidates: null,
          rtcConnectionState: 'CONNECTING',
          guestLastActiveAt: nowMs,
        });
        if (this.currentRoom.rtcOffer) {
          await this.startGuestWebRTCAnswer(
            this.currentRoom.roomCode,
            this.currentRoom.rtcOffer,
            this.currentRoom.hostIceCandidates
          );
        }
      }
      this.notifyListeners();
      return { success: true, room: this.currentRoom };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể khởi tạo lại kết nối P2P.',
      };
    }
  }

  /**
   * Đánh dấu lỗi kết nối WebRTC P2P một cách tường minh (không spam Firestore).
   */
  public markWebRTCConnectionFailed(reason?: string): void {
    this.rtcState = 'FAILED';
    this.webrtcErrorMessage =
      reason ||
      'Kết nối P2P trực tiếp (WebRTC DataChannel) thất bại. Vui lòng nhấn "Thử kết nối lại P2P" hoặc thoát phòng an toàn.';
    if (this.currentRoom) {
      this.currentRoom = {
        ...this.currentRoom,
        rtcConnectionState: 'FAILED',
      };
    }
    this.notifyListeners();
  }

  /**
   * Kiểm tra tình trạng mất kết nối của đối phương dựa trên tín hiệu P2P DataChannel và trạng thái phòng.
   */
  public evaluatePeerConnectionStatus(nowMs: number = Date.now()): {
    peerConnected: boolean;
    warningMessage: string | null;
    isTimedOut: boolean;
  } {
    if (!this.currentRoom || !this.role) {
      return { peerConnected: false, warningMessage: null, isTimedOut: false };
    }

    if (this.currentRoom.status === 'ABANDONED') {
      return {
        peerConnected: false,
        warningMessage:
          this.currentRoom.disconnectReason ||
          'Người chơi cùng phòng đã rời trận đấu.',
        isTimedOut: true,
      };
    }

    if (this.rtcState === 'FAILED' || this.currentRoom.rtcConnectionState === 'FAILED') {
      return {
        peerConnected: false,
        warningMessage:
          this.webrtcErrorMessage ||
          'Kết nối P2P trực tiếp (WebRTC) bị gián đoạn. Vui lòng thử kết nối lại hoặc thoát phòng an toàn.',
        isTimedOut: true,
      };
    }

    const fallbackFirestoreActive =
      this.role === 'HOST'
        ? this.currentRoom.guestLastActiveAt
        : this.currentRoom.hostLastActiveAt;

    const effectiveLastActive = Math.max(
      this.lastPeerP2PActiveAt || 0,
      fallbackFirestoreActive || 0
    );

    if (!effectiveLastActive) {
      return { peerConnected: false, warningMessage: null, isTimedOut: false };
    }

    // Periodically send P2P ping over DataChannel if open
    if (
      this.isP2PDataChannelOpen() &&
      nowMs - this.lastPingSentAt >= COOP_ONLINE_CONFIG.HEARTBEAT_INTERVAL_MS
    ) {
      this.lastPingSentAt = nowMs;
      this.sendOverDataChannel({ type: 'PING', timestamp: nowMs });
    }

    const silenceMs = Math.max(0, nowMs - effectiveLastActive);
    if (silenceMs >= COOP_ONLINE_CONFIG.DISCONNECT_TIMEOUT_MS) {
      const msg =
        this.role === 'HOST'
          ? 'Người chơi 2 (P2) đã mất kết nối quá thời gian chờ.'
          : 'Chủ phòng (P1) đã mất kết nối. Trận đấu kết thúc an toàn.';
      return { peerConnected: false, warningMessage: msg, isTimedOut: true };
    }

    if (silenceMs >= COOP_ONLINE_CONFIG.DISCONNECT_WARNING_MS) {
      const msg =
        this.role === 'HOST'
          ? 'Tín hiệu P2P từ Người chơi 2 (P2) đang yếu, đang chờ phản hồi...'
          : 'Đang chờ phản hồi đồng bộ P2P từ Chủ phòng (P1)...';
      return { peerConnected: true, warningMessage: msg, isTimedOut: false };
    }

    return { peerConnected: true, warningMessage: null, isTimedOut: false };
  }

  /**
   * Rời khỏi phòng chơi hiện tại một cách an toàn.
   * - Nếu Chủ phòng (Host) rời: đóng phòng (`ABANDONED`) và thông báo cho P2 (không tự chuyển quyền Host).
   * - Nếu Khách (Guest) rời khi đang WAITING: giải phóng slot P2 để người khác có thể vào.
   * - Nếu Khách (Guest) rời khi đang PLAYING: đánh dấu `ABANDONED` kèm lý do để P1 biết.
   */
  public async leaveRoom(reason?: string, nowMs: number = Date.now()): Promise<void> {
    const room = this.currentRoom;
    const currentRole = this.role;
    this.cleanupSubscription();
    this.closeWebRTC();
    this.currentRoom = null;
    this.role = null;
    this.resetSyncCounters();
    this.notifyListeners();

    if (!room || !currentRole) return;

    try {
      if (currentRole === 'HOST') {
        await this.adapter.updateRoom(room.roomCode, {
          status: 'ABANDONED',
          rtcConnectionState: 'DISCONNECTED',
          hostLastActiveAt: nowMs,
          disconnectReason:
            reason || 'Chủ phòng (P1) đã rời phòng. Trận đấu kết thúc an toàn.',
        });
      } else if (currentRole === 'GUEST') {
        if (room.status === 'WAITING') {
          await this.adapter.updateRoom(room.roomCode, {
            guestUid: null,
            guestDisplayName: null,
            guestPhotoURL: null,
            guestReady: false,
            guestLastActiveAt: null,
            rtcAnswer: null,
            guestIceCandidates: null,
            rtcConnectionState: 'NEW',
            disconnectReason: 'Người chơi 2 đã rời phòng chờ.',
          });
        } else {
          await this.adapter.updateRoom(room.roomCode, {
            status: 'ABANDONED',
            guestLastActiveAt: nowMs,
            rtcConnectionState: 'DISCONNECTED',
            disconnectReason:
              reason || 'Người chơi 2 (P2) đã rời trận đấu.',
          });
        }
      }
    } catch {
      // Ignore network errors during leave cleanup
    }
  }

  private listenToRoom(roomCode: string): void {
    this.unsubRoom = this.adapter.subscribeRoom(roomCode, (updatedRoom) => {
      this.currentRoom = updatedRoom;

      if (updatedRoom) {
        this.coordinateWebRTCSignaling(updatedRoom);
      }

      this.notifyListeners();
    });
  }

  /**
   * Điều phối trao đổi SDP Offer / Answer và ICE Candidates qua Firestore (chỉ chạy trong trình duyệt có RTCPeerConnection).
   */
  private coordinateWebRTCSignaling(room: CoopRoomDocument): void {
    if (this.customP2PChannel) {
      return; // Đang dùng kênh P2P trực tiếp trong bộ nhớ (Test Harness)
    }
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    if (this.role === 'HOST') {
      // Khi Guest rời phòng chờ -> đóng kết nối WebRTC cũ
      if (!room.guestUid && this.peerConnection) {
        this.closeWebRTC();
        return;
      }

      // Khi có Guest mới tham gia -> Host tạo Offer 1 lần
      if (room.guestUid && this.hasSentOfferForGuestUid !== room.guestUid) {
        this.hasSentOfferForGuestUid = room.guestUid;
        void this.startHostWebRTCOffer(room.roomCode, room.guestUid);
      }

      // Khi Guest gửi Answer -> Host áp dụng Answer + ICE của Guest
      if (this.peerConnection && room.rtcAnswer && !this.hasAppliedRemoteAnswer) {
        this.hasAppliedRemoteAnswer = true;
        void this.applyGuestAnswerAndIce(room.rtcAnswer, room.guestIceCandidates);
      } else if (this.peerConnection && this.hasAppliedRemoteAnswer && room.guestIceCandidates) {
        void this.addRemoteIceCandidatesJson(room.guestIceCandidates);
      }
    } else if (this.role === 'GUEST') {
      // Khi Host đã đăng Offer -> Guest tạo Answer 1 lần
      if (room.rtcOffer && this.hasSentAnswerForOffer !== room.rtcOffer) {
        this.hasSentAnswerForOffer = room.rtcOffer;
        void this.startGuestWebRTCAnswer(room.roomCode, room.rtcOffer, room.hostIceCandidates);
      } else if (this.peerConnection && room.hostIceCandidates) {
        void this.addRemoteIceCandidatesJson(room.hostIceCandidates);
      }
    }
  }

  private async startHostWebRTCOffer(roomCode: string, guestUid: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.closeWebRTC();
    this.hasSentOfferForGuestUid = guestUid;
    this.rtcState = 'CONNECTING';

    const pc = new RTCPeerConnection({ iceServers: [...COOP_ONLINE_CONFIG.STUN_SERVERS] });
    this.peerConnection = pc;

    const candidates: RTCIceCandidateInit[] = [];
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        candidates.push(ev.candidate.toJSON());
      }
    };

    this.setupPeerConnectionLifecycle(pc, roomCode);

    const dc = pc.createDataChannel('bantank_coop_dc', { ordered: false, maxRetransmits: 0 });
    this.setupDataChannel(dc, roomCode);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGatheringShort(pc, 500);

      await this.adapter.updateRoom(roomCode, {
        rtcOffer: JSON.stringify(pc.localDescription || offer),
        hostIceCandidates: JSON.stringify(candidates),
        rtcConnectionState: 'CONNECTING',
        hostLastActiveAt: Date.now(),
      });
    } catch {
      this.markWebRTCConnectionFailed('Không thể khởi tạo WebRTC Offer trên máy Chủ phòng.');
    }
  }

  private async startGuestWebRTCAnswer(
    roomCode: string,
    rtcOfferJson: string,
    hostIceJson: string | null
  ): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.closeWebRTC();
    this.hasSentAnswerForOffer = rtcOfferJson;
    this.rtcState = 'CONNECTING';

    const pc = new RTCPeerConnection({ iceServers: [...COOP_ONLINE_CONFIG.STUN_SERVERS] });
    this.peerConnection = pc;

    const candidates: RTCIceCandidateInit[] = [];
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        candidates.push(ev.candidate.toJSON());
      }
    };

    pc.ondatachannel = (ev) => {
      this.setupDataChannel(ev.channel, roomCode);
    };

    this.setupPeerConnectionLifecycle(pc, roomCode);

    try {
      const offerDesc = JSON.parse(rtcOfferJson) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(offerDesc);
      if (hostIceJson) {
        await this.addRemoteIceCandidatesJson(hostIceJson);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.waitForIceGatheringShort(pc, 500);

      await this.adapter.updateRoom(roomCode, {
        rtcAnswer: JSON.stringify(pc.localDescription || answer),
        guestIceCandidates: JSON.stringify(candidates),
        rtcConnectionState: 'CONNECTING',
        guestLastActiveAt: Date.now(),
      });
    } catch {
      this.markWebRTCConnectionFailed('Không thể phản hồi WebRTC Answer từ máy Người chơi 2.');
    }
  }

  private async applyGuestAnswerAndIce(
    rtcAnswerJson: string,
    guestIceJson: string | null
  ): Promise<void> {
    if (!this.peerConnection) return;
    try {
      const answerDesc = JSON.parse(rtcAnswerJson) as RTCSessionDescriptionInit;
      if (this.peerConnection.signalingState === 'have-local-offer') {
        await this.peerConnection.setRemoteDescription(answerDesc);
      }
      if (guestIceJson) {
        await this.addRemoteIceCandidatesJson(guestIceJson);
      }
    } catch {
      this.markWebRTCConnectionFailed('Không thể hoàn tất bắt tay WebRTC với Người chơi 2.');
    }
  }

  private async addRemoteIceCandidatesJson(iceJson: string): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    try {
      const list = JSON.parse(iceJson) as RTCIceCandidateInit[];
      if (!Array.isArray(list)) return;
      for (const cand of list) {
        const sig = JSON.stringify(cand);
        if (!this.addedRemoteCandidateSignatures.has(sig)) {
          this.addedRemoteCandidateSignatures.add(sig);
          await this.peerConnection.addIceCandidate(cand);
        }
      }
    } catch {
      // Ignore malformed or duplicate ICE candidate
    }
  }

  private setupPeerConnectionLifecycle(pc: RTCPeerConnection, roomCode: string): void {
    if (this.webrtcConnectTimer) {
      clearTimeout(this.webrtcConnectTimer);
    }
    this.webrtcConnectTimer = setTimeout(() => {
      if (!this.isP2PDataChannelOpen() && this.peerConnection === pc) {
        this.markWebRTCConnectionFailed(
          'Quá thời gian thiết lập kết nối P2P trực tiếp (WebRTC). Có thể do tường lửa hoặc NAT nghiêm ngặt.'
        );
      }
    }, COOP_ONLINE_CONFIG.WEBRTC_CONNECT_TIMEOUT_MS);

    pc.onconnectionstatechange = () => {
      if (this.peerConnection !== pc) return;
      const st = pc.connectionState;
      if (st === 'failed' || st === 'disconnected') {
        this.markWebRTCConnectionFailed(
          'Kết nối P2P trực tiếp (WebRTC) đã bị ngắt hoặc không thể vượt tường lửa.'
        );
        void this.adapter
          .updateRoom(roomCode, { rtcConnectionState: 'FAILED' })
          .catch(() => undefined);
      }
    };
  }

  private setupDataChannel(dc: RTCDataChannel, roomCode: string): void {
    this.dataChannel = dc;

    dc.onopen = () => {
      if (this.webrtcConnectTimer) {
        clearTimeout(this.webrtcConnectTimer);
        this.webrtcConnectTimer = null;
      }
      this.rtcState = 'CONNECTED';
      this.webrtcErrorMessage = null;
      this.lastPeerP2PActiveAt = Date.now();
      if (this.currentRoom) {
        this.currentRoom = { ...this.currentRoom, rtcConnectionState: 'CONNECTED' };
      }
      this.notifyListeners();
      void this.adapter
        .updateRoom(roomCode, { rtcConnectionState: 'CONNECTED' })
        .catch(() => undefined);
    };

    dc.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as CoopDataChannelMessage;
        this.handleIncomingDataChannelMessage(parsed, Date.now());
      } catch {
        // Ignore malformed message
      }
    };

    dc.onclose = () => {
      if (this.rtcState === 'CONNECTED') {
        this.rtcState = 'DISCONNECTED';
        this.notifyListeners();
      }
    };

    dc.onerror = () => {
      this.markWebRTCConnectionFailed('Lỗi trên kênh truyền WebRTC DataChannel.');
    };
  }

  private waitForIceGatheringShort(pc: RTCPeerConnection, maxWaitMs: number): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', onState);
        resolve();
      }, maxWaitMs);
      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', onState);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', onState);
    });
  }

  private closeWebRTC(): void {
    if (this.webrtcConnectTimer) {
      clearTimeout(this.webrtcConnectTimer);
      this.webrtcConnectTimer = null;
    }
    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // Ignore
      }
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {
        // Ignore
      }
      this.peerConnection = null;
    }
    this.hasSentOfferForGuestUid = null;
    this.hasAppliedRemoteAnswer = false;
    this.hasSentAnswerForOffer = null;
    this.addedRemoteCandidateSignatures.clear();
    if (!this.customP2PChannel) {
      this.rtcState = 'NEW';
    }
  }

  private resetSyncCounters(): void {
    this.guestOutgoingSeq = 0;
    this.lastGuestInputSentAt = 0;
    this.lastSentInputSignature = '';
    this.hostLastProcessedGuestSeq = 0;
    this.latestValidatedGuestInput = {
      up: false,
      down: false,
      left: false,
      right: false,
      shoot: false,
    };
    this.hostSnapshotAccumulatorMs = 0;
    this.hostOutgoingSnapshotSeq = 0;
    this.lastBroadcastMatchState = '';
    this.lastBroadcastStageId = -1;
    this.hasRecordedMatchFinishInFirestore = false;
    this.guestLastAppliedSnapshotSeq = 0;
    this.lastPingSentAt = 0;
  }

  private cleanupSubscription(): void {
    if (this.unsubRoom) {
      this.unsubRoom();
      this.unsubRoom = null;
    }
  }
}
