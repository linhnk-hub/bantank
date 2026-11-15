/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.2 – OFFICIAL 50-LEVEL SYSTEM AUTOMATED VERIFICATION SUITE
 * Covers all mandatory requirements in Section 9:
 * - All 17 exact XP boundary thresholds + exhaustive Level 1..50 boundary table check
 * - Negative / NaN / Infinity / null / non-integer XP rejection
 * - Huge XP & Level 50 MAX LEVEL cap (continuing XP accumulation without Level > 50 or Lv.51 target)
 * - Concurrent XP grants (`Promise.all` serialization), retry idempotency, and 2-device eventId dedup
 * - Account switch, sign-out reset, unverified XP (`Lv. --`) vs confirmed `0 XP` (`Lv. 1`)
 * - Legacy `/users/{uid}` compatibility (`xp` & `totalXp`) without resetting XP, Rank, or Xu
 * - Stored `level` vs `totalXp` mismatch detection & read-only Admin consistency audit (no silent overwrite)
 * - Client direct override & localStorage tampering detection + enemy XP formula enforcement (`1/2/3/5`, zero stage-clear bonus)
 * - Level-Up Audit Logging (`PLAYER_LEVEL_CHANGED`) & strict sole-ADMIN RBAC
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  MIN_PLAYER_LEVEL,
  MAX_PLAYER_LEVEL,
  MAX_LEVEL_XP_REQUIRED,
  xpRequiredForLevel,
  getOfficialLevelThresholdTable,
  validateTotalXpValue,
  calculateLevelFromTotalXp,
  computePlayerLevelProgress,
  validateBattleXpGrantInput,
  auditUserDocumentLevelConsistency,
  buildBattleXpIdentifiers,
  LEDGER_STORAGE_PREFIX,
  PlayerLevelManager,
} from './playerLevelSystem.ts';
import { PlayerStatsManager } from './playerStatsManager.ts';
import { SCORE_VALUES } from './scoreManager.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';
import { ADMIN_EMAIL } from './authManager.ts';
import { GameEngine } from './gameEngine.ts';
import { buildAuthoritativeSnapshot } from './coopOnlineManager.ts';

export interface M752TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const ADMIN_ACTOR = {
  uid: 'uid_admin_m752',
  email: ADMIN_EMAIL,
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'ADMIN' as const,
};

const MOD_ACTOR = {
  uid: 'uid_mod_m752',
  email: 'mod.m752@gmail.com',
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'MOD' as const,
};

const PLAYER_ACTOR = {
  uid: 'uid_player_m752',
  email: 'player.m752@gmail.com',
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'PLAYER' as const,
};

