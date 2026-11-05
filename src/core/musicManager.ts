/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * MusicManager — Separated from Game Core & SFX System
 * Handles:
 * 1. Uploading, validating (MP3, OGG, WAV), storing, renaming, replacing, and deleting BGM tracks.
 * 2. Silence detection (Skip Silence) by scanning AudioBuffer samples at the start and end of a track
 *    without clipping intentional beats or instruments.
 * 3. Playback modes: Loop, Skip Silence, Seamless Loop, Crossfade (dual gain overlap), and safe fallback.
 * 4. Scope assignment & Priority hierarchy:
 *    - Priority 1 (Highest): Stage-specific assignment (e.g., Stage 1, Stage 2, Stage 3)
 *    - Priority 2: Game Mode assignment (e.g., SOLO, TWO_PLAYER)
 *    - Priority 3: Global Default assignment (ALL_GAME)
 *    - Priority 4: Built-in Procedural 8-Bit Arcade Default BGM (SoundManager fallback)
 * 5. Super Admin role access control vs Standard Player permissions.
 * 6. Storage Adapter Pattern ready to switch seamlessly from Local Storage / IndexedDB to Firebase Storage & Firestore.
 */

import { SoundManager } from './audio.ts';

export type SupportedAudioFormat = 'audio/mpeg' | 'audio/ogg' | 'audio/wav' | 'audio/x-wav' | 'audio/mp3';
export type UserRole = 'PLAYER' | 'SUPER_ADMIN';
export type GameModeScope = 'SOLO' | 'TWO_PLAYER';

export interface LoopPlaybackConfig {
  loop: boolean;
  skipSilence: boolean;
  seamlessLoop: boolean;
  crossfade: boolean;
  crossfadeDurationSec: number; // e.g., 0.3s to 3.0s
  silenceThresholdDb: number;   // Default -48 dB (~0.004 amplitude) to never cut real instruments
}

export interface SilenceTrimBounds {
  trimStartSec: number;
  trimEndSec: number;
  effectiveDurationSec: number;
  leadingSilenceDetectedSec: number;
  trailingSilenceDetectedSec: number;
}

export interface MusicTrackMetadata {
  id: string;
  displayName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  uploadedAt: number;
  sourceInfo?: {
    title?: string;
    author?: string;
    sourceUrl?: string;
    style?: string;
  };
  trimBounds: SilenceTrimBounds;
  isBuiltInDefault?: boolean;
  storageProvider: 'LOCAL_MEMORY_IDB' | 'FIREBASE_STORAGE_READY';
  storagePathOrUrl?: string;
}

export interface MusicScopeAssignments {
  globalTrackId: string | null; // Scope 1: Toàn bộ game
  modeTracks: Record<GameModeScope, string | null>; // Scope 2: Chế độ chơi (SOLO, TWO_PLAYER)
  stageTracks: Record<number, string | null>; // Scope 3: Stage cụ thể (1, 2, 3...)
}

export interface ValidationCheckResult {
  valid: boolean;
  error?: string;
  detectedFormat?: string;
}

const MUSIC_STORAGE_KEYS = {
  TRACKS_META: 'bantank_music_tracks_meta_v1',
  ASSIGNMENTS: 'bantank_music_assignments_v1',
  LOOP_CONFIG: 'bantank_music_loop_config_v1',
  USER_ROLE: 'bantank_user_role_v1',
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB max
const ALLOWED_EXTENSIONS = ['.mp3', '.ogg', '.wav'];
const ALLOWED_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
];

/**
 * Reference metadata for the user-selected Pixabay source track awaiting 8-bit MP3 upload
 */
export const PIXABAY_TARGET_TRACK_SPEC = {
  title: 'Gaming - Gaming Music (8-Bit Chiptune Target)',
  author: 'ikoliks_aj',
  durationText: '2:20',
  durationSec: 140,
  sourceUrl: 'https://pixabay.com/vi/music/tr%C3%B2-ch%C6%A1i-video-gaming-gaming-music-614619/',
  status: 'WAITING_FOR_CONVERTED_8BIT_FILE',
} as const;

