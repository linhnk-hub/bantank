/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import {
  Play,
  LogOut,
  Settings,
  Wrench,
  Maximize,
  Minimize,
  RefreshCw,
  UserCheck,
  ShieldAlert,
  Keyboard,
  Smartphone,
  Flame,
  Award,
} from 'lucide-react';

export interface MainMenuScreenProps {
  user: {
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  };
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onPlay: () => void;
  onSignOut: () => Promise<void>;
  onRetryAcquire: () => Promise<void>;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenDevTools: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  user,
  session,
  isProcessing,
  onPlay,
  onSignOut,
  onRetryAcquire,
  difficulty,
  onDifficultyChange,
  onOpenSettings,
  onOpenDevTools,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const isSessionActive = session.status === 'ACTIVE';

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  // Keyboard shortcut: Space or Enter starts the game if session is ACTIVE
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
    <div className="relative min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100 select-none overflow-x-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.18),rgba(255,255,255,0))] pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-3 sm:px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Brand */}
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
              <span className="font-extrabold text-white tracking-wide text-sm sm:text-base font-mono">
                HUYỀN THOẠI TUỔI THƠ
              </span>
              <span className="text-[10px] sm:text-xs text-neutral-400 hidden sm:inline ml-2">
                Menu Chính
              </span>
            </div>
          </div>

          {/* User Email & Session Status Badge */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/80 text-xs">
              <span className={`w-2 h-2 rounded-full ${badgeInfo.dotStyle}`} />
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-medium text-neutral-200 truncate max-w-[120px] sm:max-w-[200px]">
                {user.email}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${badgeInfo.badgeStyle}`}>
                {badgeInfo.label}
              </span>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={onToggleFullscreen}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all shadow"
                title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
              >
                {isFullscreen ? (
                  <Minimize className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Maximize className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all shadow"
                title="Cài đặt Âm thanh & Điều khiển"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={onOpenDevTools}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow"
                title="Bảng Kiểm thử & QA"
              >
                <Wrench className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">QA</span>
              </button>

              <button
                type="button"
                onClick={onSignOut}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow active:scale-95 disabled:opacity-50"
                title="Đăng xuất khỏi tài khoản an toàn"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-4xl mx-auto w-full">
        <div className="w-full max-w-xl flex flex-col items-center text-center">
          {/* Emblem & Stage Banner */}
          <div className="mb-4">
            <div className="flex justify-center mb-3 p-0 m-0">
              <img
                src="/logo-bantank.png"
                alt="Huyền Thoại Tuổi Thơ Logo"
                className="w-32 h-32 sm:w-40 sm:h-40 object-contain drop-shadow-xl p-0 m-0"
                onError={(e) => {
                  e.currentTarget.src = 'https://i.ibb.co/Rkf42RD9/bantank.png';
                }}
              />
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-wide font-mono mb-1">
              CHIẾN DỊCH SOLO
            </h1>
            <p className="text-xs sm:text-sm text-amber-400 font-mono font-bold">
              STAGE 1 • 30 Xe Địch • 1 Đại Bàng Hoàng Gia
            </p>
          </div>

          {/* Session Status & Warning Card (if NO_SESSION) */}
          {!isSessionActive && (
            <div className="w-full mb-5 p-4 rounded-xl bg-amber-950/70 border border-amber-700/80 text-amber-200 text-left flex flex-col gap-2.5 shadow-lg animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Chưa kích hoạt phiên máy chủ Firestore</span>
              </div>
              <p className="text-[11px] sm:text-xs text-amber-200/90 leading-relaxed">
                Hệ thống yêu cầu xác nhận phiên chơi duy nhất trên Cloud Firestore trước khi vào trận để bảo vệ điểm số và tiến trình tài khoản.
              </p>
              <div>
                <button
                  type="button"
                  onClick={onRetryAcquire}
                  disabled={isProcessing}
                  className="py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all flex items-center gap-2 shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'ĐANG KÍCH HOẠT...' : 'KÍCH HOẠT PHIÊN NGAY'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Difficulty Selection */}
          <div className="w-full mb-6 p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Độ khó chiến dịch:</span>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onDifficultyChange('DEFAULT')}
                className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                  difficulty === 'DEFAULT'
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700'
                }`}
              >
                Tiêu chuẩn (Default)
              </button>
              <button
                type="button"
                onClick={() => onDifficultyChange('EXTREME')}
                className={`py-1 px-3 rounded-lg text-xs font-bold transition-all ${
                  difficulty === 'EXTREME'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700'
                }`}
              >
                Cực hạn (Extreme)
              </button>
            </div>
          </div>

          {/* Primary Action Button: "CHƠI NGAY" */}
          <div className="w-full flex flex-col items-center gap-2 mb-6">
            <button
              type="button"
              onClick={isSessionActive ? onPlay : undefined}
              disabled={!isSessionActive || isProcessing}
              className={`w-full py-4 px-8 rounded-2xl font-black text-base sm:text-lg tracking-wider uppercase transition-all shadow-2xl flex items-center justify-center gap-3 transform active:scale-98 ${
                isSessionActive
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black shadow-amber-500/30 cursor-pointer'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
              }`}
            >
              <Play className={`w-5 h-5 ${isSessionActive ? 'fill-black' : 'fill-neutral-500'}`} />
              <span>{isSessionActive ? 'CHỌN CHẾ ĐỘ CHƠI' : 'CẦN KÍCH HOẠT PHIÊN ĐỂ CHƠI'}</span>
            </button>
          </div>

          {/* Controls Quick Card */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs">
              <div className="flex items-center gap-2 font-bold text-neutral-200 mb-2">
                <Keyboard className="w-4 h-4 text-amber-400" />
                <span>Bàn phím PC</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-400 font-mono">
                <li>• Di chuyển: <strong className="text-white font-sans">WASD</strong> hoặc <strong className="text-white font-sans">Mũi tên</strong></li>
                <li>• Bắn đạn: <strong className="text-white font-sans">Space</strong> hoặc <strong className="text-white font-sans">J</strong></li>
                <li>• Tạm dừng: <strong className="text-white font-sans">P</strong> hoặc <strong className="text-white font-sans">ESC</strong></li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs">
              <div className="flex items-center gap-2 font-bold text-neutral-200 mb-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Cảm ứng Mobile & Tablet</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-400 font-mono">
                <li>• Chế độ Dọc: Cụm phím ảo Joystick + Nút bắn tách biệt</li>
                <li>• Chế độ Ngang: 3 cột tiện dụng (Joystick trái, Nút bắn phải)</li>
                <li>• Đầy đủ hỗ trợ xoay màn hình tự động</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-2.5 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px]">
          <span>Phiên làm việc bảo mật bởi Firebase Authentication & Cloud Firestore</span>
          <span>Bắn Tank Online • https://bantank.online</span>
        </div>
      </footer>
    </div>
  );
};
