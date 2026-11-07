/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import {
  Play,
  ArrowLeft,
  Settings,
  Wrench,
  Maximize,
  Minimize,
  UserCheck,
  ShieldAlert,
  Users,
  User,
  Bot,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
} from 'lucide-react';

export type GameModeType = 'SOLO' | 'TWO_PLAYERS';
export type TwoPlayerOption = 'P2_AI' | 'P2_REAL';

export interface ModeSelectionScreenProps {
  user: {
    email: string | null;
    displayName?: string | null;
    photoURL?: string | null;
  };
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onBack: () => void;
  onStartMatch: (mode: GameModeType, twoPlayerOption?: TwoPlayerOption) => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenDevTools: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenProfile?: () => void;
}

/**
 * Pixel-art Style Retro Tank SVG Icons (NES 1990 style)
 */
const RetroTankIconP1: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    style={{ shapeRendering: 'crispEdges' }}
  >
    {/* P1 Classic Yellow Tank */}
    {/* Left Tread */}
    <rect x="4" y="6" width="4" height="20" fill="#B45309" />
    <rect x="4" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="22" width="2" height="3" fill="#FBBF24" />
    {/* Right Tread */}
    <rect x="24" y="6" width="4" height="20" fill="#B45309" />
    <rect x="26" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="22" width="2" height="3" fill="#FBBF24" />
    {/* Hull */}
    <rect x="8" y="8" width="16" height="16" fill="#F59E0B" />
    <rect x="10" y="10" width="12" height="12" fill="#FBBF24" />
    {/* Cannon Barrel pointing UP */}
    <rect x="14" y="2" width="4" height="9" fill="#F59E0B" />
    <rect x="15" y="2" width="2" height="8" fill="#FDE68A" />
    {/* Turret Center */}
    <rect x="12" y="12" width="8" height="8" fill="#D97706" />
    <rect x="14" y="14" width="4" height="4" fill="#FEF3C7" />
  </svg>
);

const RetroTankIconP2: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg
    viewBox="0 0 32 32"
    fill="currentColor"
    className={className}
    style={{ shapeRendering: 'crispEdges' }}
  >
    {/* P2 Classic Green Tank */}
    {/* Left Tread */}
    <rect x="4" y="6" width="4" height="20" fill="#047857" />
    <rect x="4" y="7" width="2" height="3" fill="#34D399" />
    <rect x="4" y="12" width="2" height="3" fill="#34D399" />
    <rect x="4" y="17" width="2" height="3" fill="#34D399" />
    <rect x="4" y="22" width="2" height="3" fill="#34D399" />
    {/* Right Tread */}
    <rect x="24" y="6" width="4" height="20" fill="#047857" />
    <rect x="26" y="7" width="2" height="3" fill="#34D399" />
    <rect x="26" y="12" width="2" height="3" fill="#34D399" />
    <rect x="26" y="17" width="2" height="3" fill="#34D399" />
    <rect x="26" y="22" width="2" height="3" fill="#34D399" />
    {/* Hull */}
    <rect x="8" y="8" width="16" height="16" fill="#10B981" />
    <rect x="10" y="10" width="12" height="12" fill="#34D399" />
    {/* Cannon Barrel pointing UP */}
    <rect x="14" y="2" width="4" height="9" fill="#059669" />
    <rect x="15" y="2" width="2" height="8" fill="#A7F3D0" />
    {/* Turret Center */}
    <rect x="12" y="12" width="8" height="8" fill="#047857" />
    <rect x="14" y="14" width="4" height="4" fill="#D1FAE5" />
  </svg>
);

