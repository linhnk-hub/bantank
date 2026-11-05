/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AI_CONFIG, MAP_DIMENSIONS, TANK_CONFIG, ENEMY_CONFIG } from '../constants.ts';
import {
  TILE_TYPES,
  type EnemyTank,
  type TankStructure,
  type RuntimeTerrainState,
  type Direction,
} from '../types.ts';
import { getBrickMask } from '../terrain.ts';
import { getTankHitbox, checkHitboxVsTerrain, checkTankVsTanks } from '../physics.ts';
import { findPathAStar, isTileWalkable } from './pathfinding.ts';
import { scoreAndSelectTarget } from './targetScoring.ts';
import { defaultPRNG } from '../utils/prng.ts';

const ALL_DIRECTIONS: readonly Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;

export function getOppositeDirection(dir: Direction): Direction {
  if (dir === 'UP') return 'DOWN';
  if (dir === 'DOWN') return 'UP';
  if (dir === 'LEFT') return 'RIGHT';
  return 'LEFT';
}

function getNextTileKey(x: number, y: number, dir: Direction): string {
  let c = Math.round(x / 16);
  let r = Math.round(y / 16);
  if (dir === 'UP') r -= 1;
  else if (dir === 'DOWN') r += 1;
  else if (dir === 'LEFT') c -= 1;
  else if (dir === 'RIGHT') c += 1;
  return `${r}_${c}`;
}

export function recordVisitedTile(enemy: EnemyTank): void {
  const c = Math.round(enemy.x / 16);
  const r = Math.round(enemy.y / 16);
  const key = `${r}_${c}`;
  if (!enemy.recentTiles) {
    enemy.recentTiles = [key];
    return;
  }
  if (enemy.recentTiles[enemy.recentTiles.length - 1] !== key) {
    enemy.recentTiles.push(key);
    if (enemy.recentTiles.length > 6) {
      enemy.recentTiles.shift();
    }
  }
}

/**
 * Checks if there is a direct line of sight between two pixel coordinates.
 * Radius must be <= 80px (360 degrees).
 * Blocked by: BRICK (if mask > 0) and STEEL.
 * NOT blocked by: WATER, GRASS, ICE, EMPTY.
 */
export function hasLineOfSight(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  terrain: RuntimeTerrainState,
  maxDistance: number = AI_CONFIG.DETECTION_RADIUS_PX
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy);

  if (dist > maxDistance) {
    return false;
  }

  // Raycast from center to center (8px offset)
  const startX = fromX + 8;
  const startY = fromY + 8;
  const endX = toX + 8;
  const endY = toY + 8;

  const steps = Math.ceil(dist / 4); // sample every 4px
  if (steps === 0) return true;

  const stepX = (endX - startX) / steps;
  const stepY = (endY - startY) / steps;

  for (let i = 1; i < steps; i++) {
    const curX = startX + stepX * i;
    const curY = startY + stepY * i;

    const col = Math.floor(curX / 16);
    const row = Math.floor(curY / 16);

    if (row < 0 || row >= MAP_DIMENSIONS.ROWS || col < 0 || col >= MAP_DIMENSIONS.COLS) {
      return false;
    }

    const tile = terrain.currentMap[row][col];

    if (tile === TILE_TYPES.STEEL) {
      return false; // STEEL blocks LoS
    }

    if (tile === TILE_TYPES.BRICK) {
      const mask = getBrickMask(terrain, row, col);
      if (mask > 0) {
        return false; // Intact BRICK blocks LoS
      }
    }

    // WATER, GRASS, ICE do not block LoS!
  }

  return true;
}

/**
 * Checks if the gun bore is aligned with the target within <= 4px tolerance.
 */
export function isAlignedWithTarget(
  enemy: EnemyTank,
  targetX: number,
  targetY: number,
  tolerance: number = AI_CONFIG.ALIGNMENT_TOLERANCE_PX
): boolean {
  const dx = targetX - enemy.x;
  const dy = targetY - enemy.y;

  if (enemy.direction === 'UP' && dy < 0 && Math.abs(dx) <= tolerance) return true;
  if (enemy.direction === 'DOWN' && dy > 0 && Math.abs(dx) <= tolerance) return true;
  if (enemy.direction === 'LEFT' && dx < 0 && Math.abs(dy) <= tolerance) return true;
  if (enemy.direction === 'RIGHT' && dx > 0 && Math.abs(dy) <= tolerance) return true;

  return false;
}

