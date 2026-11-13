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

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  getBytes,
  deleteObject,
} from 'firebase/storage';
import { SoundManager } from './audio.ts';
import {
  ADMIN_EMAIL,
  SUPER_ADMIN_EMAIL,
  isAdminUser,
  isSuperAdminUser,
  validatePersonalGmailUser,
  type ValidatedUserAccount,
} from './authManager.ts';
import { getFirebaseDb, getFirebaseStorage } from './firebaseConfig.ts';
import type { User } from 'firebase/auth';

export type SupportedAudioFormat = 'audio/mpeg' | 'audio/ogg' | 'audio/wav' | 'audio/x-wav' | 'audio/mp3';
export type UserRole = 'PLAYER' | 'MOD' | 'ADMIN';
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
  storageProvider: 'LOCAL_MEMORY_IDB' | 'GITHUB_PAGES_STATIC' | 'FIREBASE_STORAGE_READY';
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

/**
 * Tài liệu cấu hình nhạc nền chung lưu trên Firestore tại `/system_config/audio` (M7.3.3).
 * - Chỉ lưu đường dẫn tương đối an toàn trong thư mục `audio/` (`assetPath`), tên file, định dạng,
 *   dung lượng, phiên bản và trạng thái kích hoạt.
 * - Tuyệt đối KHÔNG lưu `downloadURL`, URL chứa capability token hoặc nội dung Base64.
 */
export interface SystemAudioConfigDocument {
  assetPath: string; // Ví dụ: "audio/bgm_v1_bantank_theme.mp3" hoặc "sound_catalog/snd_1/v1/bgm_v1_theme.mp3"
  storagePath?: string | null;
  soundId?: string | null;
  audioDataUrl?: string | null;
  fileName: string;  // Ví dụ: "bgm_v1_bantank_theme.mp3"
  contentType: string;
  fileSize: number;
  updatedAt: number;
  updatedBy: string;
  version: number;
  isEnabled: boolean;
  displayName?: string;
  durationSec?: number;
  trimStartSec?: number | null;
  trimEndSec?: number | null;
  loopGapMs?: number;
  fadeOutMs?: number;
}

export interface SoundCatalogEntry {
  soundId: string;
  displayName: string;
  fileName: string;
  storagePath: string;
  audioDataUrl?: string | null;
  contentType: string;
  fileSize: number;
  category: 'BGM' | 'SFX';
  actionSlot?: string | null;
  durationSec: number;
  trimStartSec: number;
  trimEndSec: number;
  version: number;
  isActive: boolean;
  updatedAt: number;
  updatedBy: string;
}

/**
 * Gói tài nguyên nhạc đã được kiểm tra định dạng, dung lượng, giải mã thử và chuẩn hóa tên file
 * để Admin đưa vào thư mục `public/audio/` hoặc upload lên Firebase Storage.
 */
export interface StagedAudioPackage {
  originalFileName: string;
  normalizedFileName: string;
  displayName: string;
  assetPath: string;      // "audio/<normalizedFileName>"
  repositoryPath: string; // "public/audio/<normalizedFileName>"
  distPath: string;       // "dist/audio/<normalizedFileName>"
  runtimeUrl: string;     // "./audio/<normalizedFileName>?v=<targetVersion>"
  contentType: string;
  fileSize: number;
  detectedFormat: string;
  durationSec: number;
  trimBounds: SilenceTrimBounds;
  targetVersion: number;
  stagedAt: number;
}

