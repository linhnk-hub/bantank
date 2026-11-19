/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BTO-PROGRESSION-MODES-V1.4 & M7.5.2 – MILITARY RANK HIERARCHY (17 CẤP BẬC QUÂN HÀM),
 * STAR ECONOMY (25 XP = 1 SAO ⭐), STAGE ACHIEVEMENT BONUS XP, AND VERIFIED XP LEDGER
 * Status: OFFICIALLY APPROVED SPECIFICATION
 *
 * 1. 17-Rank Military Hierarchy (Section 2 of BTO-PROGRESSION-MODES-V1.4):
 *    - Replaces the numeric Player Level (1–50) display across the player UI with 17 official
 *      military ranks determined automatically from validated cumulative `totalXp`:
 *        1. Đại tướng   (16,500 XP)
 *        2. Thượng tướng(13,500 XP)
 *        3. Trung tướng (11,000 XP)
 *        4. Thiếu tướng (8,800 XP)
 *        5. Đại tá      (7,000 XP)
 *        6. Thượng tá   (5,500 XP)
 *        7. Trung tá    (4,300 XP)
 *        8. Thiếu tá    (3,300 XP)
 *        9. Đại úy      (2,500 XP)
 *       10. Thượng úy   (1,900 XP)
 *       11. Trung úy    (1,400 XP)
 *       12. Thiếu úy    (1,000 XP)
 *       13. Thượng sĩ   (700 XP)
 *       14. Trung sĩ    (450 XP)
 *       15. Hạ sĩ       (250 XP)
 *       16. Binh nhất   (100 XP)
 *       17. Binh nhì    (0 XP — starting rank)
 *    - Existing player `totalXp` is 100% preserved and mapped directly to the new 17-rank table.
 *    - If an XP grant crosses multiple rank thresholds at once, the player is promoted directly
 *      to the final rank corresponding to their new `totalXp`.
 *
 * 2. Star (`Sao ⭐`) Economy (Section 3 of BTO-PROGRESSION-MODES-V1.4):
 *    - Conversion rate: `25 XP = 1 Sao ⭐` (`XP_PER_STAR = 25`).
 *    - Every validated XP addition to `totalXp` automatically converts into `starBalance`:
 *        `starBalance = Math.floor(totalXp / 25)`
 *        `unconvertedXp = totalXp % 25` (0..24 carried forward for future matches)
 *        `xpToNextStar = 25 - unconvertedXp` (1..25)
 *    - `Xu` currency is completely removed from the player economy and UI. Old `Xu` is never
 *      converted into XP or Stars.
 *
 * 3. Stage Completion Achievement Bonus XP (Section 5 of BTO-PROGRESSION-MODES-V1.4):
 *    - Awarded only when a Campaign Stage is cleared (`outcome === 'WIN'`):
 *      * Completed Stage without losing any lives (`livesLost === 0`): `+10 XP`
 *      * Completed Stage in at most 1/2 of the allowed match duration (`stageElapsedSeconds <= matchDurationSeconds / 2`): `+15 XP`
 *      * Both conditions met simultaneously in the same Stage: `+25 XP` (capped at +25 XP max).
 *      * Neither condition met (or on Stage loss): `0 XP`.
 *    - Validated and recorded idempotently under the stage's `eventId` so reloads/reconnects
 *      never double-grant achievement bonus XP or Stars.
 */

import { SCORE_VALUES } from './scoreManager.ts';
import { ENEMY_CONFIG } from './constants.ts';
import {
  SystemAuditLogger,
  computeCanonicalChecksum,
} from './systemAuditLogger.ts';

// =============================================================================
// 1. 17-RANK MILITARY HIERARCHY (CẤP BẬC QUÂN HÀM 1–17)
// =============================================================================

export const TOTAL_MILITARY_RANKS = 17;
export const XP_PER_STAR = 25;

export type MilitaryRankCode =
  | 'DAI_TUONG'
  | 'THUONG_TUONG'
  | 'TRUNG_TUONG'
  | 'THIEU_TUONG'
  | 'DAI_TA'
  | 'THUONG_TA'
  | 'TRUNG_TA'
  | 'THIEU_TA'
  | 'DAI_UY'
  | 'THUONG_UY'
  | 'TRUNG_UY'
  | 'THIEU_UY'
  | 'THUONG_SI'
  | 'TRUNG_SI'
  | 'HA_SI'
  | 'BINH_NHAT'
  | 'BINH_NHI';

export interface MilitaryRankDefinition {
  /** Official table order 1..17 from Section 2.2 (1 = Đại tướng, 17 = Binh nhì) */
  orderFromTop: number;
  /** Ascending tier 1..17 from lowest to highest (1 = Binh nhì, 17 = Đại tướng) */
  tier: number;
  code: MilitaryRankCode;
  nameVi: string;
  nameEn: string;
  xpRequired: number;
  xpDeltaFromPrevious: number;
}

const RAW_MILITARY_RANKS_ASC: ReadonlyArray<{
  orderFromTop: number;
  tier: number;
  code: MilitaryRankCode;
  nameVi: string;
  nameEn: string;
  xpRequired: number;
  xpDeltaFromPrevious: number;
}> = [
  {
    orderFromTop: 17,
    tier: 1,
    code: 'BINH_NHI',
    nameVi: 'Binh nhì',
    nameEn: 'Private Second Class',
    xpRequired: 0,
    xpDeltaFromPrevious: 0,
  },
  {
    orderFromTop: 16,
    tier: 2,
    code: 'BINH_NHAT',
    nameVi: 'Binh nhất',
    nameEn: 'Private First Class',
    xpRequired: 100,
    xpDeltaFromPrevious: 100,
  },
  {
    orderFromTop: 15,
    tier: 3,
    code: 'HA_SI',
    nameVi: 'Hạ sĩ',
    nameEn: 'Corporal',
    xpRequired: 250,
    xpDeltaFromPrevious: 150,
  },
  {
    orderFromTop: 14,
    tier: 4,
    code: 'TRUNG_SI',
    nameVi: 'Trung sĩ',
    nameEn: 'Sergeant',
    xpRequired: 450,
    xpDeltaFromPrevious: 200,
  },
  {
    orderFromTop: 13,
    tier: 5,
    code: 'THUONG_SI',
    nameVi: 'Thượng sĩ',
    nameEn: 'Master Sergeant',
    xpRequired: 700,
    xpDeltaFromPrevious: 250,
  },
  {
    orderFromTop: 12,
    tier: 6,
    code: 'THIEU_UY',
    nameVi: 'Thiếu úy',
    nameEn: 'Second Lieutenant',
    xpRequired: 1000,
    xpDeltaFromPrevious: 300,
  },
  {
    orderFromTop: 11,
    tier: 7,
    code: 'TRUNG_UY',
    nameVi: 'Trung úy',
    nameEn: 'First Lieutenant',
    xpRequired: 1400,
    xpDeltaFromPrevious: 400,
  },
  {
    orderFromTop: 10,
    tier: 8,
    code: 'THUONG_UY',
    nameVi: 'Thượng úy',
    nameEn: 'Senior Lieutenant',
    xpRequired: 1900,
    xpDeltaFromPrevious: 500,
  },
  {
    orderFromTop: 9,
    tier: 9,
    code: 'DAI_UY',
    nameVi: 'Đại úy',
    nameEn: 'Captain',
    xpRequired: 2500,
    xpDeltaFromPrevious: 600,
  },
  {
    orderFromTop: 8,
    tier: 10,
    code: 'THIEU_TA',
    nameVi: 'Thiếu tá',
    nameEn: 'Major',
    xpRequired: 3300,
    xpDeltaFromPrevious: 800,
  },
  {
    orderFromTop: 7,
    tier: 11,
    code: 'TRUNG_TA',
    nameVi: 'Trung tá',
    nameEn: 'Lieutenant Colonel',
    xpRequired: 4300,
    xpDeltaFromPrevious: 1000,
  },
  {
    orderFromTop: 6,
    tier: 12,
    code: 'THUONG_TA',
    nameVi: 'Thượng tá',
    nameEn: 'Senior Colonel',
    xpRequired: 5500,
    xpDeltaFromPrevious: 1200,
  },
  {
    orderFromTop: 5,
    tier: 13,
    code: 'DAI_TA',
    nameVi: 'Đại tá',
    nameEn: 'Colonel',
    xpRequired: 7000,
    xpDeltaFromPrevious: 1500,
  },
  {
    orderFromTop: 4,
    tier: 14,
    code: 'THIEU_TUONG',
    nameVi: 'Thiếu tướng',
    nameEn: 'Major General',
    xpRequired: 8800,
    xpDeltaFromPrevious: 1800,
  },
  {
    orderFromTop: 3,
    tier: 15,
    code: 'TRUNG_TUONG',
    nameVi: 'Trung tướng',
    nameEn: 'Lieutenant General',
    xpRequired: 11000,
    xpDeltaFromPrevious: 2200,
  },
  {
    orderFromTop: 2,
    tier: 16,
    code: 'THUONG_TUONG',
    nameVi: 'Thượng tướng',
    nameEn: ' Colonel General',
    xpRequired: 13500,
    xpDeltaFromPrevious: 2500,
  },
  {
    orderFromTop: 1,
    tier: 17,
    code: 'DAI_TUONG',
    nameVi: 'Đại tướng',
    nameEn: 'General of the Army',
    xpRequired: 16500,
    xpDeltaFromPrevious: 3000,
  },
];

export const OFFICIAL_MILITARY_RANKS_ASC: ReadonlyArray<MilitaryRankDefinition> = Object.freeze(
  RAW_MILITARY_RANKS_ASC.map((entry) =>
    Object.freeze({
      ...entry,
      nameEn: entry.nameEn.trim(),
    })
  )
);

export const OFFICIAL_MILITARY_RANKS_DESC: ReadonlyArray<MilitaryRankDefinition> = Object.freeze(
  [...OFFICIAL_MILITARY_RANKS_ASC].reverse()
);

export const MAX_MILITARY_RANK_XP_REQUIRED = 16500; // Đại tướng

export function getOfficialMilitaryRankTableAsc(): ReadonlyArray<MilitaryRankDefinition> {
  return OFFICIAL_MILITARY_RANKS_ASC;
}

export function getOfficialMilitaryRankTableDesc(): ReadonlyArray<MilitaryRankDefinition> {
  return OFFICIAL_MILITARY_RANKS_DESC;
}

// Legacy mathematical constants retained for backwards-compatible internal regression tests
export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = 50;
export const LEVEL_BASE_STEP_XP = 100;
export const MAX_STAGE_ENEMY_COUNT = ENEMY_CONFIG.TOTAL_COUNT; // 30 enemies per campaign stage
export const MAX_STAGE_COMBAT_XP = MAX_STAGE_ENEMY_COUNT * SCORE_VALUES.ARMOR; // 30 * 5 = 150 XP
export const MAX_STAGE_ACHIEVEMENT_BONUS_XP = 25; // +10 (no life lost) or +15 (<= 1/2 time) or +25 (both)
export const MAX_SINGLE_STAGE_XP = MAX_STAGE_COMBAT_XP + MAX_STAGE_ACHIEVEMENT_BONUS_XP; // 175 XP

export const ALLOWED_ACHIEVEMENT_BONUS_VALUES: ReadonlySet<number> = new Set([0, 10, 15, 25]);

export interface LevelThresholdEntry {
  level: number;
  xpRequired: number;
  xpDeltaFromPrevious: number;
}

export function xpRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < MIN_PLAYER_LEVEL || level > MAX_PLAYER_LEVEL) {
    throw new RangeError(
      `Invalid target level: ${String(level)}. Level must be an integer between ${MIN_PLAYER_LEVEL} and ${MAX_PLAYER_LEVEL}.`
    );
  }
  return 50 * level * (level - 1);
}

