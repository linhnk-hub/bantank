/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
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
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebaseConfig.ts';
import { ScoreManager } from './scoreManager.ts';
import {
  RBAC_PERMISSION_MATRIX,
  SOLE_ADMIN_EMAIL,
  REVOKED_LEGACY_ADMIN_EMAIL,
  hasRolePermission,
  getPermissionsForRole,
  validateRoleAssignmentChange,
  evaluateCanonicalStaffRoleFromDocs,
  buildRoleChangeAuditEntry,
  validateRoleAuditLogPayload,
  runSimplifiedRoleMigrationForRecords,
  commitRoleChangeAuditEntry,
  recordRoleChangeAudit,
  getRoleChangeAuditLogs,
  clearRoleChangeAuditLogsForTesting,
  type PermissionId,
  type PermissionMatrixRow,
  type RoleChangeAuditEntry,
  type CanonicalStaffRoleEvaluationResult,
  type LegacyStaffRecordInput,
  type MigratedStaffRecordAction,
  type SimplifiedRoleMigrationReport,
} from './rbacMatrix.ts';

export {
  RBAC_PERMISSION_MATRIX,
  SOLE_ADMIN_EMAIL,
  REVOKED_LEGACY_ADMIN_EMAIL,
  hasRolePermission,
  getPermissionsForRole,
  validateRoleAssignmentChange,
  evaluateCanonicalStaffRoleFromDocs,
  buildRoleChangeAuditEntry,
  validateRoleAuditLogPayload,
  runSimplifiedRoleMigrationForRecords,
  commitRoleChangeAuditEntry,
  recordRoleChangeAudit,
  getRoleChangeAuditLogs,
  clearRoleChangeAuditLogsForTesting,
  type PermissionId,
  type PermissionMatrixRow,
  type RoleChangeAuditEntry,
  type CanonicalStaffRoleEvaluationResult,
  type LegacyStaffRecordInput,
  type MigratedStaffRecordAction,
  type SimplifiedRoleMigrationReport,
};

export interface AuthValidationResult {
  isValid: boolean;
  user: User | null;
  errorMessage: string | null;
}

export interface AccountPermissionDiagnostic {
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'writeBatch';
  path: string;
  errorCode: string;
  resolvedRole: UserRoleType;
  authStatus: 'AUTHENTICATED_VERIFIED_GMAIL' | 'AUTHENTICATED_UNVERIFIED' | 'UNAUTHENTICATED';
  timestampMs: number;
}

export type AuthStateListener = (user: User | null) => void;

/**
 * M7.3.11.4 Mục 1: Địa chỉ email ADMIN chính thức và duy nhất của hệ thống Bắn Tank Online.
 * Thay thế hoàn toàn email quản trị cũ `linhnk.online@gmail.com`.
 */
export const ADMIN_EMAIL = 'linhnk2013@gmail.com';
export const REVOKED_OLD_ADMIN_EMAIL = 'linhnk.online@gmail.com';

/**
 * Alias tương thích cho các module hiện hữu tham chiếu hằng số email Admin duy nhất.
 */
export const SUPER_ADMIN_EMAIL = ADMIN_EMAIL;

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

  // Giữ nguyên quyền Admin/Mod hợp lệ theo mô hình 3 vai trò
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
 * Bộ điều hợp phân trang trên bộ nhớ (dùng cho kiểm thử tự động M7.3.9, M7.3.11 & M7.3.11.4)
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
 * M7.3.11.4 Mục 1 & 2: Kiểm tra xem người dùng Firebase hiện tại có phải là tài khoản ADMIN duy nhất hợp lệ hay không.
 * Bắt buộc:
 * 1. Có UID hợp lệ
 * 2. Đã xác thực Google hợp lệ (`validatePersonalGmailUser(user).isValid === true`)
 * 3. Email khớp chính xác với `ADMIN_EMAIL` (`linhnk2013@gmail.com`) và KHÔNG phải email cũ `linhnk.online@gmail.com`.
 */
export function isAdminUser(user: User | ValidatedUserAccount | null | undefined): boolean {
  if (!user || typeof user.uid !== 'string' || user.uid.trim().length === 0) return false;
  const validation = validatePersonalGmailUser(user as User);
  if (!validation.isValid) return false;
  const normalizedEmail = (user.email || '').trim().toLowerCase();
  if (normalizedEmail === REVOKED_OLD_ADMIN_EMAIL) return false;
  if (normalizedEmail !== ADMIN_EMAIL) return false;
  if (verifiedServerRolesByUid.has(user.uid) && verifiedServerRolesByUid.get(user.uid) !== 'ADMIN') {
    return false;
  }
  return true;
}

