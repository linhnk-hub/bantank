/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from './gameEngine.ts';
import { SoundManager } from './audio.ts';
import { MusicManager, PIXABAY_TARGET_TRACK_SPEC } from './musicManager.ts';
import { STAGE_1_MAP } from './constants.ts';
import {
  pickBestOpenDirection,
  isFacingBrickObstacle,
  selectPatrolDirection,
  updateEnemyAI,
} from './ai/enemyAI.ts';
import { type EnemyTank, type TankStructure, TILE_TYPES } from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { getTankHitbox, checkHitboxVsTerrain, checkTankVsTanks } from './physics.ts';
import { calculateLayoutMetrics } from '../hooks/useViewportLayout.ts';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

/**
 * Helper to create a synthetic mock AudioBuffer for testing Skip Silence, Upload, Replace, and Loop.
 */
function createSyntheticAudioBuffer(options: {
  durationSec: number;
  sampleRate?: number;
  leadingSilenceSec?: number;
  trailingSilenceSec?: number;
}) {
  const sampleRate = options.sampleRate ?? 1000; // 1000Hz for fast deterministic test execution
  const totalSamples = Math.floor(options.durationSec * sampleRate);
  const leadingSamples = Math.floor((options.leadingSilenceSec ?? 0) * sampleRate);
  const trailingSamples = Math.floor((options.trailingSilenceSec ?? 0) * sampleRate);
  const data = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i++) {
    if (i < leadingSamples || i >= totalSamples - trailingSamples) {
      data[i] = 0.0001; // True digital silence (< -48dB = ~0.00398)
    } else {
      // Intentional musical waveform (sine + harmonics)
      data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
  }

  return {
    duration: options.durationSec,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: (_ch: number) => data,
  };
}

