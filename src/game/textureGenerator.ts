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

  // 10. RUINED BASE (16x16 pixel) - Rubble and destroyed flag
  if (!scene.textures.exists('tile_9_ruined')) {
    const canvas = scene.textures.createCanvas('tile_9_ruined', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);

      // Charred rubble
      ctx.fillStyle = '#404040';
      ctx.fillRect(2, 6, 12, 9);
      ctx.fillStyle = '#737373';
      ctx.fillRect(4, 8, 8, 5);

      // Skull / ruins symbol
      ctx.fillStyle = '#e5e5e5';
      ctx.fillRect(6, 4, 4, 3);
      ctx.fillRect(5, 7, 6, 3);
      ctx.fillStyle = '#000000';
      ctx.fillRect(6, 8, 1, 1);
      ctx.fillRect(9, 8, 1, 1);
      canvas.refresh();
    }
  }

  // 11. BULLET (4x4 pixel) - Golden/orange core with bright center
  if (!scene.textures.exists('bullet')) {
    const canvas = scene.textures.createCanvas('bullet', 4, 4);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#ea580c'; // Orange rim
      ctx.fillRect(0, 0, 4, 4);
      ctx.fillStyle = '#fef08a'; // White-yellow core
      ctx.fillRect(1, 1, 2, 2);
      canvas.refresh();
    }
  }

  // 12. P1 YELLOW TANK SPRITES (16x16 pixel in 4 directions)
  generateTankTextures(scene);

  // 13. BRICK 8x8 SUB-TILES
  generateBrickSubTileTextures(scene);
}