/**
 * Alias tương thích cho các module hiện tại gọi `isSuperAdminUser`.
 * Trong mô hình 3 vai trò (M7.3.11.4), `ADMIN` (`linhnk2013@gmail.com`) kế thừa toàn bộ quyền quản trị cao nhất.
 */
export const isSuperAdminUser = isAdminUser;

/**
 * M7.3.11.4 Mục 1: Hệ thống chỉ duy trì đúng 3 vai trò: `ADMIN`, `MOD`, `PLAYER`.
 * Cấp `SUPER_ADMIN` đã bị xóa hoàn toàn.
 */
export type UserRoleType = 'ADMIN' | 'MOD' | 'PLAYER';
export type UserRole = UserRoleType;

// Bộ nhớ đệm vai trò xác thực từ tài liệu máy chủ (Firestore /admins/{uid}),
// tuyệt đối KHÔNG đọc từ localStorage hoặc /users/{uid} để chống giả mạo quyền phía client.
const verifiedServerRolesByUid: Map<string, UserRoleType> = new Map();

export function setVerifiedServerRoleForUid(uid: string, role: unknown): void {
  if (!uid || typeof uid !== 'string') return;
  const upper = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if (upper === 'ADMIN' || upper === 'MOD' || upper === 'PLAYER') {
    verifiedServerRolesByUid.set(uid, upper as UserRoleType);
  } else if (upper === 'SUPER_ADMIN') {
    // Không bao giờ lưu trữ vai trò SUPER_ADMIN đã bị xóa
    verifiedServerRolesByUid.set(uid, 'PLAYER');
  }
}

export function clearVerifiedServerRoles(): void {
  verifiedServerRolesByUid.clear();
}

/**
 * M7.3.11.4 Mục 1, 2 & 3: Xác định vai trò hợp lệ của người chơi từ dữ liệu xác thực đáng tin cậy:
 * - Email quản trị cũ `linhnk.online@gmail.com` bị thu hồi toàn bộ đặc quyền -> LUÔN trả về `PLAYER`.
 * - Nếu là Admin duy nhất (`linhnk2013@gmail.com` đã xác minh Google & UID hợp lệ): trả về `ADMIN`.
 * - Mọi tài khoản khác KHÔNG BAO GIỜ nhận được `ADMIN` (dù `serverRole` là `'ADMIN'` hay `'SUPER_ADMIN'`).
 * - Nếu tài khoản khác có vai trò `MOD` đã được máy chủ xác nhận từ `/admins/{uid}`: trả về `MOD`.
 * - Mặc định: `PLAYER` (Người chơi thường).
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

  // 1. Thu hồi tuyệt đối đặc quyền của tài khoản quản trị cũ linhnk.online@gmail.com
  if (normalizedEmail === REVOKED_OLD_ADMIN_EMAIL) {
    return 'PLAYER';
  }

  // 2. Tài khoản ADMIN duy nhất: linhnk2013@gmail.com
  if (normalizedEmail === ADMIN_EMAIL) {
    if (!user.uid || typeof user.uid !== 'string' || user.uid.trim().length === 0) {
      return 'PLAYER';
    }
    if (user.providerData || user.providerIds || user.emailVerified !== undefined) {
      if (isAdminUser(user as ValidatedUserAccount)) {
        return 'ADMIN';
      }
      return 'PLAYER';
    }
    if (verifiedServerRolesByUid.has(user.uid) && verifiedServerRolesByUid.get(user.uid) !== 'ADMIN') {
      return 'PLAYER';
    }
    return 'ADMIN';
  }

  // 3. Đối với mọi tài khoản khác: chỉ cho phép MOD hoặc PLAYER (không bao giờ cấp ADMIN hay SUPER_ADMIN)
  const explicitServerRole =
    typeof user.serverRole === 'string' ? user.serverRole.trim().toUpperCase() : '';
  if (explicitServerRole === 'MOD') {
    return 'MOD';
  }
  if (explicitServerRole === 'ADMIN' || explicitServerRole === 'SUPER_ADMIN') {
    return 'PLAYER';
  }

  if (user.uid && verifiedServerRolesByUid.has(user.uid)) {
    const cachedRole = verifiedServerRolesByUid.get(user.uid)!;
    if (cachedRole === 'MOD') {
      return 'MOD';
    }
    return 'PLAYER';
  }

  return 'PLAYER';
}

/**
 * Chuẩn hóa màu viền/khung tên người chơi theo mô hình 3 vai trò (`ADMIN`, `MOD`, `PLAYER`):
 * - Admin (`ADMIN`): khung tên nổi bật (`border-emerald-500`)
 * - Mod (`MOD`): khung tên màu xanh dương (`border-sky-500`)
 * - Người chơi thường (`PLAYER`): khung tên mặc định (`border-neutral-700/80`)
 */
