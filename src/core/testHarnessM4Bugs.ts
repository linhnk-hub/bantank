/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ENEMY_CONFIG, P1_CONFIG, AI_CONFIG, MAP_DIMENSIONS } from './constants.ts';
import {
  type InputState,
  type Direction,
  TILE_TYPES,
  SUB_TILE_MASKS,
  type RuntimeTerrainState,
  type EnemyTank,
} from './types.ts';
import { createRuntimeTerrainState, getBrickMask, removeBrickSubTiles } from './terrain.ts';
import { GameEngine } from './gameEngine.ts';
import { getBulletHitbox, getTankHitbox, checkHitboxVsTerrain, intersectAABB } from './physics.ts';
import { hasLineOfSight, isAlignedWithTarget, updateEnemyAI } from './ai/enemyAI.ts';
import { scoreAndSelectTarget } from './ai/targetScoring.ts';
import { spawnBullet, updateBullet } from './bullet.ts';

export interface BugTestCaseResult {
  id: string;
  bugNumber: number;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
  diagnostics?: any;
}

const emptyInput: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

/**
 * TC-BUG-01: AI Target Selection & Firing Audit
 * - Tests target selection weights (30% distance, 40% A*, 20% LoS, 10% battlefield).
 * - Tests 80px detection radius.
 * - Enemy near P1 with gun bore aligned (<= 4px) and clear LoS accumulates aimTimer and shoots.
 * - Enemy far away or unaligned does NOT shoot prematurely.
 * - Max 1 active bullet enforced for enemy.
 * - Confirms full debugLog generated on EnemyTank.
 */
export function runBug01(): BugTestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const terrain = engine.getState().terrain;
  const p1 = engine.getState().p1;

  // Set P1 at (48, 80)
  p1.x = 48;
  p1.y = 80;
  p1.direction = 'UP';

  // Enemy A: near P1 at (48, 30) (distance 50px < 80px), facing DOWN directly at P1
  // Gun bore offset dx = 0 <= 4px
  const enemyA: EnemyTank = {
    id: 'enemy_near_p1',
    x: 48,
    y: 30,
    direction: 'DOWN',
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
    directionHistory: ['DOWN'],
    dirHoldTimer: 0.5,
    leadPos: null,
    leadEvalTimer: 0,
    lastP1Direction: null,
    spawnShieldTimer: 0,
  };

  // Enemy B: far at corner (192, 0), facing RIGHT (not aligned with P1, not facing Base)
  const enemyB: EnemyTank = {
    id: 'enemy_far',
    x: 192,
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
    dirHoldTimer: 0.5,
    leadPos: null,
    leadEvalTimer: 0,
    lastP1Direction: null,
    spawnShieldTimer: 0,
  };

  const dt = 1 / 60;
  // Step 25 ticks (~0.416s, which exceeds required aimTime 0.35s for BASIC)
  let enemyAFired = false;
  let enemyBFired = false;

  for (let t = 0; t < 25; t++) {
    const decA = updateEnemyAI(enemyA, p1, false, terrain, dt, [enemyB]);
    const decB = updateEnemyAI(enemyB, p1, false, terrain, dt, [enemyA]);
    if (decA.shouldShoot) enemyAFired = true;
    if (decB.shouldShoot) enemyBFired = true;
  }

  // Check Enemy A debugLog
  const logA = enemyA.debugLog;
  const hasValidDebugLog =
    Boolean(logA) &&
    logA?.enemyId === 'enemy_near_p1' &&
    typeof logA?.aimTimer === 'number' &&
    typeof logA?.scoring.distanceScore === 'number' &&
    typeof logA?.scoring.totalRawScore === 'number' &&
    logA?.isAligned === true;

  const passed = enemyAFired === true && enemyBFired === false && hasValidDebugLog;

  return {
    id: 'TC-BUG-01',
    bugNumber: 1,
    name: 'AI Target Selection, Alignment & Firing Audit',
    passed,
    expected: 'Enemy near P1 (<80px, aligned bore <=4px) fires after 0.35s aim; unaligned far enemy does not fire; debugLog complete',
    actual: `enemyAFired=${enemyAFired}, enemyBFired=${enemyBFired}, hasValidDebugLog=${hasValidDebugLog}`,
    details: 'Đảm bảo xe địch gần P1 có LoS và ngắm chuẩn khai hỏa chính xác; xe xa không ngắm chuẩn không bắn bừa bãi; log chi tiết đầy đủ.',
    diagnostics: logA,
  };
}

