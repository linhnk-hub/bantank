/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import { getUserDisplayLabel } from '../core/authManager.ts';
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
  HelpCircle,
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
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenProfile?: () => void;
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
  isFullscreen,
  onToggleFullscreen,
  onOpenProfile,
  isSuperAdmin = false,
}) => {
  const isSessionActive = session.status === 'ACTIVE';
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.photoURL]);

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  const displayLabel = getUserDisplayLabel(user);

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
    <div className="relative min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100 select-none overflow-x-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.18),rgba(255,255,255,0))] pointer-events-none" />

      {/* Top Header Bar — M7.3.2: Removed mini logo on Top Menu */}
      <header className="relative z-10 w-full border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-3 sm:px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-end gap-2">
          {/* Right: User Profile (Avatar + Display Name Only) & Quick Actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/80 text-xs">
              {user.photoURL && user.photoURL.trim() && !avatarError ? (
                <img
                  src={user.photoURL.trim()}
                  alt={displayLabel}
                  className="w-5 h-5 rounded-full object-cover border border-amber-400/60 shrink-0"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="font-bold text-amber-300 truncate max-w-[130px] sm:max-w-[190px]">
                {displayLabel}
              </span>
              {badgeInfo.label && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>

            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold shadow transition-all cursor-pointer active:scale-95"
                title="Cập nhật hồ sơ tài khoản (tên hiển thị, avatar)"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Cập Nhật Hồ Sơ</span>
              </button>
            )}

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
                title="Cấu hình Âm thanh & Hiển thị"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
              </button>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={onOpenDevTools}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow"
                  title="Bảng Kiểm thử & QA (Super Admin)"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">QA</span>
                </button>
              )}

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
          {/* Emblem & Stage Banner — M7.3 IV: Only STAGE 1 */}
          <div className="mb-5">
            <div className="flex justify-center mb-3 p-0 m-0">
              <img
                src="/logo-bantank.png"
                alt="Bắn Tank Online Logo"
                className="w-32 h-32 sm:w-40 sm:h-40 object-contain drop-shadow-xl p-0 m-0"
                onError={(e) => {
                  e.currentTarget.src = 'https://i.ibb.co/Rkf42RD9/bantank.png';
                }}
              />
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-wide font-mono mb-1">
              BẮN TANK ONLINE
            </h1>
            <p className="text-xs sm:text-sm text-amber-400 font-mono font-bold tracking-widest uppercase">
              STAGE 1
            </p>
          </div>

          {/* Connection Status & Warning Card (if not connected) */}
          {!isSessionActive && (
            <div className="w-full mb-5 p-4 rounded-xl bg-amber-950/70 border border-amber-700/80 text-amber-200 text-left flex flex-col gap-2.5 shadow-lg animate-fade-in">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-300">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Chưa đồng bộ kết nối máy chủ Firestore</span>
              </div>
              <p className="text-[11px] sm:text-xs text-amber-200/90 leading-relaxed">
                Hệ thống yêu cầu xác nhận kết nối tài khoản trên Cloud Firestore trước khi vào trận để bảo vệ điểm số và tiến trình người chơi.
              </p>
              <div>
                <button
                  type="button"
                  onClick={onRetryAcquire}
                  disabled={isProcessing}
                  className="py-2 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all flex items-center gap-2 shadow active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'ĐANG KẾT NỐI...' : 'KẾT NỐI MÁY CHỦ NGAY'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Primary Action Button: "CHỌN CHẾ ĐỘ CHƠI" */}
          <div className="w-full flex flex-col items-center gap-3 mb-6">
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
              <span>{isSessionActive ? 'CHỌN CHẾ ĐỘ CHƠI' : 'CẦN KẾT NỐI MÁY CHỦ ĐỂ CHƠI'}</span>
            </button>

            {/* M7.3 VII: Add CẤU HÌNH and HỖ TRỢ right below CHỌN CHẾ ĐỘ CHƠI */}
            <div className="w-full grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onOpenSettings}
                className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-amber-500/50 text-neutral-100 font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow active:scale-95 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-amber-400" />
                <span>CẤU HÌNH</span>
              </button>

              <button
                type="button"
                onClick={onOpenSupport}
                className="py-3 px-4 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 hover:border-sky-500/50 text-neutral-100 font-extrabold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow active:scale-95 cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-sky-400" />
                <span>HỖ TRỢ</span>
              </button>
            </div>
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

      {/* Footer — M7.3 VI: Only "Bắn Tank Online © 2026" */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <span>Bắn Tank Online © 2026</span>
        </div>
      </footer>
    </div>
  );
};