export function getRoleNameFrameClasses(role: UserRoleType | string): string {
  switch (role) {
    case 'ADMIN':
      return 'border-2 border-emerald-500 ring-1 ring-emerald-500/40 shadow-sm shadow-emerald-500/20';
    case 'MOD':
      return 'border-2 border-sky-500 ring-1 ring-sky-500/40 shadow-sm shadow-sky-500/20';
    case 'PLAYER':
    default:
      return 'border border-neutral-700/80';
  }
}

export function getRoleDisplayInfo(role: UserRoleType | string): {
  role: UserRoleType;
  label: string;
  frameClass: string;
  colorNameVi: string;
} {
  switch (role) {
    case 'ADMIN':
      return {
        role: 'ADMIN',
        label: 'Admin',
        frameClass: getRoleNameFrameClasses('ADMIN'),
        colorNameVi: 'Xanh lá',
      };
    case 'MOD':
      return {
        role: 'MOD',
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
  private lastMigrationReport: SimplifiedRoleMigrationReport | null = null;
  private permissionDiagnostics: AccountPermissionDiagnostic[] = [];
  private signInInFlightPromise: Promise<AuthValidationResult> | null = null;

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

  public isAdmin(): boolean {
    return isAdminUser(this.getCurrentUser());
  }

  public isSuperAdmin(): boolean {
    return this.isAdmin();
  }

  public getLastMigrationReport(): SimplifiedRoleMigrationReport | null {
    return this.lastMigrationReport;
  }

  /**
   * M7.3.11.6 Section 2.4: Ghi nhận thông tin chẩn đoán khi xảy ra lỗi phân quyền Firestore.
   * Chỉ log operation, đường dẫn collection/document, mã lỗi, vai trò đã suy ra và trạng thái xác thực.
   * Tuyệt đối KHÔNG log token, session secret hoặc thông tin nhạy cảm.
   */
  public recordPermissionDiagnostic(
    operation: AccountPermissionDiagnostic['operation'],
    path: string,
    err: unknown,
    callerOverride?: ValidatedUserAccount | User | null
  ): AccountPermissionDiagnostic {
    const targetUser = callerOverride !== undefined ? callerOverride : this.getCurrentUser();
    const resolvedRole = isAdminUser(targetUser) ? 'ADMIN' : resolveUserRole(targetUser as any);
    const validation = validatePersonalGmailUser(targetUser);
    const authStatus: AccountPermissionDiagnostic['authStatus'] = !targetUser
      ? 'UNAUTHENTICATED'
      : validation.isValid
      ? 'AUTHENTICATED_VERIFIED_GMAIL'
      : 'AUTHENTICATED_UNVERIFIED';
    const rawCode =
      err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string'
        ? (err as any).code
        : 'permission-denied';

    const entry: AccountPermissionDiagnostic = {
      operation,
      path,
      errorCode: rawCode,
      resolvedRole,
      authStatus,
      timestampMs: Date.now(),
    };

    this.permissionDiagnostics.unshift(entry);
    if (this.permissionDiagnostics.length > 50) {
      this.permissionDiagnostics.length = 50;
    }

    const isDev =
      typeof import.meta !== 'undefined' &&
      Boolean((import.meta as any).env && (import.meta as any).env.DEV);
    if (isDev) {
      console.warn('[AuthManager][PermissionDiagnostic]', {
        operation: entry.operation,
        path: entry.path,
        errorCode: entry.errorCode,
        resolvedRole: entry.resolvedRole,
        authStatus: entry.authStatus,
      });
    }

    return entry;
  }

  public getRecentPermissionDiagnostics(): AccountPermissionDiagnostic[] {
    return [...this.permissionDiagnostics];
  }

  public clearPermissionDiagnosticsForTesting(): void {
    this.permissionDiagnostics = [];
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
   * M7.3.11.4 Mục 3 & Mục 5: Thực thi Migration vai trò sang mô hình 3 vai trò (`ADMIN`, `MOD`, `PLAYER`)
   * trên Firestore `/admins` và ghi Audit Log nguyên tử khi tài khoản Admin duy nhất (`linhnk2013@gmail.com`)
   * đã được xác minh Google Authentication & UID thực tế.
   */
  public async executeSimplifiedRoleMigration(
    overrideAdminUser?: User | ValidatedUserAccount | null
  ): Promise<SimplifiedRoleMigrationReport> {
    const candidateUser =
      overrideAdminUser !== undefined ? overrideAdminUser : this.getCurrentUser();
    const isValidSoleAdmin = isAdminUser(candidateUser);

    if (!candidateUser || !isValidSoleAdmin) {
      const halted = runSimplifiedRoleMigrationForRecords({
        verifiedNewAdminAuth: null,
        existingAdminRecords: [],
      });
      this.lastMigrationReport = halted;
      return halted;
    }

    try {
      const db = getFirebaseDb();
      const adminsSnap = await getDocs(collection(db, 'admins'));
      const existingRecords: LegacyStaffRecordInput[] = adminsSnap.docs.map((d) => {
        const data = (d.data() || {}) as Record<string, unknown>;
        return {
          uid: typeof data.uid === 'string' && data.uid.trim() ? data.uid.trim() : d.id,
          email: typeof data.email === 'string' ? data.email : null,
          displayName: typeof data.displayName === 'string' ? data.displayName : null,
          role: typeof data.role === 'string' ? data.role : null,
          isActive: typeof data.isActive === 'boolean' ? data.isActive : null,
        };
      });

      const report = runSimplifiedRoleMigrationForRecords({
        verifiedNewAdminAuth: {
          uid: candidateUser.uid,
          email: candidateUser.email,
          emailVerified: candidateUser.emailVerified,
          providerId: 'google.com',
          displayName: candidateUser.displayName,
        },
        existingAdminRecords: existingRecords,
        convertOtherLegacyAdminsToMod: true,
      });

      if (!report.success || report.isIdempotentNoOp) {
        for (const act of report.actions) {
          if (act.newRole === 'ADMIN' || act.newRole === 'MOD') {
            setVerifiedServerRoleForUid(act.uid, act.newRole);
          } else {
            setVerifiedServerRoleForUid(act.uid, 'PLAYER');
          }
        }
        this.lastMigrationReport = report;
        return report;
      }

      const batch = writeBatch(db);
      for (const act of report.actions) {
        const ref = doc(db, 'admins', act.uid);
        if (act.upsertedAdminDoc) {
          batch.set(ref, {
            ...act.upsertedAdminDoc,
            updatedAt: serverTimestamp(),
          });
          setVerifiedServerRoleForUid(act.uid, act.upsertedAdminDoc.role);
        } else {
          setVerifiedServerRoleForUid(act.uid, act.newRole);
        }
        if (act.auditEntry) {
          const auditRef = doc(db, 'role_audit_logs', act.auditEntry.auditId);
          batch.set(auditRef, {
            ...act.auditEntry,
            createdAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();
      for (const audit of report.auditLogs) {
        commitRoleChangeAuditEntry(audit);
      }
      this.lastMigrationReport = report;
      return report;
    } catch {
      const fallbackReport = runSimplifiedRoleMigrationForRecords({
        verifiedNewAdminAuth: {
          uid: candidateUser.uid,
          email: candidateUser.email,
          emailVerified: candidateUser.emailVerified,
          providerId: 'google.com',
          displayName: candidateUser.displayName,
        },
        existingAdminRecords: [],
      });
      this.lastMigrationReport = fallbackReport;
      return fallbackReport;
    }
  }

  /**
   * M7.3.11 Mục II.1 & II.4 + M7.3.11.4 Mục 3: Upsert hồ sơ người dùng `/users/{uid}` an toàn khi đăng nhập Google thành công
   * hoặc khi tài khoản cũ đăng nhập lại:
   * - Định danh theo `uid`, không tạo trùng theo `email`.
   * - Cập nhật `lastLoginAt` nhưng KHÔNG GHI ĐÈ Nickname (`displayName`), `avatarType`/`avatarId`, `role` hoặc `status` đã có.
   * - Nếu người đăng nhập là Admin duy nhất (`linhnk2013@gmail.com` đã xác minh Google & UID), tự động liên kết `/admins/{uid}` với `role: 'ADMIN'`
   *   và thực thi migration thu hồi `linhnk.online@gmail.com`.
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

      // M7.3.11.4 Mục 1, 2 & 3: Nguồn vai trò chính thức duy nhất cho ADMIN/MOD là /admins/{uid} (Fail-Closed: bắt buộc isActive === true).
      // Email cũ linhnk.online@gmail.com bị thu hồi toàn bộ quyền; chỉ linhnk2013@gmail.com mới được nhận ADMIN.
      try {
        if (isAdminUser(targetUser)) {
          setVerifiedServerRoleForUid(targetUser.uid, 'ADMIN');
          void this.executeSimplifiedRoleMigration(targetUser);
        } else {
          const adminSnap = await getDoc(doc(db, 'admins', targetUser.uid));
          const aData = adminSnap.exists() ? (adminSnap.data() as Record<string, unknown>) : null;
          const evalRole = evaluateCanonicalStaffRoleFromDocs({
            uid: targetUser.uid,
            email: targetUser.email,
            isVerifiedPersonalGmail: true,
            adminDoc: adminSnap.exists()
              ? {
                  exists: true,
                  uid: aData?.uid,
                  email: aData?.email,
                  role: aData?.role,
                  isActive: aData?.isActive,
                }
              : { exists: false },
            userDoc: existing,
            adminEmail: ADMIN_EMAIL,
          });
          setVerifiedServerRoleForUid(targetUser.uid, evalRole.resolvedRole);
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
        if (!existing) {
          await setDoc(userRef, {
            uid: targetUser.uid,
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAt: serverTimestamp(),
          }).catch(() => {});

          if (targetDisplayName) {
            await updateDoc(userRef, {
              displayName: targetDisplayName.slice(0, 40),
            }).catch(() => {});
          }
        } else {
          if (!('avatarUpdatedAt' in existing)) {
            await updateDoc(userRef, {
              avatarType,
              avatarId,
              avatarUpdatedAt: serverTimestamp(),
            }).catch(() => {});
          }
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
   * M7.3.11 Mục II.1 & II.2 + M7.3.11.4: Truy vấn và phân trang danh sách tài khoản (10 tài khoản / trang).
   * - Kiểm tra quyền theo ma trận RBAC tập trung (`VIEW_ACCOUNT_LIST` / `isAdminUser`).
   * - Hợp nhất theo `uid` từ `/users` và `/admins`, chuẩn hóa các trường còn thiếu (`lastLoginAtMs`, `displayName`,
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
      isAdminUser(caller) || hasRolePermission(callerRole, 'VIEW_ACCOUNT_LIST');

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

    const isSoleAdminCaller = isAdminUser(caller) || callerRole === 'ADMIN';

    try {
      const db = getFirebaseDb();
      const usersCol = collection(db, 'users');

      // 1. Tải toàn bộ danh sách /admins/{uid} (nguồn chính thức duy nhất cho vai trò ADMIN / MOD theo chính sách Fail-Closed)
      const adminRolesByUid = new Map<
        string,
        { role: UserRoleType; email?: string; displayName?: string; updatedAtMs?: number }
      >();
      let adminsCollectionLoaded = false;
      try {
        const adminsSnap = await getDocs(collection(db, 'admins'));
        adminsCollectionLoaded = true;
        for (const aDoc of adminsSnap.docs) {
          const aData = (aDoc.data() || {}) as Record<string, unknown>;
          const aUid = typeof aData.uid === 'string' && aData.uid.trim() ? aData.uid.trim() : aDoc.id;
          const evalRole = evaluateCanonicalStaffRoleFromDocs({
            uid: aUid,
            email: typeof aData.email === 'string' ? aData.email : null,
            isVerifiedPersonalGmail: true,
            adminDoc: {
              exists: true,
              uid: aData.uid,
              email: aData.email,
              role: aData.role,
              isActive: aData.isActive,
            },
            adminEmail: ADMIN_EMAIL,
          });
          setVerifiedServerRoleForUid(aUid, evalRole.resolvedRole);
          if (evalRole.resolvedRole === 'ADMIN' || evalRole.resolvedRole === 'MOD') {
            adminRolesByUid.set(aUid, {
              role: evalRole.resolvedRole,
              email: typeof aData.email === 'string' ? aData.email.trim().toLowerCase() : undefined,
              displayName: typeof aData.displayName === 'string' ? aData.displayName.trim() : undefined,
              updatedAtMs: parseFirestoreTimestampMs(aData.updatedAt || aData.createdAt),
            });
          }
        }
      } catch (adminErr: any) {
        this.recordPermissionDiagnostic('list', '/admins', adminErr, caller);
      }

      // 2. Truy vấn collection(db, 'users') cô lập lỗi để nếu list /users bị từ chối (ví dụ Rules trên Production chưa được Publish)
      // thì không làm gãy toàn bộ tab Tài khoản mà vẫn hiển thị hồ sơ hiện có.
      const rawDocsByUid = new Map<string, Record<string, unknown>>();
      try {
        const snap = await getDocs(usersCol);
        for (const d of snap.docs) {
          const data = (d.data() || {}) as Record<string, unknown>;
          const uid = typeof data.uid === 'string' && data.uid.trim() ? data.uid.trim() : d.id;
          rawDocsByUid.set(uid, { ...data, uid });
        }
      } catch (usersListErr: any) {
        this.recordPermissionDiagnostic('list', '/users', usersListErr, caller);
        // Fallback an toàn: đọc hồ sơ chính chủ /users/{caller.uid} (được phép bởi isOwner(uid))
        if (caller && caller.uid) {
          try {
            const ownSnap = await getDoc(doc(db, 'users', caller.uid));
            if (ownSnap.exists()) {
              const ownData = (ownSnap.data() || {}) as Record<string, unknown>;
              rawDocsByUid.set(caller.uid, { ...ownData, uid: caller.uid });
            }
          } catch (ownErr: any) {
            this.recordPermissionDiagnostic('get', `/users/${caller.uid}`, ownErr, caller);
          }
        }
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

      // Luôn bảo đảm tài khoản Admin / người gọi hiện tại có mặt trong danh sách nếu đã đăng nhập hợp lệ
      if (caller && caller.uid && !rawDocsByUid.has(caller.uid)) {
        rawDocsByUid.set(caller.uid, {
          uid: caller.uid,
          email: (caller.email || ADMIN_EMAIL).trim().toLowerCase(),
          displayName: caller.displayName || '',
          role: isAdminUser(caller) ? 'ADMIN' : callerRole,
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

      // 4. Xác định vị trí bắt đầu theo cursor
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

      // 5. Bổ sung trạng thái phiên & email từ /user_sessions/{uid} (CHỈ cho ADMIN hoặc chính chủ; MOD không gọi đọc /user_sessions của người khác)
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

          // M7.3.11.6 Section 2.2: Chỉ đọc /user_sessions/{uid} khi người gọi là ADMIN hoặc chính chủ tài khoản đó
          if (isSoleAdminCaller || (caller && caller.uid === uid)) {
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
            } catch (sessErr: any) {
              this.recordPermissionDiagnostic('get', `/user_sessions/${uid}`, sessErr, caller);
            }
          }

          let serverRole: UserRoleType | null = adminEntry?.role ?? null;
          if (!serverRole && adminsCollectionLoaded) {
            serverRole = 'PLAYER';
          } else if (!serverRole && (isSoleAdminCaller || (caller && caller.uid === uid))) {
            try {
              const adminSnap = await getDoc(doc(db, 'admins', uid));
              if (adminSnap.exists()) {
                const aData = adminSnap.data() as Record<string, unknown>;
                const evalRole = evaluateCanonicalStaffRoleFromDocs({
                  uid,
                  email,
                  isVerifiedPersonalGmail: true,
                  adminDoc: {
                    exists: true,
                    uid: aData.uid,
                    email: aData.email,
                    role: aData.role,
                    isActive: aData.isActive,
                  },
                  userDoc: data,
                  adminEmail: ADMIN_EMAIL,
                });
                serverRole = evalRole.resolvedRole;
              }
            } catch (admDocErr: any) {
              this.recordPermissionDiagnostic('get', `/admins/${uid}`, admDocErr, caller);
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
      this.recordPermissionDiagnostic('list', '/users', err, caller);
      const rawMsg = String(err?.message || '');
      const isPermErr =
        String(err?.code || '').toLowerCase().includes('permission-denied') ||
        rawMsg.toLowerCase().includes('missing or insufficient permissions');
      return {
        success: false,
        accounts: [],
        pageSize,
        hasNextPage: false,
        nextCursor: null,
        errorMessage: isPermErr
          ? 'Tài khoản hiện tại không đủ quyền truy cập dữ liệu mục Tài khoản hoặc Firestore Rules trên môi trường Production chưa được cập nhật.'
          : rawMsg || 'Không thể tải danh sách tài khoản từ Firestore. Vui lòng thử lại.',
      };
    }
  }

  /**
   * M7.3.11.4 Mục 2, 4 & 6: Cấp hoặc thu hồi quyền Mod (`MOD` <-> `PLAYER`) kèm tạo & kiểm tra Audit Log nguyên tử.
   * - Chỉ duy nhất `ADMIN` (`linhnk2013@gmail.com`) mới được phép thực hiện.
   * - Không cho phép cấp thêm quyền `ADMIN` hoặc `SUPER_ADMIN` cho bất kỳ tài khoản nào khác.
   * - Nếu tạo/kiểm tra Audit Log thất bại (hoặc `simulateAuditLogFailureForTesting === true`),
   *   TOÀN BỘ thao tác cấp/thu hồi quyền PHẢI THẤT BẠI.
   */
  public changeUserRoleSync(params: {
    targetUid: string;
    targetEmail: string;
    targetDisplayName?: string;
    currentTargetRole?: UserRoleType;
    newRole: UserRoleType;
    overrideCallerForTesting?: ValidatedUserAccount | User | null;
    simulateAuditLogFailureForTesting?: boolean;
    customAuditIdForTesting?: string;
    customAuditDocIdForTesting?: string;
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

    const actorRole: UserRoleType = isAdminUser(caller) ? 'ADMIN' : resolveUserRole(caller as any);
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
      adminEmail: ADMIN_EMAIL,
    });

    if (!validation.allowed) {
      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage: validation.reasonVi || 'Không thể thay đổi quyền cho tài khoản này.',
      };
    }

    // Chuẩn bị bản ghi Audit Log và kiểm tra tính hợp lệ trước khi commit nguyên tử
    const candidateAudit = buildRoleChangeAuditEntry({
      actionType: params.newRole === 'MOD' ? 'GRANT_MOD' : 'REVOKE_TO_PLAYER',
      actorUid,
      actorEmail,
      targetUid: params.targetUid,
      targetEmail: (params.targetEmail || '').trim().toLowerCase(),
      targetDisplayName: (
        params.targetDisplayName ||
        getUserDisplayLabel({ displayName: null, email: params.targetEmail })
      ).slice(0, 60),
      previousRole,
      newRole: params.newRole,
      timestampMs: Date.now(),
      customAuditId: params.customAuditIdForTesting,
    });

    const expectedDocId = params.customAuditDocIdForTesting ?? candidateAudit.auditId;
    const auditValidation = validateRoleAuditLogPayload(
      candidateAudit,
      expectedDocId,
      ADMIN_EMAIL
    );

    if (!auditValidation.valid || params.simulateAuditLogFailureForTesting === true) {
      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage:
          auditValidation.reasonVi ||
          'Thao tác cấp/thu hồi quyền đã bị hủy nguyên tử do ghi nhật ký Audit Log thất bại.',
      };
    }

    // Commit nguyên tử: Cập nhật vai trò + Ghi Audit Log cùng lúc
    setVerifiedServerRoleForUid(params.targetUid, params.newRole);
    if (this.customPaginationAdapter?.updateRole) {
      this.customPaginationAdapter.updateRole(params.targetUid, params.newRole);
    }
    const auditEntry = commitRoleChangeAuditEntry(candidateAudit);

    return {
      success: true,
      previousRole,
      newRole: params.newRole,
      auditEntry,
    };
  }

  /**
   * M7.3.11.4 Mục 2, 4 & 6: Cấp quyền Mod (`MOD`) hoặc Thu hồi về Người chơi (`PLAYER`)
   * và ghi Audit Log theo cơ chế NGUYÊN TỬ (`writeBatch`) trên Firestore (`/admins/{targetUid}` + `/role_audit_logs/{auditId}`).
   * - Chỉ duy nhất `ADMIN` (`linhnk2013@gmail.com`) được phép thực hiện.
   * - Không cho phép cấp thêm quyền `ADMIN` cho tài khoản khác.
   */
  public async changeUserRole(params: {
    targetUid: string;
    targetEmail: string;
    targetDisplayName?: string;
    currentTargetRole?: UserRoleType;
    newRole: UserRoleType;
    overrideCallerForTesting?: ValidatedUserAccount | User | null;
    simulateAuditLogFailureForTesting?: boolean;
  }): Promise<{
    success: boolean;
    previousRole: UserRoleType;
    newRole: UserRoleType;
    auditEntry?: RoleChangeAuditEntry;
    errorMessage?: string;
  }> {
    if (this.customPaginationAdapter) {
      return this.changeUserRoleSync(params);
    }

    const caller =
      'overrideCallerForTesting' in params
        ? params.overrideCallerForTesting
        : this.getCurrentUser();

    const actorRole: UserRoleType = isAdminUser(caller) ? 'ADMIN' : resolveUserRole(caller as any);
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
      adminEmail: ADMIN_EMAIL,
    });

    if (!validation.allowed) {
      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage: validation.reasonVi || 'Không thể thay đổi quyền cho tài khoản này.',
      };
    }

    const safeDisplayName = (
      params.targetDisplayName ||
      getUserDisplayLabel({ displayName: null, email: params.targetEmail })
    ).slice(0, 60);
    const normalizedTargetEmail = (params.targetEmail || '').trim().toLowerCase();

    const candidateAudit = buildRoleChangeAuditEntry({
      actionType: params.newRole === 'MOD' ? 'GRANT_MOD' : 'REVOKE_TO_PLAYER',
      actorUid,
      actorEmail,
      targetUid: params.targetUid,
      targetEmail: normalizedTargetEmail,
      targetDisplayName: safeDisplayName,
      previousRole,
      newRole: params.newRole,
      timestampMs: Date.now(),
    });

    const auditValidation = validateRoleAuditLogPayload(
      candidateAudit,
      candidateAudit.auditId,
      ADMIN_EMAIL
    );

    if (!auditValidation.valid || params.simulateAuditLogFailureForTesting === true) {
      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage:
          auditValidation.reasonVi ||
          'Thao tác cấp/thu hồi quyền đã bị hủy nguyên tử do ghi nhật ký Audit Log thất bại.',
      };
    }

    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      const adminRef = doc(db, 'admins', params.targetUid);
      const auditRef = doc(db, 'role_audit_logs', candidateAudit.auditId);

      batch.set(adminRef, {
        uid: params.targetUid,
        email: normalizedTargetEmail,
        displayName: safeDisplayName,
        role: params.newRole === 'MOD' ? 'MOD' : 'PLAYER',
        isActive: params.newRole === 'MOD',
        lastAuditId: candidateAudit.auditId,
        updatedBy: ADMIN_EMAIL,
        updatedAt: serverTimestamp(),
      });

      batch.set(auditRef, {
        auditId: candidateAudit.auditId,
        actionType: candidateAudit.actionType,
        actorUid: candidateAudit.actorUid,
        actorEmail: candidateAudit.actorEmail,
        targetUid: candidateAudit.targetUid,
        targetEmail: candidateAudit.targetEmail,
        targetDisplayName: candidateAudit.targetDisplayName,
        previousRole: candidateAudit.previousRole,
        newRole: candidateAudit.newRole,
        timestampMs: candidateAudit.timestampMs,
        createdAt: serverTimestamp(),
      });

      // Thực thi nguyên tử cả thay đổi role (/admins/{targetUid}) và nhật ký (/role_audit_logs/{auditId})
      await batch.commit();

      setVerifiedServerRoleForUid(params.targetUid, params.newRole);
      const auditEntry = commitRoleChangeAuditEntry(candidateAudit);

      return {
        success: true,
        previousRole,
        newRole: params.newRole,
        auditEntry,
      };
    } catch (err: any) {
      this.recordPermissionDiagnostic('writeBatch', `/admins/${params.targetUid} + /role_audit_logs/${candidateAudit.auditId}`, err, caller);
      const rawCode = String(err?.code || '').toLowerCase();
      const rawMsg = String(err?.message || '');
      const isPermissionDenied =
        rawCode.includes('permission-denied') ||
        rawCode.includes('permission_denied') ||
        rawMsg.toLowerCase().includes('missing or insufficient permissions') ||
        rawMsg.toLowerCase().includes('permission-denied');

      return {
        success: false,
        previousRole,
        newRole: previousRole,
        errorMessage: isPermissionDenied
          ? 'Thao tác cấp/thu hồi quyền Mod và ghi Audit Log nguyên tử bị từ chối (permission-denied): Firestore Production Rules hiện chưa đáp ứng phiên bản chức năng M7.3.11.4 (/admins/{uid} và /role_audit_logs/{logId} cho Admin linhnk2013@gmail.com). Vui lòng Publish Firestore Rules mới.'
          : rawMsg || 'Không thể lưu thay đổi phân quyền và Audit Log nguyên tử lên Firestore.',
      };
    }
  }

  /**
   * M7.3.11.6 Section 7: Đăng nhập Google nhanh gọn, tối giản bước thừa.
   * - Không yêu cầu xác minh số điện thoại / OTP từ phía ứng dụng.
   * - Nếu đã có phiên Gmail cá nhân hợp lệ trên trình duyệt và không yêu cầu đổi tài khoản (`forceAccountSelection`),
   *   tái sử dụng ngay phiên hiện có mà không mở popup lặp.
   * - Không ép `prompt: 'select_account'` hoặc `consent` mặc định để giảm tối đa bước xác nhận thừa từ Google OAuth,
   *   chỉ bật `prompt: 'select_account'` khi người dùng chủ động đổi tài khoản.
   * - Chống mở trùng nhiều luồng đăng nhập cùng lúc (`signInInFlightPromise`).
   * - Hỗ trợ fallback `signInWithRedirect` nếu trình duyệt di động chặn popup (`auth/popup-blocked`).
   */
  public async signInWithGoogle(options?: { forceAccountSelection?: boolean }): Promise<AuthValidationResult> {
    if (!options?.forceAccountSelection) {
      const existingUser = this.getCurrentUser();
      if (existingUser) {
        const existingValidation = validatePersonalGmailUser(existingUser);
        if (existingValidation.isValid) {
          this.trialModeActive = false;
          this.applyStoredProfileOverride(existingUser);
          void this.recordUserLoginTimestamp(existingUser);
          return existingValidation;
        }
      }
    }

    if (this.signInInFlightPromise) {
      return this.signInInFlightPromise;
    }

    this.signInInFlightPromise = (async (): Promise<AuthValidationResult> => {
      const provider = new GoogleAuthProvider();
      if (options?.forceAccountSelection) {
        provider.setCustomParameters({ prompt: 'select_account' });
      }

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
        const errCode = String(error?.code || '');
        if (errCode === 'auth/popup-blocked' && typeof window !== 'undefined') {
          try {
            await signInWithRedirect(this.auth, provider);
            return {
              isValid: false,
              user: null,
              errorMessage: 'Đang chuyển hướng đến trang đăng nhập Google...',
            };
          } catch {
            // Fall through to standard error message
          }
        }
        if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
          return {
            isValid: false,
            user: null,
            errorMessage: 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.',
          };
        }
        return {
          isValid: false,
          user: null,
          errorMessage: error?.message || 'Đăng nhập Google thất bại.',
        };
      } finally {
        this.signInInFlightPromise = null;
      }
    })();

    return this.signInInFlightPromise;
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
