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
  type AABB,
} from './types.ts';
import {
  getTankHitbox,
  checkHitboxVsTerrain,
  checkTankVsTanks,
  trySafeGridSnap,
  getBulletHitbox,
  intersectAABB,
} from './physics.ts';
import { updateEnemyAI, pickBestOpenDirection, isFacingBrickObstacle } from './ai/enemyAI.ts';
import { spawnBullet } from './bullet.ts';
import { EnemyCoordinator } from './ai/coordinator.ts';
import { findPathAStar } from './ai/pathfinding.ts';

export class EnemyManager {
  private queue: EnemyType[] = [];
  private activeEnemies: EnemyTank[] = [];
  private spawnIndex: number = 0;
  private spawnCooldown: number = 1.0;
  private spawnRetryTimer: number = 0;
  private spawnPointOccupiedTimers: number[] = [0, 0, 0];
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
    this.spawnRetryTimer = 0;
    this.spawnPointOccupiedTimers = [0, 0, 0];
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

  public getSpawnOccupiedTimers(): number[] {
    return [...this.spawnPointOccupiedTimers];
  }

  /**
   * Spawns an enemy if conditions are met:
   * - queue is not empty
   * - active enemies < MAX_ACTIVE (5)
   * - spawn location has no other tank, no bullet, and no impassable terrain
   * If blocked by tank: does NOT discard from queue; retries every 100ms.
   * If occupied >= 2.0s: orders occupying enemy to find a valid path to vacate.
   */
  public trySpawnEnemy(
    terrain: RuntimeTerrainState,
    allTanks: Array<{ id: string; x: number; y: number; isAlive: boolean }>,
    activeBullets: BulletStructure[] = [],
    dt: number = 0.01667
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
      // Obstructed by another tank -> increment occupancy timer and wait
      this.spawnPointOccupiedTimers[this.spawnIndex] =
        (this.spawnPointOccupiedTimers[this.spawnIndex] || 0) + dt;

      // If occupied for >= 2.0s, order occupying enemy tank to vacate
      if (this.spawnPointOccupiedTimers[this.spawnIndex] >= 2.0) {
        this.triggerEnemySpawnAvoidance(spawnBox, terrain, allTanks);
      }
      return null; // Queue strictly preserved
    }

    // 3. Check for flying bullets in spawn box
    for (const bullet of activeBullets) {
      const bulletBox = getBulletHitbox(bullet.x, bullet.y);
      if (intersectAABB(spawnBox, bulletBox)) {
        return null; // Flying bullet danger -> wait, queue preserved
      }
    }

