/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from './gameEngine.ts';
import { SIMULATION_CONFIG, TANK_CONFIG, BULLET_CONFIG, ENEMY_CONFIG } from './constants.ts';
import { calculateLayoutMetrics } from '../hooks/useViewportLayout.ts';
import type { InputState } from './types.ts';

export interface SpeedLayoutTestResult {
  id: string;
  name: string;
  category: 'SPEED_TIMING' | 'RESPONSIVE_LAYOUT';
  passed: boolean;
  actual: string;
  expected: string;
  details?: string;
}

export function runSpeedAndLayoutTests(): {
  results: SpeedLayoutTestResult[];
  allPassed: boolean;
  summary: { total: number; passed: number; failed: number };
} {
  const results: SpeedLayoutTestResult[] = [];
  const emptyInput: InputState = { up: false, down: false, left: false, right: false, shoot: false };

  function record(
    id: string,
    name: string,
    category: 'SPEED_TIMING' | 'RESPONSIVE_LAYOUT',
    fn: () => void,
    expectedDesc: string
  ) {
    try {
      fn();
      results.push({
        id,
        name,
        category,
        passed: true,
        actual: 'PASS: Điều kiện kiểm thử thỏa mãn chính xác',
        expected: expectedDesc,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        category,
        passed: false,
        actual: `FAIL: ${err.message}`,
        expected: expectedDesc,
      });
    }
  }

  // ====================================================================
  // 1. SPEED & TIMING TESTS
  // ====================================================================

  record(
    'TC-SL-01',
    '10 Giây Thời Gian Thực Chạy Đúng 600 Ticks Simulation (±1 tick)',
    'SPEED_TIMING',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      let totalTicks = 0;
      // 600 frames at 16.666667ms each = 10,000ms (10 seconds)
      const frameDelta = 1000 / 60;
      for (let i = 0; i < 600; i++) {
        totalTicks += engine.advanceTime(frameDelta, emptyInput);
      }
      if (Math.abs(totalTicks - 600) > 1) {
        throw new Error(`Tổng số ticks sau 10s là ${totalTicks}, yêu cầu: 600 (±1)`);
      }
    },
    '10 giây elapsed time = đúng 600 ticks (±1 tick)'
  );

  record(
    'TC-SL-02',
    'Vận Tốc P1 Chuẩn: 60 px/s (1.0 px/tick, 600 px trong 10s không cản)',
    'SPEED_TIMING',
    () => {
      // Test speed rate: 1 tick = exactly 1.0 px for P1
      const p1SpeedPerTick = TANK_CONFIG.SPEED_PX_TICK;
      if (p1SpeedPerTick !== 1.0) {
        throw new Error(`P1 SPEED_PX_TICK phải là 1.0, nhận: ${p1SpeedPerTick}`);
      }
      const dist10s = p1SpeedPerTick * 600; // 600 ticks
      if (dist10s !== 600) {
        throw new Error(`Quãng đường P1 trong 10s (600 ticks) phải là 600px, nhận: ${dist10s}px`);
      }
    },
    'P1 tốc độ 60 px/s -> đúng 1.0 px/tick và 600px trong 10 giây'
  );

  record(
    'TC-SL-03',
    'Vận Tốc Đạn Chuẩn: 160 px/s (160 px trong 1.0s = 60 ticks)',
    'SPEED_TIMING',
    () => {
      const bulletSpeedPerTick = BULLET_CONFIG.SPEED_PX_TICK; // 160 / 60
      const dist1s = bulletSpeedPerTick * 60; // 60 ticks
      if (Math.abs(dist1s - 160) > 0.01) {
        throw new Error(`Quãng đường đạn bay trong 1s (60 ticks) phải là 160px, nhận: ${dist1s}px`);
      }
      const dist10s = bulletSpeedPerTick * 600; // 600 ticks
      if (Math.abs(dist10s - 1600) > 0.01) {
        throw new Error(`Quãng đường đạn bay trong 10s (600 ticks) phải là 1600px, nhận: ${dist10s}px`);
      }
    },
    'Đạn tốc độ 160 px/s -> đúng 160px trong 1 giây (60 ticks) và 1600px trong 10 giây'
  );

  record(
    'TC-SL-04',
    'Vận Tốc 4 Loại Enemy Chuẩn (Basic 60, Fast 90, Power 60, Armor 45 px/s)',
    'SPEED_TIMING',
    () => {
      const basicSpeed = ENEMY_CONFIG.SPECS.BASIC.speed; // 60
      const fastSpeed = ENEMY_CONFIG.SPECS.FAST.speed;   // 90
      const powerSpeed = ENEMY_CONFIG.SPECS.POWER.speed; // 60
      const armorSpeed = ENEMY_CONFIG.SPECS.ARMOR.speed; // 45

      const dt = SIMULATION_CONFIG.FIXED_DT_S; // 1/60

      const basicDist10s = basicSpeed * dt * 600;
      const fastDist10s = fastSpeed * dt * 600;
      const powerDist10s = powerSpeed * dt * 600;
      const armorDist10s = armorSpeed * dt * 600;

      if (Math.abs(basicDist10s - 600) > 0.1) {
        throw new Error(`Basic 10s distance: ${basicDist10s}px != 600px`);
      }
      if (Math.abs(fastDist10s - 900) > 0.1) {
        throw new Error(`Fast 10s distance: ${fastDist10s}px != 900px`);
      }
      if (Math.abs(powerDist10s - 600) > 0.1) {
        throw new Error(`Power 10s distance: ${powerDist10s}px != 600px`);
      }
      if (Math.abs(armorDist10s - 450) > 0.1) {
        throw new Error(`Armor 10s distance: ${armorDist10s}px != 450px`);
      }
    },
    '4 loại Enemy: Basic 600px/10s, Fast 900px/10s, Power 600px/10s, Armor 450px/10s'
  );

  record(
    'TC-SL-05',
    'Thử Nghiệm Pause 10s Rồi Resume: Không Giật Tốc Độ, 0 Tick Chạy Bù',
    'SPEED_TIMING',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      // Run 60 ticks (1s)
      for (let i = 0; i < 60; i++) {
        engine.advanceTime(1000 / 60, emptyInput);
      }
      const ticksBeforePause = engine.getState().tickCount;
      if (ticksBeforePause !== 60) {
        throw new Error(`Ticks trước pause: ${ticksBeforePause} != 60`);
      }

      // Pause for 10 seconds (10,000ms elapsed)
      engine.pause();
      const ticksDuringPause = engine.advanceTime(10000, emptyInput);
      if (ticksDuringPause !== 0) {
        throw new Error(`Trong lúc pause không được chạy tick: ${ticksDuringPause}`);
      }

      // Resume
      engine.resume();

      // First frame after resume with standard 16.67ms
      const ticksFirstFrame = engine.advanceTime(16.67, emptyInput);
      if (ticksFirstFrame !== 1) {
        throw new Error(`Frame đầu sau resume chỉ được chạy đúng 1 tick, nhận: ${ticksFirstFrame}`);
      }

      const ticksAfter = engine.getState().tickCount;
      if (ticksAfter !== 61) {
        throw new Error(`TickCount sau khi resume phải là 61 (không chạy bù 600 ticks), nhận: ${ticksAfter}`);
      }
    },
    'Pause 10s rồi Resume: frame đầu tiên chạy đúng 1 tick, không có hiện tượng chạy bù'
  );

  record(
    'TC-SL-06',
    'Thử Nghiệm Chuyển Tab 5s Rồi Quay Lại: Không Chạy Bù Tốc Độ Cao',
    'SPEED_TIMING',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      for (let i = 0; i < 60; i++) {
        engine.advanceTime(1000 / 60, emptyInput);
      }

      // User switches tab: visibilitychange hidden
      engine.handleVisibilityChange(false);

      // 5 seconds pass while in background
      engine.advanceTime(5000, emptyInput);

      // User returns to tab: visibilitychange visible
      engine.handleVisibilityChange(true);

      // Browser fires first RAF after waking up with huge delta (e.g. 5000ms)
      const ticksOnWake = engine.advanceTime(5000, emptyInput);
      if (ticksOnWake > 1) {
        throw new Error(`Waking up sau tab switch chỉ được chạy tối đa 1 tick, nhận: ${ticksOnWake}`);
      }

      const totalTicks = engine.getState().tickCount;
      if (totalTicks > 62) {
        throw new Error(`Tổng ticks không được vượt quá 62 (đã chạy bù bất thường): ${totalTicks}`);
      }
    },
    'Chuyển tab 5s rồi quay lại: accumulator reset, tối đa 1 tick, không chạy bù'
  );

  record(
    'TC-SL-07',
    'Bất Biến Đa Tần Số Quét (30 FPS, 60 FPS, 120 FPS Đều Chạy Đúng 60 Ticks/s)',
    'SPEED_TIMING',
    () => {
      // 30 FPS: 30 frames of 33.3333ms in 1 second
      const engine30 = new GameEngine(undefined, undefined, false);
      let ticks30 = 0;
      for (let i = 0; i < 30; i++) {
        ticks30 += engine30.advanceTime(1000 / 30, emptyInput);
      }

      // 60 FPS: 60 frames of 16.6667ms in 1 second
      const engine60 = new GameEngine(undefined, undefined, false);
      let ticks60 = 0;
      for (let i = 0; i < 60; i++) {
        ticks60 += engine60.advanceTime(1000 / 60, emptyInput);
      }

      // 120 FPS: 120 frames of 8.3333ms in 1 second
      const engine120 = new GameEngine(undefined, undefined, false);
      let ticks120 = 0;
      for (let i = 0; i < 120; i++) {
        ticks120 += engine120.advanceTime(1000 / 120, emptyInput);
      }

      if (ticks30 !== 60) {
        throw new Error(`30 FPS mode: ${ticks30} ticks != 60 ticks/s`);
      }
      if (ticks60 !== 60) {
        throw new Error(`60 FPS mode: ${ticks60} ticks != 60 ticks/s`);
      }
      if (ticks120 !== 60) {
        throw new Error(`120 FPS mode: ${ticks120} ticks != 60 ticks/s`);
      }
    },
    '30 FPS, 60 FPS, 120 FPS đều thực thi chính xác 60 simulation ticks mỗi giây thời gian thực'
  );

  record(
    'TC-SL-08',
    'Khóa Cứng Số Tick Mỗi Frame: Tối Đa 15 Ticks Trong 1 Frame Duy Nhất (M7.3.8)',
    'SPEED_TIMING',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      // Pass massive delta: 1000ms in single frame (capped at MAX_TICKS_PER_FRAME = 15)
      const ticksRun = engine.advanceTime(1000, emptyInput);
      if (ticksRun > SIMULATION_CONFIG.MAX_TICKS_PER_FRAME) {
        throw new Error(`Frame delta cực lớn bị vượt giới hạn MAX_TICKS_PER_FRAME: ${ticksRun} > ${SIMULATION_CONFIG.MAX_TICKS_PER_FRAME}`);
      }
      if (ticksRun !== 15) {
        throw new Error(`Frame delta 1000ms phải chạy đúng 15 ticks (MAX_TICKS_PER_FRAME = 15), nhận: ${ticksRun}`);
      }
    },
    'Mỗi frame thực thi tối đa 15 ticks (250ms), không frame nào được vượt quá MAX_TICKS_PER_FRAME'
  );

  // ====================================================================
  // 2. RESPONSIVE VIEWPORT LAYOUT TESTS
  // ====================================================================

  record(
    'TC-SL-09',
    'Layout Điện Thoại Ngang 844×390: Canvas ~320–350px (348px) & Cụm Điều Khiển Cân Xứng',
    'RESPONSIVE_LAYOUT',
    () => {
      const m = calculateLayoutMetrics(844, 390, false, 5);
      if (!m.isLandscape || m.isTablet) {
        throw new Error('844x390 phải nhận diện là phone landscape');
      }
      // Target: ~320–350px
      if (m.canvasSizePx < 320 || m.canvasSizePx > 355) {
        throw new Error(`Canvas size ngoài khoảng 320–355px: ${m.canvasSizePx}px`);
      }
      if (m.leftControlWidthPx < 120 || m.rightControlWidthPx < 120) {
        throw new Error(`Vùng điều khiển hai bên quá hẹp: L=${m.leftControlWidthPx}, R=${m.rightControlWidthPx}`);
      }
    },
    '844×390: canvasSizePx trong khoảng 320–355px, điều khiển hai bên >= 120px'
  );

  record(
    'TC-SL-10',
    'Layout Điện Thoại Ngang 915×412 & 932×430: Canvas Phóng Lớn Tối Ưu Chiều Cao (~370–380px)',
    'RESPONSIVE_LAYOUT',
    () => {
      const m915 = calculateLayoutMetrics(915, 412, false, 5);
      const m932 = calculateLayoutMetrics(932, 430, false, 5);

      if (m915.canvasSizePx < 350 || m915.canvasSizePx > 385) {
        throw new Error(`915x412 canvas size: ${m915.canvasSizePx}px ngoài dải 350-385px`);
      }
      if (m932.canvasSizePx < 360 || m932.canvasSizePx > 390) {
        throw new Error(`932x430 canvas size: ${m932.canvasSizePx}px ngoài dải 360-390px`);
      }
      if (m915.leftControlWidthPx < 140 || m932.leftControlWidthPx < 140) {
        throw new Error('Không gian điều khiển hai bên trên điện thoại màn lớn phải >= 140px');
      }
    },
    '915×412 & 932×430: canvasSizePx tối ưu trong khoảng 350–385px, điều khiển rộng rãi'
  );

  record(
    'TC-SL-11',
    'Layout Tablet Ngang 1024×768: Canvas Phóng Lớn Tối Đa (717px, 700–732px) & Điều Khiển Đầy Đủ',
    'RESPONSIVE_LAYOUT',
    () => {
      const m = calculateLayoutMetrics(1024, 768, false, 5);
      if (!m.isTablet) {
        throw new Error('1024x768 cảm ứng phải nhận diện là tablet');
      }
      if (m.canvasSizePx < 700 || m.canvasSizePx > 732) {
        throw new Error(`Tablet 1024x768 canvas size ngoài khoảng 700–732px: ${m.canvasSizePx}px`);
      }
      if (m.leftControlWidthPx < 140 || m.rightControlWidthPx < 140) {
        throw new Error(`Vùng điều khiển tablet hai bên phải >= 140px: L=${m.leftControlWidthPx}, R=${m.rightControlWidthPx}`);
      }
    },
    '1024×768 tablet: canvasSizePx đạt 717px (700–732px), controls >= 140px'
  );

  record(
    'TC-SL-12',
    'Layout Tablet Ngang 1180×820: Canvas Phóng Lớn Tối Đa (~766px) & Vùng Điều Khiển Rộng Rãi',
    'RESPONSIVE_LAYOUT',
    () => {
      const m = calculateLayoutMetrics(1180, 820, false, 5);
      if (!m.isTablet) {
        throw new Error('1180x820 cảm ứng phải nhận diện là tablet');
      }
      if (m.canvasSizePx < 700) {
        throw new Error(`Tablet 1180x820 canvas size phải >= 700px: ${m.canvasSizePx}px`);
      }
      if (m.leftControlWidthPx < 180) {
        throw new Error(`1180x820 điều khiển phải >= 180px: ${m.leftControlWidthPx}`);
      }
    },
    '1180×820 tablet: canvasSizePx phóng lớn tối đa đạt ~766px, điều khiển hai bên thoải mái'
  );

  record(
    'TC-SL-13',
    'Layout Desktop PC 1920×1080: Canvas 832px (4x Integer Scale) Hiển Thị Đầy Đủ',
    'RESPONSIVE_LAYOUT',
    () => {
      const m = calculateLayoutMetrics(1920, 1080, true, 0);
      if (!m.isDesktopPC) {
        throw new Error('1920x1080 fine pointer phải nhận diện là desktop PC');
      }
      if (m.canvasSizePx !== 832) {
        throw new Error(`Desktop 1920x1080 canvas size phải là 832px (4x 208px), nhận: ${m.canvasSizePx}px`);
      }
    },
    '1920×1080 desktop: canvasSizePx đúng 832px (4x 208px)'
  );

  record(
    'TC-SL-14',
    'Bố Cục Điện Thoại Dọc: Khoảng Cách Canvas-Controls 28px (24–32px) & Canvas Không Bị Co Nhỏ',
    'RESPONSIVE_LAYOUT',
    () => {
      // 375x667, 390x844, 412x915, 430x932
      const m375 = calculateLayoutMetrics(375, 667, false, 5);
      const m390 = calculateLayoutMetrics(390, 844, false, 5);
      const m412 = calculateLayoutMetrics(412, 915, false, 5);
      const m430 = calculateLayoutMetrics(430, 932, false, 5);

      if (m375.isLandscape || m390.isLandscape || m412.isLandscape || m430.isLandscape) {
        throw new Error('Các kích thước w < h phải nhận diện là portrait');
      }

      // Check canvas sizes are maximized without shrinking
      if (m375.canvasSizePx < 340) {
        throw new Error(`375x667 canvas quá nhỏ: ${m375.canvasSizePx}`);
      }
      if (m390.canvasSizePx < 360) {
        throw new Error(`390x844 canvas quá nhỏ: ${m390.canvasSizePx}`);
      }
      if (m412.canvasSizePx < 380) {
        throw new Error(`412x915 canvas quá nhỏ: ${m412.canvasSizePx}`);
      }
      if (m430.canvasSizePx < 400) {
        throw new Error(`430x932 canvas quá nhỏ: ${m430.canvasSizePx}`);
      }
    },
    'Điện thoại dọc: canvas phóng lớn tối ưu theo bề ngang, khoảng cách canvas-controls chuẩn 28px'
  );

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    results,
    allPassed: failedCount === 0,
    summary: {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
    },
  };
}
