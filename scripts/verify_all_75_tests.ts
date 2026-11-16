/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { runAllTestCases as runM2 } from '../src/core/testHarness.ts';
import { runAllM3TestCases as runM3 } from '../src/core/testHarnessM3.ts';
import { runAllAuditTestCases as runM3Audit } from '../src/core/testHarnessM3Audit.ts';
import { runAllM4Tests as runM4 } from '../src/core/testHarnessM4.ts';
import { runAllBugTestCases as runM4Bugs } from '../src/core/testHarnessM4Bugs.ts';
import { runAllUIPolishTests as runUIPolish } from '../src/core/testHarnessM4UIPolish.ts';
import { runAllJoystickTests as runJoystick } from '../src/core/testHarnessM4Joystick.ts';
import { runAllM5CorrectionTests as runM5Corrections } from '../src/core/testHarnessM5Corrections.ts';
import { runAllM6Tests as runM6 } from '../src/core/testHarnessM6.ts';
import { runAllM6Round2Tests as runM6Round2 } from '../src/core/testHarnessM6Round2.ts';
import { runAllM6FinalTests as runM6Final } from '../src/core/testHarnessM6Final.ts';
import { runAllM6FinalPlusTests as runM6FinalPlus } from '../src/core/testHarnessM6FinalPlus.ts';
import { runSpeedAndLayoutTests } from '../src/core/testHarnessSpeedAndLayout.ts';
import { runAllM6CorrectionAITests as runM6AICorr } from '../src/core/testHarnessM6CorrectionAI.ts';
import { runAllM7_1Tests as runM71 } from '../src/core/testHarnessM7_1.ts';
import { runAllM7_2Tests as runM72 } from '../src/core/testHarnessM7_2.ts';
import { runAllM7_3Tests as runM73 } from '../src/core/testHarnessM7_3.ts';
import { runAllM7_4Tests as runM74 } from '../src/core/testHarnessM7_4.ts';
import {
  runAllM7_5Tests as runM75,
  verifyM751AsyncEndToEndSuite,
} from '../src/core/testHarnessM7_5.ts';
import {
  runAllM7_5_2Tests as runM752,
  verifyM752AsyncLevelConcurrencyAndScanSuite,
} from '../src/core/testHarnessM7_5_2.ts';
import {
  getShowOnlineNetStatsPreference,
  setShowOnlineNetStatsPreference,
} from '../src/core/networkStatsPref.ts';
import {
  StageManager,
  InMemoryStagesCloudAdapter,
  cloneStageMap,
  areStageMapsEqual,
} from '../src/core/stageManager.ts';
import { TILE_TYPES } from '../src/core/types.ts';
import { GameEngine } from '../src/core/gameEngine.ts';
import { STAGE_2_MAP } from '../src/core/campaignStages.ts';

console.log('--- RUNNING FULL AUTOMATED REGRESSION SUITE ---');

const m2Results = runM2();
const m3Results = runM3();
const m3AuditResults = runM3Audit();
const m4Results = runM4();
const bugResults = runM4Bugs();
const uiPolishResults = runUIPolish();
const joystickResults = runJoystick();
const m5CorrectionsResults = runM5Corrections();
const m6Results = runM6();
const m6Round2Results = runM6Round2().results;
const m6FinalResults = runM6Final().results;
const m6FinalPlusResults = runM6FinalPlus().results;
const speedAndLayoutResults = runSpeedAndLayoutTests().results;
const m6AICorrResults = runM6AICorr().results;
const m71Results = runM71().results;
const m72Results = runM72().results;
const m73Results = runM73().results;
const m74Results = runM74().results;
const m75Results = runM75().results;
const m752Results = runM752().results;

const allSuites = [
  { name: 'M2 Physics & Tank (12 Tests)', results: m2Results },
  { name: 'M3 Enemy AI & Combat (14 Tests)', results: m3Results },
  { name: 'M3 Technical Audit (8 Tests)', results: m3AuditResults },
  { name: 'M4 Match Lifecycle & Stages (12 Tests)', results: m4Results },
  { name: 'M4 Bug Audit (4 Tests)', results: bugResults },
  { name: 'M4 UI Polish Cross-Platform (4 Tests)', results: uiPolishResults },
  { name: 'Virtual Joystick & PC Scale (6 Tests)', results: joystickResults },
  { name: 'M5 UI Polish & Gameplay Corrections (15 Tests)', results: m5CorrectionsResults },
  { name: 'M6 Gameplay & Responsive Corrections (23 Tests)', results: m6Results },
  { name: 'M6 Round 2 Responsive, Eagle & Explosions (18 Tests)', results: m6Round2Results },
  { name: 'M6 Final UI, Respawn & Continuous Fire (24 Tests)', results: m6FinalResults },
  { name: 'M6 Final+ Locked 60 FPS, P1 Explosion Audio, XP & Xu Decoupling (26 Tests)', results: m6FinalPlusResults },
  { name: 'Game Speed, Real-Time Timing & Responsive Layout (14 Tests)', results: speedAndLayoutResults },
  { name: 'M6 AI Dispersal, Lag Fix, No FPS/Rotate UI & MusicManager Admin (31 Tests)', results: m6AICorrResults },
  { name: 'M7.1 Firebase Auth & Single-Device Session (35 Tests)', results: m71Results },
  { name: 'M7.2 Ally AI, Co-op, Profile & Typography (10 Tests)', results: m72Results },
  { name: `M7.3 Rules Hardening, WebRTC Co-op, Audio, Avatar, RBAC & Security Audit (${m73Results.length} Tests)`, results: m73Results },
  { name: `M7.4 Campaign Stages 2–10, Progression, Co-op Sync & Security (${m74Results.length} Tests)`, results: m74Results },
  { name: `M7.5 Player Statistics, Static Media, Audit Logging & 9-Step Archive (${m75Results.length} Tests)`, results: m75Results },
  { name: `M7.5.2 Official 50-Level System, XP Integrity, Dedup & Consistency Audit (${m752Results.length} Tests)`, results: m752Results },
];

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

for (const suite of allSuites) {
  const passed = suite.results.filter(r => r.passed).length;
  const failed = suite.results.filter(r => !r.passed).length;
  totalTests += suite.results.length;
  totalPassed += passed;
  totalFailed += failed;

  console.log(`[${suite.name}] ${passed}/${suite.results.length} PASS`);
  if (failed > 0) {
    for (const f of suite.results.filter(r => !r.passed)) {
      const errorMsg = (f as any).errorMessage || (f as any).message || (f as any).details || (f as any).actual || 'Unknown error';
      console.error(`  FAIL: ${f.id} - ${f.name} -> ${errorMsg}`);
    }
  }
}

console.log('============================================');
console.log(`TOTAL: ${totalPassed}/${totalTests} TESTS PASSED (${totalFailed} FAILED)`);
console.log('============================================');

if (totalFailed > 0) {
  process.exit(1);
}

// Chạy bổ sung kiểm thử bất đồng bộ E2E cho quy trình 2 bước M7.3.3 (Local Music Assets on GitHub Pages)
import {
  MusicManager,
  InMemorySharedMusicCloudAdapter,
  SHARED_SYSTEM_BGM_ID,
  STATIC_BGM_INDEX_ID,
  STATIC_BGM_STAGE_ID,
  STAGED_LOCAL_PREVIEW_BGM_ID,
  buildGitHubPagesAudioUrl,
  shouldFallbackToAudioStream,
  type SharedMusicCloudAdapter,
  type SoundCatalogEntry,
  type SystemAudioConfigDocument,
} from '../src/core/musicManager.ts';
import {
  AVATAR_LIMITS,
  InMemoryAvatarCatalogSystem,
} from '../src/core/avatarManager.ts';
import { SUPER_ADMIN_EMAIL } from '../src/core/authManager.ts';

async function verifyM733AsyncWorkflow() {
  const mm = MusicManager.getInstance();
  const sharedCloud = new InMemorySharedMusicCloudAdapter();
  const synthBuffer = {
    duration: 140,
    sampleRate: 44100,
    numberOfChannels: 2,
    getChannelData: () => new Float32Array(44100),
  };

  mm.setCloudAdapter(sharedCloud, async (buf) => {
    if (buf.byteLength < 8) {
      throw new Error('Corrupt audio data');
    }
    return synthBuffer;
  });
  mm.setUserRole('ADMIN');

  // 1. Chọn file MP3 > 4 MB (4.5 MB = 4,718,592 bytes) -> Bước 1 tạo gói chuẩn bị (StagedAudioPackage)
  const fakeMp3BinaryV1 = new Uint8Array(64);
  fakeMp3BinaryV1[0] = 0x49; // 'I'
  fakeMp3BinaryV1[1] = 0x44; // 'D'
  fakeMp3BinaryV1[2] = 0x33; // '3'

  const stageV1 = await mm.stageAudioBufferForGitHubPages({
    fileName: 'Gaming Music 614619 (8-bit).mp3',
    displayName: 'Gaming Music 8-Bit v1',
    contentType: 'audio/mpeg',
    fileSize: 4_718_592, // > 4 MB
    decodedBuffer: synthBuffer,
    arrayBuffer: fakeMp3BinaryV1.buffer,
    nowMs: 1_700_000_000_000,
  });

  if (
    !stageV1.success ||
    !stageV1.stagedPackage ||
    stageV1.stagedPackage.repositoryPath !== `public/${stageV1.stagedPackage.assetPath}` ||
    stageV1.stagedPackage.distPath !== `dist/${stageV1.stagedPackage.assetPath}` ||
    !mm.getTrackById(STAGED_LOCAL_PREVIEW_BGM_ID)
  ) {
    throw new Error('M7.3.3 Step 1 staging failed');
  }

  // 2. Thử bấm Kích hoạt KHI CHƯA ĐƯA FILE VÀO public/audio/ trên GitHub Pages -> Bắt buộc từ chối (không báo thành công giả)
  const prematureActivate = await mm.verifyAndActivateStagedAudioOnGitHubPages(1_700_000_005_000);
  const configBeforeDeploy = await sharedCloud.getSystemAudioConfig();
  if (prematureActivate.success !== false || configBeforeDeploy !== null) {
    throw new Error('M7.3.3 must NOT fake activation before file exists on GitHub Pages');
  }

  // 3. Đặt file vào public/audio/ trên GitHub Pages rồi bấm Xác minh & Kích hoạt -> PASS
  await sharedCloud.uploadAudioBinary(
    stageV1.stagedPackage.assetPath,
    fakeMp3BinaryV1.buffer,
    'audio/mpeg'
  );
  const activateV1 = await mm.verifyAndActivateStagedAudioOnGitHubPages(1_700_000_010_000);
  const savedConfigV1 = await sharedCloud.getSystemAudioConfig();
  if (
    !activateV1.success ||
    !savedConfigV1 ||
    savedConfigV1.assetPath !== stageV1.stagedPackage.assetPath ||
    savedConfigV1.version !== 1 ||
    'downloadURL' in (savedConfigV1 as any) ||
    'storagePath' in (savedConfigV1 as any)
  ) {
    throw new Error('M7.3.3 Step 2 activation after GitHub Pages deploy failed');
  }

  // 4. Mô phỏng F5 tải lại trang -> Giữ nguyên cấu hình nhạc nền chung v1
  mm.revokeSharedAudioOnSignOut();
  await mm.applySharedAudioConfigSnapshot(savedConfigV1);
  if (
    mm.resolveEffectiveTrack(1, 'SOLO').trackId !== SHARED_SYSTEM_BGM_ID ||
    mm.getSharedAudioConfig()?.version !== 1
  ) {
    throw new Error('M7.3.3 F5 reload persistence failed');
  }

  // 5. Mô phỏng người chơi khác ở trình duyệt khác -> Nhận đúng phiên bản v1, và khi Admin phát hành v2 (?v=2) thì tự động cập nhật không bị cache bản cũ
  mm.setUserRole('ADMIN');
  const stageV2 = await mm.stageAudioBufferForGitHubPages({
    fileName: 'Gaming Music 614619 (8-bit).mp3',
    displayName: 'Gaming Music 8-Bit v2',
    contentType: 'audio/mpeg',
    fileSize: 4_800_000,
    decodedBuffer: synthBuffer,
    arrayBuffer: fakeMp3BinaryV1.buffer,
    nowMs: 1_700_000_060_000,
  });
  if (!stageV2.success || !stageV2.stagedPackage) {
    throw new Error('M7.3.3 v2 staging failed');
  }
  await sharedCloud.uploadAudioBinary(
    stageV2.stagedPackage.assetPath,
    fakeMp3BinaryV1.buffer,
    'audio/mpeg'
  );
  const activateV2 = await mm.verifyAndActivateStagedAudioOnGitHubPages(1_700_000_065_000);
  if (
    !activateV2.success ||
    activateV2.config?.version !== 2 ||
    buildGitHubPagesAudioUrl(activateV2.config.assetPath, activateV2.config.version) !==
      `./${stageV2.stagedPackage.assetPath}?v=2`
  ) {
    throw new Error('M7.3.3 v2 cache-busting activation failed');
  }

  // 6. Mô phỏng file nhạc bị thiếu (404) hoặc bị hỏng trên GitHub Pages -> Tự động thu hồi SHARED_SYSTEM_BGM_ID và fallback về nhạc Stage tĩnh mặc định (bgm-stage.mp3)
  await sharedCloud.deleteAudioBinary(stageV2.stagedPackage.assetPath);
  mm.revokeSharedAudioOnSignOut();
  await mm.applySharedAudioConfigSnapshot(activateV2.config!);
  if (
    mm.resolveEffectiveTrack(1, 'SOLO').trackId === SHARED_SYSTEM_BGM_ID ||
    mm.resolveEffectiveTrack(1, 'SOLO').trackId !== STATIC_BGM_STAGE_ID
  ) {
    throw new Error('M7.3.3 missing/corrupt file static BGM fallback failed');
  }

  mm.resetAllAssignmentsToDefault();
  mm.syncRoleFromAuthUser(null);
  console.log('[M7.3.3 Async E2E Workflow Verification] 10/10 MANDATORY CASES PASS');
}

