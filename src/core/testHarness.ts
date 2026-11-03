/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TILE_TYPES, SUB_TILE_MASKS, type InputState, type Direction } from './types.ts';
import { createRuntimeTerrainState, getBrickMask } from './terrain.ts';
import { GameEngine } from './gameEngine.ts';
import { createP1Tank } from './tank.ts';

export interface TestCaseResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details: string;
}

const emptyInput: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
};

/**
 * TC-01: Spawn Verification
 * Verifies initial spawn at Row 12, Col 3 (x=48, y=192, UP, 0 active bullets).
 */
export function runTC01(): TestCaseResult {
  const engine = new GameEngine();
  const state = engine.getState();

  const isX = state.p1.x === 48;
  const isY = state.p1.y === 192;
  const isDir = state.p1.direction === 'UP';
  const noBullets = state.bullet === null;

  const passed = isX && isY && isDir && noBullets;
  return {
    id: 'TC-01',
    name: 'Spawn Verification',
    passed,
    expected: 'x = 48, y = 192, dir = UP, activeBullets = 0',
    actual: `x = ${state.p1.x}, y = ${state.p1.y}, dir = ${state.p1.direction}, activeBullets = ${state.bullet ? 1 : 0}`,
    details: 'Kiểm tra tọa độ khởi tạo tại hàng 12, cột 3 và trạng thái nòng pháo hướng lên.',
  };
}

/**
 * TC-02: Boundary Left/Top
 * Starting at (0, 0), moving LEFT and UP must not breach 0.
 */
export function runTC02(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 0;
  tank.y = 0;
  tank.direction = 'UP';

  const engine = new GameEngine(undefined, tank);

  // Apply LEFT for 10 ticks
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, left: true });
  }
  // Apply UP for 10 ticks
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, up: true });
  }

  const finalState = engine.getState();
  const passed = finalState.p1.x === 0 && finalState.p1.y === 0;

  return {
    id: 'TC-02',
    name: 'Boundary Left/Top',
    passed,
    expected: 'x = 0, y = 0',
    actual: `x = ${finalState.p1.x}, y = ${finalState.p1.y}`,
    details: 'Xe tăng bị chặn chính xác tại góc biên trên-trái của bản đồ, không có tọa độ âm.',
  };
}

/**
 * TC-03: Boundary Right/Bottom
 * Starting at (192, 192), moving RIGHT and DOWN must not breach 192.
 */
export function runTC03(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 192;
  tank.y = 192;
  tank.direction = 'DOWN';

  const engine = new GameEngine(undefined, tank);

  // Apply RIGHT for 10 ticks
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, right: true });
  }
  // Apply DOWN for 10 ticks
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, down: true });
  }

  const finalState = engine.getState();
  const passed = finalState.p1.x === 192 && finalState.p1.y === 192;

  return {
    id: 'TC-03',
    name: 'Boundary Right/Bottom',
    passed,
    expected: 'x = 192, y = 192',
    actual: `x = ${finalState.p1.x}, y = ${finalState.p1.y}`,
    details: 'Xe tăng không vượt qua 192px (Sprite 16px không vượt quá biên 208px).',
  };
}

/**
 * TC-04: Brick Collision (Frontal)
 * Facing brick at [16, 32) × [64, 80). Starting at (16, 85).
 * Moving UP 20 ticks must stop flush at y = 79 (hitbox top at 80).
 */
export function runTC04(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 16;
  tank.y = 81;
  tank.direction = 'UP';

  const engine = new GameEngine(undefined, tank);
  for (let i = 0; i < 20; i++) {
    engine.stepTick({ ...emptyInput, up: true });
  }

  const finalState = engine.getState();
  const passed = finalState.p1.y === 79 && finalState.p1.x === 16;

  return {
    id: 'TC-04',
    name: 'Brick Collision (Frontal)',
    passed,
    expected: 'tank.y = 79 (Hitbox top = 80 tiếp xúc cạnh đáy ô gạch)',
    actual: `tank.y = ${finalState.p1.y}`,
    details: 'Dừng đúng vị trí tiếp xúc hợp lệ y = 79, không giao nhau với ô gạch [64, 80).',
  };
}

