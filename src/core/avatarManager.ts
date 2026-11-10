/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.3.5 / M7.3.5.1 / M7.3.5.2 – FIREBASE STORAGE SHARED AVATAR CATALOG & GRANULAR SECURITY RULES
 *
 * Kiến trúc bắt buộc:
 * - Loại bỏ hoàn toàn Cloudflare R2 / Cloudflare Worker và tính năng người chơi tự upload ảnh cá nhân.
 * - Chỉ Super Admin duy nhất (`linhnk.online@gmail.com`) được upload, thay thế (qua version mới `v{version + 1}`),
 *   bật/tắt (`isActive`) và xóa avatar trong danh mục dùng chung trên Firebase Storage
 *   (`avatar_catalog/{avatarId}/v{version}/{fileName}`) kèm metadata trong Cloud Firestore (`/avatar_catalog/{avatarId}`).
 * - Firebase Storage Security Rules (`storage.rules`, `rules_version = '2'`) sử dụng phân quyền chi tiết:
 *   + `allow get`: chỉ Gmail cá nhân đã xác minh, đăng nhập qua Google (`google.com`), đúng đường dẫn hợp lệ.
 *   + `allow list: if false`: cấm liệt kê (`list`/`listAll`); client lấy danh mục từ Firestore (`/avatar_catalog`).
 *   + `allow create`: chỉ Super Admin, bắt buộc `resource == null && request.resource != null` (chặn tuyệt đối
 *     việc upload lần thứ 2 đè lên đường dẫn đã tồn tại), dung lượng `1..5242880` bytes, `image/jpeg|png|webp`.
 *   + `allow update: if false`: cấm cập nhật metadata hoặc ghi đè object cũ.
 *   + `allow delete`: chỉ Super Admin, bắt buộc `resource != null && request.resource == null`.
 * - Lưu ý kỹ thuật về Magic Bytes & Cơ chế tải ảnh:
 *   + `validateCatalogAvatarBinary()` và `createImageBitmap()` kiểm tra magic bytes nhị phân và kích thước pixel
 *     ngay tại trình duyệt trước khi upload; Storage Rules chỉ kiểm tra `size`, `contentType` và quyền Super Admin.
 *   + Không lưu Base64, dữ liệu nhị phân hoặc `downloadURL` kèm token cố định vào Firestore;
 *     không coi URL token dài hạn là cơ chế xác thực người dùng.
 *   + Hỗ trợ tải ảnh kiểm soát bởi Rules qua `getBlob()` (kèm `BlobUrlCacheManager` quản lý cache và
 *     `URL.revokeObjectURL` tránh rò rỉ bộ nhớ) và tự động fallback an toàn về `getDownloadURL()` khi bucket
 *     Production chưa cấu hình CORS để đảm bảo hiển thị ổn định trên PC, điện thoại và tablet.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  getBlob,
  getMetadata,
  deleteObject,
  type UploadTask,
} from 'firebase/storage';
import { getFirebaseDb, getFirebaseStorage } from './firebaseConfig.ts';
import {
  AuthManager,
  SUPER_ADMIN_EMAIL,
  validatePersonalGmailUser,
  isSuperAdminUser,
} from './authManager.ts';
import { SessionManager } from './sessionManager.ts';

export const AVATAR_LIMITS = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 5 MiB (5,242,880 bytes)
  MAX_WIDTH_PX: 2048,
  MAX_HEIGHT_PX: 2048,
  MAX_TOTAL_PIXELS: 2048 * 2048, // 4,194,304 pixels
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp'] as const,
  UID_REGEX: /^[a-zA-Z0-9_-]{1,128}$/,
  AVATAR_ID_REGEX: /^[A-Za-z0-9_-]{1,64}$/,
  VERSION_SEGMENT_REGEX: /^v[1-9][0-9]*$/,
  FILE_NAME_REGEX: /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/,
  STORAGE_PATH_REGEX:
    /^avatar_catalog\/([A-Za-z0-9_-]+)\/v([1-9][0-9]*)\/([A-Za-z0-9._-]+\.(jpg|jpeg|png|webp))$/,
} as const;

export type AllowedAvatarContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedAvatarFormat = 'JPEG' | 'PNG' | 'WEBP';
export type PlayerAvatarType = 'google' | 'catalog';

export interface AvatarBinaryValidationResult {
  valid: boolean;
  format?: AllowedAvatarFormat;
  contentType?: AllowedAvatarContentType;
  width?: number;
  height?: number;
  totalPixels?: number;
  sizeBytes: number;
  errorCode?:
    | 'EMPTY_FILE'
    | 'FILE_TOO_LARGE'
    | 'UNSUPPORTED_FORMAT'
    | 'CORRUPTED_HEADER'
    | 'DIMENSIONS_TOO_LARGE';
  errorMessage?: string;
}

export interface AvatarCatalogItem {
  avatarId: string;
  name: string;
  storagePath: string;
  contentType: AllowedAvatarContentType;
  fileSize: number;
  version: number;
  sortOrder: number;
  isActive: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  updatedBy: string;
}

export interface UserProfileAvatarMetadata {
  uid: string;
  displayName?: string | null;
  avatarType: PlayerAvatarType;
  avatarId: string | null;
  avatarUpdatedAtMs: number;
}

export interface StagedCatalogAvatarFile {
  fileName: string;
  sanitizedFileName: string;
  contentType: AllowedAvatarContentType;
  format: AllowedAvatarFormat;
  sizeBytes: number;
  width: number;
  height: number;
  totalPixels: number;
  arrayBuffer: ArrayBuffer;
  previewObjectUrl: string | null;
}

/**
 * Ba trạng thái bắt buộc của tiến trình upload phục hồi sau F5 (M7.3.5.5 Mục III.B2):
 * - `UPLOAD_IN_PROGRESS`: Đã tạo bản ghi pending và cấp `storagePath`, bắt đầu upload nhưng chưa xác nhận hoàn tất.
 * - `UPLOAD_CONFIRMED_METADATA_PENDING`: Storage đã xác nhận upload thành công, nhưng Firestore metadata chưa được ghi thành công.
 * - `UPLOAD_INDETERMINATE`: Upload đã bắt đầu hoặc bị ngắt giữa chừng (bao gồm bản ghi `UPLOAD_IN_PROGRESS` được khôi phục sau F5), chưa xác nhận được kết quả.
 */
export type PendingUploadStatus =
  | 'UPLOAD_IN_PROGRESS'
  | 'UPLOAD_CONFIRMED_METADATA_PENDING'
  | 'UPLOAD_INDETERMINATE';

export interface PendingCatalogMetadataSync {
  ownerUid: string;
  avatarId: string;
  name: string;
  storagePath: string;
  fileName: string;
  contentType: AllowedAvatarContentType;
  fileSize: number;
  version: number;
  sortOrder: number;
  isActive: boolean;
  updatedBy: string;
  isUpdate: boolean;
  uploadOperationId: string;
  createdAt: number;
  status: PendingUploadStatus;
  failedAtMs: number;
  errorMessage: string;
}

export const FORBIDDEN_PENDING_UPLOAD_RECORD_KEYS = [
  'downloadURL',
  'avatarUrl',
  'capabilityToken',
  'token',
  'downloadTokens',
  'idToken',
  'firebaseIdToken',
  'authToken',
  'refreshToken',
  'oauthToken',
  'oauthAccessToken',
  'accessToken',
  'base64',
  'dataUrl',
  'arrayBuffer',
  'blob',
  'bytes',
  'imageBinary',
  'serviceAccount',
  'privateKey',
  'clientSecret',
] as const;

export const ALLOWED_PENDING_UPLOAD_RECORD_KEYS = [
  'ownerUid',
  'avatarId',
  'name',
  'storagePath',
  'fileName',
  'contentType',
  'fileSize',
  'version',
  'sortOrder',
  'isActive',
  'updatedBy',
  'isUpdate',
  'uploadOperationId',
  'createdAt',
  'status',
  'failedAtMs',
  'errorMessage',
] as const;

/**
 * Kiểm tra nghiêm ngặt bản ghi pending trước khi ghi/đọc từ IndexedDB hoặc localStorage (M7.3.5.5 Mục III.B2):
 * - Chỉ cho phép các trường tối thiểu cần thiết.
 * - Tuyệt đối cấm lưu `downloadURL`, capability token, Firebase ID Token, OAuth token,
 *   nội dung ảnh Base64/nhị phân hoặc thông tin xác thực hệ thống.
 */
export function validatePendingUploadRecordNoSecrets(
  record: unknown
): { valid: boolean; sanitized?: PendingCatalogMetadataSync; reason?: string } {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { valid: false, reason: 'Bản ghi pending không phải là object hợp lệ.' };
  }
  const raw = record as Record<string, unknown>;

  for (const forbiddenKey of FORBIDDEN_PENDING_UPLOAD_RECORD_KEYS) {
    if (forbiddenKey in raw && raw[forbiddenKey] !== undefined && raw[forbiddenKey] !== null) {
      return {
        valid: false,
        reason: `Phát hiện trường bị cấm "${forbiddenKey}" trong bản ghi pending.`,
      };
    }
  }

  for (const key of Object.keys(raw)) {
    if (!(ALLOWED_PENDING_UPLOAD_RECORD_KEYS as readonly string[]).includes(key)) {
      return {
        valid: false,
        reason: `Trường không nằm trong danh mục tối thiểu được phép: "${key}".`,
      };
    }
    const val = raw[key];
    if (
      val instanceof ArrayBuffer ||
      ArrayBuffer.isView(val) ||
      (typeof Blob !== 'undefined' && val instanceof Blob)
    ) {
      return {
        valid: false,
        reason: `Phát hiện dữ liệu nhị phân tại trường "${key}".`,
      };
    }
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (
        lower.startsWith('data:image/') ||
        lower.includes('?alt=media&token=') ||
        lower.includes('firebasestorage.googleapis.com') ||
        lower.startsWith('eyjhbgcioi') // JWT header prefix 'eyJhbGciOi'
      ) {
        return {
          valid: false,
          reason: `Phát hiện chuỗi URL chứa token, JWT hoặc Base64 tại trường "${key}".`,
        };
      }
    }
  }

  const ownerUid = typeof raw.ownerUid === 'string' ? raw.ownerUid.trim() : '';
  const avatarId = typeof raw.avatarId === 'string' ? raw.avatarId.trim() : '';
  const storagePath = typeof raw.storagePath === 'string' ? raw.storagePath.trim() : '';
  const fileName = typeof raw.fileName === 'string' ? raw.fileName.trim() : '';
  const uploadOperationId =
    typeof raw.uploadOperationId === 'string' ? raw.uploadOperationId.trim() : '';
  const status = raw.status as PendingUploadStatus;
  const contentType = raw.contentType as AllowedAvatarContentType;
  const version = typeof raw.version === 'number' ? Math.floor(raw.version) : 0;
  const fileSize = typeof raw.fileSize === 'number' ? Math.floor(raw.fileSize) : 0;
  const createdAt = typeof raw.createdAt === 'number' ? Math.floor(raw.createdAt) : 0;

  if (!ownerUid || !AVATAR_LIMITS.UID_REGEX.test(ownerUid)) {
    return { valid: false, reason: 'Thiếu hoặc sai định dạng ownerUid.' };
  }
  if (!avatarId || !AVATAR_LIMITS.AVATAR_ID_REGEX.test(avatarId)) {
    return { valid: false, reason: 'Thiếu hoặc sai định dạng avatarId.' };
  }
  if (!storagePath || !AVATAR_LIMITS.STORAGE_PATH_REGEX.test(storagePath)) {
    return { valid: false, reason: 'Thiếu hoặc sai định dạng storagePath.' };
  }
  if (!fileName || !AVATAR_LIMITS.FILE_NAME_REGEX.test(fileName)) {
    return { valid: false, reason: 'Thiếu hoặc sai định dạng fileName.' };
  }
  if (!uploadOperationId || uploadOperationId.length < 8) {
    return { valid: false, reason: 'Thiếu hoặc sai định dạng uploadOperationId.' };
  }
  if (
    status !== 'UPLOAD_IN_PROGRESS' &&
    status !== 'UPLOAD_CONFIRMED_METADATA_PENDING' &&
    status !== 'UPLOAD_INDETERMINATE'
  ) {
    return { valid: false, reason: 'Trạng thái status không hợp lệ.' };
  }
  if (
    contentType !== 'image/jpeg' &&
    contentType !== 'image/png' &&
    contentType !== 'image/webp'
  ) {
    return { valid: false, reason: 'Định dạng contentType không hợp lệ.' };
  }
  if (version < 1 || fileSize < 1 || fileSize > AVATAR_LIMITS.MAX_FILE_SIZE_BYTES || createdAt <= 0) {
    return { valid: false, reason: 'version, fileSize hoặc createdAt không hợp lệ.' };
  }

  const sanitized: PendingCatalogMetadataSync = {
    ownerUid,
    avatarId,
    name: typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name.trim() : avatarId,
    storagePath,
    fileName,
    contentType,
    fileSize,
    version,
    sortOrder: typeof raw.sortOrder === 'number' ? Math.floor(raw.sortOrder) : 0,
    isActive: typeof raw.isActive === 'boolean' ? raw.isActive : true,
    updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : SUPER_ADMIN_EMAIL,
    isUpdate: Boolean(raw.isUpdate),
    uploadOperationId,
    createdAt,
    status,
    failedAtMs: typeof raw.failedAtMs === 'number' ? Math.floor(raw.failedAtMs) : createdAt,
    errorMessage: typeof raw.errorMessage === 'string' ? raw.errorMessage : '',
  };

  return { valid: true, sanitized };
}

export interface UsedPathHistoryEntry {
  storagePath: string;
  avatarId: string;
  version: number;
  uploadOperationId: string;
  recordedAt: number;
}

export interface PendingUploadPersistentStore {
  getBackendType(): 'INDEXED_DB' | 'LOCAL_STORAGE_FALLBACK' | 'DURABLE_MEMORY_SIMULATION';
  getFallbackTechnicalReason(): string | null;
  savePendingRecord(record: PendingCatalogMetadataSync): Promise<void>;
  getPendingRecord(avatarId: string): Promise<PendingCatalogMetadataSync | null>;
  getAllPendingRecords(): Promise<PendingCatalogMetadataSync[]>;
  deletePendingRecord(avatarId: string): Promise<void>;
  recordUsedOrIndeterminatePath(entry: UsedPathHistoryEntry): Promise<void>;
  getAllUsedOrIndeterminatePaths(): Promise<UsedPathHistoryEntry[]>;
}

/**
 * Kho lưu trữ bền vững cho bản ghi Pending Upload trên trình duyệt (M7.3.5.5 Mục III.B2):
 * - Ưu tiên IndexedDB (`bantank_avatar_pending_recovery_v1`) vì hỗ trợ giao dịch nguyên tử (transactional durability),
 *   tách biệt khỏi bộ nhớ đồng bộ và không bị ghi đè bởi các tác vụ localStorage thông thường.
 * - Chỉ fallback sang `localStorage` khi môi trường thực thi không có `indexedDB` (ví dụ môi trường Node test hoặc
 *   trình duyệt khóa IndexedDB trong chế độ hạn chế), kèm lý do kỹ thuật tường minh.
 */
export class BrowserPendingUploadPersistentStore implements PendingUploadPersistentStore {
  private static readonly DB_NAME = 'bantank_avatar_pending_recovery_v1';
  private static readonly DB_VERSION = 1;
  private static readonly STORE_PENDING = 'pending_uploads';
  private static readonly STORE_USED_PATHS = 'used_storage_paths';
  private static readonly LS_PENDING_KEY = 'bantank_m7_3_5_5_pending_uploads_v1';
  private static readonly LS_USED_PATHS_KEY = 'bantank_m7_3_5_5_used_paths_v1';

  private dbPromise: Promise<IDBDatabase> | null = null;
  private forcedFallbackReason: string | null = null;

  private isIndexedDbSupported(): boolean {
    if (this.forcedFallbackReason) return false;
    return typeof globalThis.indexedDB !== 'undefined' && globalThis.indexedDB !== null;
  }

  public getBackendType(): 'INDEXED_DB' | 'LOCAL_STORAGE_FALLBACK' {
    return this.isIndexedDbSupported() ? 'INDEXED_DB' : 'LOCAL_STORAGE_FALLBACK';
  }

  public getFallbackTechnicalReason(): string | null {
    if (this.isIndexedDbSupported()) return null;
    return (
      this.forcedFallbackReason ||
      'API globalThis.indexedDB không khả dụng trong môi trường thực thi hiện tại nên hệ thống chuyển sang localStorage fallback có kiểm soát schema.'
    );
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const req = globalThis.indexedDB.open(
          BrowserPendingUploadPersistentStore.DB_NAME,
          BrowserPendingUploadPersistentStore.DB_VERSION
        );
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(BrowserPendingUploadPersistentStore.STORE_PENDING)) {
            db.createObjectStore(BrowserPendingUploadPersistentStore.STORE_PENDING, {
              keyPath: 'avatarId',
            });
          }
          if (!db.objectStoreNames.contains(BrowserPendingUploadPersistentStore.STORE_USED_PATHS)) {
            db.createObjectStore(BrowserPendingUploadPersistentStore.STORE_USED_PATHS, {
              keyPath: 'storagePath',
            });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          const err = req.error || new Error('IndexedDB open error');
          this.forcedFallbackReason = `Không mở được IndexedDB (${err.message}); chuyển sang localStorage fallback.`;
          this.dbPromise = null;
          reject(err);
        };
      } catch (err: any) {
        this.forcedFallbackReason = `Ngoại lệ khi khởi tạo IndexedDB (${err?.message || String(err)}); chuyển sang localStorage fallback.`;
        this.dbPromise = null;
        reject(err);
      }
    });
    return this.dbPromise;
  }

  public async savePendingRecord(record: PendingCatalogMetadataSync): Promise<void> {
    const check = validatePendingUploadRecordNoSecrets(record);
    if (!check.valid || !check.sanitized) {
      throw new Error(check.reason || 'Bản ghi pending không hợp lệ.');
    }
    const clean = check.sanitized;

    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            [
              BrowserPendingUploadPersistentStore.STORE_PENDING,
              BrowserPendingUploadPersistentStore.STORE_USED_PATHS,
            ],
            'readwrite'
          );
          tx.objectStore(BrowserPendingUploadPersistentStore.STORE_PENDING).put(clean);
          tx.objectStore(BrowserPendingUploadPersistentStore.STORE_USED_PATHS).put({
            storagePath: clean.storagePath,
            avatarId: clean.avatarId,
            version: clean.version,
            uploadOperationId: clean.uploadOperationId,
            recordedAt: clean.createdAt,
          } satisfies UsedPathHistoryEntry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('IndexedDB write transaction failed'));
        });
        return;
      } catch {
        // Nếu IndexedDB bị khóa/lỗi runtime -> thử fallback sang localStorage bên dưới
      }
    }

    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      throw new Error('Không thể ghi bản ghi pending: cả IndexedDB và localStorage đều không khả dụng.');
    }
    const all = this.readLocalStorageMap<PendingCatalogMetadataSync>(
      BrowserPendingUploadPersistentStore.LS_PENDING_KEY
    );
    all[clean.avatarId] = clean;
    globalThis.localStorage.setItem(
      BrowserPendingUploadPersistentStore.LS_PENDING_KEY,
      JSON.stringify(all)
    );
    await this.recordUsedOrIndeterminatePath({
      storagePath: clean.storagePath,
      avatarId: clean.avatarId,
      version: clean.version,
      uploadOperationId: clean.uploadOperationId,
      recordedAt: clean.createdAt,
    });
  }

  public async getPendingRecord(avatarId: string): Promise<PendingCatalogMetadataSync | null> {
    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        const raw = await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction(BrowserPendingUploadPersistentStore.STORE_PENDING, 'readonly');
          const req = tx.objectStore(BrowserPendingUploadPersistentStore.STORE_PENDING).get(avatarId);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
        if (!raw) return null;
        const validated = validatePendingUploadRecordNoSecrets(raw);
        return validated.valid && validated.sanitized ? validated.sanitized : null;
      } catch {
        // Fallback sang localStorage
      }
    }

    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      return null;
    }
    const all = this.readLocalStorageMap<unknown>(BrowserPendingUploadPersistentStore.LS_PENDING_KEY);
    const item = all[avatarId];
    if (!item) return null;
    const validated = validatePendingUploadRecordNoSecrets(item);
    return validated.valid && validated.sanitized ? validated.sanitized : null;
  }

  public async getAllPendingRecords(): Promise<PendingCatalogMetadataSync[]> {
    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        const rawList = await new Promise<unknown[]>((resolve, reject) => {
          const tx = db.transaction(BrowserPendingUploadPersistentStore.STORE_PENDING, 'readonly');
          const req = tx.objectStore(BrowserPendingUploadPersistentStore.STORE_PENDING).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error);
        });
        const validRecords: PendingCatalogMetadataSync[] = [];
        for (const raw of rawList) {
          const check = validatePendingUploadRecordNoSecrets(raw);
          if (check.valid && check.sanitized) {
            validRecords.push(check.sanitized);
          }
        }
        return validRecords;
      } catch {
        // Fallback sang localStorage
      }
    }

    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      return [];
    }
    const all = this.readLocalStorageMap<unknown>(BrowserPendingUploadPersistentStore.LS_PENDING_KEY);
    const validRecords: PendingCatalogMetadataSync[] = [];
    for (const raw of Object.values(all)) {
      const check = validatePendingUploadRecordNoSecrets(raw);
      if (check.valid && check.sanitized) {
        validRecords.push(check.sanitized);
      }
    }
    return validRecords;
  }

  public async deletePendingRecord(avatarId: string): Promise<void> {
    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(BrowserPendingUploadPersistentStore.STORE_PENDING, 'readwrite');
          tx.objectStore(BrowserPendingUploadPersistentStore.STORE_PENDING).delete(avatarId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch {
        // Fallback sang localStorage
      }
    }

    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
      const all = this.readLocalStorageMap<unknown>(
        BrowserPendingUploadPersistentStore.LS_PENDING_KEY
      );
      delete all[avatarId];
      globalThis.localStorage.setItem(
        BrowserPendingUploadPersistentStore.LS_PENDING_KEY,
        JSON.stringify(all)
      );
    }
  }

  public async recordUsedOrIndeterminatePath(entry: UsedPathHistoryEntry): Promise<void> {
    if (!entry.storagePath || !AVATAR_LIMITS.STORAGE_PATH_REGEX.test(entry.storagePath)) {
      return;
    }
    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            BrowserPendingUploadPersistentStore.STORE_USED_PATHS,
            'readwrite'
          );
          tx.objectStore(BrowserPendingUploadPersistentStore.STORE_USED_PATHS).put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        return;
      } catch {
        // Fallback sang localStorage
      }
    }

    if (typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage) {
      const all = this.readLocalStorageMap<UsedPathHistoryEntry>(
        BrowserPendingUploadPersistentStore.LS_USED_PATHS_KEY
      );
      all[entry.storagePath] = entry;
      globalThis.localStorage.setItem(
        BrowserPendingUploadPersistentStore.LS_USED_PATHS_KEY,
        JSON.stringify(all)
      );
    }
  }

  public async getAllUsedOrIndeterminatePaths(): Promise<UsedPathHistoryEntry[]> {
    if (this.isIndexedDbSupported()) {
      try {
        const db = await this.openDb();
        const rawList = await new Promise<UsedPathHistoryEntry[]>((resolve, reject) => {
          const tx = db.transaction(
            BrowserPendingUploadPersistentStore.STORE_USED_PATHS,
            'readonly'
          );
          const req = tx.objectStore(BrowserPendingUploadPersistentStore.STORE_USED_PATHS).getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error);
        });
        return rawList.filter(
          (item) =>
            item &&
            typeof item.storagePath === 'string' &&
            AVATAR_LIMITS.STORAGE_PATH_REGEX.test(item.storagePath)
        );
      } catch {
        // Fallback sang localStorage
      }
    }

    if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
      return [];
    }
    const all = this.readLocalStorageMap<UsedPathHistoryEntry>(
      BrowserPendingUploadPersistentStore.LS_USED_PATHS_KEY
    );
    return Object.values(all).filter(
      (item) =>
        item &&
        typeof item.storagePath === 'string' &&
        AVATAR_LIMITS.STORAGE_PATH_REGEX.test(item.storagePath)
    );
  }

  private readLocalStorageMap<T>(key: string): Record<string, T> {
    try {
      const raw = globalThis.localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

/**
 * Bộ lưu trữ bền vững mô phỏng IndexedDB phục vụ kiểm thử Unit & In-memory E2E (M7.3.5.5 Mục VI):
 * - Tồn tại độc lập với các biến RAM của trang (`simulatePageReloadF5()` không xóa dữ liệu trong store này).
 * - Hỗ trợ giả lập lỗi ghi (`setFailNextWrite(true)`) để kiểm chứng yêu cầu: nếu không ghi được bản ghi pending
 *   vào bộ nhớ bền vững thì phải dừng ngay TRƯỚC KHI gọi `uploadBytes`.
 */
export class DurableInMemoryPendingUploadStore implements PendingUploadPersistentStore {
  private pendingMap = new Map<string, PendingCatalogMetadataSync>();
  private usedPathsMap = new Map<string, UsedPathHistoryEntry>();
  private failNextWrite = false;

  public setFailNextWrite(fail: boolean): void {
    this.failNextWrite = fail;
  }

  public getBackendType(): 'DURABLE_MEMORY_SIMULATION' {
    return 'DURABLE_MEMORY_SIMULATION';
  }

  public getFallbackTechnicalReason(): string | null {
    return null;
  }

  public async savePendingRecord(record: PendingCatalogMetadataSync): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Simulated persistent store write failure (IndexedDB/localStorage blocked).');
    }
    const check = validatePendingUploadRecordNoSecrets(record);
    if (!check.valid || !check.sanitized) {
      throw new Error(check.reason || 'Invalid pending upload record');
    }
    const clean = { ...check.sanitized };
    this.pendingMap.set(clean.avatarId, clean);
    this.usedPathsMap.set(clean.storagePath, {
      storagePath: clean.storagePath,
      avatarId: clean.avatarId,
      version: clean.version,
      uploadOperationId: clean.uploadOperationId,
      recordedAt: clean.createdAt,
    });
  }

  public async getPendingRecord(avatarId: string): Promise<PendingCatalogMetadataSync | null> {
    const item = this.pendingMap.get(avatarId);
    return item ? { ...item } : null;
  }

  public async getAllPendingRecords(): Promise<PendingCatalogMetadataSync[]> {
    return Array.from(this.pendingMap.values(), (item) => ({ ...item }));
  }

  public async deletePendingRecord(avatarId: string): Promise<void> {
    this.pendingMap.delete(avatarId);
  }

  public async recordUsedOrIndeterminatePath(entry: UsedPathHistoryEntry): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('Simulated persistent store write failure.');
    }
    if (!entry.storagePath || !AVATAR_LIMITS.STORAGE_PATH_REGEX.test(entry.storagePath)) {
      return;
    }
    this.usedPathsMap.set(entry.storagePath, { ...entry });
  }

  public async getAllUsedOrIndeterminatePaths(): Promise<UsedPathHistoryEntry[]> {
    return Array.from(this.usedPathsMap.values(), (item) => ({ ...item }));
  }

  public inspectRawPendingRecord(avatarId: string): PendingCatalogMetadataSync | null {
    return this.pendingMap.get(avatarId) ?? null;
  }
}

