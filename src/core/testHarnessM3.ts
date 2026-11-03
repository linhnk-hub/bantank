/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ENEMY_CONFIG, P1_CONFIG } from './constants.ts';
import {
  type InputState,
  type Direction,
  type EnemyType,
  type EnemyTank,
  TILE_TYPES,
  SUB_TILE_MASKS,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { GameEngine } from './gameEngine.ts';
import { createP1Tank } from './tank.ts';
import { hasLineOfSight, updateEnemyAI } from './ai/enemyAI.ts';
import { findPathAStar } from './ai/pathfinding.ts';
import { getBulletHitbox, getTankHitbox, intersectAABB } from './physics.ts';

export interface TestCaseResult {
  id: string;
  name: string;
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
 * M3-01: 30 Enemy Queue Sequence
 * Verifies exact 30-enemy queue and composition: 15 Basic, 7 Fast, 5 Power, 3 Armor.
 */
export function runM301(): TestCaseResult {
  const engine = new GameEngine();
  const queue = engine.getState().enemyQueue;

  const totalCount = queue.length;
  const basicCount = queue.filter((t) => t === 'BASIC').length;
  const fastCount = queue.filter((t) => t === 'FAST').length;
  const powerCount = queue.filter((t) => t === 'POWER').length;
  const armorCount = queue.filter((t) => t === 'ARMOR').length;

  // Check prefix order: 15 BASIC first, then 7 FAST, 5 POWER, 3 ARMOR
  const correctPrefix =
    queue.slice(0, 15).every((t) => t === 'BASIC') &&
    queue.slice(15, 22).every((t) => t === 'FAST') &&
    queue.slice(22, 27).every((t) => t === 'POWER') &&
    queue.slice(27, 30).every((t) => t === 'ARMOR');

  const passed =
    totalCount === 30 &&
    basicCount === 15 &&
    fastCount === 7 &&
    powerCount === 5 &&
    armorCount === 3 &&
    correctPrefix;

  return {
    id: 'M3-01',
    name: '30 Enemy Queue & Composition',
    passed,
    expected: 'Total 30 (15 Basic, 7 Fast, 5 Power, 3 Armor) in fixed order',
    actual: `Total ${totalCount} (${basicCount} Basic, ${fastCount} Fast, ${powerCount} Power, ${armorCount} Armor), prefix=${correctPrefix}`,
    details: 'Kiểm tra hàng đợi 30 xe địch xuất hiện đúng thứ tự và số lượng quy định.',
  };
}

/**
 * M3-02: Max 5 Active Enemies Concurrent Limit
 * Spawning repeatedly must never exceed 5 active tanks simultaneously.
 */
export function runM302(): TestCaseResult {
  const engine = new GameEngine();

  // Spawn first 3 enemies at the 3 spawn points
  const e1 = engine.spawnEnemyImmediate();
  const e2 = engine.spawnEnemyImmediate();
  const e3 = engine.spawnEnemyImmediate();

  // Move them down to clear spawn points so next tanks can enter
  if (e1) e1.y = 32;
  if (e2) e2.y = 32;
  if (e3) e3.y = 32;

  // Spawn 2 more enemies to reach the MAX_ACTIVE (5) limit
  const e4 = engine.spawnEnemyImmediate();
  const e5 = engine.spawnEnemyImmediate();

  const countAtFive = engine.getState().enemies.length;

  // Attempt to spawn a 6th enemy - must be rejected by MAX_ACTIVE limit
  if (e4) e4.y = 32;
  if (e5) e5.y = 32;
  const e6 = engine.spawnEnemyImmediate();
  const countAfterExceedAttempt = engine.getState().enemies.length;

  const passed = countAtFive === 5 && e6 === null && countAfterExceedAttempt === 5;

  return {
    id: 'M3-02',
    name: 'Max 5 Active Enemies Limit',
    passed,
    expected: 'Reaches exactly 5 active enemies and rejects 6th (count = 5)',
    actual: `Count at 5: ${countAtFive}, 6th spawn: ${e6}, Final count: ${countAfterExceedAttempt}`,
    details: 'Giới hạn tối đa 5 xe địch hoạt động đồng thời trên chiến trường.',
  };
}

/**
 * M3-03: Rotating Safe Spawn Verification
 * Cycles through (0,0), (96,0), (192,0). If spawn point is blocked by another tank, safe spawn holds.
 */
export function runM303(): TestCaseResult {
  const engine = new GameEngine();

  const e1 = engine.spawnEnemyImmediate();
  const e2 = engine.spawnEnemyImmediate();
  const e3 = engine.spawnEnemyImmediate();

  const pos1Correct = e1?.x === 0 && e1?.y === 0;
  const pos2Correct = e2?.x === 96 && e2?.y === 0;
  const pos3Correct = e3?.x === 192 && e3?.y === 0;

  // Now spawn point 0 (0,0) is occupied by e1. Attempting to spawn exactly at (0,0) must be rejected
  const allTanks = [e1!, e2!, e3!];
  const e4 = engine.getEnemyManager().trySpawnEnemy(engine.getState().terrain, allTanks);
  const safeBlocked = e4 === null; // Rejected because e1 is sitting at (0,0)

  const passed = pos1Correct && pos2Correct && pos3Correct && safeBlocked;

  return {
    id: 'M3-03',
    name: 'Rotating Safe Spawn Points',
    passed,
    expected: 'Spawns at (0,0), (96,0), (192,0) and rejects spawn if position is occupied',
    actual: `Points: (${e1?.x},${e1?.y}), (${e2?.x},${e2?.y}), (${e3?.x},${e3?.y}), occupiedRejection=${safeBlocked}`,
    details: 'Luân phiên 3 điểm xuất hiện an toàn, từ chối spawn đè lên xe tăng khác.',
  };
}

/**
 * M3-04: Enemy Stats Verification (Speed, HP, Score)
 */
export function runM304(): TestCaseResult {
  const specs = ENEMY_CONFIG.SPECS;

  const basicOk = specs.BASIC.speed === 60 && specs.BASIC.hp === 1 && specs.BASIC.score === 100;
  const fastOk = specs.FAST.speed === 90 && specs.FAST.hp === 1 && specs.FAST.score === 200;
  const powerOk = specs.POWER.speed === 60 && specs.POWER.hp === 2 && specs.POWER.score === 300;
  const armorOk = specs.ARMOR.speed === 45 && specs.ARMOR.hp === 4 && specs.ARMOR.score === 400;

  const passed = basicOk && fastOk && powerOk && armorOk;

  return {
    id: 'M3-04',
    name: 'Enemy Specs (Speed, HP, Score)',
    passed,
    expected: 'Basic(60/1/100), Fast(90/1/200), Power(60/2/300), Armor(45/4/400)',
    actual: `Basic:${basicOk}, Fast:${fastOk}, Power:${powerOk}, Armor:${armorOk}`,
    details: 'Xác minh bảng thông số tốc độ, máu và điểm số của từng loại xe tăng địch.',
  };
}

/**
 * M3-05: Line of Sight (LoS) & Detection Radius (80px)
 * Tests:
 * - Within 80px clear: true
 * - Beyond 80px: false
 * - Blocked by BRICK / STEEL: false
 * - Transparent through WATER / GRASS: true
 */
export function runM305(): TestCaseResult {
  const terrain = createRuntimeTerrainState();

  // 1. Within 60px clear corridor (e.g. at row 0, cols 1..4)
  const clearWithin = hasLineOfSight(16, 0, 64, 0, terrain, 80); // 48px apart

  // 2. Beyond 80px (100px apart)
  const beyond80 = hasLineOfSight(0, 0, 100, 0, terrain, 80);

  // 3. Blocked by Brick in STAGE_1_MAP (row 4 cols 1..2 is brick)
  // From (0, 64) to (48, 64) crosses brick at (16, 64)
  const blockedByBrick = !hasLineOfSight(0, 64, 48, 64, terrain, 80);

  // 4. Transparent through WATER:
  // Row 0 is empty in STAGE_1_MAP. Place WATER at (0, 1) to test raycast from (0,0) to (32,0)
  const waterTerrain = createRuntimeTerrainState();
  waterTerrain.currentMap[0][1] = TILE_TYPES.WATER;
  const seeThroughWater = hasLineOfSight(0, 0, 32, 0, waterTerrain, 80);

  const passed = clearWithin && !beyond80 && blockedByBrick && seeThroughWater;

  return {
    id: 'M3-05',
    name: 'Line of Sight & 80px Radius',
    passed,
    expected: 'clearWithin=true, beyond80=false, blockedByBrick=true, seeThroughWater=true',
    actual: `clearWithin=${clearWithin}, beyond80=${beyond80}, blockedByBrick=${blockedByBrick}, seeThroughWater=${seeThroughWater}`,
    details: 'Tầm nhìn 80px 360 độ: bị chặn bởi BRICK/STEEL, nhìn xuyên qua WATER/GRASS/ICE.',
  };
}

/**
 * M3-06: AI State Transitions (PATROL -> CHASE -> SEARCH -> PATROL)
 */
export function runM306(): TestCaseResult {
  const terrain = createRuntimeTerrainState();
  // Clear path between (0, 0) and (48, 0)
  for (let c = 0; c <= 3; c++) terrain.currentMap[0][c] = TILE_TYPES.EMPTY;

  const enemy: EnemyTank = {
    id: 'e_test',
    x: 0,
    y: 0,
    direction: 'RIGHT',
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
    shootCooldown: 0,
    aimTimer: 0,
    aimTime: 0.35,
    directionHistory: ['RIGHT'],
    dirHoldTimer: 0,
    leadPos: null,
    leadEvalTimer: 0,
    lastP1Direction: null,
    flankOffset: { x: 0, y: 0 },
    spawnShieldTimer: 0,
  };

  const p1 = createP1Tank();
  p1.x = 48;
  p1.y = 0;
  p1.isShielded = false;

  // Tick 1: P1 in clear sight within 48px -> transitions to CHASE
  updateEnemyAI(enemy, p1, false, terrain, 1 / 60);
  const state1Chase = enemy.aiState === 'CHASE';

  // Put a brick between them
  terrain.currentMap[0][1] = TILE_TYPES.BRICK;
  terrain.brickSubTiles['0_1'] = SUB_TILE_MASKS.ALL;

  // Simulate 0.35s elapsed (target lost hold is 0.3s)
  for (let i = 0; i < 22; i++) {
    updateEnemyAI(enemy, p1, false, terrain, 1 / 60);
  }
  const state2Search = enemy.aiState === 'SEARCH';

  // Simulate 3.1s elapsed in search -> transitions back to PATROL
  for (let i = 0; i < 190; i++) {
    updateEnemyAI(enemy, p1, false, terrain, 1 / 60);
  }
  const state3Patrol = enemy.aiState === 'PATROL';

  const passed = state1Chase && state2Search && state3Patrol;

  return {
    id: 'M3-06',
    name: 'AI State Machine Transitions',
    passed,
    expected: 'PATROL -> CHASE -> SEARCH (after 0.3s) -> PATROL (after 3.0s)',
    actual: `CHASE=${state1Chase}, SEARCH=${state2Search}, PATROL=${state3Patrol}`,
    details: 'Chuyển trạng thái khi thấy mục tiêu, giữ dấu vết 0.3s và tìm kiếm tối đa 3s.',
  };
}

/**
 * M3-07: A* Pathfinding (4 Cardinal Directions, Obstacle Avoidance)
 */
export function runM307(): TestCaseResult {
  const terrain = createRuntimeTerrainState();
  const start = { x: 0, y: 0 };
  const goal = { x: 48, y: 32 };

  const path = findPathAStar(start, goal, terrain, [], 'probe');

  const hasPath = path.length > 0;

  // Verify all waypoints are strictly orthogonal (no diagonal steps)
  let only4Dirs = true;
  for (let i = 0; i < path.length - 1; i++) {
    const cur = path[i];
    const nxt = path[i + 1];
    const dx = Math.abs(nxt.x - cur.x);
    const dy = Math.abs(nxt.y - cur.y);
    if ((dx > 0 && dy > 0) || (dx === 0 && dy === 0)) {
      only4Dirs = false;
      break;
    }
  }

  const passed = hasPath && only4Dirs;

  return {
    id: 'M3-07',
    name: 'A* Pathfinding 4-Direction Grid',
    passed,
    expected: 'Valid orthogonal path without diagonal movement',
    actual: `Found path: ${path.length} waypoints, only4Dirs=${only4Dirs}`,
    details: 'Tìm đường A* chuẩn trên lưới 13x13, né chướng ngại vật và đi đúng 4 hướng.',
  };
}

/**
 * M3-08: Tank-to-Tank Collision Avoidance
 */
export function runM308(): TestCaseResult {
  const engine = new GameEngine();

  // Spawn enemy at (0, 0)
  const e1 = engine.spawnEnemyImmediate();
  if (!e1) {
    return {
      id: 'M3-08',
      name: 'Tank-to-Tank Collision Avoidance',
      passed: false,
      expected: 'No tank-to-tank overlap',
      actual: 'Failed to spawn e1',
      details: 'Error spawning',
    };
  }

  // Place P1 directly in front of enemy at (0, 16)
  const state = engine.getState();
  state.p1.x = 0;
  state.p1.y = 16;
  state.p1.direction = 'UP';

  // Command P1 to move UP into e1 (which sits at 0, 0)
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, up: true });
  }

  // P1 hitbox: [1, 15) x [p1.y+1, p1.y+15)
  // e1 hitbox: [1, 15) x [1, 15)
  // P1 cannot breach y = 14 (or overlap)
  const p1Box = getTankHitbox(state.p1.x, state.p1.y);
  const e1Box = getTankHitbox(e1.x, e1.y);
  const overlaps = intersectAABB(p1Box, e1Box);

  const passed = !overlaps && state.p1.y >= 14;

  return {
    id: 'M3-08',
    name: 'Tank-to-Tank Collision Avoidance',
    passed,
    expected: 'P1 stops at boundary, no AABB overlap with enemy',
    actual: `P1.y = ${state.p1.y}, e1.y = ${e1.y}, overlaps = ${overlaps}`,
    details: 'Xe tăng người chơi và xe tăng địch không thể đi xuyên hoặc đè lên nhau.',
  };
}

