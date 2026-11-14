/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.3.1 – Bộ kiểm thử thực tế Firestore Security Rules với @firebase/rules-unit-testing
 * Demo Project ID: demo-bantank-m7-3
 *
 * Cách chạy thông qua Firebase Firestore Emulator (cần JDK 11+):
 *   npx firebase-tools emulators:exec --only firestore --project demo-bantank-m7-3 "npx tsx scripts/test_firestore_rules_m7_3.ts"
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytes,
  deleteObject,
  getBytes,
  listAll,
  updateMetadata,
} from 'firebase/storage';

export const DEMO_PROJECT_ID = 'demo-bantank-m7-3';

interface RuleAssertionRecord {
  id: string;
  group: number;
  kind: 'ALLOW' | 'DENY';
  name: string;
  ruleLocation: string;
  passed: boolean;
  errorReason?: string;
}

function parseEmulatorHostPort(): { host: string; port: number } {
  const envHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (envHost && envHost.includes(':')) {
    const [h, p] = envHost.split(':');
    const parsedPort = Number(p);
    if (h && Number.isInteger(parsedPort) && parsedPort > 0) {
      return { host: h, port: parsedPort };
    }
  }
  return { host: '127.0.0.1', port: 8088 };
}

function parseStorageEmulatorHostPort(): { host: string; port: number } {
  const envHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (envHost && envHost.includes(':')) {
    const [h, p] = envHost.split(':');
    const parsedPort = Number(p);
    if (h && Number.isInteger(parsedPort) && parsedPort > 0) {
      return { host: h, port: parsedPort };
    }
  }
  return { host: '127.0.0.1', port: 9199 };
}