export const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({
  user,
  session,
  isProcessing,
  onBack,
  onStartMatch,
  difficulty,
  onDifficultyChange,
  onOpenSettings,
  onOpenDevTools,
  isFullscreen,
  onToggleFullscreen,
  onOpenProfile,
}) => {
  const [selectedMode, setSelectedMode] = useState<GameModeType>('SOLO');
  const [twoPlayerOption, setTwoPlayerOption] = useState<TwoPlayerOption>('P2_AI');

  const isSessionActive = session.status === 'ACTIVE';

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  // Can the player start match with current selection?
  // SOLO and 2 PLAYERS (P2 AI Ally) are both fully ready and implemented!
  const isStartAllowed =
    (selectedMode === 'SOLO' || (selectedMode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_AI')) &&
    isSessionActive &&
    !isProcessing;

  // Keyboard navigation: 1 for SOLO, 2 for 2 PLAYERS, ESC for Back, Enter/Space for Start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') {
        setSelectedMode('SOLO');
      } else if (e.key === '2') {
        setSelectedMode('TWO_PLAYERS');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      } else if (e.code === 'Enter' || e.code === 'Space') {
        if (isStartAllowed) {
          e.preventDefault();
          onStartMatch(selectedMode, twoPlayerOption);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStartAllowed, onBack, onStartMatch, selectedMode, twoPlayerOption]);

  const handleStartClick = () => {
    if (!isStartAllowed) return;
    onStartMatch(selectedMode, twoPlayerOption);
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-neutral-950 text-neutral-100 select-none overflow-x-hidden">
      {/* Background Ambience: Subtle arcade grid and radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.18),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

      {/* Top Header Bar */}
      <header className="relative z-10 w-full border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-3 sm:px-4 py-2.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          {/* Left: Back Button & Brand */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all active:scale-95 shadow flex items-center gap-1.5 cursor-pointer text-xs font-bold"
              title="Quay lại Main Menu"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Menu</span>
            </button>

            <div className="flex items-center gap-2">
              <img
                src="/logo-bantank.png"
                alt="Huyền Thoại Tuổi Thơ Logo"
                className="w-10 h-10 sm:w-12 sm:h-12 object-contain drop-shadow p-0 m-0 shrink-0"
                onError={(e) => {
                  e.currentTarget.src = 'https://i.ibb.co/Rkf42RD9/bantank.png';
                }}
              />
              <div>
                <span className="font-extrabold text-white tracking-wide text-xs sm:text-sm font-mono block">
                  HUYỀN THOẠI TUỔI THƠ
                </span>
                <span className="text-[10px] text-amber-400/90 font-mono">
                  Chọn Chế Độ Chơi
                </span>
              </div>
            </div>
          </div>

          {/* Right: User Email & Actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/80 text-xs">
              <span className={`w-2 h-2 rounded-full ${badgeInfo.dotStyle}`} />
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-medium text-neutral-200 truncate max-w-[100px] sm:max-w-[180px]">
                {user.email}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${badgeInfo.badgeStyle}`}>
                {badgeInfo.label}
              </span>
            </div>

            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold shadow transition-all cursor-pointer active:scale-95"
                title="Cập nhật hồ sơ tài khoản (tên hiển thị, avatar)"
              >
                <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Hồ Sơ</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all shadow cursor-pointer"
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
              className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all shadow cursor-pointer"
              title="Cài đặt Âm thanh & Điều khiển"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
            </button>

            <button
              type="button"
              onClick={onOpenDevTools}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold shadow cursor-pointer"
              title="Bảng Kiểm thử & QA"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline">QA</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-5xl mx-auto w-full overflow-y-auto">
        <div className="w-full max-w-3xl flex flex-col items-center text-center">
          {/* Header Title */}
          <div className="mb-6 flex flex-col items-center">
            <h1 className="text-[clamp(1.35rem,5.5vw,2.5rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wide sm:tracking-wider font-mono drop-shadow-lg uppercase">
              CHỌN CHẾ ĐỘ CHƠI
            </h1>
            <p className="text-xs sm:text-sm text-neutral-300 mt-1 max-w-md">
              Chọn chế độ chiến đấu phù hợp trước khi bước vào chiến trường khói lửa
            </p>
          </div>

          {/* Mode Selection Cards Grid */}
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Card A: SOLO – 1 NGƯỜI CHƠI */}
            <div
              onClick={() => setSelectedMode('SOLO')}
              className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                selectedMode === 'SOLO'
                  ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30 shadow-2xl shadow-amber-500/20'
                  : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 opacity-90'
              }`}
            >
              {/* Selected Radio Indicator / Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SẴN SÀNG • KHUYÊN DÙNG</span>
                </span>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedMode === 'SOLO'
                      ? 'border-amber-400 bg-amber-500'
                      : 'border-neutral-600 bg-neutral-800'
                  }`}
                >
                  {selectedMode === 'SOLO' && (
                    <div className="w-2 h-2 rounded-full bg-black" />
                  )}
                </div>
              </div>

              {/* Tank Illustration & Title */}
              <div className="flex items-start gap-4 mb-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                  <RetroTankIconP1 className="w-12 h-12" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white font-mono tracking-wide">
                    SOLO – 1 NGƯỜI CHƠI
                  </h2>
                  <p className="text-xs text-amber-300 font-medium">
                    Chiến dịch cổ điển Tank 1990 nguyên bản
                  </p>
                </div>
              </div>

              {/* Feature Specifications */}
              <ul className="space-y-1.5 text-xs text-neutral-300 font-mono border-t border-neutral-800/80 pt-3">
                <li className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>1 Người chơi P1 điều khiển xe tăng vàng</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3.5 text-center text-amber-400">•</span>
                  <span>Không có người chơi thứ hai (P2)</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3.5 text-center text-amber-400">•</span>
                  <span>Stage 1: 30 xe địch • 1 Căn cứ Hoàng Gia</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-3.5 text-center text-amber-400">•</span>
                  <span>Không bật vật phẩm hỗ trợ ở Stage 1</span>
                </li>
              </ul>
            </div>

            {/* Card B: 2 PLAYERS – 2 NGƯỜI CHƠI */}
            <div
              onClick={() => setSelectedMode('TWO_PLAYERS')}
              className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                selectedMode === 'TWO_PLAYERS'
                  ? 'bg-neutral-900 border-amber-500 ring-2 ring-amber-500/30 shadow-2xl'
                  : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 opacity-80'
              }`}
            >
              {/* Selected Radio Indicator / Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>2 LỰA CHỌN PHỤ</span>
                </span>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedMode === 'TWO_PLAYERS'
                      ? 'border-amber-400 bg-amber-500'
                      : 'border-neutral-600 bg-neutral-800'
                  }`}
                >
                  {selectedMode === 'TWO_PLAYERS' && (
                    <div className="w-2 h-2 rounded-full bg-black" />
                  )}
                </div>
              </div>

              {/* Tank Illustration & Title */}
              <div className="flex items-start gap-4 mb-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                  <RetroTankIconP1 className="w-8 h-8" />
                  <RetroTankIconP2 className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white font-mono tracking-wide">
                    2 PLAYERS – 2 NGƯỜI
                  </h2>
                  <p className="text-xs text-neutral-400 font-medium">
                    Hợp tác Co-op P1 (Vàng) & P2 (Xanh lá)
                  </p>
                </div>
              </div>

              {/* Sub-options for 2 PLAYERS */}
              <div className="border-t border-neutral-800/80 pt-3 space-y-2">
                <span className="text-[11px] font-mono font-bold text-neutral-400 block mb-1">
                  LỰA CHỌN NGƯỜI CHƠI P2:
                </span>

                {/* Sub-Option B.1: P2 là AI */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMode('TWO_PLAYERS');
                    setTwoPlayerOption('P2_AI');
                  }}
                  className={`p-2.5 rounded-xl border transition-all text-xs flex items-start gap-2.5 ${
                    selectedMode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_AI'
                      ? 'bg-emerald-950/40 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/30'
                      : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <Bot className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">B.1. P2 là AI (Đồng minh)</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700 font-mono font-bold">
                        SẴN SÀNG • KHẢ DỤNG
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-300 mt-0.5 leading-snug">
                      P1 do bạn điều khiển (Xe vàng), P2 do máy tính điều khiển (Xe xanh lá, 3 mạng). AI bảo vệ Căn cứ Đại bàng, hỗ trợ tiêu diệt địch và tuyệt đối không bắn đồng đội (Friendly-Fire Safe).
                    </p>
                  </div>
                </div>

                {/* Sub-Option B.2: P2 là người thật */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMode('TWO_PLAYERS');
                    setTwoPlayerOption('P2_REAL');
                  }}
                  className={`p-2.5 rounded-xl border transition-all text-xs flex items-start gap-2.5 ${
                    selectedMode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_REAL'
                      ? 'bg-neutral-800/90 border-amber-500/80'
                      : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <WifiOff className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">B.2. P2 là người thật (Online)</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-800 font-mono">
                        CHƯA KHẢ DỤNG
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5 leading-snug">
                      Hạ tầng Multiplayer P2P thời gian thực đang được chuẩn bị. Tuyệt đối không giả lập phòng đấu ảo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Status Notice depending on chosen mode */}
          {selectedMode === 'TWO_PLAYERS' && (
            <div
              className={`w-full mb-6 p-4 rounded-xl border text-left flex items-start gap-3 shadow-lg animate-fade-in ${
                twoPlayerOption === 'P2_AI'
                  ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-700/60 text-amber-200'
              }`}
            >
              {twoPlayerOption === 'P2_AI' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs space-y-1">
                <span
                  className={`font-bold block font-mono ${
                    twoPlayerOption === 'P2_AI' ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {twoPlayerOption === 'P2_AI'
                    ? 'CHẾ ĐỘ CO-OP 2 NGƯỜI CHƠI (P2 LÀ AI) ĐÃ SẴN SÀNG THAM CHIẾN'
                    : 'THÔNG BÁO TÍNH NĂNG CHẾ ĐỘ 2 NGƯỜI CHƠI ONLINE'}
                </span>
                <p className="leading-relaxed opacity-90">
                  {twoPlayerOption === 'P2_AI'
                    ? 'P1 (Xe vàng) và P2 (Xe xanh lá do AI điều khiển) sẽ cùng xuất kích tại hàng dưới. AI đồng minh có thuật toán nhận diện chướng ngại vật A*, ưu tiên tuần tra bảo vệ Căn cứ Đại bàng và tự động kiểm tra đường đạn để không bao giờ bắn trúng P1 hoặc Căn cứ. Khi một người chơi hy sinh hết mạng, người còn lại vẫn có thể chiến đấu để bảo vệ căn cứ!'
                    : 'Hệ thống hạ tầng Multiplayer kết nối 2 thiết bị thời gian thực chưa được thiết lập. Vui lòng chọn chế độ SOLO hoặc P2 LÀ AI để bắt đầu trận đấu ngay bây giờ.'}
                </p>
              </div>
            </div>
          )}

          {/* Difficulty Option Selection (Normal vs Hard) with Comparison */}
          <div className="w-full mb-6 p-4 rounded-2xl bg-neutral-900/90 border border-neutral-800 text-left">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-neutral-200 flex items-center gap-2 font-mono">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>CHỌN ĐỘ KHÓ CHIẾN DỊCH</span>
              </span>
              <span className="text-[11px] text-neutral-400 font-mono">
                Áp dụng cho mọi chế độ chơi
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* NORMAL / TIÊU CHUẨN */}
              <div
                onClick={() => onDifficultyChange('DEFAULT')}
                className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  difficulty === 'DEFAULT'
                    ? 'bg-amber-950/30 border-amber-500 shadow-md ring-1 ring-amber-500/20'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-black text-amber-300 text-xs sm:text-sm font-mono uppercase">
                      NORMAL (TIÊU CHUẨN)
                    </span>
                    {difficulty === 'DEFAULT' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-black font-bold font-mono">
                        ĐANG CHỌN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-snug">
                    Cân bằng theo nguyên bản NES Battle City. Tầm quan sát địch 80px, thời gian nạp đạn ~1.5s - 2.0s, tốc độ di chuyển chuẩn. Phù hợp cho giải trí cổ điển.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span>30 Xe địch Stage 1</span>
                  <span className="text-amber-400 font-semibold">Tốc độ đạn: Chuẩn</span>
                </div>
              </div>

              {/* HARD / CỰC HẠN */}
              <div
                onClick={() => onDifficultyChange('EXTREME')}
                className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  difficulty === 'EXTREME'
                    ? 'bg-rose-950/30 border-rose-500 shadow-md ring-1 ring-rose-500/20'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-black text-rose-300 text-xs sm:text-sm font-mono uppercase">
                      HARD (CỰC HẠN)
                    </span>
                    {difficulty === 'EXTREME' && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-600 text-white font-bold font-mono">
                        ĐANG CHỌN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-300 leading-snug">
                    Địch phản xạ nhạy hơn, tầm quan sát rộng dọc toàn bản đồ qua hành lang trống, tần suất bắn cao (nạp ~1.0s - 1.2s), 70% chủ động tập kích căn cứ và người chơi.
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] text-neutral-400 font-mono">
                  <span>30 Xe địch Stage 1</span>
                  <span className="text-rose-400 font-semibold">Tốc độ đạn: +15%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Action Buttons: QUAY LẠI & BẮT ĐẦU */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-1/3 py-4 px-6 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 font-bold text-sm sm:text-base border border-neutral-700 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer shadow"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>QUAY LẠI MENU</span>
            </button>

            <button
              type="button"
              onClick={handleStartClick}
              disabled={!isStartAllowed}
              className={`w-full sm:w-2/3 py-4 px-8 rounded-2xl font-black text-sm sm:text-base tracking-wider uppercase transition-all shadow-2xl flex items-center justify-center gap-3 transform active:scale-98 ${
                isStartAllowed
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-black shadow-amber-500/30 cursor-pointer'
                  : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
              }`}
            >
              <Play className={`w-5 h-5 ${isStartAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
              <span>
                {selectedMode === 'SOLO'
                  ? isSessionActive
                    ? `BẮT ĐẦU TRẬN ĐẤU (SOLO - ${difficulty === 'EXTREME' ? 'HARD' : 'NORMAL'})`
                    : 'CẦN KÍCH HOẠT PHIÊN ĐỂ VÀO TRẬN'
                  : twoPlayerOption === 'P2_AI'
                  ? isSessionActive
                    ? `BẮT ĐẦU CO-OP (P1 + P2 AI - ${difficulty === 'EXTREME' ? 'HARD' : 'NORMAL'})`
                    : 'CẦN KÍCH HOẠT PHIÊN ĐỂ VÀO TRẬN'
                  : 'CHẾ ĐỘ MULTIPLAYER CHƯA KHẢ DỤNG'}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800/80 bg-neutral-950/80 px-4 py-2 text-center text-[10px] text-neutral-400 font-mono">
        BẮN TANK ONLINE • HUYỀN THOẠI TUỔI THƠ • CHẾ ĐỘ CHƠI THEO QUY CHUẨN NES BATTLE CITY 1990
      </footer>
    </div>
  );
};
