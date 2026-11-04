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
  { name: 'M6 Final+ Portrait, FPS, Difficulty, Audio & Eagle (21 Tests)', results: m6FinalPlusResults },
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
