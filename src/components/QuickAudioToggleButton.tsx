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

export const QuickAudioToggleButton: React.FC<QuickAudioToggleButtonProps> = ({
  compact = false, showLabelOnDesktop = false, className = '',
}) => {
  const soundManager = SoundManager.getInstance();
  const [isMuted, setIsMuted] = useState<boolean>(() => soundManager.isMuted());

  useEffect(() => {
    setIsMuted(soundManager.isMuted());
    const unsub = soundManager.subscribe(() => setIsMuted(soundManager.isMuted()));
    return unsub;
  }, [soundManager]);

  const handleToggle = () => { soundManager.unlock(); soundManager.toggleMute(); setIsMuted(soundManager.isMuted()); };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`btn-arcade-outline flex items-center justify-center gap-2 ${compact ? 'px-2 py-1' : 'px-3 py-1.5'} ${isMuted ? '!border-neo-rose !text-neo-rose' : ''} ${className}`}
    >
      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      {showLabelOnDesktop && <span className="hidden md:inline font-pixel text-lg">{isMuted ? 'MUTED' : 'AUDIO'}</span>}
    </button>
  );
};
