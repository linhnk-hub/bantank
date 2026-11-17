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
  Wrench,
  Power,
  Rocket,
  Mail,
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
  getRoleTrademarkBadge,
  RBAC_PERMISSION_MATRIX,
  hasRolePermission,
  getRoleChangeAuditLogs,
  type UserAccountSummary,
  type DetailedUserAccountProfile,
  type UserRole,
} from '../core/authManager.ts';
import {
  PlayerStatsManager,
  formatPvpRankLabel,
  type PlayerFullStatisticsSnapshot,
} from '../core/playerStatsManager.ts';
import {
  DifficultyConfigManager,
  type DifficultyModeKey,
  type DifficultyProfileParameters,
} from '../core/difficultyManager.ts';
import {
  MaintenanceManager,
  buildMaintenanceNoticeMessage,
  type SystemMaintenanceConfigDocument,
} from '../core/maintenanceManager.ts';
import { MusicAdminPanel } from './MusicAdminPanel.tsx';
import { StageEditorPanel } from './StageEditorPanel.tsx';
import { SystemLogsAdminPanel } from './SystemLogsAdminPanel.tsx';
import { ConfirmationPopupModal } from './ConfirmationPopupModal.tsx';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import {
  getShowOnlineNetStatsPreference,
  setShowOnlineNetStatsPreference,
} from '../core/networkStatsPref.ts';
import { useLanguage, tx } from '../core/i18n.ts';
import { LanguageSelector } from './LanguageSelector.tsx';

export type SettingsTabId =
  | 'ACCOUNT'
  | 'IMAGE_SETTINGS'
  | 'AUDIO_SETTINGS'
  | 'GAME_MODE_SETTINGS'
  | 'ADMIN_OTHER'
  | 'USER_ACCOUNTS'
  | 'SYSTEM_LOGS'
  | 'MAINTENANCE';

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

  // M7.5.1 PHẦN 4: Mục LOG HỆ THỐNG và BẢO TRÌ chỉ dành riêng cho Admin
  if (effectiveRole === 'ADMIN') {
    tabs.push({
      id: 'SYSTEM_LOGS',
      label: 'LOG HỆ THỐNG',
      adminOnly: true,
    });
    tabs.push({
      id: 'MAINTENANCE',
      label: 'BẢO TRÌ',
      adminOnly: true,
    });
  }

  return tabs;
}

