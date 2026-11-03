/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ENEMY_CONFIG, TANK_CONFIG } from './constants.ts';
import {
  type EnemyTank,
  type EnemyType,
  type TankStructure,
  type RuntimeTerrainState,
  type BulletStructure,
} from './types.ts';
import {
  getTankHitbox,
  checkHitboxVsTerrain,
  checkTankVsTanks,
  getBulletHitbox,
  intersectAABB,
} from './physics.ts';
import { updateEnemyAI } from './ai/enemyAI.ts';
import { spawnBullet } from './bullet.ts';
import { EnemyCoordinator } from './ai/coordinator.ts';

export class EnemyManager {
  private queue: EnemyType[] = [];
  private activeEnemies: EnemyTank[] = [];
  private spawnIndex: number = 0;
  private spawnCooldown: number = 1.0;
  private nextEnemyId: number = 1;
  private coordinator: EnemyCoordinator;

  constructor() {
    this.coordinator = new EnemyCoordinator();
    this.reset();
  }

  public reset(customQueue?: EnemyType[]): void {
    this.queue = customQueue ? [...customQueue] : [...ENEMY_CONFIG.QUEUE];
    this.activeEnemies = [];
    this.spawnIndex = 0;
    this.spawnCooldown = 1.0;
    this.nextEnemyId = 1;
    this.coordinator.reset();
  }

  public getQueue(): EnemyType[] {
    return this.queue;
  }

  public getActiveEnemies(): EnemyTank[] {
    return this.activeEnemies;
  }

  public getRemainingCount(): number {
    return this.queue.length;
  }

  public getCoordinator(): EnemyCoordinator {
    return this.coordinator;
  }

  /**
   * Spawns an enemy if conditions are met:
   * - queue is not empty
   * - active enemies < MAX_ACTIVE (5)
   * - spawn location has no other tank, no bullet, and no impassable terrain
   * If blocked: DOES NOT discard or shift from queue; waits and retries.
   */
  public trySpawnEnemy(
    terrain: RuntimeTerrainState,
    allTanks: Array<{ id: string; x: number; y: number; isAlive: boolean }>,
    activeBullets: BulletStructure[] = []
  ): EnemyTank | null {
    if (this.queue.length === 0) return null;
    if (this.activeEnemies.length >= ENEMY_CONFIG.MAX_ACTIVE) return null;

    const spawnPoint = ENEMY_CONFIG.SPAWN_POINTS[this.spawnIndex];
    const spawnBox = getTankHitbox(spawnPoint.x, spawnPoint.y);

    // 1. Check for terrain collision
    const terrainColl = checkHitboxVsTerrain(spawnBox, terrain, { forBullet: false });
    if (terrainColl.collides) {
      return null;
    }

    // 2. Check for tank collision
    const hasTankConflict = checkTankVsTanks('spawn_probe', spawnBox, allTanks);
    if (hasTankConflict) {
      return null; // Obstructed by another tank -> wait, queue preserved
    }

    // 3. Check for flying bullets in spawn box
    for (const bullet of activeBullets) {
      const bulletBox = getBulletHitbox(bullet.x, bullet.y);
      if (intersectAABB(spawnBox, bulletBox)) {
        return null; // Flying bullet danger -> wait, queue preserved
      }
    }

    // Safe to spawn! Cycle spawn index
    this.spawnIndex = (this.spawnIndex + 1) % ENEMY_CONFIG.SPAWN_POINTS.length;

    const type = this.queue.shift()!;
    const specs = ENEMY_CONFIG.SPECS[type];

    const newEnemy: EnemyTank = {
      id: `enemy_${this.nextEnemyId++}_${type}`,
      x: spawnPoint.x,
      y: spawnPoint.y,
      direction: 'DOWN',
      speed: specs.speed,
      type: 'enemy',
      enemyType: type,
      tier: 1,
      isAlive: true,
      isShielded: true, // 1s invulnerability at spawn
      hp: specs.hp,
      maxHp: specs.hp,
      scoreValue: specs.score,
      aiState: 'PATROL',
      targetPos: null,
      lastKnownP1Pos: null,
      lostTargetTimer: 0,
      searchTimer: 0,
      path: [],
      pathCooldown: 0,
      shootCooldown: specs.shootCooldown,
      aimTimer: 0,
      aimTime: specs.aimTime,
      directionHistory: ['DOWN'],
      dirHoldTimer: 0.5,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      flankOffset: { x: 0, y: 0 },
      spawnShieldTimer: ENEMY_CONFIG.SPAWN_SHIELD_S,
    };

    this.activeEnemies.push(newEnemy);
    return newEnemy;
  }

