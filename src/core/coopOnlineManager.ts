/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import { getUserDisplayLabel } from './authManager.ts';
import { SessionManager } from './sessionManager.ts';
import {
  MATCH_TIMER_CONFIG,
  SIMULATION_CONFIG,
  getMatchDurationSecondsForDifficulty,
} from './constants.ts';
import {
  NEUTRAL_INPUT,
  validateAndNormalizeAuthoritativeSnapshot,
} from './gameEngine.ts';
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
  stageRunSeq: number;
  difficulty: 'DEFAULT' | 'EXTREME';
  matchDurationSeconds: number;
  remainingTicks: number;
  remainingSeconds: number;
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
  currentStageVersion?: number;
  currentStageMap?: number[][];
  stageElapsedSeconds: number;
  brickSubTiles: Record<string, number>;
  isBaseDestroyed: boolean;
  isGameOver: boolean;
  isStageClear: boolean;
  isTimeoutGameOver: boolean;
  gameOverReason: string | null;
  peerLeaveNotice?: string | null;
  matchState: GameCoreState['matchState'];
}

export type CoopDataChannelMessage =
  | { type: 'GUEST_INPUT'; packet: SequencedInputPacket }
  | { type: 'HOST_SNAPSHOT'; snapshot: CoopAuthoritativeSnapshot }
  | { type: 'PLAYER_LEFT'; role: 'HOST' | 'GUEST'; reason: string; timestamp: number }
  | { type: 'PING'; timestamp: number };

/**
 * Tài liệu công khai tối thiểu `/coop_rooms/{roomCode}` trên Firestore.
 * KHÔNG chứa WebRTC Offer/Answer/ICE, ảnh đại diện hay kết quả riêng của trận đấu.
 */
export interface CoopRoomLobbyDocument {
  roomCode: string;
  status: CoopRoomStatus;
  difficulty: 'DEFAULT' | 'EXTREME';
  hostUid: string;
  hostDisplayName: string;
  hostReady: boolean;
  hostLastActiveAt: number;
  guestUid: string | null;
  guestDisplayName: string | null;
  guestReady: boolean;
  guestLastActiveAt: number | null;
  rtcConnectionState: CoopRtcConnectionState;
  createdAt: number;
  expiresAt: number;
  disconnectReason: string | null;
}

/**
 * Tài liệu phụ riêng tư `/coop_rooms/{roomCode}/private/signaling` trên Firestore.
 * Chỉ Host (P1) và Guest (P2) đã tham gia phòng mới có quyền đọc/ghi.
 */
export interface CoopRoomSignalingDocument {
  roomCode: string;
  hostUid: string;
  guestUid: string | null;
  rtcOffer: string | null;
  rtcAnswer: string | null;
  hostIceCandidates: string | null;
  guestIceCandidates: string | null;
  finalScore: number;
  matchOutcome: 'VICTORY' | 'GAME_OVER' | null;
  updatedAt: number;
}

/**
 * Trạng thái phòng hợp nhất trong bộ nhớ của Host / Guest sau khi đã vào phòng.
 */
export interface CoopRoomDocument extends CoopRoomLobbyDocument {
  hasPassword?: boolean;
  rtcOffer?: string | null;
  rtcAnswer?: string | null;
  hostIceCandidates?: string | null;
  guestIceCandidates?: string | null;
  finalScore?: number;
  matchOutcome?: 'VICTORY' | 'GAME_OVER' | null;
}

export interface CoopCreateRoomOptions {
  hasPassword?: boolean;
  password?: string;
}

export interface CoopJoinRoomOptions {
  password?: string;
}

export type CoopRoomCreateStep =
  | 'AUTH_PRECHECK'
  | 'PRECHECK_ROOM_CODE'
  | 'CREATE_PARENT_ROOM'
  | 'CREATE_SIGNALING_DOC'
  | 'VERIFY_SIGNALING_DOC';

export interface CoopCreateRoomDiagnosticLog {
  step: CoopRoomCreateStep;
  path: string;
  errorCode: 'UNAUTHENTICATED' | 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'INVALID_DATA';
  firestoreCode: string;
  timestampMs: number;
}

export interface CoopActionResult {
  success: boolean;
  errorCode?:
    | 'UNAUTHENTICATED'
    | 'PERMISSION_DENIED'
    | 'INVALID_DATA'
    | 'INVALID_CODE_FORMAT'
    | 'INVALID_PASSWORD'
    | 'PASSWORD_REQUIRED'
    | 'WRONG_PASSWORD'
    | 'NO_AVAILABLE_PUBLIC_ROOM'
    | 'INVALID_ROOM_STATE'
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
  failedStep?: CoopRoomCreateStep;
  message?: string;
  room?: CoopRoomDocument;
}