const OFFICIAL_LEVEL_THRESHOLD_TABLE: ReadonlyArray<LevelThresholdEntry> = Object.freeze(
  Array.from({ length: MAX_PLAYER_LEVEL }, (_, idx) => {
    const level = idx + 1;
    const xpRequired = xpRequiredForLevel(level);
    const prevXp = level === 1 ? 0 : xpRequiredForLevel(level - 1);
    return Object.freeze({
      level,
      xpRequired,
      xpDeltaFromPrevious: xpRequired - prevXp,
    });
  })
);

export const MAX_LEVEL_XP_REQUIRED = xpRequiredForLevel(MAX_PLAYER_LEVEL); // 122,500 XP

export function getOfficialLevelThresholdTable(): ReadonlyArray<LevelThresholdEntry> {
  return OFFICIAL_LEVEL_THRESHOLD_TABLE;
}

export type XpValidationErrorCode =
  | 'XP_NOT_NUMBER'
  | 'XP_NAN_OR_INFINITE'
  | 'XP_NEGATIVE'
  | 'XP_NON_INTEGER'
  | 'XP_UNSAFE_INTEGER';

export interface XpValidationResult {
  valid: boolean;
  sanitizedXp: number | null;
  errorCode?: XpValidationErrorCode;
  errorMessage?: string;
}

/**
 * Strictly validates that an XP value is a non-negative safe integer (`0 <= X <= Number.MAX_SAFE_INTEGER`).
 * Rejects negative numbers, NaN, Infinity, floats (`100.5`), strings, booleans, null, and undefined.
 */
export function validateTotalXpValue(rawXp: unknown): XpValidationResult {
  if (typeof rawXp !== 'number') {
    return {
      valid: false,
      sanitizedXp: null,
      errorCode: 'XP_NOT_NUMBER',
      errorMessage: 'Giá trị XP phải là kiểu số nguyên không âm.',
    };
  }
  if (!Number.isFinite(rawXp) || Number.isNaN(rawXp)) {
    return {
      valid: false,
      sanitizedXp: null,
      errorCode: 'XP_NAN_OR_INFINITE',
      errorMessage: 'Giá trị XP không được là NaN hoặc vô cực.',
    };
  }
  if (rawXp < 0) {
    return {
      valid: false,
      sanitizedXp: null,
      errorCode: 'XP_NEGATIVE',
      errorMessage: 'Giá trị XP không được nhỏ hơn 0.',
    };
  }
  if (!Number.isInteger(rawXp)) {
    return {
      valid: false,
      sanitizedXp: null,
      errorCode: 'XP_NON_INTEGER',
      errorMessage: 'Giá trị XP phải là số nguyên (không chấp nhận số thập phân).',
    };
  }
  if (!Number.isSafeInteger(rawXp)) {
    return {
      valid: false,
      sanitizedXp: null,
      errorCode: 'XP_UNSAFE_INTEGER',
      errorMessage: 'Giá trị XP vượt ngưỡng số nguyên an toàn (MAX_SAFE_INTEGER).',
    };
  }
  return {
    valid: true,
    sanitizedXp: rawXp,
  };
}

/**
 * Calculates the official Military Rank (1..17) from a validated non-negative integer `totalXp`.
 *
 * Rules (Section 2.2 & 2.3):
 * - Starts at `Binh nhì` (`0 XP`, `tier = 1`, `orderFromTop = 17`).
 * - Highest rank is `Đại tướng` (`>= 16,500 XP`, `tier = 17`, `orderFromTop = 1`).
 * - Always resolves to the highest rank whose `xpRequired <= totalXp`, supporting multi-rank jumps.
 */
export function calculateMilitaryRankFromTotalXp(totalXp: number): MilitaryRankDefinition {
  const check = validateTotalXpValue(totalXp);
  if (!check.valid || check.sanitizedXp === null) {
    throw new TypeError(check.errorMessage || `Invalid totalXp: ${String(totalXp)}`);
  }
  const x = check.sanitizedXp;
  for (let i = OFFICIAL_MILITARY_RANKS_ASC.length - 1; i >= 0; i--) {
    if (x >= OFFICIAL_MILITARY_RANKS_ASC[i].xpRequired) {
      return OFFICIAL_MILITARY_RANKS_ASC[i];
    }
  }
  return OFFICIAL_MILITARY_RANKS_ASC[0];
}

export interface StarEconomySnapshot {
  /** Cumulative validated XP */
  totalXp: number;
  /** Total Stars earned from XP at `25 XP = 1 Sao ⭐` */
  starBalance: number;
  /** Remainder XP (`0..24`) carried forward toward the next Star */
  unconvertedXp: number;
  /** XP needed (`1..25`) to earn the next Star */
  xpToNextStar: number;
}

/**
 * Computes the official Star (`Sao ⭐`) economy state from a validated non-negative integer `totalXp`.
 * Conversion rule (Section 3.1): `25 XP = 1 Sao ⭐`.
 * - `starBalance = Math.floor(totalXp / 25)`
 * - `unconvertedXp = totalXp % 25` (0..24)
 * - `xpToNextStar = 25 - unconvertedXp`
 */
export function computeStarEconomyFromTotalXp(totalXp: number): StarEconomySnapshot {
  const check = validateTotalXpValue(totalXp);
  if (!check.valid || check.sanitizedXp === null) {
    throw new TypeError(check.errorMessage || `Invalid totalXp: ${String(totalXp)}`);
  }
  const x = check.sanitizedXp;
  const starBalance = Math.floor(x / XP_PER_STAR);
  const unconvertedXp = x % XP_PER_STAR;
  const xpToNextStar = XP_PER_STAR - unconvertedXp;
  return {
    totalXp: x,
    starBalance,
    unconvertedXp,
    xpToNextStar,
  };
}

export interface StageAchievementBonusInput {
  /** True only when the stage is cleared (all 30 enemies defeated and Base intact) */
  isStageClear: boolean;
  /** Number of lives lost by the player during this stage (`startingLives - remainingLives`, >= 0) */
  livesLost: number;
  /** Actual elapsed gameplay time in seconds for this stage */
  stageElapsedSeconds: number;
  /** Total allowed match duration in seconds for the current difficulty (e.g. 120s DEFAULT, 60s EXTREME) */
  matchDurationSeconds: number;
}

export interface StageAchievementBonusBreakdown {
  isStageClear: boolean;
  noLivesLostAchieved: boolean;
  halfTimeAchieved: boolean;
  bothAchieved: boolean;
  bonusXp: 0 | 10 | 15 | 25;
  labelVi: string;
  labelEn: string;
}

/**
 * Calculates the Stage Completion Achievement Bonus XP (Section 5 of BTO-PROGRESSION-MODES-V1.4):
 * - Only awarded on Stage Clear (`isStageClear === true`).
 * - Condition 1 (`noLivesLostAchieved`): `livesLost === 0` -> `+10 XP`.
 * - Condition 2 (`halfTimeAchieved`): `stageElapsedSeconds <= matchDurationSeconds / 2` -> `+15 XP`.
 * - If BOTH Condition 1 and Condition 2 are met in the same stage -> `+25 XP` (max bonus is +25 XP).
 * - Otherwise -> `0 XP`.
 */
export function calculateStageAchievementBonus(
  input: StageAchievementBonusInput
): StageAchievementBonusBreakdown {
  if (!input.isStageClear) {
    return {
      isStageClear: false,
      noLivesLostAchieved: false,
      halfTimeAchieved: false,
      bothAchieved: false,
      bonusXp: 0,
      labelVi: 'Không có thưởng thành tích (Chưa qua màn)',
      labelEn: 'No achievement bonus (Stage not cleared)',
    };
  }

  const safeLivesLost =
    typeof input.livesLost === 'number' && Number.isFinite(input.livesLost) && input.livesLost >= 0
      ? Math.floor(input.livesLost)
      : 99;
  const safeDuration =
    typeof input.matchDurationSeconds === 'number' &&
    Number.isFinite(input.matchDurationSeconds) &&
    input.matchDurationSeconds > 0
      ? input.matchDurationSeconds
      : 120;
  const safeElapsed =
    typeof input.stageElapsedSeconds === 'number' &&
    Number.isFinite(input.stageElapsedSeconds) &&
    input.stageElapsedSeconds >= 0
      ? input.stageElapsedSeconds
      : safeDuration;

  const noLivesLostAchieved = safeLivesLost === 0;
  const halfTimeAchieved = safeElapsed <= safeDuration / 2;
  const bothAchieved = noLivesLostAchieved && halfTimeAchieved;

  if (bothAchieved) {
    return {
      isStageClear: true,
      noLivesLostAchieved: true,
      halfTimeAchieved: true,
      bothAchieved: true,
      bonusXp: 25,
      labelVi: 'Hoàn hảo: Không mất mạng & hoàn thành ≤ 1/2 thời gian (+25 XP)',
      labelEn: 'Perfect: No lives lost & completed in ≤ 1/2 time (+25 XP)',
    };
  }

  if (halfTimeAchieved) {
    return {
      isStageClear: true,
      noLivesLostAchieved: false,
      halfTimeAchieved: true,
      bothAchieved: false,
      bonusXp: 15,
      labelVi: 'Tốc chiến: Hoàn thành trong ≤ 1/2 thời gian (+15 XP)',
      labelEn: 'Speed Clear: Completed in ≤ 1/2 time (+15 XP)',
    };
  }

  if (noLivesLostAchieved) {
    return {
      isStageClear: true,
      noLivesLostAchieved: true,
      halfTimeAchieved: false,
      bothAchieved: false,
      bonusXp: 10,
      labelVi: 'Bất khả xâm phạm: Hoàn thành không mất mạng (+10 XP)',
      labelEn: 'Untouchable: Completed without losing a life (+10 XP)',
    };
  }

  return {
    isStageClear: true,
    noLivesLostAchieved: false,
    halfTimeAchieved: false,
    bothAchieved: false,
    bonusXp: 0,
    labelVi: 'Hoàn thành màn chơi (+0 XP thưởng thêm)',
    labelEn: 'Stage cleared (+0 bonus XP)',
  };
}

export function calculateLevelFromTotalXp(totalXp: number): number {
  const check = validateTotalXpValue(totalXp);
  if (!check.valid || check.sanitizedXp === null) {
    throw new TypeError(check.errorMessage || `Invalid totalXp: ${String(totalXp)}`);
  }
  const x = check.sanitizedXp;
  if (x >= MAX_LEVEL_XP_REQUIRED) {
    return MAX_PLAYER_LEVEL;
  }
  if (x === 0) {
    return MIN_PLAYER_LEVEL;
  }

  let level = Math.min(
    MAX_PLAYER_LEVEL,
    Math.floor((1 + Math.sqrt(1 + (8 * x) / LEVEL_BASE_STEP_XP)) / 2)
  );
  if (level < MIN_PLAYER_LEVEL) {
    level = MIN_PLAYER_LEVEL;
  }
  while (level < MAX_PLAYER_LEVEL && x >= OFFICIAL_LEVEL_THRESHOLD_TABLE[level].xpRequired) {
    level += 1;
  }
  while (level > MIN_PLAYER_LEVEL && x < OFFICIAL_LEVEL_THRESHOLD_TABLE[level - 1].xpRequired) {
    level -= 1;
  }
  return level;
}

export type XpVerificationStatus = 'VERIFIED' | 'UNVERIFIED';

export interface PlayerLevelProgressInfo {
  xpVerificationStatus: XpVerificationStatus;
  /** Military rank tier 1..17 (1 = Binh nhì, 17 = Đại tướng); `null` when unverified */
  rankTier: number | null;
  /** Official table index 1..17 from top (1 = Đại tướng, 17 = Binh nhì); `null` when unverified */
  rankOrderFromTop: number | null;
  rankCode: MilitaryRankCode | null;
  rankNameVi: string;
  rankNameEn: string;
  nextRankNameVi: string | null;
  nextRankNameEn: string | null;
  isMaxRank: boolean;
  /** Current Military Rank floor XP (`null` when unverified) */
  rankFloorXp: number | null;
  /** Next Military Rank XP threshold (`null` when unverified OR when at `Đại tướng` 16,500 XP) */
  rankXpNext: number | null;
  /** XP remaining to reach the next Military Rank (`null` when unverified; `0` at `Đại tướng`) */
  rankXpRemaining: number | null;
  /** Progress percentage `0..100` toward the next Military Rank (`100` at `Đại tướng`) */
  rankProgressPercent: number;
  /** Top menu / profile Military Rank badge (`Binh nhì` .. `Đại tướng` or `Chưa xác minh`) */
  rankBadge: string;
  /** Star economy fields (`25 XP = 1 Sao ⭐`) */
  starBalance: number;
  unconvertedXp: number;
  xpToNextStar: number;
  /** Legacy numeric level fields retained internally for backwards-compatible harnesses */
  level: number | null;
  isMaxLevel: boolean;
  topMenuBadge: string;
  systemLabel: string;
  totalXp: number | null;
  currentLevelFloorXp: number | null;
  xpNext: number | null;
  xpRemaining: number | null;
  progressPercent: number;
}

