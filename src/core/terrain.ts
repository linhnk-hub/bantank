/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, MAP_DIMENSIONS } from './constants.ts';
import {
  TILE_TYPES,
  SUB_TILE_MASKS,
  type StageMapMatrix,
  type RuntimeTerrainState,
  type Direction,
  type AABB,
} from './types.ts';

/**
 * Creates an isolated runtime clone of the stage map.
 * Never modifies the original STAGE_1_MAP.
 */
export function createRuntimeTerrainState(
  sourceMap: StageMapMatrix = STAGE_1_MAP
): RuntimeTerrainState {
  const currentMap: number[][] = [];
  const brickSubTiles: Record<string, number> = {};

  for (let r = 0; r < sourceMap.length; r++) {
    const row = sourceMap[r];
    const newRow: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const tileType = row[c];
      newRow.push(tileType);
      if (tileType === TILE_TYPES.BRICK) {
        brickSubTiles[`${r}_${c}`] = SUB_TILE_MASKS.ALL; // 15 = 0b1111
      }
    }
    currentMap.push(newRow);
  }

  return {
    currentMap,
    brickSubTiles,
    isBaseDestroyed: false,
  };
}

/**
 * Returns the 4-bit sub-tile mask for a brick at (row, col).
 * If the tile is not a brick or completely destroyed, returns 0.
 */
export function getBrickMask(
  state: RuntimeTerrainState,
  row: number,
  col: number
): number {
  if (
    row < 0 ||
    row >= MAP_DIMENSIONS.ROWS ||
    col < 0 ||
    col >= MAP_DIMENSIONS.COLS
  ) {
    return 0;
  }
  if (state.currentMap[row][col] !== TILE_TYPES.BRICK) {
    return 0;
  }
  return state.brickSubTiles[`${row}_${col}`] ?? 0;
}

/**
 * Clears specific sub-tile bits from a brick.
 * If all 4 bits become 0, the tile becomes EMPTY in currentMap.
 */
export function removeBrickSubTiles(
  state: RuntimeTerrainState,
  row: number,
  col: number,
  bitsToClear: number
): number {
  const key = `${row}_${col}`;
  const currentMask = state.brickSubTiles[key] ?? SUB_TILE_MASKS.ALL;
  const newMask = currentMask & ~bitsToClear;

  state.brickSubTiles[key] = newMask;
  if (newMask === 0) {
    state.currentMap[row][col] = TILE_TYPES.EMPTY;
  }
  return newMask;
}

/**
 * Marks the base as destroyed.
 */
export function destroyBase(state: RuntimeTerrainState): void {
  state.isBaseDestroyed = true;
}

/**
 * Deterministic Bullet-Brick destruction algorithm approved in design:
 * - Direction UP: impacts BL and/or BR. If both are already 0, passes through to TL and/or TR.
 * - Direction DOWN: impacts TL and/or TR. If both are already 0, passes through to BL and/or BR.
 * - Direction LEFT: impacts TR and/or BR. If both are already 0, passes through to TL and/or BL.
 * - Direction RIGHT: impacts TL and/or BL. If both are already 0, passes through to TR and/or BR.
 *
 * Boundary overlap rule:
 * - Entirely on one side -> destroy that sub-tile.
 * - Straddle unbalanced -> destroy the sub-tile with greater overlap.
 * - Straddle balanced -> destroy both sub-tiles.
 * - If only 1 intact sub-tile remains on the impact face and is touched -> destroy that remaining sub-tile.
 */
