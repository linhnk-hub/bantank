/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TANK_CONFIG } from '../constants.ts';
import {
  TILE_TYPES,
  type TankStructure,
  type Direction,
  type RuntimeTerrainState,
  type EnemyTank,
  type BulletStructure,
} from '../types.ts';
import {
  getTankHitbox,
  checkHitboxVsTerrain,
  checkTankVsTanks,
  intersectAABB,
} from '../physics.ts';
import { getBrickMask } from '../terrain.ts';
import { findPathAStar } from './pathfinding.ts';

const ALL_DIRS: readonly Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;

function getOppositeDir(dir: Direction): Direction {
  if (dir === 'UP') return 'DOWN';
  if (dir === 'DOWN') return 'UP';
  if (dir === 'LEFT') return 'RIGHT';
  return 'LEFT';
}

export interface AllyAIDecision {
  direction: Direction | null;
  shouldShoot: boolean;
}

export class AllyAIController {
  private shootCooldown: number = 0;
  private changeDirCooldown: number = 0;
  private currentDir: Direction = 'UP';
  private path: Array<{ x: number; y: number }> = [];
  private pathCooldown: number = 0;
  private lastTargetTileKey: string = '';
  private lastTerrainSignature: number = -1;
  private stuckTimer: number = 0;
  private lastStuckPos: { x: number; y: number } = { x: 144, y: 192 };

  public reset(): void {
    this.shootCooldown = 0.5;
    this.changeDirCooldown = 0;
    this.currentDir = 'UP';
    this.path = [];
    this.pathCooldown = 0;
    this.lastTargetTileKey = '';
    this.lastTerrainSignature = -1;
    this.stuckTimer = 0;
    this.lastStuckPos = { x: 144, y: 192 };
  }

  public getCurrentPath(): Array<{ x: number; y: number }> {
    return [...this.path];
  }

  public getStuckTimer(): number {
    return this.stuckTimer;
  }

  private computeTerrainSignature(terrain: RuntimeTerrainState): number {
    let sum = 0;
    for (const k in terrain.brickSubTiles) {
      sum += terrain.brickSubTiles[k] || 0;
    }
    return sum;
  }

  /**
   * Evaluates if shooting in a given direction would hit an ally (P1 or the Eagle base).
   * Strictly prevents friendly fire at any distance.
   */
  public isFriendlyInLineOfFire(
    p2: TankStructure,
    dir: Direction = p2.direction,
    p1?: TankStructure | null,
    _terrain?: RuntimeTerrainState
  ): boolean {
    // 1. Check if P1 is in line of fire (including when P1 stands between P2 and an enemy)
    if (p1 && p1.isAlive) {
      if (dir === 'UP' && Math.abs(p1.x - p2.x) <= 14 && p1.y < p2.y) {
        return true;
      }
      if (dir === 'DOWN' && Math.abs(p1.x - p2.x) <= 14 && p1.y > p2.y) {
        return true;
      }
      if (dir === 'LEFT' && Math.abs(p1.y - p2.y) <= 14 && p1.x < p2.x) {
        return true;
      }
      if (dir === 'RIGHT' && Math.abs(p1.y - p2.y) <= 14 && p1.x > p2.x) {
        return true;
      }
    }

    // 2. Check if Eagle Base at (96, 192) or its protective brick perimeter is in line of fire
    if (this.isBaseInLineOfFire(p2, dir)) {
      return true;
    }

    return false;
  }

  /**
   * Specifically checks if Eagle Base (96, 192) or its protective brick wall
   * is ahead on the bullet path at ANY distance (including point-blank 80 <= x <= 112).
   */
  public isBaseInLineOfFire(p2: TankStructure, dir: Direction = p2.direction): boolean {
    // Eagle base is at (96, 192) [tile (12, 6)], protected by bricks at cols 5..7 (x: 80..128), rows 11..12 (y: 176..208)
    if (dir === 'DOWN' && p2.y <= 192 && p2.x + 14 >= 80 && p2.x <= 126) {
      return true;
    }
    if (dir === 'LEFT' && p2.x >= 96 && p2.y + 14 >= 176) {
      return true;
    }
    if (dir === 'RIGHT' && p2.x <= 96 && p2.y + 14 >= 176) {
      return true;
    }
    return false;
  }