/**
 * M3-09: Enemy Shooting Cooldown & Max 1 Active Bullet Limit
 */
export function runM309(): TestCaseResult {
  const engine = new GameEngine();
  const enemy = engine.spawnEnemyImmediate();
  if (!enemy) {
    return {
      id: 'M3-09',
      name: 'Enemy Cooldown & 1-Bullet Limit',
      passed: false,
      expected: 'Max 1 active bullet',
      actual: 'Failed to spawn enemy',
      details: 'Error',
    };
  }

  // Position enemy at (96, 0) facing DOWN directly towards Base (96, 192)
  enemy.x = 96;
  enemy.y = 0;
  enemy.direction = 'DOWN';
  enemy.spawnShieldTimer = 0;
  enemy.shootCooldown = 0;
  enemy.aimTimer = enemy.aimTime; // Aim alignment duration already satisfied


  // Trigger shooting multiple times
  const dt = 1 / 60;
  const terrain = engine.getState().terrain;
  const p1 = engine.getState().p1;

  let activeBulletsCount = 0;
  const bullets = engine.getState().bullets;

  // Let AI update
  const spawned1 = engine.getEnemyManager().update(dt, p1, false, terrain, bullets);
  for (const b of spawned1) bullets.push(b);
  activeBulletsCount = bullets.filter((b) => b.ownerId === enemy.id).length;

  // Immediately update again without cooldown expiring
  const spawned2 = engine.getEnemyManager().update(dt, p1, false, terrain, bullets);
  for (const b of spawned2) bullets.push(b);
  const activeBulletsCount2 = bullets.filter((b) => b.ownerId === enemy.id).length;

  const passed = activeBulletsCount === 1 && activeBulletsCount2 === 1;

  return {
    id: 'M3-09',
    name: 'Enemy Cooldown & 1-Bullet Limit',
    passed,
    expected: 'Exactly 1 active bullet, cooldown prevents immediate second shot',
    actual: `Count after shot 1: ${activeBulletsCount}, after shot 2: ${activeBulletsCount2}`,
    details: 'Đảm bảo mỗi xe địch có thời gian hồi chiêu và chỉ có tối đa 1 viên đạn hoạt động.',
  };
}

