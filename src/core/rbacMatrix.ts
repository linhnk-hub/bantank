/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.3.11 – CENTRALIZED RBAC PERMISSION MATRIX & AUDIT LOG
 *
 * Nguyên tắc bảo mật:
 * 1. Tập trung toàn bộ kiểm tra quyền của hệ thống tại một ma trận duy nhất (Single Source of Truth).
 * 2. Mặc định từ chối (Default-Deny) nếu vai trò không xác định, không hợp lệ hoặc quyền chưa triển khai.
 * 3. Tuyệt đối không tin tưởng dữ liệu tự sửa trong localStorage; vai trò phải được xác thực từ Google Auth + Firestore.
 * 4. Ghi nhật ký đầy đủ mọi thao tác cấp/thu hồi quyền (người thực hiện, tài khoản đích, quyền cũ, quyền mới, thời gian).
 */

import type { UserRoleType } from './authManager.ts';

export type UserRole = UserRoleType;

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
  SUPER_ADMIN: boolean;
  ADMIN: boolean;
  MOD: boolean;
  PLAYER: boolean;
}

/**
 * Ma trận phân quyền tập trung (M7.3.11 Mục IV.1 & IV.2):
 * Liệt kê đầy đủ các quyền thực tế của Super Admin, Admin, Mod và Người chơi thường.
 * Các quyền chưa có chức năng quản trị thực tế được ghi rõ `Chưa triển khai` và mặc định từ chối (`false`).
 */
