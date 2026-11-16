/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  CAMPAIGN_STAGE_SPECS,
  TOTAL_CAMPAIGN_STAGES,
  countEnemyQueueTypes,
  getCampaignStageSpec,
} from './campaignStages.ts';
import {
  ENEMY_CONFIG,
  P1_CONFIG,
  STAGE_1_MAP,
  MATCH_TIMER_CONFIG,
} from './constants.ts';
import { validateStageMap, STAGE_SPAWN_POINTS } from './mapValidator.ts';
import { StageManager, areStageMapsEqual, cloneStageMap } from './stageManager.ts';
import { StageProgressionManager, type StageClearProof } from './stageProgression.ts';
import { GameEngine } from './gameEngine.ts';
import {
  CoopOnlineManager,
  InMemoryCoopStorageAdapter,
  createInMemoryP2PChannelPair,
  buildAuthoritativeSnapshot,
} from './coopOnlineManager.ts';
import { TILE_TYPES } from './types.ts';
import { checkHitboxVsTerrain, getTankHitbox } from './physics.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { findPathAStar, findPathWithBrickBreachAStar } from './ai/pathfinding.ts';

export interface M74TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
  expected?: string;
  actual?: string;
}

const ALLOWED_TILE_CODES = new Set<number>([
  TILE_TYPES.EMPTY,
  TILE_TYPES.BRICK,
  TILE_TYPES.STEEL,
  TILE_TYPES.WATER,
  TILE_TYPES.GRASS,
  TILE_TYPES.ICE,
  TILE_TYPES.BASE,
]);

const EXPECTED_STAGE_NAMES: Record<number, string> = {
  1: 'Stage 1',
  2: 'Stage 2',
  3: 'Stage 3',
  4: 'Stage 4',
  5: 'Stage 5',
  6: 'Stage 6',
  7: 'Stage 7',
  8: 'Stage 8',
  9: 'Stage 9',
  10: 'Stage 10',
};

const EXPECTED_COMPOSITIONS: Record<
  number,
  { BASIC: number; FAST: number; POWER: number; ARMOR: number }
> = {
  1: { BASIC: 15, FAST: 7, POWER: 5, ARMOR: 3 },
  2: { BASIC: 13, FAST: 7, POWER: 6, ARMOR: 4 },
  3: { BASIC: 12, FAST: 7, POWER: 6, ARMOR: 5 },
  4: { BASIC: 10, FAST: 8, POWER: 7, ARMOR: 5 },
  5: { BASIC: 9, FAST: 8, POWER: 7, ARMOR: 6 },
  6: { BASIC: 8, FAST: 8, POWER: 8, ARMOR: 6 },
  7: { BASIC: 7, FAST: 8, POWER: 8, ARMOR: 7 },
  8: { BASIC: 6, FAST: 8, POWER: 9, ARMOR: 7 },
  9: { BASIC: 5, FAST: 8, POWER: 9, ARMOR: 8 },
  10: { BASIC: 4, FAST: 8, POWER: 10, ARMOR: 8 },
};

const IDLE_INPUT = { up: false, down: false, left: false, right: false, shoot: false };

function clearAllEnemiesAndWinStage(engine: GameEngine): void {
  const internal = engine as any;
  internal.state.totalDefeatedEnemies = ENEMY_CONFIG.TOTAL_COUNT;
  internal.state.enemies = [];
  internal.state.enemyQueue = [];
  if (internal.enemyManager && typeof internal.enemyManager.reset === 'function') {
    internal.enemyManager.reset([]);
  }
  engine.stepTick(IDLE_INPUT);
}