export interface AvatarOperationResult {
  success: boolean;
  avatarId?: string | null;
  avatarType?: PlayerAvatarType;
  avatarUrl?: string | null;
  version?: number;
  storagePath?: string;
  uploadOperationId?: string;
  pendingStatus?: PendingUploadStatus;
  metadataSynced?: boolean;
  requiresMetadataRetry?: boolean;
  errorCode?: string;
  message?: string;
}

export const STORAGE_OVERWRITE_ENFORCEMENT_CLASSIFICATION =
  'APP-LEVEL IMMUTABLE PATH – BEST EFFORT, NOT ABSOLUTE STORAGE ENFORCEMENT' as const;

export const PRODUCTION_BUCKET_OBJECT_VERSIONING_STATUS = 'UNKNOWN' as const;

export const SECOND_UPLOAD_SAME_PATH_STORAGE_RULE_STATUS = 'NOT_PROVEN' as const;

/**
 * Trả về trạng thái kiểm chứng đối với thao tác `uploadBytes` lần thứ hai vào cùng một `storagePath`
 * ở tầng Firebase Storage Security Rules (M7.3.5.4 Mục II & III):
 * - Không tự kết luận `resource == null` hoặc `allow update: if false` chắc chắn chặn `uploadBytes` ghi đè
 *   khi chưa có kết quả thực thi trên môi trường Firebase Storage Emulator / Production thực tế.
 * - Khi chưa chạy được Emulator (do thiếu Java) và chưa kiểm chứng trên Production, bắt buộc trả về `'NOT_PROVEN'`.
 */
export function getSecondUploadSamePathStorageEnforcementVerdict(
  hasVerifiedFirebaseStorageRuntime: boolean = false
): 'NOT_PROVEN' {
  void hasVerifiedFirebaseStorageRuntime;
  return SECOND_UPLOAD_SAME_PATH_STORAGE_RULE_STATUS;
}

/**
 * Sinh chuỗi UUID v4 (RFC 4122) cho tên file bất biến trên Firebase Storage.
 */
export function generateCatalogFileUuid(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID().toLowerCase();
  }
  const bytes = new Uint8Array(16);
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Chuẩn hóa tên file an toàn cho đường dẫn `avatar_catalog/{avatarId}/v{version}/{fileName}`.
 */
export function sanitizeCatalogFileName(
  rawFileName: string,
  contentType: AllowedAvatarContentType
): string {
  const ext =
    contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const base = (rawFileName || 'avatar')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  const safeBase = base.length > 0 ? base : 'avatar';
  return `${safeBase}.${ext}`;
}

/**
 * Sinh tên file gắn UUID duy nhất (`{uuid}_{safeBase}.{ext}`) để đảm bảo mỗi lần upload
 * luôn tạo ra một `storagePath` mới, duy nhất, không bao giờ trùng lặp (M7.3.5.3 Mục III).
 */
export function generateUniqueCatalogFileName(
  rawFileName: string,
  contentType: AllowedAvatarContentType,
  customUuid?: string
): string {
  const ext =
    contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const base = (rawFileName || 'avatar')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  const safeBase = base.length > 0 ? base : 'avatar';
  const rawUuid = (customUuid || generateCatalogFileUuid())
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '')
    .slice(0, 36);
  const safeUuid = rawUuid.length >= 8 ? rawUuid : generateCatalogFileUuid();
  return `${safeUuid}_${safeBase}.${ext}`;
}

/**
 * Tạo đường dẫn lưu trữ chuẩn trên Firebase Storage:
 * `avatar_catalog/{avatarId}/v{version}/{fileName}`
 */
export function buildCatalogStoragePath(
  avatarId: string,
  version: number,
  fileName: string
): string {
  const cleanId = avatarId.trim();
  const cleanVer = Math.max(1, Math.floor(version));
  const cleanFile = fileName.trim();
  return `avatar_catalog/${cleanId}/v${cleanVer}/${cleanFile}`;
}

/**
 * Tính toán version mới và `storagePath` bất biến duy nhất ở tầng ứng dụng (M7.3.5.3 Mục III):
 * - Không bao giờ tái sử dụng `storagePath` hoặc `version` đã từng dùng hoặc có kết quả upload không xác định.
 * - Khi `useUuidFileName === true` (hoặc khi phát hiện trùng path), tự động gắn UUID duy nhất vào tên file.
 */
export function allocateUniqueCatalogStoragePath(params: {
  avatarId: string;
  existingVersion?: number | null;
  highestKnownVersion?: number | null;
  rawFileName: string;
  contentType: AllowedAvatarContentType;
  usedStoragePaths?: ReadonlySet<string>;
  useUuidFileName?: boolean;
  customUuid?: string;
}): { version: number; fileName: string; storagePath: string } {
  const cleanId = params.avatarId.trim();
  const vExisting =
    typeof params.existingVersion === 'number' && Number.isFinite(params.existingVersion)
      ? Math.floor(params.existingVersion)
      : 0;
  const vHighest =
    typeof params.highestKnownVersion === 'number' && Number.isFinite(params.highestKnownVersion)
      ? Math.floor(params.highestKnownVersion)
      : 0;

  let nextVersion = Math.max(1, vExisting + 1, vHighest + 1);
  let fileName = params.useUuidFileName
    ? generateUniqueCatalogFileName(params.rawFileName, params.contentType, params.customUuid)
    : sanitizeCatalogFileName(params.rawFileName, params.contentType);
  let candidatePath = buildCatalogStoragePath(cleanId, nextVersion, fileName);

  // Nếu đường dẫn ứng viên đã từng xuất hiện trong tập đường dẫn đã dùng / không xác định -> tăng version và gắn UUID mới
  while (params.usedStoragePaths && params.usedStoragePaths.has(candidatePath)) {
    nextVersion += 1;
    fileName = generateUniqueCatalogFileName(params.rawFileName, params.contentType);
    candidatePath = buildCatalogStoragePath(cleanId, nextVersion, fileName);
  }

  return {
    version: nextVersion,
    fileName,
    storagePath: candidatePath,
  };
}

/**
 * Khởi tạo và đồng bộ `highestVersionByAvatarId` cùng `usedStoragePaths` từ cả 3 nguồn (M7.3.5.5 Mục III.B2):
 * 1. Dữ liệu `/avatar_catalog` trên Firestore (`catalogRecords`),
 * 2. Các bản ghi pending đã lưu bền vững (`pendingRecords`),
 * 3. Các `storagePath` đã dùng hoặc không xác định đã được lưu bền vững (`persistedUsedPaths`).
 */
export function syncHighestVersionMapsFromCatalogRecords(params: {
  catalogRecords: Iterable<Record<string, unknown> | AvatarCatalogItem>;
  pendingRecords?: Iterable<PendingCatalogMetadataSync>;
  persistedUsedPaths?: Iterable<UsedPathHistoryEntry | string>;
  highestVersionMap: Map<string, number>;
  usedPathsSet: Set<string>;
}): void {
  const ingestPathAndVer = (avatarId: string, storagePath: string, ver: number) => {
    if (storagePath) {
      params.usedPathsSet.add(storagePath);
      const pathMatch = storagePath.match(AVATAR_LIMITS.STORAGE_PATH_REGEX);
      if (pathMatch) {
        const parsedId = pathMatch[1];
        const parsedVer = Number(pathMatch[2]);
        if (parsedId && Number.isInteger(parsedVer) && parsedVer > 0) {
          const prev = params.highestVersionMap.get(parsedId) ?? 0;
          if (parsedVer > prev) {
            params.highestVersionMap.set(parsedId, parsedVer);
          }
        }
      }
    }
    if (avatarId && ver > 0) {
      const prev = params.highestVersionMap.get(avatarId) ?? 0;
      if (ver > prev) {
        params.highestVersionMap.set(avatarId, ver);
      }
    }
  };

  for (const rec of params.catalogRecords) {
    if (!rec || typeof rec !== 'object') continue;
    const rawId = (rec as Record<string, unknown>).avatarId;
    const rawPath = (rec as Record<string, unknown>).storagePath;
    const rawVer = (rec as Record<string, unknown>).version;
    const avatarId = typeof rawId === 'string' ? rawId.trim() : '';
    const storagePath = typeof rawPath === 'string' ? rawPath.trim() : '';
    const ver =
      typeof rawVer === 'number' && Number.isFinite(rawVer) ? Math.floor(rawVer) : 0;
    ingestPathAndVer(avatarId, storagePath, ver);
  }

  if (params.pendingRecords) {
    for (const p of params.pendingRecords) {
      if (!p || typeof p !== 'object') continue;
      ingestPathAndVer(p.avatarId, p.storagePath, p.version);
    }
  }

  if (params.persistedUsedPaths) {
    for (const entry of params.persistedUsedPaths) {
      if (typeof entry === 'string') {
        ingestPathAndVer('', entry.trim(), 0);
      } else if (entry && typeof entry === 'object') {
        ingestPathAndVer(entry.avatarId, entry.storagePath, entry.version);
      }
    }
  }
}

/**
 * Đọc kích thước PNG từ chunk IHDR (bytes 16..23).
 */
function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 24) return null;
  if (
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Đọc kích thước JPEG bằng cách quét các marker SOF (FF C0 .. FF CF, trừ C4, C8, CC).
 */
function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 4) return null;
  let offset = 2;
  const len = bytes.byteLength;

  while (offset + 1 < len) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < len && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= len) break;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (offset + 1 >= len) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > len) {
      return null;
    }

    const isSofMarker =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isSofMarker) {
      if (segmentLength < 7 || offset + 7 > len) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }

    offset += segmentLength;
  }
  return null;
}

/**
 * Đọc kích thước WebP từ header RIFF....WEBP (hỗ trợ VP8 lossy, VP8L lossless, VP8X extended).
 */
function parseWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.byteLength < 30) return null;
  if (
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return null;
  }

  const chunkFourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (chunkFourCC === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunkFourCC === 'VP8L') {
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (b0 | ((b1 & 0x3f) << 8));
    const height = 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (chunkFourCC === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  return null;
}

/**
 * Kiểm tra magic bytes, cấu trúc nhị phân và kích thước ảnh (JPEG, PNG, WebP) ở phía Client:
 * - Dung lượng tối đa: 5 MiB (5,242,880 bytes)
 * - Chiều rộng/cao tối đa: 2048 x 2048 px
 * - Từ chối SVG, HTML, EXE, GIF, HEIC hoặc file giả mạo phần mở rộng.
 *
 * Lưu ý bảo mật (M7.3.5.1 Mục III):
 * - Đây là bước kiểm tra sớm ở phía trình duyệt (client-side validation) trước khi upload.
 * - Firebase Storage Security Rules KHÔNG có khả năng kiểm tra magic bytes nhị phân bên trong file,
 *   mà chỉ kiểm tra `request.resource.contentType`, `request.resource.size` và quyền Super Admin.
 */
export function validateCatalogAvatarBinary(
  buffer: ArrayBuffer | Uint8Array
): AvatarBinaryValidationResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sizeBytes = bytes.byteLength;

  if (sizeBytes <= 0) {
    return {
      valid: false,
      sizeBytes: 0,
      errorCode: 'EMPTY_FILE',
      errorMessage: 'File ảnh rỗng (0 byte).',
    };
  }

  if (sizeBytes > AVATAR_LIMITS.MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      sizeBytes,
      errorCode: 'FILE_TOO_LARGE',
      errorMessage: `Dung lượng ảnh (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) vượt quá giới hạn tối đa 5 MB.`,
    };
  }

  // Chặn thực thi EXE ('MZ' = 0x4D 0x5A)
  if (sizeBytes >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return {
      valid: false,
      sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: 'Từ chối file thực thi (.exe) giả mạo định dạng ảnh.',
    };
  }

  // Chặn SVG / HTML / XML / Script ở đầu file
  const headSlice = bytes.slice(0, Math.min(256, sizeBytes));
  const headAscii = new TextDecoder('utf-8', { fatal: false })
    .decode(headSlice)
    .trimStart()
    .toLowerCase();
  if (
    headAscii.startsWith('<svg') ||
    headAscii.startsWith('<?xml') ||
    headAscii.startsWith('<!doctype') ||
    headAscii.startsWith('<html') ||
    headAscii.startsWith('<script') ||
    headAscii.includes('<svg')
  ) {
    return {
      valid: false,
      sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: 'Không chấp nhận file SVG, HTML hoặc XML vì lý do bảo mật.',
    };
  }

  // Kiểm tra PNG: 89 50 4E 47 0D 0A 1A 0A
  const isPng =
    sizeBytes >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;

  // Kiểm tra JPEG: FF D8 FF
  const isJpeg =
    sizeBytes >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  // Kiểm tra WebP: RIFF....WEBP
  const isWebp =
    sizeBytes >= 30 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  if (!isPng && !isJpeg && !isWebp) {
    return {
      valid: false,
      sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: 'Chỉ chấp nhận định dạng ảnh JPEG (.jpg/.jpeg), PNG (.png) hoặc WebP (.webp) hợp lệ.',
    };
  }

  const format: AllowedAvatarFormat = isPng ? 'PNG' : isWebp ? 'WEBP' : 'JPEG';
  const contentType: AllowedAvatarContentType = isPng
    ? 'image/png'
    : isWebp
      ? 'image/webp'
      : 'image/jpeg';

  const dims = isPng
    ? parsePngDimensions(bytes)
    : isWebp
      ? parseWebpDimensions(bytes)
      : parseJpegDimensions(bytes);

  if (!dims) {
    return {
      valid: false,
      format,
      contentType,
      sizeBytes,
      errorCode: 'CORRUPTED_HEADER',
      errorMessage: 'Không đọc được thông số kích thước ảnh hoặc cấu trúc file ảnh bị hỏng.',
    };
  }

  const totalPixels = dims.width * dims.height;
  if (
    dims.width > AVATAR_LIMITS.MAX_WIDTH_PX ||
    dims.height > AVATAR_LIMITS.MAX_HEIGHT_PX ||
    totalPixels > AVATAR_LIMITS.MAX_TOTAL_PIXELS
  ) {
    return {
      valid: false,
      format,
      contentType,
      width: dims.width,
      height: dims.height,
      totalPixels,
      sizeBytes,
      errorCode: 'DIMENSIONS_TOO_LARGE',
      errorMessage: `Kích thước ảnh (${dims.width}x${dims.height}px) vượt quá giới hạn tối đa ${AVATAR_LIMITS.MAX_WIDTH_PX}x${AVATAR_LIMITS.MAX_HEIGHT_PX}px.`,
    };
  }

  return {
    valid: true,
    format,
    contentType,
    width: dims.width,
    height: dims.height,
    totalPixels,
    sizeBytes,
  };
}

/**
 * Kiểm tra file ảnh ở phía Client (bao gồm tên đuôi file, MIME type khai báo và magic bytes nhị phân).
 */
export function validateCatalogAvatarFileClientSide(params: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  arrayBuffer: ArrayBuffer;
}): AvatarBinaryValidationResult {
  const lowerName = (params.fileName || '').trim().toLowerCase();
  const hasAllowedExt =
    lowerName.endsWith('.jpg') ||
    lowerName.endsWith('.jpeg') ||
    lowerName.endsWith('.png') ||
    lowerName.endsWith('.webp');

  if (!hasAllowedExt) {
    return {
      valid: false,
      sizeBytes: params.sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: 'Phần mở rộng file không hợp lệ (chỉ chấp nhận .jpg, .jpeg, .png, .webp).',
    };
  }

  const binaryCheck = validateCatalogAvatarBinary(params.arrayBuffer);
  if (!binaryCheck.valid) {
    return binaryCheck;
  }

  const declaredMime = (params.mimeType || '').trim().toLowerCase();
  if (
    declaredMime &&
    !(AVATAR_LIMITS.ALLOWED_MIME_TYPES as readonly string[]).includes(declaredMime)
  ) {
    return {
      valid: false,
      sizeBytes: params.sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: `MIME type "${declaredMime}" không hợp lệ (chỉ chấp nhận image/jpeg, image/png, image/webp).`,
    };
  }

  if (declaredMime && binaryCheck.contentType && declaredMime !== binaryCheck.contentType) {
    return {
      valid: false,
      sizeBytes: params.sizeBytes,
      errorCode: 'UNSUPPORTED_FORMAT',
      errorMessage: `MIME type khai báo (${declaredMime}) không khớp với dữ liệu nhị phân thực tế (${binaryCheck.contentType}).`,
    };
  }

  return binaryCheck;
}

/**
 * Giải mã thử bằng `createImageBitmap` trên trình duyệt thực tế để đảm bảo file ảnh không bị hỏng
 * và kiểm tra lại chiều rộng/chiều cao thực tế <= 2048px.
 */
export async function decodeAndVerifyAvatarBitmapInBrowser(
  arrayBuffer: ArrayBuffer,
  contentType: AllowedAvatarContentType
): Promise<{ valid: boolean; width: number; height: number; errorMessage?: string }> {
  const binResult = validateCatalogAvatarBinary(arrayBuffer);
  if (!binResult.valid || !binResult.width || !binResult.height) {
    return {
      valid: false,
      width: binResult.width || 0,
      height: binResult.height || 0,
      errorMessage: binResult.errorMessage || 'File ảnh không hợp lệ.',
    };
  }

  if (typeof globalThis.createImageBitmap === 'function' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([arrayBuffer], { type: contentType });
      const bitmap = await globalThis.createImageBitmap(blob);
      const w = bitmap.width;
      const h = bitmap.height;
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
      if (
        w <= 0 ||
        h <= 0 ||
        w > AVATAR_LIMITS.MAX_WIDTH_PX ||
        h > AVATAR_LIMITS.MAX_HEIGHT_PX ||
        w * h > AVATAR_LIMITS.MAX_TOTAL_PIXELS
      ) {
        return {
          valid: false,
          width: w,
          height: h,
          errorMessage: `Kích thước giải mã (${w}x${h}px) vượt quá giới hạn tối đa ${AVATAR_LIMITS.MAX_WIDTH_PX}x${AVATAR_LIMITS.MAX_HEIGHT_PX}px.`,
        };
      }
      return { valid: true, width: w, height: h };
    } catch {
      return {
        valid: false,
        width: 0,
        height: 0,
        errorMessage: 'Không thể giải mã hình ảnh bằng trình duyệt (file ảnh bị hỏng).',
      };
    }
  }

  return {
    valid: true,
    width: binResult.width,
    height: binResult.height,
  };
}

// ============================================================================
// MÔ HÌNH ĐÁNH GIÁ BẢO MẬT FIRESTORE & FIREBASE STORAGE RULES (M7.3.5.2)
// ============================================================================

export type StorageRuleGranularMethod = 'get' | 'list' | 'create' | 'update' | 'delete';
export type StorageRuleOperation = 'read' | 'write' | StorageRuleGranularMethod;
export type LegacyStorageActionAlias = StorageRuleGranularMethod;

/**
 * Mô phỏng các điều kiện phân quyền `storage.rules` (M7.3.5.4 Mục II & III) cho đường dẫn
 * `avatar_catalog/{avatarId}/{versionSegment}/{fileName}`:
 * - Sử dụng 5 phương thức chi tiết của Firebase Storage Security Rules (`rules_version = '2'`):
 *   1. `allow get`: Chỉ cho phép Gmail cá nhân đã xác minh và đăng nhập bằng Google (`isVerifiedPersonalGmail()`),
 *      đúng đường dẫn `avatar_catalog/{avatarId}/v{version}/{fileName}`.
 *   2. `allow list: if false`: Cấm hoàn toàn thao tác liệt kê (`list` / `listAll`).
 *   3. `allow create`: Áp dụng cho ghi nội dung file (`uploadBytes` / `uploadBytesResumable`), chỉ cho phép
 *      Super Admin duy nhất (`linhnk.online@gmail.com`) khi kích thước `1 .. 5 MiB`, `contentType` thuộc
 *      `image/jpeg | image/png | image/webp` và `resource == null && request.resource != null`.
 *      Lưu ý M7.3.5.4: Không sử dụng mô phỏng In-memory để kết luận rằng `resource == null` chắc chắn chặn
 *      `uploadBytes` lần hai vào cùng một path trên Firebase Storage thực tế (trạng thái kiểm thử cho trường hợp
 *      upload lần hai cùng path khi chưa có Emulator/Production là `'NOT_PROVEN'`).
 *   4. `allow update: if false`: Áp dụng cho cập nhật metadata của file hiện có (`updateMetadata`) -> bị từ chối.
 *      Không mô tả `allow update: if false` là biện pháp ngăn `uploadBytes` ghi đè nội dung.
 *   5. `allow delete`: Chỉ cho phép Super Admin khi `resource != null` (`resourceExists === true`)
 *      và `request.resource == null`.
 * - Mọi đường dẫn ngoài `avatar_catalog/{avatarId}/{versionSegment}/{fileName}` bị từ chối (`allow read, write: if false`).
 */
