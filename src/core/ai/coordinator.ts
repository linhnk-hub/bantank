/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AI_CONFIG, TANK_CONFIG } from '../constants.ts';
import { type EnemyTank, type RuntimeTerrainState, type TankStructure } from '../types.ts';
import { isTileWalkable } from './pathfinding.ts';

const FLANK_SLOTS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },     // Primary approach
  { x: -16, y: 0 },   // West flank
  { x: 16, y: 0 },    // East flank
  { x: 0, y: -16 },   // North flank
  { x: 0, y: 16 },    // South flank
];

/**
 * Candidate tactical approach points around Eagle Base (96, 192) on Stage 1:
 * Covers top-center, top-west, top-east, west corridor, and east corridor.
 */
const EAGLE_TACTICAL_SLOTS: Array<{ x: number; y: number }> = [
  { x: 96, y: 160 },  // Top-center above Eagle brick wall [10, 6]
  { x: 144, y: 176 }, // East flank corridor [11, 9]
  { x: 48, y: 176 },  // West flank corridor [11, 3]
  { x: 80, y: 160 },  // Top-west above Eagle brick wall [10, 5]
  { x: 112, y: 160 }, // Top-east above Eagle brick wall [10, 7]
  { x: 144, y: 192 }, // Bottom-east flank [12, 9]
  { x: 0, y: 160 },   // Far-west corridor [10, 0]
  { x: 192, y: 160 }, // Far-east corridor [10, 12]
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
   * and validated walkable approach positions so they don't converge into a single spot.
   */
  public update(
    dt: number,
    enemies: EnemyTank[],
    terrain?: RuntimeTerrainState,
    p1?: TankStructure
  ): void {
    this.updateTimer -= dt;
    if (this.updateTimer > 0) {
      return;
    }
    this.updateTimer = AI_CONFIG.COORDINATOR_UPDATE_INTERVAL_S;

    const aliveEnemies = enemies.filter((e) => e.isAlive);
    if (aliveEnemies.length <= 1) {
      for (const e of aliveEnemies) {
        e.flankOffset = { x: 0, y: 0 };
        e.assignedApproachPos = undefined;
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

    // 1. Assign distinct baseline flanking slots to members of each group (preserves AUDIT-E)
    for (const [, group] of targetGroups.entries()) {
      group.forEach((enemy, index) => {
        const slot = FLANK_SLOTS[index % FLANK_SLOTS.length];
        enemy.flankOffset = { ...slot };
      });
    }

    // 2. If runtime terrain is provided, compute validated walkable approach slots
    // so enemies never target inside BRICK/STEEL/WATER and never all converge on one alley
    if (!terrain) {
      return;
    }

    const occupiedKeys = new Set<string>();
    const p1X = p1 ? Math.round(p1.x / 16) * 16 : 48;
    const p1Y = p1 ? Math.round(p1.y / 16) * 16 : 192;

    // Generate P1 tactical approach candidates (North, West, East, South + flanking corridors)
    const p1Candidates: Array<{ x: number; y: number }> = [
      { x: p1X, y: p1Y },
      { x: p1X, y: Math.max(0, p1Y - 32) },
      { x: Math.max(0, p1X - 48), y: Math.max(0, p1Y - 32) },
      { x: Math.min(TANK_CONFIG.MAX_X, p1X + 48), y: Math.max(0, p1Y - 32) },
      { x: Math.max(0, p1X - 32), y: p1Y },
      { x: Math.min(TANK_CONFIG.MAX_X, p1X + 32), y: p1Y },
      { x: 96, y: 160 },
      { x: 144, y: 160 },
      { x: 0, y: 160 },
      { x: 32, y: 128 },
      { x: 96, y: 128 },
      { x: 160, y: 128 },
    ];

    // Sort enemies deterministically by ID for stable slot assignment (prevents slot swapping)
    const sortedEnemies = [...aliveEnemies].sort((a, b) => a.id.localeCompare(b.id));
    let p1DirectCount = 0;

    for (const enemy of sortedEnemies) {
      const baseTarget = enemy.targetPos ?? { x: 96, y: 192 };
      const isTargetingEagle =
        Math.abs(baseTarget.x - 96) <= 16 && Math.abs(baseTarget.y - 192) <= 16;

      // Limit max 2 enemies directly entering P1's narrow lane simultaneously;
      // additional enemies flank via Eagle/Central/East lanes to encircle
      const forceEagleOrFlank = !isTargetingEagle && p1DirectCount >= 2;
      if (!isTargetingEagle && !forceEagleOrFlank) {
        p1DirectCount++;
      }

      const pool = isTargetingEagle || forceEagleOrFlank
        ? [...EAGLE_TACTICAL_SLOTS, ...p1Candidates]
        : [...p1Candidates, ...EAGLE_TACTICAL_SLOTS];

      let chosenSlot: { x: number; y: number } | undefined;

      // First check if keeping current assignedApproachPos is still valid and unoccupied
      if (enemy.assignedApproachPos) {
        const curC = Math.round(enemy.assignedApproachPos.x / 16);
        const curR = Math.round(enemy.assignedApproachPos.y / 16);
        const curKey = `${curR}_${curC}`;
        const distToAssigned = Math.hypot(
          enemy.x - enemy.assignedApproachPos.x,
          enemy.y - enemy.assignedApproachPos.y
        );
        // If enemy hasn't reached its assigned approach waypoint yet (> 8px away) and it's walkable & free
        if (
          distToAssigned > 8 &&
          !occupiedKeys.has(curKey) &&
          isTileWalkable(curC, curR, terrain)
        ) {
          chosenSlot = enemy.assignedApproachPos;
          occupiedKeys.add(curKey);
        }
      }

      if (!chosenSlot) {
        for (const cand of pool) {
          const cx = Math.max(0, Math.min(TANK_CONFIG.MAX_X, Math.round(cand.x / 16) * 16));
          const cy = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, Math.round(cand.y / 16) * 16));
          const cc = Math.round(cx / 16);
          const cr = Math.round(cy / 16);
          const key = `${cr}_${cc}`;

          if (occupiedKeys.has(key)) continue;

          // Allow exact P1 tile for the primary chaser, otherwise require walkable tile
          const isExactP1 = p1 && cc === Math.round(p1.x / 16) && cr === Math.round(p1.y / 16);
          if (!isExactP1 && !isTileWalkable(cc, cr, terrain)) {
            continue;
          }

          chosenSlot = { x: cx, y: cy };
          occupiedKeys.add(key);
          break;
        }
      }

      enemy.assignedApproachPos = chosenSlot;
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
    if (enemy.assignedApproachPos) {
      return enemy.assignedApproachPos;
    }
    if (!enemy.flankOffset) {
      return baseDestination;
    }

    const targetX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, baseDestination.x + enemy.flankOffset.x));
    const targetY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, baseDestination.y + enemy.flankOffset.y));

    return { x: targetX, y: targetY };
  }
}
