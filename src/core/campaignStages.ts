/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, ENEMY_CONFIG } from './constants.ts';
import type { EnemyType, StageMapMatrix } from './types.ts';

export interface StageEnemyComposition {
  BASIC: number;
  FAST: number;
  POWER: number;
  ARMOR: number;
}

export interface CampaignStageSpec {
  id: number;
  orderIndex: number;
  name: string;
  shortTitle: string;
  terrainFocus: string;
  map: StageMapMatrix;
  enemyComposition: StageEnemyComposition;
  enemyQueue: EnemyType[];
  spawnIntervalS: number;
}

/**
 * Deterministic tactical wave generator:
 * Distributes exact enemy counts across 30 slots with escalating pressure:
 * - Early scouts (BASIC/FAST) open routes
 * - Mid-wave mixes POWER + FAST pressure
 * - Final third spearheads ARMOR + POWER heavy tanks
 */
export function buildCampaignEnemyQueue(comp: StageEnemyComposition): EnemyType[] {
  const total = comp.BASIC + comp.FAST + comp.POWER + comp.ARMOR;
  if (total !== ENEMY_CONFIG.TOTAL_COUNT) {
    throw new Error(`Invalid stage enemy composition total: ${total} (expected ${ENEMY_CONFIG.TOTAL_COUNT})`);
  }

  let remBasic = comp.BASIC;
  let remFast = comp.FAST;
  let remPower = comp.POWER;
  let remArmor = comp.ARMOR;

  const queue: EnemyType[] = [];

  // Phase 1 (Slots 0..9): Scouting & skirmish wave (prefer BASIC & FAST, sprinkle 1-2 POWER/ARMOR if few BASIC)
  // Phase 2 (Slots 10..19): Combined arms pressure (FAST + POWER + ARMOR)
  // Phase 3 (Slots 20..29): Heavy push (remaining POWER & ARMOR + FAST interceptors)
  const take = (type: EnemyType): boolean => {
    if (type === 'BASIC' && remBasic > 0) {
      remBasic--;
      queue.push('BASIC');
      return true;
    }
    if (type === 'FAST' && remFast > 0) {
      remFast--;
      queue.push('FAST');
      return true;
    }
    if (type === 'POWER' && remPower > 0) {
      remPower--;
      queue.push('POWER');
      return true;
    }
    if (type === 'ARMOR' && remArmor > 0) {
      remArmor--;
      queue.push('ARMOR');
      return true;
    }
    return false;
  };

  const phase1Pattern: EnemyType[] = [
    'BASIC', 'FAST', 'BASIC', 'BASIC', 'FAST',
    'POWER', 'BASIC', 'FAST', 'BASIC', 'ARMOR',
  ];
  for (const t of phase1Pattern) {
    if (!take(t)) {
      take('FAST') || take('POWER') || take('BASIC') || take('ARMOR');
    }
  }

  const phase2Pattern: EnemyType[] = [
    'POWER', 'FAST', 'BASIC', 'ARMOR', 'FAST',
    'POWER', 'FAST', 'ARMOR', 'BASIC', 'POWER',
  ];
  for (const t of phase2Pattern) {
    if (!take(t)) {
      take('POWER') || take('ARMOR') || take('FAST') || take('BASIC');
    }
  }

  const phase3Pattern: EnemyType[] = [
    'ARMOR', 'POWER', 'FAST', 'ARMOR', 'POWER',
    'FAST', 'ARMOR', 'POWER', 'ARMOR', 'POWER',
  ];
  for (const t of phase3Pattern) {
    if (!take(t)) {
      take('ARMOR') || take('POWER') || take('FAST') || take('BASIC');
    }
  }

  while (queue.length < ENEMY_CONFIG.TOTAL_COUNT) {
    if (!(take('ARMOR') || take('POWER') || take('FAST') || take('BASIC'))) {
      break;
    }
  }

  return queue;
}

