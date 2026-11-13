/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { GameCoreState } from '../core/types.ts';
import { Crosshair, ShieldAlert, Zap, Compass, RotateCcw, AlertTriangle } from 'lucide-react';

interface PlaytestHudProps {
  state: GameCoreState | null;
  onReset: () => void;
}

export const PlaytestHud: React.FC<PlaytestHudProps> = ({ state, onReset }) => {
  if (!state) return null;

  const p1 = state.p1;
  const bullet = state.bullet;
  const isBaseDestroyed = state.terrain.isBaseDestroyed;

  return (
    <div className="bg-black border-2 border-neo-amber rounded-sm pixel-corners p-4 text-xs flex flex-col gap-3 font-display">
      <div className="flex items-center justify-between border-b-2 border-neo-amber pb-2">
        <h3 className="font-pixel text-xl text-neo-amber uppercase">P1 TELEMETRY</h3>
        <button onClick={onReset} className="btn-arcade-outline px-2 py-1 text-[10px]">RESET P1</button>
      </div>

      <div className="grid grid-cols-2 gap-4 font-pixel text-lg">
        <div className="border border-gray-700 p-2 space-y-1">
          <div className="text-neo-cyan border-b border-gray-700 pb-1 mb-2">P1 TANK</div>
          <div className="flex justify-between text-gray-400"><span>POS:</span><span className="text-white">X:{Math.round(p1.x)} Y:{Math.round(p1.y)}</span></div>
          <div className="flex justify-between text-gray-400"><span>DIR:</span><span className="text-neo-cyan">{p1.direction}</span></div>
        </div>
        <div className="border border-gray-700 p-2 space-y-1">
          <div className="text-neo-rose border-b border-gray-700 pb-1 mb-2">WEAPON</div>
          <div className="flex justify-between text-gray-400"><span>STAT:</span><span className={bullet ? 'text-green-400' : 'text-gray-500'}>{bullet ? 'FIRED' : 'READY'}</span></div>
          <div className="flex justify-between text-gray-400"><span>BASE:</span><span className={isBaseDestroyed ? 'text-neo-rose' : 'text-green-400'}>{isBaseDestroyed ? 'DESTROYED' : 'SAFE'}</span></div>
        </div>
      </div>
    </div>
  );
};
