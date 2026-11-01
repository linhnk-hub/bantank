/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Phaser from 'phaser';

/**
 * Creates authentic 16x16 retro pixel-art textures for all tile types.
 * Runs directly on Phaser's texture manager with zero external asset dependencies,
 * guaranteeing no broken image links, sharp nearest-neighbor rendering, and offline support.
 */
export function generateTileTextures(scene: Phaser.Scene): void {
  // 1. BRICK (16x16 pixel) - Classic 4-layer brick pattern with highlights and shadows
  if (!scene.textures.exists('tile_1')) {
    const canvas = scene.textures.createCanvas('tile_1', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000'; // Mortar dark outline
      ctx.fillRect(0, 0, 16, 16);

      // Brick rows: each row 4px tall (3px brick + 1px mortar)
      const brickRed = '#c84c0c';
      const brickLight = '#e47d33';
      const brickDark = '#8c2800';

      // 4 brick horizontal strips
      for (let r = 0; r < 4; r++) {
        const y = r * 4;
        const offset = (r % 2 === 0) ? 0 : 4;

        for (let b = -1; b < 3; b++) {
          const x = b * 8 + offset;
          // Draw individual brick of 7x3 inside
          ctx.fillStyle = brickRed;
          ctx.fillRect(Math.max(0, x), y, Math.min(7, 16 - x), 3);
          // Highlight on top & left
          ctx.fillStyle = brickLight;
          ctx.fillRect(Math.max(0, x), y, Math.min(7, 16 - x), 1);
          ctx.fillRect(Math.max(0, x), y, 1, 3);
          // Shadow on bottom
          ctx.fillStyle = brickDark;
          ctx.fillRect(Math.max(0, x), y + 2, Math.min(7, 16 - x), 1);
        }
      }
      canvas.refresh();
    }
  }

  // 2. STEEL (16x16 pixel) - 4 steel plates (8x8 each) with beveled edges and rivets
  if (!scene.textures.exists('tile_2')) {
    const canvas = scene.textures.createCanvas('tile_2', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#2b2b2b'; // Dark gap
      ctx.fillRect(0, 0, 16, 16);

      const plateBase = '#b0b8c0';
      const plateHighlight = '#ffffff';
      const plateShadow = '#5a626a';

      // 4 quadrants (2x2 plates)
      const positions = [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
        { x: 0, y: 8 },
        { x: 8, y: 8 },
      ];

      for (const pos of positions) {
        ctx.fillStyle = plateBase;
        ctx.fillRect(pos.x + 1, pos.y + 1, 6, 6);

        // Highlight top & left
        ctx.fillStyle = plateHighlight;
        ctx.fillRect(pos.x + 1, pos.y + 1, 6, 1);
        ctx.fillRect(pos.x + 1, pos.y + 1, 1, 6);

        // Shadow bottom & right
        ctx.fillStyle = plateShadow;
        ctx.fillRect(pos.x + 1, pos.y + 6, 6, 1);
        ctx.fillRect(pos.x + 6, pos.y + 1, 1, 6);

        // Central steel sheen dot
        ctx.fillStyle = '#e8ecf0';
        ctx.fillRect(pos.x + 3, pos.y + 3, 2, 2);
      }
      canvas.refresh();
    }
  }

  // 3. WATER (16x16 pixel) - Deep blue with undulating cyan ripples
  if (!scene.textures.exists('tile_3')) {
    const canvas = scene.textures.createCanvas('tile_3', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#1c429c';
      ctx.fillRect(0, 0, 16, 16);

      ctx.fillStyle = '#3f78e0';
      ctx.fillRect(1, 3, 6, 2);
      ctx.fillRect(9, 7, 6, 2);
      ctx.fillRect(3, 11, 7, 2);

      ctx.fillStyle = '#99c7ff';
      ctx.fillRect(2, 4, 3, 1);
      ctx.fillRect(10, 8, 3, 1);
      ctx.fillRect(4, 12, 4, 1);
      canvas.refresh();
    }
  }

  // 4. GRASS (16x16 pixel) - Dense camouflage green pixel leaves
  if (!scene.textures.exists('tile_4')) {
    const canvas = scene.textures.createCanvas('tile_4', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#1b7a2b';
      ctx.fillRect(0, 0, 16, 16);

      const lightGreen = '#4ade80';
      const darkGreen = '#0e4a19';

      // Pixel foliage clusters
      const lightPixels = [
        [2, 2], [6, 1], [11, 3], [4, 7], [9, 8], [14, 6],
        [1, 12], [7, 13], [12, 11], [10, 14]
      ];
      ctx.fillStyle = lightGreen;
      for (const [px, py] of lightPixels) {
        ctx.fillRect(px, py, 2, 2);
      }

      const darkPixels = [
        [0, 5], [8, 4], [13, 1], [3, 10], [9, 11], [14, 14], [5, 15]
      ];
      ctx.fillStyle = darkGreen;
      for (const [px, py] of darkPixels) {
        ctx.fillRect(px, py, 2, 2);
      }
      canvas.refresh();
    }
  }

  // 5. ICE (16x16 pixel) - Slick white-blue ice sheet with reflective diagonals
  if (!scene.textures.exists('tile_5')) {
    const canvas = scene.textures.createCanvas('tile_5', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(0, 0, 16, 16);

      ctx.fillStyle = '#bfdbfe';
      ctx.fillRect(2, 2, 5, 5);
      ctx.fillRect(9, 9, 5, 5);

      ctx.fillStyle = '#ffffff';
      // Diagonal glare
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(3 + i, 8 + i, 1, 1);
        ctx.fillRect(9 + i, 2 + i, 1, 1);
      }
      canvas.refresh();
    }
  }

  // 9. BASE TILES (16x16 each)
  // Since the user specification explicitly requires 3 consecutive BASE cells at row 12 [cols 5, 6, 7],
  // we generate specific textures for:
  // - base_left (col 5): left wing of the golden eagle base / bunker
  // - base_center (col 6): golden eagle head & crest / star
  // - base_right (col 7): right wing of the golden eagle base / bunker
  // - base_single (generic 16x16 fallback)
  if (!scene.textures.exists('tile_9_left')) {
    const canvas = scene.textures.createCanvas('tile_9_left', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);

      // Base bunker frame
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(1, 1, 15, 14);

      // Left wing of golden eagle
      ctx.fillStyle = '#facc15';
      ctx.fillRect(6, 3, 10, 10);
      ctx.fillRect(3, 5, 6, 6);
      ctx.fillRect(1, 7, 4, 4);

      // Feathers / details
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 4, 8, 1);
      ctx.fillRect(3, 6, 4, 1);

      ctx.fillStyle = '#713f12';
      ctx.fillRect(6, 8, 9, 1);
      ctx.fillRect(4, 10, 6, 1);
      canvas.refresh();
    }
  }

  if (!scene.textures.exists('tile_9_center')) {
    const canvas = scene.textures.createCanvas('tile_9_center', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);

      // Base bunker center
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(0, 1, 16, 14);

      // Golden Eagle Head & Body
      ctx.fillStyle = '#facc15';
      ctx.fillRect(2, 2, 12, 12);

      // Eagle white crown / beak
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(5, 3, 6, 3);
      ctx.fillStyle = '#fb923c'; // Beak
      ctx.fillRect(7, 5, 2, 2);

      // Center Star / Crest
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(6, 8, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(7, 9, 2, 2);
      canvas.refresh();
    }
  }

  if (!scene.textures.exists('tile_9_right')) {
    const canvas = scene.textures.createCanvas('tile_9_right', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);

      // Base bunker frame
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(0, 1, 15, 14);

      // Right wing of golden eagle
      ctx.fillStyle = '#facc15';
      ctx.fillRect(0, 3, 10, 10);
      ctx.fillRect(7, 5, 6, 6);
      ctx.fillRect(11, 7, 4, 4);

      // Feathers / details
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(2, 4, 8, 1);
      ctx.fillRect(9, 6, 4, 1);

      ctx.fillStyle = '#713f12';
      ctx.fillRect(1, 8, 9, 1);
      ctx.fillRect(6, 10, 6, 1);
      canvas.refresh();
    }
  }

  // Generic fallback for any other BASE cell
  if (!scene.textures.exists('tile_9')) {
    const canvas = scene.textures.createCanvas('tile_9', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(2, 2, 12, 12);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(5, 5, 6, 6);
      canvas.refresh();
    }
  }
}
