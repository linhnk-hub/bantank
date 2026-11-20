/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
  getRoleTrademarkBadge,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { PlayerStatsManager } from '../core/playerStatsManager.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import { CoopOnlineLobbyPanel, type CoopLobbySubView } from './CoopOnlineLobbyModal.tsx';
import { TopMenuActionDrawer } from './TopMenuActionDrawer.tsx';
import { useLanguage } from '../core/i18n.ts';
import { CoopOnlineManager, type CoopRoomDocument } from '../core/coopOnlineManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { StageProgressionManager } from '../core/stageProgression.ts';
import { StageManager } from '../core/stageManager.ts';
import { DifficultyConfigManager } from '../core/difficultyManager.ts';
import { StageMapMiniPreview } from './StageMapMiniPreview.tsx';
import type { VsMode } from '../core/vsTypes.ts';
import {
  ArrowLeft,
  ArrowRight,
  UserCheck,
  User,
  Bot,
  Globe,
  CheckCircle2,
  Flame,
  Shield,
  Lock,
  Map as MapIcon,
  Unlock,
} from 'lucide-react';

export type GameModeType = 'SOLO' | 'TWO_PLAYERS';
export type TwoPlayerOption = 'P2_AI' | 'P2_REAL';
export type SelectionCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';
export type SelectionFlowStep = 'SELECT_MODE' | 'SELECT_DIFFICULTY' | 'COOP_ONLINE_LOBBY';

let lastSelectedCampaignStageId = 1;

export interface ModeSelectionScreenProps {
  user: {
    uid?: string;
    email: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    photoURL?: string | null;
    role?: string | null;
  };
  firebaseUser?: FirebaseUser | null;
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onBack: () => void;
  onStartMatch: (mode: GameModeType, twoPlayerOption?: TwoPlayerOption, stageId?: number) => void;
  onStartOnlineMatch?: (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => void;
  onStartVsMatch?: (mode: VsMode) => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenContact?: () => void;
  onOpenDevTools: () => void;
  selectedMode?: GameModeType;
  onSelectedModeChange?: (mode: GameModeType) => void;
  twoPlayerOption?: TwoPlayerOption;
  onTwoPlayerOptionChange?: (opt: TwoPlayerOption) => void;
  initialFlowStep?: SelectionFlowStep;
  initialCardMode?: SelectionCardMode;
  isSuperAdmin?: boolean;
}

/**
 * Pixel-art Style Retro Tank SVG Icons (NES 1990 style)
 * Tank P1: Màu đỏ (Red)
 * Tank P2: Màu vàng (Yellow)
 */
const RetroTankIconP1: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    style={{ shapeRendering: 'crispEdges' }}
  >
    <rect x="4" y="6" width="4" height="20" fill="#7F1D1D" />
    <rect x="4" y="7" width="2" height="3" fill="#F87171" />
    <rect x="4" y="12" width="2" height="3" fill="#F87171" />
    <rect x="4" y="17" width="2" height="3" fill="#F87171" />
    <rect x="4" y="22" width="2" height="3" fill="#F87171" />
    <rect x="24" y="6" width="4" height="20" fill="#7F1D1D" />
    <rect x="26" y="7" width="2" height="3" fill="#F87171" />
    <rect x="26" y="12" width="2" height="3" fill="#F87171" />
    <rect x="26" y="17" width="2" height="3" fill="#F87171" />
    <rect x="26" y="22" width="2" height="3" fill="#F87171" />
    <rect x="8" y="8" width="16" height="16" fill="#DC2626" />
    <rect x="10" y="10" width="12" height="12" fill="#EF4444" />
    <rect x="14" y="2" width="4" height="9" fill="#DC2626" />
    <rect x="15" y="2" width="2" height="8" fill="#FCA5A5" />
    <rect x="12" y="12" width="8" height="8" fill="#991B1B" />
    <rect x="14" y="14" width="4" height="4" fill="#FEE2E2" />
  </svg>
);

const RetroTankIconP2: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    style={{ shapeRendering: 'crispEdges' }}
  >
    <rect x="4" y="6" width="4" height="20" fill="#B45309" />
    <rect x="4" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="22" width="2" height="3" fill="#FBBF24" />
    <rect x="24" y="6" width="4" height="20" fill="#B45309" />
    <rect x="26" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="22" width="2" height="3" fill="#FBBF24" />
    <rect x="8" y="8" width="16" height="16" fill="#EAB308" />
    <rect x="10" y="10" width="12" height="12" fill="#FACC15" />
    <rect x="14" y="2" width="4" height="9" fill="#CA8A04" />
    <rect x="15" y="2" width="2" height="8" fill="#FEF08A" />
    <rect x="12" y="12" width="8" height="8" fill="#A16207" />
    <rect x="14" y="14" width="4" height="4" fill="#FEF9C3" />
  </svg>
);