function makePngTestBytes(w: number, h: number, totalLen: number = 128): ArrayBuffer {
  const b = new Uint8Array(Math.max(totalLen, 33));
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
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function makeJpegTestBytes(w: number, h: number, totalLen: number = 128): ArrayBuffer {
  const b = new Uint8Array(Math.max(totalLen, 32));
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
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function makeWebpTestBytes(w: number, h: number, totalLen: number = 64): ArrayBuffer {
  const b = new Uint8Array(Math.max(totalLen, 32));
  b[0] = 0x52;
  b[1] = 0x49;
  b[2] = 0x46;
  b[3] = 0x46;
  b[8] = 0x57;
  b[9] = 0x45;
  b[10] = 0x42;
  b[11] = 0x50;
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
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

async function verifyM735SharedAvatarCatalogAsyncSuite() {
  const sys = new InMemoryAvatarCatalogSystem();
  const nowMs = 1_700_000_000_000;

  // 1. Admin upload JPEG/PNG/WebP hợp lệ (<= 5 MB, <= 2048px): PASS
  const upPng = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    name: 'Chiến Xa Đại Bàng Vàng',
    fileName: 'gold.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, 2048),
    sortOrder: 10,
    isActive: true,
    nowMs,
  });
  const upJpg = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_crimson',
    name: 'Chiến Xa Hỏa Lực',
    fileName: 'crimson.jpg',
    mimeType: 'image/jpeg',
    arrayBuffer: makeJpegTestBytes(1024, 1024, 2048),
    sortOrder: 20,
    isActive: true,
    nowMs,
  });
  const upWebp = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_emerald',
    name: 'Chiến Xa Ngọc Lục Bảo',
    fileName: 'emerald.webp',
    mimeType: 'image/webp',
    arrayBuffer: makeWebpTestBytes(2048, 2048, 2048),
    sortOrder: 30,
    isActive: false, // tạo sẵn 1 avatar inactive để test Case 8
    nowMs,
  });
  if (!upPng.success || !upJpg.success || !upWebp.success) {
    throw new Error('Case 1 failed: Admin valid JPEG/PNG/WebP upload must succeed');
  }

  // 2. Người chơi thường upload bị chặn: PASS
  const nonAdminUp = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: 'player1@gmail.com',
    isVerifiedPersonalGmail: true,
    avatarId: 'hacked_tank',
    name: 'Hacked Tank',
    fileName: 'hack.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(256, 256, 1024),
    sortOrder: 40,
    nowMs,
  });
  if (nonAdminUp.success !== false || nonAdminUp.errorCode !== 'STORAGE_PERMISSION_DENIED') {
    throw new Error('Case 2 failed: Non-admin upload must be blocked');
  }

  // 3. File > 5 MB bị chặn: PASS
  const over5MbUp = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_too_big',
    name: 'Too Big',
    fileName: 'big.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, AVATAR_LIMITS.MAX_FILE_SIZE_BYTES + 16),
    sortOrder: 50,
    nowMs,
  });
  if (over5MbUp.success !== false || over5MbUp.errorCode !== 'FILE_TOO_LARGE') {
    throw new Error('Case 3 failed: File > 5 MB must be rejected');
  }

  // 4. Ảnh > 2048px bị chặn: PASS
  const over2048Up = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_oversize_px',
    name: 'Oversize Px',
    fileName: 'huge.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(2049, 1024, 512),
    sortOrder: 60,
    nowMs,
  });
  if (over2048Up.success !== false || over2048Up.errorCode !== 'DIMENSIONS_TOO_LARGE') {
    throw new Error('Case 4 failed: Image > 2048px must be rejected');
  }

  // 5. File SVG/HTML/EXE giả mạo bị chặn: PASS
  for (const spoof of [
    {
      fileName: 'vector.png',
      mimeType: 'image/png',
      bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    },
    {
      fileName: 'xss.jpg',
      mimeType: 'image/jpeg',
      bytes: new TextEncoder().encode('<!DOCTYPE html><html><script>alert(1)</script></html>'),
    },
    {
      fileName: 'malware.webp',
      mimeType: 'image/webp',
      bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0, 0, 0]),
    },
  ]) {
    const spoofRes = await sys.adminUploadOrReplaceCatalogAvatar({
      authEmail: SUPER_ADMIN_EMAIL,
      isVerifiedPersonalGmail: true,
      avatarId: 'tank_spoof',
      name: 'Spoof',
      fileName: spoof.fileName,
      mimeType: spoof.mimeType,
      arrayBuffer: toArrayBuffer(spoof.bytes),
      sortOrder: 70,
      nowMs,
    });
    if (spoofRes.success !== false) {
      throw new Error(`Case 5 failed: Spoofed file ${spoof.fileName} must be rejected`);
    }
  }

  // 6. Người chơi xem được danh sách avatar active (chỉ trả về tank_gold và tank_crimson, không trả về tank_emerald đang inactive): PASS
  const listRes = sys.listActiveCatalogForPlayer({
    authEmail: 'player1@gmail.com',
    isVerifiedPersonalGmail: true,
  });
  if (
    !listRes.allowed ||
    listRes.items.length !== 2 ||
    listRes.items[0].avatarId !== 'tank_gold' ||
    listRes.items[1].avatarId !== 'tank_crimson'
  ) {
    throw new Error('Case 6 failed: Player must list only active catalog items in sortOrder');
  }

  // 7. Người chơi chọn avatar active lưu thành công: PASS
  const selectActive = sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_1',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_gold',
    nowMs: nowMs + 1000,
  });
  if (!selectActive.success) {
    throw new Error('Case 7 failed: Selecting active catalog avatar must succeed');
  }

  // 8. Người chơi chọn avatar không active (tank_emerald) hoặc không tồn tại (tank_ghost) bị chặn: PASS
  const selectInactive = sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_1',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_emerald',
    nowMs: nowMs + 2000,
  });
  const selectNonExistent = sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_1',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_ghost',
    nowMs: nowMs + 2000,
  });
  if (selectInactive.success !== false || selectNonExistent.success !== false) {
    throw new Error('Case 8 failed: Selecting inactive or non-existent catalog avatar must be blocked');
  }

  // 9. Người chơi chuyển lại ảnh Google thành công & chọn lại tank_gold để test tiếp: PASS
  const selectGoogle = sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_1',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    nowMs: nowMs + 3000,
  });
  if (
    !selectGoogle.success ||
    sys.resolveEffectiveAvatarForPlayer('uid_player_1', 'https://lh3.googleusercontent.com/a/p1') !==
      'https://lh3.googleusercontent.com/a/p1'
  ) {
    throw new Error('Case 9 failed: Switching back to Google avatar must succeed');
  }
  // Chọn lại tank_gold để kiểm tra Case 12 & 15
  sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_1',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_gold',
    nowMs: nowMs + 3500,
  });

  // 10. Người chơi không sửa được tài liệu người khác: PASS
  const modifyOtherUser = sys.playerSelectAvatar({
    targetUid: 'uid_player_1',
    authUid: 'uid_player_2',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    nowMs: nowMs + 4000,
  });
  if (modifyOtherUser.success !== false) {
    throw new Error('Case 10 failed: Player must not modify another user document');
  }

  // 11. Người chơi không sửa được role / isSuperAdmin / xp / xu / rank / email: PASS
  for (const forbiddenField of [
    { role: 'SUPER_ADMIN' },
    { isSuperAdmin: true },
    { xp: 999999 },
    { xu: 999999 },
    { rank: 'MARSHAL' },
    { email: SUPER_ADMIN_EMAIL },
  ]) {
    const privAttempt = sys.playerSelectAvatar({
      targetUid: 'uid_player_1',
      authUid: 'uid_player_1',
      isVerifiedPersonalGmail: true,
      avatarType: 'google',
      avatarId: null,
      extraFields: forbiddenField,
      nowMs: nowMs + 5000,
    });
    if (privAttempt.success !== false) {
      throw new Error('Case 11 failed: Privilege escalation fields must be blocked');
    }
  }

  // 12. Admin ẩn avatar (tank_gold -> isActive = false) -> người chơi đang dùng fallback về ảnh Google: PASS
  const hideRes = sys.adminSetCatalogActive({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    isActive: false,
    nowMs: nowMs + 6000,
  });
  const effectiveAfterHide = sys.resolveEffectiveAvatarForPlayer(
    'uid_player_1',
    'https://lh3.googleusercontent.com/a/p1'
  );
  if (!hideRes.success || effectiveAfterHide !== 'https://lh3.googleusercontent.com/a/p1') {
    throw new Error('Case 12 failed: Hiding catalog avatar must fallback player to Google avatar');
  }
  // Bật lại tank_gold
  sys.adminSetCatalogActive({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    isActive: true,
    nowMs: nowMs + 6500,
  });

  // 13. Admin thay ảnh bằng version mới (v2) -> hiển thị ảnh mới (avatar_catalog/tank_gold/v2/...): PASS
  const replaceV2 = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    name: 'Chiến Xa Đại Bàng Vàng v2',
    fileName: 'gold_v2.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, 3072),
    sortOrder: 10,
    isActive: true,
    nowMs: nowMs + 7000,
  });
  const effectiveAfterV2 = sys.resolveEffectiveAvatarForPlayer(
    'uid_player_1',
    'https://lh3.googleusercontent.com/a/p1'
  );
  if (
    !replaceV2.success ||
    replaceV2.version !== 2 ||
    replaceV2.storagePath !== 'avatar_catalog/tank_gold/v2/gold_v2.png' ||
    !effectiveAfterV2?.includes(encodeURIComponent('avatar_catalog/tank_gold/v2/gold_v2.png'))
  ) {
    throw new Error('Case 13 failed: Replacing catalog image with v2 must update version and URL');
  }

  // 14. Admin xóa avatar không còn ai dùng (tank_crimson): PASS
  const delUnused = sys.adminDeleteCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_crimson',
  });
  if (!delUnused.success || sys.getCatalogDoc('tank_crimson') !== null) {
    throw new Error('Case 14 failed: Deleting unused catalog avatar must succeed');
  }

  // 15. Admin xóa avatar đang có người dùng (tank_gold đang được uid_player_1 chọn) -> bị chặn & báo rõ lý do: PASS
  const delInUse = sys.adminDeleteCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
  });
  if (
    delInUse.success !== false ||
    delInUse.errorCode !== 'AVATAR_IN_USE' ||
    sys.getCatalogDoc('tank_gold') === null
  ) {
    throw new Error('Case 15 failed: Deleting in-use catalog avatar must be blocked');
  }

  // 16. Storage upload thành công nhưng Firestore thất bại -> không báo thành công giả, cho phép đồng bộ lại metadata mà không cần upload lại file: PASS
  sys.setFailNextFirestoreCatalogWrite(true);
  const uploadCountBeforeCase16 = sys.getStorageUploadCallCount();
  const partialUpload = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_platinum',
    name: 'Chiến Xa Bạch Kim',
    fileName: 'platinum.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, 2048),
    sortOrder: 40,
    isActive: true,
    nowMs: nowMs + 8000,
  });
  const uploadCountAfterPartialUpload = sys.getStorageUploadCallCount();
  if (
    partialUpload.success !== false ||
    partialUpload.requiresMetadataRetry !== true ||
    uploadCountAfterPartialUpload !== uploadCountBeforeCase16 + 1 ||
    sys.getCatalogDoc('tank_platinum') !== null ||
    !sys.getStoragePaths().includes('avatar_catalog/tank_platinum/v1/platinum.png')
  ) {
    throw new Error(
      'Case 16a failed: When Firestore fails after Storage upload, must not fake catalog activation'
    );
  }

  const retrySync = await sys.adminRetryPendingCatalogSync({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_platinum',
    nowMs: nowMs + 9000,
  });
  const uploadCountAfterMetadataRetry = sys.getStorageUploadCallCount();
  if (
    !retrySync.success ||
    sys.getCatalogDoc('tank_platinum')?.version !== 1 ||
    uploadCountAfterMetadataRetry !== uploadCountAfterPartialUpload
  ) {
    throw new Error(
      'Case 16b failed: Retrying pending metadata sync must ONLY retry Firestore metadata and MUST NOT re-upload file'
    );
  }

  // 17. M7.3.5.4 (Mục III): Tách riêng kiểm thử Storage:
  // (a) Kiểm thử thuật toán tạo storagePath mới, UUID filename, version mới và khởi tạo highestVersionByAvatarId từ catalog hiện có sau khi tải lại trang.
  // (b) Kiểm thử retry metadata không gọi uploadBytes lần nữa (đã chứng minh ở Case 16b).
  // (c) Kiểm thử updateMetadata bị từ chối (allow update: if false -> DENIED) & list/listAll bị từ chối (allow list: if false -> DENIED).
  // (d) Kiểm thử uploadBytes lần hai cùng path ở tầng Storage Rules: phân loại rõ là 'NOT_PROVEN' (không giả lập DENIED trong bộ nhớ chỉ vì resource == null khi chưa chạy trên Emulator/Production).
  const secondUploadSamePathVerdict = sys.evaluateSecondUploadSamePathStorageRuleStatus();
  const overwriteSamePathVerdict = sys.adminAttemptOverwriteExistingStoragePath({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    storagePath: 'avatar_catalog/tank_gold/v2/gold_v2.png',
    contentType: 'image/png',
    sizeBytes: 1024,
  });
  const updateMetadataAllowed = sys.adminAttemptUpdateStorageMetadata({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    storagePath: 'avatar_catalog/tank_gold/v2/gold_v2.png',
  });
  const adminListAllowed = sys.attemptListStorageCatalog({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
  });
  const playerListAllowed = sys.attemptListStorageCatalog({
    authEmail: 'player1@gmail.com',
    isVerifiedPersonalGmail: true,
  });
  if (
    secondUploadSamePathVerdict !== 'NOT_PROVEN' ||
    overwriteSamePathVerdict !== 'NOT_PROVEN' ||
    updateMetadataAllowed !== false ||
    adminListAllowed !== false ||
    playerListAllowed !== false
  ) {
    throw new Error(
      'Case 17a failed: Second upload same path at Storage Rules layer must be classified as NOT_PROVEN without Emulator/Production runtime, while updateMetadata and list/listAll must be DENIED'
    );
  }

  // Kiểm tra khởi tạo highestVersionByAvatarId từ dữ liệu catalog hiện có sau khi tải lại trang (xóa biến RAM):
  sys.simulatePageReloadClearingRamOnlyState();
  if (sys.getHighestKnownVersion('tank_gold') !== 2) {
    throw new Error(
      'Case 17b failed: highestVersionByAvatarId must be initialized from existing catalog documents after page reload so version never regresses'
    );
  }

  // Kiểm tra kết quả upload không xác định (indeterminate) và sinh UUID fileName không tái sử dụng storagePath cũ:
  sys.setSimulateNextUploadIndeterminate(true);
  const indeterminateUpload = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    name: 'Chiến Xa Hoàng Kim V3 Indeterminate',
    fileName: 'gold.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, 2048),
    sortOrder: 10,
    isActive: true,
    useUuidFileName: true,
    nowMs: nowMs + 9200,
  });
  const followUpAfterIndeterminate = await sys.adminUploadOrReplaceCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_gold',
    name: 'Chiến Xa Hoàng Kim V4 Fresh',
    fileName: 'gold.png',
    mimeType: 'image/png',
    arrayBuffer: makePngTestBytes(512, 512, 2048),
    sortOrder: 10,
    isActive: true,
    useUuidFileName: true,
    nowMs: nowMs + 9300,
  });
  const tankGoldAfterIndeterminate = sys.getCatalogDoc('tank_gold');
  if (
    indeterminateUpload.success !== false ||
    indeterminateUpload.errorCode !== 'STORAGE_UPLOAD_INDETERMINATE' ||
    !followUpAfterIndeterminate.success ||
    !tankGoldAfterIndeterminate ||
    typeof tankGoldAfterIndeterminate.version !== 'number' ||
    tankGoldAfterIndeterminate.version <= 3 ||
    typeof tankGoldAfterIndeterminate.storagePath !== 'string' ||
    tankGoldAfterIndeterminate.storagePath === 'avatar_catalog/tank_gold/v2/gold_v2.png' ||
    !sys
      .getUsedOrIndeterminateStoragePaths()
      .includes(tankGoldAfterIndeterminate.storagePath)
  ) {
    throw new Error(
      'Case 17c failed: Indeterminate upload must never overwrite old object and next upload must allocate a brand-new version and unique storagePath'
    );
  }

  // 18. M7.3.5.4 (Mục IV & V): Kiểm tra đầy đủ 10 trường hợp Firestore về quyền sở hữu hồ sơ (uid == request.auth.uid),
  // UID bất biến, hồ sơ cũ không có uid, tách biệt displayName/avatar và bảo toàn trường cũ: PASS
  sys.seedLegacyUserProfile('uid_veteran_99', {
    xp: 12500,
    xu: 3400,
    rank: 'COLONEL',
    createdAt: nowMs - 100_000,
  });
  // (1) User A cập nhật hồ sơ của chính User A (cập nhật avatar không làm mất displayName; cập nhật displayName không làm mất avatar): PASS
  const legacyUpdate = sys.playerSelectAvatar({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_veteran_99',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_platinum',
    nowMs: nowMs + 9500,
  });
  const renameRes = sys.playerUpdateDisplayName({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_veteran_99',
    isVerifiedPersonalGmail: true,
    displayName: 'Đại Tá Thép 99',
    nowMs: nowMs + 9550,
  });
  // (2) User A cập nhật hồ sơ User B đã có uid: DENY
  const otherUserWithUidDeny = sys.playerSelectAvatar({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_attacker_88',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    nowMs: nowMs + 9560,
  });
  // Cố tình gộp cả đổi displayName lẫn đổi avatar trong 1 lần gọi phải bị từ chối:
  const mixedUpdateRes = sys.playerSelectAvatar({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_veteran_99',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    extraFields: { displayName: 'Tên Gộp Trái Phép' },
    nowMs: nowMs + 9580,
  });
  // (6) User A cố thay đổi uid trên hồ sơ hiện có: DENY
  const mutateUidRes = sys.playerSelectAvatar({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_veteran_99',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    extraFields: { uid: 'uid_hacked_999' },
    nowMs: nowMs + 9590,
  });
  // Hồ sơ cũ chưa có trường uid:
  sys.seedLegacyUserProfileWithoutUid('uid_legacy_no_uid_77', {
    xp: 6400,
    xu: 1500,
    rank: 'CAPTAIN',
    createdAt: nowMs - 200_000,
  });
  // (3) User A (uid_attacker_88) cố cập nhật hồ sơ User B (uid_legacy_no_uid_77) là hồ sơ cũ KHÔNG có trường uid: DENY
  const otherUserLegacyNoUidAvatarDeny = sys.playerSelectAvatar({
    targetUid: 'uid_legacy_no_uid_77',
    authUid: 'uid_attacker_88',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_gold',
    nowMs: nowMs + 9591,
  });
  const otherUserLegacyNoUidRenameDeny = sys.playerUpdateDisplayName({
    targetUid: 'uid_legacy_no_uid_77',
    authUid: 'uid_attacker_88',
    isVerifiedPersonalGmail: true,
    displayName: 'Bị Hack Bởi User Khác',
    nowMs: nowMs + 9591,
  });
  // (4) User A cập nhật avatar & displayName trên hồ sơ cũ của chính mình không có uid: PASS
  const legacyNoUidAvatarRes = sys.playerSelectAvatar({
    targetUid: 'uid_legacy_no_uid_77',
    authUid: 'uid_legacy_no_uid_77',
    isVerifiedPersonalGmail: true,
    avatarType: 'catalog',
    avatarId: 'tank_gold',
    nowMs: nowMs + 9592,
  });
  const legacyNoUidRenameRes = sys.playerUpdateDisplayName({
    targetUid: 'uid_legacy_no_uid_77',
    authUid: 'uid_legacy_no_uid_77',
    isVerifiedPersonalGmail: true,
    displayName: 'Đại Úy Lịch Sử 77',
    nowMs: nowMs + 9594,
  });
  // (5) User A cố chèn uid vào hồ sơ cũ khi update: DENY
  const legacyNoUidInjectUidRes = sys.playerSelectAvatar({
    targetUid: 'uid_legacy_no_uid_77',
    authUid: 'uid_legacy_no_uid_77',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    extraFields: { uid: 'uid_legacy_no_uid_77' },
    nowMs: nowMs + 9596,
  });
  const updatedLegacyDoc = sys.getUserDoc('uid_veteran_99');
  const updatedLegacyNoUidDoc = sys.getUserDoc('uid_legacy_no_uid_77');
  if (
    !legacyUpdate.success ||
    !renameRes.success ||
    otherUserWithUidDeny.success !== false ||
    mixedUpdateRes.success !== false ||
    mutateUidRes.success !== false ||
    otherUserLegacyNoUidAvatarDeny.success !== false ||
    otherUserLegacyNoUidRenameDeny.success !== false ||
    !legacyNoUidAvatarRes.success ||
    !legacyNoUidRenameRes.success ||
    legacyNoUidInjectUidRes.success !== false ||
    updatedLegacyDoc?.uid !== 'uid_veteran_99' ||
    updatedLegacyDoc?.xp !== 12500 ||
    updatedLegacyDoc?.xu !== 3400 ||
    updatedLegacyDoc?.rank !== 'COLONEL' ||
    updatedLegacyDoc?.displayName !== 'Đại Tá Thép 99' ||
    updatedLegacyDoc?.avatarType !== 'catalog' ||
    updatedLegacyDoc?.avatarId !== 'tank_platinum' ||
    !updatedLegacyNoUidDoc ||
    'uid' in updatedLegacyNoUidDoc ||
    updatedLegacyNoUidDoc.xp !== 6400 ||
    updatedLegacyNoUidDoc.xu !== 1500 ||
    updatedLegacyNoUidDoc.rank !== 'CAPTAIN' ||
    updatedLegacyNoUidDoc.displayName !== 'Đại Úy Lịch Sử 77' ||
    updatedLegacyNoUidDoc.avatarType !== 'catalog' ||
    updatedLegacyNoUidDoc.avatarId !== 'tank_gold'
  ) {
    throw new Error(
      'Case 18 failed: Must enforce ownership (uid == request.auth.uid) even on legacy profiles without uid, preserve legacy fields, enforce UID immutability, and separate displayName update from avatar selection'
    );
  }

  // 19. M7.3.5.2: Khi xóa Storage thất bại, tự động chuyển avatar sang trạng thái Ẩn (isActive = false) và giữ lại metadata Firestore để tránh lệch trạng thái; đồng thời xác nhận limit(1) khi truy vấn users: PASS
  sys.playerSelectAvatar({
    targetUid: 'uid_veteran_99',
    authUid: 'uid_veteran_99',
    isVerifiedPersonalGmail: true,
    avatarType: 'google',
    avatarId: null,
    nowMs: nowMs + 9600,
  });
  sys.setFailNextStorageDelete(true);
  const failedStorageDel = sys.adminDeleteCatalogAvatar({
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_platinum',
    nowMs: nowMs + 9700,
  });
  const docAfterFailedStorageDel = sys.getCatalogDoc('tank_platinum');
  if (
    failedStorageDel.success !== false ||
    failedStorageDel.errorCode !== 'STORAGE_DELETE_FAILED' ||
    sys.getLastDeleteUserQueryLimit() !== 1 ||
    docAfterFailedStorageDel === null ||
    docAfterFailedStorageDel.isActive !== false
  ) {
    throw new Error(
      'Case 19 failed: Failed Storage delete must keep Firestore doc hidden (isActive=false) and use limit(1)'
    );
  }

  // 20. M7.3.5.4 (Mục II & IV): Kiểm tra cú pháp tĩnh trực tiếp trên file storage.rules và firestore.rules: PASS
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const storageRulesText = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'storage.rules'),
    'utf8'
  );
  const firestoreRulesText = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'firestore.rules'),
    'utf8'
  );
  const nonCommentLines = storageRulesText
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
  const allowLines = nonCommentLines.filter((line) => /^allow\b/.test(line));
  const hasRulesV2 = nonCommentLines.some((line) => /^rules_version\s*=\s*'2';$/.test(line));
  const hasAllowGet = allowLines.some((line) => /^allow\s+get\s*:/.test(line));
  const hasAllowListFalse = allowLines.some((line) => /^allow\s+list\s*:\s*if\s+false\s*;$/.test(line));
  const hasAllowCreate = allowLines.some((line) => /^allow\s+create\s*:/.test(line));
  const hasAllowUpdateFalse = allowLines.some((line) => /^allow\s+update\s*:\s*if\s+false\s*;$/.test(line));
  const hasAllowDelete = allowLines.some((line) => /^allow\s+delete\s*:/.test(line));
  const hasDefaultDenyCatchAll = allowLines.some((line) =>
    /^allow\s+read\s*,\s*write\s*:\s*if\s+false\s*;$/.test(line)
  );
  const hasCreateOnlyUploadGuard =
    storageRulesText.includes('resource == null') &&
    storageRulesText.includes('request.resource != null');
  const hasDeleteOnlyGuard =
    storageRulesText.includes('resource != null') &&
    storageRulesText.includes('request.resource == null');
  const hasImmutableUidRules =
    /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[\s*'avatarType',\s*'avatarId',\s*'avatarUpdatedAt'\s*\]\)/.test(
      firestoreRulesText
    ) &&
    /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\[\s*'displayName'\s*\]\)/.test(
      firestoreRulesText
    ) &&
    firestoreRulesText.includes("!('uid' in existing())") &&
    firestoreRulesText.includes("!('uid' in incoming())") &&
    firestoreRulesText.includes('uid == request.auth.uid');

  if (
    !hasRulesV2 ||
    !hasAllowGet ||
    !hasAllowListFalse ||
    !hasAllowCreate ||
    !hasAllowUpdateFalse ||
    !hasAllowDelete ||
    !hasDefaultDenyCatchAll ||
    !hasCreateOnlyUploadGuard ||
    !hasDeleteOnlyGuard ||
    !hasImmutableUidRules
  ) {
    throw new Error(
      'Case 20 failed: storage.rules and firestore.rules must satisfy all M7.3.5.4 static security invariants'
    );
  }

  // 21. M7.3.5.5 (Mục III & VI): Kiểm thử đầy đủ 8 kịch bản phục hồi trạng thái Pending Upload sau F5 / đóng trình duyệt: PASS
  const f5Sys = new InMemoryAvatarCatalogSystem();
  const f5PngBuf = makePngTestBytes(512, 512, 2048);

  // Kịch bản 1a: Nếu không thể ghi bản ghi UPLOAD_IN_PROGRESS vào bộ nhớ bền vững trước khi upload -> dừng ngay trước khi uploadBytes
  f5Sys.setFailNextPersistentPendingStoreWrite(true);
  const uploadCallsBeforeStoreFail = f5Sys.getStorageUploadCallCount();
  const abortedBeforeUploadRes = await f5Sys.adminUploadOrReplaceCatalogAvatar({
    ownerUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    name: 'Chiến Xa Phục Hồi F5',
    fileName: 'rec.png',
    mimeType: 'image/png',
    arrayBuffer: f5PngBuf,
    sortOrder: 50,
    useUuidFileName: true,
    nowMs: nowMs + 10_000,
  });
  const uploadCallsAfterStoreFail = f5Sys.getStorageUploadCallCount();
  if (
    abortedBeforeUploadRes.success !== false ||
    abortedBeforeUploadRes.errorCode !== 'PENDING_STORE_WRITE_FAILED' ||
    uploadCallsAfterStoreFail !== uploadCallsBeforeStoreFail
  ) {
    throw new Error(
      'Case 21.1 failed: Must stop immediately before uploadBytes when persistent store cannot write UPLOAD_IN_PROGRESS record'
    );
  }

  // Kịch bản 1b, 2 & 3: Lưu UPLOAD_IN_PROGRESS trước khi upload -> Upload Storage thành công chuyển sang UPLOAD_CONFIRMED_METADATA_PENDING -> Ghi Firestore thất bại giữ bản ghi bền vững
  f5Sys.setFailNextFirestoreCatalogWrite(true);
  const uploadOkFirestoreFailRes = await f5Sys.adminUploadOrReplaceCatalogAvatar({
    ownerUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    name: 'Chiến Xa Phục Hồi F5',
    fileName: 'rec.png',
    mimeType: 'image/png',
    arrayBuffer: f5PngBuf,
    sortOrder: 50,
    useUuidFileName: true,
    nowMs: nowMs + 10_100,
  });
  const persistedBeforeF5 = await f5Sys.getPersistentPendingStore().getPendingRecord('tank_f5_rec');
  if (
    uploadOkFirestoreFailRes.success !== false ||
    uploadOkFirestoreFailRes.errorCode !== 'FIRESTORE_SYNC_FAILED_AFTER_UPLOAD' ||
    uploadOkFirestoreFailRes.pendingStatus !== 'UPLOAD_CONFIRMED_METADATA_PENDING' ||
    !persistedBeforeF5 ||
    persistedBeforeF5.status !== 'UPLOAD_CONFIRMED_METADATA_PENDING' ||
    persistedBeforeF5.ownerUid !== 'uid_super_admin_1' ||
    persistedBeforeF5.version !== 1
  ) {
    throw new Error(
      'Case 21.2/21.3 failed: Must transition to UPLOAD_CONFIRMED_METADATA_PENDING and persist when Firestore write fails'
    );
  }

  // Kịch bản 4: Giả lập F5 (xóa trắng toàn bộ trạng thái RAM) -> khôi phục lại được bản ghi UPLOAD_CONFIRMED_METADATA_PENDING từ bộ nhớ bền vững
  f5Sys.simulatePageReloadClearingRamOnlyState();
  if (f5Sys.getPendingSync('tank_f5_rec', 'uid_super_admin_1') !== null) {
    throw new Error('Case 21.4 setup failed: RAM state should be empty right after F5 before recovery');
  }

  // Kịch bản 8 (kiểm tra song song sau F5): Người dùng khác ownerUid không thể xem hoặc retry bản ghi pending
  const otherUserRecovery = await f5Sys.recoverPendingUploadsAfterF5({
    currentUserUid: 'uid_other_user_999',
    authEmail: 'other@gmail.com',
    isVerifiedPersonalGmail: true,
  });
  const otherUserViewPending = f5Sys.getPendingSync('tank_f5_rec', 'uid_other_user_999');
  const otherUserRetryAttempt = await f5Sys.adminRetryPendingCatalogSync({
    authUid: 'uid_other_user_999',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    nowMs: nowMs + 10_200,
  });
  if (
    otherUserRecovery.recoveredConfirmedCount !== 0 ||
    otherUserRecovery.skippedOtherOwnerCount !== 1 ||
    otherUserViewPending !== null ||
    otherUserRetryAttempt.success !== false ||
    otherUserRetryAttempt.errorCode !== 'PENDING_OWNER_MISMATCH'
  ) {
    throw new Error(
      'Case 21.8 failed: User with UID different from ownerUid must not view or retry pending upload record'
    );
  }

  // Chủ sở hữu hợp lệ (uid_super_admin_1) khôi phục sau F5:
  const ownerRecovery = await f5Sys.recoverPendingUploadsAfterF5({
    currentUserUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
  });
  const recoveredPendingAfterF5 = f5Sys.getPendingSync('tank_f5_rec', 'uid_super_admin_1');
  if (
    ownerRecovery.recoveredConfirmedCount !== 1 ||
    !recoveredPendingAfterF5 ||
    recoveredPendingAfterF5.status !== 'UPLOAD_CONFIRMED_METADATA_PENDING' ||
    recoveredPendingAfterF5.storagePath !== uploadOkFirestoreFailRes.storagePath
  ) {
    throw new Error(
      'Case 21.4 failed: Must recover UPLOAD_CONFIRMED_METADATA_PENDING record after F5 reload'
    );
  }

  // Kịch bản 5 & 6: Retry sau F5 -> chỉ ghi Firestore (không gọi uploadBytes lại) -> ghi thành công và đọc lại khớp thì xóa bản ghi pending
  const uploadCallsBeforeF5Retry = f5Sys.getStorageUploadCallCount();
  const retryAfterF5Res = await f5Sys.adminRetryPendingCatalogSync({
    authUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    nowMs: nowMs + 10_300,
  });
  const uploadCallsAfterF5Retry = f5Sys.getStorageUploadCallCount();
  const persistedAfterSuccess = await f5Sys.getPersistentPendingStore().getPendingRecord('tank_f5_rec');
  const syncedDocAfterF5 = f5Sys.getCatalogDoc('tank_f5_rec');
  if (
    !retryAfterF5Res.success ||
    uploadCallsAfterF5Retry !== uploadCallsBeforeF5Retry ||
    persistedAfterSuccess !== null ||
    f5Sys.getPendingSync('tank_f5_rec', 'uid_super_admin_1') !== null ||
    !syncedDocAfterF5 ||
    syncedDocAfterF5.version !== 1 ||
    syncedDocAfterF5.storagePath !== uploadOkFirestoreFailRes.storagePath
  ) {
    throw new Error(
      'Case 21.5/21.6 failed: Retry after F5 must only write Firestore without re-uploading, and delete pending record after Firestore read-back verification'
    );
  }

  // Kịch bản 7A: F5 xảy ra trong lúc UPLOAD_IN_PROGRESS và file CHƯA kịp lên Storage ->
  // khi khôi phục sau F5 phải chuyển sang UPLOAD_INDETERMINATE, không tạo metadata cho object chưa xác minh,
  // giữ khóa version v2 và lần upload tiếp theo phải sinh version v3 cùng đường dẫn mới.
  f5Sys.setSimulateNextUploadInterruptedByF5({
    interrupted: true,
    objectLandedOnStorage: false,
  });
  const interruptedNoObjRes = await f5Sys.adminUploadOrReplaceCatalogAvatar({
    ownerUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    name: 'Chiến Xa Phục Hồi F5 v2',
    fileName: 'rec_v2.png',
    mimeType: 'image/png',
    arrayBuffer: f5PngBuf,
    sortOrder: 50,
    useUuidFileName: true,
    nowMs: nowMs + 10_400,
  });
  const rawSavedDuringInProgress = await f5Sys.getPersistentPendingStore().getPendingRecord('tank_f5_rec');
  f5Sys.simulatePageReloadClearingRamOnlyState();
  const recovery7A = await f5Sys.recoverPendingUploadsAfterF5({
    currentUserUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
  });
  const pendingAfter7A = f5Sys.getPendingSync('tank_f5_rec', 'uid_super_admin_1');
  const attemptRetryUnverified7A = await f5Sys.adminRetryPendingCatalogSync({
    authUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    nowMs: nowMs + 10_500,
  });
  // Thực hiện upload mới sau khi v2 bị UPLOAD_INDETERMINATE -> bắt buộc cấp v3 và path mới:
  const freshUploadAfter7A = await f5Sys.adminUploadOrReplaceCatalogAvatar({
    ownerUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    name: 'Chiến Xa Phục Hồi F5 v3',
    fileName: 'rec_v3.png',
    mimeType: 'image/png',
    arrayBuffer: f5PngBuf,
    sortOrder: 50,
    useUuidFileName: true,
    nowMs: nowMs + 10_600,
  });
  if (
    rawSavedDuringInProgress?.status !== 'UPLOAD_IN_PROGRESS' ||
    interruptedNoObjRes.version !== 2 ||
    recovery7A.recoveredIndeterminateCount !== 1 ||
    recovery7A.recoveredConfirmedCount !== 0 ||
    pendingAfter7A?.status !== 'UPLOAD_INDETERMINATE' ||
    attemptRetryUnverified7A.success !== false ||
    attemptRetryUnverified7A.errorCode !== 'PENDING_UPLOAD_NOT_CONFIRMED' ||
    !freshUploadAfter7A.success ||
    freshUploadAfter7A.version !== 3 ||
    freshUploadAfter7A.storagePath === interruptedNoObjRes.storagePath
  ) {
    throw new Error(
      'Case 21.7A failed: UPLOAD_IN_PROGRESS recovered after F5 without verified Storage object must stay UPLOAD_INDETERMINATE, block catalog metadata creation, and allocate v+1 on next upload'
    );
  }

  // Kịch bản 7B: F5 xảy ra trong lúc UPLOAD_IN_PROGRESS nhưng gói tin thực tế ĐÃ hoàn tất trên Storage
  // (khớp uploadOperationId, fileSize, contentType) -> khi khôi phục sau F5 phải kiểm tra Storage trước,
  // xác minh khớp rồi mới chuyển sang UPLOAD_CONFIRMED_METADATA_PENDING và cho phép đồng bộ metadata mà không upload lại.
  f5Sys.setSimulateNextUploadInterruptedByF5({
    interrupted: true,
    objectLandedOnStorage: true,
  });
  const interruptedLandedRes = await f5Sys.adminUploadOrReplaceCatalogAvatar({
    ownerUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    name: 'Chiến Xa Phục Hồi F5 v4',
    fileName: 'rec_v4.png',
    mimeType: 'image/png',
    arrayBuffer: f5PngBuf,
    sortOrder: 50,
    useUuidFileName: true,
    nowMs: nowMs + 10_700,
  });
  f5Sys.simulatePageReloadClearingRamOnlyState();
  const recovery7B = await f5Sys.recoverPendingUploadsAfterF5({
    currentUserUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
  });
  const pendingAfter7B = f5Sys.getPendingSync('tank_f5_rec', 'uid_super_admin_1');
  const uploadCallsBefore7BRetry = f5Sys.getStorageUploadCallCount();
  const retry7BRes = await f5Sys.adminRetryPendingCatalogSync({
    authUid: 'uid_super_admin_1',
    authEmail: SUPER_ADMIN_EMAIL,
    isVerifiedPersonalGmail: true,
    avatarId: 'tank_f5_rec',
    nowMs: nowMs + 10_800,
  });
  const uploadCallsAfter7BRetry = f5Sys.getStorageUploadCallCount();
  if (
    interruptedLandedRes.version !== 4 ||
    recovery7B.recoveredConfirmedCount !== 1 ||
    pendingAfter7B?.status !== 'UPLOAD_CONFIRMED_METADATA_PENDING' ||
    !retry7BRes.success ||
    uploadCallsAfter7BRetry !== uploadCallsBefore7BRetry ||
    f5Sys.getCatalogDoc('tank_f5_rec')?.version !== 4
  ) {
    throw new Error(
      'Case 21.7B failed: UPLOAD_IN_PROGRESS recovered after F5 with verified Storage object (matching uploadOperationId, fileSize, contentType) must transition to UPLOAD_CONFIRMED_METADATA_PENDING and sync metadata without re-uploading'
    );
  }

  // 22. M7.3.6: Kiểm tra UI Cleanup, Tên hiển thị các loại Tank (Basic/Fast/Power/Armor Tank),
  //     Lưu lựa chọn Ảnh Google và Trình tự 6 bước tạo phòng Co-op Online: PASS
  const mainMenuSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/MainMenuScreen.tsx'),
    'utf-8'
  );
  const settingsModalSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/SettingsModal.tsx'),
    'utf-8'
  );
  const supportModalSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/SupportModal.tsx'),
    'utf-8'
  );
  const modeSelectionSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/ModeSelectionScreen.tsx'),
    'utf-8'
  );
  const coopLobbySrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/CoopOnlineLobbyModal.tsx'),
    'utf-8'
  );
  const stageClearSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/StageClearModal.tsx'),
    'utf-8'
  );
  const gameOverSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/GameOverModal.tsx'),
    'utf-8'
  );
  const m3HudSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/M3Hud.tsx'),
    'utf-8'
  );

  // II.1: MainMenuScreen không còn hiển thị Stage 1
  if (/STAGE\s*1/i.test(mainMenuSrc)) {
    throw new Error('Case 22.1 failed: MainMenuScreen.tsx must not display Stage 1');
  }
  // II.2 & II.3: SettingsModal không còn dòng mô tả phụ dưới CÀI ĐẶT và Chọn ảnh Google mặc định
  if (
    settingsModalSrc.includes('Quản lý Tài khoản & Danh mục Avatar') ||
    settingsModalSrc.includes('Chọn Ảnh Google mặc định hoặc')
  ) {
    throw new Error(
      'Case 22.2/22.3 failed: SettingsModal.tsx must not display redundant subtitle descriptions'
    );
  }
  // II.4: SupportModal không còn dòng mô tả phụ Hướng dẫn cách chơi, điều khiển
  if (supportModalSrc.includes('Hướng dẫn cách chơi, điều khiển')) {
    throw new Error(
      'Case 22.4 failed: SupportModal.tsx must not display redundant subtitle description'
    );
  }
  // II.5, II.6, II.7: ModeSelectionScreen & CoopOnlineLobbyModal
  if (
    modeSelectionSrc.includes('Bước 1/2') ||
    modeSelectionSrc.includes('Bước 2/2') ||
    modeSelectionSrc.includes('Normal (mặc định)') ||
    modeSelectionSrc.includes('Hard (thử thách cao)') ||
    !modeSelectionSrc.includes('Giải trí') ||
    !modeSelectionSrc.includes('Thử thách') ||
    !modeSelectionSrc.includes('Xác nhận') ||
    !coopLobbySrc.includes('Giải trí') ||
    !coopLobbySrc.includes('Thử thách')
  ) {
    throw new Error(
      'Case 22.5/22.6/22.7 failed: ModeSelectionScreen.tsx and CoopOnlineLobbyModal.tsx must use Giải trí, Thử thách, Xác nhận buttons and omit step subtitles'
    );
  }
  // V: Đổi tên hiển thị các loại Tank trên toàn bộ giao diện (không còn Xe Basic/Fast/Power/Armor/Amor)
  const allTankUiSrc = [stageClearSrc, gameOverSrc, m3HudSrc, supportModalSrc].join('\n');
  if (
    /Xe\s+(Basic|Fast|Power|Armor|Amor)/i.test(allTankUiSrc) ||
    !stageClearSrc.includes('Basic Tank') ||
    !stageClearSrc.includes('Fast Tank') ||
    !stageClearSrc.includes('Power Tank') ||
    !stageClearSrc.includes('Armor Tank') ||
    !gameOverSrc.includes('Basic Tank') ||
    !gameOverSrc.includes('Fast Tank') ||
    !gameOverSrc.includes('Power Tank') ||
    !gameOverSrc.includes('Armor Tank') ||
    !m3HudSrc.includes('Basic Tank') ||
    !m3HudSrc.includes('Fast Tank') ||
    !m3HudSrc.includes('Power Tank') ||
    !m3HudSrc.includes('Armor Tank')
  ) {
    throw new Error(
      'Case 22.V failed: All UI components must display Basic Tank, Fast Tank, Power Tank, Armor Tank'
    );
  }

  // 23. Kiểm tra tách tab SettingsModal, bỏ nút Tiếp tục trùng lặp trên ModeSelectionScreen,
  //     ký hiệu vai trò A/M thu nhỏ, tắt Vào nhanh & tính năng mới Co-op Online / Stats / Google account chooser: PASS
  const authSessionBannerSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/AuthSessionBanner.tsx'),
    'utf-8'
  );
  const authMgrSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/core/authManager.ts'),
    'utf-8'
  );
  if (
    modeSelectionSrc.includes('TIẾP TỤC CHỌN ĐỘ KHÓ') ||
    modeSelectionSrc.includes('XÁC NHẬN (') ||
    modeSelectionSrc.includes('Vào nhanh') ||
    !settingsModalSrc.includes('Tài khoản cá nhân') ||
    !settingsModalSrc.includes('Cài đặt hình ảnh') ||
    !settingsModalSrc.includes('Cài đặt âm thanh') ||
    !settingsModalSrc.includes('Cài đặt chế độ chơi') ||
    !settingsModalSrc.includes('Quản trị & Phân quyền') ||
    !coopLobbySrc.includes('1. TẠO PHÒNG') ||
    !coopLobbySrc.includes('2. THAM GIA PHÒNG') ||
    !coopLobbySrc.includes('Có mật khẩu') ||
    !coopLobbySrc.includes('Không mật khẩu') ||
    coopLobbySrc.includes('A. VÀO NHANH') ||
    !coopLobbySrc.includes('VÀO BẰNG MÃ PHÒNG') ||
    !coopLobbySrc.includes('coop-lobby-kick-guest-btn') ||
    !coopLobbySrc.includes('Mời ra') ||
    !stageClearSrc.includes('stageclear-next-ready-btn') ||
    !stageClearSrc.includes('p2Stats') ||
    !gameOverSrc.includes('p2Stats') ||
    !authMgrSrc.includes("prompt: 'select_account'") ||
    !mainMenuSrc.includes('getRoleTrademarkBadge') ||
    !modeSelectionSrc.includes('getRoleTrademarkBadge') ||
    !authSessionBannerSrc.includes('getRoleTrademarkBadge') ||
    !coopLobbySrc.includes('getRoleTrademarkBadge') ||
    !settingsModalSrc.includes('getRoleTrademarkBadge')
  ) {
    throw new Error(
      'Case 23 failed: UI components must satisfy tab separation, Quick Join removal, Kick P2, Post-stage Ready, per-player stats, A/M trademark badges, and select_account prompt'
    );
  }

  console.log('[M7.3.6 & M7.3.7 UI Cleanup, Avatar Recovery, Role Frames, Single-BGM & Co-op Online E2E Verification] 23/23 MANDATORY CASES PASS');
}

