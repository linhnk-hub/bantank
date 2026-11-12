/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  getIdToken,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig.ts';
import { ScoreManager } from './scoreManager.ts';

export interface AuthValidationResult {
  isValid: boolean;
  user: User | null;
  errorMessage: string | null;
}

export type AuthStateListener = (user: User | null) => void;

/**
 * Địa chỉ email Super Admin chính thức và duy nhất của hệ thống Bắn Tank Online.
 */
export const SUPER_ADMIN_EMAIL = 'linhnk.online@gmail.com';

export const USER_ACCOUNTS_PAGE_SIZE = 10;

export interface UserAccountSummary {
  uid: string;
  email: string;
  displayName: string;
  role: UserRoleType;
  avatarType: 'google' | 'catalog';
  avatarId: string | null;
  lastLoginAtMs: number;
  createdAtMs: number;
  status: 'ACTIVE' | 'OFFLINE';
}

export interface PaginatedUserAccountsResult {
  success: boolean;
  accounts: UserAccountSummary[];
  pageSize: number;
  hasNextPage: boolean;
  nextCursor: unknown | null;
  errorMessage?: string;
}

export interface UserAccountsPaginationAdapter {
  fetchPage(params: {
    pageSize: number;
    cursor?: unknown | null;
  }): Promise<{
    items: UserAccountSummary[];
    hasNextPage: boolean;
    nextCursor: unknown | null;
  }>;
}

/**
 * Bộ điều hợp phân trang trên bộ nhớ (dùng cho kiểm thử tự động M7.3.9) mô phỏng chính xác
 * truy vấn `orderBy('lastLoginAtMs', 'desc') + limit(pageSize) + startAfter(cursor)`.
 */
export class InMemoryUserAccountsPaginationAdapter implements UserAccountsPaginationAdapter {
  private readonly sortedRecords: UserAccountSummary[];

  constructor(records: UserAccountSummary[]) {
    this.sortedRecords = [...records].sort((a, b) => {
      if (b.lastLoginAtMs !== a.lastLoginAtMs) {
        return b.lastLoginAtMs - a.lastLoginAtMs;
      }
      return a.uid.localeCompare(b.uid);
    });
  }

  public queryPageSync(
    pageSize: number = USER_ACCOUNTS_PAGE_SIZE,
    cursor: unknown | null = null
  ): {
    accounts: UserAccountSummary[];
    items: UserAccountSummary[];
    hasNextPage: boolean;
    nextCursor: unknown | null;
  } {
    const safePageSize = Math.max(
      1,
      Math.min(USER_ACCOUNTS_PAGE_SIZE, Math.floor(pageSize || USER_ACCOUNTS_PAGE_SIZE))
    );
    let startIndex = 0;
    if (typeof cursor === 'string' && cursor.length > 0) {
      const idx = this.sortedRecords.findIndex((r) => r.uid === cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }
    const slice = this.sortedRecords.slice(startIndex, startIndex + safePageSize + 1);
    const hasNextPage = slice.length > safePageSize;
    const items = slice.slice(0, safePageSize).map((item) => sanitizeUserAccountSummary(item));
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1].uid : null;
    return {
      accounts: items,
      items,
      hasNextPage,
      nextCursor,
    };
  }

  public async fetchPage(params: {
    pageSize: number;
    cursor?: unknown | null;
  }): Promise<{
    items: UserAccountSummary[];
    hasNextPage: boolean;
    nextCursor: unknown | null;
  }> {
    const res = this.queryPageSync(params.pageSize, params.cursor ?? null);
    return {
      items: res.items,
      hasNextPage: res.hasNextPage,
      nextCursor: res.nextCursor,
    };
  }
}

/**
 * Làm sạch dữ liệu tài khoản trước khi trả về UI:
 * Tuyệt đối không bao giờ chứa password, idToken, refreshToken, accessToken hoặc thông tin xác thực nhạy cảm.
 */
