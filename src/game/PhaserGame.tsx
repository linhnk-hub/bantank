/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { MAP_DIMENSIONS } from '../core/constants.ts';
import { StageViewerScene, type SceneTileHoverInfo } from './scenes/StageViewerScene.ts';

interface PhaserGameProps {
  showGrid: boolean;
  showCoords: boolean;
  onTileHover?: (info: SceneTileHoverInfo | null) => void;
}

export const PhaserGame: React.FC<PhaserGameProps> = ({
  showGrid,
  showCoords,
  onTileHover,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<StageViewerScene | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new StageViewerScene();
    sceneRef.current = scene;

    if (onTileHover) {
      scene.setTileHoverCallback(onTileHover);
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
      scene: [scene],
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Sync grid overlay toggle
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.toggleGrid(showGrid);
    }
  }, [showGrid]);

  // Sync coords overlay toggle
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.toggleCoords(showCoords);
    }
  }, [showCoords]);

  // Sync hover callback
  useEffect(() => {
    if (sceneRef.current && onTileHover) {
      sceneRef.current.setTileHoverCallback(onTileHover);
    }
  }, [onTileHover]);

  return (
    <div className="relative flex items-center justify-center w-full h-full bg-neutral-950 p-2 select-none">
      {/* Crisp pixel scaling container */}
      <div
        ref={containerRef}
        className="w-full max-w-[520px] aspect-square rounded border-4 border-neutral-700 shadow-2xl overflow-hidden bg-black flex items-center justify-center"
        style={{
          imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};