/**
 * Computes full UI-ready Military Rank (1..17) & Star Economy metadata (BTO-PROGRESSION-MODES-V1.4 Sections 2 & 3).
 * - If `xpVerificationStatus !== 'VERIFIED'` or `totalXp` is invalid: returns `'Chưa xác minh'` without
 *   resetting or faking `'Binh nhì'` or `0 XP`.
 * - If verified with `totalXp === 0`: returns `'Binh nhì'`, `rankXpNext = 100` (`Binh nhất`), `rankXpRemaining = 100`, `rankProgressPercent = 0`.
 * - If verified with `totalXp >= 16_500`: returns `'Đại tướng'`, `isMaxRank = true`, `rankXpNext = null`,
 *   `rankXpRemaining = 0`, `rankProgressPercent = 100`.
 */
export function computePlayerLevelProgress(
  rawTotalXp: unknown,
  xpVerificationStatus: XpVerificationStatus
): PlayerLevelProgressInfo {
  if (xpVerificationStatus !== 'VERIFIED') {
    return {
      xpVerificationStatus: 'UNVERIFIED',
      rankTier: null,
      rankOrderFromTop: null,
      rankCode: null,
      rankNameVi: 'Chưa xác minh',
      rankNameEn: 'Unverified',
      nextRankNameVi: null,
      nextRankNameEn: null,
      isMaxRank: false,
      rankFloorXp: null,
      rankXpNext: null,
      rankXpRemaining: null,
      rankProgressPercent: 0,
      rankBadge: 'Chưa xác minh',
      starBalance: 0,
      unconvertedXp: 0,
      xpToNextStar: XP_PER_STAR,
      level: null,
      isMaxLevel: false,
      topMenuBadge: 'Lv. --',
      systemLabel: 'Chưa xác minh XP',
      totalXp: null,
      currentLevelFloorXp: null,
      xpNext: null,
      xpRemaining: null,
      progressPercent: 0,
    };
  }

  const check = validateTotalXpValue(rawTotalXp);
  if (!check.valid || check.sanitizedXp === null) {
    return {
      xpVerificationStatus: 'UNVERIFIED',
      rankTier: null,
      rankOrderFromTop: null,
      rankCode: null,
      rankNameVi: 'Chưa xác minh',
      rankNameEn: 'Unverified',
      nextRankNameVi: null,
      nextRankNameEn: null,
      isMaxRank: false,
      rankFloorXp: null,
      rankXpNext: null,
      rankXpRemaining: null,
      rankProgressPercent: 0,
      rankBadge: 'Chưa xác minh',
      starBalance: 0,
      unconvertedXp: 0,
      xpToNextStar: XP_PER_STAR,
      level: null,
      isMaxLevel: false,
      topMenuBadge: 'Lv. --',
      systemLabel: 'Dữ liệu XP không hợp lệ (Chờ xác minh)',
      totalXp: null,
      currentLevelFloorXp: null,
      xpNext: null,
      xpRemaining: null,
      progressPercent: 0,
    };
  }

  const totalXp = check.sanitizedXp;
  const rank = calculateMilitaryRankFromTotalXp(totalXp);
  const starInfo = computeStarEconomyFromTotalXp(totalXp);
  const rankFloorXp = rank.xpRequired;
  const isMaxRank = rank.tier === TOTAL_MILITARY_RANKS;
  const nextRank = isMaxRank ? null : OFFICIAL_MILITARY_RANKS_ASC[rank.tier];
  const rankXpNext = nextRank ? nextRank.xpRequired : null;
  const rankXpRemaining = isMaxRank || rankXpNext === null ? 0 : Math.max(0, rankXpNext - totalXp);
  const rankSpan = rankXpNext !== null ? rankXpNext - rankFloorXp : 0;
  const rawRankProgress = isMaxRank
    ? 100
    : rankSpan > 0
      ? ((totalXp - rankFloorXp) / rankSpan) * 100
      : 0;
  const rankProgressPercent = isMaxRank
    ? 100
    : Math.min(100, Math.max(0, Number(rawRankProgress.toFixed(2))));

  const legacyLevel = calculateLevelFromTotalXp(totalXp);
  const isMaxLevel = legacyLevel >= MAX_PLAYER_LEVEL;
  const currentLevelFloorXp = xpRequiredForLevel(legacyLevel);
  const xpNext = isMaxLevel ? null : xpRequiredForLevel(legacyLevel + 1);
  const xpRemaining = isMaxLevel || xpNext === null ? 0 : Math.max(0, xpNext - totalXp);
  const levelSpan = xpNext !== null ? xpNext - currentLevelFloorXp : 0;
  const rawLevelProgress = isMaxLevel
    ? 100
    : levelSpan > 0
      ? ((totalXp - currentLevelFloorXp) / levelSpan) * 100
      : 0;
  const progressPercent = isMaxLevel
    ? 100
    : Math.min(100, Math.max(0, Number(rawLevelProgress.toFixed(2))));

  return {
    xpVerificationStatus: 'VERIFIED',
    rankTier: rank.tier,
    rankOrderFromTop: rank.orderFromTop,
    rankCode: rank.code,
    rankNameVi: rank.nameVi,
    rankNameEn: rank.nameEn,
    nextRankNameVi: nextRank ? nextRank.nameVi : null,
    nextRankNameEn: nextRank ? nextRank.nameEn : null,
    isMaxRank,
    rankFloorXp,
    rankXpNext,
    rankXpRemaining,
    rankProgressPercent,
    rankBadge: rank.nameVi,
    starBalance: starInfo.starBalance,
    unconvertedXp: starInfo.unconvertedXp,
    xpToNextStar: starInfo.xpToNextStar,
    level: legacyLevel,
    isMaxLevel,
    topMenuBadge: `Lv. ${legacyLevel}`,
    systemLabel: isMaxLevel
      ? `Lv. ${legacyLevel} (MAX LEVEL)`
      : `Lv. ${legacyLevel} / ${MAX_PLAYER_LEVEL}`,
    totalXp,
    currentLevelFloorXp,
    xpNext,
    xpRemaining,
    progressPercent,
  };
}

// =============================================================================
// XP EVENT VALIDATION, IDEMPOTENT LEDGER, TAMPER DETECTION & AUDIT LOGGING
// =============================================================================

export type XpGrantSource =
  | 'SOLO_BATTLE'
  | 'COOP_AI_BATTLE'
  | 'COOP_ONLINE_BATTLE'
  | 'FIRESTORE_SYNC';

export interface EnemyDefeatBreakdown {
  BASIC: number;
  FAST: number;
  POWER: number;
  ARMOR: number;
}

export interface BattleXpGrantInput {
  uid: string;
  eventId: string;
  source: XpGrantSource;
  stageId: number;
  gameMode: string;
  earnedXp: number;
  defeatedByType: Partial<EnemyDefeatBreakdown>;
  /** Optional Stage Completion Achievement Bonus XP (`0 | 10 | 15 | 25`, only allowed on Stage Clear) */
  achievementBonusXp?: number;
  roomCode?: string | null;
  timestampMs?: number;
}

export type XpGrantRejectionCode =
  | 'INVALID_UID'
  | 'INVALID_EVENT_ID'
  | 'INVALID_SOURCE'
  | 'INVALID_STAGE_ID'
  | 'INVALID_XP_VALUE'
  | 'INVALID_ENEMY_BREAKDOWN'
  | 'ENEMY_COUNT_EXCEEDS_STAGE_CAP'
  | 'INVALID_ACHIEVEMENT_BONUS_XP'
  | 'XP_MISMATCH_ENEMY_FORMULA'
  | 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN'
  | 'MULTI_TAB_CONFLICT_DETECTED';

export interface ValidatedXpLedgerEvent {
  eventId: string;
  uid: string;
  source: XpGrantSource;
  stageId: number;
  gameMode: string;
  deltaXp: number;
  combatXp?: number;
  achievementBonusXp?: number;
  enemyBreakdown: EnemyDefeatBreakdown;
  roomCode: string | null;
  timestampMs: number;
  eventDigest: string;
}

export interface XpGrantExecutionResult {
  accepted: boolean;
  duplicateIgnored: boolean;
  rejectionCode?: XpGrantRejectionCode;
  rejectionMessage?: string;
  uid: string;
  eventId: string;
  previousTotalXp: number | null;
  newTotalXp: number | null;
  previousLevel: number | null;
  newLevel: number | null;
  levelChanged: boolean;
  previousRankCode: MilitaryRankCode | null;
  newRankCode: MilitaryRankCode | null;
  previousRankNameVi: string | null;
  newRankNameVi: string | null;
  rankPromoted: boolean;
  previousStarBalance: number;
  newStarBalance: number;
  starsEarnedThisGrant: number;
  newUnconvertedXp: number;
}

export type LevelDiscrepancyCode =
  | 'INVALID_TOTAL_XP_TYPE'
  | 'INVALID_LEGACY_XP_TYPE'
  | 'TOTAL_XP_LEGACY_XP_CONFLICT'
  | 'INVALID_STORED_LEVEL_TYPE'
  | 'STORED_LEVEL_OUT_OF_RANGE'
  | 'STORED_LEVEL_MISMATCH_FORMULA';

export interface UserLevelConsistencyAuditEntry {
  uid: string;
  email: string | null;
  displayName: string | null;
  storedTotalXp: unknown;
  legacyXp: unknown;
  resolvedVerifiedTotalXp: number | null;
  storedLevel: unknown;
  expectedLevel: number | null;
  expectedRankCode: MilitaryRankCode | null;
  expectedRankNameVi: string | null;
  expectedStarBalance: number | null;
  isConsistent: boolean;
  discrepancyCodes: LevelDiscrepancyCode[];
  discrepancySummary: string;
  detectedAtMs: number;
}

export interface LedgerMultiTabConflictInfo {
  uid: string;
  detectedAtMs: number;
  reasonCode:
    | 'CONFLICTING_CLOUD_BASELINE'
    | 'CONFLICTING_EVENT_PAYLOAD'
    | 'CONFLICTING_EVENT_DIGEST'
    | 'STORAGE_TAMPER_OR_CORRUPTED';
  message: string;
  localRevision: number;
  remoteRevision: number;
}

interface PersistedUserLevelLedger {
  schemaVersion: 'M7.5.2-LEDGER-V1';
  uid: string;
  revision: number;
  lastCloudSyncAtMs: number | null;
  cloudBaselineXp: number | null;
  cloudCommittedEventIds: string[];
  hasVerifiedZeroBaselineSession: boolean;
  events: ValidatedXpLedgerEvent[];
  signature: string;
}

export const LEDGER_STORAGE_PREFIX = 'bantank_m752_level_ledger_v1_';
const EVENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{6,160}$/;
const ALLOWED_XP_SOURCES = new Set<XpGrantSource>([
  'SOLO_BATTLE',
  'COOP_AI_BATTLE',
  'COOP_ONLINE_BATTLE',
  'FIRESTORE_SYNC',
]);

/**
 * Builds deterministic XP event identifiers using `matchInstanceId` + `stageId` + `stageRunSeq` + `outcome`.
 * Note: `matchInstanceId` is a client-side match identifier to prevent cross-match collisions; it is NOT server proof.
 */
