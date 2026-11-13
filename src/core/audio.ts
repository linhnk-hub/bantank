/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 8-Bit Arcade Procedural Audio Synthesizer for BanTank Online
 * Powered strictly by native Web Audio API (zero external assets/copyrights).
 * Generates retro square, triangle, and noise waveforms for authentic Battle City arcade sound.
 */

export interface AudioSettings {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  bgmVolume: number; // 0.0 to 1.0
  sfxVolume: number; // 0.0 to 1.0
}

import { ScoreManager } from './scoreManager.ts';
import { ADMIN_EMAIL, AuthManager, isAdminUser } from './authManager.ts';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';

export const DEFAULT_AUDIO_SETTINGS: Readonly<AudioSettings> = {
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: 0.35,
  sfxVolume: 0.5,
};

/**
 * M7.3.10 Section 4: Game Action Sound Slots managed by Admin
 */
export type GameActionSoundId =
  | 'P1_SHOOT'
  | 'ENEMY_SHOOT'
  | 'P1_EXPLOSION'
  | 'ENEMY_EXPLOSION'
  | 'BASE_EXPLOSION'
  | 'STAGE_CLEAR'
  | 'GAME_OVER';

export interface GameActionSoundSlotMeta {
  id: GameActionSoundId;
  label: string;
  description: string;
  category: 'COMBAT' | 'MATCH_EVENT';
}

export const GAME_ACTION_SOUND_SLOTS: readonly GameActionSoundSlotMeta[] = [
  {
    id: 'P1_SHOOT',
    label: 'Xe tăng người chơi bắn (P1/P2 Shoot)',
    description: 'Âm thanh phát ra khi xe tăng P1 hoặc P2 khai hỏa đạn',
    category: 'COMBAT',
  },
  {
    id: 'ENEMY_SHOOT',
    label: 'Xe tăng địch bắn (Enemy Shoot)',
    description: 'Âm thanh phát ra khi xe tăng AI địch bắn đạn',
    category: 'COMBAT',
  },
  {
    id: 'P1_EXPLOSION',
    label: 'Nổ xe tăng người chơi (Player Explosion)',
    description: 'Âm thanh khi xe tăng người chơi trúng đạn phát nổ',
    category: 'COMBAT',
  },
  {
    id: 'ENEMY_EXPLOSION',
    label: 'Nổ xe tăng địch (Enemy Explosion)',
    description: 'Âm thanh khi tiêu diệt xe tăng địch trên chiến trường',
    category: 'COMBAT',
  },
  {
    id: 'BASE_EXPLOSION',
    label: 'Nổ căn cứ Đại Bàng (Base Destroyed)',
    description: 'Âm thanh cảnh báo khi căn cứ chính Đại Bàng bị phá hủy',
    category: 'MATCH_EVENT',
  },
  {
    id: 'STAGE_CLEAR',
    label: 'Chiến thắng màn chơi (Stage Clear)',
    description: 'Âm thanh chúc mừng khi hoàn thành mục tiêu màn chơi',
    category: 'MATCH_EVENT',
  },
  {
    id: 'GAME_OVER',
    label: 'Kết thúc trận đấu (Game Over)',
    description: 'Âm thanh khi thua cuộc kết thúc trận đấu',
    category: 'MATCH_EVENT',
  },
] as const;

export interface CustomActionSoundTrack {
  actionId: GameActionSoundId;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSec: number;
  updatedAtMs: number;
  updatedByEmail: string;
  dataUrl?: string;
}

const STORAGE_KEYS = {
  BGM_ENABLED: 'bantank_bgm_enabled',
  SFX_ENABLED: 'bantank_sfx_enabled',
  BGM_VOL: 'bantank_bgm_vol',
  SFX_VOL: 'bantank_sfx_vol',
  MASTER_MUTED: 'bantank_master_muted',
  PRE_MUTE_BGM: 'bantank_pre_mute_bgm',
  PRE_MUTE_SFX: 'bantank_pre_mute_sfx',
  ACTION_SFX_TRACKS: 'bantank_custom_action_sfx_v1',
};

const MAX_ACTION_SFX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_ACTION_SFX_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.m4a', '.webm'];

