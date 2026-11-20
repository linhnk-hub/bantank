/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction, TankStructure } from './types.ts';

export type VsMode = 'VS_P1_P2' | 'VS_P1_AI_P2_AI';

export type VsTeamId = 'TEAM_1' | 'TEAM_2';

export type VsTankRole = 'P1' | 'AI_1' | 'P2' | 'AI_2';

export type VsPhase =
  | 'NORMAL'
  | 'SUDDEN_DEATH_TRANSITION'
  | 'SUDDEN_DEATH'
  | 'FINISHED';

/**
 * Kết quả chính thức cho mỗi phe trong chế độ VS.
 * Đặc tả BTO-VS-GAMEPLAY-V1.2: Chỉ cho phép WIN hoặc LOSS, tuyệt đối KHÔNG có HÒA/DRAW/TIE.
 */
export type VsTeamResult = 'WIN' | 'LOSS';

export type VsMatchFinishReason =
  | 'TEAM_ELIMINATED'
  | 'SUDDEN_DEATH_ELIMINATION'
  | 'SIMULTANEOUS_ELIMINATION_RANDOM_50_50';

export const VS_RULES_CONFIG = {
  TICKS_PER_SECOND: 60,
  NORMAL_DURATION_SECONDS: 180,
  NORMAL_DURATION_TICKS: 180 * 60, // 10,800 ticks
  STARTING_LIVES: 3,
  RESPAWN_DELAY_SECONDS: 3,
  RESPAWN_DELAY_TICKS: 3 * 60, // 180 ticks
  SPAWN_PROTECTION_SECONDS: 2,
  SPAWN_PROTECTION_TICKS: 2 * 60, // 120 ticks
  SHRINK_INTERVAL_SECONDS: 20,
  SHRINK_INTERVAL_TICKS: 20 * 60, // 1,200 ticks
  HAZARD_LETHAL_THRESHOLD: 100,
  HAZARD_DECAY_PER_TICK_SAFE: 1.5,
  SHRINK_IMMINENT_WARNING_SECONDS: 5,
  FRIENDLY_FIRE_ENABLED: false,
  ALLOW_DRAW: false,
} as const;

export interface VsCombatantState {
  id: string;
  role: VsTankRole;
  label: string;
  team: VsTeamId;
  isAI: boolean;
  tank: TankStructure;
  lives: number;
  isDead: boolean;
  eliminatedPermanently: boolean;
  respawnTicksRemaining: number;
  respawnSecondsRemaining: number;
  protectionTicksRemaining: number;
  protectionSecondsRemaining: number;
  pendingRespawnBeforeSuddenDeath: boolean;
  inDangerZone: boolean;
  hazardDamageAccumulated: number;
  kills: number;
  deaths: number;
  spawnCol: number;
  spawnRow: number;
  spawnDirection: Direction;
}

export interface VsSafeZoneBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  isFullyCollapsed: boolean;
}

export interface VsSafeZoneState {
  shrinkLevel: number;
  shrinkIntervalTicks: number;
  ticksUntilNextShrink: number;
  secondsUntilNextShrink: number;
  bounds: VsSafeZoneBounds;
  nextBounds: VsSafeZoneBounds;
  hazardDamagePerTick: number;
  isShrinkImminent: boolean;
}

export interface VsTeamSummary {
  team: VsTeamId;
  totalKills: number;
  totalDeaths: number;
  totalLivesRemaining: number;
  aliveCount: number;
  pendingRespawnCount: number;
  isEliminated: boolean;
}

export interface VsMatchOutcome {
  winnerTeam: VsTeamId;
  loserTeam: VsTeamId;
  team1Result: VsTeamResult;
  team2Result: VsTeamResult;
  decidedByRandom5050: boolean;
  randomRollValue: number | null;
  reason: VsMatchFinishReason;
  finishedAtTick: number;
}

export interface VsMatchState {
  mode: VsMode;
  phase: VsPhase;
  tickCount: number;
  normalDurationSeconds: number;
  normalDurationTicks: number;
  normalRemainingTicks: number;
  normalRemainingSeconds: number;
  suddenDeathElapsedTicks: number;
  suddenDeathElapsedSeconds: number;
  transitionWaitTicks: number;
  combatants: VsCombatantState[];
  team1: VsTeamSummary;
  team2: VsTeamSummary;
  safeZone: VsSafeZoneState;
  outcome: VsMatchOutcome | null;
  random5050CallCount: number;
  anyTankInDangerZone: boolean;
  xpGranted: 0;
  starsGranted: 0;
  coinsGranted: 0;
}

export function isVsGameMode(mode: string | undefined | null): mode is VsMode {
  return mode === 'VS_P1_P2' || mode === 'VS_P1_AI_P2_AI';
}
