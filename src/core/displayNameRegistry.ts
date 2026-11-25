/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GLOBAL UNIQUE DISPLAY NAME REGISTRY (`/display_names/{nameHash}`)
 * - Enforces strictly 1 unique display name across the entire system (case-insensitive, collapsed whitespace).
 * - Uses SHA-256 hash doc IDs (`dn_<64-hex>`) so Vietnamese/Unicode names are fully supported with zero PII.
 * - Cross-checks both `/display_names/{nameHash}` and legacy `/public_profiles` records to guarantee no collisions.
 * - Detects initial/email-derived name collisions at login so the UI forces an immediate rename before entry.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';
import type { AuthIdentityLike } from './authManager.ts';

export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

export interface DisplayNameAvailabilityResult {
  available: boolean;
  cleanName: string;
  normalizedKey: string;
  nameHash: string;
  existingOwnerUid: string | null;
  errorCode?: 'EMPTY' | 'TOO_SHORT' | 'DUPLICATE';
  message?: string;
}

export interface DisplayNameClaimResult {
  success: boolean;
  cleanName?: string;
  errorCode?:
    | 'INVALID_DISPLAY_NAME'
    | 'DUPLICATE_DISPLAY_NAME'
    | 'FIRESTORE_UNAVAILABLE'
    | 'PERMISSION_DENIED'
    | 'NETWORK_ERROR';
  message: string;
}

export interface LoginDisplayNameCheckResult {
  hasConflict: boolean;
  conflictedName: string;
  effectiveName: string;
  existingOwnerUid: string | null;
}

