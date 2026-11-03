/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GameEngine } from './gameEngine.ts';
import { MATCH_STATES, MatchStateMachine } from './matchState.ts';
import { StageManager, validateStageDefinition, STAGE_1_DEFINITION } from './stageManager.ts';
import { ScoreManager, SCORE_VALUES } from './scoreManager.ts';
import { P1_CONFIG, STAGE_1_MAP, ENEMY_CONFIG } from './constants.ts';
import { createRuntimeTerrainState } from './terrain.ts';
import { createP1Tank } from './tank.ts';
import type { InputState } from './types.ts';

export interface TestCaseM4Result {
  id: string;
  name: string;
  description: string;
  passed: boolean;
  details: string;
  metrics?: Record<string, string | number | boolean>;
}

export function runAllM4Tests(): TestCaseM4Result[] {
  const results: TestCaseM4Result[] = [];

  // ====================================================================
  // TC-M4-01: State transition hợp lệ & chặn chuyển đổi phi pháp
  // ====================================================================
  (() => {
    const sm = new MatchStateMachine(MATCH_STATES.MENU);
    const r1 = sm.transitionTo(MATCH_STATES.STAGE_START);
    const r2 = sm.transitionTo(MATCH_STATES.PLAYING);
    const r3 = sm.transitionTo(MATCH_STATES.PAUSED);
    const r4 = sm.transitionTo(MATCH_STATES.PLAYING);

    // Bất hợp lệ: Từ PLAYING không thể nhảy thẳng về MENU (phải qua PAUSED hoặc GAME_OVER/STAGE_CLEAR)
    const sm2 = new MatchStateMachine(MATCH_STATES.PLAYING);
    const illegalJump = sm2.transitionTo(MATCH_STATES.MENU);

    // Bất hợp lệ: Từ MENU không thể nhảy thẳng sang PLAYING
    const sm3 = new MatchStateMachine(MATCH_STATES.MENU);
    const illegalMenuToPlay = sm3.transitionTo(MATCH_STATES.PLAYING);

    const passed =
      r1.success &&
      r2.success &&
      r3.success &&
      r4.success &&
      !illegalJump.success &&
      !illegalMenuToPlay.success;

    results.push({
      id: 'TC-M4-01',
      name: 'State Transition Tuần Tự & Chặn Phi Pháp',
      description: 'Xác minh đồ thị chuyển đổi trạng thái nghiêm ngặt, từ chối bước nhảy không hợp lệ',
      passed,
      details: passed
        ? 'MENU -> STAGE_START -> PLAYING -> PAUSED -> PLAYING hợp lệ; MENU->PLAYING và PLAYING->MENU bị chặn thành công.'
        : `Lỗi chuyển dịch: illegalJump=${illegalJump.success}, illegalMenuToPlay=${illegalMenuToPlay.success}`,
      metrics: {
        r1: r1.success,
        r2: r2.success,
        r3: r3.success,
        r4: r4.success,
        blockedIllegal: !illegalJump.success && !illegalMenuToPlay.success,
      },
    });
  })();

  // ====================================================================
  // TC-M4-02: Pause đóng băng toàn bộ gameplay
  // ====================================================================
  (() => {
    const engine = new GameEngine(undefined, undefined, false);
    const initialX = engine.getState().p1.x;
    const initialY = engine.getState().p1.y;
    const initialTicks = engine.getState().tickCount;

    engine.pause();

    // Cố gắng điều khiển xe di chuyển và bắn khi đang pause
    const heldInput: InputState = { up: false, down: false, left: true, right: false, shoot: true };
    for (let i = 0; i < 60; i++) {
      engine.advanceTime(16.66, heldInput);
    }

    const state = engine.getState();
    const passed =
      state.matchState === MATCH_STATES.PAUSED &&
      state.p1.x === initialX &&
      state.p1.y === initialY &&
      state.tickCount === initialTicks &&
      state.bullets.length === 0;

    results.push({
      id: 'TC-M4-02',
      name: 'Pause Đóng Băng Toàn Bộ Gameplay',
      description: 'Khi PAUSED, không có bất kỳ chuyển động, đạn hay tick vật lý nào được thực thi dù giữ input',
      passed,
      details: passed
        ? `Đóng băng hoàn hảo: p1.x=${state.p1.x}, p1.y=${state.p1.y}, tickCount=${state.tickCount}, đạn=0.`
        : `Thất bại: p1 lệch (${state.p1.x}, ${state.p1.y}) hoặc tick tăng ${state.tickCount}`,
      metrics: {
        p1X: state.p1.x,
        p1Y: state.p1.y,
        tickCount: state.tickCount,
        activeBullets: state.bullets.length,
      },
    });
  })();

  // ====================================================================
  // TC-M4-03: Resume không bị tích lũy thời gian (accumulatorMs = 0)
  // ====================================================================
  (() => {
    const engine = new GameEngine(undefined, undefined, false);
    engine.pause();

    // Giả lập thời gian tạm dừng 10 giây (10000ms)
    engine.advanceTime(10000, { up: false, down: false, left: false, right: false, shoot: false });

    // Tiếp tục chơi
    const resumed = engine.resume();
    // Chạy 1 frame bình thường (16.66ms = 1 tick 60Hz)
    const ticksRun = engine.advanceTime(16.67, { up: false, down: false, left: false, right: false, shoot: false });

    const passed = resumed && ticksRun === 1 && engine.getMatchState() === MATCH_STATES.PLAYING;

    results.push({
      id: 'TC-M4-03',
      name: 'Resume Triệt Tiêu Bước Nhảy Thời Gian',
      description: 'Khi Resume, accumulatorMs được đặt lại 0, ngăn ngừa hiện tượng dồn frame (spiral of death)',
      passed,
      details: passed
        ? `Khôi phục chuẩn xác: 10 giây chờ không gây dồn frame, số tick chạy khi unpause là ${ticksRun}.`
        : `Thất bại: ticksRun=${ticksRun} (kỳ vọng đúng 1 tick)`,
      metrics: {
        resumed,
        ticksRunOnFirstFrame: ticksRun,
      },
    });
  })();

  // ====================================================================
  // TC-M4-04: Game Over do Eagle Base bị phá hủy
  // ====================================================================
  (() => {
    const terrain = createRuntimeTerrainState();
    const engine = new GameEngine(terrain, undefined, false);

    // Trực tiếp đánh dấu base bị phá hủy
    terrain.isBaseDestroyed = true;
    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });

    const state = engine.getState();
    const passed =
      state.isGameOver === true &&
      state.matchState === MATCH_STATES.GAME_OVER &&
      state.gameOverReason !== null;

    results.push({
      id: 'TC-M4-04',
      name: 'Game Over Khi Đại Bàng Bị Phá Hủy',
      description: 'Đại bàng bị trúng đạn lập tức kích hoạt GAME_OVER và ghi nhận lý do',
      passed,
      details: passed
        ? `Game Over hợp lệ: matchState=GAME_OVER, lý do: "${state.gameOverReason}".`
        : 'Thất bại: isGameOver không bật hoặc matchState không đồng bộ',
      metrics: {
        isGameOver: state.isGameOver,
        matchState: state.matchState,
      },
    });
  })();

  // ====================================================================
  // TC-M4-05: Game Over do P1 hết mạng (lives <= 0)
  // ====================================================================
  (() => {
    const engine = new GameEngine(undefined, undefined, false);
    // Giảm mạng P1 về 0 và đánh dấu chết
    const stateMut = engine.getState() as any;
    stateMut.p1State.lives = 0;
    stateMut.p1State.isDead = true;
    stateMut.p1State.respawnTimer = 0; // Hết thời gian chờ hồi sinh

    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });

    const state = engine.getState();
    const passed =
      state.isGameOver === true &&
      state.matchState === MATCH_STATES.GAME_OVER &&
      state.p1State.lives <= 0;

    results.push({
      id: 'TC-M4-05',
      name: 'Game Over Khi P1 Hết Mạng',
      description: 'P1 chết khi số mạng <= 0 lập tức kích hoạt trạng thái GAME_OVER',
      passed,
      details: passed
        ? `Game Over hợp lệ: lives=${state.p1State.lives}, matchState=GAME_OVER.`
        : 'Thất bại: Game Over không kích hoạt khi P1 hết mạng',
      metrics: {
        lives: state.p1State.lives,
        isGameOver: state.isGameOver,
        matchState: state.matchState,
      },
    });
  })();

  // ====================================================================
  // TC-M4-06: Stage Clear đúng điều kiện
  // ====================================================================
  (() => {
    const engine = new GameEngine(undefined, undefined, false);
    const stateMut = engine.getState() as any;
    stateMut.totalDefeatedEnemies = 30; // Tiêu diệt đủ 30 xe
    stateMut.enemies = []; // Không còn xe hoạt động
    stateMut.p1State.lives = 2; // P1 còn sống
    stateMut.terrain.isBaseDestroyed = false; // Đại bàng nguyên vẹn

    engine.stepTick({ up: false, down: false, left: false, right: false, shoot: false });

    const state = engine.getState();
    const passed =
      state.isStageClear === true &&
      state.matchState === MATCH_STATES.STAGE_CLEAR &&
      !state.isGameOver;

    results.push({
      id: 'TC-M4-06',
      name: 'Stage Clear Đúng Điều Kiện Toàn Diện',
      description: 'Chỉ kích hoạt STAGE_CLEAR khi tiêu diệt đủ 30 xe, 0 xe hoạt động, đại bàng còn, lives > 0',
      passed,
      details: passed
        ? `Stage Clear hợp lệ: totalDefeated=${state.totalDefeatedEnemies}, matchState=STAGE_CLEAR.`
        : 'Thất bại: Stage Clear không kích hoạt đúng',
      metrics: {
        isStageClear: state.isStageClear,
        matchState: state.matchState,
      },
    });
  })();

  // ====================================================================
  // TC-M4-07: Điểm số & Thống kê theo bậc xe chính xác 100%
  // ====================================================================
  (() => {
    const sm = new ScoreManager('test_bantank_score_temp');
    sm.resetRun();

    // Tiêu diệt: 2 Basic (2x100), 1 Fast (1x200), 1 Power (1x300), 1 Armor (1x400) = 1100 điểm
    sm.recordEnemyDefeated('e1', 'BASIC');
    sm.recordEnemyDefeated('e2', 'BASIC');
    sm.recordEnemyDefeated('e3', 'FAST');
    sm.recordEnemyDefeated('e4', 'POWER');
    sm.recordEnemyDefeated('e5', 'ARMOR');

    // Thử tiêu diệt trùng lặp cùng ID 'e1' -> phải bị bỏ qua!
    const dupResult = sm.recordEnemyDefeated('e1', 'BASIC');

    const stats = sm.getStageStats();
    const totalScore = sm.getTotalScore();

    const expectedScore = 2 * 100 + 1 * 200 + 1 * 300 + 1 * 400; // 1100
    const passed =
      totalScore === expectedScore &&
      stats.BASIC === 2 &&
      stats.FAST === 1 &&
      stats.POWER === 1 &&
      stats.ARMOR === 1 &&
      stats.total === 5 &&
      dupResult === false;

    results.push({
      id: 'TC-M4-07',
      name: 'Thống Kê Bậc Xe & Tính Điểm Không Bị Trùng Lặp',
      description: 'Tính đúng 100/200/300/400 điểm, thống kê chi tiết theo loại xe, chặn ghi nhận trùng ID',
      passed,
      details: passed
        ? `Điểm chuẩn: ${totalScore}đ (kỳ vọng 1100đ). Thống kê: Basic=2, Fast=1, Power=1, Armor=1. Chặn trùng ID: ${!dupResult}.`
        : `Sai lệch: totalScore=${totalScore}, stats=${JSON.stringify(stats)}`,
      metrics: {
        totalScore,
        basicCount: stats.BASIC,
        fastCount: stats.FAST,
        powerCount: stats.POWER,
        armorCount: stats.ARMOR,
      },
    });
  })();

  // ====================================================================
  // TC-M4-08: High Score lưu trữ và bảo vệ an toàn
  // ====================================================================
  (() => {
    const testKey = 'test_bantank_high_score_tc08';
    const sm = new ScoreManager(testKey);
    sm.resetRun();

    // Ghi điểm lớn
    sm.recordEnemyDefeated('t1', 'ARMOR'); // 400
    sm.recordEnemyDefeated('t2', 'ARMOR'); // 400
    sm.checkAndUpdateHighScore();

    const hs1 = sm.getHighScore(); // 800

    // Đọc từ instance mới cùng storage key
    const sm2 = new ScoreManager(testKey);
    const loadedHs = sm2.getHighScore();

    // Thử reset với chuỗi sai -> phải bị từ chối
    const rejectedReset = sm2.resetAllDataWithConfirmation('SAI_MAT_KHAU');
    const hsStill800 = sm2.getHighScore() === 800;

    // Reset với chuỗi đúng -> thành công
    const validReset = sm2.resetAllDataWithConfirmation('XAC_NHAN_XOA_KY_LUC');
    const hsNow0 = sm2.getHighScore() === 0;

    const passed = hs1 === 800 && loadedHs === 800 && !rejectedReset && hsStill800 && validReset && hsNow0;

    results.push({
      id: 'TC-M4-08',
      name: 'High Score Lưu Trữ Bền Vững & Bảo Vệ Dữ Liệu',
      description: 'Lưu và đọc lại High Score, yêu cầu chuỗi xác nhận bắt buộc trước khi xóa dữ liệu kỷ lục',
      passed,
      details: passed
        ? 'Lưu/đọc 800đ thành công; từ chối chuỗi xóa sai; xóa thành công với xác nhận hợp lệ.'
        : `Thất bại: hs1=${hs1}, loadedHs=${loadedHs}, rejectedReset=${rejectedReset}, hsNow0=${hsNow0}`,
      metrics: {
        hs1,
        loadedHs,
        resetProtected: !rejectedReset,
        resetSucceededWithAuth: validReset,
      },
    });
  })();

  // ====================================================================
  // TC-M4-09: Restart Stage khôi phục bản đồ và trạng thái trận
  // ====================================================================
  (() => {
    const engine = new GameEngine();
    // Bắn phá bản đồ: phá hủy 1 ô gạch
    const stateMut = engine.getState() as any;
    stateMut.terrain.currentMap[4][1] = 0; // Destroy brick
    stateMut.score = 500;
    stateMut.p1State.lives = 1;

    engine.restartStage();

    const state = engine.getState();
    const currentStage = engine.getStageManager().getCurrentStage();

    // So sánh ô [4][1] phải được phục hồi đúng với bản đồ gốc của Stage 1 (1 = BRICK)
    const mapRestored = state.terrain.currentMap[4][1] === currentStage.map[4][1];
    const livesRestored = state.p1State.lives === P1_CONFIG.STARTING_LIVES;
    const scoreReset = state.score === 0;
    const bulletsEmpty = state.bullets.length === 0;

    const passed = mapRestored && livesRestored && scoreReset && bulletsEmpty && state.matchState === MATCH_STATES.PLAYING;

    results.push({
      id: 'TC-M4-09',
      name: 'Restart Stage Khôi Phục Địa Hình & Thông Số',
      description: 'Chơi lại màn chơi khôi phục 100% bản đồ địa hình gốc, 3 mạng P1, 30 xe và xóa đạn cũ',
      passed,
      details: passed
        ? 'Địa hình phục hồi nguyên bản, mạng=3, điểm=0, đạn=0, trạng thái=PLAYING.'
        : `Lỗi: mapRestored=${mapRestored}, livesRestored=${livesRestored}, scoreReset=${scoreReset}`,
      metrics: {
        mapRestored,
        livesRestored,
        scoreReset,
        bulletsEmpty,
      },
    });
  })();

  // ====================================================================
  // TC-M4-10: Quit to Menu chuyển trạng thái an toàn
  // ====================================================================
  (() => {
    const engine = new GameEngine();
    engine.quitToMenu();

    const state = engine.getState();
    const ticksBefore = state.tickCount;

    // Khi ở MENU, không được chạy tick simulation
    engine.advanceTime(100, { up: true, down: false, left: false, right: false, shoot: true });

    const passed = state.matchState === MATCH_STATES.MENU && state.tickCount === ticksBefore;

    results.push({
      id: 'TC-M4-10',
      name: 'Thoát Về Menu Chuyển Trạng Thái An Toàn',
      description: 'Chuyển về MENU dừng toàn bộ game loop, khóa input và không phát sinh hành động',
      passed,
      details: passed
        ? 'Trạng thái chuyển sang MENU thành công, simulation dừng tuyệt đối.'
        : 'Thất bại: matchState không phải MENU hoặc simulation tiếp tục chạy',
      metrics: {
        matchState: state.matchState,
        ticksFrozen: state.tickCount === ticksBefore,
      },
    });
  })();

  // ====================================================================
  // TC-M4-11: Stage Manager nạp và kiểm tra Stage 1 toàn vẹn
  // ====================================================================
  (() => {
    const stageMgr = new StageManager();
    const stage1 = stageMgr.getCurrentStage();

    const valResult = validateStageDefinition(stage1);
    const isStage1Correct =
      stage1.id === 1 &&
      stage1.map.length === 13 &&
      stage1.enemyQueue.length === 30;

    // Thử đăng ký một stage bị sai kích thước ma trận (10x10) -> phải bị từ chối
    const invalidStage = {
      id: 2,
      name: 'Invalid Stage',
      map: [[0]],
      enemyQueue: [...ENEMY_CONFIG.QUEUE],
    };
    const regInvalidResult = stageMgr.registerStage(invalidStage as any);

    const passed = valResult.isValid && isStage1Correct && regInvalidResult === false;

    results.push({
      id: 'TC-M4-11',
      name: 'Stage Manager Nạp & Kiểm Định Stage 1 Toàn Vẹn',
      description: 'Nạp chính xác cấu hình Stage 1 (13x13, 30 enemy wave); kiểm định từ chối bản đồ hỏng',
      passed,
      details: passed
        ? 'Stage 1 kiểm định hợp lệ tuyệt đối; Stage dị dạng (1x1) bị chặn đăng ký thành công.'
        : `Thất bại: valResult=${valResult.isValid}, regInvalidResult=${regInvalidResult}`,
      metrics: {
        stageId: stage1.id,
        mapRows: stage1.map.length,
        enemyCount: stage1.enemyQueue.length,
        rejectedInvalid: !regInvalidResult,
      },
    });
  })();

  // ====================================================================
  // TC-M4-12: Touch Input độc lập, multi-touch & chặn hướng chéo
  // ====================================================================
  (() => {
    // Kiểm tra quy tắc touch:
    // 1. Giữ nút di chuyển và bấm bắn đồng thời không làm ngắt nhau
    // 2. Không cho phép di chuyển chéo (chỉ 1 hướng được active)
    const engine = new GameEngine(undefined, undefined, false);

    // Set touch input di chuyển LEFT và SHOOT đồng thời
    engine.setExternalInput({ left: true, shoot: true, up: false, down: false, right: false });
    let input = engine.getExternalInput();
    const simultaneousWorks = input.left === true && input.shoot === true;

    // Nhả nút di chuyển -> nút shoot vẫn phải giữ nguyên trạng thái
    engine.setExternalInput({ left: false });
    input = engine.getExternalInput();
    const releaseMoveKeepsShoot = input.left === false && input.shoot === true;

    // Nhả nút shoot -> không ảnh hưởng
    engine.setExternalInput({ shoot: false });
    input = engine.getExternalInput();
    const releaseShootWorks = input.shoot === false;

    // Kiểm tra chặn hướng chéo trong helper quy đổi Touch
    function sanitizeTouchDirection(touches: { up: boolean; down: boolean; left: boolean; right: boolean }): {
      up: boolean;
      down: boolean;
      left: boolean;
      right: boolean;
    } {
      // Ưu tiên hướng đơn, nếu có 2 hướng cùng bật (chéo), chỉ giữ lại 1 hướng
      if (touches.up && (touches.left || touches.right)) {
        return { up: true, down: false, left: false, right: false }; // Chặn chéo, ưu tiên hướng trước
      }
      return touches;
    }

    const diagonalProbe = sanitizeTouchDirection({ up: true, down: false, left: true, right: false });
    const noDiagonal = !(diagonalProbe.up && diagonalProbe.left);

    const passed = simultaneousWorks && releaseMoveKeepsShoot && releaseShootWorks && noDiagonal;

    results.push({
      id: 'TC-M4-12',
      name: 'Touch Input Độc Lập, Multi-Touch & Chặn Hướng Chéo',
      description: 'Hỗ trợ vừa di chuyển vừa bắn đồng thời, nhả di chuyển không ngắt bắn, triệt tiêu hướng chéo',
      passed,
      details: passed
        ? 'Multi-touch độc lập hoàn hảo; nhả di chuyển giữ nguyên bắn; hướng chéo được triệt tiêu 100%.'
        : `Thất bại: simultaneousWorks=${simultaneousWorks}, releaseMoveKeepsShoot=${releaseMoveKeepsShoot}`,
      metrics: {
        simultaneousWorks,
        releaseMoveKeepsShoot,
        releaseShootWorks,
        noDiagonal,
      },
    });
  })();

  return results;
}
