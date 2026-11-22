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

export function createP2Tank(): TankStructure {
  return {
    id: 'p2',
    x: 144,
    y: 192,
    direction: 'UP',
    speed: TANK_CONFIG.SPEED_PX_S,
    type: 'player2',
    tier: 1,
    isAlive: true,
    isShielded: true,
  };
}

/**
 * Updates tank position and orientation based on user input.
 * Fixed movement: 1.0 px per tick at 60Hz (or 2.0 px/tick with SPEED_BOOST).
 */
export function updateTankMovement(
  tank: TankStructure,
  input: InputState,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number; isAlive: boolean }>,
  speedMultiplier: number = 1
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

  // 2. Calculate movement step (1.0 px/tick normal, 2.0 px/tick with SPEED_BOOST)
  const effectiveMult = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
  const baseStep = TANK_CONFIG.SPEED_PX_TICK;
  const fullStep = baseStep * effectiveMult;

  const tryStepMove = (stepDist: number): boolean => {
    let nextX = tank.x;
    let nextY = tank.y;

    if (tank.direction === 'UP') nextY -= stepDist;
    else if (tank.direction === 'DOWN') nextY += stepDist;
    else if (tank.direction === 'LEFT') nextX -= stepDist;
    else if (tank.direction === 'RIGHT') nextX += stepDist;

    // 3. Map boundary clamp [0, 192]
    nextX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, nextX));
    nextY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, nextY));

    if (nextX === tank.x && nextY === tank.y) {
      return false;
    }

    // 4. Test collision at next position (tanks pass through other tanks to prevent movement jams)
    const nextHitbox = getTankHitbox(nextX, nextY);
    const collision = checkHitboxVsTerrain(nextHitbox, terrain, { forBullet: false });
    void otherTanks;
    void checkTankVsTanks;

    if (!collision.collides) {
      tank.x = nextX;
      tank.y = nextY;
      return true;
    }
    return false;
  };

  if (!tryStepMove(fullStep) && effectiveMult > 1) {
    // Fallback to 1.0px step if 2.0px was blocked by 1px remaining clearance to wall/tank
    tryStepMove(baseStep);
  }
}
