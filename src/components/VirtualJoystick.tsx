/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import type { ActiveDirection } from './TouchControls.tsx';
import { SessionManager } from '../core/sessionManager.ts';

export interface VirtualJoystickProps {
  activeDirection: ActiveDirection;
  onDirectionChange: (dir: ActiveDirection) => void;
  size?: number; // Outer base diameter in px (default: 144)
  knobSize?: number; // Knob diameter in px (default: 52)
  deadZone?: number; // Dead zone radius in px (default: 14)
  disabled?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  activeDirection,
  onDirectionChange,
  size = 144,
  knobSize = 52,
  deadZone = 14,
  disabled = false,
}) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const activeDirRef = useRef<ActiveDirection>(activeDirection);
  activeDirRef.current = activeDirection;

  // Knob visual offset from center in px
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const maxRadius = (size - knobSize) / 2 + 4; // Max travel radius

  const resetJoystick = useCallback(() => {
    pointerIdRef.current = null;
    setIsDragging(false);
    setKnobPos({ x: 0, y: 0 });
    if (activeDirRef.current !== null) {
      activeDirRef.current = null;
      onDirectionChange(null);
    }
  }, [onDirectionChange]);

  // When disabled or external reset occurs
  useEffect(() => {
    if (disabled) {
      resetJoystick();
    }
  }, [disabled, resetJoystick]);

  // Safety: reset on window blur or visibility change
  useEffect(() => {
    const handleBlur = () => resetJoystick();
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [resetJoystick]);

  const processPointerCoords = useCallback(
    (clientX: number, clientY: number) => {
      if (!baseRef.current) return;
      SessionManager.getInstance().recordUserActivity();
      const rect = baseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;
      const distance = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

      // Clamp visual knob position within base boundary
      let visualX = rawDx;
      let visualY = rawDy;
      if (distance > maxRadius) {
        const factor = maxRadius / distance;
        visualX = rawDx * factor;
        visualY = rawDy * factor;
      }
      setKnobPos({ x: visualX, y: visualY });

      // Dead-zone check: below threshold, no movement
      if (distance < deadZone) {
        if (activeDirRef.current !== null) {
          activeDirRef.current = null;
          onDirectionChange(null);
        }
        return;
      }

      // Dominant Axis Calculation (Strict 4-Way, ZERO diagonal)
      const absX = Math.abs(rawDx);
      const absY = Math.abs(rawDy);
      const currentDir = activeDirRef.current;

      let newDir: ActiveDirection = null;

      // Hysteresis bias: keep current axis unless perpendicular axis is significantly greater
      // (prevents rapid jitter when dragging near 45-degree angle)
      const isCurrentlyVertical = currentDir === 'UP' || currentDir === 'DOWN';
      const isCurrentlyHorizontal = currentDir === 'LEFT' || currentDir === 'RIGHT';

      let pickVertical = absY >= absX;
      if (isCurrentlyVertical && absX < absY * 1.25) {
        pickVertical = true;
      } else if (isCurrentlyHorizontal && absY < absX * 1.25) {
        pickVertical = false;
      }

      if (pickVertical) {
        newDir = rawDy < 0 ? 'UP' : 'DOWN';
      } else {
        newDir = rawDx < 0 ? 'LEFT' : 'RIGHT';
      }

      if (newDir !== currentDir) {
        activeDirRef.current = newDir;
        onDirectionChange(newDir);
      }
    },
    [deadZone, maxRadius, onDirectionChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      pointerIdRef.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_) {}
      setIsDragging(true);
      processPointerCoords(e.clientX, e.clientY);
    },
    [disabled, processPointerCoords]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || pointerIdRef.current !== e.pointerId) return;
      e.preventDefault();
      processPointerCoords(e.clientX, e.clientY);
    },
    [isDragging, processPointerCoords]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current === e.pointerId) {
        e.preventDefault();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_) {}
        resetJoystick();
      }
    },
    [resetJoystick]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointerIdRef.current === e.pointerId) {
        e.preventDefault();
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_) {}
        resetJoystick();
      }
    },
    [resetJoystick]
  );

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`relative rounded-full select-none touch-none shrink-0 flex items-center justify-center transition-all ${
        isDragging
          ? 'bg-neutral-900 border-2 border-amber-500/80 shadow-lg shadow-amber-500/20'
          : 'bg-neutral-900/90 border-2 border-neutral-700/80 hover:border-neutral-600 shadow-md'
      }`}
      role="group"
      aria-label="Virtual Joystick 4 hướng"
    >
      {/* Outer Glow Ring & Cross Guides */}
      <div className="absolute inset-1 rounded-full border border-neutral-800/80 pointer-events-none" />
      <div className="absolute inset-4 rounded-full border border-dashed border-neutral-800/40 pointer-events-none" />

      {/* Axis cross indicators */}
      <div className="absolute w-[1px] h-full bg-neutral-800/40 pointer-events-none" />
      <div className="absolute h-[1px] w-full bg-neutral-800/40 pointer-events-none" />

      {/* Direction Hints with Active State Glow */}
      {/* UP */}
      <div
        className={`absolute top-2 transition-all pointer-events-none ${
          activeDirection === 'UP'
            ? 'text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
            : 'text-neutral-500'
        }`}
      >
        <ArrowUp className="w-4 h-4 stroke-[2.5]" />
      </div>

      {/* DOWN */}
      <div
        className={`absolute bottom-2 transition-all pointer-events-none ${
          activeDirection === 'DOWN'
            ? 'text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
            : 'text-neutral-500'
        }`}
      >
        <ArrowDown className="w-4 h-4 stroke-[2.5]" />
      </div>

      {/* LEFT */}
      <div
        className={`absolute left-2 transition-all pointer-events-none ${
          activeDirection === 'LEFT'
            ? 'text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
            : 'text-neutral-500'
        }`}
      >
        <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
      </div>

      {/* RIGHT */}
      <div
        className={`absolute right-2 transition-all pointer-events-none ${
          activeDirection === 'RIGHT'
            ? 'text-amber-400 scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]'
            : 'text-neutral-500'
        }`}
      >
        <ArrowRight className="w-4 h-4 stroke-[2.5]" />
      </div>

      {/* Center Thumbstick Knob */}
      <div
        style={{
          width: `${knobSize}px`,
          height: `${knobSize}px`,
          transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
        }}
        className={`absolute rounded-full flex items-center justify-center pointer-events-none shadow-xl border-2 ${
          isDragging
            ? 'bg-gradient-to-b from-amber-400 to-amber-600 border-amber-300 scale-95 shadow-amber-500/40'
            : 'bg-gradient-to-b from-neutral-700 to-neutral-800 border-neutral-600'
        }`}
      >
        {/* Knob Inner Grip Ring */}
        <div
          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
            isDragging
              ? 'border-amber-200 bg-amber-500/60'
              : 'border-neutral-500 bg-neutral-700/60'
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isDragging ? 'bg-black' : 'bg-amber-400/80'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