function checkTcpPortReachable(host: string, port: number, timeoutMs: number = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function main(): Promise<void> {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const storageRulesPath = path.resolve(process.cwd(), 'storage.rules');
  if (!fs.existsSync(rulesPath)) {
    console.error(`[ERROR] Không tìm thấy file firestore.rules tại: ${rulesPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(storageRulesPath)) {
    console.error(`[ERROR] Không tìm thấy file storage.rules tại: ${storageRulesPath}`);
    process.exit(1);
  }
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const storageRulesContent = fs.readFileSync(storageRulesPath, 'utf8');
  const { host, port } = parseEmulatorHostPort();
  const storageEndpoint = parseStorageEmulatorHostPort();

  console.log('===================================================================');
  console.log('--- M7.3.5.1 FIRESTORE & STORAGE SECURITY RULES EMULATOR SUITE ---');
  console.log(`Project ID      : ${DEMO_PROJECT_ID}`);
  console.log(`Firestore Emul  : ${host}:${port}`);
  console.log(`Storage Emul    : ${storageEndpoint.host}:${storageEndpoint.port}`);
  console.log(`Firestore Rules : ${rulesPath} (${rulesContent.length} bytes)`);
  console.log(`Storage Rules   : ${storageRulesPath} (${storageRulesContent.length} bytes)`);
  console.log('===================================================================');

  const reachable = await checkTcpPortReachable(host, port);
  const storageReachable = await checkTcpPortReachable(storageEndpoint.host, storageEndpoint.port);
  if (!reachable) {
    console.error(
      `[NOT VERIFIED] Firebase Rules Emulator chưa lắng nghe tại ${host}:${port} (môi trường hiện tại thiếu Java Runtime JRE/JDK nên không thể khởi chạy tiến trình Emulator).`
    );
    console.error(
      `Hướng dẫn chạy trên máy có cài Java (JDK 11+):\n  npx firebase-tools emulators:exec --only firestore,storage --project ${DEMO_PROJECT_ID} "npx tsx scripts/test_firestore_rules_m7_3.ts"`
    );
    process.exit(2);
  }

  let testEnv: RulesTestEnvironment;
  try {
    testEnv = await initializeTestEnvironment({
      projectId: DEMO_PROJECT_ID,
      firestore: {
        host,
        port,
        rules: rulesContent,
      },
      ...(storageReachable
        ? {
            storage: {
              host: storageEndpoint.host,
              port: storageEndpoint.port,
              rules: storageRulesContent,
            },
          }
        : {}),
    });
  } catch (err: any) {
    console.error('[FAIL] Không thể khởi tạo môi trường RulesTestEnvironment hoặc biên dịch firestore.rules / storage.rules thất bại:');
    console.error(err?.message || err);
    process.exit(1);
  }

  const records: RuleAssertionRecord[] = [];

  async function checkRule(
    id: string,
    group: number,
    kind: 'ALLOW' | 'DENY',
    name: string,
    ruleLocation: string,
    op: () => Promise<unknown>
  ): Promise<void> {
    try {
      if (kind === 'ALLOW') {
        await assertSucceeds(op());
      } else {
        await assertFails(op());
      }
      records.push({ id, group, kind, name, ruleLocation, passed: true });
    } catch (err: any) {
      const reason = err?.message || String(err);
      records.push({
        id,
        group,
        kind,
        name,
        ruleLocation,
        passed: false,
        errorReason: reason,
      });
      console.error(`  [FAIL] ${id} (${kind}) - ${name}`);
      console.error(`         Vị trí Rules : ${ruleLocation}`);
      console.error(`         Lý do        : ${reason}`);
    }
  }

  try {
    await testEnv.clearFirestore();

    // =========================================================================
    // Khởi tạo 5 ngữ cảnh xác thực riêng biệt theo đúng Mục V
    // =========================================================================
    const hostCtx = testEnv.authenticatedContext('uid_host_1', {
      email: 'host1@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    const guestCtx = testEnv.authenticatedContext('uid_guest_2', {
      email: 'guest2@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    const thirdPartyCtx = testEnv.authenticatedContext('uid_third_3', {
      email: 'third3@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });
    const unverifiedCtx = testEnv.authenticatedContext('uid_unverified_4', {
      email: 'unverified4@gmail.com',
      email_verified: false,
      firebase: { sign_in_provider: 'google.com' },
    });
    const superAdminCtx = testEnv.authenticatedContext('uid_super_admin', {
      email: 'linhnk2013@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    });

    const hostDb = hostCtx.firestore();
    const guestDb = guestCtx.firestore();
    const thirdDb = thirdPartyCtx.firestore();
    const unverifiedDb = unverifiedCtx.firestore();
    const superAdminDb = superAdminCtx.firestore();

    const nowMs = Date.now();
    const validExpiresAt = nowMs + 900_000;

    const baseWaitingLobby = (roomCode: string) => ({
      roomCode,
      status: 'WAITING',
      difficulty: 'DEFAULT',
      hostUid: 'uid_host_1',
      hostDisplayName: 'Host 1',
      hostReady: false,
      hostLastActiveAt: nowMs,
      guestUid: null,
      guestDisplayName: null,
      guestReady: false,
      guestLastActiveAt: null,
      rtcConnectionState: 'NEW',
      createdAt: nowMs,
      expiresAt: validExpiresAt,
      disconnectReason: null,
    });

    const baseSignaling = (roomCode: string) => ({
      roomCode,
      hostUid: 'uid_host_1',
      guestUid: null,
      rtcOffer: null,
      rtcAnswer: null,
      hostIceCandidates: null,
      guestIceCandidates: null,
      finalScore: 0,
      matchOutcome: null,
      updatedAt: nowMs,
    });

    // =========================================================================
    // Nhóm 1: Host tạo WAITING room và signaling
    // =========================================================================
    await checkRule(
      'R01_DENY_UNVERIFIED_CREATE_ROOM',
      1,
      'DENY',
      'Người dùng chưa xác minh email không được tạo phòng Co-op',
      'firestore.rules: isVerifiedPersonalGmail() / match /coop_rooms/{roomCode} allow create',
      () =>
        setDoc(doc(unverifiedDb, 'coop_rooms', 'BT0001'), {
          ...baseWaitingLobby('BT0001'),
          hostUid: 'uid_unverified_4',
        })
    );

    await checkRule(
      'R01_DENY_SIGNALING_WITHOUT_PARENT_ROOM',
      1,
      'DENY',
      'Không được tạo private/signaling khi phòng cha chưa tồn tại',
      'firestore.rules: match /private/{docId} allow create (parentRoomExists())',
      () => setDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), baseSignaling('BT0001'))
    );

    await checkRule(
      'R01_ALLOW_HOST_CREATE_WAITING_ROOM',
      1,
      'ALLOW',
      'Host Gmail cá nhân đã xác minh tạo phòng WAITING hợp lệ',
      'firestore.rules: match /coop_rooms/{roomCode} allow create',
      () => setDoc(doc(hostDb, 'coop_rooms', 'BT0001'), baseWaitingLobby('BT0001'))
    );

    await checkRule(
      'R01_DENY_THIRD_PARTY_CREATE_SIGNALING',
      1,
      'DENY',
      'Người thứ ba không được tạo private/signaling trong phòng của Host',
      'firestore.rules: match /private/{docId} allow create (parentRoom().hostUid == request.auth.uid)',
      () =>
        setDoc(doc(thirdDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          ...baseSignaling('BT0001'),
          hostUid: 'uid_third_3',
        })
    );

    await checkRule(
      'R01_ALLOW_HOST_CREATE_SIGNALING',
      1,
      'ALLOW',
      'Host của phòng cha tạo private/signaling khởi tạo hợp lệ',
      'firestore.rules: match /private/{docId} allow create',
      () => setDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), baseSignaling('BT0001'))
    );

    // =========================================================================
    // Nhóm 2 & 3: Guest tham gia phòng có signaling hợp lệ & chặn khi thiếu signaling
    // =========================================================================
    // Tạo phòng BT0002 nhưng KHÔNG tạo private/signaling
    await setDoc(doc(hostDb, 'coop_rooms', 'BT0002'), baseWaitingLobby('BT0002'));

    await checkRule(
      'R03_DENY_GUEST_JOIN_WITHOUT_SIGNALING',
      3,
      'DENY',
      'Guest không được tham gia phòng chờ khi thiếu tài liệu private/signaling',
      'firestore.rules: isCoopGuestJoinAction(roomCode) -> signalingDocExists(roomCode)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0002'), {
          guestUid: 'uid_guest_2',
          guestDisplayName: 'Guest 2',
          guestReady: false,
          guestLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R02_ALLOW_GUEST_JOIN_WITH_SIGNALING',
      2,
      'ALLOW',
      'Guest tham gia phòng WAITING đã có private/signaling hợp lệ',
      'firestore.rules: isCoopGuestJoinAction(roomCode)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          guestUid: 'uid_guest_2',
          guestDisplayName: 'Guest 2',
          guestReady: false,
          guestLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 4: Người thứ ba không được chiếm phòng đã có Guest
    // =========================================================================
    await checkRule(
      'R04_DENY_THIRD_PARTY_HIJACK_SLOT',
      4,
      'DENY',
      'Người thứ ba không được ghi đè guestUid khi phòng đã có Guest',
      'firestore.rules: isCoopGuestJoinAction(roomCode) (existing().guestUid == null)',
      () =>
        updateDoc(doc(thirdDb, 'coop_rooms', 'BT0001'), {
          guestUid: 'uid_third_3',
          guestDisplayName: 'Third 3',
          guestReady: false,
          guestLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 5, 8, 9: Guest cập nhật guestReady khi WAITING; cấm sửa rtcConnectionState và status
    // =========================================================================
    await checkRule(
      'R08_DENY_GUEST_UPDATE_RTC_STATE',
      8,
      'DENY',
      'Guest không được thay đổi rtcConnectionState',
      'firestore.rules: isCoopGuestReadyOrStateAction() (incoming().rtcConnectionState == existing().rtcConnectionState)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          guestReady: true,
          rtcConnectionState: 'CONNECTED',
          guestLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R09_DENY_GUEST_UPDATE_STATUS_PLAYING',
      9,
      'DENY',
      'Guest không được tự chuyển status sang PLAYING',
      'firestore.rules: isCoopGuestReadyOrStateAction() (incoming().status == existing().status)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          status: 'PLAYING',
          guestLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R05_ALLOW_GUEST_UPDATE_READY_IN_WAITING',
      5,
      'ALLOW',
      'Guest được cập nhật guestReady và guestLastActiveAt khi phòng đang WAITING',
      'firestore.rules: isCoopGuestReadyOrStateAction() (WAITING branch)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          guestReady: true,
          guestLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 10 & 11: Chuyển WAITING -> PLAYING khi thiếu điều kiện vs đủ điều kiện
    // =========================================================================
    await checkRule(
      'R11_DENY_HOST_START_BEFORE_HOST_READY_AND_CONNECTED',
      11,
      'DENY',
      'Host không được chuyển WAITING -> PLAYING khi chưa Ready hoặc chưa CONNECTED',
      'firestore.rules: isValidHostStatusTransition(roomCode) branch 2',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          status: 'PLAYING',
          hostLastActiveAt: Date.now(),
        })
    );

    // Host cập nhật hostReady = true và rtcConnectionState = 'CONNECTED'
    await checkRule(
      'R10_ALLOW_HOST_SET_READY_AND_CONNECTED',
      10,
      'ALLOW',
      'Host cập nhật hostReady = true và rtcConnectionState = CONNECTED',
      'firestore.rules: isCoopHostUpdateAction(roomCode)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          hostReady: true,
          rtcConnectionState: 'CONNECTED',
          hostLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R10_ALLOW_HOST_START_MATCH_WHEN_READY',
      10,
      'ALLOW',
      'Host chuyển WAITING -> PLAYING khi cả 2 đã Ready, CONNECTED và có signaling',
      'firestore.rules: isValidHostStatusTransition(roomCode) branch 2',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          status: 'PLAYING',
          hostLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 6 & 7: Khi PLAYING, Guest KHÔNG được sửa guestReady, chỉ được cập nhật guestLastActiveAt
    // =========================================================================
    await checkRule(
      'R06_DENY_GUEST_UPDATE_READY_IN_PLAYING',
      6,
      'DENY',
      'Guest không được thay đổi guestReady khi phòng đang PLAYING (M7.3.1)',
      'firestore.rules: isCoopGuestReadyOrStateAction() (PLAYING branch: incoming().guestReady == existing().guestReady)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          guestReady: false,
          guestLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R07_ALLOW_GUEST_UPDATE_LAST_ACTIVE_IN_PLAYING',
      7,
      'ALLOW',
      'Guest được phép cập nhật guestLastActiveAt khi phòng đang PLAYING (phục vụ retry WebRTC)',
      'firestore.rules: isCoopGuestReadyOrStateAction() (PLAYING branch)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          guestLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 14 & 15: Guest không được tự chuyển sang FINISHED; không được sửa expiresAt
    // =========================================================================
    await checkRule(
      'R14_DENY_GUEST_FINISH_ROOM',
      14,
      'DENY',
      'Guest không được tự chuyển phòng sang FINISHED',
      'firestore.rules: isCoopGuestReadyOrStateAction() / isCoopGuestLeaveAction()',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001'), {
          status: 'FINISHED',
          guestLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R15_DENY_EXTEND_EXPIRES_AT',
      15,
      'DENY',
      'Host không được sửa đổi hoặc gia hạn expiresAt sau khi tạo phòng',
      'firestore.rules: isImmutableCoopCoreUnchanged() (incoming().expiresAt == existing().expiresAt)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          expiresAt: validExpiresAt + 600_000,
          hostLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R15_DENY_CREATE_ROOM_EXCEEDING_15_MIN_TTL',
      15,
      'DENY',
      'Không được tạo phòng có expiresAt vượt quá 15 phút (900,000 ms) tính từ request.time',
      'firestore.rules: isValidCoopRoomCreationTime(data)',
      () =>
        setDoc(doc(hostDb, 'coop_rooms', 'BT0099'), {
          ...baseWaitingLobby('BT0099'),
          expiresAt: Date.now() + 950_000,
        })
    );

    // =========================================================================
    // Nhóm 16: Kiểm tra quyền đọc/ghi private/signaling
    // =========================================================================
    await checkRule(
      'R16_DENY_THIRD_PARTY_READ_FULL_ROOM',
      16,
      'DENY',
      'Người thứ ba không được đọc tài liệu phòng đã đủ 2 người và đang PLAYING',
      'firestore.rules: match /coop_rooms/{roomCode} allow get',
      () => getDoc(doc(thirdDb, 'coop_rooms', 'BT0001'))
    );

    await checkRule(
      'R16_DENY_THIRD_PARTY_READ_SIGNALING',
      16,
      'DENY',
      'Người thứ ba không được đọc tài liệu private/signaling',
      'firestore.rules: match /private/{docId} allow get',
      () => getDoc(doc(thirdDb, 'coop_rooms', 'BT0001', 'private', 'signaling'))
    );

    await checkRule(
      'R16_ALLOW_HOST_WRITE_OFFER_SIGNALING',
      16,
      'ALLOW',
      'Host cập nhật guestUid, rtcOffer và hostIceCandidates trong private/signaling',
      'firestore.rules: match /private/{docId} allow update (branch 1)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          guestUid: 'uid_guest_2',
          rtcOffer: '{"type":"offer","sdp":"v=0"}',
          hostIceCandidates: '[{"candidate":"1"}]',
          updatedAt: Date.now(),
        })
    );

    await checkRule(
      'R16_ALLOW_GUEST_WRITE_ANSWER_SIGNALING',
      16,
      'ALLOW',
      'Guest đã vào phòng cập nhật rtcAnswer và guestIceCandidates trong private/signaling',
      'firestore.rules: match /private/{docId} allow update (branch 3)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          guestUid: 'uid_guest_2',
          rtcAnswer: '{"type":"answer","sdp":"v=0"}',
          guestIceCandidates: '[{"candidate":"2"}]',
          updatedAt: Date.now(),
        })
    );

    await checkRule(
      'R16_DENY_GUEST_WRITE_MATCH_RESULT',
      16,
      'DENY',
      'Guest không được ghi finalScore hoặc matchOutcome vào private/signaling',
      'firestore.rules: match /private/{docId} allow update (branch 3: incoming().finalScore == existing().finalScore)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          finalScore: 5000,
          matchOutcome: 'VICTORY',
          updatedAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 12 & 13: PLAYING -> FINISHED bắt buộc có kết quả hợp lệ trong private/signaling
    // =========================================================================
    await checkRule(
      'R13_DENY_FINISH_WITHOUT_RECORDED_RESULT',
      13,
      'DENY',
      'Host bị từ chối chuyển PLAYING -> FINISHED khi private/signaling chưa có kết quả (matchOutcome == null)',
      'firestore.rules: isValidHostStatusTransition(roomCode) branch 6 -> hasValidRecordedMatchResult(roomCode)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          status: 'FINISHED',
          hostLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R13_DENY_INVALID_MATCH_OUTCOME_OR_SCORE',
      13,
      'DENY',
      'Từ chối ghi kết quả có finalScore âm hoặc matchOutcome sai định dạng',
      'firestore.rules: isValidCoopSignalingSchema() & allow update branch 2',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          finalScore: -50,
          matchOutcome: 'VICTORY',
          updatedAt: Date.now(),
        })
    );

    // Tạo phòng BT0003 ở trạng thái PLAYING với signaling bị lệch guestUid / hostUid / roomCode để kiểm tra chặt hasValidRecordedMatchResult
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'coop_rooms', 'BT0003'), {
        ...baseWaitingLobby('BT0003'),
        status: 'PLAYING',
        hostReady: true,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: true,
        guestLastActiveAt: Date.now(),
        rtcConnectionState: 'CONNECTED',
      });
      await setDoc(doc(bypassDb, 'coop_rooms', 'BT0003', 'private', 'signaling'), {
        ...baseSignaling('BT0003'),
        roomCode: 'BT9999', // Sai roomCode
        guestUid: 'uid_guest_2',
        finalScore: 5000,
        matchOutcome: 'VICTORY',
        updatedAt: Date.now(),
      });
    });

    await checkRule(
      'R13_DENY_FINISH_MISMATCHED_SIGNALING_ROOM_CODE',
      13,
      'DENY',
      'Từ chối PLAYING -> FINISHED nếu signaling.roomCode không khớp với roomCode',
      'firestore.rules: hasValidRecordedMatchResult(roomCode) (signalingDoc(roomCode).roomCode == roomCode)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0003'), {
          status: 'FINISHED',
          hostLastActiveAt: Date.now(),
        })
    );

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'coop_rooms', 'BT0003', 'private', 'signaling'), {
        ...baseSignaling('BT0003'),
        roomCode: 'BT0003',
        guestUid: 'uid_third_3', // Sai guestUid so với phòng cha
        finalScore: 5000,
        matchOutcome: 'VICTORY',
        updatedAt: Date.now(),
      });
    });

    await checkRule(
      'R13_DENY_FINISH_MISMATCHED_SIGNALING_GUEST_UID',
      13,
      'DENY',
      'Từ chối PLAYING -> FINISHED nếu signaling.guestUid không khớp với existing().guestUid',
      'firestore.rules: hasValidRecordedMatchResult(roomCode) (signalingDoc(roomCode).guestUid == existing().guestUid)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0003'), {
          status: 'FINISHED',
          hostLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R12_ALLOW_HOST_RECORD_MATCH_RESULT_ONCE',
      12,
      'ALLOW',
      'Host ghi kết quả hợp lệ (finalScore, matchOutcome) đúng 1 lần khi phòng đang PLAYING',
      'firestore.rules: match /private/{docId} allow update (branch 2)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          finalScore: 6800,
          matchOutcome: 'VICTORY',
          updatedAt: Date.now(),
        })
    );

    await checkRule(
      'R12_DENY_HOST_OVERWRITE_RECORDED_RESULT',
      12,
      'DENY',
      'Host không được phép ghi đè kết quả trận đấu sau khi đã ghi',
      'firestore.rules: match /private/{docId} allow update (branch 2: existing().matchOutcome == null)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001', 'private', 'signaling'), {
          finalScore: 9999,
          matchOutcome: 'GAME_OVER',
          updatedAt: Date.now(),
        })
    );

    await checkRule(
      'R12_ALLOW_HOST_FINISH_AFTER_VALID_RESULT',
      12,
      'ALLOW',
      'Host chuyển PLAYING -> FINISHED thành công sau khi private/signaling đã có kết quả hợp lệ',
      'firestore.rules: isValidHostStatusTransition(roomCode) branch 6 -> hasValidRecordedMatchResult(roomCode)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          status: 'FINISHED',
          hostLastActiveAt: Date.now(),
        })
    );

    await checkRule(
      'R13_DENY_REOPEN_FINISHED_ROOM',
      13,
      'DENY',
      'Host không thể mở lại phòng đã FINISHED về PLAYING hoặc WAITING',
      'firestore.rules: isValidHostStatusTransition(roomCode)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'BT0001'), {
          status: 'PLAYING',
          hostLastActiveAt: Date.now(),
        })
    );

    // =========================================================================
    // Nhóm 17: Kiểm tra Session M7.1 (/user_sessions/{uid}) và Super Admin (/admins/{uid}) không bị ảnh hưởng
    // =========================================================================
    const sessionDocId = 'uid_host_1';
    const token1 = 'sess_token_1234567890abcdef';
    const device1 = 'dev_token_1234567890abcdef';
    const device2 = 'dev_token_other_9999999999';

    await checkRule(
      'R17_ALLOW_CREATE_M71_SESSION',
      17,
      'ALLOW',
      'Chủ tài khoản tạo phiên M7.1 hợp lệ trên /user_sessions/{uid}',
      'firestore.rules: match /user_sessions/{uid} allow create',
      () =>
        setDoc(doc(hostDb, 'user_sessions', sessionDocId), {
          uid: sessionDocId,
          sessionId: token1,
          deviceId: device1,
          isActive: true,
          userAgentSummary: 'Chrome Windows 10',
          loginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R17_DENY_HEARTBEAT_BEFORE_120S',
      17,
      'DENY',
      'Từ chối heartbeat M7.1 sớm trước 120 giây (chống spam write)',
      'firestore.rules: isSameDeviceHeartbeatAction() (request.time >= existing().lastActiveAt + 120s)',
      () =>
        updateDoc(doc(hostDb, 'user_sessions', sessionDocId), {
          lastActiveAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R17_DENY_SECOND_DEVICE_STEAL_ACTIVE_SESSION',
      17,
      'DENY',
      'Thiết bị thứ 2 không được chiếm phiên đang hoạt động (First-Active-Session Wins)',
      'firestore.rules: isNewSessionAcquisitionAction()',
      () =>
        updateDoc(doc(hostDb, 'user_sessions', sessionDocId), {
          sessionId: 'sess_token_second_abcdef1234',
          deviceId: device2,
          isActive: true,
          userAgentSummary: 'Mobile Safari',
          loginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R17_ALLOW_SAME_DEVICE_LOGOUT',
      17,
      'ALLOW',
      'Cùng thiết bị giải phóng phiên đăng xuất an toàn (isActive: false)',
      'firestore.rules: isSameDeviceLogoutAction()',
      () =>
        updateDoc(doc(hostDb, 'user_sessions', sessionDocId), {
          isActive: false,
          lastActiveAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R17_ALLOW_SUPER_ADMIN_WRITE_ADMINS',
      17,
      'ALLOW',
      'Admin duy nhất (linhnk2013@gmail.com) có quyền ghi nguyên tử /admins/{uid} + /role_audit_logs/{logId} để cấp quyền MOD',
      'firestore.rules: match /admins/{uid} & /role_audit_logs/{logId} allow create, update: if isAdmin() && hasMatchingAtomicRoleAuditLog()',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_r17_grant_mod_host1';
        batch.set(doc(superAdminDb, 'admins', 'uid_host_1'), {
          uid: 'uid_host_1',
          email: 'host1@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'GRANT_MOD',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_host_1',
          targetEmail: 'host1@gmail.com',
          targetDisplayName: 'Host 1',
          previousRole: 'PLAYER',
          newRole: 'MOD',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    await checkRule(
      'R17_DENY_NON_SUPER_ADMIN_WRITE_ADMINS',
      17,
      'DENY',
      'Người dùng thường không có quyền ghi/xóa /admins/{uid}',
      'firestore.rules: match /admins/{uid} allow delete: if false',
      () =>
        deleteDoc(doc(hostDb, 'admins', 'uid_host_1'))
    );

    // =========================================================================
    // Nhóm 18: Cấu hình nhạc nền chung /system_config/audio (M7.3.3)
    // =========================================================================
    const validSystemAudioPayload = {
      assetPath: 'audio/bgm_v1_bantank_theme_8bit.mp3',
      fileName: 'bgm_v1_bantank_theme_8bit.mp3',
      contentType: 'audio/mpeg',
      fileSize: 4_500_000,
      updatedAt: Date.now(),
      updatedBy: 'linhnk2013@gmail.com',
      version: 1,
      isEnabled: true,
      displayName: 'Bắn Tank 8-Bit Theme',
      durationSec: 140,
      trimStartSec: 0,
      trimEndSec: 140,
      loopGapMs: 0,
      fadeOutMs: 800,
    };

    await checkRule(
      'R18_ALLOW_SUPER_ADMIN_WRITE_SYSTEM_AUDIO',
      18,
      'ALLOW',
      'Admin (linhnk2013@gmail.com) tạo/cập nhật cấu hình nhạc nền chung /system_config/audio hợp lệ',
      'firestore.rules: match /system_config/{docId} allow create, update: if isAdmin() && docId == "audio" && isValidSystemAudioConfig(incoming())',
      () => setDoc(doc(superAdminDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R18_ALLOW_PLAYER_READ_SYSTEM_AUDIO',
      18,
      'ALLOW',
      'Người chơi Gmail đã xác minh được phép đọc /system_config/audio để đồng bộ nhạc nền chung',
      'firestore.rules: match /system_config/{docId} allow get: if isVerifiedPersonalGmail() && docId == "audio"',
      () => getDoc(doc(hostDb, 'system_config', 'audio'))
    );

    await checkRule(
      'R18_DENY_PLAYER_WRITE_SYSTEM_AUDIO',
      18,
      'DENY',
      'Người chơi thường bị chặn ghi/sửa /system_config/audio',
      'firestore.rules: match /system_config/{docId} allow create, update: if isSuperAdmin()',
      () =>
        setDoc(doc(hostDb, 'system_config', 'audio'), {
          ...validSystemAudioPayload,
          version: 2,
        })
    );

    await checkRule(
      'R18_DENY_UNVERIFIED_READ_SYSTEM_AUDIO',
      18,
      'DENY',
      'Tài khoản chưa xác minh Gmail bị chặn đọc /system_config/audio',
      'firestore.rules: match /system_config/{docId} allow get: if isVerifiedPersonalGmail()',
      () => getDoc(doc(unverifiedDb, 'system_config', 'audio'))
    );

    // =========================================================================
    // Nhóm 19: Danh mục Avatar chung /avatar_catalog/{avatarId} & Lựa chọn Avatar /users/{uid} (M7.3.5)
    // =========================================================================
    const validCatalogAvatarDoc = {
      avatarId: 'tank_01',
      name: 'Chiến Xa Đại Bàng Vàng',
      storagePath: 'avatar_catalog/tank_01/v1/gold_tank.png',
      contentType: 'image/png',
      fileSize: 4096,
      version: 1,
      sortOrder: 10,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: 'linhnk2013@gmail.com',
    };

    const inactiveCatalogAvatarDoc = {
      avatarId: 'tank_hidden',
      name: 'Chiến Xa Tạm Ẩn',
      storagePath: 'avatar_catalog/tank_hidden/v1/hidden_tank.png',
      contentType: 'image/png',
      fileSize: 4096,
      version: 1,
      sortOrder: 20,
      isActive: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: 'linhnk2013@gmail.com',
    };

    await checkRule(
      'R19_ALLOW_SUPER_ADMIN_CREATE_CATALOG_AVATAR',
      19,
      'ALLOW',
      'Admin (linhnk2013@gmail.com) tạo avatar đang hoạt động trong /avatar_catalog/tank_01',
      'firestore.rules: match /avatar_catalog/{avatarId} allow create: if isAdmin() && isValidAvatarCatalogDoc(incoming(), avatarId)',
      async () => {
        await setDoc(doc(superAdminDb, 'avatar_catalog', 'tank_01'), validCatalogAvatarDoc);
        await setDoc(doc(superAdminDb, 'avatar_catalog', 'tank_hidden'), inactiveCatalogAvatarDoc);
      }
    );

    await checkRule(
      'R19_DENY_PLAYER_CREATE_CATALOG_AVATAR',
      19,
      'DENY',
      'Người chơi thường bị chặn tạo/sửa tài liệu trong /avatar_catalog',
      'firestore.rules: match /avatar_catalog/{avatarId} allow create, update, delete: if isSuperAdmin()',
      () =>
        setDoc(doc(hostDb, 'avatar_catalog', 'tank_hack'), {
          ...validCatalogAvatarDoc,
          avatarId: 'tank_hack',
          storagePath: 'avatar_catalog/tank_hack/v1/gold_tank.png',
        })
    );

    await checkRule(
      'R19_ALLOW_OWNER_SELECT_ACTIVE_CATALOG_AVATAR',
      19,
      'ALLOW',
      'Chính chủ (uid_host_1) chọn avatar đang hoạt động (tank_01) trong /users/uid_host_1',
      'firestore.rules: match /users/{uid} allow create: if isOwner(uid) && isActiveCatalogAvatar(incoming().avatarId)',
      () =>
        setDoc(doc(hostDb, 'users', 'uid_host_1'), {
          uid: 'uid_host_1',
          avatarType: 'catalog',
          avatarId: 'tank_01',
          avatarUpdatedAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R19_DENY_OWNER_SELECT_INACTIVE_CATALOG_AVATAR',
      19,
      'DENY',
      'Chính chủ bị chặn chọn avatar không hoạt động (tank_hidden, isActive == false)',
      'firestore.rules: isActiveCatalogAvatar requires get(/avatar_catalog/$(avatarId)).data.isActive == true',
      () =>
        setDoc(doc(hostDb, 'users', 'uid_host_1'), {
          uid: 'uid_host_1',
          avatarType: 'catalog',
          avatarId: 'tank_hidden',
          avatarUpdatedAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R19_ALLOW_OWNER_SWITCH_TO_GOOGLE_AVATAR',
      19,
      'ALLOW',
      'Chính chủ chuyển lại ảnh Google (avatarType == "google", avatarId == null)',
      'firestore.rules: match /users/{uid} allow update: if isOwner(uid) && incoming().avatarType == "google" && incoming().avatarId == null',
      () =>
        setDoc(doc(hostDb, 'users', 'uid_host_1'), {
          uid: 'uid_host_1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R19_DENY_OTHER_USER_UPDATE_PROFILE',
      19,
      'DENY',
      'Người chơi khác (uid_guest_2) bị chặn sửa metadata /users/uid_host_1',
      'firestore.rules: match /users/{uid} allow update: if isOwner(uid)',
      () =>
        setDoc(doc(guestDb, 'users', 'uid_host_1'), {
          uid: 'uid_host_1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R19_ALLOW_PLAYER_READ_AVATAR_CATALOG',
      19,
      'ALLOW',
      'Người chơi Gmail đã xác minh đọc được tài liệu trong /avatar_catalog',
      'firestore.rules: match /avatar_catalog/{avatarId} allow get, list: if isVerifiedPersonalGmail()',
      () => getDoc(doc(hostDb, 'avatar_catalog', 'tank_01'))
    );

    await checkRule(
      'R19_DENY_PRIVILEGE_ESCALATION_FIELDS_ON_USERS',
      19,
      'DENY',
      'Chính chủ bị chặn chèn các trường cấm (role, isSuperAdmin, xp, xu, rank, email) vào /users/{uid}',
      'firestore.rules: isValidUserProfileCreate / isValidUserProfileUpdate',
      () =>
        setDoc(doc(hostDb, 'users', 'uid_host_1'), {
          uid: 'uid_host_1',
          avatarType: 'google',
          avatarId: null,
          avatarUpdatedAt: serverTimestamp(),
          role: 'SUPER_ADMIN',
          isSuperAdmin: true,
          xp: 999999,
        })
    );

    // Khởi tạo hồ sơ cũ có sẵn xp, xu, rank, createdAt (bằng withSecurityRulesDisabled) rồi kiểm tra chính chủ đổi avatar hoặc đổi displayName tách biệt
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'users', 'uid_guest_2'), {
        uid: 'uid_guest_2',
        displayName: 'Veteran Guest 2',
        avatarType: 'google',
        avatarId: null,
        avatarUpdatedAt: Timestamp.now(),
        xp: 8500,
        xu: 2100,
        rank: 'MAJOR',
        createdAt: Timestamp.now(),
      });
    });

    await checkRule(
      'R19_ALLOW_UPDATE_AVATAR_PRESERVING_LEGACY_PROFILE_FIELDS',
      19,
      'ALLOW',
      'Cập nhật avatar qua setDoc(..., { merge: true }) không gửi/sửa uid, không làm mất và không bị chặn bởi các trường hồ sơ cũ hợp lệ (xp, xu, rank, createdAt)',
      'firestore.rules: isUserAvatarSelectionUpdate -> incoming().diff(existing()).affectedKeys().hasOnly(["avatarType", "avatarId", "avatarUpdatedAt"])',
      () =>
        setDoc(
          doc(guestDb, 'users', 'uid_guest_2'),
          {
            avatarType: 'catalog',
            avatarId: 'tank_01',
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_ALLOW_UPDATE_DISPLAY_NAME_SEPARATELY',
      19,
      'ALLOW',
      'Cập nhật riêng displayName qua setDoc(..., { merge: true }) giữ nguyên uid, avatar và các trường hồ sơ cũ',
      'firestore.rules: isUserDisplayNameUpdate -> incoming().diff(existing()).affectedKeys().hasOnly(["displayName"])',
      () =>
        setDoc(
          doc(guestDb, 'users', 'uid_guest_2'),
          {
            displayName: 'Commander Guest 2',
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_DENY_USER_MUTATING_UID_ON_UPDATE',
      19,
      'DENY',
      'Chặn người chơi thay đổi trường uid trong /users/{uid} khi cập nhật hồ sơ',
      'firestore.rules: isValidExistingUserUpdate(uid) -> !affectedKeys().hasAny(["uid", ...])',
      () =>
        setDoc(
          doc(guestDb, 'users', 'uid_guest_2'),
          {
            uid: 'uid_hacked_999',
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_DENY_COMBINED_DISPLAY_NAME_AND_AVATAR_UPDATE',
      19,
      'DENY',
      'Chặn gộp đồng thời chỉnh displayName và đổi avatar trong cùng 1 request do đã tách quyền',
      'firestore.rules: isUserAvatarSelectionUpdate || isUserDisplayNameUpdate',
      () =>
        setDoc(
          doc(guestDb, 'users', 'uid_guest_2'),
          {
            displayName: 'Mixed Update Name',
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    // Khởi tạo hồ sơ cũ KHÔNG có trường uid (/users/uid_host_1) rồi kiểm tra:
    // - User khác (uid_guest_2) cố cập nhật hồ sơ cũ không có uid của uid_host_1 -> DENY
    // - Chính chủ (uid_host_1) cập nhật avatar trên hồ sơ cũ không có uid -> ALLOW
    // - Chính chủ (uid_host_1) cố chèn uid vào hồ sơ cũ khi update -> DENY
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'users', 'uid_host_1'), {
        displayName: 'Legacy Host Without UID',
        avatarType: 'google',
        avatarId: null,
        avatarUpdatedAt: Timestamp.now(),
        xp: 6400,
        xu: 1500,
        rank: 'CAPTAIN',
        createdAt: Timestamp.now(),
      });
    });

    await checkRule(
      'R19_DENY_OTHER_USER_UPDATE_LEGACY_PROFILE_WITHOUT_UID',
      19,
      'DENY',
      'Chặn User A (uid_guest_2) cập nhật hồ sơ User B (uid_host_1) kể cả khi hồ sơ cũ của User B chưa có trường uid',
      'firestore.rules: allow update & isValidExistingUserUpdate(uid) -> uid == request.auth.uid',
      () =>
        setDoc(
          doc(guestDb, 'users', 'uid_host_1'),
          {
            avatarType: 'catalog',
            avatarId: 'tank_01',
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_ALLOW_OWNER_UPDATE_LEGACY_PROFILE_WITHOUT_UID',
      19,
      'ALLOW',
      'Cho phép chính chủ (uid_host_1) cập nhật avatar trên hồ sơ cũ chưa có trường uid mà không bắt buộc thêm uid',
      'firestore.rules: !("uid" in existing()) && !("uid" in incoming()) && uid == request.auth.uid',
      () =>
        setDoc(
          doc(hostDb, 'users', 'uid_host_1'),
          {
            avatarType: 'catalog',
            avatarId: 'tank_01',
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_ALLOW_OWNER_UPDATE_DISPLAY_NAME_LEGACY_PROFILE_WITHOUT_UID',
      19,
      'ALLOW',
      'Cho phép chính chủ (uid_host_1) cập nhật displayName trên hồ sơ cũ chưa có trường uid mà không bắt buộc thêm uid',
      'firestore.rules: !("uid" in existing()) && !("uid" in incoming()) && uid == request.auth.uid && displayName is string',
      () =>
        setDoc(
          doc(hostDb, 'users', 'uid_host_1'),
          {
            displayName: 'Host Updated Legacy',
          },
          { merge: true }
        )
    );

    await checkRule(
      'R19_DENY_OWNER_INJECT_UID_INTO_LEGACY_PROFILE_ON_UPDATE',
      19,
      'DENY',
      'Chặn chèn thêm trường uid mới vào hồ sơ cũ chưa có uid trong thao tác update',
      'firestore.rules: !("uid" in existing()) && !("uid" in incoming())',
      () =>
        setDoc(
          doc(hostDb, 'users', 'uid_host_1'),
          {
            uid: 'uid_host_1',
            avatarType: 'google',
            avatarId: null,
            avatarUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        )
    );

    // =========================================================================
    // Nhóm 20: 14 ca kiểm thử Firebase Storage Security Rules (M7.3.5.2 Mục VI)
    // =========================================================================
    if (storageReachable) {
      const unauthCtx = testEnv.unauthenticatedContext();
      const superAdminStorage = superAdminCtx.storage();
      const playerStorage = hostCtx.storage();
      const unauthStorage = unauthCtx.storage();
      const samplePayload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const over5MbPayload = new Uint8Array(5 * 1024 * 1024 + 16);

      // 1. Super Admin upload JPEG hợp lệ: PASS
      await checkRule(
        'R20_01_ALLOW_ADMIN_UPLOAD_JPEG',
        20,
        'ALLOW',
        '1. Super Admin upload JPEG hợp lệ (allow create)',
        'storage.rules: allow create -> isValidCatalogCreate (image/jpeg)',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.jpg'),
            samplePayload,
            { contentType: 'image/jpeg' }
          )
      );

      // 2. Super Admin upload PNG hợp lệ: PASS
      await checkRule(
        'R20_02_ALLOW_ADMIN_UPLOAD_PNG',
        20,
        'ALLOW',
        '2. Super Admin upload PNG hợp lệ (allow create)',
        'storage.rules: allow create -> isValidCatalogCreate (image/png)',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      // 3. Super Admin upload WebP hợp lệ: PASS
      await checkRule(
        'R20_03_ALLOW_ADMIN_UPLOAD_WEBP',
        20,
        'ALLOW',
        '3. Super Admin upload WebP hợp lệ (allow create)',
        'storage.rules: allow create -> isValidCatalogCreate (image/webp)',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.webp'),
            samplePayload,
            { contentType: 'image/webp' }
          )
      );

      // 4. Gmail Admin đã xác minh, Google provider: get PASS
      await checkRule(
        'R20_04_ALLOW_ADMIN_GET_CATALOG_IMAGE',
        20,
        'ALLOW',
        '4. Super Admin Gmail đã xác minh đọc ảnh trong avatar_catalog (allow get)',
        'storage.rules: allow get: if isVerifiedPersonalGmail() && isValidCatalogPath(...)',
        () => getBytes(storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.png'))
      );

      // 5. Người chơi Gmail đã xác minh, Google provider: get PASS
      await checkRule(
        'R20_05_ALLOW_PLAYER_GET_CATALOG_IMAGE',
        20,
        'ALLOW',
        '5. Người chơi Gmail đã xác minh đọc ảnh trong avatar_catalog (allow get)',
        'storage.rules: allow get: if isVerifiedPersonalGmail() && isValidCatalogPath(...)',
        () => getBytes(storageRef(playerStorage, 'avatar_catalog/tank_01/v1/gold.png'))
      );

      // 6. Người chưa đăng nhập: get DENIED
      await checkRule(
        'R20_06_DENY_UNAUTH_GET_CATALOG_IMAGE',
        20,
        'DENY',
        '6. Người chưa đăng nhập bị từ chối đọc ảnh (get DENIED)',
        'storage.rules: allow get -> isVerifiedPersonalGmail()',
        () => getBytes(storageRef(unauthStorage, 'avatar_catalog/tank_01/v1/gold.png'))
      );

      // 7. Người chơi thường: upload DENIED
      await checkRule(
        'R20_07_DENY_PLAYER_UPLOAD',
        20,
        'DENY',
        '7. Người chơi thường upload bị từ chối',
        'storage.rules: allow create -> isSuperAdmin()',
        () =>
          uploadBytes(
            storageRef(playerStorage, 'avatar_catalog/tank_hack/v1/hack.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      // 8. File lớn hơn 5 MiB: DENIED
      await checkRule(
        'R20_08_DENY_OVER_5MB_UPLOAD',
        20,
        'DENY',
        '8. File > 5 MiB bị từ chối',
        'storage.rules: request.resource.size <= 5 * 1024 * 1024',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_big/v1/big.png'),
            over5MbPayload,
            { contentType: 'image/png' }
          )
      );

      // 9. MIME không hợp lệ (image/svg+xml): DENIED
      await checkRule(
        'R20_09_DENY_INVALID_CONTENT_TYPE',
        20,
        'DENY',
        '9. MIME không hợp lệ (image/svg+xml) bị từ chối',
        'storage.rules: request.resource.contentType.matches("^image/(jpeg|png|webp)$")',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_svg/v1/bad.png'),
            samplePayload,
            { contentType: 'image/svg+xml' }
          )
      );

      // 10. list/listAll: DENIED
      await checkRule(
        'R20_10_DENY_LIST_ALL_CATALOG',
        20,
        'DENY',
        '10. Liệt kê list/listAll bị từ chối (allow list: if false)',
        'storage.rules: allow list: if false',
        () => listAll(storageRef(playerStorage, 'avatar_catalog/tank_01/v1'))
      );

      // 11. Đường dẫn ngoài avatar_catalog: DENIED
      await checkRule(
        'R20_11_DENY_OUTSIDE_CATALOG',
        20,
        'DENY',
        '11. Đường dẫn ngoài avatar_catalog bị từ chối',
        'storage.rules: match /{allPaths=**} allow read, write: if false',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'custom_uploads/tank_01/v1/gold.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      // 12. Admin tạo version mới (v2): PASS
      await checkRule(
        'R20_12_ALLOW_ADMIN_CREATE_NEW_VERSION',
        20,
        'ALLOW',
        '12. Super Admin tạo version mới (v2) thành công',
        'storage.rules: allow create (resource == null trên v2)',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_01/v2/gold_v2.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      // 13. Admin upload lần hai cùng đường dẫn (resource != null trong allow create): DENIED
      await checkRule(
        'R20_13_DENY_ADMIN_SECOND_UPLOAD_SAME_PATH',
        20,
        'DENY',
        '13. Super Admin upload lần thứ hai vào chính đường dẫn đã tạo bị từ chối',
        'storage.rules: allow create requires resource == null & allow update: if false',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      // 14. Admin cập nhật metadata object cũ (allow update: if false): DENIED
      await checkRule(
        'R20_14_DENY_ADMIN_UPDATE_METADATA',
        20,
        'DENY',
        '14. Super Admin cập nhật metadata object cũ bị từ chối (allow update: if false)',
        'storage.rules: allow update: if false',
        () =>
          updateMetadata(storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.png'), {
            cacheControl: 'no-cache',
          })
      );

      // 15. Người chơi xóa object: DENIED
      await checkRule(
        'R20_15_DENY_PLAYER_DELETE_OBJECT',
        20,
        'DENY',
        '15. Người chơi xóa object bị từ chối',
        'storage.rules: allow delete -> isSuperAdmin()',
        () => deleteObject(storageRef(playerStorage, 'avatar_catalog/tank_01/v1/gold.jpg'))
      );

      // 16. Admin xóa object: PASS
      await checkRule(
        'R20_16_ALLOW_ADMIN_DELETE_OBJECT',
        20,
        'ALLOW',
        '16. Super Admin xóa object hợp lệ',
        'storage.rules: allow delete (resource != null && request.resource == null)',
        () => deleteObject(storageRef(superAdminStorage, 'avatar_catalog/tank_01/v1/gold.jpg'))
      );

      // =======================================================================
      // Nhóm 22: Kiểm thử Storage Emulator bổ sung cho M7.3.11.5 (Mục 6.2)
      // =======================================================================
      const oldAdminStorage = testEnv
        .authenticatedContext('uid_old_admin_storage', {
          email: 'linhnk.online@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        })
        .storage();
      const modStorage = testEnv
        .authenticatedContext('uid_host_1', {
          email: 'host1@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        })
        .storage();
      const unverifiedAdminStorage = testEnv
        .authenticatedContext('uid_super_admin', {
          email: 'linhnk2013@gmail.com',
          email_verified: false,
          firebase: { sign_in_provider: 'google.com' },
        })
        .storage();
      const nonGoogleAdminStorage = testEnv
        .authenticatedContext('uid_super_admin', {
          email: 'linhnk2013@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'password' },
        })
        .storage();
      const hdWorkspaceAdminStorage = testEnv
        .authenticatedContext('uid_super_admin', {
          email: 'linhnk2013@gmail.com',
          email_verified: true,
          hd: 'company.vn',
          firebase: { sign_in_provider: 'google.com' },
        })
        .storage();

      await checkRule(
        'R22_01_DENY_OLD_ADMIN_STORAGE_UPLOAD',
        22,
        'DENY',
        'M7.3.11.5 (6.2.5): Email quản trị cũ linhnk.online@gmail.com bị từ chối upload vào avatar_catalog',
        'storage.rules: isAdmin() requires request.auth.token.email == "linhnk2013@gmail.com"',
        () =>
          uploadBytes(
            storageRef(oldAdminStorage, 'avatar_catalog/tank_old/v1/old.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      await checkRule(
        'R22_02_DENY_OLD_ADMIN_STORAGE_DELETE',
        22,
        'DENY',
        'M7.3.11.5 (6.2.5): Email quản trị cũ linhnk.online@gmail.com bị từ chối xóa object trong avatar_catalog',
        'storage.rules: allow delete -> isAdmin()',
        () => deleteObject(storageRef(oldAdminStorage, 'avatar_catalog/tank_01/v1/gold.png'))
      );

      await checkRule(
        'R22_03_DENY_MOD_STORAGE_UPLOAD',
        22,
        'DENY',
        'M7.3.11.5 (6.2.6): MOD bị từ chối upload vào avatar_catalog',
        'storage.rules: allow create -> isAdmin()',
        () =>
          uploadBytes(
            storageRef(modStorage, 'avatar_catalog/tank_mod/v1/mod.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      await checkRule(
        'R22_04_DENY_MOD_STORAGE_DELETE',
        22,
        'DENY',
        'M7.3.11.5 (6.2.6): MOD bị từ chối xóa object trong avatar_catalog',
        'storage.rules: allow delete -> isAdmin()',
        () => deleteObject(storageRef(modStorage, 'avatar_catalog/tank_01/v1/gold.png'))
      );

      await checkRule(
        'R22_05_DENY_UNVERIFIED_ADMIN_STORAGE_UPLOAD',
        22,
        'DENY',
        'M7.3.11.5 (6.2.7): linhnk2013@gmail.com nhưng email_verified == false bị từ chối upload Storage',
        'storage.rules: isVerifiedPersonalGmail() -> email_verified == true',
        () =>
          uploadBytes(
            storageRef(unverifiedAdminStorage, 'avatar_catalog/tank_unv/v1/unv.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      await checkRule(
        'R22_06_DENY_NON_GOOGLE_ADMIN_STORAGE_UPLOAD',
        22,
        'DENY',
        'M7.3.11.5 (6.2.7): linhnk2013@gmail.com nhưng provider != google.com bị từ chối upload Storage',
        'storage.rules: hasGoogleSignInProvider()',
        () =>
          uploadBytes(
            storageRef(nonGoogleAdminStorage, 'avatar_catalog/tank_pw/v1/pw.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );

      await checkRule(
        'R22_07_DENY_HD_CLAIM_ADMIN_STORAGE_UPLOAD',
        22,
        'DENY',
        'M7.3.11.5 (6.2.7): linhnk2013@gmail.com nhưng có claim hd (Workspace) bị từ chối upload Storage',
        'storage.rules: hasNoHostedDomainClaim()',
        () =>
          uploadBytes(
            storageRef(hdWorkspaceAdminStorage, 'avatar_catalog/tank_hd/v1/hd.png'),
            samplePayload,
            { contentType: 'image/png' }
          )
      );
    }

    // =========================================================================
    // Nhóm 21: Kiểm thử toàn diện M7.3.11.5 trên Firestore Emulator (Mục 2, 3, 4, 5, 6.1)
    // =========================================================================
    const oldAdminDb = testEnv
      .authenticatedContext('uid_old_admin_99', {
        email: 'linhnk.online@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const lookalikeEmailDb = testEnv
      .authenticatedContext('uid_lookalike_admin', {
        email: 'linhnk2013@gmail.com.vn',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const unverifiedAdminDb = testEnv
      .authenticatedContext('uid_super_admin', {
        email: 'linhnk2013@gmail.com',
        email_verified: false,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const nonGoogleProviderAdminDb = testEnv
      .authenticatedContext('uid_super_admin', {
        email: 'linhnk2013@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      })
      .firestore();
    const hdWorkspaceAdminDb = testEnv
      .authenticatedContext('uid_super_admin', {
        email: 'linhnk2013@gmail.com',
        email_verified: true,
        hd: 'workspace.org',
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();
    const modStaffDb = testEnv
      .authenticatedContext('uid_mod_staff_21', {
        email: 'mod21@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

    // 6.1.1 & Mục 3.1: ADMIN (linhnk2013@gmail.com) tự bootstrap nguyên tử /admins/{adminUid} + /role_audit_logs/{logId} -> ALLOW
    await checkRule(
      'R21_01_ALLOW_SOLE_ADMIN_ATOMIC_BOOTSTRAP',
      21,
      'ALLOW',
      'M7.3.11.5 (6.1.1 & 3.1): linhnk2013@gmail.com tự bootstrap nguyên tử /admins/uid_super_admin + BOOTSTRAP_SOLE_ADMIN Audit Log',
      'firestore.rules: isValidSoleAdminBootstrapWrite & isValidRoleAuditLogDoc(BOOTSTRAP_SOLE_ADMIN)',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_boot_sole_admin_21';
        batch.set(doc(superAdminDb, 'admins', 'uid_super_admin'), {
          uid: 'uid_super_admin',
          email: 'linhnk2013@gmail.com',
          role: 'ADMIN',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'BOOTSTRAP_SOLE_ADMIN',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_super_admin',
          targetEmail: 'linhnk2013@gmail.com',
          targetDisplayName: 'Linh NK 2013 (Sole Admin)',
          previousRole: 'PLAYER',
          newRole: 'ADMIN',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    // 6.1.1b (Mục 3.3): Chặn chạy lại BOOTSTRAP_SOLE_ADMIN khi /admins/uid_super_admin đã active (chống spam ghi lặp)
    await checkRule(
      'R21_02_DENY_DUPLICATE_SOLE_ADMIN_BOOTSTRAP_WHEN_ALREADY_ACTIVE',
      21,
      'DENY',
      'M7.3.11.5 (3.3): Chặn ghi lặp BOOTSTRAP_SOLE_ADMIN khi hồ sơ /admins/uid_super_admin đã ở trạng thái role=ADMIN, isActive=true',
      'firestore.rules: isValidSoleAdminBootstrapWrite requires !exists || !(existing.role == ADMIN && existing.isActive == true)',
      async () => {
        const batch = writeBatch(superAdminDb);
        const dupAuditId = 'audit_boot_dup_blocked_21';
        batch.set(doc(superAdminDb, 'admins', 'uid_super_admin'), {
          uid: 'uid_super_admin',
          email: 'linhnk2013@gmail.com',
          role: 'ADMIN',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: dupAuditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', dupAuditId), {
          auditId: dupAuditId,
          actionType: 'BOOTSTRAP_SOLE_ADMIN',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_super_admin',
          targetEmail: 'linhnk2013@gmail.com',
          targetDisplayName: 'Linh NK 2013 (Duplicate)',
          previousRole: 'PLAYER',
          newRole: 'ADMIN',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    // 6.1.3 & 6.1.4: ADMIN cấp quyền MOD (GRANT_MOD) và thu hồi quyền MOD về PLAYER (REVOKE_TO_PLAYER) kèm Audit Log nguyên tử -> ALLOW
    await checkRule(
      'R21_03_ALLOW_ADMIN_ATOMIC_GRANT_MOD',
      21,
      'ALLOW',
      'M7.3.11.5 (6.1.3): ADMIN cấp quyền MOD nguyên tử kèm Audit Log hợp lệ',
      'firestore.rules: isValidModOrPlayerRoleWrite & hasMatchingAtomicRoleAuditLog',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_21_grant_mod_staff';
        batch.set(doc(superAdminDb, 'admins', 'uid_mod_staff_21'), {
          uid: 'uid_mod_staff_21',
          email: 'mod21@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'GRANT_MOD',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_mod_staff_21',
          targetEmail: 'mod21@gmail.com',
          targetDisplayName: 'Mod Staff 21',
          previousRole: 'PLAYER',
          newRole: 'MOD',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    await checkRule(
      'R21_04_ALLOW_ADMIN_ATOMIC_REVOKE_MOD_TO_PLAYER',
      21,
      'ALLOW',
      'M7.3.11.5 (6.1.4): ADMIN thu hồi quyền MOD về PLAYER (isActive: false) nguyên tử kèm Audit Log',
      'firestore.rules: isValidModOrPlayerRoleWrite (role == PLAYER && isActive == false)',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_21_revoke_mod_staff';
        batch.set(doc(superAdminDb, 'admins', 'uid_mod_staff_21'), {
          uid: 'uid_mod_staff_21',
          email: 'mod21@gmail.com',
          role: 'PLAYER',
          isActive: false,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'REVOKE_TO_PLAYER',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_mod_staff_21',
          targetEmail: 'mod21@gmail.com',
          targetDisplayName: 'Mod Staff 21',
          previousRole: 'MOD',
          newRole: 'PLAYER',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    // Cấp lại MOD cho uid_mod_staff_21 để kiểm thử quyền đọc/ghi của MOD ở bước 6.1.11 - 6.1.12
    await checkRule(
      'R21_04B_REGRANT_MOD_FOR_MOD_TESTS',
      21,
      'ALLOW',
      'M7.3.11.5: ADMIN cấp lại quyền MOD cho uid_mod_staff_21 kèm Audit Log mới',
      'firestore.rules: isValidModOrPlayerRoleWrite',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_21_regrant_mod_staff';
        batch.set(doc(superAdminDb, 'admins', 'uid_mod_staff_21'), {
          uid: 'uid_mod_staff_21',
          email: 'mod21@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'GRANT_MOD',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_mod_staff_21',
          targetEmail: 'mod21@gmail.com',
          targetDisplayName: 'Mod Staff 21',
          previousRole: 'PLAYER',
          newRole: 'MOD',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    // 6.1.5: Ghi /admins/{uid} nhưng thiếu Audit Log trong batch hoặc Audit Log sai nội dung -> DENY
    await checkRule(
      'R21_05A_DENY_ADMIN_WRITE_WITHOUT_AUDIT_LOG',
      21,
      'DENY',
      'M7.3.11.5 (6.1.5): Chặn ADMIN ghi /admins/{uid} đơn lẻ không có Audit Log trong cùng writeBatch',
      'firestore.rules: hasMatchingAtomicRoleAuditLog -> existsAfter(/role_audit_logs/$(lastAuditId))',
      () =>
        setDoc(doc(superAdminDb, 'admins', 'uid_no_audit_target'), {
          uid: 'uid_no_audit_target',
          email: 'noaudit@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: 'audit_missing_doc_999',
        })
    );

    await checkRule(
      'R21_05B_DENY_ADMIN_WRITE_WITH_MISMATCHED_AUDIT_LOG',
      21,
      'DENY',
      'M7.3.11.5 (6.1.5): Chặn writeBatch khi role trong /admins/{uid} (MOD) lệch với newRole trong /role_audit_logs/{logId} (PLAYER)',
      'firestore.rules: getAfter(/role_audit_logs/$(lastAuditId)).data.newRole == data.role',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_mismatch_role_21';
        batch.set(doc(superAdminDb, 'admins', 'uid_mismatch_target'), {
          uid: 'uid_mismatch_target',
          email: 'mismatch@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'REVOKE_TO_PLAYER',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_mismatch_target',
          targetEmail: 'mismatch@gmail.com',
          targetDisplayName: 'Mismatch Target',
          previousRole: 'MOD',
          newRole: 'PLAYER',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    await checkRule(
      'R21_05C_DENY_STANDALONE_AUDIT_LOG_WITHOUT_ADMIN_DOC_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (3.2): Chặn ghi đơn lẻ /role_audit_logs/{logId} mà không cập nhật /admins/{targetUid} tương ứng',
      'firestore.rules: isValidRoleAuditLogDoc -> getAfter(/admins/$(targetUid)).data.lastAuditId == logId',
      () =>
        setDoc(doc(superAdminDb, 'role_audit_logs', 'audit_standalone_fake_21'), {
          auditId: 'audit_standalone_fake_21',
          actionType: 'GRANT_MOD',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_mod_staff_21',
          targetEmail: 'mod21@gmail.com',
          targetDisplayName: 'Mod Staff 21',
          previousRole: 'PLAYER',
          newRole: 'MOD',
          timestampMs: Date.now(),
        })
    );

    // 6.1.6: Cố tạo ADMIN thứ hai -> DENY; cố delete trực tiếp /admins/{uid} -> DENY
    await checkRule(
      'R21_06A_DENY_CREATING_SECOND_ADMIN',
      21,
      'DENY',
      'M7.3.11.5 (6.1.6): Chặn tuyệt đối việc tạo ADMIN thứ hai cho UID/email khác kể cả khi người gọi là linhnk2013@gmail.com',
      'firestore.rules: isValidSoleAdminBootstrapWrite requires uid == request.auth.uid && email == linhnk2013@gmail.com',
      async () => {
        const batch = writeBatch(superAdminDb);
        const auditId = 'audit_illegal_second_admin';
        batch.set(doc(superAdminDb, 'admins', 'uid_second_admin_illegal'), {
          uid: 'uid_second_admin_illegal',
          email: 'secondadmin@gmail.com',
          role: 'ADMIN',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          lastAuditId: auditId,
        });
        batch.set(doc(superAdminDb, 'role_audit_logs', auditId), {
          auditId,
          actionType: 'BOOTSTRAP_SOLE_ADMIN',
          actorUid: 'uid_super_admin',
          actorEmail: 'linhnk2013@gmail.com',
          targetUid: 'uid_second_admin_illegal',
          targetEmail: 'secondadmin@gmail.com',
          targetDisplayName: 'Illegal Second Admin',
          previousRole: 'PLAYER',
          newRole: 'ADMIN',
          timestampMs: Date.now(),
        });
        await batch.commit();
      }
    );

    await checkRule(
      'R21_06B_DENY_DIRECT_DELETE_ON_ADMINS_COLLECTION',
      21,
      'DENY',
      'M7.3.11.5 (2.2): Chặn delete trực tiếp tài liệu /admins/{uid} từ client kể cả với ADMIN (bắt buộc thu hồi qua isActive: false + Audit Log)',
      'firestore.rules: match /admins/{uid} allow delete: if false',
      () => deleteDoc(doc(superAdminDb, 'admins', 'uid_mod_staff_21'))
    );

    // 6.1.7, 6.1.8, 6.1.9, 6.1.10: Kiểm tra từ chối email cũ, email gần giống, chưa xác minh, sai provider, có claim hd
    await checkRule(
      'R21_07_DENY_OLD_ADMIN_EMAIL_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (6.1.7): Email quản trị cũ linhnk.online@gmail.com bị từ chối hoàn toàn quyền ADMIN',
      'firestore.rules: isAdmin() requires email == "linhnk2013@gmail.com"',
      () => setDoc(doc(oldAdminDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R21_08_DENY_LOOKALIKE_ADMIN_EMAIL_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (6.1.8): Email gần giống linhnk2013@gmail.com.vn bị từ chối quyền ADMIN',
      'firestore.rules: isAdmin() & isVerifiedPersonalGmail()',
      () => setDoc(doc(lookalikeEmailDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R21_09_DENY_UNVERIFIED_ADMIN_EMAIL_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (6.1.9): linhnk2013@gmail.com nhưng email_verified == false bị từ chối quyền ADMIN',
      'firestore.rules: isVerifiedPersonalGmail() requires email_verified == true',
      () => setDoc(doc(unverifiedAdminDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R21_10A_DENY_NON_GOOGLE_PROVIDER_ADMIN_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (6.1.10): linhnk2013@gmail.com nhưng sign_in_provider != google.com bị từ chối quyền ADMIN',
      'firestore.rules: hasGoogleSignInProvider()',
      () => setDoc(doc(nonGoogleProviderAdminDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R21_10B_DENY_HD_WORKSPACE_CLAIM_ADMIN_WRITE',
      21,
      'DENY',
      'M7.3.11.5 (2.1): linhnk2013@gmail.com nhưng có claim hd (Google Workspace) bị từ chối quyền ADMIN',
      'firestore.rules: hasNoHostedDomainClaim()',
      () => setDoc(doc(hdWorkspaceAdminDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    // 6.1.11 & 6.1.12 & Mục 4: Quyền đọc/ghi của MOD và cách ly thông tin nhạy cảm
    await checkRule(
      'R21_11_ALLOW_MOD_READ_USERS_ADMINS_AND_AUDIT_LOGS',
      21,
      'ALLOW',
      'M7.3.11.5 (6.1.11 & Mục 4): MOD đang active đọc được /users/{uid}, /admins/{uid} và /role_audit_logs/{logId}',
      'firestore.rules: isStaffModOrAdmin()',
      async () => {
        await getDoc(doc(modStaffDb, 'users', 'uid_guest_2'));
        await getDoc(doc(modStaffDb, 'admins', 'uid_mod_staff_21'));
        await getDoc(doc(modStaffDb, 'role_audit_logs', 'audit_boot_sole_admin_21'));
      }
    );

    await checkRule(
      'R21_12A_DENY_MOD_WRITE_SYSTEM_CONFIG_OR_AVATAR_CATALOG',
      21,
      'DENY',
      'M7.3.11.5 (6.1.12): MOD bị từ chối ghi /system_config và /avatar_catalog',
      'firestore.rules: match /system_config & /avatar_catalog allow write: if isAdmin()',
      () => setDoc(doc(modStaffDb, 'system_config', 'audio'), validSystemAudioPayload)
    );

    await checkRule(
      'R21_12B_DENY_MOD_READ_OTHER_USER_SESSION_DEVICE_INFO',
      21,
      'DENY',
      'M7.3.11.5 (Mục 4): MOD bị từ chối đọc /user_sessions/{otherUid} (bảo vệ deviceId, sessionId, userAgentSummary của người chơi)',
      'firestore.rules: match /user_sessions/{uid} allow get: if isOwner(uid)',
      () => getDoc(doc(modStaffDb, 'user_sessions', sessionDocId))
    );

    // 6.1.13: PLAYER cố đọc dữ liệu quản trị hoặc đọc hồ sơ /users/{otherUid} của người chơi khác -> DENY
    await checkRule(
      'R21_13A_DENY_PLAYER_READ_OTHER_USER_PROFILE',
      21,
      'DENY',
      'M7.3.11.5 (Mục 4 & 6.1.13): Người chơi thường (uid_third_3) bị chặn đọc /users/uid_guest_2 của người chơi khác',
      'firestore.rules: match /users/{uid} allow get: if isOwner(uid) || isStaffModOrAdmin()',
      () => getDoc(doc(thirdDb, 'users', 'uid_guest_2'))
    );

    await checkRule(
      'R21_13B_DENY_PLAYER_READ_ADMINS_OR_AUDIT_LOGS',
      21,
      'DENY',
      'M7.3.11.5 (6.1.13): Người chơi thường bị chặn đọc /admins và /role_audit_logs',
      'firestore.rules: match /admins & /role_audit_logs allow get: if isStaffModOrAdmin()',
      () => getDoc(doc(thirdDb, 'role_audit_logs', 'audit_boot_sole_admin_21'))
    );

    // 6.1.15 (Mục 5.3): Người chơi Gmail xác minh không thuộc phòng cố đọc /coop_rooms/{roomCode}/private/signaling -> DENY
    await checkRule(
      'R21_15_DENY_NON_MEMBER_READ_COOP_SIGNALING_IN_WAITING_ROOM',
      21,
      'DENY',
      'M7.3.11.5 (5.3 & 6.1.15): Người chơi Gmail xác minh không phải Host/Guest của phòng bị từ chối đọc /coop_rooms/{roomCode}/private/signaling kể cả khi phòng đang WAITING',
      'firestore.rules: match /coop_rooms/{roomCode}/private/{docId} allow get: if isRoomHost() || isJoinedRoomGuest()',
      async () => {
        await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
          const bypassDb = adminCtx.firestore();
          await setDoc(doc(bypassDb, 'coop_rooms', 'BT5530'), baseWaitingLobby('BT5530'));
          await setDoc(doc(bypassDb, 'coop_rooms', 'BT5530', 'private', 'signaling'), baseSignaling('BT5530'));
        });
        await getDoc(doc(thirdDb, 'coop_rooms', 'BT5530', 'private', 'signaling'));
      }
    );

    // 6.1.16 (Mục 5.1): Bảo vệ Stage 1 trong /system_config/stages_catalog
    const officialStage1MapRows = {
      r0: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      r1: [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
      r2: [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
      r3: [0, 1, 1, 0, 1, 1, 2, 1, 1, 0, 1, 1, 0],
      r4: [0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
      r5: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      r6: [0, 1, 1, 0, 2, 0, 0, 0, 2, 0, 1, 1, 0],
      r7: [0, 1, 1, 0, 2, 1, 1, 1, 2, 0, 1, 1, 0],
      r8: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      r9: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1],
      r10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      r11: [0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0],
      r12: [0, 1, 1, 0, 1, 1, 9, 1, 1, 0, 1, 1, 0],
    };

    await checkRule(
      'R21_16A_ALLOW_ADMIN_WRITE_VALID_STAGE1_CATALOG',
      21,
      'ALLOW',
      'M7.3.11.5 (5.1 & 6.1.16): ADMIN ghi /system_config/stages_catalog với stage1Map chuẩn 13x13 (1 BASE tại r12[6] và gạch bảo vệ Eagle)',
      'firestore.rules: isValidSystemStagesCatalogConfig & isValidOfficialStage1Map',
      () =>
        setDoc(doc(superAdminDb, 'system_config', 'stages_catalog'), {
          version: 1,
          updatedAtMs: Date.now(),
          updatedBy: 'linhnk2013@gmail.com',
          stages: [],
          stage1Map: officialStage1MapRows,
        })
    );

    await checkRule(
      'R21_16B_DENY_ADMIN_WRITE_CORRUPTED_STAGE1_CATALOG',
      21,
      'DENY',
      'M7.3.11.5 (5.1 & 6.1.16): Chặn ghi /system_config/stages_catalog nếu stage1Map làm mất gạch bảo vệ Eagle hoặc sai vị trí BASE',
      'firestore.rules: isValidOfficialStage1Map requires r12[5]==1 && r12[6]==9 && r12[7]==1',
      () =>
        setDoc(doc(superAdminDb, 'system_config', 'stages_catalog'), {
          version: 2,
          updatedAtMs: Date.now(),
          updatedBy: 'linhnk2013@gmail.com',
          stages: [],
          stage1Map: {
            ...officialStage1MapRows,
            r12: [0, 1, 1, 0, 1, 0, 9, 0, 1, 0, 1, 1, 0],
          },
        })
    );

    // 6.1.17 (Mục 5.4): Session Lease Fail-Closed khi isActive == true nhưng lastActiveAt bị thiếu hoặc sai kiểu
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'user_sessions', 'uid_host_1'), {
        uid: 'uid_host_1',
        sessionId: 'sess_corrupted_lease_token_123',
        deviceId: device1,
        isActive: true,
        userAgentSummary: 'Chrome Corrupted Lease',
        loginAt: Timestamp.now(),
        lastActiveAt: null,
      });
    });

    await checkRule(
      'R21_17A_DENY_SECOND_DEVICE_HIJACK_WHEN_LAST_ACTIVE_AT_NULL',
      21,
      'DENY',
      'M7.3.11.5 (5.4 & 6.1.17): Fail-Closed – Thiết bị thứ 2 bị từ chối chiếm quyền khi phiên đang isActive == true nhưng lastActiveAt bị null/hỏng',
      'firestore.rules: isExistingSessionConfirmedExpiredOrInactive()',
      () =>
        updateDoc(doc(hostDb, 'user_sessions', 'uid_host_1'), {
          sessionId: 'sess_hijack_attempt_device2_999',
          deviceId: device2,
          isActive: true,
          userAgentSummary: 'Intruder Device 2',
          loginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        })
    );

    await checkRule(
      'R21_17B_ALLOW_SAME_DEVICE_RECOVER_OWN_CORRUPTED_LEASE',
      21,
      'ALLOW',
      'M7.3.11.5 (5.4): Cùng thiết bị (device1) được phép khôi phục lại phiên của chính mình khi lastActiveAt bị null/hỏng',
      'firestore.rules: isNewSessionAcquisitionAction -> incoming().deviceId == existing().deviceId',
      () =>
        updateDoc(doc(hostDb, 'user_sessions', 'uid_host_1'), {
          sessionId: 'sess_recovered_same_device1_888',
          deviceId: device1,
          isActive: true,
          userAgentSummary: 'Chrome Recovered',
          loginAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        })
    );

    // =========================================================================
    // Nhóm 23: Kiểm thử M7.3.11.6 (Tài khoản /user_sessions Admin read, /sound_catalog Firestore & Storage, /system_config/audio Storage path & /system_config/action_sfx)
    // =========================================================================
    await checkRule(
      'R23_01_ALLOW_ADMIN_READ_ANY_USER_SESSION',
      23,
      'ALLOW',
      'M7.3.11.6 (Mục 2): ADMIN (linhnk2013@gmail.com) được phép đọc /user_sessions/{uid} để hiển thị trạng thái phiên trên mục Tài khoản',
      'firestore.rules: match /user_sessions/{uid} allow get: if isValidId(uid) && (isOwner(uid) || isAdmin())',
      () => getDoc(doc(superAdminDb, 'user_sessions', 'uid_host_1'))
    );

    await checkRule(
      'R23_02_DENY_OTHER_PLAYER_READ_USER_SESSION',
      23,
      'DENY',
      'M7.3.11.6 (Mục 2): Người chơi khác (uid_third_3) bị chặn đọc /user_sessions/uid_host_1',
      'firestore.rules: match /user_sessions/{uid} allow get: if isOwner(uid) || isAdmin()',
      () => getDoc(doc(thirdDb, 'user_sessions', 'uid_host_1'))
    );

    const validSoundCatalogDoc = {
      soundId: 'bgm_boss_01',
      name: 'Boss Stage 8-Bit Theme',
      fileName: 'boss_stage_8bit.mp3',
      storagePath: 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3',
      contentType: 'audio/mpeg',
      fileSize: 120_000,
      durationSec: 96,
      version: 1,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: 'linhnk2013@gmail.com',
    };

    await checkRule(
      'R23_03_ALLOW_ADMIN_CREATE_SOUND_CATALOG',
      23,
      'ALLOW',
      'M7.3.11.6 (Mục 6): ADMIN (linhnk2013@gmail.com) tạo bản ghi âm thanh hợp lệ trong /sound_catalog/bgm_boss_01',
      'firestore.rules: match /sound_catalog/{soundId} allow create: if isAdmin() && isValidSoundCatalogDoc(incoming(), soundId)',
      () => setDoc(doc(superAdminDb, 'sound_catalog', 'bgm_boss_01'), validSoundCatalogDoc)
    );

    await checkRule(
      'R23_04_ALLOW_PLAYER_AND_MOD_READ_SOUND_CATALOG',
      23,
      'ALLOW',
      'M7.3.11.6 (Mục 6): Người chơi (PLAYER) và Điều hành viên (MOD) đọc được /sound_catalog để đồng bộ âm thanh',
      'firestore.rules: match /sound_catalog/{soundId} allow get, list: if isVerifiedPersonalGmail()',
      async () => {
        await getDoc(doc(hostDb, 'sound_catalog', 'bgm_boss_01'));
        await getDoc(doc(modStaffDb, 'sound_catalog', 'bgm_boss_01'));
      }
    );

    await checkRule(
      'R23_05_DENY_MOD_AND_PLAYER_WRITE_SOUND_CATALOG',
      23,
      'DENY',
      'M7.3.11.6 (Mục 6): MOD và PLAYER bị chặn ghi/sửa /sound_catalog/{soundId}',
      'firestore.rules: match /sound_catalog/{soundId} allow create, update, delete: if isAdmin()',
      () =>
        setDoc(doc(modStaffDb, 'sound_catalog', 'bgm_mod_hack'), {
          ...validSoundCatalogDoc,
          soundId: 'bgm_mod_hack',
          storagePath: 'sound_catalog/bgm_mod_hack/v1/boss_stage_8bit.mp3',
        })
    );

    await checkRule(
      'R23_06_ALLOW_ADMIN_ACTIVATE_STORAGE_AUDIO_IN_SYSTEM_CONFIG',
      23,
      'ALLOW',
      'M7.3.11.6 (Mục 6): ADMIN kích hoạt nhạc nền từ /sound_catalog lên /system_config/audio để đồng bộ thời gian thực sang mọi người chơi',
      'firestore.rules: isValidSystemAudioConfig supports sound_catalog/{soundId}/v{version}/{fileName}',
      () =>
        setDoc(doc(superAdminDb, 'system_config', 'audio'), {
          assetPath: 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3',
          storagePath: 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3',
          soundId: 'bgm_boss_01',
          fileName: 'boss_stage_8bit.mp3',
          contentType: 'audio/mpeg',
          fileSize: 120_000,
          updatedAt: Date.now(),
          updatedBy: 'linhnk2013@gmail.com',
          version: 2,
          isEnabled: true,
          displayName: 'Boss Stage 8-Bit Theme',
          durationSec: 96,
          trimStartSec: 0,
          trimEndSec: 96,
          loopGapMs: 0,
          fadeOutMs: 800,
        })
    );

    await checkRule(
      'R23_07_ALLOW_ADMIN_WRITE_ACTION_SFX_CONFIG',
      23,
      'ALLOW',
      'M7.3.11.6 (Mục 6): ADMIN cập nhật hiệu ứng âm thanh hành động /system_config/action_sfx và người chơi đọc được',
      'firestore.rules: match /system_config/{docId} docId == "action_sfx"',
      async () => {
        await setDoc(doc(superAdminDb, 'system_config', 'action_sfx'), {
          version: 1,
          updatedAt: Date.now(),
          updatedBy: 'linhnk2013@gmail.com',
          tracks: {},
        });
        await getDoc(doc(hostDb, 'system_config', 'action_sfx'));
      }
    );

    await checkRule(
      'R23_08_DENY_MOD_WRITE_ACTION_SFX_CONFIG',
      23,
      'DENY',
      'M7.3.11.6 (Mục 6): MOD bị chặn ghi /system_config/action_sfx',
      'firestore.rules: match /system_config/{docId} allow write: if isAdmin()',
      () =>
        setDoc(doc(modStaffDb, 'system_config', 'action_sfx'), {
          version: 2,
          updatedAt: Date.now(),
          updatedBy: 'linhnk2013@gmail.com',
          tracks: {},
        })
    );

    if (storageReachable) {
      const superAdminStorage = superAdminCtx.storage();
      const playerStorage = hostCtx.storage();
      const modStorage = testEnv
        .authenticatedContext('uid_mod_staff_21', {
          email: 'mod21@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        })
        .storage();
      const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]);

      await checkRule(
        'R23_09_ALLOW_ADMIN_STORAGE_UPLOAD_SOUND_CATALOG',
        23,
        'ALLOW',
        'M7.3.11.6 (Mục 6): ADMIN (linhnk2013@gmail.com) upload file âm thanh MP3 hợp lệ vào /sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3',
        'storage.rules: match /sound_catalog/{soundId}/{versionSegment}/{fileName} allow create: if isValidSoundCatalogCreate',
        () =>
          uploadBytes(
            storageRef(superAdminStorage, 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3'),
            audioBytes,
            { contentType: 'audio/mpeg' }
          )
      );

      await checkRule(
        'R23_10_ALLOW_PLAYER_AND_MOD_STORAGE_GET_SOUND_CATALOG',
        23,
        'ALLOW',
        'M7.3.11.6 (Mục 6): Người chơi (PLAYER) và Điều hành viên (MOD) tải được file âm thanh từ /sound_catalog để phát trong game',
        'storage.rules: match /sound_catalog allow get: if isVerifiedPersonalGmail()',
        async () => {
          await getBytes(storageRef(playerStorage, 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3'));
          await getBytes(storageRef(modStorage, 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3'));
        }
      );

      await checkRule(
        'R23_11_DENY_MOD_AND_PLAYER_STORAGE_UPLOAD_SOUND_CATALOG',
        23,
        'DENY',
        'M7.3.11.6 (Mục 6): MOD và PLAYER bị từ chối upload file vào /sound_catalog',
        'storage.rules: match /sound_catalog allow create -> isAdmin()',
        () =>
          uploadBytes(
            storageRef(modStorage, 'sound_catalog/bgm_hack/v1/hack.mp3'),
            audioBytes,
            { contentType: 'audio/mpeg' }
          )
      );

      await checkRule(
        'R23_12_DENY_LIST_SOUND_CATALOG_STORAGE',
        23,
        'DENY',
        'M7.3.11.6 (Mục 6): Chặn liệt kê hàng loạt listAll trên /sound_catalog',
        'storage.rules: match /sound_catalog allow list: if false',
        () => listAll(storageRef(playerStorage, 'sound_catalog/bgm_boss_01/v1'))
      );

      await checkRule(
        'R23_13_ALLOW_ADMIN_STORAGE_DELETE_SOUND_CATALOG',
        23,
        'ALLOW',
        'M7.3.11.6 (Mục 6): ADMIN xóa được file âm thanh trong /sound_catalog',
        'storage.rules: match /sound_catalog allow delete: if isValidSoundCatalogDelete',
        () => deleteObject(storageRef(superAdminStorage, 'sound_catalog/bgm_boss_01/v1/boss_stage_8bit.mp3'))
      );
    }
  } finally {
    await testEnv.cleanup();
  }

  const allowTests = records.filter((r) => r.kind === 'ALLOW');
  const denyTests = records.filter((r) => r.kind === 'DENY');
  const allowPassed = allowTests.filter((r) => r.passed).length;
  const denyPassed = denyTests.filter((r) => r.passed).length;
  const totalFailed = records.filter((r) => !r.passed).length;

  console.log('===================================================================');
  console.log(`Rules ALLOW tests : ${allowPassed}/${allowTests.length} PASS`);
  console.log(`Rules DENY tests  : ${denyPassed}/${denyTests.length} PASS`);
  console.log(`TOTAL RULES TESTS : ${records.length - totalFailed}/${records.length} PASS (${totalFailed} FAILED)`);
  console.log('===================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
