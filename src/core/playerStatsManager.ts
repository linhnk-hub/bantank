/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.1 – PHẦN 1: PLAYER STATISTICS & TOP MENU LEVEL MANAGER
 *
 * Strict Data Integrity & Anti-Fabrication Rules (PHẦN 1.2 & 1.3):
 * 1. Reads ONLY real player data bound strictly to the authenticated `uid` (zero state bleed
 *    between accounts, immediate reactive update or reset on account switch / sign-out).
 * 2. Strictly separates:
 *    - `Level` (Player Level)
 *    - `Quân hàm / Xếp hạng PvP` (`pvpRank`)
 *    - `Tổng điểm XP` (`totalXp`)
 *    - `Số dư Xu` (`xuBalance` — never auto-converted from XP)
 * 3. Clause 1.2 Compliance: Because the codebase & `/users/{uid}` schema currently have NO
 *    approved formula for calculating `Level` from `XP`, this manager NEVER invents an
 *    unapproved formula or fabricates fake `Level` numbers. It reads `/users/{uid}.level`
 *    if present as a real positive integer; otherwise `level` is `null` (`levelStatus: 'UNCONFIGURED'`,
 *    Top Menu badge `Lv. --`, System Statistics label `Chưa thiết lập`).
 */

import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import { AuthManager, validatePersonalGmailUser } from './authManager.ts';
import { ScoreManager } from './scoreManager.ts';
import { SessionManager, type SessionStatus } from './sessionManager.ts';
import { StageProgressionManager } from './stageProgression.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';

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
  authHistory: PlayerAuthHistoryRecord[];
}

export interface CloudUserStatsFields {
  uid: string;
  level: number | null;
  rankCode: string | null;
  xp: number | null;
  xu: number | null;
  createdAtMs: number | null;
  lastLoginAtMs: number | null;
}

export interface PlayerFullStatisticsSnapshot {
  uid: string | null;
  // 1. Level (strictly separated from Rank, XP, Xu)
  level: number | null;
  levelStatus: 'CONFIGURED' | 'UNCONFIGURED';
  levelTopMenuBadge: string;
  levelSystemLabel: string;
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

export class PlayerStatsManager {
  private static instance: PlayerStatsManager;

  private perUidStore = new Map<string, PersistedPerUidStats>();
  private cloudFieldsByUid = new Map<string, CloudUserStatsFields>();
  private firestoreUnsubByUid = new Map<string, () => void>();
  private recordedMatchRunKeys = new Set<string>();
  private listeners = new Set<() => void>();

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

