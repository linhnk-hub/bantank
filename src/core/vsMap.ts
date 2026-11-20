/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS } from './constants.ts';
import {
  TILE_TYPES,
  type Direction,
  type RuntimeTerrainState,
  type StageMapMatrix,
  type TankStructure,
} from './types.ts';
import { checkHitboxVsTerrain, checkTankVsTanks, getTankHitbox } from './physics.ts';
import type { VsMode, VsSafeZoneBounds, VsTankRole, VsTeamId } from './vsTypes.ts';

/**
 * Bản đồ Đấu Trường VS chính thức (13x13 ô, 208x208px) cho BTO-VS-GAMEPLAY-V1.2:
 * - Không có Eagle Base (0 ô TILE_TYPES.BASE).
 * - Đối xứng 100% cả trục trái-phải (TEAM_1 vs TEAM_2) lẫn trục trên-dưới và xoay 180°.
 * - Khu vực trung tâm 3x3 (rows 5..7, cols 5..7) hoàn toàn thông thoáng để vùng an toàn cuối
 *   không bao giờ bị chặn bởi vật cản không thể phá hủy hay làm kẹt xe tăng.
 * - Các cột thép đối xứng ở (1,5),(1,7),(6,3),(6,9),(11,5),(11,7) tạo cover chiến thuật cân bằng
 *   nhưng luôn có nhiều hành lang đi vòng và không khóa lối vào vùng an toàn ở mọi cấp thu hẹp.
 */