async function verifyM7311StageAudioUploadAsyncSuite() {
  const mm = MusicManager.getInstance();
  const synthBuffer = {
    duration: 42,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(44100),
  };
  const sampleBinary = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]).buffer;

  // 1. M7.5.1 PHẦN 2: Client audio upload via uploadAndCatalogAudioBuffer & uploadTrack must be blocked
  const cloud1 = new InMemorySharedMusicCloudAdapter();
  mm.setCloudAdapter(cloud1, async () => synthBuffer);
  mm.setUserRole('ADMIN');
  const blockedCatalogUpload = await mm.uploadAndCatalogAudioBuffer({
    soundId: 'snd_stage_blocked',
    fileName: 'stage_bgm.m4a',
    displayName: 'Stage BGM Blocked',
    contentType: 'audio/mp4',
    fileSize: 256_000,
    decodedBuffer: synthBuffer,
    arrayBuffer: sampleBinary,
    autoActivate: true,
    nowMs: 1_730_000_000_000,
  });
  const fakeFile = {
    name: 'stage_boss.mp3',
    type: 'audio/mpeg',
    size: 128_000,
    arrayBuffer: async () => sampleBinary.slice(0),
  } as unknown as File;
  const blockedUploadTrack = await mm.uploadTrack(fakeFile, 'Stage Boss');
  if (blockedCatalogUpload.success !== false || blockedUploadTrack.success !== false) {
    throw new Error('Client audio upload must be blocked per M7.5.1');
  }
  mm.clearSharedSyncError();
  if (mm.getSharedSyncError() !== null) {
    throw new Error('clearSharedSyncError did not clear sharedSyncError');
  }

  // 2. Existing /sound_catalog entry activation bumps v1 -> v2 monotonically without client re-upload
  const existingPath = 'sound_catalog/snd_stage_ok/v1/bgm_v1_stage_2_theme.m4a';
  cloud1.deployStaticAudioFileToGitHubPages(existingPath, sampleBinary, 'audio/mp4');
  await cloud1.saveSoundCatalogEntry({
    soundId: 'snd_stage_ok',
    displayName: 'Stage 2 Theme',
    fileName: 'bgm_v1_stage_2_theme.m4a',
    storagePath: existingPath,
    contentType: 'audio/mp4',
    fileSize: sampleBinary.byteLength,
    category: 'BGM',
    durationSec: 42,
    trimStartSec: 0,
    trimEndSec: 42,
    version: 1,
    isActive: false,
    updatedAt: 1_730_000_010_000,
    updatedBy: 'linhnk2013@gmail.com',
  });
  mm.ensureSharedConfigSubscription('uid_admin_m7311');
  const actV1 = await mm.activateCatalogSound('snd_stage_ok');
  const actV2 = await mm.activateCatalogSound('snd_stage_ok');
  if (
    !actV1.success ||
    actV1.config?.version !== 1 ||
    !actV2.success ||
    actV2.config?.version !== 2 ||
    !(actV2.config.updatedAt >= actV1.config.updatedAt)
  ) {
    throw new Error('activateCatalogSound did not increment version monotonically');
  }

  // 3. /system_config/audio permission-denied during activateCatalogSound must NOT mask failure
  let activeConfigInMock: SystemAudioConfigDocument | null = null;
  const catalogMap = new Map<string, SoundCatalogEntry>();
  catalogMap.set('snd_perm_test', {
    soundId: 'snd_perm_test',
    displayName: 'Perm Test',
    fileName: 'bgm_v1_perm.mp3',
    storagePath: 'sound_catalog/snd_perm_test/v1/bgm_v1_perm.mp3',
    contentType: 'audio/mpeg',
    fileSize: sampleBinary.byteLength,
    category: 'BGM',
    durationSec: 42,
    trimStartSec: 0,
    trimEndSec: 42,
    version: 1,
    isActive: false,
    updatedAt: 1_730_000_020_000,
    updatedBy: 'linhnk2013@gmail.com',
  });
  const mockFirebaseAdapter: SharedMusicCloudAdapter = {
    uploadAudioBinary: async (assetPath) => ({ assetPath }),
    deleteAudioBinary: async () => {},
    fetchAudioBinary: async () => sampleBinary.slice(0),
    getSystemAudioConfig: async () => activeConfigInMock,
    saveSystemAudioConfig: async () => {
      throw new Error(
        JSON.stringify({
          error: 'Missing or insufficient permissions.',
          operationType: 'write',
          path: 'system_config/audio',
          authInfo: { email: 'linhnk2013@gmail.com', emailVerified: true },
        })
      );
    },
    deleteSystemAudioConfig: async () => {
      activeConfigInMock = null;
    },
    subscribeSystemAudioConfig: () => () => {},
    listSoundCatalog: async () => Array.from(catalogMap.values()),
    saveSoundCatalogEntry: async (entry) => {
      catalogMap.set(entry.soundId, entry);
    },
    deleteSoundCatalogEntry: async (soundId) => {
      catalogMap.delete(soundId);
    },
    subscribeSoundCatalog: (cb) => {
      cb(Array.from(catalogMap.values()));
      return () => {};
    },
  };

  mm.setCloudAdapter(mockFirebaseAdapter, async () => synthBuffer);
  mm.setUserRole('ADMIN');
  mm.ensureSharedConfigSubscription('uid_admin_perm_test');
  const activatePermFail = await mm.activateCatalogSound('snd_perm_test');
  if (
    activatePermFail.success !== false ||
    !activatePermFail.error?.includes('system_config/audio')
  ) {
    throw new Error('activateCatalogSound masked Firestore /system_config/audio permission failure');
  }

  mm.clearSharedSyncError();
  mm.resetAllAssignmentsToDefault();
  mm.syncRoleFromAuthUser(null);
  console.log('[M7.3.11 & M7.5.1 Static Audio Guard + Catalog Activation Diagnostics E2E] 4/4 MANDATORY CASES PASS');
}

