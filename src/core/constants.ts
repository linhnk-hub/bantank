/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TILE_TYPES, type StageMapMatrix } from './types.ts';

export const MAP_DIMENSIONS = {
  ROWS: 13,
  COLS: 13,
  TILE_SIZE_PX: 16,
  TOTAL_WIDTH_PX: 13 * 16,  // 208px
  TOTAL_HEIGHT_PX: 13 * 16, // 208px
} as const;

/**
 * Stage 1 map matrix officially provided by project owner:
 * 13 rows x 13 columns
 * 0 = EMPTY, 1 = BRICK, 2 = STEEL, 3 = WATER, 4 = GRASS, 5 = ICE, 9 = BASE
 * Preserves exact 3 BASE cells at row 12 [cols 5, 6, 7].
 */
export const STAGE_1_MAP: StageMapMatrix = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,1,1,0,1,1,0,1,1,0],
  [0,1,1,0,1,1,0,1,1,0,1,1,0],
  [0,1,1,0,1,1,2,1,1,0,1,1,0],
  [0,1,1,0,1,1,0,1,1,0,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,2,0,0,0,2,0,1,1,0],
  [0,1,1,0,2,1,1,1,2,0,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0],
  [1,1,0,1,1,1,0,1,1,1,0,1,1],
  [0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,1,1,1,1,1,0,1,1,0],
  [0,1,1,0,1,9,9,9,1,0,1,1,0]
];

export const TILE_METADATA: Record<number, {
  name: string;
  vietnameseName: string;
  description: string;
  colorHex: string;
  presentInStage1: boolean;
}> = {
  [TILE_TYPES.EMPTY]: {
    name: 'EMPTY',
    vietnameseName: 'Đất trống',
    description: 'Xe tăng và đạn di chuyển tự do',
    colorHex: '#000000',
    presentInStage1: true,
  },
  [TILE_TYPES.BRICK]: {
    name: 'BRICK',
    vietnameseName: 'Tường gạch',
    description: 'Chặn xe và đạn; bị phá hủy từng phần khi trúng đạn',
    colorHex: '#d85024',
    presentInStage1: true,
  },
  [TILE_TYPES.STEEL]: {
    name: 'STEEL',
    vietnameseName: 'Tường thép',
    description: 'Chặn xe và triệt tiêu đạn thường',
    colorHex: '#c0c7cb',
    presentInStage1: true,
  },
  [TILE_TYPES.WATER]: {
    name: 'WATER',
    vietnameseName: 'Mặt nước',
    description: 'Chặn xe tăng nhưng đạn có thể bay qua (chưa có trong Stage 1)',
    colorHex: '#3b82f6',
    presentInStage1: false,
  },
  [TILE_TYPES.GRASS]: {
    name: 'GRASS',
    vietnameseName: 'Lùm cây cỏ',
    description: 'Xe và đạn đi qua được; xe tăng bị che khuất (chưa có trong Stage 1)',
    colorHex: '#22c55e',
    presentInStage1: false,
  },
  [TILE_TYPES.ICE]: {
    name: 'ICE',
    vietnameseName: 'Băng tuyết',
    description: 'Xe tăng đi qua bị trượt quán tính (chưa có trong Stage 1)',
    colorHex: '#e0f2fe',
    presentInStage1: false,
  },
  [TILE_TYPES.BASE]: {
    name: 'BASE',
    vietnameseName: 'Căn cứ',
    description: '3 ô căn cứ bảo vệ ở đáy bản đồ; trúng đạn là Game Over',
    colorHex: '#eab308',
    presentInStage1: true,
  },
};

export const TANK_CONFIG = {
  SPRITE_SIZE: 16,
  HITBOX_SIZE: 14,
  HITBOX_INSET: 1,
  SPEED_PX_S: 60,
  SPEED_PX_TICK: 1.0, // exactly 1.0 px per tick at 60Hz
  SNAP_THRESHOLD: 4,
  MAX_X: 192, // 208 - 16
  MAX_Y: 192, // 208 - 16
  SPAWN: {
    x: 48,
    y: 192,
    direction: 'UP' as const,
  },
} as const;

export const BULLET_CONFIG = {
  SIZE: 4,
  SPEED_PX_S: 160,
  SPEED_PX_TICK: 160 / 60, // ~2.6667 px per tick
  MAX_ACTIVE: 1,
} as const;

export const SIMULATION_CONFIG = {
  FIXED_DT_S: 1 / 60,
  FIXED_DT_MS: 1000 / 60, // ~16.6667 ms
  MAX_TICKS_PER_FRAME: 8,
  MAX_ACCUMULATOR_MS: 250,
  SUB_TILE_SIZE: 8,
} as const;
