/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.3.11.4 – SIMPLIFIED 3-ROLE RBAC PERMISSION MATRIX, MIGRATION & AUDIT LOG
 *
 * Nguyên tắc bảo mật:
 * 1. Hệ thống chỉ duy trì 3 vai trò: `ADMIN` (Quản trị viên duy nhất `linhnk2013@gmail.com`), `MOD` (Điều hành viên) và `PLAYER` (Người chơi thông thường).
 * 2. Xóa hoàn toàn cấp `SUPER_ADMIN` và mô hình nhiều `ADMIN` cũ; thu hồi toàn bộ đặc quyền của `linhnk.online@gmail.com`.
 * 3. Mặc định từ chối (Default-Deny / Fail-Closed) nếu vai trò không xác định, không hợp lệ hoặc quyền chưa triển khai.
 * 4. Tuyệt đối không tin tưởng dữ liệu tự sửa trong localStorage hoặc `/users/{uid}`; vai trò được xác thực từ Google Auth + `/admins/{uid}`.
 * 5. Ghi nhật ký nguyên tử đầy đủ mọi thao tác cấp/thu hồi quyền.
 */

import type { UserRoleType } from './authManager.ts';

export type UserRole = UserRoleType;

export const SOLE_ADMIN_EMAIL = 'linhnk2013@gmail.com';
export const REVOKED_LEGACY_ADMIN_EMAIL = 'linhnk.online@gmail.com';

export type PermissionCategory =
  | 'Tài khoản & Kiểm duyệt'
  | 'Phân quyền Hệ thống'
  | 'Quản lý Màn chơi (Stage)'
  | 'Tài nguyên & Hệ thống'
  | 'Giám sát & Báo cáo'
  | 'Kinh tế & Xã hội';

export type PermissionId =
  | 'VIEW_ACCOUNT_LIST'
  | 'VIEW_ACCOUNT_DETAILS'
  | 'MANAGE_PLAYER_ACCOUNT'
  | 'GRANT_REVOKE_ADMIN'
  | 'GRANT_REVOKE_MOD'
  | 'MANAGE_STAGES'
  | 'ADD_STAGE'
  | 'EDIT_STAGE'
  | 'SAVE_STAGE_DRAFT'
  | 'ACTIVATE_STAGE'
  | 'DEACTIVATE_STAGE'
  | 'MANAGE_AUDIO_SYSTEM'
  | 'MANAGE_AVATAR_CATALOG'
  | 'MANAGE_SYSTEM_SETTINGS'
  | 'VIEW_AUDIT_AND_MONITORING'
  | 'MANAGE_RANK_XP_XU'
  | 'MANAGE_CLAN_ADMIN'
  | 'MANAGE_FRIENDS_ADMIN';

export type PermissionImplementationStatus = 'DEPLOYED' | 'NOT_DEPLOYED';

export interface PermissionMatrixRow {
  id: PermissionId;
  category: PermissionCategory;
  nameVi: string;
  descriptionVi: string;
  status: PermissionImplementationStatus;
  statusLabelVi: 'Đã triển khai' | 'Chưa triển khai';
  ADMIN: boolean;
  MOD: boolean;
  PLAYER: boolean;
}

/**
 * Ma trận phân quyền tập trung 3 vai trò (M7.3.11.4 Mục 1, 2 & 4):
 * - Chỉ duy trì 3 vai trò: `ADMIN`, `MOD`, `PLAYER`.
 * - `ADMIN` (`linhnk2013@gmail.com` duy nhất) kế thừa toàn bộ quyền quản trị trước đây của Super Admin.
 * - Không tồn tại chức năng cấp thêm quyền `ADMIN` cho tài khoản khác (`GRANT_REVOKE_ADMIN` đã bị loại bỏ khỏi quyền triển khai).
 */
