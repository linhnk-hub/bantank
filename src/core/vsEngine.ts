/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS, TANK_CONFIG } from './constants.ts';
import {
  type BulletStructure,
  type CombatEvent,
  type CombatEventType,
  type Direction,
  type InputState,
  type RuntimeTerrainState,
  type TankStructure,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { updateTankMovement } from './tank.ts';
import { spawnBullet, updateBullet } from './bullet.ts';
import {
  checkBulletVsBullet,
  getBulletHitbox,
  getTankHitbox,
  intersectAABB,
} from './physics.ts';
import {
  VS_ARENA_MAP,
  computeHazardDamagePerTick,
  computeVsSafeZoneBounds,
  findValidVsRespawnPosition,
  getInitialVsSpawnSlot,
  isTankInsideSafeZone,
} from './vsMap.ts';
import { VsTankAIController } from './vsAI.ts';
import {
  VS_RULES_CONFIG,
  type VsCombatantState,
  type VsMatchOutcome,
  type VsMatchState,
  type VsMode,
  type VsSafeZoneState,
  type VsTankRole,
  type VsTeamId,
  type VsTeamSummary,
} from './vsTypes.ts';

export interface VsBullet extends BulletStructure {
  team: VsTeamId;
  ownerRole: VsTankRole;
}

export interface VsEngineOptions {
  /**
   * Injectable RNG returning a number in [0, 1) for deterministic testing and statistical audits.
   * Production default uses Web Crypto CSPRNG (fallback Math.random).
   */
  randomFn?: () => number;
}

const NEUTRAL_VS_INPUT: Readonly<InputState> = Object.freeze({
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
});

function defaultUnbiasedRandom(): number {
  const cryptoObj =
    typeof globalThis !== 'undefined'
      ? (globalThis as { crypto?: { getRandomValues?: (arr: Uint32Array) => Uint32Array } }).crypto
      : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    cryptoObj.getRandomValues(buf);
    return buf[0] / 0x100000000;
  }
  return Math.random();
}

function ticksToSecondsCeil(ticks: number): number {
  return ticks <= 0 ? 0 : Math.ceil(ticks / VS_RULES_CONFIG.TICKS_PER_SECOND);
}

function createInitialSafeZoneState(): VsSafeZoneState {
  const shrinkLevel = 0;
  const ticksUntilNextShrink = VS_RULES_CONFIG.SHRINK_INTERVAL_TICKS;
  return {
    shrinkLevel,
    shrinkIntervalTicks: VS_RULES_CONFIG.SHRINK_INTERVAL_TICKS,
    ticksUntilNextShrink,
    secondsUntilNextShrink: ticksToSecondsCeil(ticksUntilNextShrink),
    bounds: computeVsSafeZoneBounds(shrinkLevel),
    nextBounds: computeVsSafeZoneBounds(shrinkLevel + 1),
    hazardDamagePerTick: computeHazardDamagePerTick(shrinkLevel),
    isShrinkImminent: false,
  };
}

function createCombatant(
  mode: VsMode,
  role: VsTankRole,
  team: VsTeamId,
  isAI: boolean
): VsCombatantState {
  const slot = getInitialVsSpawnSlot(mode, role);
  const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;
  const idMap: Record<VsTankRole, string> = {
    P1: 'vs_p1',
    AI_1: 'vs_ai1',
    P2: 'vs_p2',
    AI_2: 'vs_ai2',
  };
  const labelMap: Record<VsTankRole, string> = {
    P1: 'P1',
    AI_1: 'A.I 1',
    P2: 'P2',
    AI_2: 'A.I 2',
  };

  const tank: TankStructure = {
    id: idMap[role],
    x: slot.col * tilePx,
    y: slot.row * tilePx,
    direction: slot.direction,
    speed: TANK_CONFIG.SPEED_PX_S,
    type: role === 'P1' ? 'player' : role === 'P2' ? 'player2' : isAI ? 'vs_ai' : 'player',
    tier: 1,
    isAlive: true,
    isShielded: false,
  };

  return {
    id: idMap[role],
    role,
    label: labelMap[role],
    team,
    isAI,
    tank,
    lives: VS_RULES_CONFIG.STARTING_LIVES,
    isDead: false,
    eliminatedPermanently: false,
    respawnTicksRemaining: 0,
    respawnSecondsRemaining: 0,
    protectionTicksRemaining: 0,
    protectionSecondsRemaining: 0,
    pendingRespawnBeforeSuddenDeath: false,
    inDangerZone: false,
    hazardDamageAccumulated: 0,
    kills: 0,
    deaths: 0,
    spawnCol: slot.col,
    spawnRow: slot.row,
    spawnDirection: slot.direction,
  };
}