export interface CoopStorageAdapter {
  getRoom(roomCode: string): Promise<CoopRoomLobbyDocument | null>;
  getRoomFromServer(roomCode: string): Promise<CoopRoomLobbyDocument | null>;
  setRoom(roomCode: string, room: CoopRoomLobbyDocument): Promise<void>;
  updateRoom(roomCode: string, partial: Partial<CoopRoomLobbyDocument>): Promise<void>;
  subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomLobbyDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void;
  getSignaling(roomCode: string): Promise<CoopRoomSignalingDocument | null>;
  getSignalingFromServer(roomCode: string): Promise<CoopRoomSignalingDocument | null>;
  setSignaling(roomCode: string, sig: CoopRoomSignalingDocument): Promise<void>;
  updateSignaling(roomCode: string, partial: Partial<CoopRoomSignalingDocument>): Promise<void>;
  subscribeSignaling(
    roomCode: string,
    onUpdate: (sig: CoopRoomSignalingDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void;
  listRooms?: () => Promise<CoopRoomLobbyDocument[]>;
}

export interface CoopP2PChannelAdapter {
  isOpen(): boolean;
  send(msg: CoopDataChannelMessage): boolean;
  close(): void;
}

export const COOP_ONLINE_CONFIG = {
  ROOM_CODE_LENGTH: 6,
  ROOM_TTL_MS: 15 * 60 * 1000, // 15 minutes max ceiling in firestore.rules (900,000 ms)
  CLOCK_SKEW_BUFFER_MS: 90 * 1000, // 90s buffer (absorbs up to +60s client clock skew + 30s network jitter)
  EFFECTIVE_WAITING_TTL_MS: (15 * 60 - 90) * 1000, // 810,000 ms (13m30s effective waiting room TTL on client)
  MAX_CODE_GENERATION_ATTEMPTS: 5,
  SNAPSHOT_INTERVAL_MS: 50, // 20 Hz direct P2P WebRTC DataChannel sync (0 Firestore writes!)
  MIN_INPUT_INTERVAL_MS: 45, // Rate limit: max ~22 input packets/sec over DataChannel
  INPUT_KEEPALIVE_INTERVAL_MS: 200, // Periodic state convergence over P2P DataChannel (prevents stuck keys on UDP packet loss)
  HEARTBEAT_INTERVAL_MS: 2000, // 2s P2P DataChannel ping
  DISCONNECT_WARNING_MS: 15000, // 15s without peer message -> warning
  DISCONNECT_TIMEOUT_MS: 45000, // 45s without peer message -> disconnect timeout
  WEBRTC_CONNECT_TIMEOUT_MS: 12000, // 12s timeout for WebRTC P2P establishment
  STUN_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
} as const;

/**
 * Phân loại lỗi phát sinh trong quy trình tạo phòng Co-op Online (M7.3.4 & M7.3.6 Mục IV):
 * - 'UNAUTHENTICATED': Token hết hạn, chưa đăng nhập hoặc lỗi xác thực -> dừng ngay, không sinh mã mới.
 * - 'PERMISSION_DENIED': Lỗi `permission-denied` (`Missing or insufficient permissions`) -> dừng ngay ở lần đầu tiên,
 *   tuyệt đối không coi là trùng mã phòng và không retry 5 lần.
 * - 'INVALID_DATA': Dữ liệu tạo phòng không hợp lệ (`invalid-argument`).
 * - 'NETWORK_ERROR': Mất mạng, offline, timeout, unavailable -> dừng ngay, không sinh mã mới.
 */
export function classifyGetRoomErrorDuringCreate(
  err: unknown
): 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'UNAUTHENTICATED' | 'INVALID_DATA' {
  const anyErr = err as { code?: string; message?: string } | null | undefined;
  const code = String(anyErr?.code || '').toLowerCase();
  const msg = String(anyErr?.message || err || '').toLowerCase();

  if (
    code.includes('unauthenticated') ||
    code.includes('user-token-expired') ||
    code.includes('invalid-user-token') ||
    msg.includes('unauthenticated') ||
    msg.includes('user-token-expired') ||
    msg.includes('invalid-user-token')
  ) {
    return 'UNAUTHENTICATED';
  }

  if (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission-denied') ||
    msg.includes('permission_denied')
  ) {
    return 'PERMISSION_DENIED';
  }

  if (
    code.includes('invalid-argument') ||
    code.includes('invalid_argument') ||
    code === 'invalid_data' ||
    msg.includes('invalid-argument') ||
    msg.includes('invalid data')
  ) {
    return 'INVALID_DATA';
  }

  return 'NETWORK_ERROR';
}

export function buildCreateRoomStepErrorMessage(
  step: CoopRoomCreateStep,
  errorCode: 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'UNAUTHENTICATED' | 'INVALID_DATA'
): string {
  const stepLabelMap: Record<CoopRoomCreateStep, string> = {
    AUTH_PRECHECK: 'kiểm tra xác thực tài khoản',
    PRECHECK_ROOM_CODE: 'kiểm tra mã phòng trống (/coop_rooms/{roomCode})',
    CREATE_PARENT_ROOM: 'khởi tạo phòng chính (/coop_rooms/{roomCode})',
    CREATE_SIGNALING_DOC: 'khởi tạo kênh bảo mật (/coop_rooms/{roomCode}/private/signaling)',
    VERIFY_SIGNALING_DOC: 'xác minh kênh bảo mật (/coop_rooms/{roomCode}/private/signaling)',
  };
  const stepLabel = stepLabelMap[step];

  if (errorCode === 'UNAUTHENTICATED') {
    return `Phiên xác thực Google không hợp lệ hoặc đã hết hạn khi ${stepLabel}. Vui lòng đăng nhập lại.`;
  }
  if (errorCode === 'PERMISSION_DENIED') {
    return `Không đủ quyền truy cập Firestore khi ${stepLabel} (PERMISSION_DENIED). Vui lòng kiểm tra Gmail cá nhân đã xác minh và đảm bảo Firestore Rules mới nhất đã được cập nhật.`;
  }
  if (errorCode === 'INVALID_DATA') {
    return `Dữ liệu tạo phòng không hợp lệ khi ${stepLabel} (INVALID_DATA). Vui lòng thử lại.`;
  }
  return `Lỗi kết nối mạng khi ${stepLabel} (NETWORK_ERROR). Vui lòng kiểm tra kết nối Internet và thử lại.`;
}

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
 * Kiểm tra tính hợp lệ của mật khẩu phòng Co-op Online (M7.3.7 Mục VI.5.2):
 * - Khi chọn "Có mật khẩu": bắt buộc từ 3 đến 32 ký tự (sau khi trim), không chỉ gồm khoảng trắng.
 */
export function validateRoomPassword(rawPassword?: string | null): {
  valid: boolean;
  normalized: string;
  message?: string;
} {
  const normalized = typeof rawPassword === 'string' ? rawPassword.trim() : '';
  if (normalized.length === 0) {
    return {
      valid: false,
      normalized: '',
      message: 'Vui lòng nhập mật khẩu phòng (tối thiểu 3 ký tự) hoặc chọn "Không mật khẩu".',
    };
  }
  if (normalized.length < 3 || normalized.length > 32) {
    return {
      valid: false,
      normalized,
      message: 'Mật khẩu phòng phải có độ dài từ 3 đến 32 ký tự.',
    };
  }
  return { valid: true, normalized };
}

/**
 * Băm mật khẩu phòng có muối theo `roomCode` (16 ký tự hex, không lưu mật khẩu dạng rõ).
 */
export function computeRoomPasswordDigest(roomCode: string, rawPassword: string): string {
  const cleanCode = (roomCode || '').trim().toUpperCase();
  const cleanPass = (rawPassword || '').trim();
  const input = `BANTANK_M737_LOCK::${cleanCode}::${cleanPass}`;
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`.toLowerCase();
}

const ROOM_LOCK_TAG_REGEX = /^(.*?)\s*\[LOCK:([0-9a-f]{16})\]$/i;

/**
 * Mã hóa dấu khóa mật khẩu vào `hostDisplayName` (giữ đúng 15 trường của `/coop_rooms/{roomCode}`
 * trên Firestore Production mà không cần thêm trường mới hay công bố lại `firestore.rules`).
 */
export function encodeHostDisplayNameWithLock(
  cleanDisplayName: string,
  roomCode: string,
  hasPassword: boolean,
  rawPassword?: string
): string {
  const baseName = (cleanDisplayName || 'Commander')
    .replace(ROOM_LOCK_TAG_REGEX, '$1')
    .trim();
  if (!hasPassword || !rawPassword) {
    return (baseName || 'Commander').slice(0, 80);
  }
  const digest = computeRoomPasswordDigest(roomCode, rawPassword);
  const clippedName = (baseName || 'Commander').slice(0, 55);
  return `${clippedName} [LOCK:${digest}]`;
}

/**
 * Giải mã `hostDisplayName` để lấy tên hiển thị sạch và thông tin khóa mật khẩu.
 */
export function decodeHostDisplayNameAndLock(rawHostDisplayName: string): {
  cleanDisplayName: string;
  hasPassword: boolean;
  passwordDigest: string | null;
} {
  const raw = typeof rawHostDisplayName === 'string' ? rawHostDisplayName : 'Commander';
  const match = raw.match(ROOM_LOCK_TAG_REGEX);
  if (!match) {
    return {
      cleanDisplayName: raw,
      hasPassword: false,
      passwordDigest: null,
    };
  }
  return {
    cleanDisplayName: (match[1] || 'Commander').trim() || 'Commander',
    hasPassword: true,
    passwordDigest: match[2].toLowerCase(),
  };
}

export function verifyRoomPassword(
  roomCode: string,
  candidatePassword: string | undefined | null,
  expectedDigest: string | null
): boolean {
  if (!expectedDigest) return true;
  if (!candidatePassword || candidatePassword.trim().length === 0) return false;
  const actual = computeRoomPasswordDigest(roomCode, candidatePassword);
  return actual === expectedDigest.toLowerCase();
}

/**
 * Sinh danh sách mã phòng định danh theo khung thời gian 5 phút cho các phòng công khai (Không mật khẩu),
 * giúp "Vào nhanh" tìm phòng trống bằng `getDoc` (tuân thủ `allow get` trên Firestore Production mà không cần `list`)
 * đồng thời không tái sử dụng mã phòng cũ để luôn thỏa mãn `allow create`.
 */
export function getPublicQuickJoinSlotCodesForBucket(bucketIndex: number): string[] {
  const base36 = Math.max(0, Math.floor(bucketIndex))
    .toString(36)
    .toUpperCase()
    .padStart(4, '2')
    .slice(-4);
  const slotChars = ['2', '3', '4', '5', '6'];
  return slotChars.map((s) => `Q${base36}${s}`);
}

export function getPublicQuickJoinCandidateCodes(nowMs: number = Date.now()): string[] {
  const currentBucket = Math.floor(nowMs / (5 * 60 * 1000));
  return [
    ...getPublicQuickJoinSlotCodesForBucket(currentBucket),
    ...getPublicQuickJoinSlotCodesForBucket(currentBucket - 1),
    ...getPublicQuickJoinSlotCodesForBucket(currentBucket - 2),
  ];
}

/**
 * Hợp nhất an toàn tài liệu phòng cha (`CoopRoomLobbyDocument`) và tài liệu signaling (`CoopRoomSignalingDocument`).
 * QUAN TRỌNG (Sửa lỗi Hạng mục 6 - M7.3.7):
 * - Tài liệu phòng cha `/coop_rooms/{roomCode}` LUÔN là nguồn chuẩn cho `guestUid`, `guestDisplayName`,
 *   `guestReady`, `guestLastActiveAt`, `hostReady`, `status`, `difficulty`, `rtcConnectionState`.
 * - Tuyệt đối không để `sig.guestUid` (`null` lúc mới tạo phòng) ghi đè `lobby.guestUid` sau khi P2 đã vào phòng!
 */
export function mergeLobbyAndSignaling(
  lobby: CoopRoomLobbyDocument,
  sig?: CoopRoomSignalingDocument | null
): CoopRoomDocument {
  const decodedHost = decodeHostDisplayNameAndLock(lobby.hostDisplayName);
  return {
    ...lobby,
    hostDisplayName: decodedHost.cleanDisplayName,
    hasPassword: decodedHost.hasPassword,
    rtcOffer: sig ? sig.rtcOffer : null,
    rtcAnswer: sig ? sig.rtcAnswer : null,
    hostIceCandidates: sig ? sig.hostIceCandidates : null,
    guestIceCandidates: sig ? sig.guestIceCandidates : null,
    finalScore: sig ? sig.finalScore : 0,
    matchOutcome: sig ? sig.matchOutcome : null,
  };
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

  const difficulty: 'DEFAULT' | 'EXTREME' =
    state.difficulty === 'EXTREME' ? 'EXTREME' : 'DEFAULT';
  const matchDurationSeconds =
    typeof state.matchDurationSeconds === 'number' && state.matchDurationSeconds > 0
      ? state.matchDurationSeconds
      : getMatchDurationSecondsForDifficulty(difficulty);
  const maxStageTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;
  const remainingTicks =
    typeof state.remainingTicks === 'number' &&
    Number.isInteger(state.remainingTicks) &&
    state.remainingTicks >= 0 &&
    state.remainingTicks <= maxStageTicks
      ? state.remainingTicks
      : Math.max(0, maxStageTicks - state.tickCount);
  const remainingSeconds = Math.ceil(remainingTicks / MATCH_TIMER_CONFIG.TICKS_PER_SECOND);
  const stageRunSeq =
    typeof state.stageRunSeq === 'number' &&
    Number.isInteger(state.stageRunSeq) &&
    state.stageRunSeq >= 1
      ? state.stageRunSeq
      : 1;

  return {
    snapshotSeq,
    serverTimestamp: nowMs,
    tickCount: state.tickCount,
    stageRunSeq,
    difficulty,
    matchDurationSeconds,
    remainingTicks,
    remainingSeconds,
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
    currentStageVersion: state.currentStageVersion ?? 1,
    currentStageMap: (state.terrain.initialMap ?? state.terrain.currentMap).map((row) => [...row]),
    stageElapsedSeconds: Number(
      (state.tickCount / MATCH_TIMER_CONFIG.TICKS_PER_SECOND).toFixed(2)
    ),
    brickSubTiles: damagedBricks,
    isBaseDestroyed: state.terrain.isBaseDestroyed,
    isGameOver: state.isGameOver,
    isStageClear: state.isStageClear,
    isTimeoutGameOver: Boolean(state.isTimeoutGameOver),
    gameOverReason: state.gameOverReason,
    peerLeaveNotice: state.peerLeaveNotice ?? null,
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
  nowMs: number = Date.now(),
  signalingExists: boolean = true,
  options?: CoopJoinRoomOptions
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

  if (!signalingExists) {
    return {
      success: false,
      errorCode: 'ROOM_NOT_FOUND',
      message: 'Phòng chơi chưa khởi tạo xong dữ liệu kết nối bảo mật (thiếu signaling). Vui lòng thử lại.',
    };
  }

  if (
    room.status === 'EXPIRED' ||
    room.status === 'ABANDONED' ||
    room.status === 'FINISHED' ||
    (room.status === 'WAITING' && nowMs >= room.expiresAt)
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

  const decodedLock = decodeHostDisplayNameAndLock(room.hostDisplayName);
  const requiresPassword = Boolean(room.hasPassword || decodedLock.hasPassword);
  if (requiresPassword && decodedLock.passwordDigest) {
    const providedPass = options?.password?.trim() || '';
    if (!providedPass) {
      return {
        success: false,
        errorCode: 'PASSWORD_REQUIRED',
        message: 'Phòng này có mật khẩu bảo vệ. Vui lòng nhập mật khẩu để vào phòng.',
      };
    }
    if (!verifyRoomPassword(normalized, providedPass, decodedLock.passwordDigest)) {
      return {
        success: false,
        errorCode: 'WRONG_PASSWORD',
        message: 'Mật khẩu phòng không chính xác. Vui lòng kiểm tra lại.',
      };
    }
  }

  return { success: true, room };
}

/**
 * Kiểm tra điều kiện bắt đầu trận đấu Co-op Online (dùng chung cho cả luồng async và kiểm thử đồng bộ).
 * Bắt buộc: Chủ phòng (HOST), phòng WAITING chưa hết hạn, đã có private/signaling,
 * đủ 2 người chơi, cả 2 đã Ready, và kênh WebRTC DataChannel đã CONNECTED.
 */
export function evaluateStartMatchCandidate(
  room: CoopRoomDocument | null,
  callerUid: string,
  role: CoopPlayerRole,
  nowMs?: number,
  signalingExists: boolean = true
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

  if (
    room.status === 'EXPIRED' ||
    room.status === 'ABANDONED' ||
    room.status === 'FINISHED' ||
    (room.status === 'WAITING' && nowMs !== undefined && nowMs >= room.expiresAt)
  ) {
    return {
      success: false,
      errorCode: 'ROOM_EXPIRED',
      message: 'Phòng chờ đã hết hạn (quá 15 phút). Không thể bắt đầu trận đấu.',
    };
  }

  if (!signalingExists) {
    return {
      success: false,
      errorCode: 'WEBRTC_NOT_CONNECTED',
      message: 'Thiếu dữ liệu signaling bảo mật của phòng. Không thể bắt đầu trận đấu.',
    };
  }

  if (!room.guestUid || !room.hostReady || !room.guestReady) {
    return {
      success: false,
      errorCode: 'PLAYERS_NOT_READY',
      message: 'Cần đủ 2 người chơi trong phòng và cả 2 đều đã nhấn Sẵn sàng.',
    };
  }

  if (room.rtcConnectionState !== 'CONNECTED') {
    return {
      success: false,
      errorCode: 'WEBRTC_NOT_CONNECTED',
      message: 'Kênh truyền P2P trực tiếp (WebRTC DataChannel) đang thiết lập hoặc chưa mở. Vui lòng đợi kết nối P2P hoàn tất.',
    };
  }

  return { success: true, room };
}

function isValidClientMillisTimestampModel(ts: unknown, requestTimeMs: number): boolean {
  return (
    typeof ts === 'number' &&
    Number.isInteger(ts) &&
    ts >= requestTimeMs - 60000 &&
    ts <= requestTimeMs + 60000
  );
}

/**
 * Hàm kiểm thử đơn vị (Unit Test Model) đối chiếu logic phân quyền CREATE của `/coop_rooms/{roomCode}`.
 * Lưu ý: Đây là hàm unit test trong bộ nhớ ứng dụng, KHÔNG thay thế Firebase Rules Emulator.
 */
export function evaluateCoopRoomRuleCreate(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  roomCode: string;
  incoming: CoopRoomLobbyDocument;
}): boolean {
  const { authUid, isVerifiedPersonalGmail, requestTimeMs, roomCode, incoming } = params;
  if (!authUid || !isVerifiedPersonalGmail) return false;
  if (!/^[A-Z0-9]{6}$/.test(roomCode) || incoming.roomCode !== roomCode) return false;
  if (incoming.hostUid !== authUid) return false;
  if (incoming.status !== 'WAITING') return false;
  if (incoming.difficulty !== 'DEFAULT' && incoming.difficulty !== 'EXTREME') return false;
  if (
    typeof incoming.hostDisplayName !== 'string' ||
    incoming.hostDisplayName.length < 1 ||
    incoming.hostDisplayName.length > 80
  ) {
    return false;
  }
  if (typeof incoming.hostReady !== 'boolean') return false;
  if (incoming.guestUid !== null) return false;
  if (incoming.guestDisplayName !== null) return false;
  if (incoming.guestReady !== false) return false;
  if (incoming.guestLastActiveAt !== null) return false;
  if (incoming.rtcConnectionState !== 'NEW') return false;
  if (incoming.disconnectReason !== null) return false;

  // Strict server-time bounds (Fix 4):
  // - createdAt & hostLastActiveAt within ±60,000 ms of request.time.toMillis()
  // - expiresAt > createdAt && expiresAt > request.time.toMillis()
  // - expiresAt <= createdAt + 900,000 && expiresAt <= request.time.toMillis() + 900,000
  if (!isValidClientMillisTimestampModel(incoming.createdAt, requestTimeMs)) return false;
  if (!isValidClientMillisTimestampModel(incoming.hostLastActiveAt, requestTimeMs)) return false;
  if (
    typeof incoming.expiresAt !== 'number' ||
    !Number.isInteger(incoming.expiresAt) ||
    incoming.expiresAt <= incoming.createdAt ||
    incoming.expiresAt <= requestTimeMs ||
    incoming.expiresAt > incoming.createdAt + 900000 ||
    incoming.expiresAt > requestTimeMs + 900000
  ) {
    return false;
  }

  return true;
}

/**
 * Kiểm tra tài liệu `/coop_rooms/{roomCode}/private/signaling` đã lưu kết quả trận đấu hợp lệ
 * khớp với phòng cha trước khi cho phép chuyển trạng thái `PLAYING -> FINISHED` (M7.3 FINAL GUARD - Fix 1):
 * - Tài liệu signaling tồn tại
 * - signaling.roomCode == roomCode
 * - signaling.hostUid == parentRoom.hostUid
 * - parentRoom.guestUid != null && signaling.guestUid == parentRoom.guestUid
 * - signaling.matchOutcome thuộc ['VICTORY', 'GAME_OVER']
 * - signaling.finalScore là số nguyên từ 0 đến 9999999
 */
export function hasValidRecordedMatchResultModel(
  roomCode: string,
  parentRoom: Pick<CoopRoomLobbyDocument, 'hostUid' | 'guestUid'>,
  signalingDoc: CoopRoomSignalingDocument | null | undefined,
  signalingExists: boolean = true
): boolean {
  if (!signalingExists || !signalingDoc) return false;
  if (signalingDoc.roomCode !== roomCode) return false;
  if (signalingDoc.hostUid !== parentRoom.hostUid) return false;
  if (parentRoom.guestUid === null || signalingDoc.guestUid !== parentRoom.guestUid) return false;
  if (signalingDoc.matchOutcome !== 'VICTORY' && signalingDoc.matchOutcome !== 'GAME_OVER') {
    return false;
  }
  if (
    typeof signalingDoc.finalScore !== 'number' ||
    !Number.isInteger(signalingDoc.finalScore) ||
    signalingDoc.finalScore < 0 ||
    signalingDoc.finalScore > 9999999
  ) {
    return false;
  }
  return true;
}

/**
 * Hàm kiểm thử đơn vị (Unit Test Model) đối chiếu logic phân quyền UPDATE của `/coop_rooms/{roomCode}`.
 * Lưu ý: Đây là hàm unit test trong bộ nhớ ứng dụng, KHÔNG thay thế Firebase Rules Emulator.
 */
export function evaluateCoopRoomRuleUpdate(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  existing: CoopRoomLobbyDocument;
  incoming: CoopRoomLobbyDocument;
  signalingExists?: boolean;
  signalingDoc?: CoopRoomSignalingDocument | null;
}): { allowed: boolean; matchedBranch: string | null } {
  const {
    authUid,
    isVerifiedPersonalGmail,
    requestTimeMs,
    existing,
    incoming,
    signalingExists = true,
    signalingDoc = null,
  } = params;
  if (!authUid || !isVerifiedPersonalGmail) {
    return { allowed: false, matchedBranch: null };
  }

  // Reject any attempt to store signaling or continuous sync fields in the public lobby doc
  const rawIncoming = incoming as unknown as Record<string, unknown>;
  if (
    'guestInput' in rawIncoming ||
    'snapshot' in rawIncoming ||
    'rtcOffer' in rawIncoming ||
    'rtcAnswer' in rawIncoming ||
    'hostIceCandidates' in rawIncoming ||
    'guestIceCandidates' in rawIncoming
  ) {
    return { allowed: false, matchedBranch: null };
  }

  // Immutable core fields & schema check (expiresAt cannot be extended or modified on update)
  if (
    incoming.roomCode !== existing.roomCode ||
    !/^[A-Z0-9]{6}$/.test(incoming.roomCode) ||
    incoming.hostUid !== existing.hostUid ||
    incoming.hostDisplayName !== existing.hostDisplayName ||
    incoming.difficulty !== existing.difficulty ||
    incoming.createdAt !== existing.createdAt ||
    incoming.expiresAt !== existing.expiresAt ||
    incoming.expiresAt <= incoming.createdAt ||
    incoming.expiresAt > incoming.createdAt + 900000
  ) {
    return { allowed: false, matchedBranch: null };
  }

  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if ((existing as any)[k] !== (incoming as any)[k]) {
      affectedKeys.push(k);
    }
  }

  const isWaitingRoomNotExpired =
    existing.status === 'WAITING' && requestTimeMs < existing.expiresAt;

  const isHostTimestampValid =
    incoming.hostLastActiveAt === existing.hostLastActiveAt ||
    isValidClientMillisTimestampModel(incoming.hostLastActiveAt, requestTimeMs);

  const isGuestTimestampValid =
    incoming.guestLastActiveAt === existing.guestLastActiveAt ||
    (incoming.guestLastActiveAt !== null &&
      isValidClientMillisTimestampModel(incoming.guestLastActiveAt, requestTimeMs));

  const hasValidMatchResult = hasValidRecordedMatchResultModel(
    existing.roomCode,
    existing,
    signalingDoc,
    signalingExists
  );

  // Explicit State Machine for Host (P1) status transitions
  const isValidHostTransition =
    // 1. WAITING -> WAITING (only while waiting room is not expired)
    (existing.status === 'WAITING' &&
      incoming.status === 'WAITING' &&
      requestTimeMs < existing.expiresAt) ||
    // 2. WAITING -> PLAYING (requires waiting room not expired, signalingExists, both ready, and existing & incoming CONNECTED)
    (existing.status === 'WAITING' &&
      incoming.status === 'PLAYING' &&
      requestTimeMs < existing.expiresAt &&
      existing.guestUid !== null &&
      existing.hostReady === true &&
      existing.guestReady === true &&
      existing.rtcConnectionState === 'CONNECTED' &&
      incoming.rtcConnectionState === 'CONNECTED' &&
      incoming.hostReady === true &&
      signalingExists) ||
    // 3. WAITING -> ABANDONED
    (existing.status === 'WAITING' &&
      incoming.status === 'ABANDONED' &&
      incoming.hostReady === existing.hostReady) ||
    // 4. WAITING -> EXPIRED (only when requestTimeMs >= existing.expiresAt)
    (existing.status === 'WAITING' &&
      incoming.status === 'EXPIRED' &&
      requestTimeMs >= existing.expiresAt &&
      incoming.hostReady === existing.hostReady) ||
    // 5. PLAYING -> PLAYING (Fix 2: do not block active match using waiting room's expiresAt)
    (existing.status === 'PLAYING' &&
      incoming.status === 'PLAYING' &&
      incoming.hostReady === existing.hostReady) ||
    // 6. PLAYING -> FINISHED (M7.3 FINAL GUARD Fix 1: requires valid recorded match result in private/signaling)
    (existing.status === 'PLAYING' &&
      incoming.status === 'FINISHED' &&
      incoming.hostReady === existing.hostReady &&
      hasValidMatchResult) ||
    // 7. PLAYING -> ABANDONED
    (existing.status === 'PLAYING' &&
      incoming.status === 'ABANDONED' &&
      incoming.hostReady === existing.hostReady);

  // Branch 1: Host Update (Only Host may update rtcConnectionState)
  const hostAllowedKeys = new Set([
    'status',
    'hostReady',
    'hostLastActiveAt',
    'rtcConnectionState',
    'disconnectReason',
  ]);

  if (
    authUid === existing.hostUid &&
    incoming.guestUid === existing.guestUid &&
    incoming.guestDisplayName === existing.guestDisplayName &&
    incoming.guestReady === existing.guestReady &&
    incoming.guestLastActiveAt === existing.guestLastActiveAt &&
    isHostTimestampValid &&
    isValidHostTransition &&
    affectedKeys.every((k) => hostAllowedKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'HOST_UPDATE' };
  }

  // Branch 2: Guest Join (Fix 1 & Fix 3: Guest CANNOT modify rtcConnectionState or disconnectReason; requires signalingExists)
  const guestJoinAllowedKeys = new Set([
    'guestUid',
    'guestDisplayName',
    'guestReady',
    'guestLastActiveAt',
  ]);
  if (
    isWaitingRoomNotExpired &&
    existing.guestUid === null &&
    authUid !== existing.hostUid &&
    incoming.guestUid === authUid &&
    typeof incoming.guestDisplayName === 'string' &&
    incoming.status === 'WAITING' &&
    incoming.guestReady === false &&
    incoming.guestLastActiveAt !== null &&
    isValidClientMillisTimestampModel(incoming.guestLastActiveAt, requestTimeMs) &&
    incoming.rtcConnectionState === existing.rtcConnectionState &&
    incoming.disconnectReason === existing.disconnectReason &&
    affectedKeys.every((k) => guestJoinAllowedKeys.has(k)) &&
    signalingExists
  ) {
    return { allowed: true, matchedBranch: 'GUEST_JOIN' };
  }

  // Branch 3: Guest Ready / Playing Heartbeat Update (M7.3.1: In WAITING may update guestReady & guestLastActiveAt; in PLAYING may ONLY update guestLastActiveAt)
  const guestWaitingAllowedKeys = new Set([
    'guestReady',
    'guestLastActiveAt',
  ]);
  const guestPlayingAllowedKeys = new Set([
    'guestLastActiveAt',
  ]);
  const isGuestWaitingReadyUpdate =
    isWaitingRoomNotExpired &&
    affectedKeys.every((k) => guestWaitingAllowedKeys.has(k));
  const isGuestPlayingHeartbeatUpdate =
    existing.status === 'PLAYING' &&
    incoming.guestReady === existing.guestReady &&
    affectedKeys.every((k) => guestPlayingAllowedKeys.has(k));

  if (
    existing.guestUid !== null &&
    authUid === existing.guestUid &&
    incoming.guestUid === existing.guestUid &&
    incoming.guestDisplayName === existing.guestDisplayName &&
    incoming.status === existing.status &&
    incoming.rtcConnectionState === existing.rtcConnectionState &&
    incoming.disconnectReason === existing.disconnectReason &&
    isGuestTimestampValid &&
    (isGuestWaitingReadyUpdate || isGuestPlayingHeartbeatUpdate)
  ) {
    return { allowed: true, matchedBranch: 'GUEST_READY_OR_STATE' };
  }

  // Branch 4: Guest Leave (Fix 1: Guest cannot change rtcConnectionState)
  const guestLeaveWaitingKeys = new Set([
    'guestUid',
    'guestDisplayName',
    'guestReady',
    'guestLastActiveAt',
  ]);
  const guestLeavePlayingKeys = new Set([
    'status',
    'guestLastActiveAt',
    'disconnectReason',
  ]);
  if (
    existing.guestUid !== null &&
    authUid === existing.guestUid &&
    incoming.rtcConnectionState === existing.rtcConnectionState
  ) {
    if (
      existing.status === 'WAITING' &&
      incoming.status === 'WAITING' &&
      incoming.guestUid === null &&
      incoming.guestDisplayName === null &&
      incoming.guestReady === false &&
      incoming.guestLastActiveAt === null &&
      incoming.disconnectReason === existing.disconnectReason &&
      affectedKeys.every((k) => guestLeaveWaitingKeys.has(k))
    ) {
      return { allowed: true, matchedBranch: 'GUEST_LEAVE_WAITING' };
    }
    if (
      existing.status === 'PLAYING' &&
      incoming.status === 'ABANDONED' &&
      incoming.guestUid === existing.guestUid &&
      incoming.guestDisplayName === existing.guestDisplayName &&
      incoming.guestReady === existing.guestReady &&
      isGuestTimestampValid &&
      affectedKeys.every((k) => guestLeavePlayingKeys.has(k))
    ) {
      return { allowed: true, matchedBranch: 'GUEST_LEAVE_PLAYING' };
    }
  }

  return { allowed: false, matchedBranch: null };
}

/**
 * Hàm kiểm thử đơn vị (Unit Test Model) cho quyền CREATE trên `/coop_rooms/{roomCode}/private/signaling`.
 * Lưu ý: Đây là hàm unit test trong bộ nhớ ứng dụng, KHÔNG thay thế Firebase Rules Emulator.
 */
export function evaluateCoopSignalingRuleCreate(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  roomCode: string;
  parentRoom: CoopRoomLobbyDocument | null;
  existingSignaling: CoopRoomSignalingDocument | null;
  incoming: CoopRoomSignalingDocument;
}): boolean {
  const {
    authUid,
    isVerifiedPersonalGmail,
    requestTimeMs,
    roomCode,
    parentRoom,
    existingSignaling,
    incoming,
  } = params;
  if (!authUid || !isVerifiedPersonalGmail) return false;
  if (existingSignaling !== null) return false; // Document already exists -> create denied
  if (!parentRoom) return false; // Parent room must exist
  if (!/^[A-Z0-9]{6}$/.test(roomCode) || incoming.roomCode !== roomCode) return false;
  if (parentRoom.hostUid !== authUid) return false;
  if (parentRoom.status !== 'WAITING') return false;
  if (requestTimeMs >= parentRoom.expiresAt) return false;
  if (parentRoom.guestUid !== null) return false;
  if (!isValidClientMillisTimestampModel(incoming.updatedAt, requestTimeMs)) return false;

  return (
    incoming.hostUid === parentRoom.hostUid &&
    incoming.guestUid === null &&
    incoming.rtcOffer === null &&
    incoming.rtcAnswer === null &&
    incoming.hostIceCandidates === null &&
    incoming.guestIceCandidates === null &&
    incoming.finalScore === 0 &&
    incoming.matchOutcome === null
  );
}

/**
 * Hàm kiểm thử đơn vị (Unit Test Model) cho quyền UPDATE trên `/coop_rooms/{roomCode}/private/signaling`.
 * Lưu ý: Đây là hàm unit test trong bộ nhớ ứng dụng, KHÔNG thay thế Firebase Rules Emulator.
 */
export function evaluateCoopSignalingRuleUpdate(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  roomCode: string;
  parentRoom: CoopRoomLobbyDocument | null;
  existing: CoopRoomSignalingDocument;
  incoming: CoopRoomSignalingDocument;
}): { allowed: boolean; matchedBranch: string | null } {
  const { authUid, isVerifiedPersonalGmail, requestTimeMs, roomCode, parentRoom, existing, incoming } =
    params;
  if (!authUid || !isVerifiedPersonalGmail || !parentRoom) {
    return { allowed: false, matchedBranch: null };
  }
  if (!/^[A-Z0-9]{6}$/.test(roomCode) || incoming.roomCode !== roomCode) {
    return { allowed: false, matchedBranch: null };
  }

  // Fix 2: Separate WAITING room TTL from PLAYING match state; block all terminal states (FINISHED/ABANDONED/EXPIRED)
  const isParentRoomActiveForSignaling =
    (parentRoom.status === 'WAITING' && requestTimeMs < parentRoom.expiresAt) ||
    parentRoom.status === 'PLAYING';
  if (!isParentRoomActiveForSignaling) {
    return { allowed: false, matchedBranch: null };
  }

  if (!isValidClientMillisTimestampModel(incoming.updatedAt, requestTimeMs)) {
    return { allowed: false, matchedBranch: null };
  }
  if (
    incoming.roomCode !== existing.roomCode ||
    incoming.hostUid !== existing.hostUid ||
    incoming.hostUid !== parentRoom.hostUid ||
    incoming.guestUid !== parentRoom.guestUid
  ) {
    return { allowed: false, matchedBranch: null };
  }

  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if ((existing as any)[k] !== (incoming as any)[k]) {
      affectedKeys.push(k);
    }
  }

  // Branch 1: Host WebRTC Signaling / Reset
  const hostSigKeys = new Set([
    'guestUid',
    'rtcOffer',
    'rtcAnswer',
    'hostIceCandidates',
    'guestIceCandidates',
    'updatedAt',
  ]);
  if (
    authUid === parentRoom.hostUid &&
    incoming.finalScore === existing.finalScore &&
    incoming.matchOutcome === existing.matchOutcome &&
    (incoming.rtcAnswer === existing.rtcAnswer || incoming.rtcAnswer === null) &&
    (incoming.guestIceCandidates === existing.guestIceCandidates ||
      incoming.guestIceCandidates === null) &&
    affectedKeys.every((k) => hostSigKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'HOST_SIGNALING_UPDATE' };
  }

  // Branch 2: Host Match Result Single-Write (only when parentRoom.status === 'PLAYING' and not yet written)
  const hostResultKeys = new Set(['finalScore', 'matchOutcome', 'updatedAt']);
  if (
    authUid === parentRoom.hostUid &&
    parentRoom.status === 'PLAYING' &&
    existing.matchOutcome === null &&
    existing.finalScore === 0 &&
    (incoming.matchOutcome === 'VICTORY' || incoming.matchOutcome === 'GAME_OVER') &&
    typeof incoming.finalScore === 'number' &&
    incoming.finalScore >= 0 &&
    incoming.rtcOffer === existing.rtcOffer &&
    incoming.rtcAnswer === existing.rtcAnswer &&
    incoming.hostIceCandidates === existing.hostIceCandidates &&
    incoming.guestIceCandidates === existing.guestIceCandidates &&
    affectedKeys.every((k) => hostResultKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'HOST_MATCH_RESULT_WRITE' };
  }

  // Branch 3: Joined Guest WebRTC Answer / Guest ICE
  const guestSigKeys = new Set(['guestUid', 'rtcAnswer', 'guestIceCandidates', 'updatedAt']);
  if (
    parentRoom.guestUid !== null &&
    authUid === parentRoom.guestUid &&
    incoming.rtcOffer === existing.rtcOffer &&
    incoming.hostIceCandidates === existing.hostIceCandidates &&
    incoming.finalScore === existing.finalScore &&
    incoming.matchOutcome === existing.matchOutcome &&
    affectedKeys.every((k) => guestSigKeys.has(k))
  ) {
    return { allowed: true, matchedBranch: 'GUEST_SIGNALING_UPDATE' };
  }

  return { allowed: false, matchedBranch: null };
}

export interface UserSessionRuleTestDoc {
  uid?: string;
  sessionId: string;
  deviceId: string;
  isActive: boolean;
  userAgentSummary: string;
  loginAtSec: number;
  lastActiveAtSec: number;
  expiresAtSec?: number;
}

/**
 * Hàm kiểm thử đơn vị (Unit Test Model) cho `/user_sessions/{uid}` theo chuẩn M7.1 + siết nhẹ M7.3 FINAL FIX:
 * - Tương thích tài liệu cũ không có `uid` hoặc có `expiresAt`, và tài liệu mới có `uid`.
 * - Không cho phép Heartbeat hoặc Logout sửa `expiresAt`.
 * - Bảo toàn First-Active-Session Wins (900s lease) và giới hạn Heartbeat 120s.
 * Lưu ý: Đây là hàm unit test trong bộ nhớ ứng dụng, KHÔNG thay thế Firebase Rules Emulator.
 */
export function evaluateUserSessionRuleUpdate(params: {
  docUid: string;
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeSec: number;
  existing: UserSessionRuleTestDoc;
  incoming: UserSessionRuleTestDoc;
}): { allowed: boolean; matchedBranch: string | null } {
  const { docUid, authUid, isVerifiedPersonalGmail, requestTimeSec, existing, incoming } = params;
  if (!authUid || !isVerifiedPersonalGmail || authUid !== docUid) {
    return { allowed: false, matchedBranch: null };
  }

  // Optional uid validation
  if (incoming.uid !== undefined && (incoming.uid !== docUid || incoming.uid !== authUid)) {
    return { allowed: false, matchedBranch: null };
  }
  if (existing.uid !== undefined && incoming.uid !== existing.uid) {
    return { allowed: false, matchedBranch: null };
  }

  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if ((existing as any)[k] !== (incoming as any)[k]) {
      const normalizedKey =
        k === 'loginAtSec'
          ? 'loginAt'
          : k === 'lastActiveAtSec'
            ? 'lastActiveAt'
            : k === 'expiresAtSec'
              ? 'expiresAt'
              : k;
      affectedKeys.push(normalizedKey);
    }
  }

  const isExistingStillActive =
    existing.isActive === true && requestTimeSec <= existing.lastActiveAtSec + 900;

  // 1. Heartbeat Action (strictly only ['lastActiveAt'] may change; modifying expiresAt is DENIED)
  if (
    existing.isActive === true &&
    isExistingStillActive &&
    requestTimeSec >= existing.lastActiveAtSec + 120 &&
    incoming.deviceId === existing.deviceId &&
    incoming.sessionId === existing.sessionId &&
    incoming.loginAtSec === existing.loginAtSec &&
    incoming.userAgentSummary === existing.userAgentSummary &&
    incoming.isActive === true &&
    incoming.lastActiveAtSec === requestTimeSec &&
    affectedKeys.every((k) => k === 'lastActiveAt')
  ) {
    return { allowed: true, matchedBranch: 'HEARTBEAT' };
  }

  // 2. Logout Action (strictly only ['isActive', 'lastActiveAt'] may change; modifying expiresAt is DENIED)
  const logoutAllowed = new Set(['isActive', 'lastActiveAt']);
  if (
    existing.isActive === true &&
    incoming.deviceId === existing.deviceId &&
    incoming.sessionId === existing.sessionId &&
    incoming.loginAtSec === existing.loginAtSec &&
    incoming.userAgentSummary === existing.userAgentSummary &&
    incoming.isActive === false &&
    incoming.lastActiveAtSec === requestTimeSec &&
    affectedKeys.every((k) => logoutAllowed.has(k))
  ) {
    return { allowed: true, matchedBranch: 'LOGOUT' };
  }

  // 3. New Session Acquisition Action (First-Active-Session Wins)
  const acquireAllowed = new Set([
    'uid',
    'sessionId',
    'deviceId',
    'isActive',
    'userAgentSummary',
    'loginAt',
    'lastActiveAt',
    'expiresAt',
  ]);
  if (
    (!isExistingStillActive || incoming.deviceId === existing.deviceId) &&
    incoming.isActive === true &&
    incoming.sessionId !== existing.sessionId &&
    incoming.loginAtSec === requestTimeSec &&
    incoming.lastActiveAtSec === requestTimeSec &&
    affectedKeys.every((k) => acquireAllowed.has(k))
  ) {
    return { allowed: true, matchedBranch: 'ACQUIRE_SESSION' };
  }

  return { allowed: false, matchedBranch: null };
}

/**
 * Hàm mô phỏng kiểm tra quyền đọc (get) trên `/coop_rooms/{roomCode}` và `/coop_rooms/{roomCode}/private/signaling`.
 */
export function evaluateCoopRoomReadAccess(params: {
  authUid: string | null;
  isVerifiedPersonalGmail: boolean;
  isSuperAdmin?: boolean;
  requestTimeMs: number;
  room: CoopRoomLobbyDocument | null;
  target: 'LOBBY_METADATA' | 'PRIVATE_SIGNALING';
}): boolean {
  const { authUid, isVerifiedPersonalGmail, isSuperAdmin, requestTimeMs, room, target } = params;
  if (!authUid || !isVerifiedPersonalGmail) return false;
  if (isSuperAdmin) return true;

  if (target === 'LOBBY_METADATA') {
    if (!room) return true; // Cho phép kiểm tra mã phòng không tồn tại
    if (authUid === room.hostUid) return true;
    if (room.guestUid !== null && authUid === room.guestUid) return true;
    // Người chưa vào phòng chỉ đọc được metadata tối thiểu khi phòng đang WAITING, chưa có Guest và chưa hết hạn
    return room.status === 'WAITING' && room.guestUid === null && requestTimeMs < room.expiresAt;
  }

  // target === 'PRIVATE_SIGNALING': Chỉ Host và Guest đã vào phòng mới được đọc Offer/Answer/ICE/Kết quả riêng
  if (!room) return false;
  return authUid === room.hostUid || (room.guestUid !== null && authUid === room.guestUid);
}

/**
 * In-memory storage adapter dùng cho kiểm thử tự động (M7.3 Test Harness)
 * có đếm số lượt đọc/ghi Firestore để xác minh không spam Firestore trong trận.
 */
export class InMemoryCoopStorageAdapter implements CoopStorageAdapter {
  private rooms: Map<string, CoopRoomLobbyDocument> = new Map();
  private signalingDocs: Map<string, CoopRoomSignalingDocument> = new Map();
  private roomListeners: Map<string, Set<(room: CoopRoomLobbyDocument | null) => void>> = new Map();
  private sigListeners: Map<string, Set<(sig: CoopRoomSignalingDocument | null) => void>> = new Map();
  private writeCount: number = 0;
  private readCount: number = 0;
  private failNextSetRoomError: Error | null = null;
  private failNextSetSignaling: boolean = false;
  private failNextSetSignalingError: Error | null = null;
  private failNextGetSignalingVerify: boolean = false;
  private failNextUpdateSignaling: boolean = false;
  private failNextUpdateRoom: boolean = false;
  private commitUpdateRoomThenLoseResponse: boolean = false;
  private failNextServerRead: boolean = false;
  private simulatedGetRoomError: Error | null = null;
  private simulatedGetRoomErrorRemainingCount: number = 0;
  private simulatedCollisionRemainingCount: number = 0;

  public setFailNextSetRoomError(err: Error | null): void {
    this.failNextSetRoomError = err;
  }

  public setFailNextSetSignaling(fail: boolean): void {
    this.failNextSetSignaling = fail;
  }

  public setFailNextSetSignalingError(err: Error | null): void {
    this.failNextSetSignalingError = err;
  }

  public setFailNextGetSignalingVerify(fail: boolean): void {
    this.failNextGetSignalingVerify = fail;
  }

  public setFailNextUpdateSignaling(fail: boolean): void {
    this.failNextUpdateSignaling = fail;
  }

  public setFailNextUpdateRoom(fail: boolean): void {
    this.failNextUpdateRoom = fail;
  }

  public setSimulatedGetRoomError(err: Error | null, count: number = 1): void {
    this.simulatedGetRoomError = err;
    this.simulatedGetRoomErrorRemainingCount = err ? Math.max(1, count) : 0;
  }

  public setSimulatedCollisionCount(count: number = 1): void {
    this.simulatedCollisionRemainingCount = Math.max(0, count);
  }

  /**
   * Mô phỏng tình huống Firebase đã commit thành công updateDoc(status: FINISHED) trên máy chủ
   * nhưng client bị mất kết nối / mất phản hồi trước khi nhận được ACK (Mục III - Trường hợp D).
   */
  public setCommitUpdateRoomThenLoseResponse(enable: boolean): void {
    this.commitUpdateRoomThenLoseResponse = enable;
  }

  public setFailNextServerRead(fail: boolean): void {
    this.failNextServerRead = fail;
  }

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

  public getRoomSync(roomCode: string): CoopRoomLobbyDocument | null {
    this.readCount++;
    if (this.simulatedGetRoomError && this.simulatedGetRoomErrorRemainingCount > 0) {
      this.simulatedGetRoomErrorRemainingCount--;
      const errToThrow = this.simulatedGetRoomError;
      if (this.simulatedGetRoomErrorRemainingCount === 0) {
        this.simulatedGetRoomError = null;
      }
      throw errToThrow;
    }
    if (this.simulatedCollisionRemainingCount > 0) {
      this.simulatedCollisionRemainingCount--;
      return {
        roomCode,
        status: 'WAITING',
        difficulty: 'DEFAULT',
        hostUid: 'uid_existing_host',
        hostDisplayName: 'Existing Host',
        hostReady: false,
        hostLastActiveAt: 1_700_000_000_000,
        guestUid: null,
        guestDisplayName: null,
        guestReady: false,
        guestLastActiveAt: null,
        rtcConnectionState: 'NEW',
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_810_000,
        disconnectReason: null,
      };
    }
    const r = this.rooms.get(roomCode);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  public getRoomFromServerSync(roomCode: string): CoopRoomLobbyDocument | null {
    if (this.failNextServerRead) {
      this.failNextServerRead = false;
      throw new Error('Simulated network failure during getDocFromServer');
    }
    return this.getRoomSync(roomCode);
  }

  public setRoomSync(roomCode: string, room: CoopRoomLobbyDocument): void {
    if (this.failNextSetRoomError) {
      const err = this.failNextSetRoomError;
      this.failNextSetRoomError = null;
      throw err;
    }
    this.writeCount++;
    const copy = JSON.parse(JSON.stringify(room));
    this.rooms.set(roomCode, copy);
    this.notifyRoom(roomCode);
  }

  public updateRoomSync(roomCode: string, partial: Partial<CoopRoomLobbyDocument>): void {
    if (this.failNextUpdateRoom) {
      this.failNextUpdateRoom = false;
      throw new Error('Simulated network failure during updateRoom');
    }
    const existing = this.rooms.get(roomCode);
    if (!existing) {
      throw new Error(`Room ${roomCode} does not exist`);
    }
    // Atomic Guest Join check (M7.3.7 Mục VI.5.5: ngăn 2 người chơi cùng vào vị trí P2 của 1 phòng trống)
    if (
      partial.guestUid !== undefined &&
      partial.guestUid !== null &&
      existing.guestUid !== null &&
      existing.guestUid !== partial.guestUid
    ) {
      const err = new Error('ROOM_FULL: Phòng đã đủ 2 người chơi.');
      (err as any).code = 'permission-denied';
      throw err;
    }
    // Enforce M7.3 FINAL GUARD Fix 1: PLAYING -> FINISHED requires valid recorded match result in private/signaling
    if (existing.status === 'PLAYING' && partial.status === 'FINISHED') {
      const sig = this.signalingDocs.get(roomCode);
      if (!hasValidRecordedMatchResultModel(roomCode, existing, sig, Boolean(sig))) {
        throw new Error(
          'PERMISSION_DENIED: Cannot transition room to FINISHED without valid recorded match result in private/signaling'
        );
      }
    }
    this.writeCount++;
    const updated: CoopRoomLobbyDocument = {
      ...existing,
      ...JSON.parse(JSON.stringify(partial)),
    };
    this.rooms.set(roomCode, updated);
    this.notifyRoom(roomCode);
    if (this.commitUpdateRoomThenLoseResponse) {
      this.commitUpdateRoomThenLoseResponse = false;
      throw new Error('Simulated response loss after Firebase committed updateRoom');
    }
  }

  public listRoomsSync(): CoopRoomLobbyDocument[] {
    this.readCount++;
    return Array.from(this.rooms.values()).map((r) => JSON.parse(JSON.stringify(r)));
  }

  public async listRooms(): Promise<CoopRoomLobbyDocument[]> {
    return this.listRoomsSync();
  }

  public async getRoom(roomCode: string): Promise<CoopRoomLobbyDocument | null> {
    return this.getRoomSync(roomCode);
  }

  public async getRoomFromServer(roomCode: string): Promise<CoopRoomLobbyDocument | null> {
    return this.getRoomFromServerSync(roomCode);
  }

  public async setRoom(roomCode: string, room: CoopRoomLobbyDocument): Promise<void> {
    this.setRoomSync(roomCode, room);
  }

  public async updateRoom(roomCode: string, partial: Partial<CoopRoomLobbyDocument>): Promise<void> {
    this.updateRoomSync(roomCode, partial);
  }

  public subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomLobbyDocument | null) => void
  ): () => void {
    if (!this.roomListeners.has(roomCode)) {
      this.roomListeners.set(roomCode, new Set());
    }
    const set = this.roomListeners.get(roomCode)!;
    set.add(onUpdate);
    this.readCount++;
    const current = this.rooms.get(roomCode);
    onUpdate(current ? JSON.parse(JSON.stringify(current)) : null);
    return () => {
      set.delete(onUpdate);
    };
  }

  public getSignalingSync(roomCode: string): CoopRoomSignalingDocument | null {
    this.readCount++;
    if (this.failNextGetSignalingVerify) {
      this.failNextGetSignalingVerify = false;
      return null;
    }
    const s = this.signalingDocs.get(roomCode);
    return s ? JSON.parse(JSON.stringify(s)) : null;
  }

  public getSignalingFromServerSync(roomCode: string): CoopRoomSignalingDocument | null {
    if (this.failNextServerRead) {
      this.failNextServerRead = false;
      throw new Error('Simulated network failure during getDocFromServer');
    }
    return this.getSignalingSync(roomCode);
  }

  public setSignalingSync(roomCode: string, sig: CoopRoomSignalingDocument): void {
    if (this.failNextSetSignalingError) {
      const err = this.failNextSetSignalingError;
      this.failNextSetSignalingError = null;
      throw err;
    }
    if (this.failNextSetSignaling) {
      this.failNextSetSignaling = false;
      throw new Error('Simulated network failure during setSignaling');
    }
    this.writeCount++;
    const copy = JSON.parse(JSON.stringify(sig));
    this.signalingDocs.set(roomCode, copy);
    this.notifySignaling(roomCode);
  }

  public updateSignalingSync(roomCode: string, partial: Partial<CoopRoomSignalingDocument>): void {
    if (this.failNextUpdateSignaling) {
      this.failNextUpdateSignaling = false;
      throw new Error('Simulated network failure during updateSignaling');
    }
    this.writeCount++;
    const existing = this.signalingDocs.get(roomCode);
    if (!existing) {
      throw new Error(`Signaling for room ${roomCode} does not exist`);
    }
    const updated: CoopRoomSignalingDocument = {
      ...existing,
      ...JSON.parse(JSON.stringify(partial)),
    };
    this.signalingDocs.set(roomCode, updated);
    this.notifySignaling(roomCode);
  }

  public async getSignaling(roomCode: string): Promise<CoopRoomSignalingDocument | null> {
    return this.getSignalingSync(roomCode);
  }

  public async getSignalingFromServer(roomCode: string): Promise<CoopRoomSignalingDocument | null> {
    return this.getSignalingFromServerSync(roomCode);
  }

  public async setSignaling(roomCode: string, sig: CoopRoomSignalingDocument): Promise<void> {
    this.setSignalingSync(roomCode, sig);
  }

  public async updateSignaling(roomCode: string, partial: Partial<CoopRoomSignalingDocument>): Promise<void> {
    this.updateSignalingSync(roomCode, partial);
  }

  public subscribeSignaling(
    roomCode: string,
    onUpdate: (sig: CoopRoomSignalingDocument | null) => void
  ): () => void {
    if (!this.sigListeners.has(roomCode)) {
      this.sigListeners.set(roomCode, new Set());
    }
    const set = this.sigListeners.get(roomCode)!;
    set.add(onUpdate);
    this.readCount++;
    const current = this.signalingDocs.get(roomCode);
    onUpdate(current ? JSON.parse(JSON.stringify(current)) : null);
    return () => {
      set.delete(onUpdate);
    };
  }

  private notifyRoom(roomCode: string): void {
    const set = this.roomListeners.get(roomCode);
    if (!set) return;
    const current = this.rooms.get(roomCode);
    const snapshot = current ? JSON.parse(JSON.stringify(current)) : null;
    set.forEach((cb) => {
      this.readCount++;
      cb(snapshot);
    });
  }

  private notifySignaling(roomCode: string): void {
    const set = this.sigListeners.get(roomCode);
    if (!set) return;
    const current = this.signalingDocs.get(roomCode);
    const snapshot = current ? JSON.parse(JSON.stringify(current)) : null;
    set.forEach((cb) => {
      this.readCount++;
      cb(snapshot);
    });
  }

  public clear(): void {
    this.rooms.clear();
    this.signalingDocs.clear();
    this.roomListeners.clear();
    this.sigListeners.clear();
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
 * Firestore storage adapter kết nối tới `/coop_rooms/{roomCode}` (Metadata công khai tối thiểu)
 * và `/coop_rooms/{roomCode}/private/signaling` (Signaling WebRTC & Kết quả riêng tư).
 */
export class FirestoreCoopStorageAdapter implements CoopStorageAdapter {
  private db = getFirebaseDb();

  public async getRoom(roomCode: string): Promise<CoopRoomLobbyDocument | null> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as CoopRoomLobbyDocument;
  }

  public async getRoomFromServer(roomCode: string): Promise<CoopRoomLobbyDocument | null> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return null;
    return snap.data() as CoopRoomLobbyDocument;
  }

  public async setRoom(roomCode: string, room: CoopRoomLobbyDocument): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    await setDoc(ref, room);
  }

  public async updateRoom(roomCode: string, partial: Partial<CoopRoomLobbyDocument>): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    await updateDoc(ref, partial as Record<string, any>);
  }

  public subscribeRoom(
    roomCode: string,
    onUpdate: (room: CoopRoomLobbyDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const ref = doc(this.db, 'coop_rooms', roomCode);
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
        } else {
          onUpdate(snap.data() as CoopRoomLobbyDocument);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
    return unsub;
  }

  public async getSignaling(roomCode: string): Promise<CoopRoomSignalingDocument | null> {
    const ref = doc(this.db, 'coop_rooms', roomCode, 'private', 'signaling');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as CoopRoomSignalingDocument;
  }

  public async getSignalingFromServer(roomCode: string): Promise<CoopRoomSignalingDocument | null> {
    const ref = doc(this.db, 'coop_rooms', roomCode, 'private', 'signaling');
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return null;
    return snap.data() as CoopRoomSignalingDocument;
  }

  public async setSignaling(roomCode: string, sig: CoopRoomSignalingDocument): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode, 'private', 'signaling');
    await setDoc(ref, sig);
  }

  public async updateSignaling(
    roomCode: string,
    partial: Partial<CoopRoomSignalingDocument>
  ): Promise<void> {
    const ref = doc(this.db, 'coop_rooms', roomCode, 'private', 'signaling');
    await updateDoc(ref, partial as Record<string, any>);
  }

  public subscribeSignaling(
    roomCode: string,
    onUpdate: (sig: CoopRoomSignalingDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const ref = doc(this.db, 'coop_rooms', roomCode, 'private', 'signaling');
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
        } else {
          onUpdate(snap.data() as CoopRoomSignalingDocument);
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
  private currentSignaling: CoopRoomSignalingDocument | null = null;
  private role: CoopPlayerRole = null;
  private unsubRoom: (() => void) | null = null;
  private unsubSignaling: (() => void) | null = null;
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
  private pendingRemoteIceCandidates: RTCIceCandidateInit[] = [];
  private lastPeerP2PActiveAt: number = 0;
  private lastPingSentAt: number = 0;

  // Sequencing & Rate-Limiting state (transmitted over WebRTC DataChannel)
  private guestOutgoingSeq: number = 0;
  private lastGuestInputSentAt: number = 0;
  private lastSentInputSignature: string = '';
  private hostLastProcessedGuestSeq: number = 0;
  private lastValidatedGuestInputReceivedAt: number = 0;
  private lastValidatedGuestInputClientTimestamp: number = 0;
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
  private isRecordingMatchFinishInFlight: boolean = false;

  // Guest Snapshot Application state
  private guestLastAppliedSnapshotSeq: number = 0;
  private guestLastAppliedStageRunSeq: number = 0;
  private guestLastAppliedTickCount: number = -1;
  private snapshotListeners: Set<(snapshot: CoopAuthoritativeSnapshot) => boolean | void> = new Set();

  // Spectator & Active Peer Leave Tracking (M7.3.9)
  private isLocalGuestSpectator: boolean = false;
  private isRemoteGuestSpectator: boolean = false;
  private processedPeerLeaveRoles: Set<'HOST' | 'GUEST'> = new Set();
  private lastPeerLeaveNotice: string | null = null;
  private peerLeaveListeners: Set<(event: { role: 'HOST' | 'GUEST'; message: string }) => void> = new Set();

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

  public isRoomSignalingReady(): boolean {
    return Boolean(
      this.currentRoom &&
        this.currentSignaling &&
        this.currentSignaling.roomCode === this.currentRoom.roomCode
    );
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

  public getGuestLastAppliedSnapshotSeq(): number {
    return this.guestLastAppliedSnapshotSeq;
  }

  public getGuestLastAppliedStageRunSeq(): number {
    return this.guestLastAppliedStageRunSeq;
  }

  public getGuestLastAppliedTickCount(): number {
    return this.guestLastAppliedTickCount;
  }

  public syncGuestAppliedSnapshotMeta(
    snapshotSeq: number,
    stageRunSeq: number,
    tickCount: number
  ): void {
    this.guestLastAppliedSnapshotSeq = snapshotSeq;
    this.guestLastAppliedStageRunSeq = stageRunSeq;
    this.guestLastAppliedTickCount = tickCount;
  }

  public clearLatchedGuestInput(): void {
    this.latestValidatedGuestInput = { ...NEUTRAL_INPUT };
    this.lastValidatedGuestInputReceivedAt = 0;
    this.lastValidatedGuestInputClientTimestamp = 0;
  }

  public getLatestValidatedGuestInput(nowMs?: number): InputState {
    if (this.hostLastProcessedGuestSeq <= 0) {
      return { ...NEUTRAL_INPUT };
    }
    if (typeof nowMs === 'number' && Number.isFinite(nowMs)) {
      const refTimestamp =
        this.lastValidatedGuestInputReceivedAt - nowMs > 1e9
          ? this.lastValidatedGuestInputClientTimestamp
          : this.lastValidatedGuestInputReceivedAt;
      const ageMs = nowMs - refTimestamp;
      if (ageMs > SIMULATION_CONFIG.GUEST_INPUT_MAX_AGE_MS) {
        return { ...NEUTRAL_INPUT };
      }
    }
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
    listener: (snapshot: CoopAuthoritativeSnapshot) => boolean | void
  ): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public setLocalGuestSpectator(isSpectator: boolean): void {
    this.isLocalGuestSpectator = Boolean(isSpectator);
  }

  public isGuestInSpectatorMode(): boolean {
    return this.isLocalGuestSpectator;
  }

  public setRemoteGuestSpectator(isSpectator: boolean): void {
    this.isRemoteGuestSpectator = Boolean(isSpectator);
    if (this.isRemoteGuestSpectator) {
      this.clearLatchedGuestInput();
    }
  }

  public subscribePeerLeave(
    listener: (event: { role: 'HOST' | 'GUEST'; message: string }) => void
  ): () => void {
    this.peerLeaveListeners.add(listener);
    return () => {
      this.peerLeaveListeners.delete(listener);
    };
  }

  public getLastPeerLeaveNotice(): string | null {
    return this.lastPeerLeaveNotice;
  }

  public hasPeerActivelyLeft(peerRole: 'HOST' | 'GUEST'): boolean {
    return this.processedPeerLeaveRoles.has(peerRole);
  }

  public recordPeerActiveLeave(leftRole: 'HOST' | 'GUEST', customReason?: string): boolean {
    if (this.processedPeerLeaveRoles.has(leftRole)) {
      return false;
    }
    this.processedPeerLeaveRoles.add(leftRole);
    const canonicalMessage = leftRole === 'HOST' ? 'P1 đã rời trận.' : 'P2 đã rời trận.';
    this.lastPeerLeaveNotice = canonicalMessage;
    if (leftRole === 'GUEST') {
      this.isRemoteGuestSpectator = true;
      this.clearLatchedGuestInput();
    }
    this.peerLeaveListeners.forEach((cb) => {
      try {
        cb({ role: leftRole, message: customReason ? canonicalMessage : canonicalMessage });
      } catch (e) {
        console.error('[CoopOnlineManager] peerLeaveListener error:', e);
      }
    });
    return true;
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

  private lastCreateRoomDiagnostic: CoopCreateRoomDiagnosticLog | null = null;

  public getLastCreateRoomDiagnostic(): CoopCreateRoomDiagnosticLog | null {
    return this.lastCreateRoomDiagnostic ? { ...this.lastCreateRoomDiagnostic } : null;
  }

  private recordCreateRoomDiagnostic(
    step: CoopRoomCreateStep,
    path: string,
    errorCode: CoopCreateRoomDiagnosticLog['errorCode'],
    rawErr?: unknown
  ): void {
    const anyErr = rawErr as { code?: string } | null | undefined;
    const firestoreCode = String(anyErr?.code || errorCode.toLowerCase());
    const entry: CoopCreateRoomDiagnosticLog = {
      step,
      path,
      errorCode,
      firestoreCode,
      timestampMs: Date.now(),
    };
    this.lastCreateRoomDiagnostic = entry;
    console.warn('[CoopOnlineManager][CreateRoomDiagnostic]', {
      step: entry.step,
      path: entry.path,
      errorCode: entry.errorCode,
      firestoreCode: entry.firestoreCode,
    });
  }

  /**
   * Tạo phòng Co-op Online mới với vai trò Chủ phòng (Host = P1) theo đúng 6 bước an toàn (M7.3.6 Mục IV.3):
   * 1. Kiểm tra người chơi đã đăng nhập hợp lệ.
   * 2. Tạo phòng cha `/coop_rooms/{roomCode}` theo đúng schema.
   * 3. Tạo tài liệu `/coop_rooms/{roomCode}/private/signaling` theo đúng schema.
   * 4. Xác minh signaling document thực sự tồn tại (`getSignaling(roomCode)`).
   * 5. Chỉ sau khi hoàn tất mới hiển thị mã phòng và trạng thái sẵn sàng.
   * 6. Nếu bước tạo hoặc xác minh signaling thất bại: đánh dấu phòng cha `ABANDONED`, dọn trạng thái giao diện,
   *    và không hiển thị phòng lỗi như phòng hợp lệ.
   */
  public async createRoom(
    user: {
      uid: string;
      displayName?: string | null;
      email?: string | null;
      emailVerified?: boolean;
      photoURL?: string | null;
    } | null,
    difficulty: 'DEFAULT' | 'EXTREME',
    explicitNowMs?: number,
    options?: CoopCreateRoomOptions
  ): Promise<CoopActionResult> {
    // Bước 1: Kiểm tra người chơi đã đăng nhập hợp lệ và dữ liệu đầu vào hợp lệ
    if (!user || !user.uid || typeof user.uid !== 'string' || user.uid.trim().length === 0) {
      this.recordCreateRoomDiagnostic('AUTH_PRECHECK', '/coop_rooms', 'UNAUTHENTICATED');
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        failedStep: 'AUTH_PRECHECK',
        message: 'Vui lòng đăng nhập Google trước khi tạo phòng Co-op Online.',
      };
    }

    if (user.email !== undefined && user.email !== null) {
      const normalizedEmail = user.email.trim().toLowerCase();
      if (!/^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/.test(normalizedEmail)) {
        this.recordCreateRoomDiagnostic('AUTH_PRECHECK', '/coop_rooms', 'UNAUTHENTICATED');
        return {
          success: false,
          errorCode: 'UNAUTHENTICATED',
          failedStep: 'AUTH_PRECHECK',
          message: 'Chỉ tài khoản Gmail cá nhân hợp lệ (@gmail.com) mới được phép tạo phòng Co-op Online.',
        };
      }
    }

    if (user.emailVerified === false) {
      this.recordCreateRoomDiagnostic('AUTH_PRECHECK', '/coop_rooms', 'UNAUTHENTICATED');
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        failedStep: 'AUTH_PRECHECK',
        message: 'Email tài khoản Google chưa được xác minh. Vui lòng sử dụng Gmail cá nhân đã xác minh.',
      };
    }

    if (difficulty !== 'DEFAULT' && difficulty !== 'EXTREME') {
      this.recordCreateRoomDiagnostic('AUTH_PRECHECK', '/coop_rooms', 'INVALID_DATA');
      return {
        success: false,
        errorCode: 'INVALID_DATA',
        failedStep: 'AUTH_PRECHECK',
        message: buildCreateRoomStepErrorMessage('AUTH_PRECHECK', 'INVALID_DATA'),
      };
    }

    const usePassword = Boolean(options?.hasPassword);
    let normalizedPassword = '';
    if (usePassword) {
      const pwdCheck = validateRoomPassword(options?.password);
      if (!pwdCheck.valid) {
        return {
          success: false,
          errorCode: 'INVALID_PASSWORD',
          failedStep: 'AUTH_PRECHECK',
          message: pwdCheck.message || 'Mật khẩu phòng không hợp lệ.',
        };
      }
      normalizedPassword = pwdCheck.normalized;
    }

    if (this.adapter instanceof FirestoreCoopStorageAdapter) {
      const sessionSnap = SessionManager.getInstance().getSnapshot();
      if (
        sessionSnap.status === 'DISPLACED' ||
        sessionSnap.status === 'EXPIRED' ||
        sessionSnap.status === 'NO_SESSION' ||
        sessionSnap.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED'
      ) {
        this.recordCreateRoomDiagnostic('AUTH_PRECHECK', '/coop_rooms', 'UNAUTHENTICATED');
        return {
          success: false,
          errorCode: 'UNAUTHENTICATED',
          failedStep: 'AUTH_PRECHECK',
          message:
            'Phiên đăng nhập trên thiết bị này không còn hiệu lực (M7.1). Vui lòng xác thực lại phiên trước khi tạo phòng.',
        };
      }
    }

    this.cleanupSubscription();
    this.closeWebRTC();
    this.currentRoom = null;
    this.currentSignaling = null;
    this.role = null;

    const lobbyWriteMs = explicitNowMs ?? Date.now();
    const triedCodes = new Set<string>();
    // Nếu là phòng công khai (options?.hasPassword === false được truyền tường minh), ưu tiên kiểm tra các slot Quick Join của bucket hiện tại trước
    const publicSlotCandidates =
      options?.hasPassword === false
        ? getPublicQuickJoinSlotCodesForBucket(Math.floor(lobbyWriteMs / (5 * 60 * 1000)))
        : [];
    let roomCode =
      publicSlotCandidates.length > 0 ? publicSlotCandidates[0] : generateRoomCode(triedCodes);
    let foundAvailableCode = false;

    try {
      for (
        let attempt = 0;
        attempt < COOP_ONLINE_CONFIG.MAX_CODE_GENERATION_ATTEMPTS;
        attempt++
      ) {
        triedCodes.add(roomCode);
        try {
          const existing = await this.adapter.getRoom(roomCode);
          // Bắt buộc chỉ dùng mã phòng CHƯA TỒN TẠI (!existing) để setDoc luôn đi vào nhánh allow create
          if (!existing) {
            foundAvailableCode = true;
            break;
          }
        } catch (getErr: any) {
          const classification = classifyGetRoomErrorDuringCreate(getErr);
          this.recordCreateRoomDiagnostic(
            'PRECHECK_ROOM_CODE',
            `/coop_rooms/${roomCode}`,
            classification,
            getErr
          );
          return {
            success: false,
            errorCode: classification,
            failedStep: 'PRECHECK_ROOM_CODE',
            message: buildCreateRoomStepErrorMessage('PRECHECK_ROOM_CODE', classification),
          };
        }
        const nextPublicSlot = publicSlotCandidates.find((c) => !triedCodes.has(c));
        roomCode = nextPublicSlot ?? generateRoomCode(triedCodes);
      }

      if (!foundAvailableCode) {
        return {
          success: false,
          errorCode: 'ROOM_FULL',
          failedStep: 'PRECHECK_ROOM_CODE',
          message: 'Không thể cấp phát mã phòng trống sau 5 lần thử. Vui lòng thử tạo phòng lại.',
        };
      }

      const safeTtlMs =
        COOP_ONLINE_CONFIG.ROOM_TTL_MS - COOP_ONLINE_CONFIG.CLOCK_SKEW_BUFFER_MS;
      const cleanHostName = (getUserDisplayLabel(user) || 'Commander').trim().slice(0, 80);
      const encodedHostDisplayName = encodeHostDisplayNameWithLock(
        cleanHostName,
        roomCode,
        usePassword,
        normalizedPassword
      );

      const newLobby: CoopRoomLobbyDocument = {
        roomCode,
        status: 'WAITING',
        difficulty,
        hostUid: user.uid,
        hostDisplayName: encodedHostDisplayName,
        hostReady: false,
        hostLastActiveAt: lobbyWriteMs,
        guestUid: null,
        guestDisplayName: null,
        guestReady: false,
        guestLastActiveAt: null,
        rtcConnectionState: 'NEW',
        createdAt: lobbyWriteMs,
        expiresAt: lobbyWriteMs + safeTtlMs,
        disconnectReason: null,
      };

      // Bước 2: Tạo phòng cha /coop_rooms/{roomCode} theo đúng schema
      try {
        await this.adapter.setRoom(roomCode, newLobby);
      } catch (createParentErr: any) {
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const parentClass = classifyGetRoomErrorDuringCreate(createParentErr);
        this.recordCreateRoomDiagnostic(
          'CREATE_PARENT_ROOM',
          `/coop_rooms/${roomCode}`,
          parentClass,
          createParentErr
        );
        return {
          success: false,
          errorCode: parentClass,
          failedStep: 'CREATE_PARENT_ROOM',
          message: buildCreateRoomStepErrorMessage('CREATE_PARENT_ROOM', parentClass),
        };
      }

      const sigWriteMs = explicitNowMs ?? Date.now();
      const newSignaling: CoopRoomSignalingDocument = {
        roomCode,
        hostUid: user.uid,
        guestUid: null,
        rtcOffer: null,
        rtcAnswer: null,
        hostIceCandidates: null,
        guestIceCandidates: null,
        finalScore: 0,
        matchOutcome: null,
        updatedAt: sigWriteMs,
      };

      // Bước 3: Tạo tài liệu /coop_rooms/{roomCode}/private/signaling theo đúng schema
      try {
        await this.adapter.setSignaling(roomCode, newSignaling);
      } catch (sigErr: any) {
        // Bước 6: Nếu tạo signaling thất bại -> đánh dấu phòng cha ABANDONED, dọn trạng thái giao diện
        try {
          await this.adapter.updateRoom(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: explicitNowMs ?? Date.now(),
            disconnectReason: 'Không thể khởi tạo kênh signaling riêng tư cho phòng.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const sigClass = classifyGetRoomErrorDuringCreate(sigErr);
        this.recordCreateRoomDiagnostic(
          'CREATE_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          sigClass,
          sigErr
        );
        return {
          success: false,
          errorCode: sigClass,
          failedStep: 'CREATE_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('CREATE_SIGNALING_DOC', sigClass),
        };
      }

      // Bước 4: Xác minh signaling document thực sự tồn tại trên Firestore
      let verifiedSig: CoopRoomSignalingDocument | null = null;
      try {
        verifiedSig = await this.adapter.getSignaling(roomCode);
      } catch (verifyErr: any) {
        try {
          await this.adapter.updateRoom(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: explicitNowMs ?? Date.now(),
            disconnectReason: 'Không thể xác minh kênh signaling riêng tư của phòng.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const verifyClass = classifyGetRoomErrorDuringCreate(verifyErr);
        this.recordCreateRoomDiagnostic(
          'VERIFY_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          verifyClass,
          verifyErr
        );
        return {
          success: false,
          errorCode: verifyClass,
          failedStep: 'VERIFY_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('VERIFY_SIGNALING_DOC', verifyClass),
        };
      }

      if (
        !verifiedSig ||
        verifiedSig.roomCode !== roomCode ||
        verifiedSig.hostUid !== user.uid
      ) {
        try {
          await this.adapter.updateRoom(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: explicitNowMs ?? Date.now(),
            disconnectReason: 'Tài liệu signaling riêng tư không tồn tại sau khi khởi tạo.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        this.recordCreateRoomDiagnostic(
          'VERIFY_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          'NETWORK_ERROR',
          { code: 'signaling-missing-after-create' }
        );
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          failedStep: 'VERIFY_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('VERIFY_SIGNALING_DOC', 'NETWORK_ERROR'),
        };
      }

      // Bước 5: Chỉ sau khi xác minh hoàn tất mới công bố mã phòng và trạng thái sẵn sàng
      this.lastCreateRoomDiagnostic = null;
      this.currentSignaling = verifiedSig;
      this.currentRoom = mergeLobbyAndSignaling(newLobby, verifiedSig);
      this.role = 'HOST';
      this.resetSyncCounters();
      this.listenToRoom(roomCode);
      this.notifyListeners();

      return {
        success: true,
        room: this.currentRoom,
      };
    } catch (err: any) {
      this.currentRoom = null;
      this.currentSignaling = null;
      this.role = null;
      this.notifyListeners();
      const classification = classifyGetRoomErrorDuringCreate(err);
      this.recordCreateRoomDiagnostic(
        'CREATE_PARENT_ROOM',
        `/coop_rooms/${roomCode}`,
        classification,
        err
      );
      return {
        success: false,
        errorCode: classification,
        failedStep: 'CREATE_PARENT_ROOM',
        message: buildCreateRoomStepErrorMessage('CREATE_PARENT_ROOM', classification),
      };
    }
  }

  /**
   * Tham gia phòng Co-op Online bằng mã phòng 6 ký tự với vai trò Khách (Guest = P2).
   * - Guest chỉ cập nhật `guestUid`, `guestDisplayName`, `guestReady` và `guestLastActiveAt`
   *   (giữ nguyên `rtcConnectionState` và `disconnectReason`, chỉ Host mới cập nhật `rtcConnectionState`).
   * - Bắt buộc `private/signaling` phải tồn tại (Rules kiểm tra `signalingDocExists(roomCode)` và client xác nhận `getSignaling`).
   * - Nếu phòng có mật khẩu (`hasPassword === true`), bắt buộc kiểm tra mật khẩu trước khi cập nhật `guestUid`.
   */
  public async joinRoom(
    rawRoomCode: string,
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
    nowMs: number = Date.now(),
    options?: CoopJoinRoomOptions
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
      const joinCandidate = evaluateJoinRoomCandidate(room, normalized, user, nowMs, true, options);
      if (!joinCandidate.success || !room) {
        return joinCandidate;
      }

      this.cleanupSubscription();
      this.closeWebRTC();

      // Fix 1: Guest chỉ được cập nhật 4 trường của Guest, giữ nguyên rtcConnectionState và disconnectReason
      const updatedFields: Partial<CoopRoomLobbyDocument> = {
        guestUid: user.uid,
        guestDisplayName: getUserDisplayLabel(user),
        guestReady: false,
        guestLastActiveAt: nowMs,
      };

      try {
        await this.adapter.updateRoom(normalized, updatedFields);
      } catch (updateErr: any) {
        const msg = String(updateErr?.message || '');
        if (msg.includes('ROOM_FULL') || String(updateErr?.code || '').includes('permission-denied')) {
          return {
            success: false,
            errorCode: 'ROOM_FULL',
            message: 'Phòng đã đủ 2 người chơi hoặc vừa có người chơi khác tham gia.',
          };
        }
        throw updateErr;
      }

      // Kiểm tra lại trạng thái trên máy chủ để đảm bảo vị trí P2 thuộc về user.uid (chống 2 người vào cùng lúc)
      try {
        const serverCheck = await this.adapter.getRoomFromServer(normalized);
        if (serverCheck && serverCheck.guestUid !== user.uid) {
          return {
            success: false,
            errorCode: 'ROOM_FULL',
            message: 'Phòng vừa được người chơi khác tham gia trước bạn.',
          };
        }
      } catch {
        // Ignore transient server check failure if updateRoom succeeded
      }

      // Fix 3: Xác minh tài liệu private/signaling đã tồn tại sau khi vào phòng
      const existingSig = await this.adapter.getSignaling(normalized);
      if (!existingSig) {
        try {
          await this.adapter.updateRoom(normalized, {
            guestUid: null,
            guestDisplayName: null,
            guestReady: false,
            guestLastActiveAt: null,
          });
        } catch {
          // Ignore rollback error
        }
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Phòng chơi chưa khởi tạo xong dữ liệu kết nối bảo mật (thiếu signaling). Vui lòng thử lại.',
        };
      }

      const syncedSig: CoopRoomSignalingDocument = {
        ...existingSig,
        guestUid: user.uid,
        updatedAt: nowMs,
      };
      try {
        await this.adapter.updateSignaling(normalized, {
          guestUid: user.uid,
          updatedAt: nowMs,
        });
      } catch {
        // Host will also sync guestUid on signaling when creating WebRTC offer
      }

      const mergedLobby: CoopRoomLobbyDocument = {
        ...room,
        ...updatedFields,
      };
      const updatedRoom: CoopRoomDocument = mergeLobbyAndSignaling(mergedLobby, syncedSig);

      this.currentSignaling = syncedSig;
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
   * Vào nhanh (Quick Join - M7.3.7 Mục VI.5.3.A):
   * - Chỉ tìm phòng công khai (Không mật khẩu) thỏa mãn đồng thời:
   *   1. `status === 'WAITING'`
   *   2. `!hasPassword`
   *   3. `guestUid === null` (mới có P1, chưa có P2)
   *   4. `nowMs < expiresAt` (chưa hết hạn)
   *   5. Có signaling hợp lệ
   *   6. `hostUid !== user.uid`
   * - Nếu không có phòng thỏa điều kiện -> trả về `NO_AVAILABLE_PUBLIC_ROOM` ("Hiện chưa có phòng trống").
   */
  public async quickJoinRoom(
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

    try {
      const candidateRooms: CoopRoomLobbyDocument[] = [];
      const seenCodes = new Set<string>();

      if (typeof this.adapter.listRooms === 'function') {
        const allRooms = await this.adapter.listRooms();
        for (const r of allRooms) {
          if (r && r.roomCode && !seenCodes.has(r.roomCode)) {
            seenCodes.add(r.roomCode);
            candidateRooms.push(r);
          }
        }
      }

      const publicCodes = getPublicQuickJoinCandidateCodes(nowMs);
      for (const code of publicCodes) {
        if (seenCodes.has(code)) continue;
        seenCodes.add(code);
        try {
          const r = await this.adapter.getRoom(code);
          if (r) {
            candidateRooms.push(r);
          }
        } catch {
          // Ignore individual slot read error
        }
      }

      const eligibleRooms = candidateRooms
        .filter((r) => {
          const lockInfo = decodeHostDisplayNameAndLock(r.hostDisplayName);
          return (
            r.status === 'WAITING' &&
            !lockInfo.hasPassword &&
            r.guestUid === null &&
            nowMs < r.expiresAt &&
            r.hostUid !== user.uid
          );
        })
        .sort((a, b) => a.createdAt - b.createdAt);

      if (eligibleRooms.length === 0) {
        return {
          success: false,
          errorCode: 'NO_AVAILABLE_PUBLIC_ROOM',
          message: 'Hiện chưa có phòng trống',
        };
      }

      for (const candidate of eligibleRooms) {
        const joinRes = await this.joinRoom(candidate.roomCode, user, nowMs);
        if (joinRes.success) {
          return joinRes;
        }
      }

      return {
        success: false,
        errorCode: 'NO_AVAILABLE_PUBLIC_ROOM',
        message: 'Hiện chưa có phòng trống',
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Lỗi kết nối khi tìm phòng trống.',
      };
    }
  }

  /**
   * Đặt trạng thái Sẵn sàng (Ready) cho P1 (Host) hoặc P2 (Guest) (Sửa lỗi Hạng mục 6 - M7.3.7).
   */
  public async setPlayerReady(ready: boolean, nowMs: number = Date.now()): Promise<CoopActionResult> {
    if (!this.currentRoom || !this.role) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Chưa ở trong phòng Co-op Online.',
      };
    }

    const code = this.currentRoom.roomCode;
    try {
      const latestRoom = await this.adapter.getRoom(code);
      if (!latestRoom) {
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy phòng chơi trên hệ thống.',
        };
      }

      if (
        latestRoom.status === 'EXPIRED' ||
        latestRoom.status === 'ABANDONED' ||
        latestRoom.status === 'FINISHED' ||
        (latestRoom.status === 'WAITING' && nowMs >= latestRoom.expiresAt)
      ) {
        return {
          success: false,
          errorCode: 'ROOM_EXPIRED',
          message: 'Phòng chờ đã hết hạn hoặc đã đóng.',
        };
      }

      if (latestRoom.status !== 'WAITING') {
        return {
          success: false,
          errorCode: 'MATCH_ALREADY_STARTED',
          message: 'Trận đấu đã bắt đầu, không thể thay đổi trạng thái Sẵn sàng.',
        };
      }

      if (this.role === 'GUEST') {
        if (!latestRoom.guestUid || latestRoom.guestUid !== this.currentRoom.guestUid) {
          return {
            success: false,
            errorCode: 'INVALID_ROOM_STATE',
            message: 'Người chơi 2 chưa được ghi nhận hợp lệ trong phòng.',
          };
        }
      }

      const nextReady = Boolean(ready);
      const partial: Partial<CoopRoomLobbyDocument> =
        this.role === 'HOST'
          ? { hostReady: nextReady, hostLastActiveAt: nowMs }
          : { guestReady: nextReady, guestLastActiveAt: nowMs };

      await this.adapter.updateRoom(code, partial);
      const mergedLobby: CoopRoomLobbyDocument = {
        ...latestRoom,
        ...partial,
      };
      this.currentRoom = mergeLobbyAndSignaling(mergedLobby, this.currentSignaling);
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
   * Chủ phòng (Host) bắt đầu trận đấu khi phòng WAITING chưa hết hạn, đã có private/signaling,
   * cả 2 người chơi đã kết nối P2P (CONNECTED) và xác nhận Sẵn sàng.
   */
  public async startOnlineMatch(
    callerUid: string,
    initialGameState?: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    let sigExists = Boolean(this.currentSignaling);
    if (!sigExists && this.currentRoom) {
      try {
        const fetchedSig = await this.adapter.getSignaling(this.currentRoom.roomCode);
        if (fetchedSig) {
          this.currentSignaling = fetchedSig;
          sigExists = true;
        }
      } catch {
        sigExists = false;
      }
    }

    const check = evaluateStartMatchCandidate(
      this.currentRoom,
      callerUid,
      this.role,
      nowMs,
      sigExists
    );
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

    const partial: Partial<CoopRoomLobbyDocument> = {
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

    if (this.isLocalGuestSpectator) {
      return {
        success: false,
        errorCode: 'INVALID_ROOM_STATE',
        message: 'Bạn đã hết mạng, đang ở chế độ khán giả (không gửi gói điều khiển P2).',
      };
    }

    const sig = `${input.up ? 1 : 0}${input.down ? 1 : 0}${input.left ? 1 : 0}${input.right ? 1 : 0}${input.shoot ? 1 : 0}`;
    const elapsedSinceLast = nowMs - this.lastGuestInputSentAt;

    // Resend periodic input keepalive every 200ms over P2P DataChannel so transient packet loss never sticks keys
    if (
      !forceSend &&
      sig === this.lastSentInputSignature &&
      elapsedSinceLast < COOP_ONLINE_CONFIG.INPUT_KEEPALIVE_INTERVAL_MS
    ) {
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
   * Bỏ qua gói tin trùng lặp, sai thứ tự (`seq <= hostLastProcessedGuestSeq`), hoặc khi P2 đã ở chế độ khán giả / rời trận.
   */
  public processIncomingGuestInput(
    rawPacket: unknown,
    nowMs: number = Date.now()
  ): { accepted: boolean; input?: InputState; errorCode?: CoopActionResult['errorCode'] } {
    if (this.isRemoteGuestSpectator || this.processedPeerLeaveRoles.has('GUEST')) {
      this.clearLatchedGuestInput();
      return { accepted: false, errorCode: 'INVALID_ROOM_STATE' };
    }

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
    this.lastValidatedGuestInputReceivedAt = nowMs;
    this.lastValidatedGuestInputClientTimestamp = packet.clientTimestamp;
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

  public hasRecordedMatchFinish(): boolean {
    return this.hasRecordedMatchFinishInFirestore;
  }

  /**
   * Ghi kết quả trận đấu và đóng phòng sang trạng thái FINISHED một cách an toàn, có thể thử lại (Fix 5 & M7.3 FINAL GUARD Fix 2):
   * - Trường hợp A (Chưa ghi kết quả): Đọc private/signaling từ máy chủ; nếu matchOutcome == null && finalScore == 0,
   *   ghi kết quả đúng 1 lần, xác nhận kết quả đã lưu rồi đóng phòng FINISHED.
   * - Trường hợp B (Kết quả đã ghi ở lần thử trước khi phòng vẫn PLAYING): Nếu finalScore và matchOutcome trùng khớp
   *   chính xác, KHÔNG ghi lại signaling và tiếp tục chuyển phòng cha sang FINISHED.
   * - Trường hợp C & D (Phòng đã FINISHED trên máy chủ nhưng client mất phản hồi ở lần gọi trước):
   *   Đọc trạng thái phòng cha bằng getDocFromServer(); nếu status == 'FINISHED' và kết quả trong private/signaling
   *   trùng khớp chính xác với kết quả cần xác nhận -> đặt hasRecordedMatchFinishInFirestore = true và trả về thành công
   *   mà KHÔNG gửi lệnh updateDoc(status: 'FINISHED') lần thứ hai.
   * - Trường hợp E (Trạng thái xung đột hoặc lỗi mạng):
   *   + Nếu phòng ABANDONED hoặc EXPIRED -> dừng và trả lỗi ROOM_EXPIRED.
   *   + Nếu phòng FINISHED nhưng thiếu kết quả hoặc kết quả không khớp -> trả lỗi INVALID_PACKET, không đặt cờ hoàn tất.
   *   + Nếu kết quả signaling khác kết quả cần ghi -> tuyệt đối không ghi đè, trả lỗi INVALID_PACKET.
   *   + Nếu mất mạng không thể đọc xác nhận -> giữ hasRecordedMatchFinishInFirestore = false, trả lỗi NETWORK_ERROR.
   */
  public async recordMatchFinish(
    finalScore: number,
    matchOutcome: 'VICTORY' | 'GAME_OVER',
    nowMs: number = Date.now()
  ): Promise<CoopActionResult> {
    if (!this.currentRoom) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng chơi hiện tại.',
      };
    }

    if (this.role !== 'HOST') {
      return {
        success: false,
        errorCode: 'NOT_HOST',
        message: 'Chỉ Chủ phòng (P1) mới có quyền ghi nhận kết quả trận đấu.',
      };
    }

    if (
      (matchOutcome !== 'VICTORY' && matchOutcome !== 'GAME_OVER') ||
      typeof finalScore !== 'number' ||
      !Number.isInteger(finalScore) ||
      finalScore < 0 ||
      finalScore > 9999999
    ) {
      return {
        success: false,
        errorCode: 'INVALID_PACKET',
        message: 'Dữ liệu kết quả trận đấu không hợp lệ.',
      };
    }

    const roomCode = this.currentRoom.roomCode;

    try {
      // Đọc trạng thái phòng cha và private/signaling trực tiếp từ máy chủ (getDocFromServer)
      const serverRoom = await this.adapter.getRoomFromServer(roomCode);
      if (!serverRoom) {
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy tài liệu phòng cha trên máy chủ.',
        };
      }

      const existingSig = await this.adapter.getSignalingFromServer(roomCode);
      if (!existingSig) {
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy tài liệu signaling bảo mật để lưu kết quả.',
        };
      }

      // Trường hợp E1: Phòng đã ở trạng thái hủy hoặc hết hạn (ABANDONED / EXPIRED)
      if (serverRoom.status === 'ABANDONED' || serverRoom.status === 'EXPIRED') {
        return {
          success: false,
          errorCode: 'ROOM_EXPIRED',
          message: `Phòng chơi đã ở trạng thái ${serverRoom.status}, không thể xác nhận kết thúc trận.`,
        };
      }

      // Trường hợp C & D (hoặc E2): Phòng trên máy chủ đã ở trạng thái FINISHED
      if (serverRoom.status === 'FINISHED') {
        const hasValidResult = hasValidRecordedMatchResultModel(
          roomCode,
          serverRoom,
          existingSig,
          true
        );
        if (
          hasValidResult &&
          existingSig.matchOutcome === matchOutcome &&
          existingSig.finalScore === finalScore
        ) {
          // Trường hợp C & D: Kết quả trên máy chủ hợp lệ và trùng khớp chính xác -> xác nhận thành công, 0 lượt ghi thêm
          this.hasRecordedMatchFinishInFirestore = true;
          this.currentSignaling = existingSig;
          this.currentRoom = {
            ...serverRoom,
            ...existingSig,
            status: 'FINISHED',
            finalScore,
            matchOutcome,
          };
          this.notifyListeners();
          return {
            success: true,
            room: this.currentRoom,
          };
        }

        // Trường hợp E2: Phòng đã FINISHED nhưng thiếu kết quả hoặc kết quả không khớp -> báo lỗi xung đột, không đặt cờ hoàn tất
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message:
            'Xung đột trạng thái: Phòng đã FINISHED nhưng kết quả trong private/signaling không tồn tại hoặc không khớp.',
        };
      }

      if (serverRoom.status !== 'PLAYING') {
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: `Phòng đang ở trạng thái ${serverRoom.status}, chưa thể kết thúc trận đấu.`,
        };
      }

      // Kiểm tra định danh phòng giữa private/signaling và phòng cha
      if (
        existingSig.roomCode !== roomCode ||
        existingSig.hostUid !== serverRoom.hostUid ||
        serverRoom.guestUid === null ||
        existingSig.guestUid !== serverRoom.guestUid
      ) {
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: 'Thông tin định danh phòng trong private/signaling không khớp với phòng cha.',
        };
      }

      if (existingSig.matchOutcome === null && existingSig.finalScore === 0) {
        // Trường hợp A: Ghi kết quả lần đầu vào private/signaling
        await this.adapter.updateSignaling(roomCode, {
          finalScore,
          matchOutcome,
          updatedAt: nowMs,
        });
        const verifiedSig = await this.adapter.getSignalingFromServer(roomCode);
        if (
          !hasValidRecordedMatchResultModel(roomCode, serverRoom, verifiedSig, Boolean(verifiedSig)) ||
          verifiedSig!.matchOutcome !== matchOutcome ||
          verifiedSig!.finalScore !== finalScore
        ) {
          return {
            success: false,
            errorCode: 'NETWORK_ERROR',
            message: 'Chưa thể xác nhận kết quả trận đấu trên private/signaling.',
          };
        }
        this.currentSignaling = verifiedSig;
        this.currentRoom = {
          ...this.currentRoom,
          finalScore,
          matchOutcome,
        };
      } else if (
        existingSig.matchOutcome === matchOutcome &&
        existingSig.finalScore === finalScore
      ) {
        // Trường hợp B: Đã ghi đúng kết quả ở lần thử trước -> không ghi lại signaling, giữ kết quả đã lưu
        this.currentSignaling = existingSig;
        this.currentRoom = {
          ...this.currentRoom,
          finalScore: existingSig.finalScore,
          matchOutcome: existingSig.matchOutcome,
        };
      } else {
        // Trường hợp E3: Signaling đã có kết quả khác -> dừng thao tác và báo lỗi rõ ràng, tuyệt đối không ghi đè
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: `Xung đột kết quả trận đấu: Kết quả đã xác nhận (${existingSig.matchOutcome}, ${existingSig.finalScore}) khác với kết quả yêu cầu ghi (${matchOutcome}, ${finalScore}).`,
        };
      }

      // Chuyển phòng cha từ PLAYING sang FINISHED
      await this.adapter.updateRoom(roomCode, {
        status: 'FINISHED',
        hostLastActiveAt: nowMs,
      });

      // Đọc xác nhận trạng thái phòng cha từ máy chủ trước khi đặt cờ hoàn tất
      const confirmedRoom = await this.adapter.getRoomFromServer(roomCode);
      if (!confirmedRoom || confirmedRoom.status !== 'FINISHED') {
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          message: 'Chưa thể xác nhận trạng thái FINISHED của phòng cha. Có thể thử lại an toàn.',
        };
      }

      this.hasRecordedMatchFinishInFirestore = true;
      this.currentRoom = {
        ...confirmedRoom,
        ...(this.currentSignaling || {}),
        status: 'FINISHED',
        finalScore,
        matchOutcome,
      };
      this.notifyListeners();

      return {
        success: true,
        room: this.currentRoom,
      };
    } catch (err: any) {
      // Trường hợp E4: Nếu mất mạng không thể đọc/ghi xác nhận -> giữ trạng thái chưa xác nhận (hasRecordedMatchFinishInFirestore = false)
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message:
          err?.message ||
          'Lỗi mạng trong quá trình kết thúc trận đấu. Kết quả đã lưu trong signaling được bảo toàn để thử lại.',
      };
    }
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động với InMemoryCoopStorageAdapter cho quy trình tạo phòng (Fix 3).
   */
  public createRoomSync(
    storage: InMemoryCoopStorageAdapter,
    user: {
      uid: string;
      displayName?: string | null;
      email?: string | null;
      emailVerified?: boolean;
      photoURL?: string | null;
    } | null,
    difficulty: 'DEFAULT' | 'EXTREME',
    nowMs: number = Date.now(),
    explicitRoomCode?: string,
    options?: CoopCreateRoomOptions
  ): CoopActionResult {
    if (!user || !user.uid) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Vui lòng đăng nhập Google trước khi tạo phòng Co-op Online.',
      };
    }

    if (user.email !== undefined && user.email !== null) {
      const normalizedEmail = user.email.trim().toLowerCase();
      if (!/^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/.test(normalizedEmail)) {
        return {
          success: false,
          errorCode: 'UNAUTHENTICATED',
          message: 'Chỉ tài khoản Gmail cá nhân hợp lệ (@gmail.com) mới được phép tạo phòng Co-op Online.',
        };
      }
    }

    if (user.emailVerified === false) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Email tài khoản Google chưa được xác minh. Vui lòng sử dụng Gmail cá nhân đã xác minh.',
      };
    }

    if (difficulty !== 'DEFAULT' && difficulty !== 'EXTREME') {
      return {
        success: false,
        errorCode: 'INVALID_DATA',
        failedStep: 'AUTH_PRECHECK',
        message: buildCreateRoomStepErrorMessage('AUTH_PRECHECK', 'INVALID_DATA'),
      };
    }

    const usePassword = Boolean(options?.hasPassword);
    let normalizedPassword = '';
    if (usePassword) {
      const pwdCheck = validateRoomPassword(options?.password);
      if (!pwdCheck.valid) {
        return {
          success: false,
          errorCode: 'INVALID_PASSWORD',
          failedStep: 'AUTH_PRECHECK',
          message: pwdCheck.message || 'Mật khẩu phòng không hợp lệ.',
        };
      }
      normalizedPassword = pwdCheck.normalized;
    }

    this.cleanupSubscription();
    this.closeWebRTC();
    this.currentRoom = null;
    this.currentSignaling = null;
    this.role = null;

    const triedCodes = new Set<string>();
    const publicSlotCandidates =
      !explicitRoomCode && options?.hasPassword === false
        ? getPublicQuickJoinSlotCodesForBucket(Math.floor(nowMs / (5 * 60 * 1000)))
        : [];
    let roomCode =
      explicitRoomCode ??
      (publicSlotCandidates.length > 0 ? publicSlotCandidates[0] : generateRoomCode(triedCodes));
    let foundAvailableCode = Boolean(explicitRoomCode);

    if (!explicitRoomCode) {
      for (
        let attempt = 0;
        attempt < COOP_ONLINE_CONFIG.MAX_CODE_GENERATION_ATTEMPTS;
        attempt++
      ) {
        triedCodes.add(roomCode);
        try {
          const existing = storage.getRoomSync(roomCode);
          if (!existing) {
            foundAvailableCode = true;
            break;
          }
        } catch (getErr: any) {
          const classification = classifyGetRoomErrorDuringCreate(getErr);
          this.recordCreateRoomDiagnostic(
            'PRECHECK_ROOM_CODE',
            `/coop_rooms/${roomCode}`,
            classification,
            getErr
          );
          return {
            success: false,
            errorCode: classification,
            failedStep: 'PRECHECK_ROOM_CODE',
            message: buildCreateRoomStepErrorMessage('PRECHECK_ROOM_CODE', classification),
          };
        }
        const nextPublicSlot = publicSlotCandidates.find((c) => !triedCodes.has(c));
        roomCode = nextPublicSlot ?? generateRoomCode(triedCodes);
      }

      if (!foundAvailableCode) {
        return {
          success: false,
          errorCode: 'ROOM_FULL',
          failedStep: 'PRECHECK_ROOM_CODE',
          message: 'Không thể cấp phát mã phòng trống sau 5 lần thử.',
        };
      }
    }

    const safeTtlMs =
      COOP_ONLINE_CONFIG.ROOM_TTL_MS - COOP_ONLINE_CONFIG.CLOCK_SKEW_BUFFER_MS;
    const cleanHostName = (getUserDisplayLabel(user) || 'Commander').trim().slice(0, 80);
    const encodedHostDisplayName = encodeHostDisplayNameWithLock(
      cleanHostName,
      roomCode,
      usePassword,
      normalizedPassword
    );

    const newLobby: CoopRoomLobbyDocument = {
      roomCode,
      status: 'WAITING',
      difficulty,
      hostUid: user.uid,
      hostDisplayName: encodedHostDisplayName,
      hostReady: false,
      hostLastActiveAt: nowMs,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: nowMs,
      expiresAt: nowMs + safeTtlMs,
      disconnectReason: null,
    };

    const newSignaling: CoopRoomSignalingDocument = {
      roomCode,
      hostUid: user.uid,
      guestUid: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      finalScore: 0,
      matchOutcome: null,
      updatedAt: nowMs,
    };

    try {
      // Bước 2: Tạo phòng cha /coop_rooms/{roomCode}
      try {
        storage.setRoomSync(roomCode, newLobby);
      } catch (createParentErr: any) {
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const parentClass = classifyGetRoomErrorDuringCreate(createParentErr);
        this.recordCreateRoomDiagnostic(
          'CREATE_PARENT_ROOM',
          `/coop_rooms/${roomCode}`,
          parentClass,
          createParentErr
        );
        return {
          success: false,
          errorCode: parentClass,
          failedStep: 'CREATE_PARENT_ROOM',
          message: buildCreateRoomStepErrorMessage('CREATE_PARENT_ROOM', parentClass),
        };
      }

      // Bước 3: Tạo tài liệu /coop_rooms/{roomCode}/private/signaling
      try {
        storage.setSignalingSync(roomCode, newSignaling);
      } catch (sigErr: any) {
        try {
          storage.updateRoomSync(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: nowMs,
            disconnectReason: 'Không thể khởi tạo kênh signaling riêng tư cho phòng.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const sigClass = classifyGetRoomErrorDuringCreate(sigErr);
        this.recordCreateRoomDiagnostic(
          'CREATE_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          sigClass,
          sigErr
        );
        return {
          success: false,
          errorCode: sigClass,
          failedStep: 'CREATE_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('CREATE_SIGNALING_DOC', sigClass),
        };
      }

      // Bước 4: Xác minh signaling document thực sự tồn tại
      let verifiedSig: CoopRoomSignalingDocument | null = null;
      try {
        verifiedSig = storage.getSignalingSync(roomCode);
      } catch (verifyErr: any) {
        try {
          storage.updateRoomSync(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: nowMs,
            disconnectReason: 'Không thể xác minh kênh signaling riêng tư của phòng.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        const verifyClass = classifyGetRoomErrorDuringCreate(verifyErr);
        this.recordCreateRoomDiagnostic(
          'VERIFY_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          verifyClass,
          verifyErr
        );
        return {
          success: false,
          errorCode: verifyClass,
          failedStep: 'VERIFY_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('VERIFY_SIGNALING_DOC', verifyClass),
        };
      }

      if (
        !verifiedSig ||
        verifiedSig.roomCode !== roomCode ||
        verifiedSig.hostUid !== user.uid
      ) {
        try {
          storage.updateRoomSync(roomCode, {
            status: 'ABANDONED',
            hostLastActiveAt: nowMs,
            disconnectReason: 'Tài liệu signaling riêng tư không tồn tại sau khi khởi tạo.',
          });
        } catch {
          // Ignore rollback error
        }
        this.currentRoom = null;
        this.currentSignaling = null;
        this.role = null;
        this.notifyListeners();
        this.recordCreateRoomDiagnostic(
          'VERIFY_SIGNALING_DOC',
          `/coop_rooms/${roomCode}/private/signaling`,
          'NETWORK_ERROR',
          { code: 'signaling-missing-after-create' }
        );
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          failedStep: 'VERIFY_SIGNALING_DOC',
          message: buildCreateRoomStepErrorMessage('VERIFY_SIGNALING_DOC', 'NETWORK_ERROR'),
        };
      }

      // Bước 5: Chỉ sau khi xác minh hoàn tất mới công bố mã phòng và trạng thái sẵn sàng
      this.lastCreateRoomDiagnostic = null;
      this.currentSignaling = verifiedSig;
      this.currentRoom = mergeLobbyAndSignaling(newLobby, verifiedSig);
      this.role = 'HOST';
      this.resetSyncCounters();
      this.listenToRoom(roomCode);
      this.notifyListeners();
      return {
        success: true,
        room: this.currentRoom,
      };
    } catch (err: any) {
      this.currentRoom = null;
      this.currentSignaling = null;
      this.role = null;
      this.notifyListeners();
      const classification = classifyGetRoomErrorDuringCreate(err);
      return {
        success: false,
        errorCode: classification,
        failedStep: 'CREATE_PARENT_ROOM',
        message: buildCreateRoomStepErrorMessage('CREATE_PARENT_ROOM', classification),
      };
    }
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động với InMemoryCoopStorageAdapter cho quy trình tham gia phòng (Fix 1 & Fix 3 & M7.3.7).
   */
  public joinRoomSync(
    storage: InMemoryCoopStorageAdapter,
    rawRoomCode: string,
    user: { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null } | null,
    nowMs: number = Date.now(),
    options?: CoopJoinRoomOptions
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

    const room = storage.getRoomSync(normalized);
    const sigExists = storage.getSignalingSync(normalized) !== null;
    const joinCandidate = evaluateJoinRoomCandidate(room, normalized, user, nowMs, sigExists, options);
    if (!joinCandidate.success || !room) {
      return joinCandidate;
    }

    this.cleanupSubscription();
    this.closeWebRTC();

    const updatedFields: Partial<CoopRoomLobbyDocument> = {
      guestUid: user.uid,
      guestDisplayName: getUserDisplayLabel(user),
      guestReady: false,
      guestLastActiveAt: nowMs,
    };

    try {
      storage.updateRoomSync(normalized, updatedFields);
    } catch (updateErr: any) {
      const msg = String(updateErr?.message || '');
      if (msg.includes('ROOM_FULL') || String(updateErr?.code || '').includes('permission-denied')) {
        return {
          success: false,
          errorCode: 'ROOM_FULL',
          message: 'Phòng đã đủ 2 người chơi hoặc vừa có người chơi khác tham gia.',
        };
      }
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: msg || 'Không thể tham gia phòng do lỗi kết nối.',
      };
    }

    const existingSig = storage.getSignalingSync(normalized);
    if (!existingSig) {
      storage.updateRoomSync(normalized, {
        guestUid: null,
        guestDisplayName: null,
        guestReady: false,
        guestLastActiveAt: null,
      });
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Phòng chơi chưa hoàn tất khởi tạo dữ liệu bảo mật (signaling).',
      };
    }

    const syncedSig: CoopRoomSignalingDocument = {
      ...existingSig,
      guestUid: user.uid,
      updatedAt: nowMs,
    };
    try {
      storage.updateSignalingSync(normalized, {
        guestUid: user.uid,
        updatedAt: nowMs,
      });
    } catch {
      // Ignore optional signaling guestUid sync failure
    }

    const mergedLobby: CoopRoomLobbyDocument = {
      ...room,
      ...updatedFields,
    };
    this.currentSignaling = syncedSig;
    this.currentRoom = mergeLobbyAndSignaling(mergedLobby, syncedSig);
    this.role = 'GUEST';
    this.resetSyncCounters();
    this.listenToRoom(normalized);
    this.notifyListeners();

    return {
      success: true,
      room: this.currentRoom,
    };
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động cho tính năng "Vào nhanh" (Quick Join - M7.3.7 Mục VI.5.3.A).
   */
  public quickJoinRoomSync(
    storage: InMemoryCoopStorageAdapter,
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

    const allRooms = storage.listRoomsSync();
    const eligibleRooms = allRooms
      .filter((r) => {
        const lockInfo = decodeHostDisplayNameAndLock(r.hostDisplayName);
        const sigExists = storage.getSignalingSync(r.roomCode) !== null;
        return (
          r.status === 'WAITING' &&
          !lockInfo.hasPassword &&
          r.guestUid === null &&
          nowMs < r.expiresAt &&
          r.hostUid !== user.uid &&
          sigExists
        );
      })
      .sort((a, b) => a.createdAt - b.createdAt);

    if (eligibleRooms.length === 0) {
      return {
        success: false,
        errorCode: 'NO_AVAILABLE_PUBLIC_ROOM',
        message: 'Hiện chưa có phòng trống',
      };
    }

    for (const candidate of eligibleRooms) {
      const joinRes = this.joinRoomSync(storage, candidate.roomCode, user, nowMs);
      if (joinRes.success) {
        return joinRes;
      }
    }

    return {
      success: false,
      errorCode: 'NO_AVAILABLE_PUBLIC_ROOM',
      message: 'Hiện chưa có phòng trống',
    };
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động cho thao tác bấm Sẵn sàng / Hủy sẵn sàng của P1 & P2 (Hạng mục 6 - M7.3.7).
   */
  public setPlayerReadySync(
    storage: InMemoryCoopStorageAdapter,
    ready: boolean,
    nowMs: number = Date.now()
  ): CoopActionResult {
    if (!this.currentRoom || !this.role) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Chưa ở trong phòng Co-op Online.',
      };
    }

    const code = this.currentRoom.roomCode;
    const latestRoom = storage.getRoomSync(code);
    if (!latestRoom) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng chơi trên hệ thống.',
      };
    }

    if (
      latestRoom.status === 'EXPIRED' ||
      latestRoom.status === 'ABANDONED' ||
      latestRoom.status === 'FINISHED' ||
      (latestRoom.status === 'WAITING' && nowMs >= latestRoom.expiresAt)
    ) {
      return {
        success: false,
        errorCode: 'ROOM_EXPIRED',
        message: 'Phòng chờ đã hết hạn hoặc đã đóng.',
      };
    }

    if (latestRoom.status !== 'WAITING') {
      return {
        success: false,
        errorCode: 'MATCH_ALREADY_STARTED',
        message: 'Trận đấu đã bắt đầu, không thể thay đổi trạng thái Sẵn sàng.',
      };
    }

    if (this.role === 'GUEST') {
      if (!latestRoom.guestUid || latestRoom.guestUid !== this.currentRoom.guestUid) {
        return {
          success: false,
          errorCode: 'INVALID_ROOM_STATE',
          message: 'Người chơi 2 chưa được ghi nhận hợp lệ trong phòng.',
        };
      }
    }

    const nextReady = Boolean(ready);
    const partial: Partial<CoopRoomLobbyDocument> =
      this.role === 'HOST'
        ? { hostReady: nextReady, hostLastActiveAt: nowMs }
        : { guestReady: nextReady, guestLastActiveAt: nowMs };

    try {
      storage.updateRoomSync(code, partial);
      const mergedLobby: CoopRoomLobbyDocument = {
        ...latestRoom,
        ...partial,
      };
      this.currentRoom = mergeLobbyAndSignaling(mergedLobby, this.currentSignaling);
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
   * Phiên bản đồng bộ phục vụ kiểm thử tự động cho thao tác bắt đầu trận đấu của Host (P1).
   */
  public startOnlineMatchSync(
    storage: InMemoryCoopStorageAdapter,
    callerUid: string,
    initialGameState?: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): CoopActionResult {
    const latestLobby = this.currentRoom ? storage.getRoomSync(this.currentRoom.roomCode) : null;
    if (latestLobby) {
      this.currentRoom = mergeLobbyAndSignaling(latestLobby, this.currentSignaling);
    }
    const sigExists = Boolean(
      this.currentRoom && storage.getSignalingSync(this.currentRoom.roomCode) !== null
    );
    const check = evaluateStartMatchCandidate(
      this.currentRoom,
      callerUid,
      this.role,
      nowMs,
      sigExists
    );
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

    const partial: Partial<CoopRoomLobbyDocument> = {
      status: 'PLAYING',
      hostLastActiveAt: nowMs,
      disconnectReason: null,
    };

    try {
      storage.updateRoomSync(this.currentRoom.roomCode, partial);
      const updatedLobby = storage.getRoomSync(this.currentRoom.roomCode);
      if (updatedLobby) {
        this.currentRoom = mergeLobbyAndSignaling(updatedLobby, this.currentSignaling);
      }

      if (initialGameState && this.isP2PDataChannelOpen()) {
        this.hostOutgoingSnapshotSeq = 1;
        const initialSnapshot = buildAuthoritativeSnapshot(initialGameState, 1, nowMs);
        this.sendOverDataChannel({ type: 'HOST_SNAPSHOT', snapshot: initialSnapshot });
      }

      this.notifyListeners();
      return { success: true, room: this.currentRoom || undefined };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: err?.message || 'Không thể bắt đầu trận đấu do lỗi mạng.',
      };
    }
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động cho thao tác rời phòng của P1 hoặc P2.
   */
  public leaveRoomSync(
    storage: InMemoryCoopStorageAdapter,
    reason?: string,
    nowMs: number = Date.now()
  ): void {
    const room = this.currentRoom;
    const currentRole = this.role;
    if (room && (currentRole === 'HOST' || currentRole === 'GUEST') && this.isP2PDataChannelOpen()) {
      const leaveMsg = currentRole === 'HOST' ? 'P1 đã rời trận.' : 'P2 đã rời trận.';
      this.sendOverDataChannel({
        type: 'PLAYER_LEFT',
        role: currentRole,
        reason: reason || leaveMsg,
        timestamp: nowMs,
      });
    }
    this.cleanupSubscription();
    this.closeWebRTC();
    this.currentRoom = null;
    this.currentSignaling = null;
    this.role = null;
    this.resetSyncCounters();
    this.notifyListeners();

    if (!room || !currentRole) return;

    try {
      if (currentRole === 'HOST') {
        storage.updateRoomSync(room.roomCode, {
          status: 'ABANDONED',
          rtcConnectionState: 'DISCONNECTED',
          hostLastActiveAt: nowMs,
          disconnectReason:
            reason || 'P1 đã rời trận.',
        });
      } else if (currentRole === 'GUEST') {
        if (room.status === 'WAITING') {
          storage.updateRoomSync(room.roomCode, {
            guestUid: null,
            guestDisplayName: null,
            guestReady: false,
            guestLastActiveAt: null,
          });
        } else {
          storage.updateRoomSync(room.roomCode, {
            status: 'ABANDONED',
            guestLastActiveAt: nowMs,
            disconnectReason: reason || 'P2 đã rời trận.',
          });
        }
      }
    } catch {
      // Ignore cleanup error
    }
  }

  /**
   * Phiên bản đồng bộ phục vụ kiểm thử tự động với InMemoryCoopStorageAdapter cho quy trình kết thúc trận retry-safe (Fix 5 & M7.3 FINAL GUARD Fix 2).
   */
  public recordMatchFinishSync(
    storage: InMemoryCoopStorageAdapter,
    finalScore: number,
    matchOutcome: 'VICTORY' | 'GAME_OVER',
    nowMs: number = Date.now()
  ): CoopActionResult {
    if (!this.currentRoom) {
      return {
        success: false,
        errorCode: 'ROOM_NOT_FOUND',
        message: 'Không tìm thấy phòng chơi hiện tại.',
      };
    }

    if (this.role !== 'HOST') {
      return {
        success: false,
        errorCode: 'NOT_HOST',
        message: 'Chỉ Chủ phòng (P1) mới có quyền ghi nhận kết quả trận đấu.',
      };
    }

    if (
      (matchOutcome !== 'VICTORY' && matchOutcome !== 'GAME_OVER') ||
      typeof finalScore !== 'number' ||
      !Number.isInteger(finalScore) ||
      finalScore < 0 ||
      finalScore > 9999999
    ) {
      return {
        success: false,
        errorCode: 'INVALID_PACKET',
        message: 'Dữ liệu kết quả trận đấu không hợp lệ.',
      };
    }

    const roomCode = this.currentRoom.roomCode;

    try {
      const serverRoom = storage.getRoomFromServerSync(roomCode);
      if (!serverRoom) {
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy tài liệu phòng cha trên máy chủ.',
        };
      }

      const existingSig = storage.getSignalingFromServerSync(roomCode);
      if (!existingSig) {
        return {
          success: false,
          errorCode: 'ROOM_NOT_FOUND',
          message: 'Không tìm thấy tài liệu signaling bảo mật để lưu kết quả.',
        };
      }

      // Trường hợp E1: Phòng đã ABANDONED hoặc EXPIRED
      if (serverRoom.status === 'ABANDONED' || serverRoom.status === 'EXPIRED') {
        return {
          success: false,
          errorCode: 'ROOM_EXPIRED',
          message: `Phòng chơi đã ở trạng thái ${serverRoom.status}, không thể xác nhận kết thúc trận.`,
        };
      }

      // Trường hợp C & D (hoặc E2): Phòng trên máy chủ đã ở trạng thái FINISHED
      if (serverRoom.status === 'FINISHED') {
        const hasValidResult = hasValidRecordedMatchResultModel(
          roomCode,
          serverRoom,
          existingSig,
          true
        );
        if (
          hasValidResult &&
          existingSig.matchOutcome === matchOutcome &&
          existingSig.finalScore === finalScore
        ) {
          this.hasRecordedMatchFinishInFirestore = true;
          this.currentSignaling = existingSig;
          this.currentRoom = {
            ...serverRoom,
            ...existingSig,
            status: 'FINISHED',
            finalScore,
            matchOutcome,
          };
          this.notifyListeners();
          return {
            success: true,
            room: this.currentRoom,
          };
        }

        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message:
            'Xung đột trạng thái: Phòng đã FINISHED nhưng kết quả trong private/signaling không tồn tại hoặc không khớp.',
        };
      }

      if (serverRoom.status !== 'PLAYING') {
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: `Phòng đang ở trạng thái ${serverRoom.status}, chưa thể kết thúc trận đấu.`,
        };
      }

      if (
        existingSig.roomCode !== roomCode ||
        existingSig.hostUid !== serverRoom.hostUid ||
        serverRoom.guestUid === null ||
        existingSig.guestUid !== serverRoom.guestUid
      ) {
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: 'Thông tin định danh phòng trong private/signaling không khớp với phòng cha.',
        };
      }

      if (existingSig.matchOutcome === null && existingSig.finalScore === 0) {
        storage.updateSignalingSync(roomCode, {
          finalScore,
          matchOutcome,
          updatedAt: nowMs,
        });
        this.currentSignaling = {
          ...existingSig,
          finalScore,
          matchOutcome,
          updatedAt: nowMs,
        };
        this.currentRoom = {
          ...this.currentRoom,
          finalScore,
          matchOutcome,
        };
      } else if (
        existingSig.matchOutcome === matchOutcome &&
        existingSig.finalScore === finalScore
      ) {
        this.currentSignaling = existingSig;
        this.currentRoom = {
          ...this.currentRoom,
          finalScore: existingSig.finalScore,
          matchOutcome: existingSig.matchOutcome,
        };
      } else {
        return {
          success: false,
          errorCode: 'INVALID_PACKET',
          message: `Xung đột kết quả trận đấu: Kết quả đã xác nhận (${existingSig.matchOutcome}, ${existingSig.finalScore}) khác với kết quả yêu cầu ghi (${matchOutcome}, ${finalScore}).`,
        };
      }

      storage.updateRoomSync(roomCode, {
        status: 'FINISHED',
        hostLastActiveAt: nowMs,
      });

      const confirmedRoom = storage.getRoomFromServerSync(roomCode);
      if (!confirmedRoom || confirmedRoom.status !== 'FINISHED') {
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          message: 'Chưa thể xác nhận trạng thái FINISHED của phòng cha. Có thể thử lại an toàn.',
        };
      }

      this.hasRecordedMatchFinishInFirestore = true;
      this.currentRoom = {
        ...confirmedRoom,
        ...(this.currentSignaling || {}),
        status: 'FINISHED',
        finalScore,
        matchOutcome,
      };
      this.notifyListeners();

      return {
        success: true,
        room: this.currentRoom,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message:
          err?.message ||
          'Lỗi mạng trong quá trình kết thúc trận đấu. Kết quả đã lưu trong signaling được bảo toàn để thử lại.',
      };
    }
  }

  /**
   * Được gọi mỗi frame trên máy Chủ phòng (Host) để phát bản chụp trạng thái qua WebRTC DataChannel.
   * TUYỆT ĐỐI KHÔNG GHI SNAPSHOT VÀO FIRESTORE!
   * Chỉ khi trận đấu kết thúc (`state.isGameOver`), Host mới gọi `recordMatchFinish()` để lưu kết quả và đóng phòng.
   */
  public async onHostSimulationFrame(
    deltaMs: number,
    state: Readonly<GameCoreState>,
    nowMs: number = Date.now()
  ): Promise<boolean> {
    if (
      !this.currentRoom ||
      this.role !== 'HOST' ||
      (this.currentRoom.status !== 'PLAYING' &&
        !(state.isGameOver && !this.hasRecordedMatchFinishInFirestore))
    ) {
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

    const p2St = state.p2State;
    this.isRemoteGuestSpectator = Boolean(
      p2St && (p2St.isSpectator || p2St.hasLeftMatch || (p2St.isDead && p2St.lives <= 0))
    );
    if (this.isRemoteGuestSpectator) {
      this.clearLatchedGuestInput();
    }

    const snapshot = buildAuthoritativeSnapshot(state, this.hostOutgoingSnapshotSeq, nowMs);
    const sentOverP2P = this.sendOverDataChannel({
      type: 'HOST_SNAPSHOT',
      snapshot,
    });

    if (
      state.isGameOver &&
      !this.hasRecordedMatchFinishInFirestore &&
      !this.isRecordingMatchFinishInFlight
    ) {
      this.isRecordingMatchFinishInFlight = true;
      const finalOutcome: 'VICTORY' | 'GAME_OVER' =
        state.isStageClear && !state.terrain.isBaseDestroyed ? 'VICTORY' : 'GAME_OVER';
      try {
        await this.recordMatchFinish(state.score, finalOutcome, nowMs);
      } finally {
        this.isRecordingMatchFinishInFlight = false;
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

    if (msg.type === 'PLAYER_LEFT') {
      if (msg.role === 'HOST' || msg.role === 'GUEST') {
        this.recordPeerActiveLeave(msg.role, msg.reason);
      }
      return;
    }

    if (msg.type === 'GUEST_INPUT' && this.role === 'HOST') {
      this.processIncomingGuestInput(msg.packet, nowMs);
    } else if (msg.type === 'HOST_SNAPSHOT' && this.role === 'GUEST') {
      const validation = validateAndNormalizeAuthoritativeSnapshot(
        msg.snapshot,
        this.guestLastAppliedSnapshotSeq,
        this.guestLastAppliedStageRunSeq,
        this.guestLastAppliedTickCount
      );
      if (!validation.valid || !validation.normalized) {
        return;
      }
      const normalizedSnap = validation.normalized;
      const p2St = normalizedSnap.p2State;
      this.isLocalGuestSpectator = Boolean(
        p2St && (p2St.isSpectator || p2St.hasLeftMatch || (p2St.isDead && p2St.lives <= 0))
      );

      let rejectedByEngineListener = false;
      this.snapshotListeners.forEach((cb) => {
        try {
          const listenerResult = cb(normalizedSnap);
          if (listenerResult === false) {
            rejectedByEngineListener = true;
          }
        } catch (e) {
          console.error('[CoopOnlineManager] snapshot listener error:', e);
        }
      });
      if (!rejectedByEngineListener) {
        this.guestLastAppliedSnapshotSeq = normalizedSnap.snapshotSeq;
        this.guestLastAppliedStageRunSeq = normalizedSnap.stageRunSeq;
        this.guestLastAppliedTickCount = normalizedSnap.tickCount;
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
   * Khởi tạo hoặc thử kết nối lại WebRTC P2P (Signaling qua `/coop_rooms/{roomCode}/private/signaling`).
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
          rtcConnectionState: 'CONNECTING',
          hostLastActiveAt: nowMs,
        });
        await this.adapter.updateSignaling(this.currentRoom.roomCode, {
          guestUid: this.currentRoom.guestUid,
          rtcOffer: null,
          rtcAnswer: null,
          hostIceCandidates: null,
          guestIceCandidates: null,
          updatedAt: nowMs,
        });
        if (this.currentRoom.guestUid) {
          await this.startHostWebRTCOffer(this.currentRoom.roomCode, this.currentRoom.guestUid);
        }
      } else if (this.role === 'GUEST') {
        // Fix 1: Guest không cập nhật rtcConnectionState trên tài liệu phòng (chỉ cập nhật guestLastActiveAt và signaling của Guest)
        await this.adapter.updateRoom(this.currentRoom.roomCode, {
          guestLastActiveAt: nowMs,
        });
        await this.adapter.updateSignaling(this.currentRoom.roomCode, {
          guestUid: this.currentRoom.guestUid,
          rtcAnswer: null,
          guestIceCandidates: null,
          updatedAt: nowMs,
        });
        if (this.currentSignaling?.rtcOffer) {
          await this.startGuestWebRTCAnswer(
            this.currentRoom.roomCode,
            this.currentSignaling.rtcOffer,
            this.currentSignaling.hostIceCandidates
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

    // M7.3.9 Trường hợp E: Nếu P2 (Guest) đã chủ động rời trận khi Host (P1) đang chơi,
    // Host nhận thông báo "P2 đã rời trận." và tiếp tục chơi solo (không báo timeout dừng trận của P1).
    if (this.role === 'HOST' && this.processedPeerLeaveRoles.has('GUEST')) {
      return {
        peerConnected: false,
        warningMessage: 'P2 đã rời trận.',
        isTimedOut: false,
      };
    }

    if (this.role === 'GUEST' && this.processedPeerLeaveRoles.has('HOST')) {
      return {
        peerConnected: false,
        warningMessage: 'P1 đã rời trận.',
        isTimedOut: true,
      };
    }

    if (this.currentRoom.status === 'ABANDONED') {
      if (this.role === 'HOST' && this.currentRoom.disconnectReason === 'P2 đã rời trận.') {
        this.recordPeerActiveLeave('GUEST', this.currentRoom.disconnectReason);
        return {
          peerConnected: false,
          warningMessage: 'P2 đã rời trận.',
          isTimedOut: false,
        };
      }
      if (this.role === 'GUEST') {
        this.recordPeerActiveLeave('HOST', this.currentRoom.disconnectReason || 'P1 đã rời trận.');
      }
      return {
        peerConnected: false,
        warningMessage:
          this.currentRoom.disconnectReason ||
          (this.role === 'HOST' ? 'P2 đã rời trận.' : 'P1 đã rời trận.'),
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
   * - Nếu Chủ phòng (Host) rời: gửi thông điệp PLAYER_LEFT, đóng phòng (`ABANDONED`), đặt `rtcConnectionState: 'DISCONNECTED'` và thông báo cho P2.
   * - Nếu Khách (Guest) rời khi đang WAITING: giải phóng 4 trường của Guest về null.
   * - Nếu Khách (Guest) rời khi đang PLAYING: gửi thông điệp PLAYER_LEFT, đánh dấu `ABANDONED` kèm lý do để P1 nhận thông báo "P2 đã rời trận." và tiếp tục chơi.
   */
  public async leaveRoom(reason?: string, nowMs: number = Date.now()): Promise<void> {
    const room = this.currentRoom;
    const currentRole = this.role;
    if (room && (currentRole === 'HOST' || currentRole === 'GUEST') && this.isP2PDataChannelOpen()) {
      const leaveMsg = currentRole === 'HOST' ? 'P1 đã rời trận.' : 'P2 đã rời trận.';
      this.sendOverDataChannel({
        type: 'PLAYER_LEFT',
        role: currentRole,
        reason: reason || leaveMsg,
        timestamp: nowMs,
      });
    }
    this.cleanupSubscription();
    this.closeWebRTC();
    this.currentRoom = null;
    this.currentSignaling = null;
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
            reason || 'P1 đã rời trận.',
        });
      } else if (currentRole === 'GUEST') {
        if (room.status === 'WAITING') {
          await this.adapter.updateRoom(room.roomCode, {
            guestUid: null,
            guestDisplayName: null,
            guestReady: false,
            guestLastActiveAt: null,
          });
        } else {
          await this.adapter.updateRoom(room.roomCode, {
            status: 'ABANDONED',
            guestLastActiveAt: nowMs,
            disconnectReason:
              reason || 'P2 đã rời trận.',
          });
        }
      }
    } catch {
      // Ignore network errors during leave cleanup
    }
  }

  private listenToRoom(roomCode: string): void {
    this.unsubRoom = this.adapter.subscribeRoom(roomCode, (updatedLobby) => {
      if (!updatedLobby) {
        this.currentRoom = null;
      } else {
        if (updatedLobby.status === 'ABANDONED' && this.role) {
          const peerRole = this.role === 'HOST' ? 'GUEST' : 'HOST';
          this.recordPeerActiveLeave(peerRole, updatedLobby.disconnectReason || undefined);
        }
        this.currentRoom = mergeLobbyAndSignaling(updatedLobby, this.currentSignaling);
        this.coordinateWebRTCSignaling();
      }
      this.notifyListeners();
    });

    this.unsubSignaling = this.adapter.subscribeSignaling(roomCode, (updatedSig) => {
      this.currentSignaling = updatedSig;
      if (this.currentRoom && updatedSig) {
        this.currentRoom = {
          ...this.currentRoom,
          rtcOffer: updatedSig.rtcOffer,
          rtcAnswer: updatedSig.rtcAnswer,
          hostIceCandidates: updatedSig.hostIceCandidates,
          guestIceCandidates: updatedSig.guestIceCandidates,
          finalScore: updatedSig.finalScore,
          matchOutcome: updatedSig.matchOutcome,
        };
        this.coordinateWebRTCSignaling();
      }
      this.notifyListeners();
    });
  }

  /**
   * Điều phối trao đổi SDP Offer / Answer và ICE Candidates qua `/coop_rooms/{roomCode}/private/signaling`.
   */
  private coordinateWebRTCSignaling(): void {
    if (this.customP2PChannel) {
      return; // Đang dùng kênh P2P trực tiếp trong bộ nhớ (Test Harness)
    }
    if (typeof RTCPeerConnection === 'undefined') {
      return;
    }

    const room = this.currentRoom;
    const sig = this.currentSignaling;
    if (!room) return;

    if (this.role === 'HOST') {
      // Khi Guest rời phòng chờ -> Host đóng kết nối WebRTC cũ, đặt lại rtcConnectionState = 'NEW' và reset private/signaling về trạng thái rỗng
      if (!room.guestUid) {
        if (this.peerConnection) {
          this.closeWebRTC();
        }
        if (
          room.status === 'WAITING' &&
          (room.rtcConnectionState !== 'NEW' || room.disconnectReason !== null)
        ) {
          void this.adapter
            .updateRoom(room.roomCode, {
              rtcConnectionState: 'NEW',
              disconnectReason: null,
              hostLastActiveAt: Date.now(),
            })
            .catch(() => undefined);
        }
        if (
          sig &&
          (sig.guestUid !== null ||
            sig.rtcOffer !== null ||
            sig.rtcAnswer !== null ||
            sig.hostIceCandidates !== null ||
            sig.guestIceCandidates !== null)
        ) {
          void this.adapter
            .updateSignaling(room.roomCode, {
              guestUid: null,
              rtcOffer: null,
              rtcAnswer: null,
              hostIceCandidates: null,
              guestIceCandidates: null,
              updatedAt: Date.now(),
            })
            .catch(() => undefined);
        }
        return;
      }

      // Khi có Guest mới tham gia -> Host tạo Offer 1 lần
      if (room.guestUid && this.hasSentOfferForGuestUid !== room.guestUid) {
        this.hasSentOfferForGuestUid = room.guestUid;
        void this.startHostWebRTCOffer(room.roomCode, room.guestUid);
      }

      // Khi Guest gửi Answer -> Host áp dụng Answer + ICE của Guest
      if (this.peerConnection && sig?.rtcAnswer && !this.hasAppliedRemoteAnswer) {
        this.hasAppliedRemoteAnswer = true;
        void this.applyGuestAnswerAndIce(sig.rtcAnswer, sig.guestIceCandidates);
      } else if (this.peerConnection && sig?.guestIceCandidates) {
        void this.enqueueOrAddRemoteIceCandidatesJson(sig.guestIceCandidates);
      }
    } else if (this.role === 'GUEST') {
      // Khi Host đã đăng Offer -> Guest tạo Answer 1 lần
      if (sig?.rtcOffer && this.hasSentAnswerForOffer !== sig.rtcOffer) {
        this.hasSentAnswerForOffer = sig.rtcOffer;
        void this.startGuestWebRTCAnswer(room.roomCode, sig.rtcOffer, sig.hostIceCandidates);
      } else if (this.peerConnection && sig?.hostIceCandidates) {
        void this.enqueueOrAddRemoteIceCandidatesJson(sig.hostIceCandidates);
      }
    }
  }

  private async startHostWebRTCOffer(roomCode: string, guestUid: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    this.closeWebRTC();
    this.hasSentOfferForGuestUid = guestUid;
    this.rtcState = 'CONNECTING';

    if (this.currentRoom && this.currentRoom.rtcConnectionState === 'NEW') {
      void this.adapter
        .updateRoom(roomCode, {
          rtcConnectionState: 'CONNECTING',
          disconnectReason: null,
          hostLastActiveAt: Date.now(),
        })
        .catch(() => undefined);
    }

    const pc = new RTCPeerConnection({ iceServers: [...COOP_ONLINE_CONFIG.STUN_SERVERS] });
    this.peerConnection = pc;

    const candidates: RTCIceCandidateInit[] = [];
    let initialWriteDone = false;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        candidates.push(ev.candidate.toJSON());
        if (initialWriteDone && this.peerConnection === pc) {
          void this.adapter
            .updateSignaling(roomCode, {
              hostIceCandidates: JSON.stringify(candidates),
              updatedAt: Date.now(),
            })
            .catch(() => undefined);
        }
      }
    };

    this.setupPeerConnectionLifecycle(pc, roomCode);

    // Unordered with maxRetransmits=2: avoids head-of-line blocking while protecting against single UDP packet loss
    const dc = pc.createDataChannel('bantank_coop_dc', { ordered: false, maxRetransmits: 2 });
    this.setupDataChannel(dc, roomCode);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGatheringShort(pc, 500);

      initialWriteDone = true;
      await this.adapter.updateSignaling(roomCode, {
        guestUid,
        rtcOffer: JSON.stringify(pc.localDescription || offer),
        rtcAnswer: null,
        hostIceCandidates: JSON.stringify(candidates),
        guestIceCandidates: null,
        updatedAt: Date.now(),
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
    let initialWriteDone = false;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        candidates.push(ev.candidate.toJSON());
        if (initialWriteDone && this.peerConnection === pc) {
          void this.adapter
            .updateSignaling(roomCode, {
              guestIceCandidates: JSON.stringify(candidates),
              updatedAt: Date.now(),
            })
            .catch(() => undefined);
        }
      }
    };

    pc.ondatachannel = (ev) => {
      this.setupDataChannel(ev.channel, roomCode);
    };

    this.setupPeerConnectionLifecycle(pc, roomCode);

    try {
      if (hostIceJson) {
        await this.enqueueOrAddRemoteIceCandidatesJson(hostIceJson);
      }
      const offerDesc = JSON.parse(rtcOfferJson) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(offerDesc);
      await this.flushPendingRemoteIceCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.waitForIceGatheringShort(pc, 500);

      initialWriteDone = true;
      await this.adapter.updateSignaling(roomCode, {
        guestUid: this.currentRoom?.guestUid || null,
        rtcAnswer: JSON.stringify(pc.localDescription || answer),
        guestIceCandidates: JSON.stringify(candidates),
        updatedAt: Date.now(),
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
      if (guestIceJson) {
        await this.enqueueOrAddRemoteIceCandidatesJson(guestIceJson);
      }
      const answerDesc = JSON.parse(rtcAnswerJson) as RTCSessionDescriptionInit;
      if (this.peerConnection.signalingState === 'have-local-offer') {
        await this.peerConnection.setRemoteDescription(answerDesc);
        await this.flushPendingRemoteIceCandidates();
      }
    } catch {
      this.markWebRTCConnectionFailed('Không thể hoàn tất bắt tay WebRTC với Người chơi 2.');
    }
  }

  /**
   * Hỗ trợ đầy đủ trường hợp ICE đến trước SDP:
   * Nếu `remoteDescription` chưa sẵn sàng, lưu tạm vào `pendingRemoteIceCandidates`
   * và nạp ngay sau khi `setRemoteDescription` hoàn tất.
   */
  public async enqueueOrAddRemoteIceCandidatesJson(iceJson: string): Promise<void> {
    try {
      const list = JSON.parse(iceJson) as RTCIceCandidateInit[];
      if (!Array.isArray(list)) return;
      for (const cand of list) {
        const sig = JSON.stringify(cand);
        if (this.addedRemoteCandidateSignatures.has(sig)) continue;
        this.addedRemoteCandidateSignatures.add(sig);

        if (this.peerConnection && this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(cand);
        } else {
          this.pendingRemoteIceCandidates.push(cand);
        }
      }
    } catch {
      // Ignore malformed ICE JSON
    }
  }

  public async flushPendingRemoteIceCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.pendingRemoteIceCandidates.length > 0) {
      const cand = this.pendingRemoteIceCandidates.shift()!;
      try {
        await this.peerConnection.addIceCandidate(cand);
      } catch {
        // Ignore individual candidate error
      }
    }
  }

  public getPendingRemoteIceCandidatesCount(): number {
    return this.pendingRemoteIceCandidates.length;
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
        if (this.role === 'HOST') {
          void this.adapter
            .updateRoom(roomCode, { rtcConnectionState: 'FAILED', hostLastActiveAt: Date.now() })
            .catch(() => undefined);
        }
      }
    }, COOP_ONLINE_CONFIG.WEBRTC_CONNECT_TIMEOUT_MS);

    pc.onconnectionstatechange = () => {
      if (this.peerConnection !== pc) return;
      const st = pc.connectionState;
      if (st === 'failed' || st === 'disconnected') {
        this.markWebRTCConnectionFailed(
          'Kết nối P2P trực tiếp (WebRTC) đã bị ngắt hoặc không thể vượt tường lửa.'
        );
        if (this.role === 'HOST') {
          void this.adapter
            .updateRoom(roomCode, { rtcConnectionState: 'FAILED', hostLastActiveAt: Date.now() })
            .catch(() => undefined);
        }
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
      // Fix 1: Chỉ Host ghi xác nhận CONNECTED lên tài liệu phòng sau khi DataChannel.onopen thực sự mở
      if (this.role === 'HOST') {
        void this.adapter
          .updateRoom(roomCode, { rtcConnectionState: 'CONNECTED', hostLastActiveAt: Date.now() })
          .catch(() => undefined);
      }
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
        if (this.currentRoom) {
          this.currentRoom = { ...this.currentRoom, rtcConnectionState: 'DISCONNECTED' };
        }
        this.notifyListeners();
        if (this.role === 'HOST') {
          void this.adapter
            .updateRoom(roomCode, { rtcConnectionState: 'DISCONNECTED', hostLastActiveAt: Date.now() })
            .catch(() => undefined);
        }
      }
    };

    dc.onerror = () => {
      this.markWebRTCConnectionFailed('Lỗi trên kênh truyền WebRTC DataChannel.');
      if (this.role === 'HOST') {
        void this.adapter
          .updateRoom(roomCode, { rtcConnectionState: 'FAILED', hostLastActiveAt: Date.now() })
          .catch(() => undefined);
      }
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
    this.pendingRemoteIceCandidates = [];
    if (!this.customP2PChannel) {
      this.rtcState = 'NEW';
    }
  }

  private resetSyncCounters(): void {
    this.guestOutgoingSeq = 0;
    this.lastGuestInputSentAt = 0;
    this.lastSentInputSignature = '';
    this.hostLastProcessedGuestSeq = 0;
    this.lastValidatedGuestInputReceivedAt = 0;
    this.lastValidatedGuestInputClientTimestamp = 0;
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
    this.guestLastAppliedStageRunSeq = 0;
    this.guestLastAppliedTickCount = -1;
    this.lastPingSentAt = 0;
    this.isLocalGuestSpectator = false;
    this.isRemoteGuestSpectator = false;
    this.processedPeerLeaveRoles.clear();
    this.lastPeerLeaveNotice = null;
  }

  private cleanupSubscription(): void {
    if (this.unsubRoom) {
      this.unsubRoom();
      this.unsubRoom = null;
    }
    if (this.unsubSignaling) {
      this.unsubSignaling();
      this.unsubSignaling = null;
    }
  }
}
