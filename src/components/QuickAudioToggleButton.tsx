/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { SoundManager } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';

export interface QuickAudioToggleButtonProps {
  compact?: boolean;
  showLabelOnDesktop?: boolean;
  className?: string;
}

/**
 * Top Menu Quick BGM Mute/Unmute Toggle Button (Neo-Retro V1.0)
 * - Accessible labels: "Tắt nhạc nền" (when BGM is ON) and "Bật nhạc nền" (when BGM is OFF)
 * - Reflects real-time BGM status: playing, awaiting interaction (autoplay blocked), or muted
 */
export const QuickAudioToggleButton: React.FC<QuickAudioToggleButtonProps> = ({
  compact = false,
  className = '',
}) => {
  const soundManager = SoundManager.getInstance();
  const musicManager = MusicManager.getInstance();
  const [isBgmMuted, setIsBgmMuted] = useState<boolean>(() => soundManager.isBgmMuted());
  const [isAwaitingUnlock, setIsAwaitingUnlock] = useState<boolean>(() =>
    musicManager.isAwaitingAutoplayUnlock()
  );

  useEffect(() => {
    const syncState = () => {
      setIsBgmMuted(soundManager.isBgmMuted());
      setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
    };
    syncState();
    const unsubSound = soundManager.subscribe(syncState);
    const unsubMusic = musicManager.subscribe(syncState);
    return () => {
      unsubSound();
      unsubMusic();
    };
  }, [soundManager, musicManager]);

  const handleToggle = () => {
    soundManager.unlock();
    if (!soundManager.isBgmMuted() && musicManager.isAwaitingAutoplayUnlock()) {
      musicManager.unlockFromUserGesture();
      setIsBgmMuted(soundManager.isBgmMuted());
      setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
      return;
    }
    soundManager.toggleBgmMute();
    musicManager.onVolumeOrToggleChanged();
    setIsBgmMuted(soundManager.isBgmMuted());
    setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
  };

  const accessibleLabel = isBgmMuted ? 'Bật nhạc nền' : 'Tắt nhạc nền';
  const titleText = isBgmMuted
    ? 'Bật nhạc nền (tiếng súng vẫn đang bật)'
    : isAwaitingUnlock
      ? 'Chạm để phát nhạc nền (đang chờ tương tác)'
      : 'Tắt nhạc nền (vẫn giữ âm thanh tiếng súng)';
  const bgmStateAttr = isBgmMuted
    ? 'muted'
    : isAwaitingUnlock
      ? 'awaiting-interaction'
      : 'playing';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={accessibleLabel}
      aria-pressed={isBgmMuted}
      title={titleText}
      data-testid="top-menu-audio-toggle-btn"
      data-bgm-state={bgmStateAttr}
      className={
        compact
          ? `flex items-center justify-center gap-1 min-w-[36px] min-h-[36px] px-2 py-1 rounded border text-xs font-btn font-bold transition-all shadow cursor-pointer active:scale-95 touch-manipulation ${
              isBgmMuted
                ? 'bg-[#200510]/90 border-[#FF0055]/75 text-[#FF0055] hover:bg-[#2d0717]'
                : isAwaitingUnlock
                  ? 'bg-[#0b0d1e] border-[#FFB800]/80 text-[#FFB800] hover:border-[#00F0FF] animate-pulse'
                  : 'bg-[#0b0d1e] border-[#00F0FF]/60 text-[#00F0FF] hover:border-[#FFB800] hover:text-[#FFB800]'
            } ${className}`.trim()
          : `flex items-center justify-center gap-1.5 min-w-[36px] min-h-[36px] px-2.5 py-1.5 rounded border text-xs font-btn font-bold transition-all shadow cursor-pointer active:scale-95 touch-manipulation ${
              isBgmMuted
                ? 'bg-[#200510]/90 border-[#FF0055]/75 text-[#FF0055] hover:bg-[#2d0717]'
                : isAwaitingUnlock
                  ? 'bg-[#0b0d1e] border-[#FFB800]/80 text-[#FFB800] hover:border-[#00F0FF] animate-pulse'
                  : 'bg-[#0b0d1e] hover:bg-[#10142b] border-[#00F0FF]/60 text-[#00F0FF] hover:border-[#FFB800] hover:text-[#FFB800]'
            } ${className}`.trim()
      }
    >
      {isBgmMuted ? (
        <span
          className="relative inline-flex items-center justify-center w-3.5 h-3.5 shrink-0"
          data-testid="top-menu-music-muted-icon"
          aria-hidden="true"
        >
          <Music className="w-3.5 h-3.5 text-[#FF0055] opacity-90" />
          <span className="pointer-events-none absolute w-[15px] h-[1.75px] bg-[#FF0055] -rotate-45 rounded-full shadow-[0_0_0_1px_rgba(5,5,16,0.95)]" />
        </span>
      ) : (
        <Music
          className={`w-3.5 h-3.5 shrink-0 ${
            isAwaitingUnlock ? 'text-[#FFB800]' : 'text-[#00F0FF]'
          }`}
          data-testid="top-menu-music-active-icon"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