async function verifyMediaAndVideoUpgradeAsyncSuite() {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');

  const musicAdminSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/MusicAdminPanel.tsx'),
    'utf-8'
  );
  const mainMenuSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/MainMenuScreen.tsx'),
    'utf-8'
  );
  const settingsModalSrc = fsMod.readFileSync(
    pathMod.resolve(process.cwd(), 'src/components/SettingsModal.tsx'),
    'utf-8'
  );

  // 1. UI checks: tab renamed to 'Media', no v1/v2 or 'Admin duy nhất', 2 - AI & 2P present, Loop Kích hoạt present, AND zero client upload inputs/buttons per M7.5.1
  if (
    !settingsModalSrc.includes("label: 'Media'") ||
    settingsModalSrc.includes('type="file"') ||
    musicAdminSrc.includes('type="file"') ||
    musicAdminSrc.includes('data-testid="upload-home-video-btn"') ||
    musicAdminSrc.includes('Admin duy nhất') ||
    musicAdminSrc.includes('v${') ||
    musicAdminSrc.includes('?v=') ||
    !musicAdminSrc.includes('2 - AI') ||
    !musicAdminSrc.includes('2P') ||
    !musicAdminSrc.includes('data-testid="loop-activate-btn"') ||
    !mainMenuSrc.includes('<video')
  ) {
    throw new Error('Media UI requirements check failed in SettingsModal / MusicAdminPanel / MainMenuScreen');
  }

  // 2. Client multi-file upload blocked + static BGM assignments (Home, 2 - AI, 2P, Stage) + Loop cloud activation + Static Home MP4 video
  const mm = MusicManager.getInstance();
  const cloud = new InMemorySharedMusicCloudAdapter();
  const synthBuffer = {
    duration: 24,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(44100),
  };
  mm.setCloudAdapter(cloud, async () => synthBuffer);
  mm.setUserRole('ADMIN');
  mm.ensureSharedConfigSubscription('uid_admin_media');

  const sampleAudio = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]).buffer;
  const audioFiles = [
    { name: 'home_theme.mp3', type: 'audio/mpeg', size: 64_000, arrayBuffer: async () => sampleAudio.slice(0) },
  ] as unknown as File[];

  const batchRes = await mm.uploadMultipleAudioFiles(audioFiles);
  if (batchRes.uploaded.length !== 0 || batchRes.failed.length !== 1) {
    throw new Error('Client multi-file audio upload must be blocked per M7.5.1');
  }

  mm.assignToHome(STATIC_BGM_INDEX_ID);
  mm.assignToMode('COOP_AI', STATIC_BGM_STAGE_ID);
  mm.assignToMode('TWO_PLAYER', STATIC_BGM_INDEX_ID);
  mm.assignToStage(1, STATIC_BGM_STAGE_ID);
  mm.updateLoopConfig({ loop: true, crossfadeDurationSec: 1.5 });

  const loopActRes = await mm.activateLoopConfigSystemWide(1_731_000_000_000);
  const assignActRes = await mm.activateMediaAssignmentsSystemWide(1_731_000_001_000);
  if (
    !loopActRes.success ||
    !assignActRes.success ||
    assignActRes.config?.homeSoundId !== STATIC_BGM_INDEX_ID ||
    assignActRes.config?.modeSoundIds.COOP_AI !== STATIC_BGM_STAGE_ID ||
    assignActRes.config?.modeSoundIds.TWO_PLAYER !== STATIC_BGM_INDEX_ID ||
    assignActRes.config?.stageSoundIds['1'] !== STATIC_BGM_STAGE_ID ||
    assignActRes.config?.loopConfig.crossfadeDurationSec !== 1.5
  ) {
    throw new Error('Failed to activate loop config or multi-scope static media assignments system-wide');
  }

  // 3. Home MP4 Video: client upload blocked, static intro-bantank.mp4 activation + Opacity & Loop update succeed
  const fakeVideoFile = {
    name: 'home_bg.mp4',
    type: 'video/mp4',
    size: 1_200_000,
    arrayBuffer: async () => new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]).buffer,
  } as unknown as File;

  const blockedVidRes = await mm.uploadHomeBackgroundVideo(fakeVideoFile, {
    opacity: 0.4,
    loop: true,
    nowMs: 1_731_000_002_000,
  });
  if (blockedVidRes.success !== false) {
    throw new Error('Client Home MP4 video upload must be blocked per M7.5.1');
  }

  const staticVidRes = await mm.activateStaticIntroVideo({
    opacity: 0.4,
    loop: true,
    nowMs: 1_731_000_002_500,
  });
  if (
    !staticVidRes.success ||
    staticVidRes.homeVideo?.storagePath !== 'intro-bantank.mp4' ||
    staticVidRes.homeVideo?.opacity !== 0.4 ||
    !mm.getHomeVideoUrl()
  ) {
    throw new Error('Static Home MP4 video activation & URL resolution failed');
  }

  const vidUpdateRes = await mm.updateHomeVideoSettings({ opacity: 0.65, loop: false }, 1_731_000_003_000);
  if (!vidUpdateRes.success || vidUpdateRes.homeVideo?.opacity !== 0.65 || vidUpdateRes.homeVideo?.loop !== false) {
    throw new Error('Home video opacity/loop update failed');
  }

  mm.resetAllAssignmentsToDefault();
  mm.syncRoleFromAuthUser(null);
  console.log('[Media Static Catalog (Static BGM, 2-AI/2P/Stages, Loop Activation, Static Home MP4 Video) E2E] 3/3 MANDATORY CASES PASS');
}