export function buildBattleXpIdentifiers(params: {
  uid: string;
  gameMode: string;
  matchInstanceId: string;
  stageId: number;
  stageRunSeq: number;
  outcome: 'WIN' | 'LOSS';
  roomCode?: string | null;
}): { runKey: string; xpEventId: string } {
  const safeUid = String(params.uid || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 48);
  const safeMode = String(params.gameMode || 'SOLO')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const safeRoom = params.roomCode
    ? String(params.roomCode).trim().replace(/[^A-Za-z0-9_-]/g, '_')
    : 'local';
  const safeMatchId = String(params.matchInstanceId || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 36);
  if (!safeMatchId) {
    throw new Error('Missing matchInstanceId when building battle XP identifiers.');
  }
  const runKey = `${safeMode}:${safeRoom}:m_${safeMatchId}:st${params.stageId}:run${params.stageRunSeq}:${params.outcome}`;
  const xpEventId = `xp_${safeUid}_${runKey.replace(/[^A-Za-z0-9_.:-]/g, '_')}`.slice(0, 160);
  return { runKey, xpEventId };
}

function computeEventDigest(ev: Omit<ValidatedXpLedgerEvent, 'eventDigest'>): string {
  const bonusSuffix =
    typeof ev.achievementBonusXp === 'number' && ev.achievementBonusXp > 0
      ? `|BONUS:${ev.achievementBonusXp}`
      : '';
  return computeCanonicalChecksum(
    [
      'M752_EV',
      ev.uid,
      ev.eventId,
      ev.source,
      String(ev.stageId),
      ev.gameMode,
      String(ev.deltaXp),
      `${ev.enemyBreakdown.BASIC},${ev.enemyBreakdown.FAST},${ev.enemyBreakdown.POWER},${ev.enemyBreakdown.ARMOR}`,
      ev.roomCode ?? '',
    ].join('|') + bonusSuffix
  );
}

function computeLedgerSignature(
  ledger: Omit<PersistedUserLevelLedger, 'signature'>
): string {
  const eventsChain = ledger.events
    .map((e) => `${e.eventId}:${e.deltaXp}:${e.eventDigest}`)
    .join(';');
  const committedChain = [...ledger.cloudCommittedEventIds].sort().join(',');
  return computeCanonicalChecksum(
    [
      ledger.schemaVersion,
      ledger.uid,
      String(ledger.revision),
      ledger.lastCloudSyncAtMs === null ? 'null' : String(ledger.lastCloudSyncAtMs),
      ledger.cloudBaselineXp === null ? 'null' : String(ledger.cloudBaselineXp),
      ledger.hasVerifiedZeroBaselineSession ? '1' : '0',
      committedChain,
      eventsChain,
    ].join('||')
  );
}

/**
 * Validates a battle XP grant against all BTO-PROGRESSION-MODES-V1.4 & M7.5.2 rules:
 * - Valid `uid`, `eventId`, `stageId` (`1..10`), and `source`.
 * - Non-negative integer counts for `BASIC`, `FAST`, `POWER`, `ARMOR` with total `<= 30`.
 * - Optional `achievementBonusXp` must be one of `0, 10, 15, 25`.
 * - Exact match with official enemy XP values + approved stage achievement bonus:
 *   `1*BASIC + 2*FAST + 3*POWER + 5*ARMOR + achievementBonusXp === earnedXp`.
 */
export function validateBattleXpGrantInput(input: BattleXpGrantInput): {
  valid: boolean;
  rejectionCode?: XpGrantRejectionCode;
  rejectionMessage?: string;
  normalizedEvent?: ValidatedXpLedgerEvent;
} {
  const uid = typeof input.uid === 'string' ? input.uid.trim() : '';
  if (!uid) {
    return {
      valid: false,
      rejectionCode: 'INVALID_UID',
      rejectionMessage: 'Thiếu UID hợp lệ khi ghi nhận XP.',
    };
  }

  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return {
      valid: false,
      rejectionCode: 'INVALID_EVENT_ID',
      rejectionMessage: 'Mã sự kiện XP (eventId) không hợp lệ hoặc thiếu định danh chống cộng trùng.',
    };
  }

  if (!ALLOWED_XP_SOURCES.has(input.source)) {
    return {
      valid: false,
      rejectionCode: 'INVALID_SOURCE',
      rejectionMessage: `Nguồn phát sinh XP không hợp lệ: ${String(input.source)}.`,
    };
  }

  if (!Number.isInteger(input.stageId) || input.stageId < 1 || input.stageId > 10) {
    return {
      valid: false,
      rejectionCode: 'INVALID_STAGE_ID',
      rejectionMessage: `Stage ID không hợp lệ (${String(input.stageId)}). Chỉ chấp nhận Stage 1–10.`,
    };
  }

  const xpCheck = validateTotalXpValue(input.earnedXp);
  if (!xpCheck.valid || xpCheck.sanitizedXp === null) {
    return {
      valid: false,
      rejectionCode: 'INVALID_XP_VALUE',
      rejectionMessage: xpCheck.errorMessage || 'Giá trị XP trận đấu không hợp lệ.',
    };
  }

  const rawB = input.defeatedByType?.BASIC ?? 0;
  const rawF = input.defeatedByType?.FAST ?? 0;
  const rawP = input.defeatedByType?.POWER ?? 0;
  const rawA = input.defeatedByType?.ARMOR ?? 0;

  for (const c of [rawB, rawF, rawP, rawA]) {
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || !Number.isSafeInteger(c)) {
      return {
        valid: false,
        rejectionCode: 'INVALID_ENEMY_BREAKDOWN',
        rejectionMessage: 'Số lượng từng loại xe địch tiêu diệt phải là số nguyên không âm.',
      };
    }
  }

  const totalDefeated = rawB + rawF + rawP + rawA;
  if (totalDefeated > MAX_STAGE_ENEMY_COUNT) {
    return {
      valid: false,
      rejectionCode: 'ENEMY_COUNT_EXCEEDS_STAGE_CAP',
      rejectionMessage: `Tổng xe địch tiêu diệt (${totalDefeated}) vượt trần tối đa ${MAX_STAGE_ENEMY_COUNT} xe/Stage.`,
    };
  }

  const rawBonus = input.achievementBonusXp ?? 0;
  if (
    typeof rawBonus !== 'number' ||
    !Number.isInteger(rawBonus) ||
    !ALLOWED_ACHIEVEMENT_BONUS_VALUES.has(rawBonus)
  ) {
    return {
      valid: false,
      rejectionCode: 'INVALID_ACHIEVEMENT_BONUS_XP',
      rejectionMessage: `XP thưởng thành tích (${String(rawBonus)}) không hợp lệ. Chỉ chấp nhận 0, 10, 15 hoặc 25 XP.`,
    };
  }

  const combatXp =
    rawB * SCORE_VALUES.BASIC +
    rawF * SCORE_VALUES.FAST +
    rawP * SCORE_VALUES.POWER +
    rawA * SCORE_VALUES.ARMOR;

  const expectedFormulaXp = combatXp + rawBonus;

  if (xpCheck.sanitizedXp !== expectedFormulaXp || xpCheck.sanitizedXp > MAX_SINGLE_STAGE_XP) {
    return {
      valid: false,
      rejectionCode: 'XP_MISMATCH_ENEMY_FORMULA',
      rejectionMessage: `XP cộng thêm (${xpCheck.sanitizedXp}) không khớp công thức hợp lệ (${expectedFormulaXp} XP = ${combatXp} XP diệt địch + ${rawBonus} XP thưởng thành tích).`,
    };
  }

  const nowMs =
    typeof input.timestampMs === 'number' && Number.isFinite(input.timestampMs) && input.timestampMs > 0
      ? Math.floor(input.timestampMs)
      : Date.now();

  const baseEv: Omit<ValidatedXpLedgerEvent, 'eventDigest'> = {
    eventId,
    uid,
    source: input.source,
    stageId: input.stageId,
    gameMode: String(input.gameMode || 'SOLO').slice(0, 40),
    deltaXp: xpCheck.sanitizedXp,
    combatXp,
    achievementBonusXp: rawBonus,
    enemyBreakdown: {
      BASIC: rawB,
      FAST: rawF,
      POWER: rawP,
      ARMOR: rawA,
    },
    roomCode: input.roomCode ? String(input.roomCode).slice(0, 20) : null,
    timestampMs: nowMs,
  };

  return {
    valid: true,
    normalizedEvent: {
      ...baseEv,
      eventDigest: computeEventDigest(baseEv),
    },
  };
}

/**
 * Audits a `/users/{uid}` Firestore document for `totalXp` / `xp` / `level` / `rank` consistency
 * WITHOUT mutating or overwriting Firestore data.
 */
export function auditUserDocumentLevelConsistency(
  uid: string,
  rawDoc: Record<string, unknown> | null | undefined,
  detectedAtMs = Date.now()
): UserLevelConsistencyAuditEntry {
  const cleanUid = String(uid || '').trim();
  const docObj = rawDoc ?? {};
  const email = typeof docObj.email === 'string' ? docObj.email : null;
  const displayName = typeof docObj.displayName === 'string' ? docObj.displayName : null;

  const hasTotalXp = Object.prototype.hasOwnProperty.call(docObj, 'totalXp') && docObj.totalXp !== undefined;
  const hasLegacyXp = Object.prototype.hasOwnProperty.call(docObj, 'xp') && docObj.xp !== undefined;
  const hasStoredLevel = Object.prototype.hasOwnProperty.call(docObj, 'level') && docObj.level !== undefined;

  const discrepancyCodes: LevelDiscrepancyCode[] = [];
  let validTotalXp: number | null = null;
  let validLegacyXp: number | null = null;

  if (hasTotalXp) {
    const check = validateTotalXpValue(docObj.totalXp);
    if (check.valid && check.sanitizedXp !== null) {
      validTotalXp = check.sanitizedXp;
    } else {
      discrepancyCodes.push('INVALID_TOTAL_XP_TYPE');
    }
  }

  if (hasLegacyXp) {
    const check = validateTotalXpValue(docObj.xp);
    if (check.valid && check.sanitizedXp !== null) {
      validLegacyXp = check.sanitizedXp;
    } else {
      discrepancyCodes.push('INVALID_LEGACY_XP_TYPE');
    }
  }

  if (validTotalXp !== null && validLegacyXp !== null && validTotalXp !== validLegacyXp) {
    discrepancyCodes.push('TOTAL_XP_LEGACY_XP_CONFLICT');
  }

  let resolvedVerifiedTotalXp: number | null = null;
  if (validTotalXp !== null) {
    resolvedVerifiedTotalXp = validTotalXp;
  } else if (validLegacyXp !== null) {
    resolvedVerifiedTotalXp = validLegacyXp;
  } else if (!hasTotalXp && !hasLegacyXp) {
    resolvedVerifiedTotalXp = 0;
  }

  const expectedLevel =
    resolvedVerifiedTotalXp !== null ? calculateLevelFromTotalXp(resolvedVerifiedTotalXp) : null;
  const expectedRank =
    resolvedVerifiedTotalXp !== null ? calculateMilitaryRankFromTotalXp(resolvedVerifiedTotalXp) : null;
  const expectedStar =
    resolvedVerifiedTotalXp !== null ? computeStarEconomyFromTotalXp(resolvedVerifiedTotalXp) : null;

  if (hasStoredLevel && docObj.level !== null) {
    const rawLv = docObj.level;
    if (typeof rawLv !== 'number' || !Number.isFinite(rawLv) || !Number.isInteger(rawLv)) {
      discrepancyCodes.push('INVALID_STORED_LEVEL_TYPE');
    } else if (rawLv < MIN_PLAYER_LEVEL || rawLv > MAX_PLAYER_LEVEL) {
      discrepancyCodes.push('STORED_LEVEL_OUT_OF_RANGE');
    } else if (expectedLevel !== null && rawLv !== expectedLevel) {
      discrepancyCodes.push('STORED_LEVEL_MISMATCH_FORMULA');
    }
  }

  const isConsistent = discrepancyCodes.length === 0;
  const discrepancySummary = isConsistent
    ? `Hợp lệ (XP=${resolvedVerifiedTotalXp ?? 0} -> ${expectedRank?.nameVi ?? 'Binh nhì'} • ${expectedStar?.starBalance ?? 0} Sao)`
    : `Phát hiện bất nhất [${discrepancyCodes.join(', ')}]: storedLevel=${JSON.stringify(
        docObj.level
      )}, totalXp=${JSON.stringify(docObj.totalXp)}, legacyXp=${JSON.stringify(
        docObj.xp
      )} -> expectedRank=${expectedRank ? expectedRank.nameVi : 'UNVERIFIED'}`;

  return {
    uid: cleanUid,
    email,
    displayName,
    storedTotalXp: hasTotalXp ? docObj.totalXp : undefined,
    legacyXp: hasLegacyXp ? docObj.xp : undefined,
    resolvedVerifiedTotalXp,
    storedLevel: hasStoredLevel ? docObj.level : undefined,
    expectedLevel,
    expectedRankCode: expectedRank?.code ?? null,
    expectedRankNameVi: expectedRank?.nameVi ?? null,
    expectedStarBalance: expectedStar?.starBalance ?? null,
    isConsistent,
    discrepancyCodes,
    discrepancySummary,
    detectedAtMs,
  };
}

