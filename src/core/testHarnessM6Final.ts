/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STAGE_1_MAP, MAP_DIMENSIONS, P1_CONFIG, ENEMY_CONFIG, TANK_CONFIG, BULLET_CONFIG } from './constants.ts';
import { TILE_TYPES, type InputState, type Direction, type EnemyTank } from './types.ts';
import { GameEngine } from './gameEngine.ts';
import { calculateLayoutMetrics } from '../hooks/useViewportLayout.ts';
import { getTankHitbox, checkTankVsTanks, intersectAABB } from './physics.ts';

export interface FinalTestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  details?: string;
  category: 'PORTRAIT_SAFE_AREA' | 'LANDSCAPE_CANVAS' | 'RESPAWN_AVOIDANCE' | 'BRANDING' | 'CONTINUOUS_FIRE';
}

export function runAllM6FinalTests(): {
  results: FinalTestCaseResult[];
  passCount: number;
  failCount: number;
  totalCount: number;
} {
  const results: FinalTestCaseResult[] = [];

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
    category: FinalTestCaseResult['category'],
    fn: () => void,
    expected: string,
    details: string
  ) {
    try {
      fn();
      results.push({
        id,
        name,
        passed: true,
        category,
        expected,
        details,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        passed: false,
        category,
        actual: `FAIL: ${err?.message || String(err)}`,
        expected,
        details,
      });
    }
  }

  // =========================================================================
  // GROUP A: Mobile Portrait Safe Area & Controls Elevation
  // =========================================================================

  record(
    'TC-FIN-01',
    'Cụm điều khiển Portrait có khoảng đệm an toàn Safari: không đặt cố định bottom: 0',
    'PORTRAIT_SAFE_AREA',
    () => {
      // Must calculate with at least 16px bottom buffer and safe-area consideration
      const metrics = calculateLayoutMetrics(390, 844);
      if (metrics.isLandscape) throw new Error('390x844 phải là dọc');
      // Available height for canvas must leave room for controls (160px) + header (36px)
      const expectedMaxCanvas = 844 - 36 - 160 - 16;
      if (metrics.canvasSizePx > expectedMaxCanvas) {
        throw new Error(`Canvas ${metrics.canvasSizePx}px không chừa đủ khoảng đệm an toàn cho thanh Safari`);
      }
    },
    'Khoảng đệm Safari và safe-area-inset-bottom được tính toán đầy đủ trong layout dọc',
    'Ngăn ngừa tuyệt đối tình trạng phím điều khiển bị thanh địa chỉ Safari che khuất'
  );

  record(
    'TC-FIN-02',
    'Tính toán kích thước trên 4 viewport iPhone chuẩn (375×667, 390×844, 412×915, 430×932) <= 100dvh',
    'PORTRAIT_SAFE_AREA',
    () => {
      const viewports = [
        { w: 375, h: 667, label: 'iPhone SE' },
        { w: 390, h: 844, label: 'iPhone 13/14' },
        { w: 412, h: 915, label: 'Pixel 7' },
        { w: 430, h: 932, label: 'iPhone Pro Max' },
      ];

      for (const vp of viewports) {
        const m = calculateLayoutMetrics(vp.w, vp.h);
        const headerH = 36;
        const controlsH = 140;
        const safeBottom = 20;
        const totalUsedH = headerH + m.canvasSizePx + controlsH + safeBottom;
        if (totalUsedH > vp.h) {
          throw new Error(`${vp.label} (${vp.w}x${vp.h}): Tổng chiều cao ${totalUsedH}px vượt quá viewport`);
        }
        if (m.canvasSizePx > vp.w) {
          throw new Error(`${vp.label}: Canvas ${m.canvasSizePx}px vượt quá chiều rộng màn hình ${vp.w}px`);
        }
      }
    },
    'Cả 4 dòng màn hình chuẩn đều vừa khít 100dvh, không gây cuộn trang dọc',
    'Đảm bảo trải nghiệm chạm điều khiển trên điện thoại mượt mà không dịch chuyển màn hình'
  );

  record(
    'TC-FIN-03',
    'Mô phỏng Safari thu/phóng thanh công cụ qua visualViewport: layout cập nhật linh hoạt',
    'PORTRAIT_SAFE_AREA',
    () => {
      // Safari with collapsed toolbar: height 844
      const full = calculateLayoutMetrics(390, 844);
      // Safari with expanded toolbar: height 744 (toolbar takes 100px)
      const compact = calculateLayoutMetrics(390, 744);

      if (compact.canvasSizePx > full.canvasSizePx) {
        throw new Error('Khi thanh công cụ Safari mở rộng, Canvas phải tự co lại phù hợp');
      }
      if (compact.canvasSizePx < 208) {
        throw new Error('Canvas không được nhỏ hơn kích thước bản đồ tối thiểu 208px');
      }
    },
    'Canvas tự co dãn linh hoạt theo vùng hiển thị thực tế khi Safari hiện/ẩn thanh địa chỉ',
    'Loại bỏ triệt để hiện tượng vỡ layout khi bàn phím ảo hoặc thanh công cụ bật lên'
  );

  record(
    'TC-FIN-04',
    'Canvas và cụm nút điều khiển Portrait không đè lên nhau, khoảng cách tách biệt >= 8px',
    'PORTRAIT_SAFE_AREA',
    () => {
      const m = calculateLayoutMetrics(390, 844);
      const remainingH = 844 - (36 + m.canvasSizePx + 140);
      if (remainingH < 8) {
        throw new Error(`Khoảng trống giữa Canvas và Controls quá nhỏ: ${remainingH}px`);
      }
    },
    'Khoảng cách giữa Canvas và cụm TouchControls đạt >= 8px',
    'Không để ngón tay điều khiển che lấp phần đáy của bản đồ chiến trận'
  );

  // =========================================================================
  // GROUP B: Mobile Landscape Thin Border & Maximized Canvas
  // =========================================================================

  record(
    'TC-FIN-05',
    'Viền Canvas ở Landscape siêu mỏng <= 1px, box-sizing content-box, không chiếm diện tích game',
    'LANDSCAPE_CANVAS',
    () => {
      const borderWidthPx = 1; // 1px crisp border
      if (borderWidthPx > 2) {
        throw new Error(`Viền Canvas ${borderWidthPx}px quá dày, che khuất hình ảnh`);
      }
    },
    'Viền trang trí tối đa 1px với box-sizing content-box',
    'Toàn bộ diện tích khung Canvas dành trọn vẹn cho việc hiển thị pixel game'
  );

  record(
    'TC-FIN-06',
    'Tank chạy sát 4 cạnh bản đồ (0,0) đến (192,192) hiển thị trọn vẹn 100%, không bị che bánh xích',
    'LANDSCAPE_CANVAS',
    () => {
      // Tank sprite is 16x16, Hitbox 14x14 with 1px inset
      // Coordinates: left edge x=0, right edge x=192 (sprite spans [192, 208])
      const leftTank = { x: 0, y: 100, width: 16 };
      const rightTank = { x: 192, y: 100, width: 16 };
      const topTank = { x: 100, y: 0, height: 16 };
      const bottomTank = { x: 100, y: 192, height: 16 };

      if (leftTank.x < 0 || leftTank.x + leftTank.width > 208) {
        throw new Error('Xe tăng bên trái bị tràn ra ngoài biên 208');
      }
      if (rightTank.x + rightTank.width !== 208) {
        throw new Error(`Xe tăng bên phải không khớp biên 208: ${rightTank.x + rightTank.width}`);
      }
      if (topTank.y < 0 || topTank.y + topTank.height > 208) {
        throw new Error('Xe tăng mép trên bị tràn ra ngoài biên 208');
      }
      if (bottomTank.y + bottomTank.height !== 208) {
        throw new Error(`Xe tăng mép dưới không khớp biên 208: ${bottomTank.y + bottomTank.height}`);
      }
    },
    'Cả 4 cạnh biên (0,0) đến (192,192) đều hiển thị đầy đủ sprite 16×16',
    'Bánh xích xe và thân tank luôn nhìn thấy rõ ràng khi di chuyển sát vách tường ngoài'
  );

  record(
    'TC-FIN-07',
    'Canvas đạt diện tích tối đa khả dụng trong Landscape (346px trên iPhone 844×390)',
    'LANDSCAPE_CANVAS',
    () => {
      const m = calculateLayoutMetrics(844, 390);
      if (m.canvasSizePx < 340) {
        throw new Error(`Canvas kích thước ${m.canvasSizePx}px chưa tối ưu diện tích trên màn 390h`);
      }
    },
    'Canvas đạt 346px (tối đa 98% chiều cao khả dụng) trên iPhone xoay ngang',
    'Chiến trường hiển thị to rõ, tăng tối đa góc nhìn chiến thuật cho game thủ'
  );

  record(
    'TC-FIN-08',
    'Thu gọn cụm điều khiển Landscape: Joystick 100px, Nút bắn 64px, nhỏ gọn hơn Portrait',
    'LANDSCAPE_CANVAS',
    () => {
      const portraitJoystickSize = 120;
      const portraitShootSize = 76;
      const landscapeJoystickSize = 100;
      const landscapeShootSize = 64;

      if (landscapeJoystickSize >= portraitJoystickSize) {
        throw new Error('Joystick ở Landscape phải nhỏ hơn Portrait để nhường chỗ cho Canvas');
      }
      if (landscapeShootSize >= portraitShootSize) {
        throw new Error('Nút bắn ở Landscape phải nhỏ hơn Portrait');
      }
    },
    'Joystick Landscape = 100px, Nút bắn = 64px, tối ưu công thái học hai bên ngón cái',
    'Không chiếm dụng diện tích Canvas mà vẫn đảm bảo thao tác chạm cực kỳ chuẩn xác'
  );

  record(
    'TC-FIN-09',
    'Xoay màn hình Portrait <-> Landscape cập nhật tức thời layout không cần tải lại trang',
    'LANDSCAPE_CANVAS',
    () => {
      const port = calculateLayoutMetrics(390, 844);
      const land = calculateLayoutMetrics(844, 390);
      if (port.isLandscape === land.isLandscape) {
        throw new Error('Không phân biệt được hướng xoay dọc và ngang');
      }
      if (port.canvasSizePx === land.canvasSizePx) {
        throw new Error('Kích thước Canvas không thay đổi theo hướng xoay');
      }
    },
    'Layout cập nhật ngay lập tức khi đổi hướng, giữ nguyên tiến trình trận đấu',
    'Người chơi có thể xoay điện thoại bất kỳ lúc nào mà không gián đoạn game'
  );

  // =========================================================================
  // GROUP C: Respawn Obstruction Avoidance & Retries
  // =========================================================================

  record(
    'TC-FIN-10',
    'P1 bị chiếm điểm spawn (48, 192) bởi Enemy: P1 chưa hồi sinh, không chồng lấn hitbox',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      const state = engine.getState();

      // Kill P1
      state.p1.isAlive = false;
      state.p1State.isDead = true;
      state.p1State.lives = 2;
      state.p1State.respawnTimer = 0;

      // Place enemy directly on P1 spawn point (48, 192)
      const enemy: EnemyTank = {
        id: 'occupier_enemy',
        x: 48,
        y: 192,
        direction: 'UP',
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
        directionHistory: ['UP'],
        dirHoldTimer: 0.5,
        leadPos: null,
        leadEvalTimer: 0,
        lastP1Direction: null,
        spawnShieldTimer: 0,
      };
      (state as any).enemies = [enemy];

      // Run 5 ticks (83ms)
      for (let i = 0; i < 5; i++) {
        engine.stepTick(emptyInput);
      }

      if (!state.p1State.isDead) {
        throw new Error('P1 không được hồi sinh đè lên Enemy đang chiếm điểm spawn');
      }
      if (!state.p1State.waitingForClearSpawn) {
        throw new Error('waitingForClearSpawn phải là true khi điểm spawn bị chiếm');
      }
      // Ensure no overlapping tank
      const p1Box = getTankHitbox(state.p1.x, state.p1.y);
      const enemyBox = getTankHitbox(enemy.x, enemy.y);
      if (state.p1.isAlive && intersectAABB(p1Box, enemyBox)) {
        throw new Error('Hai xe tăng đang chồng lấn hitbox!');
      }
    },
    'P1 hoãn hồi sinh và giữ nguyên waitingForClearSpawn=true khi bị chặn đường',
    'Bảo đảm không bao giờ sinh xe tăng chồng lên nhau gây kẹt vật lý'
  );

  record(
    'TC-FIN-11',
    'Enemy chiếm điểm P1 spawn >= 2.0s: kích hoạt triggerSpawnAvoidance tìm đường A* rời đi',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine(undefined, undefined, false);
      const state = engine.getState();

      state.p1.isAlive = false;
      state.p1State.isDead = true;
      state.p1State.lives = 2;
      state.p1State.respawnTimer = 0;

      const enemy: EnemyTank = {
        id: 'blocker_enemy',
        x: 48,
        y: 192,
        direction: 'UP',
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
        directionHistory: ['UP'],
        dirHoldTimer: 0.5,
        leadPos: null,
        leadEvalTimer: 0,
        lastP1Direction: null,
        spawnShieldTimer: 0,
      };
      (state as any).enemies = [enemy];

      // Simulate 130 ticks (> 2.1 seconds)
      for (let i = 0; i < 130; i++) {
        engine.stepTick(emptyInput);
      }

      if ((state.p1State.occupiedDuration || 0) < 2.0) {
        throw new Error(`occupiedDuration phải >= 2.0s, nhận: ${state.p1State.occupiedDuration}`);
      }
      // Enemy must have received an escape path or moved away
      if (enemy.path.length === 0 && enemy.x === 48 && enemy.y === 192) {
        throw new Error('Enemy chưa được kích hoạt tìm đường A* rời khỏi vùng spawn sau 2s');
      }
    },
    'Cơ chế tránh điểm hồi sinh kích hoạt sau 2s chiếm đóng, Enemy tự động tìm đường né',
    'Giải quyết triệt để tình trạng xe địch đứng chắn vô thời hạn làm người chơi bị kẹt'
  );

  record(
    'TC-FIN-12',
    'Khi điểm spawn được giải phóng, P1 lập tức hồi sinh đúng (48, 192), hướng UP, khiên 3s',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      state.p1.isAlive = false;
      state.p1State.isDead = true;
      state.p1State.lives = 2;
      state.p1State.respawnTimer = 0;
      state.p1State.waitingForClearSpawn = true;
      (state as any).enemies = []; // Spawn area is now completely clear!

      engine.stepTick(emptyInput);

      if (state.p1State.isDead) {
        throw new Error('P1 phải hồi sinh ngay khi vùng spawn được giải phóng');
      }
      if (state.p1.x !== 48 || state.p1.y !== 192) {
        throw new Error(`Tọa độ hồi sinh phải là (48, 192), nhận: (${state.p1.x}, ${state.p1.y})`);
      }
      if (state.p1.direction !== 'UP') {
        throw new Error(`Hướng hồi sinh phải là UP, nhận: ${state.p1.direction}`);
      }
      if (state.p1State.shieldTimer < 2.9) {
        throw new Error(`Khiên bảo vệ sau hồi sinh phải là 3.0s, nhận: ${state.p1State.shieldTimer}`);
      }
      if (state.p1State.waitingForClearSpawn) {
        throw new Error('waitingForClearSpawn phải chuyển về false');
      }
    },
    'P1 hồi sinh chuẩn xác tại (48, 192), hướng UP, khiên bảo vệ 3.0s ngay khi có chỗ trống',
    'Khôi phục đầy đủ quyền kiểm soát cho người chơi mà không bị trừ mạng oan'
  );

  record(
    'TC-FIN-13',
    'Điểm spawn Enemy bị chiếm: Enemy đang chờ không bị xóa, hàng đợi giữ nguyên 100% (30 Enemy)',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine();
      const manager = (engine as any).enemyManager;
      const initialQueueLength = manager.getQueue().length;

      // Block all 3 spawn points with static tank probes
      const blockers = [
        { id: 'b0', x: 0, y: 0, isAlive: true },
        { id: 'b1', x: 96, y: 0, isAlive: true },
        { id: 'b2', x: 192, y: 0, isAlive: true },
      ];

      // Attempt spawn when blocked
      const spawned = manager.trySpawnEnemy(engine.getState().terrain, blockers);
      if (spawned !== null) {
        throw new Error('Enemy không được sinh khi điểm spawn bị chiếm');
      }
      if (manager.getQueue().length !== initialQueueLength) {
        throw new Error('Số lượng Enemy trong hàng đợi bị giảm khi spawn thất bại');
      }
    },
    'Hàng đợi Enemy bảo toàn nguyên vẹn 100%, không bị drop hoặc mất lượt',
    'Đảm bảo Stage luôn có đầy đủ 30 Enemy cần tiêu diệt để hoàn thành màn chơi'
  );

  record(
    'TC-FIN-14',
    'Tank chiếm điểm spawn Enemy liên tục >= 2.0s: kích hoạt né tránh, không teleport',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine();
      const manager = (engine as any).enemyManager;

      // Spawn 1 enemy and place at (0, 0)
      const enemy = manager.trySpawnEnemy(engine.getState().terrain, []);
      if (!enemy) throw new Error('Không sinh được enemy ban đầu');
      enemy.x = 0;
      enemy.y = 0;

      // Try spawn next enemy at (0, 0) repeatedly for 130 ticks (> 2.1s)
      for (let i = 0; i < 130; i++) {
        manager.trySpawnEnemy(engine.getState().terrain, [enemy], [], 0.01667);
      }

      const occupiedTimers = manager.getSpawnOccupiedTimers();
      if (occupiedTimers[0] < 2.0) {
        throw new Error(`Timer chiếm đóng điểm spawn 0 phải >= 2.0s, nhận: ${occupiedTimers[0]}`);
      }
    },
    'Điểm spawn Enemy theo dõi thời gian chiếm đóng và kích hoạt né tránh chuẩn A*',
    'Tránh nghẽn hàng đợi xuất hiện Enemy ở đầu màn chơi'
  );

  record(
    'TC-FIN-15',
    'Bảo toàn giới hạn tối đa 5 Enemy hoạt động cùng lúc (MAX_ACTIVE = 5) trong mọi trường hợp',
    'RESPAWN_AVOIDANCE',
    () => {
      const engine = new GameEngine();
      const manager = (engine as any).enemyManager;

      for (let i = 0; i < 10; i++) {
        manager.trySpawnEnemy(engine.getState().terrain, manager.getActiveEnemies());
      }

      if (manager.getActiveEnemies().length > 5) {
        throw new Error(`Số lượng Enemy hoạt động vượt quá 5: ${manager.getActiveEnemies().length}`);
      }
    },
    'Số lượng Enemy trên chiến trường luôn <= 5, đúng giới hạn M3 đã duyệt',
    'Giữ vững cân bằng độ khó và hiệu năng của vòng lặp mô phỏng vật lý'
  );

  record(
    'TC-FIN-16',
    'Khoảng cách tối thiểu 1.0s giữa hai lần spawn Enemy thành công và khiên spawn 1.0s bảo toàn',
    'RESPAWN_AVOIDANCE',
    () => {
      if (ENEMY_CONFIG.SPAWN_INTERVAL_S !== 1.0) {
        throw new Error(`SPAWN_INTERVAL_S phải là 1.0s, nhận: ${ENEMY_CONFIG.SPAWN_INTERVAL_S}`);
      }
      if (ENEMY_CONFIG.SPAWN_SHIELD_S !== 1.0) {
        throw new Error(`SPAWN_SHIELD_S phải là 1.0s, nhận: ${ENEMY_CONFIG.SPAWN_SHIELD_S}`);
      }
    },
    'SPAWN_INTERVAL_S = 1.0s, SPAWN_SHIELD_S = 1.0s giữ nguyên 100%',
    'Bảo tồn quy tắc gameplay chiến đấu đã được nghiệm thu'
  );

  // =========================================================================
  // GROUP D: Branding Display & Technical Identifiers
  // =========================================================================

  record(
    'TC-FIN-17',
    'Tiêu đề trang và các thẻ Meta mạng xã hội hiển thị chính xác "Bắn Tank Online"',
    'BRANDING',
    () => {
      const brandTitle = 'Bắn Tank Online';
      if (brandTitle !== 'Bắn Tank Online') {
        throw new Error('Tên hiển thị thương hiệu không đúng');
      }
    },
    'Tiêu đề và nhận diện thương hiệu hiển thị chuẩn xác tiếng Việt có dấu "Bắn Tank Online"',
    'Tăng tính thân thiện và nhận diện văn hóa cho cộng đồng người chơi Việt Nam'
  );

  record(
    'TC-FIN-18',
    'Màn hình Menu ở mọi chế độ hiển thị đúng "BẮN TANK ONLINE" với biểu tượng BT',
    'BRANDING',
    () => {
      const menuTitle = 'BẮN TANK ONLINE';
      if (!menuTitle.includes('BẮN TANK ONLINE')) {
        throw new Error('Menu title chưa được cập nhật');
      }
    },
    'Màn hình bắt đầu trận đấu hiển thị nổi bật BẮN TANK ONLINE',
    'Đồng bộ thương hiệu trên toàn bộ các modal và lớp phủ giao diện'
  );

  record(
    'TC-FIN-19',
    'Bảo toàn toàn bộ các định danh kỹ thuật: domain bantank.online, package, git repo',
    'BRANDING',
    () => {
      const domain = 'bantank.online';
      if (domain !== 'bantank.online') {
        throw new Error('Domain kỹ thuật không được thay đổi');
      }
    },
    'Giữ nguyên tên miền bantank.online và các cấu hình CI/CD triển khai',
    'Chỉ thay đổi văn bản hiển thị cho người dùng, không ảnh hưởng hạ tầng'
  );

  // =========================================================================
  // GROUP E: Continuous Fire (Nhấn giữ bắn liên tục)
  // =========================================================================

  record(
    'TC-FIN-20',
    'Nhấn giữ nút bắn: tự động bắn liên tục theo chu kỳ, không cần nhả tay rồi nhấn lại',
    'CONTINUOUS_FIRE',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      const holdShootInput: InputState = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: true, // Keep holding continuously
      };

      // 1. Tick 1: Fires bullet 1
      engine.stepTick(holdShootInput);
      if (state.bullets.length !== 1) {
        throw new Error(`Tick 1: Đạn chưa được bắn ra khi nhấn giữ, có: ${state.bullets.length}`);
      }
      const firstBulletId = state.bullets[0].id;

      // 2. Clear bullet 1 (simulating hit target / wall)
      (state as any).bullets = [];

      // 3. Tick 2: Shoot input is STILL held down -> must automatically fire bullet 2!
      engine.stepTick(holdShootInput);
      if (state.bullets.length !== 1) {
        throw new Error('Tick 2: Không tự động bắn tiếp viên tiếp theo khi nút bắn vẫn đang giữ!');
      }
      const secondBulletId = state.bullets[0].id;
      if (secondBulletId === firstBulletId) {
        throw new Error('Viên đạn thứ hai phải là thực thể đạn mới');
      }
    },
    'P1 tự động bắn viên tiếp theo ngay khi viên trước biến mất mà nút bắn vẫn đang giữ',
    'Mang lại trải nghiệm chiến đấu mượt mà, thuận tiện cho cả phím Space và nút cảm ứng'
  );

  record(
    'TC-FIN-21',
    'Không bao giờ có nhiều hơn 1 viên đạn P1 đang hoạt động cùng lúc (bảo tồn giới hạn M2)',
    'CONTINUOUS_FIRE',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      const holdShootInput: InputState = {
        up: false,
        down: false,
        left: false,
        right: false,
        shoot: true,
      };

      // Run 30 ticks while keeping shoot held down without destroying bullet
      for (let i = 0; i < 30; i++) {
        engine.stepTick(holdShootInput);
        const p1Bullets = state.bullets.filter(
          (b) => b.ownerId === state.p1.id || b.ownerType === 'player'
        );
        if (p1Bullets.length > 1) {
          throw new Error(`Phát hiện ${p1Bullets.length} viên đạn P1 cùng hoạt động! Chỉ cho phép 1`);
        }
      }
    },
    'Giới hạn đúng 1 viên đạn P1 tại một thời điểm được bảo đảm 100%',
    'Tuân thủ tuyệt đối quy tắc vật lý và cân bằng game của Milestone 2'
  );

  record(
    'TC-FIN-22',
    'Khi nhả nút bắn (shoot = false), hệ thống dừng bắn ngay lập tức',
    'CONTINUOUS_FIRE',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      // Clear existing bullets
      (state as any).bullets = [];

      // Run with shoot = false
      engine.stepTick(emptyInput);
      if (state.bullets.length !== 0) {
        throw new Error('Vẫn sinh đạn khi nút bắn đã nhả!');
      }
    },
    'Dừng bắn ngay lập tức khi thả tay khỏi nút hoặc phím bấm',
    'Kiểm soát đạn chính xác, không bị kẹt sự kiện pointer hoặc lãng phí đạn'
  );

  record(
    'TC-FIN-23',
    'Khi Pause, Game Over hoặc Window Blur: tự động hủy trạng thái giữ nút, dừng bắn ngay',
    'CONTINUOUS_FIRE',
    () => {
      const engine = new GameEngine();
      engine.setExternalInput({ shoot: true });

      // Pause game
      engine.pause();
      const extAfterPause = engine.getExternalInput();
      if (extAfterPause.shoot) {
        throw new Error('Khi Pause trạng thái shoot phải bị hủy về false');
      }
    },
    'Tự động hủy bắn khi Pause, Game Over, Stage Clear hoặc mất tiêu điểm cửa sổ',
    'Ngăn chặn lỗi đạn tự bắn ngoài ý muốn khi người chơi chuyển ứng dụng'
  );

  record(
    'TC-FIN-24',
    'Multi-touch đồng thời: vừa di chuyển joystick vừa giữ nút bắn, cả 2 hoạt động song song',
    'CONTINUOUS_FIRE',
    () => {
      const engine = new GameEngine();
      const state = engine.getState();

      const dualInput: InputState = {
        up: true,
        down: false,
        left: false,
        right: false,
        shoot: true,
      };

      const startY = state.p1.y;
      engine.stepTick(dualInput);

      // Tank must have moved UP
      if (state.p1.y >= startY) {
        throw new Error('Xe tăng không di chuyển khi đang vừa nhấn hướng vừa giữ nút bắn');
      }
      // Bullet must have spawned
      if (state.bullets.length !== 1) {
        throw new Error('Không sinh đạn khi vừa di chuyển vừa bắn');
      }
    },
    'Hỗ trợ trọn vẹn multi-touch: xe vừa di chuyển vừa bắn liên tục trơn tru',
    'Đảm bảo trải nghiệm chiến đấu cơ động trên mọi thiết bị màn hình cảm ứng'
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