export function applyDeterministicBulletImpact(
  state: RuntimeTerrainState,
  row: number,
  col: number,
  bulletBox: AABB,
  direction: Direction
): { hit: boolean; destroyedMask: number; remainingMask: number } {
  const mask = getBrickMask(state, row, col);
  if (mask === 0) {
    return { hit: false, destroyedMask: 0, remainingMask: 0 };
  }

  const tileX = col * MAP_DIMENSIONS.TILE_SIZE_PX;
  const tileY = row * MAP_DIMENSIONS.TILE_SIZE_PX;
  const xMid = tileX + 8;
  const yMid = tileY + 8;

  let bitsToDestroy = 0;

  if (direction === 'UP') {
    // Approach bottom face: BL (bit 2) and BR (bit 3)
    const bottomFaceMask = mask & (SUB_TILE_MASKS.BL | SUB_TILE_MASKS.BR);
    let targetFace: 'bottom' | 'top' = 'bottom';

    if (bottomFaceMask === 0) {
      // Bottom face already destroyed, check top face: TL and TR
      targetFace = 'top';
    }

    const overlapLeft = Math.max(0, Math.min(bulletBox.right, xMid) - Math.max(bulletBox.left, tileX));
    const overlapRight = Math.max(0, Math.min(bulletBox.right, tileX + 16) - Math.max(bulletBox.left, xMid));

    const leftBit = targetFace === 'bottom' ? SUB_TILE_MASKS.BL : SUB_TILE_MASKS.TL;
    const rightBit = targetFace === 'bottom' ? SUB_TILE_MASKS.BR : SUB_TILE_MASKS.TR;

    const hasLeft = (mask & leftBit) !== 0;
    const hasRight = (mask & rightBit) !== 0;

    if (hasLeft && hasRight) {
      if (overlapLeft > 0 && overlapRight === 0) {
        bitsToDestroy = leftBit;
      } else if (overlapRight > 0 && overlapLeft === 0) {
        bitsToDestroy = rightBit;
      } else if (overlapLeft > overlapRight) {
        bitsToDestroy = leftBit; // Unbalanced: greater overlap
      } else if (overlapRight > overlapLeft) {
        bitsToDestroy = rightBit; // Unbalanced: greater overlap
      } else if (overlapLeft === overlapRight && overlapLeft > 0) {
        bitsToDestroy = leftBit | rightBit; // Balanced straddle: both
      }
    } else if (hasLeft && !hasRight) {
      if (overlapLeft > 0) bitsToDestroy = leftBit;
    } else if (!hasLeft && hasRight) {
      if (overlapRight > 0) bitsToDestroy = rightBit;
    }
  } else if (direction === 'DOWN') {
    // Approach top face: TL (bit 0) and TR (bit 1)
    const topFaceMask = mask & (SUB_TILE_MASKS.TL | SUB_TILE_MASKS.TR);
    let targetFace: 'top' | 'bottom' = 'top';

    if (topFaceMask === 0) {
      targetFace = 'bottom';
    }

    const overlapLeft = Math.max(0, Math.min(bulletBox.right, xMid) - Math.max(bulletBox.left, tileX));
    const overlapRight = Math.max(0, Math.min(bulletBox.right, tileX + 16) - Math.max(bulletBox.left, xMid));

    const leftBit = targetFace === 'top' ? SUB_TILE_MASKS.TL : SUB_TILE_MASKS.BL;
    const rightBit = targetFace === 'top' ? SUB_TILE_MASKS.TR : SUB_TILE_MASKS.BR;

    const hasLeft = (mask & leftBit) !== 0;
    const hasRight = (mask & rightBit) !== 0;

    if (hasLeft && hasRight) {
      if (overlapLeft > 0 && overlapRight === 0) {
        bitsToDestroy = leftBit;
      } else if (overlapRight > 0 && overlapLeft === 0) {
        bitsToDestroy = rightBit;
      } else if (overlapLeft > overlapRight) {
        bitsToDestroy = leftBit;
      } else if (overlapRight > overlapLeft) {
        bitsToDestroy = rightBit;
      } else if (overlapLeft === overlapRight && overlapLeft > 0) {
        bitsToDestroy = leftBit | rightBit;
      }
    } else if (hasLeft && !hasRight) {
      if (overlapLeft > 0) bitsToDestroy = leftBit;
    } else if (!hasLeft && hasRight) {
      if (overlapRight > 0) bitsToDestroy = rightBit;
    }
  } else if (direction === 'LEFT') {
    // Approach right face: TR (bit 1) and BR (bit 3)
    const rightFaceMask = mask & (SUB_TILE_MASKS.TR | SUB_TILE_MASKS.BR);
    let targetFace: 'right' | 'left' = 'right';

    if (rightFaceMask === 0) {
      targetFace = 'left';
    }

    const overlapTop = Math.max(0, Math.min(bulletBox.bottom, yMid) - Math.max(bulletBox.top, tileY));
    const overlapBottom = Math.max(0, Math.min(bulletBox.bottom, tileY + 16) - Math.max(bulletBox.top, yMid));

    const topBit = targetFace === 'right' ? SUB_TILE_MASKS.TR : SUB_TILE_MASKS.TL;
    const bottomBit = targetFace === 'right' ? SUB_TILE_MASKS.BR : SUB_TILE_MASKS.BL;

    const hasTop = (mask & topBit) !== 0;
    const hasBottom = (mask & bottomBit) !== 0;

    if (hasTop && hasBottom) {
      if (overlapTop > 0 && overlapBottom === 0) {
        bitsToDestroy = topBit;
      } else if (overlapBottom > 0 && overlapTop === 0) {
        bitsToDestroy = bottomBit;
      } else if (overlapTop > overlapBottom) {
        bitsToDestroy = topBit;
      } else if (overlapBottom > overlapTop) {
        bitsToDestroy = bottomBit;
      } else if (overlapTop === overlapBottom && overlapTop > 0) {
        bitsToDestroy = topBit | bottomBit;
      }
    } else if (hasTop && !hasBottom) {
      if (overlapTop > 0) bitsToDestroy = topBit;
    } else if (!hasTop && hasBottom) {
      if (overlapBottom > 0) bitsToDestroy = bottomBit;
    }
  } else if (direction === 'RIGHT') {
    // Approach left face: TL (bit 0) and BL (bit 2)
    const leftFaceMask = mask & (SUB_TILE_MASKS.TL | SUB_TILE_MASKS.BL);
    let targetFace: 'left' | 'right' = 'left';

    if (leftFaceMask === 0) {
      targetFace = 'right';
    }

    const overlapTop = Math.max(0, Math.min(bulletBox.bottom, yMid) - Math.max(bulletBox.top, tileY));
    const overlapBottom = Math.max(0, Math.min(bulletBox.bottom, tileY + 16) - Math.max(bulletBox.top, yMid));

    const topBit = targetFace === 'left' ? SUB_TILE_MASKS.TL : SUB_TILE_MASKS.TR;
    const bottomBit = targetFace === 'left' ? SUB_TILE_MASKS.BL : SUB_TILE_MASKS.BR;

    const hasTop = (mask & topBit) !== 0;
    const hasBottom = (mask & bottomBit) !== 0;

    if (hasTop && hasBottom) {
      if (overlapTop > 0 && overlapBottom === 0) {
        bitsToDestroy = topBit;
      } else if (overlapBottom > 0 && overlapTop === 0) {
        bitsToDestroy = bottomBit;
      } else if (overlapTop > overlapBottom) {
        bitsToDestroy = topBit;
      } else if (overlapBottom > overlapTop) {
        bitsToDestroy = bottomBit;
      } else if (overlapTop === overlapBottom && overlapTop > 0) {
        bitsToDestroy = topBit | bottomBit;
      }
    } else if (hasTop && !hasBottom) {
      if (overlapTop > 0) bitsToDestroy = topBit;
    } else if (!hasTop && hasBottom) {
      if (overlapBottom > 0) bitsToDestroy = bottomBit;
    }
  }

  if (bitsToDestroy > 0) {
    const remainingMask = removeBrickSubTiles(state, row, col, bitsToDestroy);
    return { hit: true, destroyedMask: bitsToDestroy, remainingMask };
  }

  return { hit: false, destroyedMask: 0, remainingMask: mask };
}