/**
 * TC-05: Steel Collision
 * Facing steel at [96, 112) × [48, 64). Starting at (96, 70).
 * Moving UP 20 ticks must stop flush at y = 63 (hitbox top at 64).
 */
export function runTC05(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 96;
  tank.y = 70;
  tank.direction = 'UP';

  const engine = new GameEngine(undefined, tank);
  for (let i = 0; i < 20; i++) {
    engine.stepTick({ ...emptyInput, up: true });
  }

  const finalState = engine.getState();
  const passed = finalState.p1.y === 63 && finalState.p1.x === 96;

  return {
    id: 'TC-05',
    name: 'Steel Collision',
    passed,
    expected: 'tank.y = 63 (Hitbox top = 64 tiếp xúc cạnh đáy ô thép)',
    actual: `tank.y = ${finalState.p1.y}`,
    details: 'Dừng đúng vị trí tiếp xúc hợp lệ y = 63, không giao nhau với ô thép [48, 64).',
  };
}

/**
 * TC-06: Base Collision
 * Facing Base at [80, 96) × [192, 208). Starting at (55, 192).
 * Col 4 is cleared in fixture to test direct collision with Base.
 * Moving RIGHT 20 ticks must stop flush at x = 65 (hitbox right at 80).
 */
export function runTC06(): TestCaseResult {
  const fixtureTerrain = createRuntimeTerrainState();
  fixtureTerrain.currentMap[12][4] = TILE_TYPES.EMPTY; // Clear protecting brick to test direct Base collision

  const tank = createP1Tank();
  tank.x = 55;
  tank.y = 192;
  tank.direction = 'RIGHT';

  const engine = new GameEngine(fixtureTerrain, tank);
  for (let i = 0; i < 20; i++) {
    engine.stepTick({ ...emptyInput, right: true });
  }

  const finalState = engine.getState();
  const passed = finalState.p1.x === 65 && finalState.p1.y === 192;

  return {
    id: 'TC-06',
    name: 'Base Collision',
    passed,
    expected: 'tank.x = 65 (Hitbox right = 80 tiếp xúc mép trái Căn cứ)',
    actual: `tank.x = ${finalState.p1.x}`,
    details: 'Dừng đúng vị trí tiếp xúc hợp lệ x = 65, bảo vệ căn cứ không bị xe đè lên.',
  };
}

/**
 * TC-07: Safe Grid Snapping Success
 * In open field (Rows 5 & 6 Cols 5, 6, 7). Starting at (93, 96), dir 'UP'.
 * Snaps to 96 and moves 10 ticks UP -> ends at (96, 86).
 */
export function runTC07(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 93;
  tank.y = 96;
  tank.direction = 'UP';

  const engine = new GameEngine(undefined, tank);
  for (let i = 0; i < 10; i++) {
    engine.stepTick({ ...emptyInput, up: true });
  }

  const finalState = engine.getState();
  const passed =
    finalState.p1.x === 96 &&
    finalState.p1.y === 86 &&
    finalState.p1.direction === 'UP';

  return {
    id: 'TC-07',
    name: 'Safe Grid Snapping Success',
    passed,
    expected: 'tank.x = 96, tank.y = 86, dir = UP',
    actual: `tank.x = ${finalState.p1.x}, tank.y = ${finalState.p1.y}, dir = ${finalState.p1.direction}`,
    details: 'Tự căn chỉnh lệch 3px sang tim đường x = 96 và di chuyển thông thoáng qua Row 5.',
  };
}

/**
 * TC-08: Safe Grid Snapping Rejection
 * Starting at (47, 19), dir 'DOWN' in Col 3. Adjacent to Col 2 brick [32, 48) × [16, 32).
 * Pressing LEFT for 1 tick generates candidate (46, 16) intersecting brick -> REJECTED.
 * Tank remains at (47, 19).
 */
