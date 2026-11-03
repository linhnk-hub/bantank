/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback } from 'react';
import { PhaserGame } from './game/PhaserGame.tsx';
import { TerrainLegend } from './components/TerrainLegend.tsx';
import { ValidationPanel } from './components/ValidationPanel.tsx';
import { M3Hud } from './components/M3Hud.tsx';
import { TestHarnessPanel } from './components/TestHarnessPanel.tsx';
import { TestHarnessM3Panel } from './components/TestHarnessM3Panel.tsx';
import { TestHarnessM3AuditPanel } from './components/TestHarnessM3AuditPanel.tsx';
import { TestHarnessM4Panel } from './components/TestHarnessM4Panel.tsx';
import { TestHarnessBugsPanel } from './components/TestHarnessBugsPanel.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { StageClearModal } from './components/StageClearModal.tsx';
import { TouchControls } from './components/TouchControls.tsx';
import { STAGE_1_MAP, MAP_DIMENSIONS } from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import { GameEngine } from './core/gameEngine.ts';
import type { GameCoreState, InputState } from './core/types.ts';
import type { SceneTileHoverInfo } from './game/scenes/StageViewerScene.ts';
import {
  Crosshair,
  Terminal,
  Cpu,
  RotateCcw,
  Swords,
  Layers,
  FileCheck2,
  Gamepad2,
  Pause,
  ShieldCheck,
  Smartphone,
  Bug,
} from 'lucide-react';

