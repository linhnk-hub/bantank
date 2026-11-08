/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Music,
  Gauge,
  Flame,
  ShieldAlert,
  Play,
  RotateCcw,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { SoundManager, type AudioSettings } from '../core/audio.ts';
import { MusicManager } from '../core/musicManager.ts';
import { MusicAdminPanel } from './MusicAdminPanel.tsx';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (diff: 'DEFAULT' | 'EXTREME') => void;
  isSuperAdmin?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isSuperAdmin = false,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  const soundManager = SoundManager.getInstance();
  const musicManager = MusicManager.getInstance();
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => soundManager.getSettings());
  const [showMusicAdmin, setShowMusicAdmin] = useState<boolean>(false);

  if (!isOpen) return null;

  const canShowAdminMusic = isSuperAdmin && musicManager.canManageMusic();

  const handleBgmToggle = () => {
    soundManager.unlock();
    const updated = { ...audioSettings, bgmEnabled: !audioSettings.bgmEnabled };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
    musicManager.onVolumeOrToggleChanged();
  };

  const handleSfxToggle = () => {
    soundManager.unlock();
    const updated = { ...audioSettings, sfxEnabled: !audioSettings.sfxEnabled };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
  };

  const handleBgmVolChange = (val: number) => {
    const updated = { ...audioSettings, bgmVolume: val };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
    musicManager.onVolumeOrToggleChanged();
  };

  const handleSfxVolChange = (val: number) => {
    const updated = { ...audioSettings, sfxVolume: val };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
  };

  const testAudio = (type: 'p1_shoot' | 'enemy_shoot' | 'tank_exp' | 'p1_exp' | 'base_exp') => {
    soundManager.unlock();
    if (type === 'p1_shoot') soundManager.playP1Shoot();
    else if (type === 'enemy_shoot') soundManager.playEnemyShoot();
    else if (type === 'tank_exp') soundManager.playEnemyExplosion();
    else if (type === 'p1_exp') soundManager.playP1Explosion();
    else if (type === 'base_exp') soundManager.playBaseExplosion();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Cấu Hình Âm Thanh & Hiển Thị
              </h2>
              <p className="text-[11px] text-neutral-400">
                Tùy chỉnh Nhạc nền (BGM) • Hiệu ứng Tiếng súng & Nổ (SFX) • Chế độ Màn hình
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all active:scale-95"
            title="Đóng cấu hình"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs scrollbar-thin">
          {/* =========================================================================
              SECTION 1: ARCADE SOUND SYSTEM (WEB AUDIO 8-BIT)
             ========================================================================= */}
          <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-neutral-200">
                <Music className="w-4 h-4 text-amber-400" />
                <span>Âm Thanh Arcade 8-Bit (Web Audio API)</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">BGM & SFX Độc Lập</span>
            </div>

            {/* BGM Toggle & Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                  {audioSettings.bgmEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-500" />}
                  <span>Nhạc nền Arcade (BGM Chiến dịch)</span>
                </div>
                <button
                  type="button"
                  onClick={handleBgmToggle}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    audioSettings.bgmEnabled
                      ? 'bg-amber-500 text-black'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {audioSettings.bgmEnabled ? 'BẬT' : 'TẮT'}
                </button>
              </div>

              {audioSettings.bgmEnabled && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audioSettings.bgmVolume}
                    onChange={(e) => handleBgmVolChange(parseFloat(e.target.value))}
                    className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded"
                  />
                  <span className="font-mono text-[10px] text-neutral-400 w-8 text-right">
                    {Math.round(audioSettings.bgmVolume * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* SFX Toggle & Slider */}
            <div className="space-y-1.5 pt-1 border-t border-neutral-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                  {audioSettings.sfxEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-500" />}
                  <span>Hiệu ứng Tiếng súng & Nổ (SFX)</span>
                </div>
                <button
                  type="button"
                  onClick={handleSfxToggle}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                    audioSettings.sfxEnabled
                      ? 'bg-emerald-500 text-black'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {audioSettings.sfxEnabled ? 'BẬT' : 'TẮT'}
                </button>
              </div>

              {audioSettings.sfxEnabled && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={audioSettings.sfxVolume}
                    onChange={(e) => handleSfxVolChange(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-neutral-800 rounded"
                  />
                  <span className="font-mono text-[10px] text-neutral-400 w-8 text-right">
                    {Math.round(audioSettings.sfxVolume * 100)}%
                  </span>
                </div>
              )}
            </div>

            {/* Test Audio Trigger Buttons */}
            <div className="pt-2 border-t border-neutral-800 space-y-1.5">
              <span className="text-[10px] text-neutral-400 block font-semibold">
                Kiểm tra nhanh hiệu ứng âm thanh:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                <button
                  type="button"
                  onClick={() => testAudio('p1_shoot')}
                  className="px-2 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-amber-500 text-neutral-300 text-[10px] font-semibold active:scale-95"
                >
                  P1 Bắn
                </button>
                <button
                  type="button"
                  onClick={() => testAudio('enemy_shoot')}
                  className="px-2 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-amber-500 text-neutral-300 text-[10px] font-semibold active:scale-95"
                >
                  Địch Bắn
                </button>
                <button
                  type="button"
                  onClick={() => testAudio('p1_exp')}
                  className="px-2 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-amber-500 text-amber-300 text-[10px] font-bold active:scale-95"
                >
                  P1 Nổ
                </button>
                <button
                  type="button"
                  onClick={() => testAudio('tank_exp')}
                  className="px-2 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-rose-500 text-neutral-300 text-[10px] font-semibold active:scale-95"
                >
                  Nổ Xe Địch
                </button>
                <button
                  type="button"
                  onClick={() => testAudio('base_exp')}
                  className="px-2 py-1.5 rounded bg-neutral-900 border border-neutral-800 hover:border-red-500 text-rose-300 text-[10px] font-bold active:scale-95"
                >
                  Nổ Đại Bàng
                </button>
              </div>
            </div>

            {onToggleFullscreen && (
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <span className="text-[11px] text-neutral-300 font-semibold">
                  Chế độ hiển thị toàn màn hình (Fullscreen)
                </span>
                <button
                  type="button"
                  onClick={onToggleFullscreen}
                  className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-bold text-[11px] transition-all"
                >
                  {isFullscreen ? 'Thu Nhỏ Cửa Sổ' : 'Bật Toàn Màn Hình'}
                </button>
              </div>
            )}

            {/* Toggle Super Admin Music Management Panel — ONLY visible for Super Admin */}
            {canShowAdminMusic && (
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
                <span className="text-[11px] text-amber-300 font-bold">
                  Quản trị & Upload Thư viện Nhạc nền (Super Admin)
                </span>
                <button
                  type="button"
                  onClick={() => setShowMusicAdmin((v) => !v)}
                  className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] transition-all"
                >
                  {showMusicAdmin ? 'Thu gọn Quản lý Nhạc' : 'Mở Quản lý & Upload Nhạc'}
                </button>
              </div>
            )}
          </section>

          {canShowAdminMusic && showMusicAdmin && <MusicAdminPanel />}
        </div>

        {/* Footer */}
        <div className="bg-neutral-950 px-4 py-3 border-t border-neutral-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-transform active:scale-95 shadow"
          >
            ĐÓNG & LƯU CẤU HÌNH
          </button>
        </div>
      </div>
    </div>
  );
};
