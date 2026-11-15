/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS } from './constants.ts';
import { TILE_TYPES, type MapValidationResult, type StageMapMatrix } from './types.ts';

export interface StageSpawnPointInfo {
  id: 'P1' | 'P2' | 'ENEMY_LEFT' | 'ENEMY_CENTER' | 'ENEMY_RIGHT';
  row: number;
  col: number;
  label: string;
  shortLabel: string;
  role: 'P1' | 'P2' | 'ENEMY';
}

export const STAGE_SPAWN_POINTS: readonly StageSpawnPointInfo[] = [
  { id: 'P1', row: 12, col: 3, label: 'Người chơi 1 (P1)', shortLabel: 'P1', role: 'P1' },
  { id: 'P2', row: 12, col: 9, label: 'Người chơi 2 (P2)', shortLabel: 'P2', role: 'P2' },
  { id: 'ENEMY_LEFT', row: 0, col: 0, label: 'Xe địch 1 (Góc trái trên)', shortLabel: 'E1', role: 'ENEMY' },
  { id: 'ENEMY_CENTER', row: 0, col: 6, label: 'Xe địch 2 (Giữa trên)', shortLabel: 'E2', role: 'ENEMY' },
  { id: 'ENEMY_RIGHT', row: 0, col: 12, label: 'Xe địch 3 (Góc phải trên)', shortLabel: 'E3', role: 'ENEMY' },
] as const;

const IMPASSABLE_SPAWN_TILES = new Set<number>([
  TILE_TYPES.BRICK,
  TILE_TYPES.STEEL,
  TILE_TYPES.WATER,
  TILE_TYPES.BASE,
]);

const INDESTRUCTIBLE_BLOCKING_TILES = new Set<number>([
  TILE_TYPES.STEEL,
  TILE_TYPES.WATER,
  TILE_TYPES.BASE,
]);

/**
 * Pure Game Core function to validate any stage map matrix.
 * Has ZERO dependencies on React, Phaser, or DOM APIs.
 */
