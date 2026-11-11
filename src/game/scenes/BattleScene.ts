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
import { GameEngine, NEUTRAL_INPUT } from '../../core/gameEngine.ts';
import { generateTileTextures } from '../textureGenerator.ts';
import { SoundManager } from '../../core/audio.ts';
import { CoopOnlineManager } from '../../core/coopOnlineManager.ts';

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
  private p2Sprite?: Phaser.GameObjects.Image;
  private p2ShieldSprite?: Phaser.GameObjects.Image;
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
  private lastStageRunSeq: number = -1;
  private lastTickCount: number = -1;
  private lastMatchState: string = '';
  private onStateCallback?: (state: GameCoreState) => void;
  private onFpsCallback?: (fps: number) => void;
  private fpsAccumulatorMs = 0;
  private fpsFrameCount = 0;
  private unsubOnlineSnapshots?: () => void;
  private lastDispatchMonotonicMs: number = 0;
  private bgTimerId: ReturnType<typeof setInterval> | null = null;
  private visibilityChangeHandler?: () => void;

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
    this.engine.setOnGuestSnapshotAppliedCallback((seq, stageRunSeq, tickCount) => {
      CoopOnlineManager.getInstance().syncGuestAppliedSnapshotMeta(seq, stageRunSeq, tickCount);
    });
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

  private renderedBrickMasks: Map<string, number> = new Map();
  private hudSyncAccumulatorMs: number = 0;
  private lastHudSignature: string = '';

  public setPauseCallback(cb: () => void): void {
    this.onPauseCallback = cb;
  }

  public setFpsLimit(_limit: number = 60): void {
    // Keep native requestAnimationFrame loop (fpsLimit = 0 in Phaser TimeStep)
    // to prevent stepLimitFPS from skipping frames on 60Hz displays.
  }

  private startBackgroundHostTimer(): void {
    if (this.bgTimerId !== null) return;
    this.bgTimerId = setInterval(() => {
      const nowPerf =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now();
      this.dispatchSimulationStep('BG_TIMER', nowPerf, 16);
    }, 16);
  }

  private stopBackgroundHostTimer(): void {
    if (this.bgTimerId !== null) {
      clearInterval(this.bgTimerId);
      this.bgTimerId = null;
    }
  }

  private readCurrentLocalInput(): InputState {
    const ext = this.engine.getExternalInput();
    return {
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
  }

  private reportHudStateIfNeeded(elapsedMs: number, state: GameCoreState): void {
    if (!this.onStateCallback) return;
    this.hudSyncAccumulatorMs += elapsedMs;
    const sig = `${state.matchState}|${state.stageRunSeq}|${state.remainingSeconds}|${state.score}|${state.p1State.lives}|${state.p1State.isDead}|${state.p2State?.lives ?? -1}|${state.p2State?.isDead ?? false}|${state.totalDefeatedEnemies}|${state.enemyQueue.length}|${state.enemies.length}|${state.isGameOver}|${state.isStageClear}|${state.isTimeoutGameOver}|${state.terrain.isBaseDestroyed}`;
    if (sig !== this.lastHudSignature || this.hudSyncAccumulatorMs >= 100) {
      this.lastHudSignature = sig;
      this.hudSyncAccumulatorMs = 0;
      this.onStateCallback({ ...state });
    }
  }

  /**
   * Cổng điều phối mô phỏng đơn nhất (Unified Monotonic Simulation Dispatcher) giữa RAF và BG_TIMER.
   */
  public dispatchSimulationStep(
    source: 'RAF' | 'BG_TIMER',
    nowPerfMs: number = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now(),
    fallbackDeltaMs: number = 0
  ): number {
    let rawElapsedMs = 0;
    if (this.lastDispatchMonotonicMs <= 0) {
      this.lastDispatchMonotonicMs = nowPerfMs;
      rawElapsedMs = fallbackDeltaMs > 0 ? fallbackDeltaMs : 16.6666667;
    } else {
      rawElapsedMs = nowPerfMs - this.lastDispatchMonotonicMs;
      if (!Number.isFinite(rawElapsedMs) || rawElapsedMs <= 0) {
        if (source === 'RAF' && fallbackDeltaMs > 0 && Number.isFinite(fallbackDeltaMs)) {
          rawElapsedMs = fallbackDeltaMs;
          this.lastDispatchMonotonicMs = nowPerfMs;
        } else {
          return 0;
        }
      } else {
        this.lastDispatchMonotonicMs = nowPerfMs;
      }
    }

    const input = this.readCurrentLocalInput();

    if (this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE') {
      const coopManager = CoopOnlineManager.getInstance();
      const onlineRole = coopManager.getRole();
      if (onlineRole === 'HOST') {
        const isHostHidden =
          typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const effectiveHostInput = isHostHidden ? { ...NEUTRAL_INPUT } : input;
        if (isHostHidden) {
          this.engine.setExternalInput({ ...NEUTRAL_INPUT });
        }
        this.engine.setExternalInputP2(coopManager.getLatestValidatedGuestInput(Date.now()));
        this.engine.advanceTime(rawElapsedMs, effectiveHostInput, { isHostHidden });
        void coopManager.onHostSimulationFrame(rawElapsedMs, this.engine.getState());
      } else if (onlineRole === 'GUEST') {
        // Guest tuyệt đối không gọi advanceTime hay stepTick
        void coopManager.submitGuestInput(input);
        this.engine.setExternalInputP2(input);
        this.engine.advanceGuestVisualInterpolation(rawElapsedMs);
      } else {
        this.engine.advanceTime(rawElapsedMs, input);
      }
    } else {
      this.engine.advanceTime(rawElapsedMs, input);
    }

    if (source === 'BG_TIMER') {
      this.reportHudStateIfNeeded(rawElapsedMs, this.engine.getState());
    }

    return rawElapsedMs;
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
    this.engine.on('P2_SHOOT', () => {
      SoundManager.getInstance().playP1Shoot();
    });
    this.engine.on('ENEMY_SHOOT', () => {
      SoundManager.getInstance().playEnemyShoot();
    });

    // 8. Wire Guest snapshot confirmation callback & subscribe to Co-op Online snapshots
    this.engine.setOnGuestSnapshotAppliedCallback((seq, stageRunSeq, tickCount) => {
      CoopOnlineManager.getInstance().syncGuestAppliedSnapshotMeta(seq, stageRunSeq, tickCount);
    });

    if (this.unsubOnlineSnapshots) {
      this.unsubOnlineSnapshots();
    }
    this.unsubOnlineSnapshots = CoopOnlineManager.getInstance().subscribeSnapshots((snapshot) => {
      if (
        this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE' &&
        CoopOnlineManager.getInstance().getRole() === 'GUEST'
      ) {
        const prevState = this.engine.getState();
        const prevStageId = prevState.currentStageId;
        const prevStageRunSeq = prevState.stageRunSeq;
        const res = this.engine.applyAuthoritativeSnapshot(snapshot);
        if (!res.valid) {
          return false;
        }
        if (
          snapshot.currentStageId !== prevStageId ||
          snapshot.stageRunSeq !== prevStageRunSeq
        ) {
          this.refreshAllTerrain();
        }
        return true;
      }
      return true;
    });

    // 9. Setup visibilitychange listener for SOLO/AI safety pause and TWO_PLAYERS_ONLINE Host BG_TIMER
    if (typeof document !== 'undefined') {
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      }
      this.visibilityChangeHandler = () => {
        if (document.visibilityState === 'hidden') {
          const mode = this.engine.getGameMode();
          const role = CoopOnlineManager.getInstance().getRole();
          if (mode === 'TWO_PLAYERS_ONLINE' && role === 'HOST') {
            this.engine.setExternalInput({ ...NEUTRAL_INPUT });
            this.startBackgroundHostTimer();
          } else if (
            (mode === 'SOLO' || mode === 'TWO_PLAYERS_AI') &&
            this.engine.getState().matchState === 'PLAYING'
          ) {
            this.engine.setExternalInput({ ...NEUTRAL_INPUT });
            this.engine.pauseMatch();
            this.reportHudStateIfNeeded(0, this.engine.getState());
          }
        } else {
          this.stopBackgroundHostTimer();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopBackgroundHostTimer();
      if (this.unsubOnlineSnapshots) {
        this.unsubOnlineSnapshots();
        this.unsubOnlineSnapshots = undefined;
      }
      if (typeof document !== 'undefined' && this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
        this.visibilityChangeHandler = undefined;
      }
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

    // 0. Read true unsmoothed frame delta from Phaser loop
    const rawDelta =
      this.game && this.game.loop && this.game.loop.rawDelta > 0
        ? this.game.loop.rawDelta
        : delta;

    // Update FPS measurement (reported every ~500ms)
    this.fpsAccumulatorMs += rawDelta;
    this.fpsFrameCount++;
    if (this.fpsAccumulatorMs >= 500) {
      const calculatedFps = Math.max(1, Math.round((this.fpsFrameCount * 1000) / this.fpsAccumulatorMs));
      this.onFpsCallback?.(calculatedFps);
      this.engine.setReportedRenderFps(calculatedFps);
      this.fpsAccumulatorMs = 0;
      this.fpsFrameCount = 0;
    }

    // 1. Dispatch simulation step through unified monotonic dispatcher
    const nowPerf =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    this.dispatchSimulationStep('RAF', nowPerf, rawDelta);
    const state = this.engine.getState();

    // Check if stage was restarted or stage was changed
    if (
      (this.lastStageId !== -1 && this.lastStageId !== state.currentStageId) ||
      (this.lastStageRunSeq !== -1 && this.lastStageRunSeq !== state.stageRunSeq) ||
      (this.lastTickCount >= 0 && state.tickCount < this.lastTickCount)
    ) {
      this.refreshAllTerrain();
    }
    this.lastStageId = state.currentStageId;
    this.lastStageRunSeq = state.stageRunSeq;
    this.lastTickCount = state.tickCount;

    const isOnlineGuest =
      this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE' &&
      CoopOnlineManager.getInstance().getRole() === 'GUEST';
    const guestVisual = isOnlineGuest ? this.engine.getGuestVisualState() : null;

    // 3. Update P1 Tank & Shield
    if (this.p1Sprite) {
      if (state.p1.isAlive && !state.p1State.isDead) {
        this.p1Sprite.setPosition(state.p1.x, state.p1.y);
        this.p1Sprite.setTexture(`tank_p1_${state.p1.direction.toLowerCase()}`);
        this.p1Sprite.setVisible(true);

        const hasShield = state.p1.isShielded || state.p1State.shieldTimer > 0;
        if (hasShield) {
          const p1ShieldTimerForVisual = guestVisual
            ? guestVisual.p1VisualShieldTimer
            : state.p1State.shieldTimer;
          const pulsePhase = Math.floor(p1ShieldTimerForVisual * 10) % 2 === 0;
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

    // 3b. Update P2 Tank & Shield (if P2 exists in 2-Player mode)
    if (state.p2) {
      const p2RenderX = guestVisual ? guestVisual.p2RenderX : state.p2.x;
      const p2RenderY = guestVisual ? guestVisual.p2RenderY : state.p2.y;
      const p2RenderDir = guestVisual ? guestVisual.p2RenderDirection : state.p2.direction;

      if (!this.p2Sprite) {
        this.p2Sprite = this.add.image(p2RenderX, p2RenderY, `tank_p2_${p2RenderDir.toLowerCase()}`);
        this.p2Sprite.setOrigin(0, 0);
        this.p2Sprite.setDisplaySize(16, 16);
        this.p2Sprite.setDepth(10);
      }
      if (!this.p2ShieldSprite) {
        this.p2ShieldSprite = this.add.image(p2RenderX - 1, p2RenderY - 1, 'shield_aura');
        this.p2ShieldSprite.setOrigin(0, 0);
        this.p2ShieldSprite.setDisplaySize(18, 18);
        this.p2ShieldSprite.setDepth(12);
        this.p2ShieldSprite.setVisible(false);
      }

      if (state.p2.isAlive && (!state.p2State || !state.p2State.isDead)) {
        this.p2Sprite.setPosition(p2RenderX, p2RenderY);
        this.p2Sprite.setTexture(`tank_p2_${p2RenderDir.toLowerCase()}`);
        this.p2Sprite.setVisible(true);

        const hasShield = state.p2.isShielded || (state.p2State && state.p2State.shieldTimer > 0);
        if (hasShield) {
          const p2ShieldTimerForVisual = guestVisual
            ? guestVisual.p2VisualShieldTimer
            : (state.p2State?.shieldTimer ?? 1);
          const pulsePhase = Math.floor(p2ShieldTimerForVisual * 10) % 2 === 0;
          const tankAlpha = pulsePhase ? 0.7 : 1.0;
          const auraAlpha = pulsePhase ? 0.95 : 0.45;

          this.p2Sprite.setAlpha(tankAlpha);
          if (this.p2ShieldSprite) {
            this.p2ShieldSprite.setPosition(p2RenderX - 1, p2RenderY - 1);
            this.p2ShieldSprite.setVisible(true);
            this.p2ShieldSprite.setAlpha(auraAlpha);
          }
        } else {
          this.p2Sprite.setAlpha(1.0);
          if (this.p2ShieldSprite) {
            this.p2ShieldSprite.setVisible(false);
          }
        }
      } else {
        this.p2Sprite.setVisible(false);
        this.p2Sprite.setAlpha(1.0);
        if (this.p2ShieldSprite) this.p2ShieldSprite.setVisible(false);
      }
    } else {
      if (this.p2Sprite) this.p2Sprite.setVisible(false);
      if (this.p2ShieldSprite) this.p2ShieldSprite.setVisible(false);
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
      SoundManager.getInstance().handleCombatEvent(ev, {
        isPaused: state.matchState === 'PAUSED',
        isGameOver: state.matchState === 'GAME_OVER',
      });
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
      } else if (ev.type === 'TANK_EXPLOSION' || ev.type === 'P1_EXPLOSION') {
        // Tank explosion max size 32x32 -> clamp center within [16, 192] so it stays 100% inside Canvas
        const clampedX = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 16, ev.x));
        const clampedY = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 16, ev.y));
        const exp = this.add.image(clampedX, clampedY, 'explosion_1');
        exp.setOrigin(0.5, 0.5);
        exp.setDisplaySize(16, 16);
        exp.setDepth(ev.type === 'P1_EXPLOSION' ? 28 : 26);
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
          if (eff.type === 'TANK_EXPLOSION' || eff.type === 'P1_EXPLOSION') {
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

    // 9. Report state to React (immediately on key HUD state change or every ~100ms)
    this.reportHudStateIfNeeded(rawDelta, state);
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
    this.renderedBrickMasks.clear();
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
          const initialMask = terrain.brickSubTiles[`${r}_${c}`] ?? SUB_TILE_MASKS.ALL;
          this.renderBrickTile(r, c, initialMask);
          this.renderedBrickMasks.set(`${r}_${c}`, initialMask);
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

    // Sync only modified brick tiles (fast Map lookup avoids per-frame string splitting)
    const subTiles = terrain.brickSubTiles;
    for (const key in subTiles) {
      const mask = subTiles[key];
      const prevMask = this.renderedBrickMasks.get(key);
      if (prevMask === mask) continue;

      this.renderedBrickMasks.set(key, mask);
      const sepIdx = key.indexOf('_');
      const r = parseInt(key.slice(0, sepIdx), 10);
      const c = parseInt(key.slice(sepIdx + 1), 10);
      const spriteKey = `brick_${r}_${c}`;
      const existing = this.terrainSprites.get(spriteKey);

      if (mask === 0) {
        if (existing) {
          existing.destroy();
          this.terrainSprites.delete(spriteKey);
        }
      } else {
        this.renderBrickTile(r, c, mask);
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
