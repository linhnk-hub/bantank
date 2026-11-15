/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.2 – OFFICIAL PLAYER LEVEL SYSTEM (LEVEL 1–50)
 * Status: OFFICIALLY APPROVED SPECIFICATION
 *
 * Official Mathematical Specification (Section 2):
 * - MIN_PLAYER_LEVEL = 1, MAX_PLAYER_LEVEL = 50, XP at Level 1 = 0.
 * - Minimum cumulative XP required to reach Level L (1 <= L <= 50):
 *     XP_REQUIRED(L) = 100 * L * (L - 1) / 2
 * - Player Level from valid non-negative integer cumulative XP X:
 *     LEVEL = min(50, floor((1 + sqrt(1 + 8 * X / 100)) / 2))
 *   Cross-verified against the exact integer threshold table so IEEE-754 floating-point
 *   rounding can NEVER misclassify boundary values (e.g. 122,499 -> 49 vs 122,500 -> 50)
 *   even up to Number.MAX_SAFE_INTEGER.
 * - FORBIDDEN: Never use `sqrt(totalXp / 100) + 1` or any unapproved formula.
 *
 * Strict Domain Separation (Section 3):
 * - Level (1..50) is 100% independent of PvP Rank (`rank`) and Currency (`xu`).
 * - Level changes never grant Xu, items, gameplay buffs, or Rank promotions.
 *
 * Security & Runtime Architecture Honesty (Section 4):
 * - Bắn Tank Online currently operates as a client-side SPA without Cloud Functions or a
 *   trusted backend server, and `/firestore.rules` blocks client writes to `xp`, `totalXp`,
 *   and `level` on `/users/{uid}`.
 * - Therefore, this module enforces deterministic event-ID idempotency, enemy-defeat XP
 *   formula validation (`1*BASIC + 2*FAST + 3*POWER + 5*ARMOR`), concurrency serialization,
 *   and local-storage checksum tamper detection on the client/service layer, while explicitly
 *   marking verification authority as `'CLIENT_LEDGER_OR_FIRESTORE_READ'` rather than claiming
 *   Production server-authoritative XP enforcement.
 */

import { SCORE_VALUES } from './scoreManager.ts';
import { ENEMY_CONFIG } from './constants.ts';
import {
  SystemAuditLogger,
  computeCanonicalChecksum,
} from './systemAuditLogger.ts';

export const MIN_PLAYER_LEVEL = 1;
export const MAX_PLAYER_LEVEL = 50;
export const LEVEL_BASE_STEP_XP = 100;
export const MAX_STAGE_ENEMY_COUNT = ENEMY_CONFIG.TOTAL_COUNT; // 30 enemies per campaign stage
export const MAX_SINGLE_STAGE_XP = MAX_STAGE_ENEMY_COUNT * SCORE_VALUES.ARMOR; // 30 * 5 = 150 XP

export interface LevelThresholdEntry {
  level: number;
  xpRequired: number;
  xpDeltaFromPrevious: number;
}

/**
 * Exact integer cumulative XP required to reach `level` (`1 <= level <= 50`).
 * Formula: `XP_REQUIRED(L) = 100 * L * (L - 1) / 2 = 50 * L * (L - 1)`.
 */
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
 * Calculates the official Player Level (`1..50`) from a validated non-negative integer `totalXp`.
 *
 * Formula:
 *   `LEVEL = min(50, floor((1 + sqrt(1 + 8 * X / 100)) / 2))`
 * Followed by exact integer threshold boundary verification against `XP_REQUIRED(L)` so
 * floating-point representation can never cause off-by-one drift at any boundary.
 */
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
  level: number | null;
  isMaxLevel: boolean;
  topMenuBadge: string;
  systemLabel: string;
  totalXp: number | null;
  currentLevelFloorXp: number | null;
  /** `null` when unverified OR when `level === 50` (Section 2.4: do NOT show Level 51 XP requirement). */
  xpNext: number | null;
  /** `null` when unverified; `0` when `level === 50`. */
  xpRemaining: number | null;
  /** Clamped `0..100`; `100` at Level 50; `0` when unverified. */
  progressPercent: number;
}

