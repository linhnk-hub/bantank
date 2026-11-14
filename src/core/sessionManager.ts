/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  runTransaction,
  getDocFromServer,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseDb, handleFirestoreError } from './firebaseConfig.ts';
import { AuthManager } from './authManager.ts';

export const SESSION_TIMINGS = {
  MIN_HEARTBEAT_SERVER_S: 120, // Strict server rule: request.time >= lastActiveAt + 120s
  CLIENT_SAFETY_BUFFER_MS: 5000, // 5s client safety buffer
  MIN_HEARTBEAT_CLIENT_WAIT_MS: 125000, // 120s + 5s = 125s
  TARGET_HEARTBEAT_MS: 150000, // 150s regular heartbeat cycle
  IDLE_WARNING_THRESHOLD_MS: 840000, // 840s (14 minutes) -> show warning 60s before expiry
  IDLE_WARNING_WINDOW_S: 60, // 60 seconds countdown before 15m timeout
  IDLE_TIMEOUT_MS: 900000, // 900s (15 minutes) client idle timeout
} as const;

export interface SessionDocument {
  uid: string;
  sessionId: string;
  deviceId: string;
  isActive: boolean;
  userAgentSummary: string;
  loginAt: any;
  lastActiveAt: any;
}

export type SessionStateStatus =
  | 'NO_SESSION'
  | 'ACQUIRING'
  | 'ACTIVE'
  | 'PAUSED_IDLE'
  | 'CONNECTION_LOST_UNVERIFIED'
  | 'HEARTBEAT_REJECTED_UNCLASSIFIED'
  | 'DISPLACED'
  | 'EXPIRED';

export interface SessionStateSnapshot {
  status: SessionStateStatus;
  sessionId: string | null;
  deviceId: string;
  lastKnownServerActiveMs: number;
  lastUserActivityWallMs: number;
  isIdleWarningVisible: boolean;
  idleRemainingSeconds: number | null;
  message: string | null;
  isHeartbeatInFlight: boolean;
}

export type SessionStateListener = (snapshot: SessionStateSnapshot) => void;

/**
 * Payload đồng bộ giữa các tab trên cùng trình duyệt (BroadcastChannel & localStorage).
 * TUYỆT ĐỐI KHÔNG chứa ID Token, Refresh Token hoặc bất kỳ thông tin xác thực nhạy cảm nào.
 */
export interface SafeMultiTabSyncPayload {
  type: 'SESSION_SYNC' | 'USER_ACTIVITY' | 'SESSION_LOGOUT';
  sessionId: string | null;
  lastConfirmedServerActiveMs: number;
  lastUserActivityWallMs: number;
  time: number;
}

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_KEYS = {
  DEVICE_ID: 'bantank_device_id_v1',
  ACTIVE_SESSION_ID: 'bantank_active_session_id_v1',
  MULTI_TAB_SYNC: 'bantank_session_sync_v1',
};

const BROADCAST_CHANNEL_NAME = 'bantank_session_channel_v1';

export class SessionManager {
  private static instance: SessionManager;
  private db = getFirebaseDb();
  private authManager = AuthManager.getInstance();

  private deviceId: string;
  private currentSessionId: string | null = null;
  private currentUid: string | null = null;
  private status: SessionStateStatus = 'NO_SESSION';
  private statusMessage: string | null = null;

  // Dual-Clock Anchoring pair
  private lastKnownServerActiveMs: number = 0;
  private lastKnownServerActivePerfMs: number = 0;

  // Timers & listeners
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUserPhysicalActivityPerfMs: number = performance.now();
  private lastUserPhysicalActivityWallMs: number = Date.now();
  private lastBroadcastActivityWallMs: number = 0;
  private isUserInteractingInCycle: boolean = true;
  private isIdleWarningVisible: boolean = false;
  private idleRemainingSeconds: number | null = null;
  private earlyRejectRetryCount: number = 0;
  private isHeartbeatInFlight: boolean = false;
  private broadcastChannel: BroadcastChannel | null = null;
  private listeners: Set<SessionStateListener> = new Set();
  private onPauseGameCallback: (() => void) | null = null;