export default function App() {
  // Navigation tab state: 'playtest' (M4 Solo) | 'bugs_audit' (4 Lỗi Thực Tế) | 'harness_m4' (M4) | 'audit_m3' (M3 Audit) | 'harness_m3' (M3) | 'harness_m2' (M2) | 'inspector' (M1)
  const [activeTab, setActiveTab] = useState<
    'playtest' | 'bugs_audit' | 'harness_m4' | 'audit_m3' | 'harness_m3' | 'harness_m2' | 'inspector'
  >('playtest');

  // Milestone 1 Inspector state
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCoords, setShowCoords] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<SceneTileHoverInfo | null>(null);

  // Milestone 4 Game State & Lifecycle
  const [gameEngine, setGameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(true);

  // Validate the official Stage 1 map using pure Game Core validator (M1)
  const validation = useMemo(() => validateStageMap(STAGE_1_MAP), []);

  const handlePause = useCallback(() => {
    gameEngine.pause();
    setIsPaused(true);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleResume = useCallback(() => {
    gameEngine.resume();
    setIsPaused(false);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleRestart = useCallback(() => {
    gameEngine.restartStage();
    setIsPaused(false);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleQuitToMenu = useCallback(() => {
    gameEngine.quitToMenu();
    setIsPaused(false);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleNextStageOrReplay = useCallback(() => {
    if (!gameEngine.advanceToNextStage()) {
      gameEngine.restartStage();
    }
    setIsPaused(false);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleResetGame = useCallback(() => {
    gameEngine.restartStage();
    setIsPaused(false);
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleSpawnNextEnemy = useCallback(() => {
    gameEngine.spawnEnemyImmediate();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine]);

  const handleTouchInput = useCallback(
    (input: Partial<InputState>) => {
      gameEngine.setExternalInput(input);
    },
    [gameEngine]
  );

  const isGameOverModalOpen = Boolean(
    gameState && (gameState.isGameOver || gameState.matchState === 'GAME_OVER')
  );
  const isStageClearModalOpen = Boolean(
    gameState && (gameState.isStageClear || gameState.matchState === 'STAGE_CLEAR')
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur px-4 py-3 sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center font-black text-black shadow-lg shadow-amber-500/20 text-sm">
              BT
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                BanTank Online
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                  Milestone 4: Match Lifecycle & Cross-Platform Solo
                </span>
              </h1>
              <p className="text-xs text-neutral-400">
                Phaser 3 + React + Pure Game Core | Vòng đời trận đấu | Stage Manager | Touch Controls | 60Hz Fixed
              </p>
            </div>
          </div>

          {/* Navigation Mode Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => setActiveTab('playtest')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'playtest'
                  ? 'bg-amber-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Chiến dịch Solo M4</span>
            </button>

            <button
              onClick={() => setActiveTab('bugs_audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'bugs_audit'
                  ? 'bg-rose-500 text-white shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span>Kiểm toán 4 Lỗi (4 Tests)</span>
            </button>

            <button
              onClick={() => setActiveTab('harness_m4')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'harness_m4'
                  ? 'bg-amber-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Harness M4 (12 Tests)</span>
            </button>

            <button
              onClick={() => setActiveTab('audit_m3')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'audit_m3'
                  ? 'bg-emerald-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>Kiểm toán M3 (8 Điểm)</span>
            </button>

            <button
              onClick={() => setActiveTab('harness_m3')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'harness_m3'
                  ? 'bg-amber-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Harness M3 (14 Tests)</span>
            </button>

            <button
              onClick={() => setActiveTab('harness_m2')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'harness_m2'
                  ? 'bg-amber-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Harness M2 (TC01..12)</span>
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                activeTab === 'inspector'
                  ? 'bg-amber-500 text-black shadow font-bold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Bảo toàn M1</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Phaser Game Canvas + Touch Controls (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col gap-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl flex flex-col">
            {/* Viewport Header */}
            <div className="bg-neutral-950 px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`}></span>
                <span className="font-semibold text-neutral-200">
                  {activeTab === 'inspector'
                    ? 'Phaser 3 Stage 1 Inspector (Milestone 1)'
                    : `Battle Scene — ${gameState?.currentStageName || 'Stage 1'} ${isPaused ? '(PAUSED)' : ''}`}
                </span>
              </div>

              {/* Header Controls */}
              {activeTab === 'inspector' ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGrid((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      showGrid
                        ? 'bg-neutral-800 text-amber-400 border-amber-500/40'
                        : 'text-neutral-400 border-neutral-800'
                    }`}
                  >
                    Lưới: {showGrid ? 'Bật' : 'Tắt'}
                  </button>
                  <button
                    onClick={() => setShowCoords((v) => !v)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      showCoords
                        ? 'bg-neutral-800 text-amber-400 border-amber-500/40'
                        : 'text-neutral-400 border-neutral-800'
                    }`}
                  >
                    Tọa độ: {showCoords ? 'Bật' : 'Tắt'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowTouchControls((v) => !v)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      showTouchControls
                        ? 'bg-neutral-800 text-amber-400 border-amber-500/40'
                        : 'text-neutral-400 border-neutral-800 hover:text-neutral-200'
                    }`}
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>Cảm ứng: {showTouchControls ? 'Bật' : 'Tắt'}</span>
                  </button>

                  <button
                    onClick={isPaused ? handleResume : handlePause}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px]"
                  >
                    <Pause className="w-3 h-3" />
                    <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng (P)'}</span>
                  </button>

                  <button
                    onClick={handleResetGame}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Đặt lại</span>
                  </button>
                </div>
              )}
            </div>

            {/* Canvas Container */}
            <div className="p-4 bg-neutral-950/70 flex items-center justify-center min-h-[380px] sm:min-h-[460px]">
              {activeTab === 'inspector' ? (
                <PhaserGame
                  mode="inspector"
                  showGrid={showGrid}
                  showCoords={showCoords}
                  onTileHover={setHoverInfo}
                />
              ) : (
                <PhaserGame
                  mode="battle"
                  engine={gameEngine}
                  onStateUpdate={setGameState}
                  onPause={handlePause}
                />
              )}
            </div>

            {/* Viewport Footer */}
            <div className="bg-neutral-950 px-4 py-2 border-t border-neutral-800 flex items-center justify-between text-xs">
              {activeTab === 'inspector' ? (
                <div className="flex items-center gap-2 text-neutral-300">
                  <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-neutral-400">Kiểm tra ô chuột trỏ:</span>
                  {hoverInfo ? (
                    <span className="font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/50">
                      Hàng {hoverInfo.row}, Cột {hoverInfo.col} — {hoverInfo.tileName} (ID: {hoverInfo.tileType})
                    </span>
                  ) : (
                    <span className="text-neutral-500 italic">
                      Di chuột vào bản đồ để kiểm tra tọa độ
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-neutral-400 text-[11px]">
                  <span>Điều khiển: <strong className="text-neutral-200">W, A, S, D / Mũi tên / D-Pad</strong></span>
                  <span>•</span>
                  <span>Bắn: <strong className="text-neutral-200">Space / J / Nút Bắn</strong></span>
                  <span>•</span>
                  <span>Tạm dừng: <strong className="text-neutral-200">P / ESC</strong></span>
                </div>
              )}

              <div className="text-[11px] text-neutral-500 font-mono">
                {MAP_DIMENSIONS.ROWS}×{MAP_DIMENSIONS.COLS} Tiles (208×208 px)
              </div>
            </div>
          </div>

          {/* Virtual Touch Controls (Under viewport for intuitive mobile / tablet play) */}
          {activeTab !== 'inspector' && showTouchControls && (
            <TouchControls
              onInputChange={handleTouchInput}
              onPauseClick={isPaused ? handleResume : handlePause}
              isPaused={isPaused}
            />
          )}
        </section>

        {/* Right Column: Dynamic Side Panel (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {activeTab === 'playtest' && (
            <>
              {/* Milestone 4 Live Combat HUD */}
              <M3Hud
                state={gameState}
                onReset={handleResetGame}
                onSpawnEnemy={handleSpawnNextEnemy}
                onPause={handlePause}
              />

              {/* Terrain Legend */}
              <TerrainLegend tileCounts={validation.tileCounts} />
            </>
          )}

          {activeTab === 'bugs_audit' && (
            <>
              {/* Practical Playtesting Bug Audit Harness (4 Tests) */}
              <TestHarnessBugsPanel />
            </>
          )}

          {activeTab === 'harness_m4' && (
            <>
              {/* Milestone 4 Automated Test Harness */}
              <TestHarnessM4Panel />
            </>
          )}

          {activeTab === 'audit_m3' && (
            <>
              {/* Preserved Milestone 3 Technical Audit Harness (A..H) */}
              <TestHarnessM3AuditPanel />
            </>
          )}

          {activeTab === 'harness_m3' && (
            <>
              {/* Preserved Milestone 3 Automated Test Harness */}
              <TestHarnessM3Panel />
            </>
          )}

          {activeTab === 'harness_m2' && (
            <>
              {/* Preserved Milestone 2 Automated Test Harness */}
              <TestHarnessPanel />
            </>
          )}

          {activeTab === 'inspector' && (
            <>
              {/* Preserved Milestone 1 Validation Panel */}
              <ValidationPanel validation={validation} />

              {/* Preserved Milestone 1 Terrain Legend */}
              <TerrainLegend tileCounts={validation.tileCounts} />

              {/* Preserved Raw Matrix View */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-800">
                  <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                    Ma trận Stage 1 Gốc (Bảo toàn 100%)
                  </span>
                  <span className="font-mono text-[10px] text-neutral-400">13 × 13 Rows</span>
                </div>
                <pre className="font-mono text-[10px] leading-tight text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800/80 overflow-x-auto select-all">
                  {JSON.stringify(STAGE_1_MAP, null, 2)}
                </pre>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Lifecycle Modals */}
      <PauseModal
        isOpen={isPaused}
        onResume={handleResume}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
      />

      <GameOverModal
        isOpen={isGameOverModalOpen}
        state={gameState}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
      />

      <StageClearModal
        isOpen={isStageClearModalOpen}
        state={gameState}
        onNextStageOrReplay={handleNextStageOrReplay}
        onQuitToMenu={handleQuitToMenu}
      />

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        BanTank Online • Milestone 4: Match Lifecycle, Stage Progression & Cross-Platform Solo Experience • 100% Deterministic Game Core
      </footer>
    </div>
  );
}
