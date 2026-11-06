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
  message: string | null;
  isHeartbeatInFlight: boolean;
}

export type SessionStateListener = (snapshot: SessionStateSnapshot) => void;

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
  private isUserInteractingInCycle: boolean = true;
  private earlyRejectRetryCount: number = 0;
  private isHeartbeatInFlight: boolean = false;
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

  private setServerTimeAnchor(serverMs: number): void {
    this.lastKnownServerActiveMs = serverMs;
    this.lastKnownServerActivePerfMs = performance.now();
    this.broadcastTabSync();
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
      message: this.statusMessage,
      isHeartbeatInFlight: this.isHeartbeatInFlight,
    };
  }

  /**
   * Records user activity (keyboard, joystick, shoot button, in-game control touches).
   * CRITICAL: Always checks if the session has already exceeded 900,000ms BEFORE resetting timestamps.
   */
  public recordUserActivity(): void {
    if (this.status === 'ACTIVE') {
      const elapsedPerf = performance.now() - this.lastUserPhysicalActivityPerfMs;
      const elapsedWall = Date.now() - this.lastUserPhysicalActivityWallMs;

      // 1. Pre-check: if already expired, terminate immediately and NEVER reset timestamps!
      if (
        elapsedPerf >= SESSION_TIMINGS.IDLE_TIMEOUT_MS ||
        elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS
      ) {
        this.handleLocalIdleTimeout();
        return;
      }
    }

    this.lastUserPhysicalActivityPerfMs = performance.now();
    this.lastUserPhysicalActivityWallMs = Date.now();
    this.isUserInteractingInCycle = true;
  }

  private setupPhysicalActivityListeners(): void {
    if (typeof window === 'undefined') return;

    const onActivity = () => {
      this.recordUserActivity();
    };

    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('touchstart', onActivity, { passive: true });

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

    // Client-side Idle Timeout check every 10 seconds
    setInterval(() => {
      if (this.status === 'ACTIVE') {
        const elapsedPerf = performance.now() - this.lastUserPhysicalActivityPerfMs;
        const elapsedWall = Date.now() - this.lastUserPhysicalActivityWallMs;
        if (
          elapsedPerf >= SESSION_TIMINGS.IDLE_TIMEOUT_MS ||
          elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS
        ) {
          this.handleLocalIdleTimeout();
        }
      }
    }, 10000);

    // Online recovery hook
    window.addEventListener('online', () => {
      if (this.status === 'CONNECTION_LOST_UNVERIFIED' && this.currentUid) {
        this.reconcileSessionFromServer();
      }
    });
  }

  /**
   * Invoked when tab returns to foreground or window gains focus after sleep/background.
   */
  private handleVisibilityOrFocusChange(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (this.status === 'ACTIVE') {
      const elapsedPerf = performance.now() - this.lastUserPhysicalActivityPerfMs;
      const elapsedWall = Date.now() - this.lastUserPhysicalActivityWallMs;

      // 1. Immediately terminate if idle elapsed >= 900,000ms on either clock
      if (
        elapsedPerf >= SESSION_TIMINGS.IDLE_TIMEOUT_MS ||
        elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS
      ) {
        this.handleLocalIdleTimeout();
        return;
      }

      // 2. Detect anomalous sleep / suspension gap (e.g. wall clock elapsed > 150s or gap between wall & monotonic > 30s)
      // Tạm khóa thao tác và gọi đối chiếu phiên với máy chủ (reconcileSessionFromServer) trước khi tiếp tục.
      // Tuyệt đối không tự động gia hạn heartbeat! Chỉ đọc đối chiếu máy chủ bằng getDocFromServer.
      if (elapsedWall >= SESSION_TIMINGS.TARGET_HEARTBEAT_MS || Math.abs(elapsedWall - elapsedPerf) > 30000) {
        this.reconcileSessionFromServer();
      }
    }
  }

  private setupMultiTabListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.MULTI_TAB_SYNC && e.newValue) {
        try {
          const sync = JSON.parse(e.newValue);
          if (sync.sessionId && sync.sessionId !== this.currentSessionId) {
            this.currentSessionId = sync.sessionId;
          }
          if (sync.lastConfirmedServerActiveMs > this.lastKnownServerActiveMs) {
            this.lastKnownServerActiveMs = sync.lastConfirmedServerActiveMs;
            this.lastKnownServerActivePerfMs = performance.now();
          }
        } catch (err) {
          console.warn('[SessionManager] multi-tab sync error:', err);
        }
      }
    });
  }

  private broadcastTabSync(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          STORAGE_KEYS.MULTI_TAB_SYNC,
          JSON.stringify({
            sessionId: this.currentSessionId,
            lastConfirmedServerActiveMs: this.lastKnownServerActiveMs,
            time: Date.now(),
          })
        );
      }
    } catch {}
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
          // Do NOT evaluate Date.now() on the client to decide session validity!
          // We issue the update transaction directly.
          // Firestore Security Rules (isNewSessionAcquisitionAction) will enforce:
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

      // Verify and anchor server timestamp immediately after transaction
      const verifySnap = await getDocFromServer(sessionDocRef);
      if (verifySnap.exists()) {
        const data = verifySnap.data() as SessionDocument;
        this.setServerTimeAnchor(data.lastActiveAt.toMillis());
      }

      this.currentSessionId = newSessionId;
      this.status = 'ACTIVE';
      this.statusMessage = null;
      this.earlyRejectRetryCount = 0;
      this.isUserInteractingInCycle = true;
      this.lastUserPhysicalActivityPerfMs = performance.now();
      this.lastUserPhysicalActivityWallMs = Date.now();
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
          'Cơ sở dữ liệu Firestore chưa được khởi tạo trên Firebase Console. Vui lòng tạo Firestore Database để kích hoạt phiên chơi.';
        this.notify();
        return { success: false, message: this.statusMessage };
      }

      const isPermissionDenied =
        msg.includes('permission-denied') ||
        msg.includes('PERMISSION_DENIED') ||
        err?.code === 'permission-denied';

      if (isPermissionDenied) {
        // Double-check via getDocFromServer to verify if it's held by another active device
        try {
          const verifySnap = await getDocFromServer(sessionDocRef);
          if (verifySnap.exists()) {
            const data = verifySnap.data() as SessionDocument;
            // ONLY assign DISPLACED when we have definitive server proof that another device holds an active session
            if (data.deviceId !== this.deviceId && data.isActive === true) {
              this.status = 'DISPLACED';
              this.statusMessage =
                'Tài khoản đang có phiên hoạt động trên thiết bị khác (First-Active-Session Wins). Vui lòng đăng xuất trên thiết bị cũ hoặc đợi phiên cũ hết hạn (15 phút không hoạt động).';
              this.notify();
              return { success: false, message: this.statusMessage };
            }

            // If doc exists but data.deviceId === this.deviceId OR data.isActive === false,
            // the PERMISSION_DENIED was NOT because of another active device, but another rule condition!
            this.status = 'NO_SESSION';
            this.statusMessage =
              'Không đủ quyền truy cập hoặc vi phạm điều kiện bảo mật phiên đăng nhập (Quy tắc Firestore).';
            this.notify();
            return { success: false, message: this.statusMessage };
          } else {
            // Document does not exist: PERMISSION_DENIED on creation (e.g. invalid user, unverified personal Gmail, rule mismatch)
            // Definitely NOT displaced!
            this.status = 'NO_SESSION';
            this.statusMessage =
              'Không thể tạo phiên: Tài khoản không thỏa mãn điều kiện bảo mật (Chỉ chấp nhận Gmail cá nhân đã xác minh).';
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
              'Cơ sở dữ liệu Firestore chưa được khởi tạo trên Firebase Console. Vui lòng tạo Firestore Database để kích hoạt phiên chơi.';
            this.notify();
            return { success: false, message: this.statusMessage };
          }

          // Could not read server doc due to network/unavailable
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
          'Không thể kết nối đến máy chủ để xác thực phiên. Vui lòng kiểm tra kết nối mạng.';
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

    // Multi-tab check before dispatching network request
    const elapsedSinceLastAnchor = performance.now() - this.lastKnownServerActivePerfMs;
    if (elapsedSinceLastAnchor < SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
      const waitRemaining = SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS - elapsedSinceLastAnchor;
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
        await this.reconcileSessionFromServer();
      } else {
        // Network or connection error: pause gameplay safely without sign out
        this.status = 'CONNECTION_LOST_UNVERIFIED';
        this.statusMessage = 'Mất kết nối với máy chủ. Trận đấu đang tạm dừng để chờ xác minh lại phiên...';
        if (this.onPauseGameCallback) this.onPauseGameCallback();
        this.notify();
      }
    } finally {
      this.isHeartbeatInFlight = false;
      this.notify();
    }
  }

  /**
   * Reconciles session state directly from serverDoc. Never signs out on PERMISSION_DENIED.
   */
  public async reconcileSessionFromServer(): Promise<void> {
    if (!this.currentUid) return;

    const sessionDocRef = doc(this.db, 'user_sessions', this.currentUid);

    try {
      const snap = await getDocFromServer(sessionDocRef);

      if (!snap.exists()) {
        this.status = 'EXPIRED';
        this.statusMessage = 'Phiên đăng nhập không tồn tại hoặc đã bị xóa.';
        this.terminateSessionLocally();
        return;
      }

      const data = snap.data() as SessionDocument;

      // Definitive evidence checks
      if (data.isActive === false) {
        this.status = 'EXPIRED';
        this.statusMessage = 'Tài khoản đã đăng xuất từ một phiên làm việc khác.';
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
        this.status = 'DISPLACED';
        this.statusMessage = 'Phiên làm việc đã thay đổi. Vui lòng đăng nhập lại.';
        this.terminateSessionLocally();
        return;
      }

      // Check server anchor
      const serverMs = data.lastActiveAt.toMillis();
      if (serverMs > this.lastKnownServerActiveMs) {
        // Server actually accepted an earlier update: session is alive!
        this.setServerTimeAnchor(serverMs);
        this.status = 'ACTIVE';
        this.statusMessage = null;
        this.earlyRejectRetryCount = 0;
        this.notify();
        this.scheduleNextHeartbeat(SESSION_TIMINGS.TARGET_HEARTBEAT_MS);
        return;
      }

      // Timestamp unchanged: enter safe unclassified pause state
      this.status = 'HEARTBEAT_REJECTED_UNCLASSIFIED';
      this.statusMessage =
        'Không thể xác minh quyền gia hạn phiên. Trận đấu đang tạm dừng để bảo vệ tài khoản.';
      if (this.onPauseGameCallback) this.onPauseGameCallback();
      this.notify();
    } catch (err: any) {
      // Offline/network failure: keep safe unverified state, do NOT signOut
      this.status = 'CONNECTION_LOST_UNVERIFIED';
      this.statusMessage =
        'Mất kết nối với máy chủ. Trận đấu đang tạm dừng để chờ xác minh lại phiên...';
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
        message: 'Phiên xác thực Google đã hết hạn. Vui lòng đăng nhập lại bằng Google.',
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
      this.statusMessage = 'Phiên đăng nhập không tồn tại.';
      this.terminateSessionLocally();
      return { success: false, message: this.statusMessage };
    }

    const data = serverDoc.data() as SessionDocument;
    if (data.isActive === false || data.deviceId !== this.deviceId || data.sessionId !== this.currentSessionId) {
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
      return { success: true, message: 'Đã xác minh và gia hạn phiên thành công.' };
    }

    // Step 4b: Check 120s + buffer constraint on client monotonic clock
    const deltaClient = performance.now() - this.lastKnownServerActivePerfMs;
    if (deltaClient < SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS) {
      const waitRemainingSec = Math.ceil(
        (SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS - deltaClient) / 1000
      );
      return {
        success: false,
        message: `Chưa đủ thời gian gia hạn an toàn (120 giây). Vui lòng thử lại sau ${waitRemainingSec} giây.`,
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
        'Yêu cầu gia hạn phiên chưa được máy chủ chấp thuận. Trận đấu đang tạm dừng để bảo vệ tài khoản.';
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
    this.status = 'PAUSED_IDLE';
    this.statusMessage =
      'Phiên đăng nhập đã hết hạn sau 15 phút không hoạt động. Vui lòng đăng nhập lại.';
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
    this.terminateSessionLocally();
  }

  private terminateSessionLocally(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.currentSessionId = null;
    this.currentUid = null;
    this.notify();
    this.authManager.signOut();
  }
}