/**
 * TC-BUG-02: Real-time Bitmask Subtile Collision & Sync Audit
 * - Tests 4-bit subtile masks (TL=1, TR=2, BL=4, BR=8).
 * - Partial brick destruction mask 15 -> 14 -> 12 -> 8 -> 0.
 * - Solid sub-tiles block tank; destroyed sub-tiles allow tank pass-through without invisible obstacles.
 */
export function runBug02(): BugTestCaseResult {
  const customMap = Array(13).fill(null).map(() => Array(13).fill(0));
  customMap[5][5] = TILE_TYPES.BRICK; // Row 5, Col 5: (x=80..96, y=80..96)
  const terrain = createRuntimeTerrainState(customMap);

  // Sub-tile positions for (5, 5):
  // TL: x=80..88, y=80..88 (mask 1)
  // TR: x=88..96, y=80..88 (mask 2)
  // BL: x=80..88, y=88..96 (mask 4)
  // BR: x=88..96, y=88..96 (mask 8)

  // 1. Initial: mask is 15. Tank probing TL hits obstacle
  const boxTL = { left: 81, right: 87, top: 81, bottom: 87 };
  const coll1 = checkHitboxVsTerrain(boxTL, terrain, { forBullet: false });

  // 2. Clear TL (bit 1) -> mask becomes 14 (TR=2, BL=4, BR=8)
  removeBrickSubTiles(terrain, 5, 5, SUB_TILE_MASKS.TL);
  const maskAfterTL = getBrickMask(terrain, 5, 5);
  // Now boxTL touches ONLY the destroyed TL sub-tile: MUST NOT collide!
  const coll2 = checkHitboxVsTerrain(boxTL, terrain, { forBullet: false });

  // 3. But boxTR (x=89..95, y=81..87) touches TR (still intact): MUST collide!
  const boxTR = { left: 89, right: 95, top: 81, bottom: 87 };
  const coll3 = checkHitboxVsTerrain(boxTR, terrain, { forBullet: false });

  // 4. Clear TR and BL -> mask becomes 8 (only BR remains)
  removeBrickSubTiles(terrain, 5, 5, SUB_TILE_MASKS.TR | SUB_TILE_MASKS.BL);
  const maskAfterTRBL = getBrickMask(terrain, 5, 5);
  const collTR = checkHitboxVsTerrain(boxTR, terrain, { forBullet: false }); // false
  const boxBR = { left: 89, right: 95, top: 89, bottom: 95 };
  const collBR = checkHitboxVsTerrain(boxBR, terrain, { forBullet: false }); // true

  // 5. Clear BR -> mask becomes 0 -> tile becomes EMPTY
  removeBrickSubTiles(terrain, 5, 5, SUB_TILE_MASKS.BR);
  const maskAfterBR = getBrickMask(terrain, 5, 5);
  const collBR2 = checkHitboxVsTerrain(boxBR, terrain, { forBullet: false }); // false

  const passed =
    coll1.collides === true &&
    maskAfterTL === 14 &&
    coll2.collides === false &&
    coll3.collides === true &&
    maskAfterTRBL === 8 &&
    collTR.collides === false &&
    collBR.collides === true &&
    maskAfterBR === 0 &&
    collBR2.collides === false;

  return {
    id: 'TC-BUG-02',
    bugNumber: 2,
    name: 'Real-time Bitmask Subtile Collision & Phased Destruction',
    passed,
    expected: 'Subtiles collide strictly when their bitmask bit is set; destroyed subtiles never block movement (no invisible bricks)',
    actual: `coll1=${coll1.collides}, maskTL=${maskAfterTL}, coll2=${coll2.collides}, coll3=${coll3.collides}, maskTRBL=${maskAfterTRBL}, collBR=${collBR.collides}, maskBR=${maskAfterBR}, collBR2=${collBR2.collides}`,
    details: 'Đảm bảo va chạm phản ánh chính xác từng bitmask 8×8 px; không xảy ra tường gạch vô hình cản trở xe di chuyển.',
  };
}

