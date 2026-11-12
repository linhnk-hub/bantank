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
  setPersistence,
  browserLocalPersistence,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig.ts';
import { ScoreManager } from './scoreManager.ts';
import {
  RBAC_PERMISSION_MATRIX,
  hasRolePermission,
  getPermissionsForRole,
  validateRoleAssignmentChange,
  recordRoleChangeAudit,
  getRoleChangeAuditLogs,
  clearRoleChangeAuditLogsForTesting,
  type PermissionId,
  type PermissionMatrixRow,
  type RoleChangeAuditEntry,
} from './rbacMatrix.ts';

export {
  RBAC_PERMISSION_MATRIX,
  hasRolePermission,
  getPermissionsForRole,
  validateRoleAssignmentChange,
  recordRoleChangeAudit,
  getRoleChangeAuditLogs,
  clearRoleChangeAuditLogsForTesting,
  type PermissionId,
  type PermissionMatrixRow,
  type RoleChangeAuditEntry,
};

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
  hasCustomNickname?: boolean;
  nicknameNote?: string | null;
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
  totalCount?: number;
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
    totalCount?: number;
  }>;
  upsertRecord?(record: Partial<UserAccountSummary> & { uid: string }): UserAccountSummary;
  updateRole?(uid: string, newRole: UserRoleType): boolean;
  getAllRecords?(): UserAccountSummary[];
}

/**
 * Chuẩn hóa và hợp nhất hồ sơ tài khoản khi người dùng đăng nhập (Upsert an toàn theo UID - M7.3.11 Mục II.1):
 * - Mỗi tài khoản Google đăng nhập có đúng 1 hồ sơ theo `uid`, không tạo trùng theo `email`.
 * - Cập nhật `lastLoginAtMs` mới nhất.
 * - Tuyệt đối KHÔNG ghi đè `displayName` (Nickname đã đặt), `avatarType`/`avatarId` tùy chỉnh, `role` (Admin/Mod)
 *   hoặc `status` đã có của tài khoản.
 * - Chuẩn hóa các trường còn thiếu cho hồ sơ cũ (`createdAtMs`, `lastLoginAtMs`, `avatarType`, `role`).
 */
export function mergeUpsertUserAccountRecord(
  existing: Partial<UserAccountSummary> | null | undefined,
  incomingLogin: {
    uid: string;
    email?: string | null;
    googleDisplayName?: string | null;
    loginTimestampMs?: number;
    status?: 'ACTIVE' | 'OFFLINE';
  }
): UserAccountSummary {
  const nowMs =
    typeof incomingLogin.loginTimestampMs === 'number' && incomingLogin.loginTimestampMs > 0
      ? Math.floor(incomingLogin.loginTimestampMs)
      : Date.now();
  const uid = incomingLogin.uid.trim();
  const email = (incomingLogin.email || existing?.email || '').trim().toLowerCase();

  // Giữ nguyên Nickname đã thiết lập; nếu chưa có thì ưu tiên Google displayName
  const existingCustomName =
    existing?.hasCustomNickname !== false &&
    typeof existing?.displayName === 'string' &&
    existing.displayName.trim().length > 0
      ? existing.displayName.trim()
      : '';
  const googleName =
    typeof incomingLogin.googleDisplayName === 'string' &&
    incomingLogin.googleDisplayName.trim().length > 0
      ? incomingLogin.googleDisplayName.trim()
      : '';

  const effectiveCustomOrGoogleName = existingCustomName || googleName;
  const hasCustomNickname = effectiveCustomOrGoogleName.length > 0;

  // Giữ nguyên avatar tùy chỉnh đã thiết lập
  const avatarType = existing?.avatarType === 'catalog' ? 'catalog' : 'google';
  const avatarId =
    avatarType === 'catalog' && typeof existing?.avatarId === 'string'
      ? existing.avatarId
      : null;

  // Giữ nguyên quyền Admin/Mod đã được cấp
  const preservedRole = resolveUserRole({
    uid,
    email,
    serverRole: existing?.role ?? null,
  });

  const createdAtMs =
    typeof existing?.createdAtMs === 'number' && existing.createdAtMs > 0
      ? existing.createdAtMs
      : nowMs;
  const lastLoginAtMs = Math.max(
    nowMs,
    typeof existing?.lastLoginAtMs === 'number' ? existing.lastLoginAtMs : 0
  );

  return sanitizeUserAccountSummary({
    uid,
    email,
    displayName: hasCustomNickname ? effectiveCustomOrGoogleName : '',
    hasCustomNickname,
    role: preservedRole,
    avatarType,
    avatarId,
    lastLoginAtMs,
    createdAtMs,
    status: incomingLogin.status || existing?.status || 'ACTIVE',
  });
}

