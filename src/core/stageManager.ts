/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { STAGE_1_MAP, ENEMY_CONFIG, MAP_DIMENSIONS } from './constants.ts';
import { TILE_TYPES, type EnemyType, type StageMapMatrix } from './types.ts';
import { validateStageMap } from './mapValidator.ts';
import { hasRolePermission, type UserRole } from './rbacMatrix.ts';
import {
  ADMIN_EMAIL,
  isAdminUser,
  validatePersonalGmailUser,
  type ValidatedUserAccount,
} from './authManager.ts';
import { getFirebaseDb, handleFirestoreError } from './firebaseConfig.ts';
import {
  CAMPAIGN_STAGE_SPECS,
  countEnemyQueueTypes,
  getCampaignStageSpec,
  type CampaignStageSpec,
} from './campaignStages.ts';

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
  name: 'KHỞI ĐẦU',
  map: STAGE_1_MAP,
  enemyQueue: [...ENEMY_CONFIG.QUEUE],
  spawnIntervalS: 1.0,
  orderIndex: 1,
  version: 1,
  status: 'ACTIVE',
};

const MANAGED_STAGES_STORAGE_KEY = 'bantank_managed_stages_v1';

export interface FirestoreStageRowMap {
  r0: number[];
  r1: number[];
  r2: number[];
  r3: number[];
  r4: number[];
  r5: number[];
  r6: number[];
  r7: number[];
  r8: number[];
  r9: number[];
  r10: number[];
  r11: number[];
  r12: number[];
}

export interface CloudStageCatalogEntry {
  id: number;
  orderIndex: number;
  name: string;
  status: StageLifecycleStatus;
  version: number;
  activeVersion: number | null;
  updatedAtMs: number;
  updatedBy: string;
  draftMapRows: FirestoreStageRowMap;
  activeMapRows: FirestoreStageRowMap | null;
  enemyQueue: EnemyType[];
  spawnIntervalS: number;
}

export interface SystemStagesCatalogDocument {
  stage1Map: FirestoreStageRowMap;
  stages: CloudStageCatalogEntry[];
  updatedAtMs: number;
  updatedBy: string;
  version: number;
}

export function matrixToFirestoreRowMap(matrix: number[][]): FirestoreStageRowMap {
  const safeRow = (idx: number): number[] => {
    const row = Array.isArray(matrix?.[idx]) ? matrix[idx] : [];
    return Array.from({ length: MAP_DIMENSIONS.COLS }, (_, c) =>
      typeof row[c] === 'number' && Number.isInteger(row[c]) ? row[c] : 0
    );
  };
  return {
    r0: safeRow(0),
    r1: safeRow(1),
    r2: safeRow(2),
    r3: safeRow(3),
    r4: safeRow(4),
    r5: safeRow(5),
    r6: safeRow(6),
    r7: safeRow(7),
    r8: safeRow(8),
    r9: safeRow(9),
    r10: safeRow(10),
    r11: safeRow(11),
    r12: safeRow(12),
  };
}

export function firestoreRowMapToMatrix(
  rowMap: FirestoreStageRowMap | Record<string, unknown> | null | undefined
): number[][] | null {
  if (!rowMap || typeof rowMap !== 'object') return null;
  const rows: number[][] = [];
  for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
    const rowData = (rowMap as Record<string, unknown>)[`r${r}`];
    if (!Array.isArray(rowData) || rowData.length !== MAP_DIMENSIONS.COLS) {
      return null;
    }
    rows.push(rowData.map((v) => (typeof v === 'number' && Number.isInteger(v) ? v : 0)));
  }
  return rows;
}

