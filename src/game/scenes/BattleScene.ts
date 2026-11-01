/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import { MAP_DIMENSIONS } from '../../core/constants.ts';
import { TILE_TYPES, SUB_TILE_MASKS, type InputState, type GameCoreState } from '../../core/types.ts';
import { GameEngine } from '../../core/gameEngine.ts';
import { generateTileTextures } from '../textureGenerator.ts';

export class BattleScene extends Phaser.Scene {
  private engine: GameEngine;
  private p1Sprite?: Phaser.GameObjects.Image;
  private bulletSprite?: Phaser.GameObjects.Image;
  private terrainSprites: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private baseSprites: Phaser.GameObjects.Image[] = [];
  private onStateCallback?: (state: GameCoreState) => void;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    J: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };

  constructor(customEngine?: GameEngine) {
    super({ key: 'BattleScene' });
    this.engine = customEngine ?? new GameEngine();
  }

  public setEngine(engine: GameEngine): void {
    this.engine = engine;
    this.refreshAllTerrain();
  }

  public getEngine(): GameEngine {
    return this.engine;
  }

  public setStateCallback(cb: (state: GameCoreState) => void): void {
    this.onStateCallback = cb;
  }

  create(): void {
    // 1. Generate all textures (tiles, tank, bullet, ruined base)
    generateTileTextures(this);

    // 2. Black background
    this.add
      .rectangle(0, 0, MAP_DIMENSIONS.TOTAL_WIDTH_PX, MAP_DIMENSIONS.TOTAL_HEIGHT_PX, 0x000000)
      .setOrigin(0, 0);

    // 3. Render initial terrain
    this.refreshAllTerrain();

    // 4. Create Tank P1 Sprite
    const p1State = this.engine.getState().p1;
    this.p1Sprite = this.add.image(p1State.x, p1State.y, `tank_p1_${p1State.direction.toLowerCase()}`);
    this.p1Sprite.setOrigin(0, 0);
    this.p1Sprite.setDisplaySize(16, 16);
    this.p1Sprite.setDepth(10);

    // 5. Create Bullet Sprite
    this.bulletSprite = this.add.image(0, 0, 'bullet');
    this.bulletSprite.setOrigin(0, 0);
    this.bulletSprite.setDisplaySize(4, 4);
    this.bulletSprite.setVisible(false);
    this.bulletSprite.setDepth(15);

    // 6. Setup Keyboard Input
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        J: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J),
        SPACE: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      };
    }
  }

  update(_time: number, delta: number): void {
    // 1. Read Input
    const input: InputState = {
      up: Boolean(this.cursors?.up.isDown || this.wasd?.W.isDown),
      down: Boolean(this.cursors?.down.isDown || this.wasd?.S.isDown),
      left: Boolean(this.cursors?.left.isDown || this.wasd?.A.isDown),
      right: Boolean(this.cursors?.right.isDown || this.wasd?.D.isDown),
      shoot: Boolean(this.cursors?.space.isDown || this.wasd?.SPACE.isDown || this.wasd?.J.isDown),
    };

    // 2. Advance GameCore Simulation with Fixed Timestep 60Hz
    this.engine.advanceTime(delta, input);
    const state = this.engine.getState();

    // 3. Update Tank Sprite
    if (this.p1Sprite && state.p1.isAlive) {
      this.p1Sprite.setPosition(state.p1.x, state.p1.y);
      this.p1Sprite.setTexture(`tank_p1_${state.p1.direction.toLowerCase()}`);
      this.p1Sprite.setVisible(true);
    }

    // 4. Update Bullet Sprite
    if (this.bulletSprite) {
      if (state.bullet !== null) {
        this.bulletSprite.setPosition(state.bullet.x, state.bullet.y);
        this.bulletSprite.setVisible(true);
      } else {
        this.bulletSprite.setVisible(false);
      }
    }

    // 5. Update Dynamic Terrain (Bricks & Base)
    this.syncDynamicTerrain(state);

    // 6. Report state to React
    if (this.onStateCallback) {
      this.onStateCallback(state);
    }
  }

  public refreshAllTerrain(): void {
    // Clean up existing sprites
    this.terrainSprites.forEach((obj) => obj.destroy());
    this.terrainSprites.clear();
    this.baseSprites = [];

    const state = this.engine.getState();
    const terrain = state.terrain;
    const tileSize = MAP_DIMENSIONS.TILE_SIZE_PX;

    for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
      for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
        const tileType = terrain.currentMap[r][c];
        const x = c * tileSize;
        const y = r * tileSize;

        if (tileType === TILE_TYPES.EMPTY) {
          continue;
        }

        if (tileType === TILE_TYPES.BASE) {
          let texKey = 'tile_9_center';
          if (r === 12 && c === 5) texKey = 'tile_9_left';
          else if (r === 12 && c === 7) texKey = 'tile_9_right';

          if (terrain.isBaseDestroyed) {
            texKey = 'tile_9_ruined';
          }

          const baseImg = this.add.image(x, y, texKey);
          baseImg.setOrigin(0, 0);
          baseImg.setDisplaySize(tileSize, tileSize);
          baseImg.setDepth(2);
          this.terrainSprites.set(`base_${r}_${c}`, baseImg);
          this.baseSprites.push(baseImg);
          continue;
        }

        if (tileType === TILE_TYPES.BRICK) {
          this.renderBrickTile(r, c, terrain.brickSubTiles[`${r}_${c}`] ?? SUB_TILE_MASKS.ALL);
          continue;
        }

        // STEEL, WATER, GRASS, ICE
        const img = this.add.image(x, y, `tile_${tileType}`);
        img.setOrigin(0, 0);
        img.setDisplaySize(tileSize, tileSize);
        // Grass has higher depth to cover tanks
        img.setDepth(tileType === TILE_TYPES.GRASS ? 20 : 1);
        this.terrainSprites.set(`tile_${r}_${c}`, img);
      }
    }
  }

  private renderBrickTile(r: number, c: number, mask: number): void {
    const key = `brick_${r}_${c}`;
    const oldObj = this.terrainSprites.get(key);
    if (oldObj) {
      oldObj.destroy();
      this.terrainSprites.delete(key);
    }

    if (mask === 0) return;

    const x = c * 16;
    const y = r * 16;

    if (mask === SUB_TILE_MASKS.ALL) {
      // Full brick
      const img = this.add.image(x, y, 'tile_1');
      img.setOrigin(0, 0);
      img.setDisplaySize(16, 16);
      img.setDepth(1);
      this.terrainSprites.set(key, img);
      return;
    }

    // Container of surviving sub-tiles
    const container = this.add.container(x, y);
    container.setDepth(1);

    if (mask & SUB_TILE_MASKS.TL) {
      const sub = this.add.image(0, 0, 'brick_sub_tl').setOrigin(0, 0).setDisplaySize(8, 8);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.TR) {
      const sub = this.add.image(8, 0, 'brick_sub_tr').setOrigin(0, 0).setDisplaySize(8, 8);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BL) {
      const sub = this.add.image(0, 8, 'brick_sub_bl').setOrigin(0, 0).setDisplaySize(8, 8);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BR) {
      const sub = this.add.image(8, 8, 'brick_sub_br').setOrigin(0, 0).setDisplaySize(8, 8);
      container.add(sub);
    }

    this.terrainSprites.set(key, container);
  }

  private syncDynamicTerrain(state: GameCoreState): void {
    const terrain = state.terrain;

    // Check base ruins
    if (terrain.isBaseDestroyed) {
      for (const baseImg of this.baseSprites) {
        if (baseImg.texture.key !== 'tile_9_ruined') {
          baseImg.setTexture('tile_9_ruined');
        }
      }
    }

    // Sync any modified brick tiles
    for (const [key, mask] of Object.entries(terrain.brickSubTiles)) {
      const [rStr, cStr] = key.split('_');
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const spriteKey = `brick_${r}_${c}`;
      const existing = this.terrainSprites.get(spriteKey);

      // If mask is 0 but sprite exists, destroy it
      if (mask === 0 && existing) {
        existing.destroy();
        this.terrainSprites.delete(spriteKey);
      } else if (mask > 0 && mask < 15 && (!existing || (existing as any).type !== 'Container')) {
        this.renderBrickTile(r, c, mask);
      }
    }
  }
}