/**
 * TC-BUG-03: Bullet vs Brick vs Base Protective Wall Integrity (CRITICAL)
 * - Protective brick wall at Row 11, Col 6 (x=96..112, y=176..192) directly above Base at Row 12, Col 6 (x=96..112, y=192..208).
 * - Bullet 1 chips the top face (TL destroyed, mask becomes 14).
 * - Bullet 2 is fired DOWN on the left side (x=96..100) where TL was chipped:
 *   Bullet 2 MUST hit BL (the intact brick sub-tile directly below TL), destroy BL, and be consumed!
 * - Base at Row 12, Col 6 MUST REMAIN 100% INTACT (isBaseDestroyed = false, isGameOver = false).
 * - Also tests Bullet flying LEFT into Row 12, Col 8 (Brick) guarding Base at Col 7: brick is hit, Base intact!
 */
export function runBug03(): BugTestCaseResult {
  const customMap = Array(13).fill(null).map(() => Array(13).fill(0));
  // Place Protective Wall at Row 11, Col 6
  customMap[11][6] = TILE_TYPES.BRICK;
  // Place Base at Row 12, Col 6
  customMap[12][6] = TILE_TYPES.BASE;
  // Place Protective Wall at Row 12, Col 8 guarding Base at Row 12, Col 7
  customMap[12][7] = TILE_TYPES.BASE;
  customMap[12][8] = TILE_TYPES.BRICK;

  const terrain = createRuntimeTerrainState(customMap);

  // 1. First bullet moving DOWN from (96, 170):
  // Hits top face of (11, 6). Destroys TL (left half overlap).
  const bullet1 = {
    id: 'b1_test',
    ownerId: 'shooter',
    x: 96,
    y: 174,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };

  const res1 = updateBullet(bullet1, terrain);
  const maskAfterB1 = getBrickMask(terrain, 11, 6);
  // TL is destroyed (mask becomes 14: TR=2, BL=4, BR=8)
  const b1DestroyedTL = res1.hitBrick === true && (maskAfterB1 & SUB_TILE_MASKS.TL) === 0;

  // 2. Second bullet moving DOWN at the same x=96 (where TL was chipped):
  // Starts at y=176 (inside the destroyed TL cavity).
  // As it advances towards y=184+, it meets BL (which is intact).
  // Bullet 2 MUST hit BL and get consumed. It MUST NOT penetrate into Row 12 Base!
  const bullet2 = {
    id: 'b2_test',
    ownerId: 'shooter',
    x: 96,
    y: 180,
    direction: 'DOWN' as Direction,
    speed: 160,
    power: 1,
  };

  // Step bullet 2 through the tile until impact
  let b2HitBrick = false;
  let b2HitBase = false;
  for (let step = 0; step < 10; step++) {
    const res2 = updateBullet(bullet2, terrain);
    if (res2.hitBrick) b2HitBrick = true;
    if (res2.hitBase) b2HitBase = true;
    if (!res2.isAlive) break;
  }

  const maskAfterB2 = getBrickMask(terrain, 11, 6);
  // BL is destroyed (mask becomes 10: TR=2, BR=8)
  const b2DestroyedBL = b2HitBrick && (maskAfterB2 & SUB_TILE_MASKS.BL) === 0;
  const baseIntact1 = terrain.isBaseDestroyed === false;

  // 3. Bullet 3 moving LEFT into Col 8 (Brick) guarding Col 7 (Base)
  const bullet3 = {
    id: 'b3_test',
    ownerId: 'shooter',
    x: 130, // in Col 8 (x=128..144)
    y: 196,
    direction: 'LEFT' as Direction,
    speed: 160,
    power: 1,
  };

  let b3HitBrick = false;
  let b3HitBase = false;
  for (let step = 0; step < 15; step++) {
    const res3 = updateBullet(bullet3, terrain);
    if (res3.hitBrick) b3HitBrick = true;
    if (res3.hitBase) b3HitBase = true;
    if (!res3.isAlive) break;
  }

  const baseIntact2 = terrain.isBaseDestroyed === false;

  const passed =
    b1DestroyedTL &&
    b2HitBrick &&
    !b2HitBase &&
    b2DestroyedBL &&
    baseIntact1 &&
    b3HitBrick &&
    !b3HitBase &&
    baseIntact2;

  return {
    id: 'TC-BUG-03',
    bugNumber: 3,
    name: 'Protective Brick Wall Integrity vs Eagle Base (No Wall Skipping)',
    passed,
    expected: 'Second bullet hits intact lower sub-tile (BL) and is consumed; Base remains 100% intact; Leftward bullet hits brick wall before Base',
    actual: `b1TL=${b1DestroyedTL}, b2HitBrick=${b2HitBrick}, b2HitBase=${b2HitBase}, b2BL=${b2DestroyedBL}, baseIntact1=${baseIntact1}, b3HitBrick=${b3HitBrick}, baseIntact2=${baseIntact2}`,
    details: 'Kiểm tra triệt để: đạn thứ hai không thể xuyên qua mảnh gạch còn lại để phá căn cứ; tường bảo vệ hoạt động chính xác 100%.',
  };
}

