/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.8 MỤC IX – QUẢN LÝ BẠN BÈ TRONG CÀI ĐẶT ADMIN (RBAC 3 CẤP: ADMIN / MOD / PLAYER)
 * - ADMIN duy nhất (`linhnk2013@gmail.com`): xem toàn bộ, tìm kiếm, kiểm tra cặp, xóa quan hệ bạn bè kèm xác nhận & Audit Log.
 * - MOD: chỉ xem (read-only), tuyệt đối không hiển thị hoặc cho phép nút xóa.
 * - PLAYER: không có quyền truy cập.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import {
  SocialManager,
  type FriendshipRecord,
} from '../core/socialManager.ts';
import {
  resolveUserRole,
  type AuthIdentityLike,
} from '../core/authManager.ts';
import { useLanguage } from '../core/i18n.ts';

interface FriendsAdminPanelProps {
  currentUser: AuthIdentityLike | null;
}

export const FriendsAdminPanel: React.FC<FriendsAdminPanelProps> = ({ currentUser }) => {
  const { t } = useLanguage();
  const social = useMemo(() => SocialManager.getInstance(), []);
  const role = resolveUserRole(currentUser);
  const canDelete = role === 'ADMIN';
  const canView = role === 'ADMIN' || role === 'MOD';

  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [inspectAccountUid, setInspectAccountUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FriendshipRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('Quản trị viên gỡ quan hệ bạn bè');

  const loadList = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = searchKeyword.trim()
        ? await social.adminSearchFriendships(currentUser, searchKeyword)
        : await social.adminListAllFriendships(currentUser);
      if (!res.success) {
        setErrorMsg(res.message || t('Không thể tải danh sách bạn bè.', 'Failed to load friendships.'));
      } else {
        setFriendships(res.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [canView, currentUser, searchKeyword, social, t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  if (!canView) {
    return (
      <div className="p-4 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs">
        {t('Bạn không có quyền truy cập mục Quản lý bạn bè.', 'Permission denied.')}
      </div>
    );
  }

  const displayedFriendships = inspectAccountUid
    ? friendships.filter(
        (f) => f.userA === inspectAccountUid || f.userB === inspectAccountUid
      )
    : friendships;

  const handleConfirmDelete = async () => {
    if (!pendingDelete || !canDelete) return;
    setErrorMsg(null);
    setStatusMsg(null);
    const target = pendingDelete;
    setPendingDelete(null);
    const res = await social.adminDeleteFriendship(
      currentUser,
      target.userA,
      target.userB,
      deleteReason.trim() || 'Quản trị viên gỡ quan hệ bạn bè'
    );
    if (!res.success) {
      setErrorMsg(res.message || t('Xóa quan hệ bạn bè thất bại.', 'Delete failed.'));
      return;
    }
    setStatusMsg(res.message || t('Đã xóa quan hệ bạn bè và ghi nhận Audit Log.', 'Friendship removed & logged.'));
    await loadList();
  };

  return (
    <div data-testid="admin-friends-panel" className="space-y-4">
      <div className="p-3.5 rounded-xl bg-[#050510] border border-[#00F0FF]/35 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Users className="w-5 h-5 text-[#00F0FF]" />
          <div>
            <h4 className="font-btn text-sm font-black uppercase tracking-wider text-white">
              {t('Quản lý bạn bè toàn hệ thống', 'System Friends Management')}
            </h4>
            <p className="text-[11px] text-neutral-400">
              {canDelete
                ? t(
                    'Quyền ADMIN: Xem, kiểm tra cặp tài khoản và xóa quan hệ bạn bè (kèm Audit Log, không xóa tài khoản hay lịch sử chat).',
                    'ADMIN access: View, inspect pairs, and delete friendships (with Audit Log; accounts and chat history remain intact).'
                  )
                : t(
                    'Quyền MOD (Chỉ xem): Có thể tra cứu danh sách bạn bè, không có quyền xóa quan hệ bạn bè.',
                    'MOD read-only access: Can inspect friendships; deletion is restricted to ADMIN.'
                  )}
            </p>
          </div>
        </div>
        <span
          className={`px-2.5 py-1 rounded text-[10px] font-btn font-black uppercase border ${
            canDelete
              ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300'
              : 'bg-sky-950/70 border-sky-500/50 text-sky-300'
          }`}
        >
          <Shield className="w-3 h-3 inline mr-1" />
          {role}
        </span>
      </div>

      {/* Search & Inspect Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('Tìm theo tên tài khoản A / B...', 'Search account A / B name...')}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-neutral-950 border border-neutral-700 focus:border-[#00F0FF] focus:outline-none text-xs text-white"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-btn font-bold text-xs flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{t('Làm mới', 'Refresh')}</span>
        </button>
        {inspectAccountUid && (
          <button
            type="button"
            onClick={() => setInspectAccountUid(null)}
            className="px-3 py-2 rounded-lg bg-amber-950/60 border border-amber-500/50 text-amber-300 font-btn font-bold text-xs cursor-pointer"
          >
            {t('Bỏ lọc tài khoản', 'Clear account filter')}
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Friendships Table / List */}
      <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
        {displayedFriendships.length === 0 ? (
          <div className="p-6 rounded-xl bg-neutral-950/60 border border-neutral-800 text-center text-xs text-neutral-400">
            {t('Không tìm thấy quan hệ bạn bè nào.', 'No friendship records found.')}
          </div>
        ) : (
          displayedFriendships.map((f) => (
            <div
              key={f.pairId}
              className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setInspectAccountUid(f.userA)}
                    className="font-btn font-bold text-[#00F0FF] hover:underline cursor-pointer"
                    title={t('Xem tất cả bạn bè của tài khoản A', 'Inspect Account A friends')}
                  >
                    {f.userADisplayName}
                  </button>
                  <span className="text-neutral-500 font-bold">↔</span>
                  <button
                    type="button"
                    onClick={() => setInspectAccountUid(f.userB)}
                    className="font-btn font-bold text-[#FFB800] hover:underline cursor-pointer"
                    title={t('Xem tất cả bạn bè của tài khoản B', 'Inspect Account B friends')}
                  >
                    {f.userBDisplayName}
                  </button>
                </div>
                <p className="text-[11px] text-neutral-400">
                  {t('Trạng thái:', 'Status:')}{' '}
                  <span className="text-emerald-400 font-semibold">{t('Đang là bạn bè', 'Active Friends')}</span>
                  {' • '}
                  {t('Ngày tạo:', 'Created:')}{' '}
                  {new Date(f.createdAtMs).toLocaleString('vi-VN')}
                </p>
              </div>

              {canDelete && (
                <button
                  type="button"
                  data-testid={`admin-delete-friendship-${f.pairId}`}
                  onClick={() => setPendingDelete(f)}
                  className="px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-600 border border-red-500/50 text-red-200 hover:text-white font-btn font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('Xóa quan hệ bạn bè', 'Delete Friendship')}</span>
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Confirmation Popup Modal */}
      {pendingDelete && canDelete && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0b0d1e] border-2 border-red-500/60 rounded-xl p-5 space-y-4 shadow-2xl">
            <h4 className="font-btn text-sm font-black uppercase text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{t('Xác nhận xóa quan hệ bạn bè', 'Confirm Delete Friendship')}</span>
            </h4>
            <p className="text-xs text-[#EAF4FF]/85 leading-relaxed">
              {t(
                `Bạn sắp xóa quan hệ bạn bè giữa ${pendingDelete.userADisplayName} và ${pendingDelete.userBDisplayName}. Thao tác này cập nhật đồng nhất cả hai phía và ghi Audit Log. Tài khoản, lịch sử chat và trạng thái Block sẽ KHÔNG bị ảnh hưởng.`,
                `You are about to remove the friendship between ${pendingDelete.userADisplayName} and ${pendingDelete.userBDisplayName}. Both sides will be updated atomically with an Audit Log entry. Accounts, chat history, and Block states will NOT be affected.`
              )}
            </p>
            <div>
              <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                {t('Lý do ghi vào Audit Log:', 'Audit Log Reason:')}
              </label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#050510] border border-neutral-700 text-xs text-white"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3.5 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-btn font-bold text-xs cursor-pointer"
              >
                {t('Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                data-testid="admin-confirm-delete-friendship-btn"
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 rounded bg-red-600 hover:bg-red-500 text-white font-btn font-black text-xs cursor-pointer"
              >
                {t('Xác nhận xóa', 'Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
