/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Music,
  Sliders,
  User,
  Upload,
  Check,
  Trash2,
  RefreshCw,
  Lock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Save,
  Camera,
  Eye,
  EyeOff,
  Sparkles,
  Image as ImageIcon,
  Gamepad2,
  Shield,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { SoundManager, type AudioSettings } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';
import {
  AvatarManager,
  type AvatarCatalogItem,
  type StagedCatalogAvatarFile,
  type UserProfileAvatarMetadata,
  type PendingCatalogMetadataSync,
  type AvatarUploadUiStatus,
} from '../core/avatarManager.ts';
import {
  AuthManager,
  SUPER_ADMIN_EMAIL,
  USER_ACCOUNTS_PAGE_SIZE,
  resolveUserRole,
  getRoleNameFrameClasses,
  getRoleDisplayInfo,
  type UserAccountSummary,
} from '../core/authManager.ts';
import { MusicAdminPanel } from './MusicAdminPanel.tsx';

export type SettingsTabId =
  | 'ACCOUNT'
  | 'IMAGE_SETTINGS'
  | 'AUDIO_SETTINGS'
  | 'GAME_MODE_SETTINGS'
  | 'ADMIN_OTHER'
  | 'USER_ACCOUNTS';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
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
 * M7.3.9 Mục 3 & 4: Trả về danh sách các mục trong Cài đặt Hệ thống theo đúng quyền hạn thực tế:
 * - Người chơi thường chỉ thấy: `Thông tin` (`ACCOUNT`) và `Âm thanh` (`AUDIO_SETTINGS`).
 * - Tuyệt đối ẩn và chặn truy cập `Chế độ chơi` (`GAME_MODE_SETTINGS`), `Hình ảnh` (`IMAGE_SETTINGS`),
 *   `Cấp quyền` (`ADMIN_OTHER`) và `Tài khoản` (`USER_ACCOUNTS`) đối với người chơi thường.
 */
