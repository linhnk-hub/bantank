/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
  getRoleTrademarkBadge,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { PlayerStatsManager } from '../core/playerStatsManager.ts';
import { getSessionBadgeInfo, formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import {
  Play,
  LogOut,
  Settings,
  Wrench,
  RefreshCw,
  UserCheck,
  AlertCircle,
  HelpCircle,
  Loader2,
  Trophy,
  Coins,
  Gamepad2,
  Volume2,
  User,
  Bot,
  Globe,
} from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import { LanguageSelector } from './LanguageSelector.tsx';
import { MusicManager, type HomeBackgroundVideoConfig } from '../core/musicManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

export type LobbyCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';

export interface MainMenuScreenProps {
  user: {
    uid?: string;
    email: string | null;
    emailVerified?: boolean;
    providerIds?: string[];
    displayName?: string | null;
    photoURL?: string | null;
  };
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onPlay: () => void;
  onConfirmMode?: (mode: LobbyCardMode) => void;
  selectedLobbyMode?: LobbyCardMode;
  onSelectLobbyMode?: (mode: LobbyCardMode) => void;
  onSignOut: () => Promise<void>;
  onRetryAcquire: () => Promise<void>;
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools: () => void;
  isSuperAdmin?: boolean;
}

/**
 * Central Pixel Art Tank Showcase with IDLE animation only (no rotation, no gameplay mutation).
 */
const LobbyIdleTankShowcase: React.FC = () => (
  <div
    data-testid="lobby-tank-showcase"
    className="inline-flex items-center justify-center px-3 py-1.5 neo-bevel-card border border-[#FFB800]/40 bg-[#050510]/85 gap-2.5"
  >
    <svg
      viewBox="0 0 32 32"
      className="w-8 h-8 tank-idle-bob shrink-0"
      style={{ shapeRendering: 'crispEdges' }}
      aria-hidden="true"
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
    <div className="text-left leading-tight">
      <div className="font-btn text-[10px] font-extrabold uppercase tracking-wider text-[#FFB800]">
        TANK P1 • IDLE READY
      </div>
      <div className="font-hud text-xs text-[#00F0FF]">60 FPS ARCADE CORE</div>
    </div>
  </div>
);

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  user,
  session,
  isProcessing,
  onPlay,
  onConfirmMode,
  selectedLobbyMode: controlledLobbyMode,
  onSelectLobbyMode,
  onSignOut,
  onRetryAcquire,
  onOpenSettings,
  onOpenSupport,
  onOpenDevTools,
  isSuperAdmin = false,
}) => {
  const { t } = useLanguage();
  const isSessionDisplacedOrExpired =
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'EXPIRED';
  const isSessionActive = !isSessionDisplacedOrExpired;
  const [localSelectedMode, setLocalSelectedMode] = useState<LobbyCardMode>(
    controlledLobbyMode || 'SOLO'
  );
  const selectedModeCard: LobbyCardMode = controlledLobbyMode ?? localSelectedMode;

  const handleSelectModeCard = (mode: LobbyCardMode) => {
    setLocalSelectedMode(mode);
    onSelectLobbyMode?.(mode);
  };

  const handleConfirmSelectedMode = (modeToConfirm: LobbyCardMode = selectedModeCard) => {
    if (session.status === 'NO_SESSION') {
      void onRetryAcquire();
    }
    if (isSessionDisplacedOrExpired) {
      void onRetryAcquire();
      return;
    }
    if (onConfirmMode) {
      onConfirmMode(modeToConfirm);
    } else {
      onPlay();
    }
  };
  const avatarManager = AvatarManager.getInstance();
  const musicManager = MusicManager.getInstance();
  const playerStatsMgr = PlayerStatsManager.getInstance();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [, setAvatarTick] = useState(0);
  const [playerStats, setPlayerStats] = useState(() =>
    playerStatsMgr.getPlayerStatisticsSnapshot(user.uid)
  );
  const [homeVideoConfig, setHomeVideoConfig] = useState<HomeBackgroundVideoConfig | null>(() =>
    musicManager.getHomeVideoConfig()
  );
  const [homeVideoUrl, setHomeVideoUrl] = useState<string | null>(() =>
    musicManager.getHomeVideoUrl()
  );
  const [isHomeVideoLoading, setIsHomeVideoLoading] = useState<boolean>(() =>
    musicManager.isHomeVideoLoading()
  );
  const [homeVideoError, setHomeVideoError] = useState<string | null>(() =>
    musicManager.getHomeVideoError()
  );
  const [isVideoBuffering, setIsVideoBuffering] = useState<boolean>(() =>
    Boolean(musicManager.getHomeVideoUrl()) && !musicManager.isHomeVideoLoaded()
  );

  useEffect(() => {
    musicManager.preloadStaticHomeVideoOnce();
  }, [musicManager]);

  const tryPlayIntroVideo = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Ignore strict browser policy rejections
      });
    }
  };

  useEffect(() => {
    const unsubMusic = musicManager.subscribe(() => {
      const nextConfig = musicManager.getHomeVideoConfig();
      const nextUrl = musicManager.getHomeVideoUrl();
      setHomeVideoConfig(nextConfig);
      setHomeVideoUrl((prevUrl) => {
        if (nextUrl && nextUrl !== prevUrl && !musicManager.isHomeVideoLoaded(nextUrl)) {
          setIsVideoBuffering(true);
        } else if (!nextUrl || musicManager.isHomeVideoLoaded(nextUrl)) {
          setIsVideoBuffering(false);
        }
        return nextUrl;
      });
      setIsHomeVideoLoading(musicManager.isHomeVideoLoading());
      setHomeVideoError(musicManager.getHomeVideoError());
    });
    return unsubMusic;
  }, [musicManager]);

  useEffect(() => {
    if (homeVideoConfig?.isEnabled && homeVideoUrl) {
      tryPlayIntroVideo();
    }
  }, [homeVideoConfig?.isEnabled, homeVideoUrl]);

  useEffect(() => {
    avatarManager.observeCatalog();
    if (user.uid) {
      avatarManager.observeUserMetadata(user.uid);
      void avatarManager.fetchUserMetadataOnce(user.uid);
    }
    const unsub = avatarManager.subscribe(() => {
      setAvatarTick((t) => t + 1);
      setAvatarError(false);
    });
    return unsub;
  }, [avatarManager, user.uid]);

  useEffect(() => {
    const syncStats = () => {
      setPlayerStats(playerStatsMgr.getPlayerStatisticsSnapshot(user.uid));
    };
    syncStats();
    if (user.uid) {
      void playerStatsMgr.refreshCloudUserStatsOnce(user.uid);
    }
    return playerStatsMgr.subscribe(syncStats);
  }, [playerStatsMgr, user.uid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: user.uid,
    photoURL: user.photoURL,
  });

  useEffect(() => {
    setAvatarError(false);
  }, [resolvedAvatarUrl]);

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  const profileMeta = user.uid ? avatarManager.getUserMetadata(user.uid) : null;
  const effectiveUser = {
    ...user,
    displayName: profileMeta?.displayName || user.displayName,
  };
  const displayLabel = getUserDisplayLabel(effectiveUser);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);
  const roleTrademarkBadge = getRoleTrademarkBadge(userRole);

  // Chỉ hiển thị thông báo lỗi thật sự khi quá trình kết nối phiên thất bại và có thông điệp lỗi cụ thể
  const hasRealSessionFailure =
    !isSessionActive &&
    session.status !== 'ACQUIRING' &&
    Boolean(session.message && session.message.trim().length > 0);

  // Keyboard shortcut: Space or Enter confirms selected mode if session is allowed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && isSessionActive && !isProcessing) {
        const activeTag = (document.activeElement?.tagName || '').toUpperCase();
        if (activeTag === 'BUTTON' || activeTag === 'INPUT' || activeTag === 'SELECT') {
          return;
        }
        e.preventDefault();
        handleConfirmSelectedMode(selectedModeCard);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, isProcessing, selectedModeCard]);

  const effectiveVideoSrc = musicManager.getHomeVideoPlaybackSrc() || homeVideoUrl;

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] font-body select-none overflow-x-hidden pb-[max(5rem,env(safe-area-inset-bottom))]">
      {/* Home Background Video (.mp4 with configurable opacity, blur & loop — reuses cached video from WelcomeScreen) */}
      {homeVideoConfig?.isEnabled && effectiveVideoSrc && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <video
            ref={videoRef}
            key={homeVideoConfig.videoId || 'intro-bantank'}
            src={effectiveVideoSrc}
            autoPlay
            muted
            playsInline
            preload="auto"
            loop={homeVideoConfig.loop !== false}
            style={{ opacity: homeVideoConfig.opacity }}
            className="w-full h-full object-cover blur-[3px] scale-105"
            onLoadStart={() => {
              if (!musicManager.isHomeVideoLoaded(homeVideoUrl)) {
                setIsVideoBuffering(true);
              }
            }}
            onLoadedMetadata={(e) => {
              const savedTime = musicManager.getHomeVideoPlaybackTime();
              if (savedTime > 0 && Math.abs(e.currentTarget.currentTime - savedTime) > 0.5) {
                try {
                  e.currentTarget.currentTime = savedTime;
                } catch {
                  // ignore seek error
                }
              }
            }}
            onLoadedData={() => {
              musicManager.markHomeVideoLoaded(homeVideoUrl);
              setIsVideoBuffering(false);
              tryPlayIntroVideo();
            }}
            onCanPlay={() => {
              musicManager.markHomeVideoLoaded(homeVideoUrl);
              setIsVideoBuffering(false);
              tryPlayIntroVideo();
            }}
            onPlaying={() => {
              musicManager.markHomeVideoLoaded(homeVideoUrl);
              setIsVideoBuffering(false);
            }}
            onTimeUpdate={(e) => {
              musicManager.setHomeVideoPlaybackTime(e.currentTarget.currentTime);
            }}
            onError={() => setIsVideoBuffering(false)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/65 via-[#050510]/35 to-[#050510]/85" />
        </div>
      )}

      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.18),rgba(5,5,16,0))] pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-grid-pattern opacity-15 pointer-events-none" />

      {/* Top Header Bar — Minimal Neo-Retro Header with Safe Area, Avatar, Level, Language Selector, Audio & Actions */}
      <header className="sticky top-0 z-40 w-full border-b border-[#687386]/40 bg-[#050510]/95 backdrop-blur-md px-2.5 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 shrink-0 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
          {/* Left: Language Selector VI | EN */}
          <LanguageSelector compact />

          {/* Right: Player Profile + Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded bg-[#0b0d1e]/90 text-xs min-w-0 ${roleFrameClasses}`}
            >
              {resolvedAvatarUrl && !avatarError ? (
                <img
                  src={resolvedAvatarUrl}
                  alt={displayLabel}
                  className="w-5 h-5 rounded-full object-cover border border-[#FFB800]/70 shrink-0"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
              )}
              <span className="inline-flex items-baseline font-bold text-[#FFB800] min-w-0">
                <span className="truncate max-w-[78px] xs:max-w-[110px] sm:max-w-[170px]">
                  {displayLabel}
                </span>
                {roleTrademarkBadge && (
                  <sup
                    data-testid="role-trademark-badge"
                    className="ml-0.5 text-[9px] font-black leading-none text-[#FFB800] select-none shrink-0"
                  >
                    {roleTrademarkBadge}
                  </sup>
                )}
              </span>
              <span
                data-testid="top-menu-player-level"
                title={`Level người chơi: ${playerStats.levelSystemLabel}`}
                className={`text-xs font-hud font-extrabold tabular-nums px-1.5 py-0.5 rounded border shrink-0 whitespace-nowrap ${
                  playerStats.isMaxLevel
                    ? 'bg-[#FFB800] text-[#050510] border-[#FFB800]'
                    : playerStats.xpVerificationStatus === 'VERIFIED'
                      ? 'bg-[#FFB800]/15 border-[#FFB800]/50 text-[#FFB800]'
                      : 'bg-[#050510] border-[#687386]/60 text-[#687386]'
                }`}
              >
                {playerStats.levelTopMenuBadge}
              </span>
              {badgeInfo.label && (
                <span
                  className={`hidden sm:inline-block text-[10px] px-1.5 py-0.2 rounded border font-medium shrink-0 ${badgeInfo.badgeStyle}`}
                >
                  {badgeInfo.label}
                </span>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <QuickAudioToggleButton />

              <button
                type="button"
                onClick={onOpenSettings}
                aria-label={t('Cài đặt', 'Settings')}
                className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 rounded bg-[#0b0d1e] hover:bg-[#10142b] text-[#EAF4FF] border border-[#687386]/60 text-xs font-semibold transition-all shadow cursor-pointer"
                title={t('Cài đặt Tài khoản & Media', 'Account & Media Settings')}
              >
                <Settings className="w-3.5 h-3.5 text-[#FFB800]" />
              </button>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={onOpenDevTools}
                  className="flex items-center gap-1 min-h-[36px] px-2 py-1.5 rounded bg-[#0b0d1e] hover:bg-[#10142b] text-[#EAF4FF] border border-[#687386]/60 text-xs font-semibold transition-all shadow cursor-pointer"
                  title="Bảng Kiểm thử & QA (Admin)"
                >
                  <Wrench className="w-3 h-3 text-[#FFB800]" />
                  <span className="hidden sm:inline">QA</span>
                </button>
              )}

              <button
                type="button"
                onClick={onSignOut}
                disabled={isProcessing}
                aria-label={t('Đăng xuất', 'Sign Out')}
                className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 rounded bg-[#0b0d1e] hover:bg-[#10142b] text-[#EAF4FF] border border-[#687386]/60 text-xs font-semibold transition-all shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                title={t('Đăng xuất khỏi tài khoản an toàn', 'Sign out safely')}
              >
                <LogOut className="w-3.5 h-3.5 text-[#FF0055]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Lobby Container - Preserves Logo, Slogan, Color Format & Button Structure of WelcomeScreen + Neo-Retro Status & Tank Showcase */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-2 sm:px-4 pt-1 sm:pt-2 pb-6 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-2xl w-full">
          {/* Official Game Logo Hero — Unified 200% Standard (320x320) */}
          <div className="flex justify-center items-center p-0 m-0">
            <GameLogo />
          </div>

          {/* Slogan Banner Image (/slogan.png) — zero outer margin/padding on all 4 sides */}
          <h1 className="inline-flex items-center justify-center p-0 m-0 leading-none">
            <img
              src="/slogan.png"
              alt={t('Chiến trường huyền thoại', 'Legendary Tank Battlefield')}
              data-testid="main-menu-slogan-image"
              className="block w-auto max-w-[280px] sm:max-w-[380px] h-auto object-contain p-0 m-0 drop-shadow-lg select-none pointer-events-none"
              draggable={false}
            />
          </h1>

          {/* 8-Bit Arcade Player Status Bar (Level, XP Progress, Xu Balance) & Tank IDLE Showcase */}
          <div
            data-testid="lobby-player-status-bar"
            className="w-full max-w-md mt-2 px-3 py-2 neo-bevel-card border border-[#687386]/50 flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="font-hud text-sm sm:text-base font-bold text-[#FFB800]">
                {playerStats.levelTopMenuBadge}
              </span>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 text-[11px] font-hud text-[#EAF4FF]">
                  <Trophy className="w-3 h-3 text-[#FFB800]" />
                  <span>{playerStats.totalXp.toLocaleString()} XP</span>
                  <span className="text-[#00F0FF]">({playerStats.levelProgressPercent}%)</span>
                </div>
                <div className="w-24 sm:w-28 h-1.5 bg-[#050510] border border-[#687386]/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FFB800] to-[#00F0FF]"
                    style={{ width: `${Math.min(100, Math.max(0, playerStats.levelProgressPercent))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#050510] border border-[#00F0FF]/40 font-hud text-sm text-[#00F0FF]">
              <Coins className="w-3.5 h-3.5 text-[#FFB800]" />
              <span>{playerStats.xuBalance.toLocaleString()} XU</span>
            </div>

            <LobbyIdleTankShowcase />
          </div>

          {/* Real Error Alert Card */}
          {hasRealSessionFailure && (
            <div className="w-full max-w-md mt-2.5 mb-3 p-4 neo-bevel-card neo-bevel-red text-[#EAF4FF] text-left flex flex-col gap-2.5 shadow-lg animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-[#FF0055]">
                <AlertCircle className="w-4 h-4 text-[#FF0055] shrink-0" />
                <span>
                  {t('Không thể xác nhận phiên tài khoản', 'Unable to verify account session')}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-[#EAF4FF]/90 leading-relaxed whitespace-pre-line">
                {formatSentenceLineBreaks(formatAccountStatusMessage(session.message, session.status))}
              </p>
              <div>
                <button
                  type="button"
                  onClick={onRetryAcquire}
                  disabled={isProcessing}
                  className="min-h-[44px] py-2 px-4 rounded bg-[#FFB800] hover:bg-[#FFB800]/90 text-[#050510] font-btn font-extrabold text-xs transition-all flex items-center gap-2 shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>
                    {isProcessing
                      ? t('ĐANG THỬ LẠI...', 'RETRYING...')
                      : t('THỬ KẾT NỐI LẠI', 'RETRY CONNECTION')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Unified Neo-Retro Mode Selection Cards (3-Column Responsive Grid — Full Portrait & Landscape Visibility, 1-Tap Selection) */}
          <div
            data-testid="lobby-mode-scroll-snap"
            className="w-full max-w-md grid grid-cols-3 gap-2 sm:gap-2.5 px-1 mt-3"
          >
            <button
              type="button"
              data-testid="lobby-mode-card-solo"
              aria-pressed={selectedModeCard === 'SOLO'}
              onClick={() => handleSelectModeCard('SOLO')}
              className={`min-h-[84px] p-2 sm:p-2.5 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'SOLO'
                  ? 'border-2 border-[#FFB800] bg-[#120e05]/95 ring-2 ring-[#FFB800]/30 shadow-[0_0_16px_rgba(255,184,0,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#FFB800]/70 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="font-hud text-xs font-bold">1P</span>
              </div>
              <div>
                <div className="font-btn text-xs sm:text-sm font-extrabold text-[#EAF4FF] leading-tight">
                  SOLO
                </div>
                <div className="text-[10px] text-[#EAF4FF]/75 leading-tight mt-0.5">
                  {t('Tác chiến đơn', 'Single Player')}
                </div>
              </div>
              <div
                className={`mt-1.5 text-[9px] font-btn font-black uppercase tracking-wider px-1.5 py-0.5 text-center ${
                  selectedModeCard === 'SOLO'
                    ? 'bg-[#FFB800] text-[#050510]'
                    : 'bg-[#050510] text-[#FFB800] border border-[#FFB800]/40'
                }`}
              >
                {selectedModeCard === 'SOLO'
                  ? t('ĐANG CHỌN', 'SELECTED')
                  : t('CHẠM CHỌN', 'SELECT')}
              </div>
            </button>

            <button
              type="button"
              data-testid="lobby-mode-card-coop-ai"
              aria-pressed={selectedModeCard === 'COOP_AI'}
              onClick={() => handleSelectModeCard('COOP_AI')}
              className={`min-h-[84px] p-2 sm:p-2.5 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'COOP_AI'
                  ? 'border-2 border-[#00F0FF] bg-[#051624]/95 ring-2 ring-[#00F0FF]/30 shadow-[0_0_16px_rgba(0,240,255,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#00F0FF]/70 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between text-[#00F0FF] mb-1">
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span className="font-hud text-xs font-bold">P1+AI</span>
              </div>
              <div>
                <div className="font-btn text-xs sm:text-sm font-extrabold text-[#EAF4FF] leading-tight">
                  CO-OP AI
                </div>
                <div className="text-[10px] text-[#EAF4FF]/75 leading-tight mt-0.5">
                  {t('Đồng đội AI', 'Ally AI Co-op')}
                </div>
              </div>
              <div
                className={`mt-1.5 text-[9px] font-btn font-black uppercase tracking-wider px-1.5 py-0.5 text-center ${
                  selectedModeCard === 'COOP_AI'
                    ? 'bg-[#00F0FF] text-[#050510]'
                    : 'bg-[#050510] text-[#00F0FF] border border-[#00F0FF]/40'
                }`}
              >
                {selectedModeCard === 'COOP_AI'
                  ? t('ĐANG CHỌN', 'SELECTED')
                  : t('CHẠM CHỌN', 'SELECT')}
              </div>
            </button>

            <button
              type="button"
              data-testid="lobby-mode-card-coop-online"
              aria-pressed={selectedModeCard === 'COOP_ONLINE'}
              onClick={() => handleSelectModeCard('COOP_ONLINE')}
              className={`min-h-[84px] p-2 sm:p-2.5 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'COOP_ONLINE'
                  ? 'border-2 border-[#FFB800] bg-[#120e05]/95 ring-2 ring-[#FFB800]/30 shadow-[0_0_16px_rgba(255,184,0,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#FFB800]/70 opacity-90'
              }`}
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span className="font-hud text-xs font-bold">2P P2P</span>
              </div>
              <div>
                <div className="font-btn text-[11px] sm:text-xs font-extrabold text-[#EAF4FF] leading-tight">
                  CO-OP ONLINE
                </div>
                <div className="text-[10px] text-[#EAF4FF]/75 leading-tight mt-0.5">
                  {t('2 Người Online', 'Online 2P')}
                </div>
              </div>
              <div
                className={`mt-1.5 text-[9px] font-btn font-black uppercase tracking-wider px-1.5 py-0.5 text-center ${
                  selectedModeCard === 'COOP_ONLINE'
                    ? 'bg-[#FFB800] text-[#050510]'
                    : 'bg-[#050510] text-[#FFB800] border border-[#FFB800]/40'
                }`}
              >
                {selectedModeCard === 'COOP_ONLINE'
                  ? t('ĐANG CHỌN', 'SELECTED')
                  : t('CHẠM CHỌN', 'SELECT')}
              </div>
            </button>
          </div>

          {/* Primary Neo-Retro Mode Confirmation CTA (Single-Tap Confirm for Selected Mode) */}
          <div className="w-full max-w-[260px] flex flex-col items-center gap-2 px-2 mt-3 mb-3">
            <button
              type="button"
              data-testid="main-menu-play-btn"
              onClick={() => handleConfirmSelectedMode(selectedModeCard)}
              disabled={isProcessing}
              className={`w-full min-h-[48px] py-3 px-4 neo-clip-corner bg-[#FFB800] hover:bg-[#ffc933] active:translate-y-[1px] text-[#050510] font-btn font-extrabold text-xs sm:text-sm whitespace-nowrap shadow-[0_0_20px_rgba(255,184,0,0.4)] hover:shadow-[0_0_26px_rgba(255,184,0,0.65)] transition-all duration-200 flex items-center justify-center gap-2 border-2 border-[#EAF4FF]/85 touch-manipulation ${
                isProcessing
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-[#050510] text-[#050510] shrink-0" />
              <span
                data-testid="main-menu-play-gradient-text"
                className="tracking-wider uppercase font-black"
              >
                {selectedModeCard === 'SOLO'
                  ? t('XÁC NHẬN — VÀO SOLO', 'CONFIRM — ENTER SOLO')
                  : selectedModeCard === 'COOP_AI'
                    ? t('XÁC NHẬN — CO-OP AI', 'CONFIRM — CO-OP AI')
                    : t('XÁC NHẬN — CO-OP ONLINE', 'CONFIRM — CO-OP ONLINE')}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Trạng thái đang tải Video Intro Trang Chủ (hiển thị ngay phía trên thanh footer) */}
      {homeVideoConfig?.isEnabled &&
        !homeVideoError &&
        (isHomeVideoLoading || (Boolean(homeVideoUrl) && isVideoBuffering)) && (
          <div
            data-testid="home-video-loading-banner"
            role="status"
            aria-live="polite"
            className="relative z-10 w-full border-t border-[#FFB800]/30 bg-[#050510]/90 backdrop-blur-sm px-4 py-2 text-xs text-[#FFB800] flex items-center justify-center gap-2 shrink-0"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFB800] shrink-0" />
            <span>{t('Đang tải Video intro...', 'Loading intro video...')}</span>
          </div>
        )}

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-[#687386]/30 bg-[#050510]/85 px-4 py-2.5 text-center text-xs text-[#687386] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 flex-wrap">
          <span className="text-[#EAF4FF]/80">© 2026 Bắn Tank Online</span>
          <span>•</span>
          <a href="/landing.html" className="hover:text-[#FFB800] transition-colors">
            {t('Giới thiệu', 'About')}
          </a>
          <span>•</span>
          <a href="/privacy.html" className="hover:text-[#00F0FF] transition-colors">
            {t('Chính sách quyền riêng tư', 'Privacy Policy')}
          </a>
        </div>
      </footer>

      {/* Fixed Bottom Navigation (Section 7 of Neo-Retro Art System V1.0 Final) */}
      <nav
        data-testid="lobby-bottom-nav"
        aria-label={t('Điều hướng sảnh chính', 'Main Lobby Navigation')}
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#687386]/40 bg-[#050510]/95 backdrop-blur-md px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-lg mx-auto grid grid-cols-4 gap-1">
          <button
            type="button"
            onClick={isSessionActive ? onPlay : onRetryAcquire}
            className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[#FFB800] hover:bg-[#FFB800]/10 transition-colors cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4" />
            <span className="text-[10px] font-btn font-bold uppercase tracking-tight">
              {t('Chế độ', 'Modes')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[#EAF4FF]/80 hover:text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-[#00F0FF]" />
            <span className="text-[10px] font-btn font-bold uppercase tracking-tight">
              {t('Hồ sơ & Cấp', 'Profile')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[#EAF4FF]/80 hover:text-[#FFB800] hover:bg-[#FFB800]/10 transition-colors cursor-pointer"
          >
            <Volume2 className="w-4 h-4 text-[#FFB800]" />
            <span className="text-[10px] font-btn font-bold uppercase tracking-tight">
              {t('Âm thanh', 'Audio')}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenSupport}
            className="min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[#EAF4FF]/80 hover:text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-[#00F0FF]" />
            <span className="text-[10px] font-btn font-bold uppercase tracking-tight">
              {t('Hướng dẫn', 'Guide')}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
};
