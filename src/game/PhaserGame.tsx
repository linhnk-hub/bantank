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

  return (
    <div className="relative flex items-center justify-center w-full h-full select-none overflow-hidden">
      {/* Crisp pixel scaling container: strictly aspect-square 1:1 with crisp pixel scaling */}
      <div
        ref={containerRef}
        className="w-full h-full max-w-full max-h-full aspect-square rounded-xl border-2 sm:border-4 border-neutral-700 shadow-2xl overflow-hidden bg-black flex items-center justify-center"
        style={{
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};
