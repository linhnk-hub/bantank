/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SIMULATION_CONFIG, P1_CONFIG, ENEMY_CONFIG, TANK_CONFIG } from './constants.ts';
import {
  type GameCoreState,
  type InputState,
  type RuntimeTerrainState,
  type TankStructure,
  type BulletStructure,
  type EnemyType,
  type EnemyTank,
  type AABB,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { createP1Tank, createP2Tank, updateTankMovement } from './tank.ts';
import { spawnBullet, updateBullet } from './bullet.ts';
import { EnemyManager } from './enemyManager.ts';
import { AllyAIController } from './ai/allyAI.ts';
import {
  checkBulletVsBullet,
  checkTankVsTanks,
  checkHitboxVsTerrain,
  getBulletHitbox,
  getTankHitbox,
  intersectAABB,
} from './physics.ts';
import { findPathAStar } from './ai/pathfinding.ts';
import { MATCH_STATES, MatchStateMachine, type MatchState } from './matchState.ts';
import { StageManager, type StageDefinition } from './stageManager.ts';
import { ScoreManager } from './scoreManager.ts';
import type { CombatEvent, CombatEventType } from './types.ts';

export class GameEngine {
  private state: GameCoreState;
  private accumulatorMs: number = 0;
  private justResumed: boolean = false;
  private isPaused: boolean = false;
  private totalRealElapsedMs: number = 0;
  private totalDroppedMs: number = 0;
  private tpsAccumulatorMs: number = 0;
  private tpsTicksThisWindow: number = 0;
  private recentTps: number = 60;
  private reportedRenderFps: number = 60;
  private lastShootState: boolean = false;
  private enemyManager: EnemyManager;
  private enableEnemies: boolean;
  private stageManager: StageManager;
  private scoreManager: ScoreManager;
  private matchStateMachine: MatchStateMachine;
  private combatEvents: CombatEvent[] = [];
  private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
  private difficulty: 'DEFAULT' | 'EXTREME' = 'DEFAULT';
  private gameMode: 'SOLO' | 'TWO_PLAYERS_AI' = 'SOLO';
  private allyAI = new AllyAIController();
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
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
  }

  public getDifficulty(): 'DEFAULT' | 'EXTREME' {
    return this.difficulty;
  }

  public setDifficulty(diff: 'DEFAULT' | 'EXTREME'): void {
    this.difficulty = diff;
    this.state.difficulty = diff;
  }

  public getGameMode(): 'SOLO' | 'TWO_PLAYERS_AI' {
    return this.gameMode;
  }

  public setGameMode(mode: 'SOLO' | 'TWO_PLAYERS_AI'): void {
    this.gameMode = mode;
    this.state.gameMode = mode;
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
        this.accumulatorMs = 0;
        this.justResumed = false;
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
        this.justResumed = true;
        this.state.matchState = MATCH_STATES.PLAYING;
        return true;
      }
    }
    return false;
  }

  public restartStage(): void {
    const stage = this.stageManager.getCurrentStage();
    this.accumulatorMs = 0;
    this.justResumed = true;
    this.totalRealElapsedMs = 0;
    this.totalDroppedMs = 0;
    this.tpsAccumulatorMs = 0;
    this.tpsTicksThisWindow = 0;
    this.recentTps = 60;
    this.lastShootState = false;
    this.isPaused = false;
    this.externalInput = { up: false, down: false, left: false, right: false, shoot: false };
    this.combatEvents = [];
    this.enemyManager.reset(stage.enemyQueue);
    this.scoreManager.resetRun();
    this.allyAI.reset();

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
      p2: this.gameMode === 'TWO_PLAYERS_AI' ? createP2Tank() : null,
      p2State: this.gameMode === 'TWO_PLAYERS_AI' ? {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      } : null,
      gameMode: this.gameMode,
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
      difficulty: this.difficulty,
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

  public startMatch(
    mode: 'SOLO' | 'TWO_PLAYERS_AI' = this.gameMode,
    difficulty: 'DEFAULT' | 'EXTREME' = this.difficulty
  ): void {
    this.gameMode = mode;
    this.difficulty = difficulty;
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
    this.allyAI.reset();

    // Carry forward P1 lives and existing total score
    const preservedLives = this.state.p1State.lives;
    const preservedP2Lives = this.state.p2State?.lives ?? P1_CONFIG.STARTING_LIVES;

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
      p2: this.gameMode === 'TWO_PLAYERS_AI' ? createP2Tank() : null,
      p2State: this.gameMode === 'TWO_PLAYERS_AI' ? {
        lives: preservedP2Lives,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      } : null,
      gameMode: this.gameMode,
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
      difficulty: this.difficulty,
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
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
  }

  /**
   * Called when document.visibilityState changes.
   * When returning to visible: resets accumulator and frame timestamp.
   * Never backlogs or simulates sleep time.
   */
  public handleVisibilityChange(isVisible: boolean): void {
    this.accumulatorMs = 0; // Always discard backlog on tab switch
    if (!isVisible) {
      this.isPaused = true;
      this.justResumed = false;
    } else {
      this.isPaused = false;
      this.justResumed = true; // Prevents any catch-up frame burst upon returning
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
   * If an enemy is occupying P1's fixed spawn point (48, 192) for >= 2.0s,
   * command the occupying enemy to find a valid path to vacate using standard physics/A*.
   * Never teleports, pushes through walls, or alters physics.
   */
  public triggerSpawnAvoidance(spawnBox: AABB): void {
    const occupyingEnemies = this.state.enemies.filter(
      (e) => e.isAlive && intersectAABB(getTankHitbox(e.x, e.y), spawnBox)
    );

    for (const enemy of occupyingEnemies) {
      const escapeCandidates = [
        { x: enemy.x, y: Math.max(0, enemy.y - 32) },
        { x: Math.min(TANK_CONFIG.MAX_X, enemy.x + 32), y: enemy.y },
        { x: Math.max(0, enemy.x - 32), y: enemy.y },
        { x: enemy.x, y: Math.min(TANK_CONFIG.MAX_Y, enemy.y + 32) },
      ];

      const otherTanks = [this.state.p1, ...this.state.enemies.filter((other) => other.id !== enemy.id)];

      for (const cand of escapeCandidates) {
        const candBox = getTankHitbox(cand.x, cand.y);
        const terrColl = checkHitboxVsTerrain(candBox, this.state.terrain, { forBullet: false });
        const tankColl = checkTankVsTanks(enemy.id, candBox, otherTanks);
        if (!terrColl.collides && !tankColl) {
          const path = findPathAStar(enemy, cand, this.state.terrain, otherTanks, enemy.id);
          if (path.length > 0) {
            enemy.path = path;
            enemy.targetPos = cand;
            enemy.dirHoldTimer = 0;
            enemy.aiState = 'PATROL';
            break;
          }
        }
      }
    }
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
          if (this.gameMode === 'SOLO' || !this.state.p2 || !this.state.p2State || (this.state.p2State.lives <= 0 && this.state.p2State.isDead)) {
            this.state.isGameOver = true;
            this.state.gameOverReason = 'P1 hết mạng! Game Over.';
            this.state.matchState = MATCH_STATES.GAME_OVER;
            this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
            return;
          }
        } else {
          // Check if spawn position (48, 192) is occupied by any enemy tank
          const spawnBox = getTankHitbox(P1_CONFIG.SPAWN_X, P1_CONFIG.SPAWN_Y);
          const isOccupied = checkTankVsTanks('p1_respawn_probe', spawnBox, this.state.enemies);

          if (isOccupied) {
            // Wait and re-check every 100ms; NEVER shift spawn coordinates
            this.state.p1State.occupiedDuration = (this.state.p1State.occupiedDuration || 0) + dt;
            this.state.p1State.waitingForClearSpawn = true;
            this.state.p1State.spawnCheckTimer = (this.state.p1State.spawnCheckTimer || 0.1) - dt;
            if (this.state.p1State.spawnCheckTimer <= 0) {
              this.state.p1State.spawnCheckTimer = 0.1;
              // If enemy occupies P1 spawn continuously for >= 2.0s, order occupying enemy to vacate
              if (this.state.p1State.occupiedDuration >= 2.0) {
                this.triggerSpawnAvoidance(spawnBox);
              }
            }
          } else {
            // Clear to spawn at fixed (48, 192)
            this.state.p1State.isDead = false;
            this.state.p1State.waitingForClearSpawn = false;
            this.state.p1State.spawnCheckTimer = 0;
            this.state.p1State.occupiedDuration = 0;
            this.state.p1State.shieldTimer = P1_CONFIG.RESPAWN_SHIELD_S;
            this.state.p1.x = P1_CONFIG.SPAWN_X;
            this.state.p1.y = P1_CONFIG.SPAWN_Y;
            this.state.p1.direction = P1_CONFIG.SPAWN_DIRECTION;
            this.state.p1.isAlive = true;
            this.state.p1.isShielded = true;
          }
        }
      }
    }

    if (this.state.p1State.shieldTimer > 0) {
      this.state.p1State.shieldTimer = Math.max(0, this.state.p1State.shieldTimer - dt);
      this.state.p1.isShielded = this.state.p1State.shieldTimer > 0;
    }

    // 1b. P2 Respawn & Shield Handling (Point 4: Ally AI in Two Players Mode)
    if (this.gameMode === 'TWO_PLAYERS_AI' && this.state.p2 && this.state.p2State) {
      if (this.state.p2State.isDead) {
        if (this.state.p2State.respawnTimer > 0) {
          this.state.p2State.respawnTimer -= dt;
        } else {
          if (this.state.p2State.lives <= 0) {
            if (this.state.p1State.lives <= 0 && this.state.p1State.isDead) {
              this.state.isGameOver = true;
              this.state.gameOverReason = 'Cả hai người chơi đều hết mạng! Game Over.';
              this.state.matchState = MATCH_STATES.GAME_OVER;
              this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
              return;
            }
          } else {
            const p2SpawnBox = getTankHitbox(144, 192);
            const otherTanks = [this.state.p1, ...this.state.enemies];
            const isOccupiedByTank = checkTankVsTanks('p2_respawn_probe', p2SpawnBox, otherTanks);
            const isOccupiedByBullet = this.state.bullets.some((b) =>
              intersectAABB(p2SpawnBox, getBulletHitbox(b.x, b.y))
            );
            if (isOccupiedByTank || isOccupiedByBullet) {
              this.state.p2State.occupiedDuration = (this.state.p2State.occupiedDuration || 0) + dt;
              this.state.p2State.waitingForClearSpawn = true;
              this.state.p2State.spawnCheckTimer = (this.state.p2State.spawnCheckTimer || 0.1) - dt;
              if (this.state.p2State.spawnCheckTimer <= 0) {
                this.state.p2State.spawnCheckTimer = 0.1;
                if (this.state.p2State.occupiedDuration >= 2.0) {
                  this.triggerSpawnAvoidance(p2SpawnBox);
                }
              }
            } else {
              this.state.p2State.isDead = false;
              this.state.p2State.waitingForClearSpawn = false;
              this.state.p2State.spawnCheckTimer = 0;
              this.state.p2State.occupiedDuration = 0;
              this.state.p2State.shieldTimer = P1_CONFIG.RESPAWN_SHIELD_S;
              this.state.p2.x = 144;
              this.state.p2.y = 192;
              this.state.p2.direction = 'UP';
              this.state.p2.isAlive = true;
              this.state.p2.isShielded = true;
            }
          }
        }
      }

      if (this.state.p2State.shieldTimer > 0) {
        this.state.p2State.shieldTimer = Math.max(0, this.state.p2State.shieldTimer - dt);
        this.state.p2.isShielded = this.state.p2State.shieldTimer > 0;
      }
    }

    // 2. P1 Tank Movement & Continuous Shooting
    if (this.state.p1.isAlive && !this.state.p1State.isDead) {
      const obstaclesForP1 = (this.state.p2 && this.state.p2.isAlive && !this.state.p2State?.isDead)
        ? [...this.state.enemies, this.state.p2]
        : this.state.enemies;
      updateTankMovement(this.state.p1, input, this.state.terrain, obstaclesForP1);

      // Continuous fire: if shoot button is held down and no P1 bullet is active, immediately fire!
      const p1HasBullet = this.state.bullets.some(
        (b) => b.ownerId === this.state.p1.id || (b.ownerType === 'player' && b.ownerId !== 'p2')
      );
      if (input.shoot && !p1HasBullet) {
        const newBullet = spawnBullet(this.state.p1, null);
        if (newBullet) {
          newBullet.ownerType = 'player';
          this.state.bullets.push(newBullet);
          this.state.bullet = newBullet;
          this.emit('P1_SHOOT', newBullet);
        }
      }
      this.lastShootState = input.shoot;
    } else {
      this.lastShootState = input.shoot;
    }

    // 2b. P2 Ally AI decision, movement & shooting
    // Strict sequence per M7.2 Fix B.3:
    //   1) Determine final movement/aim direction via AllyAI
    //   2) Update P2 tank orientation and position first
    //   3) Re-verify line of fire along the ACTUAL updated P2 direction/position (never hit P1 or Eagle Base)
    //   4) Spawn bullet only if post-turn verification confirms safe shot
    if (this.gameMode === 'TWO_PLAYERS_AI' && this.state.p2 && this.state.p2State && this.state.p2.isAlive && !this.state.p2State.isDead) {
      const p2HasBullet = this.state.bullets.some((b) => b.ownerId === 'p2');
      const p2Decision = this.allyAI.update(
        dt,
        this.state.p2,
        this.state.p1,
        this.state.enemies,
        this.state.terrain,
        p2HasBullet
      );

      const p2MoveInput: InputState = {
        up: p2Decision.direction === 'UP',
        down: p2Decision.direction === 'DOWN',
        left: p2Decision.direction === 'LEFT',
        right: p2Decision.direction === 'RIGHT',
        shoot: false,
      };

      const obstaclesForP2 = [this.state.p1, ...this.state.enemies];
      updateTankMovement(this.state.p2, p2MoveInput, this.state.terrain, obstaclesForP2);

      if (
        p2Decision.shouldShoot &&
        !p2HasBullet &&
        this.allyAI.verifySafeShotAfterTurn(
          this.state.p2,
          this.state.p1,
          this.state.enemies,
          this.state.terrain,
          p2HasBullet
        )
      ) {
        const p2Bullet = spawnBullet(this.state.p2, null);
        if (p2Bullet) {
          p2Bullet.ownerType = 'player';
          p2Bullet.ownerId = 'p2';
          this.state.bullets.push(p2Bullet);
          this.emit('P2_SHOOT', p2Bullet);
        }
      }
    }

    // 3. Update Enemies (AI, movement, and shooting)
    if (this.enableEnemies) {
      // Per Point A: Enemy AI targets and shoots shielded P1/P2; only dead players are ignored
      const p1IsDead = this.state.p1State.isDead;
      const p2IsDead = !this.state.p2 || !this.state.p2.isAlive || Boolean(this.state.p2State?.isDead);
      const newEnemyBullets = this.enemyManager.update(
        dt,
        this.state.p1,
        p1IsDead,
        this.state.terrain,
        this.state.bullets,
        this.difficulty,
        this.gameMode === 'TWO_PLAYERS_AI' ? this.state.p2 : null,
        p2IsDead
      );

      for (const eb of newEnemyBullets) {
        this.state.bullets.push(eb);
        this.emit('ENEMY_SHOOT', eb);
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
      const bulletBox = getBulletHitbox(eb.x, eb.y);

      // Check vs P1
      if (this.state.p1.isAlive && !this.state.p1State.isDead) {
        const p1Box = getTankHitbox(this.state.p1.x, this.state.p1.y);

        if (intersectAABB(bulletBox, p1Box)) {
          // Bullet contacts P1 hitbox -> bullet is always consumed/stopped (no penetration)
          consumedBulletIds.add(eb.id);

          // If P1 has active shield: absorb bullet completely, take NO damage!
          if (!this.state.p1.isShielded && this.state.p1State.shieldTimer <= 0) {
            // If P1 is NOT shielded: P1 dies with dedicated P1_EXPLOSION!
            this.emitCombatEvent('P1_EXPLOSION', this.state.p1.x + 8, this.state.p1.y + 8);
            this.state.p1State.lives -= 1;
            this.state.p1State.isDead = true;
            this.state.p1.isAlive = false;
            this.state.p1State.respawnTimer = P1_CONFIG.RESPAWN_DELAY_S;
            this.state.p1State.waitingForClearSpawn = false;
            this.state.p1State.spawnCheckTimer = 0;

            // Immediately delete player 1 bullets; enemy bullets keep flying! (Point H)
            this.state.bullets = this.state.bullets.filter(
              (b) => b.ownerId !== this.state.p1.id
            );
            if (this.state.bullet?.ownerId === this.state.p1.id) {
              this.state.bullet = null;
            }

            if (this.state.p1State.lives <= 0) {
              if (this.gameMode === 'SOLO' || !this.state.p2 || !this.state.p2State || (this.state.p2State.lives <= 0 && this.state.p2State.isDead)) {
                this.state.isGameOver = true;
                this.state.gameOverReason = 'P1 hết mạng! Game Over.';
                this.state.matchState = MATCH_STATES.GAME_OVER;
                this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
              }
            }
          }
          continue;
        }
      }

      // Check vs P2 (Two-Player mode)
      if (this.gameMode === 'TWO_PLAYERS_AI' && this.state.p2 && this.state.p2State && this.state.p2.isAlive && !this.state.p2State.isDead) {
        const p2Box = getTankHitbox(this.state.p2.x, this.state.p2.y);
        if (intersectAABB(bulletBox, p2Box)) {
          consumedBulletIds.add(eb.id);
          if (!this.state.p2.isShielded && this.state.p2State.shieldTimer <= 0) {
            this.emitCombatEvent('TANK_EXPLOSION', this.state.p2.x + 8, this.state.p2.y + 8);
            this.state.p2State.lives -= 1;
            this.state.p2State.isDead = true;
            this.state.p2.isAlive = false;
            this.state.p2State.respawnTimer = P1_CONFIG.RESPAWN_DELAY_S;
            this.state.p2State.waitingForClearSpawn = false;
            this.state.p2State.spawnCheckTimer = 0;
            this.state.bullets = this.state.bullets.filter(
              (b) => b.ownerId !== 'p2'
            );

            if (this.state.p2State.lives <= 0) {
              if (this.state.p1State.lives <= 0 && this.state.p1State.isDead) {
                this.state.isGameOver = true;
                this.state.gameOverReason = 'Cả hai người chơi đều hết mạng! Game Over.';
                this.state.matchState = MATCH_STATES.GAME_OVER;
                this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
              }
            }
          }
          continue;
        }
      }
    }

    if (consumedBulletIds.size > 0) {
      this.state.bullets = this.state.bullets.filter((b) => !consumedBulletIds.has(b.id));
    }

    // 8. Sync state.bullet with P1 active bullet
    this.state.bullet =
      this.state.bullets.find(
        (b) => b.ownerId === this.state.p1.id || (b.ownerType === 'player' && b.ownerId !== 'p2')
      ) ?? null;

    // 9. Sync active enemies list
    if (this.enableEnemies) {
      this.state.enemies = this.enemyManager.getActiveEnemies();
      this.state.enemyQueue = this.enemyManager.getQueue();
    }

    // 10. Check Base destroyed state
    if (this.state.terrain.isBaseDestroyed && !this.state.isGameOver) {
      this.emitCombatEvent('BASE_EXPLOSION', 96, 192); // Eagle center at (96, 192)
      this.state.isGameOver = true;
      this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    }

    // 11. Check Stage Clear condition
    const hasLivingPlayer = this.state.p1State.lives > 0 || !this.state.p1State.isDead ||
      (this.gameMode === 'TWO_PLAYERS_AI' && this.state.p2State && (this.state.p2State.lives > 0 || !this.state.p2State.isDead));

    if (
      !this.state.isGameOver &&
      !this.state.terrain.isBaseDestroyed &&
      hasLivingPlayer &&
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

    // Discard any lingering backlog or massive delta immediately upon resuming or tab switch
    if (this.justResumed) {
      this.justResumed = false;
      this.accumulatorMs = 0;
      deltaMs = Math.min(deltaMs, SIMULATION_CONFIG.FIXED_DT_MS);
    }

    // Clamp incoming frame delta (max 50ms = 3 ticks) to prevent hyperspeed catch-up jumps
    const clampedDeltaMs = Math.max(0, Math.min(deltaMs, SIMULATION_CONFIG.MAX_FRAME_DELTA_MS));

    // Track timing telemetry
    this.totalRealElapsedMs += deltaMs;
    const droppedMs = Math.max(0, deltaMs - clampedDeltaMs);
    this.totalDroppedMs += droppedMs;

    this.state.stageElapsedSeconds += clampedDeltaMs / 1000;
    this.accumulatorMs += clampedDeltaMs;

    // Accumulator backlog clamp: strictly never more than 3 ticks (~50ms) backlog
    // Note: 3 * (1000 / 60) in IEEE-754 float is 50.00000000000001ms; allow 1e-4 epsilon on normal frames
    // so 3 full ticks are not truncated to 2 ticks by floating-point rounding.
    const isMassiveSpike = deltaMs > SIMULATION_CONFIG.MAX_FRAME_DELTA_MS;
    const maxAcc = isMassiveSpike
      ? SIMULATION_CONFIG.MAX_ACCUMULATOR_MS
      : SIMULATION_CONFIG.MAX_ACCUMULATOR_MS + 1e-4;

    if (this.accumulatorMs > maxAcc) {
      const excess = this.accumulatorMs - maxAcc;
      this.totalDroppedMs += excess;
      this.accumulatorMs = maxAcc;
      this.state.diagnosticLog = 'Simulation backlog clamped';
    }

    const tickThreshold = isMassiveSpike
      ? SIMULATION_CONFIG.FIXED_DT_MS
      : SIMULATION_CONFIG.FIXED_DT_MS - 1e-6;

    let ticksRun = 0;
    while (
      this.accumulatorMs >= tickThreshold &&
      ticksRun < SIMULATION_CONFIG.MAX_TICKS_PER_FRAME
    ) {
      this.stepTick(input);
      this.accumulatorMs = Math.max(0, this.accumulatorMs - SIMULATION_CONFIG.FIXED_DT_MS);
      ticksRun++;
    }

    // Measure live Simulation Ticks Per Second (TPS) over 500ms sliding windows
    this.tpsAccumulatorMs += deltaMs;
    this.tpsTicksThisWindow += ticksRun;
    if (this.tpsAccumulatorMs >= 500) {
      this.recentTps = Math.round((this.tpsTicksThisWindow * 1000) / this.tpsAccumulatorMs);
      this.tpsAccumulatorMs = 0;
      this.tpsTicksThisWindow = 0;
    }

    return ticksRun;
  }

  public getTimingTelemetry(): {
    renderFps: number;
    simulationTps: number;
    actualTicks: number;
    realElapsedSeconds: number;
    simulatedSeconds: number;
    droppedSeconds: number;
    accumulatorMs: number;
  } {
    return {
      renderFps: this.reportedRenderFps,
      simulationTps: this.recentTps,
      actualTicks: this.state.tickCount,
      realElapsedSeconds: Number((this.totalRealElapsedMs / 1000).toFixed(3)),
      simulatedSeconds: Number((this.state.tickCount * SIMULATION_CONFIG.FIXED_DT_S).toFixed(3)),
      droppedSeconds: Number((this.totalDroppedMs / 1000).toFixed(3)),
      accumulatorMs: Number(this.accumulatorMs.toFixed(2)),
    };
  }

  public setReportedRenderFps(fps: number): void {
    this.reportedRenderFps = fps;
  }
}