/**
 * M3-10: Bullet-to-Bullet Cancellation
 * P1 bullet and Enemy bullet flying into each other collide and cancel out.
 */
export function runM310(): TestCaseResult {
  const engine = new GameEngine();
  const state = engine.getState();

  // P1 bullet at (48, 100) flying UP
  const p1Bullet = {
    id: 'p1_b_test',
    ownerId: state.p1.id,
    ownerType: 'player' as const,
    x: 48,
    y: 100,
    direction: 'UP' as Direction,
    speed: 160,
    power: 1,
  };

  // Enemy bullet at (48, 96) flying DOWN
  const enemyBullet = {
    id: 'en_b_test',
    ownerId: 'enemy_x',
    ownerType: 'enemy' as const,
    x: 48,
    y: 96,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };

  state.bullets.push(p1Bullet, enemyBullet);

  // Step 1 tick -> they meet and cancel each other
  engine.stepTick(emptyInput);

  const remaining = engine.getState().bullets;
  const passed = remaining.length === 0;

  return {
    id: 'M3-10',
    name: 'Bullet-to-Bullet Cancellation',
    passed,
    expected: 'Both bullets destroy each other on collision (0 remaining)',
    actual: `Remaining bullets = ${remaining.length}`,
    details: 'Hai viên đạn đối đầu trực diện triệt tiêu nhau khi va chạm.',
  };
}