export function runTC08(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 47;
  tank.y = 19;
  tank.direction = 'DOWN';

  const engine = new GameEngine(undefined, tank);
  engine.stepTick({ ...emptyInput, left: true });

  const finalState = engine.getState();
  const passed = finalState.p1.x === 47 && finalState.p1.y === 19;

  return {
    id: 'TC-08',
    name: 'Safe Grid Snapping Rejection',
    passed,
    expected: 'tank.x = 47, tank.y = 19 (Snap và di chuyển bị từ chối)',
    actual: `tank.x = ${finalState.p1.x}, tank.y = ${finalState.p1.y}`,
    details: 'Vị trí ứng viên (46, 16) giao ô gạch 1px × 14px -> Hệ thống từ chối thành công, xe không xuyên tường.',
  };
}

/**
 * TC-09: Quarter-Tile Destruction (Unbalanced Straddle)
 * Brick at (16, 64) has mask = 15.
 * Tank at (19, 80) fires UP. Bullet at bx = 25 (> x_mid = 24).
 * Destroys BR (bit 3). Mask becomes 7 (0b0111).
 */
export function runTC09(): TestCaseResult {
  const terrain = createRuntimeTerrainState();
  const tank = createP1Tank();
  tank.x = 19;
  tank.y = 80;
  tank.direction = 'UP';

  const engine = new GameEngine(terrain, tank);

  // Trigger shoot
  engine.stepTick({ ...emptyInput, shoot: true });

  // Advance bullet until impact (up to 30 ticks)
  for (let i = 0; i < 30; i++) {
    engine.stepTick(emptyInput);
    const mask = getBrickMask(engine.getState().terrain, 4, 1);
    if (mask === 7) {
      break;
    }
  }

  const finalMask = getBrickMask(engine.getState().terrain, 4, 1);
  const passed = finalMask === 7;

  return {
    id: 'TC-09',
    name: 'Quarter-Tile Destruction (Unbalanced Straddle)',
    passed,
    expected: 'mask = 7 (0b0111: TL, TR, BL còn nguyên, BR bị phá)',
    actual: `mask = ${finalMask}`,
    details: 'Đạn lệch phải phá hủy chính xác mảnh 8x8 BR theo quy tắc xác định.',
  };
}

/**
 * TC-10: Partial Brick Passage (Isolated Fixture)
 * Fixture: Brick (16, 64) has mask = 3 (0b0011, bottom half y: 72..80 is clear).
 * Neighbor (32, 64) is set to EMPTY (0).
 * Bullet at bx = 0, by = 74 flies RIGHT. Must pass x = 32 without being destroyed.
 */
export function runTC10(): TestCaseResult {
  const fixtureTerrain = createRuntimeTerrainState();
  // Set target brick at (4, 1) to mask = 3 (TL=1, TR=2 intact; BL=0, BR=0 empty)
  fixtureTerrain.brickSubTiles['4_1'] = SUB_TILE_MASKS.TL | SUB_TILE_MASKS.TR; // 3
  // Set neighbor at (4, 2) to EMPTY
  fixtureTerrain.currentMap[4][2] = TILE_TYPES.EMPTY;

  const engine = new GameEngine(fixtureTerrain);

  // Custom spawn bullet at (0, 74) flying RIGHT
  const state = engine.getState() as any;
  state.bullet = {
    id: 'tc10_bullet',
    ownerId: 'p1',
    x: 0,
    y: 74,
    direction: 'RIGHT' as Direction,
    speed: 160,
    power: 1,
  };

  // Step ticks until bullet crosses x = 32
  for (let i = 0; i < 25; i++) {
    engine.stepTick(emptyInput);
    if (state.bullet && state.bullet.x > 32) {
      break;
    }
  }

  const finalBullet = engine.getState().bullet;
  const passed = finalBullet !== null && finalBullet.x > 32;

  return {
    id: 'TC-10',
    name: 'Partial Brick Passage (Isolated Fixture)',
    passed,
    expected: 'bullet.x > 32 và đạn vẫn còn hoạt động',
    actual: `bullet.x = ${finalBullet ? finalBullet.x.toFixed(2) : 'null (destroyed)'}`,
    details: 'Đạn bay xuyên qua nửa dưới ô gạch đã bị phá hủy an toàn theo đúng AABB.',
  };
}

