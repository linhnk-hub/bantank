/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SUB_TILE_MASKS,
  TILE_TYPES,
  type ActiveSupportItem,
  type CombatEvent,
  type EagleShieldWallBackupTile,
  type EnemyTank,
  type GameCoreState,
  type PlayerActiveItemEffects,
  type RuntimeTerrainState,
  type StageItemSystemState,
  type SupportItemType,
  type TankStructure,
} from './types.ts';
import {
  ENEMY_CONFIG,
  MAP_DIMENSIONS,
  P1_CONFIG,
  TANK_CONFIG,
} from './constants.ts';

/**
 * HỆ THỐNG 4 VẬT PHẨM HỖ TRỢ (BTO-PROGRESSION-MODES-V1.4 - MỤC 6.2)
 * - 4 loại vật phẩm duy nhất:
 *   1. BOMB (BOM NỔ): Tự động kích hoạt ngay khi nhặt, tiêu diệt tối đa 2 xe tăng địch đang hiện diện trên bản đồ.
 *   2. EAGLE_SHIELD (KHIÊN BẢO VỆ ĐẠI BÀNG): Bảo vệ căn cứ Đại Bàng trong 10 giây (600 ticks @ 60Hz) bằng cách biến 2 bức tường hai bên Đại Bàng (row 12, col 5 & row 12, col 7) thành tường thép (STEEL). Sau 10 giây khôi phục lại trạng thái tường ban đầu.
 *   3. FIREPOWER (TĂNG SỨC CÔNG PHÁ): Trong 10 giây (600 ticks) cho xe tăng người chơi nhặt:
 *      - Sức công phá tường gạch gấp đôi (power = 2)
 *      - Sát thương lên tường thép đạt 50% độ bền mỗi phát bắn
 *      - Sát thương gấp đôi lên xe tăng địch
 *   4. SPEED_BOOST (TĂNG TỐC): Trong 10 giây (600 ticks) cho xe tăng người chơi nhặt, tăng tốc độ di chuyển gấp đôi (2x).
 *
 * - Lịch xuất hiện cố định trong mỗi màn chơi:
 *   - Đợt 1: Giây thứ 10 (tick 600)  -> 1 vật phẩm
 *   - Đợt 2: Giây thứ 30 (tick 1800) -> 2 vật phẩm
 *   - Đợt 3: Giây thứ 50 (tick 3000) -> 1 vật phẩm
 *   - Đợt 4: Giây thứ 70 (tick 4200) -> 2 vật phẩm
 *   => Tổng cộng 4 đợt = tối đa 6 vật phẩm / màn.
 * - Giới hạn: Mỗi loại vật phẩm chỉ xuất hiện tối đa 2 lần trong cùng một màn chơi.
 * - Thời gian tồn tại trên bản đồ: 5 giây (300 ticks @ 60Hz) có đếm ngược hiển thị, quá 5 giây chưa nhặt sẽ tự biến mất.
 */

export const ALL_SUPPORT_ITEM_TYPES: readonly SupportItemType[] = [
  'BOMB',
  'EAGLE_SHIELD',
  'FIREPOWER',
  'SPEED_BOOST',
] as const;

export interface SupportItemWaveConfig {
  readonly waveIndex: 1 | 2 | 3 | 4;
  readonly spawnAtSecond: 10 | 30 | 50 | 70;
  readonly spawnAtTick: 600 | 1800 | 3000 | 4200;
  readonly itemCount: 1 | 2;
}

export const SUPPORT_ITEM_WAVE_SCHEDULE: readonly SupportItemWaveConfig[] = [
  { waveIndex: 1, spawnAtSecond: 10, spawnAtTick: 600, itemCount: 1 },
  { waveIndex: 2, spawnAtSecond: 30, spawnAtTick: 1800, itemCount: 2 },
  { waveIndex: 3, spawnAtSecond: 50, spawnAtTick: 3000, itemCount: 1 },
  { waveIndex: 4, spawnAtSecond: 70, spawnAtTick: 4200, itemCount: 2 },
] as const;

export const SUPPORT_ITEM_MAX_WAVES_PER_STAGE = 4;
export const SUPPORT_ITEM_MAX_TOTAL_PER_STAGE = 6;
export const SUPPORT_ITEM_MAX_PER_TYPE_PER_STAGE = 2;

