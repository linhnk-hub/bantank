/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { doc, getDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseDb } from './firebaseConfig.ts';

const SUPER_ADMIN_EMAIL = 'linhnk2013@gmail.com';

export type DifficultyModeKey = 'DEFAULT' | 'EXTREME';

export interface DifficultyProfileParameters {
  durationSeconds: number; // 30..600
  soloLives: number; // 1..9
  coopLives: number; // 1..9
  maxActiveEnemies: number; // 1..12
  spawnIntervalS: number; // 0.3..5.0
  enemySpeedScale: number; // 0.5..2.0
  enemyShootCooldownScale: number; // 0.4..2.5
}

export interface SystemDifficultyConfigDocument {
  activeDefaultDifficulty: DifficultyModeKey;
  profiles: {
    DEFAULT: DifficultyProfileParameters;
    EXTREME: DifficultyProfileParameters;
  };
  updatedAt: number;
  updatedBy: string;
  version: number;
}

export const INITIAL_DIFFICULTY_PROFILES: Record<DifficultyModeKey, DifficultyProfileParameters> = {
  DEFAULT: {
    durationSeconds: 120,
    soloLives: 3,
    coopLives: 3,
    maxActiveEnemies: 5,
    spawnIntervalS: 1.0,
    enemySpeedScale: 1.0,
    enemyShootCooldownScale: 1.0,
  },
  EXTREME: {
    durationSeconds: 60,
    soloLives: 2,
    coopLives: 1,
    maxActiveEnemies: 5,
    spawnIntervalS: 1.0,
    enemySpeedScale: 1.0,
    enemyShootCooldownScale: 1.0,
  },
};

const STORAGE_KEY = 'bantank_system_difficulty_config_v1';

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(val: unknown, fallback: number, min: number, max: number, decimals = 2): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.max(min, Math.min(max, n));
  const factor = Math.pow(10, decimals);
  return Math.round(clamped * factor) / factor;
}

export function sanitizeDifficultyProfile(
  raw: Partial<DifficultyProfileParameters> | null | undefined,
  mode: DifficultyModeKey
): DifficultyProfileParameters {
  const def = INITIAL_DIFFICULTY_PROFILES[mode];
  if (!raw || typeof raw !== 'object') {
    return { ...def };
  }
  return {
    durationSeconds: clampInt(raw.durationSeconds, def.durationSeconds, 30, 600),
    soloLives: clampInt(raw.soloLives, def.soloLives, 1, 9),
    coopLives: clampInt(raw.coopLives, def.coopLives, 1, 9),
    maxActiveEnemies: clampInt(raw.maxActiveEnemies, def.maxActiveEnemies, 1, 12),
    spawnIntervalS: clampFloat(raw.spawnIntervalS, def.spawnIntervalS, 0.3, 5.0, 2),
    enemySpeedScale: clampFloat(raw.enemySpeedScale, def.enemySpeedScale, 0.5, 2.0, 2),
    enemyShootCooldownScale: clampFloat(
      raw.enemyShootCooldownScale,
      def.enemyShootCooldownScale,
      0.4,
      2.5,
      2
    ),
  };
}

export class DifficultyConfigManager {
  private static instance: DifficultyConfigManager | null = null;
  private config: SystemDifficultyConfigDocument;
  private listeners: Set<() => void> = new Set();
  private cloudUnsubscribe: Unsubscribe | null = null;

  private constructor() {
    this.config = this.createDefaultDocument();
    this.loadFromLocalStorage();
  }

  public static getInstance(): DifficultyConfigManager {
    if (!DifficultyConfigManager.instance) {
      DifficultyConfigManager.instance = new DifficultyConfigManager();
    }
    return DifficultyConfigManager.instance;
  }