  /**
   * Checks if an enemy tank is in the direct line of fire for the given direction,
   * unobstructed by STEEL walls.
   */
  public isEnemyInLineOfFire(
    p2: TankStructure,
    dir: Direction,
    enemies: EnemyTank[],
    terrain: RuntimeTerrainState
  ): boolean {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;

      let aligned = false;
      if (dir === 'UP' && Math.abs(enemy.x - p2.x) <= 10 && enemy.y < p2.y) {
        aligned = true;
      } else if (dir === 'DOWN' && Math.abs(enemy.x - p2.x) <= 10 && enemy.y > p2.y) {
        aligned = true;
      } else if (dir === 'LEFT' && Math.abs(enemy.y - p2.y) <= 10 && enemy.x < p2.x) {
        aligned = true;
      } else if (dir === 'RIGHT' && Math.abs(enemy.y - p2.y) <= 10 && enemy.x > p2.x) {
        aligned = true;
      }

      if (aligned && !this.isSteelBlockingRay(p2.x + 8, p2.y + 8, enemy.x + 8, enemy.y + 8, terrain)) {
        return true;
      }
    }
    return false;
  }

  private isSteelBlockingRay(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    terrain: RuntimeTerrainState
  ): boolean {
    const dist = Math.hypot(endX - startX, endY - startY);
    const steps = Math.ceil(dist / 8);
    if (steps <= 1) return false;
    const dx = (endX - startX) / steps;
    const dy = (endY - startY) / steps;
    for (let i = 1; i < steps; i++) {
      const cx = startX + dx * i;
      const cy = startY + dy * i;
      const c = Math.floor(cx / 16);
      const r = Math.floor(cy / 16);
      if (r >= 0 && r < 13 && c >= 0 && c < 13) {
        if (terrain.currentMap[r][c] === TILE_TYPES.STEEL) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Checks if P2 is directly facing a destructible non-base brick obstacle blocking its path.
   */
  public isFacingDestructibleBrick(p2: TankStructure, dir: Direction, terrain: RuntimeTerrainState): boolean {
    let probeX = p2.x;
    let probeY = p2.y;
    if (dir === 'UP') probeY -= 4;
    else if (dir === 'DOWN') probeY += 4;
    else if (dir === 'LEFT') probeX -= 4;
    else if (dir === 'RIGHT') probeX += 4;

    const hit = checkHitboxVsTerrain(getTankHitbox(probeX, probeY), terrain, { forBullet: false });
    if (hit.collides && hit.hitTile?.type === TILE_TYPES.BRICK) {
      const { row, col } = hit.hitTile;
      // Never shoot at base-protective bricks (rows 11..12, cols 5..7)
      if (row >= 11 && col >= 5 && col <= 7) {
        return false;
      }
      return getBrickMask(terrain, row, col) > 0;
    }
    return false;
  }

  /**
   * Tests whether P2 can physically advance in `dir` without hitting terrain, P1, or enemy tanks.
   */
  public canMoveInDirection(
    p2: TankStructure,
    dir: Direction,
    terrain: RuntimeTerrainState,
    p1: TankStructure | null,
    enemies: EnemyTank[],
    stepPx: number = 4
  ): boolean {
    let testX = p2.x;
    let testY = p2.y;
    if (dir === 'UP') testY -= stepPx;
    else if (dir === 'DOWN') testY += stepPx;
    else if (dir === 'LEFT') testX -= stepPx;
    else if (dir === 'RIGHT') testX += stepPx;

    if (testX < 0 || testX > TANK_CONFIG.MAX_X || testY < 0 || testY > TANK_CONFIG.MAX_Y) {
      return false;
    }

    const testBox = getTankHitbox(testX, testY);
    const terrColl = checkHitboxVsTerrain(testBox, terrain, { forBullet: false });
    if (terrColl.collides) {
      return false;
    }

    if (p1 && p1.isAlive) {
      const p1Box = getTankHitbox(p1.x, p1.y);
      if (intersectAABB(testBox, p1Box)) {
        return false;
      }
    }

    const aliveEnemies = enemies.filter((e) => e.isAlive);
    if (checkTankVsTanks(p2.id, testBox, aliveEnemies)) {
      return false;
    }

    return true;
  }

  private getDirectionTowardWaypoint(
    p2: TankStructure,
    wp: { x: number; y: number },
    terrain: RuntimeTerrainState,
    p1: TankStructure | null,
    enemies: EnemyTank[]
  ): Direction | null {
    const dx = wp.x - p2.x;
    const dy = wp.y - p2.y;

    const horizDir: Direction | null = Math.abs(dx) > 0.5 ? (dx > 0 ? 'RIGHT' : 'LEFT') : null;
    const vertDir: Direction | null = Math.abs(dy) > 0.5 ? (dy > 0 ? 'DOWN' : 'UP') : null;

    const primary =
      Math.abs(dx) > Math.abs(dy)
        ? horizDir ?? vertDir
        : vertDir ?? horizDir;
    const secondary = primary === horizDir ? vertDir : horizDir;

    if (primary && this.canMoveInDirection(p2, primary, terrain, p1, enemies, 2)) {
      return primary;
    }
    if (secondary && this.canMoveInDirection(p2, secondary, terrain, p1, enemies, 2)) {
      return secondary;
    }
    return primary;
  }

  private pickUnstuckDirection(
    p2: TankStructure,
    targetX: number,
    targetY: number,
    terrain: RuntimeTerrainState,
    p1: TankStructure | null,
    enemies: EnemyTank[]
  ): Direction {
    const openDirs: Direction[] = [];
    for (const dir of ALL_DIRS) {
      if (this.canMoveInDirection(p2, dir, terrain, p1, enemies, 4)) {
        openDirs.push(dir);
      }
    }
    if (openDirs.length === 0) {
      for (const dir of ALL_DIRS) {
        if (this.canMoveInDirection(p2, dir, terrain, p1, enemies, 1)) {
          openDirs.push(dir);
        }
      }
    }
    if (openDirs.length === 0) {
      return p2.direction;
    }

    const opposite = getOppositeDir(this.currentDir);
    let bestDir = openDirs[0];
    let bestScore = -Infinity;

    for (const dir of openDirs) {
      let nx = p2.x;
      let ny = p2.y;
      if (dir === 'UP') ny -= 16;
      else if (dir === 'DOWN') ny += 16;
      else if (dir === 'LEFT') nx -= 16;
      else if (dir === 'RIGHT') nx += 16;

      const dist = Math.hypot(targetX - nx, targetY - ny);
      let score = -dist;
      // Prefer perpendicular/new direction when stuck rather than immediately repeating blocked direction
      if (dir === this.currentDir && this.stuckTimer >= 0.45) {
        score -= 40;
      }
      if (dir === opposite && openDirs.length > 1) {
        score -= 25;
      }
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    return bestDir;
  }

  /**
   * Post-movement verification: verifies whether P2 can safely fire a bullet
   * in its ACTUAL current direction (`p2.direction`) after turning/moving.
   */
  public verifySafeShotAfterTurn(
    p2: TankStructure,
    p1: TankStructure | null,
    enemies: EnemyTank[],
    terrain: RuntimeTerrainState,
    p2HasBullet: boolean
  ): boolean {
    if (!p2.isAlive || p2HasBullet || this.shootCooldown > 0) {
      return false;
    }

    // Strict check against actual post-turn direction `p2.direction`
    if (this.isFriendlyInLineOfFire(p2, p2.direction, p1, terrain)) {
      return false;
    }

    const aliveEnemies = enemies.filter((e) => e.isAlive);
    const enemyInLine = this.isEnemyInLineOfFire(p2, p2.direction, aliveEnemies, terrain);
    const brickBlocking = this.isFacingDestructibleBrick(p2, p2.direction, terrain);

    if (enemyInLine || brickBlocking) {
      this.shootCooldown = 0.75;
      return true;
    }

    return false;
  }

  /**
   * Main AI update loop per tick (dt in seconds).
   * Integrates A* pathfinding, dynamic obstacle & P1 avoidance, stuck recovery,
   * and strict post-direction-resolution fire control.
   */
  public update(
    dt: number,
    p2: TankStructure,
    p1: TankStructure | null,
    enemies: EnemyTank[],
    terrain: RuntimeTerrainState,
    bullets: BulletStructure[] | boolean = false
  ): AllyAIDecision {
    if (!p2.isAlive) {
      return { direction: null, shouldShoot: false };
    }

    if (this.shootCooldown > 0) {
      this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    }
    if (this.changeDirCooldown > 0) {
      this.changeDirCooldown = Math.max(0, this.changeDirCooldown - dt);
    }
    if (this.pathCooldown > 0) {
      this.pathCooldown = Math.max(0, this.pathCooldown - dt);
    }

    const aliveEnemies = enemies.filter((e) => e.isAlive);

    // 1. Select highest-threat enemy (prioritizing enemies closest to Eagle Base at 96, 192)
    let primaryTarget: EnemyTank | null = null;
    let highestThreatScore = -Infinity;

    for (const enemy of aliveEnemies) {
      const distToBase = Math.hypot(enemy.x - 96, enemy.y - 192);
      const distToP2 = Math.hypot(enemy.x - p2.x, enemy.y - p2.y);
      const threatScore = 1000 - distToBase * 1.2 - distToP2 * 0.3;
      if (threatScore > highestThreatScore) {
        highestThreatScore = threatScore;
        primaryTarget = enemy;
      }
    }

    // 2. Determine tactical destination
    let targetX = 144;
    let targetY = 160;
    if (primaryTarget) {
      targetX = primaryTarget.x;
      targetY = primaryTarget.y;
    }

    // 3. Detect terrain changes & target changes for A* pathfinding
    const targetTileKey = `${Math.round(targetY / 16)}_${Math.round(targetX / 16)}`;
    const terrainSig = this.computeTerrainSignature(terrain);
    const mapChanged = this.lastTerrainSignature !== -1 && this.lastTerrainSignature !== terrainSig;
    this.lastTerrainSignature = terrainSig;

    const blockedTanks: Array<{ x: number; y: number; id: string }> = [];
    if (p1 && p1.isAlive) {
      blockedTanks.push({ x: p1.x, y: p1.y, id: p1.id });
    }
    for (const e of aliveEnemies) {
      if (!primaryTarget || e.id !== primaryTarget.id) {
        blockedTanks.push({ x: e.x, y: e.y, id: e.id });
      }
    }

    // 4. Stuck detection
    const distMoved = Math.hypot(p2.x - this.lastStuckPos.x, p2.y - this.lastStuckPos.y);
    const isAimingAtEnemy = this.isEnemyInLineOfFire(p2, this.currentDir, aliveEnemies, terrain);
    if (!isAimingAtEnemy && distMoved < 0.8) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = 0;
      this.lastStuckPos = { x: p2.x, y: p2.y };
    }

    const currentDirBlocked = !this.canMoveInDirection(p2, this.currentDir, terrain, p1, aliveEnemies, 2);

    // Recompute A* path when target changes, map changes, path is empty, path cooldown expires, or blocked
    if (
      this.pathCooldown <= 0 ||
      this.path.length === 0 ||
      targetTileKey !== this.lastTargetTileKey ||
      mapChanged ||
      currentDirBlocked
    ) {
      this.path = findPathAStar(
        { x: p2.x, y: p2.y },
        { x: targetX, y: targetY },
        terrain,
        blockedTanks,
        p2.id
      );
      this.lastTargetTileKey = targetTileKey;
      this.pathCooldown = 0.35;
    }

    // 5. Resolve final movement direction using A* waypoints + stuck recovery
    if (this.stuckTimer >= 0.45) {
      // Stuck recovery: pick alternative open direction and reset path
      this.currentDir = this.pickUnstuckDirection(p2, targetX, targetY, terrain, p1, aliveEnemies);
      this.changeDirCooldown = 0.4;
      this.stuckTimer = 0;
      this.lastStuckPos = { x: p2.x, y: p2.y };
      this.path = findPathAStar(
        { x: p2.x, y: p2.y },
        { x: targetX, y: targetY },
        terrain,
        blockedTanks,
        p2.id
      );
    } else if (this.changeDirCooldown <= 0 || currentDirBlocked) {
      let chosenDir: Direction | null = null;

      // Consume reached A* waypoints
      while (this.path.length > 0) {
        const wp = this.path[0];
        if (Math.abs(wp.x - p2.x) <= 2 && Math.abs(wp.y - p2.y) <= 2) {
          this.path.shift();
        } else {
          break;
        }
      }

      if (this.path.length > 0) {
        const nextWp = this.path[0];
        const wpDir = this.getDirectionTowardWaypoint(p2, nextWp, terrain, p1, aliveEnemies);
        if (wpDir && (this.canMoveInDirection(p2, wpDir, terrain, p1, aliveEnemies, 2) || this.isFacingDestructibleBrick(p2, wpDir, terrain))) {
          chosenDir = wpDir;
        }
      }

      if (!chosenDir) {
        chosenDir = this.pickUnstuckDirection(p2, targetX, targetY, terrain, p1, aliveEnemies);
      }

      if (chosenDir !== this.currentDir) {
        this.currentDir = chosenDir;
        this.changeDirCooldown = 0.25;
      }
    }

    // 6. Mandatory Order: Finalize direction -> Check line of fire along FINAL direction (`this.currentDir`)
    const finalDirection = this.currentDir;
    const p2HasBullet =
      typeof bullets === 'boolean'
        ? bullets
        : Array.isArray(bullets)
        ? bullets.some((b) => b.ownerId === p2.id)
        : false;

    let shouldShoot = false;
    if (!p2HasBullet && this.shootCooldown <= 0) {
      // Check safety strictly along `finalDirection` AND current `p2.direction`
      const unsafeInFinalDir = this.isFriendlyInLineOfFire(p2, finalDirection, p1, terrain);
      const unsafeInCurrentDir = this.isFriendlyInLineOfFire(p2, p2.direction, p1, terrain);

      if (!unsafeInFinalDir && !unsafeInCurrentDir) {
        const enemyInLine = this.isEnemyInLineOfFire(p2, finalDirection, aliveEnemies, terrain);
        const brickInFront = this.isFacingDestructibleBrick(p2, finalDirection, terrain);
        if (enemyInLine || brickInFront) {
          shouldShoot = true;
        }
      }
    }

    return {
      direction: finalDirection,
      shouldShoot,
    };
  }
}
