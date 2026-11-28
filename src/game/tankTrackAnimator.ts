/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Direction } from '../core/types.ts';

/**
 * Art System V1.1 — Gate 2B: All-Tank Track Animation Controller
 *
 * Drives 2-frame tank track animation (Frame 0 idle / Frame 1 active) via
 * Direct Texture Frame Switching on existing Phaser.GameObjects.Image instances.
 *
 * Design guarantees:
 * - Zero extra GameObjects, sprites, overlays, or draw calls.
 * - Purely presentation-layer: never mutates GameCoreState, speed, physics, or network state.
 * - Distance-driven (logical 208x208 px displacement), independent of FPS or host clock speed.
 * - Handles 30 FPS power-saving mode, 60Hz, 120Hz/144Hz high-refresh displays, direction snaps,
 *   wall collisions, respawns, pauses, and Online Guest visual interpolation cleanly.
 */

/** Logical pixel displacement required to advance one track phase (Frame 0 <-> Frame 1). */
export const TRACK_STEP_DISTANCE_LOGICAL_PX = 4 as const;

/**
 * Minimum time (ms) between consecutive frame flips (caps max rate to 20 toggles/s = 10 cycles/s).
 * - Armor (45 px/s): 4px every 88.9ms -> pure distance-driven (11.25 toggles/s)
 * - Normal P1/P2/AI/Basic/Power (60 px/s): 4px every 66.7ms -> pure distance-driven (15 toggles/s)
 * - Fast (90 px/s): 4px every 44.4ms -> smoothly capped at 50ms (20 toggles/s)
 * - Speed Boost (120 px/s): 4px every 33.3ms -> prevents 30Hz strobing & 30 FPS Nyquist aliasing
 * NOTE: This is strictly a rate-limiter; it NEVER triggers frame flips without real displacement.
 */
export const TRACK_MIN_TOGGLE_INTERVAL_MS = 50 as const;

/** Minimum logical displacement per simulation step to qualify as genuine motion (Local/Host). */
export const TRACK_MOVEMENT_EPSILON_PX = 0.05 as const;

/**
 * Minimum apparent visual speed (logical px/s) on Online Guest to filter out the tiny
 * asymptotic tail of exponential visual smoothing (`computeSmoothedPos`) after stopping.
 */
export const TRACK_GUEST_MIN_SPEED_PX_S = 12 as const;

/**
 * Maximum idle grace window (ms) on Online Guest before resetting to Frame 0.
 * Absorbs normal ~33-50ms Host snapshot cadence while guaranteeing clean idle reset
 * on stop or temporary packet/snapshot stalls (> 100ms).
 */
export const TRACK_GUEST_IDLE_RESET_MS = 100 as const;

/**
 * Any single-update displacement strictly above this logical distance is treated as a
 * teleport / respawn / large network correction snap (resets cleanly to Frame 0).
 */
export const TRACK_TELEPORT_SNAP_THRESHOLD_PX = 12 as const;

export type TrackFrameIndex = 0 | 1;

export interface TrackEntityState {
  lastX: number;
  lastY: number;
  lastDirection: Direction;
  accumulatedDistance: number;
  frame: TrackFrameIndex;
  msSinceLastToggle: number;
  idleMs: number;
}

export interface TrackUpdateParams {
  /** Stable unique identifier per tank instance (e.g. 'p1', 'p2', 'enemy:e_1', 'vs_ai:ai_1'). */
  entityId: string;
  /** Current rendered logical X coordinate (208x208 world space). */
  x: number;
  /** Current rendered logical Y coordinate (208x208 world space). */
  y: number;
  /** Current tank facing direction. */
  direction: Direction;
  /** True only when matchState === 'PLAYING' and tank is alive/active. */
  isPlaying: boolean;
  /** Elapsed render-pass time in ms since the previous visual update. */
  elapsedMs: number;
  /** Number of authoritative simulation ticks advanced since the previous render pass. */
  ticksAdvanced: number;
  /** True when client is an Online Guest rendering interpolated/smoothed positions. */
  isOnlineGuest: boolean;
}

export class TankTrackAnimator {
  private readonly entities: Map<string, TrackEntityState> = new Map();

