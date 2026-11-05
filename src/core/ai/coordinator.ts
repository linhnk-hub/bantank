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
 * Candidate tactical approach & circuit points around Eagle Base (96, 192) and Stage 1 corridors:
 * Combines direct Eagle siege lanes with full-map flanking patrol waypoints.
 */
const EAGLE_TACTICAL_SLOTS: Array<{ x: number; y: number }> = [
  { x: 96, y: 160 },  // Top-center siege lane above Eagle brick wall [10, 6]
  { x: 144, y: 192 }, // Bottom-east siege lane facing Eagle brick wall [12, 9]
  { x: 48, y: 176 },  // West flank corridor [11, 3]
  { x: 144, y: 128 }, // Mid-east corridor intersection [8, 9]
  { x: 32, y: 128 },  // Mid-west corridor intersection [8, 2]
  { x: 0, y: 160 },   // Far-west corridor [10, 0]
  { x: 192, y: 160 }, // Far-east corridor [10, 12]
  { x: 96, y: 96 },   // Central upper crossroads [6, 6]
  { x: 32, y: 48 },   // North-west patrol waypoint [3, 2]
  { x: 160, y: 48 },  // North-east patrol waypoint [3, 10]
];

export class EnemyCoordinator {
  private updateTimer: number = 0;
  private cycleCounter: number = 0;

  constructor() {
    this.updateTimer = 0;
    this.cycleCounter = 0;
  }

  public reset(): void {
    this.updateTimer = 0;
    this.cycleCounter = 0;
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
    this.cycleCounter++;

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

    // Generate P1 tactical approach candidates (direct + wide flanking corridors)
    const p1Candidates: Array<{ x: number; y: number }> = [
      { x: p1X, y: p1Y },
      { x: 96, y: 160 },
      { x: 144, y: 192 },
      { x: 32, y: 128 },
      { x: 144, y: 128 },
      { x: 0, y: 160 },
      { x: 192, y: 160 },
      { x: 96, y: 96 },
      { x: 32, y: 48 },
      { x: 160, y: 48 },
    ];

    // Sort enemies deterministically by ID for stable slot assignment
    const sortedEnemies = [...aliveEnemies].sort((a, b) => a.id.localeCompare(b.id));
    let p1DirectCount = 0;

    for (let idx = 0; idx < sortedEnemies.length; idx++) {
      const enemy = sortedEnemies[idx];
      const baseTarget = enemy.targetPos ?? { x: 96, y: 192 };
      const isTargetingEagle =
        Math.abs(baseTarget.x - 96) <= 16 && Math.abs(baseTarget.y - 192) <= 16;

      // Limit max 1 enemy directly entering P1's narrow spawn pocket at a time;
      // other enemies flank across Eagle/Central/East/North corridors
      const forceEagleOrFlank = !isTargetingEagle && p1DirectCount >= 1;
      if (!isTargetingEagle && !forceEagleOrFlank) {
        p1DirectCount++;
      }

      const rawPool = isTargetingEagle || forceEagleOrFlank
        ? [...EAGLE_TACTICAL_SLOTS, ...p1Candidates]
        : [...p1Candidates, ...EAGLE_TACTICAL_SLOTS];

      let chosenSlot: { x: number; y: number } | undefined;

      // Keep current assignedApproachPos while the enemy is still travelling toward it (> 16px away)
      if (enemy.assignedApproachPos) {
        const curC = Math.round(enemy.assignedApproachPos.x / 16);
        const curR = Math.round(enemy.assignedApproachPos.y / 16);
        const curKey = `${curR}_${curC}`;
        const distToAssigned = Math.hypot(
          enemy.x - enemy.assignedApproachPos.x,
          enemy.y - enemy.assignedApproachPos.y
        );
        const isExactP1Slot =
          Boolean(p1 && p1.isAlive) &&
          curC === Math.round(p1!.x / 16) &&
          curR === Math.round(p1!.y / 16);
        if (
          (distToAssigned > 16 || isExactP1Slot) &&
          !occupiedKeys.has(curKey) &&
          (isExactP1Slot || isTileWalkable(curC, curR, terrain))
        ) {
          chosenSlot = enemy.assignedApproachPos;
          occupiedKeys.add(curKey);
        }
      }

      if (!chosenSlot && !isTargetingEagle && !forceEagleOrFlank && p1 && p1.isAlive) {
        const p1Key = `${Math.round(p1Y / 16)}_${Math.round(p1X / 16)}`;
        if (!occupiedKeys.has(p1Key)) {
          chosenSlot = { x: p1X, y: p1Y };
          occupiedKeys.add(p1Key);
        }
      }

      if (!chosenSlot) {
        const recent = enemy.recentTiles ?? [];
        const offset = (idx * 2 + this.cycleCounter) % rawPool.length;

        for (let pass = 0; pass < 2 && !chosenSlot; pass++) {
          for (let i = 0; i < rawPool.length; i++) {
            const cand = rawPool[(i + offset) % rawPool.length];
            const cx = Math.max(0, Math.min(TANK_CONFIG.MAX_X, Math.round(cand.x / 16) * 16));
            const cy = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, Math.round(cand.y / 16) * 16));
            const cc = Math.round(cx / 16);
            const cr = Math.round(cy / 16);
            const key = `${cr}_${cc}`;
            const tileKey = `${cc},${cr}`;

            if (occupiedKeys.has(key)) continue;

            const isExactP1 =
              Boolean(p1 && p1.isAlive) &&
              cc === Math.round(p1!.x / 16) &&
              cr === Math.round(p1!.y / 16) &&
              idx === 0;
            if (!isExactP1 && !isTileWalkable(cc, cr, terrain)) {
              continue;
            }

            const distFromEnemy = Math.hypot(enemy.x - cx, enemy.y - cy);
            // In pass 0, pick a waypoint at least 32px away that wasn't just visited so the tank actively patrols
            if (pass === 0 && !isExactP1 && (distFromEnemy < 32 || recent.includes(tileKey))) {
              continue;
            }

            chosenSlot = { x: cx, y: cy };
            occupiedKeys.add(key);
            break;
          }
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
