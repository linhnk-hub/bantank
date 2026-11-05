/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS } from '../constants.ts';
import { TILE_TYPES, type RuntimeTerrainState } from '../types.ts';
import { getBrickMask } from '../terrain.ts';

export interface GridPoint {
  c: number;
  r: number;
}

export interface PathNode {
  c: number;
  r: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

/**
 * Checks whether a tile (c, r) is walkable by an enemy tank.
 * Cannot walk through:
 * - Boundaries (outside 0..12)
 * - STEEL (2), WATER (3), BASE (9)
 * - BRICK (1) if mask > 0
 * - Optional dynamic tank obstacles
 */
export function isTileWalkable(
  c: number,
  r: number,
  terrain: RuntimeTerrainState,
  blockedTiles?: Set<string>
): boolean {
  if (c < 0 || c >= MAP_DIMENSIONS.COLS || r < 0 || r >= MAP_DIMENSIONS.ROWS) {
    return false;
  }

  if (blockedTiles && blockedTiles.has(`${r}_${c}`)) {
    return false;
  }

  const tileType = terrain.currentMap[r][c];
  if (tileType === TILE_TYPES.EMPTY || tileType === TILE_TYPES.GRASS || tileType === TILE_TYPES.ICE) {
    return true;
  }

  if (tileType === TILE_TYPES.BRICK) {
    const mask = getBrickMask(terrain, r, c);
    return mask === 0; // Only walkable if all 4 sub-tiles are destroyed
  }

  // STEEL, WATER, BASE are impassable
  return false;
}

/**
 * A* Pathfinding on 13x13 grid in 4 cardinal directions.
 * Returns array of pixel coordinates { x: c * 16, y: r * 16 } to traverse.
 */
export function findPathAStar(
  startPixel: { x: number; y: number },
  targetPixel: { x: number; y: number },
  terrain: RuntimeTerrainState,
  blockedTanks?: Array<{ x: number; y: number; id: string }>,
  selfId?: string
): Array<{ x: number; y: number }> {
  const startC = Math.max(0, Math.min(12, Math.round(startPixel.x / 16)));
  const startR = Math.max(0, Math.min(12, Math.round(startPixel.y / 16)));
  const targetC = Math.max(0, Math.min(12, Math.round(targetPixel.x / 16)));
  const targetR = Math.max(0, Math.min(12, Math.round(targetPixel.y / 16)));

  if (startC === targetC && startR === targetR) {
    return [{ x: targetC * 16, y: targetR * 16 }];
  }

  // Build set of other tanks blocking tiles
  const blockedTiles = new Set<string>();
  if (blockedTanks) {
    for (const t of blockedTanks) {
      if (selfId && t.id === selfId) continue;
      const tc = Math.round(t.x / 16);
      const tr = Math.round(t.y / 16);
      // Don't block target tile if target is player tank
      if (tc !== targetC || tr !== targetR) {
        blockedTiles.add(`${tr}_${tc}`);
      }
    }
  }

  const openList: PathNode[] = [];
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    c: startC,
    r: startR,
    g: 0,
    h: Math.abs(startC - targetC) + Math.abs(startR - targetR),
    f: Math.abs(startC - targetC) + Math.abs(startR - targetR),
    parent: null,
  };

  openList.push(startNode);

  const neighbors = [
    { dc: 0, dr: -1 }, // UP
    { dc: 0, dr: 1 },  // DOWN
    { dc: -1, dr: 0 }, // LEFT
    { dc: 1, dr: 0 },  // RIGHT
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 200;

  let bestNode = startNode;

  while (openList.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;

    // Find node with lowest f
    let bestIndex = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[bestIndex].f) {
        bestIndex = i;
      }
    }

    const current = openList.splice(bestIndex, 1)[0];
    const currentKey = `${current.r}_${current.c}`;
    closedSet.add(currentKey);

    if (current.h < bestNode.h) {
      bestNode = current;
    }

    // Reached destination
    if (current.c === targetC && current.r === targetR) {
      bestNode = current;
      break;
    }

    for (const n of neighbors) {
      const nextC = current.c + n.dc;
      const nextR = current.r + n.dr;
      const nextKey = `${nextR}_${nextC}`;

      if (closedSet.has(nextKey)) continue;

      // Check walkability (unless it's the target tile)
      const isTarget = nextC === targetC && nextR === targetR;
      if (!isTarget && !isTileWalkable(nextC, nextR, terrain, blockedTiles)) {
        continue;
      }

      const tentativeG = current.g + 1;
      const existingOpen = openList.find((node) => node.c === nextC && node.r === nextR);

      if (!existingOpen) {
        const h = Math.abs(nextC - targetC) + Math.abs(nextR - targetR);
        const newNode: PathNode = {
          c: nextC,
          r: nextR,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };
        openList.push(newNode);
      } else if (tentativeG < existingOpen.g) {
        existingOpen.g = tentativeG;
        existingOpen.f = tentativeG + existingOpen.h;
        existingOpen.parent = current;
      }
    }
  }

  // If target is a different tile and A* could not advance beyond startNode, return []
  // Returning [startNode] tethers the tank to its current tile and causes oscillation!
  if ((startC !== targetC || startR !== targetR) && bestNode.c === startC && bestNode.r === startR) {
    return [];
  }

  // Reconstruct path from bestNode
  const path: Array<{ x: number; y: number }> = [];
  let curr: PathNode | null = bestNode;
  while (curr !== null) {
    path.unshift({ x: curr.c * 16, y: curr.r * 16 });
    curr = curr.parent;
  }

  // Remove the start node if path has more than 1 node
  if (path.length > 1) {
    path.shift();
  }

  return path;
}
