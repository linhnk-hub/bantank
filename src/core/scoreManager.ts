/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { type EnemyType } from './types.ts';

export const SCORE_VALUES: Record<EnemyType, number> = {
  BASIC: 100,
  FAST: 200,
  POWER: 300,
  ARMOR: 400,
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

export class ScoreManager {
  private currentStageScore: number = 0;
  private carryOverScore: number = 0; // Score from previous stages in current run
  private highScore: number = 0;
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

  constructor(customStorageKey: string = HIGH_SCORE_STORAGE_KEY) {
    this.storageKey = customStorageKey;
    this.highScore = this.loadHighScore();
  }

  private getStorageItem(key: string): string | null {
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
      this.setStorageItem(this.storageKey, this.highScore.toString());
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
