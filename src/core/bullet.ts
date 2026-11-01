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
import { applyDeterministicBulletImpact, destroyBase } from './terrain.ts';

export interface BulletUpdateResult {
  isAlive: boolean;
  hitObstacle?: boolean;
  hitSteel?: boolean;
  hitBase?: boolean;
  hitBrick?: boolean;
}

/**
 * Spawns a new bullet from P1 tank.
 * Strictly enforces maximum 1 active bullet for P1.
 */
export function spawnBullet(
  tank: TankStructure,
  activeBullet: BulletStructure | null
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

  return {
    id: `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ownerId: tank.id,
    x: bx,
    y: by,
    direction: tank.direction,
    speed: BULLET_CONFIG.SPEED_PX_S,
    power: 1,
  };
}

/**
 * Advances the bullet by 1 tick (160 / 60 ≈ 2.6667 px).
 * Tests collision with terrain, boundaries, brick sub-tiles, steel, and base.
 */
export function updateBullet(
  bullet: BulletStructure,
  terrain: RuntimeTerrainState
): BulletUpdateResult {
  const step = BULLET_CONFIG.SPEED_PX_TICK;

  if (bullet.direction === 'UP') bullet.y -= step;
  else if (bullet.direction === 'DOWN') bullet.y += step;
  else if (bullet.direction === 'LEFT') bullet.x -= step;
  else if (bullet.direction === 'RIGHT') bullet.x += step;

  const bulletBox = getBulletHitbox(bullet.x, bullet.y);
  const collision = checkHitboxVsTerrain(bulletBox, terrain, { forBullet: true });

  if (collision.isOutOfBounds) {
    return { isAlive: false, hitObstacle: true };
  }

  if (collision.collides && collision.hitTile) {
    const { row, col, type } = collision.hitTile;

    if (type === TILE_TYPES.BASE) {
      destroyBase(terrain);
      return { isAlive: false, hitObstacle: true, hitBase: true };
    }

    if (type === TILE_TYPES.STEEL) {
      // Steel is immune to tier 1 bullets
      return { isAlive: false, hitObstacle: true, hitSteel: true };
    }

    if (type === TILE_TYPES.BRICK) {
      const impactResult = applyDeterministicBulletImpact(
        terrain,
        row,
        col,
        bulletBox,
        bullet.direction
      );

      if (impactResult.hit) {
        return { isAlive: false, hitObstacle: true, hitBrick: true };
      }
      // If impactResult.hit is false, bullet is flying through already destroyed sub-tile opening!
    }
  }

  return { isAlive: true };
}