/**
 * Predicts P1 intercept position up to 1 second ahead, clamped at max 48px.
 * If projected position is blocked or unreachable, returns current P1 position.
 */
export function calculateLeadPosition(
  p1: TankStructure,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>,
  enemyId?: string
): { x: number; y: number } {
  const leadDist = Math.min(
    AI_CONFIG.LEAD_PREDICTION_MAX_DIST_PX,
    p1.speed * AI_CONFIG.LEAD_PREDICTION_MAX_TIME_S
  );

  let targetX = p1.x;
  let targetY = p1.y;

  if (p1.direction === 'UP') targetY -= leadDist;
  else if (p1.direction === 'DOWN') targetY += leadDist;
  else if (p1.direction === 'LEFT') targetX -= leadDist;
  else if (p1.direction === 'RIGHT') targetX += leadDist;

  // Clamp within map bounds
  targetX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, targetX));
  targetY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, targetY));

  // Verify candidate box is not obstructed by impassable terrain
  const candidateBox = getTankHitbox(targetX, targetY);
  const terrainColl = checkHitboxVsTerrain(candidateBox, terrain, { forBullet: false });
  if (terrainColl.collides) {
    return { x: p1.x, y: p1.y };
  }

  return { x: targetX, y: targetY };
}

/**
 * Tests whether a direction is physically unobstructed for an enemy tank.
 */
export function canMoveInDirection(
  enemy: EnemyTank,
  dir: Direction,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>,
  probeStep: number = 4
): boolean {
  let baseX = enemy.x;
  let baseY = enemy.y;

  // Apply safe perpendicular grid snap (<= 4px) matching trySafeGridSnap
  if (dir === 'LEFT' || dir === 'RIGHT') {
    const snappedY = Math.round(baseY / 16) * 16;
    if (Math.abs(baseY - snappedY) > 0 && Math.abs(baseY - snappedY) <= TANK_CONFIG.SNAP_THRESHOLD) {
      const snapBox = getTankHitbox(baseX, snappedY);
      if (
        !checkHitboxVsTerrain(snapBox, terrain, { forBullet: false }).collides &&
        !checkTankVsTanks(enemy.id, snapBox, otherTanks)
      ) {
        baseY = snappedY;
      }
    }
  } else {
    const snappedX = Math.round(baseX / 16) * 16;
    if (Math.abs(baseX - snappedX) > 0 && Math.abs(baseX - snappedX) <= TANK_CONFIG.SNAP_THRESHOLD) {
      const snapBox = getTankHitbox(snappedX, baseY);
      if (
        !checkHitboxVsTerrain(snapBox, terrain, { forBullet: false }).collides &&
        !checkTankVsTanks(enemy.id, snapBox, otherTanks)
      ) {
        baseX = snappedX;
      }
    }
  }

  const stepsToCheck = probeStep > 1 ? [1, probeStep] : [1];
  for (const step of stepsToCheck) {
    let testX = baseX;
    let testY = baseY;

    if (dir === 'UP') testY -= step;
    else if (dir === 'DOWN') testY += step;
    else if (dir === 'LEFT') testX -= step;
    else if (dir === 'RIGHT') testX += step;

    if (testX < 0 || testX > TANK_CONFIG.MAX_X || testY < 0 || testY > TANK_CONFIG.MAX_Y) {
      return false;
    }

    const testBox = getTankHitbox(testX, testY);
    const terrainColl = checkHitboxVsTerrain(testBox, terrain, { forBullet: false });
    const tankColl = checkTankVsTanks(enemy.id, testBox, otherTanks);

    if (terrainColl.collides || tankColl) {
      return false;
    }
  }

  return true;
}

/**
 * Finds all physically open directions for an enemy tank, ordered by goal proximity,
 * direction continuity, and anti-oscillation tile history.
 */