export function sanitizeUserAccountSummary(
  rawInput: Partial<UserAccountSummary> | Record<string, unknown>
): UserAccountSummary {
  const raw = rawInput as Record<string, unknown>;
  const uid = typeof raw.uid === 'string' && raw.uid.trim().length > 0 ? raw.uid.trim() : 'unknown';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName.trim()
      : getUserDisplayLabel({ displayName: null, email });
  const role = resolveUserRole({
    uid,
    email,
    serverRole: typeof raw.role === 'string' ? raw.role : null,
  });
  const avatarType = raw.avatarType === 'catalog' ? 'catalog' : 'google';
  const avatarId = typeof raw.avatarId === 'string' && raw.avatarId.trim().length > 0 ? raw.avatarId.trim() : null;
  const lastLoginAtMs =
    typeof raw.lastLoginAtMs === 'number' && Number.isFinite(raw.lastLoginAtMs) && raw.lastLoginAtMs > 0
      ? Math.floor(raw.lastLoginAtMs)
      : 0;
  const createdAtMs =
    typeof raw.createdAtMs === 'number' && Number.isFinite(raw.createdAtMs) && raw.createdAtMs > 0
      ? Math.floor(raw.createdAtMs)
      : lastLoginAtMs;
  const status = raw.status === 'ACTIVE' ? 'ACTIVE' : 'OFFLINE';

  return {
    uid,
    email,
    displayName,
    role,
    avatarType,
    avatarId,
    lastLoginAtMs,
    createdAtMs,
    status,
  };
}

export interface ValidatedUserAccount {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName?: string | null;
  photoURL?: string | null;
  providerData?: Array<{ providerId: string }>;
  providerIds?: string[];
}

/**
 * Kiểm tra xem người dùng Firebase hiện tại có phải là Super Admin hợp lệ hay không.
 * Bắt buộc:
 * 1. Đã xác thực Google hợp lệ (validatePersonalGmailUser(user).isValid === true)
 * 2. Email khớp chính xác với SUPER_ADMIN_EMAIL ('linhnk.online@gmail.com')
 */
export function isSuperAdminUser(user: User | ValidatedUserAccount | null | undefined): boolean {
  if (!user) return false;
  const validation = validatePersonalGmailUser(user as User);
  if (!validation.isValid) return false;
  return (user.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export type UserRoleType = 'SUPER_ADMIN' | 'ADMIN' | 'MOD' | 'PLAYER';

// Bộ nhớ đệm vai trò xác thực từ tài liệu máy chủ (Firestore /users/{uid} hoặc /admins/{uid}),
// tuyệt đối KHÔNG đọc từ localStorage để chống giả mạo quyền phía client.
const verifiedServerRolesByUid: Map<string, UserRoleType> = new Map();

export function setVerifiedServerRoleForUid(uid: string, role: unknown): void {
  if (!uid || typeof uid !== 'string') return;
  const upper = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if (upper === 'SUPER_ADMIN' || upper === 'ADMIN' || upper === 'MOD' || upper === 'PLAYER') {
    verifiedServerRolesByUid.set(uid, upper as UserRoleType);
  }
}

export function clearVerifiedServerRoles(): void {
  verifiedServerRolesByUid.clear();
}

/**
 * Xác định vai trò hợp lệ của người chơi từ dữ liệu xác thực đáng tin cậy:
 * - Nếu là Super Admin duy nhất (`linhnk.online@gmail.com` đã xác minh Google): luôn là `SUPER_ADMIN`.
 * - Nếu có vai trò đã được máy chủ xác nhận (`ADMIN`, `MOD`) hoặc truyền từ metadata phòng/hồ sơ hợp lệ: trả về vai trò tương ứng.
 * - Mặc định: `PLAYER` (Người chơi thường).
 * Tuyệt đối không đọc từ `localStorage` hoặc biến trạng thái giả lập phía client.
 */
export function resolveUserRole(
  user?: {
    uid?: string | null;
    email?: string | null;
    emailVerified?: boolean;
    providerData?: Array<{ providerId: string }>;
    providerIds?: string[];
    serverRole?: UserRoleType | string | null;
  } | null
): UserRoleType {
  if (!user) return 'PLAYER';

  const normalizedEmail = (user.email || '').trim().toLowerCase();
  if (normalizedEmail === SUPER_ADMIN_EMAIL) {
    // Nếu đối tượng có đầy đủ thông tin provider, kiểm tra chặt bằng isSuperAdminUser
    if (user.providerData || user.providerIds || user.emailVerified !== undefined) {
      if (isSuperAdminUser(user as ValidatedUserAccount)) {
        return 'SUPER_ADMIN';
      }
      return 'PLAYER';
    }
    return 'SUPER_ADMIN';
  }

  const explicitServerRole =
    typeof user.serverRole === 'string' ? user.serverRole.trim().toUpperCase() : '';
  if (explicitServerRole === 'SUPER_ADMIN') {
    // Chỉ linhnk.online@gmail.com mới được nhận SUPER_ADMIN
    return normalizedEmail === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'PLAYER';
  }
  if (explicitServerRole === 'ADMIN' || explicitServerRole === 'MOD') {
    return explicitServerRole;
  }

  if (user.uid && verifiedServerRolesByUid.has(user.uid)) {
    const cachedRole = verifiedServerRolesByUid.get(user.uid)!;
    if (cachedRole === 'SUPER_ADMIN') {
      return normalizedEmail === SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'PLAYER';
    }
    return cachedRole;
  }

  return 'PLAYER';
}

/**
 * Chuẩn hóa màu viền/khung tên người chơi tại tất cả vị trí hiển thị tên (M7.3.7 Mục III.2.2):
 * - Super Admin: khung tên màu đỏ (`border-red-500`)
 * - Admin: khung tên màu xanh lá (`border-emerald-500`)
 * - Mod: khung tên màu xanh dương (`border-sky-500`)
 * - Người chơi thường: giữ nguyên như hiện tại (`border-neutral-700/80`)
 */
export function getRoleNameFrameClasses(role: UserRoleType): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'border-2 border-red-500 ring-1 ring-red-500/40 shadow-sm shadow-red-500/20';
    case 'ADMIN':
      return 'border-2 border-emerald-500 ring-1 ring-emerald-500/40 shadow-sm shadow-emerald-500/20';
    case 'MOD':
      return 'border-2 border-sky-500 ring-1 ring-sky-500/40 shadow-sm shadow-sky-500/20';
    case 'PLAYER':
    default:
      return 'border border-neutral-700/80';
  }
}