function generateTankTextures(scene: Phaser.Scene): void {
  const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];

  for (const dir of directions) {
    const key = `tank_p1_${dir}`;
    if (scene.textures.exists(key)) continue;

    const canvas = scene.textures.createCanvas(key, 16, 16);
    if (!canvas) continue;
    const ctx = canvas.getContext();

    // Transparent background
    ctx.clearRect(0, 0, 16, 16);

    const yellowMain = '#eab308';
    const yellowLight = '#fef08a';
    const yellowDark = '#a16207';
    const trackColor = '#475569';
    const trackLight = '#94a3b8';

    if (dir === 'up') {
      // Left track (x: 1..3, y: 2..15)
      ctx.fillStyle = trackColor;
      ctx.fillRect(1, 2, 3, 13);
      ctx.fillStyle = trackLight;
      ctx.fillRect(1, 3, 3, 2);
      ctx.fillRect(1, 7, 3, 2);
      ctx.fillRect(1, 11, 3, 2);

      // Right track (x: 12..14, y: 2..15)
      ctx.fillStyle = trackColor;
      ctx.fillRect(12, 2, 3, 13);
      ctx.fillStyle = trackLight;
      ctx.fillRect(12, 3, 3, 2);
      ctx.fillRect(12, 7, 3, 2);
      ctx.fillRect(12, 11, 3, 2);

      // Tank Body (x: 4..11, y: 4..14)
      ctx.fillStyle = yellowMain;
      ctx.fillRect(4, 4, 8, 11);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(4, 4, 8, 1);
      ctx.fillRect(4, 4, 1, 11);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(4, 14, 8, 1);
      ctx.fillRect(11, 4, 1, 11);

      // Central Turret (x: 5..10, y: 6..11)
      ctx.fillStyle = yellowDark;
      ctx.fillRect(5, 6, 6, 6);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(6, 7, 4, 4);

      // Cannon Barrel (x: 7..8, y: 0..6)
      ctx.fillStyle = yellowLight;
      ctx.fillRect(7, 0, 2, 7);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(7, 0, 1, 7);
    } else if (dir === 'down') {
      // Left track
      ctx.fillStyle = trackColor;
      ctx.fillRect(1, 1, 3, 13);
      ctx.fillStyle = trackLight;
      ctx.fillRect(1, 2, 3, 2);
      ctx.fillRect(1, 6, 3, 2);
      ctx.fillRect(1, 10, 3, 2);

      // Right track
      ctx.fillStyle = trackColor;
      ctx.fillRect(12, 1, 3, 13);
      ctx.fillStyle = trackLight;
      ctx.fillRect(12, 2, 3, 2);
      ctx.fillRect(12, 6, 3, 2);
      ctx.fillRect(12, 10, 3, 2);

      // Tank Body
      ctx.fillStyle = yellowMain;
      ctx.fillRect(4, 1, 8, 11);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(4, 1, 8, 1);
      ctx.fillRect(4, 1, 1, 11);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(4, 11, 8, 1);
      ctx.fillRect(11, 1, 1, 11);

      // Central Turret
      ctx.fillStyle = yellowDark;
      ctx.fillRect(5, 4, 6, 6);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(6, 5, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = yellowLight;
      ctx.fillRect(7, 9, 2, 7);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(8, 9, 1, 7);
    } else if (dir === 'left') {
      // Top track (x: 2..15, y: 1..3)
      ctx.fillStyle = trackColor;
      ctx.fillRect(2, 1, 13, 3);
      ctx.fillStyle = trackLight;
      ctx.fillRect(3, 1, 2, 3);
      ctx.fillRect(7, 1, 2, 3);
      ctx.fillRect(11, 1, 2, 3);

      // Bottom track (x: 2..15, y: 12..14)
      ctx.fillStyle = trackColor;
      ctx.fillRect(2, 12, 13, 3);
      ctx.fillStyle = trackLight;
      ctx.fillRect(3, 12, 2, 3);
      ctx.fillRect(7, 12, 2, 3);
      ctx.fillRect(11, 12, 2, 3);

      // Tank Body (x: 4..14, y: 4..11)
      ctx.fillStyle = yellowMain;
      ctx.fillRect(4, 4, 11, 8);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(4, 4, 11, 1);
      ctx.fillRect(4, 4, 1, 8);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(4, 11, 11, 1);
      ctx.fillRect(14, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = yellowDark;
      ctx.fillRect(6, 5, 6, 6);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(7, 6, 4, 4);

      // Cannon Barrel (x: 0..6, y: 7..8)
      ctx.fillStyle = yellowLight;
      ctx.fillRect(0, 7, 7, 2);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(0, 8, 7, 1);
    } else if (dir === 'right') {
      // Top track
      ctx.fillStyle = trackColor;
      ctx.fillRect(1, 1, 13, 3);
      ctx.fillStyle = trackLight;
      ctx.fillRect(2, 1, 2, 3);
      ctx.fillRect(6, 1, 2, 3);
      ctx.fillRect(10, 1, 2, 3);

      // Bottom track
      ctx.fillStyle = trackColor;
      ctx.fillRect(1, 12, 13, 3);
      ctx.fillStyle = trackLight;
      ctx.fillRect(2, 12, 2, 3);
      ctx.fillRect(6, 12, 2, 3);
      ctx.fillRect(10, 12, 2, 3);

      // Tank Body
      ctx.fillStyle = yellowMain;
      ctx.fillRect(1, 4, 11, 8);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(1, 4, 11, 1);
      ctx.fillRect(1, 4, 1, 8);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(1, 11, 11, 1);
      ctx.fillRect(11, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = yellowDark;
      ctx.fillRect(4, 5, 6, 6);
      ctx.fillStyle = yellowLight;
      ctx.fillRect(5, 6, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = yellowLight;
      ctx.fillRect(9, 7, 7, 2);
      ctx.fillStyle = yellowDark;
      ctx.fillRect(9, 7, 7, 1);
    }

    canvas.refresh();
  }
}

function generateBrickSubTileTextures(scene: Phaser.Scene): void {
  // 8x8 Quarter-tile textures
  if (!scene.textures.exists('brick_sub_tl')) {
    const canvas = scene.textures.createCanvas('brick_sub_tl', 8, 8);
    if (canvas) {
      drawSubTile(canvas.getContext(), 0, 0);
      canvas.refresh();
    }
  }
  if (!scene.textures.exists('brick_sub_tr')) {
    const canvas = scene.textures.createCanvas('brick_sub_tr', 8, 8);
    if (canvas) {
      drawSubTile(canvas.getContext(), 8, 0);
      canvas.refresh();
    }
  }
  if (!scene.textures.exists('brick_sub_bl')) {
    const canvas = scene.textures.createCanvas('brick_sub_bl', 8, 8);
    if (canvas) {
      drawSubTile(canvas.getContext(), 0, 8);
      canvas.refresh();
    }
  }
  if (!scene.textures.exists('brick_sub_br')) {
    const canvas = scene.textures.createCanvas('brick_sub_br', 8, 8);
    if (canvas) {
      drawSubTile(canvas.getContext(), 8, 8);
      canvas.refresh();
    }
  }
}

function drawSubTile(ctx: CanvasRenderingContext2D, srcX: number, srcY: number): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 8, 8);

  const brickRed = '#c84c0c';
  const brickLight = '#e47d33';
  const brickDark = '#8c2800';

  // 2 rows of bricks inside an 8px sub-tile
  for (let r = 0; r < 2; r++) {
    const y = r * 4;
    const globalRow = (srcY / 4) + r;
    const offset = (globalRow % 2 === 0) ? 0 : 4;

    for (let b = -2; b < 3; b++) {
      const globalX = b * 8 + offset;
      const localX = globalX - srcX;

      if (localX + 7 > 0 && localX < 8) {
        const x = Math.max(0, localX);
        const w = Math.min(7, 8 - localX);
        ctx.fillStyle = brickRed;
        ctx.fillRect(x, y, w, 3);
        ctx.fillStyle = brickLight;
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y, 1, 3);
        ctx.fillStyle = brickDark;
        ctx.fillRect(x, y + 2, w, 1);
      }
    }
  }
}
