/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SIMULATION_CONFIG, P1_CONFIG, ENEMY_CONFIG } from './constants.ts';
import {
  type GameCoreState,
  type InputState,
  type RuntimeTerrainState,
  type TankStructure,
  type BulletStructure,
  type EnemyType,
  type EnemyTank,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { createP1Tank, updateTankMovement } from './tank.ts';
import { spawnBullet, updateBullet } from './bullet.ts';
import { EnemyManager } from './enemyManager.ts';
import {
  checkBulletVsBullet,
  checkTankVsTanks,
  getBulletHitbox,
  getTankHitbox,
  intersectAABB,
} from './physics.ts';
import { MATCH_STATES, MatchStateMachine, type MatchState } from './matchState.ts';
import { StageManager, type StageDefinition } from './stageManager.ts';
import { ScoreManager } from './scoreManager.ts';
import type { CombatEvent, CombatEventType } from './types.ts';

export class GameEngine {
  private state: GameCoreState;
  private accumulatorMs: number = 0;
  private isPaused: boolean = false;
  private lastShootState: boolean = false;
  private enemyManager: EnemyManager;
  private enableEnemies: boolean;
  private stageManager: StageManager;
  private scoreManager: ScoreManager;
  private matchStateMachine: MatchStateMachine;
  private combatEvents: CombatEvent[] = [];
  private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
  private externalInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };

  public on(event: string, callback: (payload: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  public emit(event: string, payload?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  public popCombatEvents(): CombatEvent[] {
    const events = [...this.combatEvents];
    this.combatEvents = [];
    return events;
  }

  private emitCombatEvent(type: CombatEventType, x: number, y: number): void {
    this.combatEvents.push({
      id: `evt_${this.state.tickCount}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      x,
      y,
      createdAtTick: this.state.tickCount,
    });
    this.emit(type, { x, y, type });
  }

  constructor(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = true,
    customEnemyQueue?: EnemyType[]
  ) {
    this.enableEnemies = enableEnemies;
    this.stageManager = new StageManager();
    this.scoreManager = new ScoreManager();
    this.matchStateMachine = new MatchStateMachine(MATCH_STATES.PLAYING);
    this.enemyManager = new EnemyManager();
    if (customEnemyQueue) {
      this.enemyManager.reset(customEnemyQueue);
    }

    const currentStage = this.stageManager.getCurrentStage();

    this.state = {
      tickCount: 0,
      p1: customP1 ?? createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: currentStage.id,
      currentStageName: currentStage.name,
      stageElapsedSeconds: 0,
      terrain: customTerrain ?? createRuntimeTerrainState(currentStage.map),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
      matchState: MATCH_STATES.PLAYING,
    };
  }

  public getState(): Readonly<GameCoreState> {
    return this.state;
  }

  public getEnemyManager(): EnemyManager {
    return this.enemyManager;
  }

  public getStageManager(): StageManager {
    return this.stageManager;
  }

  public getScoreManager(): ScoreManager {
    return this.scoreManager;
  }

  public getStateMachine(): MatchStateMachine {
    return this.matchStateMachine;
  }

  public getMatchState(): MatchState {
    return this.state.matchState;
  }

  public setExternalInput(input: Partial<InputState>): void {
    this.externalInput = {
      ...this.externalInput,
      ...input,
    };
  }

  public getExternalInput(): InputState {
    return { ...this.externalInput };
  }

  public pause(): boolean {
    if (this.state.matchState === MATCH_STATES.PLAYING) {
      const trans = this.matchStateMachine.transitionTo(MATCH_STATES.PAUSED);
      if (trans.success) {
        this.isPaused = true;
        this.state.matchState = MATCH_STATES.PAUSED;
        // Clear inputs upon pausing
        this.externalInput = { up: false, down: false, left: false, right: false, shoot: false };
        return true;
      }
    }
    return false;
  }

  public resume(): boolean {
    if (this.state.matchState === MATCH_STATES.PAUSED) {
      const trans = this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING);
      if (trans.success) {
        this.isPaused = false;
        this.accumulatorMs = 0; // Essential: reset backlog so no time-jump occurs
        this.state.matchState = MATCH_STATES.PLAYING;
        return true;
      }
    }
    return false;
  }

  public restartStage(): void {
    const stage = this.stageManager.getCurrentStage();
    this.accumulatorMs = 0;
    this.lastShootState = false;
    this.isPaused = false;
    this.externalInput = { up: false, down: false, left: false, right: false, shoot: false };
    this.combatEvents = [];
    this.enemyManager.reset(stage.enemyQueue);
    this.scoreManager.resetRun();

    this.state = {
      tickCount: 0,
      p1: createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: stage.id,
      currentStageName: stage.name,
      stageElapsedSeconds: 0,
      terrain: createRuntimeTerrainState(stage.map),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
      matchState: MATCH_STATES.PLAYING,
    };
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);
  }

  public quitToMenu(): void {
    this.isPaused = true;
    this.accumulatorMs = 0;
    this.externalInput = { up: false, down: false, left: false, right: false, shoot: false };
    this.state.isGameOver = false;
    this.state.isStageClear = false;
    this.state.gameOverReason = null;
    this.state.bullets = [];
    this.state.bullet = null;
    this.state.matchState = MATCH_STATES.MENU;
    this.matchStateMachine.transitionTo(MATCH_STATES.MENU, true);
  }

  public startMatch(): void {
    this.restartStage();
  }

  public advanceToNextStage(): boolean {
    if (!this.stageManager.hasNextStage()) {
      return false;
    }
    const nextStageId = this.stageManager.getNextStageId();
    if (!nextStageId) return false;

    this.stageManager.setCurrentStage(nextStageId);
    const stage = this.stageManager.getCurrentStage();

    this.scoreManager.advanceToNextStage();
    this.accumulatorMs = 0;
    this.isPaused = false;
    this.enemyManager.reset(stage.enemyQueue);

    // Carry forward P1 lives and existing total score
    const preservedLives = this.state.p1State.lives;

    this.state = {
      tickCount: 0,
      p1: createP1Tank(),
      p1State: {
        lives: preservedLives,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: stage.id,
      currentStageName: stage.name,
      stageElapsedSeconds: 0,
      terrain: createRuntimeTerrainState(stage.map),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
      matchState: MATCH_STATES.PLAYING,
    };
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);
    return true;
  }

  public reset(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = true,
    customEnemyQueue?: EnemyType[]
  ): void {
    this.accumulatorMs = 0;
    this.lastShootState = false;
    this.isPaused = false;
    this.enableEnemies = enableEnemies;
    this.enemyManager.reset(customEnemyQueue);
    this.scoreManager.resetRun();
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);

    const currentStage = this.stageManager.getCurrentStage();

    this.state = {
      tickCount: 0,
      p1: customP1 ?? createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: currentStage.id,
      currentStageName: currentStage.name,
      stageElapsedSeconds: 0,
      terrain: customTerrain ?? createRuntimeTerrainState(currentStage.map),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
      matchState: MATCH_STATES.PLAYING,
    };
  }

  /**
   * Called when document.visibilityState changes.
   * When returning to visible: resets accumulator and frame timestamp.
   * Never backlogs or simulates sleep time.
   */
  public handleVisibilityChange(isVisible: boolean): void {
    if (!isVisible) {
      this.isPaused = true;
    } else {
      this.isPaused = false;
      this.accumulatorMs = 0; // Discard sleep backlog
      this.state.diagnosticLog = 'Resumed from background tab: accumulator reset';
    }
  }

  /**
   * Directly spawn an enemy (useful for tests or immediate wave triggers).
   */
  public spawnEnemyImmediate(): EnemyTank | null {
    const allTanks = [this.state.p1, ...this.enemyManager.getActiveEnemies()];
    const enemy = this.enemyManager.trySpawnEnemy(
      this.state.terrain,
      allTanks,
      this.state.bullets
    );
    this.state.enemies = this.enemyManager.getActiveEnemies();
    this.state.enemyQueue = this.enemyManager.getQueue();
    return enemy;
  }

  /**
   * Executes exactly one deterministic simulation tick (dt = 1/60s).
   */
  public stepTick(input: InputState): void {
    if (
      this.isPaused ||
      this.state.matchState === MATCH_STATES.PAUSED ||
      this.state.matchState === MATCH_STATES.MENU ||
      this.state.isGameOver ||
      this.state.isStageClear
    ) {
      return;
    }

    this.state.tickCount++;
    const dt = SIMULATION_CONFIG.FIXED_DT_S;

    // 1. P1 Respawn & Shield Handling (Point H & Point A)
    if (this.state.p1State.isDead) {
      if (this.state.p1State.respawnTimer > 0) {
        this.state.p1State.respawnTimer -= dt;
      } else {
        // Respawn delay completed: check lives first
        if (this.state.p1State.lives <= 0) {
          this.state.isGameOver = true;
          this.state.gameOverReason = 'P1 hết mạng! Game Over.';
          this.state.matchState = MATCH_STATES.GAME_OVER;
          this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
          return;
        }

        // Check if spawn position (48, 192) is occupied by any enemy tank
        const spawnBox = getTankHitbox(P1_CONFIG.SPAWN_X, P1_CONFIG.SPAWN_Y);
        const isOccupied = checkTankVsTanks('p1_respawn_probe', spawnBox, this.state.enemies);

        if (isOccupied) {
          // Wait and re-check every 100ms; NEVER shift spawn coordinates
          this.state.p1State.waitingForClearSpawn = true;
          this.state.p1State.spawnCheckTimer = (this.state.p1State.spawnCheckTimer || 0.1) - dt;
          if (this.state.p1State.spawnCheckTimer <= 0) {
            this.state.p1State.spawnCheckTimer = 0.1;
          }
        } else {
          // Clear to spawn at fixed (48, 192)
          this.state.p1State.isDead = false;
          this.state.p1State.waitingForClearSpawn = false;
          this.state.p1State.spawnCheckTimer = 0;
          this.state.p1State.shieldTimer = P1_CONFIG.RESPAWN_SHIELD_S;
          this.state.p1.x = P1_CONFIG.SPAWN_X;
          this.state.p1.y = P1_CONFIG.SPAWN_Y;
          this.state.p1.direction = P1_CONFIG.SPAWN_DIRECTION;
          this.state.p1.isAlive = true;
          this.state.p1.isShielded = true;
        }
      }
    }

    if (this.state.p1State.shieldTimer > 0) {
      this.state.p1State.shieldTimer = Math.max(0, this.state.p1State.shieldTimer - dt);
      this.state.p1.isShielded = this.state.p1State.shieldTimer > 0;
    }

    // 2. P1 Tank Movement & Shooting
    if (this.state.p1.isAlive && !this.state.p1State.isDead) {
      updateTankMovement(this.state.p1, input, this.state.terrain, this.state.enemies);

      const shootTriggered = input.shoot && !this.lastShootState;
      this.lastShootState = input.shoot;

      const p1HasBullet = this.state.bullets.some(
        (b) => b.ownerId === this.state.p1.id || b.ownerType === 'player'
      );
      if (shootTriggered && !p1HasBullet) {
        const newBullet = spawnBullet(this.state.p1, null);
        if (newBullet) {
          newBullet.ownerType = 'player';
          this.state.bullets.push(newBullet);
          this.state.bullet = newBullet;
        }
      }
    } else {
      this.lastShootState = input.shoot;
    }

    // 3. Update Enemies (AI, movement, and shooting)
    if (this.enableEnemies) {
      // Per Point A: Enemy AI targets and shoots shielded P1; only dead P1 is ignored
      const p1IsDead = this.state.p1State.isDead;
      const newEnemyBullets = this.enemyManager.update(
        dt,
        this.state.p1,
        p1IsDead,
        this.state.terrain,
        this.state.bullets
      );

      for (const eb of newEnemyBullets) {
        this.state.bullets.push(eb);
      }
      this.state.enemies = this.enemyManager.getActiveEnemies();
      this.state.enemyQueue = this.enemyManager.getQueue();
    }

    // 4. Sync bullet if injected directly into state.bullet (test fixtures / backward-compatibility)
    if (this.state.bullet && !this.state.bullets.some((b) => b.id === this.state.bullet!.id)) {
      this.state.bullets.push(this.state.bullet);
    }

    // Update Bullet Trajectory & Terrain Collisions
    const survivingBullets: BulletStructure[] = [];
    for (const b of this.state.bullets) {
      const bulletResult = updateBullet(b, this.state.terrain);
      if (bulletResult.hitBase) {
        this.state.isGameOver = true;
        this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
        this.state.matchState = MATCH_STATES.GAME_OVER;
        this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
        this.emitCombatEvent('BASE_EXPLOSION', 104, 200);
      }
      if (bulletResult.isAlive) {
        survivingBullets.push(b);
      }
    }
    this.state.bullets = survivingBullets;

    // 5. Bullet-to-Bullet Cancellation (Player vs Enemy bullets)
    const cancelledBulletIds = new Set<string>();
    const playerBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'player' || b.ownerId === this.state.p1.id
    );
    const enemyBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'enemy' && b.ownerId !== this.state.p1.id
    );

    for (const pb of playerBullets) {
      for (const eb of enemyBullets) {
        if (cancelledBulletIds.has(pb.id) || cancelledBulletIds.has(eb.id)) continue;
        if (checkBulletVsBullet(pb, eb)) {
          cancelledBulletIds.add(pb.id);
          cancelledBulletIds.add(eb.id);
        }
      }
    }

    if (cancelledBulletIds.size > 0) {
      this.state.bullets = this.state.bullets.filter((b) => !cancelledBulletIds.has(b.id));
    }

    // 6. Player Bullet vs Enemy Tanks
    const consumedBulletIds = new Set<string>();
    const activePlayerBullets = this.state.bullets.filter(
      (b) =>
        (b.ownerType === 'player' || b.ownerId === this.state.p1.id) &&
        !cancelledBulletIds.has(b.id)
    );

    for (const pb of activePlayerBullets) {
      const bulletBox = getBulletHitbox(pb.x, pb.y);
      for (const enemy of this.state.enemies) {
        if (!enemy.isAlive) continue;
        const enemyBox = getTankHitbox(enemy.x, enemy.y);
        if (intersectAABB(bulletBox, enemyBox)) {
          consumedBulletIds.add(pb.id);
          const hitResult = this.enemyManager.damageEnemy(enemy.id);
          if (hitResult.destroyed) {
            this.state.totalDefeatedEnemies++;
            this.scoreManager.recordEnemyDefeated(enemy.id, enemy.enemyType);
            this.state.score = this.scoreManager.getTotalScore();
            this.state.highScore = this.scoreManager.getHighScore();
            this.state.defeatedCounts = this.scoreManager.getStageStats();
            this.emitCombatEvent('TANK_EXPLOSION', enemy.x + 8, enemy.y + 8);
          } else {
            // Hit but not destroyed: emit impact spark at hit location
            this.emitCombatEvent('HIT_SPARK', pb.x + 2, pb.y + 2);
          }
          break; // Bullet hits only one tank
        }
      }
    }

    // 7. Enemy Bullets vs Player Tank (Point A & Point H)
    const activeEnemyBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'enemy' && !cancelledBulletIds.has(b.id)
    );

    for (const eb of activeEnemyBullets) {
      if (consumedBulletIds.has(eb.id)) continue;

      // When P1 is dead: enemy bullets pass through cleanly without hitting P1
      if (!this.state.p1.isAlive || this.state.p1State.isDead) {
        continue;
      }

      const bulletBox = getBulletHitbox(eb.x, eb.y);
      const p1Box = getTankHitbox(this.state.p1.x, this.state.p1.y);

      if (intersectAABB(bulletBox, p1Box)) {
        // Bullet contacts P1 hitbox -> bullet is always consumed/stopped (no penetration)
        consumedBulletIds.add(eb.id);

        // If P1 has active shield: absorb bullet completely, take NO damage!
        if (this.state.p1.isShielded || this.state.p1State.shieldTimer > 0) {
          continue;
        }

        // If P1 is NOT shielded: P1 dies with explosion!
        this.emitCombatEvent('TANK_EXPLOSION', this.state.p1.x + 8, this.state.p1.y + 8);
        this.state.p1State.lives -= 1;
        this.state.p1State.isDead = true;
        this.state.p1.isAlive = false;
        this.state.p1State.respawnTimer = P1_CONFIG.RESPAWN_DELAY_S;
        this.state.p1State.waitingForClearSpawn = false;
        this.state.p1State.spawnCheckTimer = 0;

        // Immediately delete player bullets; enemy bullets keep flying! (Point H)
        this.state.bullets = this.state.bullets.filter(
          (b) => b.ownerType !== 'player' && b.ownerId !== this.state.p1.id
        );
        this.state.bullet = null;

        if (this.state.p1State.lives <= 0) {
          this.state.isGameOver = true;
          this.state.gameOverReason = 'P1 hết mạng! Game Over.';
          this.state.matchState = MATCH_STATES.GAME_OVER;
          this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
        }
        break;
      }
    }

    if (consumedBulletIds.size > 0) {
      this.state.bullets = this.state.bullets.filter((b) => !consumedBulletIds.has(b.id));
    }

    // 8. Sync state.bullet with P1 active bullet
    this.state.bullet =
      this.state.bullets.find(
        (b) => b.ownerId === this.state.p1.id || b.ownerType === 'player'
      ) ?? null;

    // 9. Sync active enemies list
    this.state.enemies = this.enemyManager.getActiveEnemies();
    this.state.enemyQueue = this.enemyManager.getQueue();

    // 10. Check Base destroyed state
    if (this.state.terrain.isBaseDestroyed && !this.state.isGameOver) {
      this.emitCombatEvent('BASE_EXPLOSION', 96, 192); // Eagle center at (96, 192)
      this.state.isGameOver = true;
      this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    }

    // 11. Check Stage Clear condition
    if (
      !this.state.isGameOver &&
      !this.state.terrain.isBaseDestroyed &&
      this.state.p1State.lives > 0 &&
      this.state.totalDefeatedEnemies >= ENEMY_CONFIG.TOTAL_COUNT &&
      this.state.enemies.length === 0
    ) {
      this.state.isStageClear = true;
      this.state.matchState = MATCH_STATES.STAGE_CLEAR;
      this.matchStateMachine.transitionTo(MATCH_STATES.STAGE_CLEAR, true);
      this.scoreManager.checkAndUpdateHighScore();
      this.state.highScore = this.scoreManager.getHighScore();
    }
  }

  /**
   * Advances simulation with real-world delta time using fixed 60Hz ticks.
   * Manages accumulator, backlog limits, and frame clamp.
   */
  public advanceTime(deltaMs: number, input: InputState): number {
    if (
      this.isPaused ||
      this.state.matchState === MATCH_STATES.PAUSED ||
      this.state.matchState === MATCH_STATES.MENU ||
      this.state.isGameOver ||
      this.state.isStageClear
    ) {
      return 0;
    }

    this.state.stageElapsedSeconds += deltaMs / 1000;
    this.accumulatorMs += deltaMs;

    // Frame lag clamp: prevent spiral of death
    if (this.accumulatorMs > SIMULATION_CONFIG.MAX_ACCUMULATOR_MS) {
      this.accumulatorMs = SIMULATION_CONFIG.MAX_ACCUMULATOR_MS;
      this.state.diagnosticLog = 'Simulation backlog clamped at 250ms';
    }

    let ticksRun = 0;
    while (
      this.accumulatorMs >= SIMULATION_CONFIG.FIXED_DT_MS &&
      ticksRun < SIMULATION_CONFIG.MAX_TICKS_PER_FRAME
    ) {
      this.stepTick(input);
      this.accumulatorMs -= SIMULATION_CONFIG.FIXED_DT_MS;
      ticksRun++;
    }

    return ticksRun;
  }
}
