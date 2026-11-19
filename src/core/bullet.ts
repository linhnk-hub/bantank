/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BULLET_CONFIG } from './constants.ts';
import {
  TILE_TYPES,
  type BulletStructure,
  type TankStructure,
  type RuntimeTerrainState,
} from './types.ts';
import { getBulletHitbox, checkHitboxVsTerrain } from './physics.ts';
import { applyDeterministicBulletImpact, applyPowerSteelImpact, destroyBase } from './terrain.ts';

export interface BulletUpdateResult {
  isAlive: boolean;
  hitObstacle?: boolean;
  hitSteel?: boolean;
  hitBase?: boolean;
  hitBrick?: boolean;
}

/**
 * Spawns a new bullet from P1/P2/Enemy tank.
 * Strictly enforces maximum 1 active bullet per tank.
 */
export function spawnBullet(
  tank: TankStructure,
  activeBullet: BulletStructure | null,
  options?: { hasFirepower?: boolean }
): BulletStructure | null {
  if (activeBullet !== null) {
    return null; // Maximum 1 active bullet enforced
  }

  let bx = tank.x;
  let by = tank.y;

  if (tank.direction === 'UP') {
    bx = tank.x + 6;
    by = tank.y - BULLET_CONFIG.SIZE;
  } else if (tank.direction === 'DOWN') {
    bx = tank.x + 6;
    by = tank.y + 16;
  } else if (tank.direction === 'LEFT') {
    bx = tank.x - BULLET_CONFIG.SIZE;
    by = tank.y + 6;
  } else if (tank.direction === 'RIGHT') {
    bx = tank.x + 16;
    by = tank.y + 6;
  }

  const isPowerEnemy = (tank as { enemyType?: string }).enemyType === 'POWER';
  const bulletPower = isPowerEnemy || options?.hasFirepower ? 2 : 1;

  return {
    id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ownerId: tank.id,
    x: bx,
    y: by,
    direction: tank.direction,
    speed: BULLET_CONFIG.SPEED_PX_S,
    power: bulletPower,
  };
}

/**
 * Advances the bullet by 1 tick (160 / 60 ≈ 2.6667 px).
 * Tests collision with terrain, boundaries, brick sub-tiles, steel, and base.
 */
export function updateBullet(
  bullet: BulletStructure,
  terrain: RuntimeTerrainState,
  options?: { isProtectedEagleShieldTile?: (row: number, col: number) => boolean }
): BulletUpdateResult {
  const step = BULLET_CONFIG.SPEED_PX_TICK;

  if (bullet.direction === 'UP') bullet.y -= step;
  else if (bullet.direction === 'DOWN') bullet.y += step;
  else if (bullet.direction === 'LEFT') bullet.x -= step;
  else if (bullet.direction === 'RIGHT') bullet.x += step;

  const bulletBox = getBulletHitbox(bullet.x, bullet.y);
  const collision = checkHitboxVsTerrain(bulletBox, terrain, {
    forBullet: true,
    direction: bullet.direction,
  });

  if (collision.isOutOfBounds) {
    return { isAlive: false, hitObstacle: true };
  }

  if (collision.collides && collision.hitTile) {
    const { row, col, type } = collision.hitTile;

    if (type === TILE_TYPES.BASE) {
      // Friendly-fire protection: P2 ally bullets NEVER destroy the Eagle Base!
      // P1 and enemy bullets retain pre-M7.3 approved Game Core behavior.
      if (bullet.ownerId === 'p2') {
        return { isAlive: false, hitObstacle: true, hitBase: false };
      }
      destroyBase(terrain);
      return { isAlive: false, hitObstacle: true, hitBase: true };
    }

    if (type === TILE_TYPES.STEEL) {
      // Power tank bullets & Player FIREPOWER bullets (power >= 2) destroy 50% of a steel wall tile per hit,
      // EXCEPT Eagle-Shield-protected side walls (12,5) and (12,7) while the 10s shield is active!
      const isBaseShieldTile = row >= 11 && col >= 5 && col <= 7;
      const isEagleShieldProtected = options?.isProtectedEagleShieldTile?.(row, col) ?? false;
      if ((bullet.power ?? 1) >= 2 && !isEagleShieldProtected && !(bullet.ownerId === 'p2' && isBaseShieldTile)) {
        applyPowerSteelImpact(terrain, row, col, bullet.direction);
      }
      return { isAlive: false, hitObstacle: true, hitSteel: true };
    }

    if (type === TILE_TYPES.BRICK) {
      // P2 ally bullets never chip away the immediate brick shield around the Eagle Base (rows 11..12, cols 5..7)
      const isBaseShieldBrick = row >= 11 && col >= 5 && col <= 7;
      if (bullet.ownerId === 'p2' && isBaseShieldBrick) {
        return { isAlive: false, hitObstacle: true, hitBrick: false };
      }

      const impactResult = applyDeterministicBulletImpact(
        terrain,
        row,
        col,
        bulletBox,
        bullet.direction,
        bullet.power ?? 1
      );

      if (impactResult.hit) {
        return { isAlive: false, hitObstacle: true, hitBrick: true };
      }
      // If impactResult.hit is false, bullet is flying through already destroyed sub-tile opening!
    }
  }

  return { isAlive: true };
}