export const RBAC_PERMISSION_MATRIX: readonly PermissionMatrixRow[] = Object.freeze([
  {
    id: 'VIEW_ACCOUNT_LIST',
    category: 'Tài khoản & Kiểm duyệt',
    nameVi: 'Xem danh sách tài khoản',
    descriptionVi: 'Truy cập danh sách tài khoản người chơi có phân trang (10 tài khoản/trang).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: true,
    PLAYER: false,
  },
  {
    id: 'VIEW_ACCOUNT_DETAILS',
    category: 'Tài khoản & Kiểm duyệt',
    nameVi: 'Xem thông tin tài khoản',
    descriptionVi: 'Xem chi tiết hồ sơ (Nickname, Email, Avatar, Vai trò, Lần đăng nhập gần nhất, Trạng thái).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: true,
    PLAYER: false,
  },
  {
    id: 'MANAGE_PLAYER_ACCOUNT',
    category: 'Tài khoản & Kiểm duyệt',
    nameVi: 'Khóa/mở khóa hoặc sửa hồ sơ người chơi khác',
    descriptionVi:
      'Khóa/mở khóa tài khoản vi phạm hoặc đặt lại Nickname của người chơi khác (Chưa triển khai ở phiên bản hiện tại).',
    status: 'NOT_DEPLOYED',
    statusLabelVi: 'Chưa triển khai',
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'GRANT_REVOKE_MOD',
    category: 'Phân quyền Hệ thống',
    nameVi: 'Cấp/thu hồi quyền Mod',
    descriptionVi: 'Cấp quyền Mod cho người chơi hoặc thu hồi quyền Mod về Người chơi (Chỉ Admin duy nhất linhnk2013@gmail.com).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_STAGES',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Quản lý Stage',
    descriptionVi: 'Xem danh sách toàn bộ màn chơi (Bản nháp, Đã kích hoạt, Ngừng kích hoạt) và lịch sử phiên bản.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'ADD_STAGE',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Thêm Stage',
    descriptionVi: 'Tạo màn chơi mới với trình thiết kế bản đồ lưới 13×13 kéo thả.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'EDIT_STAGE',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Sửa Stage',
    descriptionVi: 'Chỉnh sửa tên màn chơi và bố cục tile trên bản đồ 13×13.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'SAVE_STAGE_DRAFT',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Lưu Stage',
    descriptionVi: 'Lưu cấu hình màn chơi thành Bản nháp độc lập mà không tự động đưa vào trận đấu đang chạy.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'ACTIVATE_STAGE',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Kích hoạt Stage',
    descriptionVi: 'Kiểm tra hợp lệ 13×13 và đưa phiên bản Stage đã lưu vào danh sách màn chơi chính thức.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'DEACTIVATE_STAGE',
    category: 'Quản lý Màn chơi (Stage)',
    nameVi: 'Ngừng kích hoạt Stage',
    descriptionVi: 'Tạm ngừng sử dụng một màn chơi trong danh sách màn chơi thực tế.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_AUDIO_SYSTEM',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý âm thanh',
    descriptionVi: 'Upload, thay thế, xóa nhạc nền hệ thống (BGM) và âm thanh hành động (Action SFX) (Chỉ Admin duy nhất).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_AVATAR_CATALOG',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý avatar',
    descriptionVi: 'Upload, thay thế phiên bản, ẩn/hiện và xóa Avatar trong Danh mục dùng chung (Chỉ Admin duy nhất).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_SYSTEM_SETTINGS',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý cài đặt hệ thống',
    descriptionVi: 'Cấu hình chế độ chơi ưu tiên và thiết lập vận hành chung (Chỉ Admin duy nhất).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'VIEW_AUDIT_AND_MONITORING',
    category: 'Giám sát & Báo cáo',
    nameVi: 'Xem báo cáo và giám sát',
    descriptionVi: 'Xem nhật ký thay đổi phân quyền, trạng thái phiên đăng nhập và giám sát hệ thống.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    ADMIN: true,
    MOD: true,
    PLAYER: false,
  },
  {
    id: 'MANAGE_RANK_XP_XU',
    category: 'Kinh tế & Xã hội',
    nameVi: 'Quản trị Rank & XP/Xu',
    descriptionVi: 'Điều chỉnh bảng xếp hạng Rank, điểm kinh nghiệm XP và tiền tệ Xu của người chơi.',
    status: 'NOT_DEPLOYED',
    statusLabelVi: 'Chưa triển khai',
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_CLAN_ADMIN',
    category: 'Kinh tế & Xã hội',
    nameVi: 'Quản trị Clan',
    descriptionVi: 'Công cụ quản trị bang hội (Clan) toàn hệ thống.',
    status: 'NOT_DEPLOYED',
    statusLabelVi: 'Chưa triển khai',
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_FRIENDS_ADMIN',
    category: 'Kinh tế & Xã hội',
    nameVi: 'Quản trị Friends (Bạn bè)',
    descriptionVi: 'Công cụ quản trị danh sách kết bạn toàn hệ thống.',
    status: 'NOT_DEPLOYED',
    statusLabelVi: 'Chưa triển khai',
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
]);

/**
 * Kiểm tra quyền tập trung theo nguyên tắc Default-Deny (M7.3.11.4 Mục 2 & 4).
 * - Chỉ chấp nhận 3 vai trò: `ADMIN`, `MOD`, `PLAYER` (`SUPER_ADMIN` đã bị xóa và luôn trả về `false`).
 * - Không cho phép cấp thêm `ADMIN` (`GRANT_REVOKE_ADMIN` luôn trả về `false`).
 * - Nếu quyền có trạng thái `NOT_DEPLOYED` (Chưa triển khai) -> trả về `false`.
 */
export function hasRolePermission(
  role: UserRoleType | string | null | undefined,
  permissionId: PermissionId
): boolean {
  if (!role || typeof role !== 'string') return false;
  const normalizedRole = role.trim().toUpperCase();
  if (
    normalizedRole !== 'ADMIN' &&
    normalizedRole !== 'MOD' &&
    normalizedRole !== 'PLAYER'
  ) {
    return false;
  }

  if (permissionId === 'GRANT_REVOKE_ADMIN') {
    return false;
  }

  const row = RBAC_PERMISSION_MATRIX.find((r) => r.id === permissionId);
  if (!row) return false;
  if (row.status !== 'DEPLOYED') return false;

  return Boolean(row[normalizedRole as 'ADMIN' | 'MOD' | 'PLAYER']);
}

export function getPermissionsForRole(role: UserRoleType | string): PermissionId[] {
  const normalizedRole = typeof role === 'string' ? role.trim().toUpperCase() : '';
  if (normalizedRole !== 'ADMIN' && normalizedRole !== 'MOD' && normalizedRole !== 'PLAYER') {
    return [];
  }
  return RBAC_PERMISSION_MATRIX.filter(
    (row) => row.status === 'DEPLOYED' && Boolean(row[normalizedRole as 'ADMIN' | 'MOD' | 'PLAYER'])
  ).map((row) => row.id);
}

export interface RoleAssignmentValidationResult {
  allowed: boolean;
  reasonVi: string | null;
}

/**
 * Kiểm tra nghiêm ngặt thao tác cấp/thu hồi quyền ở tầng nghiệp vụ/dữ liệu (M7.3.11.4 Mục 2, 4 & 6):
 * - Chỉ duy nhất `ADMIN` (`linhnk2013@gmail.com`) mới được phép cấp/thu hồi quyền `MOD`.
 * - Tài khoản cũ `linhnk.online@gmail.com` bị từ chối hoàn toàn.
 * - Không tồn tại vai trò `SUPER_ADMIN` và KHÔNG cho phép cấp thêm quyền `ADMIN` cho tài khoản khác.
 * - Không cho phép tự thay đổi quyền của chính mình (`actorUid === targetUid`) hoặc hạ cấp `linhnk2013@gmail.com`.
 * - Cho phép `ADMIN` cấp `MOD` cho `PLAYER`, thu hồi `MOD` về `PLAYER`, hoặc chuyển/thu hồi bản ghi `ADMIN` cũ về `MOD` / `PLAYER`.
 */
export function validateRoleAssignmentChange(params: {
  actorRole: UserRoleType | string;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail: string;
  currentTargetRole: UserRoleType | string;
  newRole: UserRoleType | string;
  adminEmail?: string;
  superAdminEmail?: string;
}): RoleAssignmentValidationResult {
  const {
    actorRole,
    actorUid,
    actorEmail,
    targetUid,
    targetEmail,
    currentTargetRole,
    newRole,
  } = params;

  const configuredAdminEmail = (
    params.adminEmail ||
    params.superAdminEmail ||
    SOLE_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();
  const normalizedActorEmail = (actorEmail || '').trim().toLowerCase();
  const normalizedTargetEmail = (targetEmail || '').trim().toLowerCase();

  // 1. Chặn tuyệt đối email quản trị cũ đã thu hồi và kiểm tra đúng tài khoản ADMIN duy nhất (linhnk2013@gmail.com)
  if (
    !actorUid ||
    actorRole !== 'ADMIN' ||
    normalizedActorEmail === REVOKED_LEGACY_ADMIN_EMAIL ||
    normalizedActorEmail !== SOLE_ADMIN_EMAIL ||
    normalizedActorEmail !== configuredAdminEmail
  ) {
    return {
      allowed: false,
      reasonVi:
        'Từ chối truy cập: Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền cấp hoặc thu hồi quyền Mod.',
    };
  }

  // 2. Không cho phép tự sửa quyền của chính mình
  if (!targetUid || actorUid === targetUid) {
    return {
      allowed: false,
      reasonVi: 'Không được phép tự thay đổi vai trò của chính tài khoản Admin đang đăng nhập.',
    };
  }

  // 3. Không được hạ cấp hoặc thay đổi tài khoản Admin duy nhất (linhnk2013@gmail.com)
  if (normalizedTargetEmail === SOLE_ADMIN_EMAIL || normalizedTargetEmail === configuredAdminEmail) {
    return {
      allowed: false,
      reasonVi: 'Bảo vệ an toàn hệ thống: Không được phép hạ cấp hoặc thu hồi quyền của Admin duy nhất (linhnk2013@gmail.com).',
    };
  }

  // 4. Không còn vai trò SUPER_ADMIN và không cho phép cấp thêm quyền ADMIN cho bất kỳ tài khoản nào khác
  if (newRole === 'SUPER_ADMIN') {
    return {
      allowed: false,
      reasonVi: 'Vai trò SUPER_ADMIN đã bị xóa khỏi hệ thống (chỉ duy trì ADMIN, MOD, PLAYER).',
    };
  }

  if (newRole === 'ADMIN') {
    return {
      allowed: false,
      reasonVi: 'Hệ thống chỉ có một tài khoản ADMIN duy nhất (linhnk2013@gmail.com). Không được phép cấp thêm quyền ADMIN cho tài khoản khác.',
    };
  }

  if (newRole !== 'MOD' && newRole !== 'PLAYER') {
    return {
      allowed: false,
      reasonVi: 'Vai trò đích không hợp lệ (chỉ chấp nhận cấp Mod hoặc thu hồi về Người chơi).',
    };
  }

  if (currentTargetRole === newRole) {
    return {
      allowed: false,
      reasonVi: 'Tài khoản đích đã ở sẵn vai trò này.',
    };
  }

  // 5. Kiểm tra theo ma trận quyền tập trung
  if (!hasRolePermission(actorRole, 'GRANT_REVOKE_MOD')) {
    return {
      allowed: false,
      reasonVi: 'Tài khoản hiện tại không có quyền GRANT_REVOKE_MOD.',
    };
  }

  return {
    allowed: true,
    reasonVi: null,
  };
}

export interface CanonicalStaffRoleEvaluationResult {
  resolvedRole: UserRoleType;
  isAdmin: boolean;
  /** Alias tương thích cho các module kiểm tra Admin duy nhất */
  isSuperAdmin: boolean;
  isStaffAdmin: boolean;
  isStaffModOrAdmin: boolean;
  denyReasonVi: string | null;
}

/**
 * M7.3.11.4 Mục 1, 2, 3 & 6: Xác định vai trò chính thức (Single Canonical Source of Truth)
 * và mô phỏng chính xác biểu thức Firestore Rules `isAdmin()` / `isStaffModOrAdmin()` theo nguyên tắc FAIL-CLOSED:
 *
 * 1. Nguồn dữ liệu vai trò chính thức:
 *    - `ADMIN`: Chỉ duy nhất tài khoản Gmail cá nhân đã xác minh khớp `linhnk2013@gmail.com` và UID hợp lệ.
 *      Nếu có hồ sơ `/admins/{uid}` thì hồ sơ đó bắt buộc phải có `role === 'ADMIN'` và `isActive === true`.
 *    - Email cũ `linhnk.online@gmail.com`: Bị thu hồi hoàn toàn mọi quyền quản trị; luôn trả về `PLAYER` kể cả khi còn bản ghi cũ trong `/admins/{uid}`.
 *    - `MOD`: Xác định DUY NHẤT bởi tài liệu `/admins/{uid}` có `exists === true`, `isActive === true` (boolean) và `role === 'MOD'`.
 *    - Bất kỳ tài khoản nào khác ngoài `linhnk2013@gmail.com` dù có `role === 'ADMIN'` hoặc `'SUPER_ADMIN'` trong `/admins/{uid}` đều KHÔNG được nhận quyền `ADMIN` (Fail-Closed về `PLAYER`).
 *    - Tuyệt đối KHÔNG lấy trường `role`, `isAdmin` hoặc `isSuperAdmin` từ `/users/{uid}` để cấp quyền.
 */
export function evaluateCanonicalStaffRoleFromDocs(params: {
  uid: string;
  email: string | null | undefined;
  isVerifiedPersonalGmail?: boolean;
  adminDoc?: {
    exists: boolean;
    uid?: unknown;
    email?: unknown;
    role?: unknown;
    isActive?: unknown;
  } | null;
  userDoc?: {
    role?: unknown;
    isAdmin?: unknown;
    isSuperAdmin?: unknown;
  } | null;
  adminEmail?: string;
  superAdminEmail?: string;
}): CanonicalStaffRoleEvaluationResult {
  const configuredAdminEmail = (
    params.adminEmail ||
    params.superAdminEmail ||
    SOLE_ADMIN_EMAIL
  )
    .trim()
    .toLowerCase();
  const normalizedEmail = (params.email || '').trim().toLowerCase();
  const isVerifiedGmail = params.isVerifiedPersonalGmail !== false;

  if (!params.uid || typeof params.uid !== 'string' || !VALID_DOC_ID_REGEX.test(params.uid) || !isVerifiedGmail) {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Tài khoản chưa xác thực Gmail cá nhân hoặc UID không hợp lệ.',
    };
  }

  // 1. Thu hồi hoàn toàn đặc quyền của email cũ linhnk.online@gmail.com
  if (normalizedEmail === REVOKED_LEGACY_ADMIN_EMAIL) {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Email quản trị cũ (linhnk.online@gmail.com) đã bị thu hồi toàn bộ quyền ADMIN/SUPER_ADMIN.',
    };
  }

  const adminDoc = params.adminDoc;

  // 2. Nhánh isAdmin(): chỉ duy nhất tài khoản linhnk2013@gmail.com đã xác minh
  if (normalizedEmail === SOLE_ADMIN_EMAIL && normalizedEmail === configuredAdminEmail) {
    if (adminDoc && adminDoc.exists === true) {
      if (typeof adminDoc.isActive !== 'boolean' || adminDoc.isActive !== true) {
        return {
          resolvedRole: 'PLAYER',
          isAdmin: false,
          isSuperAdmin: false,
          isStaffAdmin: false,
          isStaffModOrAdmin: false,
          denyReasonVi: 'Fail-Closed: Hồ sơ /admins/{uid} của Admin thiếu isActive === true.',
        };
      }
      const rawDocRole = typeof adminDoc.role === 'string' ? adminDoc.role.trim() : '';
      if (rawDocRole !== 'ADMIN') {
        return {
          resolvedRole: 'PLAYER',
          isAdmin: false,
          isSuperAdmin: false,
          isStaffAdmin: false,
          isStaffModOrAdmin: false,
          denyReasonVi: 'Fail-Closed: Hồ sơ /admins/{uid} của Admin có role không khớp ADMIN.',
        };
      }
      if (typeof adminDoc.uid !== 'string' || adminDoc.uid.trim() !== params.uid) {
        return {
          resolvedRole: 'PLAYER',
          isAdmin: false,
          isSuperAdmin: false,
          isStaffAdmin: false,
          isStaffModOrAdmin: false,
          denyReasonVi: 'Fail-Closed: Trường uid trong /admins/{uid} bị thiếu hoặc không khớp với UID xác thực.',
        };
      }
      if (
        typeof adminDoc.email !== 'string' ||
        adminDoc.email.trim().toLowerCase() !== SOLE_ADMIN_EMAIL
      ) {
        return {
          resolvedRole: 'PLAYER',
          isAdmin: false,
          isSuperAdmin: false,
          isStaffAdmin: false,
          isStaffModOrAdmin: false,
          denyReasonVi: 'Fail-Closed: Trường email trong /admins/{uid} của Admin không khớp linhnk2013@gmail.com.',
        };
      }
    }

    return {
      resolvedRole: 'ADMIN',
      isAdmin: true,
      isSuperAdmin: true,
      isStaffAdmin: true,
      isStaffModOrAdmin: true,
      denyReasonVi: null,
    };
  }

  // 3. Đối với mọi tài khoản khác: chỉ kiểm tra quyền MOD từ nguồn duy nhất /admins/{uid} (bỏ qua hoàn toàn /users/{uid})
  if (!adminDoc || adminDoc.exists !== true) {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Không tồn tại tài liệu phân quyền trong /admins/{uid}.',
    };
  }

  if (typeof adminDoc.isActive !== 'boolean') {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Fail-Closed: Hồ sơ /admins/{uid} thiếu trường trạng thái hoạt động isActive hợp lệ.',
    };
  }

  if (adminDoc.isActive !== true) {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Hồ sơ trong /admins/{uid} có isActive == false (đã ngừng kích hoạt).',
    };
  }

  if (typeof adminDoc.uid !== 'string' || adminDoc.uid.trim() !== params.uid) {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi: 'Fail-Closed: Trường uid trong /admins/{uid} bị thiếu hoặc không khớp với Document ID.',
    };
  }

  const rawRole = typeof adminDoc.role === 'string' ? adminDoc.role.trim() : '';

  if (rawRole === 'MOD') {
    return {
      resolvedRole: 'MOD',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: true,
      denyReasonVi: null,
    };
  }

  if (rawRole === 'ADMIN' || rawRole === 'SUPER_ADMIN') {
    return {
      resolvedRole: 'PLAYER',
      isAdmin: false,
      isSuperAdmin: false,
      isStaffAdmin: false,
      isStaffModOrAdmin: false,
      denyReasonVi:
        'Từ chối quyền ADMIN/SUPER_ADMIN: Chỉ tài khoản duy nhất linhnk2013@gmail.com mới được phép giữ vai trò ADMIN. Bản ghi ADMIN cũ cần được chuyển sang MOD hoặc thu hồi.',
    };
  }

  return {
    resolvedRole: 'PLAYER',
    isAdmin: false,
    isSuperAdmin: false,
    isStaffAdmin: false,
    isStaffModOrAdmin: false,
    denyReasonVi: 'Trường role trong /admins/{uid} không hợp lệ (không được dùng isActive == true thay thế kiểm tra role).',
  };
}

