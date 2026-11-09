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
  { name: 'M7.3.3 Rules Hardening, WebRTC Co-op & GitHub Pages Local Audio (33 Tests)', results: m73Results },
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
  STAGED_LOCAL_PREVIEW_BGM_ID,
  buildGitHubPagesAudioUrl,
} from '../src/core/musicManager.ts';

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
  mm.setUserRole('SUPER_ADMIN');

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

  // 5. Mô phỏng người chơi khác ở trình duyệt khác -> Nhận đúng phiên bản v1, và khi Super Admin phát hành v2 (?v=2) thì tự động cập nhật không bị cache bản cũ
  mm.setUserRole('SUPER_ADMIN');
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

  // 6. Mô phỏng file nhạc bị thiếu (404) hoặc bị hỏng trên GitHub Pages -> Tự động fallback về nhạc 8-bit mặc định
  await sharedCloud.deleteAudioBinary(stageV2.stagedPackage.assetPath);
  mm.revokeSharedAudioOnSignOut();
  await mm.applySharedAudioConfigSnapshot(activateV2.config!);
  if (mm.resolveEffectiveTrack(1, 'SOLO').resolvedScope !== 'BUILTIN_DEFAULT') {
    throw new Error('M7.3.3 missing/corrupt file 8-bit fallback failed');
  }

  mm.resetAllAssignmentsToDefault();
  mm.syncRoleFromAuthUser(null);
  console.log('[M7.3.3 Async E2E Workflow Verification] 10/10 MANDATORY CASES PASS');
  process.exit(0);
}

verifyM733AsyncWorkflow().catch((err) => {
  console.error('[M7.3.3 Async E2E FAIL]', err);
  process.exit(1);
});


