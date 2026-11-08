/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type TankStructure,
  type Direction,
  type RuntimeTerrainState,
  type EnemyTank,
  type BulletStructure,
} from '../types.ts';
import {
  getTankHitbox,
  checkHitboxVsTerrain,
  trySafeGridSnap,
  checkTankVsTanks,
  intersectAABB,
} from '../physics.ts';

export interface AllyAIDecision {
  direction: Direction | null;
  shouldShoot: boolean;
}

export class AllyAIController {
  private shootCooldown: number = 0;
  private changeDirCooldown: number = 0;
  private currentDir: Direction = 'UP';

  public reset(): void {
    this.shootCooldown = 0.5;
    this.changeDirCooldown = 0;
    this.currentDir = 'UP';
  }

  /**
   * Evaluates if shooting in a given direction would hit an ally (P1 or the Eagle base).
   * Strictly prevents friendly fire.
   */
  public isFriendlyInLineOfFire(
    p2: TankStructure,
    dir: Direction = p2.direction,
    p1?: TankStructure | null,
    terrain?: RuntimeTerrainState
  ): boolean {
    // 1. Check if P1 is in line of fire
    if (p1 && p1.isAlive) {
      if (dir === 'UP' && p1.x >= p2.x - 12 && p1.x <= p2.x + 12 && p1.y < p2.y) {
        return true;
      }
      if (dir === 'DOWN' && p1.x >= p2.x - 12 && p1.x <= p2.x + 12 && p1.y > p2.y) {
        return true;
      }
      if (dir === 'LEFT' && p1.y >= p2.y - 12 && p1.y <= p2.y + 12 && p1.x < p2.x) {
        return true;
      }
      if (dir === 'RIGHT' && p1.y >= p2.y - 12 && p1.y <= p2.y + 12 && p1.x > p2.x) {
        return true;
      }
    }

    // 2. Check if Eagle Base at (96, 192) is in line of fire
    if (this.isBaseInLineOfFire(p2, dir)) {
      return true;
    }

    return false;
  }

  /**
   * Specifically checks if Eagle Base (96, 192) is directly ahead on bullet path.
   */
  public isBaseInLineOfFire(p2: TankStructure, dir: Direction = p2.direction): boolean {
    if (dir === 'DOWN' && p2.y < 192 && Math.abs(p2.x - 96) <= 16) {
      return true;
    }
    if (dir === 'LEFT' && p2.x > 112 && Math.abs(p2.y - 192) <= 16) {
      return true;
    }
    if (dir === 'RIGHT' && p2.x < 80 && Math.abs(p2.y - 192) <= 16) {
      return true;
    }
    return false;
  }

  /**
   * Checks if an enemy tank is in the direct line of sight for the given direction.
   */
  public isEnemyInLineOfFire(
    p2: TankStructure,
    dir: Direction,
    enemies: EnemyTank[],
    terrain: RuntimeTerrainState
  ): boolean {
    for (const enemy of enemies) {
      if (!enemy.isAlive) continue;

      if (dir === 'UP' && Math.abs(enemy.x - p2.x) <= 10 && enemy.y < p2.y) {
        return true;
      }
      if (dir === 'DOWN' && Math.abs(enemy.x - p2.x) <= 10 && enemy.y > p2.y) {
        return true;
      }
      if (dir === 'LEFT' && Math.abs(enemy.y - p2.y) <= 10 && enemy.x < p2.x) {
        return true;
      }
      if (dir === 'RIGHT' && Math.abs(enemy.y - p2.y) <= 10 && enemy.x > p2.x) {
        return true;
      }
    }
    return false;
  }

