/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ENEMY_CONFIG } from './constants.ts';
import { TOTAL_CAMPAIGN_STAGES } from './campaignStages.ts';

export type ProgressionGameMode = 'SOLO' | 'TWO_PLAYERS_AI' | 'TWO_PLAYERS_ONLINE';

export interface UserStageProgressRecord {
  uid: string;
  unlockedStage: number; // 1..10
  completedStages: number[]; // sorted unique 1..10
  updatedAtMs: number;
  signature: string;
}

export interface StageMatchSessionToken {
  tokenId: string;
  uid: string;
  stageId: number;
  gameMode: ProgressionGameMode;
  issuedAtMs: number;
  signature: string;
}

export interface StageClearProof {
  uid: string;
  stageId: number;
  gameMode: ProgressionGameMode;
  totalDefeatedEnemies: number;
  isBaseDestroyed: boolean;
  isStageClear: boolean;
  tokenId: string;
  issuedAtMs: number;
  clearedAtMs: number;
  tokenSignature: string;
  proofSignature: string;
}

export interface StageAccessCheckResult {
  allowed: boolean;
  errorCode?: 'TRIAL_MODE_RESTRICTED' | 'AUTH_REQUIRED' | 'INVALID_STAGE_ID' | 'STAGE_LOCKED';
  errorMessage?: string;
  unlockedStage: number;
}

const STORAGE_KEY_PREFIX = 'bantank_stage_progression_v1_';
const SIGNING_DOMAIN = 'BANTANK_M7_4_1_STAGE_PROGRESSION_SALT_9F3A7C';

