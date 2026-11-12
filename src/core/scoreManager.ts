/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type EnemyType, type PlayerEconomyState, type EconomyConversionInterface } from './types.ts';

export const SCORE_VALUES: Record<EnemyType, number> = {
  BASIC: 1,
  FAST: 2,
  POWER: 3,
  ARMOR: 5, // Note: Armor is 5 XP, not 4 XP
};

export const HIGH_SCORE_STORAGE_KEY = 'bantank_high_score';

export interface EnemyDefeatStats {
  BASIC: number;
  FAST: number;
  POWER: number;
  ARMOR: number;
  total: number;
}

export interface MatchScoreSnapshot {
  currentStageScore: number;
  cumulativeScore: number;
  highScore: number;
  isNewRecord: boolean;
  stats: EnemyDefeatStats;
  cumulativeStats: EnemyDefeatStats;
}

export class ScoreManager implements EconomyConversionInterface {
  private currentStageScore: number = 0; // Total stage XP
  private carryOverScore: number = 0; // Cumulative XP from previous stages in current run
  private highScore: number = 0; // High XP record
  private xuBalance: number = 0; // Independent currency balance (zero auto-conversion)
  private defeatedEnemiesThisStage: Map<string, EnemyType> = new Map();
  private cumulativeStats: Record<EnemyType, number> = {
    BASIC: 0,
    FAST: 0,
    POWER: 0,
    ARMOR: 0,
  };
  private stageStats: Record<EnemyType, number> = {
    BASIC: 0,
    FAST: 0,
    POWER: 0,
    ARMOR: 0,
  };
  private static inMemoryFallback: Map<string, string> = new Map();
  private storageKey: string;
  private trialMode: boolean = false;
  private static globalTrialMode: boolean = false;

  constructor(customStorageKey: string = HIGH_SCORE_STORAGE_KEY) {
    this.storageKey = customStorageKey;
    this.trialMode = ScoreManager.globalTrialMode;
    this.highScore = this.loadHighScore();
  }

  /**
   * M7.3.9: Bật/tắt chế độ Chơi thử (Trial Mode) ở cấp toàn cục hoặc theo instance.
   * Khi ở chế độ Chơi thử, mọi thao tác đọc/ghi dữ liệu persistent (localStorage) đều bị chặn tuyệt đối.
   */
  public static setGlobalTrialMode(enabled: boolean): void {
    ScoreManager.globalTrialMode = enabled;
  }

  public static isGlobalTrialMode(): boolean {
    return ScoreManager.globalTrialMode;
  }

  public setTrialMode(enabled: boolean): void {
    this.trialMode = enabled;
    ScoreManager.globalTrialMode = enabled;
    this.resetRun();
    if (enabled) {
      this.highScore = 0;
    } else {
      this.highScore = this.loadHighScore();
    }
  }

  public isTrialMode(): boolean {
    return this.trialMode || ScoreManager.globalTrialMode;
  }

  private getStorageItem(key: string): string | null {
    if (this.isTrialMode()) {
      return null;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.warn('localStorage read error:', e);
    }
    return ScoreManager.inMemoryFallback.get(key) ?? null;
  }

  private setStorageItem(key: string, value: string): void {
    if (this.isTrialMode()) {
      // M7.3.9: Tuyệt đối không ghi dữ liệu trong chế độ Chơi thử
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn('localStorage write error:', e);
    }
    ScoreManager.inMemoryFallback.set(key, value);
  }

  private removeStorageItem(key: string): void {
    if (this.isTrialMode()) {
      return;
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn('localStorage remove error:', e);
    }
    ScoreManager.inMemoryFallback.delete(key);
  }

  /**
   * Safely loads high score from persistent storage.
   */
  public loadHighScore(): number {
    if (this.isTrialMode()) {
      return 0;
    }
    const stored = this.getStorageItem(this.storageKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      return isNaN(parsed) || parsed < 0 ? 0 : parsed;
    }
    return 0;
  }

  /**
   * Saves high score if current score exceeds existing high score.
   * Returns true if a new high score was set.
   */
  public checkAndUpdateHighScore(): boolean {
    const total = this.getTotalScore();
    if (total > this.highScore) {
      this.highScore = total;
      if (!this.isTrialMode()) {
        this.setStorageItem(this.storageKey, this.highScore.toString());
      }
      return true;
    }
    return false;
  }

