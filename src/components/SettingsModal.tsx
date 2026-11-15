/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Music,
  Sliders,
  User,
  Check,
  RefreshCw,
  Lock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Save,
  Camera,
  Sparkles,
  Image as ImageIcon,
  Gamepad2,
  Shield,
  Users,
  ChevronLeft,
  ChevronRight,
  Activity,
  Terminal,
  Trophy,
  Award,
  Clock,
  History,
} from 'lucide-react';
import { SoundManager, type AudioSettings } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';
import { StageProgressionManager } from '../core/stageProgression.ts';
import { TOTAL_CAMPAIGN_STAGES } from '../core/campaignStages.ts';
import {
  AvatarManager,
  type AvatarCatalogItem,
  type UserProfileAvatarMetadata,
} from '../core/avatarManager.ts';
import {
  AuthManager,
  SUPER_ADMIN_EMAIL,
  USER_ACCOUNTS_PAGE_SIZE,
  resolveUserRole,
  getRoleNameFrameClasses,
  getRoleDisplayInfo,
  RBAC_PERMISSION_MATRIX,
  hasRolePermission,
  getRoleChangeAuditLogs,
  type UserAccountSummary,
  type UserRole,
} from '../core/authManager.ts';
import {
  PlayerStatsManager,
  type PlayerFullStatisticsSnapshot,
} from '../core/playerStatsManager.ts';
import { MusicAdminPanel } from './MusicAdminPanel.tsx';
import { StageEditorPanel } from './StageEditorPanel.tsx';
import { SystemLogsAdminPanel } from './SystemLogsAdminPanel.tsx';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import {
  getShowOnlineNetStatsPreference,
  setShowOnlineNetStatsPreference,
} from '../core/networkStatsPref.ts';

export type SettingsTabId =
  | 'ACCOUNT'
  | 'IMAGE_SETTINGS'
  | 'AUDIO_SETTINGS'
  | 'GAME_MODE_SETTINGS'
  | 'ADMIN_OTHER'
  | 'USER_ACCOUNTS'
  | 'SYSTEM_LOGS';

/**
 * M7.3.11.6 Section 3: Kích thước khung chuẩn đồng nhất cho tất cả các mục con trong Cài đặt hệ thống
 * (Lấy kích thước mục Tài khoản `max-w-4xl` làm chuẩn chung).
 */
export const UNIFIED_SETTINGS_MODAL_WIDTH_CLASS = 'w-full max-w-4xl';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (diff: 'DEFAULT' | 'EXTREME') => void;
  isSuperAdmin?: boolean;
  user?: {
    uid?: string;
    email: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    photoURL?: string | null;
    role?: string | null;
  } | null;
  onProfileUpdated?: () => void;
}

/**
 * M7.3.7 & M7.3.9 Mục 3 & 4: Trả về danh sách các mục trong Cài đặt Hệ thống theo đúng quyền hạn thực tế:
 * - Các phân mục gốc M7.3.7: Tài khoản cá nhân, Cài đặt hình ảnh, Cài đặt âm thanh, Cài đặt chế độ chơi, Quản trị & Phân quyền.
 * - Người chơi thường chỉ thấy: `Thông tin` (`ACCOUNT`) và `Âm thanh` (`AUDIO_SETTINGS`).
 * - Tuyệt đối ẩn và chặn truy cập `Chế độ chơi` (`GAME_MODE_SETTINGS`), `Hình ảnh` (`IMAGE_SETTINGS`),
 *   `Cấp quyền` (`ADMIN_OTHER`) và `Tài khoản` (`USER_ACCOUNTS`) đối với người chơi thường.
 */
