/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MAP_DIMENSIONS } from './constants.ts';
import {
  TILE_TYPES,
  type BulletStructure,
  type Direction,
  type InputState,
  type RuntimeTerrainState,
  type TankStructure,
} from './types.ts';
import { checkHitboxVsTerrain, checkTankVsTanks, getTankHitbox } from './physics.ts';
import { findPathAStar, findPathWithBrickBreachAStar } from './ai/pathfinding.ts';
import { isTankInsideSafeZone } from './vsMap.ts';
import type {
  VsCombatantState,
  VsPhase,
  VsSafeZoneBounds,
  VsSafeZoneState,
} from './vsTypes.ts';

const NEUTRAL_AI_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

function directionToInput(dir: Direction | null, shoot: boolean): InputState {
  return {
    up: dir === 'UP',
    down: dir === 'DOWN',
    left: dir === 'LEFT',
    right: dir === 'RIGHT',
    shoot,
  };
}

/**
 * Bộ điều khiển A.I dành riêng cho chế độ VS (BTO-VS-GAMEPLAY-V1.2).
 * - Mỗi xe A.I (AI_1 của TEAM_1 và AI_2 của TEAM_2) dùng chung thuật toán & độ khó giống hệt nhau.
 * - Phân biệt tuyệt đối đồng đội (cùng team) và đối thủ (khác team).
 * - Không bao giờ nhắm bắn hoặc tấn công đồng đội.
 * - Trong SUDDEN DEATH: nhận biết ranh giới vùng an toàn, ưu tiên di chuyển vào vùng an toàn,
 *   có cơ chế thoát kẹt và vẫn giao chiến với đối thủ khi ở trong vùng an toàn.
 */
export class VsTankAIController {
  private path: Array<{ x: number; y: number }> = [];
  private repathCooldown: number = 0;
  private lastDir: Direction = 'RIGHT';
  private lastPosX: number = -1;
  private lastPosY: number = -1;
  private stuckTicks: number = 0;
  private stationaryTicks: number = 0;
  private forceMoveDir: Direction | null = null;
  private forceMoveTicks: number = 0;
  private evadeDir: Direction | null = null;
  private evadeTicks: number = 0;

  public reset(): void {
    this.path = [];
    this.repathCooldown = 0;
    this.lastPosX = -1;
    this.lastPosY = -1;
    this.stuckTicks = 0;
    this.stationaryTicks = 0;
    this.forceMoveDir = null;
    this.forceMoveTicks = 0;
    this.evadeDir = null;
    this.evadeTicks = 0;
  }

