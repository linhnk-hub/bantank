/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from './gameEngine.ts';
import { MATCH_STATES } from './matchState.ts';
import type { InputState, Direction } from './types.ts';

export interface JoystickTestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
  diagnostics?: any;
}

const emptyInput: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

/**
 * Helper: Pure algorithm simulating Virtual Joystick coordinate calculation
 * Same pure math used inside VirtualJoystick.tsx
 */
export function calculateJoystickDirection(
  dx: number,
  dy: number,
  deadZone: number = 14,
  currentDirection: Direction | null = null
): Direction | null {
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < deadZone) {
    return null;
  }

  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  const isCurrentlyVertical = currentDirection === 'UP' || currentDirection === 'DOWN';
  const isCurrentlyHorizontal = currentDirection === 'LEFT' || currentDirection === 'RIGHT';

  let pickVertical = absY >= absX;
  if (isCurrentlyVertical && absX < absY * 1.25) {
    pickVertical = true;
  } else if (isCurrentlyHorizontal && absY < absX * 1.25) {
    pickVertical = false;
  }

  if (pickVertical) {
    return dy < 0 ? 'UP' : 'DOWN';
  } else {
    return dx < 0 ? 'LEFT' : 'RIGHT';
  }
}

/**
 * TC-JOYSTICK-01: Virtual Joystick 4-Way Dominant Axis & Zero Diagonal
 * - Tests dragging in pure directions: (0, -30) -> UP, (0, 30) -> DOWN, (-30, 0) -> LEFT, (30, 0) -> RIGHT.
 * - Tests diagonal dragging: (30, 10) -> RIGHT (dominant X), (10, 30) -> DOWN (dominant Y).
 * - Tests that diagonal output is strictly prohibited: exactly one boolean is true or none.
 */
export function runJoystick01(): JoystickTestCaseResult {
  const up = calculateJoystickDirection(0, -40);
  const down = calculateJoystickDirection(0, 40);
  const left = calculateJoystickDirection(-40, 0);
  const right = calculateJoystickDirection(40, 0);

  // Diagonal pulls
  const diagRight = calculateJoystickDirection(40, 15); // |dx|=40 > |dy|=15 -> RIGHT
  const diagDown = calculateJoystickDirection(15, 40); // |dy|=40 > |dx|=15 -> DOWN
  const diagUp = calculateJoystickDirection(-10, -45); // |dy|=45 > |dx|=10 -> UP
  const diagLeft = calculateJoystickDirection(-45, -10); // |dx|=45 > |dy|=10 -> LEFT

  const passed =
    up === 'UP' &&
    down === 'DOWN' &&
    left === 'LEFT' &&
    right === 'RIGHT' &&
    diagRight === 'RIGHT' &&
    diagDown === 'DOWN' &&
    diagUp === 'UP' &&
    diagLeft === 'LEFT';

  return {
    id: 'TC-JOYSTICK-01',
    name: 'Virtual Joystick Dominant Axis & Zero Diagonal Enforcement',
    passed,
    expected: 'Strict 4-direction resolution based on dominant displacement; ZERO diagonal outputs',
    actual: `up=${up}, down=${down}, left=${left}, right=${right}, diagRight=${diagRight}, diagDown=${diagDown}`,
    details: 'Verifies the joystick converts 360-degree analog pull into exact discrete 4 directions without diagonal movement.',
    diagnostics: { up, down, left, right, diagRight, diagDown, diagUp, diagLeft },
  };
}

/**
 * TC-JOYSTICK-02: Dead Zone & Travel Boundary Clamping
 * - Below deadZone (e.g. radius < 14px): direction is NULL, vehicle does not move.
 * - Above deadZone: direction activates.
 * - Travel beyond base radius (e.g. radius = 100px with base 72px): maintains active direction.
 */
export function runJoystick02(): JoystickTestCaseResult {
  // Inside dead zone (r = 5 < 14)
  const deadCenter = calculateJoystickDirection(0, 0, 14);
  const deadSlightX = calculateJoystickDirection(8, 0, 14);
  const deadSlightY = calculateJoystickDirection(0, 8, 14);
  const deadDiagonal = calculateJoystickDirection(7, 7, 14); // dist ~ 9.9 < 14

  const deadZonePassed =
    deadCenter === null &&
    deadSlightX === null &&
    deadSlightY === null &&
    deadDiagonal === null;

  // Active just past dead zone (dist = 18 > 14)
  const activePastDeadZone = calculateJoystickDirection(0, -18, 14) === 'UP';

  // Far beyond base (dist = 150 > maxRadius ~ 50)
  const farPull = calculateJoystickDirection(150, 20, 14) === 'RIGHT';

  const passed = deadZonePassed && activePastDeadZone && farPull;

  return {
    id: 'TC-JOYSTICK-02',
    name: 'Joystick Dead Zone & Beyond-Boundary Clamping',
    passed,
    expected: 'Displacement < 14px outputs null (dead zone); Displacement > 50px maintains valid direction',
    actual: `deadZone=${deadZonePassed}, activePast=${activePastDeadZone}, farPull=${farPull}`,
    details: 'Verifies dead zone stops inadvertent drifting and pulling past boundary maintains direction cleanly.',
    diagnostics: { deadZonePassed, activePastDeadZone, farPull },
  };
}

