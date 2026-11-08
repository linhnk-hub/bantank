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
  guestInput: SequencedInputPacket | null;
  snapshot: CoopAuthoritativeSnapshot | null;
  snapshotSeq: number;
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

export const COOP_ONLINE_CONFIG = {
  ROOM_CODE_LENGTH: 6,
  ROOM_TTL_MS: 15 * 60 * 1000, // 15 minutes
  SNAPSHOT_INTERVAL_MS: 200, // 5 Hz state sync to stay well within Firebase Spark limits
  MIN_INPUT_INTERVAL_MS: 45, // Rate limit: max ~22 input packets/sec
  HEARTBEAT_INTERVAL_MS: 5000, // 5s presence heartbeat during lobby/match
  DISCONNECT_WARNING_MS: 15000, // 15s without heartbeat -> warning
  DISCONNECT_TIMEOUT_MS: 45000, // 45s without heartbeat -> disconnect timeout
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
  // Only include damaged/destroyed brick subtiles (mask !== 15) to keep Firestore payload small
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
    nowMs > room.expiresAt
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
 * In-memory storage adapter dùng cho kiểm thử tự động (M7.3 Test Harness)
 * hoặc fallback khi chạy trong môi trường CLI không có kết nối mạng.
 */
export class InMemoryCoopStorageAdapter implements CoopStorageAdapter {
  private rooms: Map<string, CoopRoomDocument> = new Map();
  private listeners: Map<string, Set<(room: CoopRoomDocument | null) => void>> = new Map();

  public getRoomSync(roomCode: string): CoopRoomDocument | null {
    const r = this.rooms.get(roomCode);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  public setRoomSync(roomCode: string, room: CoopRoomDocument): void {
    const copy = JSON.parse(JSON.stringify(room));
    this.rooms.set(roomCode, copy);
    this.notify(roomCode);
  }

  public updateRoomSync(roomCode: string, partial: Partial<CoopRoomDocument>): void {
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
  }
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

  // Sequencing & Rate-Limiting state
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

  // Host Snapshot Throttling state
  private hostSnapshotAccumulatorMs: number = 0;
  private hostOutgoingSnapshotSeq: number = 0;
  private lastBroadcastMatchState: string = '';
  private lastBroadcastStageId: number = -1;
  private isSnapshotInFlight: boolean = false;

  //Guest Snapshot Application state
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
    this.adapter = adapter;
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

    let roomCode = generateRoomCode();
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await this.adapter.getRoom(roomCode);
        if (!existing || existing.status === 'EXPIRED' || existing.status === 'ABANDONED' || nowMs > existing.expiresAt) {
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
        guestInput: null,
        snapshot: null,
        snapshotSeq: 0,
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
        nowMs > room.expiresAt
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

      // Check if room already has another Guest (strictly max 2 players per room)
      if (room.guestUid && room.guestUid !== user.uid) {
        return {
          success: false,
          errorCode: 'ROOM_FULL',
          message: 'Phòng đã đủ 2 người chơi (không cho phép người thứ 3 vào phòng).',
        };
      }

      // If match already started and caller is not the existing guest reconnecting
      if (room.status === 'PLAYING' && room.guestUid !== user.uid) {
        return {
          success: false,
          errorCode: 'MATCH_ALREADY_STARTED',
          message: 'Trận đấu trong phòng này đã bắt đầu.',
        };
      }

      this.cleanupSubscription();

      const updatedFields: Partial<CoopRoomDocument> = {
        guestUid: user.uid,
        guestDisplayName: getUserDisplayLabel(user),
        guestPhotoURL: user.photoURL || '',
        guestReady: room.status === 'PLAYING' ? true : false,
        guestLastActiveAt: nowMs,
        disconnectReason: null,
      };

      await this.adapter.updateRoom(normalized, updatedFields);
      const updatedRoom: CoopRoomDocument = {
        ...room,
        ...updatedFields,
      };

      this.currentRoom = updatedRoom;
      this.role = 'GUEST';
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
   */
  public async startOnlineMatch(
    callerUid: string,
    initialGameState?: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    if (!this.currentRoom) {
      return { success: false, message: 'Không tìm thấy thông tin phòng.' };
    }

    if (this.currentRoom.hostUid !== callerUid || this.role !== 'HOST') {
      return {
        success: false,
        errorCode: 'NOT_HOST',
        message: 'Chỉ Chủ phòng (P1) mới có quyền bắt đầu trận đấu.',
      };
    }

    if (!this.currentRoom.guestUid || !this.currentRoom.hostReady || !this.currentRoom.guestReady) {
      return {
        success: false,
        errorCode: 'PLAYERS_NOT_READY',
        message: 'Cần đủ 2 người chơi trong phòng và cả 2 đều đã nhấn Sẵn sàng.',
      };
    }

    this.resetSyncCounters();
    const initialSnapshot = initialGameState
      ? buildAuthoritativeSnapshot(initialGameState, 1, nowMs)
      : null;
    if (initialSnapshot) {
      this.hostOutgoingSnapshotSeq = 1;
    }

    const partial: Partial<CoopRoomDocument> = {
      status: 'PLAYING',
      hostLastActiveAt: nowMs,
      snapshot: initialSnapshot,
      snapshotSeq: initialSnapshot ? 1 : 0,
      disconnectReason: null,
    };

    try {
      await this.adapter.updateRoom(this.currentRoom.roomCode, partial);
      this.currentRoom = { ...this.currentRoom, ...partial };
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
   * Guest (P2) gửi gói tin điều khiển có đánh số thứ tự `seq` và `clientTimestamp`.
   * Có giới hạn tốc độ gửi (Rate-limit) để bảo vệ hạn mức Firestore Spark.
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

    // If input hasn't changed and heartbeat window hasn't elapsed, skip network write
    if (!forceSend && sig === this.lastSentInputSignature && elapsedSinceLast < COOP_ONLINE_CONFIG.HEARTBEAT_INTERVAL_MS) {
      return { success: true };
    }

    // Rate limiting check
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

    this.guestOutgoingSeq = nextSeq;
    this.lastGuestInputSentAt = nowMs;
    this.lastSentInputSignature = sig;

    try {
      await this.adapter.updateRoom(this.currentRoom.roomCode, {
        guestInput: validation.sanitized,
        guestLastActiveAt: nowMs,
      });
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Lỗi đồng bộ thao tác P2.',
      };
    }
  }

  /**
   * Host (P1) kiểm tra và áp dụng gói tin điều khiển từ Guest (P2).
   * Bỏ qua gói tin trùng lặp hoặc sai thứ tự (`seq <= hostLastProcessedGuestSeq`).
   */
  public processIncomingGuestInput(
    rawPacket: unknown
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
   * Được gọi mỗi frame trên máy Chủ phòng (Host) để phát bản chụp trạng thái định kỳ (~200ms/lần)
   * hoặc ngay lập tức khi có sự kiện quan trọng (Qua màn, Game Over, Tạm dừng).
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

    if (this.isSnapshotInFlight && !isCriticalTransition) {
      return false;
    }

    this.hostSnapshotAccumulatorMs = 0;
    this.lastBroadcastMatchState = state.matchState;
    this.lastBroadcastStageId = state.currentStageId;
    this.hostOutgoingSnapshotSeq += 1;

    const snapshot = buildAuthoritativeSnapshot(state, this.hostOutgoingSnapshotSeq, nowMs);
    this.isSnapshotInFlight = true;

    try {
      const nextStatus: CoopRoomStatus =
        state.isGameOver ? 'FINISHED' : this.currentRoom.status;
      await this.adapter.updateRoom(this.currentRoom.roomCode, {
        snapshot,
        snapshotSeq: snapshot.snapshotSeq,
        hostLastActiveAt: nowMs,
        status: nextStatus,
      });
      return true;
    } catch {
      return false;
    } finally {
      this.isSnapshotInFlight = false;
    }
  }

  /**
   * Kiểm tra tình trạng mất kết nối của đối phương dựa trên `hostLastActiveAt` / `guestLastActiveAt`.
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

    const peerLastActive =
      this.role === 'HOST'
        ? this.currentRoom.guestLastActiveAt
        : this.currentRoom.hostLastActiveAt;

    if (!peerLastActive) {
      return { peerConnected: false, warningMessage: null, isTimedOut: false };
    }

    const silenceMs = Math.max(0, nowMs - peerLastActive);
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
          ? 'Tín hiệu từ Người chơi 2 (P2) đang yếu, đang chờ kết nối lại...'
          : 'Đang chờ phản hồi đồng bộ từ Chủ phòng (P1)...';
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
  public async leaveRoom(reason?: string): Promise<void> {
    const room = this.currentRoom;
    const currentRole = this.role;
    this.cleanupSubscription();
    this.currentRoom = null;
    this.role = null;
    this.resetSyncCounters();
    this.notifyListeners();

    if (!room || !currentRole) return;

    try {
      if (currentRole === 'HOST') {
        await this.adapter.updateRoom(room.roomCode, {
          status: 'ABANDONED',
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
            guestInput: null,
            disconnectReason: 'Người chơi 2 đã rời phòng chờ.',
          });
        } else {
          await this.adapter.updateRoom(room.roomCode, {
            status: 'ABANDONED',
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
        if (this.role === 'HOST' && updatedRoom.guestInput) {
          this.processIncomingGuestInput(updatedRoom.guestInput);
        }

        if (
          this.role === 'GUEST' &&
          updatedRoom.snapshot &&
          updatedRoom.snapshot.snapshotSeq > this.guestLastAppliedSnapshotSeq
        ) {
          this.guestLastAppliedSnapshotSeq = updatedRoom.snapshot.snapshotSeq;
          const snap = updatedRoom.snapshot;
          this.snapshotListeners.forEach((cb) => {
            try {
              cb(snap);
            } catch (e) {
              console.error('[CoopOnlineManager] snapshot listener error:', e);
            }
          });
        }
      }

      this.notifyListeners();
    });
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
    this.isSnapshotInFlight = false;
    this.guestLastAppliedSnapshotSeq = 0;
  }

  private cleanupSubscription(): void {
    if (this.unsubRoom) {
      this.unsubRoom();
      this.unsubRoom = null;
    }
  }
}
