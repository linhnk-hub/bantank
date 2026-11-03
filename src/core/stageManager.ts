/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, ENEMY_CONFIG, MAP_DIMENSIONS } from './constants.ts';
import { type EnemyType } from './types.ts';
import { validateStageMap } from './mapValidator.ts';

export interface StageDefinition {
  id: number;
  name: string;
  map: number[][]; // 13x13 matrix
  enemyQueue: EnemyType[]; // 30 enemies
  spawnIntervalS?: number;
}

/**
 * Validates a stage definition to ensure compatibility with Game Core.
 */
export function validateStageDefinition(stage: StageDefinition): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!stage.id || stage.id < 1) {
    errors.push('Stage ID phải là số nguyên dương lớn hơn hoặc bằng 1.');
  }

  if (!stage.name || stage.name.trim().length === 0) {
    errors.push('Stage name không được để trống.');
  }

  // Validate Map Matrix
  if (!stage.map || !Array.isArray(stage.map) || stage.map.length !== MAP_DIMENSIONS.ROWS) {
    errors.push(`Bản đồ màn chơi phải có đúng ${MAP_DIMENSIONS.ROWS} hàng.`);
  } else {
    for (let r = 0; r < stage.map.length; r++) {
      if (!Array.isArray(stage.map[r]) || stage.map[r].length !== MAP_DIMENSIONS.COLS) {
        errors.push(`Hàng ${r} phải có đúng ${MAP_DIMENSIONS.COLS} cột.`);
        break;
      }
    }
  }

  if (errors.length === 0) {
    const mapValidation = validateStageMap(stage.map);
    if (!mapValidation.isValid) {
      errors.push(...mapValidation.errors);
    }
  }

  // Validate Enemy Queue
  if (!stage.enemyQueue || !Array.isArray(stage.enemyQueue)) {
    errors.push('Cấu hình enemyQueue phải là một mảng.');
  } else if (stage.enemyQueue.length !== ENEMY_CONFIG.TOTAL_COUNT) {
    errors.push(
      `Cấu hình enemyQueue phải chứa đúng ${ENEMY_CONFIG.TOTAL_COUNT} xe địch (nhận được: ${stage.enemyQueue.length}).`
    );
  } else {
    const validTypes: EnemyType[] = ['BASIC', 'FAST', 'POWER', 'ARMOR'];
    for (let i = 0; i < stage.enemyQueue.length; i++) {
      if (!validTypes.includes(stage.enemyQueue[i])) {
        errors.push(`Phần tử ${i} trong enemyQueue có loại xe không hợp lệ: ${stage.enemyQueue[i]}`);
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Official Stage 1 Definition preserving 100% of M1 Stage 1 map and M3 30-enemy wave.
 */
export const STAGE_1_DEFINITION: StageDefinition = {
  id: 1,
  name: 'Stage 1 - Mặt Trận Khởi Đầu',
  map: STAGE_1_MAP,
  enemyQueue: [...ENEMY_CONFIG.QUEUE],
  spawnIntervalS: 1.0,
};

export class StageManager {
  private stages: Map<number, StageDefinition> = new Map();
  private currentStageId: number = 1;

  constructor() {
    // Register official Stage 1
    this.registerStage(STAGE_1_DEFINITION);
  }

  public registerStage(stage: StageDefinition): boolean {
    const val = validateStageDefinition(stage);
    if (!val.isValid) {
      console.error(`Không thể đăng ký Stage ${stage.id}:`, val.errors);
      return false;
    }
    // Deep clone map to prevent accidental external mutations
    const clonedMap = stage.map.map((row) => [...row]);
    this.stages.set(stage.id, {
      ...stage,
      map: clonedMap,
      enemyQueue: [...stage.enemyQueue],
    });
    return true;
  }

  public getStage(id: number): StageDefinition | null {
    const stage = this.stages.get(id);
    if (!stage) return null;
    return {
      ...stage,
      map: stage.map.map((row) => [...row]),
      enemyQueue: [...stage.enemyQueue],
    };
  }

  public getCurrentStage(): StageDefinition {
    const stage = this.getStage(this.currentStageId);
    if (!stage) {
      return {
        ...STAGE_1_DEFINITION,
        map: STAGE_1_DEFINITION.map.map((row) => [...row]),
        enemyQueue: [...STAGE_1_DEFINITION.enemyQueue],
      };
    }
    return stage;
  }

  public setCurrentStage(id: number): boolean {
    if (!this.stages.has(id)) {
      return false;
    }
    this.currentStageId = id;
    return true;
  }

  public getAllStages(): StageDefinition[] {
    return Array.from(this.stages.values()).map((s) => ({
      ...s,
      map: s.map.map((row) => [...row]),
      enemyQueue: [...s.enemyQueue],
    }));
  }

  public hasNextStage(): boolean {
    return this.stages.has(this.currentStageId + 1);
  }

  public getNextStageId(): number | null {
    const nextId = this.currentStageId + 1;
    return this.stages.has(nextId) ? nextId : null;
  }

  public resetToFirstStage(): void {
    this.currentStageId = 1;
  }
}
