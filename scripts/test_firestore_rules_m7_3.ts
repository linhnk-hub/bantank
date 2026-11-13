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
        setDoc(doc(unverifiedDb, 'coop_rooms', 'RM0001'), {
          ...baseWaitingLobby('RM0001'),
          hostUid: 'uid_unverified_4',
        })
    );

    await checkRule(
      'R01_DENY_SIGNALING_WITHOUT_PARENT_ROOM',
      1,
      'DENY',
      'Không được tạo private/signaling khi phòng cha chưa tồn tại',
      'firestore.rules: match /private/{docId} allow create (parentRoomExists())',
      () => setDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), baseSignaling('RM0001'))
    );

    await checkRule(
      'R01_ALLOW_HOST_CREATE_WAITING_ROOM',
      1,
      'ALLOW',
      'Host Gmail cá nhân đã xác minh tạo phòng WAITING hợp lệ',
      'firestore.rules: match /coop_rooms/{roomCode} allow create',
      () => setDoc(doc(hostDb, 'coop_rooms', 'RM0001'), baseWaitingLobby('RM0001'))
    );

    await checkRule(
      'R01_DENY_THIRD_PARTY_CREATE_SIGNALING',
      1,
      'DENY',
      'Người thứ ba không được tạo private/signaling trong phòng của Host',
      'firestore.rules: match /private/{docId} allow create (parentRoom().hostUid == request.auth.uid)',
      () =>
        setDoc(doc(thirdDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
          ...baseSignaling('RM0001'),
          hostUid: 'uid_third_3',
        })
    );

    await checkRule(
      'R01_ALLOW_HOST_CREATE_SIGNALING',
      1,
      'ALLOW',
      'Host của phòng cha tạo private/signaling khởi tạo hợp lệ',
      'firestore.rules: match /private/{docId} allow create',
      () => setDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), baseSignaling('RM0001'))
    );

    // =========================================================================
    // Nhóm 2 & 3: Guest tham gia phòng có signaling hợp lệ & chặn khi thiếu signaling
    // =========================================================================
    // Tạo phòng RM0002 nhưng KHÔNG tạo private/signaling
    await setDoc(doc(hostDb, 'coop_rooms', 'RM0002'), baseWaitingLobby('RM0002'));

    await checkRule(
      'R03_DENY_GUEST_JOIN_WITHOUT_SIGNALING',
      3,
      'DENY',
      'Guest không được tham gia phòng chờ khi thiếu tài liệu private/signaling',
      'firestore.rules: isCoopGuestJoinAction(roomCode) -> signalingDocExists(roomCode)',
      () =>
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0002'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(thirdDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        setDoc(doc(hostDb, 'coop_rooms', 'RM0099'), {
          ...baseWaitingLobby('RM0099'),
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
      () => getDoc(doc(thirdDb, 'coop_rooms', 'RM0001'))
    );

    await checkRule(
      'R16_DENY_THIRD_PARTY_READ_SIGNALING',
      16,
      'DENY',
      'Người thứ ba không được đọc tài liệu private/signaling',
      'firestore.rules: match /private/{docId} allow get',
      () => getDoc(doc(thirdDb, 'coop_rooms', 'RM0001', 'private', 'signaling'))
    );

    await checkRule(
      'R16_ALLOW_HOST_WRITE_OFFER_SIGNALING',
      16,
      'ALLOW',
      'Host cập nhật guestUid, rtcOffer và hostIceCandidates trong private/signaling',
      'firestore.rules: match /private/{docId} allow update (branch 1)',
      () =>
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
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
        updateDoc(doc(guestDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
          finalScore: -50,
          matchOutcome: 'VICTORY',
          updatedAt: Date.now(),
        })
    );

    // Tạo phòng RM0003 ở trạng thái PLAYING với signaling bị lệch guestUid / hostUid / roomCode để kiểm tra chặt hasValidRecordedMatchResult
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'coop_rooms', 'RM0003'), {
        ...baseWaitingLobby('RM0003'),
        status: 'PLAYING',
        hostReady: true,
        guestUid: 'uid_guest_2',
        guestDisplayName: 'Guest 2',
        guestReady: true,
        guestLastActiveAt: Date.now(),
        rtcConnectionState: 'CONNECTED',
      });
      await setDoc(doc(bypassDb, 'coop_rooms', 'RM0003', 'private', 'signaling'), {
        ...baseSignaling('RM0003'),
        roomCode: 'WRONG9', // Sai roomCode
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0003'), {
          status: 'FINISHED',
          hostLastActiveAt: Date.now(),
        })
    );

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const bypassDb = adminCtx.firestore();
      await setDoc(doc(bypassDb, 'coop_rooms', 'RM0003', 'private', 'signaling'), {
        ...baseSignaling('RM0003'),
        roomCode: 'RM0003',
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0003'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001', 'private', 'signaling'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
        updateDoc(doc(hostDb, 'coop_rooms', 'RM0001'), {
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
      'Admin duy nhất (linhnk2013@gmail.com) có quyền ghi /admins/{uid} để cấp quyền MOD',
      'firestore.rules: match /admins/{uid} allow create, update, delete: if isAdmin()',
      () =>
        setDoc(doc(superAdminDb, 'admins', 'uid_host_1'), {
          uid: 'uid_host_1',
          email: 'host1@gmail.com',
          role: 'MOD',
          isActive: true,
          grantedBy: 'linhnk2013@gmail.com',
          grantedAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
    );

    await checkRule(
      'R17_DENY_NON_SUPER_ADMIN_WRITE_ADMINS',
      17,
      'DENY',
      'Người dùng thường không có quyền ghi /admins/{uid}',
      'firestore.rules: match /admins/{uid} allow create, update, delete: if isSuperAdmin()',
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
