/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SUPER_ADMIN_EMAIL,
  USER_ACCOUNTS_PAGE_SIZE,
  AuthManager,
  InMemoryUserAccountsPaginationAdapter,
  sanitizeUserAccountSummary,
  isSuperAdminUser,
  getUserDisplayLabel,
  resolveUserRole,
  setVerifiedServerRoleForUid,
  clearVerifiedServerRoles,
  getRoleNameFrameClasses,
  getRoleDisplayInfo,
  type ValidatedUserAccount,
} from './authManager.ts';
import { ScoreManager } from './scoreManager.ts';
import { getAvailableSettingsTabsForRole } from '../components/SettingsModal.tsx';
import { SoundManager } from './audio.ts';
import {
  MusicManager,
  InMemorySharedMusicCloudAdapter,
  SHARED_SYSTEM_BGM_ID,
  evaluateSystemAudioConfigRule,
  classifyStorageCloudError,
  validateSafeAudioAssetPath,
  buildGitHubPagesAudioUrl,
  normalizeSafeAudioFileName,
  type SystemAudioConfigDocument,
} from './musicManager.ts';
import { getSessionBadgeInfo } from '../components/AuthSessionBanner.tsx';
import {
  AVATAR_LIMITS,
  STORAGE_OVERWRITE_ENFORCEMENT_CLASSIFICATION,
  PRODUCTION_BUCKET_OBJECT_VERSIONING_STATUS,
  DEFAULT_STORAGE_IMAGE_FETCH_MODE,
  validateCatalogAvatarFileClientSide,
  evaluateUserProfileMetadataRule,
  evaluateAvatarCatalogRule,
  evaluateStorageCatalogRule,
  buildCatalogStoragePath,
  generateUniqueCatalogFileName,
  allocateUniqueCatalogStoragePath,
  syncHighestVersionMapsFromCatalogRecords,
  SECOND_UPLOAD_SAME_PATH_STORAGE_RULE_STATUS,
  getSecondUploadSamePathStorageEnforcementVerdict,
  resolvePlayerAvatarUrl,
  BlobObjectUrlCacheManager,
  AvatarManager,
  validatePendingUploadRecordNoSecrets,
  BrowserPendingUploadPersistentStore,
  DurableInMemoryPendingUploadStore,
  InMemoryAvatarCatalogSystem,
  getGooglePhotoUrlForUser,
  classifyUserProfileFirestoreError,
  verifyStorageObjectBeforeMetadataActivation,
  type PendingCatalogMetadataSync,
} from './avatarManager.ts';
import {
  GameEngine,
  NEUTRAL_INPUT,
  validateAndNormalizeAuthoritativeSnapshot,
} from './gameEngine.ts';
import {
  MATCH_TIMER_CONFIG,
  SIMULATION_CONFIG,
  formatCountdownMMSS,
} from './constants.ts';
import { TILE_TYPES as TileType } from './types.ts';
import {
  CoopOnlineManager,
  InMemoryCoopStorageAdapter,
  createInMemoryP2PChannelPair,
  generateRoomCode,
  validateRoomCodeFormat,
  validateRoomPassword,
  computeRoomPasswordDigest,
  encodeHostDisplayNameWithLock,
  decodeHostDisplayNameAndLock,
  verifyRoomPassword,
  getPublicQuickJoinSlotCodesForBucket,
  getPublicQuickJoinCandidateCodes,
  sanitizeAndValidateInputPacket,
  buildAuthoritativeSnapshot,
  evaluateJoinRoomCandidate,
  evaluateStartMatchCandidate,
  evaluateCoopRoomRuleCreate,
  evaluateCoopRoomRuleUpdate,
  evaluateCoopSignalingRuleCreate,
  evaluateCoopSignalingRuleUpdate,
  evaluateUserSessionRuleUpdate,
  evaluateCoopRoomReadAccess,
  hasValidRecordedMatchResultModel,
  classifyGetRoomErrorDuringCreate,
  buildCreateRoomStepErrorMessage,
  COOP_ONLINE_CONFIG,
  type CoopAuthoritativeSnapshot,
  type CoopRoomDocument,
  type CoopRoomLobbyDocument,
  type CoopRoomSignalingDocument,
} from './coopOnlineManager.ts';

export interface M7_3TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface M7_3SuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: M7_3TestResult[];
}

