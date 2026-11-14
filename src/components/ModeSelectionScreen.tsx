/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import { CoopOnlineLobbyPanel, type CoopLobbySubView } from './CoopOnlineLobbyModal.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import { CoopOnlineManager, type CoopRoomDocument } from '../core/coopOnlineManager.ts';
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  Wrench,
  UserCheck,
  User,
  Bot,
  Globe,
  CheckCircle2,
  Flame,
  Shield,
} from 'lucide-react';

export type GameModeType = 'SOLO' | 'TWO_PLAYERS';
export type TwoPlayerOption = 'P2_AI' | 'P2_REAL';
export type SelectionCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';
export type SelectionFlowStep = 'SELECT_MODE' | 'SELECT_DIFFICULTY' | 'COOP_ONLINE_LOBBY';

export interface ModeSelectionScreenProps {
  user: {
    uid?: string;
    email: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    photoURL?: string | null;
    role?: string | null;
  };
  firebaseUser?: FirebaseUser | null;
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onBack: () => void;
  onStartMatch: (mode: GameModeType, twoPlayerOption?: TwoPlayerOption) => void;
  onStartOnlineMatch?: (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools: () => void;
  selectedMode?: GameModeType;
  onSelectedModeChange?: (mode: GameModeType) => void;
  twoPlayerOption?: TwoPlayerOption;
  onTwoPlayerOptionChange?: (opt: TwoPlayerOption) => void;
  isSuperAdmin?: boolean;
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
    <rect x="4" y="6" width="4" height="20" fill="#B45309" />
    <rect x="4" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="4" y="22" width="2" height="3" fill="#FBBF24" />
    <rect x="24" y="6" width="4" height="20" fill="#B45309" />
    <rect x="26" y="7" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="12" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="17" width="2" height="3" fill="#FBBF24" />
    <rect x="26" y="22" width="2" height="3" fill="#FBBF24" />
    <rect x="8" y="8" width="16" height="16" fill="#F59E0B" />
    <rect x="10" y="10" width="12" height="12" fill="#FBBF24" />
    <rect x="14" y="2" width="4" height="9" fill="#F59E0B" />
    <rect x="15" y="2" width="2" height="8" fill="#FDE68A" />
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
    <rect x="4" y="6" width="4" height="20" fill="#047857" />
    <rect x="4" y="7" width="2" height="3" fill="#34D399" />
    <rect x="4" y="12" width="2" height="3" fill="#34D399" />
    <rect x="4" y="17" width="2" height="3" fill="#34D399" />
    <rect x="4" y="22" width="2" height="3" fill="#34D399" />
    <rect x="24" y="6" width="4" height="20" fill="#047857" />
    <rect x="26" y="7" width="2" height="3" fill="#34D399" />
    <rect x="26" y="12" width="2" height="3" fill="#34D399" />
    <rect x="26" y="17" width="2" height="3" fill="#34D399" />
    <rect x="26" y="22" width="2" height="3" fill="#34D399" />
    <rect x="8" y="8" width="16" height="16" fill="#10B981" />
    <rect x="10" y="10" width="12" height="12" fill="#34D399" />
    <rect x="14" y="2" width="4" height="9" fill="#059669" />
    <rect x="15" y="2" width="2" height="8" fill="#A7F3D0" />
    <rect x="12" y="12" width="8" height="8" fill="#047857" />
    <rect x="14" y="14" width="4" height="4" fill="#D1FAE5" />
  </svg>
);

export const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({
  user,
  firebaseUser,
  session,
  isProcessing,
  onBack,
  onStartMatch,
  onStartOnlineMatch,
  difficulty,
  onDifficultyChange,
  onOpenSettings,
  onOpenDevTools,
  selectedMode: controlledMode,
  onSelectedModeChange,
  twoPlayerOption: controlledTwoPlayerOption,
  onTwoPlayerOptionChange,
  isSuperAdmin = false,
}) => {
  const deriveInitialCardMode = (): SelectionCardMode => {
    const activeRoom = CoopOnlineManager.getInstance().getCurrentRoom();
    if (
      activeRoom &&
      activeRoom.status !== 'FINISHED' &&
      activeRoom.status !== 'ABANDONED' &&
      activeRoom.status !== 'EXPIRED'
    ) {
      return 'COOP_ONLINE';
    }
    if (controlledMode === 'TWO_PLAYERS') {
      return controlledTwoPlayerOption === 'P2_REAL' ? 'COOP_ONLINE' : 'COOP_AI';
    }
    return 'SOLO';
  };

  const deriveInitialFlowStep = (): SelectionFlowStep => {
    const activeRoom = CoopOnlineManager.getInstance().getCurrentRoom();
    if (
      activeRoom &&
      activeRoom.status !== 'FINISHED' &&
      activeRoom.status !== 'ABANDONED' &&
      activeRoom.status !== 'EXPIRED'
    ) {
      return 'COOP_ONLINE_LOBBY';
    }
    return 'SELECT_MODE';
  };

  const [cardMode, setCardMode] = useState<SelectionCardMode>(deriveInitialCardMode);
  const [flowStep, setFlowStep] = useState<SelectionFlowStep>(deriveInitialFlowStep);
  const avatarManager = AvatarManager.getInstance();
  const effectiveUid = user.uid || firebaseUser?.uid || '';
  const [avatarError, setAvatarError] = useState(false);
  const [, setAvatarTick] = useState(0);

  useEffect(() => {
    const coopMgr = CoopOnlineManager.getInstance();
    return coopMgr.subscribe((room) => {
      if (
        room &&
        room.status === 'WAITING' &&
        flowStep !== 'COOP_ONLINE_LOBBY'
      ) {
        setCardMode('COOP_ONLINE');
        setFlowStep('COOP_ONLINE_LOBBY');
      }
    });
  }, [flowStep]);

  useEffect(() => {
    avatarManager.observeCatalog();
    if (effectiveUid) {
      avatarManager.observeUserMetadata(effectiveUid);
    }
    const unsub = avatarManager.subscribe(() => {
      setAvatarTick((t) => t + 1);
      setAvatarError(false);
    });
    return unsub;
  }, [avatarManager, effectiveUid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
    uid: effectiveUid,
    photoURL: user?.photoURL,
  });

  useEffect(() => {
    setAvatarError(false);
  }, [resolvedAvatarUrl]);

  const handleSelectCardMode = (next: SelectionCardMode) => {
    setCardMode(next);
    if (next === 'SOLO') {
      onSelectedModeChange?.('SOLO');
    } else if (next === 'COOP_AI') {
      onSelectedModeChange?.('TWO_PLAYERS');
      onTwoPlayerOptionChange?.('P2_AI');
    } else {
      onSelectedModeChange?.('TWO_PLAYERS');
      onTwoPlayerOptionChange?.('P2_REAL');
    }
  };

  const isSessionActive = session.status === 'ACTIVE';
  const displayLabel = getUserDisplayLabel(user);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  const handleConfirmCardMode = (next: SelectionCardMode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleSelectCardMode(next);
    if (next === 'COOP_ONLINE') {
      // M7.3.7 Mục VI.5.1: Khi chọn 3. CO-OP ONLINE, mở trực tiếp màn hình Tạo phòng / Tham gia phòng
      setFlowStep('COOP_ONLINE_LOBBY');
    } else {
      setFlowStep('SELECT_DIFFICULTY');
    }
  };

  const handleConfirmDifficulty = (nextDiff: 'DEFAULT' | 'EXTREME', e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDifficultyChange(nextDiff);
    if (!isSessionActive || isProcessing) return;
    if (cardMode === 'SOLO') {
      onStartMatch('SOLO', 'P2_AI');
    } else if (cardMode === 'COOP_AI') {
      onStartMatch('TWO_PLAYERS', 'P2_AI');
    } else if (cardMode === 'COOP_ONLINE') {
      setFlowStep('COOP_ONLINE_LOBBY');
    }
  };

  const [onlineLobbySubView, setOnlineLobbySubView] = useState<CoopLobbySubView>('MAIN');

  const handleOnlineMatchStartedProp = useCallback(
    (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => {
      onStartOnlineMatch?.(room, role);
    },
    [onStartOnlineMatch]
  );

  const handleTopBack = () => {
    if (flowStep === 'COOP_ONLINE_LOBBY') {
      if (onlineLobbySubView !== 'MAIN') {
        setOnlineLobbySubView('MAIN');
      } else {
        setFlowStep('SELECT_MODE');
      }
    } else if (flowStep === 'SELECT_DIFFICULTY') {
      setFlowStep('SELECT_MODE');
    } else {
      onBack();
    }
  };

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neutral-950 text-neutral-100 select-none overflow-x-hidden overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.18),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

      {/* Top Header Bar — M7.3.10: Sticky Top Menu with Safe Area, Quick Audio Mute/Unmute, and mobile overflow protection */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-md px-2.5 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 shrink-0 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
          {/* Left: Back Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTopBack}
              className="px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition-all active:scale-95 shadow flex items-center gap-1.5 cursor-pointer text-xs font-bold"
              title="Quay lại"
            >
              <ArrowLeft className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Quay lại</span>
            </button>
          </div>

          {/* Right: User Profile (Avatar + Display Name with Role Border Color), Quick Audio Toggle & Unified Cài đặt */}
          <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <div
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 rounded-lg bg-neutral-800/80 text-xs min-w-0 ${roleFrameClasses}`}
            >
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
              <span className="font-bold text-amber-300 truncate max-w-[95px] xs:max-w-[125px] sm:max-w-[180px]">
                {displayLabel}
              </span>
              {badgeInfo.label && (
                <span className={`hidden xs:inline-block text-[10px] px-1.5 py-0.2 rounded border font-medium shrink-0 ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>

            {/* M7.3.10 Section 3: Quick Audio Mute/Unmute Button */}
            <QuickAudioToggleButton />

            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold transition-all shadow cursor-pointer shrink-0"
              title="Cài đặt Tài khoản & Media"
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Cài đặt</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={onOpenDevTools}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold shadow cursor-pointer shrink-0"
                title="Bảng Kiểm thử & QA (Admin)"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">QA</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area - Top Aligned */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-3 sm:px-4 pt-4 sm:pt-6 pb-8 max-w-5xl mx-auto w-full">
        <div className="w-full max-w-4xl flex flex-col items-center text-center">
          {/* ===================================================================
              STEP 1: CHỌN CHẾ ĐỘ CHƠI (SOLO / CO-OP AI / CO-OP ONLINE)
             =================================================================== */}
          {flowStep === 'SELECT_MODE' && (
            <>
              <div className="mb-6 flex flex-col items-center">
                <h1 className="text-[clamp(1.35rem,5.5vw,2.5rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wide sm:tracking-wider font-mono drop-shadow-lg uppercase">
                  CHỌN CHẾ ĐỘ CHƠI
                </h1>
              </div>

              {/* 3 Mode Cards */}
              <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* 1. SOLO */}
                <div
                  onClick={() => handleSelectCardMode('SOLO')}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                    cardMode === 'SOLO'
                      ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30 shadow-2xl shadow-amber-500/20'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 opacity-90'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        <User className="w-3 h-3 text-amber-400" />
                        <span>P1</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'SOLO'
                            ? 'border-amber-400 bg-amber-500'
                            : 'border-neutral-600 bg-neutral-800'
                        }`}
                      >
                        {cardMode === 'SOLO' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 shrink-0">
                        <RetroTankIconP1 className="w-10 h-10" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-white font-mono tracking-wide">
                          SOLO
                        </h2>
                        <p className="text-[11px] text-amber-300 font-medium">
                          Chiến dịch 1 người chơi
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Người chơi P1 độc lập tác chiến, tiêu diệt toàn bộ quân địch và bảo vệ căn cứ Đại bàng.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      onClick={(e) => handleConfirmCardMode('SOLO', e)}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow ${
                        cardMode === 'SOLO'
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25'
                          : 'bg-neutral-800 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      <span>Xác nhận</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 2. CO-OP AI */}
                <div
                  onClick={() => handleSelectCardMode('COOP_AI')}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                    cardMode === 'COOP_AI'
                      ? 'bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30 shadow-2xl shadow-emerald-500/20'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 opacity-90'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        <Bot className="w-3 h-3 text-emerald-400" />
                        <span>P1 + ĐỒNG ĐỘI AI</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'COOP_AI'
                            ? 'border-emerald-400 bg-emerald-500'
                            : 'border-neutral-600 bg-neutral-800'
                        }`}
                      >
                        {cardMode === 'COOP_AI' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                        <RetroTankIconP1 className="w-7 h-7" />
                        <RetroTankIconP2 className="w-7 h-7" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-white font-mono tracking-wide">
                          CO-OP AI
                        </h2>
                        <p className="text-[11px] text-emerald-300 font-medium">
                          Phối hợp cùng đồng đội AI
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Người chơi P1 và đồng đội P2 (do AI điều khiển) cùng nhau tiêu diệt toàn bộ quân địch và bảo vệ căn cứ Đại bàng.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      onClick={(e) => handleConfirmCardMode('COOP_AI', e)}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow ${
                        cardMode === 'COOP_AI'
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/25'
                          : 'bg-neutral-800 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      <span>Xác nhận</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 3. CO-OP ONLINE */}
                <div
                  onClick={() => handleSelectCardMode('COOP_ONLINE')}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between ${
                    cardMode === 'COOP_ONLINE'
                      ? 'bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/30 shadow-2xl shadow-sky-500/20'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700 opacity-90'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                        <Globe className="w-3 h-3 text-sky-400" />
                        <span>2 NGƯỜI CHƠI</span>
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          cardMode === 'COOP_ONLINE'
                            ? 'border-sky-400 bg-sky-500'
                            : 'border-neutral-600 bg-neutral-800'
                        }`}
                      >
                        {cardMode === 'COOP_ONLINE' && <div className="w-2 h-2 rounded-full bg-black" />}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 shrink-0 flex items-center gap-1">
                        <RetroTankIconP1 className="w-7 h-7" />
                        <RetroTankIconP2 className="w-7 h-7" />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-white font-mono tracking-wide">
                          CO-OP ONLINE
                        </h2>
                        <p className="text-[11px] text-sky-300 font-medium">
                          2 Người chơi qua Internet
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-300 leading-relaxed">
                      Tạo phòng (có mật khẩu hoặc công khai) hoặc Tham gia phòng (Vào nhanh / Mã phòng) để phối hợp trực tuyến giữa 2 người chơi.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      onClick={(e) => handleConfirmCardMode('COOP_ONLINE', e)}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow ${
                        cardMode === 'COOP_ONLINE'
                          ? 'bg-sky-500 hover:bg-sky-400 text-black shadow-sky-500/25'
                          : 'bg-neutral-800 hover:bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      <span>Xác nhận</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================
              STEP 2: CHỌN ĐỘ KHÓ (GIẢI TRÍ / THỬ THÁCH)
             =================================================================== */}
          {flowStep === 'SELECT_DIFFICULTY' && (
            <>
              <div className="mb-6 flex flex-col items-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-700 text-xs font-mono text-amber-300 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {' '}
                    <strong>
                      {cardMode === 'SOLO'
                        ? 'SOLO (1 Người chơi)'
                        : cardMode === 'COOP_AI'
                        ? 'CO-OP AI (P1 + Đồng đội AI)'
                        : 'CO-OP ONLINE (2 Người chơi qua Internet)'}
                    </strong>
                  </span>
                </div>
                <h1 className="text-[clamp(1.35rem,5.5vw,2.5rem)] whitespace-nowrap font-black text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 tracking-wide sm:tracking-wider font-mono drop-shadow-lg uppercase">
                  CHỌN ĐỘ KHÓ CHIẾN DỊCH
                </h1>
              </div>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-left">
                {/* NORMAL / DEFAULT -> Giải trí */}
                <div
                  onClick={() => onDifficultyChange('DEFAULT')}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    difficulty === 'DEFAULT'
                      ? 'bg-amber-950/35 border-amber-500 shadow-2xl ring-2 ring-amber-500/25'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-amber-300 text-lg sm:text-xl font-mono flex items-center gap-2.5">
                        <Shield className="w-5 h-5 text-amber-400" />
                        <span>Giải trí</span>
                      </span>
                      {difficulty === 'DEFAULT' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-black font-black font-mono">
                          ĐANG CHỌN
                        </span>
                      )}
                    </div>
                    <p
                      data-testid="difficulty-note-default"
                      className="text-xs text-neutral-300 leading-relaxed mt-3"
                    >
                      Có 3 mạng chơi, thời gian trận đấu 120 giây (02:00). Nhịp độ cân bằng, phù hợp chơi thư giãn và rèn kỹ năng chiến đấu.
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      disabled={!isSessionActive || isProcessing}
                      onClick={(e) => handleConfirmDifficulty('DEFAULT', e)}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow ${
                        !isSessionActive || isProcessing
                          ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                          : difficulty === 'DEFAULT'
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/25 cursor-pointer'
                          : 'bg-neutral-800 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer'
                      }`}
                    >
                      <span>Xác nhận</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* HARD / EXTREME -> Thử thách */}
                <div
                  onClick={() => onDifficultyChange('EXTREME')}
                  className={`p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                    difficulty === 'EXTREME'
                      ? 'bg-rose-950/35 border-rose-500 shadow-2xl ring-2 ring-rose-500/25'
                      : 'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-black text-rose-300 text-lg sm:text-xl font-mono flex items-center gap-2.5">
                        <Flame className="w-5 h-5 text-rose-400" />
                        <span>Thử thách</span>
                      </span>
                      {difficulty === 'EXTREME' && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-600 text-white font-black font-mono">
                          ĐANG CHỌN
                        </span>
                      )}
                    </div>
                    <p
                      data-testid="difficulty-note-extreme"
                      className="text-xs text-neutral-300 leading-relaxed mt-3"
                    >
                      Có 3 mạng chơi, giới hạn trận đấu 60 giây (01:00). Xe địch phản ứng nhanh và dồn hỏa lực mạnh vào căn cứ, đòi hỏi phản xạ và chiến thuật cao.
                    </p>
                  </div>

                  <div className="mt-5 pt-3 border-t border-neutral-800/80">
                    <button
                      type="button"
                      disabled={!isSessionActive || isProcessing}
                      onClick={(e) => handleConfirmDifficulty('EXTREME', e)}
                      className={`w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 shadow ${
                        !isSessionActive || isProcessing
                          ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                          : difficulty === 'EXTREME'
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/25 cursor-pointer'
                          : 'bg-neutral-800 hover:bg-rose-500/20 text-rose-300 border border-rose-500/40 cursor-pointer'
                      }`}
                    >
                      <span>Xác nhận</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===================================================================
              STEP 3 (CO-OP ONLINE): TẠO PHÒNG / THAM GIA PHÒNG
             =================================================================== */}
          {flowStep === 'COOP_ONLINE_LOBBY' && (
            <div className="w-full text-left">
              <div className="mb-5 text-center">
                <h1 className="text-[clamp(1.25rem,5vw,2.2rem)] font-black text-transparent bg-clip-text bg-gradient-to-b from-sky-200 via-sky-400 to-sky-600 font-mono uppercase">
                  KẾT NỐI PHÒNG CO-OP ONLINE
                </h1>
              </div>

              <CoopOnlineLobbyPanel
                user={firebaseUser ?? (user as any)}
                difficulty={difficulty}
                onDifficultyChange={onDifficultyChange}
                subView={onlineLobbySubView}
                onSubViewChange={setOnlineLobbySubView}
                onBackToDifficulty={() => setFlowStep('SELECT_MODE')}
                onOnlineMatchStarted={handleOnlineMatchStartedProp}
              />
            </div>
          )}
        </div>
      </main>

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