export const RBAC_PERMISSION_MATRIX: readonly PermissionMatrixRow[] = Object.freeze([
  {
    id: 'VIEW_ACCOUNT_LIST',
    category: 'Tài khoản & Kiểm duyệt',
    nameVi: 'Xem danh sách tài khoản',
    descriptionVi: 'Truy cập danh sách tài khoản người chơi có phân trang (10 tài khoản/trang).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
    ADMIN: true,
    MOD: true,
    PLAYER: false,
  },
  {
    id: 'MANAGE_PLAYER_ACCOUNT',
    category: 'Tài khoản & Kiểm duyệt',
    nameVi: 'Quản lý tài khoản người chơi',
    descriptionVi: 'Kiểm duyệt thông tin hiển thị và trạng thái hoạt động của tài khoản người chơi.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
    ADMIN: true,
    MOD: true,
    PLAYER: false,
  },
  {
    id: 'GRANT_REVOKE_ADMIN',
    category: 'Phân quyền Hệ thống',
    nameVi: 'Cấp/thu hồi quyền Admin',
    descriptionVi: 'Cấp quyền Admin cho người chơi hoặc thu hồi quyền Admin về Người chơi (Chỉ Super Admin).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'GRANT_REVOKE_MOD',
    category: 'Phân quyền Hệ thống',
    nameVi: 'Cấp/thu hồi quyền Mod',
    descriptionVi: 'Cấp quyền Mod cho người chơi hoặc thu hồi quyền Mod về Người chơi (Chỉ Super Admin).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
    ADMIN: false,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
    ADMIN: true,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_AUDIO_SYSTEM',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý âm thanh',
    descriptionVi: 'Upload, thay thế, xóa nhạc nền hệ thống (BGM) và âm thanh hành động (Action SFX) (Chỉ Super Admin).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_AVATAR_CATALOG',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý avatar',
    descriptionVi: 'Upload, thay thế phiên bản, ẩn/hiện và xóa Avatar trong Danh mục dùng chung (Chỉ Super Admin).',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
  {
    id: 'MANAGE_SYSTEM_SETTINGS',
    category: 'Tài nguyên & Hệ thống',
    nameVi: 'Quản lý cài đặt hệ thống',
    descriptionVi: 'Cấu hình chế độ chơi ưu tiên và thiết lập vận hành chung.',
    status: 'DEPLOYED',
    statusLabelVi: 'Đã triển khai',
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: true,
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
    SUPER_ADMIN: false,
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
    SUPER_ADMIN: false,
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
    SUPER_ADMIN: false,
    ADMIN: false,
    MOD: false,
    PLAYER: false,
  },
]);

/**
 * Kiểm tra quyền tập trung theo nguyên tắc Default-Deny (M7.3.11 Mục IV.3).
 * - Nếu role không hợp lệ hoặc không rõ ràng -> trả về `false`.
 * - Nếu quyền có trạng thái `NOT_DEPLOYED` (Chưa triển khai) -> trả về `false`.
 */
export function hasRolePermission(
  role: UserRoleType | string | null | undefined,
  permissionId: PermissionId
): boolean {
  if (!role || typeof role !== 'string') return false;
  const normalizedRole = role.trim().toUpperCase() as UserRoleType;
  if (
    normalizedRole !== 'SUPER_ADMIN' &&
    normalizedRole !== 'ADMIN' &&
    normalizedRole !== 'MOD' &&
    normalizedRole !== 'PLAYER'
  ) {
    return false;
  }

  const row = RBAC_PERMISSION_MATRIX.find((r) => r.id === permissionId);
  if (!row) return false;
  if (row.status !== 'DEPLOYED') return false;

  return Boolean(row[normalizedRole]);
}

export function getPermissionsForRole(role: UserRoleType): PermissionId[] {
  return RBAC_PERMISSION_MATRIX.filter(
    (row) => row.status === 'DEPLOYED' && Boolean(row[role])
  ).map((row) => row.id);
}

export interface RoleAssignmentValidationResult {
  allowed: boolean;
  reasonVi: string | null;
}

/**
 * Kiểm tra nghiêm ngặt thao tác cấp/thu hồi quyền ở tầng nghiệp vụ/dữ liệu (M7.3.11 Mục II.3 & IV.3):
 * - Chỉ Super Admin (`SUPER_ADMIN`) mới được phép thay đổi quyền.
 * - Không cho phép cấp quyền `SUPER_ADMIN` thông qua danh sách tài khoản.
 * - Không cho phép tự thay đổi quyền của chính mình (`actorUid === targetUid`).
 * - Không cho phép hạ cấp hoặc xóa Super Admin duy nhất (`linhnk.online@gmail.com`).
 */
export function validateRoleAssignmentChange(params: {
  actorRole: UserRoleType;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail: string;
  currentTargetRole: UserRoleType;
  newRole: UserRoleType | string;
  superAdminEmail: string;
}): RoleAssignmentValidationResult {
  const {
    actorRole,
    actorUid,
    actorEmail,
    targetUid,
    targetEmail,
    currentTargetRole,
    newRole,
    superAdminEmail,
  } = params;

  const normalizedActorEmail = (actorEmail || '').trim().toLowerCase();
  const normalizedTargetEmail = (targetEmail || '').trim().toLowerCase();
  const normalizedSuperAdmin = (superAdminEmail || '').trim().toLowerCase();

  // 1. Chỉ Super Admin hợp lệ mới được phép cấp/thu hồi quyền
  if (actorRole !== 'SUPER_ADMIN' || normalizedActorEmail !== normalizedSuperAdmin) {
    return {
      allowed: false,
      reasonVi:
        'Từ chối truy cập: Chỉ Super Admin duy nhất mới có quyền cấp hoặc thu hồi quyền Admin/Mod.',
    };
  }

  // 2. Không cho phép tự sửa quyền của chính mình
  if (!targetUid || actorUid === targetUid) {
    return {
      allowed: false,
      reasonVi: 'Không được phép tự thay đổi vai trò của chính tài khoản đang đăng nhập.',
    };
  }

  // 3. Không được hạ cấp hoặc thay đổi tài khoản Super Admin
  if (
    currentTargetRole === 'SUPER_ADMIN' ||
    normalizedTargetEmail === normalizedSuperAdmin
  ) {
    return {
      allowed: false,
      reasonVi: 'Bảo vệ an toàn hệ thống: Không được phép hạ cấp hoặc thu hồi quyền của Super Admin.',
    };
  }

  // 4. Không cho phép cấp quyền SUPER_ADMIN qua danh sách tài khoản
  if (newRole === 'SUPER_ADMIN') {
    return {
      allowed: false,
      reasonVi: 'Không được phép cấp quyền Super Admin thông qua danh sách tài khoản.',
    };
  }

  if (newRole !== 'ADMIN' && newRole !== 'MOD' && newRole !== 'PLAYER') {
    return {
      allowed: false,
      reasonVi: 'Vai trò đích không hợp lệ (chỉ chấp nhận Admin, Mod hoặc Người chơi).',
    };
  }

  // 5. Kiểm tra theo ma trận quyền tập trung
  if (
    (newRole === 'ADMIN' || currentTargetRole === 'ADMIN') &&
    !hasRolePermission(actorRole, 'GRANT_REVOKE_ADMIN')
  ) {
    return {
      allowed: false,
      reasonVi: 'Tài khoản hiện tại không có quyền GRANT_REVOKE_ADMIN.',
    };
  }

  if (
    (newRole === 'MOD' || currentTargetRole === 'MOD') &&
    !hasRolePermission(actorRole, 'GRANT_REVOKE_MOD')
  ) {
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

/**
 * Nhật ký kiểm toán thay đổi quyền (M7.3.11 Mục II.3 & IV.3):
 * Ghi lại: người thực hiện, tài khoản được thay đổi, quyền cũ, quyền mới, thời gian.
 */
export interface RoleChangeAuditEntry {
  auditId: string;
  actorUid: string;
  actorEmail: string;
  targetUid: string;
  targetEmail: string;
  targetDisplayName: string;
  previousRole: UserRoleType;
  newRole: UserRoleType;
  timestampMs: number;
}

const roleChangeAuditLogs: RoleChangeAuditEntry[] = [];

export function recordRoleChangeAudit(
  entry: Omit<RoleChangeAuditEntry, 'auditId'>
): RoleChangeAuditEntry {
  const fullEntry: RoleChangeAuditEntry = {
    ...entry,
    auditId: `audit_${entry.timestampMs}_${Math.random().toString(36).slice(2, 8)}`,
  };
  roleChangeAuditLogs.unshift(fullEntry);
  if (roleChangeAuditLogs.length > 200) {
    roleChangeAuditLogs.length = 200;
  }
  return fullEntry;
}

export function getRoleChangeAuditLogs(): RoleChangeAuditEntry[] {
  return [...roleChangeAuditLogs];
}

export function clearRoleChangeAuditLogsForTesting(): void {
  roleChangeAuditLogs.length = 0;
}
