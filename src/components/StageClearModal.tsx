/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trophy, Award, RotateCcw, Home, Clock, Heart } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { formatCountdownMMSS } from '../core/constants.ts';

interface StageClearModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onNextStageOrReplay: () => void;
  onQuitToMenu: () => void;
  isTrialMode?: boolean;
}

export const StageClearModal: React.FC<StageClearModalProps> = ({
  isOpen, state, onNextStageOrReplay, onQuitToMenu, isTrialMode = false,
}) => {
  if (!isOpen || !state) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/85 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-10 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 select-none font-display">
      <div className="bg-black border-4 border-green-500 pixel-corners max-w-lg w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-[0_0_30px_rgba(34,197,94,0.5)] overflow-hidden">
        
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 scrollbar-thin">
          <div className="text-center space-y-4 border-b-2 border-green-500 pb-6">
            <h2 className="text-5xl sm:text-7xl font-pixel tracking-widest text-green-400 uppercase drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]">
              STAGE CLEAR
            </h2>
            <div className="inline-flex items-center gap-2 px-4 py-1 border-2 border-green-500 bg-green-900/20 text-sm font-pixel font-bold text-white uppercase pixel-corners">
              <span>MISSION ACCOMPLISHED</span>
            </div>
          </div>

          <div className="bg-black border-2 border-neo-amber pixel-corners p-6 text-center space-y-2">
            <div className="text-sm text-neo-amber font-pixel text-2xl uppercase">TOTAL XP EARNED</div>
            <div className="text-4xl sm:text-5xl font-black font-pixel text-white tracking-wider drop-shadow-[0_0_10px_rgba(255,184,0,0.8)]">
              {state.score.toLocaleString()} XP
            </div>
          </div>

          <div className="bg-black border-2 border-gray-800 pixel-corners p-6 space-y-4">
            <div className="font-pixel text-2xl text-white pb-2 border-b-2 border-gray-800 flex justify-between">
              <span>COMBAT STATS</span>
              <span className="text-neo-cyan">STAGE {state.currentStageId ?? 1}</span>
            </div>
            <div className="flex justify-between items-center pt-2 text-green-400 font-pixel text-2xl">
              <span>TOTAL KILLS:</span><span>30 / 30</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-black border-t-4 border-green-500 flex flex-col sm:flex-row gap-4 shrink-0 safe-area-inset">
          {!isTrialMode && (
            <button type="button" onClick={onNextStageOrReplay} className="btn-arcade !bg-green-500 flex-1 py-4 text-2xl flex items-center justify-center gap-2">
              <RotateCcw className="w-5 h-5 fill-black" /> CONTINUE
            </button>
          )}
          <button type="button" data-testid={isTrialMode ? 'trial-return-login-btn' : 'stageclear-quit-menu-btn'} onClick={onQuitToMenu} className="btn-arcade-outline flex-1 py-4 text-2xl flex items-center justify-center gap-2 !border-gray-500 !text-gray-400 hover:!bg-gray-800 hover:!text-white">
            <Home className="w-5 h-5" /> {isTrialMode ? 'LOGIN MENU' : 'MAIN MENU'}
          </button>
        </div>

      </div>
    </div>
  );
};
