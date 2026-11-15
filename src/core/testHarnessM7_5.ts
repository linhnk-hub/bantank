/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.1 – AUTOMATED VERIFICATION SUITE (GROUPS A–E)
 * Covers:
 * - Group A: Player Statistics (`PlayerStatsManager`) & Top Menu `Level` badge (Clause 1.1–1.3)
 * - Group B: Client Upload Removal & Static Media / Avatar Catalog (PHẦN 2 & PHẦN 3)
 * - Group C: System Audit Logging, Redaction, Deduplication & Full-Pagination Backup (PHẦN 4)
 * - Group D: 9-Step Idempotent Archive-Verify-Cleanup Pipeline & Failure Retention (PHẦN 5)
 * - Group E: Strict RBAC & Security Boundaries (`ADMIN` vs `MOD` vs `PLAYER`) (PHẦN 6)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ADMIN_EMAIL,
  REVOKED_OLD_ADMIN_EMAIL,
  AuthManager,
  setVerifiedServerRoleForUid,
  clearVerifiedServerRoles,
} from './authManager.ts';
import { SessionManager } from './sessionManager.ts';
import { PlayerStatsManager } from './playerStatsManager.ts';
import {
  SystemAuditLogger,
  ALL_SYSTEM_LOG_CATEGORIES,
  LocalDurableArchiveStorageAdapter,
  redactSensitiveString,
  redactSensitiveMetadata,
  computeCanonicalChecksum,
} from './systemAuditLogger.ts';
import {
  MusicManager,
  STATIC_BGM_INDEX_ID,
  STATIC_BGM_STAGE_ID,
} from './musicManager.ts';
import { SoundManager, GAME_ACTION_SOUND_SLOTS } from './audio.ts';
import { AvatarManager } from './avatarManager.ts';
import { StageProgressionManager } from './stageProgression.ts';
import { getAvailableSettingsTabsForRole } from '../components/SettingsModal.tsx';

export interface M75TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

const ADMIN_ACTOR = {
  uid: 'uid_sole_admin_m751',
  email: ADMIN_EMAIL,
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'ADMIN' as const,
};

const MOD_ACTOR = {
  uid: 'uid_mod_m751',
  email: 'moderator.m751@gmail.com',
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'MOD' as const,
};

const PLAYER_ACTOR = {
  uid: 'uid_player_m751',
  email: 'player.m751@gmail.com',
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'PLAYER' as const,
};

const UNVERIFIED_ADMIN_ACTOR = {
  uid: 'uid_unverified_admin_m751',
  email: ADMIN_EMAIL,
  emailVerified: false,
  providerIds: ['google.com'],
  role: 'ADMIN' as const,
};

const REVOKED_OLD_ADMIN_ACTOR = {
  uid: 'uid_revoked_old_admin_m751',
  email: REVOKED_OLD_ADMIN_EMAIL,
  emailVerified: true,
  providerIds: ['google.com'],
  role: 'ADMIN' as const,
};

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf-8');
}