  /**
   * Updates all active enemies: coordination, AI, movement, and shooting decisions.
   */
  public update(
    dt: number,
    p1: TankStructure,
    p1IsDead: boolean,
    terrain: RuntimeTerrainState,
    bullets: BulletStructure[]
  ): BulletStructure[] {
    // 1. Spawning with minimum 1.0s interval
    this.spawnCooldown -= dt;
    if (this.spawnCooldown <= 0) {
      const allTanks = [p1, ...this.activeEnemies];
      const spawned = this.trySpawnEnemy(terrain, allTanks, bullets);
      if (spawned) {
        this.spawnCooldown = ENEMY_CONFIG.SPAWN_INTERVAL_S;
      }
    }

    // 2. Coordinator update (groups enemies and assigns flank vectors every 0.5s)
    this.coordinator.update(dt, this.activeEnemies);

    const newBullets: BulletStructure[] = [];

    // 3. Update each active enemy
    for (const enemy of this.activeEnemies) {
      if (!enemy.isAlive) continue;

      const otherTanks = [p1, ...this.activeEnemies.filter((e) => e.id !== enemy.id)];

      // AI Decision (P1 can be targeted and shot even when shielded; only dead P1 is ignored)
      const aiDecision = updateEnemyAI(
        enemy,
        p1,
        p1IsDead,
        terrain,
        dt,
        otherTanks
      );

      // Handle Direction & Movement
      if (aiDecision.targetDir) {
        enemy.direction = aiDecision.targetDir;

        const step = enemy.speed * dt; // pixel step
        let nextX = enemy.x;
        let nextY = enemy.y;

        if (enemy.direction === 'UP') nextY -= step;
        else if (enemy.direction === 'DOWN') nextY += step;
        else if (enemy.direction === 'LEFT') nextX -= step;
        else if (enemy.direction === 'RIGHT') nextX += step;

        nextX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, nextX));
        nextY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, nextY));

        const nextBox = getTankHitbox(nextX, nextY);

        // Check Terrain collision
        const terrainColl = checkHitboxVsTerrain(nextBox, terrain, { forBullet: false });

        // Check Tank-to-Tank collision
        const tankColl = checkTankVsTanks(enemy.id, nextBox, otherTanks);

        if (!terrainColl.collides && !tankColl) {
          enemy.x = nextX;
          enemy.y = nextY;
        } else {
          // Blocked: clear current path and reset dirHoldTimer so it can pick a new direction
          enemy.path = [];
          enemy.dirHoldTimer = 0;
        }
      }

      // Handle Shooting (Only when no active bullet from this enemy in flight!)
      const enemyHasBullet = bullets.some((b) => b.ownerId === enemy.id);
      if (enemy.debugLog) {
        enemy.debugLog.hasActiveBullet = enemyHasBullet;
      }

      if (aiDecision.shouldShoot && !enemyHasBullet) {
        const bullet = spawnBullet(enemy, null);
        if (bullet) {
          bullet.ownerType = 'enemy';
          newBullets.push(bullet);
          enemy.shootCooldown = ENEMY_CONFIG.SPECS[enemy.enemyType].shootCooldown;
          enemy.aimTimer = 0; // Reset aim timer after shooting
          if (enemy.debugLog) {
            enemy.debugLog.hasActiveBullet = true;
          }
        }
      }
    }

    return newBullets;
  }

  /**
   * Applies damage to an enemy tank.
   * Returns true if the enemy was destroyed.
   */
  public damageEnemy(enemyId: string): { destroyed: boolean; score: number; enemy?: EnemyTank } {
    const enemy = this.activeEnemies.find((e) => e.id === enemyId);
    if (!enemy || !enemy.isAlive) {
      return { destroyed: false, score: 0 };
    }

    // Spawn shield blocks all damage
    if (enemy.spawnShieldTimer <= 0) {
      enemy.isShielded = false;
    }
    if (enemy.spawnShieldTimer > 0 || enemy.isShielded) {
      return { destroyed: false, score: 0, enemy };
    }

    enemy.hp -= 1;
    if (enemy.hp <= 0) {
      enemy.isAlive = false;
      this.activeEnemies = this.activeEnemies.filter((e) => e.id !== enemyId);
      return { destroyed: true, score: enemy.scoreValue, enemy };
    }

    return { destroyed: false, score: 0, enemy };
  }
}
