/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS, TANK_CONFIG, BULLET_CONFIG } from './constants.ts';
import {
  TILE_TYPES,
  SUB_TILE_MASKS,
  type AABB,
  type Direction,
  type RuntimeTerrainState,
} from './types.ts';
import { getBrickMask } from './terrain.ts';

/**
 * Checks intersection of two half-open intervals:
 * [left, right) × [top, bottom)
 * Flush contact (e.g., right === left) returns FALSE (does NOT intersect).
 */
export function intersectAABB(a: AABB, b: AABB): boolean {
  return (
    Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
    Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom)
  );
}

/**
 * Returns the 14x14 hitbox for a tank with sprite at (x, y).
 * Inset by 1 px on each edge:
 * left = x + 1, right = x + 15
 * top = y + 1, bottom = y + 15
 */
export function getTankHitbox(x: number, y: number): AABB {
  return {
    left: x + TANK_CONFIG.HITBOX_INSET,
    right: x + TANK_CONFIG.SPRITE_SIZE - TANK_CONFIG.HITBOX_INSET,
    top: y + TANK_CONFIG.HITBOX_INSET,
    bottom: y + TANK_CONFIG.SPRITE_SIZE - TANK_CONFIG.HITBOX_INSET,
  };
}

/**
 * Returns the 4x4 hitbox for a bullet at (x, y).
 */
export function getBulletHitbox(x: number, y: number): AABB {
  return {
    left: x,
    right: x + BULLET_CONFIG.SIZE,
    top: y,
    bottom: y + BULLET_CONFIG.SIZE,
  };
}

export interface TerrainCollisionResult {
  collides: boolean;
  isOutOfBounds: boolean;
  hitTile?: {
    row: number;
    col: number;
    type: number;
    mask?: number;
  };
}

/**
 * Tests collision of an AABB against the terrain and boundaries.
 */
export function checkHitboxVsTerrain(
  box: AABB,
  terrain: RuntimeTerrainState,
  options: { forBullet?: boolean; direction?: Direction } = {}
): TerrainCollisionResult {
  const { forBullet = false, direction } = options;
  const totalW = MAP_DIMENSIONS.TOTAL_WIDTH_PX;
  const totalH = MAP_DIMENSIONS.TOTAL_HEIGHT_PX;

  // Boundary check
  if (box.left < 0 || box.right > totalW || box.top < 0 || box.bottom > totalH) {
    return { collides: true, isOutOfBounds: true };
  }

  const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;
  const minCol = Math.max(0, Math.floor(box.left / tileSize));
  const maxCol = Math.min(MAP_DIMENSIONS.COLS - 1, Math.floor((box.right - 0.0001) / tileSize));
  const minRow = Math.max(0, Math.floor(box.top / tileSize));
  const maxRow = Math.min(MAP_DIMENSIONS.ROWS - 1, Math.floor((box.bottom - 0.0001) / tileSize));

  // Determine row and col iteration order based on flight direction for bullets
  const rowIndices: number[] = [];
  if (forBullet && direction === 'UP') {
    for (let r = maxRow; r >= minRow; r--) rowIndices.push(r);
  } else {
    for (let r = minRow; r <= maxRow; r++) rowIndices.push(r);
  }

  const colIndices: number[] = [];
  if (forBullet && direction === 'LEFT') {
    for (let c = maxCol; c >= minCol; c--) colIndices.push(c);
  } else {
    for (let c = minCol; c <= maxCol; c++) colIndices.push(c);
  }

  let baseHitResult: TerrainCollisionResult | null = null;

  for (const r of rowIndices) {
    for (const c of colIndices) {
      const tileType = terrain.currentMap[r][c];

      // EMPTY: no collision
      if (tileType === TILE_TYPES.EMPTY) {
        continue;
      }

      // GRASS & ICE: always pass-through for both tank and bullet
      if (tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.ICE) {
        continue;
      }

      // WATER: bullets pass through, tanks are blocked
      if (tileType === TILE_TYPES.WATER) {
        if (forBullet) {
          continue;
        } else {
          const tileBox: AABB = {
            left: c * tileSize,
            right: (c + 1) * tileSize,
            top: r * tileSize,
            bottom: (r + 1) * tileSize,
          };
          if (intersectAABB(box, tileBox)) {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType },
            };
          }
          continue;
        }
      }

      // BRICK: check individual 8x8 sub-tiles first
      if (tileType === TILE_TYPES.BRICK) {
        const mask = getBrickMask(terrain, r, c);
        if (mask === 0) {
          continue; // completely destroyed -> EMPTY
        }

        const tileX = c * tileSize;
        const tileY = r * tileSize;

        // TL (Bit 0)
        if (mask & SUB_TILE_MASKS.TL) {
          const subBox: AABB = { left: tileX, right: tileX + 8, top: tileY, bottom: tileY + 8 };
          if (intersectAABB(box, subBox)) {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType, mask },
            };
          }
        }

        // TR (Bit 1)
        if (mask & SUB_TILE_MASKS.TR) {
          const subBox: AABB = { left: tileX + 8, right: tileX + 16, top: tileY, bottom: tileY + 8 };
          if (intersectAABB(box, subBox)) {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType, mask },
            };
          }
        }

        // BL (Bit 2)
        if (mask & SUB_TILE_MASKS.BL) {
          const subBox: AABB = { left: tileX, right: tileX + 8, top: tileY + 8, bottom: tileY + 16 };
          if (intersectAABB(box, subBox)) {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType, mask },
            };
          }
        }

        // BR (Bit 3)
        if (mask & SUB_TILE_MASKS.BR) {
          const subBox: AABB = { left: tileX + 8, right: tileX + 16, top: tileY + 8, bottom: tileY + 16 };
          if (intersectAABB(box, subBox)) {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType, mask },
            };
          }
        }
        continue;
      }

      // STEEL: blocks both
      if (tileType === TILE_TYPES.STEEL) {
        const tileBox: AABB = {
          left: c * tileSize,
          right: (c + 1) * tileSize,
          top: r * tileSize,
          bottom: (r + 1) * tileSize,
        };
        if (intersectAABB(box, tileBox)) {
          return {
            collides: true,
            isOutOfBounds: false,
            hitTile: { row: r, col: c, type: tileType },
          };
        }
        continue;
      }

      // BASE: if bullet touches base, delay returning until all brick checks in this bounding box finish
      if (tileType === TILE_TYPES.BASE) {
        const tileBox: AABB = {
          left: c * tileSize,
          right: (c + 1) * tileSize,
          top: r * tileSize,
          bottom: (r + 1) * tileSize,
        };
        if (intersectAABB(box, tileBox)) {
          if (forBullet) {
            // Buffer base hit: if an intact brick is found in the same or adjacent overlapping cells, brick takes precedence!
            if (!baseHitResult) {
              baseHitResult = {
                collides: true,
                isOutOfBounds: false,
                hitTile: { row: r, col: c, type: tileType },
              };
            }
          } else {
            return {
              collides: true,
              isOutOfBounds: false,
              hitTile: { row: r, col: c, type: tileType },
            };
          }
        }
        continue;
      }
    }
  }

  // If a buffered base collision occurred and was not overridden by an intact brick sub-tile
  if (baseHitResult) {
    return baseHitResult;
  }

  return { collides: false, isOutOfBounds: false };
}