export class MusicManager {
  private static instance: MusicManager | null = null;

  private tracks: Map<string, MusicTrackMetadata> = new Map();
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private rawBlobs: Map<string, ArrayBuffer> = new Map();

  private assignments: MusicScopeAssignments = {
    globalTrackId: null,
    modeTracks: {
      SOLO: null,
      TWO_PLAYER: null,
    },
    stageTracks: {},
  };

  private loopConfig: LoopPlaybackConfig = {
    loop: true,
    skipSilence: true,
    seamlessLoop: true,
    crossfade: true,
    crossfadeDurationSec: 0.8,
    silenceThresholdDb: -48,
  };

  private currentRole: UserRole = 'SUPER_ADMIN'; // Default in Admin/QA build so user can test immediately, toggleable

  // Playback runtime state
  private activeContext: { stageId: number; mode: GameModeScope } = { stageId: 1, mode: 'SOLO' };
  private activeTrackId: string | null = null;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private previewTrackId: string | null = null;

  // Web Audio nodes for custom track playback & crossfading
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private nextCrossfadeTimer: number | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  private listeners: Set<() => void> = new Set();

  private constructor() {
    this.loadPersistedState();
  }

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener error
      }
    });
  }

  // =========================================================================
  // ROLE & ACCESS CONTROL (RBAC)
  // =========================================================================

  public getUserRole(): UserRole {
    return this.currentRole;
  }

  public setUserRole(role: UserRole): void {
    this.currentRole = role;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(MUSIC_STORAGE_KEYS.USER_ROLE, role);
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  public canManageMusic(): boolean {
    return this.currentRole === 'SUPER_ADMIN';
  }

  // =========================================================================
  // FILE VALIDATION & SILENCE ANALYSIS
  // =========================================================================

  /**
   * Validates file extension, MIME type, size (> 0 and <= 25MB).
   */
  public static validateAudioFileBasic(file: {
    name: string;
    type: string;
    size: number;
  }): ValidationCheckResult {
    if (!file || !file.name) {
      return { valid: false, error: 'File không tồn tại hoặc thiếu tên file.' };
    }

    if (file.size <= 0) {
      return { valid: false, error: 'File rỗng (0 bytes).' };
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Dung lượng file vượt quá giới hạn cho phép (${(file.size / (1024 * 1024)).toFixed(1)}MB > 25MB).`,
      };
    }

    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const hasValidMime =
      !file.type || ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

    if (!hasValidExt || !hasValidMime) {
      return {
        valid: false,
        error: `Định dạng không hỗ trợ (${file.name}). Chỉ chấp nhận MP3, OGG hoặc WAV.`,
      };
    }

    const ext = ALLOWED_EXTENSIONS.find((e) => lowerName.endsWith(e))?.replace('.', '').toUpperCase() || 'AUDIO';
    return { valid: true, detectedFormat: ext };
  }

  /**
   * Analyzes an AudioBuffer to detect true digital silence at the start and end
   * without clipping intentional drum hits or low-volume instrument tails.
   */
  public static analyzeSilenceBounds(
    buffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    },
    thresholdDb: number = -48
  ): SilenceTrimBounds {
    const duration = buffer.duration;
    const sampleRate = buffer.sampleRate;
    const numChannels = buffer.numberOfChannels;

    if (duration <= 0.2 || sampleRate <= 0 || numChannels <= 0) {
      return {
        trimStartSec: 0,
        trimEndSec: duration,
        effectiveDurationSec: duration,
        leadingSilenceDetectedSec: 0,
        trailingSilenceDetectedSec: 0,
      };
    }

    // Convert dB threshold to linear amplitude (e.g. -48dB -> ~0.00398)
    const linearThreshold = Math.pow(10, thresholdDb / 20);
    const totalSamples = buffer.getChannelData(0).length;

    let firstActiveSample = 0;
    let lastActiveSample = totalSamples - 1;

    // Scan from start
    outerStart: for (let i = 0; i < totalSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > linearThreshold) {
          firstActiveSample = i;
          break outerStart;
        }
      }
    }

    // Scan from end
    outerEnd: for (let i = totalSamples - 1; i >= firstActiveSample; i--) {
      for (let ch = 0; ch < numChannels; ch++) {
        if (Math.abs(buffer.getChannelData(ch)[i]) > linearThreshold) {
          lastActiveSample = i;
          break outerEnd;
        }
      }
    }

    // Keep a small 15ms safety margin so transient attacks and natural decays are never clipped
    const safetySamples = Math.floor(sampleRate * 0.015);
    const safeStartSample = Math.max(0, firstActiveSample - safetySamples);
    const safeEndSample = Math.min(totalSamples - 1, lastActiveSample + safetySamples);

    const trimStartSec = Number((safeStartSample / sampleRate).toFixed(4));
    const trimEndSec = Number((safeEndSample / sampleRate).toFixed(4));
    const effectiveDurationSec = Math.max(0.1, Number((trimEndSec - trimStartSec).toFixed(4)));

    return {
      trimStartSec,
      trimEndSec,
      effectiveDurationSec,
      leadingSilenceDetectedSec: trimStartSec,
      trailingSilenceDetectedSec: Math.max(0, Number((duration - trimEndSec).toFixed(4))),
    };
  }

  // =========================================================================
  // TRACK UPLOAD, CRUD & LIBRARY MANAGEMENT
  // =========================================================================

  /**
   * Uploads and registers a validated audio track into the library.
   * Does NOT automatically replace the currently active BGM (per requirement VI.1).
   */
  public async uploadTrack(
    file: File,
    customDisplayName?: string,
    sourceInfo?: MusicTrackMetadata['sourceInfo']
  ): Promise<{ success: boolean; track?: MusicTrackMetadata; error?: string }> {
    if (!this.canManageMusic()) {
      return { success: false, error: 'Chỉ Super Admin mới có quyền tải nhạc nền lên hệ thống.' };
    }

    const basicCheck = MusicManager.validateAudioFileBasic(file);
    if (!basicCheck.valid) {
      return { success: false, error: basicCheck.error };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = SoundManager.getInstance().initContext();
      if (!ctx) {
        return { success: false, error: 'Không thể khởi tạo bộ giải mã Web Audio API.' };
      }

      // Clone buffer because decodeAudioData detaches the input ArrayBuffer
      const bufferCopy = arrayBuffer.slice(0);
      const decodedBuffer = await ctx.decodeAudioData(bufferCopy);

      if (!decodedBuffer || decodedBuffer.duration <= 0) {
        return { success: false, error: 'File âm thanh bị lỗi hoặc không có thời lượng hợp lệ.' };
      }

      const trimBounds = MusicManager.analyzeSilenceBounds(
        decodedBuffer,
        this.loopConfig.silenceThresholdDb
      );

      const id = `bgm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cleanName =
        customDisplayName?.trim() ||
        file.name.replace(/\.(mp3|ogg|wav)$/i, '');

      const metadata: MusicTrackMetadata = {
        id,
        displayName: cleanName,
        fileName: file.name,
        mimeType: file.type || 'audio/mpeg',
        sizeBytes: file.size,
        durationSec: Number(decodedBuffer.duration.toFixed(2)),
        uploadedAt: Date.now(),
        sourceInfo,
        trimBounds,
        storageProvider: 'LOCAL_MEMORY_IDB',
      };

      this.tracks.set(id, metadata);
      this.audioBuffers.set(id, decodedBuffer);
      this.rawBlobs.set(id, arrayBuffer);

      this.savePersistedState();
      this.notify();

      return { success: true, track: metadata };
    } catch (err) {
      return {
        success: false,
        error: 'File âm thanh bị hỏng hoặc không đúng chuẩn mã hóa MP3/OGG/WAV.',
      };
    }
  }

  /**
   * Registers a pre-decoded or synthetic AudioBuffer track (used for automated tests and local assets).
   * Does NOT automatically replace active BGM.
   */
  public registerDecodedTrack(params: {
    id?: string;
    displayName: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    audioBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    };
    sourceInfo?: MusicTrackMetadata['sourceInfo'];
  }): { success: boolean; track?: MusicTrackMetadata; error?: string } {
    if (!this.canManageMusic()) {
      return { success: false, error: 'Chỉ Super Admin mới có quyền thêm nhạc nền.' };
    }

    const check = MusicManager.validateAudioFileBasic({
      name: params.fileName,
      type: params.mimeType,
      size: params.sizeBytes,
    });
    if (!check.valid) {
      return { success: false, error: check.error };
    }

    const trimBounds = MusicManager.analyzeSilenceBounds(
      params.audioBuffer,
      this.loopConfig.silenceThresholdDb
    );

    const id = params.id ?? `bgm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const metadata: MusicTrackMetadata = {
      id,
      displayName: params.displayName,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      durationSec: Number(params.audioBuffer.duration.toFixed(2)),
      uploadedAt: Date.now(),
      sourceInfo: params.sourceInfo,
      trimBounds,
      storageProvider: 'LOCAL_MEMORY_IDB',
    };

    this.tracks.set(id, metadata);
    if (typeof AudioBuffer !== 'undefined' && params.audioBuffer instanceof AudioBuffer) {
      this.audioBuffers.set(id, params.audioBuffer);
    }

    this.savePersistedState();
    this.notify();
    return { success: true, track: metadata };
  }

  /**
   * Renames the display name of an uploaded track.
   */
  public renameTrack(trackId: string, newDisplayName: string): boolean {
    if (!this.canManageMusic()) return false;
    const track = this.tracks.get(trackId);
    if (!track || !newDisplayName.trim()) return false;

    track.displayName = newDisplayName.trim();
    this.tracks.set(trackId, { ...track });
    this.savePersistedState();
    this.notify();
    return true;
  }

  /**
   * Replaces the audio file of an existing track ID while preserving its scope assignments.
   */
  public async replaceTrackFile(
    trackId: string,
    newFile: File
  ): Promise<{ success: boolean; track?: MusicTrackMetadata; error?: string }> {
    if (!this.canManageMusic()) {
      return { success: false, error: 'Chỉ Super Admin mới có quyền thay thế file nhạc.' };
    }

    const existing = this.tracks.get(trackId);
    if (!existing) {
      return { success: false, error: 'Không tìm thấy bài nhạc cần thay thế.' };
    }

    const basicCheck = MusicManager.validateAudioFileBasic(newFile);
    if (!basicCheck.valid) {
      return { success: false, error: basicCheck.error };
    }

    try {
      const arrayBuffer = await newFile.arrayBuffer();
      const ctx = SoundManager.getInstance().initContext();
      if (!ctx) {
        return { success: false, error: 'Không thể khởi tạo Web Audio API.' };
      }

      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const trimBounds = MusicManager.analyzeSilenceBounds(
        decodedBuffer,
        this.loopConfig.silenceThresholdDb
      );

      const updated: MusicTrackMetadata = {
        ...existing,
        fileName: newFile.name,
        mimeType: newFile.type || 'audio/mpeg',
        sizeBytes: newFile.size,
        durationSec: Number(decodedBuffer.duration.toFixed(2)),
        uploadedAt: Date.now(),
        trimBounds,
      };

      this.tracks.set(trackId, updated);
      this.audioBuffers.set(trackId, decodedBuffer);
      this.rawBlobs.set(trackId, arrayBuffer);

      // If this track is currently playing, restart it cleanly with the new buffer
      if (this.activeTrackId === trackId && this.isPlaying) {
        this.stopAllCustomSources();
        this.startTrackBufferPlayback(trackId);
      }

      this.savePersistedState();
      this.notify();
      return { success: true, track: updated };
    } catch {
      return { success: false, error: 'File thay thế bị lỗi giải mã âm thanh.' };
    }
  }

  /**
   * Replaces a track's metadata/buffer synchronously (for tests or pre-decoded assets).
   */
  public replaceDecodedTrack(
    trackId: string,
    params: {
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      audioBuffer: {
        duration: number;
        sampleRate: number;
        numberOfChannels: number;
        getChannelData: (channel: number) => Float32Array;
      };
    }
  ): boolean {
    if (!this.canManageMusic()) return false;
    const existing = this.tracks.get(trackId);
    if (!existing) return false;

    const check = MusicManager.validateAudioFileBasic({
      name: params.fileName,
      type: params.mimeType,
      size: params.sizeBytes,
    });
    if (!check.valid) return false;

    const trimBounds = MusicManager.analyzeSilenceBounds(
      params.audioBuffer,
      this.loopConfig.silenceThresholdDb
    );

    const updated: MusicTrackMetadata = {
      ...existing,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      durationSec: Number(params.audioBuffer.duration.toFixed(2)),
      uploadedAt: Date.now(),
      trimBounds,
    };

    this.tracks.set(trackId, updated);
    this.savePersistedState();
    this.notify();
    return true;
  }

  /**
   * Deletes a track from the library and cleans up any scope assignments pointing to it.
   */
  public deleteTrack(trackId: string): boolean {
    if (!this.canManageMusic()) return false;
    if (!this.tracks.has(trackId)) return false;

    // Clean up assignments referencing this track
    if (this.assignments.globalTrackId === trackId) {
      this.assignments.globalTrackId = null;
    }
    if (this.assignments.modeTracks.SOLO === trackId) {
      this.assignments.modeTracks.SOLO = null;
    }
    if (this.assignments.modeTracks.TWO_PLAYER === trackId) {
      this.assignments.modeTracks.TWO_PLAYER = null;
    }
    for (const stageKey of Object.keys(this.assignments.stageTracks)) {
      const stNum = Number(stageKey);
      if (this.assignments.stageTracks[stNum] === trackId) {
        delete this.assignments.stageTracks[stNum];
      }
    }

    if (this.previewTrackId === trackId) {
      this.stopPreview();
    }

    this.tracks.delete(trackId);
    this.audioBuffers.delete(trackId);
    this.rawBlobs.delete(trackId);

    // If deleted track was actively playing, resolve fallback immediately
    if (this.activeTrackId === trackId) {
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    }

    this.savePersistedState();
    this.notify();
    return true;
  }

  public getTracks(): MusicTrackMetadata[] {
    return Array.from(this.tracks.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  public getTrackById(trackId: string): MusicTrackMetadata | undefined {
    return this.tracks.get(trackId);
  }

  // =========================================================================
  // LOOP, SKIP SILENCE & CROSSFADE CONFIGURATION
  // =========================================================================

  public getLoopConfig(): LoopPlaybackConfig {
    return { ...this.loopConfig };
  }

  public updateLoopConfig(partial: Partial<LoopPlaybackConfig>): boolean {
    if (!this.canManageMusic()) return false;

    const clampedCrossfade =
      partial.crossfadeDurationSec !== undefined
        ? Math.max(0.05, Math.min(5.0, partial.crossfadeDurationSec))
        : this.loopConfig.crossfadeDurationSec;

    this.loopConfig = {
      ...this.loopConfig,
      ...partial,
      crossfadeDurationSec: clampedCrossfade,
    };

    // If active custom track is playing, apply updated loop settings
    if (this.activeTrackId && this.isPlaying && !this.isPaused) {
      this.stopAllCustomSources();
      this.startTrackBufferPlayback(this.activeTrackId);
    }

    this.savePersistedState();
    this.notify();
    return true;
  }

  // =========================================================================
  // SCOPE ASSIGNMENTS & PRIORITY RESOLUTION
  // Priority 1: Stage Specific -> Priority 2: Game Mode -> Priority 3: Global -> Priority 4: Built-in
  // =========================================================================

  public getAssignments(): MusicScopeAssignments {
    return {
      globalTrackId: this.assignments.globalTrackId,
      modeTracks: { ...this.assignments.modeTracks },
      stageTracks: { ...this.assignments.stageTracks },
    };
  }

  public assignToGlobal(trackId: string | null): boolean {
    if (!this.canManageMusic()) return false;
    if (trackId !== null && !this.tracks.has(trackId)) return false;

    this.assignments.globalTrackId = trackId;
    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();
    return true;
  }

  public assignToMode(mode: GameModeScope, trackId: string | null): boolean {
    if (!this.canManageMusic()) return false;
    if (trackId !== null && !this.tracks.has(trackId)) return false;

    this.assignments.modeTracks[mode] = trackId;
    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();
    return true;
  }

  public assignToStage(stageId: number, trackId: string | null): boolean {
    if (!this.canManageMusic()) return false;
    if (trackId !== null && !this.tracks.has(trackId)) return false;

    if (trackId === null) {
      delete this.assignments.stageTracks[stageId];
    } else {
      this.assignments.stageTracks[stageId] = trackId;
    }
    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();
    return true;
  }

  public resetAllAssignmentsToDefault(): boolean {
    if (!this.canManageMusic()) return false;
    this.assignments = {
      globalTrackId: null,
      modeTracks: { SOLO: null, TWO_PLAYER: null },
      stageTracks: {},
    };
    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();
    return true;
  }

  /**
   * Resolves which track should play for a given (stageId, mode) according to the strict priority rule:
   * 1. Stage-specific track (highest priority)
   * 2. Game Mode track
   * 3. Global game track
   * 4. Built-in default procedural BGM (returns trackId: null, source: 'BUILTIN_DEFAULT')
   */
  public resolveEffectiveTrack(
    stageId: number = this.activeContext.stageId,
    mode: GameModeScope = this.activeContext.mode
  ): {
    trackId: string | null;
    track: MusicTrackMetadata | null;
    resolvedScope: 'STAGE' | 'MODE' | 'GLOBAL' | 'BUILTIN_DEFAULT';
  } {
    // 1. Check Stage-specific assignment
    const stageTrackId = this.assignments.stageTracks[stageId];
    if (stageTrackId && this.tracks.has(stageTrackId)) {
      return {
        trackId: stageTrackId,
        track: this.tracks.get(stageTrackId)!,
        resolvedScope: 'STAGE',
      };
    }

    // 2. Check Game Mode assignment
    const modeTrackId = this.assignments.modeTracks[mode];
    if (modeTrackId && this.tracks.has(modeTrackId)) {
      return {
        trackId: modeTrackId,
        track: this.tracks.get(modeTrackId)!,
        resolvedScope: 'MODE',
      };
    }

    // 3. Check Global All-Game assignment
    const globalTrackId = this.assignments.globalTrackId;
    if (globalTrackId && this.tracks.has(globalTrackId)) {
      return {
        trackId: globalTrackId,
        track: this.tracks.get(globalTrackId)!,
        resolvedScope: 'GLOBAL',
      };
    }

    // 4. Built-in Default BGM
    return {
      trackId: null,
      track: null,
      resolvedScope: 'BUILTIN_DEFAULT',
    };
  }

  /**
   * Returns a human-readable list of scopes where a given trackId is currently assigned.
   */
  public getTrackUsageLabels(trackId: string): string[] {
    const labels: string[] = [];
    if (this.assignments.globalTrackId === trackId) {
      labels.push('Mặc định Toàn Game');
    }
    if (this.assignments.modeTracks.SOLO === trackId) {
      labels.push('Chế độ Solo (1P)');
    }
    if (this.assignments.modeTracks.TWO_PLAYER === trackId) {
      labels.push('Chế độ 2 Người Chơi');
    }
    for (const [stageStr, assignedId] of Object.entries(this.assignments.stageTracks)) {
      if (assignedId === trackId) {
        labels.push(`Stage ${stageStr}`);
      }
    }
    return labels;
  }

  // =========================================================================
  // PLAYBACK ENGINE (SEAMLESS LOOP, SKIP SILENCE, CROSSFADE & ANTI-OVERLAP)
  // =========================================================================

  /**
   * Synchronizes BGM playback when transitioning stages or changing modes.
   * Guarantees zero overlapping BGM instances.
   */
  public syncPlaybackWithContext(
    stageId: number,
    mode: GameModeScope = 'SOLO'
  ): void {
    this.activeContext = { stageId, mode };
    const resolved = this.resolveEffectiveTrack(stageId, mode);
    const soundManager = SoundManager.getInstance();
    const audioSettings = soundManager.getSettings();

    this.activeTrackId = resolved.trackId;

    if (!audioSettings.bgmEnabled || this.isPaused) {
      this.stopAllCustomSources();
      soundManager.pauseBgm();
      this.isPlaying = false;
      this.notify();
      return;
    }

    // If a custom track is resolved AND we have its decoded AudioBuffer
    if (resolved.trackId && this.audioBuffers.has(resolved.trackId)) {
      // Stop procedural BGM so two BGM tracks never overlap
      soundManager.pauseBgm();
      this.stopAllCustomSources();
      this.isPlaying = true;
      this.startTrackBufferPlayback(resolved.trackId);
    } else {
      // Fallback safely to built-in procedural BGM
      this.stopAllCustomSources();
      this.isPlaying = true;
      soundManager.resumeBgm();
    }

    this.notify();
  }

  private startTrackBufferPlayback(trackId: string, withFadeIn: boolean = false): void {
    const buffer = this.audioBuffers.get(trackId);
    const meta = this.tracks.get(trackId);
    const soundManager = SoundManager.getInstance();
    const ctx = soundManager.initContext();

    if (!buffer || !meta || !ctx) {
      // Safe fallback if buffer is unavailable
      soundManager.resumeBgm();
      return;
    }

    const startOffset = this.loopConfig.skipSilence ? meta.trimBounds.trimStartSec : 0;
    const endOffset = this.loopConfig.skipSilence ? meta.trimBounds.trimEndSec : buffer.duration;
    const playDuration = Math.max(0.1, endOffset - startOffset);

    try {
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      const targetVol = soundManager.getSettings().bgmEnabled
        ? soundManager.getSettings().bgmVolume
        : 0;

      const now = ctx.currentTime;

      // Apply smooth crossfade if enabled and loop duration is long enough
      const canCrossfade =
        this.loopConfig.loop &&
        this.loopConfig.crossfade &&
        playDuration > this.loopConfig.crossfadeDurationSec * 2.2;

      if (canCrossfade) {
        const fadeSec = this.loopConfig.crossfadeDurationSec;
        if (withFadeIn) {
          gainNode.gain.setValueAtTime(0.001, now);
          gainNode.gain.linearRampToValueAtTime(targetVol, now + fadeSec);
        } else {
          gainNode.gain.setValueAtTime(targetVol, now);
        }

        // Schedule fade-out at end of playDuration
        const fadeOutStart = now + playDuration - fadeSec;
        gainNode.gain.setValueAtTime(targetVol, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.001, now + playDuration);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(now, startOffset, playDuration);
        this.activeSources.add(source);
        this.currentSource = source;
        this.currentGain = gainNode;

        // Schedule next iteration slightly before end for seamless crossfade overlap
        if (this.nextCrossfadeTimer !== null) {
          window.clearTimeout(this.nextCrossfadeTimer);
        }
        const nextTriggerMs = Math.max(50, (playDuration - fadeSec) * 1000);
        this.nextCrossfadeTimer = window.setTimeout(() => {
          if (this.isPlaying && !this.isPaused && this.activeTrackId === trackId) {
            this.startTrackBufferPlayback(trackId, true);
          }
        }, nextTriggerMs);
      } else {
        // Native Web Audio hardware-accurate seamless loop with loopStart / loopEnd
        gainNode.gain.setValueAtTime(targetVol, now);
        source.loop = this.loopConfig.loop;
        if (this.loopConfig.loop && this.loopConfig.seamlessLoop) {
          source.loopStart = startOffset;
          source.loopEnd = endOffset;
        }

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        if (this.loopConfig.loop) {
          source.start(now, startOffset);
        } else {
          source.start(now, startOffset, playDuration);
        }

        this.activeSources.add(source);
        this.currentSource = source;
        this.currentGain = gainNode;
      }

      source.onended = () => {
        this.activeSources.delete(source);
      };
    } catch {
      // Safe fallback on any browser Web Audio error
      soundManager.resumeBgm();
    }
  }

  public stopAllCustomSources(): void {
    if (this.nextCrossfadeTimer !== null) {
      window.clearTimeout(this.nextCrossfadeTimer);
      this.nextCrossfadeTimer = null;
    }
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources.clear();
    this.currentSource = null;
    this.currentGain = null;
  }

  public pause(): void {
    this.isPaused = true;
    this.isPlaying = false;
    this.stopAllCustomSources();
    SoundManager.getInstance().pauseBgm();
    this.notify();
  }

  public resume(): void {
    this.isPaused = false;
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
  }

  public onVolumeOrToggleChanged(): void {
    const settings = SoundManager.getInstance().getSettings();
    if (!settings.bgmEnabled) {
      this.stopAllCustomSources();
      this.isPlaying = false;
      return;
    }
    if (this.currentGain && this.currentSource) {
      const ctx = SoundManager.getInstance().initContext();
      if (ctx) {
        this.currentGain.gain.setValueAtTime(settings.bgmVolume, ctx.currentTime);
      }
    } else if (!this.isPaused) {
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    }
  }

  /**
   * Preview a specific track in the Admin Manager without changing scope assignments.
   */
  public previewTrack(trackId: string): boolean {
    if (!this.tracks.has(trackId)) return false;
    SoundManager.getInstance().unlock();
    SoundManager.getInstance().pauseBgm();
    this.stopAllCustomSources();

    this.previewTrackId = trackId;
    if (this.audioBuffers.has(trackId)) {
      this.isPlaying = true;
      this.startTrackBufferPlayback(trackId, false);
    }
    this.notify();
    return true;
  }

  public stopPreview(): void {
    this.previewTrackId = null;
    this.stopAllCustomSources();
    if (!this.isPaused) {
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    }
    this.notify();
  }

  public getPreviewTrackId(): string | null {
    return this.previewTrackId;
  }

  /**
   * Returns count of simultaneously active custom BGM sources (for anti-overlap verification).
   */
  public getActiveSourceCount(): number {
    return this.activeSources.size;
  }

  // =========================================================================
  // PERSISTENCE (LocalStorage Metadata + Ready for Firebase Firestore/Storage)
  // =========================================================================

  private loadPersistedState(): void {
    if (typeof window === 'undefined') return;
    try {
      const roleStr = localStorage.getItem(MUSIC_STORAGE_KEYS.USER_ROLE);
      if (roleStr === 'PLAYER' || roleStr === 'SUPER_ADMIN') {
        this.currentRole = roleStr;
      }

      const configStr = localStorage.getItem(MUSIC_STORAGE_KEYS.LOOP_CONFIG);
      if (configStr) {
        const parsed = JSON.parse(configStr);
        this.loopConfig = { ...this.loopConfig, ...parsed };
      }

      const assignStr = localStorage.getItem(MUSIC_STORAGE_KEYS.ASSIGNMENTS);
      if (assignStr) {
        const parsed = JSON.parse(assignStr);
        this.assignments = {
          globalTrackId: parsed.globalTrackId ?? null,
          modeTracks: {
            SOLO: parsed.modeTracks?.SOLO ?? null,
            TWO_PLAYER: parsed.modeTracks?.TWO_PLAYER ?? null,
          },
          stageTracks: parsed.stageTracks ?? {},
        };
      }
    } catch {
      // ignore storage errors
    }
  }

  private savePersistedState(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(MUSIC_STORAGE_KEYS.LOOP_CONFIG, JSON.stringify(this.loopConfig));
      localStorage.setItem(MUSIC_STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(this.assignments));
      const metaArray = Array.from(this.tracks.values());
      localStorage.setItem(MUSIC_STORAGE_KEYS.TRACKS_META, JSON.stringify(metaArray));
    } catch {
      // ignore quota errors
    }
  }
}
