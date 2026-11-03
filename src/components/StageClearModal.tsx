/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trophy, Award, RotateCcw, Home, Clock, Heart } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';

interface StageClearModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onNextStageOrReplay: () => void;
  onQuitToMenu: () => void;
}

export const StageClearModal: React.FC<StageClearModalProps> = ({
  isOpen,
  state,
  onNextStageOrReplay,
  onQuitToMenu,
}) => {
  if (!isOpen || !state) return null;

  const counts = state.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 };
  const totalDefeated = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
  const isNewRecord = state.score >= state.highScore && state.score > 0;
  const elapsedMinutes = Math.floor(state.stageElapsedSeconds / 60);
  const elapsedSeconds = Math.floor(state.stageElapsedSeconds % 60);
  const timeFormatted = `${elapsedMinutes}m ${elapsedSeconds.toString().padStart(2, '0')}s`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-amber-500/50 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-1">
            <Trophy className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black tracking-wider text-amber-400 uppercase">
            CHIẾN THẮNG MÀN CHƠI!
          </h2>
          <p className="text-xs text-neutral-300 font-semibold">
            {state.currentStageName || 'Stage 1 - Mặt Trận Khởi Đầu'}
          </p>
        </div>

        {/* Score & Record Display */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center space-y-1">
          <div className="text-xs text-neutral-400 font-medium">TỔNG ĐIỂM TÍCH LŨY</div>
          <div className="text-3xl font-black font-mono text-amber-400 tracking-tight">
            {state.score.toLocaleString()}
          </div>
          <div className="flex items-center justify-center gap-2 pt-1 text-xs">
            <Award className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-neutral-400">High Score:</span>
            <span className="font-mono font-bold text-neutral-200">{state.highScore.toLocaleString()}</span>
            {isNewRecord && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500 text-black font-extrabold text-[10px] animate-pulse">
                KỶ LỤC MỚI!
              </span>
            )}
          </div>
        </div>

        {/* Breakdown by Enemy Tier */}
        <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-lg p-3 space-y-2 text-xs">
          <div className="font-bold text-neutral-300 pb-1 border-b border-neutral-800 flex justify-between items-center">
            <span>BẢNG TỔNG KẾT CHIẾN DỊCH</span>
            <div className="flex items-center gap-1 text-[11px] text-neutral-400 font-mono">
              <Clock className="w-3 h-3 text-neutral-400" />
              <span>{timeFormatted}</span>
            </div>
          </div>

          <div className="space-y-1.5 font-mono">
            <div className="flex items-center justify-between text-neutral-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-neutral-400"></span>
                Xe Basic (100đ):
              </span>
              <span>{counts.BASIC} xe = {counts.BASIC * 100}đ</span>
            </div>

            <div className="flex items-center justify-between text-neutral-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                Xe Fast (200đ):
              </span>
              <span>{counts.FAST} xe = {counts.FAST * 200}đ</span>
            </div>

            <div className="flex items-center justify-between text-neutral-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                Xe Power (300đ):
              </span>
              <span>{counts.POWER} xe = {counts.POWER * 300}đ</span>
            </div>

            <div className="flex items-center justify-between text-neutral-300">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Xe Armor (400đ):
              </span>
              <span>{counts.ARMOR} xe = {counts.ARMOR * 400}đ</span>
            </div>

            <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-emerald-400">
              <span>Đã tiêu diệt:</span>
              <span>{totalDefeated} / 30 xe (Toàn bộ)</span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-300 pt-0.5">
              <span className="flex items-center gap-1 text-red-400">
                <Heart className="w-3 h-3 fill-red-500" />
                Số mạng còn lại:
              </span>
              <span className="font-bold text-white">{state.p1State.lives} mạng</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onNextStageOrReplay}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors shadow-lg shadow-amber-500/20 active:scale-98"
          >
            <RotateCcw className="w-4 h-4" />
            <span>CHƠI LẠI / TIẾP TỤC</span>
          </button>

          <button
            onClick={onQuitToMenu}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-colors border border-neutral-700 active:scale-98"
          >
            <Home className="w-4 h-4" />
            <span>VỀ MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