export const SUPPORT_ITEM_LIFETIME_SECONDS = 5;
export const SUPPORT_ITEM_LIFETIME_TICKS = 300;

export const SUPPORT_ITEM_EFFECT_DURATION_SECONDS = 10;
export const SUPPORT_ITEM_EFFECT_DURATION_TICKS = 600;

export const SUPPORT_ITEM_BOMB_MAX_ENEMY_KILLS = 2;

export const EAGLE_SHIELD_SIDE_WALL_COORDS: readonly { readonly row: number; readonly col: number }[] = [
  { row: 12, col: 5 },
  { row: 12, col: 7 },
] as const;

const P2_SPAWN_X = 144;
const P2_SPAWN_Y = 192;
const TILE_PX = MAP_DIMENSIONS.TILE_SIZE_PX;
const TANK_PX = TANK_CONFIG.SPRITE_SIZE;

function ticksToSecondsCeil(ticks: number): number {
  return ticks <= 0 ? 0 : Math.ceil(ticks / 60);
}

export function isSupportItemSystemEnabledForMode(
  mode: GameCoreState['gameMode'] | undefined
): boolean {
  return (
    mode === undefined ||
    mode === 'SOLO' ||
    mode === 'TWO_PLAYERS_AI' ||
    mode === 'TWO_PLAYERS_ONLINE'
  );
}

export function createInitialPlayerItemEffects(): PlayerActiveItemEffects {
  return {
    firepowerTicksRemaining: 0,
    firepowerSecondsRemaining: 0,
    speedBoostTicksRemaining: 0,
    speedBoostSecondsRemaining: 0,
  };
}

export function computeDeterministicItemSeed(stageId: number, stageRunSeq: number): number {
  const s1 = Math.max(1, Math.floor(stageId)) * 2654435761;
  const s2 = Math.max(1, Math.floor(stageRunSeq)) * 1597334677;
  const combined = (s1 ^ s2 ^ 0x9e3779b9) >>> 0;
  return combined === 0 ? 0x6d2b79f5 : combined;
}

export function createInitialStageItemSystemState(
  stageId: number,
  stageRunSeq: number,
  mode?: GameCoreState['gameMode']
): StageItemSystemState {
  return {
    enabled: isSupportItemSystemEnabledForMode(mode),
    seed: computeDeterministicItemSeed(stageId, stageRunSeq),
    triggeredWaves: [],
    spawnCountsByType: {
      BOMB: 0,
      EAGLE_SHIELD: 0,
      FIREPOWER: 0,
      SPEED_BOOST: 0,
    },
    totalSpawnedCount: 0,
    activeItems: [],
    consumedItemIds: [],
    eagleShieldTicksRemaining: 0,
    eagleShieldSecondsRemaining: 0,
    eagleShieldOriginalTiles: [],
    p1Effects: createInitialPlayerItemEffects(),
    p2Effects: createInitialPlayerItemEffects(),
    lastPickupEvent: null,
  };
}

export function nextDeterministicItemRng(seed: number): { nextSeed: number; value: number } {
  let t = (seed + 0x6d2b79f5) >>> 0;
  const nextSeed = t === 0 ? 0x9e3779b9 : t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { nextSeed, value };
}

export function selectNextSupportItemType(
  itemSystem: StageItemSystemState
): { selectedType: SupportItemType | null; nextSeed: number } {
  const eligibleTypes = ALL_SUPPORT_ITEM_TYPES.filter(
    (type) => (itemSystem.spawnCountsByType[type] ?? 0) < SUPPORT_ITEM_MAX_PER_TYPE_PER_STAGE
  );
  if (eligibleTypes.length === 0) {
    return { selectedType: null, nextSeed: itemSystem.seed };
  }
  const { nextSeed, value } = nextDeterministicItemRng(itemSystem.seed);
  const index = Math.min(eligibleTypes.length - 1, Math.floor(value * eligibleTypes.length));
  return {
    selectedType: eligibleTypes[index],
    nextSeed,
  };
}