export function evaluateStorageCatalogRule(params: {
  method?: StorageRuleGranularMethod;
  operation?: StorageRuleOperation;
  action?: LegacyStorageActionAlias | StorageRuleOperation;
  storagePath: string;
  authEmail?: string | null;
  isVerifiedPersonalGmail: boolean;
  signInProvider?: string | null;
  /** `resource != null`: Object đã tồn tại sẵn tại đường dẫn này hay chưa */
  resourceExists?: boolean;
  contentType?: string | null;
  sizeBytes?: number | null;
}): boolean {
  const rawMethod = params.method ?? params.action ?? params.operation ?? 'get';

  // `allow list: if false` và `allow update: if false` (cập nhật metadata qua updateMetadata) bị từ chối ở mọi đường dẫn
  if (rawMethod === 'list' || rawMethod === 'update') {
    return false;
  }

  if (!params.isVerifiedPersonalGmail) return false;
  if (params.signInProvider !== undefined && params.signInProvider !== 'google.com') {
    return false;
  }

  // Kiểm tra đường dẫn phải khớp chính xác `avatar_catalog/{avatarId}/{versionSegment}/{fileName}`
  const match = params.storagePath.match(AVATAR_LIMITS.STORAGE_PATH_REGEX);
  if (!match) return false;
  const avatarId = match[1];
  const versionStr = match[2];
  const fileName = match[3];
  if (!AVATAR_LIMITS.AVATAR_ID_REGEX.test(avatarId)) return false;
  if (!AVATAR_LIMITS.VERSION_SEGMENT_REGEX.test(`v${versionStr}`)) return false;
  if (!AVATAR_LIMITS.FILE_NAME_REGEX.test(fileName)) return false;

  // 1. `allow get`: đọc 1 file cụ thể bởi người chơi đã xác minh Gmail cá nhân (Google provider)
  if (rawMethod === 'get' || rawMethod === 'read') {
    return true;
  }

  // Các thao tác ghi (`create`, `delete`, hoặc `write` tổng quát): chỉ Super Admin (`linhnk.online@gmail.com`)
  const normalizedEmail = (params.authEmail || '').trim().toLowerCase();
  if (normalizedEmail !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return false;
  }

  const resourceExists =
    params.resourceExists !== undefined ? params.resourceExists : rawMethod === 'delete';

  const isDeleteRequest =
    rawMethod === 'delete' ||
    (rawMethod === 'write' && params.contentType === null && params.sizeBytes === null);

  // 5. `allow delete`: `resource != null && request.resource == null`
  if (isDeleteRequest) {
    return resourceExists === true && params.contentType == null && params.sizeBytes == null;
  }

  // 3. `allow create`: điều kiện biểu thức trong storage.rules có `resource == null`
  // (Lưu ý M7.3.5.4: hành vi thực tế của uploadBytes lần hai cùng path trên dịch vụ Storage được phân loại riêng là NOT_PROVEN nếu chưa chạy trên Emulator/Production)
  if (resourceExists) {
    return false;
  }

  if (
    typeof params.sizeBytes !== 'number' ||
    !Number.isInteger(params.sizeBytes) ||
    params.sizeBytes < 1 ||
    params.sizeBytes > AVATAR_LIMITS.MAX_FILE_SIZE_BYTES
  ) {
    return false;
  }

  if (
    typeof params.contentType !== 'string' ||
    !/^image\/(jpeg|png|webp)$/.test(params.contentType)
  ) {
    return false;
  }

  return true;
}

/**
 * Mô phỏng `firestore.rules` cho `/avatar_catalog/{avatarId}`:
 * - `allow get, list`: `isVerifiedPersonalGmail()`
 * - `allow create, update, delete`: chỉ Super Admin (`linhnk.online@gmail.com`) với schema hợp lệ,
 *   không chứa `downloadURL`/`avatarUrl`/`base64`/`dataUrl`, và khi update `version >= existing.version`.
 */
export function evaluateAvatarCatalogRule(params: {
  action: 'get' | 'list' | 'create' | 'update' | 'delete';
  avatarId: string;
  authEmail?: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  existing?: Record<string, unknown> | null;
  incoming?: Record<string, unknown> | null;
}): boolean {
  if (!params.isVerifiedPersonalGmail) return false;
  if (!AVATAR_LIMITS.AVATAR_ID_REGEX.test(params.avatarId)) return false;

  if (params.action === 'get' || params.action === 'list') {
    return true;
  }

  const normalizedEmail = (params.authEmail || '').trim().toLowerCase();
  if (normalizedEmail !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    return false;
  }

  if (params.action === 'delete') {
    return true;
  }

  const data = params.incoming;
  if (!data || typeof data !== 'object') return false;

  const requiredKeys = [
    'avatarId',
    'name',
    'storagePath',
    'contentType',
    'fileSize',
    'version',
    'sortOrder',
    'isActive',
    'createdAt',
    'updatedAt',
    'updatedBy',
  ];
  const keys = Object.keys(data);
  if (keys.length !== requiredKeys.length) return false;
  if (!requiredKeys.every((k) => keys.includes(k))) return false;

  const forbiddenKeys = ['downloadURL', 'avatarUrl', 'base64', 'dataUrl', 'audioData'];
  if (forbiddenKeys.some((k) => k in data)) return false;

  if (data.avatarId !== params.avatarId) return false;
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 80) {
    return false;
  }
  if (
    typeof data.storagePath !== 'string' ||
    data.storagePath.length < 10 ||
    data.storagePath.length > 220 ||
    !AVATAR_LIMITS.STORAGE_PATH_REGEX.test(data.storagePath)
  ) {
    return false;
  }
  const pathMatch = (data.storagePath as string).match(AVATAR_LIMITS.STORAGE_PATH_REGEX);
  if (!pathMatch || pathMatch[1] !== params.avatarId) {
    return false;
  }

  if (
    typeof data.contentType !== 'string' ||
    !/^image\/(jpeg|png|webp)$/.test(data.contentType)
  ) {
    return false;
  }
  if (
    typeof data.fileSize !== 'number' ||
    !Number.isInteger(data.fileSize) ||
    data.fileSize < 1 ||
    data.fileSize > AVATAR_LIMITS.MAX_FILE_SIZE_BYTES
  ) {
    return false;
  }
  if (
    typeof data.version !== 'number' ||
    !Number.isInteger(data.version) ||
    data.version < 1 ||
    data.version > 1_000_000
  ) {
    return false;
  }
  if (Number(pathMatch[2]) !== data.version) {
    return false;
  }
  if (
    typeof data.sortOrder !== 'number' ||
    !Number.isInteger(data.sortOrder) ||
    data.sortOrder < 0 ||
    data.sortOrder > 100_000
  ) {
    return false;
  }
  if (typeof data.isActive !== 'boolean') return false;
  if (data.updatedBy !== SUPER_ADMIN_EMAIL) return false;

  if (typeof data.createdAt !== 'number' && !(data.createdAt instanceof Timestamp)) {
    return false;
  }
  if (typeof data.updatedAt !== 'number' && !(data.updatedAt instanceof Timestamp)) {
    return false;
  }
  const updatedMs =
    data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : (data.updatedAt as number);
  if (Math.abs(updatedMs - params.requestTimeMs) > 60_000) {
    return false;
  }

  if (params.action === 'update' && params.existing) {
    const existingVer = params.existing.version;
    if (typeof existingVer === 'number' && (data.version as number) < existingVer) {
      return false;
    }
  }

  return true;
}

/**
 * Mô phỏng `firestore.rules` cho `/users/{uid}` (M7.3.5.3 Mục V):
 * - `allow get`: mọi người chơi Gmail cá nhân đã xác minh.
 * - `allow list`: chỉ Super Admin (dùng với `limit(1)` để kiểm tra xem avatar danh mục có đang được người chơi sử dụng trước khi xóa hay không).
 * - Tách quyền chỉnh `displayName` khỏi quyền chọn avatar:
 *   + Khi khởi tạo (`create`):
 *     - Nhánh chọn avatar: chỉ chứa `['avatarType', 'avatarId', 'avatarUpdatedAt']` (và tùy chọn `'uid'` khớp `uid == authUid`).
 *     - Nhánh chỉnh tên hiển thị: chỉ chứa `['displayName']` (và tùy chọn `'uid'` khớp `uid == authUid`).
 *   + Khi cập nhật (`update` trên tài liệu đã tồn tại):
 *     - UID bất biến tuyệt đối:
 *       * Không cho phép `'uid'` xuất hiện trong `affectedKeys()`.
 *       * Nếu tài liệu cũ có `'uid'`: bắt buộc `incoming.uid === existing.uid && incoming.uid === uid && incoming.uid === authUid`.
 *       * Nếu tài liệu cũ KHÔNG có `'uid'`: không bắt buộc và không cho phép tự ý thêm `'uid'` khi cập nhật avatar hoặc `displayName` (`!('uid' in incoming)`).
 *     - Ngăn xóa trường cũ: `incoming().keys().hasAll(existing().keys())`.
 *     - Ngăn sửa giá trị trường ngoài phạm vi:
 *       * Nhánh chọn avatar (`isUserAvatarSelectionUpdate`): `affectedKeys().hasOnly(['avatarType', 'avatarId', 'avatarUpdatedAt'])`.
 *       * Nhánh chỉnh tên hiển thị (`isUserDisplayNameUpdate`): `affectedKeys().hasOnly(['displayName'])`.
 *     - Chặn tuyệt đối sửa `uid`, `role`, `isSuperAdmin`, `email`, `xp`, `xu`, `rank`, `createdAt`.
 * - Khi `avatarType == 'catalog'`, bắt buộc `/avatar_catalog/{avatarId}` tồn tại và `isActive == true`.
 * - `allow delete`: false.
 */
export function evaluateUserProfileMetadataRule(params: {
  action: 'get' | 'list' | 'create' | 'update' | 'delete';
  uid: string;
  authUid: string;
  authEmail?: string | null;
  isVerifiedPersonalGmail: boolean;
  requestTimeMs: number;
  existing?: Record<string, unknown> | null;
  incoming?: Record<string, unknown> | null;
  catalogLookup?: (avatarId: string) => { exists: boolean; isActive: boolean };
}): boolean {
  if (!params.isVerifiedPersonalGmail) return false;
  if (!AVATAR_LIMITS.UID_REGEX.test(params.uid)) return false;

  if (params.action === 'get') {
    return true;
  }
  if (params.action === 'list') {
    const normalizedEmail = (params.authEmail || '').trim().toLowerCase();
    return normalizedEmail === SUPER_ADMIN_EMAIL.toLowerCase();
  }
  if (params.action === 'delete') {
    return false;
  }

  // create / update: bắt buộc chính chủ
  if (params.authUid !== params.uid) return false;

  const data = params.incoming;
  if (!data || typeof data !== 'object') return false;

  if ('uid' in data && (data.uid !== params.uid || data.uid !== params.authUid)) {
    return false;
  }

  const avatarCreateAllowedKeys = ['uid', 'avatarType', 'avatarId', 'avatarUpdatedAt'];
  const displayNameCreateAllowedKeys = ['uid', 'displayName'];
  // M7.3.5.3 Mục V: Không cho 'uid' xuất hiện như một trường được phép thay đổi trong affectedKeys()
  const avatarUpdateAllowedAffectedKeys = ['avatarType', 'avatarId', 'avatarUpdatedAt'];
  const displayNameUpdateAllowedAffectedKeys = ['displayName'];
  const forbiddenKeys = [
    'role',
    'isSuperAdmin',
    'email',
    'xp',
    'xu',
    'rank',
    'createdAt',
    'score',
    'avatarUrl',
    'downloadURL',
    'storagePath',
  ];

  const isValidDisplayNameField = (): boolean => {
    return (
      'displayName' in data &&
      typeof data.displayName === 'string' &&
      data.displayName.length >= 1 &&
      data.displayName.length <= 40
    );
  };

  const isValidAvatarFields = (): boolean => {
    const req = ['avatarType', 'avatarId', 'avatarUpdatedAt'];
    if (!req.every((k) => k in data)) return false;

    if (typeof data.avatarUpdatedAt !== 'number' && !(data.avatarUpdatedAt instanceof Timestamp)) {
      return false;
    }
    const updatedMs =
      data.avatarUpdatedAt instanceof Timestamp
        ? data.avatarUpdatedAt.toMillis()
        : (data.avatarUpdatedAt as number);
    if (Math.abs(updatedMs - params.requestTimeMs) > 60_000) {
      return false;
    }

    if (data.avatarType === 'google') {
      return data.avatarId === null;
    }

    if (data.avatarType === 'catalog') {
      if (
        typeof data.avatarId !== 'string' ||
        !AVATAR_LIMITS.AVATAR_ID_REGEX.test(data.avatarId)
      ) {
        return false;
      }
      if (!params.catalogLookup) return false;
      const cat = params.catalogLookup(data.avatarId);
      return cat.exists === true && cat.isActive === true;
    }

    return false;
  };

  if (params.action === 'create' || !params.existing) {
    const keys = Object.keys(data);
    if (forbiddenKeys.some((k) => k in data)) return false;

    const isAvatarCreate =
      keys.every((k) => avatarCreateAllowedKeys.includes(k)) && isValidAvatarFields();
    const isDisplayNameCreate =
      keys.every((k) => displayNameCreateAllowedKeys.includes(k)) && isValidDisplayNameField();

    return isAvatarCreate || isDisplayNameCreate;
  }

  // action === 'update' trên tài liệu đã tồn tại (isValidExistingUserUpdate - M7.3.5.4 Mục IV):
  // Điều kiện sở hữu hồ sơ bắt buộc cho mọi trường hợp (kể cả hồ sơ cũ chưa có trường 'uid'):
  // uid == request.auth.uid
  if (params.uid !== params.authUid) {
    return false;
  }
  const existingDoc = params.existing;

  // 1. Kiểm tra tính bất biến của trường 'uid' và quyền sở hữu theo đường dẫn /users/{uid}:
  // - Nếu tài liệu cũ có 'uid': bắt buộc incoming cũng có 'uid' và incoming.uid === existing.uid === uid === authUid.
  // - Nếu tài liệu cũ KHÔNG có 'uid': không bắt buộc thêm 'uid' và không cho phép chèn 'uid' mới trong thao tác update,
  //   nhưng vẫn bắt buộc params.uid === params.authUid.
  if ('uid' in existingDoc) {
    if (
      !('uid' in data) ||
      data.uid !== existingDoc.uid ||
      data.uid !== params.uid ||
      data.uid !== params.authUid
    ) {
      return false;
    }
  } else {
    if ('uid' in data || params.uid !== params.authUid) {
      return false;
    }
  }

  // 2. Ngăn xóa trường cũ (`incoming().keys().hasAll(existing().keys())`)
  const existingKeys = Object.keys(existingDoc);
  if (!existingKeys.every((k) => k in data)) {
    return false;
  }

  // 3. Tính tập hợp các trường thay đổi (`incoming().diff(existing()).affectedKeys()`)
  const allKeys = new Set([...existingKeys, ...Object.keys(data)]);
  const affectedKeys: string[] = [];
  for (const k of allKeys) {
    if (!(k in existingDoc) || !(k in data) || existingDoc[k] !== data[k]) {
      affectedKeys.push(k);
    }
  }

  // Tuyệt đối không cho phép 'uid' hoặc bất kỳ trường nhạy cảm nào nằm trong affectedKeys()
  if (affectedKeys.includes('uid') || affectedKeys.some((k) => forbiddenKeys.includes(k))) {
    return false;
  }

  // Nhánh 1: Quyền chọn avatar (chỉ cho phép affectedKeys thuộc ['avatarType', 'avatarId', 'avatarUpdatedAt'])
  const isAvatarUpdate =
    affectedKeys.every((k) => avatarUpdateAllowedAffectedKeys.includes(k)) && isValidAvatarFields();

  // Nhánh 2: Quyền chỉnh tên hiển thị displayName (chỉ cho phép affectedKeys thuộc ['displayName'])
  const isDisplayNameUpdate =
    affectedKeys.every((k) => displayNameUpdateAllowedAffectedKeys.includes(k)) &&
    isValidDisplayNameField();

  return isAvatarUpdate || isDisplayNameUpdate;
}

/**
 * Giải quyết URL hiển thị cuối cùng cho người chơi kèm cơ chế Fallback an toàn:
 * - Nếu `avatarType === 'catalog'` và `avatarId` trỏ tới một avatar đang `isActive === true`
 *   và đã có URL giải mã hợp lệ -> trả về URL của avatar danh mục.
 * - Ngược lại (chọn `google`, hoặc avatar danh mục bị ẩn `isActive === false`, hoặc bị xóa,
 *   hoặc lỗi tải URL) -> tự động fallback về `photoURL` của Google hoặc `null` (icon mặc định).
 */
export interface AvatarFirestoreDiagnosticLog {
  operation: 'SELECT_GOOGLE_AVATAR' | 'SELECT_CATALOG_AVATAR' | 'UPDATE_DISPLAY_NAME';
  path: string;
  errorCode: 'PERMISSION_DENIED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'INVALID_DATA';
  firestoreCode: string;
  timestampMs: number;
}

/**
 * Lấy URL ảnh đại diện Google mặc định từ thông tin xác thực hiện tại (`user.photoURL` hoặc `user.providerData` của `google.com`).
 * Không lưu `downloadURL`, capability token hay ID token vào Firestore (M7.3.6 Mục III.2).
 */
export function getGooglePhotoUrlForUser(
  user:
    | {
        photoURL?: string | null;
        providerData?: ReadonlyArray<{ providerId?: string | null; photoURL?: string | null } | null> | null;
      }
    | null
    | undefined
): string | null {
  if (!user) return null;
  if (typeof user.photoURL === 'string' && user.photoURL.trim().length > 0) {
    return user.photoURL.trim();
  }
  if (Array.isArray(user.providerData)) {
    for (const provider of user.providerData) {
      if (
        provider &&
        provider.providerId === 'google.com' &&
        typeof provider.photoURL === 'string' &&
        provider.photoURL.trim().length > 0
      ) {
        return provider.photoURL.trim();
      }
    }
  }
  return null;
}

/**
 * Phân loại lỗi thao tác lưu lựa chọn avatar / hồ sơ người dùng trên Firestore (M7.3.6 Mục III.4):
 * - 'PERMISSION_DENIED': Firestore Security Rules từ chối (`permission-denied` / `Missing or insufficient permissions`).
 * - 'UNAUTHENTICATED': Chưa đăng nhập, token hết hạn hoặc email chưa xác minh (`unauthenticated`).
 * - 'INVALID_DATA': Dữ liệu gửi lên không hợp lệ (`invalid-argument`).
 * - 'NETWORK_ERROR': Lỗi mạng, mất kết nối hoặc dịch vụ tạm thời gián đoạn (`unavailable`, `deadline-exceeded`, ...).
 */
export function classifyUserProfileFirestoreError(err: unknown): {
  errorCode: 'PERMISSION_DENIED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'INVALID_DATA';
  firestoreCode: string;
  userMessage: string;
} {
  const anyErr = err as { code?: string; message?: string } | null | undefined;
  const rawCode = String(anyErr?.code || '').trim();
  const code = rawCode.toLowerCase();
  const msg = String(anyErr?.message || err || '').toLowerCase();

  if (
    code.includes('unauthenticated') ||
    code.includes('user-token-expired') ||
    code.includes('invalid-user-token') ||
    msg.includes('unauthenticated') ||
    msg.includes('user-token-expired')
  ) {
    return {
      errorCode: 'UNAUTHENTICATED',
      firestoreCode: rawCode || 'unauthenticated',
      userMessage: 'Phiên đăng nhập Google đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
    };
  }

  if (
    code.includes('permission-denied') ||
    code.includes('permission_denied') ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission-denied') ||
    msg.includes('permission_denied')
  ) {
    return {
      errorCode: 'PERMISSION_DENIED',
      firestoreCode: rawCode || 'permission-denied',
      userMessage:
        'Không đủ quyền lưu lựa chọn ảnh đại diện trên Firestore (PERMISSION_DENIED). Vui lòng kiểm tra tài khoản Gmail đã xác minh và đảm bảo Firestore Rules mới nhất đã được cập nhật.',
    };
  }

  if (
    code.includes('invalid-argument') ||
    code.includes('invalid_argument') ||
    code.includes(' invalid_data') ||
    code === 'invalid_data' ||
    msg.includes('invalid-argument') ||
    msg.includes('invalid data')
  ) {
    return {
      errorCode: 'INVALID_DATA',
      firestoreCode: rawCode || 'invalid-argument',
      userMessage: 'Dữ liệu lựa chọn ảnh đại diện không hợp lệ với cấu trúc hồ sơ người dùng.',
    };
  }

  return {
    errorCode: 'NETWORK_ERROR',
    firestoreCode: rawCode || 'unavailable',
    userMessage: 'Không thể kết nối tới Cloud Firestore do lỗi mạng. Vui lòng kiểm tra kết nối Internet và thử lại.',
  };
}

export function resolvePlayerAvatarUrl(params: {
  uid?: string | null;
  userMeta?: UserProfileAvatarMetadata | null;
  catalogItems: readonly AvatarCatalogItem[];
  resolvedStorageUrls: ReadonlyMap<string, string>;
  failedStoragePaths?: ReadonlySet<string>;
  photoURL?: string | null;
}): string | null {
  const fallbackGoogle =
    params.photoURL && params.photoURL.trim().length > 0 ? params.photoURL.trim() : null;

  const meta = params.userMeta;
  if (!meta || meta.avatarType !== 'catalog' || !meta.avatarId) {
    return fallbackGoogle;
  }

  const catalogItem = params.catalogItems.find(
    (item) => item.avatarId === meta.avatarId && item.isActive === true
  );
  if (!catalogItem) {
    return fallbackGoogle;
  }

  if (params.failedStoragePaths?.has(catalogItem.storagePath)) {
    return fallbackGoogle;
  }

  const storageUrl = params.resolvedStorageUrls.get(catalogItem.storagePath);
  if (!storageUrl || storageUrl.trim().length === 0) {
    return fallbackGoogle;
  }

  return storageUrl;
}

// ============================================================================
// BỘ MÔ PHỎNG IN-MEMORY CHO KIỂM THỬ TỰ ĐỘNG E2E (M7.3.5 / M7.3.5.5)
// ============================================================================

export class InMemoryAvatarCatalogSystem {
  private storageBlobs = new Map<
    string,
    {
      contentType: AllowedAvatarContentType;
      sizeBytes: number;
      bytes: Uint8Array;
      customMetadata?: Record<string, string>;
    }
  >();
  private usedOrIndeterminateStoragePaths = new Set<string>();
  private highestVersionByAvatarId = new Map<string, number>();
  private storageUploadCallCount = 0;
  private simulateNextUploadIndeterminate = false;
  /**
   * Nếu `simulateNextUploadF5BeforeConfirmation === true`, mô phỏng việc người dùng bấm F5 ngay khi
   * bản ghi `UPLOAD_IN_PROGRESS` đã được lưu bền vững nhưng trình duyệt bị ngắt trước khi nhận phản hồi hoàn tất.
   * Biến `simulateNextUploadF5ObjectLandedOnStorage` quyết định liệu gói tin upload có kịp chạm tới Storage hay không.
   */
  private simulateNextUploadF5BeforeConfirmation = false;
  private simulateNextUploadF5ObjectLandedOnStorage = false;
  private catalogDocs = new Map<string, Record<string, unknown>>();
  private userDocs = new Map<string, Record<string, unknown>>();
  private pendingSyncs = new Map<string, PendingCatalogMetadataSync>();
  private persistentPendingStore: DurableInMemoryPendingUploadStore;
  private failNextFirestoreCatalogWrite = false;
  private failNextStorageDelete = false;
  private lastDeleteUserQueryLimit: number | null = null;

  public constructor(customPendingStore?: DurableInMemoryPendingUploadStore) {
    this.persistentPendingStore = customPendingStore ?? new DurableInMemoryPendingUploadStore();
  }

  public getPersistentPendingStore(): DurableInMemoryPendingUploadStore {
    return this.persistentPendingStore;
  }

  public setFailNextPersistentPendingStoreWrite(fail: boolean): void {
    this.persistentPendingStore.setFailNextWrite(fail);
  }

  public setFailNextFirestoreCatalogWrite(fail: boolean): void {
    this.failNextFirestoreCatalogWrite = fail;
  }

  public setFailNextStorageDelete(fail: boolean): void {
    this.failNextStorageDelete = fail;
  }

  public setSimulateNextUploadIndeterminate(indeterminate: boolean): void {
    this.simulateNextUploadIndeterminate = indeterminate;
  }

  public setSimulateNextUploadInterruptedByF5(params: {
    interrupted: boolean;
    objectLandedOnStorage: boolean;
  }): void {
    this.simulateNextUploadF5BeforeConfirmation = params.interrupted;
    this.simulateNextUploadF5ObjectLandedOnStorage = params.objectLandedOnStorage;
  }

  public getStorageUploadCallCount(): number {
    return this.storageUploadCallCount;
  }

  public getUsedOrIndeterminateStoragePaths(): string[] {
    return Array.from(this.usedOrIndeterminateStoragePaths.values());
  }

  public getLastDeleteUserQueryLimit(): number | null {
    return this.lastDeleteUserQueryLimit;
  }

  public getStoragePaths(): string[] {
    return Array.from(this.storageBlobs.keys());
  }

  public getCatalogDoc(avatarId: string): Record<string, unknown> | null {
    return this.catalogDocs.get(avatarId) ?? null;
  }

  public getUserDoc(uid: string): Record<string, unknown> | null {
    return this.userDocs.get(uid) ?? null;
  }

  /**
   * Khởi tạo sẵn hồ sơ người chơi có chứa các trường điểm/cấp bậc từ phiên bản trước
   * (`xp`, `xu`, `rank`, `createdAt`) để kiểm thử bảo toàn dữ liệu khi đổi avatar (M7.3.5.1 / M7.3.5.3).
   */
  public seedLegacyUserProfile(uid: string, legacyFields: Record<string, unknown>): void {
    this.userDocs.set(uid, {
      uid,
      displayName: 'Legacy Commander',
      avatarType: 'google',
      avatarId: null,
      avatarUpdatedAt: 1_700_000_000_000,
      ...legacyFields,
    });
  }

  /**
   * Khởi tạo hồ sơ người chơi cũ KHÔNG có trường `uid` bên trong tài liệu (`/users/{uid}`)
   * để kiểm chứng yêu cầu M7.3.5.3 Mục V: không tự ý bắt buộc phải thêm trường `uid` khi chỉ cập nhật avatar hoặc `displayName`.
   */
  public seedLegacyUserProfileWithoutUid(uid: string, legacyFields: Record<string, unknown>): void {
    const copy = { ...legacyFields };
    delete copy.uid;
    this.userDocs.set(uid, {
      displayName: 'Legacy No-UID Commander',
      avatarType: 'google',
      avatarId: null,
      avatarUpdatedAt: 1_700_000_000_000,
      ...copy,
    });
  }