  private createDefaultDocument(): SystemDifficultyConfigDocument {
    return {
      activeDefaultDifficulty: 'DEFAULT',
      profiles: {
        DEFAULT: { ...INITIAL_DIFFICULTY_PROFILES.DEFAULT },
        EXTREME: { ...INITIAL_DIFFICULTY_PROFILES.EXTREME },
      },
      updatedAt: 0,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: 1,
    };
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
      } catch {
        // Ignore listener errors
      }
    });
  }

  private loadFromLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SystemDifficultyConfigDocument>;
      this.applyDocumentSnapshot(parsed, false);
    } catch {
      // Ignore storage errors
    }
  }

  private saveToLocalStorage(): void {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch {
      // Ignore storage errors
    }
  }

  private applyDocumentSnapshot(
    raw: Partial<SystemDifficultyConfigDocument> | null | undefined,
    persistLocal = true
  ): boolean {
    if (!raw || typeof raw !== 'object') return false;
    const incomingVer = typeof raw.version === 'number' && raw.version >= 1 ? Math.floor(raw.version) : 1;
    const incomingUpdatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;

    // Only apply if newer or initial load
    if (
      this.config.updatedAt > 0 &&
      incomingVer < this.config.version &&
      incomingUpdatedAt < this.config.updatedAt
    ) {
      return false;
    }

    const activeDefaultDifficulty: DifficultyModeKey =
      raw.activeDefaultDifficulty === 'EXTREME' ? 'EXTREME' : 'DEFAULT';
    const rawProfiles = (raw.profiles || {}) as Partial<Record<DifficultyModeKey, Partial<DifficultyProfileParameters>>>;

    this.config = {
      activeDefaultDifficulty,
      profiles: {
        DEFAULT: sanitizeDifficultyProfile(rawProfiles.DEFAULT, 'DEFAULT'),
        EXTREME: sanitizeDifficultyProfile(rawProfiles.EXTREME, 'EXTREME'),
      },
      updatedAt: incomingUpdatedAt || Date.now(),
      updatedBy:
        typeof raw.updatedBy === 'string' && raw.updatedBy.trim()
          ? raw.updatedBy.trim().toLowerCase()
          : SUPER_ADMIN_EMAIL,
      version: Math.max(1, incomingVer),
    };

    if (persistLocal) {
      this.saveToLocalStorage();
    }
    this.notifyListeners();
    return true;
  }

  public startCloudSync(): void {
    if (this.cloudUnsubscribe) return;
    try {
      const db = getFirebaseDb();
      if (!db) return;
      const docRef = doc(db, 'system_config', 'difficulty');
      this.cloudUnsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (!snap.exists()) return;
          this.applyDocumentSnapshot(snap.data() as Partial<SystemDifficultyConfigDocument>, true);
        },
        () => {
          // Ignore snapshot read errors
        }
      );
    } catch {
      // Ignore cloud init errors
    }
  }

  public stopCloudSync(): void {
    if (this.cloudUnsubscribe) {
      this.cloudUnsubscribe();
      this.cloudUnsubscribe = null;
    }
  }

  public getConfig(): SystemDifficultyConfigDocument {
    return {
      activeDefaultDifficulty: this.config.activeDefaultDifficulty,
      profiles: {
        DEFAULT: { ...this.config.profiles.DEFAULT },
        EXTREME: { ...this.config.profiles.EXTREME },
      },
      updatedAt: this.config.updatedAt,
      updatedBy: this.config.updatedBy,
      version: this.config.version,
    };
  }

  public getProfile(mode: DifficultyModeKey = 'DEFAULT'): DifficultyProfileParameters {
    const safeMode: DifficultyModeKey = mode === 'EXTREME' ? 'EXTREME' : 'DEFAULT';
    return { ...this.config.profiles[safeMode] };
  }

  public getActiveDefaultDifficulty(): DifficultyModeKey {
    return this.config.activeDefaultDifficulty;
  }

  public async activateDifficultyConfig(params: {
    targetMode: DifficultyModeKey;
    profilePatch?: Partial<DifficultyProfileParameters>;
    allProfilesPatch?: Partial<Record<DifficultyModeKey, Partial<DifficultyProfileParameters>>>;
    actorRole: string;
    actorEmail: string;
  }): Promise<{
    success: boolean;
    config: SystemDifficultyConfigDocument;
    syncedToCloud: boolean;
    message: string;
  }> {
    const cleanEmail = (params.actorEmail || '').trim().toLowerCase();
    if (params.actorRole !== 'ADMIN' && cleanEmail !== SUPER_ADMIN_EMAIL) {
      return {
        success: false,
        config: this.getConfig(),
        syncedToCloud: false,
        message: 'Chỉ tài khoản Admin mới có quyền chỉnh sửa và kích hoạt cấu hình độ khó.',
      };
    }

    const nextDefault = sanitizeDifficultyProfile(
      params.allProfilesPatch?.DEFAULT ??
        (params.targetMode === 'DEFAULT'
          ? { ...this.config.profiles.DEFAULT, ...params.profilePatch }
          : this.config.profiles.DEFAULT),
      'DEFAULT'
    );
    const nextExtreme = sanitizeDifficultyProfile(
      params.allProfilesPatch?.EXTREME ??
        (params.targetMode === 'EXTREME'
          ? { ...this.config.profiles.EXTREME, ...params.profilePatch }
          : this.config.profiles.EXTREME),
      'EXTREME'
    );

    let nextVersion = this.config.version + 1;
    const nowMs = Date.now();

    const nextDoc: SystemDifficultyConfigDocument = {
      activeDefaultDifficulty: params.targetMode === 'EXTREME' ? 'EXTREME' : 'DEFAULT',
      profiles: {
        DEFAULT: nextDefault,
        EXTREME: nextExtreme,
      },
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: nextVersion,
    };

    this.config = nextDoc;
    this.saveToLocalStorage();
    this.notifyListeners();

    let syncedToCloud = false;
    try {
      const db = getFirebaseDb();
      if (db) {
        const docRef = doc(db, 'system_config', 'difficulty');
        try {
          const remoteSnap = await getDoc(docRef);
          if (remoteSnap.exists()) {
            const rVer = Number((remoteSnap.data() as { version?: number }).version || 0);
            if (rVer >= nextVersion) {
              nextVersion = rVer + 1;
              nextDoc.version = nextVersion;
              this.config.version = nextVersion;
              this.saveToLocalStorage();
            }
          }
        } catch {
          // Proceed with local version increment
        }
        await setDoc(docRef, nextDoc);
        syncedToCloud = true;
      }
    } catch {
      syncedToCloud = false;
    }

    const modeNameVi =
      params.targetMode === 'EXTREME' ? '2. THỬ THÁCH (SIÊU KHÓ)' : '1. GIẢI TRÍ (MẶC ĐỊNH)';
    const activeProf = nextDoc.profiles[params.targetMode];

    return {
      success: true,
      config: this.getConfig(),
      syncedToCloud,
      message: `Đã lưu & kích hoạt chế độ ${modeNameVi} (Thời gian: ${activeProf.durationSeconds}s • Solo: ${activeProf.soloLives} mạng • Co-op: ${activeProf.coopLives} mạng • Tối đa ${activeProf.maxActiveEnemies} xe địch cùng lúc).`,
    };
  }

  public resetToDefaultForTesting(): void {
    this.config = this.createDefaultDocument();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
    this.notifyListeners();
  }
}
