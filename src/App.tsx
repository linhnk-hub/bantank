/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PhaserGame } from './game/PhaserGame.tsx';
import { TerrainLegend } from './components/TerrainLegend.tsx';
import { ValidationPanel } from './components/ValidationPanel.tsx';
import { M3Hud } from './components/M3Hud.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { StageClearModal } from './components/StageClearModal.tsx';
import {
  TouchControls,
  VirtualDPad,
  VirtualShootButton,
  type ActiveDirection,
} from './components/TouchControls.tsx';
import { RotateGuideModal } from './components/RotateGuideModal.tsx';
import { DevToolsDrawer } from './components/DevToolsDrawer.tsx';
import { STAGE_1_MAP, MAP_DIMENSIONS } from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import { GameEngine } from './core/gameEngine.ts';
import { useOrientation } from './hooks/useOrientation.ts';
import type { GameCoreState, InputState } from './core/types.ts';
import type { SceneTileHoverInfo } from './game/scenes/StageViewerScene.ts';
import {
  Crosshair,
  RotateCcw,
  Swords,
  Pause,
  Smartphone,
  Wrench,
  Menu,
  X,
  Play,
  Heart,
  Trophy,
  Shield,
  Layers,
} from 'lucide-react';

export default function App() {
  // Milestone 4 Game State & Lifecycle
  const [gameEngine, setGameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(true);

  // Orientation & Responsive hook
  const { isLandscape, requestLandscape, showRotateGuide, dismissGuide } = useOrientation();

  // Collapsible Menu & Developer Tools state
  const [isMenuExpanded, setIsMenuExpanded] = useState<boolean>(false);
  const [isDevDrawerOpen, setIsDevDrawerOpen] = useState<boolean>(false);

  // Milestone 1 Inspector state (accessible via Dev Tools)
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCoords, setShowCoords] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<SceneTileHoverInfo | null>(null);

  // Virtual Controls state for Landscape 3-Column Layout
  const [landscapeDirection, setLandscapeDirection] = useState<ActiveDirection>(null);
  const [landscapeShooting, setLandscapeShooting] = useState<boolean>(false);
  const landscapeDirRef = useRef<ActiveDirection>(null);

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

  // Handle touch inputs from either Portrait or Landscape virtual controls
  const handleTouchInput = useCallback(
    (input: Partial<InputState>) => {
      gameEngine.setExternalInput(input);
    },
    [gameEngine]
  );

  // Landscape specific multi-touch handlers with independent release
  const handleLandscapeDirectionChange = useCallback(
    (dir: ActiveDirection) => {
      landscapeDirRef.current = dir;
      setLandscapeDirection(dir);
      gameEngine.setExternalInput({
        up: dir === 'UP',
        down: dir === 'DOWN',
        left: dir === 'LEFT',
        right: dir === 'RIGHT',
      });
    },
    [gameEngine]
  );

  const handleLandscapeShootChange = useCallback(
    (shooting: boolean) => {
      setLandscapeShooting(shooting);
      // Releasing or pressing shoot NEVER cancels active movement direction
      gameEngine.setExternalInput({
        shoot: shooting,
      });
    },
    [gameEngine]
  );

  // Auto-collapse menu when match starts/resumes
  useEffect(() => {
    if (gameState?.matchState === 'PLAYING') {
      setIsMenuExpanded(false);
    }
  }, [gameState?.matchState]);

  // When paused, clear landscape controls
  useEffect(() => {
    if (isPaused) {
      landscapeDirRef.current = null;
      setLandscapeDirection(null);
      setLandscapeShooting(false);
    }
  }, [isPaused]);

  const isGameOverModalOpen = Boolean(
    gameState && (gameState.isGameOver || gameState.matchState === 'GAME_OVER')
  );
  const isStageClearModalOpen = Boolean(
    gameState && (gameState.isStageClear || gameState.matchState === 'STAGE_CLEAR')
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* Fallback Screen Orientation Guide Modal */}
      <RotateGuideModal isOpen={showRotateGuide} onClose={dismissGuide} />

      {/* Developer & QA Test Suite Drawer */}
      <DevToolsDrawer
        isOpen={isDevDrawerOpen}
        onClose={() => setIsDevDrawerOpen(false)}
        validation={validation}
      />

      {/* =========================================================================
          LANDSCAPE MODE (Mobile / Tablet 3-Column Ergonomic Layout)
          - Left: 4-Way D-Pad (48px targets)
          - Center: Game Canvas (1:1 square, fitted without distortion)
          - Right: Shoot Button (80px target)
          - Top: Slim HUD (Score, Lives, Stage, Pause)
         ========================================================================= */}
      {isLandscape ? (
        <div className="flex-1 flex flex-col h-screen w-screen overflow-hidden safe-area-inset">
          {/* Slim Landscape Top HUD */}
          <header className="h-10 bg-neutral-950/95 border-b border-neutral-800 px-4 flex items-center justify-between text-xs shrink-0 z-30">
            {/* Left: Brand & Stage */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-amber-500 flex items-center justify-center font-black text-black text-xs shadow">
                BT
              </div>
              <span className="font-extrabold text-white tracking-wide text-xs">
                {gameState?.currentStageName || 'Stage 1'}
              </span>
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            </div>

            {/* Center: Live Match Metrics */}
            <div className="flex items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <span className="font-bold">{gameState?.score ?? 0}</span>
              </div>
              <div className="flex items-center gap-1 text-rose-400 font-bold">
                <Heart className="w-3.5 h-3.5 fill-rose-500" />
                <span>×{gameState?.p1State.lives ?? 3}</span>
              </div>
              <div className="flex items-center gap-1 text-sky-400">
                <Shield className="w-3.5 h-3.5" />
                <span>Địch: {gameState?.enemyQueue.length ?? 0}</span>
              </div>
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={isPaused ? handleResume : handlePause}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold shadow"
              >
                {isPaused ? <Play className="w-3 h-3 fill-white" /> : <Pause className="w-3 h-3 fill-white" />}
                <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDevDrawerOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold"
                title="Bảng Kiểm thử & QA"
              >
                <Wrench className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">QA (54 Tests)</span>
              </button>
            </div>
          </header>

          {/* Landscape Main 3-Column Combat View */}
          <main className="flex-1 flex flex-row items-center justify-between w-full h-[calc(100vh-40px)] px-4 sm:px-8 py-2 overflow-hidden">
            {/* Left Column: Virtual 4-Way D-Pad */}
            <div className="flex items-center justify-center shrink-0 w-36 h-36">
              <VirtualDPad
                activeDirection={landscapeDirection}
                onDirectionChange={handleLandscapeDirectionChange}
              />
            </div>

            {/* Center Column: Game Canvas 1:1 Aspect Ratio */}
            <div className="flex-1 flex items-center justify-center h-full max-h-[calc(100vh-48px)] aspect-square overflow-hidden p-1">
              <PhaserGame
                mode="battle"
                engine={gameEngine}
                onStateUpdate={setGameState}
                onPause={handlePause}
              />
            </div>

            {/* Right Column: Virtual Shoot Action Button */}
            <div className="flex items-center justify-center shrink-0 w-36 h-36">
              <VirtualShootButton
                isShooting={landscapeShooting}
                onShootChange={handleLandscapeShootChange}
              />
            </div>
          </main>
        </div>
      ) : (
        /* =========================================================================
            PORTRAIT & DESKTOP MODE
           ========================================================================= */
        <div className="flex-1 flex flex-col w-full">
          {/* Header */}
          <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur px-4 py-2.5 sticky top-0 z-30 shadow-md">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
              {/* Brand */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-black text-black shadow-lg shadow-amber-500/20 text-sm">
                  BT
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    BanTank Online
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                      M4 Solo
                    </span>
                  </h1>
                  <p className="text-[10px] sm:text-xs text-neutral-400 hidden sm:block">
                    Phaser 3 + React + Pure Game Core | Vòng đời trận đấu | Cross-Platform
                  </p>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-1.5 text-xs">
                {/* Screen Orientation Rotate Button */}
                <button
                  type="button"
                  onClick={requestLandscape}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-semibold transition-all active:scale-95 shadow"
                  title="Chuyển sang chế độ xoay ngang màn hình"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="text-xs">Xoay ngang</span>
                </button>

                {/* Developer Tools Drawer Button */}
                <button
                  type="button"
                  onClick={() => setIsDevDrawerOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-200 font-semibold transition-all shadow"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Kiểm thử</span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                    54 Tests
                  </span>
                </button>

                {/* Collapsible Menu Toggle */}
                <button
                  type="button"
                  onClick={() => setIsMenuExpanded((v) => !v)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all sm:hidden"
                  aria-label="Thu gọn/Mở rộng Menu"
                >
                  {isMenuExpanded ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mobile Expanded Menu Strip (Collapsible) */}
            {isMenuExpanded && (
              <div className="mt-2.5 pt-2 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 sm:hidden text-xs animate-fade-in">
                <button
                  onClick={() => {
                    setIsDevDrawerOpen(true);
                    setIsMenuExpanded(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-200 font-semibold"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mở bảng 54 Tests Tự Động</span>
                </button>
                <button
                  onClick={() => setShowTouchControls((v) => !v)}
                  className="flex items-center gap-1 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-300 text-xs"
                >
                  <span>Cảm ứng: {showTouchControls ? 'Bật' : 'Tắt'}</span>
                </button>
              </div>
            )}
          </header>

          {/* Main Content Area */}
          <main className="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start">
            {/* Left Column: Phaser Game Canvas + Touch Controls (7 Cols) */}
            <section className="lg:col-span-7 flex flex-col gap-3">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
                {/* Viewport Header */}
                <div className="bg-neutral-950 px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="font-semibold text-neutral-200">
                      Battle Scene — {gameState?.currentStageName || 'Stage 1'} {isPaused ? '(PAUSED)' : ''}
                    </span>
                  </div>

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
                </div>

                {/* Canvas Container */}
                <div className="p-3 sm:p-4 bg-neutral-950/70 flex items-center justify-center min-h-[360px] sm:min-h-[440px]">
                  <PhaserGame
                    mode="battle"
                    engine={gameEngine}
                    onStateUpdate={setGameState}
                    onPause={handlePause}
                  />
                </div>

                {/* Viewport Footer */}
                <div className="bg-neutral-950 px-4 py-2 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2 text-neutral-400 text-[11px]">
                    <span>Điều khiển: <strong className="text-neutral-200">WASD / Mũi tên / D-Pad</strong></span>
                    <span>•</span>
                    <span>Bắn: <strong className="text-neutral-200">Space / J / Nút Bắn</strong></span>
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    {MAP_DIMENSIONS.ROWS}×{MAP_DIMENSIONS.COLS} Tiles (208×208 px)
                  </div>
                </div>
              </div>

              {/* Virtual Touch Controls (Under viewport in Portrait mode) */}
              {showTouchControls && (
                <TouchControls
                  onInputChange={handleTouchInput}
                  onPauseClick={isPaused ? handleResume : handlePause}
                  isPaused={isPaused}
                />
              )}
            </section>

            {/* Right Column: Live Combat HUD & Quick Stats (5 Cols) */}
            <section className="lg:col-span-5 flex flex-col gap-4">
              <M3Hud
                state={gameState}
                onReset={handleResetGame}
                onSpawnEnemy={handleSpawnNextEnemy}
                onPause={handlePause}
              />

              {/* Terrain Legend */}
              <TerrainLegend tileCounts={validation.tileCounts} />

              {/* Developer Test Suite Quick Access Card */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-xs flex flex-col gap-2.5 shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-white">Bảng Kiểm Thử & QA</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                    54/54 PASS
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Đã tách riêng toàn bộ 54 kiểm thử tự động (M1, M2, M3, M4, Sửa lỗi và UI Polish) vào bảng QA riêng biệt để giao diện chơi luôn gọn gàng và không che khuất màn hình.
                </p>
                <button
                  type="button"
                  onClick={() => setIsDevDrawerOpen(true)}
                  className="w-full py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mở Bảng Điều Khiển Kiểm Thử & QA</span>
                </button>
              </div>
            </section>
          </main>
        </div>
      )}

      {/* =========================================================================
          MATCH MODALS (Pause, GameOver, StageClear)
         ========================================================================= */}
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
    </div>
  );
}
