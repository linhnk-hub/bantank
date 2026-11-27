/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS, SIMULATION_CONFIG } from '../core/constants.ts';

/**
 * Explicit coordinate-space type aliases to keep logical simulation units (208x208)
 * distinct from projected Phaser render units (832x832).
 */
export type LogicalPx = number;
export type RenderPx = number;

export interface LogicalPoint {
  readonly x: LogicalPx;
  readonly y: LogicalPx;
}

export interface RenderPoint {
  readonly x: RenderPx;
  readonly y: RenderPx;
}

export interface LogicalSize {
  readonly width: LogicalPx;
  readonly height: LogicalPx;
}

export interface RenderSize {
  readonly width: RenderPx;
  readonly height: RenderPx;
}

export interface LogicalRect extends LogicalPoint, LogicalSize {}

export interface RenderRect extends RenderPoint, RenderSize {}

export interface TileGridCoord {
  readonly col: number;
  readonly row: number;
}

/**
 * Authoritative 4x render projection scale for Art System V1.1.
 * Logical simulation remains fixed at 208x208 (13x13 tiles of 16x16 logical px).
 * Render surface projects 1 logical pixel -> 4 render pixels (832x832 surface, 64x64 tile).
 */
export const RENDER_PROJECTION_SCALE = 4 as const;

export const RENDER_CONFIG = {
  LOGICAL_WORLD_WIDTH_PX: MAP_DIMENSIONS.TOTAL_WIDTH_PX as LogicalPx, // 208
  LOGICAL_WORLD_HEIGHT_PX: MAP_DIMENSIONS.TOTAL_HEIGHT_PX as LogicalPx, // 208
  LOGICAL_TILE_SIZE_PX: MAP_DIMENSIONS.TILE_SIZE_PX as LogicalPx, // 16
  LOGICAL_SUB_TILE_SIZE_PX: SIMULATION_CONFIG.SUB_TILE_SIZE as LogicalPx, // 8
  PROJECTION_SCALE: RENDER_PROJECTION_SCALE, // 4
  RENDER_WORLD_WIDTH_PX: (MAP_DIMENSIONS.TOTAL_WIDTH_PX * RENDER_PROJECTION_SCALE) as RenderPx, // 832
  RENDER_WORLD_HEIGHT_PX: (MAP_DIMENSIONS.TOTAL_HEIGHT_PX * RENDER_PROJECTION_SCALE) as RenderPx, // 832
  RENDER_TILE_SIZE_PX: (MAP_DIMENSIONS.TILE_SIZE_PX * RENDER_PROJECTION_SCALE) as RenderPx, // 64
  RENDER_SUB_TILE_SIZE_PX: (SIMULATION_CONFIG.SUB_TILE_SIZE * RENDER_PROJECTION_SCALE) as RenderPx, // 32
} as const;

/**
 * Converts a scalar logical dimension or coordinate (208x208 space)
 * into projected render pixels (832x832 space).
 */
export function logicalToRenderPx(logicalValue: LogicalPx): RenderPx {
  return logicalValue * RENDER_CONFIG.PROJECTION_SCALE;
}

/**
 * Converts a scalar render-space coordinate or dimension (832x832 space)
 * back into logical simulation pixels (208x208 space).
 */
export function renderToLogicalPx(renderValue: RenderPx): LogicalPx {
  return renderValue / RENDER_CONFIG.PROJECTION_SCALE;
}

/**
 * Projects a logical (x, y) point into render space.
 */
export function logicalToRenderPoint(x: LogicalPx, y: LogicalPx): RenderPoint {
  return {
    x: logicalToRenderPx(x),
    y: logicalToRenderPx(y),
  };
}

/**
 * Projects a logical (width, height) size into render space.
 */
export function logicalToRenderSize(width: LogicalPx, height: LogicalPx): RenderSize {
  return {
    width: logicalToRenderPx(width),
    height: logicalToRenderPx(height),
  };
}

/**
 * Projects a logical rectangle into render space.
 */
export function logicalToRenderRect(rect: LogicalRect): RenderRect {
  return {
    x: logicalToRenderPx(rect.x),
    y: logicalToRenderPx(rect.y),
    width: logicalToRenderPx(rect.width),
    height: logicalToRenderPx(rect.height),
  };
}

/**
 * Projects a 13x13 logical tile grid coordinate (col, row) to its top-left render point.
 */
export function tileGridToRenderPoint(col: number, row: number): RenderPoint {
  return {
    x: col * RENDER_CONFIG.RENDER_TILE_SIZE_PX,
    y: row * RENDER_CONFIG.RENDER_TILE_SIZE_PX,
  };
}

/**
 * Converts a render-space pointer coordinate into its logical 13x13 tile grid cell.
 */
export function renderPointToTileGrid(renderX: RenderPx, renderY: RenderPx): TileGridCoord {
  return {
    col: Math.floor(renderX / RENDER_CONFIG.RENDER_TILE_SIZE_PX),
    row: Math.floor(renderY / RENDER_CONFIG.RENDER_TILE_SIZE_PX),
  };
}