/**
 * Singleton PlayerLevelManager:
 * - Maintains strictly UID-isolated, signature-verified XP ledgers.
 * - Serializes concurrent XP grants per UID (`Promise` queue + synchronous atomic commit)
 *   so concurrent grants never race, lose XP, or double-emit Rank-Up audit logs.
 * - Tracks non-destructive `/users/{uid}` consistency audit entries for Admin review.
 */
export class PlayerLevelManager {
  private static instance: PlayerLevelManager;

  private ledgersByUid = new Map<string, PersistedUserLevelLedger>();
  private lastKnownStorageRawByUid = new Map<string, string | null>();
  private multiTabConflictsByUid = new Map<string, LedgerMultiTabConflictInfo>();
  private consistencyAuditByUid = new Map<string, UserLevelConsistencyAuditEntry>();
  private tamperedUids = new Set<string>();
  private perUidAsyncChains = new Map<string, Promise<unknown>>();
  private externalSyncListeners = new Set<(uid: string) => void>();
  private boundWindowRef: unknown = null;
  private boundStorageHandler: ((ev: StorageEvent) => void) | null = null;

  private constructor() {
    this.ensureWindowStorageListener();
  }

  public static getInstance(): PlayerLevelManager {
    if (!PlayerLevelManager.instance) {
      PlayerLevelManager.instance = new PlayerLevelManager();
    }
    return PlayerLevelManager.instance;
  }

  public static createIsolatedTabInstanceForTesting(): PlayerLevelManager {
    return new PlayerLevelManager();
  }

  public subscribeExternalSync(listener: (uid: string) => void): () => void {
    this.ensureWindowStorageListener();
    this.externalSyncListeners.add(listener);
    return () => {
      this.externalSyncListeners.delete(listener);
    };
  }

  private emitExternalSync(uid: string): void {
    for (const fn of this.externalSyncListeners) {
      try {
        fn(uid);
      } catch {
        // Ignore listener error
      }
    }
  }

  public ensureWindowStorageListener(): void {
    const win =
      typeof globalThis !== 'undefined'
        ? (globalThis as unknown as {
            window?: {
              addEventListener?: (type: string, cb: (ev: StorageEvent) => void) => void;
              removeEventListener?: (type: string, cb: (ev: StorageEvent) => void) => void;
              localStorage?: Storage;
            };
          }).window
        : undefined;
    if (!win || typeof win.addEventListener !== 'function') {
      return;
    }
    if (this.boundWindowRef === win) {
      return;
    }
    if (
      this.boundWindowRef &&
      this.boundStorageHandler &&
      typeof (this.boundWindowRef as { removeEventListener?: (t: string, cb: (e: StorageEvent) => void) => void })
        .removeEventListener === 'function'
    ) {
      (this.boundWindowRef as { removeEventListener: (t: string, cb: (e: StorageEvent) => void) => void }).removeEventListener(
        'storage',
        this.boundStorageHandler
      );
    }

    const handler = (ev: StorageEvent) => {
      if (!ev || typeof ev.key !== 'string') return;
      if (!ev.key.startsWith(LEDGER_STORAGE_PREFIX)) return;
      const targetUid = ev.key.slice(LEDGER_STORAGE_PREFIX.length).trim();
      if (!targetUid) return;
      this.reconcileWithPersistedStorage(targetUid, 'STORAGE_EVENT');
      this.emitExternalSync(targetUid);
    };

    win.addEventListener('storage', handler);
    this.boundWindowRef = win;
    this.boundStorageHandler = handler;
  }

  public getMultiTabConflict(uid: string | null | undefined): LedgerMultiTabConflictInfo | null {
    if (!uid) return null;
    return this.multiTabConflictsByUid.get(uid.trim()) ?? null;
  }

  private createEmptyLedger(uid: string): PersistedUserLevelLedger {
    const base: Omit<PersistedUserLevelLedger, 'signature'> = {
      schemaVersion: 'M7.5.2-LEDGER-V1',
      uid,
      revision: 1,
      lastCloudSyncAtMs: null,
      cloudBaselineXp: null,
      cloudCommittedEventIds: [],
      hasVerifiedZeroBaselineSession: false,
      events: [],
    };
    return {
      ...base,
      signature: computeLedgerSignature(base),
    };
  }

  private verifyPersistedLedgerObject(
    expectedUid: string,
    rawObj: unknown
  ): { valid: boolean; ledger?: PersistedUserLevelLedger; reason?: string } {
    if (!rawObj || typeof rawObj !== 'object') {
      return { valid: false, reason: 'LEDGER_NOT_OBJECT' };
    }
    const candidate = rawObj as Record<string, unknown>;
    if ('totalXp' in candidate || 'level' in candidate || 'rank' in candidate || 'starBalance' in candidate) {
      return { valid: false, reason: 'FORBIDDEN_DIRECT_LEVEL_OR_XP_FIELD_IN_STORAGE' };
    }
    if (candidate.schemaVersion !== 'M7.5.2-LEDGER-V1' || candidate.uid !== expectedUid) {
      return { valid: false, reason: 'LEDGER_SCHEMA_OR_UID_MISMATCH' };
    }
    if (
      typeof candidate.revision !== 'number' ||
      !Number.isInteger(candidate.revision) ||
      candidate.revision < 1
    ) {
      return { valid: false, reason: 'INVALID_LEDGER_REVISION' };
    }
    if (
      candidate.lastCloudSyncAtMs !== null &&
      (typeof candidate.lastCloudSyncAtMs !== 'number' ||
        !Number.isFinite(candidate.lastCloudSyncAtMs) ||
        candidate.lastCloudSyncAtMs < 0)
    ) {
      return { valid: false, reason: 'INVALID_CLOUD_SYNC_TIMESTAMP' };
    }
    if (candidate.cloudBaselineXp !== null) {
      const check = validateTotalXpValue(candidate.cloudBaselineXp);
      if (!check.valid) {
        return { valid: false, reason: 'INVALID_CLOUD_BASELINE_XP' };
      }
    }
    if (
      typeof candidate.hasVerifiedZeroBaselineSession !== 'boolean' ||
      !Array.isArray(candidate.cloudCommittedEventIds) ||
      !Array.isArray(candidate.events) ||
      typeof candidate.signature !== 'string'
    ) {
      return { valid: false, reason: 'INVALID_LEDGER_STRUCTURE' };
    }

    const seenIds = new Set<string>();
    const validatedEvents: ValidatedXpLedgerEvent[] = [];
    for (const rawEv of candidate.events) {
      if (!rawEv || typeof rawEv !== 'object') {
        return { valid: false, reason: 'INVALID_EVENT_OBJECT' };
      }
      const ev = rawEv as ValidatedXpLedgerEvent;
      if (seenIds.has(ev.eventId)) {
        return { valid: false, reason: 'DUPLICATE_EVENT_ID_IN_LEDGER' };
      }
      const check = validateBattleXpGrantInput({
        uid: ev.uid,
        eventId: ev.eventId,
        source: ev.source,
        stageId: ev.stageId,
        gameMode: ev.gameMode,
        earnedXp: ev.deltaXp,
        defeatedByType: ev.enemyBreakdown,
        achievementBonusXp: ev.achievementBonusXp ?? 0,
        roomCode: ev.roomCode,
        timestampMs: ev.timestampMs,
      });
      if (
        !check.valid ||
        !check.normalizedEvent ||
        ev.uid !== expectedUid ||
        check.normalizedEvent.eventDigest !== ev.eventDigest
      ) {
        return { valid: false, reason: 'EVENT_DIGEST_OR_FORMULA_TAMPERED' };
      }
      seenIds.add(ev.eventId);
      validatedEvents.push(check.normalizedEvent);
    }

    const unsigned: Omit<PersistedUserLevelLedger, 'signature'> = {
      schemaVersion: 'M7.5.2-LEDGER-V1',
      uid: expectedUid,
      revision: candidate.revision,
      lastCloudSyncAtMs: candidate.lastCloudSyncAtMs as number | null,
      cloudBaselineXp: candidate.cloudBaselineXp as number | null,
      cloudCommittedEventIds: (candidate.cloudCommittedEventIds as unknown[]).map((id) =>
        String(id)
      ),
      hasVerifiedZeroBaselineSession: candidate.hasVerifiedZeroBaselineSession,
      events: validatedEvents,
    };
    const expectedSig = computeLedgerSignature(unsigned);
    if (candidate.signature !== expectedSig) {
      return { valid: false, reason: 'LEDGER_SIGNATURE_MISMATCH' };
    }

    return {
      valid: true,
      ledger: {
        ...unsigned,
        signature: expectedSig,
      },
    };
  }

  private mergeVerifiedLedgers(
    mem: PersistedUserLevelLedger,
    disk: PersistedUserLevelLedger
  ):
    | { ok: true; merged: PersistedUserLevelLedger }
    | { ok: false; conflict: LedgerMultiTabConflictInfo } {
    const memEventsById = new Map(mem.events.map((e) => [e.eventId, e]));
    for (const dEv of disk.events) {
      const mEv = memEventsById.get(dEv.eventId);
      if (mEv && mEv.eventDigest !== dEv.eventDigest) {
        return {
          ok: false,
          conflict: {
            uid: mem.uid,
            detectedAtMs: Date.now(),
            reasonCode: 'CONFLICTING_EVENT_PAYLOAD',
            message: `Phát hiện xung đột dữ liệu giữa các tab cho sự kiện XP ${dEv.eventId}. Từ chối ghi đè âm thầm.`,
            localRevision: mem.revision,
            remoteRevision: disk.revision,
          },
        };
      }
    }

    let mergedCloudBaselineXp: number | null = mem.cloudBaselineXp;
    let mergedCloudSyncAtMs: number | null = mem.lastCloudSyncAtMs;
    if (mem.cloudBaselineXp !== null && disk.cloudBaselineXp !== null) {
      if (mem.cloudBaselineXp !== disk.cloudBaselineXp) {
        const memTs = mem.lastCloudSyncAtMs ?? 0;
        const diskTs = disk.lastCloudSyncAtMs ?? 0;
        if (memTs === diskTs) {
          return {
            ok: false,
            conflict: {
              uid: mem.uid,
              detectedAtMs: Date.now(),
              reasonCode: 'CONFLICTING_CLOUD_BASELINE',
              message: `Phát hiện xung đột cloudBaselineXp giữa các tab (${mem.cloudBaselineXp} vs ${disk.cloudBaselineXp}). Từ chối ghi đè âm thầm.`,
              localRevision: mem.revision,
              remoteRevision: disk.revision,
            },
          };
        }
        if (diskTs > memTs) {
          mergedCloudBaselineXp = disk.cloudBaselineXp;
          mergedCloudSyncAtMs = disk.lastCloudSyncAtMs;
        }
      } else {
        mergedCloudSyncAtMs =
          mem.lastCloudSyncAtMs !== null && disk.lastCloudSyncAtMs !== null
            ? Math.max(mem.lastCloudSyncAtMs, disk.lastCloudSyncAtMs)
            : (mem.lastCloudSyncAtMs ?? disk.lastCloudSyncAtMs);
      }
    } else if (mem.cloudBaselineXp === null && disk.cloudBaselineXp !== null) {
      mergedCloudBaselineXp = disk.cloudBaselineXp;
      mergedCloudSyncAtMs = disk.lastCloudSyncAtMs;
    }

    const unionEventsMap = new Map<string, ValidatedXpLedgerEvent>();
    for (const dEv of disk.events) {
      unionEventsMap.set(dEv.eventId, { ...dEv, enemyBreakdown: { ...dEv.enemyBreakdown } });
    }
    for (const mEv of mem.events) {
      if (!unionEventsMap.has(mEv.eventId)) {
        unionEventsMap.set(mEv.eventId, { ...mEv, enemyBreakdown: { ...mEv.enemyBreakdown } });
      }
    }
    const mergedEvents = Array.from(unionEventsMap.values()).sort((a, b) => {
      if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
      return a.eventId.localeCompare(b.eventId);
    });

    const committedSet = new Set<string>([
      ...disk.cloudCommittedEventIds,
      ...mem.cloudCommittedEventIds,
    ]);

    const unsigned: Omit<PersistedUserLevelLedger, 'signature'> = {
      schemaVersion: 'M7.5.2-LEDGER-V1',
      uid: mem.uid,
      revision: Math.max(mem.revision, disk.revision),
      lastCloudSyncAtMs: mergedCloudSyncAtMs,
      cloudBaselineXp: mergedCloudBaselineXp,
      cloudCommittedEventIds: Array.from(committedSet).sort(),
      hasVerifiedZeroBaselineSession:
        mem.hasVerifiedZeroBaselineSession || disk.hasVerifiedZeroBaselineSession,
      events: mergedEvents,
    };
    return {
      ok: true,
      merged: {
        ...unsigned,
        signature: computeLedgerSignature(unsigned),
      },
    };
  }