  /**
   * Main AI update loop per tick (dt in seconds).
   * Computes navigation and fire control.
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

    const aliveEnemies = enemies.filter((e) => e.isAlive);

    // 1. Find highest-threat enemy (prioritizing enemies closest to base: x=96, y=192)
    let primaryTarget: EnemyTank | null = null;
    let highestThreatScore = -Infinity;

    for (const enemy of aliveEnemies) {
      // Threat increases dramatically the closer the enemy is to the base
      const distToBase = Math.hypot(enemy.x - 96, enemy.y - 192);
      const threatScore = 1000 - distToBase;
      if (threatScore > highestThreatScore) {
        highestThreatScore = threatScore;
        primaryTarget = enemy;
      }
    }

    // 2. Determine target position:
    // If enemy is threatening base (y > 96), intercept enemy.
    // Otherwise, maintain defense patrol in lower-right zone near (144, 160) - (144, 192).
    let targetX = 144;
    let targetY = 160;

    if (primaryTarget) {
      targetX = primaryTarget.x;
      targetY = primaryTarget.y;
    }

    // 3. Direction Decision
    const allOtherTanks = [p1, ...aliveEnemies];

    if (this.changeDirCooldown <= 0) {
      const dx = targetX - p2.x;
      const dy = targetY - p2.y;

      const candidateDirs: Direction[] = [];

      // Primary axis
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy < 0) candidateDirs.push('UP', dx < 0 ? 'LEFT' : 'RIGHT', dx < 0 ? 'RIGHT' : 'LEFT', 'DOWN');
        else candidateDirs.push('DOWN', dx < 0 ? 'LEFT' : 'RIGHT', dx < 0 ? 'RIGHT' : 'LEFT', 'UP');
      } else {
        if (dx < 0) candidateDirs.push('LEFT', dy < 0 ? 'UP' : 'DOWN', dy < 0 ? 'DOWN' : 'UP', 'RIGHT');
        else candidateDirs.push('RIGHT', dy < 0 ? 'UP' : 'DOWN', dy < 0 ? 'DOWN' : 'UP', 'LEFT');
      }

      // Pick first navigable direction that does not ram into P1 or walls
      for (const cand of candidateDirs) {
        let testX = p2.x;
        let testY = p2.y;
        if (cand === 'UP') testY -= 4;
        if (cand === 'DOWN') testY += 4;
        if (cand === 'LEFT') testX -= 4;
        if (cand === 'RIGHT') testX += 4;

        // Boundary clamp
        if (testX < 0 || testX > 192 || testY < 0 || testY > 192) continue;

        const testBox = getTankHitbox(testX, testY);
        const terrColl = checkHitboxVsTerrain(testBox, terrain, { forBullet: false });
        if (terrColl.collides) continue;

        // Avoid colliding into P1
        if (p1 && p1.isAlive) {
          const p1Box = getTankHitbox(p1.x, p1.y);
          if (intersectAABB(testBox, p1Box)) continue;
        }

        this.currentDir = cand;
        this.changeDirCooldown = 0.4; // Hold direction for at least 0.4s to avoid jitter
        break;
      }
    }

    // 4. Shooting Decision
    let shouldShoot = false;
    const p2HasBullet = typeof bullets === 'boolean' ? bullets : (Array.isArray(bullets) ? bullets.some((b) => b.ownerId === p2.id) : false);

    if (!p2HasBullet && this.shootCooldown <= 0) {
      // Never shoot if P1 or base is in the line of fire!
      const friendlyInLine = this.isFriendlyInLineOfFire(p2, p2.direction, p1, terrain);

      if (!friendlyInLine) {
        const enemyInLine = this.isEnemyInLineOfFire(p2, p2.direction, aliveEnemies, terrain);
        // Shoot if enemy is lined up, or occasionally to clear brick obstacle blocking path to enemy
        if (enemyInLine) {
          shouldShoot = true;
          this.shootCooldown = 0.8; // 800ms reload
        } else if (Math.random() < 0.05) {
          shouldShoot = true;
          this.shootCooldown = 1.0;
        }
      }
    }

    return {
      direction: this.currentDir,
      shouldShoot,
    };
  }
}
