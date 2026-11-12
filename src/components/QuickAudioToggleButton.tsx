/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { SoundManager } from '../core/audio.ts';

export interface QuickAudioToggleButtonProps {
  compact?: boolean;
  showLabelOnDesktop?: boolean;
  className?: string;
}

/**
 * M7.3.10 Section 3: Quick Audio Mute/Unmute Toggle Button on Top Menu
 * - Accessible labels: "Tắt âm thanh" (when audio is ON) and "Bật âm thanh" (when audio is OFF)
 * - Immediately mutes/restores all game audio (BGM + SFX) while preserving volume levels and Admin tracks
 */
export const QuickAudioToggleButton: React.FC<QuickAudioToggleButtonProps> = ({
  compact = false,
  showLabelOnDesktop = false,
  className = '',
}) => {
  const soundManager = SoundManager.getInstance();
  const [isMuted, setIsMuted] = useState<boolean>(() => soundManager.isMuted());

  useEffect(() => {
    setIsMuted(soundManager.isMuted());
    const unsub = soundManager.subscribe(() => {
      setIsMuted(soundManager.isMuted());
    });
    return unsub;
  }, [soundManager]);

  const handleToggle = () => {
    soundManager.unlock();
    soundManager.toggleMute();
    setIsMuted(soundManager.isMuted());
  };

  const accessibleLabel = isMuted ? 'Bật âm thanh' : 'Tắt âm thanh';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={accessibleLabel}
      aria-pressed={isMuted}
      title={accessibleLabel}
      data-testid="top-menu-audio-toggle-btn"
      className={
        compact
          ? `flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-semibold transition-all shadow cursor-pointer active:scale-95 ${
              isMuted
                ? 'bg-rose-950/80 border-rose-700/80 text-rose-300 hover:bg-rose-900/80'
                : 'bg-neutral-900 border-neutral-700 text-emerald-400 hover:border-amber-500 hover:text-amber-300'
            } ${className}`.trim()
          : `flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow cursor-pointer active:scale-95 ${
              isMuted
                ? 'bg-rose-950/80 border-rose-700/80 text-rose-300 hover:bg-rose-900/80'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-emerald-400 hover:border-amber-500/60'
            } ${className}`.trim()
      }
    >
      {isMuted ? (
        <VolumeX className={compact ? 'w-3.5 h-3.5 text-rose-400 shrink-0' : 'w-3.5 h-3.5 text-rose-400 shrink-0'} />
      ) : (
        <Volume2 className={compact ? 'w-3.5 h-3.5 text-emerald-400 shrink-0' : 'w-3.5 h-3.5 text-emerald-400 shrink-0'} />
      )}
      {showLabelOnDesktop && (
        <span className="hidden md:inline text-neutral-200">
          {isMuted ? 'Đã tắt âm' : 'Âm thanh'}
        </span>
      )}
    </button>
  );
};
