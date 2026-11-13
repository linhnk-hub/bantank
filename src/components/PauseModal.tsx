/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, RotateCcw, LogOut, AlertTriangle, Settings } from 'lucide-react';

interface PauseModalProps {
  isOpen: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onOpenSettings?: () => void;
  isTrialMode?: boolean;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen, onResume, onRestart, onQuitToMenu, onOpenSettings, isTrialMode = false,
}) => {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-16 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 select-none font-display">
      <div className="bg-black border-4 border-neo-cyan pixel-corners max-w-sm w-full p-8 shadow-[0_0_30px_rgba(0,240,255,0.4)] text-center">
        {!showQuitConfirm ? (
          <>
            <div className="mb-8 border-b-2 border-neo-cyan pb-4">
              <h3 className="font-pixel text-5xl text-white uppercase glitch-text">PAUSED</h3>
              <p className="text-neo-cyan mt-2">SYSTEM STANDBY</p>
            </div>

            <div className="space-y-4">
              <button onClick={onResume} className="btn-arcade w-full py-4 text-2xl flex items-center justify-center gap-2 !bg-neo-cyan">
                <Play className="w-5 h-5 fill-black" /> RESUME
              </button>

              {onOpenSettings && !isTrialMode && (
                <button onClick={onOpenSettings} className="btn-arcade-outline w-full py-3 text-xl flex items-center justify-center gap-2">
                  <Settings className="w-5 h-5" /> SETTINGS
                </button>
              )}

              {!isTrialMode && (
                <button onClick={onRestart} className="btn-arcade-outline w-full py-3 text-xl flex items-center justify-center gap-2">
                  <RotateCcw className="w-5 h-5" /> RESTART
                </button>
              )}

              <button onClick={() => (isTrialMode ? onQuitToMenu() : setShowQuitConfirm(true))} className="btn-arcade-outline w-full py-3 text-xl flex items-center justify-center gap-2 !border-neo-rose !text-neo-rose">
                <LogOut className="w-5 h-5" /> {isTrialMode ? 'LOGIN MENU' : 'ABORT MISSION'}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <AlertTriangle className="w-12 h-12 text-neo-rose mx-auto" />
            <h4 className="font-pixel text-3xl text-white">CONFIRM ABORT?</h4>
            <p className="text-sm text-gray-400">All current progress will be lost.</p>
            <div className="flex flex-col gap-4">
              <button onClick={() => { setShowQuitConfirm(false); onQuitToMenu(); }} className="btn-arcade py-4 text-2xl !bg-neo-rose !text-white">ABORT</button>
              <button onClick={() => setShowQuitConfirm(false)} className="btn-arcade-outline py-3 text-xl !border-gray-500 !text-gray-400">CANCEL</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