/**
 * Bộ điều hợp phân trang trên bộ nhớ (dùng cho kiểm thử tự động M7.3.9 & M7.3.11)
 * Bảo đảm:
 * - Không tạo trùng theo UID hoặc Email.
 * - Không loại bỏ các hồ sơ thiếu trường `lastLoginAtMs`, `createdAtMs` hoặc `displayName`.
 * - Phân trang 10 tài khoản/trang chính xác, chuyển trang Trước/Sau không lặp và không bỏ sót.
 */
export class InMemoryUserAccountsPaginationAdapter implements UserAccountsPaginationAdapter {
  private recordsByUid: Map<string, UserAccountSummary> = new Map();

  constructor(records: Array<Partial<UserAccountSummary> & { uid: string }>) {
    for (const raw of records) {
      if (!raw || !raw.uid) continue;
      const sanitized = sanitizeUserAccountSummary(raw);
      this.recordsByUid.set(sanitized.uid, sanitized);
    }
  }

  private getSortedRecords(): UserAccountSummary[] {
    return Array.from(this.recordsByUid.values()).sort((a, b) => {
      if (b.lastLoginAtMs !== a.lastLoginAtMs) {
        return b.lastLoginAtMs - a.lastLoginAtMs;
      }
      return a.uid.localeCompare(b.uid);
    });
  }

  public upsertRecord(
    record: Partial<UserAccountSummary> & { uid: string }
  ): UserAccountSummary {
    const existing = this.recordsByUid.get(record.uid);
    const merged = mergeUpsertUserAccountRecord(existing, {
      uid: record.uid,
      email: record.email ?? existing?.email,
      googleDisplayName: record.displayName ?? existing?.displayName,
      loginTimestampMs: record.lastLoginAtMs ?? existing?.lastLoginAtMs ?? Date.now(),
      status: record.status ?? existing?.status ?? 'ACTIVE',
    });
    if (record.role) {
      merged.role = resolveUserRole({
        uid: merged.uid,
        email: merged.email,
        serverRole: record.role,
      });
    }
    if (record.avatarType === 'catalog' && record.avatarId) {
      merged.avatarType = 'catalog';
      merged.avatarId = record.avatarId;
    }
    this.recordsByUid.set(merged.uid, merged);
    return merged;
  }

  public updateRole(uid: string, newRole: UserRoleType): boolean {
    const existing = this.recordsByUid.get(uid);
    if (!existing) return false;
    existing.role = resolveUserRole({
      uid: existing.uid,
      email: existing.email,
      serverRole: newRole,
    });
    this.recordsByUid.set(uid, sanitizeUserAccountSummary(existing));
    return true;
  }

  public getAllRecords(): UserAccountSummary[] {
    return this.getSortedRecords();
  }

