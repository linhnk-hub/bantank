/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, ENEMY_CONFIG, MAP_DIMENSIONS } from './constants.ts';
import { TILE_TYPES, type EnemyType } from './types.ts';
import { validateStageMap } from './mapValidator.ts';
import { hasRolePermission, type UserRole } from './rbacMatrix.ts';

export type StageLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

export interface StageDefinition {
  id: number;
  name: string;
  map: number[][]; // 13x13 matrix
  enemyQueue: EnemyType[]; // 30 enemies
  spawnIntervalS?: number;
  orderIndex?: number;
  version?: number;
  status?: StageLifecycleStatus;
}

export interface StageVersionSnapshot {
  version: number;
  name: string;
  orderIndex: number;
  map: number[][];
  enemyQueue: EnemyType[];
  updatedAtMs: number;
  updatedBy: string;
}

export interface ManagedStageRecord {
  id: number;
  orderIndex: number;
  name: string;
  status: StageLifecycleStatus;
  version: number;
  activeVersion: number | null;
  updatedAtMs: number;
  updatedBy: string;
  isOfficialStage1: boolean;
  draftMap: number[][];
  activeMap: number[][] | null;
  enemyQueue: EnemyType[];
  spawnIntervalS: number;
  previousActiveVersions: StageVersionSnapshot[];
}

export function cloneStageMap(map: number[][]): number[][] {
  return map.map((row) => [...row]);
}