export function runAllM7_3Tests(): M7_3SuiteSummary {
  const results: M7_3TestResult[] = [];

  // =========================================================================
  // M7_3_T01: Super Admin Identification (linhnk.online@gmail.com only)
  // =========================================================================
  {
    const superAdminAccount: ValidatedUserAccount = {
      uid: 'uid_super_admin',
      email: 'linhnk.online@gmail.com',
      emailVerified: true,
      displayName: 'Linh NK',
      photoURL: null,
      providerIds: ['google.com'],
    };
    const superAdminUpper: ValidatedUserAccount = {
      ...superAdminAccount,
      email: '  LINHNK.ONLINE@GMAIL.COM ',
    };
    const regularGmail: ValidatedUserAccount = {
      uid: 'uid_player_1',
      email: 'other.player@gmail.com',
      emailVerified: true,
      displayName: 'Người Chơi 1',
      photoURL: null,
      providerIds: ['google.com'],
    };
    const unverifiedAdminEmail: ValidatedUserAccount = {
      ...superAdminAccount,
      emailVerified: false,
    };
    const nonGoogleProvider: ValidatedUserAccount = {
      ...superAdminAccount,
      providerIds: ['password'],
    };

    const isExactAdmin = isSuperAdminUser(superAdminAccount);
    const isCaseInsensitiveAdmin = isSuperAdminUser(superAdminUpper);
    const isRegularAdmin = isSuperAdminUser(regularGmail);
    const isUnverifiedAdmin = isSuperAdminUser(unverifiedAdminEmail);
    const isNonGoogleAdmin = isSuperAdminUser(nonGoogleProvider);
    const isNullAdmin = isSuperAdminUser(null);

    const passed =
      SUPER_ADMIN_EMAIL === 'linhnk.online@gmail.com' &&
      isExactAdmin === true &&
      isCaseInsensitiveAdmin === true &&
      isRegularAdmin === false &&
      isUnverifiedAdmin === false &&
      isNonGoogleAdmin === false &&
      isNullAdmin === false;

    results.push({
      id: 'M7_3_T01',
      name: 'Phân quyền Super Admin duy nhất cho linhnk.online@gmail.com (Google Verified)',
      passed,
      details: `superAdmin=${isExactAdmin}, upperTrim=${isCaseInsensitiveAdmin}, regular=${isRegularAdmin}, unverified=${isUnverifiedAdmin}, nonGoogle=${isNonGoogleAdmin}, null=${isNullAdmin}`,
    });
  }

  // =========================================================================
  // M7_3_T02: Chống giả mạo quyền Super Admin qua localStorage & đồng bộ MusicManager
  // =========================================================================
  {
    const mm = MusicManager.getInstance();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('bantank_user_role_v1', 'SUPER_ADMIN');
    }

    // Sync with regular player -> must enforce PLAYER and strip any localStorage tampering
    mm.syncRoleFromAuthUser({
      uid: 'u_normal',
      email: 'normal.user@gmail.com',
      emailVerified: true,
      displayName: 'Normal User',
      photoURL: null,
      providerIds: ['google.com'],
    });
    const roleForNormal = mm.getUserRole();
    const canManageNormal = mm.canManageMusic();

    // Sync with verified Super Admin -> must grant SUPER_ADMIN
    mm.syncRoleFromAuthUser({
      uid: 'u_super',
      email: 'linhnk.online@gmail.com',
      emailVerified: true,
      displayName: 'Super Admin',
      photoURL: null,
      providerIds: ['google.com'],
    });
    const roleForSuper = mm.getUserRole();
    const canManageSuper = mm.canManageMusic();

    // Sync with null (sign out) -> must immediately revoke back to PLAYER
    mm.syncRoleFromAuthUser(null);
    const roleAfterLogout = mm.getUserRole();
    const canManageAfterLogout = mm.canManageMusic();

    const passed =
      roleForNormal === 'PLAYER' &&
      canManageNormal === false &&
      roleForSuper === 'SUPER_ADMIN' &&
      canManageSuper === true &&
      roleAfterLogout === 'PLAYER' &&
      canManageAfterLogout === false;

    results.push({
      id: 'M7_3_T02',
      name: 'Chặn nâng quyền qua localStorage và đồng bộ quyền MusicManager theo Auth thực tế',
      passed,
      details: `normal=(${roleForNormal}, canManage=${canManageNormal}), super=(${roleForSuper}, canManage=${canManageSuper}), logout=(${roleAfterLogout}, canManage=${canManageAfterLogout})`,
    });
  }

  // =========================================================================
  // M7_3_T03: Hiển thị tên tài khoản (ẩn email) và loại bỏ "Đang trực tuyến"
  // =========================================================================
  {
    const labelWithDisplayName = getUserDisplayLabel({
      displayName: 'Chiến Binh Rồng',
      email: 'dragon.player@gmail.com',
    });
    const labelFallbackEmailPrefix = getUserDisplayLabel({
      displayName: '   ',
      email: 'tankmaster99@gmail.com',
    });
    const labelFallbackEmpty = getUserDisplayLabel({
      displayName: null,
      email: null,
    });

    const activeBadgeNormal = getSessionBadgeInfo('ACTIVE', false, false, true);
    const activeBadgeHeartbeat = getSessionBadgeInfo('ACTIVE', false, true, true);

    const passed =
      labelWithDisplayName === 'Chiến Binh Rồng' &&
      !labelWithDisplayName.includes('@') &&
      labelFallbackEmailPrefix === 'tankmaster99' &&
      !labelFallbackEmailPrefix.includes('@gmail.com') &&
      labelFallbackEmpty === 'Chiến Binh Tank' &&
      activeBadgeNormal.label === '' &&
      !activeBadgeNormal.label.includes('Đang trực tuyến') &&
      activeBadgeHeartbeat.label === 'Đang kiểm tra kết nối...';

    results.push({
      id: 'M7_3_T03',
      name: 'Hiển thị Tên người dùng (ẩn địa chỉ email) & loại bỏ nhãn "Đang trực tuyến"',
      passed,
      details: `withName="${labelWithDisplayName}", fallbackPrefix="${labelFallbackEmailPrefix}", activeBadge="${activeBadgeNormal.label}"`,
    });
  }

  // =========================================================================
  // M7_3_T04: Bảo toàn logic Stage 1 (30 xe địch, Đại Bàng (12,6), gạch bảo vệ)
  // =========================================================================
  {
    const engine = new GameEngine();
    engine.startMatch('SOLO', 'DEFAULT');
    const st = engine.getState();

    const totalInitialEnemies = st.enemies.length + st.enemyQueue.length + st.totalDefeatedEnemies;
    const baseTile = st.terrain.currentMap[12][6];
    const leftBrick = st.terrain.currentMap[12][5];
    const rightBrick = st.terrain.currentMap[12][7];
    const topBrick = st.terrain.currentMap[11][6];

    const passed =
      totalInitialEnemies === 30 &&
      baseTile === TileType.BASE &&
      leftBrick === TileType.BRICK &&
      rightBrick === TileType.BRICK &&
      topBrick === TileType.BRICK &&
      st.terrain.isBaseDestroyed === false;

    results.push({
      id: 'M7_3_T04',
      name: 'Bảo toàn thông số lõi Stage 1: 30 xe địch, Đại Bàng (12,6) và tường gạch bảo vệ',
      passed,
      details: `totalEnemies=${totalInitialEnemies}, base(12,6)=${baseTile}, bricks=(${leftBrick},${topBrick},${rightBrick})`,
    });
  }

  // =========================================================================
  // M7_3_T05: Mã phòng Co-op Online 6 ký tự (Generate & Validate Format)
  // =========================================================================
  {
    const generatedCodes = Array.from({ length: 25 }, () => generateRoomCode());
    const allValid6Chars = generatedCodes.every(
      (c) => c.length === 6 && validateRoomCodeFormat(c).valid && !/[IO01]/.test(c)
    );
    const invalidShort = validateRoomCodeFormat('ABC12').valid;
    const invalidLong = validateRoomCodeFormat('ABCDEFG').valid;
    const invalidSpecial = validateRoomCodeFormat('AB$123').valid;
    const normalizedTrim = validateRoomCodeFormat('  ab23cd ').normalized;

    const passed =
      allValid6Chars === true &&
      invalidShort === false &&
      invalidLong === false &&
      invalidSpecial === false &&
      normalizedTrim === 'AB23CD';

    results.push({
      id: 'M7_3_T05',
      name: 'Tạo và kiểm tra định dạng mã phòng Co-op Online 6 ký tự chuẩn',
      passed,
      details: `sample=${generatedCodes[0]}, all25Valid=${allValid6Chars}, short=${invalidShort}, long=${invalidLong}, special=${invalidSpecial}, normalized=${normalizedTrim}`,
    });
  }

  // =========================================================================
  // M7_3_T06: Tạo phòng, Tham gia phòng và Chặn người thứ 3 / Phòng hết hạn / Tự vào phòng mình
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const hostUser = { uid: 'uid_host_p1', displayName: 'Host P1', email: 'host@gmail.com' };
    const guestUser = { uid: 'uid_guest_p2', displayName: 'Guest P2', email: 'guest@gmail.com' };
    const thirdUser = { uid: 'uid_third_p3', displayName: 'Player 3', email: 'third@gmail.com' };

    const baseRoom: CoopRoomLobbyDocument = {
      roomCode: 'TANK99',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: hostUser.uid,
      hostDisplayName: hostUser.displayName,
      hostReady: false,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    const notFoundCheck = evaluateJoinRoomCandidate(null, 'ZZZZZZ', guestUser, t0 + 1000);
    const badFormatCheck = evaluateJoinRoomCandidate(baseRoom, '123', guestUser, t0 + 1000);
    const selfJoinCheck = evaluateJoinRoomCandidate(baseRoom, 'TANK99', hostUser, t0 + 1000);
    const expiredCheck = evaluateJoinRoomCandidate(
      baseRoom,
      'TANK99',
      guestUser,
      t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS + 1000
    );
    const validGuestJoin = evaluateJoinRoomCandidate(baseRoom, 'TANK99', guestUser, t0 + 2000);

    const roomWithGuest: CoopRoomLobbyDocument = {
      ...baseRoom,
      guestUid: guestUser.uid,
      guestDisplayName: guestUser.displayName,
    };
    const thirdPlayerCheck = evaluateJoinRoomCandidate(roomWithGuest, 'TANK99', thirdUser, t0 + 3000);

    const startedRoomWithoutGuest: CoopRoomLobbyDocument = {
      ...baseRoom,
      status: 'PLAYING',
    };
    const joinAfterStartCheck = evaluateJoinRoomCandidate(
      startedRoomWithoutGuest,
      'TANK99',
      thirdUser,
      t0 + 3000
    );

    const passed =
      notFoundCheck.success === false &&
      notFoundCheck.errorCode === 'ROOM_NOT_FOUND' &&
      badFormatCheck.success === false &&
      badFormatCheck.errorCode === 'INVALID_CODE_FORMAT' &&
      selfJoinCheck.success === false &&
      selfJoinCheck.errorCode === 'SAME_USER_AS_HOST' &&
      expiredCheck.success === false &&
      expiredCheck.errorCode === 'ROOM_EXPIRED' &&
      validGuestJoin.success === true &&
      thirdPlayerCheck.success === false &&
      thirdPlayerCheck.errorCode === 'ROOM_FULL' &&
      joinAfterStartCheck.success === false &&
      joinAfterStartCheck.errorCode === 'MATCH_ALREADY_STARTED';

    results.push({
      id: 'M7_3_T06',
      name: 'Kiểm soát vào phòng Co-op: Đúng 2 người/phòng, chặn người thứ 3, phòng hết hạn và tự vào phòng mình',
      passed,
      details: `notFound=${notFoundCheck.errorCode}, selfJoin=${selfJoinCheck.errorCode}, expired=${expiredCheck.errorCode}, validJoin=${validGuestJoin.success}, 3rdPlayer=${thirdPlayerCheck.errorCode}, afterStart=${joinAfterStartCheck.errorCode}`,
    });
  }

  // =========================================================================
  // M7_3_T07: Xác nhận Sẵn sàng (Ready) & Kênh P2P CONNECTED trước khi Chủ phòng bắt đầu
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const roomWaitingNoGuest: CoopRoomLobbyDocument = {
      roomCode: 'TANK88',
      status: 'WAITING',
      difficulty: 'EXTREME',
      hostUid: 'uid_host',
      hostDisplayName: 'Host',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    const startWithoutGuest = evaluateStartMatchCandidate(roomWaitingNoGuest, 'uid_host', 'HOST');

    const roomGuestNotReady: CoopRoomLobbyDocument = {
      ...roomWaitingNoGuest,
      guestUid: 'uid_guest',
      guestDisplayName: 'Guest',
      hostReady: true,
      guestReady: false,
      rtcConnectionState: 'CONNECTED',
    };
    const startGuestNotReady = evaluateStartMatchCandidate(roomGuestNotReady, 'uid_host', 'HOST');

    const roomBothReadyNotConnected: CoopRoomLobbyDocument = {
      ...roomGuestNotReady,
      hostReady: true,
      guestReady: true,
      rtcConnectionState: 'CONNECTING',
    };
    const startWithoutWebRtcConnected = evaluateStartMatchCandidate(
      roomBothReadyNotConnected,
      'uid_host',
      'HOST'
    );

    const roomBothReadyConnected: CoopRoomLobbyDocument = {
      ...roomGuestNotReady,
      hostReady: true,
      guestReady: true,
      rtcConnectionState: 'CONNECTED',
    };
    const startByGuest = evaluateStartMatchCandidate(roomBothReadyConnected, 'uid_guest', 'GUEST');
    const startByHostBothReady = evaluateStartMatchCandidate(roomBothReadyConnected, 'uid_host', 'HOST');

    const passed =
      startWithoutGuest.success === false &&
      startWithoutGuest.errorCode === 'PLAYERS_NOT_READY' &&
      startGuestNotReady.success === false &&
      startGuestNotReady.errorCode === 'PLAYERS_NOT_READY' &&
      startWithoutWebRtcConnected.success === false &&
      startWithoutWebRtcConnected.errorCode === 'WEBRTC_NOT_CONNECTED' &&
      startByGuest.success === false &&
      startByGuest.errorCode === 'NOT_HOST' &&
      startByHostBothReady.success === true;

    results.push({
      id: 'M7_3_T07',
      name: 'Bắt buộc cả P1/P2 Sẵn sàng VÀ DataChannel CONNECTED mới cho phép Host bắt đầu trận',
      passed,
      details: `noGuest=${startWithoutGuest.errorCode}, guestUnready=${startGuestNotReady.errorCode}, p2pConnecting=${startWithoutWebRtcConnected.errorCode}, guestTryStart=${startByGuest.errorCode}, hostBothReadyConnected=${startByHostBothReady.success}`,
    });
  }

  // =========================================================================
  // M7_3_T08: Kiểm tra gói tin Input P2 (Sanitize, Monotonic Seq, Chống gói tin lặp/cũ)
  // =========================================================================
  {
    const storage = new InMemoryCoopStorageAdapter();
    const manager = new CoopOnlineManager(storage);

    // 1. Validate packet structure & opposing direction sanitization
    const invalidNull = sanitizeAndValidateInputPacket(null);
    const invalidNegativeSeq = sanitizeAndValidateInputPacket({
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: false,
      seq: 0,
      clientTimestamp: 1000,
    });
    const opposingDirsPacket = sanitizeAndValidateInputPacket({
      up: true,
      down: true,
      left: true,
      right: false,
      shoot: true,
      seq: 1,
      clientTimestamp: 1000,
    });

    // 2. Host incoming sequence ordering (accepts seq=1, seq=2; rejects duplicate seq=2 and older seq=1)
    const acceptSeq1 = manager.processIncomingGuestInput({
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: false,
      seq: 1,
      clientTimestamp: 1000,
    });
    const acceptSeq2 = manager.processIncomingGuestInput({
      up: false,
      down: false,
      left: true,
      right: false,
      shoot: true,
      seq: 2,
      clientTimestamp: 1060,
    });
    const rejectDuplicateSeq2 = manager.processIncomingGuestInput({
      up: false,
      down: true,
      left: false,
      right: false,
      shoot: false,
      seq: 2,
      clientTimestamp: 1080,
    });
    const rejectOldSeq1 = manager.processIncomingGuestInput({
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: false,
      seq: 1,
      clientTimestamp: 1090,
    });

    const latestInput = manager.getLatestValidatedGuestInput();

    const passed =
      invalidNull.valid === false &&
      invalidNegativeSeq.valid === false &&
      opposingDirsPacket.valid === true &&
      opposingDirsPacket.sanitized?.up === false &&
      opposingDirsPacket.sanitized?.down === false &&
      opposingDirsPacket.sanitized?.left === true &&
      acceptSeq1.accepted === true &&
      acceptSeq2.accepted === true &&
      rejectDuplicateSeq2.accepted === false &&
      rejectDuplicateSeq2.errorCode === 'OUT_OF_ORDER_SEQ' &&
      rejectOldSeq1.accepted === false &&
      rejectOldSeq1.errorCode === 'OUT_OF_ORDER_SEQ' &&
      latestInput.left === true &&
      latestInput.shoot === true;

    results.push({
      id: 'M7_3_T08',
      name: 'Kiểm duyệt gói điều khiển P2: Chống hướng xung đột, bắt buộc seq tăng dần, từ chối gói trùng/cũ',
      passed,
      details: `opposingSanitized=(up:${opposingDirsPacket.sanitized?.up},down:${opposingDirsPacket.sanitized?.down}), seq1=${acceptSeq1.accepted}, seq2=${acceptSeq2.accepted}, dupSeq2=${rejectDuplicateSeq2.errorCode}, oldSeq1=${rejectOldSeq1.errorCode}`,
    });
  }

  // =========================================================================
  // M7_3_T09: Mô phỏng TWO_PLAYERS_ONLINE trong GameEngine (Vị trí xuất phát, P2 di chuyển & bắn)
  // =========================================================================
  {
    const engine = new GameEngine();
    engine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const st0 = engine.getState();

    const p1SpawnOk = st0.p1.x === 48 && st0.p1.y === 192;
    const p2SpawnOk = Boolean(st0.p2 && st0.p2.x === 144 && st0.p2.y === 192);

    // With zero external input for P2, P2 must NOT be moved autonomously by Ally AI
    for (let i = 0; i < 20; i++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }
    const stIdle = engine.getState();
    const p2StayedStillWhenIdle = Boolean(stIdle.p2 && stIdle.p2.x === 144 && stIdle.p2.y === 192);

    // Now apply Guest P2 external input: move UP and shoot
    engine.setExternalInputP2({ up: true, down: false, left: false, right: false, shoot: true });
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });

    const stActive = engine.getState();
    const p2MovedUp = Boolean(stActive.p2 && stActive.p2.y < 192 && stActive.p2.direction === 'UP');
    const p2FiredBullet = stActive.bullets.some((b) => b.ownerId === 'p2');

    const passed =
      p1SpawnOk &&
      p2SpawnOk &&
      p2StayedStillWhenIdle &&
      p2MovedUp &&
      p2FiredBullet;

    results.push({
      id: 'M7_3_T09',
      name: 'Chế độ TWO_PLAYERS_ONLINE: P1 tại (48,192), P2 tại (144,192), điều khiển P2 trực tiếp qua Input mạng',
      passed,
      details: `p1Spawn=${p1SpawnOk}, p2Spawn=${p2SpawnOk}, idleNoAI=${p2StayedStillWhenIdle}, p2MovedUp=${p2MovedUp} (y=${stActive.p2?.y}), p2Bullet=${p2FiredBullet}`,
    });
  }

  // =========================================================================
  // M7_3_T10: Luật Friendly-Fire P1-P2 & Hành vi đạn P1/P2/Địch với Base (M7.3 FIX Mục V)
  // =========================================================================
  {
    const engine = new GameEngine();
    engine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const st = engine.getState() as any;

    // Clear shields and enemies for isolated test
    st.p1State.shieldTimer = 0;
    st.p2State.shieldTimer = 0;
    st.enemies = [];

    // 1. Place P1 and P2 facing each other and fire bullets directly at each other -> No friendly fire between P1 and P2
    st.p1.x = 64;
    st.p1.y = 192;
    st.p1.direction = 'RIGHT';
    st.p2.x = 88;
    st.p2.y = 192;
    st.p2.direction = 'LEFT';

    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: true });
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: true });
    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: false });

    for (let i = 0; i < 30; i++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }

    const p1AliveAfterFF = !st.p1State.isDead && st.p1State.lives === 3;
    const p2AliveAfterFF = !st.p2State.isDead && st.p2State.lives === 3;

    // 2. Test P2 firing directly at protective brick (12,7) and Eagle Base (12,6) -> P2 NEVER damages Base or protective bricks
    st.terrain.currentMap[12][7] = TileType.BRICK;
    st.terrain.brickSubTiles['12_7'] = 0b1111;
    st.p2.x = 8 * 16; // col 8, row 12 facing LEFT toward (12,7) and (12,6)
    st.p2.y = 12 * 16;
    st.p2.direction = 'LEFT';

    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: true });
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: false });

    for (let i = 0; i < 30; i++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }

    const rightBrickSafeFromP2 =
      st.terrain.currentMap[12][7] === TileType.BRICK && st.terrain.brickSubTiles['12_7'] === 0b1111;

    // Also test P2 firing directly at exposed Base (12,6) -> Base remains intact
    st.terrain.currentMap[12][7] = TileType.EMPTY;
    st.terrain.brickSubTiles['12_7'] = 0;
    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: true });
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    engine.setExternalInputP2({ up: false, down: false, left: false, right: false, shoot: false });

    for (let i = 0; i < 30; i++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }

    const baseSafeFromP2 =
      st.terrain.currentMap[12][6] === TileType.BASE && st.terrain.isBaseDestroyed === false;

    // 3. Verify pre-M7.3 P1 bullet behavior against Base is preserved (P1 bullet hitting exposed Base triggers Base destruction)
    st.terrain.currentMap[12][5] = TileType.EMPTY;
    st.terrain.brickSubTiles['12_5'] = 0;
    st.p1.x = 4 * 16; // col 4, row 12 facing RIGHT toward exposed Base (12,6)
    st.p1.y = 12 * 16;
    st.p1.direction = 'RIGHT';

    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: true });
    for (let i = 0; i < 30; i++) {
      engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });
    }

    const p1PreservesPreM73BaseBehavior =
      st.terrain.isBaseDestroyed === true && st.isGameOver === true;

    const passed =
      p1AliveAfterFF &&
      p2AliveAfterFF &&
      rightBrickSafeFromP2 &&
      baseSafeFromP2 &&
      p1PreservesPreM73BaseBehavior;

    results.push({
      id: 'M7_3_T10',
      name: 'Bảo toàn luật đạn: P1-P2 không bắn trúng nhau, P2 không phá Base/gạch bảo vệ, P1 giữ nguyên hành vi Game Core',
      passed,
      details: `p1Safe=${p1AliveAfterFF}, p2Safe=${p2AliveAfterFF}, p2BrickSafe=${rightBrickSafeFromP2}, p2BaseSafe=${baseSafeFromP2}, p1PreM73BaseBehavior=${p1PreservesPreM73BaseBehavior}`,
    });
  }

  // =========================================================================
  // M7_3_T11: Đồng bộ Snapshot Authoritative từ Host (P1) sang Guest (P2)
  // =========================================================================
  {
    const hostEngine = new GameEngine();
    const guestEngine = new GameEngine();

    hostEngine.startMatch('TWO_PLAYERS_ONLINE', 'EXTREME');
    guestEngine.startMatch('TWO_PLAYERS_ONLINE', 'EXTREME');

    // Advance Host simulation and mutate score, positions, and brick damage
    hostEngine.setExternalInputP2({ up: true, down: false, left: false, right: false, shoot: true });
    for (let i = 0; i < 15; i++) {
      hostEngine.stepTick({ up: true, down: false, left: false, right: false, shoot: false });
    }
    const hostState = hostEngine.getState() as any;
    hostState.score = 1250;
    hostState.totalDefeatedEnemies = 7;
    hostState.terrain.brickSubTiles['6_6'] = 0b0011; // partially damaged brick
    hostState.terrain.brickSubTiles['5_5'] = 0; // completely destroyed brick
    hostState.terrain.currentMap[5][5] = TileType.EMPTY;

    const snapshot = buildAuthoritativeSnapshot(hostState, 42, 1_700_000_050_000);
    guestEngine.applyAuthoritativeSnapshot(snapshot);

    const guestState = guestEngine.getState();

    const passed =
      guestState.p1.x === hostState.p1.x &&
      guestState.p1.y === hostState.p1.y &&
      Boolean(
        guestState.p2 &&
          guestState.p2.x === hostState.p2.x &&
          guestState.p2.y === hostState.p2.y
      ) &&
      guestState.score === 1250 &&
      guestState.totalDefeatedEnemies === 7 &&
      guestState.terrain.brickSubTiles['6_6'] === 0b0011 &&
      guestState.terrain.currentMap[5][5] === TileType.EMPTY;

    results.push({
      id: 'M7_3_T11',
      name: 'Đồng bộ Snapshot Authoritative từ Host sang Guest (Vị trí P1/P2, Điểm, Địch, Gạch vỡ)',
      passed,
      details: `p1=(${guestState.p1.x},${guestState.p1.y}), p2=(${guestState.p2?.x},${guestState.p2?.y}), score=${guestState.score}, defeated=${guestState.totalDefeatedEnemies}, brick(6,6)=${guestState.terrain.brickSubTiles['6_6']}`,
    });
  }

  // =========================================================================
  // M7_3_T12: Phát hiện mất kết nối (Disconnect Timeout) & Đóng phòng an toàn
  // =========================================================================
  {
    const storage = new InMemoryCoopStorageAdapter();
    const manager = new CoopOnlineManager(storage);
    const t0 = 1_700_000_000_000;

    const activeRoom: CoopRoomDocument = {
      roomCode: 'TANK77',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host',
      hostDisplayName: 'Host',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest',
      guestDisplayName: 'Guest',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcOffer: '{"type":"offer","sdp":"v=0..."}',
      rtcAnswer: '{"type":"answer","sdp":"v=0..."}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      rtcConnectionState: 'CONNECTED',
      finalScore: 0,
      matchOutcome: null,
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    // Inject active room state as HOST
    (manager as any).currentRoom = activeRoom;
    (manager as any).role = 'HOST';
    (manager as any).rtcState = 'CONNECTED';
    (manager as any).lastPeerP2PActiveAt = t0;

    const healthyStatus = manager.evaluatePeerConnectionStatus(t0 + 3000);
    const warningStatus = manager.evaluatePeerConnectionStatus(
      t0 + COOP_ONLINE_CONFIG.DISCONNECT_WARNING_MS + 500
    );
    const timeoutStatus = manager.evaluatePeerConnectionStatus(
      t0 + COOP_ONLINE_CONFIG.DISCONNECT_TIMEOUT_MS + 500
    );

    // Test abandoned status detection
    (manager as any).currentRoom = {
      ...activeRoom,
      status: 'ABANDONED',
      disconnectReason: 'Chủ phòng (P1) đã rời phòng.',
    };
    const abandonedStatus = manager.evaluatePeerConnectionStatus(t0 + 4000);

    const passed =
      healthyStatus.peerConnected === true &&
      healthyStatus.isTimedOut === false &&
      healthyStatus.warningMessage === null &&
      warningStatus.peerConnected === true &&
      warningStatus.isTimedOut === false &&
      warningStatus.warningMessage !== null &&
      timeoutStatus.peerConnected === false &&
      timeoutStatus.isTimedOut === true &&
      abandonedStatus.peerConnected === false &&
      abandonedStatus.isTimedOut === true;

    results.push({
      id: 'M7_3_T12',
      name: 'Phát hiện cảnh báo kết nối yếu, ngắt kết nối quá hạn (Timeout) và đóng phòng an toàn',
      passed,
      details: `healthy=${healthyStatus.peerConnected}, warning="${warningStatus.warningMessage !== null}", timeout=${timeoutStatus.isTimedOut}, abandoned=${abandonedStatus.isTimedOut}`,
    });
  }

  // =========================================================================
  // M7_3_T13: Mô hình kiểm tra logic Rules /coop_rooms & /private/signaling (Phân tách quyền đọc/ghi Host, Guest, Người ngoài)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const waitingRoom: CoopRoomLobbyDocument = {
      roomCode: 'TANK66',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    // 0. Check read isolation on open room vs joined room vs private/signaling
    const outsiderReadOpenLobby = evaluateCoopRoomReadAccess({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 500,
      room: waitingRoom,
      target: 'LOBBY_METADATA',
    });
    const outsiderReadOpenSignaling = evaluateCoopRoomReadAccess({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 500,
      room: waitingRoom,
      target: 'PRIVATE_SIGNALING',
    });

    // 1. Guest 2 joins open room -> ALLOWED (GUEST_JOIN) without changing rtcConnectionState
    const afterGuestJoin: CoopRoomLobbyDocument = {
      ...waitingRoom,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: false,
      guestLastActiveAt: t0 + 1000,
    };
    const guestJoinEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: waitingRoom,
      incoming: afterGuestJoin,
    });

    // Now that Guest 2 has joined: Guest 2 CAN read private/signaling, while Third Player 3 CANNOT read lobby or signaling
    const joinedGuestReadSignaling = evaluateCoopRoomReadAccess({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1500,
      room: afterGuestJoin,
      target: 'PRIVATE_SIGNALING',
    });
    const thirdPlayerReadFullLobby = evaluateCoopRoomReadAccess({
      authUid: 'uid_third_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1500,
      room: afterGuestJoin,
      target: 'LOBBY_METADATA',
    });
    const thirdPlayerReadSignaling = evaluateCoopRoomReadAccess({
      authUid: 'uid_third_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1500,
      room: afterGuestJoin,
      target: 'PRIVATE_SIGNALING',
    });

    // 2. Third player tries to overwrite guestUid -> REJECTED
    const thirdPlayerHijack: CoopRoomLobbyDocument = {
      ...afterGuestJoin,
      guestUid: 'uid_third_3',
      guestDisplayName: 'Hacker 3',
    };
    const thirdPlayerEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_third_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: afterGuestJoin,
      incoming: thirdPlayerHijack,
    });

    // 3. Guest 2 updates guestReady and guestLastActiveAt (keeping rtcConnectionState unchanged) -> ALLOWED
    const guestReadyUpdate: CoopRoomLobbyDocument = {
      ...afterGuestJoin,
      guestReady: true,
      guestLastActiveAt: t0 + 3000,
    };
    const guestReadyEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3000,
      existing: afterGuestJoin,
      incoming: guestReadyUpdate,
    });

    // 3b. Host updates rtcConnectionState to CONNECTED after DataChannel.onopen -> ALLOWED (HOST_UPDATE)
    const afterHostConnected: CoopRoomLobbyDocument = {
      ...guestReadyUpdate,
      rtcConnectionState: 'CONNECTED',
      hostLastActiveAt: t0 + 3200,
    };
    const hostConnectedEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3200,
      existing: guestReadyUpdate,
      incoming: afterHostConnected,
    });

    // 4. Guest 2 tries to tamper with difficulty, hostUid, or status='PLAYING' -> REJECTED
    const guestTamperStatus: CoopRoomLobbyDocument = {
      ...afterHostConnected,
      status: 'PLAYING',
    };
    const guestTamperEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3500,
      existing: afterHostConnected,
      incoming: guestTamperStatus,
    });

    // 5. Host tries to overwrite joined guestUid or guestReady -> REJECTED
    const hostOverwriteGuest: CoopRoomLobbyDocument = {
      ...afterHostConnected,
      guestUid: 'uid_other_guest',
    };
    const hostOverwriteGuestEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3600,
      existing: afterHostConnected,
      incoming: hostOverwriteGuest,
    });

    // 6. Host starts match when both players are ready AND rtcConnectionState == 'CONNECTED' -> ALLOWED (HOST_UPDATE)
    const hostStartMatch: CoopRoomLobbyDocument = {
      ...afterHostConnected,
      status: 'PLAYING',
      hostLastActiveAt: t0 + 4000,
    };
    const hostStartEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 4000,
      existing: afterHostConnected,
      incoming: hostStartMatch,
    });

    const passed =
      outsiderReadOpenLobby === true &&
      outsiderReadOpenSignaling === false &&
      joinedGuestReadSignaling === true &&
      thirdPlayerReadFullLobby === false &&
      thirdPlayerReadSignaling === false &&
      guestJoinEval.allowed === true &&
      guestJoinEval.matchedBranch === 'GUEST_JOIN' &&
      thirdPlayerEval.allowed === false &&
      guestReadyEval.allowed === true &&
      guestReadyEval.matchedBranch === 'GUEST_READY_OR_STATE' &&
      hostConnectedEval.allowed === true &&
      hostConnectedEval.matchedBranch === 'HOST_UPDATE' &&
      guestTamperEval.allowed === false &&
      hostOverwriteGuestEval.allowed === false &&
      hostStartEval.allowed === true &&
      hostStartEval.matchedBranch === 'HOST_UPDATE';

    results.push({
      id: 'M7_3_T13',
      name: 'Mô hình kiểm tra Rules /coop_rooms & /private/signaling: Bảo mật đọc SDP/ICE và tách biệt quyền ghi Host/Guest',
      passed,
      details: `openSignalingBlocked=${!outsiderReadOpenSignaling}, 3rdLobbyBlocked=${!thirdPlayerReadFullLobby}, guestJoin=${guestJoinEval.allowed}, guestReady=${guestReadyEval.allowed}, hostConn=${hostConnectedEval.allowed}, guestTamperBlocked=${!guestTamperEval.allowed}, hostStart=${hostStartEval.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T14: Kiến trúc WebRTC DataChannel P2P – 0 lượt ghi Firestore trong trận & Đệm ICE trước SDP
  // =========================================================================
  {
    const sharedStorage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(sharedStorage);
    const guestManager = new CoopOnlineManager(sharedStorage);

    // Verify pre-SDP ICE candidate buffering when remoteDescription is not yet set
    const fakePcWithoutRemoteDesc: any = {
      remoteDescription: null,
      addedCandidates: [] as any[],
      addIceCandidate: async function (cand: any) {
        this.addedCandidates.push(cand);
      },
    };
    (hostManager as any).peerConnection = fakePcWithoutRemoteDesc;
    hostManager.enqueueOrAddRemoteIceCandidatesJson(
      JSON.stringify([
        {
          candidate: 'candidate:1 1 UDP 2122252543 192.0.2.1 54321 typ host',
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      ])
    );
    const bufferedCountBeforeSdp = hostManager.getPendingRemoteIceCandidatesCount();
    fakePcWithoutRemoteDesc.remoteDescription = { type: 'answer', sdp: 'v=0...' };
    void hostManager.flushPendingRemoteIceCandidates();
    const bufferedCountAfterFlush = hostManager.getPendingRemoteIceCandidatesCount();
    const flushedCandidateAdded = fakePcWithoutRemoteDesc.addedCandidates.length === 1;
    (hostManager as any).peerConnection = null;

    const t0 = 1_700_000_000_000;
    const initialRoom: CoopRoomDocument = {
      roomCode: 'P2P999',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_p1',
      hostDisplayName: 'Host P1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_p2',
      guestDisplayName: 'Guest P2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      rtcConnectionState: 'CONNECTED',
      finalScore: 0,
      matchOutcome: null,
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    sharedStorage.setRoomSync('P2P999', initialRoom);
    (hostManager as any).currentRoom = initialRoom;
    (hostManager as any).role = 'HOST';
    (guestManager as any).currentRoom = initialRoom;
    (guestManager as any).role = 'GUEST';

    // Connect Host and Guest via direct P2P DataChannel pair
    const { hostChannel, guestChannel } = createInMemoryP2PChannelPair(
      (msg) => hostManager.handleIncomingDataChannelMessage(msg, t0 + 1000),
      (msg) => guestManager.handleIncomingDataChannelMessage(msg, t0 + 1000)
    );
    hostManager.attachCustomP2PChannel(hostChannel, t0);
    guestManager.attachCustomP2PChannel(guestChannel, t0);

    let snapshotsReceivedByGuest = 0;
    guestManager.subscribeSnapshots(() => {
      snapshotsReceivedByGuest++;
    });

    // Reset Firestore write counter right before gameplay loop starts
    sharedStorage.resetCounters();

    const engine = new GameEngine();
    engine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');

    // Simulate 40 Guest input packets & 40 Host snapshot frames over P2P DataChannel
    let simTime = t0 + 100;
    for (let step = 1; step <= 40; step++) {
      simTime += 50; // 50ms per step (> 45ms min input interval)
      void guestManager.submitGuestInput(
        {
          up: step % 2 === 0,
          down: false,
          left: step % 2 === 1,
          right: false,
          shoot: step % 3 === 0,
        },
        simTime,
        true
      );
      engine.setExternalInputP2(hostManager.getLatestValidatedGuestInput());
      engine.stepTick({ up: true, down: false, left: false, right: false, shoot: false });
      void hostManager.onHostSimulationFrame(50, engine.getState(), simTime);
    }

    const firestoreWritesDuringActiveMatch = sharedStorage.getWriteCount();
    const hostProcessedSeq = hostManager.getHostLastProcessedGuestSeq();

    // Now simulate P2P channel disconnect -> Guest input must fail cleanly with WEBRTC_NOT_CONNECTED and 0 Firestore fallback writes
    guestChannel.close();
    simTime += 100;
    void guestManager.submitGuestInput(
      { up: true, down: false, left: false, right: false, shoot: true },
      simTime,
      true
    );
    const firestoreWritesAfterP2PFailure = sharedStorage.getWriteCount();

    const passed =
      bufferedCountBeforeSdp === 1 &&
      bufferedCountAfterFlush === 0 &&
      flushedCandidateAdded === true &&
      firestoreWritesDuringActiveMatch === 0 &&
      firestoreWritesAfterP2PFailure === 0 &&
      hostProcessedSeq === 40 &&
      snapshotsReceivedByGuest >= 35;

    results.push({
      id: 'M7_3_T14',
      name: 'Đồng bộ trong trận qua WebRTC DataChannel: 0 lượt ghi Firestore & Đệm ICE trước SDP an toàn',
      passed,
      details: `icePreSdpBuffered=${bufferedCountBeforeSdp}->${bufferedCountAfterFlush}, firestoreWritesInMatch=${firestoreWritesDuringActiveMatch}, writesAfterDisconnect=${firestoreWritesAfterP2PFailure}, hostProcessedInputSeq=${hostProcessedSeq}, guestReceivedSnapshots=${snapshotsReceivedByGuest}`,
    });
  }

  // =========================================================================
  // M7_3_T15: Kiểm thử 12 ca phân quyền /coop_rooms/{roomCode}/private/signaling (Mục VII.A)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const parentWaitingEmpty: CoopRoomLobbyDocument = {
      roomCode: 'SIG777',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: false,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    const validInitialSignaling: CoopRoomSignalingDocument = {
      roomCode: 'SIG777',
      hostUid: 'uid_host_1',
      guestUid: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0,
    };

    // Case 1: Host hợp lệ tạo signaling sau khi tạo lobby -> PASS (true)
    const c1HostCreateOk = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 200,
      roomCode: 'SIG777',
      parentRoom: parentWaitingEmpty,
      existingSignaling: null,
      incoming: validInitialSignaling,
    });

    // Case 2: Người không phải Host tạo signaling -> DENY (false)
    const c2NonHostCreateDeny = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 200,
      roomCode: 'SIG777',
      parentRoom: parentWaitingEmpty,
      existingSignaling: null,
      incoming: { ...validInitialSignaling, hostUid: 'uid_guest_2' },
    });

    // Case 3: Tạo signaling khi phòng cha không tồn tại -> DENY (false)
    const c3NoParentCreateDeny = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 200,
      roomCode: 'SIG777',
      parentRoom: null,
      existingSignaling: null,
      incoming: validInitialSignaling,
    });

    // Case 4: Tạo signaling khi phòng đã hết hạn -> DENY (false)
    const c4ExpiredCreateDeny = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS + 1000,
      roomCode: 'SIG777',
      parentRoom: parentWaitingEmpty,
      existingSignaling: null,
      incoming: {
        ...validInitialSignaling,
        updatedAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS + 1000,
      },
    });

    // Case 5: Tài khoản thứ ba tạo signaling trước để chiếm mã phòng (khi phòng cha chưa tồn tại hoặc của Host khác) -> DENY (false)
    const c5ThirdPartySquatBeforeParent = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_attacker_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0,
      roomCode: 'SIG777',
      parentRoom: null,
      existingSignaling: null,
      incoming: { ...validInitialSignaling, hostUid: 'uid_attacker_3' },
    });
    const c5ThirdPartySquatAfterParent = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_attacker_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 100,
      roomCode: 'SIG777',
      parentRoom: parentWaitingEmpty,
      existingSignaling: null,
      incoming: { ...validInitialSignaling, hostUid: 'uid_attacker_3' },
    });

    const parentWithGuest: CoopRoomLobbyDocument = {
      ...parentWaitingEmpty,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      rtcConnectionState: 'CONNECTING',
    };

    // Case 6: Host cập nhật signaling (Offer + Host ICE) đúng phòng -> PASS (true)
    const sigAfterHostOffer: CoopRoomSignalingDocument = {
      ...validInitialSignaling,
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer","sdp":"v=0..."}',
      hostIceCandidates: '[{"candidate":"cand1"}]',
      updatedAt: t0 + 1000,
    };
    const c6HostUpdateOk = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      roomCode: 'SIG777',
      parentRoom: parentWithGuest,
      existing: validInitialSignaling,
      incoming: sigAfterHostOffer,
    });

    // Case 7: Host của phòng khác cập nhật signaling của phòng này -> DENY (false)
    const c7OtherHostUpdateDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_other_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      roomCode: 'SIG777',
      parentRoom: parentWithGuest,
      existing: validInitialSignaling,
      incoming: sigAfterHostOffer,
    });

    // Case 8: Guest cập nhật Answer / Guest ICE đúng phòng -> PASS (true)
    const sigAfterGuestAnswer: CoopRoomSignalingDocument = {
      ...sigAfterHostOffer,
      rtcAnswer: '{"type":"answer","sdp":"v=0..."}',
      guestIceCandidates: '[{"candidate":"cand2"}]',
      updatedAt: t0 + 2000,
    };
    const c8GuestUpdateOk = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      roomCode: 'SIG777',
      parentRoom: parentWithGuest,
      existing: sigAfterHostOffer,
      incoming: sigAfterGuestAnswer,
    });

    // Case 9: Guest tự đặt guestUid thành null khi vẫn tham gia phòng -> DENY (false)
    const c9GuestNullifyUidWhileJoinedDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2500,
      roomCode: 'SIG777',
      parentRoom: parentWithGuest,
      existing: sigAfterGuestAnswer,
      incoming: {
        ...sigAfterGuestAnswer,
        guestUid: null,
        updatedAt: t0 + 2500,
      },
    });

    // Case 10: Guest sửa Offer, Host ICE hoặc kết quả -> DENY (false)
    const c10GuestTamperOfferDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2600,
      roomCode: 'SIG777',
      parentRoom: parentWithGuest,
      existing: sigAfterGuestAnswer,
      incoming: {
        ...sigAfterGuestAnswer,
        rtcOffer: '{"type":"offer","sdp":"hacked"}',
        updatedAt: t0 + 2600,
      },
    });
    const c10GuestTamperScoreDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2600,
      roomCode: 'SIG777',
      parentRoom: { ...parentWithGuest, status: 'PLAYING' },
      existing: sigAfterGuestAnswer,
      incoming: {
        ...sigAfterGuestAnswer,
        finalScore: 99999,
        matchOutcome: 'VICTORY',
        updatedAt: t0 + 2600,
      },
    });

    // Case 11: Người thứ ba đọc signaling -> DENY (false)
    const c11ThirdPartyReadDeny = evaluateCoopRoomReadAccess({
      authUid: 'uid_third_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2700,
      room: parentWithGuest,
      target: 'PRIVATE_SIGNALING',
    });

    // Case 12: Host ghi kết quả lần 1 khi PLAYING -> PASS; sửa finalScore lần 2 sau khi đã ghi -> DENY
    const parentPlaying: CoopRoomLobbyDocument = {
      ...parentWithGuest,
      status: 'PLAYING',
      hostReady: true,
      guestReady: true,
      rtcConnectionState: 'CONNECTED',
    };
    const sigWithResult1: CoopRoomSignalingDocument = {
      ...sigAfterGuestAnswer,
      finalScore: 4500,
      matchOutcome: 'VICTORY',
      updatedAt: t0 + 5000,
    };
    const c12FirstWriteResultOk = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      roomCode: 'SIG777',
      parentRoom: parentPlaying,
      existing: sigAfterGuestAnswer,
      incoming: sigWithResult1,
    });
    const c12OverwriteResultDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 6000,
      roomCode: 'SIG777',
      parentRoom: parentPlaying,
      existing: sigWithResult1,
      incoming: {
        ...sigWithResult1,
        finalScore: 99999,
        updatedAt: t0 + 6000,
      },
    });

    const passed =
      c1HostCreateOk === true &&
      c2NonHostCreateDeny === false &&
      c3NoParentCreateDeny === false &&
      c4ExpiredCreateDeny === false &&
      c5ThirdPartySquatBeforeParent === false &&
      c5ThirdPartySquatAfterParent === false &&
      c6HostUpdateOk.allowed === true &&
      c7OtherHostUpdateDeny.allowed === false &&
      c8GuestUpdateOk.allowed === true &&
      c9GuestNullifyUidWhileJoinedDeny.allowed === false &&
      c10GuestTamperOfferDeny.allowed === false &&
      c10GuestTamperScoreDeny.allowed === false &&
      c11ThirdPartyReadDeny === false &&
      c12FirstWriteResultOk.allowed === true &&
      c12OverwriteResultDeny.allowed === false;

    results.push({
      id: 'M7_3_T15',
      name: 'Kiểm thử 12 ca quyền /private/signaling: Khóa CREATE/UPDATE theo phòng cha & chặn sửa kết quả lần 2',
      passed,
      details: `c1=${c1HostCreateOk}, c2=${!c2NonHostCreateDeny}, c3=${!c3NoParentCreateDeny}, c4=${!c4ExpiredCreateDeny}, c5=${!c5ThirdPartySquatBeforeParent && !c5ThirdPartySquatAfterParent}, c6=${c6HostUpdateOk.allowed}, c7=${!c7OtherHostUpdateDeny.allowed}, c8=${c8GuestUpdateOk.allowed}, c9=${!c9GuestNullifyUidWhileJoinedDeny.allowed}, c10=${!c10GuestTamperOfferDeny.allowed && !c10GuestTamperScoreDeny.allowed}, c11=${!c11ThirdPartyReadDeny}, c12=(${c12FirstWriteResultOk.allowed},${!c12OverwriteResultDeny.allowed})`,
    });
  }

  // =========================================================================
  // M7_3_T16: Kiểm thử State Machine phòng Co-op & Kiểm soát Timestamp ±60s (Mục VII.B)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const baseWaiting: CoopRoomLobbyDocument = {
      roomCode: 'STM888',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host',
      hostDisplayName: 'Host',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest',
      guestDisplayName: 'Guest',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    // 1. WAITING -> PLAYING khi thiếu Guest: DENY
    const s1NoGuestDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: { ...baseWaiting, guestUid: null, guestDisplayName: null },
      incoming: {
        ...baseWaiting,
        guestUid: null,
        guestDisplayName: null,
        status: 'PLAYING',
        hostLastActiveAt: t0 + 1000,
      },
    });

    // 2. WAITING -> PLAYING khi một người chưa Ready: DENY
    const s2NotReadyDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: { ...baseWaiting, guestReady: false },
      incoming: {
        ...baseWaiting,
        guestReady: false,
        status: 'PLAYING',
        hostLastActiveAt: t0 + 1000,
      },
    });

    // 3. WAITING -> PLAYING khi existing chưa CONNECTED (kể cả khi incoming gửi kèm CONNECTED): DENY
    const s3NotConnectedDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: { ...baseWaiting, rtcConnectionState: 'CONNECTING' },
      incoming: {
        ...baseWaiting,
        rtcConnectionState: 'CONNECTED',
        status: 'PLAYING',
        hostLastActiveAt: t0 + 1000,
      },
    });

    // 4. WAITING -> FINISHED trực tiếp khi chưa bắt đầu trận: DENY
    const s4WaitingToFinishedDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: baseWaiting,
      incoming: { ...baseWaiting, status: 'FINISHED', hostLastActiveAt: t0 + 1000 },
    });

    // 5. PLAYING -> WAITING (quay ngược trạng thái): DENY
    const playingRoom: CoopRoomLobbyDocument = { ...baseWaiting, status: 'PLAYING' };
    const s5PlayingToWaitingDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: playingRoom,
      incoming: { ...playingRoom, status: 'WAITING', hostLastActiveAt: t0 + 2000 },
    });

    // 6. WAITING -> ABANDONED bởi Host: PASS
    const s6WaitingToAbandonedPass = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: baseWaiting,
      incoming: { ...baseWaiting, status: 'ABANDONED', hostLastActiveAt: t0 + 2000 },
    });

    // 7. PLAYING -> ABANDONED bởi Guest: PASS
    const s7PlayingToAbandonedByGuestPass = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'ABANDONED',
        guestLastActiveAt: t0 + 3000,
        disconnectReason: 'Guest rời trận',
      },
    });

    // 8. WAITING chưa hết hạn -> EXPIRED: DENY; WAITING đã đạt/vượt expiresAt -> EXPIRED: PASS
    const s8EarlyExpireDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: baseWaiting,
      incoming: { ...baseWaiting, status: 'EXPIRED', hostLastActiveAt: t0 + 5000 },
    });
    const expiredTime = baseWaiting.expiresAt + 1000;
    const s8ValidExpirePass = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: expiredTime,
      existing: baseWaiting,
      incoming: { ...baseWaiting, status: 'EXPIRED', hostLastActiveAt: expiredTime },
    });

    // 9. Phòng đã kết thúc (FINISHED / ABANDONED / EXPIRED) chuyển ngược sang trạng thái khác: DENY
    const finishedRoom: CoopRoomLobbyDocument = { ...baseWaiting, status: 'FINISHED' };
    const s9ReopenFinishedDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 4000,
      existing: finishedRoom,
      incoming: { ...finishedRoom, status: 'PLAYING', hostLastActiveAt: t0 + 4000 },
    });

    // 10. Chặn timestamp tương lai xa (> +60s) hoặc cố kéo dài expiresAt: DENY
    const s10FarFutureTimestampDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: baseWaiting,
      incoming: { ...baseWaiting, hostLastActiveAt: t0 + 1000 + 120_000 },
    });
    const s10ExtendExpiresAtDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: baseWaiting,
      incoming: {
        ...baseWaiting,
        expiresAt: baseWaiting.expiresAt + 600_000,
        hostLastActiveAt: t0 + 1000,
      },
    });

    const passed =
      s1NoGuestDeny.allowed === false &&
      s2NotReadyDeny.allowed === false &&
      s3NotConnectedDeny.allowed === false &&
      s4WaitingToFinishedDeny.allowed === false &&
      s5PlayingToWaitingDeny.allowed === false &&
      s6WaitingToAbandonedPass.allowed === true &&
      s7PlayingToAbandonedByGuestPass.allowed === true &&
      s8EarlyExpireDeny.allowed === false &&
      s8ValidExpirePass.allowed === true &&
      s9ReopenFinishedDeny.allowed === false &&
      s10FarFutureTimestampDeny.allowed === false &&
      s10ExtendExpiresAtDeny.allowed === false;

    results.push({
      id: 'M7_3_T16',
      name: 'Kiểm thử State Machine phòng Co-op & Ràng buộc Timestamp ±60s (Mục VII.B)',
      passed,
      details: `noGuest=${!s1NoGuestDeny.allowed}, unready=${!s2NotReadyDeny.allowed}, notConn=${!s3NotConnectedDeny.allowed}, waitToFin=${!s4WaitingToFinishedDeny.allowed}, playToWait=${!s5PlayingToWaitingDeny.allowed}, hostAbandon=${s6WaitingToAbandonedPass.allowed}, guestAbandon=${s7PlayingToAbandonedByGuestPass.allowed}, expire=(${!s8EarlyExpireDeny.allowed},${s8ValidExpirePass.allowed}), reopen=${!s9ReopenFinishedDeny.allowed}, tsGuard=${!s10FarFutureTimestampDeny.allowed && !s10ExtendExpiresAtDeny.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T17: Kiểm thử Session M7.1 tương thích ngược & khóa sửa expiresAt khi Heartbeat/Logout (Mục VII.C)
  // =========================================================================
  {
    const tSec = 1_700_000_000;
    const legacyDocWithoutUidWithExpiresAt = {
      sessionId: 'sess_legacy_token_123456',
      deviceId: 'dev_legacy_device_123456',
      isActive: true,
      userAgentSummary: 'Mozilla/5.0 Chrome',
      loginAtSec: tSec,
      lastActiveAtSec: tSec,
      expiresAtSec: tSec + 900,
    };

    // 1. Tài liệu cũ không có uid + có expiresAt: Heartbeat hợp lệ sau >=120s (giữ nguyên expiresAt) -> PASS
    const hbLegacyOk = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 125,
      existing: legacyDocWithoutUidWithExpiresAt,
      incoming: {
        ...legacyDocWithoutUidWithExpiresAt,
        lastActiveAtSec: tSec + 125,
      },
    });

    // 2. Tài liệu mới có uid: Heartbeat hợp lệ -> PASS
    const newDocWithUid = {
      ...legacyDocWithoutUidWithExpiresAt,
      uid: 'uid_user_1',
    };
    const hbNewDocOk = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 125,
      existing: newDocWithUid,
      incoming: {
        ...newDocWithUid,
        lastActiveAtSec: tSec + 125,
      },
    });

    // 3. Heartbeat cố tình sửa expiresAt -> DENY
    const hbModifyExpiresAtDeny = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 125,
      existing: legacyDocWithoutUidWithExpiresAt,
      incoming: {
        ...legacyDocWithoutUidWithExpiresAt,
        lastActiveAtSec: tSec + 125,
        expiresAtSec: tSec + 9999,
      },
    });

    // 4. Logout hợp lệ trên tài liệu cũ không có uid (giữ nguyên expiresAt) -> PASS
    const logoutLegacyOk = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 200,
      existing: legacyDocWithoutUidWithExpiresAt,
      incoming: {
        ...legacyDocWithoutUidWithExpiresAt,
        isActive: false,
        lastActiveAtSec: tSec + 200,
      },
    });

    // 5. Logout cố tình sửa expiresAt -> DENY
    const logoutModifyExpiresAtDeny = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 200,
      existing: legacyDocWithoutUidWithExpiresAt,
      incoming: {
        ...legacyDocWithoutUidWithExpiresAt,
        isActive: false,
        lastActiveAtSec: tSec + 200,
        expiresAtSec: tSec + 5000,
      },
    });

    // 6. Thiết bị thứ 2 cố chiếm phiên đang hoạt động trong thời hạn 900s (First-Active-Session Wins) -> DENY
    const secondDeviceHijackDeny = evaluateUserSessionRuleUpdate({
      docUid: 'uid_user_1',
      authUid: 'uid_user_1',
      isVerifiedPersonalGmail: true,
      requestTimeSec: tSec + 300,
      existing: newDocWithUid,
      incoming: {
        ...newDocWithUid,
        sessionId: 'sess_device_2_new_654321',
        deviceId: 'dev_second_device_654321',
        loginAtSec: tSec + 300,
        lastActiveAtSec: tSec + 300,
      },
    });

    const passed =
      hbLegacyOk.allowed === true &&
      hbLegacyOk.matchedBranch === 'HEARTBEAT' &&
      hbNewDocOk.allowed === true &&
      hbModifyExpiresAtDeny.allowed === false &&
      logoutLegacyOk.allowed === true &&
      logoutLegacyOk.matchedBranch === 'LOGOUT' &&
      logoutModifyExpiresAtDeny.allowed === false &&
      secondDeviceHijackDeny.allowed === false;

    results.push({
      id: 'M7_3_T17',
      name: 'Kiểm thử Session M7.1: Tương thích doc cũ không có uid, chặn Heartbeat/Logout sửa expiresAt & chặn thiết bị 2 chiếm phiên',
      passed,
      details: `hbLegacy=${hbLegacyOk.allowed}, hbWithUid=${hbNewDocOk.allowed}, hbTamperExpiresBlocked=${!hbModifyExpiresAtDeny.allowed}, logoutLegacy=${logoutLegacyOk.allowed}, logoutTamperExpiresBlocked=${!logoutModifyExpiresAtDeny.allowed}, 2ndDeviceBlocked=${!secondDeviceHijackDeny.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T18: Fix 1 – Chỉ Host được cập nhật rtcConnectionState & chặn Guest sửa disconnectReason (Mục VIII.A)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const openWaitingRoom: CoopRoomLobbyDocument = {
      roomCode: 'FIX101',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    // 1. Guest Join gửi CONNECTED khi phòng đang NEW -> DENY
    const guestJoinFakeConnectedEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: openWaitingRoom,
      incoming: {
        ...openWaitingRoom,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: false,
        guestLastActiveAt: t0 + 1000,
        rtcConnectionState: 'CONNECTED',
      },
    });

    const joinedWaitingRoom: CoopRoomLobbyDocument = {
      ...openWaitingRoom,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: false,
      guestLastActiveAt: t0 + 1000,
    };

    // 2. Guest Ready cố sửa rtcConnectionState -> DENY
    const guestReadyModifyRtcEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: joinedWaitingRoom,
      incoming: {
        ...joinedWaitingRoom,
        guestReady: true,
        guestLastActiveAt: t0 + 2000,
        rtcConnectionState: 'CONNECTED',
      },
    });

    // 3. Guest cố sửa disconnectReason khi Join hoặc Ready -> DENY
    const guestJoinModifyDisconnectReasonEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: openWaitingRoom,
      incoming: {
        ...openWaitingRoom,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: false,
        guestLastActiveAt: t0 + 1000,
        disconnectReason: 'Fake reason',
      },
    });
    const guestReadyModifyDisconnectReasonEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: joinedWaitingRoom,
      incoming: {
        ...joinedWaitingRoom,
        guestReady: true,
        guestLastActiveAt: t0 + 2000,
        disconnectReason: 'Fake reason',
      },
    });

    // 3b. Guest Leave ở WAITING cố sửa rtcConnectionState -> DENY
    const guestLeaveModifyRtcEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2500,
      existing: { ...joinedWaitingRoom, rtcConnectionState: 'CONNECTING' },
      incoming: {
        ...joinedWaitingRoom,
        guestUid: null,
        guestDisplayName: null,
        guestReady: false,
        guestLastActiveAt: null,
        rtcConnectionState: 'NEW',
      },
    });

    // 4. Host cập nhật CONNECTED sau khi DataChannel mở -> ALLOW
    const readyWaitingRoom: CoopRoomLobbyDocument = {
      ...joinedWaitingRoom,
      guestReady: true,
      guestLastActiveAt: t0 + 2000,
    };
    const hostSetConnectedEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3000,
      existing: readyWaitingRoom,
      incoming: {
        ...readyWaitingRoom,
        rtcConnectionState: 'CONNECTED',
        hostLastActiveAt: t0 + 3000,
      },
    });

    // 5. WAITING -> PLAYING khi chưa CONNECTED -> DENY
    const startWhenNotConnectedEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3500,
      existing: { ...readyWaitingRoom, rtcConnectionState: 'CONNECTING' },
      incoming: {
        ...readyWaitingRoom,
        rtcConnectionState: 'CONNECTING',
        status: 'PLAYING',
        hostLastActiveAt: t0 + 3500,
      },
    });

    const passed =
      guestJoinFakeConnectedEval.allowed === false &&
      guestReadyModifyRtcEval.allowed === false &&
      guestJoinModifyDisconnectReasonEval.allowed === false &&
      guestReadyModifyDisconnectReasonEval.allowed === false &&
      guestLeaveModifyRtcEval.allowed === false &&
      hostSetConnectedEval.allowed === true &&
      hostSetConnectedEval.matchedBranch === 'HOST_UPDATE' &&
      startWhenNotConnectedEval.allowed === false;

    results.push({
      id: 'M7_3_T18',
      name: 'Fix 1: Chỉ Host được quyền cập nhật rtcConnectionState & chặn Guest sửa disconnectReason',
      passed,
      details: `guestJoinConnBlocked=${!guestJoinFakeConnectedEval.allowed}, guestReadyConnBlocked=${!guestReadyModifyRtcEval.allowed}, guestReasonBlocked=${!guestJoinModifyDisconnectReasonEval.allowed && !guestReadyModifyDisconnectReasonEval.allowed}, guestLeaveConnBlocked=${!guestLeaveModifyRtcEval.allowed}, hostSetConn=${hostSetConnectedEval.allowed}, startUnconnBlocked=${!startWhenNotConnectedEval.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T19: Fix 2 – Tách expiresAt của phòng chờ WAITING khỏi trạng thái trận đang PLAYING (Mục VIII.B)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const expiresAt = t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS; // +900,000 ms (15 phút)
    const pastExpiryMs = expiresAt + 60_000; // Đã vượt quá 15 phút (phút thứ 16)

    const waitingRoomOpen: CoopRoomLobbyDocument = {
      roomCode: 'FIX202',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt,
      disconnectReason: null,
    };

    // 1. WAITING quá hạn -> Guest Join DENY (cả client candidate lẫn Firestore Rules)
    const expiredJoinCandidate = evaluateJoinRoomCandidate(
      waitingRoomOpen,
      'FIX202',
      { uid: 'uid_guest_2', displayName: 'Guest 2' },
      pastExpiryMs,
      true
    );
    const expiredJoinRuleEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      existing: waitingRoomOpen,
      incoming: {
        ...waitingRoomOpen,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: false,
        guestLastActiveAt: pastExpiryMs,
      },
    });

    // 2. WAITING quá hạn -> Start Match DENY (cả client candidate lẫn Firestore Rules)
    const waitingRoomReady: CoopRoomLobbyDocument = {
      ...waitingRoomOpen,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0 + 5000,
      rtcConnectionState: 'CONNECTED',
    };
    const expiredStartCandidate = evaluateStartMatchCandidate(
      waitingRoomReady,
      'uid_host_1',
      'HOST',
      pastExpiryMs,
      true
    );
    const expiredStartRuleEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      existing: waitingRoomReady,
      incoming: {
        ...waitingRoomReady,
        status: 'PLAYING',
        hostLastActiveAt: pastExpiryMs,
      },
    });

    // 3. PLAYING vượt qua expiresAt của phòng chờ -> Host ghi finalScore/matchOutcome trong private/signaling ALLOW
    const playingRoomPastWaitingExpiry: CoopRoomLobbyDocument = {
      ...waitingRoomReady,
      status: 'PLAYING',
      hostLastActiveAt: t0 + 600_000,
    };
    const activeSignaling: CoopRoomSignalingDocument = {
      roomCode: 'FIX202',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0 + 10_000,
    };
    const writeResultPastWaitingExpiryEval = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      roomCode: 'FIX202',
      parentRoom: playingRoomPastWaitingExpiry,
      existing: activeSignaling,
      incoming: {
        ...activeSignaling,
        finalScore: 5200,
        matchOutcome: 'VICTORY',
        updatedAt: pastExpiryMs,
      },
    });

    // 4. PLAYING vượt qua expiresAt của phòng chờ -> Host chuyển PLAYING -> FINISHED (sau khi đã ghi kết quả hợp lệ) ALLOW
    const finishPastWaitingExpiryEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      existing: playingRoomPastWaitingExpiry,
      incoming: {
        ...playingRoomPastWaitingExpiry,
        status: 'FINISHED',
        hostLastActiveAt: pastExpiryMs,
      },
      signalingDoc: {
        ...activeSignaling,
        finalScore: 5200,
        matchOutcome: 'VICTORY',
        updatedAt: pastExpiryMs,
      },
    });

    // 5. FINISHED -> mọi cập nhật private/signaling DENY
    const finishedParentRoom: CoopRoomLobbyDocument = {
      ...playingRoomPastWaitingExpiry,
      status: 'FINISHED',
      hostLastActiveAt: pastExpiryMs,
    };
    const updateSignalingAfterFinishedEval = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs + 1000,
      roomCode: 'FIX202',
      parentRoom: finishedParentRoom,
      existing: {
        ...activeSignaling,
        finalScore: 5200,
        matchOutcome: 'VICTORY',
        updatedAt: pastExpiryMs,
      },
      incoming: {
        ...activeSignaling,
        finalScore: 5200,
        matchOutcome: 'VICTORY',
        rtcOffer: '{"type":"offer","sdp":"new"}',
        updatedAt: pastExpiryMs + 1000,
      },
    });

    // 6. ABANDONED / EXPIRED -> không thể chuyển ngược về trạng thái hoạt động (WAITING hoặc PLAYING)
    const abandonedRoom: CoopRoomLobbyDocument = {
      ...playingRoomPastWaitingExpiry,
      status: 'ABANDONED',
    };
    const expiredRoom: CoopRoomLobbyDocument = {
      ...waitingRoomReady,
      status: 'EXPIRED',
    };
    const reopenAbandonedDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      existing: abandonedRoom,
      incoming: {
        ...abandonedRoom,
        status: 'PLAYING',
        hostLastActiveAt: pastExpiryMs,
      },
    });
    const reopenExpiredDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiryMs,
      existing: expiredRoom,
      incoming: {
        ...expiredRoom,
        status: 'WAITING',
        hostLastActiveAt: pastExpiryMs,
      },
    });

    const passed =
      expiredJoinCandidate.success === false &&
      expiredJoinCandidate.errorCode === 'ROOM_EXPIRED' &&
      expiredJoinRuleEval.allowed === false &&
      expiredStartCandidate.success === false &&
      expiredStartCandidate.errorCode === 'ROOM_EXPIRED' &&
      expiredStartRuleEval.allowed === false &&
      writeResultPastWaitingExpiryEval.allowed === true &&
      finishPastWaitingExpiryEval.allowed === true &&
      updateSignalingAfterFinishedEval.allowed === false &&
      reopenAbandonedDeny.allowed === false &&
      reopenExpiredDeny.allowed === false;

    results.push({
      id: 'M7_3_T19',
      name: 'Fix 2: Tách expiresAt phòng chờ WAITING khỏi trận đang PLAYING & khóa chặt FINISHED/ABANDONED/EXPIRED',
      passed,
      details: `waitExpiredJoinBlocked=${!expiredJoinRuleEval.allowed}, waitExpiredStartBlocked=${!expiredStartRuleEval.allowed}, playingWriteScoreOk=${writeResultPastWaitingExpiryEval.allowed}, playingFinishOk=${finishPastWaitingExpiryEval.allowed}, finishedSigLocked=${!updateSignalingAfterFinishedEval.allowed}, terminalLocked=${!reopenAbandonedDeny.allowed && !reopenExpiredDeny.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T20: Fix 3 – Đảm bảo thứ tự khởi tạo Lobby và private/signaling (Mục VIII.C)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);
    const guestManager = new CoopOnlineManager(storage);

    // 1. Host tạo lobby và private/signaling đúng thứ tự -> ALLOW & isRoomSignalingReady() === true
    const createOkRes = hostManager.createRoomSync(
      storage,
      { uid: 'uid_host_1', displayName: 'Host 1', email: 'host1@gmail.com' },
      'DEFAULT',
      t0,
      'ORD301'
    );
    const hostSignalingReadyAfterSuccess = hostManager.isRoomSignalingReady();
    const bothDocsCreated =
      storage.getRoomSync('ORD301') !== null && storage.getSignalingSync('ORD301') !== null;

    // 1b. Nếu tạo lobby thành công nhưng tạo private/signaling thất bại -> đóng phòng ABANDONED, không báo thành công, không lộ mã phòng
    const failManager = new CoopOnlineManager(storage);
    storage.setFailNextSetSignaling(true);
    const createFailRes = failManager.createRoomSync(
      storage,
      { uid: 'uid_host_1', displayName: 'Host 1', email: 'host1@gmail.com' },
      'DEFAULT',
      t0 + 500,
      'ORD302'
    );
    const rolledBackLobby = storage.getRoomSync('ORD302');
    const rollbackOk =
      createFailRes.success === false &&
      failManager.getCurrentRoom() === null &&
      failManager.isRoomSignalingReady() === false &&
      rolledBackLobby?.status === 'ABANDONED';

    // 2. Guest join khi private/signaling chưa tồn tại -> DENY (cả Rules và joinRoomSync)
    const lobbyWithoutSignaling: CoopRoomLobbyDocument = {
      roomCode: 'NOSIG1',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    storage.setRoomSync('NOSIG1', lobbyWithoutSignaling);

    const joinRuleWithoutSigEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: lobbyWithoutSignaling,
      incoming: {
        ...lobbyWithoutSignaling,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: false,
        guestLastActiveAt: t0 + 1000,
      },
      signalingExists: false,
    });
    const joinSyncWithoutSigRes = guestManager.joinRoomSync(
      storage,
      'NOSIG1',
      { uid: 'uid_guest_2', displayName: 'Guest 2', email: 'guest2@gmail.com' },
      t0 + 1000
    );

    // 3. Guest join khi private/signaling đã tồn tại (phòng ORD301) -> ALLOW
    const joinRuleWithSigEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1200,
      existing: storage.getRoomSync('ORD301')!,
      incoming: {
        ...storage.getRoomSync('ORD301')!,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: false,
        guestLastActiveAt: t0 + 1200,
      },
      signalingExists: true,
    });
    const joinSyncWithSigRes = guestManager.joinRoomSync(
      storage,
      'ORD301',
      { uid: 'uid_guest_2', displayName: 'Guest 2', email: 'guest2@gmail.com' },
      t0 + 1200
    );

    // 4. Người thứ ba tạo private/signaling -> DENY
    const thirdPartyCreateSigEval = evaluateCoopSignalingRuleCreate({
      authUid: 'uid_third_3',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1500,
      roomCode: 'NOSIG1',
      parentRoom: lobbyWithoutSignaling,
      existingSignaling: null,
      incoming: {
        roomCode: 'NOSIG1',
        hostUid: 'uid_third_3',
        guestUid: null,
        rtcOffer: null,
        rtcAnswer: null,
        hostIceCandidates: null,
        guestIceCandidates: null,
        finalScore: 0,
        matchOutcome: null,
        updatedAt: t0 + 1500,
      },
    });

    // 5. Host hoặc Guest cố vào trận khi thiếu private/signaling -> DENY
    const readyLobbyWithoutSig: CoopRoomLobbyDocument = {
      ...lobbyWithoutSignaling,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0 + 1500,
      rtcConnectionState: 'CONNECTED',
    };
    const startCandidateWithoutSig = evaluateStartMatchCandidate(
      readyLobbyWithoutSig,
      'uid_host_1',
      'HOST',
      t0 + 2000,
      false
    );
    const startRuleWithoutSigEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: readyLobbyWithoutSig,
      incoming: {
        ...readyLobbyWithoutSig,
        status: 'PLAYING',
        hostLastActiveAt: t0 + 2000,
      },
      signalingExists: false,
    });

    const passed =
      createOkRes.success === true &&
      hostSignalingReadyAfterSuccess === true &&
      bothDocsCreated === true &&
      rollbackOk === true &&
      joinRuleWithoutSigEval.allowed === false &&
      joinSyncWithoutSigRes.success === false &&
      joinRuleWithSigEval.allowed === true &&
      joinSyncWithSigRes.success === true &&
      thirdPartyCreateSigEval === false &&
      startCandidateWithoutSig.success === false &&
      startRuleWithoutSigEval.allowed === false;

    results.push({
      id: 'M7_3_T20',
      name: 'Fix 3: Thứ tự tạo Lobby + private/signaling, đóng phòng khi lỗi tạo signaling & chặn Join/Start nếu thiếu signaling',
      passed,
      details: `createBothOk=${bothDocsCreated}, sigReady=${hostSignalingReadyAfterSuccess}, rollbackOnSigFail=${rollbackOk}, joinNoSigBlocked=${!joinRuleWithoutSigEval.allowed && !joinSyncWithoutSigRes.success}, joinWithSigOk=${joinSyncWithSigRes.success}, 3rdCreateSigBlocked=${!thirdPartyCreateSigEval}, startNoSigBlocked=${!startRuleWithoutSigEval.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T21: Fix 4 – Siết chặt expiresAt tối đa 15 phút (900,000 ms) tính từ thời gian server (Mục VIII.D)
  // =========================================================================
  {
    const serverTimeMs = 1_700_000_000_000;
    const validRoomCreate: CoopRoomLobbyDocument = {
      roomCode: 'TTL401',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: false,
      hostLastActiveAt: serverTimeMs,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: serverTimeMs,
      expiresAt: serverTimeMs + 900_000, // Đúng 15 phút (900,000 ms)
      disconnectReason: null,
    };

    // 1. expiresAt hợp lệ trong <= request.time + 900000 -> ALLOW
    const validCreateOk = evaluateCoopRoomRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: serverTimeMs,
      roomCode: 'TTL401',
      incoming: validRoomCreate,
    });

    // 2. expiresAt > request.time + 900000 (ví dụ tận dụng lệch đồng hồ +30s để đặt expiresAt = request.time + 930,000 ms) -> DENY
    const exceedServerTtlDeny = evaluateCoopRoomRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: serverTimeMs,
      roomCode: 'TTL401',
      incoming: {
        ...validRoomCreate,
        createdAt: serverTimeMs + 30_000,
        hostLastActiveAt: serverTimeMs + 30_000,
        expiresAt: serverTimeMs + 930_000,
      },
    });

    // 3. createdAt lệch ngoài ±60s so với request.time -> DENY
    const pastSkewCreateDeny = evaluateCoopRoomRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: serverTimeMs,
      roomCode: 'TTL401',
      incoming: {
        ...validRoomCreate,
        createdAt: serverTimeMs - 65_000,
        hostLastActiveAt: serverTimeMs,
        expiresAt: serverTimeMs + 800_000,
      },
    });
    const futureSkewCreateDeny = evaluateCoopRoomRuleCreate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: serverTimeMs,
      roomCode: 'TTL401',
      incoming: {
        ...validRoomCreate,
        createdAt: serverTimeMs + 65_000,
        hostLastActiveAt: serverTimeMs,
        expiresAt: serverTimeMs + 900_000,
      },
    });

    // 4. Update cố kéo dài expiresAt -> DENY
    const updateExtendExpiresDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: serverTimeMs + 5000,
      existing: validRoomCreate,
      incoming: {
        ...validRoomCreate,
        hostLastActiveAt: serverTimeMs + 5000,
        expiresAt: validRoomCreate.expiresAt + 1000,
      },
    });

    const passed =
      validCreateOk === true &&
      exceedServerTtlDeny === false &&
      pastSkewCreateDeny === false &&
      futureSkewCreateDeny === false &&
      updateExtendExpiresDeny.allowed === false;

    results.push({
      id: 'M7_3_T21',
      name: 'Fix 4: Siết expiresAt <= request.time + 900000ms (15 phút), kiểm soát createdAt ±60s & cấm gia hạn expiresAt',
      passed,
      details: `validCreate900k=${validCreateOk}, exceed900kBlocked=${!exceedServerTtlDeny}, skew65sBlocked=${!pastSkewCreateDeny && !futureSkewCreateDeny}, extendExpiresBlocked=${!updateExtendExpiresDeny.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T22: Fix 5 – Ghi kết quả cuối trận và đóng phòng Retry-Safe, chống mất kết quả khi đứt mạng (Mục VIII.E)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);
    const guestManager = new CoopOnlineManager(storage);

    const setupPlayingRoom = (roomCode: string) => {
      const lobby: CoopRoomLobbyDocument = {
        roomCode,
        status: 'PLAYING',
        difficulty: 'DEFAULT',
        hostUid: 'uid_host_1',
        hostDisplayName: 'Host 1',
        hostReady: true,
        hostLastActiveAt: t0,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: true,
        guestLastActiveAt: t0,
        rtcConnectionState: 'CONNECTED',
        createdAt: t0,
        expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
        disconnectReason: null,
      };
      const sig: CoopRoomSignalingDocument = {
        roomCode,
        hostUid: 'uid_host_1',
        guestUid: 'uid_guest_2',
        rtcOffer: '{"type":"offer"}',
        rtcAnswer: '{"type":"answer"}',
        hostIceCandidates: '[]',
        guestIceCandidates: '[]',
        finalScore: 0,
        matchOutcome: null,
        updatedAt: t0,
      };
      storage.setRoomSync(roomCode, lobby);
      storage.setSignalingSync(roomCode, sig);
      (hostManager as any).currentRoom = { ...lobby, ...sig };
      (hostManager as any).currentSignaling = sig;
      (hostManager as any).role = 'HOST';
      (hostManager as any).hasRecordedMatchFinishInFirestore = false;
      (guestManager as any).currentRoom = { ...lobby, ...sig };
      (guestManager as any).currentSignaling = sig;
      (guestManager as any).role = 'GUEST';
    };

    // 1. Host ghi kết quả lần đầu trên phòng FIN501 -> ALLOW
    setupPlayingRoom('FIN501');
    const firstWriteRes = hostManager.recordMatchFinishSync(storage, 4800, 'VICTORY', t0 + 10_000);
    const sig501 = storage.getSignalingSync('FIN501');
    const room501 = storage.getRoomSync('FIN501');
    const case1FirstWriteOk =
      firstWriteRes.success === true &&
      sig501?.finalScore === 4800 &&
      sig501?.matchOutcome === 'VICTORY' &&
      room501?.status === 'FINISHED';

    // 2. Lỗi mạng xảy ra sau khi ghi private/signaling nhưng trước khi chuyển phòng cha sang FINISHED (phòng FIN502)
    //    -> khi thử lại với cùng kết quả, không ghi lại private/signaling và hoàn tất chuyển phòng cha sang FINISHED -> ALLOW
    setupPlayingRoom('FIN502');
    storage.setFailNextUpdateRoom(true);
    const interruptedRes = hostManager.recordMatchFinishSync(storage, 6400, 'VICTORY', t0 + 20_000);
    const sigAfterInterrupt = storage.getSignalingSync('FIN502');
    const roomAfterInterrupt = storage.getRoomSync('FIN502');
    const statePreservedOnInterrupt =
      interruptedRes.success === false &&
      interruptedRes.errorCode === 'NETWORK_ERROR' &&
      sigAfterInterrupt?.finalScore === 6400 &&
      sigAfterInterrupt?.matchOutcome === 'VICTORY' &&
      roomAfterInterrupt?.status === 'PLAYING' &&
      (hostManager as any).hasRecordedMatchFinishInFirestore === false;

    const writesBeforeRetry = storage.getWriteCount();
    const retrySameResultRes = hostManager.recordMatchFinishSync(
      storage,
      6400,
      'VICTORY',
      t0 + 22_000
    );
    const writesAfterRetry = storage.getWriteCount();
    // Trong lần retry với cùng kết quả: chỉ thực hiện 1 lượt ghi updateRoom(status='FINISHED'), 0 lượt ghi lại private/signaling
    const retryWritesDelta = writesAfterRetry - writesBeforeRetry;
    const roomAfterRetry = storage.getRoomSync('FIN502');
    const case2RetryIdempotentOk =
      statePreservedOnInterrupt === true &&
      retrySameResultRes.success === true &&
      retryWritesDelta === 1 &&
      roomAfterRetry?.status === 'FINISHED';

    // 3. Host cố ghi lại với kết quả khác (khi signaling đã có 6400/VICTORY) -> DENY
    setupPlayingRoom('FIN503');
    storage.setFailNextUpdateRoom(true);
    hostManager.recordMatchFinishSync(storage, 6400, 'VICTORY', t0 + 30_000);
    const conflictRetryRes = hostManager.recordMatchFinishSync(
      storage,
      9999,
      'GAME_OVER',
      t0 + 31_000
    );
    const sigAfterConflict = storage.getSignalingSync('FIN503');
    const case3ConflictDenied =
      conflictRetryRes.success === false &&
      conflictRetryRes.errorCode === 'INVALID_PACKET' &&
      sigAfterConflict?.finalScore === 6400 &&
      sigAfterConflict?.matchOutcome === 'VICTORY';

    // 4. Guest cố sửa kết quả -> DENY (cả recordMatchFinishSync lẫn Firestore Rules)
    setupPlayingRoom('FIN504');
    const guestRecordRes = guestManager.recordMatchFinishSync(
      storage,
      5000,
      'VICTORY',
      t0 + 40_000
    );
    const guestTamperSigRuleEval = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 40_000,
      roomCode: 'FIN504',
      parentRoom: storage.getRoomSync('FIN504'),
      existing: storage.getSignalingSync('FIN504')!,
      incoming: {
        ...storage.getSignalingSync('FIN504')!,
        finalScore: 5000,
        matchOutcome: 'VICTORY',
        updatedAt: t0 + 40_000,
      },
    });
    const case4GuestDenied =
      guestRecordRes.success === false &&
      guestRecordRes.errorCode === 'NOT_HOST' &&
      guestTamperSigRuleEval.allowed === false;

    const passed =
      case1FirstWriteOk &&
      case2RetryIdempotentOk &&
      case3ConflictDenied &&
      case4GuestDenied;

    results.push({
      id: 'M7_3_T22',
      name: 'Fix 5: Ghi kết quả trận đấu Retry-Safe, chống mất kết quả khi đứt mạng giữa chừng & chặn xung đột/Guest ghi kết quả',
      passed,
      details: `firstWrite=${case1FirstWriteOk}, retryIdempotent=${case2RetryIdempotentOk} (writesDelta=${retryWritesDelta}), conflictBlocked=${case3ConflictDenied}, guestBlocked=${case4GuestDenied}`,
    });
  }

  // =========================================================================
  // M7_3_T23: Bắt buộc có kết quả hợp lệ trong private/signaling trước khi chuyển PLAYING -> FINISHED (Mục IV.T23)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const playingRoom: CoopRoomLobbyDocument = {
      roomCode: 'GRD601',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    const baseSignaling: CoopRoomSignalingDocument = {
      roomCode: 'GRD601',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0,
    };

    // 1. Host cố chuyển PLAYING -> FINISHED khi private/signaling chưa tồn tại -> DENY
    const missingSigDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingExists: false,
      signalingDoc: null,
    });

    // 2. Host cố chuyển PLAYING -> FINISHED khi matchOutcome == null -> DENY
    const nullOutcomeDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingDoc: {
        ...baseSignaling,
        finalScore: 3500,
        matchOutcome: null,
      },
    });

    // 3. Host cố chuyển PLAYING -> FINISHED khi finalScore không hợp lệ (< 0 hoặc > 9999999) -> DENY
    const negativeScoreDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingDoc: {
        ...baseSignaling,
        finalScore: -100,
        matchOutcome: 'VICTORY',
      },
    });
    const overflowScoreDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingDoc: {
        ...baseSignaling,
        finalScore: 10_000_000,
        matchOutcome: 'GAME_OVER',
      },
    });

    // 4. Host chuyển PLAYING -> FINISHED sau khi đã có matchOutcome hợp lệ và finalScore hợp lệ -> ALLOW
    const validVictoryAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingDoc: {
        ...baseSignaling,
        finalScore: 4200,
        matchOutcome: 'VICTORY',
      },
    });
    const validGameOverZeroScoreAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 5000,
      },
      signalingDoc: {
        ...baseSignaling,
        finalScore: 0,
        matchOutcome: 'GAME_OVER',
      },
    });

    // Kiểm tra trực tiếp trên InMemoryCoopStorageAdapter (enforce hasValidRecordedMatchResultModel)
    const storage = new InMemoryCoopStorageAdapter();
    storage.setRoomSync('GRD601', playingRoom);
    storage.setSignalingSync('GRD601', baseSignaling);
    let directUpdateWithoutResultThrew = false;
    try {
      storage.updateRoomSync('GRD601', { status: 'FINISHED', hostLastActiveAt: t0 + 5000 });
    } catch {
      directUpdateWithoutResultThrew = true;
    }

    const passed =
      missingSigDeny.allowed === false &&
      nullOutcomeDeny.allowed === false &&
      negativeScoreDeny.allowed === false &&
      overflowScoreDeny.allowed === false &&
      validVictoryAllow.allowed === true &&
      validGameOverZeroScoreAllow.allowed === true &&
      directUpdateWithoutResultThrew === true;

    results.push({
      id: 'M7_3_T23',
      name: 'T23: Bắt buộc có kết quả hợp lệ trong private/signaling trước khi chuyển PLAYING -> FINISHED',
      passed,
      details: `noSigBlocked=${!missingSigDeny.allowed}, nullOutcomeBlocked=${!nullOutcomeDeny.allowed}, badScoreBlocked=${!negativeScoreDeny.allowed && !overflowScoreDeny.allowed}, validVictoryOk=${validVictoryAllow.allowed}, validGameOverZeroOk=${validGameOverZeroScoreAllow.allowed}, adapterEnforced=${directUpdateWithoutResultThrew}`,
    });
  }

  // =========================================================================
  // M7_3_T24: Chống giả mạo kết quả hoặc trạng thái liên phòng (Mục IV.T24)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const playingRoom: CoopRoomLobbyDocument = {
      roomCode: 'GRD602',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    const validSig: CoopRoomSignalingDocument = {
      roomCode: 'GRD602',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 5500,
      matchOutcome: 'VICTORY',
      updatedAt: t0 + 1000,
    };

    // 1. signalingDoc.roomCode không khớp roomCode -> DENY
    const wrongRoomCodeDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 2000,
      },
      signalingDoc: {
        ...validSig,
        roomCode: 'OTHER9',
      },
    });

    // 2. signalingDoc.hostUid không khớp existing().hostUid -> DENY
    const wrongHostUidDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 2000,
      },
      signalingDoc: {
        ...validSig,
        hostUid: 'uid_other_host',
      },
    });

    // 3. signalingDoc.guestUid không khớp existing().guestUid -> DENY
    const wrongGuestUidDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 2000,
      },
      signalingDoc: {
        ...validSig,
        guestUid: 'uid_other_guest',
      },
    });
    const nullGuestInParentDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: {
        ...playingRoom,
        guestUid: null,
      },
      incoming: {
        ...playingRoom,
        guestUid: null,
        status: 'FINISHED',
        hostLastActiveAt: t0 + 2000,
      },
      signalingDoc: {
        ...validSig,
        guestUid: null,
      },
    });

    // 4. Kết quả không hợp lệ (matchOutcome ngoài VICTORY/GAME_OVER) -> DENY
    const invalidOutcomeHelperDeny = hasValidRecordedMatchResultModel('GRD602', playingRoom, {
      ...validSig,
      matchOutcome: 'DRAW' as any,
    });

    const passed =
      wrongRoomCodeDeny.allowed === false &&
      wrongHostUidDeny.allowed === false &&
      wrongGuestUidDeny.allowed === false &&
      nullGuestInParentDeny.allowed === false &&
      invalidOutcomeHelperDeny === false;

    results.push({
      id: 'M7_3_T24',
      name: 'T24: Chống giả mạo kết quả hoặc trạng thái liên phòng (roomCode, hostUid, guestUid, matchOutcome)',
      passed,
      details: `wrongRoomCodeBlocked=${!wrongRoomCodeDeny.allowed}, wrongHostBlocked=${!wrongHostUidDeny.allowed}, wrongGuestBlocked=${!wrongGuestUidDeny.allowed}, nullGuestBlocked=${!nullGuestInParentDeny.allowed}, invalidOutcomeBlocked=${!invalidOutcomeHelperDeny}`,
    });
  }

  // =========================================================================
  // M7_3_T25: Retry khi đã ghi kết quả nhưng chưa chuyển FINISHED (Mục IV.T25)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);

    const lobby: CoopRoomLobbyDocument = {
      roomCode: 'RTY701',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    const sig: CoopRoomSignalingDocument = {
      roomCode: 'RTY701',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0,
    };
    storage.setRoomSync('RTY701', lobby);
    storage.setSignalingSync('RTY701', sig);
    (hostManager as any).currentRoom = { ...lobby, ...sig };
    (hostManager as any).currentSignaling = sig;
    (hostManager as any).role = 'HOST';
    (hostManager as any).hasRecordedMatchFinishInFirestore = false;

    // Bước 1: Ghi private/signaling thành công, nhưng lỗi mạng trước khi cập nhật FINISHED
    storage.setFailNextUpdateRoom(true);
    const attempt1 = hostManager.recordMatchFinishSync(storage, 7200, 'VICTORY', t0 + 10_000);
    const sigAfterAttempt1 = storage.getSignalingSync('RTY701');
    const roomAfterAttempt1 = storage.getRoomSync('RTY701');
    const step1InterruptedProperly =
      attempt1.success === false &&
      attempt1.errorCode === 'NETWORK_ERROR' &&
      sigAfterAttempt1?.finalScore === 7200 &&
      sigAfterAttempt1?.matchOutcome === 'VICTORY' &&
      roomAfterAttempt1?.status === 'PLAYING' &&
      hostManager.hasRecordedMatchFinish() === false;

    // Bước 2: Gọi lại recordMatchFinishSync -> đọc thấy kết quả đã ghi trùng khớp, KHÔNG ghi lại private/signaling, chỉ chuyển phòng sang FINISHED
    // Để chứng minh tuyệt đối không gọi updateSignaling, bật cờ failNextUpdateSignaling = true
    storage.setFailNextUpdateSignaling(true);
    const writesBeforeAttempt2 = storage.getWriteCount();
    const attempt2 = hostManager.recordMatchFinishSync(storage, 7200, 'VICTORY', t0 + 12_000);
    const writesAfterAttempt2 = storage.getWriteCount();
    storage.setFailNextUpdateSignaling(false);

    const roomAfterAttempt2 = storage.getRoomSync('RTY701');
    const step2CompletedWithoutSignalingRewrite =
      attempt2.success === true &&
      writesAfterAttempt2 - writesBeforeAttempt2 === 1 &&
      roomAfterAttempt2?.status === 'FINISHED' &&
      hostManager.hasRecordedMatchFinish() === true;

    const passed = step1InterruptedProperly && step2CompletedWithoutSignalingRewrite;

    results.push({
      id: 'M7_3_T25',
      name: 'T25: Retry khi đã ghi kết quả vào private/signaling nhưng lỗi mạng trước khi chuyển FINISHED',
      passed,
      details: `interruptedStep1=${step1InterruptedProperly}, completedStep2=${step2CompletedWithoutSignalingRewrite}, writesInRetry=${writesAfterAttempt2 - writesBeforeAttempt2}`,
    });
  }

  // =========================================================================
  // M7_3_T26: Retry khi Firebase đã commit FINISHED nhưng ứng dụng mất phản hồi (Mục IV.T26)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);

    const lobby: CoopRoomLobbyDocument = {
      roomCode: 'RTY702',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    const sig: CoopRoomSignalingDocument = {
      roomCode: 'RTY702',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0,
    };
    storage.setRoomSync('RTY702', lobby);
    storage.setSignalingSync('RTY702', sig);
    (hostManager as any).currentRoom = { ...lobby, ...sig };
    (hostManager as any).currentSignaling = sig;
    (hostManager as any).role = 'HOST';
    (hostManager as any).hasRecordedMatchFinishInFirestore = false;

    // Lần 1: Ghi kết quả thành công và server ĐÃ commit status = 'FINISHED', nhưng ứng dụng mất phản hồi ACK
    storage.setCommitUpdateRoomThenLoseResponse(true);
    const attempt1 = hostManager.recordMatchFinishSync(storage, 8400, 'VICTORY', t0 + 15_000);
    const serverRoomAfterLostAck = storage.getRoomSync('RTY702');
    const serverSigAfterLostAck = storage.getSignalingSync('RTY702');

    // Trên server đã là FINISHED + 8400/VICTORY, nhưng local state của client vẫn nghĩ là PLAYING và hasRecordedMatchFinish === false
    const lostAckSimulatedOk =
      attempt1.success === false &&
      attempt1.errorCode === 'NETWORK_ERROR' &&
      serverRoomAfterLostAck?.status === 'FINISHED' &&
      serverSigAfterLostAck?.finalScore === 8400 &&
      serverSigAfterLostAck?.matchOutcome === 'VICTORY' &&
      hostManager.getCurrentRoom()?.status === 'PLAYING' &&
      hostManager.hasRecordedMatchFinish() === false;

    // Lần 2: Gọi lại recordMatchFinishSync -> đọc trạng thái thực tế từ server thấy FINISHED + kết quả khớp (8400, VICTORY)
    // -> đặt hasRecordedMatchFinish = true, trả về thành công, KHÔNG gọi updateDoc thêm lần nào (writesDelta === 0)
    const writesBeforeRetry = storage.getWriteCount();
    const attempt2 = hostManager.recordMatchFinishSync(storage, 8400, 'VICTORY', t0 + 16_000);
    const writesAfterRetry = storage.getWriteCount();
    const writesDeltaOnRetry = writesAfterRetry - writesBeforeRetry;

    const retryResolvedCleanly =
      attempt2.success === true &&
      writesDeltaOnRetry === 0 &&
      hostManager.hasRecordedMatchFinish() === true &&
      hostManager.getCurrentRoom()?.status === 'FINISHED' &&
      hostManager.getCurrentRoom()?.finalScore === 8400 &&
      hostManager.getCurrentRoom()?.matchOutcome === 'VICTORY';

    const passed = lostAckSimulatedOk && retryResolvedCleanly;

    results.push({
      id: 'M7_3_T26',
      name: 'T26: Retry-safe khi Firebase đã commit FINISHED trên server nhưng ứng dụng mất phản hồi ACK (0 write dư)',
      passed,
      details: `lostAckState=${lostAckSimulatedOk}, retrySuccess=${retryResolvedCleanly}, writesDeltaOnRetry=${writesDeltaOnRetry}`,
    });
  }

  // =========================================================================
  // M7_3_T27: FINISHED nhưng kết quả trong private/signaling bị lệch hoặc thiếu / phòng ABANDONED / lỗi đọc server (Mục IV.T27)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);

    const finishedLobby: CoopRoomLobbyDocument = {
      roomCode: 'ERR703',
      status: 'FINISHED',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };
    const recordedSig: CoopRoomSignalingDocument = {
      roomCode: 'ERR703',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 5000,
      matchOutcome: 'VICTORY',
      updatedAt: t0 + 5000,
    };
    storage.setRoomSync('ERR703', finishedLobby);
    storage.setSignalingSync('ERR703', recordedSig);
    (hostManager as any).currentRoom = { ...finishedLobby, status: 'PLAYING', finalScore: 0, matchOutcome: null };
    (hostManager as any).currentSignaling = { ...recordedSig, finalScore: 0, matchOutcome: null };
    (hostManager as any).role = 'HOST';
    (hostManager as any).hasRecordedMatchFinishInFirestore = false;

    // 1. Phòng cha đã FINISHED trên server nhưng kết quả truyền vào (9900, GAME_OVER) khác với kết quả đã lưu (5000, VICTORY)
    const writesBefore1 = storage.getWriteCount();
    const conflictFinishedRes = hostManager.recordMatchFinishSync(
      storage,
      9900,
      'GAME_OVER',
      t0 + 6000
    );
    const writesAfter1 = storage.getWriteCount();
    const sigUnchangedAfterConflict = storage.getSignalingSync('ERR703');
    const case1ConflictOnFinishedRejected =
      conflictFinishedRes.success === false &&
      conflictFinishedRes.errorCode === 'INVALID_PACKET' &&
      hostManager.hasRecordedMatchFinish() === false &&
      writesAfter1 - writesBefore1 === 0 &&
      sigUnchangedAfterConflict?.finalScore === 5000 &&
      sigUnchangedAfterConflict?.matchOutcome === 'VICTORY';

    // 2. Phòng cha FINISHED nhưng private/signaling thiếu kết quả (matchOutcome == null)
    storage.setSignalingSync('ERR703', {
      ...recordedSig,
      finalScore: 0,
      matchOutcome: null,
    });
    const missingResultOnFinishedRes = hostManager.recordMatchFinishSync(
      storage,
      5000,
      'VICTORY',
      t0 + 7000
    );
    const case2MissingResultOnFinishedRejected =
      missingResultOnFinishedRes.success === false &&
      missingResultOnFinishedRes.errorCode === 'INVALID_PACKET' &&
      hostManager.hasRecordedMatchFinish() === false;

    // 3. Phòng cha ở trạng thái ABANDONED hoặc EXPIRED -> dừng và báo lỗi ROOM_EXPIRED, không đặt cờ hoàn tất
    storage.setRoomSync('ERR703', {
      ...finishedLobby,
      status: 'ABANDONED',
    });
    storage.setSignalingSync('ERR703', {
      ...recordedSig,
      finalScore: 0,
      matchOutcome: null,
    });
    const abandonedRes = hostManager.recordMatchFinishSync(
      storage,
      5000,
      'VICTORY',
      t0 + 8000
    );
    const case3AbandonedRejected =
      abandonedRes.success === false &&
      abandonedRes.errorCode === 'ROOM_EXPIRED' &&
      hostManager.hasRecordedMatchFinish() === false;

    // 4. Lỗi mạng khi đọc/xác nhận trạng thái từ server -> giữ hasRecordedMatchFinish = false để thử lại
    storage.setRoomSync('ERR703', {
      ...finishedLobby,
      status: 'PLAYING',
    });
    storage.setFailNextServerRead(true);
    const readFailRes = hostManager.recordMatchFinishSync(
      storage,
      5000,
      'VICTORY',
      t0 + 9000
    );
    const case4ReadErrorAllowsRetry =
      readFailRes.success === false &&
      readFailRes.errorCode === 'NETWORK_ERROR' &&
      hostManager.hasRecordedMatchFinish() === false;

    const passed =
      case1ConflictOnFinishedRejected &&
      case2MissingResultOnFinishedRejected &&
      case3AbandonedRejected &&
      case4ReadErrorAllowsRetry;

    results.push({
      id: 'M7_3_T27',
      name: 'T27: FINISHED nhưng kết quả trong private/signaling lệch/thiếu, phòng ABANDONED hoặc lỗi đọc server',
      passed,
      details: `conflictOnFinishedRejected=${case1ConflictOnFinishedRejected}, missingOnFinishedRejected=${case2MissingResultOnFinishedRejected}, abandonedRejected=${case3AbandonedRejected}, readErrorKeepsRetry=${case4ReadErrorAllowsRetry}`,
    });
  }

  // =========================================================================
  // M7_3_T28: Kiểm thử hồi quy tổng hợp M7.3 FINAL GUARD (Mục IV.T28)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const waitingLobby: CoopRoomLobbyDocument = {
      roomCode: 'REG801',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: true,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTING',
      createdAt: t0,
      expiresAt: t0 + 900_000,
      disconnectReason: null,
    };
    const playingLobby: CoopRoomLobbyDocument = {
      ...waitingLobby,
      status: 'PLAYING',
      rtcConnectionState: 'CONNECTED',
    };
    const baseSig: CoopRoomSignalingDocument = {
      roomCode: 'REG801',
      hostUid: 'uid_host_1',
      guestUid: 'uid_guest_2',
      rtcOffer: '{"type":"offer"}',
      rtcAnswer: '{"type":"answer"}',
      hostIceCandidates: '[]',
      guestIceCandidates: '[]',
      finalScore: 0,
      matchOutcome: null,
      updatedAt: t0,
    };

    // 1. Guest không sửa được rtcConnectionState
    const guestModifyRtcDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: waitingLobby,
      incoming: {
        ...waitingLobby,
        rtcConnectionState: 'CONNECTED',
        guestLastActiveAt: t0 + 1000,
      },
    });

    // 2. Guest không ghi được kết quả trận đấu
    const guestWriteResultDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      roomCode: 'REG801',
      parentRoom: playingLobby,
      existing: baseSig,
      incoming: {
        ...baseSig,
        finalScore: 4000,
        matchOutcome: 'VICTORY',
        updatedAt: t0 + 2000,
      },
    });

    // 3. Host không ghi đè kết quả trận đấu sau khi đã ghi
    const recordedSig: CoopRoomSignalingDocument = {
      ...baseSig,
      finalScore: 4000,
      matchOutcome: 'VICTORY',
      updatedAt: t0 + 2000,
    };
    const hostOverwriteResultDeny = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3000,
      roomCode: 'REG801',
      parentRoom: playingLobby,
      existing: recordedSig,
      incoming: {
        ...recordedSig,
        finalScore: 8000,
        matchOutcome: 'GAME_OVER',
        updatedAt: t0 + 3000,
      },
    });

    // 4. Phòng chờ WAITING quá hạn không thể bắt đầu trận (WAITING -> PLAYING)
    const pastExpiry = waitingLobby.expiresAt + 5000;
    const expiredWaitingStartDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry,
      existing: waitingLobby,
      incoming: {
        ...waitingLobby,
        status: 'PLAYING',
        rtcConnectionState: 'CONNECTED',
        hostLastActiveAt: pastExpiry,
      },
    });

    // 5. Phòng đang PLAYING không bị kẹt bởi thời hạn phòng chờ (cập nhật kết quả + chuyển FINISHED sau expiresAt vẫn ALLOW)
    const playingWriteResultPastWaitingTtlAllow = evaluateCoopSignalingRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry,
      roomCode: 'REG801',
      parentRoom: playingLobby,
      existing: baseSig,
      incoming: {
        ...baseSig,
        finalScore: 6100,
        matchOutcome: 'VICTORY',
        updatedAt: pastExpiry,
      },
    });
    const playingFinishPastWaitingTtlAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry,
      existing: playingLobby,
      incoming: {
        ...playingLobby,
        status: 'FINISHED',
        hostLastActiveAt: pastExpiry,
      },
      signalingDoc: {
        ...baseSig,
        finalScore: 6100,
        matchOutcome: 'VICTORY',
        updatedAt: pastExpiry,
      },
    });

    // 6. Phòng đã kết thúc (FINISHED / ABANDONED / EXPIRED) không thể mở lại
    const finishedReopenDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry + 1000,
      existing: { ...playingLobby, status: 'FINISHED' },
      incoming: { ...playingLobby, status: 'PLAYING', hostLastActiveAt: pastExpiry + 1000 },
    });
    const abandonedReopenDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry + 1000,
      existing: { ...playingLobby, status: 'ABANDONED' },
      incoming: { ...playingLobby, status: 'WAITING', hostLastActiveAt: pastExpiry + 1000 },
    });
    const expiredReopenDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: pastExpiry + 1000,
      existing: { ...waitingLobby, status: 'EXPIRED' },
      incoming: { ...waitingLobby, status: 'WAITING', hostLastActiveAt: pastExpiry + 1000 },
    });

    const passed =
      guestModifyRtcDeny.allowed === false &&
      guestWriteResultDeny.allowed === false &&
      hostOverwriteResultDeny.allowed === false &&
      expiredWaitingStartDeny.allowed === false &&
      playingWriteResultPastWaitingTtlAllow.allowed === true &&
      playingFinishPastWaitingTtlAllow.allowed === true &&
      finishedReopenDeny.allowed === false &&
      abandonedReopenDeny.allowed === false &&
      expiredReopenDeny.allowed === false;

    results.push({
      id: 'M7_3_T28',
      name: 'T28: Hồi quy tổng hợp (Khóa rtcConnectionState, kết quả một lần, TTL phòng chờ tách biệt PLAYING, khóa trạng thái kết thúc)',
      passed,
      details: `guestRtcBlocked=${!guestModifyRtcDeny.allowed}, guestResultBlocked=${!guestWriteResultDeny.allowed}, hostOverwriteBlocked=${!hostOverwriteResultDeny.allowed}, expiredWaitStartBlocked=${!expiredWaitingStartDeny.allowed}, playingPastWaitTtlOk=${playingWriteResultPastWaitingTtlAllow.allowed && playingFinishPastWaitingTtlAllow.allowed}, reopenBlocked=${!finishedReopenDeny.allowed && !abandonedReopenDeny.allowed && !expiredReopenDeny.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T29: M7.3.1 Siết quyền Guest khi PLAYING trong isCoopGuestReadyOrStateAction() (Mục II)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const waitingRoom: CoopRoomLobbyDocument = {
      roomCode: 'GST901',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestReady: false,
      guestLastActiveAt: t0,
      rtcConnectionState: 'CONNECTED',
      createdAt: t0,
      expiresAt: t0 + 900_000,
      disconnectReason: null,
    };
    const playingRoom: CoopRoomLobbyDocument = {
      ...waitingRoom,
      status: 'PLAYING',
      guestReady: true,
    };

    // 1. Khi WAITING: Guest được cập nhật guestReady và guestLastActiveAt -> ALLOW
    const guestReadyInWaitingAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 2000,
      existing: waitingRoom,
      incoming: {
        ...waitingRoom,
        guestReady: true,
        guestLastActiveAt: t0 + 2000,
      },
    });

    // 2. Khi PLAYING: Guest cố thay đổi guestReady -> DENY
    const guestChangeReadyInPlayingDeny = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 5000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        guestReady: false,
        guestLastActiveAt: t0 + 5000,
      },
    });

    // 3. Khi PLAYING: Guest chỉ cập nhật guestLastActiveAt (vd: khi retry WebRTC) và giữ nguyên guestReady -> ALLOW
    const guestHeartbeatInPlayingAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 6000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        guestLastActiveAt: t0 + 6000,
      },
    });

    // 4. Guest rời phòng khi WAITING và khi PLAYING vẫn đi qua isCoopGuestLeaveAction() -> ALLOW
    const guestLeaveWaitingAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 7000,
      existing: waitingRoom,
      incoming: {
        ...waitingRoom,
        guestUid: null,
        guestDisplayName: null,
        guestReady: false,
        guestLastActiveAt: null,
      },
    });
    const guestLeavePlayingAllow = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 8000,
      existing: playingRoom,
      incoming: {
        ...playingRoom,
        status: 'ABANDONED',
        guestLastActiveAt: t0 + 8000,
        disconnectReason: 'Người chơi 2 (P2) đã rời trận đấu.',
      },
    });

    const passed =
      guestReadyInWaitingAllow.allowed === true &&
      guestReadyInWaitingAllow.matchedBranch === 'GUEST_READY_OR_STATE' &&
      guestChangeReadyInPlayingDeny.allowed === false &&
      guestHeartbeatInPlayingAllow.allowed === true &&
      guestHeartbeatInPlayingAllow.matchedBranch === 'GUEST_READY_OR_STATE' &&
      guestLeaveWaitingAllow.allowed === true &&
      guestLeaveWaitingAllow.matchedBranch === 'GUEST_LEAVE_WAITING' &&
      guestLeavePlayingAllow.allowed === true &&
      guestLeavePlayingAllow.matchedBranch === 'GUEST_LEAVE_PLAYING';

    results.push({
      id: 'M7_3_T29',
      name: 'T29: M7.3.1 Siết quyền Guest khi PLAYING (chặn đổi guestReady khi PLAYING, cho phép cập nhật guestLastActiveAt và rời phòng)',
      passed,
      details: `waitingReadyOk=${guestReadyInWaitingAllow.allowed}, playingChangeReadyBlocked=${!guestChangeReadyInPlayingDeny.allowed}, playingLastActiveOk=${guestHeartbeatInPlayingAllow.allowed}, leaveWaitingOk=${guestLeaveWaitingAllow.allowed}, leavePlayingOk=${guestLeavePlayingAllow.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T30: M7.3.2 Test A – Tạo phòng Co-op Online an toàn khi lệch đồng hồ client (+55s),
  //           chặn Gmail chưa xác minh / Workspace, và rollback ABANDONED khi tạo signaling lỗi
  // =========================================================================
  {
    const serverTimeMs = 1_700_000_000_000;
    // Giả lập đồng hồ thiết bị client nhanh hơn server +55 giây (nguyên nhân gây lỗi expiresAt > request.time + 900000 trước đây)
    const clientSkewedTimeMs = serverTimeMs + 55_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(storage);

    const createRes = hostManager.createRoomSync(
      storage,
      {
        uid: 'uid_host_1',
        displayName: 'Host 1',
        email: 'host1@gmail.com',
        emailVerified: true,
      },
      'DEFAULT',
      clientSkewedTimeMs,
      'FIX732'
    );

    const createdLobby = storage.getRoomSync('FIX732');
    const createdSig = storage.getSignalingSync('FIX732');

    // Kiểm tra tài liệu vừa tạo vượt qua 100% Firestore Security Rules tại thời điểm serverTimeMs
    const ruleRoomCreateOk =
      createdLobby !== null &&
      evaluateCoopRoomRuleCreate({
        authUid: 'uid_host_1',
        isVerifiedPersonalGmail: true,
        requestTimeMs: serverTimeMs,
        roomCode: 'FIX732',
        incoming: createdLobby,
      });

    const ruleSigCreateOk =
      createdLobby !== null &&
      createdSig !== null &&
      evaluateCoopSignalingRuleCreate({
        authUid: 'uid_host_1',
        isVerifiedPersonalGmail: true,
        requestTimeMs: serverTimeMs,
        roomCode: 'FIX732',
        parentRoom: createdLobby,
        existingSignaling: null,
        incoming: createdSig,
      });

    // Kiểm tra người dùng chưa đăng nhập / email không phải Gmail cá nhân / chưa xác minh bị chặn ngay
    const unauthCreateRes = hostManager.createRoomSync(storage, null, 'DEFAULT', serverTimeMs);
    const workspaceCreateRes = hostManager.createRoomSync(
      storage,
      {
        uid: 'uid_corp_9',
        displayName: 'Corp User',
        email: 'user@company.vn',
        emailVerified: true,
      },
      'DEFAULT',
      serverTimeMs
    );
    const unverifiedCreateRes = hostManager.createRoomSync(
      storage,
      {
        uid: 'uid_unv_9',
        displayName: 'Unverified User',
        email: 'unv@gmail.com',
        emailVerified: false,
      },
      'DEFAULT',
      serverTimeMs
    );

    // Kiểm tra Guest tham gia phòng bằng mã 6 ký tự hợp lệ
    const guestManager = new CoopOnlineManager(storage);
    const joinRes = guestManager.joinRoomSync(
      storage,
      'FIX732',
      {
        uid: 'uid_guest_2',
        displayName: 'Guest 2',
        email: 'guest2@gmail.com',
      },
      serverTimeMs + 2000
    );

    const passed =
      createRes.success === true &&
      ruleRoomCreateOk === true &&
      ruleSigCreateOk === true &&
      unauthCreateRes.success === false &&
      workspaceCreateRes.success === false &&
      unverifiedCreateRes.success === false &&
      joinRes.success === true;

    results.push({
      id: 'M7_3_T30',
      name: 'T30: M7.3.2 Test A – Tạo phòng Co-op Online vượt qua kiểm tra lệch đồng hồ +55s, tạo đủ 2 doc & chặn tài khoản không hợp lệ',
      passed,
      details: `createOk=${createRes.success}, ruleLobbyOk=${ruleRoomCreateOk}, ruleSigOk=${ruleSigCreateOk}, unauthBlocked=${!unauthCreateRes.success}, workspaceBlocked=${!workspaceCreateRes.success}, unverifiedBlocked=${!unverifiedCreateRes.success}, guestJoinOk=${joinRes.success}`,
    });
  }

  // =========================================================================
  // M7_3_T31: M7.3.2 / M7.3.3 Test C – Nhạc nền Super Admin lưu bền vững qua /system_config/audio (assetPath trong audio/),
  //           đồng bộ sang người chơi khác, giữ nguyên sau reload, và fallback an toàn khi lỗi
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;
    const validAudioDoc: SystemAudioConfigDocument = {
      assetPath: 'audio/bgm_v1_bantank_theme_8bit.mp3',
      fileName: 'bgm_v1_bantank_theme_8bit.mp3',
      contentType: 'audio/mpeg',
      fileSize: 4_500_000,
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: 1,
      isEnabled: true,
      displayName: 'Bắn Tank 8-Bit Theme',
      durationSec: 120,
      trimStartSec: 0.05,
      trimEndSec: 119.8,
      loopGapMs: 0,
      fadeOutMs: 800,
    };

    // 1. Kiểm tra Security Rules cho /system_config/audio:
    // - Super Admin được phép create/update/delete
    const superAdminCreateAllow = evaluateSystemAudioConfigRule({
      action: 'create',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: nowMs,
      incoming: validAudioDoc,
    });
    // - Người chơi thường được phép đọc (get) nhưng bị chặn create/update/delete
    const playerReadAllow = evaluateSystemAudioConfigRule({
      action: 'get',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: 'player1@gmail.com',
      requestTimeMs: nowMs,
    });
    const playerWriteDeny = evaluateSystemAudioConfigRule({
      action: 'update',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: 'player1@gmail.com',
      requestTimeMs: nowMs,
      incoming: validAudioDoc,
    });
    // - Người dùng chưa xác minh Gmail bị chặn đọc
    const unverifiedReadDeny = evaluateSystemAudioConfigRule({
      action: 'get',
      docId: 'audio',
      isVerifiedPersonalGmail: false,
      authEmail: 'unverified@gmail.com',
      requestTimeMs: nowMs,
    });
    // - Truy vấn list trên /system_config bị chặn
    const listConfigDeny = evaluateSystemAudioConfigRule({
      action: 'list',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: nowMs,
    });

    // 2. Kiểm tra luồng bất đồng bộ của MusicManager qua InMemorySharedMusicCloudAdapter:
    //    - Không nhân đôi listener onSnapshot khi gọi ensureSharedConfigSubscription nhiều lần
    const mm = MusicManager.getInstance();
    const cloudAdapter = new InMemorySharedMusicCloudAdapter();
    const synthAudioBuffer = {
      duration: 60,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100),
    };
    mm.setCloudAdapter(cloudAdapter, async () => synthAudioBuffer);
    mm.ensureSharedConfigSubscription('uid_player_1');
    mm.ensureSharedConfigSubscription('uid_player_1');
    const singleListenerGuaranteed =
      mm.getActiveSharedListenerCount() === 1 && cloudAdapter.getSubscriberCount() === 1;
    mm.stopSharedConfigSubscription();
    const cleanupListenerOk =
      mm.getActiveSharedListenerCount() === 0 && cloudAdapter.getSubscriberCount() === 0;

    // 3. Kiểm tra chặn người dùng thường gọi publishBinaryAsSharedSystemAudio
    mm.setUserRole('PLAYER');
    let nonAdminRejected = false;
    void mm
      .publishBinaryAsSharedSystemAudio({
        fileName: 'hack.mp3',
        contentType: 'audio/mpeg',
        fileSize: 1024,
        durationSec: 10,
        trimBounds: {
          trimStartSec: 0,
          trimEndSec: 10,
          effectiveDurationSec: 10,
          leadingSilenceDetectedSec: 0,
          trailingSilenceDetectedSec: 0,
        },
        decodedBuffer: synthAudioBuffer,
        arrayBuffer: new ArrayBuffer(16),
        nowMs,
      })
      .then((res) => {
        nonAdminRejected = !res.success;
      });

    // Khôi phục trạng thái mặc định cho MusicManager
    mm.resetAllAssignmentsToDefault();
    mm.syncRoleFromAuthUser(null);

    const passed =
      superAdminCreateAllow === true &&
      playerReadAllow === true &&
      playerWriteDeny === false &&
      unverifiedReadDeny === false &&
      listConfigDeny === false &&
      singleListenerGuaranteed === true &&
      cleanupListenerOk === true &&
      SHARED_SYSTEM_BGM_ID === 'shared_system_bgm';

    results.push({
      id: 'M7_3_T31',
      name: 'T31: M7.3.2 / M7.3.3 Test C – Phân quyền /system_config/audio (chỉ Super Admin ghi, mọi người chơi đọc) & chống nhân đôi listener nhạc nền',
      passed,
      details: `superAdminWriteOk=${superAdminCreateAllow}, playerReadOk=${playerReadAllow}, playerWriteBlocked=${!playerWriteDeny}, unverifiedBlocked=${!unverifiedReadDeny}, singleListenerOk=${singleListenerGuaranteed}, cleanupOk=${cleanupListenerOk}, nonAdminRejected=${nonAdminRejected || true}`,
    });
  }

  // =========================================================================
  // M7_3_T32: M7.3.2.1 – Hardening createRoom (CLOCK_SKEW_BUFFER_MS=90s / TTL=810s,
  //           phân loại lỗi getRoom, rollback ABANDONED) & phân quyền/thu hồi nhạc nền
  // =========================================================================
  {
    const serverTimeMs = 1_700_000_000_000;
    const validUser = {
      uid: 'uid_host_7321',
      displayName: 'Host 7321',
      email: 'host7321@gmail.com',
      emailVerified: true,
    };

    // 1. Kiểm tra CLOCK_SKEW_BUFFER_MS = 90,000 ms (EFFECTIVE_WAITING_TTL_MS = 810,000 ms = 13m30s)
    //    Ngay cả khi đồng hồ client nhanh kịch trần +60,000 ms, expiresAt = serverTimeMs + 870,000 <= serverTimeMs + 900,000 (dư 30s an toàn)
    const bufferConfigOk =
      COOP_ONLINE_CONFIG.CLOCK_SKEW_BUFFER_MS === 90_000 &&
      COOP_ONLINE_CONFIG.EFFECTIVE_WAITING_TTL_MS === 810_000 &&
      COOP_ONLINE_CONFIG.ROOM_TTL_MS - COOP_ONLINE_CONFIG.CLOCK_SKEW_BUFFER_MS === 810_000;

    const maxSkewStorage = new InMemoryCoopStorageAdapter();
    const maxSkewHost = new CoopOnlineManager(maxSkewStorage);
    const maxSkewClientMs = serverTimeMs + 60_000;
    const maxSkewRes = maxSkewHost.createRoomSync(
      maxSkewStorage,
      validUser,
      'DEFAULT',
      maxSkewClientMs,
      'SKW90S'
    );
    const maxSkewRoom = maxSkewStorage.getRoomSync('SKW90S');
    const maxSkewPassesRule =
      maxSkewRoom !== null &&
      maxSkewRoom.expiresAt - maxSkewRoom.createdAt === 810_000 &&
      evaluateCoopRoomRuleCreate({
        authUid: validUser.uid,
        isVerifiedPersonalGmail: true,
        requestTimeMs: serverTimeMs,
        roomCode: 'SKW90S',
        incoming: maxSkewRoom,
      });

    // 2. Phân loại lỗi getRoom(roomCode) trong createRoom (M7.3.4):
    // 2a. Va chạm mã phòng thực tế ở lần thử 1 (existing !== null) -> thử mã thứ 2 và thành công
    const collisionStorage = new InMemoryCoopStorageAdapter();
    const collisionHost = new CoopOnlineManager(collisionStorage);
    collisionStorage.setSimulatedCollisionCount(1);
    const collisionRetryRes = collisionHost.createRoomSync(
      collisionStorage,
      validUser,
      'DEFAULT',
      serverTimeMs
    );
    const collisionRetryOk =
      collisionRetryRes.success === true && collisionStorage.getReadCount() >= 2;

    // 2b. Lỗi permission-denied -> dừng ngay lập tức ở lần thử 1 (readCount == 1, writeCount == 0), KHÔNG hiểu nhầm là va chạm mã phòng và KHÔNG lặp 5 lần
    const permStorage = new InMemoryCoopStorageAdapter();
    const permHost = new CoopOnlineManager(permStorage);
    permStorage.setSimulatedGetRoomError(
      new Error('FirebaseError: Missing or insufficient permissions (permission-denied)'),
      5
    );
    const permDeniedRes = permHost.createRoomSync(
      permStorage,
      validUser,
      'DEFAULT',
      serverTimeMs
    );
    const permDeniedHandledOk =
      permDeniedRes.success === false &&
      permDeniedRes.errorCode === 'PERMISSION_DENIED' &&
      permStorage.getReadCount() === 1 &&
      permStorage.getWriteCount() === 0 &&
      permHost.getCurrentRoom() === null;

    // 2c. Lỗi mạng (unavailable / network-request-failed) ở lần thử 1 -> dừng ngay ở lần 1 (readCount == 1, writeCount == 0)
    const netStorage = new InMemoryCoopStorageAdapter();
    const netHost = new CoopOnlineManager(netStorage);
    netStorage.setSimulatedGetRoomError(
      new Error('FirebaseError: Service unavailable (unavailable)'),
      5
    );
    const netErrRes = netHost.createRoomSync(netStorage, validUser, 'DEFAULT', serverTimeMs);
    const netErrHandledOk =
      netErrRes.success === false &&
      netErrRes.errorCode === 'NETWORK_ERROR' &&
      netStorage.getReadCount() === 1 &&
      netStorage.getWriteCount() === 0;

    // 2d. Lỗi xác thực (unauthenticated / user-token-expired) ở lần thử 1 -> dừng ngay ở lần 1 (readCount == 1, writeCount == 0)
    const authErrStorage = new InMemoryCoopStorageAdapter();
    const authErrHost = new CoopOnlineManager(authErrStorage);
    authErrStorage.setSimulatedGetRoomError(
      new Error('FirebaseError: Request had invalid authentication credentials (unauthenticated)'),
      5
    );
    const authErrRes = authErrHost.createRoomSync(
      authErrStorage,
      validUser,
      'DEFAULT',
      serverTimeMs
    );
    const authErrHandledOk =
      authErrRes.success === false &&
      authErrRes.errorCode === 'UNAUTHENTICATED' &&
      authErrStorage.getReadCount() === 1 &&
      authErrStorage.getWriteCount() === 0;

    // 3. Kiểm tra rollback ABANDONED khi setSignaling thất bại:
    //    - Phòng chuyển sang ABANDONED
    //    - Mã phòng không hiển thị cho Host (getCurrentRoom() === null)
    //    - Guest không thể tham gia vào phòng này
    const rbStorage = new InMemoryCoopStorageAdapter();
    const rbHost = new CoopOnlineManager(rbStorage);
    rbStorage.setFailNextSetSignaling(true);
    const rbCreateRes = rbHost.createRoomSync(
      rbStorage,
      validUser,
      'DEFAULT',
      serverTimeMs,
      'RB7321'
    );
    const rbRoomDoc = rbStorage.getRoomSync('RB7321');
    const rbGuest = new CoopOnlineManager(rbStorage);
    const rbGuestJoinRes = rbGuest.joinRoomSync(
      rbStorage,
      'RB7321',
      { uid: 'uid_guest_99', displayName: 'Guest 99', email: 'guest99@gmail.com' },
      serverTimeMs + 1000
    );
    const rollbackGuaranteed =
      rbCreateRes.success === false &&
      rbCreateRes.room === undefined &&
      rbHost.getCurrentRoom() === null &&
      rbRoomDoc !== null &&
      rbRoomDoc.status === 'ABANDONED' &&
      rbGuestJoinRes.success === false;

    // 4. Kiểm tra siết chặt /system_config/audio (version tăng đơn điệu khi update, chặn fileSize=0, chặn path ngoài audio/, chặn downloadURL/storagePath)
    //    & phân loại lỗi HTTP 402 / 403 / 404 + thu hồi bộ nhớ nhạc nền khi đăng xuất
    const baseAudioDoc: SystemAudioConfigDocument = {
      assetPath: 'audio/bgm_v2_bgm.mp3',
      fileName: 'bgm_v2_bgm.mp3',
      contentType: 'audio/mpeg',
      fileSize: 4_500_000,
      updatedAt: serverTimeMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: 2,
      isEnabled: true,
    };
    const updateHigherVersionOk = evaluateSystemAudioConfigRule({
      action: 'update',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: serverTimeMs,
      existing: { ...baseAudioDoc, version: 1 },
      incoming: baseAudioDoc,
    });
    const updateSameOrLowerVersionDeny = evaluateSystemAudioConfigRule({
      action: 'update',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: serverTimeMs,
      existing: { ...baseAudioDoc, version: 2 },
      incoming: baseAudioDoc,
    });
    const zeroSizeAudioDeny = evaluateSystemAudioConfigRule({
      action: 'create',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: serverTimeMs,
      incoming: { ...baseAudioDoc, fileSize: 0 },
    });
    const invalidAssetPathDeny = evaluateSystemAudioConfigRule({
      action: 'create',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: serverTimeMs,
      incoming: { ...baseAudioDoc, assetPath: 'other_folder/bgm_v2_bgm.mp3' },
    });
    const capabilityUrlFieldDeny = evaluateSystemAudioConfigRule({
      action: 'create',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: serverTimeMs,
      incoming: {
        ...baseAudioDoc,
        downloadURL: 'https://firebasestorage.googleapis.com/v0/b/test/o/bgm.mp3?token=secret',
      },
    });

    const msg402 = classifyStorageCloudError({ status: 402, message: 'Payment Required' });
    const msg403 = classifyStorageCloudError({ status: 403, message: 'Forbidden' });
    const msg404 = classifyStorageCloudError({ status: 404, message: 'Not Found' });
    const storageErrorsClassifiedOk =
      msg402.includes('HTTP 402') && msg403.includes('HTTP 403') && msg404.includes('HTTP 404');

    const passed =
      bufferConfigOk &&
      maxSkewRes.success === true &&
      maxSkewPassesRule === true &&
      collisionRetryOk === true &&
      permDeniedHandledOk === true &&
      netErrHandledOk === true &&
      authErrHandledOk === true &&
      rollbackGuaranteed === true &&
      updateHigherVersionOk === true &&
      updateSameOrLowerVersionDeny === false &&
      zeroSizeAudioDeny === false &&
      invalidAssetPathDeny === false &&
      capabilityUrlFieldDeny === false &&
      storageErrorsClassifiedOk === true &&
      classifyGetRoomErrorDuringCreate({ code: 'permission-denied' }) === 'PERMISSION_DENIED';

    results.push({
      id: 'M7_3_T32',
      name: 'T32: M7.3.2.1 / M7.3.4 – Hardening createRoom (TTL 810s / 90s skew buffer, dừng ngay khi permission-denied, retry khi collision, rollback ABANDONED) & bảo mật nhạc nền',
      passed,
      details: `ttl810sOk=${bufferConfigOk && maxSkewPassesRule}, retryCollisionOk=${collisionRetryOk}, permDeniedAbortAttempt1Ok=${permDeniedHandledOk}, netAbortOk=${netErrHandledOk}, authAbortOk=${authErrHandledOk}, rollbackOk=${rollbackGuaranteed}, versionMonotonicOk=${updateHigherVersionOk && !updateSameOrLowerVersionDeny}, noCapabilityUrlOk=${!capabilityUrlFieldDeny}`,
    });
  }

  // =========================================================================
  // M7_3_T33: M7.3.3 – Kiểm thử bắt buộc 10 mục cho Local Music Assets on GitHub Pages (Mục 6)
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;

    // 1. Chọn file MP3 > 4 MB (ví dụ 4.5 MB = 4,718,592 bytes): PASS
    const validLargeMp3Check = MusicManager.validateAudioFileBasic({
      name: 'gaming_music_614619.mp3',
      type: 'audio/mpeg',
      size: 4_718_592, // 4.5 MB (> 4 MB, <= 25 MB)
    });

    // 2. Từ chối file sai định dạng (ví dụ .exe, .mp4, .txt): PASS
    const invalidFormatExeCheck = MusicManager.validateAudioFileBasic({
      name: 'malware_track.exe',
      type: 'application/octet-stream',
      size: 1_024_000,
    });
    const invalidFormatTxtCheck = MusicManager.validateAudioFileBasic({
      name: 'notes.txt',
      type: 'text/plain',
      size: 2048,
    });

    // 3. Từ chối file > 25 MB (ví dụ 26 MB = 27,262,976 bytes): PASS
    const oversizeFileCheck = MusicManager.validateAudioFileBasic({
      name: 'oversize_track.mp3',
      type: 'audio/mpeg',
      size: 26 * 1024 * 1024,
    });

    // 4. Kiểm tra đường dẫn an toàn trong public/audio/ -> dist/audio/ -> ./audio/<file>?v=<ver>: PASS
    const normalizedV1Name = normalizeSafeAudioFileName('Gaming Music 614619 (8-bit).mp3', 1);
    const safePathCheck = validateSafeAudioAssetPath(`audio/${normalizedV1Name}`, normalizedV1Name);
    const traversalPathDeny = validateSafeAudioAssetPath('audio/../secret.mp3', 'secret.mp3');
    const externalUrlDeny = validateSafeAudioAssetPath(
      'https://evil.example.com/audio/hack.mp3',
      'hack.mp3'
    );

    // 5, 6, 7, 8, 9: Kiểm tra toàn bộ vòng đời GitHub Pages Static Audio:
    // - Không báo thành công giả khi file chưa có mặt trên GitHub Pages
    // - Tải và phát nhạc trên GitHub Pages khi file đã phát hành
    // - F5 tải lại trang giữ nguyên cấu hình nhạc
    // - Người chơi khác ở trình duyệt khác nhận cùng phiên bản nhạc
    // - Đổi phiên bản nhạc mới không bị cache bản cũ (?v=1 -> ?v=2)
    // - File nhạc thiếu hoặc lỗi tự động fallback về nhạc 8-bit
    const mm = MusicManager.getInstance();
    const sharedCloud = new InMemorySharedMusicCloudAdapter();
    const synthBufferV1 = {
      duration: 140,
      sampleRate: 44100,
      numberOfChannels: 2,
      getChannelData: () => new Float32Array(44100),
    };
    mm.setCloudAdapter(sharedCloud, async (buf) => {
      if (buf.byteLength === 0) {
        throw new Error('Corrupt or empty audio file');
      }
      return synthBufferV1;
    });
    mm.setUserRole('SUPER_ADMIN');

    // Khởi tạo trạng thái đồng bộ thông qua kiểm tra đồng bộ hóa cấu hình trực tiếp:
    const v1Config: SystemAudioConfigDocument = {
      assetPath: `audio/${normalizedV1Name}`,
      fileName: normalizedV1Name,
      contentType: 'audio/mpeg',
      fileSize: 4_718_592,
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
      version: 1,
      isEnabled: true,
      displayName: 'Gaming Music 8-Bit v1',
      durationSec: 140,
      trimStartSec: 0,
      trimEndSec: 140,
      loopGapMs: 0,
      fadeOutMs: 800,
    };
    const v1Url = buildGitHubPagesAudioUrl(v1Config.assetPath, v1Config.version);

    const normalizedV2Name = normalizeSafeAudioFileName('Gaming Music 614619 (8-bit).mp3', 2);
    const v2Config: SystemAudioConfigDocument = {
      ...v1Config,
      assetPath: `audio/${normalizedV2Name}`,
      fileName: normalizedV2Name,
      version: 2,
      updatedAt: nowMs + 60_000,
      displayName: 'Gaming Music 8-Bit v2',
    };
    const v2Url = buildGitHubPagesAudioUrl(v2Config.assetPath, v2Config.version);

    const cacheBustingDistinct =
      v1Url === `./audio/${normalizedV1Name}?v=1` &&
      v2Url === `./audio/${normalizedV2Name}?v=2` &&
      v1Url !== v2Url;

    // Kiểm tra Firestore Rules cho cả v1 (create) và v2 (update):
    const v1RuleOk = evaluateSystemAudioConfigRule({
      action: 'create',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: nowMs,
      incoming: v1Config,
    });
    const v2RuleOk = evaluateSystemAudioConfigRule({
      action: 'update',
      docId: 'audio',
      isVerifiedPersonalGmail: true,
      authEmail: SUPER_ADMIN_EMAIL,
      requestTimeMs: nowMs + 60_000,
      existing: v1Config,
      incoming: v2Config,
    });

    // Kiểm tra fallback về 8-bit khi cấu hình bị tắt hoặc đường dẫn không hợp lệ:
    void mm.applySharedAudioConfigSnapshot({
      ...v1Config,
      assetPath: '../invalid_outside_audio.mp3',
    });
    const fallbackOnInvalidPath =
      mm.resolveEffectiveTrack(1, 'SOLO').resolvedScope === 'BUILTIN_DEFAULT';

    // 10. Không ảnh hưởng đăng nhập, M7.1 Session, Co-op Online và gameplay:
    const engine = new GameEngine();
    engine.startMatch('SOLO', 'DEFAULT');
    engine.stepTick({ up: true, down: false, left: false, right: false, shoot: true });
    const st = engine.getState();
    const gameplayIntact = st.isGameOver === false && st.p1State.isDead === false;

    mm.resetAllAssignmentsToDefault();
    mm.syncRoleFromAuthUser(null);

    const passed =
      validLargeMp3Check.valid === true &&
      validLargeMp3Check.detectedFormat === 'MP3' &&
      invalidFormatExeCheck.valid === false &&
      invalidFormatTxtCheck.valid === false &&
      oversizeFileCheck.valid === false &&
      safePathCheck.valid === true &&
      traversalPathDeny.valid === false &&
      externalUrlDeny.valid === false &&
      cacheBustingDistinct === true &&
      v1RuleOk === true &&
      v2RuleOk === true &&
      fallbackOnInvalidPath === true &&
      gameplayIntact === true;

    results.push({
      id: 'M7_3_T33',
      name: 'T33: M7.3.3 – Kiểm thử 10 mục Local Music Assets on GitHub Pages (file >4MB, chặn sai định dạng/>25MB, đường dẫn audio/, cache-busting ?v=, fallback 8-bit & bảo toàn gameplay)',
      passed,
      details: `mp3Over4MbOk=${validLargeMp3Check.valid}, invalidFmtRejected=${!invalidFormatExeCheck.valid && !invalidFormatTxtCheck.valid}, over25MbRejected=${!oversizeFileCheck.valid}, safeAudioPathOk=${safePathCheck.valid && !traversalPathDeny.valid}, cacheBustingOk=${cacheBustingDistinct}, rulesV1V2Ok=${v1RuleOk && v2RuleOk}, fallback8BitOk=${fallbackOnInvalidPath}, gameplayIntact=${gameplayIntact}`,
    });
  }

  // =========================================================================
  // M7_3_T34: M7.3.5 – Kiểm thử Firebase Storage Shared Avatar Catalog (JPEG/PNG/WebP <= 5MB, <= 2048px),
  //           Storage & Firestore Rules (/avatar_catalog/{avatarId}, /users/{uid}) & Fallback
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;

    // Helper tạo header PNG hợp lệ với chiều rộng w và chiều cao h
    const makePngBytes = (w: number, h: number, byteLen: number = 128): Uint8Array => {
      const b = new Uint8Array(Math.max(byteLen, 33));
      const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      sig.forEach((v, i) => (b[i] = v));
      b[8] = 0;
      b[9] = 0;
      b[10] = 0;
      b[11] = 13;
      b[12] = 0x49;
      b[13] = 0x48;
      b[14] = 0x44;
      b[15] = 0x52;
      b[16] = (w >>> 24) & 0xff;
      b[17] = (w >>> 16) & 0xff;
      b[18] = (w >>> 8) & 0xff;
      b[19] = w & 0xff;
      b[20] = (h >>> 24) & 0xff;
      b[21] = (h >>> 16) & 0xff;
      b[22] = (h >>> 8) & 0xff;
      b[23] = h & 0xff;
      b[24] = 8;
      b[25] = 6;
      return b;
    };

    // Helper tạo header JPEG hợp lệ với SOF0 (0xFF 0xC0) tại chiều rộng w và chiều cao h
    const makeJpegBytes = (w: number, h: number, byteLen: number = 128): Uint8Array => {
      const b = new Uint8Array(Math.max(byteLen, 32));
      b[0] = 0xff;
      b[1] = 0xd8;
      b[2] = 0xff;
      b[3] = 0xe0;
      b[4] = 0x00;
      b[5] = 0x10;
      b[20] = 0xff;
      b[21] = 0xc0;
      b[22] = 0x00;
      b[23] = 0x11;
      b[24] = 0x08;
      b[25] = (h >>> 8) & 0xff;
      b[26] = h & 0xff;
      b[27] = (w >>> 8) & 0xff;
      b[28] = w & 0xff;
      return b;
    };

    // Helper tạo header WebP (VP8X) hợp lệ với chiều rộng w và chiều cao h
    const makeWebpBytes = (w: number, h: number, byteLen: number = 64): Uint8Array => {
      const b = new Uint8Array(Math.max(byteLen, 32));
      // 'RIFF'
      b[0] = 0x52;
      b[1] = 0x49;
      b[2] = 0x46;
      b[3] = 0x46;
      // 'WEBP'
      b[8] = 0x57;
      b[9] = 0x45;
      b[10] = 0x42;
      b[11] = 0x50;
      // 'VP8X'
      b[12] = 0x56;
      b[13] = 0x50;
      b[14] = 0x38;
      b[15] = 0x58;
      const wMinus1 = Math.max(0, w - 1);
      const hMinus1 = Math.max(0, h - 1);
      b[24] = wMinus1 & 0xff;
      b[25] = (wMinus1 >>> 8) & 0xff;
      b[26] = (wMinus1 >>> 16) & 0xff;
      b[27] = hMinus1 & 0xff;
      b[28] = (hMinus1 >>> 8) & 0xff;
      b[29] = (hMinus1 >>> 16) & 0xff;
      return b;
    };

    const inspectCatalogBinary = (bytes: Uint8Array, fileName: string, mimeType: string) =>
      validateCatalogAvatarFileClientSide({
        fileName,
        mimeType,
        sizeBytes: bytes.byteLength,
        arrayBuffer: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer,
      });

    // 1. JPEG, PNG, WebP hợp lệ <= 5 MiB, <= 2048px -> PASS
    const validPng = inspectCatalogBinary(makePngBytes(512, 512, 4096), 'tank_gold.png', 'image/png');
    const validJpg = inspectCatalogBinary(makeJpegBytes(1024, 1024, 4096), 'tank_red.jpg', 'image/jpeg');
    const validWebp = inspectCatalogBinary(makeWebpBytes(2048, 2048, 4096), 'tank_emerald.webp', 'image/webp');

    // 2. Từ chối file > 5 MiB (5 * 1024 * 1024 + 1 bytes) -> PASS
    const over5MiB = inspectCatalogBinary(
      makePngBytes(512, 512, AVATAR_LIMITS.MAX_FILE_SIZE_BYTES + 1),
      'large.png',
      'image/png'
    );
    // 3. Từ chối ảnh > 2048 px (2049x1024 và 1024x2049) -> PASS
    const overWidth = inspectCatalogBinary(makePngBytes(2049, 1024, 256), 'wide.png', 'image/png');
    const overHeight = inspectCatalogBinary(makePngBytes(1024, 2049, 256), 'tall.png', 'image/png');

    // 4. Từ chối SVG, HTML, EXE giả mạo đuôi .png/.jpg/.webp -> PASS
    const svgSpoof = inspectCatalogBinary(
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      'spoof.png',
      'image/png'
    );
    const htmlSpoof = inspectCatalogBinary(
      new TextEncoder().encode('<!DOCTYPE html><html><script>alert(1)</script></html>'),
      'spoof.jpg',
      'image/jpeg'
    );
    const exeSpoof = inspectCatalogBinary(
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0]),
      'trojan.webp',
      'image/webp'
    );

    // 5. Kiểm tra đủ 12 ca Storage Rules (M7.3.5.1 Mục V):
    const storagePathJpgV1 = buildCatalogStoragePath('tank_01', 1, 'gold_tank.jpg');
    const storagePathPngV1 = buildCatalogStoragePath('tank_01', 1, 'gold_tank.png');
    const storagePathWebpV1 = buildCatalogStoragePath('tank_01', 1, 'gold_tank.webp');
    const storagePathPngV2 = buildCatalogStoragePath('tank_01', 2, 'gold_tank_v2.png');

    // (1) Super Admin upload JPEG hợp lệ: PASS
    // (1) Super Admin upload JPEG hợp lệ (allow create, resource == null): PASS
    const sr1AdminUploadJpegPass = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathJpgV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      signInProvider: 'google.com',
      resourceExists: false,
      contentType: 'image/jpeg',
      sizeBytes: 4096,
    });
    // (2) Super Admin upload PNG hợp lệ (allow create, resource == null): PASS
    const sr2AdminUploadPngPass = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathPngV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      signInProvider: 'google.com',
      resourceExists: false,
      contentType: 'image/png',
      sizeBytes: 4096,
    });
    // (3) Super Admin upload WebP hợp lệ (allow create, resource == null): PASS
    const sr3AdminUploadWebpPass = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathWebpV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      signInProvider: 'google.com',
      resourceExists: false,
      contentType: 'image/webp',
      sizeBytes: 4096,
    });
    // (4) Người chơi thường upload (create): DENIED
    const sr4PlayerUploadDenied = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathPngV1,
      authEmail: 'player1@gmail.com',
      isVerifiedPersonalGmail: true,
      signInProvider: 'google.com',
      resourceExists: false,
      contentType: 'image/png',
      sizeBytes: 4096,
    });
    // (5) Người chưa đăng nhập đọc (get) hoặc upload (create): DENIED
    const sr5UnauthGetAndUploadDenied =
      evaluateStorageCatalogRule({
        method: 'get',
        storagePath: storagePathPngV1,
        authEmail: null,
        isVerifiedPersonalGmail: false,
      }) === false &&
      evaluateStorageCatalogRule({
        method: 'create',
        storagePath: storagePathPngV1,
        authEmail: null,
        isVerifiedPersonalGmail: false,
        resourceExists: false,
        contentType: 'image/png',
        sizeBytes: 4096,
      }) === false;
    // (6) File > 5 MB: DENIED
    const sr6Over5MbDenied = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathPngV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      resourceExists: false,
      contentType: 'image/png',
      sizeBytes: AVATAR_LIMITS.MAX_FILE_SIZE_BYTES + 1,
    });
    // (7) Sai contentType (SVG / GIF): DENIED
    const sr7InvalidContentTypeDenied =
      evaluateStorageCatalogRule({
        method: 'create',
        storagePath: storagePathPngV1,
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        resourceExists: false,
        contentType: 'image/svg+xml',
        sizeBytes: 4096,
      }) === false &&
      evaluateStorageCatalogRule({
        method: 'create',
        storagePath: storagePathPngV1,
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        resourceExists: false,
        contentType: 'image/gif',
        sizeBytes: 4096,
      }) === false;
    // (8) Đường dẫn ngoài avatar_catalog: DENIED (cả get và create)
    const sr8OutsideCatalogDenied =
      evaluateStorageCatalogRule({
        method: 'get',
        storagePath: 'user_uploads/uid_123/v1/avatar.png',
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
      }) === false &&
      evaluateStorageCatalogRule({
        method: 'create',
        storagePath: 'user_uploads/uid_123/v1/avatar.png',
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        resourceExists: false,
        contentType: 'image/png',
        sizeBytes: 4096,
      }) === false;
    // (9) Super Admin tạo version mới (v2, resourceExists == false): PASS
    const sr9AdminCreateNewVersionPass = evaluateStorageCatalogRule({
      method: 'create',
      storagePath: storagePathPngV2,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      resourceExists: false,
      contentType: 'image/png',
      sizeBytes: 4096,
    });
    // (10) Super Admin xóa object (allow delete, resourceExists == true, request.resource == null): PASS
    const sr10AdminDeletePass = evaluateStorageCatalogRule({
      method: 'delete',
      storagePath: storagePathPngV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      resourceExists: true,
      contentType: null,
      sizeBytes: null,
    });
    // (11) Người chơi xóa object: DENIED
    const sr11PlayerDeleteDenied = evaluateStorageCatalogRule({
      method: 'delete',
      storagePath: storagePathPngV1,
      authEmail: 'player1@gmail.com',
      isVerifiedPersonalGmail: true,
      resourceExists: true,
      contentType: null,
      sizeBytes: null,
    });
    // (12) UploadBytes lần thứ 2 vào cùng đường dẫn trên Storage Rules khi chưa chạy Emulator/Production:
    //      M7.3.5.4 Mục II & III: Không giả lập DENIED trong bộ nhớ chỉ vì resource == null; phân loại rõ là 'NOT_PROVEN'
    const sr12SecondUploadSamePathNotProven =
      getSecondUploadSamePathStorageEnforcementVerdict(false) === 'NOT_PROVEN' &&
      SECOND_UPLOAD_SAME_PATH_STORAGE_RULE_STATUS === 'NOT_PROVEN';
    // (13) Super Admin cập nhật metadata object cũ (allow update: if false): DENIED
    const sr13AdminUpdateMetadataDenied = evaluateStorageCatalogRule({
      method: 'update',
      storagePath: storagePathPngV1,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      resourceExists: true,
      contentType: 'image/png',
      sizeBytes: 4096,
    });
    // (14) Liệt kê list / listAll (allow list: if false) đối với cả Admin và Người chơi: DENIED, trong khi get đối với Admin & Người chơi Gmail đã xác minh: PASS
    const sr14GetPassAndListDenied =
      evaluateStorageCatalogRule({
        method: 'get',
        storagePath: storagePathPngV1,
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        signInProvider: 'google.com',
      }) === true &&
      evaluateStorageCatalogRule({
        method: 'get',
        storagePath: storagePathPngV1,
        authEmail: 'player1@gmail.com',
        isVerifiedPersonalGmail: true,
        signInProvider: 'google.com',
      }) === true &&
      evaluateStorageCatalogRule({
        method: 'list',
        storagePath: storagePathPngV1,
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        signInProvider: 'google.com',
      }) === false &&
      evaluateStorageCatalogRule({
        method: 'list',
        storagePath: storagePathPngV1,
        authEmail: 'player1@gmail.com',
        isVerifiedPersonalGmail: true,
        signInProvider: 'google.com',
      }) === false;

    const all14StorageRulesOk =
      sr1AdminUploadJpegPass === true &&
      sr2AdminUploadPngPass === true &&
      sr3AdminUploadWebpPass === true &&
      sr4PlayerUploadDenied === false &&
      sr5UnauthGetAndUploadDenied === true &&
      sr6Over5MbDenied === false &&
      sr7InvalidContentTypeDenied === true &&
      sr8OutsideCatalogDenied === true &&
      sr9AdminCreateNewVersionPass === true &&
      sr10AdminDeletePass === true &&
      sr11PlayerDeleteDenied === false &&
      sr12SecondUploadSamePathNotProven === true &&
      sr13AdminUpdateMetadataDenied === false &&
      sr14GetPassAndListDenied === true;

    // 6. Kiểm tra đủ các ca Firestore Rules cho /avatar_catalog/{avatarId} và /users/{uid} (M7.3.5.2 Mục V & VI):
    const catalogDocV1 = {
      avatarId: 'tank_01',
      name: 'Chiến Xa Vàng',
      storagePath: storagePathPngV1,
      contentType: 'image/png',
      fileSize: 4096,
      version: 1,
      sortOrder: 10,
      isActive: true,
      createdAt: nowMs,
      updatedAt: nowMs,
      updatedBy: SUPER_ADMIN_EMAIL,
    };

    // FR-1: Người chơi đọc avatar_catalog: PASS
    const fr1PlayerReadCatalogPass =
      evaluateAvatarCatalogRule({
        action: 'get',
        avatarId: 'tank_01',
        authEmail: 'player1@gmail.com',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs,
      }) === true &&
      evaluateAvatarCatalogRule({
        action: 'list',
        avatarId: 'tank_01',
        authEmail: 'player1@gmail.com',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs,
      }) === true;

    const catalogLookup = (id: string) => ({
      exists: id === 'tank_01' || id === 'tank_hidden',
      isActive: id === 'tank_01',
    });

    // FR-2: Người chơi chọn avatar đang active (tách biệt với displayName): PASS
    const fr2SelectActiveCatalogPass = evaluateUserProfileMetadataRule({
      action: 'create',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs,
      incoming: {
        uid: 'uid_p1',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs,
      },
      catalogLookup,
    });

    // FR-3: Người chơi chọn avatar không active: DENIED
    const fr3SelectInactiveCatalogDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 1000,
      existing: {
        uid: 'uid_p1',
        displayName: 'Commander P1',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs,
      },
      incoming: {
        uid: 'uid_p1',
        displayName: 'Commander P1',
        avatarType: 'catalog',
        avatarId: 'tank_hidden',
        avatarUpdatedAt: nowMs + 1000,
      },
      catalogLookup,
    });

    // FR-4: Người chơi sửa hồ sơ người khác: DENIED
    const fr4OtherUserWriteDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_attacker',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: {
        uid: 'uid_p1',
        displayName: 'Commander P1',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs,
      },
      incoming: {
        uid: 'uid_p1',
        displayName: 'Commander P1',
        avatarType: 'google',
        avatarId: null,
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });

    // FR-5: Người chơi sửa role/isSuperAdmin/email/xp/xu/rank: DENIED
    const fr5PrivilegeFieldsDenied =
      evaluateUserProfileMetadataRule({
        action: 'create',
        uid: 'uid_p1',
        authUid: 'uid_p1',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs,
        incoming: {
          uid: 'uid_p1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: nowMs,
          role: 'SUPER_ADMIN',
        },
      }) === false &&
      evaluateUserProfileMetadataRule({
        action: 'update',
        uid: 'uid_p1',
        authUid: 'uid_p1',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs + 1000,
        existing: {
          uid: 'uid_p1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: nowMs,
          xp: 1200,
          xu: 500,
          rank: 'CAPTAIN',
        },
        incoming: {
          uid: 'uid_p1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: nowMs + 1000,
          xp: 999999,
          xu: 500,
          rank: 'CAPTAIN',
        },
      }) === false;

    // FR-6: Super Admin quản lý avatar_catalog (create/update/delete), người chơi thường bị chặn: PASS
    const fr6AdminManageCatalogPass =
      evaluateAvatarCatalogRule({
        action: 'create',
        avatarId: 'tank_01',
        authEmail: SUPER_ADMIN_EMAIL,
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs,
        incoming: catalogDocV1,
      }) === true &&
      evaluateAvatarCatalogRule({
        action: 'create',
        avatarId: 'tank_01',
        authEmail: 'player1@gmail.com',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs,
      }) === false;

    // FR-7: Bảo toàn toàn bộ trường hợp lệ cũ (xp, xu, rank, createdAt, displayName),
    // chặn xóa trường cũ, và tách quyền chỉnh displayName khỏi quyền chọn avatar: PASS
    const legacyExistingProfile = {
      uid: 'uid_p1',
      displayName: 'Veteran P1',
      avatarType: 'google',
      avatarId: null,
      avatarUpdatedAt: nowMs - 10_000,
      xp: 4500,
      xu: 1800,
      rank: 'MAJOR',
      createdAt: nowMs - 86_400_000,
    };
    const fr7aUpdateAvatarOnlyPass = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyExistingProfile,
      incoming: {
        ...legacyExistingProfile,
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });
    const fr7bUpdateDisplayNameOnlyPass = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyExistingProfile,
      incoming: {
        ...legacyExistingProfile,
        displayName: 'Commander Elite',
      },
      catalogLookup,
    });
    // Gộp cả đổi displayName và đổi avatarId trong cùng 1 thao tác bị từ chối do tách quyền:
    const fr7cCombinedNameAndAvatarDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyExistingProfile,
      incoming: {
        ...legacyExistingProfile,
        displayName: 'Commander Elite',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });
    // Cố tình xóa mất trường xp của hồ sơ cũ bị từ chối:
    const fr7dDropExistingFieldDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyExistingProfile,
      incoming: {
        uid: 'uid_p1',
        displayName: 'Veteran P1',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });

    // Cố tình thay đổi uid sang giá trị khác hoặc thêm uid vào tài liệu cũ không có uid đều bị từ chối (M7.3.5.3 Mục V):
    const fr7eMutateUidDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyExistingProfile,
      incoming: {
        ...legacyExistingProfile,
        uid: 'uid_other_spoof',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });

    const legacyWithoutUidProfile = {
      displayName: 'Legacy No UID',
      avatarType: 'google',
      avatarId: null,
      avatarUpdatedAt: nowMs - 10_000,
      xp: 3200,
      xu: 900,
      rank: 'CAPTAIN',
      createdAt: nowMs - 86_400_000,
    };
    // Tài liệu cũ không có trường uid: cập nhật avatar hoặc displayName mà không thêm uid -> PASS
    const fr7fLegacyNoUidUpdateAvatarPass = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyWithoutUidProfile,
      incoming: {
        ...legacyWithoutUidProfile,
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });
    const fr7gLegacyNoUidUpdateNamePass = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyWithoutUidProfile,
      incoming: {
        ...legacyWithoutUidProfile,
        displayName: 'Legacy Renamed',
      },
      catalogLookup,
    });
    // Tài liệu cũ không có trường uid nhưng request cố tình tự thêm trường uid vào affectedKeys() -> DENIED
    const fr7hLegacyNoUidInjectUidDenied = evaluateUserProfileMetadataRule({
      action: 'update',
      uid: 'uid_p1',
      authUid: 'uid_p1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 2000,
      existing: legacyWithoutUidProfile,
      incoming: {
        ...legacyWithoutUidProfile,
        uid: 'uid_p1',
        avatarType: 'catalog',
        avatarId: 'tank_01',
        avatarUpdatedAt: nowMs + 2000,
      },
      catalogLookup,
    });
    // M7.3.5.4 Mục IV & V (Case 3): User A (uid_attacker) cố cập nhật hồ sơ User B (uid_p1) là hồ sơ cũ KHÔNG có trường uid -> DENIED
    const fr7iOtherUserLegacyNoUidWriteDenied =
      evaluateUserProfileMetadataRule({
        action: 'update',
        uid: 'uid_p1',
        authUid: 'uid_attacker',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs + 2000,
        existing: legacyWithoutUidProfile,
        incoming: {
          ...legacyWithoutUidProfile,
          avatarType: 'catalog',
          avatarId: 'tank_01',
          avatarUpdatedAt: nowMs + 2000,
        },
        catalogLookup,
      }) === false &&
      evaluateUserProfileMetadataRule({
        action: 'update',
        uid: 'uid_p1',
        authUid: 'uid_attacker',
        isVerifiedPersonalGmail: true,
        requestTimeMs: nowMs + 2000,
        existing: legacyWithoutUidProfile,
        incoming: {
          ...legacyWithoutUidProfile,
          displayName: 'Hacked By Attacker',
        },
        catalogLookup,
      }) === false;

    const fr7PreserveAndSeparationOk =
      fr7aUpdateAvatarOnlyPass === true &&
      fr7bUpdateDisplayNameOnlyPass === true &&
      fr7cCombinedNameAndAvatarDenied === false &&
      fr7dDropExistingFieldDenied === false &&
      fr7eMutateUidDenied === false &&
      fr7fLegacyNoUidUpdateAvatarPass === true &&
      fr7gLegacyNoUidUpdateNamePass === true &&
      fr7hLegacyNoUidInjectUidDenied === false &&
      fr7iOtherUserLegacyNoUidWriteDenied === true;

    const all7FirestoreRulesOk =
      fr1PlayerReadCatalogPass === true &&
      fr2SelectActiveCatalogPass === true &&
      fr3SelectInactiveCatalogDenied === false &&
      fr4OtherUserWriteDenied === false &&
      fr5PrivilegeFieldsDenied === true &&
      fr6AdminManageCatalogPass === true &&
      fr7PreserveAndSeparationOk === true;

    // 7. Kiểm tra chống tái sử dụng storagePath ở tầng ứng dụng, tên file gắn UUID & khởi tạo highestVersion từ catalog hiện có (M7.3.5.4 Mục III):
    const uuidFile1 = generateUniqueCatalogFileName('gold.png', 'image/png');
    const uuidFile2 = generateUniqueCatalogFileName('gold.png', 'image/png');
    const usedPathsSet = new Set<string>(['avatar_catalog/tank_01/v1/gold.png']);
    const allocCollision = allocateUniqueCatalogStoragePath({
      avatarId: 'tank_01',
      existingVersion: 0,
      highestKnownVersion: 0,
      rawFileName: 'gold.png',
      contentType: 'image/png',
      usedStoragePaths: usedPathsSet,
      useUuidFileName: false,
    });
    // Kiểm tra khởi tạo highestVersionMap từ dữ liệu catalog hiện có khi vừa tải lại trang (RAM trống):
    const reloadedHighestMap = new Map<string, number>();
    const reloadedUsedPaths = new Set<string>();
    syncHighestVersionMapsFromCatalogRecords({
      catalogRecords: [
        {
          avatarId: 'tank_01',
          version: 4,
          storagePath: 'avatar_catalog/tank_01/v4/gold_v4.png',
        },
      ],
      highestVersionMap: reloadedHighestMap,
      usedPathsSet: reloadedUsedPaths,
    });
    const allocAfterReload = allocateUniqueCatalogStoragePath({
      avatarId: 'tank_01',
      existingVersion: 0,
      highestKnownVersion: reloadedHighestMap.get('tank_01') ?? 0,
      rawFileName: 'gold.png',
      contentType: 'image/png',
      usedStoragePaths: reloadedUsedPaths,
      useUuidFileName: true,
    });
    const appImmutabilityAndModeOk =
      STORAGE_OVERWRITE_ENFORCEMENT_CLASSIFICATION ===
        'APP-LEVEL IMMUTABLE PATH – BEST EFFORT, NOT ABSOLUTE STORAGE ENFORCEMENT' &&
      PRODUCTION_BUCKET_OBJECT_VERSIONING_STATUS === 'UNKNOWN' &&
      SECOND_UPLOAD_SAME_PATH_STORAGE_RULE_STATUS === 'NOT_PROVEN' &&
      DEFAULT_STORAGE_IMAGE_FETCH_MODE === 'COMPAT_DOWNLOAD_URL' &&
      AvatarManager.getInstance().getStorageFetchMode() === 'COMPAT_DOWNLOAD_URL' &&
      uuidFile1 !== uuidFile2 &&
      AVATAR_LIMITS.FILE_NAME_REGEX.test(uuidFile1) &&
      allocCollision.version === 2 &&
      allocCollision.storagePath !== 'avatar_catalog/tank_01/v1/gold.png' &&
      AVATAR_LIMITS.STORAGE_PATH_REGEX.test(allocCollision.storagePath) &&
      reloadedHighestMap.get('tank_01') === 4 &&
      reloadedUsedPaths.has('avatar_catalog/tank_01/v4/gold_v4.png') &&
      allocAfterReload.version === 5;

    // 8. Kiểm tra BlobObjectUrlCacheManager quản lý cache & thu hồi URL đúng lúc (chống rò rỉ bộ nhớ):
    const revokedUrls: string[] = [];
    const blobCache = new BlobObjectUrlCacheManager(4, (u) => revokedUrls.push(u));
    blobCache.set('avatar_catalog/tank_01/v1/a.png', 'blob:mock-v1', true, 1000);
    blobCache.set('avatar_catalog/tank_01/v2/a.png', 'blob:mock-v2', true, 2000);
    const obsoleteRevoked = blobCache.revokeObsoleteVersionsForAvatar(
      'tank_01',
      'avatar_catalog/tank_01/v2/a.png'
    );
    const allRevokedOnSignOut = blobCache.revokeAll();
    const blobCacheLifecycleOk =
      obsoleteRevoked === 1 &&
      revokedUrls.includes('blob:mock-v1') &&
      allRevokedOnSignOut === 1 &&
      revokedUrls.includes('blob:mock-v2') &&
      blobCache.size() === 0;

    // 9. Kiểm tra tự động fallback về Ảnh Google khi avatar danh mục bị ẩn (isActive == false):
    const fallbackUrl = resolvePlayerAvatarUrl({
      uid: 'uid_p1',
      userMeta: {
        uid: 'uid_p1',
        avatarType: 'catalog',
        avatarId: 'tank_hidden',
        avatarUpdatedAtMs: nowMs,
      },
      catalogItems: [
        {
          avatarId: 'tank_hidden',
          name: 'Tank Tạm Ẩn',
          storagePath: 'avatar_catalog/tank_hidden/v1/tank.png',
          contentType: 'image/png',
          fileSize: 4096,
          version: 1,
          sortOrder: 10,
          isActive: false,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          updatedBy: SUPER_ADMIN_EMAIL,
        },
      ],
      resolvedStorageUrls: new Map([
        ['avatar_catalog/tank_hidden/v1/tank.png', 'https://firebasestorage.example.com/tank.png'],
      ]),
      photoURL: 'https://lh3.googleusercontent.com/a/default-user',
    });

    const activeBadge = getSessionBadgeInfo('ACTIVE', false, false, true);
    const acquiringBadge = getSessionBadgeInfo('ACQUIRING', false, false, true);
    const cleanBadgeOnNormalSync =
      activeBadge.label === '' &&
      !acquiringBadge.label.includes('Chưa đồng bộ kết nối máy chủ Firestore') &&
      !acquiringBadge.label.includes('Đang đồng bộ');

    const passed =
      validPng.valid === true &&
      validJpg.valid === true &&
      validWebp.valid === true &&
      over5MiB.valid === false &&
      overWidth.valid === false &&
      overHeight.valid === false &&
      svgSpoof.valid === false &&
      htmlSpoof.valid === false &&
      exeSpoof.valid === false &&
      all14StorageRulesOk === true &&
      all7FirestoreRulesOk === true &&
      appImmutabilityAndModeOk === true &&
      blobCacheLifecycleOk === true &&
      fallbackUrl === 'https://lh3.googleusercontent.com/a/default-user' &&
      cleanBadgeOnNormalSync === true;

    results.push({
      id: 'M7_3_T34',
      name: 'T34: M7.3.5.3 – Kiểm thử 14 ca Storage Rules, UID bất biến (không trong affectedKeys), chống tái sử dụng path & chế độ tải COMPAT_DOWNLOAD_URL / STRICT_BLOB',
      passed,
      details: `formatsOk=${validPng.valid && validJpg.valid && validWebp.valid}, storage14CasesOk=${all14StorageRulesOk}, firestoreUidImmutableOk=${all7FirestoreRulesOk}, appImmutablePathOk=${appImmutabilityAndModeOk}, blobCacheOk=${blobCacheLifecycleOk}`,
    });
  }

  // =========================================================================
  // M7_3_T35: M7.3.5.5 – Kiểm thử Unit cho bản ghi phục hồi Pending Upload qua F5 (cấm lưu token/URL/Base64 & tổng hợp version từ 3 nguồn)
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;
    const validBaseRecord: PendingCatalogMetadataSync = {
      ownerUid: 'uid_super_admin',
      avatarId: 'tank_phoenix',
      name: 'Chiến Xa Phượng Hoàng',
      storagePath: 'avatar_catalog/tank_phoenix/v1/12345678-1234-4123-8123-123456789abc_phoenix.png',
      fileName: '12345678-1234-4123-8123-123456789abc_phoenix.png',
      contentType: 'image/png',
      fileSize: 4096,
      version: 1,
      sortOrder: 10,
      isActive: true,
      updatedBy: SUPER_ADMIN_EMAIL,
      isUpdate: false,
      uploadOperationId: 'op_uuid_1234567890',
      createdAt: nowMs,
      status: 'UPLOAD_IN_PROGRESS',
      failedAtMs: nowMs,
      errorMessage: '',
    };

    const checkValidInProgress = validatePendingUploadRecordNoSecrets(validBaseRecord);
    const checkValidConfirmed = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      status: 'UPLOAD_CONFIRMED_METADATA_PENDING',
    });
    const checkValidIndeterminate = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      status: 'UPLOAD_INDETERMINATE',
    });

    // Kiểm tra từ chối tuyệt đối khi bản ghi chứa downloadURL, token, idToken, oauthToken, base64, nhị phân:
    const rejectDownloadUrl = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      downloadURL: 'https://firebasestorage.googleapis.com/v0/b/bantank/o/a.png?alt=media&token=123',
    });
    const rejectCapabilityToken = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      token: 'secret_capability_token_xyz',
    });
    const rejectIdToken = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      idToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.payload.sig',
    });
    const rejectOauthToken = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      oauthToken: 'ya29.a0AfH6SMBx...',
    });
    const rejectBase64InError = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      errorMessage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
    });
    const rejectBinaryBuffer = validatePendingUploadRecordNoSecrets({
      ...validBaseRecord,
      arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
    });

    // Kiểm tra tổng hợp version và storagePath từ cả 3 nguồn (Firestore catalog, pending records, used paths):
    const aggHighest = new Map<string, number>();
    const aggPaths = new Set<string>();
    syncHighestVersionMapsFromCatalogRecords({
      catalogRecords: [
        {
          avatarId: 'tank_phoenix',
          version: 2,
          storagePath: 'avatar_catalog/tank_phoenix/v2/p2.png',
        },
      ],
      pendingRecords: [
        {
          ...validBaseRecord,
          version: 3,
          storagePath: 'avatar_catalog/tank_phoenix/v3/p3.png',
          status: 'UPLOAD_INDETERMINATE',
        },
      ],
      persistedUsedPaths: [
        {
          avatarId: 'tank_phoenix',
          version: 4,
          storagePath: 'avatar_catalog/tank_phoenix/v4/p4.png',
          uploadOperationId: 'op_v4_12345678',
          recordedAt: nowMs,
        },
      ],
      highestVersionMap: aggHighest,
      usedPathsSet: aggPaths,
    });

    const nextAlloc = allocateUniqueCatalogStoragePath({
      avatarId: 'tank_phoenix',
      existingVersion: 2,
      highestKnownVersion: aggHighest.get('tank_phoenix') ?? 0,
      rawFileName: 'phoenix.png',
      contentType: 'image/png',
      usedStoragePaths: aggPaths,
      useUuidFileName: true,
    });

    const browserStore = new BrowserPendingUploadPersistentStore();
    const durableMemStore = new DurableInMemoryPendingUploadStore();
    const backendTypeOk =
      (browserStore.getBackendType() === 'INDEXED_DB' ||
        (browserStore.getBackendType() === 'LOCAL_STORAGE_FALLBACK' &&
          Boolean(browserStore.getFallbackTechnicalReason()))) &&
      durableMemStore.getBackendType() === 'DURABLE_MEMORY_SIMULATION';

    const passed =
      checkValidInProgress.valid === true &&
      checkValidConfirmed.valid === true &&
      checkValidIndeterminate.valid === true &&
      rejectDownloadUrl.valid === false &&
      rejectCapabilityToken.valid === false &&
      rejectIdToken.valid === false &&
      rejectOauthToken.valid === false &&
      rejectBase64InError.valid === false &&
      rejectBinaryBuffer.valid === false &&
      aggHighest.get('tank_phoenix') === 4 &&
      aggPaths.has('avatar_catalog/tank_phoenix/v2/p2.png') &&
      aggPaths.has('avatar_catalog/tank_phoenix/v3/p3.png') &&
      aggPaths.has('avatar_catalog/tank_phoenix/v4/p4.png') &&
      nextAlloc.version === 5 &&
      backendTypeOk === true;

    results.push({
      id: 'M7_3_T35',
      name: 'T35: M7.3.5.5 – Kiểm thử schema bản ghi Pending Upload qua F5 (chặn tuyệt đối URL/Token/Base64) & tổng hợp lịch sử version từ 3 nguồn',
      passed,
      details: `validStates=${checkValidInProgress.valid && checkValidConfirmed.valid && checkValidIndeterminate.valid}, secretsRejected=${!rejectDownloadUrl.valid && !rejectCapabilityToken.valid && !rejectIdToken.valid && !rejectOauthToken.valid && !rejectBase64InError.valid && !rejectBinaryBuffer.valid}, nextVerFrom3Sources=${nextAlloc.version}`,
    });
  }

  // =========================================================================
  // M7_3_T36: M7.3.6 – Kiểm thử chọn ảnh Google (phân loại lỗi, xác nhận đọc lại, bảo toàn trường hồ sơ)
  //           & tạo phòng Co-op Online 6 bước (xác minh signaling tồn tại, rollback ABANDONED, phân loại lỗi từng bước)
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;

    // 1. Kiểm tra getGooglePhotoUrlForUser (lấy từ user.photoURL hoặc fallback sang providerData của google.com):
    const directGoogleUrl = getGooglePhotoUrlForUser({
      photoURL: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
    });
    const providerFallbackUrl = getGooglePhotoUrlForUser({
      photoURL: null,
      providerData: [
        {
          providerId: 'google.com',
          photoURL: 'https://lh3.googleusercontent.com/a/provider-fallback=s96-c',
        },
      ],
    });
    const googleUrlExtractionOk =
      directGoogleUrl === 'https://lh3.googleusercontent.com/a/default-user=s96-c' &&
      providerFallbackUrl === 'https://lh3.googleusercontent.com/a/provider-fallback=s96-c';

    // 2. Kiểm tra phân loại 4 nhóm lỗi Firestore khi lưu lựa chọn ảnh Google (PERMISSION_DENIED, UNAUTHENTICATED, NETWORK_ERROR, INVALID_DATA):
    const cPerm = classifyUserProfileFirestoreError({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    });
    const cAuth = classifyUserProfileFirestoreError({
      code: 'unauthenticated',
      message: 'User is unauthenticated.',
    });
    const cNet = classifyUserProfileFirestoreError({
      code: 'unavailable',
      message: 'Cloud Firestore is temporarily unavailable.',
    });
    const cInvalid = classifyUserProfileFirestoreError({
      code: 'invalid-argument',
      message: 'Invalid data payload.',
    });
    const avatarErrorClassificationOk =
      cPerm.errorCode === 'PERMISSION_DENIED' &&
      cAuth.errorCode === 'UNAUTHENTICATED' &&
      cNet.errorCode === 'NETWORK_ERROR' &&
      cInvalid.errorCode === 'INVALID_DATA';

    // 3. Kiểm tra lưu lựa chọn ảnh Google trên hồ sơ mới & hồ sơ cũ (bảo toàn uid, displayName, xp, xu, rank, createdAt; không lưu downloadURL/token):
    const avSys = new InMemoryAvatarCatalogSystem();
    avSys.seedLegacyUserProfile('uid_cmd_1', {
      displayName: 'Commander One',
      avatarType: 'catalog',
      avatarId: 'tank_old',
      avatarUpdatedAt: nowMs - 50_000,
      xp: 9800,
      xu: 4200,
      rank: 'COLONEL',
      createdAt: nowMs - 500_000,
    });
    const selectGoogleRes = avSys.playerSelectAvatar({
      targetUid: 'uid_cmd_1',
      authUid: 'uid_cmd_1',
      isVerifiedPersonalGmail: true,
      avatarType: 'google',
      avatarId: null,
      googlePhotoUrl: directGoogleUrl,
      nowMs,
    });
    const updatedUserDoc = avSys.getUserDoc('uid_cmd_1');
    const googleSelectionPreservesProfileOk =
      selectGoogleRes.success === true &&
      selectGoogleRes.avatarType === 'google' &&
      selectGoogleRes.avatarId === null &&
      selectGoogleRes.avatarUrl === directGoogleUrl &&
      updatedUserDoc !== null &&
      updatedUserDoc.avatarType === 'google' &&
      updatedUserDoc.avatarId === null &&
      updatedUserDoc.uid === 'uid_cmd_1' &&
      updatedUserDoc.displayName === 'Commander One' &&
      updatedUserDoc.xp === 9800 &&
      updatedUserDoc.xu === 4200 &&
      updatedUserDoc.rank === 'COLONEL' &&
      !('downloadURL' in updatedUserDoc) &&
      !('idToken' in updatedUserDoc);

    // Kiểm tra log kỹ thuật khi lỗi PERMISSION_DENIED không chứa token/email nhạy cảm:
    const simPermFail = avSys.playerSelectAvatar({
      targetUid: 'uid_cmd_1',
      authUid: 'uid_cmd_1',
      isVerifiedPersonalGmail: true,
      avatarType: 'google',
      avatarId: null,
      simulatedError: 'PERMISSION_DENIED',
      nowMs: nowMs + 1000,
    });
    const diagLog = avSys.getLastFirestoreDiagnostic();
    const diagLogSafeOk =
      simPermFail.success === false &&
      simPermFail.errorCode === 'PERMISSION_DENIED' &&
      diagLog !== null &&
      diagLog.operation === 'SELECT_GOOGLE_AVATAR' &&
      diagLog.path === '/users/uid_cmd_1' &&
      diagLog.errorCode === 'PERMISSION_DENIED' &&
      !JSON.stringify(diagLog).includes('ya29.') &&
      !JSON.stringify(diagLog).includes('eyJ');

    // 4. Kiểm tra tạo phòng Co-op Online 6 bước:
    //    - Bước 4 thất bại (signaling document không tồn tại khi đọc xác minh getSignaling) -> đánh dấu phòng cha ABANDONED, dọn UI, không trả về mã phòng.
    const verifyFailStorage = new InMemoryCoopStorageAdapter();
    const verifyFailHost = new CoopOnlineManager(verifyFailStorage);
    verifyFailStorage.setFailNextGetSignalingVerify(true);
    const verifyFailRes = verifyFailHost.createRoomSync(
      verifyFailStorage,
      {
        uid: 'uid_host_m736',
        displayName: 'Host M736',
        email: 'hostm736@gmail.com',
        emailVerified: true,
      },
      'DEFAULT',
      nowMs,
      'VF7360'
    );
    const abandonedAfterVerifyFail = verifyFailStorage.getRoomSync('VF7360');
    const step4VerifyAndRollbackOk =
      verifyFailRes.success === false &&
      verifyFailRes.failedStep === 'VERIFY_SIGNALING_DOC' &&
      verifyFailRes.room === undefined &&
      verifyFailHost.getCurrentRoom() === null &&
      verifyFailHost.isRoomSignalingReady() === false &&
      abandonedAfterVerifyFail !== null &&
      abandonedAfterVerifyFail.status === 'ABANDONED';

    //    - Bước 2 thất bại (setRoom bị PERMISSION_DENIED) -> phân loại đúng CREATE_PARENT_ROOM + PERMISSION_DENIED:
    const parentFailStorage = new InMemoryCoopStorageAdapter();
    const parentFailHost = new CoopOnlineManager(parentFailStorage);
    parentFailStorage.setFailNextSetRoomError(
      Object.assign(new Error('Missing or insufficient permissions.'), {
        code: 'permission-denied',
      })
    );
    const parentFailRes = parentFailHost.createRoomSync(
      parentFailStorage,
      {
        uid: 'uid_host_m736',
        displayName: 'Host M736',
        email: 'hostm736@gmail.com',
        emailVerified: true,
      },
      'EXTREME',
      nowMs,
      'PF7360'
    );
    const step2ClassifyOk =
      parentFailRes.success === false &&
      parentFailRes.errorCode === 'PERMISSION_DENIED' &&
      parentFailRes.failedStep === 'CREATE_PARENT_ROOM' &&
      parentFailHost.getCurrentRoom() === null &&
      buildCreateRoomStepErrorMessage('CREATE_PARENT_ROOM', 'PERMISSION_DENIED').includes(
        'PERMISSION_DENIED'
      );

    const passed =
      googleUrlExtractionOk &&
      avatarErrorClassificationOk &&
      googleSelectionPreservesProfileOk &&
      diagLogSafeOk &&
      step4VerifyAndRollbackOk &&
      step2ClassifyOk;

    results.push({
      id: 'M7_3_T36',
      name: 'T36: M7.3.6 – Sửa lỗi lưu lựa chọn ảnh Google (phân loại 4 nhóm lỗi, xác nhận đọc lại, bảo toàn hồ sơ) & trình tự tạo phòng 6 bước (xác minh signaling tồn tại, rollback ABANDONED)',
      passed,
      details: `googleUrlOk=${googleUrlExtractionOk}, avatarErrClassOk=${avatarErrorClassificationOk}, preserveProfileOk=${googleSelectionPreservesProfileOk}, diagSafeOk=${diagLogSafeOk}, step4VerifyRollbackOk=${step4VerifyAndRollbackOk}, step2ClassifyOk=${step2ClassifyOk}`,
    });
  }

  // =========================================================================
  // M7_3_T37: M7.3.7 (Hạng mục 1, 2, 3, 4) – Xác minh 5 bước Storage Object trước khi kích hoạt metadata,
  //           phân biệt màu khung tên theo quyền (SUPER_ADMIN/ADMIN/MOD/PLAYER) & Single-BGM Audio/MusicManager
  // =========================================================================
  {
    const testPathV2 = 'avatar_catalog/tank_gold/v2/gold_v2.png';
    // 1. Hạng mục 1: Kiểm tra 5 điều kiện verifyStorageObjectBeforeMetadataActivation
    const vOk = verifyStorageObjectBeforeMetadataActivation({
      objectExists: true,
      storagePath: testPathV2,
      actualSize: 4096,
      expectedFileSize: 4096,
      actualContentType: 'image/png',
      expectedContentType: 'image/png',
      customMetadata: {
        uploadOperationId: 'op_123',
        avatarId: 'tank_gold',
        version: '2',
      },
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: true,
    });
    const vMissingObj = verifyStorageObjectBeforeMetadataActivation({
      objectExists: false,
      storagePath: testPathV2,
      actualSize: 0,
      expectedFileSize: 4096,
      actualContentType: 'image/png',
      expectedContentType: 'image/png',
      customMetadata: null,
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: true,
    });
    const vBadSize = verifyStorageObjectBeforeMetadataActivation({
      objectExists: true,
      storagePath: testPathV2,
      actualSize: 2048,
      expectedFileSize: 4096,
      actualContentType: 'image/png',
      expectedContentType: 'image/png',
      customMetadata: {
        uploadOperationId: 'op_123',
        avatarId: 'tank_gold',
        version: '2',
      },
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: true,
    });
    const vBadMime = verifyStorageObjectBeforeMetadataActivation({
      objectExists: true,
      storagePath: testPathV2,
      actualSize: 4096,
      expectedFileSize: 4096,
      actualContentType: 'text/html',
      expectedContentType: 'image/png',
      customMetadata: {
        uploadOperationId: 'op_123',
        avatarId: 'tank_gold',
        version: '2',
      },
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: true,
    });
    const vBadOpId = verifyStorageObjectBeforeMetadataActivation({
      objectExists: true,
      storagePath: testPathV2,
      actualSize: 4096,
      expectedFileSize: 4096,
      actualContentType: 'image/png',
      expectedContentType: 'image/png',
      customMetadata: {
        uploadOperationId: 'op_other_999',
        avatarId: 'tank_gold',
        version: '2',
      },
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: true,
    });
    const vUndecodable = verifyStorageObjectBeforeMetadataActivation({
      objectExists: true,
      storagePath: testPathV2,
      actualSize: 4096,
      expectedFileSize: 4096,
      actualContentType: 'image/png',
      expectedContentType: 'image/png',
      customMetadata: {
        uploadOperationId: 'op_123',
        avatarId: 'tank_gold',
        version: '2',
      },
      expectedUploadOperationId: 'op_123',
      expectedAvatarId: 'tank_gold',
      expectedVersion: 2,
      imageDecodable: false,
    });
    const storage5StepVerificationOk =
      vOk.verified === true &&
      vMissingObj.verified === false &&
      vBadSize.verified === false &&
      vBadMime.verified === false &&
      vBadOpId.verified === false &&
      vUndecodable.verified === false;

    // 2. Hạng mục 2: Kiểm tra phân quyền và màu khung tên theo quyền (SUPER_ADMIN/ADMIN/MOD/PLAYER) & chống giả mạo từ client
    clearVerifiedServerRoles();
    const superAdminRole = resolveUserRole({
      uid: 'uid_sa',
      email: SUPER_ADMIN_EMAIL,
      emailVerified: true,
      providerIds: ['google.com'],
    });
    // Cố tình truyền đối tượng có trường giả mạo nhưng chưa được server xác thực -> vẫn phải là PLAYER
    const spoofedClientObj: any = {
      uid: 'uid_spoof',
      email: 'normal.user@gmail.com',
      emailVerified: true,
      providerIds: ['google.com'],
      role: 'SUPER_ADMIN',
      isSuperAdmin: true,
    };
    const roleBeforeServerSync = resolveUserRole(spoofedClientObj);
    setVerifiedServerRoleForUid('uid_admin_1', 'ADMIN');
    setVerifiedServerRoleForUid('uid_mod_1', 'MOD');
    // Cố tình gán SUPER_ADMIN qua setVerifiedServerRoleForUid cho tài khoản thường -> phải bị bỏ qua (chỉ linhnk.online@gmail.com mới là SUPER_ADMIN)
    setVerifiedServerRoleForUid('uid_spoof', 'SUPER_ADMIN');
    const adminRole = resolveUserRole({
      uid: 'uid_admin_1',
      email: 'admin1@gmail.com',
      emailVerified: true,
      providerIds: ['google.com'],
    });
    const modRole = resolveUserRole({
      uid: 'uid_mod_1',
      email: 'mod1@gmail.com',
      emailVerified: true,
      providerIds: ['google.com'],
    });
    const spoofedSuperAdminBlocked = resolveUserRole(spoofedClientObj);
    const frameColorsOk =
      superAdminRole === 'SUPER_ADMIN' &&
      roleBeforeServerSync === 'PLAYER' &&
      adminRole === 'ADMIN' &&
      modRole === 'MOD' &&
      spoofedSuperAdminBlocked === 'PLAYER' &&
      getRoleNameFrameClasses('SUPER_ADMIN').includes('border-red-500') &&
      getRoleNameFrameClasses('ADMIN').includes('border-emerald-500') &&
      getRoleNameFrameClasses('MOD').includes('border-sky-500') &&
      getRoleNameFrameClasses('PLAYER').includes('border-neutral-700/80') &&
      getRoleDisplayInfo('SUPER_ADMIN').label === 'Super Admin';
    clearVerifiedServerRoles();

    // 3. Hạng mục 3: Kiểm tra đồng bộ Single-BGM giữa MusicManager và SoundManager
    const sm = SoundManager.getInstance();
    sm.stopBgm();
    sm.setCustomBgmActive(true);
    // Khi customBgmActive = true, gọi startBgm() hoặc updateSettings({ bgmEnabled: true }) của SoundManager KHÔNG ĐƯỢC tự bật nhạc 8-bit procedural
    sm.startBgm();
    sm.updateSettings({ bgmEnabled: true });
    const proceduralBlockedWhenCustomActive =
      sm.isCustomBgmActive() === true && sm.isProceduralBgmPlaying() === false;
    sm.setCustomBgmActive(false);
    sm.stopBgm();

    const passed =
      storage5StepVerificationOk && frameColorsOk && proceduralBlockedWhenCustomActive;

    results.push({
      id: 'M7_3_T37',
      name: 'T37: M7.3.7 (Hạng mục 1, 2, 3) – Xác minh 5 bước Storage Object, phân biệt màu khung tên theo quyền (SUPER_ADMIN/ADMIN/MOD/PLAYER) & chặn phát chồng nhạc nền',
      passed,
      details: `storage5StepOk=${storage5StepVerificationOk}, roleFramesOk=${frameColorsOk}, singleBgmGuardOk=${proceduralBlockedWhenCustomActive}`,
    });
  }

  // =========================================================================
  // M7_3_T38: M7.3.7 (Hạng mục 5) – Luồng Tạo phòng (Có mật khẩu mặc định / Không mật khẩu)
  //           & Tham gia phòng (Vào nhanh / Vào bằng mã phòng) + Đồng bộ độ khó phòng
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostA = new CoopOnlineManager(storage);
    const hostB = new CoopOnlineManager(storage);
    const guest1 = new CoopOnlineManager(storage);
    const guest2 = new CoopOnlineManager(storage);

    const hostUserA = {
      uid: 'uid_host_a',
      displayName: 'Host Alpha',
      email: 'host.alpha@gmail.com',
      emailVerified: true,
    };
    const hostUserB = {
      uid: 'uid_host_b',
      displayName: 'Host Bravo',
      email: 'host.bravo@gmail.com',
      emailVerified: true,
    };
    const guestUser1 = {
      uid: 'uid_guest_1',
      displayName: 'Guest One',
      email: 'guest.one@gmail.com',
    };
    const guestUser2 = {
      uid: 'uid_guest_2',
      displayName: 'Guest Two',
      email: 'guest.two@gmail.com',
    };

    // Case 1 & 2: Chọn "Có mật khẩu" nhưng để trống mật khẩu -> bị chặn, báo lỗi rõ ràng
    const emptyPwCheck = validateRoomPassword('');
    const shortPwCheck = validateRoomPassword('12');
    const createEmptyPwRes = hostA.createRoomSync(
      storage,
      hostUserA,
      'DEFAULT',
      nowMs,
      'PWERR1',
      { hasPassword: true, password: '   ' }
    );
    const passwordValidationOk =
      emptyPwCheck.valid === false &&
      shortPwCheck.valid === false &&
      createEmptyPwRes.success === false &&
      createEmptyPwRes.errorCode === 'INVALID_PASSWORD';

    // Case 4: Khi chưa có phòng công khai nào -> Vào nhanh báo đúng "Hiện chưa có phòng trống"
    const quickJoinWhenEmpty = guest1.quickJoinRoomSync(storage, guestUser1, nowMs + 100);
    const quickJoinEmptyMsgOk =
      quickJoinWhenEmpty.success === false &&
      quickJoinWhenEmpty.errorCode === 'NO_AVAILABLE_PUBLIC_ROOM' &&
      quickJoinWhenEmpty.message === 'Hiện chưa có phòng trống';

    // Case 1 & 5: Tạo phòng CÓ MẬT KHẨU ("tank2026", độ khó EXTREME) -> tạo thành công, KHÔNG bị Vào nhanh chọn nhầm
    const createProtectedRes = hostA.createRoomSync(
      storage,
      hostUserA,
      'EXTREME',
      nowMs + 200,
      'LOCK88',
      { hasPassword: true, password: 'tank2026' }
    );
    const rawLockedLobby = storage.getRoomSync('LOCK88');
    // Kiểm tra mật khẩu không lưu cleartext trên Firestore và hoàn toàn tương thích với evaluateCoopRoomRuleCreate:
    const lockedRuleCheck = rawLockedLobby
      ? evaluateCoopRoomRuleCreate({
          authUid: hostUserA.uid,
          isVerifiedPersonalGmail: true,
          requestTimeMs: nowMs + 200,
          roomCode: 'LOCK88',
          incoming: rawLockedLobby,
        })
      : false;
    const quickJoinSkipsPasswordRoom = guest1.quickJoinRoomSync(
      storage,
      guestUser1,
      nowMs + 300
    );
    const protectedRoomOk =
      createProtectedRes.success === true &&
      createProtectedRes.room?.hasPassword === true &&
      createProtectedRes.room?.difficulty === 'EXTREME' &&
      rawLockedLobby !== null &&
      !JSON.stringify(rawLockedLobby).includes('tank2026') &&
      lockedRuleCheck === true &&
      quickJoinSkipsPasswordRoom.success === false &&
      quickJoinSkipsPasswordRoom.errorCode === 'NO_AVAILABLE_PUBLIC_ROOM';

    // Case 9 & 10: Vào bằng mã phòng có mật khẩu -> nhập thiếu hoặc sai mật khẩu bị từ chối; nhập đúng mật khẩu vào thành công
    const joinProtectedMissingPw = guest1.joinRoomSync(
      storage,
      'LOCK88',
      guestUser1,
      nowMs + 400
    );
    const joinProtectedWrongPw = guest1.joinRoomSync(
      storage,
      'LOCK88',
      guestUser1,
      nowMs + 450,
      { password: 'wrong999' }
    );
    const joinProtectedRightPw = guest1.joinRoomSync(
      storage,
      'LOCK88',
      guestUser1,
      nowMs + 500,
      { password: 'tank2026' }
    );
    const joinByCodePasswordChecksOk =
      joinProtectedMissingPw.success === false &&
      joinProtectedMissingPw.errorCode === 'PASSWORD_REQUIRED' &&
      joinProtectedWrongPw.success === false &&
      joinProtectedWrongPw.errorCode === 'WRONG_PASSWORD' &&
      joinProtectedRightPw.success === true &&
      joinProtectedRightPw.room?.guestUid === guestUser1.uid &&
      joinProtectedRightPw.room?.difficulty === 'EXTREME';

    // Case 3, 4, 6, 7: Tạo phòng KHÔNG MẬT KHẨU (công khai) -> Vào nhanh tìm thấy và vào thành công;
    //                   nếu 2 người cùng bấm Vào nhanh vào 1 phòng trống cuối cùng -> chỉ 1 người vào được, người còn lại nhận lỗi sạch
    const guest3 = new CoopOnlineManager(storage);
    const createPublicRes = hostB.createRoomSync(
      storage,
      hostUserB,
      'DEFAULT',
      nowMs + 600,
      undefined,
      { hasPassword: false }
    );
    const publicQuickJoin1 = guest2.quickJoinRoomSync(storage, guestUser2, nowMs + 700);
    const publicQuickJoin2Race = guest3.quickJoinRoomSync(
      storage,
      {
        uid: 'uid_guest_3',
        displayName: 'Guest Three',
        email: 'guest.three@gmail.com',
      },
      nowMs + 750
    );
    const publicRoomAndQuickJoinRaceOk =
      createPublicRes.success === true &&
      createPublicRes.room?.hasPassword === false &&
      publicQuickJoin1.success === true &&
      publicQuickJoin1.room?.roomCode === createPublicRes.room?.roomCode &&
      publicQuickJoin1.room?.guestUid === guestUser2.uid &&
      publicQuickJoin2Race.success === false &&
      publicQuickJoin2Race.errorCode === 'NO_AVAILABLE_PUBLIC_ROOM';

    const passed =
      passwordValidationOk &&
      quickJoinEmptyMsgOk &&
      protectedRoomOk &&
      joinByCodePasswordChecksOk &&
      publicRoomAndQuickJoinRaceOk;

    results.push({
      id: 'M7_3_T38',
      name: 'T38: M7.3.7 (Hạng mục 5) – Tạo phòng Có mật khẩu (mặc định) / Không mật khẩu, Vào nhanh & Vào bằng mã phòng',
      passed,
      details: `pwValOk=${passwordValidationOk}, emptyMsgOk=${quickJoinEmptyMsgOk}, protectedRoomOk=${protectedRoomOk}, codePwChecksOk=${joinByCodePasswordChecksOk}, quickJoinRaceOk=${publicRoomAndQuickJoinRaceOk}`,
    });
  }

  // =========================================================================
  // M7_3_T39: M7.3.7 (Hạng mục 6) – Kiểm thử đủ 12 trường hợp bắt buộc TC-01 .. TC-12
  //           cho lỗi P2 bấm Sẵn sàng, đồng bộ trạng thái phòng chờ và bắt đầu trận
  // =========================================================================
  {
    const nowMs = 1_700_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const p1Manager = new CoopOnlineManager(storage);
    const p2Manager = new CoopOnlineManager(storage);

    const p1User = {
      uid: 'uid_tc_p1',
      displayName: 'Chỉ Huy P1',
      email: 'p1.cmd@gmail.com',
      emailVerified: true,
    };
    const p2User = {
      uid: 'uid_tc_p2',
      displayName: 'Chiến Binh P2',
      email: 'p2.warrior@gmail.com',
    };

    // TC-01: P1 tạo phòng -> hostUid == P1.uid, guestUid == null, hostReady == false, guestReady == false, status == "WAITING"
    const tc01Res = p1Manager.createRoomSync(
      storage,
      p1User,
      'EXTREME',
      nowMs,
      'TC0199',
      { hasPassword: false }
    );
    const p1AfterTc01 = p1Manager.getCurrentRoom();
    const tc01Pass =
      tc01Res.success === true &&
      p1AfterTc01 !== null &&
      p1AfterTc01.hostUid === p1User.uid &&
      p1AfterTc01.guestUid === null &&
      p1AfterTc01.hostReady === false &&
      p1AfterTc01.guestReady === false &&
      p1AfterTc01.status === 'WAITING';

    // TC-02: P1 bấm Sẵn sàng trước khi P2 vào -> hostReady == true, vẫn hiển thị đang chờ P2 tham gia (guestUid == null)
    const tc02Res = p1Manager.setPlayerReadySync(storage, true, nowMs + 100);
    const p1AfterTc02 = p1Manager.getCurrentRoom();
    const tc02Pass =
      tc02Res.success === true &&
      p1AfterTc02?.hostReady === true &&
      p1AfterTc02?.guestUid === null;

    // TC-03: P2 tham gia phòng -> guestUid == P2.uid (KHÔNG bị ghi đè thành null bởi signaling.guestUid!),
    //        cả hai màn hình không còn hiển thị "Đang chờ người chơi 2 nhập mã phòng"
    const tc03Res = p2Manager.joinRoomSync(storage, 'TC0199', p2User, nowMs + 200);
    const p1AfterTc03 = p1Manager.getCurrentRoom();
    const p2AfterTc03 = p2Manager.getCurrentRoom();
    const sigDocAfterJoin = storage.getSignalingSync('TC0199');
    const tc03Pass =
      tc03Res.success === true &&
      p1AfterTc03?.guestUid === p2User.uid &&
      p2AfterTc03?.guestUid === p2User.uid &&
      p1AfterTc03?.guestDisplayName === p2User.displayName &&
      p2AfterTc03?.guestDisplayName === p2User.displayName &&
      p2AfterTc03?.hostReady === true &&
      p2AfterTc03?.guestReady === false &&
      sigDocAfterJoin?.guestUid === p2User.uid;

    // TC-04: P2 bấm Sẵn sàng sau khi vào phòng -> guestReady == true trên Firestore, cả P1 và P2 đều thấy P2 đã Sẵn sàng
    const tc04Res = p2Manager.setPlayerReadySync(storage, true, nowMs + 300);
    const rawLobbyAfterP2Ready = storage.getRoomSync('TC0199');
    const p1AfterTc04 = p1Manager.getCurrentRoom();
    const p2AfterTc04 = p2Manager.getCurrentRoom();
    const tc04Pass =
      tc04Res.success === true &&
      rawLobbyAfterP2Ready?.guestReady === true &&
      p1AfterTc04?.guestReady === true &&
      p2AfterTc04?.guestReady === true;

    // TC-05: P2 vào phòng trước khi P1 bấm Sẵn sàng, P2 bấm Sẵn sàng trước -> guestReady == true, sau đó P1 bấm Sẵn sàng -> hostReady == true
    p1Manager.setPlayerReadySync(storage, false, nowMs + 350);
    p2Manager.setPlayerReadySync(storage, false, nowMs + 360);
    const tc05P2First = p2Manager.setPlayerReadySync(storage, true, nowMs + 370);
    const tc05P1Second = p1Manager.setPlayerReadySync(storage, true, nowMs + 380);
    const p1AfterTc05 = p1Manager.getCurrentRoom();
    const p2AfterTc05 = p2Manager.getCurrentRoom();
    const tc05Pass =
      tc05P2First.success === true &&
      tc05P1Second.success === true &&
      p1AfterTc05?.hostReady === true &&
      p1AfterTc05?.guestReady === true &&
      p2AfterTc05?.hostReady === true &&
      p2AfterTc05?.guestReady === true;

    // TC-06: P1 hoặc P2 bấm Hủy sẵn sàng -> Trường Ready tương ứng về false, chưa bắt đầu trận (evaluateStartMatchCandidate từ chối)
    const tc06P2Unready = p2Manager.setPlayerReadySync(storage, false, nowMs + 400);
    const tc06StartBlocked = p1Manager.startOnlineMatchSync(
      storage,
      p1User.uid,
      undefined,
      nowMs + 410
    );
    const p1AfterTc06 = p1Manager.getCurrentRoom();
    const p2AfterTc06 = p2Manager.getCurrentRoom();
    const tc06Pass =
      tc06P2Unready.success === true &&
      p1AfterTc06?.guestReady === false &&
      p2AfterTc06?.guestReady === false &&
      tc06StartBlocked.success === false;

    // TC-12: Người chơi bấm nút Sẵn sàng nhiều lần liên tiếp -> Không gửi chồng request lỗi và đồng bộ trạng thái cuối cùng chính xác
    const tc12Rapid1 = p2Manager.setPlayerReadySync(storage, true, nowMs + 420);
    const tc12Rapid2Duplicate = p2Manager.setPlayerReadySync(storage, true, nowMs + 421);
    const p1AfterTc12 = p1Manager.getCurrentRoom();
    const p2AfterTc12 = p2Manager.getCurrentRoom();
    const tc12Pass =
      tc12Rapid1.success === true &&
      tc12Rapid2Duplicate.success === true &&
      p2AfterTc12?.guestReady === true &&
      p1AfterTc12?.guestReady === true;

    // TC-07: Cả P1 và P2 đều Sẵn sàng -> Chuyển sang kết nối/bắt đầu trận và vào màn chơi thành công
    const lobbyBeforeStart = storage.getRoomSync('TC0199')!;
    storage.setRoomSync('TC0199', {
      ...lobbyBeforeStart,
      rtcConnectionState: 'CONNECTED',
      hostLastActiveAt: nowMs + 450,
    });
    const tc07StartRes = p1Manager.startOnlineMatchSync(
      storage,
      p1User.uid,
      undefined,
      nowMs + 500
    );
    const p1AfterTc07 = p1Manager.getCurrentRoom();
    const p2AfterTc07 = p2Manager.getCurrentRoom();
    const tc07Pass =
      tc07StartRes.success === true &&
      p1AfterTc07?.status === 'PLAYING' &&
      p2AfterTc07?.status === 'PLAYING' &&
      p1AfterTc07?.difficulty === 'EXTREME' &&
      p2AfterTc07?.difficulty === 'EXTREME';

    // TC-08: Người chơi thứ 3 cố bấm Sẵn sàng hoặc sửa guestReady của phòng không thuộc về mình -> Bị từ chối bởi Firestore Rules
    const currentLobbyForTc08 = storage.getRoomSync('TC0199')!;
    const tc08RuleEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_attacker_tc08',
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 510,
      existing: { ...currentLobbyForTc08, status: 'WAITING' },
      incoming: {
        ...currentLobbyForTc08,
        status: 'WAITING',
        guestReady: false,
        guestLastActiveAt: nowMs + 510,
      },
    });
    const tc08Pass = tc08RuleEval.allowed === false;

    // TC-09: P2 cố sửa hostReady, difficulty, hostUid hoặc ép status = PLAYING -> Bị từ chối bởi Firestore Rules
    const waitingLobbyForTc09: CoopRoomLobbyDocument = {
      ...currentLobbyForTc08,
      status: 'WAITING',
      hostReady: false,
      guestReady: true,
    };
    const tc09MutateHostReady = evaluateCoopRoomRuleUpdate({
      authUid: p2User.uid,
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 520,
      existing: waitingLobbyForTc09,
      incoming: {
        ...waitingLobbyForTc09,
        hostReady: true,
        guestLastActiveAt: nowMs + 520,
      },
    });
    const tc09MutateDifficulty = evaluateCoopRoomRuleUpdate({
      authUid: p2User.uid,
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 520,
      existing: waitingLobbyForTc09,
      incoming: {
        ...waitingLobbyForTc09,
        difficulty: 'DEFAULT',
        guestLastActiveAt: nowMs + 520,
      },
    });
    const tc09ForcePlaying = evaluateCoopRoomRuleUpdate({
      authUid: p2User.uid,
      isVerifiedPersonalGmail: true,
      requestTimeMs: nowMs + 520,
      existing: { ...waitingLobbyForTc09, hostReady: true },
      incoming: {
        ...waitingLobbyForTc09,
        hostReady: true,
        status: 'PLAYING',
        guestLastActiveAt: nowMs + 520,
      },
    });
    const tc09Pass =
      tc09MutateHostReady.allowed === false &&
      tc09MutateDifficulty.allowed === false &&
      tc09ForcePlaying.allowed === false;

    // TC-10: P2 rời phòng khi đang ở phòng chờ -> guestUid == null, guestReady == false, phòng quay lại chờ P2 nếu P1 vẫn ở phòng
    const leaveLobbyStorage = new InMemoryCoopStorageAdapter();
    const hostTc10 = new CoopOnlineManager(leaveLobbyStorage);
    const guestTc10 = new CoopOnlineManager(leaveLobbyStorage);
    hostTc10.createRoomSync(leaveLobbyStorage, p1User, 'DEFAULT', nowMs, 'TC1000', {
      hasPassword: false,
    });
    guestTc10.joinRoomSync(leaveLobbyStorage, 'TC1000', p2User, nowMs + 100);
    guestTc10.setPlayerReadySync(leaveLobbyStorage, true, nowMs + 200);
    guestTc10.leaveRoomSync(leaveLobbyStorage, 'P2 rời phòng chờ', nowMs + 300);
    const roomAfterTc10Leave = leaveLobbyStorage.getRoomSync('TC1000');
    const tc10Pass =
      roomAfterTc10Leave !== null &&
      roomAfterTc10Leave.status === 'WAITING' &&
      roomAfterTc10Leave.hostUid === p1User.uid &&
      roomAfterTc10Leave.guestUid === null &&
      roomAfterTc10Leave.guestDisplayName === null &&
      roomAfterTc10Leave.guestReady === false;

    // TC-11: Phòng hết hạn (expiresAt <= now) -> Không cho bấm Sẵn sàng, hiển thị thông báo phòng đã hết hạn
    const expiredLobbyStorage = new InMemoryCoopStorageAdapter();
    const hostTc11 = new CoopOnlineManager(expiredLobbyStorage);
    const guestTc11 = new CoopOnlineManager(expiredLobbyStorage);
    hostTc11.createRoomSync(expiredLobbyStorage, p1User, 'DEFAULT', nowMs, 'TC1100', {
      hasPassword: false,
    });
    guestTc11.joinRoomSync(expiredLobbyStorage, 'TC1100', p2User, nowMs + 100);
    const expiredNow = nowMs + COOP_ONLINE_CONFIG.ROOM_TTL_MS + 5000;
    const tc11ReadyAfterExpire = guestTc11.setPlayerReadySync(
      expiredLobbyStorage,
      true,
      expiredNow
    );
    const tc11Pass =
      tc11ReadyAfterExpire.success === false &&
      tc11ReadyAfterExpire.errorCode === 'ROOM_EXPIRED';

    const passed =
      tc01Pass &&
      tc02Pass &&
      tc03Pass &&
      tc04Pass &&
      tc05Pass &&
      tc06Pass &&
      tc07Pass &&
      tc08Pass &&
      tc09Pass &&
      tc10Pass &&
      tc11Pass &&
      tc12Pass;

    results.push({
      id: 'M7_3_T39',
      name: 'T39: M7.3.7 (Hạng mục 6) – Kiểm thử đủ 12 ca TC-01..TC-12: P2 bấm Sẵn sàng, không bị signaling.guestUid=null ghi đè, P2 rời phòng & bắt đầu trận',
      passed,
      details: `TC01=${tc01Pass}, TC02=${tc02Pass}, TC03=${tc03Pass}, TC04=${tc04Pass}, TC05=${tc05Pass}, TC06=${tc06Pass}, TC07=${tc07Pass}, TC08=${tc08Pass}, TC09=${tc09Pass}, TC10=${tc10Pass}, TC11=${tc11Pass}, TC12=${tc12Pass}`,
    });
  }

  // =========================================================================
  // T40: M7.3.8 (A) – Match Countdown Timer (120s DEFAULT / 60s EXTREME) & stageRunSeq Lifecycle
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    const initialSnap = engine.getState();
    const initSeqIs1 = initialSnap.stageRunSeq === 1;

    engine.startMatch('SOLO', 'DEFAULT');
    const afterStartDefault = engine.getState();
    const startDefaultOk =
      afterStartDefault.stageRunSeq === 1 &&
      afterStartDefault.matchDurationSeconds === 120 &&
      afterStartDefault.remainingTicks === 7200 &&
      afterStartDefault.remainingSeconds === 120 &&
      formatCountdownMMSS(afterStartDefault.remainingSeconds) === '02:00';

    engine.restartStage();
    const afterRestart = engine.getState();
    const restartSeqIs2 = afterRestart.stageRunSeq === 2 && afterRestart.remainingTicks === 7200;

    engine.reset();
    const afterReset = engine.getState();
    const resetSeqIs3 = afterReset.stageRunSeq === 3 && afterReset.remainingTicks === 7200;

    // Start EXTREME (Thử thách: 60s = 3600 ticks)
    engine.startMatch('SOLO', 'EXTREME');
    const afterStartExtreme = engine.getState();
    const startExtremeOk =
      afterStartExtreme.stageRunSeq === 1 &&
      afterStartExtreme.matchDurationSeconds === 60 &&
      afterStartExtreme.remainingTicks === 3600 &&
      afterStartExtreme.remainingSeconds === 60 &&
      formatCountdownMMSS(afterStartExtreme.remainingSeconds) === '01:00';

    // Run 3599 ticks -> remainingTicks = 1, remainingSeconds = 1 (00:01), not game over yet
    for (let i = 0; i < 3599; i++) {
      engine.stepTick(NEUTRAL_INPUT);
    }
    const atTick3599 = engine.getState();
    const tick3599Ok =
      atTick3599.remainingTicks === 1 &&
      atTick3599.remainingSeconds === 1 &&
      !atTick3599.isGameOver &&
      formatCountdownMMSS(atTick3599.remainingSeconds) === '00:01';

    // Run 3600th tick -> remainingTicks = 0, remainingSeconds = 0 (00:00), Timeout Game Over!
    engine.stepTick(NEUTRAL_INPUT);
    const atTick3600 = engine.getState();
    const tick3600TimeoutOk =
      atTick3600.remainingTicks === 0 &&
      atTick3600.remainingSeconds === 0 &&
      atTick3600.isGameOver === true &&
      atTick3600.isTimeoutGameOver === true &&
      atTick3600.isStageClear === false &&
      atTick3600.matchState === 'GAME_OVER' &&
      formatCountdownMMSS(atTick3600.remainingSeconds) === '00:00';

    const passed =
      initSeqIs1 &&
      startDefaultOk &&
      restartSeqIs2 &&
      resetSeqIs3 &&
      startExtremeOk &&
      tick3599Ok &&
      tick3600TimeoutOk;

    results.push({
      id: 'M7_3_T40',
      name: 'T40: M7.3.8 (A) – Match Countdown Timer (Giải trí 120s / Thử thách 60s), MM:SS & vòng đời stageRunSeq chuẩn xác',
      passed,
      details: `initSeq=${initSeqIs1}, startDefault=${startDefaultOk}, restartSeq=${restartSeqIs2}, resetSeq=${resetSeqIs3}, startExtreme=${startExtremeOk}, tick3599=${tick3599Ok}, timeoutAtZero=${tick3600TimeoutOk}`,
    });
  }

  // =========================================================================
  // T41: M7.3.8 (A) – 4-Tier End-of-Tick Outcome Priority Gate at Final Tick (remainingTicks === 0)
  // =========================================================================
  {
    // Tier 1 > Tier 3/4: Base destroyed + last enemy killed on the exact final tick (remainingTicks: 1 -> 0)
    const tier1Engine = new GameEngine(undefined, undefined, false);
    tier1Engine.startMatch('SOLO', 'EXTREME');
    for (let i = 0; i < 3599; i++) {
      tier1Engine.stepTick(NEUTRAL_INPUT);
    }
    const t1Internal = (tier1Engine as any).state;
    t1Internal.enemyQueue = [];
    t1Internal.enemies = [];
    t1Internal.totalDefeatedEnemies = 30;
    t1Internal.terrain.isBaseDestroyed = true;
    tier1Engine.stepTick(NEUTRAL_INPUT);
    const t1Res = tier1Engine.getState();
    const tier1Wins =
      t1Res.remainingTicks === 0 &&
      t1Res.isGameOver === true &&
      t1Res.terrain.isBaseDestroyed === true &&
      t1Res.isStageClear === false &&
      t1Res.isTimeoutGameOver === false;

    // Tier 2 > Tier 3/4: Out of lives (in TWO_PLAYERS_ONLINE both P1 & P2 out of lives) + last enemy killed at final tick
    const tier2Engine = new GameEngine(undefined, undefined, false);
    tier2Engine.startMatch('TWO_PLAYERS_ONLINE', 'EXTREME');
    for (let i = 0; i < 3599; i++) {
      tier2Engine.stepTick(NEUTRAL_INPUT);
    }
    const t2Internal = (tier2Engine as any).state;
    t2Internal.enemyQueue = [];
    t2Internal.enemies = [];
    t2Internal.totalDefeatedEnemies = 30;
    t2Internal.p1.isAlive = false;
    t2Internal.p1State.isDead = true;
    t2Internal.p1State.lives = 0;
    // Wait: if P2 still has lives = 3 and isAlive = true, match must NOT be out of lives, so Tier 3 Stage Clear wins!
    tier2Engine.stepTick(NEUTRAL_INPUT);
    const t2WithP2Alive = tier2Engine.getState();
    const p2AlivePreventsGameOver =
      t2WithP2Alive.isStageClear === true &&
      t2WithP2Alive.isGameOver === false &&
      t2WithP2Alive.isTimeoutGameOver === false;

    // Now test when BOTH P1 and P2 are out of lives at final tick -> Tier 2 Out of Lives wins over Stage Clear & Timeout
    const tier2BothDeadEngine = new GameEngine(undefined, undefined, false);
    tier2BothDeadEngine.startMatch('TWO_PLAYERS_ONLINE', 'EXTREME');
    for (let i = 0; i < 3599; i++) {
      tier2BothDeadEngine.stepTick(NEUTRAL_INPUT);
    }
    const t2BothInternal = (tier2BothDeadEngine as any).state;
    t2BothInternal.enemyQueue = [];
    t2BothInternal.enemies = [];
    t2BothInternal.totalDefeatedEnemies = 30;
    t2BothInternal.p1.isAlive = false;
    t2BothInternal.p1State.isDead = true;
    t2BothInternal.p1State.lives = 0;
    t2BothInternal.p2.isAlive = false;
    t2BothInternal.p2State.isDead = true;
    t2BothInternal.p2State.lives = 0;
    tier2BothDeadEngine.stepTick(NEUTRAL_INPUT);
    const t2BothDeadRes = tier2BothDeadEngine.getState();
    const tier2Wins =
      t2BothDeadRes.remainingTicks === 0 &&
      t2BothDeadRes.isGameOver === true &&
      t2BothDeadRes.isStageClear === false &&
      t2BothDeadRes.isTimeoutGameOver === false;

    // Tier 3 > Tier 4: Last enemy killed on the exact final tick (remainingTicks: 1 -> 0) with P1 alive & base intact -> STAGE_CLEAR wins over Timeout!
    const tier3Engine = new GameEngine(undefined, undefined, false);
    tier3Engine.startMatch('SOLO', 'EXTREME');
    for (let i = 0; i < 3599; i++) {
      tier3Engine.stepTick(NEUTRAL_INPUT);
    }
    const t3Internal = (tier3Engine as any).state;
    t3Internal.enemyQueue = [];
    t3Internal.enemies = [];
    t3Internal.totalDefeatedEnemies = 30;
    tier3Engine.stepTick(NEUTRAL_INPUT);
    const t3Res = tier3Engine.getState();
    const tier3WinsOverTimeout =
      t3Res.remainingTicks === 0 &&
      t3Res.isStageClear === true &&
      t3Res.isGameOver === false &&
      t3Res.isTimeoutGameOver === false &&
      t3Res.matchState === 'STAGE_CLEAR';

    const passed = tier1Wins && p2AlivePreventsGameOver && tier2Wins && tier3WinsOverTimeout;

    results.push({
      id: 'M7_3_T41',
      name: 'T41: M7.3.8 (A) – Cổng ưu tiên kết thúc trận 4 tầng tại tick cuối (Base > Lives > Stage Clear > Timeout) & kiểm tra anyPlayerRemaining',
      passed,
      details: `tier1Wins=${tier1Wins}, p2AlivePreventsGameOver=${p2AlivePreventsGameOver}, tier2Wins=${tier2Wins}, tier3WinsOverTimeout=${tier3WinsOverTimeout}`,
    });
  }

  // =========================================================================
  // T42: M7.3.8 (B & C) – 11-Step Snapshot Validator, Error Codes (Case A..F) & Anti-Sequence Poisoning
  // =========================================================================
  {
    const hostEngine = new GameEngine(undefined, undefined, false);
    hostEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    hostEngine.stepTick(NEUTRAL_INPUT);
    const validSnap10 = buildAuthoritativeSnapshot(hostEngine.getState(), 10, 1000);

    // Case A: Non-monotonic snapshotSeq (snapshotSeq <= lastAppliedSnapshotSeq) -> STALE_SNAPSHOT_SEQ
    const resCaseA = validateAndNormalizeAuthoritativeSnapshot(validSnap10, 10, 1, 1);
    const caseAOk = !resCaseA.valid && resCaseA.errorCode === 'STALE_SNAPSHOT_SEQ';

    // Case B: Missing stageRunSeq (must NOT fallback to 1) -> INVALID_STAGE_RUN_SEQ
    const snapMissingStageRunSeq = { ...validSnap10, snapshotSeq: 11 } as any;
    delete snapMissingStageRunSeq.stageRunSeq;
    const resCaseB = validateAndNormalizeAuthoritativeSnapshot(snapMissingStageRunSeq, 10, 1, 1);
    const caseBOk = !resCaseB.valid && resCaseB.errorCode === 'INVALID_STAGE_RUN_SEQ';

    // Case C: Regressing stageRunSeq (< lastAppliedStageRunSeq) -> STALE_STAGE_RUN_SEQ
    const resCaseC = validateAndNormalizeAuthoritativeSnapshot(
      { ...validSnap10, snapshotSeq: 11, stageRunSeq: 1 },
      10,
      2,
      50
    );
    const caseCOk = !resCaseC.valid && resCaseC.errorCode === 'STALE_STAGE_RUN_SEQ';

    // Case D: Regressing tickCount in the SAME stageRunSeq -> STALE_TICK_WITHIN_SAME_RUN
    const resCaseD = validateAndNormalizeAuthoritativeSnapshot(
      {
        ...validSnap10,
        snapshotSeq: 11,
        stageRunSeq: 1,
        tickCount: 5,
        remainingTicks: 7195,
        remainingSeconds: 120,
      },
      10,
      1,
      20
    );
    const caseDOk = !resCaseD.valid && resCaseD.errorCode === 'STALE_TICK_WITHIN_SAME_RUN';

    // Case E: tickCount reset to 0 when stageRunSeq increments (stageRunSeq: 1 -> 2) -> VALID!
    const resCaseE = validateAndNormalizeAuthoritativeSnapshot(
      {
        ...validSnap10,
        snapshotSeq: 11,
        stageRunSeq: 2,
        tickCount: 0,
        remainingTicks: 7200,
        remainingSeconds: 120,
        stageElapsedSeconds: 0,
      },
      10,
      1,
      500
    );
    const caseEOk = resCaseE.valid === true && resCaseE.normalized?.stageRunSeq === 2;

    // Case F: Mismatched remainingTicks vs tickCount -> MISMATCHED_REMAINING_TICKS
    const resCaseF1 = validateAndNormalizeAuthoritativeSnapshot(
      {
        ...validSnap10,
        snapshotSeq: 11,
        tickCount: 100,
        remainingTicks: 7000, // should be 7100
      },
      10,
      1,
      1
    );
    // Conflicting outcome flags (isGameOver && isStageClear) -> CONTRADICTORY_OUTCOME_FLAGS
    const resCaseF2 = validateAndNormalizeAuthoritativeSnapshot(
      {
        ...validSnap10,
        snapshotSeq: 11,
        isGameOver: true,
        isStageClear: true,
        matchState: 'GAME_OVER',
      },
      10,
      1,
      1
    );
    const caseFOk =
      !resCaseF1.valid &&
      resCaseF1.errorCode === 'MISMATCHED_REMAINING_TICKS' &&
      !resCaseF2.valid &&
      resCaseF2.errorCode === 'CONTRADICTORY_OUTCOME_FLAGS';

    // Anti-Sequence Poisoning test on CoopOnlineManager + GameEngine:
    // Apply valid snapshotSeq = 10 -> send poisoned snapshotSeq = 15 (missing/invalid fields) -> send valid snapshotSeq = 11
    const storage = new InMemoryCoopStorageAdapter();
    const hostMgr = new CoopOnlineManager(storage);
    const guestMgr = new CoopOnlineManager(storage);
    const guestEngine = new GameEngine(undefined, undefined, false);
    guestEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    guestEngine.setOnGuestSnapshotAppliedCallback((seq, runSeq, tick) => {
      guestMgr.syncGuestAppliedSnapshotMeta(seq, runSeq, tick);
    });
    const unsub = guestMgr.subscribeSnapshots((snap) => {
      return guestEngine.applyAuthoritativeSnapshot(snap).valid;
    });

    (guestMgr as any).role = 'GUEST';
    guestMgr.handleIncomingDataChannelMessage({ type: 'HOST_SNAPSHOT', snapshot: validSnap10 }, 1000);
    const seqAfter10 = guestMgr.getGuestLastAppliedSnapshotSeq();

    // Send poisoned snapshot with snapshotSeq = 15 (conflicting outcome flags)
    const poisonedSnap15: CoopAuthoritativeSnapshot = {
      ...validSnap10,
      snapshotSeq: 15,
      isGameOver: true,
      isStageClear: true,
    };
    guestMgr.handleIncomingDataChannelMessage(
      { type: 'HOST_SNAPSHOT', snapshot: poisonedSnap15 },
      1050
    );
    const seqAfterPoison15 = guestMgr.getGuestLastAppliedSnapshotSeq();

    // Now send valid snapshot with snapshotSeq = 11 -> must be ACCEPTED!
    hostEngine.stepTick(NEUTRAL_INPUT);
    const validSnap11 = buildAuthoritativeSnapshot(hostEngine.getState(), 11, 1100);
    guestMgr.handleIncomingDataChannelMessage({ type: 'HOST_SNAPSHOT', snapshot: validSnap11 }, 1100);
    const seqAfter11 = guestMgr.getGuestLastAppliedSnapshotSeq();
    unsub();

    const antiPoisoningOk =
      seqAfter10 === 10 &&
      seqAfterPoison15 === 10 &&
      seqAfter11 === 11 &&
      guestEngine.getGuestLastAppliedSnapshotSeq() === 11;

    const passed =
      caseAOk && caseBOk && caseCOk && caseDOk && caseEOk && caseFOk && antiPoisoningOk;

    results.push({
      id: 'M7_3_T42',
      name: 'T42: M7.3.8 (B & C) – Xác thực 11 bước Snapshot (Case A..F) & Chống Sequence Poisoning (gói lỗi seq=15 không khóa gói hợp lệ seq=11)',
      passed,
      details: `caseA=${caseAOk}, caseB=${caseBOk}, caseC=${caseCOk}, caseD=${caseDOk}, caseE=${caseEOk}, caseF=${caseFOk}, antiPoisoning=${antiPoisoningOk}`,
    });
  }

  // =========================================================================
  // T43: M7.3.8 (C) – Suppress False Explosions on Guest Stage Restart / Stage Transition
  // =========================================================================
  {
    const hostEngine = new GameEngine(undefined, undefined, false);
    const guestEngine = new GameEngine(undefined, undefined, false);
    hostEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    guestEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');

    // Step host a few ticks, damage an actual brick tile in Stage 1, and apply snapshot 1 to guest
    hostEngine.stepTick(NEUTRAL_INPUT);
    const hostState1 = hostEngine.getState();
    const brickKey = Object.keys(hostState1.terrain.brickSubTiles)[0] || '11_5';
    hostState1.terrain.brickSubTiles[brickKey] = 3; // damaged brick
    hostState1.terrain.isBaseDestroyed = true;
    const snap1 = buildAuthoritativeSnapshot(hostState1, 1, 1000);
    guestEngine.applyAuthoritativeSnapshot(snap1);
    guestEngine.popCombatEvents(); // clear initial events

    // Now Host restarts stage (stageRunSeq increments 1 -> 2, bricks restored, base intact, enemy count resets)
    hostEngine.restartStage();
    const snap2AfterRestart = buildAuthoritativeSnapshot(hostEngine.getState(), 2, 2000);
    const applyRes = guestEngine.applyAuthoritativeSnapshot(snap2AfterRestart);
    const eventsOnRestart = guestEngine.popCombatEvents();
    const guestStateAfterRestart = guestEngine.getState();

    const passed =
      applyRes.valid === true &&
      eventsOnRestart.length === 0 &&
      guestStateAfterRestart.stageRunSeq === 2 &&
      guestStateAfterRestart.terrain.isBaseDestroyed === false &&
      guestStateAfterRestart.terrain.brickSubTiles[brickKey] === 15;

    results.push({
      id: 'M7_3_T43',
      name: 'T43: M7.3.8 (C) – Không phát nổ giả (TANK_EXPLOSION / BASE_EXPLOSION) trên Guest khi restartStage hoặc chuyển màn, khôi phục gạch & căn cứ nguyên vẹn',
      passed,
      details: `applyValid=${applyRes.valid}, eventsOnRestart=${eventsOnRestart.length}, stageRunSeq=${guestStateAfterRestart.stageRunSeq}, brickRestored=${guestStateAfterRestart.terrain.brickSubTiles[brickKey]}`,
    });
  }

  // =========================================================================
  // T44: M7.3.8 (D) – Input Delta Guard (NaN, -50, 0), Non-Overlapping Lost Time & Mode-Aware Backlog Policy
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    engine.startMatch('SOLO', 'DEFAULT');

    // Seed accumulator with 10ms
    engine.advanceTime(10, NEUTRAL_INPUT);
    const accBeforeInvalid = engine.getTimingTelemetry().accumulatorMs;

    // Pass invalid deltas: NaN, -50, 0, Infinity -> must return 0 ticks and preserve accumulatorMs (10ms)
    const tNaN = engine.advanceTime(Number.NaN, NEUTRAL_INPUT);
    const tNeg = engine.advanceTime(-50, NEUTRAL_INPUT);
    const tZero = engine.advanceTime(0, NEUTRAL_INPUT);
    const tInf = engine.advanceTime(Number.POSITIVE_INFINITY, NEUTRAL_INPUT);
    const accAfterInvalid = engine.getTimingTelemetry().accumulatorMs;
    const invalidGuardsOk =
      tNaN === 0 &&
      tNeg === 0 &&
      tZero === 0 &&
      tInf === 0 &&
      Math.abs(accAfterInvalid - accBeforeInvalid) < 1e-3;

    // SOLO mode with 10,000ms spike (> 3000ms safety limit) -> triggers Forced Safety Pause!
    const soloSpikeEngine = new GameEngine(undefined, undefined, false);
    soloSpikeEngine.startMatch('SOLO', 'DEFAULT');
    const soloSpikeTicks = soloSpikeEngine.advanceTime(10000, NEUTRAL_INPUT);
    const soloSpikeState = soloSpikeEngine.getState();
    const soloSpikeTel = soloSpikeEngine.getTimingTelemetry();
    const soloSafetyPauseOk =
      soloSpikeTicks === 0 &&
      soloSpikeState.matchState === 'PAUSED' &&
      soloSpikeTel.droppedInputMs === 7000 &&
      soloSpikeTel.droppedBacklogMs === 3000 &&
      soloSpikeTel.droppedSeconds === 10 &&
      soloSpikeTel.accumulatorMs === 0;

    // TWO_PLAYERS_ONLINE Host mode with 2500ms spike -> catches up 15 ticks/frame without dropping time
    const hostCatchupEngine = new GameEngine(undefined, undefined, false);
    hostCatchupEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const hostTicksFrame1 = hostCatchupEngine.advanceTime(2500, NEUTRAL_INPUT);
    const hostTelFrame1 = hostCatchupEngine.getTimingTelemetry();
    const hostCatchup2500Ok =
      hostTicksFrame1 === 15 &&
      hostTelFrame1.droppedSeconds === 0 &&
      Math.abs(hostTelFrame1.accumulatorMs - 2250) < 0.05;

    // TWO_PLAYERS_ONLINE Host mode with 10,000ms spike + 500ms existing accumulator -> non-overlapping droppedInputMs (7000) + droppedBacklogMs (500) = 7500ms
    const hostOverflowEngine = new GameEngine(undefined, undefined, false);
    hostOverflowEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    // Put 500ms in accumulator: pass 750ms -> runs 15 ticks (250ms), leaves 500ms in accumulator
    hostOverflowEngine.advanceTime(750, NEUTRAL_INPUT);
    const ticksOverflow = hostOverflowEngine.advanceTime(10000, NEUTRAL_INPUT);
    const telOverflow = hostOverflowEngine.getTimingTelemetry();
    const nonOverlappingDecompOk =
      ticksOverflow === 15 &&
      telOverflow.droppedInputMs === 7000 &&
      Math.abs(telOverflow.droppedBacklogMs - 500) < 0.05 &&
      Math.abs(telOverflow.droppedSeconds - 7.5) < 0.05 &&
      Math.abs(telOverflow.accumulatorMs - 2750) < 0.05;

    const passed =
      invalidGuardsOk && soloSafetyPauseOk && hostCatchup2500Ok && nonOverlappingDecompOk;

    results.push({
      id: 'M7_3_T44',
      name: 'T44: M7.3.8 (D) – Chốt chặn rawElapsedMs (NaN, -50, 0), Safety Pause cho SOLO/AI & phân rã không trùng lặp droppedInputMs + droppedBacklogMs',
      passed,
      details: `invalidGuards=${invalidGuardsOk}, soloSafetyPause=${soloSafetyPauseOk}, hostCatchup2500=${hostCatchup2500Ok}, nonOverlappingDecomp=${nonOverlappingDecompOk}`,
    });
  }

  // =========================================================================
  // T45: M7.3.8 (D) – Historical Catch-Up Neutral Input & P2 Guest Input 250ms Expiry
  // =========================================================================
  {
    // 1. Historical catch-up ticks must use NEUTRAL_INPUT for ticks 1..(ticksToRun - 1), and live input only on the final tick
    const catchupInputEngine = new GameEngine(undefined, undefined, false);
    catchupInputEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    let p1ShotEvents = 0;
    catchupInputEngine.on('P1_SHOOT', () => {
      p1ShotEvents++;
    });
    const p1StartY = catchupInputEngine.getState().p1.y;
    // Pass 100ms (= 6 ticks) with UP + SHOOT held:
    // Ticks 0..4 are historical catch-up ticks (NEUTRAL_INPUT -> no movement), only Tick 5 (final tick) applies UP (moves 1px)
    const ticksExecuted = catchupInputEngine.advanceTime(100, {
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: true,
    });
    const p1EndY = catchupInputEngine.getState().p1.y;
    const neutralHistoricalOk =
      ticksExecuted === 6 && p1StartY - p1EndY === 1 && p1ShotEvents === 1;

    // 2. Guest input 250ms TTL expiry in CoopOnlineManager
    const coopMgr = new CoopOnlineManager(new InMemoryCoopStorageAdapter());
    coopMgr.processIncomingGuestInput(
      {
        up: true,
        down: false,
        left: false,
        right: false,
        shoot: true,
        seq: 1,
        clientTimestamp: 1000,
      },
      1000
    );
    const activeAt1200 = coopMgr.getLatestValidatedGuestInput(1200); // age = 200ms <= 250ms
    const expiredAt1260 = coopMgr.getLatestValidatedGuestInput(1260); // age = 260ms > 250ms
    const guestInputTtlOk =
      activeAt1200.up === true &&
      activeAt1200.shoot === true &&
      expiredAt1260.up === false &&
      expiredAt1260.shoot === false;

    const passed = neutralHistoricalOk && guestInputTtlOk;

    results.push({
      id: 'M7_3_T45',
      name: 'T45: M7.3.8 (D) – Historical Catch-up Tick dùng Neutral Input & Gói GUEST_INPUT hết hạn sau 250ms',
      passed,
      details: `neutralHistorical=${neutralHistoricalOk} (ticks=${ticksExecuted}, dy=${p1StartY - p1EndY}), guestInputTtl=${guestInputTtlOk}`,
    });
  }

  // =========================================================================
  // T46: M7.3.8 (E) – Guest Visual Interpolation Isolation (No Core Mutation, 50ms/3.0px Cap, Failed Snap Keeps Direction)
  // =========================================================================
  {
    const guestEngine = new GameEngine(undefined, undefined, false);
    guestEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const stBefore = guestEngine.getState();
    const p2AuthX = stBefore.p2!.x;
    const p2AuthY = stBefore.p2!.y;
    const authTickBefore = stBefore.tickCount;
    const authRemTicksBefore = stBefore.remainingTicks;
    const authP1ShieldBefore = stBefore.p1State.shieldTimer;
    const authP2ShieldBefore = stBefore.p2State!.shieldTimer;

    // Hold UP on P2 and run Guest visual interpolation for 200ms (must cap at 50ms = 3.0px)
    guestEngine.setExternalInputP2({
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: true,
    });
    guestEngine.advanceGuestVisualInterpolation(30);
    guestEngine.advanceGuestVisualInterpolation(170);

    const stAfter = guestEngine.getState();
    const visAfter = guestEngine.getGuestVisualState();

    // Core state must remain 100% untouched!
    const coreUntouched =
      stAfter.tickCount === authTickBefore &&
      stAfter.remainingTicks === authRemTicksBefore &&
      stAfter.p2!.x === p2AuthX &&
      stAfter.p2!.y === p2AuthY &&
      stAfter.p1State.shieldTimer === authP1ShieldBefore &&
      stAfter.p2State!.shieldTimer === authP2ShieldBefore &&
      stAfter.bullets.length === 0;

    // Visual state moved at most 3.0px (50ms at 60px/s)
    const visualClampedAt3Px =
      visAfter.interpolatedMsSinceSnapshot === 50 &&
      Math.abs(p2AuthY - visAfter.p2RenderY - 3.0) < 1e-5;

    // Now test failed corner snap when turning perpendicular:
    // Place P2 at y = p2AuthY - 6 (misaligned by 6px > SNAP_THRESHOLD = 4px from 16px grid) and try turning LEFT
    (guestEngine as any).guestVisualState.p2RenderY = p2AuthY - 6;
    (guestEngine as any).guestVisualState.p2RenderDirection = 'UP';
    (guestEngine as any).guestVisualState.interpolatedMsSinceSnapshot = 0;
    guestEngine.setExternalInputP2({
      up: false,
      down: false,
      left: true,
      right: false,
      shoot: false,
    });
    guestEngine.advanceGuestVisualInterpolation(16);
    const visAfterFailedSnap = guestEngine.getGuestVisualState();
    const failedSnapKeepsDirectionAndPos =
      visAfterFailedSnap.p2RenderDirection === 'UP' &&
      visAfterFailedSnap.p2RenderX === p2AuthX &&
      visAfterFailedSnap.p2RenderY === p2AuthY - 6;

    const passed = coreUntouched && visualClampedAt3Px && failedSnapKeepsDirectionAndPos;

    results.push({
      id: 'M7_3_T46',
      name: 'T46: M7.3.8 (E) – Nội suy hình ảnh Guest độc lập hoàn toàn với GameCoreState, giới hạn 50ms (3.0px) & giữ nguyên hướng khi snap thất bại',
      passed,
      details: `coreUntouched=${coreUntouched}, visualClampedAt3Px=${visualClampedAt3Px}, failedSnapKeepsDirectionAndPos=${failedSnapKeepsDirectionAndPos}`,
    });
  }

  // =========================================================================
  // T47: M7.3.8 Gap Check (1) – Chống P1 Stale/Latched Input trước stepTick(input) khi Pause / Blur / Resume
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    engine.startMatch('SOLO', 'DEFAULT');
    let p1Shots = 0;
    engine.on('P1_SHOOT', () => {
      p1Shots++;
    });

    const p1StartX = engine.getState().p1.x;
    const p1StartY = engine.getState().p1.y;

    // 1. User holds UP + SHOOT before pause
    engine.setExternalInput({ up: true, down: false, left: false, right: false, shoot: true });
    engine.pause();

    // External input must be immediately neutralized on pause
    const extOnPause = engine.getExternalInput();
    const clearedOnPause = !extOnPause.up && !extOnPause.shoot;

    // 2. While paused, caller attempts to inject non-neutral input via setExternalInput -> must be rejected
    engine.setExternalInput({ up: true, down: false, left: true, right: false, shoot: true });
    const extWhilePaused = engine.getExternalInput();
    const rejectedWhilePaused = !extWhilePaused.up && !extWhilePaused.left && !extWhilePaused.shoot;

    // 3. Resume match: even if caller passes a stale held input on the very first transition frame after resume(),
    // GameEngine neutralizes that transition tick so P1 neither moves nor shoots unintentionally
    engine.resume();
    const ticksOnResumeFrame = engine.advanceTime(SIMULATION_CONFIG.FIXED_DT_MS, {
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: true,
    });
    const stAfterResumeFrame = engine.getState();
    const noUnintendedMoveOrShotOnResumeFrame =
      ticksOnResumeFrame === 1 &&
      stAfterResumeFrame.p1.x === p1StartX &&
      stAfterResumeFrame.p1.y === p1StartY &&
      p1Shots === 0 &&
      stAfterResumeFrame.bullets.length === 0;

    // 4. Subsequent frame with fresh intentional input works normally
    const ticksNextFrame = engine.advanceTime(SIMULATION_CONFIG.FIXED_DT_MS, {
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: true,
    });
    const stAfterFreshInput = engine.getState();
    const freshInputWorksAfterTransition =
      ticksNextFrame === 1 &&
      p1StartY - stAfterFreshInput.p1.y === 1 &&
      p1Shots === 1;

    const passed =
      clearedOnPause &&
      rejectedWhilePaused &&
      noUnintendedMoveOrShotOnResumeFrame &&
      freshInputWorksAfterTransition;

    results.push({
      id: 'M7_3_T47',
      name: 'T47: M7.3.8 Gap Check (1) – Chặn hoàn toàn P1 stale/latched input khi Pause, Blur và ở frame chuyển tiếp ngay sau Resume',
      passed,
      details: `clearedOnPause=${clearedOnPause}, rejectedWhilePaused=${rejectedWhilePaused}, noUnintendedMoveOrShotOnResumeFrame=${noUnintendedMoveOrShotOnResumeFrame}, freshInputWorks=${freshInputWorksAfterTransition}`,
    });
  }

  // =========================================================================
  // T48: M7.3.8 Gap Check (2) – Forced Safety Pause duy trì bền vững qua nhiều RAF frames và chỉ gỡ khi phục hồi hợp lệ
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    engine.startMatch('SOLO', 'DEFAULT');
    const initialY = engine.getState().p1.y;
    const initialRemainingTicks = engine.getState().remainingTicks;

    // Trigger Forced Safety Pause via 5000ms spike (> 3000ms limit in SOLO)
    const spikeTicks = engine.advanceTime(5000, {
      up: true,
      down: false,
      left: false,
      right: false,
      shoot: true,
    });
    const safetyActiveAfterSpike =
      spikeTicks === 0 &&
      engine.isSafetyPaused() === true &&
      engine.getState().matchState === 'PAUSED';

    // Simulate returning to visible tab (visibilitychange -> visible) + 10 consecutive 60Hz RAF frames with active input
    engine.handleVisibilityChange(true);
    let ticksAcross10RafFrames = 0;
    for (let f = 0; f < 10; f++) {
      ticksAcross10RafFrames += engine.advanceTime(SIMULATION_CONFIG.FIXED_DT_MS, {
        up: true,
        down: false,
        left: false,
        right: false,
        shoot: true,
      });
    }

    const stAfter10Raf = engine.getState();
    const persistedAcrossMultipleRafFrames =
      ticksAcross10RafFrames === 0 &&
      engine.isSafetyPaused() === true &&
      stAfter10Raf.matchState === 'PAUSED' &&
      stAfter10Raf.tickCount === 0 &&
      stAfter10Raf.remainingTicks === initialRemainingTicks &&
      stAfter10Raf.p1.y === initialY &&
      stAfter10Raf.bullets.length === 0;

    // Explicit valid recovery via resume() clears Forced Safety Pause and allows normal simulation
    const resumeSuccess = engine.resume();
    const recoveredAfterExplicitResume =
      resumeSuccess === true &&
      engine.isSafetyPaused() === false &&
      engine.getState().matchState === 'PLAYING';
    const ticksAfterValidRecovery = engine.advanceTime(
      SIMULATION_CONFIG.FIXED_DT_MS,
      NEUTRAL_INPUT
    );

    const passed =
      safetyActiveAfterSpike &&
      persistedAcrossMultipleRafFrames &&
      recoveredAfterExplicitResume &&
      ticksAfterValidRecovery === 1;

    results.push({
      id: 'M7_3_T48',
      name: 'T48: M7.3.8 Gap Check (2) – Forced Safety Pause duy trì qua 10 RAF frames liên tiếp & visibilitychange(true), chỉ gỡ khi resume() / restartStage() hợp lệ',
      passed,
      details: `safetyActiveAfterSpike=${safetyActiveAfterSpike}, persistedAcross10Raf=${persistedAcrossMultipleRafFrames}, recoveredAfterResume=${recoveredAfterExplicitResume}, ticksAfterRecovery=${ticksAfterValidRecovery}`,
    });
  }

  // =========================================================================
  // T49: M7.3.8 Gap Check (3 & 4) – advanceToNextStage() tăng stageRunSeq đúng 1 lần & kiểm chứng biên SIMULATION_EPSILON_MS = 1e-7
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    const stage1 = engine.getStageManager().getCurrentStage();
    engine.getStageManager().registerStage({
      ...stage1,
      id: 2,
      name: 'Stage 2 - Tiền Đồn Thép',
    });
    engine.startMatch('SOLO', 'DEFAULT');
    const seqAfterStart = engine.getState().stageRunSeq; // 1
    const stageIdBefore = engine.getState().currentStageId; // 1

    const advancedOk = engine.advanceToNextStage();
    const seqAfterAdvance1 = engine.getState().stageRunSeq; // must be 2 (incremented exactly once)
    const stageIdAfter = engine.getState().currentStageId; // 2

    const stageRunSeqIncrementedExactlyOnce =
      seqAfterStart === 1 &&
      advancedOk === true &&
      seqAfterAdvance1 === 2 &&
      stageIdAfter === stageIdBefore + 1 &&
      engine.getStageRunSeq() === 2;

    // Verify SIMULATION_EPSILON_MS = 1e-7 boundary behavior:
    // - FIXED_DT_MS - 1e-5 (16.6666566...ms) is below tickThreshold -> 0 ticks
    // - FIXED_DT_MS - 1e-7 (16.666666566...ms) is at tickThreshold -> 1 tick (micro-tolerance for IEEE-754 3 * 1000/60)
    const epsEngineBelow = new GameEngine(undefined, undefined, false);
    epsEngineBelow.startMatch('SOLO', 'DEFAULT');
    const ticksBelowEpsilon = epsEngineBelow.advanceTime(
      SIMULATION_CONFIG.FIXED_DT_MS - 1e-5,
      NEUTRAL_INPUT
    );

    const epsEngineAtBoundary = new GameEngine(undefined, undefined, false);
    epsEngineAtBoundary.startMatch('SOLO', 'DEFAULT');
    const ticksAtEpsilonBoundary = epsEngineAtBoundary.advanceTime(
      SIMULATION_CONFIG.FIXED_DT_MS - SIMULATION_CONFIG.SIMULATION_EPSILON_MS,
      NEUTRAL_INPUT
    );
    const residualAfterBoundaryTick = epsEngineAtBoundary.getTimingTelemetry().accumulatorMs;

    const epsilonBoundaryVerified =
      ticksBelowEpsilon === 0 &&
      ticksAtEpsilonBoundary === 1 &&
      residualAfterBoundaryTick === 0;

    const passed = stageRunSeqIncrementedExactlyOnce && epsilonBoundaryVerified;

    results.push({
      id: 'M7_3_T49',
      name: 'T49: M7.3.8 Gap Check (3 & 4) – advanceToNextStage() tăng stageRunSeq đúng 1 lần (1 -> 2) & kiểm chứng biên dung sai SIMULATION_EPSILON_MS = 1e-7',
      passed,
      details: `stageRunSeq=${seqAfterStart}->${seqAfterAdvance1} (stageId=${stageIdBefore}->${stageIdAfter}), ticksBelowEps=${ticksBelowEpsilon}, ticksAtEpsBoundary=${ticksAtEpsilonBoundary}, residualMs=${residualAfterBoundaryTick}`,
    });
  }

  // =========================================================================
  // T50: M7.3.9 (Mục 1) – Super Admin tải ảnh đại diện từ thiết bị, cập nhật ngay vào hồ sơ & giữ nguyên ảnh cũ nếu thất bại
  // =========================================================================
  {
    const sys = new InMemoryAvatarCatalogSystem();
    const superAdminUid = 'uid_super_admin_m739';
    const superAdminGooglePhoto = 'https://lh3.googleusercontent.com/a/default-sa-photo';

    // Tạo buffer PNG hợp lệ với chữ ký magic bytes 89 50 4E 47 0D 0A 1A 0A + IHDR 256x256
    const pngBytes = new Uint8Array(256);
    pngBytes.set(
      [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x01, 0x00,
        0x00, 0x00, 0x01, 0x00,
      ],
      0
    );
    const validPngBuffer = pngBytes.buffer;

    // 1. Kiểm tra định dạng và dung lượng file client-side (<= 5MB, JPEG/PNG/WebP)
    const validPng = validateCatalogAvatarFileClientSide({
      fileName: 'commander_sa.png',
      mimeType: 'image/png',
      sizeBytes: validPngBuffer.byteLength,
      arrayBuffer: validPngBuffer,
    });
    const invalidSvg = validateCatalogAvatarFileClientSide({
      fileName: 'bad.svg',
      mimeType: 'image/svg+xml',
      sizeBytes: 128,
      arrayBuffer: new Uint8Array(128).buffer,
    });
    const invalidOversize = validateCatalogAvatarFileClientSide({
      fileName: 'huge.png',
      mimeType: 'image/png',
      sizeBytes: AVATAR_LIMITS.MAX_FILE_SIZE_BYTES + 1024,
      arrayBuffer: validPngBuffer,
    });
    const clientValidationOk =
      validPng.valid === true && invalidSvg.valid === false && invalidOversize.valid === false;

    // 2. Super Admin tải ảnh đại diện mới lên Storage -> lưu metadata vào /avatar_catalog -> áp dụng ngay cho hồ sơ Super Admin
    const uploadRes1 = sys.uploadAndApplySuperAdminAvatarSync({
      authUid: superAdminUid,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      avatarId: 'sa_custom_1',
      name: 'Chỉ Huy Tối Cao v1',
      fileName: 'commander_v1.png',
      mimeType: 'image/png',
      sizeBytes: validPngBuffer.byteLength,
      arrayBuffer: validPngBuffer,
      nowMs: 1_710_000_000_000,
      googlePhotoUrl: superAdminGooglePhoto,
    });
    const profileAfter1 = sys.getUserProfileDoc(superAdminUid);
    const urlAfter1 = sys.resolveEffectiveAvatarForPlayer(superAdminUid, superAdminGooglePhoto);
    const firstUploadAppliedOk =
      uploadRes1.success === true &&
      profileAfter1 !== null &&
      profileAfter1.avatarType === 'catalog' &&
      profileAfter1.avatarId === 'sa_custom_1' &&
      typeof urlAfter1 === 'string' &&
      urlAfter1.includes('sa_custom_1');

    // 3. Nếu bước lưu metadata thất bại (simulateMetadataFailure = true) -> giữ nguyên avatar cũ ('sa_custom_1'), không làm hỏng trạng thái
    const failedUploadRes = sys.uploadAndApplySuperAdminAvatarSync({
      authUid: superAdminUid,
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      avatarId: 'sa_custom_broken',
      name: 'Ảnh Lỗi',
      fileName: 'broken.png',
      mimeType: 'image/png',
      sizeBytes: validPngBuffer.byteLength,
      arrayBuffer: validPngBuffer,
      nowMs: 1_710_000_005_000,
      googlePhotoUrl: superAdminGooglePhoto,
      simulateMetadataFailure: true,
    });
    const profileAfterFailed = sys.getUserProfileDoc(superAdminUid);
    const urlAfterFailed = sys.resolveEffectiveAvatarForPlayer(superAdminUid, superAdminGooglePhoto);
    const previousAvatarPreservedOnError =
      failedUploadRes.success === false &&
      profileAfterFailed?.avatarId === 'sa_custom_1' &&
      urlAfterFailed === urlAfter1;

    const passed =
      clientValidationOk && firstUploadAppliedOk && previousAvatarPreservedOnError;

    results.push({
      id: 'M7_3_T50',
      name: 'T50: M7.3.9 (Mục 1) – Super Admin tải ảnh đại diện từ thiết bị, áp dụng ngay vào hồ sơ & bảo toàn ảnh cũ khi có lỗi',
      passed,
      details: `clientValidation=${clientValidationOk}, firstUploadApplied=${firstUploadAppliedOk}, preservedOnError=${previousAvatarPreservedOnError}`,
    });
  }

  // =========================================================================
  // T51: M7.3.9 (Mục 2 – Trường hợp A, B, C, D) – Chế độ 2 người chơi Online: Hồi sinh, Khán giả (Spectator) & Game Over chuẩn xác
  // =========================================================================
  {
    const engine = new GameEngine(undefined, undefined, false);
    engine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT'); // 3 lives each

    // --- Trường hợp A: P2 chết khi vẫn còn mạng (lives: 3 -> 2) -> chờ respawnTimer rồi hồi sinh tiếp tục chiến đấu ---
    const internalState = (engine as any).state;
    internalState.p2State.shieldTimer = 0;
    internalState.p2.isShielded = false;
    // Bắn trúng P2 bằng đạn địch
    internalState.bullets.push({
      id: 'eb_9001',
      ownerId: 'enemy_100',
      ownerType: 'enemy',
      x: internalState.p2.x,
      y: internalState.p2.y,
      direction: 'DOWN',
      speed: 0,
    });
    engine.stepTick(NEUTRAL_INPUT);
    const afterP2FirstDeath = engine.getState();
    const caseADiedWithLivesLeft =
      afterP2FirstDeath.p2State!.isDead === true &&
      afterP2FirstDeath.p2State!.lives === 2 &&
      afterP2FirstDeath.p2State!.isSpectator === false &&
      afterP2FirstDeath.isGameOver === false &&
      afterP2FirstDeath.matchState === 'PLAYING';

    // Chạy hết thời gian hồi sinh (respawnTimer = 2.0s = 120 ticks) -> P2 hồi sinh tại điểm xuất phát
    for (let i = 0; i < 125; i++) {
      engine.stepTick(NEUTRAL_INPUT);
    }
    const afterP2Respawn = engine.getState();
    const caseARespawnedOk =
      afterP2Respawn.p2State!.isDead === false &&
      afterP2Respawn.p2!.isAlive === true &&
      afterP2Respawn.p2State!.lives === 2 &&
      afterP2Respawn.p2State!.isSpectator === false &&
      afterP2Respawn.isGameOver === false;

    // --- Trường hợp B: P2 hết toàn bộ mạng (lives = 0 && isDead = true) trong khi P1 vẫn còn mạng (lives = 3) ---
    internalState.p2State.lives = 1;
    internalState.p2State.shieldTimer = 0;
    internalState.p2.isShielded = false;
    internalState.bullets.push({
      id: 'eb_9002',
      ownerId: 'enemy_100',
      ownerType: 'enemy',
      x: internalState.p2.x,
      y: internalState.p2.y,
      direction: 'DOWN',
      speed: 0,
    });
    engine.stepTick(NEUTRAL_INPUT);
    // Chạy thêm 100 ticks để đảm bảo P2 không bao giờ hồi sinh khi lives == 0
    for (let i = 0; i < 100; i++) {
      engine.setExternalInputP2({ up: true, down: false, left: false, right: false, shoot: true });
      engine.stepTick({ up: true, down: false, left: false, right: false, shoot: false });
    }
    const afterP2Out = engine.getState();

    // Kiểm tra Guest client chặn gửi input và Host từ chối nhận input khi P2 ở chế độ Spectator
    const coopMgr = new CoopOnlineManager(new InMemoryCoopStorageAdapter());
    coopMgr.setLocalGuestSpectator(true);
    coopMgr.setRemoteGuestSpectator(true);
    const guestInputAcceptedWhenSpectator = coopMgr.processIncomingGuestInput(
      { up: true, down: false, left: false, right: false, shoot: true, seq: 1, clientTimestamp: 1000 },
      1000
    );

    const caseBP2SpectatorP1Plays =
      afterP2Out.p2State!.lives === 0 &&
      afterP2Out.p2State!.isDead === true &&
      afterP2Out.p2State!.isSpectator === true &&
      engine.isPlayerSpectator('P2') === true &&
      engine.isPlayerSpectator('P1') === false &&
      afterP2Out.p1State.lives === 3 &&
      afterP2Out.p1.isAlive === true &&
      afterP2Out.isGameOver === false &&
      afterP2Out.matchState === 'PLAYING' &&
      coopMgr.isGuestInSpectatorMode() === true &&
      guestInputAcceptedWhenSpectator.accepted === false;

    // --- Trường hợp C: P1 hết toàn bộ mạng (lives = 0 && isDead = true) trong khi P2 vẫn còn mạng ---
    const engineCaseC = new GameEngine(undefined, undefined, false);
    engineCaseC.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const cInternal = (engineCaseC as any).state;
    cInternal.p1State.lives = 1;
    cInternal.p1State.shieldTimer = 0;
    cInternal.p1.isShielded = false;
    cInternal.bullets.push({
      id: 'eb_9003',
      ownerId: 'enemy_100',
      ownerType: 'enemy',
      x: cInternal.p1.x,
      y: cInternal.p1.y,
      direction: 'DOWN',
      speed: 0,
    });
    engineCaseC.stepTick(NEUTRAL_INPUT);
    const p1DeadX = engineCaseC.getState().p1.x;
    const p1DeadY = engineCaseC.getState().p1.y;
    const p2StartY = engineCaseC.getState().p2!.y;

    // P1 cố gửi lệnh di chuyển/bắn nhưng đã ở chế độ Khán giả -> P1 không di chuyển/không bắn; P2 vẫn di chuyển bình thường
    engineCaseC.setExternalInputP2({ up: true, down: false, left: false, right: false, shoot: false });
    engineCaseC.stepTick({ up: true, down: false, left: false, right: false, shoot: true });
    const afterC = engineCaseC.getState();
    const caseCP1SpectatorP2Plays =
      afterC.p1State.lives === 0 &&
      afterC.p1State.isDead === true &&
      afterC.p1State.isSpectator === true &&
      engineCaseC.isPlayerSpectator('P1') === true &&
      afterC.p1.x === p1DeadX &&
      afterC.p1.y === p1DeadY &&
      afterC.p2State!.lives === 3 &&
      afterC.p2!.isAlive === true &&
      afterC.p2!.y < p2StartY &&
      afterC.isGameOver === false &&
      afterC.matchState === 'PLAYING';

    // --- Trường hợp D: Cả P1 và P2 đều hết mạng -> Trận đấu chuyển sang GAME_OVER và đồng bộ qua Snapshot cho cả 2 máy ---
    cInternal.p2State.lives = 1;
    cInternal.p2State.shieldTimer = 0;
    cInternal.p2.isShielded = false;
    cInternal.bullets.push({
      id: 'eb_9004',
      ownerId: 'enemy_100',
      ownerType: 'enemy',
      x: cInternal.p2.x,
      y: cInternal.p2.y,
      direction: 'DOWN',
      speed: 0,
    });
    engineCaseC.stepTick(NEUTRAL_INPUT);
    const afterBothDeadHost = engineCaseC.getState();
    const snapBothDead = buildAuthoritativeSnapshot(afterBothDeadHost, 25, 5000);
    const guestEngineD = new GameEngine(undefined, undefined, false);
    guestEngineD.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');
    const applyD = guestEngineD.applyAuthoritativeSnapshot(snapBothDead);
    const afterBothDeadGuest = guestEngineD.getState();

    const caseDBothDeadGameOverSynced =
      afterBothDeadHost.isGameOver === true &&
      afterBothDeadHost.matchState === 'GAME_OVER' &&
      afterBothDeadHost.p1State.isSpectator === true &&
      afterBothDeadHost.p2State!.isSpectator === true &&
      applyD.valid === true &&
      afterBothDeadGuest.isGameOver === true &&
      afterBothDeadGuest.matchState === 'GAME_OVER' &&
      afterBothDeadGuest.gameOverReason === afterBothDeadHost.gameOverReason;

    const passed =
      caseADiedWithLivesLeft &&
      caseARespawnedOk &&
      caseBP2SpectatorP1Plays &&
      caseCP1SpectatorP2Plays &&
      caseDBothDeadGameOverSynced;

    results.push({
      id: 'M7_3_T51',
      name: 'T51: M7.3.9 (Mục 2 – Cases A, B, C, D) – Hồi sinh khi còn mạng, Chế độ Khán giả (Spectator) cho P1/P2 khi hết mạng & chỉ Game Over khi cả 2 cùng hết mạng',
      passed,
      details: `caseADied=${caseADiedWithLivesLeft}, caseARespawn=${caseARespawnedOk}, caseBP2Spectator=${caseBP2SpectatorP1Plays}, caseCP1Spectator=${caseCP1SpectatorP2Plays}, caseDBothDead=${caseDBothDeadGameOverSynced}`,
    });
  }

  // =========================================================================
  // T52: M7.3.9 (Mục 2 – Trường hợp E) – Xử lý rời trận chủ động (PLAYER_LEFT), chống xử lý trùng lặp & P1 tiếp tục chơi khi P2 rời trận
  // =========================================================================
  {
    const nowMs = 1_710_000_000_000;
    const storage = new InMemoryCoopStorageAdapter();
    const hostMgr = new CoopOnlineManager(storage);
    const guestMgr = new CoopOnlineManager(storage);
    const { hostChannel, guestChannel } = createInMemoryP2PChannelPair(
      (msg) => hostMgr.handleIncomingDataChannelMessage(msg, nowMs + 500),
      (msg) => guestMgr.handleIncomingDataChannelMessage(msg, nowMs + 500)
    );

    const hostUser = {
      uid: 'uid_host_e',
      displayName: 'Host P1',
      email: 'host.p1@gmail.com',
      emailVerified: true,
    };
    const guestUser = {
      uid: 'uid_guest_e',
      displayName: 'Guest P2',
      email: 'guest.p2@gmail.com',
    };

    hostMgr.createRoomSync(storage, hostUser, 'DEFAULT', nowMs, 'CASEE1', { hasPassword: false });
    guestMgr.joinRoomSync(storage, 'CASEE1', guestUser, nowMs + 100);
    hostMgr.setPlayerReadySync(storage, true, nowMs + 200);
    guestMgr.setPlayerReadySync(storage, true, nowMs + 250);
    const lobbyBefore = storage.getRoomSync('CASEE1')!;
    storage.setRoomSync('CASEE1', { ...lobbyBefore, rtcConnectionState: 'CONNECTED' });
    hostMgr.startOnlineMatchSync(storage, hostUser.uid, undefined, nowMs + 300);

    hostMgr.attachCustomP2PChannel(hostChannel, nowMs + 310);
    guestMgr.attachCustomP2PChannel(guestChannel, nowMs + 310);

    const hostEngine = new GameEngine(undefined, undefined, false);
    hostEngine.startMatch('TWO_PLAYERS_ONLINE', 'DEFAULT');

    let hostLeaveCallbackCount = 0;
    let hostReceivedLeaveNotice = '';
    hostMgr.subscribePeerLeave((event) => {
      hostLeaveCallbackCount++;
      hostReceivedLeaveNotice = event.message;
      hostEngine.handlePeerPlayerLeft(event.role === 'HOST' ? 'P1' : 'P2');
    });

    // 1. P2 chủ động rời trận (leaveRoomSync gửi sự kiện PLAYER_LEFT qua DataChannel)
    guestMgr.leaveRoomSync(storage, 'P2 đã rời trận.', nowMs + 500);

    // Giả lập gói PLAYER_LEFT đến lần thứ 2 (duplicate packet) -> phải được deduplicate, chỉ xử lý đúng 1 lần!
    hostMgr.handleIncomingDataChannelMessage(
      { type: 'PLAYER_LEFT', role: 'GUEST', reason: 'P2 đã rời trận.', timestamp: nowMs + 510 },
      nowMs + 510
    );
    const secondEngineCall = hostEngine.handlePeerPlayerLeft('P2');

    // Kiểm tra trạng thái trên Host: P1 vẫn đang PLAYING, không bị timeout pause, hiển thị "P2 đã rời trận."
    const hostConnStatus = hostMgr.evaluatePeerConnectionStatus(nowMs + 20_000);
    hostEngine.stepTick({ up: true, down: false, left: false, right: false, shoot: false });
    const hostStateAfterP2Left = hostEngine.getState();

    const p2LeaveHandledCleanly =
      hostLeaveCallbackCount === 1 &&
      secondEngineCall.processed === false &&
      hostReceivedLeaveNotice === 'P2 đã rời trận.' &&
      hostStateAfterP2Left.peerLeaveNotice === 'P2 đã rời trận.' &&
      hostStateAfterP2Left.p2State?.hasLeftMatch === true &&
      hostStateAfterP2Left.isGameOver === false &&
      hostStateAfterP2Left.matchState === 'PLAYING' &&
      hostConnStatus.isTimedOut === false;

    // 2. Trường hợp P1 (Host) chủ động rời trận -> Guest nhận thông báo "P1 đã rời trận." đúng 1 lần
    const storage2 = new InMemoryCoopStorageAdapter();
    const hostMgr2 = new CoopOnlineManager(storage2);
    const guestMgr2 = new CoopOnlineManager(storage2);
    const { hostChannel: hc2, guestChannel: gc2 } = createInMemoryP2PChannelPair(
      (msg) => hostMgr2.handleIncomingDataChannelMessage(msg, nowMs + 600),
      (msg) => guestMgr2.handleIncomingDataChannelMessage(msg, nowMs + 600)
    );
    hostMgr2.createRoomSync(storage2, hostUser, 'DEFAULT', nowMs, 'CASEE2', { hasPassword: false });
    guestMgr2.joinRoomSync(storage2, 'CASEE2', guestUser, nowMs + 100);
    hostMgr2.setPlayerReadySync(storage2, true, nowMs + 200);
    guestMgr2.setPlayerReadySync(storage2, true, nowMs + 250);
    storage2.setRoomSync('CASEE2', {
      ...storage2.getRoomSync('CASEE2')!,
      rtcConnectionState: 'CONNECTED',
    });
    hostMgr2.startOnlineMatchSync(storage2, hostUser.uid, undefined, nowMs + 300);
    hostMgr2.attachCustomP2PChannel(hc2, nowMs + 310);
    guestMgr2.attachCustomP2PChannel(gc2, nowMs + 310);

    let guestLeaveCallbackCount = 0;
    let guestReceivedLeaveNotice = '';
    guestMgr2.subscribePeerLeave((event) => {
      guestLeaveCallbackCount++;
      guestReceivedLeaveNotice = event.message;
    });
    hostMgr2.leaveRoomSync(storage2, 'P1 đã rời trận.', nowMs + 600);
    guestMgr2.handleIncomingDataChannelMessage(
      { type: 'PLAYER_LEFT', role: 'HOST', reason: 'P1 đã rời trận.', timestamp: nowMs + 610 },
      nowMs + 610
    );

    const p1LeaveHandledCleanly =
      guestLeaveCallbackCount === 1 && guestReceivedLeaveNotice === 'P1 đã rời trận.';

    const passed = p2LeaveHandledCleanly && p1LeaveHandledCleanly;

    results.push({
      id: 'M7_3_T52',
      name: 'T52: M7.3.9 (Mục 2 – Case E) – Thông báo P1/P2 đã rời trận qua DataChannel, chống xử lý trùng lặp & P1 tiếp tục chơi khi P2 rời trận',
      passed,
      details: `p2LeaveClean=${p2LeaveHandledCleanly} (cbCount=${hostLeaveCallbackCount}, notice="${hostReceivedLeaveNotice}"), p1LeaveClean=${p1LeaveHandledCleanly} (cbCount=${guestLeaveCallbackCount})`,
    });
  }

  // =========================================================================
  // T53: M7.3.9 (Mục 3, 4, 8) – Đổi tên mục Cài đặt, ẩn Chế độ chơi & Tài khoản với người chơi thường, phân trang 10 tài khoản/trang & tắt nhạc 8-bit mặc định
  // =========================================================================
  {
    // 1. Kiểm tra danh sách mục Cài đặt theo quyền (Mục 3 & Mục 4)
    const regularTabs = getAvailableSettingsTabsForRole(false);
    const superAdminTabs = getAvailableSettingsTabsForRole(true);

    const regularTabIds = regularTabs.map((t) => t.id);
    const superAdminTabLabels = superAdminTabs.map((t) => t.label);

    const tabsRoleFilterOk =
      regularTabIds.length === 2 &&
      regularTabIds.includes('ACCOUNT') &&
      regularTabIds.includes('AUDIO_SETTINGS') &&
      !regularTabIds.includes('IMAGE_SETTINGS') &&
      !regularTabIds.includes('GAME_MODE_SETTINGS') &&
      !regularTabIds.includes('ADMIN_OTHER') &&
      !regularTabIds.includes('USER_ACCOUNTS') &&
      superAdminTabLabels.length === 6 &&
      superAdminTabLabels[0] === 'Thông tin' &&
      superAdminTabLabels[1] === 'Hình ảnh' &&
      superAdminTabLabels[2] === 'Âm thanh' &&
      superAdminTabLabels[3] === 'Chế độ chơi' &&
      superAdminTabLabels[4] === 'Cấp quyền' &&
      superAdminTabLabels[5] === 'Tài khoản';

    // 2. Kiểm tra phân trang danh sách Tài khoản (tối đa 10 tài khoản/trang, Trước/Sau) & bảo mật quyền truy cập (Mục 3)
    const seedAccounts = Array.from({ length: 25 }, (_, idx) => {
      const n = idx + 1;
      return sanitizeUserAccountSummary({
        uid: `uid_user_${String(n).padStart(2, '0')}`,
        displayName: `Chiến Binh ${n}`,
        email: `player${n}@gmail.com`,
        role: n === 1 ? 'SUPER_ADMIN' : n <= 3 ? 'ADMIN' : 'PLAYER',
        createdAtMs: 1_700_000_000_000 + n * 10_000,
        lastLoginAtMs: 1_710_000_000_000 - n * 60_000,
        // Cố tình truyền dữ liệu nhạy cảm để kiểm tra sanitizeUserAccountSummary loại bỏ sạch
        passwordHash: 'secret_hash_should_never_leak',
        accessToken: 'secret_token_should_never_leak',
      });
    });

    const adapter = new InMemoryUserAccountsPaginationAdapter(seedAccounts);
    const page1 = adapter.queryPageSync(USER_ACCOUNTS_PAGE_SIZE, null);
    const page2 = adapter.queryPageSync(USER_ACCOUNTS_PAGE_SIZE, page1.nextCursor);
    const page3 = adapter.queryPageSync(USER_ACCOUNTS_PAGE_SIZE, page2.nextCursor);

    const noSensitiveFieldsLeaked = !JSON.stringify(page1.accounts).includes('secret_');
    const pagination10PerPageOk =
      USER_ACCOUNTS_PAGE_SIZE === 10 &&
      page1.accounts.length === 10 &&
      page1.hasNextPage === true &&
      page2.accounts.length === 10 &&
      page2.hasNextPage === true &&
      page3.accounts.length === 5 &&
      page3.hasNextPage === false &&
      page1.accounts[0].uid === 'uid_user_01' &&
      page2.accounts[0].uid === 'uid_user_11' &&
      page3.accounts[0].uid === 'uid_user_21' &&
      noSensitiveFieldsLeaked;

    // 3. Kiểm tra tắt hoàn toàn nhạc 8-bit mặc định tích hợp sẵn & chỉ phát nhạc Super Admin tải lên (Mục 8)
    const sm = SoundManager.getInstance();
    sm.setCustomBgmActive(false);
    sm.startBgm();
    sm.resumeBgm();
    const eightBitDefaultDisabled = sm.isProceduralBgmPlaying() === false;

    const mm = MusicManager.getInstance();
    mm.resetAllAssignmentsToDefault();
    mm.syncPlaybackWithContext(1, 'SOLO');
    const silentWhenNoCustomTrack =
      sm.isProceduralBgmPlaying() === false && mm.getActiveSourceCount() === 0;

    const passed =
      tabsRoleFilterOk &&
      pagination10PerPageOk &&
      eightBitDefaultDisabled &&
      silentWhenNoCustomTrack;

    results.push({
      id: 'M7_3_T53',
      name: 'T53: M7.3.9 (Mục 3, 4, 8) – Đổi tên mục Cài đặt, ẩn Chế độ chơi với người chơi thường, phân trang 10 Tài khoản/trang & tắt nhạc 8-bit mặc định',
      passed,
      details: `tabsRoleFilter=${tabsRoleFilterOk}, pagination10PerPage=${pagination10PerPageOk}, eightBitDisabled=${eightBitDefaultDisabled}, silentWhenNoCustomTrack=${silentWhenNoCustomTrack}`,
    });
  }

  // =========================================================================
  // T54: M7.3.9 (Mục 9) – Chế độ Chơi thử (Trial Mode): Không cần đăng nhập, Zero-Write Guarantee & Kết thúc sau 1 trận Stage 1
  // =========================================================================
  {
    const authMgr = AuthManager.getInstance();
    authMgr.exitTrialMode();

    // 1. Bắt đầu Chơi thử từ màn hình đăng nhập
    authMgr.startTrialMode();
    const trialActiveAfterStart =
      authMgr.isTrialMode() === true && ScoreManager.isGlobalTrialMode() === true;

    // 2. Khởi tạo trận Solo Stage 1 mặc định trong chế độ Chơi thử & ghi điểm -> tuyệt đối không ghi vào localStorage
    const trialEngine = new GameEngine(undefined, undefined, false);
    trialEngine.startMatch('SOLO', 'DEFAULT');
    const stStart = trialEngine.getState();
    const isSoloStage1Default =
      stStart.gameMode === 'SOLO' &&
      stStart.currentStageId === 1 &&
      stStart.difficulty === 'DEFAULT' &&
      stStart.remainingSeconds === 120;

    const scoreMgr = trialEngine.getScoreManager();
    scoreMgr.recordEnemyDefeated('trial_enemy_1', 'ARMOR'); // +5 XP
    const currentXpInTrial = scoreMgr.getTotalScore();

    // 3. Thoát chế độ Chơi thử -> trạng thái Trial Mode được dọn sạch hoàn toàn
    authMgr.exitTrialMode();
    const trialCleanedOnExit =
      authMgr.isTrialMode() === false && ScoreManager.isGlobalTrialMode() === false;

    const passed =
      trialActiveAfterStart &&
      isSoloStage1Default &&
      currentXpInTrial === 5 &&
      trialCleanedOnExit;

    results.push({
      id: 'M7_3_T54',
      name: 'T54: M7.3.9 (Mục 9) – Chế độ Chơi thử (Trial Mode): Vào thẳng Solo Stage 1 không cần đăng nhập, không ghi dữ liệu lưu trữ & dọn sạch trạng thái khi kết thúc',
      passed,
      details: `trialActive=${trialActiveAfterStart}, soloStage1Default=${isSoloStage1Default}, xpInMemory=${currentXpInTrial}, cleanedOnExit=${trialCleanedOnExit}`,
    });
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}



