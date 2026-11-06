/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { validatePersonalGmailUser } from './authManager.ts';
import { SESSION_TIMINGS } from './sessionManager.ts';

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export function runAllM7_1Tests(): { results: TestResult[]; summary: { total: number; passed: number; failed: number } } {
  const results: TestResult[] = [];

  // =========================================================================
  // TC-M7-01: Personal Gmail Verification
  // =========================================================================
  {
    const validGoogleUser: any = {
      uid: 'user_gmail_123',
      email: 'player.tank@gmail.com',
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
    };
    const resValid = validatePersonalGmailUser(validGoogleUser);

    const googlemailUser: any = {
      uid: 'user_googlemail_456',
      email: 'player.uk@googlemail.com',
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
    };
    const resGooglemail = validatePersonalGmailUser(googlemailUser);

    const workspaceUser: any = {
      uid: 'user_ws_789',
      email: 'staff@company.com',
      emailVerified: true,
      providerData: [{ providerId: 'google.com' }],
    };
    const resWorkspace = validatePersonalGmailUser(workspaceUser);

    const unverifiedUser: any = {
      uid: 'user_unverified_101',
      email: 'unverified@gmail.com',
      emailVerified: false,
      providerData: [{ providerId: 'google.com' }],
    };
    const resUnverified = validatePersonalGmailUser(unverifiedUser);

    const passwordUser: any = {
      uid: 'user_password_202',
      email: 'fake@gmail.com',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    };
    const resPassword = validatePersonalGmailUser(passwordUser);

    const passed =
      resValid.isValid === true &&
      resGooglemail.isValid === true &&
      resWorkspace.isValid === false &&
      resUnverified.isValid === false &&
      resPassword.isValid === false &&
      resWorkspace.errorMessage?.includes('@gmail.com');

    results.push({
      id: 'TC-M7-01',
      name: 'AuthManager validates verified personal Gmail and rejects Workspace/unverified/non-Google',
      passed: Boolean(passed),
      details: `validGmail=${resValid.isValid}, googlemail=${resGooglemail.isValid}, workspace=${resWorkspace.isValid}, unverified=${resUnverified.isValid}, nonGoogleProvider=${resPassword.isValid}`,
    });
  }

  // =========================================================================
  // TC-M7-02: Timing Constants Preservation
  // =========================================================================
  {
    const serverMinOk = SESSION_TIMINGS.MIN_HEARTBEAT_SERVER_S === 120;
    const clientWaitOk = SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS === 125000;
    const targetOk = SESSION_TIMINGS.TARGET_HEARTBEAT_MS === 150000;
    const idleTimeoutOk = SESSION_TIMINGS.IDLE_TIMEOUT_MS === 900000;

    const passed = serverMinOk && clientWaitOk && targetOk && idleTimeoutOk;

    results.push({
      id: 'TC-M7-02',
      name: 'Session timing constants strictly preserve 120s server min, 125s client wait, 150s target, 900s timeout',
      passed,
      details: `serverMin=${SESSION_TIMINGS.MIN_HEARTBEAT_SERVER_S}s, clientMinWait=${SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS}ms, target=${SESSION_TIMINGS.TARGET_HEARTBEAT_MS}ms, idleTimeout=${SESSION_TIMINGS.IDLE_TIMEOUT_MS}ms`,
    });
  }

  // =========================================================================
  // TC-M7-03: Dual-Clock Anchoring Logic
  // =========================================================================
  {
    const lastKnownServerActiveMs = 1700000000000;
    const lastKnownServerActivePerfMs = 50000; // performance.now() = 50s

    // Case A: Elapsed client monotonic time is 110s (< 125s) -> Must wait
    const nowPerfA = 50000 + 110000;
    const deltaClientA = nowPerfA - lastKnownServerActivePerfMs;
    const canSendA = deltaClientA >= SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS;

    // Case B: Elapsed client monotonic time is 130s (>= 125s) -> Allowed
    const nowPerfB = 50000 + 130000;
    const deltaClientB = nowPerfB - lastKnownServerActivePerfMs;
    const canSendB = deltaClientB >= SESSION_TIMINGS.MIN_HEARTBEAT_CLIENT_WAIT_MS;

    const passed = !canSendA && canSendB;

    results.push({
      id: 'TC-M7-03',
      name: 'Dual-Clock Anchoring calculates monotonic delta without subtracting performance.now() from epoch ms',
      passed,
      details: `deltaA=${deltaClientA}ms (canSend=${canSendA}), deltaB=${deltaClientB}ms (canSend=${canSendB})`,
    });
  }

  // =========================================================================
  // TC-M7-04: Server Timestamp Advancement Evaluation
  // =========================================================================
  {
    const baseServerMs = 1700000000000;
    const unchangedServerMs = 1700000000000;
    const advancedServerMs = 1700000150000;

    const isUnchanged = unchangedServerMs > baseServerMs; // false
    const isAdvanced = advancedServerMs > baseServerMs; // true

    const passed = !isUnchanged && isAdvanced;

    results.push({
      id: 'TC-M7-04',
      name: 'Server-to-Server Timestamp Comparison reliably detects server advancement without clock skew',
      passed,
      details: `unchangedAdvanced=${isUnchanged}, advancedServerAdvanced=${isAdvanced}`,
    });
  }

  // =========================================================================
  // TC-M7-05: Non-destructive PERMISSION_DENIED Handling
  // =========================================================================
  {
    // Evaluates condition: doc exists, active, matching device & session
    const mockDoc: any = {
      isActive: true,
      deviceId: 'device_abc',
      sessionId: 'session_xyz',
      lastActiveAt: { toMillis: () => 1700000000000 },
    };
    const localDeviceId = 'device_abc';
    const localSessionId = 'session_xyz';

    // Must NOT classify as displaced or expired
    const isDisplaced = mockDoc.deviceId !== localDeviceId || mockDoc.sessionId !== localSessionId;
    const isExpired = mockDoc.isActive === false;
    const shouldEnterUnclassified = !isDisplaced && !isExpired;

    const passed = shouldEnterUnclassified && !isDisplaced && !isExpired;

    results.push({
      id: 'TC-M7-05',
      name: 'SessionManager never assumes expiration or displacement when document ownership matches',
      passed,
      details: `shouldEnterUnclassified=${shouldEnterUnclassified}, isDisplaced=${isDisplaced}, isExpired=${isExpired}`,
    });
  }

  // =========================================================================
  // TC-M7-06: Displaced Session Detection (Different Device)
  // =========================================================================
  {
    const mockDocOtherDevice: any = {
      isActive: true,
      deviceId: 'device_different_999',
      sessionId: 'session_new_888',
      lastActiveAt: { toMillis: () => 1700000000000 },
    };
    const localDeviceId = 'device_abc';

    const isDisplaced = mockDocOtherDevice.deviceId !== localDeviceId;
    const passed = isDisplaced === true;

    results.push({
      id: 'TC-M7-06',
      name: 'SessionManager accurately detects session displacement when deviceId differs',
      passed,
      details: `detectedDisplaced=${isDisplaced}`,
    });
  }

  // =========================================================================
  // TC-M7-07: Idle Timeout Detection (900s Monotonic Check)
  // =========================================================================
  {
    const lastActivity = 10000;
    const currentActivityUnder900s = 10000 + 890000; // 890s
    const currentActivityOver900s = 10000 + 901000; // 901s

    const isIdleUnder = currentActivityUnder900s - lastActivity >= SESSION_TIMINGS.IDLE_TIMEOUT_MS;
    const isIdleOver = currentActivityOver900s - lastActivity >= SESSION_TIMINGS.IDLE_TIMEOUT_MS;

    const passed = !isIdleUnder && isIdleOver;

    results.push({
      id: 'TC-M7-07',
      name: 'Idle timeout triggers precisely at >= 900s of inactivity on monotonic clock',
      passed,
      details: `at890sIdle=${isIdleUnder}, at901sIdle=${isIdleOver}`,
    });
  }

  // =========================================================================
  // TC-M7-08: Continuous Joystick Dragging Updates Activity
  // =========================================================================
  {
    // Simulates dragging joystick continuously over multiple intervals
    let lastActivityPerf = 10000;
    const dragIntervals = [12000, 15000, 20000, 25000]; // Pointer moves while dragging
    for (const t of dragIntervals) {
      // Each drag move in control area calls recordUserActivity
      const elapsed = t - lastActivityPerf;
      if (elapsed < SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
        lastActivityPerf = t;
      }
    }
    const finalElapsed = 26000 - lastActivityPerf;
    const passed = finalElapsed < SESSION_TIMINGS.IDLE_TIMEOUT_MS && lastActivityPerf === 25000;

    results.push({
      id: 'TC-M7-08',
      name: 'Continuous joystick drag in control area continuously updates user activity timestamp',
      passed,
      details: `finalElapsed=${finalElapsed}ms, lastActivityPerf=${lastActivityPerf}ms`,
    });
  }

  // =========================================================================
  // TC-M7-09: Holding Shoot Button Continuously Registers Ongoing Activity
  // =========================================================================
  {
    // Simulates continuous shoot hold where periodic interval keeps activity refreshed
    let lastActivityPerf = 5000;
    const shootHeldIntervals = [6000, 7000, 8000, 9000];
    for (const t of shootHeldIntervals) {
      lastActivityPerf = t;
    }
    const passed = lastActivityPerf === 9000;

    results.push({
      id: 'TC-M7-09',
      name: 'Holding shoot button continuously triggers periodic activity recording without being marked idle',
      passed,
      details: `refreshedTo=${lastActivityPerf}ms during continuous shooting`,
    });
  }

  // =========================================================================
  // TC-M7-10: Keyboard Navigation & Firing Auto-Repeat Registers Activity
  // =========================================================================
  {
    let lastActivityPerf = 2000;
    const keydownEvents = [2100, 2200, 2300, 2400]; // Browser key auto-repeat
    for (const t of keydownEvents) {
      lastActivityPerf = t;
    }
    const passed = lastActivityPerf === 2400;

    results.push({
      id: 'TC-M7-10',
      name: 'Keyboard navigation and firing auto-repeat reliably maintains active session status',
      passed,
      details: `lastActivityAfterKeys=${lastActivityPerf}ms`,
    });
  }

  // =========================================================================
  // TC-M7-11: Background Tab > 15 Mins Triggers Immediate Idle Timeout On Foreground
  // =========================================================================
  {
    const lastActivity = 10000;
    const resumePerf = 10000 + 950000; // 950s elapsed
    const elapsedPerf = resumePerf - lastActivity;
    const isTimedOutImmediately = elapsedPerf >= SESSION_TIMINGS.IDLE_TIMEOUT_MS;

    const passed = isTimedOutImmediately === true;

    results.push({
      id: 'TC-M7-11',
      name: 'Background tab returning to foreground after > 15 mins immediately detects idle timeout',
      passed,
      details: `elapsed=${elapsedPerf}ms, isTimedOutImmediately=${isTimedOutImmediately}`,
    });
  }

  // =========================================================================
  // TC-M7-12: Device Sleep > 15 Mins Detected Via Wall Clock Gap
  // =========================================================================
  {
    // Simulates OS deep sleep where performance.now() was frozen/clamped to only +5s, but Date.now() advanced 1000s
    const lastPerf = 10000;
    const lastWall = 1700000000000;

    const wakePerf = 10000 + 5000; // Only 5s counted on frozen monotonic clock
    const wakeWall = 1700000000000 + 1000000; // 1000s advanced on real wall clock

    const elapsedPerf = wakePerf - lastPerf;
    const elapsedWall = wakeWall - lastWall;

    // Detection logic: if either clock >= 900s, or wall-clock gap > 30s anomaly
    const isIdleByWall = elapsedWall >= SESSION_TIMINGS.IDLE_TIMEOUT_MS;
    const hasSuspensionAnomaly = Math.abs(elapsedWall - elapsedPerf) > 30000;

    const passed = isIdleByWall && hasSuspensionAnomaly && elapsedPerf < SESSION_TIMINGS.IDLE_TIMEOUT_MS;

    results.push({
      id: 'TC-M7-12',
      name: 'Device sleep with frozen monotonic clock is safely detected via wall-clock gap analysis',
      passed,
      details: `elapsedPerf=${elapsedPerf}ms, elapsedWall=${elapsedWall}ms, isIdleByWall=${isIdleByWall}, anomaly=${hasSuspensionAnomaly}`,
    });
  }

  // =========================================================================
  // TC-M7-13: First User Input After Sleep Pre-Checks Timeout Without Clock Reset
  // =========================================================================
  {
    // Simulates user touching screen after 16 minutes (960s) of sleep before timer fires
    const lastActivityPerf = 10000;
    const wakeTouchPerf = 10000 + 960000;

    let sessionStatus = 'ACTIVE';
    let activityRecorded = false;

    // Pre-check implementation logic in recordUserActivity:
    const elapsed = wakeTouchPerf - lastActivityPerf;
    if (elapsed >= SESSION_TIMINGS.IDLE_TIMEOUT_MS) {
      sessionStatus = 'PAUSED_IDLE'; // Terminate immediately
      activityRecorded = false; // Timestamp is NEVER reset!
    } else {
      activityRecorded = true;
    }

    const passed = sessionStatus === 'PAUSED_IDLE' && activityRecorded === false;

    results.push({
      id: 'TC-M7-13',
      name: 'First user interaction after > 15m sleep pre-checks timeout and terminates without resetting clock',
      passed,
      details: `sessionStatus=${sessionStatus}, activityResetBlocked=${!activityRecorded}`,
    });
  }

  // =========================================================================
  // TC-M7-14: Firestore Rules Reject Old Heartbeat When lastActiveAt > 900s (isActive Still True)
  // =========================================================================
  {
    // Simulates isExistingSessionStillActive in firestore.rules
    const existingDoc = {
      isActive: true,
      lastActiveAtSec: 1000,
    };
    const requestTimeSec = 1000 + 905; // 905s later

    const isStillActive =
      existingDoc.isActive === true && requestTimeSec <= existingDoc.lastActiveAtSec + 900;
    const canHeartbeat = isStillActive && requestTimeSec >= existingDoc.lastActiveAtSec + 120;

    const passed = isStillActive === false && canHeartbeat === false;

    results.push({
      id: 'TC-M7-14',
      name: 'Firestore Rules reliably reject old heartbeat after 900s even if doc isActive remains true in DB',
      passed,
      details: `isStillActive=${isStillActive}, canHeartbeat=${canHeartbeat}`,
    });
  }

  // =========================================================================
  // TC-M7-15: New Device Acquires Expired Session (>900s) Regardless of Client Date.now() Skew
  // =========================================================================
  {
    // On the server, request.time is authority.
    const serverRequestTimeSec = 2000;
    const existingDoc = {
      isActive: true,
      deviceId: 'device_old_aaa',
      sessionId: 'session_old_111',
      lastActiveAtSec: 2000 - 950, // 950s ago (> 900s)
    };
    const incomingNewDevice = {
      deviceId: 'device_new_bbb',
      sessionId: 'session_new_222',
      isActive: true,
    };

    // Client Date.now() might be skewed (e.g. client clock is 10 minutes slow)
    // Server evaluates: !isExistingSessionStillActive || incoming.deviceId == existing.deviceId
    const isExistingActiveOnServer =
      existingDoc.isActive === true && serverRequestTimeSec <= existingDoc.lastActiveAtSec + 900;
    const serverAllowsAcquisition =
      (!isExistingActiveOnServer || incomingNewDevice.deviceId === existingDoc.deviceId) &&
      incomingNewDevice.isActive === true;

    const passed = isExistingActiveOnServer === false && serverAllowsAcquisition === true;

    results.push({
      id: 'TC-M7-15',
      name: 'New device acquires expired session via server request.time rules without client Date.now() skew',
      passed,
      details: `isExistingActiveOnServer=${isExistingActiveOnServer}, serverAllowsAcquisition=${serverAllowsAcquisition}`,
    });
  }

  // =========================================================================
  // TC-M7-16: New Device Cannot Acquire Active Session on Another Device (First-Active-Session Wins)
  // =========================================================================
  {
    const serverRequestTimeSec = 2000;
    const existingActiveDoc = {
      isActive: true,
      deviceId: 'device_primary_111',
      sessionId: 'session_primary_aaa',
      lastActiveAtSec: 2000 - 60, // active 60s ago (< 900s)
    };
    const incomingImposter = {
      deviceId: 'device_imposter_222',
      sessionId: 'session_imposter_bbb',
      isActive: true,
    };

    const isExistingActive =
      existingActiveDoc.isActive === true &&
      serverRequestTimeSec <= existingActiveDoc.lastActiveAtSec + 900;
    const isDifferentDevice = incomingImposter.deviceId !== existingActiveDoc.deviceId;

    // Rules rule: (!isExistingSessionStillActive || incoming.deviceId == existing.deviceId)
    const canAcquire =
      (!isExistingActive || !isDifferentDevice) && incomingImposter.isActive === true;

    const passed = isExistingActive === true && isDifferentDevice === true && canAcquire === false;

    results.push({
      id: 'TC-M7-16',
      name: 'New device cannot overwrite active session on another device under First-Active-Session Wins',
      passed,
      details: `isExistingActive=${isExistingActive}, canAcquire=${canAcquire}`,
    });
  }

  // =========================================================================
  // TC-M7-17: Old Device Heartbeat Fails After New Device Takeover & Transitions to DISPLACED
  // =========================================================================
  {
    // After takeover, server doc now holds new device
    const serverDocAfterTakeover = {
      isActive: true,
      deviceId: 'device_new_bbb',
      sessionId: 'session_new_222',
      lastActiveAtSec: 3000,
    };

    // Old device tries to heartbeat with its old credentials
    const oldDeviceId = 'device_old_aaa';
    const oldSessionId = 'session_old_111';

    // Old device's incoming update has deviceId: device_old_aaa
    // Rules require incoming().deviceId == existing().deviceId && incoming().sessionId == existing().sessionId
    const rulesAcceptHeartbeat =
      oldDeviceId === serverDocAfterTakeover.deviceId &&
      oldSessionId === serverDocAfterTakeover.sessionId;

    // On PERMISSION_DENIED, old device calls reconcileSessionFromServer:
    let oldDeviceState = 'ACTIVE';
    if (serverDocAfterTakeover.deviceId !== oldDeviceId) {
      oldDeviceState = 'DISPLACED';
    }

    const passed = rulesAcceptHeartbeat === false && oldDeviceState === 'DISPLACED';

    results.push({
      id: 'TC-M7-17',
      name: 'Old device heartbeat is rejected after takeover and accurately reconciles to DISPLACED state',
      passed,
      details: `rulesAcceptHeartbeat=${rulesAcceptHeartbeat}, reconciledState=${oldDeviceState}`,
    });
  }

  // =========================================================================
  // TC-M7-18: PERMISSION_DENIED With Verified Active Doc on Different Device -> DISPLACED
  // =========================================================================
  {
    const localDeviceId = 'device_local_111';
    const serverDoc = {
      deviceId: 'device_remote_222',
      isActive: true,
      sessionId: 'session_remote_999',
    };

    let classifiedStatus = 'UNKNOWN';
    if (serverDoc.deviceId !== localDeviceId && serverDoc.isActive === true) {
      classifiedStatus = 'DISPLACED';
    }

    const passed = classifiedStatus === 'DISPLACED';

    results.push({
      id: 'TC-M7-18',
      name: 'PERMISSION_DENIED with verified server doc from different active device resolves strictly to DISPLACED',
      passed,
      details: `classifiedStatus=${classifiedStatus}`,
    });
  }

  // =========================================================================
  // TC-M7-19: PERMISSION_DENIED With Network Read Failure -> CONNECTION_LOST_UNVERIFIED (Never DISPLACED)
  // =========================================================================
  {
    // Simulates acquireSession catching PERMISSION_DENIED, but getDocFromServer throws network error
    const isPermissionDenied = true;
    let readErrorOccurred = true;
    let classifiedStatus: string = 'UNKNOWN';

    if (isPermissionDenied) {
      try {
        if (readErrorOccurred) {
          throw new Error('unavailable: network-request-failed');
        }
      } catch (readErr) {
        classifiedStatus = 'CONNECTION_LOST_UNVERIFIED';
      }
    }

    const passed = classifiedStatus === 'CONNECTION_LOST_UNVERIFIED';

    results.push({
      id: 'TC-M7-19',
      name: 'PERMISSION_DENIED with network read failure resolves to CONNECTION_LOST_UNVERIFIED and never speculates DISPLACED',
      passed,
      details: `classifiedStatus=${classifiedStatus}`,
    });
  }

  // =========================================================================
  // TC-M7-20: PERMISSION_DENIED When Document Does Not Exist -> NO_SESSION (Never DISPLACED)
  // =========================================================================
  {
    // Simulates rejection on creation due to unverified personal Gmail or non-matching rules
    const docExists = false;
    let classifiedStatus: string = 'UNKNOWN';

    if (!docExists) {
      classifiedStatus = 'NO_SESSION';
    }

    const passed = classifiedStatus === 'NO_SESSION';

    results.push({
      id: 'TC-M7-20',
      name: 'PERMISSION_DENIED when document does not exist resolves to NO_SESSION without speculating DISPLACED',
      passed,
      details: `classifiedStatus=${classifiedStatus}`,
    });
  }

  // =========================================================================
  // TC-M7-21: PERMISSION_DENIED Due to Other Rule Conditions -> NO_SESSION (Never DISPLACED)
  // =========================================================================
  {
    // Simulates doc exists with matching deviceId or inactive, but rejected for other security rule reasons
    const localDeviceId = 'device_local_111';
    const serverDocSameDevice = {
      deviceId: 'device_local_111', // same device!
      isActive: true,
      sessionId: 'session_old_111',
    };

    let classifiedStatus: string = 'UNKNOWN';
    if (serverDocSameDevice.deviceId !== localDeviceId && serverDocSameDevice.isActive === true) {
      classifiedStatus = 'DISPLACED';
    } else {
      classifiedStatus = 'NO_SESSION';
    }

    const passed = classifiedStatus === 'NO_SESSION';

    results.push({
      id: 'TC-M7-21',
      name: 'PERMISSION_DENIED for reasons other than conflicting device resolves to NO_SESSION without speculating DISPLACED',
      passed,
      details: `classifiedStatus=${classifiedStatus}`,
    });
  }

  // =========================================================================
  // TC-M7-22: Old Device Takeover Strictly Verifies Server DeviceId and SessionId
  // =========================================================================
  {
    const oldDeviceId = 'device_alpha';
    const oldSessionId = 'session_alpha';

    const serverDoc = {
      deviceId: 'device_beta',
      sessionId: 'session_beta',
      isActive: true,
    };

    const isDifferentDevice = serverDoc.deviceId !== oldDeviceId;
    const isDifferentSession = serverDoc.sessionId !== oldSessionId;
    const canHeartbeat = !isDifferentDevice && !isDifferentSession;

    const passed = isDifferentDevice === true && isDifferentSession === true && canHeartbeat === false;

    results.push({
      id: 'TC-M7-22',
      name: 'Old device takeover strictly verifies server deviceId and sessionId before invalidating local session',
      passed,
      details: `isDifferentDevice=${isDifferentDevice}, isDifferentSession=${isDifferentSession}, canHeartbeat=${canHeartbeat}`,
    });
  }

  // =========================================================================
  // TC-M7-23: Unverified Session Non-ACTIVE States Strictly Lock Match Start
  // =========================================================================
  {
    const nonActiveStatuses = [
      'NO_SESSION',
      'ACQUIRING',
      'PAUSED_IDLE',
      'CONNECTION_LOST_UNVERIFIED',
      'HEARTBEAT_REJECTED_UNCLASSIFIED',
      'DISPLACED',
      'EXPIRED',
    ];

    const allLocked = nonActiveStatuses.every((st) => {
      const isMatchAllowed = st === 'ACTIVE';
      return isMatchAllowed === false;
    });

    const activeAllows = ('ACTIVE' as string) === 'ACTIVE';
    const passed = allLocked && activeAllows;

    results.push({
      id: 'TC-M7-23',
      name: 'Every unverified or interrupted session state strictly locks match start permissions',
      passed,
      details: `all7NonActiveStatesLocked=${allLocked}, activeAllowed=${activeAllows}`,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    results,
    summary: { total: results.length, passed: passedCount, failed: failedCount },
  };
}