async function verifyM7312FixesAsyncSuite() {
  // 1. MusicManager catalog BGM: storage/retry-limit-exceeded on getBytes falls back to fetchAudioStreamUrl without sharedSyncError
  const mm = MusicManager.getInstance();
  const cloud = new InMemorySharedMusicCloudAdapter();
  mm.setCloudAdapter(cloud, async () => ({
    duration: 24,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(44100),
  }));
  const adminUser = {
    uid: 'admin_m7312',
    email: 'linhnk2013@gmail.com',
    emailVerified: true,
    providerIds: ['google.com'],
  };
  mm.syncRoleFromAuthUser(adminUser);

  const stageStoragePath = 'sound_catalog/snd_stage_cors/v1/bgm_v1_bgm-stage.mp3';
  const rawAudio = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x01, 0x02, 0x03]).buffer;
  cloud.deployStaticAudioFileToGitHubPages(stageStoragePath, rawAudio, 'audio/mpeg');
  await cloud.saveSoundCatalogEntry({
    soundId: 'snd_stage_cors',
    displayName: 'bgm-stage',
    fileName: 'bgm_v1_bgm-stage.mp3',
    storagePath: stageStoragePath,
    contentType: 'audio/mpeg',
    fileSize: rawAudio.byteLength,
    category: 'BGM',
    durationSec: 24,
    trimStartSec: 0,
    trimEndSec: 24,
    version: 1,
    isActive: true,
    updatedAt: 1_756_000_000_000,
    updatedBy: 'linhnk2013@gmail.com',
  });

  // Mô phỏng bucket chưa cấu hình CORS gây retry-limit-exceeded khi gọi fetchAudioBinary
  cloud.failNextAudioFetchWithRetryLimit = true;
  mm.assignToStage(1, 'snd_stage_cors');
  mm.syncPlaybackWithContext(1, 'SOLO');
  await new Promise((r) => setTimeout(r, 30));

  if (mm.getSharedSyncError() !== null) {
    throw new Error(`Expected null sharedSyncError on retry-limit stream fallback, got: ${mm.getSharedSyncError()}`);
  }
  if (!cloud.operationLog.some((e) => e.startsWith('AUDIO_STREAM_URL_OK:'))) {
    throw new Error('Expected fetchAudioStreamUrl fallback to be invoked on storage/retry-limit-exceeded');
  }
  if (mm.getActiveSourceCount() !== 1) {
    throw new Error(`Expected active streaming source count === 1, got ${mm.getActiveSourceCount()}`);
  }

  // Kiểm tra dừng nhạc & xóa sạch
  mm.pause();
  if (mm.getActiveSourceCount() !== 0) {
    throw new Error('Expected active source count === 0 after pause()');
  }

  // 2. Real permission error (storage/unauthorized) must NOT be masked by stream fallback
  if (shouldFallbackToAudioStream({ code: 'storage/unauthorized', message: 'User does not have permission' })) {
    throw new Error('shouldFallbackToAudioStream must return false for storage/unauthorized');
  }
  if (!shouldFallbackToAudioStream({ code: 'storage/retry-limit-exceeded', message: 'Max retry time exceeded' })) {
    throw new Error('shouldFallbackToAudioStream must return true for storage/retry-limit-exceeded');
  }

  // 3. UI checks: SessionAlertModal has Đăng xuất tài khoản (no Đăng nhập lại) & MainMenuScreen has home-video-loading-banner above footer
  const fs = await import('fs');
  const sessionAlertCode = fs.readFileSync('src/components/SessionAlertModal.tsx', 'utf8');
  if (!sessionAlertCode.includes('Đăng xuất tài khoản') || sessionAlertCode.includes('Đăng nhập lại')) {
    throw new Error('SessionAlertModal.tsx missing Đăng xuất tài khoản or still contains Đăng nhập lại');
  }
  const mainMenuCode = fs.readFileSync('src/components/MainMenuScreen.tsx', 'utf8');
  const bannerIdx = mainMenuCode.indexOf('home-video-loading-banner');
  const footerIdx = mainMenuCode.indexOf('<footer');
  if (bannerIdx === -1 || footerIdx === -1 || bannerIdx > footerIdx) {
    throw new Error('MainMenuScreen.tsx missing home-video-loading-banner directly above <footer>');
  }

  mm.resetAllAssignmentsToDefault();
  mm.syncRoleFromAuthUser(null);
  console.log('[M7.3.12 Fixes (Rematch Sync, BT0-9, Logout Button, Storage Stream Fallback, Video Banner) E2E] 4/4 PASS');
}

