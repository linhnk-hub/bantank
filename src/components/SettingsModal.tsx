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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetFps: 30 | 60;
  onFpsChange: (fps: 30 | 60) => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (diff: 'DEFAULT' | 'EXTREME') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  targetFps,
  onFpsChange,
  difficulty,
  onDifficultyChange,
}) => {
  const soundManager = SoundManager.getInstance();
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(() => soundManager.getSettings());

  if (!isOpen) return null;

  const handleBgmToggle = () => {
    soundManager.unlock();
    const updated = { ...audioSettings, bgmEnabled: !audioSettings.bgmEnabled };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
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
  };

  const handleSfxVolChange = (val: number) => {
    const updated = { ...audioSettings, sfxVolume: val };
    setAudioSettings(updated);
    soundManager.updateSettings(updated);
  };

  const testAudio = (type: 'p1_shoot' | 'enemy_shoot' | 'tank_exp' | 'base_exp') => {
    soundManager.unlock();
    if (type === 'p1_shoot') soundManager.playP1Shoot();
    else if (type === 'enemy_shoot') soundManager.playEnemyShoot();
    else if (type === 'tank_exp') soundManager.playEnemyExplosion();
    else if (type === 'base_exp') soundManager.playBaseExplosion();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Cài Đặt & Tùy Chọn Trận Đấu
              </h2>
              <p className="text-[11px] text-neutral-400">
                FPS Render • Độ khó Cực khó • Âm thanh Arcade 8-bit
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all active:scale-95"
            title="Đóng cài đặt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs scrollbar-thin">
          {/* =========================================================================
              SECTION 1: FPS RENDER LIMIT (30 vs 60 FPS)
             ========================================================================= */}
          <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-neutral-200">
                <Gauge className="w-4 h-4 text-sky-400" />
                <span>Giới Hạn FPS Render (So sánh độ mượt)</span>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                Hiện tại: {targetFps} FPS
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Physics Core luôn chạy cố định 60Hz. Khi chọn 30 FPS, chỉ giảm số khung hình render để người chơi so sánh trực quan; tốc độ tank và đạn giữ nguyên 100%.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onFpsChange(60)}
                className={`py-2 px-3 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  targetFps === 60
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                <span className="font-extrabold text-xs">60 FPS (Mặc định)</span>
                <span className="text-[10px] text-neutral-400">Siêu mượt, chuẩn arcade cổ điển</span>
              </button>

              <button
                type="button"
                onClick={() => onFpsChange(30)}
                className={`py-2 px-3 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  targetFps === 30
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                <span className="font-extrabold text-xs">30 FPS (So sánh)</span>
                <span className="text-[10px] text-neutral-400">Tiết kiệm pin, vật lý giữ 60Hz</span>
              </button>
            </div>
          </section>

          {/* =========================================================================
              SECTION 2: DIFFICULTY (DEFAULT 80PX vs EXTREME WHOLE MAP)
             ========================================================================= */}
          <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-neutral-200">
                <Flame className="w-4 h-4 text-rose-400" />
                <span>Mức Độ Khó AI (Phạm vi phát hiện P1)</span>
              </div>
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold border ${
                difficulty === 'EXTREME'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}>
                {difficulty === 'EXTREME' ? 'CỰC KHÓ' : 'MẶC ĐỊNH'}
              </span>
            </div>

            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Mặc định xe địch phát hiện trong bán kính 80px. Ở mức Cực khó, xe địch phát hiện P1 trên toàn bộ bản đồ Stage 1 qua đường nhìn thẳng (LoS), chủ động truy đuổi bằng A* và ngắm bắn từ xa.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onDifficultyChange('DEFAULT')}
                className={`py-2 px-3 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  difficulty === 'DEFAULT'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                <span className="font-extrabold text-xs">Mặc Định (80px)</span>
                <span className="text-[10px] text-neutral-400">Chuẩn thiết kế M3, bán kính 80px</span>
              </button>

              <button
                type="button"
                onClick={() => onDifficultyChange('EXTREME')}
                className={`py-2 px-3 rounded-lg border text-left flex flex-col gap-0.5 transition-all ${
                  difficulty === 'EXTREME'
                    ? 'bg-rose-500/20 border-rose-500 text-rose-300 font-bold shadow-md'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
                }`}
              >
                <span className="font-extrabold text-xs">Cực Khó (Toàn Bản Đồ)</span>
                <span className="text-[10px] text-neutral-400">Truy đuổi P1 mọi nơi, ngắm bắn xa</span>
              </button>
            </div>
          </section>

          {/* =========================================================================
              SECTION 3: ARCADE SOUND SYSTEM (WEB AUDIO 8-BIT)
             ========================================================================= */}
          <section className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3.5 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-neutral-200">
                <Music className="w-4 h-4 text-amber-400" />
                <span>Âm Thanh Arcade 8-Bit (Web Audio API)</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-mono">Bản quyền mở 100%</span>
            </div>

            {/* BGM Toggle & Slider */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-neutral-300 font-semibold">
                  {audioSettings.bgmEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-500" />}
                  <span>Nhạc nền Arcade (BGM Quân sự)</span>
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
                Nghe thử các hiệu ứng âm thanh arcade:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
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
          </section>
        </div>

        {/* Footer */}
        <div className="bg-neutral-950 px-4 py-3 border-t border-neutral-800 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-transform active:scale-95 shadow"
          >
            ĐÓNG & LƯU CÀI ĐẶT
          </button>
        </div>
      </div>
    </div>
  );
};
