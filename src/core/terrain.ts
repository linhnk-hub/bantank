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
  const initialMap: number[][] = [];
  const brickSubTiles: Record<string, number> = {};

  for (let r = 0; r < sourceMap.length; r++) {
    const row = sourceMap[r];
    const newRow: number[] = [];
    const initRow: number[] = [];
    for (let c = 0; c < row.length; c++) {
      const tileType = row[c];
      newRow.push(tileType);
      initRow.push(tileType);
      if (tileType === TILE_TYPES.BRICK) {
        brickSubTiles[`${r}_${c}`] = SUB_TILE_MASKS.ALL; // 15 = 0b1111
      }
    }
    currentMap.push(newRow);
    initialMap.push(initRow);
  }

  return {
    currentMap,
    initialMap,
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
    const overlapLeft = Math.max(0, Math.min(bulletBox.right, xMid) - Math.max(bulletBox.left, tileX));
    const overlapRight = Math.max(0, Math.min(bulletBox.right, tileX + 16) - Math.max(bulletBox.left, xMid));

    // Left column candidate: BL (front face) or TL (rear face)
    let leftCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.BL) {
      leftCandidateBit = SUB_TILE_MASKS.BL;
    } else if (bulletBox.top < yMid && (mask & SUB_TILE_MASKS.TL)) {
      leftCandidateBit = SUB_TILE_MASKS.TL;
    }

    // Right column candidate: BR (front face) or TR (rear face)
    let rightCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.BR) {
      rightCandidateBit = SUB_TILE_MASKS.BR;
    } else if (bulletBox.top < yMid && (mask & SUB_TILE_MASKS.TR)) {
      rightCandidateBit = SUB_TILE_MASKS.TR;
    }

    if (overlapLeft > 0 && overlapRight > 0) {
      if (leftCandidateBit !== 0 && rightCandidateBit !== 0) {
        if (overlapLeft > overlapRight) {
          bitsToDestroy = leftCandidateBit;
        } else if (overlapRight > overlapLeft) {
          bitsToDestroy = rightCandidateBit;
        } else {
          bitsToDestroy = leftCandidateBit | rightCandidateBit;
        }
      } else if (leftCandidateBit !== 0) {
        bitsToDestroy = leftCandidateBit;
      } else if (rightCandidateBit !== 0) {
        bitsToDestroy = rightCandidateBit;
      }
    } else if (overlapLeft > 0 && leftCandidateBit !== 0) {
      bitsToDestroy = leftCandidateBit;
    } else if (overlapRight > 0 && rightCandidateBit !== 0) {
      bitsToDestroy = rightCandidateBit;
    }
  } else if (direction === 'DOWN') {
    const overlapLeft = Math.max(0, Math.min(bulletBox.right, xMid) - Math.max(bulletBox.left, tileX));
    const overlapRight = Math.max(0, Math.min(bulletBox.right, tileX + 16) - Math.max(bulletBox.left, xMid));

    // Left column candidate: TL (front face) or BL (rear face)
    let leftCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.TL) {
      leftCandidateBit = SUB_TILE_MASKS.TL;
    } else if (bulletBox.bottom > yMid && (mask & SUB_TILE_MASKS.BL)) {
      leftCandidateBit = SUB_TILE_MASKS.BL;
    }

    // Right column candidate: TR (front face) or BR (rear face)
    let rightCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.TR) {
      rightCandidateBit = SUB_TILE_MASKS.TR;
    } else if (bulletBox.bottom > yMid && (mask & SUB_TILE_MASKS.BR)) {
      rightCandidateBit = SUB_TILE_MASKS.BR;
    }

    if (overlapLeft > 0 && overlapRight > 0) {
      if (leftCandidateBit !== 0 && rightCandidateBit !== 0) {
        if (overlapLeft > overlapRight) {
          bitsToDestroy = leftCandidateBit;
        } else if (overlapRight > overlapLeft) {
          bitsToDestroy = rightCandidateBit;
        } else {
          bitsToDestroy = leftCandidateBit | rightCandidateBit;
        }
      } else if (leftCandidateBit !== 0) {
        bitsToDestroy = leftCandidateBit;
      } else if (rightCandidateBit !== 0) {
        bitsToDestroy = rightCandidateBit;
      }
    } else if (overlapLeft > 0 && leftCandidateBit !== 0) {
      bitsToDestroy = leftCandidateBit;
    } else if (overlapRight > 0 && rightCandidateBit !== 0) {
      bitsToDestroy = rightCandidateBit;
    }
  } else if (direction === 'LEFT') {
    const overlapTop = Math.max(0, Math.min(bulletBox.bottom, yMid) - Math.max(bulletBox.top, tileY));
    const overlapBottom = Math.max(0, Math.min(bulletBox.bottom, tileY + 16) - Math.max(bulletBox.top, yMid));

    // Top row candidate: TR (front face) or TL (rear face)
    let topCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.TR) {
      topCandidateBit = SUB_TILE_MASKS.TR;
    } else if (bulletBox.left < xMid && (mask & SUB_TILE_MASKS.TL)) {
      topCandidateBit = SUB_TILE_MASKS.TL;
    }

    // Bottom row candidate: BR (front face) or BL (rear face)
    let bottomCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.BR) {
      bottomCandidateBit = SUB_TILE_MASKS.BR;
    } else if (bulletBox.left < xMid && (mask & SUB_TILE_MASKS.BL)) {
      bottomCandidateBit = SUB_TILE_MASKS.BL;
    }

    if (overlapTop > 0 && overlapBottom > 0) {
      if (topCandidateBit !== 0 && bottomCandidateBit !== 0) {
        if (overlapTop > overlapBottom) {
          bitsToDestroy = topCandidateBit;
        } else if (overlapBottom > overlapTop) {
          bitsToDestroy = bottomCandidateBit;
        } else {
          bitsToDestroy = topCandidateBit | bottomCandidateBit;
        }
      } else if (topCandidateBit !== 0) {
        bitsToDestroy = topCandidateBit;
      } else if (bottomCandidateBit !== 0) {
        bitsToDestroy = bottomCandidateBit;
      }
    } else if (overlapTop > 0 && topCandidateBit !== 0) {
      bitsToDestroy = topCandidateBit;
    } else if (overlapBottom > 0 && bottomCandidateBit !== 0) {
      bitsToDestroy = bottomCandidateBit;
    }
  } else if (direction === 'RIGHT') {
    const overlapTop = Math.max(0, Math.min(bulletBox.bottom, yMid) - Math.max(bulletBox.top, tileY));
    const overlapBottom = Math.max(0, Math.min(bulletBox.bottom, tileY + 16) - Math.max(bulletBox.top, yMid));

    // Top row candidate: TL (front face) or TR (rear face)
    let topCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.TL) {
      topCandidateBit = SUB_TILE_MASKS.TL;
    } else if (bulletBox.right > xMid && (mask & SUB_TILE_MASKS.TR)) {
      topCandidateBit = SUB_TILE_MASKS.TR;
    }

    // Bottom row candidate: BL (front face) or BR (rear face)
    let bottomCandidateBit = 0;
    if (mask & SUB_TILE_MASKS.BL) {
      bottomCandidateBit = SUB_TILE_MASKS.BL;
    } else if (bulletBox.right > xMid && (mask & SUB_TILE_MASKS.BR)) {
      bottomCandidateBit = SUB_TILE_MASKS.BR;
    }

    if (overlapTop > 0 && overlapBottom > 0) {
      if (topCandidateBit !== 0 && bottomCandidateBit !== 0) {
        if (overlapTop > overlapBottom) {
          bitsToDestroy = topCandidateBit;
        } else if (overlapBottom > overlapTop) {
          bitsToDestroy = bottomCandidateBit;
        } else {
          bitsToDestroy = topCandidateBit | bottomCandidateBit;
        }
      } else if (topCandidateBit !== 0) {
        bitsToDestroy = topCandidateBit;
      } else if (bottomCandidateBit !== 0) {
        bitsToDestroy = bottomCandidateBit;
      }
    } else if (overlapTop > 0 && topCandidateBit !== 0) {
      bitsToDestroy = topCandidateBit;
    } else if (overlapBottom > 0 && bottomCandidateBit !== 0) {
      bitsToDestroy = bottomCandidateBit;
    }
  }

  if (bitsToDestroy > 0) {
    const remainingMask = removeBrickSubTiles(state, row, col, bitsToDestroy);
    return { hit: true, destroyedMask: bitsToDestroy, remainingMask };
  }

  return { hit: false, destroyedMask: 0, remainingMask: mask };
}