export function pickBestOpenDirection(
  enemy: EnemyTank,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>,
  targetPos: { x: number; y: number } = { x: 96, y: 192 }
): Direction | null {
  const openDirs: Direction[] = [];
  for (const dir of ALL_DIRECTIONS) {
    if (canMoveInDirection(enemy, dir, terrain, otherTanks, 4)) {
      openDirs.push(dir);
    }
  }

  if (openDirs.length === 0) {
    for (const dir of ALL_DIRECTIONS) {
      if (canMoveInDirection(enemy, dir, terrain, otherTanks, 2)) {
        openDirs.push(dir);
      }
    }
  }

  if (openDirs.length === 0) return null;

  const oppositeDir = getOppositeDirection(enemy.direction);
  const recent = enemy.recentTiles ?? [];
  const prevTileKey = recent.length >= 2 ? recent[recent.length - 2] : null;
  const currentDist = Math.hypot(targetPos.x - enemy.x, targetPos.y - enemy.y);

  let bestDir = openDirs[0];
  let bestScore = -Infinity;

  for (const dir of openDirs) {
    let nx = enemy.x;
    let ny = enemy.y;
    if (dir === 'UP') ny -= 16;
    else if (dir === 'DOWN') ny += 16;
    else if (dir === 'LEFT') nx -= 16;
    else if (dir === 'RIGHT') nx += 16;

    const nextDist = Math.hypot(targetPos.x - nx, targetPos.y - ny);
    let score = (currentDist - nextDist) * 2.5;

    // Continuity bonus: keep moving forward along corridor if open
    if (dir === enemy.direction) {
      score += 25;
    }

    // Anti-reversal penalty: avoid 180-degree flip unless it is the only open direction
    if (dir === oppositeDir && openDirs.length > 1) {
      score -= 65;
    }

    // Anti-loop penalty: avoid stepping back into recently visited tiles
    const nextTileKey = getNextTileKey(enemy.x, enemy.y, dir);
    if (prevTileKey && nextTileKey === prevTileKey && openDirs.length > 1) {
      score -= 55;
    } else if (recent.includes(nextTileKey) && openDirs.length > 1) {
      score -= 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  return bestDir;
}

/**
 * Chooses the next patrol direction using:
 * - Goal progress bias (towards Base Eagle [96, 192] or P1)
 * - History of last 4 directions (Least Recently Used priority)
 * - Anti-oscillation penalty against immediate 180° tile backtracking
 * - Deterministic PRNG for tie-breaking
 * - Minimum hold time of 0.5s unless blocked
 */
export function selectPatrolDirection(
  enemy: EnemyTank,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>,
  goalPos: { x: number; y: number } = { x: 96, y: 192 }
): Direction {
  // Test which cardinal directions have >= 4px of corridor clearance
  const validDirections: Direction[] = [];

  for (const dir of ALL_DIRECTIONS) {
    if (canMoveInDirection(enemy, dir, terrain, otherTanks, 4)) {
      validDirections.push(dir);
    }
  }

  if (validDirections.length === 0) {
    for (const dir of ALL_DIRECTIONS) {
      if (canMoveInDirection(enemy, dir, terrain, otherTanks, 2)) {
        validDirections.push(dir);
      }
    }
  }

  if (validDirections.length === 0) {
    // If completely boxed in, keep current direction
    return enemy.direction;
  }

  const history = enemy.directionHistory ?? [];
  const recent = enemy.recentTiles ?? [];
  const prevTileKey = recent.length >= 2 ? recent[recent.length - 2] : null;
  const oppositeDir = getOppositeDirection(enemy.direction);
  const currentDist = Math.hypot(goalPos.x - enemy.x, goalPos.y - enemy.y);

  let bestScore = -Infinity;
  let bestDirs: Direction[] = [];

  for (const dir of validDirections) {
    let nx = enemy.x;
    let ny = enemy.y;
    if (dir === 'UP') ny -= 4;
    else if (dir === 'DOWN') ny += 4;
    else if (dir === 'LEFT') nx -= 4;
    else if (dir === 'RIGHT') nx += 4;

    const nextDist = Math.hypot(goalPos.x - nx, goalPos.y - ny);
    const progressBonus = nextDist < currentDist ? 40 : 0;

    const lastIndex = history.lastIndexOf(dir);
    const lruScore = lastIndex === -1 ? 50 : (history.length - lastIndex) * 10;

    let loopPenalty = 0;
    if (validDirections.length > 1 && recent.length >= 2) {
      const nextTileKey = getNextTileKey(enemy.x, enemy.y, dir);
      if (prevTileKey && nextTileKey === prevTileKey) {
        loopPenalty -= 45;
      } else if (recent.includes(nextTileKey)) {
        loopPenalty -= 20;
      }
      if (dir === oppositeDir) {
        loopPenalty -= 30;
      }
    }

    const totalScore = progressBonus + lruScore + loopPenalty;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestDirs = [dir];
    } else if (totalScore === bestScore) {
      bestDirs.push(dir);
    }
  }

  // Deterministic tie-breaker
  const chosenDir = bestDirs.length === 1 ? bestDirs[0] : defaultPRNG.nextChoice(bestDirs);

  // Update history (keep last 4)
  if (!enemy.directionHistory) {
    enemy.directionHistory = [];
  }
  enemy.directionHistory.push(chosenDir);
  if (enemy.directionHistory.length > 4) {
    enemy.directionHistory.shift();
  }

  enemy.dirHoldTimer = AI_CONFIG.PATROL_MIN_HOLD_DIR_S;
  return chosenDir;
}

/**
 * Computes the cardinal direction to reach a waypoint, automatically aligning
 * the perpendicular axis first if the primary axis is obstructed by a tile corner.
 */
function getNavigableWaypointDirection(
  enemy: EnemyTank,
  waypoint: { x: number; y: number },
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>
): Direction {
  const dx = waypoint.x - enemy.x;
  const dy = waypoint.y - enemy.y;

  const horizDir: Direction | null = Math.abs(dx) > 0.5 ? (dx > 0 ? 'RIGHT' : 'LEFT') : null;
  const vertDir: Direction | null = Math.abs(dy) > 0.5 ? (dy > 0 ? 'DOWN' : 'UP') : null;

  const primaryDir = Math.abs(dx) > Math.abs(dy)
    ? (horizDir ?? vertDir ?? enemy.direction)
    : (vertDir ?? horizDir ?? enemy.direction);
  const secondaryDir = primaryDir === horizDir ? vertDir : horizDir;

  const primaryProbe = Math.max(1, Math.min(4, Math.floor(Math.max(Math.abs(dx), Math.abs(dy)))));
  if (canMoveInDirection(enemy, primaryDir, terrain, otherTanks, primaryProbe)) {
    return primaryDir;
  }

  if (secondaryDir) {
    const secProbe = Math.max(1, Math.min(4, Math.floor(Math.min(Math.abs(dx), Math.abs(dy)) || 1)));
    if (canMoveInDirection(enemy, secondaryDir, terrain, otherTanks, secProbe)) {
      return secondaryDir;
    }
  }

  return primaryDir;
}

/**
 * Updates AI State Machine (PATROL, CHASE, SEARCH) for one enemy tank.
 * Integrates:
 * - Line of sight (P1 detected even if shielded, ignored only if dead)
 * - Aim timer & <= 4px bore alignment
 * - Lead prediction with 100ms re-evaluation and cancel on P1 turn
 * - Multi-criteria target scoring and type tendencies
 * - LRU-driven deterministic Patrol & Anti-Oscillation
 */
export function updateEnemyAI(
  enemy: EnemyTank,
  p1: TankStructure,
  p1IsDead: boolean,
  terrain: RuntimeTerrainState,
  dt: number,
  otherTanks?: Array<{ id: string; x: number; y: number }>,
  difficulty: 'DEFAULT' | 'EXTREME' = 'DEFAULT'
): { shouldShoot: boolean; targetDir: Direction | null } {
  if (!enemy.isAlive) {
    return { shouldShoot: false, targetDir: null };
  }

  // Record current grid tile in recentTiles history
  recordVisitedTile(enemy);

  // Decrease timers
  if (enemy.spawnShieldTimer > 0) {
    enemy.spawnShieldTimer = Math.max(0, enemy.spawnShieldTimer - dt);
    enemy.isShielded = enemy.spawnShieldTimer > 0;
  } else {
    enemy.isShielded = false;
  }
  if (enemy.shootCooldown > 0) {
    enemy.shootCooldown = Math.max(0, enemy.shootCooldown - dt);
  }
  if (enemy.pathCooldown > 0) {
    enemy.pathCooldown = Math.max(0, enemy.pathCooldown - dt);
  }
  if (enemy.dirHoldTimer > 0) {
    enemy.dirHoldTimer = Math.max(0, enemy.dirHoldTimer - dt);
  }
  if (enemy.leadEvalTimer > 0) {
    enemy.leadEvalTimer = Math.max(0, enemy.leadEvalTimer - dt);
  }

  // 1. Line of Sight Check to P1
  // DEFAULT: exact 80px radius per M3 spec.
  // EXTREME: whole map coverage (9999px), but still blocked by BRICK & STEEL!
  const detectionRadius = difficulty === 'EXTREME' ? 9999 : AI_CONFIG.DETECTION_RADIUS_PX;
  const p1Detected =
    !p1IsDead &&
    hasLineOfSight(enemy.x, enemy.y, p1.x, p1.y, terrain, detectionRadius);

  // 2. State Machine Transitions
  if (p1Detected) {
    enemy.aiState = 'CHASE';
    enemy.lastKnownP1Pos = { x: p1.x, y: p1.y };
    enemy.lostTargetTimer = AI_CONFIG.LOST_TARGET_HOLD_S;
    enemy.searchTimer = AI_CONFIG.SEARCH_MAX_S;
  } else {
    if (p1IsDead) {
      // Per Point A: When P1 is dead, immediately switch target to Eagle/Base
      enemy.aiState = 'PATROL';
      enemy.lastKnownP1Pos = null;
      enemy.lostTargetTimer = 0;
      enemy.searchTimer = 0;
      enemy.cachedTarget = 'eagle';
      enemy.cachedDestination = { x: 96, y: 192 };
    } else if (enemy.aiState === 'CHASE') {
      if (enemy.lostTargetTimer > 0) {
        enemy.lostTargetTimer -= dt;
      } else {
        // Transition to SEARCH
        enemy.aiState = 'SEARCH';
        enemy.searchTimer = AI_CONFIG.SEARCH_MAX_S;
      }
    } else if (enemy.aiState === 'SEARCH') {
      enemy.searchTimer -= dt;
      if (enemy.searchTimer <= 0) {
        // Search timeout -> return to PATROL
        enemy.aiState = 'PATROL';
        enemy.lastKnownP1Pos = null;
      }
    }
  }

  // 3. Lead Prediction (Point D)
  // Check if P1 changed direction -> cancel lead point immediately
  if (enemy.lastP1Direction !== p1.direction) {
    enemy.leadPos = null;
    enemy.lastP1Direction = p1.direction;
    enemy.leadEvalTimer = 0;
  }

  if (enemy.aiState === 'CHASE' && !p1IsDead) {
    if (enemy.leadEvalTimer <= 0 || !enemy.leadPos) {
      enemy.leadPos = calculateLeadPosition(p1, terrain, otherTanks, enemy.id);
      enemy.leadEvalTimer = AI_CONFIG.LEAD_PREDICTION_INTERVAL_S;
    }
  } else {
    enemy.leadPos = null;
  }

  // 4. Determine Navigation Destination based on State & Scoring
  let destination = { x: 96, y: 192 }; // Base Eagle default
  let selectedTarget: 'p1' | 'eagle' = 'eagle';
  let scoringResult: ReturnType<typeof scoreAndSelectTarget> | null = null;

  if (enemy.aiState === 'CHASE') {
    selectedTarget = 'p1';
    destination = enemy.leadPos ?? { x: p1.x, y: p1.y };
    enemy.targetPos = destination;
  } else if (enemy.aiState === 'SEARCH' && enemy.lastKnownP1Pos) {
    selectedTarget = 'p1';
    destination = enemy.lastKnownP1Pos;
    enemy.targetPos = destination;
  } else {
    // PATROL state: throttle multi-criteria target scoring to pathCooldown intervals
    // to avoid running redundant A* searches 60 times/sec per enemy
    if (enemy.pathCooldown <= 0 || !enemy.cachedDestination || !enemy.cachedTarget || p1IsDead) {
      scoringResult = scoreAndSelectTarget(enemy, p1, p1IsDead, terrain, otherTanks);
      enemy.cachedTarget = scoringResult.selectedTarget;
      enemy.cachedDestination = scoringResult.destination;
    }
    selectedTarget = enemy.cachedTarget;
    destination = selectedTarget === 'p1' && !p1IsDead ? { x: p1.x, y: p1.y } : { x: 96, y: 192 };
    enemy.targetPos = destination;
  }

  // Compute validated navigation destination (applying coordinator approach slot or walkable flank offset)
  let navDestination = destination;
  if (enemy.assignedApproachPos && enemy.aiState === 'PATROL') {
    navDestination = enemy.assignedApproachPos;
  } else if (enemy.flankOffset && (enemy.flankOffset.x !== 0 || enemy.flankOffset.y !== 0)) {
    const candX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, destination.x + enemy.flankOffset.x));
    const candY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, destination.y + enemy.flankOffset.y));
    const candC = Math.round(candX / 16);
    const candR = Math.round(candY / 16);
    if (isTileWalkable(candC, candR, terrain)) {
      navDestination = { x: candX, y: candY };
    }
  }

  // 5. A* Pathfinding (Throttled by pathCooldown)
  if (enemy.pathCooldown <= 0) {
    enemy.path = findPathAStar(
      { x: enemy.x, y: enemy.y },
      navDestination,
      terrain,
      otherTanks,
      enemy.id
    );
    enemy.pathCooldown = AI_CONFIG.PATH_RECOMPUTE_THROTTLE_S;
  }

  // 6. Determine Desired Movement Direction
  let targetDir: Direction | null = null;
  if (enemy.path.length > 0) {
    const nextWaypoint = enemy.path[0];
    const dx = nextWaypoint.x - enemy.x;
    const dy = nextWaypoint.y - enemy.y;

    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
      enemy.path.shift();
      if (enemy.path.length > 0) {
        const nextWp2 = enemy.path[0];
        targetDir = getNavigableWaypointDirection(enemy, nextWp2, terrain, otherTanks);
      }
    } else {
      targetDir = getNavigableWaypointDirection(enemy, nextWaypoint, terrain, otherTanks);
    }
  } else if (enemy.dirHoldTimer > 0 && canMoveInDirection(enemy, enemy.direction, terrain, otherTanks, 4)) {
    // Hold active detour/patrol direction until dirHoldTimer expires or corridor is blocked
    targetDir = enemy.direction;
  } else if (enemy.aiState === 'PATROL') {
    targetDir = selectPatrolDirection(enemy, terrain, otherTanks, navDestination);
  }

  // Active Fallback: Ensure active enemies never freeze with targetDir === null
  if (!targetDir) {
    if (enemy.dirHoldTimer > 0 && canMoveInDirection(enemy, enemy.direction, terrain, otherTanks, 4)) {
      targetDir = enemy.direction;
    } else if (enemy.aiState === 'CHASE' || enemy.aiState === 'SEARCH') {
      const alignedDir = getNavigableWaypointDirection(enemy, navDestination, terrain, otherTanks);
      if (canMoveInDirection(enemy, alignedDir, terrain, otherTanks, 4)) {
        targetDir = alignedDir;
        enemy.dirHoldTimer = 0.4;
      } else {
        targetDir = selectPatrolDirection(enemy, terrain, otherTanks, navDestination);
      }
    } else {
      targetDir = selectPatrolDirection(enemy, terrain, otherTanks, navDestination);
    }
  }

  // 7. Aiming & Shooting Decision (Point C)
  let shouldShoot = false;
  let isAligned = false;

  // Check if another enemy tank is directly blocking the barrel in front of this enemy
  const otherEnemyTanks = otherTanks?.filter((t) => t.id !== 'p1' && t.id !== enemy.id) ?? [];
  let blockedByFriendlyTank = false;
  if (otherEnemyTanks.length > 0 && targetDir) {
    let probeX = enemy.x;
    let probeY = enemy.y;
    if (targetDir === 'UP') probeY -= 4;
    else if (targetDir === 'DOWN') probeY += 4;
    else if (targetDir === 'LEFT') probeX -= 4;
    else if (targetDir === 'RIGHT') probeX += 4;
    blockedByFriendlyTank = checkTankVsTanks(enemy.id, getTankHitbox(probeX, probeY), otherEnemyTanks);
  }

  // Check alignment with P1 (direct or predicted lead)
  if (!p1IsDead && !blockedByFriendlyTank) {
    const directAligned = isAlignedWithTarget(enemy, p1.x, p1.y, AI_CONFIG.ALIGNMENT_TOLERANCE_PX);
    const leadAligned = enemy.leadPos
      ? isAlignedWithTarget(enemy, enemy.leadPos.x, enemy.leadPos.y, AI_CONFIG.ALIGNMENT_TOLERANCE_PX)
      : false;

    if (directAligned || leadAligned) {
      if (hasLineOfSight(enemy.x, enemy.y, p1.x, p1.y, terrain, detectionRadius)) {
        isAligned = true;
      }
    }
  }

  // Check alignment with Base
  if (!isAligned && isAlignedWithTarget(enemy, 96, 192, AI_CONFIG.ALIGNMENT_TOLERANCE_PX)) {
    isAligned = true;
  }

  // Check alignment with Brick obstacle directly in front
  if (!isAligned && isFacingBrickObstacle(enemy, terrain)) {
    isAligned = true;
  }

  const requiredAimTime = enemy.aimTime ?? ENEMY_CONFIG.SPECS[enemy.enemyType].aimTime;

  if (isAligned) {
    enemy.aimTimer = (enemy.aimTimer || 0) + dt;

    if (
      enemy.aimTimer >= requiredAimTime &&
      enemy.shootCooldown <= 0 &&
      enemy.spawnShieldTimer <= 0
    ) {
      shouldShoot = true;
    }
  } else {
    // Alignment broken: reset aim timer
    enemy.aimTimer = 0;
  }

  // Detailed debug log for auditing AI behavior
  const p1Dist = Math.hypot(p1.x - enemy.x, p1.y - enemy.y);
  enemy.debugLog = {
    enemyId: enemy.id,
    type: enemy.enemyType,
    pos: { x: enemy.x, y: enemy.y },
    direction: enemy.direction,
    aiState: enemy.aiState,
    selectedTarget,
    targetPos: destination,
    scoring: {
      distanceScore: scoringResult?.p1Candidate?.components.distanceScore ?? 0,
      aStarScore: scoringResult?.p1Candidate?.components.aStarScore ?? 0,
      losScore: scoringResult?.p1Candidate?.components.losScore ?? 0,
      battlefieldScore: scoringResult?.p1Candidate?.components.battlefieldScore ?? 0,
      totalRawScore: scoringResult?.p1Candidate?.score ?? 0,
    },
    losToP1: p1Detected,
    losDistancePx: p1Dist,
    isAligned,
    aimTimer: enemy.aimTimer || 0,
    requiredAimTime,
    shootCooldown: enemy.shootCooldown,
    spawnShieldTimer: enemy.spawnShieldTimer,
    canShoot: (enemy.aimTimer || 0) >= requiredAimTime && enemy.shootCooldown <= 0 && enemy.spawnShieldTimer <= 0,
    hasActiveBullet: false,
  };

  return { shouldShoot, targetDir };
}

function getCardinalDirection(fromX: number, fromY: number, toX: number, toY: number): Direction {
  const dx = toX - fromX;
  const dy = toY - fromY;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'RIGHT' : 'LEFT';
  } else {
    return dy > 0 ? 'DOWN' : 'UP';
  }
}

export function isFacingBrickObstacle(enemy: EnemyTank, terrain: RuntimeTerrainState): boolean {
  let probeCol = Math.round(enemy.x / 16);
  let probeRow = Math.round(enemy.y / 16);

  if (enemy.direction === 'UP') probeRow -= 1;
  else if (enemy.direction === 'DOWN') probeRow += 1;
  else if (enemy.direction === 'LEFT') probeCol -= 1;
  else if (enemy.direction === 'RIGHT') probeCol += 1;

  if (probeRow < 0 || probeRow >= 13 || probeCol < 0 || probeCol >= 13) return false;

  if (terrain.currentMap[probeRow][probeCol] !== TILE_TYPES.BRICK) return false;
  const mask = getBrickMask(terrain, probeRow, probeCol);
  return mask > 0;
}
