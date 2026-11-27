/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';
import { MAP_DIMENSIONS, BULLET_CONFIG } from '../../core/constants.ts';
import {
  TILE_TYPES,
  SUB_TILE_MASKS,
  type InputState,
  type GameCoreState,
} from '../../core/types.ts';
import { GameEngine, NEUTRAL_INPUT } from '../../core/gameEngine.ts';
import { generateTileTextures } from '../textureGenerator.ts';
import {
  RENDER_CONFIG,
  logicalToRenderPx,
  logicalToRenderPoint,
  logicalToRenderRect,
  tileGridToRenderPoint,
} from '../renderConfig.ts';
import { SoundManager } from '../../core/audio.ts';
import { MusicManager } from '../../core/musicManager.ts';
import { CoopOnlineManager } from '../../core/coopOnlineManager.ts';
import { EAGLE_SHIELD_SIDE_WALL_COORDS } from '../../core/supportItemSystem.ts';

const BATTLE_RENDER_DEPTH = {
  BACKGROUND: 0,
  TERRAIN: 1,
  EAGLE_BASE: 2,
  ENEMY_TANK: 9,
  PLAYER_TANK: 10,
  ENEMY_SHIELD: 11,
  PLAYER_SHIELD: 12,
  BULLET: 15,
  VS_SAFE_ZONE: 18,
  GRASS: 20,
  SUPPORT_ITEM: 22,
  HIT_SPARK: 25,
  TANK_EXPLOSION: 26,
  BASE_EXPLOSION: 27,
  P1_EXPLOSION: 28,
} as const;

