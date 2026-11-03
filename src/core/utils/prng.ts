/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32).
 * Allows repeatable, deterministic simulation runs and test verification.
 */
export class DeterministicPRNG {
  private state: number;

  constructor(seed: number = 123456789) {
    this.state = seed >>> 0;
  }

  public setSeed(seed: number): void {
    this.state = seed >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public nextChoice<T>(items: readonly T[]): T {
    const idx = Math.floor(this.next() * items.length);
    return items[idx];
  }
}

export const defaultPRNG = new DeterministicPRNG(42);
