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
 * Top Menu Quick BGM Mute/Unmute Toggle Button
 * - Accessible labels: "Tắt nhạc nền" (when BGM is ON) and "Bật nhạc nền" (when BGM is OFF)
 * - Immediately mutes/restores background music (BGM) while keeping gunshots & combat SFX audible
 */
export const QuickAudioToggleButton: React.FC<QuickAudioToggleButtonProps> = ({
  compact = false,
  showLabelOnDesktop = false,
  className = '',
}) => {
  const soundManager = SoundManager.getInstance();
  const [isBgmMuted, setIsBgmMuted] = useState<boolean>(() => soundManager.isBgmMuted());

  useEffect(() => {
    setIsBgmMuted(soundManager.isBgmMuted());
    const unsub = soundManager.subscribe(() => {
      setIsBgmMuted(soundManager.isBgmMuted());
    });
    return unsub;
  }, [soundManager]);

  const handleToggle = () => {
    soundManager.unlock();
    soundManager.toggleBgmMute();
    setIsBgmMuted(soundManager.isBgmMuted());
  };

  const accessibleLabel = isBgmMuted ? 'Bật nhạc nền' : 'Tắt nhạc nền';
  const titleText = isBgmMuted
    ? 'Bật nhạc nền (tiếng súng vẫn đang bật)'
    : 'Tắt nhạc nền (vẫn giữ âm thanh tiếng súng)';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={accessibleLabel}
      aria-pressed={isBgmMuted}
      title={titleText}
      data-testid="top-menu-audio-toggle-btn"
      className={
        compact
          ? `flex items-center justify-center gap-1 px-2 py-0.5 rounded-lg border text-xs font-semibold transition-all shadow cursor-pointer active:scale-95 ${
              isBgmMuted
                ? 'bg-rose-950/80 border-rose-700/80 text-rose-300 hover:bg-rose-900/80'
                : 'bg-neutral-900 border-neutral-700 text-emerald-400 hover:border-amber-500 hover:text-amber-300'
            } ${className}`.trim()
          : `flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow cursor-pointer active:scale-95 ${
              isBgmMuted
                ? 'bg-rose-950/80 border-rose-700/80 text-rose-300 hover:bg-rose-900/80'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-emerald-400 hover:border-amber-500/60'
            } ${className}`.trim()
      }
    >
      {isBgmMuted ? (
        <VolumeX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
      ) : (
        <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      )}
      {showLabelOnDesktop && (
        <span className="hidden md:inline text-neutral-200">
          {isBgmMuted ? 'Đã tắt nhạc' : 'Nhạc nền'}
        </span>
      )}
    </button>
  );
};