function toDatetimeLocalValue(timestampMs: number): string {
  const safeMs = Number.isFinite(timestampMs) && timestampMs > 0 ? timestampMs : Date.now();
  const d = new Date(safeMs);
  const yyyy = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mo}-${dd}T${hh}:${mm}`;
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
  const { t } = useLanguage();
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

  // Account Detail Popup Modal state (when clicking on an account's name in USER_ACCOUNTS)
  const [selectedAccountDetail, setSelectedAccountDetail] =
    useState<DetailedUserAccountProfile | null>(null);
  const [isLoadingAccountDetail, setIsLoadingAccountDetail] = useState<boolean>(false);

  // Detailed Difficulty Editor state (GAME_MODE_SETTINGS)
  const difficultyManager = DifficultyConfigManager.getInstance();
  const [editingDifficultyMode, setEditingDifficultyMode] = useState<DifficultyModeKey>(difficulty);
  const [defaultDiffDraft, setDefaultDiffDraft] = useState<DifficultyProfileParameters>(() =>
    difficultyManager.getProfile('DEFAULT')
  );
  const [extremeDiffDraft, setExtremeDiffDraft] = useState<DifficultyProfileParameters>(() =>
    difficultyManager.getProfile('EXTREME')
  );
  const [isActivatingDifficulty, setIsActivatingDifficulty] = useState<boolean>(false);

  // System Maintenance state (MAINTENANCE tab)
  const maintenanceManager = MaintenanceManager.getInstance();
  const [maintenanceConfig, setMaintenanceConfig] = useState<SystemMaintenanceConfigDocument>(() =>
    maintenanceManager.getConfig()
  );
  const [maintStartInput, setMaintStartInput] = useState<string>(() =>
    toDatetimeLocalValue(maintenanceManager.getConfig().startAtMs)
  );
  const [maintEndInput, setMaintEndInput] = useState<string>(() =>
    toDatetimeLocalValue(maintenanceManager.getConfig().endAtMs)
  );
  const [isUpdatingMaintenance, setIsUpdatingMaintenance] = useState<boolean>(false);

  // Unified Confirmation Popup Modal state
  const [popupNotice, setPopupNotice] = useState<{
    type: 'success' | 'error' | 'info';
    title?: string;
    messages: string[];
  } | null>(null);

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
      const msgText = res.success
        ? `Đã cập nhật vai trò cho ${pendingRoleChangeConfirm.account.email || pendingRoleChangeConfirm.account.uid} thành ${pendingRoleChangeConfirm.label}.`
        : res.errorMessage || 'Không thể cập nhật vai trò.';
      setAccountsRoleFeedback({
        type: res.success ? 'success' : 'error',
        text: msgText,
      });
      setPopupNotice({
        type: res.success ? 'success' : 'error',
        messages: [msgText],
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

  const handleOpenAccountDetail = async (acc: UserAccountSummary) => {
    setIsLoadingAccountDetail(true);
    const localStats = playerStatsManager.getPlayerStatisticsSnapshot(acc.uid);
    const localProg = StageProgressionManager.getInstance().getUserStageProgressSnapshot(acc.uid);
    setSelectedAccountDetail({
      ...acc,
      photoURL: null,
      level: localStats.level,
      totalXp: localStats.totalXp,
      xuBalance: localStats.xuBalance,
      pvpRankCode: localStats.pvpRankCode,
      unlockedStage: localProg.unlockedStage,
      completedStages: [...localProg.completedStages],
      sessionDeviceId: localStats.currentSession.deviceId,
      sessionLastActiveMs: acc.lastLoginAtMs > 0 ? acc.lastLoginAtMs : null,
    });
    try {
      const detailed = await authManager.fetchAccountDetailedProfile(acc);
      setSelectedAccountDetail((prev) => {
        if (!prev || prev.uid !== acc.uid) return prev;
        return {
          ...detailed,
          level: detailed.level ?? localStats.level,
          totalXp: Math.max(detailed.totalXp, localStats.totalXp),
          xuBalance: Math.max(detailed.xuBalance, localStats.xuBalance),
          pvpRankCode: detailed.pvpRankCode ?? localStats.pvpRankCode,
          unlockedStage: Math.max(detailed.unlockedStage, localProg.unlockedStage),
          completedStages:
            detailed.completedStages.length >= localProg.completedStages.length
              ? detailed.completedStages
              : [...localProg.completedStages],
        };
      });
    } finally {
      setIsLoadingAccountDetail(false);
    }
  };

  const handleActivateDifficultySettings = async (targetMode: DifficultyModeKey) => {
    if (isActivatingDifficulty) return;
    setIsActivatingDifficulty(true);
    try {
      const res = await difficultyManager.activateDifficultyConfig({
        targetMode,
        allProfilesPatch: {
          DEFAULT: defaultDiffDraft,
          EXTREME: extremeDiffDraft,
        },
        actorRole: isVerifiedSuperAdmin ? 'ADMIN' : userRole,
        actorEmail: currentUser?.email || SUPER_ADMIN_EMAIL,
      });
      setDefaultDiffDraft(res.config.profiles.DEFAULT);
      setExtremeDiffDraft(res.config.profiles.EXTREME);
      if (res.success) {
        setEditingDifficultyMode(targetMode);
        onDifficultyChange?.(targetMode);
      }
      setPopupNotice({
        type: res.success ? 'success' : 'error',
        messages: [res.message],
      });
    } finally {
      setIsActivatingDifficulty(false);
    }
  };

  const handleActivateMaintenance = async () => {
    if (isUpdatingMaintenance) return;
    const startMs = new Date(maintStartInput).getTime();
    const endMs = new Date(maintEndInput).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      setPopupNotice({
        type: 'error',
        messages: ['Vui lòng chọn Ngày giờ kết thúc bảo trì lớn hơn Ngày giờ bắt đầu bảo trì.'],
      });
      return;
    }
    setIsUpdatingMaintenance(true);
    try {
      const res = await maintenanceManager.activateMaintenance({
        startAtMs: startMs,
        endAtMs: endMs,
        actorRole: isVerifiedSuperAdmin ? 'ADMIN' : userRole,
        actorEmail: currentUser?.email || SUPER_ADMIN_EMAIL,
      });
      setMaintenanceConfig(res.config);
      setPopupNotice({
        type: res.success ? 'success' : 'error',
        messages: [res.message],
      });
    } finally {
      setIsUpdatingMaintenance(false);
    }
  };

  const handleEndMaintenance = async () => {
    if (isUpdatingMaintenance) return;
    setIsUpdatingMaintenance(true);
    try {
      const res = await maintenanceManager.endMaintenance({
        actorRole: isVerifiedSuperAdmin ? 'ADMIN' : userRole,
        actorEmail: currentUser?.email || SUPER_ADMIN_EMAIL,
      });
      setMaintenanceConfig(res.config);
      setPopupNotice({
        type: res.success ? 'success' : 'error',
        messages: [res.message],
      });
    } finally {
      setIsUpdatingMaintenance(false);
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
    const unsubDiff = difficultyManager.subscribe(() => {
      setDefaultDiffDraft(difficultyManager.getProfile('DEFAULT'));
      setExtremeDiffDraft(difficultyManager.getProfile('EXTREME'));
    });
    const unsubMaint = maintenanceManager.subscribe(() => {
      const cfg = maintenanceManager.getConfig();
      setMaintenanceConfig(cfg);
      setMaintStartInput(toDatetimeLocalValue(cfg.startAtMs));
      setMaintEndInput(toDatetimeLocalValue(cfg.endAtMs));
    });
    return () => {
      unsubAvatar();
      unsubSound();
      unsubStats();
      unsubDiff();
      unsubMaint();
    };
  }, [
    avatarManager,
    authManager,
    currentUid,
    soundManager,
    playerStatsManager,
    difficultyManager,
    maintenanceManager,
  ]);

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
    const msg = 'Đã khôi phục cài đặt âm thanh mặc định (Nhạc nền 35%, Hiệu ứng 50%).';
    setFeedback({
      type: 'success',
      text: msg,
    });
    setPopupNotice({
      type: 'success',
      messages: [msg],
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
        setPopupNotice({
          type: 'success',
          messages: [res.message || 'Đã cập nhật ảnh đại diện mặc định thành công.'],
        });
      } else {
        const errText = res.message || 'Không thể chọn ảnh đại diện.';
        setFeedback({
          type: 'error',
          text: errText,
        });
        setPopupNotice({
          type: 'error',
          messages: [errText],
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
        setPopupNotice({
          type: 'success',
          messages: [res.message || `Đã cập nhật ảnh đại diện mới.`],
        });
      } else {
        const errText = res.message || 'Không thể chọn ảnh đại diện này.';
        setFeedback({
          type: 'error',
          text: errText,
        });
        setPopupNotice({
          type: 'error',
          messages: [errText],
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
      setPopupNotice({
        type: res.success ? 'success' : 'error',
        messages: [res.message],
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
      case 'MAINTENANCE':
        return <Wrench className="w-3.5 h-3.5" />;
    }
  };

  const availableTabs = getAvailableSettingsTabsForRole(
    isVerifiedSuperAdmin ? 'ADMIN' : userRole
  ).map((tab) => ({
    ...tab,
    icon: getTabIcon(tab.id),
  }));

  const recentLoginHistory = playerStats.authHistory
    .filter((evt) => evt.eventType === 'LOGIN')
    .slice(0, 5);

  return (
    <div
      data-testid="settings-modal-backdrop"
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 bg-[#050510]/88 backdrop-blur-md animate-fade-in select-none"
    >
      <ConfirmationPopupModal
        isOpen={Boolean(popupNotice)}
        type={popupNotice?.type ?? 'success'}
        title={popupNotice?.title}
        messages={popupNotice?.messages ?? []}
        onClose={() => setPopupNotice(null)}
      />

      <div
        data-testid="settings-modal-frame"
        className={`bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-lg ${UNIFIED_SETTINGS_MODAL_WIDTH_CLASS} max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-[0_0_32px_rgba(0,0,0,0.85)] overflow-hidden`}
      >
        {/* Header */}
        <div className="bg-[#050510] px-4 py-3 border-b border-[#687386]/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#FFB800]/15 border border-[#FFB800]/50 flex items-center justify-center text-[#FFB800]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-btn text-sm font-black text-[#EAF4FF] flex items-center gap-2 uppercase tracking-wider">
                {t('CÀI ĐẶT HỆ THỐNG', 'SYSTEM SETTINGS')}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSelector compact />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded bg-[#0b0d1e] hover:bg-[#10142b] border border-[#687386]/50 text-[#EAF4FF] hover:text-[#FFB800] transition-all active:scale-95 cursor-pointer"
              title={t('Đóng cài đặt', 'Close settings')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (M7.3.9 Mục 3 & 4) */}
        <div className="bg-[#050510]/95 px-3 py-2 border-b border-[#687386]/40 flex items-center gap-1.5 overflow-x-auto shrink-0">
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
                className={`font-btn px-3 py-1.5 rounded text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer touch-manipulation ${
                  isSelected
                    ? tab.adminOnly
                      ? 'bg-[#FF0055]/20 text-[#FF0055] border border-[#FF0055] shadow-sm'
                      : 'bg-[#FFB800] text-[#050510] border border-[#EAF4FF]/80 shadow-sm'
                    : tab.adminOnly
                      ? 'bg-[#0b0d1e] text-[#FF0055]/85 border border-[#FF0055]/40 hover:border-[#FF0055]'
                      : 'bg-[#0b0d1e] text-[#EAF4FF]/85 border border-[#687386]/50 hover:border-[#00F0FF]/70 hover:text-[#00F0FF]'
                }`}
              >
                {tab.icon}
                <span>
                  {tab.id === 'ACCOUNT'
                    ? t('Thông tin', 'Profile')
                    : tab.id === 'IMAGE_SETTINGS'
                      ? t('Hình ảnh', 'Images')
                      : tab.id === 'AUDIO_SETTINGS'
                        ? t('Âm thanh', 'Audio')
                        : tab.id === 'GAME_MODE_SETTINGS'
                          ? t('Chế độ chơi', 'Game Modes')
                          : tab.id === 'ADMIN_OTHER'
                            ? t('Cấp quyền', 'Permissions')
                            : tab.id === 'USER_ACCOUNTS'
                              ? t('Tài khoản', 'Accounts')
                              : tab.id === 'SYSTEM_LOGS'
                                ? t('Nhật ký', 'System Logs')
                                : tab.id === 'MAINTENANCE'
                                  ? t('Bảo trì', 'Maintenance')
                                  : tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs scrollbar-thin flex-1">
          {/* Feedback Banner */}
          {feedback && (
            <div
              className={`p-3 rounded border flex items-center justify-between gap-2 text-xs ${
                feedback.type === 'error'
                  ? 'bg-[#200510]/90 border-[#FF0055] text-[#EAF4FF]'
                  : 'bg-[#051624]/90 border-[#00F0FF] text-[#EAF4FF]'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-[#FF0055] shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#00F0FF] shrink-0" />
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
            <section className="neo-bevel-card bg-[#050510]/85 border border-[#687386]/40 rounded p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-[#687386]/30 pb-2.5 flex-wrap gap-2">
                <div className="font-btn flex items-center gap-2 font-bold text-[#FFB800] uppercase tracking-wider">
                  <User className="w-4 h-4 text-[#FFB800]" />
                  <span>{t('THÔNG TIN CÁ NHÂN', 'PERSONAL PROFILE')}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Khung tên người chơi với ký hiệu vai trò thu nhỏ viết lên trên */}
                  <div
                    className={`px-2.5 py-1 rounded bg-[#0b0d1e] flex items-center gap-1.5 ${roleFrameClasses}`}
                  >
                    <span className="inline-flex items-baseline text-xs font-extrabold text-[#FFB800] min-w-0">
                      <span className="truncate max-w-[150px]">
                        {userMeta?.displayName || currentUser.displayName || 'Commander'}
                      </span>
                      {getRoleTrademarkBadge(userRole) && (
                        <sup
                          data-testid="role-trademark-badge"
                          className="ml-0.5 text-[9px] font-black leading-none text-[#FFB800] select-none shrink-0"
                        >
                          {getRoleTrademarkBadge(userRole)}
                        </sup>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Khu vực ẢNH ĐẠI DIỆN NGƯỜI CHƠI — M7.3.11.6 Section 5: Chỉ hiển thị hình ảnh Avatar, không hiển thị tên/phiên bản/trạng thái/đường dẫn và không có nút upload */}
              <div className="p-4 rounded neo-bevel-card bg-[#0b0d1e]/90 border border-[#687386]/40 space-y-4 shadow-inner">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[#687386]/30 pb-2.5">
                  <div className="font-btn flex items-center gap-2 font-extrabold text-[#FFB800] text-xs sm:text-sm uppercase tracking-wider">
                    <Camera className="w-4 h-4 text-[#FFB800]" />
                    <span>{t('ẢNH ĐẠI DIỆN', 'AVATAR')}</span>
                  </div>
                </div>

                {/* Current Active Avatar Preview (Image Only + Enlarged Blurred Backdrop) */}
                <div className="relative overflow-hidden flex items-center justify-center p-4 rounded bg-[#050510]/90 border border-[#FFB800]/40">
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
                    aria-label={t('Chọn ảnh đại diện mặc định', 'Select default avatar')}
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
                        aria-label={t('Chọn ảnh đại diện', 'Select avatar')}
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
                    {t('Đổi tên', 'Display Name')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={32}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t('(tối đa 32 ký tự)', '(max 32 characters)')}
                      className="flex-1 px-3 py-2 rounded-xl bg-neutral-900 border border-neutral-700 text-white text-xs focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 shadow active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{t('LƯU', 'SAVE')}</span>
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
                    <span>
                      {t(
                        'Hiển thị Ping & FPS (Chơi Online 2 người)',
                        'Show Ping & FPS (2-Player Online)'
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-relaxed whitespace-pre-line">
                    {formatSentenceLineBreaks(
                      t(
                        'Hiển thị độ trễ mạng (Ping) và tốc độ khung hình (FPS) trong trận Co-op Online. Có thể bật hoặc tắt bất kỳ lúc nào.',
                        'Display network latency (Ping) and frame rate (FPS) during Co-op Online matches. Can be toggled anytime.'
                      )
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
                  {showOnlineNetStats ? t('ĐANG BẬT', 'ON') : t('ĐANG TẮT', 'OFF')}
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
                    <span>{t('THỐNG KÊ CHI TIẾT', 'DETAILED STATISTICS')}</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                      playerStats.currentSession.isOnlineActive
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                  >
                    {t('Phiên:', 'Session:')}{' '}
                    {playerStats.currentSession.isOnlineActive ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* 4 trụ cột phân biệt rõ: Level • Quân hàm PvP • Điểm XP • Số dư Xu */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div
                    data-testid="stat-card-player-level"
                    className="p-3 rounded-xl bg-neutral-950 border border-sky-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>{t('Level (Cấp độ 1–50)', 'Level (1–50)')}</span>
                      <Award className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-extrabold font-mono tabular-nums text-sky-300">
                        {playerStats.level !== null ? `Lv. ${playerStats.level}` : 'Lv. --'}
                      </span>
                      {playerStats.isMaxLevel && (
                        <span
                          data-testid="system-max-level-badge"
                          className="px-1.5 py-0.5 rounded bg-amber-500 text-black text-[9px] font-mono font-black uppercase"
                        >
                          MAX LEVEL
                        </span>
                      )}
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
                      <span>{t('Quân hàm PvP', 'PvP Rank')}</span>
                      <Shield className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="text-sm font-extrabold text-purple-300 truncate">
                      {playerStats.pvpRankLabel}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {t('Tách biệt hoàn toàn với Level & XP', 'Independent from Level & XP')}
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-total-xp"
                    className="p-3 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>{t('Tổng điểm XP tích lũy', 'Total Accumulated XP')}</span>
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="text-sm font-extrabold font-mono tabular-nums text-amber-300">
                      {playerStats.xpVerificationStatus === 'VERIFIED'
                        ? `${playerStats.totalXp.toLocaleString('vi-VN')} XP`
                        : t('Chưa xác minh', 'Unverified')}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-neutral-400">
                      {t('Kỷ lục trận:', 'Match Best:')}{' '}
                      {playerStats.highScoreXp.toLocaleString('vi-VN')} XP
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-xu-balance"
                    className="p-3 rounded-xl bg-neutral-950 border border-emerald-500/30 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 font-semibold">
                      <span>{t('Số dư Xu', 'Xu Balance')}</span>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                    <div className="text-sm font-extrabold font-mono tabular-nums text-emerald-300">
                      {playerStats.xuBalance.toLocaleString('vi-VN')} Xu
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      {t('Độc lập, không tự quy đổi từ XP', 'Independent currency from XP')}
                    </div>
                  </div>
                </div>

                {/* M7.5.2 Mục 6.2: Thanh tiến độ Level 0–100%, XP_NEXT, XP_REMAINING & MAX LEVEL */}
                <div
                  data-testid="player-level-progress-panel"
                  className="p-3.5 rounded-xl bg-neutral-950/90 border border-sky-500/25 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-extrabold font-mono text-sky-200">
                      <span>
                        {t('Tiến độ Level:', 'Level Progress:')}{' '}
                        {playerStats.level !== null ? `Lv. ${playerStats.level}` : 'Lv. --'}
                      </span>
                      {playerStats.isMaxLevel && (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-black text-[10px] font-black uppercase">
                          MAX LEVEL
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono font-bold tabular-nums text-amber-300">
                      {playerStats.xpVerificationStatus === 'VERIFIED'
                        ? `${playerStats.levelProgressPercent}%`
                        : '--%'}
                    </span>
                  </div>

                  <div
                    data-testid="player-level-progress-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(playerStats.levelProgressPercent)}
                    className="w-full h-2.5 rounded-lg bg-neutral-800 border border-neutral-700/80 overflow-hidden"
                  >
                    <svg
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                      className="w-full h-full block"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={playerStats.levelProgressPercent}
                        height="10"
                        className={playerStats.isMaxLevel ? 'fill-amber-400' : 'fill-sky-400'}
                      />
                    </svg>
                  </div>

                  {playerStats.xpVerificationStatus !== 'VERIFIED' ? (
                    <div className="text-[11px] font-mono text-neutral-400">
                      {t(
                        'Trạng thái XP chưa được xác minh — hệ thống không hiển thị Level giả định.',
                        'XP state unverified — system does not display assumed Level.'
                      )}
                    </div>
                  ) : playerStats.isMaxLevel ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono tabular-nums text-amber-200">
                      <span>
                        {t('Tổng XP tích lũy:', 'Total XP:')}{' '}
                        {playerStats.totalXp.toLocaleString('vi-VN')} XP
                      </span>
                      <span>
                        {t(
                          'Đã đạt cấp tối đa (MAX LEVEL) • Tiếp tục tích lũy XP',
                          'MAX LEVEL reached • Continue accumulating XP'
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">
                          {t('Tổng XP: ', 'Total XP: ')}
                        </span>
                        <strong className="text-amber-300">
                          {playerStats.totalXp.toLocaleString('vi-VN')} XP
                        </strong>
                      </div>
                      <div className="text-neutral-300">
                        <span className="text-neutral-500">
                          {t('Mốc cấp tiếp theo: ', 'Next Level XP: ')}
                        </span>
                        <strong className="text-sky-300">
                          {(playerStats.xpNext ?? 0).toLocaleString('vi-VN')} XP
                        </strong>
                      </div>
                      <div className="text-neutral-300 sm:text-right">
                        <span className="text-neutral-500">
                          {t('Còn thiếu: ', 'Remaining: ')}
                        </span>
                        <strong className="text-emerald-300">
                          {(playerStats.xpRemaining ?? 0).toLocaleString('vi-VN')} XP
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Thành tích Chiến dịch & Hoạt động chiến đấu (Đầy đủ SOLO, CO-OP AI, CO-OP Online & 4 loại xe địch) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  <div
                    data-testid="stat-card-campaign-progress"
                    className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1.5"
                  >
                    <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      {t('Tiến độ Chiến dịch', 'Campaign Progress')}
                    </div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {t('Đã hoàn thành:', 'Unlocked:')}
                    </div>
                    <div className="space-y-1 pt-0.5 border-t border-neutral-800/80 text-[10px] font-mono text-neutral-300">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- SOLO:</span>
                        <span className="font-bold text-amber-200">
                          Stage {playerStats.campaignByMode.SOLO.unlockedStage}/{TOTAL_CAMPAIGN_STAGES}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- CO-OP AI:</span>
                        <span className="font-bold text-sky-200">
                          Stage {playerStats.campaignByMode.COOP_AI.unlockedStage}/{TOTAL_CAMPAIGN_STAGES}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- CO-OP Online:</span>
                        <span className="font-bold text-emerald-200">
                          Stage {playerStats.campaignByMode.COOP_ONLINE.unlockedStage}/{TOTAL_CAMPAIGN_STAGES}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-matches-completed"
                    className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1.5"
                  >
                    <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      {t('Trận đã hoàn thành', 'Matches Completed')}
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-extrabold font-mono text-white">
                        {t(
                          `Tổng: ${playerStats.matchesPlayed} trận`,
                          `Total: ${playerStats.matchesPlayed}`
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        <span className="text-emerald-300">
                          {playerStats.matchesWon}
                          {t('T', 'W')}
                        </span>
                        /
                        <span className="text-rose-300">
                          {playerStats.matchesLost}
                          {t('B', 'L')}
                        </span>
                      </span>
                    </div>
                    <div className="space-y-1 pt-0.5 border-t border-neutral-800/80 text-[10px] font-mono text-neutral-300">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- SOLO:</span>
                        <span>
                          <strong className="text-white">{playerStats.matchesByMode.SOLO.played}</strong>{' '}
                          (<span className="text-emerald-300">{playerStats.matchesByMode.SOLO.won} {t('T', 'W')}</span> •{' '}
                          <span className="text-rose-300">{playerStats.matchesByMode.SOLO.lost} {t('B', 'L')}</span>)
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- CO-OP AI:</span>
                        <span>
                          <strong className="text-white">{playerStats.matchesByMode.COOP_AI.played}</strong>{' '}
                          (<span className="text-emerald-300">{playerStats.matchesByMode.COOP_AI.won} {t('T', 'W')}</span> •{' '}
                          <span className="text-rose-300">{playerStats.matchesByMode.COOP_AI.lost} {t('B', 'L')}</span>)
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-neutral-400">- CO-OP Online:</span>
                        <span>
                          <strong className="text-white">{playerStats.matchesByMode.COOP_ONLINE.played}</strong>{' '}
                          (<span className="text-emerald-300">{playerStats.matchesByMode.COOP_ONLINE.won} {t('T', 'W')}</span> •{' '}
                          <span className="text-rose-300">{playerStats.matchesByMode.COOP_ONLINE.lost} {t('B', 'L')}</span>)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div
                    data-testid="stat-card-enemies-defeated"
                    className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1.5"
                  >
                    <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      {t('Tiêu diệt xe địch', 'Enemies Defeated')}
                    </div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {t(
                        `Tổng: ${playerStats.totalEnemiesDefeated} xe`,
                        `Total: ${playerStats.totalEnemiesDefeated}`
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5 border-t border-neutral-800/80 text-[10px] font-mono text-neutral-300">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300">Basic:</span>
                        <strong className="text-white">{playerStats.defeatedByType.BASIC}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-blue-400">Fast:</span>
                        <strong className="text-blue-400">{playerStats.defeatedByType.FAST}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400">Power:</span>
                        <strong className="text-emerald-400">{playerStats.defeatedByType.POWER}</strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-300">Armor:</span>
                        <strong className="px-1 rounded bg-black border border-white text-white">{playerStats.defeatedByType.ARMOR}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-1.5">
                    <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                      Co-op Online
                    </div>
                    <div className="text-xs font-extrabold font-mono text-white">
                      {t(
                        `${playerStats.coopRoomsParticipated} phòng`,
                        `${playerStats.coopRoomsParticipated} rooms`
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-500 pt-0.5 border-t border-neutral-800/80">
                      {t('Đã tạo hoặc tham gia', 'Created or joined')}
                    </div>
                  </div>
                </div>

                {/* Lịch sử truy cập & Trạng thái hiện tại */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>{t('Tổng số lần đăng nhập', 'Total Sign-ins')}</span>
                    </div>
                    <div
                      data-testid="stat-total-logins"
                      className="text-xs font-extrabold font-mono text-amber-300"
                    >
                      {t(`${playerStats.totalLogins} lần`, `${playerStats.totalLogins} times`)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">
                      {t('Đăng nhập đầu tiên', 'First Sign-in')}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-200">
                      {playerStats.firstLoginAtMs
                        ? new Date(playerStats.firstLoginAtMs).toLocaleString('vi-VN')
                        : t('Chưa ghi nhận', 'Not recorded')}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-0.5">
                    <div className="text-[10px] text-neutral-400">
                      {t('Đăng nhập gần nhất', 'Latest Sign-in')}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-200">
                      {playerStats.lastLoginAtMs
                        ? new Date(playerStats.lastLoginAtMs).toLocaleString('vi-VN')
                        : t('Chưa ghi nhận', 'Not recorded')}
                    </div>
                  </div>
                </div>

                {/* Chi tiết trạng thái hiện tại (Đã bỏ Timeout nhàn rỗi & Mã phiên, sửa thành Trạng thái) */}
                <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="text-neutral-300">
                    {t('Trạng thái:', 'Status:')}{' '}
                    <strong
                      className={
                        playerStats.currentSession.isOnlineActive
                          ? 'text-emerald-300'
                          : 'text-neutral-400'
                      }
                    >
                      {playerStats.currentSession.status}
                    </strong>
                  </div>
                </div>

                {/* Lịch sử truy cập (Chỉ thống kê 5 lần truy cập thành công gần nhất của tài khoản) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {t(
                          `Lịch sử truy cập (${recentLoginHistory.length}/5 lần gần nhất)`,
                          `Sign-in History (${recentLoginHistory.length}/5 recent)`
                        )}
                      </span>
                    </span>
                  </div>
                  {recentLoginHistory.length === 0 ? (
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-500">
                      {t(
                        'Chưa có bản ghi lịch sử truy cập cho tài khoản này.',
                        'No sign-in history recorded for this account yet.'
                      )}
                    </div>
                  ) : (
                    <div
                      data-testid="player-auth-history-list"
                      className="max-h-36 overflow-y-auto space-y-1 pr-1"
                    >
                      {recentLoginHistory.map((evt) => (
                        <div
                          key={evt.id}
                          className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold font-mono bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                              {t('TRUY CẬP THÀNH CÔNG', 'SIGN-IN SUCCESS')}
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
                  <span>
                    {t(
                      `HÌNH ẢNH • DANH MỤC AVATAR TĨNH (${allCatalog.length} MẪU)`,
                      `IMAGES • STATIC AVATAR CATALOG (${allCatalog.length} ITEMS)`
                    )}
                  </span>
                </div>
                <span className="text-[10px] text-emerald-300 font-mono font-bold">
                  public/avatar/ava01.png .. ava11.png
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed whitespace-pre-line">
                {formatSentenceLineBreaks(
                  t(
                    'Chức năng tải lên, thay thế và xóa Avatar từ trình duyệt đã được khóa cố định theo thiết lập Media Tĩnh. Toàn bộ người chơi sử dụng trực tiếp 11 mẫu Avatar chuẩn tích hợp sẵn hoặc ảnh đại diện Google cá nhân.',
                    'Browser avatar upload, replace, and delete actions are locked under Static Media Policy. All players use the 11 built-in avatars or their Google profile picture.'
                  )
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
                          {t('Tĩnh • Mở', 'Static • Active')}
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
                      {t(
                        'BGM & SFX Độc Lập • Chỉ 1 nguồn BGM phát tại 1 thời điểm',
                        'Independent BGM & SFX • Single active BGM source'
                      )}
                    </span>
                    <button
                      type="button"
                      data-testid="audio-reset-defaults-btn"
                      onClick={handleResetAudioDefaults}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                      title={t(
                        'Khôi phục cài đặt âm thanh mặc định',
                        'Restore default audio settings'
                      )}
                    >
                      <RefreshCw className="w-3 h-3 text-amber-400" />
                      <span>{t('Mặc định', 'Reset Default')}</span>
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
                      <span>{t('Nhạc nền (BGM)', 'Background Music (BGM)')}</span>
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
                      {audioSettings.bgmEnabled ? t('ĐANG BẬT', 'ON') : t('ĐANG TẮT', 'OFF')}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-400 w-28 shrink-0">
                      {t('Âm lượng nhạc nền:', 'BGM Volume:')}
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
                      <span>{t('Âm thanh hiệu ứng (SFX)', 'Sound Effects (SFX)')}</span>
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
                      {audioSettings.sfxEnabled ? t('ĐANG BẬT', 'ON') : t('ĐANG TẮT', 'OFF')}
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-neutral-400 w-28 shrink-0">
                      {t('Âm lượng hiệu ứng:', 'SFX Volume:')}
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
                      {t(
                        'Quản trị Thư viện Media & Âm thanh Hệ thống',
                        'System Media & Audio Library Administration'
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowMusicAdmin((v) => !v)}
                      className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      {showMusicAdmin
                        ? t('Thu gọn Quản lý Media', 'Collapse Media Admin')
                        : t('Mở Quản lý Media', 'Open Media Admin')}
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
                  <span>CHẾ ĐỘ CHƠI &amp; THIẾT LẬP ĐỘ KHÓ CHI TIẾT</span>
                </div>
                <span className="text-[10px] text-neutral-400 font-mono">
                  SOLO • CO-OP AI • CO-OP Online
                </span>
              </div>

              {/* Thiết lập chi tiết thông số Độ khó & Nút Kích hoạt */}
              <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-amber-300 uppercase tracking-wider">
                      Điều chỉnh chi tiết Độ khó &amp; Kích hoạt chế độ mặc định
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      Tùy chỉnh thời gian trận, số mạng khởi đầu Solo/Co-op, số lượng xe địch tối đa trên sân và nhịp độ xuất hiện/bắn của xe địch.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
                  {/* Card 1: GIẢI TRÍ (DEFAULT) */}
                  <div
                    className={`p-3.5 rounded-xl border space-y-3 transition-all ${
                      difficulty === 'DEFAULT' || editingDifficultyMode === 'DEFAULT'
                        ? 'bg-emerald-950/25 border-emerald-500/70 ring-1 ring-emerald-500/30'
                        : 'bg-neutral-950/80 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                      <div>
                        <div className="font-extrabold text-xs text-emerald-300">
                          1. GIẢI TRÍ (MẶC ĐỊNH)
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          Solo {defaultDiffDraft.soloLives} mạng • Co-op {defaultDiffDraft.coopLives} mạng • {defaultDiffDraft.durationSeconds}s
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="activate-difficulty-default-btn"
                        disabled={!isVerifiedSuperAdmin || isActivatingDifficulty}
                        onClick={() => void handleActivateDifficultySettings('DEFAULT')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-1 shadow cursor-pointer shrink-0"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        <span>Kích hoạt</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Thời gian trận (giây)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={600}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.durationSeconds}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              durationSeconds: Number(e.target.value) || 120,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Xe địch tối đa trên sân
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.maxActiveEnemies}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              maxActiveEnemies: Number(e.target.value) || 5,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Mạng khởi đầu SOLO
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.soloLives}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              soloLives: Number(e.target.value) || 3,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Mạng khởi đầu CO-OP
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.coopLives}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              coopLives: Number(e.target.value) || 3,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Giãn cách ra địch (giây)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min={0.3}
                          max={5.0}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.spawnIntervalS}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              spawnIntervalS: Number(e.target.value) || 1.0,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Hệ số tốc độ xe địch
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min={0.5}
                          max={2.0}
                          disabled={!isVerifiedSuperAdmin}
                          value={defaultDiffDraft.enemySpeedScale}
                          onChange={(e) =>
                            setDefaultDiffDraft((prev) => ({
                              ...prev,
                              enemySpeedScale: Number(e.target.value) || 1.0,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 2: THỬ THÁCH (EXTREME) */}
                  <div
                    className={`p-3.5 rounded-xl border space-y-3 transition-all ${
                      difficulty === 'EXTREME' || editingDifficultyMode === 'EXTREME'
                        ? 'bg-rose-950/25 border-rose-500/70 ring-1 ring-rose-500/30'
                        : 'bg-neutral-950/80 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2">
                      <div>
                        <div className="font-extrabold text-xs text-rose-300">
                          2. THỬ THÁCH (SIÊU KHÓ)
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          Solo {extremeDiffDraft.soloLives} mạng • Co-op {extremeDiffDraft.coopLives} mạng • {extremeDiffDraft.durationSeconds}s
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="activate-difficulty-extreme-btn"
                        disabled={!isVerifiedSuperAdmin || isActivatingDifficulty}
                        onClick={() => void handleActivateDifficultySettings('EXTREME')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-black font-extrabold text-xs flex items-center gap-1 shadow cursor-pointer shrink-0"
                      >
                        <Rocket className="w-3.5 h-3.5" />
                        <span>Kích hoạt</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Thời gian trận (giây)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={600}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.durationSeconds}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              durationSeconds: Number(e.target.value) || 60,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Xe địch tối đa trên sân
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={12}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.maxActiveEnemies}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              maxActiveEnemies: Number(e.target.value) || 5,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Mạng khởi đầu SOLO
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.soloLives}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              soloLives: Number(e.target.value) || 2,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Mạng khởi đầu CO-OP
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={9}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.coopLives}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              coopLives: Number(e.target.value) || 1,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Giãn cách ra địch (giây)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min={0.3}
                          max={5.0}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.spawnIntervalS}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              spawnIntervalS: Number(e.target.value) || 1.0,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-neutral-400 mb-1">
                          Hệ số tốc độ xe địch
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min={0.5}
                          max={2.0}
                          disabled={!isVerifiedSuperAdmin}
                          value={extremeDiffDraft.enemySpeedScale}
                          onChange={(e) =>
                            setExtremeDiffDraft((prev) => ({
                              ...prev,
                              enemySpeedScale: Number(e.target.value) || 1.0,
                            }))
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 text-white font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

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

              {/* Role Trademark Badge Legend */}
              <div className="space-y-2 pt-1">
                <div className="text-xs font-bold text-white">
                  Quy ước ký hiệu chức danh viết thu nhỏ phía trên tên người chơi:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-between">
                    <span className="font-extrabold text-white text-[11px]">
                      Admin
                      <sup className="ml-0.5 text-[9px] font-black text-amber-300">
                        {getRoleTrademarkBadge('ADMIN')}
                      </sup>
                    </span>
                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                      Ký hiệu {getRoleTrademarkBadge('ADMIN')}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-neutral-900 border border-neutral-700/80 flex items-center justify-between">
                    <span className="font-extrabold text-white text-[11px]">
                      Mod
                      <sup className="ml-0.5 text-[9px] font-black text-amber-300">
                        {getRoleTrademarkBadge('MOD')}
                      </sup>
                    </span>
                    <span className="text-[10px] font-mono text-amber-300 font-bold">
                      Ký hiệu {getRoleTrademarkBadge('MOD')}
                    </span>
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
              TAB 6: TÀI KHOẢN (ĐÃ BỎ CỘT TIẾN ĐỘ STAGE • BẤM VÀO TÊN HIỆN CHI TIẾT TÀI KHOẢN)
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
                    Bấm vào tên tài khoản để xem chi tiết • {USER_ACCOUNTS_PAGE_SIZE} tài khoản / trang
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
                        <th className="py-2.5 px-2.5 font-bold">Tên (Bấm để xem chi tiết)</th>
                        <th className="py-2.5 px-2.5 font-bold">Email</th>
                        <th className="py-2.5 px-2.5 font-bold whitespace-nowrap">Quyền</th>
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

                            {/* 2. Nickname (Clickable to view full Account Detail Modal) */}
                            <td className="py-2.5 px-2.5">
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  data-testid={`account-name-btn-${acc.uid}`}
                                  onClick={() => void handleOpenAccountDetail(acc)}
                                  title="Bấm để xem bảng thông tin chi tiết tài khoản này"
                                  className={`inline-flex items-baseline w-fit px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 hover:border-amber-400/70 text-xs font-extrabold text-white transition-all cursor-pointer ${accRoleInfo.frameClass}`}
                                >
                                  <span className="underline decoration-amber-400/60 underline-offset-2">
                                    {acc.displayName}
                                  </span>
                                  {accRoleInfo.trademarkBadge && (
                                    <sup
                                      data-testid="role-trademark-badge"
                                      className="ml-0.5 text-[9px] font-black leading-none text-amber-300 select-none"
                                    >
                                      {accRoleInfo.trademarkBadge}
                                    </sup>
                                  )}
                                </button>
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

              {/* Account Detail Popup Modal */}
              {selectedAccountDetail && (
                <div
                  data-testid="account-detail-popup-modal"
                  role="dialog"
                  aria-modal="true"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setSelectedAccountDetail(null);
                    }
                  }}
                  className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
                >
                  <div className="w-full max-w-lg rounded-2xl bg-neutral-900 border-2 border-amber-500/70 shadow-2xl overflow-hidden text-xs">
                    <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-extrabold text-amber-300 uppercase tracking-wider">
                        <User className="w-4 h-4 text-amber-400" />
                        <span>THÔNG TIN CHI TIẾT TÀI KHOẢN</span>
                      </div>
                      <button
                        type="button"
                        data-testid="account-detail-close-btn"
                        onClick={() => setSelectedAccountDetail(null)}
                        className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 space-y-3.5 max-h-[75dvh] overflow-y-auto">
                      {/* Header card with Avatar & Name */}
                      <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400 bg-neutral-900 flex items-center justify-center shrink-0">
                            {(() => {
                              const resolvedAvatar =
                                selectedAccountDetail.avatarType === 'catalog' &&
                                selectedAccountDetail.avatarId
                                  ? avatarManager.getCatalogItemUrl(
                                      `avatar/${selectedAccountDetail.avatarId}.png`
                                    )
                                  : selectedAccountDetail.photoURL;
                              return resolvedAvatar ? (
                                <img
                                  src={resolvedAvatar}
                                  alt={selectedAccountDetail.displayName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-amber-400" />
                              );
                            })()}
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-sm text-white">
                                {selectedAccountDetail.displayName}
                                {getRoleTrademarkBadge(selectedAccountDetail.role) && (
                                  <sup className="ml-0.5 text-[10px] font-black text-amber-300">
                                    {getRoleTrademarkBadge(selectedAccountDetail.role)}
                                  </sup>
                                )}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                  selectedAccountDetail.role === 'ADMIN'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/70'
                                    : selectedAccountDetail.role === 'MOD'
                                      ? 'bg-sky-950 text-sky-300 border border-sky-600/70'
                                      : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                                }`}
                              >
                                {selectedAccountDetail.role === 'PLAYER'
                                  ? 'User'
                                  : getRoleDisplayInfo(selectedAccountDetail.role).label}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-neutral-300 flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3 text-neutral-400 shrink-0" />
                              <span>{selectedAccountDetail.email || 'Chưa đồng bộ email'}</span>
                            </div>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border ${
                            selectedAccountDetail.status === 'ACTIVE'
                              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600/70'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          }`}
                        >
                          {selectedAccountDetail.status === 'ACTIVE' ? 'Đang Online' : 'Offline'}
                        </span>
                      </div>

                      {isLoadingAccountDetail && (
                        <div className="text-[11px] font-mono text-amber-300 flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang đồng bộ chi tiết hồ sơ từ Firestore...</span>
                        </div>
                      )}

                      {/* Grid Info */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Mã định danh (UID)</div>
                          <div className="font-mono text-[11px] text-white break-all">
                            {selectedAccountDetail.uid}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Level &amp; Tổng XP</div>
                          <div className="font-mono text-xs font-extrabold text-sky-300">
                            {selectedAccountDetail.level !== null
                              ? `Lv. ${selectedAccountDetail.level}`
                              : 'Lv. 1'}{' '}
                            •{' '}
                            <span className="text-amber-300">
                              {selectedAccountDetail.totalXp.toLocaleString('vi-VN')} XP
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Quân hàm PvP &amp; Số dư Xu</div>
                          <div className="font-mono text-[11px] text-purple-300 font-bold">
                            {formatPvpRankLabel(selectedAccountDetail.pvpRankCode)} •{' '}
                            <span className="text-emerald-300">
                              {selectedAccountDetail.xuBalance.toLocaleString('vi-VN')} Xu
                            </span>
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Tiến độ Chiến dịch</div>
                          <div className="font-mono text-[11px] text-amber-300 font-bold">
                            Stage {selectedAccountDetail.unlockedStage}/{TOTAL_CAMPAIGN_STAGES} (Đã qua{' '}
                            {selectedAccountDetail.completedStages.length} màn)
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Ngày tạo hồ sơ</div>
                          <div className="font-mono text-[11px] text-neutral-200">
                            {selectedAccountDetail.createdAtMs > 0
                              ? new Date(selectedAccountDetail.createdAtMs).toLocaleString('vi-VN')
                              : 'Mới tham gia'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-0.5">
                          <div className="text-[10px] text-neutral-400">Truy cập gần nhất</div>
                          <div className="font-mono text-[11px] text-neutral-200">
                            {selectedAccountDetail.lastLoginAtMs > 0
                              ? new Date(selectedAccountDetail.lastLoginAtMs).toLocaleString('vi-VN')
                              : 'Chưa ghi nhận'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="px-4 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setSelectedAccountDetail(null)}
                        className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs cursor-pointer"
                      >
                        ĐÓNG CHI TIẾT
                      </button>
                    </div>
                  </div>
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

          {/* =========================================================================
              TAB 8: BẢO TRÌ HỆ THỐNG (CHỈ DUY NHẤT ADMIN linhnk2013@gmail.com)
             ========================================================================= */}
          {activeTab === 'MAINTENANCE' && isVerifiedSuperAdmin && (
            <section
              data-testid="system-maintenance-admin-panel"
              className="p-4 rounded-xl bg-neutral-950/90 border border-amber-500/50 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 flex-wrap gap-2">
                <div className="flex items-center gap-2 font-extrabold text-amber-300 uppercase tracking-wider">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  <span>QUẢN LÝ BẢO TRÌ HỆ THỐNG</span>
                </div>
                <span
                  data-testid="maintenance-status-badge"
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold font-mono border ${
                    maintenanceConfig.isActive
                      ? 'bg-rose-950 text-rose-300 border-rose-500 animate-pulse'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-600/70'
                  }`}
                >
                  {maintenanceConfig.isActive
                    ? 'ĐANG BẢO TRÌ HỆ THỐNG'
                    : 'HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-[11px] text-neutral-300 leading-relaxed space-y-1">
                <p>
                  Khi bấm <strong className="text-rose-300">Kích hoạt bảo trì</strong>:
                </p>
                <ul className="list-disc list-inside text-neutral-400 space-y-0.5">
                  <li>
                    Tự động thoát toàn bộ phiên đăng nhập của người chơi trên toàn hệ thống.
                  </li>
                  <li>
                    Hiện thông báo trực tiếp trên màn hình người chơi đang chơi kèm nút{' '}
                    <strong className="text-amber-300">Thoát về Menu</strong>.
                  </li>
                  <li>
                    Tại màn hình Menu chào mừng, nút <strong>ĐĂNG NHẬP</strong> và{' '}
                    <strong>CHƠI THỬ</strong> sẽ bị làm mờ và tạm khóa cho đến khi kết thúc bảo trì.
                  </li>
                </ul>
              </div>

              {/* Ngày giờ bắt đầu & Ngày giờ kết thúc bảo trì */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-1.5">
                  <label className="block text-xs font-bold text-amber-300">
                    Ngày giờ bắt đầu bảo trì
                  </label>
                  <input
                    type="datetime-local"
                    data-testid="maintenance-start-input"
                    value={maintStartInput}
                    onChange={(e) => setMaintStartInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-neutral-900 border border-neutral-800 space-y-1.5">
                  <label className="block text-xs font-bold text-amber-300">
                    Ngày giờ kết thúc bảo trì
                  </label>
                  <input
                    type="datetime-local"
                    data-testid="maintenance-end-input"
                    value={maintEndInput}
                    onChange={(e) => setMaintEndInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-700 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Xem trước nội dung thông báo bảo trì */}
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-1">
                <div className="text-[10px] font-bold text-amber-300 uppercase">
                  Nội dung thông báo hiển thị tới người chơi:
                </div>
                <div
                  data-testid="maintenance-preview-message"
                  className="text-xs font-bold text-white leading-relaxed whitespace-pre-line"
                >
                  &ldquo;
                  {formatSentenceLineBreaks(
                    buildMaintenanceNoticeMessage(
                      new Date(maintStartInput).getTime(),
                      new Date(maintEndInput).getTime()
                    )
                  )}
                  &rdquo;
                </div>
              </div>

              {/* Nút Kích hoạt bảo trì & Nút Kết thúc bảo trì */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  data-testid="btn-activate-maintenance"
                  disabled={isUpdatingMaintenance}
                  onClick={() => void handleActivateMaintenance()}
                  className="flex-1 min-w-[180px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  <Power className="w-4 h-4" />
                  <span>
                    {isUpdatingMaintenance ? 'Đang xử lý...' : 'KÍCH HOẠT BẢO TRÌ'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="btn-end-maintenance"
                  disabled={isUpdatingMaintenance || !maintenanceConfig.isActive}
                  onClick={() => void handleEndMaintenance()}
                  className="flex-1 min-w-[180px] py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>KẾT THÚC BẢO TRÌ</span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#050510] px-4 py-3 border-t border-neutral-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="font-btn min-h-[44px] py-2 px-5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold text-xs transition-transform active:scale-95 shadow cursor-pointer"
          >
            {t('ĐÓNG CÀI ĐẶT', 'CLOSE SETTINGS')}
          </button>
        </div>
      </div>
    </div>
  );
};