const LOGICAL_SHIELD_OFFSET_PX = 1;
const LOGICAL_SHIELD_SIZE_PX = 18;
const RENDER_SHIELD_SIZE_PX = logicalToRenderPx(LOGICAL_SHIELD_SIZE_PX); // 72
const RENDER_BULLET_SIZE_PX = logicalToRenderPx(BULLET_CONFIG.SIZE); // 16
const RENDER_SUPPORT_TIMER_OFFSET_PX = logicalToRenderPx(15); // 60
const RENDER_SUPPORT_TIMER_FONT_PX = logicalToRenderPx(7); // 28
const RENDER_SUPPORT_TIMER_PAD_X_PX = logicalToRenderPx(1); // 4

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
  private vsAiSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private vsAiShieldSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private vsSafeZoneGraphics?: Phaser.GameObjects.Graphics;
  private bulletSprites: Map<string, Phaser.GameObjects.Image> = new Map();
  private supportItemSprites: Map<
    string,
    {
      container: Phaser.GameObjects.Container;
      icon: Phaser.GameObjects.Image;
      timerText: Phaser.GameObjects.Text;
    }
  > = new Map();
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
  private unsubPeerLeave?: () => void;
  private p1VisualPos: { x: number; y: number } | null = null;
  private p2VisualPos: { x: number; y: number } | null = null;
  private enemyVisualPositions: Map<string, { x: number; y: number }> = new Map();
  private vsAiVisualPositions: Map<string, { x: number; y: number }> = new Map();
  private bulletVisualPositions: Map<string, { x: number; y: number }> = new Map();
  private targetFpsLimit: 30 | 60 = 60;
  private renderThrottleAccumulatorMs: number = 0;
  private activeEnemyIds: Set<string> = new Set();
  private activeBulletIds: Set<string> = new Set();
  private lastDispatchMonotonicMs: number = 0;
  private bgTimerId: ReturnType<typeof setInterval> | null = null;
  private visibilityChangeHandler?: () => void;
  private windowBlurHandler?: () => void;
  private windowFocusHandler?: () => void;

  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    J: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private vsP2Keys?: {
    ENTER: Phaser.Input.Keyboard.Key;
    K: Phaser.Input.Keyboard.Key;
    NUMPAD_ZERO: Phaser.Input.Keyboard.Key;
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
  private renderedSteelMasks: Map<string, number> = new Map();
  private hudSyncAccumulatorMs: number = 0;
  private lastHudSignature: string = '';

  public setPauseCallback(cb: () => void): void {
    this.onPauseCallback = cb;
  }

  public setFpsLimit(limit: number = 60): void {
    this.targetFpsLimit = limit === 30 ? 30 : 60;
    this.renderThrottleAccumulatorMs = 0;
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

  public resetLocalInputState(): void {
    this.engine.clearAllInputs();
    try {
      this.cursors?.up?.reset();
      this.cursors?.down?.reset();
      this.cursors?.left?.reset();
      this.cursors?.right?.reset();
      this.cursors?.space?.reset();
      this.cursors?.shift?.reset();
      this.wasd?.W?.reset();
      this.wasd?.A?.reset();
      this.wasd?.S?.reset();
      this.wasd?.D?.reset();
      this.wasd?.J?.reset();
      this.wasd?.SPACE?.reset();
      this.vsP2Keys?.ENTER?.reset();
      this.vsP2Keys?.K?.reset();
      this.vsP2Keys?.NUMPAD_ZERO?.reset();
      this.input?.keyboard?.resetKeys();
    } catch {
      // Ignore if keyboard plugin is not initialized in headless test environment
    }
  }

  // M7.8 Mục II: Chế độ VS chỉ chạy trực tuyến trên 2 thiết bị riêng biệt (Host=P1, Guest=P2).
  // Đã loại bỏ hoàn toàn cơ chế điều khiển 2 người trên cùng 1 thiết bị.
  private readCurrentLocalInput(isGuest: boolean = false): InputState {
    const state = this.engine.getState();
    const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    if (state.matchState !== 'PLAYING' || isHidden) {
      this.resetLocalInputState();
      return { ...NEUTRAL_INPUT };
    }
    const touch = isGuest
      ? this.engine.getVirtualTouchInputP2()
      : this.engine.getVirtualTouchInput();
    const ext = isGuest ? { ...NEUTRAL_INPUT } : this.engine.getExternalInput();
    return {
      up: Boolean(this.cursors?.up.isDown || this.wasd?.W.isDown || touch.up || ext.up),
      down: Boolean(this.cursors?.down.isDown || this.wasd?.S.isDown || touch.down || ext.down),
      left: Boolean(this.cursors?.left.isDown || this.wasd?.A.isDown || touch.left || ext.left),
      right: Boolean(this.cursors?.right.isDown || this.wasd?.D.isDown || touch.right || ext.right),
      shoot: Boolean(
        this.cursors?.space.isDown ||
          this.wasd?.SPACE.isDown ||
          this.wasd?.J.isDown ||
          touch.shoot ||
          ext.shoot
      ),
    };
  }

  private resetGuestVisualSmoothing(): void {
    this.p1VisualPos = null;
    this.p2VisualPos = null;
    this.enemyVisualPositions.clear();
    this.vsAiVisualPositions.clear();
    this.bulletVisualPositions.clear();
  }

  private computeSmoothedPos(
    prev: { x: number; y: number } | null | undefined,
    targetX: number,
    targetY: number,
    rawDeltaMs: number,
    ratePerSec: number = 22,
    snapThresholdPx: number = 16
  ): { x: number; y: number } {
    if (!prev) {
      return { x: targetX, y: targetY };
    }
    const dx = targetX - prev.x;
    const dy = targetY - prev.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist > snapThresholdPx || dist < 0.05) {
      return { x: targetX, y: targetY };
    }
    const dtSec = Math.min(Math.max(rawDeltaMs, 1), 100) / 1000;
    const alpha = Math.min(1, 1 - Math.exp(-ratePerSec * dtSec));
    return {
      x: prev.x + dx * alpha,
      y: prev.y + dy * alpha,
    };
  }

  private reportHudStateIfNeeded(elapsedMs: number, state: GameCoreState): void {
    if (!this.onStateCallback) return;
    this.hudSyncAccumulatorMs += elapsedMs;
    const itemSys = state.itemSystem;
    const itemSig = itemSys
      ? `${itemSys.activeItems.length}:${itemSys.totalSpawnedCount}:${itemSys.eagleShieldSecondsRemaining}:${itemSys.p1Effects.firepowerSecondsRemaining}:${itemSys.p1Effects.speedBoostSecondsRemaining}:${itemSys.p2Effects.firepowerSecondsRemaining}:${itemSys.p2Effects.speedBoostSecondsRemaining}`
      : 'no_items';
    const vs = state.vsState;
    const vsSig = vs
      ? `${vs.phase}:${vs.normalRemainingSeconds}:${vs.suddenDeathElapsedSeconds}:${vs.safeZone.shrinkLevel}:${vs.safeZone.secondsUntilNextShrink}:${vs.anyTankInDangerZone}:${vs.team1.totalKills}:${vs.team2.totalKills}:${vs.outcome?.winnerTeam ?? 'none'}:${vs.combatants.map((c) => `${c.lives}/${c.isDead}/${c.respawnSecondsRemaining}/${c.protectionSecondsRemaining}/${c.inDangerZone}`).join(',')}`
      : 'no_vs';
    const sig = `${state.matchState}|${state.stageRunSeq}|${state.remainingSeconds}|${state.score}|${state.p1State.lives}|${state.p1State.isDead}|${Boolean(state.p1State.isSpectator)}|${state.p2State?.lives ?? -1}|${state.p2State?.isDead ?? false}|${Boolean(state.p2State?.isSpectator)}|${state.peerLeaveNotice ?? ''}|${state.totalDefeatedEnemies}|${state.enemyQueue.length}|${state.enemies.length}|${state.isGameOver}|${state.isStageClear}|${state.isTimeoutGameOver}|${state.terrain.isBaseDestroyed}|${itemSig}|${vsSig}`;
    if (sig !== this.lastHudSignature || this.hudSyncAccumulatorMs >= 1000) {
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

    const coopManager = CoopOnlineManager.getInstance();
    const isVsMode = this.engine.isVsMode();
    const isOnlineMode = this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE' || isVsMode;
    const onlineRole = isOnlineMode ? coopManager.getRole() : null;
    const isOnlineGuest = isOnlineMode && onlineRole === 'GUEST';

    if (isOnlineMode) {
      const input = this.readCurrentLocalInput(isOnlineGuest);
      if (onlineRole === 'HOST') {
        if (coopManager.hasPeerActivelyLeft('GUEST')) {
          if (isVsMode) {
            this.engine.forfeitVsMatch('P2');
          } else {
            this.engine.handlePeerPlayerLeft('P2');
          }
        }
        const isHostHidden =
          typeof document !== 'undefined' && document.visibilityState === 'hidden';
        const isHostSpectator = !isVsMode && this.engine.isPlayerSpectator('P1');
        const effectiveHostInput =
          isHostHidden || isHostSpectator ? { ...NEUTRAL_INPUT } : input;
        if (isHostHidden || isHostSpectator) {
          this.engine.setExternalInput({ ...NEUTRAL_INPUT });
        }
        this.engine.setExternalInputP2(coopManager.getLatestValidatedGuestInput(Date.now()));
        this.engine.advanceTime(rawElapsedMs, effectiveHostInput, { isHostHidden });
        void coopManager.onHostSimulationFrame(rawElapsedMs, this.engine.getState());
      } else if (onlineRole === 'GUEST') {
        if (coopManager.hasPeerActivelyLeft('HOST')) {
          if (isVsMode) {
            this.engine.forfeitVsMatch('P1');
          } else {
            this.engine.handlePeerPlayerLeft('P1');
          }
        }
        // Guest tuyệt đối không gọi advanceTime hay stepTick (cả CO-OP ONLINE lẫn VS ONLINE)
        const isGuestSpectator = !isVsMode && this.engine.isPlayerSpectator('P2');
        coopManager.setLocalGuestSpectator(isGuestSpectator);
        if (isGuestSpectator) {
          this.engine.setExternalInputP2({ ...NEUTRAL_INPUT });
        } else {
          void coopManager.submitGuestInput(input);
          this.engine.setExternalInputP2(input);
        }
        this.engine.advanceGuestVisualInterpolation(rawElapsedMs);
      } else if (!isVsMode) {
        this.engine.advanceTime(rawElapsedMs, input);
      }
    } else {
      const input = this.readCurrentLocalInput(false);
      const isP1Spectator = this.engine.isPlayerSpectator('P1');
      const effectiveInput = isP1Spectator ? { ...NEUTRAL_INPUT } : input;
      this.engine.advanceTime(rawElapsedMs, effectiveInput);
    }

    if (source === 'BG_TIMER') {
      this.reportHudStateIfNeeded(rawElapsedMs, this.engine.getState());
    }

    return rawElapsedMs;
  }

  create(): void {
    // 1. Generate fallback procedural textures (tiles, tank, bullet, enemies, ruined base, VFX)
    generateTileTextures(this);

    // 2. Black background (832x832 projected render surface)
    this.add
      .rectangle(
        0,
        0,
        RENDER_CONFIG.RENDER_WORLD_WIDTH_PX,
        RENDER_CONFIG.RENDER_WORLD_HEIGHT_PX,
        0x000000
      )
      .setOrigin(0, 0)
      .setDepth(BATTLE_RENDER_DEPTH.BACKGROUND);

    // 3. Render initial terrain
    this.refreshAllTerrain();

    // 4. Create Tank P1 Sprite
    const p1 = this.engine.getState().p1;
    const p1RenderPos = logicalToRenderPoint(p1.x, p1.y);
    this.p1Sprite = this.add.image(
      p1RenderPos.x,
      p1RenderPos.y,
      `tank_p1_${p1.direction.toLowerCase()}`
    );
    this.p1Sprite.setOrigin(0, 0);
    this.p1Sprite.setDisplaySize(
      RENDER_CONFIG.RENDER_TILE_SIZE_PX,
      RENDER_CONFIG.RENDER_TILE_SIZE_PX
    );
    this.p1Sprite.setDepth(BATTLE_RENDER_DEPTH.PLAYER_TANK);

    // 5. Create P1 Shield Aura Sprite
    const p1ShieldRenderPos = logicalToRenderPoint(
      p1.x - LOGICAL_SHIELD_OFFSET_PX,
      p1.y - LOGICAL_SHIELD_OFFSET_PX
    );
    this.p1ShieldSprite = this.add.image(p1ShieldRenderPos.x, p1ShieldRenderPos.y, 'shield_aura');
    this.p1ShieldSprite.setOrigin(0, 0);
    this.p1ShieldSprite.setDisplaySize(RENDER_SHIELD_SIZE_PX, RENDER_SHIELD_SIZE_PX);
    this.p1ShieldSprite.setDepth(BATTLE_RENDER_DEPTH.PLAYER_SHIELD);
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
      this.vsP2Keys = {
        ENTER: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
        K: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K),
        NUMPAD_ZERO: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO),
      };
      this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.keyEsc = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    }

    // 6b. Create Sudden Death Safe Zone / Danger Zone Graphics Overlay (VS mode only)
    this.vsSafeZoneGraphics = this.add.graphics();
    this.vsSafeZoneGraphics.setDepth(BATTLE_RENDER_DEPTH.VS_SAFE_ZONE);

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
      const isOnline =
        this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE' || this.engine.isVsMode();
      if (isOnline && CoopOnlineManager.getInstance().getRole() === 'GUEST') {
        const prevState = this.engine.getState();
        const prevStageId = prevState.currentStageId;
        const prevStageRunSeq = prevState.stageRunSeq;
        const res = this.engine.applyAuthoritativeSnapshot(snapshot);
        if (!res.valid) {
          return false;
        }
        const nextState = this.engine.getState();
        if (
          snapshot.currentStageId !== prevStageId ||
          snapshot.stageRunSeq !== prevStageRunSeq
        ) {
          this.refreshAllTerrain();
        } else {
          this.syncDynamicTerrain(nextState);
        }
        this.reportHudStateIfNeeded(0, nextState);
        return true;
      }
      return true;
    });

    if (this.unsubPeerLeave) {
      this.unsubPeerLeave();
    }
    this.unsubPeerLeave = CoopOnlineManager.getInstance().subscribePeerLeave((event) => {
      const isVs = this.engine.isVsMode();
      if (this.engine.getGameMode() !== 'TWO_PLAYERS_ONLINE' && !isVs) return;
      const myRole = CoopOnlineManager.getInstance().getRole();
      if (myRole === 'HOST' && event.role === 'GUEST') {
        if (isVs) {
          this.engine.forfeitVsMatch('P2');
          void CoopOnlineManager.getInstance().onHostSimulationFrame(0, this.engine.getState());
        } else {
          this.engine.handlePeerPlayerLeft('P2', event.message);
        }
        this.reportHudStateIfNeeded(0, this.engine.getState());
      } else if (myRole === 'GUEST' && event.role === 'HOST') {
        if (isVs) {
          this.engine.forfeitVsMatch('P1');
        } else {
          this.engine.handlePeerPlayerLeft('P1', event.message);
        }
        this.reportHudStateIfNeeded(0, this.engine.getState());
      }
    });

    // 9. Setup visibilitychange and window blur/focus listeners for input neutralization, SOLO/AI safety pause, and Online Host BG_TIMER
    if (typeof document !== 'undefined') {
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      }
      this.visibilityChangeHandler = () => {
        this.resetLocalInputState();
        if (document.visibilityState === 'hidden') {
          const mode = this.engine.getGameMode();
          const role = CoopOnlineManager.getInstance().getRole();
          if ((mode === 'TWO_PLAYERS_ONLINE' || this.engine.isVsMode()) && role === 'HOST') {
            this.engine.handleVisibilityChange(false);
            this.startBackgroundHostTimer();
          } else if (
            (mode === 'SOLO' || mode === 'TWO_PLAYERS_AI') &&
            this.engine.getState().matchState === 'PLAYING'
          ) {
            this.engine.handleVisibilityChange(false, { triggerSafetyPause: true });
            this.reportHudStateIfNeeded(0, this.engine.getState());
          }
        } else {
          this.stopBackgroundHostTimer();
          this.engine.handleVisibilityChange(true);
          this.reportHudStateIfNeeded(0, this.engine.getState());
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }

    if (typeof window !== 'undefined') {
      if (this.windowBlurHandler) {
        window.removeEventListener('blur', this.windowBlurHandler);
      }
      if (this.windowFocusHandler) {
        window.removeEventListener('focus', this.windowFocusHandler);
      }
      this.windowBlurHandler = () => {
        this.resetLocalInputState();
      };
      this.windowFocusHandler = () => {
        this.resetLocalInputState();
      };
      window.addEventListener('blur', this.windowBlurHandler);
      window.addEventListener('focus', this.windowFocusHandler);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopBackgroundHostTimer();
      this.resetLocalInputState();
      this.resetGuestVisualSmoothing();
      SoundManager.getInstance().stopAllActiveActionSources();
      if (this.unsubOnlineSnapshots) {
        this.unsubOnlineSnapshots();
        this.unsubOnlineSnapshots = undefined;
      }
      if (this.unsubPeerLeave) {
        this.unsubPeerLeave();
        this.unsubPeerLeave = undefined;
      }
      if (typeof document !== 'undefined' && this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
        this.visibilityChangeHandler = undefined;
      }
      if (typeof window !== 'undefined') {
        if (this.windowBlurHandler) {
          window.removeEventListener('blur', this.windowBlurHandler);
          this.windowBlurHandler = undefined;
        }
        if (this.windowFocusHandler) {
          window.removeEventListener('focus', this.windowFocusHandler);
          this.windowFocusHandler = undefined;
        }
      }
    });
  }

  update(_time: number, delta: number): void {
    // Check Pause hotkeys (P or ESC) — disabled in TWO_PLAYERS_ONLINE & VS ONLINE (M7.8 Mục XIV)
    if (
      this.engine.getGameMode() !== 'TWO_PLAYERS_ONLINE' &&
      !this.engine.isVsMode() &&
      ((this.keyP && Phaser.Input.Keyboard.JustDown(this.keyP)) ||
        (this.keyEsc && Phaser.Input.Keyboard.JustDown(this.keyEsc)))
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

    const isPausedSteady =
      state.matchState === 'PAUSED' &&
      this.lastMatchState === 'PAUSED' &&
      this.visualEffects.length === 0;
    if (isPausedSteady) {
      this.reportHudStateIfNeeded(rawDelta, state);
      return;
    }

    // When user enables 30 FPS power-saving mode, keep simulation accurate but throttle sprite/canvas updates to ~30Hz
    if (this.targetFpsLimit === 30 && state.matchState === 'PLAYING') {
      this.renderThrottleAccumulatorMs += rawDelta;
      if (this.renderThrottleAccumulatorMs < 31) {
        this.reportHudStateIfNeeded(rawDelta, state);
        return;
      }
      this.renderThrottleAccumulatorMs = 0;
    }

    const isOnlineGuest =
      (this.engine.getGameMode() === 'TWO_PLAYERS_ONLINE' || this.engine.isVsMode()) &&
      CoopOnlineManager.getInstance().getRole() === 'GUEST';
    const guestVisual = isOnlineGuest ? this.engine.getGuestVisualState() : null;

    // 3. Update P1 Tank & Shield
    if (this.p1Sprite) {
      if (state.p1.isAlive && !state.p1State.isDead) {
        let p1LogicalX = state.p1.x;
        let p1LogicalY = state.p1.y;
        if (isOnlineGuest && state.matchState === 'PLAYING') {
          this.p1VisualPos = this.computeSmoothedPos(
            this.p1VisualPos,
            state.p1.x,
            state.p1.y,
            rawDelta,
            24,
            16
          );
          p1LogicalX = this.p1VisualPos.x;
          p1LogicalY = this.p1VisualPos.y;
        } else {
          this.p1VisualPos = null;
        }

        const p1RenderPos = logicalToRenderPoint(p1LogicalX, p1LogicalY);
        if (this.p1Sprite.x !== p1RenderPos.x || this.p1Sprite.y !== p1RenderPos.y) {
          this.p1Sprite.setPosition(p1RenderPos.x, p1RenderPos.y);
        }
        const p1TexKey = `tank_p1_${state.p1.direction.toLowerCase()}`;
        if (this.p1Sprite.texture.key !== p1TexKey) {
          this.p1Sprite.setTexture(p1TexKey);
          this.p1Sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
        if (!this.p1Sprite.visible) {
          this.p1Sprite.setVisible(true);
        }

        const hasShield = state.p1.isShielded || state.p1State.shieldTimer > 0;
        if (hasShield) {
          const p1ShieldTimerForVisual = guestVisual
            ? guestVisual.p1VisualShieldTimer
            : state.p1State.shieldTimer;
          const pulsePhase = Math.floor(p1ShieldTimerForVisual * 10) % 2 === 0;
          const tankAlpha = pulsePhase ? 0.7 : 1.0;
          const auraAlpha = pulsePhase ? 0.95 : 0.45;

          if (this.p1Sprite.alpha !== tankAlpha) {
            this.p1Sprite.setAlpha(tankAlpha);
          }

          if (this.p1ShieldSprite) {
            const p1ShieldRenderPos = logicalToRenderPoint(
              p1LogicalX - LOGICAL_SHIELD_OFFSET_PX,
              p1LogicalY - LOGICAL_SHIELD_OFFSET_PX
            );
            if (
              this.p1ShieldSprite.x !== p1ShieldRenderPos.x ||
              this.p1ShieldSprite.y !== p1ShieldRenderPos.y
            ) {
              this.p1ShieldSprite.setPosition(p1ShieldRenderPos.x, p1ShieldRenderPos.y);
            }
            if (!this.p1ShieldSprite.visible) {
              this.p1ShieldSprite.setVisible(true);
            }
            if (this.p1ShieldSprite.alpha !== auraAlpha) {
              this.p1ShieldSprite.setAlpha(auraAlpha);
            }
          }
        } else {
          if (this.p1Sprite.alpha !== 1.0) {
            this.p1Sprite.setAlpha(1.0);
          }
          if (this.p1ShieldSprite && this.p1ShieldSprite.visible) {
            this.p1ShieldSprite.setVisible(false);
          }
        }
      } else {
        this.p1VisualPos = null;
        if (this.p1Sprite.visible) this.p1Sprite.setVisible(false);
        if (this.p1Sprite.alpha !== 1.0) this.p1Sprite.setAlpha(1.0);
        if (this.p1ShieldSprite && this.p1ShieldSprite.visible) this.p1ShieldSprite.setVisible(false);
      }
    }

    // 3b. Update P2 Tank & Shield (if P2 exists in 2-Player mode)
    if (state.p2) {
      const targetP2LogicalX = guestVisual ? guestVisual.p2RenderX : state.p2.x;
      const targetP2LogicalY = guestVisual ? guestVisual.p2RenderY : state.p2.y;
      const p2RenderDir = guestVisual ? guestVisual.p2RenderDirection : state.p2.direction;

      let p2LogicalX = targetP2LogicalX;
      let p2LogicalY = targetP2LogicalY;
      if (isOnlineGuest && state.matchState === 'PLAYING' && state.p2.isAlive && (!state.p2State || !state.p2State.isDead)) {
        this.p2VisualPos = this.computeSmoothedPos(
          this.p2VisualPos,
          targetP2LogicalX,
          targetP2LogicalY,
          rawDelta,
          28,
          16
        );
        p2LogicalX = this.p2VisualPos.x;
        p2LogicalY = this.p2VisualPos.y;
      } else {
        this.p2VisualPos = null;
      }

      const p2RenderPos = logicalToRenderPoint(p2LogicalX, p2LogicalY);
      const p2ShieldRenderPos = logicalToRenderPoint(
        p2LogicalX - LOGICAL_SHIELD_OFFSET_PX,
        p2LogicalY - LOGICAL_SHIELD_OFFSET_PX
      );
      const p2TexPrefix = this.getP2TankTexturePrefix(state.gameMode);
      const p2TexKey = `${p2TexPrefix}_${p2RenderDir.toLowerCase()}`;

      if (!this.p2Sprite) {
        this.p2Sprite = this.add.image(p2RenderPos.x, p2RenderPos.y, p2TexKey);
        this.p2Sprite.setOrigin(0, 0);
        this.p2Sprite.setDisplaySize(
          RENDER_CONFIG.RENDER_TILE_SIZE_PX,
          RENDER_CONFIG.RENDER_TILE_SIZE_PX
        );
        this.p2Sprite.setDepth(BATTLE_RENDER_DEPTH.PLAYER_TANK);
      }
      if (!this.p2ShieldSprite) {
        this.p2ShieldSprite = this.add.image(
          p2ShieldRenderPos.x,
          p2ShieldRenderPos.y,
          'shield_aura'
        );
        this.p2ShieldSprite.setOrigin(0, 0);
        this.p2ShieldSprite.setDisplaySize(RENDER_SHIELD_SIZE_PX, RENDER_SHIELD_SIZE_PX);
        this.p2ShieldSprite.setDepth(BATTLE_RENDER_DEPTH.PLAYER_SHIELD);
        this.p2ShieldSprite.setVisible(false);
      }

      if (state.p2.isAlive && (!state.p2State || !state.p2State.isDead)) {
        if (this.p2Sprite.x !== p2RenderPos.x || this.p2Sprite.y !== p2RenderPos.y) {
          this.p2Sprite.setPosition(p2RenderPos.x, p2RenderPos.y);
        }
        if (this.p2Sprite.texture.key !== p2TexKey) {
          this.p2Sprite.setTexture(p2TexKey);
          this.p2Sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
        if (!this.p2Sprite.visible) {
          this.p2Sprite.setVisible(true);
        }

        const hasShield = state.p2.isShielded || (state.p2State && state.p2State.shieldTimer > 0);
        if (hasShield) {
          const p2ShieldTimerForVisual = guestVisual
            ? guestVisual.p2VisualShieldTimer
            : (state.p2State?.shieldTimer ?? 1);
          const pulsePhase = Math.floor(p2ShieldTimerForVisual * 10) % 2 === 0;
          const tankAlpha = pulsePhase ? 0.7 : 1.0;
          const auraAlpha = pulsePhase ? 0.95 : 0.45;

          if (this.p2Sprite.alpha !== tankAlpha) {
            this.p2Sprite.setAlpha(tankAlpha);
          }
          if (this.p2ShieldSprite) {
            if (
              this.p2ShieldSprite.x !== p2ShieldRenderPos.x ||
              this.p2ShieldSprite.y !== p2ShieldRenderPos.y
            ) {
              this.p2ShieldSprite.setPosition(p2ShieldRenderPos.x, p2ShieldRenderPos.y);
            }
            if (!this.p2ShieldSprite.visible) {
              this.p2ShieldSprite.setVisible(true);
            }
            if (this.p2ShieldSprite.alpha !== auraAlpha) {
              this.p2ShieldSprite.setAlpha(auraAlpha);
            }
          }
        } else {
          if (this.p2Sprite.alpha !== 1.0) {
            this.p2Sprite.setAlpha(1.0);
          }
          if (this.p2ShieldSprite && this.p2ShieldSprite.visible) {
            this.p2ShieldSprite.setVisible(false);
          }
        }
      } else {
        this.p2VisualPos = null;
        if (this.p2Sprite.visible) this.p2Sprite.setVisible(false);
        if (this.p2Sprite.alpha !== 1.0) this.p2Sprite.setAlpha(1.0);
        if (this.p2ShieldSprite && this.p2ShieldSprite.visible) this.p2ShieldSprite.setVisible(false);
      }
    } else {
      this.p2VisualPos = null;
      if (this.p2Sprite && this.p2Sprite.visible) this.p2Sprite.setVisible(false);
      if (this.p2ShieldSprite && this.p2ShieldSprite.visible) this.p2ShieldSprite.setVisible(false);
    }

    // 4. Update Enemy Sprites (reuse pre-allocated Set to prevent per-frame GC churn)
    const activeEnemyIds = this.activeEnemyIds;
    activeEnemyIds.clear();
    for (const enemy of state.enemies) {
      if (!enemy.isAlive) continue;
      activeEnemyIds.add(enemy.id);

      let enemyLogicalX = enemy.x;
      let enemyLogicalY = enemy.y;
      if (isOnlineGuest && state.matchState === 'PLAYING') {
        const smoothedEnemy = this.computeSmoothedPos(
          this.enemyVisualPositions.get(enemy.id),
          enemy.x,
          enemy.y,
          rawDelta,
          22,
          16
        );
        this.enemyVisualPositions.set(enemy.id, smoothedEnemy);
        enemyLogicalX = smoothedEnemy.x;
        enemyLogicalY = smoothedEnemy.y;
      }

      const enemyRenderPos = logicalToRenderPoint(enemyLogicalX, enemyLogicalY);
      let sprite = this.enemySprites.get(enemy.id);
      const textureKey = `tank_${enemy.enemyType.toLowerCase()}_${enemy.direction.toLowerCase()}`;

      if (!sprite) {
        sprite = this.add.image(enemyRenderPos.x, enemyRenderPos.y, textureKey);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(
          RENDER_CONFIG.RENDER_TILE_SIZE_PX,
          RENDER_CONFIG.RENDER_TILE_SIZE_PX
        );
        sprite.setDepth(BATTLE_RENDER_DEPTH.ENEMY_TANK);
        this.enemySprites.set(enemy.id, sprite);
      } else {
        if (sprite.x !== enemyRenderPos.x || sprite.y !== enemyRenderPos.y) {
          sprite.setPosition(enemyRenderPos.x, enemyRenderPos.y);
        }
        if (sprite.texture.key !== textureKey) {
          sprite.setTexture(textureKey);
          sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
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

        const enemyShieldRenderPos = logicalToRenderPoint(
          enemyLogicalX - LOGICAL_SHIELD_OFFSET_PX,
          enemyLogicalY - LOGICAL_SHIELD_OFFSET_PX
        );
        if (!shield) {
          shield = this.add.image(
            enemyShieldRenderPos.x,
            enemyShieldRenderPos.y,
            'shield_aura'
          );
          shield.setOrigin(0, 0);
          shield.setDisplaySize(RENDER_SHIELD_SIZE_PX, RENDER_SHIELD_SIZE_PX);
          shield.setDepth(BATTLE_RENDER_DEPTH.ENEMY_SHIELD);
          this.enemyShieldSprites.set(enemy.id, shield);
        } else {
          if (shield.x !== enemyShieldRenderPos.x || shield.y !== enemyShieldRenderPos.y) {
            shield.setPosition(enemyShieldRenderPos.x, enemyShieldRenderPos.y);
          }
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
        this.enemyVisualPositions.delete(id);
        const shield = this.enemyShieldSprites.get(id);
        if (shield) {
          shield.destroy();
          this.enemyShieldSprites.delete(id);
        }
      }
    }
    if (!isOnlineGuest) {
      this.enemyVisualPositions.clear();
    }

    // 5. Update All Bullets (P1 + Enemies) — reuse pre-allocated Set
    const activeBulletIds = this.activeBulletIds;
    activeBulletIds.clear();
    for (const b of state.bullets) {
      activeBulletIds.add(b.id);
      let bX = b.x;
      let bY = b.y;
      if (isOnlineGuest && state.matchState === 'PLAYING') {
        const prevB = this.bulletVisualPositions.get(b.id);
        if (!prevB) {
          this.bulletVisualPositions.set(b.id, { x: b.x, y: b.y });
        } else {
          const dtSec = Math.min(Math.max(rawDelta, 0), 50) / 1000;
          let nextX = prevB.x;
          let nextY = prevB.y;
          if (dtSec > 0) {
            const step = BULLET_CONFIG.SPEED_PX_S * dtSec;
            if (b.direction === 'UP') nextY -= step;
            else if (b.direction === 'DOWN') nextY += step;
            else if (b.direction === 'LEFT') nextX -= step;
            else if (b.direction === 'RIGHT') nextX += step;
          }
          const errDist = Math.hypot(b.x - nextX, b.y - nextY);
          if (!Number.isFinite(errDist) || errDist > 16) {
            nextX = b.x;
            nextY = b.y;
          } else {
            const alpha = Math.min(1, 1 - Math.exp(-20 * dtSec));
            nextX += (b.x - nextX) * alpha;
            nextY += (b.y - nextY) * alpha;
            const leadDist = Math.hypot(nextX - b.x, nextY - b.y);
            if (leadDist > 8) {
              nextX = b.x + ((nextX - b.x) / leadDist) * 8;
              nextY = b.y + ((nextY - b.y) / leadDist) * 8;
            }
          }
          nextX = Math.max(0, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 4, nextX));
          nextY = Math.max(0, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 4, nextY));
          this.bulletVisualPositions.set(b.id, { x: nextX, y: nextY });
          bX = nextX;
          bY = nextY;
        }
      }

      const bulletRenderPos = logicalToRenderPoint(bX, bY);
      let bSprite = this.bulletSprites.get(b.id);
      const bTex = b.ownerType === 'enemy' ? 'bullet_enemy' : 'bullet';

      if (!bSprite) {
        bSprite = this.add.image(bulletRenderPos.x, bulletRenderPos.y, bTex);
        bSprite.setOrigin(0, 0);
        bSprite.setDisplaySize(RENDER_BULLET_SIZE_PX, RENDER_BULLET_SIZE_PX);
        bSprite.setDepth(BATTLE_RENDER_DEPTH.BULLET);
        this.bulletSprites.set(b.id, bSprite);
      } else {
        if (bSprite.x !== bulletRenderPos.x || bSprite.y !== bulletRenderPos.y) {
          bSprite.setPosition(bulletRenderPos.x, bulletRenderPos.y);
        }
      }
    }

    // Remove destroyed bullet sprites
    for (const [id, sprite] of this.bulletSprites) {
      if (!activeBulletIds.has(id)) {
        sprite.destroy();
        this.bulletSprites.delete(id);
        this.bulletVisualPositions.delete(id);
      }
    }
    if (!isOnlineGuest) {
      this.bulletVisualPositions.clear();
    }

    // 5b. Render Active Support Items on Battlefield with 5s Countdown Badge
    this.syncSupportItems(state);

    // 5c. Render VS Mode A.I Ally Tanks (AI_1 & AI_2) and Sudden Death Safe Zone / Danger Zone Overlay
    this.syncVsVisuals(state, isOnlineGuest, rawDelta);

    // 6. Spawn Visual Effects from Combat Events & Trigger Audio
    const newEvents = this.engine.popCombatEvents();
    for (const ev of newEvents) {
      SoundManager.getInstance().handleCombatEvent(ev, {
        isPaused: state.matchState === 'PAUSED',
        isGameOver: state.matchState === 'GAME_OVER',
      });
      if (ev.type === 'HIT_SPARK') {
        const clampedLogicalX = Math.max(4, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 4, ev.x));
        const clampedLogicalY = Math.max(4, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 4, ev.y));
        const sparkRenderPos = logicalToRenderPoint(clampedLogicalX, clampedLogicalY);
        const sparkRenderSize = logicalToRenderPx(8);
        const spark = this.add.image(sparkRenderPos.x, sparkRenderPos.y, 'hit_spark');
        spark.setOrigin(0.5, 0.5);
        spark.setDisplaySize(sparkRenderSize, sparkRenderSize);
        spark.setDepth(BATTLE_RENDER_DEPTH.HIT_SPARK);
        this.visualEffects.push({
          id: ev.id,
          type: ev.type,
          sprite: spark,
          elapsedMs: 0,
          totalDurationMs: 150,
        });
      } else if (ev.type === 'TANK_EXPLOSION' || ev.type === 'P1_EXPLOSION') {
        // Tank explosion max logical size 32x32 -> clamp center within [16, 192] so it stays 100% inside Canvas
        const clampedLogicalX = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 16, ev.x));
        const clampedLogicalY = Math.max(16, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 16, ev.y));
        const expRenderPos = logicalToRenderPoint(clampedLogicalX, clampedLogicalY);
        const initialExpRenderSize = logicalToRenderPx(16);
        const exp = this.add.image(expRenderPos.x, expRenderPos.y, 'explosion_1');
        exp.setOrigin(0.5, 0.5);
        exp.setDisplaySize(initialExpRenderSize, initialExpRenderSize);
        exp.setDepth(
          ev.type === 'P1_EXPLOSION'
            ? BATTLE_RENDER_DEPTH.P1_EXPLOSION
            : BATTLE_RENDER_DEPTH.TANK_EXPLOSION
        );
        this.visualEffects.push({
          id: ev.id,
          type: ev.type,
          sprite: exp,
          elapsedMs: 0,
          totalDurationMs: 700, // Exactly 0.7s according to M3/M4 spec
        });
      } else if (ev.type === 'BASE_EXPLOSION') {
        // Eagle explosion max logical size 48x48 -> clamp center within [24, 184] so it stays 100% inside Canvas
        const clampedLogicalX = Math.max(24, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX - 24, ev.x));
        const clampedLogicalY = Math.max(24, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX - 24, ev.y));
        const baseExpRenderPos = logicalToRenderPoint(clampedLogicalX, clampedLogicalY);
        const initialBaseExpRenderSize = logicalToRenderPx(24);
        const exp = this.add.image(baseExpRenderPos.x, baseExpRenderPos.y, 'eagle_exp_1');
        exp.setOrigin(0.5, 0.5);
        exp.setDisplaySize(initialBaseExpRenderSize, initialBaseExpRenderSize);
        exp.setDepth(BATTLE_RENDER_DEPTH.BASE_EXPLOSION);
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
            let nextExpTex = 'explosion_4';
            let nextLogicalExpSize = 24;
            if (progress < 0.25) {
              nextExpTex = 'explosion_1';
              nextLogicalExpSize = 16;
            } else if (progress < 0.55) {
              nextExpTex = 'explosion_2';
              nextLogicalExpSize = 24;
            } else if (progress < 0.8) {
              nextExpTex = 'explosion_3';
              nextLogicalExpSize = 32;
            }
            if (eff.sprite.texture.key !== nextExpTex) {
              const nextRenderExpSize = logicalToRenderPx(nextLogicalExpSize);
              eff.sprite.setTexture(nextExpTex);
              eff.sprite.setDisplaySize(nextRenderExpSize, nextRenderExpSize);
            }
          } else if (eff.type === 'BASE_EXPLOSION') {
            // Distinct Eagle Base Explosion frames: radiant white, golden amber, shockwave rings
            const progress = eff.elapsedMs / eff.totalDurationMs;
            let nextBaseTex = 'eagle_exp_4';
            let nextLogicalBaseSize = 36;
            if (progress < 0.25) {
              nextBaseTex = 'eagle_exp_1';
              nextLogicalBaseSize = 24;
            } else if (progress < 0.55) {
              nextBaseTex = 'eagle_exp_2';
              nextLogicalBaseSize = 36;
            } else if (progress < 0.8) {
              nextBaseTex = 'eagle_exp_3';
              nextLogicalBaseSize = 48;
            }
            if (eff.sprite.texture.key !== nextBaseTex) {
              const nextRenderBaseSize = logicalToRenderPx(nextLogicalBaseSize);
              eff.sprite.setTexture(nextBaseTex);
              eff.sprite.setDisplaySize(nextRenderBaseSize, nextRenderBaseSize);
            }
          } else if (eff.type === 'HIT_SPARK') {
            eff.sprite.setAlpha(Math.max(0, 1.0 - eff.elapsedMs / eff.totalDurationMs));
          }
        }
      }
      this.visualEffects = remainingEffects;
    }

    // 8. Update Dynamic Terrain (Bricks & Base) — only scan brick tiles on combat events, state transition, or every 6 ticks
    if (
      newEvents.length > 0 ||
      this.lastMatchState !== state.matchState ||
      state.tickCount % 6 === 0
    ) {
      this.syncDynamicTerrain(state);
    }

    // 9. Report state to React (immediately on key HUD state change or every ~100ms)
    this.reportHudStateIfNeeded(rawDelta, state);
  }

  public refreshAllTerrain(): void {
    this.resetGuestVisualSmoothing();
    // Clean up existing visual effects
    for (const eff of this.visualEffects) {
      eff.sprite.destroy();
    }
    this.visualEffects = [];

    // Clean up existing sprites
    this.terrainSprites.forEach((obj) => obj.destroy());
    this.terrainSprites.clear();
    this.supportItemSprites.forEach((entry) => entry.container.destroy());
    this.supportItemSprites.clear();
    this.vsAiSprites.forEach((sp) => sp.destroy());
    this.vsAiSprites.clear();
    this.vsAiShieldSprites.forEach((sp) => sp.destroy());
    this.vsAiShieldSprites.clear();
    this.vsSafeZoneGraphics?.clear();
    this.renderedBrickMasks.clear();
    this.renderedSteelMasks.clear();
    this.baseSprites = [];

    const state = this.engine.getState();
    const terrain = state.terrain;
    const renderTileSize = RENDER_CONFIG.RENDER_TILE_SIZE_PX;

    for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
      for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
        const tileType = terrain.currentMap[r][c];
        const tileRenderPos = tileGridToRenderPoint(c, r);

        if (tileType === TILE_TYPES.EMPTY) {
          continue;
        }

        if (tileType === TILE_TYPES.BASE) {
          const normalTexKey = 'tile_9';
          const ruinedTexKey = 'tile_9_ruined';
          const texKey = terrain.isBaseDestroyed ? ruinedTexKey : normalTexKey;

          const baseImg = this.add.image(tileRenderPos.x, tileRenderPos.y, texKey);
          baseImg.setOrigin(0, 0);
          baseImg.setDisplaySize(renderTileSize, renderTileSize);
          baseImg.setDepth(BATTLE_RENDER_DEPTH.EAGLE_BASE);
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

        if (tileType === TILE_TYPES.STEEL) {
          const initialMask = terrain.steelSubTiles?.[`${r}_${c}`] ?? SUB_TILE_MASKS.ALL;
          this.renderSteelTile(r, c, initialMask);
          this.renderedSteelMasks.set(`${r}_${c}`, initialMask);
          continue;
        }

        // WATER, GRASS, ICE
        const img = this.add.image(tileRenderPos.x, tileRenderPos.y, `tile_${tileType}`);
        img.setOrigin(0, 0);
        img.setDisplaySize(renderTileSize, renderTileSize);
        // Grass has higher depth to cover tanks
        img.setDepth(
          tileType === TILE_TYPES.GRASS
            ? BATTLE_RENDER_DEPTH.GRASS
            : BATTLE_RENDER_DEPTH.TERRAIN
        );
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

    const tileRenderPos = tileGridToRenderPoint(c, r);
    const renderTileSize = RENDER_CONFIG.RENDER_TILE_SIZE_PX;
    const renderSubTileSize = RENDER_CONFIG.RENDER_SUB_TILE_SIZE_PX;

    if (mask === SUB_TILE_MASKS.ALL) {
      const img = this.add.image(tileRenderPos.x, tileRenderPos.y, 'tile_1');
      img.setOrigin(0, 0);
      img.setDisplaySize(renderTileSize, renderTileSize);
      img.setDepth(BATTLE_RENDER_DEPTH.TERRAIN);
      (img as any).renderedMask = mask;
      this.terrainSprites.set(key, img);
      return;
    }

    const container = this.add.container(tileRenderPos.x, tileRenderPos.y);
    container.setDepth(BATTLE_RENDER_DEPTH.TERRAIN);

    if (mask & SUB_TILE_MASKS.TL) {
      const sub = this.add
        .image(0, 0, 'brick_sub_tl')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.TR) {
      const sub = this.add
        .image(renderSubTileSize, 0, 'brick_sub_tr')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BL) {
      const sub = this.add
        .image(0, renderSubTileSize, 'brick_sub_bl')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BR) {
      const sub = this.add
        .image(renderSubTileSize, renderSubTileSize, 'brick_sub_br')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }

    (container as any).renderedMask = mask;
    this.terrainSprites.set(key, container);
  }

  private renderSteelTile(r: number, c: number, mask: number): void {
    const key = `steel_${r}_${c}`;
    const oldObj = this.terrainSprites.get(key);
    if (oldObj) {
      oldObj.destroy();
      this.terrainSprites.delete(key);
    }

    if (mask === 0) return;

    const tileRenderPos = tileGridToRenderPoint(c, r);
    const renderTileSize = RENDER_CONFIG.RENDER_TILE_SIZE_PX;
    const renderSubTileSize = RENDER_CONFIG.RENDER_SUB_TILE_SIZE_PX;

    if (mask === SUB_TILE_MASKS.ALL) {
      const img = this.add.image(tileRenderPos.x, tileRenderPos.y, 'tile_2');
      img.setOrigin(0, 0);
      img.setDisplaySize(renderTileSize, renderTileSize);
      img.setDepth(BATTLE_RENDER_DEPTH.TERRAIN);
      (img as any).renderedMask = mask;
      this.terrainSprites.set(key, img);
      return;
    }

    const container = this.add.container(tileRenderPos.x, tileRenderPos.y);
    container.setDepth(BATTLE_RENDER_DEPTH.TERRAIN);

    if (mask & SUB_TILE_MASKS.TL) {
      const sub = this.add
        .image(0, 0, 'steel_sub_tl')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.TR) {
      const sub = this.add
        .image(renderSubTileSize, 0, 'steel_sub_tr')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BL) {
      const sub = this.add
        .image(0, renderSubTileSize, 'steel_sub_bl')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
      container.add(sub);
    }
    if (mask & SUB_TILE_MASKS.BR) {
      const sub = this.add
        .image(renderSubTileSize, renderSubTileSize, 'steel_sub_br')
        .setOrigin(0, 0)
        .setDisplaySize(renderSubTileSize, renderSubTileSize);
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
          item.sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
      }
    } else {
      for (const item of this.baseSprites) {
        if (item.sprite.active && item.sprite.texture.key !== item.normalTexKey) {
          item.sprite.setTexture(item.normalTexKey);
          item.sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
      }
    }

    // Sync only modified brick tiles (fast Map lookup avoids per-frame string splitting)
    const subTiles = terrain.brickSubTiles;
    for (const [key] of Array.from(this.renderedBrickMasks.entries())) {
      if (!(key in subTiles)) {
        const sepIdx = key.indexOf('_');
        const r = parseInt(key.slice(0, sepIdx), 10);
        const c = parseInt(key.slice(sepIdx + 1), 10);
        const spriteKey = `brick_${r}_${c}`;
        const existing = this.terrainSprites.get(spriteKey);
        if (existing) {
          existing.destroy();
          this.terrainSprites.delete(spriteKey);
        }
        this.renderedBrickMasks.delete(key);
      }
    }
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

    // Sync only modified steel tiles (damaged by Power tank bullets or reverted when Eagle Shield expires)
    const steelTiles = terrain.steelSubTiles;
    for (const [key] of Array.from(this.renderedSteelMasks.entries())) {
      if (!steelTiles || !(key in steelTiles)) {
        const sepIdx = key.indexOf('_');
        const r = parseInt(key.slice(0, sepIdx), 10);
        const c = parseInt(key.slice(sepIdx + 1), 10);
        const spriteKey = `steel_${r}_${c}`;
        const existing = this.terrainSprites.get(spriteKey);
        if (existing) {
          existing.destroy();
          this.terrainSprites.delete(spriteKey);
        }
        this.renderedSteelMasks.delete(key);
      }
    }
    if (steelTiles) {
      for (const key in steelTiles) {
        const mask = steelTiles[key];
        const prevMask = this.renderedSteelMasks.get(key);
        if (prevMask === mask) continue;

        this.renderedSteelMasks.set(key, mask);
        const sepIdx = key.indexOf('_');
        const r = parseInt(key.slice(0, sepIdx), 10);
        const c = parseInt(key.slice(sepIdx + 1), 10);
        const spriteKey = `steel_${r}_${c}`;
        const existing = this.terrainSprites.get(spriteKey);

        if (mask === 0) {
          if (existing) {
            existing.destroy();
            this.terrainSprites.delete(spriteKey);
          }
        } else {
          this.renderSteelTile(r, c, mask);
        }
      }
    }

    // Sync Eagle Shield dynamic tile type swaps across ALL 5 base wall cells:
    // (12,5), (11,5), (11,6), (11,7), (12,7) between BRICK, STEEL, and EMPTY
    for (const { row: r, col } of EAGLE_SHIELD_SIDE_WALL_COORDS) {
      const tileType = terrain.currentMap[r]?.[col];
      const cellKey = `${r}_${col}`;
      const brickKey = `brick_${r}_${col}`;
      const steelKey = `steel_${r}_${col}`;
      if (tileType === TILE_TYPES.STEEL) {
        const existingBrick = this.terrainSprites.get(brickKey);
        if (existingBrick) {
          existingBrick.destroy();
          this.terrainSprites.delete(brickKey);
          this.renderedBrickMasks.delete(cellKey);
        }
        const mask = terrain.steelSubTiles?.[cellKey] ?? SUB_TILE_MASKS.ALL;
        if (!this.terrainSprites.has(steelKey) && mask > 0) {
          this.renderSteelTile(r, col, mask);
          this.renderedSteelMasks.set(cellKey, mask);
        }
      } else if (tileType === TILE_TYPES.BRICK) {
        const existingSteel = this.terrainSprites.get(steelKey);
        if (existingSteel) {
          existingSteel.destroy();
          this.terrainSprites.delete(steelKey);
          this.renderedSteelMasks.delete(cellKey);
        }
        const mask = terrain.brickSubTiles[cellKey] ?? SUB_TILE_MASKS.ALL;
        if (!this.terrainSprites.has(brickKey) && mask > 0) {
          this.renderBrickTile(r, col, mask);
          this.renderedBrickMasks.set(cellKey, mask);
        }
      } else if (tileType === TILE_TYPES.EMPTY) {
        const existingSteel = this.terrainSprites.get(steelKey);
        if (existingSteel) {
          existingSteel.destroy();
          this.terrainSprites.delete(steelKey);
          this.renderedSteelMasks.delete(cellKey);
        }
        const existingBrick = this.terrainSprites.get(brickKey);
        if (existingBrick) {
          existingBrick.destroy();
          this.terrainSprites.delete(brickKey);
          this.renderedBrickMasks.delete(cellKey);
        }
      }
    }

    // Audio match state change handling (pause/resume/gameover/stageclear)
    if (this.lastMatchState !== state.matchState) {
      if (state.matchState === 'PAUSED') {
        this.resetLocalInputState();
        SoundManager.getInstance().pauseBgm();
      } else if (state.matchState === 'PLAYING') {
        this.resetLocalInputState();
        SoundManager.getInstance().resumeBgm();
      } else if (state.matchState === 'STAGE_CLEAR') {
        this.resetLocalInputState();
        MusicManager.getInstance().stopAllCustomSources();
        SoundManager.getInstance().stopBgm();
        SoundManager.getInstance().playStageClear();
      } else if (state.matchState === 'GAME_OVER') {
        this.resetLocalInputState();
        MusicManager.getInstance().stopAllCustomSources();
        SoundManager.getInstance().stopBgm();
        SoundManager.getInstance().playGameOver();
      }
      this.lastMatchState = state.matchState;
    }
  }

  private getP2TankTexturePrefix(gameMode: GameCoreState['gameMode']): 'tank_ai2' | 'tank_p2' {
    return gameMode === 'TWO_PLAYERS_AI' ? 'tank_ai2' : 'tank_p2';
  }

  private getSupportItemTextureKey(type: string): string {
    switch (type) {
      case 'BOMB':
        return 'item_bomb';
      case 'EAGLE_SHIELD':
        return 'item_eagle_shield';
      case 'FIREPOWER':
        return 'item_firepower';
      case 'SPEED_BOOST':
        return 'item_speed_boost';
      default:
        return 'item_firepower';
    }
  }

  private syncSupportItems(state: GameCoreState): void {
    const activeItems = state.itemSystem?.activeItems ?? [];
    const activeIds = new Set<string>();

    for (const item of activeItems) {
      activeIds.add(item.id);
      let entry = this.supportItemSprites.get(item.id);
      const texKey = this.getSupportItemTextureKey(item.type);
      const itemRenderPos = logicalToRenderPoint(item.x, item.y);

      if (!entry) {
        const container = this.add.container(itemRenderPos.x, itemRenderPos.y);
        container.setDepth(BATTLE_RENDER_DEPTH.SUPPORT_ITEM);

        const icon = this.add.image(0, 0, texKey);
        icon.setOrigin(0, 0);
        icon.setDisplaySize(
          RENDER_CONFIG.RENDER_TILE_SIZE_PX,
          RENDER_CONFIG.RENDER_TILE_SIZE_PX
        );

        const timerText = this.add.text(
          RENDER_SUPPORT_TIMER_OFFSET_PX,
          RENDER_SUPPORT_TIMER_OFFSET_PX,
          `${item.remainingSeconds}s`,
          {
            fontFamily: 'monospace',
            fontSize: `${RENDER_SUPPORT_TIMER_FONT_PX}px`,
            color: '#fef08a',
            backgroundColor: '#090d16d9',
            padding: { x: RENDER_SUPPORT_TIMER_PAD_X_PX, y: 0 },
          }
        );
        timerText.setOrigin(1, 1);

        container.add([icon, timerText]);
        entry = { container, icon, timerText };
        this.supportItemSprites.set(item.id, entry);
      } else {
        if (entry.container.x !== itemRenderPos.x || entry.container.y !== itemRenderPos.y) {
          entry.container.setPosition(itemRenderPos.x, itemRenderPos.y);
        }
        if (entry.icon.texture.key !== texKey) {
          entry.icon.setTexture(texKey);
          entry.icon.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
        const label = `${item.remainingSeconds}s`;
        if (entry.timerText.text !== label) {
          entry.timerText.setText(label);
        }
      }

      // Blink rapidly during final 2 seconds (<= 120 ticks) to warn before disappearing
      if (item.remainingTicks <= 120) {
        const blinkOn = Math.floor(item.remainingTicks / 6) % 2 === 0;
        entry.container.setAlpha(blinkOn ? 1.0 : 0.35);
      } else {
        const gentlePulse = Math.floor(item.remainingTicks / 15) % 2 === 0;
        entry.container.setAlpha(gentlePulse ? 1.0 : 0.85);
      }
    }

    for (const [id, entry] of this.supportItemSprites) {
      if (!activeIds.has(id)) {
        entry.container.destroy();
        this.supportItemSprites.delete(id);
      }
    }
  }

  private syncVsVisuals(
    state: GameCoreState,
    isOnlineGuest: boolean = false,
    rawDelta: number = 16
  ): void {
    const vs = state.vsState;
    if (!vs) {
      if (this.vsAiSprites.size > 0) {
        this.vsAiSprites.forEach((sp) => sp.destroy());
        this.vsAiSprites.clear();
      }
      if (this.vsAiShieldSprites.size > 0) {
        this.vsAiShieldSprites.forEach((sp) => sp.destroy());
        this.vsAiShieldSprites.clear();
      }
      this.vsAiVisualPositions.clear();
      this.vsSafeZoneGraphics?.clear();
      return;
    }

    // 1. Sync VS A.I ally tank sprites (AI_1 & AI_2) with Guest interpolation smoothing
    const activeAiIds = new Set<string>();
    for (const c of vs.combatants) {
      if (!c.isAI) continue;
      if (c.isDead || !c.tank.isAlive) continue;
      activeAiIds.add(c.id);

      let aiLogicalX = c.tank.x;
      let aiLogicalY = c.tank.y;
      if (isOnlineGuest && state.matchState === 'PLAYING') {
        const smoothedAi = this.computeSmoothedPos(
          this.vsAiVisualPositions.get(c.id),
          c.tank.x,
          c.tank.y,
          rawDelta,
          24,
          16
        );
        this.vsAiVisualPositions.set(c.id, smoothedAi);
        aiLogicalX = smoothedAi.x;
        aiLogicalY = smoothedAi.y;
      }

      const aiRenderPos = logicalToRenderPoint(aiLogicalX, aiLogicalY);
      const prefix = c.role === 'AI_1' ? 'tank_ai1' : 'tank_ai2';
      const texKey = `${prefix}_${c.tank.direction.toLowerCase()}`;
      let sprite = this.vsAiSprites.get(c.id);
      if (!sprite) {
        sprite = this.add.image(aiRenderPos.x, aiRenderPos.y, texKey);
        sprite.setOrigin(0, 0);
        sprite.setDisplaySize(
          RENDER_CONFIG.RENDER_TILE_SIZE_PX,
          RENDER_CONFIG.RENDER_TILE_SIZE_PX
        );
        sprite.setDepth(BATTLE_RENDER_DEPTH.PLAYER_TANK);
        this.vsAiSprites.set(c.id, sprite);
      } else {
        if (sprite.x !== aiRenderPos.x || sprite.y !== aiRenderPos.y) {
          sprite.setPosition(aiRenderPos.x, aiRenderPos.y);
        }
        if (sprite.texture.key !== texKey) {
          sprite.setTexture(texKey);
          sprite.setDisplaySize(
            RENDER_CONFIG.RENDER_TILE_SIZE_PX,
            RENDER_CONFIG.RENDER_TILE_SIZE_PX
          );
        }
      }

      let shield = this.vsAiShieldSprites.get(c.id);
      if (c.protectionTicksRemaining > 0) {
        const pulse = Math.floor(c.protectionTicksRemaining / 6) % 2 === 0;
        sprite.setAlpha(pulse ? 0.72 : 1.0);
        const aiShieldRenderPos = logicalToRenderPoint(
          aiLogicalX - LOGICAL_SHIELD_OFFSET_PX,
          aiLogicalY - LOGICAL_SHIELD_OFFSET_PX
        );
        if (!shield) {
          shield = this.add.image(aiShieldRenderPos.x, aiShieldRenderPos.y, 'shield_aura');
          shield.setOrigin(0, 0);
          shield.setDisplaySize(RENDER_SHIELD_SIZE_PX, RENDER_SHIELD_SIZE_PX);
          shield.setDepth(BATTLE_RENDER_DEPTH.PLAYER_SHIELD);
          this.vsAiShieldSprites.set(c.id, shield);
        } else {
          if (shield.x !== aiShieldRenderPos.x || shield.y !== aiShieldRenderPos.y) {
            shield.setPosition(aiShieldRenderPos.x, aiShieldRenderPos.y);
          }
          shield.setVisible(true);
        }
        shield.setAlpha(pulse ? 0.95 : 0.45);
      } else {
        sprite.setAlpha(1.0);
        if (shield && shield.visible) {
          shield.setVisible(false);
        }
      }
    }

    for (const [id, sprite] of this.vsAiSprites) {
      if (!activeAiIds.has(id)) {
        sprite.destroy();
        this.vsAiSprites.delete(id);
        this.vsAiVisualPositions.delete(id);
        const shield = this.vsAiShieldSprites.get(id);
        if (shield) {
          shield.destroy();
          this.vsAiShieldSprites.delete(id);
        }
      }
    }
    if (!isOnlineGuest) {
      this.vsAiVisualPositions.clear();
    }

    // 2. Render Sudden Death Danger Zone & Safe Zone perimeter overlay (projected to 832x832)
    if (!this.vsSafeZoneGraphics) return;
    const g = this.vsSafeZoneGraphics;
    g.clear();

    if (vs.phase !== 'SUDDEN_DEATH') {
      return;
    }

    const logicalW = MAP_DIMENSIONS.TOTAL_WIDTH_PX;
    const logicalH = MAP_DIMENSIONS.TOTAL_HEIGHT_PX;
    const renderW = RENDER_CONFIG.RENDER_WORLD_WIDTH_PX;
    const renderH = RENDER_CONFIG.RENDER_WORLD_HEIGHT_PX;
    const b = vs.safeZone.bounds;
    const pulseAlpha = 0.28 + 0.08 * Math.sin(vs.tickCount * 0.12);

    if (b.isFullyCollapsed) {
      g.fillStyle(0xff0044, Math.min(0.45, pulseAlpha + 0.1));
      g.fillRect(0, 0, renderW, renderH);
    } else if (vs.safeZone.shrinkLevel > 0) {
      const renderMinX = logicalToRenderPx(b.minX);
      const renderMinY = logicalToRenderPx(b.minY);
      const renderMaxX = logicalToRenderPx(b.maxX);
      const renderMaxY = logicalToRenderPx(b.maxY);

      g.fillStyle(0xff0044, pulseAlpha);
      if (b.minY > 0) g.fillRect(0, 0, renderW, renderMinY);
      if (b.maxY < logicalH) g.fillRect(0, renderMaxY, renderW, renderH - renderMaxY);
      if (b.minX > 0) g.fillRect(0, renderMinY, renderMinX, renderMaxY - renderMinY);
      if (b.maxX < logicalW) {
        g.fillRect(renderMaxX, renderMinY, renderW - renderMaxX, renderMaxY - renderMinY);
      }

      g.lineStyle(logicalToRenderPx(1.5), 0xff2a6d, 0.95);
      g.strokeRect(renderMinX, renderMinY, renderMaxX - renderMinX, renderMaxY - renderMinY);
    }

    // Imminent shrink preview border (<= 5s before next shrink)
    if (vs.safeZone.isShrinkImminent && !vs.safeZone.nextBounds.isFullyCollapsed) {
      const nb = vs.safeZone.nextBounds;
      const blinkOn = Math.floor(vs.tickCount / 10) % 2 === 0;
      if (blinkOn) {
        const nextRenderRect = logicalToRenderRect({
          x: nb.minX,
          y: nb.minY,
          width: nb.maxX - nb.minX,
          height: nb.maxY - nb.minY,
        });
        g.lineStyle(logicalToRenderPx(1), 0xffb800, 0.9);
        g.strokeRect(
          nextRenderRect.x,
          nextRenderRect.y,
          nextRenderRect.width,
          nextRenderRect.height
        );
      }
    }
  }
}
