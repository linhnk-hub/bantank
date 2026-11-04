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

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: MAP_DIMENSIONS.TOTAL_WIDTH_PX,
      height: MAP_DIMENSIONS.TOTAL_HEIGHT_PX,
      backgroundColor: '#000000',
      pixelArt: true, // Crisp retro nearest-neighbor pixel rendering
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [activeScene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Handle tab visibility change for simulation pausing
    const handleVisibility = () => {
      const isVisible = document.visibilityState === 'visible';
      if (mode === 'battle' && battleSceneRef.current) {
        battleSceneRef.current.getEngine().handleVisibilityChange(isVisible);
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
    <div className="relative flex items-center justify-center w-full h-full select-none overflow-hidden p-0 m-0">
      {/* Crisp pixel scaling container: strictly aspect-square 1:1, 1px thin border, no rounded-corner clipping */}
      <div
        ref={containerRef}
        className="aspect-square rounded-none sm:rounded-sm border border-neutral-800/90 shadow-2xl overflow-hidden bg-black flex items-center justify-center shrink-0 p-0 m-0"
        style={{
          boxSizing: 'content-box',
          width: canvasSizePx ? `${canvasSizePx}px` : '100%',
          height: canvasSizePx ? `${canvasSizePx}px` : '100%',
          maxWidth: canvasSizePx ? `${canvasSizePx}px` : '100%',
          maxHeight: canvasSizePx ? `${canvasSizePx}px` : '100%',
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};
