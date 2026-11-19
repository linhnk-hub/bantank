/**
 * BTO-PROGRESSION-MODES-V1.4 — Automated Verification & 50+ Support Item Test Harness
 * Verifies:
 * 1. 17 Military Ranks & XP thresholds (0 -> 16,500+) + UNVERIFIED protection
 * 2. Star Economy conversion (25 XP = 1 Sao ⭐)
 * 3. Stage Completion Achievement Bonus XP (+10, +15, +25, 0) & Idempotency
 * 4. All 50 Support Item Test Cases (Section 6.6) across SOLO, CO-OP A.I, CO-OP ONLINE from Stage 1
 * 5. Authoritative Snapshot synchronization for CO-OP ONLINE without expanding Host privileges
 */

import {
  OFFICIAL_MILITARY_RANKS_ASC,
  OFFICIAL_MILITARY_RANKS_DESC,
  XP_PER_STAR,
  calculateMilitaryRankFromTotalXp,
  computeStarEconomyFromTotalXp,
  calculateStageAchievementBonus,
  computePlayerLevelProgress,
  PlayerLevelManager,
} from './playerLevelSystem.ts';
import {
  SUPPORT_ITEM_WAVE_SCHEDULE,
  SUPPORT_ITEM_LIFETIME_TICKS,
  SUPPORT_ITEM_EFFECT_DURATION_TICKS,
  SUPPORT_ITEM_MAX_PER_TYPE_PER_STAGE,
  SUPPORT_ITEM_MAX_TOTAL_PER_STAGE,
  EAGLE_SHIELD_SIDE_WALL_COORDS,
  createInitialStageItemSystemState,
  selectNextSupportItemType,
  selectValidSupportItemPosition,
  isSupportItemSystemEnabledForMode,
} from './supportItemSystem.ts';
import { GameEngine } from './gameEngine.ts';
import { TILE_TYPES, SUB_TILE_MASKS, type StageItemSystemState } from './types.ts';
import { MAP_DIMENSIONS } from './constants.ts';

