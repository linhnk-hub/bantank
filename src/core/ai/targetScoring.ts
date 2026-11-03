/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AI_CONFIG, MAP_DIMENSIONS } from '../constants.ts';
import {
  type EnemyTank,
  type EnemyType,
  type TankStructure,
  type RuntimeTerrainState,
} from '../types.ts';
import { hasLineOfSight } from './enemyAI.ts';
import { findPathAStar } from './pathfinding.ts';

export interface TargetCandidate {
  id: 'p1' | 'eagle';
  coords: { x: number; y: number };
  score: number;
  isReachable: boolean;
  components: {
    distanceScore: number;
    aStarScore: number;
    losScore: number;
    battlefieldScore: number;
    tendencyMultiplier: number;
  };
}

/**
 * Type-specific baseline tendencies when both P1 and Eagle are reachable:
 * - Basic: P1 50%, Eagle 50%
 * - Fast: P1 70%, Eagle 30%
 * - Power: P1 60%, Eagle 40%
 * - Armor: P1 40%, Eagle 60%
 */
export const TYPE_TENDENCY_WEIGHTS: Record<EnemyType, { p1: number; eagle: number }> = {
  BASIC: { p1: 0.5, eagle: 0.5 },
  FAST: { p1: 0.7, eagle: 0.3 },
  POWER: { p1: 0.6, eagle: 0.4 },
  ARMOR: { p1: 0.4, eagle: 0.6 },
};

/**
 * Calculates raw objective target score based on:
 * - Distance: 30%
 * - A* Reachability: 40%
 * - Line of Sight: 20%
 * - Battlefield Situation: 10%
 */
export function calculateTargetComponents(
  enemy: EnemyTank,
  targetPos: { x: number; y: number },
  isP1: boolean,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>
): {
  distanceScore: number;
  aStarScore: number;
  losScore: number;
  battlefieldScore: number;
  isReachable: boolean;
  rawTotalScore: number;
} {
  const maxMapDiagonal = Math.hypot(MAP_DIMENSIONS.TOTAL_WIDTH_PX, MAP_DIMENSIONS.TOTAL_HEIGHT_PX);
  const dist = Math.hypot(targetPos.x - enemy.x, targetPos.y - enemy.y);

  // 1. Distance (30%): closer targets yield higher score [0..1]
  const distanceScore = Math.max(0, 1 - dist / maxMapDiagonal);

  // 2. A* Reachability (40%): does a valid navigable path exist?
  const path = findPathAStar(
    { x: enemy.x, y: enemy.y },
    targetPos,
    terrain,
    otherTanks,
    enemy.id
  );
  const isReachable = path.length > 0;
  // If reachable, shorter paths score higher
  const aStarScore = isReachable ? Math.max(0.1, 1 - Math.min(path.length, 30) / 30) : 0.0;

  // 3. Line of sight (20%)
  const los = hasLineOfSight(enemy.x, enemy.y, targetPos.x, targetPos.y, terrain, AI_CONFIG.DETECTION_RADIUS_PX);
  const losScore = los ? 1.0 : 0.0;

  // 4. Battlefield situation (10%):
  // Tactical factor: e.g. proximity to critical zone or threat level
  let battlefieldScore = 0.5;
  if (!isP1) {
    // Eagle: if enemy is in bottom half of map, eagle becomes higher tactical priority
    battlefieldScore = enemy.y > 96 ? 0.9 : 0.4;
  } else {
    // P1: higher tactical priority if facing P1 or P1 has low health/close
    battlefieldScore = dist < 64 ? 0.9 : 0.5;
  }

  const rawTotalScore =
    0.30 * distanceScore +
    0.40 * aStarScore +
    0.20 * losScore +
    0.10 * battlefieldScore;

  return {
    distanceScore,
    aStarScore,
    losScore,
    battlefieldScore,
    isReachable,
    rawTotalScore,
  };
}

/**
 * Evaluates both P1 and Eagle targets and selects the highest scoring destination.
 * Only applies type tendencies when both targets are valid and reachable.
 */
export function scoreAndSelectTarget(
  enemy: EnemyTank,
  p1: TankStructure,
  p1IsDead: boolean,
  terrain: RuntimeTerrainState,
  otherTanks?: Array<{ id: string; x: number; y: number }>
): {
  selectedTarget: 'p1' | 'eagle';
  destination: { x: number; y: number };
  p1Candidate: TargetCandidate | null;
  eagleCandidate: TargetCandidate;
} {
  const eaglePos = AI_CONFIG.BASE_TARGET_COORDS; // { x: 96, y: 192 }
  const eagleComp = calculateTargetComponents(enemy, eaglePos, false, terrain, otherTanks);

  const eagleCandidate: TargetCandidate = {
    id: 'eagle',
    coords: eaglePos,
    score: eagleComp.rawTotalScore,
    isReachable: eagleComp.isReachable,
    components: {
      distanceScore: eagleComp.distanceScore,
      aStarScore: eagleComp.aStarScore,
      losScore: eagleComp.losScore,
      battlefieldScore: eagleComp.battlefieldScore,
      tendencyMultiplier: 1.0,
    },
  };

  // If P1 is dead, P1 is invalid: only Eagle can be targeted!
  if (p1IsDead || !p1.isAlive) {
    return {
      selectedTarget: 'eagle',
      destination: eaglePos,
      p1Candidate: null,
      eagleCandidate,
    };
  }

  const p1Pos = { x: p1.x, y: p1.y };
  const p1Comp = calculateTargetComponents(enemy, p1Pos, true, terrain, otherTanks);

  const p1Candidate: TargetCandidate = {
    id: 'p1',
    coords: p1Pos,
    score: p1Comp.rawTotalScore,
    isReachable: p1Comp.isReachable,
    components: {
      distanceScore: p1Comp.distanceScore,
      aStarScore: p1Comp.aStarScore,
      losScore: p1Comp.losScore,
      battlefieldScore: p1Comp.battlefieldScore,
      tendencyMultiplier: 1.0,
    },
  };

  // Apply tendencies ONLY when BOTH targets are valid and reachable
  if (p1Comp.isReachable && eagleComp.isReachable) {
    const tendencies = TYPE_TENDENCY_WEIGHTS[enemy.enemyType];
    p1Candidate.components.tendencyMultiplier = tendencies.p1;
    eagleCandidate.components.tendencyMultiplier = tendencies.eagle;

    p1Candidate.score = p1Comp.rawTotalScore * tendencies.p1;
    eagleCandidate.score = eagleComp.rawTotalScore * tendencies.eagle;
  } else if (p1Comp.isReachable && !eagleComp.isReachable) {
    p1Candidate.score = p1Comp.rawTotalScore;
    eagleCandidate.score = 0;
  } else if (!p1Comp.isReachable && eagleComp.isReachable) {
    p1Candidate.score = 0;
    eagleCandidate.score = eagleComp.rawTotalScore;
  }

  if (p1Candidate.score >= eagleCandidate.score) {
    return {
      selectedTarget: 'p1',
      destination: p1Pos,
      p1Candidate,
      eagleCandidate,
    };
  } else {
    return {
      selectedTarget: 'eagle',
      destination: eaglePos,
      p1Candidate,
      eagleCandidate,
    };
  }
}