export function getAvailableSettingsTabsForRole(
  roleOrIsSuperAdmin: boolean | UserRole
): Array<{
  id: SettingsTabId;
  label: string;
  adminOnly: boolean;
}> {
  const effectiveRole: UserRole =
    typeof roleOrIsSuperAdmin === 'boolean'
      ? roleOrIsSuperAdmin
        ? 'ADMIN'
        : 'PLAYER'
      : roleOrIsSuperAdmin;

  const tabs: Array<{ id: SettingsTabId; label: string; adminOnly: boolean }> = [
    {
      id: 'ACCOUNT',
      label: 'Thông tin',
      adminOnly: false,
    },
  ];

  if (hasRolePermission(effectiveRole, 'MANAGE_AVATAR_CATALOG')) {
    tabs.push({
      id: 'IMAGE_SETTINGS',
      label: 'Hình ảnh',
      adminOnly: true,
    });
  }

  tabs.push({
    id: 'AUDIO_SETTINGS',
    label: 'Media',
    adminOnly: false,
  });

  if (hasRolePermission(effectiveRole, 'MANAGE_STAGES')) {
    tabs.push({
      id: 'GAME_MODE_SETTINGS',
      label: 'Chế độ chơi',
      adminOnly: true,
    });
  }

  if (hasRolePermission(effectiveRole, 'VIEW_AUDIT_AND_MONITORING')) {
    tabs.push({
      id: 'ADMIN_OTHER',
      label: 'Cấp quyền',
      adminOnly: true,
    });
  }

  if (hasRolePermission(effectiveRole, 'VIEW_ACCOUNT_LIST')) {
    tabs.push({
      id: 'USER_ACCOUNTS',
      label: 'Tài khoản',
      adminOnly: true,
    });
  }

  // M7.5.1 PHẦN 4: Mục LOG HỆ THỐNG chỉ dành riêng cho duy nhất ADMIN (linhnk2013@gmail.com)
  if (effectiveRole === 'ADMIN') {
    tabs.push({
      id: 'SYSTEM_LOGS',
      label: 'LOG HỆ THỐNG',
      adminOnly: true,
    });
  }

  return tabs;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab,
  difficulty = 'DEFAULT',
  onDifficultyChange,
  isSuperAdmin = false,
  user: propUser,
  onProfileUpdated,
}) => {
  const soundManager = SoundManager.getInstance();
  const musicManager = MusicManager.getInstance();
  const avatarManager = AvatarManager.getInstance();
  const authManager = AuthManager.getInstance();

  const currentUser = propUser ?? authManager.getCurrentUser();
  const currentUid = (currentUser as any)?.uid || authManager.getCurrentUser()?.uid || '';
  const isVerifiedSuperAdmin =
    isSuperAdmin &&
    Boolean(currentUser?.email && currentUser.email.toLowerCase() === SUPER_ADMIN_EMAIL);

  const userRole = resolveUserRole(currentUser);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);

  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab || 'ACCOUNT');

  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    soundManager.getSettings()
  );
  const [showOnlineNetStats, setShowOnlineNetStats] = useState<boolean>(() =>
    getShowOnlineNetStatsPreference()
  );
  const [showMusicAdmin, setShowMusicAdmin] = useState<boolean>(true);

  // Account & Player Avatar selection state
  const [displayName, setDisplayName] = useState<string>('');
  const [userMeta, setUserMeta] = useState<UserProfileAvatarMetadata | null>(() =>
    avatarManager.getUserMetadata(currentUid)
  );
  const [activeCatalog, setActiveCatalog] = useState<AvatarCatalogItem[]>(() =>
    avatarManager.getCatalogItems(false)
  );
  const [allCatalog, setAllCatalog] = useState<AvatarCatalogItem[]>(() =>
    avatarManager.getCatalogItems(true)
  );
  const [, setRenderTick] = useState<number>(0);
  const [avatarLoadError, setAvatarLoadError] = useState<boolean>(false);
  const [brokenCatalogIds, setBrokenCatalogIds] = useState<Record<string, boolean>>({});
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const playerStatsManager = PlayerStatsManager.getInstance();
  const [playerStats, setPlayerStats] = useState<PlayerFullStatisticsSnapshot>(() =>
    playerStatsManager.getPlayerStatisticsSnapshot(currentUid)
  );

  // User Accounts Pagination & Role Assignment state (M7.3.11 Mục II)
  const [accountsPageList, setAccountsPageList] = useState<UserAccountSummary[]>([]);
  const [accountsPageIndex, setAccountsPageIndex] = useState<number>(0);
  const [accountsCursorHistory, setAccountsCursorHistory] = useState<Array<unknown | null>>([null]);
  const [accountsHasNextPage, setAccountsHasNextPage] = useState<boolean>(false);
  const [accountsNextCursor, setAccountsNextCursor] = useState<unknown | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountsRoleFeedback, setAccountsRoleFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingRoleChangeConfirm, setPendingRoleChangeConfirm] = useState<{
    account: UserAccountSummary;
    newRole: 'MOD' | 'PLAYER';
    label: string;
  } | null>(null);
  const [isChangingRole, setIsChangingRole] = useState<boolean>(false);

  const canViewAccountsTab =
    isVerifiedSuperAdmin || hasRolePermission(userRole, 'VIEW_ACCOUNT_LIST');
  const canManageStagesTab =
    isVerifiedSuperAdmin || hasRolePermission(userRole, 'MANAGE_STAGES');
  const canViewPermissionMatrixTab =
    isVerifiedSuperAdmin || hasRolePermission(userRole, 'VIEW_AUDIT_AND_MONITORING');

  const loadUserAccountsPage = async (targetPageIndex: number, cursor: unknown | null) => {
    if (!canViewAccountsTab) return;
    setIsLoadingAccounts(true);
    setAccountsError(null);
    try {
      const res = await authManager.fetchPaginatedUserAccounts({
        pageSize: USER_ACCOUNTS_PAGE_SIZE,
        cursor,
      });
      if (!res.success) {
        setAccountsError(res.errorMessage || 'Không thể tải danh sách tài khoản.');
      } else {
        setAccountsPageList(res.accounts);
        setAccountsPageIndex(targetPageIndex);
        setAccountsHasNextPage(res.hasNextPage);
        setAccountsNextCursor(res.nextCursor);
      }
    } catch (err: any) {
      setAccountsError(err?.message || 'Lỗi tải danh sách tài khoản.');
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleConfirmRoleChange = async () => {
    if (!pendingRoleChangeConfirm || isChangingRole) return;
    setIsChangingRole(true);
    setAccountsRoleFeedback(null);
    try {
      const res = await authManager.changeUserRole({
        targetUid: pendingRoleChangeConfirm.account.uid,
        targetEmail: pendingRoleChangeConfirm.account.email,
        targetDisplayName: pendingRoleChangeConfirm.account.displayName,
        currentTargetRole: pendingRoleChangeConfirm.account.role,
        newRole: pendingRoleChangeConfirm.newRole,
      });
      setAccountsRoleFeedback({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? `Đã cập nhật vai trò cho ${pendingRoleChangeConfirm.account.email || pendingRoleChangeConfirm.account.uid} thành ${pendingRoleChangeConfirm.label}.`
          : res.errorMessage || 'Không thể cập nhật vai trò.',
      });
      if (res.success) {
        setPendingRoleChangeConfirm(null);
        await loadUserAccountsPage(
          accountsPageIndex,
          accountsCursorHistory[accountsPageIndex] ?? null
        );
      }
    } finally {
      setIsChangingRole(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const authUser = authManager.getCurrentUser() || currentUser;
    const uid = (authUser as any)?.uid || '';
    void avatarManager.recoverPendingUploadsOnStartup();
    avatarManager.observeCatalog();
    if (uid) {
      avatarManager.observeUserMetadata(uid);
      void avatarManager.fetchUserMetadataOnce(uid);
    }
    const meta = avatarManager.getUserMetadata(uid);
    setDisplayName(meta?.displayName || authUser?.displayName || '');
    setAvatarLoadError(false);
    setFeedback(null);
    setAccountsRoleFeedback(null);
    setPendingRoleChangeConfirm(null);

    const allowedIds = getAvailableSettingsTabsForRole(
      isVerifiedSuperAdmin ? 'ADMIN' : userRole
    ).map((t) => t.id);

    if (initialTab && allowedIds.includes(initialTab)) {
      setActiveTab(initialTab);
    } else if (!allowedIds.includes(activeTab)) {
      setActiveTab(allowedIds[0] || 'AUDIO_SETTINGS');
    }
  }, [isOpen, currentUid, isVerifiedSuperAdmin, userRole, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && activeTab === 'USER_ACCOUNTS' && canViewAccountsTab) {
      setAccountsCursorHistory([null]);
      void loadUserAccountsPage(0, null);
    }
  }, [isOpen, activeTab, canViewAccountsTab]);

  useEffect(() => {
    setPlayerStats(playerStatsManager.getPlayerStatisticsSnapshot(currentUid));
    const unsubAvatar = avatarManager.subscribe(() => {
      const uid = authManager.getCurrentUser()?.uid || currentUid;
      setUserMeta(avatarManager.getUserMetadata(uid));
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setAllCatalog(avatarManager.getCatalogItems(true));
      setRenderTick((t) => t + 1);
    });
    const unsubSound = soundManager.subscribe(() => {
      setAudioSettings(soundManager.getSettings());
    });
    const unsubStats = playerStatsManager.subscribe(() => {
      const uid = authManager.getCurrentUser()?.uid || currentUid;
      setPlayerStats(playerStatsManager.getPlayerStatisticsSnapshot(uid));
    });
    return () => {
      unsubAvatar();
      unsubSound();
      unsubStats();
    };
  }, [avatarManager, authManager, currentUid, soundManager, playerStatsManager]);

  if (!isOpen) return null;

  const canShowAdminMusic = isVerifiedSuperAdmin && musicManager.canManageMusic();

  const effectiveAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: currentUid,
    photoURL: currentUser?.photoURL,
  });

  const selectedAvatarType = userMeta?.avatarType || 'google';
  const selectedCatalogId =
    selectedAvatarType === 'catalog' ? userMeta?.avatarId || null : null;
  const isSelectedCatalogActive = Boolean(
    selectedCatalogId && activeCatalog.some((item) => item.avatarId === selectedCatalogId)
  );

  const handleBgmToggle = () => {
    soundManager.unlock();
    const updated = { ...audioSettings, bgmEnabled: !audioSettings.bgmEnabled };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
    musicManager.onVolumeOrToggleChanged();
  };

  const handleSfxToggle = () => {
    soundManager.unlock();
    const updated = { ...audioSettings, sfxEnabled: !audioSettings.sfxEnabled };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
  };

  const handleBgmVolChange = (val: number) => {
    const updated = { ...audioSettings, bgmVolume: val };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
    musicManager.onVolumeOrToggleChanged();
  };

  const handleSfxVolChange = (val: number) => {
    const updated = { ...audioSettings, sfxVolume: val };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
  };

  const handleResetAudioDefaults = () => {
    soundManager.unlock();
    const restored = soundManager.resetSettingsToDefault();
    setAudioSettings(restored);
    musicManager.onVolumeOrToggleChanged();
    setFeedback({
      type: 'success',
      text: 'Đã khôi phục cài đặt âm thanh mặc định (Nhạc nền 35%, Hiệu ứng 50%).',
    });
  };

  const handleSelectGoogleAvatar = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.selectGoogleAvatar();
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Không thể chọn ảnh đại diện.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSelectCatalogAvatar = async (item: AvatarCatalogItem) => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.selectCatalogAvatar(item.avatarId);
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
      } else {
        setFeedback({
          type: 'error',
          text: res.message || 'Không thể chọn ảnh đại diện này.',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveDisplayName = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.updateDisplayName(displayName);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
      if (res.success) {
        onProfileUpdated?.();
      }
    } finally {
      setIsBusy(false);
    }
  };

  // M7.5.1 PHẦN 2: Mọi thao tác tải lên / thay thế / xóa avatar từ client đã bị vô hiệu hóa.

  const handleNextAccountsPage = () => {
    if (!accountsHasNextPage || isLoadingAccounts) return;
    const nextIdx = accountsPageIndex + 1;
    const nextHistory = [...accountsCursorHistory];
    nextHistory[nextIdx] = accountsNextCursor;
    setAccountsCursorHistory(nextHistory);
    void loadUserAccountsPage(nextIdx, accountsNextCursor);
  };

  const handlePrevAccountsPage = () => {
    if (accountsPageIndex <= 0 || isLoadingAccounts) return;
    const prevIdx = accountsPageIndex - 1;
    const prevCursor = accountsCursorHistory[prevIdx] ?? null;
    void loadUserAccountsPage(prevIdx, prevCursor);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getTabIcon = (tabId: SettingsTabId) => {
    switch (tabId) {
      case 'ACCOUNT':
        return <User className="w-3.5 h-3.5" />;
      case 'IMAGE_SETTINGS':
        return <ImageIcon className="w-3.5 h-3.5" />;
      case 'AUDIO_SETTINGS':
        return <Music className="w-3.5 h-3.5" />;
      case 'GAME_MODE_SETTINGS':
        return <Gamepad2 className="w-3.5 h-3.5" />;
      case 'ADMIN_OTHER':
        return <Shield className="w-3.5 h-3.5" />;
      case 'USER_ACCOUNTS':
        return <Users className="w-3.5 h-3.5" />;
      case 'SYSTEM_LOGS':
        return <Terminal className="w-3.5 h-3.5" />;
    }
  };

  const availableTabs = getAvailableSettingsTabsForRole(
    isVerifiedSuperAdmin ? 'ADMIN' : userRole
  ).map((tab) => ({
    ...tab,
    icon: getTabIcon(tab.id),
  }));

  return (
    <div
      data-testid="settings-modal-backdrop"
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 bg-black/80 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        data-testid="settings-modal-frame"
        className={`bg-neutral-900 border border-neutral-700 rounded-2xl ${UNIFIED_SETTINGS_MODAL_WIDTH_CLASS} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-2xl overflow-hidden`}
      >
        {/* Header */}
        <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2 uppercase tracking-wide">
                CÀI ĐẶT HỆ THỐNG
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all active:scale-95 cursor-pointer"
            title="Đóng cài đặt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs (M7.3.9 Mục 3 & 4) */}
        <div className="bg-neutral-950/90 px-3 py-2 border-b border-neutral-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {availableTabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setActiveTab(tab.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? tab.adminOnly
                      ? 'bg-red-500/20 text-red-200 border border-red-500 shadow-sm'
                      : 'bg-amber-500 text-black border border-amber-400 shadow-sm'
                    : tab.adminOnly
                      ? 'bg-neutral-900 text-red-300/80 border border-red-900/40 hover:border-red-500/50'
                      : 'bg-neutral-900 text-neutral-300 border border-neutral-800 hover:border-neutral-700'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs scrollbar-thin flex-1">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                feedback.type === 'error'
                  ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                  : 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="text-neutral-400 hover:text-white px-1.5"
              >
                ✕
              </button>
            </div>
          )}

          {/* =========================================================================
              TAB 1: THÔNG TIN (MỌI NGƯỜI CHƠI — CHỈ HIỂN THỊ HÌNH ẢNH AVATAR, KHÔNG CÓ NÚT UPLOAD)
             ========================================================================= */}
          {activeTab === 'ACCOUNT' && currentUser && (
            <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-bold text-neutral-100 uppercase tracking-wider">
                  <User className="w-4 h-4 text-amber-400" />
                  <span>THÔNG TIN CÁ NHÂN</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Khung tên người chơi có màu viền phân quyền (M7.3.7 Mục III.2.2) */}
                  <div
                    className={`px-2.5 py-1 rounded-lg bg-neutral-900 flex items-center gap-1.5 ${roleFrameClasses}`}
                  >
                    <span className="text-xs font-extrabold text-white truncate max-w-[150px]">
                      {userMeta?.displayName || currentUser.displayName || 'Commander'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Khu vực ẢNH ĐẠI DIỆN NGƯỜI CHƠI — M7.3.11.6 Section 5: Chỉ hiển thị hình ảnh Avatar, không hiển thị tên/phiên bản/trạng thái/đường dẫn và không có nút upload */}
              <div className="p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-4 shadow-inner">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-neutral-800/80 pb-2.5">
                  <div className="flex items-center gap-2 font-extrabold text-amber-300 text-xs sm:text-sm uppercase tracking-wider">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>ẢNH ĐẠI DIỆN</span>
                  </div>
                </div>

                {/* Current Active Avatar Preview (Image Only + Enlarged Blurred Backdrop) */}
                <div className="relative overflow-hidden flex items-center justify-center p-4 rounded-2xl bg-neutral-950/80 border border-amber-500/30">
                  {effectiveAvatarUrl && !avatarLoadError && (
                    <>
                      <img
                        src={effectiveAvatarUrl}
                        alt=""
                        aria-hidden="true"
                        data-testid="account-avatar-blurred-backdrop"
                        className="absolute inset-0 w-full h-full object-cover scale-150 blur-md opacity-45 pointer-events-none select-none"
                      />
                      <div className="absolute inset-0 bg-neutral-950/35 pointer-events-none" />
                    </>
                  )}
                  <div className="relative z-10 w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 border-amber-400 p-1 bg-neutral-950/90 overflow-hidden shadow-xl ring-4 ring-amber-500/15 flex items-center justify-center shrink-0">
                    {effectiveAvatarUrl && !avatarLoadError ? (
                      <img
                        src={effectiveAvatarUrl}
                        alt="Avatar"
                        className="w-full h-full rounded-full object-cover"
                        onError={() => setAvatarLoadError(true)}
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-neutral-800 flex items-center justify-center text-amber-400">
                        <User className="w-9 h-9" />
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-neutral-950 flex items-center justify-center text-black shadow">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  </div>
                </div>

                {/* Image-Only Avatar Selection Grid */}
                <div
                  data-testid="account-avatar-image-grid"
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 justify-items-center"
                >
                  {/* Option 1: Google Avatar Image */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleSelectGoogleAvatar}
                    aria-label="Chọn ảnh đại diện mặc định"
                    className={`relative p-2.5 rounded-2xl border-2 transition-all flex items-center justify-center cursor-pointer group ${
                      selectedAvatarType === 'google' || !isSelectedCatalogActive
                        ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
                        : 'bg-neutral-950/70 border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-900'
                    }`}
                  >
                    {(selectedAvatarType === 'google' || !isSelectedCatalogActive) && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-amber-500 text-black flex items-center justify-center shadow z-10">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-neutral-700 group-hover:border-amber-400 bg-neutral-900 flex items-center justify-center shadow-md transition-transform group-hover:scale-105">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt="Avatar"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="w-7 h-7 text-amber-400" />
                      )}
                    </div>
                  </button>

                  {/* Active Shared Catalog Avatars (Image Only — No Name, No Version, No Status Text, No Path) */}
                  {activeCatalog.map((item) => {
                    const itemUrl = avatarManager.getCatalogItemUrl(item.storagePath);
                    const isLoadingUrl = avatarManager.isCatalogItemUrlLoading(item.storagePath);
                    const hasError =
                      brokenCatalogIds[item.avatarId] ||
                      avatarManager.hasCatalogItemUrlError(item.storagePath);
                    const isSelected =
                      selectedAvatarType === 'catalog' && selectedCatalogId === item.avatarId;

                    return (
                      <button
                        key={item.avatarId}
                        type="button"
                        disabled={isBusy || hasError}
                        onClick={() => handleSelectCatalogAvatar(item)}
                        aria-label="Chọn ảnh đại diện"
                        className={`relative p-2.5 rounded-2xl border-2 transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 group ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
                            : 'bg-neutral-950/70 border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-900'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center shadow z-10">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </span>
                        )}
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-neutral-700 group-hover:border-emerald-400 bg-neutral-900 flex items-center justify-center shadow-md transition-transform group-hover:scale-105">
                          {itemUrl && !hasError ? (
                            <img
                              src={itemUrl}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                              onError={() =>
                                setBrokenCatalogIds((prev) => ({
                                  ...prev,
                                  [item.avatarId]: true,
                                }))
                              }
                            />
                          ) : isLoadingUrl ? (
                            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-neutral-500" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tên hiển thị & Email tài khoản Google */}
              <form onSubmit={handleSaveDisplayName} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Đổi tên
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={32}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="(tối đa 32 ký tự)"
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 shadow active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>LƯU</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={currentUser.email || ''}
                      className="w-full px-3 py-2 rounded-xl bg-neutral-900/70 border border-neutral-800 text-neutral-400 text-xs font-mono cursor-not-allowed pr-8"
                    />
                    <Lock className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </form>

              {/* Tùy chọn hiển thị Ping & FPS khi chơi Online với người */}
              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-bold text-neutral-100 text-xs">
                    <Activity className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Hiển thị Ping &amp; FPS (Chơi Online 2 người)</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed whitespace-pre-line">
                    {formatSentenceLineBreaks(
                      'Hiển thị độ trễ mạng (Ping) và tốc độ khung hình (FPS) trong trận Co-op Online. Có thể bật hoặc tắt bất kỳ lúc nào.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="toggle-online-net-stats-btn"
                  onClick={() => {
                    const nextVal = !showOnlineNetStats;
                    setShowOnlineNetStats(nextVal);
                    setShowOnlineNetStatsPreference(nextVal);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer shrink-0 ${
                    showOnlineNetStats
                      ? 'bg-sky-500 text-black shadow shadow-sky-500/20'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-neutral-200'
                  }`}
                >
                  {showOnlineNetStats ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                </button>
              </div>
              {/* M7.5.1 PHẦN 1: THỐNG KÊ THÀNH TÍCH & LỊCH SỬ TRUY CẬP NGƯỜI CHƠI (THEO UID) */}
              <div
                data-testid="system-player-statistics-section"
                className="p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 space-y-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-neutral-800 pb-2.5">
                  <div className="flex items-center gap-2 font-extrabold text-amber-300 text-xs sm:text-sm uppercase tracking-wider">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>THỐNG KÊ NGƯỜI CHƠI &amp; PHIÊN TRUY CẬP</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                      playerStats.currentSession.isOnlineActive
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                  >
                    Phiên: {playerStats.currentSession.isOnlineActive ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* 4 trụ cột phân biệt rõ: Level • Quân hàm PvP • Điểm XP • Số dư Xu */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div
                    data-testid="stat-card-player-level"
                    className="p-3 rounded-xl bg-neutral-950 border border-sky-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>Level (Cấp độ)</span>
                      <Award className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <div className="text-sm font-extrabold font-mono text-sky-300">
                      {playerStats.level !== null ? `Lv. ${playerStats.level}` : 'Lv. --'}
                    </div>
                    <div className="text-[10px] text-neutral-400 leading-snug">
                      {playerStats.levelSystemLabel}
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-pvp-rank"
                    className="p-3 rounded-xl bg-neutral-950 border border-purple-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>Quân hàm PvP</span>
                      <Shield className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="text-sm font-extrabold text-purple-300 truncate">
                      {playerStats.pvpRankLabel}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Tách biệt hoàn toàn với Level &amp; XP
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-total-xp"
                    className="p-3 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>Tổng điểm XP</span>
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="text-sm font-extrabold font-mono text-amber-300">
                      {playerStats.totalXp.toLocaleString('vi-VN')} XP
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400">
                      Kỷ lục trận: {playerStats.highScoreXp.toLocaleString('vi-VN')} XP
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-xu-balance"
                    className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>Số dư Xu</span>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="text-sm font-extrabold font-mono text-emerald-300">
                      {playerStats.xuBalance.toLocaleString('vi-VN')} Xu
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Độc lập, không tự quy đổi từ XP
                    </div>
                  </div>
                </div>

                {/* Thành tích Chiến dịch & Hoạt động chiến đấu */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Tiến độ Chiến dịch</div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      Stage {playerStats.unlockedStage}/{TOTAL_CAMPAIGN_STAGES}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      Đã qua {playerStats.completedStages.length}/{TOTAL_CAMPAIGN_STAGES} màn
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Trận đã hoàn thành</div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {playerStats.matchesPlayed} trận
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400">
                      Thắng <span className="text-emerald-300">{playerStats.matchesWon}</span> • Thua{' '}
                      <span className="text-rose-300">{playerStats.matchesLost}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Xe địch tiêu diệt</div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {playerStats.totalEnemiesDefeated} xe
                    </div>
                    <div className="text-[10px] font-mono text-neutral-500">
                      B:{playerStats.defeatedByType.BASIC} F:{playerStats.defeatedByType.FAST} P:
                      {playerStats.defeatedByType.POWER} A:{playerStats.defeatedByType.ARMOR}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Phòng Co-op Online</div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {playerStats.coopRoomsParticipated} phòng
                    </div>
                    <div className="text-[10px] text-neutral-500">Đã tạo hoặc tham gia</div>
                  </div>
                </div>

                {/* Lịch sử truy cập & Trạng thái phiên hiện tại */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Tổng số lần đăng nhập</span>
                    </div>
                    <div
                      data-testid="stat-total-logins"
                      className="text-xs font-extrabold font-mono text-amber-300"
                    >
                      {playerStats.totalLogins} lần
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Đăng nhập đầu tiên</div>
                    <div className="text-[11px] font-mono text-neutral-200">
                      {playerStats.firstLoginAtMs
                        ? new Date(playerStats.firstLoginAtMs).toLocaleString('vi-VN')
                        : 'Chưa ghi nhận'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">Đăng nhập gần nhất</div>
                    <div className="text-[11px] font-mono text-neutral-200">
                      {playerStats.lastLoginAtMs
                        ? new Date(playerStats.lastLoginAtMs).toLocaleString('vi-VN')
                        : 'Chưa ghi nhận'}
                    </div>
                  </div>
                </div>

                {/* Chi tiết phiên hiện tại */}
                <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="text-neutral-300">
                    Trạng thái phiên:{' '}
                    <strong
                      className={
                        playerStats.currentSession.isOnlineActive
                          ? 'text-emerald-300'
                          : 'text-neutral-400'
                      }
                    >
                      {playerStats.currentSession.status}
                    </strong>{' '}
                    • Timeout nhàn rỗi: {playerStats.currentSession.idleTimeoutMinutes} phút
                  </div>
                  {playerStats.currentSession.sessionId && (
                    <span className="font-mono text-[10px] text-neutral-400">
                      Mã phiên: {playerStats.currentSession.sessionId.slice(0, 16)}
                    </span>
                  )}
                </div>

                {/* Nhật ký Đăng nhập & Đăng xuất gần đây */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-amber-400" />
                      <span>Lịch sử đăng nhập &amp; đăng xuất ({playerStats.authHistory.length})</span>
                    </span>
                  </div>
                  {playerStats.authHistory.length === 0 ? (
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-500">
                      Chưa có bản ghi lịch sử đăng nhập/đăng xuất cho tài khoản này.
                    </div>
                  ) : (
                    <div
                      data-testid="player-auth-history-list"
                      className="max-h-36 overflow-y-auto space-y-1 pr-1"
                    >
                      {playerStats.authHistory.slice(0, 12).map((evt) => (
                        <div
                          key={evt.id}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono ${
                                evt.eventType === 'LOGIN'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60'
                                  : 'bg-amber-950 text-amber-300 border border-amber-700/60'
                              }`}
                            >
                              {evt.eventType === 'LOGIN' ? 'ĐĂNG NHẬP' : 'ĐĂNG XUẤT'}
                            </span>
                            <span className="text-neutral-200">{evt.note}</span>
                          </div>
                          <span className="font-mono text-[10px] text-neutral-400">
                            {new Date(evt.timestampMs).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* =========================================================================
              TAB 2: HÌNH ẢNH (CHỈ DÀNH CHO ADMIN — DANH MỤC AVATAR TĨNH M7.5.1)
             ========================================================================= */}
          {activeTab === 'IMAGE_SETTINGS' && isVerifiedSuperAdmin && (
            <section className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-500/20 pb-2.5">
                <div className="flex items-center gap-1.5 font-extrabold text-amber-300 uppercase">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>HÌNH ẢNH • DANH MỤC AVATAR TĨNH ({allCatalog.length} MẪU)</span>
                </div>
                <span className="text-[10px] text-emerald-300 font-mono font-bold">
                  public/avatar/ava01.png .. ava11.png
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed whitespace-pre-line">
                {formatSentenceLineBreaks(
                  'Chức năng tải lên, thay thế và xóa Avatar từ trình duyệt đã được khóa cố định theo thiết lập Media Tĩnh. Toàn bộ người chơi sử dụng trực tiếp 11 mẫu Avatar chuẩn tích hợp sẵn hoặc ảnh đại diện Google cá nhân.'
                )}
              </div>

              {allCatalog.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                  {allCatalog.map((item) => {
                    const itemUrl = avatarManager.getCatalogItemUrl(item.storagePath);
                    return (
                      <div
                        key={item.avatarId}
                        className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-10 h-10 rounded-full overflow-hidden border border-amber-500/40 bg-neutral-950 shrink-0 flex items-center justify-center">
                            {itemUrl ? (
                              <img
                                src={itemUrl}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-neutral-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate">{item.name}</div>
                            <div className="text-[10px] font-mono text-neutral-400 truncate">
                              {item.storagePath} • {formatFileSize(item.fileSize)}
                            </div>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold shrink-0">
                          Tĩnh • Mở
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* =========================================================================
              TAB 3: ÂM THANH (BGM & SFX CÁ NHÂN + HƯỚNG DẪN SỬ DỤNG + QUẢN LÝ NHẠC NỀN ADMIN)
             ========================================================================= */}
          {activeTab === 'AUDIO_SETTINGS' && (
            <>
              <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
                  <div className="flex items-center gap-2 font-bold text-neutral-100 uppercase tracking-wider">
                    <Music className="w-4 h-4 text-amber-400" />
                    <span>MEDIA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-400 font-mono hidden sm:inline">
                      BGM &amp; SFX Độc Lập • Chỉ 1 nguồn BGM phát tại 1 thời điểm
                    </span>
                    <button
                      type="button"
                      data-testid="audio-reset-defaults-btn"
                      onClick={handleResetAudioDefaults}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                      title="Khôi phục cài đặt âm thanh mặc định"
                    >
                      <RefreshCw className="w-3 h-3 text-amber-400" />
                      <span>Mặc định</span>
                    </button>
                  </div>
                </div>

                {/* BGM Toggle & Slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-200 font-semibold">
                      {audioSettings.bgmEnabled ? (
                        <Volume2 className="w-4 h-4 text-amber-400" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-neutral-500" />
                      )}
                      <span>Nhạc nền (BGM)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleBgmToggle}
                      className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                        audioSettings.bgmEnabled
                          ? 'bg-amber-500 text-black'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {audioSettings.bgmEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-400 w-28 shrink-0">
                      Âm lượng nhạc nền:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      disabled={!audioSettings.bgmEnabled}
                      value={audioSettings.bgmVolume}
                      onChange={(e) => handleBgmVolChange(parseFloat(e.target.value))}
                      className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded disabled:opacity-40"
                    />
                    <span className="font-mono text-[11px] text-amber-300 font-bold w-10 text-right">
                      {Math.round(audioSettings.bgmVolume * 100)}%
                    </span>
                  </div>
                </div>

                {/* SFX Toggle & Slider */}
                <div className="space-y-2 pt-3 border-t border-neutral-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-neutral-200 font-semibold">
                      {audioSettings.sfxEnabled ? (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-neutral-500" />
                      )}
                      <span>Âm thanh hiệu ứng (SFX)</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSfxToggle}
                      className={`px-3 py-1 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                        audioSettings.sfxEnabled
                          ? 'bg-emerald-500 text-black'
                          : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {audioSettings.sfxEnabled ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-400 w-28 shrink-0">
                      Âm lượng hiệu ứng:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      disabled={!audioSettings.sfxEnabled}
                      value={audioSettings.sfxVolume}
                      onChange={(e) => handleSfxVolChange(parseFloat(e.target.value))}
                      className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-neutral-800 rounded disabled:opacity-40"
                    />
                    <span className="font-mono text-[11px] text-emerald-300 font-bold w-10 text-right">
                      {Math.round(audioSettings.sfxVolume * 100)}%
                    </span>
                  </div>
                </div>

                {/* Toggle Admin Media Management Panel — ONLY visible for Admin */}
                {canShowAdminMusic && (
                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
                    <span className="text-[11px] text-amber-300 font-bold">
                      Quản trị Thư viện Media &amp; Âm thanh Hệ thống
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMusicAdmin((v) => !v)}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {showMusicAdmin ? 'Thu gọn Quản lý Media' : 'Mở Quản lý Media'}
                    </button>
                  </div>
                )}
              </section>

              {canShowAdminMusic && showMusicAdmin && <MusicAdminPanel />}
            </>
          )}

          {/* =========================================================================
              TAB 4: CHẾ ĐỘ CHƠI & QUẢN LÝ MÀN CHƠI STAGE 13x13 (M7.3.11 MỤC III)
             ========================================================================= */}
          {activeTab === 'GAME_MODE_SETTINGS' && canManageStagesTab && (
            <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-bold text-neutral-100 uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4 text-amber-400" />
                  <span>CHẾ ĐỘ CHƠI &amp; QUẢN LÝ STAGE (13×13 MAP EDITOR)</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">
                  Chơi đơn • Co-op 2 người • Co-op Online
                </span>
              </div>

              {onDifficultyChange && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-amber-300">
                    Độ khó ưu tiên mặc định (Chơi đơn &amp; Co-op 2 người)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => onDifficultyChange('DEFAULT')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        difficulty === 'DEFAULT'
                          ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/40'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-extrabold text-xs">1. GIẢI TRÍ (MẶC ĐỊNH)</div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        3 mạng khởi đầu • Nhịp độ cân bằng.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDifficultyChange('EXTREME')}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        difficulty === 'EXTREME'
                          ? 'bg-rose-950/50 border-rose-500 text-rose-200 ring-1 ring-rose-500/40'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="font-extrabold text-xs">2. THỬ THÁCH (SIÊU KHÓ)</div>
                      <div className="text-[11px] text-neutral-400 mt-1">
                        Solo 2 mạng • Co-op 1 mạng • 60s • Áp lực cao.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Interactive Stage Manager & 13x13 Drag-and-Drop Map Editor */}
              <StageEditorPanel
                actorRole={isVerifiedSuperAdmin ? 'ADMIN' : userRole}
                actorEmail={currentUser?.email || SUPER_ADMIN_EMAIL}
              />
            </section>
          )}

          {/* =========================================================================
              TAB 5: CẤP QUYỀN & BẢNG MA TRẬN PHÂN QUYỀN 3 VAI TRÒ (M7.3.11.4)
             ========================================================================= */}
          {activeTab === 'ADMIN_OTHER' && canViewPermissionMatrixTab && (
            <section className="p-4 rounded-xl bg-neutral-950/90 border border-emerald-500/40 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-extrabold text-emerald-300 uppercase tracking-wider">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>MA TRẬN PHÂN QUYỀN HỆ THỐNG 3 VAI TRÒ (ADMIN / MOD / USER)</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-200/80">
                  Admin
                </span>
              </div>

              {/* 5-Column RBAC Permission Matrix Table (ADMIN / MOD / PLAYER) */}
              <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/60">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-950 text-neutral-300 border-b border-neutral-800">
                      <th className="py-2.5 px-3 font-extrabold whitespace-nowrap">
                        Nhóm chức năng
                      </th>
                      <th className="py-2.5 px-3 font-extrabold">Quyền cụ thể</th>
                      <th className="py-2.5 px-3 font-extrabold text-center text-emerald-400 whitespace-nowrap">
                        Admin
                      </th>
                      <th className="py-2.5 px-3 font-extrabold text-center text-sky-400 whitespace-nowrap">
                        Mod
                      </th>
                      <th className="py-2.5 px-3 font-extrabold text-center text-neutral-300 whitespace-nowrap">
                        User
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {RBAC_PERMISSION_MATRIX.map((perm) => {
                      const adminLabel =
                        perm.status === 'NOT_DEPLOYED'
                          ? 'Chưa triển khai'
                          : perm.ADMIN
                            ? 'Có'
                            : 'Không';
                      const modLabel =
                        perm.status === 'NOT_DEPLOYED'
                          ? 'Chưa triển khai'
                          : perm.MOD
                            ? 'Có'
                            : 'Không';
                      const playerLabel =
                        perm.status === 'NOT_DEPLOYED'
                          ? 'Chưa triển khai'
                          : perm.PLAYER
                            ? 'Có'
                            : 'Không';
                      return (
                        <tr key={perm.id} className="hover:bg-neutral-900/90 transition-colors">
                          <td className="py-2 px-3 font-bold text-amber-300 whitespace-nowrap">
                            {perm.category}
                          </td>
                          <td className="py-2 px-3 text-neutral-200">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{perm.nameVi}</span>
                              {perm.status === 'NOT_DEPLOYED' && (
                                <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-mono">
                                  {perm.statusLabelVi}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                perm.ADMIN && perm.status === 'DEPLOYED'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                  : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              {adminLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                perm.MOD && perm.status === 'DEPLOYED'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                  : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              {modLabel}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                perm.PLAYER && perm.status === 'DEPLOYED'
                                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                  : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              {playerLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Role Frame Color Legend */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-white">
                  Quy ước màu khung tên hiển thị theo 3 vai trò hệ thống (M7.3.11.4):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-neutral-900 border-2 border-emerald-500 flex items-center justify-between">
                    <span className="font-extrabold text-white text-[11px]">Admin</span>
                    <span className="text-[10px] font-mono text-emerald-300 font-bold">Xanh lá</span>
                  </div>
                  <div className="p-2 rounded-xl bg-neutral-900 border-2 border-sky-500 flex items-center justify-between">
                    <span className="font-extrabold text-white text-[11px]">Mod</span>
                    <span className="text-[10px] font-mono text-sky-300 font-bold">Xanh dương</span>
                  </div>
                  <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-between">
                    <span className="font-extrabold text-white text-[11px]">User</span>
                    <span className="text-[10px] font-mono text-neutral-400 font-bold">Mặc định</span>
                  </div>
                </div>
              </div>

              {/* Role Change Audit Log Section */}
              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 space-y-2">
                <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                  <span>Nhật ký thay đổi quyền hạn (Audit Log)</span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {getRoleChangeAuditLogs().length} bản ghi
                  </span>
                </div>
                {getRoleChangeAuditLogs().length === 0 ? (
                  <p className="text-[11px] text-neutral-500">
                    Chưa có thao tác cấp hoặc thu hồi quyền nào trong phiên hiện tại.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {getRoleChangeAuditLogs()
                      .slice(0, 10)
                      .map((log) => (
                        <div
                          key={log.auditId}
                          className="p-2 rounded bg-neutral-950 border border-neutral-800 text-[11px] flex flex-wrap items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-mono text-amber-300 font-bold">
                              {log.actorEmail}
                            </span>{' '}
                            đã đổi vai trò của{' '}
                            <span className="font-mono text-white font-bold">
                              {log.targetEmail || log.targetUid}
                            </span>{' '}
                            từ <span className="text-neutral-400">{log.previousRole}</span> sang{' '}
                            <span className="text-emerald-300 font-bold">{log.newRole}</span>
                          </div>
                          <span className="font-mono text-[10px] text-neutral-500">
                            {new Date(log.timestampMs).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* =========================================================================
              TAB 6: TÀI KHOẢN (M7.3.11 MỤC II: HIỂN THỊ ĐẦY ĐỦ 8 CỘT & CẤP QUYỀN ADMIN/MOD)
             ========================================================================= */}
          {activeTab === 'USER_ACCOUNTS' && canViewAccountsTab && (
            <section className="p-4 rounded-xl bg-neutral-950/90 border border-red-500/40 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-extrabold text-red-300 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-red-400" />
                  <span>DANH SÁCH TÀI KHOẢN</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-400">
                    {USER_ACCOUNTS_PAGE_SIZE} tài khoản / trang
                  </span>
                  <button
                    type="button"
                    disabled={isLoadingAccounts}
                    onClick={() =>
                      void loadUserAccountsPage(
                        accountsPageIndex,
                        accountsCursorHistory[accountsPageIndex] ?? null
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingAccounts ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>
              </div>

              {accountsRoleFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    accountsRoleFeedback.type === 'success'
                      ? 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                      : 'bg-rose-950/70 border-rose-700 text-rose-200'
                  }`}
                >
                  {accountsRoleFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{accountsRoleFeedback.text}</span>
                </div>
              )}

              {/* Confirmation Modal before changing role */}
              {pendingRoleChangeConfirm && (
                <div className="p-3.5 rounded-xl bg-amber-950/70 border-2 border-amber-500/80 text-xs space-y-2.5">
                  <div className="font-extrabold text-amber-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>XÁC NHẬN THAY ĐỔI QUYỀN HẠN TÀI KHOẢN</span>
                  </div>
                  <p className="text-neutral-200 leading-relaxed whitespace-pre-line">
                    {formatSentenceLineBreaks(
                      `Bạn có chắc chắn muốn thực hiện thao tác ${pendingRoleChangeConfirm.label} cho tài khoản ${pendingRoleChangeConfirm.account.displayName}${pendingRoleChangeConfirm.account.email ? ` (${pendingRoleChangeConfirm.account.email})` : ''}? Thao tác này sẽ được ghi nhận vào Nhật ký Audit.`
                    )}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isChangingRole}
                      onClick={() => void handleConfirmRoleChange()}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isChangingRole ? 'Đang cập nhật...' : 'Xác nhận thực hiện'}
                    </button>
                    <button
                      type="button"
                      disabled={isChangingRole}
                      onClick={() => setPendingRoleChangeConfirm(null)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              )}

              {accountsError && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{accountsError}</span>
                </div>
              )}

              {isLoadingAccounts ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-neutral-400">
                  <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                  <span className="text-xs font-mono">Đang tải trang {accountsPageIndex + 1}...</span>
                </div>
              ) : accountsPageList.length === 0 ? (
                <div className="py-6 text-center text-neutral-400 text-xs">
                  Chưa có dữ liệu tài khoản trên trang này.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/50">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">STT</th>
                        <th className="py-2.5 px-2.5 font-bold">Tên</th>
                        <th className="py-2.5 px-2.5 font-bold">Email</th>
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">Quyền</th>
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">Tiến độ Stage</th>
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">
                          Đăng nhập gần nhất
                        </th>
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">Trạng thái</th>
                        <th className="py-2.5 px-2.5 font-bold text-right whitespace-nowrap">
                          Cấp quyền
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/70">
                      {accountsPageList.map((acc, idx) => {
                        const accRoleInfo = getRoleDisplayInfo(acc.role);
                        const rowNumber = accountsPageIndex * USER_ACCOUNTS_PAGE_SIZE + idx + 1;
                        const isTargetSoleAdmin =
                          acc.role === 'ADMIN' ||
                          (acc.email && acc.email.toLowerCase() === SUPER_ADMIN_EMAIL);
                        const isSelfAccount = Boolean(currentUid && acc.uid === currentUid);

                        return (
                          <tr key={acc.uid} className="hover:bg-neutral-900/90 transition-colors">
                            {/* 1. STT */}
                            <td className="py-2.5 px-2.5 font-mono font-bold text-neutral-400 whitespace-nowrap">
                              #{rowNumber}
                            </td>

                            {/* 2. Nickname (Never blank; shows note if not configured) */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`inline-block w-fit px-2 py-0.5 rounded bg-neutral-950 text-xs font-extrabold text-white ${accRoleInfo.frameClass}`}
                                >
                                  {acc.displayName}
                                </span>
                                {acc.nicknameNote && (
                                  <span className="text-[10px] italic text-amber-300/90">
                                    {acc.nicknameNote}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 3. Email */}
                            <td className="py-2.5 px-2.5 font-mono text-[11px] text-neutral-300">
                              <div>{acc.email || 'Chưa đồng bộ email'}</div>
                            </td>

                            {/* 4. Vai trò */}
                            <td className="py-2.5 px-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  acc.role === 'ADMIN'
                                    ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-600/70'
                                    : acc.role === 'MOD'
                                      ? 'bg-sky-950/90 text-sky-300 border border-sky-600/70'
                                      : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                                }`}
                              >
                                {acc.role === 'PLAYER' ? 'User' : accRoleInfo.label}
                              </span>
                            </td>

                            {/* 4b. Tiến độ Stage (Stage X/10) */}
                            <td className="py-2.5 px-2.5 font-mono text-[11px] whitespace-nowrap">
                              {(() => {
                                const prog = StageProgressionManager.getInstance().getUserStageProgressSnapshot(
                                  acc.uid
                                );
                                return (
                                  <span
                                    data-testid={`user-stage-progress-${acc.uid}`}
                                    className="px-2 py-0.5 rounded bg-amber-950/70 border border-amber-700/60 text-amber-300 font-bold"
                                  >
                                    Stage {prog.unlockedStage}/{TOTAL_CAMPAIGN_STAGES}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* 5. Ngày đăng nhập gần nhất */}
                            <td className="py-2.5 px-2.5 font-mono text-[11px] text-neutral-300 whitespace-nowrap">
                              {acc.lastLoginAtMs > 0
                                ? new Date(acc.lastLoginAtMs).toLocaleString('vi-VN')
                                : 'Mới tham gia'}
                            </td>

                            {/* 6. Trạng thái tài khoản */}
                            <td className="py-2.5 px-2.5 whitespace-nowrap">
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                  acc.status === 'ACTIVE'
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                                }`}
                              >
                                {acc.status === 'ACTIVE' ? 'Online' : 'Offline'}
                              </span>
                            </td>

                            {/* 7. Thao tác (Admin cấp/thu hồi quyền MOD) */}
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              {!isVerifiedSuperAdmin ? (
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  Chỉ xem
                                </span>
                              ) : isTargetSoleAdmin || isSelfAccount ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-[10px] font-bold">
                                  <Lock className="w-3 h-3" />
                                  Admin
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={acc.role === 'MOD' || isChangingRole}
                                    onClick={() =>
                                      setPendingRoleChangeConfirm({
                                        account: acc,
                                        newRole: 'MOD',
                                        label: 'Là Mod',
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-sky-900/70 hover:bg-sky-800 disabled:opacity-35 border border-sky-600/70 text-sky-200 text-[10px] font-bold transition-colors cursor-pointer"
                                  >
                                    Là Mod
                                  </button>
                                  <button
                                    type="button"
                                    disabled={acc.role === 'PLAYER' || isChangingRole}
                                    onClick={() =>
                                      setPendingRoleChangeConfirm({
                                        account: acc,
                                        newRole: 'PLAYER',
                                        label: 'Là User',
                                      })
                                    }
                                    className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-35 border border-neutral-600 text-neutral-200 text-[10px] font-bold transition-colors cursor-pointer"
                                  >
                                    Là User
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Controls: Trang trước / Trang sau */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-mono text-neutral-400">
                  Trang hiện tại: <strong className="text-white">{accountsPageIndex + 1}</strong> •
                  Hiển thị <strong className="text-white">{accountsPageList.length}</strong> / tối đa{' '}
                  {USER_ACCOUNTS_PAGE_SIZE} tài khoản
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={accountsPageIndex <= 0 || isLoadingAccounts}
                    onClick={handlePrevAccountsPage}
                    className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Trang trước</span>
                  </button>
                  <button
                    type="button"
                    disabled={!accountsHasNextPage || isLoadingAccounts}
                    onClick={handleNextAccountsPage}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Trang sau</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* =========================================================================
              TAB 7: LOG HỆ THỐNG (CHỈ DUY NHẤT ADMIN linhnk2013@gmail.com — M7.5.1 PHẦN 4 & 5)
             ========================================================================= */}
          {activeTab === 'SYSTEM_LOGS' && isVerifiedSuperAdmin && (
            <SystemLogsAdminPanel user={currentUser} />
          )}
        </div>

        {/* Footer */}
        <div className="bg-neutral-950 px-4 py-3 border-t border-neutral-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-transform active:scale-95 shadow cursor-pointer"
          >
            ĐÓNG CÀI ĐẶT
          </button>
        </div>
      </div>
    </div>
  );
};