export type RoleAuditActionType =
  | 'BOOTSTRAP_SOLE_ADMIN'
  | 'GRANT_MOD'
  | 'REVOKE_TO_PLAYER'
  | 'CONVERT_LEGACY_ADMIN_TO_MOD';

/**
 * Nhật ký kiểm toán thay đổi quyền (M7.3.11.5 Mục 3):
 * Ghi lại: người thực hiện (Admin `linhnk2013@gmail.com`), tài khoản được thay đổi, quyền cũ, quyền mới, loại sự kiện, thời gian.
 */
export interface RoleChangeAuditEntry {
  auditId: string;
  actionType?: RoleAuditActionType;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail: string;
  targetDisplayName: string;
  previousRole: UserRoleType;
  newRole: UserRoleType;
  timestampMs: number;
}

const VALID_DOC_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function buildRoleChangeAuditEntry(
  entry: Omit<RoleChangeAuditEntry, 'auditId'> & { customAuditId?: string }
): RoleChangeAuditEntry {
  const { customAuditId, ...rest } = entry;
  return {
    ...rest,
    auditId:
      customAuditId ??
      `audit_${entry.timestampMs}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * M7.3.11.4 Mục 6: Kiểm tra tính hợp lệ nghiêm ngặt của bản ghi Audit Log trước khi commit nguyên tử:
 * - actorUid hợp lệ và actorEmail phải khớp chính xác tài khoản ADMIN duy nhất (`linhnk2013@gmail.com`), không phải `linhnk.online@gmail.com`
 * - targetUid hợp lệ và khác actorUid
 * - previousRole thuộc `['ADMIN', 'MOD', 'PLAYER']` và newRole thuộc `['MOD', 'PLAYER']` (không bao giờ cấp thêm `ADMIN` hoặc `SUPER_ADMIN`)
 * - auditId hợp lệ và khớp tuyệt đối với document ID (expectedDocId)
 * - chỉ cho phép đúng các trường dữ liệu cần thiết
 */
export function validateRoleAuditLogPayload(
  payload: Record<string, unknown> | RoleChangeAuditEntry,
  expectedDocId: string,
  adminEmail: string = SOLE_ADMIN_EMAIL
): { valid: boolean; reasonVi: string | null } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, reasonVi: 'Dữ liệu Audit Log không hợp lệ.' };
  }
  const data = payload as Record<string, unknown>;
  const allowedKeys = new Set([
    'auditId',
    'actionType',
    'actorUid',
    'actorEmail',
    'targetUid',
    'targetEmail',
    'targetDisplayName',
    'previousRole',
    'newRole',
    'timestampMs',
    'createdAt',
  ]);
  const requiredKeys = [
    'auditId',
    'actorUid',
    'actorEmail',
    'targetUid',
    'targetEmail',
    'targetDisplayName',
    'previousRole',
    'newRole',
    'timestampMs',
  ];

  for (const reqKey of requiredKeys) {
    if (!(reqKey in data)) {
      return { valid: false, reasonVi: `Thiếu trường bắt buộc trong Audit Log: ${reqKey}.` };
    }
  }
  for (const key of Object.keys(data)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, reasonVi: `Phát hiện trường không được phép trong Audit Log: ${key}.` };
    }
  }

  if (
    typeof expectedDocId !== 'string' ||
    !VALID_DOC_ID_REGEX.test(expectedDocId) ||
    data.auditId !== expectedDocId
  ) {
    return { valid: false, reasonVi: 'Trường auditId không hợp lệ hoặc không khớp với Document ID.' };
  }

  if (typeof data.actorUid !== 'string' || !VALID_DOC_ID_REGEX.test(data.actorUid)) {
    return { valid: false, reasonVi: 'Trường actorUid trong Audit Log không hợp lệ.' };
  }

  const normalizedAdmin = adminEmail.trim().toLowerCase();
  const actorEmailLower = typeof data.actorEmail === 'string' ? data.actorEmail.trim().toLowerCase() : '';
  if (
    !actorEmailLower ||
    actorEmailLower === REVOKED_LEGACY_ADMIN_EMAIL ||
    actorEmailLower !== SOLE_ADMIN_EMAIL ||
    actorEmailLower !== normalizedAdmin
  ) {
    return {
      valid: false,
      reasonVi: 'Trường actorEmail trong Audit Log không khớp với Admin duy nhất (linhnk2013@gmail.com).',
    };
  }

  if (typeof data.targetUid !== 'string' || !VALID_DOC_ID_REGEX.test(data.targetUid)) {
    return { valid: false, reasonVi: 'Trường targetUid trong Audit Log không hợp lệ.' };
  }

  const targetEmailLower =
    typeof data.targetEmail === 'string' ? data.targetEmail.trim().toLowerCase() : '';
  if (!targetEmailLower || targetEmailLower.length < 6 || targetEmailLower.length > 254) {
    return { valid: false, reasonVi: 'Trường targetEmail trong Audit Log không hợp lệ.' };
  }

  if (
    typeof data.targetDisplayName !== 'string' ||
    data.targetDisplayName.trim().length < 1 ||
    data.targetDisplayName.trim().length > 60
  ) {
    return { valid: false, reasonVi: 'Trường targetDisplayName trong Audit Log không hợp lệ.' };
  }

  if (typeof data.timestampMs !== 'number' || !Number.isFinite(data.timestampMs) || data.timestampMs <= 0) {
    return { valid: false, reasonVi: 'Trường timestampMs trong Audit Log không hợp lệ.' };
  }

  const actionType = typeof data.actionType === 'string' ? data.actionType : undefined;

  // Nhánh 1: Sự kiện khởi tạo ADMIN duy nhất (BOOTSTRAP_SOLE_ADMIN)
  if (actionType === 'BOOTSTRAP_SOLE_ADMIN') {
    if (
      data.targetUid !== data.actorUid ||
      targetEmailLower !== SOLE_ADMIN_EMAIL ||
      targetEmailLower !== normalizedAdmin ||
      (data.previousRole !== 'PLAYER' && data.previousRole !== 'ADMIN') ||
      data.newRole !== 'ADMIN'
    ) {
      return {
        valid: false,
        reasonVi:
          'Sự kiện BOOTSTRAP_SOLE_ADMIN chỉ hợp lệ khi actorUid == targetUid, email là linhnk2013@gmail.com và newRole == ADMIN.',
      };
    }
    return { valid: true, reasonVi: null };
  }

  // Nhánh 2: Cấp/thu hồi MOD cho tài khoản khác
  if (
    actionType !== undefined &&
    actionType !== 'GRANT_MOD' &&
    actionType !== 'REVOKE_TO_PLAYER' &&
    actionType !== 'CONVERT_LEGACY_ADMIN_TO_MOD'
  ) {
    return { valid: false, reasonVi: 'Loại sự kiện actionType trong Audit Log không hợp lệ.' };
  }

  if (data.targetUid === data.actorUid) {
    return { valid: false, reasonVi: 'Trường targetUid trong Audit Log không được trùng với actorUid.' };
  }

  if (targetEmailLower === SOLE_ADMIN_EMAIL || targetEmailLower === normalizedAdmin) {
    return { valid: false, reasonVi: 'Không được phép ghi thay đổi quyền MOD/PLAYER lên tài khoản Admin duy nhất.' };
  }

  const allowedPreviousRoles = new Set(['ADMIN', 'MOD', 'PLAYER']);
  const allowedNewRoles = new Set(['MOD', 'PLAYER']);
  if (
    typeof data.previousRole !== 'string' ||
    typeof data.newRole !== 'string' ||
    !allowedPreviousRoles.has(data.previousRole) ||
    !allowedNewRoles.has(data.newRole) ||
    data.previousRole === data.newRole
  ) {
    return {
      valid: false,
      reasonVi:
        'Trường previousRole hoặc newRole trong Audit Log không hợp lệ (chỉ cho phép chuyển đổi về MOD hoặc PLAYER, không cấp thêm ADMIN/SUPER_ADMIN).',
    };
  }

  return { valid: true, reasonVi: null };
}

export interface LegacyStaffRecordInput {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
  isActive?: boolean | null;
}

export interface MigratedStaffRecordAction {
  uid: string;
  email: string;
  displayName: string;
  previousRole: string;
  newRole: UserRoleType;
  action:
    | 'PROMOTE_SOLE_ADMIN'
    | 'KEEP_SOLE_ADMIN_NOOP'
    | 'REVOKE_OLD_SUPER_ADMIN_TO_PLAYER'
    | 'CONVERT_LEGACY_ADMIN_TO_MOD'
    | 'KEEP_MOD'
    | 'KEEP_PLAYER'
    | 'FLAG_MANUAL_REVIEW';
  reasonVi: string;
  upsertedAdminDoc: {
    uid: string;
    email: string;
    displayName: string;
    role: 'ADMIN' | 'MOD' | 'PLAYER';
    isActive: boolean;
    lastAuditId: string;
    updatedBy: string;
  } | null;
  deleteAdminDoc: boolean;
  auditEntry: RoleChangeAuditEntry | null;
}

export interface SimplifiedRoleMigrationReport {
  success: boolean;
  isIdempotentNoOp: boolean;
  haltedReasonVi: string | null;
  soleAdminVerifiedUid: string | null;
  soleAdminEmail: string;
  revokedLegacyAdminEmail: string;
  beforeCount: number;
  afterCount: number;
  actions: MigratedStaffRecordAction[];
  flaggedForManualReview: MigratedStaffRecordAction[];
  auditLogs: RoleChangeAuditEntry[];
}

/**
 * M7.3.11.5 Mục 3: Migration vai trò an toàn và IDEMPOTENT sang mô hình 3 vai trò (`ADMIN`, `MOD`, `PLAYER`):
 * 1. Bắt buộc xác minh tài khoản `linhnk2013@gmail.com` đã tồn tại, đã xác minh email Google (`emailVerified === true`, `providerId === 'google.com'`)
 *    và có `uid` hợp lệ. Nếu chưa có hoặc chưa xác minh -> DỪNG migration và báo cáo rõ, tuyệt đối KHÔNG đoán UID.
 * 2. Khởi tạo `ADMIN` duy nhất cho `linhnk2013@gmail.com` kèm Audit Log `BOOTSTRAP_SOLE_ADMIN` (`newRole: 'ADMIN'`) và `lastAuditId`.
 *    Nếu bản ghi `/admins/{authUid}` đã ở trạng thái `role === 'ADMIN' && isActive === true && email === 'linhnk2013@gmail.com'` -> IDEMPOTENT NO-OP (không ghi trùng và không tạo log trùng).
 * 3. Thu hồi toàn bộ quyền `SUPER_ADMIN` / `ADMIN` của `linhnk.online@gmail.com` về `PLAYER` (`role: 'PLAYER', isActive: false`) kèm Audit Log nguyên tử.
 * 4. Chuyển các bản ghi `ADMIN` cũ khác (nếu hợp lệ, `isActive === true`) sang `MOD` kèm Audit Log hoặc đánh dấu `FLAG_MANUAL_REVIEW` nếu thiếu thông tin.
 * 5. Giữ nguyên `MOD` hợp lệ (`KEEP_MOD`, không ghi trùng).
 */
export function runSimplifiedRoleMigrationForRecords(params: {
  verifiedNewAdminAuth: {
    uid?: string | null;
    email?: string | null;
    emailVerified?: boolean;
    providerId?: string | null;
    displayName?: string | null;
  } | null;
  existingAdminRecords: LegacyStaffRecordInput[];
  convertOtherLegacyAdminsToMod?: boolean;
  nowMs?: number;
}): SimplifiedRoleMigrationReport {
  const nowMs = params.nowMs ?? Date.now();
  const auth = params.verifiedNewAdminAuth;
  const authUid = typeof auth?.uid === 'string' ? auth.uid.trim() : '';
  const authEmail = typeof auth?.email === 'string' ? auth.email.trim().toLowerCase() : '';
  const isVerifiedGoogle =
    Boolean(auth) &&
    auth?.emailVerified === true &&
    auth?.providerId === 'google.com' &&
    VALID_DOC_ID_REGEX.test(authUid) &&
    authEmail === SOLE_ADMIN_EMAIL;

  if (!isVerifiedGoogle) {
    return {
      success: false,
      isIdempotentNoOp: false,
      haltedReasonVi:
        'Dừng Migration (M7.3.11.5 Mục 2.1 & 3): Tài khoản linhnk2013@gmail.com chưa đăng nhập/xác minh Google Authentication hoặc chưa xác định được UID thực tế. Tuyệt đối không đoán UID hoặc cấp quyền cho tài khoản chưa xác minh.',
      soleAdminVerifiedUid: null,
      soleAdminEmail: SOLE_ADMIN_EMAIL,
      revokedLegacyAdminEmail: REVOKED_LEGACY_ADMIN_EMAIL,
      beforeCount: params.existingAdminRecords.length,
      afterCount: params.existingAdminRecords.length,
      actions: [],
      flaggedForManualReview: [],
      auditLogs: [],
    };
  }

  const convertLegacyAdminToMod = params.convertOtherLegacyAdminsToMod !== false;
  const actions: MigratedStaffRecordAction[] = [];
  const flaggedForManualReview: MigratedStaffRecordAction[] = [];
  const auditLogs: RoleChangeAuditEntry[] = [];
  const processedUids = new Set<string>();

  // Bước 1: Kiểm tra idempotent hồ sơ ADMIN duy nhất (linhnk2013@gmail.com) theo đúng authUid
  const existingExactAdminRec = params.existingAdminRecords.find((r) => r.uid === authUid);
  const newAdminDisplayName =
    (auth?.displayName || existingExactAdminRec?.displayName || 'linhnk2013').trim().slice(0, 60) ||
    'linhnk2013';

  const isAlreadyBootstrappedAdmin =
    Boolean(existingExactAdminRec) &&
    (existingExactAdminRec?.email || '').trim().toLowerCase() === SOLE_ADMIN_EMAIL &&
    String(existingExactAdminRec?.role || '').trim().toUpperCase() === 'ADMIN' &&
    existingExactAdminRec?.isActive === true;

  processedUids.add(authUid);

  if (isAlreadyBootstrappedAdmin) {
    actions.push({
      uid: authUid,
      email: SOLE_ADMIN_EMAIL,
      displayName: newAdminDisplayName,
      previousRole: 'ADMIN',
      newRole: 'ADMIN',
      action: 'KEEP_SOLE_ADMIN_NOOP',
      reasonVi: 'Idempotent: Hồ sơ ADMIN duy nhất (linhnk2013@gmail.com) đã được xác lập hợp lệ, không ghi trùng và không tạo Audit Log trùng.',
      upsertedAdminDoc: null,
      deleteAdminDoc: false,
      auditEntry: null,
    });
  } else {
    const bootstrapAudit = buildRoleChangeAuditEntry({
      actionType: 'BOOTSTRAP_SOLE_ADMIN',
      actorUid: authUid,
      actorEmail: SOLE_ADMIN_EMAIL,
      targetUid: authUid,
      targetEmail: SOLE_ADMIN_EMAIL,
      targetDisplayName: newAdminDisplayName,
      previousRole: 'PLAYER',
      newRole: 'ADMIN',
      timestampMs: nowMs,
      customAuditId: `audit_bootstrap_${authUid}_${nowMs}`,
    });
    auditLogs.push(bootstrapAudit);
    actions.push({
      uid: authUid,
      email: SOLE_ADMIN_EMAIL,
      displayName: newAdminDisplayName,
      previousRole: existingExactAdminRec?.role ? String(existingExactAdminRec.role) : 'PLAYER',
      newRole: 'ADMIN',
      action: 'PROMOTE_SOLE_ADMIN',
      reasonVi: 'Khởi tạo quyền ADMIN duy nhất cho tài khoản linhnk2013@gmail.com đã xác minh Google & UID kèm Audit Log BOOTSTRAP_SOLE_ADMIN.',
      upsertedAdminDoc: {
        uid: authUid,
        email: SOLE_ADMIN_EMAIL,
        displayName: newAdminDisplayName,
        role: 'ADMIN',
        isActive: true,
        lastAuditId: bootstrapAudit.auditId,
        updatedBy: SOLE_ADMIN_EMAIL,
      },
      deleteAdminDoc: false,
      auditEntry: bootstrapAudit,
    });
  }

  // Bước 2: Duyệt từng bản ghi hiện có trong /admins
  for (const rec of params.existingAdminRecords) {
    const uid = typeof rec.uid === 'string' ? rec.uid.trim() : '';
    if (!uid || processedUids.has(uid)) continue;
    processedUids.add(uid);

    const email = typeof rec.email === 'string' ? rec.email.trim().toLowerCase() : '';
    const displayName =
      typeof rec.displayName === 'string' && rec.displayName.trim().length > 0
        ? rec.displayName.trim().slice(0, 60)
        : email.includes('@')
        ? email.split('@')[0]
        : uid;
    const rawRole = typeof rec.role === 'string' ? rec.role.trim().toUpperCase() : 'UNKNOWN';

    // Nếu bản ghi đã bị thu hồi về PLAYER (isActive === false) trước đó -> Idempotent KEEP_PLAYER
    if (rawRole === 'PLAYER' && rec.isActive === false) {
      actions.push({
        uid,
        email: email || 'unknown@gmail.com',
        displayName,
        previousRole: 'PLAYER',
        newRole: 'PLAYER',
        action: 'KEEP_PLAYER',
        reasonVi: 'Idempotent: Bản ghi đã được thu hồi về PLAYER (isActive == false) trước đó.',
        upsertedAdminDoc: null,
        deleteAdminDoc: false,
        auditEntry: null,
      });
      continue;
    }

    // 2a. Thu hồi hoàn toàn đặc quyền của tài khoản cũ linhnk.online@gmail.com, bất kỳ bản ghi SUPER_ADMIN nào, hoặc bản ghi có email linhnk2013@gmail.com nhưng sai UID
    if (
      email === REVOKED_LEGACY_ADMIN_EMAIL ||
      rawRole === 'SUPER_ADMIN' ||
      (email === SOLE_ADMIN_EMAIL && uid !== authUid)
    ) {
      const safeTargetEmail =
        email === SOLE_ADMIN_EMAIL
          ? `revoked_mismatch_${uid}@gmail.com`
          : email || REVOKED_LEGACY_ADMIN_EMAIL;
      const audit = buildRoleChangeAuditEntry({
        actionType: 'REVOKE_TO_PLAYER',
        actorUid: authUid,
        actorEmail: SOLE_ADMIN_EMAIL,
        targetUid: uid,
        targetEmail: safeTargetEmail,
        targetDisplayName: displayName,
        previousRole: 'ADMIN',
        newRole: 'PLAYER',
        timestampMs: nowMs,
        customAuditId: `audit_revoke_${uid}_${nowMs}`,
      });
      auditLogs.push(audit);
      actions.push({
        uid,
        email: safeTargetEmail,
        displayName,
        previousRole: rawRole,
        newRole: 'PLAYER',
        action: 'REVOKE_OLD_SUPER_ADMIN_TO_PLAYER',
        reasonVi:
          email === SOLE_ADMIN_EMAIL && uid !== authUid
            ? 'Thu hồi bản ghi /admins có email linhnk2013@gmail.com nhưng không khớp UID thực tế đã xác minh.'
            : 'Thu hồi hoàn toàn quyền SUPER_ADMIN / ADMIN của tài khoản quản trị cũ linhnk.online@gmail.com về PLAYER.',
        upsertedAdminDoc: {
          uid,
          email: safeTargetEmail,
          displayName,
          role: 'PLAYER',
          isActive: false,
          lastAuditId: audit.auditId,
          updatedBy: SOLE_ADMIN_EMAIL,
        },
        deleteAdminDoc: true,
        auditEntry: audit,
      });
      continue;
    }

    // 2b. Xử lý các bản ghi ADMIN cũ khác
    if (rawRole === 'ADMIN') {
      if (!VALID_DOC_ID_REGEX.test(uid) || !email || rec.isActive !== true) {
        const flagged: MigratedStaffRecordAction = {
          uid,
          email: email || 'unknown',
          displayName,
          previousRole: rawRole,
          newRole: 'PLAYER',
          action: 'FLAG_MANUAL_REVIEW',
          reasonVi:
            'Bản ghi ADMIN cũ thiếu email/isActive hợp lệ: tạm ngừng đặc quyền (Fail-Closed về PLAYER) và đánh dấu kiểm tra thủ công, không tự nâng quyền.',
          upsertedAdminDoc: null,
          deleteAdminDoc: true,
          auditEntry: null,
        };
        actions.push(flagged);
        flaggedForManualReview.push(flagged);
        continue;
      }

      if (convertLegacyAdminToMod) {
        const audit = buildRoleChangeAuditEntry({
          actionType: 'CONVERT_LEGACY_ADMIN_TO_MOD',
          actorUid: authUid,
          actorEmail: SOLE_ADMIN_EMAIL,
          targetUid: uid,
          targetEmail: email,
          targetDisplayName: displayName,
          previousRole: 'ADMIN',
          newRole: 'MOD',
          timestampMs: nowMs,
          customAuditId: `audit_convert_mod_${uid}_${nowMs}`,
        });
        auditLogs.push(audit);
        actions.push({
          uid,
          email,
          displayName,
          previousRole: 'ADMIN',
          newRole: 'MOD',
          action: 'CONVERT_LEGACY_ADMIN_TO_MOD',
          reasonVi:
            'Chuyển bản ghi ADMIN cũ đang hoạt động sang MOD theo chính sách M7.3.11.4 (chỉ duy trì 1 ADMIN duy nhất là linhnk2013@gmail.com).',
          upsertedAdminDoc: {
            uid,
            email,
            displayName,
            role: 'MOD',
            isActive: true,
            lastAuditId: audit.auditId,
            updatedBy: SOLE_ADMIN_EMAIL,
          },
          deleteAdminDoc: false,
          auditEntry: audit,
        });
      } else {
        const flagged: MigratedStaffRecordAction = {
          uid,
          email,
          displayName,
          previousRole: 'ADMIN',
          newRole: 'PLAYER',
          action: 'FLAG_MANUAL_REVIEW',
          reasonVi: 'Đánh dấu bản ghi ADMIN cũ để xử lý thủ công và thu hồi về PLAYER.',
          upsertedAdminDoc: null,
          deleteAdminDoc: true,
          auditEntry: null,
        };
        actions.push(flagged);
        flaggedForManualReview.push(flagged);
      }
      continue;
    }

    // 2c. Giữ nguyên MOD hợp lệ (Idempotent: không ghi đè lại nếu đã là MOD hợp lệ)
    if (rawRole === 'MOD' && rec.isActive === true && VALID_DOC_ID_REGEX.test(uid)) {
      actions.push({
        uid,
        email,
        displayName,
        previousRole: 'MOD',
        newRole: 'MOD',
        action: 'KEEP_MOD',
        reasonVi: 'Idempotent: Giữ nguyên vai trò MOD hợp lệ hiện có.',
        upsertedAdminDoc: null,
        deleteAdminDoc: false,
        auditEntry: null,
      });
      continue;
    }

    // 2d. Bản ghi không rõ ràng hoặc đã ngừng kích hoạt -> đánh dấu kiểm tra thủ công & Fail-Closed về PLAYER
    const flagged: MigratedStaffRecordAction = {
      uid,
      email: email || 'unknown',
      displayName,
      previousRole: rawRole,
      newRole: 'PLAYER',
      action: 'FLAG_MANUAL_REVIEW',
      reasonVi: 'Bản ghi trong /admins không rõ ràng hoặc isActive !== true: Fail-Closed về PLAYER và đánh dấu xử lý thủ công.',
      upsertedAdminDoc: null,
      deleteAdminDoc: true,
      auditEntry: null,
    };
    actions.push(flagged);
    flaggedForManualReview.push(flagged);
  }

  const afterActiveDocsCount = actions.filter(
    (a) => a.newRole === 'ADMIN' || a.newRole === 'MOD'
  ).length;
  const hasAnyWriteMutation = actions.some((a) => a.upsertedAdminDoc !== null);

  return {
    success: true,
    isIdempotentNoOp: !hasAnyWriteMutation,
    haltedReasonVi: null,
    soleAdminVerifiedUid: authUid,
    soleAdminEmail: SOLE_ADMIN_EMAIL,
    revokedLegacyAdminEmail: REVOKED_LEGACY_ADMIN_EMAIL,
    beforeCount: params.existingAdminRecords.length,
    afterCount: afterActiveDocsCount,
    actions,
    flaggedForManualReview,
    auditLogs,
  };
}

const roleChangeAuditLogs: RoleChangeAuditEntry[] = [];

export function commitRoleChangeAuditEntry(entry: RoleChangeAuditEntry): RoleChangeAuditEntry {
  roleChangeAuditLogs.unshift(entry);
  if (roleChangeAuditLogs.length > 200) {
    roleChangeAuditLogs.length = 200;
  }
  return entry;
}

export function recordRoleChangeAudit(
  entry: Omit<RoleChangeAuditEntry, 'auditId'>
): RoleChangeAuditEntry {
  const fullEntry = buildRoleChangeAuditEntry(entry);
  return commitRoleChangeAuditEntry(fullEntry);
}

export function getRoleChangeAuditLogs(): RoleChangeAuditEntry[] {
  return [...roleChangeAuditLogs];
}

export function clearRoleChangeAuditLogsForTesting(): void {
  roleChangeAuditLogs.length = 0;
}

