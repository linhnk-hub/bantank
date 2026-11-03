/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS } from './constants.ts';
import { TILE_TYPES, type MapValidationResult, type StageMapMatrix } from './types.ts';

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
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) {
      errors.push(`Hàng ${r} không phải là một mảng hợp lệ`);
      continue;
    }
    if (row.length !== MAP_DIMENSIONS.COLS) {
      errors.push(`Hàng ${r} có ${row.length} cột (kỳ vọng đúng ${MAP_DIMENSIONS.COLS} cột)`);
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

  // Validate 3 consecutive BASE cells at [row 12, col 5, 6, 7] (M1 specification)
  const baseCount = tileCounts[TILE_TYPES.BASE] || 0;
  const hasThreeBaseCells = (
    baseCount === 3 &&
    baseCoordinates.length === 3 &&
    baseCoordinates.some(c => c.row === 12 && c.col === 5) &&
    baseCoordinates.some(c => c.row === 12 && c.col === 6) &&
    baseCoordinates.some(c => c.row === 12 && c.col === 7)
  );

  if (baseCount !== 3) {
    errors.push(`Số ô BASE không khớp: tìm thấy ${baseCount} ô (kỳ vọng đúng 3 ô BASE liên tiếp tại [12, 5], [12, 6], [12, 7])`);
  } else if (!hasThreeBaseCells) {
    errors.push('3 ô BASE không nằm đúng vị trí liên tiếp tại [hàng 12, cột 5, 6, 7]');
  }

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