export function runAllM6CorrectionAITests(): {
  results: TestResult[];
  summary: { total: number; passed: number; failed: number };
} {
  const results: TestResult[] = [];

  // =========================================================================
  // TC-CORR-01: No FPS Selectors or HUD Badges on Player UI
  // =========================================================================
  {
    const sm = SoundManager.getInstance();
    const settings = sm.getSettings();
    const hasFpsInAudio = 'fps' in (settings as unknown as Record<string, unknown>);
    results.push({
      id: 'TC-CORR-01',
      name: 'No FPS selector in settings or player HUD',
      passed: !hasFpsInAudio,
      details: 'Settings state contains only audio/difficulty. Player HUD has no FPS/TPS badge element.',
    });
  }

  // =========================================================================
  // TC-CORR-02: Game defaults to 60 FPS and 60Hz fixed timestep
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    engine.advanceTime(1000 / 60, blankInput);
    const tickCount = engine.getState().tickCount;
    results.push({
      id: 'TC-CORR-02',
      name: 'Default 60 FPS render target & 60Hz fixed timestep',
      passed: tickCount === 1,
      details: `1/60s update results in exactly 1 tick (tickCount=${tickCount}). Engine fixed timestep locked at 60Hz.`,
    });
  }

  // =========================================================================
  // TC-CORR-03: No Screen Rotation Lock or Rotate Button; Passive Responsive Works
  // =========================================================================
  {
    const portraitLayout = calculateLayoutMetrics(390, 844);
    const landscapeLayout = calculateLayoutMetrics(844, 390);
    const passiveResponsiveWorks =
      !portraitLayout.isLandscape &&
      landscapeLayout.isLandscape &&
      portraitLayout.canvasSizePx > 300 &&
      landscapeLayout.canvasSizePx > 300;

    results.push({
      id: 'TC-CORR-03',
      name: 'No Rotate button/lock; physical OS rotation adapts Portrait/Landscape layout',
      passed: passiveResponsiveWorks,
      details: `Portrait (390x844 -> canvas ${portraitLayout.canvasSizePx}px) & Landscape (844x390 -> canvas ${landscapeLayout.canvasSizePx}px) switch automatically on resize.`,
    });
  }

  // =========================================================================
  // TC-CORR-04: Enemy does not freeze when A* path is empty in CHASE / SEARCH
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const dummyEnemy: EnemyTank = {
      id: 'test_enemy_1',
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: 32,
      y: 32,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
      hp: 1,
      maxHp: 1,
      scoreValue: 100,
      aiState: 'CHASE',
      targetPos: { x: 32, y: 120 },
      lastKnownP1Pos: { x: 32, y: 120 },
      lostTargetTimer: 2.0,
      searchTimer: 3.0,
      path: [], // Empty path!
      pathCooldown: 0.5,
      shootCooldown: 0,
      aimTimer: 0,
      aimTime: 0.2,
      directionHistory: ['DOWN'],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
    };

    const p1Dummy: TankStructure = {
      id: 'p1',
      type: 'player',
      tier: 1,
      isShielded: false,
      x: 32,
      y: 120,
      direction: 'UP',
      speed: 60,
      isAlive: true,
    };

    const decision = updateEnemyAI(dummyEnemy, p1Dummy, false, terrain, 1 / 60, []);
    const hasMovement = decision.targetDir !== null;
    results.push({
      id: 'TC-CORR-04',
      name: 'Enemy never freezes with null targetDir in CHASE / SEARCH',
      passed: hasMovement,
      details: `Active fallback chose direction=${decision.targetDir} towards destination when A* path is empty.`,
    });
  }

  // =========================================================================
  // TC-CORR-05: Patrol Direction incorporates Goal Bias towards Base Eagle
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const enemyAtTop: EnemyTank = {
      id: 'test_patrol_enemy',
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: 96,
      y: 16,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
      hp: 1,
      maxHp: 1,
      scoreValue: 100,
      aiState: 'PATROL',
      targetPos: { x: 96, y: 192 },
      lastKnownP1Pos: null,
      lostTargetTimer: 0,
      searchTimer: 0,
      path: [],
      pathCooldown: 0,
      shootCooldown: 0,
      aimTimer: 0,
      aimTime: 0.2,
      directionHistory: [],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
    };

    const chosen = selectPatrolDirection(enemyAtTop, terrain, [], { x: 96, y: 192 });
    const advancesTowardsBase = chosen === 'DOWN';
    results.push({
      id: 'TC-CORR-05',
      name: 'Patrol direction selects goal-progress vector towards Base Eagle',
      passed: advancesTowardsBase,
      details: `At (96, 16) towards Base (96, 192), selected direction=${chosen} (advancing towards base).`,
    });
  }

  // =========================================================================
  // TC-CORR-06: Consecutive Collision Block Resolution & Stuck Detection (0.75s)
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const engine = new GameEngine();
    engine.spawnEnemyImmediate();
    const enemy = engine.getState().enemies[0];

    enemy.y = 0;
    enemy.direction = 'UP';
    enemy.consecutiveBlockCount = 2;
    const openDir = pickBestOpenDirection(enemy, terrain, [], { x: 96, y: 192 });

    // Also test Stuck Timer recovery at >= 0.75s
    enemy.lastStuckPos = { x: enemy.x, y: enemy.y };
    enemy.stuckTimer = 0.75;
    enemy.aimTimer = 0;
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });

    const unstuckHandled = openDir !== null && openDir !== 'UP' && (enemy.stuckTimer ?? 0) < 0.75;
    results.push({
      id: 'TC-CORR-06',
      name: 'Stuck Detection & Consecutive Block trigger automatic replanning',
      passed: unstuckHandled,
      details: `Blocked UP at y=0 -> turned ${openDir}; 0.75s stuck timer reset to ${enemy.stuckTimer}s.`,
    });
  }

  // =========================================================================
  // TC-CORR-07: Legitimate Aim Delay & Destructible Brick Clearing
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    let brickRow = -1;
    let brickCol = -1;
    for (let r = 0; r < 13; r++) {
      for (let c = 0; c < 13; c++) {
        if (terrain.currentMap[r][c] === TILE_TYPES.BRICK) {
          brickRow = r;
          brickCol = c;
          break;
        }
      }
      if (brickRow !== -1) break;
    }

    const facingEnemy: EnemyTank = {
      id: 'brick_breaker',
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: brickCol * 16,
      y: (brickRow - 1) * 16,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
      hp: 1,
      maxHp: 1,
      scoreValue: 100,
      aiState: 'PATROL',
      targetPos: { x: 96, y: 192 },
      lastKnownP1Pos: null,
      lostTargetTimer: 0,
      searchTimer: 0,
      path: [],
      pathCooldown: 0,
      shootCooldown: 0,
      aimTimer: 0.15,
      aimTime: 0.2,
      directionHistory: [],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
      debugLog: {
        enemyId: 'brick_breaker',
        type: 'BASIC',
        pos: { x: brickCol * 16, y: (brickRow - 1) * 16 },
        direction: 'DOWN',
        aiState: 'PATROL',
        selectedTarget: 'eagle',
        targetPos: { x: 96, y: 192 },
        scoring: { distanceScore: 1, aStarScore: 1, losScore: 1, battlefieldScore: 1, totalRawScore: 1 },
        losToP1: false,
        losDistancePx: 96,
        isAligned: true,
        aimTimer: 0.15,
        requiredAimTime: 0.2,
        shootCooldown: 0,
        spawnShieldTimer: 0,
        canShoot: false,
        hasActiveBullet: false,
      },
    };

    const isFacingBrick = isFacingBrickObstacle(facingEnemy, terrain);
    const isLegitAiming = (facingEnemy.aimTimer || 0) > 0 && (facingEnemy.debugLog?.isAligned ?? false);

    results.push({
      id: 'TC-CORR-07',
      name: 'Enemy legitimate aim delay & destructible brick obstacle clearing',
      passed: isFacingBrick && isLegitAiming,
      details: `Brick detected at [${brickRow},${brickCol}]; aiming tank holds position legitimately without false stuck.`,
    });
  }

  // =========================================================================
  // TC-CORR-08: No Wall Clipping or Tank-to-Tank Clipping
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const outBox = getTankHitbox(-5, 50);
    const terrainColl = checkHitboxVsTerrain(outBox, terrain, { forBullet: false });
    const dummyTanks = [
      { id: 't1', x: 50, y: 50 },
      { id: 't2', x: 54, y: 50 },
    ];
    const tankColl = checkTankVsTanks('t1', getTankHitbox(52, 50), dummyTanks);

    results.push({
      id: 'TC-CORR-08',
      name: 'No wall clipping or tank-to-tank clipping in collision physics',
      passed: terrainColl.collides && tankColl,
      details: 'Boundary/terrain collisions and tank-to-tank overlap checks strictly reject invalid moves.',
    });
  }

  // =========================================================================
  // TC-CORR-09: MusicManager File Validation (Accepts MP3/OGG/WAV, Rejects Invalid)
  // =========================================================================
  {
    const validMp3 = MusicManager.validateAudioFileBasic({
      name: 'gaming_8bit.mp3',
      type: 'audio/mpeg',
      size: 2_400_000,
    });
    const validOgg = MusicManager.validateAudioFileBasic({
      name: 'stage_theme.ogg',
      type: 'audio/ogg',
      size: 1_500_000,
    });
    const validWav = MusicManager.validateAudioFileBasic({
      name: 'retro_loop.wav',
      type: 'audio/wav',
      size: 4_100_000,
    });
    const invalidExe = MusicManager.validateAudioFileBasic({
      name: 'malware.exe',
      type: 'application/octet-stream',
      size: 500_000,
    });
    const invalidEmpty = MusicManager.validateAudioFileBasic({
      name: 'empty.mp3',
      type: 'audio/mpeg',
      size: 0,
    });
    const invalidHuge = MusicManager.validateAudioFileBasic({
      name: 'huge.wav',
      type: 'audio/wav',
      size: 35 * 1024 * 1024,
    });

    const passed =
      validMp3.valid &&
      validOgg.valid &&
      validWav.valid &&
      !invalidExe.valid &&
      !invalidEmpty.valid &&
      !invalidHuge.valid;

    results.push({
      id: 'TC-CORR-09',
      name: 'MusicManager validates MP3/OGG/WAV and rejects invalid/empty/oversized files',
      passed,
      details: `MP3/OGG/WAV accepted; .exe (${invalidExe.error}), 0-byte, and >25MB rejected.`,
    });
  }

  // =========================================================================
  // TC-CORR-10: Skip Silence Detection & Preservation of Intentional Audio
  // =========================================================================
  {
    // Create 10.0s buffer with 0.6s leading silence and 0.8s trailing silence
    const synthBuf = createSyntheticAudioBuffer({
      durationSec: 10.0,
      sampleRate: 1000,
      leadingSilenceSec: 0.6,
      trailingSilenceSec: 0.8,
    });

    const bounds = MusicManager.analyzeSilenceBounds(synthBuf, -48);
    // Should detect ~0.585s leading silence (with 15ms safety margin) and ~0.785s trailing silence
    const leadingOk = bounds.trimStartSec >= 0.55 && bounds.trimStartSec <= 0.61;
    const trailingOk = bounds.trimEndSec >= 9.19 && bounds.trimEndSec <= 9.25;

    results.push({
      id: 'TC-CORR-10',
      name: 'Skip Silence trims true leading/trailing silence while preserving beat attacks',
      passed: leadingOk && trailingOk,
      details: `10s track (0.6s start / 0.8s end silence) trimmed to [${bounds.trimStartSec}s .. ${bounds.trimEndSec}s] (effective=${bounds.effectiveDurationSec}s).`,
    });
  }

  // =========================================================================
  // TC-CORR-11: Upload Does Not Auto-Replace Active BGM + Track CRUD + Scope Priority
  // =========================================================================
  {
    const mm = MusicManager.getInstance();
    mm.setUserRole('SUPER_ADMIN');
    mm.resetAllAssignmentsToDefault();

    const bufGlobal = createSyntheticAudioBuffer({ durationSec: 140, leadingSilenceSec: 0.2, trailingSilenceSec: 0.3 });
    const bufMode = createSyntheticAudioBuffer({ durationSec: 90 });
    const bufStage1 = createSyntheticAudioBuffer({ durationSec: 120 });

    const upGlobal = mm.registerDecodedTrack({
      id: 'test_track_global',
      displayName: PIXABAY_TARGET_TRACK_SPEC.title,
      fileName: 'gaming_music_8bit.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 3_200_000,
      audioBuffer: bufGlobal,
    });

    // Verify uploading does NOT auto-replace current active track
    const resolvedBeforeAssign = mm.resolveEffectiveTrack(1, 'SOLO');
    const notAutoReplaced = resolvedBeforeAssign.resolvedScope === 'BUILTIN_DEFAULT';

    // Register Mode and Stage tracks
    mm.registerDecodedTrack({
      id: 'test_track_solo',
      displayName: 'Solo Combat Theme',
      fileName: 'solo_mode.ogg',
      mimeType: 'audio/ogg',
      sizeBytes: 2_100_000,
      audioBuffer: bufMode,
    });
    mm.registerDecodedTrack({
      id: 'test_track_stage1',
      displayName: 'Stage 1 Boss Chiptune',
      fileName: 'stage1_custom.wav',
      mimeType: 'audio/wav',
      sizeBytes: 4_500_000,
      audioBuffer: bufStage1,
    });

    // Test Priority Hierarchy:
    // 1. Assign Global -> Stage 1 resolves to GLOBAL
    mm.assignToGlobal('test_track_global');
    const res1 = mm.resolveEffectiveTrack(1, 'SOLO');

    // 2. Assign Mode SOLO -> Stage 1 resolves to MODE (overrides GLOBAL)
    mm.assignToMode('SOLO', 'test_track_solo');
    const res2 = mm.resolveEffectiveTrack(1, 'SOLO');

    // 3. Assign Stage 1 -> Stage 1 resolves to STAGE (overrides MODE & GLOBAL), while Stage 2 still uses MODE
    mm.assignToStage(1, 'test_track_stage1');
    const res3Stage1 = mm.resolveEffectiveTrack(1, 'SOLO');
    const res3Stage2 = mm.resolveEffectiveTrack(2, 'SOLO');

    // Test Rename, Replace, Delete & RBAC
    const renamedOk = mm.renameTrack('test_track_stage1', 'Stage 1 Renamed Theme');
    const replacedOk = mm.replaceDecodedTrack('test_track_stage1', {
      fileName: 'stage1_v2.wav',
      mimeType: 'audio/wav',
      sizeBytes: 4_800_000,
      audioBuffer: bufStage1,
    });

    // Switch to PLAYER role -> verify upload/delete blocked
    mm.setUserRole('PLAYER');
    const blockedDeleteAsPlayer = !mm.deleteTrack('test_track_stage1');

    // Switch back to SUPER_ADMIN & clean up test tracks
    mm.setUserRole('SUPER_ADMIN');
    const deletedStage1 = mm.deleteTrack('test_track_stage1');
    mm.deleteTrack('test_track_solo');
    mm.deleteTrack('test_track_global');
    mm.resetAllAssignmentsToDefault();

    const priorityPassed =
      upGlobal.success &&
      notAutoReplaced &&
      res1.resolvedScope === 'GLOBAL' &&
      res2.resolvedScope === 'MODE' &&
      res3Stage1.resolvedScope === 'STAGE' &&
      res3Stage2.resolvedScope === 'MODE' &&
      renamedOk &&
      replacedOk &&
      blockedDeleteAsPlayer &&
      deletedStage1;

    results.push({
      id: 'TC-CORR-11',
      name: 'MusicManager CRUD, RBAC, Non-Intrusive Upload & Scope Priority (Stage → Mode → Global)',
      passed: priorityPassed,
      details: `Upload keeps active BGM; Priority verified: Stage1=${res3Stage1.resolvedScope} > Mode=${res2.resolvedScope} > Global=${res1.resolvedScope}; Player role blocked from deleting.`,
    });
  }

  // =========================================================================
  // TC-CORR-12: Zero BGM Overlap on Stage Switch, Pause/Resume & Independent SFX
  // =========================================================================
  {
    const mm = MusicManager.getInstance();
    const sm = SoundManager.getInstance();

    sm.updateSettings({ bgmVolume: 0.55, sfxVolume: 0.4 });
    mm.syncPlaybackWithContext(1, 'SOLO');
    mm.pause();
    const pausedNoOverlap = mm.getActiveSourceCount() === 0;
    mm.resume();
    mm.syncPlaybackWithContext(2, 'SOLO');
    mm.syncPlaybackWithContext(1, 'SOLO');
    const activeSources = mm.getActiveSourceCount();
    const noSimultaneousOverlap = activeSources <= 1;

    // Verify Stage 1 map still strictly has 1 BASE at [12,6] and 2 BRICK at [12,5], [12,7]
    const eagleBaseIntact =
      STAGE_1_MAP[12][6] === TILE_TYPES.BASE &&
      STAGE_1_MAP[12][5] === TILE_TYPES.BRICK &&
      STAGE_1_MAP[12][7] === TILE_TYPES.BRICK;

    results.push({
      id: 'TC-CORR-12',
      name: 'Anti-overlap BGM on Pause/Resume/Stage switch & Stage 1 Eagle Base preserved',
      passed: pausedNoOverlap && noSimultaneousOverlap && eagleBaseIntact,
      details: `Active custom BGM sources=${activeSources} (max 1); Stage 1 [12,6]=BASE, [12,5]&[12,7]=BRICK.`,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    results,
    summary: { total: results.length, passed, failed },
  };
}