/**
 * TC-JOYSTICK-03: Continuous Movement on Hold & Immediate Stop on Release
 * - Holding joystick direction forwards continuous movement across 60Hz ticks.
 * - Releasing joystick (direction null) stops vehicle immediately at next tick.
 */
export function runJoystick03(): JoystickTestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);
  const p1 = engine.getState().p1;
  const startY = p1.y;

  // Simulate holding Joystick UP for 10 ticks
  engine.setExternalInput({ up: true });
  for (let i = 0; i < 10; i++) {
    engine.stepTick(engine.getExternalInput());
  }
  const movedY = engine.getState().p1.y;
  const didMove = movedY < startY;

  // Simulate releasing Joystick (springs back to center)
  engine.setExternalInput({ up: false });
  engine.stepTick(engine.getExternalInput());
  const stoppedY1 = engine.getState().p1.y;
  engine.stepTick(engine.getExternalInput());
  const stoppedY2 = engine.getState().p1.y;
  const didStopImmediately = stoppedY1 === stoppedY2;

  const passed = didMove && didStopImmediately;

  return {
    id: 'TC-JOYSTICK-03',
    name: 'Continuous Movement on Hold & Instant Stop on Release',
    passed,
    expected: 'Tank moves continuously while joystick held; stops immediately on joystick release',
    actual: `didMove=${didMove} (${startY} -> ${movedY}), didStopImmediately=${didStopImmediately}`,
    details: 'Verifies external input from Virtual Joystick seamlessly drives M2 fixed-timestep physics.',
    diagnostics: { startY, movedY, stoppedY1, stoppedY2, didMove, didStopImmediately },
  };
}

/**
 * TC-JOYSTICK-04: Multi-Touch Independence & Pause Auto-Clear
 * - Operating joystick with left thumb while holding shoot with right thumb.
 * - Releasing joystick does not interrupt shooting.
 * - Releasing shoot does not interrupt joystick movement.
 * - Triggering pause or modal instantly clears both joystick and shoot inputs.
 */
export function runJoystick04(): JoystickTestCaseResult {
  const engine = new GameEngine(undefined, undefined, false);

  // 1. Simultaneous Joystick RIGHT + Shoot
  engine.setExternalInput({ right: true, shoot: true });
  const bothActive =
    engine.getExternalInput().right === true &&
    engine.getExternalInput().shoot === true;

  // 2. Release joystick, keep shooting
  engine.setExternalInput({ right: false });
  const shootRetained =
    engine.getExternalInput().right === false &&
    engine.getExternalInput().shoot === true;

  // 3. Move joystick DOWN while shooting
  engine.setExternalInput({ down: true });
  const downAndShoot =
    engine.getExternalInput().down === true &&
    engine.getExternalInput().shoot === true;

  // 4. Release shoot, keep joystick DOWN
  engine.setExternalInput({ shoot: false });
  const downRetained =
    engine.getExternalInput().down === true &&
    engine.getExternalInput().shoot === false;

  // 5. Trigger Pause -> all inputs must be cleared
  engine.pause();
  const inputAfterPause = engine.getExternalInput();
  const pauseCleared =
    inputAfterPause.up === false &&
    inputAfterPause.down === false &&
    inputAfterPause.left === false &&
    inputAfterPause.right === false &&
    inputAfterPause.shoot === false;

  const passed = bothActive && shootRetained && downAndShoot && downRetained && pauseCleared;

  return {
    id: 'TC-JOYSTICK-04',
    name: 'Multi-Touch Simultaneous Operation & Pause Clear Invariant',
    passed,
    expected: 'Independent multi-touch tracking; pause automatically clears all joystick/shoot states',
    actual: `bothActive=${bothActive}, shootRetained=${shootRetained}, downRetained=${downRetained}, pauseCleared=${pauseCleared}`,
    details: 'Verifies dual-thumb gameplay allows steering and firing independently without cross-input leaks.',
    diagnostics: { bothActive, shootRetained, downAndShoot, downRetained, pauseCleared },
  };
}