export function getRoleDisplayInfo(role: UserRoleType): {
  role: UserRoleType;
  label: string;
  frameClass: string;
  colorNameVi: string;
} {
  switch (role) {
    case 'SUPER_ADMIN':
      return {
        role,
        label: 'Super Admin',
        frameClass: getRoleNameFrameClasses('SUPER_ADMIN'),
        colorNameVi: 'Đỏ',
      };
    case 'ADMIN':
      return {
        role,
        label: 'Admin',
        frameClass: getRoleNameFrameClasses('ADMIN'),
        colorNameVi: 'Xanh lá',
      };
    case 'MOD':
      return {
        role,
        label: 'Mod',
        frameClass: getRoleNameFrameClasses('MOD'),
        colorNameVi: 'Xanh dương',
      };
    case 'PLAYER':
    default:
      return {
        role: 'PLAYER',
        label: 'Người chơi',
        frameClass: getRoleNameFrameClasses('PLAYER'),
        colorNameVi: 'Mặc định',
      };
  }
}

/**
 * Trả về tên hiển thị của người dùng trên giao diện (Header / Banner / Lobby).
 * - Nếu người dùng có displayName hợp lệ: chỉ hiển thị displayName (không kèm email).
 * - Nếu người dùng chưa có displayName: dùng tên mặc định hợp lý (phần tên trước @ của email hoặc "Chiến Binh Tank").
 */
export function getUserDisplayLabel(
  user: { displayName?: string | null; email?: string | null } | null | undefined
): string {
  if (!user) return 'Chiến Binh Tank';
  const trimmedName = (user.displayName || '').trim();
  if (trimmedName.length > 0) {
    return trimmedName;
  }
  const email = (user.email || '').trim();
  if (email.includes('@')) {
    const prefix = email.split('@')[0].trim();
    if (prefix.length > 0) {
      return prefix;
    }
  }
  return 'Chiến Binh Tank';
}

/**
 * Validates whether the given Firebase user is a verified personal Gmail account.
 * Rejects Google Workspace domains, unverified emails, and non-Google providers.
 */