  private recordMultiTabConflict(conflict: LedgerMultiTabConflictInfo): void {
    this.multiTabConflictsByUid.set(conflict.uid, conflict);
    SystemAuditLogger.getInstance().recordEvent({
      severity: 'WARNING',
      category: 'CLIENT_LIFECYCLE',
      eventType: 'CLIENT_XP_MULTI_TAB_CONFLICT',
      message: conflict.message,
      uid: conflict.uid,
      source: 'PlayerLevelManager.reconcileWithPersistedStorage',
      outcome: 'FAILURE',
      errorCode: conflict.reasonCode,
      skipDeduplication: true,
      metadata: {
        reasonCode: conflict.reasonCode,
        localRevision: conflict.localRevision,
        remoteRevision: conflict.remoteRevision,
      },
    });
  }

  public reconcileWithPersistedStorage(
    uid: string,
    trigger: 'READ' | 'PRE_WRITE' | 'STORAGE_EVENT' = 'READ'
  ): {
    ok: boolean;
    changedFromStorage: boolean;
    conflictDetected: boolean;
    conflictInfo?: LedgerMultiTabConflictInfo;
    tamperDetected?: boolean;
    tamperReason?: string;
  } {
    this.ensureWindowStorageListener();
    if (!uid) return { ok: true, changedFromStorage: false, conflictDetected: false };
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ok: true, changedFromStorage: false, conflictDetected: false };
    }

    const storageKey = `${LEDGER_STORAGE_PREFIX}${uid}`;
    const diskRaw = window.localStorage.getItem(storageKey);
    const prevKnownRaw = this.lastKnownStorageRawByUid.get(uid);
    const hasMem = this.ledgersByUid.has(uid);

    if (diskRaw === null) {
      if (trigger === 'STORAGE_EVENT' && prevKnownRaw !== null && prevKnownRaw !== undefined) {
        const fresh = this.createEmptyLedger(uid);
        this.ledgersByUid.set(uid, fresh);
        this.lastKnownStorageRawByUid.set(uid, null);
        return { ok: true, changedFromStorage: true, conflictDetected: false };
      }
      if (!hasMem) {
        this.lastKnownStorageRawByUid.set(uid, null);
      }
      return { ok: true, changedFromStorage: false, conflictDetected: false };
    }

    if (hasMem && prevKnownRaw !== undefined && diskRaw === prevKnownRaw) {
      return { ok: true, changedFromStorage: false, conflictDetected: false };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(diskRaw) as unknown;
    } catch {
      this.handleStorageTamperDetected(uid, 'CORRUPTED_LEDGER_JSON', storageKey);
      const conflict: LedgerMultiTabConflictInfo = {
        uid,
        detectedAtMs: Date.now(),
        reasonCode: 'STORAGE_TAMPER_OR_CORRUPTED',
        message: 'Dữ liệu localStorage bị hỏng JSON khi đồng bộ giữa các tab.',
        localRevision: this.ledgersByUid.get(uid)?.revision ?? 0,
        remoteRevision: 0,
      };
      this.recordMultiTabConflict(conflict);
      const reset = this.createEmptyLedger(uid);
      reset.cloudBaselineXp = this.ledgersByUid.get(uid)?.cloudBaselineXp ?? null;
      this.ledgersByUid.set(uid, reset);
      this.lastKnownStorageRawByUid.set(uid, null);
      return {
        ok: false,
        changedFromStorage: true,
        conflictDetected: true,
        conflictInfo: conflict,
        tamperDetected: true,
        tamperReason: 'CORRUPTED_LEDGER_JSON',
      };
    }

    const verified = this.verifyPersistedLedgerObject(uid, parsed);
    if (!verified.valid || !verified.ledger) {
      const reason = verified.reason || 'STORAGE_TAMPERED';
      this.handleStorageTamperDetected(uid, reason, storageKey);
      const conflict: LedgerMultiTabConflictInfo = {
        uid,
        detectedAtMs: Date.now(),
        reasonCode: 'STORAGE_TAMPER_OR_CORRUPTED',
        message: `Phát hiện dữ liệu localStorage không hợp lệ (${reason}) khi đồng bộ tab.`,
        localRevision: this.ledgersByUid.get(uid)?.revision ?? 0,
        remoteRevision: 0,
      };
      this.recordMultiTabConflict(conflict);
      const preservedCloudXp = this.ledgersByUid.get(uid)?.cloudBaselineXp ?? null;
      const reset = this.createEmptyLedger(uid);
      reset.cloudBaselineXp = preservedCloudXp;
      this.ledgersByUid.set(uid, reset);
      this.lastKnownStorageRawByUid.set(uid, null);
      return {
        ok: false,
        changedFromStorage: true,
        conflictDetected: true,
        conflictInfo: conflict,
        tamperDetected: true,
        tamperReason: reason,
      };
    }

    const diskLedger = verified.ledger;
    const memLedger = this.ledgersByUid.get(uid);
    if (!memLedger) {
      this.ledgersByUid.set(uid, diskLedger);
      this.lastKnownStorageRawByUid.set(uid, diskRaw);
      this.multiTabConflictsByUid.delete(uid);
      return { ok: true, changedFromStorage: true, conflictDetected: false };
    }

    const mergeRes = this.mergeVerifiedLedgers(memLedger, diskLedger);
    if (!mergeRes.ok) {
      this.recordMultiTabConflict(mergeRes.conflict);
      return {
        ok: false,
        changedFromStorage: false,
        conflictDetected: true,
        conflictInfo: mergeRes.conflict,
      };
    }

    const diskNeedsHeal =
      mergeRes.merged.events.length > diskLedger.events.length ||
      mergeRes.merged.cloudCommittedEventIds.length > diskLedger.cloudCommittedEventIds.length ||
      (mergeRes.merged.cloudBaselineXp !== null &&
        (diskLedger.cloudBaselineXp === null ||
          (mergeRes.merged.lastCloudSyncAtMs ?? 0) > (diskLedger.lastCloudSyncAtMs ?? 0))) ||
      (mergeRes.merged.hasVerifiedZeroBaselineSession && !diskLedger.hasVerifiedZeroBaselineSession);

    if (diskNeedsHeal && trigger !== 'PRE_WRITE') {
      const healedUnsigned: Omit<PersistedUserLevelLedger, 'signature'> = {
        ...mergeRes.merged,
        revision: Math.max(mergeRes.merged.revision, diskLedger.revision) + 1,
      };
      const healedLedger: PersistedUserLevelLedger = {
        ...healedUnsigned,
        signature: computeLedgerSignature(healedUnsigned),
      };
      try {
        const serialized = JSON.stringify(healedLedger);
        window.localStorage.setItem(storageKey, serialized);
        this.ledgersByUid.set(uid, healedLedger);
        this.lastKnownStorageRawByUid.set(uid, serialized);
        this.multiTabConflictsByUid.delete(uid);
        return { ok: true, changedFromStorage: true, conflictDetected: false };
      } catch {
        // Ignore storage error and keep merged ledger in RAM
      }
    }

    this.ledgersByUid.set(uid, mergeRes.merged);
    this.lastKnownStorageRawByUid.set(uid, diskRaw);
    this.multiTabConflictsByUid.delete(uid);
    return { ok: true, changedFromStorage: true, conflictDetected: false };
  }

  private getOrLoadLedger(uid: string): PersistedUserLevelLedger {
    this.reconcileWithPersistedStorage(uid, 'READ');
    const existing = this.ledgersByUid.get(uid);
    if (existing) return existing;

    const fresh = this.createEmptyLedger(uid);
    this.ledgersByUid.set(uid, fresh);
    return fresh;
  }

  private handleStorageTamperDetected(uid: string, reason: string, storageKey: string): void {
    this.tamperedUids.add(uid);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage error
      }
    }
    this.lastKnownStorageRawByUid.set(uid, null);
    SystemAuditLogger.getInstance().recordEvent({
      severity: 'WARNING',
      category: 'SECURITY_PERMISSION_DENIED',
      eventType: 'CLIENT_XP_TAMPER_REJECTED',
      message: `Phát hiện và từ chối dữ liệu XP/Quân hàm bất hợp lệ trong bộ nhớ trình duyệt (${reason}).`,
      uid,
      source: 'PlayerLevelManager.verifyPersistedLedgerObject',
      outcome: 'FAILURE',
      errorCode: reason,
      skipDeduplication: true,
      metadata: { reason, storageKey },
    });
  }

  private saveLedger(ledger: PersistedUserLevelLedger, bumpRevision = true): boolean {
    const nextRevision = bumpRevision ? Math.max(1, ledger.revision) + 1 : Math.max(1, ledger.revision);
    let candidateLedger: PersistedUserLevelLedger = {
      schemaVersion: 'M7.5.2-LEDGER-V1',
      uid: ledger.uid,
      revision: nextRevision,
      lastCloudSyncAtMs: ledger.lastCloudSyncAtMs ?? null,
      cloudBaselineXp: ledger.cloudBaselineXp,
      cloudCommittedEventIds: [...ledger.cloudCommittedEventIds],
      hasVerifiedZeroBaselineSession: ledger.hasVerifiedZeroBaselineSession,
      events: ledger.events.map((e) => ({ ...e, enemyBreakdown: { ...e.enemyBreakdown } })),
      signature: '',
    };
    candidateLedger.signature = computeLedgerSignature(candidateLedger);

    if (typeof window !== 'undefined' && window.localStorage) {
      const storageKey = `${LEDGER_STORAGE_PREFIX}${ledger.uid}`;
      const currentDiskRaw = window.localStorage.getItem(storageKey);
      const prevKnownRaw = this.lastKnownStorageRawByUid.get(ledger.uid);
      if (
        currentDiskRaw !== null &&
        prevKnownRaw !== undefined &&
        currentDiskRaw !== prevKnownRaw
      ) {
        try {
          const parsed = JSON.parse(currentDiskRaw) as unknown;
          const verified = this.verifyPersistedLedgerObject(ledger.uid, parsed);
          if (!verified.valid || !verified.ledger) {
            this.recordMultiTabConflict({
              uid: ledger.uid,
              detectedAtMs: Date.now(),
              reasonCode: 'STORAGE_TAMPER_OR_CORRUPTED',
              message: `Phát hiện thay đổi/hỏng dữ liệu localStorage trước khi ghi (${verified.reason ?? 'INVALID'}). Không ghi đè.`,
              localRevision: ledger.revision,
              remoteRevision: 0,
            });
            return false;
          }
          const mergeRes = this.mergeVerifiedLedgers(candidateLedger, verified.ledger);
          if (!mergeRes.ok) {
            this.recordMultiTabConflict(mergeRes.conflict);
            return false;
          }
          const bumpedUnsigned: Omit<PersistedUserLevelLedger, 'signature'> = {
            ...mergeRes.merged,
            revision: Math.max(candidateLedger.revision, verified.ledger.revision) + 1,
          };
          candidateLedger = {
            ...bumpedUnsigned,
            signature: computeLedgerSignature(bumpedUnsigned),
          };
        } catch {
          this.recordMultiTabConflict({
            uid: ledger.uid,
            detectedAtMs: Date.now(),
            reasonCode: 'STORAGE_TAMPER_OR_CORRUPTED',
            message: 'Dữ liệu JSON trong localStorage thay đổi bất thường trước khi ghi. Không ghi đè.',
            localRevision: ledger.revision,
            remoteRevision: 0,
          });
          return false;
        }
      }
    }

    this.ledgersByUid.set(ledger.uid, candidateLedger);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const serialized = JSON.stringify(candidateLedger);
        window.localStorage.setItem(`${LEDGER_STORAGE_PREFIX}${ledger.uid}`, serialized);
        this.lastKnownStorageRawByUid.set(ledger.uid, serialized);
      } catch {
        // Ignore quota error
      }
    }
    return true;
  }

  public revalidateLocalStorageIntegrity(uid: string): { intact: boolean; reason?: string } {
    if (!uid) return { intact: true };
    const res = this.reconcileWithPersistedStorage(uid, 'READ');
    if (res.tamperDetected) {
      const mem = this.ledgersByUid.get(uid);
      if (mem) {
        this.saveLedger(mem, true);
      }
      return { intact: false, reason: res.tamperReason };
    }
    return { intact: true };
  }

  public attemptDirectClientOverride(params: {
    uid: string;
    attemptedTotalXp?: unknown;
    attemptedLevel?: unknown;
    attemptedRank?: unknown;
    callerSource?: string;
  }): {
    allowed: false;
    errorCode: 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN';
    errorMessage: string;
  } {
    const cleanUid = String(params.uid || '').trim() || null;
    SystemAuditLogger.getInstance().recordEvent({
      severity: 'WARNING',
      category: 'SECURITY_PERMISSION_DENIED',
      eventType: 'CLIENT_XP_TAMPER_REJECTED',
      message: 'Từ chối yêu cầu ghi đè trực tiếp totalXp hoặc Quân hàm từ phía client.',
      uid: cleanUid,
      source: params.callerSource || 'PlayerLevelManager.attemptDirectClientOverride',
      outcome: 'FAILURE',
      errorCode: 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN',
      skipDeduplication: true,
      metadata: {
        attemptedTotalXp: params.attemptedTotalXp ?? null,
        attemptedLevel: params.attemptedLevel ?? null,
        attemptedRank: params.attemptedRank ?? null,
      },
    });
    return {
      allowed: false,
      errorCode: 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN',
      errorMessage: 'Client không được phép tự ghi đè trực tiếp totalXp hoặc Quân hàm.',
    };
  }

  public applyFirestoreUserDocument(
    uid: string,
    rawDoc: Record<string, unknown> | null,
    detectedAtMs = Date.now()
  ): UserLevelConsistencyAuditEntry | null {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return null;

    const ledger = this.getOrLoadLedger(cleanUid);
    if (!rawDoc) {
      ledger.cloudBaselineXp = null;
      this.consistencyAuditByUid.delete(cleanUid);
      this.saveLedger(ledger);
      return null;
    }

    const audit = auditUserDocumentLevelConsistency(cleanUid, rawDoc, detectedAtMs);
    this.consistencyAuditByUid.set(cleanUid, audit);

    if (!audit.isConsistent) {
      SystemAuditLogger.getInstance().recordEvent({
        severity: 'WARNING',
        category: 'CLIENT_LIFECYCLE',
        eventType: 'PLAYER_LEVEL_DATA_MISMATCH',
        message: audit.discrepancySummary,
        uid: cleanUid,
        userEmail: audit.email,
        displayName: audit.displayName,
        source: 'PlayerLevelManager.applyFirestoreUserDocument',
        outcome: 'FAILURE',
        errorCode: audit.discrepancyCodes.join(','),
        timestampMs: detectedAtMs,
        metadata: {
          storedLevel: audit.storedLevel ?? null,
          expectedLevel: audit.expectedLevel,
          expectedRankCode: audit.expectedRankCode,
          expectedRankNameVi: audit.expectedRankNameVi,
          storedTotalXp: audit.storedTotalXp ?? null,
          legacyXp: audit.legacyXp ?? null,
          resolvedVerifiedTotalXp: audit.resolvedVerifiedTotalXp,
          discrepancyCodes: audit.discrepancyCodes,
        },
      });
    }

    if (audit.resolvedVerifiedTotalXp !== null) {
      const prevProgress = this.getLevelProgressForUid(cleanUid);
      ledger.cloudBaselineXp = audit.resolvedVerifiedTotalXp;
      ledger.lastCloudSyncAtMs = detectedAtMs;
      this.tamperedUids.delete(cleanUid);

      if (Array.isArray(rawDoc.appliedXpEventIds)) {
        const committedSet = new Set(ledger.cloudCommittedEventIds);
        for (const rawId of rawDoc.appliedXpEventIds) {
          if (typeof rawId === 'string' && rawId.trim()) {
            committedSet.add(rawId.trim());
          }
        }
        ledger.cloudCommittedEventIds = Array.from(committedSet);
      }
      if (typeof rawDoc.lastXpEventId === 'string' && rawDoc.lastXpEventId.trim()) {
        const lastId = rawDoc.lastXpEventId.trim();
        if (!ledger.cloudCommittedEventIds.includes(lastId)) {
          ledger.cloudCommittedEventIds.push(lastId);
        }
      }

      this.saveLedger(ledger);
      const nextProgress = this.getLevelProgressForUid(cleanUid);
      if (
        prevProgress.xpVerificationStatus === 'VERIFIED' &&
        nextProgress.xpVerificationStatus === 'VERIFIED' &&
        ((prevProgress.level !== null &&
          nextProgress.level !== null &&
          nextProgress.level !== prevProgress.level) ||
          (prevProgress.rankCode !== null &&
            nextProgress.rankCode !== null &&
            nextProgress.rankCode !== prevProgress.rankCode))
      ) {
        const syncEventId =
          typeof rawDoc.lastXpEventId === 'string' && rawDoc.lastXpEventId.trim()
            ? rawDoc.lastXpEventId.trim()
            : `cloud_sync_${cleanUid}_${nextProgress.totalXp}`;
        this.emitVerifiedLevelChangeAuditLog({
          uid: cleanUid,
          previousLevel: prevProgress.level ?? 1,
          newLevel: nextProgress.level ?? 1,
          previousRankNameVi: prevProgress.rankNameVi,
          newRankNameVi: nextProgress.rankNameVi,
          previousTotalXp: prevProgress.totalXp ?? 0,
          newTotalXp: nextProgress.totalXp ?? 0,
          xpEventId: syncEventId,
          source: 'FIRESTORE_SYNC',
          timestampMs: detectedAtMs,
        });
      }
    } else {
      ledger.cloudBaselineXp = null;
      ledger.hasVerifiedZeroBaselineSession = false;
      this.saveLedger(ledger);
    }

    return audit;
  }

  public confirmNewAccountZeroBaselineSession(uid: string): void {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid || this.tamperedUids.has(cleanUid)) return;
    const existingAudit = this.consistencyAuditByUid.get(cleanUid);
    if (existingAudit && existingAudit.resolvedVerifiedTotalXp === null) {
      return;
    }
    const ledger = this.getOrLoadLedger(cleanUid);
    if (!ledger.hasVerifiedZeroBaselineSession) {
      ledger.hasVerifiedZeroBaselineSession = true;
      this.saveLedger(ledger);
    }
  }

  public markFirestoreReadFailed(uid: string): void {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return;
    const ledger = this.getOrLoadLedger(cleanUid);
    if (ledger.cloudBaselineXp === null && ledger.events.length === 0) {
      if (ledger.hasVerifiedZeroBaselineSession) {
        ledger.hasVerifiedZeroBaselineSession = false;
        this.saveLedger(ledger);
      }
    }
  }

  public markXpUnverified(uid: string): void {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid) return;
    const ledger = this.getOrLoadLedger(cleanUid);
    ledger.cloudBaselineXp = null;
    ledger.lastCloudSyncAtMs = null;
    ledger.hasVerifiedZeroBaselineSession = false;
    this.saveLedger(ledger);
  }

  public getLevelProgressForUid(uid: string | null | undefined): PlayerLevelProgressInfo {
    const cleanUid = typeof uid === 'string' ? uid.trim() : '';
    if (!cleanUid) {
      return computePlayerLevelProgress(null, 'UNVERIFIED');
    }

    this.revalidateLocalStorageIntegrity(cleanUid);
    const ledger = this.getOrLoadLedger(cleanUid);

    const hasVerifiedBaseline =
      ledger.cloudBaselineXp !== null ||
      ledger.hasVerifiedZeroBaselineSession ||
      ledger.events.length > 0;

    if (!hasVerifiedBaseline) {
      return computePlayerLevelProgress(null, 'UNVERIFIED');
    }

    const baseline = ledger.cloudBaselineXp ?? 0;
    const committedSet = new Set(ledger.cloudCommittedEventIds);
    let uncommittedSum = 0;
    for (const ev of ledger.events) {
      if (!committedSet.has(ev.eventId)) {
        uncommittedSum += ev.deltaXp;
      }
    }

    const totalXp = baseline + uncommittedSum;
    return computePlayerLevelProgress(totalXp, 'VERIFIED');
  }

  public grantVerifiedBattleXpSync(input: BattleXpGrantInput): XpGrantExecutionResult {
    const cleanUid = typeof input.uid === 'string' ? input.uid.trim() : '';
    const cleanEventId = typeof input.eventId === 'string' ? input.eventId.trim() : '';

    const validation = validateBattleXpGrantInput(input);
    if (!validation.valid || !validation.normalizedEvent) {
      if (cleanUid) {
        SystemAuditLogger.getInstance().recordEvent({
          severity: 'WARNING',
          category: 'SECURITY_PERMISSION_DENIED',
          eventType: 'XP_GRANT_REJECTED',
          message: validation.rejectionMessage || 'Từ chối cộng XP không hợp lệ.',
          uid: cleanUid,
          source: 'PlayerLevelManager.grantVerifiedBattleXp',
          outcome: 'FAILURE',
          errorCode: validation.rejectionCode || 'INVALID_XP_GRANT',
          skipDeduplication: true,
          metadata: {
            eventId: cleanEventId,
            attemptedEarnedXp: input.earnedXp,
            achievementBonusXp: input.achievementBonusXp ?? 0,
            stageId: input.stageId,
            source: input.source,
          },
        });
      }
      const cur = this.getLevelProgressForUid(cleanUid);
      return {
        accepted: false,
        duplicateIgnored: false,
        rejectionCode: validation.rejectionCode,
        rejectionMessage: validation.rejectionMessage,
        uid: cleanUid,
        eventId: cleanEventId,
        previousTotalXp: cur.totalXp,
        newTotalXp: cur.totalXp,
        previousLevel: cur.level,
        newLevel: cur.level,
        levelChanged: false,
        previousRankCode: cur.rankCode,
        newRankCode: cur.rankCode,
        previousRankNameVi: cur.rankNameVi,
        newRankNameVi: cur.rankNameVi,
        rankPromoted: false,
        previousStarBalance: cur.starBalance,
        newStarBalance: cur.starBalance,
        starsEarnedThisGrant: 0,
        newUnconvertedXp: cur.unconvertedXp,
      };
    }

    const ev = validation.normalizedEvent;
    const reconcileRes = this.reconcileWithPersistedStorage(ev.uid, 'PRE_WRITE');
    const existingActiveConflict = this.multiTabConflictsByUid.get(ev.uid);
    if (reconcileRes.conflictDetected || existingActiveConflict) {
      const cur = this.getLevelProgressForUid(ev.uid);
      return {
        accepted: false,
        duplicateIgnored: false,
        rejectionCode: 'MULTI_TAB_CONFLICT_DETECTED',
        rejectionMessage:
          reconcileRes.conflictInfo?.message ||
          existingActiveConflict?.message ||
          'Phát hiện xung đột dữ liệu giữa các tab. Không ghi đè âm thầm.',
        uid: ev.uid,
        eventId: ev.eventId,
        previousTotalXp: cur.totalXp,
        newTotalXp: cur.totalXp,
        previousLevel: cur.level,
        newLevel: cur.level,
        levelChanged: false,
        previousRankCode: cur.rankCode,
        newRankCode: cur.rankCode,
        previousRankNameVi: cur.rankNameVi,
        newRankNameVi: cur.rankNameVi,
        rankPromoted: false,
        previousStarBalance: cur.starBalance,
        newStarBalance: cur.starBalance,
        starsEarnedThisGrant: 0,
        newUnconvertedXp: cur.unconvertedXp,
      };
    }

    const ledger = this.getOrLoadLedger(ev.uid);

    const existingEvent = ledger.events.find((existing) => existing.eventId === ev.eventId);
    if (existingEvent && existingEvent.eventDigest !== ev.eventDigest) {
      const conflict: LedgerMultiTabConflictInfo = {
        uid: ev.uid,
        detectedAtMs: Date.now(),
        reasonCode: 'CONFLICTING_EVENT_DIGEST',
        message: `Xung đột eventId=${ev.eventId} giữa các tab (eventDigest không khớp). Không ghi đè âm thầm.`,
        localRevision: ledger.revision,
        remoteRevision: ledger.revision,
      };
      this.recordMultiTabConflict(conflict);
      const cur = this.getLevelProgressForUid(ev.uid);
      return {
        accepted: false,
        duplicateIgnored: false,
        rejectionCode: 'MULTI_TAB_CONFLICT_DETECTED',
        rejectionMessage: conflict.message,
        uid: ev.uid,
        eventId: ev.eventId,
        previousTotalXp: cur.totalXp,
        newTotalXp: cur.totalXp,
        previousLevel: cur.level,
        newLevel: cur.level,
        levelChanged: false,
        previousRankCode: cur.rankCode,
        newRankCode: cur.rankCode,
        previousRankNameVi: cur.rankNameVi,
        newRankNameVi: cur.rankNameVi,
        rankPromoted: false,
        previousStarBalance: cur.starBalance,
        newStarBalance: cur.starBalance,
        starsEarnedThisGrant: 0,
        newUnconvertedXp: cur.unconvertedXp,
      };
    }
    const alreadyInCloudCommitted = ledger.cloudCommittedEventIds.includes(ev.eventId);
    if (existingEvent || alreadyInCloudCommitted) {
      const cur = this.getLevelProgressForUid(ev.uid);
      return {
        accepted: true,
        duplicateIgnored: true,
        uid: ev.uid,
        eventId: ev.eventId,
        previousTotalXp: cur.totalXp,
        newTotalXp: cur.totalXp,
        previousLevel: cur.level,
        newLevel: cur.level,
        levelChanged: false,
        previousRankCode: cur.rankCode,
        newRankCode: cur.rankCode,
        previousRankNameVi: cur.rankNameVi,
        newRankNameVi: cur.rankNameVi,
        rankPromoted: false,
        previousStarBalance: cur.starBalance,
        newStarBalance: cur.starBalance,
        starsEarnedThisGrant: 0,
        newUnconvertedXp: cur.unconvertedXp,
      };
    }

    const hadBaselineBefore =
      ledger.cloudBaselineXp !== null ||
      ledger.hasVerifiedZeroBaselineSession ||
      ledger.events.length > 0;
    const prevProgress = hadBaselineBefore
      ? this.getLevelProgressForUid(ev.uid)
      : computePlayerLevelProgress(0, 'VERIFIED');

    const prevTotalXp = prevProgress.totalXp ?? 0;
    const prevLevel = prevProgress.level ?? MIN_PLAYER_LEVEL;
    const prevRank = calculateMilitaryRankFromTotalXp(prevTotalXp);
    const prevStars = computeStarEconomyFromTotalXp(prevTotalXp);

    const candidateLedger: PersistedUserLevelLedger = {
      ...ledger,
      cloudCommittedEventIds: [...ledger.cloudCommittedEventIds],
      events: [...ledger.events, ev],
    };
    const saved = this.saveLedger(candidateLedger, true);
    if (!saved) {
      const cur = this.getLevelProgressForUid(ev.uid);
      return {
        accepted: false,
        duplicateIgnored: false,
        rejectionCode: 'MULTI_TAB_CONFLICT_DETECTED',
        rejectionMessage:
          this.multiTabConflictsByUid.get(ev.uid)?.message ||
          'Xung đột ghi localStorage giữa các tab. Đã hủy ghi đè.',
        uid: ev.uid,
        eventId: ev.eventId,
        previousTotalXp: cur.totalXp,
        newTotalXp: cur.totalXp,
        previousLevel: cur.level,
        newLevel: cur.level,
        levelChanged: false,
        previousRankCode: cur.rankCode,
        newRankCode: cur.rankCode,
        previousRankNameVi: cur.rankNameVi,
        newRankNameVi: cur.rankNameVi,
        rankPromoted: false,
        previousStarBalance: cur.starBalance,
        newStarBalance: cur.starBalance,
        starsEarnedThisGrant: 0,
        newUnconvertedXp: cur.unconvertedXp,
      };
    }

    const nextProgress = this.getLevelProgressForUid(ev.uid);
    const newTotalXp = nextProgress.totalXp ?? prevTotalXp + ev.deltaXp;
    const newLevel = nextProgress.level ?? calculateLevelFromTotalXp(newTotalXp);
    const newRank = calculateMilitaryRankFromTotalXp(newTotalXp);
    const newStars = computeStarEconomyFromTotalXp(newTotalXp);

    const levelChanged = newLevel !== prevLevel;
    const rankPromoted = newRank.tier > prevRank.tier;

    if (levelChanged || rankPromoted) {
      this.emitVerifiedLevelChangeAuditLog({
        uid: ev.uid,
        previousLevel: prevLevel,
        newLevel,
        previousRankNameVi: prevRank.nameVi,
        newRankNameVi: newRank.nameVi,
        previousTotalXp: prevTotalXp,
        newTotalXp,
        xpEventId: ev.eventId,
        source: ev.source,
        stageId: ev.stageId,
        gameMode: ev.gameMode,
        roomCode: ev.roomCode,
        timestampMs: ev.timestampMs,
      });
    }

    return {
      accepted: true,
      duplicateIgnored: false,
      uid: ev.uid,
      eventId: ev.eventId,
      previousTotalXp: prevTotalXp,
      newTotalXp,
      previousLevel: prevLevel,
      newLevel,
      levelChanged,
      previousRankCode: prevRank.code,
      newRankCode: newRank.code,
      previousRankNameVi: prevRank.nameVi,
      newRankNameVi: newRank.nameVi,
      rankPromoted,
      previousStarBalance: prevStars.starBalance,
      newStarBalance: newStars.starBalance,
      starsEarnedThisGrant: Math.max(0, newStars.starBalance - prevStars.starBalance),
      newUnconvertedXp: newStars.unconvertedXp,
    };
  }

  public async grantVerifiedBattleXp(
    input: BattleXpGrantInput
  ): Promise<XpGrantExecutionResult> {
    const key = typeof input.uid === 'string' && input.uid.trim() ? input.uid.trim() : '__invalid__';
    const prevChain = this.perUidAsyncChains.get(key) ?? Promise.resolve();
    const nextTask = prevChain
      .catch(() => undefined)
      .then(() => this.grantVerifiedBattleXpSync(input));
    this.perUidAsyncChains.set(key, nextTask);
    return nextTask;
  }

  private trackedEmittedLevelAuditKeys = new Set<string>();

  private emitVerifiedLevelChangeAuditLog(params: {
    uid: string;
    previousLevel: number;
    newLevel: number;
    previousRankNameVi: string;
    newRankNameVi: string;
    previousTotalXp: number;
    newTotalXp: number;
    xpEventId: string;
    source: XpGrantSource;
    stageId?: number;
    gameMode?: string;
    roomCode?: string | null;
    timestampMs: number;
  }): void {
    const dedupKey = `${params.uid}|${params.xpEventId}|${params.previousRankNameVi}->${params.newRankNameVi}|${params.previousLevel}->${params.newLevel}`;
    if (this.trackedEmittedLevelAuditKeys.has(dedupKey)) return;
    this.trackedEmittedLevelAuditKeys.add(dedupKey);

    SystemAuditLogger.getInstance().recordEvent({
      severity: 'INFO',
      category: 'CAMPAIGN_STAGE_EVENT',
      eventType: 'PLAYER_LEVEL_CHANGED',
      message: `Người chơi thăng cấp bậc: ${params.previousRankNameVi} → ${params.newRankNameVi} (Tổng XP: ${params.previousTotalXp} → ${params.newTotalXp}).`,
      uid: params.uid,
      roomCode: params.roomCode ?? null,
      stageId: params.stageId ?? null,
      gameMode: params.gameMode ?? null,
      source: `PlayerLevelManager.${params.source}`,
      outcome: 'SUCCESS',
      timestampMs: params.timestampMs,
      skipDeduplication: true,
      metadata: {
        uid: params.uid,
        previousLevel: params.previousLevel,
        newLevel: params.newLevel,
        previousRankNameVi: params.previousRankNameVi,
        newRankNameVi: params.newRankNameVi,
        previousTotalXp: params.previousTotalXp,
        newTotalXp: params.newTotalXp,
        xpEventId: params.xpEventId,
        source: params.source,
        verificationStatus: 'CLIENT_LEDGER_OR_FIRESTORE_READ',
        isMaxRankReached: params.newTotalXp >= MAX_MILITARY_RANK_XP_REQUIRED,
        isMaxLevelReached: params.newLevel === MAX_PLAYER_LEVEL,
      },
    });
  }

  public getConsistencyAuditForUid(
    uid: string | null | undefined
  ): UserLevelConsistencyAuditEntry | null {
    if (!uid) return null;
    return this.consistencyAuditByUid.get(uid.trim()) ?? null;
  }

  public listAllConsistencyAudits(): UserLevelConsistencyAuditEntry[] {
    return Array.from(this.consistencyAuditByUid.values())
      .map((entry) => ({ ...entry, discrepancyCodes: [...entry.discrepancyCodes] }))
      .sort((a, b) => b.detectedAtMs - a.detectedAtMs);
  }

  public clearUidForTesting(uid: string): void {
    const cleanUid = uid.trim();
    this.ledgersByUid.delete(cleanUid);
    this.lastKnownStorageRawByUid.delete(cleanUid);
    this.multiTabConflictsByUid.delete(cleanUid);
    this.consistencyAuditByUid.delete(cleanUid);
    this.tamperedUids.delete(cleanUid);
    this.perUidAsyncChains.delete(cleanUid);
    for (const k of Array.from(this.trackedEmittedLevelAuditKeys)) {
      if (k.startsWith(`${cleanUid}|`)) {
        this.trackedEmittedLevelAuditKeys.delete(k);
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(`${LEDGER_STORAGE_PREFIX}${cleanUid}`);
    }
  }
}