  public computeInput(
    self: VsCombatantState,
    allCombatants: VsCombatantState[],
    bullets: BulletStructure[],
    terrain: RuntimeTerrainState,
    safeZone: VsSafeZoneState,
    phase: VsPhase,
    tickCount: number
  ): InputState {
    if (self.isDead || !self.tank.isAlive) {
      this.reset();
      return { ...NEUTRAL_AI_INPUT };
    }

    const tank = self.tank;
    const isProtected = self.protectionTicksRemaining > 0;
    const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;

    // 1. Phân loại chính xác đồng đội và đối thủ theo team (tuyệt đối không nhầm phe)
    const aliveAllies = allCombatants.filter(
      (c) => c.team === self.team && c.id !== self.id && !c.isDead && c.tank.isAlive
    );
    const aliveEnemies = allCombatants.filter(
      (c) => c.team !== self.team && !c.isDead && c.tank.isAlive
    );
    const otherAliveTanks = allCombatants
      .filter((c) => c.id !== self.id && !c.isDead && c.tank.isAlive)
      .map((c) => c.tank);

    // Track stuck & stationary status (3 seconds = 180 ticks triggers forced movement to break AI deadlocks)
    const movedDist =
      this.lastPosX < 0 ? 10 : Math.abs(tank.x - this.lastPosX) + Math.abs(tank.y - this.lastPosY);
    if (movedDist < 0.25) {
      this.stuckTicks++;
    } else {
      this.stuckTicks = 0;
    }
    if (movedDist < 0.5) {
      this.stationaryTicks++;
    } else {
      this.stationaryTicks = 0;
    }
    this.lastPosX = tank.x;
    this.lastPosY = tank.y;

    if (this.repathCooldown > 0) this.repathCooldown--;
    if (this.evadeTicks > 0) this.evadeTicks--;
    if (this.forceMoveTicks > 0) this.forceMoveTicks--;

    // 2. Xác định vùng an toàn mục tiêu trong SUDDEN DEATH
    const activeSafeBounds: VsSafeZoneBounds | null =
      phase === 'SUDDEN_DEATH'
        ? safeZone.isShrinkImminent && !safeZone.nextBounds.isFullyCollapsed
          ? safeZone.nextBounds
          : safeZone.bounds
        : null;

    const currentlyInsideSafe = activeSafeBounds
      ? isTankInsideSafeZone(tank, activeSafeBounds)
      : true;
    const strictlyOutsideCurrentSafe =
      phase === 'SUDDEN_DEATH' && !isTankInsideSafeZone(tank, safeZone.bounds);

    // 3. ƯU TIÊN SỐ 1 TRONG SUDDEN DEATH: Tiến vào vùng an toàn nếu đang ở ngoài hoặc sắp bị thu hẹp
    if (activeSafeBounds && !currentlyInsideSafe && !activeSafeBounds.isFullyCollapsed) {
      const targetSafeTile = this.pickNearestSafeTile(tank, activeSafeBounds, terrain, otherAliveTanks, self.id);
      const moveDir = this.steerTowardsTarget(
        tank,
        targetSafeTile,
        terrain,
        otherAliveTanks,
        self.id,
        tickCount
      );

      // Nếu có gạch chắn ngay phía trước theo hướng vào vùng an toàn -> bắn phá gạch (trừ khi có đồng đội ngay trước họng súng)
      let shouldShoot = false;
      if (!isProtected && moveDir) {
        const allyBlocking = this.isAllyInLineOfFire(tank, moveDir, aliveAllies, terrain);
        if (!allyBlocking) {
          if (this.hasDestructibleBrickAhead(tank, moveDir, terrain)) {
            shouldShoot = tank.direction === moveDir;
          } else if (this.hasEnemyInLineOfFire(tank, tank.direction, aliveEnemies, aliveAllies, terrain)) {
            shouldShoot = true;
          }
        }
      }

      return directionToInput(moveDir ?? this.fallbackMoveTowardCenter(tank, terrain, otherAliveTanks, self.id), shouldShoot);
    }

    // 4. Né đạn đối phương nếu đang không bị ép chạy vùng nguy hiểm
    if (!strictlyOutsideCurrentSafe) {
      const dodgeDir = this.findIncomingBulletDodgeDir(
        self,
        bullets,
        allCombatants,
        terrain,
        otherAliveTanks,
        activeSafeBounds
      );
      if (dodgeDir) {
        this.evadeDir = dodgeDir;
        this.evadeTicks = 10;
      }
      if (this.evadeTicks > 0 && this.evadeDir) {
        if (this.canStepSafelyInDir(tank, this.evadeDir, terrain, otherAliveTanks, self.id, activeSafeBounds)) {
          return directionToInput(this.evadeDir, false);
        }
        this.evadeTicks = 0;
        this.evadeDir = null;
      }
    }

    // 5. Nếu không có đối thủ đang sống trên bản đồ -> di chuyển chiến thuật về trung tâm vùng an toàn
    if (aliveEnemies.length === 0) {
      const centerTarget = { x: 6 * tilePx, y: 6 * tilePx };
      const distCenter = Math.hypot(tank.x - centerTarget.x, tank.y - centerTarget.y);
      if (distCenter > 20) {
        const dir = this.steerTowardsTarget(
          tank,
          centerTarget,
          terrain,
          otherAliveTanks,
          self.id,
          tickCount
        );
        return directionToInput(dir, false);
      }
      return { ...NEUTRAL_AI_INPUT };
    }

    // 5b. Cơ chế chống kẹt 3 giây (180 ticks): Nếu A.I đứng im/dính nhau tại 1 vị trí >= 3s, tự động di chuyển thoát kẹt
    if (this.stationaryTicks >= 180) {
      const candidateDirs: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      const perpDirs: Direction[] =
        tank.direction === 'UP' || tank.direction === 'DOWN'
          ? ['LEFT', 'RIGHT', 'UP', 'DOWN']
          : ['UP', 'DOWN', 'LEFT', 'RIGHT'];
      let chosenDir: Direction | null = null;
      let bestDirScore = -Infinity;
      for (const dir of perpDirs) {
        if (!this.canStepSafelyInDir(tank, dir, terrain, [], self.id, activeSafeBounds)) {
          continue;
        }
        const vec =
          dir === 'UP'
            ? { dx: 0, dy: -tilePx }
            : dir === 'DOWN'
              ? { dx: 0, dy: tilePx }
              : dir === 'LEFT'
                ? { dx: -tilePx, dy: 0 }
                : { dx: tilePx, dy: 0 };
        const nx = tank.x + vec.dx;
        const ny = tank.y + vec.dy;
        let minDistToOther = 999;
        for (const other of otherAliveTanks) {
          const d = Math.hypot(nx - other.x, ny - other.y);
          if (d < minDistToOther) minDistToOther = d;
        }
        // Ưu tiên hướng tách xa tank đang dính/gần và vuông góc với hướng cũ
        const perpBonus = dir !== tank.direction ? 18 : 0;
        const score = minDistToOther + perpBonus + ((tickCount + candidateDirs.indexOf(dir)) % 5);
        if (score > bestDirScore) {
          bestDirScore = score;
          chosenDir = dir;
        }
      }
      if (chosenDir) {
        this.forceMoveDir = chosenDir;
        this.forceMoveTicks = 36;
        this.stationaryTicks = 0;
        this.stuckTicks = 0;
        this.path = [];
      }
    }

    if (this.forceMoveTicks > 0 && this.forceMoveDir) {
      if (this.canStepSafelyInDir(tank, this.forceMoveDir, terrain, [], self.id, activeSafeBounds)) {
        this.lastDir = this.forceMoveDir;
        return directionToInput(this.forceMoveDir, false);
      }
      this.forceMoveTicks = 0;
      this.forceMoveDir = null;
    }

    // 6. Kiểm tra tuyến bắn trực tiếp vào bất kỳ đối thủ nào (ưu tiên kẻ thù gần nhất & không có đồng đội chắn)
    if (!isProtected) {
      const fireDir = this.findBestAttackLineDirection(tank, aliveEnemies, aliveAllies, terrain);
      if (fireDir) {
        if (tank.direction === fireDir) {
          return directionToInput(null, true);
        }
        // Xoay hướng để ngắm vào đối thủ (không rời khỏi vùng an toàn)
        return directionToInput(fireDir, true);
      }
    }

    // 7. Chọn mục tiêu đối thủ tối ưu và di chuyển áp sát / chiếm góc bắn (luôn giữ trong vùng an toàn)
    const primaryTarget = this.selectPriorityEnemy(tank, aliveEnemies, aliveAllies);
    let destination = {
      x: Math.round(primaryTarget.tank.x / tilePx) * tilePx,
      y: Math.round(primaryTarget.tank.y / tilePx) * tilePx,
    };

    // Nếu đối thủ ở ngoài vùng an toàn trong Sudden Death, không chạy ra vùng nguy hiểm đuổi theo —
    // giữ vị trí ở mép trong vùng an toàn gần đối thủ nhất để phục kích!
    if (activeSafeBounds && !activeSafeBounds.isFullyCollapsed) {
      const destCol = Math.max(
        activeSafeBounds.minCol,
        Math.min(activeSafeBounds.maxCol, Math.round(destination.x / tilePx))
      );
      const destRow = Math.max(
        activeSafeBounds.minRow,
        Math.min(activeSafeBounds.maxRow, Math.round(destination.y / tilePx))
      );
      destination = { x: destCol * tilePx, y: destRow * tilePx };
    }

    let moveDir = this.steerTowardsTarget(
      tank,
      destination,
      terrain,
      otherAliveTanks,
      self.id,
      tickCount
    );

    // Không tự ý bước ra ngoài vùng an toàn khi đang ở trong vùng an toàn
    if (
      moveDir &&
      activeSafeBounds &&
      !activeSafeBounds.isFullyCollapsed &&
      currentlyInsideSafe &&
      !this.wouldStepStayInsideSafeZone(tank, moveDir, activeSafeBounds)
    ) {
      moveDir = this.fallbackMoveTowardCenter(tank, terrain, otherAliveTanks, self.id);
    }

    let shouldShoot = false;
    if (!isProtected && moveDir) {
      const allyBlocking = this.isAllyInLineOfFire(tank, moveDir, aliveAllies, terrain);
      if (!allyBlocking) {
        if (this.hasEnemyInLineOfFire(tank, tank.direction, aliveEnemies, aliveAllies, terrain)) {
          shouldShoot = true;
        } else if (
          this.hasDestructibleBrickAhead(tank, moveDir, terrain) &&
          tank.direction === moveDir
        ) {
          shouldShoot = true;
        }
      }
    }

    if (moveDir) {
      this.lastDir = moveDir;
    }

    return directionToInput(moveDir, shouldShoot);
  }