export interface StagesCloudAdapter {
  getCatalog(): Promise<SystemStagesCatalogDocument | null>;
  saveCatalog(docData: SystemStagesCatalogDocument): Promise<void>;
  subscribeCatalog(
    onUpdate: (docData: SystemStagesCatalogDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void;
}

export class FirebaseStagesCloudAdapter implements StagesCloudAdapter {
  public async getCatalog(): Promise<SystemStagesCatalogDocument | null> {
    try {
      const db = getFirebaseDb();
      const ref = doc(db, 'system_config', 'stages_catalog');
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }
      if (!snap.exists()) return null;
      return snap.data() as SystemStagesCatalogDocument;
    } catch (err) {
      handleFirestoreError(err, 'get', 'system_config/stages_catalog');
    }
  }

  public async saveCatalog(docData: SystemStagesCatalogDocument): Promise<void> {
    try {
      const db = getFirebaseDb();
      const ref = doc(db, 'system_config', 'stages_catalog');
      await setDoc(ref, docData);
    } catch (err) {
      handleFirestoreError(err, 'write', 'system_config/stages_catalog');
    }
  }

  public subscribeCatalog(
    onUpdate: (docData: SystemStagesCatalogDocument | null) => void,
    onError?: (err: Error) => void
  ): () => void {
    const db = getFirebaseDb();
    const ref = doc(db, 'system_config', 'stages_catalog');
    const unsub: Unsubscribe = onSnapshot(
      ref,
      (snap) => {
        onUpdate(snap.exists() ? (snap.data() as SystemStagesCatalogDocument) : null);
      },
      (err) => {
        try {
          handleFirestoreError(err, 'get', 'system_config/stages_catalog');
        } catch (wrappedErr) {
          if (onError) onError(wrappedErr as Error);
        }
      }
    );
    return unsub;
  }
}

export class InMemoryStagesCloudAdapter implements StagesCloudAdapter {
  private doc: SystemStagesCatalogDocument | null = null;
  private subscribers: Set<(docData: SystemStagesCatalogDocument | null) => void> = new Set();

  public async getCatalog(): Promise<SystemStagesCatalogDocument | null> {
    return this.doc ? JSON.parse(JSON.stringify(this.doc)) : null;
  }

  public async saveCatalog(docData: SystemStagesCatalogDocument): Promise<void> {
    this.doc = JSON.parse(JSON.stringify(docData));
    const cloned = this.doc ? JSON.parse(JSON.stringify(this.doc)) : null;
    this.subscribers.forEach((cb) => {
      try {
        cb(cloned);
      } catch {
        // ignore subscriber errors
      }
    });
  }

  public subscribeCatalog(
    onUpdate: (docData: SystemStagesCatalogDocument | null) => void
  ): () => void {
    this.subscribers.add(onUpdate);
    if (this.doc) {
      onUpdate(JSON.parse(JSON.stringify(this.doc)));
    }
    return () => {
      this.subscribers.delete(onUpdate);
    };
  }
}

export class StageManager {
  private static globalInstance: StageManager | null = null;

  private stages: Map<number, StageDefinition> = new Map();
  private managedStages: Map<number, ManagedStageRecord> = new Map();
  private currentStageId: number = 1;
  private listeners: Set<() => void> = new Set();
  private cloudAdapter: StagesCloudAdapter = new FirebaseStagesCloudAdapter();
  private cloudUnsubscribe: (() => void) | null = null;
  private subscribedCloudUid: string | null = null;
  private cloudVersion: number = 0;
  private lastCloudSyncError: string | null = null;

  public static getInstance(): StageManager {
    if (!StageManager.globalInstance) {
      StageManager.globalInstance = new StageManager({ loadPersisted: true });
    }
    return StageManager.globalInstance;
  }