/**
 * TC-11: Steel Bullet Immunity & 1-Bullet Limit
 * Tank at (96, 80) facing UP towards steel (96, 48).
 * Fire 5 times: only 1 bullet exists. Bullet detonates on steel, steel intact.
 */
export function runTC11(): TestCaseResult {
  const tank = createP1Tank();
  tank.x = 96;
  tank.y = 80;
  tank.direction = 'UP';

  const engine = new GameEngine(undefined, tank);

  // Fire 1st time
  engine.stepTick({ ...emptyInput, shoot: true });
  const bulletCount1 = engine.getState().bullet !== null ? 1 : 0;

  // Attempt rapid fire while bullet is flying
  let exceededLimit = false;
  for (let i = 0; i < 5; i++) {
    engine.stepTick({ ...emptyInput, shoot: true });
    // Count active bullets
    const count = engine.getState().bullet !== null ? 1 : 0;
    if (count > 1) exceededLimit = true;
  }

  // Advance until bullet hits steel
  for (let i = 0; i < 25; i++) {
    engine.stepTick(emptyInput);
  }

  const finalState = engine.getState();
  const steelIntact = finalState.terrain.currentMap[3][6] === TILE_TYPES.STEEL;
  const bulletDetonated = finalState.bullet === null;

  const passed = bulletCount1 === 1 && !exceededLimit && steelIntact && bulletDetonated;

  return {
    id: 'TC-11',
    name: 'Steel Bullet Immunity & 1-Bullet Limit',
    passed,
    expected: 'Tối đa 1 viên đạn; đạn tự hủy khi chạm thép; thép nguyên vẹn',
    actual: `Tối đa 1 đạn: ${!exceededLimit}, Đạn tiêu hủy: ${bulletDetonated}, Thép nguyên vẹn: ${steelIntact}`,
    details: 'Đạn chạm tường thép phát nổ biến mất, tường thép không bị suy suyển.',
  };
}

/**
 * TC-12: Base Shot Game Over
 * Tank at (80, 160) facing DOWN towards Base [12, 5].
 * Shoot DOWN. Base becomes ruined, isGameOver = true.
 */
export function runTC12(): TestCaseResult {
  const fixtureTerrain = createRuntimeTerrainState();
  fixtureTerrain.currentMap[11][6] = TILE_TYPES.EMPTY; // Clear protecting brick to test direct bullet hit on Base (Eagle at [12, 6])

  const tank = createP1Tank();
  tank.x = 96;
  tank.y = 160;
  tank.direction = 'DOWN';

  const engine = new GameEngine(fixtureTerrain, tank);

  // Fire at base
  engine.stepTick({ ...emptyInput, shoot: true });

  // Advance until bullet hits base
  for (let i = 0; i < 30; i++) {
    engine.stepTick(emptyInput);
    if (engine.getState().isGameOver) {
      break;
    }
  }

  const finalState = engine.getState();
  const passed = finalState.terrain.isBaseDestroyed && finalState.isGameOver;

  return {
    id: 'TC-12',
    name: 'Base Shot Game Over',
    passed,
    expected: 'isBaseDestroyed = true, isGameOver = true',
    actual: `isBaseDestroyed = ${finalState.terrain.isBaseDestroyed}, isGameOver = ${finalState.isGameOver}`,
    details: 'Đạn bắn trúng căn cứ kích hoạt hủy diệt căn cứ và kết thúc trận đấu.',
  };
}

/**
 * Runs all 12 test cases and returns summary results.
 */
export function runAllTestCases(): TestCaseResult[] {
  return [
    runTC01(),
    runTC02(),
    runTC03(),
    runTC04(),
    runTC05(),
    runTC06(),
    runTC07(),
    runTC08(),
    runTC09(),
    runTC10(),
    runTC11(),
    runTC12(),
  ];
}
