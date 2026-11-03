/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, RotateCcw, LogOut, AlertTriangle } from 'lucide-react';

interface PauseModalProps {
  isOpen: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  onResume,
  onRestart,
  onQuitToMenu,
}) => {
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl max-w-sm w-full p-6 shadow-2xl text-center space-y-5">
        {!showQuitConfirm ? (
          <>
            <div>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-2">
                <span className="font-mono font-black text-xl">||</span>
              </div>
              <h3 className="text-lg font-black tracking-wide text-white uppercase">
                Tạm Dừng Trận Đấu
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Toàn bộ vật lý, đạn và AI đã được đóng băng an toàn.
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={onResume}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition-all shadow-lg shadow-amber-500/20 active:scale-98"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>TIẾP TỤC</span>
              </button>

              <button
                onClick={onRestart}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-colors border border-neutral-700 active:scale-98"
              >
                <RotateCcw className="w-4 h-4" />
                <span>CHƠI LẠI MÀN NÀY</span>
              </button>

              <button
                onClick={() => setShowQuitConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-red-950/40 hover:bg-red-900/50 text-red-300 font-semibold text-xs transition-colors border border-red-800/40 active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>THOÁT VỀ MENU</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Xác nhận thoát</h4>
              <p className="text-xs text-neutral-300 mt-1">
                Bạn có chắc chắn muốn thoát trận đấu? Tiến trình hiện tại sẽ bị mất.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="flex-1 py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs transition-colors"
              >
                TIẾP TỤC CHƠI
              </button>
              <button
                onClick={() => {
                  setShowQuitConfirm(false);
                  onQuitToMenu();
                }}
                className="flex-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-colors shadow-lg shadow-red-600/30"
              >
                THOÁT VỀ MENU
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
