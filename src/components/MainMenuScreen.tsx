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
  onSignOut,
  onRetryAcquire,
  onOpenSettings,
  onOpenSupport,
  onOpenDevTools,
  isSuperAdmin = false,
}) => {
  const { t } = useLanguage();
  const isSessionActive = session.status === 'ACTIVE';
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

  // Keyboard shortcut: Space or Enter starts mode selection if session is ACTIVE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && isSessionActive && !isProcessing) {
        e.preventDefault();
        onPlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, isProcessing, onPlay]);

  const effectiveVideoSrc = musicManager.getHomeVideoPlaybackSrc() || homeVideoUrl;

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-[#050510] text-[#EAF4FF] font-body select-none overflow-x-hidden overflow-y-auto pb-[max(4.5rem,env(safe-area-inset-bottom))]">
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

          {/* Primary Action Button: "CHỌN CHẾ ĐỘ CHƠI" & Unified CÀI ĐẶT / HƯỚNG DẪN (Same compact width + white-to-red gradient format as WelcomeScreen) */}
          <div className="w-full max-w-[260px] flex flex-col items-center gap-2.5 px-2 mt-2.5 mb-3">
            <button
              type="button"
              data-testid="main-menu-play-btn"
              onClick={isSessionActive ? onPlay : onRetryAcquire}
              disabled={isProcessing}
              className={`w-full min-h-[48px] py-3 px-4 rounded-xl bg-gradient-to-r from-white via-red-600 to-white bg-[length:200%_100%] bg-left hover:bg-right text-white font-btn font-extrabold text-xs sm:text-sm whitespace-nowrap shadow-lg shadow-red-600/30 hover:shadow-red-600/50 transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-2 border border-red-400/80 ${
                isProcessing
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer'
              }`}
            >
              <Play className="w-4 h-4 fill-red-600 text-red-700 drop-shadow-sm shrink-0" />
              <span
                data-testid="main-menu-play-gradient-text"
                className="tracking-wide uppercase drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.85)]"
              >
                {t('CHỌN CHẾ ĐỘ CHƠI', 'SELECT GAME MODE')}
              </span>
            </button>

            <div className="w-full grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onOpenSettings}
                className="w-full min-h-[48px] py-3 px-2.5 rounded-xl bg-gradient-to-r from-neutral-900 via-zinc-700 to-neutral-950 bg-[length:200%_100%] bg-left hover:bg-right text-[#EAF4FF] hover:text-[#FFB800] font-btn font-extrabold text-[11px] sm:text-xs whitespace-nowrap border border-[#687386]/80 hover:border-[#FFB800]/60 transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-black/40 cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 text-[#FFB800] shrink-0" />
                <span className="tracking-wide uppercase">{t('CÀI ĐẶT', 'SETTINGS')}</span>
              </button>

              <button
                type="button"
                onClick={onOpenSupport}
                className="w-full min-h-[48px] py-3 px-2.5 rounded-xl bg-gradient-to-r from-neutral-900 via-zinc-700 to-neutral-950 bg-[length:200%_100%] bg-left hover:bg-right text-[#EAF4FF] hover:text-[#00F0FF] font-btn font-extrabold text-[11px] sm:text-xs whitespace-nowrap border border-[#687386]/80 hover:border-[#00F0FF]/60 transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-1.5 shadow-lg shadow-black/40 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                <span className="tracking-wide uppercase">{t('HƯỚNG DẪN', 'GUIDE')}</span>
              </button>
            </div>
          </div>

          {/* Swipeable Horizontal Mode Cards Preview (CSS Scroll Snap) */}
          <div
            data-testid="lobby-mode-scroll-snap"
            className="w-full max-w-md flex items-stretch gap-2.5 overflow-x-auto snap-x snap-mandatory px-2 py-1 no-scrollbar"
          >
            <button
              type="button"
              onClick={isSessionActive ? onPlay : onRetryAcquire}
              className="snap-center shrink-0 w-[135px] sm:w-[140px] p-2.5 neo-bevel-card hover:border-[#FFB800] text-left transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <User className="w-3.5 h-3.5" />
                <span className="font-hud text-xs">1P</span>
              </div>
              <div className="font-btn text-xs font-extrabold text-[#EAF4FF]">SOLO</div>
              <div className="text-[10px] text-[#687386] truncate">
                {t('Tác chiến đơn', 'Single Player')}
              </div>
            </button>

            <button
              type="button"
              onClick={isSessionActive ? onPlay : onRetryAcquire}
              className="snap-center shrink-0 w-[135px] sm:w-[140px] p-2.5 neo-bevel-card hover:border-[#00F0FF] text-left transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-[#00F0FF] mb-1">
                <Bot className="w-3.5 h-3.5" />
                <span className="font-hud text-xs">P1+AI</span>
              </div>
              <div className="font-btn text-xs font-extrabold text-[#EAF4FF]">CO-OP AI</div>
              <div className="text-[10px] text-[#687386] truncate">
                {t('Đồng đội AI', 'Ally AI Co-op')}
              </div>
            </button>

            <button
              type="button"
              onClick={isSessionActive ? onPlay : onRetryAcquire}
              className="snap-center shrink-0 w-[135px] sm:w-[140px] p-2.5 neo-bevel-card hover:border-[#FFB800] text-left transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <Globe className="w-3.5 h-3.5" />
                <span className="font-hud text-xs">2P P2P</span>
              </div>
              <div className="font-btn text-xs font-extrabold text-[#EAF4FF]">CO-OP ONLINE</div>
              <div className="text-[10px] text-[#687386] truncate">
                {t('2 Người Online', 'Online 2-Player')}
              </div>
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
      <footer className="relative z-10 w-full border-t border-[#687386]/30 bg-[#050510]/85 px-4 py-2.5 text-center text-xs text-[#687386]">
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