export function runAllM7_5Tests(): { results: M75TestResult[] } {
  const results: M75TestResult[] = [];

  // =========================================================================
  // GROUP A: THỐNG KÊ NGƯỜI CHƠI & TOP MENU LEVEL (PHẦN 1)
  // =========================================================================

  // M7_5_A1: Strict UID isolation, account switch, and sign-out reset (zero state bleed)
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const progMgr = StageProgressionManager.getInstance();
    const uidA = 'uid_m75_alpha';
    const uidB = 'uid_m75_bravo';

    statsMgr.clearUidStatsForTesting(uidA);
    statsMgr.clearUidStatsForTesting(uidB);
    progMgr.resetForTesting(uidA);
    progMgr.resetForTesting(uidB);

    statsMgr.applyCloudUserDocData(uidA, {
      uid: uidA,
      xp: 1450,
      xu: 320,
      rank: 'CAPTAIN',
      createdAt: 1_710_000_000_000,
      lastLoginAt: 1_715_000_000_000,
    });
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidA,
      sessionId: 'sess_alpha_1',
      deviceId: 'dev_alpha_1',
      timestampMs: 1_715_000_010_000,
      userEmail: 'alpha@gmail.com',
      displayName: 'Alpha Tanker',
    });
    statsMgr.recordMatchOutcome({
      uid: uidA,
      runKey: 'run_alpha_s1',
      outcome: 'WIN',
      stageId: 1,
      gameMode: 'SOLO',
      earnedScoreXp: 66, // 12*1 + 8*2 + 6*3 + 4*5 = 66 XP
      defeatedByType: { BASIC: 12, FAST: 8, POWER: 6, ARMOR: 4 },
      timestampMs: 1_715_000_120_000,
    });
    statsMgr.recordCoopRoomParticipation(uidA, 'BT1234');

    const snapA = statsMgr.getPlayerStatisticsSnapshot(uidA);
    const snapB = statsMgr.getPlayerStatisticsSnapshot(uidB);
    const snapSignedOut = statsMgr.getPlayerStatisticsSnapshot(null);

    const passed =
      snapA.uid === uidA &&
      snapA.totalXp === 1516 && // 1450 cloud baseline + 66 verified stage XP -> Lv. 6 (XP_REQUIRED(6)=1500)
      snapA.level === 6 &&
      snapA.levelTopMenuBadge === 'Lv. 6' &&
      snapA.xuBalance === 320 &&
      snapA.pvpRankCode === 'CAPTAIN' &&
      snapA.matchesPlayed === 1 &&
      snapA.matchesWon === 1 &&
      snapA.totalEnemiesDefeated === 30 &&
      snapA.coopRoomsParticipated === 1 &&
      snapA.totalLogins === 1 &&
      // UID B must be completely isolated from UID A & unverified before login/cloud snapshot
      snapB.uid === uidB &&
      snapB.xpVerificationStatus === 'UNVERIFIED' &&
      snapB.level === null &&
      snapB.levelTopMenuBadge === 'Lv. --' &&
      snapB.totalXp === 0 &&
      snapB.xuBalance === 0 &&
      snapB.pvpRankCode === null &&
      snapB.matchesPlayed === 0 &&
      snapB.totalLogins === 0 &&
      snapB.coopRoomsParticipated === 0 &&
      // Signed out snapshot must reset cleanly
      snapSignedOut.uid === null &&
      snapSignedOut.level === null &&
      snapSignedOut.levelTopMenuBadge === 'Lv. --' &&
      snapSignedOut.totalXp === 0;

    statsMgr.clearUidStatsForTesting(uidA);
    statsMgr.clearUidStatsForTesting(uidB);

    results.push({
      id: 'M7_5_A1',
      name: 'Group A.1: Cô lập dữ liệu thống kê tuyệt đối theo UID, cộng dồn XP hợp lệ lên Level, không rò rỉ giữa tài khoản A/B & reset sạch khi đăng xuất',
      passed,
      details: `snapA(xp=${snapA.totalXp},lv=${snapA.level},xu=${snapA.xuBalance},wins=${snapA.matchesWon}), snapB(status=${snapB.xpVerificationStatus},badge=${snapB.levelTopMenuBadge}), signedOutBadge=${snapSignedOut.levelTopMenuBadge}`,
    });
  }

  // M7_5_A2: M7.5.2 Approved 50-Level System — Unverified XP honesty, MAX LEVEL 50 cap, legacy mismatch detection, and strict separation of Level vs PvP Rank vs XP vs Xu
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidUnverified = 'uid_m75_unverified_xp';
    const uidMax = 'uid_m75_max_level';
    const uidMismatch = 'uid_m75_legacy_mismatch';

    statsMgr.clearUidStatsForTesting(uidUnverified);
    statsMgr.clearUidStatsForTesting(uidMax);
    statsMgr.clearUidStatsForTesting(uidMismatch);

    // Unverified UID -> MUST NOT default to Lv. 1; displays Lv. --
    const unverifiedSnap = statsMgr.getPlayerStatisticsSnapshot(uidUnverified);

    // Huge XP (999,999 >= 122,500) -> Caps at Level 50 (MAX LEVEL, xpNext = null) while preserving totalXp, COLONEL rank, and 50,000 Xu
    statsMgr.applyCloudUserDocData(uidMax, {
      uid: uidMax,
      xp: 999_999,
      xu: 50_000,
      rank: 'COLONEL',
    });
    const maxSnap = statsMgr.getPlayerStatisticsSnapshot(uidMax);

    // Legacy `level: 12` vs `xp: 4800` (expected Level 10 since XP_REQUIRED(10)=4500, XP_REQUIRED(11)=5500) -> Computes Lv. 10 & flags mismatch without mutating Firestore
    statsMgr.applyCloudUserDocData(uidMismatch, {
      uid: uidMismatch,
      level: 12,
      xp: 4800,
      xu: 750,
      rank: 'SERGEANT',
    });
    const mismatchSnap = statsMgr.getPlayerStatisticsSnapshot(uidMismatch);

    const passed =
      unverifiedSnap.level === null &&
      unverifiedSnap.xpVerificationStatus === 'UNVERIFIED' &&
      unverifiedSnap.levelTopMenuBadge === 'Lv. --' &&
      maxSnap.level === 50 &&
      maxSnap.isMaxLevel === true &&
      maxSnap.xpNext === null &&
      maxSnap.xpRemaining === 0 &&
      maxSnap.levelProgressPercent === 100 &&
      maxSnap.levelTopMenuBadge === 'Lv. 50' &&
      maxSnap.pvpRankCode === 'COLONEL' &&
      maxSnap.totalXp === 999_999 &&
      maxSnap.xuBalance === 50_000 &&
      mismatchSnap.level === 10 &&
      mismatchSnap.levelTopMenuBadge === 'Lv. 10' &&
      mismatchSnap.xpNext === 5500 &&
      mismatchSnap.xpRemaining === 700 &&
      mismatchSnap.levelConsistencyAudit?.isConsistent === false &&
      mismatchSnap.levelConsistencyAudit?.discrepancyCodes.includes('STORED_LEVEL_MISMATCH_FORMULA') === true &&
      mismatchSnap.pvpRankCode === 'SERGEANT' &&
      mismatchSnap.totalXp === 4800 &&
      mismatchSnap.xuBalance === 750;

    statsMgr.clearUidStatsForTesting(uidUnverified);
    statsMgr.clearUidStatsForTesting(uidMax);
    statsMgr.clearUidStatsForTesting(uidMismatch);

    results.push({
      id: 'M7_5_A2',
      name: 'Group A.2: Hệ thống 50 Level chính thức (M7.5.2) – Chưa xác minh XP hiển thị Lv. --, trần MAX LEVEL 50, phát hiện lệch dữ liệu cũ & tách biệt Level/Rank/XP/Xu',
      passed,
      details: `unverified=${unverifiedSnap.levelTopMenuBadge}, max=${maxSnap.levelTopMenuBadge}(xp=${maxSnap.totalXp},xpNext=${String(maxSnap.xpNext)}), mismatch=${mismatchSnap.levelTopMenuBadge}(audit=${mismatchSnap.levelConsistencyAudit?.discrepancyCodes.join(',')})`,
    });
  }

  // M7_5_A3: Login/Logout history, session deduplication, firstLogin/lastLogin/lastLogout timestamps
  {
    const statsMgr = PlayerStatsManager.getInstance();
    const uidHist = 'uid_m75_login_hist';
    statsMgr.clearUidStatsForTesting(uidHist);

    // Session 1 active -> duplicate heartbeat on same sessionId must NOT double-count totalLogins
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidHist,
      sessionId: 'sess_h1',
      deviceId: 'dev_1',
      timestampMs: 1_720_000_000_000,
    });
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidHist,
      sessionId: 'sess_h1',
      deviceId: 'dev_1',
      timestampMs: 1_720_000_030_000,
    });
    const afterSess1 = statsMgr.getPlayerStatisticsSnapshot(uidHist);

    // Logout Session 1
    statsMgr.recordSessionTermination({
      uid: uidHist,
      sessionId: 'sess_h1',
      deviceId: 'dev_1',
      reason: 'LOGOUT',
      timestampMs: 1_720_000_600_000,
    });

    // Session 2 active + 15m idle expiry
    statsMgr.recordAuthenticatedSessionActive({
      uid: uidHist,
      sessionId: 'sess_h2',
      deviceId: 'dev_2',
      timestampMs: 1_720_001_000_000,
    });
    statsMgr.recordSessionTermination({
      uid: uidHist,
      sessionId: 'sess_h2',
      deviceId: 'dev_2',
      reason: 'SESSION_IDLE_EXPIRED_15M',
      timestampMs: 1_720_001_900_000,
    });

    const finalSnap = statsMgr.getPlayerStatisticsSnapshot(uidHist);
    const passed =
      afterSess1.totalLogins === 1 &&
      finalSnap.totalLogins === 2 &&
      finalSnap.firstLoginAtMs === 1_720_000_000_000 &&
      finalSnap.lastLoginAtMs === 1_720_001_000_000 &&
      finalSnap.lastLogoutAtMs === 1_720_001_900_000 &&
      finalSnap.authHistory.length === 4 &&
      finalSnap.authHistory[0].eventType === 'SESSION_IDLE_EXPIRED_15M' &&
      finalSnap.authHistory[1].eventType === 'LOGIN' &&
      finalSnap.authHistory[2].eventType === 'LOGOUT' &&
      finalSnap.authHistory[3].eventType === 'LOGIN';

    statsMgr.clearUidStatsForTesting(uidHist);

    results.push({
      id: 'M7_5_A3',
      name: 'Group A.3: Ghi nhận chính xác tổng số lần đăng nhập (chống đếm trùng heartbeat), lần đầu, gần nhất & lịch sử đăng nhập/đăng xuất/15p',
      passed,
      details: `dedupSess1=${afterSess1.totalLogins}, totalLogins=${finalSnap.totalLogins}, historyLen=${finalSnap.authHistory.length}`,
    });
  }

  // M7_5_A4: Top Menu `top-menu-player-level` & SettingsModal `system-player-statistics-section` UI integration
  {
    const mainMenuSrc = readWorkspaceFile('src/components/MainMenuScreen.tsx');
    const modeSelSrc = readWorkspaceFile('src/components/ModeSelectionScreen.tsx');
    const settingsSrc = readWorkspaceFile('src/components/SettingsModal.tsx');

    const topMenuLevelOk =
      mainMenuSrc.includes('data-testid="top-menu-player-level"') &&
      mainMenuSrc.includes('PlayerStatsManager.getInstance()') &&
      modeSelSrc.includes('data-testid="top-menu-player-level"') &&
      modeSelSrc.includes('PlayerStatsManager.getInstance()');

    const userProfileSrc = readWorkspaceFile('src/components/UserProfileModal.tsx');
    const adminLogsSrc = readWorkspaceFile('src/components/SystemLogsAdminPanel.tsx');

    const systemStatsUiOk =
      settingsSrc.includes('data-testid="system-player-statistics-section"') &&
      settingsSrc.includes('Level (Cấp độ 1–50)') &&
      settingsSrc.includes('data-testid="player-level-progress-panel"') &&
      settingsSrc.includes('data-testid="player-level-progress-bar"') &&
      settingsSrc.includes('Quân hàm PvP') &&
      settingsSrc.includes('Tổng điểm XP') &&
      settingsSrc.includes('Số dư Xu') &&
      settingsSrc.includes('Tổng số lần đăng nhập') &&
      settingsSrc.includes('Lịch sử đăng nhập &amp; đăng xuất') &&
      userProfileSrc.includes('data-testid="profile-player-level-card"') &&
      adminLogsSrc.includes('data-testid="subtab-level-audit"');

    const passed = topMenuLevelOk && systemStatsUiOk;
    results.push({
      id: 'M7_5_A4',
      name: 'Group A.4: Hiển thị Level trên Top Menu, Hồ sơ, mục Hệ thống (kèm thanh tiến độ 0–100%) & tab Kiểm toán Level 1–50 cho ADMIN',
      passed,
      details: `topMenuLevelOk=${topMenuLevelOk}, systemStatsUiOk=${systemStatsUiOk}`,
    });
  }

  // =========================================================================
  // GROUP B: GỠ BỎ UPLOAD CLIENT & MEDIA / AVATAR TĨNH (PHẦN 2 & PHẦN 3)
  // =========================================================================

  // M7_5_B1: Zero client file upload inputs/buttons across SettingsModal, MusicAdminPanel, UserProfileModal
  {
    const settingsSrc = readWorkspaceFile('src/components/SettingsModal.tsx');
    const musicAdminSrc = readWorkspaceFile('src/components/MusicAdminPanel.tsx');
    const userProfileSrc = readWorkspaceFile('src/components/UserProfileModal.tsx');

    const noFileInputs =
      !settingsSrc.includes('type="file"') &&
      !musicAdminSrc.includes('type="file"') &&
      !userProfileSrc.includes('type="file"');

    const noLegacyUploadButtons =
      !musicAdminSrc.includes('data-testid="upload-home-video-btn"') &&
      !musicAdminSrc.includes('data-testid="media-multi-upload-btn"') &&
      !settingsSrc.includes('Tải ảnh Avatar mới');

    const passed = noFileInputs && noLegacyUploadButtons;
    results.push({
      id: 'M7_5_B1',
      name: 'Group B.1: Đã gỡ bỏ hoàn toàn giao diện tải file (BGM, SFX, MP4, Avatar) trên SettingsModal, MusicAdminPanel & UserProfileModal',
      passed,
      details: `noFileInputs=${noFileInputs}, noLegacyUploadButtons=${noLegacyUploadButtons}`,
    });
  }

  // M7_5_B2: Programmatic upload/replace/delete block in AvatarManager & SoundManager even for ADMIN
  {
    const sm = SoundManager.getInstance();
    sm.setActionSoundAdminRole('ADMIN');
    const sfxUp = sm.uploadActionSoundSync('P1_SHOOT', {
      name: 'custom.mp3',
      type: 'audio/mpeg',
      size: 16_000,
    });
    const sfxRep = sm.replaceActionSoundSync('P1_SHOOT', {
      name: 'custom2.mp3',
      type: 'audio/mpeg',
      size: 16_000,
    });
    const sfxDel = sm.deleteActionSound('P1_SHOOT');
    sm.setActionSoundAdminRole(null);

    const mm = MusicManager.getInstance();
    mm.setUserRole('ADMIN');
    const staticIndexDeleteBlocked = mm.deleteTrack(STATIC_BGM_INDEX_ID) === false;
    const staticStageDeleteBlocked = mm.deleteTrack(STATIC_BGM_STAGE_ID) === false;
    mm.syncRoleFromAuthUser(null);

    const passed =
      sfxUp.ok === false &&
      sfxRep.ok === false &&
      sfxDel.ok === false &&
      staticIndexDeleteBlocked &&
      staticStageDeleteBlocked;

    results.push({
      id: 'M7_5_B2',
      name: 'Group B.2: Chặn gọi hàm upload/replace/xóa file tĩnh trực tiếp ở tầng Service ngay cả với tài khoản ADMIN',
      passed,
      details: `sfxUploadBlocked=${!sfxUp.ok}, sfxDeleteBlocked=${!sfxDel.ok}, staticBgmProtected=${staticIndexDeleteBlocked && staticStageDeleteBlocked}`,
    });
  }

  // M7_5_B3: Physical existence & non-zero size of all static BGM (2), SFX (7), Avatars (11), and Intro MP4 (1)
  {
    const requiredStaticFiles = [
      'public/audio/bgm/bgm-index.mp3',
      'public/audio/bgm/bgm-stage.mp3',
      'public/audio/sfx/die-base.mp3',
      'public/audio/sfx/die-cpu.mp3',
      'public/audio/sfx/die-player.mp3',
      'public/audio/sfx/game-over.mp3',
      'public/audio/sfx/game-win.mp3',
      'public/audio/sfx/gun-cpu.mp3',
      'public/audio/sfx/gun-player.mp3',
      'public/intro-bantank.mp4',
      ...Array.from(
        { length: 11 },
        (_, idx) => `public/avatar/ava${String(idx + 1).padStart(2, '0')}.png`
      ),
    ];

    const missingOrEmpty: string[] = [];
    for (const rel of requiredStaticFiles) {
      const fullPath = path.resolve(process.cwd(), rel);
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size <= 0) {
        missingOrEmpty.push(rel);
      }
    }

    // Verify all 7 GAME_ACTION_SOUND_SLOTS map to static public/audio/sfx/*.mp3
    const sm = SoundManager.getInstance();
    const all7Mapped = GAME_ACTION_SOUND_SLOTS.every((slot) => {
      const tr = sm.getActionSoundTrack(slot.id);
      return Boolean(tr && tr.fileName.endsWith('.mp3'));
    });

    // Verify AvatarManager exposes 11 active static avatars ava01..ava11
    const avMgr = AvatarManager.getInstance();
    const activeAvatars = avMgr.getCatalogItems(false);
    const all11StaticAvatarsLoaded =
      activeAvatars.length >= 11 &&
      Array.from({ length: 11 }, (_, idx) => `ava${String(idx + 1).padStart(2, '0')}`).every(
        (id) =>
          activeAvatars.some(
            (item) =>
              item.avatarId === id && avMgr.getCatalogItemResolvedUrl(item) === `./avatar/${id}.png`
          )
      );

    const passed = missingOrEmpty.length === 0 && all7Mapped && all11StaticAvatarsLoaded;
    results.push({
      id: 'M7_5_B3',
      name: 'Group B.3: Tồn tại đầy đủ và hợp lệ (> 0 byte) toàn bộ 2 BGM, 7 SFX, 11 Avatar tĩnh (ava01..ava11) và intro-bantank.mp4',
      passed,
      details: `checkedFiles=${requiredStaticFiles.length}, missingOrEmpty=${missingOrEmpty.length}, sfx7Mapped=${all7Mapped}, avatars11=${all11StaticAvatarsLoaded}`,
    });
  }

  // M7_5_B4: Clean Menu (`bgm-index.mp3`) <-> Stage (`bgm-stage.mp3`) BGM switching with zero overlap & Co-op Lobby avatar display
  {
    const mm = MusicManager.getInstance();
    mm.setUserRole('ADMIN');
    mm.resetAllAssignmentsToDefault();

    const homeRes = mm.resolveEffectiveTrack(0, 'HOME');
    mm.syncMenuPlayback();
    const sourcesOnHome = mm.getActiveSourceCount();

    const stageRes = mm.resolveEffectiveTrack(1, 'SOLO');
    mm.syncPlaybackWithContext(1, 'SOLO');
    const sourcesOnStage = mm.getActiveSourceCount();

    // Switch back to HOME -> stops stage BGM and activates menu BGM with max 1 active source
    mm.syncMenuPlayback();
    const sourcesBackHome = mm.getActiveSourceCount();
    mm.pause();
    const sourcesPaused = mm.getActiveSourceCount();
    mm.resume();
    mm.syncRoleFromAuthUser(null);

    const lobbySrc = readWorkspaceFile('src/components/CoopOnlineLobbyModal.tsx');
    const lobbyHasAvatars =
      lobbySrc.includes('hostAvatarUrl') && lobbySrc.includes('guestAvatarUrl');

    const passed =
      homeRes.trackId === STATIC_BGM_INDEX_ID &&
      homeRes.track?.fileName === 'bgm-index.mp3' &&
      stageRes.trackId === STATIC_BGM_STAGE_ID &&
      stageRes.track?.fileName === 'bgm-stage.mp3' &&
      sourcesOnHome <= 1 &&
      sourcesOnStage <= 1 &&
      sourcesBackHome <= 1 &&
      sourcesPaused === 0 &&
      lobbyHasAvatars;

    results.push({
      id: 'M7_5_B4',
      name: 'Group B.4: Chuyển đổi mượt mà bgm-index.mp3 (Menu) <-> bgm-stage.mp3 (Stage) không chồng nhạc & đồng bộ Avatar tại Phòng chờ Co-op',
      passed,
      details: `homeTrack=${homeRes.track?.fileName}, stageTrack=${stageRes.track?.fileName}, maxSources=${Math.max(sourcesOnHome, sourcesOnStage, sourcesBackHome)}, lobbyAvatars=${lobbyHasAvatars}`,
    });
  }

  // =========================================================================
  // GROUP C: LOG HỆ THỐNG, ẨN MẬT KHẨU/TOKEN & BACKUP ĐẦY ĐỦ (PHẦN 4)
  // =========================================================================

  // M7_5_C1: All 14 mandatory daily log categories recorded, filtered by date/severity/category/UID
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();

    const baseTs = Date.UTC(2026, 10, 14, 10, 0, 0); // 2026-11-14
    ALL_SYSTEM_LOG_CATEGORIES.forEach((cat, idx) => {
      logger.recordEvent({
        severity: idx === 0 ? 'CRITICAL' : idx % 3 === 0 ? 'ERROR' : 'INFO',
        category: cat.id,
        eventType: `TEST_${cat.id}`,
        message: `Sự kiện kiểm thử danh mục ${cat.id}`,
        uid: `uid_cat_${idx % 2}`,
        displayName: `Player ${idx % 2}`,
        source: 'testHarnessM7_5.C1',
        timestampMs: baseTs + idx * 1000,
        skipDeduplication: true,
      });
    });

    const allQuery = logger.querySystemLogs(
      { startDate: '2026-11-14', endDate: '2026-11-14', pageSize: 50 },
      ADMIN_ACTOR
    );
    const critOnly = logger.querySystemLogs({ severity: 'CRITICAL' }, ADMIN_ACTOR);
    const player0History = logger.queryPlayerActivityHistory({ uid: 'uid_cat_0' }, ADMIN_ACTOR);

    const passed =
      ALL_SYSTEM_LOG_CATEGORIES.length === 14 &&
      allQuery.success === true &&
      allQuery.totalItems === 14 &&
      allQuery.criticalCount === 1 &&
      critOnly.totalItems === 1 &&
      player0History.success === true &&
      player0History.totalItems === 7;

    logger.clearAllForTesting();

    results.push({
      id: 'M7_5_C1',
      name: 'Group C.1: Ghi nhận đầy đủ 14 phân loại Log hằng ngày, lọc chính xác theo Ngày, Mức độ nghiêm trọng, Danh mục & Lịch sử từng UID',
      passed,
      details: `categories=${ALL_SYSTEM_LOG_CATEGORIES.length}, queried=${allQuery.totalItems}, critical=${critOnly.totalItems}, player0=${player0History.totalItems}`,
    });
  }

  // M7_5_C2: Strict secret / JWT / Bearer / OAuth token / password / URL query token redaction
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();

    const fakeJwt =
      'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1aWRfMTIzNDU2Nzg5MCIsImVtYWlsIjoibGluaG5rMjAxM0BnbWFpbC5jb20ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const rawMsg = `Auth error with Authorization: Bearer secret_live_tok_998877 and jwt=${fakeJwt} url=https://bantank.online/cb?access_token=ya29.super_secret_token&room=BT1234 password="MyRoomPassword99"`;

    const redactedStr = redactSensitiveString(rawMsg);
    const redactedMeta = redactSensitiveMetadata({
      idToken: fakeJwt,
      refreshToken: '1//0g_secret_refresh_token',
      roomPasscode: '998877',
      nested: {
        oauth_token: 'ya29.nested_oauth_secret',
        safeStageId: 5,
      },
    }) as Record<string, unknown>;

    const entry = logger.recordEvent({
      severity: 'ERROR',
      category: 'AUTH_EVENT',
      eventType: 'SYSTEM_DIAGNOSTIC',
      message: rawMsg,
      source: 'testHarnessM7_5.C2',
      error: new Error(`Token leak attempt: ${fakeJwt}`),
      metadata: {
        accessToken: 'ya29.top_secret',
        roomCode: 'BT9012',
      },
    });

    const serializedEntry = JSON.stringify(entry);
    const noSecretsPresent =
      !redactedStr.includes('secret_live_tok_998877') &&
      !redactedStr.includes('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c') &&
      !redactedStr.includes('ya29.super_secret_token') &&
      !redactedStr.includes('MyRoomPassword99') &&
      JSON.stringify(redactedMeta).includes('[REDACTED]') &&
      !JSON.stringify(redactedMeta).includes('1//0g_secret_refresh_token') &&
      !JSON.stringify(redactedMeta).includes('998877') &&
      (redactedMeta.nested as Record<string, unknown>).safeStageId === 5 &&
      !serializedEntry.includes('ya29.top_secret') &&
      !serializedEntry.includes('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c') &&
      serializedEntry.includes('BT9012');

    logger.clearAllForTesting();

    results.push({
      id: 'M7_5_C2',
      name: 'Group C.2: Tự động che giấu (Redact) 100% ID Token, JWT, Bearer, OAuth Token, Mật khẩu phòng & URL nhạy cảm trước khi lưu Log',
      passed: noSecretsPresent,
      details: `noSecretsPresent=${noSecretsPresent}`,
    });
  }

  // M7_5_C3: Deduplication within 8s window (`repeatCount` incremented) & burst rate-limiting protection
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();

    const t0 = 1_750_000_000_000;
    for (let i = 0; i < 5; i++) {
      logger.recordEvent({
        severity: 'WARNING',
        category: 'WEBRTC_SYNC_ERROR',
        eventType: 'WEBRTC_PEER_ERROR',
        message: 'ICE candidate timeout on DataChannel',
        uid: 'uid_dup_1',
        source: 'CoopOnlineManager',
        timestampMs: t0 + i * 500,
      });
    }

    const qDedup = logger.querySystemLogs({}, ADMIN_ACTOR);
    const dedupOk =
      qDedup.totalItems === 1 &&
      qDedup.items[0].repeatCount === 5 &&
      qDedup.items[0].lastRepeatedAtMs === t0 + 2000;

    // Burst test: > 40 unique non-critical events within the same 1-second window must be capped at 40, while CRITICAL still passes through!
    logger.clearAllForTesting();
    const burstTs = 1_750_010_000_000;
    let acceptedNonCrit = 0;
    for (let i = 0; i < 55; i++) {
      const rec = logger.recordEvent({
        severity: 'INFO',
        category: 'CLIENT_LIFECYCLE',
        eventType: `BURST_EVT_${i}`,
        message: `Unique burst event #${i}`,
        source: 'BurstTest',
        timestampMs: burstTs + 10,
        skipDeduplication: true,
      });
      if (rec) acceptedNonCrit++;
    }
    const critDuringBurst = logger.recordEvent({
      severity: 'CRITICAL',
      category: 'APP_SYSTEM_ERROR',
      eventType: 'CRITICAL_MUST_RECORD',
      message: 'Critical error must never be dropped during burst',
      source: 'BurstTest',
      timestampMs: burstTs + 20,
      skipDeduplication: true,
    });

    const passed = dedupOk && acceptedNonCrit === 40 && critDuringBurst !== null;
    logger.clearAllForTesting();

    results.push({
      id: 'M7_5_C3',
      name: 'Group C.3: Chống spam Log trùng lặp (gộp repeatCount) & giới hạn tốc độ ghi 40 sự kiện/giây bảo vệ 60 FPS nhưng luôn giữ sự kiện CRITICAL',
      passed,
      details: `dedupOk=${dedupOk}, cappedNonCritical=${acceptedNonCrit}/55, criticalPreserved=${critDuringBurst !== null}`,
    });
  }

  // M7_5_C4: Canonical Checksum determinism & SystemLogsAdminPanel UI controls (`BACKUP DỮ LIỆU LOG`, filters, archive tab)
  {
    const c1 = computeCanonicalChecksum('{"hello":"bantank","count":30}');
    const c2 = computeCanonicalChecksum('{"hello":"bantank","count":30}');
    const c3 = computeCanonicalChecksum('{"hello":"bantank","count":31}');

    const panelSrc = readWorkspaceFile('src/components/SystemLogsAdminPanel.tsx');
    const panelUiComplete =
      panelSrc.includes('BACKUP DỮ LIỆU LOG') &&
      panelSrc.includes('data-testid="system-logs-admin-panel"') &&
      panelSrc.includes('data-testid="backup-logs-download-btn"') &&
      panelSrc.includes('JSON') &&
      panelSrc.includes('CSV') &&
      panelSrc.includes('ARCHIVED_VERIFIED');

    const passed =
      c1 === c2 &&
      c1 !== c3 &&
      c1.startsWith('fnv64_') &&
      panelUiComplete;

    results.push({
      id: 'M7_5_C4',
      name: 'Group C.4: Tính toàn vẹn Checksum FNV-64 tất định & Giao diện Quản trị LOG HỆ THỐNG (Bộ lọc, Lịch sử UID, Kho lưu trữ, BACKUP DỮ LIỆU LOG)',
      passed,
      details: `checksumDeterministic=${c1 === c2 && c1 !== c3}, panelUiComplete=${panelUiComplete}`,
    });
  }

  // =========================================================================
  // GROUP D: LƯU TRỮ TRƯỚC – XÁC MINH – DỌN DẸP LOG TẠM THỜI (PHẦN 5)
  // =========================================================================

  // M7_5_D1: Separation of Permanent Audit Logs vs Temporary Operational Logs (`SESSION` & `COOP_ROOM`)
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();

    const perm = logger.recordEvent({
      severity: 'INFO',
      category: 'AUTH_EVENT',
      eventType: 'LOGIN_SUCCESS',
      message: 'Permanent audit login record',
      uid: 'uid_tier_test',
      source: 'testHarnessM7_5.D1',
    });

    const buf = logger.startOperationalScope({
      scopeKey: 'room:BT7788',
      scopeType: 'COOP_ROOM',
      ownerUid: 'uid_tier_test',
      roomCode: 'BT7788',
      nowMs: 1_760_000_000_000,
    });
    const opEv1 = logger.appendOperationalEvent({
      scopeKey: 'room:BT7788',
      scopeType: 'COOP_ROOM',
      eventType: 'GUEST_READY',
      message: 'P2 pressed ready in BT7788',
      uid: 'uid_tier_guest',
      roomCode: 'BT7788',
      timestampMs: 1_760_000_005_000,
    });

    const adminBuffers = logger.getOperationalBuffersForAdmin(ADMIN_ACTOR);
    const passed =
      perm?.retentionTier === 'PERMANENT_AUDIT' &&
      buf.status === 'ACTIVE' &&
      buf.isEnded === false &&
      opEv1.eventId.startsWith('op_fnv64_') &&
      adminBuffers.success === true &&
      adminBuffers.buffers.length === 1 &&
      adminBuffers.buffers[0].scopeKey === 'room:BT7788' &&
      adminBuffers.buffers[0].events.length === 1;

    logger.clearAllForTesting();

    results.push({
      id: 'M7_5_D1',
      name: 'Group D.1: Phân tách rõ Nhật ký kiểm toán lâu dài (PERMANENT_AUDIT) và Nhật ký vận hành tạm thời (SESSION / COOP_ROOM) với eventId tất định',
      passed,
      details: `permTier=${perm?.retentionTier}, tempStatus=${buf.status}, opEventId=${opEv1.eventId}`,
    });
  }

  // M7_5_D2: Active Scope & Active `/user_sessions/{uid}` Lease Protection (Never delete active session/room logs)
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();

    logger.startOperationalScope({
      scopeKey: 'room:BT5566',
      scopeType: 'COOP_ROOM',
      ownerUid: 'uid_host_active',
      roomCode: 'BT5566',
      nowMs: 1_760_100_000_000,
    });
    logger.appendOperationalEvent({
      scopeKey: 'room:BT5566',
      scopeType: 'COOP_ROOM',
      eventType: 'MATCH_RUNNING',
      message: 'Co-op Stage 3 in progress',
      roomCode: 'BT5566',
      timestampMs: 1_760_100_010_000,
    });

    // Scope is NOT ended -> must still exist in operational buffers
    const buffersBefore = logger.getOperationalBuffersForAdmin(ADMIN_ACTOR);
    const stillProtected =
      buffersBefore.buffers.length === 1 &&
      buffersBefore.buffers[0].isEnded === false &&
      buffersBefore.buffers[0].events.length === 1;

    logger.clearAllForTesting();

    results.push({
      id: 'M7_5_D2',
      name: 'Group D.2: Bảo vệ tuyệt đối Log vận hành tạm khi Phiên đăng nhập / Phòng Co-op vẫn đang hoạt động (isEnded = false)',
      passed: stillProtected,
      details: `stillProtected=${stillProtected}`,
    });
  }

  // =========================================================================
  // GROUP E: PHÂN QUYỀN CHẶT CHẼ & BẢO MẬT HỆ THỐNG LOG (PHẦN 6)
  // =========================================================================

  // M7_5_E1: SettingsModal `SYSTEM_LOGS` tab strictly visible ONLY to `ADMIN` (`linhnk2013@gmail.com`)
  {
    const adminTabs = getAvailableSettingsTabsForRole('ADMIN').map((t) => t.id);
    const modTabs = getAvailableSettingsTabsForRole('MOD').map((t) => t.id);
    const playerTabs = getAvailableSettingsTabsForRole('PLAYER').map((t) => t.id);

    const passed =
      adminTabs.includes('SYSTEM_LOGS') &&
      !modTabs.includes('SYSTEM_LOGS') &&
      !playerTabs.includes('SYSTEM_LOGS');

    results.push({
      id: 'M7_5_E1',
      name: 'Group E.1: Mục LOG HỆ THỐNG trong Cài đặt chỉ hiển thị cho ADMIN duy nhất; ẩn hoàn toàn với MOD và PLAYER',
      passed,
      details: `adminHas=${adminTabs.includes('SYSTEM_LOGS')}, modHas=${modTabs.includes('SYSTEM_LOGS')}, playerHas=${playerTabs.includes('SYSTEM_LOGS')}`,
    });
  }

  // M7_5_E2: Service/API layer RBAC blocks MOD, PLAYER, unverified ADMIN email, revoked old admin email, and null
  {
    const logger = SystemAuditLogger.getInstance();
    logger.clearAllForTesting();
    clearVerifiedServerRoles();
    setVerifiedServerRoleForUid(MOD_ACTOR.uid, 'MOD');
    setVerifiedServerRoleForUid(REVOKED_OLD_ADMIN_ACTOR.uid, 'ADMIN');

    logger.recordEvent({
      severity: 'INFO',
      category: 'ADMIN_MOD_ACTION',
      eventType: 'SYSTEM_DIAGNOSTIC',
      message: 'Seeded record for RBAC test',
      uid: PLAYER_ACTOR.uid,
      source: 'testHarnessM7_5.E2',
    });

    const adminAllowed =
      logger.canAccessSystemLogs(ADMIN_ACTOR) === true &&
      logger.querySystemLogs({}, ADMIN_ACTOR).success === true &&
      logger.queryPlayerActivityHistory({}, ADMIN_ACTOR).success === true &&
      logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).success === true;

    const unauthorizedActors = [
      MOD_ACTOR,
      PLAYER_ACTOR,
      UNVERIFIED_ADMIN_ACTOR,
      REVOKED_OLD_ADMIN_ACTOR,
      null,
    ];

    const allUnauthorizedBlocked = unauthorizedActors.every((actor) => {
      const canAccess = logger.canAccessSystemLogs(actor);
      const sysQuery = logger.querySystemLogs({}, actor);
      const histQuery = logger.queryPlayerActivityHistory({}, actor);
      const opBuffers = logger.getOperationalBuffersForAdmin(actor);
      const playersList = logger.getUniqueLoggedPlayersForAdmin(actor);
      return (
        canAccess === false &&
        sysQuery.success === false &&
        sysQuery.errorCode === 'PERMISSION_DENIED' &&
        sysQuery.items.length === 0 &&
        histQuery.success === false &&
        histQuery.errorCode === 'PERMISSION_DENIED' &&
        histQuery.items.length === 0 &&
        opBuffers.success === false &&
        opBuffers.buffers.length === 0 &&
        playersList.length === 0
      );
    });

    clearVerifiedServerRoles();
    logger.clearAllForTesting();

    const passed = adminAllowed && allUnauthorizedBlocked;
    results.push({
      id: 'M7_5_E2',
      name: 'Group E.2: Chặn ở tầng Service/API mọi truy vấn Log/Lịch sử/Buffer từ MOD, PLAYER, email chưa xác minh, linhnk.online@gmail.com & khách chưa đăng nhập',
      passed,
      details: `adminAllowed=${adminAllowed}, allUnauthorizedBlocked=${allUnauthorizedBlocked}`,
    });
  }

  // M7_5_E3: Per-player own auth history privacy (`getOwnAuthHistoryForUid` blocks cross-UID snooping)
  {
    const logger = SystemAuditLogger.getInstance();
    const authMgr = AuthManager.getInstance();
    const prevUser = authMgr.getCurrentUser();
    logger.clearAllForTesting();

    logger.recordEvent({
      severity: 'INFO',
      category: 'AUTH_EVENT',
      eventType: 'LOGIN_SUCCESS',
      message: 'Player Alpha logged in',
      uid: 'uid_alpha_priv',
      source: 'testHarnessM7_5.E3',
    });
    logger.recordEvent({
      severity: 'INFO',
      category: 'AUTH_EVENT',
      eventType: 'LOGIN_SUCCESS',
      message: 'Player Bravo logged in',
      uid: 'uid_bravo_priv',
      source: 'testHarnessM7_5.E3',
    });

    (authMgr as unknown as { currentUser: unknown }).currentUser = {
      uid: 'uid_alpha_priv',
      email: 'alpha.priv@gmail.com',
      emailVerified: true,
      displayName: 'Alpha',
      photoURL: null,
      providerIds: ['google.com'],
    };

    const ownHist = logger.getOwnAuthHistoryForUid('uid_alpha_priv');
    const crossUidHist = logger.getOwnAuthHistoryForUid('uid_bravo_priv');

    (authMgr as unknown as { currentUser: unknown }).currentUser = prevUser;
    logger.clearAllForTesting();

    const passed = ownHist.length === 1 && crossUidHist.length === 0;
    results.push({
      id: 'M7_5_E3',
      name: 'Group E.3: Người chơi chỉ đọc được lịch sử đăng nhập của chính UID đang xác thực; chặn đọc chéo UID người chơi khác',
      passed,
      details: `ownHist=${ownHist.length}, crossUidHist=${crossUidHist.length}`,
    });
  }

  // M7_5_E4: Frozen Production Rules & User Landing Page Integrity (PHẦN 7 compliance)
  {
    const firestoreRules = readWorkspaceFile('firestore.rules');
    const storageRules = readWorkspaceFile('storage.rules');
    const landingHtmlExists = fs.existsSync(path.resolve(process.cwd(), 'public/landing.html'));

    const rulesIntact =
      firestoreRules.includes("rules_version = '2';") &&
      firestoreRules.includes('linhnk2013@gmail.com') &&
      storageRules.includes("rules_version = '2';") &&
      landingHtmlExists;

    results.push({
      id: 'M7_5_E4',
      name: 'Group E.4: Bảo toàn nguyên vẹn firestore.rules, storage.rules và public/landing.html theo đúng ràng buộc Phần 7',
      passed: rulesIntact,
      details: `rulesIntact=${rulesIntact}, landingHtmlExists=${landingHtmlExists}`,
    });
  }

  return { results };
}