  private selectPriorityEnemy(
    selfTank: TankStructure,
    enemies: VsCombatantState[],
    allies: VsCombatantState[]
  ): VsCombatantState {
    let best = enemies[0];
    let bestScore = Infinity;

    for (const enemy of enemies) {
      let score =
        Math.abs(enemy.tank.x - selfTank.x) + Math.abs(enemy.tank.y - selfTank.y);
      // Ưu tiên mục tiêu đang đe dọa đồng đội
      for (const ally of allies) {
        const distToAlly =
          Math.abs(enemy.tank.x - ally.tank.x) + Math.abs(enemy.tank.y - ally.tank.y);
        if (distToAlly < 48) {
          score -= 24;
        }
      }
      // Ưu tiên mục tiêu không có khiên bảo vệ
      if (enemy.protectionTicksRemaining > 0) {
        score += 48;
      }
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  private pickNearestSafeTile(
    tank: TankStructure,
    bounds: VsSafeZoneBounds,
    terrain: RuntimeTerrainState,
    otherTanks: TankStructure[],
    selfId: string
  ): { x: number; y: number } {
    const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;
    const centerCol = (bounds.minCol + bounds.maxCol) / 2;
    const centerRow = (bounds.minRow + bounds.maxRow) / 2;

    let bestTile: { x: number; y: number } = {
      x: Math.round(centerCol) * tilePx,
      y: Math.round(centerRow) * tilePx,
    };
    let bestCost = Infinity;

    for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
        const tile = terrain.currentMap[r]?.[c];
        if (tile !== TILE_TYPES.EMPTY && tile !== TILE_TYPES.GRASS) continue;
        const x = c * tilePx;
        const y = r * tilePx;
        const box = getTankHitbox(x, y);
        if (checkTankVsTanks(selfId, box, otherTanks)) continue;
        const distToTank = Math.abs(x - tank.x) + Math.abs(y - tank.y);
        const distToCenter = Math.abs(c - centerCol) + Math.abs(r - centerRow);
        const cost = distToTank + distToCenter * 6;
        if (cost < bestCost) {
          bestCost = cost;
          bestTile = { x, y };
        }
      }
    }

    return bestTile;
  }