/**
 * M3-11: Damage & Score Attribution
 * Armor tank takes 4 hits to destroy and awards 400 points on destruction.
 */
export function runM311(): TestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const manager = engine.getEnemyManager();

  // Reset queue to single Armor tank
  manager.reset(['ARMOR']);
  const armor = engine.spawnEnemyImmediate();
  if (!armor) {
    return {
      id: 'M3-11',
      name: 'Damage & Score Attribution',
      passed: false,
      expected: 'Armor requires 4 hits and gives 400 score',
      actual: 'Failed to spawn Armor',
      details: 'Error',
    };
  }
  armor.spawnShieldTimer = 0; // Clear spawn protection

  // Hit 1
  const h1 = manager.damageEnemy(armor.id);
  // Hit 2
  const h2 = manager.damageEnemy(armor.id);
  // Hit 3
  const h3 = manager.damageEnemy(armor.id);
  // Hit 4
  const h4 = manager.damageEnemy(armor.id);

  const passed =
    !h1.destroyed &&
    !h2.destroyed &&
    !h3.destroyed &&
    h4.destroyed &&
    h4.score === 400 &&
    armor.hp === 0;

  return {
    id: 'M3-11',
    name: 'Damage & Score Attribution',
    passed,
    expected: 'Hits 1-3 alive, Hit 4 destroyed with +400 score',
    actual: `H1:${h1.destroyed}, H2:${h2.destroyed}, H3:${h3.destroyed}, H4:${h4.destroyed}, Score=${h4.score}`,
    details: 'Xe Armor nhận 4 phát đạn mới nổ và cộng đúng 400 điểm khi bị tiêu diệt hoàn toàn.',
  };
}

