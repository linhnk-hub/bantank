/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import { MAP_DIMENSIONS } from '../../core/constants.ts';
import {
  TILE_TYPES,
  SUB_TILE_MASKS,
  type InputState,
  type GameCoreState,
} from '../../core/types.ts';
import { GameEngine } from '../../core/gameEngine.ts';
import { generateTileTextures } from '../textureGenerator.ts';
import { SoundManager } from '../../core/audio.ts';

interface ActiveVisualEffect {
  id: string;
  type: string;
  sprite: Phaser.GameObjects.Image;
  elapsedMs: number;
  totalDurationMs: number;
}

export class BattleScene extends Phaser.Scene {
  private engine: GameEngine;
  private p1Sprite?: Phaser.GameObjects.Image;
  private p1ShieldSprite?: Phaser.GameObjects.Image;
  private enemySprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private enemyShieldSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private bulletSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private visualEffects: ActiveVisualEffect[] = [];
  private terrainSprites: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private baseSprites: Array<{
    sprite: Phaser.GameObjects.Image;
    row: number;
    col: number;
    normalTexKey: string;
    ruinedTexKey: string;
  }> = [];
  private lastStageId: number = -1;
  private lastTickCount: number = -1;
  private lastMatchState: string = '';
  private onStateCallback?: (state: GameCoreState) => void;
  private onFpsCallback?: (fps: number) => void;
  private fpsAccumulatorMs = 0;
  private fpsFrameCount = 0;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    J: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private keyP?: Phaser.Input.Keyboard.Key;
  private keyEsc?: Phaser.Input.Keyboard.Key;
  private onPauseCallback?: () => void;

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

  public setFpsCallback(cb: (fps: number) => void): void {
    this.onFpsCallback = cb;
  }

  public setPauseCallback(cb: () => void): void {
    this.onPauseCallback = cb;
  }

  public setFpsLimit(limit: number): void {
    if (this.game && this.game.loop) {
      this.game.loop.setFPSLimit(limit === 60 ? 0 : limit);
    }
  }

  create(): void {
    // 1. Generate all textures (tiles, tank, bullet, enemies, ruined base)
    generateTileTextures(this);

    // 2. Black background
    this.add
      .rectangle(0, 0, MAP_DIMENSIONS.TOTAL_WIDTH_PX, MAP_DIMENSIONS.TOTAL_HEIGHT_PX, 0x000000)
      .setOrigin(0, 0);

    // 3. Render initial terrain
    this.refreshAllTerrain();

    // 4. Create Tank P1 Sprite
    const p1 = this.engine.getState().p1;
    this.p1Sprite = this.add.image(p1.x, p1.y, `tank_p1_${p1.direction.toLowerCase()}`);
    this.p1Sprite.setOrigin(0, 0);
    this.p1Sprite.setDisplaySize(16, 16);
    this.p1Sprite.setDepth(10);

    // 5. Create P1 Shield Aura Sprite
    this.p1ShieldSprite = this.add.image(p1.x - 1, p1.y - 1, 'shield_aura');
    this.p1ShieldSprite.setOrigin(0, 0);
    this.p1ShieldSprite.setDisplaySize(18, 18);
    this.p1ShieldSprite.setDepth(12);
    this.p1ShieldSprite.setVisible(false);

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
      this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    }

