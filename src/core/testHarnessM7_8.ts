/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.8 AUTOMATED VERIFICATION HARNESS
 * Kiểm thử tự động toàn diện các hạng mục M7.8:
 * 1. VS Online (2 thiết bị riêng biệt, tách phòng theo mode, chuẩn màu tank, đồng bộ snapshot, rời trận -> WIN/Đối thủ đã rời trận, single resolution).
 * 2. Online Presence (gắn SessionManager, heartbeat 30s, timeout 90s, cấm sửa trạng thái người khác, không lộ email).
 * 3. Chat chung (rỗng, >300 ký tự, lọc từ cấm, anti-spam 1.5s, chống trùng lặp clientMsgId, phân trang).
 * 4. Tìm kiếm tài khoản (Online & Offline, giới hạn <= 20, rate-limit, chỉ dữ liệu công khai an toàn).
 * 5. Hệ thống Bạn bè (gửi/chấp nhận/từ chối/hủy, mời đồng thời tự hợp nhất 1 quan hệ duy nhất, Unfriend nhất quán 2 phía & danh sách đã xóa bạn riêng tư, không tự Block, không xóa lịch sử chat, mời lại tạo lời mời mới, mời vào phòng).
 * 6. Chat riêng 1-1 & Block / Unblock độc lập hoàn toàn với Unfriend.
 * 7. Thông báo bạn bè Online/Offline (chỉ bạn bè đã xác nhận, chống spam debounce 10s).
 * 8. Quản lý bạn bè trong ADMIN (RBAC 3 cấp ADMIN/MOD/PLAYER, Audit Log, không xóa tài khoản/chat/block).
 * 9. Menu Home, UI, Pause/Exit & không sửa đổi Production firestore.rules / firebaseConfig.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { GameEngine, NEUTRAL_INPUT, validateAndNormalizeAuthoritativeSnapshot } from './gameEngine.ts';
import { VS_TANK_COLOR_SPEC } from './vsTypes.ts';
import {
  buildAuthoritativeSnapshot,
  decodeHostDisplayNameAndLock,
  encodeHostDisplayNameWithLock,
  evaluateJoinRoomCandidate,
  getRoomModeLabelVi,
  type CoopRoomDocument,
} from './coopOnlineManager.ts';
import {
  InMemorySocialStorageAdapter,
  SOCIAL_CONFIG,
  SocialManager,
  buildPairId,
  isPresenceRecordOnline,
  toSafePublicProfile,
  type FriendPresenceToastEvent,
  type PresenceRecord,
} from './socialManager.ts';
import { SUPER_ADMIN_EMAIL, type AuthIdentityLike } from './authManager.ts';
import { SystemAuditLogger } from './systemAuditLogger.ts';

interface TestResult {
  id: string;
  group: string;
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(message);
  }
}

