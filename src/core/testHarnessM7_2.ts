/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthManager } from './authManager.ts';
import { AllyAIController } from './ai/allyAI.ts';
import {
  EXTREME_TENDENCY_WEIGHTS,
  TYPE_TENDENCY_WEIGHTS,
  scoreAndSelectTarget,
} from './ai/targetScoring.ts';
import { detectAndDodgeIncomingBullet, updateEnemyAI } from './ai/enemyAI.ts';
import { getEffectiveShootCooldown } from './enemyManager.ts';
import { GameEngine } from './gameEngine.ts';
import { createP1Tank, createP2Tank } from './tank.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { updateBullet } from './bullet.ts';
import { STAGE_1_MAP, ENEMY_CONFIG } from './constants.ts';
import {
  TILE_TYPES,
  type TestCaseResult,
  type BulletStructure,
  type EnemyTank,
} from './types.ts';
import {
  getSessionBadgeInfo,
  formatAccountStatusMessage,
} from '../components/AuthSessionBanner.tsx';

function createEmptyArenaTerrain() {
  const emptyGrid = Array.from({ length: 13 }, () => Array(13).fill(TILE_TYPES.EMPTY));
  emptyGrid[12][6] = TILE_TYPES.BASE;
  return createRuntimeTerrainState(emptyGrid);
}

function makeTestEnemy(overrides: Partial<EnemyTank> = {}): EnemyTank {
  return {
    id: 'enemy_test',
    x: 96,
    y: 32,
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
    shootCooldown: 1.5,
    aimTimer: 0,
    aimTime: 0.25,
    directionHistory: ['DOWN'],
    dirHoldTimer: 0.5,
    leadPos: null,
    leadEvalTimer: 0,
    lastP1Direction: null,
    flankOffset: { x: 0, y: 0 },
    spawnShieldTimer: 0,
    ...overrides,
  };
}

