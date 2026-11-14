/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, Home, Skull, Trophy, Clock, ShieldAlert, Users, Loader2 } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { formatCountdownMMSS } from '../core/constants.ts';

interface GameOverModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
  isTrialMode?: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  state,
  onRestart,
  onQuitToMenu,
  onReturnToLobby,
  isReturningToLobby = false,
  returnToLobbyError = null,
  isTrialMode = false,
}) => {
  if (!isOpen || !state || !state.isGameOver || state.matchState !== 'GAME_OVER') return null;

  const isCoopOnline = state.gameMode === 'TWO_PLAYERS_ONLINE';

  const counts = state.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 };
  const totalDefeated = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
  const isNewRecord = state.score >= state.highScore && state.score > 0;
  const livesLeft = Math.max(0, state.p1State.lives);
  const livesUsed = 3 - livesLeft;
  const isTimeout = Boolean(state.isTimeoutGameOver);
  const isBaseDestroyed = Boolean(state.terrain.isBaseDestroyed);
  const causeBadgeLabel = isTimeout
    ? 'THUA DO HẾT THỜI GIAN (00:00)'
    : isBaseDestroyed
    ? 'CĂN CỨ ĐẠI BÀNG BỊ PHÁ HỦY'
    : 'HẾT MẠNG CHIẾN ĐẤU';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2 sm:px-4 select-none animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-red-900/60 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-2xl overflow-hidden">
        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-4 scrollbar-thin">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 mb-0.5">
              {isTimeout ? (
                <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : isBaseDestroyed ? (
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Skull className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-wider text-red-500 uppercase">
              GAME OVER
            </h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/90 border border-red-700/80 text-[10px] sm:text-[11px] font-mono font-bold text-red-300">
              <span>{causeBadgeLabel}</span>
            </div>

          </div>

          {/* Score & Record Display */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center space-y-1">
            <div className="text-[11px] text-neutral-400 font-medium">TỔNG XP TRẬN NÀY</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tracking-tight">
              {state.score.toLocaleString()} XP
            </div>
            <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px] sm:text-xs">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-neutral-400">Kỷ lục:</span>
              <span className="font-mono font-bold text-neutral-200">{state.highScore.toLocaleString()} XP</span>
              {isNewRecord && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-extrabold text-[10px] animate-pulse">
                  KỶ LỤC MỚI!
                </span>
              )}
            </div>
          </div>

          {/* Statistics Breakdown */}
          <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3 space-y-2 text-xs">
            <div className="font-bold text-neutral-300 pb-1 border-b border-neutral-800 flex justify-between">
              <span>THỐNG KÊ CHIẾN TÍCH</span>
              <span className="text-amber-400 font-mono">STAGE {state.currentStageId ?? 1}</span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] sm:text-xs">
              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neutral-400" />
                  Basic Tank (1 XP):
                </span>
                <span>{counts.BASIC} xe = {counts.BASIC * 1} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Fast Tank (2 XP):
                </span>
                <span>{counts.FAST} xe = {counts.FAST * 2} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Power Tank (3 XP):
                </span>
                <span>{counts.POWER} xe = {counts.POWER * 3} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Armor Tank (5 XP):
                </span>
                <span>{counts.ARMOR} xe = {counts.ARMOR * 5} XP</span>
              </div>

              <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-amber-400">
                <span>Tổng tiêu diệt:</span>
                <span>{totalDefeated} / 30 xe</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                <span>Thời gian còn lại:</span>
                <span className={isTimeout ? 'text-red-400 font-bold' : 'text-neutral-300'}>
                  {formatCountdownMMSS(state.remainingSeconds ?? 0)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                <span>Mạng đã dùng / còn lại:</span>
                <span>{livesUsed} đã dùng / {livesLeft} còn lại</span>
              </div>
            </div>
          </div>
        </div>

        {returnToLobbyError && isCoopOnline && (
          <div className="mx-4 mb-2 p-2.5 rounded-xl bg-red-950/75 border border-red-500/40 text-red-200 text-[11px] font-medium text-center">
            {returnToLobbyError}
          </div>
        )}

        {/* Sticky Action Footer: ALWAYS accessible on short landscape viewports */}
        <div className="p-3 sm:p-4 bg-neutral-950/95 border-t border-neutral-800 flex gap-2.5 shrink-0 safe-area-inset">
          {isCoopOnline && onReturnToLobby ? (
            <button
              type="button"
              data-testid="gameover-return-lobby-btn"
              disabled={isReturningToLobby}
              onClick={onReturnToLobby}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-sky-500/20 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isReturningToLobby ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <span>{isReturningToLobby ? 'ĐANG VÀO PHÒNG CHỜ...' : 'VỀ PHÒNG CHỜ'}</span>
            </button>
          ) : !isTrialMode ? (
            <button
              type="button"
              onClick={onRestart}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>CHƠI LẠI</span>
            </button>
          ) : null}

          <button
            type="button"
            data-testid={isTrialMode ? 'trial-return-login-btn' : 'gameover-quit-menu-btn'}
            disabled={isReturningToLobby}
            onClick={onQuitToMenu}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl font-bold text-xs transition-all active:scale-95 cursor-pointer ${
              isTrialMode
                ? 'bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-lg shadow-amber-500/20'
                : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>{isTrialMode ? 'Quay về màn hình đăng nhập' : 'VỀ MENU'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
