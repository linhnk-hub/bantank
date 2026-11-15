/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.1 – SYSTEM AUDIT LOGGING, BACKUP & 9-STEP IDEMPOTENT ARCHIVE-BEFORE-CLEANUP
 *
 * Architectural & Security Notes (PHẦN 4, PHẦN 5, PHẦN 6):
 * - Access to read, filter, export backup, inspect archives, or trigger cleanup sweeps is
 *   strictly restricted to the sole ADMIN (`linhnk2013@gmail.com`) via `isAdminUser`.
 *   `MOD` and `PLAYER` roles are rejected at both service/API layer and UI layer.
 * - Separates two distinct storage tiers:
 *   1. Permanent Audit Logs (`PERMANENT_AUDIT`): Never deleted on logout, room close, or backup.
 *   2. Temporary Operational Logs (`TEMP_OPERATIONAL`): Per-session (`session:{uid}:{sessionId}`)
 *      and per-room (`room:{roomCode}`) operational buffers that can ONLY be deleted after
 *      completing the 9-step Archive -> Await -> Readback Checksum Verify -> `ARCHIVED_VERIFIED`
 *      manifest state machine.
 * - Client-Side Runtime Boundary (PHẦN 6): Because Bắn Tank Online runs as a static SPA
 *   without Cloud Functions / Firebase Admin SDK and `firestore.rules` is frozen in M7.5.1,
 *   client-side durable persistence uses IndexedDB + localStorage mirror (plus read-only merge
 *   of Firestore `/role_audit_logs` for ADMIN). This client store is NOT tamper-proof against
 *   a user modifying their own browser storage; full server-authoritative audit logging requires
 *   Cloud Functions + Admin SDK as documented in the M7.5.1 Report.
 */

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import {
  AuthManager,
  isAdminUser,
  resolveUserRole,
  type AuthIdentityLike,
} from './authManager.ts';
import { SessionManager } from './sessionManager.ts';

export type SystemLogSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type SystemLogCategory =
  | 'APP_SYSTEM_ERROR'
  | 'UNHANDLED_REJECTION'
  | 'AUTH_EVENT'
  | 'SECURITY_PERMISSION_DENIED'
  | 'FIRESTORE_OPERATION_ERROR'
  | 'STATIC_ASSET_LOAD_ERROR'
  | 'AUDIO_PLAYBACK_EVENT'
  | 'COOP_ROOM_LIFECYCLE'
  | 'WEBRTC_SYNC_ERROR'
  | 'CAMPAIGN_STAGE_EVENT'
  | 'ADMIN_MOD_ACTION'
  | 'LOG_BACKUP_OPERATION'
  | 'LOG_CLEANUP_ARCHIVE'
  | 'CLIENT_LIFECYCLE';

export const ALL_SYSTEM_LOG_CATEGORIES: ReadonlyArray<{
  id: SystemLogCategory;
  label: string;
}> = [
  { id: 'APP_SYSTEM_ERROR', label: 'Lỗi hệ thống & ngoại lệ runtime' },
  { id: 'UNHANDLED_REJECTION', label: 'Unhandled Promise Rejection' },
  { id: 'AUTH_EVENT', label: 'Xác thực & Phiên đăng nhập (15p / 1 thiết bị)' },
  { id: 'SECURITY_PERMISSION_DENIED', label: 'Từ chối phân quyền (Firestore / Storage / RBAC)' },
  { id: 'FIRESTORE_OPERATION_ERROR', label: 'Lỗi kết nối / đọc ghi Firestore' },
  { id: 'STATIC_ASSET_LOAD_ERROR', label: 'Lỗi tải tài nguyên tĩnh (BGM / SFX / Avatar / Video)' },
  { id: 'AUDIO_PLAYBACK_EVENT', label: 'Giải mã & phát âm thanh (BGM / SFX)' },
  { id: 'COOP_ROOM_LIFECYCLE', label: 'Phòng Co-op Online (Tạo / Vào / Rời / Đóng)' },
  { id: 'WEBRTC_SYNC_ERROR', label: 'Kết nối & đồng bộ P2P / WebRTC' },
  { id: 'CAMPAIGN_STAGE_EVENT', label: 'Chiến dịch Stage 1–10 (Bắt đầu / Thắng / Thua / Mở khóa)' },
  { id: 'ADMIN_MOD_ACTION', label: 'Thao tác quản trị ADMIN / MOD' },
  { id: 'LOG_BACKUP_OPERATION', label: 'Sao lưu dữ liệu Log (JSON / CSV)' },
  { id: 'LOG_CLEANUP_ARCHIVE', label: 'Lưu trữ & dọn dẹp Log tạm thời' },
  { id: 'CLIENT_LIFECYCLE', label: 'Vận hành chung & hồ sơ người chơi' },
];

export type SystemLogOutcome = 'SUCCESS' | 'FAILURE' | 'UNHANDLED';

export type PlayerActivityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_REJECTED'
  | 'LOGOUT'
  | 'SESSION_IDLE_EXPIRED_15M'
  | 'SECOND_DEVICE_CONFLICT_REJECTED'
  | 'SESSION_DISPLACED'
  | 'MATCH_START'
  | 'MATCH_WIN'
  | 'MATCH_LOSS'
  | 'STAGE_UNLOCKED'
  | 'AVATAR_CHANGED'
  | 'DISPLAY_NAME_CHANGED'
  | 'SETTINGS_CHANGED'
  | 'COOP_ROOM_CREATED'
  | 'COOP_ROOM_JOINED'
  | 'COOP_ROOM_LEFT'
  | 'COOP_ROOM_CLOSED'
  | 'WEBRTC_PEER_ERROR'
  | 'ROLE_PERMISSION_CHANGED'
  | 'PLAYER_LEVEL_CHANGED'
  | 'PLAYER_LEVEL_DATA_MISMATCH'
  | 'CLIENT_XP_TAMPER_REJECTED'
  | 'XP_GRANT_REJECTED'
  | 'SYSTEM_DIAGNOSTIC';

export interface SystemAuditLogEntry {
  logId: string;
  timestampMs: number;
  datePartition: string; // YYYY-MM-DD (UTC)
  severity: SystemLogSeverity;
  category: SystemLogCategory;
  eventType: PlayerActivityEventType | string;
  message: string;
  uid: string | null;
  userEmail: string | null;
  displayName: string | null;
  sessionId: string | null;
  deviceId: string | null;
  roomCode: string | null;
  stageId: number | null;
  gameMode: string | null;
  source: string;
  outcome: SystemLogOutcome;
  errorCode: string | null;
  sanitizedError: string | null;
  sanitizedStack: string | null;
  repeatCount: number;
  lastRepeatedAtMs: number;
  retentionTier: 'PERMANENT_AUDIT';
  metadata: Record<string, unknown>;
}

export type OperationalScopeType = 'SESSION' | 'COOP_ROOM';
export type OperationalArchiveStatus = 'ACTIVE' | 'ARCHIVE_PENDING' | 'ARCHIVED_VERIFIED';