export function countEnemyQueueTypes(queue: readonly EnemyType[]): StageEnemyComposition {
  const counts: StageEnemyComposition = { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 };
  for (const t of queue) {
    if (counts[t] !== undefined) {
      counts[t]++;
    }
  }
  return counts;
}

// ============================================================================
// STAGE 2–10 TACTICAL 13x13 MAPS (Stage 1 preserved verbatim in constants.ts)
// Tile codes: 0=EMPTY, 1=BRICK, 2=STEEL, 3=WATER, 4=GRASS, 5=ICE, 9=BASE
// Fixed positions:
// - Enemy spawns: [0,0], [0,6], [0,12]
// - Player spawns: P1=[12,3], P2=[12,9]
// - Base: [12,6]=9 with BRICK wings [12,5]=1, [12,7]=1
// ============================================================================

export const STAGE_2_MAP: StageMapMatrix = [
  [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
  [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
  [0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0],
  [1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1],
  [0, 0, 0, 0, 1, 1, 2, 1, 1, 0, 0, 0, 0],
  [0, 1, 1, 0, 2, 0, 0, 0, 2, 0, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 1, 1, 9, 1, 1, 0, 0, 1, 0],
];

export const STAGE_3_MAP: StageMapMatrix = [
  [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0],
  [0, 1, 2, 0, 1, 1, 0, 1, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 2, 1, 0, 1, 2, 0, 0, 1, 0],
  [0, 0, 0, 2, 2, 0, 0, 0, 2, 2, 0, 0, 0],
  [1, 1, 0, 0, 0, 1, 2, 1, 0, 0, 0, 1, 1],
  [0, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0],
  [0, 2, 0, 1, 2, 0, 0, 0, 2, 1, 0, 2, 0],
  [0, 2, 0, 0, 0, 1, 1, 1, 0, 0, 0, 2, 0],
  [0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0],
  [1, 1, 0, 1, 2, 0, 0, 0, 2, 1, 0, 1, 1],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 2, 0, 1, 1, 1, 1, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_4_MAP: StageMapMatrix = [
  [0, 4, 0, 0, 3, 0, 0, 0, 3, 0, 0, 4, 0],
  [0, 4, 1, 0, 3, 1, 0, 1, 3, 0, 1, 4, 0],
  [0, 0, 1, 0, 0, 4, 4, 4, 0, 0, 1, 0, 0],
  [4, 4, 0, 0, 1, 1, 0, 1, 1, 0, 0, 4, 4],
  [0, 3, 3, 0, 0, 4, 2, 4, 0, 0, 3, 3, 0],
  [0, 3, 3, 0, 1, 0, 0, 0, 1, 0, 3, 3, 0],
  [0, 0, 4, 4, 1, 0, 3, 0, 1, 4, 4, 0, 0],
  [0, 1, 4, 0, 0, 0, 3, 0, 0, 0, 4, 1, 0],
  [0, 1, 0, 0, 2, 1, 0, 1, 2, 0, 0, 1, 0],
  [4, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 4],
  [0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0],
  [0, 1, 4, 0, 1, 1, 1, 1, 1, 0, 4, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_5_MAP: StageMapMatrix = [
  [0, 0, 5, 0, 1, 0, 0, 0, 1, 0, 5, 0, 0],
  [0, 1, 5, 5, 0, 5, 0, 5, 0, 5, 5, 1, 0],
  [0, 1, 2, 5, 1, 5, 5, 5, 1, 5, 2, 1, 0],
  [0, 0, 0, 5, 0, 0, 2, 0, 0, 5, 0, 0, 0],
  [1, 5, 5, 5, 1, 5, 5, 5, 1, 5, 5, 5, 1],
  [0, 5, 2, 0, 0, 5, 0, 5, 0, 0, 2, 5, 0],
  [0, 5, 5, 0, 1, 5, 2, 5, 1, 0, 5, 5, 0],
  [0, 0, 5, 1, 1, 0, 0, 0, 1, 1, 5, 0, 0],
  [0, 1, 5, 5, 0, 5, 5, 5, 0, 5, 5, 1, 0],
  [2, 1, 0, 5, 1, 0, 2, 0, 1, 5, 0, 1, 2],
  [0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_6_MAP: StageMapMatrix = [
  [0, 0, 1, 0, 3, 0, 0, 0, 3, 0, 1, 0, 0],
  [0, 2, 1, 0, 3, 4, 0, 4, 3, 0, 1, 2, 0],
  [0, 0, 0, 0, 1, 4, 0, 4, 1, 0, 0, 0, 0],
  [1, 1, 0, 2, 0, 0, 2, 0, 0, 2, 0, 1, 1],
  [3, 0, 0, 2, 4, 1, 0, 1, 4, 2, 0, 0, 3],
  [3, 4, 0, 0, 4, 0, 0, 0, 4, 0, 0, 4, 3],
  [0, 4, 1, 0, 0, 2, 0, 2, 0, 0, 1, 4, 0],
  [0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0],
  [0, 2, 0, 0, 1, 0, 2, 0, 1, 0, 0, 2, 0],
  [1, 0, 0, 1, 0, 4, 0, 4, 0, 1, 0, 0, 1],
  [0, 0, 4, 0, 0, 0, 1, 0, 0, 0, 4, 0, 0],
  [0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_7_MAP: StageMapMatrix = [
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 2, 1, 1, 0, 2, 0, 2, 0, 1, 1, 2, 0],
  [0, 1, 4, 0, 0, 1, 1, 1, 0, 0, 4, 1, 0],
  [1, 1, 4, 2, 0, 0, 0, 0, 0, 2, 4, 1, 1],
  [0, 0, 0, 2, 1, 1, 0, 1, 1, 2, 0, 0, 0],
  [3, 3, 0, 0, 1, 4, 2, 4, 1, 0, 0, 3, 3],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  [3, 3, 0, 0, 1, 4, 1, 4, 1, 0, 0, 3, 3],
  [0, 0, 0, 2, 1, 0, 0, 0, 1, 2, 0, 0, 0],
  [1, 1, 0, 2, 0, 0, 2, 0, 0, 2, 0, 1, 1],
  [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 2, 1, 0, 1, 1, 1, 1, 1, 0, 1, 2, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_8_MAP: StageMapMatrix = [
  [0, 0, 2, 0, 0, 5, 0, 5, 0, 0, 2, 0, 0],
  [0, 1, 2, 0, 1, 5, 0, 5, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 2, 5, 1, 5, 2, 0, 0, 1, 0],
  [0, 0, 0, 3, 2, 5, 0, 5, 2, 3, 0, 0, 0],
  [2, 1, 0, 3, 0, 0, 2, 0, 0, 3, 0, 1, 2],
  [0, 0, 0, 2, 0, 1, 5, 1, 0, 2, 0, 0, 0],
  [0, 4, 0, 2, 0, 1, 5, 1, 0, 2, 0, 4, 0],
  [0, 4, 0, 0, 0, 0, 2, 0, 0, 0, 0, 4, 0],
  [1, 1, 0, 2, 1, 0, 5, 0, 1, 2, 0, 1, 1],
  [0, 0, 0, 2, 0, 0, 5, 0, 0, 2, 0, 0, 0],
  [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
  [0, 1, 2, 0, 1, 1, 1, 1, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_9_MAP: StageMapMatrix = [
  [0, 1, 0, 3, 0, 4, 0, 4, 0, 3, 0, 1, 0],
  [0, 1, 2, 3, 0, 4, 5, 4, 0, 3, 2, 1, 0],
  [0, 0, 2, 0, 0, 1, 5, 1, 0, 0, 2, 0, 0],
  [2, 0, 0, 0, 2, 1, 0, 1, 2, 0, 0, 0, 2],
  [0, 4, 1, 0, 3, 0, 5, 0, 3, 0, 1, 4, 0],
  [0, 4, 1, 2, 3, 0, 2, 0, 3, 2, 1, 4, 0],
  [0, 0, 0, 0, 0, 5, 5, 5, 0, 0, 0, 0, 0],
  [1, 1, 2, 0, 4, 0, 3, 0, 4, 0, 2, 1, 1],
  [0, 0, 0, 0, 4, 1, 3, 1, 4, 0, 0, 0, 0],
  [0, 2, 1, 0, 0, 1, 0, 1, 0, 0, 1, 2, 0],
  [0, 0, 0, 5, 0, 0, 1, 0, 0, 5, 0, 0, 0],
  [0, 1, 2, 0, 1, 1, 1, 1, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 0, 1, 9, 1, 0, 0, 0, 1, 0],
];

export const STAGE_10_MAP: StageMapMatrix = [
  [0, 2, 0, 4, 0, 2, 0, 2, 0, 4, 0, 2, 0],
  [0, 2, 1, 4, 0, 5, 0, 5, 0, 4, 1, 2, 0],
  [0, 0, 1, 2, 0, 5, 2, 5, 0, 2, 1, 0, 0],
  [2, 1, 0, 0, 0, 1, 5, 1, 0, 0, 0, 1, 2],
  [0, 0, 3, 3, 0, 0, 5, 0, 0, 3, 3, 0, 0],
  [0, 4, 3, 3, 2, 1, 0, 1, 2, 3, 3, 4, 0],
  [0, 4, 0, 0, 2, 5, 2, 5, 2, 0, 0, 4, 0],
  [0, 1, 1, 0, 0, 5, 0, 5, 0, 0, 1, 1, 0],
  [2, 0, 0, 0, 2, 1, 5, 1, 2, 0, 0, 0, 2],
  [0, 0, 2, 1, 1, 0, 2, 0, 1, 1, 2, 0, 0],
  [0, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0],
  [0, 2, 1, 0, 1, 1, 1, 1, 1, 0, 1, 2, 0],
  [0, 1, 0, 0, 2, 1, 9, 1, 2, 0, 0, 1, 0],
];

const STAGE_1_COMP: StageEnemyComposition = { BASIC: 15, FAST: 7, POWER: 5, ARMOR: 3 };
const STAGE_2_COMP: StageEnemyComposition = { BASIC: 13, FAST: 7, POWER: 6, ARMOR: 4 };
const STAGE_3_COMP: StageEnemyComposition = { BASIC: 12, FAST: 7, POWER: 6, ARMOR: 5 };
const STAGE_4_COMP: StageEnemyComposition = { BASIC: 10, FAST: 8, POWER: 7, ARMOR: 5 };
const STAGE_5_COMP: StageEnemyComposition = { BASIC: 9, FAST: 8, POWER: 7, ARMOR: 6 };
const STAGE_6_COMP: StageEnemyComposition = { BASIC: 8, FAST: 8, POWER: 8, ARMOR: 6 };
const STAGE_7_COMP: StageEnemyComposition = { BASIC: 7, FAST: 8, POWER: 8, ARMOR: 7 };
const STAGE_8_COMP: StageEnemyComposition = { BASIC: 6, FAST: 8, POWER: 9, ARMOR: 7 };
const STAGE_9_COMP: StageEnemyComposition = { BASIC: 5, FAST: 8, POWER: 9, ARMOR: 8 };
const STAGE_10_COMP: StageEnemyComposition = { BASIC: 4, FAST: 8, POWER: 10, ARMOR: 8 };

export const CAMPAIGN_STAGE_SPECS: readonly CampaignStageSpec[] = [
  {
    id: 1,
    orderIndex: 1,
    name: 'Stage 1 - Mặt Trận Khởi Đầu',
    shortTitle: 'MẶT TRẬN KHỞI ĐẦU',
    terrainFocus: 'Gạch & Thép cơ bản',
    map: STAGE_1_MAP,
    enemyComposition: STAGE_1_COMP,
    enemyQueue: [...ENEMY_CONFIG.QUEUE],
    spawnIntervalS: 1.0,
  },
  {
    id: 2,
    orderIndex: 2,
    name: 'Stage 2 – HẺM GẠCH',
    shortTitle: 'HẺM GẠCH',
    terrainFocus: 'Hành lang gạch dày đặc & điểm phá tường chiến thuật',
    map: STAGE_2_MAP,
    enemyComposition: STAGE_2_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_2_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 3,
    orderIndex: 3,
    name: 'Stage 3 – PHÁO ĐÀI THÉP',
    shortTitle: 'PHÁO ĐÀI THÉP',
    terrainFocus: 'Chốt thép kiên cố chia cắt 3 mũi tiến công',
    map: STAGE_3_MAP,
    enemyComposition: STAGE_3_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_3_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 4,
    orderIndex: 4,
    name: 'Stage 4 – ĐẦM LẦY',
    shortTitle: 'ĐẦM LẦY',
    terrainFocus: 'Mặt nước chia cắt cầu qua sông & bụi cỏ phục kích',
    map: STAGE_4_MAP,
    enemyComposition: STAGE_4_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_4_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 5,
    orderIndex: 5,
    name: 'Stage 5 – BĂNG TUYẾT',
    shortTitle: 'BĂNG TUYẾT',
    terrainFocus: 'Trục đường băng thông thoáng & pháo đài biên',
    map: STAGE_5_MAP,
    enemyComposition: STAGE_5_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_5_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 6,
    orderIndex: 6,
    name: 'Stage 6 – NGÃ BA CHIẾN THUẬT',
    shortTitle: 'NGÃ BA CHIẾN THUẬT',
    terrainFocus: 'Giao lộ 3 nhánh với lá chắn thép & sông biên',
    map: STAGE_6_MAP,
    enemyComposition: STAGE_6_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_6_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 7,
    orderIndex: 7,
    name: 'Stage 7 – VÒNG VÂY',
    shortTitle: 'VÒNG VÂY',
    terrainFocus: 'Vành đai phòng ngự đồng tâm siết chặt trung tâm',
    map: STAGE_7_MAP,
    enemyComposition: STAGE_7_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_7_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 8,
    orderIndex: 8,
    name: 'Stage 8 – HÀNH LANG TỬ THỦ',
    shortTitle: 'HÀNH LANG TỬ THỦ',
    terrainFocus: 'Hành lang dọc tốc độ cao gây áp lực trực diện căn cứ',
    map: STAGE_8_MAP,
    enemyComposition: STAGE_8_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_8_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 9,
    orderIndex: 9,
    name: 'Stage 9 – MÊ CUNG HỖN HỢP',
    shortTitle: 'MÊ CUNG HỖN HỢP',
    terrainFocus: 'Mê cung đa địa hình Gạch, Thép, Nước, Cỏ, Băng',
    map: STAGE_9_MAP,
    enemyComposition: STAGE_9_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_9_COMP),
    spawnIntervalS: 1.0,
  },
  {
    id: 10,
    orderIndex: 10,
    name: 'Stage 10 – TỔNG HÀNH DINH',
    shortTitle: 'TỔNG HÀNH DINH',
    terrainFocus: 'Tổng hành dinh tối hậu bảo vệ cửa ngõ chiến trường',
    map: STAGE_10_MAP,
    enemyComposition: STAGE_10_COMP,
    enemyQueue: buildCampaignEnemyQueue(STAGE_10_COMP),
    spawnIntervalS: 1.0,
  },
] as const;

export const TOTAL_CAMPAIGN_STAGES = 10;

export function getCampaignStageSpec(stageId: number): CampaignStageSpec {
  return CAMPAIGN_STAGE_SPECS.find((s) => s.id === stageId) ?? CAMPAIGN_STAGE_SPECS[0];
}