  private constructor() {
    this.deviceId = this.initDeviceId();
    this.setupPhysicalActivityListeners();
    this.setupMultiTabListener();
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public setOnPauseGame(cb: () => void): void {
    this.onPauseGameCallback = cb;
  }

  private initDeviceId(): string {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
        if (stored && stored.length >= 16) {
          return stored;
        }
        const created = generateUUID();
        window.localStorage.setItem(STORAGE_KEYS.DEVICE_ID, created);
        return created;
      }
    } catch (e) {
      console.warn('[SessionManager] localStorage deviceId fallback:', e);
    }
    return generateUUID();
  }

  private saveLocalActiveSessionRecord(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (this.currentUid && this.currentSessionId) {
          window.localStorage.setItem(
            STORAGE_KEYS.ACTIVE_SESSION_ID,
            JSON.stringify({
              uid: this.currentUid,
              sessionId: this.currentSessionId,
              deviceId: this.deviceId,
              lastKnownServerActiveMs: this.lastKnownServerActiveMs,
              savedAtMs: Date.now(),
            })
          );
        } else {
          window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
        }
      }
    } catch {}
  }

  private clearLocalActiveSessionRecord(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
      }
    } catch {}
  }

  private setServerTimeAnchor(serverMs: number): void {
    this.lastKnownServerActiveMs = serverMs;
    this.lastKnownServerActivePerfMs = performance.now();
    this.saveLocalActiveSessionRecord();
    this.broadcastTabSync('SESSION_SYNC');
  }

  public getDeviceId(): string {
    return this.deviceId;
  }

  public subscribe(listener: SessionStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => {
      try {
        fn(snap);
      } catch (e) {
        console.error('[SessionManager] listener error:', e);
      }
    });
  }

  public getSnapshot(): SessionStateSnapshot {
    return {
      status: this.status,
      sessionId: this.currentSessionId,
      deviceId: this.deviceId,
      lastKnownServerActiveMs: this.lastKnownServerActiveMs,
      lastUserActivityWallMs: this.lastUserPhysicalActivityWallMs,
      isIdleWarningVisible: this.isIdleWarningVisible,
      idleRemainingSeconds: this.idleRemainingSeconds,
      message: this.statusMessage,
      isHeartbeatInFlight: this.isHeartbeatInFlight,
    };
  }

  /**
   * Tính thời gian không hoạt động thực tế theo đồng hồ thời gian thực (wall-clock).
   * Không phụ thuộc vào bộ đếm cộng dồn bị đóng băng khi tab ở chế độ ngủ nền.
   */
  public getElapsedIdleMs(nowWallMs: number = Date.now()): number {
    return Math.max(0, nowWallMs - this.lastUserPhysicalActivityWallMs);
  }

  /**
   * Kiểm tra trạng thái không hoạt động (Idle Warning ở phút 14 & Idle Timeout ở phút 15).
   */
  public evaluateIdleState(nowWallMs: number = Date.now()): SessionStateSnapshot {
    if (this.status !== 'ACTIVE') {
      if (this.isIdleWarningVisible || this.idleRemainingSeconds !== null) {
        this.isIdleWarningVisible = false;
        this.idleRemainingSeconds = null;
        this.notify();
      }
      return this.getSnapshot();
    }

    const elapsedWall = Math.max(0, nowWallMs - this.lastUserPhysicalActivityWallMs);

    if (elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
      this.isIdleWarningVisible = false;
      this.idleRemainingSeconds = 0;
      this.handleLocalIdleTimeout();
      return this.getSnapshot();
    }

    if (elapsedWall >= SESSION_TIMINGS.IDLE_WARNING_THRESHOLD_MS) {
      const remainingMs = Math.max(0, SESSION_TIMINGS.IDLE_TIMEOUT_MS - elapsedWall);
      const nextRemainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      const changed =
        !this.isIdleWarningVisible || this.idleRemainingSeconds !== nextRemainingSec;
      this.isIdleWarningVisible = true;
      this.idleRemainingSeconds = nextRemainingSec;
      if (changed) {
        this.notify();
      }
      return this.getSnapshot();
    }

    if (this.isIdleWarningVisible || this.idleRemainingSeconds !== null) {
      this.isIdleWarningVisible = false;
      this.idleRemainingSeconds = null;
      this.notify();
    }
    return this.getSnapshot();
  }

  /**
   * Records user activity (keyboard, mouse/pointer, touch, menu or in-game controls).
   * CRITICAL: Always checks if the session has already exceeded 900,000ms on wall-clock BEFORE resetting timestamps.
   */
  public recordUserActivity(nowWallMs: number = Date.now()): void {
    if (this.status === 'ACTIVE') {
      const elapsedWall = Math.max(0, nowWallMs - this.lastUserPhysicalActivityWallMs);

      // 1. Pre-check: if already expired (>= 15 minutes), terminate immediately and NEVER reset timestamps!
      if (elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
        this.handleLocalIdleTimeout();
        return;
      }
    }

    const hadWarning = this.isIdleWarningVisible;
    this.lastUserPhysicalActivityPerfMs = performance.now();
    this.lastUserPhysicalActivityWallMs = nowWallMs;
    this.isUserInteractingInCycle = true;
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = null;

    // Throttle cross-tab activity broadcast to at most once every 3 seconds (or immediately when dismissing warning)
    if (hadWarning || nowWallMs - this.lastBroadcastActivityWallMs >= 3000) {
      this.lastBroadcastActivityWallMs = nowWallMs;
      this.broadcastTabSync('USER_ACTIVITY');
    }

    if (hadWarning) {
      this.notify();
    }
  }

  /**
   * Người dùng nhấn nút "Tiếp tục phiên" khi cảnh báo sắp hết hạn (60 giây cuối) hiển thị.
   */
  public continueSession(): SessionStateSnapshot {
    if (this.status !== 'ACTIVE') {
      return this.getSnapshot();
    }
    const nowWallMs = Date.now();
    const elapsedWall = Math.max(0, nowWallMs - this.lastUserPhysicalActivityWallMs);
    if (elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
      this.handleLocalIdleTimeout();
      return this.getSnapshot();
    }

    this.lastUserPhysicalActivityPerfMs = performance.now();
    this.lastUserPhysicalActivityWallMs = nowWallMs;
    this.isUserInteractingInCycle = true;
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = null;
    this.lastBroadcastActivityWallMs = nowWallMs;
    this.broadcastTabSync('USER_ACTIVITY');
    this.notify();

    // If enough time has elapsed since the last server anchor (>= 125s), trigger a heartbeat to keep server lease fresh
    const elapsedSinceServerAnchor =
      this.lastKnownServerActiveMs > 0
        ? nowWallMs - this.lastKnownServerActiveMs
        : performance.now() - this.lastKnownServerActivePerfMs;
    if (elapsedSinceServerAnchor >= SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
      this.scheduleNextHeartbeat(50);
    }

    return this.getSnapshot();
  }

  private setupPhysicalActivityListeners(): void {
    if (typeof window === 'undefined') return;

    const onActivity = () => {
      // Do not automatically dismiss the 60s warning on passive pointer/key events if warning modal is open,
      // OR record valid user activity as required by M7.3.11 Section V.3
      this.recordUserActivity();
    };

    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });
    window.addEventListener('mousedown', onActivity, { passive: true });

    // Handle visibilitychange (background <-> foreground tab transitions)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.handleVisibilityOrFocusChange();
      });
    }

    // Handle window focus (switching back to browser window / unlocking screen)
    window.addEventListener('focus', () => {
      this.handleVisibilityOrFocusChange();
    });

    // Check Idle Warning (14m) & Idle Timeout (15m) every 1 second for accurate 60s countdown
    setInterval(() => {
      if (this.status === 'ACTIVE') {
        this.evaluateIdleState(Date.now());
      }
    }, 1000);

    // Online recovery hook
    window.addEventListener('online', () => {
      if (this.status === 'CONNECTION_LOST_UNVERIFIED' && this.currentUid) {
        this.reconcileSessionFromServer({ reason: 'NETWORK_RECOVERED' });
      }
    });
  }

  /**
   * Invoked when tab returns to foreground or window gains focus after sleep/background.
   * M7.3.11 Section V.1 - V.3:
   * - Khi chuyển sang tab khác khoảng 5-10 phút rồi quay lại (< 15 phút), KHÔNG được tự động đăng xuất hoặc báo lỗi giả!
   * - Tính lại thời gian không hoạt động bằng mốc thời gian thực (wall-clock).
   * - Nếu chưa quá 15 phút, người dùng quay lại tab là hành động hợp lệ: cập nhật mốc hoạt động và kiểm tra đối chiếu phiên an toàn.
   */
  private handleVisibilityOrFocusChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (this.status === 'ACTIVE') {
      const nowWallMs = Date.now();
      const elapsedWall = Math.max(0, nowWallMs - this.lastUserPhysicalActivityWallMs);

      // 1. Immediately terminate ONLY if real wall-clock idle time >= 900,000ms (15 minutes)
      if (elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
        this.handleLocalIdleTimeout();
        return;
      }

      // 2. User returned to the tab BEFORE 15 minutes!
      // Returning to the game tab while < 15m idle is valid activity: refresh physical activity timestamp
      // and clear any stale warning so returning at 5m or 10m continues seamlessly.
      this.lastUserPhysicalActivityPerfMs = performance.now();
      this.lastUserPhysicalActivityWallMs = nowWallMs;
      this.isUserInteractingInCycle = true;
      if (this.isIdleWarningVisible) {
        this.isIdleWarningVisible = false;
        this.idleRemainingSeconds = null;
        this.notify();
      }
      this.broadcastTabSync('USER_ACTIVITY');

      // 3. Reconcile with server if tab was in background for >= 125s so we verify single-device lease
      // and refresh heartbeat if needed (WITHOUT triggering HEARTBEAT_REJECTED_UNCLASSIFIED when serverMs == lastKnownServerActiveMs!)
      const elapsedSinceServerAnchorWall =
        this.lastKnownServerActiveMs > 0 ? nowWallMs - this.lastKnownServerActiveMs : elapsedWall;
      if (elapsedSinceServerAnchorWall >= SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
        this.reconcileSessionFromServer({ reason: 'TAB_RETURN' });
      }
    }
  }

  private applyIncomingMultiTabSync(sync: SafeMultiTabSyncPayload): void {
    if (!sync || typeof sync !== 'object') return;

    if (sync.type === 'SESSION_LOGOUT') {
      if (this.status === 'ACTIVE' || this.status === 'ACQUIRING') {
        this.status = 'EXPIRED';
        this.statusMessage = 'Tài khoản đã đăng xuất từ một tab khác trên trình duyệt này.';
        this.terminateSessionLocally(false);
      }
      return;
    }

    if (sync.sessionId && sync.sessionId !== this.currentSessionId && this.currentUid) {
      this.currentSessionId = sync.sessionId;
    }

    if (
      typeof sync.lastConfirmedServerActiveMs === 'number' &&
      sync.lastConfirmedServerActiveMs > this.lastKnownServerActiveMs
    ) {
      this.lastKnownServerActiveMs = sync.lastConfirmedServerActiveMs;
      this.lastKnownServerActivePerfMs = performance.now();
    }

    if (
      typeof sync.lastUserActivityWallMs === 'number' &&
      sync.lastUserActivityWallMs > this.lastUserPhysicalActivityWallMs
    ) {
      this.lastUserPhysicalActivityWallMs = sync.lastUserActivityWallMs;
      this.lastUserPhysicalActivityPerfMs = performance.now();
      this.isUserInteractingInCycle = true;
      if (this.isIdleWarningVisible) {
        this.isIdleWarningVisible = false;
        this.idleRemainingSeconds = null;
        this.notify();
      }
    }
  }

  private setupMultiTabListener(): void {
    if (typeof window === 'undefined') return;

    // 1. BroadcastChannel for instant same-browser multi-tab sync
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.broadcastChannel.onmessage = (event) => {
          this.applyIncomingMultiTabSync(event.data as SafeMultiTabSyncPayload);
        };
      } catch (e) {
        console.warn('[SessionManager] BroadcastChannel init fallback to storage:', e);
      }
    }

    // 2. localStorage storage event fallback
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.MULTI_TAB_SYNC && e.newValue) {
        try {
          const sync = JSON.parse(e.newValue) as SafeMultiTabSyncPayload;
          this.applyIncomingMultiTabSync(sync);
        } catch (err) {
          console.warn('[SessionManager] multi-tab sync error:', err);
        }
      }
    });
  }

  /**
   * Đồng bộ trạng thái phiên và mốc hoạt động giữa các tab cùng trình duyệt.
   * Đảm bảo: KHÔNG BAO GIỜ chứa token, refreshToken hoặc dữ liệu nhạy cảm.
   */
  private broadcastTabSync(
    type: SafeMultiTabSyncPayload['type'] = 'SESSION_SYNC'
  ): SafeMultiTabSyncPayload {
    const payload: SafeMultiTabSyncPayload = {
      type,
      sessionId: this.currentSessionId,
      lastConfirmedServerActiveMs: this.lastKnownServerActiveMs,
      lastUserActivityWallMs: this.lastUserPhysicalActivityWallMs,
      time: Date.now(),
    };
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(payload);
      }
    } catch {}
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEYS.MULTI_TAB_SYNC, JSON.stringify(payload));
      }
    } catch {}
    return payload;
  }

  /**
   * Acquires session using a Firestore Transaction enforcing First-Active-Session Wins.
   * Eliminates client Date.now() skew decisions: authority is delegated to Firestore Security Rules.
   */
  public async acquireSession(uid: string): Promise<{ success: boolean; message: string | null }> {
    this.status = 'ACQUIRING';
    this.currentUid = uid;
    this.notify();

    const newSessionId = generateUUID();
    const sessionDocRef = doc(this.db, 'user_sessions', uid);
    const userAgent =
      typeof navigator !== 'undefined'
        ? (navigator.userAgent || '').substring(0, 110)
        : 'Desktop/Web';

    try {
      await runTransaction(this.db, async (tx) => {
        const snap = await tx.get(sessionDocRef);

        if (snap.exists()) {
          const existing = snap.data() as SessionDocument;
          const hasValidTimestampObj =
            existing.lastActiveAt != null &&
            typeof existing.lastActiveAt === 'object' &&
            typeof existing.lastActiveAt.toMillis === 'function';
          const rawMillis = hasValidTimestampObj ? existing.lastActiveAt.toMillis() : NaN;
          const isValidTimestampMs =
            typeof rawMillis === 'number' && Number.isFinite(rawMillis) && rawMillis > 0;
          const isConfirmedInactive = existing.isActive === false;
          const isConfirmedExpired =
            existing.isActive === true &&
            isValidTimestampMs &&
            Date.now() - rawMillis > SESSION_TIMINGS.IDLE_TIMEOUT_MS;
          // M7.3.11.5 Section 5.4: Fail-Closed nếu isActive == true nhưng lastActiveAt thiếu, null hoặc sai kiểu
          const isHeldByAnotherActiveDevice =
            existing.deviceId !== this.deviceId && !(isConfirmedInactive || isConfirmedExpired);

          // M7.3.11.1 Section I (First-Active-Session Wins):
          // If Device A holds an active session lease (<= 900s) or timestamp is corrupted while active,
          // Device B MUST be rejected immediately and MUST NOT overwrite Device A's session document!
          if (isHeldByAnotherActiveDevice) {
            const err: any = new Error('SESSION_HELD_BY_ACTIVE_DEVICE');
            err.code = 'permission-denied';
            throw err;
          }

          // Firestore Security Rules (isNewSessionAcquisitionAction) also enforces at DB level:
          // (!isExistingSessionStillActive() || incoming().deviceId == existing().deviceId)
          // based on server request.time <= existing().lastActiveAt + 900s.
          tx.update(sessionDocRef, {
            sessionId: newSessionId,
            deviceId: this.deviceId,
            isActive: true,
            userAgentSummary: userAgent,
            loginAt: serverTimestamp(),
            lastActiveAt: serverTimestamp(),
          });
        } else {
          // Initial creation
          tx.set(sessionDocRef, {
            uid,
            sessionId: newSessionId,
            deviceId: this.deviceId,
            isActive: true,
            userAgentSummary: userAgent,
            loginAt: serverTimestamp(),
            lastActiveAt: serverTimestamp(),
          });
        }
      });

      this.currentSessionId = newSessionId;

      // Verify and anchor server timestamp immediately after transaction
      const verifySnap = await getDocFromServer(sessionDocRef);
      if (verifySnap.exists()) {
        const data = verifySnap.data() as SessionDocument;
        this.setServerTimeAnchor(data.lastActiveAt.toMillis());
      } else {
        this.setServerTimeAnchor(Date.now());
      }

      this.status = 'ACTIVE';
      this.statusMessage = null;
      this.isIdleWarningVisible = false;
      this.idleRemainingSeconds = null;
      this.earlyRejectRetryCount = 0;
      this.isUserInteractingInCycle = true;
      this.lastUserPhysicalActivityPerfMs = performance.now();
      this.lastUserPhysicalActivityWallMs = Date.now();
      this.saveLocalActiveSessionRecord();
      this.broadcastTabSync('SESSION_SYNC');
      this.notify();
      this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);

      return { success: true, message: null };
    } catch (err: any) {
      const msg = String(err?.message || err?.code || err);

      // Check if Firestore database is not yet created on Firebase Console
      if (
        msg.includes('does not exist') ||
        msg.includes('not-found') ||
        msg.includes('NOT_FOUND')
      ) {
        this.status = 'NO_SESSION';
        this.statusMessage =
          'Cơ sở dữ liệu chưa được khởi tạo. Vui lòng tạo để kích hoạt kết nối.';
        this.notify();
        return { success: false, message: this.statusMessage };
      }

      const isPermissionDenied =
        msg.includes('SESSION_HELD_BY_ACTIVE_DEVICE') ||
        msg.includes('permission-denied') ||
        msg.includes('PERMISSION_DENIED') ||
        err?.code === 'permission-denied';

      if (isPermissionDenied) {
        // Double-check via getDocFromServer to verify if it's held by another active device
        try {
          const verifySnap = await getDocFromServer(sessionDocRef);
          if (verifySnap.exists()) {
            const data = verifySnap.data() as SessionDocument;
            // ONLY reject with active-device conflict when server proves another device holds an active session.
            // Device B is rejected; Device A's document on the server remains 100% untouched!
            if (data.deviceId !== this.deviceId && data.isActive === true) {
              this.currentSessionId = null;
              this.status = 'DISPLACED';
              this.statusMessage =
                'Từ chối đăng nhập: Tài khoản này đang hoạt động trên thiết bị khác. Đăng xuất trên thiết bị khác hoặc chờ thử lại sau 15 phút.';
              this.notify();
              return { success: false, message: this.statusMessage };
            }

            // If doc exists AND data.deviceId === this.deviceId && data.isActive === true,
            // resume existing active session on this same device!
            if (data.deviceId === this.deviceId && data.isActive === true && data.sessionId) {
              this.currentSessionId = data.sessionId;
              const srvMs =
                typeof data.lastActiveAt?.toMillis === 'function'
                  ? data.lastActiveAt.toMillis()
                  : Date.now();
              this.setServerTimeAnchor(srvMs);
              this.status = 'ACTIVE';
              this.statusMessage = null;
              this.isIdleWarningVisible = false;
              this.idleRemainingSeconds = null;
              this.lastUserPhysicalActivityPerfMs = performance.now();
              this.lastUserPhysicalActivityWallMs = Date.now();
              this.notify();
              this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
              return { success: true, message: null };
            }

            this.status = 'NO_SESSION';
            this.statusMessage =
              'Không đủ quyền truy cập hoặc vi phạm điều kiện bảo mật phiên đăng nhập.';
            this.notify();
            return { success: false, message: this.statusMessage };
          } else {
            this.status = 'NO_SESSION';
            this.statusMessage =
              'Không thể tạo kết nối: Tài khoản không thỏa mãn điều kiện bảo mật.';
            this.notify();
            return { success: false, message: this.statusMessage };
          }
        } catch (readErr: any) {
          const readMsg = String(readErr?.message || readErr);
          if (
            readMsg.includes('does not exist') ||
            readMsg.includes('not-found') ||
            readMsg.includes('NOT_FOUND')
          ) {
            this.status = 'NO_SESSION';
            this.statusMessage =
              'Cơ sở dữ liệu chưa được khởi tạo. Vui lòng tạo để kích hoạt kết nối.';
            this.notify();
            return { success: false, message: this.statusMessage };
          }

          this.status = 'CONNECTION_LOST_UNVERIFIED';
          this.statusMessage =
            'Gặp lỗi kiểm tra quyền từ máy chủ nhưng không thể đọc đối chiếu do sự cố kết nối mạng. Vui lòng kiểm tra lại kết nối mạng.';
          this.notify();
          return { success: false, message: this.statusMessage };
        }
      }

      // If network / offline error during transaction:
      const isNetworkError =
        msg.includes('unavailable') ||
        msg.includes('network-request-failed') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (isNetworkError) {
        this.status = 'CONNECTION_LOST_UNVERIFIED';
        this.statusMessage =
          'Không thể kết nối đến máy chủ để xác thực. Vui lòng kiểm tra kết nối mạng.';
        this.notify();
        return { success: false, message: this.statusMessage };
      }

      this.status = 'NO_SESSION';
      this.statusMessage = err?.message || 'Không thể xác thực phiên.';
      this.notify();
      return { success: false, message: this.statusMessage };
    }
  }

  private scheduleNextHeartbeat(delayMs: number): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
    }, delayMs);
  }

  /**
   * Regular periodic heartbeat (target: 150s).
   */
  private async sendHeartbeat(): Promise<void> {
    if (this.status !== 'ACTIVE' || !this.currentUid || !this.currentSessionId) {
      return;
    }

    // Skip update if user was completely dormant in this cycle
    if (!this.isUserInteractingInCycle) {
      this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
      return;
    }

    // Check both wall-clock since server anchor and monotonic clock before dispatching network request
    const elapsedWallSinceAnchor =
      this.lastKnownServerActiveMs > 0
        ? Date.now() - this.lastKnownServerActiveMs
        : performance.now() - this.lastKnownServerActivePerfMs;
    const elapsedPerfSinceAnchor = performance.now() - this.lastKnownServerActivePerfMs;
    const effectiveElapsed = Math.max(elapsedWallSinceAnchor, elapsedPerfSinceAnchor);

    if (effectiveElapsed < SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
      const waitRemaining = SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS - effectiveElapsed;
      this.scheduleNextHeartbeat(waitRemaining);
      return;
    }

    const sessionDocRef = doc(this.db, 'user_sessions', this.currentUid);

    this.isHeartbeatInFlight = true;
    this.notify();

    try {
      await updateDoc(sessionDocRef, {
        lastActiveAt: serverTimestamp(),
      });

      // Confirm with server read
      const verifySnap = await getDocFromServer(sessionDocRef);
      if (verifySnap.exists()) {
        const data = verifySnap.data() as SessionDocument;
        if (data.lastActiveAt.toMillis() > this.lastKnownServerActiveMs) {
          this.setServerTimeAnchor(data.lastActiveAt.toMillis());
        }
      }

      this.isUserInteractingInCycle = false;
      this.earlyRejectRetryCount = 0;
      this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
        // Reconcile before deciding
        await this.reconcileSessionFromServer({ reason: 'HEARTBEAT_PERMISSION_DENIED' });
      } else {
        // Network or connection error: pause gameplay safely without sign out
        this.status = 'CONNECTION_LOST_UNVERIFIED';
        this.statusMessage =
          'Trận đấu đang tạm dừng.';
        if (this.onPauseGameCallback) this.onPauseGameCallback();
        this.notify();
      }
    } finally {
      this.isHeartbeatInFlight = false;
      this.notify();
    }
  }

  /**
   * Reconciles session state directly from serverDoc. Never signs out on transient network errors or valid tab switches.
   * Fix M7.3.11 Section V:
   * - Khi quay lại tab sau 5-10 phút (reason === 'TAB_RETURN' hoặc 'NETWORK_RECOVERED'), serverMs có thể bằng đúng
   *   lastKnownServerActiveMs vì tab ẩn không gửi heartbeat. Miễn là phiên trên server vẫn isActive === true,
   *   cùng deviceId, cùng sessionId và chưa quá 15 phút (900,000ms), phiên hoàn toàn hợp lệ (ACTIVE) và sẽ gửi heartbeat gia hạn!
   */
  public async reconcileSessionFromServer(options?: {
    reason?: 'TAB_RETURN' | 'NETWORK_RECOVERED' | 'HEARTBEAT_PERMISSION_DENIED';
  }): Promise<void> {
    if (!this.currentUid) return;

    const reason = options?.reason ?? 'TAB_RETURN';
    const sessionDocRef = doc(this.db, 'user_sessions', this.currentUid);

    try {
      const snap = await getDocFromServer(sessionDocRef);

      if (!snap.exists()) {
        this.status = 'EXPIRED';
        this.statusMessage = 'Kết nối không tồn tại hoặc đã bị xóa.';
        this.terminateSessionLocally();
        return;
      }

      const data = snap.data() as SessionDocument;

      // Definitive evidence checks
      if (data.isActive === false) {
        this.status = 'EXPIRED';
        this.statusMessage = 'Tài khoản đã đăng xuất.';
        this.terminateSessionLocally();
        return;
      }

      if (data.deviceId !== this.deviceId) {
        this.status = 'DISPLACED';
        this.statusMessage = 'Tài khoản đang được đăng nhập trên một thiết bị khác.';
        this.terminateSessionLocally();
        return;
      }

      if (data.sessionId !== this.currentSessionId) {
        // If same deviceId but another tab on the same browser updated sessionId, sync it rather than displacing!
        if (data.deviceId === this.deviceId && data.isActive === true && data.sessionId) {
          this.currentSessionId = data.sessionId;
        } else {
          this.status = 'DISPLACED';
          this.statusMessage = 'Kết nối máy chủ bị gián đoạn. Vui lòng đăng nhập lại.';
          this.terminateSessionLocally();
          return;
        }
      }

      const serverMs =
        typeof data.lastActiveAt?.toMillis === 'function'
          ? data.lastActiveAt.toMillis()
          : this.lastKnownServerActiveMs;

      const nowWallMs = Date.now();
      const serverIdleElapsedMs = Math.max(0, nowWallMs - serverMs);

      // Check if server session has exceeded 15 minutes (900,000ms)
      if (serverIdleElapsedMs >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
        this.status = 'EXPIRED';
        this.statusMessage =
          'Kết nối với máy chủ đã hết hạn sau 15 phút không hoạt động. Vui lòng đăng nhập lại.';
        this.terminateSessionLocally();
        return;
      }

      // If server has a newer timestamp (e.g. another tab sent a heartbeat), anchor and continue ACTIVE
      if (serverMs > this.lastKnownServerActiveMs) {
        this.setServerTimeAnchor(serverMs);
        this.status = 'ACTIVE';
        this.statusMessage = null;
        this.earlyRejectRetryCount = 0;
        this.notify();
        this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
        return;
      }

      // CRITICAL FIX FOR 5-MINUTE TAB SWITCH:
      // When returning from another tab or recovering network before 15 minutes, serverMs === lastKnownServerActiveMs
      // is normal because no heartbeat was sent while hidden. The session is still valid on the server!
      if (reason !== 'HEARTBEAT_PERMISSION_DENIED' && serverMs === this.lastKnownServerActiveMs) {
        this.status = 'ACTIVE';
        this.statusMessage = null;
        this.earlyRejectRetryCount = 0;
        this.notify();

        if (serverIdleElapsedMs >= SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
          // Immediately trigger a heartbeat to extend the server lease now that the user is back
          this.isUserInteractingInCycle = true;
          this.scheduleNextHeartbeat(100);
        } else {
          const remainingToNextHeartbeat = Math.max(
            5000,
            SESSION_TIMINGS.TARGET_HEARTBEAT_MS - serverIdleElapsedMs
          );
          this.scheduleNextHeartbeat(remainingToNextHeartbeat);
        }
        return;
      }

      // If we got here because sendHeartbeat threw PERMISSION_DENIED, check if it was just sent too early (< 125s)
      if (
        reason === 'HEARTBEAT_PERMISSION_DENIED' &&
        serverIdleElapsedMs < SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS &&
        this.earlyRejectRetryCount < 2
      ) {
        this.earlyRejectRetryCount += 1;
        this.status = 'ACTIVE';
        this.statusMessage = null;
        this.notify();
        const waitMs =
          SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS - serverIdleElapsedMs + 2000;
        this.scheduleNextHeartbeat(waitMs);
        return;
      }

      // Otherwise, an actual heartbeat write after >= 125s was rejected by server rules: enter safe pause state
      this.status = 'HEARTBEAT_REJECTED_UNCLASSIFIED';
      this.statusMessage =
        'Không thể xác minh quyền gia hạn kết nối. Trận đấu đang tạm dừng để bảo vệ tài khoản.';
      if (this.onPauseGameCallback) this.onPauseGameCallback();
      this.notify();
    } catch (err: any) {
      // Offline/network failure: keep safe unverified state, do NOT signOut
      this.status = 'CONNECTION_LOST_UNVERIFIED';
      this.statusMessage =
        'Trận đấu đang tạm dừng.';
      if (this.onPauseGameCallback) this.onPauseGameCallback();
      this.notify();
    }
  }

  /**
   * User-triggered "Thử xác thực lại" following the strict 6-step flow.
   */
  public async handleUserReauthenticate(): Promise<{ success: boolean; message: string }> {
    if (!this.currentUid) {
      return { success: false, message: 'Chưa có thông tin phiên.' };
    }

    // Step 1: Silent ID Token refresh
    const tokenRes = await this.authManager.refreshIdToken();
    if (tokenRes.status === 'NETWORK_ERROR') {
      return {
        success: false,
        message: 'Mạng không ổn định. Vui lòng kiểm tra lại kết nối.',
      };
    }
    if (tokenRes.status === 'AUTH_INVALID') {
      return {
        success: false,
        message: 'Xác thực tài khoản Google đã hết hạn. Vui lòng đăng nhập lại.',
      };
    }

    // Step 2 & 3: Read and reconcile from server
    const sessionDocRef = doc(this.db, 'user_sessions', this.currentUid);
    let serverDoc;
    try {
      serverDoc = await getDocFromServer(sessionDocRef);
    } catch (e) {
      return {
        success: false,
        message: 'Kết nối mạng không ổn định. Chưa thể đối chiếu dữ liệu máy chủ.',
      };
    }

    if (!serverDoc.exists()) {
      this.status = 'EXPIRED';
      this.statusMessage = 'Kết nối không tồn tại.';
      this.terminateSessionLocally();
      return { success: false, message: this.statusMessage };
    }

    const data = serverDoc.data() as SessionDocument;
    if (
      data.isActive === false ||
      data.deviceId !== this.deviceId ||
      data.sessionId !== this.currentSessionId
    ) {
      this.status = 'DISPLACED';
      this.statusMessage = 'Phiên làm việc đã chuyển sang thiết bị khác hoặc đã kết thúc.';
      this.terminateSessionLocally();
      return { success: false, message: this.statusMessage };
    }

    // Step 4: Dual-clock anchor check
    const serverMs = data.lastActiveAt.toMillis();
    if (serverMs > this.lastKnownServerActiveMs) {
      this.setServerTimeAnchor(serverMs);
      this.status = 'ACTIVE';
      this.statusMessage = null;
      this.earlyRejectRetryCount = 0;
      this.notify();
      this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
      return { success: true, message: 'Đã gia hạn kết nối.' };
    }

    // Step 4b: Check 120s + buffer constraint on wall-clock and client monotonic clock
    const deltaWall = this.lastKnownServerActiveMs > 0 ? Date.now() - this.lastKnownServerActiveMs : 0;
    const deltaClient = Math.max(deltaWall, performance.now() - this.lastKnownServerActivePerfMs);
    if (deltaClient < SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
      const waitRemainingSec = Math.ceil(
        (SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS - deltaClient) / 1000
      );
      return {
        success: false,
        message: `Chưa đủ thời gian gia hạn (120 giây). Vui lòng thử lại sau ${waitRemainingSec} giây.`,
      };
    }

    // Step 5: Exactly one extension request
    try {
      await updateDoc(sessionDocRef, {
        lastActiveAt: serverTimestamp(),
      });
    } catch (err: any) {
      this.status = 'HEARTBEAT_REJECTED_UNCLASSIFIED';
      this.statusMessage =
        'Yêu cầu gia hạn kết nối chưa được máy chủ chấp thuận. Trận đấu đang tạm dừng.';
      this.notify();
      return { success: false, message: this.statusMessage };
    }

    // Step 6: Mandatory post-write read confirmation
    try {
      const verifyDoc = await getDocFromServer(sessionDocRef);
      if (verifyDoc.exists()) {
        const verifyData = verifyDoc.data() as SessionDocument;
        if (
          verifyData.isActive === true &&
          verifyData.deviceId === this.deviceId &&
          verifyData.sessionId === this.currentSessionId &&
          verifyData.lastActiveAt.toMillis() > this.lastKnownServerActiveMs
        ) {
          this.setServerTimeAnchor(verifyData.lastActiveAt.toMillis());
          this.status = 'ACTIVE';
          this.statusMessage = null;
          this.earlyRejectRetryCount = 0;
          this.notify();
          this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
          return { success: true, message: 'Gia hạn phiên thành công!' };
        }
      }
    } catch (e) {
      return {
        success: false,
        message:
          'Yêu cầu đã gửi nhưng chưa thể xác nhận phản hồi từ máy chủ. Vui lòng thử lại khi có mạng.',
      };
    }

    return {
      success: false,
      message: 'Không thể xác minh phản hồi gia hạn từ máy chủ.',
    };
  }

  private handleLocalIdleTimeout(): void {
    if (this.onPauseGameCallback) this.onPauseGameCallback();
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = 0;
    this.status = 'PAUSED_IDLE';
    this.statusMessage =
      'Kết nối đã hết hạn sau 15 phút không hoạt động. Vui lòng đăng nhập lại.';
    this.releaseSessionAndSignOut();
  }

  public async releaseSessionAndSignOut(): Promise<void> {
    if (this.currentUid && this.currentSessionId) {
      try {
        const sessionDocRef = doc(this.db, 'user_sessions', this.currentUid);
        await updateDoc(sessionDocRef, {
          isActive: false,
          lastActiveAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn('[SessionManager] releaseSession error:', e);
      }
    }
    this.broadcastTabSync('SESSION_LOGOUT');
    this.terminateSessionLocally(true);
  }

  private terminateSessionLocally(shouldSignOutAuth: boolean = true): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentSessionId = null;
    this.currentUid = null;
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = null;
    this.clearLocalActiveSessionRecord();
    this.notify();
    if (shouldSignOutAuth) {
      this.authManager.signOut();
    }
  }

  /**
   * Bộ hàm mô phỏng tất định (Deterministic Test Helpers) phục vụ kiểm thử tự động M7.3.11 & M7.3.11.1.
   * Không phụ thuộc vào localStorage làm nguồn quyết định quyền chiếm giữ phiên.
   */
  public initMockActiveSessionForTesting(params: {
    uid: string;
    sessionId: string;
    serverActiveMs?: number;
  }): SessionStateSnapshot {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const nowWall = Date.now();
    this.currentUid = params.uid;
    this.currentSessionId = params.sessionId;
    this.status = 'ACTIVE';
    this.statusMessage = null;
    this.lastKnownServerActiveMs = params.serverActiveMs ?? nowWall;
    this.lastKnownServerActivePerfMs = performance.now();
    this.lastUserPhysicalActivityWallMs = nowWall;
    this.lastUserPhysicalActivityPerfMs = performance.now();
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = null;
    this.notify();
    return this.getSnapshot();
  }

  /**
   * M7.3.11.1 Mục I: Bộ trọng tài phiên máy chủ chuẩn First-Active-Session Wins (khớp 100% Firestore Rules `isNewSessionAcquisitionAction`).
   * - Nếu Thiết bị A đang có phiên hợp lệ (`isActive === true` và `serverNowMs <= lastActiveAtMs + 900,000ms`),
   *   Thiết bị B (`incomingDeviceId !== existing.deviceId`) đăng nhập cùng Gmail PHẢI BỊ TỪ CHỐI (`allowed: false`).
   * - Thiết bị B không được chiếm quyền và KHÔNG làm Thiết bị A chuyển sang `DISPLACED`.
   * - Thiết bị A tiếp tục `ACTIVE` bình thường (kể cả khi A đang chuyển tab 5 phút hoặc mất mạng tạm thời chưa quá 15 phút).
   * - Chỉ khi A chủ động đăng xuất (`isActive === false`) hoặc phiên của A thực sự quá 15 phút không hoạt động (`> 900,000ms`),
   *   session lease mới được giải phóng để Thiết bị B đăng nhập hợp lệ (`allowed: true`).
   */
  public evaluateFirstActiveSessionLeaseForTesting(params: {
    serverNowMs: number;
    existingServerLease: {
      uid: string;
      deviceId: string;
      sessionId: string;
      isActive: boolean;
      lastActiveAtMs: number;
    } | null;
    incomingAttempt: {
      uid: string;
      deviceId: string;
      newSessionId: string;
    };
  }): {
    bAcquisitionAllowed: boolean;
    bStatusAfterAttempt: SessionStateStatus;
    aStatusOnServer: 'ACTIVE' | 'RELEASED_OR_EXPIRED';
    resultingServerLease: {
      uid: string;
      deviceId: string;
      sessionId: string;
      isActive: boolean;
      lastActiveAtMs: number;
    };
    reasonVi: string;
  } {
    const { serverNowMs, existingServerLease, incomingAttempt } = params;

    // 1. Chưa có phiên nào trên server -> Thiết bị đầu tiên được cấp lease
    if (!existingServerLease) {
      return {
        bAcquisitionAllowed: true,
        bStatusAfterAttempt: 'ACTIVE',
        aStatusOnServer: 'RELEASED_OR_EXPIRED',
        resultingServerLease: {
          uid: incomingAttempt.uid,
          deviceId: incomingAttempt.deviceId,
          sessionId: incomingAttempt.newSessionId,
          isActive: true,
          lastActiveAtMs: serverNowMs,
        },
        reasonVi: 'Cấp mới session lease cho thiết bị đầu tiên.',
      };
    }

    const rawLastActiveMs = (existingServerLease as any).lastActiveAtMs;
    const isValidLastActiveMs =
      typeof rawLastActiveMs === 'number' &&
      Number.isFinite(rawLastActiveMs) &&
      rawLastActiveMs > 0;
    const isConfirmedInactive = existingServerLease.isActive === false;
    const isConfirmedExpired =
      existingServerLease.isActive === true &&
      isValidLastActiveMs &&
      serverNowMs > rawLastActiveMs + SESSION_TIMINGS.IDLE_TIMEOUT_MS;

    // M7.3.11.5 Section 5.4: Fail-Closed nếu isActive === true nhưng lastActiveAtMs thiếu, null, <= 0, NaN hoặc sai kiểu
    const isExistingStillActive = !(isConfirmedInactive || isConfirmedExpired);

    const isSameDevice = incomingAttempt.deviceId === existingServerLease.deviceId;

    // 2. Nếu Thiết bị A đang có phiên hợp lệ (hoặc Fail-Closed do timestamp lỗi khi isActive == true) và Thiết bị B khác deviceId thử đăng nhập:
    //    BỊ TỪ CHỐI! Thiết bị A vẫn giữ nguyên lease và trạng thái ACTIVE.
    if (isExistingStillActive && !isSameDevice) {
      return {
        bAcquisitionAllowed: false,
        bStatusAfterAttempt: 'DISPLACED',
        aStatusOnServer: 'ACTIVE',
        resultingServerLease: { ...existingServerLease },
        reasonVi: !isValidLastActiveMs
          ? 'Fail-Closed (M7.3.11.5 Section 5.4): Phiên hiện tại có isActive == true nhưng lastActiveAt thiếu hoặc không hợp lệ; từ chối Thiết bị B chiếm lease.'
          : 'Từ chối Thiết bị B: Thiết bị A đang giữ phiên hoạt động hợp lệ. Thiết bị A tiếp tục ACTIVE.',
      };
    }

    // 3. Nếu phiên của A đã đăng xuất chủ động (isActive == false) hoặc đã quá 15 phút (> 900,000ms),
    //    hoặc chính thiết bị đó khởi tạo lại -> cho phép cấp lease mới.
    return {
      bAcquisitionAllowed: true,
      bStatusAfterAttempt: 'ACTIVE',
      aStatusOnServer: isSameDevice ? 'ACTIVE' : 'RELEASED_OR_EXPIRED',
      resultingServerLease: {
        uid: incomingAttempt.uid,
        deviceId: incomingAttempt.deviceId,
        sessionId: incomingAttempt.newSessionId,
        isActive: true,
        lastActiveAtMs: serverNowMs,
      },
      reasonVi: !existingServerLease.isActive
        ? 'Thiết bị A đã chủ động đăng xuất; Thiết bị B được phép nhận session lease.'
        : 'Phiên của Thiết bị A đã hết hạn sau hơn 15 phút không hoạt động; Thiết bị B được phép nhận session lease.',
    };
  }

  public simulateTabSwitchReturnForTesting(params: {
    backgroundDurationMs: number;
    serverDocState: {
      exists: boolean;
      isActive: boolean;
      deviceId: string;
      sessionId: string;
      lastActiveAtMs: number;
    };
  }): SessionStateSnapshot {
    const nowWall = Date.now();
    // Simulate that the user's last activity before switching away was `backgroundDurationMs` ago
    this.lastUserPhysicalActivityWallMs = nowWall - params.backgroundDurationMs;

    // 1. If background duration >= 15 minutes (900,000ms), session expires on return
    if (params.backgroundDurationMs >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
      this.status = 'PAUSED_IDLE';
      this.statusMessage =
        'Kết nối đã hết hạn sau 15 phút không hoạt động. Vui lòng đăng nhập lại.';
      this.isIdleWarningVisible = false;
      this.idleRemainingSeconds = 0;
      if (this.heartbeatTimer) {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.currentSessionId = null;
      this.currentUid = null;
      this.notify();
      return this.getSnapshot();
    }

    // 2. User returned before 15 minutes (< 900,000ms): refresh user activity and reconcile against serverDocState
    this.lastUserPhysicalActivityWallMs = nowWall;
    this.lastUserPhysicalActivityPerfMs = performance.now();
    this.isIdleWarningVisible = false;
    this.idleRemainingSeconds = null;

    const srv = params.serverDocState;
    if (!srv.exists || !srv.isActive) {
      this.status = 'EXPIRED';
      this.statusMessage = 'Kết nối không tồn tại hoặc đã kết thúc.';
      this.currentSessionId = null;
      this.currentUid = null;
      this.notify();
      return this.getSnapshot();
    }

    if (srv.deviceId !== this.deviceId) {
      this.status = 'DISPLACED';
      this.statusMessage = 'Tài khoản đang được đăng nhập trên một thiết bị khác.';
      this.currentSessionId = null;
      this.currentUid = null;
      this.notify();
      return this.getSnapshot();
    }

    // Even when srv.lastActiveAtMs === this.lastKnownServerActiveMs (no heartbeat while tab was hidden),
    // the session MUST remain ACTIVE and NEVER enter HEARTBEAT_REJECTED_UNCLASSIFIED!
    if (srv.lastActiveAtMs >= this.lastKnownServerActiveMs) {
      this.lastKnownServerActiveMs = srv.lastActiveAtMs;
      this.status = 'ACTIVE';
      this.statusMessage = null;
    }

    this.notify();
    return this.getSnapshot();
  }

  public simulateIdleElapsedForTesting(elapsedIdleMs: number): SessionStateSnapshot {
    const nowWall = Date.now();
    this.lastUserPhysicalActivityWallMs = nowWall - elapsedIdleMs;
    if (elapsedIdleMs >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
      if (this.heartbeatTimer) {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.isIdleWarningVisible = false;
      this.idleRemainingSeconds = 0;
      this.status = 'PAUSED_IDLE';
      this.statusMessage =
        'Kết nối đã hết hạn sau 15 phút không hoạt động. Vui lòng đăng nhập lại.';
      this.currentSessionId = null;
      this.currentUid = null;
      this.notify();
      return this.getSnapshot();
    }
    return this.evaluateIdleState(nowWall);
  }

  public simulateNetworkDisconnectForTesting(): SessionStateSnapshot {
    if (this.status === 'ACTIVE') {
      this.status = 'CONNECTION_LOST_UNVERIFIED';
      this.statusMessage =
        'Mất kết nối với máy chủ. Trận đấu đang tạm dừng để chờ xác minh lại phiên...';
      if (this.onPauseGameCallback) this.onPauseGameCallback();
      this.notify();
    }
    return this.getSnapshot();
  }

  public simulateMultiTabSyncPayloadForTesting(
    payload: SafeMultiTabSyncPayload
  ): SessionStateSnapshot {
    this.applyIncomingMultiTabSync(payload);
    return this.getSnapshot();
  }

  public getSafeMultiTabPayloadForTesting(): SafeMultiTabSyncPayload {
    return this.broadcastTabSync('SESSION_SYNC');
  }
}

