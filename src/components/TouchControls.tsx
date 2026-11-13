/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair, Pause } from 'lucide-react';
import { VirtualJoystick } from './VirtualJoystick.tsx';
import type { InputState } from '../core/types.ts';
import { SessionManager } from '../core/sessionManager.ts';

export type ActiveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

export { VirtualJoystick } from './VirtualJoystick.tsx';

export interface VirtualDPadProps {
  activeDirection: ActiveDirection;
  onDirectionChange: (dir: ActiveDirection) => void;
}

export const VirtualDPad: React.FC<VirtualDPadProps> = ({ activeDirection, onDirectionChange }) => {
  const activeDirRef = useRef<ActiveDirection>(activeDirection);
  activeDirRef.current = activeDirection;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center select-none touch-none shrink-0">
      <div className="absolute w-12 h-36 bg-black border-4 border-neo-cyan pixel-corners pointer-events-none" />
      <div className="absolute w-36 h-12 bg-black border-4 border-neo-cyan pixel-corners pointer-events-none" />
      <div className="absolute w-10 h-10 bg-neo-cyan/20 border-2 border-neo-cyan pixel-corners pointer-events-none z-10 flex items-center justify-center shadow-[0_0_15px_rgba(0,240,255,0.4)]">
        <div className="w-3 h-3 bg-neo-cyan" />
      </div>

      <button type="button" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} onDirectionChange('UP'); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'UP') onDirectionChange(null); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'UP') onDirectionChange(null); }} className={`absolute top-0 w-12 h-12 flex items-center justify-center z-20 transition-all ${activeDirection === 'UP' ? 'bg-neo-cyan text-black' : 'bg-transparent text-neo-cyan active:bg-neo-cyan active:text-black'}`}><ArrowUp className="w-6 h-6" /></button>
      <button type="button" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} onDirectionChange('DOWN'); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'DOWN') onDirectionChange(null); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'DOWN') onDirectionChange(null); }} className={`absolute bottom-0 w-12 h-12 flex items-center justify-center z-20 transition-all ${activeDirection === 'DOWN' ? 'bg-neo-cyan text-black' : 'bg-transparent text-neo-cyan active:bg-neo-cyan active:text-black'}`}><ArrowDown className="w-6 h-6" /></button>
      <button type="button" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} onDirectionChange('LEFT'); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'LEFT') onDirectionChange(null); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'LEFT') onDirectionChange(null); }} className={`absolute left-0 w-12 h-12 flex items-center justify-center z-20 transition-all ${activeDirection === 'LEFT' ? 'bg-neo-cyan text-black' : 'bg-transparent text-neo-cyan active:bg-neo-cyan active:text-black'}`}><ArrowLeft className="w-6 h-6" /></button>
      <button type="button" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} onDirectionChange('RIGHT'); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'RIGHT') onDirectionChange(null); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} if (activeDirRef.current === 'RIGHT') onDirectionChange(null); }} className={`absolute right-0 w-12 h-12 flex items-center justify-center z-20 transition-all ${activeDirection === 'RIGHT' ? 'bg-neo-cyan text-black' : 'bg-transparent text-neo-cyan active:bg-neo-cyan active:text-black'}`}><ArrowRight className="w-6 h-6" /></button>
    </div>
  );
};