export interface SharedMusicCloudAdapter {
  uploadAudioBinary(
    assetPath: string,
    data: ArrayBuffer | Uint8Array,
    contentType: string
  ): Promise<{ assetPath: string }>;
  deleteAudioBinary(assetPath: string): Promise<void>;
  fetchAudioBinary(assetPath: string, version: number): Promise<ArrayBuffer>;
  getSystemAudioConfig(): Promise<SystemAudioConfigDocument | null>;
  saveSystemAudioConfig(config: SystemAudioConfigDocument): Promise<void>;
  deleteSystemAudioConfig(): Promise<void>;
  subscribeSystemAudioConfig(
    onUpdate: (config: SystemAudioConfigDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void;
  listSoundCatalog?(): Promise<SoundCatalogEntry[]>;
  saveSoundCatalogEntry?(entry: SoundCatalogEntry): Promise<void>;
  deleteSoundCatalogEntry?(soundId: string): Promise<void>;
  subscribeSoundCatalog?(
    onUpdate: (entries: SoundCatalogEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void;
}

export const SHARED_SYSTEM_BGM_ID = 'shared_system_bgm';
export const STAGED_LOCAL_PREVIEW_BGM_ID = 'staged_local_preview_bgm';
export const SAFE_AUDIO_ASSET_DIR_PREFIX = 'audio/';
export const SOUND_CATALOG_STORAGE_PREFIX = 'sound_catalog/';

const SAFE_AUDIO_FILENAME_REGEX = /^[A-Za-z0-9._-]+\.(mp3|ogg|wav)$/;
const SAFE_AUDIO_ASSET_PATH_REGEX = /^audio\/([A-Za-z0-9._-]+\.(mp3|ogg|wav))$/;

/**
 * Kiểm tra đường dẫn tương đối của file nhạc nền (M7.3.3 Mục 3):
 * - Chỉ cho phép truy cập bên trong thư mục `audio/` (`audio/<fileName>.(mp3|ogg|wav)`).
 * - Từ chối tuyệt đối `..`, `\`, `//`, đường dẫn tuyệt đối `/`, giao thức `http:` / `https:` / `data:`,
 *   hoặc chuỗi chứa query/capability token (`?`, `&`, `token=`).
 */
export function validateSafeAudioAssetPath(
  assetPath: unknown,
  expectedFileName?: string
): {
  valid: boolean;
  normalizedAssetPath?: string;
  normalizedFileName?: string;
  fileName?: string;
  error?: string;
} {
  if (typeof assetPath !== 'string' || assetPath.length < 11 || assetPath.length > 300) {
    return {
      valid: false,
      error: 'Đường dẫn nhạc không hợp lệ (bắt buộc là chuỗi tương đối từ 11 đến 300 ký tự).',
    };
  }

  if (
    assetPath.includes('..') ||
    assetPath.includes('\\') ||
    assetPath.includes('//') ||
    assetPath.startsWith('/') ||
    assetPath.includes(':') ||
    assetPath.includes('?') ||
    assetPath.includes('#') ||
    assetPath.toLowerCase().includes('token=')
  ) {
    return {
      valid: false,
      error: 'Đường dẫn nhạc chứa ký tự hoặc giao thức bị cấm. Chỉ cho phép đường dẫn tương đối trong thư mục audio/.',
    };
  }

  const match = SAFE_AUDIO_ASSET_PATH_REGEX.exec(assetPath);
  if (!match) {
    return {
      valid: false,
      error: 'Đường dẫn nhạc phải nằm trực tiếp trong thư mục audio/ và có đuôi .mp3, .ogg hoặc .wav.',
    };
  }

  const extractedFileName = match[1];
  if (
    extractedFileName.length < 5 ||
    extractedFileName.length > 255 ||
    !SAFE_AUDIO_FILENAME_REGEX.test(extractedFileName)
  ) {
    return {
      valid: false,
      error: 'Tên file nhạc trong đường dẫn không hợp lệ.',
    };
  }

  if (expectedFileName !== undefined && extractedFileName !== expectedFileName) {
    return {
      valid: false,
      error: `Đường dẫn assetPath (${assetPath}) không khớp với fileName (${expectedFileName}).`,
    };
  }

  return {
    valid: true,
    normalizedAssetPath: assetPath,
    normalizedFileName: extractedFileName,
    fileName: extractedFileName,
  };
}

const SAFE_SOUND_CATALOG_STORAGE_PATH_REGEX =
  /^sound_catalog\/([A-Za-z0-9_-]+)\/v([1-9][0-9]*)\/([A-Za-z0-9._-]+\.(mp3|ogg|wav|m4a|aac|webm))$/;

export function validateSafeAudioOrStoragePath(
  assetOrStoragePath: unknown,
  expectedFileName?: string
): {
  valid: boolean;
  normalizedAssetPath?: string;
  normalizedFileName?: string;
  isStorageCatalogPath?: boolean;
  error?: string;
} {
  if (typeof assetOrStoragePath !== 'string' || assetOrStoragePath.length < 6 || assetOrStoragePath.length > 300) {
    return {
      valid: false,
      error: 'Đường dẫn âm thanh không hợp lệ.',
    };
  }
  if (
    assetOrStoragePath.includes('..') ||
    assetOrStoragePath.includes('\\') ||
    assetOrStoragePath.includes('//') ||
    assetOrStoragePath.startsWith('/') ||
    assetOrStoragePath.includes(':') ||
    assetOrStoragePath.includes('?') ||
    assetOrStoragePath.includes('#') ||
    assetOrStoragePath.toLowerCase().includes('token=')
  ) {
    return {
      valid: false,
      error: 'Đường dẫn âm thanh chứa ký tự hoặc giao thức bị cấm.',
    };
  }
  const storageMatch = SAFE_SOUND_CATALOG_STORAGE_PATH_REGEX.exec(assetOrStoragePath);
  if (storageMatch) {
    const extractedFile = storageMatch[3];
    if (expectedFileName !== undefined && extractedFile !== expectedFileName) {
      return {
        valid: false,
        error: `Đường dẫn Storage (${assetOrStoragePath}) không khớp với fileName (${expectedFileName}).`,
      };
    }
    return {
      valid: true,
      normalizedAssetPath: assetOrStoragePath,
      normalizedFileName: extractedFile,
      isStorageCatalogPath: true,
    };
  }
  const staticCheck = validateSafeAudioAssetPath(assetOrStoragePath, expectedFileName);
  if (staticCheck.valid) {
    return {
      ...staticCheck,
      isStorageCatalogPath: false,
    };
  }
  return staticCheck;
}

/**
 * Chuẩn hóa tên file nhạc do Super Admin chọn thành tên file an toàn cho `public/audio/` và GitHub Pages.
 */
export function normalizeSafeAudioFileName(
  rawFileName: string,
  version: number = 1
): string {
  const trimmed = (rawFileName || '').trim();
  const extMatch = /\.(mp3|ogg|wav)$/i.exec(trimmed);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
  const rawBase = extMatch ? trimmed.slice(0, trimmed.length - extMatch[0].length) : trimmed;

  const safeSlug =
    rawBase
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 80) || 'bantank_bgm';

  const safeVersion = Math.max(1, Math.floor(version));
  const prefix = `bgm_v${safeVersion}_`;
  const withoutOldPrefix = safeSlug.replace(/^bgm_v\d+_/i, '') || 'bantank_bgm';
  return `${prefix}${withoutOldPrefix}.${ext}`;
}

/**
 * Tạo URL tương đối tải nhạc từ GitHub Pages kèm tham số cache-busting `?v=<version>` (M7.3.3 Mục 3).
 */
export function buildGitHubPagesAudioUrl(assetPath: string, version: number): string {
  const check = validateSafeAudioAssetPath(assetPath);
  if (!check.valid || !check.normalizedAssetPath) {
    throw new Error(check.error || 'Đường dẫn nhạc không an toàn.');
  }
  const safeVersion = Number.isInteger(version) && version >= 1 ? version : 1;
  return `./${check.normalizedAssetPath}?v=${safeVersion}`;
}

/**
 * Phân loại lỗi HTTP / Tải file âm thanh tĩnh để hiển thị chẩn đoán minh bạch.
 */
export function classifyStorageCloudError(err: unknown): string {
  const anyErr = err as { code?: string; status?: number; message?: string } | null | undefined;
  const code = String(anyErr?.code || '').toLowerCase();
  const status = typeof anyErr?.status === 'number' ? anyErr.status : 0;
  const msg = String(anyErr?.message || err || '');
  const lowerMsg = msg.toLowerCase();

  if (status === 402 || lowerMsg.includes('402') || lowerMsg.includes('payment required')) {
    return 'HTTP 402 (Payment Required): Dịch vụ lưu trữ yêu cầu nâng cấp gói trả phí.';
  }
  if (
    status === 404 ||
    code.includes('not-found') ||
    lowerMsg.includes('404') ||
    lowerMsg.includes('not found')
  ) {
    return 'HTTP 404 (Not Found): File nhạc chưa tồn tại trong thư mục ./audio/ trên GitHub Pages. Vui lòng đưa file vào public/audio/ và triển khai GitHub Pages trước.';
  }
  if (
    status === 403 ||
    code.includes('unauthorized') ||
    code.includes('unauthenticated') ||
    lowerMsg.includes('403') ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('permission')
  ) {
    return 'HTTP 403 (Forbidden): Không đủ quyền truy cập tài nguyên nhạc nền.';
  }
  return msg || 'Không thể tải file nhạc nền từ GitHub Pages.';
}

/**
 * Kiểm tra tính hợp lệ của tài liệu `/system_config/audio` theo đúng `isValidSystemAudioConfig` trong `firestore.rules` (M7.3.3).
 * - Bắt buộc có `assetPath` nằm trong `audio/` khớp với `fileName`.
 * - Cấm tuyệt đối `downloadURL`, `storagePath`, URL ngoài hoặc capability token.
 */
export function evaluateSystemAudioConfigRule(params: {
  action: 'get' | 'list' | 'create' | 'update' | 'delete';
  docId: string;
  isVerifiedPersonalGmail: boolean;
  authEmail: string | null;
  requestTimeMs?: number;
  existing?: SystemAudioConfigDocument | null;
  incoming?: Partial<SystemAudioConfigDocument> | Record<string, unknown> | null;
}): boolean {
  const {
    action,
    docId,
    isVerifiedPersonalGmail,
    authEmail,
    requestTimeMs = Date.now(),
    existing = null,
    incoming,
  } = params;
  if (!isVerifiedPersonalGmail) return false;
  if (action === 'list') return false;
  if (docId !== 'audio') return false;
  if (action === 'get') return true;

  const isAdmin =
    isVerifiedPersonalGmail &&
    typeof authEmail === 'string' &&
    authEmail.trim().toLowerCase() === ADMIN_EMAIL;
  if (!isAdmin) return false;
  if (action === 'delete') return true;
  if (!incoming || typeof incoming !== 'object') return false;

  const requiredKeys = [
    'assetPath',
    'fileName',
    'contentType',
    'fileSize',
    'updatedAt',
    'updatedBy',
    'version',
    'isEnabled',
  ];
  const allowedKeys = new Set([
    ...requiredKeys,
    'storagePath',
    'soundId',
    'audioDataUrl',
    'displayName',
    'durationSec',
    'trimStartSec',
    'trimEndSec',
    'loopGapMs',
    'fadeOutMs',
  ]);

  const keys = Object.keys(incoming);
  for (const reqKey of requiredKeys) {
    if (!(reqKey in incoming)) return false;
  }
  for (const k of keys) {
    if (!allowedKeys.has(k)) return false;
  }

  if (
    typeof incoming.fileName !== 'string' ||
    incoming.fileName.length < 5 ||
    incoming.fileName.length > 255 ||
    !/^[A-Za-z0-9._-]+\.(mp3|ogg|wav|m4a|aac|webm)$/.test(incoming.fileName)
  ) {
    return false;
  }

  const pathCheck = validateSafeAudioOrStoragePath(incoming.assetPath, incoming.fileName);
  if (!pathCheck.valid) {
    return false;
  }

  if (
    typeof incoming.contentType !== 'string' ||
    incoming.contentType.length < 9 ||
    incoming.contentType.length > 120 ||
    !/^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|mp4|x-m4a|aac|webm)$/.test(incoming.contentType)
  ) {
    return false;
  }
  if (
    typeof incoming.fileSize !== 'number' ||
    !Number.isInteger(incoming.fileSize) ||
    incoming.fileSize <= 0 ||
    incoming.fileSize > 26214400
  ) {
    return false;
  }
  if (
    typeof incoming.updatedAt !== 'number' ||
    !Number.isInteger(incoming.updatedAt) ||
    incoming.updatedAt < requestTimeMs - 60000 ||
    incoming.updatedAt > requestTimeMs + 60000
  ) {
    return false;
  }
  if (incoming.updatedBy !== SUPER_ADMIN_EMAIL) return false;
  if (
    typeof incoming.version !== 'number' ||
    !Number.isInteger(incoming.version) ||
    incoming.version < 1
  ) {
    return false;
  }
  if (action === 'update' && existing && incoming.version <= existing.version) {
    return false;
  }
  if (typeof incoming.isEnabled !== 'boolean') return false;

  if (
    incoming.displayName !== undefined &&
    (typeof incoming.displayName !== 'string' ||
      incoming.displayName.length < 1 ||
      incoming.displayName.length > 120)
  ) {
    return false;
  }
  if (
    incoming.durationSec !== undefined &&
    (typeof incoming.durationSec !== 'number' ||
      incoming.durationSec <= 0 ||
      incoming.durationSec > 7200)
  ) {
    return false;
  }
  if (
    incoming.trimStartSec !== undefined &&
    incoming.trimStartSec !== null &&
    (typeof incoming.trimStartSec !== 'number' || incoming.trimStartSec < 0)
  ) {
    return false;
  }
  if (
    incoming.trimEndSec !== undefined &&
    incoming.trimEndSec !== null &&
    (typeof incoming.trimEndSec !== 'number' || incoming.trimEndSec < 0)
  ) {
    return false;
  }
  return true;
}

/**
 * Adapter thực tế (M7.3.3 & M7.3.11.6):
 * - Hỗ trợ upload/download trực tiếp qua Firebase Storage (`sound_catalog/{soundId}/v{version}/{fileName}`)
 *   VÀ tương thích ngược với đường dẫn tĩnh (`./audio/<fileName>?v=<version>`).
 * - Lưu và đồng bộ danh mục `/sound_catalog/{soundId}` cùng cấu hình đang hoạt động `/system_config/audio` trên Firestore.
 */
export class FirebaseSharedMusicCloudAdapter implements SharedMusicCloudAdapter {
  private inMemoryFallbackBlobs: Map<string, ArrayBuffer> = new Map();

  public async uploadAudioBinary(
    assetPath: string,
    data?: ArrayBuffer | Uint8Array,
    contentType?: string
  ): Promise<{ assetPath: string }> {
    const check = validateSafeAudioOrStoragePath(assetPath);
    if (!check.valid || !check.normalizedAssetPath) {
      throw new Error(check.error || 'Đường dẫn nhạc không hợp lệ.');
    }
    const normalizedPath = check.normalizedAssetPath;
    if (data) {
      const buf: ArrayBuffer =
        data instanceof Uint8Array
          ? (data.slice().buffer as ArrayBuffer)
          : data.slice(0);
      this.inMemoryFallbackBlobs.set(normalizedPath, buf);

      if (check.isStorageCatalogPath) {
        const storage = getFirebaseStorage();
        const sRef = storageRef(storage, normalizedPath);
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        await uploadBytes(sRef, bytes, {
          contentType: contentType || 'audio/mpeg',
        });
      }
    }
    return { assetPath: normalizedPath };
  }

  public async deleteAudioBinary(assetPath: string): Promise<void> {
    this.inMemoryFallbackBlobs.delete(assetPath);
    const check = validateSafeAudioOrStoragePath(assetPath);
    if (check.valid && check.isStorageCatalogPath) {
      try {
        const storage = getFirebaseStorage();
        await deleteObject(storageRef(storage, check.normalizedAssetPath!));
      } catch {
        // Ignore if object already deleted
      }
    }
  }

  public async fetchAudioBinary(
    assetPath: string,
    version: number
  ): Promise<ArrayBuffer> {
    const check = validateSafeAudioOrStoragePath(assetPath);
    if (!check.valid || !check.normalizedAssetPath) {
      throw new Error(check.error || 'Đường dẫn nhạc không an toàn.');
    }
    const normalizedPath = check.normalizedAssetPath;
    if (this.inMemoryFallbackBlobs.has(normalizedPath)) {
      return this.inMemoryFallbackBlobs.get(normalizedPath)!.slice(0);
    }

    if (check.isStorageCatalogPath) {
      const storage = getFirebaseStorage();
      const sRef = storageRef(storage, normalizedPath);
      const buf = await getBytes(sRef, 25 * 1024 * 1024);
      if (buf.byteLength <= 0) {
        throw new Error(`File âm thanh ${normalizedPath} trên Firebase Storage bị rỗng (0 bytes).`);
      }
      return buf;
    }

    const url = buildGitHubPagesAudioUrl(normalizedPath, version);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        classifyStorageCloudError({
          status: res.status,
          message: `Không thể tải file nhạc nền (${url} -> HTTP ${res.status}).`,
        })
      );
    }
    const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      throw new Error(
        `File nhạc ${normalizedPath} chưa tồn tại trên máy chủ (trả về trang HTML thay vì dữ liệu âm thanh).`
      );
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength <= 0) {
      throw new Error(`File nhạc ${normalizedPath} trên máy chủ bị rỗng (0 bytes).`);
    }
    return buf;
  }

  public async getSystemAudioConfig(): Promise<SystemAudioConfigDocument | null> {
    const db = getFirebaseDb();
    const ref = doc(db, 'system_config', 'audio');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as SystemAudioConfigDocument;
  }

  public async saveSystemAudioConfig(config: SystemAudioConfigDocument): Promise<void> {
    const check = validateSafeAudioOrStoragePath(config.assetPath, config.fileName);
    if (!check.valid) {
      throw new Error(check.error || 'Đường dẫn nhạc không an toàn.');
    }
    const db = getFirebaseDb();
    const ref = doc(db, 'system_config', 'audio');
    await setDoc(ref, config);
  }

  public async deleteSystemAudioConfig(): Promise<void> {
    const db = getFirebaseDb();
    const ref = doc(db, 'system_config', 'audio');
    await deleteDoc(ref);
  }

  public subscribeSystemAudioConfig(
    onUpdate: (config: SystemAudioConfigDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = getFirebaseDb();
    const ref = doc(db, 'system_config', 'audio');
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          onUpdate(null);
        } else {
          onUpdate(snap.data() as SystemAudioConfigDocument);
        }
      },
      (err) => {
        if (onError) onError(err);
      }
    );
    return unsub;
  }

  public async listSoundCatalog(): Promise<SoundCatalogEntry[]> {
    const db = getFirebaseDb();
    const snap = await getDocs(collection(db, 'sound_catalog'));
    const list: SoundCatalogEntry[] = [];
    for (const d of snap.docs) {
      list.push(d.data() as SoundCatalogEntry);
    }
    list.sort((a, b) => b.updatedAt - a.updatedAt);
    return list;
  }

  public async saveSoundCatalogEntry(entry: SoundCatalogEntry): Promise<void> {
    const db = getFirebaseDb();
    await setDoc(doc(db, 'sound_catalog', entry.soundId), entry);
  }

  public async deleteSoundCatalogEntry(soundId: string): Promise<void> {
    const db = getFirebaseDb();
    await deleteDoc(doc(db, 'sound_catalog', soundId));
  }

  public subscribeSoundCatalog(
    onUpdate: (entries: SoundCatalogEntry[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = getFirebaseDb();
    const unsub: Unsubscribe = onSnapshot(
      collection(db, 'sound_catalog'),
      (snap) => {
        const list: SoundCatalogEntry[] = [];
        for (const d of snap.docs) {
          list.push(d.data() as SoundCatalogEntry);
        }
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        onUpdate(list);
      },
      (err) => {
        if (onError) onError(err);
      }
    );
    return unsub;
  }
}

/**
 * Adapter trong bộ nhớ phục vụ kiểm thử tự động (M7.3.3 & M7.3.11.6).
 */
export class InMemorySharedMusicCloudAdapter implements SharedMusicCloudAdapter {
  private staticFiles: Map<string, { data: ArrayBuffer; contentType: string }> = new Map();
  private configDoc: SystemAudioConfigDocument | null = null;
  private subscribers: Set<(config: SystemAudioConfigDocument | null) => void> = new Set();
  private catalogEntries: Map<string, SoundCatalogEntry> = new Map();
  private catalogSubscribers: Set<(entries: SoundCatalogEntry[]) => void> = new Set();

  public failNextStorageUpload: boolean = false;
  public failNextFirestoreWrite: boolean = false;
  public failNextAudioFetch: boolean = false;
  public operationLog: string[] = [];
  public fetchedUrlsWithCacheBust: string[] = [];

  public deployStaticAudioFileToGitHubPages(
    assetPath: string,
    data: ArrayBuffer | Uint8Array,
    contentType: string = 'audio/mpeg'
  ): void {
    const check = validateSafeAudioOrStoragePath(assetPath);
    if (!check.valid || !check.normalizedAssetPath) {
      throw new Error(check.error || 'Đường dẫn tĩnh không hợp lệ.');
    }
    const buf: ArrayBuffer =
      data instanceof Uint8Array
        ? (data.slice().buffer as ArrayBuffer)
        : data.slice(0);
    this.staticFiles.set(check.normalizedAssetPath, { data: buf, contentType });
    this.operationLog.push(`GITHUB_PAGES_DEPLOY_OK:${check.normalizedAssetPath}`);
  }

  public async uploadAudioBinary(
    assetPath: string,
    data: ArrayBuffer | Uint8Array,
    contentType: string
  ): Promise<{ assetPath: string }> {
    if (this.failNextStorageUpload) {
      this.failNextStorageUpload = false;
      this.operationLog.push(`STATIC_DEPLOY_FAIL:${assetPath}`);
      throw new Error('Mô phỏng lỗi tải file âm thanh lên Storage.');
    }
    this.deployStaticAudioFileToGitHubPages(assetPath, data, contentType);
    return { assetPath };
  }

  public async deleteAudioBinary(assetPath: string): Promise<void> {
    this.staticFiles.delete(assetPath);
    this.operationLog.push(`STATIC_DELETE_OK:${assetPath}`);
  }

  public async fetchAudioBinary(
    assetPath: string,
    version: number
  ): Promise<ArrayBuffer> {
    const check = validateSafeAudioOrStoragePath(assetPath);
    if (!check.valid || !check.normalizedAssetPath) {
      this.operationLog.push(`GITHUB_PAGES_FETCH_INVALID_PATH:${assetPath}`);
      throw new Error(check.error || 'Đường dẫn nhạc không an toàn.');
    }

    const url = check.isStorageCatalogPath
      ? `./${check.normalizedAssetPath}?v=${version}`
      : buildGitHubPagesAudioUrl(check.normalizedAssetPath, version);
    this.fetchedUrlsWithCacheBust.push(url);

    if (this.failNextAudioFetch) {
      this.failNextAudioFetch = false;
      this.operationLog.push(`GITHUB_PAGES_FETCH_FAIL:${url}`);
      throw new Error(`Mô phỏng lỗi tải file nhạc (${url}).`);
    }

    const entry = this.staticFiles.get(check.normalizedAssetPath);
    if (!entry) {
      this.operationLog.push(`GITHUB_PAGES_FETCH_404:${url}`);
      throw new Error(
        `HTTP 404 (Not Found): File nhạc ./${check.normalizedAssetPath} chưa tồn tại.`
      );
    }

    this.operationLog.push(`GITHUB_PAGES_FETCH_OK:${url}`);
    return entry.data.slice(0);
  }

  public async getSystemAudioConfig(): Promise<SystemAudioConfigDocument | null> {
    return this.configDoc ? { ...this.configDoc } : null;
  }

  public async saveSystemAudioConfig(config: SystemAudioConfigDocument): Promise<void> {
    const check = validateSafeAudioOrStoragePath(config.assetPath, config.fileName);
    if (!check.valid) {
      throw new Error(check.error || 'Đường dẫn assetPath không hợp lệ.');
    }
    if (this.failNextFirestoreWrite) {
      this.failNextFirestoreWrite = false;
      this.operationLog.push(`FIRESTORE_WRITE_FAIL:v${config.version}`);
      throw new Error('Mô phỏng lỗi ghi tài liệu /system_config/audio trên Firestore.');
    }
    this.configDoc = { ...config };
    this.operationLog.push(`FIRESTORE_WRITE_OK:v${config.version}`);
    this.notifySubscribers();
  }

  public async deleteSystemAudioConfig(): Promise<void> {
    this.configDoc = null;
    this.operationLog.push('FIRESTORE_DELETE_OK');
    this.notifySubscribers();
  }

  public subscribeSystemAudioConfig(
    onUpdate: (config: SystemAudioConfigDocument | null) => void
  ): () => void {
    this.subscribers.add(onUpdate);
    onUpdate(this.configDoc ? { ...this.configDoc } : null);
    return () => {
      this.subscribers.delete(onUpdate);
    };
  }

  public async listSoundCatalog(): Promise<SoundCatalogEntry[]> {
    return Array.from(this.catalogEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public async saveSoundCatalogEntry(entry: SoundCatalogEntry): Promise<void> {
    if (this.failNextFirestoreWrite) {
      this.failNextFirestoreWrite = false;
      throw new Error('Mô phỏng lỗi ghi /sound_catalog trên Firestore.');
    }
    this.catalogEntries.set(entry.soundId, { ...entry });
    this.operationLog.push(`CATALOG_SAVE_OK:${entry.soundId}:v${entry.version}:active=${entry.isActive}`);
    this.notifyCatalogSubscribers();
  }

  public async deleteSoundCatalogEntry(soundId: string): Promise<void> {
    this.catalogEntries.delete(soundId);
    this.operationLog.push(`CATALOG_DELETE_OK:${soundId}`);
    this.notifyCatalogSubscribers();
  }

  public subscribeSoundCatalog(
    onUpdate: (entries: SoundCatalogEntry[]) => void
  ): () => void {
    this.catalogSubscribers.add(onUpdate);
    onUpdate(Array.from(this.catalogEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt));
    return () => {
      this.catalogSubscribers.delete(onUpdate);
    };
  }

  public hasStorageFile(path: string): boolean {
    return this.staticFiles.has(path);
  }

  public getSubscriberCount(): number {
    return this.subscribers.size;
  }

  private notifySubscribers(): void {
    const snap = this.configDoc ? { ...this.configDoc } : null;
    this.subscribers.forEach((fn) => fn(snap));
  }

  private notifyCatalogSubscribers(): void {
    const list = Array.from(this.catalogEntries.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    this.catalogSubscribers.forEach((fn) => fn(list));
  }
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

  private currentRole: UserRole = 'PLAYER'; // Strict default: PLAYER unless authenticated as Super Admin

  // Playback runtime state
  private activeContext: { stageId: number; mode: GameModeScope } = { stageId: 1, mode: 'SOLO' };
  private activeTrackId: string | null = null;
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private previewTrackId: string | null = null;

  // Web Audio nodes for custom track playback & crossfading
  private currentSource: AudioBufferSourceNode | null = null;
  private currentGain: GainNode | null = null;
  private nextCrossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSources: Set<{ stop: () => void; disconnect: () => void; onended?: ((...args: any[]) => any) | null }> = new Set();
  private playbackGenerationId: number = 0;
  private snapshotRequestToken: number = 0;

  private listeners: Set<() => void> = new Set();

  // M7.3.3 Shared Static GitHub Pages + Firestore Config Sync State
  private cloudAdapter: SharedMusicCloudAdapter = new FirebaseSharedMusicCloudAdapter();
  private sharedAudioConfig: SystemAudioConfigDocument | null = null;
  private stagedAudioPackage: StagedAudioPackage | null = null;
  private stagedPackageBinary: ArrayBuffer | null = null;
  private stagedDecodedBuffer: {
    duration: number;
    sampleRate: number;
    numberOfChannels: number;
    getChannelData: (channel: number) => Float32Array;
  } | null = null;
  private unsubSharedConfig: (() => void) | null = null;
  private unsubSoundCatalog: (() => void) | null = null;
  private soundCatalog: Map<string, SoundCatalogEntry> = new Map();
  private subscribedSharedUserUid: string | null = null;
  private loadedSharedVersion: number = 0;
  private loadedSharedAssetPath: string = '';
  private isCloudSyncInProgress: boolean = false;
  private sharedSyncError: string | null = null;
  private hasPendingAutoplayUnlockListener: boolean = false;
  private customBufferDecoder:
    | ((arrayBuffer: ArrayBuffer) => Promise<{
        duration: number;
        sampleRate: number;
        numberOfChannels: number;
        getChannelData: (channel: number) => Float32Array;
      }>)
    | null = null;

  private constructor() {
    this.loadPersistedState();
    try {
      const globalRef = globalThis as unknown as {
        __bantankMusicManagerSync?: () => void;
      };
      globalRef.__bantankMusicManagerSync = () => {
        this.onVolumeOrToggleChanged();
      };
    } catch {
      // ignore
    }
  }

  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  public setCloudAdapter(
    adapter: SharedMusicCloudAdapter,
    customDecoder?: (arrayBuffer: ArrayBuffer) => Promise<{
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    }>
  ): void {
    this.stopSharedConfigSubscription();
    this.cloudAdapter = adapter;
    this.customBufferDecoder = customDecoder ?? null;
    this.sharedAudioConfig = null;
    this.soundCatalog.clear();
    this.stagedAudioPackage = null;
    this.stagedPackageBinary = null;
    this.stagedDecodedBuffer = null;
    this.loadedSharedVersion = 0;
    this.loadedSharedAssetPath = '';
    this.sharedSyncError = null;
  }

  public getSharedAudioConfig(): SystemAudioConfigDocument | null {
    return this.sharedAudioConfig ? { ...this.sharedAudioConfig } : null;
  }

  public getSoundCatalog(): SoundCatalogEntry[] {
    const activePath = this.sharedAudioConfig?.isEnabled ? this.sharedAudioConfig.assetPath : null;
    const activeSoundId = this.sharedAudioConfig?.isEnabled ? this.sharedAudioConfig.soundId : null;
    return Array.from(this.soundCatalog.values())
      .map((entry) => ({
        ...entry,
        isActive:
          Boolean(this.sharedAudioConfig?.isEnabled) &&
          (entry.soundId === activeSoundId || entry.storagePath === activePath || entry.isActive),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  public getStagedAudioPackage(): StagedAudioPackage | null {
    return this.stagedAudioPackage ? { ...this.stagedAudioPackage } : null;
  }

  /**
   * Trả về Blob và tên file chuẩn hóa để Super Admin tải xuống máy và đặt vào `public/audio/<normalizedFileName>`.
   */
  public getStagedAudioDownloadBlob(): { blob: Blob; fileName: string } | null {
    if (!this.stagedAudioPackage || !this.stagedPackageBinary) return null;
    const blob = new Blob([this.stagedPackageBinary.slice(0)], {
      type: this.stagedAudioPackage.contentType || 'audio/mpeg',
    });
    return {
      blob,
      fileName: this.stagedAudioPackage.normalizedFileName,
    };
  }

  public clearStagedAudioPackage(): void {
    if (this.previewTrackId === STAGED_LOCAL_PREVIEW_BGM_ID) {
      this.stopPreview();
    }
    this.tracks.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.audioBuffers.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.rawBlobs.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.stagedAudioPackage = null;
    this.stagedPackageBinary = null;
    this.stagedDecodedBuffer = null;
    this.notify();
  }

  public getSharedSyncError(): string | null {
    return this.sharedSyncError;
  }

  public isCloudSyncing(): boolean {
    return this.isCloudSyncInProgress;
  }

  public getActiveSharedListenerCount(): number {
    return this.unsubSharedConfig ? 1 : 0;
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
  // ROLE & ACCESS CONTROL (RBAC) + SHARED CONFIG SUBSCRIPTION
  // =========================================================================

  public getUserRole(): UserRole {
    return this.currentRole;
  }

  /**
   * Synchronizes the user role strictly from the authenticated Firebase Google user,
   * and attaches/detaches the real-time listener on `/system_config/audio`.
   * Only `linhnk2013@gmail.com` with verified Google provider receives `ADMIN`.
   */
  public syncRoleFromAuthUser(user: User | ValidatedUserAccount | null | undefined): UserRole {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(MUSIC_STORAGE_KEYS.USER_ROLE);
      } catch {
        // ignore
      }
    }
    const nextRole: UserRole = isAdminUser(user) ? 'ADMIN' : 'PLAYER';
    const roleChanged = this.currentRole !== nextRole;
    this.currentRole = nextRole;

    const validation = validatePersonalGmailUser((user as User) ?? null);
    const canAutoSubscribe =
      typeof window !== 'undefined' || !(this.cloudAdapter instanceof FirebaseSharedMusicCloudAdapter);
    if (validation.isValid && user?.uid && canAutoSubscribe) {
      this.ensureSharedConfigSubscription(user.uid);
    } else {
      this.revokeSharedAudioOnSignOut();
    }

    if (roleChanged) {
      this.notify();
    }
    return this.currentRole;
  }

  /**
   * Thu hồi ngay listener `/system_config/audio` và xóa toàn bộ dữ liệu nhạc nền chung trong bộ nhớ
   * khi người chơi đăng xuất hoặc tài khoản không hợp lệ (M7.3.2.1 Mục 3).
   */
  public revokeSharedAudioOnSignOut(): void {
    this.stopSharedConfigSubscription();
    const hadSharedTrack =
      this.tracks.has(SHARED_SYSTEM_BGM_ID) ||
      this.sharedAudioConfig !== null ||
      this.assignments.globalTrackId === SHARED_SYSTEM_BGM_ID;

    this.tracks.delete(SHARED_SYSTEM_BGM_ID);
    this.audioBuffers.delete(SHARED_SYSTEM_BGM_ID);
    this.rawBlobs.delete(SHARED_SYSTEM_BGM_ID);
    this.tracks.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.audioBuffers.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.rawBlobs.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    if (this.assignments.globalTrackId === SHARED_SYSTEM_BGM_ID) {
      this.assignments.globalTrackId = null;
    }
    this.sharedAudioConfig = null;
    this.soundCatalog.clear();
    this.stagedAudioPackage = null;
    this.stagedPackageBinary = null;
    this.stagedDecodedBuffer = null;
    this.loadedSharedVersion = 0;
    this.loadedSharedAssetPath = '';
    this.sharedSyncError = null;
    this.isCloudSyncInProgress = false;

    if (hadSharedTrack) {
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
    }
  }

  /**
   * Đảm bảo chỉ có tối đa 1 listener `onSnapshot(/system_config/audio)` đang hoạt động cho người chơi đã đăng nhập.
   */
  public ensureSharedConfigSubscription(uid: string): void {
    if (!uid) return;
    if (this.unsubSharedConfig && this.subscribedSharedUserUid === uid) {
      return;
    }
    this.stopSharedConfigSubscription();
    this.subscribedSharedUserUid = uid;
    this.unsubSharedConfig = this.cloudAdapter.subscribeSystemAudioConfig(
      (config) => {
        void this.applySharedAudioConfigSnapshot(config);
      },
      (err) => {
        this.sharedSyncError = err?.message || 'Không thể đồng bộ cấu hình nhạc nền chung.';
        this.notify();
      }
    );
    if (this.cloudAdapter.subscribeSoundCatalog) {
      this.unsubSoundCatalog = this.cloudAdapter.subscribeSoundCatalog(
        (entries) => {
          this.soundCatalog.clear();
          for (const item of entries) {
            this.soundCatalog.set(item.soundId, item);
          }
          this.notify();
        },
        () => {
          // Ignore catalog list error if collection is empty
        }
      );
    }
  }

  public stopSharedConfigSubscription(): void {
    if (this.unsubSharedConfig) {
      try {
        this.unsubSharedConfig();
      } catch {
        // ignore
      }
      this.unsubSharedConfig = null;
    }
    if (this.unsubSoundCatalog) {
      try {
        this.unsubSoundCatalog();
      } catch {
        // ignore
      }
      this.unsubSoundCatalog = null;
    }
    this.subscribedSharedUserUid = null;
  }

  /**
   * Xử lý dữ liệu `/system_config/audio` nhận được từ Firestore (khi mới mở trang, sau khi F5 reload,
   * hoặc khi Super Admin kích hoạt phiên bản nhạc nền mới trên GitHub Pages).
   * - Kiểm tra an toàn đường dẫn `assetPath` (bắt buộc nằm trong thư mục `audio/`).
   * - Tải nhạc trực tiếp từ GitHub Pages kèm cache-busting `?v=<version>`.
   * - Nếu file lỗi hoặc không tồn tại, tự động chuyển về nhạc nền 8-bit mặc định.
   */
  public async applySharedAudioConfigSnapshot(
    config: SystemAudioConfigDocument | null
  ): Promise<void> {
    const requestToken = ++this.snapshotRequestToken;
    this.sharedAudioConfig = config ? { ...config } : null;

    if (!config || !config.isEnabled || !config.assetPath) {
      // Nếu nhạc nền chung bị tắt hoặc đã xóa: gỡ bài nhạc chung và quay về nhạc 8-bit mặc định
      if (this.tracks.has(SHARED_SYSTEM_BGM_ID)) {
        this.tracks.delete(SHARED_SYSTEM_BGM_ID);
        this.audioBuffers.delete(SHARED_SYSTEM_BGM_ID);
        this.rawBlobs.delete(SHARED_SYSTEM_BGM_ID);
      }
      if (this.assignments.globalTrackId === SHARED_SYSTEM_BGM_ID) {
        this.assignments.globalTrackId = null;
      }
      this.loadedSharedVersion = 0;
      this.loadedSharedAssetPath = '';
      this.sharedSyncError = null;
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
      return;
    }

    const pathValidation = validateSafeAudioOrStoragePath(config.assetPath, config.fileName);
    if (!pathValidation.valid || !pathValidation.normalizedAssetPath) {
      // Đường dẫn không an toàn -> chặn ngay
      if (this.tracks.has(SHARED_SYSTEM_BGM_ID)) {
        this.tracks.delete(SHARED_SYSTEM_BGM_ID);
        this.audioBuffers.delete(SHARED_SYSTEM_BGM_ID);
        this.rawBlobs.delete(SHARED_SYSTEM_BGM_ID);
      }
      if (this.assignments.globalTrackId === SHARED_SYSTEM_BGM_ID) {
        this.assignments.globalTrackId = null;
      }
      this.loadedSharedVersion = 0;
      this.loadedSharedAssetPath = '';
      this.sharedSyncError =
        pathValidation.error || 'Đường dẫn nhạc nền không hợp lệ.';
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
      return;
    }

    const safeAssetPath = pathValidation.normalizedAssetPath;
    const needRefetch =
      this.loadedSharedVersion !== config.version ||
      this.loadedSharedAssetPath !== safeAssetPath ||
      !this.tracks.has(SHARED_SYSTEM_BGM_ID);

    if (!needRefetch) {
      const existingMeta = this.tracks.get(SHARED_SYSTEM_BGM_ID);
      if (existingMeta && config.displayName && existingMeta.displayName !== config.displayName) {
        existingMeta.displayName = config.displayName;
        this.tracks.set(SHARED_SYSTEM_BGM_ID, { ...existingMeta });
      }
      if (!this.assignments.globalTrackId) {
        this.assignments.globalTrackId = SHARED_SYSTEM_BGM_ID;
      }
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
      return;
    }

    // Dừng ngay bài nhạc cũ đang phát khi bắt đầu chuyển sang bài nhạc mới để không phát chồng
    this.stopAllCustomSources();
    SoundManager.getInstance().stopBgm();
    this.isCloudSyncInProgress = true;
    this.sharedSyncError = null;
    this.notify();

    try {
      let arrayBuffer: ArrayBuffer;
      try {
        arrayBuffer = await this.cloudAdapter.fetchAudioBinary(
          safeAssetPath,
          config.version
        );
      } catch (primaryFetchErr) {
        if (config.audioDataUrl && config.audioDataUrl.startsWith('data:audio/')) {
          const commaIdx = config.audioDataUrl.indexOf(',');
          const b64 = commaIdx >= 0 ? config.audioDataUrl.slice(commaIdx + 1) : '';
          const binStr = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
          const bytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) {
            bytes[i] = binStr.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
        } else {
          throw primaryFetchErr;
        }
      }

      if (requestToken !== this.snapshotRequestToken) {
        return;
      }

      let decodedBuffer: {
        duration: number;
        sampleRate: number;
        numberOfChannels: number;
        getChannelData: (channel: number) => Float32Array;
      } | null = null;

      if (this.customBufferDecoder) {
        decodedBuffer = await this.customBufferDecoder(arrayBuffer.slice(0));
      } else {
        const ctx = SoundManager.getInstance().initContext();
        if (ctx) {
          decodedBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
        }
      }

      if (requestToken !== this.snapshotRequestToken) {
        return;
      }

      if (!decodedBuffer || decodedBuffer.duration <= 0) {
        throw new Error('Không thể giải mã dữ liệu nhạc nền.');
      }

      const analyzedBounds = MusicManager.analyzeSilenceBounds(
        decodedBuffer,
        this.loopConfig.silenceThresholdDb
      );
      const trimStartSec =
        typeof config.trimStartSec === 'number' && config.trimStartSec >= 0
          ? config.trimStartSec
          : analyzedBounds.trimStartSec;
      const trimEndSec =
        typeof config.trimEndSec === 'number' &&
        config.trimEndSec > trimStartSec &&
        config.trimEndSec <= decodedBuffer.duration
          ? config.trimEndSec
          : analyzedBounds.trimEndSec;

      const runtimeUrl = pathValidation.isStorageCatalogPath
        ? safeAssetPath
        : buildGitHubPagesAudioUrl(safeAssetPath, config.version);
      const sharedMeta: MusicTrackMetadata = {
        id: SHARED_SYSTEM_BGM_ID,
        displayName:
          config.displayName?.trim() ||
          config.fileName.replace(/\.(mp3|ogg|wav|m4a|aac|webm)$/i, '') ||
          'Nhạc Nền Hệ Thống',
        fileName: config.fileName,
        mimeType: config.contentType || 'audio/mpeg',
        sizeBytes: config.fileSize,
        durationSec: Number((config.durationSec ?? decodedBuffer.duration).toFixed(2)),
        uploadedAt: config.updatedAt,
        trimBounds: {
          trimStartSec,
          trimEndSec,
          effectiveDurationSec: Math.max(0.1, Number((trimEndSec - trimStartSec).toFixed(4))),
          leadingSilenceDetectedSec: analyzedBounds.leadingSilenceDetectedSec,
          trailingSilenceDetectedSec: analyzedBounds.trailingSilenceDetectedSec,
        },
        storageProvider: pathValidation.isStorageCatalogPath
          ? 'FIREBASE_STORAGE_READY'
          : 'GITHUB_PAGES_STATIC',
        storagePathOrUrl: runtimeUrl,
      };

      this.previewTrackId = null;
      this.stopAllCustomSources();
      this.tracks.set(SHARED_SYSTEM_BGM_ID, sharedMeta);
      if (typeof AudioBuffer !== 'undefined' && decodedBuffer instanceof AudioBuffer) {
        this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, decodedBuffer);
      } else {
        this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, decodedBuffer as unknown as AudioBuffer);
      }
      this.rawBlobs.set(SHARED_SYSTEM_BGM_ID, arrayBuffer);

      this.loadedSharedVersion = config.version;
      this.loadedSharedAssetPath = safeAssetPath;
      this.assignments.globalTrackId = SHARED_SYSTEM_BGM_ID;
      this.isCloudSyncInProgress = false;
      this.sharedSyncError = null;

      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
    } catch (err: any) {
      if (requestToken !== this.snapshotRequestToken) {
        return;
      }
      this.stopAllCustomSources();
      this.isCloudSyncInProgress = false;
      this.sharedSyncError =
        err?.message || 'Không thể tải nhạc nền đang kích hoạt.';
      if (this.tracks.has(SHARED_SYSTEM_BGM_ID)) {
        this.tracks.delete(SHARED_SYSTEM_BGM_ID);
        this.audioBuffers.delete(SHARED_SYSTEM_BGM_ID);
        this.rawBlobs.delete(SHARED_SYSTEM_BGM_ID);
      }
      if (this.assignments.globalTrackId === SHARED_SYSTEM_BGM_ID) {
        this.assignments.globalTrackId = null;
      }
      this.loadedSharedVersion = 0;
      this.loadedSharedAssetPath = '';
      this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      this.notify();
    }
  }

  /**
   * Programmatic role setter for unit test harnesses.
   * NEVER persists role to localStorage to prevent privilege escalation via browser storage tampering.
   */
  public setUserRole(role: UserRole): void {
    this.currentRole = role === 'ADMIN' ? 'ADMIN' : role === 'MOD' ? 'MOD' : 'PLAYER';
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (window.localStorage.getItem(MUSIC_STORAGE_KEYS.USER_ROLE) !== null) {
          window.localStorage.removeItem(MUSIC_STORAGE_KEYS.USER_ROLE);
        }
      } catch {
        // ignore
      }
    }
    this.notify();
  }

  public canManageMusic(): boolean {
    return this.currentRole === 'ADMIN';
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
  // M7.3.3 GITHUB PAGES STATIC AUDIO STAGING, VERIFICATION & ACTIVATION
  // =========================================================================

  /**
   * Bước 1 (Chuẩn bị gói nhạc cho GitHub Pages):
   * Khi Super Admin chọn file nhạc trên giao diện:
   * - Kiểm tra định dạng (MP3, OGG, WAV) và dung lượng (<= 25 MB, hỗ trợ file > 4 MB).
   * - Giải mã âm thanh cục bộ để kiểm tra tính toàn vẹn và cho phép nghe thử ngay lập tức.
   * - Tạo gói chuẩn bị (`StagedAudioPackage`) với tên file chuẩn hóa và đường dẫn `public/audio/<normalizedFileName>`.
   * - Tuyệt đối KHÔNG ghi lên Firestore `/system_config/audio` và KHÔNG giả lập đã upload thành công
   *   khi file chưa thực sự có mặt trong `public/audio/` trên GitHub Pages.
   */
  public async stageAudioFileForGitHubPages(
    file: File,
    customDisplayName?: string,
    sourceInfo?: MusicTrackMetadata['sourceInfo']
  ): Promise<{
    success: boolean;
    stagedPackage?: StagedAudioPackage;
    previewTrack?: MusicTrackMetadata;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền quản lý nhạc nền.',
      };
    }

    const basicCheck = MusicManager.validateAudioFileBasic(file);
    if (!basicCheck.valid) {
      return { success: false, error: basicCheck.error };
    }

    let arrayBuffer: ArrayBuffer;
    let decodedBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    } | null = null;

    try {
      arrayBuffer = await file.arrayBuffer();
      const bufferCopy = arrayBuffer.slice(0);
      if (this.customBufferDecoder) {
        decodedBuffer = await this.customBufferDecoder(bufferCopy);
      } else {
        const ctx = SoundManager.getInstance().initContext();
        if (!ctx) {
          return { success: false, error: 'Không thể khởi tạo bộ giải mã Web Audio API.' };
        }
        decodedBuffer = await ctx.decodeAudioData(bufferCopy);
      }

      if (!decodedBuffer || decodedBuffer.duration <= 0) {
        return { success: false, error: 'File âm thanh bị lỗi hoặc không có thời lượng hợp lệ.' };
      }
    } catch {
      return {
        success: false,
        error: 'File âm thanh bị hỏng hoặc không đúng chuẩn mã hóa MP3/OGG/WAV.',
      };
    }

    return await this.stageAudioBufferForGitHubPages({
      fileName: file.name,
      displayName: customDisplayName,
      contentType: file.type || 'audio/mpeg',
      fileSize: file.size,
      decodedBuffer,
      arrayBuffer,
      sourceInfo,
    });
  }

  /**
   * Chuẩn bị gói file nhạc từ bộ đệm đã giải mã (dùng chung cho UI và bộ kiểm thử tự động M7.3.3).
   */
  public async stageAudioBufferForGitHubPages(params: {
    fileName: string;
    displayName?: string;
    contentType: string;
    fileSize: number;
    decodedBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    };
    arrayBuffer: ArrayBuffer;
    sourceInfo?: MusicTrackMetadata['sourceInfo'];
    nowMs?: number;
  }): Promise<{
    success: boolean;
    stagedPackage?: StagedAudioPackage;
    previewTrack?: MusicTrackMetadata;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền chuẩn bị gói nhạc nền.',
      };
    }

    const basicCheck = MusicManager.validateAudioFileBasic({
      name: params.fileName,
      type: params.contentType,
      size: params.fileSize,
    });
    if (!basicCheck.valid) {
      return { success: false, error: basicCheck.error };
    }

    if (!params.decodedBuffer || params.decodedBuffer.duration <= 0) {
      return { success: false, error: 'Dữ liệu âm thanh giải mã không hợp lệ.' };
    }

    const previousConfig =
      this.sharedAudioConfig ?? (await this.cloudAdapter.getSystemAudioConfig().catch(() => null));
    const targetVersion = (previousConfig?.version ?? 0) + 1;
    const normalizedFileName = normalizeSafeAudioFileName(params.fileName, targetVersion);
    const assetPath = `${SAFE_AUDIO_ASSET_DIR_PREFIX}${normalizedFileName}`;
    const pathCheck = validateSafeAudioAssetPath(assetPath, normalizedFileName);
    if (!pathCheck.valid) {
      return { success: false, error: pathCheck.error };
    }

    const trimBounds = MusicManager.analyzeSilenceBounds(
      params.decodedBuffer,
      this.loopConfig.silenceThresholdDb
    );
    const cleanDisplayName =
      (params.displayName || params.fileName.replace(/\.(mp3|ogg|wav)$/i, '')).trim().slice(0, 120) ||
      'Nhạc Nền Hệ Thống';
    const durationSec = Number(params.decodedBuffer.duration.toFixed(2));
    const stagedAt = params.nowMs ?? Date.now();
    const runtimeUrl = buildGitHubPagesAudioUrl(assetPath, targetVersion);

    const stagedPkg: StagedAudioPackage = {
      originalFileName: params.fileName,
      normalizedFileName,
      displayName: cleanDisplayName,
      assetPath,
      repositoryPath: `public/${assetPath}`,
      distPath: `dist/${assetPath}`,
      runtimeUrl,
      contentType: (params.contentType || 'audio/mpeg').slice(0, 120),
      fileSize: params.fileSize,
      detectedFormat: basicCheck.detectedFormat || 'MP3',
      durationSec,
      trimBounds,
      targetVersion,
      stagedAt,
    };

    const previewMeta: MusicTrackMetadata = {
      id: STAGED_LOCAL_PREVIEW_BGM_ID,
      displayName: `[Bản Nháp v${targetVersion}] ${cleanDisplayName}`,
      fileName: normalizedFileName,
      mimeType: stagedPkg.contentType,
      sizeBytes: params.fileSize,
      durationSec,
      uploadedAt: stagedAt,
      sourceInfo: params.sourceInfo,
      trimBounds,
      storageProvider: 'LOCAL_MEMORY_IDB',
      storagePathOrUrl: stagedPkg.repositoryPath,
    };

    this.stagedAudioPackage = stagedPkg;
    this.stagedPackageBinary = params.arrayBuffer.slice(0);
    this.stagedDecodedBuffer = params.decodedBuffer;

    this.tracks.set(STAGED_LOCAL_PREVIEW_BGM_ID, previewMeta);
    if (typeof AudioBuffer !== 'undefined' && params.decodedBuffer instanceof AudioBuffer) {
      this.audioBuffers.set(STAGED_LOCAL_PREVIEW_BGM_ID, params.decodedBuffer);
    } else {
      this.audioBuffers.set(STAGED_LOCAL_PREVIEW_BGM_ID, params.decodedBuffer as unknown as AudioBuffer);
    }
    this.rawBlobs.set(STAGED_LOCAL_PREVIEW_BGM_ID, params.arrayBuffer.slice(0));
    this.sharedSyncError = null;
    this.notify();

    return {
      success: true,
      stagedPackage: stagedPkg,
      previewTrack: previewMeta,
    };
  }

  /**
   * Bước 2 (Xác minh file thực tế trên GitHub Pages & Kích hoạt `/system_config/audio` trên Firestore):
   * - Chỉ sau khi Super Admin đã đặt file vào `public/audio/<normalizedFileName>`, push lên GitHub `main`
   *   và GitHub Pages đã phát hành file tại `./audio/<normalizedFileName>?v=<targetVersion>`,
   *   hệ thống mới tải thử và giải mã file từ GitHub Pages để xác nhận file thực sự tồn tại.
   * - Nếu file chưa có trên web server (HTTP 404 hoặc trả về trang HTML), hệ thống TỪ CHỐI kích hoạt
   *   và giữ nguyên cấu hình nhạc nền hiện tại (tuyệt đối không báo thành công giả).
   */
  public async verifyAndActivateStagedAudioOnGitHubPages(nowMs?: number): Promise<{
    success: boolean;
    track?: MusicTrackMetadata;
    config?: SystemAudioConfigDocument;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền kích hoạt nhạc nền chung.',
      };
    }

    if (!this.stagedAudioPackage) {
      return {
        success: false,
        error: 'Chưa có gói nhạc chuẩn bị nào. Vui lòng chọn file nhạc ở Bước 1 trước.',
      };
    }

    const staged = this.stagedAudioPackage;
    return await this.verifyAndActivateGitHubPagesAsset({
      fileName: staged.normalizedFileName,
      displayName: staged.displayName,
      contentType: staged.contentType,
      expectedFileSize: staged.fileSize,
      targetVersion: staged.targetVersion,
      nowMs,
    });
  }

  /**
   * Xác minh một file nhạc đã có mặt trong `public/audio/<fileName>` trên GitHub Pages
   * và cập nhật `/system_config/audio` trên Firestore để kích hoạt cho toàn bộ người chơi.
   */
  public async verifyAndActivateGitHubPagesAsset(params: {
    fileName: string;
    displayName?: string;
    contentType?: string;
    expectedFileSize?: number;
    targetVersion?: number;
    nowMs?: number;
  }): Promise<{
    success: boolean;
    track?: MusicTrackMetadata;
    config?: SystemAudioConfigDocument;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền kích hoạt nhạc nền chung.',
      };
    }

    const cleanFileName = params.fileName.trim().replace(/^\/+/, '').replace(/^public\/audio\//, '').replace(/^audio\//, '');
    const assetPath = `${SAFE_AUDIO_ASSET_DIR_PREFIX}${cleanFileName}`;
    const pathCheck = validateSafeAudioAssetPath(assetPath, cleanFileName);
    if (!pathCheck.valid || !pathCheck.normalizedAssetPath || !pathCheck.normalizedFileName) {
      return {
        success: false,
        error: pathCheck.error || 'Đường dẫn file trong public/audio/ không hợp lệ.',
      };
    }

    const remoteExisting = await this.cloudAdapter.getSystemAudioConfig().catch(() => null);
    const highestKnownVersion = Math.max(
      this.sharedAudioConfig?.version ?? 0,
      remoteExisting?.version ?? 0
    );
    const nextVersion =
      typeof params.targetVersion === 'number' && params.targetVersion > highestKnownVersion
        ? Math.floor(params.targetVersion)
        : highestKnownVersion + 1;

    this.isCloudSyncInProgress = true;
    this.sharedSyncError = null;
    this.notify();

    // 1. Tải file thực tế từ GitHub Pages (./audio/<fileName>?v=<nextVersion>) để xác minh file đã được deploy
    let deployedBinary: ArrayBuffer;
    try {
      deployedBinary = await this.cloudAdapter.fetchAudioBinary(
        pathCheck.normalizedAssetPath,
        nextVersion
      );
    } catch (fetchErr: any) {
      this.isCloudSyncInProgress = false;
      const errMsg =
        fetchErr?.message ||
        `Chưa tìm thấy file ./${pathCheck.normalizedAssetPath} trên GitHub Pages. Vui lòng đặt file vào public/${pathCheck.normalizedAssetPath}, commit/push lên nhánh main và chờ GitHub Pages phát hành xong trước khi bấm Kích hoạt.`;
      this.sharedSyncError = errMsg;
      this.notify();
      return {
        success: false,
        error: errMsg,
      };
    }

    if (!deployedBinary || deployedBinary.byteLength <= 0) {
      this.isCloudSyncInProgress = false;
      const errMsg = `File ./${pathCheck.normalizedAssetPath} trên GitHub Pages bị rỗng (0 bytes).`;
      this.sharedSyncError = errMsg;
      this.notify();
      return { success: false, error: errMsg };
    }

    if (deployedBinary.byteLength > MAX_FILE_SIZE_BYTES) {
      this.isCloudSyncInProgress = false;
      const errMsg = `File ./${pathCheck.normalizedAssetPath} vượt quá giới hạn 25 MB.`;
      this.sharedSyncError = errMsg;
      this.notify();
      return { success: false, error: errMsg };
    }

    // 2. Giải mã âm thanh để đảm bảo file trên GitHub Pages là âm thanh hợp lệ
    let decodedBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    } | null = null;

    try {
      if (this.customBufferDecoder) {
        decodedBuffer = await this.customBufferDecoder(deployedBinary.slice(0));
      } else {
        const ctx = SoundManager.getInstance().initContext();
        if (ctx) {
          decodedBuffer = await ctx.decodeAudioData(deployedBinary.slice(0));
        } else if (this.stagedDecodedBuffer) {
          decodedBuffer = this.stagedDecodedBuffer;
        }
      }
      if (!decodedBuffer || decodedBuffer.duration <= 0) {
        throw new Error('Thời lượng âm thanh không hợp lệ.');
      }
    } catch {
      this.isCloudSyncInProgress = false;
      const errMsg = `File ./${pathCheck.normalizedAssetPath} tải về từ GitHub Pages không thể giải mã âm thanh (MP3/OGG/WAV không hợp lệ).`;
      this.sharedSyncError = errMsg;
      this.notify();
      return { success: false, error: errMsg };
    }

    const trimBounds = MusicManager.analyzeSilenceBounds(
      decodedBuffer,
      this.loopConfig.silenceThresholdDb
    );
    const lowerName = pathCheck.normalizedFileName.toLowerCase();
    const inferredMime = lowerName.endsWith('.ogg')
      ? 'audio/ogg'
      : lowerName.endsWith('.wav')
      ? 'audio/wav'
      : 'audio/mpeg';
    const rawContentType = (params.contentType || inferredMime).split(';')[0].trim().toLowerCase();
    const contentType = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave)$/.test(rawContentType)
      ? rawContentType
      : inferredMime;
    const writeTimeMs = Math.round(params.nowMs ?? Date.now());
    const cleanDisplayName =
      (
        params.displayName ||
        pathCheck.normalizedFileName.replace(/^bgm_v\d+_/i, '').replace(/\.(mp3|ogg|wav)$/i, '')
      )
        .trim()
        .slice(0, 120) || 'Nhạc Nền Hệ Thống';
    const durationSec = Math.max(0.01, Number(decodedBuffer.duration.toFixed(2)));

    const nextConfig: SystemAudioConfigDocument = {
      assetPath: pathCheck.normalizedAssetPath,
      fileName: pathCheck.normalizedFileName,
      contentType,
      fileSize: Math.round(deployedBinary.byteLength),
      updatedAt: writeTimeMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: Math.round(nextVersion),
      isEnabled: true,
      displayName: cleanDisplayName,
      durationSec,
      trimStartSec: Number(Math.max(0, trimBounds.trimStartSec).toFixed(2)),
      trimEndSec: Number(Math.max(0, trimBounds.trimEndSec).toFixed(2)),
      loopGapMs: 0,
      fadeOutMs: Math.round(this.loopConfig.crossfadeDurationSec * 1000),
    };

    // 3. Lưu cấu hình chung /system_config/audio lên Firestore (chỉ lưu assetPath tương đối, không lưu token/URL tuyệt đối)
    try {
      await this.cloudAdapter.saveSystemAudioConfig(nextConfig);
    } catch (firestoreErr: any) {
      this.isCloudSyncInProgress = false;
      const errText =
        firestoreErr?.message ||
        'Xác minh file trên GitHub Pages thành công nhưng ghi cấu hình Firestore (/system_config/audio) thất bại.';
      const isPermErr =
        String(firestoreErr?.code || '').toLowerCase().includes('permission') ||
        String(errText).toLowerCase().includes('missing or insufficient permissions');
      const detailedError = isPermErr
        ? `Cập nhật Firestore thất bại (giữ nguyên cấu hình nhạc nền hiện tại): ${errText}. Vui lòng đảm bảo bạn đang đăng nhập bằng Super Admin (${SUPER_ADMIN_EMAIL}) và đã publish file firestore.rules mới nhất (có khối match /system_config/{docId}) lên Firebase Console (bantank-bd525).`
        : `Cập nhật Firestore thất bại (giữ nguyên cấu hình nhạc nền hiện tại): ${errText}`;
      this.sharedSyncError = detailedError;
      this.notify();
      return {
        success: false,
        error: detailedError,
      };
    }

    const runtimeUrl = buildGitHubPagesAudioUrl(pathCheck.normalizedAssetPath, nextVersion);
    const metadata: MusicTrackMetadata = {
      id: SHARED_SYSTEM_BGM_ID,
      displayName: cleanDisplayName,
      fileName: pathCheck.normalizedFileName,
      mimeType: contentType,
      sizeBytes: deployedBinary.byteLength,
      durationSec,
      uploadedAt: writeTimeMs,
      trimBounds,
      storageProvider: 'GITHUB_PAGES_STATIC',
      storagePathOrUrl: runtimeUrl,
    };

    // Dọn bản nháp sau khi đã kích hoạt thành công
    if (this.previewTrackId === STAGED_LOCAL_PREVIEW_BGM_ID) {
      this.previewTrackId = null;
    }
    this.tracks.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.audioBuffers.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.rawBlobs.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.stagedAudioPackage = null;
    this.stagedPackageBinary = null;
    this.stagedDecodedBuffer = null;

    this.sharedAudioConfig = nextConfig;
    this.loadedSharedVersion = nextVersion;
    this.loadedSharedAssetPath = pathCheck.normalizedAssetPath;
    this.tracks.set(SHARED_SYSTEM_BGM_ID, metadata);
    if (typeof AudioBuffer !== 'undefined' && decodedBuffer instanceof AudioBuffer) {
      this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, decodedBuffer);
    } else {
      this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, decodedBuffer as unknown as AudioBuffer);
    }
    this.rawBlobs.set(SHARED_SYSTEM_BGM_ID, deployedBinary);
    this.assignments.globalTrackId = SHARED_SYSTEM_BGM_ID;
    this.isCloudSyncInProgress = false;
    this.sharedSyncError = null;

    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();

    return {
      success: true,
      track: metadata,
      config: nextConfig,
    };
  }

  /**
   * Khi gọi `uploadTrack(file)` trên trình duyệt, hệ thống thực hiện Bước 1 (`stageAudioFileForGitHubPages`)
   * và nếu file đã có mặt sẵn trên `public/audio/` (hoặc đang dùng InMemorySharedMusicCloudAdapter trong kiểm thử)
   * thì xác minh và kích hoạt luôn. Nếu file chưa được push lên GitHub Pages, hệ thống dừng ở trạng thái
   * đã chuẩn bị gói nhạc (`stagedPackage`) và thông báo rõ cho Super Admin đặt file vào `public/audio/`.
   */
  public async uploadTrack(
    file: File,
    customDisplayName?: string,
    sourceInfo?: MusicTrackMetadata['sourceInfo']
  ): Promise<{
    success: boolean;
    track?: MusicTrackMetadata;
    catalogEntry?: SoundCatalogEntry;
    stagedPackage?: StagedAudioPackage;
    requiresGitHubPagesDeploy?: boolean;
    error?: string;
  }> {
    const stageRes = await this.stageAudioFileForGitHubPages(file, customDisplayName, sourceInfo);
    if (!stageRes.success || !stageRes.stagedPackage) {
      return { success: false, error: stageRes.error };
    }

    // Nếu đang dùng InMemorySharedMusicCloudAdapter (môi trường test mô phỏng GitHub Pages),
    // đặt file vào static map mô phỏng và kích hoạt.
    if (this.cloudAdapter instanceof InMemorySharedMusicCloudAdapter && this.stagedPackageBinary) {
      try {
        await this.cloudAdapter.uploadAudioBinary(
          stageRes.stagedPackage.assetPath,
          this.stagedPackageBinary,
          stageRes.stagedPackage.contentType
        );
        const activateRes = await this.verifyAndActivateStagedAudioOnGitHubPages();
        return {
          success: activateRes.success,
          track: activateRes.track,
          stagedPackage: stageRes.stagedPackage,
          error: activateRes.error,
        };
      } catch (err: any) {
        return {
          success: false,
          stagedPackage: stageRes.stagedPackage,
          error: err?.message || 'Không thể phát hành gói nhạc nền.',
        };
      }
    }

    // Trên trình duyệt thực tế:
    // Tự động upload lên Firebase Storage (`sound_catalog/...`) và lưu vào danh mục Firestore `/sound_catalog`
    // để Admin có thể kích hoạt trực tiếp ngay trên giao diện mà không bắt buộc phải copy file thủ công vào Git.
    if (this.stagedPackageBinary && this.stagedDecodedBuffer) {
      const cloudCatalogRes = await this.uploadAndCatalogAudioBuffer({
        fileName: stageRes.stagedPackage.normalizedFileName,
        displayName: stageRes.stagedPackage.displayName,
        contentType: stageRes.stagedPackage.contentType,
        fileSize: stageRes.stagedPackage.fileSize,
        decodedBuffer: this.stagedDecodedBuffer,
        arrayBuffer: this.stagedPackageBinary,
        autoActivate: true,
      });
      if (cloudCatalogRes.success && cloudCatalogRes.track) {
        return {
          success: true,
          track: cloudCatalogRes.track,
          catalogEntry: cloudCatalogRes.entry,
          stagedPackage: stageRes.stagedPackage,
          requiresGitHubPagesDeploy: false,
        };
      }
    }

    return {
      success: true,
      track: stageRes.previewTrack,
      stagedPackage: stageRes.stagedPackage,
      requiresGitHubPagesDeploy: true,
    };
  }

  /**
   * M7.3.11.6 Section 6: Upload file âm thanh lên Firebase Storage (`sound_catalog/{soundId}/v{version}/{fileName}`),
   * lưu metadata vào Firestore `/sound_catalog/{soundId}`, và tùy chọn kích hoạt ngay trên `/system_config/audio`
   * để đồng bộ tức thì cho mọi người chơi khác.
   */
  public async uploadAndCatalogAudioBuffer(params: {
    soundId?: string;
    fileName: string;
    displayName?: string;
    contentType: string;
    fileSize: number;
    decodedBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    };
    arrayBuffer: ArrayBuffer;
    autoActivate?: boolean;
    nowMs?: number;
  }): Promise<{
    success: boolean;
    entry?: SoundCatalogEntry;
    track?: MusicTrackMetadata;
    config?: SystemAudioConfigDocument;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền tải lên và quản lý danh mục âm thanh.',
      };
    }

    const basicCheck = MusicManager.validateAudioFileBasic({
      name: params.fileName,
      type: params.contentType,
      size: params.fileSize,
    });
    if (!basicCheck.valid) {
      return { success: false, error: basicCheck.error };
    }
    if (!params.decodedBuffer || params.decodedBuffer.duration <= 0) {
      return { success: false, error: 'Thời lượng file âm thanh không hợp lệ.' };
    }

    const nowMs = Math.round(params.nowMs ?? Date.now());
    const previousConfig =
      this.sharedAudioConfig ?? (await this.cloudAdapter.getSystemAudioConfig().catch(() => null));
    const nextVersion = Math.max(1, (previousConfig?.version ?? 0) + 1);
    const soundId = (params.soundId || `snd_${nowMs}`).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    const normalizedFileName = normalizeSafeAudioFileName(params.fileName, nextVersion);
    const storagePath = `${SOUND_CATALOG_STORAGE_PREFIX}${soundId}/v${nextVersion}/${normalizedFileName}`;

    const trimBounds = MusicManager.analyzeSilenceBounds(
      params.decodedBuffer,
      this.loopConfig.silenceThresholdDb
    );
    const cleanDisplayName =
      (params.displayName || params.fileName.replace(/\.(mp3|ogg|wav|m4a|aac|webm)$/i, ''))
        .trim()
        .slice(0, 120) || 'Nhạc Nền Hệ Thống';
    const durationSec = Math.max(0.01, Number(params.decodedBuffer.duration.toFixed(2)));
    const contentType = /^audio\/(mpeg|mp3|ogg|wav|x-wav|wave|mp4|x-m4a|aac|webm)$/.test(
      (params.contentType || '').toLowerCase()
    )
      ? params.contentType.toLowerCase()
      : 'audio/mpeg';

    this.isCloudSyncInProgress = true;
    this.sharedSyncError = null;
    this.notify();

    try {
      await this.cloudAdapter.uploadAudioBinary(storagePath, params.arrayBuffer, contentType);
    } catch (uploadErr: any) {
      this.isCloudSyncInProgress = false;
      const errMsg = uploadErr?.message || 'Không thể tải file âm thanh lên Firebase Storage.';
      this.sharedSyncError = errMsg;
      this.notify();
      return { success: false, error: errMsg };
    }

    const entry: SoundCatalogEntry = {
      soundId,
      displayName: cleanDisplayName,
      fileName: normalizedFileName,
      storagePath,
      contentType,
      fileSize: Math.round(params.fileSize),
      category: 'BGM',
      durationSec,
      trimStartSec: Number(Math.max(0, trimBounds.trimStartSec).toFixed(2)),
      trimEndSec: Number(Math.max(0, trimBounds.trimEndSec).toFixed(2)),
      version: nextVersion,
      isActive: false,
      updatedAt: nowMs,
      updatedBy: ADMIN_EMAIL,
    };

    try {
      if (this.cloudAdapter.saveSoundCatalogEntry) {
        await this.cloudAdapter.saveSoundCatalogEntry(entry);
      }
      this.soundCatalog.set(soundId, entry);
      this.rawBlobs.set(soundId, params.arrayBuffer.slice(0));
      if (typeof AudioBuffer !== 'undefined' && params.decodedBuffer instanceof AudioBuffer) {
        this.audioBuffers.set(soundId, params.decodedBuffer);
      } else {
        this.audioBuffers.set(soundId, params.decodedBuffer as unknown as AudioBuffer);
      }
    } catch (catErr: any) {
      this.isCloudSyncInProgress = false;
      const errMsg = catErr?.message || 'Không thể lưu metadata âm thanh vào danh mục Firestore.';
      this.sharedSyncError = errMsg;
      this.notify();
      return { success: false, error: errMsg };
    }

    if (params.autoActivate !== false) {
      const actRes = await this.activateCatalogSound(soundId, nowMs);
      this.isCloudSyncInProgress = false;
      this.notify();
      return {
        success: actRes.success,
        entry: this.soundCatalog.get(soundId) || entry,
        track: actRes.track,
        config: actRes.config,
        error: actRes.error,
      };
    }

    this.isCloudSyncInProgress = false;
    this.notify();
    return {
      success: true,
      entry,
    };
  }

  /**
   * M7.3.11.6 Section 6.1 & 6.2: Kích hoạt một âm thanh trong danh mục `/sound_catalog/{soundId}`
   * và cập nhật `/system_config/audio` để mọi người chơi khác đồng bộ tức thì.
   */
  public async activateCatalogSound(
    soundId: string,
    nowMs?: number
  ): Promise<{
    success: boolean;
    track?: MusicTrackMetadata;
    config?: SystemAudioConfigDocument;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền kích hoạt âm thanh hệ thống.',
      };
    }

    let targetEntry = this.soundCatalog.get(soundId);
    if (!targetEntry && this.cloudAdapter.listSoundCatalog) {
      const all = await this.cloudAdapter.listSoundCatalog().catch(() => []);
      for (const item of all) {
        this.soundCatalog.set(item.soundId, item);
      }
      targetEntry = this.soundCatalog.get(soundId);
    }

    if (!targetEntry) {
      return {
        success: false,
        error: `Không tìm thấy âm thanh (${soundId}) trong danh mục.`,
      };
    }

    const remoteExisting = await this.cloudAdapter.getSystemAudioConfig().catch(() => null);
    const highestVersion = Math.max(
      this.sharedAudioConfig?.version ?? 0,
      remoteExisting?.version ?? 0,
      targetEntry.version - 1
    );
    const nextVersion = highestVersion + 1;
    const writeTimeMs = Math.round(nowMs ?? Date.now());

    const nextConfig: SystemAudioConfigDocument = {
      assetPath: targetEntry.storagePath,
      storagePath: targetEntry.storagePath,
      soundId: targetEntry.soundId,
      fileName: targetEntry.fileName,
      contentType: targetEntry.contentType,
      fileSize: targetEntry.fileSize,
      updatedAt: writeTimeMs,
      updatedBy: ADMIN_EMAIL,
      version: nextVersion,
      isEnabled: true,
      displayName: targetEntry.displayName,
      durationSec: targetEntry.durationSec,
      trimStartSec: targetEntry.trimStartSec,
      trimEndSec: targetEntry.trimEndSec,
      loopGapMs: 0,
      fadeOutMs: Math.round(this.loopConfig.crossfadeDurationSec * 1000),
    };

    try {
      await this.cloudAdapter.saveSystemAudioConfig(nextConfig);

      // Cập nhật trạng thái isActive trong danh mục /sound_catalog
      for (const [id, item] of this.soundCatalog.entries()) {
        const shouldBeActive = id === soundId;
        if (item.isActive !== shouldBeActive) {
          const updatedItem: SoundCatalogEntry = {
            ...item,
            isActive: shouldBeActive,
            updatedAt: writeTimeMs,
            updatedBy: ADMIN_EMAIL,
          };
          this.soundCatalog.set(id, updatedItem);
          if (this.cloudAdapter.saveSoundCatalogEntry) {
            await this.cloudAdapter.saveSoundCatalogEntry(updatedItem).catch(() => {});
          }
        }
      }

      // Dọn bản nháp nếu có
      this.tracks.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
      this.audioBuffers.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
      this.rawBlobs.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
      this.stagedAudioPackage = null;
      this.stagedPackageBinary = null;
      this.stagedDecodedBuffer = null;

      await this.applySharedAudioConfigSnapshot(nextConfig);
      const activeTrack = this.tracks.get(SHARED_SYSTEM_BGM_ID);
      return {
        success: true,
        track: activeTrack,
        config: nextConfig,
      };
    } catch (err: any) {
      const errMsg = err?.message || 'Không thể lưu cấu hình kích hoạt âm thanh lên Firestore.';
      this.sharedSyncError = errMsg;
      this.notify();
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  public async deleteCatalogSound(soundId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền xóa âm thanh khỏi danh mục.',
      };
    }
    const entry = this.soundCatalog.get(soundId);
    try {
      if (entry) {
        await this.cloudAdapter.deleteAudioBinary(entry.storagePath).catch(() => {});
      }
      if (this.cloudAdapter.deleteSoundCatalogEntry) {
        await this.cloudAdapter.deleteSoundCatalogEntry(soundId);
      }
      this.soundCatalog.delete(soundId);
      if (this.sharedAudioConfig?.soundId === soundId || (entry && this.sharedAudioConfig?.assetPath === entry.storagePath)) {
        await this.removeSharedSystemAudio();
      }
      this.notify();
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Không thể xóa âm thanh khỏi danh mục.',
      };
    }
  }

  /**
   * Phát hành dữ liệu âm thanh nhị phân đã qua kiểm tra thành cấu hình nhạc nền chung `/system_config/audio`
   * theo chuẩn M7.3.3 (`assetPath: "audio/<fileName>"`, không lưu `downloadURL` hay `storagePath`).
   * Đảm bảo file phải có mặt trên static asset server (`public/audio/`) trước khi cập nhật Firestore.
   */
  public async publishBinaryAsSharedSystemAudio(params: {
    fileName: string;
    displayName?: string;
    contentType: string;
    fileSize: number;
    durationSec: number;
    trimBounds: SilenceTrimBounds;
    decodedBuffer: {
      duration: number;
      sampleRate: number;
      numberOfChannels: number;
      getChannelData: (channel: number) => Float32Array;
    };
    arrayBuffer: ArrayBuffer;
    sourceInfo?: MusicTrackMetadata['sourceInfo'];
    nowMs?: number;
  }): Promise<{
    success: boolean;
    track?: MusicTrackMetadata;
    config?: SystemAudioConfigDocument;
    error?: string;
  }> {
    if (!this.canManageMusic()) {
      return {
        success: false,
        error: 'Chỉ Admin duy nhất (linhnk2013@gmail.com) mới có quyền cập nhật nhạc nền chung toàn hệ thống.',
      };
    }

    const stageRes = await this.stageAudioBufferForGitHubPages({
      fileName: params.fileName,
      displayName: params.displayName,
      contentType: params.contentType,
      fileSize: params.fileSize,
      decodedBuffer: params.decodedBuffer,
      arrayBuffer: params.arrayBuffer,
      sourceInfo: params.sourceInfo,
      nowMs: params.nowMs,
    });

    if (!stageRes.success || !stageRes.stagedPackage) {
      return { success: false, error: stageRes.error };
    }

    const staged = stageRes.stagedPackage;
    const previousConfig =
      this.sharedAudioConfig ?? (await this.cloudAdapter.getSystemAudioConfig().catch(() => null));
    const oldAssetPath = previousConfig?.assetPath || null;

    this.isCloudSyncInProgress = true;
    this.sharedSyncError = null;
    this.notify();

    // Bước 1: Đảm bảo file có mặt trong `public/audio/` (deploy static asset hoặc xác minh trên GitHub Pages)
    let deployedAssetPath = staged.assetPath;
    try {
      const deployResult = await this.cloudAdapter.uploadAudioBinary(
        staged.assetPath,
        params.arrayBuffer,
        staged.contentType
      );
      deployedAssetPath = deployResult.assetPath;
    } catch (deployErr: any) {
      this.isCloudSyncInProgress = false;
      const errText =
        deployErr?.message ||
        'File nhạc chưa được phát hành lên public/audio/ trên GitHub Pages. Đã giữ nguyên cấu hình nhạc nền hiện tại.';
      this.sharedSyncError = errText;
      this.notify();
      return {
        success: false,
        error: errText,
      };
    }

    // Bước 2: Cập nhật tài liệu cấu hình chung /system_config/audio trên Firestore (chỉ lưu assetPath tương đối)
    const writeTimeMs = params.nowMs ?? Date.now();
    const nextConfig: SystemAudioConfigDocument = {
      assetPath: deployedAssetPath,
      fileName: staged.normalizedFileName,
      contentType: staged.contentType,
      fileSize: params.fileSize,
      updatedAt: writeTimeMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: staged.targetVersion,
      isEnabled: true,
      displayName: staged.displayName,
      durationSec: params.durationSec,
      trimStartSec: params.trimBounds.trimStartSec,
      trimEndSec: params.trimBounds.trimEndSec,
      loopGapMs: 0,
      fadeOutMs: Math.round(this.loopConfig.crossfadeDurationSec * 1000),
    };

    try {
      await this.cloudAdapter.saveSystemAudioConfig(nextConfig);
    } catch (firestoreErr: any) {
      // Rollback: Nếu ghi Firestore thất bại thì dọn file mới trong bộ nhớ mô phỏng (nếu khác file cũ)
      // và giữ nguyên cấu hình đang hoạt động!
      if (deployedAssetPath && deployedAssetPath !== oldAssetPath) {
        await this.cloudAdapter.deleteAudioBinary(deployedAssetPath).catch(() => {});
      }
      this.isCloudSyncInProgress = false;
      const errText =
        firestoreErr?.message ||
        'Phát hành file thành công nhưng ghi tài liệu Firestore (/system_config/audio) thất bại.';
      this.sharedSyncError = errText;
      this.notify();
      return {
        success: false,
        error: `Cập nhật Firestore thất bại (đã giữ nguyên nhạc nền hiện tại): ${errText}`,
      };
    }

    const runtimeUrl = buildGitHubPagesAudioUrl(deployedAssetPath, staged.targetVersion);
    const metadata: MusicTrackMetadata = {
      id: SHARED_SYSTEM_BGM_ID,
      displayName: staged.displayName,
      fileName: staged.normalizedFileName,
      mimeType: staged.contentType,
      sizeBytes: params.fileSize,
      durationSec: params.durationSec,
      uploadedAt: writeTimeMs,
      sourceInfo: params.sourceInfo,
      trimBounds: params.trimBounds,
      storageProvider: 'GITHUB_PAGES_STATIC',
      storagePathOrUrl: runtimeUrl,
    };

    this.tracks.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.audioBuffers.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.rawBlobs.delete(STAGED_LOCAL_PREVIEW_BGM_ID);
    this.stagedAudioPackage = null;
    this.stagedPackageBinary = null;
    this.stagedDecodedBuffer = null;

    this.sharedAudioConfig = nextConfig;
    this.loadedSharedVersion = staged.targetVersion;
    this.loadedSharedAssetPath = deployedAssetPath;
    this.tracks.set(SHARED_SYSTEM_BGM_ID, metadata);
    if (typeof AudioBuffer !== 'undefined' && params.decodedBuffer instanceof AudioBuffer) {
      this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, params.decodedBuffer);
    } else {
      this.audioBuffers.set(SHARED_SYSTEM_BGM_ID, params.decodedBuffer as unknown as AudioBuffer);
    }
    this.rawBlobs.set(SHARED_SYSTEM_BGM_ID, params.arrayBuffer);
    this.assignments.globalTrackId = SHARED_SYSTEM_BGM_ID;
    this.isCloudSyncInProgress = false;
    this.sharedSyncError = null;

    this.savePersistedState();
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
    this.notify();

    return {
      success: true,
      track: metadata,
      config: nextConfig,
    };
  }

  /**
   * Bật hoặc tắt nhạc nền chung toàn hệ thống trên `/system_config/audio` (chỉ Super Admin).
   */
  public async setSharedSystemAudioEnabled(
    enabled: boolean,
    nowMs?: number
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.canManageMusic()) {
      return { success: false, error: 'Chỉ Super Admin mới có quyền bật/tắt nhạc nền chung.' };
    }
    const current = this.sharedAudioConfig ?? (await this.cloudAdapter.getSystemAudioConfig().catch(() => null));
    if (!current) {
      return { success: false, error: 'Chưa có bài nhạc nền chung nào trên hệ thống.' };
    }
    const nextConfig: SystemAudioConfigDocument = {
      ...current,
      isEnabled: enabled,
      updatedAt: nowMs ?? Date.now(),
      updatedBy: SUPER_ADMIN_EMAIL,
      version: current.version + 1,
    };
    try {
      await this.cloudAdapter.saveSystemAudioConfig(nextConfig);
      await this.applySharedAudioConfigSnapshot(nextConfig);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Không thể cập nhật trạng thái nhạc nền chung trên Firestore.',
      };
    }
  }

  /**
   * Xóa cấu hình nhạc nền chung toàn hệ thống trên Firestore và khôi phục về nhạc nền 8-bit mặc định
   * cho toàn bộ người chơi (không tự ý xóa file vật lý trong kho mã nguồn GitHub của người dùng).
   */
  public async removeSharedSystemAudio(): Promise<{ success: boolean; error?: string }> {
    if (!this.canManageMusic()) {
      return { success: false, error: 'Chỉ Super Admin mới có quyền xóa cấu hình nhạc nền chung.' };
    }

    try {
      await this.cloudAdapter.deleteSystemAudioConfig();
      await this.applySharedAudioConfigSnapshot(null);
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Không thể xóa cấu hình nhạc nền chung trên Firestore.',
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
    } else {
      this.audioBuffers.set(id, params.audioBuffer as unknown as AudioBuffer);
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
    if (trackId === SHARED_SYSTEM_BGM_ID && this.sharedAudioConfig) {
      const updatedConfig: SystemAudioConfigDocument = {
        ...this.sharedAudioConfig,
        displayName: track.displayName.slice(0, 120),
        updatedAt: Date.now(),
        updatedBy: SUPER_ADMIN_EMAIL,
        version: this.sharedAudioConfig.version + 1,
      };
      this.sharedAudioConfig = updatedConfig;
      void this.cloudAdapter.saveSystemAudioConfig(updatedConfig).catch(() => {});
    }
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

    if (trackId === SHARED_SYSTEM_BGM_ID) {
      return await this.uploadTrack(newFile, existing.displayName, existing.sourceInfo);
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
    if (typeof AudioBuffer !== 'undefined' && params.audioBuffer instanceof AudioBuffer) {
      this.audioBuffers.set(trackId, params.audioBuffer);
    } else {
      this.audioBuffers.set(trackId, params.audioBuffer as unknown as AudioBuffer);
    }
    if (this.activeTrackId === trackId && this.isPlaying && !this.isPaused) {
      this.stopAllCustomSources();
      this.startTrackBufferPlayback(trackId);
    }
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

    if (trackId === SHARED_SYSTEM_BGM_ID) {
      void this.removeSharedSystemAudio();
    }

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
   * Đảm bảo tôn trọng chính sách autoplay của trình duyệt:
   * Nếu AudioContext đang ở trạng thái `suspended` (người dùng chưa tương tác với trang),
   * không cưỡng bức phát mà đăng ký lắng nghe tương tác hợp lệ đầu tiên (`pointerdown`, `keydown`, `touchstart`)
   * để tự động mở khóa AudioContext và phát nhạc nền ngay sau tương tác.
   */
  private ensureAutoplayInteractionUnlock(): void {
    if (typeof window === 'undefined' || this.hasPendingAutoplayUnlockListener) {
      return;
    }
    this.hasPendingAutoplayUnlockListener = true;

    const handleFirstInteraction = () => {
      this.hasPendingAutoplayUnlockListener = false;
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);

      try {
        SoundManager.getInstance().unlock();
        if (!this.isPaused && SoundManager.getInstance().getSettings().bgmEnabled) {
          this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
        }
      } catch {
        // Không làm ảnh hưởng gameplay nếu trình duyệt từ chối
      }
    };

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true, passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true, passive: true });
    window.addEventListener('touchstart', handleFirstInteraction, { once: true, passive: true });
  }

  /**
   * Synchronizes BGM playback when transitioning stages or changing modes.
   * Guarantees zero overlapping BGM instances (M7.3.7 Section IV).
   */
  public syncPlaybackWithContext(
    stageId: number,
    mode: GameModeScope = 'SOLO'
  ): void {
    this.activeContext = { stageId, mode };
    this.previewTrackId = null;
    const resolved = this.resolveEffectiveTrack(stageId, mode);
    const soundManager = SoundManager.getInstance();
    const audioSettings = soundManager.getSettings();

    this.activeTrackId = resolved.trackId;

    // Always stop all previous custom BGM sources and procedural BGM first
    this.stopAllCustomSources();

    if (!audioSettings.bgmEnabled || this.isPaused) {
      soundManager.setCustomBgmActive(Boolean(resolved.trackId));
      soundManager.stopBgm();
      this.isPlaying = false;
      this.notify();
      return;
    }

    // If a custom track is resolved AND we have its decoded AudioBuffer
    if (resolved.trackId && this.audioBuffers.has(resolved.trackId)) {
      // Lock procedural BGM off so two BGM tracks can never overlap even on pointerdown/keydown unlock()
      soundManager.setCustomBgmActive(true);
      soundManager.stopBgm();
      this.isPlaying = true;
      this.startTrackBufferPlayback(resolved.trackId);
    } else {
      // M7.3.9 Requirement 8: Built-in 8-bit procedural BGM is disabled; stay silent when no custom track is active
      soundManager.setCustomBgmActive(false);
      soundManager.stopBgm();
      this.isPlaying = false;
    }

    this.notify();
  }

  private startTrackBufferPlayback(trackId: string, withFadeIn: boolean = false): void {
    // Ensure any previous source is completely stopped before starting a new source
    this.stopAllCustomSources();
    const myGenId = ++this.playbackGenerationId;

    const buffer = this.audioBuffers.get(trackId);
    const meta = this.tracks.get(trackId);
    const soundManager = SoundManager.getInstance();
    const ctx = soundManager.initContext();

    if (!buffer || !meta) {
      soundManager.setCustomBgmActive(false);
      soundManager.stopBgm();
      this.isPlaying = false;
      return;
    }

    // Lock procedural BGM off while custom track is active
    soundManager.setCustomBgmActive(true);
    soundManager.stopBgm();

    // Headless / Node test environment where Web Audio API AudioContext is unavailable:
    // Track a single virtual active source so anti-overlap & lifecycle invariants can be verified deterministically.
    if (!ctx) {
      const virtualSource = {
        stop: () => {
          this.activeSources.delete(virtualSource);
        },
        disconnect: () => {
          this.activeSources.delete(virtualSource);
        },
        onended: null as (() => void) | null,
      };
      this.activeSources.add(virtualSource);
      return;
    }

    if ((ctx as AudioContext).state === 'suspended') {
      this.ensureAutoplayInteractionUnlock();
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

        const fadeOutStart = now + playDuration - fadeSec;
        gainNode.gain.setValueAtTime(targetVol, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.001, now + playDuration);

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(now, startOffset, playDuration);
        this.activeSources.add(source);
        this.currentSource = source;
        this.currentGain = gainNode;

        if (this.nextCrossfadeTimer !== null) {
          clearTimeout(this.nextCrossfadeTimer);
        }
        const nextTriggerMs = Math.max(50, (playDuration - fadeSec) * 1000);
        this.nextCrossfadeTimer = setTimeout(() => {
          if (
            this.playbackGenerationId === myGenId &&
            this.isPlaying &&
            !this.isPaused &&
            (this.previewTrackId === trackId || (!this.previewTrackId && this.activeTrackId === trackId))
          ) {
            this.startTrackBufferPlayback(trackId, true);
          }
        }, nextTriggerMs);
      } else {
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
      this.stopAllCustomSources();
      soundManager.setCustomBgmActive(false);
      soundManager.stopBgm();
      this.isPlaying = false;
    }
  }

  public stopAllCustomSources(): void {
    this.playbackGenerationId++;
    if (this.nextCrossfadeTimer !== null) {
      clearTimeout(this.nextCrossfadeTimer);
      this.nextCrossfadeTimer = null;
    }
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeSources.clear();
    if (this.currentGain) {
      try {
        this.currentGain.disconnect();
      } catch {
        // ignore
      }
    }
    this.currentSource = null;
    this.currentGain = null;
  }

  public pause(): void {
    this.isPaused = true;
    this.isPlaying = false;
    this.previewTrackId = null;
    this.stopAllCustomSources();
    SoundManager.getInstance().stopBgm();
    this.notify();
  }

  public resume(): void {
    this.isPaused = false;
    this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
  }

  public onVolumeOrToggleChanged(): void {
    const soundManager = SoundManager.getInstance();
    const settings = soundManager.getSettings();
    if (!settings.bgmEnabled) {
      this.stopAllCustomSources();
      soundManager.stopBgm();
      this.isPlaying = false;
      this.notify();
      return;
    }
    if (this.currentGain && this.currentSource) {
      const ctx = soundManager.initContext();
      if (ctx) {
        this.currentGain.gain.setValueAtTime(settings.bgmVolume, ctx.currentTime);
      }
    } else if (!this.isPaused) {
      if (this.previewTrackId && this.tracks.has(this.previewTrackId)) {
        this.previewTrack(this.previewTrackId);
      } else {
        this.syncPlaybackWithContext(this.activeContext.stageId, this.activeContext.mode);
      }
    }
  }

  /**
   * Preview a specific track in the Admin Manager without changing scope assignments.
   * Stops any currently playing BGM or preview before starting the requested preview track.
   */
  public previewTrack(trackId: string): boolean {
    if (!this.tracks.has(trackId)) return false;
    const soundManager = SoundManager.getInstance();
    soundManager.setCustomBgmActive(true);
    soundManager.unlock();
    soundManager.stopBgm();
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

  public getActiveTrackId(): string | null {
    return this.previewTrackId ?? this.activeTrackId;
  }

  public getPlaybackGenerationId(): number {
    return this.playbackGenerationId;
  }

  /**
   * Returns count of simultaneously active custom BGM sources (for anti-overlap verification).
   */
  public getActiveSourceCount(): number {
    return this.activeSources.size;
  }

  // =========================================================================
  // PERSISTENCE (LocalStorage Metadata Only - NEVER stores audio binary/Base64)
  // =========================================================================

  public reloadPersistedState(): void {
    this.loadPersistedState();
  }

  private loadPersistedState(): void {
    if (typeof window === 'undefined') return;
    try {
      // M7.3 Security Enforcement: Never load user role from localStorage.
      // Remove any legacy or tampered role key only if present.
      if (localStorage.getItem(MUSIC_STORAGE_KEYS.USER_ROLE) !== null) {
        localStorage.removeItem(MUSIC_STORAGE_KEYS.USER_ROLE);
      }
      if (localStorage.getItem(MUSIC_STORAGE_KEYS.TRACKS_META) !== null) {
        localStorage.removeItem(MUSIC_STORAGE_KEYS.TRACKS_META);
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
      // M7.3.3: Không lưu file nhạc hay danh sách nhạc nhị phân vào localStorage
      if (localStorage.getItem(MUSIC_STORAGE_KEYS.TRACKS_META) !== null) {
        localStorage.removeItem(MUSIC_STORAGE_KEYS.TRACKS_META);
      }
    } catch {
      // ignore quota errors
    }
  }
}