/**
 * Core Engine độc lập cho hai chế độ Đấu Đối Kháng VS (BTO-VS-GAMEPLAY-V1.2):
 * - VS_P1_P2: TEAM_1 (P1) vs TEAM_2 (P2)
 * - VS_P1_AI_P2_AI: TEAM_1 (P1 + A.I 1) vs TEAM_2 (P2 + A.I 2)
 *
 * Hoàn toàn tách biệt với Campaign (không 30 enemy, không Eagle Base, không Support Items,
 * không thưởng XP/Sao/Xu, không tác động tiến trình Campaign).
 */
export class VsEngine {
  private mode: VsMode;
  private terrain: RuntimeTerrainState;
  private state: VsMatchState;
  private bullets: VsBullet[] = [];
  private aiControllers: Map<string, VsTankAIController> = new Map();
  private combatEvents: CombatEvent[] = [];
  private randomFn: () => number;
  private eventSeq: number = 0;

  constructor(mode: VsMode = 'VS_P1_P2', options?: VsEngineOptions) {
    this.mode = mode;
    this.randomFn = options?.randomFn ?? defaultUnbiasedRandom;
    this.terrain = createRuntimeTerrainState(VS_ARENA_MAP);
    this.state = this.buildFreshMatchState(mode);
    this.initAiControllers();
  }

  private initAiControllers(): void {
    this.aiControllers.clear();
    for (const c of this.state.combatants) {
      if (c.isAI) {
        this.aiControllers.set(c.id, new VsTankAIController());
      }
    }
  }

  private buildFreshMatchState(mode: VsMode): VsMatchState {
    const combatants: VsCombatantState[] =
      mode === 'VS_P1_P2'
        ? [
            createCombatant(mode, 'P1', 'TEAM_1', false),
            createCombatant(mode, 'P2', 'TEAM_2', false),
          ]
        : [
            createCombatant(mode, 'P1', 'TEAM_1', false),
            createCombatant(mode, 'AI_1', 'TEAM_1', true),
            createCombatant(mode, 'P2', 'TEAM_2', false),
            createCombatant(mode, 'AI_2', 'TEAM_2', true),
          ];

    const state: VsMatchState = {
      mode,
      phase: 'NORMAL',
      tickCount: 0,
      normalDurationSeconds: VS_RULES_CONFIG.NORMAL_DURATION_SECONDS,
      normalDurationTicks: VS_RULES_CONFIG.NORMAL_DURATION_TICKS,
      normalRemainingTicks: VS_RULES_CONFIG.NORMAL_DURATION_TICKS,
      normalRemainingSeconds: VS_RULES_CONFIG.NORMAL_DURATION_SECONDS,
      suddenDeathElapsedTicks: 0,
      suddenDeathElapsedSeconds: 0,
      transitionWaitTicks: 0,
      combatants,
      team1: this.computeTeamSummary('TEAM_1', combatants),
      team2: this.computeTeamSummary('TEAM_2', combatants),
      safeZone: createInitialSafeZoneState(),
      outcome: null,
      random5050CallCount: 0,
      anyTankInDangerZone: false,
      xpGranted: 0,
      starsGranted: 0,
      coinsGranted: 0,
    };
    return state;
  }

  public reset(mode: VsMode = this.mode, options?: VsEngineOptions): void {
    this.mode = mode;
    if (options?.randomFn) {
      this.randomFn = options.randomFn;
    }
    this.terrain = createRuntimeTerrainState(VS_ARENA_MAP);
    this.bullets = [];
    this.combatEvents = [];
    this.eventSeq = 0;
    this.state = this.buildFreshMatchState(mode);
    this.initAiControllers();
  }

  public getMode(): VsMode {
    return this.mode;
  }

  public getState(): Readonly<VsMatchState> {
    return this.state;
  }

  public getTerrain(): RuntimeTerrainState {
    return this.terrain;
  }

  public getBullets(): VsBullet[] {
    return this.bullets;
  }

  public getCombatantByRole(role: VsTankRole): VsCombatantState | undefined {
    return this.state.combatants.find((c) => c.role === role);
  }

  public getCombatantById(id: string): VsCombatantState | undefined {
    return this.state.combatants.find((c) => c.id === id);
  }

  public popCombatEvents(): CombatEvent[] {
    if (this.combatEvents.length === 0) return [];
    const copy = [...this.combatEvents];
    this.combatEvents = [];
    return copy;
  }