  public queryPageSync(
    pageSize: number = USER_ACCOUNTS_PAGE_SIZE,
    cursor: unknown | null = null
  ): {
    accounts: UserAccountSummary[];
    items: UserAccountSummary[];
    hasNextPage: boolean;
    nextCursor: unknown | null;
    totalCount: number;
  } {
    const sortedRecords = this.getSortedRecords();
    const safePageSize = Math.max(
      1,
      Math.min(USER_ACCOUNTS_PAGE_SIZE, Math.floor(pageSize || USER_ACCOUNTS_PAGE_SIZE))
    );
    let startIndex = 0;
    if (typeof cursor === 'string' && cursor.length > 0) {
      const idx = sortedRecords.findIndex((r) => r.uid === cursor);
      if (idx >= 0) {
        startIndex = idx + 1;
      }
    }
    const slice = sortedRecords.slice(startIndex, startIndex + safePageSize + 1);
    const hasNextPage = slice.length > safePageSize;
    const items = slice.slice(0, safePageSize).map((item) => sanitizeUserAccountSummary(item));
    const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1].uid : null;
    return {
      accounts: items,
      items,
      hasNextPage,
      nextCursor,
      totalCount: sortedRecords.length,
    };
  }

  public async fetchPage(params: {
    pageSize: number;
    cursor?: unknown | null;
  }): Promise<{
    items: UserAccountSummary[];
    hasNextPage: boolean;
    nextCursor: unknown | null;
    totalCount: number;
  }> {
    const res = this.queryPageSync(params.pageSize, params.cursor ?? null);
    return {
      items: res.items,
      hasNextPage: res.hasNextPage,
      nextCursor: res.nextCursor,
      totalCount: res.totalCount,
    };
  }
}

/**
 * Làm sạch dữ liệu tài khoản trước khi trả về UI:
 * - Tuyệt đối không bao giờ chứa password, idToken, refreshToken, accessToken hoặc thông tin xác thực nhạy cảm.
 * - Nếu chưa có Nickname: ưu tiên Google displayName; nếu vẫn không có, lấy phần tên trước dấu @ của email
 *   và đính kèm ghi chú `Chưa thiết lập Nickname`. Không bao giờ để cột tên người dùng trống.
 */