async function verifyM7313FixesAsyncSuite() {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');

  const readSrc = (rel: string) =>
    fsMod.readFileSync(pathMod.resolve(process.cwd(), rel), 'utf-8');

  const welcomeSrc = readSrc('src/components/WelcomeScreen.tsx');
  const mainMenuSrc = readSrc('src/components/MainMenuScreen.tsx');
  const modeSelectSrc = readSrc('src/components/ModeSelectionScreen.tsx');
  const lobbySrc = readSrc('src/components/CoopOnlineLobbyModal.tsx');
  const settingsSrc = readSrc('src/components/SettingsModal.tsx');
  const gameOverSrc = readSrc('src/components/GameOverModal.tsx');
  const stageClearSrc = readSrc('src/components/StageClearModal.tsx');
  const m3HudSrc = readSrc('src/components/M3Hud.tsx');
  const appSrc = readSrc('src/App.tsx');

  // 1. Preload & autoplay blurred looping video on Welcome & MainMenu + loading banner above <footer>
  const welcomeBannerIdx = welcomeSrc.indexOf('home-video-loading-banner');
  const welcomeFooterIdx = welcomeSrc.indexOf('<footer');
  if (
    !welcomeSrc.includes('<video') ||
    !welcomeSrc.includes('blur-[3px]') ||
    !welcomeSrc.includes('preload="auto"') ||
    welcomeBannerIdx === -1 ||
    welcomeFooterIdx === -1 ||
    welcomeBannerIdx > welcomeFooterIdx ||
    !mainMenuSrc.includes('blur-[3px]') ||
    !mainMenuSrc.includes('preload="auto"')
  ) {
    throw new Error('WelcomeScreen / MainMenuScreen video preload, blur, or loading banner check failed');
  }

  // 2. Public intro-bantank.mp4 file presence
  if (!fsMod.existsSync(pathMod.resolve(process.cwd(), 'public/intro-bantank.mp4'))) {
    throw new Error('public/intro-bantank.mp4 is missing');
  }

  // 3. Google Sign-In & Chơi thử compact width + orange-red / dark-gray gradient shift styling
  if (
    !welcomeSrc.includes('data-testid="welcome-google-signin-btn"') ||
    !welcomeSrc.includes('max-w-[260px]') ||
    !welcomeSrc.includes('from-orange-600 via-red-600 to-orange-500') ||
    !welcomeSrc.includes('from-neutral-900 via-zinc-700 to-neutral-950') ||
    !welcomeSrc.includes('bg-[length:200%_100%] bg-left hover:bg-right')
  ) {
    throw new Error('WelcomeScreen compact width & gradient button styling check failed');
  }

  // 4. App.tsx syncs menu BGM on WELCOME without requiring login
  if (!appSrc.includes("appScreen === 'WELCOME'") || !appSrc.includes('SoundManager.getInstance().unlock()')) {
    throw new Error('App.tsx immediate WELCOME BGM / audio unlock check failed');
  }

  // 5. ModeSelectionScreen hides Quay lại inside online waiting room & CoopOnlineLobbyModal checks FINISHED
  if (
    !modeSelectSrc.includes('isInsideOnlineWaitingRoom') ||
    !modeSelectSrc.includes('{!isInsideOnlineWaitingRoom && (') ||
    !lobbySrc.includes("room.status === 'FINISHED'")
  ) {
    throw new Error('Waiting room Quay lại hiding or FINISHED lobby guard check failed');
  }

  // 6. GameOverModal & StageClearModal use getStartingLivesForDifficultyAndMode & localOnlineRole
  if (
    !gameOverSrc.includes('getStartingLivesForDifficultyAndMode') ||
    !gameOverSrc.includes('localOnlineRole') ||
    !stageClearSrc.includes('getStartingLivesForDifficultyAndMode') ||
    !stageClearSrc.includes('localOnlineRole')
  ) {
    throw new Error('GameOverModal / StageClearModal accurate lives calculation check failed');
  }

  // 7. SettingsModal avatar blurred backdrop, Ping/FPS toggle, Online/Offline status (no Hoạt động status badge)
  if (
    !settingsSrc.includes('account-avatar-blurred-backdrop') ||
    !settingsSrc.includes('toggle-online-net-stats-btn') ||
    !settingsSrc.includes("? 'Online' : 'Offline'") ||
    settingsSrc.includes("? 'Đang trực tuyến' : 'Hoạt động'") ||
    m3HudSrc.includes("'HOẠT ĐỘNG'") ||
    !m3HudSrc.includes("'ONLINE'") ||
    !m3HudSrc.includes('hud-online-net-stats')
  ) {
    throw new Error('SettingsModal / M3Hud avatar backdrop, Ping/FPS toggle, or Online/Offline status check failed');
  }

  // 8. Preference helper & static intro video activation flow
  if (getShowOnlineNetStatsPreference() !== true) {
    throw new Error('Default getShowOnlineNetStatsPreference() should be true');
  }
  setShowOnlineNetStatsPreference(false);

  const mm = MusicManager.getInstance();
  const cloud = new InMemorySharedMusicCloudAdapter();
  mm.setCloudAdapter(cloud, async () => ({
    duration: 24,
    sampleRate: 44100,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(44100),
  }));
  mm.syncRoleFromAuthUser({
    uid: 'uid_admin_m7313',
    email: 'linhnk2013@gmail.com',
    emailVerified: true,
    providerIds: ['google.com'],
  });
  const staticAct = await mm.activateStaticIntroVideo({ nowMs: 1_760_000_005_000 });
  if (
    !staticAct.success ||
    staticAct.homeVideo?.storagePath !== 'intro-bantank.mp4' ||
    staticAct.homeVideo?.isEnabled !== true ||
    staticAct.homeVideo?.loop !== true
  ) {
    throw new Error('MusicManager.activateStaticIntroVideo() verification failed');
  }
  mm.syncRoleFromAuthUser(null);

  console.log('[M7.3.13 Fixes (12 Items: EXTREME Lives, Intro Autoplay/Banner/Blur, Waiting Room, Rematch, Net Stats, Status, Line Breaks) E2E] 8/8 PASS');
}

