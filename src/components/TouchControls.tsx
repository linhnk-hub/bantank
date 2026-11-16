/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair, Pause } from 'lucide-react';
import { VirtualJoystick } from './VirtualJoystick.tsx';
import type { InputState } from '../core/types.ts';
import { SessionManager } from '../core/sessionManager.ts';
import { useLanguage } from '../core/i18n.ts';

export type ActiveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

export { VirtualJoystick } from './VirtualJoystick.tsx';

export interface VirtualDPadProps {
  activeDirection: ActiveDirection;
  onDirectionChange: (dir: ActiveDirection) => void;
}

export const VirtualDPad: React.FC<VirtualDPadProps> = ({
  activeDirection,
  onDirectionChange,
}) => {
  const activeDirRef = useRef<ActiveDirection>(activeDirection);
  activeDirRef.current = activeDirection;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center select-none touch-none shrink-0">
      {/* D-Pad Cross Background */}
      <div className="absolute w-12 h-36 bg-[#0b0d1e] rounded-lg border border-[#00F0FF]/30 pointer-events-none" />
      <div className="absolute w-36 h-12 bg-[#0b0d1e] rounded-lg border border-[#00F0FF]/30 pointer-events-none" />

      {/* Center Pivot Indicator */}
      <div className="absolute w-9 h-9 rounded-full bg-[#050510] border border-[#FFB800]/50 pointer-events-none z-10 flex items-center justify-center shadow-inner">
        <div className="w-3 h-3 rounded-full bg-[#FFB800] shadow-sm" />
      </div>

      {/* UP Button (48px standard touch target) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onDirectionChange('UP');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'UP') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'UP') onDirectionChange(null);
        }}
        className={`absolute top-0 w-12 h-12 rounded-t-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'UP'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
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
          onDirectionChange('DOWN');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'DOWN') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'DOWN') onDirectionChange(null);
        }}
        className={`absolute bottom-0 w-12 h-12 rounded-b-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'DOWN'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
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
          onDirectionChange('LEFT');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'LEFT') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'LEFT') onDirectionChange(null);
        }}
        className={`absolute left-0 w-12 h-12 rounded-l-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'LEFT'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
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
          onDirectionChange('RIGHT');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'RIGHT') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'RIGHT') onDirectionChange(null);
        }}
        className={`absolute right-0 w-12 h-12 rounded-r-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'RIGHT'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
        }`}
        aria-label="Di chuyển Phải"
      >
        <ArrowRight className="w-5 h-5 stroke-[3]" />
      </button>
    </div>
  );
};

export interface VirtualShootButtonProps {
  isShooting: boolean;
  onShootChange: (shooting: boolean) => void;
  size?: number;
}

export const VirtualShootButton: React.FC<VirtualShootButtonProps> = ({
  isShooting,
  onShootChange,
  size = 76,
}) => {
  const { t } = useLanguage();
  const isCompact = size < 70;
  const iconSize = isCompact ? 20 : 26;

  // Active continuous shoot activity recorder
  useEffect(() => {
    if (!isShooting) return;
    SessionManager.getInstance().recordUserActivity();
    const interval = setInterval(() => {
      SessionManager.getInstance().recordUserActivity();
    }, 1000);
    return () => clearInterval(interval);
  }, [isShooting]);

  // Global pointerup fallback in case pointerup fired outside captured target
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isShooting) {
        onShootChange(false);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isShooting, onShootChange]);

  return (
    <div className="flex flex-col items-center gap-1 select-none touch-none shrink-0">
      <button
        type="button"
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          SessionManager.getInstance().recordUserActivity();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onShootChange(true);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          onShootChange(false);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          onShootChange(false);
        }}
        className={`font-btn rounded-full flex flex-col items-center justify-center gap-0.5 transition-all shadow-xl active:scale-95 ${
          isShooting
            ? 'bg-[#FF0055] text-white shadow-[#FF0055]/50 scale-95 border-2 border-amber-300'
            : 'bg-[#FF0055]/90 hover:bg-[#FF0055] text-white shadow-[#FF0055]/35 border-2 border-rose-300'
        }`}
        aria-label={t('Bắn đạn', 'Fire')}
      >
        <Crosshair style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
        <span className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} font-black tracking-widest uppercase`}>
          {t('BẮN', 'FIRE')}
        </span>
      </button>
      {!isCompact && <span className="font-hud text-xs text-neutral-500">SPACE / J</span>}
    </div>
  );
};

export interface TouchControlsProps {
  onInputChange: (input: Partial<InputState>) => void;
  onPauseClick: () => void;
  isPaused: boolean;
  controlType?: 'joystick' | 'dpad';
  disablePause?: boolean;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onInputChange,
  onPauseClick,
  isPaused,
  controlType = 'joystick',
  disablePause = false,
}) => {
  const { t } = useLanguage();
  const [activeDirection, setActiveDirection] = useState<ActiveDirection>(null);
  const [isShooting, setIsShooting] = useState<boolean>(false);

  // References to preserve state across multi-touch callbacks
  const activeDirRef = useRef<ActiveDirection>(null);
  const isShootingRef = useRef<boolean>(false);

  // When paused or window blurs, immediately release all inputs
  useEffect(() => {
    if (isPaused) {
      activeDirRef.current = null;
      isShootingRef.current = false;
      setActiveDirection(null);
      setIsShooting(false);
      onInputChange({ up: false, down: false, left: false, right: false, shoot: false });
    }
  }, [isPaused, onInputChange]);

  useEffect(() => {
    const handleBlur = () => {
      activeDirRef.current = null;
      isShootingRef.current = false;
      setActiveDirection(null);
      setIsShooting(false);
      onInputChange({ up: false, down: false, left: false, right: false, shoot: false });
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [onInputChange]);

  const handleDirectionChange = useCallback(
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

  const handleShootChange = useCallback(
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
    <div className="w-full flex items-center justify-between select-none touch-none py-2 px-4 sm:px-8 md:px-10 bg-[#050510]/90 rounded-lg border border-[#00F0FF]/30 shadow-xl">
      {/* Left Column: Virtual Joystick aligned to left hand zone */}
      <div className="flex items-center justify-start shrink-0">
        {controlType === 'joystick' ? (
          <VirtualJoystick
            activeDirection={activeDirection}
            onDirectionChange={handleDirectionChange}
            size={120}
            knobSize={44}
            deadZone={14}
            disabled={isPaused}
          />
        ) : (
          <VirtualDPad
            activeDirection={activeDirection}
            onDirectionChange={handleDirectionChange}
          />
        )}
      </div>

      {/* Center Column: Pause Button Centered (hidden in Co-op Online) */}
      {!disablePause && (
        <div className="flex-none flex flex-col items-center justify-center gap-1 px-2 shrink-0">
          <button
            type="button"
            onClick={onPauseClick}
            className="w-12 h-12 rounded-full bg-[#0b0d1e] border border-[#FFB800]/45 hover:bg-neutral-800 text-[#FFB800] flex items-center justify-center transition-transform active:scale-90 shadow"
            aria-label={t('Tạm dừng', 'Pause')}
          >
            <Pause className="w-4 h-4 fill-[#FFB800]" />
          </button>
          <span className="font-btn text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
            PAUSE (P)
          </span>
        </div>
      )}

      {/* Right Column: Shoot Action Button aligned to right hand zone */}
      <div className="flex items-center justify-end shrink-0">
        <VirtualShootButton
          isShooting={isShooting}
          onShootChange={handleShootChange}
          size={76}
        />
      </div>
    </div>
  );
};