function isProtectedBaseOrSpawnTile(row: number, col: number): boolean {
  if (row >= 11 && row <= 12 && col >= 5 && col <= 7) {
    return true;
  }

  const p1Col = Math.floor(P1_CONFIG.SPAWN_X / TILE_PX);
  const p1Row = Math.floor(P1_CONFIG.SPAWN_Y / TILE_PX);
  if (row === p1Row && col === p1Col) return true;

  const p2Col = Math.floor(P2_SPAWN_X / TILE_PX);
  const p2Row = Math.floor(P2_SPAWN_Y / TILE_PX);
  if (row === p2Row && col === p2Col) return true;

  for (const sp of ENEMY_CONFIG.SPAWN_POINTS) {
    const spCol = Math.floor(sp.x / TILE_PX);
    const spRow = Math.floor(sp.y / TILE_PX);
    if (row === spRow && col === spCol) return true;
  }

  return false;
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function selectValidSupportItemPosition(params: {
  seed: number;
  terrain: RuntimeTerrainState;
  p1: TankStructure;
  p2?: TankStructure | null;
  enemies: EnemyTank[];
  activeItems: ActiveSupportItem[];
}): { position: { row: number; col: number; x: number; y: number } | null; nextSeed: number } {
  const { terrain, p1, p2, enemies, activeItems } = params;
  let currentSeed = params.seed;

  const strictCandidates: { row: number; col: number; x: number; y: number }[] = [];
  const fallbackCandidates: { row: number; col: number; x: number; y: number }[] = [];

  for (let row = 0; row < MAP_DIMENSIONS.ROWS; row++) {
    for (let col = 0; col < MAP_DIMENSIONS.COLS; col++) {
      const tileType = terrain.currentMap[row]?.[col];
      if (tileType !== TILE_TYPES.EMPTY && tileType !== TILE_TYPES.GRASS) {
        continue;
      }
      if (isProtectedBaseOrSpawnTile(row, col)) {
        continue;
      }

      const x = col * TILE_PX;
      const y = row * TILE_PX;

      const overlapsItem = activeItems.some(
        (item) =>
          (item.row === row && item.col === col) ||
          rectsOverlap(x, y, TILE_PX, TILE_PX, item.x, item.y, TILE_PX, TILE_PX)
      );
      if (overlapsItem) {
        continue;
      }

      fallbackCandidates.push({ row, col, x, y });

      const overlapsP1 =
        p1.isAlive && rectsOverlap(x, y, TILE_PX, TILE_PX, p1.x, p1.y, TANK_PX, TANK_PX);
      const overlapsP2 =
        Boolean(p2 && p2.isAlive) &&
        rectsOverlap(x, y, TILE_PX, TILE_PX, p2!.x, p2!.y, TANK_PX, TANK_PX);
      const overlapsEnemy = enemies.some(
        (e) => e.isAlive && rectsOverlap(x, y, TILE_PX, TILE_PX, e.x, e.y, TANK_PX, TANK_PX)
      );

      if (!overlapsP1 && !overlapsP2 && !overlapsEnemy) {
        strictCandidates.push({ row, col, x, y });
      }
    }
  }

  const pool = strictCandidates.length > 0 ? strictCandidates : fallbackCandidates;
  if (pool.length === 0) {
    return { position: null, nextSeed: currentSeed };
  }

  const rng = nextDeterministicItemRng(currentSeed);
  currentSeed = rng.nextSeed;
  const idx = Math.min(pool.length - 1, Math.floor(rng.value * pool.length));
  return {
    position: pool[idx],
    nextSeed: currentSeed,
  };
}

export function isTileProtectedByEagleShield(
  itemSystem: StageItemSystemState | undefined,
  row: number,
  col: number
): boolean {
  if (!itemSystem || itemSystem.eagleShieldTicksRemaining <= 0) {
    return false;
  }
  return EAGLE_SHIELD_SIDE_WALL_COORDS.some((coord) => coord.row === row && coord.col === col);
}

export function activateEagleShieldOnTerrain(
  itemSystem: StageItemSystemState,
  terrain: RuntimeTerrainState
): void {
  if (!terrain.steelSubTiles) {
    terrain.steelSubTiles = {};
  }
  if (itemSystem.eagleShieldTicksRemaining <= 0 || itemSystem.eagleShieldOriginalTiles.length === 0) {
    const backups: EagleShieldWallBackupTile[] = [];
    for (const coord of EAGLE_SHIELD_SIDE_WALL_COORDS) {
      const key = `${coord.row}_${coord.col}`;
      backups.push({
        row: coord.row,
        col: coord.col,
        tileType: terrain.currentMap[coord.row]?.[coord.col] ?? TILE_TYPES.BRICK,
        brickMask: terrain.brickSubTiles[key] ?? SUB_TILE_MASKS.ALL,
        steelMask: terrain.steelSubTiles[key] ?? 0,
      });
    }
    itemSystem.eagleShieldOriginalTiles = backups;
  }

  itemSystem.eagleShieldTicksRemaining = SUPPORT_ITEM_EFFECT_DURATION_TICKS;
  itemSystem.eagleShieldSecondsRemaining = SUPPORT_ITEM_EFFECT_DURATION_SECONDS;

  for (const coord of EAGLE_SHIELD_SIDE_WALL_COORDS) {
    const key = `${coord.row}_${coord.col}`;
    if (terrain.currentMap[coord.row]) {
      terrain.currentMap[coord.row][coord.col] = TILE_TYPES.STEEL;
    }
    terrain.steelSubTiles[key] = SUB_TILE_MASKS.ALL;
    delete terrain.brickSubTiles[key];
  }
}

export function restoreEagleShieldWallsOnTerrain(
  itemSystem: StageItemSystemState,
  terrain: RuntimeTerrainState
): void {
  if (!terrain.steelSubTiles) {
    terrain.steelSubTiles = {};
  }
  for (const coord of EAGLE_SHIELD_SIDE_WALL_COORDS) {
    const key = `${coord.row}_${coord.col}`;
    if (terrain.currentMap[coord.row]) {
      terrain.currentMap[coord.row][coord.col] = TILE_TYPES.BRICK;
    }
    terrain.brickSubTiles[key] = SUB_TILE_MASKS.ALL;
    delete terrain.steelSubTiles[key];
  }
  itemSystem.eagleShieldTicksRemaining = 0;
  itemSystem.eagleShieldSecondsRemaining = 0;
  itemSystem.eagleShieldOriginalTiles = [];
}

export interface SupportItemTickExecutionCallbacks {
  onBombDestroyEnemy: (enemy: EnemyTank, pickedByPlayerId: 1 | 2) => void;
  onEmitCombatEvent: (event: CombatEvent) => void;
}

export function stepSupportItemSystemTick(params: {
  tickCount: number;
  stageId: number;
  itemSystem: StageItemSystemState;
  terrain: RuntimeTerrainState;
  p1: TankStructure;
  p2?: TankStructure | null;
  enemies: EnemyTank[];
  callbacks: SupportItemTickExecutionCallbacks;
}): void {
  const { tickCount, stageId, itemSystem, terrain, p1, p2, enemies, callbacks } = params;
  if (!itemSystem.enabled) {
    return;
  }

  // 1. Giảm thời gian hiệu lực của Khiên Đại Bàng & các buff người chơi
  if (itemSystem.eagleShieldTicksRemaining > 0) {
    itemSystem.eagleShieldTicksRemaining -= 1;
    itemSystem.eagleShieldSecondsRemaining = ticksToSecondsCeil(itemSystem.eagleShieldTicksRemaining);
    if (itemSystem.eagleShieldTicksRemaining <= 0) {
      restoreEagleShieldWallsOnTerrain(itemSystem, terrain);
    }
  }

  if (itemSystem.p1Effects.firepowerTicksRemaining > 0) {
    itemSystem.p1Effects.firepowerTicksRemaining -= 1;
    itemSystem.p1Effects.firepowerSecondsRemaining = ticksToSecondsCeil(
      itemSystem.p1Effects.firepowerTicksRemaining
    );
  }
  if (itemSystem.p1Effects.speedBoostTicksRemaining > 0) {
    itemSystem.p1Effects.speedBoostTicksRemaining -= 1;
    itemSystem.p1Effects.speedBoostSecondsRemaining = ticksToSecondsCeil(
      itemSystem.p1Effects.speedBoostTicksRemaining
    );
  }
  if (itemSystem.p2Effects.firepowerTicksRemaining > 0) {
    itemSystem.p2Effects.firepowerTicksRemaining -= 1;
    itemSystem.p2Effects.firepowerSecondsRemaining = ticksToSecondsCeil(
      itemSystem.p2Effects.firepowerTicksRemaining
    );
  }
  if (itemSystem.p2Effects.speedBoostTicksRemaining > 0) {
    itemSystem.p2Effects.speedBoostTicksRemaining -= 1;
    itemSystem.p2Effects.speedBoostSecondsRemaining = ticksToSecondsCeil(
      itemSystem.p2Effects.speedBoostTicksRemaining
    );
  }

  // 2. Cập nhật đếm ngược & xóa vật phẩm trên bản đồ đã hết hạn 5 giây (300 ticks)
  if (itemSystem.activeItems.length > 0) {
    itemSystem.activeItems = itemSystem.activeItems
      .filter(
        (item) => tickCount < item.expiresAtTick && !itemSystem.consumedItemIds.includes(item.id)
      )
      .map((item) => {
        const remainingTicks = Math.max(0, item.expiresAtTick - tickCount);
        return {
          ...item,
          remainingTicks,
          remainingSeconds: ticksToSecondsCeil(remainingTicks),
        };
      });
  }

  // 3. Kiểm tra lịch sinh vật phẩm 4 đợt (10s, 30s, 50s, 70s)
  for (const wave of SUPPORT_ITEM_WAVE_SCHEDULE) {
    if (
      tickCount >= wave.spawnAtTick &&
      !itemSystem.triggeredWaves.includes(wave.waveIndex) &&
      itemSystem.totalSpawnedCount < SUPPORT_ITEM_MAX_TOTAL_PER_STAGE
    ) {
      itemSystem.triggeredWaves.push(wave.waveIndex);

      for (let slot = 0; slot < wave.itemCount; slot++) {
        if (itemSystem.totalSpawnedCount >= SUPPORT_ITEM_MAX_TOTAL_PER_STAGE) {
          break;
        }

        const typeSelection = selectNextSupportItemType(itemSystem);
        itemSystem.seed = typeSelection.nextSeed;
        if (!typeSelection.selectedType) {
          break;
        }

        const posSelection = selectValidSupportItemPosition({
          seed: itemSystem.seed,
          terrain,
          p1,
          p2,
          enemies,
          activeItems: itemSystem.activeItems,
        });
        itemSystem.seed = posSelection.nextSeed;
        if (!posSelection.position) {
          break;
        }

        const itemSeq = itemSystem.totalSpawnedCount + 1;
        const newItem: ActiveSupportItem = {
          id: `item_s${stageId}_w${wave.waveIndex}_${itemSeq}_${typeSelection.selectedType.toLowerCase()}`,
          type: typeSelection.selectedType,
          waveIndex: wave.waveIndex,
          x: posSelection.position.x,
          y: posSelection.position.y,
          row: posSelection.position.row,
          col: posSelection.position.col,
          spawnedAtTick: tickCount,
          expiresAtTick: tickCount + SUPPORT_ITEM_LIFETIME_TICKS,
          remainingTicks: SUPPORT_ITEM_LIFETIME_TICKS,
          remainingSeconds: SUPPORT_ITEM_LIFETIME_SECONDS,
        };

        itemSystem.activeItems.push(newItem);
        itemSystem.totalSpawnedCount += 1;
        itemSystem.spawnCountsByType[typeSelection.selectedType] =
          (itemSystem.spawnCountsByType[typeSelection.selectedType] ?? 0) + 1;
      }
    }
  }

  // 4. Kiểm tra va chạm nhặt vật phẩm giữa P1 / P2 và activeItems
  if (itemSystem.activeItems.length === 0) {
    return;
  }

  const remainingItems: ActiveSupportItem[] = [];

  for (const item of itemSystem.activeItems) {
    if (itemSystem.consumedItemIds.includes(item.id)) {
      continue;
    }

    let pickedByPlayerId: 1 | 2 | null = null;

    if (p1.isAlive && rectsOverlap(p1.x, p1.y, TANK_PX, TANK_PX, item.x, item.y, TILE_PX, TILE_PX)) {
      pickedByPlayerId = 1;
    } else if (
      p2 &&
      p2.isAlive &&
      rectsOverlap(p2.x, p2.y, TANK_PX, TANK_PX, item.x, item.y, TILE_PX, TILE_PX)
    ) {
      pickedByPlayerId = 2;
    }

    if (pickedByPlayerId === null) {
      remainingItems.push(item);
      continue;
    }

    itemSystem.consumedItemIds.push(item.id);

    const destroyedEnemyIds: string[] = [];

    if (item.type === 'BOMB') {
      const aliveEnemies = enemies
        .filter((e) => e.isAlive && e.hp > 0)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, SUPPORT_ITEM_BOMB_MAX_ENEMY_KILLS);

      for (const targetEnemy of aliveEnemies) {
        destroyedEnemyIds.push(targetEnemy.id);
        callbacks.onBombDestroyEnemy(targetEnemy, pickedByPlayerId);
      }
    } else if (item.type === 'EAGLE_SHIELD') {
      activateEagleShieldOnTerrain(itemSystem, terrain);
    } else if (item.type === 'FIREPOWER') {
      const targetEffects = pickedByPlayerId === 1 ? itemSystem.p1Effects : itemSystem.p2Effects;
      targetEffects.firepowerTicksRemaining = SUPPORT_ITEM_EFFECT_DURATION_TICKS;
      targetEffects.firepowerSecondsRemaining = SUPPORT_ITEM_EFFECT_DURATION_SECONDS;
    } else if (item.type === 'SPEED_BOOST') {
      const targetEffects = pickedByPlayerId === 1 ? itemSystem.p1Effects : itemSystem.p2Effects;
      targetEffects.speedBoostTicksRemaining = SUPPORT_ITEM_EFFECT_DURATION_TICKS;
      targetEffects.speedBoostSecondsRemaining = SUPPORT_ITEM_EFFECT_DURATION_SECONDS;
    }

    itemSystem.lastPickupEvent = {
      itemId: item.id,
      type: item.type,
      pickedBy: pickedByPlayerId === 1 ? 'P1' : 'P2',
      tickCount,
      destroyedEnemyIds,
    };

    callbacks.onEmitCombatEvent({
      id: `vfx_item_pickup_${item.id}_${tickCount}`,
      type: 'HIT_SPARK',
      x: Math.max(0, Math.min(MAP_DIMENSIONS.TOTAL_WIDTH_PX, item.x + TILE_PX / 2)),
      y: Math.max(0, Math.min(MAP_DIMENSIONS.TOTAL_HEIGHT_PX, item.y + TILE_PX / 2)),
      createdAtTick: tickCount,
    });
  }

  itemSystem.activeItems = remainingItems;
}