export function runAllM7_5_2Tests(): { results: M752TestResult[] } {
  const results: M752TestResult[] = [];

  // =========================================================================
  // M7_5_2_T01: All 17 Mandatory XP Thresholds + Full L=1..50 Boundary Proof
  // =========================================================================
  {
    const mandatoryThresholds: ReadonlyArray<[number, number]> = [
      [0, 1],
      [99, 1],
      [100, 2],
      [299, 2],
      [300, 3],
      [599, 3],
      [600, 4],
      [999, 4],
      [1000, 5],
      [4499, 9],
      [4500, 10],
      [19000, 20],
      [43500, 30],
      [78000, 40],
      [122499, 49],
      [122500, 50],
      [200000, 50],
    ];

    let all17Matched = true;
    const mismatches: string[] = [];
    for (const [xp, expectedLv] of mandatoryThresholds) {
      const actualLv = calculateLevelFromTotalXp(xp);
      if (actualLv !== expectedLv) {
        all17Matched = false;
        mismatches.push(`${xp}->${actualLv}(expected ${expectedLv})`);
      }
    }

    // Exhaustively verify all 50 levels: XP_REQUIRED(L) -> L and XP_REQUIRED(L) - 1 -> L - 1
    const table = getOfficialLevelThresholdTable();
    let all50BoundariesOk = table.length === 50 && MAX_LEVEL_XP_REQUIRED === 122_500;
    for (let lv = MIN_PLAYER_LEVEL; lv <= MAX_PLAYER_LEVEL; lv++) {
      const req = xpRequiredForLevel(lv);
      const expectedFormula = (100 * lv * (lv - 1)) / 2;
      if (req !== expectedFormula || calculateLevelFromTotalXp(req) !== lv) {
        all50BoundariesOk = false;
        break;
      }
      if (lv > 1 && calculateLevelFromTotalXp(req - 1) !== lv - 1) {
        all50BoundariesOk = false;
        break;
      }
    }

    // Verify forbidden formula `sqrt(totalXp / 100) + 1` is NOT used in playerLevelSystem.ts
    const levelSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/core/playerLevelSystem.ts'),
      'utf-8'
    );
    const nonCommentLines = levelSrc
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
      .join('\n');
    const noForbiddenFormula = !nonCommentLines.includes('sqrt(totalXp / 100) + 1');

    const passed = all17Matched && all50BoundariesOk && noForbiddenFormula;
    results.push({
      id: 'M7_5_2_T01',
      name: 'Kiểm chứng toàn bộ 17 mốc XP bắt buộc (0→Lv1 .. 122499→Lv49, 122500→Lv50, 200000→Lv50) & biên chính xác L=1..50',
      passed,
      details: passed
        ? '17/17 mốc bắt buộc & 50/50 biên công thức 100*L*(L-1)/2 khớp tuyệt đối'
        : `Mismatches: ${mismatches.join(', ')}`,
    });
  }

  // =========================================================================
  // M7_5_2_T02: Progress Percentage, XP_NEXT, XP_REMAINING & Level 50 MAX LEVEL
  // =========================================================================
  {
    const lv1Zero = computePlayerLevelProgress(0, 'VERIFIED');
    const lv1Mid = computePlayerLevelProgress(50, 'VERIFIED'); // 50/100 = 50%
    const lv2Mid = computePlayerLevelProgress(200, 'VERIFIED'); // Lv2 floor=100, Lv3=300 -> (200-100)/200 = 50%
    const lv49Edge = computePlayerLevelProgress(122_499, 'VERIFIED'); // Lv49 floor=117600, Lv50=122500 (span 4900)
    const lv50Exact = computePlayerLevelProgress(122_500, 'VERIFIED');
    const lv50Huge = computePlayerLevelProgress(Number.MAX_SAFE_INTEGER, 'VERIFIED');

    const passed =
      lv1Zero.level === 1 &&
      lv1Zero.xpNext === 100 &&
      lv1Zero.xpRemaining === 100 &&
      lv1Zero.progressPercent === 0 &&
      lv1Zero.isMaxLevel === false &&
      lv1Mid.level === 1 &&
      lv1Mid.xpNext === 100 &&
      lv1Mid.xpRemaining === 50 &&
      lv1Mid.progressPercent === 50 &&
      lv2Mid.level === 2 &&
      lv2Mid.currentLevelFloorXp === 100 &&
      lv2Mid.xpNext === 300 &&
      lv2Mid.xpRemaining === 100 &&
      lv2Mid.progressPercent === 50 &&
      lv49Edge.level === 49 &&
      lv49Edge.xpNext === 122_500 &&
      lv49Edge.xpRemaining === 1 &&
      lv49Edge.isMaxLevel === false &&
      // Level 50: NO Level 51 XP requirement (xpNext === null), MAX LEVEL, continues holding totalXp
      lv50Exact.level === 50 &&
      lv50Exact.isMaxLevel === true &&
      lv50Exact.xpNext === null &&
      lv50Exact.xpRemaining === 0 &&
      lv50Exact.progressPercent === 100 &&
      lv50Exact.systemLabel.includes('MAX LEVEL') &&
      lv50Huge.level === 50 &&
      lv50Huge.isMaxLevel === true &&
      lv50Huge.xpNext === null &&
      lv50Huge.totalXp === Number.MAX_SAFE_INTEGER;

    results.push({
      id: 'M7_5_2_T02',
      name: 'Tính chính xác XP_NEXT, XP_REMAINING, PROGRESS (0–100%) và trạng thái MAX LEVEL tại Level 50 (không hiện mốc Lv.51, giữ XP rất lớn)',
      passed,
      details: `lv2Mid=${lv2Mid.progressPercent}%, lv49Rem=${lv49Edge.xpRemaining}, lv50Next=${String(lv50Exact.xpNext)}, maxSafeLv=${lv50Huge.level}`,
    });
  }

  // =========================================================================
  // M7_5_2_T03: Reject Negative, NaN, Infinity, Non-Integer Float & Non-Number XP
  // =========================================================================
  {
    const invalidInputs: unknown[] = [
      -1,
      -99999,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0.5,
      100.25,
      Number.MAX_SAFE_INTEGER + 1,
      '1000',
      null,
      undefined,
      {},
      [],
      true,
    ];

    let allRejected = true;
    for (const bad of invalidInputs) {
      const check = validateTotalXpValue(bad);
      if (check.valid !== false || check.sanitizedXp !== null) {
        allRejected = false;
        break;
      }
      let threwOnCalc = false;
      try {
        calculateLevelFromTotalXp(bad as number);
      } catch {
        threwOnCalc = true;
      }
      if (!threwOnCalc) {
        allRejected = false;
        break;
      }
    }

    const unverifiedFromInvalid = computePlayerLevelProgress(-50, 'VERIFIED');
    const passed =
      allRejected &&
      unverifiedFromInvalid.xpVerificationStatus === 'UNVERIFIED' &&
      unverifiedFromInvalid.level === null &&
      unverifiedFromInvalid.topMenuBadge === 'Lv. --';

    results.push({
      id: 'M7_5_2_T03',
      name: 'Từ chối nghiêm ngặt XP âm, NaN, Infinity, số thực không nguyên (100.25), vượt MAX_SAFE_INTEGER và dữ liệu sai kiểu',
      passed,
      details: `rejectedCount=${invalidInputs.length}/${invalidInputs.length}, fallbackBadge=${unverifiedFromInvalid.topMenuBadge}`,
    });
  }

  // =========================================================================
  // M7_5_2_T04: Enemy XP Formula Validation (1/2/3/5) & Zero Stage-Clear/Win Bonus
  // =========================================================================
  {
    // Keep exact enemy XP values
    const scoreValuesIntact =
      SCORE_VALUES.BASIC === 1 &&
      SCORE_VALUES.FAST === 2 &&
      SCORE_VALUES.POWER === 3 &&
      SCORE_VALUES.ARMOR === 5;

    // Valid stage breakdown: 10*1 + 8*2 + 7*3 + 5*5 = 10 + 16 + 21 + 25 = 72 XP (30 enemies)
    const validStage = validateBattleXpGrantInput({
      uid: 'uid_formula_1',
      eventId: 'ev_stage_valid_001',
      source: 'SOLO_BATTLE',
      stageId: 4,
      gameMode: 'SOLO',
      earnedXp: 72,
      defeatedByType: { BASIC: 10, FAST: 8, POWER: 7, ARMOR: 5 },
    });

    // Reject unapproved stage-clear bonus (+50 extra XP above enemy kills -> 122 != 72)
    const fakeWinBonus = validateBattleXpGrantInput({
      uid: 'uid_formula_1',
      eventId: 'ev_stage_bonus_002',
      source: 'SOLO_BATTLE',
      stageId: 4,
      gameMode: 'SOLO',
      earnedXp: 122,
      defeatedByType: { BASIC: 10, FAST: 8, POWER: 7, ARMOR: 5 },
    });

    // Reject > 30 enemies in a single stage
    const over30Enemies = validateBattleXpGrantInput({
      uid: 'uid_formula_1',
      eventId: 'ev_stage_overcap_003',
      source: 'SOLO_BATTLE',
      stageId: 4,
      gameMode: 'SOLO',
      earnedXp: 155,
      defeatedByType: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 31 },
    });

    const passed =
      scoreValuesIntact &&
      validStage.valid === true &&
      fakeWinBonus.valid === false &&
      fakeWinBonus.rejectionCode === 'XP_MISMATCH_ENEMY_FORMULA' &&
      over30Enemies.valid === false &&
      over30Enemies.rejectionCode === 'ENEMY_COUNT_EXCEEDS_STAGE_CAP';

    results.push({
      id: 'M7_5_2_T04',
      name: 'Bảo toàn giá trị XP xe địch (1/2/3/5), không cộng XP thưởng qua màn/thắng trận & chặn sự kiện vượt trần 30 xe/Stage',
      passed,
      details: `valid72=${validStage.valid}, fakeBonusRejected=${fakeWinBonus.rejectionCode}, over30Rejected=${over30Enemies.rejectionCode}`,
    });
  }

  // =========================================================================
  // M7_5_2_T05: Retry Idempotency & Multi-Device Duplicate eventId Deduplication
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const logger = SystemAuditLogger.getInstance();
    const uidRetry = 'uid_m752_retry_dedup';
    statsMgr.clearUidStatsForTesting(uidRetry);

    // Start at 90 XP (Lv. 1)
    statsMgr.applyCloudUserDocData(uidRetry, { uid: uidRetry, totalXp: 90 });

    // Grant +25 XP (5 ARMOR) -> crosses 100 XP into Lv. 2 (115 XP)
    const firstAttempt = statsMgr.recordMatchOutcome({
      uid: uidRetry,
      runKey: 'coop_BT8888_st2_run1',
      xpEventId: 'ev_coop_BT8888_st2_run1',
      outcome: 'WIN',
      stageId: 2,
      gameMode: 'TWO_PLAYERS_ONLINE',
      earnedScoreXp: 25,
      defeatedByType: { ARMOR: 5 },
      roomCode: 'BT8888',
      timestampMs: 1_770_000_000_000,
    });

    // Retry #1 & Retry #2 (simulating network reconnect + 2nd device receiving same eventId)
    const retryAttempt1 = statsMgr.recordMatchOutcome({
      uid: uidRetry,
      runKey: 'coop_BT8888_st2_run1',
      xpEventId: 'ev_coop_BT8888_st2_run1',
      outcome: 'WIN',
      stageId: 2,
      gameMode: 'TWO_PLAYERS_ONLINE',
      earnedScoreXp: 25,
      defeatedByType: { ARMOR: 5 },
      roomCode: 'BT8888',
      timestampMs: 1_770_000_001_000,
    });

    // Simulate cloud snapshot arriving from Device 1 that already includes `ev_coop_BT8888_st2_run1` in `totalXp: 115`
    statsMgr.applyCloudUserDocData(uidRetry, {
      uid: uidRetry,
      totalXp: 115,
      appliedXpEventIds: ['ev_coop_BT8888_st2_run1'],
    });

    const snapAfterSync = statsMgr.getPlayerStatisticsSnapshot(uidRetry);
    const levelLogsForUid = logger
      .queryPlayerLevelHistory({ uid: uidRetry }, ADMIN_ACTOR)
      .items.filter((e) => e.eventType === 'PLAYER_LEVEL_CHANGED');

    const passed =
      firstAttempt?.accepted === true &&
      firstAttempt.duplicateIgnored === false &&
      firstAttempt.levelChanged === true &&
      firstAttempt.previousLevel === 1 &&
      firstAttempt.newLevel === 2 &&
      retryAttempt1?.accepted === true &&
      retryAttempt1.duplicateIgnored === true &&
      retryAttempt1.levelChanged === false &&
      snapAfterSync.totalXp === 115 && // Must NOT double-count to 140!
      snapAfterSync.level === 2 &&
      snapAfterSync.matchesPlayed === 1 &&
      levelLogsForUid.length === 1;

    statsMgr.clearUidStatsForTesting(uidRetry);
    results.push({
      id: 'M7_5_2_T05',
      name: 'Chống cộng trùng XP khi retry giao dịch, mất mạng kết nối lại hoặc 2 thiết bị cùng nhận 1 eventId',
      passed,
      details: `totalXp=${snapAfterSync.totalXp} (expected 115), level=${snapAfterSync.level}, levelUpLogs=${levelLogsForUid.length}`,
    });
  }

  // =========================================================================
  // M7_5_2_T06: Account Switch, Logout Reset, Unverified XP (`Lv. --`) vs New Account `0 XP` (`Lv. 1`)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidNewVerified = 'uid_m752_new_zero';
    const uidPendingUnverified = 'uid_m752_pending_unverified';
    const uidVet = 'uid_m752_veteran_lv20';

    statsMgr.clearUidStatsForTesting(uidNewVerified);
    statsMgr.clearUidStatsForTesting(uidPendingUnverified);
    statsMgr.clearUidStatsForTesting(uidVet);

    // 1. Pending unverified account -> MUST NOT fake Lv. 1!
    const snapUnverified = statsMgr.getPlayerStatisticsSnapshot(uidPendingUnverified);

    // 2. Session ACTIVE alone BEFORE Firestore responds -> MUST STILL be UNVERIFIED (`Lv. --`), NEVER premature Lv. 1!
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidNewVerified,
      sessionId: 'sess_new_01',
      timestampMs: 1_770_010_000_000,
    });
    const snapBeforeFirestore = statsMgr.getPlayerStatisticsSnapshot(uidNewVerified);

    // After Firestore confirms new/empty account (`totalXp = 0`) -> Level 1 (`Lv. 1`)
    statsMgr.applyCloudUserDocData(uidNewVerified, {
      uid: uidNewVerified,
      totalXp: 0,
    });
    const snapNewZero = statsMgr.getPlayerStatisticsSnapshot(uidNewVerified);

    // 3. Veteran account (`totalXp: 19000` -> Level 20)
    statsMgr.applyCloudUserDocData(uidVet, {
      uid: uidVet,
      totalXp: 19_000,
      rank: 'MAJOR',
      xu: 880,
    });
    const snapVet = statsMgr.getPlayerStatisticsSnapshot(uidVet);

    // 4. Logout -> null snapshot resets cleanly to `Lv. --`
    const snapLogout = statsMgr.getPlayerStatisticsSnapshot(null);

    const passed =
      snapUnverified.xpVerificationStatus === 'UNVERIFIED' &&
      snapUnverified.level === null &&
      snapUnverified.levelTopMenuBadge === 'Lv. --' &&
      snapBeforeFirestore.xpVerificationStatus === 'UNVERIFIED' &&
      snapBeforeFirestore.level === null &&
      snapBeforeFirestore.levelTopMenuBadge === 'Lv. --' &&
      snapNewZero.xpVerificationStatus === 'VERIFIED' &&
      snapNewZero.totalXp === 0 &&
      snapNewZero.level === 1 &&
      snapNewZero.levelTopMenuBadge === 'Lv. 1' &&
      snapNewZero.xpNext === 100 &&
      snapNewZero.xpRemaining === 100 &&
      snapVet.level === 20 &&
      snapVet.levelTopMenuBadge === 'Lv. 20' &&
      snapVet.pvpRankCode === 'MAJOR' &&
      snapVet.xuBalance === 880 &&
      snapLogout.level === null &&
      snapLogout.levelTopMenuBadge === 'Lv. --';

    statsMgr.clearUidStatsForTesting(uidNewVerified);
    statsMgr.clearUidStatsForTesting(uidPendingUnverified);
    statsMgr.clearUidStatsForTesting(uidVet);

    results.push({
      id: 'M7_5_2_T06',
      name: 'Xử lý đúng XP chưa xác minh (Lv. --), không xác nhận sớm Lv. 1 trước Firestore, tài khoản mới totalXp=0 (Lv. 1), đổi tài khoản và đăng xuất',
      passed,
      details: `unverified=${snapUnverified.levelTopMenuBadge}, beforeFirestore=${snapBeforeFirestore.levelTopMenuBadge}, newZero=${snapNewZero.levelTopMenuBadge}, vet=${snapVet.levelTopMenuBadge}, logout=${snapLogout.levelTopMenuBadge}`,
    });
  }

  // =========================================================================
  // M7_5_2_T07: Strict Independence of Level (1–50), PvP Rank, and Currency (Xu)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidIndep = 'uid_m752_indep_check';
    statsMgr.clearUidStatsForTesting(uidIndep);

    statsMgr.applyCloudUserDocData(uidIndep, {
      uid: uidIndep,
      xp: 0,
      rank: 'PRIVATE',
      xu: 250,
    });
    const before = statsMgr.getPlayerStatisticsSnapshot(uidIndep);

    // Advance all the way to Level 50 (totalXp = 125,000) via cloud XP sync -> Rank & Xu MUST NOT change!
    statsMgr.applyCloudUserDocData(uidIndep, {
      uid: uidIndep,
      totalXp: 125_000,
      rank: 'PRIVATE',
      xu: 250,
    });
    const afterLv50 = statsMgr.getPlayerStatisticsSnapshot(uidIndep);

    // Continue accumulating battle XP at Level 50 (+150 XP = 30 ARMOR) -> totalXp = 125,150, Level stays 50, Rank & Xu unchanged!
    statsMgr.recordMatchOutcome({
      uid: uidIndep,
      runKey: 'lv50_extra_xp_run',
      outcome: 'LOSS', // Even on stage failure, valid defeated enemies XP still counts!
      stageId: 10,
      gameMode: 'SOLO',
      earnedScoreXp: 150,
      defeatedByType: { ARMOR: 30 },
      timestampMs: 1_770_020_000_000,
    });
    const afterExtraXpAt50 = statsMgr.getPlayerStatisticsSnapshot(uidIndep);

    const passed =
      before.level === 1 &&
      before.pvpRankCode === 'PRIVATE' &&
      before.xuBalance === 250 &&
      afterLv50.level === 50 &&
      afterLv50.isMaxLevel === true &&
      afterLv50.pvpRankCode === 'PRIVATE' &&
      afterLv50.xuBalance === 250 &&
      afterExtraXpAt50.level === 50 &&
      afterExtraXpAt50.totalXp === 125_150 &&
      afterExtraXpAt50.pvpRankCode === 'PRIVATE' &&
      afterExtraXpAt50.xuBalance === 250;

    statsMgr.clearUidStatsForTesting(uidIndep);

    results.push({
      id: 'M7_5_2_T07',
      name: 'Độc lập tuyệt đối giữa Level, Quân hàm PvP và Xu; đạt Level 50 vẫn tiếp tục tích lũy XP (kể cả trận thua) và không vượt quá 50',
      passed,
      details: `lv=${before.level}→${afterExtraXpAt50.level}, xp=${afterExtraXpAt50.totalXp}, rank=${afterExtraXpAt50.pvpRankCode}, xu=${afterExtraXpAt50.xuBalance}`,
    });
  }

  // =========================================================================
  // M7_5_2_T08: Legacy Data Compatibility & Mismatch Detection Without Silent Overwrite
  // =========================================================================
  {
    const consistentLegacy = auditUserDocumentLevelConsistency('uid_leg_ok', {
      xp: 1000,
      level: 5,
      rank: 'CORPORAL',
      xu: 400,
    });

    const wrongStoredLevel = auditUserDocumentLevelConsistency('uid_leg_wrong_lv', {
      xp: 1000, // Expected Level 5
      level: 25, // Mismatched stored level!
    });

    const outOfRangeLevel = auditUserDocumentLevelConsistency('uid_leg_oor', {
      totalXp: 150_000, // Expected Level 50
      level: 65, // > 50!
    });

    const conflictingXpFields = auditUserDocumentLevelConsistency('uid_leg_conflict_xp', {
      totalXp: 4500, // Level 10
      xp: 300,
    });

    const passed =
      consistentLegacy.isConsistent === true &&
      consistentLegacy.expectedLevel === 5 &&
      consistentLegacy.resolvedVerifiedTotalXp === 1000 &&
      wrongStoredLevel.isConsistent === false &&
      wrongStoredLevel.expectedLevel === 5 &&
      wrongStoredLevel.discrepancyCodes.includes('STORED_LEVEL_MISMATCH_FORMULA') &&
      outOfRangeLevel.isConsistent === false &&
      outOfRangeLevel.expectedLevel === 50 &&
      outOfRangeLevel.discrepancyCodes.includes('STORED_LEVEL_OUT_OF_RANGE') &&
      conflictingXpFields.isConsistent === false &&
      conflictingXpFields.expectedLevel === 10 &&
      conflictingXpFields.discrepancyCodes.includes('TOTAL_XP_LEGACY_XP_CONFLICT');

    results.push({
      id: 'M7_5_2_T08',
      name: 'Tương thích dữ liệu cũ (xp & totalXp) không reset dữ liệu; phát hiện chính xác lệch trường level mà không tự ghi đè Production',
      passed,
      details: `legOk=${consistentLegacy.isConsistent}, wrongLvCodes=${wrongStoredLevel.discrepancyCodes.join(',')}, oorCodes=${outOfRangeLevel.discrepancyCodes.join(',')}`,
    });
  }

  // =========================================================================
  // M7_5_2_T09: Client Direct Override Rejection & Browser Storage Tamper Protection
  // =========================================================================
  {
    const levelMgr = PlayerLevelManager.getInstance();
    const logger = SystemAuditLogger.getInstance();
    const uidTamper = 'uid_m752_tamper_test';
    levelMgr.clearUidForTesting(uidTamper);

    // 1. Direct client override attempt must be rejected & logged
    const directOverride = levelMgr.attemptDirectClientOverride({
      uid: uidTamper,
      attemptedTotalXp: 999_999,
      attemptedLevel: 50,
      callerSource: 'DevToolsConsole',
    });

    // 2. Simulate localStorage tampering (if window.localStorage exists or via custom mock)
    const prevWindow = (globalThis as { window?: unknown }).window;
    const memStore = new Map<string, string>();
    if (!prevWindow) {
      (globalThis as { window?: unknown }).window = {
        localStorage: {
          getItem: (k: string) => memStore.get(k) ?? null,
          setItem: (k: string, v: string) => {
            memStore.set(k, v);
          },
          removeItem: (k: string) => {
            memStore.delete(k);
          },
        },
        addEventListener: () => undefined,
      };
    }

    let storageTamperRejected = false;
    try {
      levelMgr.clearUidForTesting(uidTamper);
      levelMgr.grantVerifiedBattleXpSync({
        uid: uidTamper,
        eventId: 'ev_legit_001',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 50,
        defeatedByType: { ARMOR: 10 },
      });

      const ls = (globalThis as unknown as { window: { localStorage: Storage } }).window.localStorage;
      const key = `bantank_m752_level_ledger_v1_${uidTamper}`;
      const rawSaved = ls.getItem(key);
      if (rawSaved) {
        // Forged JSON: change deltaXp from 50 to 122500 without valid formula/signature
        const forged = JSON.parse(rawSaved) as Record<string, unknown>;
        (forged.events as Array<Record<string, unknown>>)[0].deltaXp = 122_500;
        ls.setItem(key, JSON.stringify(forged));
      }

      const integrityCheck = levelMgr.revalidateLocalStorageIntegrity(uidTamper);
      const afterTamperProgress = levelMgr.getLevelProgressForUid(uidTamper);
      storageTamperRejected =
        integrityCheck.intact === false &&
        afterTamperProgress.xpVerificationStatus === 'UNVERIFIED' &&
        afterTamperProgress.level === null;
    } finally {
      levelMgr.clearUidForTesting(uidTamper);
      if (!prevWindow) {
        delete (globalThis as { window?: unknown }).window;
      }
    }

    const tamperLogs = logger
      .queryPlayerLevelHistory({ uid: uidTamper }, ADMIN_ACTOR)
      .items.filter((e) => e.eventType === 'CLIENT_XP_TAMPER_REJECTED');

    const passed =
      directOverride.allowed === false &&
      directOverride.errorCode === 'DIRECT_CLIENT_OVERRIDE_FORBIDDEN' &&
      storageTamperRejected &&
      tamperLogs.length >= 2;

    results.push({
      id: 'M7_5_2_T09',
      name: 'Chặn client tự ghi đè totalXp/level & phát hiện/vô hiệu hóa dữ liệu giả mạo trong localStorage kèm log bảo mật',
      passed,
      details: `directAllowed=${directOverride.allowed}, storageTamperRejected=${storageTamperRejected}, securityLogs=${tamperLogs.length}`,
    });
  }

  // =========================================================================
  // M7_5_2_T10: Level-Up Audit Schema, RBAC (ADMIN only) & Protected Files Check
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const logger = SystemAuditLogger.getInstance();
    const uidAudit = 'uid_m752_level_audit';
    statsMgr.clearUidStatsForTesting(uidAudit);

    statsMgr.applyCloudUserDocData(uidAudit, { uid: uidAudit, totalXp: 280 }); // Lv. 2 (floor 100, next 300)
    // +10 XP -> 290 XP (still Lv. 2 -> MUST NOT emit PLAYER_LEVEL_CHANGED)
    statsMgr.recordMatchOutcome({
      uid: uidAudit,
      runKey: 'audit_stay_lv2',
      xpEventId: 'ev_audit_stay_lv2',
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 10,
      defeatedByType: { ARMOR: 2 },
      timestampMs: 1_770_050_000_000,
    });
    // +20 XP -> 310 XP (Lv. 2 -> Lv. 3! MUST emit PLAYER_LEVEL_CHANGED with full schema)
    statsMgr.recordMatchOutcome({
      uid: uidAudit,
      runKey: 'audit_up_lv3',
      xpEventId: 'ev_audit_up_lv3',
      outcome: 'WIN',
      stageId: 2,
      gameMode: 'SOLO',
      earnedScoreXp: 20,
      defeatedByType: { ARMOR: 4 },
      timestampMs: 1_770_050_060_000,
    });

    const adminQuery = logger.queryPlayerLevelHistory({ uid: uidAudit }, ADMIN_ACTOR);
    const modQuery = logger.queryPlayerLevelHistory({ uid: uidAudit }, MOD_ACTOR);
    const playerQuery = logger.queryPlayerLevelHistory({ uid: uidAudit }, PLAYER_ACTOR);

    const lvChangeEntry = adminQuery.items.find((e) => e.eventType === 'PLAYER_LEVEL_CHANGED');
    const meta = (lvChangeEntry?.metadata ?? {}) as Record<string, unknown>;

    const firestoreRulesExists = fs.existsSync(path.resolve(process.cwd(), 'firestore.rules'));
    const storageRulesExists = fs.existsSync(path.resolve(process.cwd(), 'storage.rules'));
    const landingExists = fs.existsSync(path.resolve(process.cwd(), 'public/landing.html'));

    const passed =
      adminQuery.success === true &&
      adminQuery.items.filter((e) => e.eventType === 'PLAYER_LEVEL_CHANGED').length === 1 &&
      meta.uid === uidAudit &&
      meta.previousLevel === 2 &&
      meta.newLevel === 3 &&
      meta.previousTotalXp === 290 &&
      meta.newTotalXp === 310 &&
      meta.xpEventId === 'ev_audit_up_lv3' &&
      typeof meta.source === 'string' &&
      typeof meta.verificationStatus === 'string' &&
      modQuery.success === false &&
      modQuery.errorCode === 'PERMISSION_DENIED' &&
      playerQuery.success === false &&
      playerQuery.errorCode === 'PERMISSION_DENIED' &&
      firestoreRulesExists &&
      storageRulesExists &&
      landingExists;

    statsMgr.clearUidStatsForTesting(uidAudit);

    results.push({
      id: 'M7_5_2_T10',
      name: 'Ghi log kiểm toán Level (PLAYER_LEVEL_CHANGED) đúng khi đổi cấp, phân quyền chỉ ADMIN tra cứu & bảo toàn file hệ thống',
      passed,
      details: `adminOk=${adminQuery.success}, prevLv=${String(meta.previousLevel)}→${String(meta.newLevel)}, modDenied=${modQuery.errorCode}, playerDenied=${playerQuery.errorCode}`,
    });
  }

  // =========================================================================
  // M7_5_2_T11: Consecutive SOLO Stage 1 Matches Mint Unique matchInstanceId & xpEventId (Fix #1a + Online Sync)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidSolo = 'uid_m7522_solo_2x';
    statsMgr.clearUidStatsForTesting(uidSolo);
    statsMgr.applyCloudUserDocData(uidSolo, { uid: uidSolo, totalXp: 0 });

    const eng = new GameEngine(undefined, undefined, true);
    eng.startMatch('SOLO', 'DEFAULT', { stageId: 1, uid: uidSolo, enforceProgression: false });
    const match1Id = eng.getState().matchInstanceId!;
    const ids1 = buildBattleXpIdentifiers({
      uid: uidSolo,
      gameMode: eng.getState().gameMode!,
      matchInstanceId: match1Id,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const res1 = statsMgr.recordMatchOutcome({
      uid: uidSolo,
      runKey: ids1.runKey,
      xpEventId: ids1.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 35,
      defeatedByType: { BASIC: 15, FAST: 10 },
      timestampMs: 1_772_000_000_000,
    });

    // Start a brand-new SOLO Stage 1 match (stageRunSeq resets to 1, MUST get new matchInstanceId!)
    eng.startMatch('SOLO', 'DEFAULT', { stageId: 1, uid: uidSolo, enforceProgression: false });
    const match2Id = eng.getState().matchInstanceId!;
    const ids2 = buildBattleXpIdentifiers({
      uid: uidSolo,
      gameMode: eng.getState().gameMode!,
      matchInstanceId: match2Id,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const res2 = statsMgr.recordMatchOutcome({
      uid: uidSolo,
      runKey: ids2.runKey,
      xpEventId: ids2.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 35,
      defeatedByType: { BASIC: 15, FAST: 10 },
      timestampMs: 1_772_000_060_000,
    });

    // Also verify TWO_PLAYERS_ONLINE authoritative snapshot propagates matchInstanceId and rematch gets new matchInstanceId
    const hostEng = new GameEngine(undefined, undefined, true);
    const guestEng = new GameEngine(undefined, undefined, true);
    hostEng.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: 1, uid: uidSolo, enforceProgression: false });
    const onlineMatch1Id = hostEng.getState().matchInstanceId!;
    const snap = buildAuthoritativeSnapshot(hostEng.getState(), 1);
    const guestApply = guestEng.applyAuthoritativeSnapshot(snap);
    const guestMatch1Id = guestEng.getState().matchInstanceId;
    hostEng.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT', { stageId: 1, uid: uidSolo, enforceProgression: false });
    const onlineMatch2Id = hostEng.getState().matchInstanceId!;

    const finalSnap = statsMgr.getPlayerStatisticsSnapshot(uidSolo);
    const passed =
      Boolean(match1Id) &&
      Boolean(match2Id) &&
      match1Id !== match2Id &&
      ids1.xpEventId !== ids2.xpEventId &&
      res1?.accepted === true &&
      res1.duplicateIgnored === false &&
      res2?.accepted === true &&
      res2.duplicateIgnored === false &&
      finalSnap.totalXp === 70 &&
      finalSnap.matchesPlayed === 2 &&
      guestApply.valid === true &&
      guestMatch1Id === onlineMatch1Id &&
      onlineMatch2Id !== onlineMatch1Id;

    statsMgr.clearUidStatsForTesting(uidSolo);
    results.push({
      id: 'M7_5_2_T11',
      name: 'M7.5.2.2 Fix #1a: Chơi 2 trận SOLO Stage 1 liên tiếp (và Co-op Online rematch) tạo matchInstanceId & xpEventId khác nhau, cộng đủ cả 2 trận',
      passed,
      details: `m1=${match1Id}, m2=${match2Id}, totalXp=${finalSnap.totalXp}, onlineSynced=${guestMatch1Id === onlineMatch1Id}`,
    });
  }

  // =========================================================================
  // M7_5_2_T12: Consecutive CO-OP AI Stage 1 Matches Mint Unique xpEventId (Fix #1b)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidCoopAi = 'uid_m7522_coop_ai_2x';
    statsMgr.clearUidStatsForTesting(uidCoopAi);
    statsMgr.applyCloudUserDocData(uidCoopAi, { uid: uidCoopAi, totalXp: 0 });

    const eng = new GameEngine(undefined, undefined, true);
    eng.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1, uid: uidCoopAi, enforceProgression: false });
    const ids1 = buildBattleXpIdentifiers({
      uid: uidCoopAi,
      gameMode: eng.getState().gameMode!,
      matchInstanceId: eng.getState().matchInstanceId!,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const res1 = statsMgr.recordMatchOutcome({
      uid: uidCoopAi,
      runKey: ids1.runKey,
      xpEventId: ids1.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'TWO_PLAYERS_AI',
      earnedScoreXp: 50,
      defeatedByType: { ARMOR: 10 },
      timestampMs: 1_772_001_000_000,
    });

    eng.startMatch('TWO_PLAYERS_AI', 'DEFAULT', { stageId: 1, uid: uidCoopAi, enforceProgression: false });
    const ids2 = buildBattleXpIdentifiers({
      uid: uidCoopAi,
      gameMode: eng.getState().gameMode!,
      matchInstanceId: eng.getState().matchInstanceId!,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const res2 = statsMgr.recordMatchOutcome({
      uid: uidCoopAi,
      runKey: ids2.runKey,
      xpEventId: ids2.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'TWO_PLAYERS_AI',
      earnedScoreXp: 50,
      defeatedByType: { ARMOR: 10 },
      timestampMs: 1_772_001_060_000,
    });

    const snap = statsMgr.getPlayerStatisticsSnapshot(uidCoopAi);
    const passed =
      ids1.xpEventId !== ids2.xpEventId &&
      res1?.accepted === true &&
      res1.duplicateIgnored === false &&
      res2?.accepted === true &&
      res2.duplicateIgnored === false &&
      snap.totalXp === 100 &&
      snap.level === 2 &&
      snap.matchesPlayed === 2;

    statsMgr.clearUidStatsForTesting(uidCoopAi);
    results.push({
      id: 'M7_5_2_T12',
      name: 'M7.5.2.2 Fix #1b: Chơi 2 trận CO-OP AI Stage 1 liên tiếp tạo xpEventId khác nhau và ghi nhận đủ XP',
      passed,
      details: `totalXp=${snap.totalXp}, level=${snap.level}, matches=${snap.matchesPlayed}`,
    });
  }

  // =========================================================================
  // M7_5_2_T13: Same Finished Result Retry Preserves xpEventId & Stage 1->2 Advance Gets Distinct IDs (Fix #1c)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidStageAdv = 'uid_m7522_stage_adv';
    statsMgr.clearUidStatsForTesting(uidStageAdv);
    statsMgr.applyCloudUserDocData(uidStageAdv, { uid: uidStageAdv, totalXp: 0 });

    const eng = new GameEngine(undefined, undefined, true);
    eng.startMatch('SOLO', 'DEFAULT', { stageId: 1, enforceProgression: false });
    const matchId = eng.getState().matchInstanceId!;

    const st1Ids = buildBattleXpIdentifiers({
      uid: uidStageAdv,
      gameMode: 'SOLO',
      matchInstanceId: matchId,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const st1RetryIds = buildBattleXpIdentifiers({
      uid: uidStageAdv,
      gameMode: 'SOLO',
      matchInstanceId: matchId,
      stageId: 1,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });

    const firstSt1 = statsMgr.recordMatchOutcome({
      uid: uidStageAdv,
      runKey: st1Ids.runKey,
      xpEventId: st1Ids.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 40,
      defeatedByType: { POWER: 10, FAST: 5 },
      timestampMs: 1_772_002_000_000,
    });
    const retrySt1 = statsMgr.recordMatchOutcome({
      uid: uidStageAdv,
      runKey: st1RetryIds.runKey,
      xpEventId: st1RetryIds.xpEventId,
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 40,
      defeatedByType: { POWER: 10, FAST: 5 },
      timestampMs: 1_772_002_005_000,
    });

    // Advance to Stage 2 inside the SAME match (keeps matchId, increments stageRunSeq, stageId=2)
    const advanced = eng.advanceToNextStage();
    const st2Ids = buildBattleXpIdentifiers({
      uid: uidStageAdv,
      gameMode: 'SOLO',
      matchInstanceId: eng.getState().matchInstanceId!,
      stageId: eng.getState().currentStageId,
      stageRunSeq: eng.getState().stageRunSeq,
      outcome: 'WIN',
    });
    const st2Res = statsMgr.recordMatchOutcome({
      uid: uidStageAdv,
      runKey: st2Ids.runKey,
      xpEventId: st2Ids.xpEventId,
      outcome: 'WIN',
      stageId: 2,
      gameMode: 'SOLO',
      earnedScoreXp: 60,
      defeatedByType: { ARMOR: 12 },
      timestampMs: 1_772_002_060_000,
    });

    const snap = statsMgr.getPlayerStatisticsSnapshot(uidStageAdv);
    const passed =
      st1Ids.xpEventId === st1RetryIds.xpEventId &&
      firstSt1?.accepted === true &&
      firstSt1.duplicateIgnored === false &&
      retrySt1?.accepted === true &&
      retrySt1.duplicateIgnored === true &&
      advanced === true &&
      eng.getState().matchInstanceId === matchId &&
      st2Ids.xpEventId !== st1Ids.xpEventId &&
      st2Res?.accepted === true &&
      st2Res.duplicateIgnored === false &&
      snap.totalXp === 100 &&
      snap.level === 2 &&
      snap.matchesPlayed === 2;

    statsMgr.clearUidStatsForTesting(uidStageAdv);
    results.push({
      id: 'M7_5_2_T13',
      name: 'M7.5.2.2 Fix #1c: Retry cùng kết quả giữ nguyên xpEventId (không cộng trùng) & qua Stage 2 cùng trận có định danh riêng',
      passed,
      details: `retryIgnored=${retrySt1?.duplicateIgnored}, st2Distinct=${st2Ids.xpEventId !== st1Ids.xpEventId}, totalXp=${snap.totalXp}`,
    });
  }

  // =========================================================================
  // M7_5_2_T14: Multi-Tab Concurrent XP Update Safe Merge Without Overwrite (Fix #2a)
  // =========================================================================
  {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const memStore = new Map<string, string>();
    const storageListeners = new Set<(ev: StorageEvent) => void>();
    const mockStorage = {
      getItem: (k: string) => memStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memStore.set(k, v);
      },
      removeItem: (k: string) => {
        memStore.delete(k);
      },
    };
    (globalThis as { window?: unknown }).window = {
      localStorage: mockStorage,
      addEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.add(cb);
      },
      removeEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.delete(cb);
      },
    };

    const uidMultiTab = 'uid_m7522_multitab_merge';
    let passed = false;
    let details = '';
    try {
      const tabA = PlayerLevelManager.createIsolatedTabInstanceForTesting();
      const tabB = PlayerLevelManager.createIsolatedTabInstanceForTesting();

      // Both tabs initialize with same 50 XP cloud baseline in RAM
      tabA.applyFirestoreUserDocument(uidMultiTab, { uid: uidMultiTab, totalXp: 50 }, 1_772_010_000_000);
      tabB.applyFirestoreUserDocument(uidMultiTab, { uid: uidMultiTab, totalXp: 50 }, 1_772_010_000_000);

      // Tab A finishes a match (+30 XP -> 80 XP) and writes to localStorage
      const grantA = tabA.grantVerifiedBattleXpSync({
        uid: uidMultiTab,
        eventId: 'ev_tabA_match1',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 30,
        defeatedByType: { ARMOR: 6 },
        timestampMs: 1_772_010_010_000,
      });

      // Tab B STILL has stale RAM (only 50 XP, does NOT have ev_tabA_match1 yet) and finishes match 2 (+40 XP)
      const grantB = tabB.grantVerifiedBattleXpSync({
        uid: uidMultiTab,
        eventId: 'ev_tabB_match2',
        source: 'SOLO_BATTLE',
        stageId: 2,
        gameMode: 'SOLO',
        earnedXp: 40,
        defeatedByType: { ARMOR: 8 },
        timestampMs: 1_772_010_020_000,
      });

      const progB = tabB.getLevelProgressForUid(uidMultiTab);
      const progA = tabA.getLevelProgressForUid(uidMultiTab);

      // Expected: 50 baseline + 30 (Tab A) + 40 (Tab B) = 120 XP (Lv. 2), ZERO lost XP!
      passed =
        grantA.accepted === true &&
        grantB.accepted === true &&
        progB.totalXp === 120 &&
        progB.level === 2 &&
        progA.totalXp === 120 &&
        progA.level === 2;
      details = `tabA=${progA.totalXp}, tabB=${progB.totalXp} (expected 120)`;
    } finally {
      memStore.clear();
      if (prevWindow !== undefined) {
        (globalThis as { window?: unknown }).window = prevWindow;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      PlayerLevelManager.getInstance().ensureWindowStorageListener();
    }

    results.push({
      id: 'M7_5_2_T14',
      name: 'M7.5.2.2 Fix #2a: Hai tab cập nhật XP gần đồng thời trên localStorage merge an toàn, không mất XP của tab kia',
      passed,
      details,
    });
  }

  // =========================================================================
  // M7_5_2_T15: Multi-Tab `storage` Event Reactive Sync & Conflict Detection (Fix #2b)
  // =========================================================================
  {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const memStore = new Map<string, string>();
    const storageListeners = new Set<(ev: StorageEvent) => void>();
    const mockStorage = {
      getItem: (k: string) => memStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memStore.set(k, v);
      },
      removeItem: (k: string) => {
        memStore.delete(k);
      },
    };
    (globalThis as { window?: unknown }).window = {
      localStorage: mockStorage,
      addEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.add(cb);
      },
      removeEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.delete(cb);
      },
    };

    const uidSyncConflict = 'uid_m7522_storage_sync';
    let passed = false;
    let details = '';
    try {
      const tab1 = PlayerLevelManager.createIsolatedTabInstanceForTesting();
      const tab2 = PlayerLevelManager.createIsolatedTabInstanceForTesting();

      let tab2SyncNotified = 0;
      tab2.subscribeExternalSync((changedUid) => {
        if (changedUid === uidSyncConflict) tab2SyncNotified += 1;
      });

      tab1.applyFirestoreUserDocument(uidSyncConflict, { uid: uidSyncConflict, totalXp: 80 }, 1_772_020_000_000);
      tab2.applyFirestoreUserDocument(uidSyncConflict, { uid: uidSyncConflict, totalXp: 80 }, 1_772_020_000_000);

      // Tab 1 commits +25 XP -> 105 XP (Lv. 2) and browser fires `storage` event to Tab 2
      tab1.grantVerifiedBattleXpSync({
        uid: uidSyncConflict,
        eventId: 'ev_tab1_push',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 25,
        defeatedByType: { ARMOR: 5 },
        timestampMs: 1_772_020_005_000,
      });
      const storageKey = `${LEDGER_STORAGE_PREFIX}${uidSyncConflict}`;
      const newDiskVal = memStore.get(storageKey) ?? null;
      for (const cb of storageListeners) {
        cb({ key: storageKey, newValue: newDiskVal } as StorageEvent);
      }
      const tab2ProgAfterEvent = tab2.getLevelProgressForUid(uidSyncConflict);

      // Now simulate UNMERGEABLE CONFLICT:
      // Tab 3 holds an incompatible cloudBaselineXp (500 at same sync timestamp 1_772_020_000_000) while disk has 80 at 1_772_020_000_000
      const tab3 = PlayerLevelManager.createIsolatedTabInstanceForTesting();
      // Give tab3 only RAM state by temporarily swapping storage key out before setting conflicting RAM baseline
      const savedDiskBeforeTab3 = memStore.get(storageKey)!;
      memStore.delete(storageKey);
      tab3.applyFirestoreUserDocument(uidSyncConflict, { uid: uidSyncConflict, totalXp: 500 }, 1_772_020_000_000);
      // Restore Tab 1's valid disk ledger (baseline=80 + ev_tab1_push=25 = 105 XP)
      memStore.set(storageKey, savedDiskBeforeTab3);

      const conflictAttempt = tab3.grantVerifiedBattleXpSync({
        uid: uidSyncConflict,
        eventId: 'ev_tab3_conflict',
        source: 'SOLO_BATTLE',
        stageId: 3,
        gameMode: 'SOLO',
        earnedXp: 15,
        defeatedByType: { ARMOR: 3 },
        timestampMs: 1_772_020_010_000,
      });
      const diskAfterConflictAttempt = memStore.get(storageKey);
      const conflictInfo = tab3.getMultiTabConflict(uidSyncConflict);

      passed =
        tab2SyncNotified >= 1 &&
        tab2ProgAfterEvent.totalXp === 105 &&
        tab2ProgAfterEvent.level === 2 &&
        conflictAttempt.accepted === false &&
        conflictAttempt.rejectionCode === 'MULTI_TAB_CONFLICT_DETECTED' &&
        conflictInfo?.reasonCode === 'CONFLICTING_CLOUD_BASELINE' &&
        diskAfterConflictAttempt === savedDiskBeforeTab3; // Disk NOT silently overwritten!

      details = `tab2Notified=${tab2SyncNotified}, tab2Xp=${tab2ProgAfterEvent.totalXp}, conflictCode=${conflictAttempt.rejectionCode}, diskPreserved=${diskAfterConflictAttempt === savedDiskBeforeTab3}`;
    } finally {
      memStore.clear();
      if (prevWindow !== undefined) {
        (globalThis as { window?: unknown }).window = prevWindow;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      PlayerLevelManager.getInstance().ensureWindowStorageListener();
    }

    results.push({
      id: 'M7_5_2_T15',
      name: 'M7.5.2.2 Fix #2b: Tab 2 tự cập nhật khi nhận storage event từ Tab 1 & phát hiện xung đột không tự ghi đè âm thầm',
      passed,
      details,
    });
  }

  // =========================================================================
  // M7_5_2_T16: Existing / Pending Account Does NOT Show Fake Lv. 1 Before Firestore Read (Fix #3a)
  // =========================================================================
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidPending = 'uid_m7522_existing_pending';
    statsMgr.clearUidStatsForTesting(uidPending);

    // Session becomes ACTIVE immediately after Google sign-in, BEFORE Firestore `/users/{uid}` responds
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidPending,
      sessionId: 'sess_pending_read_1',
      deviceId: 'dev_p1',
      timestampMs: 1_772_030_000_000,
    });
    const beforeCloudSnap = statsMgr.getPlayerStatisticsSnapshot(uidPending);

    // Later Firestore returns real `/users/{uid}` with 4500 XP (Lv. 10)
    statsMgr.applyCloudUserDocData(uidPending, {
      uid: uidPending,
      totalXp: 4500,
      rank: 'CAPTAIN',
    });
    const afterCloudSnap = statsMgr.getPlayerStatisticsSnapshot(uidPending);

    const passed =
      beforeCloudSnap.xpVerificationStatus === 'UNVERIFIED' &&
      beforeCloudSnap.level === null &&
      beforeCloudSnap.levelTopMenuBadge === 'Lv. --' &&
      afterCloudSnap.xpVerificationStatus === 'VERIFIED' &&
      afterCloudSnap.totalXp === 4500 &&
      afterCloudSnap.level === 10 &&
      afterCloudSnap.levelTopMenuBadge === 'Lv. 10';

    statsMgr.clearUidStatsForTesting(uidPending);
    results.push({
      id: 'M7_5_2_T16',
      name: 'M7.5.2.2 Fix #3a: Tài khoản đang chờ đọc Firestore sau khi Session ACTIVE hiển thị Lv. -- (UNVERIFIED), không giả Lv. 1',
      passed,
      details: `beforeCloud=${beforeCloudSnap.levelTopMenuBadge}(${beforeCloudSnap.xpVerificationStatus}), afterCloud=${afterCloudSnap.levelTopMenuBadge}`,
    });
  }

  // =========================================================================
  // M7_5_2_T17: M7.5.2.3 Regression – Same eventId With Different eventDigest Triggers CONFLICTING_EVENT_DIGEST
  // =========================================================================
  {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const memStore = new Map<string, string>();
    const storageListeners = new Set<(ev: StorageEvent) => void>();
    const mockStorage = {
      getItem: (k: string) => memStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memStore.set(k, v);
      },
      removeItem: (k: string) => {
        memStore.delete(k);
      },
    };
    (globalThis as { window?: unknown }).window = {
      localStorage: mockStorage,
      addEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.add(cb);
      },
      removeEventListener: (type: string, cb: (ev: StorageEvent) => void) => {
        if (type === 'storage') storageListeners.delete(cb);
      },
    };

    const uidDigest = 'uid_m7523_digest_conflict';
    let passed = false;
    let details = '';
    try {
      const tab1 = PlayerLevelManager.createIsolatedTabInstanceForTesting();
      const tab2 = PlayerLevelManager.createIsolatedTabInstanceForTesting();

      tab1.applyFirestoreUserDocument(uidDigest, { uid: uidDigest, totalXp: 0 }, 1_772_200_000_000);
      tab2.applyFirestoreUserDocument(uidDigest, { uid: uidDigest, totalXp: 0 }, 1_772_200_000_000);

      // Tab 1 records ev_collision_x with 10 XP (BASIC: 10)
      const g1 = tab1.grantVerifiedBattleXpSync({
        uid: uidDigest,
        eventId: 'ev_collision_x',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 10,
        defeatedByType: { BASIC: 10 },
        timestampMs: 1_772_200_005_000,
      });
      const storageKey = `${LEDGER_STORAGE_PREFIX}${uidDigest}`;
      const diskAfterTab1 = memStore.get(storageKey);

      // Tab 2 (stale RAM) attempts to write SAME eventId with DIFFERENT digest (25 XP, ARMOR: 5)
      const g2Conflict = tab2.grantVerifiedBattleXpSync({
        uid: uidDigest,
        eventId: 'ev_collision_x',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 25,
        defeatedByType: { ARMOR: 5 },
        timestampMs: 1_772_200_006_000,
      });

      // Subsequent unrelated write on conflicted tab2 MUST remain blocked until conflict is cleared
      const g2BlockedFollowup = tab2.grantVerifiedBattleXpSync({
        uid: uidDigest,
        eventId: 'ev_followup_after_conflict',
        source: 'SOLO_BATTLE',
        stageId: 2,
        gameMode: 'SOLO',
        earnedXp: 15,
        defeatedByType: { ARMOR: 3 },
        timestampMs: 1_772_200_010_000,
      });

      const conflictInfo = tab2.getMultiTabConflict(uidDigest);
      const diskAfterConflict = memStore.get(storageKey);

      passed =
        g1.accepted === true &&
        g2Conflict.accepted === false &&
        g2Conflict.duplicateIgnored === false &&
        g2Conflict.rejectionCode === 'MULTI_TAB_CONFLICT_DETECTED' &&
        g2BlockedFollowup.accepted === false &&
        g2BlockedFollowup.rejectionCode === 'MULTI_TAB_CONFLICT_DETECTED' &&
        conflictInfo?.reasonCode === 'CONFLICTING_EVENT_DIGEST' &&
        diskAfterConflict === diskAfterTab1;

      details = `g2Code=${g2Conflict.rejectionCode}, reason=${conflictInfo?.reasonCode}, followupCode=${g2BlockedFollowup.rejectionCode}, diskPreserved=${diskAfterConflict === diskAfterTab1}`;
    } finally {
      memStore.clear();
      if (prevWindow !== undefined) {
        (globalThis as { window?: unknown }).window = prevWindow;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      PlayerLevelManager.getInstance().ensureWindowStorageListener();
    }

    results.push({
      id: 'M7_5_2_T17',
      name: 'M7.5.2.3 Regression: Cùng eventId khác eventDigest phát hiện CONFLICTING_EVENT_DIGEST & khóa ghi đè âm thầm',
      passed,
      details,
    });
  }

  // =========================================================================
  // M7_5_2_T18: M7.5.2.3 Regression – Retry With Different timestampMs Still Deduplicates Cleanly & Multi-Tab Stats Summaries Merge
  // =========================================================================
  {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const memStore = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => memStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        memStore.set(k, v);
      },
      removeItem: (k: string) => {
        memStore.delete(k);
      },
    };
    (globalThis as { window?: unknown }).window = {
      localStorage: mockStorage,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };

    const statsMgr = PlayerStatsManager.getInstance();
    const uidRetryStats = 'uid_m7523_retry_and_stats_merge';
    let passed = false;
    let details = '';

    try {
      statsMgr.clearUidStatsForTesting(uidRetryStats);
      statsMgr.applyCloudUserDocData(uidRetryStats, { uid: uidRetryStats, totalXp: 0 });

      const eng = new GameEngine(undefined, undefined, true);
      eng.startMatch('SOLO', 'DEFAULT', { stageId: 1, enforceProgression: false });
      const ids1 = buildBattleXpIdentifiers({
        uid: uidRetryStats,
        gameMode: 'SOLO',
        matchInstanceId: eng.getState().matchInstanceId!,
        stageId: 1,
        stageRunSeq: eng.getState().stageRunSeq,
        outcome: 'WIN',
      });

      // Retry of identical match outcome 50ms later (simulates React effect retry without fixed timestampMs)
      const firstCall = statsMgr.recordMatchOutcome({
        uid: uidRetryStats,
        runKey: ids1.runKey,
        xpEventId: ids1.xpEventId,
        outcome: 'WIN',
        stageId: 1,
        gameMode: 'SOLO',
        earnedScoreXp: 35,
        defeatedByType: { ARMOR: 5, POWER: 2, FAST: 2 },
        timestampMs: 1_772_300_000_000,
      });
      const retryLaterCall = statsMgr.recordMatchOutcome({
        uid: uidRetryStats,
        runKey: ids1.runKey,
        xpEventId: ids1.xpEventId,
        outcome: 'WIN',
        stageId: 1,
        gameMode: 'SOLO',
        earnedScoreXp: 35,
        defeatedByType: { ARMOR: 5, POWER: 2, FAST: 2 },
        timestampMs: 1_772_300_000_050,
      });

      // Simulate concurrent second tab writing an independent match directly to stats storage while RAM still holds only ids1
      const statsKey = `bantank_m751_player_stats_v1_${uidRetryStats}`;
      memStore.set(
        statsKey,
        JSON.stringify({
          uid: uidRetryStats,
          accumulatedBattleXp: 40,
          highScoreXp: 40,
          matchesPlayed: 1,
          matchesWon: 1,
          matchesLost: 0,
          totalEnemiesDefeated: 8,
          defeatedByType: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 8 },
          coopRoomsParticipated: 0,
          totalLogins: 1,
          firstLoginAtMs: 1_772_300_000_000,
          lastLoginAtMs: 1_772_300_000_000,
          lastLogoutAtMs: null,
          lastRecordedSessionId: null,
          recordedXpEventIds: ['ev_other_tab_conc'],
          eventSummaries: {
            ev_other_tab_conc: {
              outcome: 'WIN',
              earnedXp: 40,
              defeatedByType: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 8 },
            },
          },
          authHistory: [],
        })
      );

      // Snapshot read MUST merge RAM + disk via eventSummaries AND heal localStorage!
      const mergedSnap = statsMgr.getPlayerStatisticsSnapshot(uidRetryStats);
      const healedDisk = JSON.parse(memStore.get(statsKey) || '{}') as {
        matchesPlayed?: number;
        recordedXpEventIds?: string[];
      };

      // Follow-up match after retry + multi-tab merge MUST still succeed cleanly
      eng.advanceToNextStage();
      const ids2 = buildBattleXpIdentifiers({
        uid: uidRetryStats,
        gameMode: 'SOLO',
        matchInstanceId: eng.getState().matchInstanceId!,
        stageId: eng.getState().currentStageId,
        stageRunSeq: eng.getState().stageRunSeq,
        outcome: 'WIN',
      });
      const st2Call = statsMgr.recordMatchOutcome({
        uid: uidRetryStats,
        runKey: ids2.runKey,
        xpEventId: ids2.xpEventId,
        outcome: 'WIN',
        stageId: 2,
        gameMode: 'SOLO',
        earnedScoreXp: 25,
        defeatedByType: { ARMOR: 5 },
        timestampMs: 1_772_300_010_000,
      });

      passed =
        firstCall?.accepted === true &&
        firstCall.duplicateIgnored === false &&
        retryLaterCall?.accepted === true &&
        retryLaterCall.duplicateIgnored === true &&
        mergedSnap.matchesPlayed === 2 &&
        mergedSnap.matchesWon === 2 &&
        mergedSnap.totalEnemiesDefeated === 17 &&
        mergedSnap.defeatedByType.ARMOR === 13 &&
        healedDisk.matchesPlayed === 2 &&
        (healedDisk.recordedXpEventIds?.length ?? 0) === 2 &&
        st2Call?.accepted === true &&
        st2Call.duplicateIgnored === false &&
        st2Call.newTotalXp === 60;

      details = `retryIgnored=${retryLaterCall?.duplicateIgnored}, mergedMatches=${mergedSnap.matchesPlayed}, healedDiskMatches=${healedDisk.matchesPlayed}, st2Xp=${st2Call?.newTotalXp}`;
    } finally {
      statsMgr.clearUidStatsForTesting(uidRetryStats);
      memStore.clear();
      if (prevWindow !== undefined) {
        (globalThis as { window?: unknown }).window = prevWindow;
      } else {
        delete (globalThis as { window?: unknown }).window;
      }
      PlayerLevelManager.getInstance().ensureWindowStorageListener();
    }

    results.push({
      id: 'M7_5_2_T18',
      name: 'M7.5.2.3 Regression: Retry khác timestampMs giữ nguyên eventDigest (không khóa nhầm) & merge multi-tab PlayerStatsManager đủ số trận',
      passed,
      details,
    });
  }

  return { results };
}

