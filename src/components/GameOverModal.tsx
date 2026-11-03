/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, Home, Skull, Trophy } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';

interface GameOverModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  state,
  onRestart,
  onQuitToMenu,
}) => {
  if (!isOpen || !state) return null;

  const counts = state.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 };
  const totalDefeated = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
  const isNewRecord = state.score >= state.highScore && state.score > 0;
  const livesLeft = Math.max(0, state.p1State.lives);
  const livesUsed = 3 - livesLeft;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 select-none animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-red-900/60 rounded-2xl max-w-md w-full max-h-[94dvh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-4 scrollbar-thin">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 mb-0.5">
              <Skull className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-wider text-red-500 uppercase">
              GAME OVER
            </h2>
            <p className="text-[11px] sm:text-xs text-neutral-400 font-mono">
              {state.gameOverReason || 'Trận chiến kết thúc!'}
            </p>
          </div>

          {/* Score & Record Display */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-center space-y-1">
            <div className="text-[11px] text-neutral-400 font-medium">TỔNG ĐIỂM TRẬN NÀY</div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tracking-tight">
              {state.score.toLocaleString()}
            </div>
            <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px] sm:text-xs">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-neutral-400">Kỷ lục High Score:</span>
              <span className="font-mono font-bold text-neutral-200">{state.highScore.toLocaleString()}</span>
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
              <span className="text-amber-400 font-mono">STAGE 1</span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] sm:text-xs">
              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-neutral-400" />
                  Xe Basic (100đ):
                </span>
                <span>{counts.BASIC} xe = {counts.BASIC * 100}đ</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  Xe Fast (200đ):
                </span>
                <span>{counts.FAST} xe = {counts.FAST * 200}đ</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  Xe Power (300đ):
                </span>
                <span>{counts.POWER} xe = {counts.POWER * 300}đ</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  Xe Armor (400đ):
                </span>
                <span>{counts.ARMOR} xe = {counts.ARMOR * 400}đ</span>
              </div>

              <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-amber-400">
                <span>Tổng tiêu diệt:</span>
                <span>{totalDefeated} / 30 xe</span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                <span>Mạng đã dùng / còn lại:</span>
                <span>{livesUsed} đã dùng / {livesLeft} còn lại</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Action Footer: ALWAYS accessible on short landscape viewports */}
        <div className="p-3 sm:p-4 bg-neutral-950/95 border-t border-neutral-800 flex gap-2.5 shrink-0 safe-area-inset">
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-all shadow-lg shadow-amber-500/20 active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>CHƠI LẠI</span>
          </button>

          <button
            type="button"
            onClick={onQuitToMenu}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-all border border-neutral-700 active:scale-95"
          >
            <Home className="w-4 h-4" />
            <span>VỀ MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