export function getSupportItemLabelVi(type: SupportItemType): string {
  switch (type) {
    case 'BOMB':
      return 'Bom Nổ';
    case 'EAGLE_SHIELD':
      return 'Khiên Đại Bàng';
    case 'FIREPOWER':
      return 'Tăng Công Phá';
    case 'SPEED_BOOST':
      return 'Tăng Tốc';
  }
}

export function getSupportItemLabelEn(type: SupportItemType): string {
  switch (type) {
    case 'BOMB':
      return 'Bomb';
    case 'EAGLE_SHIELD':
      return 'Eagle Shield';
    case 'FIREPOWER':
      return 'Firepower x2';
    case 'SPEED_BOOST':
      return 'Speed Boost x2';
  }
}

export function cloneStageItemSystemState(state: StageItemSystemState): StageItemSystemState {
  return {
    enabled: state.enabled,
    seed: state.seed,
    triggeredWaves: [...state.triggeredWaves],
    spawnCountsByType: { ...state.spawnCountsByType },
    totalSpawnedCount: state.totalSpawnedCount,
    activeItems: state.activeItems.map((item) => ({ ...item })),
    consumedItemIds: [...state.consumedItemIds],
    eagleShieldTicksRemaining: state.eagleShieldTicksRemaining,
    eagleShieldSecondsRemaining: state.eagleShieldSecondsRemaining,
    eagleShieldOriginalTiles: state.eagleShieldOriginalTiles.map((b) => ({ ...b })),
    p1Effects: { ...state.p1Effects },
    p2Effects: { ...state.p2Effects },
    lastPickupEvent: state.lastPickupEvent
      ? {
          ...state.lastPickupEvent,
          destroyedEnemyIds: state.lastPickupEvent.destroyedEnemyIds
            ? [...state.lastPickupEvent.destroyedEnemyIds]
            : undefined,
        }
      : null,
  };
}
