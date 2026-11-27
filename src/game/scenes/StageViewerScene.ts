/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import { MAP_DIMENSIONS, STAGE_1_MAP, TILE_METADATA } from '../../core/constants.ts';
import { TILE_TYPES } from '../../core/types.ts';
import { generateTileTextures } from '../textureGenerator.ts';
import {
  RENDER_CONFIG,
  logicalToRenderPx,
  renderPointToTileGrid,
  tileGridToRenderPoint,
} from '../renderConfig.ts';

export interface SceneTileHoverInfo {
  row: number;
  col: number;
  tileType: number;
  tileName: string;
  xPx: number;
  yPx: number;
}

const RENDER_LINE_WIDTH_PX = logicalToRenderPx(1); // 4px
const RENDER_COORD_OFFSET_PX = logicalToRenderPx(2); // 8px
const RENDER_COORD_FONT_PX = logicalToRenderPx(5); // 20px

export class StageViewerScene extends Phaser.Scene {
  private gridGraphics?: Phaser.GameObjects.Graphics;
  private coordContainer?: Phaser.GameObjects.Container;
  private hoverGraphics?: Phaser.GameObjects.Graphics;
  private showGrid: boolean = true;
  private showCoords: boolean = false;
  private onTileHoverCallback?: (info: SceneTileHoverInfo | null) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerOutHandler?: () => void;

  constructor() {
    super({ key: 'StageViewerScene' });
  }

  public setTileHoverCallback(cb: (info: SceneTileHoverInfo | null) => void): void {
    this.onTileHoverCallback = cb;
  }

  public toggleGrid(visible?: boolean): boolean {
    this.showGrid = visible !== undefined ? visible : !this.showGrid;
    if (this.gridGraphics) {
      this.gridGraphics.setVisible(this.showGrid);
    }
    return this.showGrid;
  }

  public toggleCoords(visible?: boolean): boolean {
    this.showCoords = visible !== undefined ? visible : !this.showCoords;
    if (this.coordContainer) {
      this.coordContainer.setVisible(this.showCoords);
    }
    return this.showCoords;
  }

  /**
   * Maps a render-space coordinate (832x832 canvas/world space) to its logical 13x13 tile info.
   * Returns null for non-finite or out-of-bounds coordinates.
   */
  public resolveTileHoverInfoFromRenderPoint(
    renderX: number,
    renderY: number
  ): SceneTileHoverInfo | null {
    if (
      !Number.isFinite(renderX) ||
      !Number.isFinite(renderY) ||
      renderX < 0 ||
      renderY < 0 ||
      renderX >= RENDER_CONFIG.RENDER_WORLD_WIDTH_PX ||
      renderY >= RENDER_CONFIG.RENDER_WORLD_HEIGHT_PX
    ) {
      return null;
    }

    const { col, row } = renderPointToTileGrid(renderX, renderY);
    if (
      row < 0 ||
      row >= MAP_DIMENSIONS.ROWS ||
      col < 0 ||
      col >= MAP_DIMENSIONS.COLS
    ) {
      return null;
    }

    const tileVal = STAGE_1_MAP[row][col];
    const meta = TILE_METADATA[tileVal];
    return {
      row,
      col,
      tileType: tileVal,
      tileName: meta ? meta.name : `TYPE_${tileVal}`,
      xPx: col * RENDER_CONFIG.LOGICAL_TILE_SIZE_PX,
      yPx: row * RENDER_CONFIG.LOGICAL_TILE_SIZE_PX,
    };
  }

  create(): void {
    // 1. Generate fallback retro textures for any keys not preloaded from Art System V1.1 PNGs
    generateTileTextures(this);

    // 2. Black background container (projected 832x832 render surface)
    const bg = this.add.rectangle(
      0,
      0,
      RENDER_CONFIG.RENDER_WORLD_WIDTH_PX,
      RENDER_CONFIG.RENDER_WORLD_HEIGHT_PX,
      0x000000
    );
    bg.setOrigin(0, 0);

    // 3. Render the 13x13 Stage 1 tiles according to STAGE_1_MAP
    this.renderStageMap();

    // 4. Create Grid Lines overlay
    this.createGridOverlay();

    // 5. Create Coordinate Labels overlay
    this.createCoordinateOverlay();

    // 6. Setup interactive cursor hover
    this.setupHoverInteraction();
  }

