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
  }

  const hasThreeBaseCells = false;

  // Check if Stage 1 contains any unintroduced tile types (WATER, GRASS, ICE)
  if (tileCounts[TILE_TYPES.WATER] > 0 || tileCounts[TILE_TYPES.GRASS] > 0 || tileCounts[TILE_TYPES.ICE] > 0) {
    warnings.push('Bản đồ có chứa loại địa hình WATER, GRASS hoặc ICE (Stage 1 chỉ chứa 0, 1, 2, 9)');
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