export function runAllM7_4Tests(): {
  total: number;
  passed: number;
  failed: number;
  results: M74TestResult[];
} {
  const results: M74TestResult[] = [];
  const stageMgr = StageManager.getInstance();
  const progMgr = StageProgressionManager.getInstance();

  stageMgr.resetForTesting({ seedCampaignStages: true });
  progMgr.resetForTesting();

  // =========================================================================
  // M7_4_T1: Stage 1-10 Maps, Spawn Rules, Base Protection & Validator Gate
  // =========================================================================
  {
    const allStages = stageMgr.getAllStages();
    const stage1 = stageMgr.getStage(1);
    const stage1Unchanged = Boolean(stage1 && areStageMapsEqual(stage1.map, STAGE_1_MAP));

    const mapChecks: string[] = [];
    let all10MapsValid = allStages.length === TOTAL_CAMPAIGN_STAGES && CAMPAIGN_STAGE_SPECS.length === 10;

    for (let id = 1; id <= TOTAL_CAMPAIGN_STAGES; id++) {
      const spec = getCampaignStageSpec(id);
      const managed = stageMgr.getStage(id);
      if (!managed) {
        all10MapsValid = false;
        mapChecks.push(`Missing stage ${id}`);
        continue;
      }
      const expectedName = EXPECTED_STAGE_NAMES[id];
      const managedNameOk =
        managed.name === expectedName ||
        (id === 1 && managed.name === 'KHỞI ĐẦU');
      if (spec.name !== expectedName || !managedNameOk) {
        all10MapsValid = false;
        mapChecks.push(`Stage ${id} name mismatch`);
      }
      if (spec.map.length !== 13 || spec.map.some((r) => r.length !== 13)) {
        all10MapsValid = false;
        mapChecks.push(`Stage ${id} non-13x13`);
      }
      let baseCount = 0;
      for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
          const t = spec.map[r][c];
          if (!ALLOWED_TILE_CODES.has(t)) {
            all10MapsValid = false;
            mapChecks.push(`Stage ${id} invalid tile ${t} at [${r},${c}]`);
          }
          if (t === TILE_TYPES.BASE) baseCount++;
        }
      }
      if (
        baseCount !== 1 ||
        spec.map[12][6] !== TILE_TYPES.BASE ||
        spec.map[12][5] !== TILE_TYPES.BRICK ||
        spec.map[12][7] !== TILE_TYPES.BRICK
      ) {
        all10MapsValid = false;
        mapChecks.push(`Stage ${id} BASE/BRICK protection failed`);
      }
      for (const sp of STAGE_SPAWN_POINTS) {
        if (spec.map[sp.row][sp.col] !== TILE_TYPES.EMPTY) {
          all10MapsValid = false;
          mapChecks.push(`Stage ${id} spawn ${sp.label} not empty`);
        }
      }
      const val = validateStageMap(spec.map);
      if (!val.isValid) {
        all10MapsValid = false;
        mapChecks.push(`Stage ${id} validateStageMap error: ${val.errors.join('; ')}`);
      }
    }

    // Negative validator checks (walled-off STEEL / WATER / missing BASE / blocked spawn)
    const steelWallMap = cloneStageMap(STAGE_1_MAP);
    for (let c = 0; c < 13; c++) steelWallMap[3][c] = TILE_TYPES.STEEL;
    const steelWallCheck = validateStageMap(steelWallMap);

    const waterWallMap = cloneStageMap(STAGE_1_MAP);
    for (let c = 0; c < 13; c++) waterWallMap[4][c] = TILE_TYPES.WATER;
    const waterWallCheck = validateStageMap(waterWallMap);

    const missingBaseMap = cloneStageMap(STAGE_1_MAP);
    missingBaseMap[12][6] = TILE_TYPES.EMPTY;
    const missingBaseCheck = validateStageMap(missingBaseMap);

    const blockedP1Map = cloneStageMap(STAGE_1_MAP);
    blockedP1Map[12][3] = TILE_TYPES.STEEL;
    const blockedP1Check = validateStageMap(blockedP1Map);

    const negativePass =
      !steelWallCheck.isValid &&
      !waterWallCheck.isValid &&
      !missingBaseCheck.isValid &&
      !blockedP1Check.isValid;

    const passed = stage1Unchanged && all10MapsValid && negativePass;
    results.push({
      id: 'M7_4_T1',
      name: 'T1: Kiểm tra 10 bản đồ Stage 1–10 (Stage 1 giữ nguyên, 13×13, 7 tile, BASE/Spawn/BFS, chặn map lỗi)',
      passed,
      details: `stage1Unchanged=${stage1Unchanged}, all10Valid=${all10MapsValid} (${mapChecks.join(',') || 'OK'}), negativeValidatorBlocked=${negativePass}`,
    });
  }

  // =========================================================================
  // M7_4_T2: Enemy Compositions (30 each) & Unchanged Gameplay Specs / Physics
  // =========================================================================
  {
    let compositionsOk = true;
    const compErrors: string[] = [];

    for (let id = 1; id <= TOTAL_CAMPAIGN_STAGES; id++) {
      const spec = getCampaignStageSpec(id);
      const counts = countEnemyQueueTypes(spec.enemyQueue);
      const exp = EXPECTED_COMPOSITIONS[id];
      const sum = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
      if (
        spec.enemyQueue.length !== ENEMY_CONFIG.TOTAL_COUNT ||
        sum !== 30 ||
        counts.BASIC !== exp.BASIC ||
        counts.FAST !== exp.FAST ||
        counts.POWER !== exp.POWER ||
        counts.ARMOR !== exp.ARMOR
      ) {
        compositionsOk = false;
        compErrors.push(`Stage ${id}: got ${JSON.stringify(counts)}, expected ${JSON.stringify(exp)}`);
      }
    }

    const specsUnchanged =
      ENEMY_CONFIG.TOTAL_COUNT === 30 &&
      ENEMY_CONFIG.MAX_ACTIVE === 5 &&
      ENEMY_CONFIG.SPECS.BASIC.hp === 1 &&
      ENEMY_CONFIG.SPECS.BASIC.score === 1 &&
      ENEMY_CONFIG.SPECS.FAST.score === 2 &&
      ENEMY_CONFIG.SPECS.POWER.score === 3 &&
      ENEMY_CONFIG.SPECS.ARMOR.hp === 4 &&
      ENEMY_CONFIG.SPECS.ARMOR.score === 5 &&
      P1_CONFIG.SPAWN_X === 48 &&
      P1_CONFIG.SPAWN_Y === 192;

    // Terrain physics unchanged: WATER blocks tank, ICE does not block tank
    const iceMap = cloneStageMap(STAGE_1_MAP);
    iceMap[6][6] = TILE_TYPES.ICE;
    iceMap[6][7] = TILE_TYPES.WATER;
    const runtimeIceTerrain = createRuntimeTerrainState(iceMap);
    const iceBlocked = checkHitboxVsTerrain(
      getTankHitbox(6 * 16, 6 * 16),
      runtimeIceTerrain,
      { forBullet: false }
    ).collides;
    const waterBlocked = checkHitboxVsTerrain(
      getTankHitbox(7 * 16, 6 * 16),
      runtimeIceTerrain,
      { forBullet: false }
    ).collides;

    const passed = compositionsOk && specsUnchanged && !iceBlocked && waterBlocked;
    results.push({
      id: 'M7_4_T2',
      name: 'T2: Đúng cấu hình 30 xe địch Stage 1–10 (Basic/Fast/Power/Armor) & giữ nguyên thông số/vật lý WATER/ICE',
      passed,
      details: `compositionsOk=${compositionsOk} (${compErrors.join(';') || 'OK'}), specsUnchanged=${specsUnchanged}, icePassable=${!iceBlocked}, waterBlocked=${waterBlocked}`,
    });
  }

  // =========================================================================
  // M7_4_T3: Solo Progression Stage 1 -> 10 Full Campaign & Fail Preservation
  // =========================================================================
  {
    const uid = 'uid_solo_campaign_tester';
    progMgr.resetForTesting(uid);
    const engine = new GameEngine(undefined, undefined, true);
    const startS1 = engine.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid,
      isTrialMode: false,
      enforceProgression: true,
    });

    let chainOk = startS1.success && engine.getState().currentStageId === 1;
    let prevRunSeq = engine.getState().stageRunSeq;

    for (let s = 1; s <= TOTAL_CAMPAIGN_STAGES; s++) {
      if (engine.getState().currentStageId !== s) {
        chainOk = false;
        break;
      }
      clearAllEnemiesAndWinStage(engine);
      const stAfterClear = engine.getState();
      if (!stAfterClear.isStageClear || stAfterClear.matchState !== 'STAGE_CLEAR') {
        chainOk = false;
        break;
      }
      const snap = progMgr.getUserStageProgressSnapshot(uid);
      const expectedUnlocked = Math.min(TOTAL_CAMPAIGN_STAGES, s + 1);
      if (snap.unlockedStage !== expectedUnlocked || !snap.completedStages.includes(s)) {
        chainOk = false;
        break;
      }

      const adv = engine.advanceToNextStage();
      if (s < TOTAL_CAMPAIGN_STAGES) {
        if (!adv) {
          chainOk = false;
          break;
        }
        const stNext = engine.getState();
        const nextSpec = getCampaignStageSpec(s + 1);
        const totalQueueNext = stNext.enemies.length + stNext.enemyQueue.length;
        if (
          stNext.currentStageId !== s + 1 ||
          stNext.currentStageName !== nextSpec.name ||
          stNext.stageRunSeq !== prevRunSeq + 1 ||
          stNext.totalDefeatedEnemies !== 0 ||
          stNext.bullets.length !== 0 ||
          stNext.isStageClear ||
          stNext.isGameOver ||
          totalQueueNext !== 30 ||
          !areStageMapsEqual(stNext.terrain.currentMap, nextSpec.map)
        ) {
          chainOk = false;
          break;
        }
        prevRunSeq = stNext.stageRunSeq;
      } else {
        // After Stage 10, advanceToNextStage must return false
        if (adv) {
          chainOk = false;
          break;
        }
      }
    }

    // Fail preservation test on another user at Stage 2
    const uidFail = 'uid_fail_preserve';
    progMgr.resetForTesting(uidFail);
    const failEngine = new GameEngine(undefined, undefined, true);
    failEngine.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid: uidFail,
      isTrialMode: false,
      enforceProgression: true,
    });
    clearAllEnemiesAndWinStage(failEngine);
    failEngine.advanceToNextStage(); // Now at Stage 2, unlockedStage === 2
    (failEngine as any).state.terrain.isBaseDestroyed = true;
    failEngine.stepTick(IDLE_INPUT);
    const snapAfterFail = progMgr.getUserStageProgressSnapshot(uidFail);
    const failPreserved =
      failEngine.getState().isGameOver &&
      snapAfterFail.unlockedStage === 2 &&
      !snapAfterFail.completedStages.includes(2);

    // Replay earlier Stage (Stage 3) keeps unlockedStage === 10
    const replayRes = engine.startMatch('SOLO', 'DEFAULT', {
      stageId: 3,
      uid,
      isTrialMode: false,
      enforceProgression: true,
    });
    const replayOk =
      replayRes.success &&
      engine.getState().currentStageId === 3 &&
      progMgr.getUserStageProgressSnapshot(uid).unlockedStage === 10;

    const finalSnap = progMgr.getUserStageProgressSnapshot(uid);
    const passed =
      chainOk &&
      finalSnap.unlockedStage === 10 &&
      finalSnap.completedStages.length === 10 &&
      failPreserved &&
      replayOk;

    results.push({
      id: 'M7_4_T3',
      name: 'T3: Chiến dịch Solo Stage 1 → Stage 10 liên hoàn, làm mới map/30 địch sạch sẽ, thua không mở khóa sai & chơi lại Stage cũ',
      passed,
      details: `chainOk=${chainOk}, unlocked=${finalSnap.unlockedStage}, completedCount=${finalSnap.completedStages.length}, failPreserved=${failPreserved}, replayOk=${replayOk}`,
    });
  }

  // =========================================================================
  // M7_4_T4: Co-op AI & Co-op Online Stage 1-10 Selection + Host->Guest Sync
  // =========================================================================
  {
    const hostUid = 'uid_coop_host_m74';
    const guestUid = 'uid_coop_guest_m74';
    progMgr.resetForTesting(hostUid);
    progMgr.resetForTesting(guestUid);

    // Unlock host up to Stage 6
    const unlockEngine = new GameEngine(undefined, undefined, true);
    unlockEngine.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid: hostUid,
      isTrialMode: false,
      enforceProgression: true,
    });
    for (let s = 1; s <= 5; s++) {
      clearAllEnemiesAndWinStage(unlockEngine);
      unlockEngine.advanceToNextStage();
    }

    // Co-op AI directly on Stage 4
    const coopAiEngine = new GameEngine(undefined, undefined, true);
    const aiStart = coopAiEngine.startMatch('TWO_PLAYERS_AI', 'DEFAULT', {
      stageId: 4,
      uid: hostUid,
      isTrialMode: false,
      enforceProgression: true,
    });
    const aiState = coopAiEngine.getState();
    const coopAiOk =
      aiStart.success &&
      aiState.currentStageId === 4 &&
      aiState.p1.x === P1_CONFIG.SPAWN_X &&
      aiState.p1.y === P1_CONFIG.SPAWN_Y &&
      Boolean(aiState.p2 && aiState.p2.x === 144 && aiState.p2.y === 192) &&
      areStageMapsEqual(aiState.terrain.currentMap, getCampaignStageSpec(4).map);

    // Co-op Online Host & Guest Stage sync
    const storage = new InMemoryCoopStorageAdapter();
    const hostMgr = new CoopOnlineManager(storage);
    const guestMgr = new CoopOnlineManager(storage);
    const t0 = 1_765_000_000_000;
    const pair = createInMemoryP2PChannelPair(
      (msg) => hostMgr.handleIncomingDataChannelMessage(msg, t0 + 35),
      (msg) => guestMgr.handleIncomingDataChannelMessage(msg, t0 + 35)
    );

    // Host creating room on locked Stage 8 must fail
    const lockedRoomCreate = hostMgr.createRoomSync(
      storage,
      { uid: hostUid, displayName: 'HostP1', email: 'hostp1@gmail.com', emailVerified: true },
      'DEFAULT',
      t0,
      'BT8801',
      { hasPassword: false, stageId: 8 }
    );

    const createOk = hostMgr.createRoomSync(
      storage,
      { uid: hostUid, displayName: 'HostP1', email: 'hostp1@gmail.com', emailVerified: true },
      'DEFAULT',
      t0 + 10,
      'BT8802',
      { hasPassword: false, stageId: 4 }
    );
    const joinOk = guestMgr.joinRoomSync(
      storage,
      'BT8802',
      { uid: guestUid, displayName: 'GuestP2', email: 'guestp2@gmail.com' },
      t0 + 20
    );

    hostMgr.attachCustomP2PChannel(pair.hostChannel, t0 + 30);
    guestMgr.attachCustomP2PChannel(pair.guestChannel, t0 + 30);
    hostMgr.setPlayerReadySync(storage, true, t0 + 40);
    guestMgr.setPlayerReadySync(storage, true, t0 + 45);
    storage.setRoomSync('BT8802', {
      ...storage.getRoomSync('BT8802')!,
      rtcConnectionState: 'CONNECTED',
    });

    // Host switches lobby stage from 4 -> 6, verify Guest receives LOBBY_STAGE_SELECTED
    const stageSwitchRes = hostMgr.setRoomStage(6, hostUid, t0 + 50);
    const guestSyncedLobbyStage = guestMgr.getCurrentRoom()?.selectedStageId === 6;

    // Host locked switch to Stage 7 must fail
    const lockedSwitchRes = hostMgr.setRoomStage(7, hostUid, t0 + 55);

    const hostOnlineEngine = new GameEngine(undefined, undefined, true);
    hostOnlineEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', {
      stageId: 6,
      uid: hostUid,
      isTrialMode: false,
      enforceProgression: true,
    });
    const hostOnlineState = hostOnlineEngine.getState();

    const guestOnlineEngine = new GameEngine(undefined, undefined, false);
    guestOnlineEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', {
      stageId: 1,
      uid: guestUid,
      isTrialMode: false,
      enforceProgression: false,
    });

    const startOnlineRes = hostMgr.startOnlineMatchSync(
      storage,
      hostUid,
      hostOnlineState,
      t0 + 60
    );

    const guestSnapApplied = guestOnlineEngine.applyAuthoritativeSnapshot(
      buildAuthoritativeSnapshot(hostOnlineState, 2, t0 + 70)
    );
    const guestState = guestOnlineEngine.getState();
    const guestSyncedMapOk =
      guestSnapApplied.valid &&
      guestState.currentStageId === 6 &&
      guestMgr.getCurrentRoom()?.status === 'PLAYING' &&
      guestMgr.getCurrentRoom()?.selectedStageId === 6 &&
      areStageMapsEqual(guestState.terrain.currentMap, getCampaignStageSpec(6).map);

    const passed =
      coopAiOk &&
      !lockedRoomCreate.success &&
      lockedRoomCreate.errorCode === 'PERMISSION_DENIED' &&
      createOk.success &&
      joinOk.success &&
      stageSwitchRes.success &&
      guestSyncedLobbyStage &&
      !lockedSwitchRes.success &&
      lockedSwitchRes.errorCode === 'PERMISSION_DENIED' &&
      startOnlineRes.success &&
      guestSyncedMapOk;

    results.push({
      id: 'M7_4_T4',
      name: 'T4: Co-op AI & Co-op Online (Host chọn Stage 1–10, P2P đồng bộ phòng chờ/vào trận/snapshot bản đồ, chặn Stage khóa)',
      passed,
      details: `coopAiOk=${coopAiOk}, lockedCreateBlocked=${!lockedRoomCreate.success}, guestLobbySync=${guestSyncedLobbyStage}, lockedSwitchBlocked=${!lockedSwitchRes.success}, startOnline=${startOnlineRes.success}, guestMapSync=${guestSyncedMapOk}`,
    });
  }

  // =========================================================================
  // M7_4_T5: Per-UID Persistence, Cross-User Isolation & Trial Stage-1 Lock
  // =========================================================================
  {
    const uidA = 'uid_persist_user_A';
    const uidB = 'uid_persist_user_B';
    progMgr.resetForTesting(uidA);
    progMgr.resetForTesting(uidB);

    const engA = new GameEngine(undefined, undefined, true);
    engA.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid: uidA,
      isTrialMode: false,
      enforceProgression: true,
    });
    for (let s = 1; s <= 4; s++) {
      clearAllEnemiesAndWinStage(engA);
      engA.advanceToNextStage();
    }
    // Simulate logout & fresh session reload
    progMgr.clearInMemoryCacheForTesting();
    const snapA = progMgr.getUserStageProgressSnapshot(uidA);
    const snapB = progMgr.getUserStageProgressSnapshot(uidB);
    const bBlockedStage2 = !progMgr.canUserAccessStage(uidB, 2, false).allowed;

    // Trial mode restrictions
    const trialCheckS1 = progMgr.canUserAccessStage(null, 1, true);
    const trialCheckS2 = progMgr.canUserAccessStage(null, 2, true);
    const trialEng = new GameEngine(undefined, undefined, true);
    const trialDeniedStart2 = trialEng.startMatch('SOLO', 'DEFAULT', {
      stageId: 2,
      uid: null,
      isTrialMode: true,
      enforceProgression: true,
    });
    const trialStart1 = trialEng.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid: null,
      isTrialMode: true,
      enforceProgression: true,
    });
    clearAllEnemiesAndWinStage(trialEng);
    const trialAdvanceBlocked = trialEng.advanceToNextStage() === false;

    const passed =
      snapA.unlockedStage === 5 &&
      snapA.completedStages.join(',') === '1,2,3,4' &&
      snapB.unlockedStage === 1 &&
      snapB.completedStages.length === 0 &&
      bBlockedStage2 &&
      trialCheckS1.allowed &&
      !trialCheckS2.allowed &&
      trialCheckS2.errorCode === 'TRIAL_MODE_RESTRICTED' &&
      !trialDeniedStart2.success &&
      trialStart1.success &&
      trialAdvanceBlocked;

    results.push({
      id: 'M7_4_T5',
      name: 'T5: Lưu tiến độ theo từng UID, cô lập giữa các tài khoản & khóa Chơi thử chỉ ở Stage 1',
      passed,
      details: `uidAUnlocked=${snapA.unlockedStage}, uidBUnlocked=${snapB.unlockedStage}, bBlockedS2=${bBlockedStage2}, trialLocked=${!trialCheckS2.allowed && !trialDeniedStart2.success && trialAdvanceBlocked}`,
    });
  }

  // =========================================================================
  // M7_4_T6: Security Audit & Tamper Resistance + Frozen Firestore Rules Check
  // =========================================================================
  {
    const uidSec = 'uid_security_audit';
    progMgr.resetForTesting(uidSec);

    // 1. Direct engine locked start rejected
    const secEng = new GameEngine(undefined, undefined, true);
    const lockedStart = secEng.startMatch('SOLO', 'DEFAULT', {
      stageId: 8,
      uid: uidSec,
      isTrialMode: false,
      enforceProgression: true,
    });

    // 2. Forged clear proofs rejected
    const tok = progMgr.issueMatchSessionToken(uidSec, 1, 'SOLO');
    const validProof = progMgr.mintStageClearProof({
      sessionToken: tok,
      totalDefeatedEnemies: 30,
      isBaseDestroyed: false,
      isStageClear: true,
    });
    const forgedSigProof: StageClearProof = {
      ...(validProof as StageClearProof),
      proofSignature: 'deadbeef00000000',
    };
    const forgedBaseProof = progMgr.mintStageClearProof({
      sessionToken: tok,
      totalDefeatedEnemies: 30,
      isBaseDestroyed: true,
      isStageClear: true,
    });
    const forgedLowKillsProof = progMgr.mintStageClearProof({
      sessionToken: tok,
      totalDefeatedEnemies: 12,
      isBaseDestroyed: false,
      isStageClear: true,
    });
    const forgedStageJumpProof: StageClearProof = {
      ...(validProof as StageClearProof),
      stageId: 5,
    };

    const rejectSig = !progMgr.verifyAndRecordStageClear(uidSec, forgedSigProof).accepted;
    const rejectBase = !progMgr.verifyAndRecordStageClear(uidSec, forgedBaseProof).accepted;
    const rejectKills = !progMgr.verifyAndRecordStageClear(uidSec, forgedLowKillsProof).accepted;
    const rejectJump = !progMgr.verifyAndRecordStageClear(uidSec, forgedStageJumpProof).accepted;
    const stillStage1AfterForgeries =
      progMgr.getUserStageProgressSnapshot(uidSec).unlockedStage === 1;

    // 3. Corrupt / tampered persisted record fails closed in both Node & Browser
    progMgr.writeRawSerializedRecordForTesting(
      uidSec,
      JSON.stringify({
        uid: uidSec,
        unlockedStage: 10,
        completedStages: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        updatedAtMs: Date.now(),
        signature: 'tampered_sig',
      })
    );
    const reloaded = progMgr.getUserStageProgressSnapshot(uidSec);
    const tamperFailClosed = reloaded.unlockedStage === 1 && reloaded.completedStages.length === 0;

    // 4. Verify CoopOnlineManager does NOT write selectedStageId to Firestore lobby schema
    const coopSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/core/coopOnlineManager.ts'), 'utf8');
    const lobbyInterfaceBlock = coopSrc.slice(
      coopSrc.indexOf('export interface CoopRoomLobbyDocument'),
      coopSrc.indexOf('export interface CoopRoomSignalingDocument')
    );
    const firestoreLobbyUnchanged = !lobbyInterfaceBlock.includes('selectedStageId');

    const passed =
      !lockedStart.success &&
      lockedStart.errorCode === 'STAGE_LOCKED' &&
      rejectSig &&
      rejectBase &&
      rejectKills &&
      rejectJump &&
      stillStage1AfterForgeries &&
      tamperFailClosed &&
      firestoreLobbyUnchanged;

    results.push({
      id: 'M7_4_T6',
      name: 'T6: Bảo mật tiến độ – Chặn bypass vào Stage khóa, từ chối proof giả mạo, fail-closed tamper & bảo toàn schema Firestore',
      passed,
      details: `lockedStartBlocked=${!lockedStart.success}, rejectForgeries=${rejectSig && rejectBase && rejectKills && rejectJump}, stillS1=${stillStage1AfterForgeries}, tamperFailClosed=${tamperFailClosed}, firestoreLobbyUnchanged=${firestoreLobbyUnchanged}`,
    });
  }

  // =========================================================================
  // M7_4_T7: UI Component Contract & Global State Restore
  // =========================================================================
  {
    const modeSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ModeSelectionScreen.tsx'), 'utf8');
    const lobbySrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CoopOnlineLobbyModal.tsx'), 'utf8');
    const clearSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StageClearModal.tsx'), 'utf8');
    const overSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/GameOverModal.tsx'), 'utf8');
    const hudSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/M3Hud.tsx'), 'utf8');
    const settingsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SettingsModal.tsx'), 'utf8');
    const miniSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/StageMapMiniPreview.tsx'), 'utf8');

    const uiWired =
      modeSrc.includes('campaign-stage-selector') &&
      modeSrc.includes('StageMapMiniPreview') &&
      lobbySrc.includes('coop-lobby-stage-panel') &&
      lobbySrc.includes('setRoomStage') &&
      clearSrc.includes('HOÀN THÀNH TOÀN BỘ CHIẾN DỊCH 10 STAGE') &&
      overSrc.includes('TOTAL_CAMPAIGN_STAGES') &&
      hudSrc.includes('TOTAL_CAMPAIGN_STAGES') &&
      settingsSrc.includes('Tiến độ Chiến dịch') &&
      settingsSrc.includes('account-detail-popup-modal') &&
      miniSrc.includes('StageMapMiniPreview');

    results.push({
      id: 'M7_4_T7',
      name: 'T7: Kiểm tra liên kết UI (Stage 1–10 Selector, Lobby Sync, HUD/Modals, Tiến độ Stage)',
      passed: uiWired,
      details: `uiWired=${uiWired}`,
    });
  }

  // =========================================================================
  // M7_4_T8 (M7.4.2): Live 60Hz Enemy AI Pathfinding, Brick-Breaching & Base Attack (Stages 1-10, Deep Audit 2/7/10)
  // =========================================================================
  {
    const stageFailures: string[] = [];

    for (let id = 1; id <= TOTAL_CAMPAIGN_STAGES; id++) {
      const spec = getCampaignStageSpec(id);
      const terrain = createRuntimeTerrainState(spec.map);

      // Verify pathfinding (open or brick-breach A*) from all 3 enemy spawns [0,0], [0,6], [0,12] to P1 & Base
      const spawns = [
        { label: 'L', x: 0, y: 0 },
        { label: 'M', x: 96, y: 0 },
        { label: 'R', x: 192, y: 0 },
      ];
      for (const sp of spawns) {
        const breachToBase = findPathWithBrickBreachAStar(sp, { x: 96, y: 192 }, terrain);
        const lastBaseWp = breachToBase[breachToBase.length - 1];
        if (
          !lastBaseWp ||
          Math.abs(Math.round(lastBaseWp.x / 16) - 6) +
            Math.abs(Math.round(lastBaseWp.y / 16) - 12) >
            1
        ) {
          stageFailures.push(`Stage ${id} spawn ${sp.label} no path to Base`);
        }
      }

      // Live 60Hz simulation: verify enemies escape all 3 spawns, destroy bricks when enclosed, and advance deep
      const simTicks = id === 2 || id === 7 || id === 10 ? 2700 : 1800;
      const simEng = new GameEngine(undefined, undefined, true);
      simEng.startMatch('SOLO', 'DEFAULT', { stageId: id, enforceProgression: false });

      const laneMaxY: Record<'L' | 'M' | 'R', number> = { L: 0, M: 0, R: 0 };
      const trackedLane = new Map<string, 'L' | 'M' | 'R'>();
      let baseWasAttackedOrDestroyed = false;

      for (let t = 0; t < simTicks; t++) {
        const internal = simEng as any;
        if (internal.state.terrain.isBaseDestroyed) {
          baseWasAttackedOrDestroyed = true;
          internal.state.terrain.isBaseDestroyed = false;
        }
        if (internal.state.p1State.lives < 2) {
          internal.state.p1State.lives = 3;
        }
        simEng.stepTick(IDLE_INPUT);
        const st = simEng.getState();
        if (st.terrain.isBaseDestroyed) {
          baseWasAttackedOrDestroyed = true;
        }
        for (const e of st.enemies) {
          if (!trackedLane.has(e.id)) {
            trackedLane.set(e.id, e.x < 48 ? 'L' : e.x < 144 ? 'M' : 'R');
          }
          const ln = trackedLane.get(e.id)!;
          if (e.y > laneMaxY[ln]) laneMaxY[ln] = e.y;
        }
      }

      const endSt = simEng.getState();
      let damagedBrickCount = 0;
      for (const mask of Object.values(endSt.terrain.brickSubTiles)) {
        if (mask < 15) damagedBrickCount++;
      }

      // Every spawn lane must escape top rows (> 64px) and reach southern half; Stage 2/7/10 must breach bricks
      if (laneMaxY.L < 80 || laneMaxY.M < 80 || laneMaxY.R < 80) {
        stageFailures.push(
          `Stage ${id} spawn stuck: L=${Math.round(laneMaxY.L)},M=${Math.round(laneMaxY.M)},R=${Math.round(laneMaxY.R)}`
        );
      }
      if ((id === 2 || id === 7 || id === 10) && damagedBrickCount < 2) {
        stageFailures.push(`Stage ${id} expected brick breaching >=2, got ${damagedBrickCount}`);
      }
      const maxReachAnyLane = Math.max(laneMaxY.L, laneMaxY.M, laneMaxY.R);
      if (maxReachAnyLane < 160 && !baseWasAttackedOrDestroyed) {
        stageFailures.push(`Stage ${id} enemies did not threaten base zone (maxY=${Math.round(maxReachAnyLane)})`);
      }
    }

    const passed = stageFailures.length === 0;
    results.push({
      id: 'M7_4_T8',
      name: 'T8 (M7.4.2): Mô phỏng 60Hz thực tế Stage 1–10 – Enemy AI thoát cả 3 spawn, tự phá BRICK (Stage 2/7/10), né STEEL/WATER & áp sát mục tiêu',
      passed,
      details: passed ? 'All 10 stages passed 60Hz AI infiltration & brick-breaching' : stageFailures.join(' | '),
    });
  }

  // =========================================================================
  // M7_4_T9 (M7.4.2): P1/P2 Valid Movement & Co-op Ally AI Brick Pocket Escape (Stages 1-10)
  // =========================================================================
  {
    const moveFailures: string[] = [];

    for (let id = 1; id <= TOTAL_CAMPAIGN_STAGES; id++) {
      // 1. Verify P1 & P2 human movement out of spawn on every stage
      const pEng = new GameEngine(undefined, undefined, true);
      pEng.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: id, enforceProgression: false });
      pEng.setExternalInputP2({ up: true, down: false, left: false, right: false, shoot: false });
      for (let t = 0; t < 30; t++) {
        pEng.stepTick({ up: true, down: false, left: false, right: false, shoot: false });
      }
      const pSt = pEng.getState();
      if (pSt.p1.y >= 192 || !pSt.p2 || pSt.p2.y >= 192) {
        moveFailures.push(`Stage ${id} P1/P2 failed to move UP from spawn (p1.y=${pSt.p1.y}, p2.y=${pSt.p2?.y})`);
      }

      // 2. Verify Co-op AI (Ally P2) on Stage 2, Stage 7, Stage 10 breaks out of spawn & engages enemies safely
      if (id === 2 || id === 7 || id === 10) {
        const aiEng = new GameEngine(undefined, undefined, true);
        aiEng.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: id, enforceProgression: false });
        let minP2Y = 192;
        let p2Fired = false;
        for (let t = 0; t < 1800; t++) {
          (aiEng as any).state.terrain.isBaseDestroyed = false;
          aiEng.stepTick(IDLE_INPUT);
          const st = aiEng.getState();
          if (st.p2 && st.p2.y < minP2Y) minP2Y = st.p2.y;
          if (st.bullets.some((b) => b.ownerId === 'p2')) p2Fired = true;
        }
        if (minP2Y > 96 || !p2Fired) {
          moveFailures.push(`Stage ${id} Ally P2 stuck in pocket (minY=${Math.round(minP2Y)}, fired=${p2Fired})`);
        }
      }
    }

    const passed = moveFailures.length === 0;
    results.push({
      id: 'M7_4_T9',
      name: 'T9 (M7.4.2): Kiểm tra di chuyển P1/P2 trên cả 10 Stage & Đồng đội AI tự phá gạch thoát kẹt trên Stage 2/7/10 an toàn',
      passed,
      details: passed ? 'P1/P2 movement & Ally AI Stage 2/7/10 breakout verified' : moveFailures.join(' | '),
    });
  }

  // =========================================================================
  // M7_4_T10 (M7.4.2): Difficulty Escalation, Stage 8 Copy Fix & Stage vs DEFAULT/EXTREME Separation
  // =========================================================================
  {
    let escalationOk = true;
    let prevHeavyCount = 0;
    let prevBasicCount = 99;
    for (let id = 1; id <= TOTAL_CAMPAIGN_STAGES; id++) {
      const comp = getCampaignStageSpec(id).enemyComposition;
      const heavy = comp.POWER + comp.ARMOR;
      if (heavy <= prevHeavyCount || comp.BASIC > prevBasicCount) {
        escalationOk = false;
      }
      prevHeavyCount = heavy;
      prevBasicCount = comp.BASIC;
    }

    const stage8Focus = getCampaignStageSpec(8).terrainFocus;
    const stage8CopyAccurate =
      !stage8Focus.includes('tốc độ cao') &&
      stage8Focus.includes('Power') &&
      stage8Focus.includes('Armor');

    // Verify Stage selection never alters DEFAULT/EXTREME rules and advanceToNextStage preserves difficulty
    const uidDiff = 'uid_diff_sep_audit';
    progMgr.resetForTesting(uidDiff);
    const engDefault = new GameEngine(undefined, undefined, true);
    engDefault.startMatch('SOLO', 'DEFAULT', { stageId: 1, uid: uidDiff, enforceProgression: true });
    const defLivesS1 = engDefault.getState().p1State.lives;
    const defDurS1 = engDefault.getState().matchDurationSeconds;
    clearAllEnemiesAndWinStage(engDefault);
    engDefault.advanceToNextStage();
    const defPreservedOnS2 =
      engDefault.getState().currentStageId === 2 &&
      engDefault.getState().difficulty === 'DEFAULT' &&
      engDefault.getState().matchDurationSeconds === defDurS1 &&
      defLivesS1 === 3 &&
      defDurS1 === MATCH_TIMER_CONFIG.DEFAULT_DURATION_S;

    const engExtreme = new GameEngine(undefined, undefined, true);
    engExtreme.startMatch('SOLO', 'EXTREME', { stageId: 2, uid: uidDiff, enforceProgression: true });
    const extLivesSolo = engExtreme.getState().p1State.lives;
    const extDurSolo = engExtreme.getState().matchDurationSeconds;
    clearAllEnemiesAndWinStage(engExtreme);
    engExtreme.advanceToNextStage();
    const extPreservedOnS3 =
      engExtreme.getState().currentStageId === 3 &&
      engExtreme.getState().difficulty === 'EXTREME' &&
      extLivesSolo === 2 &&
      extDurSolo === MATCH_TIMER_CONFIG.EXTREME_DURATION_S;

    const passed = escalationOk && stage8CopyAccurate && defPreservedOnS2 && extPreservedOnS3;
    results.push({
      id: 'M7_4_T10',
      name: 'T10 (M7.4.2): Độ khó chiến dịch tăng dần (Power+Armor 8→18), mô tả Stage 8 chính xác & tách biệt tuyệt đối Stage với DEFAULT/EXTREME',
      passed,
      details: `escalationOk=${escalationOk}, stage8CopyAccurate=${stage8CopyAccurate}, defPreserved=${defPreservedOnS2}, extPreserved=${extPreservedOnS3}`,
    });
  }

  // =========================================================================
  // M7_4_T11 (M7.4.2): Co-op Online Security (Reject Guest Forged Packets, DataChannel Drop/Reconnect Map Sync & Guest Non-Escalation)
  // =========================================================================
  {
    const hostUid = 'uid_m742_host';
    const guestUid = 'uid_m742_guest';
    progMgr.resetForTesting(hostUid);
    progMgr.resetForTesting(guestUid);

    // Unlock Host up to Stage 7, keep Guest at Stage 1
    const hostUnlockEng = new GameEngine(undefined, undefined, true);
    hostUnlockEng.startMatch('SOLO', 'DEFAULT', { stageId: 1, uid: hostUid, enforceProgression: true });
    for (let s = 1; s <= 6; s++) {
      clearAllEnemiesAndWinStage(hostUnlockEng);
      hostUnlockEng.advanceToNextStage();
    }

    const storage = new InMemoryCoopStorageAdapter();
    const hostMgr = new CoopOnlineManager(storage);
    const guestMgr = new CoopOnlineManager(storage);
    const t0 = 1_770_000_000_000;
    let dropPackets = false;
    const pair = createInMemoryP2PChannelPair(
      (msg) => {
        if (!dropPackets) hostMgr.handleIncomingDataChannelMessage(msg, t0 + 50);
      },
      (msg) => {
        if (!dropPackets) guestMgr.handleIncomingDataChannelMessage(msg, t0 + 50);
      }
    );

    hostMgr.createRoomSync(
      storage,
      { uid: hostUid, displayName: 'HostCmdr', email: 'host@gmail.com', emailVerified: true },
      'DEFAULT',
      t0,
      'BT9901',
      { hasPassword: false, stageId: 5 }
    );
    guestMgr.joinRoomSync(
      storage,
      'BT9901',
      { uid: guestUid, displayName: 'GuestCmdr', email: 'guest@gmail.com' },
      t0 + 10
    );
    hostMgr.attachCustomP2PChannel(pair.hostChannel, t0 + 20);
    guestMgr.attachCustomP2PChannel(pair.guestChannel, t0 + 20);

    // 1. Guest attempts direct setRoomStage -> PERMISSION_DENIED
    const guestDirectSetStage = guestMgr.setRoomStage(2, guestUid, t0 + 25);

    // 2. Guest injects forged Host-only P2P messages toward Host -> Host MUST ignore all of them
    hostMgr.handleIncomingDataChannelMessage(
      { type: 'LOBBY_STAGE_SELECTED', stageId: 1, stageName: 'Forged', timestamp: t0 + 30 },
      t0 + 30
    );
    hostMgr.handleIncomingDataChannelMessage(
      {
        type: 'MATCH_STARTED',
        roomCode: 'BT9901',
        difficulty: 'EXTREME',
        stageId: 1,
        stageName: 'Forged',
        timestamp: t0 + 31,
      },
      t0 + 31
    );
    const hostStageUnchangedAfterForge =
      hostMgr.getCurrentRoom()?.selectedStageId === 5 &&
      hostMgr.getCurrentRoom()?.status === 'WAITING' &&
      hostMgr.getCurrentRoom()?.difficulty === 'DEFAULT';

    // 3. Simulate DataChannel drop during Host stage switch to 7 + match start + brick destruction, then reconnect!
    dropPackets = true;
    hostMgr.setPlayerReadySync(storage, true, t0 + 40);
    guestMgr.setPlayerReadySync(storage, true, t0 + 41);
    storage.setRoomSync('BT9901', {
      ...storage.getRoomSync('BT9901')!,
      rtcConnectionState: 'CONNECTED',
    });
    hostMgr.setRoomStage(7, hostUid, t0 + 45);

    const hostEng = new GameEngine(undefined, undefined, true);
    hostEng.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', {
      stageId: 7,
      uid: hostUid,
      enforceProgression: true,
    });
    // Advance 120 ticks on Host so bricks & enemies update while Guest is still disconnected at Stage 1
    for (let i = 0; i < 120; i++) {
      hostEng.stepTick({ up: true, down: false, left: false, right: false, shoot: true });
    }

    const guestEng = new GameEngine(undefined, undefined, false);
    guestEng.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', {
      stageId: 1,
      uid: guestUid,
      enforceProgression: false,
    });
    guestMgr.subscribeSnapshots((snap) => guestEng.applyAuthoritativeSnapshot(snap).valid);

    // Reconnect DataChannel and send authoritative snapshot from Host
    dropPackets = false;
    const reconnectSnap = buildAuthoritativeSnapshot(hostEng.getState(), 5, t0 + 200);
    guestMgr.handleIncomingDataChannelMessage(
      { type: 'HOST_SNAPSHOT', snapshot: reconnectSnap },
      t0 + 200
    );

    const guestRecoveredSameMap =
      guestEng.getState().currentStageId === 7 &&
      guestMgr.getCurrentRoom()?.status === 'PLAYING' &&
      guestMgr.getCurrentRoom()?.selectedStageId === 7 &&
      areStageMapsEqual(guestEng.getState().terrain.currentMap, hostEng.getState().terrain.currentMap);

    // 4. Verify Guest personal progression remains at Stage 1 even when Host clears Stage 7
    clearAllEnemiesAndWinStage(hostEng);
    guestMgr.handleIncomingDataChannelMessage(
      {
        type: 'HOST_SNAPSHOT',
        snapshot: buildAuthoritativeSnapshot(hostEng.getState(), 6, t0 + 250),
      },
      t0 + 250
    );
    const hostUnlockedAfterClear = progMgr.getUnlockedStageForUser(hostUid, false);
    const guestUnlockedAfterHostClear = progMgr.getUnlockedStageForUser(guestUid, false);

    // 5. Verify Firestore lobby document has exact 15 approved keys
    const lobbyDoc = storage.getRoomSync('BT9901')!;
    const exact15LobbyKeys = Object.keys(lobbyDoc).length === 15 && !('selectedStageId' in lobbyDoc);

    const passed =
      !guestDirectSetStage.success &&
      guestDirectSetStage.errorCode === 'NOT_HOST' &&
      hostStageUnchangedAfterForge &&
      guestRecoveredSameMap &&
      hostUnlockedAfterClear === 8 &&
      guestUnlockedAfterHostClear === 1 &&
      exact15LobbyKeys;

    results.push({
      id: 'M7_4_T11',
      name: 'T11 (M7.4.2): Bảo mật & phục hồi Co-op Online (Chặn gói tin giả mạo từ Guest, tự đồng bộ bản đồ khi rớt/nối lại DataChannel, không leo thang tiến trình Guest, đúng 15 trường Firestore)',
      passed,
      details: `guestSetBlocked=${!guestDirectSetStage.success}, forgeIgnored=${hostStageUnchangedAfterForge}, reconnectMapSync=${guestRecoveredSameMap}, hostUnl=${hostUnlockedAfterClear}, guestUnl=${guestUnlockedAfterHostClear}, exact15Keys=${exact15LobbyKeys}`,
    });
  }

  // =========================================================================
  // M7_4_T12 (M7.4.2): Frozen Rules Integrity & Final State Cleanup
  // =========================================================================
  {
    const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

    const rulesUntouched =
      firestoreRules.includes("rules_version = '2';") &&
      !firestoreRules.includes('stage_progression') &&
      storageRules.includes("rules_version = '2';");

    // Clean up test artifacts and restore all 10 active campaign stages
    progMgr.resetForTesting();
    stageMgr.resetForTesting({ seedCampaignStages: true });
    const restoredStagesCount = stageMgr.getAllStages().length;

    const passed = rulesUntouched && restoredStagesCount === 10;
    results.push({
      id: 'M7_4_T12',
      name: 'T12 (M7.4.2): Bảo toàn tuyệt đối firestore.rules / storage.rules (chưa sửa/chưa publish) & khôi phục 10 Stage chuẩn',
      passed,
      details: `rulesUntouched=${rulesUntouched}, restoredStagesCount=${restoredStagesCount}`,
    });
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}
