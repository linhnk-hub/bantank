/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import { MAP_DIMENSIONS, STAGE_1_MAP, TILE_METADATA } from '../../core/constants.ts';
import { TILE_TYPES } from '../../core/types.ts';
import { generateTileTextures } from '../textureGenerator.ts';

export interface SceneTileHoverInfo {
  row: number;
  col: number;
  tileType: number;
  tileName: string;
  xPx: number;
  yPx: number;
}

export class StageViewerScene extends Phaser.Scene {
  private gridGraphics?: Phaser.GameObjects.Graphics;
  private coordContainer?: Phaser.GameObjects.Container;
  private hoverGraphics?: Phaser.GameObjects.Graphics;
  private showGrid: boolean = true;
  private showCoords: boolean = false;
  private onTileHoverCallback?: (info: SceneTileHoverInfo | null) => void;

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

  create(): void {
    // 1. Generate retro 16x16 pixel textures
    generateTileTextures(this);

    // 2. Black background container
    const bg = this.add.rectangle(
      0,
      0,
      MAP_DIMENSIONS.TOTAL_WIDTH_PX,
      MAP_DIMENSIONS.TOTAL_HEIGHT_PX,
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
    const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;

    for (let r = 0; r < STAGE_1_MAP.length; r++) {
      const row = STAGE_1_MAP[r];
      for (let c = 0; c < row.length; c++) {
        const tileType = row[c];
        const x = c * tileSize;
        const y = r * tileSize;

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

        const sprite = this.add.image(x, y, textureKey);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(tileSize, tileSize);

        // Highlight base cells with a subtle golden indicator outline for QA verification
        if (tileType === TILE_TYPES.BASE) {
          const baseBorder = this.add.graphics();
          baseBorder.lineStyle(1, 0xfacc15, 0.7);
          baseBorder.strokeRect(x, y, tileSize, tileSize);
        }
      }
    }
  }

  private createGridOverlay(): void {
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(1, 0x334155, 0.5); // subtle slate-700 grid lines

    const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;
    const totalW = MAP_DIMENSIONS.TOTAL_WIDTH_PX;
    const totalH = MAP_DIMENSIONS.TOTAL_HEIGHT_PX;

    // Vertical lines (13 columns)
    for (let c = 0; c <= MAP_DIMENSIONS.COLS; c++) {
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(c * tileSize, 0);
      this.gridGraphics.lineTo(c * tileSize, totalH);
      this.gridGraphics.strokePath();
    }

    // Horizontal lines (13 rows)
    for (let r = 0; r <= MAP_DIMENSIONS.ROWS; r++) {
      this.gridGraphics.beginPath();
      this.gridGraphics.moveTo(0, r * tileSize);
      this.gridGraphics.lineTo(totalW, r * tileSize);
      this.gridGraphics.strokePath();
    }

    this.gridGraphics.setVisible(this.showGrid);
  }

  private createCoordinateOverlay(): void {
    this.coordContainer = this.add.container(0, 0);
    const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;

    for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
      for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
        const text = this.add.text(
          c * tileSize + 2,
          r * tileSize + 2,
          `${r},${c}`,
          {
            fontSize: '5px',
            color: '#94a3b8',
            fontFamily: 'monospace',
          }
        );
        this.coordContainer.add(text);
      }
    }

    this.coordContainer.setVisible(this.showCoords);
  }

  private setupHoverInteraction(): void {
    this.hoverGraphics = this.add.graphics();
    const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const col = Math.floor(pointer.x / tileSize);
      const row = Math.floor(pointer.y / tileSize);

      if (
        row >= 0 &&
        row < MAP_DIMENSIONS.ROWS &&
        col >= 0 &&
        col < MAP_DIMENSIONS.COLS
      ) {
        const tileVal = STAGE_1_MAP[row][col];
        const meta = TILE_METADATA[tileVal];

        if (this.hoverGraphics) {
          this.hoverGraphics.clear();
          this.hoverGraphics.lineStyle(1, 0x38bdf8, 1);
          this.hoverGraphics.strokeRect(col * tileSize, row * tileSize, tileSize, tileSize);
        }

        if (this.onTileHoverCallback) {
          this.onTileHoverCallback({
            row,
            col,
            tileType: tileVal,
            tileName: meta ? meta.name : `TYPE_${tileVal}`,
            xPx: col * tileSize,
            yPx: row * tileSize,
          });
        }
      } else {
        if (this.hoverGraphics) {
          this.hoverGraphics.clear();
        }
        if (this.onTileHoverCallback) {
          this.onTileHoverCallback(null);
        }
      }
    });

    this.input.on('pointerout', () => {
      if (this.hoverGraphics) {
        this.hoverGraphics.clear();
      }
      if (this.onTileHoverCallback) {
        this.onTileHoverCallback(null);
      }
    });
  }
}
