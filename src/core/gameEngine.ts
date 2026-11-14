/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SIMULATION_CONFIG,
  MATCH_TIMER_CONFIG,
  getMatchDurationSecondsForDifficulty,
  P1_CONFIG,
  ENEMY_CONFIG,
  TANK_CONFIG,
} from './constants.ts';
import {
  type GameCoreState,
  type GuestVisualInterpolationState,
  type SnapshotRejectErrorCode,
  type SnapshotValidationResult,
  type InputState,
  type Direction,
  type RuntimeTerrainState,
  type TankStructure,
  type BulletStructure,
  type EnemyType,
  type EnemyTank,
  type AABB,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { createP1Tank, createP2Tank, updateTankMovement } from './tank.ts';
import { spawnBullet, updateBullet } from './bullet.ts';
import { EnemyManager } from './enemyManager.ts';
import { AllyAIController } from './ai/allyAI.ts';
import {
  checkBulletVsBullet,
  checkTankVsTanks,
  checkHitboxVsTerrain,
  getBulletHitbox,
  getTankHitbox,
  intersectAABB,
  trySafeGridSnap,
} from './physics.ts';
import { findPathAStar } from './ai/pathfinding.ts';
import { MATCH_STATES, MatchStateMachine, type MatchState } from './matchState.ts';
import { StageManager, type StageDefinition } from './stageManager.ts';
import { ScoreManager } from './scoreManager.ts';
import type { CombatEvent, CombatEventType } from './types.ts';

export const NEUTRAL_INPUT: Readonly<InputState> = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
});

export function validateAndNormalizeAuthoritativeSnapshot(
  rawSnapshot: unknown,
  lastAppliedSnapshotSeq: number,
  lastAppliedStageRunSeq: number,
  lastAppliedTickCount: number
): SnapshotValidationResult & { normalized?: any } {
  const reject = (code: SnapshotRejectErrorCode): SnapshotValidationResult => ({
    valid: false,
    reason: code,
    errorCode: code,
  });

  if (!rawSnapshot || typeof rawSnapshot !== 'object') {
    return reject('INVALID_SNAPSHOT_OBJECT');
  }
  const s = rawSnapshot as Record<string, any>;

  // 1. Validate snapshotSeq (Strict Safe Integer > 0 & monotonic > lastAppliedSnapshotSeq)
  if (
    typeof s.snapshotSeq !== 'number' ||
    !Number.isSafeInteger(s.snapshotSeq) ||
    s.snapshotSeq <= 0
  ) {
    return reject('INVALID_SNAPSHOT_SEQ');
  }
  if (s.snapshotSeq <= lastAppliedSnapshotSeq) {
    return reject('STALE_SNAPSHOT_SEQ');
  }

  // 2. Validate tickCount (Strict Safe Integer >= 0)
  if (
    typeof s.tickCount !== 'number' ||
    !Number.isSafeInteger(s.tickCount) ||
    s.tickCount < 0
  ) {
    return reject('INVALID_TICK_COUNT');
  }

  // 3. Validate stageRunSeq (Strict Canonical: MUST exist and be Safe Integer >= 1; never default to 1)
  if (
    typeof s.stageRunSeq !== 'number' ||
    !Number.isSafeInteger(s.stageRunSeq) ||
    s.stageRunSeq < 1
  ) {
    return reject('INVALID_STAGE_RUN_SEQ');
  }
  if (s.stageRunSeq < lastAppliedStageRunSeq) {
    return reject('STALE_STAGE_RUN_SEQ');
  }
  if (
    s.stageRunSeq === lastAppliedStageRunSeq &&
    lastAppliedTickCount >= 0 &&
    s.tickCount < lastAppliedTickCount
  ) {
    return reject('STALE_TICK_WITHIN_SAME_RUN');
  }

  // 4. Validate difficulty ('DEFAULT' | 'EXTREME')
  if (s.difficulty !== 'DEFAULT' && s.difficulty !== 'EXTREME') {
    return reject('INVALID_DIFFICULTY');
  }
  const expectedDurationSeconds = getMatchDurationSecondsForDifficulty(s.difficulty);
  const maxTicks = expectedDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;

  // 5. Validate matchDurationSeconds
  if (
    typeof s.matchDurationSeconds !== 'number' ||
    !Number.isSafeInteger(s.matchDurationSeconds) ||
    s.matchDurationSeconds !== expectedDurationSeconds
  ) {
    return reject('MISMATCHED_MATCH_DURATION');
  }

  // 6. Validate remainingTicks in [0, maxTicks] and consistent with tickCount
  if (
    typeof s.remainingTicks !== 'number' ||
    !Number.isSafeInteger(s.remainingTicks) ||
    s.remainingTicks < 0 ||
    s.remainingTicks > maxTicks
  ) {
    return reject('INVALID_REMAINING_TICKS');
  }
  const expectedRemainingTicks = Math.max(0, maxTicks - s.tickCount);
  if (s.remainingTicks !== expectedRemainingTicks) {
    return reject('MISMATCHED_REMAINING_TICKS');
  }

  // 7. Validate remainingSeconds === Math.ceil(remainingTicks / 60)
  const expectedRemainingSeconds = Math.ceil(
    s.remainingTicks / MATCH_TIMER_CONFIG.TICKS_PER_SECOND
  );
  if (
    typeof s.remainingSeconds !== 'number' ||
    !Number.isSafeInteger(s.remainingSeconds) ||
    s.remainingSeconds !== expectedRemainingSeconds
  ) {
    return reject('MISMATCHED_REMAINING_SECONDS');
  }

  // 8. Validate stageElapsedSeconds
  if (
    typeof s.stageElapsedSeconds !== 'number' ||
    !Number.isFinite(s.stageElapsedSeconds) ||
    s.stageElapsedSeconds < 0
  ) {
    return reject('INVALID_ELAPSED_SECONDS');
  }
  const expectedElapsedSeconds =
    (maxTicks - s.remainingTicks) / MATCH_TIMER_CONFIG.TICKS_PER_SECOND;
  if (Math.abs(s.stageElapsedSeconds - expectedElapsedSeconds) > 0.05) {
    return reject('MISMATCHED_ELAPSED_SECONDS');
  }

  // 9. Validate outcome booleans & mutual exclusion
  if (
    typeof s.isGameOver !== 'boolean' ||
    typeof s.isStageClear !== 'boolean' ||
    typeof s.isTimeoutGameOver !== 'boolean' ||
    typeof s.isBaseDestroyed !== 'boolean'
  ) {
    return reject('INVALID_OUTCOME_BOOLEANS');
  }
  if (s.isGameOver && s.isStageClear) {
    return reject('CONTRADICTORY_OUTCOME_FLAGS');
  }

  // 10. Validate isTimeoutGameOver invariant before matchState & zero-ticks checks
  if (s.isTimeoutGameOver === true) {
    if (!s.isGameOver || s.isStageClear || s.remainingTicks !== 0 || s.isBaseDestroyed) {
      return reject('CONTRADICTORY_TIMEOUT_STATE');
    }
  }

  // Validate matchState consistency with outcome flags
  const validMatchStates = [
    'MENU',
    'STAGE_START',
    'PLAYING',
    'PAUSED',
    'STAGE_CLEAR',
    'GAME_OVER',
    'SUMMARY_STATS',
  ];
  if (typeof s.matchState !== 'string' || !validMatchStates.includes(s.matchState)) {
    return reject('MISMATCHED_MATCH_STATE');
  }
  if (s.isGameOver && s.matchState !== 'GAME_OVER' && s.matchState !== 'SUMMARY_STATS') {
    return reject('MISMATCHED_MATCH_STATE');
  }
  if (s.isStageClear && s.matchState !== 'STAGE_CLEAR' && s.matchState !== 'SUMMARY_STATS') {
    return reject('MISMATCHED_MATCH_STATE');
  }
  if (
    !s.isGameOver &&
    !s.isStageClear &&
    (s.matchState === 'GAME_OVER' || s.matchState === 'STAGE_CLEAR')
  ) {
    return reject('MISMATCHED_MATCH_STATE');
  }

  // 11. Validate remainingTicks === 0 terminal outcome resolution
  if (s.remainingTicks === 0 && !s.isGameOver && !s.isStageClear) {
    return reject('UNRESOLVED_ZERO_TICKS_OUTCOME');
  }

  return {
    valid: true,
    appliedSnapshotSeq: s.snapshotSeq,
    normalized: s,
  };
}

