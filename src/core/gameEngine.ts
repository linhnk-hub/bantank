/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SIMULATION_CONFIG } from './constants.ts';
import {
  type GameCoreState,
  type InputState,
  type RuntimeTerrainState,
  type TankStructure,
  type BulletStructure,
} from './types.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { createP1Tank, updateTankMovement } from './tank.ts';
import { spawnBullet, updateBullet } from './bullet.ts';

export class GameEngine {
  private state: GameCoreState;
  private accumulatorMs: number = 0;
  private isPaused: boolean = false;
  private lastShootState: boolean = false;

  constructor(customTerrain?: RuntimeTerrainState, customP1?: TankStructure) {
    this.state = {
      tickCount: 0,
      p1: customP1 ?? createP1Tank(),
      bullet: null,
      terrain: customTerrain ?? createRuntimeTerrainState(),
      isGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
    };
  }

  public getState(): Readonly<GameCoreState> {
    return this.state;
  }

  public reset(customTerrain?: RuntimeTerrainState, customP1?: TankStructure): void {
    this.accumulatorMs = 0;
    this.lastShootState = false;
    this.state = {
      tickCount: 0,
      p1: customP1 ?? createP1Tank(),
      bullet: null,
      terrain: customTerrain ?? createRuntimeTerrainState(),
      isGameOver: false,
      gameOverReason: null,
      diagnosticLog: null,
    };
  }

  /**
   * Called when document.visibilityState changes.
   * When returning to visible: resets accumulator and frame timestamp.
   * Never backlogs or simulates sleep time.
   */
  public handleVisibilityChange(isVisible: boolean): void {
    if (!isVisible) {
      this.isPaused = true;
    } else {
      this.isPaused = false;
      this.accumulatorMs = 0; // Discard sleep backlog
      this.state.diagnosticLog = 'Resumed from background tab: accumulator reset';
    }
  }

  /**
   * Executes exactly one simulation tick (dt = 1/60s).
   */
  public stepTick(input: InputState): void {
    if (this.isPaused || this.state.isGameOver) {
      return;
    }

    this.state.tickCount++;

    // 1. Update Tank Movement
    updateTankMovement(this.state.p1, input, this.state.terrain);

    // 2. Handle Shooting (trigger on shoot press edge)
    const shootTriggered = input.shoot && !this.lastShootState;
    this.lastShootState = input.shoot;

    if (shootTriggered && this.state.bullet === null) {
      const newBullet = spawnBullet(this.state.p1, this.state.bullet);
      if (newBullet) {
        this.state.bullet = newBullet;
      }
    }

    // 3. Update Bullet Trajectory & Collision
    if (this.state.bullet !== null) {
      const bulletResult = updateBullet(this.state.bullet, this.state.terrain);
      if (!bulletResult.isAlive) {
        this.state.bullet = null;
      }

      if (bulletResult.hitBase) {
        this.state.isGameOver = true;
        this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
      }
    }

    // 4. Check Base destroyed state directly
    if (this.state.terrain.isBaseDestroyed && !this.state.isGameOver) {
      this.state.isGameOver = true;
      this.state.gameOverReason = 'Căn cứ đã bị phá hủy! Game Over.';
    }
  }

  /**
   * Advances simulation with real-world delta time using fixed 60Hz ticks.
   * Manages accumulator, backlog limits, and frame clamp.
   */
  public advanceTime(deltaMs: number, input: InputState): number {
    if (this.isPaused) {
      return 0;
    }

    this.accumulatorMs += deltaMs;

    // Frame lag clamp: prevent spiral of death
    if (this.accumulatorMs > SIMULATION_CONFIG.MAX_ACCUMULATOR_MS) {
      this.accumulatorMs = SIMULATION_CONFIG.MAX_ACCUMULATOR_MS;
      this.state.diagnosticLog = 'Simulation backlog clamped at 250ms';
    }

    let ticksRun = 0;
    while (
      this.accumulatorMs >= SIMULATION_CONFIG.FIXED_DT_MS &&
      ticksRun < SIMULATION_CONFIG.MAX_TICKS_PER_FRAME
    ) {
      this.stepTick(input);
      this.accumulatorMs -= SIMULATION_CONFIG.FIXED_DT_MS;
      ticksRun++;
    }

    return ticksRun;
  }
}