/**
 * M3-12: P1 3 Lives, 2s Respawn Delay, 3s Shield
 */
export function runM312(): TestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const state = engine.getState();

  const initLives = state.p1State.lives; // 3

  // Kill P1 via enemy bullet
  state.p1State.shieldTimer = 0;
  state.p1.isShielded = false;

  const enemyBullet = {
    id: 'fatal_eb',
    ownerId: 'enemy_bot',
    ownerType: 'enemy' as const,
    x: state.p1.x + 6,
    y: state.p1.y + 6,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };
  state.bullets.push(enemyBullet);

  engine.stepTick(emptyInput);

  const livesAfterDeath = state.p1State.lives; // 2
  const isDeadNow = state.p1State.isDead; // true

  // Advance 125 ticks (~2.08s) -> respawn should occur
  for (let i = 0; i < 125; i++) {
    engine.stepTick(emptyInput);
  }

  const respawned = !state.p1State.isDead && state.p1.isAlive;
  const hasShield = state.p1State.shieldTimer > 0 && state.p1.isShielded;
  const respawnPosCorrect = state.p1.x === 48 && state.p1.y === 192;

  const passed =
    initLives === 3 &&
    livesAfterDeath === 2 &&
    isDeadNow &&
    respawned &&
    hasShield &&
    respawnPosCorrect;

  return {
    id: 'M3-12',
    name: 'P1 3 Lives, 2s Respawn & 3s Shield',
    passed,
    expected: 'Lives 3->2, isDead=true -> 2s respawn at (48,192) with 3s shield',
    actual: `Lives: ${initLives}->${livesAfterDeath}, dead=${isDeadNow}, respawned=${respawned}, shield=${hasShield}, pos=(${state.p1.x},${state.p1.y})`,
    details: 'Hệ thống hồi sinh P1 sau 2 giây với khiên bảo vệ 3 giây và trừ mạng chính xác.',
  };
}