export interface TemporaryOperationalEvent {
  eventId: string;
  scopeKey: string;
  scopeType: OperationalScopeType;
  timestampMs: number;
  datePartition: string;
  uid: string | null;
  sessionId: string | null;
  roomCode: string | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface TemporaryOperationalLogBuffer {
  scopeKey: string;
  scopeType: OperationalScopeType;
  ownerUid: string | null;
  sessionId: string | null;
  roomCode: string | null;
  startedAtMs: number;
  endedAtMs: number | null;
  isEnded: boolean;
  status: OperationalArchiveStatus;
  retryCount: number;
  lastAttemptAtMs: number | null;
  lastError: string | null;
  events: TemporaryOperationalEvent[];
}

export interface ArchiveBatchRecord {
  archiveId: string;
  scopeKey: string;
  scopeType: OperationalScopeType;
  datePartitions: string[];
  uids: string[];
  createdAtMs: number;
  eventCount: number;
  byteSize: number;
  checksum: string;
  serializedPayload: string;
  events: TemporaryOperationalEvent[];
}

export interface ArchiveManifestRecord {
  archiveId: string;
  scopeKey: string;
  scopeType: OperationalScopeType;
  status: 'ARCHIVED_VERIFIED';
  verifiedAtMs: number;
  eventCount: number;
  byteSize: number;
  checksum: string;
  datePartitions: string[];
  uids: string[];
}

export interface PermanentArchiveStorageAdapter {
  writeArchiveBatch(batch: ArchiveBatchRecord): Promise<void>;
  readArchiveBatch(archiveId: string): Promise<ArchiveBatchRecord | null>;
  listArchiveBatches(): Promise<ArchiveBatchRecord[]>;
  writeArchiveManifest(manifest: ArchiveManifestRecord): Promise<void>;
  readArchiveManifest(archiveId: string): Promise<ArchiveManifestRecord | null>;
  listArchiveManifests(): Promise<ArchiveManifestRecord[]>;
}

export interface LogQueryFilter {
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  severity?: SystemLogSeverity | 'ALL';
  category?: SystemLogCategory | 'ALL';
  searchQuery?: string; // UID, displayName, email, roomCode, message
  uid?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedLogResult {
  success: boolean;
  errorCode?: 'PERMISSION_DENIED' | 'INVALID_FILTER';
  errorMessage?: string;
  items: SystemAuditLogEntry[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  criticalCount: number;
  errorCount: number;
}

export type BackupExportScope = 'DATE_RANGE' | 'SINGLE_PLAYER' | 'ALL_PLAYERS_IN_RANGE';
export type BackupExportFormat = 'JSON' | 'CSV';

export interface BackupExportOptions {
  scope: BackupExportScope;
  format: BackupExportFormat;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  targetUid?: string;
  triggerBrowserDownload?: boolean;
  nowMs?: number;
}

export interface BackupExportResult {
  success: boolean;
  errorCode?: 'PERMISSION_DENIED' | 'INVALID_ARGUMENTS' | 'INTEGRITY_CHECK_FAILED' | 'EXPORT_ERROR';
  errorMessage?: string;
  fileName?: string;
  mimeType?: string;
  content?: string;
  byteSize?: number;
  exportedLogCount?: number;
  archivedEventCount?: number;
  pagesTraversed?: number;
  checksum?: string;
}

export interface ArchiveCleanupStepResult {
  success: boolean;
  errorCode?:
    | 'PERMISSION_DENIED'
    | 'SCOPE_NOT_FOUND'
    | 'SCOPE_STILL_ACTIVE'
    | 'ACTIVE_SESSION_PROTECTED'
    | 'ARCHIVE_WRITE_FAILED'
    | 'ARCHIVE_VERIFY_FAILED'
    | 'MANIFEST_WRITE_FAILED';
  errorMessage?: string;
  scopeKey: string;
  archiveId?: string;
  alreadyCleaned?: boolean;
  stepsCompleted: number[];
  eventCount?: number;
  byteSize?: number;
  checksum?: string;
}

const AUDIT_LS_KEYS = {
  PERMANENT_LOGS: 'bantank_m751_permanent_audit_logs_v1',
  TEMP_OPERATIONAL: 'bantank_m751_temp_operational_logs_v1',
  ARCHIVE_BATCHES: 'bantank_m751_archive_batches_v1',
  ARCHIVE_MANIFESTS: 'bantank_m751_archive_manifests_v1',
} as const;

const IDB_NAME = 'bantank_system_audit_db_v1';
const IDB_VERSION = 1;
const MAX_LOCALSTORAGE_MIRROR_LOGS = 1500;
const DEDUP_WINDOW_MS = 8_000;
const BURST_WINDOW_MS = 1_000;
const MAX_NON_CRITICAL_PER_SECOND = 40;

const SENSITIVE_KEY_REGEX =
  /(password|passcode|pwd|secret|private[_-]?key|api[_-]?key|id[_-]?token|access[_-]?token|refresh[_-]?token|oauth[_-]?token|credential|authorization|bearer|client[_-]?secret)/i;

const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const URL_TOKEN_PARAM_REGEX =
  /([?&](?:token|id_token|access_token|refresh_token|oauth_token|password|passcode|secret|apiKey|key)=)[^&\s#]+/gi;
const INLINE_KV_SECRET_REGEX =
  /\b((?:password|passcode|idToken|accessToken|refreshToken|oauthToken|secret|apiKey)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi;

export function formatDatePartitionUTC(timestampMs: number): string {
  const safeMs = Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : Date.now();
  return new Date(safeMs).toISOString().slice(0, 10);
}

/**
 * Deterministic 64-bit FNV-1a dual-lane hex checksum (16 hex chars) for fast, synchronous & async
 * integrity verification across both browser and headless Node environments.
 */
export function computeCanonicalChecksum(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code ^ ((i & 0xff) >>> 0);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `fnv64_${hex1}${hex2}`;
}

export function computeUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return unescape(encodeURIComponent(text)).length;
}

/**
 * Redacts all sensitive credentials, tokens, passwords, and capability URLs from free-form text.
 */
export function redactSensitiveString(raw: string | null | undefined, maxLen = 2000): string {
  if (typeof raw !== 'string') return '';
  if (!raw) return '';
  let cleaned = raw
    .replace(JWT_TOKEN_REGEX, '[REDACTED_JWT]')
    .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(URL_TOKEN_PARAM_REGEX, '$1[REDACTED]')
    .replace(INLINE_KV_SECRET_REGEX, '$1[REDACTED]');
  if (cleaned.length > maxLen) {
    cleaned = `${cleaned.slice(0, maxLen)}…[TRUNCATED]`;
  }
  return cleaned;
}

/**
 * Deeply clones and sanitizes metadata objects, replacing any sensitive keys or embedded tokens.
 */
export function redactSensitiveMetadata(
  value: unknown,
  depth = 0
): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 4) return '[MAX_DEPTH]';
  if (typeof value === 'string') {
    return redactSensitiveString(value, 1000);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactSensitiveMetadata(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 40);
    for (const [k, v] of entries) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactSensitiveMetadata(v, depth + 1);
      }
    }
    return out;
  }
  return redactSensitiveString(String(value), 500);
}

/**
 * Default durable archive adapter backed by in-memory map + localStorage + IndexedDB mirror.
 */
export class LocalDurableArchiveStorageAdapter implements PermanentArchiveStorageAdapter {
  private batches = new Map<string, ArchiveBatchRecord>();
  private manifests = new Map<string, ArchiveManifestRecord>();
  public simulateNextWriteFailure = false;
  public simulateNextReadCorruptedChecksum = false;
  public simulateNextManifestFailure = false;

  constructor() {
    this.hydrateFromLocalStorage();
  }

  private hydrateFromLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawBatches = window.localStorage.getItem(AUDIT_LS_KEYS.ARCHIVE_BATCHES);
      if (rawBatches) {
        const parsed = JSON.parse(rawBatches) as ArchiveBatchRecord[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.archiveId === 'string') {
              this.batches.set(item.archiveId, item);
            }
          }
        }
      }
      const rawManifests = window.localStorage.getItem(AUDIT_LS_KEYS.ARCHIVE_MANIFESTS);
      if (rawManifests) {
        const parsed = JSON.parse(rawManifests) as ArchiveManifestRecord[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.archiveId === 'string') {
              this.manifests.set(item.archiveId, item);
            }
          }
        }
      }
    } catch {
      // Ignore corrupted local storage
    }
  }

  private persistToLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const batchArr = Array.from(this.batches.values()).slice(-200);
      const manifestArr = Array.from(this.manifests.values()).slice(-400);
      window.localStorage.setItem(AUDIT_LS_KEYS.ARCHIVE_BATCHES, JSON.stringify(batchArr));
      window.localStorage.setItem(AUDIT_LS_KEYS.ARCHIVE_MANIFESTS, JSON.stringify(manifestArr));
    } catch {
      // Ignore quota errors on secondary mirror
    }
  }

  public async writeArchiveBatch(batch: ArchiveBatchRecord): Promise<void> {
    if (this.simulateNextWriteFailure) {
      this.simulateNextWriteFailure = false;
      throw new Error('Simulated archive storage write failure (network/unavailable)');
    }
    const copy: ArchiveBatchRecord = JSON.parse(JSON.stringify(batch));
    this.batches.set(copy.archiveId, copy);
    this.persistToLocalStorage();
    await writeIdbRecord('archive_batches', copy.archiveId, copy);
  }

  public async readArchiveBatch(archiveId: string): Promise<ArchiveBatchRecord | null> {
    const found =
      this.batches.get(archiveId) ??
      (await readIdbRecord<ArchiveBatchRecord>('archive_batches', archiveId));
    if (!found) return null;
    const copy: ArchiveBatchRecord = JSON.parse(JSON.stringify(found));
    if (this.simulateNextReadCorruptedChecksum) {
      this.simulateNextReadCorruptedChecksum = false;
      copy.serializedPayload = `${copy.serializedPayload} `;
    }
    return copy;
  }

  public async listArchiveBatches(): Promise<ArchiveBatchRecord[]> {
    return Array.from(this.batches.values())
      .map((b) => JSON.parse(JSON.stringify(b)) as ArchiveBatchRecord)
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  public async writeArchiveManifest(manifest: ArchiveManifestRecord): Promise<void> {
    if (this.simulateNextManifestFailure) {
      this.simulateNextManifestFailure = false;
      throw new Error('Simulated archive manifest write failure');
    }
    const copy: ArchiveManifestRecord = JSON.parse(JSON.stringify(manifest));
    this.manifests.set(copy.archiveId, copy);
    this.persistToLocalStorage();
    await writeIdbRecord('archive_manifests', copy.archiveId, copy);
  }

  public async readArchiveManifest(archiveId: string): Promise<ArchiveManifestRecord | null> {
    const found =
      this.manifests.get(archiveId) ??
      (await readIdbRecord<ArchiveManifestRecord>('archive_manifests', archiveId));
    return found ? (JSON.parse(JSON.stringify(found)) as ArchiveManifestRecord) : null;
  }

  public async listArchiveManifests(): Promise<ArchiveManifestRecord[]> {
    return Array.from(this.manifests.values())
      .map((m) => JSON.parse(JSON.stringify(m)) as ArchiveManifestRecord)
      .sort((a, b) => b.verifiedAtMs - a.verifiedAtMs);
  }

  public clearAllForTesting(): void {
    this.batches.clear();
    this.manifests.clear();
    this.simulateNextWriteFailure = false;
    this.simulateNextReadCorruptedChecksum = false;
    this.simulateNextManifestFailure = false;
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AUDIT_LS_KEYS.ARCHIVE_BATCHES);
      window.localStorage.removeItem(AUDIT_LS_KEYS.ARCHIVE_MANIFESTS);
    }
  }
}

function openAuditIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('permanent_logs')) {
          db.createObjectStore('permanent_logs', { keyPath: 'logId' });
        }
        if (!db.objectStoreNames.contains('temp_operational_logs')) {
          db.createObjectStore('temp_operational_logs', { keyPath: 'scopeKey' });
        }
        if (!db.objectStoreNames.contains('archive_batches')) {
          db.createObjectStore('archive_batches', { keyPath: 'archiveId' });
        }
        if (!db.objectStoreNames.contains('archive_manifests')) {
          db.createObjectStore('archive_manifests', { keyPath: 'archiveId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbRecord(storeName: string, _key: string, value: unknown): Promise<void> {
  const db = await openAuditIndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function readIdbRecord<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openAuditIndexedDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function deleteIdbRecord(storeName: string, key: string): Promise<void> {
  const db = await openAuditIndexedDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export class SystemAuditLogger {
  private static instance: SystemAuditLogger;

  private permanentLogs: SystemAuditLogEntry[] = [];
  private permanentLogById = new Map<string, SystemAuditLogEntry>();
  private tempOperationalLogs = new Map<string, TemporaryOperationalLogBuffer>();
  private archiveAdapter: PermanentArchiveStorageAdapter = new LocalDurableArchiveStorageAdapter();

  private dedupSignatureMap = new Map<string, { logId: string; timestampMs: number }>();
  private burstWindowStartMs = 0;
  private burstCountInWindow = 0;
  private monotonicSeq = 0;
  private globalListenersInstalled = false;
  private cleanupLocks = new Set<string>();
  private subscribers = new Set<() => void>();

  private constructor() {
    this.hydrateFromLocalStorage();
    this.installGlobalBrowserCaptureListeners();
  }

  public static getInstance(): SystemAuditLogger {
    if (!SystemAuditLogger.instance) {
      SystemAuditLogger.instance = new SystemAuditLogger();
    }
    return SystemAuditLogger.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch {
        // Ignore listener error
      }
    }
  }

  public setArchiveAdapter(adapter: PermanentArchiveStorageAdapter): void {
    this.archiveAdapter = adapter;
  }

  public getArchiveAdapter(): PermanentArchiveStorageAdapter {
    return this.archiveAdapter;
  }

  /**
   * Strict RBAC check: ONLY sole ADMIN (`linhnk2013@gmail.com`) can view, filter, export,
   * or trigger cleanup sweeps on System Audit Logs. `MOD` and `PLAYER` are always denied.
   */
  public canAccessSystemLogs(actorOverride?: AuthIdentityLike | null): boolean {
    const actor =
      actorOverride !== undefined ? actorOverride : AuthManager.getInstance().getCurrentUser();
    if (!actor || typeof actor.uid !== 'string' || actor.uid.trim().length === 0) {
      return false;
    }
    const rawActor = actor as {
      uid: string;
      email?: string | null;
      emailVerified?: boolean;
      providerData?: Array<{ providerId: string }>;
      providerIds?: string[];
      role?: string;
    };
    const normalizedActor = {
      uid: rawActor.uid.trim(),
      email: rawActor.email ?? null,
      emailVerified: Boolean(rawActor.emailVerified),
      providerData: rawActor.providerData,
      providerIds: rawActor.providerIds,
    };
    return isAdminUser(normalizedActor) && resolveUserRole(normalizedActor) === 'ADMIN';
  }

  private hydrateFromLocalStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const rawLogs = window.localStorage.getItem(AUDIT_LS_KEYS.PERMANENT_LOGS);
      if (rawLogs) {
        const parsed = JSON.parse(rawLogs) as SystemAuditLogEntry[];
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (entry && typeof entry.logId === 'string') {
              this.permanentLogs.push(entry);
              this.permanentLogById.set(entry.logId, entry);
            }
          }
          this.permanentLogs.sort((a, b) => b.timestampMs - a.timestampMs);
        }
      }

      const rawTemp = window.localStorage.getItem(AUDIT_LS_KEYS.TEMP_OPERATIONAL);
      if (rawTemp) {
        const parsedTemp = JSON.parse(rawTemp) as TemporaryOperationalLogBuffer[];
        if (Array.isArray(parsedTemp)) {
          for (const buf of parsedTemp) {
            if (buf && typeof buf.scopeKey === 'string') {
              this.tempOperationalLogs.set(buf.scopeKey, buf);
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private persistPermanentLogsMirror(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const trimmed = this.permanentLogs.slice(0, MAX_LOCALSTORAGE_MIRROR_LOGS);
      window.localStorage.setItem(AUDIT_LS_KEYS.PERMANENT_LOGS, JSON.stringify(trimmed));
    } catch {
      // Ignore quota errors; IndexedDB holds full store
    }
  }

  private persistTempOperationalMirror(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const list = Array.from(this.tempOperationalLogs.values());
      window.localStorage.setItem(AUDIT_LS_KEYS.TEMP_OPERATIONAL, JSON.stringify(list));
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Installs event-driven browser capture listeners for:
   * - Runtime exceptions (`window.error`)
   * - Static asset load failures (`<img|audio|video|script>` capture phase error)
   * - Unhandled promise rejections (`window.unhandledrejection`)
   */
  public installGlobalBrowserCaptureListeners(): void {
    if (this.globalListenersInstalled || typeof window === 'undefined') return;
    this.globalListenersInstalled = true;

    window.addEventListener(
      'error',
      (event: Event | ErrorEvent) => {
        try {
          const target = event.target as HTMLElement | null;
          if (
            target &&
            target !== (window as unknown as HTMLElement) &&
            typeof target.tagName === 'string'
          ) {
            const tag = target.tagName.toUpperCase();
            if (tag === 'IMG' || tag === 'AUDIO' || tag === 'VIDEO' || tag === 'SOURCE') {
              const srcAttr =
                (target as HTMLMediaElement | HTMLImageElement).currentSrc ||
                target.getAttribute('src') ||
                'unknown_asset';
              this.recordEvent({
                severity: 'WARNING',
                category: 'STATIC_ASSET_LOAD_ERROR',
                eventType: 'ASSET_LOAD_FAILED',
                message: `Không tải được tài nguyên tĩnh <${tag.toLowerCase()}>: ${srcAttr}`,
                source: `window.captureError(${tag})`,
                outcome: 'FAILURE',
                errorCode: 'STATIC_ASSET_404_OR_DECODE',
                metadata: { tag, assetUrl: srcAttr },
              });
              return;
            }
          }

          const errEvt = event as ErrorEvent;
          if (errEvt && (errEvt.message || errEvt.error)) {
            const msg = String(errEvt.message || errEvt.error?.message || 'Runtime exception');
            // Ignore benign Vite HMR disabled websocket noise
            if (msg.includes('WebSocket') && msg.includes('vite')) return;
            this.recordEvent({
              severity: 'ERROR',
              category: 'APP_SYSTEM_ERROR',
              eventType: 'WINDOW_RUNTIME_ERROR',
              message: msg,
              source: errEvt.filename
                ? `${errEvt.filename}:${errEvt.lineno ?? 0}:${errEvt.colno ?? 0}`
                : 'window.onerror',
              outcome: 'UNHANDLED',
              error: errEvt.error ?? msg,
            });
          }
        } catch {
          // Never throw inside global error listener
        }
      },
      true
    );

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      try {
        const reason = event?.reason;
        const msg =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : JSON.stringify(redactSensitiveMetadata(reason));
        if (msg.includes('WebSocket') && msg.includes('vite')) return;
        this.recordEvent({
          severity: 'ERROR',
          category: 'UNHANDLED_REJECTION',
          eventType: 'UNHANDLED_PROMISE_REJECTION',
          message: msg || 'Unhandled promise rejection',
          source: 'window.unhandledrejection',
          outcome: 'UNHANDLED',
          error: reason,
        });
      } catch {
        // Never throw inside unhandledrejection listener
      }
    });
  }

  /**
   * Appends a sanitized, rate-limited, deduplicated event to Permanent Audit Logs.
   * Safe to call from any gameplay/auth/audio/room handler (O(1), event-driven, non-blocking).
   */
  public recordEvent(params: {
    severity: SystemLogSeverity;
    category: SystemLogCategory;
    eventType: PlayerActivityEventType | string;
    message: string;
    uid?: string | null;
    userEmail?: string | null;
    displayName?: string | null;
    sessionId?: string | null;
    deviceId?: string | null;
    roomCode?: string | null;
    stageId?: number | null;
    gameMode?: string | null;
    source: string;
    outcome?: SystemLogOutcome;
    errorCode?: string | null;
    error?: unknown;
    metadata?: Record<string, unknown>;
    timestampMs?: number;
    skipDeduplication?: boolean;
  }): SystemAuditLogEntry | null {
    const nowMs =
      typeof params.timestampMs === 'number' && Number.isFinite(params.timestampMs)
        ? Math.floor(params.timestampMs)
        : Date.now();

    // Burst rate limiter for non-critical events so log storms cannot affect 60 FPS gameplay
    if (params.severity !== 'CRITICAL') {
      if (nowMs - this.burstWindowStartMs >= BURST_WINDOW_MS) {
        this.burstWindowStartMs = nowMs;
        this.burstCountInWindow = 0;
      }
      this.burstCountInWindow++;
      if (this.burstCountInWindow > MAX_NON_CRITICAL_PER_SECOND) {
        return null;
      }
    }

    const currentUser = AuthManager.getInstance().getCurrentUser();
    const sessionSnap = SessionManager.getInstance().getSnapshot();

    const resolvedUid =
      params.uid !== undefined ? params.uid : (currentUser?.uid ?? sessionSnap.uid ?? null);
    const resolvedEmail =
      params.userEmail !== undefined ? params.userEmail : (currentUser?.email ?? null);
    const resolvedDisplayName =
      params.displayName !== undefined
        ? params.displayName
        : (currentUser?.displayName ?? null);
    const resolvedSessionId =
      params.sessionId !== undefined ? params.sessionId : (sessionSnap.sessionId ?? null);
    const resolvedDeviceId =
      params.deviceId !== undefined ? params.deviceId : (sessionSnap.deviceId ?? null);

    const sanitizedMsg = redactSensitiveString(params.message, 1000);
    let sanitizedErr: string | null = null;
    let sanitizedStack: string | null = null;
    if (params.error !== undefined && params.error !== null) {
      if (params.error instanceof Error) {
        sanitizedErr = redactSensitiveString(params.error.message, 1000);
        sanitizedStack = params.error.stack
          ? redactSensitiveString(params.error.stack, 2500)
          : null;
      } else if (typeof params.error === 'string') {
        sanitizedErr = redactSensitiveString(params.error, 1000);
      } else {
        sanitizedErr = redactSensitiveString(
          JSON.stringify(redactSensitiveMetadata(params.error)),
          1000
        );
      }
    }

    const sanitizedMeta = (redactSensitiveMetadata(params.metadata ?? {}) ?? {}) as Record<
      string,
      unknown
    >;

    const dedupSignature = `${params.category}|${params.eventType}|${params.source}|${
      resolvedUid ?? 'anon'
    }|${sanitizedMsg.slice(0, 140)}|${sanitizedErr ?? ''}`;

    if (!params.skipDeduplication) {
      const prev = this.dedupSignatureMap.get(dedupSignature);
      if (prev && nowMs - prev.timestampMs <= DEDUP_WINDOW_MS) {
        const existing = this.permanentLogById.get(prev.logId);
        if (existing) {
          existing.repeatCount += 1;
          existing.lastRepeatedAtMs = nowMs;
          prev.timestampMs = nowMs;
          this.persistPermanentLogsMirror();
          void writeIdbRecord('permanent_logs', existing.logId, existing);
          this.notify();
          return existing;
        }
      }
    }

    const seq = ++this.monotonicSeq;
    const logId = `audit_${nowMs}_${seq.toString(36).padStart(4, '0')}`;
    const entry: SystemAuditLogEntry = {
      logId,
      timestampMs: nowMs,
      datePartition: formatDatePartitionUTC(nowMs),
      severity: params.severity,
      category: params.category,
      eventType: params.eventType,
      message: sanitizedMsg,
      uid: resolvedUid,
      userEmail: resolvedEmail ? redactSensitiveString(resolvedEmail, 160) : null,
      displayName: resolvedDisplayName ? redactSensitiveString(resolvedDisplayName, 80) : null,
      sessionId: resolvedSessionId ? redactSensitiveString(resolvedSessionId, 120) : null,
      deviceId: resolvedDeviceId ? redactSensitiveString(resolvedDeviceId, 120) : null,
      roomCode: params.roomCode ?? null,
      stageId: typeof params.stageId === 'number' ? params.stageId : null,
      gameMode: params.gameMode ?? null,
      source: redactSensitiveString(params.source, 160),
      outcome:
        params.outcome ??
        (params.severity === 'ERROR' || params.severity === 'CRITICAL' ? 'FAILURE' : 'SUCCESS'),
      errorCode: params.errorCode ? redactSensitiveString(params.errorCode, 120) : null,
      sanitizedError: sanitizedErr,
      sanitizedStack: sanitizedStack,
      repeatCount: 1,
      lastRepeatedAtMs: nowMs,
      retentionTier: 'PERMANENT_AUDIT',
      metadata: sanitizedMeta,
    };

    this.permanentLogs.unshift(entry);
    this.permanentLogById.set(entry.logId, entry);
    this.dedupSignatureMap.set(dedupSignature, { logId: entry.logId, timestampMs: nowMs });
    this.persistPermanentLogsMirror();
    void writeIdbRecord('permanent_logs', entry.logId, entry);
    this.notify();
    return entry;
  }

  // ===========================================================================
  // TEMPORARY OPERATIONAL LOGS & 9-STEP IDEMPOTENT ARCHIVE-BEFORE-CLEANUP
  // ===========================================================================

  public startOperationalScope(params: {
    scopeKey: string;
    scopeType: OperationalScopeType;
    ownerUid?: string | null;
    sessionId?: string | null;
    roomCode?: string | null;
    nowMs?: number;
  }): TemporaryOperationalLogBuffer {
    const nowMs = params.nowMs ?? Date.now();
    const existing = this.tempOperationalLogs.get(params.scopeKey);
    if (existing && !existing.isEnded) {
      return existing;
    }
    const buffer: TemporaryOperationalLogBuffer = {
      scopeKey: params.scopeKey,
      scopeType: params.scopeType,
      ownerUid: params.ownerUid ?? null,
      sessionId: params.sessionId ?? null,
      roomCode: params.roomCode ?? null,
      startedAtMs: nowMs,
      endedAtMs: null,
      isEnded: false,
      status: 'ACTIVE',
      retryCount: 0,
      lastAttemptAtMs: null,
      lastError: null,
      events: [],
    };
    this.tempOperationalLogs.set(params.scopeKey, buffer);
    this.persistTempOperationalMirror();
    void writeIdbRecord('temp_operational_logs', buffer.scopeKey, buffer);
    this.notify();
    return buffer;
  }

  public appendOperationalEvent(params: {
    scopeKey: string;
    scopeType: OperationalScopeType;
    eventType: string;
    message: string;
    uid?: string | null;
    sessionId?: string | null;
    roomCode?: string | null;
    metadata?: Record<string, unknown>;
    timestampMs?: number;
  }): TemporaryOperationalEvent {
    const nowMs = params.timestampMs ?? Date.now();
    let buffer = this.tempOperationalLogs.get(params.scopeKey);
    if (!buffer) {
      buffer = this.startOperationalScope({
        scopeKey: params.scopeKey,
        scopeType: params.scopeType,
        ownerUid: params.uid ?? null,
        sessionId: params.sessionId ?? null,
        roomCode: params.roomCode ?? null,
        nowMs,
      });
    }

    const idx = buffer.events.length + 1;
    const sanitizedMsg = redactSensitiveString(params.message, 800);
    const sanitizedMeta = (redactSensitiveMetadata(params.metadata ?? {}) ?? {}) as Record<
      string,
      unknown
    >;
    const deterministicEventId = `op_${computeCanonicalChecksum(
      `${params.scopeKey}|${idx}|${nowMs}|${params.eventType}|${sanitizedMsg}`
    )}`;

    const ev: TemporaryOperationalEvent = {
      eventId: deterministicEventId,
      scopeKey: params.scopeKey,
      scopeType: params.scopeType,
      timestampMs: nowMs,
      datePartition: formatDatePartitionUTC(nowMs),
      uid: params.uid ?? buffer.ownerUid ?? null,
      sessionId: params.sessionId ?? buffer.sessionId ?? null,
      roomCode: params.roomCode ?? buffer.roomCode ?? null,
      eventType: params.eventType,
      message: sanitizedMsg,
      metadata: sanitizedMeta,
    };

    buffer.events.push(ev);
    this.persistTempOperationalMirror();
    void writeIdbRecord('temp_operational_logs', buffer.scopeKey, buffer);
    return ev;
  }

  public markOperationalScopeEnded(scopeKey: string, endedAtMs = Date.now()): boolean {
    const buffer = this.tempOperationalLogs.get(scopeKey);
    if (!buffer) return false;
    buffer.isEnded = true;
    buffer.endedAtMs = buffer.endedAtMs ?? endedAtMs;
    this.persistTempOperationalMirror();
    void writeIdbRecord('temp_operational_logs', buffer.scopeKey, buffer);
    this.notify();
    return true;
  }

  /**
   * Executes the mandatory 9-step idempotent Archive-Verify-Cleanup pipeline (PHẦN 5.2):
   * 1. Detect valid end condition & protect active `/user_sessions/{uid}` leases.
   * 2. Mark operational log status = `ARCHIVE_PENDING`.
   * 3. Aggregate final events with deterministic eventIds, partitioned by date & uid.
   * 4. Write archive batch to permanent archive storage.
   * 5. Await storage write completion.
   * 6. Read back & verify: archive exists, byteSize > 0, eventCount matches, checksum matches.
   * 7. Write manifest with status = `ARCHIVED_VERIFIED`.
   * 8. ONLY AFTER `ARCHIVED_VERIFIED`, delete temporary operational log.
   * 9. Record permanent cleanup success log.
   */
  public async archiveAndCleanupOperationalLog(
    scopeKey: string,
    options?: {
      markEndedNow?: boolean;
      nowMs?: number;
      actorOverride?: AuthIdentityLike | null;
      internalSystemTrigger?: boolean;
    }
  ): Promise<ArchiveCleanupStepResult> {
    if (!options?.internalSystemTrigger && !this.canAccessSystemLogs(options?.actorOverride)) {
      this.recordEvent({
        severity: 'WARNING',
        category: 'SECURITY_PERMISSION_DENIED',
        eventType: 'SYSTEM_DIAGNOSTIC',
        message: `Từ chối quyền gọi dọn log tạm (${scopeKey}) từ tài khoản không phải ADMIN.`,
        source: 'SystemAuditLogger.archiveAndCleanupOperationalLog',
        outcome: 'FAILURE',
        errorCode: 'PERMISSION_DENIED',
      });
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Chỉ ADMIN duy nhất mới có quyền thực thi dọn dẹp và lưu trữ log.',
        scopeKey,
        stepsCompleted: [],
      };
    }

    const nowMs = options?.nowMs ?? Date.now();
    const stepsCompleted: number[] = [];
    const deterministicArchiveId = `arch_${scopeKey.replace(/[^A-Za-z0-9_-]/g, '_')}`;

    // Idempotency guard: if already cleaned and manifest exists, return immediately without duplicating
    const existingBuffer = this.tempOperationalLogs.get(scopeKey);
    if (!existingBuffer) {
      const priorManifest = await this.archiveAdapter.readArchiveManifest(deterministicArchiveId);
      if (priorManifest && priorManifest.status === 'ARCHIVED_VERIFIED') {
        return {
          success: true,
          scopeKey,
          archiveId: priorManifest.archiveId,
          alreadyCleaned: true,
          stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          eventCount: priorManifest.eventCount,
          byteSize: priorManifest.byteSize,
          checksum: priorManifest.checksum,
        };
      }
      return {
        success: false,
        errorCode: 'SCOPE_NOT_FOUND',
        errorMessage: `Không tìm thấy vùng log tạm (${scopeKey}).`,
        scopeKey,
        stepsCompleted,
      };
    }

    if (this.cleanupLocks.has(scopeKey)) {
      return {
        success: false,
        errorCode: 'SCOPE_STILL_ACTIVE',
        errorMessage: `Tiến trình lưu trữ cho ${scopeKey} đang được xử lý.`,
        scopeKey,
        stepsCompleted,
      };
    }

    this.cleanupLocks.add(scopeKey);
    try {
      if (options?.markEndedNow) {
        existingBuffer.isEnded = true;
        existingBuffer.endedAtMs = existingBuffer.endedAtMs ?? nowMs;
      }

      // STEP 1: Verify valid end condition AND protect active single-device session lease
      if (!existingBuffer.isEnded) {
        return {
          success: false,
          errorCode: 'SCOPE_STILL_ACTIVE',
          errorMessage: `Không được xóa log tạm khi phiên/phòng (${scopeKey}) vẫn đang hoạt động.`,
          scopeKey,
          stepsCompleted,
        };
      }

      if (existingBuffer.scopeType === 'SESSION' && existingBuffer.sessionId) {
        const liveSession = SessionManager.getInstance().getSnapshot();
        if (
          liveSession.status === 'ACTIVE' &&
          liveSession.sessionId === existingBuffer.sessionId &&
          !options?.markEndedNow
        ) {
          return {
            success: false,
            errorCode: 'ACTIVE_SESSION_PROTECTED',
            errorMessage:
              'Bảo vệ phiên hoạt động: Không dọn log của phiên đang ACTIVE trên /user_sessions/{uid}.',
            scopeKey,
            stepsCompleted,
          };
        }
      }
      stepsCompleted.push(1);

      // STEP 2: Mark status = ARCHIVE_PENDING
      existingBuffer.status = 'ARCHIVE_PENDING';
      existingBuffer.lastAttemptAtMs = nowMs;
      this.persistTempOperationalMirror();
      await writeIdbRecord('temp_operational_logs', existingBuffer.scopeKey, existingBuffer);
      stepsCompleted.push(2);

      // STEP 3: Aggregate & deduplicate final events by deterministic eventId
      const uniqueEventsMap = new Map<string, TemporaryOperationalEvent>();
      // Merge with any previously archived events for this exact scopeKey so retries never lose or duplicate
      const priorArchive = await this.archiveAdapter.readArchiveBatch(deterministicArchiveId);
      if (priorArchive && Array.isArray(priorArchive.events)) {
        for (const ev of priorArchive.events) {
          uniqueEventsMap.set(ev.eventId, ev);
        }
      }
      for (const ev of existingBuffer.events) {
        uniqueEventsMap.set(ev.eventId, ev);
      }
      if (uniqueEventsMap.size === 0) {
        // Ensure non-empty valid payload even if scope ended with 0 intermediate events
        const summaryEv: TemporaryOperationalEvent = {
          eventId: `op_${computeCanonicalChecksum(`${scopeKey}| close_marker`)}`,
          scopeKey,
          scopeType: existingBuffer.scopeType,
          timestampMs: existingBuffer.endedAtMs ?? nowMs,
          datePartition: formatDatePartitionUTC(existingBuffer.endedAtMs ?? nowMs),
          uid: existingBuffer.ownerUid,
          sessionId: existingBuffer.sessionId,
          roomCode: existingBuffer.roomCode,
          eventType: 'SCOPE_CLOSED_SUMMARY',
          message: `Đóng vùng vận hành tạm ${scopeKey}`,
          metadata: { startedAtMs: existingBuffer.startedAtMs },
        };
        uniqueEventsMap.set(summaryEv.eventId, summaryEv);
      }

      const aggregatedEvents = Array.from(uniqueEventsMap.values()).sort(
        (a, b) => a.timestampMs - b.timestampMs || a.eventId.localeCompare(b.eventId)
      );
      const datePartitions = Array.from(new Set(aggregatedEvents.map((e) => e.datePartition))).sort();
      const uids = Array.from(
        new Set(aggregatedEvents.map((e) => e.uid).filter((u): u is string => Boolean(u)))
      ).sort();

      const serializedPayload = JSON.stringify({
        archiveId: deterministicArchiveId,
        scopeKey,
        scopeType: existingBuffer.scopeType,
        datePartitions,
        uids,
        events: aggregatedEvents,
      });
      const expectedByteSize = computeUtf8ByteLength(serializedPayload);
      const expectedChecksum = computeCanonicalChecksum(serializedPayload);

      const batchRecord: ArchiveBatchRecord = {
        archiveId: deterministicArchiveId,
        scopeKey,
        scopeType: existingBuffer.scopeType,
        datePartitions,
        uids,
        createdAtMs: nowMs,
        eventCount: aggregatedEvents.length,
        byteSize: expectedByteSize,
        checksum: expectedChecksum,
        serializedPayload,
        events: aggregatedEvents,
      };
      stepsCompleted.push(3);

      // STEP 4 & STEP 5: Write to permanent archive store and await completion
      try {
        await this.archiveAdapter.writeArchiveBatch(batchRecord);
        stepsCompleted.push(4);
        stepsCompleted.push(5);
      } catch (writeErr: unknown) {
        return await this.handleArchivePipelineFailure(
          existingBuffer,
          'ARCHIVE_WRITE_FAILED',
          writeErr,
          stepsCompleted,
          nowMs
        );
      }

      // STEP 6: Read back & verify existence, byteSize > 0, eventCount, and checksum
      let verifiedBatch: ArchiveBatchRecord | null = null;
      try {
        verifiedBatch = await this.archiveAdapter.readArchiveBatch(deterministicArchiveId);
      } catch (readErr: unknown) {
        return await this.handleArchivePipelineFailure(
          existingBuffer,
          'ARCHIVE_VERIFY_FAILED',
          readErr,
          stepsCompleted,
          nowMs
        );
      }

      const actualBytes = verifiedBatch
        ? computeUtf8ByteLength(verifiedBatch.serializedPayload)
        : 0;
      const actualChecksum = verifiedBatch
        ? computeCanonicalChecksum(verifiedBatch.serializedPayload)
        : '';

      if (
        !verifiedBatch ||
        actualBytes <= 0 ||
        actualBytes !== expectedByteSize ||
        verifiedBatch.eventCount !== aggregatedEvents.length ||
        verifiedBatch.events.length !== aggregatedEvents.length ||
        actualChecksum !== expectedChecksum ||
        verifiedBatch.checksum !== expectedChecksum
      ) {
        return await this.handleArchivePipelineFailure(
          existingBuffer,
          'ARCHIVE_VERIFY_FAILED',
          new Error(
            `Archive readback verification mismatch for ${deterministicArchiveId} (bytes=${actualBytes}/${expectedByteSize}, count=${verifiedBatch?.eventCount ?? 0}/${aggregatedEvents.length}, checksumMatch=${actualChecksum === expectedChecksum})`
          ),
          stepsCompleted,
          nowMs
        );
      }
      stepsCompleted.push(6);

      // STEP 7: Persist manifest with status = ARCHIVED_VERIFIED
      const manifest: ArchiveManifestRecord = {
        archiveId: deterministicArchiveId,
        scopeKey,
        scopeType: existingBuffer.scopeType,
        status: 'ARCHIVED_VERIFIED',
        verifiedAtMs: nowMs,
        eventCount: aggregatedEvents.length,
        byteSize: expectedByteSize,
        checksum: expectedChecksum,
        datePartitions,
        uids,
      };

      try {
        await this.archiveAdapter.writeArchiveManifest(manifest);
        const manifestReadback = await this.archiveAdapter.readArchiveManifest(
          deterministicArchiveId
        );
        if (!manifestReadback || manifestReadback.status !== 'ARCHIVED_VERIFIED') {
          throw new Error('Manifest readback missing or not ARCHIVED_VERIFIED');
        }
        stepsCompleted.push(7);
      } catch (manifestErr: unknown) {
        return await this.handleArchivePipelineFailure(
          existingBuffer,
          'MANIFEST_WRITE_FAILED',
          manifestErr,
          stepsCompleted,
          nowMs
        );
      }

      // STEP 8: ONLY AFTER ARCHIVED_VERIFIED, delete the temporary operational log
      this.tempOperationalLogs.delete(scopeKey);
      this.persistTempOperationalMirror();
      await deleteIdbRecord('temp_operational_logs', scopeKey);
      stepsCompleted.push(8);

      // STEP 9: Record permanent audit log of successful archive & cleanup
      this.recordEvent({
        severity: 'INFO',
        category: 'LOG_CLEANUP_ARCHIVE',
        eventType: 'TEMP_LOG_ARCHIVED_AND_CLEANED',
        message: `Đã lưu trữ vĩnh viễn (${aggregatedEvents.length} sự kiện, ${expectedByteSize} B) và dọn log tạm ${scopeKey}.`,
        uid: existingBuffer.ownerUid,
        sessionId: existingBuffer.sessionId,
        roomCode: existingBuffer.roomCode,
        source: 'SystemAuditLogger.archiveAndCleanupOperationalLog',
        outcome: 'SUCCESS',
        timestampMs: nowMs,
        skipDeduplication: true,
        metadata: {
          scopeKey,
          archiveId: deterministicArchiveId,
          eventCount: aggregatedEvents.length,
          byteSize: expectedByteSize,
          checksum: expectedChecksum,
          datePartitions,
        },
      });
      stepsCompleted.push(9);
      this.notify();

      return {
        success: true,
        scopeKey,
        archiveId: deterministicArchiveId,
        stepsCompleted,
        eventCount: aggregatedEvents.length,
        byteSize: expectedByteSize,
        checksum: expectedChecksum,
      };
    } finally {
      this.cleanupLocks.delete(scopeKey);
    }
  }

  private async handleArchivePipelineFailure(
    buffer: TemporaryOperationalLogBuffer,
    errorCode:
      | 'ARCHIVE_WRITE_FAILED'
      | 'ARCHIVE_VERIFY_FAILED'
      | 'MANIFEST_WRITE_FAILED',
    err: unknown,
    stepsCompleted: number[],
    nowMs: number
  ): Promise<ArchiveCleanupStepResult> {
    const errText = redactSensitiveString(
      err instanceof Error ? err.message : String(err || 'Archive failure'),
      500
    );
    buffer.status = 'ARCHIVE_PENDING';
    buffer.retryCount += 1;
    buffer.lastAttemptAtMs = nowMs;
    buffer.lastError = errText;
    this.tempOperationalLogs.set(buffer.scopeKey, buffer);
    this.persistTempOperationalMirror();
    await writeIdbRecord('temp_operational_logs', buffer.scopeKey, buffer);

    this.recordEvent({
      severity: 'CRITICAL',
      category: 'LOG_CLEANUP_ARCHIVE',
      eventType: 'TEMP_LOG_ARCHIVE_FAILED_RETAINED',
      message: `Lỗi lưu trữ vĩnh viễn cho ${buffer.scopeKey} (lần thử #${buffer.retryCount}): Đã GIỮ NGUYÊN log tạm, tuyệt đối không xóa dữ liệu.`,
      uid: buffer.ownerUid,
      sessionId: buffer.sessionId,
      roomCode: buffer.roomCode,
      source: 'SystemAuditLogger.archiveAndCleanupOperationalLog',
      outcome: 'FAILURE',
      errorCode,
      error: err,
      timestampMs: nowMs,
      skipDeduplication: true,
      metadata: {
        scopeKey: buffer.scopeKey,
        retryCount: buffer.retryCount,
        retainedEventCount: buffer.events.length,
      },
    });
    this.notify();

    return {
      success: false,
      errorCode,
      errorMessage: errText,
      scopeKey: buffer.scopeKey,
      stepsCompleted,
    };
  }

  /**
   * Periodic / Admin sweep for stale `ARCHIVE_PENDING` or ended operational buffers.
   * Idempotent: never duplicates archived events even if triggered multiple times.
   */
  public async sweepStaleArchivePendingLogs(options?: {
    actorOverride?: AuthIdentityLike | null;
    internalSystemTrigger?: boolean;
    nowMs?: number;
  }): Promise<{
    success: boolean;
    errorCode?: 'PERMISSION_DENIED';
    sweptCount: number;
    cleanedKeys: string[];
    retainedKeys: string[];
  }> {
    if (!options?.internalSystemTrigger && !this.canAccessSystemLogs(options?.actorOverride)) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        sweptCount: 0,
        cleanedKeys: [],
        retainedKeys: [],
      };
    }

    const candidates = Array.from(this.tempOperationalLogs.values()).filter(
      (b) => b.isEnded || b.status === 'ARCHIVE_PENDING'
    );
    const cleanedKeys: string[] = [];
    const retainedKeys: string[] = [];

    for (const buf of candidates) {
      const res = await this.archiveAndCleanupOperationalLog(buf.scopeKey, {
        nowMs: options?.nowMs,
        actorOverride: options?.actorOverride,
        internalSystemTrigger: options?.internalSystemTrigger,
      });
      if (res.success) {
        cleanedKeys.push(buf.scopeKey);
      } else {
        retainedKeys.push(buf.scopeKey);
      }
    }

    return {
      success: true,
      sweptCount: candidates.length,
      cleanedKeys,
      retainedKeys,
    };
  }

  public getOperationalBuffersForAdmin(actorOverride?: AuthIdentityLike | null): {
    success: boolean;
    errorCode?: 'PERMISSION_DENIED';
    buffers: TemporaryOperationalLogBuffer[];
  } {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return { success: false, errorCode: 'PERMISSION_DENIED', buffers: [] };
    }
    const buffers = Array.from(this.tempOperationalLogs.values())
      .map((b) => JSON.parse(JSON.stringify(b)) as TemporaryOperationalLogBuffer)
      .sort((a, b) => b.startedAtMs - a.startedAtMs);
    return { success: true, buffers };
  }

  public async listVerifiedArchivesForAdmin(actorOverride?: AuthIdentityLike | null): Promise<{
    success: boolean;
    errorCode?: 'PERMISSION_DENIED';
    manifests: ArchiveManifestRecord[];
  }> {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return { success: false, errorCode: 'PERMISSION_DENIED', manifests: [] };
    }
    const manifests = await this.archiveAdapter.listArchiveManifests();
    return { success: true, manifests };
  }

  /**
   * Reads back and verifies checksum of a permanently archived batch for Admin inspection / timeline restore.
   */
  public async restoreArchiveBatch(
    archiveId: string,
    actorOverride?: AuthIdentityLike | null
  ): Promise<{
    success: boolean;
    errorCode?: 'PERMISSION_DENIED' | 'NOT_FOUND' | 'CHECKSUM_MISMATCH';
    errorMessage?: string;
    batch?: ArchiveBatchRecord;
    manifest?: ArchiveManifestRecord;
  }> {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Chỉ ADMIN duy nhất mới có quyền đọc bản lưu trữ vĩnh viễn.',
      };
    }
    const [batch, manifest] = await Promise.all([
      this.archiveAdapter.readArchiveBatch(archiveId),
      this.archiveAdapter.readArchiveManifest(archiveId),
    ]);
    if (!batch || !manifest) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        errorMessage: `Không tìm thấy gói lưu trữ (${archiveId}).`,
      };
    }
    const recomputed = computeCanonicalChecksum(batch.serializedPayload);
    if (recomputed !== batch.checksum || recomputed !== manifest.checksum) {
      return {
        success: false,
        errorCode: 'CHECKSUM_MISMATCH',
        errorMessage: `Kiểm tra toàn vẹn checksum thất bại cho gói lưu trữ ${archiveId}.`,
      };
    }
    return { success: true, batch, manifest };
  }

  // ===========================================================================
  // ADMIN QUERYING, MERGING FIRESTORE /role_audit_logs & BACKUP EXPORT
  // ===========================================================================

  /**
   * Syncs existing server-side `/role_audit_logs` from Firestore into the ADMIN view
   * without modifying or deleting any Firestore records.
   */
  public async syncFirestoreRoleAuditLogsForAdmin(
    actorOverride?: AuthIdentityLike | null
  ): Promise<number> {
    if (!this.canAccessSystemLogs(actorOverride)) return 0;
    const db = getFirebaseDb();
    if (!db) return 0;
    try {
      const q = query(collection(db, 'role_audit_logs'), orderBy('changedAt', 'desc'), limit(100));
      const snap = await getDocs(q);
      let imported = 0;
      snap.forEach((docSnap) => {
        const logId = `fs_role_audit_${docSnap.id}`;
        if (this.permanentLogById.has(logId)) return;
        const d = docSnap.data() as Record<string, unknown>;
        const rawTs = d.changedAt as { toMillis?: () => number } | number | undefined;
        const tsMs =
          typeof rawTs === 'number'
            ? rawTs
            : typeof rawTs?.toMillis === 'function'
              ? rawTs.toMillis()
              : Date.now();
        const targetUid = typeof d.targetUid === 'string' ? d.targetUid : null;
        const targetEmail = typeof d.targetEmail === 'string' ? d.targetEmail : null;
        const prevRole = typeof d.previousRole === 'string' ? d.previousRole : 'PLAYER';
        const newRole = typeof d.newRole === 'string' ? d.newRole : 'PLAYER';
        const entry: SystemAuditLogEntry = {
          logId,
          timestampMs: tsMs,
          datePartition: formatDatePartitionUTC(tsMs),
          severity: 'INFO',
          category: 'ADMIN_MOD_ACTION',
          eventType: 'ROLE_PERMISSION_CHANGED',
          message: `Firestore Role Audit: ${targetEmail || targetUid || 'user'} (${prevRole} -> ${newRole})`,
          uid: targetUid,
          userEmail: targetEmail ? redactSensitiveString(targetEmail, 160) : null,
          displayName: null,
          sessionId: null,
          deviceId: null,
          roomCode: null,
          stageId: null,
          gameMode: null,
          source: 'Firestore:/role_audit_logs',
          outcome: 'SUCCESS',
          errorCode: null,
          sanitizedError: null,
          sanitizedStack: null,
          repeatCount: 1,
          lastRepeatedAtMs: tsMs,
          retentionTier: 'PERMANENT_AUDIT',
          metadata: redactSensitiveMetadata({
            firestoreDocId: docSnap.id,
            previousRole: prevRole,
            newRole,
            changedByEmail: d.changedByEmail ?? null,
          }) as Record<string, unknown>,
        };
        this.permanentLogs.push(entry);
        this.permanentLogById.set(logId, entry);
        imported++;
      });
      if (imported > 0) {
        this.permanentLogs.sort((a, b) => b.timestampMs - a.timestampMs);
        this.persistPermanentLogsMirror();
        this.notify();
      }
      return imported;
    } catch {
      return 0;
    }
  }

  private filterEntriesInternal(
    sourceList: SystemAuditLogEntry[],
    filter: LogQueryFilter
  ): SystemAuditLogEntry[] {
    const startDate = filter.startDate?.trim() || '';
    const endDate = filter.endDate?.trim() || '';
    const sev = filter.severity && filter.severity !== 'ALL' ? filter.severity : null;
    const cat = filter.category && filter.category !== 'ALL' ? filter.category : null;
    const exactUid = filter.uid?.trim() || '';
    const q = (filter.searchQuery || '').trim().toLowerCase();

    return sourceList.filter((item) => {
      if (startDate && item.datePartition < startDate) return false;
      if (endDate && item.datePartition > endDate) return false;
      if (sev && item.severity !== sev) return false;
      if (cat && item.category !== cat) return false;
      if (exactUid && item.uid !== exactUid) return false;
      if (q) {
        const hay = [
          item.uid || '',
          item.displayName || '',
          item.userEmail || '',
          item.roomCode || '',
          item.sessionId || '',
          item.eventType || '',
          item.message || '',
          item.source || '',
          item.errorCode || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  public querySystemLogs(
    filter: LogQueryFilter = {},
    actorOverride?: AuthIdentityLike | null
  ): PaginatedLogResult {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Từ chối truy cập: Chỉ ADMIN duy nhất được phép xem LOG HỆ THỐNG.',
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize: filter.pageSize ?? 20,
        criticalCount: 0,
        errorCount: 0,
      };
    }

    const filtered = this.filterEntriesInternal(this.permanentLogs, filter);
    let criticalCount = 0;
    let errorCount = 0;
    for (const item of filtered) {
      if (item.severity === 'CRITICAL') criticalCount++;
      else if (item.severity === 'ERROR') errorCount++;
    }

    const pageSize = Math.max(1, Math.min(200, Math.floor(filter.pageSize ?? 20)));
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(totalPages, Math.floor(filter.page ?? 1)));
    const offset = (currentPage - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize).map((e) => ({ ...e }));

    return {
      success: true,
      items,
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      criticalCount,
      errorCount,
    };
  }

  public queryPlayerActivityHistory(
    filter: LogQueryFilter = {},
    actorOverride?: AuthIdentityLike | null
  ): PaginatedLogResult {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Từ chối truy cập: Chỉ ADMIN duy nhất được phép xem Lịch sử người chơi.',
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize: filter.pageSize ?? 20,
        criticalCount: 0,
        errorCount: 0,
      };
    }

    const playerOnlySource = this.permanentLogs.filter((item) => Boolean(item.uid));
    const filtered = this.filterEntriesInternal(playerOnlySource, filter);
    let criticalCount = 0;
    let errorCount = 0;
    for (const item of filtered) {
      if (item.severity === 'CRITICAL') criticalCount++;
      else if (item.severity === 'ERROR') errorCount++;
    }

    const pageSize = Math.max(1, Math.min(200, Math.floor(filter.pageSize ?? 20)));
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(totalPages, Math.floor(filter.page ?? 1)));
    const offset = (currentPage - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize).map((e) => ({ ...e }));

    return {
      success: true,
      items,
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      criticalCount,
      errorCount,
    };
  }

  /**
   * M7.5.2 Section 7: Queries verified Player Level change & consistency audit logs strictly for sole ADMIN.
   */
  public queryPlayerLevelHistory(
    filter: LogQueryFilter = {},
    actorOverride?: AuthIdentityLike | null
  ): PaginatedLogResult {
    if (!this.canAccessSystemLogs(actorOverride)) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Từ chối truy cập: Chỉ ADMIN duy nhất được phép tra cứu Lịch sử Level.',
        items: [],
        totalItems: 0,
        totalPages: 0,
        currentPage: 1,
        pageSize: filter.pageSize ?? 20,
        criticalCount: 0,
        errorCount: 0,
      };
    }

    const levelEvents = new Set([
      'PLAYER_LEVEL_CHANGED',
      'PLAYER_LEVEL_DATA_MISMATCH',
      'CLIENT_XP_TAMPER_REJECTED',
      'XP_GRANT_REJECTED',
    ]);
    const levelOnlySource = this.permanentLogs.filter((item) => levelEvents.has(item.eventType));
    const filtered = this.filterEntriesInternal(levelOnlySource, filter);
    let criticalCount = 0;
    let errorCount = 0;
    for (const item of filtered) {
      if (item.severity === 'CRITICAL') criticalCount++;
      else if (item.severity === 'ERROR') errorCount++;
    }

    const pageSize = Math.max(1, Math.min(200, Math.floor(filter.pageSize ?? 20)));
    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.max(1, Math.min(totalPages, Math.floor(filter.page ?? 1)));
    const offset = (currentPage - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize).map((e) => ({ ...e }));

    return {
      success: true,
      items,
      totalItems,
      totalPages,
      currentPage,
      pageSize,
      criticalCount,
      errorCount,
    };
  }

  /**
   * Returns a specific UID's own login/logout history strictly for that authenticated player's
   * own System Statistics view (PHẦN 1.1), never returning any other UID's entries.
   */
  public getOwnAuthHistoryForUid(uid: string | null | undefined, maxEntries = 30): Array<{
    logId: string;
    timestampMs: number;
    eventType: string;
    message: string;
    sessionId: string | null;
    deviceId: string | null;
    outcome: SystemLogOutcome;
  }> {
    if (!uid) return [];
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || (currentUser.uid !== uid && !isAdminUser(currentUser))) {
      return [];
    }
    const authEvents = new Set([
      'LOGIN_SUCCESS',
      'LOGOUT',
      'SESSION_IDLE_EXPIRED_15M',
      'SECOND_DEVICE_CONFLICT_REJECTED',
      'SESSION_DISPLACED',
    ]);
    return this.permanentLogs
      .filter((e) => e.uid === uid && (e.category === 'AUTH_EVENT' || authEvents.has(e.eventType)))
      .slice(0, maxEntries)
      .map((e) => ({
        logId: e.logId,
        timestampMs: e.timestampMs,
        eventType: e.eventType,
        message: e.message,
        sessionId: e.sessionId,
        deviceId: e.deviceId,
        outcome: e.outcome,
      }));
  }

  /**
   * Full-pagination Backup Exporter (`BACKUP DỮ LIỆU LOG` — PHẦN 4.5):
   * - Supports JSON & CSV across DATE_RANGE, SINGLE_PLAYER, or ALL_PLAYERS_IN_RANGE.
   * - Traverses ALL pages so large datasets are never truncated to page 1.
   * - Includes permanently archived operational events matching the scope.
   * - Verifies non-empty payload and parse/row integrity BEFORE reporting success.
   * - Never deletes or mutates source logs.
   */
  public async exportBackupLogs(
    options: BackupExportOptions,
    actorOverride?: AuthIdentityLike | null
  ): Promise<BackupExportResult> {
    if (!this.canAccessSystemLogs(actorOverride)) {
      this.recordEvent({
        severity: 'WARNING',
        category: 'SECURITY_PERMISSION_DENIED',
        eventType: 'SYSTEM_DIAGNOSTIC',
        message: 'Từ chối quyền gọi BACKUP DỮ LIỆU LOG từ tài khoản không phải ADMIN.',
        source: 'SystemAuditLogger.exportBackupLogs',
        outcome: 'FAILURE',
        errorCode: 'PERMISSION_DENIED',
      });
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Chỉ ADMIN duy nhất mới có quyền sao lưu dữ liệu log.',
      };
    }

    if (options.scope === 'SINGLE_PLAYER' && !options.targetUid?.trim()) {
      return {
        success: false,
        errorCode: 'INVALID_ARGUMENTS',
        errorMessage: 'Vui lòng nhập hoặc chọn UID người chơi cần sao lưu.',
      };
    }

    const startDate = options.startDate?.trim() || '';
    const endDate = options.endDate?.trim() || '';
    if (startDate && endDate && startDate > endDate) {
      return {
        success: false,
        errorCode: 'INVALID_ARGUMENTS',
        errorMessage: 'Ngày bắt đầu không được lớn hơn ngày kết thúc.',
      };
    }

    const nowMs = options.nowMs ?? Date.now();
    const pageSize = 100;
    let currentPage = 1;
    let pagesTraversed = 0;
    const collectedLogs: SystemAuditLogEntry[] = [];

    const baseFilter: LogQueryFilter = {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      uid: options.scope === 'SINGLE_PLAYER' ? options.targetUid?.trim() : undefined,
      pageSize,
    };

    while (true) {
      const pageRes =
        options.scope === 'ALL_PLAYERS_IN_RANGE' || options.scope === 'SINGLE_PLAYER'
          ? this.queryPlayerActivityHistory({ ...baseFilter, page: currentPage }, actorOverride)
          : this.querySystemLogs({ ...baseFilter, page: currentPage }, actorOverride);

      if (!pageRes.success) {
        return {
          success: false,
          errorCode: 'PERMISSION_DENIED',
          errorMessage: pageRes.errorMessage,
        };
      }
      pagesTraversed++;
      collectedLogs.push(...pageRes.items);
      if (currentPage >= pageRes.totalPages || pageRes.items.length === 0) {
        break;
      }
      currentPage++;
    }

    // Also include verified archived operational events matching the backup scope
    const archiveBatches = await this.archiveAdapter.listArchiveBatches();
    const matchedArchivedEvents: TemporaryOperationalEvent[] = [];
    const seenArchivedIds = new Set<string>();
    for (const batch of archiveBatches) {
      for (const ev of batch.events) {
        if (seenArchivedIds.has(ev.eventId)) continue;
        if (startDate && ev.datePartition < startDate) continue;
        if (endDate && ev.datePartition > endDate) continue;
        if (options.scope === 'SINGLE_PLAYER' && ev.uid !== options.targetUid?.trim()) continue;
        if (options.scope === 'ALL_PLAYERS_IN_RANGE' && !ev.uid) continue;
        seenArchivedIds.add(ev.eventId);
        matchedArchivedEvents.push(ev);
      }
    }
    matchedArchivedEvents.sort((a, b) => b.timestampMs - a.timestampMs);

    const dateStamp = formatDatePartitionUTC(nowMs);
    const scopeSlug =
      options.scope === 'SINGLE_PLAYER'
        ? `uid_${(options.targetUid || '').trim().replace(/[^A-Za-z0-9_-]/g, '_')}`
        : options.scope === 'ALL_PLAYERS_IN_RANGE'
          ? 'all_players'
          : 'system_logs';

    let content = '';
    let mimeType = '';
    let fileName = '';

    if (options.format === 'JSON') {
      const exportDoc = {
        schemaVersion: 'M7.5.1-AUDIT-BACKUP-V1',
        exportedAtIso: new Date(nowMs).toISOString(),
        exportedAtMs: nowMs,
        scope: options.scope,
        filter: {
          startDate: startDate || null,
          endDate: endDate || null,
          targetUid: options.targetUid?.trim() || null,
        },
        counts: {
          permanentAuditLogs: collectedLogs.length,
          archivedOperationalEvents: matchedArchivedEvents.length,
          pagesTraversed,
        },
        permanentAuditLogs: collectedLogs,
        archivedOperationalEvents: matchedArchivedEvents,
      };
      content = JSON.stringify(exportDoc, null, 2);
      mimeType = 'application/json;charset=utf-8';
      fileName = `bantank_log_backup_${scopeSlug}_${dateStamp}.json`;

      // Verify JSON integrity before reporting success
      try {
        const parsedBack = JSON.parse(content) as { permanentAuditLogs?: unknown[] };
        if (
          !parsedBack ||
          !Array.isArray(parsedBack.permanentAuditLogs) ||
          parsedBack.permanentAuditLogs.length !== collectedLogs.length
        ) {
          return {
            success: false,
            errorCode: 'INTEGRITY_CHECK_FAILED',
            errorMessage: 'Kiểm tra toàn vẹn file JSON sao lưu không đạt.',
          };
        }
      } catch {
        return {
          success: false,
          errorCode: 'INTEGRITY_CHECK_FAILED',
          errorMessage: 'Không thể giải mã kiểm tra file JSON sao lưu.',
        };
      }
    } else {
      const csvEscape = (val: unknown): string => {
        const str = val === null || val === undefined ? '' : String(val);
        const safe = redactSensitiveString(str, 2000);
        if (/[",\r\n]/.test(safe)) {
          return `"${safe.replace(/"/g, '""')}"`;
        }
        return safe;
      };

      const headers = [
        'recordTier',
        'id',
        'timestampIso',
        'datePartition',
        'severity',
        'category',
        'eventType',
        'uid',
        'displayName',
        'userEmail',
        'sessionId',
        'roomCode',
        'stageId',
        'gameMode',
        'source',
        'outcome',
        'repeatCount',
        'message',
        'sanitizedError',
      ];
      const rows: string[] = [headers.join(',')];
      for (const log of collectedLogs) {
        rows.push(
          [
            'PERMANENT_AUDIT',
            log.logId,
            new Date(log.timestampMs).toISOString(),
            log.datePartition,
            log.severity,
            log.category,
            log.eventType,
            log.uid ?? '',
            log.displayName ?? '',
            log.userEmail ?? '',
            log.sessionId ?? '',
            log.roomCode ?? '',
            log.stageId ?? '',
            log.gameMode ?? '',
            log.source,
            log.outcome,
            log.repeatCount,
            log.message,
            log.sanitizedError ?? '',
          ]
            .map(csvEscape)
            .join(',')
        );
      }
      for (const opEv of matchedArchivedEvents) {
        rows.push(
          [
            'ARCHIVED_OPERATIONAL',
            opEv.eventId,
            new Date(opEv.timestampMs).toISOString(),
            opEv.datePartition,
            'INFO',
            'LOG_CLEANUP_ARCHIVE',
            opEv.eventType,
            opEv.uid ?? '',
            '',
            '',
            opEv.sessionId ?? '',
            opEv.roomCode ?? '',
            '',
            '',
            opEv.scopeKey,
            'SUCCESS',
            1,
            opEv.message,
            '',
          ]
            .map(csvEscape)
            .join(',')
        );
      }
      content = `\uFEFF${rows.join('\r\n')}`;
      mimeType = 'text/csv;charset=utf-8';
      fileName = `bantank_log_backup_${scopeSlug}_${dateStamp}.csv`;
    }

    const byteSize = computeUtf8ByteLength(content);
    if (byteSize <= 0) {
      return {
        success: false,
        errorCode: 'INTEGRITY_CHECK_FAILED',
        errorMessage: 'File sao lưu tạo ra có kích thước 0 byte.',
      };
    }

    const checksum = computeCanonicalChecksum(content);

    if (options.triggerBrowserDownload && typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(() => URL.revokeObjectURL(url), 5_000);
      } catch (dlErr) {
        return {
          success: false,
          errorCode: 'EXPORT_ERROR',
          errorMessage: `Không thể tải file sao lưu về trình duyệt: ${
            dlErr instanceof Error ? dlErr.message : String(dlErr)
          }`,
        };
      }
    }

    this.recordEvent({
      severity: 'INFO',
      category: 'LOG_BACKUP_OPERATION',
      eventType: 'LOG_BACKUP_EXPORTED',
      message: `Sao lưu thành công ${fileName} (${collectedLogs.length} log kiểm toán + ${matchedArchivedEvents.length} sự kiện lưu trữ, ${byteSize} B).`,
      source: 'SystemAuditLogger.exportBackupLogs',
      outcome: 'SUCCESS',
      timestampMs: nowMs,
      skipDeduplication: true,
      metadata: {
        fileName,
        format: options.format,
        scope: options.scope,
        exportedLogCount: collectedLogs.length,
        archivedEventCount: matchedArchivedEvents.length,
        byteSize,
        checksum,
      },
    });

    return {
      success: true,
      fileName,
      mimeType,
      content,
      byteSize,
      exportedLogCount: collectedLogs.length,
      archivedEventCount: matchedArchivedEvents.length,
      pagesTraversed,
      checksum,
    };
  }

  public getUniqueLoggedPlayersForAdmin(actorOverride?: AuthIdentityLike | null): Array<{
    uid: string;
    displayName: string | null;
    userEmail: string | null;
    lastSeenAtMs: number;
    eventCount: number;
  }> {
    if (!this.canAccessSystemLogs(actorOverride)) return [];
    const byUid = new Map<
      string,
      {
        uid: string;
        displayName: string | null;
        userEmail: string | null;
        lastSeenAtMs: number;
        eventCount: number;
      }
    >();
    for (const entry of this.permanentLogs) {
      if (!entry.uid) continue;
      const cur = byUid.get(entry.uid);
      if (!cur) {
        byUid.set(entry.uid, {
          uid: entry.uid,
          displayName: entry.displayName,
          userEmail: entry.userEmail,
          lastSeenAtMs: entry.timestampMs,
          eventCount: 1,
        });
      } else {
        cur.eventCount += 1;
        if (entry.timestampMs > cur.lastSeenAtMs) {
          cur.lastSeenAtMs = entry.timestampMs;
        }
        if (!cur.displayName && entry.displayName) cur.displayName = entry.displayName;
        if (!cur.userEmail && entry.userEmail) cur.userEmail = entry.userEmail;
      }
    }
    return Array.from(byUid.values()).sort((a, b) => b.lastSeenAtMs - a.lastSeenAtMs);
  }

  public clearAllForTesting(): void {
    this.permanentLogs = [];
    this.permanentLogById.clear();
    this.tempOperationalLogs.clear();
    this.dedupSignatureMap.clear();
    this.burstWindowStartMs = 0;
    this.burstCountInWindow = 0;
    this.monotonicSeq = 0;
    if (this.archiveAdapter instanceof LocalDurableArchiveStorageAdapter) {
      this.archiveAdapter.clearAllForTesting();
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AUDIT_LS_KEYS.PERMANENT_LOGS);
      window.localStorage.removeItem(AUDIT_LS_KEYS.TEMP_OPERATIONAL);
    }
    this.notify();
  }
}