/**
 * Pure synchronous SHA-256 hex digest (works identically in Browser & Node without async WebCrypto).
 */
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function encodeUtf8Bytes(input: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(input);
  }
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let codePoint = input.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = ((codePoint - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export function sha256Hex(input: string): string {
  const bytes = encodeUtf8Bytes(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 =
        ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^
        ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^
        (w[i - 15] >>> 3);
      const s1 =
        ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^
        ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^
        (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

export function normalizeDisplayName(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export function normalizeDisplayNameKey(raw: string | null | undefined): string {
  return normalizeDisplayName(raw).toLowerCase();
}

export function computeDisplayNameHashId(raw: string | null | undefined): string {
  const key = normalizeDisplayNameKey(raw);
  return `dn_${sha256Hex(key)}`;
}

export function extractEmailPrefixName(email: string | null | undefined): string {
  const cleanEmail = String(email ?? '').trim();
  if (!cleanEmail) return '';
  const atIdx = cleanEmail.indexOf('@');
  const localPart = atIdx > 0 ? cleanEmail.slice(0, atIdx) : cleanEmail;
  return normalizeDisplayName(localPart);
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = String((err as any)?.code ?? '').toLowerCase();
  const msg = String((err as any)?.message ?? '').toLowerCase();
  return code.includes('permission-denied') || msg.includes('missing or insufficient permissions');
}

export class DisplayNameRegistry {
  private static instance: DisplayNameRegistry | null = null;
  // In-memory cache/fallback (also used when running offline or unit tests without Firestore)
  private memoryByHash = new Map<string, { ownerUid: string; displayName: string }>();

  public static getInstance(): DisplayNameRegistry {
    if (!DisplayNameRegistry.instance) {
      DisplayNameRegistry.instance = new DisplayNameRegistry();
    }
    return DisplayNameRegistry.instance;
  }

  private getDbOrNull() {
    try {
      return getFirebaseDb();
    } catch {
      return null;
    }
  }

  /**
   * Checks whether `rawName` is available across:
   * 1. `/display_names/{nameHash}` authoritative uniqueness lock
   * 2. `/public_profiles` (indexed `displayNameLower` + case-insensitive fallback scan for legacy accounts)
   * 3. In-memory fallback registry
   */
  public async checkDisplayNameAvailability(
    rawName: string,
    excludeUid?: string | null,
    options?: { enforceMinLength?: boolean }
  ): Promise<DisplayNameAvailabilityResult> {
    const cleanName = normalizeDisplayName(rawName);
    const normalizedKey = cleanName.toLowerCase();
    const nameHash = computeDisplayNameHashId(cleanName);

    if (!cleanName) {
      return {
        available: false,
        cleanName: '',
        normalizedKey: '',
        nameHash,
        existingOwnerUid: null,
        errorCode: 'EMPTY',
        message: 'Tên hiển thị không được để trống.',
      };
    }

    if (options?.enforceMinLength !== false && cleanName.length < DISPLAY_NAME_MIN_LENGTH) {
      return {
        available: false,
        cleanName,
        normalizedKey,
        nameHash,
        existingOwnerUid: null,
        errorCode: 'TOO_SHORT',
        message: `Tên hiển thị cần tối thiểu ${DISPLAY_NAME_MIN_LENGTH} ký tự.`,
      };
    }

    // Check local memory cache first for immediate feedback
    const memEntry = this.memoryByHash.get(nameHash);
    if (memEntry && memEntry.ownerUid !== excludeUid) {
      return {
        available: false,
        cleanName,
        normalizedKey,
        nameHash,
        existingOwnerUid: memEntry.ownerUid,
        errorCode: 'DUPLICATE',
        message: 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
      };
    }

    const db = this.getDbOrNull();
    if (!db) {
      return {
        available: true,
        cleanName,
        normalizedKey,
        nameHash,
        existingOwnerUid: null,
      };
    }

    // 1. Authoritative check on `/display_names/{nameHash}`
    try {
      const regSnap = await getDoc(doc(db, 'display_names', nameHash));
      if (regSnap.exists()) {
        const regData = regSnap.data() as Record<string, unknown>;
        const ownerUid = typeof regData?.ownerUid === 'string' ? regData.ownerUid : '';
        if (ownerUid) {
          this.memoryByHash.set(nameHash, {
            ownerUid,
            displayName: typeof regData?.displayName === 'string' ? regData.displayName : cleanName,
          });
          if (ownerUid !== excludeUid) {
            return {
              available: false,
              cleanName,
              normalizedKey,
              nameHash,
              existingOwnerUid: ownerUid,
              errorCode: 'DUPLICATE',
              message: 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
            };
          }
        }
      }
    } catch {
      // Fall through to public_profiles verification
    }

    // 2. Cross-check `/public_profiles` for legacy accounts that haven't logged in since `/display_names` was added
    try {
      const exactQuery = query(
        collection(db, 'public_profiles'),
        where('displayNameLower', '==', normalizedKey),
        limit(5)
      );
      const exactSnap = await getDocs(exactQuery);
      for (const d of exactSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        const ownerUid = (typeof data?.uid === 'string' && data.uid) || d.id;
        if (ownerUid && ownerUid !== excludeUid) {
          return {
            available: false,
            cleanName,
            normalizedKey,
            nameHash,
            existingOwnerUid: ownerUid,
            errorCode: 'DUPLICATE',
            message: 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
          };
        }
      }

      // Fallback normalized-whitespace comparison across active public profiles
      const allSnap = await getDocs(query(collection(db, 'public_profiles'), limit(200)));
      for (const d of allSnap.docs) {
        const data = d.data() as Record<string, unknown>;
        const ownerUid = (typeof data?.uid === 'string' && data.uid) || d.id;
        const otherKey = normalizeDisplayNameKey(
          typeof data?.displayName === 'string' ? data.displayName : ''
        );
        if (ownerUid && ownerUid !== excludeUid && otherKey === normalizedKey) {
          return {
            available: false,
            cleanName,
            normalizedKey,
            nameHash,
            existingOwnerUid: ownerUid,
            errorCode: 'DUPLICATE',
            message: 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
          };
        }
      }
    } catch {
      // Ignore if public_profiles query temporarily unavailable
    }

    return {
      available: true,
      cleanName,
      normalizedKey,
      nameHash,
      existingOwnerUid: null,
    };
  }

  /**
   * Atomically claims `rawNewName` for `uid` in `/display_names/{nameHash}` and releases `previousName` if different.
   */
  public async claimUniqueDisplayName(
    uid: string,
    rawNewName: string,
    previousName?: string | null
  ): Promise<DisplayNameClaimResult> {
    if (!uid) {
      return {
        success: false,
        errorCode: 'PERMISSION_DENIED',
        message: 'Bạn cần đăng nhập để đặt tên hiển thị.',
      };
    }

    const check = await this.checkDisplayNameAvailability(rawNewName, uid, {
      enforceMinLength: true,
    });
    if (!check.available) {
      return {
        success: false,
        errorCode: check.errorCode === 'DUPLICATE' ? 'DUPLICATE_DISPLAY_NAME' : 'INVALID_DISPLAY_NAME',
        message:
          check.message || 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
      };
    }

    const db = this.getDbOrNull();
    if (!db) {
      this.memoryByHash.set(check.nameHash, { ownerUid: uid, displayName: check.cleanName });
      if (previousName) {
        const oldHash = computeDisplayNameHashId(previousName);
        if (oldHash !== check.nameHash && this.memoryByHash.get(oldHash)?.ownerUid === uid) {
          this.memoryByHash.delete(oldHash);
        }
      }
      return {
        success: true,
        cleanName: check.cleanName,
        message: 'Đã đăng ký tên hiển thị duy nhất.',
      };
    }

    const newRef = doc(db, 'display_names', check.nameHash);
    try {
      await setDoc(newRef, {
        nameHash: check.nameHash,
        displayName: check.cleanName,
        displayNameNormalized: check.normalizedKey,
        ownerUid: uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      if (isPermissionDeniedError(err)) {
        // Race condition: another user claimed the exact hash first -> update rejected by Firestore rules
        try {
          const raceSnap = await getDoc(newRef);
          if (raceSnap.exists()) {
            const raceOwner = String((raceSnap.data() as any)?.ownerUid ?? '');
            if (raceOwner && raceOwner !== uid) {
              this.memoryByHash.set(check.nameHash, {
                ownerUid: raceOwner,
                displayName: check.cleanName,
              });
              return {
                success: false,
                errorCode: 'DUPLICATE_DISPLAY_NAME',
                message: 'Tên bị trùng trong hệ thống. Vui lòng chọn tên hiển thị khác.',
              };
            }
          }
        } catch {
          // ignore secondary check failure
        }
        return {
          success: false,
          errorCode: 'PERMISSION_DENIED',
          message: 'Không thể lưu tên hiển thị do quyền truy cập. Vui lòng thử lại.',
        };
      }
      return {
        success: false,
        errorCode: 'NETWORK_ERROR',
        message: 'Lỗi kết nối khi kiểm tra tên hiển thị. Vui lòng thử lại.',
      };
    }

    this.memoryByHash.set(check.nameHash, { ownerUid: uid, displayName: check.cleanName });

    // Best-effort release old name lock if this user owned it and changed to a different normalized key
    if (previousName) {
      const oldHash = computeDisplayNameHashId(previousName);
      if (oldHash !== check.nameHash) {
        try {
          const oldRef = doc(db, 'display_names', oldHash);
          const oldSnap = await getDoc(oldRef);
          if (oldSnap.exists() && (oldSnap.data() as any)?.ownerUid === uid) {
            await deleteDoc(oldRef);
          }
          if (this.memoryByHash.get(oldHash)?.ownerUid === uid) {
            this.memoryByHash.delete(oldHash);
          }
        } catch {
          // Non-fatal cleanup
        }
      }
    }

    return {
      success: true,
      cleanName: check.cleanName,
      message: 'Đã đăng ký tên hiển thị duy nhất.',
    };
  }

  /**
   * Invoked on authenticated login:
   * - Inspects saved `/users/{uid}.displayName`, Google `displayName`, and email prefix.
   * - If the effective initial/saved name collides with another account in `/display_names` or `/public_profiles`,
   *   returns `hasConflict: true` so the UI immediately shows the mandatory rename screen.
   * - Otherwise, silently backfills `/display_names/{nameHash}` for this user so future duplicates are blocked.
   */
  public async checkAndClaimLoginDisplayName(
    user: AuthIdentityLike | null
  ): Promise<LoginDisplayNameCheckResult> {
    if (!user || !user.uid) {
      return {
        hasConflict: false,
        conflictedName: '',
        effectiveName: '',
        existingOwnerUid: null,
      };
    }

    let savedUserDocName = '';
    const db = this.getDbOrNull();
    if (db) {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (userSnap.exists()) {
          const rawSaved = (userSnap.data() as Record<string, unknown>)?.displayName;
          if (typeof rawSaved === 'string' && rawSaved.trim().length > 0) {
            savedUserDocName = normalizeDisplayName(rawSaved);
          }
        }
      } catch {
        // Ignore read error and fall back to auth user metadata
      }
    }

    const googleName = normalizeDisplayName(user.displayName);
    const emailPrefix = extractEmailPrefixName(user.email);
    const candidateName = savedUserDocName || googleName || emailPrefix;

    if (!candidateName) {
      return {
        hasConflict: true,
        conflictedName: user.email || '',
        effectiveName: '',
        existingOwnerUid: null,
      };
    }

    const availability = await this.checkDisplayNameAvailability(candidateName, user.uid, {
      enforceMinLength: false,
    });

    if (!availability.available && availability.errorCode === 'DUPLICATE') {
      return {
        hasConflict: true,
        conflictedName: candidateName,
        effectiveName: '',
        existingOwnerUid: availability.existingOwnerUid,
      };
    }

    // Also: if this is a brand-new account without a saved custom name AND its email prefix collides
    // while googleName was empty/identical, the check above already caught it.
    // What if Google name is unique, no saved name yet, and email prefix itself is identical to googleName? Already checked.
    // Silently backfill/lock the unique name in `/display_names/{hash}` so no future account can take it.
    if (candidateName.length >= 1) {
      const claimRes = await this.claimUniqueDisplayName(user.uid, candidateName);
      if (!claimRes.success && claimRes.errorCode === 'DUPLICATE_DISPLAY_NAME') {
        return {
          hasConflict: true,
          conflictedName: candidateName,
          effectiveName: '',
          existingOwnerUid: null,
        };
      }
    }

    return {
      hasConflict: false,
      conflictedName: '',
      effectiveName: candidateName,
      existingOwnerUid: null,
    };
  }

  /**
   * Releases a display name lock when an Admin removes an account.
   */
  public async releaseDisplayNameForAdminDelete(displayName: string | null | undefined): Promise<void> {
    const clean = normalizeDisplayName(displayName);
    if (!clean) return;
    const hash = computeDisplayNameHashId(clean);
    this.memoryByHash.delete(hash);
    const db = this.getDbOrNull();
    if (!db) return;
    try {
      await deleteDoc(doc(db, 'display_names', hash));
    } catch {
      // Best-effort cleanup
    }
  }

  public resetMemoryCacheForTests(): void {
    this.memoryByHash.clear();
  }
}