export function validatePersonalGmailUser(user: User | ValidatedUserAccount | null): AuthValidationResult {
  if (!user) {
    return {
      isValid: false,
      user: null,
      errorMessage: 'Chưa có thông tin người dùng đăng nhập.',
    };
  }

  // 1. Must be Google sign-in provider
  const u = user as ValidatedUserAccount;
  const isGoogleProvider = Array.isArray(u.providerData)
    ? u.providerData.some((p) => p.providerId === 'google.com')
    : Array.isArray(u.providerIds)
    ? u.providerIds.includes('google.com')
    : false;
  if (!isGoogleProvider) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận đăng nhập qua tài khoản Google.',
    };
  }

  // 2. Email must be verified
  if (!user.emailVerified) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận tài khoản Gmail cá nhân đã xác minh (@gmail.com).',
    };
  }

  // 3. Email must end strictly with @gmail.com or @googlemail.com
  const email = (user.email || '').trim().toLowerCase();
  const gmailRegex = /^[a-zA-Z0-9._%+-]+@(gmail|googlemail)\.com$/;
  if (!gmailRegex.test(email)) {
    return {
      isValid: false,
      user: user as User,
      errorMessage: 'Chỉ chấp nhận tài khoản Gmail cá nhân đã xác minh (@gmail.com).',
    };
  }

  return {
    isValid: true,
    user: user as User,
    errorMessage: null,
  };
}

export type TokenRefreshResult =
  | { status: 'SUCCESS'; token: string }
  | { status: 'NETWORK_ERROR'; error: Error }
  | { status: 'AUTH_INVALID'; error: Error }
  | { status: 'UNCLASSIFIED'; error: Error };

function parseFirestoreTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return Math.floor(val);
  }
  if (val && typeof val === 'object') {
    const maybeTs = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      try {
        return Math.floor(maybeTs.toMillis());
      } catch {
        // ignore
      }
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return Math.floor(maybeTs.seconds * 1000);
    }
  }
  return 0;
}

export class AuthManager {
  private static instance: AuthManager;
  private currentUser: User | null = null;
  private listeners: Set<AuthStateListener> = new Set();
  private auth = getFirebaseAuth();
  private trialModeActive: boolean = false;
  private customPaginationAdapter: UserAccountsPaginationAdapter | null = null;