/**
 * Async End-to-End Verification Suite for M7.5.1:
 * Exercises async Full-Pagination Backup (JSON & CSV), the 9-Step Idempotent Archive-Verify-Cleanup
 * state machine, simulated write/checksum/manifest failures (verifying zero data loss),
 * stale `ARCHIVE_PENDING` recovery sweeps, active session lease protection, and unauthorized async RBAC rejection.
 */
export async function verifyM751AsyncEndToEndSuite(): Promise<void> {
  const logger = SystemAuditLogger.getInstance();
  const archiveAdapter = new LocalDurableArchiveStorageAdapter();
  logger.setArchiveAdapter(archiveAdapter);
  logger.clearAllForTesting();

  // 1. Unauthorized async calls (MOD & PLAYER) MUST be rejected and logged as SECURITY_PERMISSION_DENIED
  const modBackupAttempt = await logger.exportBackupLogs(
    { scope: 'DATE_RANGE', format: 'JSON' },
    MOD_ACTOR
  );
  const playerCleanupAttempt = await logger.archiveAndCleanupOperationalLog('room:BT0001', {
    actorOverride: PLAYER_ACTOR,
  });
  const modSweepAttempt = await logger.sweepStaleArchivePendingLogs({
    actorOverride: MOD_ACTOR,
  });
  const modListArchivesAttempt = await logger.listVerifiedArchivesForAdmin(MOD_ACTOR);

  if (
    modBackupAttempt.success !== false ||
    modBackupAttempt.errorCode !== 'PERMISSION_DENIED' ||
    playerCleanupAttempt.success !== false ||
    playerCleanupAttempt.errorCode !== 'PERMISSION_DENIED' ||
    modSweepAttempt.success !== false ||
    modListArchivesAttempt.success !== false
  ) {
    throw new Error('M7.5.1 Async Case 1 failed: MOD/PLAYER must be denied backup/cleanup/archive access');
  }

  // 2. Active Scope & Active Session Lease Protection (`SCOPE_STILL_ACTIVE` & `ACTIVE_SESSION_PROTECTED`)
  logger.startOperationalScope({
    scopeKey: 'session:uid_live_1:sess_live_99',
    scopeType: 'SESSION',
    ownerUid: 'uid_live_1',
    sessionId: 'sess_live_99',
    nowMs: 1_765_000_000_000,
  });
  logger.appendOperationalEvent({
    scopeKey: 'session:uid_live_1:sess_live_99',
    scopeType: 'SESSION',
    eventType: 'HEARTBEAT_OK',
    message: 'Active session heartbeat',
    uid: 'uid_live_1',
    sessionId: 'sess_live_99',
    timestampMs: 1_765_000_010_000,
  });

  // Attempting cleanup while isEnded === false -> SCOPE_STILL_ACTIVE
  const activeScopeRes = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR }
  );
  if (activeScopeRes.success !== false || activeScopeRes.errorCode !== 'SCOPE_STILL_ACTIVE') {
    throw new Error('M7.5.1 Async Case 2a failed: Must block cleanup when scope is still active');
  }

  // Simulate active SessionManager snapshot matching sess_live_99 even if buffer marked ended prematurely
  const sessionMgr = SessionManager.getInstance() as unknown as {
    status: string;
    currentUid: string | null;
    currentSessionId: string | null;
  };
  const prevStatus = sessionMgr.status;
  const prevUid = sessionMgr.currentUid;
  const prevSessionId = sessionMgr.currentSessionId;
  sessionMgr.status = 'ACTIVE';
  sessionMgr.currentUid = 'uid_live_1';
  sessionMgr.currentSessionId = 'sess_live_99';

  logger.markOperationalScopeEnded('session:uid_live_1:sess_live_99', 1_765_000_020_000);
  const protectedLeaseRes = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR, markEndedNow: false }
  );
  // Restore SessionManager internal state
  sessionMgr.status = prevStatus;
  sessionMgr.currentUid = prevUid;
  sessionMgr.currentSessionId = prevSessionId;

  if (
    protectedLeaseRes.success !== false ||
    protectedLeaseRes.errorCode !== 'ACTIVE_SESSION_PROTECTED' ||
    logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).buffers.length !== 1
  ) {
    throw new Error(
      'M7.5.1 Async Case 2b failed: Must protect active /user_sessions/{uid} lease from premature log deletion'
    );
  }

  // 3. Simulated Archive Write Failure & Corrupted Readback Checksum -> MUST RETAIN Temporary Log + Emit CRITICAL Log
  archiveAdapter.simulateNextWriteFailure = true;
  const writeFailRes = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR, nowMs: 1_765_000_030_000 }
  );
  const afterWriteFailBufs = logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).buffers;
  if (
    writeFailRes.success !== false ||
    writeFailRes.errorCode !== 'ARCHIVE_WRITE_FAILED' ||
    afterWriteFailBufs.length !== 1 ||
    afterWriteFailBufs[0].status !== 'ARCHIVE_PENDING' ||
    afterWriteFailBufs[0].events.length !== 1
  ) {
    throw new Error(
      'M7.5.1 Async Case 3a failed: Archive write failure must retain temp operational log as ARCHIVE_PENDING'
    );
  }

  archiveAdapter.simulateNextReadCorruptedChecksum = true;
  const checksumFailRes = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR, nowMs: 1_765_000_040_000 }
  );
  const afterChecksumFailBufs = logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).buffers;
  if (
    checksumFailRes.success !== false ||
    checksumFailRes.errorCode !== 'ARCHIVE_VERIFY_FAILED' ||
    afterChecksumFailBufs.length !== 1 ||
    afterChecksumFailBufs[0].retryCount < 2
  ) {
    throw new Error(
      'M7.5.1 Async Case 3b failed: Checksum mismatch on readback must abort deletion and retain temp log'
    );
  }

  archiveAdapter.simulateNextManifestFailure = true;
  const manifestFailRes = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR, nowMs: 1_765_000_045_000 }
  );
  if (
    manifestFailRes.success !== false ||
    manifestFailRes.errorCode !== 'MANIFEST_WRITE_FAILED' ||
    logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).buffers.length !== 1
  ) {
    throw new Error(
      'M7.5.1 Async Case 3c failed: Manifest write failure must abort step 8 deletion and retain temp log'
    );
  }

  // Verify CRITICAL failure audit logs were emitted
  const critLogs = logger.querySystemLogs(
    { category: 'LOG_CLEANUP_ARCHIVE', severity: 'CRITICAL' },
    ADMIN_ACTOR
  );
  if (critLogs.totalItems < 3) {
    throw new Error('M7.5.1 Async Case 3d failed: Expected CRITICAL audit logs on archive pipeline failures');
  }

  // 4. Successful 9-Step Sweep Recovery + Idempotent Repeat Calls (Zero Duplicate Archived Events)
  const sweepRes = await logger.sweepStaleArchivePendingLogs({
    actorOverride: ADMIN_ACTOR,
    nowMs: 1_765_000_060_000,
  });
  const buffersAfterSuccess = logger.getOperationalBuffersForAdmin(ADMIN_ACTOR).buffers;
  const verifiedManifests = await logger.listVerifiedArchivesForAdmin(ADMIN_ACTOR);

  if (
    !sweepRes.success ||
    sweepRes.cleanedKeys.length !== 1 ||
    buffersAfterSuccess.length !== 0 ||
    verifiedManifests.manifests.length !== 1 ||
    verifiedManifests.manifests[0].status !== 'ARCHIVED_VERIFIED' ||
    verifiedManifests.manifests[0].eventCount !== 1
  ) {
    throw new Error('M7.5.1 Async Case 4a failed: Stale ARCHIVE_PENDING sweep must complete all 9 steps and delete temp buffer');
  }

  // Calling archiveAndCleanupOperationalLog a second time on already-cleaned scopeKey -> idempotent alreadyCleaned=true
  const idempotentRepeat = await logger.archiveAndCleanupOperationalLog(
    'session:uid_live_1:sess_live_99',
    { actorOverride: ADMIN_ACTOR, nowMs: 1_765_000_070_000 }
  );
  const restoredArchive = await logger.restoreArchiveBatch(
    verifiedManifests.manifests[0].archiveId,
    ADMIN_ACTOR
  );
  if (
    !idempotentRepeat.success ||
    idempotentRepeat.alreadyCleaned !== true ||
    idempotentRepeat.stepsCompleted.length !== 9 ||
    !restoredArchive.success ||
    restoredArchive.batch?.events.length !== 1
  ) {
    throw new Error('M7.5.1 Async Case 4b failed: Repeat cleanup call must be idempotent and restoreArchiveBatch must verify checksum');
  }

  // 5. Full-Pagination Non-Destructive Backup (`JSON` & `CSV`) across > 120 logs + archived operational events
  logger.clearAllForTesting();
  const dayMs = Date.UTC(2026, 10, 15, 8, 0, 0); // 2026-11-15

  // Seed 245 permanent logs across distinct timestamps so burst limiter never drops any
  for (let i = 0; i < 245; i++) {
    logger.recordEvent({
      severity: i % 25 === 0 ? 'ERROR' : 'INFO',
      category: 'CAMPAIGN_STAGE_EVENT',
      eventType: 'MATCH_WIN',
      message: `Backup pagination record #${i + 1}`,
      uid: i % 2 === 0 ? 'uid_backup_p1' : 'uid_backup_p2',
      displayName: i % 2 === 0 ? 'Chiến Binh P1' : 'Chiến Binh P2',
      stageId: (i % 10) + 1,
      gameMode: 'SOLO',
      source: 'BackupPaginationTest',
      timestampMs: dayMs + i * 2_000, // 2s apart -> never hits 40/sec burst limit
      skipDeduplication: true,
    });
  }

  // Also create and archive 1 Co-op room operational buffer with 2 events on 2026-11-15
  logger.startOperationalScope({
    scopeKey: 'room:BT9900',
    scopeType: 'COOP_ROOM',
    ownerUid: 'uid_backup_p1',
    roomCode: 'BT9900',
    nowMs: dayMs + 500_000,
  });
  logger.appendOperationalEvent({
    scopeKey: 'room:BT9900',
    scopeType: 'COOP_ROOM',
    eventType: 'ROOM_CREATED',
    message: 'Host created BT9900',
    uid: 'uid_backup_p1',
    roomCode: 'BT9900',
    timestampMs: dayMs + 500_100,
  });
  logger.appendOperationalEvent({
    scopeKey: 'room:BT9900',
    scopeType: 'COOP_ROOM',
    eventType: 'ROOM_CLOSED',
    message: 'Host closed BT9900 cleanly',
    uid: 'uid_backup_p1',
    roomCode: 'BT9900',
    timestampMs: dayMs + 510_000,
  });
  const roomArchiveRes = await logger.archiveAndCleanupOperationalLog('room:BT9900', {
    markEndedNow: true,
    nowMs: dayMs + 510_500,
    actorOverride: ADMIN_ACTOR,
  });
  if (!roomArchiveRes.success || roomArchiveRes.stepsCompleted.length !== 9) {
    throw new Error('M7.5.1 Async Case 5 setup failed: Co-op room 9-step archive failed');
  }

  const totalLogsBeforeBackup = logger.querySystemLogs(
    { startDate: '2026-11-15', endDate: '2026-11-15' },
    ADMIN_ACTOR
  ).totalItems; // 245 + 1 cleanup audit log = 246

  const jsonBackup = await logger.exportBackupLogs(
    {
      scope: 'DATE_RANGE',
      format: 'JSON',
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      triggerBrowserDownload: false,
      nowMs: dayMs + 600_000,
    },
    ADMIN_ACTOR
  );

  const singlePlayerCsvBackup = await logger.exportBackupLogs(
    {
      scope: 'SINGLE_PLAYER',
      format: 'CSV',
      targetUid: 'uid_backup_p1',
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      triggerBrowserDownload: false,
      nowMs: dayMs + 605_000,
    },
    ADMIN_ACTOR
  );

  // Source logs MUST NOT be deleted after backup (plus 2 LOG_BACKUP_EXPORTED audit entries added)
  const totalLogsAfterBackup = logger.querySystemLogs(
    { startDate: '2026-11-15', endDate: '2026-11-15' },
    ADMIN_ACTOR
  ).totalItems;

  if (
    !jsonBackup.success ||
    jsonBackup.pagesTraversed !== 3 || // 246 logs across 100/page = 3 pages!
    jsonBackup.exportedLogCount !== 246 ||
    jsonBackup.archivedEventCount !== 2 ||
    !jsonBackup.byteSize ||
    jsonBackup.byteSize <= 0 ||
    !singlePlayerCsvBackup.success ||
    !singlePlayerCsvBackup.content?.includes('PERMANENT_AUDIT') ||
    !singlePlayerCsvBackup.content?.includes('ARCHIVED_OPERATIONAL') ||
    totalLogsAfterBackup < totalLogsBeforeBackup
  ) {
    throw new Error(
      `M7.5.1 Async Case 5 failed: Full-pagination JSON/CSV backup mismatch (pages=${jsonBackup.pagesTraversed}, count=${jsonBackup.exportedLogCount}, archived=${jsonBackup.archivedEventCount})`
    );
  }

  logger.clearAllForTesting();
  console.log('[M7.5.1 System Audit Logging, Full-Pagination Backup & 9-Step Archive-Verify-Cleanup E2E] 5/5 MANDATORY ASYNC CASES PASS');
}
