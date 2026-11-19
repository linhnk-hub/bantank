/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EnemyType, PlayerEconomyState } from './types.ts';

/**
 * Bảng điểm XP chính thức theo loại xe tăng địch (BTO-PROGRESSION-MODES-V1.4):
 * - BASIC = 1 XP
 * - FAST  = 2 XP
 * - POWER = 3 XP
 * - ARMOR = 5 XP
 */
export const SCORE_VALUES = {
  BASIC: 1,
  FAST: 2,
  POWER: 3,
  ARMOR: 5,
} as const;

export const XP_PER_STAR_RATE = 25;
export const RESET_HIGH_SCORE_CONFIRM_CODE = 'XAC_NHAN_XOA_KY_LUC';
const DEFAULT_HIGH_SCORE_STORAGE_KEY = 'bantank_high_score_v1';

export interface StageEnemyStats {
  BASIC: number;
  FAST: number;
  POWER: number;
  ARMOR: number;
  total: number;
}

/**
 * ScoreManager: Quản lý điểm XP trong trận, thống kê xe địch bị hạ, High Score
 * và cơ chế Zero-Write khi ở chế độ Chơi thử (Global Trial Mode).
 * Tách bạch hoàn toàn với tiền tệ Xu cũ (XuBalance = 0, đã loại bỏ quy đổi tự động).
 */
export class ScoreManager {
  private static globalTrialMode = false;

  public static isGlobalTrialMode(): boolean {
    return ScoreManager.globalTrialMode;
  }

  public static setGlobalTrialMode(active: boolean): void {
    ScoreManager.globalTrialMode = Boolean(active);
  }

  private readonly storageKey: string;
  private totalScore: number = 0;
  private highScore: number = 0;
  private stageDefeatedEnemyIds = new Set<string>();
  private stageStats: {
    BASIC: number;
    FAST: number;
    POWER: number;
    ARMOR: number;
  } = {
    BASIC: 0,
    FAST: 0,
    POWER: 0,
    ARMOR: 0,
  };

  constructor(storageKey: string = DEFAULT_HIGH_SCORE_STORAGE_KEY) {
    this.storageKey = storageKey || DEFAULT_HIGH_SCORE_STORAGE_KEY;
    this.highScore = this.loadHighScoreFromStorage();
  }

  private loadHighScoreFromStorage(): number {
    if (ScoreManager.globalTrialMode) {
      return 0;
    }
    if (typeof window === 'undefined' || !window.localStorage) {
      return 0;
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return 0;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.floor(parsed);
      }
    } catch {
      // Ignore storage access errors in restricted contexts
    }
    return 0;
  }

  private saveHighScoreToStorage(value: number): void {
    if (ScoreManager.globalTrialMode) {
      return;
    }
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(this.storageKey, String(Math.max(0, Math.floor(value))));
    } catch {
      // Ignore storage write errors
    }
  }

  public resetRun(): void {
    this.totalScore = 0;
    this.stageDefeatedEnemyIds.clear();
    this.stageStats = {
      BASIC: 0,
      FAST: 0,
      POWER: 0,
      ARMOR: 0,
    };
  }

  public advanceToNextStage(): void {
    this.stageDefeatedEnemyIds.clear();
    this.stageStats = {
      BASIC: 0,
      FAST: 0,
      POWER: 0,
      ARMOR: 0,
    };
  }

  public recordEnemyDefeated(enemyId: string, enemyType: EnemyType): boolean {
    if (!enemyId || this.stageDefeatedEnemyIds.has(enemyId)) {
      return false;
    }
    this.stageDefeatedEnemyIds.add(enemyId);
    const pts = SCORE_VALUES[enemyType] ?? 0;
    this.totalScore += pts;
    this.stageStats[enemyType] = (this.stageStats[enemyType] ?? 0) + 1;
    return true;
  }

  public getTotalScore(): number {
    return this.totalScore;
  }

  public getTotalXp(): number {
    return this.totalScore;
  }

  public getHighScore(): number {
    return this.highScore;
  }

  public checkAndUpdateHighScore(): void {
    if (ScoreManager.globalTrialMode) {
      return;
    }
    if (this.totalScore > this.highScore) {
      this.highScore = this.totalScore;
      this.saveHighScoreToStorage(this.highScore);
    }
  }

  public getStageStats(): StageEnemyStats {
    const basic = this.stageStats.BASIC;
    const fast = this.stageStats.FAST;
    const power = this.stageStats.POWER;
    const armor = this.stageStats.ARMOR;
    return {
      BASIC: basic,
      FAST: fast,
      POWER: power,
      ARMOR: armor,
      total: basic + fast + power + armor,
    };
  }

  public resetAllDataWithConfirmation(confirmCode: string): boolean {
    if (confirmCode !== RESET_HIGH_SCORE_CONFIRM_CODE) {
      return false;
    }
    this.highScore = 0;
    this.resetRun();
    if (!ScoreManager.globalTrialMode && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.storageKey);
      } catch {
        // Ignore storage errors
      }
    }
    return true;
  }

  /**
   * Tiền tệ Xu đã bị gỡ bỏ khỏi nền kinh tế người chơi (luôn trả về 0, tách bạch hoàn toàn với XP).
   */
  public getXuBalance(): number {
    return 0;
  }

  public canConvertXpToXu(_amount: number): boolean {
    return false;
  }

  public convertXpToXuManual(_amount: number): { success: false; convertedXu: 0 } {
    return { success: false, convertedXu: 0 };
  }

  public getStarBalance(): number {
    return Math.floor(this.totalScore / XP_PER_STAR_RATE);
  }

  public getUnconvertedXp(): number {
    return this.totalScore % XP_PER_STAR_RATE;
  }

  public getEconomyState(): PlayerEconomyState {
    const unconvertedXp = this.getUnconvertedXp();
    return {
      totalXp: this.totalScore,
      starBalance: this.getStarBalance(),
      unconvertedXp,
      xpToNextStar: XP_PER_STAR_RATE - unconvertedXp,
    };
  }
}