  private steerTowardsTarget(
    tank: TankStructure,
    target: { x: number; y: number },
    terrain: RuntimeTerrainState,
    otherTanks: TankStructure[],
    selfId: string,
    tickCount: number
  ): Direction | null {
    const needsRepath =
      this.path.length === 0 ||
      this.repathCooldown <= 0 ||
      this.stuckTicks >= 12;

    if (needsRepath) {
      let nextPath = findPathAStar(tank, target, terrain, otherTanks, selfId);
      if (nextPath.length === 0) {
        nextPath = findPathWithBrickBreachAStar(tank, target, terrain, otherTanks, selfId, {
          forbidBaseDefenseBricks: false,
        });
      }
      this.path = nextPath;
      this.repathCooldown = 12;
    }

    // Remove reached waypoints
    while (this.path.length > 0) {
      const wp = this.path[0];
      if (Math.abs(wp.x - tank.x) <= 2 && Math.abs(wp.y - tank.y) <= 2) {
        this.path.shift();
      } else {
        break;
      }
    }

    if (this.path.length > 0) {
      const wp = this.path[0];
      const dx = wp.x - tank.x;
      const dy = wp.y - tank.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx > 0 ? 'RIGHT' : 'LEFT';
      }
      return dy > 0 ? 'DOWN' : 'UP';
    }