    // 7. Subscribe to engine audio events
    this.engine.on('P1_SHOOT', () => {
      SoundManager.getInstance().playP1Shoot();
    });
    this.engine.on('ENEMY_SHOOT', () => {
      SoundManager.getInstance().playEnemyShoot();
    });
  }

  update(_time: number, delta: number): void {
    // Check Pause hotkeys (P or ESC)
    if (
      (this.keyP && Phaser.Input.Keyboard.JustDown(this.keyP)) ||
      (this.keyEsc && Phaser.Input.Keyboard.JustDown(this.keyEsc))
    ) {
      this.onPauseCallback?.();
    }

    // 0. Update FPS measurement (reported every ~500ms)
    this.fpsAccumulatorMs += delta;
    this.fpsFrameCount++;
    if (this.fpsAccumulatorMs >= 500) {
      const calculatedFps = Math.max(1, Math.round((this.fpsFrameCount * 1000) / this.fpsAccumulatorMs));
      this.onFpsCallback?.(calculatedFps);
      this.fpsAccumulatorMs = 0;
      this.fpsFrameCount = 0;
    }

    // 1. Read Input (merged keyboard + touch/external controls)
    const ext = this.engine.getExternalInput();
    const input: InputState = {
      up: Boolean(this.cursors?.up.isDown || this.wasd?.W.isDown || ext.up),
      down: Boolean(this.cursors?.down.isDown || this.wasd?.S.isDown || ext.down),
      left: Boolean(this.cursors?.left.isDown || this.wasd?.A.isDown || ext.left),
      right: Boolean(this.cursors?.right.isDown || this.wasd?.D.isDown || ext.right),
      shoot: Boolean(
        this.cursors?.space.isDown ||
          this.wasd?.SPACE.isDown ||
          this.wasd?.J.isDown ||
          ext.shoot
      ),
    };

    // 2. Advance GameCore Simulation with Fixed Timestep 60Hz
    this.engine.advanceTime(delta, input);
    const state = this.engine.getState();

    // Check if stage was restarted or stage was changed
    if (
      (this.lastStageId !== -1 && this.lastStageId !== state.currentStageId) ||
      (this.lastTickCount >= 0 && state.tickCount < this.lastTickCount)
    ) {
      this.refreshAllTerrain();
    }
    this.lastStageId = state.currentStageId;
    this.lastTickCount = state.tickCount;

    // 3. Update P1 Tank & Shield
    if (this.p1Sprite) {
      if (state.p1.isAlive && !state.p1State.isDead) {
        this.p1Sprite.setPosition(state.p1.x, state.p1.y);
        this.p1Sprite.setTexture(`tank_p1_${state.p1.direction.toLowerCase()}`);
        this.p1Sprite.setVisible(true);

        const hasShield = state.p1.isShielded || state.p1State.shieldTimer > 0;
        if (hasShield) {
          // Visual pulse/flash (alpha oscillation & glowing aura) on the tank sprite
          // When paused, shieldTimer freezes, so pulse/flash freezes automatically
          const pulsePhase = Math.floor(state.p1State.shieldTimer * 10) % 2 === 0;
          const tankAlpha = pulsePhase ? 0.7 : 1.0;
          const auraAlpha = pulsePhase ? 0.95 : 0.45;

          this.p1Sprite.setAlpha(tankAlpha);

          if (this.p1ShieldSprite) {
            this.p1ShieldSprite.setPosition(state.p1.x - 1, state.p1.y - 1);
            this.p1ShieldSprite.setVisible(true);
            this.p1ShieldSprite.setAlpha(auraAlpha);
          }
        } else {
          this.p1Sprite.setAlpha(1.0);
          if (this.p1ShieldSprite) {
            this.p1ShieldSprite.setVisible(false);
          }
        }
      } else {
        this.p1Sprite.setVisible(false);
        this.p1Sprite.setAlpha(1.0);
        if (this.p1ShieldSprite) this.p1ShieldSprite.setVisible(false);
      }
    }

    // 4. Update Enemy Sprites
    const activeEnemyIds = new Set<string>();
    for (const enemy of state.enemies) {
      if (!enemy.isAlive) continue;
      activeEnemyIds.add(enemy.id);

      let sprite = this.enemySprites.get(enemy.id);
      const textureKey = `tank_${enemy.enemyType.toLowerCase()}_${enemy.direction.toLowerCase()}`;

      if (!sprite) {
        sprite = this.add.image(enemy.x, enemy.y, textureKey);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(16, 16);
        sprite.setDepth(9);
        this.enemySprites.set(enemy.id, sprite);
      } else {
        sprite.setPosition(enemy.x, enemy.y);
        if (sprite.texture.key !== textureKey) {
          sprite.setTexture(textureKey);
        }
      }

      // Enemy spawn shield with blinking aura
      let shield = this.enemyShieldSprites.get(enemy.id);
      const isShielded = enemy.isShielded || enemy.spawnShieldTimer > 0;
      if (isShielded) {
        const pulsePhase = Math.floor(enemy.spawnShieldTimer * 12) % 2 === 0;
        const tankAlpha = pulsePhase ? 0.75 : 1.0;
        const auraAlpha = pulsePhase ? 0.9 : 0.4;
        sprite.setAlpha(tankAlpha);

        if (!shield) {
          shield = this.add.image(enemy.x - 1, enemy.y - 1, 'shield_aura');
          shield.setOrigin(0, 0);
          shield.setDisplaySize(18, 18);
          shield.setDepth(11);
          this.enemyShieldSprites.set(enemy.id, shield);
        } else {
          shield.setPosition(enemy.x - 1, enemy.y - 1);
          shield.setVisible(true);
        }
        shield.setAlpha(auraAlpha);
      } else {
        sprite.setAlpha(1.0);
        if (shield) {
          shield.setVisible(false);
        }
      }
    }

    // Remove defunct enemy sprites
    for (const [id, sprite] of this.enemySprites) {
      if (!activeEnemyIds.has(id)) {
        sprite.destroy();
        this.enemySprites.delete(id);
        const shield = this.enemyShieldSprites.get(id);
        if (shield) {
          shield.destroy();
          this.enemyShieldSprites.delete(id);
        }
      }
    }

    // 5. Update All Bullets (P1 + Enemies)
    const activeBulletIds = new Set<string>();
    for (const b of state.bullets) {
      activeBulletIds.add(b.id);
      let bSprite = this.bulletSprites.get(b.id);
      const bTex = b.ownerType === 'enemy' ? 'bullet_enemy' : 'bullet';

      if (!bSprite) {
        bSprite = this.add.image(b.x, b.y, bTex);
        bSprite.setOrigin(0, 0);
        bSprite.setDisplaySize(4, 4);
        bSprite.setDepth(15);
        this.bulletSprites.set(b.id, bSprite);
      } else {
        bSprite.setPosition(b.x, b.y);
      }
    }

    // Remove destroyed bullet sprites
    for (const [id, sprite] of this.bulletSprites) {
      if (!activeBulletIds.has(id)) {
        sprite.destroy();
        this.bulletSprites.delete(id);
      }
    }

    // 6. Spawn Visual Effects from Combat Events & Trigger Audio
    const newEvents = this.engine.popCombatEvents();
    for (const ev of newEvents) {
      SoundManager.getInstance().handleCombatEvent(ev);
      if (ev.type === 'HIT_SPARK') {
        const clampedX = Math.max(4, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 4, ev.x));
        const clampedY = Math.max(4, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 4, ev.y));
        const spark = this.add.image(clampedX, clampedY, 'hit_spark');
        spark.setOrigin(0.5, 0.5);
        spark.setDisplaySize(8, 8);
        spark.setDepth(25);
        this.visualEffects.push({
          id: ev.id,
          type: ev.type,
          sprite: spark,
          elapsedMs: 0,
          totalDurationMs: 150,
        });
      } else if (ev.type === 'TANK_EXPLOSION') {
        // Tank explosion max size 32x32 -> clamp center within [16, 192] so it stays 100% inside Canvas
        const clampedX = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 16, ev.x));
        const clampedY = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 16, ev.y));
        const exp = this.add.image(clampedX, clampedY, 'explosion_1');
        exp.setOrigin(0.5, 0.5);
        exp.setDisplaySize(16, 16);
        exp.setDepth(26);
        this.visualEffects.push({
          id: ev.id,
          type: ev.type,
          sprite: exp,
          elapsedMs: 0,
          totalDurationMs: 700, // Exactly 0.7s according to M3/M4 spec
        });
      } else if (ev.type === 'BASE_EXPLOSION') {
        // Eagle explosion max size 48x48 -> clamp center within [24, 184] so it stays 100% inside Canvas
        const clampedX = Math.max(24, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 24, ev.x));
        const clampedY = Math.max(24, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 24, ev.y));
        const exp = this.add.image(clampedX, clampedY, 'eagle_exp_1');
        exp.setOrigin(0.5, 0.5);
        exp.setDisplaySize(24, 24);
        exp.setDepth(27);
        this.visualEffects.push({
          id: ev.id,
          type: ev.type,
          sprite: exp,
          elapsedMs: 0,
          totalDurationMs: 800, // 0.8s majestic grand golden explosion
        });
      }
    }

    // 7. Update Active Visual Effects (frozen when PAUSED)
    if (state.matchState !== 'PAUSED') {
      const remainingEffects: ActiveVisualEffect[] = [];
      for (const eff of this.visualEffects) {
        eff.elapsedMs += delta;
        if (eff.elapsedMs >= eff.totalDurationMs) {
          eff.sprite.destroy();
        } else {
          remainingEffects.push(eff);
          if (eff.type === 'TANK_EXPLOSION') {
            const progress = eff.elapsedMs / eff.totalDurationMs;
            if (progress < 0.25) {
              eff.sprite.setTexture('explosion_1');
              eff.sprite.setDisplaySize(16, 16);
            } else if (progress < 0.55) {
              eff.sprite.setTexture('explosion_2');
              eff.sprite.setDisplaySize(24, 24);
            } else if (progress < 0.8) {
              eff.sprite.setTexture('explosion_3');
              eff.sprite.setDisplaySize(32, 32);
            } else {
              eff.sprite.setTexture('explosion_4');
              eff.sprite.setDisplaySize(24, 24);
            }
          } else if (eff.type === 'BASE_EXPLOSION') {
            // Distinct Eagle Base Explosion frames: radiant white, golden amber, shockwave rings
            const progress = eff.elapsedMs / eff.totalDurationMs;
            if (progress < 0.25) {
              eff.sprite.setTexture('eagle_exp_1');
              eff.sprite.setDisplaySize(24, 24);
            } else if (progress < 0.55) {
              eff.sprite.setTexture('eagle_exp_2');
              eff.sprite.setDisplaySize(36, 36);
            } else if (progress < 0.8) {
              eff.sprite.setTexture('eagle_exp_3');
              eff.sprite.setDisplaySize(48, 48);
            } else {
              eff.sprite.setTexture('eagle_exp_4');
              eff.sprite.setDisplaySize(36, 36);
            }
          } else if (eff.type === 'HIT_SPARK') {
            eff.sprite.setAlpha(Math.max(0, 1.0 - eff.elapsedMs / eff.totalDurationMs));
          }
        }
      }
      this.visualEffects = remainingEffects;
    }

    // 8. Update Dynamic Terrain (Bricks & Base)
    this.syncDynamicTerrain(state);

    // 9. Report state to React
    if (this.onStateCallback) {
      this.onStateCallback(state);
    }
  }

  public refreshAllTerrain(): void {
    // Clean up existing visual effects
    for (const eff of this.visualEffects) {
      eff.sprite.destroy();
    }
    this.visualEffects = [];

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
          const normalTexKey = 'tile_9';
          const ruinedTexKey = 'tile_9_ruined';
          const texKey = terrain.isBaseDestroyed ? ruinedTexKey : normalTexKey;

          const baseImg = this.add.image(x, y, texKey);
          baseImg.setOrigin(0, 0);
          baseImg.setDisplaySize(tileSize, tileSize);
          baseImg.setDepth(2);
          this.terrainSprites.set(`base_${r}_${c}`, baseImg);
          this.baseSprites.push({
            sprite: baseImg,
            row: r,
            col: c,
            normalTexKey,
            ruinedTexKey,
          });
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
      const img = this.add.image(x, y, 'tile_1');
      img.setOrigin(0, 0);
      img.setDisplaySize(16, 16);
      img.setDepth(1);
      (img as any).renderedMask = mask;
      this.terrainSprites.set(key, img);
      return;
    }

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

    (container as any).renderedMask = mask;
    this.terrainSprites.set(key, container);
  }

  private syncDynamicTerrain(state: GameCoreState): void {
    const terrain = state.terrain;

    // Check base ruins: switch to ruined if destroyed, restore intact if not destroyed
    if (terrain.isBaseDestroyed) {
      for (const item of this.baseSprites) {
        const targetRuined = item.ruinedTexKey || 'tile_9_ruined';
        if (item.sprite.active && item.sprite.texture.key !== targetRuined) {
          item.sprite.setTexture(targetRuined);
        }
      }
    } else {
      for (const item of this.baseSprites) {
        if (item.sprite.active && item.sprite.texture.key !== item.normalTexKey) {
          item.sprite.setTexture(item.normalTexKey);
        }
      }
    }

    // Sync any modified brick tiles in real time
    for (const [key, mask] of Object.entries(terrain.brickSubTiles)) {
      const [rStr, cStr] = key.split('_');
      const r = parseInt(rStr, 10);
      const c = parseInt(cStr, 10);
      const spriteKey = `brick_${r}_${c}`;
      const existing = this.terrainSprites.get(spriteKey);

      if (mask === 0) {
        if (existing) {
          existing.destroy();
          this.terrainSprites.delete(spriteKey);
        }
      } else {
        const renderedMask = (existing as any)?.renderedMask;
        if (!existing || renderedMask !== mask) {
          this.renderBrickTile(r, c, mask);
        }
      }
    }

    // Audio match state change handling (pause/resume/gameover/stageclear)
    if (this.lastMatchState !== state.matchState) {
      if (state.matchState === 'PAUSED') {
        SoundManager.getInstance().pauseBgm();
      } else if (state.matchState === 'PLAYING') {
        SoundManager.getInstance().resumeBgm();
      } else if (state.matchState === 'STAGE_CLEAR') {
        SoundManager.getInstance().stopBgm();
        SoundManager.getInstance().playStageClear();
      } else if (state.matchState === 'GAME_OVER') {
        SoundManager.getInstance().stopBgm();
        SoundManager.getInstance().playGameOver();
      }
      this.lastMatchState = state.matchState;
    }
  }
}