export function getAvailableSettingsTabsForRole(isVerifiedSuperAdmin: boolean): Array<{
  id: SettingsTabId;
  label: string;
  adminOnly: boolean;
}> {
  const tabs: Array<{ id: SettingsTabId; label: string; adminOnly: boolean }> = [
    {
      id: 'ACCOUNT',
      label: 'Thông tin',
      adminOnly: false,
    },
  ];

  if (isVerifiedSuperAdmin) {
    tabs.push({
      id: 'IMAGE_SETTINGS',
      label: 'Hình ảnh',
      adminOnly: true,
    });
  }

  tabs.push({
    id: 'AUDIO_SETTINGS',
    label: 'Âm thanh',
    adminOnly: false,
  });

  if (isVerifiedSuperAdmin) {
    tabs.push(
      {
        id: 'GAME_MODE_SETTINGS',
        label: 'Chế độ chơi',
        adminOnly: true,
      },
      {
        id: 'ADMIN_OTHER',
        label: 'Cấp quyền',
        adminOnly: true,
      },
      {
        id: 'USER_ACCOUNTS',
        label: 'Tài khoản',
        adminOnly: true,
      }
    );
  }

  return tabs;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
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
  const roleInfo = getRoleDisplayInfo(userRole);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);

  const [activeTab, setActiveTab] = useState<SettingsTabId>('ACCOUNT');

  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() =>
    soundManager.getSettings()
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

  // Super Admin Catalog Management state
  const [stagedCatalogFile, setStagedCatalogFile] = useState<StagedCatalogAvatarFile | null>(() =>
    avatarManager.getStagedCatalogFile()
  );
  const [pendingCatalogSync, setPendingCatalogSync] = useState<PendingCatalogMetadataSync | null>(
    () => avatarManager.getPendingCatalogSync()
  );
  const [uploadProgressPct, setUploadProgressPct] = useState<number | null>(() =>
    avatarManager.getUploadProgressPct()
  );
  const [uploadUiStatus, setUploadUiStatus] = useState<AvatarUploadUiStatus>(() =>
    avatarManager.getUploadUiStatus()
  );
  const [uploadUiStatusLabel, setUploadUiStatusLabel] = useState<string | null>(() =>
    avatarManager.getUploadUiStatusLabelVi()
  );
  const [catalogNameInput, setCatalogNameInput] = useState<string>('');
  const [catalogSortOrderInput, setCatalogSortOrderInput] = useState<number>(10);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // Super Admin User Accounts Pagination state (M7.3.9 Mục 3)
  const [accountsPageList, setAccountsPageList] = useState<UserAccountSummary[]>([]);
  const [accountsPageIndex, setAccountsPageIndex] = useState<number>(0);
  const [accountsCursorHistory, setAccountsCursorHistory] = useState<Array<unknown | null>>([null]);
  const [accountsHasNextPage, setAccountsHasNextPage] = useState<boolean>(false);
  const [accountsNextCursor, setAccountsNextCursor] = useState<unknown | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState<boolean>(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const adminFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickProfileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const loadUserAccountsPage = async (targetPageIndex: number, cursor: unknown | null) => {
    if (!isVerifiedSuperAdmin) return;
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
    // Reset to ACCOUNT tab if current tab is admin-only and user is not Super Admin
    if (
      !isVerifiedSuperAdmin &&
      (activeTab === 'IMAGE_SETTINGS' ||
        activeTab === 'GAME_MODE_SETTINGS' ||
        activeTab === 'ADMIN_OTHER' ||
        activeTab === 'USER_ACCOUNTS')
    ) {
      setActiveTab('ACCOUNT');
    }
  }, [isOpen, currentUid, isVerifiedSuperAdmin]);

  useEffect(() => {
    if (isOpen && activeTab === 'USER_ACCOUNTS' && isVerifiedSuperAdmin) {
      setAccountsCursorHistory([null]);
      void loadUserAccountsPage(0, null);
    }
  }, [isOpen, activeTab, isVerifiedSuperAdmin]);

  useEffect(() => {
    const unsub = avatarManager.subscribe(() => {
      const uid = authManager.getCurrentUser()?.uid || currentUid;
      setUserMeta(avatarManager.getUserMetadata(uid));
      setActiveCatalog(avatarManager.getCatalogItems(false));
      setAllCatalog(avatarManager.getCatalogItems(true));
      setStagedCatalogFile(avatarManager.getStagedCatalogFile());
      setPendingCatalogSync(avatarManager.getPendingCatalogSync());
      setUploadProgressPct(avatarManager.getUploadProgressPct());
      setUploadUiStatus(avatarManager.getUploadUiStatus());
      setUploadUiStatusLabel(avatarManager.getUploadUiStatusLabelVi());
      setRenderTick((t) => t + 1);
    });
    return unsub;
  }, [avatarManager, authManager, currentUid]);

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

  const plannedVersionInfo = isVerifiedSuperAdmin
    ? avatarManager.getPlannedUploadVersionInfo({
        replaceAvatarId: replaceTargetId,
      })
    : null;

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

  const handleSelectGoogleAvatar = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.selectGoogleAvatar();
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message || (res.success ? 'Đã chọn Ảnh Google!' : 'Không thể chọn Ảnh Google.'),
      });
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
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
      setFeedback({
        type: res.success ? 'success' : 'error',
        text:
          res.message ||
          (res.success ? `Đã chọn avatar "${item.name}"!` : 'Không thể chọn avatar này.'),
      });
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleSuperAdminQuickUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.uploadAndApplySuperAdminAvatar(file, displayName);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text:
          res.message ||
          (res.success
            ? 'Đã tải lên và áp dụng ảnh đại diện mới thành công!'
            : 'Tải ảnh đại diện thất bại. Ảnh cũ vẫn được giữ nguyên.'),
      });
      if (res.success) {
        setAvatarLoadError(false);
        onProfileUpdated?.();
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

  // Super Admin Catalog Handlers
  const handleAdminPickCatalogFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.stageCatalogAvatarFile(file);
      if (!res.success || !res.staged) {
        setFeedback({
          type: 'error',
          text: res.error || 'File ảnh không hợp lệ.',
        });
      } else {
        if (
          pendingCatalogSync &&
          pendingCatalogSync.status === 'UPLOAD_INDETERMINATE' &&
          !replaceTargetId
        ) {
          setReplaceTargetId(pendingCatalogSync.avatarId);
          if (!catalogNameInput.trim()) {
            setCatalogNameInput(pendingCatalogSync.name || 'Chiến Xa Tank');
          }
          setCatalogSortOrderInput(pendingCatalogSync.sortOrder ?? 10);
        } else if (!catalogNameInput.trim()) {
          const defaultLabel = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
          setCatalogNameInput(defaultLabel || 'Chiến Xa Tank');
        }
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdminCancelStaged = () => {
    avatarManager.cancelActiveUpload();
    avatarManager.clearStagedCatalogFile();
    setReplaceTargetId(null);
    setFeedback(null);
  };

  const handleAdminUploadCatalog = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.uploadStagedCatalogAvatar({
        name: catalogNameInput,
        sortOrder: catalogSortOrderInput,
        isActive: true,
        replaceAvatarId: replaceTargetId,
      });
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message || (res.success ? 'Tải lên thành công!' : 'Tải lên thất bại.'),
      });
      if (res.success) {
        setAvatarLoadError(false);
        setReplaceTargetId(null);
        setCatalogNameInput('');
        setCatalogSortOrderInput((prev) => prev + 10);
        onProfileUpdated?.();
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdminRetryCatalogSync = async () => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.retryPendingCatalogMetadataSync();
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message || (res.success ? 'Đã đồng bộ thành công!' : 'Đồng bộ thất bại.'),
      });
      if (res.success) {
        setReplaceTargetId(null);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdminToggleActive = async (item: AvatarCatalogItem) => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.updateCatalogItemMetadata({
        avatarId: item.avatarId,
        isActive: !item.isActive,
      });
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message || 'Đã cập nhật trạng thái.',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdminStartReplace = (item: AvatarCatalogItem) => {
    setReplaceTargetId(item.avatarId);
    setCatalogNameInput(item.name);
    setCatalogSortOrderInput(item.sortOrder);
    adminFileInputRef.current?.click();
  };

  const handleAdminDeleteCatalogItem = async (item: AvatarCatalogItem) => {
    setFeedback(null);
    setIsBusy(true);
    try {
      const res = await avatarManager.deleteCatalogItem(item.avatarId);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message || 'Không thể xóa avatar.',
      });
    } finally {
      setIsBusy(false);
    }
  };

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
    }
  };

  const availableTabs = getAvailableSettingsTabsForRole(isVerifiedSuperAdmin).map((tab) => ({
    ...tab,
    icon: getTabIcon(tab.id),
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
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
              TAB 1: THÔNG TIN (MỌI NGƯỜI CHƠI)
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
                    <span className="text-[10px] font-mono font-bold text-amber-300">
                      [{roleInfo.label}]
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                    <ShieldCheck className="w-3.5 h-3.5" /> Đã xác thực Google
                  </span>
                </div>
              </div>

              {/* Khu vực ẢNH ĐẠI DIỆN NGƯỜI CHƠI (Chọn Ảnh Google hoặc Danh mục Avatar chung + Tải ảnh trực tiếp cho Super Admin) */}
              <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-amber-300">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>CHỌN ẢNH ĐẠI DIỆN</span>
                  </div>
                  {isVerifiedSuperAdmin ? (
                    <>
                      <input
                        ref={quickProfileAvatarInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        onChange={handleSuperAdminQuickUploadAvatar}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => quickProfileAvatarInputRef.current?.click()}
                        className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isBusy ? 'ĐANG XỬ LÝ...' : 'TẢI ẢNH TỪ THIẾT BỊ'}</span>
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-neutral-400 font-mono">
                      Ảnh Google hoặc Danh mục Avatar chung
                    </span>
                  )}
                </div>

                {/* Current Active Avatar Preview */}
                <div className="flex items-center gap-3.5 p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800">
                  <div className="relative w-14 h-14 rounded-full border-2 border-amber-500/70 p-0.5 bg-neutral-900 overflow-hidden shadow flex items-center justify-center shrink-0">
                    {effectiveAvatarUrl && !avatarLoadError ? (
                      <img
                        src={effectiveAvatarUrl}
                        alt="Ảnh đại diện hiện tại"
                        className="w-full h-full rounded-full object-cover"
                        onError={() => setAvatarLoadError(true)}
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-neutral-800 flex items-center justify-center text-amber-400">
                        <User className="w-7 h-7" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {selectedAvatarType === 'catalog' && isSelectedCatalogActive
                        ? `Danh mục: ${
                            activeCatalog.find((i) => i.avatarId === selectedCatalogId)?.name ||
                            selectedCatalogId
                          }`
                        : 'Ảnh tài khoản Google'}
                    </div>
                    {selectedAvatarType === 'catalog' && !isSelectedCatalogActive && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">
                        Avatar danh mục đã chọn hiện đang tạm ẩn, hệ thống tự động hiển thị Ảnh Google dự phòng.
                      </p>
                    )}
                  </div>
                </div>

                {/* Avatar Selection Grid: Option 1 (Google Avatar) + Active Catalog Items */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Option 1: Ảnh Google */}
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleSelectGoogleAvatar}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col items-center gap-2 cursor-pointer ${
                      selectedAvatarType === 'google' || !isSelectedCatalogActive
                        ? 'bg-amber-950/40 border-amber-500 ring-1 ring-amber-500/40'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden border border-neutral-700 bg-neutral-900 flex items-center justify-center">
                      {currentUser.photoURL ? (
                        <img
                          src={currentUser.photoURL}
                          alt="Ảnh Google"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="w-6 h-6 text-amber-400" />
                      )}
                    </div>
                    <div className="text-center w-full">
                      <div className="text-[11px] font-bold text-white truncate">Ảnh Google</div>
                      <div className="text-[10px] text-amber-300 font-mono">
                        {selectedAvatarType === 'google' ? 'Đang chọn' : 'Mặc định'}
                      </div>
                    </div>
                  </button>

                  {/* Active Shared Catalog Avatars */}
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
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col items-center gap-2 cursor-pointer disabled:opacity-50 ${
                          isSelected
                            ? 'bg-emerald-950/40 border-emerald-500 ring-1 ring-emerald-500/40'
                            : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-full overflow-hidden border border-neutral-700 bg-neutral-900 flex items-center justify-center">
                          {itemUrl && !hasError ? (
                            <img
                              src={itemUrl}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={() =>
                                setBrokenCatalogIds((prev) => ({
                                  ...prev,
                                  [item.avatarId]: true,
                                }))
                              }
                            />
                          ) : isLoadingUrl ? (
                            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-neutral-500" />
                          )}
                        </div>
                        <div className="text-center w-full">
                          <div className="text-[11px] font-bold text-white truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] font-mono text-emerald-300">
                            {isSelected ? 'Đang chọn' : hasError ? 'Lỗi tải ảnh' : `v${item.version}`}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {activeCatalog.length === 0 && (
                  <p className="text-[11px] text-neutral-400 italic">
                    Hiện chưa có avatar nào được kích hoạt trong Danh mục Avatar chung. Bạn đang sử dụng Ảnh đại diện Google.
                  </p>
                )}
              </div>

              {/* Tên hiển thị & Email tài khoản Google */}
              <form onSubmit={handleSaveDisplayName} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Tên hiển thị người chơi
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={32}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Nhập biệt danh (tối đa 32 ký tự)"
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
                    Email tài khoản Google (Chỉ đọc)
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
            </section>
          )}

          {/* =========================================================================
              TAB 2: HÌNH ẢNH (CHỈ DÀNH CHO SUPER ADMIN linhnk.online@gmail.com)
             ========================================================================= */}
          {activeTab === 'IMAGE_SETTINGS' && isVerifiedSuperAdmin && (
            <section className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-500/20 pb-2.5">
                <div className="flex items-center gap-1.5 font-extrabold text-amber-300 uppercase">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>HÌNH ẢNH • QUẢN LÝ DANH MỤC AVATAR (SUPER ADMIN)</span>
                </div>
                <span className="text-[10px] text-amber-200/80 font-mono">
                  JPEG / PNG / WebP • ≤ 5 MB • ≤ 2048×2048 px
                </span>
              </div>

              <input
                ref={adminFileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                onChange={handleAdminPickCatalogFile}
                className="hidden"
              />

              {/* Live Upload Status Badge (M7.3.7 Mục II.1.2.E) */}
              {uploadUiStatusLabel && (
                <div
                  className={`px-3 py-2 rounded-lg border flex items-center justify-between gap-2 text-xs font-bold ${
                    uploadUiStatus === 'SUCCESS'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                      : uploadUiStatus === 'FAILED_NEEDS_NEW_VERSION' ||
                          uploadUiStatus === 'INTERRUPTED'
                        ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
                        : 'bg-sky-950/80 border-sky-500/50 text-sky-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw
                      className={`w-3.5 h-3.5 shrink-0 ${
                        uploadUiStatus === 'UPLOADING' || uploadUiStatus === 'VERIFYING'
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    <span>Trạng thái tiến trình: {uploadUiStatusLabel}</span>
                  </div>
                  {plannedVersionInfo && (
                    <span className="px-2 py-0.5 rounded bg-black/40 border border-white/15 font-mono text-[10px] text-amber-300">
                      Phiên bản tiếp theo: v{plannedVersionInfo.nextVersion}
                    </span>
                  )}
                </div>
              )}

              {/* Pending Firestore Metadata Sync / Indeterminate F5 Recovery Alert (M7.3.7 Mục II.1.2) */}
              {pendingCatalogSync && (
                <div
                  className={`p-3.5 rounded-xl space-y-2.5 border ${
                    pendingCatalogSync.status === 'UPLOAD_CONFIRMED_METADATA_PENDING'
                      ? 'bg-sky-950/60 border-sky-500/50'
                      : 'bg-amber-950/60 border-amber-500/50'
                  }`}
                >
                  <div className="text-[11px] font-semibold text-white leading-relaxed">
                    {pendingCatalogSync.status === 'UPLOAD_CONFIRMED_METADATA_PENDING' ? (
                      <span className="text-sky-200">
                        <strong className="text-white">[Đã xác minh Storage thành công]</strong> File{' '}
                        <span className="font-mono text-white">
                          {pendingCatalogSync.storagePath}
                        </span>{' '}
                        (v{pendingCatalogSync.version}) đã tồn tại hợp lệ trên Firebase Storage nhưng chưa ghi được metadata lên Firestore. Bạn có thể hoàn tất đồng bộ metadata ngay mà không cần upload lại file.
                      </span>
                    ) : (
                      <span className="text-amber-200">
                        <strong className="text-amber-300">[Upload bị gián đoạn — Cần chọn file tải lên phiên bản mới]</strong>{' '}
                        Tiến trình upload tại{' '}
                        <span className="font-mono text-white">
                          {pendingCatalogSync.storagePath}
                        </span>{' '}
                        (v{pendingCatalogSync.version}) bị gián đoạn khi F5/mất kết nối và object chưa tồn tại hoàn chỉnh trên Firebase Storage. Đường dẫn{' '}
                        <span className="font-mono text-white">v{pendingCatalogSync.version}</span>{' '}
                        được giữ khóa chống ghi đè; khi bạn chọn lại file ảnh, hệ thống sẽ tự động tải lên phiên bản mới{' '}
                        <span className="font-mono font-extrabold text-emerald-300">
                          v{pendingCatalogSync.version + 1}
                        </span>{' '}
                        cho cùng avatar <span className="font-mono text-white">{pendingCatalogSync.avatarId}</span>.
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pendingCatalogSync.status === 'UPLOAD_CONFIRMED_METADATA_PENDING' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleAdminRetryCatalogSync}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>HOÀN TẤT GHI METADATA (KHÔNG UPLOAD LẠI)</span>
                      </button>
                    )}
                    {pendingCatalogSync.status === 'UPLOAD_INDETERMINATE' && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setReplaceTargetId(pendingCatalogSync.avatarId);
                            setCatalogNameInput(pendingCatalogSync.name || 'Chiến Xa Tank');
                            setCatalogSortOrderInput(pendingCatalogSync.sortOrder ?? 10);
                            adminFileInputRef.current?.click();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            CHỌN FILE TẢI LÊN PHIÊN BẢN MỚI (v{pendingCatalogSync.version + 1})
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void avatarManager.discardPendingCatalogUpload()}
                          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-200 border border-amber-500/40 font-bold text-xs cursor-pointer"
                        >
                          BỎ QUA THÔNG BÁO (GIỮ KHÓA PATH v{pendingCatalogSync.version})
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Staged Catalog File Upload Form */}
              {stagedCatalogFile ? (
                <div className="p-3 rounded-xl bg-neutral-900/90 border border-amber-500/40 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      {stagedCatalogFile.previewObjectUrl && (
                        <img
                          src={stagedCatalogFile.previewObjectUrl}
                          alt="Xem trước"
                          className="w-14 h-14 rounded-full object-cover border border-amber-400 shrink-0"
                        />
                      )}
                      <div className="text-[11px] space-y-0.5">
                        <div className="font-bold text-white">
                          {replaceTargetId
                            ? `Cập nhật / Khôi phục cho mã: ${replaceTargetId}`
                            : `Thêm mới: ${stagedCatalogFile.sanitizedFileName}`}
                        </div>
                        <div className="text-neutral-300 font-mono">
                          {stagedCatalogFile.format} • {stagedCatalogFile.width}×
                          {stagedCatalogFile.height} px •{' '}
                          {formatFileSize(stagedCatalogFile.sizeBytes)}
                        </div>
                      </div>
                    </div>

                    {plannedVersionInfo && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-emerald-500/40 text-right">
                        <div className="text-[10px] text-neutral-400">Phiên bản sẽ tạo</div>
                        <div className="text-xs font-extrabold font-mono text-emerald-300">
                          {plannedVersionInfo.targetAvatarId} • v{plannedVersionInfo.nextVersion}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-neutral-400 mb-1">
                        Tên hiển thị avatar (1–60 ký tự)
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={catalogNameInput}
                        onChange={(e) => setCatalogNameInput(e.target.value)}
                        placeholder="VD: Chiến Xa Đại Bàng Vàng"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-400 mb-1">
                        Thứ tự sắp xếp (sortOrder)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={999999}
                        value={catalogSortOrderInput}
                        onChange={(e) =>
                          setCatalogSortOrderInput(Math.max(0, parseInt(e.target.value, 10) || 0))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {uploadProgressPct !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-mono text-amber-300">
                        <span>{uploadUiStatusLabel || 'Đang tải lên Firebase Storage...'}</span>
                        <span>{uploadProgressPct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all"
                          style={{ width: `${uploadProgressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={handleAdminUploadCatalog}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {isBusy
                          ? uploadUiStatusLabel || 'ĐANG TẢI LÊN...'
                          : plannedVersionInfo
                            ? `XÁC NHẬN TẢI LÊN (v${plannedVersionInfo.nextVersion})`
                            : 'TẢI LÊN FIREBASE STORAGE'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAdminCancelStaged}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>HỦY</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[11px] text-neutral-300">
                    Tải ảnh đại diện mới lên Firebase Storage để mọi người chơi lựa chọn.
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setReplaceTargetId(null);
                      adminFileInputRef.current?.click();
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>THÊM AVATAR VÀO DANH MỤC</span>
                  </button>
                </div>
              )}

              {/* Admin Catalog Items Table / List */}
              {allCatalog.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-amber-500/20">
                  <div className="text-[11px] font-bold text-amber-200">
                    Danh sách toàn bộ Avatar trong Danh mục ({allCatalog.length})
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {allCatalog.map((item) => {
                      const itemUrl = avatarManager.getCatalogItemUrl(item.storagePath);
                      return (
                        <div
                          key={item.avatarId}
                          className="p-2 rounded-lg bg-neutral-900/90 border border-neutral-800 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-neutral-700 bg-neutral-950 shrink-0 flex items-center justify-center">
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
                              <div className="text-xs font-bold text-white truncate">
                                {item.name}{' '}
                                <span className="text-[10px] font-mono text-amber-400">
                                  (v{item.version} • #{item.sortOrder})
                                </span>
                              </div>
                              <div className="text-[10px] font-mono text-neutral-400 truncate">
                                {item.storagePath} • {formatFileSize(item.fileSize)}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAdminToggleActive(item)}
                              className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer ${
                                item.isActive
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                              }`}
                              title={
                                item.isActive
                                  ? 'Đang kích hoạt (Nhấn để Ẩn)'
                                  : 'Đang ẩn (Nhấn để Kích hoạt)'
                              }
                            >
                              {item.isActive ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Hiện</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Ẩn</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAdminStartReplace(item)}
                              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold cursor-pointer"
                              title="Thay thế ảnh bằng phiên bản mới (v+1)"
                            >
                              Thay ảnh (v{item.version + 1})
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAdminDeleteCatalogItem(item)}
                              className="p-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 cursor-pointer"
                              title="Xóa khỏi danh mục (Chỉ xóa khi không có người chơi đang dùng)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* =========================================================================
              TAB 3: ÂM THANH (BGM & SFX CÁ NHÂN + QUẢN LÝ NHẠC NỀN SUPER ADMIN)
             ========================================================================= */}
          {activeTab === 'AUDIO_SETTINGS' && (
            <>
              <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                  <div className="flex items-center gap-2 font-bold text-neutral-100 uppercase tracking-wider">
                    <Music className="w-4 h-4 text-amber-400" />
                    <span>ÂM THANH</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    BGM &amp; SFX Độc Lập • Chỉ 1 nguồn BGM phát tại 1 thời điểm
                  </span>
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

                {/* Toggle Super Admin Music Management Panel — ONLY visible for Super Admin */}
                {canShowAdminMusic && (
                  <div className="pt-3 border-t border-neutral-800 flex items-center justify-between">
                    <span className="text-[11px] text-amber-300 font-bold">
                      Quản trị Thư viện Nhạc nền Hệ thống (Super Admin)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMusicAdmin((v) => !v)}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {showMusicAdmin ? 'Thu gọn Quản lý Nhạc' : 'Mở Quản lý Nhạc nền'}
                    </button>
                  </div>
                )}
              </section>

              {canShowAdminMusic && showMusicAdmin && <MusicAdminPanel />}
            </>
          )}

          {/* =========================================================================
              TAB 4: CHẾ ĐỘ CHƠI (M7.3.9 MỤC 4: CHỈ HIỂN THỊ VỚI SUPER ADMIN)
             ========================================================================= */}
          {activeTab === 'GAME_MODE_SETTINGS' && isVerifiedSuperAdmin && (
            <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
                <div className="flex items-center gap-2 font-bold text-neutral-100 uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4 text-amber-400" />
                  <span>CHẾ ĐỘ CHƠI (SUPER ADMIN)</span>
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
                        3 mạng khởi đầu • Nhịp độ cân bằng chuẩn cổ điển.
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
                        1 mạng duy nhất • AI chiến thuật áp lực cao.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-neutral-900/80 border border-neutral-800 space-y-2 text-[11px] text-neutral-300">
                <div className="font-bold text-white">
                  Quy tắc đồng bộ Chế độ chơi &amp; Đội hình Chiến Xa:
                </div>
                <ul className="list-disc list-inside space-y-1 text-neutral-400">
                  <li>
                    Trong <strong className="text-sky-300">Co-op Online</strong>, Chủ phòng (P1) chọn độ khó và cấu hình mật khẩu khi Tạo phòng; Người chơi 2 (P2) sử dụng đúng độ khó của phòng đã tham gia.
                  </li>
                  <li>
                    Đội hình xe tăng địch giữ nguyên tên chuẩn:{' '}
                    <span className="font-mono text-amber-300">
                      Basic Tank, Fast Tank, Power Tank, Armor Tank
                    </span>
                    .
                  </li>
                </ul>
              </div>
            </section>
          )}

          {/* =========================================================================
              TAB 5: CẤP QUYỀN (CHỈ DÀNH CHO SUPER ADMIN linhnk.online@gmail.com)
             ========================================================================= */}
          {activeTab === 'ADMIN_OTHER' && isVerifiedSuperAdmin && (
            <section className="p-4 rounded-xl bg-red-950/20 border border-red-500/40 space-y-4">
              <div className="flex items-center justify-between border-b border-red-500/20 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-extrabold text-red-300 uppercase tracking-wider">
                  <Shield className="w-4 h-4 text-red-400" />
                  <span>CẤP QUYỀN HỆ THỐNG (SUPER ADMIN)</span>
                </div>
                <span className="text-[10px] font-mono text-red-200/80">
                  Super Admin duy nhất: {SUPER_ADMIN_EMAIL}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="text-xs font-bold text-white">
                  Quy ước màu khung tên hiển thị theo phân quyền (M7.3.7 Mục III.2.2):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-neutral-900 border-2 border-red-500 ring-1 ring-red-500/40 flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs">Super Admin</span>
                    <span className="text-[10px] font-mono text-red-300 font-bold">
                      Viền Đỏ (#EF4444)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900 border-2 border-emerald-500 ring-1 ring-emerald-500/40 flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs">Admin</span>
                    <span className="text-[10px] font-mono text-emerald-300 font-bold">
                      Viền Xanh lá (#10B981)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900 border-2 border-sky-500 ring-1 ring-sky-500/40 flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs">Mod</span>
                    <span className="text-[10px] font-mono text-sky-300 font-bold">
                      Viền Xanh dương (#0EA5E9)
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-between">
                    <span className="font-extrabold text-white text-xs">Người chơi thường</span>
                    <span className="text-[10px] font-mono text-neutral-400 font-bold">
                      Viền Mặc định
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Quyền hiển thị và phân quyền quản trị được xác định trực tiếp từ dữ liệu xác thực Google Auth và tài liệu máy chủ đã xác minh, tuyệt đối không tin tưởng dữ liệu tự sửa trong <span className="font-mono text-neutral-300">localStorage</span>.
                </p>
              </div>
            </section>
          )}

          {/* =========================================================================
              TAB 6: TÀI KHOẢN (M7.3.9 MỤC 3: CHỈ DÀNH CHO SUPER ADMIN, PHÂN TRANG 10 TÀI KHOẢN / TRANG)
             ========================================================================= */}
          {activeTab === 'USER_ACCOUNTS' && isVerifiedSuperAdmin && (
            <section className="p-4 rounded-xl bg-neutral-950/80 border border-red-500/40 space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-extrabold text-red-300 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-red-400" />
                  <span>DANH SÁCH TÀI KHOẢN ĐÃ THAM GIA (SUPER ADMIN)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-neutral-400">
                    Tối đa {USER_ACCOUNTS_PAGE_SIZE} tài khoản / trang
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
                    className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingAccounts ? 'animate-spin' : ''}`} />
                    <span>Làm mới</span>
                  </button>
                </div>
              </div>

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
                <div className="space-y-2">
                  {accountsPageList.map((acc, idx) => {
                    const accRoleInfo = getRoleDisplayInfo(acc.role);
                    const rowNumber = accountsPageIndex * USER_ACCOUNTS_PAGE_SIZE + idx + 1;
                    return (
                      <div
                        key={acc.uid}
                        className="p-2.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between gap-3 flex-wrap"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-6 text-center font-mono text-[11px] text-neutral-500 font-bold shrink-0">
                            #{rowNumber}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md bg-neutral-950 text-xs font-extrabold text-white ${accRoleInfo.frameClass}`}
                              >
                                {acc.displayName}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-amber-300">
                                [{accRoleInfo.label}]
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  acc.status === 'ACTIVE'
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                                }`}
                              >
                                {acc.status === 'ACTIVE' ? 'Trực tuyến' : 'Ngoại tuyến'}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-neutral-400 truncate mt-1">
                              {acc.email ? `${acc.email} • ` : ''}UID: {acc.uid}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono text-[10px] text-neutral-400 shrink-0">
                          <div>
                            Avatar: {acc.avatarType === 'catalog' ? `Danh mục (${acc.avatarId || 'N/A'})` : 'Google'}
                          </div>
                          {acc.lastLoginAtMs > 0 && (
                            <div className="text-neutral-500">
                              Hoạt động: {new Date(acc.lastLoginAtMs).toLocaleString('vi-VN')}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination Controls: Trước / Sau */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-neutral-400">
                  Trang <strong className="text-white">{accountsPageIndex + 1}</strong> • Hiển thị{' '}
                  <strong className="text-white">{accountsPageList.length}</strong> / tối đa{' '}
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
                    <span>Trước</span>
                  </button>
                  <button
                    type="button"
                    disabled={!accountsHasNextPage || isLoadingAccounts}
                    onClick={handleNextAccountsPage}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Sau</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </section>
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
