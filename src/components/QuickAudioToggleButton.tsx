/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Music } from 'lucide-react';
import { SoundManager } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';
import { useLanguage } from '../core/i18n.ts';

export interface QuickAudioToggleButtonProps {
  compact?: boolean;
  frameless?: boolean;
  showLabelOnDesktop?: boolean;
  className?: string;
  scope?: 'HOME' | 'BATTLE' | 'ACTIVE';
}

/**
 * Top Menu Quick BGM Mute/Unmute Toggle Button (Neo-Retro V1.0)
 * - Accessible labels: "Tắt nhạc nền" (when BGM is ON) and "Bật nhạc nền" (when BGM is OFF)
 * - Reflects real-time BGM status: playing, awaiting interaction (autoplay blocked), or muted
 * - Gate 2C: Supports explicit HOME/BATTLE scope isolation so Home mute never affects Battle BGM
 */
export const QuickAudioToggleButton: React.FC<QuickAudioToggleButtonProps> = ({
  compact = false,
  frameless = false,
  className = '',
  scope = 'ACTIVE',
}) => {
  const { t } = useLanguage();
  const soundManager = SoundManager.getInstance();
  const musicManager = MusicManager.getInstance();

  const readScopedMuted = () => {
    if (scope === 'HOME') return soundManager.isHomeBgmMuted();
    if (scope === 'BATTLE') return soundManager.isBattleBgmMuted();
    return soundManager.isBgmMuted();
  };

  const toggleScopedMute = () => {
    if (scope === 'HOME') return soundManager.toggleHomeBgmMute();
    if (scope === 'BATTLE') return soundManager.toggleBattleBgmMute();
    return soundManager.toggleBgmMute();
  };

  const [isBgmMuted, setIsBgmMuted] = useState<boolean>(() => readScopedMuted());
  const [isAwaitingUnlock, setIsAwaitingUnlock] = useState<boolean>(() =>
    musicManager.isAwaitingAutoplayUnlock()
  );
  const wasAwaitingUnlockOnPointerDownRef = useRef<boolean>(false);

  useEffect(() => {
    const syncState = () => {
      setIsBgmMuted(readScopedMuted());
      setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
    };
    syncState();
    const unsubSound = soundManager.subscribe(syncState);
    const unsubMusic = musicManager.subscribe(syncState);
    return () => {
      unsubSound();
      unsubMusic();
    };
  }, [soundManager, musicManager, scope]);

  const handlePointerDownCapture = () => {
    wasAwaitingUnlockOnPointerDownRef.current =
      !readScopedMuted() && musicManager.isAwaitingAutoplayUnlock();
  };

  const handleToggle = () => {
    const shouldUnlockOnly =
      wasAwaitingUnlockOnPointerDownRef.current ||
      (!readScopedMuted() && musicManager.isAwaitingAutoplayUnlock());
    wasAwaitingUnlockOnPointerDownRef.current = false;

    soundManager.unlock();
    if (shouldUnlockOnly) {
      musicManager.unlockFromUserGesture();
      setIsBgmMuted(readScopedMuted());
      setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
      return;
    }
    toggleScopedMute();
    musicManager.onVolumeOrToggleChanged();
    setIsBgmMuted(readScopedMuted());
    setIsAwaitingUnlock(musicManager.isAwaitingAutoplayUnlock());
  };

  const accessibleLabel = isBgmMuted
    ? t('Bật nhạc nền', 'Enable BGM')
    : t('Tắt nhạc nền', 'Mute BGM');
  const titleText = isBgmMuted
    ? t('Bật nhạc nền (tiếng súng vẫn đang bật)', 'Enable BGM (combat SFX stays active)')
    : isAwaitingUnlock
      ? t('Chạm để phát nhạc nền (đang chờ tương tác)', 'Tap to unlock and play BGM')
      : t('Tắt nhạc nền (vẫn giữ âm thanh tiếng súng)', 'Mute BGM (keep combat SFX active)');
  const bgmStateAttr = isBgmMuted
    ? 'muted'
    : isAwaitingUnlock
      ? 'awaiting-interaction'
      : 'playing';

  return (
    <button
      type="button"
      onPointerDownCapture={handlePointerDownCapture}
      onClick={handleToggle}
      aria-label={accessibleLabel}
      aria-pressed={isBgmMuted}
      title={titleText}
      data-testid="top-menu-audio-toggle-btn"
      data-bgm-state={bgmStateAttr}
      className={
        frameless
          ? `flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none text-xs font-btn font-bold transition-all cursor-pointer active:scale-95 touch-manipulation ${
              isBgmMuted
                ? 'text-[#FF0055] hover:text-rose-400'
                : isAwaitingUnlock
                  ? 'text-[#FFB800] hover:text-[#00F0FF] animate-pulse'
                  : 'text-[#00F0FF] hover:text-[#FFB800]'
            } ${className}`.trim()
          : compact
            ? `flex items-center justify-center w-[36px] h-[36px] min-w-[36px] min-h-[36px] px-0 py-0 rounded border text-xs font-btn font-extrabold transition-all shadow cursor-pointer active:scale-95 touch-manipulation ${
                isBgmMuted
                  ? 'bg-[#200510]/90 border-[#FF0055]/75 text-[#FF0055] hover:bg-[#2d0717]'
                  : isAwaitingUnlock
                    ? 'bg-[#0b0d1e]/95 border-[#FFB800]/80 text-[#FFB800] hover:border-[#00F0FF] animate-pulse'
                    : 'bg-[#0b0d1e]/95 border-[#00F0FF]/60 text-[#00F0FF] hover:border-[#FFB800] hover:text-[#FFB800]'
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
          className="relative inline-flex items-center justify-center w-4 h-4 shrink-0"
          data-testid="top-menu-music-muted-icon"
          aria-hidden="true"
        >
          <Music className="w-4 h-4 text-[#FF0055] opacity-90" />
          <span className="pointer-events-none absolute w-[16px] h-[1.75px] bg-[#FF0055] -rotate-45 rounded-full shadow-[0_0_0_1px_rgba(5,5,16,0.95)]" />
        </span>
      ) : (
        <Music
          className={`w-4 h-4 shrink-0 ${
            isAwaitingUnlock ? 'text-[#FFB800]' : 'text-[#00F0FF]'
          }`}
          data-testid="top-menu-music-active-icon"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

