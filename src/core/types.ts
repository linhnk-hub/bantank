/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tile Types defined by project specification:
 * EMPTY = 0
 * BRICK = 1
 * STEEL = 2
 * WATER = 3
 * GRASS = 4
 * ICE = 5
 * BASE = 9
 */
export const TILE_TYPES = {
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  GRASS: 4,
  ICE: 5,
  BASE: 9,
} as const;

export type TileType = typeof TILE_TYPES[keyof typeof TILE_TYPES];

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/**
 * TANK_STRUCTURE as defined in specification:
 * - id
 * - x
 * - y
 * - direction
 * - speed
 * - type
 * - tier
 * - isAlive
 * - isShielded
 */
export interface TankStructure {
  id: string;
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  type: string;
  tier: number;
  isAlive: boolean;
  isShielded: boolean;
}

/**
 * BULLET_STRUCTURE as defined in specification:
 * - id
 * - ownerId
 * - x
 * - y
 * - direction
 * - speed
 * - power
 */
export interface BulletStructure {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  direction: Direction;
  speed: number;
  power: number;
}

export type StageMapMatrix = number[][];

export interface MapValidationResult {
  isValid: boolean;
  rows: number;
  cols: number;
  tileSize: number;
  totalTiles: number;
  tileCounts: Record<number, number>;
  baseCoordinates: Array<{ row: number; col: number }>;
  hasThreeBaseCells: boolean;
  errors: string[];
  warnings: string[];
}