export function areStageMapsEqual(a: number[][], b: number[][]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let r = 0; r < a.length; r++) {
    if (!Array.isArray(a[r]) || !Array.isArray(b[r]) || a[r].length !== b[r].length) {
      return false;
    }
    for (let c = 0; c < a[r].length; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

/**
 * Creates a clean 13x13 template map with intact Eagle Base at [12, 6] and Brick protection walls
 * at [12, 5], [12, 7], [11, 5], [11, 6], [11, 7], leaving all spawn points open.
 */
export function createBlankDraftMap(): number[][] {
  const grid: number[][] = Array.from({ length: MAP_DIMENSIONS.ROWS }, () =>
    Array(MAP_DIMENSIONS.COLS).fill(TILE_TYPES.EMPTY)
  );
  grid[11][5] = TILE_TYPES.BRICK;
  grid[11][6] = TILE_TYPES.BRICK;
  grid[11][7] = TILE_TYPES.BRICK;
  grid[12][5] = TILE_TYPES.BRICK;
  grid[12][6] = TILE_TYPES.BASE;
  grid[12][7] = TILE_TYPES.BRICK;
  return grid;
}

/**
 * Validates a stage definition to ensure compatibility with Game Core.
 */
export function validateStageDefinition(stage: StageDefinition): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!stage.id || !Number.isInteger(stage.id) || stage.id < 1) {
    errors.push('Stage ID phải là số nguyên dương lớn hơn hoặc bằng 1.');
  }

  if (!stage.name || stage.name.trim().length === 0) {
    errors.push('Tên màn chơi (Stage name) không được để trống.');
  }

  if (
    stage.orderIndex !== undefined &&
    (!Number.isInteger(stage.orderIndex) || stage.orderIndex < 1)
  ) {
    errors.push('Số thứ tự Stage phải là số nguyên dương lớn hơn hoặc bằng 1.');
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
  orderIndex: 1,
  version: 1,
  status: 'ACTIVE',
};

const MANAGED_STAGES_STORAGE_KEY = 'bantank_managed_stages_v1';

export class StageManager {
  private static globalInstance: StageManager | null = null;

  private stages: Map<number, StageDefinition> = new Map();
  private managedStages: Map<number, ManagedStageRecord> = new Map();
  private currentStageId: number = 1;
  private listeners: Set<() => void> = new Set();

  public static getInstance(): StageManager {
    if (!StageManager.globalInstance) {
      StageManager.globalInstance = new StageManager({ loadPersisted: true });
    }
    return StageManager.globalInstance;
  }

  constructor(options?: { loadPersisted?: boolean }) {
    this.initializeOfficialStage1();
    if (options?.loadPersisted) {
      this.loadFromStorage();
    } else if (StageManager.globalInstance) {
      // Seed active stages from global StageManager snapshot so new GameEngine instances
      // get all currently active stages while remaining isolated during gameplay!
      const globalManaged = StageManager.globalInstance.getManagedStages();
      for (const rec of globalManaged) {
        if (rec.id !== 1) {
          this.managedStages.set(rec.id, this.cloneManagedRecord(rec));
          if (rec.status === 'ACTIVE' && rec.activeMap) {
            this.stages.set(rec.id, {
              id: rec.id,
              name: rec.name,
              map: cloneStageMap(rec.activeMap),
              enemyQueue: [...rec.enemyQueue],
              spawnIntervalS: rec.spawnIntervalS,
              orderIndex: rec.orderIndex,
              version: rec.activeVersion ?? rec.version,
              status: 'ACTIVE',
            });
          }
        }
      }
    }
  }

  private initializeOfficialStage1(): void {
    const officialMap = cloneStageMap(STAGE_1_MAP);
    const stage1Record: ManagedStageRecord = {
      id: 1,
      orderIndex: 1,
      name: STAGE_1_DEFINITION.name,
      status: 'ACTIVE',
      version: 1,
      activeVersion: 1,
      updatedAtMs: 1700000000000,
      updatedBy: 'system@bantank.online',
      isOfficialStage1: true,
      draftMap: cloneStageMap(officialMap),
      activeMap: cloneStageMap(officialMap),
      enemyQueue: [...STAGE_1_DEFINITION.enemyQueue],
      spawnIntervalS: STAGE_1_DEFINITION.spawnIntervalS ?? 1.0,
      previousActiveVersions: [],
    };
    this.managedStages.set(1, stage1Record);
    this.stages.set(1, {
      ...STAGE_1_DEFINITION,
      map: cloneStageMap(officialMap),
      enemyQueue: [...STAGE_1_DEFINITION.enemyQueue],
    });
  }

  private cloneManagedRecord(rec: ManagedStageRecord): ManagedStageRecord {
    return {
      ...rec,
      draftMap: cloneStageMap(rec.draftMap),
      activeMap: rec.activeMap ? cloneStageMap(rec.activeMap) : null,
      enemyQueue: [...rec.enemyQueue],
      previousActiveVersions: rec.previousActiveVersions.map((v) => ({
        ...v,
        map: cloneStageMap(v.map),
        enemyQueue: [...v.enemyQueue],
      })),
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error('[StageManager] listener error:', e);
      }
    });
  }

  private saveToStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const serialized = Array.from(this.managedStages.values()).filter((s) => s.id !== 1);
        window.localStorage.setItem(MANAGED_STAGES_STORAGE_KEY, JSON.stringify(serialized));
      }
    } catch (e) {
      console.warn('[StageManager] saveToStorage warning:', e);
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(MANAGED_STAGES_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        for (const item of parsed) {
          if (!item || typeof item.id !== 'number' || item.id <= 1) continue;
          const draftCheck = validateStageMap(item.draftMap);
          if (!Array.isArray(item.draftMap) || item.draftMap.length !== MAP_DIMENSIONS.ROWS) {
            continue;
          }
          const rec: ManagedStageRecord = {
            id: item.id,
            orderIndex: typeof item.orderIndex === 'number' && item.orderIndex >= 2 ? item.orderIndex : item.id,
            name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Stage ${item.id}`,
            status:
              item.status === 'ACTIVE' && draftCheck.isValid
                ? 'ACTIVE'
                : item.status === 'INACTIVE'
                  ? 'INACTIVE'
                  : 'DRAFT',
            version: typeof item.version === 'number' && item.version >= 1 ? item.version : 1,
            activeVersion: typeof item.activeVersion === 'number' ? item.activeVersion : null,
            updatedAtMs: typeof item.updatedAtMs === 'number' ? item.updatedAtMs : Date.now(),
            updatedBy: typeof item.updatedBy === 'string' ? item.updatedBy : 'admin@bantank.online',
            isOfficialStage1: false,
            draftMap: cloneStageMap(item.draftMap),
            activeMap:
              Array.isArray(item.activeMap) && validateStageMap(item.activeMap).isValid
                ? cloneStageMap(item.activeMap)
                : null,
            enemyQueue: Array.isArray(item.enemyQueue) && item.enemyQueue.length === ENEMY_CONFIG.TOTAL_COUNT
              ? [...item.enemyQueue]
              : [...ENEMY_CONFIG.QUEUE],
            spawnIntervalS: typeof item.spawnIntervalS === 'number' ? item.spawnIntervalS : 1.0,
            previousActiveVersions: Array.isArray(item.previousActiveVersions)
              ? item.previousActiveVersions
              : [],
          };
          this.managedStages.set(rec.id, rec);
          if (rec.status === 'ACTIVE' && rec.activeMap) {
            this.stages.set(rec.id, {
              id: rec.id,
              name: rec.name,
              map: cloneStageMap(rec.activeMap),
              enemyQueue: [...rec.enemyQueue],
              spawnIntervalS: rec.spawnIntervalS,
              orderIndex: rec.orderIndex,
              version: rec.activeVersion ?? rec.version,
              status: 'ACTIVE',
            });
          }
        }
      }
    } catch (e) {
      console.warn('[StageManager] loadFromStorage warning:', e);
    }
  }

  private rebuildActiveStagesMap(): void {
    this.stages.clear();
    // Official Stage 1 is always guaranteed active and intact
    this.initializeOfficialStage1();

    const sortedRecords = Array.from(this.managedStages.values())
      .filter((r) => r.id !== 1 && r.status === 'ACTIVE' && r.activeMap !== null)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id);

    for (const rec of sortedRecords) {
      if (!rec.activeMap) continue;
      this.stages.set(rec.id, {
        id: rec.id,
        name: rec.name,
        map: cloneStageMap(rec.activeMap),
        enemyQueue: [...rec.enemyQueue],
        spawnIntervalS: rec.spawnIntervalS,
        orderIndex: rec.orderIndex,
        version: rec.activeVersion ?? rec.version,
        status: 'ACTIVE',
      });
    }
  }

  public getManagedStages(): ManagedStageRecord[] {
    return Array.from(this.managedStages.values())
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id - b.id)
      .map((rec) => this.cloneManagedRecord(rec));
  }

  public getManagedStage(id: number): ManagedStageRecord | null {
    const rec = this.managedStages.get(id);
    return rec ? this.cloneManagedRecord(rec) : null;
  }

  /**
   * Tạo màn chơi mới ở trạng thái Bản nháp (DRAFT).
   * Màn chơi mới tạo mặc định ở trạng thái DRAFT cho đến khi Admin nhấn Kích hoạt.
   */
  public createStageDraft(params: {
    name?: string;
    orderIndex?: number;
    baseMap?: number[][];
    actorRole: UserRole;
    actorEmail: string;
  }): { success: boolean; stage?: ManagedStageRecord; errors: string[] } {
    if (!hasRolePermission(params.actorRole, 'ADD_STAGE')) {
      return {
        success: false,
        errors: ['Tài khoản hiện tại không có quyền thêm màn chơi mới (Yêu cầu quyền Admin hoặc Super Admin).'],
      };
    }

    const existingIds = Array.from(this.managedStages.keys());
    const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 2;
    const existingOrders = Array.from(this.managedStages.values()).map((s) => s.orderIndex);
    const defaultOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 2;
    const orderIndex =
      typeof params.orderIndex === 'number' && Number.isInteger(params.orderIndex) && params.orderIndex >= 2
        ? params.orderIndex
        : defaultOrder;

    const stageName =
      params.name && params.name.trim().length > 0
        ? params.name.trim()
        : `Stage ${orderIndex} - Mặt Trận Mới`;

    const initialMap =
      params.baseMap &&
      Array.isArray(params.baseMap) &&
      params.baseMap.length === MAP_DIMENSIONS.ROWS
        ? cloneStageMap(params.baseMap)
        : createBlankDraftMap();

    const now = Date.now();
    const newRecord: ManagedStageRecord = {
      id: nextId,
      orderIndex,
      name: stageName,
      status: 'DRAFT',
      version: 1,
      activeVersion: null,
      updatedAtMs: now,
      updatedBy: params.actorEmail || 'admin@bantank.online',
      isOfficialStage1: false,
      draftMap: initialMap,
      activeMap: null,
      enemyQueue: [...ENEMY_CONFIG.QUEUE],
      spawnIntervalS: 1.0,
      previousActiveVersions: [],
    };

    this.managedStages.set(nextId, newRecord);
    this.saveToStorage();
    this.notifyListeners();

    return {
      success: true,
      stage: this.cloneManagedRecord(newRecord),
      errors: [],
    };
  }

  /**
   * Lưu màn chơi (Bản nháp / Bản cập nhật):
   * - Kiểm tra dữ liệu bản đồ 13x13, mã ô hợp lệ, căn cứ BASE, vị trí spawn không bị chặn, tên và thứ tự hợp lệ.
   * - Bảo vệ Stage 1 chính thức không bị ghi đè sai cấu trúc.
   * - Lưu bản nháp chưa tự động làm thay đổi trận đang diễn ra hoặc bản đồ đang kích hoạt cho đến khi nhấn Kích hoạt.
   */
  public saveStageDraft(params: {
    id: number;
    name: string;
    orderIndex: number;
    map: number[][];
    actorRole: UserRole;
    actorEmail: string;
  }): { success: boolean; stage?: ManagedStageRecord; errors: string[] } {
    if (!hasRolePermission(params.actorRole, 'SAVE_STAGE_DRAFT')) {
      return {
        success: false,
        errors: ['Tài khoản hiện tại không có quyền lưu màn chơi (Yêu cầu quyền Admin hoặc Super Admin).'],
      };
    }

    const existing = this.managedStages.get(params.id);
    if (!existing) {
      return {
        success: false,
        errors: [`Không tìm thấy màn chơi có ID #${params.id}.`],
      };
    }

    // Protect Official Stage 1 from any structural mutation or overwrite
    if (existing.isOfficialStage1 || params.id === 1) {
      if (params.orderIndex !== 1) {
        return {
          success: false,
          errors: ['Không thể thay đổi số thứ tự của Stage 1 chính thức (bắt buộc là Stage #1).'],
        };
      }
      if (!areStageMapsEqual(params.map, STAGE_1_MAP)) {
        return {
          success: false,
          errors: [
            'Stage 1 chính thức được bảo vệ nguyên trạng theo chuẩn hệ thống. Vui lòng nhấn "Thêm màn chơi" để lưu thiết kế bản đồ mới vào Stage 2+.',
          ],
        };
      }
    }

    const trimmedName = (params.name || '').trim();
    if (!trimmedName) {
      return {
        success: false,
        errors: ['Tên Stage không được để trống.'],
      };
    }

    if (!Number.isInteger(params.orderIndex) || params.orderIndex < 1) {
      return {
        success: false,
        errors: ['Số thứ tự Stage phải là số nguyên dương lớn hơn hoặc bằng 1.'],
      };
    }

    if (params.id !== 1 && params.orderIndex === 1) {
      return {
        success: false,
        errors: ['Số thứ tự 1 đã thuộc về Stage 1 chính thức. Vui lòng chọn số thứ tự từ 2 trở lên.'],
      };
    }

    // Check duplicate active orderIndex
    for (const other of this.managedStages.values()) {
      if (
        other.id !== params.id &&
        other.status === 'ACTIVE' &&
        other.orderIndex === params.orderIndex
      ) {
        return {
          success: false,
          errors: [
            `Số thứ tự Stage #${params.orderIndex} đang được sử dụng bởi màn chơi đã kích hoạt "${other.name}".`,
          ],
        };
      }
    }

    // Validate 13x13 map, tile codes, BASE rules, and tank spawn points
    const stageValidation = validateStageDefinition({
      id: params.id,
      name: trimmedName,
      orderIndex: params.orderIndex,
      map: params.map,
      enemyQueue: existing.enemyQueue,
    });

    if (!stageValidation.isValid) {
      return {
        success: false,
        errors: stageValidation.errors,
      };
    }

    existing.name = trimmedName;
    existing.orderIndex = params.orderIndex;
    existing.draftMap = cloneStageMap(params.map);
    existing.version += 1;
    existing.updatedAtMs = Date.now();
    existing.updatedBy = params.actorEmail || 'admin@bantank.online';

    this.saveToStorage();
    this.notifyListeners();

    return {
      success: true,
      stage: this.cloneManagedRecord(existing),
      errors: [],
    };
  }

  /**
   * Kích hoạt màn chơi:
   * - Kiểm tra hợp lệ toàn bộ cấu trúc bản đồ và thứ tự Stage trước khi đưa vào danh sách màn chơi hoạt động.
   * - Lưu phiên bản đang kích hoạt trước đó vào lịch sử để hỗ trợ khôi phục (rollback).
   */
  public activateStage(params: {
    id: number;
    actorRole: UserRole;
    actorEmail: string;
  }): { success: boolean; stage?: ManagedStageRecord; errors: string[] } {
    if (!hasRolePermission(params.actorRole, 'ACTIVATE_STAGE')) {
      return {
        success: false,
        errors: ['Tài khoản hiện tại không có quyền kích hoạt màn chơi (Yêu cầu quyền Admin hoặc Super Admin).'],
      };
    }

    const existing = this.managedStages.get(params.id);
    if (!existing) {
      return {
        success: false,
        errors: [`Không tìm thấy màn chơi có ID #${params.id}.`],
      };
    }

    if (existing.isOfficialStage1 || existing.id === 1) {
      existing.status = 'ACTIVE';
      existing.draftMap = cloneStageMap(STAGE_1_MAP);
      existing.activeMap = cloneStageMap(STAGE_1_MAP);
      existing.activeVersion = existing.version;
      this.rebuildActiveStagesMap();
      this.notifyListeners();
      return {
        success: true,
        stage: this.cloneManagedRecord(existing),
        errors: [],
      };
    }

    // Check duplicate orderIndex against other ACTIVE stages
    for (const other of this.managedStages.values()) {
      if (
        other.id !== existing.id &&
        other.status === 'ACTIVE' &&
        other.orderIndex === existing.orderIndex
      ) {
        return {
          success: false,
          errors: [
            `Không thể kích hoạt: Số thứ tự Stage #${existing.orderIndex} đang trùng với màn chơi đang hoạt động "${other.name}".`,
          ],
        };
      }
    }

    const validation = validateStageDefinition({
      id: existing.id,
      name: existing.name,
      orderIndex: existing.orderIndex,
      map: existing.draftMap,
      enemyQueue: existing.enemyQueue,
    });

    if (!validation.isValid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Archive current active version for rollback if it exists
    if (existing.activeMap && existing.activeVersion !== null) {
      existing.previousActiveVersions.push({
        version: existing.activeVersion,
        name: existing.name,
        orderIndex: existing.orderIndex,
        map: cloneStageMap(existing.activeMap),
        enemyQueue: [...existing.enemyQueue],
        updatedAtMs: existing.updatedAtMs,
        updatedBy: existing.updatedBy,
      });
      if (existing.previousActiveVersions.length > 10) {
        existing.previousActiveVersions.shift();
      }
    }

    existing.status = 'ACTIVE';
    existing.activeMap = cloneStageMap(existing.draftMap);
    existing.activeVersion = existing.version;
    existing.updatedAtMs = Date.now();
    existing.updatedBy = params.actorEmail || 'admin@bantank.online';

    this.rebuildActiveStagesMap();
    this.saveToStorage();
    this.notifyListeners();

    return {
      success: true,
      stage: this.cloneManagedRecord(existing),
      errors: [],
    };
  }

  /**
   * Ngừng kích hoạt màn chơi (Stage 1 chính thức luôn được bảo vệ hoạt động).
   */
  public deactivateStage(params: {
    id: number;
    actorRole: UserRole;
    actorEmail: string;
  }): { success: boolean; stage?: ManagedStageRecord; errors: string[] } {
    if (!hasRolePermission(params.actorRole, 'DEACTIVATE_STAGE')) {
      return {
        success: false,
        errors: ['Tài khoản hiện tại không có quyền ngừng kích hoạt màn chơi (Yêu cầu quyền Admin hoặc Super Admin).'],
      };
    }

    const existing = this.managedStages.get(params.id);
    if (!existing) {
      return {
        success: false,
        errors: [`Không tìm thấy màn chơi có ID #${params.id}.`],
      };
    }

    if (existing.isOfficialStage1 || existing.id === 1) {
      return {
        success: false,
        errors: ['Không thể ngừng kích hoạt Stage 1 chính thức của hệ thống.'],
      };
    }

    existing.status = 'INACTIVE';
    existing.updatedAtMs = Date.now();
    existing.updatedBy = params.actorEmail || 'admin@bantank.online';

    this.rebuildActiveStagesMap();
    if (this.currentStageId === params.id) {
      this.currentStageId = 1;
    }
    this.saveToStorage();
    this.notifyListeners();

    return {
      success: true,
      stage: this.cloneManagedRecord(existing),
      errors: [],
    };
  }

  /**
   * Quay lại phiên bản hợp lệ trước đó của màn chơi.
   */
  public restorePreviousActiveVersion(params: {
    id: number;
    actorRole: UserRole;
    actorEmail: string;
  }): { success: boolean; stage?: ManagedStageRecord; errors: string[] } {
    if (!hasRolePermission(params.actorRole, 'EDIT_STAGE')) {
      return {
        success: false,
        errors: ['Tài khoản hiện tại không có quyền khôi phục phiên bản màn chơi.'],
      };
    }

    const existing = this.managedStages.get(params.id);
    if (!existing) {
      return {
        success: false,
        errors: [`Không tìm thấy màn chơi có ID #${params.id}.`],
      };
    }

    if (existing.isOfficialStage1 || existing.id === 1) {
      existing.draftMap = cloneStageMap(STAGE_1_MAP);
      existing.activeMap = cloneStageMap(STAGE_1_MAP);
      existing.status = 'ACTIVE';
      this.rebuildActiveStagesMap();
      this.notifyListeners();
      return {
        success: true,
        stage: this.cloneManagedRecord(existing),
        errors: [],
      };
    }

    const prevSnapshot = existing.previousActiveVersions.pop();
    if (!prevSnapshot) {
      return {
        success: false,
        errors: ['Màn chơi này chưa có phiên bản kích hoạt trước đó để khôi phục.'],
      };
    }

    existing.name = prevSnapshot.name;
    existing.orderIndex = prevSnapshot.orderIndex;
    existing.draftMap = cloneStageMap(prevSnapshot.map);
    existing.activeMap = cloneStageMap(prevSnapshot.map);
    existing.version += 1;
    existing.activeVersion = existing.version;
    existing.updatedAtMs = Date.now();
    existing.updatedBy = params.actorEmail || 'admin@bantank.online';

    if (existing.status === 'ACTIVE') {
      this.rebuildActiveStagesMap();
    }
    this.saveToStorage();
    this.notifyListeners();

    return {
      success: true,
      stage: this.cloneManagedRecord(existing),
      errors: [],
    };
  }

  public registerStage(stage: StageDefinition): boolean {
    const val = validateStageDefinition(stage);
    if (!val.isValid) {
      console.error(`Không thể đăng ký Stage ${stage.id}:`, val.errors);
      return false;
    }
    // Protect Official Stage 1 from being overwritten with a different map
    if (stage.id === 1 && !areStageMapsEqual(stage.map, STAGE_1_MAP)) {
      console.error('Không thể ghi đè Stage 1 chính thức bằng cấu trúc bản đồ khác.');
      return false;
    }

    const clonedMap = cloneStageMap(stage.map);
    const orderIdx = stage.orderIndex ?? stage.id;
    const version = stage.version ?? 1;

    this.stages.set(stage.id, {
      ...stage,
      map: clonedMap,
      enemyQueue: [...stage.enemyQueue],
      orderIndex: orderIdx,
      version,
      status: 'ACTIVE',
    });

    if (stage.id !== 1) {
      this.managedStages.set(stage.id, {
        id: stage.id,
        orderIndex: orderIdx,
        name: stage.name,
        status: 'ACTIVE',
        version,
        activeVersion: version,
        updatedAtMs: Date.now(),
        updatedBy: 'system@bantank.online',
        isOfficialStage1: false,
        draftMap: cloneStageMap(clonedMap),
        activeMap: cloneStageMap(clonedMap),
        enemyQueue: [...stage.enemyQueue],
        spawnIntervalS: stage.spawnIntervalS ?? 1.0,
        previousActiveVersions: [],
      });
    }
    return true;
  }

  public getStage(id: number): StageDefinition | null {
    const stage = this.stages.get(id);
    if (!stage) return null;
    return {
      ...stage,
      map: cloneStageMap(stage.map),
      enemyQueue: [...stage.enemyQueue],
    };
  }

  public getCurrentStage(): StageDefinition {
    const stage = this.getStage(this.currentStageId);
    if (!stage) {
      return {
        ...STAGE_1_DEFINITION,
        map: cloneStageMap(STAGE_1_DEFINITION.map),
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
    return Array.from(this.stages.values())
      .sort((a, b) => (a.orderIndex ?? a.id) - (b.orderIndex ?? b.id) || a.id - b.id)
      .map((s) => ({
        ...s,
        map: cloneStageMap(s.map),
        enemyQueue: [...s.enemyQueue],
      }));
  }

  public getActiveStageDefinitions(): StageDefinition[] {
    return this.getAllStages();
  }

  /**
   * Đồng bộ danh sách màn chơi đã kích hoạt từ StageManager toàn cục vào phiên chơi mới
   * khi bắt đầu trận (startMatch), đảm bảo các trận đang diễn ra không bị thay đổi giữa chừng.
   */
  public syncFromGlobalActiveStages(): void {
    const globalInst = StageManager.globalInstance;
    if (!globalInst || globalInst === this) return;
    this.stages.clear();
    for (const stage of globalInst.getAllStages()) {
      this.stages.set(stage.id, {
        ...stage,
        map: cloneStageMap(stage.map),
        enemyQueue: [...stage.enemyQueue],
      });
    }
    if (!this.stages.has(this.currentStageId)) {
      this.currentStageId = 1;
    }
  }

  public hasNextStage(): boolean {
    return this. getNextStageId() !== null;
  }

  public getNextStageId(): number | null {
    const ordered = this.getAllStages();
    const currentIdx = ordered.findIndex((s) => s.id === this.currentStageId);
    if (currentIdx >= 0 && currentIdx + 1 < ordered.length) {
      return ordered[currentIdx + 1].id;
    }
    const directNext = this.currentStageId + 1;
    return this.stages.has(directNext) ? directNext : null;
  }

  public resetToFirstStage(): void {
    this.currentStageId = 1;
  }

  public resetForTesting(): void {
    this.stages.clear();
    this.managedStages.clear();
    this.currentStageId = 1;
    this.initializeOfficialStage1();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(MANAGED_STAGES_STORAGE_KEY);
      }
    } catch {}
    this.notifyListeners();
  }
}