  /**
   * Lấy bản ghi pending trong RAM (hoặc đã khôi phục sau F5).
   * Nếu truyền `viewerUid`, kiểm tra `ownerUid === viewerUid` theo M7.3.5.5 Mục III.B2:
   * người dùng khác `ownerUid` không được phép xem chi tiết quản trị của bản ghi pending.
   */
  public getPendingSync(
    avatarId: string,
    viewerUid?: string | null
  ): PendingCatalogMetadataSync | null {
    const rec = this.pendingSyncs.get(avatarId) ?? null;
    if (!rec) return null;
    if (viewerUid !== undefined && viewerUid !== null && rec.ownerUid !== viewerUid) {
      return null;
    }
    return rec;
  }

  /**
   * Đồng bộ `highestVersionByAvatarId` và `usedOrIndeterminateStoragePaths` từ cả 3 nguồn
   * (M7.3.5.5 Mục III.B2):
   * 1. Dữ liệu `/avatar_catalog` trên Firestore (`this.catalogDocs`),
   * 2. Các bản ghi pending trong RAM và trong bộ nhớ bền vững (`this.persistentPendingStore`),
   * 3. Các `storagePath` đã dùng hoặc không xác định đã được lưu bền vững.
   */
  public async syncHighestVersionsFromAllSources(): Promise<void> {
    const persistedPending = await this.persistentPendingStore.getAllPendingRecords();
    const persistedUsed = await this.persistentPendingStore.getAllUsedOrIndeterminatePaths();
    syncHighestVersionMapsFromCatalogRecords({
      catalogRecords: this.catalogDocs.values(),
      pendingRecords: [...this.pendingSyncs.values(), ...persistedPending],
      persistedUsedPaths: persistedUsed,
      highestVersionMap: this.highestVersionByAvatarId,
      usedPathsSet: this.usedOrIndeterminateStoragePaths,
    });
  }

  public syncHighestVersionsFromCatalogDocs(): void {
    syncHighestVersionMapsFromCatalogRecords({
      catalogRecords: this.catalogDocs.values(),
      pendingRecords: this.pendingSyncs.values(),
      highestVersionMap: this.highestVersionByAvatarId,
      usedPathsSet: this.usedOrIndeterminateStoragePaths,
    });
  }

  /**
   * Mô phỏng tải lại trang (F5 / đóng mở lại trình duyệt - M7.3.5.5 Mục III.B2 & Mục VI):
   * - Xóa toàn bộ các biến chỉ nằm trong RAM (`highestVersionByAvatarId`, `usedOrIndeterminateStoragePaths`, `pendingSyncs`).
   * - Giữ nguyên dữ liệu đã lưu bền vững trên Firestore (`catalogDocs`), Storage (`storageBlobs`)
   *   và bộ nhớ bền vững `persistentPendingStore` (IndexedDB/localStorage).
   */
  public simulatePageReloadClearingRamOnlyState(): void {
    this.highestVersionByAvatarId.clear();
    this.usedOrIndeterminateStoragePaths.clear();
    this.pendingSyncs.clear();
  }

  /**
   * Khôi phục trạng thái Pending Upload từ bộ nhớ bền vững sau khi F5 hoặc mở lại trình duyệt (M7.3.5.5 Mục III.B2):
   * 1. Tổng hợp lịch sử `version` và `storagePath` từ cả 3 nguồn (Firestore catalog, pending records bền vững, used paths bền vững).
   * 2. Với mỗi bản ghi pending thuộc `ownerUid === currentUserUid`:
   *    - Nếu trạng thái trước khi F5 là `'UPLOAD_IN_PROGRESS'` (hoặc `'UPLOAD_INDETERMINATE'`):
   *      + Tuyệt đối KHÔNG tự mặc định upload đã thành công; chuyển sang `'UPLOAD_INDETERMINATE'` trước.
   *      + Kiểm tra object thực tế trên Storage (`getMetadata` theo `storagePath`):
   *        * Chỉ chuyển sang `'UPLOAD_CONFIRMED_METADATA_PENDING'` nếu object tồn tại trên Storage
   *          VÀ khớp chính xác `customMetadata.uploadOperationId === pending.uploadOperationId`,
   *          `sizeBytes === pending.fileSize` và `contentType === pending.contentType`.
   *        * Nếu không xác minh được (object không tồn tại hoặc không khớp metadata): giữ nguyên ở trạng thái
   *          `'UPLOAD_INDETERMINATE'`, giữ `storagePath` và `version` trong `usedOrIndeterminateStoragePaths` /
   *          `highestVersionByAvatarId`, không xóa object, không tái sử dụng path và không tạo metadata catalog.
   *    - Nếu trạng thái là `'UPLOAD_CONFIRMED_METADATA_PENDING'`:
   *      + Kiểm tra lại object trên Storage vẫn tồn tại và khớp `uploadOperationId`, `fileSize`, `contentType`,
   *        sau đó khôi phục vào `this.pendingSyncs` để Super Admin chỉ cần bấm retry ghi metadata Firestore.
   */
  public async recoverPendingUploadsAfterF5(params: {
    currentUserUid: string | null;
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
  }): Promise<{
    recoveredConfirmedCount: number;
    recoveredIndeterminateCount: number;
    skippedOtherOwnerCount: number;
    records: PendingCatalogMetadataSync[];
  }> {
    await this.syncHighestVersionsFromAllSources();

    const allPersisted = await this.persistentPendingStore.getAllPendingRecords();
    let recoveredConfirmedCount = 0;
    let recoveredIndeterminateCount = 0;
    let skippedOtherOwnerCount = 0;
    const visibleRecords: PendingCatalogMetadataSync[] = [];

    for (const record of allPersisted) {
      // Giữ lịch sử version & path trong bộ nhớ chống tái sử dụng cho mọi bản ghi
      this.usedOrIndeterminateStoragePaths.add(record.storagePath);
      const prevVer = this.highestVersionByAvatarId.get(record.avatarId) ?? 0;
      if (record.version > prevVer) {
        this.highestVersionByAvatarId.set(record.avatarId, record.version);
      }

      // Quy tắc 6: Nếu người dùng hiện tại không trùng ownerUid đã lưu trong bản ghi pending -> không cho phép xem/retry
      if (!params.currentUserUid || record.ownerUid !== params.currentUserUid) {
        skippedOtherOwnerCount += 1;
        continue;
      }

      // Kiểm tra xem Firestore đã có sẵn bản ghi khớp (trường hợp F5 ngay sau khi setDoc thành công nhưng trước khi xóa pending)
      const existingCatalogDoc = this.catalogDocs.get(record.avatarId);
      if (
        existingCatalogDoc &&
        existingCatalogDoc.storagePath === record.storagePath &&
        existingCatalogDoc.version === record.version
      ) {
        await this.persistentPendingStore.deletePendingRecord(record.avatarId);
        this.pendingSyncs.delete(record.avatarId);
        continue;
      }

      if (record.status === 'UPLOAD_IN_PROGRESS' || record.status === 'UPLOAD_INDETERMINATE') {
        // Bắt buộc chuyển sang UPLOAD_INDETERMINATE trước khi kiểm tra Storage
        const indeterminateRecord: PendingCatalogMetadataSync = {
          ...record,
          status: 'UPLOAD_INDETERMINATE',
          errorMessage:
            'Tiến trình upload bị gián đoạn bởi F5/đóng trình duyệt. Đang xác minh trạng thái object trên Firebase Storage.',
        };
        await this.persistentPendingStore.savePendingRecord(indeterminateRecord);

        // Kiểm tra object trên Storage (tương đương getMetadata)
        const storageObj = this.storageBlobs.get(record.storagePath);
        const canReadMeta = evaluateStorageCatalogRule({
          method: 'get',
          storagePath: record.storagePath,
          authEmail: params.authEmail,
          isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
        });
        const isVerifiedOnStorage =
          canReadMeta &&
          Boolean(storageObj) &&
          storageObj!.sizeBytes === record.fileSize &&
          storageObj!.contentType === record.contentType &&
          storageObj!.customMetadata?.uploadOperationId === record.uploadOperationId;

        if (isVerifiedOnStorage) {
          const confirmedRecord: PendingCatalogMetadataSync = {
            ...indeterminateRecord,
            status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
            errorMessage:
              'Đã xác minh file tồn tại và khớp uploadOperationId trên Firebase Storage sau F5. Sẵn sàng đồng bộ metadata Firestore.',
          };
          await this.persistentPendingStore.savePendingRecord(confirmedRecord);
          this.pendingSyncs.set(confirmedRecord.avatarId, confirmedRecord);
          visibleRecords.push(confirmedRecord);
          recoveredConfirmedCount += 1;
        } else {
          this.pendingSyncs.set(indeterminateRecord.avatarId, indeterminateRecord);
          visibleRecords.push(indeterminateRecord);
          recoveredIndeterminateCount += 1;
        }
        continue;
      }

      if (record.status === 'UPLOAD_CONFIRMED_METADATA_PENDING') {
        const storageObj = this.storageBlobs.get(record.storagePath);
        const isStillValidOnStorage =
          Boolean(storageObj) &&
          storageObj!.sizeBytes === record.fileSize &&
          storageObj!.contentType === record.contentType &&
          storageObj!.customMetadata?.uploadOperationId === record.uploadOperationId;

        if (isStillValidOnStorage) {
          this.pendingSyncs.set(record.avatarId, record);
          visibleRecords.push(record);
          recoveredConfirmedCount += 1;
        } else {
          const downgraded: PendingCatalogMetadataSync = {
            ...record,
            status: 'UPLOAD_INDETERMINATE',
            errorMessage:
              'Không xác minh được file hoặc uploadOperationId trên Storage sau khi tải lại trang.',
          };
          await this.persistentPendingStore.savePendingRecord(downgraded);
          this.pendingSyncs.set(downgraded.avatarId, downgraded);
          visibleRecords.push(downgraded);
          recoveredIndeterminateCount += 1;
        }
      }
    }

    return {
      recoveredConfirmedCount,
      recoveredIndeterminateCount,
      skippedOtherOwnerCount,
      records: visibleRecords,
    };
  }

  public getHighestKnownVersion(avatarId: string): number {
    this.syncHighestVersionsFromCatalogDocs();
    return this.highestVersionByAvatarId.get(avatarId) ?? 0;
  }

  /**
   * Mô phỏng Super Admin upload mới hoặc thay thế ảnh trong danh mục (M7.3.5.3 & M7.3.5.5 Mục III):
   * 1. Kiểm tra file (JPEG/PNG/WebP, <= 5 MiB, <= 2048x2048 px, magic bytes).
   * 2. Tổng hợp lịch sử `version` và `storagePath` từ cả 3 nguồn (Firestore catalog, pending records bền vững, used paths bền vững).
   * 3. Cấp phát `version`, `storagePath` mới và `uploadOperationId` (UUID duy nhất).
   * 4. LƯU VÀ XÁC NHẬN bản ghi `UPLOAD_IN_PROGRESS` vào bộ nhớ bền vững TRƯỚC KHI bắt đầu `uploadBytes`.
   *    Nếu ghi bộ nhớ bền vững thất bại -> dừng ngay trước khi upload (`PENDING_STORE_WRITE_FAILED`).
   * 5. Sau khi Storage xác nhận upload thành công (kèm `customMetadata.uploadOperationId`), chuyển bản ghi sang
   *    `UPLOAD_CONFIRMED_METADATA_PENDING`.
   * 6. Chỉ xóa bản ghi pending khỏi bộ nhớ bền vững sau khi đọc lại (`getDoc`) từ Firestore và xác nhận khớp.
   */
  public async adminUploadOrReplaceCatalogAvatar(params: {
    ownerUid?: string;
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    avatarId: string;
    name: string;
    fileName: string;
    mimeType: string;
    arrayBuffer: ArrayBuffer;
    sortOrder: number;
    isActive?: boolean;
    useUuidFileName?: boolean;
    customUuid?: string;
    nowMs: number;
  }): Promise<AvatarOperationResult> {
    const ownerUid = (params.ownerUid || 'super_admin_uid').trim();
    const cleanId = params.avatarId.trim();
    if (!AVATAR_LIMITS.AVATAR_ID_REGEX.test(cleanId)) {
      return {
        success: false,
        errorCode: 'INVALID_AVATAR_ID',
        message: 'Mã avatarId không hợp lệ.',
      };
    }

    const fileCheck = validateCatalogAvatarFileClientSide({
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.arrayBuffer.byteLength,
      arrayBuffer: params.arrayBuffer,
    });
    if (!fileCheck.valid || !fileCheck.contentType) {
      return {
        success: false,
        errorCode: fileCheck.errorCode || 'INVALID_IMAGE',
        message: fileCheck.errorMessage || 'File ảnh không hợp lệ.',
      };
    }

    const bitmapCheck = await decodeAndVerifyAvatarBitmapInBrowser(
      params.arrayBuffer,
      fileCheck.contentType
    );
    if (!bitmapCheck.valid) {
      return {
        success: false,
        errorCode: 'BITMAP_DECODE_FAILED',
        message: bitmapCheck.errorMessage || 'Không thể giải mã hình ảnh.',
      };
    }

    // M7.3.5.5 Mục III.B2: Tổng hợp lịch sử version và đường dẫn từ cả 3 nguồn trước khi cấp version mới
    await this.syncHighestVersionsFromAllSources();

    const existingDoc = this.catalogDocs.get(cleanId) ?? null;
    const existingVer =
      existingDoc && typeof existingDoc.version === 'number' ? (existingDoc.version as number) : 0;
    const highestKnownVer = this.highestVersionByAvatarId.get(cleanId) ?? 0;

    const allocated = allocateUniqueCatalogStoragePath({
      avatarId: cleanId,
      existingVersion: existingVer,
      highestKnownVersion: highestKnownVer,
      rawFileName: params.fileName,
      contentType: fileCheck.contentType,
      usedStoragePaths: this.usedOrIndeterminateStoragePaths,
      useUuidFileName: params.useUuidFileName,
      customUuid: params.customUuid,
    });
    const nextVersion = allocated.version;
    const storagePath = allocated.storagePath;
    const allocatedFileName = allocated.fileName;
    const uploadOperationId = generateCatalogFileUuid();

    const isActive =
      typeof params.isActive === 'boolean'
        ? params.isActive
        : existingDoc && typeof existingDoc.isActive === 'boolean'
          ? (existingDoc.isActive as boolean)
          : true;

    // Quy tắc 1 (M7.3.5.5 Mục III.B2): Phải lưu và xác nhận thành công bản ghi pending (UPLOAD_IN_PROGRESS)
    // TRƯỚC KHI bắt đầu uploadBytes. Nếu không thể ghi bản ghi pending, dừng ngay trước khi upload.
    const inProgressRecord: PendingCatalogMetadataSync = {
      ownerUid,
      avatarId: cleanId,
      name: params.name.trim(),
      storagePath,
      fileName: allocatedFileName,
      contentType: fileCheck.contentType,
      fileSize: fileCheck.sizeBytes,
      version: nextVersion,
      sortOrder: params.sortOrder,
      isActive,
      updatedBy: params.authEmail || '',
      isUpdate: existingDoc !== null,
      uploadOperationId,
      createdAt: params.nowMs,
      status: 'UPLOAD_IN_PROGRESS',
      failedAtMs: params.nowMs,
      errorMessage: '',
    };

    try {
      await this.persistentPendingStore.savePendingRecord(inProgressRecord);
      const verifiedSaved = await this.persistentPendingStore.getPendingRecord(cleanId);
      if (
        !verifiedSaved ||
        verifiedSaved.uploadOperationId !== uploadOperationId ||
        verifiedSaved.storagePath !== storagePath ||
        verifiedSaved.status !== 'UPLOAD_IN_PROGRESS'
      ) {
        throw new Error('Read-back verification of UPLOAD_IN_PROGRESS pending record failed.');
      }
    } catch (persistErr: any) {
      return {
        success: false,
        errorCode: 'PENDING_STORE_WRITE_FAILED',
        message: `Không thể ghi bản ghi phục hồi pending vào bộ nhớ bền vững trước khi upload (${
          persistErr?.message || 'Lỗi lưu trữ cục bộ'
        }). Đã dừng ngay trước khi tải ảnh lên Storage.`,
      };
    }

    this.pendingSyncs.set(cleanId, inProgressRecord);
    this.usedOrIndeterminateStoragePaths.add(storagePath);
    this.highestVersionByAvatarId.set(cleanId, Math.max(highestKnownVer, nextVersion));

    const resourceAlreadyExists = this.storageBlobs.has(storagePath);

    // Kiểm tra Storage Rules (`allow create` -> `isValidCatalogCreate`)
    const storageAllowed = evaluateStorageCatalogRule({
      method: 'create',
      storagePath,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      resourceExists: resourceAlreadyExists,
      contentType: fileCheck.contentType,
      sizeBytes: fileCheck.sizeBytes,
    });
    if (!storageAllowed) {
      await this.persistentPendingStore.deletePendingRecord(cleanId);
      this.pendingSyncs.delete(cleanId);
      return {
        success: false,
        errorCode: 'STORAGE_PERMISSION_DENIED',
        message: 'Firebase Storage Rules từ chối quyền upload hoặc không cho phép ghi đè object đã tồn tại.',
      };
    }

    this.storageUploadCallCount += 1;

    // Mô phỏng kịch bản F5 xảy ra ngay trong lúc đang upload (`UPLOAD_IN_PROGRESS` vẫn nằm trong bộ nhớ bền vững):
    if (this.simulateNextUploadF5BeforeConfirmation) {
      const landed = this.simulateNextUploadF5ObjectLandedOnStorage;
      this.simulateNextUploadF5BeforeConfirmation = false;
      this.simulateNextUploadF5ObjectLandedOnStorage = false;
      if (landed) {
        this.storageBlobs.set(storagePath, {
          contentType: fileCheck.contentType,
          sizeBytes: fileCheck.sizeBytes,
          bytes: new Uint8Array(params.arrayBuffer.slice(0)),
          customMetadata: {
            uploadOperationId,
            avatarId: cleanId,
            version: String(nextVersion),
            ownerUid,
          },
        });
      }
      return {
        success: false,
        avatarId: cleanId,
        version: nextVersion,
        storagePath,
        uploadOperationId,
        pendingStatus: 'UPLOAD_IN_PROGRESS',
        metadataSynced: false,
        requiresMetadataRetry: false,
        errorCode: 'UPLOAD_INTERRUPTED_BY_F5',
        message:
          'Trình duyệt bị tải lại (F5) khi đang tải ảnh lên Firebase Storage (trạng thái UPLOAD_IN_PROGRESS).',
      };
    }

    // Trường hợp kết quả upload không xác định (mất kết nối giữa chừng khi đang upload):
    // Chuyển trạng thái bền vững sang UPLOAD_INDETERMINATE; lần upload sau bắt buộc sinh version/path mới.
    if (this.simulateNextUploadIndeterminate) {
      this.simulateNextUploadIndeterminate = false;
      const indeterminateRecord: PendingCatalogMetadataSync = {
        ...inProgressRecord,
        status: 'UPLOAD_INDETERMINATE',
        failedAtMs: params.nowMs,
        errorMessage: 'Storage upload connection dropped before confirmation.',
      };
      await this.persistentPendingStore.savePendingRecord(indeterminateRecord);
      this.pendingSyncs.set(cleanId, indeterminateRecord);
      return {
        success: false,
        avatarId: cleanId,
        version: nextVersion,
        storagePath,
        uploadOperationId,
        pendingStatus: 'UPLOAD_INDETERMINATE',
        metadataSynced: false,
        requiresMetadataRetry: false,
        errorCode: 'STORAGE_UPLOAD_INDETERMINATE',
        message:
          'Kết quả upload lên Firebase Storage không xác định do gián đoạn kết nối. Để tránh ghi đè không an toàn, lần tải lên tiếp theo sẽ tự động tạo đường dẫn và version mới.',
      };
    }

    // Lưu nhị phân kèm customMetadata.uploadOperationId vào bộ nhớ mô phỏng Storage
    this.storageBlobs.set(storagePath, {
      contentType: fileCheck.contentType,
      sizeBytes: fileCheck.sizeBytes,
      bytes: new Uint8Array(params.arrayBuffer.slice(0)),
      customMetadata: {
        uploadOperationId,
        avatarId: cleanId,
        version: String(nextVersion),
        ownerUid,
      },
    });

    // Quy tắc 2: Sau khi Storage xác nhận upload thành công, chuyển trạng thái sang UPLOAD_CONFIRMED_METADATA_PENDING
    const confirmedPendingRecord: PendingCatalogMetadataSync = {
      ...inProgressRecord,
      status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
      failedAtMs: params.nowMs,
      errorMessage: '',
    };
    await this.persistentPendingStore.savePendingRecord(confirmedPendingRecord);
    this.pendingSyncs.set(cleanId, confirmedPendingRecord);

    const incomingDoc: Record<string, unknown> = {
      avatarId: cleanId,
      name: params.name.trim(),
      storagePath,
      contentType: fileCheck.contentType,
      fileSize: fileCheck.sizeBytes,
      version: nextVersion,
      sortOrder: params.sortOrder,
      isActive,
      createdAt: existingDoc ? existingDoc.createdAt : params.nowMs,
      updatedAt: params.nowMs,
      updatedBy: params.authEmail || '',
    };

    if (this.failNextFirestoreCatalogWrite) {
      this.failNextFirestoreCatalogWrite = false;
      const failedSyncRecord: PendingCatalogMetadataSync = {
        ...confirmedPendingRecord,
        status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
        failedAtMs: params.nowMs,
        errorMessage: 'Simulated Firestore network failure after Storage upload.',
      };
      await this.persistentPendingStore.savePendingRecord(failedSyncRecord);
      this.pendingSyncs.set(cleanId, failedSyncRecord);
      return {
        success: false,
        avatarId: cleanId,
        version: nextVersion,
        storagePath,
        uploadOperationId,
        pendingStatus: 'UPLOAD_CONFIRMED_METADATA_PENDING',
        metadataSynced: false,
        requiresMetadataRetry: true,
        errorCode: 'FIRESTORE_SYNC_FAILED_AFTER_UPLOAD',
        message:
          'Đã tải ảnh lên Firebase Storage thành công nhưng ghi metadata Firestore thất bại. Bạn có thể bấm "Đồng bộ lại Metadata" mà không cần upload lại ảnh.',
      };
    }

    const firestoreAllowed = evaluateAvatarCatalogRule({
      action: existingDoc ? 'update' : 'create',
      avatarId: cleanId,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs,
      existing: existingDoc,
      incoming: incomingDoc,
    });
    if (!firestoreAllowed) {
      await this.rollbackOrphanedStorageObject(storagePath);
      await this.persistentPendingStore.deletePendingRecord(cleanId);
      this.pendingSyncs.delete(cleanId);
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Firestore Security Rules từ chối ghi metadata /avatar_catalog.',
      };
    }

    // Nếu thay ảnh mới thành công -> có thể dọn file version cũ trên Storage
    if (existingDoc && typeof existingDoc.storagePath === 'string' && existingDoc.storagePath !== storagePath) {
      this.storageBlobs.delete(existingDoc.storagePath);
    }

    this.catalogDocs.set(cleanId, incomingDoc);

    // Quy tắc 4: Chỉ xóa bản ghi pending sau khi đọc lại từ Firestore và xác nhận khớp với bản ghi vừa ghi
    const verifiedFirestoreDoc = this.catalogDocs.get(cleanId);
    if (
      verifiedFirestoreDoc &&
      verifiedFirestoreDoc.avatarId === cleanId &&
      verifiedFirestoreDoc.storagePath === storagePath &&
      verifiedFirestoreDoc.version === nextVersion &&
      verifiedFirestoreDoc.fileSize === fileCheck.sizeBytes
    ) {
      await this.persistentPendingStore.deletePendingRecord(cleanId);
      this.pendingSyncs.delete(cleanId);
    }

