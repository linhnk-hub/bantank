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
  VirtualJoystick,
  VirtualShootButton,
  type ActiveDirection,
} from './components/TouchControls.tsx';
import { RotateGuideModal } from './components/RotateGuideModal.tsx';
import { FullscreenGuideModal } from './components/FullscreenGuideModal.tsx';
import { DevToolsDrawer } from './components/DevToolsDrawer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SoundManager } from './core/audio.ts';
import { STAGE_1_MAP, MAP_DIMENSIONS } from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import { GameEngine } from './core/gameEngine.ts';
import { useOrientation } from './hooks/useOrientation.ts';
import { useFullscreen } from './hooks/useFullscreen.ts';
import { useViewportLayout } from './hooks/useViewportLayout.ts';
import type { GameCoreState, InputState } from './core/types.ts';
import type { SceneTileHoverInfo } from './game/scenes/StageViewerScene.ts';
import {
  RotateCcw,
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
  Monitor,
  Maximize,
  Minimize,
  Settings,
} from 'lucide-react';

export default function App() {
  // Milestone 4 Game State & Lifecycle
  const [gameEngine, setGameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [targetFps, setTargetFps] = useState<30 | 60>(60);
  const [difficulty, setDifficulty] = useState<'DEFAULT' | 'EXTREME'>('DEFAULT');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Desktop PC detection: screen width >= 1024px with fine pointer (mouse/trackpad)
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Safe browser autoplay unlock for Web Audio API
  useEffect(() => {
    const unlockAudio = () => {
      SoundManager.getInstance().unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Performance FPS Color Coding: Green >=55, Yellow 30-54, Red <30
  const getFpsBadgeStyle = (val: number) => {
    if (val >= 55) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40';
    if (val >= 30) return 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    return 'bg-rose-500/20 text-rose-400 border-rose-500/40';
  };

  // On desktop PC with fine mouse pointer, default touch controls to hidden to maximize canvas size
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const desktop = window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
    return !desktop;
  });

  // Orientation & Responsive hook
  const { isLandscape, requestLandscape, showRotateGuide, dismissGuide } = useOrientation();

  // Fullscreen hook for mobile & cross-platform
  const {
    isFullscreen,
    toggleFullscreen,
    showFullscreenGuide,
    dismissGuide: dismissFsGuide,
  } = useFullscreen();

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

  // Screen layout metrics (landscape, phone, tablet, desktop scaling)
  const layout = useViewportLayout();

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

  const handleDifficultyChange = useCallback(
    (diff: 'DEFAULT' | 'EXTREME') => {
      setDifficulty(diff);
      gameEngine.setDifficulty(diff);
      setGameState({ ...gameEngine.getState() });
    },
    [gameEngine]
  );

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

  // Listen for Space / Enter to start game when in MENU state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState?.matchState === 'MENU') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          handleRestart();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState?.matchState, handleRestart]);

  const isGameOverModalOpen = Boolean(
    gameState && gameState.matchState === 'GAME_OVER'
  );
  const isStageClearModalOpen = Boolean(
    gameState && gameState.matchState === 'STAGE_CLEAR'
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* Fallback Screen Orientation Guide Modal */}
      <RotateGuideModal isOpen={showRotateGuide} onClose={dismissGuide} />

      {/* Fallback Fullscreen API Guide Modal (iOS Safari & Restricted Browsers) */}
      <FullscreenGuideModal isOpen={showFullscreenGuide} onClose={dismissFsGuide} />

      {/* Developer & QA Test Suite Drawer */}
      <DevToolsDrawer
        isOpen={isDevDrawerOpen}
        onClose={() => setIsDevDrawerOpen(false)}
        validation={validation}
      />

      {/* Settings & Audio Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        targetFps={targetFps}
        onFpsChange={setTargetFps}
        difficulty={difficulty}
        onDifficultyChange={handleDifficultyChange}
      />

      {/* =========================================================================
          LANDSCAPE MODE (Mobile / Tablet 3-Column Ergonomic Layout)
          - Left: Virtual Joystick (smooth 4-way dominant axis)
          - Center: Game Canvas (1:1 square, fitted without distortion)
          - Right: Virtual Shoot Button (80px target)
          - Top: Slim HUD (Score, Lives, Stage, Pause)
         ========================================================================= */}
      {(!isDesktop && layout.isLandscape) ? (
        <div className="flex-1 flex flex-col h-screen w-screen overflow-hidden safe-area-inset">
          {/* Slim Landscape Top HUD (32px) */}
          <header className="h-8 bg-neutral-950/95 border-b border-neutral-800 px-2 sm:px-3 flex items-center justify-between text-xs shrink-0 z-30">
            {/* Left: Brand & Stage */}
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center font-black text-black text-[11px] shadow">
                BT
              </div>
              <span className="font-extrabold text-amber-400 tracking-wider text-xs font-mono">
                STAGE 1
              </span>
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            </div>

            {/* Center: Live Match Metrics + Performance Status Bar */}
            <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getFpsBadgeStyle(fps)}`}>
                FPS: {fps}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-neutral-900 border-neutral-700 text-neutral-400">
                PING: --
              </span>
              <div className="flex items-center gap-1 text-amber-400">
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold"
                title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
              >
                {isFullscreen ? <Minimize className="w-3 h-3 text-amber-400" /> : <Maximize className="w-3 h-3 text-amber-400" />}
                <span className="hidden sm:inline">{isFullscreen ? 'Thu nhỏ' : 'Toàn MH'}</span>
              </button>

              <button
                type="button"
                onClick={isPaused ? handleResume : handlePause}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold shadow"
              >
                {isPaused ? <Play className="w-3 h-3 fill-white" /> : <Pause className="w-3 h-3 fill-white" />}
                <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold"
                title="Cài đặt & Âm thanh"
              >
                <Settings className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Cài đặt</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDevDrawerOpen(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold"
                title="Bảng Kiểm thử & QA"
              >
                <Wrench className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">QA</span>
              </button>
            </div>
          </header>

          {/* Landscape Main 3-Column Combat View (Prioritizing Canvas Area with Compact Controls) */}
          <main className="flex-1 flex flex-row items-center justify-center w-full h-[calc(100dvh-32px)] px-1 sm:px-2 py-0 overflow-hidden">
            {/* Left Column: Virtual Joystick Centered in left zone */}
            <div
              style={{
                width: `${layout.leftControlWidthPx}px`,
                minWidth: '90px',
              }}
              className="flex-1 flex items-center justify-center h-full"
            >
              <VirtualJoystick
                activeDirection={landscapeDirection}
                onDirectionChange={handleLandscapeDirectionChange}
                size={layout.isTabletOrDesktop ? 130 : 100}
                knobSize={layout.isTabletOrDesktop ? 46 : 36}
                deadZone={12}
                disabled={isPaused}
              />
            </div>

            {/* Center Column: Game Canvas Maximized 1:1 Aspect Ratio (No thick border, no clipping) */}
            <div
              style={{
                width: `${layout.canvasSizePx}px`,
                height: `${layout.canvasSizePx}px`,
                maxWidth: `${layout.canvasSizePx}px`,
                maxHeight: `${layout.canvasSizePx}px`,
              }}
              className="flex-none flex items-center justify-center overflow-hidden p-0 relative mx-auto"
            >
              <PhaserGame
                mode="battle"
                engine={gameEngine}
                onStateUpdate={setGameState}
                onFpsUpdate={setFps}
                onPause={handlePause}
                canvasSizePx={layout.canvasSizePx}
                fpsLimit={targetFps}
              />

              {/* In MENU state: Overlay allowing immediate match start */}
              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 rounded-sm">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-black text-sm mb-2 shadow-lg">
                    BT
                  </div>
                  <h2 className="text-base font-black text-white tracking-wider mb-1">
                    BẮN TANK ONLINE
                  </h2>
                  <p className="text-[11px] text-amber-300 font-mono font-bold mb-3">
                    STAGE 1 • 30 Xe Địch • 1 Đại Bàng Hoàng Gia
                  </p>
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-lg shadow-amber-500/30 transition-transform active:scale-95 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>BẮT ĐẦU TRẬN ĐẤU</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Virtual Shoot Action Button Centered in right zone */}
            <div
              style={{
                width: `${layout.rightControlWidthPx}px`,
                minWidth: '90px',
              }}
              className="flex-1 flex items-center justify-center h-full"
            >
              <VirtualShootButton
                isShooting={landscapeShooting}
                onShootChange={handleLandscapeShootChange}
                size={layout.isTabletOrDesktop ? 76 : 64}
              />
            </div>
          </main>
        </div>
      ) : !isDesktop ? (
        /* =========================================================================
            MOBILE / TABLET PORTRAIT MODE (Dedicated 100dvh Top-to-Bottom Stack)
            - Top: Slim HUD (Brand, STAGE 1, FPS, PING: --, Score, Lives, Quick Actions)
            - Center: Game Canvas (Strictly 1:1, placed directly below HUD)
            - Below Canvas: Touch Controls (Centered with symmetric flex layout)
            - Bottom: Safe Area Buffer (Absorbs leftover space, keeping controls high above Safari bar)
           ========================================================================= */
        <div className="flex-1 flex flex-col h-[100dvh] max-h-[100dvh] w-screen overflow-hidden safe-area-inset bg-neutral-950">
          {/* Slim Portrait Top HUD */}
          <header className="h-9 bg-neutral-950/95 border-b border-neutral-800 px-3 flex items-center justify-between text-xs shrink-0 z-30">
            {/* Left: Brand & Stage */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-amber-500 flex items-center justify-center font-black text-black text-[11px] shadow">
                BT
              </div>
              <span className="font-extrabold text-amber-400 tracking-wider text-xs font-mono">
                STAGE 1
              </span>
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            </div>

            {/* Center: Live Match Metrics */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${getFpsBadgeStyle(fps)}`}>
                FPS: {fps}
              </span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold border bg-neutral-900 border-neutral-700 text-neutral-400" title="Chế độ Solo Stage 1 - Offline">
                PING: --
              </span>
              <div className="flex items-center gap-1 text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <span className="font-bold">{gameState?.score ?? 0}</span>
              </div>
              <div className="flex items-center gap-1 text-rose-400 font-bold">
                <Heart className="w-3.5 h-3.5 fill-rose-500" />
                <span>×{gameState?.p1State.lives ?? 3}</span>
              </div>
              <div className="flex items-center gap-1 text-sky-400">
                <Shield className="w-3.5 h-3.5" />
                <span>{gameState?.enemyQueue.length ?? 0}</span>
              </div>
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300"
                title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
              >
                {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-amber-400" />}
              </button>

              <button
                type="button"
                onClick={requestLandscape}
                className="p-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-amber-400"
                title="Chuyển sang xoay ngang màn hình"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="p-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300"
                title="Cài đặt & Âm thanh"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsDevDrawerOpen(true)}
                className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-[10px] font-semibold"
                title="Bảng Kiểm thử & QA"
              >
                <Wrench className="w-3 h-3 text-amber-400" />
                <span>QA</span>
              </button>
            </div>
          </header>

          {/* Main Content Stack: HUD -> Canvas -> Controls -> Safe Bottom Spacer */}
          <div className="flex-1 flex flex-col items-center justify-start w-full overflow-hidden px-2 pt-1 pb-1">
            {/* Game Canvas Strictly Sized & Centered (1:1 Square, placed directly below HUD) */}
            <main
              style={{
                width: `${layout.canvasSizePx}px`,
                height: `${layout.canvasSizePx}px`,
                maxWidth: `${layout.canvasSizePx}px`,
                maxHeight: `${layout.canvasSizePx}px`,
              }}
              className="shrink-0 flex items-center justify-center overflow-hidden relative mx-auto rounded-xl border border-neutral-800 bg-black shadow-2xl mt-0.5 sm:mt-1"
            >
              <PhaserGame
                mode="battle"
                engine={gameEngine}
                onStateUpdate={setGameState}
                onFpsUpdate={setFps}
                onPause={handlePause}
                canvasSizePx={layout.canvasSizePx}
                fpsLimit={targetFps}
              />

              {/* In MENU state: Overlay allowing immediate match start */}
              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20 rounded-xl">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-black text-sm mb-2 shadow-lg">
                    BT
                  </div>
                  <h2 className="text-base font-black text-white tracking-wider mb-1">
                    BẮN TANK ONLINE
                  </h2>
                  <p className="text-[11px] text-amber-300 font-mono font-bold mb-3">
                    STAGE 1 • 30 Xe Địch • 1 Đại Bàng Hoàng Gia
                  </p>
                  <button
                    type="button"
                    onClick={handleRestart}
                    className="py-2 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-lg shadow-amber-500/30 transition-transform active:scale-95 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>BẮT ĐẦU TRẬN ĐẤU</span>
                  </button>
                </div>
              )}
            </main>

            {/* Controls Cluster: Placed directly below Canvas, eliminating excess gap */}
            <div
              style={{
                width: `${layout.canvasSizePx}px`,
                maxWidth: '440px',
              }}
              className="w-full shrink-0 mx-auto mt-2 sm:mt-3 z-20 flex justify-center"
            >
              <TouchControls
                onInputChange={handleTouchInput}
                onPauseClick={isPaused ? handleResume : handlePause}
                isPaused={isPaused}
                controlType="joystick"
              />
            </div>

            {/* Safe Bottom Buffer: absorbs remaining viewport space, keeping controls high above Safari bar */}
            <div
              style={{
                minHeight: 'max(24px, env(safe-area-inset-bottom, 24px))',
              }}
              className="flex-1 w-full"
            />
          </div>
        </div>
      ) : (
        /* =========================================================================
            ENLARGED DESKTOP PC MODE (8/4 Grid Layout with Full Visibility)
           ========================================================================= */
        <div className="flex-1 flex flex-col w-full">
          {/* Header */}
          <header className="border-b border-neutral-800 bg-neutral-900/90 backdrop-blur px-4 py-2.5 sticky top-0 z-30 shadow-md">
            <div className="max-w-[1560px] mx-auto flex items-center justify-between gap-2">
              {/* Brand */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-black text-black shadow-lg shadow-amber-500/20 text-sm">
                  BT
                </div>
                <div>
                  <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white flex items-center gap-1.5">
                    Bắn Tank Online
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                      M4 Solo
                    </span>
                  </h1>
                  <p className="text-[10px] sm:text-xs text-neutral-400 hidden sm:block">
                    Phaser 3 + React + Pure Game Core | Vòng đời trận đấu | Cross-Platform & PC Scale
                  </p>
                </div>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-1.5 text-xs">
                {/* Fullscreen API Toggle Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 hover:border-amber-500 font-semibold transition-all active:scale-95 shadow"
                  title={isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-amber-400" />}
                  <span className="text-xs hidden sm:inline">{isFullscreen ? 'Thu nhỏ' : 'Toàn MH'}</span>
                </button>

                {/* Screen Orientation Rotate Button (Mobile/Tablet) */}
                <button
                  type="button"
                  onClick={requestLandscape}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-amber-500/30 font-semibold transition-all active:scale-95 shadow"
                  title="Chuyển sang chế độ xoay ngang màn hình"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span className="text-xs hidden sm:inline">Xoay ngang</span>
                </button>

                {/* Settings & Audio Modal Button */}
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-200 font-semibold transition-all shadow"
                  title="Cài đặt FPS, Độ khó & Âm thanh"
                >
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Cài đặt</span>
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
                    161 Tests
                  </span>
                </button>

                {/* Collapsible Menu Toggle (Mobile) */}
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
                  onClick={toggleFullscreen}
                  className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-200 font-semibold text-xs"
                >
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5 text-amber-400" /> : <Maximize className="w-3.5 h-3.5 text-amber-400" />}
                  <span>{isFullscreen ? 'Thu nhỏ cửa sổ' : 'Toàn màn hình'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsDevDrawerOpen(true);
                    setIsMenuExpanded(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-200 font-semibold"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-400" />
                  <span>Bảng 161 Tests Tự Động</span>
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

          {/* Main Content Area: Expanded to max-w-[1560px] with 8/4 grid on PC */}
          <main className="flex-1 max-w-[1560px] mx-auto w-full p-3 sm:p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            {/* Left Column: Enlarged Phaser Game Canvas (8 Cols on PC for maximum visibility) */}
            <section className="lg:col-span-8 flex flex-col gap-3">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                {/* Viewport Header */}
                <div className="bg-neutral-950 px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="font-semibold text-amber-400 font-mono">
                      STAGE 1 {isPaused ? '(PAUSED)' : ''}
                    </span>
                    {/* Live FPS & PING Performance Badges */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getFpsBadgeStyle(fps)}`}>
                      FPS: {fps}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold border bg-neutral-900 border-neutral-700 text-neutral-400" title="Chế độ Solo Stage 1 - Offline">
                      PING: --
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle Touch Controls on PC/Tablet */}
                    <button
                      onClick={() => setShowTouchControls((v) => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        showTouchControls
                          ? 'bg-neutral-800 text-amber-400 border-amber-500/40'
                          : 'text-neutral-400 border-neutral-800 hover:text-neutral-200'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Joystick: {showTouchControls ? 'Bật' : 'Tắt'}</span>
                    </button>

                    <button
                      onClick={isPaused ? handleResume : handlePause}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold"
                    >
                      <Pause className="w-3 h-3" />
                      <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng (P)'}</span>
                    </button>

                    <button
                      onClick={handleResetGame}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Đặt lại</span>
                    </button>
                  </div>
                </div>

                {/* Canvas Container: Prominently enlarged on PC up to 832px square (crisp integer scale) */}
                <div className="p-3 sm:p-5 lg:p-6 bg-neutral-950/80 flex items-center justify-center min-h-[380px] sm:min-h-[500px] lg:min-h-[640px] xl:min-h-[720px] relative">
                  <div className="w-full max-w-[min(calc(100vh-140px),832px)] aspect-square flex items-center justify-center">
                    <PhaserGame
                      mode="battle"
                      engine={gameEngine}
                      onStateUpdate={setGameState}
                      onFpsUpdate={setFps}
                      onPause={handlePause}
                      canvasSizePx={layout.canvasSizePx}
                      fpsLimit={targetFps}
                    />
                  </div>

                  {/* In MENU state: Overlay allowing immediate match start */}
                  {gameState?.matchState === 'MENU' && (
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-20 rounded-xl">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center font-black text-black text-xl mb-3 shadow-xl shadow-amber-500/20">
                        BT
                      </div>
                      <h2 className="text-xl sm:text-2xl font-black text-white tracking-wider mb-1.5">
                        BẮN TANK ONLINE
                      </h2>
                      <p className="text-xs sm:text-sm text-neutral-400 mb-5 max-w-sm">
                        Chiến dịch Solo • 30 Xe Địch • 1 Đại Bàng Hoàng Gia • Tốc độ 60Hz Chuẩn Xác
                      </p>
                      <button
                        type="button"
                        onClick={handleRestart}
                        className="py-3 px-8 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm shadow-xl shadow-amber-500/30 transition-transform active:scale-95 flex items-center gap-2.5"
                      >
                        <Play className="w-4 h-4 fill-black" />
                        <span>BẮT ĐẦU TRẬN ĐẤU (SPACE / ENTER)</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Viewport Footer */}
                <div className="bg-neutral-950 px-4 py-2.5 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-3 text-neutral-400 text-[11px]">
                    <span className="flex items-center gap-1 text-neutral-300">
                      <Monitor className="w-3.5 h-3.5 text-amber-400" />
                      <span>Bàn phím PC:</span>
                    </span>
                    <span>Di chuyển: <strong className="text-white">WASD / Mũi tên</strong></span>
                    <span>•</span>
                    <span>Bắn: <strong className="text-white">Space / J</strong></span>
                    <span>•</span>
                    <span>Tạm dừng: <strong className="text-white">P / ESC</strong></span>
                  </div>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    208×208 px (Scale 1:1 Pixel-Art)
                  </div>
                </div>
              </div>

              {/* Virtual Touch Controls with Joystick (Visible when toggled on or on mobile) */}
              {showTouchControls && (
                <TouchControls
                  onInputChange={handleTouchInput}
                  onPauseClick={isPaused ? handleResume : handlePause}
                  isPaused={isPaused}
                  controlType="joystick"
                />
              )}
            </section>

            {/* Right Column: Live Combat HUD & Quick Stats (4 Cols on PC) */}
            <section className="lg:col-span-4 flex flex-col gap-4">
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
                    115/115 PASS
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Đã kiểm toán và tích hợp toàn bộ 115 kiểm thử tự động (M1, M2, M3, M4, Sửa lỗi, UI Polish, Joystick, 5 Nhóm Gameplay, 6 Nhóm M6 PC Scale & M6 Round 2 Responsive/Eagle/Explosion) trong ngăn kéo QA riêng biệt.
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
        onOpenSettings={() => setIsSettingsOpen(true)}
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
