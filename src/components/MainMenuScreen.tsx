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
  RefreshCw,
  UserCheck,
  AlertCircle,
  Loader2,
  Trophy,
  User,
  Bot,
  Globe,
} from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { TopMenuActionDrawer } from './TopMenuActionDrawer.tsx';
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
    className="p1-ready-gradient-bg inline-flex items-center justify-center px-2.5 py-1 rounded border border-[#FFB800]/80 gap-2 shadow-[0_0_12px_rgba(255,184,0,0.3)]"
  >
    <svg
      viewBox="0 0 32 32"
      className="w-7 h-7 tank-idle-bob shrink-0"
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
    <span className="font-btn text-xs font-extrabold uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(5,5,16,0.95)]">
      P1 READY
    </span>
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
  const isSessionUnverified =
    session.status === 'CONNECTION_LOST_UNVERIFIED' ||
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED';
  const isSessionBlocked = isSessionDisplacedOrExpired || isSessionUnverified;
  const isSessionActive = !isSessionBlocked;
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
    if (isSessionBlocked) {
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
    const handleVisibility = () => {
      const el = videoRef.current;
      if (!el) return;
      if (document.visibilityState === 'hidden') {
        el.pause();
      } else if (homeVideoConfig?.isEnabled) {
        tryPlayIntroVideo();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [homeVideoConfig?.isEnabled]);

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
  void roleFrameClasses;
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
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] font-body select-none overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
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
            className="w-full h-full object-cover"
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
          <div className="absolute inset-0 bg-gradient-to-b from-[#050510]/72 via-[#050510]/50 to-[#050510]/88" />
        </div>
      )}

      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.18),rgba(5,5,16,0))] pointer-events-none" />
      <div className="absolute inset-0 z-0 bg-grid-pattern opacity-15 pointer-events-none" />

      {/* Top Header Bar — Frameless Player Name & Horizontal Slide-Out Action Drawer */}
      <header className="sticky top-0 z-40 w-full border-b border-[#687386]/35 bg-[#050510]/96 px-3 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 shrink-0 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 min-w-0">
          {/* Left: Frameless Player Profile + Level */}
          <div className="flex items-center gap-2 min-w-0 py-0.5 text-sm">
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
              <span className="truncate max-w-[125px] xs:max-w-[165px] sm:max-w-[220px]">
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
            {badgeInfo.label && (
              <span className="hidden sm:inline-block text-xs font-medium text-[#FFB800] shrink-0">
                • {badgeInfo.label}
              </span>
            )}
          </div>

          {/* Right: 3-Line Hamburger Slide-Out Menu (Settings, Info, QA, Exit) */}
          <TopMenuActionDrawer
            onOpenSettings={onOpenSettings}
            onOpenSupport={onOpenSupport}
            onOpenDevTools={onOpenDevTools}
            onExit={onSignOut}
            exitLabel={t('Thoát', 'Exit')}
            isSuperAdmin={isSuperAdmin}
            isExitDisabled={isProcessing}
          />
        </div>
      </header>

      {/* Main Lobby Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-3 sm:px-4 pt-2 sm:pt-3 pb-4 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-2xl w-full">
          {/* Enlarged Centered Game Logo Hero at Top */}
          <div className="flex justify-center items-center p-0 m-0">
            <GameLogo />
          </div>

          {/* 8-Bit Arcade Player Status Bar (Level, XP Progress) & Tank IDLE Showcase */}
          <div
            data-testid="lobby-player-status-bar"
            className="w-full max-w-md mt-2 px-3 py-2 neo-bevel-card border border-[#687386]/50 flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <div className="flex items-center gap-2.5">
              <span
                data-testid="top-menu-player-level"
                title={`Level người chơi: ${playerStats.levelSystemLabel}`}
                className="font-hud text-base sm:text-lg font-bold text-[#FFB800]"
              >
                {playerStats.levelTopMenuBadge}
              </span>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-hud text-[#EAF4FF]">
                  <Trophy className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>{playerStats.totalXp.toLocaleString()} XP</span>
                  <span className="text-[#00F0FF]">({playerStats.levelProgressPercent}%)</span>
                </div>
                <div className="w-28 sm:w-36 h-1.5 bg-[#050510] border border-[#687386]/60 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FFB800] to-[#00F0FF]"
                    style={{ width: `${Math.min(100, Math.max(0, playerStats.levelProgressPercent))}%` }}
                  />
                </div>
              </div>
            </div>

            <LobbyIdleTankShowcase />
          </div>

          {/* Real Error Alert Card */}
          {hasRealSessionFailure && (
            <div className="w-full max-w-md mt-2.5 mb-3 p-4 neo-bevel-card neo-bevel-red text-[#EAF4FF] text-left flex flex-col gap-2.5 shadow-lg animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-sm text-[#FF0055]">
                <AlertCircle className="w-4 h-4 text-[#FF0055] shrink-0" />
                <span>
                  {t('Không thể xác nhận phiên tài khoản', 'Unable to verify account session')}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#EAF4FF]/90 leading-relaxed whitespace-pre-line">
                {formatSentenceLineBreaks(formatAccountStatusMessage(session.message, session.status))}
              </p>
              <div>
                <button
                  type="button"
                  onClick={onRetryAcquire}
                  disabled={isProcessing}
                  className="min-h-[44px] py-2 px-4 rounded bg-[#FFB800] hover:bg-[#FFB800]/90 text-[#050510] font-btn font-extrabold text-xs sm:text-sm transition-all flex items-center gap-2 shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>
                    {isProcessing
                      ? t('ĐANG THỬ LẠI...', 'RETRYING...')
                      : t('THỬ KẾT NỐI LẠI', 'RETRY CONNECTION')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Unified Neo-Retro Mode Selection Cards (3-Column Grid Matched to LV Bar Width — Single-Click Entry) */}
          <div
            data-testid="lobby-mode-scroll-snap"
            className="w-full max-w-md grid grid-cols-3 gap-2 sm:gap-2.5 mt-3"
          >
            <button
              type="button"
              data-testid="lobby-mode-card-solo"
              aria-pressed={selectedModeCard === 'SOLO'}
              onClick={() => {
                handleSelectModeCard('SOLO');
                handleConfirmSelectedMode('SOLO');
              }}
              className={`min-h-[82px] p-2 sm:p-3 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'SOLO'
                  ? 'border-2 border-[#FFB800] bg-[#120e05]/95 ring-2 ring-[#FFB800]/30 shadow-[0_0_16px_rgba(255,184,0,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#FFB800]/70 opacity-95'
              }`}
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <User className="w-4 h-4 shrink-0" />
                <span className="font-hud text-sm font-bold">1P</span>
              </div>
              <div>
                <div className="font-btn text-[13px] sm:text-base font-extrabold text-[#EAF4FF] leading-tight whitespace-nowrap">
                  SOLO
                </div>
                <div className="text-xs text-[#EAF4FF]/80 leading-tight mt-0.5">
                  {t('Đơn đấu', '1 Player')}
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="lobby-mode-card-coop-ai"
              aria-pressed={selectedModeCard === 'COOP_AI'}
              onClick={() => {
                handleSelectModeCard('COOP_AI');
                handleConfirmSelectedMode('COOP_AI');
              }}
              className={`min-h-[82px] p-2 sm:p-3 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'COOP_AI'
                  ? 'border-2 border-[#00F0FF] bg-[#051624]/95 ring-2 ring-[#00F0FF]/30 shadow-[0_0_16px_rgba(0,240,255,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#00F0FF]/70 opacity-95'
              }`}
            >
              <div className="flex items-center justify-between text-[#00F0FF] mb-1">
                <Bot className="w-4 h-4 shrink-0" />
                <span className="font-hud text-sm font-bold">P1+AI</span>
              </div>
              <div>
                <div className="font-btn text-[13px] sm:text-base font-extrabold text-[#EAF4FF] leading-tight whitespace-nowrap">
                  CO-OP AI
                </div>
                <div className="text-xs text-[#EAF4FF]/80 leading-tight mt-0.5">
                  {t('Cùng AI', 'With AI')}
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="lobby-mode-card-coop-online"
              aria-pressed={selectedModeCard === 'COOP_ONLINE'}
              onClick={() => {
                handleSelectModeCard('COOP_ONLINE');
                handleConfirmSelectedMode('COOP_ONLINE');
              }}
              className={`min-h-[82px] p-2 sm:p-3 neo-bevel-card text-left transition-all cursor-pointer touch-manipulation flex flex-col justify-between ${
                selectedModeCard === 'COOP_ONLINE'
                  ? 'border-2 border-[#FFB800] bg-[#120e05]/95 ring-2 ring-[#FFB800]/30 shadow-[0_0_16px_rgba(255,184,0,0.28)]'
                  : 'border border-[#687386]/50 hover:border-[#FFB800]/70 opacity-95'
              }`}
            >
              <div className="flex items-center justify-between text-[#FFB800] mb-1">
                <Globe className="w-4 h-4 shrink-0" />
                <span className="font-hud text-sm font-bold">2P</span>
              </div>
              <div>
                <div className="font-btn text-[13px] sm:text-base font-extrabold text-[#EAF4FF] leading-tight whitespace-nowrap tracking-tight">
                  CO-OP ONLINE
                </div>
                <div className="text-xs text-[#EAF4FF]/80 leading-tight mt-0.5">
                  {t('2 Người', 'Online 2P')}
                </div>
              </div>
            </button>
          </div>

          {/* Centered Slogan Banner Below Mode Selection Cards */}
          <h1 className="inline-flex items-center justify-center p-0 mt-4 mb-2 leading-none">
            <img
              src="/slogan.png"
              alt={t('Chiến trường huyền thoại', 'Legendary Tank Battlefield')}
              data-testid="main-menu-slogan-image"
              className="block w-auto max-w-[260px] sm:max-w-[360px] h-auto object-contain p-0 m-0 drop-shadow-lg select-none pointer-events-none"
              draggable={false}
            />
          </h1>
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
            className="relative z-10 w-full border-t border-[#FFB800]/30 bg-[#050510]/92 px-4 py-2 text-xs sm:text-sm text-[#FFB800] flex items-center justify-center gap-2 shrink-0"
          >
            <Loader2 className="w-4 h-4 animate-spin text-[#FFB800] shrink-0" />
            <span>{t('Đang tải Video intro...', 'Loading intro video...')}</span>
          </div>
        )}

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-[#687386]/30 bg-[#050510]/85 px-4 py-2.5 text-center text-xs sm:text-sm text-[#687386] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 flex-wrap">
          <span className="text-[#EAF4FF]/80">© 2026 Bắn Tank Online</span>
        </div>
      </footer>

      <div data-testid="lobby-bottom-nav" className="hidden" aria-hidden="true" />
    </div>
  );
};