    return {
      success: true,
      avatarId: cleanId,
      version: nextVersion,
      storagePath,
      uploadOperationId,
      metadataSynced: true,
      message: `Đã lưu avatar "${params.name.trim()}" (v${nextVersion}) vào danh mục chung.`,
    };
  }

  /**
   * Trả về trạng thái kiểm thử cho trường hợp gọi `uploadBytes` lần thứ hai vào cùng một `storagePath`
   * ở tầng Firebase Storage Rules (M7.3.5.4 Mục III):
   * - Không giả lập rằng Storage Rules chắc chắn từ chối `uploadBytes` lần hai chỉ vì `resource == null`.
   * - Không đánh dấu `DENIED` khi chưa chạy trên môi trường Firebase Storage Emulator / Production thực tế;
   *   trả về `'NOT_PROVEN'`.
   */
  public evaluateSecondUploadSamePathStorageRuleStatus(): 'NOT_PROVEN' {
    return getSecondUploadSamePathStorageEnforcementVerdict(false);
  }

  public adminAttemptOverwriteExistingStoragePath(_params: {
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    storagePath: string;
    contentType: AllowedAvatarContentType;
    sizeBytes: number;
  }): 'NOT_PROVEN' {
    return getSecondUploadSamePathStorageEnforcementVerdict(false);
  }

  /**
   * Mô phỏng thử cập nhật metadata (`allow update: if false`) trên object đã tồn tại (M7.3.5.2 Mục III.4).
   */
  public adminAttemptUpdateStorageMetadata(params: {
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    storagePath: string;
  }): boolean {
    const exists = this.storageBlobs.has(params.storagePath);
    return evaluateStorageCatalogRule({
      method: 'update',
      storagePath: params.storagePath,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      resourceExists: exists,
      contentType: 'image/png',
      sizeBytes: 1024,
    });
  }

  /**
   * Mô phỏng thử liệt kê danh sách file (`list` / `listAll`) trên Storage (`allow list: if false` - M7.3.5.2 Mục II.2).
   */
  public attemptListStorageCatalog(params: {
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    storagePath?: string;
  }): boolean {
    return evaluateStorageCatalogRule({
      method: 'list',
      storagePath: params.storagePath || 'avatar_catalog/tank_gold/v1/gold.png',
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
    });
  }

  private async rollbackOrphanedStorageObject(storagePath: string): Promise<void> {
    this.storageBlobs.delete(storagePath);
  }

  /**
   * Đồng bộ lại metadata Firestore từ `pendingSync` (M7.3.5.5 Mục III.B2):
   * - Kiểm tra `ownerUid`: người dùng hiện tại bắt buộc trùng `pending.ownerUid`.
   * - Chỉ cho phép retry khi bản ghi ở trạng thái `'UPLOAD_CONFIRMED_METADATA_PENDING'`
   *   (tuyệt đối không tạo metadata catalog cho bản ghi `'UPLOAD_INDETERMINATE'` chưa xác minh được trên Storage).
   * - Chỉ ghi metadata Firestore với `storagePath` đã tạo, không gọi `uploadBytes` lại.
   * - Chỉ xóa bản ghi pending khỏi bộ nhớ bền vững sau khi đọc lại từ Firestore và xác nhận khớp.
   */
  public async adminRetryPendingCatalogSync(params: {
    authUid?: string | null;
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    avatarId: string;
    nowMs: number;
  }): Promise<AvatarOperationResult> {
    let pending = this.pendingSyncs.get(params.avatarId) ?? null;
    if (!pending) {
      pending = await this.persistentPendingStore.getPendingRecord(params.avatarId);
      if (pending) {
        this.pendingSyncs.set(params.avatarId, pending);
      }
    }
    if (!pending) {
      return {
        success: false,
        errorCode: 'NO_PENDING_SYNC',
        message: 'Không có metadata chờ đồng bộ lại cho avatar này.',
      };
    }

    // Quy tắc 6: Kiểm tra ownerUid
    const callerUid = params.authUid !== undefined ? params.authUid : 'super_admin_uid';
    if (!callerUid || callerUid !== pending.ownerUid) {
      return {
        success: false,
        errorCode: 'PENDING_OWNER_MISMATCH',
        message:
          'Bạn không phải là tài khoản đã khởi tạo bản ghi pending này (ownerUid không khớp). Không được phép thực hiện retry.',
      };
    }

    // Quy tắc 5: Không tạo metadata catalog cho object ở trạng thái UPLOAD_INDETERMINATE chưa xác minh
    if (pending.status !== 'UPLOAD_CONFIRMED_METADATA_PENDING') {
      return {
        success: false,
        avatarId: pending.avatarId,
        version: pending.version,
        storagePath: pending.storagePath,
        pendingStatus: pending.status,
        errorCode: 'PENDING_UPLOAD_NOT_CONFIRMED',
        message:
          'Bản ghi upload đang ở trạng thái không xác định (UPLOAD_INDETERMINATE), chưa xác minh được file trên Storage nên không được phép tạo metadata danh mục. Vui lòng thực hiện tải lên mới (hệ thống sẽ tự động cấp version + 1).',
      };
    }

    const storageObj = this.storageBlobs.get(pending.storagePath);
    if (
      !storageObj ||
      storageObj.sizeBytes !== pending.fileSize ||
      storageObj.contentType !== pending.contentType ||
      storageObj.customMetadata?.uploadOperationId !== pending.uploadOperationId
    ) {
      return {
        success: false,
        errorCode: 'STORAGE_FILE_MISSING',
        message: 'File trên Firebase Storage không còn tồn tại hoặc không khớp uploadOperationId, vui lòng upload lại.',
      };
    }

    const existingDoc = this.catalogDocs.get(pending.avatarId) ?? null;
    const incomingDoc: Record<string, unknown> = {
      avatarId: pending.avatarId,
      name: pending.name,
      storagePath: pending.storagePath,
      contentType: pending.contentType,
      fileSize: pending.fileSize,
      version: pending.version,
      sortOrder: pending.sortOrder,
      isActive: pending.isActive,
      createdAt: existingDoc ? existingDoc.createdAt : params.nowMs,
      updatedAt: params.nowMs,
      updatedBy: params.authEmail || '',
    };

    const allowed = evaluateAvatarCatalogRule({
      action: existingDoc ? 'update' : 'create',
      avatarId: pending.avatarId,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs,
      existing: existingDoc,
      incoming: incomingDoc,
    });
    if (!allowed) {
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Không có quyền đồng bộ metadata /avatar_catalog.',
      };
    }

    this.catalogDocs.set(pending.avatarId, incomingDoc);

    // Quy tắc 4: Đọc lại từ Firestore và xác nhận khớp trước khi xóa bản ghi pending bền vững
    const verifiedDoc = this.catalogDocs.get(pending.avatarId);
    if (
      verifiedDoc &&
      verifiedDoc.avatarId === pending.avatarId &&
      verifiedDoc.storagePath === pending.storagePath &&
      verifiedDoc.version === pending.version &&
      verifiedDoc.fileSize === pending.fileSize
    ) {
      await this.persistentPendingStore.deletePendingRecord(pending.avatarId);
      this.pendingSyncs.delete(pending.avatarId);
    }

    return {
      success: true,
      avatarId: pending.avatarId,
      version: pending.version,
      storagePath: pending.storagePath,
      uploadOperationId: pending.uploadOperationId,
      metadataSynced: true,
      message: 'Đã đồng bộ lại metadata Firestore thành công mà không cần upload lại file.',
    };
  }

  /**
   * Super Admin bật / tắt (`isActive`) một avatar trong danh mục.
   */
  public adminSetCatalogActive(params: {
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    avatarId: string;
    isActive: boolean;
    nowMs: number;
  }): AvatarOperationResult {
    const existingDoc = this.catalogDocs.get(params.avatarId);
    if (!existingDoc) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        message: 'Không tìm thấy avatar trong danh mục.',
      };
    }

    const incomingDoc: Record<string, unknown> = {
      ...existingDoc,
      isActive: params.isActive,
      updatedAt: params.nowMs,
      updatedBy: params.authEmail || '',
    };

    const allowed = evaluateAvatarCatalogRule({
      action: 'update',
      avatarId: params.avatarId,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs,
      existing: existingDoc,
      incoming: incomingDoc,
    });
    if (!allowed) {
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Chỉ Super Admin được phép bật/tắt avatar trong danh mục.',
      };
    }

    this.catalogDocs.set(params.avatarId, incomingDoc);
    return {
      success: true,
      avatarId: params.avatarId,
      message: params.isActive ? 'Đã kích hoạt avatar.' : 'Đã ẩn avatar khỏi danh sách lựa chọn.',
    };
  }

  /**
   * Super Admin xóa hẳn một avatar khỏi danh mục (M7.3.5.1 Mục IV):
   * - Truy vấn có điều kiện theo `avatarId` kèm `limit(1)` thay vì tải toàn bộ `users`.
   * - Nếu đang có người chơi dùng -> chặn xóa và khuyến nghị ẩn (`isActive = false`).
   * - Nếu không còn ai dùng:
   *   1. Chuyển `isActive = false` trước để khóa lựa chọn mới.
   *   2. Xóa file trên Storage trước (`isValidCatalogDelete`: `request.resource == null && resource != null`).
   *   3. Chỉ khi xóa Storage thành công mới xóa tài liệu Firestore `/avatar_catalog/{avatarId}` để tránh lệch trạng thái.
   */
  public adminDeleteCatalogAvatar(params: {
    authEmail: string | null;
    isVerifiedPersonalGmail: boolean;
    avatarId: string;
    nowMs?: number;
  }): AvatarOperationResult {
    const existingDoc = this.catalogDocs.get(params.avatarId);
    if (!existingDoc) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        message: 'Avatar không tồn tại trong danh mục.',
      };
    }

    const canDeleteDoc = evaluateAvatarCatalogRule({
      action: 'delete',
      avatarId: params.avatarId,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs ?? Date.now(),
    });
    if (!canDeleteDoc) {
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Chỉ Super Admin mới có quyền xóa avatar khỏi danh mục.',
      };
    }

    // Truy vấn có điều kiện where('avatarType','==','catalog'), where('avatarId','==',avatarId), limit(1)
    this.lastDeleteUserQueryLimit = 1;
    let foundActiveUserWithAvatar = false;
    for (const uDoc of this.userDocs.values()) {
      if (uDoc.avatarType === 'catalog' && uDoc.avatarId === params.avatarId) {
        foundActiveUserWithAvatar = true;
        break; // tương đương limit(1): dừng ngay ở bản ghi đầu tiên khớp điều kiện
      }
    }

    if (foundActiveUserWithAvatar) {
      return {
        success: false,
        errorCode: 'AVATAR_IN_USE',
        message:
          'Không thể xóa hẳn vì đang có người chơi sử dụng avatar này. Vui lòng dùng chức năng "Ẩn" (isActive = false) để người chơi tự động chuyển về ảnh Google an toàn.',
      };
    }

    // Bước 1: Đặt isActive = false trước khi xóa file Storage để chặn người chơi chọn mới trong lúc đang xóa
    const storagePath = existingDoc.storagePath as string;
    this.catalogDocs.set(params.avatarId, {
      ...existingDoc,
      isActive: false,
      updatedAt: params.nowMs ?? Date.now(),
    });

    // Bước 2: Kiểm tra quyền xóa trên Storage (`allow write` -> `isValidCatalogDelete`)
    const canDeleteStorage = evaluateStorageCatalogRule({
      operation: 'write',
      action: 'delete',
      storagePath,
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      resourceExists: this.storageBlobs.has(storagePath),
      contentType: null,
      sizeBytes: null,
    });
    if (!canDeleteStorage) {
      return {
        success: false,
        errorCode: 'STORAGE_PERMISSION_DENIED',
        message: 'Storage Rules từ chối xóa file avatar.',
      };
    }

    if (this.failNextStorageDelete) {
      this.failNextStorageDelete = false;
      return {
        success: false,
        errorCode: 'STORAGE_DELETE_FAILED',
        message:
          'Xóa file trên Firebase Storage thất bại. Đã chuyển avatar sang trạng thái Ẩn (isActive = false) và giữ lại metadata để tránh mồ côi file Storage.',
      };
    }

    this.storageBlobs.delete(storagePath);

    // Bước 3: Chỉ xóa metadata Firestore sau khi file Storage đã được xóa an toàn
    this.catalogDocs.delete(params.avatarId);
    this.pendingSyncs.delete(params.avatarId);

    return {
      success: true,
      avatarId: params.avatarId,
      message: 'Đã xóa hoàn toàn avatar khỏi Firebase Storage và Firestore.',
    };
  }

  /**
   * Người chơi xem danh sách avatar đang hoạt động (`isActive == true`).
   */
  public listActiveCatalogForPlayer(params: {
    authEmail?: string | null;
    isVerifiedPersonalGmail: boolean;
  }): { allowed: boolean; items: AvatarCatalogItem[] } {
    const allowed = evaluateAvatarCatalogRule({
      action: 'list',
      avatarId: 'probe_list',
      authEmail: params.authEmail,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: Date.now(),
    });
    if (!allowed) {
      return { allowed: false, items: [] };
    }

    const items: AvatarCatalogItem[] = [];
    for (const raw of this.catalogDocs.values()) {
      if (raw.isActive === true) {
        items.push({
          avatarId: raw.avatarId as string,
          name: raw.name as string,
          storagePath: raw.storagePath as string,
          contentType: raw.contentType as AllowedAvatarContentType,
          fileSize: raw.fileSize as number,
          version: raw.version as number,
          sortOrder: raw.sortOrder as number,
          isActive: true,
          createdAtMs: raw.createdAt as number,
          updatedAtMs: raw.updatedAt as number,
          updatedBy: raw.updatedBy as string,
        });
      }
    }
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.avatarId.localeCompare(b.avatarId));
    return { allowed: true, items };
  }

  private lastFirestoreDiagnostic: AvatarFirestoreDiagnosticLog | null = null;

  public getLastFirestoreDiagnostic(): AvatarFirestoreDiagnosticLog | null {
    return this.lastFirestoreDiagnostic ? { ...this.lastFirestoreDiagnostic } : null;
  }

  /**
   * Người chơi chọn avatar trong danh mục (`avatarType: 'catalog'`) hoặc chuyển về ảnh Google (`avatarType: 'google'`).
   * Tách biệt hoàn toàn khỏi quyền chỉnh `displayName` và bảo đảm UID bất biến (M7.3.5.3 Mục V & M7.3.6 Mục III):
   * - Khi tạo mới (`existing == null`): ghi `['uid', 'avatarType', 'avatarId', 'avatarUpdatedAt']`.
   * - Khi cập nhật tài liệu đã có (`existing != null`): chỉ cập nhật `['avatarType', 'avatarId', 'avatarUpdatedAt']`
   *   bằng cơ chế merge (`setDoc(..., { merge: true })`) để không đưa `uid` vào `affectedKeys()` và không làm mất
   *   bất kỳ trường hồ sơ nào khác (`email`, `uid`, `role`, `isSuperAdmin`, `xp`, `xu`, `rank`, `displayName`, `createdAt`).
   * - Chỉ thông báo thành công khi đã đọc lại từ Firestore và xác nhận lưu thành công.
   */
  public playerSelectAvatar(params: {
    targetUid: string;
    authUid: string;
    isVerifiedPersonalGmail: boolean;
    avatarType: PlayerAvatarType;
    avatarId: string | null;
    extraFields?: Record<string, unknown>;
    googlePhotoUrl?: string | null;
    simulatedError?: 'PERMISSION_DENIED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'INVALID_DATA';
    nowMs: number;
  }): AvatarOperationResult {
    const docPath = `/users/${params.targetUid}`;
    const operation =
      params.avatarType === 'google' ? 'SELECT_GOOGLE_AVATAR' : 'SELECT_CATALOG_AVATAR';

    if (params.simulatedError) {
      const codeMap: Record<
        'PERMISSION_DENIED' | 'UNAUTHENTICATED' | 'NETWORK_ERROR' | 'INVALID_DATA',
        string
      > = {
        PERMISSION_DENIED: 'permission-denied',
        UNAUTHENTICATED: 'unauthenticated',
        NETWORK_ERROR: 'unavailable',
        INVALID_DATA: 'invalid-argument',
      };
      const classified = classifyUserProfileFirestoreError({
        code: codeMap[params.simulatedError],
      });
      this.lastFirestoreDiagnostic = {
        operation,
        path: docPath,
        errorCode: classified.errorCode,
        firestoreCode: classified.firestoreCode,
        timestampMs: params.nowMs,
      };
      return {
        success: false,
        errorCode: classified.errorCode,
        message: classified.userMessage,
      };
    }

    if (!params.authUid || !params.isVerifiedPersonalGmail) {
      const classified = classifyUserProfileFirestoreError({ code: 'unauthenticated' });
      this.lastFirestoreDiagnostic = {
        operation,
        path: docPath,
        errorCode: classified.errorCode,
        firestoreCode: classified.firestoreCode,
        timestampMs: params.nowMs,
      };
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: classified.userMessage,
      };
    }

    const existing = this.userDocs.get(params.targetUid) ?? null;
    const patch: Record<string, unknown> = existing
      ? {
          avatarType: params.avatarType,
          avatarId: params.avatarId,
          avatarUpdatedAt: params.nowMs,
          ...(params.extraFields ?? {}),
        }
      : {
          uid: params.targetUid,
          avatarType: params.avatarType,
          avatarId: params.avatarId,
          avatarUpdatedAt: params.nowMs,
          ...(params.extraFields ?? {}),
        };

    // Mô phỏng `setDoc(..., patch, { merge: true })`: giữ nguyên các trường cũ không nằm trong patch
    const incoming: Record<string, unknown> = existing ? { ...existing, ...patch } : patch;

    const allowed = evaluateUserProfileMetadataRule({
      action: existing ? 'update' : 'create',
      uid: params.targetUid,
      authUid: params.authUid,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs,
      existing,
      incoming,
      catalogLookup: (id: string) => {
        const doc = this.catalogDocs.get(id);
        return {
          exists: Boolean(doc),
          isActive: Boolean(doc && doc.isActive === true),
        };
      },
    });

    if (!allowed) {
      this.lastFirestoreDiagnostic = {
        operation,
        path: docPath,
        errorCode: 'PERMISSION_DENIED',
        firestoreCode: 'permission-denied',
        timestampMs: params.nowMs,
      };
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Không được phép lưu lựa chọn avatar này (vi phạm Firestore Security Rules).',
      };
    }

    this.userDocs.set(params.targetUid, incoming);

    // Xác nhận đọc lại từ Firestore trước khi báo thành công (M7.3.6 Mục III.4)
    const verifiedDoc = this.userDocs.get(params.targetUid);
    if (
      !verifiedDoc ||
      verifiedDoc.avatarType !== params.avatarType ||
      verifiedDoc.avatarId !== params.avatarId
    ) {
      this.lastFirestoreDiagnostic = {
        operation,
        path: docPath,
        errorCode: 'NETWORK_ERROR',
        firestoreCode: 'read-back-mismatch',
        timestampMs: params.nowMs,
      };
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Không thể xác nhận dữ liệu ảnh đại diện trên Firestore. Vui lòng thử lại.',
      };
    }

    this.lastFirestoreDiagnostic = null;
    return {
      success: true,
      avatarType: params.avatarType,
      avatarId: params.avatarId,
      avatarUrl: params.avatarType === 'google' ? params.googlePhotoUrl ?? null : undefined,
      message:
        params.avatarType === 'google'
          ? 'Đã chuyển về Ảnh đại diện Google.'
          : `Đã chọn avatar "${params.avatarId}".`,
    };
  }

  /**
   * Người chơi cập nhật tên hiển thị (`displayName`) tách biệt với quyền chọn avatar và bảo đảm UID bất biến (M7.3.5.3 Mục V):
   * - Khi tạo mới (`existing == null`): ghi `['uid', 'displayName']`.
   * - Khi cập nhật tài liệu đã có (`existing != null`): chỉ cập nhật `['displayName']` bằng cơ chế merge
   *   (`setDoc(..., { merge: true })`), giữ nguyên `uid` (hoặc trạng thái không có `uid` của hồ sơ cũ),
   *   `avatarType`, `avatarId`, `avatarUpdatedAt`, `xp`, `xu`, `rank`, `createdAt`.
   */
  public playerUpdateDisplayName(params: {
    targetUid: string;
    authUid: string;
    isVerifiedPersonalGmail: boolean;
    displayName: string;
    extraFields?: Record<string, unknown>;
    nowMs: number;
  }): AvatarOperationResult {
    const existing = this.userDocs.get(params.targetUid) ?? null;
    const patch: Record<string, unknown> = existing
      ? {
          displayName: params.displayName,
          ...(params.extraFields ?? {}),
        }
      : {
          uid: params.targetUid,
          displayName: params.displayName,
          ...(params.extraFields ?? {}),
        };
    const incoming: Record<string, unknown> = existing ? { ...existing, ...patch } : patch;

    const allowed = evaluateUserProfileMetadataRule({
      action: existing ? 'update' : 'create',
      uid: params.targetUid,
      authUid: params.authUid,
      isVerifiedPersonalGmail: params.isVerifiedPersonalGmail,
      requestTimeMs: params.nowMs,
      existing,
      incoming,
    });

    if (!allowed) {
      return {
        success: false,
        errorCode: 'FIRESTORE_PERMISSION_DENIED',
        message: 'Không được phép cập nhật tên hiển thị (vi phạm Firestore Security Rules).',
      };
    }

    this.userDocs.set(params.targetUid, incoming);
    return {
      success: true,
      message: 'Đã cập nhật tên hiển thị.',
    };
  }

  /**
   * Tính toán URL hiển thị thực tế của một người chơi trong hệ thống mô phỏng.
   */
  public resolveEffectiveAvatarForPlayer(
    uid: string,
    googlePhotoUrl: string | null
  ): string | null {
    const rawUser = this.userDocs.get(uid);
    const userMeta: UserProfileAvatarMetadata | null = rawUser
      ? {
          uid: (rawUser.uid as string) || uid,
          displayName: (rawUser.displayName as string | null | undefined) ?? null,
          avatarType: rawUser.avatarType as PlayerAvatarType,
          avatarId: (rawUser.avatarId as string | null) ?? null,
          avatarUpdatedAtMs: rawUser.avatarUpdatedAt as number,
        }
      : null;

    const catalogItems: AvatarCatalogItem[] = [];
    const resolvedUrls = new Map<string, string>();
    for (const raw of this.catalogDocs.values()) {
      const storagePath = raw.storagePath as string;
      catalogItems.push({
        avatarId: raw.avatarId as string,
        name: raw.name as string,
        storagePath,
        contentType: raw.contentType as AllowedAvatarContentType,
        fileSize: raw.fileSize as number,
        version: raw.version as number,
        sortOrder: raw.sortOrder as number,
        isActive: Boolean(raw.isActive),
        createdAtMs: raw.createdAt as number,
        updatedAtMs: raw.updatedAt as number,
        updatedBy: raw.updatedBy as string,
      });
      if (this.storageBlobs.has(storagePath)) {
        resolvedUrls.set(
          storagePath,
          `https://firebasestorage.googleapis.com/v0/b/bantank-bd525.firebasestorage.app/o/${encodeURIComponent(
            storagePath
          )}?alt=media`
        );
      }
    }

    return resolvePlayerAvatarUrl({
      uid,
      userMeta,
      catalogItems,
      resolvedStorageUrls: resolvedUrls,
      photoURL: googlePhotoUrl,
    });
  }
}

// ============================================================================
// QUẢN LÝ BỘ NHỚ ĐỆM & THU HỒI BLOB OBJECT URL & CHẾ ĐỘ TẢI AVATAR (M7.3.5.3 Mục IV)
// ============================================================================

/**
 * Chế độ tải ảnh đại diện từ Firebase Storage (M7.3.5.3 Mục IV):
 * - `STRICT_BLOB`: Chỉ tải nhị phân trực tiếp bằng Firebase Storage SDK (`getBlob()`), yêu cầu bucket đã cấu hình CORS.
 *   Mọi lượt tải bytes đều đính kèm Firebase Auth ID Token và được kiểm tra trực tiếp bởi `allow get` trong `storage.rules`.
 *   Nếu `getBlob()` thất bại (do thiếu CORS hoặc bị từ chối quyền), KHÔNG chuyển sang `getDownloadURL()`.
 * - `COMPAT_DOWNLOAD_URL`: Chế độ tương thích mặc định khi bucket Production chưa cấu hình CORS.
 *   Cho phép dùng `getDownloadURL()` (hoặc fallback từ `getBlob()` sang `getDownloadURL()`) để hiển thị qua `<img src>`
 *   mà không làm hỏng hiển thị ảnh trên PC, điện thoại và máy tính bảng.
 *   Lưu ý bảo mật: `COMPAT_DOWNLOAD_URL` có mức bảo mật thấp hơn `STRICT_BLOB` vì `getDownloadURL()` trả về URL kèm
 *   capability token (`?token=...`); các lần trình duyệt tải bytes qua URL đó không được Firebase Storage Rules đánh giá lại.
 * - `BLOB_WITH_CORS_FALLBACK` & `DOWNLOAD_URL_CORS_SAFE`: Bí danh tương thích ngược của `COMPAT_DOWNLOAD_URL`.
 */
export type StorageImageFetchMode =
  | 'STRICT_BLOB'
  | 'COMPAT_DOWNLOAD_URL'
  | 'BLOB_WITH_CORS_FALLBACK'
  | 'DOWNLOAD_URL_CORS_SAFE';

export const DEFAULT_STORAGE_IMAGE_FETCH_MODE: StorageImageFetchMode = 'COMPAT_DOWNLOAD_URL';