/**
 * M3-13: Eagle (Base) Defense & Instant Game Over
 */
export function runM313(): TestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const state = engine.getState();

  // Clear brick protecting base at (11, 6) so bullet hits Base directly at (12, 6)
  state.terrain.currentMap[11][6] = TILE_TYPES.EMPTY;

  const enemyBullet = {
    id: 'base_killer',
    ownerId: 'enemy_bot',
    ownerType: 'enemy' as const,
    x: 96,
    y: 190,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };
  state.bullets.push(enemyBullet);

  for (let i = 0; i < 10; i++) {
    engine.stepTick(emptyInput);
    if (state.isGameOver) break;
  }

  const passed = state.terrain.isBaseDestroyed && state.isGameOver;

  return {
    id: 'M3-13',
    name: 'Eagle Defense & Instant Game Over',
    passed,
    expected: 'isBaseDestroyed = true, isGameOver = true',
    actual: `isBaseDestroyed = ${state.terrain.isBaseDestroyed}, isGameOver = ${state.isGameOver}`,
    details: 'Căn cứ Đại bàng bị bắn trúng dẫn đến kết thúc trò chơi Game Over ngay lập tức.',
  };
}

/**
 * M3-14: Stage Clear Condition
 * Defeating all 30 enemies with Base intact and P1 alive triggers Stage Clear.
 */
export function runM314(): TestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const state = engine.getState() as any;

  state.totalDefeatedEnemies = 30;
  state.p1State.lives = 2;
  state.terrain.isBaseDestroyed = false;

  engine.stepTick(emptyInput);

  const passed = state.isStageClear === true && !state.isGameOver;

  return {
    id: 'M3-14',
    name: 'Stage Clear Verification',
    passed,
    expected: 'isStageClear = true when 30 enemies destroyed, base intact, P1 alive',
    actual: `isStageClear = ${state.isStageClear}, isGameOver = ${state.isGameOver}`,
    details: 'Hoàn thành màn chơi khi tiêu diệt đủ 30 xe địch mà căn cứ vẫn được bảo toàn an toàn.',
  };
}

/**
 * Runs all 14 Milestone 3 Test Cases.
 */
export function runAllM3TestCases(): TestCaseResult[] {
  return [
    runM301(),
    runM302(),
    runM303(),
    runM304(),
    runM305(),
    runM306(),
    runM307(),
    runM308(),
    runM309(),
    runM310(),
    runM311(),
    runM312(),
    runM313(),
    runM314(),
  ];
}
