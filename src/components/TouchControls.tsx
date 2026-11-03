/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair, Pause } from 'lucide-react';
import type { InputState } from '../core/types.ts';

interface TouchControlsProps {
  onInputChange: (input: Partial<InputState>) => void;
  onPauseClick: () => void;
  isPaused: boolean;
}

type ActiveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

export const TouchControls: React.FC<TouchControlsProps> = ({
  onInputChange,
  onPauseClick,
  isPaused,
}) => {
  const [activeDirection, setActiveDirection] = useState<ActiveDirection>(null);
  const [isShooting, setIsShooting] = useState<boolean>(false);

  // References to preserve state across multi-touch callbacks
  const activeDirRef = useRef<ActiveDirection>(null);
  const isShootingRef = useRef<boolean>(false);

  // When paused, immediately release all inputs
  useEffect(() => {
    if (isPaused) {
      activeDirRef.current = null;
      isShootingRef.current = false;
      setActiveDirection(null);
      setIsShooting(false);
      onInputChange({ up: false, down: false, left: false, right: false, shoot: false });
    }
  }, [isPaused, onInputChange]);

  const updateDirection = useCallback(
    (dir: ActiveDirection) => {
      activeDirRef.current = dir;
      setActiveDirection(dir);
      // Strictly prevent diagonal movement: exactly one direction or none
      onInputChange({
        up: dir === 'UP',
        down: dir === 'DOWN',
        left: dir === 'LEFT',
        right: dir === 'RIGHT',
      });
    },
    [onInputChange]
  );

  const updateShooting = useCallback(
    (shooting: boolean) => {
      isShootingRef.current = shooting;
      setIsShooting(shooting);
      // Releasing or pressing shooting NEVER affects active movement direction
      onInputChange({
        shoot: shooting,
      });
    },
    [onInputChange]
  );

  return (
    <div className="w-full flex items-center justify-between select-none touch-none py-2 px-3 bg-neutral-950/80 rounded-xl border border-neutral-800">
      {/* Left: 4-Way Virtual D-Pad (Zero Diagonal, 48px Ergonomic Touch Targets) */}
      <div className="relative w-36 h-36 flex items-center justify-center">
        {/* D-Pad Cross Background */}
        <div className="absolute w-12 h-36 bg-neutral-900 rounded-xl border border-neutral-800 pointer-events-none" />
        <div className="absolute w-36 h-12 bg-neutral-900 rounded-xl border border-neutral-800 pointer-events-none" />

        {/* Center Pivot Indicator */}
        <div className="absolute w-9 h-9 rounded-full bg-neutral-800 border border-neutral-700 pointer-events-none z-10 flex items-center justify-center shadow-inner">
          <div className="w-3 h-3 rounded-full bg-amber-500/90 shadow-sm" />
        </div>

        {/* UP Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateDirection('UP');
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'UP') updateDirection(null);
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'UP') updateDirection(null);
          }}
          className={`absolute top-0 w-12 h-12 rounded-t-xl flex items-center justify-center z-20 transition-all ${
            activeDirection === 'UP'
              ? 'bg-amber-500 text-black shadow-lg scale-95'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-amber-500 active:text-black'
          }`}
          aria-label="Di chuyển Lên"
        >
          <ArrowUp className="w-5 h-5 stroke-[3]" />
        </button>

        {/* DOWN Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateDirection('DOWN');
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'DOWN') updateDirection(null);
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'DOWN') updateDirection(null);
          }}
          className={`absolute bottom-0 w-12 h-12 rounded-b-xl flex items-center justify-center z-20 transition-all ${
            activeDirection === 'DOWN'
              ? 'bg-amber-500 text-black shadow-lg scale-95'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-amber-500 active:text-black'
          }`}
          aria-label="Di chuyển Xuống"
        >
          <ArrowDown className="w-5 h-5 stroke-[3]" />
        </button>

        {/* LEFT Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateDirection('LEFT');
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'LEFT') updateDirection(null);
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'LEFT') updateDirection(null);
          }}
          className={`absolute left-0 w-12 h-12 rounded-l-xl flex items-center justify-center z-20 transition-all ${
            activeDirection === 'LEFT'
              ? 'bg-amber-500 text-black shadow-lg scale-95'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-amber-500 active:text-black'
          }`}
          aria-label="Di chuyển Trái"
        >
          <ArrowLeft className="w-5 h-5 stroke-[3]" />
        </button>

        {/* RIGHT Button */}
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateDirection('RIGHT');
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'RIGHT') updateDirection(null);
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            if (activeDirRef.current === 'RIGHT') updateDirection(null);
          }}
          className={`absolute right-0 w-12 h-12 rounded-r-xl flex items-center justify-center z-20 transition-all ${
            activeDirection === 'RIGHT'
              ? 'bg-amber-500 text-black shadow-lg scale-95'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 active:bg-amber-500 active:text-black'
          }`}
          aria-label="Di chuyển Phải"
        >
          <ArrowRight className="w-5 h-5 stroke-[3]" />
        </button>
      </div>

      {/* Center: Pause Button */}
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onPauseClick}
          className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 flex items-center justify-center transition-transform active:scale-90 shadow"
          aria-label="Tạm dừng"
        >
          <Pause className="w-5 h-5 fill-neutral-300" />
        </button>
        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
          PAUSE (P)
        </span>
      </div>

      {/* Right: Shoot Action Button (20x20 = 80px touch target) */}
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
            updateShooting(true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            updateShooting(false);
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
            updateShooting(false);
          }}
          className={`w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 transition-all shadow-xl active:scale-95 ${
            isShooting
              ? 'bg-red-500 text-white shadow-red-500/40 scale-95 border-2 border-red-300'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 border-2 border-red-400'
          }`}
          aria-label="Bắn đạn"
        >
          <Crosshair className="w-7 h-7" />
          <span className="text-[10px] font-black tracking-widest uppercase">BẮN</span>
        </button>
        <span className="text-[10px] text-neutral-500 font-mono">SPACE / J</span>
      </div>
    </div>
  );
};