export function sanitizeUserAccountSummary(
  rawInput: Partial<UserAccountSummary> | Record<string, unknown>
): UserAccountSummary {
  const raw = rawInput as Record<string, unknown>;
  const uid = typeof raw.uid === 'string' && raw.uid.trim().length > 0 ? raw.uid.trim() : 'unknown';
  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
  const explicitName =
    typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
      ? raw.displayName.trim()
      : '';
  const hasCustomNickname =
    typeof raw.hasCustomNickname === 'boolean'
      ? raw.hasCustomNickname && explicitName.length > 0
      : explicitName.length > 0;
  const displayName =
    explicitName.length > 0
      ? explicitName
      : getUserDisplayLabel({ displayName: null, email });
  const nicknameNote = hasCustomNickname ? null : 'Chưa thiết lập Nickname';

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
    hasCustomNickname,
    nicknameNote,
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
export type UserRole = UserRoleType;

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
  private authReadyListeners: Set<(ready: boolean) => void> = new Set();
  private auth = getFirebaseAuth();
  private authReady: boolean = false;
  private trialModeActive: boolean = false;
  private customPaginationAdapter: UserAccountsPaginationAdapter | null = null;

  private constructor() {
    onAuthStateChanged(this.auth, (user) => {
      this.authReady = true;
      if (user) {
        this.trialModeActive = false;
        this.applyStoredProfileOverride(user);
        // M7.3.11 Mục II.1 & II.4: Tự động bổ sung/cập nhật hồ sơ cho tài khoản cũ khi khôi phục phiên hoặc đăng nhập lại
        void this.recordUserLoginTimestamp(user);
      }
      this.currentUser = user;
      this.notifyAuthReadyListeners();
      this.notifyListeners(user);
    });
  }

  public static getInstance(): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    return AuthManager.instance;
  }

  public isAuthReady(): boolean {
    return this.authReady || Boolean(this.auth.currentUser) || Boolean(this.currentUser);
  }

  public subscribeAuthReady(listener: (ready: boolean) => void): () => void {
    this.authReadyListeners.add(listener);
    listener(this.isAuthReady());
    return () => {
      this.authReadyListeners.delete(listener);
    };
  }

  private notifyAuthReadyListeners(): void {
    const ready = this.isAuthReady();
    this.authReadyListeners.forEach((fn) => {
      try {
        fn(ready);
      } catch {
        // ignore
      }
    });
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

  public getCustomPaginationAdapterForTesting(): UserAccountsPaginationAdapter | null {
    return this.customPaginationAdapter;
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
   * M7.3.11 Mục II.1 & II.4: Upsert hồ sơ người dùng `/users/{uid}` an toàn khi đăng nhập Google thành công
   * hoặc khi tài khoản cũ đăng nhập lại:
   * - Định danh theo `uid`, không tạo trùng theo `email`.
   * - Cập nhật `lastLoginAt` nhưng KHÔNG GHI ĐÈ Nickname (`displayName`), `avatarType`/`avatarId`, `role` hoặc `status` đã có.
   * - Tương thích 100% với cả Production Firestore Rules hiện tại (tách bước khởi tạo `avatarType` và cập nhật `displayName`)
   *   lẫn Rules mở rộng có `email` và `lastLoginAt`.
   */
  public async recordUserLoginTimestamp(user?: User | null): Promise<void> {
    if (this.trialModeActive) return;
    const targetUser = user ?? this.getCurrentUser();
    if (!targetUser) return;
    const validation = validatePersonalGmailUser(targetUser);
    if (!validation.isValid) return;

    if (this.customPaginationAdapter?.upsertRecord) {
      this.customPaginationAdapter.upsertRecord({
        uid: targetUser.uid,
        email: (targetUser.email || '').trim().toLowerCase(),
        displayName: targetUser.displayName || undefined,
        lastLoginAtMs: Date.now(),
        status: 'ACTIVE',
      });
    }

    try {
      const db = getFirebaseDb();
      const userRef = doc(db, 'users', targetUser.uid);
      const snap = await getDoc(userRef);
      const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

      // Đồng bộ role đã xác minh từ /admins/{uid} nếu có
      try {
        const adminSnap = await getDoc(doc(db, 'admins', targetUser.uid));
        if (adminSnap.exists()) {
          const aData = adminSnap.data() as Record<string, unknown>;
          setVerifiedServerRoleForUid(targetUser.uid, aData.role || 'ADMIN');
        } else if (typeof existing?.role === 'string') {
          setVerifiedServerRoleForUid(targetUser.uid, existing.role);
        }
      } catch {
        // ignore
      }

      const avatarType = existing?.avatarType === 'catalog' ? 'catalog' : 'google';
      const avatarId =
        avatarType === 'catalog' && typeof existing?.avatarId === 'string' ? existing.avatarId : null;
      const existingCustomDisplayName =
        typeof existing?.displayName === 'string' && existing.displayName.trim().length > 0
          ? existing.displayName.trim()
          : '';
      const googleDisplayName =
        typeof targetUser.displayName === 'string' && targetUser.displayName.trim().length > 0
          ? targetUser.displayName.trim().slice(0, 40)
          : '';
      const targetDisplayName = existingCustomDisplayName || googleDisplayName;

      // Bước 1: Thử ghi đầy đủ với lastLoginAt & email (nếu Rules mới đã được Publish)
      const fullPayload: Record<string, unknown> = {
        uid: targetUser.uid,
        email: (targetUser.email || '').trim().toLowerCase(),
        avatarType,
        avatarId,
        avatarUpdatedAt: existing?.avatarUpdatedAt ?? serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      if (targetDisplayName) {
        fullPayload.displayName = targetDisplayName.slice(0, 40);
      }

      await setDoc(userRef, fullPayload, { merge: true }).catch(async () => {
        // Bước 2 (Tương thích 100% với Production Firestore Rules hiện tại):
        // Production Rules yêu cầu:
        // - Khi create: chỉ chứa ['uid', 'avatarType', 'avatarId', 'avatarUpdatedAt'] HOẶC ['uid', 'displayName']
        // - Khi update: chỉ sửa ['avatarType', 'avatarId', 'avatarUpdatedAt'] HOẶC chỉ sửa ['displayName']
        if (!existing) {
          // Tài khoản chưa có hồ sơ /users/{uid} -> Khởi tạo bằng nhánh Avatar chuẩn
          await setDoc(userRef, {
            uid: targetUser.uid,
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAt: serverTimestamp(),
          }).catch(() => {});

          // Sau khi tạo hồ sơ, nếu có tên hiển thị Google thì cập nhật tiếp nhánh displayName (1..40 ký tự)
          if (targetDisplayName) {
            await updateDoc(userRef, {
              displayName: targetDisplayName.slice(0, 40),
            }).catch(() => {});
          }
        } else {
          // Tài khoản đã có hồ sơ /users/{uid}:
          // - Nếu hồ sơ cũ thiếu trường avatarUpdatedAt (khiến orderBy('avatarUpdatedAt') loại bỏ), bổ sung ngay!
          if (!('avatarUpdatedAt' in existing)) {
            await updateDoc(userRef, {
              avatarType,
              avatarId,
              avatarUpdatedAt: serverTimestamp(),
            }).catch(() => {});
          }
          // - Nếu hồ sơ cũ chưa có displayName nhưng Google Auth có displayName -> bổ sung mà không ghi đè Nickname cũ
          if (!existingCustomDisplayName && googleDisplayName) {
            await updateDoc(userRef, {
              displayName: googleDisplayName.slice(0, 40),
            }).catch(() => {});
          }
        }
      });
    } catch {
      // Không làm gián đoạn luồng đăng nhập nếu Firestore tạm thời không phản hồi
    }
  }

  /**
   * M7.3.11 Mục II.1 & II.2: Truy vấn và phân trang danh sách tài khoản (10 tài khoản / trang).
   * - Kiểm tra quyền theo ma trận RBAC tập trung (`VIEW_ACCOUNT_LIST` / `isSuperAdminUser`).
   * - Khắc phục triệt để lỗi thiếu tài khoản do `orderBy('avatarUpdatedAt')` loại bỏ các bản ghi thiếu trường `avatarUpdatedAt`:
   *   Hợp nhất theo `uid` từ `/users` và `/admins`, chuẩn hóa các trường còn thiếu (`lastLoginAtMs`, `displayName`,
   *   `hasCustomNickname`, `nicknameNote`, `role`, `status`), sắp xếp tất định (`lastLoginAtMs DESC, uid ASC`)
   *   và phân trang chính xác 10 tài khoản/trang bằng con trỏ `uid`.
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

    const callerRole = resolveUserRole(caller as any);
    const canViewAccounts =
      isSuperAdminUser(caller) || hasRolePermission(callerRole, 'VIEW_ACCOUNT_LIST');

    if (!canViewAccounts) {
      return {
        success: false,
        accounts: [],
        pageSize: USER_ACCOUNTS_PAGE_SIZE,
        hasNextPage: false,
        nextCursor: null,
        errorMessage:
          'Truy cập bị từ chối: Bạn không có quyền xem danh sách tài khoản.',
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
        totalCount: res.totalCount,
      };
    }

    try {
      const db = getFirebaseDb();
      const usersCol = collection(db, 'users');

      // 1. Tải toàn bộ danh sách /admins/{uid} (nếu người gọi có quyền đọc) để biết vai trò Admin/Mod chính xác
      const adminRolesByUid = new Map<string, { role: string; email?: string; displayName?: string; updatedAtMs?: number }>();
      try {
        const adminsSnap = await getDocs(collection(db, 'admins'));
        for (const aDoc of adminsSnap.docs) {
          const aData = (aDoc.data() || {}) as Record<string, unknown>;
          const aUid = typeof aData.uid === 'string' && aData.uid.trim() ? aData.uid.trim() : aDoc.id;
          const aRole = typeof aData.role === 'string' ? aData.role.trim().toUpperCase() : 'ADMIN';
          setVerifiedServerRoleForUid(aUid, aRole);
          adminRolesByUid.set(aUid, {
            role: aRole,
            email: typeof aData.email === 'string' ? aData.email.trim().toLowerCase() : undefined,
            displayName: typeof aData.displayName === 'string' ? aData.displayName.trim() : undefined,
            updatedAtMs: parseFirestoreTimestampMs(aData.updatedAt || aData.createdAt),
          });
        }
      } catch {
        // Bỏ qua nếu không đọc được collection /admins
      }

      // 2. Truy vấn collection(db, 'users') KHÔNG dùng orderBy('avatarUpdatedAt') làm điều kiện lọc cứng
      //    để các tài khoản thiếu trường `avatarUpdatedAt` hoặc `lastLoginAt` KHÔNG BAO GIỜ bị Firestore loại bỏ!
      const snap = await getDocs(usersCol);
      const rawDocsByUid = new Map<string, Record<string, unknown>>();

      for (const d of snap.docs) {
        const data = (d.data() || {}) as Record<string, unknown>;
        const uid = typeof data.uid === 'string' && data.uid.trim() ? data.uid.trim() : d.id;
        rawDocsByUid.set(uid, { ...data, uid });
      }

      // Hợp nhất thêm những tài khoản có trong /admins nhưng chưa có doc trong /users (nếu có)
      for (const [aUid, aInfo] of adminRolesByUid.entries()) {
        if (!rawDocsByUid.has(aUid)) {
          rawDocsByUid.set(aUid, {
            uid: aUid,
            email: aInfo.email || '',
            displayName: aInfo.displayName || '',
            role: aInfo.role,
            lastLoginAt: aInfo.updatedAtMs || 0,
          });
        }
      }

      // Luôn bảo đảm tài khoản Super Admin / người gọi hiện tại có mặt trong danh sách nếu đã đăng nhập hợp lệ
      if (caller && caller.uid && !rawDocsByUid.has(caller.uid)) {
        rawDocsByUid.set(caller.uid, {
          uid: caller.uid,
          email: (caller.email || SUPER_ADMIN_EMAIL).trim().toLowerCase(),
          displayName: caller.displayName || '',
          role: isSuperAdminUser(caller) ? 'SUPER_ADMIN' : callerRole,
          avatarType: 'google',
          avatarId: null,
          lastLoginAt: Date.now(),
          status: 'ACTIVE',
        });
      }

      // 3. Chuẩn hóa sơ bộ danh sách để sắp xếp tất định theo (lastLoginAtMs DESC, uid ASC)
      const preliminaryList: Array<{ uid: string; data: Record<string, unknown>; sortLoginMs: number }> = [];
      for (const [uid, data] of rawDocsByUid.entries()) {
        const adminEntry = adminRolesByUid.get(uid);
        const sortLoginMs =
          parseFirestoreTimestampMs(data.lastLoginAt) ||
          parseFirestoreTimestampMs(data.avatarUpdatedAt) ||
          parseFirestoreTimestampMs(data.createdAt) ||
          adminEntry?.updatedAtMs ||
          0;
        preliminaryList.push({ uid, data, sortLoginMs });
      }

      preliminaryList.sort((a, b) => {
        if (b.sortLoginMs !== a.sortLoginMs) {
          return b.sortLoginMs - a.sortLoginMs;
        }
        return a.uid.localeCompare(b.uid);
      });

      // 4. Xác định vị trí bắt đầu theo cursor (hỗ trợ cả cursor uid string và QueryDocumentSnapshot)
      let startIndex = 0;
      const rawCursor = options?.cursor;
      const cursorUid =
        typeof rawCursor === 'string'
          ? rawCursor
          : rawCursor && typeof (rawCursor as QueryDocumentSnapshot).id === 'string'
          ? (rawCursor as QueryDocumentSnapshot).id
          : null;

      if (cursorUid) {
        const foundIdx = preliminaryList.findIndex((item) => item.uid === cursorUid);
        if (foundIdx >= 0) {
          startIndex = foundIdx + 1;
        }
      }

      const totalCount = preliminaryList.length;
      const slice = preliminaryList.slice(startIndex, startIndex + pageSize + 1);
      const hasNextPage = slice.length > pageSize;
      const pageItems = slice.slice(0, pageSize);
      const nextCursor = hasNextPage && pageItems.length > 0 ? pageItems[pageItems.length - 1].uid : null;

      // 5. Bổ sung trạng thái phiên & email từ /user_sessions/{uid} cho tối đa 10 tài khoản trong trang hiện tại
      const summaries = await Promise.all(
        pageItems.map(async ({ uid, data, sortLoginMs }) => {
          const adminEntry = adminRolesByUid.get(uid);
          let email =
            typeof data.email === 'string' && data.email.trim()
              ? data.email.trim().toLowerCase()
              : adminEntry?.email || '';
          if (!email && caller && caller.uid === uid && caller.email) {
            email = caller.email.trim().toLowerCase();
          }

          let sessionUpdatedAtMs = 0;
          let sessionStatus: 'ACTIVE' | 'OFFLINE' =
            caller && caller.uid === uid ? 'ACTIVE' : 'OFFLINE';

          try {
            const sessionSnap = await getDoc(doc(db, 'user_sessions', uid));
            if (sessionSnap.exists()) {
              const sData = sessionSnap.data() as Record<string, unknown>;
              if (!email && typeof sData.email === 'string') {
                email = sData.email.trim().toLowerCase();
              }
              sessionUpdatedAtMs = parseFirestoreTimestampMs(
                sData.lastActiveAt || sData.updatedAt || sData.loginAt || sData.createdAt
              );
              const isSessionActiveFlag =
                sData.isActive === true || sData.status === 'ACTIVE';
              const isWithin15Min =
                sessionUpdatedAtMs > 0 && Date.now() - sessionUpdatedAtMs <= 900000;
              if (isSessionActiveFlag && (isWithin15Min || sessionUpdatedAtMs === 0)) {
                sessionStatus = 'ACTIVE';
              }
            }
          } catch {
            // Bỏ qua nếu không đọc được phiên của user
          }

          let serverRole: string | null =
            typeof data.role === 'string' ? data.role : adminEntry?.role ?? null;
          if (!serverRole) {
            try {
              const adminSnap = await getDoc(doc(db, 'admins', uid));
              if (adminSnap.exists()) {
                const aData = adminSnap.data() as Record<string, unknown>;
                serverRole = typeof aData.role === 'string' ? aData.role : 'ADMIN';
              }
            } catch {
              // ignore
            }
          }

          const explicitDisplayName =
            typeof data.displayName === 'string' && data.displayName.trim().length > 0
              ? data.displayName.trim()
              : adminEntry?.displayName || '';

          const lastLoginAtMs =
            parseFirestoreTimestampMs(data.lastLoginAt) ||
            sessionUpdatedAtMs ||
            sortLoginMs ||
            0;
          const createdAtMs =
            parseFirestoreTimestampMs(data.createdAt) ||
            parseFirestoreTimestampMs(data.avatarUpdatedAt) ||
            lastLoginAtMs;

          return sanitizeUserAccountSummary({
            uid,
            email,
            displayName: explicitDisplayName,
            hasCustomNickname: explicitDisplayName.length > 0,
            role: resolveUserRole({ uid, email, serverRole }),
            avatarType: data.avatarType === 'catalog' ? 'catalog' : 'google',
            avatarId: typeof data.avatarId === 'string' ? data.avatarId : null,
            lastLoginAtMs,
            createdAtMs,
            status: sessionStatus,
          });
        })
      );

      return {
        success: true,
        accounts: summaries,
        pageSize,
        hasNextPage,
        nextCursor,
        totalCount,
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
   * M7.3.11 Mục II.3 & IV.3: Cấp hoặc thu hồi quyền Admin / Mod đồng bộ (dùng cho kiểm thử & cập nhật tức thì)
   */
  public changeUserRoleSync(params: {
    targetUid: string;
    targetEmail: string;
    targetDisplayName?: string;
    currentTargetRole?: UserRoleType;
    newRole: UserRoleType;
    overrideCallerForTesting?: ValidatedUserAccount | User | null;
  }): {
    success: boolean;
    previousRole: UserRoleType;
    newRole: UserRoleType;
    auditEntry?: RoleChangeAuditEntry;
    errorMessage?: string;
  } {
    const caller =
      'overrideCallerForTesting' in params
        ? params.overrideCallerForTesting
        : this.getCurrentUser();

    const actorRole = isSuperAdminUser(caller) ? 'SUPER_ADMIN' : resolveUserRole(caller as any);
    const actorUid = caller?.uid || '';
    const actorEmail = (caller?.email || '').trim().toLowerCase();
    const previousRole =
      params.currentTargetRole ??
      resolveUserRole({
        uid: params.targetUid,
        email: params.targetEmail,
      });

    const validation = validateRoleAssignmentChange({
      actorRole,
      actorUid,
      actorEmail,
      targetUid: params.targetUid,
      targetEmail: params.targetEmail,
      currentTargetRole: previousRole,
      newRole: params.newRole,
      superAdminEmail: SUPER_ADMIN_EMAIL,
    });

    if (!validation.allowed) {
      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage: validation.reasonVi || 'Không thể thay đổi quyền cho tài khoản này.',
      };
    }

    // Cập nhật bộ nhớ đệm role đã xác minh từ máy chủ
    setVerifiedServerRoleForUid(params.targetUid, params.newRole);

    // Cập nhật adapter phân trang trong bộ nhớ (nếu đang bật)
    if (this.customPaginationAdapter?.updateRole) {
      this.customPaginationAdapter.updateRole(params.targetUid, params.newRole);
    }

    // Ghi nhật ký kiểm toán thay đổi quyền
    const auditEntry = recordRoleChangeAudit({
      actorUid,
      actorEmail,
      targetUid: params.targetUid,
      targetEmail: (params.targetEmail || '').trim().toLowerCase(),
      targetDisplayName:
        params.targetDisplayName ||
        getUserDisplayLabel({ displayName: null, email: params.targetEmail }),
      previousRole,
      newRole: params.newRole,
      timestampMs: Date.now(),
    });

    return {
      success: true,
      previousRole,
      newRole: params.newRole,
      auditEntry,
    };
  }

  /**
   * M7.3.11 Mục II.3 & IV.3: Cấp quyền Admin, Cấp quyền Mod hoặc Thu hồi về Người chơi (`PLAYER`)
   * và đồng bộ trực tiếp lên Firestore `/admins/{targetUid}` (được bảo vệ bởi `allow write: if isSuperAdmin()`).
   */
  public async changeUserRole(params: {
    targetUid: string;
    targetEmail: string;
    targetDisplayName?: string;
    currentTargetRole?: UserRoleType;
    newRole: UserRoleType;
    overrideCallerForTesting?: ValidatedUserAccount | User | null;
  }): Promise<{
    success: boolean;
    previousRole: UserRoleType;
    newRole: UserRoleType;
    auditEntry?: RoleChangeAuditEntry;
    errorMessage?: string;
  }> {
    const syncRes = this.changeUserRoleSync(params);
    if (!syncRes.success) {
      return syncRes;
    }

    if (!this.customPaginationAdapter) {
      try {
        const db = getFirebaseDb();
        const adminRef = doc(db, 'admins', params.targetUid);
        if (params.newRole === 'ADMIN' || params.newRole === 'MOD') {
          await setDoc(
            adminRef,
            {
              uid: params.targetUid,
              email: (params.targetEmail || '').trim().toLowerCase(),
              displayName:
                params.targetDisplayName ||
                getUserDisplayLabel({ displayName: null, email: params.targetEmail }),
              role: params.newRole,
              updatedBy: SUPER_ADMIN_EMAIL,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } else {
          // Đưa tài khoản trở lại vai trò Người chơi -> xóa bản ghi trong /admins/{targetUid}
          await deleteDoc(adminRef).catch(() => {});
        }
      } catch (err: any) {
        return {
          success: false,
          previousRole: syncRes.previousRole,
          newRole: syncRes.previousRole,
          errorMessage:
            err?.message || 'Không thể lưu thay đổi phân quyền lên Firestore. Vui lòng thử lại.',
        };
      }
    }

    return syncRes;
  }

  /**
   * Signs in using GoogleAuthProvider popup.
   * Enforces browserLocalPersistence and strict personal Gmail validation; immediately signs out if invalid.
   */
  public async signInWithGoogle(): Promise<AuthValidationResult> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      this.trialModeActive = false;
      if (typeof window !== 'undefined') {
        await setPersistence(this.auth, browserLocalPersistence).catch(() => {
          // Ignore if persistence unsupported in headless environment
        });
      }
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
