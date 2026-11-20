/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Award,
  Bot,
  Globe,
  RefreshCw,
  Shield,
  Star,
  Swords,
  User,
  UserCheck,
  Zap,
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
import type { VsMode } from '../core/vsTypes.ts';

export type LobbyCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';

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
  onStartVsMatch?: (mode: VsMode) => void;
  onPlay: () => void;
  onSignOut: () => void;
  onRetryAcquire?: () => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenContact?: () => void;
  onOpenDevTools: () => void;
  isSuperAdmin?: boolean;
}

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  user,
  session,
  isProcessing,
  selectedLobbyMode,
  onSelectLobbyMode,
  onConfirmMode,
  onStartVsMatch,
  onPlay,
  onSignOut,
  onRetryAcquire,
  onOpenSettings,
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

  const handleCardSelectAndEnter = (mode: LobbyCardMode) => {
    onSelectLobbyMode(mode);
    if (!isActionDisabled) {
      onConfirmMode(mode);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] select-none overflow-x-hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Tactical Neo-Retro Background Layers */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.16),rgba(0,240,255,0.06),rgba(5,5,16,0))] pointer-events-none" />
      <div className="fixed inset-0 bg-grid-pattern opacity-35 pointer-events-none" />

      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-[#00F0FF]/25 bg-[#050510]/96 px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.75)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-0">
          {/* Left: Player Avatar, Display Name, Military Rank Badge */}
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
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0b0d1e] border border-[#FFB800]/35 text-[11px] font-bold text-[#FFB800] shrink-0"
                title={playerStats.levelSystemLabel}
              >
                <Award className="w-3 h-3 text-[#FFB800] shrink-0" />
                <span>{rankDisplayLabel}</span>
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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 sm:px-6 py-4 sm:py-6 max-w-6xl mx-auto w-full">
        {/* Hero Brand & Rank/Star Summary */}
        <div className="w-full flex flex-col items-center text-center mb-5 sm:mb-7">
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-2">
            <GameLogo className="unified-game-logo logo-inline-row" />
            <div className="text-left">
              <div className="text-[11px] font-hud font-bold uppercase tracking-[0.2em] text-[#00F0FF]">
                BẮN TANK ONLINE
              </div>
              <h1 className="font-btn text-[clamp(1.3rem,4.5vw,2.25rem)] font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-[#FFB800] to-amber-600 tracking-wide uppercase leading-tight neo-glitch-text">
                {t('CHIẾN TRƯỜNG HUYỀN THOẠI', 'LEGENDARY BATTLEFIELD')}
              </h1>
            </div>
          </div>

          {/* Progression Bar: Military Rank + Total XP + Star Balance */}
          <div className="mt-2 inline-flex flex-wrap items-center justify-center gap-2.5 sm:gap-3.5 px-4 py-2 rounded-lg neo-bevel-card border border-[#00F0FF]/30 text-xs">
            <div className="flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#FFB800]" />
              <span className="text-neutral-400 font-semibold">{t('Quân hàm:', 'Rank:')}</span>
              <span className="font-btn font-black text-[#FFB800]">{rankDisplayLabel}</span>
            </div>
            <span className="text-neutral-700">|</span>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span className="text-neutral-400 font-semibold">{t('Tổng XP:', 'Total XP:')}</span>
              <span className="font-hud font-bold text-[#00F0FF]">
                {levelProgress.xpVerificationStatus === 'VERIFIED' && levelProgress.totalXp !== null
                  ? `${levelProgress.totalXp} XP`
                  : '--'}
              </span>
            </div>
            <span className="text-neutral-700">|</span>
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-yellow-300 fill-yellow-300" />
              <span className="text-neutral-400 font-semibold">{t('Sao:', 'Stars:')}</span>
              <span className="font-hud font-black text-yellow-300">
                {levelProgress.starBalance} ⭐
              </span>
              <span className="text-[11px] text-neutral-400 font-hud">
                ({levelProgress.unconvertedXp}/25 XP)
              </span>
            </div>
          </div>
        </div>

        {/* Mode Selection Cards: SOLO | CO-OP AI | CO-OP ONLINE (direct click entry, no Chọn/Đang chọn button) */}
        <div
          data-testid="home-mode-cards-grid"
          className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-5"
        >
          {/* 1. SOLO */}
          <button
            type="button"
            data-testid="home-mode-card-solo"
            disabled={isActionDisabled}
            onClick={() => handleCardSelectAndEnter('SOLO')}
            className={`group relative overflow-hidden text-left flex flex-col justify-between min-h-[210px] sm:min-h-[240px] p-5 rounded-xl neo-bevel-card transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] ${
              selectedLobbyMode === 'SOLO'
                ? 'border-2 border-[#FFB800] neo-bevel-amber'
                : 'border border-[#687386]/50 hover:border-[#FFB800]/80'
            }`}
          >
            {/* Background Avatar with Looping Fade */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <img
                src="./avatar/ava01.png"
                alt=""
                className="w-full h-full object-cover object-center lobby-ava-fade-single"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/80 to-[#050510]/45" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFB800]/15 border border-[#FFB800]/45 text-[#FFB800] font-btn font-black text-xs uppercase tracking-wider">
                <User className="w-3.5 h-3.5" />
                <span>SOLO</span>
              </span>
            </div>

            <div className="relative z-10 space-y-1.5 mt-auto">
              <h2 className="font-btn text-xl sm:text-2xl font-black text-[#EAF4FF] group-hover:text-[#FFB800] transition-colors uppercase tracking-wide">
                SOLO
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {t(
                  'Độc lập chỉ huy chiến xa vượt qua 10 màn chiến dịch, bảo vệ căn cứ Đại Bàng và thu thập 4 vật phẩm hỗ trợ.',
                  'Command a lone battle tank across 10 campaign stages, defend the Eagle Base, and collect 4 support items.'
                )}
              </p>
            </div>
          </button>

          {/* 2. CO-OP A.I */}
          <button
            type="button"
            data-testid="home-mode-card-coop-ai"
            disabled={isActionDisabled}
            onClick={() => handleCardSelectAndEnter('COOP_AI')}
            className={`group relative overflow-hidden text-left flex flex-col justify-between min-h-[210px] sm:min-h-[240px] p-5 rounded-xl neo-bevel-card transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] ${
              selectedLobbyMode === 'COOP_AI'
                ? 'border-2 border-[#00F0FF] neo-bevel-cyan'
                : 'border border-[#687386]/50 hover:border-[#00F0FF]/80'
            }`}
          >
            {/* Background Dual Avatars with Alternating Looping Fade */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <img
                src="./avatar/ava01.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center lobby-ava-fade-pair-a"
              />
              <img
                src="./avatar/ava07.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center lobby-ava-fade-pair-b"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/80 to-[#050510]/45" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00F0FF]/15 border border-[#00F0FF]/45 text-[#00F0FF] font-btn font-black text-xs uppercase tracking-wider">
                <Bot className="w-3.5 h-3.5" />
                <span>CO-OP A.I</span>
              </span>
            </div>

            <div className="relative z-10 space-y-1.5 mt-auto">
              <h2 className="font-btn text-xl sm:text-2xl font-black text-[#EAF4FF] group-hover:text-[#00F0FF] transition-colors uppercase tracking-wide">
                CO-OP A.I
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {t(
                  'Phối hợp tác chiến cùng đồng đội chiến xa A.I thông minh bảo vệ căn cứ trước làn sóng xe tăng địch.',
                  'Team up with an intelligent Ally A.I battle tank to defend the base against enemy tank waves.'
                )}
              </p>
            </div>
          </button>

          {/* 3. CO-OP ONLINE */}
          <button
            type="button"
            data-testid="home-mode-card-coop-online"
            disabled={isActionDisabled}
            onClick={() => handleCardSelectAndEnter('COOP_ONLINE')}
            className={`group relative overflow-hidden text-left flex flex-col justify-between min-h-[210px] sm:min-h-[240px] p-5 rounded-xl neo-bevel-card transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] ${
              selectedLobbyMode === 'COOP_ONLINE'
                ? 'border-2 border-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.28)]'
                : 'border border-[#687386]/50 hover:border-emerald-400/80'
            }`}
          >
            {/* Background Dual Avatars with Alternating Looping Fade */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <img
                src="./avatar/ava01.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center lobby-ava-fade-pair-a"
              />
              <img
                src="./avatar/ava03.png"
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center lobby-ava-fade-pair-b"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050510] via-[#050510]/80 to-[#050510]/45" />
            </div>

            <div className="relative z-10 flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-400/45 text-emerald-300 font-btn font-black text-xs uppercase tracking-wider">
                <Globe className="w-3.5 h-3.5" />
                <span>CO-OP ONLINE</span>
              </span>
            </div>

            <div className="relative z-10 space-y-1.5 mt-auto">
              <h2 className="font-btn text-xl sm:text-2xl font-black text-[#EAF4FF] group-hover:text-emerald-300 transition-colors uppercase tracking-wide">
                CO-OP ONLINE
              </h2>
              <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
                {t(
                  'Lập phòng hoặc tham gia phòng 2 người chơi trực tuyến thời gian thực qua kết nối P2P.',
                  'Create or join a 2-player real-time online co-op room over low-latency P2P sync.'
                )}
              </p>
            </div>
          </button>
        </div>

        {/* VS Arena Unlocked Quick Launch Banner (BTO-VS-GAMEPLAY-V1.2) & Mode Entry */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch">
          <div className="lg:col-span-8 neo-bevel-card rounded-xl px-4 py-3 border border-[#FF0055]/50 bg-[#12060c]/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#FF0055]/20 border border-[#FF0055]/55 flex items-center justify-center shrink-0 text-[#FF0055]">
                <Swords className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-btn text-xs font-black uppercase text-[#EAF4FF] tracking-wide">
                    {t('ĐẤU TRƯỜNG VS', 'VS ARENA')}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-bold text-emerald-300 shrink-0 uppercase">
                    {t('ĐÃ MỞ KHÓA', 'UNLOCKED')}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-300">
                  {t(
                    '3 phút • 3 mạng • Sudden Death • Thu hẹp 20s • Không hòa.',
                    '3 min • 3 lives • Sudden Death • 20s shrink • No draw.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                data-testid="lobby-vs-p1-p2-btn"
                disabled={isActionDisabled || !onStartVsMatch}
                onClick={() => onStartVsMatch?.('VS_P1_P2')}
                className="flex-1 sm:flex-none font-btn px-3 py-2 rounded-lg bg-[#FF0055] hover:bg-rose-500 text-white text-xs font-black uppercase tracking-wide shadow cursor-pointer disabled:opacity-50 transition-transform active:scale-95"
              >
                P1 vs P2
              </button>
              <button
                type="button"
                data-testid="lobby-vs-ai-btn"
                disabled={isActionDisabled || !onStartVsMatch}
                onClick={() => onStartVsMatch?.('VS_P1_AI_P2_AI')}
                className="flex-1 sm:flex-none font-btn px-3 py-2 rounded-lg bg-[#050510] hover:bg-rose-950/70 border border-[#FF0055]/60 text-rose-200 text-xs font-black uppercase tracking-wide shadow cursor-pointer disabled:opacity-50 transition-transform active:scale-95"
              >
                P1 + A.I vs P2 + A.I
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onPlay}
            disabled={isActionDisabled}
            className="lg:col-span-4 min-h-[48px] px-5 py-3 rounded-xl bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-btn font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4" />
            <span>{t('CHỌN CHẾ ĐỘ CHIẾN ĐẤU', 'SELECT BATTLE MODE')}</span>
          </button>
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