/**
 * Async E2E Verification for M7.5.2 & M7.5.2.2:
 * 1. Concurrent XP grants (`Promise.all` across 12 simultaneous grants + duplicate retries)
 *    serialize cleanly without race-condition loss or double-counting.
 * 2. Firestore offline/read-error honesty (`Lv. --`, never fake `Lv. 1` new account).
 * 3. Read-only Admin `/users` consistency scanner RBAC, honest failure reporting (`success: false`),
 *    accurate `firestoreScannedCount` vs `cacheOnlyCount`, and `CACHE ONLY – NOT PRODUCTION VERIFIED` labeling.
 */
export async function verifyM752AsyncLevelConcurrencyAndScanSuite(): Promise<void> {
  const levelMgr = PlayerLevelManager.getInstance();
  const statsMgr = PlayerStatsManager.getInstance();
  const uidConc = 'uid_m752_async_concurrent';

  statsMgr.clearUidStatsForTesting(uidConc);
  statsMgr.applyCloudUserDocData(uidConc, { uid: uidConc, totalXp: 0 });

  // Launch 10 distinct +50 XP grants concurrently (= 500 XP total -> Level 3, since XP_REQUIRED(3)=300, XP_REQUIRED(4)=600)
  // PLUS 5 duplicate retries of `ev_conc_0` and `ev_conc_5` mixed into the same Promise.all batch!
  const tasks: Array<Promise<unknown>> = [];
  for (let i = 0; i < 10; i++) {
    tasks.push(
      levelMgr.grantVerifiedBattleXp({
        uid: uidConc,
        eventId: `ev_conc_${i}`,
        source: i % 2 === 0 ? 'SOLO_BATTLE' : 'COOP_ONLINE_BATTLE',
        stageId: (i % 10) + 1,
        gameMode: i % 2 === 0 ? 'SOLO' : 'TWO_PLAYERS_ONLINE',
        earnedXp: 50,
        defeatedByType: { ARMOR: 10 },
        timestampMs: 1_771_000_000_000 + i * 100,
      })
    );
  }
  for (let d = 0; d < 5; d++) {
    tasks.push(
      levelMgr.grantVerifiedBattleXp({
        uid: uidConc,
        eventId: d % 2 === 0 ? 'ev_conc_0' : 'ev_conc_5',
        source: 'SOLO_BATTLE',
        stageId: 1,
        gameMode: 'SOLO',
        earnedXp: 50,
        defeatedByType: { ARMOR: 10 },
        timestampMs: 1_771_000_005_000 + d * 100,
      })
    );
  }

  await Promise.all(tasks);
  const progressAfterConc = levelMgr.getLevelProgressForUid(uidConc);
  if (
    progressAfterConc.xpVerificationStatus !== 'VERIFIED' ||
    progressAfterConc.totalXp !== 500 ||
    progressAfterConc.level !== 3 ||
    progressAfterConc.xpNext !== 600 ||
    progressAfterConc.xpRemaining !== 100
  ) {
    throw new Error(
      `M7.5.2 Async Case 1 failed: Concurrent XP grants resulted in xp=${progressAfterConc.totalXp}, lv=${progressAfterConc.level} (expected xp=500, lv=3)`
    );
  }

  // Case 2 (M7.5.2.2 Fix #3b): Firestore offline / error / cache-only empty MUST stay Lv. -- (UNVERIFIED), never Lv. 1
  const uidOfflineErr = 'uid_m7522_offline_err';
  const uidCacheEmpty = 'uid_m7522_cache_empty';
  const uidConfirmedNew = 'uid_m7522_confirmed_new';
  statsMgr.clearUidStatsForTesting(uidOfflineErr);
  statsMgr.clearUidStatsForTesting(uidCacheEmpty);
  statsMgr.clearUidStatsForTesting(uidConfirmedNew);

  statsMgr.recordAuthenticatedSessionActive({
    uid: uidOfflineErr,
    sessionId: 'sess_off_1',
    timestampMs: 1_772_040_000_000,
  });
  const offlineReadRes = await statsMgr.refreshCloudUserStatsOnce(uidOfflineErr, async () => {
    const err = new Error('Failed to get document because the client is offline.') as Error & {
      code?: string;
    };
    err.code = 'unavailable';
    throw err;
  });
  const offlineSnap = statsMgr.getPlayerStatisticsSnapshot(uidOfflineErr);

  const cacheOnlyReadRes = await statsMgr.refreshCloudUserStatsOnce(uidCacheEmpty, async () => ({
    exists: false,
    fromCache: true,
  }));
  const cacheEmptySnap = statsMgr.getPlayerStatisticsSnapshot(uidCacheEmpty);

  const confirmedEmptyReadRes = await statsMgr.refreshCloudUserStatsOnce(uidConfirmedNew, async () => ({
    exists: false,
    fromCache: false,
  }));
  const confirmedEmptySnap = statsMgr.getPlayerStatisticsSnapshot(uidConfirmedNew);

  if (
    offlineReadRes.ok !== false ||
    offlineSnap.xpVerificationStatus !== 'UNVERIFIED' ||
    offlineSnap.level !== null ||
    offlineSnap.levelTopMenuBadge !== 'Lv. --' ||
    cacheOnlyReadRes.ok !== false ||
    cacheEmptySnap.xpVerificationStatus !== 'UNVERIFIED' ||
    cacheEmptySnap.levelTopMenuBadge !== 'Lv. --' ||
    confirmedEmptyReadRes.ok !== true ||
    confirmedEmptySnap.xpVerificationStatus !== 'VERIFIED' ||
    confirmedEmptySnap.level !== 1 ||
    confirmedEmptySnap.levelTopMenuBadge !== 'Lv. 1'
  ) {
    throw new Error('M7.5.2.2 Fix #3b failed: Firestore offline/error must keep Lv. -- and only server-confirmed empty doc yields Lv. 1');
  }
  statsMgr.clearUidStatsForTesting(uidOfflineErr);
  statsMgr.clearUidStatsForTesting(uidCacheEmpty);
  statsMgr.clearUidStatsForTesting(uidConfirmedNew);

  // Case 3 (M7.5.2.2 Fix #4): Read-only Admin `/users` consistency scan RBAC, honest failure & CACHE ONLY labeling
  const uidBadLegacy = 'uid_m752_scan_bad';
  statsMgr.applyCloudUserDocData(uidBadLegacy, {
    uid: uidBadLegacy,
    email: 'legacy.mismatch@gmail.com',
    xp: 4500, // Expected Level 10
    level: 3, // Stale legacy level!
  });

  const modScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(MOD_ACTOR);
  const playerScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(PLAYER_ACTOR);

  // 3a. Headless/unavailable Firestore (`db === null`) with RAM cache fallback MUST return success: false + FIRESTORE_UNAVAILABLE + CACHE ONLY label
  const adminUnavailableScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(
    ADMIN_ACTOR,
    { firestoreDbOverride: null }
  );
  const cachedBadEntry = adminUnavailableScan.entries.find((e) => e.uid === uidBadLegacy);

  // 3a-real. Real un-injected call in Node (no browser auth / offline) MUST ALSO return success: false (never fake success from cache)
  const adminUnauthedRealScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(ADMIN_ACTOR);

  // 3b. Firestore throws `permission-denied` MUST return success: false + errorCode: 'PERMISSION_DENIED'
  const adminPermDeniedScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(ADMIN_ACTOR, {
    firestoreDocsLoader: async () => {
      const err = new Error('Missing or insufficient permissions') as Error & { code?: string };
      err.code = 'permission-denied';
      throw err;
    },
  });

  // 3c. Firestore throws `unavailable` MUST return success: false + errorCode: 'FIRESTORE_UNAVAILABLE'
  const adminOfflineThrowScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(ADMIN_ACTOR, {
    firestoreDocsLoader: async () => {
      const err = new Error('The service is currently unavailable.') as Error & { code?: string };
      err.code = 'unavailable';
      throw err;
    },
  });

  // 3d. Live Firestore returns 1 doc while 1 extra doc exists only in RAM cache -> accurate counts & provenance labels
  const adminLiveScan = await statsMgr.scanFirestoreUsersLevelConsistencyForAdmin(ADMIN_ACTOR, {
    firestoreDocsLoader: async () => [
      {
        id: 'uid_live_firestore_user',
        data: { email: 'live@gmail.com', totalXp: 300, level: 3 },
      },
    ],
  });
  const liveRow = adminLiveScan.entries.find((e) => e.uid === 'uid_live_firestore_user');
  const cacheRowInPartial = adminLiveScan.entries.find((e) => e.uid === uidBadLegacy);

  if (
    modScan.success !== false ||
    modScan.errorCode !== 'PERMISSION_DENIED' ||
    playerScan.success !== false ||
    playerScan.errorCode !== 'PERMISSION_DENIED' ||
    adminUnavailableScan.success !== false ||
    adminUnavailableScan.errorCode !== 'FIRESTORE_UNAVAILABLE' ||
    adminUnavailableScan.isProductionVerified !== false ||
    adminUnavailableScan.firestoreScannedCount !== 0 ||
    adminUnavailableScan.cacheOnlyCount < 1 ||
    adminUnavailableScan.cacheLabel !== 'CACHE ONLY – NOT PRODUCTION VERIFIED' ||
    adminUnauthedRealScan.success !== false ||
    adminUnauthedRealScan.isProductionVerified !== false ||
    adminUnauthedRealScan.firestoreScannedCount !== 0 ||
    adminUnauthedRealScan.cacheLabel !== 'CACHE ONLY – NOT PRODUCTION VERIFIED' ||
    !cachedBadEntry ||
    cachedBadEntry.dataSource !== 'RAM_CACHE_ONLY' ||
    cachedBadEntry.sourceLabel !== 'CACHE ONLY – NOT PRODUCTION VERIFIED' ||
    cachedBadEntry.expectedLevel !== 10 ||
    adminPermDeniedScan.success !== false ||
    adminPermDeniedScan.errorCode !== 'PERMISSION_DENIED' ||
    adminOfflineThrowScan.success !== false ||
    adminOfflineThrowScan.errorCode !== 'FIRESTORE_UNAVAILABLE' ||
    adminLiveScan.success !== true ||
    adminLiveScan.firestoreScannedCount !== 1 ||
    adminLiveScan.cacheOnlyCount < 1 ||
    liveRow?.dataSource !== 'FIRESTORE_LIVE' ||
    cacheRowInPartial?.dataSource !== 'RAM_CACHE_ONLY'
  ) {
    throw new Error(
      'M7.5.2.2 Fix #4 failed: Admin read-only level consistency scan must fail honestly when Firestore fails and label RAM cache as CACHE ONLY – NOT PRODUCTION VERIFIED'
    );
  }

  statsMgr.clearUidStatsForTesting(uidConc);
  statsMgr.clearUidStatsForTesting(uidBadLegacy);
  console.log('[M7.5.2 & M7.5.2.2 Official 50-Level Concurrency, Multi-Tab, Offline & Scan Audit E2E] 3/3 MANDATORY ASYNC CASES PASS');
}
