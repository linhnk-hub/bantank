/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MATCH_STATES = {
  MENU: 'MENU',
  STAGE_START: 'STAGE_START',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  STAGE_CLEAR: 'STAGE_CLEAR',
  GAME_OVER: 'GAME_OVER',
  SUMMARY_STATS: 'SUMMARY_STATS',
} as const;

export type MatchState = typeof MATCH_STATES[keyof typeof MATCH_STATES];

export interface MatchTransitionResult {
  success: boolean;
  from: MatchState;
  to: MatchState;
  reason?: string;
}

/**
 * Valid state transition graph.
 * Ensures strict deterministic progression and prevents illegal jumps.
 */
export const VALID_TRANSITIONS: Record<MatchState, readonly MatchState[]> = {
  MENU: ['STAGE_START'],
  STAGE_START: ['PLAYING', 'MENU'],
  PLAYING: ['PAUSED', 'STAGE_CLEAR', 'GAME_OVER'],
  PAUSED: ['PLAYING', 'STAGE_START', 'MENU'],
  STAGE_CLEAR: ['SUMMARY_STATS', 'STAGE_START', 'MENU'],
  GAME_OVER: ['SUMMARY_STATS', 'STAGE_START', 'MENU'],
  SUMMARY_STATS: ['STAGE_START', 'MENU'],
};

export class MatchStateMachine {
  private currentState: MatchState;
  private previousState: MatchState | null = null;
  private stateEnterTimeMs: number = 0;
  private listeners: Array<(newState: MatchState, oldState: MatchState) => void> = [];

  constructor(initialState: MatchState = MATCH_STATES.PLAYING) {
    this.currentState = initialState;
    this.stateEnterTimeMs = Date.now();
  }

  public getState(): MatchState {
    return this.currentState;
  }

  public getPreviousState(): MatchState | null {
    return this.previousState;
  }

  public getStateEnterTime(): number {
    return this.stateEnterTimeMs;
  }

  public canTransitionTo(targetState: MatchState): boolean {
    const allowed = VALID_TRANSITIONS[this.currentState];
    return allowed ? allowed.includes(targetState) : false;
  }

  public transitionTo(targetState: MatchState, force: boolean = false): MatchTransitionResult {
    const from = this.currentState;

    if (!force && !this.canTransitionTo(targetState)) {
      return {
        success: false,
        from,
        to: targetState,
        reason: `Chuyển đổi bất hợp lệ từ trạng thái ${from} sang ${targetState}.`,
      };
    }

    this.previousState = from;
    this.currentState = targetState;
    this.stateEnterTimeMs = Date.now();

    for (const listener of this.listeners) {
      try {
        listener(this.currentState, from);
      } catch (err) {
        console.error('Error in MatchStateMachine listener:', err);
      }
    }

    return {
      success: true,
      from,
      to: targetState,
    };
  }

  public onStateChange(listener: (newState: MatchState, oldState: MatchState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public reset(state: MatchState = MATCH_STATES.MENU): void {
    this.previousState = null;
    this.currentState = state;
    this.stateEnterTimeMs = Date.now();
  }
}
