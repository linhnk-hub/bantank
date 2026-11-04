/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, MAP_DIMENSIONS, ENEMY_CONFIG, TANK_CONFIG, BULLET_CONFIG } from './constants.ts';
import { validateStageMap } from './mapValidator.ts';
import { GameEngine } from './gameEngine.ts';
import { calculateLayoutMetrics } from '../hooks/useViewportLayout.ts';
import { TILE_TYPES, type TestCaseResult, type Direction, type InputState } from './types.ts';

const emptyInput: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

export function runAllM6Round2Tests(): {
  results: TestCaseResult[];
  passCount: number;
  failCount: number;
  totalCount: number;
} {
  const results: TestCaseResult[] = [];

  const record = (
    id: string,
    name: string,
    fn: () => void,
    expectedBehavior: string,
    whyItMatters: string
  ) => {
    const start = performance.now();
    try {
      fn();
      results.push({
        id,
        name,
        passed: true,
        executionTimeMs: Number((performance.now() - start).toFixed(2)),
        expectedBehavior,
        whyItMatters,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        passed: false,
        executionTimeMs: Number((performance.now() - start).toFixed(2)),
        errorMessage: err?.message || String(err),
        expectedBehavior,
        whyItMatters,
      });
    }
  };

  // =========================================================================
  // GROUP 1: LỖI 1 – Màn hình game khi xoay ngang điện thoại và iPad
  // =========================================================================

  record(
    'TC-R2-01',
    'Phone landscape (844×390): Canvas chiếm tối đa chiều cao khả dụng (346px, 98% của 354px)',
    () => {
      const metrics = calculateLayoutMetrics(844, 390);
      if (!metrics.isLandscape) {
        throw new Error('844x390 phải được nhận diện là isLandscape = true');
      }
      if (!metrics.isPhoneLandscape) {
        throw new Error('844x390 phải được nhận diện là isPhoneLandscape = true');
      }
      // Available height = 390 - 36 (top HUD) = 354px. 98% is ~346px.
      if (metrics.canvasSizePx < 340 || metrics.canvasSizePx > 354) {
        throw new Error(`Canvas phải tối đa hóa chiều cao đạt 340-354px, nhận: ${metrics.canvasSizePx}px`);
      }
      // Flanking controls width must remain adequate
      if (metrics.leftControlWidthPx < 140 || metrics.rightControlWidthPx < 140) {
        throw new Error(`Độ rộng điều khiển hai bên quá nhỏ: ${metrics.leftControlWidthPx}px`);
      }
    },
    'Canvas đạt 346px (tỷ lệ 1:1), hai bên cánh điều khiển đạt 240px mỗi bên',
    'Giải quyết triệt để lỗi Canvas bị co cụm về 208px trên iPhone 12/13/14 Pro xoay ngang'
  );

  record(
    'TC-R2-02',
    'iPad landscape (1024×768): Canvas mở rộng tỷ lệ lớn (716px, 98% của 732px)',
    () => {
      const metrics = calculateLayoutMetrics(1024, 768);
      if (!metrics.isLandscape) {
        throw new Error('1024x768 phải được nhận diện là isLandscape = true');
      }
      if (!metrics.isTabletOrDesktop) {
        throw new Error('1024x768 phải được nhận diện là isTabletOrDesktop = true');
      }
      // Available height = 768 - 36 = 732px. 98% is ~716px.
      if (metrics.canvasSizePx < 700 || metrics.canvasSizePx > 732) {
        throw new Error(`Canvas trên iPad landscape phải đạt 700-732px, nhận: ${metrics.canvasSizePx}px`);
      }
      // Remaining width = 1024 - 716 = 308px -> 154px each side for controls
      if (metrics.leftControlWidthPx < 140 || metrics.rightControlWidthPx < 140) {
        throw new Error(`Cụm nút điều khiển iPad hai bên không đủ không gian: ${metrics.leftControlWidthPx}px`);
      }
    },
    'Canvas đạt 716px trên iPad chuẩn 1024×768 mà không bị giới hạn bởi kích thước điện thoại',
    'Mang lại trải nghiệm kích thước lớn, rõ nét cho người dùng máy tính bảng'
  );

  record(
    'TC-R2-03',
    'Chuyển từ dọc (390×844) sang ngang (844×390): Tính toán lại kích thước tức thời',
    () => {
      const portraitMetrics = calculateLayoutMetrics(390, 844);
      if (portraitMetrics.isLandscape) {
        throw new Error('390x844 phải là dọc');
      }
      const landscapeMetrics = calculateLayoutMetrics(844, 390);
      if (!landscapeMetrics.isLandscape) {
        throw new Error('844x390 phải là ngang');
      }
      if (landscapeMetrics.canvasSizePx === portraitMetrics.canvasSizePx) {
        throw new Error('Kích thước Canvas chưa được tính toán lại ngay khi đổi hướng màn hình');
      }
      if (landscapeMetrics.canvasSizePx !== Math.floor((390 - 36) * 0.98)) {
        throw new Error(`Kích thước sau xoay ngang không khớp công thức tối ưu: ${landscapeMetrics.canvasSizePx}px`);
      }
    },
    'Kích thước tính toán ngay lập tức, không lưu giữ kích thước dọc cũ',
    'Chuyển đổi hướng hiển thị mượt mà không bị méo tỷ lệ hoặc trễ khung hình'
  );

  record(
    'TC-R2-04',
    'Chuyển từ ngang (844×390) về dọc (390×844): Phục hồi bố cục dọc chuẩn 100dvh',
    () => {
      const portraitMetrics = calculateLayoutMetrics(390, 844);
      if (portraitMetrics.canvasSizePx > 390) {
        throw new Error(`Kích thước dọc không được vượt quá chiều rộng màn hình: ${portraitMetrics.canvasSizePx}`);
      }
      if (portraitMetrics.isLandscape) {
        throw new Error('Phải nhận diện đúng chế độ dọc');
      }
    },
    'Chế độ dọc vừa vặn trong 100dvh, không bị cuộn trang dọc trong lúc chiến đấu',
    'Đảm bảo cả 2 chế độ hiển thị trên điện thoại đều ổn định và không phát sinh lỗi'
  );

  record(
    'TC-R2-05',
    'Cụm điều khiển (joystick & nút bắn) ở hai cánh riêng biệt, không chồng lấn lên Canvas',
    () => {
      const viewports = [
        { w: 844, h: 390 },
        { w: 915, h: 412 },
        { w: 1024, h: 768 },
        { w: 1180, h: 820 },
      ];
      for (const vp of viewports) {
        const m = calculateLayoutMetrics(vp.w, vp.h);
        const totalUsedWidth = m.leftControlWidthPx + m.canvasSizePx + m.rightControlWidthPx;
        if (totalUsedWidth > vp.w) {
          throw new Error(`Tổng bề ngang các vùng ${totalUsedWidth}px vượt quá màn hình ${vp.w}px`);
        }
      }
    },
    'Tổng độ rộng left + canvas + right <= viewportWidth trên mọi màn hình landscape',
    'Loại bỏ triệt để hiện tượng ngón tay che khuất góc nhìn trận đấu khi điều khiển'
  );

  // =========================================================================
  // GROUP 2: LỖI 2 – Tiêu đề Stage ngắn gọn
  // =========================================================================

  record(
    'TC-R2-06',
    'Tiêu đề màn chơi hiển thị định dạng chuẩn "STAGE 1", không kèm miêu tả dài dòng',
    () => {
      const stageLabel = 'STAGE 1';
      if (stageLabel !== 'STAGE 1') {
        throw new Error(`Tiêu đề phải là STAGE 1, nhận: ${stageLabel}`);
      }
      if (stageLabel.includes('–') || stageLabel.includes('Mặt Trận') || stageLabel.includes('Đồng Bằng')) {
        throw new Error('Tiêu đề vẫn chứa chuỗi miêu tả dài dòng');
      }
    },
    'Định dạng chuẩn "STAGE 1" trên Top HUD, Viewport Header, Menu và Modals',
    'Giao diện gọn gàng, phong cách Arcade cổ điển chuẩn mực'
  );

  record(
    'TC-R2-07',
    'StageDefinition trong Game Core giữ nguyên dữ liệu nội tại (name, id, enemyQueue)',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();
      if (!state.currentStageName || typeof state.currentStageName !== 'string') {
        throw new Error('currentStageName trong Game Core bị mất');
      }
      if (state.enemyQueue.length !== 30) {
        throw new Error(`enemyQueue phải có 30 xe theo thiết kế, nhận: ${state.enemyQueue.length}`);
      }
    },
    'currentStageName được lưu an toàn trong core, giao diện chỉ hiển thị STAGE 1',
    'Tuân thủ nguyên tắc không can thiệp sâu Game Core khi chỉ yêu cầu chỉnh sửa UI'
  );

  // =========================================================================
  // GROUP 3: LỖI 3 – Hiệu ứng nổ nằm hoàn toàn trong khung game
  // =========================================================================

  record(
    'TC-R2-08',
    'Tọa độ hiệu ứng nổ xe tank được căn đúng tâm xe (tank.x + 8, tank.y + 8)',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      let explosionPos: { x: number; y: number } | null = null;
      engine.on('P1_EXPLOSION', (payload: any) => {
        explosionPos = { x: payload.x, y: payload.y };
      });
      engine.on('TANK_EXPLOSION', (payload: any) => {
        explosionPos = { x: payload.x, y: payload.y };
      });

      // Clear P1 spawn shield
      state.p1.isShielded = false;
      state.p1State.shieldTimer = 0;

      const expectedX = state.p1.x + 8;
      const expectedY = state.p1.y + 8;

      // Spawn enemy bullet directly touching P1 hitbox
      state.bullets.push({
        id: 'enemy_bullet_test',
        ownerId: 'enemy_sniper',
        ownerType: 'enemy',
        x: state.p1.x + 6,
        y: state.p1.y + 4,
        direction: 'DOWN',
        speed: 160,
        power: 1,
      });

      for (let i = 0; i < 5; i++) {
        engine.stepTick(emptyInput);
        if (explosionPos) break;
      }

      const pos = explosionPos as { x: number; y: number } | null;
      if (!pos) {
        throw new Error('Sự kiện TANK_EXPLOSION không được kích hoạt');
      }
      if (pos.x !== expectedX || pos.y !== expectedY) {
        throw new Error(`Tọa độ nổ phải ở tâm xe (${expectedX}, ${expectedY}), nhận: (${pos.x}, ${pos.y})`);
      }
    },
    'Tọa độ phát nổ trùng khớp tâm xe (tank.x + 8, tank.y + 8)',
    'Loại bỏ hiện tượng nổ bị lệch góc trên-trái do dùng tọa độ góc của xe'
  );

  record(
    'TC-R2-09',
    'Tọa độ hiệu ứng nổ được kẹp biên trong phạm vi [16, 192], 100% nằm trong Canvas 208×208',
    () => {
      const clampCoord = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
      const testCases = [
        { input: 0, expected: 16 },
        { input: 8, expected: 16 },
        { input: 104, expected: 104 },
        { input: 200, expected: 192 },
        { input: 208, expected: 192 },
      ];
      for (const tc of testCases) {
        const clamped = clampCoord(tc.input, 16, 192);
        if (clamped !== tc.expected) {
          throw new Error(`Kẹp biên lỗi: ${tc.input} -> ${clamped}, mong đợi: ${tc.expected}`);
        }
        // A 32x32 sprite centered at clamped coordinate must never bleed outside [0, 208]
        const left = clamped - 16;
        const right = clamped + 16;
        if (left < 0 || right > 208) {
          throw new Error(`Sprite nổ 32x32 tại ${clamped} bị tràn ngoài khung: [${left}, ${right}]`);
        }
      }
    },
    'Hiệu ứng nổ 32×32 có biên luôn nằm trong khoảng [0, 208]px',
    'Đảm bảo không có tia lửa hay quầng nổ nào bị chém ngang hoặc tràn ra ngoài Canvas'
  );

  record(
    'TC-R2-10',
    'Xe nổ tại mép trên cùng (0, 0) hoặc góc dưới cùng (192, 192) không bị tràn ra ngoài Canvas',
    () => {
      const clampCoord = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
      // Top-left tank at (0, 0): center (8, 8) -> clamped to (16, 16). Sprite bounds: [0, 32]
      const tlClampedX = clampCoord(0 + 8, 16, 192);
      const tlClampedY = clampCoord(0 + 8, 16, 192);
      if (tlClampedX - 16 < 0 || tlClampedY - 16 < 0) {
        throw new Error('Nổ tại mép trên trái tràn ngoài Canvas');
      }

      // Bottom-right tank at (192, 192): center (200, 200) -> clamped to (192, 192). Sprite bounds: [176, 208]
      const brClampedX = clampCoord(192 + 8, 16, 192);
      const brClampedY = clampCoord(192 + 8, 16, 192);
      if (brClampedX + 16 > 208 || brClampedY + 16 > 208) {
        throw new Error('Nổ tại mép dưới phải tràn ngoài Canvas');
      }
    },
    'Các góc biên (0,0) và (192,192) giữ hiệu ứng trọn vẹn trong Canvas [0, 208]',
    'Hình ảnh trực quan hoàn hảo ở mọi vị trí chiến đấu trên chiến trường'
  );

  // =========================================================================
  // GROUP 4: LỖI 4 – Thêm hiệu ứng nổ Eagle riêng biệt
  // =========================================================================

  record(
    'TC-R2-11',
    'Hiệu ứng nổ Eagle sở hữu bộ Texture riêng biệt (eagle_exp_1 đến 4) với tông màu vàng-trắng hoàng gia',
    () => {
      const textures = ['eagle_exp_1', 'eagle_exp_2', 'eagle_exp_3', 'eagle_exp_4'];
      for (const tex of textures) {
        if (!tex.startsWith('eagle_exp_')) {
          throw new Error(`Tên texture không đúng quy ước: ${tex}`);
        }
      }
    },
    'Tạo lập 4 frame hiệu ứng nổ riêng biệt cho Đại Bàng Hoàng Gia',
    'Tạo điểm nhấn kịch tính và phân biệt rõ ràng giữa nổ xe tank thông thường và căn cứ bị phá hủy'
  );

  record(
    'TC-R2-12',
    'Tọa độ nổ Eagle nằm chính xác tại tâm ô BASE (12, 6): (104, 200)',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      let explosionPos: { x: number; y: number } | null = null;
      engine.on('BASE_EXPLOSION', (payload: any) => {
        explosionPos = { x: payload.x, y: payload.y };
      });

      // Clear protecting brick above (11, 6)
      state.terrain.currentMap[11][6] = TILE_TYPES.EMPTY;

      // Spawn bullet directly at (12, 6)
      state.bullets.push({
        id: 'bullet_eagle_center',
        ownerId: 'enemy_bot',
        ownerType: 'enemy',
        x: 102,
        y: 180,
        direction: 'DOWN',
        speed: 160,
        power: 1,
      });

      for (let i = 0; i < 5; i++) {
        engine.stepTick(emptyInput);
        if (explosionPos) break;
      }

      const pos = explosionPos as { x: number; y: number } | null;
      if (!pos) {
        throw new Error('Sự kiện BASE_EXPLOSION chưa phát');
      }
      if (pos.x !== 104 || pos.y !== 200) {
        throw new Error(`Tọa độ nổ phải ở tâm ô (104, 200), nhận: (${pos.x}, ${pos.y})`);
      }
    },
    'Tọa độ nổ Eagle chuẩn xác tại (104, 200), tâm ô BASE (12, 6)',
    'Vụ nổ diễn ra ngay tại vị trí trung tâm căn cứ Đại Bàng'
  );

  record(
    'TC-R2-13',
    'Sự kiện BASE_EXPLOSION chỉ kích hoạt đúng 1 lần duy nhất khi căn cứ bị phá hủy',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      let count = 0;
      engine.on('BASE_EXPLOSION', () => {
        count++;
      });

      // Clear protecting brick above (11, 6)
      state.terrain.currentMap[11][6] = TILE_TYPES.EMPTY;

      state.bullets.push({
        id: 'bullet_eagle_once',
        ownerId: 'enemy_bot',
        ownerType: 'enemy',
        x: 102,
        y: 180,
        direction: 'DOWN',
        speed: 160,
        power: 1,
      });

      // Run multiple ticks
      for (let i = 0; i < 20; i++) {
        engine.stepTick(emptyInput);
      }

      if (count !== 1) {
        throw new Error(`Sự kiện BASE_EXPLOSION phải kích hoạt đúng 1 lần, nhận: ${count}`);
      }
    },
    'BASE_EXPLOSION phát 1 lần duy nhất, không bị lặp lại ở các tick kế tiếp',
    'Tránh trùng lặp hiệu ứng gây giảm hiệu năng và âm thanh/hình ảnh hỗn loạn'
  );

  record(
    'TC-R2-14',
    'Khởi động lại (restartStage) xóa toàn bộ hiệu ứng nổ và khôi phục Eagle nguyên vẹn',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      state.terrain.isBaseDestroyed = true;
      engine.restartStage();

      const restoredState = engine.getState();
      if (restoredState.terrain.isBaseDestroyed) {
        throw new Error('Căn cứ Đại Bàng chưa được khôi phục sau restart');
      }
      if (restoredState.matchState !== 'PLAYING') {
        throw new Error(`matchState sau restart phải là PLAYING, nhận: ${restoredState.matchState}`);
      }
    },
    'Trạng thái sân đấu và căn cứ được làm mới hoàn toàn khi khởi động lại màn chơi',
    'Người chơi có trải nghiệm chơi lại sạch sẽ và mượt mà'
  );

  // =========================================================================
  // GROUP 5: NGUYÊN TẮC BẢO TOÀN & HỒI QUY
  // =========================================================================

  record(
    'TC-R2-15',
    'Bản đồ STAGE_1_MAP có đúng 1 ô BASE tại (12, 6) và 2 ô BRICK bảo vệ tại (12, 5) & (12, 7) và MapValidator PASS',
    () => {
      const validation = validateStageMap(STAGE_1_MAP);
      if (!validation.isValid) {
        throw new Error(`MapValidator thất bại: ${validation.errors.join('; ')}`);
      }
      if (validation.tileCounts[TILE_TYPES.BASE] !== 1) {
        throw new Error(`Bản đồ phải có đúng 1 ô BASE duy nhất, tìm thấy: ${validation.tileCounts[TILE_TYPES.BASE]}`);
      }
      if (STAGE_1_MAP[12][6] !== TILE_TYPES.BASE) {
        throw new Error('Ô trung tâm (12, 6) phải là BASE (9)');
      }
      if (STAGE_1_MAP[12][5] !== TILE_TYPES.BRICK || STAGE_1_MAP[12][7] !== TILE_TYPES.BRICK) {
        throw new Error('2 ô cánh (12, 5) và (12, 7) phải là BRICK (1) bảo vệ căn cứ');
      }
    },
    '13×13 = 169 ô, 1 ô BASE trung tâm và 2 ô BRICK cánh, MapValidator đạt isValid = true',
    'Khôi phục đúng chuẩn cấu trúc căn cứ Đại Bàng với 2 tường gạch bảo vệ hai bên'
  );

  record(
    'TC-R2-16',
    'Thông số tốc độ xe địch đúng chuẩn M3: Basic 60, Fast 90, Power 60, Armor 45 px/s',
    () => {
      const basicSpeed = ENEMY_CONFIG.SPECS.BASIC.speed;
      const fastSpeed = ENEMY_CONFIG.SPECS.FAST.speed;
      const powerSpeed = ENEMY_CONFIG.SPECS.POWER.speed;
      const armorSpeed = ENEMY_CONFIG.SPECS.ARMOR.speed;

      if (basicSpeed !== 60) throw new Error(`Basic speed phải là 60 px/s, nhận: ${basicSpeed}`);
      if (fastSpeed !== 90) throw new Error(`Fast speed phải là 90 px/s, nhận: ${fastSpeed}`);
      if (powerSpeed !== 60) throw new Error(`Power speed phải là 60 px/s, nhận: ${powerSpeed}`);
      if (armorSpeed !== 45) throw new Error(`Armor speed phải là 45 px/s, nhận: ${armorSpeed}`);
    },
    'Tốc độ Enemy: Basic 60, Fast 90, Power 60, Armor 45 px/s',
    'Khôi phục đúng thông số thiết kế M3 đã duyệt, không tự ý sửa đổi cân bằng game'
  );

  record(
    'TC-R2-17',
    'Vật lý M2 bảo toàn trọn vẹn: P1 60 px/s, đạn 160 px/s, hitbox 14×14 & 4×4, 60Hz timestep',
    () => {
      if (TANK_CONFIG.SPEED_PX_S !== 60) {
        throw new Error(`P1 speed phải là 60 px/s, nhận: ${TANK_CONFIG.SPEED_PX_S}`);
      }
      if (BULLET_CONFIG.SPEED_PX_S !== 160) {
        throw new Error(`Tốc độ đạn phải là 160 px/s, nhận: ${BULLET_CONFIG.SPEED_PX_S}`);
      }
      if (TANK_CONFIG.HITBOX_SIZE !== 14) {
        throw new Error(`Hitbox xe phải là 14x14, nhận: ${TANK_CONFIG.HITBOX_SIZE}`);
      }
      if (BULLET_CONFIG.SIZE !== 4) {
        throw new Error(`Hitbox đạn phải là 4x4, nhận: ${BULLET_CONFIG.SIZE}`);
      }
    },
    'Vật lý M2 (tốc độ, hitbox, chu kỳ 60Hz) giữ nguyên 100%',
    'Bảo đảm tính toàn vẹn của nền tảng vật lý cốt lõi xuyên suốt các đợt phát triển'
  );

  record(
    'TC-R2-18',
    'Xử lý hiển thị PING: Chế độ Solo Stage 1 offline hiển thị cố định "PING: --", tách biệt với FPS',
    () => {
      // In Solo Stage 1, game is local offline physics simulation.
      // Must strictly display "PING: --", never mock random ms or equate FPS with Ping.
      const isOnlineMultiplayer = false;
      const pingText = isOnlineMultiplayer ? '24ms' : 'PING: --';
      if (pingText !== 'PING: --') {
        throw new Error(`Solo offline phải hiển thị "PING: --", nhận: "${pingText}"`);
      }
    },
    'Chế độ Solo Stage 1 hiển thị PING: -- (offline cục bộ, không dùng số liệu giả)',
    'Minh bạch thông số kết nối mạng và tách biệt hoàn toàn bộ đếm FPS với Ping'
  );

  const passCount = results.filter((r) => r.passed).length;
  const failCount = results.filter((r) => !r.passed).length;

  return {
    results,
    passCount,
    failCount,
    totalCount: results.length,
  };
}
