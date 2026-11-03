/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TANK_CONFIG } from './constants.ts';
import {
  type TankStructure,
  type Direction,
  type InputState,
  type RuntimeTerrainState,
} from './types.ts';
import { getTankHitbox, checkHitboxVsTerrain, trySafeGridSnap, checkTankVsTanks } from './physics.ts';

export function createP1Tank(): TankStructure {
  return {
    id: 'p1',
    x: TANK_CONFIG.SPAWN.x,
    y: TANK_CONFIG.SPAWN.y,
    direction: TANK_CONFIG.SPAWN.direction,
    speed: TANK_CONFIG.SPEED_PX_S,
    type: 'player',
    tier: 1,
    isAlive: true,
    isShielded: false,
  };
}

/**
 * Updates tank position and orientation based on user input.
 * Fixed movement: exactly 1.0 px per tick at 60Hz.
 */
export function updateTankMovement(
  tank: TankStructure,
  input: InputState,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number; isAlive: boolean }>
): void {
  if (!tank.isAlive) return;

  let requestedDir: Direction | null = null;

  // Single direction resolution
  if (input.up) requestedDir = 'UP';
  else if (input.down) requestedDir = 'DOWN';
  else if (input.left) requestedDir = 'LEFT';
  else if (input.right) requestedDir = 'RIGHT';

  if (!requestedDir) return;

  // 1. Try safe grid snap if changing direction
  const snapResult = trySafeGridSnap(
    tank.x,
    tank.y,
    tank.direction,
    requestedDir,
    terrain
  );

  if (snapResult.success) {
    tank.x = snapResult.snappedX;
    tank.y = snapResult.snappedY;
    tank.direction = requestedDir;
  } else {
    // If perpendicular snap failed, keep current direction or don't turn into wall
    tank.direction = requestedDir;
  }

  // 2. Calculate movement step (1.0 px/tick)
  let nextX = tank.x;
  let nextY = tank.y;
  const step = TANK_CONFIG.SPEED_PX_TICK;

  if (tank.direction === 'UP') nextY -= step;
  else if (tank.direction === 'DOWN') nextY += step;
  else if (tank.direction === 'LEFT') nextX -= step;
  else if (tank.direction === 'RIGHT') nextX += step;

  // 3. Map boundary clamp [0, 192]
  nextX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, nextX));
  nextY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, nextY));

  // If boundary clamped immediately with no change
  if (nextX === tank.x && nextY === tank.y) {
    return;
  }

  // 4. Test collision at next position
  const nextHitbox = getTankHitbox(nextX, nextY);
  const collision = checkHitboxVsTerrain(nextHitbox, terrain, { forBullet: false });

  // 5. Test Tank-to-Tank collision if other tanks are provided
  const tankConflict = otherTanks ? checkTankVsTanks(tank.id, nextHitbox, otherTanks) : false;

  if (!collision.collides && !tankConflict) {
    tank.x = nextX;
    tank.y = nextY;
  }
}