  public clearCombatEvents(): void {
    this.combatEvents = [];
  }

  private emitCombatEvent(type: CombatEventType, x: number, y: number): void {
    this.eventSeq += 1;
    this.combatEvents.push({
      id: `vs_ev_${this.state.tickCount}_${this.eventSeq}`,
      type,
      x,
      y,
      createdAtTick: this.state.tickCount,
    });
  }

  private computeTeamSummary(team: VsTeamId, combatants: VsCombatantState[]): VsTeamSummary {
    const members = combatants.filter((c) => c.team === team);
    let totalKills = 0;
    let totalDeaths = 0;
    let totalLivesRemaining = 0;
    let aliveCount = 0;
    let pendingRespawnCount = 0;

    for (const m of members) {
      totalKills += m.kills;
      totalDeaths += m.deaths;
      totalLivesRemaining += m.lives;
      if (!m.isDead && m.tank.isAlive) {
        aliveCount++;
      } else if (m.isDead && !m.eliminatedPermanently && m.lives > 0 && m.respawnTicksRemaining > 0) {
        pendingRespawnCount++;
      }
    }

    const isEliminated = aliveCount === 0 && pendingRespawnCount === 0;
    return {
      team,
      totalKills,
      totalDeaths,
      totalLivesRemaining,
      aliveCount,
      pendingRespawnCount,
      isEliminated,
    };
  }

  private syncTeamSummaries(): void {
    this.state.team1 = this.computeTeamSummary('TEAM_1', this.state.combatants);
    this.state.team2 = this.computeTeamSummary('TEAM_2', this.state.combatants);
    this.state.anyTankInDangerZone = this.state.combatants.some(
      (c) => !c.isDead && c.tank.isAlive && c.inDangerZone
    );
  }

  /**
   * Thực thi đúng 1 tick mô phỏng xác định (1/60 giây).
   * - Nếu trận đấu đã FINISHED: dừng hoàn toàn, không thay đổi trạng thái hay kết quả.
   */
  public stepTick(
    p1Input: InputState = NEUTRAL_VS_INPUT,
    p2Input: InputState = NEUTRAL_VS_INPUT
  ): void {
    if (this.state.phase === 'FINISHED' || this.state.outcome !== null) {
      return;
    }

    this.state.tickCount += 1;

    // 1. Cập nhật bộ đếm bảo vệ sau hồi sinh & xử lý hồi sinh cho từng xe tăng
    this.stepProtectionAndRespawns();

    // 2. Xử lý điều khiển & di chuyển & bắn đạn cho từng xe tăng còn sống
    this.stepCombatantsMovementAndShooting(p1Input, p2Input);

    // 3. Cập nhật đạn, va chạm đạn-địa hình, đạn-đạn (khác phe), đạn-xe tăng (chỉ khác phe)
    //    Thu thập tất cả sự kiện tiêu diệt trong cùng 1 tick vào Map để chống trừ mạng trùng lặp
    const lethalEventsThisTick = new Map<
      string,
      { killerId: string | null; cause: 'BULLET' | 'HAZARD' }
    >();
    this.stepBulletsAndCollisions(lethalEventsThisTick);

    // 4. Cập nhật đồng hồ hiệp chính, chuyển hiệp SUDDEN DEATH và thu hẹp vùng an toàn mỗi 20 giây
    this.stepClockAndSuddenDeath(lethalEventsThisTick);

    // 5. Áp dụng tiêu diệt hợp lệ (mỗi xe tăng tối đa 1 lần tiêu diệt / 1 lần trừ mạng trong mỗi tick)
    this.applyLethalEvents(lethalEventsThisTick);

    // 6. Đồng bộ thống kê phe & đánh giá điều kiện thắng thua (bao gồm phân định 50/50 nếu bị loại đồng thời)
    this.syncTeamSummaries();
    this.evaluateMatchResolution();
  }