  /**
   * Records an enemy defeat. Ensures each enemy ID is scored only once.
   */
  public recordEnemyDefeated(enemyId: string, enemyType: EnemyType): boolean {
    if (this.defeatedEnemiesThisStage.has(enemyId)) {
      return false; // Already scored!
    }

    this.defeatedEnemiesThisStage.set(enemyId, enemyType);
    const points = SCORE_VALUES[enemyType] ?? 0;
    this.currentStageScore += points;
    this.stageStats[enemyType] = (this.stageStats[enemyType] || 0) + 1;
    this.cumulativeStats[enemyType] = (this.cumulativeStats[enemyType] || 0) + 1;

    // Check if new high score
    this.checkAndUpdateHighScore();

    return true;
  }

  public getStageScore(): number {
    return this.currentStageScore;
  }

  public getTotalScore(): number {
    return this.carryOverScore + this.currentStageScore;
  }

  public getHighScore(): number {
    return this.highScore;
  }

  /**
   * Alias for getTotalScore() reflecting the battle XP system.
   */
  public getTotalXp(): number {
    return this.getTotalScore();
  }

  /**
   * Currency (Xu) balance.
   * STRICT SEPARATION: XP gains never automatically increment or affect Xu balance!
   */
  public getXuBalance(): number {
    return this.xuBalance;
  }

  /**
   * Returns decoupled player economy snapshot.
   */
  public getEconomyState(): PlayerEconomyState {
    return {
      totalXp: this.getTotalXp(),
      xuBalance: this.xuBalance,
    };
  }

  /**
   * Conversion validation stub.
   * Auto-conversion is strictly prohibited; manual conversion is inactive by default.
   */
  public canConvertXpToXu(_xpAmount: number): boolean {
    return false; // Dormant: no auto or unauthorized conversion
  }

  /**
   * Future intentional manual conversion interface.
   * Inactive by default in current gameplay loop.
   */
  public convertXpToXuManual(_xpAmount: number): { success: boolean; convertedXu: number; remainingXp: number } {
    return {
      success: false,
      convertedXu: 0,
      remainingXp: this.getTotalXp(),
    };
  }

  public getStageStats(): EnemyDefeatStats {
    const total =
      this.stageStats.BASIC +
      this.stageStats.FAST +
      this.stageStats.POWER +
      this.stageStats.ARMOR;

    return {
      BASIC: this.stageStats.BASIC,
      FAST: this.stageStats.FAST,
      POWER: this.stageStats.POWER,
      ARMOR: this.stageStats.ARMOR,
      total,
    };
  }

  public getCumulativeStats(): EnemyDefeatStats {
    const total =
      this.cumulativeStats.BASIC +
      this.cumulativeStats.FAST +
      this.cumulativeStats.POWER +
      this.cumulativeStats.ARMOR;

    return {
      BASIC: this.cumulativeStats.BASIC,
      FAST: this.cumulativeStats.FAST,
      POWER: this.cumulativeStats.POWER,
      ARMOR: this.cumulativeStats.ARMOR,
      total,
    };
  }

  /**
   * Transitions to the next stage:
   * Carries forward accumulated total score, resets stage-specific counters.
   */
  public advanceToNextStage(): void {
    this.carryOverScore += this.currentStageScore;
    this.currentStageScore = 0;
    this.defeatedEnemiesThisStage.clear();
    this.stageStats = {
      BASIC: 0,
      FAST: 0,
      POWER: 0,
      ARMOR: 0,
    };
  }

  /**
   * Resets the current run (for restart or return to menu).
   * High score is preserved!
   */
  public resetRun(): void {
    this.carryOverScore = 0;
    this.currentStageScore = 0;
    this.defeatedEnemiesThisStage.clear();
    this.stageStats = {
      BASIC: 0,
      FAST: 0,
      POWER: 0,
      ARMOR: 0,
    };
    this.cumulativeStats = {
      BASIC: 0,
      FAST: 0,
      POWER: 0,
      ARMOR: 0,
    };
  }

  /**
   * Complete reset of persistent data including High Score.
   * Requires explicit confirmation string to prevent accidental erasure.
   */
  public resetAllDataWithConfirmation(confirmationText: string): boolean {
    if (confirmationText !== 'XAC_NHAN_XOA_KY_LUC') {
      return false;
    }

    this.highScore = 0;
    this.resetRun();
    this.removeStorageItem(this.storageKey);
    return true;
  }

  public getSnapshot(): MatchScoreSnapshot {
    const total = this.getTotalScore();
    return {
      currentStageScore: this.currentStageScore,
      cumulativeScore: total,
      highScore: this.highScore,
      isNewRecord: total >= this.highScore && total > 0,
      stats: this.getStageStats(),
      cumulativeStats: this.getCumulativeStats(),
    };
  }
}