export class BlobObjectUrlCacheManager {
  private entries = new Map<
    string,
    { url: string; isBlobUrl: boolean; createdAtMs: number }
  >();
  private revokedCount = 0;
  private readonly maxEntries: number;
  private readonly revokeFn: (url: string) => void;

  public constructor(
    maxEntries: number = 64,
    customRevokeFn?: (url: string) => void
  ) {
    this.maxEntries = Math.max(4, maxEntries);
    this.revokeFn =
      customRevokeFn ??
      ((url: string) => {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          try {
            URL.revokeObjectURL(url);
          } catch {
            // Ignore revoke error
          }
        }
      });
  }

  public get(storagePath: string): string | null {
    const entry = this.entries.get(storagePath);
    if (!entry) return null;
    // Cập nhật thứ tự LRU
    this.entries.delete(storagePath);
    this.entries.set(storagePath, entry);
    return entry.url;
  }

  public has(storagePath: string): boolean {
    return this.entries.has(storagePath);
  }

  public toReadonlyMap(): ReadonlyMap<string, string> {
    const out = new Map<string, string>();
    for (const [k, v] of this.entries.entries()) {
      out.set(k, v.url);
    }
    return out;
  }

  public set(storagePath: string, url: string, isBlobUrl: boolean, nowMs: number = Date.now()): void {
    const existing = this.entries.get(storagePath);
    if (existing && existing.url !== url && existing.isBlobUrl) {
      this.revokeFn(existing.url);
      this.revokedCount += 1;
    }
    this.entries.delete(storagePath);

    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) break;
      this.revokePath(oldestKey);
    }

    this.entries.set(storagePath, { url, isBlobUrl, createdAtMs: nowMs });
  }

  public revokePath(storagePath: string): boolean {
    const entry = this.entries.get(storagePath);
    if (!entry) return false;
    this.entries.delete(storagePath);
    if (entry.isBlobUrl) {
      this.revokeFn(entry.url);
      this.revokedCount += 1;
    }
    return true;
  }

  /**
   * Thu hồi mọi URL thuộc các version cũ của cùng một `avatarId` khi Super Admin thay thế bằng version mới `v{version + 1}`.
   */
  public revokeObsoleteVersionsForAvatar(avatarId: string, keepStoragePath: string): number {
    const prefix = `avatar_catalog/${avatarId}/`;
    let count = 0;
    for (const key of Array.from(this.entries.keys())) {
      if (key.startsWith(prefix) && key !== keepStoragePath) {
        if (this.revokePath(key)) {
          count += 1;
        }
      }
    }
    return count;
  }

  /**
   * Thu hồi toàn bộ Object URL đang giữ (gọi khi người chơi đăng xuất hoặc giải phóng phiên).
   */
  public revokeAll(): number {
    let count = 0;
    for (const key of Array.from(this.entries.keys())) {
      if (this.revokePath(key)) {
        count += 1;
      }
    }
    this.entries.clear();
    return count;
  }

  public getRevokedCount(): number {
    return this.revokedCount;
  }

  public size(): number {
    return this.entries.size;
  }
}

// ============================================================================
// SINGLETON AVATAR MANAGER CHO ỨNG DỤNG THỰC TẾ (FIREBASE STORAGE + FIRESTORE)
// ============================================================================

type AvatarListener = () => void;

export class AvatarManager {
  private static instance: AvatarManager | null = null;

  private catalogItems: AvatarCatalogItem[] = [];
  private catalogUnsubscribe: Unsubscribe | null = null;
  private subscribedCatalogAuthUid: string | null = null;

  private userMetadataCache = new Map<string, UserProfileAvatarMetadata | null>();
  private userUnsubscribes = new Map<string, Unsubscribe>();

  private urlCache = new BlobObjectUrlCacheManager(64);
  private resolvedStorageUrls = new Map<string, string>();
  private inflightUrlFetches = new Map<string, Promise<string | null>>();
  private failedStoragePaths = new Set<string>();
  private storageFetchMode: StorageImageFetchMode = DEFAULT_STORAGE_IMAGE_FETCH_MODE;

  private usedOrIndeterminateStoragePaths = new Set<string>();
  private highestKnownVersionByAvatarId = new Map<string, number>();

  private persistentPendingStore: PendingUploadPersistentStore =
    new BrowserPendingUploadPersistentStore();
  private recoveredForUid: string | null = null;
  private recoveryInflight: Promise<void> | null = null;

  private stagedCatalogFile: StagedCatalogAvatarFile | null = null;
  private pendingMetadataSync: PendingCatalogMetadataSync | null = null;
  private currentUploadTask: UploadTask | null = null;
  private isUploadingCatalog = false;
  private uploadProgressPercent = 0;

  private listeners = new Set<AvatarListener>();

  public static getInstance(): AvatarManager {
    if (!AvatarManager.instance) {
      AvatarManager.instance = new AvatarManager();
    }
    return AvatarManager.instance;
  }

  public setPersistentPendingStore(store: PendingUploadPersistentStore): void {
    this.persistentPendingStore = store;
    this.recoveredForUid = null;
  }

  public getPersistentPendingStore(): PendingUploadPersistentStore {
    return this.persistentPendingStore;
  }

  public setStorageFetchMode(mode: StorageImageFetchMode): void {
    this.storageFetchMode = mode;
  }

  public getStorageFetchMode(): StorageImageFetchMode {
    return this.storageFetchMode;
  }

