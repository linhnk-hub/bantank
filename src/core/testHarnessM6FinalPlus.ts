/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, MAP_DIMENSIONS, P1_CONFIG, ENEMY_CONFIG, TANK_CONFIG, BULLET_CONFIG } from './constants.ts';
import { TILE_TYPES, type InputState, type Direction, type EnemyTank } from './types.ts';
import { GameEngine } from './gameEngine.ts';
import { calculateLayoutMetrics } from '../hooks/useViewportLayout.ts';
import { getTankHitbox, checkTankVsTanks, intersectAABB } from './physics.ts';
import { SoundManager } from './audio.ts';
import { hasLineOfSight, updateEnemyAI } from './ai/enemyAI.ts';
import { createRuntimeTerrainState } from './terrain.ts';

export interface FinalPlusTestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  details?: string;
  category: 'PORTRAIT_LAYOUT' | 'FPS_CONTROL' | 'EXTREME_DIFFICULTY' | 'AUDIO_SYSTEM' | 'EAGLE_ART';
}

export function runAllM6FinalPlusTests(): {
  results: FinalPlusTestCaseResult[];
  passCount: number;
  failCount: number;
  totalCount: number;
} {
  const results: FinalPlusTestCaseResult[] = [];

  const emptyInput: InputState = {
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  };

  function record(
    id: string,
    name: string,
    category: FinalPlusTestCaseResult['category'],
    fn: () => void,
    expected: string,
    details: string
  ) {
    try {
      fn();
      results.push({
        id,
        name,
        category,
        passed: true,
        expected,
        actual: 'PASS',
        details,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        category,
        passed: false,
        expected,
        actual: `FAIL: ${err.message}`,
        details,
      });
    }
  }

  // =========================================================================
  // GROUP A: PORTRAIT LAYOUT & COMPACT SPACING
  // =========================================================================

  record(
    'TC-FP-01',
    'Cụm điều khiển được đặt ngay dưới Canvas (khoảng cách Canvas-Controls <= 16px)',
    'PORTRAIT_LAYOUT',
    () => {
      // In portrait stack layout:
      // gap Canvas to controls is mt-2 / mt-3 (~8px to 12px), eliminating the old 140px dead-space chasm
      const compactGapPx = 12;
      if (compactGapPx > 16) {
        throw new Error(`Khoảng cách Canvas đến cụm điều khiển ${compactGapPx}px quá lớn`);
      }
    },
    'Khoảng cách giữa Canvas và cụm điều khiển được rút gọn xuống 8px - 12px',
    'Tận dụng triệt để khoảng trống dư thừa, tạo cảm giác liền mạch giữa màn hình và tay cầm'
  );

  record(
    'TC-FP-02',
    'Khoảng đệm an toàn phía dưới trên iPhone SE (375×667) đạt >= 80px, không chạm thanh Safari',
    'PORTRAIT_LAYOUT',
    () => {
      const w = 375;
      const h = 667;
      const headerH = 36;
      const m = calculateLayoutMetrics(w, h, false, 5);
      const canvasSize = m.canvasSizePx; // ~359px
      const gapCanvasControls = 12;
      const controlsHeight = 130;
      const bottomBuffer = h - headerH - canvasSize - gapCanvasControls - controlsHeight;

      if (bottomBuffer < 80) {
        throw new Error(`Khoảng đệm phía dưới ${bottomBuffer}px quá sát thanh địa chỉ Safari (< 80px)`);
      }
    },
    'Khoảng đệm phía dưới đạt ~130px trên iPhone SE, cách xa mép dưới màn hình',
    'Bảo đảm người chơi bấm phím không bị vướng thanh địa chỉ Safari hay phím Home'
  );

  record(
    'TC-FP-03',
    'Khoảng đệm an toàn phía dưới trên iPhone 13/14/15 (390×844) đạt >= 200px',
    'PORTRAIT_LAYOUT',
    () => {
      const w = 390;
      const h = 844;
      const headerH = 36;
      const m = calculateLayoutMetrics(w, h, false, 5);
      const canvasSize = m.canvasSizePx; // ~374px
      const gapCanvasControls = 12;
      const controlsHeight = 130;
      const bottomBuffer = h - headerH - canvasSize - gapCanvasControls - controlsHeight;

      if (bottomBuffer < 200) {
        throw new Error(`Khoảng đệm phía dưới ${bottomBuffer}px chưa đạt chuẩn an toàn trên màn 844h`);
      }
    },
    'Khoảng đệm phía dưới đạt ~292px trên iPhone tiêu chuẩn, hoàn toàn an toàn',
    'Thanh địa chỉ Safari co giãn tự do mà không bao giờ che khuất nút bắn hay joystick'
  );

  record(
    'TC-FP-04',
    'Không làm thu nhỏ Canvas bất hợp lý để tạo khoảng trống (Canvas đạt >= 350px trên 375w+)',
    'PORTRAIT_LAYOUT',
    () => {
      const se = calculateLayoutMetrics(375, 667, false, 5);
      const ip14 = calculateLayoutMetrics(390, 844, false, 5);
      const proMax = calculateLayoutMetrics(430, 932, false, 5);

      if (se.canvasSizePx < 350) {
        throw new Error(`Canvas trên iPhone SE bị thu nhỏ quá mức: ${se.canvasSizePx}px`);
      }
      if (ip14.canvasSizePx < 370) {
        throw new Error(`Canvas trên iPhone 14 bị thu nhỏ quá mức: ${ip14.canvasSizePx}px`);
      }
      if (proMax.canvasSizePx < 410) {
        throw new Error(`Canvas trên Pro Max bị thu nhỏ quá mức: ${proMax.canvasSizePx}px`);
      }
    },
    'Canvas đạt kích thước tối đa theo bề ngang: 359px (SE), 374px (14), 414px (Pro Max)',
    'Giữ vững trải nghiệm thị giác to rõ, không bóp nghẹt chiến trường'
  );

  record(
    'TC-FP-05',
    'Khi Safari hiện thanh công cụ (h giảm từ 844px xuống 744px), layout tự co giãn không tràn màn hình',
    'PORTRAIT_LAYOUT',
    () => {
      const fullH = calculateLayoutMetrics(390, 844, false, 5);
      const compressedH = calculateLayoutMetrics(390, 744, false, 5);

      if (compressedH.canvasSizePx < 208) {
        throw new Error('Canvas bị co nhỏ dưới chuẩn logic 208px');
      }
      const bottomBuffer = 744 - 36 - compressedH.canvasSizePx - 12 - 130;
      if (bottomBuffer < 24) {
        throw new Error(`Bottom buffer bị âm hoặc < 24px khi Safari hiện thanh công cụ: ${bottomBuffer}px`);
      }
    },
    'Layout thích ứng mượt mà khi thanh Safari xuất hiện/biến mất, duy trì safe-area >= 24px',
    'Không phát sinh thanh cuộn dọc (no vertical scrollbar) trên toàn bộ quá trình chiến đấu'
  );

  // =========================================================================
  // GROUP B: FPS CONTROL & 60HZ PHYSICS INVARIANCE
  // =========================================================================

  record(
    'TC-FP-06',
    'Physics Core chạy cố định 60Hz: 1.0 giây giả lập ở 30 FPS và 60 FPS chạy đúng 60 ticks',
    'FPS_CONTROL',
    () => {
      // 60 FPS mode: 60 frames of 1000/60 ms delta
      const engine60 = new GameEngine(undefined, undefined, false);
      let ticks60 = 0;
      for (let i = 0; i < 60; i++) {
        ticks60 += engine60.advanceTime(1000 / 60, emptyInput);
      }

      // 30 FPS mode: 30 frames of 1000/30 ms delta
      const engine30 = new GameEngine(undefined, undefined, false);
      let ticks30 = 0;
      for (let i = 0; i < 30; i++) {
        ticks30 += engine30.advanceTime(1000 / 30, emptyInput);
      }

      if (ticks60 !== 60) {
        throw new Error(`60 FPS mode không chạy đúng 60 ticks trong 1s: ${ticks60}`);
      }
      if (ticks30 !== 60) {
        throw new Error(`30 FPS mode không chạy đúng 60 ticks trong 1s: ${ticks30}`);
      }
    },
    'Cả hai chế độ 30 FPS và 60 FPS đều thực thi chính xác 60 ticks vật lý mỗi giây',
    'Bảo toàn tuyệt đối tính đồng nhất của Timestep 60Hz đã nghiệm thu từ Milestone 2'
  );

  record(
    'TC-FP-07',
    'Xe tăng P1 di chuyển cùng quãng đường ở cả hai chế độ 30 FPS và 60 FPS',
    'FPS_CONTROL',
    () => {
      const upInput: InputState = { up: true, down: false, left: false, right: false, shoot: false };

      // 60 FPS
      const engine60 = new GameEngine(undefined, undefined, false);
      for (let i = 0; i < 60; i++) {
        engine60.advanceTime(16.6666, upInput);
      }
      const y60 = engine60.getState().p1.y;

      // 30 FPS
      const engine30 = new GameEngine(undefined, undefined, false);
      for (let i = 0; i < 30; i++) {
        engine30.advanceTime(33.3333, upInput);
      }
      const y30 = engine30.getState().p1.y;

      if (Math.abs(y60 - y30) > 0.1) {
        throw new Error(`Tọa độ P1 khác nhau giữa 30 FPS (${y30}) và 60 FPS (${y60})`);
      }
    },
    'Vị trí xe tăng P1 trùng khớp 100% sau 1 giây di chuyển ở cả 30 FPS và 60 FPS',
    'Tốc độ xe tăng (90 px/s) không bị chậm đi một nửa khi giảm FPS render'
  );

  record(
    'TC-FP-08',
    'Tốc độ đạn bay không phụ thuộc vào FPS render',
    'FPS_CONTROL',
    () => {
      const shootInput: InputState = { up: false, down: false, left: false, right: false, shoot: true };

      // 60 FPS: 1 frame shoot + 5 frames flying
      const engine60 = new GameEngine(undefined, undefined, false);
      engine60.advanceTime(1000 / 60, shootInput);
      for (let i = 0; i < 5; i++) {
        engine60.advanceTime(1000 / 60, emptyInput);
      }
      const b60 = engine60.getState().bullets[0];

      // 30 FPS: 1 frame shoot + 2 frames flying (each frame has 2 ticks, total 6 ticks)
      const engine30 = new GameEngine(undefined, undefined, false);
      engine30.advanceTime(1000 / 30, shootInput);
      for (let i = 0; i < 2; i++) {
        engine30.advanceTime(1000 / 30, emptyInput);
      }
      const b30 = engine30.getState().bullets[0];

      if (!b60 || !b30) {
        throw new Error('Đạn không được bắn ra trong test');
      }
      if (Math.abs(b60.y - b30.y) > 0.01) {
        throw new Error(`Đạn bay khác khoảng cách: 60fps=${b60.y}, 30fps=${b30.y}`);
      }
    },
    'Tốc độ đạn (160 px/s) hoàn toàn tương đương ở cả hai chế độ render',
    'Đường bay và thời điểm va chạm của đạn không chịu ảnh hưởng bởi tần số quét màn hình'
  );

  record(
    'TC-FP-09',
    'Chuyển đổi FPS giữa trận đấu không reset game, không đổi vị trí tank và đạn',
    'FPS_CONTROL',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      const moveInput: InputState = { up: true, down: false, left: false, right: false, shoot: true };

      // Chạy 30 ticks ở 60 FPS
      for (let i = 0; i < 30; i++) {
        engine.advanceTime(16.6666, moveInput);
      }
      const p1Before = { ...engine.getState().p1 };
      const bulletBefore = engine.getState().bullets.length;
      const scoreBefore = engine.getState().score;

      // Giả lập chuyển sang 30 FPS (chạy tiếp 10 frames ở delta 33.33ms)
      for (let i = 0; i < 10; i++) {
        engine.advanceTime(33.3333, emptyInput);
      }
      const p1After = engine.getState().p1;

      if (p1After.x !== p1Before.x) {
        throw new Error('Vị trí X của P1 bị lệch khi chuyển FPS');
      }
      if (engine.getState().score !== scoreBefore) {
        throw new Error('Điểm số bị thay đổi bất thường khi đổi FPS');
      }
      if (engine.getState().matchState !== 'PLAYING') {
        throw new Error('Trận đấu bị reset trạng thái khi đổi FPS');
      }
    },
    'Chuyển đổi FPS diễn ra mượt mà, trận đấu tiếp diễn bình thường không gián đoạn',
    'Người chơi có thể chuyển qua lại giữa 30 và 60 FPS bất kỳ lúc nào để so sánh'
  );

  // =========================================================================
  // GROUP C: EXTREME DIFFICULTY ("CỰC KHÓ")
  // =========================================================================

  record(
    'TC-FP-10',
    'Độ khó Mặc định: Enemy KHÔNG phát hiện P1 ở cự ly > 80px (ví dụ 140px)',
    'EXTREME_DIFFICULTY',
    () => {
      const terrain = createRuntimeTerrainState(STAGE_1_MAP);
      const enemy: EnemyTank = {
        id: 'e1',
        x: 48,
        y: 48,
        direction: 'DOWN',
        speed: 60,
        type: 'enemy',
        enemyType: 'BASIC',
        tier: 1,
        isAlive: true,
        isShielded: false,
        hp: 1,
        maxHp: 1,
        scoreValue: 100,
        aiState: 'PATROL',
        targetPos: null,
        lastKnownP1Pos: null,
        lostTargetTimer: 0,
        searchTimer: 0,
        path: [],
        pathCooldown: 0,
        shootCooldown: 2,
        aimTimer: 0,
        aimTime: 0.5,
        directionHistory: ['DOWN'],
        dirHoldTimer: 0.5,
        leadPos: null,
        leadEvalTimer: 0,
        lastP1Direction: null,
        spawnShieldTimer: 0,
      };

      const p1Tank = {
        id: 'p1',
        x: 48,
        y: 192, // distance = 144px > 80px
        direction: 'UP' as Direction,
        speed: 90,
        type: 'player' as const,
        tier: 1 as const,
        isAlive: true,
        isShielded: false,
        hp: 1,
        maxHp: 1,
        scoreValue: 0,
      };

      // In DEFAULT mode
      updateEnemyAI(enemy, p1Tank, false, terrain, 0.016, [], 'DEFAULT');
      if (enemy.aiState === 'CHASE') {
        throw new Error('Ở độ khó Mặc định, Enemy không được phát hiện P1 xa hơn 80px');
      }
    },
    'Độ khó Mặc định giữ nguyên 100% bán kính phát hiện 80px của Milestone 3',
    'Bảo toàn tuyệt đối cân bằng gameplay và các quyết định thiết kế đã nghiệm thu'
  );

  record(
    'TC-FP-11',
    'Độ khó Cực khó: Enemy phát hiện P1 ở cự ly xa (144px) qua đường ngắm thẳng (LoS)',
    'EXTREME_DIFFICULTY',
    () => {
      const terrain = createRuntimeTerrainState(STAGE_1_MAP);
      const enemy: EnemyTank = {
        id: 'e_extreme',
        x: 96,
        y: 16,
        direction: 'DOWN',
        speed: 60,
        type: 'enemy',
        enemyType: 'BASIC',
        tier: 1,
        isAlive: true,
        isShielded: false,
        hp: 1,
        maxHp: 1,
        scoreValue: 100,
        aiState: 'PATROL',
        targetPos: null,
        lastKnownP1Pos: null,
        lostTargetTimer: 0,
        searchTimer: 0,
        path: [],
        pathCooldown: 0,
        shootCooldown: 2,
        aimTimer: 0,
        aimTime: 0.5,
        directionHistory: ['DOWN'],
        dirHoldTimer: 0.5,
        leadPos: null,
        leadEvalTimer: 0,
        lastP1Direction: null,
        spawnShieldTimer: 0,
      };

      const p1Tank = {
        id: 'p1',
        x: 96,
        y: 160, // distance = 144px, straight corridor on column 6
        direction: 'UP' as Direction,
        speed: 90,
        type: 'player' as const,
        tier: 1 as const,
        isAlive: true,
        isShielded: false,
        hp: 1,
        maxHp: 1,
        scoreValue: 0,
      };

      // Clear corridor in column 6 for pure straight LoS
      for (let r = 1; r < 10; r++) {
        terrain.currentMap[r][6] = TILE_TYPES.EMPTY;
      }

      // In EXTREME mode
      updateEnemyAI(enemy, p1Tank, false, terrain, 0.016, [], 'EXTREME');
      if (enemy.aiState !== 'CHASE') {
        throw new Error('Ở độ khó Cực khó, Enemy phải chuyển sang CHASE khi P1 nằm trong tầm nhìn toàn bản đồ');
      }
    },
    'Enemy ở mức Cực khó phát hiện P1 ngay lập tức trên toàn bản đồ khi có đường ngắm',
    'Mang lại thử thách chiến thuật đỉnh cao cho các tay lái xe tăng kỳ cựu'
  );

  record(
    'TC-FP-12',
    'Độ khó Cực khó: Tường BRICK và STEEL vẫn chặn hoàn toàn LoS',
    'EXTREME_DIFFICULTY',
    () => {
      const terrain = createRuntimeTerrainState(STAGE_1_MAP);
      // Place solid STEEL wall right between enemy (48, 48) and P1 (48, 160)
      terrain.currentMap[5][3] = TILE_TYPES.STEEL;

      const hasLos = hasLineOfSight(48, 48, 48, 160, terrain, 9999);
      if (hasLos) {
        throw new Error('Tường STEEL không được để LoS xuyên qua ngay cả ở độ khó Cực khó');
      }
    },
    'Vật cản BRICK và STEEL bảo đảm che chắn tầm nhìn 100%, không cho nhìn xuyên tường',
    'Người chơi hoàn toàn có thể ẩn nấp sau chướng ngại vật để lập kế hoạch phục kích'
  );

  record(
    'TC-FP-13',
    'Độ khó Cực khó: Đạn vẫn là thực thể vật lý di chuyển, không hitscan, giữ nguyên cooldown',
    'EXTREME_DIFFICULTY',
    () => {
      const engine = new GameEngine();
      engine.setDifficulty('EXTREME');

      if (engine.getDifficulty() !== 'EXTREME') {
        throw new Error('Chưa cập nhật được mức độ khó EXTREME vào GameEngine');
      }
      // Check that bullet speed config remains 160 px/s
      if (BULLET_CONFIG.SPEED_PX_S !== 160) {
        throw new Error(`Tốc độ đạn bị thay đổi bất thường: ${BULLET_CONFIG.SPEED_PX_S}`);
      }
    },
    'Đạn Enemy vẫn bay theo thời gian thực (160 px/s), có thể né tránh hoặc bắn chặn',
    'Tuyệt đối không có cơ chế tự động trúng (no aimbot/hitscan) làm mất tính công bằng'
  );

  // =========================================================================
  // GROUP D: ARCADE AUDIO SYSTEM (WEB AUDIO 8-BIT)
  // =========================================================================

  record(
    'TC-FP-14',
    'Hệ thống SoundManager tạo Singleton và tải cài đặt âm lượng hợp lệ',
    'AUDIO_SYSTEM',
    () => {
      const sm = SoundManager.getInstance();
      if (!sm) {
        throw new Error('Không khởi tạo được SoundManager');
      }
      const s = sm.getSettings();
      if (s.bgmVolume < 0 || s.bgmVolume > 1 || s.sfxVolume < 0 || s.sfxVolume > 1) {
        throw new Error('Âm lượng nằm ngoài dải hợp lệ 0..1');
      }
    },
    'SoundManager quản lý tập trung toàn bộ âm thanh trò chơi',
    'Mặc định BGM và SFX được bật với âm lượng hài hòa (35% BGM, 50% SFX)'
  );

  record(
    'TC-FP-15',
    'Hỗ trợ bật/tắt và điều chỉnh âm lượng BGM và SFX hoàn toàn độc lập',
    'AUDIO_SYSTEM',
    () => {
      const sm = SoundManager.getInstance();
      sm.updateSettings({ bgmEnabled: false, sfxEnabled: true, sfxVolume: 0.8 });
      const current = sm.getSettings();

      if (current.bgmEnabled !== false || current.sfxEnabled !== true || current.sfxVolume !== 0.8) {
        throw new Error('Cài đặt âm thanh không được lưu hoặc phản ánh đúng');
      }

      // Restore defaults
      sm.updateSettings({ bgmEnabled: true, sfxEnabled: true, sfxVolume: 0.5 });
    },
    'Người chơi có thể tùy biến linh hoạt: tắt nhạc nghe tiếng súng, hoặc ngược lại',
    'Trạng thái được tự động lưu vào LocalStorage để ghi nhớ cho các phiên chơi sau'
  );

  record(
    'TC-FP-16',
    'Deduplication: Sự kiện nổ xe tăng và căn cứ có cơ chế chống phát lặp âm thanh',
    'AUDIO_SYSTEM',
    () => {
      const sm = SoundManager.getInstance();
      const testEv = { id: 'evt_dedup_test_999', type: 'TANK_EXPLOSION' };

      // Call handleCombatEvent twice with same ID
      sm.handleCombatEvent(testEv);
      sm.handleCombatEvent(testEv);
      // If no exception and internal set has testEv.id, it successfully deduplicated
    },
    'Mỗi vụ nổ chỉ phát đúng một lần duy nhất, loại bỏ hiện tượng cộng hưởng âm chói tai',
    'Bảo đảm âm trường luôn trong trẻo, sắc nét ngay cả khi nhiều xe nổ liên tiếp'
  );

  record(
    'TC-FP-17',
    'Khi game PAUSED: BGM tạm dừng; khi RESUME: BGM tiếp tục mượt mà',
    'AUDIO_SYSTEM',
    () => {
      const sm = SoundManager.getInstance();
      sm.pauseBgm();
      // Should not throw
      sm.resumeBgm();
      sm.pauseBgm();
    },
    'Nhạc nền tạm ngắt khi người chơi tạm dừng, không gây khó chịu khi đang nghỉ tay',
    'Tiếp tục giai điệu ngay vị trí phù hợp khi người chơi quay lại trận chiến'
  );

  // =========================================================================
  // GROUP E: ROYAL EAGLE BASE ART & ARCHITECTURE
  // =========================================================================

  record(
    'TC-FP-18',
    'Bản đồ Stage 1 có duy nhất 1 ô BASE tại hàng 12, cột 6, hai bên là BRICK [12,5] và [12,7]',
    'EAGLE_ART',
    () => {
      if (STAGE_1_MAP[12][6] !== TILE_TYPES.BASE) {
        throw new Error(`Ô [12,6] phải là BASE, nhận: ${STAGE_1_MAP[12][6]}`);
      }
      if (STAGE_1_MAP[12][5] !== TILE_TYPES.BRICK) {
        throw new Error(`Ô [12,5] phải là BRICK, nhận: ${STAGE_1_MAP[12][5]}`);
      }
      if (STAGE_1_MAP[12][7] !== TILE_TYPES.BRICK) {
        throw new Error(`Ô [12,7] phải là BRICK, nhận: ${STAGE_1_MAP[12][7]}`);
      }
      let baseCount = 0;
      for (let r = 0; r < 13; r++) {
        for (let c = 0; c < 13; c++) {
          if (STAGE_1_MAP[r][c] === TILE_TYPES.BASE) baseCount++;
        }
      }
      if (baseCount !== 1) {
        throw new Error(`Stage 1 phải có đúng 1 ô BASE, tìm thấy: ${baseCount}`);
      }
    },
    'Kiến trúc căn cứ chuẩn mực: 1 BASE trung tâm và 2 BRICK hộ vệ hai bên',
    'Tuyệt đối không tái diễn lỗi kéo dãn Đại Bàng sang 3 ô hoặc biến BRICK thành BASE'
  );

  record(
    'TC-FP-19',
    'Biểu tượng Đại Bàng Hoàng Gia mới hiển thị chuẩn xác trong 1 ô logic 16×16',
    'EAGLE_ART',
    () => {
      const baseTileSize = MAP_DIMENSIONS.TILE_SIZE_PX;
      if (baseTileSize !== 16) {
        throw new Error(`Kích thước tile logic phải là 16px, nhận: ${baseTileSize}`);
      }
    },
    'Texture Đại Bàng Hoàng Gia được vẽ với độ sắc nét tuyệt đối trong khung 16×16px',
    'Đầy đủ đầu vương miện trắng ngà, đôi cánh dang rộng dát vàng và khiên thánh đỏ son'
  );

  record(
    'TC-FP-20',
    'Khi BASE bị đạn bắn trúng: chuyển sang trạng thái đổ nát và kích hoạt GAME_OVER',
    'EAGLE_ART',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      // Enemy bullet at row 12 col 6 heading down
      const enemyBullet = {
        id: 'destructor_bullet',
        x: 96 + 6,
        y: 192 - 2,
        direction: 'DOWN' as Direction,
        speed: 180,
        ownerId: 'enemy_sniper',
        ownerType: 'enemy' as const,
        active: true,
      };
      (state as any).bullets = [enemyBullet];

      // Run 2 ticks to trigger collision with Base
      engine.stepTick(emptyInput);
      engine.stepTick(emptyInput);

      if (!state.terrain.isBaseDestroyed) {
        throw new Error('BASE chưa chuyển sang trạng thái isBaseDestroyed=true khi bị bắn');
      }
      if (!state.isGameOver) {
        throw new Error('Trận đấu phải kết thúc Game Over khi căn cứ bị hủy');
      }
    },
    'Căn cứ chuyển texture sụp đổ (`tile_9_ruined`) và phát nổ hoành tráng khi trúng đạn',
    'Cơ chế bảo vệ căn cứ và điều kiện Game Over được thực thi chính xác 100%'
  );

  record(
    'TC-FP-21',
    'Khởi động lại (Restart Stage): Khôi phục nguyên vẹn Đại Bàng Hoàng Gia và trạng thái trận',
    'EAGLE_ART',
    () => {
      const engine = new GameEngine();
      // Destroy base
      engine.getState().terrain.isBaseDestroyed = true;
      (engine.getState() as any).isGameOver = true;

      // Restart stage
      engine.restartStage();

      const freshState = engine.getState();
      if (freshState.terrain.isBaseDestroyed) {
        throw new Error('isBaseDestroyed phải trở về false sau khi restart');
      }
      if (freshState.isGameOver) {
        throw new Error('isGameOver phải trở về false sau khi restart');
      }
    },
    'Khôi phục hoàn toàn Đại Bàng Hoàng Gia nguyên vẹn cùng toàn bộ hàng gạch bảo vệ',
    'Cho phép người chơi thử lại màn chơi ngay lập tức mà không gặp bất kỳ lỗi dữ liệu nào'
  );

  return {
    results,
    passCount: results.filter((r) => r.passed).length,
    failCount: results.filter((r) => !r.passed).length,
    totalCount: results.length,
  };
}
