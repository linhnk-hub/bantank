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
  ownerType?: 'player' | 'enemy';
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

/**
 * AABB Bounding Box using half-open intervals:
 * [left, right) × [top, bottom)
 */
export interface AABB {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Bitmask for 4 sub-tiles (8x8 px each) within a 16x16 BRICK tile:
 * Bit 0 (1): Top-Left (TL)
 * Bit 1 (2): Top-Right (TR)
 * Bit 2 (4): Bottom-Left (BL)
 * Bit 3 (8): Bottom-Right (BR)
 * 15 (0b1111): Fully intact
 * 0: Completely destroyed (becomes EMPTY)
 */
export const SUB_TILE_MASKS = {
  TL: 1, // 0b0001
  TR: 2, // 0b0010
  BL: 4, // 0b0100
  BR: 8, // 0b1000
  ALL: 15, // 0b1111
  NONE: 0,
} as const;

/**
 * Runtime terrain state preserving original STAGE_1_MAP
 */
export interface RuntimeTerrainState {
  currentMap: number[][];
  brickSubTiles: Record<string, number>; // key: `${row}_${col}` -> bitmask 0..15
  isBaseDestroyed: boolean;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
}

/* ====================================================================
   MILESTONE 3: ENEMY AI & COMBAT TYPES
==================================================================== */

export type EnemyType = 'BASIC' | 'FAST' | 'POWER' | 'ARMOR';
export type EnemyAIState = 'PATROL' | 'CHASE' | 'SEARCH';

export interface EnemyTank extends TankStructure {
  enemyType: EnemyType;
  hp: number;
  maxHp: number;
  scoreValue: number;
  aiState: EnemyAIState;
  targetPos: { x: number; y: number } | null;
  lastKnownP1Pos: { x: number; y: number } | null;
  lostTargetTimer: number; // 0.3s target hold
  searchTimer: number; // Up to 3.0s search
  path: Array<{ x: number; y: number }>;
  pathCooldown: number; // Throttle A*
  shootCooldown: number;
  aimTimer: number; // Continuous time bore is aligned with target
  aimTime: number; // Required aim duration before firing
  directionHistory: Direction[]; // Last 4 directions for patrol LRU selection
  dirHoldTimer: number; // Minimum 0.5s hold direction in patrol
  leadPos: { x: number; y: number } | null; // Predicted intercept position (max 48px)
  leadEvalTimer: number; // Re-evaluate lead every 100ms
  lastP1Direction: Direction | null;
  flankOffset?: { x: number; y: number }; // Assigned approach vector by Coordinator
  spawnShieldTimer: number; // 1.0s invulnerability at spawn
}

export interface P1PlayerState {
  lives: number; // Default 3
  isDead: boolean;
  respawnTimer: number; // 2.0s delay before respawn
  shieldTimer: number; // 3.0s protection upon spawn/respawn
  waitingForClearSpawn: boolean; // True if spawn point (48, 192) is occupied
  spawnCheckTimer: number; // Re-check every 100ms when waiting
}

export interface GameCoreState {
  tickCount: number;
  p1: TankStructure;
  p1State: P1PlayerState;
  bullet: BulletStructure | null; // P1 bullet (M2 compatibility)
  bullets: BulletStructure[]; // All active bullets (P1 + Enemies)
  enemies: EnemyTank[]; // Max 5 active enemies
  enemyQueue: EnemyType[]; // Queue of 30 enemies
  totalDefeatedEnemies: number;
  score: number;
  terrain: RuntimeTerrainState;
  isGameOver: boolean;
  isStageClear: boolean;
  gameOverReason: string | null;
  diagnosticLog: string | null;
}
