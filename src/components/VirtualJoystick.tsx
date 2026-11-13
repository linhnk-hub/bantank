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
  size?: number;
  knobSize?: number;
  deadZone?: number;
  disabled?: boolean;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  activeDirection, onDirectionChange, size = 144, knobSize = 52, deadZone = 14, disabled = false,
}) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const activeDirRef = useRef<ActiveDirection>(activeDirection);
  activeDirRef.current = activeDirection;

  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const maxRadius = (size - knobSize) / 2 + 4;

  const resetJoystick = useCallback(() => {
    pointerIdRef.current = null; setIsDragging(false); setKnobPos({ x: 0, y: 0 });
    if (activeDirRef.current !== null) { activeDirRef.current = null; onDirectionChange(null); }
  }, [onDirectionChange]);

  useEffect(() => { if (disabled) resetJoystick(); }, [disabled, resetJoystick]);
  useEffect(() => { const handleBlur = () => resetJoystick(); window.addEventListener('blur', handleBlur); return () => window.removeEventListener('blur', handleBlur); }, [resetJoystick]);

  const processPointerCoords = useCallback((clientX: number, clientY: number) => {
    if (!baseRef.current) return;
    SessionManager.getInstance().recordUserActivity();
    const rect = baseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2;
    const rawDx = clientX - centerX; const rawDy = clientY - centerY;
    const distance = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    let visualX = rawDx; let visualY = rawDy;
    if (distance > maxRadius) { const factor = maxRadius / distance; visualX = rawDx * factor; visualY = rawDy * factor; }
    setKnobPos({ x: visualX, y: visualY });

    if (distance < deadZone) {
      if (activeDirRef.current !== null) { activeDirRef.current = null; onDirectionChange(null); }
      return;
    }

    const absX = Math.abs(rawDx); const absY = Math.abs(rawDy);
    const currentDir = activeDirRef.current;
    let newDir: ActiveDirection = null;

    const isCurrentlyVertical = currentDir === 'UP' || currentDir === 'DOWN';
    const isCurrentlyHorizontal = currentDir === 'LEFT' || currentDir === 'RIGHT';
    let pickVertical = absY >= absX;
    if (isCurrentlyVertical && absX < absY * 1.25) pickVertical = true;
    else if (isCurrentlyHorizontal && absY < absX * 1.25) pickVertical = false;

    if (pickVertical) newDir = rawDy < 0 ? 'UP' : 'DOWN';
    else newDir = rawDx < 0 ? 'LEFT' : 'RIGHT';

    if (newDir !== currentDir) { activeDirRef.current = newDir; onDirectionChange(newDir); }
  }, [deadZone, maxRadius, onDirectionChange]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault(); pointerIdRef.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    setIsDragging(true); processPointerCoords(e.clientX, e.clientY);
  }, [disabled, processPointerCoords]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || pointerIdRef.current !== e.pointerId) return;
    e.preventDefault(); processPointerCoords(e.clientX, e.clientY);
  }, [isDragging, processPointerCoords]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current === e.pointerId) {
      e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} resetJoystick();
    }
  }, [resetJoystick]);

  return (
    <div
      ref={baseRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
      style={{ width: `${size}px`, height: `${size}px` }}
      className={`relative select-none touch-none shrink-0 flex items-center justify-center transition-all border-4 pixel-corners ${isDragging ? 'bg-black border-neo-cyan shadow-[0_0_20px_rgba(0,240,255,0.4)]' : 'bg-gray-900 border-gray-700'}`}
    >
      <div className="absolute inset-2 border-2 border-dashed border-gray-800 pixel-corners pointer-events-none" />

      <div className={`absolute top-2 pointer-events-none ${activeDirection === 'UP' ? 'text-neo-cyan scale-125 drop-shadow-[0_0_10px_rgba(0,240,255,1)]' : 'text-gray-600'}`}><ArrowUp className="w-5 h-5 stroke-[3]" /></div>
      <div className={`absolute bottom-2 pointer-events-none ${activeDirection === 'DOWN' ? 'text-neo-cyan scale-125 drop-shadow-[0_0_10px_rgba(0,240,255,1)]' : 'text-gray-600'}`}><ArrowDown className="w-5 h-5 stroke-[3]" /></div>
      <div className={`absolute left-2 pointer-events-none ${activeDirection === 'LEFT' ? 'text-neo-cyan scale-125 drop-shadow-[0_0_10px_rgba(0,240,255,1)]' : 'text-gray-600'}`}><ArrowLeft className="w-5 h-5 stroke-[3]" /></div>
      <div className={`absolute right-2 pointer-events-none ${activeDirection === 'RIGHT' ? 'text-neo-cyan scale-125 drop-shadow-[0_0_10px_rgba(0,240,255,1)]' : 'text-gray-600'}`}><ArrowRight className="w-5 h-5 stroke-[3]" /></div>

      <div
        style={{ width: `${knobSize}px`, height: `${knobSize}px`, transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`, transition: isDragging ? 'none' : 'transform 0.15s' }}
        className={`absolute flex items-center justify-center pointer-events-none border-4 pixel-corners ${isDragging ? 'bg-neo-cyan border-white shadow-[0_0_15px_rgba(0,240,255,0.6)]' : 'bg-gray-700 border-gray-500'}`}
      >
        <div className={`w-3 h-3 pixel-corners ${isDragging ? 'bg-black' : 'bg-gray-400'}`} />
      </div>
    </div>
  );
};
