/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.1 & M7.5.2 – PLAYER STATISTICS, TOP MENU LEVEL & OFFICIAL 50-LEVEL SYSTEM
 *
 * Strict Data Integrity & Domain Separation Rules:
 * 1. Reads ONLY real player data bound strictly to the authenticated `uid` (zero state bleed
 *    between accounts, immediate reactive update on account switch, clean reset on sign-out).
 * 2. Strictly separates:
 *    - `Level` (Player Level 1–50 from verified `totalXp` via approved M7.5.2 formula)
 *    - `Quân hàm / Xếp hạng PvP` (`pvpRank`)
 *    - `Tổng điểm XP` (`totalXp`)
 *    - `Số dư Xu` (`xuBalance` — never auto-converted from XP or Level)
 * 3. Unverified XP Honesty (M7.5.2 Section 6.3):
 *    - When `totalXp` has NOT been verified yet (`xpVerificationStatus === 'UNVERIFIED'`),
 *      `level` is `null` (`Lv. --`), never defaulting to fake `Lv. 1`.
 *    - When a new or existing account is confirmed (`totalXp = 0`), `level` is `1` (`Lv. 1`).
 *    - When `totalXp >= 122,500`, `level` caps at `50` (`MAX LEVEL`), `xpNext` is `null`,
 *      while `totalXp` continues accumulating.
 */