  constructor(options?: { loadPersisted?: boolean }) {
    this.initializeOfficialStage1();
    if (options?.loadPersisted) {
      this.seedOfficialCampaignStages2To10();
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
    } else {
      this.seedOfficialCampaignStages2To10();
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

  public seedOfficialCampaignStages2To10(): void {
    for (const spec of CAMPAIGN_STAGE_SPECS) {
      if (spec.id === 1) continue;
      const clonedMap = cloneStageMap(spec.map);
      const clonedQueue = [...spec.enemyQueue];
      const rec: ManagedStageRecord = {
        id: spec.id,
        orderIndex: spec.orderIndex,
        name: spec.name,
        status: 'ACTIVE',
        version: 1,
        activeVersion: 1,
        updatedAtMs: 1700000000000 + spec.id * 1000,
        updatedBy: 'system@bantank.online',
        isOfficialStage1: false,
        draftMap: cloneStageMap(clonedMap),
        activeMap: cloneStageMap(clonedMap),
        enemyQueue: clonedQueue,
        spawnIntervalS: spec.spawnIntervalS,
        previousActiveVersions: [],
      };
      this.managedStages.set(spec.id, rec);
      this.stages.set(spec.id, {
        id: spec.id,
        name: spec.name,
        map: cloneStageMap(clonedMap),
        enemyQueue: [...clonedQueue],
        spawnIntervalS: spec.spawnIntervalS,
        orderIndex: spec.orderIndex,
        version: 1,
        status: 'ACTIVE',
      });
    }
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
        errors: ['Tài khoản hiện tại không có quyền thêm màn chơi mới (Yêu cầu quyền Admin).'],
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
        errors: ['Tài khoản hiện tại không có quyền lưu màn chơi (Yêu cầu quyền Admin).'],
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
        errors: ['Tài khoản hiện tại không có quyền kích hoạt màn chơi (Yêu cầu quyền Admin).'],
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
        errors: ['Tài khoản hiện tại không có quyền ngừng kích hoạt màn chơi (Yêu cầu quyền Admin).'],
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

  public setCloudAdapter(adapter: StagesCloudAdapter): void {
    this.stopCloudSync();
    this.cloudAdapter = adapter;
  }

  public getCloudSyncState(): {
    cloudVersion: number;
    lastCloudSyncError: string | null;
    isSubscribed: boolean;
  } {
    return {
      cloudVersion: this.cloudVersion,
      lastCloudSyncError: this.lastCloudSyncError,
      isSubscribed: Boolean(this.cloudUnsubscribe),
    };
  }

  public syncCloudAuthUser(user: User | ValidatedUserAccount | null | undefined): void {
    const validation = validatePersonalGmailUser((user as User) ?? null);
    const canAutoSubscribe =
      typeof window !== 'undefined' || !(this.cloudAdapter instanceof FirebaseStagesCloudAdapter);

    if (validation.isValid && user?.uid && canAutoSubscribe) {
      this.startCloudSync(user.uid);
    } else {
      this.stopCloudSync();
    }
  }

  public startCloudSync(uid: string): void {
    if (!uid) return;
    if (this.cloudUnsubscribe && this.subscribedCloudUid === uid) {
      return;
    }
    this.stopCloudSync();
    this.subscribedCloudUid = uid;
    this.cloudUnsubscribe = this.cloudAdapter.subscribeCatalog(
      (docData) => {
        if (docData) {
          this.applyCloudCatalog(docData);
        }
      },
      (err) => {
        this.lastCloudSyncError = err?.message || 'Không thể đồng bộ cấu hình màn chơi.';
        this.notifyListeners();
      }
    );
    void this.refreshFromCloudOnce();
  }

  public stopCloudSync(): void {
    if (this.cloudUnsubscribe) {
      try {
        this.cloudUnsubscribe();
      } catch {
        // ignore unsubscribe errors
      }
      this.cloudUnsubscribe = null;
    }
    this.subscribedCloudUid = null;
  }

  public async refreshFromCloudOnce(): Promise<SystemStagesCatalogDocument | null> {
    try {
      const docData = await this.cloudAdapter.getCatalog();
      if (docData) {
        this.applyCloudCatalog(docData);
      }
      return docData;
    } catch (err: any) {
      this.lastCloudSyncError = err?.message || 'Không thể tải cấu hình màn chơi từ máy chủ.';
      return null;
    }
  }

  public applyCloudCatalog(docData: SystemStagesCatalogDocument): void {
    if (!docData || !Array.isArray(docData.stages)) return;

    const remoteVersion = typeof docData.version === 'number' ? docData.version : 0;
    if (remoteVersion > this.cloudVersion) {
      this.cloudVersion = remoteVersion;
    }

    const incomingIds = new Set<number>();
    for (const entry of docData.stages) {
      if (!entry || typeof entry.id !== 'number' || entry.id <= 1) continue;
      const parsedDraft = firestoreRowMapToMatrix(entry.draftMapRows);
      if (!parsedDraft) continue;
      const parsedActive = entry.activeMapRows
        ? firestoreRowMapToMatrix(entry.activeMapRows)
        : null;
      const draftValidation = validateStageMap(parsedDraft);
      const activeValidation = parsedActive ? validateStageMap(parsedActive) : { isValid: false };
      const existing = this.managedStages.get(entry.id);
      const resolvedStatus: StageLifecycleStatus =
        entry.status === 'ACTIVE' && activeValidation.isValid
          ? 'ACTIVE'
          : entry.status === 'INACTIVE'
            ? 'INACTIVE'
            : 'DRAFT';

      const validQueue =
        Array.isArray(entry.enemyQueue) && entry.enemyQueue.length === ENEMY_CONFIG.TOTAL_COUNT
          ? [...entry.enemyQueue]
          : existing?.enemyQueue
            ? [...existing.enemyQueue]
            : [...ENEMY_CONFIG.QUEUE];

      const nextRecord: ManagedStageRecord = {
        id: entry.id,
        orderIndex:
          typeof entry.orderIndex === 'number' && entry.orderIndex >= 2
            ? entry.orderIndex
            : entry.id,
        name:
          typeof entry.name === 'string' && entry.name.trim()
            ? entry.name.trim()
            : `Stage ${entry.id}`,
        status: resolvedStatus,
        version: typeof entry.version === 'number' && entry.version >= 1 ? entry.version : 1,
        activeVersion: typeof entry.activeVersion === 'number' ? entry.activeVersion : null,
        updatedAtMs: typeof entry.updatedAtMs === 'number' ? entry.updatedAtMs : Date.now(),
        updatedBy:
          typeof entry.updatedBy === 'string' && entry.updatedBy.trim()
            ? entry.updatedBy
            : ADMIN_EMAIL,
        isOfficialStage1: false,
        draftMap: draftValidation.isValid
          ? cloneStageMap(parsedDraft)
          : existing?.draftMap
            ? cloneStageMap(existing.draftMap)
            : createBlankDraftMap(),
        activeMap: activeValidation.isValid && parsedActive ? cloneStageMap(parsedActive) : null,
        enemyQueue: validQueue,
        spawnIntervalS: typeof entry.spawnIntervalS === 'number' ? entry.spawnIntervalS : 1.0,
        previousActiveVersions: existing?.previousActiveVersions
          ? existing.previousActiveVersions.map((v) => ({
              ...v,
              map: cloneStageMap(v.map),
              enemyQueue: [...v.enemyQueue],
            }))
          : [],
      };
      this.managedStages.set(entry.id, nextRecord);
      incomingIds.add(entry.id);
    }

    // Remove any stale custom stages (>10) removed by Admin on cloud
    for (const existingId of Array.from(this.managedStages.keys())) {
      if (existingId > 10 && !incomingIds.has(existingId)) {
        this.managedStages.delete(existingId);
      }
    }

    this.lastCloudSyncError = null;
    this.rebuildActiveStagesMap();
    this.saveToStorage();
    this.notifyListeners();
  }

  public buildCloudCatalogPayload(nextVersion: number): SystemStagesCatalogDocument {
    const entries: CloudStageCatalogEntry[] = Array.from(this.managedStages.values())
      .filter((rec) => rec.id > 1)
      .sort((a, b) => a.id - b.id)
      .slice(0, 50)
      .map((rec) => ({
        id: rec.id,
        orderIndex: rec.orderIndex,
        name: rec.name,
        status: rec.status,
        version: rec.version,
        activeVersion: rec.activeVersion,
        updatedAtMs: Math.max(1, Math.floor(rec.updatedAtMs || Date.now())),
        updatedBy: ADMIN_EMAIL,
        draftMapRows: matrixToFirestoreRowMap(rec.draftMap),
        activeMapRows: rec.activeMap ? matrixToFirestoreRowMap(rec.activeMap) : null,
        enemyQueue: [...rec.enemyQueue],
        spawnIntervalS: rec.spawnIntervalS,
      }));

    return {
      stage1Map: matrixToFirestoreRowMap(STAGE_1_MAP),
      stages: entries,
      updatedAtMs: Math.max(1, Math.floor(Date.now())),
      updatedBy: ADMIN_EMAIL,
      version: Math.max(1, Math.floor(nextVersion)),
    };
  }

  public async syncCatalogToCloud(params: {
    actorRole: UserRole;
    actorEmail: string;
  }): Promise<{ success: boolean; version?: number; error?: string }> {
    if (
      !hasRolePermission(params.actorRole, 'ACTIVATE_STAGE') ||
      (params.actorEmail || '').trim().toLowerCase() !== ADMIN_EMAIL
    ) {
      return {
        success: false,
        error: 'Chỉ Admin mới có quyền đồng bộ cấu hình màn chơi lên máy chủ.',
      };
    }

    try {
      let remoteVersion = 0;
      try {
        const remoteDoc = await this.cloudAdapter.getCatalog();
        if (remoteDoc && typeof remoteDoc.version === 'number') {
          remoteVersion = remoteDoc.version;
        }
      } catch {
        // Proceed with local tracked version if document doesn't exist yet or read fails transiently
      }

      const nextVersion = Math.max(this.cloudVersion + 1, remoteVersion + 1, 1);
      const payload = this.buildCloudCatalogPayload(nextVersion);
      await this.cloudAdapter.saveCatalog(payload);
      this.cloudVersion = nextVersion;
      this.lastCloudSyncError = null;
      this.notifyListeners();
      return { success: true, version: nextVersion };
    } catch (err: any) {
      const msg = err?.message || 'Lỗi đồng bộ cấu hình màn chơi lên Firestore.';
      this.lastCloudSyncError = msg;
      this.notifyListeners();
      return { success: false, error: msg };
    }
  }

  /**
   * Trả về thông tin Stage 1–10 kết hợp giữa metadata chiến dịch mặc định và bản đồ/tên sống
   * đã được Admin kích hoạt trên hệ thống (StageManager).
   */
  public getLiveCampaignStageView(stageId: number): CampaignStageSpec {
    const baseSpec = getCampaignStageSpec(stageId);
    const liveStage = this.stages.get(stageId);
    if (!liveStage) {
      return baseSpec;
    }
    const queue =
      Array.isArray(liveStage.enemyQueue) && liveStage.enemyQueue.length === ENEMY_CONFIG.TOTAL_COUNT
        ? [...liveStage.enemyQueue]
        : [...baseSpec.enemyQueue];
    return {
      ...baseSpec,
      orderIndex: liveStage.orderIndex ?? baseSpec.orderIndex,
      name: liveStage.name || baseSpec.name,
      map: cloneStageMap(liveStage.map) as StageMapMatrix,
      enemyQueue: queue,
      enemyComposition: countEnemyQueueTypes(queue),
      spawnIntervalS: liveStage.spawnIntervalS ?? baseSpec.spawnIntervalS,
    };
  }

  public getLiveCampaignStageViews(): CampaignStageSpec[] {
    return CAMPAIGN_STAGE_SPECS.map((spec) => this.getLiveCampaignStageView(spec.id));
  }

  public resetForTesting(options?: { seedCampaignStages?: boolean }): void {
    this.stopCloudSync();
    this.cloudVersion = 0;
    this.lastCloudSyncError = null;
    this.stages.clear();
    this.managedStages.clear();
    this.currentStageId = 1;
    this.initializeOfficialStage1();
    if (options?.seedCampaignStages) {
      this.seedOfficialCampaignStages2To10();
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(MANAGED_STAGES_STORAGE_KEY);
      }
    } catch {}
    this.notifyListeners();
  }
}