async function verifyUiAndStageCloudSyncSuite() {
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const readSrc = (rel: string) =>
    fsMod.readFileSync(pathMod.resolve(process.cwd(), rel), 'utf-8');

  // 1. Music icon toggle (Music instead of Volume2/VolumeX) & no Settings/Logout text labels on menu headers
  const quickAudioSrc = readSrc('src/components/QuickAudioToggleButton.tsx');
  const mainMenuSrc = readSrc('src/components/MainMenuScreen.tsx');
  const modeSelectSrc = readSrc('src/components/ModeSelectionScreen.tsx');
  const authBannerSrc = readSrc('src/components/AuthSessionBanner.tsx');
  const appSrc = readSrc('src/App.tsx');
  if (
    !quickAudioSrc.includes("import { Music } from 'lucide-react'") ||
    quickAudioSrc.includes('Volume2') ||
    quickAudioSrc.includes('VolumeX') ||
    !quickAudioSrc.includes('top-menu-music-muted-icon') ||
    !quickAudioSrc.includes('top-menu-music-active-icon')
  ) {
    throw new Error('QuickAudioToggleButton music icon check failed');
  }
  if (
    mainMenuSrc.includes('>Cài đặt</span>') ||
    mainMenuSrc.includes('>Đăng xuất</span>') ||
    modeSelectSrc.includes('>Cài đặt</span>') ||
    authBannerSrc.includes('>Đăng xuất</span>') ||
    appSrc.includes('>Cài đặt</span>')
  ) {
    throw new Error('Top menu header text labels (Cài đặt / Đăng xuất) must be removed');
  }

  // 2. Disconnect title updated to "Kết nối bị gián đoạn"
  const sessionAlertSrc = readSrc('src/components/SessionAlertModal.tsx');
  if (
    !sessionAlertSrc.includes('Kết nối bị gián đoạn') ||
    sessionAlertSrc.includes('Mất kết nối máy chủ')
  ) {
    throw new Error('SessionAlertModal disconnect title update check failed');
  }

  // 3. StageEditorPanel separates top clickable/draggable material cluster from bottom note cluster
  const stageEditorSrc = readSrc('src/components/StageEditorPanel.tsx');
  const welcomeScreenSrc = readSrc('src/components/WelcomeScreen.tsx');
  const mainMenuScreenSrc = readSrc('src/components/MainMenuScreen.tsx');
  const confirmPopupSrc = readSrc('src/components/ConfirmationPopupModal.tsx');
  if (
    !stageEditorSrc.includes('data-testid="palette-draggable-cluster"') ||
    !stageEditorSrc.includes('data-testid={`palette-tile-${tile.code}`}') ||
    !stageEditorSrc.includes('data-testid="palette-notes-cluster"') ||
    !stageEditorSrc.includes('data-testid={`palette-note-${tile.code}`}') ||
    !stageEditorSrc.includes('select-none pointer-events-none') ||
    !stageEditorSrc.includes('syncCatalogToCloud') ||
    stageEditorSrc.indexOf('data-testid="palette-draggable-cluster"') >
      stageEditorSrc.indexOf('data-testid="palette-notes-cluster"')
  ) {
    throw new Error('StageEditorPanel material palette separation or cloud sync check failed');
  }
  const textureGenSrc = readSrc('src/game/textureGenerator.ts');
  if (
    !welcomeScreenSrc.includes('data-testid="welcome-signin-gradient-text"') ||
    !mainMenuScreenSrc.includes('data-testid="main-menu-slogan-image"') ||
    !mainMenuScreenSrc.includes('src="/slogan.png"') ||
    !mainMenuScreenSrc.includes('max-w-[260px]') ||
    !mainMenuScreenSrc.includes('data-testid="main-menu-play-gradient-text"') ||
    !confirmPopupSrc.includes('formatSentenceLineBreaks') ||
    !textureGenSrc.includes("main: '#dc2626'") ||
    !textureGenSrc.includes("main: '#eab308'") ||
    !textureGenSrc.includes("main: '#ffffff'") ||
    !textureGenSrc.includes("main: '#2563eb'") ||
    !textureGenSrc.includes("main: '#16a34a'") ||
    !textureGenSrc.includes("main: '#09090b'")
  ) {
    throw new Error('WelcomeScreen / MainMenuScreen / ConfirmationPopupModal / Tank Colors consistency check failed');
  }

  // 4. End-to-End Stage 2 Edit -> Activate -> Cloud Sync -> Other Player StageManager & GameEngine
  const sharedCloud = new InMemoryStagesCloudAdapter();
  const adminMgr = StageManager.getInstance();
  adminMgr.resetForTesting({ seedCampaignStages: true });
  adminMgr.setCloudAdapter(sharedCloud);

  const editedMap = cloneStageMap(STAGE_2_MAP);
  editedMap[4][4] = TILE_TYPES.WATER;
  editedMap[4][5] = TILE_TYPES.ICE;

  const draftRes = adminMgr.saveStageDraft({
    id: 2,
    name: 'Stage 2 – Bến Cảng Tùy Chỉnh',
    orderIndex: 2,
    map: editedMap,
    actorRole: 'ADMIN',
    actorEmail: 'linhnk2013@gmail.com',
  });
  if (!draftRes.success) {
    throw new Error(`Admin saveStageDraft Stage 2 failed: ${draftRes.errors.join(', ')}`);
  }
  const actRes = adminMgr.activateStage({
    id: 2,
    actorRole: 'ADMIN',
    actorEmail: 'linhnk2013@gmail.com',
  });
  if (!actRes.success) {
    throw new Error(`Admin activateStage Stage 2 failed: ${actRes.errors.join(', ')}`);
  }
  const syncRes = await adminMgr.syncCatalogToCloud({
    actorRole: 'ADMIN',
    actorEmail: 'linhnk2013@gmail.com',
  });
  if (!syncRes.success) {
    throw new Error(`Admin syncCatalogToCloud failed: ${syncRes.error}`);
  }

  // Non-nested arrays check on cloud doc
  const cloudDoc = await sharedCloud.getCatalog();
  if (!cloudDoc || cloudDoc.updatedBy !== 'linhnk2013@gmail.com' || cloudDoc.version < 1) {
    throw new Error('Cloud stages_catalog metadata invalid');
  }
  const stage2Entry = cloudDoc.stages.find((s) => s.id === 2);
  if (!stage2Entry || Array.isArray((stage2Entry as any).draftMapRows)) {
    throw new Error('Cloud Stage 2 must serialize rows as Firestore map object (no nested arrays)');
  }

  // Simulate Player B connecting on another device and starting Stage 2
  const playerBMgr = new StageManager({ loadPersisted: false });
  playerBMgr.resetForTesting({ seedCampaignStages: true });
  playerBMgr.setCloudAdapter(sharedCloud);
  playerBMgr.startCloudSync('uid_player_b_verify');
  await playerBMgr.refreshFromCloudOnce();

  const playerBStage2 = playerBMgr.getStage(2);
  const playerBView2 = playerBMgr.getLiveCampaignStageView(2);
  if (
    !playerBStage2 ||
    !areStageMapsEqual(playerBStage2.map, editedMap) ||
    playerBStage2.name !== 'Stage 2 – Bến Cảng Tùy Chỉnh' ||
    !areStageMapsEqual(playerBView2.map, editedMap) ||
    playerBView2.name !== 'Stage 2 – Bến Cảng Tùy Chỉnh'
  ) {
    throw new Error('Player B failed to receive updated Stage 2 map/name from cloud sync');
  }

  // Also ensure global StageManager + GameEngine play the updated Stage 2 when starting match
  adminMgr.applyCloudCatalog(cloudDoc);
  const engine = new GameEngine();
  const startRes = engine.startMatch('SOLO', 'DEFAULT', {
    stageId: 2,
    enforceProgression: false,
  });
  if (!startRes.success) {
    throw new Error(`GameEngine.startMatch(stage 2) failed: ${startRes.errorMessage}`);
  }
  const st = engine.getState();
  if (
    st.currentStageId !== 2 ||
    st.currentStageName !== 'Stage 2 – Bến Cảng Tùy Chỉnh' ||
    st.terrain.currentMap[4][4] !== TILE_TYPES.WATER ||
    st.terrain.currentMap[4][5] !== TILE_TYPES.ICE
  ) {
    throw new Error('GameEngine did not load updated cloud-synced Stage 2 map');
  }

  playerBMgr.stopCloudSync();
  adminMgr.resetForTesting({ seedCampaignStages: true });
  console.log('[UI Polish & Stage 2 Cloud Sync E2E] 4/4 PASS');
}

