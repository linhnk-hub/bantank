/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SUPER_ADMIN_EMAIL,
  isSuperAdminUser,
  getUserDisplayLabel,
  type ValidatedUserAccount,
} from './authManager.ts';
import { MusicManager } from './musicManager.ts';
import { getSessionBadgeInfo } from '../components/AuthSessionBanner.tsx';
import { GameEngine } from './gameEngine.ts';
import { TILE_TYPES as TileType } from './types.ts';
import {
  CoopOnlineManager,
  InMemoryCoopStorageAdapter,
  createInMemoryP2PChannelPair,
  generateRoomCode,
  validateRoomCodeFormat,
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
  COOP_ONLINE_CONFIG,
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

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

