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
 * Preserves single central Eagle at row 12, col 6 protected by brick walls at col 5 and col 7.
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

export const P1_CONFIG = {
  STARTING_LIVES: 3,
  RESPAWN_DELAY_S: 2.0,
  RESPAWN_SHIELD_S: 3.0,
  SPAWN_X: 48,
  SPAWN_Y: 192,
  SPAWN_DIRECTION: 'UP' as const,
} as const;

export const ENEMY_CONFIG = {
  MAX_ACTIVE: 5,
  TOTAL_COUNT: 30,
  SPAWN_INTERVAL_S: 1.0, // Minimum 1.0s between successful spawns
  SPAWN_SHIELD_S: 1.0,   // 1s invulnerability at spawn
  SPAWN_POINTS: [
    { x: 0, y: 0 },
    { x: 96, y: 0 },
    { x: 192, y: 0 },
  ] as const,
  SPECS: {
    BASIC: {
      speed: 60,
      hp: 1,
      score: 100,
      aimTime: 0.35,
      shootCooldown: 1.5,
    },
    FAST: {
      speed: 90,
      hp: 1,
      score: 200,
      aimTime: 0.15,
      shootCooldown: 1.2,
    },
    POWER: {
      speed: 60,
      hp: 2,
      score: 300,
      aimTime: 0.55,
      shootCooldown: 2.0,
    },
    ARMOR: {
      speed: 45,
      hp: 4,
      score: 400,
      aimTime: 0.65,
      shootCooldown: 2.5,
    },
  } as const,
  // Fixed sequence of 30 enemies
  QUEUE: [
    ...Array(15).fill('BASIC'),
    ...Array(7).fill('FAST'),
    ...Array(5).fill('POWER'),
    ...Array(3).fill('ARMOR'),
  ] as const,
} as const;

export const AI_CONFIG = {
  DETECTION_RADIUS_PX: 80,
  LOST_TARGET_HOLD_S: 0.3,
  SEARCH_MAX_S: 3.0,
  PATH_RECOMPUTE_THROTTLE_S: 0.5,
  BASE_TARGET_COORDS: { x: 96, y: 192 }, // Center of 3 Base tiles
  // Alignment & Aiming
  ALIGNMENT_TOLERANCE_PX: 4, // Gun bore alignment must be <= 4px
  // Lead Prediction
  LEAD_PREDICTION_MAX_TIME_S: 1.0,
  LEAD_PREDICTION_MAX_DIST_PX: 48,
  LEAD_PREDICTION_INTERVAL_S: 0.1, // 100ms re-evaluation
  // Patrol
  PATROL_MIN_HOLD_DIR_S: 0.5,
  // Coordinator
  COORDINATOR_UPDATE_INTERVAL_S: 0.5,
} as const;


