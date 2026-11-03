/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AI_CONFIG, TANK_CONFIG } from '../constants.ts';
import { type EnemyTank } from '../types.ts';

const FLANK_SLOTS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },     // Primary approach
  { x: -16, y: 0 },   // West flank
  { x: 16, y: 0 },    // East flank
  { x: 0, y: -16 },   // North flank
  { x: 0, y: 16 },    // South flank
];

export class EnemyCoordinator {
  private updateTimer: number = 0;

  constructor() {
    this.updateTimer = 0;
  }

  public reset(): void {
    this.updateTimer = 0;
  }

  /**
   * Updates coordination every 0.5s.
   * Groups enemies by their chosen target and assigns unique flanking offsets
   * so they don't bunch up into a single file.
   */
  public update(dt: number, enemies: EnemyTank[]): void {
    this.updateTimer -= dt;
    if (this.updateTimer > 0) {
      return;
    }
    this.updateTimer = AI_CONFIG.COORDINATOR_UPDATE_INTERVAL_S;

    const aliveEnemies = enemies.filter((e) => e.isAlive);
    if (aliveEnemies.length <= 1) {
      for (const e of aliveEnemies) {
        e.flankOffset = { x: 0, y: 0 };
      }
      return;
    }

    // Group enemies by their target position key (e.g. P1 vs Eagle)
    const targetGroups = new Map<string, EnemyTank[]>();

    for (const enemy of aliveEnemies) {
      const key = enemy.targetPos
        ? `${Math.round(enemy.targetPos.x / 16)}_${Math.round(enemy.targetPos.y / 16)}`
        : 'none';
      if (!targetGroups.has(key)) {
        targetGroups.set(key, []);
      }
      targetGroups.get(key)!.push(enemy);
    }

    // Assign distinct flanking slots to members of each group
    for (const [, group] of targetGroups.entries()) {
      group.forEach((enemy, index) => {
        const slot = FLANK_SLOTS[index % FLANK_SLOTS.length];
        enemy.flankOffset = { ...slot };
      });
    }
  }

  /**
   * Computes the adjusted destination applying the enemy's assigned flank offset,
   * clamped safely within map boundaries.
   */
  public getCoordinatedDestination(
    enemy: EnemyTank,
    baseDestination: { x: number; y: number }
  ): { x: number; y: number } {
    if (!enemy.flankOffset) {
      return baseDestination;
    }

    const targetX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, baseDestination.x + enemy.flankOffset.x));
    const targetY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, baseDestination.y + enemy.flankOffset.y));

    return { x: targetX, y: targetY };
  }
}
