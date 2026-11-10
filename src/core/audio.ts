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

const STORAGE_KEYS = {
  BGM_ENABLED: 'bantank_bgm_enabled',
  SFX_ENABLED: 'bantank_sfx_enabled',
  BGM_VOL: 'bantank_bgm_vol',
  SFX_VOL: 'bantank_sfx_vol',
};

export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  private settings: AudioSettings = {
    bgmEnabled: true,
    sfxEnabled: true,
    bgmVolume: 0.35,
    sfxVolume: 0.5,
  };

  private isUnlocked: boolean = false;
  private isBgmPlaying: boolean = false;
  private customBgmActive: boolean = false;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;
  private processedEventIds: Set<string> = new Set();
  private noiseBuffer: AudioBuffer | null = null;

  private constructor() {
    this.loadSettings();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
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
    } catch {
      // LocalStorage fallback default
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.BGM_ENABLED, String(this.settings.bgmEnabled));
      localStorage.setItem(STORAGE_KEYS.SFX_ENABLED, String(this.settings.sfxEnabled));
      localStorage.setItem(STORAGE_KEYS.BGM_VOL, String(this.settings.bgmVolume));
      localStorage.setItem(STORAGE_KEYS.SFX_VOL, String(this.settings.sfxVolume));
    } catch {
      // ignore
    }
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();
    this.applyVolume();

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
    if (this.bgmGain) {
      const targetBgm = this.settings.bgmEnabled ? this.settings.bgmVolume : 0;
      this.bgmGain.gain.setValueAtTime(targetBgm, now);
    }
    if (this.sfxGain) {
      const targetSfx = this.settings.sfxEnabled ? this.settings.sfxVolume : 0;
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

  // =========================================================================
  // SOUND EFFECTS (SFX)
  // =========================================================================

  /**
   * 1. Player 1 Cannon Fire: snappy retro square laser pulse (880Hz -> 220Hz, 70ms)
   */
  public playP1Shoot(): void {
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain || !this.noiseBuffer) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain) return;
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
    if (!this.settings.sfxEnabled || !this.ctx || !this.sfxGain) return;
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

  public startBgm(): void {
    if (!this.settings.bgmEnabled || this.isBgmPlaying || this.customBgmActive) return;
    this.initContext();
    if (!this.ctx || this.ctx.state !== 'running') return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;
    this.scheduleNextBgmStep();
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
}