  private stepProtectionAndRespawns(): void {
    for (const c of this.state.combatants) {
      if (!c.isDead && c.tank.isAlive) {
        if (c.protectionTicksRemaining > 0) {
          c.protectionTicksRemaining = Math.max(0, c.protectionTicksRemaining - 1);
          c.protectionSecondsRemaining = ticksToSecondsCeil(c.protectionTicksRemaining);
          c.tank.isShielded = c.protectionTicksRemaining > 0;
        } else {
          c.protectionSecondsRemaining = 0;
          c.tank.isShielded = false;
        }
        continue;
      }

      // Đã bị loại vĩnh viễn hoặc hết mạng -> tuyệt đối không hồi sinh
      if (c.eliminatedPermanently || c.lives <= 0) {
        c.respawnTicksRemaining = 0;
        c.respawnSecondsRemaining = 0;
        c.pendingRespawnBeforeSuddenDeath = false;
        c.tank.isAlive = false;
        c.tank.isShielded = false;
        continue;
      }

      // Trong SUDDEN_DEATH thực sự: tuyệt đối không phát sinh hoặc hoàn tất lượt hồi sinh mới
      if (this.state.phase === 'SUDDEN_DEATH') {
        c.eliminatedPermanently = true;
        c.lives = 0;
        c.respawnTicksRemaining = 0;
        c.respawnSecondsRemaining = 0;
        c.pendingRespawnBeforeSuddenDeath = false;
        continue;
      }

      // Trong SUDDEN_DEATH_TRANSITION: chỉ cho phép hoàn tất lượt hồi sinh đã phát sinh trước 0s
      if (
        this.state.phase === 'SUDDEN_DEATH_TRANSITION' &&
        !c.pendingRespawnBeforeSuddenDeath
      ) {
        c.eliminatedPermanently = true;
        c.lives = 0;
        c.respawnTicksRemaining = 0;
        c.respawnSecondsRemaining = 0;
        continue;
      }

      if (c.respawnTicksRemaining > 0) {
        c.respawnTicksRemaining -= 1;
        c.respawnSecondsRemaining = ticksToSecondsCeil(c.respawnTicksRemaining);
      }

      if (c.respawnTicksRemaining <= 0 && c.lives > 0) {
        const otherAliveTanks = this.state.combatants
          .filter((other) => other.id !== c.id && !other.isDead && other.tank.isAlive)
          .map((other) => other.tank);

        const spawnPos = findValidVsRespawnPosition(
          c.team,
          c.spawnRow,
          c.spawnCol,
          this.terrain,
          otherAliveTanks,
          c.id
        );

        if (spawnPos) {
          c.tank.x = spawnPos.x;
          c.tank.y = spawnPos.y;
          c.tank.direction = c.spawnDirection;
          c.tank.isAlive = true;
          c.tank.isShielded = true;
          c.isDead = false;
          c.respawnTicksRemaining = 0;
          c.respawnSecondsRemaining = 0;
          c.pendingRespawnBeforeSuddenDeath = false;
          c.protectionTicksRemaining = VS_RULES_CONFIG.SPAWN_PROTECTION_TICKS;
          c.protectionSecondsRemaining = VS_RULES_CONFIG.SPAWN_PROTECTION_SECONDS;
          c.hazardDamageAccumulated = 0;
          c.inDangerZone = !isTankInsideSafeZone(c.tank, this.state.safeZone.bounds);
        }
      }
    }
  }

  private stepCombatantsMovementAndShooting(p1Input: InputState, p2Input: InputState): void {
    const aliveTanksAll = this.state.combatants
      .filter((c) => !c.isDead && c.tank.isAlive)
      .map((c) => c.tank);

    for (const c of this.state.combatants) {
      if (c.isDead || !c.tank.isAlive) continue;

      let effectiveInput: InputState = NEUTRAL_VS_INPUT;
      if (c.role === 'P1') {
        effectiveInput = p1Input;
      } else if (c.role === 'P2') {
        effectiveInput = p2Input;
      } else if (c.isAI) {
        const ai = this.aiControllers.get(c.id);
        if (ai) {
          effectiveInput = ai.computeInput(
            c,
            this.state.combatants,
            this.bullets,
            this.terrain,
            this.state.safeZone,
            this.state.phase,
            this.state.tickCount
          );
        }
      }

      // Di chuyển xe tăng — va chạm với xe tăng khác (cả đồng đội lẫn đối thủ) không gây sát thương
      const otherTanks = aliveTanksAll.filter((t) => t.id !== c.tank.id);
      updateTankMovement(c.tank, effectiveInput, this.terrain, otherTanks, 1);

      // Luật bảo vệ sau hồi sinh (Mục 4.9):
      // Trong 2 giây bảo vệ: KHÔNG nhận sát thương, KHÔNG gây sát thương, KHÔNG thể bắn gây sát thương đối thủ.
      if (c.protectionTicksRemaining > 0) {
        continue;
      }

      if (effectiveInput.shoot) {
        const existingBullet = this.bullets.find((b) => b.ownerId === c.tank.id) ?? null;
        const spawned = spawnBullet(c.tank, existingBullet, { hasFirepower: false });
        if (spawned) {
          const vsBullet: VsBullet = {
            ...spawned,
            ownerType: c.team === 'TEAM_1' ? 'player' : 'enemy',
            team: c.team,
            ownerRole: c.role,
          };
          this.bullets.push(vsBullet);
          this.emitCombatEvent('HIT_SPARK', vsBullet.x + 2, vsBullet.y + 2);
        }
      }
    }
  }

