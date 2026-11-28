/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Gamepad2, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { LanguageSelector } from './LanguageSelector.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import { SoundManager } from '../core/audio.ts';
import { MusicManager, type HomeBackgroundVideoConfig } from '../core/musicManager.ts';
import {
  MaintenanceManager,
  buildMaintenanceNoticeMessage,
  type SystemMaintenanceConfigDocument,
} from '../core/maintenanceManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

export const HOME_INTRO_REVEAL_DELAY_MS = 5000;

export interface WelcomeScreenProps {
  onSignIn: () => Promise<void>;
  onStartTrialMode?: () => void;
  isProcessing: boolean;
  isAuthChecking?: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClearFeedback: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSignIn,
  onStartTrialMode,
  isProcessing,
  isAuthChecking = false,
  errorMessage,
  successMessage,
  onClearFeedback,
}) => {
  const { t } = useLanguage();
  const musicManager = MusicManager.getInstance();
  const maintenanceMgr = MaintenanceManager.getInstance();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasScheduledIntroRef = useRef<boolean>(false);
  const [isIntroUiVisible, setIsIntroUiVisible] = useState<boolean>(false);
  const [maintenanceConfig, setMaintenanceConfig] = useState<SystemMaintenanceConfigDocument>(() =>
    maintenanceMgr.getConfig()
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

  // Gate 2C Task 3: Deterministic 5.000s Home intro timeline (mount-scoped, immune to rerenders & slow video load)
  useEffect(() => {
    if (hasScheduledIntroRef.current) return;
    hasScheduledIntroRef.current = true;
    introTimerRef.current = setTimeout(() => {
      introTimerRef.current = null;
      setIsIntroUiVisible(true);
    }, HOME_INTRO_REVEAL_DELAY_MS);

    return () => {
      if (introTimerRef.current !== null) {
        clearTimeout(introTimerRef.current);
        introTimerRef.current = null;
      }
      hasScheduledIntroRef.current = false;
    };
  }, []);

  useEffect(() => {
    musicManager.preloadStaticHomeVideoOnce();
    SoundManager.getInstance().unlock();
    musicManager.syncMenuPlayback();
  }, [musicManager]);

  useEffect(() => {
    const unsubMaint = maintenanceMgr.subscribe(() => {
      setMaintenanceConfig(maintenanceMgr.getConfig());
    });
    return unsubMaint;
  }, [maintenanceMgr]);

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

  const tryPlayIntroVideo = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.defaultMuted = true;
    // Prevent unrelated React rerenders from interrupting or restarting active intro playback
    if (!el.paused && el.readyState >= 2) return;
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Ignore strict browser policy errors; fallback listeners remain active
      });
    }
  };

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

  const isMaintenanceActive = Boolean(maintenanceConfig.isActive);
  const maintenanceNoticeText =
    maintenanceConfig.message ||
    buildMaintenanceNoticeMessage(maintenanceConfig.startAtMs, maintenanceConfig.endAtMs);
  const effectiveVideoSrc = musicManager.getHomeVideoPlaybackSrc() || homeVideoUrl;

  return (
    <div
      data-testid="welcome-screen-root"
      data-intro-phase={isIntroUiVisible ? 'revealed' : 'intro-only'}
      className="relative min-h-[100dvh] w-full flex flex-col justify-between bg-[#050510] text-[#EAF4FF] font-body select-none overflow-x-hidden pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.25rem,env(safe-area-inset-bottom))]"
    >
      {/* Intro Background Video (0.000s-4.999s full intro clip focus; loops smoothly behind UI from 5.000s onward) */}
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
            style={{ opacity: isIntroUiVisible ? homeVideoConfig.opacity : 1 }}
            className="w-full h-full object-cover transition-opacity duration-[1200ms] ease-out"
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
              if (
                !musicManager.isBgmActivelyPlaying() &&
                !musicManager.isAwaitingAutoplayUnlock() &&
                !SoundManager.getInstance().isHomeBgmMuted()
              ) {
                musicManager.syncMenuPlayback();
              }
            }}
            onCanPlay={() => {
              musicManager.markHomeVideoLoaded(homeVideoUrl);
              setIsVideoBuffering(false);
              tryPlayIntroVideo();
            }}
            onPlaying={() => {
              musicManager.markHomeVideoLoaded(homeVideoUrl);
              setIsVideoBuffering(false);
              if (
                !musicManager.isBgmActivelyPlaying() &&
                !musicManager.isAwaitingAutoplayUnlock() &&
                !SoundManager.getInstance().isHomeBgmMuted()
              ) {
                musicManager.syncMenuPlayback();
              }
            }}
            onTimeUpdate={(e) => {
              musicManager.setHomeVideoPlaybackTime(e.currentTarget.currentTime);
            }}
            onError={() => setIsVideoBuffering(false)}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-b from-[#050510]/72 via-[#050510]/50 to-[#050510]/88 transition-opacity duration-[1200ms] ease-out ${
              isIntroUiVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* Background Ambience: Neo-Retro tactical grid and radial glow (fades in gradually with foreground UI at 5.000s) */}
      <div
        className={`fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,184,0,0.16),rgba(5,5,16,0))] pointer-events-none transition-opacity duration-[1400ms] ease-out ${
          isIntroUiVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`fixed inset-0 bg-grid-pattern pointer-events-none transition-opacity duration-[1400ms] ease-out ${
          isIntroUiVisible ? 'opacity-20' : 'opacity-0'
        }`}
      />

      {/* Top Controls Bar: Home-only Music Toggle + Language Selector (VI | EN) */}
      <div
        data-testid="welcome-top-controls"
        aria-hidden={!isIntroUiVisible}
        className={`relative z-20 max-w-4xl mx-auto w-full px-3 sm:px-4 pt-1 flex items-center justify-end gap-2 shrink-0 transition-opacity duration-[1400ms] ease-out delay-300 ${
          isIntroUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <QuickAudioToggleButton compact scope="HOME" />
        <LanguageSelector compact />
      </div>

      {/* Notifications: Auth checking / Logout notice / Error alert (revealed cleanly with Home UI at 5.000s) */}
      <div
        aria-hidden={!isIntroUiVisible}
        className={`relative z-20 max-w-xl mx-auto w-full px-3 sm:px-4 pt-1 sm:pt-2 shrink-0 transition-opacity duration-[1400ms] ease-out delay-300 ${
          isIntroUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {isAuthChecking && (
          <div className="mb-2 px-3 py-1 rounded bg-[#0b0d1e]/90 border border-[#00F0FF]/30 text-center text-[11px] font-mono text-[#FFB800]/90">
            {t('Đang kiểm tra trạng thái kết nối...', 'Checking connection status...')}
          </div>
        )}

        {successMessage && (
          <div className="mb-2 p-3.5 neo-bevel-card border border-[#00F0FF]/60 text-[#EAF4FF] text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#00F0FF] shrink-0" />
              <span className="font-medium whitespace-pre-line">
                {formatSentenceLineBreaks(successMessage)}
              </span>
            </div>
            <button
              type="button"
              tabIndex={isIntroUiVisible ? 0 : -1}
              onClick={onClearFeedback}
              className="text-[#00F0FF] hover:text-white text-xs min-w-[36px] min-h-[36px] px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-2 p-3.5 neo-bevel-card neo-bevel-red text-[#EAF4FF] text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-[#FF0055] shrink-0" />
              <span className="font-medium whitespace-pre-line">
                {formatSentenceLineBreaks(errorMessage)}
              </span>
            </div>
            <button
              type="button"
              tabIndex={isIntroUiVisible ? 0 : -1}
              onClick={onClearFeedback}
              className="text-[#FF0055] hover:text-white text-xs min-w-[36px] min-h-[36px] px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Welcome Content — Mounted in final layout positions from 0.000s for ZERO vertical layout shift on 5.000s fade-in */}
      <main
        data-testid="welcome-foreground-ui"
        aria-hidden={!isIntroUiVisible}
        className={`relative z-10 flex-1 flex flex-col items-center justify-start px-2 sm:px-4 pt-1 sm:pt-2 pb-4 max-w-4xl mx-auto w-full shrink-0 ${
          isIntroUiVisible ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div className="flex flex-col items-center text-center max-w-2xl w-full">
          {/* 1. Official Game Logo Hero — Gradual Coordinated Fade-In at 5.000s (Zero Y shift) */}
          <div
            data-testid="welcome-intro-logo"
            className={`flex justify-center items-center p-0 m-0 transition-opacity duration-[1500ms] ease-out delay-0 ${
              isIntroUiVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <GameLogo />
          </div>

          {/* 2. Slogan Banner Image (/slogan.png) — Gradual Coordinated Fade-In at 5.000s (Zero Y shift) */}
          <h1
            data-testid="welcome-intro-slogan"
            className={`inline-flex items-center justify-center p-0 m-0 leading-none transition-opacity duration-[1500ms] ease-out delay-200 ${
              isIntroUiVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <img
              src="/slogan.png"
              alt={t('Chiến trường huyền thoại', 'Legendary Tank Battlefield')}
              data-testid="welcome-slogan-image"
              className="block w-auto max-w-[280px] sm:max-w-[380px] h-auto object-contain p-0 m-0 drop-shadow-lg select-none pointer-events-none"
              draggable={false}
            />
          </h1>

          {/* Active System Maintenance Notice */}
          {isMaintenanceActive && (
            <div
              data-testid="welcome-maintenance-banner"
              className={`w-full max-w-md mt-2.5 mb-2 p-3.5 neo-bevel-card neo-bevel-amber text-[#EAF4FF] text-xs sm:text-sm flex flex-col items-center gap-2 shadow-xl transition-opacity duration-[1500ms] ease-out delay-300 ${
                isIntroUiVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold text-[#FFB800] uppercase tracking-wider font-btn">
                <Wrench className="w-4 h-4 text-[#FFB800] animate-spin shrink-0" />
                <span>{t('HỆ THỐNG ĐANG BẢO TRÌ', 'SYSTEM UNDER MAINTENANCE')}</span>
              </div>
              <p className="text-center text-[#EAF4FF] leading-relaxed font-medium whitespace-pre-line">
                {formatSentenceLineBreaks(maintenanceNoticeText)}
              </p>
              <div className="pt-1 border-t border-[#FFB800]/30 w-full flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-[#FFB800]/80">
                  {t(
                    'Quản trị viên (Admin) vẫn có thể đăng nhập để kết thúc bảo trì:',
                    'Administrators can still sign in to end maintenance:'
                  )}
                </span>
                <button
                  type="button"
                  tabIndex={isIntroUiVisible ? 0 : -1}
                  data-testid="welcome-admin-maintenance-signin-btn"
                  onClick={isIntroUiVisible ? onSignIn : undefined}
                  disabled={isProcessing || !isIntroUiVisible}
                  className="px-3 py-1.5 min-h-[40px] bg-[#FFB800]/20 hover:bg-[#FFB800]/30 border border-[#FFB800]/60 text-[#FFB800] text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer font-btn"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>{t('Đăng nhập (Admin)', 'Admin Sign In')}</span>
                </button>
              </div>
            </div>
          )}

          {/* 3 & 4. Login Button(s) & Play Trial Button(s) — Gradual Coordinated Fade-In at 5.000s (Zero Y shift) */}
          <div
            data-testid="welcome-intro-actions"
            className={`w-full max-w-[290px] sm:max-w-[320px] flex flex-col items-center gap-3 px-2 mt-3 mb-4 transition-opacity duration-[1500ms] ease-out delay-[350ms] ${
              isIntroUiVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <button
              type="button"
              tabIndex={isIntroUiVisible ? 0 : -1}
              data-testid="welcome-google-signin-btn"
              onClick={isIntroUiVisible && !isMaintenanceActive ? onSignIn : undefined}
              disabled={!isIntroUiVisible || isProcessing || isMaintenanceActive}
              className={`w-full min-h-[50px] py-3 px-4 neo-clip-corner welcome-google-gradient-btn bg-[#FFB800] active:translate-y-[1px] text-white font-btn font-extrabold text-sm sm:text-base whitespace-nowrap shadow-[0_0_22px_rgba(255,94,0,0.55)] hover:shadow-[0_0_28px_rgba(255,0,85,0.75)] transition-all duration-200 flex items-center justify-center gap-2.5 border-2 border-[#EAF4FF]/90 touch-manipulation ${
                isMaintenanceActive
                  ? 'opacity-35 grayscale pointer-events-none cursor-not-allowed'
                  : 'disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
              ) : (
                /* Google Official "G" Multi-color SVG on crisp white badge */
                <span className="w-5 h-5 rounded-full bg-white ring-1 ring-[#050510]/30 flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l2.85 2.22c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </span>
              )}
              <span
                data-testid="welcome-signin-gradient-text"
                className="tracking-wider uppercase font-black drop-shadow-[0_1px_2px_rgba(5,5,16,0.9)]"
              >
                {isProcessing
                  ? t('ĐANG KẾT NỐI...', 'CONNECTING...')
                  : t('ĐĂNG NHẬP', 'SIGN IN')}
              </span>
            </button>

            {onStartTrialMode && (
              <button
                type="button"
                tabIndex={isIntroUiVisible ? 0 : -1}
                data-testid="welcome-trial-play-btn"
                onClick={isIntroUiVisible && !isMaintenanceActive ? onStartTrialMode : undefined}
                disabled={!isIntroUiVisible || isProcessing || isMaintenanceActive}
                className={`w-full min-h-[50px] py-3 px-4 neo-clip-corner bg-[#0b0d1e]/95 hover:bg-[#10142b] active:translate-y-[1px] text-[#00F0FF] hover:text-[#FFB800] font-btn font-extrabold text-sm sm:text-base whitespace-nowrap border-2 border-[#00F0FF]/70 hover:border-[#FFB800] transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(0,240,255,0.2)] touch-manipulation ${
                  isMaintenanceActive
                    ? 'opacity-35 grayscale pointer-events-none cursor-not-allowed'
                    : 'cursor-pointer disabled:opacity-50'
                }`}
              >
                <Gamepad2 className="w-4 h-4 text-[#FFB800] shrink-0" />
                <span className="tracking-wider uppercase font-black">
                  {t('CHƠI THỬ', 'TRIAL PLAY')}
                </span>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Video loading indicator (only visible after 5.000s if still buffering so 0.000s-4.999s stays strictly video-only) */}
      {isIntroUiVisible &&
        homeVideoConfig?.isEnabled &&
        !homeVideoError &&
        (isHomeVideoLoading || (Boolean(homeVideoUrl) && isVideoBuffering)) && (
          <div
            data-testid="home-video-loading-banner"
            role="status"
            aria-live="polite"
            className="relative z-10 w-full border-t border-[#FFB800]/30 bg-[#050510]/92 px-4 py-2 text-xs text-[#FFB800] flex items-center justify-center gap-2 shrink-0"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FFB800] shrink-0" />
            <span>{t('Đang tải Video intro...', 'Loading intro video...')}</span>
          </div>
        )}

      {/* Footer — Gradual fade-in cleanly at 5.000s at final layout position */}
      <footer
        aria-hidden={!isIntroUiVisible}
        className={`relative z-10 w-full border-t border-[#687386]/30 bg-[#050510]/85 px-4 py-3 text-center text-xs text-[#687386] shrink-0 transition-opacity duration-[1400ms] ease-out delay-[350ms] ${
          isIntroUiVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3 flex-wrap">
          <span className="text-[#EAF4FF]/80">© 2026 Bắn Tank Online</span>
        </div>
      </footer>
    </div>
  );
};