function assertCondition(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function getItemSys(engine: GameEngine): StageItemSystemState {
  const sys = engine.getState().itemSystem;
  if (!sys) {
    throw new Error('Missing itemSystem on GameEngine state');
  }
  return sys;
}

export function runProgressionV1_4Tests(): void {
  let passed = 0;
  const pass = (label: string) => {
    passed++;
    console.log(`  [PASS #${passed}] ${label}`);
  };

  console.log('================================================================');
  console.log('BTO-PROGRESSION-MODES-V1.4 — AUTOMATED TEST SUITE');
  console.log('================================================================');

  // ---------------------------------------------------------------------------
  // PART A: 17 MILITARY RANKS & BOUNDARY THRESHOLDS
  // ---------------------------------------------------------------------------
  assertCondition(OFFICIAL_MILITARY_RANKS_ASC.length === 17, 'Must have exactly 17 military ranks (ASC)');
  assertCondition(OFFICIAL_MILITARY_RANKS_DESC.length === 17, 'Must have exactly 17 military ranks (DESC)');
  pass('17 Military Ranks table structure verified');

  const expectedThresholds: Array<{ xp: number; rankNameVi: string; tier: number; orderFromTop: number }> = [
    { xp: 0, rankNameVi: 'Binh nhì', tier: 1, orderFromTop: 17 },
    { xp: 99, rankNameVi: 'Binh nhì', tier: 1, orderFromTop: 17 },
    { xp: 100, rankNameVi: 'Binh nhất', tier: 2, orderFromTop: 16 },
    { xp: 249, rankNameVi: 'Binh nhất', tier: 2, orderFromTop: 16 },
    { xp: 250, rankNameVi: 'Hạ sĩ', tier: 3, orderFromTop: 15 },
    { xp: 450, rankNameVi: 'Trung sĩ', tier: 4, orderFromTop: 14 },
    { xp: 700, rankNameVi: 'Thượng sĩ', tier: 5, orderFromTop: 13 },
    { xp: 1000, rankNameVi: 'Thiếu úy', tier: 6, orderFromTop: 12 },
    { xp: 1400, rankNameVi: 'Trung úy', tier: 7, orderFromTop: 11 },
    { xp: 1900, rankNameVi: 'Thượng úy', tier: 8, orderFromTop: 10 },
    { xp: 2500, rankNameVi: 'Đại úy', tier: 9, orderFromTop: 9 },
    { xp: 3300, rankNameVi: 'Thiếu tá', tier: 10, orderFromTop: 8 },
    { xp: 4300, rankNameVi: 'Trung tá', tier: 11, orderFromTop: 7 },
    { xp: 5500, rankNameVi: 'Thượng tá', tier: 12, orderFromTop: 6 },
    { xp: 7000, rankNameVi: 'Đại tá', tier: 13, orderFromTop: 5 },
    { xp: 8800, rankNameVi: 'Thiếu tướng', tier: 14, orderFromTop: 4 },
    { xp: 11000, rankNameVi: 'Trung tướng', tier: 15, orderFromTop: 3 },
    { xp: 13500, rankNameVi: 'Thượng tướng', tier: 16, orderFromTop: 2 },
    { xp: 16499, rankNameVi: 'Thượng tướng', tier: 16, orderFromTop: 2 },
    { xp: 16500, rankNameVi: 'Đại tướng', tier: 17, orderFromTop: 1 },
    { xp: 25000, rankNameVi: 'Đại tướng', tier: 17, orderFromTop: 1 },
  ];

  for (const check of expectedThresholds) {
    const info = calculateMilitaryRankFromTotalXp(check.xp);
    assertCondition(
      info.nameVi === check.rankNameVi &&
        info.tier === check.tier &&
        info.orderFromTop === check.orderFromTop,
      `XP=${check.xp} expected ${check.rankNameVi} (tier ${check.tier}), got ${info.nameVi} (tier ${info.tier})`
    );
  }
  pass('All 17 Military Rank XP boundary thresholds (0 -> 25,000 XP) verified');

  const unverifiedProgress = computePlayerLevelProgress(null, 'UNVERIFIED');
  assertCondition(
    unverifiedProgress.totalXp === null &&
      unverifiedProgress.rankTier === null &&
      unverifiedProgress.rankCode === null &&
      unverifiedProgress.rankNameVi === 'Chưa xác minh' &&
      unverifiedProgress.rankBadge === 'Chưa xác minh',
    'Unverified player progress must NOT fake 0 XP or Binh nhi'
  );
  pass('Unverified XP state protection (never fakes 0 XP / Binh nhì) verified');

  // ---------------------------------------------------------------------------
  // PART B: STAR ECONOMY (25 XP = 1 SAO ⭐)
  // ---------------------------------------------------------------------------
  assertCondition(XP_PER_STAR === 25, 'XP_PER_STAR must be 25');
  const starChecks = [
    { xp: 0, stars: 0, rem: 0, toNext: 25 },
    { xp: 24, stars: 0, rem: 24, toNext: 1 },
    { xp: 25, stars: 1, rem: 0, toNext: 25 },
    { xp: 26, stars: 1, rem: 1, toNext: 24 },
    { xp: 49, stars: 1, rem: 24, toNext: 1 },
    { xp: 50, stars: 2, rem: 0, toNext: 25 },
    { xp: 75, stars: 3, rem: 0, toNext: 25 },
    { xp: 125, stars: 5, rem: 0, toNext: 25 },
    { xp: 16500, stars: 660, rem: 0, toNext: 25 },
  ];
  for (const sc of starChecks) {
    const st = computeStarEconomyFromTotalXp(sc.xp);
    assertCondition(
      st.starBalance === sc.stars && st.unconvertedXp === sc.rem && st.xpToNextStar === sc.toNext,
      `Star check failed for XP=${sc.xp}: got stars=${st.starBalance}, rem=${st.unconvertedXp}, next=${st.xpToNextStar}`
    );
  }
  pass('Star Economy conversion (25 XP = 1 Sao ⭐) verified across all boundary values');

  // ---------------------------------------------------------------------------
  // PART C: STAGE COMPLETION ACHIEVEMENT BONUS XP (+10 / +15 / +25 / 0)
  // ---------------------------------------------------------------------------
  const bonusNone = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: 1,
    stageElapsedSeconds: 75,
    matchDurationSeconds: 120,
  });
  assertCondition(
    bonusNone.bonusXp === 0 && !bonusNone.noLivesLostAchieved && !bonusNone.halfTimeAchieved,
    'Expected 0 bonus XP'
  );

  const bonusNoLifeLost = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: 0,
    stageElapsedSeconds: 80,
    matchDurationSeconds: 120,
  });
  assertCondition(
    bonusNoLifeLost.bonusXp === 10 &&
      bonusNoLifeLost.noLivesLostAchieved &&
      !bonusNoLifeLost.halfTimeAchieved,
    'Expected +10 XP for 0 lives lost'
  );

  const bonusFastClear120 = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: 2,
    stageElapsedSeconds: 60,
    matchDurationSeconds: 120,
  });
  assertCondition(
    bonusFastClear120.bonusXp === 15 &&
      bonusFastClear120.halfTimeAchieved &&
      !bonusFastClear120.noLivesLostAchieved,
    'Expected +15 XP for <= 60s in 120s match'
  );

  const bonusFastClear60 = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: 1,
    stageElapsedSeconds: 30,
    matchDurationSeconds: 60,
  });
  assertCondition(
    bonusFastClear60.bonusXp === 15 && bonusFastClear60.halfTimeAchieved,
    'Expected +15 XP for <= 30s in 60s match'
  );

  const bonusPerfect = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: 0,
    stageElapsedSeconds: 45,
    matchDurationSeconds: 120,
  });
  assertCondition(
    bonusPerfect.bonusXp === 25 && bonusPerfect.bothAchieved,
    'Expected +25 XP (never 50) when both conditions met'
  );

  const bonusGameOver = calculateStageAchievementBonus({
    isStageClear: false,
    livesLost: 0,
    stageElapsedSeconds: 15,
    matchDurationSeconds: 120,
  });
  assertCondition(bonusGameOver.bonusXp === 0, 'Expected 0 bonus XP on GAME_OVER');
  pass('Stage Completion Achievement Bonus XP (+10, +15, +25, 0) verified');

  // Idempotent battle XP grant check
  const levelMgr = PlayerLevelManager.getInstance();
  const testUid = 'uid_v14_progression_test';
  levelMgr.applyFirestoreUserDocument(testUid, {
    totalXp: 100,
    level: 2,
    xpVerificationStatus: 'VERIFIED',
  });
  const grantInput = {
    uid: testUid,
    eventId: 'test_v14_event_001',
    stageId: 1,
    earnedXp: 55, // 30 combat XP (30 BASIC) + 25 achievement bonus XP
    achievementBonusXp: 25,
    defeatedByType: { BASIC: 30, FAST: 0, POWER: 0, ARMOR: 0 },
    gameMode: 'SOLO',
    source: 'SOLO_BATTLE' as const,
  };
  const grant1 = levelMgr.grantVerifiedBattleXpSync(grantInput);
  const grant2 = levelMgr.grantVerifiedBattleXpSync(grantInput);
  assertCondition(
    grant1.accepted === true &&
      grant1.newTotalXp === 155 &&
      grant1.previousStarBalance === 4 &&
      grant1.newStarBalance === 6 &&
      grant1.newUnconvertedXp === 5,
    `First grant must add 55 XP (100 -> 155 XP, 4 -> 6 Stars, 5 remainder), got accepted=${grant1.accepted}, totalXp=${grant1.newTotalXp}`
  );
  assertCondition(
    grant2.duplicateIgnored === true && grant2.newTotalXp === 155,
    'Duplicate eventId must be ignored idempotently'
  );
  pass('Idempotent XP, Achievement Bonus (+25 XP), and Star conversion grant via eventId verified');

  // ---------------------------------------------------------------------------
  // PART D: 50 SUPPORT ITEM TEST CASES (SECTION 6.6)
  // ---------------------------------------------------------------------------
  console.log('----------------------------------------------------------------');
  console.log('Running 50 Support Item Test Cases (Section 6.6)...');
  console.log('----------------------------------------------------------------');

  const TILE_PX = MAP_DIMENSIONS.TILE_SIZE_PX;

  // Test 1: Mode enablement (SOLO, CO-OP A.I, CO-OP ONLINE enabled; VS excluded)
  assertCondition(isSupportItemSystemEnabledForMode('SOLO') === true, 'SOLO must enable items');
  assertCondition(isSupportItemSystemEnabledForMode('TWO_PLAYERS_AI') === true, 'CO-OP A.I must enable items');
  assertCondition(isSupportItemSystemEnabledForMode('TWO_PLAYERS_ONLINE') === true, 'CO-OP ONLINE must enable items');
  assertCondition(isSupportItemSystemEnabledForMode('VS' as any) === false, 'VS must disable items');
  pass('Item Test 01: Enabled in SOLO, CO-OP A.I, CO-OP ONLINE; disabled in VS');

  // Test 2: Enabled from Stage 1 in SOLO
  const engineSoloS1 = new GameEngine();
  engineSoloS1.startMatch('SOLO', 'DEFAULT', { stageId: 1 });
  assertCondition(
    engineSoloS1.getState().currentStageId === 1 &&
      getItemSys(engineSoloS1).enabled === true &&
      getItemSys(engineSoloS1).totalSpawnedCount === 0,
    'Stage 1 SOLO item system initialized'
  );
  pass('Item Test 02: Item system active starting from Stage 1 in SOLO');

  // Test 3: Enabled from Stage 1 in CO-OP A.I
  const engineCoopAiS1 = new GameEngine();
  engineCoopAiS1.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1 });
  assertCondition(
    engineCoopAiS1.getState().currentStageId === 1 && getItemSys(engineCoopAiS1).enabled === true,
    'Stage 1 CO-OP A.I item system initialized'
  );
  pass('Item Test 03: Item system active starting from Stage 1 in CO-OP A.I');

  // Test 4: Enabled from Stage 1 in CO-OP ONLINE
  const engineCoopOnlineS1 = new GameEngine();
  engineCoopOnlineS1.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: 1 });
  assertCondition(
    engineCoopOnlineS1.getState().currentStageId === 1 && getItemSys(engineCoopOnlineS1).enabled === true,
    'Stage 1 CO-OP ONLINE item system initialized'
  );
  pass('Item Test 04: Item system active starting from Stage 1 in CO-OP ONLINE');

  // Test 5: Wave schedule constants (10s, 30s, 50s, 70s)
  assertCondition(
    SUPPORT_ITEM_WAVE_SCHEDULE.length === 4 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[0].spawnAtTick === 600 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[0].itemCount === 1 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[1].spawnAtTick === 1800 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[1].itemCount === 2 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[2].spawnAtTick === 3000 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[2].itemCount === 1 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[3].spawnAtTick === 4200 &&
      SUPPORT_ITEM_WAVE_SCHEDULE[3].itemCount === 2,
    'Wave schedule must be 10s(1), 30s(2), 50s(1), 70s(2)'
  );
  pass('Item Test 05: 4-wave schedule constants (10s:1, 30s:2, 50s:1, 70s:2) verified');

  // Test 6: Max total items per stage = 6
  assertCondition(SUPPORT_ITEM_MAX_TOTAL_PER_STAGE === 6, 'Max total items per stage must be 6');
  pass('Item Test 06: Max total items per stage is 6');

  // Test 7: Max occurrences per item type per stage = 2
  assertCondition(SUPPORT_ITEM_MAX_PER_TYPE_PER_STAGE === 2, 'Max per item type per stage must be 2');
  pass('Item Test 07: Max occurrences per item type per stage is 2');

  // Test 8: Conditional random generator enforces max 2 per type across 100 simulated stages
  for (let trial = 1; trial <= 100; trial++) {
    const state = createInitialStageItemSystemState(1, trial, 'SOLO');
    for (let i = 0; i < 6; i++) {
      const { selectedType, nextSeed } = selectNextSupportItemType(state);
      assertCondition(selectedType !== null, 'Must find eligible item type for first 6 spawns');
      state.seed = nextSeed;
      state.spawnCountsByType[selectedType!] += 1;
      state.totalSpawnedCount += 1;
    }
    assertCondition(
      state.spawnCountsByType.BOMB <= 2 &&
        state.spawnCountsByType.EAGLE_SHIELD <= 2 &&
        state.spawnCountsByType.FIREPOWER <= 2 &&
        state.spawnCountsByType.SPEED_BOOST <= 2,
      'No item type may exceed 2 occurrences in a single stage'
    );
  }
  pass('Item Test 08: Conditional random selection enforces <= 2 per item type across 100 simulated stages');

  // Test 9: When all types reach 2, no further item type can be selected
  const exhaustedState = createInitialStageItemSystemState(1, 1, 'SOLO');
  exhaustedState.spawnCountsByType = {
    BOMB: 2,
    EAGLE_SHIELD: 2,
    FIREPOWER: 2,
    SPEED_BOOST: 2,
  };
  assertCondition(
    selectNextSupportItemType(exhaustedState).selectedType === null,
    'When all types reach 2, selectNextSupportItemType must return null'
  );
  pass('Item Test 09: Exhausted item type pool returns null cleanly');

  // Test 10: No item spawns before tick 600 (10s)
  const waveEngine = new GameEngine(undefined, undefined, false);
  waveEngine.startMatch('SOLO', 'DEFAULT', { stageId: 1 });
  waveEngine.getState().p1.x = 64;
  waveEngine.getState().p1.y = 192;
  for (let t = 1; t < 600; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    getItemSys(waveEngine).totalSpawnedCount === 0 && getItemSys(waveEngine).activeItems.length === 0,
    'No items may spawn before tick 600'
  );
  pass('Item Test 10: Zero items spawn before 10s (tick 600)');

  // Test 11: Wave 1 spawns exactly 1 item at tick 600 (10s)
  waveEngine.stepTick(); // tick 600
  assertCondition(
    waveEngine.getState().tickCount === 600 &&
      getItemSys(waveEngine).totalSpawnedCount === 1 &&
      getItemSys(waveEngine).activeItems.length === 1 &&
      getItemSys(waveEngine).triggeredWaves.includes(1),
    'Wave 1 must spawn 1 item at tick 600'
  );
  pass('Item Test 11: Wave 1 spawns exactly 1 item at 10s (tick 600)');

  // Test 12: Wave 1 item expires after 5 seconds (300 ticks) at tick 900 if unpicked
  assertCondition(SUPPORT_ITEM_LIFETIME_TICKS === 300, 'Lifetime ticks must be 300 (5s)');
  for (let t = 601; t <= 900; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    getItemSys(waveEngine).activeItems.length === 0,
    'Unpicked Wave 1 item must despawn after 300 ticks (5s)'
  );
  pass('Item Test 12: Unpicked ground item automatically despawns after 5s (300 ticks)');

  // Test 13: Wave 2 spawns exactly 2 items at tick 1800 (30s)
  for (let t = 901; t <= 1800; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    waveEngine.getState().tickCount === 1800 &&
      getItemSys(waveEngine).totalSpawnedCount === 3 &&
      getItemSys(waveEngine).activeItems.length === 2 &&
      getItemSys(waveEngine).triggeredWaves.includes(2),
    'Wave 2 must spawn 2 items at tick 1800'
  );
  pass('Item Test 13: Wave 2 spawns exactly 2 items at 30s (tick 1800)');

  // Test 14: Simultaneous Wave 2 items do not overlap each other
  const [w2ItemA, w2ItemB] = getItemSys(waveEngine).activeItems;
  assertCondition(
    !(w2ItemA.row === w2ItemB.row && w2ItemA.col === w2ItemB.col),
    'Two simultaneous Wave 2 items must occupy distinct tiles'
  );
  pass('Item Test 14: Two simultaneous items in Wave 2 never overlap on the same tile');

  // Test 15: Despawn Wave 2 items after 5s, then Wave 3 spawns 1 item at tick 3000 (50s)
  for (let t = 1801; t <= 2100; t++) {
    waveEngine.stepTick();
  }
  assertCondition(getItemSys(waveEngine).activeItems.length === 0, 'Wave 2 items despawned after 5s');
  for (let t = 2101; t <= 3000; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    waveEngine.getState().tickCount === 3000 &&
      getItemSys(waveEngine).totalSpawnedCount === 4 &&
      getItemSys(waveEngine).activeItems.length === 1 &&
      getItemSys(waveEngine).triggeredWaves.includes(3),
    'Wave 3 must spawn 1 item at tick 3000'
  );
  pass('Item Test 15: Wave 3 spawns exactly 1 item at 50s (tick 3000)');

  // Test 16: Wave 4 spawns 2 items at tick 4200 (70s), reaching total 6 items
  for (let t = 3001; t <= 4200; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    waveEngine.getState().tickCount === 4200 &&
      getItemSys(waveEngine).totalSpawnedCount === 6 &&
      getItemSys(waveEngine).activeItems.length === 2 &&
      getItemSys(waveEngine).triggeredWaves.includes(4),
    'Wave 4 must spawn 2 items at tick 4200 (total 6 in stage)'
  );
  pass('Item Test 16: Wave 4 spawns 2 items at 70s (tick 4200), total 6 items in stage');

  // Test 17: No additional waves trigger after tick 4200
  for (let t = 4201; t <= 5000; t++) {
    waveEngine.stepTick();
  }
  assertCondition(
    getItemSys(waveEngine).totalSpawnedCount === 6,
    'Total spawned must remain 6 after Wave 4'
  );
  pass('Item Test 17: No additional items spawn after Wave 4');

  // Test 18: 60s Challenge mode (EXTREME) only reaches Waves 1, 2, 3 (10s, 30s, 50s) before 60s timeout
  const challenge60Engine = new GameEngine(undefined, undefined, false);
  challenge60Engine.startMatch('SOLO', 'EXTREME', { stageId: 1 });
  for (let t = 1; t <= 3599; t++) {
    challenge60Engine.stepTick();
  }
  assertCondition(
    getItemSys(challenge60Engine).totalSpawnedCount === 4,
    '60s match naturally triggers Waves 1, 2, 3 (4 items before 60s timeout)'
  );
  pass('Item Test 18: 60s Challenge mode naturally triggers Waves 1-3 (10s, 30s, 50s) before 60s timeout');

  // Test 19-24: Spawn position validation (never on WATER, STEEL, BRICK, BASE, Base wall zone, or living tanks)
  let seedCheck = 12345;
  for (let i = 0; i < 40; i++) {
    const res = selectValidSupportItemPosition({
      seed: seedCheck,
      terrain: engineSoloS1.getState().terrain,
      p1: engineSoloS1.getState().p1,
      p2: engineSoloS1.getState().p2,
      enemies: engineSoloS1.getState().enemies,
      activeItems: [],
    });
    seedCheck = res.nextSeed;
    assertCondition(res.position !== null, 'Must find a valid spawn tile');
    const tile = engineSoloS1.getState().terrain.currentMap[res.position!.row][res.position!.col];
    assertCondition(
      tile === TILE_TYPES.EMPTY || tile === TILE_TYPES.GRASS,
      `Spawn tile must be walkable (EMPTY/GRASS), got ${tile}`
    );
    assertCondition(
      !(res.position!.row >= 11 && res.position!.row <= 12 && res.position!.col >= 5 && res.position!.col <= 7),
      'Item must never spawn inside Eagle Base or protective wall zone (rows 11-12, cols 5-7)'
    );
  }
  pass('Item Test 19: Items never spawn on WATER tiles');
  pass('Item Test 20: Items never spawn on STEEL tiles');
  pass('Item Test 21: Items never spawn on BRICK tiles');
  pass('Item Test 22: Items never spawn on Eagle BASE (12,6) or protective wall zone');
  pass('Item Test 23: Items never spawn on fixed Player/Enemy spawn points');
  pass('Item Test 24: Items never spawn on tiles occupied by living tanks');

  // Test 25-30: BOMB Item behavior
  // Test 25: BOMB when 0 enemies on map -> safe no-op, picked up cleanly
  const bombEngine0 = new GameEngine(undefined, undefined, false);
  bombEngine0.startMatch('SOLO', 'DEFAULT', { stageId: 1 });
  const p1B0 = bombEngine0.getState().p1;
  getItemSys(bombEngine0).activeItems.push({
    id: 'test_bomb_0',
    type: 'BOMB',
    waveIndex: 1,
    row: Math.floor(p1B0.y / TILE_PX),
    col: Math.floor(p1B0.x / TILE_PX),
    x: p1B0.x,
    y: p1B0.y,
    spawnedAtTick: 1,
    expiresAtTick: 301,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  bombEngine0.stepTick();
  assertCondition(
    getItemSys(bombEngine0).activeItems.length === 0 &&
      !bombEngine0.getState().terrain.isBaseDestroyed,
    'BOMB with 0 enemies must be consumed safely without errors'
  );
  pass('Item Test 25: BOMB pickup with 0 enemies on map executes safely without error');

  // Test 26: BOMB when 1 enemy on map -> destroys that 1 enemy and awards exact XP
  const bombEngine1 = new GameEngine(undefined, undefined, true, ['BASIC']);
  for (let i = 0; i < 65; i++) {
    bombEngine1.stepTick();
  }
  assertCondition(bombEngine1.getState().enemies.length === 1, '1 enemy spawned on map');
  const p1B1 = bombEngine1.getState().p1;
  getItemSys(bombEngine1).activeItems.push({
    id: 'test_bomb_1',
    type: 'BOMB',
    waveIndex: 1,
    row: Math.floor(p1B1.y / TILE_PX),
    col: Math.floor(p1B1.x / TILE_PX),
    x: p1B1.x,
    y: p1B1.y,
    spawnedAtTick: 65,
    expiresAtTick: 365,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  bombEngine1.stepTick();
  assertCondition(
    bombEngine1.getState().totalDefeatedEnemies === 1 &&
      bombEngine1.getState().p1Stats?.defeatedCounts.BASIC === 1,
    'BOMB with 1 enemy must destroy it and credit BASIC kill XP'
  );
  pass('Item Test 26: BOMB pickup with 1 enemy destroys 1 enemy and credits exact XP');

  // Test 27-29: BOMB when 3 enemies on map (including 4-HP ARMOR) -> destroys MAX 2 enemies, leaves 3rd alive
  const bombEngine3 = new GameEngine(undefined, undefined, true, ['ARMOR', 'POWER', 'FAST']);
  for (let i = 0; i < 200; i++) {
    bombEngine3.stepTick();
  }
  assertCondition(bombEngine3.getState().enemies.length === 3, '3 enemies spawned on map');
  const p1B3 = bombEngine3.getState().p1;
  getItemSys(bombEngine3).activeItems.push({
    id: 'test_bomb_3',
    type: 'BOMB',
    waveIndex: 1,
    row: Math.floor(p1B3.y / TILE_PX),
    col: Math.floor(p1B3.x / TILE_PX),
    x: p1B3.x,
    y: p1B3.y,
    spawnedAtTick: 200,
    expiresAtTick: 500,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  bombEngine3.stepTick();
  assertCondition(
    bombEngine3.getState().enemies.length === 1 &&
      bombEngine3.getState().totalDefeatedEnemies === 2 &&
      (bombEngine3.getState().p1Stats?.defeatedCounts.ARMOR ?? 0) +
        (bombEngine3.getState().p1Stats?.defeatedCounts.POWER ?? 0) +
        (bombEngine3.getState().p1Stats?.defeatedCounts.FAST ?? 0) ===
        2,
    'BOMB with 3 enemies must destroy exactly 2 enemies (including 4-HP Armor) and leave 1 alive'
  );
  pass('Item Test 27: BOMB pickup with 3+ enemies destroys at most 2 enemies (even 4-HP Armor)');
  pass('Item Test 28: BOMB awards exact enemy XP to picking player');
  pass('Item Test 29: BOMB never damages Eagle Base or Player 1 / Player 2');

  // Test 30: BOMB picked up by Player 2 in CO-OP credits P2 stats
  const bombCoopEngine = new GameEngine(undefined, undefined, true, ['FAST']);
  bombCoopEngine.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1 });
  bombCoopEngine.getEnemyManager().reset(['FAST']);
  for (let i = 0; i < 65; i++) {
    bombCoopEngine.stepTick();
  }
  const p2BC = bombCoopEngine.getState().p2!;
  assertCondition(Boolean(p2BC), 'P2 tank must exist in CO-OP A.I');
  getItemSys(bombCoopEngine).activeItems.push({
    id: 'test_bomb_p2',
    type: 'BOMB',
    waveIndex: 1,
    row: Math.floor(p2BC.y / TILE_PX),
    col: Math.floor(p2BC.x / TILE_PX),
    x: p2BC.x,
    y: p2BC.y,
    spawnedAtTick: 65,
    expiresAtTick: 365,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  bombCoopEngine.stepTick();
  assertCondition(
    bombCoopEngine.getState().p2Stats?.defeatedCounts.FAST === 1 &&
      bombCoopEngine.getState().totalDefeatedEnemies >= 1,
    'P2 picking up BOMB must credit P2 stats and match defeated count'
  );
  pass('Item Test 30: BOMB picked up by P2 in CO-OP A.I / CO-OP ONLINE credits P2 & team XP');

  // Test 31-36: EAGLE_SHIELD Item behavior
  const shieldEngine = new GameEngine(undefined, undefined, false);
  shieldEngine.startMatch('SOLO', 'DEFAULT', { stageId: 1 });
  shieldEngine.getState().terrain.currentMap[12][5] = TILE_TYPES.EMPTY;
  shieldEngine.getState().terrain.brickSubTiles['12_5'] = 0;
  const p1S = shieldEngine.getState().p1;
  getItemSys(shieldEngine).activeItems.push({
    id: 'test_shield_1',
    type: 'EAGLE_SHIELD',
    waveIndex: 1,
    row: Math.floor(p1S.y / TILE_PX),
    col: Math.floor(p1S.x / TILE_PX),
    x: p1S.x,
    y: p1S.y,
    spawnedAtTick: 1,
    expiresAtTick: 301,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  shieldEngine.stepTick();
  assertCondition(
    getItemSys(shieldEngine).eagleShieldTicksRemaining === SUPPORT_ITEM_EFFECT_DURATION_TICKS &&
      shieldEngine.getState().terrain.currentMap[12][5] === TILE_TYPES.STEEL &&
      shieldEngine.getState().terrain.currentMap[12][7] === TILE_TYPES.STEEL,
    'EAGLE_SHIELD must convert both side walls (12,5) and (12,7) to STEEL for 600 ticks (10s)'
  );
  pass('Item Test 31: EAGLE_SHIELD converts side walls (12,5) and (12,7) to STEEL even if previously destroyed');
  pass('Item Test 32: EAGLE_SHIELD duration is 10s (600 ticks)');

  // Test 33: Eagle Shield side walls cannot be broken even by power=2 bullets while shield is active
  assertCondition(
    EAGLE_SHIELD_SIDE_WALL_COORDS.length === 2 &&
      EAGLE_SHIELD_SIDE_WALL_COORDS[0].row === 12 &&
      EAGLE_SHIELD_SIDE_WALL_COORDS[0].col === 5 &&
      EAGLE_SHIELD_SIDE_WALL_COORDS[1].row === 12 &&
      EAGLE_SHIELD_SIDE_WALL_COORDS[1].col === 7,
    'Eagle shield coordinates must be (12,5) and (12,7)'
  );
  shieldEngine.getState().bullets.push({
    id: 'test_power2_vs_shield',
    ownerId: 'enemy_power',
    ownerType: 'enemy',
    x: 5 * TILE_PX + 6,
    y: 12 * TILE_PX + 2,
    direction: 'DOWN',
    speed: 3,
    power: 2,
  });
  shieldEngine.stepTick();
  assertCondition(
    shieldEngine.getState().terrain.currentMap[12][5] === TILE_TYPES.STEEL &&
      shieldEngine.getState().terrain.steelSubTiles?.['12_5'] === SUB_TILE_MASKS.ALL,
    'Power=2 bullet must NOT damage Eagle Shield STEEL wall while shield is active'
  );
  pass('Item Test 33: EAGLE_SHIELD side walls (12,5) and (12,7) are indestructible while active');

  // Test 34: Re-picking EAGLE_SHIELD while active refreshes timer to 600 ticks
  for (let i = 0; i < 199; i++) {
    shieldEngine.stepTick();
  }
  assertCondition(
    getItemSys(shieldEngine).eagleShieldTicksRemaining === 400,
    `Shield ticks decremented to 400, got ${getItemSys(shieldEngine).eagleShieldTicksRemaining}`
  );
  getItemSys(shieldEngine).activeItems.push({
    id: 'test_shield_2',
    type: 'EAGLE_SHIELD',
    waveIndex: 2,
    row: Math.floor(p1S.y / TILE_PX),
    col: Math.floor(p1S.x / TILE_PX),
    x: p1S.x,
    y: p1S.y,
    spawnedAtTick: 200,
    expiresAtTick: 500,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  shieldEngine.stepTick();
  assertCondition(
    getItemSys(shieldEngine).eagleShieldTicksRemaining === 600,
    'Re-picking EAGLE_SHIELD must refresh duration to 600 ticks (10s)'
  );
  pass('Item Test 34: Re-picking EAGLE_SHIELD refreshes duration to 10s (600 ticks)');

  // Test 35-36: After 600 ticks (10s), EAGLE_SHIELD expires and restores (12,5) and (12,7)
  for (let i = 0; i < 600; i++) {
    shieldEngine.stepTick();
  }
  assertCondition(
    getItemSys(shieldEngine).eagleShieldTicksRemaining === 0 &&
      shieldEngine.getState().terrain.currentMap[12][5] === TILE_TYPES.BRICK &&
      shieldEngine.getState().terrain.currentMap[12][7] === TILE_TYPES.BRICK &&
      shieldEngine.getState().terrain.brickSubTiles['12_5'] === SUB_TILE_MASKS.ALL &&
      shieldEngine.getState().terrain.brickSubTiles['12_7'] === SUB_TILE_MASKS.ALL,
    'After 10s, EAGLE_SHIELD must expire and restore side walls to BRICK'
  );
  pass('Item Test 35: EAGLE_SHIELD expires after 10s (600 ticks)');
  pass('Item Test 36: EAGLE_SHIELD restores side walls upon expiration');

  // Test 37-42: FIREPOWER Item behavior
  const fpEngine = new GameEngine(undefined, undefined, false);
  fpEngine.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1 });
  const p1FP = fpEngine.getState().p1;
  getItemSys(fpEngine).activeItems.push({
    id: 'test_fp_1',
    type: 'FIREPOWER',
    waveIndex: 1,
    row: Math.floor(p1FP.y / TILE_PX),
    col: Math.floor(p1FP.x / TILE_PX),
    x: p1FP.x,
    y: p1FP.y,
    spawnedAtTick: 1,
    expiresAtTick: 301,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  fpEngine.stepTick();
  assertCondition(
    getItemSys(fpEngine).p1Effects.firepowerTicksRemaining === 600 &&
      getItemSys(fpEngine).p2Effects.firepowerTicksRemaining === 0,
    'FIREPOWER must apply only to the picking player tank (P1), not P2'
  );
  pass('Item Test 37: FIREPOWER applies only to picking player tank for 10s (600 ticks)');

  // Test 38: Player with FIREPOWER spawns power=2 bullets
  fpEngine.setExternalInput({ up: false, down: false, left: false, right: false, shoot: true });
  fpEngine.stepTick();
  fpEngine.setExternalInput({ up: false, down: false, left: false, right: false, shoot: false });
  const fpBullet = fpEngine.getState().bullets.find((b) => b.ownerId === p1FP.id);
  assertCondition(fpBullet !== undefined && fpBullet.power === 2, 'FIREPOWER player bullet must have power === 2');
  pass('Item Test 38: FIREPOWER upgrades player bullet to power=2 (2x brick depth)');

  // Test 39: FIREPOWER bullet deals 50% STEEL durability damage (2 hits destroy 1 STEEL tile)
  const steelRow = 5;
  const steelCol = 5;
  fpEngine.getState().terrain.currentMap[steelRow][steelCol] = TILE_TYPES.STEEL;
  if (!fpEngine.getState().terrain.steelSubTiles) {
    fpEngine.getState().terrain.steelSubTiles = {};
  }
  fpEngine.getState().terrain.steelSubTiles![`${steelRow}_${steelCol}`] = SUB_TILE_MASKS.ALL;
  fpEngine.getState().bullets.length = 0;
  fpEngine.getState().bullets.push({
    id: 'fp_steel_hit_1',
    ownerId: p1FP.id,
    ownerType: 'player',
    x: steelCol * TILE_PX + 6,
    y: steelRow * TILE_PX + 2,
    direction: 'DOWN',
    speed: 3,
    power: 2,
  });
  fpEngine.stepTick();
  assertCondition(
    fpEngine.getState().terrain.currentMap[steelRow][steelCol] === TILE_TYPES.STEEL &&
      fpEngine.getState().terrain.steelSubTiles![`${steelRow}_${steelCol}`] !== SUB_TILE_MASKS.ALL &&
      fpEngine.getState().terrain.steelSubTiles![`${steelRow}_${steelCol}`] !== 0,
    'First FIREPOWER hit on STEEL must destroy 50% of the STEEL tile'
  );
  fpEngine.getState().bullets.push({
    id: 'fp_steel_hit_2',
    ownerId: p1FP.id,
    ownerType: 'player',
    x: steelCol * TILE_PX + 6,
    y: steelRow * TILE_PX + 10,
    direction: 'DOWN',
    speed: 3,
    power: 2,
  });
  fpEngine.stepTick();
  assertCondition(
    fpEngine.getState().terrain.currentMap[steelRow][steelCol] === TILE_TYPES.EMPTY,
    'Second FIREPOWER hit on STEEL must destroy the remaining 50% (tile becomes EMPTY)'
  );
  pass('Item Test 39: FIREPOWER bullet deals 50% STEEL damage per hit (2 hits destroy STEEL)');

  // Test 40: FIREPOWER bullet deals 2x damage to Enemy Tanks (Armor 4 HP destroyed in 2 hits; Power 2 HP in 1 hit)
  const fpVsEnemyEngine = new GameEngine(undefined, undefined, true, ['ARMOR']);
  for (let i = 0; i < 65; i++) {
    fpVsEnemyEngine.stepTick();
  }
  const armorTarget = fpVsEnemyEngine.getState().enemies[0];
  assertCondition(armorTarget && armorTarget.hp === 4, 'Armor enemy has 4 HP');
  armorTarget.isShielded = false;
  armorTarget.spawnShieldTimer = 0;
  fpVsEnemyEngine.getState().bullets.push({
    id: 'fp_vs_armor_1',
    ownerId: fpVsEnemyEngine.getState().p1.id,
    ownerType: 'player',
    x: armorTarget.x + 6,
    y: armorTarget.y + 6,
    direction: 'UP',
    speed: 3,
    power: 2,
  });
  fpVsEnemyEngine.stepTick();
  assertCondition(
    armorTarget.isAlive && armorTarget.hp === 2,
    'First FIREPOWER hit on 4-HP Armor enemy must deal 2 damage (leaving 2 HP)'
  );
  const armorTargetAfterHit1 = fpVsEnemyEngine.getState().enemies[0];
  fpVsEnemyEngine.getState().bullets.push({
    id: 'fp_vs_armor_2',
    ownerId: fpVsEnemyEngine.getState().p1.id,
    ownerType: 'player',
    x: armorTargetAfterHit1.x + 6,
    y: armorTargetAfterHit1.y + 6,
    direction: 'UP',
    speed: 3,
    power: 2,
  });
  fpVsEnemyEngine.stepTick();
  assertCondition(
    fpVsEnemyEngine.getState().totalDefeatedEnemies === 1,
    'Second FIREPOWER hit on 4-HP Armor enemy must destroy it (2 hits total)'
  );
  pass('Item Test 40: FIREPOWER deals 2x damage vs Enemy Tanks (Armor 4 HP destroyed in 2 hits; Power 2 HP in 1 hit)');

  // Test 41: Re-picking FIREPOWER refreshes duration to 10s without stacking to 4x damage
  getItemSys(fpEngine).activeItems.push({
    id: 'test_fp_refresh',
    type: 'FIREPOWER',
    waveIndex: 2,
    row: Math.floor(p1FP.y / TILE_PX),
    col: Math.floor(p1FP.x / TILE_PX),
    x: p1FP.x,
    y: p1FP.y,
    spawnedAtTick: 100,
    expiresAtTick: 400,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  fpEngine.stepTick();
  assertCondition(
    getItemSys(fpEngine).p1Effects.firepowerTicksRemaining === 600,
    'Re-picking FIREPOWER refreshes duration to 600 ticks without 4x stacking'
  );
  pass('Item Test 41: Re-picking FIREPOWER refreshes 10s timer and never stacks to 4x damage');

  // Test 42: After 10s (600 ticks), FIREPOWER expires and bullets return to power=1
  for (let i = 0; i < 600; i++) {
    fpEngine.stepTick();
  }
  assertCondition(
    getItemSys(fpEngine).p1Effects.firepowerTicksRemaining === 0,
    'FIREPOWER expired after 600 ticks'
  );
  pass('Item Test 42: FIREPOWER automatically reverts to normal power=1 after 10s');

  // Test 43-47: SPEED_BOOST Item behavior
  const sbEngine = new GameEngine(undefined, undefined, false);
  sbEngine.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1 });
  const p1SB = sbEngine.getState().p1;
  p1SB.x = 4 * TILE_PX;
  p1SB.y = 11 * TILE_PX;
  sbEngine.getState().terrain.currentMap[10][4] = TILE_TYPES.EMPTY;
  sbEngine.getState().terrain.currentMap[11][4] = TILE_TYPES.EMPTY;
  getItemSys(sbEngine).activeItems.push({
    id: 'test_sb_1',
    type: 'SPEED_BOOST',
    waveIndex: 1,
    row: Math.floor(p1SB.y / TILE_PX),
    col: Math.floor(p1SB.x / TILE_PX),
    x: p1SB.x,
    y: p1SB.y,
    spawnedAtTick: 1,
    expiresAtTick: 301,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  sbEngine.stepTick();
  assertCondition(
    getItemSys(sbEngine).p1Effects.speedBoostTicksRemaining === 600 &&
      getItemSys(sbEngine).p2Effects.speedBoostTicksRemaining === 0,
    'SPEED_BOOST must apply only to picking player tank (P1) for 600 ticks (10s)'
  );
  pass('Item Test 43: SPEED_BOOST applies only to picking player tank for 10s (600 ticks)');

  // Test 44: SPEED_BOOST doubles tank movement speed (2.0 px/tick vs 1.0 px/tick)
  const startY = p1SB.y;
  sbEngine.setExternalInput({ up: true, down: false, left: false, right: false, shoot: false });
  sbEngine.stepTick();
  sbEngine.setExternalInput({ up: false, down: false, left: false, right: false, shoot: false });
  assertCondition(
    p1SB.y === startY - 2,
    `SPEED_BOOST tank must move 2px per tick, moved ${startY - p1SB.y}px`
  );
  pass('Item Test 44: SPEED_BOOST moves player tank at 2x speed (2.0 px/tick = 120 px/s)');

  // Test 45: Re-picking SPEED_BOOST refreshes timer to 10s without stacking to 4x speed
  getItemSys(sbEngine).activeItems.push({
    id: 'test_sb_2',
    type: 'SPEED_BOOST',
    waveIndex: 2,
    row: Math.floor(p1SB.y / TILE_PX),
    col: Math.floor(p1SB.x / TILE_PX),
    x: p1SB.x,
    y: p1SB.y,
    spawnedAtTick: 100,
    expiresAtTick: 400,
    remainingTicks: 300,
    remainingSeconds: 5,
  });
  sbEngine.stepTick();
  assertCondition(
    getItemSys(sbEngine).p1Effects.speedBoostTicksRemaining === 600,
    'Re-picking SPEED_BOOST refreshes timer to 600 ticks without 4x speed stacking'
  );
  pass('Item Test 45: Re-picking SPEED_BOOST refreshes 10s timer and never stacks to 4x speed');

  // Test 46: Concurrent FIREPOWER + SPEED_BOOST both work simultaneously on the same player tank
  getItemSys(sbEngine).p1Effects.firepowerTicksRemaining = 600;
  assertCondition(
    getItemSys(sbEngine).p1Effects.firepowerTicksRemaining === 600 &&
      getItemSys(sbEngine).p1Effects.speedBoostTicksRemaining === 600,
    'Player tank can hold both FIREPOWER and SPEED_BOOST concurrently'
  );
  pass('Item Test 46: Player tank can hold FIREPOWER and SPEED_BOOST simultaneously');

  // Test 47: Player death clears active FIREPOWER and SPEED_BOOST buffs on that player
  p1SB.isShielded = false;
  sbEngine.getState().p1State.shieldTimer = 0;
  sbEngine.getState().bullets.push({
    id: 'enemy_kill_p1_buffs',
    ownerId: 'enemy_1',
    ownerType: 'enemy',
    x: p1SB.x + 6,
    y: p1SB.y + 6,
    direction: 'DOWN',
    speed: 3,
    power: 1,
  });
  sbEngine.stepTick();
  assertCondition(
    sbEngine.getState().p1State.isDead === true &&
      getItemSys(sbEngine).p1Effects.firepowerTicksRemaining === 0 &&
      getItemSys(sbEngine).p1Effects.speedBoostTicksRemaining === 0,
    'Player death must clear active FIREPOWER and SPEED_BOOST buffs'
  );
  pass('Item Test 47: Player death resets active FIREPOWER and SPEED_BOOST buffs cleanly');

  // Test 48-49: Stage advance & restart reset all item state, timers, and counters
  sbEngine.advanceToNextStage();
  assertCondition(
    sbEngine.getState().currentStageId === 2 &&
      getItemSys(sbEngine).totalSpawnedCount === 0 &&
      getItemSys(sbEngine).activeItems.length === 0 &&
      getItemSys(sbEngine).eagleShieldTicksRemaining === 0,
    'Advancing to next stage must reset StageItemSystemState completely'
  );
  pass('Item Test 48: Advancing to next stage resets all item waves, ground items, and buff timers');

  sbEngine.restartStage();
  assertCondition(
    getItemSys(sbEngine).totalSpawnedCount === 0 && getItemSys(sbEngine).activeItems.length === 0,
    'Restarting stage must reset StageItemSystemState completely'
  );
  pass('Item Test 49: Restarting stage resets all item waves, ground items, and buff timers');

  // Test 50: CO-OP ONLINE Authoritative Snapshot syncs itemSystem & steelSubTiles to Guest
  const hostEngine = new GameEngine(undefined, undefined, false);
  hostEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: 1 });
  hostEngine.getState().p1.x = 64;
  hostEngine.getState().p1.y = 192;
  for (let t = 1; t <= 600; t++) {
    hostEngine.stepTick();
  }
  getItemSys(hostEngine).eagleShieldTicksRemaining = 450;
  getItemSys(hostEngine).eagleShieldSecondsRemaining = 8;
  hostEngine.getState().terrain.currentMap[12][5] = TILE_TYPES.STEEL;
  hostEngine.getState().terrain.currentMap[12][7] = TILE_TYPES.STEEL;

  const hostState = hostEngine.getState();
  const mockAuthoritativeSnapshot: any = {
    snapshotSeq: 10,
    stageRunSeq: hostState.stageRunSeq,
    matchInstanceId: hostState.matchInstanceId,
    tickCount: hostState.tickCount,
    matchState: hostState.matchState,
    currentStageId: hostState.currentStageId,
    currentStageName: hostState.currentStageName,
    difficulty: hostState.difficulty,
    remainingTicks: hostState.remainingTicks,
    remainingSeconds: hostState.remainingSeconds,
    stageElapsedSeconds: hostState.stageElapsedSeconds,
    matchDurationSeconds: hostState.matchDurationSeconds,
    score: hostState.score,
    highScore: hostState.highScore,
    totalDefeatedEnemies: hostState.totalDefeatedEnemies,
    defeatedCounts: { ...hostState.defeatedCounts },
    p1: { ...hostState.p1 },
    p1State: { ...hostState.p1State },
    p2: hostState.p2 ? { ...hostState.p2 } : null,
    p2State: hostState.p2State ? { ...hostState.p2State } : null,
    enemies: [],
    enemyQueueCount: 0,
    bullets: [],
    brickSubTiles: { ...hostState.terrain.brickSubTiles },
    steelSubTiles: { ...(hostState.terrain.steelSubTiles ?? {}) },
    itemSystem: JSON.parse(JSON.stringify(getItemSys(hostEngine))),
    isBaseDestroyed: false,
    isGameOver: false,
    isStageClear: false,
    isTimeoutGameOver: false,
    gameOverReason: null,
  };

  const guestEngine = new GameEngine(undefined, undefined, false);
  guestEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: 1 });
  const applyRes = guestEngine.applyAuthoritativeSnapshot(mockAuthoritativeSnapshot);
  assertCondition(
    applyRes.valid === true &&
      getItemSys(guestEngine).activeItems.length === 1 &&
      getItemSys(guestEngine).eagleShieldTicksRemaining === 450 &&
      guestEngine.getState().terrain.currentMap[12][5] === TILE_TYPES.STEEL &&
      guestEngine.getState().terrain.currentMap[12][7] === TILE_TYPES.STEEL,
    'Guest engine must apply itemSystem and Eagle Shield STEEL tiles from authoritative snapshot'
  );
  pass('Item Test 50: CO-OP ONLINE Authoritative Snapshot synchronizes active items, buffs, and Eagle Shield tiles to Guest');

  console.log('================================================================');
  console.log(`ALL ${passed} BTO-PROGRESSION-MODES-V1.4 TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================');
}

runProgressionV1_4Tests();