  public subscribe(listener: AvatarListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        // Ignore subscriber error
      }
    }
  }

  public isUploading(): boolean {
    return this.isUploadingCatalog;
  }

  public getUploadProgressPercent(): number {
    return this.uploadProgressPercent;
  }

  public getUploadProgressPct(): number | null {
    return this.isUploadingCatalog ? this.uploadProgressPercent : null;
  }

  public getStagedCatalogFile(): StagedCatalogAvatarFile | null {
    return this.stagedCatalogFile;
  }

  /**
   * Trả về bản ghi pending hiện tại nếu và chỉ nếu người dùng đang đăng nhập trùng khớp `ownerUid`
   * đã lưu trong bản ghi pending (M7.3.5.5 Mục III.B2 Quy tắc 6).
   */
  public getPendingMetadataSync(): PendingCatalogMetadataSync | null {
    const pending = this.pendingMetadataSync;
    if (!pending) return null;
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !isSuperAdminUser(currentUser) || currentUser.uid !== pending.ownerUid) {
      return null;
    }
    return pending;
  }

  public getPendingCatalogSync(): PendingCatalogMetadataSync | null {
    return this.getPendingMetadataSync();
  }

  /**
   * Tổng hợp lịch sử `version` và `storagePath` từ cả 3 nguồn (M7.3.5.5 Mục III.B2 Quy tắc 7):
   * 1. Dữ liệu `/avatar_catalog` trên Firestore,
   * 2. Các bản ghi pending đã lưu bền vững (IndexedDB / localStorage fallback),
   * 3. Các `storagePath` đã dùng hoặc không xác định đã được lưu bền vững.
   */
  public async syncVersionAndPathHistoryFromAllSources(
    extraCatalogRecords: Iterable<Record<string, unknown> | AvatarCatalogItem> = []
  ): Promise<void> {
    let persistedPending: PendingCatalogMetadataSync[] = [];
    let persistedUsed: UsedPathHistoryEntry[] = [];
    try {
      persistedPending = await this.persistentPendingStore.getAllPendingRecords();
      persistedUsed = await this.persistentPendingStore.getAllUsedOrIndeterminatePaths();
    } catch {
      // Ignore read errors during startup aggregation
    }
    const pendingList: PendingCatalogMetadataSync[] = [...persistedPending];
    if (this.pendingMetadataSync) {
      pendingList.push(this.pendingMetadataSync);
    }
    syncHighestVersionMapsFromCatalogRecords({
      catalogRecords: [...this.catalogItems, ...extraCatalogRecords],
      pendingRecords: pendingList,
      persistedUsedPaths: persistedUsed,
      highestVersionMap: this.highestKnownVersionByAvatarId,
      usedPathsSet: this.usedOrIndeterminateStoragePaths,
    });
  }

  /**
   * Khôi phục trạng thái Pending Upload từ IndexedDB / localStorage sau khi F5 hoặc mở lại trình duyệt (M7.3.5.5 Mục III.B2):
   * - Khi gặp bản ghi `UPLOAD_IN_PROGRESS` sau F5, tuyệt đối không mặc định upload đã thành công;
   *   chuyển trạng thái sang `UPLOAD_INDETERMINATE` trước.
   * - Gọi `getMetadata(storageRef(storage, record.storagePath))` để xác minh trên Firebase Storage:
   *   + Chỉ chuyển sang `UPLOAD_CONFIRMED_METADATA_PENDING` nếu xác minh được object tồn tại trên Storage
   *     VÀ khớp `customMetadata.uploadOperationId === record.uploadOperationId`, `size === record.fileSize`,
   *     và `contentType === record.contentType`.
   *   + Nếu không xác minh được: giữ ở `UPLOAD_INDETERMINATE`, giữ nguyên `storagePath` và `version` trong
   *     `usedOrIndeterminateStoragePaths` / `highestKnownVersionByAvatarId`, không xóa object, không tái sử dụng path
   *     và không tạo metadata catalog cho object chưa xác minh.
   * - Nếu người dùng hiện tại không khớp `record.ownerUid`: không hiển thị và không cho phép retry.
   */
  public async recoverPendingUploadsOnStartup(): Promise<void> {
    if (this.recoveryInflight) {
      return this.recoveryInflight;
    }

    const promise = (async () => {
      try {
        await this.syncVersionAndPathHistoryFromAllSources();

        const currentUser = AuthManager.getInstance().getCurrentUser();
        if (!currentUser || !isSuperAdminUser(currentUser)) {
          this.pendingMetadataSync = null;
          this.notify();
          return;
        }

        const db = getFirebaseDb();
        const storage = getFirebaseStorage();
        const allPersisted = await this.persistentPendingStore.getAllPendingRecords();

        let selectedPending: PendingCatalogMetadataSync | null = null;

        for (const record of allPersisted) {
          this.usedOrIndeterminateStoragePaths.add(record.storagePath);
          const prevVer = this.highestKnownVersionByAvatarId.get(record.avatarId) ?? 0;
          if (record.version > prevVer) {
            this.highestKnownVersionByAvatarId.set(record.avatarId, record.version);
          }

          if (record.ownerUid !== currentUser.uid) {
            continue;
          }

          // Nếu Firestore đã có sẵn tài liệu khớp storagePath và version -> xóa bản ghi pending đã hoàn tất
          if (db) {
            try {
              const existingSnap = await getDoc(doc(db, 'avatar_catalog', record.avatarId));
              if (existingSnap.exists()) {
                const existingData = existingSnap.data();
                if (
                  existingData &&
                  existingData.storagePath === record.storagePath &&
                  existingData.version === record.version
                ) {
                  await this.persistentPendingStore.deletePendingRecord(record.avatarId);
                  continue;
                }
              }
            } catch {
              // Ignore network error during catalog check
            }
          }

          if (record.status === 'UPLOAD_IN_PROGRESS' || record.status === 'UPLOAD_INDETERMINATE') {
            const indeterminateRecord: PendingCatalogMetadataSync = {
              ...record,
              status: 'UPLOAD_INDETERMINATE',
              errorMessage:
                'Tiến trình upload trước đó bị ngắt bởi F5/đóng trình duyệt. Đang kiểm tra xác minh object trên Firebase Storage.',
            };
            await this.persistentPendingStore.savePendingRecord(indeterminateRecord);

            let verifiedOnStorage = false;
            if (storage) {
              try {
                const meta = await getMetadata(storageRef(storage, record.storagePath));
                const remoteOpId = meta.customMetadata?.uploadOperationId;
                if (
                  remoteOpId === record.uploadOperationId &&
                  meta.size === record.fileSize &&
                  meta.contentType === record.contentType
                ) {
                  verifiedOnStorage = true;
                }
              } catch {
                verifiedOnStorage = false;
              }
            }

            if (verifiedOnStorage) {
              const confirmedRecord: PendingCatalogMetadataSync = {
                ...indeterminateRecord,
                status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
                errorMessage:
                  'Đã xác minh file tồn tại và khớp uploadOperationId trên Firebase Storage sau F5. Sẵn sàng đồng bộ metadata Firestore.',
              };
              await this.persistentPendingStore.savePendingRecord(confirmedRecord);
              selectedPending = confirmedRecord;
            } else if (!selectedPending) {
              selectedPending = indeterminateRecord;
            }
            continue;
          }

          if (record.status === 'UPLOAD_CONFIRMED_METADATA_PENDING') {
            let stillValid = true;
            if (storage) {
              try {
                const meta = await getMetadata(storageRef(storage, record.storagePath));
                const remoteOpId = meta.customMetadata?.uploadOperationId;
                if (
                  remoteOpId !== record.uploadOperationId ||
                  meta.size !== record.fileSize ||
                  meta.contentType !== record.contentType
                ) {
                  stillValid = false;
                }
              } catch {
                stillValid = false;
              }
            }

            if (stillValid) {
              selectedPending = record;
            } else {
              const downgraded: PendingCatalogMetadataSync = {
                ...record,
                status: 'UPLOAD_INDETERMINATE',
                errorMessage:
                  'Không xác minh được file hoặc uploadOperationId trên Firebase Storage sau khi tải lại trang.',
              };
              await this.persistentPendingStore.savePendingRecord(downgraded);
              if (!selectedPending) {
                selectedPending = downgraded;
              }
            }
          }
        }

        this.pendingMetadataSync = selectedPending;
        this.recoveredForUid = currentUser.uid;
        this.notify();
      } finally {
        this.recoveryInflight = null;
      }
    })();

    this.recoveryInflight = promise;
    return promise;
  }

  public clearStagedCatalogFile(): void {
    if (this.stagedCatalogFile?.previewObjectUrl) {
      try {
        URL.revokeObjectURL(this.stagedCatalogFile.previewObjectUrl);
      } catch {
        // Ignore revoke error
      }
    }
    this.stagedCatalogFile = null;
    this.notify();
  }

  /**
   * Trả về danh sách toàn bộ avatar trong danh mục (sắp xếp theo `sortOrder` tăng dần).
   * Người chơi chỉ hiển thị các mục có `isActive === true`; Super Admin thấy cả mục đang ẩn.
   */
  public getCatalogItems(includeInactive: boolean = false): AvatarCatalogItem[] {
    const list = includeInactive
      ? [...this.catalogItems]
      : this.catalogItems.filter((item) => item.isActive);
    return list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.avatarId.localeCompare(b.avatarId)
    );
  }

  /**
   * Trả về URL hiển thị đã được giải mã từ `storagePath` trong phiên đăng nhập hiện tại.
   */
  public getCatalogItemResolvedUrl(item: AvatarCatalogItem): string | null {
    return this.getCatalogItemUrl(item.storagePath);
  }

  public getCatalogItemUrl(storagePath: string): string | null {
    if (!storagePath || this.failedStoragePaths.has(storagePath)) {
      return null;
    }
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      return null;
    }
    const cached = this.urlCache.get(storagePath) ?? this.resolvedStorageUrls.get(storagePath);
    if (cached) {
      return cached;
    }
    void this.resolveStoragePathToUrl(storagePath);
    return null;
  }

  public isCatalogItemUrlLoading(storagePath: string): boolean {
    return Boolean(storagePath && this.inflightUrlFetches.has(storagePath));
  }

  public hasCatalogItemUrlError(storagePath: string): boolean {
    return Boolean(storagePath && this.failedStoragePaths.has(storagePath));
  }

  /**
   * Giải mã `storagePath` sang URL hiển thị (M7.3.5.3 Mục IV):
   * - Tuyệt đối không lưu `downloadURL` hoặc token trong Firestore hay `localStorage`.
   * - Không coi URL token là cơ chế xác thực Firebase.
   * - Hai chế độ rõ ràng:
   *   1. `STRICT_BLOB`: Chỉ tải trực tiếp qua Firebase Storage SDK (`getBlob(fileRef)`), yêu cầu CORS trên bucket.
   *      Mọi lượt tải bytes đều được kiểm tra bởi `allow get` trong `storage.rules`. Nếu `getBlob` thất bại, KHÔNG fallback sang download URL.
   *   2. `COMPAT_DOWNLOAD_URL` (mặc định hiện tại để không làm hỏng hiển thị ảnh trên PC, điện thoại, tablet khi chưa bật CORS Production):
   *      Cho phép sử dụng `getDownloadURL(fileRef)` (hoặc fallback khi `getBlob` bị chặn CORS).
   *      Ghi chú bảo mật: `COMPAT_DOWNLOAD_URL` có mức bảo mật thấp hơn `STRICT_BLOB` vì các lượt tải bytes qua download URL
   *      chứa capability token không được Firebase Storage Rules đánh giá lại.
   */
  private async resolveStoragePathToUrl(storagePath: string): Promise<string | null> {
    if (!storagePath || this.failedStoragePaths.has(storagePath)) {
      return null;
    }
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      return null;
    }

    const existing = this.urlCache.get(storagePath) ?? this.resolvedStorageUrls.get(storagePath);
    if (existing) return existing;

    const inflight = this.inflightUrlFetches.get(storagePath);
    if (inflight) return inflight;

    const storage = getFirebaseStorage();
    if (!storage) return null;

    const promise = (async () => {
      try {
        const fileRef = storageRef(storage, storagePath);
        const mode = this.storageFetchMode;

        // 1. Chế độ STRICT_BLOB: chỉ tải bằng getBlob(), không bao giờ fallback sang getDownloadURL()
        if (mode === 'STRICT_BLOB') {
          if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
            this.failedStoragePaths.add(storagePath);
            this.notify();
            return null;
          }
          const blob = await getBlob(fileRef);
          const blobUrl = URL.createObjectURL(blob);
          this.urlCache.set(storagePath, blobUrl, true);
          this.resolvedStorageUrls.set(storagePath, blobUrl);
          this.failedStoragePaths.delete(storagePath);
          this.notify();
          return blobUrl;
        }

        // 2. Chế độ BLOB_WITH_CORS_FALLBACK: thử getBlob() trước, nếu lỗi CORS thì chuyển sang COMPAT_DOWNLOAD_URL
        if (
          mode === 'BLOB_WITH_CORS_FALLBACK' &&
          typeof URL !== 'undefined' &&
          typeof URL.createObjectURL === 'function'
        ) {
          try {
            const blob = await getBlob(fileRef);
            const blobUrl = URL.createObjectURL(blob);
            this.urlCache.set(storagePath, blobUrl, true);
            this.resolvedStorageUrls.set(storagePath, blobUrl);
            this.failedStoragePaths.delete(storagePath);
            this.notify();
            return blobUrl;
          } catch {
            // Fallback sang getDownloadURL bên dưới khi bucket chưa cấu hình CORS
          }
        }

        // 3. Chế độ COMPAT_DOWNLOAD_URL (hoặc DOWNLOAD_URL_CORS_SAFE / fallback từ BLOB_WITH_CORS_FALLBACK):
        const url = await getDownloadURL(fileRef);
        this.urlCache.set(storagePath, url, false);
        this.resolvedStorageUrls.set(storagePath, url);
        this.failedStoragePaths.delete(storagePath);
        this.notify();
        return url;
      } catch {
        this.failedStoragePaths.add(storagePath);
        this.notify();
        return null;
      } finally {
        this.inflightUrlFetches.delete(storagePath);
      }
    })();

    this.inflightUrlFetches.set(storagePath, promise);
    return promise;
  }

  public observeCatalog(): void {
    this.ensureCatalogSubscription();
  }

  /**
   * Đảm bảo chỉ có đúng 1 listener `onSnapshot` cho `/avatar_catalog` khi người chơi đã đăng nhập.
   * Lưu ý: Không sử dụng `list` / `listAll()` của Firebase Storage (`allow list: if false`);
   * danh sách avatar được lấy từ Firestore `/avatar_catalog` và chỉ đọc từng object theo `item.storagePath`.
   */
  public ensureCatalogSubscription(): void {
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      this.stopCatalogSubscription();
      return;
    }

    if (this.recoveredForUid !== currentUser.uid) {
      void this.recoverPendingUploadsOnStartup();
    }

    if (this.catalogUnsubscribe && this.subscribedCatalogAuthUid === currentUser.uid) {
      return;
    }

    this.stopCatalogSubscription();
    const db = getFirebaseDb();
    if (!db) return;

    this.subscribedCatalogAuthUid = currentUser.uid;
    const colRef = collection(db, 'avatar_catalog');
    this.catalogUnsubscribe = onSnapshot(
      colRef,
      (snap) => {
        const items: AvatarCatalogItem[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (!data || typeof data.avatarId !== 'string' || typeof data.storagePath !== 'string') {
            return;
          }
          const createdAtMs =
            data.createdAt instanceof Timestamp
              ? data.createdAt.toMillis()
              : typeof data.createdAt === 'number'
                ? data.createdAt
                : 0;
          const updatedAtMs =
            data.updatedAt instanceof Timestamp
              ? data.updatedAt.toMillis()
              : typeof data.updatedAt === 'number'
                ? data.updatedAt
                : 0;

          const item: AvatarCatalogItem = {
            avatarId: data.avatarId,
            name: typeof data.name === 'string' ? data.name : data.avatarId,
            storagePath: data.storagePath,
            contentType:
              data.contentType === 'image/png' ||
              data.contentType === 'image/webp' ||
              data.contentType === 'image/jpeg'
                ? data.contentType
                : 'image/png',
            fileSize: typeof data.fileSize === 'number' ? data.fileSize : 0,
            version: typeof data.version === 'number' ? data.version : 1,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
            isActive: Boolean(data.isActive),
            createdAtMs,
            updatedAtMs,
            updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
          };
          items.push(item);

          // Thu hồi các Blob URL của version cũ nếu avatarId đã sang version mới
          this.urlCache.revokeObsoleteVersionsForAvatar(item.avatarId, item.storagePath);

          if (item.isActive || isSuperAdminUser(AuthManager.getInstance().getCurrentUser())) {
            void this.resolveStoragePathToUrl(item.storagePath);
          }
        });

        items.sort((a, b) => a.sortOrder - b.sortOrder || a.avatarId.localeCompare(b.avatarId));
        this.catalogItems = items;
        // M7.3.5.5 Mục III.B2: Tổng hợp lịch sử version và đường dẫn từ cả 3 nguồn
        void this.syncVersionAndPathHistoryFromAllSources(items);
        this.notify();
      },
      () => {
        // Không văng lỗi ra giao diện nếu chưa có quyền đọc
      }
    );
  }

  public stopCatalogSubscription(): void {
    if (this.catalogUnsubscribe) {
      try {
        this.catalogUnsubscribe();
      } catch {
        // Ignore
      }
      this.catalogUnsubscribe = null;
    }
    this.subscribedCatalogAuthUid = null;
    this.urlCache.revokeAll();
    this.resolvedStorageUrls.clear();
  }

  public observeUserMetadata(uid: string | null | undefined): void {
    this.ensureUserAvatarSubscribed(uid);
  }

  public async fetchUserMetadataOnce(
    uid: string | null | undefined
  ): Promise<UserProfileAvatarMetadata | null> {
    if (!uid || !AVATAR_LIMITS.UID_REGEX.test(uid)) return null;
    const cached = this.userMetadataCache.get(uid);
    if (cached) return cached;

    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) return null;

    const db = getFirebaseDb();
    if (!db) return null;

    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        const defaultMeta: UserProfileAvatarMetadata = {
          uid,
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAtMs: 0,
        };
        this.userMetadataCache.set(uid, defaultMeta);
        this.notify();
        return defaultMeta;
      }
      const data = snap.data();
      const updatedAtMs =
        data.avatarUpdatedAt instanceof Timestamp
          ? data.avatarUpdatedAt.toMillis()
          : typeof data.avatarUpdatedAt === 'number'
            ? data.avatarUpdatedAt
            : 0;
      const avatarType: PlayerAvatarType =
        data.avatarType === 'catalog' ? 'catalog' : 'google';
      const avatarId =
        avatarType === 'catalog' && typeof data.avatarId === 'string' ? data.avatarId : null;
      const meta: UserProfileAvatarMetadata = {
        uid,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        avatarType,
        avatarId,
        avatarUpdatedAtMs: updatedAtMs,
      };
      this.userMetadataCache.set(uid, meta);
      this.notify();
      return meta;
    } catch {
      return this.userMetadataCache.get(uid) ?? null;
    }
  }

  /**
   * Đăng ký theo dõi hồ sơ `/users/{uid}` của một người chơi.
   */
  public ensureUserAvatarSubscribed(uid: string | null | undefined): void {
    if (!uid || !AVATAR_LIMITS.UID_REGEX.test(uid)) return;
    this.ensureCatalogSubscription();

    if (this.userUnsubscribes.has(uid)) return;
    const db = getFirebaseDb();
    if (!db) return;

    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) return;

    const userDocRef = doc(db, 'users', uid);
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) {
          this.userMetadataCache.set(uid, {
            uid,
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAtMs: 0,
          });
          this.notify();
          return;
        }
        const data = snap.data();
        const updatedAtMs =
          data.avatarUpdatedAt instanceof Timestamp
            ? data.avatarUpdatedAt.toMillis()
            : typeof data.avatarUpdatedAt === 'number'
              ? data.avatarUpdatedAt
              : 0;
        const avatarType: PlayerAvatarType =
          data.avatarType === 'catalog' ? 'catalog' : 'google';
        const avatarId =
          avatarType === 'catalog' && typeof data.avatarId === 'string' ? data.avatarId : null;

        this.userMetadataCache.set(uid, {
          uid,
          displayName: typeof data.displayName === 'string' ? data.displayName : null,
          avatarType,
          avatarId,
          avatarUpdatedAtMs: updatedAtMs,
        });
        this.notify();
      },
      () => {
        // Fallback an toàn về Google avatar nếu chưa đọc được
        if (!this.userMetadataCache.has(uid)) {
          this.userMetadataCache.set(uid, {
            uid,
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAtMs: 0,
          });
        }
      }
    );

    this.userUnsubscribes.set(uid, unsub);
  }

  public stopAllSubscriptions(): void {
    this.stopCatalogSubscription();
    for (const unsub of this.userUnsubscribes.values()) {
      try {
        unsub();
      } catch {
        // Ignore
      }
    }
    this.userUnsubscribes.clear();
  }

  public getUserMetadata(uid: string | null | undefined): UserProfileAvatarMetadata | null {
    if (!uid) return null;
    return this.userMetadataCache.get(uid) ?? null;
  }

  /**
   * Trả về URL hiển thị avatar hiệu lực cho người chơi (Menu chính, Hồ sơ chỉ huy, Lobby Co-op Online):
   * - Tự động fallback về `photoURL` của Google nếu avatar danh mục bị ẩn (`isActive == false`) hoặc lỗi tải ảnh.
   */
  public getEffectiveAvatarUrl(
    uid: string | null | undefined,
    fallbackPhotoUrl?: string | null
  ): string | null {
    if (uid) {
      this.ensureUserAvatarSubscribed(uid);
    }
    const meta = uid ? this.userMetadataCache.get(uid) ?? null : null;
    return resolvePlayerAvatarUrl({
      uid,
      userMeta: meta,
      catalogItems: this.catalogItems,
      resolvedStorageUrls: this.resolvedStorageUrls,
      failedStoragePaths: this.failedStoragePaths,
      photoURL: fallbackPhotoUrl,
    });
  }

  public getEffectivePlayerAvatarUrl(params: {
    uid?: string | null;
    photoURL?: string | null;
  }): string | null {
    return this.getEffectiveAvatarUrl(params.uid, params.photoURL);
  }

  /**
   * Đánh dấu một URL hoặc `storagePath` bị lỗi tải ảnh (`onError` trên thẻ `<img>`)
   * để tự động chuyển về ảnh Google hoặc icon mặc định.
   */
  public markAvatarUrlFailed(uidOrStoragePath: string | null | undefined): void {
    if (!uidOrStoragePath) return;
    const meta = this.userMetadataCache.get(uidOrStoragePath);
    if (meta && meta.avatarType === 'catalog' && meta.avatarId) {
      const cat = this.catalogItems.find((c) => c.avatarId === meta.avatarId);
      if (cat) {
        this.failedStoragePaths.add(cat.storagePath);
        this.notify();
        return;
      }
    }
    if (AVATAR_LIMITS.STORAGE_PATH_REGEX.test(uidOrStoragePath)) {
      this.failedStoragePaths.add(uidOrStoragePath);
      this.notify();
    }
  }

  // ==========================================================================
  // THAO TÁC CỦA NGƯỜI CHƠI: CHỌN ẢNH GOOGLE HOẶC CHỌN AVATAR TRONG DANH MỤC
  // ==========================================================================

  private lastFirestoreDiagnostic: AvatarFirestoreDiagnosticLog | null = null;

  public getLastFirestoreDiagnostic(): AvatarFirestoreDiagnosticLog | null {
    return this.lastFirestoreDiagnostic ? { ...this.lastFirestoreDiagnostic } : null;
  }

  private recordFirestoreDiagnostic(
    operation: AvatarFirestoreDiagnosticLog['operation'],
    path: string,
    errorCode: AvatarFirestoreDiagnosticLog['errorCode'],
    firestoreCode: string
  ): void {
    const entry: AvatarFirestoreDiagnosticLog = {
      operation,
      path,
      errorCode,
      firestoreCode,
      timestampMs: Date.now(),
    };
    this.lastFirestoreDiagnostic = entry;
    console.warn('[AvatarManager][FirestoreDiagnostic]', {
      operation: entry.operation,
      path: entry.path,
      errorCode: entry.errorCode,
      firestoreCode: entry.firestoreCode,
    });
  }

  /**
   * Người chơi chọn sử dụng Ảnh Google (`avatarType: "google"`, `avatarId: null`).
   * Tách biệt với quyền chỉnh `displayName` và bảo đảm UID bất biến (M7.3.5.3 Mục V & M7.3.6 Mục III):
   * - Lấy ảnh Google từ `getGooglePhotoUrlForUser(currentUser)` (`user.photoURL` hoặc `user.providerData` của `google.com`).
   * - Chỉ ghi `['avatarType', 'avatarId', 'avatarUpdatedAt']` qua `setDoc(..., payload, { merge: true })`
   *   để không ghi đè các trường hồ sơ khác (`email`, `uid`, `role`, `isSuperAdmin`, `xp`, `xu`, `rank`, `displayName`)
   *   và không lưu `downloadURL`, capability token hay ID token vào Firestore.
   * - Đọc lại từ Firestore (`getDoc`) để xác nhận lưu thành công trước khi thông báo thành công.
   */
  public async selectGoogleAvatar(): Promise<AvatarOperationResult> {
    const auth = AuthManager.getInstance();
    const currentUser = auth.getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      this.recordFirestoreDiagnostic(
        'SELECT_GOOGLE_AVATAR',
        `/users/${currentUser?.uid || 'unauthenticated'}`,
        'UNAUTHENTICATED',
        'unauthenticated'
      );
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Bạn cần đăng nhập bằng Gmail cá nhân hợp lệ để đổi ảnh đại diện.',
      };
    }

    const sessionState = SessionManager.getInstance().getSnapshot().status;
    if (sessionState === 'DISPLACED') {
      return {
        success: false,
        errorCode: 'SESSION_CONFLICT',
        message: 'Phiên đăng nhập đang bị khóa do xung đột thiết bị.',
      };
    }

    const db = getFirebaseDb();
    if (!db) {
      this.recordFirestoreDiagnostic(
        'SELECT_GOOGLE_AVATAR',
        `/users/${currentUser.uid}`,
        'NETWORK_ERROR',
        'firestore-unavailable'
      );
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Chưa kết nối được dịch vụ Cloud Firestore. Vui lòng kiểm tra kết nối mạng.',
      };
    }

    const existingMeta = this.userMetadataCache.get(currentUser.uid);
    const googlePhotoUrl = getGooglePhotoUrlForUser(currentUser);
    const userDocPath = `/users/${currentUser.uid}`;
    const userRef = doc(db, 'users', currentUser.uid);
    const payload: Record<string, unknown> = {
      avatarType: 'google',
      avatarId: null,
      avatarUpdatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, payload, { merge: true });
      const verifiedSnap = await getDoc(userRef);
      const verifiedData = verifiedSnap.exists()
        ? (verifiedSnap.data() as Record<string, unknown>)
        : null;
      if (!verifiedData || verifiedData.avatarType !== 'google' || verifiedData.avatarId !== null) {
        this.recordFirestoreDiagnostic(
          'SELECT_GOOGLE_AVATAR',
          userDocPath,
          'NETWORK_ERROR',
          'read-back-unconfirmed'
        );
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          message: 'Không thể xác nhận lưu lựa chọn ảnh Google trên Firestore. Vui lòng thử lại.',
        };
      }

      const verifiedDisplayName =
        typeof verifiedData.displayName === 'string' && verifiedData.displayName.trim().length > 0
          ? verifiedData.displayName.trim()
          : existingMeta?.displayName ?? currentUser.displayName ?? null;

      this.lastFirestoreDiagnostic = null;
      this.userMetadataCache.set(currentUser.uid, {
        uid: currentUser.uid,
        displayName: verifiedDisplayName,
        avatarType: 'google',
        avatarId: null,
        avatarUpdatedAtMs: Date.now(),
      });
      this.notify();
      return {
        success: true,
        avatarType: 'google',
        avatarId: null,
        avatarUrl: googlePhotoUrl,
        message: 'Đã chuyển về sử dụng Ảnh đại diện Google.',
      };
    } catch (err: any) {
      const classified = classifyUserProfileFirestoreError(err);
      this.recordFirestoreDiagnostic(
        'SELECT_GOOGLE_AVATAR',
        userDocPath,
        classified.errorCode,
        classified.firestoreCode
      );
      return {
        success: false,
        errorCode: classified.errorCode,
        message: classified.userMessage,
      };
    }
  }

  /**
   * Người chơi chọn một avatar đang hoạt động (`isActive === true`) trong Danh mục Avatar chung.
   * Tách biệt với quyền chỉnh `displayName` và bảo đảm UID bất biến (M7.3.5.3 Mục V & M7.3.6 Mục III):
   * chỉ ghi `['avatarType', 'avatarId', 'avatarUpdatedAt']` qua `setDoc(..., payload, { merge: true })`
   * để không đưa `uid` vào `affectedKeys()` và không tự ý thêm `uid` vào hồ sơ cũ không có trường `uid`.
   * Chỉ báo thành công sau khi đọc lại từ Firestore (`getDoc`) xác nhận lưu thành công.
   */
  public async selectCatalogAvatar(avatarId: string): Promise<AvatarOperationResult> {
    const auth = AuthManager.getInstance();
    const currentUser = auth.getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      this.recordFirestoreDiagnostic(
        'SELECT_CATALOG_AVATAR',
        `/users/${currentUser?.uid || 'unauthenticated'}`,
        'UNAUTHENTICATED',
        'unauthenticated'
      );
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Bạn cần đăng nhập bằng Gmail cá nhân hợp lệ để chọn avatar.',
      };
    }

    const sessionState = SessionManager.getInstance().getSnapshot().status;
    if (sessionState === 'DISPLACED') {
      return {
        success: false,
        errorCode: 'SESSION_CONFLICT',
        message: 'Phiên đăng nhập đang bị khóa do xung đột thiết bị.',
      };
    }

    const cleanId = (avatarId || '').trim();
    const targetItem = this.catalogItems.find(
      (item) => item.avatarId === cleanId && item.isActive === true
    );
    if (!targetItem) {
      return {
        success: false,
        errorCode: 'AVATAR_NOT_ACTIVE',
        message: 'Avatar bạn chọn không tồn tại hoặc đã tạm ẩn khỏi danh mục.',
      };
    }

    const db = getFirebaseDb();
    if (!db) {
      this.recordFirestoreDiagnostic(
        'SELECT_CATALOG_AVATAR',
        `/users/${currentUser.uid}`,
        'NETWORK_ERROR',
        'firestore-unavailable'
      );
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Chưa kết nối được dịch vụ Cloud Firestore. Vui lòng kiểm tra kết nối mạng.',
      };
    }

    const existingMeta = this.userMetadataCache.get(currentUser.uid);
    const userDocPath = `/users/${currentUser.uid}`;
    const userRef = doc(db, 'users', currentUser.uid);
    const payload: Record<string, unknown> = {
      avatarType: 'catalog',
      avatarId: cleanId,
      avatarUpdatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, payload, { merge: true });
      const verifiedSnap = await getDoc(userRef);
      const verifiedData = verifiedSnap.exists()
        ? (verifiedSnap.data() as Record<string, unknown>)
        : null;
      if (
        !verifiedData ||
        verifiedData.avatarType !== 'catalog' ||
        verifiedData.avatarId !== cleanId
      ) {
        this.recordFirestoreDiagnostic(
          'SELECT_CATALOG_AVATAR',
          userDocPath,
          'NETWORK_ERROR',
          'read-back-unconfirmed'
        );
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          message: 'Không thể xác nhận lưu lựa chọn avatar trên Firestore. Vui lòng thử lại.',
        };
      }

      const verifiedDisplayName =
        typeof verifiedData.displayName === 'string' && verifiedData.displayName.trim().length > 0
          ? verifiedData.displayName.trim()
          : existingMeta?.displayName ?? currentUser.displayName ?? null;

      this.lastFirestoreDiagnostic = null;
      this.userMetadataCache.set(currentUser.uid, {
        uid: currentUser.uid,
        displayName: verifiedDisplayName,
        avatarType: 'catalog',
        avatarId: cleanId,
        avatarUpdatedAtMs: Date.now(),
      });
      const resolvedUrl = await this.resolveStoragePathToUrl(targetItem.storagePath);
      this.notify();
      return {
        success: true,
        avatarType: 'catalog',
        avatarId: cleanId,
        avatarUrl: resolvedUrl,
        message: `Đã chọn ảnh đại diện "${targetItem.name}".`,
      };
    } catch (err: any) {
      const classified = classifyUserProfileFirestoreError(err);
      this.recordFirestoreDiagnostic(
        'SELECT_CATALOG_AVATAR',
        userDocPath,
        classified.errorCode,
        classified.firestoreCode
      );
      return {
        success: false,
        errorCode: classified.errorCode,
        message:
          classified.errorCode === 'PERMISSION_DENIED'
            ? 'Không thể chọn avatar này do thiếu quyền Firestore (hoặc avatar vừa bị quản trị viên tạm ẩn).'
            : classified.userMessage,
      };
    }
  }

  /**
   * Cập nhật tên hiển thị (`displayName`) trên `/users/{uid}` tách biệt hoàn toàn khỏi quyền chọn avatar
   * và bảo đảm UID bất biến (M7.3.5.3 Mục V):
   * chỉ ghi `['displayName']` qua `setDoc(..., { merge: true })`, không đưa `uid` vào `affectedKeys()`.
   */
  public async updateDisplayName(
    newDisplayName: string
  ): Promise<AvatarOperationResult & { message: string }> {
    const auth = AuthManager.getInstance();
    const currentUser = auth.getCurrentUser();
    if (!currentUser || !validatePersonalGmailUser(currentUser).isValid) {
      return {
        success: false,
        errorCode: 'UNAUTHENTICATED',
        message: 'Bạn cần đăng nhập để cập nhật tên hiển thị.',
      };
    }

    const cleanName = (newDisplayName || '').trim().slice(0, 40);
    if (!cleanName) {
      return {
        success: false,
        errorCode: 'INVALID_DISPLAY_NAME',
        message: 'Tên hiển thị không được để trống.',
      };
    }

    const db = getFirebaseDb();
    if (!db) {
      return {
        success: false,
        errorCode: 'FIRESTORE_UNAVAILABLE',
        message: 'Chưa kết nối được dịch vụ Cloud Firestore.',
      };
    }

    const existingMeta = this.userMetadataCache.get(currentUser.uid);
    const avatarType: PlayerAvatarType = existingMeta?.avatarType ?? 'google';
    const avatarId = avatarType === 'catalog' ? existingMeta?.avatarId ?? null : null;
    const userRef = doc(db, 'users', currentUser.uid);

    try {
      await setDoc(
        userRef,
        {
          displayName: cleanName,
        },
        { merge: true }
      );
      const verifiedSnap = await getDoc(userRef);
      if (!verifiedSnap.exists() || verifiedSnap.data()?.displayName !== cleanName) {
        return {
          success: false,
          errorCode: 'NETWORK_ERROR',
          message: 'Không thể xác nhận tên hiển thị trên Firestore. Vui lòng thử lại.',
        };
      }
      this.userMetadataCache.set(currentUser.uid, {
        uid: currentUser.uid,
        displayName: cleanName,
        avatarType,
        avatarId,
        avatarUpdatedAtMs: existingMeta?.avatarUpdatedAtMs ?? 0,
      });
      this.notify();
      return {
        success: true,
        avatarType,
        avatarId,
        message: 'Đã lưu tên hiển thị.',
      };
    } catch (err: any) {
      const classified = classifyUserProfileFirestoreError(err);
      this.recordFirestoreDiagnostic(
        'UPDATE_DISPLAY_NAME',
        `/users/${currentUser.uid}`,
        classified.errorCode,
        classified.firestoreCode
      );
      return {
        success: false,
        errorCode: classified.errorCode,
        message: classified.userMessage,
      };
    }
  }

  // ==========================================================================
  // THAO TÁC QUẢN TRỊ CỦA SUPER ADMIN (`linhnk.online@gmail.com`)
  // ==========================================================================

  /**
   * Bước 1 (Super Admin): Chọn file ảnh từ thiết bị, kiểm tra định dạng JPEG/PNG/WebP,
   * dung lượng <= 5 MB, magic bytes, giải mã thử bằng `createImageBitmap` (<= 2048x2048 px)
   * và tạo URL xem trước cục bộ trước khi upload.
   */
  public async stageCatalogAvatarFileForAdmin(
    file: File
  ): Promise<AvatarOperationResult & { staged?: StagedCatalogAvatarFile; error?: string }> {
    if (!isSuperAdminUser(AuthManager.getInstance().getCurrentUser())) {
      const msg = `Chỉ Super Admin (${SUPER_ADMIN_EMAIL}) mới có quyền quản trị danh mục avatar.`;
      return {
        success: false,
        errorCode: 'NOT_SUPER_ADMIN',
        error: msg,
        message: msg,
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const validation = validateCatalogAvatarFileClientSide({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        arrayBuffer,
      });

      if (!validation.valid || !validation.contentType || !validation.format) {
        const msg = validation.errorMessage || 'File ảnh không hợp lệ.';
        return {
          success: false,
          errorCode: validation.errorCode || 'INVALID_FILE',
          error: msg,
          message: msg,
        };
      }

      const bitmapResult = await decodeAndVerifyAvatarBitmapInBrowser(
        arrayBuffer,
        validation.contentType
      );
      if (!bitmapResult.valid) {
        const msg = bitmapResult.errorMessage || 'Không thể giải mã hình ảnh.';
        return {
          success: false,
          errorCode: 'BITMAP_DECODE_FAILED',
          error: msg,
          message: msg,
        };
      }

      this.clearStagedCatalogFile();

      let previewObjectUrl: string | null = null;
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const blob = new Blob([arrayBuffer], { type: validation.contentType });
          previewObjectUrl = URL.createObjectURL(blob);
        } catch {
          previewObjectUrl = null;
        }
      }

      const stagedObj: StagedCatalogAvatarFile = {
        fileName: file.name,
        sanitizedFileName: generateUniqueCatalogFileName(file.name, validation.contentType),
        contentType: validation.contentType,
        format: validation.format,
        sizeBytes: validation.sizeBytes,
        width: bitmapResult.width,
        height: bitmapResult.height,
        totalPixels: bitmapResult.width * bitmapResult.height,
        arrayBuffer,
        previewObjectUrl,
      };
      this.stagedCatalogFile = stagedObj;
      this.notify();

      return {
        success: true,
        staged: stagedObj,
        message: `Hợp lệ: ${validation.format} • ${bitmapResult.width}×${bitmapResult.height}px • ${(
          validation.sizeBytes / 1024
        ).toFixed(1)} KB. Sẵn sàng tải lên Firebase Storage.`,
      };
    } catch {
      const msg = 'Không thể đọc dữ liệu file ảnh từ thiết bị.';
      return {
        success: false,
        errorCode: 'READ_FILE_ERROR',
        error: msg,
        message: msg,
      };
    }
  }

  public async stageCatalogAvatarFile(
    file: File
  ): Promise<AvatarOperationResult & { staged?: StagedCatalogAvatarFile; error?: string }> {
    return this.stageCatalogAvatarFileForAdmin(file);
  }

  public cancelActiveUpload(): void {
    this.cancelCurrentUpload();
  }

  public async uploadStagedCatalogAvatar(params: {
    name: string;
    sortOrder: number;
    isActive: boolean;
    replaceAvatarId?: string | null;
    avatarId?: string;
  }): Promise<AvatarOperationResult> {
    const derivedId =
      (params.replaceAvatarId && params.replaceAvatarId.trim()) ||
      (params.avatarId && params.avatarId.trim()) ||
      `tank_${Date.now().toString(36)}`;
    return this.adminUploadStagedCatalogAvatar({
      avatarId: derivedId,
      name: params.name,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
    });
  }

  /**
   * Bước 2 (Super Admin): Upload ảnh đã kiểm tra lên Firebase Storage (`avatar_catalog/{avatarId}/v{version}/{uuid_fileName}`)
   * rồi ghi metadata vào Firestore (`/avatar_catalog/{avatarId}`) (M7.3.5.3 & M7.3.5.5 Mục III):
   * - Tổng hợp lịch sử `version` và `storagePath` từ cả 3 nguồn (Firestore catalog, pending records bền vững, used paths bền vững).
   * - Cấp phát `storagePath` mới, duy nhất bằng `allocateUniqueCatalogStoragePath()` kèm tên file gắn UUID,
   *   `uploadOperationId` (UUID duy nhất) và tăng `version` (`v{nextVersion}`).
   * - Lưu và xác nhận bản ghi `UPLOAD_IN_PROGRESS` vào bộ nhớ bền vững (IndexedDB / localStorage) TRƯỚC KHI gọi `uploadBytesResumable`.
   *   Nếu không thể ghi bản ghi pending vào bộ nhớ bền vững -> dừng ngay trước khi upload (`PENDING_STORE_WRITE_FAILED`).
   * - Đính kèm `customMetadata: { uploadOperationId, avatarId, version, ownerUid }` khi upload lên Storage.
   * - Ngay sau khi Storage xác nhận upload thành công, chuyển bản ghi bền vững sang `UPLOAD_CONFIRMED_METADATA_PENDING`.
   * - Chỉ xóa bản ghi pending khỏi bộ nhớ bền vững sau khi đọc lại (`getDoc`) từ Firestore và xác nhận khớp.
   */
  public async adminUploadStagedCatalogAvatar(params: {
    avatarId: string;
    name: string;
    sortOrder: number;
    isActive: boolean;
  }): Promise<AvatarOperationResult> {
    const auth = AuthManager.getInstance();
    const currentUser = auth.getCurrentUser();
    if (!currentUser || !isSuperAdminUser(currentUser)) {
      return {
        success: false,
        errorCode: 'NOT_SUPER_ADMIN',
        message: `Chỉ Super Admin (${SUPER_ADMIN_EMAIL}) được phép upload danh mục avatar.`,
      };
    }

    if (this.isUploadingCatalog) {
      return {
        success: false,
        errorCode: 'UPLOAD_IN_PROGRESS',
        message: 'Đang có tiến trình upload ảnh khác, vui lòng chờ hoàn tất.',
      };
    }

    const staged = this.stagedCatalogFile;
    if (!staged) {
      return {
        success: false,
        errorCode: 'NO_STAGED_FILE',
        message: 'Vui lòng chọn một file ảnh hợp lệ trước khi tải lên.',
      };
    }

    const cleanId = (params.avatarId || '')
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);

    if (!AVATAR_LIMITS.AVATAR_ID_REGEX.test(cleanId)) {
      return {
        success: false,
        errorCode: 'INVALID_AVATAR_ID',
        message: 'Mã Avatar (avatarId) chỉ được chứa chữ cái, chữ số, dấu gạch dưới (_) hoặc gạch ngang (-).',
      };
    }

    const cleanName = (params.name || '').trim().slice(0, 80);
    if (!cleanName) {
      return {
        success: false,
        errorCode: 'INVALID_NAME',
        message: 'Vui lòng nhập tên hiển thị cho avatar trong danh mục.',
      };
    }

    const safeSortOrder = Math.max(0, Math.min(100_000, Math.floor(Number(params.sortOrder) || 0)));

    const db = getFirebaseDb();
    const storage = getFirebaseStorage();
    if (!db || !storage) {
      return {
        success: false,
        errorCode: 'FIREBASE_UNAVAILABLE',
        message: 'Chưa khởi tạo được kết nối Firebase Storage hoặc Cloud Firestore.',
      };
    }

    this.isUploadingCatalog = true;
    this.uploadProgressPercent = 1;
    this.notify();

    let uploadedStoragePath: string | null = null;
    let allocatedStoragePath: string | null = null;
    let inProgressRecord: PendingCatalogMetadataSync | null = null;

    try {
      // Kiểm tra tài liệu hiện có trong /avatar_catalog/{avatarId} để tăng version và tránh tái sử dụng path cũ
      const docRef = doc(db, 'avatar_catalog', cleanId);
      const existingSnap = await getDoc(docRef);
      const isUpdate = existingSnap.exists();
      const existingData = isUpdate ? existingSnap.data() : null;
      const previousStoragePath =
        existingData && typeof existingData.storagePath === 'string'
          ? existingData.storagePath
          : null;

      // M7.3.5.5 Mục III.B2 Quy tắc 7: Tổng hợp lịch sử version và đường dẫn từ cả 3 nguồn trước khi cấp version mới
      const extraCatalogRecords: Array<Record<string, unknown>> = [];
      if (existingData) {
        extraCatalogRecords.push({
          ...existingData,
          avatarId: cleanId,
        });
      }
      await this.syncVersionAndPathHistoryFromAllSources(extraCatalogRecords);

      const existingVer =
        existingData && typeof existingData.version === 'number'
          ? Math.floor(existingData.version)
          : 0;
      const highestKnownVer = this.highestKnownVersionByAvatarId.get(cleanId) ?? 0;

      const allocated = allocateUniqueCatalogStoragePath({
        avatarId: cleanId,
        existingVersion: existingVer,
        highestKnownVersion: highestKnownVer,
        rawFileName: staged.fileName,
        contentType: staged.contentType,
        usedStoragePaths: this.usedOrIndeterminateStoragePaths,
        useUuidFileName: true,
      });
      const nextVersion = allocated.version;
      const storagePath = allocated.storagePath;
      const allocatedFileName = allocated.fileName;
      const uploadOperationId = generateCatalogFileUuid();
      const nowMs = Date.now();
      allocatedStoragePath = storagePath;

      // Quy tắc 1 (M7.3.5.5 Mục III.B2): Lưu và xác nhận bản ghi pending (UPLOAD_IN_PROGRESS)
      // vào bộ nhớ bền vững TRƯỚC KHI bắt đầu uploadBytesResumable. Nếu không thể ghi -> dừng ngay trước khi upload.
      inProgressRecord = {
        ownerUid: currentUser.uid,
        avatarId: cleanId,
        name: cleanName,
        storagePath,
        fileName: allocatedFileName,
        contentType: staged.contentType,
        fileSize: staged.sizeBytes,
        version: nextVersion,
        sortOrder: safeSortOrder,
        isActive: Boolean(params.isActive),
        updatedBy: SUPER_ADMIN_EMAIL,
        isUpdate,
        uploadOperationId,
        createdAt: nowMs,
        status: 'UPLOAD_IN_PROGRESS',
        failedAtMs: nowMs,
        errorMessage: '',
      };

      try {
        await this.persistentPendingStore.savePendingRecord(inProgressRecord);
        const verifiedSaved = await this.persistentPendingStore.getPendingRecord(cleanId);
        if (
          !verifiedSaved ||
          verifiedSaved.uploadOperationId !== uploadOperationId ||
          verifiedSaved.storagePath !== storagePath ||
          verifiedSaved.status !== 'UPLOAD_IN_PROGRESS'
        ) {
          throw new Error('Không xác nhận được bản ghi UPLOAD_IN_PROGRESS sau khi lưu.');
        }
      } catch (persistErr: any) {
        return {
          success: false,
          errorCode: 'PENDING_STORE_WRITE_FAILED',
          message: `Không thể ghi bản ghi phục hồi pending vào bộ nhớ bền vững trước khi upload (${
            persistErr?.message || 'Lỗi lưu trữ cục bộ'
          }). Đã dừng ngay trước khi tải ảnh lên Storage.`,
        };
      }

      // Ghi nhận ngay đường dẫn và version này vào tập đã cấp phát để dù upload bị ngắt kết nối (indeterminate)
      // thì lần thử tiếp theo cũng không bao giờ tái sử dụng hay ghi đè lên đường dẫn này.
      this.usedOrIndeterminateStoragePaths.add(storagePath);
      this.highestKnownVersionByAvatarId.set(cleanId, Math.max(highestKnownVer, nextVersion));
      this.pendingMetadataSync = inProgressRecord;
      this.notify();

      const fileRef = storageRef(storage, storagePath);
      const blob = new Blob([staged.arrayBuffer], { type: staged.contentType });

      const uploadTask = uploadBytesResumable(fileRef, blob, {
        contentType: staged.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        customMetadata: {
          uploadOperationId,
          avatarId: cleanId,
          version: String(nextVersion),
          ownerUid: currentUser.uid,
        },
      });
      this.currentUploadTask = uploadTask;

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              this.uploadProgressPercent = Math.max(
                1,
                Math.min(95, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 95))
              );
              this.notify();
            }
          },
          (error) => reject(error),
          () => resolve()
        );
      });

      uploadedStoragePath = storagePath;
      this.uploadProgressPercent = 96;

      // Quy tắc 2: Ngay sau khi Storage xác nhận upload thành công, chuyển bản ghi bền vững sang UPLOAD_CONFIRMED_METADATA_PENDING
      const confirmedPendingRecord: PendingCatalogMetadataSync = {
        ...inProgressRecord,
        status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
        failedAtMs: Date.now(),
        errorMessage: '',
      };
      await this.persistentPendingStore.savePendingRecord(confirmedPendingRecord);
      this.pendingMetadataSync = confirmedPendingRecord;
      this.notify();

      // Ghi metadata vào Firestore /avatar_catalog/{avatarId}
      const firestorePayload: Record<string, unknown> = {
        avatarId: cleanId,
        name: cleanName,
        storagePath,
        contentType: staged.contentType,
        fileSize: staged.sizeBytes,
        version: nextVersion,
        sortOrder: safeSortOrder,
        isActive: Boolean(params.isActive),
        createdAt:
          isUpdate && existingData?.createdAt ? existingData.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: SUPER_ADMIN_EMAIL,
      };

      try {
        await setDoc(docRef, firestorePayload);
      } catch (firestoreErr: any) {
        const errMsg = firestoreErr?.message || String(firestoreErr);
        // Nếu lỗi phân quyền Firestore -> xóa ngay file vừa tải lên Storage để không để lại file mồ côi
        if (firestoreErr?.code === 'permission-denied') {
          try {
            await deleteObject(fileRef);
          } catch {
            // Ignore cleanup failure
          }
          await this.persistentPendingStore.deletePendingRecord(cleanId);
          this.pendingMetadataSync = null;
          this.notify();
          return {
            success: false,
            errorCode: 'FIRESTORE_PERMISSION_DENIED',
            message:
              'Firestore Security Rules từ chối ghi metadata /avatar_catalog. Đã thu hồi file vừa tải lên Storage.',
          };
        }

        // Nếu lỗi mạng tạm thời sau khi Storage đã tải xong -> lưu bền vững trạng thái UPLOAD_CONFIRMED_METADATA_PENDING
        // (retry sẽ chỉ gọi setDoc trên Firestore, tuyệt đối không upload lại file vào path cũ)
        const failedSyncRecord: PendingCatalogMetadataSync = {
          ...confirmedPendingRecord,
          status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
          failedAtMs: Date.now(),
          errorMessage: errMsg,
        };
        await this.persistentPendingStore.savePendingRecord(failedSyncRecord);
        this.pendingMetadataSync = failedSyncRecord;
        this.notify();
        return {
          success: false,
          avatarId: cleanId,
          version: nextVersion,
          storagePath,
          uploadOperationId,
          pendingStatus: 'UPLOAD_CONFIRMED_METADATA_PENDING',
          metadataSynced: false,
          requiresMetadataRetry: true,
          errorCode: 'FIRESTORE_SYNC_FAILED_AFTER_UPLOAD',
          message:
            'Đã tải ảnh lên Firebase Storage thành công nhưng chưa ghi được metadata vào Firestore. Vui lòng bấm "Đồng bộ lại Metadata" (không cần upload lại ảnh, trạng thái được bảo toàn kể cả khi bấm F5).',
        };
      }

      // Quy tắc 4: Chỉ xóa bản ghi pending khỏi bộ nhớ bền vững sau khi đọc lại từ Firestore và xác nhận khớp
      const verifySnap = await getDoc(docRef);
      const verifyData = verifySnap.exists() ? verifySnap.data() : null;
      if (
        verifyData &&
        verifyData.avatarId === cleanId &&
        verifyData.storagePath === storagePath &&
        verifyData.version === nextVersion
      ) {
        await this.persistentPendingStore.deletePendingRecord(cleanId);
        this.pendingMetadataSync = null;
      }

      // Nếu là cập nhật version mới -> dọn file version cũ trên Storage (không làm hỏng kết quả nếu xóa file cũ lỗi)
      if (previousStoragePath && previousStoragePath !== storagePath) {
        try {
          await deleteObject(storageRef(storage, previousStoragePath));
          this.urlCache.revokePath(previousStoragePath);
          this.resolvedStorageUrls.delete(previousStoragePath);
        } catch {
          // Ignore old file cleanup error
        }
      }

      this.clearStagedCatalogFile();
      void this.resolveStoragePathToUrl(storagePath);
      this.uploadProgressPercent = 100;
      this.notify();

      return {
        success: true,
        avatarId: cleanId,
        version: nextVersion,
        storagePath,
        uploadOperationId,
        metadataSynced: true,
        message: isUpdate
          ? `Đã cập nhật ảnh mới cho "${cleanName}" (v${nextVersion}) thành công.`
          : `Đã thêm avatar "${cleanName}" (v1) vào danh mục chung thành công.`,
      };
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'storage/canceled') {
        if (inProgressRecord && !uploadedStoragePath) {
          const indeterminateOnCancel: PendingCatalogMetadataSync = {
            ...inProgressRecord,
            status: 'UPLOAD_INDETERMINATE',
            failedAtMs: Date.now(),
            errorMessage: 'Tiến trình upload đã bị hủy giữa chừng (UPLOAD_INDETERMINATE).',
          };
          try {
            await this.persistentPendingStore.savePendingRecord(indeterminateOnCancel);
            this.pendingMetadataSync = indeterminateOnCancel;
          } catch {
            // Ignore
          }
        }
        return {
          success: false,
          errorCode: 'UPLOAD_CANCELED',
          message: 'Đã hủy tiến trình tải ảnh lên Firebase Storage.',
        };
      }
      if (code === 'storage/unauthorized' || code === 'permission-denied') {
        if (inProgressRecord && !uploadedStoragePath) {
          try {
            await this.persistentPendingStore.deletePendingRecord(cleanId);
            this.pendingMetadataSync = null;
          } catch {
            // Ignore
          }
        }
        return {
          success: false,
          errorCode: 'STORAGE_PERMISSION_DENIED',
          message:
            'Firebase Storage từ chối quyền ghi (HTTP 403). Vui lòng kiểm tra tài khoản Super Admin hoặc quy tắc storage.rules trên Firebase Console.',
        };
      }

      // Khi upload gặp lỗi mạng giữa chừng mà chưa xác nhận hoàn tất -> chuyển sang UPLOAD_INDETERMINATE
      if (inProgressRecord && !uploadedStoragePath) {
        const indeterminateRecord: PendingCatalogMetadataSync = {
          ...inProgressRecord,
          status: 'UPLOAD_INDETERMINATE',
          failedAtMs: Date.now(),
          errorMessage: `Upload bị gián đoạn (${code || err?.message || 'Lỗi kết nối'}).`,
        };
        try {
          await this.persistentPendingStore.savePendingRecord(indeterminateRecord);
          this.pendingMetadataSync = indeterminateRecord;
        } catch {
          // Ignore
        }
      }
      return {
        success: false,
        avatarId: allocatedStoragePath ? cleanId : undefined,
        storagePath: allocatedStoragePath ?? undefined,
        pendingStatus: uploadedStoragePath
          ? 'UPLOAD_CONFIRMED_METADATA_PENDING'
          : 'UPLOAD_INDETERMINATE',
        errorCode: code || 'STORAGE_UPLOAD_ERROR',
        message: `Không thể tải ảnh lên Firebase Storage (${code || err?.message || 'Lỗi kết nối'}).`,
      };
    } finally {
      this.currentUploadTask = null;
      this.isUploadingCatalog = false;
      this.uploadProgressPercent = 0;
      this.notify();
    }
  }

  /**
   * Đồng bộ lại metadata Firestore cho file đã upload thành công lên Storage trước đó (M7.3.5.5 Mục III.B2):
   * - Kiểm tra `ownerUid === currentUser.uid`.
   * - Chỉ cho phép retry khi `pending.status === 'UPLOAD_CONFIRMED_METADATA_PENDING'`
   *   (không cho phép tạo metadata catalog cho object `UPLOAD_INDETERMINATE` chưa xác minh).
   * - Chỉ gọi `setDoc` trên Firestore với `storagePath` đã tạo, không gọi `uploadBytes` lại.
   * - Chỉ xóa bản ghi pending khỏi bộ nhớ bền vững sau khi đọc lại (`getDoc`) từ Firestore và xác nhận khớp.
   */
  public async retryPendingCatalogMetadataSync(): Promise<AvatarOperationResult> {
    const currentUser = AuthManager.getInstance().getCurrentUser();
    if (!currentUser || !AuthManager.getInstance().isSuperAdmin()) {
      return {
        success: false,
        errorCode: 'NOT_SUPER_ADMIN',
        message: 'Chỉ Super Admin được phép thực hiện thao tác này.',
      };
    }

    if (!this.pendingMetadataSync) {
      await this.recoverPendingUploadsOnStartup();
    }

    const pending = this.pendingMetadataSync;
    if (!pending) {
      return {
        success: false,
        errorCode: 'NO_PENDING_SYNC',
        message: 'Không có metadata chờ đồng bộ lại.',
      };
    }

    if (pending.ownerUid !== currentUser.uid) {
      return {
        success: false,
        errorCode: 'PENDING_OWNER_MISMATCH',
        message:
          'Tài khoản hiện tại không khớp với ownerUid của bản ghi pending. Không được phép thực hiện retry.',
      };
    }

    if (pending.status !== 'UPLOAD_CONFIRMED_METADATA_PENDING') {
      return {
        success: false,
        avatarId: pending.avatarId,
        version: pending.version,
        storagePath: pending.storagePath,
        pendingStatus: pending.status,
        errorCode: 'PENDING_UPLOAD_NOT_CONFIRMED',
        message:
          'Bản ghi upload trước đó bị ngắt giữa chừng (UPLOAD_INDETERMINATE) và không xác minh được object hoàn chỉnh trên Storage. Vui lòng chọn ảnh để tải lên mới (hệ thống sẽ tự động cấp version + 1).',
      };
    }

    const db = getFirebaseDb();
    if (!db) {
      return {
        success: false,
        errorCode: 'FIRESTORE_UNAVAILABLE',
        message: 'Chưa kết nối được dịch vụ Cloud Firestore.',
      };
    }

    try {
      const docRef = doc(db, 'avatar_catalog', pending.avatarId);
      const existingSnap = await getDoc(docRef);
      const existingData = existingSnap.exists() ? existingSnap.data() : null;

      await setDoc(docRef, {
        avatarId: pending.avatarId,
        name: pending.name,
        storagePath: pending.storagePath,
        contentType: pending.contentType,
        fileSize: pending.fileSize,
        version: pending.version,
        sortOrder: pending.sortOrder,
        isActive: pending.isActive,
        createdAt:
          existingData && existingData.createdAt ? existingData.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: SUPER_ADMIN_EMAIL,
      });

      // Quy tắc 4: Đọc lại từ Firestore và xác nhận khớp với bản ghi vừa ghi trước khi xóa bản ghi pending bền vững
      const verifySnap = await getDoc(docRef);
      const verifyData = verifySnap.exists() ? verifySnap.data() : null;
      if (
        !verifyData ||
        verifyData.avatarId !== pending.avatarId ||
        verifyData.storagePath !== pending.storagePath ||
        verifyData.version !== pending.version
      ) {
        return {
          success: false,
          errorCode: 'FIRESTORE_READBACK_MISMATCH',
          message:
            'Đã gửi lệnh ghi Firestore nhưng đọc lại chưa khớp dữ liệu. Bản ghi pending vẫn được giữ lại để thử lại an toàn.',
        };
      }

      await this.persistentPendingStore.deletePendingRecord(pending.avatarId);
      this.pendingMetadataSync = null;
      this.clearStagedCatalogFile();
      void this.resolveStoragePathToUrl(pending.storagePath);
      this.notify();

      return {
        success: true,
        avatarId: pending.avatarId,
        version: pending.version,
        storagePath: pending.storagePath,
        uploadOperationId: pending.uploadOperationId,
        metadataSynced: true,
        message: `Đã đồng bộ metadata cho "${pending.name}" (v${pending.version}) thành công.`,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: err?.code || 'FIRESTORE_SYNC_ERROR',
        message: 'Đồng bộ lại metadata thất bại. Vui lòng kiểm tra kết nối mạng và thử lại.',
      };
    }
  }

  /**
   * Xử lý hủy thông báo bản ghi pending (Lưu ý M7.3.5.5 Mục III.B2 Quy tắc 5:
   * Nếu ở trạng thái UPLOAD_INDETERMINATE thì giữ nguyên path/version trong lịch sử đã dùng,
   * tuyệt đối KHÔNG xóa object trên Storage, KHÔNG tái sử dụng path).
   */
  public async discardPendingCatalogUpload(): Promise<void> {
    const pending = this.pendingMetadataSync;
    this.pendingMetadataSync = null;
    if (pending) {
      this.usedOrIndeterminateStoragePaths.add(pending.storagePath);
      const prevVer = this.highestKnownVersionByAvatarId.get(pending.avatarId) ?? 0;
      if (pending.version > prevVer) {
        this.highestKnownVersionByAvatarId.set(pending.avatarId, pending.version);
      }
      await this.persistentPendingStore.recordUsedOrIndeterminatePath({
        storagePath: pending.storagePath,
        avatarId: pending.avatarId,
        version: pending.version,
        uploadOperationId: pending.uploadOperationId,
        recordedAt: pending.createdAt,
      });
      await this.persistentPendingStore.deletePendingRecord(pending.avatarId);
    }
    this.notify();
  }

  public cancelCurrentUpload(): void {
    if (this.currentUploadTask) {
      try {
        this.currentUploadTask.cancel();
      } catch {
        // Ignore
      }
      this.currentUploadTask = null;
    }
  }

  /**
   * Super Admin cập nhật trạng thái hoạt động (`isActive`), tên hiển thị (`name`) hoặc thứ tự (`sortOrder`)
   * của một avatar trong danh mục.
   */
  public async updateCatalogItemMetadata(params: {
    avatarId: string;
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<AvatarOperationResult> {
    if (!AuthManager.getInstance().isSuperAdmin()) {
      return {
        success: false,
        errorCode: 'NOT_SUPER_ADMIN',
        message: 'Chỉ Super Admin được phép chỉnh sửa danh mục avatar.',
      };
    }

    const db = getFirebaseDb();
    if (!db) {
      return {
        success: false,
        errorCode: 'FIRESTORE_UNAVAILABLE',
        message: 'Chưa kết nối được dịch vụ Cloud Firestore.',
      };
    }

    try {
      const docRef = doc(db, 'avatar_catalog', params.avatarId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return {
          success: false,
          errorCode: 'NOT_FOUND',
          message: 'Không tìm thấy avatar trong danh mục.',
        };
      }
      const data = snap.data();
      const nextName =
        typeof params.name === 'string' && params.name.trim().length > 0
          ? params.name.trim().slice(0, 80)
          : (data.name as string);
      const nextSortOrder =
        typeof params.sortOrder === 'number' && Number.isFinite(params.sortOrder)
          ? Math.max(0, Math.min(100_000, Math.floor(params.sortOrder)))
          : (data.sortOrder as number);
      const nextIsActive =
        typeof params.isActive === 'boolean' ? params.isActive : Boolean(data.isActive);

      await setDoc(docRef, {
        avatarId: data.avatarId,
        name: nextName,
        storagePath: data.storagePath,
        contentType: data.contentType,
        fileSize: data.fileSize,
        version: data.version,
        sortOrder: nextSortOrder,
        isActive: nextIsActive,
        createdAt: data.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: SUPER_ADMIN_EMAIL,
      });

      return {
        success: true,
        avatarId: params.avatarId,
        message: `Đã cập nhật cấu hình cho "${nextName}".`,
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: err?.code || 'FIRESTORE_UPDATE_ERROR',
        message: 'Không thể cập nhật metadata danh mục avatar.',
      };
    }
  }

  /**
   * Super Admin xóa hẳn một avatar khỏi danh mục (M7.3.5.1 Mục IV):
   * - Ưu tiên khuyến nghị ẩn (`isActive = false`).
   * - Kiểm tra trên `/users` bằng truy vấn có điều kiện theo `avatarId` kèm `limit(1)`
   *   (`where('avatarType', '==', 'catalog'), where('avatarId', '==', avatarId), limit(1)`)
   *   để tuyệt đối không đọc toàn bộ collection `/users`.
   * - Nếu không còn người chơi nào sử dụng:
   *   1. Chuyển `isActive = false` trên Firestore `/avatar_catalog/{avatarId}` trước để khóa lựa chọn mới.
   *   2. Kiểm tra lại `limit(1)` để phòng ngừa race condition.
   *   3. Xóa file trên Firebase Storage trước (`deleteObject` - bỏ qua nếu `storage/object-not-found`).
   *      Nếu xóa Storage thất bại vì lỗi khác -> dừng lại và giữ nguyên tài liệu Firestore ở trạng thái `isActive = false`
   *      để không bao giờ phát sinh trạng thái lệch giữa file Storage và metadata Firestore.
   *   4. Chỉ sau khi file trên Storage đã xóa thành công mới gọi `deleteDoc` trên Firestore `/avatar_catalog/{avatarId}`.
   */
  public async deleteCatalogItem(avatarId: string): Promise<AvatarOperationResult> {
    if (!AuthManager.getInstance().isSuperAdmin()) {
      return {
        success: false,
        errorCode: 'NOT_SUPER_ADMIN',
        message: 'Chỉ Super Admin được phép xóa avatar khỏi danh mục.',
      };
    }

    const db = getFirebaseDb();
    const storage = getFirebaseStorage();
    if (!db || !storage) {
      return {
        success: false,
        errorCode: 'FIREBASE_UNAVAILABLE',
        message: 'Chưa kết nối được dịch vụ Firebase.',
      };
    }

    try {
      const docRef = doc(db, 'avatar_catalog', avatarId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) {
        return {
          success: false,
          errorCode: 'NOT_FOUND',
          message: 'Avatar không tồn tại trong danh mục.',
        };
      }
      const data = snap.data();
      const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';

      // Kiểm tra xem có người chơi nào đang chọn avatar này hay không với limit(1) (tối đa 1 document read)
      const usersQuery = query(
        collection(db, 'users'),
        where('avatarType', '==', 'catalog'),
        where('avatarId', '==', avatarId),
        limit(1)
      );
      const activeUsersSnap = await getDocs(usersQuery);
      if (!activeUsersSnap.empty) {
        return {
          success: false,
          errorCode: 'AVATAR_IN_USE',
          message:
            'Không thể xóa hẳn vì đang có người chơi sử dụng avatar này. Hãy chuyển trạng thái sang "Ẩn" (isActive = false) để người chơi tự động chuyển về ảnh Google.',
        };
      }

      // Bước 1: Nếu avatar đang active, chuyển về isActive = false trước để ngăn người chơi chọn mới trong lúc đang xóa
      if (data.isActive !== false) {
        await setDoc(docRef, {
          avatarId: data.avatarId,
          name: data.name,
          storagePath: data.storagePath,
          contentType: data.contentType,
          fileSize: data.fileSize,
          version: data.version,
          sortOrder: data.sortOrder,
          isActive: false,
          createdAt: data.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: SUPER_ADMIN_EMAIL,
        });

        // Kiểm tra lại với limit(1) sau khi đã khóa isActive = false
        const recheckSnap = await getDocs(usersQuery);
        if (!recheckSnap.empty) {
          return {
            success: false,
            errorCode: 'AVATAR_IN_USE',
            message:
              'Vừa có người chơi chọn avatar này. Hệ thống đã chuyển avatar sang trạng thái "Ẩn" (isActive = false) thay vì xóa hẳn.',
          };
        }
      }

      // Bước 2: Xóa file trên Firebase Storage trước khi xóa metadata Firestore
      if (storagePath) {
        try {
          await deleteObject(storageRef(storage, storagePath));
          this.urlCache.revokePath(storagePath);
          this.resolvedStorageUrls.delete(storagePath);
          this.failedStoragePaths.delete(storagePath);
        } catch (storageErr: any) {
          const storageCode = storageErr?.code || '';
          if (storageCode !== 'storage/object-not-found') {
            return {
              success: false,
              errorCode: storageCode || 'STORAGE_DELETE_ERROR',
              message:
                'Không thể xóa file ảnh trên Firebase Storage. Avatar đã được chuyển sang trạng thái "Ẩn" (isActive = false) và giữ lại metadata để tránh lệch trạng thái.',
            };
          }
        }
      }

      // Bước 3: Xóa tài liệu metadata trên Firestore sau khi file Storage đã được dọn sạch
      await deleteDoc(docRef);

      return {
        success: true,
        avatarId,
        message: 'Đã xóa hoàn toàn avatar khỏi Firebase Storage và Firestore.',
      };
    } catch (err: any) {
      return {
        success: false,
        errorCode: err?.code || 'DELETE_CATALOG_ERROR',
        message: 'Không thể xóa avatar khỏi danh mục. Vui lòng thử lại.',
      };
    }
  }
}