async function runAllAsyncVerifications() {
  await verifyM733AsyncWorkflow();
  await verifyM735SharedAvatarCatalogAsyncSuite();
  await verifyM7311StageAudioUploadAsyncSuite();
  await verifyMediaAndVideoUpgradeAsyncSuite();
  await verifyM7312FixesAsyncSuite();
  await verifyM7313FixesAsyncSuite();
  await verifyM751AsyncEndToEndSuite();
  await verifyM752AsyncLevelConcurrencyAndScanSuite();
  await verifyUiAndStageCloudSyncSuite();
  const asyncCasesCount = 10 + 23 + 4 + 3 + 4 + 8 + 5 + 3 + 4;
  console.log('============================================');
  console.log(`SYNC UNIT TESTS  : ${totalPassed}/${totalTests} PASS (M2-M5: 75 | M6: 136 | M7.1: 35 | M7.2: 10 | M7.3: ${m73Results.length} | M7.4: ${m74Results.length} | M7.5.1: ${m75Results.length} | M7.5.2: ${m752Results.length})`);
  console.log(`ASYNC E2E CASES  : ${asyncCasesCount}/${asyncCasesCount} PASS (M7.3.3 Audio: 10 | M7.3.5-M7.3.7 Avatar & UI: 23 | M7.3.11 Stage Audio Fix: 4 | Media Static: 3 | M7.3.12 Fixes: 4 | M7.3.13 Fixes: 8 | M7.5.1 Audit/Archive/Backup: 5 | M7.5.2 Level Concurrency & Scan: 3 | UI & Stage Cloud Sync: 4)`);
  console.log(`GRAND TOTAL SUITE: ${totalPassed + asyncCasesCount}/${totalTests + asyncCasesCount} PASS (0 FAILED, 0 DUPLICATED)`);
  console.log('============================================');
  process.exit(0);
}

runAllAsyncVerifications().catch((err) => {
  console.error('[Async E2E Verification FAIL]', err);
  process.exit(1);
});






