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
import { findPathAStar } from './pathfinding.ts';
import { scoreAndSelectTarget } from './targetScoring.ts';
import { defaultPRNG } from '../utils/prng.ts';

const ALL_DIRECTIONS: readonly Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const;

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
 * Chooses the next patrol direction using:
 * - History of last 4 directions (Least Recently Used priority)
 * - Deterministic PRNG for tie-breaking
 * - Minimum hold time of 0.5s unless blocked
 */
export function selectPatrolDirection(
  enemy: EnemyTank,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>
): Direction {
  // Test which cardinal directions are physically open for 1 step
  const validDirections: Direction[] = [];

  for (const dir of ALL_DIRECTIONS) {
    let testX = enemy.x;
    let testY = enemy.y;
    const testStep = 2; // small test probe

    if (dir === 'UP') testY -= testStep;
    else if (dir === 'DOWN') testY += testStep;
    else if (dir === 'LEFT') testX -= testStep;
    else if (dir === 'RIGHT') testX += testStep;

    if (testX < 0 || testX > TANK_CONFIG.MAX_X || testY < 0 || testY > TANK_CONFIG.MAX_Y) {
      continue;
    }

    const testBox = getTankHitbox(testX, testY);
    const terrainColl = checkHitboxVsTerrain(testBox, terrain, { forBullet: false });
    const tankColl = checkTankVsTanks(enemy.id, testBox, otherTanks);

    if (!terrainColl.collides && !tankColl) {
      validDirections.push(dir);
    }
  }

  if (validDirections.length === 0) {
    // If completely boxed in, keep current direction
    return enemy.direction;
  }

  // Calculate LRU score for each valid direction
  // A direction not in history gets highest score (100)
  // A direction recently used gets lower score based on how far back it was used
  const history = enemy.directionHistory ?? [];
  let bestScore = -1;
  let bestDirs: Direction[] = [];

  for (const dir of validDirections) {
    const lastIndex = history.lastIndexOf(dir);
    const score = lastIndex === -1 ? 100 : history.length - lastIndex;
    if (score > bestScore) {
      bestScore = score;
      bestDirs = [dir];
    } else if (score === bestScore) {
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
 * Updates AI State Machine (PATROL, CHASE, SEARCH) for one enemy tank.
 * Integrates:
 * - Line of sight (P1 detected even if shielded, ignored only if dead)
 * - Aim timer & <= 4px bore alignment
 * - Lead prediction with 100ms re-evaluation and cancel on P1 turn
 * - Multi-criteria target scoring and type tendencies
 * - LRU-driven deterministic Patrol
 */
export function updateEnemyAI(
  enemy: EnemyTank,
  p1: TankStructure,
  p1IsDead: boolean,
  terrain: RuntimeTerrainState,
  dt: number,
  otherTanks?: Array<{ id: string; x: number; y: number }>
): { shouldShoot: boolean; targetDir: Direction | null } {
  if (!enemy.isAlive) {
    return { shouldShoot: false, targetDir: null };
  }

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

  // 1. Line of Sight Check to P1 (Exact 80px radius per M3 spec)
  // Per Point A: Enemy CAN see and target shielded P1! Only dead P1 is ignored.
  const p1Detected =
    !p1IsDead &&
    hasLineOfSight(enemy.x, enemy.y, p1.x, p1.y, terrain, AI_CONFIG.DETECTION_RADIUS_PX);

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
    // Lead prediction destination if available, otherwise direct P1
    destination = enemy.leadPos ?? { x: p1.x, y: p1.y };
    enemy.targetPos = destination;
  } else if (enemy.aiState === 'SEARCH' && enemy.lastKnownP1Pos) {
    selectedTarget = 'p1';
    destination = enemy.lastKnownP1Pos;
    enemy.targetPos = destination;
  } else {
    // PATROL state: use multi-criteria target scoring (Point B)
    scoringResult = scoreAndSelectTarget(enemy, p1, p1IsDead, terrain, otherTanks);
    selectedTarget = scoringResult.selectedTarget;
    destination = scoringResult.destination;
    enemy.targetPos = destination;
  }

  // Adjust destination with coordinator flanking offset (Point E) if assigned
  if (enemy.flankOffset) {
    destination = {
      x: Math.max(0, Math.min(TANK_CONFIG.MAX_X, destination.x + enemy.flankOffset.x)),
      y: Math.max(0, Math.min(TANK_CONFIG.MAX_Y, destination.y + enemy.flankOffset.y)),
    };
  }

  // 5. A* Pathfinding (Throttled or triggered on empty path)
  if (enemy.pathCooldown <= 0 || enemy.path.length === 0) {
    enemy.path = findPathAStar(
      { x: enemy.x, y: enemy.y },
      destination,
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
        targetDir = getCardinalDirection(enemy.x, enemy.y, nextWp2.x, nextWp2.y);
      }
    } else {
      targetDir = getCardinalDirection(enemy.x, enemy.y, nextWaypoint.x, nextWaypoint.y);
    }
  } else if (enemy.aiState === 'PATROL') {
    // In PATROL without A* path, use LRU direction holding
    if (enemy.dirHoldTimer <= 0) {
      targetDir = selectPatrolDirection(enemy, terrain, otherTanks);
    } else {
      targetDir = enemy.direction;
    }
  }

  // 7. Aiming & Shooting Decision (Point C)
  let shouldShoot = false;
  let isAligned = false;

  // Check alignment with P1 (direct or predicted lead)
  if (!p1IsDead) {
    const directAligned = isAlignedWithTarget(enemy, p1.x, p1.y, AI_CONFIG.ALIGNMENT_TOLERANCE_PX);
    const leadAligned = enemy.leadPos
      ? isAlignedWithTarget(enemy, enemy.leadPos.x, enemy.leadPos.y, AI_CONFIG.ALIGNMENT_TOLERANCE_PX)
      : false;

    if (directAligned || leadAligned) {
      if (hasLineOfSight(enemy.x, enemy.y, p1.x, p1.y, terrain, AI_CONFIG.DETECTION_RADIUS_PX)) {
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

function isFacingBrickObstacle(enemy: EnemyTank, terrain: RuntimeTerrainState): boolean {
  let probeCol = Math.round(enemy.x / 16);
  let probeRow = Math.round(enemy.y / 16);

  if (enemy.direction === 'UP') probeRow -= 1;
  else if (enemy.direction === 'DOWN') probeRow += 1;
  else if (enemy.direction === 'LEFT') probeCol -= 1;
  else if (enemy.direction === 'RIGHT') probeCol += 1;

  if (probeRow < 0 || probeRow >= 13 || probeCol < 0 || probeCol >= 13) return false;

  return terrain.currentMap[probeRow][probeCol] === TILE_TYPES.BRICK;
}
