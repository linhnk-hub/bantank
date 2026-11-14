/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
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
} from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import { MusicManager, type HomeBackgroundVideoConfig } from '../core/musicManager.ts';

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
  const isSessionActive = session.status === 'ACTIVE';
  const avatarManager = AvatarManager.getInstance();
  const musicManager = MusicManager.getInstance();
  const [avatarError, setAvatarError] = useState(false);
  const [, setAvatarTick] = useState(0);
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
  const [isVideoBuffering, setIsVideoBuffering] = useState<boolean>(false);

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

  const displayLabel = getUserDisplayLabel(user);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);

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

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neutral-950 text-neutral-100 select-none overflow-x-hidden overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Home Background Video (.mp4 with configurable opacity & loop) */}
      {homeVideoConfig?.isEnabled && homeVideoUrl && (
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <video
            key={homeVideoUrl}
            src={homeVideoUrl}
            autoPlay
            muted
            playsInline
            loop={homeVideoConfig.loop !== false}
            style={{ opacity: homeVideoConfig.opacity }}
            className="w-full h-full object-cover"
            onLoadStart={() => setIsVideoBuffering(true)}
            onLoadedData={() => setIsVideoBuffering(false)}
            onCanPlay={() => setIsVideoBuffering(false)}
            onPlaying={() => setIsVideoBuffering(false)}
            onError={() => setIsVideoBuffering(false)}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/60 via-neutral-950/30 to-neutral-950/80" />
        </div>
      )}

      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.18),rgba(255,255,255,0))] pointer-events-none" />

      {/* Top Header Bar — M7.3.10: Sticky Top Menu with Safe Area, Quick Audio Mute/Unmute, and mobile overflow protection */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-md px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 shrink-0 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-lg bg-neutral-800/80 text-xs min-w-0 ${roleFrameClasses}`}>
              {resolvedAvatarUrl && !avatarError ? (
                <img
                  src={resolvedAvatarUrl}
                  alt={displayLabel}
                  className="w-5 h-5 rounded-full object-cover border border-amber-400/60 shrink-0"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="font-bold text-amber-300 truncate max-w-[100px] xs:max-w-[130px] sm:max-w-[190px]">
                {displayLabel}
              </span>
              {badgeInfo.label && (
                <span className={`hidden xs:inline-block text-[10px] px-1.5 py-0.2 rounded border font-medium shrink-0 ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* M7.3.10 Section 3: Quick Audio Mute/Unmute Button */}
              <QuickAudioToggleButton />

              <button
                type="button"
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow cursor-pointer"
                title="Cài đặt Tài khoản & Media"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Cài đặt</span>
              </button>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={onOpenDevTools}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow cursor-pointer"
                  title="Bảng Kiểm thử & QA (Admin)"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">QA</span>
                </button>
              )}

              <button
                type="button"
                onClick={onSignOut}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Đăng xuất khỏi tài khoản an toàn"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container - Top Aligned */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-2 sm:px-4 pt-2 sm:pt-5 pb-5 max-w-4xl mx-auto w-full">
        <div className="w-full max-w-md flex flex-col items-center text-center">
          {/* Emblem Banner — M7.3.10 Unified 200% Standard (320x320) */}
          <div className="mb-3">
            <div className="flex justify-center items-center p-0 m-0">
              <GameLogo />
            </div>
          </div>

          {/* Real Error Alert Card (Only shown if an actual failure occurred, M7.3.4 V.2) */}
          {hasRealSessionFailure && (
            <div className="w-full mb-5 p-4 rounded-xl bg-rose-950/80 border border-rose-700/80 text-rose-200 text-left flex flex-col gap-2.5 shadow-lg animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Không thể xác nhận phiên tài khoản</span>
              </div>
              <p className="text-[11px] sm:text-xs text-rose-200/90 leading-relaxed">
                {formatAccountStatusMessage(session.message, session.status)}
              </p>
              <div>
                <button
                  type="button"
                  onClick={onRetryAcquire}
                  disabled={isProcessing}
                  className="py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all flex items-center gap-2 shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'ĐANG THỬ LẠI...' : 'THỬ KẾT NỐI LẠI'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Button: "CHỌN CHẾ ĐỘ CHƠI" & Unified CÀI ĐẶT / HỖ TRỢ */}
          <div className="w-full flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={isSessionActive ? onPlay : onRetryAcquire}
              disabled={isProcessing}
              className={`w-full py-4 px-8 rounded-2xl font-black text-base sm:text-lg tracking-wider uppercase transition-all shadow-2xl flex items-center justify-center gap-3 transform active:scale-98 ${
                !isProcessing
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black shadow-amber-500/30 cursor-pointer'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
              }`}
            >
              <Play className="w-5 h-5 fill-black" />
              <span>CHỌN CHẾ ĐỘ CHƠI</span>
            </button>

            {/* M7.3.4 V.3 & V.5: Unified CÀI ĐẶT and HỖ TRỢ right below CHỌN CHẾ ĐỘ CHƠI */}
            <div className="w-full grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenSettings}
                className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-amber-500/50 text-neutral-100 font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow active:scale-95 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span>CÀI ĐẶT</span>
              </button>

              <button
                type="button"
                onClick={onOpenSupport}
                className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-sky-500/50 text-neutral-100 font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow active:scale-95 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>HƯỚNG DẪN</span>
              </button>
            </div>
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
            className="relative z-10 w-full border-t border-amber-500/25 bg-neutral-900/90 backdrop-blur-sm px-4 py-2 text-xs text-amber-200 flex items-center justify-center gap-2 shrink-0"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
            <span>
              Đang tải video intro{homeVideoConfig.fileName ? ` (${homeVideoConfig.fileName})` : ''}...
            </span>
          </div>
        )}

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
          <span>•</span>
          <a href="/landing.html" className="hover:text-amber-400 transition-colors">
            Giới thiệu
          </a>
          <span>•</span>
          <a href="/privacy.html" className="hover:text-amber-400 transition-colors">
            Chính sách quyền riêng tư
          </a>
        </div>
      </footer>
    </div>
  );
};