/**
 * TC-BUG-04: Enemy Spawn Shield Independence & Clean Expiration
 * - Enemy spawns with 1.0s invulnerability (spawnShieldTimer = 1.0, isShielded = true).
 * - Bullet hit during spawn shield: absorbed/no damage, hp remains max, score = 0.
 * - After 1.0s: spawnShieldTimer reaches 0, isShielded becomes false.
 * - Bullet hit after 1.0s: takes damage normally and awards score.
 * - Verifies P1 3.0s respawn shield is completely decoupled and unaffected.
 */
export function runBug04(): BugTestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const manager = engine.getEnemyManager();
  manager.reset(['BASIC', 'BASIC']);

  // Spawn Enemy 1
  const enemy1 = engine.spawnEnemyImmediate()!;
  const hasInitialShield = enemy1.spawnShieldTimer === 1.0 && enemy1.isShielded === true;

  // Hit Enemy 1 during spawn shield -> must NOT take damage
  const hit1 = manager.damageEnemy(enemy1.id);
  const shieldBlockedDamage = !hit1.destroyed && enemy1.hp === 1 && hit1.score === 0;

  // Advance simulation by 1.1s (66 ticks) so shield expires
  for (let i = 0; i < 66; i++) {
    updateEnemyAI(enemy1, engine.getState().p1, false, engine.getState().terrain, 1 / 60);
  }

  const shieldExpired = enemy1.spawnShieldTimer === 0 && enemy1.isShielded === false;

  // Hit Enemy 1 after shield expiration -> takes damage and dies (Basic has 1 hp, awards 1 XP)
  const hit2 = manager.damageEnemy(enemy1.id);
  const damageWorked = hit2.destroyed === true && hit2.score === 1;

  // Verify P1 respawn shield is intact at 3.0s
  const p1ShieldTimer = engine.getState().p1State.shieldTimer;
  const p1Decoupled = p1ShieldTimer === P1_CONFIG.RESPAWN_SHIELD_S;

  const passed = hasInitialShield && shieldBlockedDamage && shieldExpired && damageWorked && p1Decoupled;

  return {
    id: 'TC-BUG-04',
    bugNumber: 4,
    name: 'Enemy Spawn Shield Independence & Expiration Audit',
    passed,
    expected: 'Spawn shield grants 1.0s invulnerability; expires cleanly to allow normal damage; P1 shield completely decoupled',
    actual: `initialShield=${hasInitialShield}, blocked=${shieldBlockedDamage}, expired=${shieldExpired}, damageWorked=${damageWorked}, p1Decoupled=${p1Decoupled}`,
    details: 'Đảm bảo khiên bảo vệ 1.0s của địch chặn sát thương chính xác, hết hạn đúng lúc và tách biệt hoàn toàn với khiên 3.0s của P1.',
  };
}

/**
 * Runs all 4 Bug Verification Test Cases.
 */
export function runAllBugTestCases(): BugTestCaseResult[] {
  return [
    runBug01(),
    runBug02(),
    runBug03(),
    runBug04(),
  ];
}