export class GameEngine {
  private state: GameCoreState;
  private stageRunSeq: number = 1;
  private lastAppliedSnapshotSeq: number = 0;
  private lastAppliedStageRunSeq: number = 0;
  private lastAppliedTickCount: number = -1;
  private accumulatorMs: number = 0;
  private lastDroppedBacklogMs: number = 0;
  private lastDroppedInputMs: number = 0;
  private lastDroppedBacklogComponentMs: number = 0;
  private catchUpTicksRemaining: number = 0;
  private justResumed: boolean = false;
  private isPaused: boolean = false;
  private isForcedSafetyPaused: boolean = false;
  private totalRealElapsedMs: number = 0;
  private totalDroppedMs: number = 0;
  private tpsAccumulatorMs: number = 0;
  private tpsTicksThisWindow: number = 0;
  private recentTps: number = 60;
  private reportedRenderFps: number = 60;
  private lastShootState: boolean = false;
  private enemyManager: EnemyManager;
  private enableEnemies: boolean;
  private stageManager: StageManager;
  private scoreManager: ScoreManager;
  private matchStateMachine: MatchStateMachine;
  private combatEvents: CombatEvent[] = [];
  private eventListeners: Map<string, Set<(payload: any) => void>> = new Map();
  private difficulty: 'DEFAULT' | 'EXTREME' = 'DEFAULT';
  private gameMode: 'SOLO' | 'TWO_PLAYERS_AI' | 'TWO_PLAYERS_ONLINE' = 'SOLO';
  private allyAI = new AllyAIController();
  private externalInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };
  private externalInputP2: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };
  private virtualTouchInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };
  private virtualTouchInputP2: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };
  private guestVisualState: GuestVisualInterpolationState = {
    p2RenderX: 144,
    p2RenderY: 192,
    p2RenderDirection: 'UP',
    p1VisualShieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
    p2VisualShieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
    interpolatedMsSinceSnapshot: 0,
  };
  private onGuestSnapshotAppliedCallback?: (
    snapshotSeq: number,
    stageRunSeq: number,
    tickCount: number
  ) => void;
  private processedPeerLeavePlayers: Set<'P1' | 'P2'> = new Set();

  public isCoopMode(): boolean {
    return this.gameMode === 'TWO_PLAYERS_AI' || this.gameMode === 'TWO_PLAYERS_ONLINE';
  }

  public isPlayerSpectator(player: 'P1' | 'P2'): boolean {
    if (player === 'P1') {
      return Boolean(
        this.state.p1State.isSpectator ||
          this.state.p1State.hasLeftMatch ||
          (this.state.p1State.isDead && this.state.p1State.lives <= 0)
      );
    }
    if (!this.state.p2State) return false;
    return Boolean(
      this.state.p2State.isSpectator ||
        this.state.p2State.hasLeftMatch ||
        (this.state.p2State.isDead && this.state.p2State.lives <= 0)
    );
  }

  /**
   * Xử lý sự kiện một người chơi chủ động rời trận trong chế độ TWO_PLAYERS_ONLINE (M7.3.9 Mục 2 - Trường hợp E):
   * - Xử lý đúng 1 lần duy nhất cho mỗi người chơi trong một trận (deduplicated).
   * - Nếu P2 rời trận khi P1 còn sống: P1 nhận thông báo "P2 đã rời trận." và tiếp tục chơi đến khi thắng hoặc thua.
   * - Nếu P1 (Host) rời trận: Guest nhận thông báo "P1 đã rời trận." và kết thúc phiên chơi an toàn.
   */
  public handlePeerPlayerLeft(
    leftPlayer: 'P1' | 'P2',
    customReason?: string
  ): { processed: boolean; noticeMessage: string; matchEnded: boolean } {
    const canonicalNotice = leftPlayer === 'P1' ? 'P1 đã rời trận.' : 'P2 đã rời trận.';
    if (this.processedPeerLeavePlayers.has(leftPlayer)) {
      return {
        processed: false,
        noticeMessage: canonicalNotice,
        matchEnded: Boolean(this.state.isGameOver || this.state.isStageClear),
      };
    }
    this.processedPeerLeavePlayers.add(leftPlayer);

    if (leftPlayer === 'P2') {
      if (this.state.p2 && this.state.p2State) {
        this.state.p2.isAlive = false;
        this.state.p2State.lives = 0;
        this.state.p2State.isDead = true;
        this.state.p2State.isSpectator = true;
        this.state.p2State.hasLeftMatch = true;
        this.state.p2State.respawnTimer = 0;
        this.state.p2State.waitingForClearSpawn = false;
      }
      this.externalInputP2 = { ...NEUTRAL_INPUT };
      this.state.bullets = this.state.bullets.filter((b) => b.ownerId !== 'p2');
      this.state.peerLeaveNotice = canonicalNotice;
      this.state.diagnosticLog = customReason || canonicalNotice;

      const p1CanContinue = this.state.p1State.lives > 0 || !this.state.p1State.isDead;
      if (!p1CanContinue && !this.state.isGameOver && !this.state.isStageClear) {
        this.state.isGameOver = true;
        this.state.isStageClear = false;
        this.state.isTimeoutGameOver = false;
        this.state.matchState = MATCH_STATES.GAME_OVER;
        this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
      }

      return {
        processed: true,
        noticeMessage: canonicalNotice,
        matchEnded: Boolean(this.state.isGameOver || this.state.isStageClear),
      };
    }

    // leftPlayer === 'P1' (Host left match)
    this.state.p1.isAlive = false;
    this.state.p1State.lives = 0;
    this.state.p1State.isDead = true;
    this.state.p1State.isSpectator = true;
    this.state.p1State.hasLeftMatch = true;
    this.state.p1State.respawnTimer = 0;
    this.clearAllInputs();
    this.state.peerLeaveNotice = canonicalNotice;
    this.state.diagnosticLog = customReason || canonicalNotice;

    if (!this.state.isStageClear) {
      this.state.isGameOver = true;
      this.state.isTimeoutGameOver = false;
      this.state.gameOverReason = canonicalNotice;
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    }

    return {
      processed: true,
      noticeMessage: canonicalNotice,
      matchEnded: true,
    };
  }

  public on(event: string, callback: (payload: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  public emit(event: string, payload?: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(e);
        }
      });
    }
  }

  public popCombatEvents(): CombatEvent[] {
    const events = [...this.combatEvents];
    this.combatEvents = [];
    return events;
  }

  private emitCombatEvent(type: CombatEventType, x: number, y: number): void {
    this.combatEvents.push({
      id: `evt_${this.state.tickCount}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      x,
      y,
      createdAtTick: this.state.tickCount,
    });
    this.emit(type, { x, y, type });
  }

  constructor(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = true,
    customEnemyQueue?: EnemyType[]
  ) {
    this.enableEnemies = enableEnemies;
    this.stageManager = new StageManager();
    this.scoreManager = new ScoreManager();
    this.matchStateMachine = new MatchStateMachine(MATCH_STATES.PLAYING);
    this.enemyManager = new EnemyManager();
    if (customEnemyQueue) {
      this.enemyManager.reset(customEnemyQueue);
    }

    const currentStage = this.stageManager.getCurrentStage();
    this.stageRunSeq = 1;
    const matchDurationSeconds = getMatchDurationSecondsForDifficulty(this.difficulty);
    const remainingTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;

    this.state = {
      tickCount: 0,
      stageRunSeq: this.stageRunSeq,
      p1: customP1 ?? createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: currentStage.id,
      currentStageName: currentStage.name,
      currentStageVersion: currentStage.version ?? 1,
      stageElapsedSeconds: 0,
      matchDurationSeconds,
      remainingTicks,
      remainingSeconds: matchDurationSeconds,
      terrain: customTerrain ?? createRuntimeTerrainState(currentStage.map),
      isGameOver: false,
      isStageClear: false,
      isTimeoutGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
    this.syncGuestVisualStateFromAuthoritative();
  }

  public getDifficulty(): 'DEFAULT' | 'EXTREME' {
    return this.difficulty;
  }

  public setDifficulty(diff: 'DEFAULT' | 'EXTREME'): void {
    if (diff !== 'DEFAULT' && diff !== 'EXTREME') return;
    // Prevent mid-match difficulty tampering once simulation ticks have started
    if (this.state.tickCount > 0 && this.state.matchState !== MATCH_STATES.MENU) {
      return;
    }
    this.difficulty = diff;
    this.state.difficulty = diff;
    const matchDurationSeconds = getMatchDurationSecondsForDifficulty(diff);
    const remainingTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;
    this.state.matchDurationSeconds = matchDurationSeconds;
    this.state.remainingTicks = remainingTicks;
    this.state.remainingSeconds = matchDurationSeconds;
    this.state.stageElapsedSeconds = 0;
    this.state.isTimeoutGameOver = false;
  }

  public getGameMode(): 'SOLO' | 'TWO_PLAYERS_AI' | 'TWO_PLAYERS_ONLINE' {
    return this.gameMode;
  }

  public setGameMode(mode: 'SOLO' | 'TWO_PLAYERS_AI' | 'TWO_PLAYERS_ONLINE'): void {
    this.gameMode = mode;
    this.state.gameMode = mode;
  }

  public getState(): Readonly<GameCoreState> {
    return this.state;
  }

  public getEnemyManager(): EnemyManager {
    return this.enemyManager;
  }

  public getStageManager(): StageManager {
    return this.stageManager;
  }

  public getScoreManager(): ScoreManager {
    return this.scoreManager;
  }

  public getStateMachine(): MatchStateMachine {
    return this.matchStateMachine;
  }

  public getMatchState(): MatchState {
    return this.state.matchState;
  }

  public isSafetyPaused(): boolean {
    return this.isForcedSafetyPaused;
  }

  public clearAllInputs(): void {
    this.externalInput = { ...NEUTRAL_INPUT };
    this.externalInputP2 = { ...NEUTRAL_INPUT };
    this.virtualTouchInput = { ...NEUTRAL_INPUT };
    this.virtualTouchInputP2 = { ...NEUTRAL_INPUT };
    this.lastShootState = false;
  }

  public setExternalInput(input: Partial<InputState>): void {
    if (
      this.isPaused ||
      this.isForcedSafetyPaused ||
      this.state.matchState !== MATCH_STATES.PLAYING ||
      this.state.p1State.isDead ||
      this.state.p1State.isSpectator ||
      this.state.p1State.hasLeftMatch
    ) {
      this.externalInput = { ...NEUTRAL_INPUT };
      return;
    }
    this.externalInput = {
      ...this.externalInput,
      ...input,
    };
  }

  public getExternalInput(): InputState {
    return { ...this.externalInput };
  }

  public setVirtualTouchInput(input: Partial<InputState>): void {
    if (
      this.isPaused ||
      this.isForcedSafetyPaused ||
      this.state.matchState !== MATCH_STATES.PLAYING ||
      this.state.p1State.isDead ||
      this.state.p1State.isSpectator ||
      this.state.p1State.hasLeftMatch
    ) {
      this.virtualTouchInput = { ...NEUTRAL_INPUT };
      return;
    }
    this.virtualTouchInput = {
      ...this.virtualTouchInput,
      ...input,
    };
  }

  public getVirtualTouchInput(): InputState {
    return { ...this.virtualTouchInput };
  }

  public setVirtualTouchInputP2(input: Partial<InputState>): void {
    if (
      this.isPaused ||
      this.isForcedSafetyPaused ||
      this.state.matchState !== MATCH_STATES.PLAYING ||
      !this.state.p2 ||
      this.state.p2State?.isDead ||
      this.state.p2State?.isSpectator ||
      this.state.p2State?.hasLeftMatch
    ) {
      this.virtualTouchInputP2 = { ...NEUTRAL_INPUT };
      return;
    }
    this.virtualTouchInputP2 = {
      ...this.virtualTouchInputP2,
      ...input,
    };
  }

  public getVirtualTouchInputP2(): InputState {
    return { ...this.virtualTouchInputP2 };
  }

  public setExternalInputP2(input: Partial<InputState>): void {
    if (
      this.isPaused ||
      this.isForcedSafetyPaused ||
      this.state.matchState !== MATCH_STATES.PLAYING ||
      !this.state.p2 ||
      this.state.p2State?.isDead ||
      this.state.p2State?.isSpectator ||
      this.state.p2State?.hasLeftMatch
    ) {
      this.externalInputP2 = { ...NEUTRAL_INPUT };
      return;
    }
    this.externalInputP2 = {
      ...this.externalInputP2,
      ...input,
    };
  }

  public getExternalInputP2(): InputState {
    return { ...this.externalInputP2 };
  }

  public pause(): boolean {
    this.clearAllInputs();
    if (this.state.matchState === MATCH_STATES.PLAYING) {
      const trans = this.matchStateMachine.transitionTo(MATCH_STATES.PAUSED);
      if (trans.success) {
        this.isPaused = true;
        this.accumulatorMs = 0;
        this.lastDroppedBacklogMs = 0;
        this.catchUpTicksRemaining = 0;
        this.justResumed = false;
        this.state.matchState = MATCH_STATES.PAUSED;
        return true;
      }
    }
    return false;
  }

  public resume(): boolean {
    if (this.state.matchState === MATCH_STATES.PAUSED) {
      const trans = this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING);
      if (trans.success) {
        this.isPaused = false;
        this.isForcedSafetyPaused = false;
        this.accumulatorMs = 0; // Essential: reset backlog so no time-jump occurs
        this.lastDroppedBacklogMs = 0;
        this.catchUpTicksRemaining = 0;
        this.justResumed = true;
        this.clearAllInputs();
        this.state.matchState = MATCH_STATES.PLAYING;
        return true;
      }
    }
    return false;
  }

  public restartStage(): void {
    const stage = this.stageManager.getCurrentStage();
    this.stageRunSeq += 1;
    this.accumulatorMs = 0;
    this.lastDroppedBacklogMs = 0;
    this.lastDroppedInputMs = 0;
    this.lastDroppedBacklogComponentMs = 0;
    this.catchUpTicksRemaining = 0;
    this.justResumed = false;
    this.totalRealElapsedMs = 0;
    this.totalDroppedMs = 0;
    this.tpsAccumulatorMs = 0;
    this.tpsTicksThisWindow = 0;
    this.recentTps = 60;
    this.isPaused = false;
    this.isForcedSafetyPaused = false;
    this.processedPeerLeavePlayers.clear();
    this.clearAllInputs();
    this.combatEvents = [];
    this.enemyManager.reset(stage.enemyQueue);
    this.scoreManager.resetRun();
    this.allyAI.reset();

    const matchDurationSeconds = getMatchDurationSecondsForDifficulty(this.difficulty);
    const remainingTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;

    this.state = {
      tickCount: 0,
      stageRunSeq: this.stageRunSeq,
      p1: createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
        isSpectator: false,
        hasLeftMatch: false,
      },
      p2: this.isCoopMode() ? createP2Tank() : null,
      p2State: this.isCoopMode() ? {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
        isSpectator: false,
        hasLeftMatch: false,
      } : null,
      gameMode: this.gameMode,
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: stage.id,
      currentStageName: stage.name,
      currentStageVersion: stage.version ?? 1,
      stageElapsedSeconds: 0,
      matchDurationSeconds,
      remainingTicks,
      remainingSeconds: matchDurationSeconds,
      terrain: createRuntimeTerrainState(stage.map),
      isGameOver: false,
      isStageClear: false,
      isTimeoutGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
      peerLeaveNotice: null,
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);
    this.syncGuestVisualStateFromAuthoritative();
  }

  public quitToMenu(): void {
    this.isPaused = true;
    this.isForcedSafetyPaused = false;
    this.accumulatorMs = 0;
    this.lastDroppedBacklogMs = 0;
    this.catchUpTicksRemaining = 0;
    this.processedPeerLeavePlayers.clear();
    this.resetGuestSnapshotTracking();
    this.clearAllInputs();
    this.combatEvents = [];
    this.state.isGameOver = false;
    this.state.isStageClear = false;
    this.state.isTimeoutGameOver = false;
    this.state.gameOverReason = null;
    this.state.peerLeaveNotice = null;
    this.state.bullets = [];
    this.state.bullet = null;
    this.state.matchState = MATCH_STATES.MENU;
    this.matchStateMachine.transitionTo(MATCH_STATES.MENU, true);
  }

  public startMatch(
    mode: 'SOLO' | 'TWO_PLAYERS_AI' | 'TWO_PLAYERS_ONLINE' = this.gameMode,
    difficulty: 'DEFAULT' | 'EXTREME' = this.difficulty
  ): void {
    this.gameMode = mode;
    this.difficulty = difficulty;
    this.stageManager.syncFromGlobalActiveStages();
    // Set stageRunSeq = 0 right before restartStage() so restartStage() increments 0 -> 1 (no double increment)
    this.stageRunSeq = 0;
    this.resetGuestSnapshotTracking();
    this.restartStage();
  }

  public advanceToNextStage(): boolean {
    if (!this.stageManager.hasNextStage()) {
      return false;
    }
    const nextStageId = this.stageManager.getNextStageId();
    if (!nextStageId) return false;

    this.stageManager.setCurrentStage(nextStageId);
    const stage = this.stageManager.getCurrentStage();

    this.stageRunSeq += 1;
    this.scoreManager.advanceToNextStage();
    this.accumulatorMs = 0;
    this.lastDroppedBacklogMs = 0;
    this.catchUpTicksRemaining = 0;
    this.justResumed = false;
    this.isPaused = false;
    this.isForcedSafetyPaused = false;
    this.clearAllInputs();
    this.combatEvents = [];
    this.enemyManager.reset(stage.enemyQueue);
    this.allyAI.reset();

    // Carry forward P1/P2 lives and existing total score
    const preservedLives = this.state.p1State.lives;
    const p1Eliminated = Boolean(this.state.p1State.isDead && preservedLives <= 0);
    const preservedP2Lives = this.state.p2State?.lives ?? P1_CONFIG.STARTING_LIVES;
    const p2HasLeft = Boolean(this.state.p2State?.hasLeftMatch || this.processedPeerLeavePlayers.has('P2'));
    const p2Eliminated = Boolean(
      p2HasLeft || (this.state.p2State?.isDead && preservedP2Lives <= 0)
    );
    const matchDurationSeconds = getMatchDurationSecondsForDifficulty(this.difficulty);
    const remainingTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;

    const nextP1 = createP1Tank();
    if (p1Eliminated) {
      nextP1.isAlive = false;
      nextP1.isShielded = false;
    }
    const nextP2 = this.isCoopMode() ? createP2Tank() : null;
    if (nextP2 && p2Eliminated) {
      nextP2.isAlive = false;
      nextP2.isShielded = false;
    }

    this.state = {
      tickCount: 0,
      stageRunSeq: this.stageRunSeq,
      p1: nextP1,
      p1State: {
        lives: preservedLives,
        isDead: p1Eliminated,
        respawnTimer: 0,
        shieldTimer: p1Eliminated ? 0 : P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
        isSpectator: p1Eliminated,
        hasLeftMatch: Boolean(this.state.p1State.hasLeftMatch),
      },
      p2: nextP2,
      p2State: this.isCoopMode() ? {
        lives: p2HasLeft ? 0 : preservedP2Lives,
        isDead: p2Eliminated,
        respawnTimer: 0,
        shieldTimer: p2Eliminated ? 0 : P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
        isSpectator: p2Eliminated,
        hasLeftMatch: p2HasLeft,
      } : null,
      gameMode: this.gameMode,
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: stage.id,
      currentStageName: stage.name,
      currentStageVersion: stage.version ?? 1,
      stageElapsedSeconds: 0,
      matchDurationSeconds,
      remainingTicks,
      remainingSeconds: matchDurationSeconds,
      terrain: createRuntimeTerrainState(stage.map),
      isGameOver: false,
      isStageClear: false,
      isTimeoutGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
      peerLeaveNotice: this.state.peerLeaveNotice ?? null,
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);
    this.syncGuestVisualStateFromAuthoritative();
    return true;
  }

  public reset(
    customTerrain?: RuntimeTerrainState,
    customP1?: TankStructure,
    enableEnemies: boolean = this.enableEnemies,
    customEnemyQueue?: EnemyType[]
  ): void {
    this.stageRunSeq += 1;
    this.accumulatorMs = 0;
    this.lastDroppedBacklogMs = 0;
    this.lastDroppedInputMs = 0;
    this.lastDroppedBacklogComponentMs = 0;
    this.catchUpTicksRemaining = 0;
    this.justResumed = false;
    this.processedPeerLeavePlayers.clear();
    this.resetGuestSnapshotTracking();
    this.isPaused = false;
    this.isForcedSafetyPaused = false;
    this.clearAllInputs();
    this.combatEvents = [];
    this.enableEnemies = enableEnemies;
    this.enemyManager.reset(customEnemyQueue);
    this.scoreManager.resetRun();
    this.matchStateMachine.transitionTo(MATCH_STATES.PLAYING, true);

    const currentStage = this.stageManager.getCurrentStage();
    const matchDurationSeconds = getMatchDurationSecondsForDifficulty(this.difficulty);
    const remainingTicks = matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;

    this.state = {
      tickCount: 0,
      stageRunSeq: this.stageRunSeq,
      p1: customP1 ?? createP1Tank(),
      p1State: {
        lives: P1_CONFIG.STARTING_LIVES,
        isDead: false,
        respawnTimer: 0,
        shieldTimer: P1_CONFIG.RESPAWN_SHIELD_S,
        waitingForClearSpawn: false,
        spawnCheckTimer: 0,
      },
      bullet: null,
      bullets: [],
      enemies: this.enableEnemies ? this.enemyManager.getActiveEnemies() : [],
      enemyQueue: this.enableEnemies ? this.enemyManager.getQueue() : [],
      totalDefeatedEnemies: 0,
      score: this.scoreManager.getTotalScore(),
      highScore: this.scoreManager.getHighScore(),
      defeatedCounts: this.scoreManager.getStageStats(),
      currentStageId: currentStage.id,
      currentStageName: currentStage.name,
      stageElapsedSeconds: 0,
      matchDurationSeconds,
      remainingTicks,
      remainingSeconds: matchDurationSeconds,
      terrain: customTerrain ?? createRuntimeTerrainState(currentStage.map),
      isGameOver: false,
      isStageClear: false,
      isTimeoutGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
      difficulty: this.difficulty,
      matchState: MATCH_STATES.PLAYING,
    };
    this.syncGuestVisualStateFromAuthoritative();
  }

  /**
   * Called when document.visibilityState changes.
   * - Always clears latched inputs to NEUTRAL_INPUT on tab switch.
   * - In SOLO / TWO_PLAYERS_AI: discards backlog, freezes simulation, and optionally triggers Forced Safety Pause.
   * - In TWO_PLAYERS_ONLINE: keeps simulation unpaused so Host BG_TIMER / catch-up operates seamlessly.
   */
  public handleVisibilityChange(
    isVisible: boolean,
    options?: { triggerSafetyPause?: boolean }
  ): void {
    this.clearAllInputs();

    if (this.gameMode === 'TWO_PLAYERS_ONLINE') {
      if (!isVisible) {
        this.state.diagnosticLog = 'Host background tab mode: BG_TIMER active';
      } else {
        this.state.diagnosticLog = 'Host returned to visible tab';
      }
      return;
    }

    this.accumulatorMs = 0;
    this.lastDroppedBacklogMs = 0;
    this.catchUpTicksRemaining = 0;
    if (!isVisible) {
      if (options?.triggerSafetyPause) {
        this.isForcedSafetyPaused = true;
        this.pause();
        this.state.diagnosticLog = 'Forced Safety Pause: tab hidden';
      } else {
        this.isPaused = true;
        this.justResumed = false;
      }
    } else {
      if (!this.isForcedSafetyPaused && this.state.matchState !== MATCH_STATES.PAUSED) {
        this.isPaused = false;
        this.justResumed = true; // Prevents any catch-up frame burst upon returning
        this.state.diagnosticLog = 'Resumed from background tab: accumulator reset';
      }
    }
  }

  /**
   * Directly spawn an enemy (useful for tests or immediate wave triggers).
   */
  public spawnEnemyImmediate(): EnemyTank | null {
    const allTanks = [this.state.p1, ...this.enemyManager.getActiveEnemies()];
    const enemy = this.enemyManager.trySpawnEnemy(
      this.state.terrain,
      allTanks,
      this.state.bullets
    );
    this.state.enemies = this.enemyManager.getActiveEnemies();
    this.state.enemyQueue = this.enemyManager.getQueue();
    return enemy;
  }

  /**
   * If an enemy is occupying P1's fixed spawn point (48, 192) for >= 2.0s,
   * command the occupying enemy to find a valid path to vacate using standard physics/A*.
   * Never teleports, pushes through walls, or alters physics.
   */
  public triggerSpawnAvoidance(spawnBox: AABB): void {
    const occupyingEnemies = this.state.enemies.filter(
      (e) => e.isAlive && intersectAABB(getTankHitbox(e.x, e.y), spawnBox)
    );

    for (const enemy of occupyingEnemies) {
      const escapeCandidates = [
        { x: enemy.x, y: Math.max(0, enemy.y - 32) },
        { x: Math.min(TANK_CONFIG.MAX_X, enemy.x + 32), y: enemy.y },
        { x: Math.max(0, enemy.x - 32), y: enemy.y },
        { x: enemy.x, y: Math.min(TANK_CONFIG.MAX_Y, enemy.y + 32) },
      ];

      const otherTanks = [this.state.p1, ...this.state.enemies.filter((other) => other.id !== enemy.id)];

      for (const cand of escapeCandidates) {
        const candBox = getTankHitbox(cand.x, cand.y);
        const terrColl = checkHitboxVsTerrain(candBox, this.state.terrain, { forBullet: false });
        const tankColl = checkTankVsTanks(enemy.id, candBox, otherTanks);
        if (!terrColl.collides && !tankColl) {
          const path = findPathAStar(enemy, cand, this.state.terrain, otherTanks, enemy.id);
          if (path.length > 0) {
            enemy.path = path;
            enemy.targetPos = cand;
            enemy.dirHoldTimer = 0;
            enemy.aiState = 'PATROL';
            break;
          }
        }
      }
    }
  }

  /**
   * Executes exactly one deterministic simulation tick (dt = 1/60s).
   */
  public stepTick(input: InputState): void {
    if (
      this.isPaused ||
      this.state.matchState === MATCH_STATES.PAUSED ||
      this.state.matchState === MATCH_STATES.MENU ||
      this.state.isGameOver ||
      this.state.isStageClear
    ) {
      return;
    }

    this.state.tickCount++;
    const dt = SIMULATION_CONFIG.FIXED_DT_S;

    // 1. P1 Respawn, Spectator & Shield Handling (Point H & Point A & M7.3.9)
    if (this.state.p1State.isDead) {
      if (this.state.p1State.lives <= 0) {
        this.state.p1State.respawnTimer = 0;
        this.state.p1State.waitingForClearSpawn = false;
        this.state.p1State.isSpectator = true;
        this.state.p1.isAlive = false;
      } else if (this.state.p1State.respawnTimer > 0) {
        this.state.p1State.respawnTimer -= dt;
      } else if (this.state.p1State.lives > 0) {
        // Check if spawn position (48, 192) is occupied by any enemy tank
        const spawnBox = getTankHitbox(P1_CONFIG.SPAWN_X, P1_CONFIG.SPAWN_Y);
        const isOccupied = checkTankVsTanks('p1_respawn_probe', spawnBox, this.state.enemies);

        if (isOccupied) {
          // Wait and re-check every 100ms; NEVER shift spawn coordinates
          this.state.p1State.occupiedDuration = (this.state.p1State.occupiedDuration || 0) + dt;
          this.state.p1State.waitingForClearSpawn = true;
          this.state.p1State.spawnCheckTimer = (this.state.p1State.spawnCheckTimer || 0.1) - dt;
          if (this.state.p1State.spawnCheckTimer <= 0) {
            this.state.p1State.spawnCheckTimer = 0.1;
            // If enemy occupies P1 spawn continuously for >= 2.0s, order occupying enemy to vacate
            if (this.state.p1State.occupiedDuration >= 2.0) {
              this.triggerSpawnAvoidance(spawnBox);
            }
          }
        } else {
          // Clear to spawn at fixed (48, 192)
          this.state.p1State.isDead = false;
          this.state.p1State.isSpectator = false;
          this.state.p1State.waitingForClearSpawn = false;
          this.state.p1State.spawnCheckTimer = 0;
          this.state.p1State.occupiedDuration = 0;
          this.state.p1State.shieldTimer = P1_CONFIG.RESPAWN_SHIELD_S;
          this.state.p1.x = P1_CONFIG.SPAWN_X;
          this.state.p1.y = P1_CONFIG.SPAWN_Y;
          this.state.p1.direction = P1_CONFIG.SPAWN_DIRECTION;
          this.state.p1.isAlive = true;
          this.state.p1.isShielded = true;
        }
      }
    }

    if (this.state.p1State.shieldTimer > 0) {
      this.state.p1State.shieldTimer = Math.max(0, this.state.p1State.shieldTimer - dt);
      this.state.p1.isShielded = this.state.p1State.shieldTimer > 0;
    }

    // 1b. P2 Respawn, Spectator & Shield Handling (Co-op AI & Co-op Online)
    if (this.isCoopMode() && this.state.p2 && this.state.p2State) {
      if (this.state.p2State.isDead) {
        if (this.state.p2State.lives <= 0 || this.state.p2State.hasLeftMatch) {
          this.state.p2State.respawnTimer = 0;
          this.state.p2State.waitingForClearSpawn = false;
          this.state.p2State.isSpectator = true;
          this.state.p2.isAlive = false;
          this.externalInputP2 = { ...NEUTRAL_INPUT };
        } else if (this.state.p2State.respawnTimer > 0) {
          this.state.p2State.respawnTimer -= dt;
        } else if (this.state.p2State.lives > 0) {
          const p2SpawnBox = getTankHitbox(144, 192);
          const otherTanks = [this.state.p1, ...this.state.enemies];
          const isOccupiedByTank = checkTankVsTanks('p2_respawn_probe', p2SpawnBox, otherTanks);
          const isOccupiedByBullet = this.state.bullets.some((b) =>
            intersectAABB(p2SpawnBox, getBulletHitbox(b.x, b.y))
          );
          if (isOccupiedByTank || isOccupiedByBullet) {
            this.state.p2State.occupiedDuration = (this.state.p2State.occupiedDuration || 0) + dt;
            this.state.p2State.waitingForClearSpawn = true;
            this.state.p2State.spawnCheckTimer = (this.state.p2State.spawnCheckTimer || 0.1) - dt;
            if (this.state.p2State.spawnCheckTimer <= 0) {
              this.state.p2State.spawnCheckTimer = 0.1;
              if (this.state.p2State.occupiedDuration >= 2.0) {
                this.triggerSpawnAvoidance(p2SpawnBox);
              }
            }
          } else {
            this.state.p2State.isDead = false;
            this.state.p2State.isSpectator = false;
            this.state.p2State.waitingForClearSpawn = false;
            this.state.p2State.spawnCheckTimer = 0;
            this.state.p2State.occupiedDuration = 0;
            this.state.p2State.shieldTimer = P1_CONFIG.RESPAWN_SHIELD_S;
            this.state.p2.x = 144;
            this.state.p2.y = 192;
            this.state.p2.direction = 'UP';
            this.state.p2.isAlive = true;
            this.state.p2.isShielded = true;
          }
        }
      }

      if (this.state.p2State.shieldTimer > 0) {
        this.state.p2State.shieldTimer = Math.max(0, this.state.p2State.shieldTimer - dt);
        this.state.p2.isShielded = this.state.p2State.shieldTimer > 0;
      }
    }

    // 2. P1 Tank Movement & Continuous Shooting (disabled when dead or in Spectator mode)
    if (
      this.state.p1.isAlive &&
      !this.state.p1State.isDead &&
      !this.state.p1State.isSpectator &&
      !this.state.p1State.hasLeftMatch
    ) {
      const obstaclesForP1 = (this.state.p2 && this.state.p2.isAlive && !this.state.p2State?.isDead)
        ? [...this.state.enemies, this.state.p2]
        : this.state.enemies;
      updateTankMovement(this.state.p1, input, this.state.terrain, obstaclesForP1);

      // Continuous fire: if shoot button is held down and no P1 bullet is active, immediately fire!
      const p1HasBullet = this.state.bullets.some(
        (b) => b.ownerId === this.state.p1.id || (b.ownerType === 'player' && b.ownerId !== 'p2')
      );
      if (input.shoot && !p1HasBullet) {
        const newBullet = spawnBullet(this.state.p1, null);
        if (newBullet) {
          newBullet.ownerType = 'player';
          this.state.bullets.push(newBullet);
          this.state.bullet = newBullet;
          this.emit('P1_SHOOT', newBullet);
        }
      }
      this.lastShootState = input.shoot;
    } else {
      this.lastShootState = false;
    }

    // 2b. P2 Movement & Shooting (AI in TWO_PLAYERS_AI, Human Remote Input in TWO_PLAYERS_ONLINE)
    if (
      this.gameMode === 'TWO_PLAYERS_AI' &&
      this.state.p2 &&
      this.state.p2State &&
      this.state.p2.isAlive &&
      !this.state.p2State.isDead &&
      !this.state.p2State.isSpectator
    ) {
      const p2HasBullet = this.state.bullets.some((b) => b.ownerId === 'p2');
      const p2Decision = this.allyAI.update(
        dt,
        this.state.p2,
        this.state.p1,
        this.state.enemies,
        this.state.terrain,
        p2HasBullet
      );

      const p2MoveInput: InputState = {
        up: p2Decision.direction === 'UP',
        down: p2Decision.direction === 'DOWN',
        left: p2Decision.direction === 'LEFT',
        right: p2Decision.direction === 'RIGHT',
        shoot: false,
      };

      const obstaclesForP2 = [this.state.p1, ...this.state.enemies];
      updateTankMovement(this.state.p2, p2MoveInput, this.state.terrain, obstaclesForP2);

      if (
        p2Decision.shouldShoot &&
        !p2HasBullet &&
        this.allyAI.verifySafeShotAfterTurn(
          this.state.p2,
          this.state.p1,
          this.state.enemies,
          this.state.terrain,
          p2HasBullet
        )
      ) {
        const p2Bullet = spawnBullet(this.state.p2, null);
        if (p2Bullet) {
          p2Bullet.ownerType = 'player';
          p2Bullet.ownerId = 'p2';
          this.state.bullets.push(p2Bullet);
          this.emit('P2_SHOOT', p2Bullet);
        }
      }
    } else if (
      this.gameMode === 'TWO_PLAYERS_ONLINE' &&
      this.state.p2 &&
      this.state.p2State &&
      this.state.p2.isAlive &&
      !this.state.p2State.isDead &&
      !this.state.p2State.isSpectator &&
      !this.state.p2State.hasLeftMatch
    ) {
      const obstaclesForP2 = (this.state.p1 && this.state.p1.isAlive && !this.state.p1State.isDead)
        ? [this.state.p1, ...this.state.enemies]
        : this.state.enemies;
      updateTankMovement(this.state.p2, this.externalInputP2, this.state.terrain, obstaclesForP2);

      const p2HasBullet = this.state.bullets.some((b) => b.ownerId === 'p2');
      if (this.externalInputP2.shoot && !p2HasBullet) {
        const p2Bullet = spawnBullet(this.state.p2, null);
        if (p2Bullet) {
          p2Bullet.ownerType = 'player';
          p2Bullet.ownerId = 'p2';
          this.state.bullets.push(p2Bullet);
          this.emit('P2_SHOOT', p2Bullet);
        }
      }
    }

    // 3. Update Enemies (AI, movement, and shooting)
    if (this.enableEnemies) {
      // Per Point A: Enemy AI targets and shoots shielded P1/P2; only dead players are ignored
      const p1IsDead = this.state.p1State.isDead;
      const p2IsDead = !this.state.p2 || !this.state.p2.isAlive || Boolean(this.state.p2State?.isDead);
      const newEnemyBullets = this.enemyManager.update(
        dt,
        this.state.p1,
        p1IsDead,
        this.state.terrain,
        this.state.bullets,
        this.difficulty,
        this.isCoopMode() ? this.state.p2 : null,
        p2IsDead
      );

      for (const eb of newEnemyBullets) {
        this.state.bullets.push(eb);
        this.emit('ENEMY_SHOOT', eb);
      }
      this.state.enemies = this.enemyManager.getActiveEnemies();
      this.state.enemyQueue = this.enemyManager.getQueue();
    }

    // 4. Sync bullet if injected directly into state.bullet (test fixtures / backward-compatibility)
    if (this.state.bullet && !this.state.bullets.some((b) => b.id === this.state.bullet!.id)) {
      this.state.bullets.push(this.state.bullet);
    }

    // Update Bullet Trajectory & Terrain Collisions
    let baseHitByBulletThisTick = false;
    const survivingBullets: BulletStructure[] = [];
    for (const b of this.state.bullets) {
      const bulletResult = updateBullet(b, this.state.terrain);
      if (bulletResult.hitBase) {
        baseHitByBulletThisTick = true;
        this.emitCombatEvent('BASE_EXPLOSION', 104, 200);
      }
      if (bulletResult.isAlive) {
        survivingBullets.push(b);
      }
    }
    this.state.bullets = survivingBullets;

    // 5. Bullet-to-Bullet Cancellation (Player vs Enemy bullets)
    const cancelledBulletIds = new Set<string>();
    const playerBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'player' || b.ownerId === this.state.p1.id
    );
    const enemyBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'enemy' && b.ownerId !== this.state.p1.id
    );

    for (const pb of playerBullets) {
      for (const eb of enemyBullets) {
        if (cancelledBulletIds.has(pb.id) || cancelledBulletIds.has(eb.id)) continue;
        if (checkBulletVsBullet(pb, eb)) {
          cancelledBulletIds.add(pb.id);
          cancelledBulletIds.add(eb.id);
        }
      }
    }

    if (cancelledBulletIds.size > 0) {
      this.state.bullets = this.state.bullets.filter((b) => !cancelledBulletIds.has(b.id));
    }

    // 6. Player Bullet vs Enemy Tanks
    const consumedBulletIds = new Set<string>();
    const activePlayerBullets = this.state.bullets.filter(
      (b) =>
        (b.ownerType === 'player' || b.ownerId === this.state.p1.id) &&
        !cancelledBulletIds.has(b.id)
    );

    for (const pb of activePlayerBullets) {
      const bulletBox = getBulletHitbox(pb.x, pb.y);
      for (const enemy of this.state.enemies) {
        if (!enemy.isAlive) continue;
        const enemyBox = getTankHitbox(enemy.x, enemy.y);
        if (intersectAABB(bulletBox, enemyBox)) {
          consumedBulletIds.add(pb.id);
          const hitResult = this.enemyManager.damageEnemy(enemy.id);
          if (hitResult.destroyed) {
            this.state.totalDefeatedEnemies++;
            this.scoreManager.recordEnemyDefeated(enemy.id, enemy.enemyType);
            this.state.score = this.scoreManager.getTotalScore();
            this.state.highScore = this.scoreManager.getHighScore();
            this.state.defeatedCounts = this.scoreManager.getStageStats();
            this.emitCombatEvent('TANK_EXPLOSION', enemy.x + 8, enemy.y + 8);
          } else {
            // Hit but not destroyed: emit impact spark at hit location
            this.emitCombatEvent('HIT_SPARK', pb.x + 2, pb.y + 2);
          }
          break; // Bullet hits only one tank
        }
      }
    }

    // 7. Enemy Bullets vs Player Tank (Point A & Point H)
    const activeEnemyBullets = this.state.bullets.filter(
      (b) => b.ownerType === 'enemy' && !cancelledBulletIds.has(b.id)
    );

    for (const eb of activeEnemyBullets) {
      if (consumedBulletIds.has(eb.id)) continue;
      const bulletBox = getBulletHitbox(eb.x, eb.y);

      // Check vs P1
      if (this.state.p1.isAlive && !this.state.p1State.isDead) {
        const p1Box = getTankHitbox(this.state.p1.x, this.state.p1.y);

        if (intersectAABB(bulletBox, p1Box)) {
          // Bullet contacts P1 hitbox -> bullet is always consumed/stopped (no penetration)
          consumedBulletIds.add(eb.id);

          // If P1 has active shield: absorb bullet completely, take NO damage!
          if (!this.state.p1.isShielded && this.state.p1State.shieldTimer <= 0) {
            // If P1 is NOT shielded: P1 dies with dedicated P1_EXPLOSION!
            this.emitCombatEvent('P1_EXPLOSION', this.state.p1.x + 8, this.state.p1.y + 8);
            this.state.p1State.lives = Math.max(0, this.state.p1State.lives - 1);
            this.state.p1State.isDead = true;
            this.state.p1.isAlive = false;
            this.state.p1State.waitingForClearSpawn = false;
            this.state.p1State.spawnCheckTimer = 0;
            if (this.state.p1State.lives > 0) {
              this.state.p1State.respawnTimer = P1_CONFIG.RESPAWN_DELAY_S;
              this.state.p1State.isSpectator = false;
            } else {
              this.state.p1State.respawnTimer = 0;
              this.state.p1State.isSpectator = true;
            }

            // Immediately delete player 1 bullets; enemy bullets keep flying! (Point H)
            this.state.bullets = this.state.bullets.filter(
              (b) => b.ownerId !== this.state.p1.id
            );
            if (this.state.bullet?.ownerId === this.state.p1.id) {
              this.state.bullet = null;
            }
          }
          continue;
        }
      }

      // Check vs P2 (Two-Player mode: AI or Online)
      if (this.isCoopMode() && this.state.p2 && this.state.p2State && this.state.p2.isAlive && !this.state.p2State.isDead) {
        const p2Box = getTankHitbox(this.state.p2.x, this.state.p2.y);
        if (intersectAABB(bulletBox, p2Box)) {
          consumedBulletIds.add(eb.id);
          if (!this.state.p2.isShielded && this.state.p2State.shieldTimer <= 0) {
            this.emitCombatEvent('TANK_EXPLOSION', this.state.p2.x + 8, this.state.p2.y + 8);
            this.state.p2State.lives = Math.max(0, this.state.p2State.lives - 1);
            this.state.p2State.isDead = true;
            this.state.p2.isAlive = false;
            this.state.p2State.waitingForClearSpawn = false;
            this.state.p2State.spawnCheckTimer = 0;
            if (this.state.p2State.lives > 0) {
              this.state.p2State.respawnTimer = P1_CONFIG.RESPAWN_DELAY_S;
              this.state.p2State.isSpectator = false;
            } else {
              this.state.p2State.respawnTimer = 0;
              this.state.p2State.isSpectator = true;
              this.externalInputP2 = { ...NEUTRAL_INPUT };
            }
            this.state.bullets = this.state.bullets.filter(
              (b) => b.ownerId !== 'p2'
            );
          }
          continue;
        }
      }
    }

    if (consumedBulletIds.size > 0) {
      this.state.bullets = this.state.bullets.filter((b) => !consumedBulletIds.has(b.id));
    }

    // 8. Sync state.bullet with P1 active bullet
    this.state.bullet =
      this.state.bullets.find(
        (b) => b.ownerId === this.state.p1.id || (b.ownerType === 'player' && b.ownerId !== 'p2')
      ) ?? null;

    // 9. Sync active enemies list
    if (this.enableEnemies) {
      this.state.enemies = this.enemyManager.getActiveEnemies();
      this.state.enemyQueue = this.enemyManager.getQueue();
    }

    // 10. Authoritative Tick-Bound Countdown Timer Update (Fixed 60Hz)
    const maxTicks =
      this.state.matchDurationSeconds * MATCH_TIMER_CONFIG.TICKS_PER_SECOND;
    this.state.remainingTicks = Math.max(0, this.state.remainingTicks - 1);
    this.state.remainingSeconds = Math.ceil(
      this.state.remainingTicks / MATCH_TIMER_CONFIG.TICKS_PER_SECOND
    );
    this.state.stageElapsedSeconds = Number(
      (
        (maxTicks - this.state.remainingTicks) /
        MATCH_TIMER_CONFIG.TICKS_PER_SECOND
      ).toFixed(2)
    );

    // 11. Canonical 4-Tier End-of-Tick Outcome Evaluation Gate
    // Priority: Tier 1 (Base Destroyed) > Tier 2 (All Players Out of Lives) > Tier 3 (Stage Clear) > Tier 4 (Timeout)
    const p1CanContinue =
      this.state.p1State.lives > 0 || !this.state.p1State.isDead;
    const p2CanContinue =
      this.isCoopMode() &&
      Boolean(
        this.state.p2 &&
          this.state.p2State &&
          (this.state.p2State.lives > 0 || !this.state.p2State.isDead)
      );
    const hasLivingPlayer = p1CanContinue || p2CanContinue;

    if (this.state.terrain.isBaseDestroyed) {
      // Tier 1: Base Destroyed
      if (!baseHitByBulletThisTick && !this.state.isGameOver) {
        this.emitCombatEvent('BASE_EXPLOSION', 96, 192);
      }
      this.state.isGameOver = true;
      this.state.isStageClear = false;
      this.state.isTimeoutGameOver = false;
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    } else if (!hasLivingPlayer) {
      // Tier 2: All Players Out of Lives
      this.state.isGameOver = true;
      this.state.isStageClear = false;
      this.state.isTimeoutGameOver = false;
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    } else if (
      this.state.totalDefeatedEnemies >= ENEMY_CONFIG.TOTAL_COUNT &&
      this.state.enemies.length === 0
    ) {
      // Tier 3: Stage Clear (Victory on or before final tick beats Timeout)
      this.state.isStageClear = true;
      this.state.isGameOver = false;
      this.state.isTimeoutGameOver = false;
      this.state.gameOverReason = null;
      this.state.matchState = MATCH_STATES.STAGE_CLEAR;
      this.matchStateMachine.transitionTo(MATCH_STATES.STAGE_CLEAR, true);
      this.scoreManager.checkAndUpdateHighScore();
      this.state.highScore = this.scoreManager.getHighScore();
    } else if (this.state.remainingTicks <= 0) {
      // Tier 4: Match Countdown Timeout
      this.state.isGameOver = true;
      this.state.isStageClear = false;
      this.state.isTimeoutGameOver = true;
      this.state.matchState = MATCH_STATES.GAME_OVER;
      this.matchStateMachine.transitionTo(MATCH_STATES.GAME_OVER, true);
    }
  }

  public getStageRunSeq(): number {
    return this.stageRunSeq;
  }

  public getLastAppliedSnapshotSeq(): number {
    return this.lastAppliedSnapshotSeq;
  }

  public getGuestLastAppliedSnapshotSeq(): number {
    return this.lastAppliedSnapshotSeq;
  }

  public pauseMatch(): void {
    this.pause();
  }

  public getLastAppliedStageRunSeq(): number {
    return this.lastAppliedStageRunSeq;
  }

  public getLastAppliedTickCount(): number {
    return this.lastAppliedTickCount;
  }

  public getLastDroppedBacklogMs(): number {
    return this.lastDroppedBacklogMs;
  }

  public setOnGuestSnapshotAppliedCallback(
    cb?: (snapshotSeq: number, stageRunSeq: number, tickCount: number) => void
  ): void {
    this.onGuestSnapshotAppliedCallback = cb;
  }

  public resetGuestSnapshotTracking(): void {
    this.lastAppliedSnapshotSeq = 0;
    this.lastAppliedStageRunSeq = 0;
    this.lastAppliedTickCount = -1;
  }

  private syncGuestVisualStateFromAuthoritative(): void {
    this.guestVisualState = {
      p2RenderX: this.state.p2 ? this.state.p2.x : 144,
      p2RenderY: this.state.p2 ? this.state.p2.y : 192,
      p2RenderDirection: this.state.p2 ? this.state.p2.direction : 'UP',
      p1VisualShieldTimer: this.state.p1State.shieldTimer,
      p2VisualShieldTimer: this.state.p2State ? this.state.p2State.shieldTimer : 0,
      interpolatedMsSinceSnapshot: 0,
    };
  }

  public getGuestVisualState(): Readonly<GuestVisualInterpolationState> {
    return { ...this.guestVisualState };
  }

  /**
   * Advances isolated Guest visual interpolation for P2 (60 px/s, max 50ms budget since last snapshot).
   * STRICT GUARANTEE: Never mutates GameCoreState, tickCount, remainingTicks, or authoritative shieldTimer.
   */
  public advanceGuestVisualInterpolation(rawDeltaMs: number): void {
    if (typeof rawDeltaMs !== 'number' || !Number.isFinite(rawDeltaMs) || rawDeltaMs <= 0) {
      return;
    }
    if (
      this.isPaused ||
      this.state.matchState !== MATCH_STATES.PLAYING ||
      this.state.isGameOver ||
      this.state.isStageClear
    ) {
      return;
    }

    const remainingBudgetMs = Math.max(
      0,
      SIMULATION_CONFIG.GUEST_MAX_INTERPOLATION_MS -
        this.guestVisualState.interpolatedMsSinceSnapshot
    );
    const dtMs = Math.min(rawDeltaMs, remainingBudgetMs);
    if (dtMs <= 0) {
      return;
    }
    this.guestVisualState.interpolatedMsSinceSnapshot += dtMs;
    const dtSec = dtMs / 1000;

    if (this.guestVisualState.p1VisualShieldTimer > 0) {
      this.guestVisualState.p1VisualShieldTimer = Math.max(
        0,
        this.guestVisualState.p1VisualShieldTimer - dtSec
      );
    }
    if (this.guestVisualState.p2VisualShieldTimer > 0) {
      this.guestVisualState.p2VisualShieldTimer = Math.max(
        0,
        this.guestVisualState.p2VisualShieldTimer - dtSec
      );
    }

    if (
      !this.state.p2 ||
      !this.state.p2.isAlive ||
      this.state.p2State?.isDead ||
      this.state.p2State?.isSpectator ||
      this.state.p2State?.hasLeftMatch
    ) {
      return;
    }

    const input = this.externalInputP2;
    let requestedDir: Direction | null = null;
    if (input.up && !input.down) requestedDir = 'UP';
    else if (input.down && !input.up) requestedDir = 'DOWN';
    else if (input.left && !input.right) requestedDir = 'LEFT';
    else if (input.right && !input.left) requestedDir = 'RIGHT';

    if (!requestedDir) {
      return;
    }

    const v = this.guestVisualState;

    if (requestedDir !== v.p2RenderDirection) {
      const snapResult = trySafeGridSnap(
        v.p2RenderX,
        v.p2RenderY,
        v.p2RenderDirection,
        requestedDir,
        this.state.terrain
      );
      if (!snapResult.success) {
        // Keep original direction and coordinates when perpendicular grid alignment fails
        return;
      }
      v.p2RenderX = snapResult.snappedX;
      v.p2RenderY = snapResult.snappedY;
      v.p2RenderDirection = requestedDir;
    }

    const distancePx = TANK_CONFIG.SPEED_PX_S * dtSec; // 60 px/s
    let nextX = v.p2RenderX;
    let nextY = v.p2RenderY;

    if (v.p2RenderDirection === 'UP') nextY -= distancePx;
    else if (v.p2RenderDirection === 'DOWN') nextY += distancePx;
    else if (v.p2RenderDirection === 'LEFT') nextX -= distancePx;
    else if (v.p2RenderDirection === 'RIGHT') nextX += distancePx;

    nextX = Math.max(0, Math.min(TANK_CONFIG.MAX_X, nextX));
    nextY = Math.max(0, Math.min(TANK_CONFIG.MAX_Y, nextY));

    const nextHitbox = getTankHitbox(nextX, nextY);
    const terrainColl = checkHitboxVsTerrain(nextHitbox, this.state.terrain, { forBullet: false });
    const obstacles =
      this.state.p1.isAlive && !this.state.p1State.isDead
        ? [this.state.p1, ...this.state.enemies]
        : this.state.enemies;
    const tankColl = checkTankVsTanks('p2', nextHitbox, obstacles);

    if (!terrainColl.collides && !tankColl) {
      v.p2RenderX = nextX;
      v.p2RenderY = nextY;
    }
  }

  /**
   * Validates and atomically applies an authoritative state snapshot from Host onto a Guest client.
   * Rejects invalid/stale snapshots without mutating GameCoreState or any sequence counter.
   */
  public applyAuthoritativeSnapshot(rawSnapshot: unknown): SnapshotValidationResult {
    const check = validateAndNormalizeAuthoritativeSnapshot(
      rawSnapshot,
      this.lastAppliedSnapshotSeq,
      this.lastAppliedStageRunSeq,
      this.lastAppliedTickCount
    );
    if (!check.valid || !check.normalized) {
      return { valid: false, reason: check.reason, errorCode: check.reason };
    }

    const snapshot = check.normalized;
    const prevStageRunSeq = this.lastAppliedStageRunSeq;
    const prevStageId = this.state.currentStageId;
    const prevTickCount = this.lastAppliedTickCount;
    const prevBaseDestroyed = this.state.terrain.isBaseDestroyed;
    const prevP1Dead = this.state.p1State.isDead;
    const prevP1X = this.state.p1.x;
    const prevP1Y = this.state.p1.y;
    const prevP2 = this.state.p2;
    const prevP2Dead = Boolean(this.state.p2State?.isDead);
    const prevP2X = this.state.p2?.x ?? 144;
    const prevP2Y = this.state.p2?.y ?? 192;

    const isSameStageContinuity =
      prevTickCount >= 0 &&
      snapshot.stageRunSeq === prevStageRunSeq &&
      snapshot.currentStageId === prevStageId;

    if (!isSameStageContinuity) {
      // Stage restart or stage transition: clear stale combat events, never emit false explosions
      this.combatEvents = [];
      if (
        Array.isArray(snapshot.currentStageMap) &&
        snapshot.currentStageMap.length === 13 &&
        Array.isArray(snapshot.currentStageMap[0]) &&
        snapshot.currentStageMap[0].length === 13
      ) {
        this.state.terrain = createRuntimeTerrainState(snapshot.currentStageMap);
      } else {
        const targetStage = this.stageManager.getStage(snapshot.currentStageId);
        if (targetStage) {
          this.stageManager.setCurrentStage(snapshot.currentStageId);
          this.state.terrain = createRuntimeTerrainState(targetStage.map);
        } else {
          this.state.terrain = createRuntimeTerrainState(this.stageManager.getCurrentStage().map);
        }
      }
    }

    this.difficulty = snapshot.difficulty;
    this.stageRunSeq = snapshot.stageRunSeq;
    this.state.difficulty = snapshot.difficulty;
    this.state.stageRunSeq = snapshot.stageRunSeq;
    this.state.tickCount = snapshot.tickCount;
    this.state.matchDurationSeconds = snapshot.matchDurationSeconds;
    this.state.remainingTicks = snapshot.remainingTicks;
    this.state.remainingSeconds = snapshot.remainingSeconds;
    this.state.stageElapsedSeconds = snapshot.stageElapsedSeconds;
    this.state.p1 = { ...snapshot.p1 };
    const nextP1State = { ...snapshot.p1State };
    if (nextP1State.isDead && nextP1State.lives <= 0) {
      nextP1State.isSpectator = true;
      nextP1State.respawnTimer = 0;
    }
    this.state.p1State = nextP1State;
    this.state.p2 = snapshot.p2 ? { ...snapshot.p2 } : null;
    if (snapshot.p2State) {
      const nextP2State = { ...snapshot.p2State };
      if (nextP2State.isDead && nextP2State.lives <= 0) {
        nextP2State.isSpectator = true;
        nextP2State.respawnTimer = 0;
      }
      this.state.p2State = nextP2State;
    } else {
      this.state.p2State = null;
    }
    this.state.bullets = Array.isArray(snapshot.bullets)
      ? snapshot.bullets.map((b: BulletStructure) => ({ ...b }))
      : [];
    this.state.bullet =
      this.state.bullets.find(
        (b) => b.ownerId === this.state.p1.id || (b.ownerType === 'player' && b.ownerId !== 'p2')
      ) ?? null;
    this.state.enemies = Array.isArray(snapshot.enemies)
      ? snapshot.enemies.map((e: EnemyTank) => ({ ...e }))
      : [];
    this.state.enemyQueue = new Array(Math.max(0, Number(snapshot.enemyQueueLength) || 0)).fill(
      'BASIC'
    );
    this.state.totalDefeatedEnemies = snapshot.totalDefeatedEnemies;
    this.state.score = snapshot.score;
    this.state.highScore = snapshot.highScore;
    this.state.defeatedCounts = { ...snapshot.defeatedCounts };
    this.state.currentStageId = snapshot.currentStageId;
    this.state.currentStageName = snapshot.currentStageName;
    this.state.currentStageVersion =
      typeof snapshot.currentStageVersion === 'number'
        ? snapshot.currentStageVersion
        : (this.state.currentStageVersion ?? 1);

    if (snapshot.brickSubTiles && typeof snapshot.brickSubTiles === 'object') {
      for (const [key, mask] of Object.entries(snapshot.brickSubTiles as Record<string, number>)) {
        this.state.terrain.brickSubTiles[key] = mask;
        const [rStr, cStr] = key.split('_');
        const r = Number(rStr);
        const c = Number(cStr);
        if (!Number.isNaN(r) && !Number.isNaN(c) && this.state.terrain.currentMap[r]) {
          this.state.terrain.currentMap[r][c] = mask === 0 ? 0 : 1;
        }
      }
    }
    this.state.terrain.isBaseDestroyed = snapshot.isBaseDestroyed;
    this.state.isGameOver = snapshot.isGameOver;
    this.state.isStageClear = snapshot.isStageClear;
    this.state.isTimeoutGameOver = snapshot.isTimeoutGameOver;
    this.state.gameOverReason = snapshot.gameOverReason ?? null;
    this.state.peerLeaveNotice = snapshot.peerLeaveNotice ?? this.state.peerLeaveNotice ?? null;
    this.state.matchState = snapshot.matchState;
    this.isPaused = snapshot.matchState === MATCH_STATES.PAUSED;
    this.matchStateMachine.transitionTo(snapshot.matchState as any, true);

    if (isSameStageContinuity) {
      if (!prevBaseDestroyed && snapshot.isBaseDestroyed) {
        this.emitCombatEvent('BASE_EXPLOSION', 96, 192);
      }
      if (!prevP1Dead && snapshot.p1State.isDead) {
        this.emitCombatEvent('P1_EXPLOSION', prevP1X + 8, prevP1Y + 8);
      }
      if (prevP2 && !prevP2Dead && snapshot.p2State?.isDead) {
        this.emitCombatEvent('TANK_EXPLOSION', prevP2X + 8, prevP2Y + 8);
      }
    }

    // Commit sequence counters atomically ONLY after full validation & state update succeed
    this.lastAppliedSnapshotSeq = snapshot.snapshotSeq;
    this.lastAppliedStageRunSeq = snapshot.stageRunSeq;
    this.lastAppliedTickCount = snapshot.tickCount;
    this.syncGuestVisualStateFromAuthoritative();
    this.onGuestSnapshotAppliedCallback?.(
      snapshot.snapshotSeq,
      snapshot.stageRunSeq,
      snapshot.tickCount
    );

    return {
      valid: true,
      appliedSnapshotSeq: snapshot.snapshotSeq,
    };
  }

  /**
   * Advances simulation with real-world delta time using fixed 60Hz ticks.
   * Manages input guards, non-overlapping lost time accounting, safety pause, and neutral catch-up input.
   */
  public advanceTime(
    rawElapsedMs: number,
    input: InputState,
    options?: { isHostHidden?: boolean }
  ): number {
    if (
      this.isPaused ||
      this.isForcedSafetyPaused ||
      this.state.matchState === MATCH_STATES.PAUSED ||
      this.state.matchState === MATCH_STATES.MENU ||
      this.state.isGameOver ||
      this.state.isStageClear
    ) {
      this.clearAllInputs();
      return 0;
    }

    // 1. Strict input guard BEFORE any backlog arithmetic (rejects NaN, Infinity, -Infinity, <= 0)
    if (typeof rawElapsedMs !== 'number' || !Number.isFinite(rawElapsedMs) || rawElapsedMs <= 0) {
      this.lastDroppedBacklogMs = 0;
      this.lastDroppedInputMs = 0;
      this.lastDroppedBacklogComponentMs = 0;
      return 0;
    }

    // Discard any lingering backlog, massive delta, or stale latched input immediately upon resuming from pause/tab switch
    const wasJustResumed = this.justResumed;
    if (this.justResumed) {
      this.justResumed = false;
      this.accumulatorMs = 0;
      this.catchUpTicksRemaining = 0;
      this.clearAllInputs();
      rawElapsedMs = Math.min(rawElapsedMs, SIMULATION_CONFIG.FIXED_DT_MS);
    }

    // 2. Non-overlapping lost time decomposition: droppedInputMs + droppedBacklogMs
    const acceptedDeltaMs = Math.min(rawElapsedMs, SIMULATION_CONFIG.MAX_INPUT_DELTA_MS);
    const droppedInputMs = rawElapsedMs - acceptedDeltaMs;
    const rawTotalBacklogMs = this.accumulatorMs + rawElapsedMs;

    // 3. Forced Safety Pause for SOLO and TWO_PLAYERS_AI when total backlog exceeds 3000ms
    if (
      (this.gameMode === 'SOLO' || this.gameMode === 'TWO_PLAYERS_AI') &&
      rawTotalBacklogMs > SIMULATION_CONFIG.MAX_ACCUMULATOR_BACKLOG_MS
    ) {
      const droppedBacklogMs = this.accumulatorMs + acceptedDeltaMs;
      this.accumulatorMs = 0;
      this.catchUpTicksRemaining = 0;
      this.lastDroppedInputMs = droppedInputMs;
      this.lastDroppedBacklogComponentMs = droppedBacklogMs;
      this.lastDroppedBacklogMs = droppedInputMs + droppedBacklogMs;
      this.totalDroppedMs += this.lastDroppedBacklogMs;
      this.totalRealElapsedMs += rawElapsedMs;
      this.isForcedSafetyPaused = true;
      this.clearAllInputs();
      this.state.diagnosticLog = `Forced Safety Pause: backlog ${rawTotalBacklogMs.toFixed(1)}ms > ${SIMULATION_CONFIG.MAX_ACCUMULATOR_BACKLOG_MS}ms`;
      this.pause();
      return 0;
    }

    const unclampedBacklogMs = this.accumulatorMs + acceptedDeltaMs;
    const clampedBacklogMs = Math.min(
      unclampedBacklogMs,
      SIMULATION_CONFIG.MAX_ACCUMULATOR_BACKLOG_MS
    );
    const droppedBacklogMs = Math.max(0, unclampedBacklogMs - clampedBacklogMs);

    this.accumulatorMs = clampedBacklogMs;
    this.lastDroppedInputMs = droppedInputMs;
    this.lastDroppedBacklogComponentMs = droppedBacklogMs;
    this.lastDroppedBacklogMs = droppedInputMs + droppedBacklogMs;
    this.totalDroppedMs += this.lastDroppedBacklogMs;
    this.totalRealElapsedMs += rawElapsedMs;
    if (this.lastDroppedBacklogMs > 0) {
      this.state.diagnosticLog = 'Simulation backlog clamped';
    }

    // 4. Neutral Input Policy for Historical Catch-Up Ticks & Resume Transition Frame
    const isHostHidden = Boolean(options?.isHostHidden);
    const maxSingleFrameBudgetMs =
      SIMULATION_CONFIG.MAX_TICKS_PER_FRAME * SIMULATION_CONFIG.FIXED_DT_MS; // 250ms
    const isFreezeRecoveryFrame =
      rawElapsedMs > maxSingleFrameBudgetMs + SIMULATION_CONFIG.SIMULATION_EPSILON_MS;

    if (isFreezeRecoveryFrame || isHostHidden || wasJustResumed) {
      this.externalInput = { ...NEUTRAL_INPUT };
    }
    if (isFreezeRecoveryFrame || wasJustResumed) {
      this.externalInputP2 = { ...NEUTRAL_INPUT };
    }
    if (isFreezeRecoveryFrame) {
      this.catchUpTicksRemaining = Math.floor(
        (this.accumulatorMs + SIMULATION_CONFIG.SIMULATION_EPSILON_MS) /
          SIMULATION_CONFIG.FIXED_DT_MS
      );
    }

    const tickThreshold =
      SIMULATION_CONFIG.FIXED_DT_MS - SIMULATION_CONFIG.SIMULATION_EPSILON_MS;
    const totalAvailableTicksInAccumulator = Math.floor(
      (this.accumulatorMs + SIMULATION_CONFIG.SIMULATION_EPSILON_MS) /
        SIMULATION_CONFIG.FIXED_DT_MS
    );
    const plannedTicksThisFrame = Math.min(
      totalAvailableTicksInAccumulator,
      SIMULATION_CONFIG.MAX_TICKS_PER_FRAME
    );
    const savedExternalInputP2 = { ...this.externalInputP2 };

    let ticksRun = 0;
    while (
      this.accumulatorMs >= tickThreshold &&
      ticksRun < SIMULATION_CONFIG.MAX_TICKS_PER_FRAME
    ) {
      const isHistoricalCatchUpTick =
        isFreezeRecoveryFrame ||
        this.catchUpTicksRemaining > 1 ||
        totalAvailableTicksInAccumulator > SIMULATION_CONFIG.MAX_TICKS_PER_FRAME ||
        (plannedTicksThisFrame > 2 && ticksRun < plannedTicksThisFrame - 1);

      if (this.catchUpTicksRemaining > 0) {
        this.catchUpTicksRemaining -= 1;
      }

      const effectiveP1Input: InputState =
        wasJustResumed || isHostHidden || isHistoricalCatchUpTick ? NEUTRAL_INPUT : input;
      this.externalInputP2 =
        wasJustResumed || isHistoricalCatchUpTick
          ? { ...NEUTRAL_INPUT }
          : savedExternalInputP2;

      this.stepTick(effectiveP1Input);

      this.accumulatorMs -= SIMULATION_CONFIG.FIXED_DT_MS;
      if (this.accumulatorMs < SIMULATION_CONFIG.SIMULATION_EPSILON_MS) {
        this.accumulatorMs = 0;
      }
      ticksRun++;

      if (this.state.isGameOver || this.state.isStageClear || this.isPaused) {
        this.accumulatorMs = 0;
        this.catchUpTicksRemaining = 0;
        break;
      }
    }

    this.externalInputP2 =
      isFreezeRecoveryFrame || wasJustResumed ? { ...NEUTRAL_INPUT } : savedExternalInputP2;

    // Measure live Simulation Ticks Per Second (TPS) over 500ms sliding windows
    this.tpsAccumulatorMs += rawElapsedMs;
    this.tpsTicksThisWindow += ticksRun;
    if (this.tpsAccumulatorMs >= 500) {
      this.recentTps = Math.round((this.tpsTicksThisWindow * 1000) / this.tpsAccumulatorMs);
      this.tpsAccumulatorMs = 0;
      this.tpsTicksThisWindow = 0;
    }

    return ticksRun;
  }

  public getTimingTelemetry(): {
    renderFps: number;
    simulationTps: number;
    actualTicks: number;
    realElapsedSeconds: number;
    simulatedSeconds: number;
    droppedSeconds: number;
    droppedInputMs: number;
    droppedBacklogMs: number;
    lastDroppedBacklogMs: number;
    accumulatorMs: number;
  } {
    return {
      renderFps: this.reportedRenderFps,
      simulationTps: this.recentTps,
      actualTicks: this.state.tickCount,
      realElapsedSeconds: Number((this.totalRealElapsedMs / 1000).toFixed(3)),
      simulatedSeconds: Number((this.state.tickCount * SIMULATION_CONFIG.FIXED_DT_S).toFixed(3)),
      droppedSeconds: Number((this.totalDroppedMs / 1000).toFixed(3)),
      droppedInputMs: Number(this.lastDroppedInputMs.toFixed(3)),
      droppedBacklogMs: Number(this.lastDroppedBacklogComponentMs.toFixed(3)),
      lastDroppedBacklogMs: Number(this.lastDroppedBacklogMs.toFixed(3)),
      accumulatorMs: Number(this.accumulatorMs.toFixed(2)),
    };
  }

  public setReportedRenderFps(fps: number): void {
    this.reportedRenderFps = fps;
  }
}
