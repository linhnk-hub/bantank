/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, Home, Skull, Trophy, Clock, ShieldAlert } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { formatCountdownMMSS } from '../core/constants.ts';

interface GameOverModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onRestart: () => void;
  onQuitToMenu: () => void;
  isTrialMode?: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen, state, onRestart, onQuitToMenu, isTrialMode = false,
}) => {
  if (!isOpen || !state || !state.isGameOver || state.matchState !== 'GAME_OVER') return null;

  const counts = state.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 };
  const totalDefeated = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
  const isNewRecord = state.score >= state.highScore && state.score > 0;
  const livesLeft = Math.max(0, state.p1State.lives);
  const livesUsed = 3 - livesLeft;
  const isTimeout = Boolean(state.isTimeoutGameOver);
  const isBaseDestroyed = Boolean(state.terrain.isBaseDestroyed);
  const causeBadgeLabel = isTimeout ? 'TIME OVER (00:00)' : isBaseDestroyed ? 'BASE DESTROYED' : 'OUT OF LIVES';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 select-none font-display">
      <div className="bg-black border-4 border-neo-rose pixel-corners max-w-lg w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-[0_0_30px_rgba(255,0,85,0.5)] overflow-hidden">
        
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 scrollbar-thin">
          <div className="text-center space-y-4 border-b-2 border-neo-rose pb-6">
            <h2 className="text-5xl sm:text-7xl font-pixel glitch-text tracking-widest text-neo-rose uppercase">
              GAME OVER
            </h2>
            <div className="inline-flex items-center gap-2 px-4 py-1 border-2 border-neo-rose bg-neo-rose/20 text-sm font-pixel font-bold text-white uppercase pixel-corners">
              <span>{causeBadgeLabel}</span>
            </div>
            <p className="text-sm text-gray-400 font-pixel text-xl uppercase">
              {state.gameOverReason || 'MISSION FAILED'}
            </p>
          </div>

          <div className="bg-black border-2 border-neo-amber pixel-corners p-6 text-center space-y-2">
            <div className="text-sm text-neo-amber font-pixel text-2xl uppercase">TOTAL XP EARNED</div>
            <div className="text-4xl sm:text-5xl font-black font-pixel text-white tracking-wider drop-shadow-[0_0_10px_rgba(255,184,0,0.8)]">
              {state.score.toLocaleString()} XP
            </div>
            <div className="flex items-center justify-center gap-2 pt-2 text-sm">
              <Trophy className="w-5 h-5 text-neo-amber" />
              <span className="text-gray-400 font-pixel text-xl uppercase">HIGH SCORE:</span>
              <span className="font-pixel text-xl font-bold text-white">{state.highScore.toLocaleString()} XP</span>
              {isNewRecord && (
                <span className="px-2 py-1 bg-neo-amber text-black font-pixel text-lg animate-pulse pixel-corners ml-2">NEW RECORD!</span>
              )}
            </div>
          </div>

          <div className="bg-black border-2 border-gray-800 pixel-corners p-6 space-y-4">
            <div className="font-pixel text-2xl text-white pb-2 border-b-2 border-gray-800 flex justify-between">
              <span>COMBAT STATS</span>
              <span className="text-neo-cyan">STAGE {state.currentStageId ?? 1}</span>
            </div>
            <div className="space-y-2 font-pixel text-xl text-gray-300">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-gray-400 pixel-corners" /> Basic Tank:</span><span>{counts.BASIC} = {counts.BASIC * 1} XP</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-neo-cyan pixel-corners" /> Fast Tank:</span><span>{counts.FAST} = {counts.FAST * 2} XP</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-neo-rose pixel-corners" /> Power Tank:</span><span>{counts.POWER} = {counts.POWER * 3} XP</span></div>
              <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="w-3 h-3 bg-green-400 pixel-corners" /> Armor Tank:</span><span>{counts.ARMOR} = {counts.ARMOR * 5} XP</span></div>
              
              <div className="pt-3 border-t-2 border-gray-800 flex items-center justify-between font-bold text-neo-amber text-2xl">
                <span>TOTAL KILLS:</span><span>{totalDefeated} / 30</span>
              </div>
              <div className="flex items-center justify-between pt-2 text-gray-400">
                <span>TIME LEFT:</span><span className={isTimeout ? 'text-neo-rose' : 'text-white'}>{formatCountdownMMSS(state.remainingSeconds ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-400">
                <span>LIVES:</span><span>{livesUsed} USED / {livesLeft} LEFT</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 bg-black border-t-4 border-neo-rose flex flex-col sm:flex-row gap-4 shrink-0 safe-area-inset">
          {!isTrialMode && (
            <button type="button" onClick={onRestart} className="btn-arcade flex-1 py-4 text-2xl flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5" /> RESTART
            </button>
          )}
          <button type="button" data-testid={isTrialMode ? 'trial-return-login-btn' : 'gameover-quit-menu-btn'} onClick={onQuitToMenu} className="btn-arcade-outline flex-1 py-4 text-2xl flex items-center justify-center gap-2 !border-gray-500 !text-gray-400 hover:!bg-gray-800 hover:!text-white">
            <Home className="w-5 h-5" /> {isTrialMode ? 'LOGIN MENU' : 'MAIN MENU'}
          </button>
        </div>

      </div>
    </div>
  );
};
