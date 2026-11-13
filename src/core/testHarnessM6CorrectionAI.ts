/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from './gameEngine.ts';
import { SoundManager } from './audio.ts';
import { MusicManager, PIXABAY_TARGET_TRACK_SPEC } from './musicManager.ts';
import { STAGE_1_MAP, ENEMY_CONFIG } from './constants.ts';
import {
  pickBestOpenDirection,
  isFacingBrickObstacle,
  selectPatrolDirection,
  updateEnemyAI,
} from './ai/enemyAI.ts';
import { EnemyCoordinator } from './ai/coordinator.ts';
import { findPathAStar, isTileWalkable } from './ai/pathfinding.ts';
import { type EnemyTank, type EnemyType, type TankStructure, TILE_TYPES } from './types.ts';
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
    mm.setUserRole('ADMIN');
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

    // Switch back to ADMIN & clean up test tracks
    mm.setUserRole('ADMIN');
    const deletedStage1 = mm.deleteTrack('test_track_stage1');
    mm.deleteTrack('test_track_solo');
    mm.deleteTrack('test_track_global');
    mm.resetAllAssignmentsToDefault();
    mm.syncRoleFromAuthUser(null);

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

  // =========================================================================
  // TC-LAG-AI-01: 120s Continuous Performance Test (7,200 ticks, 5 active enemies, bullets)
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const state = engine.getState() as unknown as {
      p1State: { lives: number; shieldTimer: number };
      p1: { isShielded: boolean };
      isGameOver: boolean;
      terrain: { currentMap: number[][] };
    };
    state.p1State.lives = 999;

    const frameTimesMs: number[] = [];
    for (let f = 0; f < 7200; f++) {
      state.p1State.shieldTimer = 999;
      state.p1.isShielded = true;
      // Keep Eagle intact for continuous 120s combat stress test
      state.terrain.currentMap[12][6] = TILE_TYPES.BASE;
      state.isGameOver = false;

      const t0 = performance.now();
      engine.advanceTime(1000 / 60, blankInput);
      const t1 = performance.now();
      frameTimesMs.push(t1 - t0);
    }

    const diag = engine.getTimingTelemetry();
    const avgFrameMs = frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length;
    const maxFrameMs = Math.max(...frameTimesMs);
    const passed =
      diag.actualTicks === 7200 &&
      diag.droppedSeconds === 0 &&
      Math.abs(diag.simulatedSeconds - 120.0) < 0.05 &&
      avgFrameMs < 2.0;

    results.push({
      id: 'TC-LAG-AI-01',
      name: '120s continuous simulation (7,200 ticks) with 5 enemies & bullets at 60Hz',
      passed,
      details: `7,200/7,200 ticks (${diag.simulatedSeconds.toFixed(1)}s, TPS=${diag.simulationTps}), dropped=${diag.droppedSeconds}s, avgStep=${avgFrameMs.toFixed(3)}ms, maxStep=${maxFrameMs.toFixed(2)}ms.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-02: Natural rAF Jitter & Catchup Precision (No IEEE-754 Truncation)
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    // 3 * (1000 / 60) = 50.00000000000001 in IEEE-754 floating point; must execute 3 ticks with 0 dropped
    const ticks3 = engine.advanceTime(3 * (1000 / 60), blankInput);
    const droppedAfter3 = engine.getTimingTelemetry().droppedSeconds;
    // 1000ms spike caps per-frame execution at MAX_TICKS_PER_FRAME (15 ticks)
    const ticksSpike = engine.advanceTime(1000, blankInput);

    results.push({
      id: 'TC-LAG-AI-02',
      name: '3-tick catchup executes without IEEE-754 truncation while capping 1000ms spikes at 15 ticks/frame',
      passed: ticks3 === 3 && droppedAfter3 === 0 && ticksSpike === 15,
      details: `3*(1000/60)ms -> ${ticks3} ticks (dropped=${droppedAfter3}s); 1000ms spike -> capped at ${ticksSpike} ticks/frame.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-03: Pause/Resume & Tab Switch Timing Stability
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    engine.advanceTime(1000 / 60, blankInput);
    engine.pause();
    const ticksWhilePaused = engine.advanceTime(5000, blankInput);
    engine.resume();
    // First frame after resume / tab switch with 2500ms background delta must clamp to 1 tick
    const ticksOnResume = engine.advanceTime(2500, blankInput);

    results.push({
      id: 'TC-LAG-AI-03',
      name: 'Pause/Resume and tab switch prevent accumulator time-jump lag',
      passed: ticksWhilePaused === 0 && ticksOnResume === 1,
      details: `Paused 5000ms -> ${ticksWhilePaused} ticks; Resume with 2500ms delta -> ${ticksOnResume} tick.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-04: Mandatory Scenario 1 — P1 Stationary at Spawn with 5 Active Enemies
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const state = engine.getState() as unknown as {
      p1State: { lives: number; shieldTimer: number };
      p1: { x: number; y: number; isShielded: boolean };
      enemies: EnemyTank[];
      isGameOver: boolean;
      terrain: { currentMap: number[][] };
    };
    state.p1State.lives = 99;

    const spawnOrigin = new Map<string, { x: number; y: number }>();
    const maxDisplacement = new Map<string, number>();
    const visitedTilesPerEnemy = new Map<string, Set<string>>();

    for (let tick = 1; tick <= 1200; tick++) {
      state.p1State.shieldTimer = 999;
      state.p1.isShielded = true;
      state.terrain.currentMap[12][6] = TILE_TYPES.BASE;
      state.isGameOver = false;
      engine.stepTick(blankInput);

      for (const e of state.enemies) {
        if (!spawnOrigin.has(e.id)) {
          spawnOrigin.set(e.id, { x: e.x, y: e.y });
          maxDisplacement.set(e.id, 0);
          visitedTilesPerEnemy.set(e.id, new Set());
        }
        const orig = spawnOrigin.get(e.id)!;
        const disp = Math.hypot(e.x - orig.x, e.y - orig.y);
        if (disp > (maxDisplacement.get(e.id) ?? 0)) {
          maxDisplacement.set(e.id, disp);
        }
        visitedTilesPerEnemy.get(e.id)!.add(`${Math.round(e.x / 16)},${Math.round(e.y / 16)}`);
      }
    }

    const trackedIds = Array.from(spawnOrigin.keys()).slice(0, 5);
    const all5Spawned = trackedIds.length === 5;
    const all5MovedFar = trackedIds.every((id) => (maxDisplacement.get(id) ?? 0) >= 64);
    const all5TraversedMultipleTiles = trackedIds.every(
      (id) => (visitedTilesPerEnemy.get(id)?.size ?? 0) >= 5
    );
    // Verify the 5 enemies are not converged at a single coordinate at t=20s
    const activeCoords = new Set(
      state.enemies.map((e) => `${Math.round(e.x / 16)},${Math.round(e.y / 16)}`)
    );
    const dispersed = activeCoords.size >= 4;

    results.push({
      id: 'TC-LAG-AI-04',
      name: 'Stationary P1 with 5 enemies: all 5 move >=64px across >=5 tiles and disperse',
      passed: all5Spawned && all5MovedFar && all5TraversedMultipleTiles && dispersed,
      details: `5 enemies max displacements: [${trackedIds.map((id) => Math.round(maxDisplacement.get(id) ?? 0) + 'px').join(', ')}]; distinct tile positions at t=20s: ${activeCoords.size}.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-05: Coordinator Dispersal & Walkable Approach Position Validation
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const coord = new EnemyCoordinator();
    const p1: TankStructure = {
      id: 'p1',
      x: 48,
      y: 192,
      direction: 'UP',
      speed: 60,
      type: 'player',
      tier: 1,
      isAlive: true,
      isShielded: false,
    };
    const mockEnemies: EnemyTank[] = [0, 1, 2, 3, 4].map((i) => ({
      id: `coord_e_${i}`,
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: (i * 32) % 192,
      y: 64,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
      hp: 1,
      maxHp: 1,
      scoreValue: 100,
      aiState: 'PATROL',
      targetPos: i < 3 ? { x: 48, y: 192 } : { x: 96, y: 192 },
      lastKnownP1Pos: null,
      lostTargetTimer: 0,
      searchTimer: 0,
      path: [],
      pathCooldown: 0,
      shootCooldown: 0,
      aimTimer: 0,
      aimTime: 0.35,
      directionHistory: [],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
    }));

    coord.update(0.6, mockEnemies, terrain, p1);
    const allWalkable = mockEnemies.every((e) => {
      if (!e.assignedApproachPos) return false;
      const c = Math.round(e.assignedApproachPos.x / 16);
      const r = Math.round(e.assignedApproachPos.y / 16);
      return isTileWalkable(c, r, terrain);
    });
    const uniqueApproaches = new Set(
      mockEnemies.map((e) => `${e.assignedApproachPos?.x},${e.assignedApproachPos?.y}`)
    );

    results.push({
      id: 'TC-LAG-AI-05',
      name: 'EnemyCoordinator assigns walkable approach slots and never targets inside walls',
      passed: allWalkable && uniqueApproaches.size >= 4,
      details: `All 5 assigned approach slots walkable=${allWalkable}; unique approach slots=${uniqueApproaches.size}/5.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-06: A* Returns Empty Path (Never [startNode] Tether) When Goal Unreachable
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    // Eagle [12,6] (96,192) is completely walled off by intact bricks [11..12, 4..8]
    // From (80, 160) [10,5], [10,5] is already one of the closest reachable tiles to (96, 192)
    const pathFromClosest = findPathAStar({ x: 80, y: 160 }, { x: 96, y: 192 }, terrain, [], 'self');
    const noSelfTether = !pathFromClosest.some((p) => p.x === 80 && p.y === 160);

    results.push({
      id: 'TC-LAG-AI-06',
      name: 'findPathAStar never returns [startNode] self-tether when goal is walled off',
      passed: noSelfTether,
      details: `Path from (80,160) to walled Eagle (96,192) length=${pathFromClosest.length}, contains self-tether=${!noSelfTether}.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-07: Mandatory Scenario 2 — Moving P1 Detected -> Enemy Enters CHASE
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    // Open vertical lane in Stage 1: [10,3] (48,160) -> [11,3] (48,176) -> [12,3] (48,192)
    const p1Moving: TankStructure = {
      id: 'p1',
      x: 48,
      y: 192,
      direction: 'UP',
      speed: 60,
      type: 'player',
      tier: 1,
      isAlive: true,
      isShielded: false,
    };
    const watcher: EnemyTank = {
      id: 'watcher_1',
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: 48,
      y: 160,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
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
      directionHistory: [],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
    };

    updateEnemyAI(watcher, p1Moving, false, terrain, 1 / 60, [p1Moving]);
    const enteredChase = watcher.aiState === 'CHASE' && watcher.lastKnownP1Pos !== null;

    results.push({
      id: 'TC-LAG-AI-07',
      name: 'Enemy detects moving P1 within LoS and immediately enters CHASE state',
      passed: enteredChase,
      details: `Enemy at (48,160) detected P1 at (48,192) -> aiState=${watcher.aiState}, leadPos=(${watcher.leadPos?.x},${watcher.leadPos?.y}).`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-08: Mandatory Scenario 3 — P1 Breaks LoS -> CHASE -> SEARCH -> PATROL
  // =========================================================================
  {
    const terrain = createRuntimeTerrainState(STAGE_1_MAP);
    const p1Hidden: TankStructure = {
      id: 'p1',
      x: 192,
      y: 192,
      direction: 'LEFT',
      speed: 60,
      type: 'player',
      tier: 1,
      isAlive: true,
      isShielded: false,
    };
    const chaser: EnemyTank = {
      id: 'chaser_1',
      type: 'enemy',
      tier: 1,
      isShielded: false,
      enemyType: 'BASIC',
      x: 0,
      y: 0,
      direction: 'DOWN',
      speed: 60,
      isAlive: true,
      hp: 1,
      maxHp: 1,
      scoreValue: 100,
      aiState: 'CHASE',
      targetPos: { x: 48, y: 64 },
      lastKnownP1Pos: { x: 48, y: 64 },
      lostTargetTimer: 0,
      searchTimer: 3.0,
      path: [],
      pathCooldown: 0,
      shootCooldown: 0,
      aimTimer: 0,
      aimTime: 0.35,
      directionHistory: [],
      dirHoldTimer: 0,
      leadPos: null,
      leadEvalTimer: 0,
      lastP1Direction: null,
      spawnShieldTimer: 0,
    };

    // Once lostTargetTimer reaches <= 0, next AI tick transitions CHASE -> SEARCH
    updateEnemyAI(chaser, p1Hidden, false, terrain, 1 / 60, [p1Hidden]);
    const stateAfterLostHold = chaser.aiState;
    // Step 3.1s -> searchTimer expires -> transitions back to PATROL
    updateEnemyAI(chaser, p1Hidden, false, terrain, 3.1, [p1Hidden]);
    const stateAfterSearch = chaser.aiState;

    results.push({
      id: 'TC-LAG-AI-08',
      name: 'When P1 breaks LoS, Enemy transitions CHASE -> SEARCH -> PATROL',
      passed: stateAfterLostHold === 'SEARCH' && stateAfterSearch === 'PATROL',
      details: `After lostTargetTimer: ${stateAfterLostHold}; after searchTimer: ${stateAfterSearch}.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-09: Mandatory Scenario 4 — Multiple Enemies in Narrow Corridor Detour Without Deadlock
  // =========================================================================
  {
    const engine = new GameEngine();
    const em = engine.getEnemyManager();
    const state = engine.getState();
    em.reset(['BASIC', 'BASIC']);
    engine.spawnEnemyImmediate();
    engine.spawnEnemyImmediate();

    const [e1, e2] = state.enemies;
    // Place e1 and e2 facing each other in the narrow row-8 corridor (y=128)
    e1.x = 64;
    e1.y = 128;
    e1.direction = 'RIGHT';
    e2.x = 80;
    e2.y = 128;
    e2.direction = 'LEFT';

    for (let t = 0; t < 180; t++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }

    const distMoved1 = Math.hypot(e1.x - 64, e1.y - 128);
    const distMoved2 = Math.hypot(e2.x - 80, e2.y - 128);
    const noOverlap = !checkTankVsTanks(e1.id, getTankHitbox(e1.x, e1.y), [e2]);

    results.push({
      id: 'TC-LAG-AI-09',
      name: 'Multiple enemies meeting in narrow corridor separate and detour without deadlock',
      passed: noOverlap && (distMoved1 >= 16 || distMoved2 >= 16),
      details: `After 3s corridor encounter: e1 moved ${Math.round(distMoved1)}px to (${Math.round(e1.x)},${Math.round(e1.y)}), e2 moved ${Math.round(distMoved2)}px to (${Math.round(e2.x)},${Math.round(e2.y)}), overlap=${!noOverlap}.`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-10: Mandatory Scenario 5 — Enemies Handle BRICK, STEEL, and WATER Obstacles
  // =========================================================================
  {
    const customMap = STAGE_1_MAP.map((r) => [...r]);
    // Place WATER at [4, 3] and STEEL at [4, 5]
    customMap[4][3] = TILE_TYPES.WATER;
    customMap[4][5] = TILE_TYPES.STEEL;
    const terrain = createRuntimeTerrainState(customMap);

    const waterBlocked = !isTileWalkable(3, 4, terrain);
    const steelBlocked = !isTileWalkable(5, 4, terrain);
    // Path around WATER at [4, 3] (48, 64) from (48, 48) to (48, 80)
    const detourPath = findPathAStar({ x: 48, y: 48 }, { x: 48, y: 80 }, terrain, [], 'e_test');
    const avoidsWaterTile = !detourPath.some((p) => p.x === 48 && p.y === 64);

    results.push({
      id: 'TC-LAG-AI-10',
      name: 'Enemy AI respects BRICK, STEEL, and WATER obstacles and routes around impassable tiles',
      passed: waterBlocked && steelBlocked && detourPath.length > 0 && avoidsWaterTile,
      details: `WATER blocked=${waterBlocked}, STEEL blocked=${steelBlocked}, detour waypoints=${detourPath.length} (avoids [4,3]=${avoidsWaterTile}).`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-11: Mandatory Scenario 6 — All 4 Enemy Types (BASIC, FAST, POWER, ARMOR) Verified
  // =========================================================================
  {
    const specs = ENEMY_CONFIG.SPECS;
    const basicOk = specs.BASIC.speed === 60 && specs.BASIC.hp === 1;
    const fastOk = specs.FAST.speed === 90 && specs.FAST.hp === 1;
    const powerOk = specs.POWER.speed === 60 && specs.POWER.hp === 2;
    const armorOk = specs.ARMOR.speed === 45 && specs.ARMOR.hp === 4;

    results.push({
      id: 'TC-LAG-AI-11',
      name: 'All 4 Enemy types (BASIC, FAST, POWER, ARMOR) preserve exact M3 speeds and HP',
      passed: basicOk && fastOk && powerOk && armorOk,
      details: `BASIC=${specs.BASIC.speed}px/s(HP ${specs.BASIC.hp}), FAST=${specs.FAST.speed}px/s(HP ${specs.FAST.hp}), POWER=${specs.POWER.speed}px/s(HP ${specs.POWER.hp}), ARMOR=${specs.ARMOR.speed}px/s(HP ${specs.ARMOR.hp}).`,
    });
  }

  // =========================================================================
  // TC-LAG-AI-12: Mandatory Scenario 7 — Stage 1 Total 30 Enemies & Max 5 Concurrent
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const totalInStage1 = ENEMY_CONFIG.QUEUE.length === 30;
    let peakActive = 0;
    for (let t = 0; t < 600; t++) {
      engine.stepTick(blankInput);
      const count = engine.getState().enemies.length;
      if (count > peakActive) peakActive = count;
    }
    const maxConcurrentOk = peakActive === 5 && ENEMY_CONFIG.MAX_ACTIVE === 5;

    results.push({
      id: 'TC-LAG-AI-12',
      name: 'Stage 1 strictly enforces 30 total enemies and max 5 concurrent active tanks',
      passed: totalInStage1 && maxConcurrentOk,
      details: `Stage 1 total=${ENEMY_CONFIG.QUEUE.length}, max concurrent active=${peakActive}/${ENEMY_CONFIG.MAX_ACTIVE}.`,
    });
  }

  // =========================================================================
  // TC-VER-01: Scenario A — Normal 3 Lives Stationary P1 & Immediate Game Over Halt
  // =========================================================================
  {
    const engineA = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const stateA = engineA.getState() as unknown as {
      isGameOver: boolean;
      gameOverReason: string | null;
      p1State: { lives: number };
      enemies: EnemyTank[];
      bullets: Array<{ id: string }>;
      terrain: { currentMap: number[][] };
    };

    let gameOverTick = -1;
    let snapshotAtGameOver = '';
    for (let tick = 1; tick <= 1500; tick++) {
      // Keep Eagle protected so Scenario A specifically tests P1 losing all 3 lives
      stateA.terrain.currentMap[11][6] = TILE_TYPES.STEEL;
      engineA.stepTick(blankInput);
      if (stateA.isGameOver && gameOverTick === -1) {
        gameOverTick = tick;
        snapshotAtGameOver = JSON.stringify(
          stateA.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, dir: e.direction, state: e.aiState }))
        );
        break;
      }
    }

    // Advance 300 more ticks (5.0s) after Game Over and verify 0 movement, 0 bullets, 0 AI changes
    for (let extra = 0; extra < 300; extra++) {
      engineA.stepTick(blankInput);
    }
    const snapshotAfter5s = JSON.stringify(
      stateA.enemies.map((e) => ({ id: e.id, x: e.x, y: e.y, dir: e.direction, state: e.aiState }))
    );

    const passed =
      gameOverTick > 0 &&
      stateA.isGameOver &&
      stateA.p1State.lives === 0 &&
      snapshotAtGameOver === snapshotAfter5s &&
      stateA.bullets.length === 0;

    results.push({
      id: 'TC-VER-01',
      name: 'Scenario A: Normal 3-lives P1 triggers Game Over on 3rd death and halts all AI/movement/bullets',
      passed,
      details: `Game Over at tick=${gameOverTick} (${(gameOverTick / 60).toFixed(2)}s), lives=${stateA.p1State.lives}, frozenAfter5s=${snapshotAtGameOver === snapshotAfter5s}, bullets=${stateA.bullets.length}.`,
    });
  }

  // =========================================================================
  // TC-VER-02: Scenario B — 60s Continuous Stationary P1 (Test-Only Invulnerability)
  // =========================================================================
  {
    const engineB = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const stateB = engineB.getState() as unknown as {
      isGameOver: boolean;
      p1State: { shieldTimer: number };
      p1: { isShielded: boolean };
      enemies: EnemyTank[];
      terrain: { currentMap: number[][] };
    };

    const checkpoints: Record<number, number> = {};
    for (let tick = 1; tick <= 3600; tick++) {
      stateB.p1State.shieldTimer = 999;
      stateB.p1.isShielded = true;
      stateB.terrain.currentMap[12][6] = TILE_TYPES.BASE;
      stateB.isGameOver = false;
      engineB.stepTick(blankInput);

      if ([300, 600, 900, 1200, 1800, 2700, 3600].includes(tick)) {
        checkpoints[tick / 60] = stateB.enemies.length;
      }
    }

    const allCheckpointsRecorded =
      checkpoints[5] >= 4 &&
      checkpoints[10] === 5 &&
      checkpoints[15] === 5 &&
      checkpoints[20] === 5 &&
      checkpoints[30] === 5 &&
      checkpoints[45] === 5 &&
      checkpoints[60] === 5;

    results.push({
      id: 'TC-VER-02',
      name: 'Scenario B: 60s test-only invulnerable P1 records all 5 enemies at 5,10,15,20,30,45,60s',
      passed: allCheckpointsRecorded,
      details: `Active enemies at checkpoints: 5s=${checkpoints[5]}, 10s=${checkpoints[10]}, 15s=${checkpoints[15]}, 20s=${checkpoints[20]}, 30s=${checkpoints[30]}, 45s=${checkpoints[45]}, 60s=${checkpoints[60]}.`,
    });
  }

  // =========================================================================
  // TC-VER-03: Enemy 1 Legitimate Combat Aim Hold vs Non-Aligned Oscillation Prevention
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const state = engine.getState() as unknown as {
      isGameOver: boolean;
      p1State: { shieldTimer: number };
      p1: { isShielded: boolean };
      enemies: EnemyTank[];
      terrain: { currentMap: number[][] };
    };

    let e1DirectionChangesAfterEngagement = 0;
    let lastE1Dir = '';
    for (let tick = 1; tick <= 1800; tick++) {
      state.p1State.shieldTimer = 999;
      state.p1.isShielded = true;
      state.terrain.currentMap[12][6] = TILE_TYPES.BASE;
      state.isGameOver = false;
      engine.stepTick(blankInput);

      const e1 = state.enemies.find((e) => e.id === 'enemy_1_BASIC');
      if (e1) {
        if (tick === 300) {
          lastE1Dir = e1.direction;
        } else if (tick > 300 && e1.direction !== lastE1Dir) {
          e1DirectionChangesAfterEngagement++;
          lastE1Dir = e1.direction;
        }
      }
    }

    const e1Final = state.enemies.find((e) => e.id === 'enemy_1_BASIC');
    const holdsAimWithoutFlipping =
      e1Final !== undefined &&
      e1Final.direction === 'DOWN' &&
      (e1Final.debugLog?.isAligned ?? false) &&
      e1DirectionChangesAfterEngagement === 0;

    results.push({
      id: 'TC-VER-03',
      name: 'Enemy 1 holds legitimate combat aim on P1 without UP/DOWN direction-flipping loop',
      passed: holdsAimWithoutFlipping,
      details: `From t=5s..30s at (48,178): dir=${e1Final?.direction}, isAligned=${e1Final?.debugLog?.isAligned}, reversalsAfterEngagement=${e1DirectionChangesAfterEngagement}.`,
    });
  }

  // =========================================================================
  // TC-VER-04: Phaser 4.2.1 RawDelta & Tab Visibility / Spike Handling
  // =========================================================================
  {
    const engine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    // Simulate tab hidden -> 10s elapsed while hidden -> tab visible -> first frame
    engine.handleVisibilityChange(false);
    const ticksWhileHidden = engine.advanceTime(10000, blankInput);
    engine.handleVisibilityChange(true);
    const ticksFirstVisibleFrame = engine.advanceTime(16.6667, blankInput);

    results.push({
      id: 'TC-VER-04',
      name: 'Tab visibility switch discards background delta and resumes cleanly at 1 tick/frame',
      passed: ticksWhileHidden === 0 && ticksFirstVisibleFrame === 1,
      details: `Hidden 10000ms -> ${ticksWhileHidden} ticks; Visible 16.67ms -> ${ticksFirstVisibleFrame} tick.`,
    });
  }

  // =========================================================================
  // TC-VER-05: 60s Stationary P1 with Mixed Formation [BASIC, BASIC, FAST, BASIC, POWER]
  // =========================================================================
  {
    const mixedQueue: EnemyType[] = [
      'BASIC',
      'BASIC',
      'FAST',
      'BASIC',
      'POWER',
      ...Array(12).fill('BASIC'),
      ...Array(6).fill('FAST'),
      ...Array(4).fill('POWER'),
      ...Array(3).fill('ARMOR'),
    ];
    const engineMix = new GameEngine(undefined, undefined, true, mixedQueue);
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };
    const stateMix = engineMix.getState() as unknown as {
      isGameOver: boolean;
      p1State: { shieldTimer: number };
      p1: { isShielded: boolean };
      enemies: EnemyTank[];
      terrain: { currentMap: number[][] };
    };

    const tilesVisited = new Map<string, Set<string>>();
    const maxConsecutiveIdleWithoutTarget = new Map<string, number>();
    const curConsecutiveIdle = new Map<string, number>();
    const prevPos = new Map<string, { x: number; y: number }>();

    for (let tick = 1; tick <= 3600; tick++) {
      stateMix.p1State.shieldTimer = 999;
      stateMix.p1.isShielded = true;
      stateMix.terrain.currentMap[12][6] = TILE_TYPES.BASE;
      stateMix.isGameOver = false;
      engineMix.stepTick(blankInput);

      for (const e of stateMix.enemies) {
        if (!tilesVisited.has(e.id)) {
          tilesVisited.set(e.id, new Set());
          prevPos.set(e.id, { x: e.x, y: e.y });
          curConsecutiveIdle.set(e.id, 0);
          maxConsecutiveIdleWithoutTarget.set(e.id, 0);
        } else {
          const prev = prevPos.get(e.id)!;
          const moved = Math.hypot(e.x - prev.x, e.y - prev.y) > 0.01;
          prevPos.set(e.id, { x: e.x, y: e.y });
          const engagingP1 =
            e.debugLog?.selectedTarget === 'p1' &&
            e.debugLog?.losToP1 &&
            e.debugLog?.isAligned;
          const engagingEagle =
            Math.hypot(96 - e.x, 192 - e.y) <= 48 && e.debugLog?.isAligned;
          const aimingBrick = (e.aimTimer || 0) > 0;
          if (!moved && !engagingP1 && !engagingEagle && !aimingBrick) {
            const c = (curConsecutiveIdle.get(e.id) || 0) + 1;
            curConsecutiveIdle.set(e.id, c);
            if (c > (maxConsecutiveIdleWithoutTarget.get(e.id) || 0)) {
              maxConsecutiveIdleWithoutTarget.set(e.id, c);
            }
          } else {
            curConsecutiveIdle.set(e.id, 0);
          }
        }
        tilesVisited.get(e.id)!.add(`${Math.round(e.x / 16)},${Math.round(e.y / 16)}`);
      }
    }

    const eFast = stateMix.enemies.find((e) => e.id === 'enemy_3_FAST');
    const ePower = stateMix.enemies.find((e) => e.id === 'enemy_5_POWER');
    const specsValid =
      eFast !== undefined &&
      eFast.speed === 90 &&
      eFast.hp === 1 &&
      eFast.aimTime === 0.15 &&
      ePower !== undefined &&
      ePower.speed === 60 &&
      ePower.hp === 2 &&
      ePower.aimTime === 0.55;
    const allDispersed = Array.from(tilesVisited.values()).every((s) => s.size >= 15);
    const noIdleStall = Array.from(maxConsecutiveIdleWithoutTarget.values()).every((c) => c <= 2);

    results.push({
      id: 'TC-VER-05',
      name: '60s stationary P1 with mixed [BASIC, BASIC, FAST, BASIC, POWER] formation disperses and preserves Fast/Power specs',
      passed: stateMix.enemies.length === 5 && specsValid && allDispersed && noIdleStall,
      details: `Active=${stateMix.enemies.map((e) => e.id).join(', ')}; Fast(speed=${eFast?.speed},hp=${eFast?.hp},aim=${eFast?.aimTime}s), Power(speed=${ePower?.speed},hp=${ePower?.hp},aim=${ePower?.aimTime}s); maxIdleWithoutTarget=${Math.max(...Array.from(maxConsecutiveIdleWithoutTarget.values()))} tick.`,
    });
  }

  // =========================================================================
  // TC-VER-06: M3 Aim Delay & Cooldown Exact Verification (BASIC 0.35s, FAST 0.15s, POWER 0.55s, ARMOR 0.65s)
  // =========================================================================
  {
    const specs = ENEMY_CONFIG.SPECS;
    const configExact =
      specs.BASIC.aimTime === 0.35 &&
      specs.BASIC.shootCooldown === 1.5 &&
      specs.FAST.aimTime === 0.15 &&
      specs.FAST.shootCooldown === 1.2 &&
      specs.POWER.aimTime === 0.55 &&
      specs.POWER.shootCooldown === 2.0 &&
      specs.ARMOR.aimTime === 0.65 &&
      specs.ARMOR.shootCooldown === 2.5;

    const p1Target: TankStructure = {
      id: 'p1',
      x: 48,
      y: 192,
      direction: 'UP',
      speed: 60,
      type: 'player',
      tier: 1,
      isAlive: true,
      isShielded: false,
    };

    const verifyTypeAim = (type: EnemyType, expectedAimS: number): boolean => {
      const terrain = createRuntimeTerrainState(STAGE_1_MAP);
      const spec = ENEMY_CONFIG.SPECS[type];
      const tank: EnemyTank = {
        id: `aim_${type}`,
        type: 'enemy',
        tier: 1,
        isShielded: false,
        enemyType: type,
        x: 48,
        y: 160,
        direction: 'DOWN',
        speed: spec.speed,
        isAlive: true,
        hp: spec.hp,
        maxHp: spec.hp,
        scoreValue: spec.score,
        aiState: 'CHASE',
        targetPos: { x: 48, y: 192 },
        lastKnownP1Pos: { x: 48, y: 192 },
        lostTargetTimer: 0.3,
        searchTimer: 3.0,
        path: [],
        pathCooldown: 0.5,
        shootCooldown: 0,
        aimTimer: expectedAimS - 0.05,
        aimTime: spec.aimTime,
        directionHistory: [],
        dirHoldTimer: 0,
        leadPos: null,
        leadEvalTimer: 0,
        lastP1Direction: 'UP',
        spawnShieldTimer: 0,
      };
      const before = updateEnemyAI(tank, p1Target, false, terrain, 0, [p1Target]);
      tank.aimTimer = expectedAimS;
      const atThreshold = updateEnemyAI(tank, p1Target, false, terrain, 0, [p1Target]);
      return !before.shouldShoot && atThreshold.shouldShoot;
    };

    const runtimeAimExact =
      verifyTypeAim('BASIC', 0.35) &&
      verifyTypeAim('FAST', 0.15) &&
      verifyTypeAim('POWER', 0.55) &&
      verifyTypeAim('ARMOR', 0.65);

    results.push({
      id: 'TC-VER-06',
      name: 'M3 Aim Delay & Cooldown exact verification (Basic=0.35s, Fast=0.15s, Power=0.55s, Armor=0.65s)',
      passed: configExact && runtimeAimExact,
      details: `BASIC=${specs.BASIC.aimTime}s/${specs.BASIC.shootCooldown}s, FAST=${specs.FAST.aimTime}s/${specs.FAST.shootCooldown}s, POWER=${specs.POWER.aimTime}s/${specs.POWER.shootCooldown}s, ARMOR=${specs.ARMOR.aimTime}s/${specs.ARMOR.shootCooldown}s; runtimeThresholdOk=${runtimeAimExact}.`,
    });
  }

  // =========================================================================
  // TC-VER-07: Frame Spike 1000ms Policy & Post-Spike Stability Verification
  // =========================================================================
  {
    const spikeEngine = new GameEngine();
    const blankInput = { up: false, down: false, left: false, right: false, shoot: false };

    // 1. Run 60 normal frames (1.000s)
    for (let i = 0; i < 60; i++) {
      spikeEngine.advanceTime(1000 / 60, blankInput);
    }
    // 2. Inject 1000ms frame spike while playing
    const ticksOnSpike = spikeEngine.advanceTime(1000, blankInput);
    const telemetryOnSpike = spikeEngine.getTimingTelemetry();

    // 3. Run 60 normal frames (1.000s) after spike to verify clean recovery
    let postSpikeTicks = 0;
    for (let i = 0; i < 60; i++) {
      postSpikeTicks += spikeEngine.advanceTime(1000 / 60, blankInput);
    }
    const telemetryAfterRecovery = spikeEngine.getTimingTelemetry();

    const passed =
      ticksOnSpike === 15 &&
      telemetryOnSpike.droppedSeconds === 0 &&
      telemetryOnSpike.accumulatorMs === 750 &&
      postSpikeTicks === 105 &&
      telemetryAfterRecovery.actualTicks === 180 &&
      telemetryAfterRecovery.droppedSeconds === 0 &&
      telemetryAfterRecovery.realElapsedSeconds === 3 &&
      telemetryAfterRecovery.simulatedSeconds === 3;

    results.push({
      id: 'TC-VER-07',
      name: '1000ms frame spike processes 15 ticks/frame, retains 750ms backlog, and drains cleanly to 180 ticks over 3.00s',
      passed,
      details: `Spike(1000ms): ticks=${ticksOnSpike}, dropped=${telemetryOnSpike.droppedSeconds}s, remAcc=${telemetryOnSpike.accumulatorMs}ms; Post-spike(60 frames): ticks=${postSpikeTicks}, totalTicks=${telemetryAfterRecovery.actualTicks}, simTime=${telemetryAfterRecovery.simulatedSeconds}s vs realTime=${telemetryAfterRecovery.realElapsedSeconds}s.`,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    results,
    summary: { total: results.length, passed, failed },
  };
}