/**
 * Safe Grid Snapping Algorithm:
 * When turning perpendicular:
 * - Computes nearest 16px grid line.
 * - If offset <= SNAP_THRESHOLD (4px):
 *   Evaluates candidate position after snapping AND taking 1 step in requested direction.
 *   If candidate position collides with any obstacle, the snap & turn are REJECTED!
 */
export function trySafeGridSnap(
  currentX: number,
  currentY: number,
  currentDir: Direction,
  requestedDir: Direction,
  terrain: RuntimeTerrainState
): { success: boolean; snappedX: number; snappedY: number } {
  let candidateX = currentX;
  let candidateY = currentY;

  if (requestedDir === 'LEFT' || requestedDir === 'RIGHT') {
    // Moving horizontally: snap Y to nearest 16px grid line
    const targetY = Math.round(currentY / 16) * 16;
    const diff = Math.abs(currentY - targetY);
    if (diff > 0 && diff <= TANK_CONFIG.SNAP_THRESHOLD) {
      candidateY = targetY;
    } else if (diff > TANK_CONFIG.SNAP_THRESHOLD) {
      const isPerpendicular = currentDir === 'UP' || currentDir === 'DOWN';
      if (isPerpendicular) {
        return { success: false, snappedX: currentX, snappedY: currentY };
      }
    }
  } else {
    // Moving vertically: snap X to nearest 16px grid line
    const targetX = Math.round(currentX / 16) * 16;
    const diff = Math.abs(currentX - targetX);
    if (diff > 0 && diff <= TANK_CONFIG.SNAP_THRESHOLD) {
      candidateX = targetX;
    } else if (diff > TANK_CONFIG.SNAP_THRESHOLD) {
      const isPerpendicular = currentDir === 'LEFT' || currentDir === 'RIGHT';
      if (isPerpendicular) {
        return { success: false, snappedX: currentX, snappedY: currentY };
      }
    }
  }

  // Safety Check: Verify that the candidate position after snapping and moving 1 tick (1 px) is collision-free
  let stepX = candidateX;
  let stepY = candidateY;
  if (requestedDir === 'UP') stepY -= TANK_CONFIG.SPEED_PX_TICK;
  if (requestedDir === 'DOWN') stepY += TANK_CONFIG.SPEED_PX_TICK;
  if (requestedDir === 'LEFT') stepX -= TANK_CONFIG.SPEED_PX_TICK;
  if (requestedDir === 'RIGHT') stepX += TANK_CONFIG.SPEED_PX_TICK;

  // Clamping to map boundaries [0, 192]
  if (stepX < 0 || stepX > TANK_CONFIG.MAX_X || stepY < 0 || stepY > TANK_CONFIG.MAX_Y) {
    return { success: false, snappedX: currentX, snappedY: currentY };
  }

  const candidateHitbox = getTankHitbox(stepX, stepY);
  const collision = checkHitboxVsTerrain(candidateHitbox, terrain, { forBullet: false });

  if (collision.collides) {
    // Candidate position hits an obstacle -> Snap REJECTED!
    return { success: false, snappedX: currentX, snappedY: currentY };
  }

  return { success: true, snappedX: candidateX, snappedY: candidateY };
}

/**
 * Checks if a tank hitbox collides with any other active tank.
 * Prevents tanks from overlapping or pushing through each other.
 */
export function checkTankVsTanks(
  selfId: string,
  box: AABB,
  otherTanks?: Array<{ id: string; x: number; y: number; isAlive?: boolean }>
): boolean {
  if (!otherTanks || otherTanks.length === 0) return false;
  for (const other of otherTanks) {
    if (other.id === selfId || other.isAlive === false) continue;
    const otherBox = getTankHitbox(other.x, other.y);
    if (intersectAABB(box, otherBox)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if two bullets intersect (head-on collision cancellation).
 */
export function checkBulletVsBullet(
  bulletA: { x: number; y: number },
  bulletB: { x: number; y: number }
): boolean {
  const boxA = getBulletHitbox(bulletA.x, bulletA.y);
  const boxB = getBulletHitbox(bulletB.x, bulletB.y);
  return intersectAABB(boxA, boxB);
}