/**
 * Computes full UI-ready Level & Progress metadata (Sections 2.3, 2.4, 6.1–6.3).
 * - If `xpVerificationStatus !== 'VERIFIED'` or `totalXp` is invalid: returns `Lv. --` without
 *   defaulting to `Lv. 1` (Section 6.3).
 * - If verified with `totalXp === 0`: returns `Lv. 1`, `xpNext = 100`, `xpRemaining = 100`, `progressPercent = 0`.
 * - If verified with `totalXp >= 122_500`: returns `Lv. 50`, `isMaxLevel = true`, `xpNext = null`,
 *   `xpRemaining = 0`, `progressPercent = 100` (`MAX LEVEL`).
 */
export function computePlayerLevelProgress(
  rawTotalXp: unknown,
  xpVerificationStatus: XpVerificationStatus
): PlayerLevelProgressInfo {
  if (xpVerificationStatus !== 'VERIFIED') {
    return {
      xpVerificationStatus: 'UNVERIFIED',
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
  const level = calculateLevelFromTotalXp(totalXp);
  const currentLevelFloorXp = xpRequiredForLevel(level);
  const isMaxLevel = level === MAX_PLAYER_LEVEL;

  if (isMaxLevel) {
    return {
      xpVerificationStatus: 'VERIFIED',
      level: MAX_PLAYER_LEVEL,
      isMaxLevel: true,
      topMenuBadge: `Lv. ${MAX_PLAYER_LEVEL}`,
      systemLabel: `Cấp ${MAX_PLAYER_LEVEL} • MAX LEVEL`,
      totalXp,
      currentLevelFloorXp,
      xpNext: null,
      xpRemaining: 0,
      progressPercent: 100,
    };
  }

  const xpNext = xpRequiredForLevel(level + 1);
  const xpRemaining = Math.max(0, xpNext - totalXp);
  const span = xpNext - currentLevelFloorXp;
  const rawProgress = span > 0 ? ((totalXp - currentLevelFloorXp) / span) * 100 : 0;
  const progressPercent = Math.min(100, Math.max(0, Number(rawProgress.toFixed(2))));

  return {
    xpVerificationStatus: 'VERIFIED',
    level,
    isMaxLevel: false,
    topMenuBadge: `Lv. ${level}`,
    systemLabel: `Cấp ${level}/${MAX_PLAYER_LEVEL}`,
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
    ].join('|')
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
 * Validates a battle XP grant against all M7.5.2 Section 4 rules:
 * - Valid `uid`, `eventId`, `stageId` (`1..10`), and `source`.
 * - Non-negative integer counts for `BASIC`, `FAST`, `POWER`, `ARMOR` with total `<= 30`.
 * - Exact match with official enemy XP values (`1*BASIC + 2*FAST + 3*POWER + 5*ARMOR === earnedXp`),
 *   ensuring zero unapproved bonus XP for stage clear, win, login, playtime, or co-op.
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

  const expectedFormulaXp =
    rawB * SCORE_VALUES.BASIC +
    rawF * SCORE_VALUES.FAST +
    rawP * SCORE_VALUES.POWER +
    rawA * SCORE_VALUES.ARMOR;

  if (xpCheck.sanitizedXp !== expectedFormulaXp || xpCheck.sanitizedXp > MAX_SINGLE_STAGE_XP) {
    return {
      valid: false,
      rejectionCode: 'XP_MISMATCH_ENEMY_FORMULA',
      rejectionMessage: `XP cộng thêm (${xpCheck.sanitizedXp}) không khớp công thức tiêu diệt xe địch hợp lệ (${expectedFormulaXp} XP). Không cộng XP thưởng ngoài xe địch.`,
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
 * Audits a `/users/{uid}` Firestore document for `totalXp` / `xp` / `level` consistency
 * WITHOUT mutating or overwriting Firestore data (Sections 5 & 8).
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

  // Canonical resolution: prefer valid `totalXp`; fallback to valid `xp`; if neither exists and
  // neither was corrupted, new `/users/{uid}` profile created on login has 0 verified XP.
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
    ? `Hợp lệ (XP=${resolvedVerifiedTotalXp ?? 0} -> Lv.${expectedLevel ?? 1})`
    : `Phát hiện bất nhất [${discrepancyCodes.join(', ')}]: storedLevel=${JSON.stringify(
        docObj.level
      )}, totalXp=${JSON.stringify(docObj.totalXp)}, legacyXp=${JSON.stringify(
        docObj.xp
      )} -> expectedLevel=${expectedLevel !== null ? `Lv.${expectedLevel}` : 'UNVERIFIED'}`;

  return {
    uid: cleanUid,
    email,
    displayName,
    storedTotalXp: hasTotalXp ? docObj.totalXp : undefined,
    legacyXp: hasLegacyXp ? docObj.xp : undefined,
    resolvedVerifiedTotalXp,
    storedLevel: hasStoredLevel ? docObj.level : undefined,
    expectedLevel,
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
 *   so concurrent grants never race, lose XP, or double-emit Level-Up audit logs.
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

  /**
   * Creates an isolated tab instance (with separate RAM cache) sharing browser `localStorage`
   * for deterministic multi-tab concurrency and `storage` event tests.
   */
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
    // Reject injected `totalXp` or `level` fields inside persisted storage
    if ('totalXp' in candidate || 'level' in candidate) {
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
    // 1. Check same eventId with conflicting digest/payload
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

    // 2. Check conflicting non-null cloudBaselineXp without strict monotonic cloud sync causality
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

    // 3. Safe commutative union of verified events & cloudCommittedEventIds
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

  /**
   * Re-reads `localStorage` if changed by another tab and safely merges updates into RAM.
   * Refuses to silently overwrite on unmergeable conflict or external corruption.
   */
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
      // Do NOT overwrite remote localStorage; update our view of diskRaw only as last known remote so we don't silently clobber it
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
      message: `Phát hiện và từ chối dữ liệu XP/Level bất hợp lệ trong bộ nhớ trình duyệt (${reason}).`,
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

    // Pre-write multi-tab check: if another tab wrote to localStorage while we held stale RAM,
    // verify and merge before writing (never overwrite silently!).
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

  /**
   * Forces a fresh re-validation & cross-tab reconciliation of `localStorage` for `uid`.
   */
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

  /**
   * Rejects any direct client attempt to set or mutate `totalXp` or `level` outside of a
   * verified enemy-defeat event or Firestore `/users/{uid}` snapshot (Section 4.1 & Section 9).
   */
  public attemptDirectClientOverride(params: {
    uid: string;
    attemptedTotalXp?: unknown;
    attemptedLevel?: unknown;
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
      message: 'Từ chối yêu cầu ghi đè trực tiếp totalXp hoặc level từ phía client.',
      uid: cleanUid,
      source: params.callerSource || 'PlayerLevelManager.attemptDirectClientOverride',
      outcome: 'FAILURE',
      errorCode: 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN',
      skipDeduplication: true,
      metadata: {
        attemptedTotalXp: params.attemptedTotalXp ?? null,
        attemptedLevel: params.attemptedLevel ?? null,
      },
    });
    return {
      allowed: false,
      errorCode: 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN',
      errorMessage: 'Client không được phép tự ghi đè trực tiếp totalXp hoặc Level.',
    };
  }

  /**
   * Applies a `/users/{uid}` Firestore document snapshot:
   * - Runs non-destructive consistency check (`auditUserDocumentLevelConsistency`) and records
   *   any discrepancy without overwriting Firestore (Sections 5 & 8).
   * - Updates `cloudBaselineXp` and reconciles `appliedXpEventIds` if present so cross-device
   *   updates never double-count XP.
   */
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
        prevProgress.level !== null &&
        nextProgress.level !== null &&
        nextProgress.level !== prevProgress.level
      ) {
        const syncEventId =
          typeof rawDoc.lastXpEventId === 'string' && rawDoc.lastXpEventId.trim()
            ? rawDoc.lastXpEventId.trim()
            : `cloud_sync_${cleanUid}_${nextProgress.totalXp}`;
        this.emitVerifiedLevelChangeAuditLog({
          uid: cleanUid,
          previousLevel: prevProgress.level,
          newLevel: nextProgress.level,
          previousTotalXp: prevProgress.totalXp ?? 0,
          newTotalXp: nextProgress.totalXp ?? 0,
          xpEventId: syncEventId,
          source: 'FIRESTORE_SYNC',
          timestampMs: detectedAtMs,
        });
      }
    } else {
      // Corrupted cloud XP field -> mark unverified so UI never fabricates Level 1
      ledger.cloudBaselineXp = null;
      ledger.hasVerifiedZeroBaselineSession = false;
      this.saveLedger(ledger);
    }

    return audit;
  }

  /**
   * Marks that Firestore `/users/{uid}` read confirmed a newly created account with `0` baseline XP
   * (NEVER call before Firestore `/users/{uid}` read finishes).
   */
  public confirmNewAccountZeroBaselineSession(uid: string): void {
    const cleanUid = String(uid || '').trim();
    if (!cleanUid || this.tamperedUids.has(cleanUid)) return;
    const existingAudit = this.consistencyAuditByUid.get(cleanUid);
    if (existingAudit && existingAudit.resolvedVerifiedTotalXp === null) {
      // Cloud doc had corrupted XP type; keep unverified until fixed
      return;
    }
    const ledger = this.getOrLoadLedger(cleanUid);
    if (!ledger.hasVerifiedZeroBaselineSession) {
      ledger.hasVerifiedZeroBaselineSession = true;
      this.saveLedger(ledger);
    }
  }

  /**
   * Preserves UNVERIFIED (`Lv. --`) when Firestore read fails or is offline without any verified baseline.
   * Never converts a network/Firestore error into a 0 XP Level 1 new account.
   */
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

  /**
   * Computes the authoritative verified `totalXp` and `PlayerLevelProgressInfo` for `uid`.
   */
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

  /**
   * Synchronously validates and commits a battle XP grant with strict `eventId` idempotency.
   * Safe for UI effects, multi-device duplicate event delivery, and retry loops.
   */
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
      };
    }

    const ledger = this.getOrLoadLedger(ev.uid);

    // Idempotency & digest-conflict check across retries, reconnects, and multi-tab collisions
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
      };
    }

    const nextProgress = this.getLevelProgressForUid(ev.uid);
    const newTotalXp = nextProgress.totalXp ?? prevTotalXp + ev.deltaXp;
    const newLevel = nextProgress.level ?? calculateLevelFromTotalXp(newTotalXp);
    const levelChanged = newLevel !== prevLevel;

    if (levelChanged) {
      this.emitVerifiedLevelChangeAuditLog({
        uid: ev.uid,
        previousLevel: prevLevel,
        newLevel,
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
    };
  }

  /**
   * Async serialized wrapper for concurrent XP grants (`Promise.all` safe per UID).
   */
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
    previousTotalXp: number;
    newTotalXp: number;
    xpEventId: string;
    source: XpGrantSource;
    stageId?: number;
    gameMode?: string;
    roomCode?: string | null;
    timestampMs: number;
  }): void {
    const dedupKey = `${params.uid}|${params.xpEventId}|${params.previousLevel}->${params.newLevel}`;
    if (this.trackedEmittedLevelAuditKeys.has(dedupKey)) return;
    this.trackedEmittedLevelAuditKeys.add(dedupKey);

    SystemAuditLogger.getInstance().recordEvent({
      severity: 'INFO',
      category: 'CAMPAIGN_STAGE_EVENT',
      eventType: 'PLAYER_LEVEL_CHANGED',
      message: `Người chơi tăng cấp: Lv. ${params.previousLevel} → Lv. ${params.newLevel} (Tổng XP: ${params.previousTotalXp} → ${params.newTotalXp}).`,
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
        previousTotalXp: params.previousTotalXp,
        newTotalXp: params.newTotalXp,
        xpEventId: params.xpEventId,
        source: params.source,
        verificationStatus: 'CLIENT_LEDGER_OR_FIRESTORE_READ',
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
