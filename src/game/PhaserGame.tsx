/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { MAP_DIMENSIONS } from '../core/constants.ts';
import { StageViewerScene, type SceneTileHoverInfo } from './scenes/StageViewerScene.ts';
import { BattleScene } from './scenes/BattleScene.ts';
import { GameEngine } from '../core/gameEngine.ts';
import { CoopOnlineManager } from '../core/coopOnlineManager.ts';
import type { GameCoreState } from '../core/types.ts';

interface PhaserGameProps {
  mode: 'inspector' | 'battle';
  // Props for Milestone 1 inspector
  showGrid?: boolean;
  showCoords?: boolean;
  onTileHover?: (info: SceneTileHoverInfo | null) => void;
  // Props for Milestone 2 battle
  engine?: GameEngine;
  onStateUpdate?: (state: GameCoreState) => void;
  onFpsUpdate?: (fps: number) => void;
  onPause?: () => void;
  canvasSizePx?: number;
  fpsLimit?: 30 | 60;
}

export const PhaserGame: React.FC<PhaserGameProps> = ({
  mode,
  showGrid = true,
  showCoords = false,
  onTileHover,
  engine,
  onStateUpdate,
  onFpsUpdate,
  onPause,
  canvasSizePx,
  fpsLimit = 60,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const stageSceneRef = useRef<StageViewerScene | null>(null);
  const battleSceneRef = useRef<BattleScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let activeScene: Phaser.Scene;

    if (mode === 'inspector') {
      const stageScene = new StageViewerScene();
      stageSceneRef.current = stageScene;
      if (onTileHover) {
        stageScene.setTileHoverCallback(onTileHover);
      }
      activeScene = stageScene;
    } else {
      const battleScene = new BattleScene(engine);
      battleSceneRef.current = battleScene;
      if (onStateUpdate) {
        battleScene.setStateCallback(onStateUpdate);
      }
      if (onFpsUpdate) {
        battleScene.setFpsCallback(onFpsUpdate);
      }
      if (onPause) {
        battleScene.setPauseCallback(onPause);
      }
      activeScene = battleScene;
    }

    const isCoarseTouchDevice =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    if (mode === 'battle' && battleSceneRef.current && fpsLimit !== undefined) {
      battleSceneRef.current.setFpsLimit(fpsLimit);
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: isCoarseTouchDevice ? Phaser.CANVAS : Phaser.AUTO,
      parent: containerRef.current,
      width: MAP_DIMENSIONS.TOTAL_WIDTH_PX,
      height: MAP_DIMENSIONS.TOTAL_HEIGHT_PX,
      backgroundColor: '#000000',
      pixelArt: true, // Crisp retro nearest-neighbor pixel rendering
      roundPixels: true,
      render: {
        antialias: false,
        antialiasGL: false,
        pixelArt: true,
        roundPixels: true,
        powerPreference: 'low-power',
        transparent: false,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      fps: {
        target: 60,
        forceSetTimeOut: false,
        smoothStep: false,
      },
      scene: [activeScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Handle tab visibility change for simulation pausing and zero-GPU sleep when backgrounded
    const handleVisibility = () => {
      const isVisible = document.visibilityState === 'visible';
      if (mode === 'battle' && battleSceneRef.current) {
        const eng = battleSceneRef.current.getEngine();
        eng.handleVisibilityChange(isVisible);
        const isOnlineHost =
          eng.getGameMode() === 'TWO_PLAYERS_ONLINE' &&
          CoopOnlineManager.getInstance().getRole() === 'HOST';
        if (!isVisible && !isOnlineHost) {
          game.loop.sleep();
        } else if (isVisible) {
          game.loop.wake();
        }
      } else {
        if (!isVisible) {
          game.loop.sleep();
        } else {
          game.loop.wake();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      game.destroy(true);
      gameRef.current = null;
      stageSceneRef.current = null;
      battleSceneRef.current = null;
    };
  }, [mode, engine]);

  // Sync grid overlay toggle (Inspector mode)
  useEffect(() => {
    if (stageSceneRef.current && showGrid !== undefined) {
      stageSceneRef.current.toggleGrid(showGrid);
    }
  }, [showGrid]);

  // Sync coords overlay toggle (Inspector mode)
  useEffect(() => {
    if (stageSceneRef.current && showCoords !== undefined) {
      stageSceneRef.current.toggleCoords(showCoords);
    }
  }, [showCoords]);

  // Sync hover callback (Inspector mode)
  useEffect(() => {
    if (stageSceneRef.current && onTileHover) {
      stageSceneRef.current.setTileHoverCallback(onTileHover);
    }
  }, [onTileHover]);

  // Sync state callback (Battle mode)
  useEffect(() => {
    if (battleSceneRef.current && onStateUpdate) {
      battleSceneRef.current.setStateCallback(onStateUpdate);
    }
  }, [onStateUpdate]);

  // Sync fps callback (Battle mode)
  useEffect(() => {
    if (battleSceneRef.current && onFpsUpdate) {
      battleSceneRef.current.setFpsCallback(onFpsUpdate);
    }
  }, [onFpsUpdate]);

  // Sync FPS Limit setting (30 FPS vs 60 FPS)
  useEffect(() => {
    if (battleSceneRef.current && fpsLimit !== undefined) {
      battleSceneRef.current.setFpsLimit(fpsLimit);
    }
  }, [fpsLimit]);

  // Instantly recalculate & refresh Phaser scale on canvasSizePx or orientation update
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.scale.resize(MAP_DIMENSIONS.TOTAL_WIDTH_PX, MAP_DIMENSIONS.TOTAL_HEIGHT_PX);
      gameRef.current.scale.refresh();
    }
  }, [canvasSizePx]);

  return (
    <div
      translate="no"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="battle-touch-lock notranslate relative flex items-center justify-center w-full h-full select-none overflow-hidden p-0 m-0"
    >
      {/* Crisp pixel scaling container: strictly fits 100% inside parent with zero edge clipping */}
      <div
        ref={containerRef}
        className="game-canvas-container aspect-square w-full h-full overflow-hidden bg-black flex items-center justify-center shrink-0 p-0 m-0"
        style={{
          boxSizing: 'border-box',
          maxWidth: '100%',
          maxHeight: '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};
