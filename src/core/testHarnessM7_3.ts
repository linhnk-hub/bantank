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
  evaluateCoopRoomRuleUpdate,
  COOP_ONLINE_CONFIG,
  type CoopRoomDocument,
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

    const baseRoom: CoopRoomDocument = {
      roomCode: 'TANK99',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: hostUser.uid,
      hostDisplayName: hostUser.displayName,
      hostPhotoURL: '',
      hostReady: false,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestPhotoURL: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      rtcConnectionState: 'NEW',
      finalScore: 0,
      matchOutcome: null,
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

    const roomWithGuest: CoopRoomDocument = {
      ...baseRoom,
      guestUid: guestUser.uid,
      guestDisplayName: guestUser.displayName,
    };
    const thirdPlayerCheck = evaluateJoinRoomCandidate(roomWithGuest, 'TANK99', thirdUser, t0 + 3000);

    const startedRoomWithoutGuest: CoopRoomDocument = {
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
  // M7_3_T07: Xác nhận Sẵn sàng (Ready) của cả 2 người chơi trước khi Chủ phòng bắt đầu
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const roomWaitingNoGuest: CoopRoomDocument = {
      roomCode: 'TANK88',
      status: 'WAITING',
      difficulty: 'EXTREME',
      hostUid: 'uid_host',
      hostDisplayName: 'Host',
      hostPhotoURL: '',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestPhotoURL: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      rtcConnectionState: 'NEW',
      finalScore: 0,
      matchOutcome: null,
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    const startWithoutGuest = evaluateStartMatchCandidate(roomWaitingNoGuest, 'uid_host', 'HOST');

    const roomGuestNotReady: CoopRoomDocument = {
      ...roomWaitingNoGuest,
      guestUid: 'uid_guest',
      guestDisplayName: 'Guest',
      hostReady: true,
      guestReady: false,
    };
    const startGuestNotReady = evaluateStartMatchCandidate(roomGuestNotReady, 'uid_host', 'HOST');

    const roomBothReady: CoopRoomDocument = {
      ...roomGuestNotReady,
      hostReady: true,
      guestReady: true,
    };
    const startByGuest = evaluateStartMatchCandidate(roomBothReady, 'uid_guest', 'GUEST');
    const startByHostBothReady = evaluateStartMatchCandidate(roomBothReady, 'uid_host', 'HOST');

    const passed =
      startWithoutGuest.success === false &&
      startWithoutGuest.errorCode === 'PLAYERS_NOT_READY' &&
      startGuestNotReady.success === false &&
      startGuestNotReady.errorCode === 'PLAYERS_NOT_READY' &&
      startByGuest.success === false &&
      startByGuest.errorCode === 'NOT_HOST' &&
      startByHostBothReady.success === true;

    results.push({
      id: 'M7_3_T07',
      name: 'Bắt buộc cả P1 (Host) và P2 (Guest) xác nhận Sẵn sàng mới cho phép Host bắt đầu trận',
      passed,
      details: `noGuest=${startWithoutGuest.errorCode}, guestUnready=${startGuestNotReady.errorCode}, guestTryStart=${startByGuest.errorCode}, hostBothReady=${startByHostBothReady.success}`,
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
      hostPhotoURL: '',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest',
      guestDisplayName: 'Guest',
      guestPhotoURL: '',
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
  // M7_3_T13: Kiểm chứng Firestore Rules /coop_rooms/{roomCode} (Phân tách quyền Host/Guest/Người thứ 3)
  // =========================================================================
  {
    const t0 = 1_700_000_000_000;
    const waitingRoom: CoopRoomDocument = {
      roomCode: 'TANK66',
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostPhotoURL: '',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: null,
      guestDisplayName: null,
      guestPhotoURL: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      rtcConnectionState: 'NEW',
      finalScore: 0,
      matchOutcome: null,
      createdAt: t0,
      expiresAt: t0 + COOP_ONLINE_CONFIG.ROOM_TTL_MS,
      disconnectReason: null,
    };

    // 1. Guest 2 joins open room -> ALLOWED (GUEST_JOIN)
    const afterGuestJoin: CoopRoomDocument = {
      ...waitingRoom,
      guestUid: 'uid_guest_2',
      guestDisplayName: 'Guest 2',
      guestPhotoURL: '',
      guestReady: false,
      guestLastActiveAt: t0 + 1000,
      rtcConnectionState: 'CONNECTING',
    };
    const guestJoinEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 1000,
      existing: waitingRoom,
      incoming: afterGuestJoin,
    });

    // 2. Third player tries to overwrite guestUid -> REJECTED
    const thirdPlayerHijack: CoopRoomDocument = {
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

    // 3. Guest 2 updates guestReady and rtcAnswer -> ALLOWED (GUEST_SIGNALING_OR_READY)
    const guestReadyUpdate: CoopRoomDocument = {
      ...afterGuestJoin,
      guestReady: true,
      rtcAnswer: '{"type":"answer","sdp":"v=0..."}',
      guestLastActiveAt: t0 + 3000,
    };
    const guestReadyEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3000,
      existing: afterGuestJoin,
      incoming: guestReadyUpdate,
    });

    // 4. Guest 2 tries to tamper with difficulty, hostUid, or status='PLAYING' -> REJECTED
    const guestTamperStatus: CoopRoomDocument = {
      ...guestReadyUpdate,
      status: 'PLAYING',
    };
    const guestTamperEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_guest_2',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3500,
      existing: guestReadyUpdate,
      incoming: guestTamperStatus,
    });

    // 5. Host tries to overwrite joined guestUid to another user -> REJECTED
    const hostOverwriteGuest: CoopRoomDocument = {
      ...guestReadyUpdate,
      guestUid: 'uid_other_guest',
    };
    const hostOverwriteGuestEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 3600,
      existing: guestReadyUpdate,
      incoming: hostOverwriteGuest,
    });

    // 6. Host starts match when both players are ready -> ALLOWED (HOST_UPDATE)
    const hostStartMatch: CoopRoomDocument = {
      ...guestReadyUpdate,
      status: 'PLAYING',
      hostLastActiveAt: t0 + 4000,
    };
    const hostStartEval = evaluateCoopRoomRuleUpdate({
      authUid: 'uid_host_1',
      isVerifiedPersonalGmail: true,
      requestTimeMs: t0 + 4000,
      existing: guestReadyUpdate,
      incoming: hostStartMatch,
    });

    const passed =
      guestJoinEval.allowed === true &&
      guestJoinEval.matchedBranch === 'GUEST_JOIN' &&
      thirdPlayerEval.allowed === false &&
      guestReadyEval.allowed === true &&
      guestReadyEval.matchedBranch === 'GUEST_SIGNALING_OR_READY' &&
      guestTamperEval.allowed === false &&
      hostOverwriteGuestEval.allowed === false &&
      hostStartEval.allowed === true &&
      hostStartEval.matchedBranch === 'HOST_UPDATE';

    results.push({
      id: 'M7_3_T13',
      name: 'Firestore Rules /coop_rooms: Tách biệt quyền Host/Guest, chặn người thứ 3 và chặn Guest sửa trạng thái Host',
      passed,
      details: `guestJoin=${guestJoinEval.allowed}, 3rdBlocked=${!thirdPlayerEval.allowed}, guestReady=${guestReadyEval.allowed}, guestTamperBlocked=${!guestTamperEval.allowed}, hostOverwriteGuestBlocked=${!hostOverwriteGuestEval.allowed}, hostStart=${hostStartEval.allowed}`,
    });
  }

  // =========================================================================
  // M7_3_T14: Kiến trúc WebRTC DataChannel P2P – 0 lượt ghi Firestore trong suốt trận đấu
  // =========================================================================
  {
    const sharedStorage = new InMemoryCoopStorageAdapter();
    const hostManager = new CoopOnlineManager(sharedStorage);
    const guestManager = new CoopOnlineManager(sharedStorage);

    const t0 = 1_700_000_000_000;
    const initialRoom: CoopRoomDocument = {
      roomCode: 'P2P999',
      status: 'PLAYING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_p1',
      hostDisplayName: 'Host P1',
      hostPhotoURL: '',
      hostReady: true,
      hostLastActiveAt: t0,
      guestUid: 'uid_guest_p2',
      guestDisplayName: 'Guest P2',
      guestPhotoURL: '',
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
      firestoreWritesDuringActiveMatch === 0 &&
      firestoreWritesAfterP2PFailure === 0 &&
      hostProcessedSeq === 40 &&
      snapshotsReceivedByGuest >= 35;

    results.push({
      id: 'M7_3_T14',
      name: 'Đồng bộ trong trận qua WebRTC DataChannel: 0 lượt ghi Firestore cho Input/Snapshot',
      passed,
      details: `firestoreWritesInMatch=${firestoreWritesDuringActiveMatch}, writesAfterDisconnect=${firestoreWritesAfterP2PFailure}, hostProcessedInputSeq=${hostProcessedSeq}, guestReceivedSnapshots=${snapshotsReceivedByGuest}`,
    });
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}