  private stepBulletsAndCollisions(
    lethalEvents: Map<string, { killerId: string | null; cause: 'BULLET' | 'HAZARD' }>
  ): void {
    const aliveBulletFlags = new Array<boolean>(this.bullets.length).fill(true);

    // 1. Di chuyển đạn và kiểm tra va chạm địa hình (isVsMode = true -> đối xứng tuyệt đối, không khóa gạch base)
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      const res = updateBullet(b, this.terrain, { isVsMode: true });
      if (!res.isAlive) {
        aliveBulletFlags[i] = false;
        if (res.hitBrick || res.hitSteel || res.hitObstacle) {
          this.emitCombatEvent('HIT_SPARK', b.x + 2, b.y + 2);
        }
      }
    }

    // 2. Va chạm đạn vs đạn (chỉ triệt tiêu đạn thuộc 2 phe đối lập; đạn đồng đội không cản nhau)
    for (let i = 0; i < this.bullets.length; i++) {
      if (!aliveBulletFlags[i]) continue;
      for (let j = i + 1; j < this.bullets.length; j++) {
        if (!aliveBulletFlags[j]) continue;
        if (this.bullets[i].team === this.bullets[j].team) continue;
        if (checkBulletVsBullet(this.bullets[i], this.bullets[j])) {
          aliveBulletFlags[i] = false;
          aliveBulletFlags[j] = false;
          this.emitCombatEvent('HIT_SPARK', this.bullets[i].x + 2, this.bullets[i].y + 2);
          break;
        }
      }
    }

    // 3. Va chạm đạn vs xe tăng
    for (let i = 0; i < this.bullets.length; i++) {
      if (!aliveBulletFlags[i]) continue;
      const b = this.bullets[i];
      const bulletBox = getBulletHitbox(b.x, b.y);
      const shooter = this.state.combatants.find((c) => c.id === b.ownerId);

      // Luật bảo vệ sau hồi sinh: xe tăng đang được bảo vệ không thể gây sát thương
      const shooterProtected = Boolean(shooter && shooter.protectionTicksRemaining > 0);

      for (const target of this.state.combatants) {
        if (target.isDead || !target.tank.isAlive) continue;
        if (target.id === b.ownerId) continue;

        // Friendly Fire OFF: đạn cùng phe không gây sát thương và đi xuyên qua đồng đội
        if (target.team === b.team) continue;

        const targetBox = getTankHitbox(target.tank.x, target.tank.y);
        if (!intersectAABB(bulletBox, targetBox)) continue;

        // Trúng đối thủ -> tiêu hủy viên đạn
        aliveBulletFlags[i] = false;

        // Đối thủ đang có bảo vệ sau hồi sinh (2s) hoặc người bắn đang được bảo vệ -> 0 sát thương
        if (target.protectionTicksRemaining > 0 || shooterProtected) {
          this.emitCombatEvent('HIT_SPARK', b.x + 2, b.y + 2);
          break;
        }

        // Ghi nhận tiêu diệt hợp lệ (idempotent: nếu nhiều viên đạn trúng cùng 1 tick, chỉ tính 1 lần)
        if (!lethalEvents.has(target.id)) {
          lethalEvents.set(target.id, {
            killerId: shooter ? shooter.id : null,
            cause: 'BULLET',
          });
        }
        break;
      }
    }