export interface VirtualShootButtonProps { isShooting: boolean; onShootChange: (shooting: boolean) => void; size?: number; }
export const VirtualShootButton: React.FC<VirtualShootButtonProps> = ({ isShooting, onShootChange, size = 76 }) => {
  const isCompact = size < 70; const iconSize = isCompact ? 20 : 26;
  useEffect(() => { if (!isShooting) return; SessionManager.getInstance().recordUserActivity(); const interval = setInterval(() => { SessionManager.getInstance().recordUserActivity(); }, 1000); return () => clearInterval(interval); }, [isShooting]);
  useEffect(() => { const handleGlobalPointerUp = () => { if (isShooting) { onShootChange(false); } }; window.addEventListener('pointerup', handleGlobalPointerUp); window.addEventListener('pointercancel', handleGlobalPointerUp); return () => { window.removeEventListener('pointerup', handleGlobalPointerUp); window.removeEventListener('pointercancel', handleGlobalPointerUp); }; }, [isShooting, onShootChange]);

  return (
    <div className="flex flex-col items-center gap-2 select-none touch-none shrink-0 font-display">
      <button type="button" style={{ width: `${size}px`, height: `${size}px` }} onPointerDown={(e) => { e.preventDefault(); SessionManager.getInstance().recordUserActivity(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} onShootChange(true); }} onPointerUp={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} onShootChange(false); }} onPointerCancel={(e) => { e.preventDefault(); try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {} onShootChange(false); }} className={`rounded-full flex flex-col items-center justify-center transition-all border-[6px] ${isShooting ? 'bg-neo-rose border-white scale-95 shadow-[0_0_30px_rgba(255,0,85,0.8)]' : 'bg-black border-neo-rose shadow-[0_0_15px_rgba(255,0,85,0.4)]'}`}>
        <span className="font-pixel text-2xl font-bold text-white tracking-widest">FIRE</span>
      </button>
      {!isCompact && <span className="font-pixel text-lg text-gray-500">SPACE/J</span>}
    </div>
  );
};

export interface TouchControlsProps { onInputChange: (input: Partial<InputState>) => void; onPauseClick: () => void; isPaused: boolean; controlType?: 'joystick' | 'dpad'; }
export const TouchControls: React.FC<TouchControlsProps> = ({ onInputChange, onPauseClick, isPaused, controlType = 'joystick' }) => {
  const [activeDirection, setActiveDirection] = useState<ActiveDirection>(null);
  const [isShooting, setIsShooting] = useState<boolean>(false);
  const activeDirRef = useRef<ActiveDirection>(null);
  const isShootingRef = useRef<boolean>(false);

  useEffect(() => { if (isPaused) { activeDirRef.current = null; isShootingRef.current = false; setActiveDirection(null); setIsShooting(false); onInputChange({ up: false, down: false, left: false, right: false, shoot: false }); } }, [isPaused, onInputChange]);
  useEffect(() => { const handleBlur = () => { activeDirRef.current = null; isShootingRef.current = false; setActiveDirection(null); setIsShooting(false); onInputChange({ up: false, down: false, left: false, right: false, shoot: false }); }; window.addEventListener('blur', handleBlur); return () => window.removeEventListener('blur', handleBlur); }, [onInputChange]);
  const handleDirectionChange = useCallback((dir: ActiveDirection) => { activeDirRef.current = dir; setActiveDirection(dir); onInputChange({ up: dir === 'UP', down: dir === 'DOWN', left: dir === 'LEFT', right: dir === 'RIGHT' }); }, [onInputChange]);
  const handleShootChange = useCallback((shooting: boolean) => { isShootingRef.current = shooting; setIsShooting(shooting); onInputChange({ shoot: shooting }); }, [onInputChange]);

  return (
    <div className="w-full flex items-center justify-between select-none touch-none py-4 px-6 sm:px-10 md:px-12 bg-black border-t-4 border-neo-cyan shadow-[0_-10px_20px_rgba(0,240,255,0.15)] font-display">
      <div className="flex items-center justify-start shrink-0">
        {controlType === 'joystick' ? <VirtualJoystick activeDirection={activeDirection} onDirectionChange={handleDirectionChange} size={130} knobSize={50} deadZone={14} disabled={isPaused} /> : <VirtualDPad activeDirection={activeDirection} onDirectionChange={handleDirectionChange} />}
      </div>
      <div className="flex-none flex flex-col items-center justify-center gap-2 px-4 shrink-0">
        <button type="button" onClick={onPauseClick} className="w-14 h-14 bg-black border-4 border-neo-amber flex items-center justify-center transition-transform active:scale-90 pixel-corners shadow-[0_0_15px_rgba(255,184,0,0.3)]">
          <Pause className="w-6 h-6 fill-neo-amber text-neo-amber" />
        </button>
        <span className="font-pixel text-xl text-neo-amber">PAUSE</span>
      </div>
      <div className="flex items-center justify-end shrink-0">
        <VirtualShootButton isShooting={isShooting} onShootChange={handleShootChange} size={84} />
      </div>
    </div>
  );
};