    // Stuck recovery or direct fallback
    const dx = target.x - tank.x;
    const dy = target.y - tank.y;
    const preferredDirs: Direction[] =
      Math.abs(dx) >= Math.abs(dy)
        ? [dx >= 0 ? 'RIGHT' : 'LEFT', dy >= 0 ? 'DOWN' : 'UP', dy >= 0 ? 'UP' : 'DOWN', dx >= 0 ? 'LEFT' : 'RIGHT']
        : [dy >= 0 ? 'DOWN' : 'UP', dx >= 0 ? 'RIGHT' : 'LEFT', dx >= 0 ? 'LEFT' : 'RIGHT', dy >= 0 ? 'UP' : 'DOWN'];

    if (this.stuckTicks >= 15) {
      const rot = Math.floor(tickCount / 15) % preferredDirs.length;
      const rotated = [...preferredDirs.slice(rot), ...preferredDirs.slice(0, rot)];
      for (const dir of rotated) {
        if (this.canStepSafelyInDir(tank, dir, terrain, otherTanks, selfId, null)) {
          return dir;
        }
      }
    }

    for (const dir of preferredDirs) {
      if (this.canStepSafelyInDir(tank, dir, terrain, otherTanks, selfId, null)) {
        return dir;
      }
    }

    return preferredDirs[0] ?? this.lastDir;
  }

  private fallbackMoveTowardCenter(
    tank: TankStructure,
    terrain: RuntimeTerrainState,
    otherTanks: TankStructure[],
    selfId: string
  ): Direction | null {
    const center = MAP_DIMENSIONS.TOTAL_WIDTH_PX / 2 - 8; // 96
    const dx = center - tank.x;
    const dy = center - tank.y;
    const dirs: Direction[] =
      Math.abs(dx) >= Math.abs(dy)
        ? [dx >= 0 ? 'RIGHT' : 'LEFT', dy >= 0 ? 'DOWN' : 'UP', dy >= 0 ? 'UP' : 'DOWN', dx >= 0 ? 'LEFT' : 'RIGHT']
        : [dy >= 0 ? 'DOWN' : 'UP', dx >= 0 ? 'RIGHT' : 'LEFT', dx >= 0 ? 'LEFT' : 'RIGHT', dy >= 0 ? 'UP' : 'DOWN'];
    for (const d of dirs) {
      if (this.canStepSafelyInDir(tank, d, terrain, otherTanks, selfId, null)) {
        return d;
      }
    }
    return dirs[0];
  }

  private wouldStepStayInsideSafeZone(
    tank: TankStructure,
    dir: Direction,
    bounds: VsSafeZoneBounds
  ): boolean {
    const step = 4;
    const nx = tank.x + (dir === 'RIGHT' ? step : dir === 'LEFT' ? -step : 0);
    const ny = tank.y + (dir === 'DOWN' ? step : dir === 'UP' ? -step : 0);
    return isTankInsideSafeZone({ x: nx, y: ny }, bounds);
  }

  private canStepSafelyInDir(
    tank: TankStructure,
    dir: Direction,
    terrain: RuntimeTerrainState,
    otherTanks: TankStructure[],
    selfId: string,
    safeBounds: VsSafeZoneBounds | null
  ): boolean {
    const step = 2;
    const nx = tank.x + (dir === 'RIGHT' ? step : dir === 'LEFT' ? -step : 0);
    const ny = tank.y + (dir === 'DOWN' ? step : dir === 'UP' ? -step : 0);
    if (safeBounds && !safeBounds.isFullyCollapsed && !isTankInsideSafeZone({ x: nx, y: ny }, safeBounds)) {
      return false;
    }
    const box = getTankHitbox(nx, ny);
    const terr = checkHitboxVsTerrain(box, terrain, { forBullet: false });
    if (terr.collides || terr.isOutOfBounds) return false;
    void selfId;
    void otherTanks;
    return true;
  }

  private findIncomingBulletDodgeDir(
    self: VsCombatantState,
    bullets: BulletStructure[],
    allCombatants: VsCombatantState[],
    terrain: RuntimeTerrainState,
    otherTanks: TankStructure[],
    safeBounds: VsSafeZoneBounds | null
  ): Direction | null {
    const tank = self.tank;
    const cx = tank.x + 8;
    const cy = tank.y + 8;

    for (const b of bullets) {
      // Bỏ qua đạn của bản thân hoặc đồng đội (Friendly Fire OFF)
      const owner = allCombatants.find((c) => c.id === b.ownerId || c.tank.id === b.ownerId);
      if (owner && owner.team === self.team) continue;

      const bx = b.x + 2;
      const by = b.y + 2;
      const dx = cx - bx;
      const dy = cy - by;

      const threateningHoriz =
        Math.abs(dy) < 12 &&
        ((b.direction === 'RIGHT' && dx > 0 && dx < 56) ||
          (b.direction === 'LEFT' && dx < 0 && -dx < 56));
      const threateningVert =
        Math.abs(dx) < 12 &&
        ((b.direction === 'DOWN' && dy > 0 && dy < 56) ||
          (b.direction === 'UP' && dy < 0 && -dy < 56));

      if (threateningHoriz) {
        const candidates: Direction[] = dy >= 0 ? ['DOWN', 'UP'] : ['UP', 'DOWN'];
        for (const d of candidates) {
          if (this.canStepSafelyInDir(tank, d, terrain, otherTanks, self.id, safeBounds)) {
            return d;
          }
        }
      } else if (threateningVert) {
        const candidates: Direction[] = dx >= 0 ? ['RIGHT', 'LEFT'] : ['LEFT', 'RIGHT'];
        for (const d of candidates) {
          if (this.canStepSafelyInDir(tank, d, terrain, otherTanks, self.id, safeBounds)) {
            return d;
          }
        }
      }
    }
    return null;
  }

  private findBestAttackLineDirection(
    tank: TankStructure,
    enemies: VsCombatantState[],
    allies: VsCombatantState[],
    terrain: RuntimeTerrainState
  ): Direction | null {
    const directions: Direction[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    let bestDir: Direction | null = null;
    let bestDist = Infinity;

    for (const dir of directions) {
      if (this.isAllyInLineOfFire(tank, dir, allies, terrain)) {
        continue;
      }
      const dist = this.getEnemyLineOfFireDistance(tank, dir, enemies, terrain);
      if (dist !== null && dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }
    return bestDir;
  }

  private hasEnemyInLineOfFire(
    tank: TankStructure,
    dir: Direction,
    enemies: VsCombatantState[],
    allies: VsCombatantState[],
    terrain: RuntimeTerrainState
  ): boolean {
    if (this.isAllyInLineOfFire(tank, dir, allies, terrain)) return false;
    return this.getEnemyLineOfFireDistance(tank, dir, enemies, terrain) !== null;
  }

  private getEnemyLineOfFireDistance(
    tank: TankStructure,
    dir: Direction,
    enemies: VsCombatantState[],
    terrain: RuntimeTerrainState
  ): number | null {
    const cx = tank.x + 8;
    const cy = tank.y + 8;
    const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;

    let closest: number | null = null;
    for (const enemy of enemies) {
      // Không bắn vô ích vào đối thủ đang còn nhiều thời gian bảo vệ nếu còn mục tiêu khác,
      // nhưng vẫn có thể áp sát; vẫn bỏ qua khiên > 0.5s để không phí đạn
      if (enemy.protectionTicksRemaining > 30) continue;

      const ex = enemy.tank.x + 8;
      const ey = enemy.tank.y + 8;
      let dist = -1;

      if (dir === 'UP' && Math.abs(ex - cx) <= 9 && ey < cy) dist = cy - ey;
      else if (dir === 'DOWN' && Math.abs(ex - cx) <= 9 && ey > cy) dist = ey - cy;
      else if (dir === 'LEFT' && Math.abs(ey - cy) <= 9 && ex < cx) dist = cx - ex;
      else if (dir === 'RIGHT' && Math.abs(ey - cy) <= 9 && ex > cx) dist = ex - cx;

      if (dist <= 0 || dist > 160) continue;

      // Kiểm tra có tường STEEL chặn giữa đường bắn hay không
      let blockedBySteel = false;
      const steps = Math.ceil(dist / 8);
      for (let s = 1; s < steps; s++) {
        const px = cx + (dir === 'RIGHT' ? s * 8 : dir === 'LEFT' ? -s * 8 : 0);
        const py = cy + (dir === 'DOWN' ? s * 8 : dir === 'UP' ? -s * 8 : 0);
        const col = Math.floor(px / tilePx);
        const row = Math.floor(py / tilePx);
        if (row < 0 || row >= MAP_DIMENSIONS.ROWS || col < 0 || col >= MAP_DIMENSIONS.COLS) {
          blockedBySteel = true;
          break;
        }
        const tile = terrain.currentMap[row][col];
        if (tile === TILE_TYPES.STEEL) {
          blockedBySteel = true;
          break;
        }
      }
      if (!blockedBySteel && (closest === null || dist < closest)) {
        closest = dist;
      }
    }
    return closest;
  }

  private isAllyInLineOfFire(
    tank: TankStructure,
    dir: Direction,
    allies: VsCombatantState[],
    terrain: RuntimeTerrainState
  ): boolean {
    if (allies.length === 0) return false;
    const cx = tank.x + 8;
    const cy = tank.y + 8;
    const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;

    for (const ally of allies) {
      const ax = ally.tank.x + 8;
      const ay = ally.tank.y + 8;
      let dist = -1;
      if (dir === 'UP' && Math.abs(ax - cx) <= 10 && ay < cy) dist = cy - ay;
      else if (dir === 'DOWN' && Math.abs(ax - cx) <= 10 && ay > cy) dist = ay - cy;
      else if (dir === 'LEFT' && Math.abs(ay - cy) <= 10 && ax < cx) dist = cx - ax;
      else if (dir === 'RIGHT' && Math.abs(ay - cy) <= 10 && ax > cx) dist = ax - cx;

      if (dist <= 0 || dist > 128) continue;

      let blockedByWall = false;
      const steps = Math.ceil(dist / 8);
      for (let s = 1; s < steps; s++) {
        const px = cx + (dir === 'RIGHT' ? s * 8 : dir === 'LEFT' ? -s * 8 : 0);
        const py = cy + (dir === 'DOWN' ? s * 8 : dir === 'UP' ? -s * 8 : 0);
        const col = Math.floor(px / tilePx);
        const row = Math.floor(py / tilePx);
        const tile = terrain.currentMap[row]?.[col];
        if (tile === TILE_TYPES.STEEL || tile === TILE_TYPES.BRICK) {
          blockedByWall = true;
          break;
        }
      }
      if (!blockedByWall) {
        return true;
      }
    }
    return false;
  }

  private hasDestructibleBrickAhead(
    tank: TankStructure,
    dir: Direction,
    terrain: RuntimeTerrainState
  ): boolean {
    const cx = tank.x + 8;
    const cy = tank.y + 8;
    const tilePx = MAP_DIMENSIONS.TILE_SIZE_PX;
    const checkDist = 14;
    const px = cx + (dir === 'RIGHT' ? checkDist : dir === 'LEFT' ? -checkDist : 0);
    const py = cy + (dir === 'DOWN' ? checkDist : dir === 'UP' ? -checkDist : 0);
    const col = Math.floor(px / tilePx);
    const row = Math.floor(py / tilePx);
    if (row < 0 || row >= MAP_DIMENSIONS.ROWS || col < 0 || col >= MAP_DIMENSIONS.COLS) {
      return false;
    }
    return terrain.currentMap[row][col] === TILE_TYPES.BRICK;
  }
}