  private installReactiveListeners(): void {
    AuthManager.getInstance().subscribe((user) => {
      if (user?.uid) {
        this.ensureUserFirestoreSubscription(user.uid);
      }
      this.notify();
    });

    StageProgressionManager.getInstance().subscribe(() => {
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
      authHistory: [],
    };
  }

  private getOrLoadPerUidStats(uid: string): PersistedPerUidStats {
    const inMem = this.perUidStore.get(uid);
    if (inMem) return inMem;

    let loaded: PersistedPerUidStats | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(`${STATS_STORAGE_PREFIX}${uid}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedPerUidStats>;
          if (parsed && parsed.uid === uid) {
            loaded = {
              ...this.createEmptyPerUidStats(uid),
              ...parsed,
              defeatedByType: {
                BASIC: Number(parsed.defeatedByType?.BASIC || 0),
                FAST: Number(parsed.defeatedByType?.FAST || 0),
                POWER: Number(parsed.defeatedByType?.POWER || 0),
                ARMOR: Number(parsed.defeatedByType?.ARMOR || 0),
              },
              authHistory: Array.isArray(parsed.authHistory) ? parsed.authHistory : [],
            };
          }
        }
      } catch {
        loaded = null;
      }
    }

    const record = loaded ?? this.createEmptyPerUidStats(uid);
    this.perUidStore.set(uid, record);
    return record;
  }

  private savePerUidStats(record: PersistedPerUidStats): void {
    this.perUidStore.set(record.uid, record);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          `${STATS_STORAGE_PREFIX}${record.uid}`,
          JSON.stringify(record)
        );
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
    if (!db) return;

    try {
      const ref = doc(db, 'users', uid);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            this.cloudFieldsByUid.set(uid, {
              uid,
              level: null,
              rankCode: null,
              xp: null,
              xu: null,
              createdAtMs: null,
              lastLoginAtMs: null,
            });
            this.notify();
            return;
          }
          const data = snap.data() as Record<string, unknown>;
          this.applyCloudUserDocData(uid, data);
        },
        () => {
          // Ignore snapshot read error cleanly
        }
      );
      this.firestoreUnsubByUid.set(uid, unsub);
    } catch {
      // Ignore if Firestore is unavailable in test env
    }
  }

  public async refreshCloudUserStatsOnce(uid: string | null | undefined): Promise<void> {
    if (!uid) return;
    const db = getFirebaseDb();
    if (!db) return;
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        this.applyCloudUserDocData(uid, snap.data() as Record<string, unknown>);
      }
    } catch {
      // Ignore offline/permission errors
    }
  }

  /**
   * Injects or updates cloud `/users/{uid}` fields (used by live Firestore snapshot and unit tests).
   */
  public applyCloudUserDocData(uid: string, data: Record<string, unknown> | null): void {
    if (!uid) return;
    if (!data) {
      this.cloudFieldsByUid.delete(uid);
      this.notify();
      return;
    }
    const rawLevel = data.level;
    const parsedLevel =
      typeof rawLevel === 'number' && Number.isFinite(rawLevel) && rawLevel >= 1
        ? Math.floor(rawLevel)
        : null;
    const parsedRank =
      typeof data.rank === 'string' && data.rank.trim().length > 0 ? data.rank.trim() : null;
    const parsedXp =
      typeof data.xp === 'number' && Number.isFinite(data.xp) && data.xp >= 0
        ? Math.floor(data.xp)
        : null;
    const parsedXu =
      typeof data.xu === 'number' && Number.isFinite(data.xu) && data.xu >= 0
        ? Math.floor(data.xu)
        : null;

    this.cloudFieldsByUid.set(uid, {
      uid,
      level: parsedLevel,
      rankCode: parsedRank,
      xp: parsedXp,
      xu: parsedXu,
      createdAtMs: parseTimestampFieldMs(data.createdAt),
      lastLoginAtMs: parseTimestampFieldMs(data.lastLoginAt),
    });
    this.notify();
  }

  /**
   * Records an authenticated login session for `uid` idempotently per `sessionId`.
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

    // Trigger 9-step archive-before-cleanup for the ended session operational log
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
   * Records a completed match (STAGE_CLEAR or GAME_OVER) for `uid` without altering existing
   * XP/Xu/Rank formulas. Deduplicated by `runKey` so re-renders never double-count.
   */
  public recordMatchOutcome(params: {
    uid: string | null | undefined;
    runKey: string;
    outcome: 'WIN' | 'LOSS';
    stageId: number;
    gameMode: string;
    earnedScoreXp: number;
    defeatedByType?: Partial<Record<'BASIC' | 'FAST' | 'POWER' | 'ARMOR', number>>;
    roomCode?: string | null;
    timestampMs?: number;
  }): void {
    const uid = params.uid;
    if (!uid || ScoreManager.isGlobalTrialMode()) return;
    const dedupKey = `${uid}:${params.runKey}`;
    if (this.recordedMatchRunKeys.has(dedupKey)) return;
    this.recordedMatchRunKeys.add(dedupKey);

    const nowMs = params.timestampMs ?? Date.now();
    const record = this.getOrLoadPerUidStats(uid);
    const safeEarned = Math.max(0, Math.floor(params.earnedScoreXp || 0));

    record.matchesPlayed += 1;
    if (params.outcome === 'WIN') {
      record.matchesWon += 1;
    } else {
      record.matchesLost += 1;
    }
    record.accumulatedBattleXp += safeEarned;
    record.highScoreXp = Math.max(record.highScoreXp, safeEarned);

    const b = Math.max(0, Math.floor(params.defeatedByType?.BASIC || 0));
    const f = Math.max(0, Math.floor(params.defeatedByType?.FAST || 0));
    const p = Math.max(0, Math.floor(params.defeatedByType?.POWER || 0));
    const a = Math.max(0, Math.floor(params.defeatedByType?.ARMOR || 0));
    record.defeatedByType.BASIC += b;
    record.defeatedByType.FAST += f;
    record.defeatedByType.POWER += p;
    record.defeatedByType.ARMOR += a;
    record.totalEnemiesDefeated += b + f + p + a;

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
        earnedScoreXp: safeEarned,
        defeatedEnemies: b + f + p + a,
        defeatedByType: { BASIC: b, FAST: f, POWER: p, ARMOR: a },
      },
    });

    this.notify();
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
        levelTopMenuBadge: 'Lv. --',
        levelSystemLabel: 'Chưa thiết lập',
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

    // Level: ONLY real `/users/{uid}.level` if configured; NEVER fabricated (Clause 1.2)
    const realLevel = cloudStats?.level ?? null;
    const levelStatus = realLevel !== null ? 'CONFIGURED' : 'UNCONFIGURED';
    const levelTopMenuBadge = realLevel !== null ? `Lv. ${realLevel}` : 'Lv. --';
    const levelSystemLabel =
      realLevel !== null ? `Cấp ${realLevel}` : 'Chưa thiết lập (Chờ công thức Level)';

    // Quân hàm PvP: ONLY real `/users/{uid}.rank` if present
    const pvpRankCode = cloudStats?.rankCode ?? null;
    const pvpRankLabel = formatPvpRankLabel(pvpRankCode);

    // XP & High Score: strictly separated from Xu; only combine global ScoreManager if current auth matches cleanUid
    const activeAuthUser = AuthManager.getInstance().getCurrentUser();
    const isCurrentActivePlayer = activeAuthUser?.uid === cleanUid && !ScoreManager.isGlobalTrialMode();
    const globalHighScore = isCurrentActivePlayer ? scoreMgr.getHighScore() : 0;

    const totalXp = Math.max(
      localStats.accumulatedBattleXp,
      cloudStats?.xp ?? 0,
      localStats.highScoreXp
    );
    const highScoreXp = Math.max(localStats.highScoreXp, globalHighScore);

    // Xu: strictly decoupled from XP (Clause 1.2)
    const xuBalance =
      cloudStats?.xu !== null && cloudStats?.xu !== undefined
        ? cloudStats.xu
        : isCurrentActivePlayer
          ? scoreMgr.getXuBalance()
          : 0;

    // Login timestamps & counts (reconciled with Firestore createdAt/lastLoginAt if present)
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
      level: realLevel,
      levelStatus,
      levelTopMenuBadge,
      levelSystemLabel,
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

  public clearUidStatsForTesting(uid: string): void {
    this.perUidStore.delete(uid);
    this.cloudFieldsByUid.delete(uid);
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
