/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Wrench,
  Settings,
  Maximize,
  Minimize,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export interface WelcomeScreenProps {
  onSignIn: () => Promise<void>;
  isProcessing: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClearFeedback: () => void;
  onOpenDevTools?: () => void;
  onOpenSettings?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSignIn,
  isProcessing,
  errorMessage,
  successMessage,
  onClearFeedback,
  onOpenDevTools,
  onOpenSettings,
  isFullscreen,
  onToggleFullscreen,
}) => {
  return (
    <div className="relative min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100 select-none overflow-x-hidden">
      {/* Background Ambience: Subtle retro scanlines and radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo-bantank.png"
              alt="Huyền Thoại Tuổi Thơ Logo"
              className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow p-0 m-0 shrink-0"
              onError={(e) => {
                e.currentTarget.src = 'https://i.ibb.co/Rkf42RD9/bantank.png';
              }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white tracking-wide text-sm sm:text-base font-mono">
                  HUYỀN THOẠI TUỔI THƠ
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  M7.1.2
                </span>
              </div>
              <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline">
                https://bantank.online
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 transition-all active:scale-95 shadow"
                title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
                aria-label="Toàn màn hình"
              >
                {isFullscreen ? (
                  <Minimize className="w-4 h-4 text-amber-400" />
                ) : (
                  <Maximize className="w-4 h-4 text-amber-400" />
                )}
              </button>
            )}

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-2 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 transition-all active:scale-95 shadow"
                title="Cài đặt & Âm thanh"
                aria-label="Cài đặt"
              >
                <Settings className="w-4 h-4 text-amber-400" />
              </button>
            )}

            {onOpenDevTools && (
              <button
                type="button"
                onClick={onOpenDevTools}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-semibold transition-all active:scale-95 shadow"
                title="Bảng Kiểm thử & QA"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">QA Suite</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Notifications: Logout notice / Error alert */}
      <div className="relative z-20 max-w-xl mx-auto w-full px-4 pt-4">
        {successMessage && (
          <div className="mb-2 p-3.5 rounded-xl bg-emerald-950/90 border border-emerald-800 text-emerald-200 text-xs sm:text-sm flex items-center justify-between shadow-xl animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="font-medium">{successMessage}</span>
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
              <span className="font-medium">{errorMessage}</span>
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

      {/* Main Welcome Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-2xl">
          {/* Official Game Logo Hero */}
          <div className="flex justify-center items-center p-0 m-0 mb-3">
            <img
              src="/logo-bantank.png"
              alt="Huyền Thoại Tuổi Thơ"
              className="w-48 h-48 sm:w-60 sm:h-60 md:w-72 md:h-72 object-contain p-0 m-0 drop-shadow-2xl"
              onError={(e) => {
                e.currentTarget.src = 'https://i.ibb.co/Rkf42RD9/bantank.png';
              }}
            />
          </div>

          {/* Title: HUYỀN THOẠI TUỔI THƠ with subtle yellow lines above and below */}
          <div className="w-32 sm:w-60 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent mx-auto mb-2 sm:mb-3" />
          <h1 className="text-[clamp(1.15rem,4.8vw,2.5rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wide sm:tracking-wider font-mono drop-shadow p-0 text-center">
            HUYỀN THOẠI TUỔI THƠ
          </h1>
          <div className="w-32 sm:w-60 h-[1.5px] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent mx-auto mt-2 sm:mt-3 mb-6 sm:mb-8" />

          {/* Google Sign-in Call To Action */}
          <div className="w-full max-w-sm flex flex-col items-center gap-3 mb-8">
            <button
              type="button"
              onClick={onSignIn}
              disabled={isProcessing}
              className="w-full py-3.5 px-6 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-900 font-extrabold text-sm sm:text-base shadow-2xl shadow-white/10 hover:shadow-amber-500/20 transition-all transform active:scale-95 flex items-center justify-center gap-3 border border-neutral-200 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <div className="w-5 h-5 border-2 border-neutral-400 border-t-neutral-900 rounded-full animate-spin" />
              ) : (
                /* Google Official "G" Multi-color SVG */
                <svg className="w-5 h-5" viewBox="0 0 24 24">
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
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span className="tracking-wide">
                {isProcessing ? 'ĐANG KẾT NỐI GOOGLE...' : 'ĐĂNG NHẬP BẰNG GOOGLE'}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer Strip */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <span>Bắn Tank Online © 2026</span>
        </div>
      </footer>
    </div>
  );
};