function computeCanonicalDigest(payload: string): string {
  // Dual-pass 32-bit FNV-1a + Murmur-style mix -> 16-hex tamper-evident digest
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  const full = `${SIGNING_DOMAIN}|${payload}`;
  for (let i = 0; i < full.length; i++) {
    const ch = full.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (ch + ((i & 0xff) << 3));
    h2 = Math.imul(h2, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${part1}${part2}`;
}

function normalizeCompletedStages(stages: unknown): number[] {
  if (!Array.isArray(stages)) return [];
  const set = new Set<number>();
  for (const s of stages) {
    if (typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= TOTAL_CAMPAIGN_STAGES) {
      set.add(s);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

function signProgressRecord(uid: string, unlockedStage: number, completedStages: number[], updatedAtMs: number): string {
  return computeCanonicalDigest(`PROGRESS|${uid}|${unlockedStage}|${completedStages.join(',')}|${updatedAtMs}`);
}

function signSessionToken(tokenId: string, uid: string, stageId: number, gameMode: ProgressionGameMode, issuedAtMs: number): string {
  return computeCanonicalDigest(`TOKEN|${tokenId}|${uid}|${stageId}|${gameMode}|${issuedAtMs}`);
}

function signClearProof(params: {
  uid: string;
  stageId: number;
  gameMode: ProgressionGameMode;
  totalDefeatedEnemies: number;
  isBaseDestroyed: boolean;
  isStageClear: boolean;
  tokenId: string;
  issuedAtMs: number;
  clearedAtMs: number;
  tokenSignature: string;
}): string {
  return computeCanonicalDigest(
    `CLEAR|${params.uid}|${params.stageId}|${params.gameMode}|${params.totalDefeatedEnemies}|${params.isBaseDestroyed ? 1 : 0}|${params.isStageClear ? 1 : 0}|${params.tokenId}|${params.issuedAtMs}|${params.clearedAtMs}|${params.tokenSignature}`
  );
}

function createDefaultProgressRecord(uid: string): UserStageProgressRecord {
  const updatedAtMs = Date.now();
  const completedStages: number[] = [];
  const unlockedStage = 1;
  return {
    uid,
    unlockedStage,
    completedStages,
    updatedAtMs,
    signature: signProgressRecord(uid, unlockedStage, completedStages, updatedAtMs),
  };
}

export class StageProgressionManager {
  private static instance: StageProgressionManager | null = null;
  private cache: Map<string, UserStageProgressRecord> = new Map();
  private fallbackStorage: Map<string, string> = new Map();
  private issuedTokenIds: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  public static getInstance(): StageProgressionManager {
    if (!StageProgressionManager.instance) {
      StageProgressionManager.instance = new StageProgressionManager();
    }
    return StageProgressionManager.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn('[StageProgressionManager] listener error:', err);
      }
    });
  }

  private getStorageKey(uid: string): string {
    return `${STORAGE_KEY_PREFIX}${uid}`;
  }

  private readRawStorage(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}
    return this.fallbackStorage.get(key) ?? null;
  }

  private writeRawStorage(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (err) {
      console.warn('[StageProgressionManager] writeRawStorage warning:', err);
    }
    this.fallbackStorage.set(key, value);
  }

  private removeRawStorage(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
    this.fallbackStorage.delete(key);
  }

  private listPrefixedStorageKeys(): string[] {
    const keys: string[] = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
            keys.push(k);
          }
        }
        return keys;
      }
    } catch {}
    for (const k of this.fallbackStorage.keys()) {
      if (k.startsWith(STORAGE_KEY_PREFIX)) {
        keys.push(k);
      }
    }
    return keys;
  }

  private loadRecordFromStorage(uid: string): UserStageProgressRecord {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) {
      return createDefaultProgressRecord('');
    }
    try {
      const raw = this.readRawStorage(this.getStorageKey(cleanUid));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserStageProgressRecord>;
        if (
          parsed &&
          parsed.uid === cleanUid &&
          typeof parsed.unlockedStage === 'number' &&
          Number.isInteger(parsed.unlockedStage) &&
          parsed.unlockedStage >= 1 &&
          parsed.unlockedStage <= TOTAL_CAMPAIGN_STAGES &&
          typeof parsed.updatedAtMs === 'number' &&
          Number.isFinite(parsed.updatedAtMs) &&
          typeof parsed.signature === 'string'
        ) {
          const completed = normalizeCompletedStages(parsed.completedStages);
          // Enforce consistency: cannot unlock stage > maxCompleted + 1
          const maxCompleted = completed.length > 0 ? completed[completed.length - 1] : 0;
          const expectedMaxUnlocked = Math.min(TOTAL_CAMPAIGN_STAGES, maxCompleted + 1);
          const expectedSig = signProgressRecord(
            cleanUid,
            parsed.unlockedStage,
            completed,
            parsed.updatedAtMs
          );
          if (
            parsed.signature === expectedSig &&
            parsed.unlockedStage <= expectedMaxUnlocked &&
            Array.isArray(parsed.completedStages) &&
            parsed.completedStages.length === completed.length
          ) {
            const validRec: UserStageProgressRecord = {
              uid: cleanUid,
              unlockedStage: parsed.unlockedStage,
              completedStages: completed,
              updatedAtMs: parsed.updatedAtMs,
              signature: parsed.signature,
            };
            this.cache.set(cleanUid, validRec);
            return validRec;
          }
        }
        // Fail closed on tampered or corrupt progression data
        const resetRec = createDefaultProgressRecord(cleanUid);
        this.saveRecord(resetRec);
        return resetRec;
      }
    } catch {
      const resetRec = createDefaultProgressRecord(cleanUid);
      this.saveRecord(resetRec);
      return resetRec;
    }

    const cached = this.cache.get(cleanUid);
    if (cached) {
      const expectedSig = signProgressRecord(
        cached.uid,
        cached.unlockedStage,
        cached.completedStages,
        cached.updatedAtMs
      );
      if (cached.signature === expectedSig) {
        return {
          ...cached,
          completedStages: [...cached.completedStages],
        };
      }
    }

    const fresh = createDefaultProgressRecord(cleanUid);
    this.saveRecord(fresh);
    return fresh;
  }

  private saveRecord(rec: UserStageProgressRecord): void {
    if (!rec.uid) return;
    const copy: UserStageProgressRecord = {
      uid: rec.uid,
      unlockedStage: rec.unlockedStage,
      completedStages: [...rec.completedStages],
      updatedAtMs: rec.updatedAtMs,
      signature: rec.signature,
    };
    this.cache.set(rec.uid, copy);
    this.writeRawStorage(this.getStorageKey(rec.uid), JSON.stringify(copy));
  }

  public getUserStageProgressSnapshot(uid: string | null | undefined): UserStageProgressRecord {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) {
      return createDefaultProgressRecord('');
    }
    const rec = this.loadRecordFromStorage(cleanUid);
    return {
      ...rec,
      completedStages: [...rec.completedStages],
    };
  }

  public getUnlockedStageForUser(uid: string | null | undefined, isTrialMode = false): number {
    if (isTrialMode) return 1;
    const cleanUid = (uid || '').trim();
    if (!cleanUid) return 1;
    return this.getUserStageProgressSnapshot(cleanUid).unlockedStage;
  }

  public canUserAccessStage(
    uid: string | null | undefined,
    stageId: number,
    isTrialMode = false
  ): StageAccessCheckResult {
    if (!Number.isInteger(stageId) || stageId < 1 || stageId > TOTAL_CAMPAIGN_STAGES) {
      return {
        allowed: false,
        errorCode: 'INVALID_STAGE_ID',
        errorMessage: `Stage ${stageId} không tồn tại trong chiến dịch 1-${TOTAL_CAMPAIGN_STAGES}.`,
        unlockedStage: this.getUnlockedStageForUser(uid, isTrialMode),
      };
    }

    if (isTrialMode) {
      if (stageId !== 1) {
        return {
          allowed: false,
          errorCode: 'TRIAL_MODE_RESTRICTED',
          errorMessage: 'Chế độ Chơi thử chỉ được phép chơi Stage 1. Vui lòng đăng nhập Google để mở khóa Stage 2–10.',
          unlockedStage: 1,
        };
      }
      return { allowed: true, unlockedStage: 1 };
    }

    const cleanUid = (uid || '').trim();
    if (!cleanUid) {
      if (stageId !== 1) {
        return {
          allowed: false,
          errorCode: 'AUTH_REQUIRED',
          errorMessage: 'Cần đăng nhập tài khoản hợp lệ để mở khóa và chơi từ Stage 2 trở đi.',
          unlockedStage: 1,
        };
      }
      return { allowed: true, unlockedStage: 1 };
    }

    const snap = this.getUserStageProgressSnapshot(cleanUid);
    if (stageId > snap.unlockedStage) {
      return {
        allowed: false,
        errorCode: 'STAGE_LOCKED',
        errorMessage: `Stage ${stageId} đang bị khóa. Bạn cần hoàn thành Stage ${stageId - 1} để mở khóa (Hiện đã mở tới Stage ${snap.unlockedStage}/10).`,
        unlockedStage: snap.unlockedStage,
      };
    }

    return {
      allowed: true,
      unlockedStage: snap.unlockedStage,
    };
  }

  public issueMatchSessionToken(
    uid: string,
    stageId: number,
    gameMode: ProgressionGameMode
  ): StageMatchSessionToken | null {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) return null;
    if (!Number.isInteger(stageId) || stageId < 1 || stageId > TOTAL_CAMPAIGN_STAGES) return null;

    const access = this.canUserAccessStage(cleanUid, stageId, false);
    if (!access.allowed) return null;

    const issuedAtMs = Date.now();
    const tokenId = `tok_${cleanUid.slice(0, 8)}_${stageId}_${issuedAtMs}_${Math.random().toString(36).slice(2, 8)}`;
    const signature = signSessionToken(tokenId, cleanUid, stageId, gameMode, issuedAtMs);
    this.issuedTokenIds.add(tokenId);
    return {
      tokenId,
      uid: cleanUid,
      stageId,
      gameMode,
      issuedAtMs,
      signature,
    };
  }

  public mintStageClearProof(params: {
    sessionToken: StageMatchSessionToken | null;
    totalDefeatedEnemies: number;
    isBaseDestroyed: boolean;
    isStageClear: boolean;
  }): StageClearProof | null {
    const tok = params.sessionToken;
    if (!tok) return null;
    const clearedAtMs = Date.now();
    return {
      uid: tok.uid,
      stageId: tok.stageId,
      gameMode: tok.gameMode,
      totalDefeatedEnemies: params.totalDefeatedEnemies,
      isBaseDestroyed: params.isBaseDestroyed,
      isStageClear: params.isStageClear,
      tokenId: tok.tokenId,
      issuedAtMs: tok.issuedAtMs,
      clearedAtMs,
      tokenSignature: tok.signature,
      proofSignature: signClearProof({
        uid: tok.uid,
        stageId: tok.stageId,
        gameMode: tok.gameMode,
        totalDefeatedEnemies: params.totalDefeatedEnemies,
        isBaseDestroyed: params.isBaseDestroyed,
        isStageClear: params.isStageClear,
        tokenId: tok.tokenId,
        issuedAtMs: tok.issuedAtMs,
        clearedAtMs,
        tokenSignature: tok.signature,
      }),
    };
  }

  public verifyAndRecordStageClear(
    uid: string,
    proof: StageClearProof | null | undefined
  ): {
    accepted: boolean;
    reason?: string;
    record: UserStageProgressRecord;
    newlyUnlockedStage: number | null;
  } {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) {
      return {
        accepted: false,
        reason: 'AUTH_REQUIRED',
        record: createDefaultProgressRecord(''),
        newlyUnlockedStage: null,
      };
    }

    const currentRec = this.getUserStageProgressSnapshot(cleanUid);
    if (!proof || typeof proof !== 'object') {
      return { accepted: false, reason: 'MISSING_PROOF', record: currentRec, newlyUnlockedStage: null };
    }

    if (proof.uid !== cleanUid) {
      return { accepted: false, reason: 'UID_MISMATCH', record: currentRec, newlyUnlockedStage: null };
    }

    if (
      !Number.isInteger(proof.stageId) ||
      proof.stageId < 1 ||
      proof.stageId > TOTAL_CAMPAIGN_STAGES
    ) {
      return { accepted: false, reason: 'INVALID_STAGE_ID', record: currentRec, newlyUnlockedStage: null };
    }

    if (proof.stageId > currentRec.unlockedStage) {
      return { accepted: false, reason: 'STAGE_WAS_LOCKED', record: currentRec, newlyUnlockedStage: null };
    }

    if (
      !proof.isStageClear ||
      proof.isBaseDestroyed ||
      proof.totalDefeatedEnemies < ENEMY_CONFIG.TOTAL_COUNT
    ) {
      return { accepted: false, reason: 'VICTORY_CONDITIONS_NOT_MET', record: currentRec, newlyUnlockedStage: null };
    }

    if (!this.issuedTokenIds.has(proof.tokenId)) {
      return { accepted: false, reason: 'UNKNOWN_OR_FORGED_TOKEN', record: currentRec, newlyUnlockedStage: null };
    }

    const expectedTokenSig = signSessionToken(
      proof.tokenId,
      proof.uid,
      proof.stageId,
      proof.gameMode,
      proof.issuedAtMs
    );
    if (proof.tokenSignature !== expectedTokenSig) {
      return { accepted: false, reason: 'INVALID_TOKEN_SIGNATURE', record: currentRec, newlyUnlockedStage: null };
    }

    const expectedProofSig = signClearProof({
      uid: proof.uid,
      stageId: proof.stageId,
      gameMode: proof.gameMode,
      totalDefeatedEnemies: proof.totalDefeatedEnemies,
      isBaseDestroyed: proof.isBaseDestroyed,
      isStageClear: proof.isStageClear,
      tokenId: proof.tokenId,
      issuedAtMs: proof.issuedAtMs,
      clearedAtMs: proof.clearedAtMs,
      tokenSignature: proof.tokenSignature,
    });
    if (proof.proofSignature !== expectedProofSig) {
      return { accepted: false, reason: 'INVALID_PROOF_SIGNATURE', record: currentRec, newlyUnlockedStage: null };
    }

    const completedSet = new Set<number>(currentRec.completedStages);
    completedSet.add(proof.stageId);
    const nextCompleted = Array.from(completedSet).sort((a, b) => a - b);
    const candidateUnlock = Math.min(TOTAL_CAMPAIGN_STAGES, proof.stageId + 1);
    const nextUnlocked = Math.max(currentRec.unlockedStage, candidateUnlock);
    const newlyUnlockedStage = nextUnlocked > currentRec.unlockedStage ? nextUnlocked : null;

    const updatedAtMs = Date.now();
    const updatedRec: UserStageProgressRecord = {
      uid: cleanUid,
      unlockedStage: nextUnlocked,
      completedStages: nextCompleted,
      updatedAtMs,
      signature: signProgressRecord(cleanUid, nextUnlocked, nextCompleted, updatedAtMs),
    };

    this.saveRecord(updatedRec);
    this.notifyListeners();
    return {
      accepted: true,
      record: updatedRec,
      newlyUnlockedStage,
    };
  }

  public getAllKnownUsersStageProgress(): Map<string, UserStageProgressRecord> {
    const out = new Map<string, UserStageProgressRecord>();
    for (const k of this.listPrefixedStorageKeys()) {
      const uid = k.slice(STORAGE_KEY_PREFIX.length);
      if (uid) {
        out.set(uid, this.getUserStageProgressSnapshot(uid));
      }
    }
    for (const [uid, rec] of this.cache.entries()) {
      if (!out.has(uid)) {
        out.set(uid, { ...rec, completedStages: [...rec.completedStages] });
      }
    }
    return out;
  }

  public clearInMemoryCacheForTesting(): void {
    // Useful for simulating fresh session / re-login from persistent storage
    this.cache.clear();
  }

  public writeRawSerializedRecordForTesting(uid: string, rawJson: string): void {
    const cleanUid = (uid || '').trim();
    if (!cleanUid) return;
    this.cache.delete(cleanUid);
    this.writeRawStorage(this.getStorageKey(cleanUid), rawJson);
  }

  public resetForTesting(uid?: string): void {
    if (uid) {
      const cleanUid = uid.trim();
      this.cache.delete(cleanUid);
      this.removeRawStorage(this.getStorageKey(cleanUid));
    } else {
      this.cache.clear();
      this.fallbackStorage.clear();
      this.issuedTokenIds.clear();
      for (const k of this.listPrefixedStorageKeys()) {
        this.removeRawStorage(k);
      }
    }
    this.notifyListeners();
  }
}