  private constructor() {
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.trialModeActive = false;
        this.applyStoredProfileOverride(user);
      }
      this.currentUser = user;
      this.notifyListeners(user);
    });
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  /**
   * M7.3.9: Quản lý trạng thái Chơi thử (Trial Mode) không cần đăng nhập Google.
   * Không tạo tài khoản tạm/ẩn danh, không ghi bất kỳ dữ liệu nào lên Firebase hay localStorage.
   */
  public startTrialMode(): void {
    this.trialModeActive = true;
    ScoreManager.setGlobalTrialMode(true);
  }

  public exitTrialMode(): void {
    this.trialModeActive = false;
    ScoreManager.setGlobalTrialMode(false);
  }

  public isTrialMode(): boolean {
    return this.trialModeActive && !this.getCurrentUser();
  }

  public setCustomPaginationAdapterForTesting(adapter: UserAccountsPaginationAdapter | null): void {
    this.customPaginationAdapter = adapter;
  }

  public isSuperAdmin(): boolean {
    return isSuperAdminUser(this.getCurrentUser());
  }

  private getProfileStorageKey(user: { uid?: string; email?: string | null }): string {
    return `bantank_profile_${user.uid || user.email || 'default'}`;
  }

  private applyStoredProfileOverride(user: User): void {
    if (this.trialModeActive) return;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(this.getProfileStorageKey(user));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0) {
            (user as any).displayName = parsed.displayName.trim();
          }
          if (typeof parsed.photoURL === 'string') {
            (user as any).photoURL = parsed.photoURL.trim();
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  public subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    if (this.currentUser) {
      this.applyStoredProfileOverride(this.currentUser);
    }
    listener(this.currentUser);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(user: User | null): void {
    this.listeners.forEach((fn) => {
      try {
        fn(user);
      } catch (e) {
        console.error('[AuthManager] listener error:', e);
      }
    });
  }

  public getCurrentUser(): User | null {
    const user = this.auth.currentUser || this.currentUser;
    if (user) {
      this.applyStoredProfileOverride(user);
    }
    return user;
  }

  /**
   * M7.3.9: Ghi nhận mốc thời gian đăng nhập cuối (`lastLoginAt`) cho người dùng đã xác thực Google hợp lệ.
   * Không bao giờ thực thi trong chế độ Chơi thử (Trial Mode).
   */
  public async recordUserLoginTimestamp(user?: User | null): Promise<void> {
    if (this.trialModeActive) return;
    const targetUser = user ?? this.getCurrentUser();
    if (!targetUser) return;
    const validation = validatePersonalGmailUser(targetUser);
    if (!validation.isValid) return;

    try {
      const db = getFirebaseDb();
      const userRef = doc(db, 'users', targetUser.uid);
      const snap = await getDoc(userRef);
      const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      const avatarType = existing?.avatarType === 'catalog' ? 'catalog' : 'google';
      const avatarId =
        avatarType === 'catalog' && typeof existing?.avatarId === 'string' ? existing.avatarId : null;
      const existingDisplayName =
        typeof existing?.displayName === 'string' && existing.displayName.trim().length > 0
          ? existing.displayName.trim()
          : getUserDisplayLabel(targetUser);

      // Ghi theo schema chuẩn của /users/{uid}; bọc try/catch an toàn để tương thích cả khi Production Rules chưa cập nhật trường mới
      await setDoc(
        userRef,
        {
          uid: targetUser.uid,
          email: (targetUser.email || '').trim().toLowerCase(),
          displayName: existingDisplayName.slice(0, 64),
          avatarType,
          avatarId,
          avatarUpdatedAt: existing?.avatarUpdatedAt ?? serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(async () => {
        // Fallback tương thích ngược với Firestore Rules hiện tại nếu chỉ cho phép 5 trường
        await setDoc(
          userRef,
          {
            uid: targetUser.uid,
            displayName: existingDisplayName.slice(0, 64),
            avatarType,
            avatarId,
            avatarUpdatedAt: existing?.avatarUpdatedAt ?? serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {
          // Bỏ qua nếu offline
        });
      });
    } catch {
      // Không làm gián đoạn luồng đăng nhập nếu Firestore tạm thời không phản hồi
    }
  }

  /**
   * M7.3.9 Mục 3: Truy vấn phân trang danh sách tài khoản đã đăng nhập và tham gia trò chơi.
   * - BẮT BUỘC kiểm tra quyền Super Admin (`linhnk.online@gmail.com`) ngay ở tầng truy cập dữ liệu.
   * - Phân trang ở tầng truy vấn dữ liệu (tối đa 10 tài khoản / trang, `limit(pageSize + 1)`, `orderBy`, `startAfter`).
   * - Không tải toàn bộ danh sách người dùng về trình duyệt rồi mới cắt trang.
   * - Không bao giờ trả về mật khẩu, Firebase ID Token, refresh token hoặc dữ liệu nhạy cảm.
   */
  public async fetchPaginatedUserAccounts(options?: {
    pageSize?: number;
    cursor?: unknown | null;
    overrideCallerForTesting?: ValidatedUserAccount | User | null;
  }): Promise<PaginatedUserAccountsResult> {
    const caller =
      options && 'overrideCallerForTesting' in options
        ? options.overrideCallerForTesting
        : this.getCurrentUser();

    if (!isSuperAdminUser(caller)) {
      return {
        success: false,
        accounts: [],
        pageSize: USER_ACCOUNTS_PAGE_SIZE,
        hasNextPage: false,
        nextCursor: null,
        errorMessage: 'Truy cập bị từ chối: Chỉ Super Admin mới có quyền xem danh sách tài khoản.',
      };
    }

    const pageSize = Math.max(
      1,
      Math.min(USER_ACCOUNTS_PAGE_SIZE, Math.floor(options?.pageSize || USER_ACCOUNTS_PAGE_SIZE))
    );

    if (this.customPaginationAdapter) {
      const res = await this.customPaginationAdapter.fetchPage({
        pageSize,
        cursor: options?.cursor ?? null,
      });
      return {
        success: true,
        accounts: res.items.map((item) => sanitizeUserAccountSummary(item)),
        pageSize,
        hasNextPage: res.hasNextPage,
        nextCursor: res.nextCursor,
      };
    }

    try {
      const db = getFirebaseDb();
      const usersCol = collection(db, 'users');
      const cursorSnap = options?.cursor as QueryDocumentSnapshot | undefined;

      // Truy vấn chính sử dụng orderBy('avatarUpdatedAt', 'desc') + limit(pageSize + 1) + startAfter
      // (tương thích với mọi bản ghi /users/{uid} hiện có và bản ghi mới có lastLoginAt)
      let snap;
      try {
        const q = cursorSnap
          ? query(
              usersCol,
              orderBy('avatarUpdatedAt', 'desc'),
              startAfter(cursorSnap),
              limit(pageSize + 1)
            )
          : query(usersCol, orderBy('avatarUpdatedAt', 'desc'), limit(pageSize + 1));
        snap = await getDocs(q);
      } catch {
        const fallbackQ = cursorSnap
          ? query(usersCol, startAfter(cursorSnap), limit(pageSize + 1))
          : query(usersCol, limit(pageSize + 1));
        snap = await getDocs(fallbackQ);
      }

      const docs = snap.docs;
      const hasNextPage = docs.length > pageSize;
      const pageDocs = docs.slice(0, pageSize);
      const nextCursor = hasNextPage && pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

      // Bổ sung thông tin email / trạng thái phiên từ /user_sessions/{uid} cho từng tài khoản trong trang (tối đa 10 doc)
      const summaries = await Promise.all(
        pageDocs.map(async (d) => {
          const data = (d.data() || {}) as Record<string, unknown>;
          const uid = typeof data.uid === 'string' && data.uid.trim() ? data.uid.trim() : d.id;
          let email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
          let sessionUpdatedAtMs = 0;
          let sessionStatus: 'ACTIVE' | 'OFFLINE' = 'OFFLINE';

          try {
            const sessionSnap = await getDoc(doc(db, 'user_sessions', uid));
            if (sessionSnap.exists()) {
              const sData = sessionSnap.data() as Record<string, unknown>;
              if (!email && typeof sData.email === 'string') {
                email = sData.email.trim().toLowerCase();
              }
              sessionUpdatedAtMs = parseFirestoreTimestampMs(sData.updatedAt || sData.createdAt);
              if (sData.status === 'ACTIVE') {
                sessionStatus = 'ACTIVE';
              }
            }
          } catch {
            // Bỏ qua nếu không đọc được phiên của user
          }

          let serverRole: string | null = typeof data.role === 'string' ? data.role : null;
          if (!serverRole) {
            try {
              const adminSnap = await getDoc(doc(db, 'admins', uid));
              if (adminSnap.exists()) {
                const aData = adminSnap.data() as Record<string, unknown>;
                if (typeof aData.role === 'string') {
                  serverRole = aData.role;
                } else {
                  serverRole = 'ADMIN';
                }
              }
            } catch {
              // ignore
            }
          }

          const lastLoginAtMs =
            parseFirestoreTimestampMs(data.lastLoginAt) ||
            sessionUpdatedAtMs ||
            parseFirestoreTimestampMs(data.avatarUpdatedAt) ||
            0;
          const createdAtMs =
            parseFirestoreTimestampMs(data.createdAt) ||
            parseFirestoreTimestampMs(data.avatarUpdatedAt) ||
            lastLoginAtMs;

          return sanitizeUserAccountSummary({
            uid,
            email,
            displayName:
              typeof data.displayName === 'string' && data.displayName.trim().length > 0
                ? data.displayName.trim()
                : getUserDisplayLabel({ displayName: null, email }),
            role: resolveUserRole({ uid, email, serverRole }),
            avatarType: data.avatarType === 'catalog' ? 'catalog' : 'google',
            avatarId: typeof data.avatarId === 'string' ? data.avatarId : null,
            lastLoginAtMs,
            createdAtMs,
            status: sessionStatus,
          });
        })
      );

      // Nếu danh sách /users trống nhưng người dùng hiện tại là Super Admin đang đăng nhập, vẫn hiển thị bản ghi của Super Admin
      if (summaries.length === 0 && !cursorSnap && caller && caller.uid) {
        summaries.push(
          sanitizeUserAccountSummary({
            uid: caller.uid,
            email: caller.email || SUPER_ADMIN_EMAIL,
            displayName: getUserDisplayLabel(caller),
            role: 'SUPER_ADMIN',
            avatarType: 'google',
            avatarId: null,
            lastLoginAtMs: Date.now(),
            createdAtMs: Date.now(),
            status: 'ACTIVE',
          })
        );
      }

      return {
        success: true,
        accounts: summaries,
        pageSize,
        hasNextPage,
        nextCursor,
      };
    } catch (err: any) {
      return {
        success: false,
        accounts: [],
        pageSize,
        hasNextPage: false,
        nextCursor: null,
        errorMessage:
          err?.message || 'Không thể tải danh sách tài khoản từ Firestore. Vui lòng thử lại.',
      };
    }
  }

  /**
   * Signs in using GoogleAuthProvider popup.
   * Enforces strict personal Gmail validation; immediately signs out if invalid.
   */
  public async signInWithGoogle(): Promise<AuthValidationResult> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      this.trialModeActive = false;
      const result = await signInWithPopup(this.auth, provider);
      const validation = validatePersonalGmailUser(result.user);

      if (!validation.isValid) {
        // Disallowed account: sign out immediately
        await this.signOut();
        return {
          isValid: false,
          user: null,
          errorMessage: validation.errorMessage,
        };
      }

      this.applyStoredProfileOverride(result.user);
      this.currentUser = result.user;
      void this.recordUserLoginTimestamp(result.user);
      return validation;
    } catch (error: any) {
      return {
        isValid: false,
        user: null,
        errorMessage: error?.message || 'Đăng nhập Google thất bại.',
      };
    }
  }

  /**
   * Silent ID Token refresh using getIdToken(user, true).
   * Classifies network errors vs terminal auth invalidation without guessing.
   */
  public async refreshIdToken(): Promise<TokenRefreshResult> {
    const user = this.getCurrentUser();
    if (!user) {
      return {
        status: 'AUTH_INVALID',
        error: new Error('Không có thông tin người dùng để làm mới xác thực.'),
      };
    }

    try {
      const token = await getIdToken(user, true);
      return { status: 'SUCCESS', token };
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || String(err);

      // Network errors
      if (
        code.includes('network-request-failed') ||
        code.includes('timeout') ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        return { status: 'NETWORK_ERROR', error: err instanceof Error ? err : new Error(msg) };
      }

      // Terminal auth invalidation
      if (
        code.includes('user-disabled') ||
        code.includes('user-token-expired') ||
        code.includes('invalid-user-token') ||
        code.includes('user-not-found')
      ) {
        return { status: 'AUTH_INVALID', error: err instanceof Error ? err : new Error(msg) };
      }

      return { status: 'UNCLASSIFIED', error: err instanceof Error ? err : new Error(msg) };
    }
  }

  /**
   * Updates user profile (displayName and photoURL) via Firebase Authentication.
   * Strictly preserves email, UID, tokens, and Firestore security rules.
   */
  public async updateUserProfile(profile: { displayName?: string; photoURL?: string }): Promise<{ success: boolean; error?: string }> {
    if (this.trialModeActive) {
      return { success: false, error: 'Chế độ Chơi thử không cho phép lưu hồ sơ.' };
    }
    const user = this.getCurrentUser();
    if (!user) {
      return { success: false, error: 'Chưa đăng nhập.' };
    }
    const nextDisplayName =
      profile.displayName !== undefined ? profile.displayName.trim() : (user.displayName || '');
    const nextPhotoURL =
      profile.photoURL !== undefined ? profile.photoURL.trim() : (user.photoURL || '');

    try {
      if (typeof updateProfile === 'function' && this.auth?.currentUser) {
        await updateProfile(user, {
          displayName: nextDisplayName,
          photoURL: nextPhotoURL,
        });
      }
      (user as any).displayName = nextDisplayName;
      (user as any).photoURL = nextPhotoURL;

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            this.getProfileStorageKey(user),
            JSON.stringify({
              displayName: nextDisplayName,
              photoURL: nextPhotoURL,
            })
          );
        }
      } catch {
        // Ignore storage write errors
      }

      this.currentUser = this.auth?.currentUser || user;
      this.notifyListeners(this.currentUser);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Cập nhật hồ sơ thất bại.' };
    }
  }

  public async signOut(): Promise<void> {
    this.trialModeActive = false;
    try {
      await fbSignOut(this.auth);
    } catch (e) {
      console.warn('[AuthManager] signOut error:', e);
    }
    this.currentUser = null;
  }
}
