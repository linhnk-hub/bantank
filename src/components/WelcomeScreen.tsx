/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Gamepad2, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { MusicManager, type HomeBackgroundVideoConfig } from '../core/musicManager.ts';
import {
  MaintenanceManager,
  buildMaintenanceNoticeMessage,
  type SystemMaintenanceConfigDocument,
} from '../core/maintenanceManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';

export interface WelcomeScreenProps {
  onSignIn: () => Promise<void>;
  onStartTrialMode?: () => void;
  isProcessing: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClearFeedback: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSignIn,
  onStartTrialMode,
  isProcessing,
  errorMessage,
  successMessage,
  onClearFeedback,
}) => {
  const musicManager = MusicManager.getInstance();
  const maintenanceMgr = MaintenanceManager.getInstance();
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
    Boolean(musicManager.getHomeVideoUrl())
  );

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
        if (nextUrl && nextUrl !== prevUrl) {
          setIsVideoBuffering(true);
        } else if (!nextUrl) {
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

  const isMaintenanceActive = Boolean(maintenanceConfig.isActive);
  const maintenanceNoticeText =
    maintenanceConfig.message ||
    buildMaintenanceNoticeMessage(maintenanceConfig.startAtMs, maintenanceConfig.endAtMs);

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neutral-950 text-neutral-100 select-none overflow-x-hidden overflow-y-auto pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.25rem,env(safe-area-inset-bottom))]">
      {/* Intro Background Video (preloaded immediately on page load, blurred & looped automatically) */}
      {homeVideoConfig?.isEnabled && homeVideoUrl && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <video
            ref={videoRef}
            key={homeVideoUrl}
            src={homeVideoUrl}
            autoPlay
            muted
            playsInline
            preload="auto"
            loop={homeVideoConfig.loop !== false}
            style={{ opacity: homeVideoConfig.opacity }}
            className="w-full h-full object-cover blur-[3px] scale-105"
            onLoadStart={() => setIsVideoBuffering(true)}
            onLoadedData={() => {
              setIsVideoBuffering(false);
              tryPlayIntroVideo();
            }}
            onCanPlay={() => {
              setIsVideoBuffering(false);
              tryPlayIntroVideo();
            }}
            onPlaying={() => setIsVideoBuffering(false)}
            onError={() => setIsVideoBuffering(false)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-neutral-950/30 to-neutral-950/80" />
        </div>
      )}

      {/* Background Ambience: Subtle retro scanlines and radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

      {/* Notifications: Logout notice / Error alert */}
      <div className="relative z-20 max-w-xl mx-auto w-full px-3 sm:px-4 pt-1 sm:pt-3">
        {successMessage && (
          <div className="mb-2 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-800 text-emerald-200 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="font-medium whitespace-pre-line">
                {formatSentenceLineBreaks(successMessage)}
              </span>
            </div>
            <button
              onClick={onClearFeedback}
              className="text-emerald-400 hover:text-white text-xs px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-2 p-3.5 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="font-medium whitespace-pre-line">
                {formatSentenceLineBreaks(errorMessage)}
              </span>
            </div>
            <button
              onClick={onClearFeedback}
              className="text-rose-400 hover:text-white text-xs px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Main Welcome Content (M7.3.4 V.1: Clean welcome screen without Top Menu, Top Aligned) */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-2 sm:px-4 pt-1 sm:pt-3 pb-4 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-2xl w-full">
          {/* Official Game Logo Hero — M7.3.10 Unified 200% Standard (320x320) */}
          <div className="flex justify-center items-center p-0 m-0 mb-2">
            <GameLogo />
          </div>

          {/* Title: Chiến trường huyền thoại with subtle yellow lines above and below */}
          <div className="w-32 sm:w-60 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent mx-auto mb-1.5 sm:mb-2.5" />
          <h1 className="text-[clamp(1.1rem,4.5vw,2.35rem)] whitespace-nowrap font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wide sm:tracking-wider font-mono drop-shadow p-0 text-center">
            Chiến trường huyền thoại
          </h1>
          <div className="w-32 sm:w-60 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent mx-auto mt-1.5 sm:mt-2.5 mb-4 sm:mb-6" />

          {/* Active System Maintenance Notice */}
          {isMaintenanceActive && (
            <div
              data-testid="welcome-maintenance-banner"
              className="w-full max-w-md mb-4 p-3.5 rounded-2xl bg-amber-950/90 border-2 border-amber-500/80 text-amber-100 shadow-2xl space-y-2 animate-fade-in"
            >
              <div className="flex items-center justify-center gap-2 text-amber-300 font-black text-xs sm:text-sm font-mono uppercase">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>HỆ THỐNG ĐANG BẢO TRÌ</span>
              </div>
              <p className="text-xs sm:text-sm text-amber-100 font-medium leading-relaxed">
                {maintenanceNoticeText}
              </p>
              <div className="pt-1 flex justify-center">
                <button
                  type="button"
                  data-testid="welcome-admin-maintenance-signin-btn"
                  onClick={onSignIn}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold transition-colors cursor-pointer"
                  title="Dành riêng cho Quản trị viên để kết thúc bảo trì"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span>Đăng nhập Quản trị viên</span>
                </button>
              </div>
            </div>
          )}

          {/* Google Sign-in Call To Action & Trial Mode Button (Compact width + animated gradient shift) */}
          <div className="w-full max-w-[260px] flex flex-col items-center gap-2.5 px-2 mb-4">
            <button
              type="button"
              data-testid="welcome-google-signin-btn"
              onClick={isMaintenanceActive ? undefined : onSignIn}
              disabled={isProcessing || isMaintenanceActive}
              className={`w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-orange-600 via-red-600 to-orange-500 bg-[length:200%_100%] bg-left hover:bg-right text-white font-extrabold text-xs sm:text-sm whitespace-nowrap shadow-lg shadow-orange-600/30 hover:shadow-red-600/45 transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-2 border border-orange-400/70 ${
                isMaintenanceActive
                  ? 'opacity-35 grayscale pointer-events-none cursor-not-allowed'
                  : 'disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed'
              }`}
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin shrink-0" />
              ) : (
                /* Google Official "G" Multi-color SVG on crisp white badge */
                <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
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
              <span className="tracking-wide uppercase">
                {isProcessing ? 'ĐANG KẾT NỐI...' : 'ĐĂNG NHẬP'}
              </span>
            </button>

            {onStartTrialMode && (
              <button
                type="button"
                data-testid="welcome-trial-play-btn"
                onClick={isMaintenanceActive ? undefined : onStartTrialMode}
                disabled={isProcessing || isMaintenanceActive}
                className={`w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-neutral-900 via-zinc-700 to-neutral-950 bg-[length:200%_100%] bg-left hover:bg-right text-neutral-100 hover:text-amber-300 font-extrabold text-xs sm:text-sm whitespace-nowrap border border-zinc-600/80 hover:border-amber-400/60 transition-all duration-500 transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-black/40 ${
                  isMaintenanceActive
                    ? 'opacity-35 grayscale pointer-events-none cursor-not-allowed'
                    : 'cursor-pointer disabled:opacity-50'
                }`}
              >
                <Gamepad2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="tracking-wide uppercase">CHƠI THỬ</span>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Trạng thái đang tải Video Intro (hiển thị ngay phía trên thanh footer khi chưa đăng nhập) */}
      {homeVideoConfig?.isEnabled &&
        !homeVideoError &&
        (isHomeVideoLoading || (Boolean(homeVideoUrl) && isVideoBuffering)) && (
          <div
            data-testid="home-video-loading-banner"
            role="status"
            aria-live="polite"
            className="relative z-10 w-full border-t border-amber-500/25 bg-neutral-900/90 backdrop-blur-sm px-4 py-2 text-xs text-amber-200 flex items-center justify-center gap-2 shrink-0"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
            <span>
              Đang tải Video intro
            </span>
          </div>
        )}

      {/* Footer Strip */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
          <span>•</span>
          <a href="/landing.html" className="hover:text-amber-400 transition-colors">
            Giới thiệu
          </a>
          <span>•</span>
          <a href="/privacy.html" className="hover:text-amber-400 transition-colors">
            Chính sách
          </a>
        </div>
      </footer>
    </div>
  );
};


