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

export class GameEngine {
  private state: GameCoreState;
  private accumulatorMs: number = 0;
  private isPaused: boolean = false;
  private lastShootState: boolean = false;
  private enemyManager: EnemyManager;
  private enableEnemies: boolean;

  constructor(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = true,
    customEnemyQueue?: EnemyType[]
  ) {
    this.enableEnemies = enableEnemies;
    this.enemyManager = new EnemyManager();
    if (customEnemyQueue) {
      this.enemyManager.reset(customEnemyQueue);
    }

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
      score: 0,
      terrain: customTerrain ?? createRuntimeTerrainState(),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
    };
  }

  public getState(): Readonly<GameCoreState> {
    return this.state;
  }

  public getEnemyManager(): EnemyManager {
    return this.enemyManager;
  }

  public reset(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = true,
    customEnemyQueue?: EnemyType[]
  ): void {
    this.accumulatorMs = 0;
    this.lastShootState = false;
    this.enableEnemies = enableEnemies;
    this.enemyManager.reset(customEnemyQueue);

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
      score: 0,
      terrain: customTerrain ?? createRuntimeTerrainState(),
      isGameOver: false,
      isStageClear: false,
      gameOverReason: null,
      diagnosticLog: null,
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
    if (this.isPaused || this.state.isGameOver || this.state.isStageClear) {
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
            this.state.score += hitResult.score;
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

        // If P1 is NOT shielded: P1 dies!
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
      this.state.isGameOver = true;
      this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
    }

    // 11. Check Stage Clear condition
    if (
      !this.state.isGameOver &&
      !this.state.terrain.isBaseDestroyed &&
      this.state.p1State.lives > 0 &&
      this.state.totalDefeatedEnemies >= ENEMY_CONFIG.TOTAL_COUNT
    ) {
      this.state.isStageClear = true;
    }
  }

  /**
   * Advances simulation with real-world delta time using fixed 60Hz ticks.
   * Manages accumulator, backlog limits, and frame clamp.
   */
  public advanceTime(deltaMs: number, input: InputState): number {
    if (this.isPaused) {
      return 0;
    }

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