export const VS_ARENA_MAP: StageMapMatrix = [
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 1, 0, 2, 0, 2, 0, 1, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  [0, 0, 1, 1, 0, 2, 0, 2, 0, 1, 1, 0, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
];

export interface VsSpawnSlot {
  row: number;
  col: number;
  direction: Direction;
}

export function getInitialVsSpawnSlot(mode: VsMode, role: VsTankRole): VsSpawnSlot {
  if (mode === 'VS_P1_P2') {
    if (role === 'P1') {
      return { row: 6, col: 0, direction: 'RIGHT' };
    }
    return { row: 6, col: 12, direction: 'LEFT' };
  }

  // VS_P1_AI_P2_AI — exact 180° rotational symmetry
  switch (role) {
    case 'P1':
      return { row: 4, col: 0, direction: 'RIGHT' };
    case 'AI_1':
      return { row: 8, col: 0, direction: 'RIGHT' };
    case 'P2':
      return { row: 8, col: 12, direction: 'LEFT' };
    case 'AI_2':
      return { row: 4, col: 12, direction: 'LEFT' };
  }
}

/**
 * Danh sách tất cả các ô ứng viên thuộc khu vực xuất phát của mỗi phe.
 * TEAM_1: cột 0..2 (ưu tiên cột 0..1); TEAM_2: cột 10..12 (ưu tiên cột 11..12).
 */
export function getTeamSpawnZoneTiles(team: VsTeamId): Array<{ row: number; col: number }> {
  const cols = team === 'TEAM_1' ? [0, 1, 2] : [12, 11, 10];
  const result: Array<{ row: number; col: number }> = [];
  for (const col of cols) {
    for (let row = 0; row < MAP_DIMENSIONS.ROWS; row++) {
      result.push({ row, col });
    }
  }
  return result;
}

/**
 * Tính toán biên vùng an toàn đối xứng theo cấp thu hẹp (shrinkLevel >= 0).
 * - Level 0: cols 0..12, rows 0..12 (13x13, toàn bộ bản đồ)
 * - Level 1: cols 1..11, rows 1..11 (11x11)
 * - Level 2: cols 2..10, rows 2..10 (9x9)
 * - Level 3: cols 3..9,  rows 3..9  (7x7)
 * - Level 4: cols 4..8,  rows 4..8  (5x5)
 * - Level 5: cols 5..7,  rows 5..7  (3x3)
 * - Level 6: cols 6..6,  rows 6..6  (1x1 trung tâm)
 * - Level >= 7: vùng an toàn thu về 0 (isFullyCollapsed = true) — buộc kết thúc trận đấu.
 */
export function computeVsSafeZoneBounds(shrinkLevel: number): VsSafeZoneBounds {
  const level = Math.max(0, Math.floor(shrinkLevel));
  if (level >= 7) {
    const center = MAP_DIMENSIONS.TOTAL_WIDTH_PX / 2; // 104
    return {
      minCol: 6,
      maxCol: 6,
      minRow: 6,
      maxRow: 6,
      minX: center,
      maxX: center,
      minY: center,
      maxY: center,
      isFullyCollapsed: true,
    };
  }

  const minCol = level;
  const maxCol = MAP_DIMENSIONS.COLS - 1 - level;
  const minRow = level;
  const maxRow = MAP_DIMENSIONS.ROWS - 1 - level;
  const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;

  return {
    minCol,
    maxCol,
    minRow,
    maxRow,
    minX: minCol * tilePx,
    maxX: (maxCol + 1) * tilePx,
    minY: minRow * tilePx,
    maxY: (maxRow + 1) * tilePx,
    isFullyCollapsed: false,
  };
}

/**
 * Sát thương vùng nguy hiểm mỗi tick (60 ticks/giây; ngưỡng tiêu diệt = 100).
 * Tăng dần theo cấp thu hẹp để ép buộc xe tăng tiến vào vùng an toàn.
 */
export function computeHazardDamagePerTick(shrinkLevel: number): number {
  const level = Math.max(0, Math.floor(shrinkLevel));
  if (level === 0) return 0;
  if (level === 1) return 0.56; // ~3.0s
  if (level === 2) return 0.84; // ~2.0s
  if (level === 3) return 1.12; // ~1.5s
  if (level === 4) return 1.45; // ~1.15s
  if (level === 5) return 1.8; // ~0.93s
  return 2.2 + (level - 6) * 0.5;
}

export function isPointInsideSafeZone(
  centerX: number,
  centerY: number,
  bounds: VsSafeZoneBounds
): boolean {
  if (bounds.isFullyCollapsed) return false;
  return (
    centerX >= bounds.minX &&
    centerX < bounds.maxX &&
    centerY >= bounds.minY &&
    centerY < bounds.maxY
  );
}

export function isTankInsideSafeZone(
  tank: Pick<TankStructure, 'x' | 'y'>,
  bounds: VsSafeZoneBounds
): boolean {
  const cx = tank.x + 8;
  const cy = tank.y + 8;
  return isPointInsideSafeZone(cx, cy, bounds);
}

/**
 * Tìm vị trí hồi sinh hợp lệ gần nhất thuộc khu vực xuất phát của phe mình.
 * - Tuyệt đối không chồng lên xe tăng khác (cả đồng đội lẫn đối thủ).
 * - Tuyệt đối không nằm bên trong vật cản (BRICK, STEEL, WATER, BASE).
 * - Nếu tất cả các ô trong khu vực xuất phát bị chiếm/chặn (trường hợp cực đoan),
 *   mở rộng tìm ô hợp lệ gần vị trí xuất phát gốc nhất trên toàn bản đồ thuộc nửa sân của phe.
 */
export function findValidVsRespawnPosition(
  team: VsTeamId,
  preferredRow: number,
  preferredCol: number,
  terrain: RuntimeTerrainState,
  otherAliveTanks: TankStructure[],
  selfTankId: string
): { x: number; y: number; row: number; col: number } | null {
  const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;

  const isTileValidForSpawn = (row: number, col: number): boolean => {
    if (row < 0 || row >= MAP_DIMENSIONS.ROWS || col < 0 || col >= MAP_DIMENSIONS.COLS) {
      return false;
    }
    const x = col * tilePx;
    const y = row * tilePx;
    const box = getTankHitbox(x, y);
    const terr = checkHitboxVsTerrain(box, terrain, { forBullet: false });
    if (terr.collides || terr.isOutOfBounds) {
      return false;
    }
    if (checkTankVsTanks(selfTankId, box, otherAliveTanks)) {
      return false;
    }
    return true;
  };

  // 1. Ưu tiên vị trí xuất phát gốc nếu trống và hợp lệ
  if (isTileValidForSpawn(preferredRow, preferredCol)) {
    return {
      x: preferredCol * tilePx,
      y: preferredRow * tilePx,
      row: preferredRow,
      col: preferredCol,
    };
  }

  // 2. Tìm ô hợp lệ gần nhất thuộc khu vực xuất phát của phe mình (cols 0..2 hoặc 10..12)
  const zoneTiles = getTeamSpawnZoneTiles(team);
  zoneTiles.sort((a, b) => {
    const distA = Math.abs(a.row - preferredRow) + Math.abs(a.col - preferredCol) * 1.25;
    const distB = Math.abs(b.row - preferredRow) + Math.abs(b.col - preferredCol) * 1.25;
    if (distA !== distB) return distA - distB;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  for (const tile of zoneTiles) {
    if (isTileValidForSpawn(tile.row, tile.col)) {
      return {
        x: tile.col * tilePx,
        y: tile.row * tilePx,
        row: tile.row,
        col: tile.col,
      };
    }
  }

  // 3. Fallback an toàn thuộc nửa sân của phe (TEAM_1: cols 0..5, TEAM_2: cols 7..12)
  const halfCandidates: Array<{ row: number; col: number }> = [];
  const startCol = team === 'TEAM_1' ? 0 : 7;
  const endCol = team === 'TEAM_1' ? 5 : 12;
  for (let col = startCol; col <= endCol; col++) {
    for (let row = 0; row < MAP_DIMENSIONS.ROWS; row++) {
      halfCandidates.push({ row, col });
    }
  }
  halfCandidates.sort((a, b) => {
    const distA = Math.abs(a.row - preferredRow) + Math.abs(a.col - preferredCol);
    const distB = Math.abs(b.row - preferredRow) + Math.abs(b.col - preferredCol);
    return distA - distB;
  });
  for (const tile of halfCandidates) {
    if (isTileValidForSpawn(tile.row, tile.col)) {
      return {
        x: tile.col * tilePx,
        y: tile.row * tilePx,
        row: tile.row,
        col: tile.col,
      };
    }
  }

  return null;
}

export interface VsMapValidationReport {
  isValid: boolean;
  errors: string[];
  baseTileCount: number;
  isHorizontallySymmetric: boolean;
  isVerticallySymmetric: boolean;
  isRotationallySymmetric180: boolean;
  center3x3WalkableCount: number;
  allShrinkLevelsHaveWalkableTiles: boolean;
}

export function validateVsArenaMap(map: StageMapMatrix = VS_ARENA_MAP): VsMapValidationReport {
  const errors: string[] = [];
  let baseTileCount = 0;
  let isHorizontallySymmetric = true;
  let isVerticallySymmetric = true;
  let isRotationallySymmetric180 = true;

  if (map.length !== MAP_DIMENSIONS.ROWS) {
    errors.push(`Expected ${MAP_DIMENSIONS.ROWS} rows, got ${map.length}`);
  }

  for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
    if (!map[r] || map[r].length !== MAP_DIMENSIONS.COLS) {
      errors.push(`Row ${r} must have ${MAP_DIMENSIONS.COLS} columns`);
      continue;
    }
    for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
      const tile = map[r][c];
      if (tile === TILE_TYPES.BASE) {
        baseTileCount++;
      }
      if (tile !== map[r][MAP_DIMENSIONS.COLS - 1 - c]) {
        isHorizontallySymmetric = false;
      }
      if (tile !== map[MAP_DIMENSIONS.ROWS - 1 - r][c]) {
        isVerticallySymmetric = false;
      }
      if (tile !== map[MAP_DIMENSIONS.ROWS - 1 - r][MAP_DIMENSIONS.COLS - 1 - c]) {
        isRotationallySymmetric180 = false;
      }
    }
  }

  if (baseTileCount !== 0) {
    errors.push(`VS map must have 0 Eagle Base tiles, found ${baseTileCount}`);
  }
  if (!isHorizontallySymmetric) {
    errors.push('VS map is not horizontally symmetric (TEAM_1 vs TEAM_2)');
  }
  if (!isRotationallySymmetric180) {
    errors.push('VS map is not 180-degree rotationally symmetric');
  }

  let center3x3WalkableCount = 0;
  for (let r = 5; r <= 7; r++) {
    for (let c = 5; c <= 7; c++) {
      if (map[r][c] === TILE_TYPES.EMPTY || map[r][c] === TILE_TYPES.GRASS) {
        center3x3WalkableCount++;
      }
    }
  }
  if (center3x3WalkableCount < 9) {
    errors.push(`Center 3x3 should be completely open/walkable (found ${center3x3WalkableCount}/9)`);
  }

  let allShrinkLevelsHaveWalkableTiles = true;
  for (let level = 0; level <= 6; level++) {
    const b = computeVsSafeZoneBounds(level);
    let walkable = 0;
    for (let r = b.minRow; r <= b.maxRow; r++) {
      for (let c = b.minCol; c <= b.maxCol; c++) {
        if (map[r][c] === TILE_TYPES.EMPTY || map[r][c] === TILE_TYPES.GRASS) {
          walkable++;
        }
      }
    }
    if (walkable === 0) {
      allShrinkLevelsHaveWalkableTiles = false;
      errors.push(`Shrink level ${level} has 0 walkable tiles`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    baseTileCount,
    isHorizontallySymmetric,
    isVerticallySymmetric,
    isRotationallySymmetric180,
    center3x3WalkableCount,
    allShrinkLevelsHaveWalkableTiles,
  };
}