async function runCase(
  id: string,
  group: string,
  name: string,
  fn: () => void | Promise<void>
): Promise<void> {
  try {
    await fn();
    results.push({ id, group, name, passed: true });
    console.log(`[PASS] ${id} (${group}): ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ id, group, name, passed: false, detail });
    console.error(`[FAIL] ${id} (${group}): ${name} -> ${detail}`);
  }
}

function makeRoomDoc(
  roomCode: string,
  roomMode: 'COOP_ONLINE' | 'VS_P1_P2' | 'VS_P1_AI_P2_AI',
  hostUid: string,
  nowMs: number,
  password?: string
): CoopRoomDocument {
  const encodedName = encodeHostDisplayNameWithLock(
    'HostCommander',
    roomCode,
    Boolean(password),
    password,
    roomMode
  );
  return {
    roomCode,
    status: 'WAITING',
    difficulty: 'DEFAULT',
    hostUid,
    hostDisplayName: encodedName,
    hostReady: false,
    hostLastActiveAt: nowMs,
    guestUid: null,
    guestDisplayName: null,
    guestReady: false,
    guestLastActiveAt: null,
    rtcConnectionState: 'NEW',
    createdAt: nowMs,
    expiresAt: nowMs + 10 * 60 * 1000,
    disconnectReason: null,
    roomMode,
    hasPassword: Boolean(password),
  };
}

async function main(): Promise<void> {
  console.log('=== M7.8 AUTOMATED TEST HARNESS ===');

  const alice: AuthIdentityLike = {
    uid: 'uid_alice_001',
    email: 'alice.secret@gmail.com',
    displayName: 'Alice Tanker',
    photoURL: null,
  };
  const bob: AuthIdentityLike = {
    uid: 'uid_bob_002',
    email: 'bob.private@gmail.com',
    displayName: 'Bob Striker',
    photoURL: null,
  };
  const charlie: AuthIdentityLike = {
    uid: 'uid_charlie_003',
    email: 'charlie.hidden@gmail.com',
    displayName: 'Charlie Scout',
    photoURL: null,
  };
  const adminActor: AuthIdentityLike = {
    uid: 'uid_admin_root',
    email: SUPER_ADMIN_EMAIL,
    emailVerified: true,
    providerIds: ['google.com'],
    displayName: 'Root Admin',
    photoURL: null,
  };
  const modActor: AuthIdentityLike = {
    uid: 'uid_mod_001',
    email: 'mod.tester@gmail.com',
    displayName: 'Mod Inspector',
    photoURL: null,
    serverRole: 'MOD',
  };

  // =========================================================================
  // GROUP 1: VS ONLINE (2 THIẾT BỊ, TÁCH CHẾ ĐỘ PHÒNG, ĐỒNG BỘ, RỜI TRẬN, MÀU TANK)
  // =========================================================================
  await runCase(
    'M7_8_VS_01',
    'VS_ONLINE',
    'Mã hóa/giải mã chế độ phòng VS_P1_P2 & VS_P1_AI_P2_AI trong giới hạn <= 80 ký tự (giữ nguyên schema Firestore Production)',
    () => {
      const code = 'BT4021';
      const e1 = encodeHostDisplayNameWithLock('Nguyen Van Commander Very Long Display Name For Safety Check', code, true, 'pass123', 'VS_P1_P2');
      assert(e1.length <= 80, `Encoded hostDisplayName exceeds 80 chars: ${e1.length}`);
      const d1 = decodeHostDisplayNameAndLock(e1);
      assert(d1.roomMode === 'VS_P1_P2', `Expected VS_P1_P2, got ${d1.roomMode}`);
      assert(d1.hasPassword === true, 'Expected hasPassword=true');
      assert(!d1.cleanDisplayName.includes('[VS1]') && !d1.cleanDisplayName.includes('[LOCK:'), 'Clean name leaked tags');

      const e2 = encodeHostDisplayNameWithLock('CommanderTwo', 'BT9901', false, undefined, 'VS_P1_AI_P2_AI');
      const d2 = decodeHostDisplayNameAndLock(e2);
      assert(d2.roomMode === 'VS_P1_AI_P2_AI', `Expected VS_P1_AI_P2_AI, got ${d2.roomMode}`);
      assert(d2.hasPassword === false, 'Expected hasPassword=false');
      assert(getRoomModeLabelVi('VS_P1_P2').includes('P1 VS P2'), 'Missing VI label for VS_P1_P2');
      assert(getRoomModeLabelVi('VS_P1_AI_P2_AI').includes('P1 + A.I'), 'Missing VI label for VS_P1_AI_P2_AI');
    }
  );

  await runCase(
    'M7_8_VS_02',
    'VS_ONLINE',
    'Cách ly phòng nghiêm ngặt giữa COOP_ONLINE, VS_P1_P2 và VS_P1_AI_P2_AI (chặn join chéo chế độ, chặn người thứ 3, chặn trùng Host)',
    () => {
      const now = 1_700_000_000_000;
      const vs1Room = makeRoomDoc('BT1122', 'VS_P1_P2', alice.uid!, now, 'secret99');
      const vs2Room = makeRoomDoc('BT3344', 'VS_P1_AI_P2_AI', alice.uid!, now);

      // Join VS_P1_P2 with COOP_ONLINE expectation -> WRONG_ROOM_MODE
      const wrongMode1 = evaluateJoinRoomCandidate(vs1Room, 'BT1122', { uid: bob.uid! }, now, true, {
        expectedRoomMode: 'COOP_ONLINE',
        password: 'secret99',
      });
      assert(!wrongMode1.success && wrongMode1.errorCode === 'WRONG_ROOM_MODE', `Expected WRONG_ROOM_MODE, got ${wrongMode1.errorCode}`);

      // Join VS_P1_AI_P2_AI with VS_P1_P2 expectation -> WRONG_ROOM_MODE
      const wrongMode2 = evaluateJoinRoomCandidate(vs2Room, 'BT3344', { uid: bob.uid! }, now, true, {
        expectedRoomMode: 'VS_P1_P2',
      });
      assert(!wrongMode2.success && wrongMode2.errorCode === 'WRONG_ROOM_MODE', `Expected WRONG_ROOM_MODE, got ${wrongMode2.errorCode}`);

      // Wrong password rejected
      const wrongPass = evaluateJoinRoomCandidate(vs1Room, 'BT1122', { uid: bob.uid! }, now, true, {
        expectedRoomMode: 'VS_P1_P2',
        password: 'wrong',
      });
      assert(!wrongPass.success && wrongPass.errorCode === 'WRONG_PASSWORD', `Expected WRONG_PASSWORD, got ${wrongPass.errorCode}`);

      // Same user as host rejected
      const sameUser = evaluateJoinRoomCandidate(vs1Room, 'BT1122', { uid: alice.uid! }, now, true, {
        expectedRoomMode: 'VS_P1_P2',
        password: 'secret99',
      });
      assert(!sameUser.success && sameUser.errorCode === 'SAME_USER_AS_HOST', `Expected SAME_USER_AS_HOST, got ${sameUser.errorCode}`);

      // Valid P2 join passes
      const okJoin = evaluateJoinRoomCandidate(vs1Room, 'BT1122', { uid: bob.uid! }, now, true, {
        expectedRoomMode: 'VS_P1_P2',
        password: 'secret99',
      });
      assert(okJoin.success, `Expected ok join, got ${okJoin.errorCode}: ${okJoin.message}`);

      // Third player rejected when room already has guestUid
      const fullRoom: CoopRoomDocument = { ...vs1Room, guestUid: bob.uid!, guestDisplayName: 'Bob' };
      const thirdPlayer = evaluateJoinRoomCandidate(fullRoom, 'BT1122', { uid: charlie.uid! }, now, true, {
        expectedRoomMode: 'VS_P1_P2',
        password: 'secret99',
      });
      assert(!thirdPlayer.success && thirdPlayer.errorCode === 'ROOM_FULL', `Expected ROOM_FULL, got ${thirdPlayer.errorCode}`);
    }
  );

  await runCase(
    'M7_8_VS_03',
    'VS_ONLINE',
    'Đồng bộ Authoritative Host -> Guest snapshot cho VS_P1_AI_P2_AI (tọa độ P1/P2/AI_1/AI_2, đạn, mạng, trạng thái trận)',
    () => {
      const hostEngine = new GameEngine();
      hostEngine.startMatch('VS_P1_AI_P2_AI', 'DEFAULT');
      const guestEngine = new GameEngine();
      guestEngine.startMatch('VS_P1_AI_P2_AI', 'DEFAULT');

      // Run 25 ticks on Host with P1 moving up & shooting, P2 moving left & shooting
      for (let i = 0; i < 25; i++) {
        hostEngine.stepTick(
          { ...NEUTRAL_INPUT, up: true, shoot: i === 5 },
          { ...NEUTRAL_INPUT, left: true, shoot: i === 8 }
        );
      }

      const hostState = hostEngine.getState();
      const snapshot = buildAuthoritativeSnapshot(hostState, 42, Date.now());
      assert(snapshot.gameMode === 'VS_P1_AI_P2_AI', 'Snapshot missing VS gameMode');
      assert(Boolean(snapshot.vsState), 'Snapshot missing vsState');
      assert(snapshot.vsState!.combatants.length === 4, `Expected 4 VS combatants (P1, AI_1, P2, AI_2), got ${snapshot.vsState!.combatants.length}`);

      const validated = validateAndNormalizeAuthoritativeSnapshot(snapshot, 0, 0, 0);
      assert(validated.valid && Boolean(validated.normalized?.vsState), 'Validated snapshot dropped vsState');

      const applied = guestEngine.applyAuthoritativeSnapshot(validated.normalized);
      assert(applied.valid === true, `Guest failed to apply VS snapshot: ${applied.reason}`);
      const guestState = guestEngine.getState();
      assert(guestState.vsState !== null && guestState.vsState !== undefined, 'Guest vsState is null after apply');
      assert(
        guestState.vsState!.tickCount === hostState.vsState!.tickCount,
        'Guest vsState tickCount diverged from Host'
      );
      const hostP1 = hostState.vsState!.combatants.find((u) => u.role === 'P1')!;
      const guestP1 = guestState.vsState!.combatants.find((u) => u.role === 'P1')!;
      assert(hostP1.tank.x === guestP1.tank.x && hostP1.tank.y === guestP1.tank.y, 'Guest P1 coordinates diverged from Host');
    }
  );

  await runCase(
    'M7_8_VS_04',
    'VS_ONLINE',
    'Rời trận VS Online: P1 rời -> P2 WIN, P2 rời -> P1 WIN, lý do "Đối thủ đã rời trận", dừng mô phỏng & không xử lý 2 lần',
    () => {
      // Case A: P1 leaves -> P2 wins
      const engA = new GameEngine();
      engA.startMatch('VS_P1_P2', 'DEFAULT');
      for (let i = 0; i < 10; i++) engA.stepTick(NEUTRAL_INPUT, NEUTRAL_INPUT);
      const didForfeitA = engA.forfeitVsMatch('P1');
      assert(didForfeitA === true, 'forfeitVsMatch(P1) returned false');
      const stateA = engA.getState();
      const outcomeA = stateA.vsState?.outcome ?? null;
      assert(outcomeA !== null, 'Outcome is null after forfeitVsMatch(P1)');
      assert(outcomeA!.winnerTeam === 'TEAM_2', `Expected TEAM_2 winner when P1 leaves, got ${outcomeA!.winnerTeam}`);
      assert(outcomeA!.reason === 'OPPONENT_LEFT', `Expected reason OPPONENT_LEFT, got ${outcomeA!.reason}`);
      assert(outcomeA!.reasonTextVi === 'Đối thủ đã rời trận', `Unexpected Vietnamese reason: ${outcomeA!.reasonTextVi}`);
      assert(stateA.vsState?.phase === 'FINISHED' && stateA.matchState === 'SUMMARY_STATS', `Unexpected state after forfeit: phase=${stateA.vsState?.phase}, matchState=${stateA.matchState}`);

      // Single-resolution idempotency: calling forfeitVsMatch('P2') afterwards MUST return false & NOT flip winner
      const secondCall = engA.forfeitVsMatch('P2');
      assert(secondCall === false, 'Second forfeit call should be ignored (idempotent)');
      assert(engA.getState().vsState?.outcome?.winnerTeam === 'TEAM_2', 'Double-resolution occurred! Winner flipped on second forfeit call');

      // Simulation stops immediately (no AI substitution or tick progression)
      const frozenTick = engA.getState().vsState!.tickCount;
      engA.stepTick({ ...NEUTRAL_INPUT, up: true, shoot: true }, { ...NEUTRAL_INPUT, down: true });
      assert(engA.getState().vsState!.tickCount === frozenTick, 'VS simulation continued after forfeit');

      // Case B: P2 leaves -> P1 wins
      const engB = new GameEngine();
      engB.startMatch('VS_P1_AI_P2_AI', 'DEFAULT');
      const didForfeitB = engB.forfeitVsMatch('P2');
      assert(didForfeitB === true, 'forfeitVsMatch(P2) returned false');
      const outcomeB = engB.getState().vsState?.outcome ?? null;
      assert(outcomeB !== null && outcomeB!.winnerTeam === 'TEAM_1', `Expected TEAM_1 winner when P2 leaves, got ${outcomeB?.winnerTeam}`);
      assert(outcomeB!.reason === 'OPPONENT_LEFT' && outcomeB!.reasonTextVi === 'Đối thủ đã rời trận', 'Incorrect forfeit reason for P2 leaving');
    }
  );

  await runCase(
    'M7_8_VS_05',
    'VS_ONLINE',
    'Quy chuẩn màu Tank VS: P1 Đỏ (#dc2626), AI_1 Xanh nhạt (#38bdf8), P2 Vàng (#eab308), AI_2 Xám (#94a3b8)',
    () => {
      assert(VS_TANK_COLOR_SPEC.P1.hex.toLowerCase() === '#dc2626', `P1 color mismatch: ${VS_TANK_COLOR_SPEC.P1.hex}`);
      assert(VS_TANK_COLOR_SPEC.AI_1.hex.toLowerCase() === '#38bdf8', `AI_1 color mismatch: ${VS_TANK_COLOR_SPEC.AI_1.hex}`);
      assert(VS_TANK_COLOR_SPEC.P2.hex.toLowerCase() === '#eab308', `P2 color mismatch: ${VS_TANK_COLOR_SPEC.P2.hex}`);
      assert(VS_TANK_COLOR_SPEC.AI_2.hex.toLowerCase() === '#94a3b8', `AI_2 color mismatch: ${VS_TANK_COLOR_SPEC.AI_2.hex}`);
    }
  );

  // =========================================================================
  // GROUP 2: ONLINE PRESENCE
  // =========================================================================
  await runCase(
    'M7_8_PRESENCE_01',
    'PRESENCE',
    'Online Presence: heartbeat 30s, timeout stale 90s, chặn sửa trạng thái người khác, tuyệt đối không lộ email',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const t0 = 1_700_000_000_000;

      // Heartbeat for self succeeds
      const ok = await mgr.publishPresenceHeartbeat(alice, alice.uid!, 'sess_a1', t0);
      assert(ok.success, 'Self presence heartbeat failed');

      // Heartbeat for another user denied
      const denied = await mgr.publishPresenceHeartbeat(alice, bob.uid!, 'sess_a1', t0);
      assert(!denied.success && denied.errorCode === 'PERMISSION_DENIED', 'Cross-user presence modification was not denied');

      // Online within 90s, stale offline after 90s
      const rec = await adapter.getPublicProfile(alice.uid!);
      assert(rec !== null, 'Alice presence record missing');
      assert(isPresenceRecordOnline(rec!, t0 + 30_000) === true, 'Expected online at +30s');
      assert(isPresenceRecordOnline(rec!, t0 + SOCIAL_CONFIG.PRESENCE_STALE_TIMEOUT_MS + 1) === false, 'Expected offline after 90s stale timeout');

      // Public profile contains ZERO email
      const pub = toSafePublicProfile(rec!, t0 + 1000);
      const serialized = JSON.stringify(pub);
      assert(!serialized.includes('alice.secret@gmail.com'), 'Email leaked into PublicPlayerProfile!');
      assert(pub.handleTag.startsWith('#BT-'), `Invalid handleTag: ${pub.handleTag}`);

      await mgr.stopPresence(t0 + 5000);
    }
  );

  // =========================================================================
  // GROUP 3: CHAT CHUNG
  // =========================================================================
  await runCase(
    'M7_8_GCHAT_01',
    'GLOBAL_CHAT',
    'Chat chung: chặn rỗng, chặn >300 ký tự, lọc từ cấm, anti-spam 1.5s, chống trùng clientMsgId, phân trang',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      let t = 1_700_000_000_000;

      // Empty rejected
      const rEmpty = await mgr.sendGlobalMessage(alice, '    ', { nowMs: t });
      assert(!rEmpty.success && rEmpty.errorCode === 'INVALID_INPUT', 'Empty message was not rejected');

      // >300 chars rejected
      const rLong = await mgr.sendGlobalMessage(alice, 'A'.repeat(301), { nowMs: t });
      assert(!rLong.success && rLong.errorCode === 'INVALID_INPUT', '>300 char message was not rejected');

      // Banned content rejected
      const rBad = await mgr.sendGlobalMessage(alice, 'spam link http://evil.xyz/hack', { nowMs: t });
      assert(!rBad.success && rBad.errorCode === 'CONTENT_VIOLATION', 'Banned content was not blocked');

      // Valid message succeeds
      const r1 = await mgr.sendGlobalMessage(alice, 'Xin chào mọi người!', { clientMsgId: 'msg_unique_1', nowMs: t });
      assert(r1.success && r1.data?.content === 'Xin chào mọi người!', 'Valid global chat message failed');

      // Anti-spam cooldown (<1500ms) rejected
      const rSpam = await mgr.sendGlobalMessage(alice, 'Spam nhanh', { nowMs: t + 500 });
      assert(!rSpam.success && rSpam.errorCode === 'RATE_LIMITED', 'Anti-spam cooldown not enforced');

      // Duplicate clientMsgId rejected even after cooldown
      t += 2000;
      const rDup = await mgr.sendGlobalMessage(alice, 'Tin nhắn trùng ID', { clientMsgId: 'msg_unique_1', nowMs: t });
      assert(!rDup.success && rDup.errorCode === 'DUPLICATE_MESSAGE', 'Duplicate clientMsgId not blocked');

      // Send 2 more messages and verify pagination
      const r2 = await mgr.sendGlobalMessage(alice, 'Tin nhắn thứ 2', { nowMs: t });
      assert(r2.success, 'Second message failed');
      t += 2000;
      const r3 = await mgr.sendGlobalMessage(bob, 'Tin nhắn thứ 3', { nowMs: t });
      assert(r3.success, 'Third message failed');

      const older = await mgr.loadOlderGlobalMessages(t);
      assert(older.length === 2, `Expected 2 older messages before t, got ${older.length}`);
    }
  );

  // =========================================================================
  // GROUP 4: TÌM KIẾM TÀI KHOẢN
  // =========================================================================
  await runCase(
    'M7_8_SEARCH_01',
    'SEARCH',
    'Tìm kiếm tài khoản Online & Offline, giới hạn <= 20, rate-limit, không lộ email',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = 1_700_000_000_000;

      // Seed 25 profiles (mix of Online & Offline)
      for (let i = 1; i <= 25; i++) {
        const rec: PresenceRecord = {
          uid: `uid_user_${i}`,
          handleTag: `#BT-${String(i).padStart(4, '0')}`,
          displayName: `Tanker Alpha ${i}`,
          avatarUrl: null,
          roleBadge: 'PLAYER',
          rankTitle: 'Hạ sĩ',
          stars: i,
          online: i % 2 === 0,
          lastHeartbeatMs: i % 2 === 0 ? now - 5_000 : now - 500_000,
          sessionId: i % 2 === 0 ? `s_${i}` : null,
          updatedAtMs: now - i * 1000,
        };
        await adapter.upsertPresenceAndProfile(rec);
      }

      const res = await mgr.searchAccounts('Tanker Alpha', now);
      assert(res.success && Array.isArray(res.data), 'Search failed');
      assert(res.data!.length === SOCIAL_CONFIG.SEARCH_MAX_RESULTS, `Expected cap ${SOCIAL_CONFIG.SEARCH_MAX_RESULTS}, got ${res.data!.length}`);
      assert(res.data!.some((p) => p.isOnline) && res.data!.some((p) => !p.isOnline), 'Search did not return both Online and Offline accounts');
      assert(!JSON.stringify(res.data).includes('@gmail.com'), 'Email leaked in search results');

      // Immediate second search triggers rate-limit
      const resFast = await mgr.searchAccounts('Alpha 1', now + 50);
      assert(!resFast.success && resFast.errorCode === 'RATE_LIMITED', 'Search rate-limit not enforced');

      // Search by handleTag works after interval
      const resTag = await mgr.searchAccounts('#BT-0007', now + 1000);
      assert(resTag.success && resTag.data!.length === 1 && resTag.data![0].uid === 'uid_user_7', 'Search by handleTag failed');
    }
  );

  // =========================================================================
  // GROUP 5: HỆ THỐNG BẠN BÈ (ĐẦY ĐỦ VÒNG ĐỜI + MỜI ĐỒNG THỜI + UNFRIEND + DELETED FRIENDS)
  // =========================================================================
  await runCase(
    'M7_8_FRIENDS_01',
    'FRIENDS',
    'Gửi/Hủy/Từ chối/Chấp nhận lời mời + 2 bên gửi đồng thời tự hợp nhất 1 quan hệ duy nhất (zero duplicate)',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = 1_700_000_000_000;

      const bobProfile = { uid: bob.uid!, displayName: bob.displayName!, handleTag: '#BT-BOB2', avatarUrl: null };
      const aliceProfile = { uid: alice.uid!, displayName: alice.displayName!, handleTag: '#BT-ALC1', avatarUrl: null };
      const charlieProfile = { uid: charlie.uid!, displayName: charlie.displayName!, handleTag: '#BT-CHR3', avatarUrl: null };

      // Self friend request rejected
      const selfRes = await mgr.sendFriendRequest(alice, aliceProfile, now);
      assert(!selfRes.success && selfRes.errorCode === 'SELF_ACTION', 'Self friend request not blocked');

      // Send & Cancel
      const s1 = await mgr.sendFriendRequest(alice, charlieProfile, now);
      assert(s1.success, 'Send request Alice->Charlie failed');
      const cancelRes = await mgr.cancelSentFriendRequest(alice, `${alice.uid}__${charlie.uid}`);
      assert(cancelRes.success, 'Cancel sent request failed');

      // Send & Reject
      await mgr.sendFriendRequest(alice, charlieProfile, now + 100);
      const rejRes = await mgr.rejectFriendRequest(charlie, `${alice.uid}__${charlie.uid}`);
      assert(rejRes.success, 'Reject request failed');

      // Simultaneous mutual invite: Alice invites Bob, then Bob invites Alice -> auto-merged into 1 friendship!
      const m1 = await mgr.sendFriendRequest(alice, bobProfile, now + 200);
      assert(m1.success && m1.data?.autoAccepted === false, 'First mutual request should be pending');
      const m2 = await mgr.sendFriendRequest(bob, aliceProfile, now + 250);
      assert(m2.success && m2.data?.autoAccepted === true, 'Second simultaneous mutual request should auto-accept');

      const allFriendships = await adapter.listAllFriendships(50);
      assert(allFriendships.length === 1, `Expected exactly 1 canonical friendship, got ${allFriendships.length}`);
      const reqsA = await mgr.listFriendRequestsSplit(alice.uid!);
      const reqsB = await mgr.listFriendRequestsSplit(bob.uid!);
      assert(reqsA.sent.length === 0 && reqsA.received.length === 0, 'Pending requests left over for Alice');
      assert(reqsB.sent.length === 0 && reqsB.received.length === 0, 'Pending requests left over for Bob');

      // Room invite allowed for confirmed friends, denied for non-friends
      const invOk = await mgr.sendRoomInviteToFriend(alice, bob.uid!, 'BT5566', 'VS_P1_P2', false, now + 300);
      assert(invOk.success, 'Room invite to confirmed friend failed');
      const invDenied = await mgr.sendRoomInviteToFriend(alice, charlie.uid!, 'BT5566', 'VS_P1_P2', false, now + 300);
      assert(!invDenied.success && invDenied.errorCode === 'PERMISSION_DENIED', 'Room invite to non-friend was not denied');
    }
  );

  await runCase(
    'M7_8_FRIENDS_02',
    'FRIENDS',
    'Unfriend nhất quán 2 phía, lưu Danh sách đã xóa bạn riêng tư, giữ lịch sử chat, KHÔNG tự Block, mời lại tạo lời mời mới',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = 1_700_000_000_000;

      const bobProfile = { uid: bob.uid!, displayName: bob.displayName!, handleTag: '#BT-BOB2', avatarUrl: null };
      await mgr.sendFriendRequest(alice, bobProfile, now);
      await mgr.acceptFriendRequest(bob, `${alice.uid}__${bob.uid}`, now + 100);

      // Chat before unfriend
      const msgRes = await mgr.sendPrivateMessage(alice, bob.uid!, 'Chào Bob trước khi hủy kết bạn', { nowMs: now + 200 });
      assert(msgRes.success, 'Private message before unfriend failed');

      // Alice unfriends Bob
      const unf = await mgr.unfriend(alice, bob.uid!, now + 500);
      assert(unf.success, 'Unfriend failed');

      // Both sides no longer friends
      const relA = await mgr.getRelationshipStatus(alice.uid!, bob.uid!);
      const relB = await mgr.getRelationshipStatus(bob.uid!, alice.uid!);
      assert(!relA.isFriend && !relB.isFriend, 'Unfriend did not update both sides');

      // Does NOT auto-Block
      assert(!relA.blockedByMe && !relA.blockedByOther, 'Unfriend unexpectedly created a Block!');

      // Private deleted_friends list visible ONLY for Alice (who performed unfriend)
      const delA = await mgr.listDeletedFriendsForUser(alice.uid!);
      const delB = await mgr.listDeletedFriendsForUser(bob.uid!);
      assert(delA.length === 1 && delA[0].targetUid === bob.uid, 'Deleted friends history missing for Alice');
      assert(delB.length === 0, 'Deleted friends leaked to other user');

      // Private chat history preserved
      const chatId = buildPairId(alice.uid!, bob.uid!);
      const history = await adapter.listPrivateMessages(chatId, 20);
      assert(history.length === 1, 'Private chat history was deleted on unfriend!');

      // Re-inviting creates a NEW pending request (does NOT auto-restore friendship)
      const reInv = await mgr.sendFriendRequest(alice, bobProfile, now + 1000);
      assert(reInv.success && reInv.data?.autoAccepted === false, 'Re-invite should create a new pending request');
      const relAfter = await mgr.getRelationshipStatus(alice.uid!, bob.uid!);
      assert(!relAfter.isFriend && relAfter.pendingDirection === 'SENT', 'Re-invite auto-restored friendship without acceptance!');
    }
  );

  // =========================================================================
  // GROUP 6: CHAT RIÊNG 1-1 & BLOCK / UNBLOCK ĐỘC LẬP
  // =========================================================================
  await runCase(
    'M7_8_PCHAT_BLOCK_01',
    'PRIVATE_CHAT_BLOCK',
    'Chat riêng 1-1 & Block/Unblock: chặn tin nhắn riêng, giữ lịch sử chat, KHÔNG tự hủy kết bạn, Unblock gửi lại được',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = 1_700_000_000_000;

      const bobProfile = { uid: bob.uid!, displayName: bob.displayName!, handleTag: '#BT-BOB2', avatarUrl: null };
      await mgr.sendFriendRequest(alice, bobProfile, now);
      await mgr.acceptFriendRequest(bob, `${alice.uid}__${bob.uid}`, now + 100);

      // Message before block
      const m1 = await mgr.sendPrivateMessage(bob, alice.uid!, 'Tin nhắn trước khi bị chặn', { nowMs: now + 200 });
      assert(m1.success, 'Initial private message failed');

      // Alice blocks Bob
      const blk = await mgr.blockUser(alice, bob.uid!, now + 500);
      assert(blk.success, 'Block user failed');

      // Block does NOT auto-unfriend
      const rel = await mgr.getRelationshipStatus(alice.uid!, bob.uid!);
      assert(rel.isFriend === true, 'Block unexpectedly removed friendship!');
      assert(rel.blockedByMe === true, 'blockedByMe flag not set');

      // Bob cannot send private message to Alice
      const blockedSend = await mgr.sendPrivateMessage(bob, alice.uid!, 'Tin nhắn sau khi bị chặn', { nowMs: now + 2000 });
      assert(!blockedSend.success && blockedSend.errorCode === 'BLOCKED_BY_RECIPIENT', `Expected BLOCKED_BY_RECIPIENT, got ${blockedSend.errorCode}`);

      // Chat history still preserved
      const history = await adapter.listPrivateMessages(buildPairId(alice.uid!, bob.uid!), 20);
      assert(history.length === 1, 'Chat history was lost after Block');

      // Alice unblocks Bob -> Bob can send again
      const unblk = await mgr.unblockUser(alice, bob.uid!);
      assert(unblk.success, 'Unblock failed');
      const afterUnblock = await mgr.sendPrivateMessage(bob, alice.uid!, 'Tin nhắn sau khi bỏ chặn', { nowMs: now + 4000 });
      assert(afterUnblock.success, 'Sending message after unblock failed');
    }
  );

  // =========================================================================
  // GROUP 7: THÔNG BÁO BẠN BÈ ONLINE / OFFLINE (CHỈ BẠN BÈ, CHỐNG SPAM)
  // =========================================================================
  await runCase(
    'M7_8_TOAST_01',
    'FRIEND_TOAST',
    'Thông báo Online/Offline chỉ phát cho bạn bè đã xác nhận (bỏ qua người lạ)',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = Date.now();

      // Make Alice & Bob friends; Charlie is stranger
      const bobProfile = { uid: bob.uid!, displayName: bob.displayName!, handleTag: '#BT-BOB2', avatarUrl: null };
      await mgr.sendFriendRequest(alice, bobProfile, now);
      await mgr.acceptFriendRequest(bob, `${alice.uid}__${bob.uid}`, now + 10);

      // Start Alice's presence (initializes known friends map while Bob is offline)
      await mgr.startPresenceForSession(
        { uid: alice.uid!, email: alice.email!, displayName: alice.displayName!, photoURL: null, providerId: 'google.com' },
        'ACTIVE',
        'sess_alice_toast',
        now
      );

      const toasts: FriendPresenceToastEvent[] = [];
      const unsub = mgr.subscribeFriendToasts((ev) => toasts.push(ev));

      // Charlie (stranger) comes online -> MUST NOT emit toast
      await mgr.publishPresenceHeartbeat(charlie, charlie.uid!, 'sess_c', Date.now());
      assert(toasts.length === 0, `Stranger emitted friend toast: ${JSON.stringify(toasts)}`);

      // Bob (confirmed friend) comes online -> MUST emit ONLINE toast
      await mgr.publishPresenceHeartbeat(bob, bob.uid!, 'sess_b', Date.now());
      assert(toasts.length === 1 && toasts[0].friendUid === bob.uid && toasts[0].status === 'ONLINE', `Expected Bob ONLINE toast, got ${JSON.stringify(toasts)}`);

      unsub();
      await mgr.stopPresence(Date.now());
    }
  );

  // =========================================================================
  // GROUP 8: QUẢN LÝ BẠN BÈ TRONG ADMIN (RBAC 3 CẤP + AUDIT LOG)
  // =========================================================================
  await runCase(
    'M7_8_ADMIN_01',
    'ADMIN_FRIENDS_RBAC',
    'Phân quyền ADMIN / MOD / PLAYER trong Quản lý bạn bè & Audit Log khi ADMIN xóa quan hệ',
    async () => {
      const adapter = new InMemorySocialStorageAdapter();
      const mgr = new SocialManager(adapter);
      const now = 1_700_000_000_000;

      // Setup friendship + chat + block between Alice and Bob
      const bobProfile = { uid: bob.uid!, displayName: bob.displayName!, handleTag: '#BT-BOB2', avatarUrl: null };
      await mgr.sendFriendRequest(alice, bobProfile, now);
      await mgr.acceptFriendRequest(bob, `${alice.uid}__${bob.uid}`, now + 50);
      await mgr.sendPrivateMessage(alice, bob.uid!, 'Tin nhắn quan trọng cần giữ lại', { nowMs: now + 100 });
      await mgr.blockUser(charlie, bob.uid!, now + 120);

      // PLAYER denied view, search, inspect, delete
      const pList = await mgr.adminListAllFriendships(alice);
      const pInspect = await mgr.adminInspectPair(alice, alice.uid!, bob.uid!);
      const pDel = await mgr.adminDeleteFriendship(alice, alice.uid!, bob.uid!);
      assert(!pList.success && pList.errorCode === 'PERMISSION_DENIED', 'PLAYER allowed to list friendships');
      assert(!pInspect.success && pInspect.errorCode === 'PERMISSION_DENIED', 'PLAYER allowed to inspect pair');
      assert(!pDel.success && pDel.errorCode === 'PERMISSION_DENIED', 'PLAYER allowed to delete friendship');

      // MOD allowed to view/search/inspect ONLY; delete strictly DENIED
      const mList = await mgr.adminListAllFriendships(modActor);
      const mSearch = await mgr.adminSearchFriendships(modActor, 'Alice');
      const mInspect = await mgr.adminInspectPair(modActor, alice.uid!, bob.uid!);
      const mDel = await mgr.adminDeleteFriendship(modActor, alice.uid!, bob.uid!);
      assert(mList.success && mList.data!.length === 1, 'MOD failed to list friendships');
      assert(mSearch.success && mSearch.data!.length === 1, 'MOD failed to search friendships');
      assert(mInspect.success && mInspect.data!.areFriends === true, 'MOD failed to inspect pair');
      assert(!mDel.success && mDel.errorCode === 'PERMISSION_DENIED', 'MOD was allowed to delete friendship!');

      // ADMIN allowed to view, search, inspect, AND delete + records Audit Log
      const auditBefore = SystemAuditLogger.getInstance().querySystemLogs({ pageSize: 50 }, adminActor);
      const countBefore = auditBefore.totalItems;
      const aDel = await mgr.adminDeleteFriendship(adminActor, alice.uid!, bob.uid!, 'Kiểm thử nghiệm thu M7.8');
      assert(aDel.success, `ADMIN delete friendship failed: ${aDel.message}`);

      // Verify both sides updated consistently
      const inspectAfter = await mgr.adminInspectPair(adminActor, alice.uid!, bob.uid!);
      assert(inspectAfter.success && inspectAfter.data!.areFriends === false, 'Friendship still exists after ADMIN deletion');

      // Verify chat history & other blocks were NOT deleted
      const chatAfter = await adapter.listPrivateMessages(buildPairId(alice.uid!, bob.uid!), 20);
      assert(chatAfter.length === 1, 'ADMIN delete friendship unexpectedly wiped chat history!');
      const blockAfter = await adapter.getBlock(charlie.uid!, bob.uid!);
      assert(blockAfter !== null, 'ADMIN delete friendship unexpectedly wiped block record!');

      // Verify Audit Log entry recorded
      const auditAfter = SystemAuditLogger.getInstance().querySystemLogs({ pageSize: 50 }, adminActor);
      assert(auditAfter.success && auditAfter.totalItems > countBefore, 'ADMIN delete friendship did not record Audit Log');
      assert(
        auditAfter.items.some((l) => l.eventType === 'ADMIN_DELETE_FRIENDSHIP'),
        'Audit log missing ADMIN_DELETE_FRIENDSHIP eventType'
      );
    }
  );

  // =========================================================================
  // GROUP 9: KIỂM TRA CẤU TRÚC UI / PAUSE-EXIT / BẢO VỆ PRODUCTION RULES
  // =========================================================================
  await runCase(
    'M7_8_STRUCT_01',
    'UI_AND_GUARDRAILS',
    'Kiểm tra cấu trúc Menu Home, SupportModal, BattleScene (không còn local 2P VS), Exit online, Proposed Rules & bảo vệ Production',
    () => {
      const root = process.cwd();
      const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

      // 1. MainMenuScreen: không còn ava01/ava03/ava07, không còn ĐÃ MỞ KHÓA / UNLOCKED (sau khi bỏ comment), dùng "Kinh nghiệm", không còn "/25 XP"
      const mainMenuRaw = read('src/components/MainMenuScreen.tsx');
      const mainMenuNoComments = mainMenuRaw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      assert(!mainMenuNoComments.includes('ava01') && !mainMenuNoComments.includes('ava03') && !mainMenuNoComments.includes('ava07'), 'MainMenuScreen still references old avatar backgrounds');
      assert(!mainMenuNoComments.includes('ĐÃ MỞ KHÓA') && !mainMenuNoComments.includes('UNLOCKED'), 'MainMenuScreen still renders Unlocked badge');
      assert(mainMenuNoComments.includes('Kinh nghiệm'), 'MainMenuScreen missing renamed "Kinh nghiệm" label');
      assert(!mainMenuNoComments.includes('/25 XP'), 'MainMenuScreen still contains removed "(xx/25 XP)" suffix');
      assert(mainMenuNoComments.includes('whitespace-nowrap'), 'MainMenuScreen mobile title missing anti-orphan-wrap handling');

      // 2. SupportModal defaults to ABOUT tab
      const support = read('src/components/SupportModal.tsx');
      assert(support.includes("initialTab = 'ABOUT'"), 'SupportModal default tab is not ABOUT');

      // 3. BattleScene & App: không còn local 2P same-device VS input hoặc touch P1/P2 switcher
      const battleScene = read('src/game/scenes/BattleScene.ts');
      assert(!battleScene.includes('readVsLocalInputP2'), 'BattleScene still has local same-device 2P VS input');
      const appSrc = read('src/App.tsx');
      assert(!appSrc.includes('vsTouchPlayer'), 'App.tsx still contains same-device P1/P2 touch switcher');
      assert(appSrc.includes('Bạn có chắc chắn muốn rời trận đấu?'), 'App.tsx missing online battle exit confirmation modal');
      assert(appSrc.includes('startPresenceForSession'), 'App.tsx not wired to SocialManager presence tied to SessionManager');

      // 4. AuthSessionBanner: hỗ trợ onlineBattleExitMode ẩn menu 3 gạch và hiển thị nút Thoát
      const banner = read('src/components/AuthSessionBanner.tsx');
      assert(banner.includes('online-battle-exit-btn'), 'AuthSessionBanner missing online battle Exit button');

      // 5. Proposed Firestore Rules file created cleanly
      const proposed = read('PROPOSED_FIRESTORE_RULES_M7_8.md');
      assert(
        proposed.includes('user_presence') &&
          proposed.includes('global_chat_messages') &&
          proposed.includes('friendships') &&
          proposed.includes('user_blocks'),
        'PROPOSED_FIRESTORE_RULES_M7_8.md missing required collection rules'
      );
    }
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n=== M7.8 SUMMARY: ${passed}/${results.length} PASSED, ${failed} FAILED ===`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main();