import { collection, doc, getDoc, getDocs, limit, onSnapshot, query, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import {
  AuthManager,
  validatePersonalGmailUser,
  type AuthIdentityLike,
} from './authManager.ts';
import { ScoreManager } from './scoreManager.ts';
import { SessionManager, type SessionStatus } from './sessionManager.ts';
import { StageProgressionManager } from './stageProgression.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';
import {
  PlayerLevelManager,
  auditUserDocumentLevelConsistency,
  validateTotalXpValue,
  type XpGrantSource,
  type XpVerificationStatus,
  type UserLevelConsistencyAuditEntry,
  type XpGrantExecutionResult,
} from './playerLevelSystem.ts';

export interface PlayerAuthHistoryRecord {
  id: string;
  eventType:
    | 'LOGIN'
    | 'LOGOUT'
    | 'SESSION_IDLE_EXPIRED_15M'
    | 'SECOND_DEVICE_CONFLICT_REJECTED'
    | 'SESSION_DISPLACED';
  timestampMs: number;
  sessionId: string | null;
  deviceId: string | null;
  note: string;
}

export interface PersistedPerUidStats {
  uid: string;
  accumulatedBattleXp: number;
  highScoreXp: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  totalEnemiesDefeated: number;
  defeatedByType: {
    BASIC: number;
    FAST: number;
    POWER: number;
    ARMOR: number;
  };
  coopRoomsParticipated: number;
  totalLogins: number;
  firstLoginAtMs: number | null;
  lastLoginAtMs: number | null;
  lastLogoutAtMs: number | null;
  lastRecordedSessionId: string | null;
  recordedXpEventIds?: string[];
  authHistory: PlayerAuthHistoryRecord[];
}

export interface CloudUserStatsFields {
  uid: string;
  storedLevel: number | null;
  rankCode: string | null;
  totalXp: number | null;
  xu: number | null;
  createdAtMs: number | null;
  lastLoginAtMs: number | null;
}

export interface PlayerFullStatisticsSnapshot {
  uid: string | null;
  // 1. Official 50-Level System (M7.5.2 — strictly separated from Rank & Xu)
  level: number | null;
  levelStatus: 'CONFIGURED' | 'UNCONFIGURED';
  xpVerificationStatus: XpVerificationStatus;
  isMaxLevel: boolean;
  levelTopMenuBadge: string;
  levelSystemLabel: string;
  currentLevelFloorXp: number | null;
  xpNext: number | null;
  xpRemaining: number | null;
  levelProgressPercent: number;
  levelConsistencyAudit: UserLevelConsistencyAuditEntry | null;
  // 2. Quân hàm / Xếp hạng PvP hiện tại
  pvpRankCode: string | null;
  pvpRankLabel: string;
  // 3. Điểm thành tích (XP, Xu, High Score, Chiến dịch Stage)
  totalXp: number;
  highScoreXp: number;
  xuBalance: number;
  unlockedStage: number;
  completedStages: number[];
  // 4. Hoạt động chiến đấu & Co-op
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  totalEnemiesDefeated: number;
  defeatedByType: {
    BASIC: number;
    FAST: number;
    POWER: number;
    ARMOR: number;
  };
  coopRoomsParticipated: number;
  // 5. Thống kê đăng nhập & phiên hiện tại
  totalLogins: number;
  firstLoginAtMs: number | null;
  lastLoginAtMs: number | null;
  lastLogoutAtMs: number | null;
  authHistory: PlayerAuthHistoryRecord[];
  currentSession: {
    status: SessionStatus;
    isOnlineActive: boolean;
    sessionId: string | null;
    deviceId: string | null;
    lastKnownServerActiveMs: number | null;
    idleTimeoutMinutes: number;
  };
}

export interface UserLevelConsistencyScanEntry extends UserLevelConsistencyAuditEntry {
  dataSource: 'FIRESTORE_LIVE' | 'RAM_CACHE_ONLY';
  sourceLabel?: string;
}

export interface AdminLevelConsistencyScanResult {
  success: boolean;
  errorCode?: 'PERMISSION_DENIED' | 'FIRESTORE_UNAVAILABLE' | 'SCAN_FAILED';
  errorMessage?: string;
  isProductionVerified: boolean;
  sourceMode:
    | 'FIRESTORE_ONLY'
    | 'FIRESTORE_AND_CACHE'
    | 'CACHE_ONLY_UNVERIFIED'
    | 'NONE';
  cacheLabel?: string;
  scannedCount: number;
  firestoreScannedCount: number;
  cacheOnlyCount: number;
  inconsistentCount: number;
  entries: UserLevelConsistencyScanEntry[];
}

const STATS_STORAGE_PREFIX = 'bantank_m751_player_stats_v1_';
const MAX_AUTH_HISTORY_PER_USER = 50;

const KNOWN_PVP_RANK_LABELS: Record<string, string> = {
  PRIVATE: 'Binh nhì (PRIVATE)',
  CORPORAL: 'Hạ sĩ (CORPORAL)',
  SERGEANT: 'Trung sĩ (SERGEANT)',
  LIEUTENANT: 'Trung úy (LIEUTENANT)',
  CAPTAIN: 'Đại úy (CAPTAIN)',
  MAJOR: 'Thiếu tá (MAJOR)',
  COLONEL: 'Đại tá (COLONEL)',
  GENERAL: 'Đại tướng (GENERAL)',
};

function parseTimestampFieldMs(raw: unknown): number | null {
  if (raw instanceof Timestamp) {
    return raw.toMillis();
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  if (raw && typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
    const ms = (raw as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : null;
  }
  return null;
}

export function formatPvpRankLabel(rankCode: string | null | undefined): string {
  if (!rankCode || !rankCode.trim()) {
    return 'Chưa xếp hạng';
  }
  const normalized = rankCode.trim().toUpperCase();
  return KNOWN_PVP_RANK_LABELS[normalized] ?? rankCode.trim();
}

function resolveXpGrantSourceFromGameMode(gameMode: string): XpGrantSource {
  const mode = String(gameMode || '').toUpperCase();
  if (mode.includes('ONLINE')) {
    return 'COOP_ONLINE_BATTLE';
  }
  if (mode.includes('TWO_PLAYERS') || mode.includes('COOP')) {
    return 'COOP_AI_BATTLE';
  }
  return 'SOLO_BATTLE';
}

export class PlayerStatsManager {
  private static instance: PlayerStatsManager;

  private perUidStore = new Map<string, PersistedPerUidStats>();
  private lastKnownStatsRawByUid = new Map<string, string | null>();
  private cloudFieldsByUid = new Map<string, CloudUserStatsFields>();
  private cloudReadStatusByUid = new Map<string, 'IDLE' | 'LOADING' | 'VERIFIED' | 'ERROR'>();
  private cloudReadErrorCodeByUid = new Map<string, string | null>();
  private firestoreUnsubByUid = new Map<string, () => void>();
  private recordedMatchRunKeys = new Set<string>();
  private listeners = new Set<() => void>();
  private boundWindowRef: unknown = null;
  private boundStorageHandler: ((ev: StorageEvent) => void) | null = null;

  private constructor() {
    this.installReactiveListeners();
  }

  public static getInstance(): PlayerStatsManager {
    if (!PlayerStatsManager.instance) {
      PlayerStatsManager.instance = new PlayerStatsManager();
    }
    return PlayerStatsManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.ensureWindowStorageListener();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // Ignore listener error
      }
    }
  }

  private ensureWindowStorageListener(): void {
    const win =
      typeof globalThis !== 'undefined'
        ? (globalThis as unknown as {
            window?: {
              addEventListener?: (type: string, cb: (ev: StorageEvent) => void) => void;
              removeEventListener?: (type: string, cb: (ev: StorageEvent) => void) => void;
            };
          }).window
        : undefined;
    if (!win || typeof win.addEventListener !== 'function' || this.boundWindowRef === win) {
      return;
    }
    if (
      this.boundWindowRef &&
      this.boundStorageHandler &&
      typeof (this.boundWindowRef as { removeEventListener?: (t: string, cb: (e: StorageEvent) => void) => void })
        .removeEventListener === 'function'
    ) {
      (this.boundWindowRef as { removeEventListener: (t: string, cb: (e: StorageEvent) => void) => void }).removeEventListener(
        'storage',
        this.boundStorageHandler
      );
    }

    const handler = (ev: StorageEvent) => {
      if (!ev || typeof ev.key !== 'string') return;
      if (ev.key.startsWith(STATS_STORAGE_PREFIX)) {
        const uid = ev.key.slice(STATS_STORAGE_PREFIX.length).trim();
        if (uid) {
          this.syncPerUidStatsFromStorage(uid);
          this.notify();
        }
      }
    };
    win.addEventListener('storage', handler);
    this.boundWindowRef = win;
    this.boundStorageHandler = handler;
  }

  private installReactiveListeners(): void {
    this.ensureWindowStorageListener();
    AuthManager.getInstance().subscribe((user) => {
      if (user?.uid) {
        this.ensureUserFirestoreSubscription(user.uid);
      }
      this.notify();
    });

    StageProgressionManager.getInstance().subscribe(() => {
      this.notify();
    });

    PlayerLevelManager.getInstance().subscribeExternalSync(() => {
      this.notify();
    });

    SessionManager.getInstance().subscribe((snap) => {
      if (snap.uid && snap.status === 'ACTIVE' && snap.sessionId) {
        this.recordAuthenticatedSessionActive({
          uid: snap.uid,
          sessionId: snap.sessionId,
          deviceId: snap.deviceId,
          timestampMs: snap.lastKnownServerActiveMs ?? Date.now(),
        });
      }
      this.notify();
    });
  }

  public getCloudReadStatusForUid(uid: string | null | undefined): {
    status: 'IDLE' | 'LOADING' | 'VERIFIED' | 'ERROR';
    errorCode: string | null;
  } {
    if (!uid) return { status: 'IDLE', errorCode: null };
    const cleanUid = uid.trim();
    return {
      status: this.cloudReadStatusByUid.get(cleanUid) ?? 'IDLE',
      errorCode: this.cloudReadErrorCodeByUid.get(cleanUid) ?? null,
    };
  }

  private createEmptyPerUidStats(uid: string): PersistedPerUidStats {
    return {
      uid,
      accumulatedBattleXp: 0,
      highScoreXp: 0,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      totalEnemiesDefeated: 0,
      defeatedByType: {
        BASIC: 0,
        FAST: 0,
        POWER: 0,
        ARMOR: 0,
      },
      coopRoomsParticipated: 0,
      totalLogins: 0,
      firstLoginAtMs: null,
      lastLoginAtMs: null,
      lastLogoutAtMs: null,
      lastRecordedSessionId: null,
      recordedXpEventIds: [],
      authHistory: [],
    };
  }

  private parsePersistedStatsRaw(uid: string, raw: string | null): PersistedPerUidStats | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedPerUidStats>;
      if (!parsed || parsed.uid !== uid) return null;
      return {
        ...this.createEmptyPerUidStats(uid),
        ...parsed,
        defeatedByType: {
          BASIC: Number(parsed.defeatedByType?.BASIC || 0),
          FAST: Number(parsed.defeatedByType?.FAST || 0),
          POWER: Number(parsed.defeatedByType?.POWER || 0),
          ARMOR: Number(parsed.defeatedByType?.ARMOR || 0),
        },
        recordedXpEventIds: Array.isArray(parsed.recordedXpEventIds)
          ? parsed.recordedXpEventIds.map((x) => String(x))
          : [],
        authHistory: Array.isArray(parsed.authHistory) ? parsed.authHistory : [],
      };
    } catch {
      return null;
    }
  }

  private syncPerUidStatsFromStorage(uid: string): void {
    this.ensureWindowStorageListener();
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(`${STATS_STORAGE_PREFIX}${uid}`);
    const prevRaw = this.lastKnownStatsRawByUid.get(uid);
    if (raw === prevRaw && this.perUidStore.has(uid)) return;

    const disk = this.parsePersistedStatsRaw(uid, raw);
    if (!disk) {
      if (raw === null && !this.perUidStore.has(uid)) {
        this.lastKnownStatsRawByUid.set(uid, null);
      }
      return;
    }

    const mem = this.perUidStore.get(uid);
    if (!mem) {
      this.perUidStore.set(uid, disk);
      this.lastKnownStatsRawByUid.set(uid, raw);
      return;
    }

    // Safe commutative merge for multi-tab stats updates
    const mergedHistoryMap = new Map<string, PlayerAuthHistoryRecord>();
    for (const h of [...disk.authHistory, ...mem.authHistory]) {
      if (h && h.id && !mergedHistoryMap.has(h.id)) {
        mergedHistoryMap.set(h.id, h);
      }
    }
    const mergedHistory = Array.from(mergedHistoryMap.values())
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, MAX_AUTH_HISTORY_PER_USER);

    const mergedEventIds = Array.from(
      new Set([...(disk.recordedXpEventIds ?? []), ...(mem.recordedXpEventIds ?? [])])
    );

    const takeDiskTotals = (disk.recordedXpEventIds?.length ?? 0) >= (mem.recordedXpEventIds?.length ?? 0);
    const baseMatchSource = takeDiskTotals ? disk : mem;

    const merged: PersistedPerUidStats = {
      uid,
      accumulatedBattleXp: Math.max(disk.accumulatedBattleXp, mem.accumulatedBattleXp),
      highScoreXp: Math.max(disk.highScoreXp, mem.highScoreXp),
      matchesPlayed: Math.max(disk.matchesPlayed, mem.matchesPlayed),
      matchesWon: Math.max(disk.matchesWon, mem.matchesWon),
      matchesLost: Math.max(disk.matchesLost, mem.matchesLost),
      totalEnemiesDefeated: Math.max(disk.totalEnemiesDefeated, mem.totalEnemiesDefeated),
      defeatedByType: {
        BASIC: Math.max(disk.defeatedByType.BASIC, mem.defeatedByType.BASIC),
        FAST: Math.max(disk.defeatedByType.FAST, mem.defeatedByType.FAST),
        POWER: Math.max(disk.defeatedByType.POWER, mem.defeatedByType.POWER),
        ARMOR: Math.max(disk.defeatedByType.ARMOR, mem.defeatedByType.ARMOR),
      },
      coopRoomsParticipated: Math.max(disk.coopRoomsParticipated, mem.coopRoomsParticipated),
      totalLogins: Math.max(disk.totalLogins, mem.totalLogins),
      firstLoginAtMs:
        disk.firstLoginAtMs !== null && mem.firstLoginAtMs !== null
          ? Math.min(disk.firstLoginAtMs, mem.firstLoginAtMs)
          : (disk.firstLoginAtMs ?? mem.firstLoginAtMs),
      lastLoginAtMs:
        disk.lastLoginAtMs !== null && mem.lastLoginAtMs !== null
          ? Math.max(disk.lastLoginAtMs, mem.lastLoginAtMs)
          : (disk.lastLoginAtMs ?? mem.lastLoginAtMs),
      lastLogoutAtMs:
        disk.lastLogoutAtMs !== null && mem.lastLogoutAtMs !== null
          ? Math.max(disk.lastLogoutAtMs, mem.lastLogoutAtMs)
          : (disk.lastLogoutAtMs ?? mem.lastLogoutAtMs),
      lastRecordedSessionId: baseMatchSource.lastRecordedSessionId,
      recordedXpEventIds: mergedEventIds,
      authHistory: mergedHistory,
    };

    this.perUidStore.set(uid, merged);
    this.lastKnownStatsRawByUid.set(uid, raw);
  }

  private getOrLoadPerUidStats(uid: string): PersistedPerUidStats {
    this.syncPerUidStatsFromStorage(uid);
    const inMem = this.perUidStore.get(uid);
    if (inMem) return inMem;

    const record = this.createEmptyPerUidStats(uid);
    this.perUidStore.set(uid, record);
    return record;
  }

  private savePerUidStats(record: PersistedPerUidStats): void {
    this.perUidStore.set(record.uid, record);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const serialized = JSON.stringify(record);
        window.localStorage.setItem(`${STATS_STORAGE_PREFIX}${record.uid}`, serialized);
        this.lastKnownStatsRawByUid.set(record.uid, serialized);
      } catch {
        // Ignore quota errors
      }
    }
  }

  public ensureUserFirestoreSubscription(uid: string | null | undefined): void {
    if (!uid || this.firestoreUnsubByUid.has(uid)) return;
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || currentUser.uid !== uid || !validatePersonalGmailUser(currentUser).isValid) {
      return;
    }
    const db = getFirebaseDb();
    if (!db) {
      this.cloudReadStatusByUid.set(uid, 'ERROR');
      this.cloudReadErrorCodeByUid.set(uid, 'FIRESTORE_UNAVAILABLE');
      PlayerLevelManager.getInstance().markFirestoreReadFailed(uid);
      return;
    }

    if (!this.cloudReadStatusByUid.has(uid)) {
      this.cloudReadStatusByUid.set(uid, 'LOADING');
      this.cloudReadErrorCodeByUid.set(uid, null);
    }

    try {
      const ref = doc(db, 'users', uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const fromCache = Boolean(snap.metadata?.fromCache);
          if (!snap.exists()) {
            if (fromCache) {
              // Empty local cache while offline/pending must NOT fake 0 XP / Lv. 1!
              this.cloudReadStatusByUid.set(uid, 'ERROR');
              this.cloudReadErrorCodeByUid.set(uid, 'FIRESTORE_CACHE_ONLY_UNCONFIRMED');
              PlayerLevelManager.getInstance().markFirestoreReadFailed(uid);
              this.notify();
              return;
            }
            this.cloudFieldsByUid.set(uid, {
              uid,
              storedLevel: null,
              rankCode: null,
              totalXp: null,
              xu: null,
              createdAtMs: null,
              lastLoginAtMs: null,
            });
            this.cloudReadStatusByUid.set(uid, 'VERIFIED');
            this.cloudReadErrorCodeByUid.set(uid, null);
            const liveSess = SessionManager.getInstance().getSnapshot();
            if (liveSess.uid === uid && liveSess.status === 'ACTIVE') {
              PlayerLevelManager.getInstance().confirmNewAccountZeroBaselineSession(uid);
            }
            this.notify();
            return;
          }
          this.cloudReadStatusByUid.set(uid, 'VERIFIED');
          this.cloudReadErrorCodeByUid.set(uid, null);
          const data = snap.data() as Record<string, unknown>;
          this.applyCloudUserDocData(uid, data);
        },
        (err) => {
          const code =
            err && typeof (err as { code?: unknown }).code === 'string'
              ? String((err as { code: string }).code)
              : 'FIRESTORE_READ_ERROR';
          this.cloudReadStatusByUid.set(uid, 'ERROR');
          this.cloudReadErrorCodeByUid.set(uid, code);
          PlayerLevelManager.getInstance().markFirestoreReadFailed(uid);
          this.notify();
        }
      );
      this.firestoreUnsubByUid.set(uid, unsub);
    } catch (err) {
      const code =
        err && typeof (err as { code?: unknown }).code === 'string'
          ? String((err as { code: string }).code)
          : 'FIRESTORE_UNAVAILABLE';
      this.cloudReadStatusByUid.set(uid, 'ERROR');
      this.cloudReadErrorCodeByUid.set(uid, code);
      PlayerLevelManager.getInstance().markFirestoreReadFailed(uid);
    }
  }

  public async refreshCloudUserStatsOnce(
    uid: string | null | undefined,
    customReader?: (uid: string) => Promise<{
      exists: boolean;
      fromCache?: boolean;
      data?: Record<string, unknown> | null;
    }>
  ): Promise<{
    ok: boolean;
    status: 'VERIFIED_DOC' | 'VERIFIED_NEW_EMPTY' | 'OFFLINE_OR_ERROR';
    errorCode?: string;
  }> {
    if (!uid) {
      return { ok: false, status: 'OFFLINE_OR_ERROR', errorCode: 'INVALID_UID' };
    }
    const cleanUid = uid.trim();
    if (!customReader) {
      const db = getFirebaseDb();
      if (!db) {
        this.cloudReadStatusByUid.set(cleanUid, 'ERROR');
        this.cloudReadErrorCodeByUid.set(cleanUid, 'FIRESTORE_UNAVAILABLE');
        PlayerLevelManager.getInstance().markFirestoreReadFailed(cleanUid);
        this.notify();
        return { ok: false, status: 'OFFLINE_OR_ERROR', errorCode: 'FIRESTORE_UNAVAILABLE' };
      }
      try {
        const snap = await getDoc(doc(db, 'users', cleanUid));
        const fromCache = Boolean(snap.metadata?.fromCache);
        if (snap.exists()) {
          this.cloudReadStatusByUid.set(cleanUid, 'VERIFIED');
          this.cloudReadErrorCodeByUid.set(cleanUid, null);
          this.applyCloudUserDocData(cleanUid, snap.data() as Record<string, unknown>);
          return { ok: true, status: 'VERIFIED_DOC' };
        }
        if (fromCache) {
          this.cloudReadStatusByUid.set(cleanUid, 'ERROR');
          this.cloudReadErrorCodeByUid.set(cleanUid, 'FIRESTORE_CACHE_ONLY_UNCONFIRMED');
          PlayerLevelManager.getInstance().markFirestoreReadFailed(cleanUid);
          this.notify();
          return {
            ok: false,
            status: 'OFFLINE_OR_ERROR',
            errorCode: 'FIRESTORE_CACHE_ONLY_UNCONFIRMED',
          };
        }
        this.cloudReadStatusByUid.set(cleanUid, 'VERIFIED');
        this.cloudReadErrorCodeByUid.set(cleanUid, null);
        PlayerLevelManager.getInstance().confirmNewAccountZeroBaselineSession(cleanUid);
        this.notify();
        return { ok: true, status: 'VERIFIED_NEW_EMPTY' };
      } catch (err) {
        const code =
          err && typeof (err as { code?: unknown }).code === 'string'
            ? String((err as { code: string }).code)
            : 'FIRESTORE_READ_ERROR';
        this.cloudReadStatusByUid.set(cleanUid, 'ERROR');
        this.cloudReadErrorCodeByUid.set(cleanUid, code);
        PlayerLevelManager.getInstance().markFirestoreReadFailed(cleanUid);
        this.notify();
        return { ok: false, status: 'OFFLINE_OR_ERROR', errorCode: code };
      }
    }

    try {
      const snap = await customReader(cleanUid);
      if (snap.exists && snap.data) {
        this.cloudReadStatusByUid.set(cleanUid, 'VERIFIED');
        this.cloudReadErrorCodeByUid.set(cleanUid, null);
        this.applyCloudUserDocData(cleanUid, snap.data);
        return { ok: true, status: 'VERIFIED_DOC' };
      }
      if (snap.fromCache) {
        this.cloudReadStatusByUid.set(cleanUid, 'ERROR');
        this.cloudReadErrorCodeByUid.set(cleanUid, 'FIRESTORE_CACHE_ONLY_UNCONFIRMED');
        PlayerLevelManager.getInstance().markFirestoreReadFailed(cleanUid);
        this.notify();
        return {
          ok: false,
          status: 'OFFLINE_OR_ERROR',
          errorCode: 'FIRESTORE_CACHE_ONLY_UNCONFIRMED',
        };
      }
      this.cloudReadStatusByUid.set(cleanUid, 'VERIFIED');
      this.cloudReadErrorCodeByUid.set(cleanUid, null);
      PlayerLevelManager.getInstance().confirmNewAccountZeroBaselineSession(cleanUid);
      this.notify();
      return { ok: true, status: 'VERIFIED_NEW_EMPTY' };
    } catch (err) {
      const code =
        err && typeof (err as { code?: unknown }).code === 'string'
          ? String((err as { code: string }).code)
          : 'FIRESTORE_READ_ERROR';
      this.cloudReadStatusByUid.set(cleanUid, 'ERROR');
      this.cloudReadErrorCodeByUid.set(cleanUid, code);
      PlayerLevelManager.getInstance().markFirestoreReadFailed(cleanUid);
      this.notify();
      return { ok: false, status: 'OFFLINE_OR_ERROR', errorCode: code };
    }
  }

  /**
   * Injects or updates cloud `/users/{uid}` fields (used by live Firestore snapshot and unit tests).
   * - Runs non-destructive M7.5.2 Level & XP consistency auditing (never overwrites Firestore).
   * - Computes Level strictly from verified `totalXp` (or fallback `xp`), never from an unverified `level` field.
   * - Preserves `rank` and `xu` with 100% domain independence.
   */
  public applyCloudUserDocData(uid: string, data: Record<string, unknown> | null): void {
    if (!uid) return;
    const levelMgr = PlayerLevelManager.getInstance();
    if (!data) {
      this.cloudFieldsByUid.delete(uid);
      this.cloudReadStatusByUid.delete(uid);
      this.cloudReadErrorCodeByUid.delete(uid);
      levelMgr.applyFirestoreUserDocument(uid, null);
      this.notify();
      return;
    }

    this.cloudReadStatusByUid.set(uid, 'VERIFIED');
    this.cloudReadErrorCodeByUid.set(uid, null);
    const audit = levelMgr.applyFirestoreUserDocument(uid, data);
    const rawLevel = data.level;
    const parsedStoredLevel =
      typeof rawLevel === 'number' && Number.isInteger(rawLevel) ? rawLevel : null;
    const parsedRank =
      typeof data.rank === 'string' && data.rank.trim().length > 0 ? data.rank.trim() : null;
    const parsedXuCheck = validateTotalXpValue(data.xu);
    const parsedXu = parsedXuCheck.valid ? parsedXuCheck.sanitizedXp : null;

    this.cloudFieldsByUid.set(uid, {
      uid,
      storedLevel: parsedStoredLevel,
      rankCode: parsedRank,
      totalXp: audit?.resolvedVerifiedTotalXp ?? null,
      xu: parsedXu,
      createdAtMs: parseTimestampFieldMs(data.createdAt),
      lastLoginAtMs: parseTimestampFieldMs(data.lastLoginAt),
    });
    this.notify();
  }

  /**
   * Records an authenticated login session for `uid` idempotently per `sessionId`.
   * IMPORTANT (M7.5.2.2): NEVER confirms 0 XP / Level 1 merely because session became ACTIVE;
   * Level confirmation waits strictly for Firestore `/users/{uid}` read completion.
   */
  public recordAuthenticatedSessionActive(params: {
    uid: string;
    sessionId: string;
    deviceId?: string | null;
    timestampMs?: number;
    userEmail?: string | null;
    displayName?: string | null;
  }): void {
    const { uid, sessionId } = params;
    if (!uid || !sessionId) return;
    const nowMs = params.timestampMs ?? Date.now();
    const record = this.getOrLoadPerUidStats(uid);

    if (record.lastRecordedSessionId === sessionId) {
      this.notify();
      return;
    }

    record.lastRecordedSessionId = sessionId;
    record.totalLogins += 1;
    record.firstLoginAtMs =
      record.firstLoginAtMs === null ? nowMs : Math.min(record.firstLoginAtMs, nowMs);
    record.lastLoginAtMs =
      record.lastLoginAtMs === null ? nowMs : Math.max(record.lastLoginAtMs, nowMs);

    record.authHistory.unshift({
      id: `login_${nowMs}_${record.totalLogins}`,
      eventType: 'LOGIN',
      timestampMs: nowMs,
      sessionId,
      deviceId: params.deviceId ?? null,
      note: 'Đăng nhập thành công & cấp phiên thiết bị',
    });
    if (record.authHistory.length > MAX_AUTH_HISTORY_PER_USER) {
      record.authHistory.length = MAX_AUTH_HISTORY_PER_USER;
    }

    this.savePerUidStats(record);

    const logger = SystemAuditLogger.getInstance();
    const scopeKey = `session:${uid}:${sessionId}`;
    logger.startOperationalScope({
      scopeKey,
      scopeType: 'SESSION',
      ownerUid: uid,
      sessionId,
      nowMs,
    });
    logger.appendOperationalEvent({
      scopeKey,
      scopeType: 'SESSION',
      eventType: 'SESSION_STARTED',
      message: `Khởi tạo phiên đăng nhập ${sessionId}`,
      uid,
      sessionId,
      timestampMs: nowMs,
    });
    logger.recordEvent({
      severity: 'INFO',
      category: 'AUTH_EVENT',
      eventType: 'LOGIN_SUCCESS',
      message: `Người chơi đăng nhập thành công (Tổng lần đăng nhập: ${record.totalLogins}).`,
      uid,
      userEmail: params.userEmail,
      displayName: params.displayName,
      sessionId,
      deviceId: params.deviceId ?? null,
      source: 'PlayerStatsManager.recordAuthenticatedSessionActive',
      outcome: 'SUCCESS',
      timestampMs: nowMs,
      skipDeduplication: true,
    });

    this.notify();
  }

  /**
   * Records logout, 15m idle expiry, or single-device conflict for `uid`, and triggers the
   * 9-step archive-verify-cleanup pipeline on the ended session's temporary operational log.
   */
  public recordSessionTermination(params: {
    uid: string | null | undefined;
    sessionId?: string | null;
    deviceId?: string | null;
    reason: 'LOGOUT' | 'SESSION_IDLE_EXPIRED_15M' | 'SECOND_DEVICE_CONFLICT_REJECTED' | 'SESSION_DISPLACED';
    note?: string;
    timestampMs?: number;
  }): void {
    const uid = params.uid;
    const nowMs = params.timestampMs ?? Date.now();
    const logger = SystemAuditLogger.getInstance();

    if (uid) {
      const record = this.getOrLoadPerUidStats(uid);
      if (params.reason === 'LOGOUT' || params.reason === 'SESSION_IDLE_EXPIRED_15M') {
        record.lastLogoutAtMs = nowMs;
        if (record.lastRecordedSessionId === params.sessionId) {
          record.lastRecordedSessionId = null;
        }
      }
      const defaultNotes: Record<typeof params.reason, string> = {
        LOGOUT: 'Đăng xuất chủ động khỏi tài khoản',
        SESSION_IDLE_EXPIRED_15M: 'Hết hạn phiên tự động sau 15 phút không tương tác',
        SECOND_DEVICE_CONFLICT_REJECTED: 'Từ chối đăng nhập do tài khoản đang hoạt động trên thiết bị khác',
        SESSION_DISPLACED: 'Phiên bị ngắt do xung đột thiết bị',
      };
      record.authHistory.unshift({
        id: `term_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
        eventType: params.reason,
        timestampMs: nowMs,
        sessionId: params.sessionId ?? null,
        deviceId: params.deviceId ?? null,
        note: params.note || defaultNotes[params.reason],
      });
      if (record.authHistory.length > MAX_AUTH_HISTORY_PER_USER) {
        record.authHistory.length = MAX_AUTH_HISTORY_PER_USER;
      }
      this.savePerUidStats(record);
    }

    const severity =
      params.reason === 'SECOND_DEVICE_CONFLICT_REJECTED' || params.reason === 'SESSION_DISPLACED'
        ? 'WARNING'
        : 'INFO';

    logger.recordEvent({
      severity,
      category: 'AUTH_EVENT',
      eventType: params.reason,
      message: params.note || `Sự kiện phiên đăng nhập: ${params.reason}`,
      uid: uid ?? null,
      sessionId: params.sessionId ?? null,
      deviceId: params.deviceId ?? null,
      source: 'PlayerStatsManager.recordSessionTermination',
      outcome: params.reason === 'SECOND_DEVICE_CONFLICT_REJECTED' ? 'FAILURE' : 'SUCCESS',
      timestampMs: nowMs,
      skipDeduplication: true,
    });

    if (
      uid &&
      params.sessionId &&
      (params.reason === 'LOGOUT' ||
        params.reason === 'SESSION_IDLE_EXPIRED_15M' ||
        params.reason === 'SESSION_DISPLACED')
    ) {
      const scopeKey = `session:${uid}:${params.sessionId}`;
      logger.appendOperationalEvent({
        scopeKey,
        scopeType: 'SESSION',
        eventType: params.reason,
        message: `Kết thúc phiên ${params.sessionId} (${params.reason})`,
        uid,
        sessionId: params.sessionId,
        timestampMs: nowMs,
      });
      logger.markOperationalScopeEnded(scopeKey, nowMs);
      void logger.archiveAndCleanupOperationalLog(scopeKey, {
        markEndedNow: true,
        nowMs,
        internalSystemTrigger: true,
      });
    }

    this.notify();
  }

  /**
   * Records a completed match (STAGE_CLEAR or GAME_OVER) for `uid` with strict M7.5.2 Section 4
   * validation:
   * - Validates `earnedScoreXp` against official enemy XP breakdown (`1*B + 2*F + 3*P + 5*A`).
   * - Zero bonus XP for stage clear, win, playtime, login, or co-op.
   * - Deduplicated by deterministic `xpEventId` across retries, re-renders, and devices.
   * - Never alters `pvpRank` or `xuBalance`.
   */
  public recordMatchOutcome(params: {
    uid: string | null | undefined;
    runKey: string;
    xpEventId?: string;
    outcome: 'WIN' | 'LOSS';
    stageId: number;
    gameMode: string;
    earnedScoreXp: number;
    runTotalScoreXp?: number;
    defeatedByType?: Partial<Record<'BASIC' | 'FAST' | 'POWER' | 'ARMOR', number>>;
    roomCode?: string | null;
    timestampMs?: number;
  }): XpGrantExecutionResult | null {
    const uid = typeof params.uid === 'string' ? params.uid.trim() : '';
    if (!uid || ScoreManager.isGlobalTrialMode()) return null;

    const sanitizedRunKey = String(params.runKey || 'run').replace(/[^A-Za-z0-9_.:-]/g, '_');
    const xpEventId =
      params.xpEventId && params.xpEventId.trim().length >= 6
        ? params.xpEventId.trim()
        : `match_${uid.replace(/[^A-Za-z0-9_-]/g, '_')}_${sanitizedRunKey}`.slice(0, 150);

    const nowMs = params.timestampMs ?? Date.now();
    const source = resolveXpGrantSourceFromGameMode(params.gameMode);

    const grantResult = PlayerLevelManager.getInstance().grantVerifiedBattleXpSync({
      uid,
      eventId: xpEventId,
      source,
      stageId: params.stageId,
      gameMode: params.gameMode,
      earnedXp: params.earnedScoreXp,
      defeatedByType: params.defeatedByType ?? { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 },
      roomCode: params.roomCode ?? null,
      timestampMs: nowMs,
    });

    if (!grantResult.accepted || grantResult.duplicateIgnored) {
      return grantResult;
    }

    const dedupKey = `${uid}:${params.runKey}`;
    this.recordedMatchRunKeys.add(dedupKey);

    const record = this.getOrLoadPerUidStats(uid);
    const safeEarned = params.earnedScoreXp;
    const safeRunTotal =
      typeof params.runTotalScoreXp === 'number' &&
      Number.isInteger(params.runTotalScoreXp) &&
      params.runTotalScoreXp >= 0
        ? params.runTotalScoreXp
        : safeEarned;

    record.matchesPlayed += 1;
    if (params.outcome === 'WIN') {
      record.matchesWon += 1;
    } else {
      record.matchesLost += 1;
    }
    record.accumulatedBattleXp += safeEarned;
    record.highScoreXp = Math.max(record.highScoreXp, safeEarned, safeRunTotal);

    const b = Math.max(0, Math.floor(params.defeatedByType?.BASIC || 0));
    const f = Math.max(0, Math.floor(params.defeatedByType?.FAST || 0));
    const p = Math.max(0, Math.floor(params.defeatedByType?.POWER || 0));
    const a = Math.max(0, Math.floor(params.defeatedByType?.ARMOR || 0));
    record.defeatedByType.BASIC += b;
    record.defeatedByType.FAST += f;
    record.defeatedByType.POWER += p;
    record.defeatedByType.ARMOR += a;
    record.totalEnemiesDefeated += b + f + p + a;
    record.recordedXpEventIds = Array.from(new Set([...(record.recordedXpEventIds ?? []), xpEventId]));

    this.savePerUidStats(record);

    const logger = SystemAuditLogger.getInstance();
    logger.recordEvent({
      severity: 'INFO',
      category: 'CAMPAIGN_STAGE_EVENT',
      eventType: params.outcome === 'WIN' ? 'MATCH_WIN' : 'MATCH_LOSS',
      message:
        params.outcome === 'WIN'
          ? `Hoàn thành Stage ${params.stageId} (${params.gameMode}) • +${safeEarned} XP`
          : `Kết thúc trận tại Stage ${params.stageId} (${params.gameMode}) • +${safeEarned} XP`,
      uid,
      roomCode: params.roomCode ?? null,
      stageId: params.stageId,
      gameMode: params.gameMode,
      source: 'PlayerStatsManager.recordMatchOutcome',
      outcome: 'SUCCESS',
      timestampMs: nowMs,
      skipDeduplication: true,
      metadata: {
        xpEventId,
        earnedScoreXp: safeEarned,
        newTotalXp: grantResult.newTotalXp,
        previousLevel: grantResult.previousLevel,
        newLevel: grantResult.newLevel,
        defeatedEnemies: b + f + p + a,
        defeatedByType: { BASIC: b, FAST: f, POWER: p, ARMOR: a },
      },
    });

    this.notify();
    return grantResult;
  }

  public recordCoopRoomParticipation(uid: string | null | undefined, roomCode: string): void {
    if (!uid) return;
    const dedupKey = `room_part:${uid}:${roomCode}`;
    if (this.recordedMatchRunKeys.has(dedupKey)) return;
    this.recordedMatchRunKeys.add(dedupKey);
    const record = this.getOrLoadPerUidStats(uid);
    record.coopRoomsParticipated += 1;
    this.savePerUidStats(record);
    this.notify();
  }

  /**
   * Computes the full, strictly UID-scoped statistics snapshot for `uid` (or signed-out empty state).
   */
  public getPlayerStatisticsSnapshot(uid: string | null | undefined): PlayerFullStatisticsSnapshot {
    const cleanUid = typeof uid === 'string' && uid.trim().length > 0 ? uid.trim() : null;
    const sessionSnap = SessionManager.getInstance().getSnapshot();

    if (!cleanUid) {
      return {
        uid: null,
        level: null,
        levelStatus: 'UNCONFIGURED',
        xpVerificationStatus: 'UNVERIFIED',
        isMaxLevel: false,
        levelTopMenuBadge: 'Lv. --',
        levelSystemLabel: 'Chưa xác minh XP',
        currentLevelFloorXp: null,
        xpNext: null,
        xpRemaining: null,
        levelProgressPercent: 0,
        levelConsistencyAudit: null,
        pvpRankCode: null,
        pvpRankLabel: 'Chưa xếp hạng',
        totalXp: 0,
        highScoreXp: 0,
        xuBalance: 0,
        unlockedStage: 1,
        completedStages: [],
        matchesPlayed: 0,
        matchesWon: 0,
        matchesLost: 0,
        totalEnemiesDefeated: 0,
        defeatedByType: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 },
        coopRoomsParticipated: 0,
        totalLogins: 0,
        firstLoginAtMs: null,
        lastLoginAtMs: null,
        lastLogoutAtMs: null,
        authHistory: [],
        currentSession: {
          status: 'SIGNED_OUT',
          isOnlineActive: false,
          sessionId: null,
          deviceId: null,
          lastKnownServerActiveMs: null,
          idleTimeoutMinutes: 15,
        },
      };
    }

    this.ensureUserFirestoreSubscription(cleanUid);
    const localStats = this.getOrLoadPerUidStats(cleanUid);
    const cloudStats = this.cloudFieldsByUid.get(cleanUid) ?? null;
    const stageProg = StageProgressionManager.getInstance().getUserStageProgressSnapshot(cleanUid);
    const scoreMgr = new ScoreManager();
    const levelMgr = PlayerLevelManager.getInstance();

    // Official 50-Level Progress from verified `totalXp` (M7.5.2)
    const levelProgress = levelMgr.getLevelProgressForUid(cleanUid);
    const levelConsistencyAudit = levelMgr.getConsistencyAuditForUid(cleanUid);

    // Quân hàm PvP: ONLY real `/users/{uid}.rank` if present (strictly independent of Level & XP)
    const pvpRankCode = cloudStats?.rankCode ?? null;
    const pvpRankLabel = formatPvpRankLabel(pvpRankCode);

    // XP & High Score: strictly separated from Xu; totalXp comes exclusively from verified Level Ledger
    const activeAuthUser = AuthManager.getInstance().getCurrentUser();
    const isCurrentActivePlayer = activeAuthUser?.uid === cleanUid && !ScoreManager.isGlobalTrialMode();
    const globalHighScore = isCurrentActivePlayer ? scoreMgr.getHighScore() : 0;

    const totalXp = levelProgress.totalXp ?? 0;
    const highScoreXp = Math.max(localStats.highScoreXp, globalHighScore);

    // Xu: strictly decoupled from XP and Level (M7.5.2 Section 3)
    const xuBalance =
      cloudStats?.xu !== null && cloudStats?.xu !== undefined
        ? cloudStats.xu
        : isCurrentActivePlayer
          ? scoreMgr.getXuBalance()
          : 0;

    const isSessionActiveForThisUid =
      sessionSnap.uid === cleanUid && sessionSnap.status === 'ACTIVE';

    let firstLoginAtMs = localStats.firstLoginAtMs;
    if (cloudStats?.createdAtMs) {
      firstLoginAtMs =
        firstLoginAtMs === null
          ? cloudStats.createdAtMs
          : Math.min(firstLoginAtMs, cloudStats.createdAtMs);
    }
    if (firstLoginAtMs === null && cloudStats?.lastLoginAtMs) {
      firstLoginAtMs = cloudStats.lastLoginAtMs;
    }

    let lastLoginAtMs = localStats.lastLoginAtMs;
    if (cloudStats?.lastLoginAtMs) {
      lastLoginAtMs =
        lastLoginAtMs === null
          ? cloudStats.lastLoginAtMs
          : Math.max(lastLoginAtMs, cloudStats.lastLoginAtMs);
    }
    if (lastLoginAtMs === null && isSessionActiveForThisUid && sessionSnap.lastKnownServerActiveMs) {
      lastLoginAtMs = sessionSnap.lastKnownServerActiveMs;
    }
    if (firstLoginAtMs === null && lastLoginAtMs !== null) {
      firstLoginAtMs = lastLoginAtMs;
    }

    const totalLogins = Math.max(
      localStats.totalLogins,
      isSessionActiveForThisUid || lastLoginAtMs !== null ? 1 : 0
    );

    const sessionBelongsToUid = sessionSnap.uid === cleanUid;

    return {
      uid: cleanUid,
      level: levelProgress.level,
      levelStatus: levelProgress.level !== null ? 'CONFIGURED' : 'UNCONFIGURED',
      xpVerificationStatus: levelProgress.xpVerificationStatus,
      isMaxLevel: levelProgress.isMaxLevel,
      levelTopMenuBadge: levelProgress.topMenuBadge,
      levelSystemLabel: levelProgress.systemLabel,
      currentLevelFloorXp: levelProgress.currentLevelFloorXp,
      xpNext: levelProgress.xpNext,
      xpRemaining: levelProgress.xpRemaining,
      levelProgressPercent: levelProgress.progressPercent,
      levelConsistencyAudit,
      pvpRankCode,
      pvpRankLabel,
      totalXp,
      highScoreXp,
      xuBalance,
      unlockedStage: stageProg.unlockedStage,
      completedStages: [...stageProg.completedStages],
      matchesPlayed: localStats.matchesPlayed,
      matchesWon: localStats.matchesWon,
      matchesLost: localStats.matchesLost,
      totalEnemiesDefeated: localStats.totalEnemiesDefeated,
      defeatedByType: { ...localStats.defeatedByType },
      coopRoomsParticipated: localStats.coopRoomsParticipated,
      totalLogins,
      firstLoginAtMs,
      lastLoginAtMs,
      lastLogoutAtMs: localStats.lastLogoutAtMs,
      authHistory: localStats.authHistory.map((h) => ({ ...h })),
      currentSession: {
        status: sessionBelongsToUid ? sessionSnap.status : 'SIGNED_OUT',
        isOnlineActive: isSessionActiveForThisUid,
        sessionId: sessionBelongsToUid ? sessionSnap.sessionId : null,
        deviceId: sessionBelongsToUid ? sessionSnap.deviceId : null,
        lastKnownServerActiveMs: sessionBelongsToUid ? sessionSnap.lastKnownServerActiveMs : null,
        idleTimeoutMinutes: 15,
      },
    };
  }

  /**
   * Read-only Admin Migration & Consistency Audit Scanner (M7.5.2 & M7.5.2.2):
   * - Accessible ONLY to sole ADMIN (`linhnk2013@gmail.com`).
   * - Performs ZERO writes/mutations on Firestore `/users`.
   * - Returns `success: false` with exact `errorCode` whenever Firestore `/users` cannot be read.
   * - Explicitly separates `firestoreScannedCount` from `cacheOnlyCount` and labels any RAM-cache
   *   fallback entries as `CACHE ONLY – NOT PRODUCTION VERIFIED`.
   */
  public async scanFirestoreUsersLevelConsistencyForAdmin(
    actorOverride?: AuthIdentityLike | null,
    options?: {
      firestoreDocsLoader?: () => Promise<Array<{ id: string; data: Record<string, unknown> }>>;
      firestoreDbOverride?: ReturnType<typeof getFirebaseDb> | null;
    }
  ): Promise<AdminLevelConsistencyScanResult> {
    const logger = SystemAuditLogger.getInstance();
    if (!logger.canAccessSystemLogs(actorOverride)) {
      logger.recordEvent({
        severity: 'WARNING',
        category: 'SECURITY_PERMISSION_DENIED',
        eventType: 'SYSTEM_DIAGNOSTIC',
        message: 'Từ chối quyền quét đối chiếu dữ liệu Level (/users) từ tài khoản không phải ADMIN.',
        source: 'PlayerStatsManager.scanFirestoreUsersLevelConsistencyForAdmin',
        outcome: 'FAILURE',
        errorCode: 'PERMISSION_DENIED',
      });
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        errorMessage: 'Chỉ ADMIN duy nhất mới có quyền kiểm tra đối chiếu dữ liệu Level người chơi.',
        isProductionVerified: false,
        sourceMode: 'NONE',
        scannedCount: 0,
        firestoreScannedCount: 0,
        cacheOnlyCount: 0,
        inconsistentCount: 0,
        entries: [],
      };
    }

    const cachedByUid = new Map<string, UserLevelConsistencyScanEntry>();
    for (const cached of PlayerLevelManager.getInstance().listAllConsistencyAudits()) {
      cachedByUid.set(cached.uid, {
        ...cached,
        dataSource: 'RAM_CACHE_ONLY',
        sourceLabel: 'CACHE ONLY – NOT PRODUCTION VERIFIED',
      });
    }

    const sortEntries = (list: UserLevelConsistencyScanEntry[]): UserLevelConsistencyScanEntry[] =>
      list.sort((a, b) => {
        if (a.isConsistent !== b.isConsistent) {
          return a.isConsistent ? 1 : -1;
        }
        return b.detectedAtMs - a.detectedAtMs;
      });

    const db = options?.firestoreDocsLoader
      ? null
      : options && 'firestoreDbOverride' in options
        ? (options.firestoreDbOverride ?? null)
        : getFirebaseDb();
    if (!options?.firestoreDocsLoader && !db) {
      const cacheEntries = sortEntries(Array.from(cachedByUid.values()));
      const inconsistentCount = cacheEntries.filter((e) => !e.isConsistent).length;
      logger.recordEvent({
        severity: 'ERROR',
        category: 'FIRESTORE_OPERATION_ERROR',
        eventType: 'ADMIN_LEVEL_SCAN_FAILED',
        message:
          'Quét /users thất bại: Firestore chưa sẵn sàng (FIRESTORE_UNAVAILABLE). Cache fallback nếu có chỉ là CACHE ONLY – NOT PRODUCTION VERIFIED.',
        source: 'PlayerStatsManager.scanFirestoreUsersLevelConsistencyForAdmin',
        outcome: 'FAILURE',
        errorCode: 'FIRESTORE_UNAVAILABLE',
        skipDeduplication: true,
      });
      return {
        success: false,
        errorCode: 'FIRESTORE_UNAVAILABLE',
        errorMessage:
          'Không thể kết nối Firestore để quét Production /users. Dữ liệu cache RAM (nếu có) chỉ mang tính tham khảo cục bộ.',
        isProductionVerified: false,
        sourceMode: cacheEntries.length > 0 ? 'CACHE_ONLY_UNVERIFIED' : 'NONE',
        cacheLabel: cacheEntries.length > 0 ? 'CACHE ONLY – NOT PRODUCTION VERIFIED' : undefined,
        scannedCount: cacheEntries.length,
        firestoreScannedCount: 0,
        cacheOnlyCount: cacheEntries.length,
        inconsistentCount,
        entries: cacheEntries,
      };
    }

    try {
      const firestoreRows: Array<{ id: string; data: Record<string, unknown> }> =
        options?.firestoreDocsLoader
          ? await options.firestoreDocsLoader()
          : await (async () => {
              const snap = await getDocs(query(collection(db!, 'users'), limit(500)));
              const rows: Array<{ id: string; data: Record<string, unknown> }> = [];
              snap.forEach((docSnap) => {
                rows.push({
                  id: docSnap.id,
                  data: docSnap.data() as Record<string, unknown>,
                });
              });
              return rows;
            })();

      const nowMs = Date.now();
      const byUid = new Map<string, UserLevelConsistencyScanEntry>();
      let firestoreScannedCount = 0;

      for (const row of firestoreRows) {
        const audit = auditUserDocumentLevelConsistency(row.id, row.data, nowMs);
        byUid.set(row.id, {
          ...audit,
          dataSource: 'FIRESTORE_LIVE',
        });
        firestoreScannedCount += 1;
      }

      let cacheOnlyCount = 0;
      for (const [uid, cacheEntry] of cachedByUid.entries()) {
        if (!byUid.has(uid)) {
          byUid.set(uid, cacheEntry);
          cacheOnlyCount += 1;
        }
      }

      const entries = sortEntries(Array.from(byUid.values()));
      const inconsistentCount = entries.filter((e) => !e.isConsistent).length;

      return {
        success: true,
        isProductionVerified: true,
        sourceMode: cacheOnlyCount > 0 ? 'FIRESTORE_AND_CACHE' : 'FIRESTORE_ONLY',
        cacheLabel: cacheOnlyCount > 0 ? 'CACHE ONLY – NOT PRODUCTION VERIFIED' : undefined,
        scannedCount: entries.length,
        firestoreScannedCount,
        cacheOnlyCount,
        inconsistentCount,
        entries,
      };
    } catch (err) {
      const rawCode =
        err && typeof (err as { code?: unknown }).code === 'string'
          ? String((err as { code: string }).code).toLowerCase()
          : '';
      const rawMsg =
        err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();

      let errorCode: 'PERMISSION_DENIED' | 'FIRESTORE_UNAVAILABLE' | 'SCAN_FAILED' = 'SCAN_FAILED';
      if (
        rawCode.includes('permission-denied') ||
        rawCode.includes('unauthenticated') ||
        rawMsg.includes('permission') ||
        rawMsg.includes('missing or insufficient permissions')
      ) {
        errorCode = 'PERMISSION_DENIED';
      } else if (
        rawCode.includes('unavailable') ||
        rawCode.includes('deadline-exceeded') ||
        rawCode.includes('failed-precondition') ||
        rawMsg.includes('offline') ||
        rawMsg.includes('unavailable') ||
        rawMsg.includes('network')
      ) {
        errorCode = 'FIRESTORE_UNAVAILABLE';
      }

      logger.recordEvent({
        severity: 'ERROR',
        category: errorCode === 'PERMISSION_DENIED' ? 'SECURITY_PERMISSION_DENIED' : 'FIRESTORE_OPERATION_ERROR',
        eventType: 'ADMIN_LEVEL_SCAN_FAILED',
        message: `Quét Firestore /users thất bại (${errorCode}). Không thể xác minh dữ liệu Production.`,
        source: 'PlayerStatsManager.scanFirestoreUsersLevelConsistencyForAdmin',
        outcome: 'FAILURE',
        errorCode,
        skipDeduplication: true,
      });

      const cacheEntries = sortEntries(Array.from(cachedByUid.values()));
      const inconsistentCount = cacheEntries.filter((e) => !e.isConsistent).length;

      return {
        success: false,
        errorCode,
        errorMessage:
          errorCode === 'PERMISSION_DENIED'
            ? 'Firestore từ chối quyền đọc /users (PERMISSION_DENIED). Không thể xác minh Production.'
            : errorCode === 'FIRESTORE_UNAVAILABLE'
              ? 'Firestore đang offline hoặc không khả dụng (FIRESTORE_UNAVAILABLE). Không thể xác minh Production.'
              : 'Lỗi đọc Firestore /users khi đối chiếu dữ liệu Level (SCAN_FAILED).',
        isProductionVerified: false,
        sourceMode: cacheEntries.length > 0 ? 'CACHE_ONLY_UNVERIFIED' : 'NONE',
        cacheLabel: cacheEntries.length > 0 ? 'CACHE ONLY – NOT PRODUCTION VERIFIED' : undefined,
        scannedCount: cacheEntries.length,
        firestoreScannedCount: 0,
        cacheOnlyCount: cacheEntries.length,
        inconsistentCount,
        entries: cacheEntries,
      };
    }
  }

  public clearUidStatsForTesting(uid: string): void {
    this.perUidStore.delete(uid);
    this.lastKnownStatsRawByUid.delete(uid);
    this.cloudFieldsByUid.delete(uid);
    this.cloudReadStatusByUid.delete(uid);
    this.cloudReadErrorCodeByUid.delete(uid);
    PlayerLevelManager.getInstance().clearUidForTesting(uid);
    for (const k of Array.from(this.recordedMatchRunKeys)) {
      if (k.startsWith(`${uid}:`) || k.startsWith(`room_part:${uid}:`)) {
        this.recordedMatchRunKeys.delete(k);
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`${STATS_STORAGE_PREFIX}${uid}`);
    }
    this.notify();
  }
}
