/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Volume2, VolumeX, Music, Sliders, User, Upload, Check, Trash2, RefreshCw, Lock, ShieldCheck, AlertCircle, CheckCircle2, Save, Camera, Eye, EyeOff, Sparkles, Image as ImageIcon, Gamepad2, Shield, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { SoundManager, type AudioSettings } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { AuthManager, resolveUserRole } from '../core/authManager.ts';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (diff: 'DEFAULT' | 'EXTREME') => void;
  isSuperAdmin?: boolean;
  user?: any;
  onProfileUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, user: propUser }) => {
  if (!isOpen) return null;
  const soundManager = SoundManager.getInstance();
  const [audioSettings, setAudioSettings] = useState(() => soundManager.getSettings());

  const handleBgmToggle = () => { soundManager.unlock(); const upd = { ...audioSettings, bgmEnabled: !audioSettings.bgmEnabled }; setAudioSettings(upd); soundManager.updateSettings(upd); };
  const handleSfxToggle = () => { soundManager.unlock(); const upd = { ...audioSettings, sfxEnabled: !audioSettings.sfxEnabled }; setAudioSettings(upd); soundManager.updateSettings(upd); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-display">
      <div className="bg-black border-4 border-neo-amber pixel-corners p-8 max-w-md w-full shadow-[0_0_30px_rgba(255,184,0,0.3)]">
        <div className="flex justify-between items-center border-b-2 border-neo-amber pb-4 mb-6">
          <h2 className="font-pixel text-3xl text-neo-amber uppercase">SYSTEM SETTINGS</h2>
          <button onClick={onClose} className="btn-arcade-outline p-2"><X className="w-5 h-5" /></button>
        </div>
        
        <div className="space-y-6">
          <div className="border-2 border-gray-800 p-4 pixel-corners">
            <h3 className="font-pixel text-xl text-white mb-4">AUDIO</h3>
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-400">MUSIC (BGM)</span>
              <button onClick={handleBgmToggle} className={`btn-arcade-outline px-4 py-1 ${audioSettings.bgmEnabled ? '!border-green-500 !text-green-400' : '!border-gray-600 !text-gray-500'}`}>{audioSettings.bgmEnabled ? 'ON' : 'OFF'}</button>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">EFFECTS (SFX)</span>
              <button onClick={handleSfxToggle} className={`btn-arcade-outline px-4 py-1 ${audioSettings.sfxEnabled ? '!border-green-500 !text-green-400' : '!border-gray-600 !text-gray-500'}`}>{audioSettings.sfxEnabled ? 'ON' : 'OFF'}</button>
            </div>
          </div>
        </div>
        
        <button onClick={onClose} className="btn-arcade w-full mt-6 py-4 text-xl">CLOSE</button>
      </div>
    </div>
  );
};