  /**
   * Updates an entity's movement-based track animation state and returns its active frame (0 or 1).
   */
  public updateEntity(params: TrackUpdateParams): TrackFrameIndex {
    const {
      entityId,
      x,
      y,
      direction,
      isPlaying,
      elapsedMs,
      ticksAdvanced,
      isOnlineGuest,
    } = params;

    const safeElapsedMs =
      Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.min(elapsedMs, 250) : 0;

    const existing = this.entities.get(entityId);
    if (!existing) {
      this.entities.set(entityId, {
        lastX: x,
        lastY: y,
        lastDirection: direction,
        accumulatedDistance: 0,
        frame: 0,
        msSinceLastToggle: TRACK_MIN_TOGGLE_INTERVAL_MS,
        idleMs: 0,
      });
      return 0;
    }

    // Non-playing states (PAUSED, STAGE_START, STAGE_CLEAR, GAME_OVER, SUMMARY_STATS):
    // Always display idle Frame 0 and keep coordinates synced so resuming produces no false jump.
    if (!isPlaying) {
      existing.lastX = x;
      existing.lastY = y;
      existing.lastDirection = direction;
      existing.accumulatedDistance = 0;
      existing.frame = 0;
      existing.idleMs = 0;
      existing.msSinceLastToggle = TRACK_MIN_TOGGLE_INTERVAL_MS;
      return 0;
    }

    // Direction change: immediately display Frame 0 of the new direction and discard any
    // perpendicular `trySafeGridSnap` offset so turning in place never animates treads.
    if (direction !== existing.lastDirection) {
      existing.lastX = x;
      existing.lastY = y;
      existing.lastDirection = direction;
      existing.accumulatedDistance = 0;
      existing.frame = 0;
      existing.idleMs = 0;
      existing.msSinceLastToggle = TRACK_MIN_TOGGLE_INTERVAL_MS;
      return 0;
    }

    const dx = x - existing.lastX;
    const dy = y - existing.lastY;
    const dist = Math.hypot(dx, dy);

    existing.lastX = x;
    existing.lastY = y;
    existing.msSinceLastToggle = Math.min(
      1000,
      existing.msSinceLastToggle + safeElapsedMs
    );

    // Guard against non-finite values or teleport / respawn / large network correction snaps
    if (!Number.isFinite(dist) || dist > TRACK_TELEPORT_SNAP_THRESHOLD_PX) {
      existing.accumulatedDistance = 0;
      existing.frame = 0;
      existing.idleMs = 0;
      existing.msSinceLastToggle = TRACK_MIN_TOGGLE_INTERVAL_MS;
      return 0;
    }

    if (isOnlineGuest) {
      // Online Guest uses continuous visual smoothing between ~20-30Hz Host snapshots.
      // Filter exponential settle tails with a minimum apparent speed threshold.
      const minGuestDist =
        safeElapsedMs > 0
          ? Math.max(
              TRACK_MOVEMENT_EPSILON_PX,
              (TRACK_GUEST_MIN_SPEED_PX_S * safeElapsedMs) / 1000
            )
          : TRACK_MOVEMENT_EPSILON_PX;

      if (dist >= minGuestDist) {
        existing.idleMs = 0;
        existing.accumulatedDistance += dist;
        this.tryAdvanceFrame(existing);
      } else {
        existing.idleMs += safeElapsedMs;
        if (existing.idleMs >= TRACK_GUEST_IDLE_RESET_MS) {
          existing.accumulatedDistance = 0;
          existing.frame = 0;
          existing.msSinceLastToggle = TRACK_MIN_TOGGLE_INTERVAL_MS;
        }
      }
      return existing.frame;
    }

    // Authoritative Local / Host path:
    // On high-refresh monitors (120Hz/144Hz), RAF frames between 60Hz ticks have ticksAdvanced === 0.
    // Preserve current frame across inter-tick RAF frames so tracks never flicker on >60Hz displays.
    if (ticksAdvanced <= 0 && dist < TRACK_MOVEMENT_EPSILON_PX) {
      return existing.frame;
    }

    if (dist >= TRACK_MOVEMENT_EPSILON_PX) {
      existing.idleMs = 0;
      existing.accumulatedDistance += dist;
      this.tryAdvanceFrame(existing);
    } else {
      // Simulation tick ran with zero real displacement (stopped, wall-blocked, or aiming in place):
      // Immediately settle to Frame 0.
      existing.accumulatedDistance = 0;
      existing.frame = 0;
      existing.idleMs = 0;
      existing.msSinceLastToggle = TRACK_MIN_TOGGLE_INTERVAL_MS;
    }

    return existing.frame;
  }

  /**
   * Resolves the final Phaser texture key for a tank given its base Frame 0 key and active frame.
   * Falls back safely to the Frame 0 key if the Frame 1 texture is unavailable.
   */
  public resolveTextureKey(
    baseFrame0Key: string,
    frame: TrackFrameIndex,
    textureExists: (key: string) => boolean
  ): string {
    if (frame === 1) {
      const frame1Key = `${baseFrame0Key}_f1`;
      if (textureExists(frame1Key)) {
        return frame1Key;
      }
    }
    return baseFrame0Key;
  }

  /**
   * Resets a single entity's tracking state (call on death/hide so respawn always starts at Frame 0).
   */
  public resetEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  /**
   * Removes an entity permanently (call when an enemy or VS AI sprite is destroyed).
   */
  public removeEntity(entityId: string): void {
    this.entities.delete(entityId);
  }

  /**
   * Removes all tracked entities whose key starts with `keyPrefix` and are no longer in `activeIds`.
   */
  public prunePrefixedEntities(keyPrefix: string, activeIds: ReadonlySet<string>): void {
    for (const key of this.entities.keys()) {
      if (key.startsWith(keyPrefix)) {
        const rawId = key.slice(keyPrefix.length);
        if (!activeIds.has(rawId)) {
          this.entities.delete(key);
        }
      }
    }
  }

  /**
   * Clears all tracked entity states (call on stage restart, terrain refresh, or scene shutdown).
   */
  public clear(): void {
    this.entities.clear();
  }

  public getEntityState(entityId: string): Readonly<TrackEntityState> | undefined {
    return this.entities.get(entityId);
  }

  public getTrackedCount(): number {
    return this.entities.size;
  }

  private tryAdvanceFrame(state: TrackEntityState): void {
    if (state.accumulatedDistance < TRACK_STEP_DISTANCE_LOGICAL_PX) {
      return;
    }

    if (state.msSinceLastToggle < TRACK_MIN_TOGGLE_INTERVAL_MS) {
      // Cap accumulated backlog to one step so high-speed movement cannot burst-skip later
      if (state.accumulatedDistance > TRACK_STEP_DISTANCE_LOGICAL_PX) {
        state.accumulatedDistance = TRACK_STEP_DISTANCE_LOGICAL_PX;
      }
      return;
    }

    // Advance exactly one phase per eligible update to prevent 30 FPS double-flip aliasing
    state.frame = state.frame === 0 ? 1 : 0;
    state.accumulatedDistance = state.accumulatedDistance % TRACK_STEP_DISTANCE_LOGICAL_PX;
    state.msSinceLastToggle = 0;
  }
}