export function validateStageMap(matrix: StageMapMatrix): MapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tileCounts: Record<number, number> = {
    [TILE_TYPES.EMPTY]: 0,
    [TILE_TYPES.BRICK]: 0,
    [TILE_TYPES.STEEL]: 0,
    [TILE_TYPES.WATER]: 0,
    [TILE_TYPES.GRASS]: 0,
    [TILE_TYPES.ICE]: 0,
    [TILE_TYPES.BASE]: 0,
  };

  const baseCoordinates: Array<{ row: number; col: number }> = [];

  if (!Array.isArray(matrix)) {
    return {
      isValid: false,
      rows: 0,
      cols: 0,
      tileSize: MAP_DIMENSIONS.TILE_SIZE_PX,
      totalTiles: 0,
      tileCounts,
      baseCoordinates,
      hasThreeBaseCells: false,
      errors: ['Ma trận không phải là một mảng hợp lệ'],
      warnings: [],
    };
  }

  const rowCount = matrix.length;
  if (rowCount !== MAP_DIMENSIONS.ROWS) {
    errors.push(`Số hàng không khớp: kỳ vọng ${MAP_DIMENSIONS.ROWS}, nhận được ${rowCount}`);
  }

  let totalCols = 0;
  let dimensionsValid = rowCount === MAP_DIMENSIONS.ROWS;
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) {
      errors.push(`Hàng ${r} không phải là một mảng hợp lệ`);
      dimensionsValid = false;
      continue;
    }
    if (row.length !== MAP_DIMENSIONS.COLS) {
      errors.push(`Hàng ${r} có ${row.length} cột (kỳ vọng đúng ${MAP_DIMENSIONS.COLS} cột)`);
      dimensionsValid = false;
    }
    totalCols += row.length;

    for (let c = 0; c < row.length; c++) {
      const tileVal = row[c];
      if (tileCounts[tileVal] !== undefined) {
        tileCounts[tileVal]++;
      } else {
        errors.push(`Ô tại [hàng ${r}, cột ${c}] có giá trị không xác định: ${tileVal}`);
      }

      if (tileVal === TILE_TYPES.BASE) {
        baseCoordinates.push({ row: r, col: c });
      }
    }
  }

  // Validate exactly 1 BASE cell at [row 12, col 6] protected by BRICK at [12, 5] and [12, 7]
  const baseCount = tileCounts[TILE_TYPES.BASE] || 0;
  const isBaseAtCenter = (
    baseCount === 1 &&
    baseCoordinates.length === 1 &&
    baseCoordinates[0].row === 12 &&
    baseCoordinates[0].col === 6
  );
  const hasBrickWings = matrix[12]?.[5] === TILE_TYPES.BRICK && matrix[12]?.[7] === TILE_TYPES.BRICK;

  if (baseCount !== 1) {
    errors.push(`Số ô BASE không khớp: tìm thấy ${baseCount} ô (kỳ vọng đúng 1 ô BASE tại [12, 6])`);
  } else if (!isBaseAtCenter) {
    errors.push('Ô BASE không nằm đúng vị trí trung tâm tại [hàng 12, cột 6]');
  }

  if (!hasBrickWings) {
    errors.push('Hai ô cánh bảo vệ [hàng 12, cột 5] và [hàng 12, cột 7] phải là tường gạch BRICK');
  }

  // Validate P1, P2, and Enemy spawn points are not blocked by impassable obstacles
  if (dimensionsValid) {
    for (const spawn of STAGE_SPAWN_POINTS) {
      const tileAtSpawn = matrix[spawn.row]?.[spawn.col];
      if (IMPASSABLE_SPAWN_TILES.has(tileAtSpawn)) {
        errors.push(
          `Vị trí xuất hiện của ${spawn.label} tại [hàng ${spawn.row}, cột ${spawn.col}] bị chặn bởi vật cản không thể đi qua (mã ô: ${tileAtSpawn})`
        );
        continue;
      }

      // Check that the spawn point is not completely surrounded by indestructible obstacles (STEEL, WATER, BASE)
      const neighbors = [
        { r: spawn.row - 1, c: spawn.col },
        { r: spawn.row + 1, c: spawn.col },
        { r: spawn.row, c: spawn.col - 1 },
        { r: spawn.row, c: spawn.col + 1 },
      ].filter(
        (n) => n.r >= 0 && n.r < MAP_DIMENSIONS.ROWS && n.c >= 0 && n.c < MAP_DIMENSIONS.COLS
      );

      const hasPassableOrDestructibleExit = neighbors.some(
        (n) => !INDESTRUCTIBLE_BLOCKING_TILES.has(matrix[n.r][n.c])
      );
      if (!hasPassableOrDestructibleExit) {
        errors.push(
          `Vị trí xuất hiện của ${spawn.label} tại [hàng ${spawn.row}, cột ${spawn.col}] bị vây kín hoàn toàn bởi vật cản không thể phá hủy`
        );
      }
    }

    // BFS Reachability & Connectivity Validation (only run when base & spawns exist without structural block errors)
    if (errors.length === 0) {
      const openPassable = new Set<number>([
        TILE_TYPES.EMPTY,
        TILE_TYPES.GRASS,
        TILE_TYPES.ICE,
      ]);
      const breakablePassable = new Set<number>([
        TILE_TYPES.EMPTY,
        TILE_TYPES.GRASS,
        TILE_TYPES.ICE,
        TILE_TYPES.BRICK,
      ]);

      const runBfs = (
        startRow: number,
        startCol: number,
        allowedSet: Set<number>,
        targetBaseIncluded: boolean = false
      ): Set<string> => {
        const visited = new Set<string>();
        const startKey = `${startRow},${startCol}`;
        if (!allowedSet.has(matrix[startRow][startCol])) {
          return visited;
        }
        const queue: Array<{ r: number; c: number }> = [{ r: startRow, c: startCol }];
        visited.add(startKey);
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          const dirs = [
            { r: cur.r - 1, c: cur.c },
            { r: cur.r + 1, c: cur.c },
            { r: cur.r, c: cur.c - 1 },
            { r: cur.r, c: cur.c + 1 },
          ];
          for (const d of dirs) {
            if (d.r < 0 || d.r >= MAP_DIMENSIONS.ROWS || d.c < 0 || d.c >= MAP_DIMENSIONS.COLS) {
              continue;
            }
            const key = `${d.r},${d.c}`;
            if (visited.has(key)) continue;
            const t = matrix[d.r][d.c];
            if (allowedSet.has(t) || (targetBaseIncluded && t === TILE_TYPES.BASE)) {
              visited.add(key);
              if (t !== TILE_TYPES.BASE) {
                queue.push(d);
              }
            }
          }
        }
        return visited;
      };

      const p1Spawn = STAGE_SPAWN_POINTS[0]; // [12, 3]
      const p2Spawn = STAGE_SPAWN_POINTS[1]; // [12, 9]
      const enemySpawns = STAGE_SPAWN_POINTS.slice(2);

      // 1. Open-passable connectivity: every spawn must connect into the main open combat graph (no walled-off pocket)
      const p1OpenReach = runBfs(p1Spawn.row, p1Spawn.col, openPassable, false);
      if (p1OpenReach.size < 4) {
        errors.push('Vị trí P1 [12, 3] bị cô lập trong vùng không gian quá hẹp (< 4 ô thông thoáng).');
      }
      if (!p1OpenReach.has(`${p2Spawn.row},${p2Spawn.col}`)) {
        // Also allow breakable connectivity as fallback, or fail if blocked by STEEL/WATER
        const p1Breakable = runBfs(p1Spawn.row, p1Spawn.col, breakablePassable, true);
        if (!p1Breakable.has(`${p2Spawn.row},${p2Spawn.col}`)) {
          errors.push('Đường di chuyển giữa P1 [12, 3] và P2 [12, 9] bị chia cắt hoàn toàn bởi vật cản không thể phá hủy.');
        }
      }

      // 2. Every enemy spawn must be able to reach Base [12,6] & P1 [12,3] via breakable/open path (STEEL/WATER cannot create an impassable wall)
      const p1BreakableReach = runBfs(p1Spawn.row, p1Spawn.col, breakablePassable, true);
      if (!p1BreakableReach.has('12,6')) {
        errors.push('P1 [12, 3] không có đường tiếp cận khu vực Căn cứ [12, 6].');
      }

      for (const eSpawn of enemySpawns) {
        const eOpenReach = runBfs(eSpawn.row, eSpawn.col, openPassable, false);
        if (eOpenReach.size < 3) {
          errors.push(
            `Vị trí ${eSpawn.label} [${eSpawn.row}, ${eSpawn.col}] bị bít kẹt ngay tại điểm xuất phát (< 3 ô thông thoáng).`
          );
        }
        const eBreakableReach = runBfs(eSpawn.row, eSpawn.col, breakablePassable, true);
        if (!eBreakableReach.has('12,6') || !eBreakableReach.has(`${p1Spawn.row},${p1Spawn.col}`)) {
          errors.push(
            `Địa hình không thể phá hủy (STEEL/WATER) đang chặn hoàn toàn đường tiến công từ ${eSpawn.label} tới Căn cứ [12, 6] hoặc P1.`
          );
        }
      }
    }
  }

  const hasThreeBaseCells = false;

  // Check if map contains WATER, GRASS, or ICE (Stage 2+ tactical terrain vs Stage 1 classic terrain)
  if (tileCounts[TILE_TYPES.WATER] > 0 || tileCounts[TILE_TYPES.GRASS] > 0 || tileCounts[TILE_TYPES.ICE] > 0) {
    warnings.push('Bản đồ có chứa loại địa hình chiến thuật WATER, GRASS hoặc ICE (từ Stage 2–10)');
  }

  return {
    isValid: errors.length === 0,
    rows: rowCount,
    cols: matrix[0]?.length ?? 0,
    tileSize: MAP_DIMENSIONS.TILE_SIZE_PX,
    totalTiles: totalCols,
    tileCounts,
    baseCoordinates,
    hasThreeBaseCells,
    errors,
    warnings,
  };
}

