/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bot,
  ChevronDown,
  Globe,
  RefreshCw,
  Star,
  Swords,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getRoleNameFrameClasses,
  getRoleTrademarkBadge,
  getUserDisplayLabel,
  resolveUserRole,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { PlayerStatsManager } from '../core/playerStatsManager.ts';
import {
  PlayerLevelManager,
  type PlayerLevelProgressInfo,
} from '../core/playerLevelSystem.ts';
import { useLanguage } from '../core/i18n.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import { TopMenuActionDrawer } from './TopMenuActionDrawer.tsx';
import { GameLogo } from './GameLogo.tsx';
import { VS_TANK_COLOR_SPEC, type VsMode } from '../core/vsTypes.ts';

export type LobbyCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';
type ExpandedMenuGroup = 'COOP' | 'VS' | null;

export interface MainMenuScreenProps {
  user: {
    uid?: string;
    email: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    photoURL?: string | null;
    role?: string | null;
  };
  session: SessionStateSnapshot;
  isProcessing: boolean;
  selectedLobbyMode: LobbyCardMode;
  onSelectLobbyMode: (mode: LobbyCardMode) => void;
  onConfirmMode: (mode: LobbyCardMode) => void;
  onStartSoloDirect?: () => void;
  onStartVsMatch?: (mode: VsMode) => void;
  onPlay?: () => void;
  onSignOut: () => void;
  onRetryAcquire?: () => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenFriends?: () => void;
  pendingFriendRequestsCount?: number;
  onOpenSupport?: () => void;
  onOpenContact?: () => void;
  onOpenDevTools: () => void;
  isSuperAdmin?: boolean;
}

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  user,
  session,
  isProcessing,
  onSelectLobbyMode,
  onConfirmMode,
  onStartSoloDirect,
  onStartVsMatch,
  onSignOut,
  onRetryAcquire,
  onOpenSettings,
  onOpenFriends,
  pendingFriendRequestsCount = 0,
  onOpenSupport,
  onOpenContact,
  onOpenDevTools,
  isSuperAdmin = false,
}) => {
  const { lang, t } = useLanguage();
  const avatarManager = AvatarManager.getInstance();
  const playerStatsMgr = PlayerStatsManager.getInstance();
  const levelMgr = PlayerLevelManager.getInstance();
  const effectiveUid = user.uid || '';

  const [avatarError, setAvatarError] = useState(false);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<ExpandedMenuGroup>(null);
  const [, setAvatarTick] = useState(0);
  const [playerStats, setPlayerStats] = useState(() =>
    playerStatsMgr.getPlayerStatisticsSnapshot(effectiveUid)
  );
  const [levelProgress, setLevelProgress] = useState<PlayerLevelProgressInfo>(() =>
    levelMgr.getLevelProgressForUid(effectiveUid)
  );

  useEffect(() => {
    avatarManager.observeCatalog();
    if (effectiveUid) {
      avatarManager.observeUserMetadata(effectiveUid);
    }
    const unsubAvatar = avatarManager.subscribe(() => {
      setAvatarTick((tick) => tick + 1);
      setAvatarError(false);
    });
    return unsubAvatar;
  }, [avatarManager, effectiveUid]);

  useEffect(() => {
    const syncStats = () => {
      setPlayerStats(playerStatsMgr.getPlayerStatisticsSnapshot(effectiveUid));
      setLevelProgress(levelMgr.getLevelProgressForUid(effectiveUid));
    };
    syncStats();
    if (effectiveUid) {
      void playerStatsMgr.refreshCloudUserStatsOnce(effectiveUid);
    }
    const unsubStats = playerStatsMgr.subscribe(syncStats);
    const unsubLevel = levelMgr.subscribeExternalSync(syncStats);
    return () => {
      unsubStats();
      unsubLevel();
    };
  }, [playerStatsMgr, levelMgr, effectiveUid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: effectiveUid,
    photoURL: user?.photoURL,
  });

  useEffect(() => {
    setAvatarError(false);
  }, [resolvedAvatarUrl]);

  const profileMeta = effectiveUid ? avatarManager.getUserMetadata(effectiveUid) : null;
  const effectiveUser = {
    ...user,
    displayName: profileMeta?.displayName || user.displayName,
  };
  const displayLabel = getUserDisplayLabel(effectiveUser);
  const userRole = resolveUserRole(user);
  void getRoleNameFrameClasses(userRole);
  const roleTrademarkBadge = getRoleTrademarkBadge(userRole);

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user),
    lang
  );

  const isSessionDisplacedOrExpired =
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'EXPIRED';
  const isSessionUnverified =
    session.status === 'CONNECTION_LOST_UNVERIFIED' ||
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED';
  const isActionDisabled = isProcessing || isSessionDisplacedOrExpired || isSessionUnverified;

  const rankDisplayLabel =
    levelProgress.xpVerificationStatus === 'VERIFIED'
      ? lang === 'en'
        ? levelProgress.rankNameEn
        : levelProgress.rankNameVi
      : t('Chưa xác minh', 'Unverified');

  const handleSoloDirectClick = () => {
    if (isActionDisabled) return;
    onSelectLobbyMode('SOLO');
    if (onStartSoloDirect) {
      onStartSoloDirect();
    } else {
      onConfirmMode('SOLO');
    }
  };

  const handleCoopSubSelect = (mode: 'COOP_AI' | 'COOP_ONLINE') => {
    if (isActionDisabled) return;
    onSelectLobbyMode(mode);
    onConfirmMode(mode);
  };

  const handleVsSubSelect = (mode: VsMode) => {
    if (isActionDisabled) return;
    onStartVsMatch?.(mode);
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] select-none overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Tactical Neo-Retro Background Layers */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.16),rgba(0,240,255,0.06),rgba(5,5,16,0))] pointer-events-none" />
      <div className="fixed inset-0 bg-grid-pattern opacity-35 pointer-events-none" />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-[#00F0FF]/25 bg-[#050510]/96 px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.75)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-0">
          {/* Left: Player Avatar, Display Name, Military Rank */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div
              className={`${
                isTopMenuOpen ? 'hidden sm:flex' : 'flex'
              } items-center gap-1.5 sm:gap-2 px-1 py-0.5 min-w-0`}
            >
              {resolvedAvatarUrl && !avatarError ? (
                <img
                  src={resolvedAvatarUrl}
                  alt={displayLabel}
                  className="w-7 h-7 rounded-full object-cover shrink-0 border border-[#FFB800]/40"
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserCheck className="w-4 h-4 text-[#00F0FF] shrink-0" />
              )}

              <span className="inline-flex items-baseline font-bold text-[#FFB800] text-sm sm:text-base min-w-0">
                <span className="truncate max-w-[110px] xs:max-w-[150px] sm:max-w-[210px]">
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
                data-testid="top-menu-player-level"
                className="inline-flex items-center px-2 py-0.5 rounded bg-[#0b0d1e] border border-[#FFB800]/35 text-[11px] font-bold text-[#FFB800] shrink-0"
                title={playerStats.levelSystemLabel}
              >
                {rankDisplayLabel}
              </span>

              {badgeInfo.label && (
                <span
                  className={`hidden md:inline-block text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${badgeInfo.badgeStyle}`}
                >
                  {badgeInfo.label}
                </span>
              )}
            </div>

            {session.status === 'NO_SESSION' && onRetryAcquire && (
              <button
                type="button"
                onClick={onRetryAcquire}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] transition-all font-bold text-xs active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{t('Kết nối', 'Connect')}</span>
              </button>
            )}
          </div>

          {/* Right: Unified Horizontal Slide-Out Action Drawer */}
          <TopMenuActionDrawer
            onOpenSettings={onOpenSettings}
            onOpenFriends={onOpenFriends}
            pendingFriendRequestsCount={pendingFriendRequestsCount}
            onOpenSupport={onOpenSupport}
            onOpenContact={onOpenContact}
            onOpenDevTools={onOpenDevTools}
            onExit={onSignOut}
            exitLabel={t('Đăng xuất', 'Sign Out')}
            isSuperAdmin={isSuperAdmin}
            isExitDisabled={isProcessing}
            onOpenChange={setIsTopMenuOpen}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 sm:px-6 py-4 sm:py-6 max-w-5xl mx-auto w-full animate-neo-fade-in">
        {/* Hero Brand & Clean Header Progression Stats (Section XI) */}
        <div className="w-full flex flex-col items-center text-center mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 mb-2.5 max-w-full">
            <GameLogo className="unified-game-logo logo-inline-row" />
            <div className="text-left min-w-0">
              <div className="text-[10px] sm:text-[11px] font-hud font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
                BẮN TANK ONLINE
              </div>
              {/* Section XI: Mobile title ~10% smaller & nowrap so "thoại" never orphan-wraps; PC unchanged */}
              <h1
                data-testid="home-hero-title"
                className="font-btn text-[clamp(1.02rem,3.85vw,1.65rem)] sm:text-[clamp(1.3rem,4.5vw,2.25rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-[#FFB800] to-amber-600 tracking-tight sm:tracking-wide uppercase leading-tight neo-glitch-text"
              >
                {t('CHIẾN TRƯỜNG HUYỀN THOẠI', 'LEGENDARY BATTLEFIELD')}
              </h1>
            </div>
          </div>

          {/* Stacked Progression Bar: Rank below Quân hàm, XP below Kinh nghiệm, Stars + Star icon below Sao */}
          <div
            data-testid="home-header-stats-bar"
            className="mt-2 inline-grid grid-cols-3 divide-x divide-neutral-800 rounded-lg neo-bevel-card border border-[#00F0FF]/30 text-xs sm:text-sm overflow-hidden"
          >
            <div className="flex flex-col items-center justify-center px-3 sm:px-5 py-2 gap-0.5">
              <span className="text-[11px] sm:text-xs text-neutral-400 font-semibold leading-tight">
                {t('Quân hàm', 'Rank')}
              </span>
              <span className="font-btn font-black text-[#FFB800] leading-tight">
                {rankDisplayLabel}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-3 sm:px-5 py-2 gap-0.5">
              <span className="text-[11px] sm:text-xs text-neutral-400 font-semibold leading-tight">
                {t('Kinh nghiệm', 'Experience')}
              </span>
              <span className="font-hud font-bold text-[#00F0FF] leading-tight">
                {levelProgress.xpVerificationStatus === 'VERIFIED' && levelProgress.totalXp !== null
                  ? `${levelProgress.totalXp} XP`
                  : '--'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-3 sm:px-5 py-2 gap-0.5">
              <span className="text-[11px] sm:text-xs text-neutral-400 font-semibold leading-tight">
                {t('Sao', 'Stars')}
              </span>
              <span className="font-hud font-black text-yellow-300 inline-flex items-center gap-1 leading-tight">
                <span>{levelProgress.starBalance}</span>
                <Star className="w-3.5 h-3.5 text-[#FFB800] fill-[#FFB800] shrink-0" aria-hidden="true" />
              </span>
            </div>
          </div>
        </div>

        {/* NEO-RETRO 3-Card Home Mode Flow (SOLO | CO-OP | VS) with TV signal glitch backgrounds & equal tablet heights */}
        <div
          data-testid="home-mode-cards-grid"
          className={`w-full grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 ${
            expandedGroup ? 'items-start' : 'items-stretch'
          }`}
        >
          {/* 1. SOLO — Direct Match Entry */}
          <div
            data-testid="home-mode-card-solo"
            className="relative neo-bevel-card rounded-xl border border-[#FFB800]/55 hover:border-[#FFB800] transition-transform duration-150 hover:-translate-y-0.5 overflow-hidden flex flex-col"
          >
            <button
              type="button"
              data-testid="home-mode-solo-btn"
              disabled={isActionDisabled}
              onClick={handleSoloDirectClick}
              className="group relative w-full flex-1 text-left p-5 flex flex-col justify-between min-h-[225px] md:min-h-[268px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-transform overflow-hidden"
            >
              {/* TV Signal Glitch Background Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <img
                  src="/solo.png"
                  alt=""
                  className="w-full h-full object-cover tv-card-bg-img"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/78 to-[#050510]/45" />
                <div className="absolute inset-0 tv-card-scanlines opacity-70" />
                <div className="absolute inset-x-0 top-0 h-10 tv-card-scanline-sweep" />
                <div className="absolute inset-x-0 top-[36%] h-2.5 tv-card-glitch-bar" />
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#050510]/75 border border-[#FFB800]/55 text-[#FFB800] font-btn font-black text-xs uppercase tracking-wider">
                  <User className="w-3.5 h-3.5" />
                  <span>1P CAMPAIGN</span>
                </span>
                <span className="w-8 h-8 rounded-lg bg-[#050510]/75 border border-[#FFB800]/45 flex items-center justify-center text-[#FFB800] group-hover:bg-[#FFB800] group-hover:text-[#050510] transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>

              <div className="relative z-10 space-y-2 mt-auto">
                <h2 className="font-btn text-2xl font-black text-[#EAF4FF] group-hover:text-[#FFB800] transition-colors uppercase tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  SOLO
                </h2>
                <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  {t(
                    'Vào trận ngay lập tức. Chỉ huy xe tăng chiến đấu qua 10 màn chiến dịch và bảo vệ căn cứ Đại Bàng.',
                    'Jump straight into battle. Command your tank across 10 campaign stages and defend the Eagle Base.'
                  )}
                </p>
                <div className="pt-2 flex items-center gap-1.5 text-xs font-btn font-black text-[#FFB800] uppercase tracking-wider">
                  <span>{t('Vào chiến đấu ngay', 'Launch Battle')}</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </button>
          </div>

          {/* 2. CO-OP — Expands CO-OP A.I & CO-OP ONLINE */}
          <div
            data-testid="home-mode-card-coop"
            className={`relative neo-bevel-card rounded-xl border transition-all duration-150 overflow-hidden flex flex-col ${
              expandedGroup === 'COOP'
                ? 'border-[#00F0FF] neo-bevel-cyan'
                : 'border-[#00F0FF]/45 hover:border-[#00F0FF] hover:-translate-y-0.5'
            }`}
          >
            <button
              type="button"
              data-testid="home-mode-coop-toggle"
              aria-expanded={expandedGroup === 'COOP'}
              disabled={isActionDisabled}
              onClick={() =>
                setExpandedGroup((prev) => (prev === 'COOP' ? null : 'COOP'))
              }
              className="group relative w-full flex-1 text-left p-5 flex flex-col justify-between min-h-[225px] md:min-h-[268px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-transform overflow-hidden"
            >
              {/* TV Signal Glitch Background Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <img
                  src="/coop.png"
                  alt=""
                  style={{ animationDelay: '-1.6s' }}
                  className="w-full h-full object-cover tv-card-bg-img"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/78 to-[#050510]/45" />
                <div className="absolute inset-0 tv-card-scanlines opacity-70" />
                <div
                  style={{ animationDelay: '-1.4s' }}
                  className="absolute inset-x-0 top-0 h-10 tv-card-scanline-sweep"
                />
                <div
                  style={{ animationDelay: '-2.1s' }}
                  className="absolute inset-x-0 top-[48%] h-2.5 tv-card-glitch-bar"
                />
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#050510]/75 border border-[#00F0FF]/55 text-[#00F0FF] font-btn font-black text-xs uppercase tracking-wider">
                  <Users className="w-3.5 h-3.5" />
                  <span>2P CO-OP</span>
                </span>
                <span
                  className={`w-8 h-8 rounded-lg bg-[#050510]/75 border border-[#00F0FF]/45 flex items-center justify-center text-[#00F0FF] transition-transform duration-200 ${
                    expandedGroup === 'COOP' ? 'rotate-180 bg-[#00F0FF] text-[#050510]' : ''
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </span>
              </div>

              <div className="relative z-10 space-y-2 mt-auto">
                <h2 className="font-btn text-2xl font-black text-[#EAF4FF] group-hover:text-[#00F0FF] transition-colors uppercase tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  CO-OP
                </h2>
                <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  {t(
                    'Hợp tác 2 chiến xa bảo vệ căn cứ cùng đồng đội A.I hoặc bạn bè trực tuyến qua phòng P2P.',
                    'Cooperate with an Ally A.I tank or team up with a friend online via P2P room sync.'
                  )}
                </p>
                <div className="pt-2 flex items-center gap-1.5 text-xs font-btn font-black text-[#00F0FF] uppercase tracking-wider">
                  <span>
                    {expandedGroup === 'COOP'
                      ? t('Chọn chế độ CO-OP bên dưới', 'Choose CO-OP mode below')
                      : t('Mở tùy chọn CO-OP', 'Expand CO-OP Options')}
                  </span>
                </div>
              </div>
            </button>

            {expandedGroup === 'COOP' && (
              <div
                data-testid="home-coop-submodes"
                className="relative z-10 px-4 pb-4 pt-2 border-t border-[#00F0FF]/25 bg-[#050510]/95 grid grid-cols-1 gap-2 animate-neo-expand"
              >
                <button
                  type="button"
                  data-testid="home-mode-card-coop-ai"
                  disabled={isActionDisabled}
                  onClick={() => handleCoopSubSelect('COOP_AI')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-[#0b0d1e] hover:bg-[#00F0FF]/15 border border-[#00F0FF]/45 hover:border-[#00F0FF] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Bot className="w-4 h-4 text-[#00F0FF] shrink-0" />
                    <div className="min-w-0">
                      <div className="font-btn text-xs sm:text-sm font-black text-white uppercase">
                        CO-OP A.I
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">
                        {t('P1 phối hợp xe tăng A.I', 'P1 + Ally A.I Tank')}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#00F0FF] shrink-0" />
                </button>

                <button
                  type="button"
                  data-testid="home-mode-card-coop-online"
                  disabled={isActionDisabled}
                  onClick={() => handleCoopSubSelect('COOP_ONLINE')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-[#0b0d1e] hover:bg-emerald-500/15 border border-emerald-400/45 hover:border-emerald-400 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-btn text-xs sm:text-sm font-black text-white uppercase">
                        CO-OP ONLINE
                      </div>
                      <div className="text-[11px] text-neutral-400 truncate">
                        {t('Tạo / Tham gia phòng 2 thiết bị', 'Create / Join 2-device room')}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
                </button>
              </div>
            )}
          </div>

          {/* 3. VS — Expands P1 VS P2 & P1 + A.I VS P2 + A.I (2-Device Online Lobby) */}
          <div
            data-testid="home-mode-card-vs"
            className={`relative neo-bevel-card rounded-xl border transition-all duration-150 overflow-hidden flex flex-col ${
              expandedGroup === 'VS'
                ? 'border-[#FF0055] neo-bevel-red'
                : 'border-[#FF0055]/45 hover:border-[#FF0055] hover:-translate-y-0.5'
            }`}
          >
            <button
              type="button"
              data-testid="home-mode-vs-toggle"
              aria-expanded={expandedGroup === 'VS'}
              disabled={isActionDisabled}
              onClick={() =>
                setExpandedGroup((prev) => (prev === 'VS' ? null : 'VS'))
              }
              className="group relative w-full flex-1 text-left p-5 flex flex-col justify-between min-h-[225px] md:min-h-[268px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] transition-transform overflow-hidden"
            >
              {/* TV Signal Glitch Background Layer */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                <img
                  src="/vs.png"
                  alt=""
                  style={{ animationDelay: '-3.1s' }}
                  className="w-full h-full object-cover tv-card-bg-img"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/78 to-[#050510]/45" />
                <div className="absolute inset-0 tv-card-scanlines opacity-70" />
                <div
                  style={{ animationDelay: '-2.7s' }}
                  className="absolute inset-x-0 top-0 h-10 tv-card-scanline-sweep"
                />
                <div
                  style={{ animationDelay: '-3.6s' }}
                  className="absolute inset-x-0 top-[28%] h-2.5 tv-card-glitch-bar"
                />
              </div>

              <div className="relative z-10 flex items-center justify-between gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#050510]/75 border border-[#FF0055]/55 text-[#FF0055] font-btn font-black text-xs uppercase tracking-wider">
                  <Swords className="w-3.5 h-3.5" />
                  <span>PVP ONLINE</span>
                </span>
                <span
                  className={`w-8 h-8 rounded-lg bg-[#050510]/75 border border-[#FF0055]/45 flex items-center justify-center text-[#FF0055] transition-transform duration-200 ${
                    expandedGroup === 'VS' ? 'rotate-180 bg-[#FF0055] text-white' : ''
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </span>
              </div>

              <div className="relative z-10 space-y-2 mt-auto">
                <h2 className="font-btn text-2xl font-black text-[#EAF4FF] group-hover:text-[#FF0055] transition-colors uppercase tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                  VS
                </h2>
                <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)]">
                  {t(
                    'Đấu trường đối kháng trực tuyến trên 2 thiết bị riêng biệt. 2 phút • 3 mạng • Sudden Death • Không hòa.',
                    'Real-time online PvP arena on 2 separate devices. 2 min • 3 lives • Sudden Death • No draw.'
                  )}
                </p>
                <div className="pt-2 flex items-center gap-1.5 text-xs font-btn font-black text-[#FF0055] uppercase tracking-wider">
                  <span>
                    {expandedGroup === 'VS'
                      ? t('Chọn thể thức VS Online bên dưới', 'Choose VS Online mode below')
                      : t('Mở tùy chọn VS Online', 'Expand VS Online Options')}
                  </span>
                </div>
              </div>
            </button>

            {expandedGroup === 'VS' && (
              <div
                data-testid="home-vs-submodes"
                className="relative z-10 px-4 pb-4 pt-2 border-t border-[#FF0055]/25 bg-[#050510]/95 grid grid-cols-1 gap-2 animate-neo-expand"
              >
                <button
                  type="button"
                  data-testid="lobby-vs-p1-p2-btn"
                  disabled={isActionDisabled || !onStartVsMatch}
                  onClick={() => handleVsSubSelect('VS_P1_P2')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-[#0b0d1e] hover:bg-[#FF0055]/15 border border-[#FF0055]/45 hover:border-[#FF0055] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="font-btn text-xs sm:text-sm font-black text-white uppercase flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.P1.hex }}
                      />
                      <span>P1 VS P2</span>
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.P2.hex }}
                      />
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      {t('Đối kháng 1v1 trực tuyến 2 thiết bị', '1v1 Online PvP on 2 devices')}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#FF0055] shrink-0" />
                </button>

                <button
                  type="button"
                  data-testid="lobby-vs-ai-btn"
                  disabled={isActionDisabled || !onStartVsMatch}
                  onClick={() => handleVsSubSelect('VS_P1_AI_P2_AI')}
                  className="w-full min-h-[46px] px-3.5 py-2.5 rounded-lg bg-[#0b0d1e] hover:bg-[#FF0055]/15 border border-[#FF0055]/45 hover:border-[#FF0055] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer disabled:opacity-50 active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="font-btn text-xs sm:text-sm font-black text-white uppercase flex items-center gap-1.5 flex-wrap">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.P1.hex }}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.AI_1.hex }}
                      />
                      <span>P1 + A.I VS P2 + A.I</span>
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.P2.hex }}
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: VS_TANK_COLOR_SPEC.AI_2.hex }}
                      />
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      {t('Đối kháng 2v2 trực tuyến 2 thiết bị', '2v2 Online PvP on 2 devices')}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#FF0055] shrink-0" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-[#050510]/90 px-4 py-2.5 text-center text-xs text-[#687386] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
        </div>
      </footer>
    </div>
  );
};