    // Giữ lại các viên đạn còn sống
    const nextBullets: VsBullet[] = [];
    for (let i = 0; i < this.bullets.length; i++) {
      if (aliveBulletFlags[i]) {
        nextBullets.push(this.bullets[i]);
      }
    }
    this.bullets = nextBullets;
  }

  private stepClockAndSuddenDeath(
    lethalEvents: Map<string, { killerId: string | null; cause: 'BULLET' | 'HAZARD' }>
  ): void {
    if (this.state.phase === 'NORMAL') {
      if (this.state.normalRemainingTicks > 0) {
        this.state.normalRemainingTicks -= 1;
        this.state.normalRemainingSeconds = ticksToSecondsCeil(this.state.normalRemainingTicks);
      }

      // Khi đồng hồ hiệp chính vừa chạm 0s:
      if (this.state.normalRemainingTicks === 0) {
        // Kiểm tra xem trận đấu có đang kết thúc ngay bởi đạn trong tick này hay không;
        // Nếu cả hai phe đều còn khả năng tham chiến (tính cả các xe chưa bị loại):
        const willTeam1Survive = this.wouldTeamHaveCombatantAfterKills('TEAM_1', lethalEvents, true);
        const willTeam2Survive = this.wouldTeamHaveCombatantAfterKills('TEAM_2', lethalEvents, true);

        if (willTeam1Survive && willTeam2Survive) {
          let hasPendingRespawn = false;
          for (const c of this.state.combatants) {
            if (c.isDead && !c.eliminatedPermanently && c.lives > 0 && c.respawnTicksRemaining > 0) {
              c.pendingRespawnBeforeSuddenDeath = true;
              hasPendingRespawn = true;
            }
          }

          if (hasPendingRespawn) {
            // Đợi hoàn tất các lượt hồi sinh đã phát sinh trước 0s rồi mới bắt đầu bộ đếm 20s thu hẹp
            this.state.phase = 'SUDDEN_DEATH_TRANSITION';
            this.state.safeZone = createInitialSafeZoneState();
          } else {
            this.enterActiveSuddenDeath();
          }
        }
      }
      return;
    }

    if (this.state.phase === 'SUDDEN_DEATH_TRANSITION') {
      // Thời gian xử lý chuyển hiệp KHÔNG được tính vào chu kỳ thu hẹp 20s
      this.state.transitionWaitTicks += 1;
      const anyPending = this.state.combatants.some(
        (c) =>
          c.isDead &&
          !c.eliminatedPermanently &&
          c.pendingRespawnBeforeSuddenDeath &&
          c.lives > 0 &&
          c.respawnTicksRemaining > 0
      );
      if (!anyPending) {
        const willTeam1Survive = this.wouldTeamHaveCombatantAfterKills('TEAM_1', lethalEvents, false);
        const willTeam2Survive = this.wouldTeamHaveCombatantAfterKills('TEAM_2', lethalEvents, false);
        if (willTeam1Survive && willTeam2Survive) {
          this.enterActiveSuddenDeath();
        }
      }
      return;
    }

    if (this.state.phase === 'SUDDEN_DEATH') {
      this.state.suddenDeathElapsedTicks += 1;
      this.state.suddenDeathElapsedSeconds = Math.floor(
        this.state.suddenDeathElapsedTicks / VS_RULES_CONFIG.TICKS_PER_SECOND
      );

      // Chu kỳ thu hẹp mỗi 20 giây (1200 ticks): 20s, 40s, 60s, 80s... không giới hạn
      if (this.state.safeZone.ticksUntilNextShrink > 0) {
        this.state.safeZone.ticksUntilNextShrink -= 1;
      }
      if (this.state.safeZone.ticksUntilNextShrink <= 0) {
        this.state.safeZone.shrinkLevel += 1;
        this.state.safeZone.ticksUntilNextShrink = VS_RULES_CONFIG.SHRINK_INTERVAL_TICKS;
        this.state.safeZone.bounds = computeVsSafeZoneBounds(this.state.safeZone.shrinkLevel);
        this.state.safeZone.nextBounds = computeVsSafeZoneBounds(
          this.state.safeZone.shrinkLevel + 1
        );
        this.state.safeZone.hazardDamagePerTick = computeHazardDamagePerTick(
          this.state.safeZone.shrinkLevel
        );
      }

      this.state.safeZone.secondsUntilNextShrink = ticksToSecondsCeil(
        this.state.safeZone.ticksUntilNextShrink
      );
      this.state.safeZone.isShrinkImminent =
        this.state.safeZone.secondsUntilNextShrink <=
        VS_RULES_CONFIG.SHRINK_IMMINENT_WARNING_SECONDS;

      // Áp dụng sát thương vùng nguy hiểm đồng nhất cho cả người chơi và A.I
      const dmgPerTick = this.state.safeZone.hazardDamagePerTick;
      for (const c of this.state.combatants) {
        if (c.isDead || !c.tank.isAlive) {
          c.inDangerZone = false;
          c.hazardDamageAccumulated = 0;
          continue;
        }
        const inside = isTankInsideSafeZone(c.tank, this.state.safeZone.bounds);
        c.inDangerZone = !inside;
        if (!inside && dmgPerTick > 0) {
          // Vùng nguy hiểm KHÔNG bị vô hiệu hóa vô thời hạn bởi bảo vệ sau hồi sinh
          c.hazardDamageAccumulated += dmgPerTick;
          if (c.hazardDamageAccumulated >= VS_RULES_CONFIG.HAZARD_LETHAL_THRESHOLD) {
            if (!lethalEvents.has(c.id)) {
              lethalEvents.set(c.id, { killerId: null, cause: 'HAZARD' });
            }
          }
        } else if (inside && c.hazardDamageAccumulated > 0) {
          c.hazardDamageAccumulated = Math.max(
            0,
            c.hazardDamageAccumulated - VS_RULES_CONFIG.HAZARD_DECAY_PER_TICK_SAFE
          );
        }
      }
    }
  }

  private enterActiveSuddenDeath(): void {
    this.state.phase = 'SUDDEN_DEATH';
    this.state.suddenDeathElapsedTicks = 0;
    this.state.suddenDeathElapsedSeconds = 0;
    this.state.safeZone = createInitialSafeZoneState();
    // Bảo đảm không có lượt hồi sinh mới chờ phát sinh khi Sudden Death thực sự bắt đầu
    for (const c of this.state.combatants) {
      c.pendingRespawnBeforeSuddenDeath = false;
      if (c.isDead && c.lives > 0) {
        c.eliminatedPermanently = true;
        c.lives = 0;
        c.respawnTicksRemaining = 0;
        c.respawnSecondsRemaining = 0;
      }
    }
  }

  private wouldTeamHaveCombatantAfterKills(
    team: VsTeamId,
    lethalEvents: Map<string, { killerId: string | null; cause: 'BULLET' | 'HAZARD' }>,
    allowRespawnFromKill: boolean
  ): boolean {
    const members = this.state.combatants.filter((c) => c.team === team);
    for (const m of members) {
      if (!m.isDead && m.tank.isAlive) {
        if (!lethalEvents.has(m.id)) {
          return true;
        }
        if (allowRespawnFromKill && m.lives - 1 > 0) {
          return true;
        }
      } else if (m.isDead && !m.eliminatedPermanently && m.lives > 0 && m.respawnTicksRemaining > 0) {
        return true;
      }
    }
    return false;
  }

  private applyLethalEvents(
    lethalEvents: Map<string, { killerId: string | null; cause: 'BULLET' | 'HAZARD' }>
  ): void {
    if (lethalEvents.size === 0) return;

    const isNoNewRespawnPhase =
      this.state.phase === 'SUDDEN_DEATH' || this.state.phase === 'SUDDEN_DEATH_TRANSITION';

    for (const [victimId, info] of lethalEvents.entries()) {
      const victim = this.state.combatants.find((c) => c.id === victimId);
      if (!victim || victim.isDead || !victim.tank.isAlive) continue;

      victim.deaths += 1;
      if (info.killerId) {
        const killer = this.state.combatants.find((c) => c.id === info.killerId);
        if (killer && killer.team !== victim.team) {
          killer.kills += 1;
        }
      }

      victim.tank.isAlive = false;
      victim.tank.isShielded = false;
      victim.isDead = true;
      victim.protectionTicksRemaining = 0;
      victim.protectionSecondsRemaining = 0;
      victim.hazardDamageAccumulated = 0;
      victim.inDangerZone = false;

      this.emitCombatEvent('TANK_EXPLOSION', victim.tank.x + 8, victim.tank.y + 8);

      if (isNoNewRespawnPhase) {
        // Trong SUDDEN DEATH (hoặc sau mốc 0s): mọi xe tăng bị tiêu diệt đều bị loại vĩnh viễn, không phát sinh hồi sinh mới
        victim.lives = 0;
        victim.eliminatedPermanently = true;
        victim.respawnTicksRemaining = 0;
        victim.respawnSecondsRemaining = 0;
        victim.pendingRespawnBeforeSuddenDeath = false;
      } else {
        // Hiệp chính: trừ đúng 1 mạng
        victim.lives = Math.max(0, victim.lives - 1);
        if (victim.lives > 0) {
          victim.respawnTicksRemaining = VS_RULES_CONFIG.RESPAWN_DELAY_TICKS;
          victim.respawnSecondsRemaining = VS_RULES_CONFIG.RESPAWN_DELAY_SECONDS;
          victim.eliminatedPermanently = false;
        } else {
          victim.respawnTicksRemaining = 0;
          victim.respawnSecondsRemaining = 0;
          victim.eliminatedPermanently = true;
        }
      }
    }
  }

  /**
   * Đánh giá điều kiện thắng thua cuối tick:
   * - Nếu chỉ 1 phe bị loại hoàn toàn -> phe còn lại thắng ngay (KHÔNG gọi random).
   * - Nếu CẢ HAI phe bị loại hoàn toàn trong CÙNG 1 tick -> gọi random 50/50 đúng 1 lần,
   *   khóa kết quả ngay lập tức (WIN / LOSS), tuyệt đối không bao giờ HÒA.
   */
  private evaluateMatchResolution(): void {
    if (this.state.outcome !== null || this.state.phase === 'FINISHED') {
      return;
    }

    const t1Elim = this.state.team1.isEliminated;
    const t2Elim = this.state.team2.isEliminated;

    if (!t1Elim && !t2Elim) {
      return;
    }

    let winnerTeam: VsTeamId;
    let decidedByRandom5050 = false;
    let randomRollValue: number | null = null;
    let reason: VsMatchOutcome['reason'];

    if (t1Elim && t2Elim) {
      // Bị loại hoàn toàn đồng thời trong cùng một khung hình/tick -> phân định ngẫu nhiên 50/50 đúng 1 lần
      const rawRoll = this.randomFn();
      const clampedRoll = Number.isFinite(rawRoll) ? Math.min(Math.max(rawRoll, 0), 0.9999999999) : 0;
      this.state.random5050CallCount += 1;
      winnerTeam = clampedRoll < 0.5 ? 'TEAM_1' : 'TEAM_2';
      decidedByRandom5050 = true;
      randomRollValue = clampedRoll;
      reason = 'SIMULTANEOUS_ELIMINATION_RANDOM_50_50';
    } else if (t2Elim) {
      winnerTeam = 'TEAM_1';
      reason =
        this.state.phase === 'SUDDEN_DEATH' ? 'SUDDEN_DEATH_ELIMINATION' : 'TEAM_ELIMINATED';
    } else {
      winnerTeam = 'TEAM_2';
      reason =
        this.state.phase === 'SUDDEN_DEATH' ? 'SUDDEN_DEATH_ELIMINATION' : 'TEAM_ELIMINATED';
    }

    const loserTeam: VsTeamId = winnerTeam === 'TEAM_1' ? 'TEAM_2' : 'TEAM_1';

    this.state.outcome = Object.freeze({
      winnerTeam,
      loserTeam,
      team1Result: winnerTeam === 'TEAM_1' ? 'WIN' : 'LOSS',
      team2Result: winnerTeam === 'TEAM_2' ? 'WIN' : 'LOSS',
      decidedByRandom5050,
      randomRollValue,
      reason,
      finishedAtTick: this.state.tickCount,
    });

    this.state.phase = 'FINISHED';
    // Dừng toàn bộ đạn và hủy mọi bộ đếm hồi sinh khi trận đấu đã kết thúc
    this.bullets = [];
    for (const c of this.state.combatants) {
      c.respawnTicksRemaining = 0;
      c.respawnSecondsRemaining = 0;
      c.pendingRespawnBeforeSuddenDeath = false;
    }
    this.syncTeamSummaries();
  }

  /**
   * Hàm hỗ trợ kiểm thử & mô phỏng có kiểm soát: đặt vị trí / hướng / trạng thái xe tăng
   * hoặc đẩy nhanh đồng hồ hiệp chính mà vẫn đi qua toàn bộ luật lõi của VsEngine.
   */
  public debugSetNormalRemainingTicks(ticks: number): void {
    if (this.state.phase !== 'NORMAL') return;
    const clamped = Math.max(1, Math.min(VS_RULES_CONFIG.NORMAL_DURATION_TICKS, Math.floor(ticks)));
    this.state.normalRemainingTicks = clamped;
    this.state.normalRemainingSeconds = ticksToSecondsCeil(clamped);
  }

  public debugForceTankPosition(role: VsTankRole, x: number, y: number, direction?: Direction): void {
    const c = this.getCombatantByRole(role);
    if (!c) return;
    c.tank.x = x;
    c.tank.y = y;
    if (direction) {
      c.tank.direction = direction;
    }
  }

  public debugSetTankLives(role: VsTankRole, lives: number): void {
    const c = this.getCombatantByRole(role);
    if (!c) return;
    c.lives = Math.max(0, Math.floor(lives));
    if (c.lives === 0 && c.isDead) {
      c.eliminatedPermanently = true;
      c.respawnTicksRemaining = 0;
      c.respawnSecondsRemaining = 0;
    }
    this.syncTeamSummaries();
  }

  public debugInjectBullet(bullet: VsBullet): void {
    this.bullets.push(bullet);
  }
}