    // Clear occupancy timer on successful check
    this.spawnPointOccupiedTimers[this.spawnIndex] = 0;

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
   * If an enemy is occupying an enemy spawn point for >= 2.0s,
   * find nearest valid path to vacate using standard physics/A*.
   */
  public triggerEnemySpawnAvoidance(
    spawnBox: AABB,
    terrain: RuntimeTerrainState,
    allTanks: Array<{ id: string; x: number; y: number; isAlive: boolean }>
  ): void {
    const occupyingEnemies = this.activeEnemies.filter(
      (e) => e.isAlive && intersectAABB(getTankHitbox(e.x, e.y), spawnBox)
    );

    for (const enemy of occupyingEnemies) {
      // Possible escape points (move down or side away from row 0)
      const escapeCandidates = [
        { x: enemy.x, y: Math.min(TANK_CONFIG.MAX_Y, enemy.y + 32) },
        { x: Math.min(TANK_CONFIG.MAX_X, enemy.x + 32), y: enemy.y },
        { x: Math.max(0, enemy.x - 32), y: enemy.y },
        { x: enemy.x, y: Math.min(TANK_CONFIG.MAX_Y, enemy.y + 48) },
      ];

      const otherTanks = allTanks.filter((t) => t.id !== enemy.id);

      for (const cand of escapeCandidates) {
        const candBox = getTankHitbox(cand.x, cand.y);
        const terr = checkHitboxVsTerrain(candBox, terrain, { forBullet: false });
        const tank = checkTankVsTanks(enemy.id, candBox, otherTanks);
        if (!terr.collides && !tank) {
          const path = findPathAStar(enemy, cand, terrain, otherTanks, enemy.id);
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
   * Updates all active enemies: coordination, AI, movement, and shooting decisions.
   */
  public update(
    dt: number,
    p1: TankStructure,
    p1IsDead: boolean,
    terrain: RuntimeTerrainState,
    bullets: BulletStructure[],
    difficulty: 'DEFAULT' | 'EXTREME' = 'DEFAULT'
  ): BulletStructure[] {
    // 1. Spawning with minimum 1.0s interval between successful spawns, retrying every 100ms if blocked
    if (this.spawnCooldown > 0) {
      this.spawnCooldown -= dt;
    } else {
      this.spawnRetryTimer -= dt;
      if (this.spawnRetryTimer <= 0) {
        this.spawnRetryTimer = 0.1; // Check every 100ms
        const allTanks = [p1, ...this.activeEnemies];
        const spawned = this.trySpawnEnemy(terrain, allTanks, bullets, dt);
        if (spawned) {
          this.spawnCooldown = ENEMY_CONFIG.SPAWN_INTERVAL_S;
          this.spawnRetryTimer = 0;
        }
      }
    }

    // 2. Coordinator update (groups enemies and assigns validated tactical approach vectors every 0.5s)
    this.coordinator.update(dt, this.activeEnemies, terrain, p1);

    const newBullets: BulletStructure[] = [];

    // 3. Update each active enemy
    for (const enemy of this.activeEnemies) {
      if (!enemy.isAlive) continue;

      const otherEnemies = this.activeEnemies.filter((e) => e.id !== enemy.id);
      const otherTanks = [p1, ...otherEnemies];
      const enemyHasBullet = bullets.some((b) => b.ownerId === enemy.id);

      // AI Decision (P1 can be targeted and shot even when shielded; only dead P1 is ignored)
      const aiDecision = updateEnemyAI(
        enemy,
        p1,
        p1IsDead,
        terrain,
        dt,
        otherTanks,
        difficulty
      );

      // Handle Direction & Movement
      if (aiDecision.targetDir) {
        const prevDir = enemy.direction;
        const requestedDir = aiDecision.targetDir;

        // Safe grid alignment when turning or slightly off-grid (<= 4px)
        const snapResult = trySafeGridSnap(enemy.x, enemy.y, prevDir, requestedDir, terrain);
        if (
          snapResult.success &&
          (snapResult.snappedX !== enemy.x || snapResult.snappedY !== enemy.y)
        ) {
          const snappedBox = getTankHitbox(snapResult.snappedX, snapResult.snappedY);
          if (!checkTankVsTanks(enemy.id, snappedBox, otherTanks)) {
            enemy.x = snapResult.snappedX;
            enemy.y = snapResult.snappedY;
          }
        }

        enemy.direction = requestedDir;

        const step = enemy.speed * dt; // pixel step (fixed 60Hz: 1px/tick at 60px/s)
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
          enemy.consecutiveBlockCount = 0;
        } else {
          const hitOtherEnemy = checkTankVsTanks(enemy.id, nextBox, otherEnemies);
          const readyToShoot = enemy.shootCooldown <= 0 && enemy.spawnShieldTimer <= 0 && !enemyHasBullet;
          const facingBrick = isFacingBrickObstacle(enemy, terrain);

          const alignedWithP1 =
            !p1IsDead &&
            (enemy.debugLog?.losToP1 ?? false) &&
            ((Math.abs(enemy.x - p1.x) <= 4 &&
              ((p1.y > enemy.y && enemy.direction === 'DOWN') ||
                (p1.y < enemy.y && enemy.direction === 'UP'))) ||
              (Math.abs(enemy.y - p1.y) <= 4 &&
                ((p1.x > enemy.x && enemy.direction === 'RIGHT') ||
                  (p1.x < enemy.x && enemy.direction === 'LEFT'))));

          const alignedWithEagleSiege =
            Math.hypot(96 - enemy.x, 192 - enemy.y) <= 48 &&
            ((Math.abs(enemy.x - 96) <= 4 && enemy.direction === 'DOWN') ||
              (Math.abs(enemy.y - 192) <= 4 &&
                ((enemy.x < 96 && enemy.direction === 'RIGHT') ||
                  (enemy.x > 96 && enemy.direction === 'LEFT'))));

          const isEngagingCombatTarget =
            !hitOtherEnemy &&
            (enemy.debugLog?.isAligned ?? false) &&
            (alignedWithP1 || alignedWithEagleSiege);

          const isAimingAtTarget =
            isEngagingCombatTarget ||
            (!hitOtherEnemy &&
              readyToShoot &&
              (enemy.aimTimer || 0) > 0 &&
              (enemy.debugLog?.isAligned ?? false));

          // If blocked by a destructible brick wall on its path, allow blasting through when ready
          if (!hitOtherEnemy && facingBrick && readyToShoot) {
            aiDecision.shouldShoot = true;
          }

          if (hitOtherEnemy || (!isAimingAtTarget && !(facingBrick && readyToShoot))) {
            enemy.path = [];
            enemy.consecutiveBlockCount = (enemy.consecutiveBlockCount || 0) + 1;

            // If blocked by another enemy or blocked for >= 2 frames, turn into an unobstructed corridor and hold
            if (hitOtherEnemy || enemy.consecutiveBlockCount >= 2) {
              const goal = enemy.targetPos ?? { x: 96, y: 192 };
              const openDir = pickBestOpenDirection(enemy, terrain, otherTanks, goal);
              if (openDir) {
                enemy.direction = openDir;
                enemy.dirHoldTimer = 0.6;
                enemy.pathCooldown = 0.6;
                enemy.consecutiveBlockCount = 0;
              }
            }
          }
        }
      }

      // STUCK DETECTION & RECOVERY:
      // An enemy is legitimately allowed to stand still while engaging an aligned combat target (P1/Eagle)
      // or actively aiming with a ready shot
      const otherEnemiesForStuck = this.activeEnemies.filter((e) => e.id !== enemy.id);
      const alignedWithP1ForStuck =
        !p1IsDead &&
        (enemy.debugLog?.losToP1 ?? false) &&
        ((Math.abs(enemy.x - p1.x) <= 4 &&
          ((p1.y > enemy.y && enemy.direction === 'DOWN') ||
            (p1.y < enemy.y && enemy.direction === 'UP'))) ||
          (Math.abs(enemy.y - p1.y) <= 4 &&
            ((p1.x > enemy.x && enemy.direction === 'RIGHT') ||
              (p1.x < enemy.x && enemy.direction === 'LEFT'))));
      const alignedWithEagleForStuck =
        Math.hypot(96 - enemy.x, 192 - enemy.y) <= 48 &&
        ((Math.abs(enemy.x - 96) <= 4 && enemy.direction === 'DOWN') ||
          (Math.abs(enemy.y - 192) <= 4 &&
            ((enemy.x < 96 && enemy.direction === 'RIGHT') ||
              (enemy.x > 96 && enemy.direction === 'LEFT'))));
      const isLegitAiming =
        (enemy.debugLog?.isAligned ?? false) &&
        ((alignedWithP1ForStuck || alignedWithEagleForStuck) ||
          ((enemy.aimTimer || 0) > 0 && enemy.shootCooldown <= 0 && !enemyHasBullet)) &&
        !checkTankVsTanks(enemy.id, getTankHitbox(enemy.x, enemy.y), otherEnemiesForStuck);
      const prevPos = enemy.lastStuckPos ?? { x: enemy.x, y: enemy.y };
      const distFromLastPos = Math.hypot(enemy.x - prevPos.x, enemy.y - prevPos.y);

      if (!isLegitAiming && distFromLastPos < 1.0) {
        enemy.stuckTimer = (enemy.stuckTimer || 0) + dt;
      } else {
        enemy.stuckTimer = 0;
        enemy.lastStuckPos = { x: enemy.x, y: enemy.y };
      }

      // If stuck for >= 0.75 seconds, trigger unstuck resolution
      if ((enemy.stuckTimer || 0) >= 0.75) {
        // First check if facing a destructible brick tile and ready to shoot
        if (
          isFacingBrickObstacle(enemy, terrain) &&
          enemy.shootCooldown <= 0 &&
          enemy.spawnShieldTimer <= 0 &&
          !enemyHasBullet
        ) {
          aiDecision.shouldShoot = true;
        } else {
          enemy.path = [];
          enemy.flankOffset = undefined;
          enemy.assignedApproachPos = undefined;
          enemy.cachedDestination = undefined;

          const goal = enemy.targetPos ?? { x: 96, y: 192 };
          const openDir = pickBestOpenDirection(enemy, terrain, otherTanks, goal);
          if (openDir) {
            enemy.direction = openDir;
            enemy.dirHoldTimer = 0.6;
            enemy.pathCooldown = 0.4;
          }
        }
        enemy.stuckTimer = 0;
        enemy.lastStuckPos = { x: enemy.x, y: enemy.y };
      }

      // Handle Shooting (Only when no active bullet from this enemy in flight!)
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