  private renderStageMap(): void {
    const renderTileSize = RENDER_CONFIG.RENDER_TILE_SIZE_PX;

    for (let r = 0; r < STAGE_1_MAP.length; r++) {
      const row = STAGE_1_MAP[r];
      for (let c = 0; c < row.length; c++) {
        const tileType = row[c];
        const tileRenderPos = tileGridToRenderPoint(c, r);

        // Skip EMPTY = 0 (background is already black)
        if (tileType === TILE_TYPES.EMPTY) {
          continue;
        }

        let textureKey = `tile_${tileType}`;

        // Specifically handle the 3 consecutive BASE cells at row 12 [cols 5, 6, 7]
        if (tileType === TILE_TYPES.BASE) {
          if (r === 12 && c === 5) {
            textureKey = 'tile_9_left';
          } else if (r === 12 && c === 6) {
            textureKey = 'tile_9_center';
          } else if (r === 12 && c === 7) {
            textureKey = 'tile_9_right';
          }
        }

        const sprite = this.add.image(tileRenderPos.x, tileRenderPos.y, textureKey);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(renderTileSize, renderTileSize);

        // Highlight base cells with a subtle golden indicator outline for QA verification
        if (tileType === TILE_TYPES.BASE) {
          const baseBorder = this.add.graphics();
          baseBorder.lineStyle(RENDER_LINE_WIDTH_PX, 0xfacc15, 0.7);
          baseBorder.strokeRect(
            tileRenderPos.x,
            tileRenderPos.y,
            renderTileSize,
            renderTileSize
          );
        }
      }
    }
  }

  private createGridOverlay(): void {
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(RENDER_LINE_WIDTH_PX, 0x334155, 0.5); // subtle slate-700 grid lines

    const renderTotalW = RENDER_CONFIG.RENDER_WORLD_WIDTH_PX;
    const renderTotalH = RENDER_CONFIG.RENDER_WORLD_HEIGHT_PX;

    // Vertical lines (13 columns)
    for (let c = 0; c <= MAP_DIMENSIONS.COLS; c++) {
      const lineX = tileGridToRenderPoint(c, 0).x;
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(lineX, 0);
      this.gridGraphics.lineTo(lineX, renderTotalH);
      this.gridGraphics.strokePath();
    }

    // Horizontal lines (13 rows)
    for (let r = 0; r <= MAP_DIMENSIONS.ROWS; r++) {
      const lineY = tileGridToRenderPoint(0, r).y;
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(0, lineY);
      this.gridGraphics.lineTo(renderTotalW, lineY);
      this.gridGraphics.strokePath();
    }

    this.gridGraphics.setVisible(this.showGrid);
  }

  private createCoordinateOverlay(): void {
    this.coordContainer = this.add.container(0, 0);

    for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
      for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
        const tileRenderPos = tileGridToRenderPoint(c, r);
        const text = this.add.text(
          tileRenderPos.x + RENDER_COORD_OFFSET_PX,
          tileRenderPos.y + RENDER_COORD_OFFSET_PX,
          `${r},${c}`,
          {
            fontSize: `${RENDER_COORD_FONT_PX}px`,
            color: '#94a3b8',
            fontFamily: 'monospace',
          }
        );
        this.coordContainer.add(text);
      }
    }

    this.coordContainer.setVisible(this.showCoords);
  }

  private clearPointerListeners(): void {
    if (this.input) {
      if (this.pointerMoveHandler) {
        this.input.off('pointermove', this.pointerMoveHandler);
      }
      if (this.pointerOutHandler) {
        this.input.off('pointerout', this.pointerOutHandler);
      }
    }
    this.pointerMoveHandler = undefined;
    this.pointerOutHandler = undefined;
  }

  private setupHoverInteraction(): void {
    this.clearPointerListeners();
    this.hoverGraphics = this.add.graphics();
    const renderTileSize = RENDER_CONFIG.RENDER_TILE_SIZE_PX;

    this.pointerMoveHandler = (pointer: Phaser.Input.Pointer) => {
      // Use Phaser camera world coordinates (already mapped into 832x832 render space under Scale.FIT),
      // falling back to pointer.x/y when worldX/worldY is not populated in headless mocks.
      const pointerRenderX = Number.isFinite(pointer.worldX) ? pointer.worldX : pointer.x;
      const pointerRenderY = Number.isFinite(pointer.worldY) ? pointer.worldY : pointer.y;

      const hoverInfo = this.resolveTileHoverInfoFromRenderPoint(
        pointerRenderX,
        pointerRenderY
      );

      if (hoverInfo) {
        if (this.hoverGraphics) {
          const tileRenderPos = tileGridToRenderPoint(hoverInfo.col, hoverInfo.row);
          this.hoverGraphics.clear();
          this.hoverGraphics.lineStyle(RENDER_LINE_WIDTH_PX, 0x38bdf8, 1);
          this.hoverGraphics.strokeRect(
            tileRenderPos.x,
            tileRenderPos.y,
            renderTileSize,
            renderTileSize
          );
        }

        if (this.onTileHoverCallback) {
          this.onTileHoverCallback(hoverInfo);
        }
      } else {
        if (this.hoverGraphics) {
          this.hoverGraphics.clear();
        }
        if (this.onTileHoverCallback) {
          this.onTileHoverCallback(null);
        }
      }
    };

    this.pointerOutHandler = () => {
      if (this.hoverGraphics) {
        this.hoverGraphics.clear();
      }
      if (this.onTileHoverCallback) {
        this.onTileHoverCallback(null);
      }
    };

    this.input.on('pointermove', this.pointerMoveHandler);
    this.input.on('pointerout', this.pointerOutHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearPointerListeners();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.clearPointerListeners();
    });
  }
}