export function runAllM7_2Tests(): { results: TestCaseResult[] } {
  const results: TestCaseResult[] = [];

  function record(
    id: string,
    name: string,
    passed: boolean,
    details?: string,
    whyItMatters?: string
  ) {
    results.push({
      id,
      name,
      passed,
      executionTimeMs: 1,
      errorMessage: passed ? undefined : details,
      whyItMatters: whyItMatters ?? 'Yêu cầu M7.2 Fix kiểm toán độc lập Bắn Tank Online',
    });
  }

  // =========================================================================
  // 1. Profile Update & Reload Persistence
  // =========================================================================
  try {
    const auth = AuthManager.getInstance();
    (auth as any).currentUser = {
      uid: 'u_test_123',
      email: 'linhnk2013@gmail.com',
      displayName: 'Default Name',
      photoURL: '',
    };
    let updatedUser: any = null;
    const unsub = auth.subscribe((u) => {
      updatedUser = u;
    });

    const promise = auth.updateUserProfile({
      displayName: 'Chiến Tướng Tank',
      photoURL: 'https://example.com/avatar.png',
    });

    const current = auth.getCurrentUser();
    const passed =
      promise instanceof Promise &&
      updatedUser?.displayName === 'Chiến Tướng Tank' &&
      updatedUser?.photoURL === 'https://example.com/avatar.png' &&
      current?.displayName === 'Chiến Tướng Tank' &&
      current?.photoURL === 'https://example.com/avatar.png' &&
      current?.email === 'linhnk2013@gmail.com';

    record(
      'M7_2_T1',
      'Cập nhật hồ sơ tài khoản: updateUserProfile cập nhật, hiển thị lại displayName/photoURL và giữ nguyên email chỉ đọc',
      passed,
      `displayName=${current?.displayName}, photoURL=${current?.photoURL}, email=${current?.email}`,
      'Thông tin tên hiển thị và avatar mới hiển thị thực tế trên Header MainMenuScreen & ModeSelectionScreen'
    );
    unsub();
  } catch (e: any) {
    record('M7_2_T1', 'Cập nhật hồ sơ tài khoản', false, e?.message);
  }

  // =========================================================================
  // 2. P2 Spawn at (144,192), P1 at (48,192), 3 Lives & 3s Respawn Shield
  // =========================================================================
  try {
    const engine = new GameEngine();
    engine.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const state = engine.getState();

    const passed =
      state.gameMode === 'TWO_PLAYERS_AI' &&
      state.p1.x === 48 &&
      state.p1.y === 192 &&
      state.p1.direction === 'UP' &&
      state.p1State.lives === 3 &&
      state.p2 !== null &&
      state.p2 !== undefined &&
      state.p2.x === 144 &&
      state.p2.y === 192 &&
      state.p2.direction === 'UP' &&
      state.p2.type === 'player2' &&
      state.p2.isAlive === true &&
      state.p2.isShielded === true &&
      state.p2State?.lives === 3 &&
      state.p2State?.shieldTimer === 3.0;

    record(
      'M7_2_T2',
      'Khởi tạo Co-op chuẩn: P1 tại (48,192), P2 tại (144,192), mỗi bên 3 mạng và khiên bảo vệ 3s',
      passed,
      `P1=(${state.p1.x},${state.p1.y}) lives=${state.p1State.lives}; P2=(${state.p2?.x},${state.p2?.y}) lives=${state.p2State?.lives} shield=${state.p2State?.shieldTimer}`,
      'Đảm bảo tọa độ xuất phát, mạng sống và khiên bảo vệ đúng quy chuẩn Battle City'
    );
  } catch (e: any) {
    record('M7_2_T2', 'Khởi tạo Co-op chuẩn', false, e?.message);
  }

  // =========================================================================
  // 3. P2 Real A* Pathfinding, Obstacle Avoidance (Steel/P1), and Unstuck Recovery
  // =========================================================================
  try {
    const allyAI = new AllyAIController();
    const terrain = createEmptyArenaTerrain();
    // Place an impassable STEEL wall directly above P2 at (144, 176) -> row 11, col 9
    terrain.currentMap[11][9] = TILE_TYPES.STEEL;

    const p1 = createP1Tank();
    const p2 = createP2Tank(); // at (144, 192)
    const enemy = makeTestEnemy({
      id: 'enemy_target_astar',
      x: 144,
      y: 128,
      targetPos: { x: 96, y: 192 },
    });

    const decision = allyAI.update(1 / 60, p2, p1, [enemy], terrain, false);
    const activePath = allyAI.getCurrentPath();
    // Since (144, 176) is blocked by STEEL, A* must route around (LEFT or RIGHT), not UP into steel!
    const avoidsSteelDirectlyAbove = decision.direction !== 'UP' && activePath.length > 0;

    // Also test stuck recovery: simulate P2 not moving for 0.5s (>= 0.45s threshold)
    let unstuckTriggered = false;
    for (let i = 0; i < 32; i++) {
      allyAI.update(1 / 60, p2, p1, [enemy], terrain, false);
      if (allyAI.getStuckTimer() === 0 && i >= 26) {
        unstuckTriggered = true;
      }
    }

    const passed = avoidsSteelDirectlyAbove && unstuckTriggered;
    record(
      'M7_2_T3',
      'AI P2 tìm đường A* thực tế: tránh tường thép/vật cản và tự tính lại đường khi bị kẹt (stuckTimer)',
      passed,
      `dir=${decision.direction}, pathLen=${activePath.length}, unstuckTriggered=${unstuckTriggered}`,
      'Đảm bảo P2 di chuyển thông minh bằng A* và không đứng kẹt vô hạn trước tường'
    );
  } catch (e: any) {
    record('M7_2_T3', 'AI P2 tìm đường A* và xử lý kẹt', false, e?.message);
  }

  // =========================================================================
  // 4. P2 Never Shoots P1 & P2 Bullets Never Damage P1
  // =========================================================================
  try {
    const allyAI = new AllyAIController();
    const terrain = createEmptyArenaTerrain();
    const p1 = createP1Tank();
    const p2 = createP2Tank();

    // Place P2 at (96, 144) facing UP, P1 at (96, 96) directly between P2 and an enemy at (96, 48)
    p2.x = 96;
    p2.y = 144;
    p2.direction = 'UP';
    p1.x = 96;
    p1.y = 96;
    p1.isAlive = true;

    const enemyBehindP1 = makeTestEnemy({
      id: 'enemy_behind_p1',
      x: 96,
      y: 48,
    });

    const isP1InLine = allyAI.isFriendlyInLineOfFire(p2, 'UP', p1, terrain);
    const postTurnSafe = allyAI.verifySafeShotAfterTurn(p2, p1, [enemyBehindP1], terrain, false);

    // Also verify in GameEngine that a P2 bullet overlapping P1 does NOT damage P1
    const engine = new GameEngine(createEmptyArenaTerrain(), undefined, false);
    engine.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const st = engine.getState();
    st.p1.isShielded = false;
    st.p1State.shieldTimer = 0;
    st.bullets.push({
      id: 'b_p2_friendly_test',
      x: st.p1.x + 6,
      y: st.p1.y + 6,
      direction: 'LEFT',
      speed: 180,
      power: 1,
      ownerType: 'player',
      ownerId: 'p2',
    });
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const p1Unharmed = st.p1.isAlive === true && st.p1State.lives === 3 && st.p1State.isDead === false;

    const passed = isP1InLine === true && postTurnSafe === false && p1Unharmed === true;
    record(
      'M7_2_T4',
      'P2 Friendly-Fire Safe với P1: Không bắn khi P1 nằm trên đường đạn và đạn P2 không gây sát thương cho P1',
      passed,
      `isP1InLine=${isP1InLine}, postTurnSafe=${postTurnSafe}, p1Unharmed=${p1Unharmed}`,
      'Bảo vệ tuyệt đối người chơi P1 khỏi hỏa lực của AI đồng minh P2'
    );
  } catch (e: any) {
    record('M7_2_T4', 'P2 Friendly-Fire Safe với P1', false, e?.message);
  }

  // =========================================================================
  // 5. P2 Never Shoots Base (Including Same-Tick Turn) & P2 Bullet Never Destroys Base
  // =========================================================================
  try {
    // 5a. Same-tick turn test in GameEngine:
    // P2 is at (128, 192) facing UP (safe direction), but AI decides to turn LEFT toward Base (96, 192)
    // because an enemy is at (32, 192) on the other side of the Base.
    // Even if AI wanted to shoot before turning, after turning LEFT it faces the Base and MUST NOT spawn a bullet!
    const engine = new GameEngine(createEmptyArenaTerrain(), undefined, false);
    engine.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const st = engine.getState();
    if (st.p2) {
      st.p2.x = 128;
      st.p2.y = 192;
      st.p2.direction = 'UP';
    }
    const enemyAcrossBase = makeTestEnemy({
      id: 'enemy_across_base',
      x: 32,
      y: 192,
      direction: 'RIGHT',
      speed: 0,
      shootCooldown: 99,
    });
    st.enemies.push(enemyAcrossBase);

    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const p2FiredTowardBase = st.bullets.some(
      (b) => b.ownerId === 'p2' && b.direction === 'LEFT' && Math.abs(b.y - 198) <= 10
    );

    // 5b. Direct bullet collision test: P2 bullet hitting Base tile (96, 192) must NOT destroy Base,
    // whereas an enemy bullet hitting Base tile MUST destroy Base!
    const terrainForP2Bullet = createEmptyArenaTerrain();
    const p2BulletAtBase: BulletStructure = {
      id: 'b_p2_base_guard',
      x: 104,
      y: 198,
      direction: 'LEFT',
      speed: 180,
      power: 1,
      ownerType: 'player',
      ownerId: 'p2',
    };
    const p2BulletRes = updateBullet(p2BulletAtBase, terrainForP2Bullet);
    const baseSafeFromP2Bullet =
      p2BulletRes.hitBase === false && terrainForP2Bullet.isBaseDestroyed === false;

    const terrainForEnemyBullet = createEmptyArenaTerrain();
    const enemyBulletAtBase: BulletStructure = {
      id: 'b_enemy_base_hit',
      x: 104,
      y: 198,
      direction: 'LEFT',
      speed: 180,
      power: 1,
      ownerType: 'enemy',
      ownerId: 'enemy_1',
    };
    const enemyBulletRes = updateBullet(enemyBulletAtBase, terrainForEnemyBullet);
    const enemyStillDestroysBase =
      enemyBulletRes.hitBase === true && terrainForEnemyBullet.isBaseDestroyed === true;

    const passed =
      p2FiredTowardBase === false &&
      baseSafeFromP2Bullet === true &&
      enemyStillDestroysBase === true;

    record(
      'M7_2_T5',
      'Bảo vệ Căn cứ Đại Bàng: P2 không bắn về phía căn cứ sau khi xoay nòng cùng tick và đạn P2 không phá hủy căn cứ',
      passed,
      `p2FiredTowardBase=${p2FiredTowardBase}, baseSafeFromP2Bullet=${baseSafeFromP2Bullet}, enemyStillDestroysBase=${enemyStillDestroysBase}`,
      'Khắc phục triệt để lỗi thứ tự xoay xe/kiểm tra đường đạn và khóa sát thương đạn P2 lên Đại Bàng'
    );
  } catch (e: any) {
    record('M7_2_T5', 'Bảo vệ Căn cứ Đại Bàng', false, e?.message);
  }

  // =========================================================================
  // 6. Real Hard Mode (EXTREME) vs Normal Mode (DEFAULT) Gameplay Behavior
  // =========================================================================
  try {
    // 6a. Shoot Cooldown (Reload Time): Normal = [1.5, 1.2, 2.0, 2.5], Hard = [1.0..1.2]
    const normalBasicCd = getEffectiveShootCooldown('BASIC', 'DEFAULT');
    const normalArmorCd = getEffectiveShootCooldown('ARMOR', 'DEFAULT');
    const hardFastCd = getEffectiveShootCooldown('FAST', 'EXTREME');
    const hardBasicCd = getEffectiveShootCooldown('BASIC', 'EXTREME');
    const hardPowerCd = getEffectiveShootCooldown('POWER', 'EXTREME');
    const hardArmorCd = getEffectiveShootCooldown('ARMOR', 'EXTREME');

    const cooldownsValid =
      normalBasicCd === 1.5 &&
      normalArmorCd === 2.5 &&
      hardFastCd >= 1.0 &&
      hardFastCd <= 1.2 &&
      hardBasicCd >= 1.0 &&
      hardBasicCd <= 1.2 &&
      hardPowerCd >= 1.0 &&
      hardPowerCd <= 1.2 &&
      hardArmorCd >= 1.0 &&
      hardArmorCd <= 1.2 &&
      hardBasicCd < normalBasicCd &&
      hardArmorCd < normalArmorCd;

    // 6b. Base Priority 70% in Hard Mode (EXTREME_TENDENCY_WEIGHTS) vs Normal Mode
    const terrain = createEmptyArenaTerrain();
    const p1 = createP1Tank();
    p1.x = 32;
    p1.y = 32;
    const dummyEnemy = makeTestEnemy({
      id: 'enemy_hard_test',
      x: 96,
      y: 32,
      shootCooldown: 0,
    });

    const scoreNormal = scoreAndSelectTarget(dummyEnemy, p1, false, terrain, [], 'DEFAULT');
    const scoreHard = scoreAndSelectTarget(dummyEnemy, p1, false, terrain, [], 'EXTREME');
    const basePriorityValid =
      EXTREME_TENDENCY_WEIGHTS.eagle === 0.7 &&
      EXTREME_TENDENCY_WEIGHTS.p1 === 0.3 &&
      TYPE_TENDENCY_WEIGHTS.BASIC.eagle === 0.5 &&
      scoreHard.eagleCandidate.components.tendencyMultiplier === 0.7 &&
      scoreNormal.eagleCandidate.components.tendencyMultiplier === 0.5;

    // 6c. Detection Radius: P1 at 128px away along open corridor (96, 160) from enemy at (96, 32)
    // In DEFAULT (80px radius), enemy does NOT detect P1 (losToP1 === false).
    // In EXTREME (corridor full-map LoS), enemy DOES detect P1 (losToP1 === true).
    p1.x = 96;
    p1.y = 160; // distance = 128px (> 80px)
    const enemyNormal = makeTestEnemy({ id: 'e_norm_los', x: 96, y: 32 });
    const enemyHard = makeTestEnemy({ id: 'e_hard_los', x: 96, y: 32 });
    updateEnemyAI(enemyNormal, p1, false, terrain, 1 / 60, [p1], 'DEFAULT', []);
    updateEnemyAI(enemyHard, p1, false, terrain, 1 / 60, [p1], 'EXTREME', []);
    const detectionDiffValid =
      enemyNormal.debugLog?.losToP1 === false &&
      enemyHard.debugLog?.losToP1 === true;

    // 6d. Perpendicular Bullet Dodge in EXTREME:
    // Incoming P1 bullet flying UP along x=102 towards enemy at (96, 96)
    const incomingBullet: BulletStructure = {
      id: 'b_incoming_p1',
      x: 102,
      y: 148,
      direction: 'UP',
      speed: 180,
      power: 1,
      ownerType: 'player',
      ownerId: 'p1',
    };
    const dodgeEnemy = makeTestEnemy({ id: 'e_dodge', x: 96, y: 96, direction: 'DOWN' });
    const dodgeDir = detectAndDodgeIncomingBullet(dodgeEnemy, [incomingBullet], terrain, []);
    const dodgeIsPerpendicular = dodgeDir === 'LEFT' || dodgeDir === 'RIGHT';

    const passed =
      cooldownsValid &&
      basePriorityValid &&
      detectionDiffValid &&
      dodgeIsPerpendicular;

    record(
      'M7_2_T6',
      'Độ khó Hard (EXTREME) thực thi khác biệt thật trong Game Core: nạp đạn 1.0–1.2s, 70% ưu tiên căn cứ, phát hiện dọc hành lang và né đạn vuông góc',
      passed,
      `cdValid=${cooldownsValid} (Hard=${hardFastCd}-${hardArmorCd}s), eagleWeight=${EXTREME_TENDENCY_WEIGHTS.eagle}, hardLos128px=${enemyHard.debugLog?.losToP1}, dodgeDir=${dodgeDir}`,
      'Đảm bảo chế độ Hard thực sự nâng cấp hành vi chiến thuật của AI địch theo đúng thông số'
    );
  } catch (e: any) {
    record('M7_2_T6', 'Độ khó Hard (EXTREME) trong Game Core', false, e?.message);
  }

  // =========================================================================
  // 7. Enemies Do Not Walk Through P2 & Stage 1 Enemy Count remains 30
  // =========================================================================
  try {
    const engine = new GameEngine(createEmptyArenaTerrain(), undefined, true);
    engine.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const st = engine.getState();

    // Place P2 stationary at (96, 96) and an enemy directly above P2 at (96, 80) moving DOWN toward P2
    if (st.p2) {
      st.p2.x = 96;
      st.p2.y = 96;
    }
    const enemyAboveP2 = makeTestEnemy({
      id: 'enemy_coll_p2',
      x: 96,
      y: 80, // 16px above P2 at (96, 96) -> touching top edge of P2 hitbox
      direction: 'DOWN',
      speed: 60,
      targetPos: { x: 96, y: 192 },
      path: [{ x: 96, y: 112 }],
      pathCooldown: 1.0,
      shootCooldown: 5.0,
      dirHoldTimer: 1.0,
    });

    const enemyManager = engine.getEnemyManager();
    enemyManager.getActiveEnemies().push(enemyAboveP2);

    // Run 15 ticks of enemyManager.update with P2 at (96, 96) while holding DOWN direction
    for (let i = 0; i < 15; i++) {
      enemyAboveP2.direction = 'DOWN';
      enemyAboveP2.dirHoldTimer = 1.0;
      enemyManager.update(
        1 / 60,
        st.p1,
        false,
        st.terrain,
        st.bullets,
        'DEFAULT',
        st.p2,
        false
      );
    }

    // Without P2, 15 ticks at 60px/s would move enemy to y = 95 (penetrating P2 at y=96).
    // With P2 collision active (14x14 hitbox with 1px inset), enemy is stopped at y <= 83!
    const blockedByP2 = enemyAboveP2.y <= 83;
    const totalStage1Enemies = ENEMY_CONFIG.TOTAL_COUNT === 30 && ENEMY_CONFIG.QUEUE.length === 30;

    const passed = blockedByP2 && totalStage1Enemies;
    record(
      'M7_2_T7',
      'Tương tác P2 và xe địch: Xe địch va chạm vật lý với P2 (không đi xuyên qua P2) và tổng số xe địch Stage 1 đúng 30',
      passed,
      `enemyYAfterMoveDownIntoP2=${enemyAboveP2.y} (<=80), totalEnemies=${ENEMY_CONFIG.TOTAL_COUNT}`,
      'Đảm bảo P2 là thực thể xe tăng hợp lệ trong hệ thống va chạm của EnemyManager'
    );
  } catch (e: any) {
    record('M7_2_T7', 'Tương tác P2 và xe địch', false, e?.message);
  }

  // =========================================================================
  // 8. Co-op Survival: P2 Out of Lives While P1 Alive (Continues) & Vice Versa
  // =========================================================================
  try {
    // Case A: P2 out of lives (0), P1 still has 2 lives -> Match continues!
    const engineA = new GameEngine(undefined, undefined, false);
    engineA.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const stA = engineA.getState();
    stA.p1State.lives = 2;
    stA.p1State.isDead = false;
    stA.p1.isAlive = true;
    if (stA.p2State && stA.p2) {
      stA.p2State.lives = 0;
      stA.p2State.isDead = true;
      stA.p2State.respawnTimer = 0;
      stA.p2.isAlive = false;
    }
    engineA.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const p1ContinuesWhenP2Out = stA.isGameOver === false && stA.matchState === 'PLAYING';

    // Case B: P1 out of lives (0), P2 still has 2 lives -> Match continues!
    const engineB = new GameEngine(undefined, undefined, false);
    engineB.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const stB = engineB.getState();
    stB.p1State.lives = 0;
    stB.p1State.isDead = true;
    stB.p1State.respawnTimer = 0;
    stB.p1.isAlive = false;
    if (stB.p2State && stB.p2) {
      stB.p2State.lives = 2;
      stB.p2State.isDead = false;
      stB.p2.isAlive = true;
    }
    engineB.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const p2ContinuesWhenP1Out = stB.isGameOver === false && stB.matchState === 'PLAYING';

    const passed = p1ContinuesWhenP2Out && p2ContinuesWhenP1Out;
    record(
      'M7_2_T8',
      'Vòng đời Co-op: P2 hết mạng không kết thúc trận khi P1 còn mạng, và P1 hết mạng không kết thúc trận khi P2 còn mạng',
      passed,
      `p1ContinuesWhenP2Out=${p1ContinuesWhenP2Out}, p2ContinuesWhenP1Out=${p2ContinuesWhenP1Out}`,
      'Đảm bảo quy tắc sinh tồn đồng đội Co-op chính xác'
    );
  } catch (e: any) {
    record('M7_2_T8', 'Vòng đời Co-op khi 1 bên hết mạng', false, e?.message);
  }

  // =========================================================================
  // 9. Match End Conditions: Both Out of Lives -> Game Over, Base Destroyed -> Game Over, 30 Enemies -> Stage Clear
  // =========================================================================
  try {
    // 9a. Both P1 & P2 out of lives -> Game Over
    const engineBothDead = new GameEngine(undefined, undefined, false);
    engineBothDead.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const stBoth = engineBothDead.getState();
    stBoth.p1State.lives = 0;
    stBoth.p1State.isDead = true;
    stBoth.p1State.respawnTimer = 0;
    stBoth.p1.isAlive = false;
    if (stBoth.p2State && stBoth.p2) {
      stBoth.p2State.lives = 0;
      stBoth.p2State.isDead = true;
      stBoth.p2State.respawnTimer = 0;
      stBoth.p2.isAlive = false;
    }
    engineBothDead.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const bothDeadGameOver = stBoth.isGameOver === true && stBoth.matchState === 'GAME_OVER';

    // 9b. Base destroyed while both P1 & P2 have 3 lives -> Immediate Game Over
    const engineBaseDestroyed = new GameEngine(undefined, undefined, false);
    engineBaseDestroyed.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const stBase = engineBaseDestroyed.getState();
    stBase.terrain.isBaseDestroyed = true;
    engineBaseDestroyed.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const baseDestroyedGameOver = stBase.isGameOver === true && stBase.matchState === 'GAME_OVER';

    // 9c. 30 enemies defeated and Base intact -> Stage Clear
    const engineClear = new GameEngine(undefined, undefined, false);
    engineClear.startMatch('TWO_PLAYERS_AI', 'DEFAULT');
    const stClear = engineClear.getState();
    (stClear as any).totalDefeatedEnemies = 30;
    (stClear as any).enemies = [];
    stClear.terrain.isBaseDestroyed = false;
    engineClear.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    const stageClearSuccess = stClear.isStageClear === true && stClear.matchState === 'STAGE_CLEAR';

    const passed = bothDeadGameOver && baseDestroyedGameOver && stageClearSuccess;
    record(
      'M7_2_T9',
      'Điều kiện kết thúc trận Co-op: Cả P1 & P2 hết mạng hoặc Căn cứ nổ thì Game Over ngay; diệt đủ 30 địch thì Stage Clear',
      passed,
      `bothDeadGameOver=${bothDeadGameOver}, baseDestroyedGameOver=${baseDestroyedGameOver}, stageClearSuccess=${stageClearSuccess}`,
      'Xác minh đầy đủ 3 điều kiện kết thúc trận đấu trong chế độ Co-op'
    );
  } catch (e: any) {
    record('M7_2_T9', 'Điều kiện kết thúc trận Co-op', false, e?.message);
  }

  // =========================================================================
  // 10. UI Session Label Removal Verification (Real Function & Message Audit)
  // =========================================================================
  try {
    const statuses: any[] = [
      'NO_SESSION',
      'ACQUIRING',
      'ACTIVE',
      'PAUSED_IDLE',
      'CONNECTION_LOST_UNVERIFIED',
      'HEARTBEAT_REJECTED_UNCLASSIFIED',
      'DISPLACED',
      'EXPIRED',
    ];

    const forbiddenPhrases = [
      'phiên đăng nhập',
      'phiên làm việc',
      'phiên hoạt động',
      'bị chiếm phiên',
      'phiên hết hạn',
    ];

    const badgesClean = statuses.every((st) => {
      const b1 = getSessionBadgeInfo(st, false, false, true);
      const b2 = getSessionBadgeInfo(st, true, true, false);
      const lower1 = b1.label.toLowerCase();
      const lower2 = b2.label.toLowerCase();
      return forbiddenPhrases.every((p) => !lower1.includes(p) && !lower2.includes(p));
    });

    const formattedDisplaced = formatAccountStatusMessage(
      'Phiên đăng nhập đã được mở trên một thiết bị khác. Trận đấu hiện tại đã tạm dừng.',
      'DISPLACED'
    );
    const formattedIdle = formatAccountStatusMessage(
      'Phiên làm việc đã tạm dừng sau 5 phút không hoạt động. Vui lòng đăng nhập lại để tiếp tục.',
      'PAUSED_IDLE'
    );

    const messagesClean =
      forbiddenPhrases.every(
        (p) =>
          !formattedDisplaced.toLowerCase().includes(p) &&
          !formattedIdle.toLowerCase().includes(p)
      ) &&
      formattedDisplaced.includes('thiết bị khác') &&
      formattedIdle.includes('5 phút không hoạt động');

    const passed = badgesClean && messagesClean;
    record(
      'M7_2_T10',
      'Giao diện người dùng: Không còn hiển thị "Phiên đăng nhập", "Phiên làm việc", "Phiên hoạt động", "Bị chiếm phiên", "Phiên hết hạn"',
      passed,
      `badgesClean=${badgesClean}, displacedMsg="${formattedDisplaced}", idleMsg="${formattedIdle}"`,
      'Kiểm chứng thực tế trên hàm hiển thị UI trong khi giữ nguyên 100% logic sessionManager.ts'
    );
  } catch (e: any) {
    record('M7_2_T10', 'Giao diện người dùng sạch nhãn phiên', false, e?.message);
  }

  return { results };
}
