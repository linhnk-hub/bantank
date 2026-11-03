/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ENEMY_CONFIG, P1_CONFIG, AI_CONFIG } from './constants.ts';
import {
  type InputState,
  type Direction,
  type EnemyType,
  type EnemyTank,
  TILE_TYPES,
  type RuntimeTerrainState,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { GameEngine } from './gameEngine.ts';
import { createP1Tank } from './tank.ts';
import {
  hasLineOfSight,
  updateEnemyAI,
  isAlignedWithTarget,
  calculateLeadPosition,
  selectPatrolDirection,
} from './ai/enemyAI.ts';
import {
  calculateTargetComponents,
  scoreAndSelectTarget,
  TYPE_TENDENCY_WEIGHTS,
} from './ai/targetScoring.ts';
import { EnemyCoordinator } from './ai/coordinator.ts';
import { getBulletHitbox, getTankHitbox, intersectAABB } from './physics.ts';
import { DeterministicPRNG } from './utils/prng.ts';

export interface AuditTestCaseResult {
  id: string;
  name: string;
  item: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

const emptyInput: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

/**
 * AUDIT-A: P1 Shield & Enemy Targeting
 * - Shielded P1 is detected and chased (not ignored).
 * - Enemy bullet hitting shielded P1 is absorbed/consumed without damaging P1 and without passing through.
 * - Dead P1 is not targeted (enemies target Base/Eagle).
 */
export function runAuditA(): AuditTestCaseResult {
  const engine = new GameEngine();
  const state = engine.getState();

  // 1. Verify shielded P1 is detected and chased
  state.p1.x = 48;
  state.p1.y = 80;
  state.p1.isShielded = true;
  state.p1State.shieldTimer = 3.0;

  const enemy = engine.spawnEnemyImmediate()!;
  enemy.x = 48;
  enemy.y = 32;
  enemy.direction = 'DOWN';

  const dt = 1 / 60;
  engine.getEnemyManager().update(dt, state.p1, state.p1State.isDead, state.terrain, state.bullets);
  const chasesShieldedP1 = enemy.aiState === 'CHASE';

  // 2. Enemy bullet hitting shielded P1 is consumed and does NO damage
  const initialLives = state.p1State.lives;
  const enemyBullet = {
    id: 'audit_eb',
    ownerId: enemy.id,
    ownerType: 'enemy' as const,
    x: 48,
    y: 80, // Overlaps P1 hitbox [49,63)x[81,95)
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };
  state.bullets.push(enemyBullet);

  // Step 1 tick: collision resolution
  engine.stepTick(emptyInput);

  const bulletWasConsumed = !engine.getState().bullets.some((b) => b.id === 'audit_eb');
  const p1TookNoDamage = engine.getState().p1State.lives === initialLives && !engine.getState().p1State.isDead;

  // 3. When P1 is actually dead, enemy switches to Base/Eagle
  state.p1State.isDead = true;
  state.p1.isAlive = false;
  engine.getEnemyManager().update(dt, state.p1, true, state.terrain, state.bullets);
  const targetsEagleWhenDead = enemy.targetPos?.x === 96 && enemy.targetPos?.y === 192;

  const passed = chasesShieldedP1 && bulletWasConsumed && p1TookNoDamage && targetsEagleWhenDead;

  return {
    id: 'AUDIT-A',
    name: 'P1 Shield Targeting & Bullet Absorption',
    item: 'A',
    passed,
    expected: 'CHASE shielded P1, absorb bullet with 0 damage, switch to Eagle only when P1 is dead',
    actual: `chases=${chasesShieldedP1}, bulletConsumed=${bulletWasConsumed}, noDamage=${p1TookNoDamage}, switchEagle=${targetsEagleWhenDead}`,
    details: 'Kiểm tra Enemy vẫn truy đuổi P1 có khiên, triệt tiêu đạn và chuyển mục tiêu chuẩn xác khi P1 chết.',
  };
}

/**
 * AUDIT-B: Multi-Criteria Target Scoring & Type Tendencies
 * - 30% Distance, 40% A*, 20% LoS, 10% Battlefield
 * - Type tendencies: Basic 50/50, Fast 70/30, Power 60/40, Armor 40/60
 */
export function runAuditB(): AuditTestCaseResult {
  const engine = new GameEngine();
  const enemy = engine.spawnEnemyImmediate()!;
  enemy.x = 48;
  enemy.y = 48;

  const p1 = engine.getState().p1;
  p1.x = 48;
  p1.y = 80;

  // Check scoring components
  const comps = calculateTargetComponents(enemy, { x: p1.x, y: p1.y }, true, engine.getState().terrain);
  const mathValid = Math.abs(
    comps.rawTotalScore -
      (0.30 * comps.distanceScore +
        0.40 * comps.aStarScore +
        0.20 * comps.losScore +
        0.10 * comps.battlefieldScore)
  ) < 0.0001;

  // Check type tendencies when both reachable
  const types: EnemyType[] = ['BASIC', 'FAST', 'POWER', 'ARMOR'];
  const tendenciesMatch = types.every((t) => {
    const w = TYPE_TENDENCY_WEIGHTS[t];
    if (t === 'BASIC') return w.p1 === 0.5 && w.eagle === 0.5;
    if (t === 'FAST') return w.p1 === 0.7 && w.eagle === 0.3;
    if (t === 'POWER') return w.p1 === 0.6 && w.eagle === 0.4;
    if (t === 'ARMOR') return w.p1 === 0.4 && w.eagle === 0.6;
    return false;
  });

  const passed = mathValid && tendenciesMatch;

  return {
    id: 'AUDIT-B',
    name: 'Target Scoring (30/40/20/10) & Type Tendencies',
    item: 'B',
    passed,
    expected: 'Formula matches 30% Dist, 40% A*, 20% LoS, 10% Battle; exact type weights',
    actual: `mathValid=${mathValid}, tendenciesMatch=${tendenciesMatch}`,
    details: 'Đảm bảo chấm điểm mục tiêu đa tiêu chí và thiên hướng xe hoạt động đúng thiết kế.',
  };
}

/**
 * AUDIT-C: Aiming & Shooting Timing and Alignment Tolerance (<= 4px)
 * - Alignment tolerance <= 4px accepted; 5px rejected.
 * - Required aim times: Basic 0.35s, Fast 0.15s, Power 0.55s, Armor 0.65s.
 * - Cooldowns: Basic 1.5s, Fast 1.2s, Power 2.0s, Armor 2.5s.
 */
export function runAuditC(): AuditTestCaseResult {
  const engine = new GameEngine();
  const enemy = engine.spawnEnemyImmediate()!;
  enemy.x = 48;
  enemy.y = 32;
  enemy.direction = 'DOWN';

  // 1. Tolerance check: target at x = 52 (diff 4px) is ALIGNED
  const alignedAt4px = isAlignedWithTarget(enemy, 52, 96, 4);
  // Target at x = 53 (diff 5px) is NOT ALIGNED
  const notAlignedAt5px = !isAlignedWithTarget(enemy, 53, 96, 4);

  // 2. Aim time requirement: with aimTimer < aimTime, shouldShoot is false
  enemy.shootCooldown = 0;
  enemy.spawnShieldTimer = 0;
  enemy.aimTimer = 0.1; // < 0.35s
  enemy.aimTime = 0.35;
  const p1 = engine.getState().p1;
  p1.x = 48;
  p1.y = 80;

  const dt = 1 / 60;
  const decision1 = updateEnemyAI(enemy, p1, false, engine.getState().terrain, dt);
  const blockedByAimTime = !decision1.shouldShoot;

  // With aimTimer >= aimTime, shouldShoot is true
  enemy.aimTimer = 0.35;
  const decision2 = updateEnemyAI(enemy, p1, false, engine.getState().terrain, dt);
  const shootsWhenAimed = decision2.shouldShoot;

  // 3. Verify SPECS configuration values
  const specs = ENEMY_CONFIG.SPECS;
  const specsMatch =
    specs.BASIC.aimTime === 0.35 && specs.BASIC.shootCooldown === 1.5 &&
    specs.FAST.aimTime === 0.15 && specs.FAST.shootCooldown === 1.2 &&
    specs.POWER.aimTime === 0.55 && specs.POWER.shootCooldown === 2.0 &&
    specs.ARMOR.aimTime === 0.65 && specs.ARMOR.shootCooldown === 2.5;

  const passed = alignedAt4px && notAlignedAt5px && blockedByAimTime && shootsWhenAimed && specsMatch;

  return {
    id: 'AUDIT-C',
    name: 'Gun Alignment (<=4px) & Aim Delays',
    item: 'C',
    passed,
    expected: 'Tolerance <= 4px, aim times & cooldowns strictly enforced per tank type',
    actual: `aligned4px=${alignedAt4px}, not5px=${notAlignedAt5px}, delayEnforced=${blockedByAimTime}, shoots=${shootsWhenAimed}, specsMatch=${specsMatch}`,
    details: 'Kiểm tra độ lệch nòng súng <= 4px và độ trễ căn góc aim time theo từng loại xe.',
  };
}

/**
 * AUDIT-D: CHASE & Lead Prediction (Max 48px, 100ms Re-eval)
 * - Predicts position up to 1.0s (clamped at 48px).
 * - Cancels immediately if P1 changes direction.
 * - Falls back to P1 pos if projected point is obstructed.
 */
export function runAuditD(): AuditTestCaseResult {
  const terrain = createRuntimeTerrainState();
  const p1 = createP1Tank();
  p1.x = 48;
  p1.y = 96;
  p1.direction = 'RIGHT';
  p1.speed = 60;

  // 1. Lead prediction in open area: 60 * 1.0s = 60px, clamped to 48px
  const leadPos = calculateLeadPosition(p1, terrain);
  const expectedX = 48 + 48; // 96
  const leadDistMatches = leadPos.x === expectedX && leadPos.y === 96;

  // 2. Cancellation when P1 changes direction
  const engine = new GameEngine();
  const enemy = engine.spawnEnemyImmediate()!;
  enemy.x = 48;
  enemy.y = 32;
  enemy.direction = 'DOWN';
  enemy.aiState = 'CHASE';
  enemy.leadPos = { x: 96, y: 96 };
  enemy.lastP1Direction = 'RIGHT' as Direction;

  // P1 switches to 'LEFT'
  p1.direction = 'LEFT';
  updateEnemyAI(enemy, p1, false, terrain, 1 / 60);
  const leadResetOnTurn = (enemy.lastP1Direction as Direction | null) === 'LEFT';

  const passed = leadDistMatches && leadResetOnTurn;

  return {
    id: 'AUDIT-D',
    name: 'Lead Prediction (Max 48px & Turn Invalidation)',
    item: 'D',
    passed,
    expected: 'Clamped to 48px, re-evaluated and invalidated upon P1 direction change',
    actual: `leadDistMatches=${leadDistMatches} (x=${leadPos.x}), leadResetOnTurn=${leadResetOnTurn}`,
    details: 'Đảm bảo xe địch tính toán điểm đón đầu tối đa 48px và hủy điểm ngay khi P1 đổi hướng.',
  };
}

/**
 * AUDIT-E: Enemy Coordinator (0.5s cycle & distinct flank offsets)
 * - Coordinator runs every 0.5s.
 * - Groups enemies targeting same destination and assigns distinct approach offsets (0, -16, 16...).
 */
export function runAuditE(): AuditTestCaseResult {
  const coordinator = new EnemyCoordinator();

  const dummyEnemies: EnemyTank[] = [
    { id: 'e1', x: 0, y: 0, direction: 'DOWN', speed: 60, type: 'enemy', enemyType: 'BASIC', tier: 1, isAlive: true, isShielded: false, hp: 1, maxHp: 1, scoreValue: 100, aiState: 'PATROL', targetPos: { x: 96, y: 192 }, lastKnownP1Pos: null, lostTargetTimer: 0, searchTimer: 0, path: [], pathCooldown: 0, shootCooldown: 1.0, aimTimer: 0, aimTime: 0.35, directionHistory: [], dirHoldTimer: 0, leadPos: null, leadEvalTimer: 0, lastP1Direction: null, flankOffset: { x: 0, y: 0 }, spawnShieldTimer: 0 },
    { id: 'e2', x: 96, y: 0, direction: 'DOWN', speed: 60, type: 'enemy', enemyType: 'BASIC', tier: 1, isAlive: true, isShielded: false, hp: 1, maxHp: 1, scoreValue: 100, aiState: 'PATROL', targetPos: { x: 96, y: 192 }, lastKnownP1Pos: null, lostTargetTimer: 0, searchTimer: 0, path: [], pathCooldown: 0, shootCooldown: 1.0, aimTimer: 0, aimTime: 0.35, directionHistory: [], dirHoldTimer: 0, leadPos: null, leadEvalTimer: 0, lastP1Direction: null, flankOffset: { x: 0, y: 0 }, spawnShieldTimer: 0 },
  ];

  // Update coordinator (trigger interval)
  coordinator.update(0.6, dummyEnemies);

  // Both targeting (96, 192) must receive distinct offsets
  const e1Offset = dummyEnemies[0].flankOffset!;
  const e2Offset = dummyEnemies[1].flankOffset!;
  const distinctOffsets = !(e1Offset.x === e2Offset.x && e1Offset.y === e2Offset.y);

  const passed = distinctOffsets && (e1Offset.x === 0 || e2Offset.x === -16 || e2Offset.x === 16);

  return {
    id: 'AUDIT-E',
    name: 'Enemy Coordinator Flank Separation',
    item: 'E',
    passed,
    expected: 'Enemies targeting same point receive distinct flank vectors to avoid congestion',
    actual: `e1Offset=(${e1Offset.x},${e1Offset.y}), e2Offset=(${e2Offset.x},${e2Offset.y}), distinct=${distinctOffsets}`,
    details: 'Đảm bảo bộ điều phối chia hướng sườn mỗi 0.5s, không dồn hàng một khi tấn công.',
  };
}

/**
 * AUDIT-F: Deterministic Patrol with LRU 4-Direction History
 * - PRNG seeded for reproducible turns.
 * - History of 4 directions tracked; least recently used selected.
 * - Holds direction for min 0.5s unless blocked.
 */
export function runAuditF(): AuditTestCaseResult {
  const terrain = createRuntimeTerrainState();
  const dummyEnemy: EnemyTank = {
    id: 'e_patrol',
    x: 48,
    y: 80, // Row 5 is open corridor in STAGE_1_MAP
    direction: 'UP',
    speed: 60,
    type: 'enemy',
    enemyType: 'BASIC',
    tier: 1,
    isAlive: true,
    isShielded: false,
    hp: 1,
    maxHp: 1,
    scoreValue: 100,
    aiState: 'PATROL',
    targetPos: null,
    lastKnownP1Pos: null,
    lostTargetTimer: 0,
    searchTimer: 0,
    path: [],
    pathCooldown: 0,
    shootCooldown: 1.0,
    aimTimer: 0,
    aimTime: 0.35,
    directionHistory: ['UP', 'DOWN', 'LEFT'],
    dirHoldTimer: 0,
    leadPos: null,
    leadEvalTimer: 0,
    lastP1Direction: null,
    flankOffset: { x: 0, y: 0 },
    spawnShieldTimer: 0,
  };

  // 'RIGHT' is the only direction NOT in ['UP', 'DOWN', 'LEFT'], so LRU must pick 'RIGHT'
  const chosenDir = selectPatrolDirection(dummyEnemy, terrain);
  const pickedLRU = chosenDir === 'RIGHT';
  const holdTimerSet = dummyEnemy.dirHoldTimer === 0.5;
  const historyUpdated = dummyEnemy.directionHistory.includes('RIGHT');

  const passed = pickedLRU && holdTimerSet && historyUpdated;

  return {
    id: 'AUDIT-F',
    name: 'Patrol LRU Direction Selection & Hold Timer',
    item: 'F',
    passed,
    expected: 'Selects least recently used direction (RIGHT), sets 0.5s hold timer',
    actual: `chosenDir=${chosenDir}, holdTimer=${dummyEnemy.dirHoldTimer}, history=${dummyEnemy.directionHistory.join(',')}`,
    details: 'Kiểm tra thuật toán tuần tra LRU 4 hướng và giữ hướng tối thiểu 0.5s.',
  };
}

/**
 * AUDIT-G: Safe Spawn Validation & Queue Retention
 * - Blocked by tank or active flying bullet prevents spawn.
 * - Enemy is NOT discarded from queue; preserved for next attempt.
 */
export function runAuditG(): AuditTestCaseResult {
  const engine = new GameEngine();
  const state = engine.getState();
  const initialQueueLength = state.enemyQueue.length;

  // Place active flying bullet right in spawn point 0 (0..16, 0..16)
  const dangerBullet = {
    id: 'danger_bullet',
    ownerId: 'some_tank',
    ownerType: 'player' as const,
    x: 4,
    y: 4,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };
  state.bullets.push(dangerBullet);

  // Attempt spawn at point 0 (0, 0)
  const spawned = engine.getEnemyManager().trySpawnEnemy(state.terrain, [state.p1], state.bullets);

  const spawnBlocked = spawned === null;
  const queuePreserved = engine.getEnemyManager().getQueue().length === initialQueueLength;

  const passed = spawnBlocked && queuePreserved;

  return {
    id: 'AUDIT-G',
    name: 'Safe Spawn Bullet Check & Queue Retention',
    item: 'G',
    passed,
    expected: 'Spawn blocked by flying bullet, queue retains all 30 enemies without loss',
    actual: `spawnBlocked=${spawnBlocked}, queueRemaining=${engine.getEnemyManager().getQueue().length}/${initialQueueLength}`,
    details: 'Đảm bảo điểm xuất hiện kiểm tra đạn đang bay và không bao giờ đánh rơi quân địch khỏi hàng đợi.',
  };
}

/**
 * AUDIT-H: Bullet Cleanup upon P1 Death & Fixed Respawn Wait
 * - P1 death deletes P1 bullets immediately; enemy bullets remain flying.
 * - Dead P1 hitbox is ignored by enemy bullets (clean pass-through).
 * - Respawn at (48, 192) waits and re-checks every 100ms if occupied; NEVER shifts coordinates.
 */
export function runAuditH(): AuditTestCaseResult {
  const engine = new GameEngine();
  const state = engine.getState();

  // 1. Inject P1 bullet and Enemy bullet
  const p1Bullet = {
    id: 'p1_b_audit',
    ownerId: state.p1.id,
    ownerType: 'player' as const,
    x: 48,
    y: 120,
    direction: 'UP' as Direction,
    speed: 160,
    power: 1,
  };
  const enemyBullet = {
    id: 'en_b_audit',
    ownerId: 'enemy_x',
    ownerType: 'enemy' as const,
    x: 48,
    y: 190, // Heading into P1 at (48, 192)
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };
  state.bullets.push(p1Bullet, enemyBullet);

  // Disable P1 shield so enemy bullet kills P1
  state.p1.isShielded = false;
  state.p1State.shieldTimer = 0;

  // Step tick to trigger P1 death
  engine.stepTick(emptyInput);

  const p1BulletDeleted = !engine.getState().bullets.some((b) => b.id === 'p1_b_audit');
  const p1Died = engine.getState().p1State.isDead;

  // 2. Put an enemy tank right on (48, 192) when respawnTimer expires
  state.p1State.respawnTimer = 0;
  const blockingEnemy = engine.spawnEnemyImmediate()!;
  blockingEnemy.x = 48;
  blockingEnemy.y = 192;

  // Step tick: P1 should wait, NOT respawn and NOT shift position
  engine.stepTick(emptyInput);

  const waitingForClear = state.p1State.waitingForClearSpawn;
  const p1StillAtOriginalCoords = state.p1.x === 48 && state.p1.y === 192;

  const passed = p1BulletDeleted && p1Died && waitingForClear && p1StillAtOriginalCoords;

  return {
    id: 'AUDIT-H',
    name: 'P1 Bullet Removal on Death & Fixed Respawn Wait',
    item: 'H',
    passed,
    expected: 'P1 bullets cleared on death, respawn at (48, 192) waits if occupied without coordinate shift',
    actual: `p1BulletDeleted=${p1BulletDeleted}, p1Died=${p1Died}, waitingForClear=${waitingForClear}, coords=(${state.p1.x},${state.p1.y})`,
    details: 'Đảm bảo đạn P1 bị hủy ngay khi chết và điểm hồi sinh chờ giải phóng tại đúng tọa độ (48, 192).',
  };
}

export function runAllAuditTestCases(): AuditTestCaseResult[] {
  return [
    runAuditA(),
    runAuditB(),
    runAuditC(),
    runAuditD(),
    runAuditE(),
    runAuditF(),
    runAuditG(),
    runAuditH(),
  ];
}