export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };

  private masterMuted: boolean = false;
  private preMuteChannelState: { bgmEnabled: boolean; sfxEnabled: boolean } = {
    bgmEnabled: true,
    sfxEnabled: true,
  };

  private isUnlocked: boolean = false;
  private isBgmPlaying: boolean = false;
  private customBgmActive: boolean = false;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;
  private processedEventIds: Set<string> = new Set();
  private noiseBuffer: AudioBuffer | null = null;

  // Subscribers for UI synchronization (Top Menu Quick Mute button & Settings Modal)
  private listeners: Set<() => void> = new Set();

  // Admin Custom Action SFX Management (M7.3.10 Section 4 + M7.3.11.6 Realtime Sync)
  private customActionTracks: Map<GameActionSoundId, CustomActionSoundTrack> = new Map();
  private customActionBuffers: Map<GameActionSoundId, AudioBuffer> = new Map();
  private activeActionSources: Set<AudioBufferSourceNode> = new Set();
  private lastPlayedCustomActionId: GameActionSoundId | null = null;
  private adminRoleOverride: 'ADMIN' | 'MOD' | 'PLAYER' | null = null;
  private unsubCloudActionSfx: (() => void) | null = null;

  private constructor() {
    this.loadSettings();
    this.loadCustomActionTracksFromStorage();
    this.initCloudActionSfxSubscription();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber error
      }
    }
  }

  private notifyMusicManager(): void {
    try {
      const globalRef = globalThis as unknown as {
        __bantankMusicManagerSync?: () => void;
      };
      if (typeof globalRef.__bantankMusicManagerSync === 'function') {
        globalRef.__bantankMusicManagerSync();
      }
    } catch {
      // Ignore
    }
  }

  public setCustomBgmActive(active: boolean): void {
    this.customBgmActive = active;
    if (active && this.isBgmPlaying) {
      this.stopBgm();
    }
  }

  public isCustomBgmActive(): boolean {
    return this.customBgmActive;
  }

  public isProceduralBgmPlaying(): boolean {
    return this.isBgmPlaying;
  }

  private loadSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      const bgmEn = localStorage.getItem(STORAGE_KEYS.BGM_ENABLED);
      if (bgmEn !== null) this.settings.bgmEnabled = bgmEn === 'true';

      const sfxEn = localStorage.getItem(STORAGE_KEYS.SFX_ENABLED);
      if (sfxEn !== null) this.settings.sfxEnabled = sfxEn === 'true';

      const bgmVol = localStorage.getItem(STORAGE_KEYS.BGM_VOL);
      if (bgmVol !== null) this.settings.bgmVolume = Math.max(0, Math.min(1, parseFloat(bgmVol)));

      const sfxVol = localStorage.getItem(STORAGE_KEYS.SFX_VOL);
      if (sfxVol !== null) this.settings.sfxVolume = Math.max(0, Math.min(1, parseFloat(sfxVol)));

      const muted = localStorage.getItem(STORAGE_KEYS.MASTER_MUTED);
      if (muted !== null) this.masterMuted = muted === 'true';

      const preBgm = localStorage.getItem(STORAGE_KEYS.PRE_MUTE_BGM);
      const preSfx = localStorage.getItem(STORAGE_KEYS.PRE_MUTE_SFX);
      if (preBgm !== null && preSfx !== null) {
        this.preMuteChannelState = {
          bgmEnabled: preBgm === 'true',
          sfxEnabled: preSfx === 'true',
        };
      } else {
        this.preMuteChannelState = {
          bgmEnabled: this.settings.bgmEnabled || true,
          sfxEnabled: this.settings.sfxEnabled || true,
        };
      }
    } catch {
      // LocalStorage fallback default
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined' || ScoreManager.isGlobalTrialMode()) return;
    try {
      localStorage.setItem(STORAGE_KEYS.BGM_ENABLED, String(this.settings.bgmEnabled));
      localStorage.setItem(STORAGE_KEYS.SFX_ENABLED, String(this.settings.sfxEnabled));
      localStorage.setItem(STORAGE_KEYS.BGM_VOL, String(this.settings.bgmVolume));
      localStorage.setItem(STORAGE_KEYS.SFX_VOL, String(this.settings.sfxVolume));
      localStorage.setItem(STORAGE_KEYS.MASTER_MUTED, String(this.masterMuted));
      localStorage.setItem(STORAGE_KEYS.PRE_MUTE_BGM, String(this.preMuteChannelState.bgmEnabled));
      localStorage.setItem(STORAGE_KEYS.PRE_MUTE_SFX, String(this.preMuteChannelState.sfxEnabled));
    } catch {
      // ignore
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /**
   * M7.3.11.6 Section 4.2: Khôi phục cài đặt âm thanh về mặc định chuẩn.
   */
  public resetSettingsToDefault(): AudioSettings {
    this.masterMuted = false;
    this.preMuteChannelState = {
      bgmEnabled: DEFAULT_AUDIO_SETTINGS.bgmEnabled,
      sfxEnabled: DEFAULT_AUDIO_SETTINGS.sfxEnabled,
    };
    this.settings = { ...DEFAULT_AUDIO_SETTINGS };
    this.saveSettings();
    this.applyVolume();
    this.notifyListeners();
    this.notifyMusicManager();
    return { ...this.settings };
  }

  /**
   * M7.3.10 Section 3: Quick Mute / Unmute status & toggle for Top Menu
   */
  public isMuted(): boolean {
    return this.masterMuted || (!this.settings.bgmEnabled && !this.settings.sfxEnabled);
  }

  public setMuted(muted: boolean): void {
    const nextMuted = Boolean(muted);
    if (nextMuted) {
      // Remember current channel flags if at least one was enabled
      if (this.settings.bgmEnabled || this.settings.sfxEnabled) {
        this.preMuteChannelState = {
          bgmEnabled: this.settings.bgmEnabled,
          sfxEnabled: this.settings.sfxEnabled,
        };
      }
      this.masterMuted = true;
      this.settings = {
        ...this.settings,
        bgmEnabled: false,
        sfxEnabled: false,
      };
      this.stopAllActiveActionSources();
      if (this.isBgmPlaying) {
        this.pauseBgm();
      }
    } else {
      this.masterMuted = false;
      const restoreBgm =
        this.preMuteChannelState.bgmEnabled ||
        (!this.preMuteChannelState.bgmEnabled && !this.preMuteChannelState.sfxEnabled);
      const restoreSfx =
        this.preMuteChannelState.sfxEnabled ||
        (!this.preMuteChannelState.bgmEnabled && !this.preMuteChannelState.sfxEnabled);
      this.settings = {
        ...this.settings,
        bgmEnabled: restoreBgm,
        sfxEnabled: restoreSfx,
      };
    }

    this.saveSettings();
    this.applyVolume();
    this.notifyListeners();
    this.notifyMusicManager();
  }

  public toggleMute(): boolean {
    const nextMuted = !this.isMuted();
    this.setMuted(nextMuted);
    return nextMuted;
  }

  public updateSettings(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    if (this.settings.bgmEnabled || this.settings.sfxEnabled) {
      this.masterMuted = false;
      this.preMuteChannelState = {
        bgmEnabled: this.settings.bgmEnabled,
        sfxEnabled: this.settings.sfxEnabled,
      };
    } else {
      this.masterMuted = true;
    }
    this.saveSettings();
    this.applyVolume();

    if (!this.settings.sfxEnabled) {
      this.stopAllActiveActionSources();
    }

    if (!this.settings.bgmEnabled && this.isBgmPlaying) {
      this.pauseBgm();
    } else if (
      this.settings.bgmEnabled &&
      !this.isBgmPlaying &&
      this.isUnlocked &&
      !this.customBgmActive
    ) {
      this.startBgm();
    }

    this.notifyListeners();
  }

  /**
   * Initializes AudioContext safely on first user interaction.
   */
  public initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx) return this.ctx;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.masterGain);

      this.createNoiseBuffer();
      this.applyVolume();
      void this.hydrateCustomActionBuffers();

      // Listen for window tab visibility
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend();
          }
        } else {
          if (this.ctx && this.ctx.state === 'suspended' && this.isUnlocked) {
            this.ctx.resume();
          }
        }
      });

      return this.ctx;
    } catch (err) {
      console.warn('Web Audio API not supported or initialization blocked:', err);
      return null;
    }
  }

  /**
   * Unlocks audio context on user interaction (pointerdown, keydown, touchstart).
   */
  public unlock(): void {
    const ctx = this.initContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        this.isUnlocked = true;
        if (this.settings.bgmEnabled && !this.isBgmPlaying && !this.customBgmActive) {
          this.startBgm();
        }
      }).catch(() => {
        // user interaction retry
      });
    } else {
      this.isUnlocked = true;
      if (this.settings.bgmEnabled && !this.isBgmPlaying && !this.customBgmActive) {
        this.startBgm();
      }
    }
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.masterMuted ? 0 : 1, now);
    }
    if (this.bgmGain) {
      const targetBgm = this.settings.bgmEnabled && !this.masterMuted ? this.settings.bgmVolume : 0;
      this.bgmGain.gain.setValueAtTime(targetBgm, now);
    }
    if (this.sfxGain) {
      const targetSfx = this.settings.sfxEnabled && !this.masterMuted ? this.settings.sfxVolume : 0;
      this.sfxGain.gain.setValueAtTime(targetSfx, now);
    }
  }

  private createNoiseBuffer(): void {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 1.5; // 1.5 seconds noise buffer
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  private playCustomActionBufferIfAvailable(actionId: GameActionSoundId): boolean {
    if (!this.settings.sfxEnabled || this.masterMuted) return true;
    const track = this.customActionTracks.get(actionId);
    const buffer = this.customActionBuffers.get(actionId);
    if (!track && !buffer) return false;

    this.lastPlayedCustomActionId = actionId;
    if (!this.ctx || !this.sfxGain) {
      // Headless / test environment where AudioContext is null: custom track is registered
      return true;
    }
    if (!buffer) {
      return false;
    }

    try {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.0, this.ctx.currentTime);
      source.connect(gain);
      gain.connect(this.sfxGain);

      this.activeActionSources.add(source);
      source.onended = () => {
        this.activeActionSources.delete(source);
      };
      source.start(0);
      return true;
    } catch {
      return false;
    }
  }

  private stopAllActiveActionSources(): void {
    for (const src of this.activeActionSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // Ignore already stopped source
      }
    }
    this.activeActionSources.clear();
  }

  // =========================================================================
  // SOUND EFFECTS (SFX)
  // =========================================================================

  /**
   * 1. Player 1 Cannon Fire: snappy retro square laser pulse (880Hz -> 220Hz, 70ms)
   */
  public playP1Shoot(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('P1_SHOOT')) return;
    if (!this.ctx || !this.sfxGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.07);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio node failure fallback
    }
  }

  /**
   * 2. Enemy Cannon Fire: deeper pulse pitch chirp (320Hz -> 110Hz, 90ms)
   */
  public playEnemyShoot(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('ENEMY_SHOOT')) return;
    if (!this.ctx || !this.sfxGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.09);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // ignore
    }
  }

  /**
   * 3. Enemy Tank Explosion: crunchy noise burst with low-pass sweep down (240ms)
   */
  public playEnemyExplosion(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('ENEMY_EXPLOSION')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;

      // Noise source
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.22);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      // Low sub-bass thud
      const sub = this.ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(120, now);
      sub.frequency.exponentialRampToValueAtTime(30, now + 0.22);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.4, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      sub.connect(subGain);
      subGain.connect(this.sfxGain);

      noise.start(now);
      sub.start(now);
      noise.stop(now + 0.25);
      sub.stop(now + 0.25);
    } catch {
      // ignore
    }
  }

  /**
   * Dedicated P1 Player Tank Explosion:
   * Distinct synthesized retro explosion: high-transient crack, descending distorted tone (240Hz -> 40Hz, 380ms),
   * low sub-bass impact, and crunch noise burst.
   * Distinct from regular enemy explosion (240ms) and base explosion (600ms).
   */
  public playP1Explosion(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('P1_EXPLOSION')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;

      // 1. Noise burst with sweeping lowpass filter
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 0.36);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      // 2. Descending distorted tonal pulse (authentic 8-bit crash)
      const tonal = this.ctx.createOscillator();
      tonal.type = 'sawtooth';
      tonal.frequency.setValueAtTime(240, now);
      tonal.frequency.exponentialRampToValueAtTime(40, now + 0.35);

      const tonalGain = this.ctx.createGain();
      tonalGain.gain.setValueAtTime(0.45, now);
      tonalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);

      // 3. Deep sub-bass thud (triangle 110Hz -> 25Hz)
      const sub = this.ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(110, now);
      sub.frequency.exponentialRampToValueAtTime(25, now + 0.32);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);

      tonal.connect(tonalGain);
      tonalGain.connect(this.sfxGain);

      sub.connect(subGain);
      subGain.connect(this.sfxGain);

      noise.start(now);
      tonal.start(now);
      sub.start(now);

      noise.stop(now + 0.4);
      tonal.stop(now + 0.4);
      sub.stop(now + 0.4);
    } catch {
      // ignore
    }
  }

  /**
   * 4. Base / Eagle Shatter: deep, massive multi-stage explosion (600ms)
   * Distinctly heavier and longer than regular enemy explosion.
   */
  public playBaseExplosion(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('BASE_EXPLOSION')) return;
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    try {
      const now = this.ctx.currentTime;

      // Heavy noise crash
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(40, now + 0.58);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      // Deep rumbling sub-oscillator
      const sub = this.ctx.createOscillator();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(90, now);
      sub.frequency.exponentialRampToValueAtTime(20, now + 0.58);

      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);

      sub.connect(subGain);
      subGain.connect(this.sfxGain);

      noise.start(now);
      sub.start(now);
      noise.stop(now + 0.62);
      sub.stop(now + 0.62);
    } catch {
      // ignore
    }
  }

  /**
   * 5. Victory Stage Clear: upbeat 4-note victory fan-fare arpeggio (C5 - E5 - G5 - C6)
   */
  public playStageClear(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('STAGE_CLEAR')) return;
    if (!this.ctx || !this.sfxGain) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const stepDuration = 0.12;
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.sfxGain) return;
        const noteTime = now + idx * stepDuration;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.3, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + (idx === 3 ? 0.35 : 0.1));

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(noteTime);
        osc.stop(noteTime + (idx === 3 ? 0.36 : 0.11));
      });
    } catch {
      // ignore
    }
  }

  /**
   * 6. Game Over: descending 4-note dramatic retro motif (Eb4 - D4 - Db4 - C4)
   */
  public playGameOver(): void {
    if (!this.settings.sfxEnabled || this.masterMuted) return;
    if (this.playCustomActionBufferIfAvailable('GAME_OVER')) return;
    if (!this.ctx || !this.sfxGain) return;
    try {
      const notes = [311.13, 293.66, 277.18, 261.63]; // Eb4, D4, Db4, C4
      const stepDuration = 0.16;
      const now = this.ctx.currentTime;

      notes.forEach((freq, idx) => {
        if (!this.ctx || !this.sfxGain) return;
        const noteTime = now + idx * stepDuration;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, noteTime);

        gain.gain.setValueAtTime(0.3, noteTime);
        gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(noteTime);
        osc.stop(noteTime + 0.16);
      });
    } catch {
      // ignore
    }
  }

  // =========================================================================
  // BGM SYNTHESIZER (Original 8-bit Military Arcade Theme - Default Fallback)
  // =========================================================================

  private melodyNotes: number[] = [
    // 16-step high-energy military arcade sequence (frequencies in Hz)
    440, 0, 440, 523.25, 440, 392, 440, 0,
    523.25, 587.33, 659.25, 587.33, 523.25, 392, 440, 0,
    330, 0, 330, 392, 330, 293.66, 330, 0,
    392, 440, 523.25, 440, 392, 330, 293.66, 0,
  ];

  private bassNotes: number[] = [
    220, 220, 220, 220, 196, 196, 220, 220,
    261.63, 261.63, 293.66, 293.66, 261.63, 196, 220, 220,
    165, 165, 165, 165, 146.83, 146.83, 165, 165,
    196, 196, 220, 220, 196, 165, 146.83, 146.83,
  ];

  /**
   * M7.3.9 Requirement 8: Built-in 8-bit procedural BGM fallback has been disabled.
   * Only BGM uploaded and configured by Super Admin in MusicManager is played.
   */
  public startBgm(): void {
    this.pauseBgm();
  }

  private scheduleNextBgmStep(): void {
    if (!this.isBgmPlaying || !this.ctx || !this.bgmGain) return;

    const stepTime = 0.14; // ~107 BPM 16th notes
    const now = this.ctx.currentTime;
    const melodyFreq = this.melodyNotes[this.bgmStep % this.melodyNotes.length];
    const bassFreq = this.bassNotes[this.bgmStep % this.bassNotes.length];

    // Play melody note
    if (melodyFreq > 0) {
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(melodyFreq, now);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepTime * 0.85);

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(now);
        osc.stop(now + stepTime * 0.9);
      } catch {
        // ignore
      }
    }

    // Play bass note
    if (bassFreq > 0) {
      try {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();

        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, now);

        bassGain.gain.setValueAtTime(0.22, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + stepTime * 0.8);

        bassOsc.connect(bassGain);
        bassGain.connect(this.bgmGain);

        bassOsc.start(now);
        bassOsc.stop(now + stepTime * 0.85);
      } catch {
        // ignore
      }
    }

    // Retro percussion tap on backbeats (every 4th step)
    if (this.bgmStep % 4 === 2 && this.noiseBuffer) {
      try {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1000, now);

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.12, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        noise.connect(filter);
        filter.connect(snareGain);
        snareGain.connect(this.bgmGain);

        noise.start(now);
        noise.stop(now + 0.06);
      } catch {
        // ignore
      }
    }

    this.bgmStep++;

    this.bgmTimer = window.setTimeout(() => {
      this.scheduleNextBgmStep();
    }, stepTime * 1000);
  }

  public pauseBgm(): void {
    this.isBgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public resumeBgm(): void {
    if (this.settings.bgmEnabled && !this.isBgmPlaying && this.isUnlocked) {
      this.startBgm();
    }
  }

  public stopBgm(): void {
    this.pauseBgm();
    this.bgmStep = 0;
  }

  /**
   * Process combat events with automatic deduplication.
   * Respects match lifecycle: does NOT play SFX when game is paused or game is over.
   */
  public handleCombatEvent(
    event: { id: string; type: string },
    options?: { isPaused?: boolean; isGameOver?: boolean }
  ): void {
    if (this.processedEventIds.has(event.id)) {
      return; // Deduplicated! Exactly once per event ID.
    }
    this.processedEventIds.add(event.id);

    // Keep memory clean
    if (this.processedEventIds.size > 200) {
      const arr = Array.from(this.processedEventIds);
      this.processedEventIds = new Set(arr.slice(100));
    }

    // Do not trigger combat SFX when paused
    if (options?.isPaused) {
      return;
    }

    if (event.type === 'P1_EXPLOSION') {
      this.playP1Explosion();
    } else if (event.type === 'TANK_EXPLOSION') {
      if (!options?.isGameOver) {
        this.playEnemyExplosion();
      }
    } else if (event.type === 'BASE_EXPLOSION') {
      this.playBaseExplosion();
    }
  }

  // =========================================================================
  // SUPER ADMIN CUSTOM ACTION SOUND MANAGEMENT (M7.3.10 Section 4)
  // =========================================================================

  /**
   * Programmatic role setter for unit tests (never persisted to localStorage).
   */
  public setActionSoundAdminRole(role: 'ADMIN' | 'MOD' | 'PLAYER' | null): void {
    this.adminRoleOverride = role;
    this.notifyListeners();
  }

  public canManageActionSounds(): boolean {
    if (this.adminRoleOverride !== null) {
      return this.adminRoleOverride === 'ADMIN';
    }
    const currentUser = AuthManager.getInstance().getCurrentUser();
    return isAdminUser(currentUser);
  }

  public getLastPlayedCustomActionId(): GameActionSoundId | null {
    return this.lastPlayedCustomActionId;
  }

  public clearLastPlayedCustomActionId(): void {
    this.lastPlayedCustomActionId = null;
  }

  public getActionSoundTrack(actionId: GameActionSoundId): CustomActionSoundTrack | null {
    return this.customActionTracks.get(actionId) ?? null;
  }

  public getAllActionSoundTracks(): Record<GameActionSoundId, CustomActionSoundTrack | null> {
    return {
      P1_SHOOT: this.customActionTracks.get('P1_SHOOT') ?? null,
      ENEMY_SHOOT: this.customActionTracks.get('ENEMY_SHOOT') ?? null,
      P1_EXPLOSION: this.customActionTracks.get('P1_EXPLOSION') ?? null,
      ENEMY_EXPLOSION: this.customActionTracks.get('ENEMY_EXPLOSION') ?? null,
      BASE_EXPLOSION: this.customActionTracks.get('BASE_EXPLOSION') ?? null,
      STAGE_CLEAR: this.customActionTracks.get('STAGE_CLEAR') ?? null,
      GAME_OVER: this.customActionTracks.get('GAME_OVER') ?? null,
    };
  }

  public validateActionSoundFile(
    actionId: GameActionSoundId,
    file: { name: string; type: string; size: number }
  ): { ok: boolean; error?: string } {
    if (!this.canManageActionSounds()) {
      return {
        ok: false,
        error:
          'Từ chối truy cập: Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền tải lên hoặc thay thế âm thanh hành động.',
      };
    }

    const validSlot = GAME_ACTION_SOUND_SLOTS.find((s) => s.id === actionId);
    if (!validSlot) {
      return { ok: false, error: 'Mã hành động âm thanh không hợp lệ.' };
    }

    if (!file || !file.name) {
      return { ok: false, error: 'Vui lòng chọn file âm thanh hợp lệ.' };
    }

    const lowerName = file.name.toLowerCase();
    const hasAllowedExt = ALLOWED_ACTION_SFX_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasAudioMime = Boolean(file.type && file.type.startsWith('audio/'));
    if (!hasAllowedExt && !hasAudioMime) {
      return {
        ok: false,
        error: 'Định dạng không hỗ trợ. Chỉ chấp nhận file âm thanh (.mp3, .ogg, .wav, .m4a).',
      };
    }

    if (file.size <= 0) {
      return { ok: false, error: 'File âm thanh rỗng (0 byte).' };
    }

    if (file.size > MAX_ACTION_SFX_FILE_SIZE_BYTES) {
      return {
        ok: false,
        error: 'Dung lượng file vượt quá giới hạn 15 MB cho âm thanh hành động.',
      };
    }

    return { ok: true };
  }

  public uploadActionSoundSync(
    actionId: GameActionSoundId,
    file: { name: string; type: string; size: number; dataUrl?: string }
  ): { ok: boolean; error?: string; track?: CustomActionSoundTrack } {
    const check = this.validateActionSoundFile(actionId, file);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }

    const currentUser = AuthManager.getInstance().getCurrentUser();
    const durationSec = Math.max(0.15, Math.min(10, Number((file.size / 16000).toFixed(2))));
    const track: CustomActionSoundTrack = {
      actionId,
      fileName: file.name,
      mimeType: file.type || 'audio/mpeg',
      fileSizeBytes: file.size,
      durationSec,
      updatedAtMs: Date.now(),
      updatedByEmail: currentUser?.email || ADMIN_EMAIL,
      dataUrl: file.dataUrl,
    };

    this.customActionTracks.set(actionId, track);
    this.saveCustomActionTracksToStorage();
    this.notifyListeners();
    return { ok: true, track };
  }

  public replaceActionSoundSync(
    actionId: GameActionSoundId,
    file: { name: string; type: string; size: number; dataUrl?: string }
  ): { ok: boolean; error?: string; track?: CustomActionSoundTrack } {
    return this.uploadActionSoundSync(actionId, file);
  }

  public async uploadActionSound(
    actionId: GameActionSoundId,
    file: File
  ): Promise<{ ok: boolean; error?: string; track?: CustomActionSoundTrack }> {
    const check = this.validateActionSoundFile(actionId, file);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      let durationSec = 0.85;

      const ctx = this.initContext();
      if (ctx) {
        try {
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          durationSec = Number(decoded.duration.toFixed(2));
          this.customActionBuffers.set(actionId, decoded);
        } catch {
          durationSec = Math.max(0.15, Math.min(10, Number((file.size / 16000).toFixed(2))));
        }
      }

      let dataUrl: string | undefined;
      if (file.size <= 2.5 * 1024 * 1024) {
        dataUrl = await this.arrayBufferToDataUrl(
          arrayBuffer,
          file.type || 'audio/mpeg'
        );
      }

      const currentUser = AuthManager.getInstance().getCurrentUser();
      const track: CustomActionSoundTrack = {
        actionId,
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        fileSizeBytes: file.size,
        durationSec,
        updatedAtMs: Date.now(),
        updatedByEmail: currentUser?.email || ADMIN_EMAIL,
        dataUrl,
      };

      this.customActionTracks.set(actionId, track);
      this.saveCustomActionTracksToStorage();
      void this.syncCustomActionTracksToCloud();
      this.notifyListeners();

      return { ok: true, track };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || 'Không thể xử lý file âm thanh hành động.',
      };
    }
  }

  public async replaceActionSound(
    actionId: GameActionSoundId,
    file: File
  ): Promise<{ ok: boolean; error?: string; track?: CustomActionSoundTrack }> {
    return this.uploadActionSound(actionId, file);
  }

  public deleteActionSound(actionId: GameActionSoundId): { ok: boolean; error?: string } {
    if (!this.canManageActionSounds()) {
      return {
        ok: false,
        error:
          'Từ chối truy cập: Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền xóa âm thanh hành động.',
      };
    }

    this.customActionTracks.delete(actionId);
    this.customActionBuffers.delete(actionId);
    this.stopAllActiveActionSources();
    this.saveCustomActionTracksToStorage();
    void this.syncCustomActionTracksToCloud();
    this.notifyListeners();
    return { ok: true };
  }

  public previewActionSound(actionId: GameActionSoundId): void {
    switch (actionId) {
      case 'P1_SHOOT':
        this.playP1Shoot();
        break;
      case 'ENEMY_SHOOT':
        this.playEnemyShoot();
        break;
      case 'P1_EXPLOSION':
        this.playP1Explosion();
        break;
      case 'ENEMY_EXPLOSION':
        this.playEnemyExplosion();
        break;
      case 'BASE_EXPLOSION':
        this.playBaseExplosion();
        break;
      case 'STAGE_CLEAR':
        this.playStageClear();
        break;
      case 'GAME_OVER':
        this.playGameOver();
        break;
    }
  }

  private async arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
    if (typeof FileReader !== 'undefined' && typeof Blob !== 'undefined') {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(new Blob([buffer], { type: mimeType }));
      });
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = typeof btoa === 'function' ? btoa(binary) : '';
    return `data:${mimeType};base64,${b64}`;
  }

  private dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer | null {
    try {
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx === -1) return null;
      const b64 = dataUrl.slice(commaIdx + 1);
      const bin = typeof atob === 'function' ? atob(b64) : '';
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  private initCloudActionSfxSubscription(): void {
    if (typeof window === 'undefined') return;
    AuthManager.getInstance().subscribe((user) => {
      if (this.unsubCloudActionSfx) {
        this.unsubCloudActionSfx();
        this.unsubCloudActionSfx = null;
      }
      if (!user) return;
      try {
        const db = getFirebaseDb();
        const ref = doc(db, 'system_config', 'action_sfx');
        this.unsubCloudActionSfx = onSnapshot(
          ref,
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as {
              tracks?: Record<string, CustomActionSoundTrack>;
            };
            if (!data.tracks || typeof data.tracks !== 'object') return;
            for (const slot of GAME_ACTION_SOUND_SLOTS) {
              const incoming = data.tracks[slot.id];
              if (incoming && incoming.actionId === slot.id && incoming.fileName) {
                const existing = this.customActionTracks.get(slot.id);
                if (!existing || incoming.updatedAtMs > existing.updatedAtMs) {
                  this.customActionTracks.set(slot.id, incoming);
                  this.customActionBuffers.delete(slot.id);
                }
              }
            }
            this.saveCustomActionTracksToStorage();
            void this.hydrateCustomActionBuffers();
            this.notifyListeners();
          },
          () => {
            // Ignore transient snapshot errors
          }
        );
      } catch {
        // Ignore if Firestore is not initialized in test env
      }
    });
  }

  private async syncCustomActionTracksToCloud(): Promise<void> {
    if (typeof window === 'undefined' || !this.canManageActionSounds()) return;
    try {
      const db = getFirebaseDb();
      const tracksObj: Record<string, CustomActionSoundTrack> = {};
      for (const [id, track] of this.customActionTracks.entries()) {
        tracksObj[id] = track;
      }
      const nowMs = Date.now();
      await setDoc(doc(db, 'system_config', 'action_sfx'), {
        tracks: tracksObj,
        version: nowMs,
        updatedAt: nowMs,
        updatedBy: ADMIN_EMAIL,
      });
    } catch {
      // Fallback to localStorage if cloud write fails
    }
  }

  private loadCustomActionTracksFromStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.ACTION_SFX_TRACKS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CustomActionSoundTrack>;
      if (!parsed || typeof parsed !== 'object') return;
      for (const slot of GAME_ACTION_SOUND_SLOTS) {
        const track = parsed[slot.id];
        if (track && track.actionId === slot.id && track.fileName) {
          this.customActionTracks.set(slot.id, track);
        }
      }
    } catch {
      // ignore storage error
    }
  }

  private saveCustomActionTracksToStorage(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (ScoreManager.isGlobalTrialMode()) return;
    try {
      const serialized: Record<string, CustomActionSoundTrack> = {};
      for (const [id, track] of this.customActionTracks.entries()) {
        serialized[id] = track;
      }
      window.localStorage.setItem(STORAGE_KEYS.ACTION_SFX_TRACKS, JSON.stringify(serialized));
    } catch {
      // ignore quota error
    }
  }

  private async hydrateCustomActionBuffers(): Promise<void> {
    if (!this.ctx) return;
    for (const [id, track] of this.customActionTracks.entries()) {
      if (this.customActionBuffers.has(id) || !track.dataUrl) continue;
      const ab = this.dataUrlToArrayBuffer(track.dataUrl);
      if (!ab) continue;
      try {
        const decoded = await this.ctx.decodeAudioData(ab.slice(0));
        this.customActionBuffers.set(id, decoded);
      } catch {
        // ignore decode error
      }
    }
  }
}