export const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({
  user,
  firebaseUser,
  session,
  isProcessing,
  onBack,
  onStartMatch,
  onStartOnlineMatch,
  onStartVsMatch,
  difficulty,
  onDifficultyChange,
  onOpenSettings,
  onOpenSupport,
  onOpenContact,
  onOpenDevTools,
  selectedMode: controlledMode,
  onSelectedModeChange,
  twoPlayerOption: controlledTwoPlayerOption,
  onTwoPlayerOptionChange,
  initialFlowStep,
  initialCardMode,
  isSuperAdmin = false,
}) => {
  const { t } = useLanguage();

  const deriveInitialCardMode = (): SelectionCardMode => {
    const activeRoom = CoopOnlineManager.getInstance().getCurrentRoom();
    if (
      activeRoom &&
      activeRoom.status !== 'FINISHED' &&
      activeRoom.status !== 'ABANDONED' &&
      activeRoom.status !== 'EXPIRED'
    ) {
      return 'COOP_ONLINE';
    }
    if (initialCardMode) {
      return initialCardMode;
    }
    if (controlledMode === 'TWO_PLAYERS') {
      return controlledTwoPlayerOption === 'P2_REAL' ? 'COOP_ONLINE' : 'COOP_AI';
    }
    return 'SOLO';
  };

  const deriveInitialFlowStep = (): SelectionFlowStep => {
    const activeRoom = CoopOnlineManager.getInstance().getCurrentRoom();
    if (
      activeRoom &&
      activeRoom.status !== 'FINISHED' &&
      activeRoom.status !== 'ABANDONED' &&
      activeRoom.status !== 'EXPIRED'
    ) {
      return 'COOP_ONLINE_LOBBY';
    }
    if (initialFlowStep) {
      return initialFlowStep;
    }
    return 'SELECT_MODE';
  };

  const [cardMode, setCardMode] = useState<SelectionCardMode>(deriveInitialCardMode);
  const [flowStep, setFlowStep] = useState<SelectionFlowStep>(deriveInitialFlowStep);
  const [activeOnlineRoom, setActiveOnlineRoom] = useState<CoopRoomDocument | null>(() =>
    CoopOnlineManager.getInstance().getCurrentRoom()
  );
  const [signalingReady, setSignalingReady] = useState<boolean>(() =>
    CoopOnlineManager.getInstance().isRoomSignalingReady()
  );
  const avatarManager = AvatarManager.getInstance();
  const playerStatsMgr = PlayerStatsManager.getInstance();
  const effectiveUid = user.uid || firebaseUser?.uid || '';
  const [avatarError, setAvatarError] = useState(false);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [, setAvatarTick] = useState(0);
  const [playerStats, setPlayerStats] = useState(() =>
    playerStatsMgr.getPlayerStatisticsSnapshot(effectiveUid)
  );
  const [stageProgress, setStageProgress] = useState(() =>
    StageProgressionManager.getInstance().getUserStageProgressSnapshot(effectiveUid)
  );
  const [selectedStageId, setSelectedStageId] = useState<number>(() => {
    const maxUnlocked = isSuperAdmin
      ? 10
      : Math.max(
          1,
          StageProgressionManager.getInstance().getUnlockedStageForUser(effectiveUid, false)
        );
    return Math.min(Math.max(1, lastSelectedCampaignStageId), maxUnlocked);
  });
  const [stageSelectError, setStageSelectError] = useState<string | null>(null);
  const stageManager = StageManager.getInstance();
  const difficultyMgr = DifficultyConfigManager.getInstance();
  const [, setStageCatalogRev] = useState(0);
  const [difficultyConfigState, setDifficultyConfigState] = useState(() =>
    difficultyMgr.getConfig()
  );

  useEffect(() => {
    const unsubDiff = difficultyMgr.subscribe(() => {
      setDifficultyConfigState(difficultyMgr.getConfig());
    });
    return unsubDiff;
  }, [difficultyMgr]);

  useEffect(() => {
    const unsubStages = stageManager.subscribe(() => {
      setStageCatalogRev((r) => r + 1);
    });
    return unsubStages;
  }, [stageManager]);

  useEffect(() => {
    const progMgr = StageProgressionManager.getInstance();
    const syncProg = () => {
      const snap = progMgr.getUserStageProgressSnapshot(effectiveUid);
      setStageProgress(snap);
      const maxUnlocked = isSuperAdmin ? 10 : Math.max(1, snap.unlockedStage);
      setSelectedStageId((prev) => {
        const clamped = prev > maxUnlocked ? maxUnlocked : prev < 1 ? 1 : prev;
        lastSelectedCampaignStageId = clamped;
        return clamped;
      });
    };
    syncProg();
    return progMgr.subscribe(syncProg);
  }, [effectiveUid, isSuperAdmin]);

  useEffect(() => {
    const syncStats = () => {
      setPlayerStats(playerStatsMgr.getPlayerStatisticsSnapshot(effectiveUid));
    };
    syncStats();
    if (effectiveUid) {
      void playerStatsMgr.refreshCloudUserStatsOnce(effectiveUid);
    }
    return playerStatsMgr.subscribe(syncStats);
  }, [playerStatsMgr, effectiveUid]);

  useEffect(() => {
    const coopMgr = CoopOnlineManager.getInstance();
    return coopMgr.subscribe((room) => {
      setActiveOnlineRoom(room);
      setSignalingReady(coopMgr.isRoomSignalingReady());
      if (
        room &&
        room.status === 'WAITING' &&
        flowStep !== 'COOP_ONLINE_LOBBY'
      ) {
        setCardMode('COOP_ONLINE');
        setFlowStep('COOP_ONLINE_LOBBY');
      }
    });
  }, [flowStep]);

  useEffect(() => {
    avatarManager.observeCatalog();
    if (effectiveUid) {
      avatarManager.observeUserMetadata(effectiveUid);
    }
    const unsub = avatarManager.subscribe(() => {
      setAvatarTick((t) => t + 1);
      setAvatarError(false);
    });
    return unsub;
  }, [avatarManager, effectiveUid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: effectiveUid,
    photoURL: user?.photoURL,
  });

  useEffect(() => {
    setAvatarError(false);
  }, [resolvedAvatarUrl]);

  const handleSelectCardMode = (next: SelectionCardMode) => {
    setCardMode(next);
    if (next === 'SOLO') {
      onSelectedModeChange?.('SOLO');
    } else if (next === 'COOP_AI') {
      onSelectedModeChange?.('TWO_PLAYERS');
      onTwoPlayerOptionChange?.('P2_AI');
    } else {
      onSelectedModeChange?.('TWO_PLAYERS');
      onTwoPlayerOptionChange?.('P2_REAL');
    }
  };

  const isSessionDisplacedOrExpired =
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'EXPIRED';
  const isSessionUnverified =
    session.status === 'CONNECTION_LOST_UNVERIFIED' ||
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED';
  const isSessionActive = !isSessionDisplacedOrExpired && !isSessionUnverified;
  const profileMeta = effectiveUid ? avatarManager.getUserMetadata(effectiveUid) : null;
  const effectiveUser = {
    ...user,
    displayName: profileMeta?.displayName || user.displayName,
  };
  const displayLabel = getUserDisplayLabel(effectiveUser);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);
  void roleFrameClasses;
  const roleTrademarkBadge = getRoleTrademarkBadge(userRole);

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  const handleConfirmCardMode = (next: SelectionCardMode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleSelectCardMode(next);
    if (next === 'COOP_ONLINE') {
      // M7.3.7 Mục VI.5.1: Khi chọn 3. CO-OP ONLINE, mở trực tiếp màn hình Tạo phòng / Tham gia phòng
      setFlowStep('COOP_ONLINE_LOBBY');
    } else {
      setFlowStep('SELECT_DIFFICULTY');
    }
  };

  const handleConfirmDifficulty = (nextDiff: 'DEFAULT' | 'EXTREME', e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDifficultyChange(nextDiff);
    if (!isSessionActive || isProcessing) return;
    if (cardMode === 'COOP_ONLINE') {
      setFlowStep('COOP_ONLINE_LOBBY');
      return;
    }
    if (!isSuperAdmin) {
      const access = StageProgressionManager.getInstance().canUserAccessStage(
        effectiveUid,
        selectedStageId,
        false
      );
      if (!access.allowed) {
        setStageSelectError(
          access.errorMessage ||
            t(
              `Màn ${selectedStageId} đang bị khóa.`,
              `Stage ${selectedStageId} is locked.`
            )
        );
        return;
      }
    }
    setStageSelectError(null);
    lastSelectedCampaignStageId = selectedStageId;
    if (cardMode === 'SOLO') {
      onStartMatch('SOLO', 'P2_AI', selectedStageId);
    } else if (cardMode === 'COOP_AI') {
      onStartMatch('TWO_PLAYERS', 'P2_AI', selectedStageId);
    }
  };

  const [onlineLobbySubView, setOnlineLobbySubView] = useState<CoopLobbySubView>('MAIN');

  const handleOnlineMatchStartedProp = useCallback(
    (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => {
      onStartOnlineMatch?.(room, role);
    },
    [onStartOnlineMatch]
  );

  const isInsideOnlineWaitingRoom =
    flowStep === 'COOP_ONLINE_LOBBY' &&
    Boolean(
      activeOnlineRoom &&
        activeOnlineRoom.status !== 'FINISHED' &&
        activeOnlineRoom.status !== 'ABANDONED' &&
        activeOnlineRoom.status !== 'EXPIRED' &&
        signalingReady
    );

  const handleTopBack = () => {
    if (isInsideOnlineWaitingRoom) {
      void CoopOnlineManager.getInstance().leaveRoom().finally(() => {
        setOnlineLobbySubView('MAIN');
      });
      return;
    }
    if (flowStep === 'COOP_ONLINE_LOBBY' && onlineLobbySubView !== 'MAIN') {
      setOnlineLobbySubView('MAIN');
      return;
    }
    onBack();
  };

  const handleTopMenuExit = () => {
    if (isInsideOnlineWaitingRoom) {
      void CoopOnlineManager.getInstance().leaveRoom().finally(() => {
        onBack();
      });
      return;
    }
    onBack();
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] select-none overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Background Ambience */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.16),rgba(0,240,255,0.05),rgba(5,5,16,0))] pointer-events-none" />
      <div className="fixed inset-0 bg-grid-pattern opacity-35 pointer-events-none" />

      {/* Top Header Bar — Frameless Player Name & Horizontal Slide-Out Menu */}
      <header className="sticky top-0 z-40 w-full border-b border-[#00F0FF]/25 bg-[#050510]/96 px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.75)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-0">
          {/* Left: Back Button (Always visible across sub-views including online waiting room) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              data-testid="mode-selection-back-btn"
              onClick={handleTopBack}
              className="font-btn px-2 py-1.5 rounded bg-transparent hover:bg-white/10 text-[#EAF4FF] border-0 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer text-sm font-bold"
              title={t('Quay lại', 'Back')}
            >
              <ArrowLeft className="w-4 h-4 text-[#FFB800] shrink-0" />
              <span>{t('Quay lại', 'Back')}</span>
            </button>
          </div>

          {/* Right: Frameless User Profile, Audio, Settings & Info */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <div className={`${isTopMenuOpen ? 'hidden sm:flex' : 'flex'} items-center gap-1.5 sm:gap-2 px-1 py-1 text-sm min-w-0`}>
              {resolvedAvatarUrl && !avatarError ? (
                <img
                  src={resolvedAvatarUrl}
                  alt={displayLabel}
                  className="w-6 h-6 rounded-full object-cover shrink-0"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserCheck className="w-4 h-4 text-[#00F0FF] shrink-0" />
              )}
              <span className="inline-flex items-baseline font-bold text-[#FFB800] text-sm sm:text-base min-w-0">
                <span className="truncate max-w-[95px] xs:max-w-[130px] sm:max-w-[185px]">
                  {displayLabel}
                </span>
                {roleTrademarkBadge && (
                  <sup
                    data-testid="role-trademark-badge"
                    className="ml-0.5 text-[10px] font-black leading-none text-[#FFB800] select-none shrink-0"
                  >
                    {roleTrademarkBadge}
                  </sup>
                )}
              </span>
              <span
                data-testid="top-menu-player-rank"
                className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-amber-950/70 border border-[#FFB800]/50 text-[#FFB800] text-xs font-bold shrink-0"
              >
                {playerStats.rankBadge}
              </span>
              <span
                data-testid="top-menu-player-stars"
                className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-950/50 border border-amber-400/40 text-amber-300 text-xs font-mono font-bold shrink-0"
                title={t('25 XP = 1 Sao ⭐', '25 XP = 1 Star ⭐')}
              >
                <span>⭐</span>
                <span>{playerStats.starBalance.toLocaleString('vi-VN')}</span>
              </span>
              <span
                data-testid="top-menu-player-level"
                className="hidden"
              >
                {playerStats.rankBadge}
              </span>
              {badgeInfo.label && (
                <span className={`hidden sm:inline-block text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>

            <TopMenuActionDrawer
              onOpenSettings={onOpenSettings}
              onOpenSupport={onOpenSupport}
              onOpenContact={onOpenContact}
              onOpenDevTools={onOpenDevTools}
              onExit={handleTopMenuExit}
              exitLabel={t('Về trang chủ', 'Return Home')}
              isSuperAdmin={isSuperAdmin}
              onOpenChange={setIsTopMenuOpen}
            />
          </div>
        </div>
      </header>

      {/* Main Content Area - Top Aligned */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-3 sm:px-4 pt-3 sm:pt-5 pb-3 sm:pb-4 max-w-5xl mx-auto w-full">
        <div className="w-full max-w-4xl flex flex-col items-center text-center">
          {/* ===================================================================
              STEP 1: CHỌN CHẾ ĐỘ CHƠI (SOLO / CO-OP AI / CO-OP ONLINE)
             =================================================================== */}
          {flowStep === 'SELECT_MODE' && (
            <>
              <div className="mb-4 flex flex-col items-center">
                <h1 className="font-btn text-[clamp(1.35rem,5.2vw,2.25rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-[#FFB800] to-amber-600 tracking-wide sm:tracking-wider drop-shadow-lg uppercase">
                  {t('CHỌN CHẾ ĐỘ CHƠI', 'SELECT GAME MODE')}
                </h1>
              </div>

              {/* Compact 3-Column Mode Quick-Selector Bar */}
              <div
                data-testid="mode-select-quick-tabs"
                className="w-full max-w-2xl grid grid-cols-3 gap-2 mb-4"
              >
                <button
                  type="button"
                  data-testid="mode-quick-tab-solo"
                  aria-pressed={cardMode === 'SOLO'}
                  onClick={(e) => handleConfirmCardMode('SOLO', e)}
                  className={`min-h-[48px] px-2 py-2 neo-bevel-card font-btn font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer touch-manipulation flex items-center justify-center gap-1.5 ${
                    cardMode === 'SOLO'
                      ? 'border-2 border-[#FFB800] bg-[#FFB800] text-[#050510] shadow-[0_0_16px_rgba(255,184,0,0.35)]'
                      : 'border border-[#687386]/50 text-[#EAF4FF] hover:border-[#FFB800]/70'
                  }`}
                >
                  <User className="w-4 h-4 shrink-0" />
                  <span>SOLO</span>
                </button>

                <button
                  type="button"
                  data-testid="mode-quick-tab-coop-ai"
                  aria-pressed={cardMode === 'COOP_AI'}
                  onClick={(e) => handleConfirmCardMode('COOP_AI', e)}
                  className={`min-h-[48px] px-2 py-2 neo-bevel-card font-btn font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer touch-manipulation flex items-center justify-center gap-1.5 ${
                    cardMode === 'COOP_AI'
                      ? 'border-2 border-[#00F0FF] bg-[#00F0FF] text-[#050510] shadow-[0_0_16px_rgba(0,240,255,0.35)]'
                      : 'border border-[#687386]/50 text-[#EAF4FF] hover:border-[#00F0FF]/70'
                  }`}
                >
                  <Bot className="w-4 h-4 shrink-0" />
                  <span>CO-OP A.I</span>
                </button>

                <button
                  type="button"
                  data-testid="mode-quick-tab-coop-online"
                  aria-pressed={cardMode === 'COOP_ONLINE'}
                  onClick={(e) => handleConfirmCardMode('COOP_ONLINE', e)}
                  className={`min-h-[48px] px-2 py-2 neo-bevel-card font-btn font-black text-xs sm:text-sm uppercase tracking-wider transition-all cursor-pointer touch-manipulation flex items-center justify-center gap-1.5 ${
                    cardMode === 'COOP_ONLINE'
                      ? 'border-2 border-[#FFB800] bg-[#FFB800] text-[#050510] shadow-[0_0_16px_rgba(255,184,0,0.35)]'
                      : 'border border-[#687386]/50 text-[#EAF4FF] hover:border-[#FFB800]/70'
                  }`}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>CO-OP ONLINE</span>
                </button>
              </div>

              {/* Primary Confirm / Accept Selected Mode Button */}
              <div className="w-full max-w-md mb-4">
                <button
                  type="button"
                  data-testid="mode-select-primary-confirm-btn"
                  onClick={(e) => handleConfirmCardMode(cardMode, e)}
                  className="font-btn w-full min-h-[48px] py-3 px-5 neo-clip-corner bg-[#FFB800] hover:bg-[#ffc933] active:translate-y-[1px] text-[#050510] font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(255,184,0,0.4)] border-2 border-[#EAF4FF]/85 touch-manipulation"
                >
                  <span>
                    {cardMode === 'SOLO'
                      ? t('Xác nhận: SOLO', 'Confirm: SOLO')
                      : cardMode === 'COOP_AI'
                        ? t('Xác nhận: CO-OP A.I', 'Confirm: CO-OP A.I')
                        : t('Xác nhận: CO-OP ONLINE', 'Confirm: CO-OP ONLINE')}
                  </span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
              </div>

              {/* 3 Mode Cards */}
              <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
                {/* 1. SOLO */}
                <div
                  data-testid="mode-card-solo"
                  onClick={(e) => handleConfirmCardMode('SOLO', e)}
                  className={`relative p-4 sm:p-5 rounded-lg border-2 transition-all cursor-pointer touch-manipulation text-left flex flex-col justify-between ${
                    cardMode === 'SOLO'
                      ? 'bg-[#120e05]/90 border-[#FFB800] ring-2 ring-[#FFB800]/30 shadow-[0_0_24px_rgba(255,184,0,0.2)]'
                      : 'bg-[#0b0d1e]/90 border-[#687386]/40 hover:border-[#FFB800]/60 opacity-95'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-btn inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40">
                        <User className="w-3.5 h-3.5 text-[#FFB800]" />
                        <span>P1</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'SOLO'
                            ? 'border-[#FFB800] bg-[#FFB800]'
                            : 'border-[#687386] bg-[#050510]'
                        }`}
                      >
                        {cardMode === 'SOLO' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded bg-[#FFB800]/10 border border-[#FFB800]/30 shrink-0">
                        <RetroTankIconP1 className="w-10 h-10" />
                      </div>
                      <div>
                        <h2 className="font-btn text-lg sm:text-xl font-black text-[#EAF4FF] tracking-wide">
                          SOLO
                        </h2>
                      </div>
                    </div>

                    <p className="text-sm text-neutral-200 leading-snug">
                      {t(
                        'Độc lập tiêu diệt 30 xe địch và bảo vệ căn cứ.',
                        'Eliminate 30 enemy tanks and defend the base solo.'
                      )}
                    </p>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      data-testid="mode-confirm-solo-btn"
                      onClick={(e) => handleConfirmCardMode('SOLO', e)}
                      className={`font-btn w-full min-h-[48px] py-2.5 px-4 rounded font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer touch-manipulation shadow ${
                        cardMode === 'SOLO'
                          ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] shadow-[#FFB800]/25'
                          : 'bg-[#050510] hover:bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40'
                      }`}
                    >
                      <span>{t('Xác nhận', 'Confirm')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. CO-OP A.I */}
                <div
                  data-testid="mode-card-coop-ai"
                  onClick={(e) => handleConfirmCardMode('COOP_AI', e)}
                  className={`relative p-4 sm:p-5 rounded-lg border-2 transition-all cursor-pointer touch-manipulation text-left flex flex-col justify-between ${
                    cardMode === 'COOP_AI'
                      ? 'bg-[#051624]/90 border-[#00F0FF] ring-2 ring-[#00F0FF]/30 shadow-[0_0_24px_rgba(0,240,255,0.2)]'
                      : 'bg-[#0b0d1e]/90 border-[#687386]/40 hover:border-[#00F0FF]/60 opacity-95'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-btn inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40">
                        <Bot className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span>{t('P1 + A.I', 'P1 + A.I')}</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'COOP_AI'
                            ? 'border-[#00F0FF] bg-[#00F0FF]'
                            : 'border-[#687386] bg-[#050510]'
                        }`}
                      >
                        {cardMode === 'COOP_AI' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded bg-[#00F0FF]/10 border border-[#00F0FF]/30 shrink-0 flex items-center gap-1">
                        <RetroTankIconP1 className="w-7 h-7" />
                        <RetroTankIconP2 className="w-7 h-7" />
                      </div>
                      <div>
                        <h2 className="font-btn text-lg sm:text-xl font-black text-[#EAF4FF] tracking-wide">
                          CO-OP A.I
                        </h2>
                      </div>
                    </div>

                    <p className="text-sm text-neutral-200 leading-snug">
                      {t(
                        'Phối hợp cùng xe tăng A.I tiêu diệt quân địch.',
                        'Team up with an A.I tank partner to clear enemies.'
                      )}
                    </p>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      data-testid="mode-confirm-coop-ai-btn"
                      onClick={(e) => handleConfirmCardMode('COOP_AI', e)}
                      className={`font-btn w-full min-h-[48px] py-2.5 px-4 rounded font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer touch-manipulation shadow ${
                        cardMode === 'COOP_AI'
                          ? 'bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] shadow-[#00F0FF]/25'
                          : 'bg-[#050510] hover:bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40'
                      }`}
                    >
                      <span>{t('Xác nhận', 'Confirm')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 3. CO-OP ONLINE */}
                <div
                  data-testid="mode-card-coop-online"
                  onClick={(e) => handleConfirmCardMode('COOP_ONLINE', e)}
                  className={`relative p-4 sm:p-5 rounded-lg border-2 transition-all cursor-pointer touch-manipulation text-left flex flex-col justify-between ${
                    cardMode === 'COOP_ONLINE'
                      ? 'bg-[#051624]/90 border-[#00F0FF] ring-2 ring-[#00F0FF]/30 shadow-[0_0_24px_rgba(0,240,255,0.2)]'
                      : 'bg-[#0b0d1e]/90 border-[#687386]/40 hover:border-[#00F0FF]/60 opacity-95'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="font-btn inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold bg-[#00F0FF]/15 text-[#00F0FF] border border-[#00F0FF]/40">
                        <Globe className="w-3.5 h-3.5 text-[#00F0FF]" />
                        <span>{t('2 NGƯỜI', '2 PLAYERS')}</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'COOP_ONLINE'
                            ? 'border-[#00F0FF] bg-[#00F0FF]'
                            : 'border-[#687386] bg-[#050510]'
                        }`}
                      >
                        {cardMode === 'COOP_ONLINE' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 rounded bg-[#00F0FF]/10 border border-[#00F0FF]/30 shrink-0 flex items-center gap-1">
                        <RetroTankIconP1 className="w-7 h-7" />
                        <RetroTankIconP2 className="w-7 h-7" />
                      </div>
                      <div>
                        <h2 className="font-btn text-lg sm:text-xl font-black text-[#EAF4FF] tracking-wide">
                          CO-OP ONLINE
                        </h2>
                      </div>
                    </div>

                    <p className="text-sm text-neutral-200 leading-snug">
                      {t(
                        'Tạo hoặc vào phòng bằng mã BTxxxx cùng bạn bè.',
                        'Create or join a room via BTxxxx code with a friend.'
                      )}
                    </p>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      data-testid="mode-confirm-coop-online-btn"
                      onClick={(e) => handleConfirmCardMode('COOP_ONLINE', e)}
                      className={`font-btn w-full min-h-[48px] py-2.5 px-4 rounded font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer touch-manipulation shadow ${
                        cardMode === 'COOP_ONLINE'
                          ? 'bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] shadow-[#00F0FF]/25'
                          : 'bg-[#050510] hover:bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40'
                      }`}
                    >
                      <span>{t('Xác nhận', 'Confirm')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. NHÓM VS (P1 vs P2 & P1 + A.I vs P2 + A.I — ĐÃ MỞ KHÓA theo BTO-VS-GAMEPLAY-V1.2) */}
              <div
                data-testid="mode-group-vs"
                className="w-full mb-6 p-4 rounded-lg border-2 border-[#FF0055]/55 bg-[#12060c]/90 text-left shadow-lg"
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3 pb-2 border-b border-[#FF0055]/30">
                  <div className="font-btn flex items-center gap-2 text-sm sm:text-base font-black text-[#FF0055] uppercase tracking-wider">
                    <Flame className="w-4 h-4 text-[#FF0055]" />
                    <span>{t('CHẾ ĐỘ ĐỐI KHÁNG: VS', 'VERSUS MODE: VS')}</span>
                  </div>
                  <span className="font-btn px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/55 text-emerald-300 text-[11px] font-bold uppercase">
                    {t('3 PHÚT • 3 MẠNG • SUDDEN DEATH', '3 MIN • 3 LIVES • SUDDEN DEATH')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    data-testid="mode-card-vs-p1-p2"
                    disabled={isProcessing || session.status !== 'ACTIVE' || !onStartVsMatch}
                    onClick={() => onStartVsMatch?.('VS_P1_P2')}
                    className="p-3.5 rounded-lg border border-[#FF0055]/55 bg-[#050510]/90 hover:bg-rose-950/45 hover:border-[#FF0055] flex items-center justify-between gap-3 text-left transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                  >
                    <div>
                      <div className="font-btn text-sm sm:text-base font-black text-white">
                        P1 vs P2
                      </div>
                      <p className="text-xs text-neutral-300 mt-0.5">
                        {t(
                          'Đối kháng 1v1 trực tiếp: Phe 1 (WASD + Space/J) vs Phe 2 (Mũi tên + Enter/K).',
                          'Direct 1v1 PvP: Team 1 (WASD + Space/J) vs Team 2 (Arrows + Enter/K).'
                        )}
                      </p>
                    </div>
                    <span className="font-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#FF0055] text-white text-xs font-black uppercase shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{t('Vào đấu', 'Fight')}</span>
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="mode-card-vs-ai"
                    disabled={isProcessing || session.status !== 'ACTIVE' || !onStartVsMatch}
                    onClick={() => onStartVsMatch?.('VS_P1_AI_P2_AI')}
                    className="p-3.5 rounded-lg border border-[#FF0055]/55 bg-[#050510]/90 hover:bg-rose-950/45 hover:border-[#FF0055] flex items-center justify-between gap-3 text-left transition-all cursor-pointer disabled:opacity-50 active:scale-[0.98]"
                  >
                    <div>
                      <div className="font-btn text-sm sm:text-base font-black text-white">
                        P1 + A.I vs P2 + A.I
                      </div>
                      <p className="text-xs text-neutral-300 mt-0.5">
                        {t(
                          'Đối kháng 2v2: Phe 1 (P1 + A.I 1) vs Phe 2 (P2 + A.I 2), không Friendly Fire.',
                          '2v2 team battle: Team 1 (P1 + A.I 1) vs Team 2 (P2 + A.I 2), Friendly Fire OFF.'
                        )}
                      </p>
                    </div>
                    <span className="font-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#FF0055] text-white text-xs font-black uppercase shrink-0">
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>{t('Vào đấu', 'Fight')}</span>
                    </span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================
              STEP 2: CHỌN ĐỘ KHÓ (GIẢI TRÍ / THỬ THÁCH)
             =================================================================== */}
          {flowStep === 'SELECT_DIFFICULTY' && (
            <>
              <div className="mb-4 flex flex-col items-center">
                <h1 className="font-btn text-[clamp(1.5rem,5.5vw,2.4rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-[#FFB800] to-amber-600 tracking-wide sm:tracking-wider drop-shadow-lg uppercase">
                  {cardMode === 'SOLO'
                    ? 'SOLO'
                    : cardMode === 'COOP_AI'
                    ? 'CO-OP A.I'
                    : 'CO-OP ONLINE'}
                </h1>
              </div>

              {/* CAMPAIGN STAGE 1-10 SELECTOR */}
              {(() => {
                const liveStageSpecs = stageManager.getLiveCampaignStageViews();
                const selectedSpec = stageManager.getLiveCampaignStageView(selectedStageId);
                const effectiveUnlockedStage = isSuperAdmin
                  ? 10
                  : Math.max(1, stageProgress.unlockedStage);
                const selectedUnlocked = selectedStageId <= effectiveUnlockedStage;
                const selectedCompleted = stageProgress.completedStages.includes(selectedStageId);
                return (
                  <section
                    data-testid="campaign-stage-selector"
                    className="w-full mb-4 p-3.5 sm:p-4 rounded-lg border border-[#00F0FF]/35 bg-[#0b0d1e]/90 text-left space-y-3 shadow-lg"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 border-b border-neutral-800 pb-2">
                      <div className="font-btn flex items-center gap-2 font-black text-xs sm:text-sm text-[#FFB800] uppercase">
                        <MapIcon className="w-4 h-4 text-[#FFB800]" />
                        <span>{t('MÀN CHƠI', 'STAGES')}</span>
                      </div>
                      <span className="font-btn text-xs sm:text-sm text-[#00F0FF] font-black uppercase">
                        {t(
                          `MỞ KHÓA ${effectiveUnlockedStage}/10`,
                          `UNLOCKED ${effectiveUnlockedStage}/10`
                        )}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                      {liveStageSpecs.map((stage) => {
                        const isUnlocked = stage.id <= effectiveUnlockedStage;
                        const isCompleted = stageProgress.completedStages.includes(stage.id);
                        const isSelected = selectedStageId === stage.id;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            data-testid={`campaign-stage-btn-${stage.id}`}
                            onClick={() => {
                              if (!isUnlocked) {
                                setStageSelectError(
                                  t(
                                    `Màn ${stage.id} đang khóa (Cần qua Màn ${stage.id - 1}).`,
                                    `Stage ${stage.id} locked (Clear Stage ${stage.id - 1} first).`
                                  )
                                );
                                return;
                              }
                              setStageSelectError(null);
                              lastSelectedCampaignStageId = stage.id;
                              setSelectedStageId(stage.id);
                            }}
                            className={`relative min-h-[48px] py-2 px-1 rounded border text-center transition-all flex flex-col items-center justify-center gap-0.5 touch-manipulation ${
                              !isUnlocked
                                ? 'bg-[#050510]/70 border-neutral-800 text-neutral-600 cursor-not-allowed opacity-70'
                                : isSelected
                                  ? 'bg-[#FFB800] border-amber-300 text-[#050510] font-black ring-2 ring-[#FFB800]/50 cursor-pointer shadow'
                                  : isCompleted
                                    ? 'bg-emerald-950/50 border-emerald-600/60 text-emerald-200 hover:border-emerald-400 cursor-pointer'
                                    : 'bg-[#050510] border-[#687386]/60 text-[#EAF4FF] hover:border-[#FFB800]/60 cursor-pointer'
                            }`}
                            title={stage.name}
                          >
                            <span className="font-hud text-base font-extrabold">S{stage.id}</span>
                            {!isUnlocked ? (
                              <Lock className="w-3.5 h-3.5 text-neutral-600" />
                            ) : isCompleted ? (
                              <CheckCircle2
                                className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-emerald-400'}`}
                              />
                            ) : (
                              <Unlock
                                className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-[#FFB800]'}`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected Stage Detail + 13x13 Preview (No enemy breakdown below stage name) */}
                    <div className="flex flex-col sm:flex-row items-center gap-3 p-3 rounded bg-[#050510]/90 border border-neutral-800">
                      <StageMapMiniPreview
                        map={selectedSpec.map}
                        sizePx={88}
                        locked={!selectedUnlocked}
                        showSpawns
                      />
                      <div className="flex-1 min-w-0 text-center sm:text-left">
                        <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                          <span className="font-btn font-black text-base sm:text-lg text-[#FFB800] uppercase">
                            {`${t('MÀN', 'STAGE')} ${selectedSpec.id}: ${selectedSpec.shortTitle}`}
                          </span>
                          {selectedCompleted ? (
                            <span className="font-btn px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-xs font-bold">
                              {t('ĐÃ QUA', 'CLEARED')}
                            </span>
                          ) : selectedUnlocked ? (
                            <span className="font-btn px-2 py-0.5 rounded bg-amber-950/80 text-[#FFB800] border border-[#FFB800]/60 text-xs font-bold">
                              {t('MỞ KHÓA', 'UNLOCKED')}
                            </span>
                          ) : (
                            <span className="font-btn px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 text-xs font-bold">
                              {t('KHÓA', 'LOCKED')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {stageSelectError && (
                      <div className="p-2.5 rounded bg-rose-950/80 border border-[#FF0055]/70 text-rose-200 text-xs sm:text-sm font-medium whitespace-pre-line">
                        {formatSentenceLineBreaks(stageSelectError)}
                      </div>
                    )}
                  </section>
                );
              })()}

              <div
                data-testid="difficulty-selection-grid"
                className="w-full grid grid-cols-2 gap-2.5 sm:gap-3.5 mb-2 text-left"
              >
                {/* NORMAL / DEFAULT -> Giải trí */}
                <div
                  onClick={() => onDifficultyChange('DEFAULT')}
                  className={`p-3 sm:p-5 rounded-lg border-2 transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                    difficulty === 'DEFAULT'
                      ? 'bg-[#120e05]/85 border-[#FFB800] shadow-2xl ring-2 ring-[#FFB800]/25'
                      : 'bg-[#0b0d1e]/90 border-[#687386]/40 hover:border-[#FFB800]/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-btn font-black text-[#FFB800] text-sm sm:text-xl flex items-center gap-1.5 sm:gap-2">
                        <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-[#FFB800] shrink-0" />
                        <span>{t('Giải trí', 'Casual')}</span>
                      </span>
                    </div>
                    <p
                      data-testid="difficulty-note-default"
                      className="text-xs sm:text-sm text-neutral-200 leading-snug mt-2 whitespace-pre-line"
                    >
                      {t(
                        `${difficultyConfigState.profiles.DEFAULT.soloLives} mạng • ${difficultyConfigState.profiles.DEFAULT.durationSeconds} giây\nCân bằng`,
                        `${difficultyConfigState.profiles.DEFAULT.soloLives} lives • ${difficultyConfigState.profiles.DEFAULT.durationSeconds}s timer\nBalanced pacing`
                      )}
                    </p>
                  </div>

                  <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      disabled={!isSessionActive || isProcessing}
                      onClick={(e) => handleConfirmDifficulty('DEFAULT', e)}
                      className={`font-btn w-full min-h-[44px] sm:min-h-[48px] py-2 sm:py-2.5 px-2 sm:px-4 rounded font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-95 touch-manipulation shadow ${
                        !isSessionActive || isProcessing
                          ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                          : difficulty === 'DEFAULT'
                          ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] shadow-[#FFB800]/25 cursor-pointer'
                          : 'bg-[#050510] hover:bg-[#FFB800]/20 text-[#FFB800] border border-[#FFB800]/40 cursor-pointer'
                      }`}
                    >
                      <span className="whitespace-nowrap">{t('Bắt đầu', 'Start')}</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    </button>
                  </div>
                </div>

                {/* HARD / EXTREME -> Thử thách */}
                <div
                  onClick={() => onDifficultyChange('EXTREME')}
                  className={`p-3 sm:p-5 rounded-lg border-2 transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                    difficulty === 'EXTREME'
                      ? 'bg-[#200510]/85 border-[#FF0055] shadow-2xl ring-2 ring-[#FF0055]/25'
                      : 'bg-[#0b0d1e]/90 border-[#687386]/40 hover:border-[#FF0055]/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      <span className="font-btn font-black text-[#FF0055] text-sm sm:text-xl flex items-center gap-1.5 sm:gap-2">
                        <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF0055] shrink-0" />
                        <span>{t('Thử thách', 'Challenge')}</span>
                      </span>
                    </div>
                    <p
                      data-testid="difficulty-note-extreme"
                      className="text-xs sm:text-sm text-neutral-200 leading-snug mt-2 whitespace-pre-line"
                    >
                      {t(
                        `${difficultyConfigState.profiles.EXTREME.soloLives} mạng • ${difficultyConfigState.profiles.EXTREME.durationSeconds} giây\nÁp lực cao`,
                        `${difficultyConfigState.profiles.EXTREME.soloLives} life • ${difficultyConfigState.profiles.EXTREME.durationSeconds}s timer\nHigh pressure`
                      )}
                    </p>
                  </div>

                  <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      disabled={!isSessionActive || isProcessing}
                      onClick={(e) => handleConfirmDifficulty('EXTREME', e)}
                      className={`font-btn w-full min-h-[44px] sm:min-h-[48px] py-2 sm:py-2.5 px-2 sm:px-4 rounded font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-1.5 sm:gap-2 transition-all active:scale-95 touch-manipulation shadow ${
                        !isSessionActive || isProcessing
                          ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                          : difficulty === 'EXTREME'
                          ? 'bg-[#FF0055] hover:bg-rose-500 text-white shadow-[#FF0055]/25 cursor-pointer'
                          : 'bg-[#050510] hover:bg-[#FF0055]/20 text-rose-300 border border-[#FF0055]/40 cursor-pointer'
                      }`}
                    >
                      <span className="whitespace-nowrap">{t('Bắt đầu', 'Start')}</span>
                      <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================
              STEP 3 (CO-OP ONLINE): TẠO PHÒNG / THAM GIA PHÒNG
             =================================================================== */}
          {flowStep === 'COOP_ONLINE_LOBBY' && (
            <div className="w-full text-left">
              <div className="mb-5 text-center">
                <h1 className="font-btn text-[clamp(1.5rem,5.5vw,2.4rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-cyan-200 via-[#00F0FF] to-sky-500 tracking-wide sm:tracking-wider drop-shadow-lg uppercase">
                  CO-OP ONLINE
                </h1>
              </div>

              <CoopOnlineLobbyPanel
                user={firebaseUser ?? (user as any)}
                difficulty={difficulty}
                onDifficultyChange={onDifficultyChange}
                subView={onlineLobbySubView}
                onSubViewChange={setOnlineLobbySubView}
                onBackToDifficulty={onBack}
                onOnlineMatchStarted={handleOnlineMatchStartedProp}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-[#050510]/90 px-4 py-3 text-center text-xs text-[#687386]">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
        </div>
      </footer>
    </div>
  );
};