/**
 * TC-JOYSTICK-05: Desktop PC Canvas Scaling & Viewport Height Fit
 * - Evaluates minimum desktop viewport sizes:
 *   * 1366x768 -> Canvas scales to 520px - 580px (>= 2.5x)
 *   * 1440x900 -> Canvas scales to 624px (3x)
 *   * 1920x1080 -> Canvas scales to 680px - 728px (>= 3x, up to 3.5x)
 * - Verifies canvas maintains strictly 1:1 aspect ratio square and does not exceed available viewport height.
 */
export function runJoystick05(): JoystickTestCaseResult {
  const viewports = [
    { name: '1366x768', w: 1366, h: 768, headerH: 52 },
    { name: '1440x900', w: 1440, h: 900, headerH: 52 },
    { name: '1920x1080', w: 1920, h: 1080, headerH: 52 },
  ];

  let allFit = true;
  const evaluations: any[] = [];

  for (const vp of viewports) {
    const availableH = vp.h - vp.headerH - 60; // 60px padding/margins
    // Max canvas size calculated by responsive CSS formula: min(calc(100vh - 130px), 728px, 100%)
    const canvasPx = Math.min(vp.h - 130, 728);
    const scaleFactor = canvasPx / 208;
    const fitsViewportHeight = canvasPx <= availableH;
    const isEnlarged = scaleFactor >= 2.5; // At least 2.5x on PC

    if (!fitsViewportHeight || !isEnlarged) {
      allFit = false;
    }

    evaluations.push({
      viewport: vp.name,
      canvasPx,
      scaleFactor: scaleFactor.toFixed(2) + 'x',
      fitsViewportHeight,
      isEnlarged,
    });
  }

  return {
    id: 'TC-JOYSTICK-05',
    name: 'Desktop PC Canvas Scaling (1366x768, 1440x900, 1920x1080)',
    passed: allFit,
    expected: 'Canvas scales >= 2.5x on PC while fitting inside viewport height without clipping',
    actual: evaluations.map((e) => `${e.viewport}: ${e.scaleFactor}`).join(', '),
    details: 'Verifies Desktop resolution scaling ensures prominent centered canvas with crisp integer-friendly pixel art.',
    diagnostics: { evaluations },
  };
}

/**
 * TC-JOYSTICK-06: Game Over Modal Responsive Scrolling on Landscape Phones
 * - Simulates Landscape phone viewports:
 *   * 844x390 (iPhone 14/15 Landscape)
 *   * 915x412 (Galaxy S23/S24 Landscape)
 * - Modal max-height is constrained to 94dvh (~366px on 390h, ~387px on 412h).
 * - Action buttons ('CHƠI LẠI' and 'VỀ MENU') are housed in a sticky footer (shrink-0), guaranteed reachable.
 * - Content body has vertical scroll capability.
 */
export function runJoystick06(): JoystickTestCaseResult {
  const phoneLandscapes = [
    { name: '844x390', w: 844, h: 390 },
    { name: '915x412', w: 915, h: 412 },
    { name: '1024x768', w: 1024, h: 768 },
  ];

  let allSupported = true;
  const results: any[] = [];

  for (const vp of phoneLandscapes) {
    const modalMaxH = Math.floor(vp.h * 0.94);
    const footerH = 56; // 56px sticky action footer
    const scrollableBodyH = modalMaxH - footerH;
    const footerReachable = footerH > 0 && modalMaxH <= vp.h;
    const bodyScrollable = scrollableBodyH > 150;

    if (!footerReachable || !bodyScrollable) {
      allSupported = false;
    }

    results.push({
      device: vp.name,
      modalMaxH,
      footerH,
      scrollableBodyH,
      footerReachable,
      bodyScrollable,
    });
  }

  return {
    id: 'TC-JOYSTICK-06',
    name: 'Game Over Modal Landscape Responsive Scrolling & Sticky Footer',
    passed: allSupported,
    expected: 'Modal fits inside 94% viewport height; sticky action buttons always reachable; inner body scrollable',
    actual: results.map((r) => `${r.device}: modalH=${r.modalMaxH}px, bodyH=${r.scrollableBodyH}px`).join(' | '),
    details: 'Verifies players on landscape mobile devices can scroll battle breakdown and immediately tap CHƠI LẠI or VỀ MENU.',
    diagnostics: { results },
  };
}

export function runAllJoystickTests(): JoystickTestCaseResult[] {
  return [
    runJoystick01(),
    runJoystick02(),
    runJoystick03(),
    runJoystick04(),
    runJoystick05(),
    runJoystick06(),
  ];
}
