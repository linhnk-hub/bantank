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
  // 9. BASE TILES (16x16 each)
  // Single Eagle Architecture:
  // - Col 6: ONLY ONE central Golden Eagle emblem (tile_9_center / tile_eagle_center)
  // - Col 5: Left protective bunker rampart (tile_9_left / bunker_flank_left, NO eagle)
  // - Col 7: Right protective bunker rampart (tile_9_right / bunker_flank_right, NO eagle)
  // - Ruined states: tile_eagle_ruined (Col 6) and bunker_flank_ruined (Col 5 & 7)

  // Left Bunker Rampart (Col 5) - Reinforced fortress concrete and steel plating (NO eagle)
  if (!scene.textures.exists('tile_9_left')) {
    const canvas = scene.textures.createCanvas('tile_9_left', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 16, 16);

      // Heavy armored bunker foundation
      ctx.fillStyle = '#3f3f46'; // Slate concrete
      ctx.fillRect(1, 1, 15, 14);

      // Steel armor plating trim
      ctx.fillStyle = '#52525b';
      ctx.fillRect(2, 2, 13, 3);
      ctx.fillRect(2, 6, 13, 8);

      // Slits & rivets
      ctx.fillStyle = '#18181b';
      ctx.fillRect(4, 7, 8, 2); // Bunker observation slit
      ctx.fillRect(3, 3, 2, 1); // Rivets
      ctx.fillRect(11, 3, 2, 1);
      ctx.fillRect(3, 11, 2, 1);
      ctx.fillRect(11, 11, 2, 1);

      // Chamfer highlight
      ctx.fillStyle = '#71717a';
      ctx.fillRect(1, 1, 15, 1);
      ctx.fillRect(1, 1, 1, 14);

      canvas.refresh();
    }
  }

  // =========================================================================
  // 9. ROYAL EAGLE BASE TILES (16x16 pixel art)
  // Single Eagle Architecture:
  // - Col 6: Imperial Royal Eagle (tile_9, tile_9_center, tile_eagle_center)
  // - High-contrast military heraldry with outspread wings, white crown head,
  //   crimson imperial crest shield, and fortified pedestal.
  // =========================================================================

  function renderRoyalEagle(ctx: CanvasRenderingContext2D) {
    // 0. Dark background
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, 16, 16);

    // 1. Granite Pedestal / Fortress Base (Rows 13-15)
    ctx.fillStyle = '#1e1e24';
    ctx.fillRect(1, 13, 14, 3);
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(2, 13, 12, 1);
    ctx.fillStyle = '#52525b';
    ctx.fillRect(3, 14, 10, 1);
    ctx.fillStyle = '#71717a';
    ctx.fillRect(4, 13, 8, 1); // Top highlight of plinth

    // 2. Outspread Golden Wings (Rows 2-10)
    // Dark bronze shadow base
    ctx.fillStyle = '#78350f';
    ctx.fillRect(1, 2, 14, 9);

    // Primary gold feathers
    ctx.fillStyle = '#ca8a04';
    // Left wing
    ctx.fillRect(1, 2, 4, 3);
    ctx.fillRect(0, 4, 4, 4);
    ctx.fillRect(1, 7, 4, 3);
    // Right wing
    ctx.fillRect(11, 2, 4, 3);
    ctx.fillRect(12, 4, 4, 4);
    ctx.fillRect(11, 7, 4, 3);

    // Radiant bright gold feathers
    ctx.fillStyle = '#eab308';
    ctx.fillRect(2, 3, 3, 2);
    ctx.fillRect(1, 5, 3, 3);
    ctx.fillRect(2, 7, 3, 2);
    ctx.fillRect(11, 3, 3, 2);
    ctx.fillRect(12, 5, 3, 3);
    ctx.fillRect(11, 7, 3, 2);

    // Sunlit wingtip feather highlights
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(1, 2, 2, 1);
    ctx.fillRect(0, 4, 1, 2);
    ctx.fillRect(13, 2, 2, 1);
    ctx.fillRect(15, 4, 1, 2);

    // 3. Central Imperial Crest Shield (Rows 6-10)
    ctx.fillStyle = '#991b1b'; // Crimson shield frame
    ctx.fillRect(5, 6, 6, 5);
    ctx.fillStyle = '#dc2626'; // Bright red core
    ctx.fillRect(6, 7, 4, 3);

    // Golden Star / Eagle Heart in shield
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(7, 7, 2, 3);
    ctx.fillRect(6, 8, 4, 1);

    // 4. Eagle Talons & Fan Tail (Rows 11-12)
    ctx.fillStyle = '#ea580c'; // Golden amber talons
    ctx.fillRect(4, 11, 2, 2);
    ctx.fillRect(10, 11, 2, 2);
    ctx.fillStyle = '#ca8a04'; // Tail feathers
    ctx.fillRect(6, 11, 4, 2);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(7, 12, 2, 1);

    // 5. White Imperial Crown & Noble Head (Rows 1-5)
    // White/Ivory plumage
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 1, 4, 4);
    ctx.fillRect(5, 3, 6, 2);

    // Hooked Golden Beak
    ctx.fillStyle = '#f97316';
    ctx.fillRect(7, 3, 2, 3);
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(7, 4, 2, 1);

    // Piercing Dark Eyes
    ctx.fillStyle = '#09090b';
    ctx.fillRect(6, 2, 1, 1);
    ctx.fillRect(9, 2, 1, 1);

    // Regal Crown Crest Top
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(7, 0, 2, 1);
    ctx.fillRect(6, 1, 1, 1);
    ctx.fillRect(9, 1, 1, 1);
  }

  function renderRuinedEagle(ctx: CanvasRenderingContext2D) {
    // 0. Charred crater background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, 16, 16);

    // 1. Fractured granite foundation
    ctx.fillStyle = '#18181b';
    ctx.fillRect(1, 12, 14, 4);
    ctx.fillStyle = '#27272a';
    ctx.fillRect(2, 13, 5, 2);
    ctx.fillRect(9, 12, 5, 3);

    // 2. Shattered debris & jagged rubble
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(3, 9, 4, 3);
    ctx.fillRect(9, 8, 4, 4);
    ctx.fillRect(1, 11, 3, 2);

    // 3. Broken golden eagle shards in dirt
    ctx.fillStyle = '#78350f';
    ctx.fillRect(2, 7, 3, 2);
    ctx.fillRect(10, 6, 3, 2);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(3, 8, 2, 1);
    ctx.fillRect(11, 7, 2, 1);

    // 4. Fallen cracked crest
    ctx.fillStyle = '#450a0a';
    ctx.fillRect(6, 9, 4, 3);
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(7, 10, 2, 2);

    // 5. Glowing embers and flame sparks
    ctx.fillStyle = '#dc2626'; // Hot red embers
    ctx.fillRect(4, 11, 1, 1);
    ctx.fillRect(8, 9, 1, 1);
    ctx.fillRect(12, 11, 1, 1);

    ctx.fillStyle = '#f97316'; // Orange embers
    ctx.fillRect(5, 12, 1, 1);
    ctx.fillRect(7, 8, 1, 1);
    ctx.fillRect(11, 10, 1, 1);

    ctx.fillStyle = '#fef08a'; // Bright yellow sparks
    ctx.fillRect(7, 7, 1, 1);
    ctx.fillRect(10, 9, 1, 1);
  }

  // Central Golden Eagle Emblem (Col 6)
  if (!scene.textures.exists('tile_9_center')) {
    const canvas = scene.textures.createCanvas('tile_9_center', 16, 16);
    if (canvas) {
      renderRoyalEagle(canvas.getContext());
      canvas.refresh();
    }
  }

  // Generic tile_9 (mirrors tile_9_center for 100% consistency)
  if (!scene.textures.exists('tile_9')) {
    const canvas = scene.textures.createCanvas('tile_9', 16, 16);
    if (canvas) {
      renderRoyalEagle(canvas.getContext());
      canvas.refresh();
    }
  }

  // Semantic alias tile_eagle_center
  if (!scene.textures.exists('tile_eagle_center')) {
    const canvas = scene.textures.createCanvas('tile_eagle_center', 16, 16);
    if (canvas) {
      renderRoyalEagle(canvas.getContext());
      canvas.refresh();
    }
  }

  // 10. RUINED BASE (16x16 pixel) - Central destroyed imperial eagle rubble
  if (!scene.textures.exists('tile_9_ruined')) {
    const canvas = scene.textures.createCanvas('tile_9_ruined', 16, 16);
    if (canvas) {
      renderRuinedEagle(canvas.getContext());
      canvas.refresh();
    }
  }

  // Semantic alias tile_eagle_ruined
  if (!scene.textures.exists('tile_eagle_ruined')) {
    const canvas = scene.textures.createCanvas('tile_eagle_ruined', 16, 16);
    if (canvas) {
      renderRuinedEagle(canvas.getContext());
      canvas.refresh();
    }
  }

  // Ruined Bunker Flanks (Cols 5 & 7) - Cracked concrete and charred rebar rubble
  if (!scene.textures.exists('bunker_flank_ruined')) {
    const canvas = scene.textures.createCanvas('bunker_flank_ruined', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 16, 16);

      // Cracked concrete rubble
      ctx.fillStyle = '#262626';
      ctx.fillRect(1, 5, 14, 10);
      ctx.fillStyle = '#52525b';
      ctx.fillRect(2, 8, 5, 5);
      ctx.fillRect(9, 7, 5, 6);

      // Rebar steel exposed
      ctx.fillStyle = '#71717a';
      ctx.fillRect(4, 3, 1, 6);
      ctx.fillRect(11, 4, 1, 5);
      ctx.fillRect(7, 10, 2, 2);
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

  // 12. P1, P2 & VS A.I TANK SPRITES (16x16 pixel in 4 directions)
  generateTankTextures(scene);
  generateP2TankTextures(scene);
  generateVsAiTankTextures(scene);

  // 13. ENEMY TANK SPRITES (4 types x 4 directions)
  generateEnemyTextures(scene);

  // 14. SHIELD AURA & ENEMY BULLETS
  generateShieldTexture(scene);
  generateEnemyBulletTexture(scene);

  // 15. BRICK & STEEL 8x8 SUB-TILES
  generateBrickSubTileTextures(scene);
  generateSteelSubTileTextures(scene);

  // 16. EXPLOSION & HIT SPARK EFFECTS
  generateExplosionTextures(scene);
  generateEagleExplosionTextures(scene);
}

export const PLAYER_TANK_PALETTES = {
  P1: {
    main: '#dc2626',
    light: '#fca5a5',
    dark: '#991b1b',
    track: '#450a0a',
    trackLight: '#ef4444',
  },
  P2: {
    main: '#eab308',
    light: '#fef08a',
    dark: '#a16207',
    track: '#713f12',
    trackLight: '#facc15',
  },
} as const;

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

    // Tank P1: Màu đỏ (Red)
    const p1Main = PLAYER_TANK_PALETTES.P1.main;
    const p1Light = PLAYER_TANK_PALETTES.P1.light;
    const p1Dark = PLAYER_TANK_PALETTES.P1.dark;
    const trackColor = PLAYER_TANK_PALETTES.P1.track;
    const trackLight = PLAYER_TANK_PALETTES.P1.trackLight;

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
      ctx.fillStyle = p1Main;
      ctx.fillRect(4, 4, 8, 11);
      ctx.fillStyle = p1Light;
      ctx.fillRect(4, 4, 8, 1);
      ctx.fillRect(4, 4, 1, 11);
      ctx.fillStyle = p1Dark;
      ctx.fillRect(4, 14, 8, 1);
      ctx.fillRect(11, 4, 1, 11);

      // Central Turret (x: 5..10, y: 6..11)
      ctx.fillStyle = p1Dark;
      ctx.fillRect(5, 6, 6, 6);
      ctx.fillStyle = p1Light;
      ctx.fillRect(6, 7, 4, 4);

      // Cannon Barrel (x: 7..8, y: 0..6)
      ctx.fillStyle = p1Light;
      ctx.fillRect(7, 0, 2, 7);
      ctx.fillStyle = p1Dark;
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
      ctx.fillStyle = p1Main;
      ctx.fillRect(4, 1, 8, 11);
      ctx.fillStyle = p1Light;
      ctx.fillRect(4, 1, 8, 1);
      ctx.fillRect(4, 1, 1, 11);
      ctx.fillStyle = p1Dark;
      ctx.fillRect(4, 11, 8, 1);
      ctx.fillRect(11, 1, 1, 11);

      // Central Turret
      ctx.fillStyle = p1Dark;
      ctx.fillRect(5, 4, 6, 6);
      ctx.fillStyle = p1Light;
      ctx.fillRect(6, 5, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = p1Light;
      ctx.fillRect(7, 9, 2, 7);
      ctx.fillStyle = p1Dark;
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
      ctx.fillStyle = p1Main;
      ctx.fillRect(4, 4, 11, 8);
      ctx.fillStyle = p1Light;
      ctx.fillRect(4, 4, 11, 1);
      ctx.fillRect(4, 4, 1, 8);
      ctx.fillStyle = p1Dark;
      ctx.fillRect(4, 11, 11, 1);
      ctx.fillRect(14, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = p1Dark;
      ctx.fillRect(6, 5, 6, 6);
      ctx.fillStyle = p1Light;
      ctx.fillRect(7, 6, 4, 4);

      // Cannon Barrel (x: 0..6, y: 7..8)
      ctx.fillStyle = p1Light;
      ctx.fillRect(0, 7, 7, 2);
      ctx.fillStyle = p1Dark;
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
      ctx.fillStyle = p1Main;
      ctx.fillRect(1, 4, 11, 8);
      ctx.fillStyle = p1Light;
      ctx.fillRect(1, 4, 11, 1);
      ctx.fillRect(1, 4, 1, 8);
      ctx.fillStyle = p1Dark;
      ctx.fillRect(1, 11, 11, 1);
      ctx.fillRect(11, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = p1Dark;
      ctx.fillRect(4, 5, 6, 6);
      ctx.fillStyle = p1Light;
      ctx.fillRect(5, 6, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = p1Light;
      ctx.fillRect(9, 7, 7, 2);
      ctx.fillStyle = p1Dark;
      ctx.fillRect(9, 7, 7, 1);
    }

    canvas.refresh();
  }
}

function generateP2TankTextures(scene: Phaser.Scene): void {
  const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];

  for (const dir of directions) {
    const key = `tank_p2_${dir}`;
    if (scene.textures.exists(key)) continue;

    const canvas = scene.textures.createCanvas(key, 16, 16);
    if (!canvas) continue;
    const ctx = canvas.getContext();

    // Transparent background
    ctx.clearRect(0, 0, 16, 16);

    // Tank P2: Màu vàng (Yellow)
    const p2Main = PLAYER_TANK_PALETTES.P2.main;
    const p2Light = PLAYER_TANK_PALETTES.P2.light;
    const p2Dark = PLAYER_TANK_PALETTES.P2.dark;
    const trackColor = PLAYER_TANK_PALETTES.P2.track;
    const trackLight = PLAYER_TANK_PALETTES.P2.trackLight;

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
      ctx.fillStyle = p2Main;
      ctx.fillRect(4, 4, 8, 11);
      ctx.fillStyle = p2Light;
      ctx.fillRect(4, 4, 8, 1);
      ctx.fillRect(4, 4, 1, 11);
      ctx.fillStyle = p2Dark;
      ctx.fillRect(4, 14, 8, 1);
      ctx.fillRect(11, 4, 1, 11);

      // Central Turret (x: 5..10, y: 6..11)
      ctx.fillStyle = p2Dark;
      ctx.fillRect(5, 6, 6, 6);
      ctx.fillStyle = p2Light;
      ctx.fillRect(6, 7, 4, 4);

      // Cannon Barrel (x: 7..8, y: 0..6)
      ctx.fillStyle = p2Light;
      ctx.fillRect(7, 0, 2, 7);
      ctx.fillStyle = p2Dark;
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
      ctx.fillStyle = p2Main;
      ctx.fillRect(4, 1, 8, 11);
      ctx.fillStyle = p2Light;
      ctx.fillRect(4, 1, 8, 1);
      ctx.fillRect(4, 1, 1, 11);
      ctx.fillStyle = p2Dark;
      ctx.fillRect(4, 11, 8, 1);
      ctx.fillRect(11, 1, 1, 11);

      // Central Turret
      ctx.fillStyle = p2Dark;
      ctx.fillRect(5, 4, 6, 6);
      ctx.fillStyle = p2Light;
      ctx.fillRect(6, 5, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = p2Light;
      ctx.fillRect(7, 9, 2, 7);
      ctx.fillStyle = p2Dark;
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
      ctx.fillStyle = p2Main;
      ctx.fillRect(4, 4, 11, 8);
      ctx.fillStyle = p2Light;
      ctx.fillRect(4, 4, 11, 1);
      ctx.fillRect(4, 4, 1, 8);
      ctx.fillStyle = p2Dark;
      ctx.fillRect(4, 11, 11, 1);
      ctx.fillRect(14, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = p2Dark;
      ctx.fillRect(6, 5, 6, 6);
      ctx.fillStyle = p2Light;
      ctx.fillRect(7, 6, 4, 4);

      // Cannon Barrel (x: 0..6, y: 7..8)
      ctx.fillStyle = p2Light;
      ctx.fillRect(0, 7, 7, 2);
      ctx.fillStyle = p2Dark;
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
      ctx.fillStyle = p2Main;
      ctx.fillRect(1, 4, 11, 8);
      ctx.fillStyle = p2Light;
      ctx.fillRect(1, 4, 11, 1);
      ctx.fillRect(1, 4, 1, 8);
      ctx.fillStyle = p2Dark;
      ctx.fillRect(1, 11, 11, 1);
      ctx.fillRect(11, 4, 1, 8);

      // Central Turret
      ctx.fillStyle = p2Dark;
      ctx.fillRect(4, 5, 6, 6);
      ctx.fillStyle = p2Light;
      ctx.fillRect(5, 6, 4, 4);

      // Cannon Barrel
      ctx.fillStyle = p2Light;
      ctx.fillRect(9, 7, 7, 2);
      ctx.fillStyle = p2Dark;
      ctx.fillRect(9, 7, 7, 1);
    }

    canvas.refresh();
  }
}

function generateVsAiTankTextures(scene: Phaser.Scene): void {
  const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];
  const aiConfigs = [
    {
      prefix: 'tank_ai1',
      // M7.8 Mục XII: Tank A.I đồng minh P1 (AI_1) = Xanh biển nhạt (Light Sky Blue)
      main: '#38bdf8',
      light: '#e0f2fe',
      dark: '#0284c7',
      track: '#0c4a6e',
      trackLight: '#7dd3fc',
      stripe: '#ffffff',
    },
    {
      prefix: 'tank_ai2',
      // M7.8 Mục XII: Tank A.I đồng minh P2 (AI_2) = Xám (Gray)
      main: '#94a3b8',
      light: '#f1f5f9',
      dark: '#475569',
      track: '#1e293b',
      trackLight: '#cbd5e1',
      stripe: '#e2e8f0',
    },
  ] as const;

  for (const cfg of aiConfigs) {
    for (const dir of directions) {
      const key = `${cfg.prefix}_${dir}`;
      if (scene.textures.exists(key)) continue;
      const canvas = scene.textures.createCanvas(key, 16, 16);
      if (!canvas) continue;
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 16, 16);

      if (dir === 'up') {
        ctx.fillStyle = cfg.track;
        ctx.fillRect(1, 2, 3, 13);
        ctx.fillRect(12, 2, 3, 13);
        ctx.fillStyle = cfg.trackLight;
        ctx.fillRect(1, 3, 3, 2);
        ctx.fillRect(1, 7, 3, 2);
        ctx.fillRect(1, 11, 3, 2);
        ctx.fillRect(12, 3, 3, 2);
        ctx.fillRect(12, 7, 3, 2);
        ctx.fillRect(12, 11, 3, 2);

        ctx.fillStyle = cfg.main;
        ctx.fillRect(4, 4, 8, 11);
        ctx.fillStyle = cfg.light;
        ctx.fillRect(4, 4, 8, 1);
        ctx.fillStyle = cfg.dark;
        ctx.fillRect(4, 14, 8, 1);
        // Tactical A.I stripe on rear hull
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(5, 12, 6, 1);

        ctx.fillStyle = cfg.dark;
        ctx.fillRect(5, 6, 6, 6);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(7, 8, 2, 2);

        ctx.fillStyle = cfg.light;
        ctx.fillRect(7, 0, 2, 7);
      } else if (dir === 'down') {
        ctx.fillStyle = cfg.track;
        ctx.fillRect(1, 1, 3, 13);
        ctx.fillRect(12, 1, 3, 13);
        ctx.fillStyle = cfg.trackLight;
        ctx.fillRect(1, 2, 3, 2);
        ctx.fillRect(1, 6, 3, 2);
        ctx.fillRect(1, 10, 3, 2);
        ctx.fillRect(12, 2, 3, 2);
        ctx.fillRect(12, 6, 3, 2);
        ctx.fillRect(12, 10, 3, 2);

        ctx.fillStyle = cfg.main;
        ctx.fillRect(4, 1, 8, 11);
        ctx.fillStyle = cfg.light;
        ctx.fillRect(4, 1, 8, 1);
        ctx.fillStyle = cfg.dark;
        ctx.fillRect(4, 11, 8, 1);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(5, 3, 6, 1);

        ctx.fillStyle = cfg.dark;
        ctx.fillRect(5, 4, 6, 6);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(7, 6, 2, 2);

        ctx.fillStyle = cfg.light;
        ctx.fillRect(7, 9, 2, 7);
      } else if (dir === 'left') {
        ctx.fillStyle = cfg.track;
        ctx.fillRect(2, 1, 13, 3);
        ctx.fillRect(2, 12, 13, 3);
        ctx.fillStyle = cfg.trackLight;
        ctx.fillRect(3, 1, 2, 3);
        ctx.fillRect(7, 1, 2, 3);
        ctx.fillRect(11, 1, 2, 3);
        ctx.fillRect(3, 12, 2, 3);
        ctx.fillRect(7, 12, 2, 3);
        ctx.fillRect(11, 12, 2, 3);

        ctx.fillStyle = cfg.main;
        ctx.fillRect(4, 4, 11, 8);
        ctx.fillStyle = cfg.light;
        ctx.fillRect(4, 4, 11, 1);
        ctx.fillStyle = cfg.dark;
        ctx.fillRect(4, 11, 11, 1);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(12, 5, 1, 6);

        ctx.fillStyle = cfg.dark;
        ctx.fillRect(6, 5, 6, 6);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(8, 7, 2, 2);

        ctx.fillStyle = cfg.light;
        ctx.fillRect(0, 7, 7, 2);
      } else {
        ctx.fillStyle = cfg.track;
        ctx.fillRect(1, 1, 13, 3);
        ctx.fillRect(1, 12, 13, 3);
        ctx.fillStyle = cfg.trackLight;
        ctx.fillRect(2, 1, 2, 3);
        ctx.fillRect(6, 1, 2, 3);
        ctx.fillRect(10, 1, 2, 3);
        ctx.fillRect(2, 12, 2, 3);
        ctx.fillRect(6, 12, 2, 3);
        ctx.fillRect(10, 12, 2, 3);

        ctx.fillStyle = cfg.main;
        ctx.fillRect(1, 4, 11, 8);
        ctx.fillStyle = cfg.light;
        ctx.fillRect(1, 4, 11, 1);
        ctx.fillStyle = cfg.dark;
        ctx.fillRect(1, 11, 11, 1);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(3, 5, 1, 6);

        ctx.fillStyle = cfg.dark;
        ctx.fillRect(4, 5, 6, 6);
        ctx.fillStyle = cfg.stripe;
        ctx.fillRect(6, 7, 2, 2);

        ctx.fillStyle = cfg.light;
        ctx.fillRect(9, 7, 7, 2);
      }

      canvas.refresh();
    }
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

function generateSteelSubTileTextures(scene: Phaser.Scene): void {
  const keys = ['steel_sub_tl', 'steel_sub_tr', 'steel_sub_bl', 'steel_sub_br'] as const;
  for (const key of keys) {
    if (!scene.textures.exists(key)) {
      const canvas = scene.textures.createCanvas(key, 8, 8);
      if (canvas) {
        const ctx = canvas.getContext();
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = '#b0b8c0';
        ctx.fillRect(1, 1, 6, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(1, 1, 6, 1);
        ctx.fillRect(1, 1, 1, 6);
        ctx.fillStyle = '#5a626a';
        ctx.fillRect(1, 6, 6, 1);
        ctx.fillRect(6, 1, 1, 6);
        ctx.fillStyle = '#e8ecf0';
        ctx.fillRect(3, 3, 2, 2);
        canvas.refresh();
      }
    }
  }
}

export const ENEMY_PALETTES = {
  // Tank Basic: màu trắng (1HP, chạy thường)
  BASIC: {
    main: '#ffffff',
    light: '#ffffff',
    dark: '#cbd5e1',
    track: '#64748b',
    trackLight: '#f8fafc',
  },
  // Tank Fast: màu xanh biển (1HP, chạy nhanh nhất)
  FAST: {
    main: '#2563eb',
    light: '#60a5fa',
    dark: '#1d4ed8',
    track: '#1e3a8a',
    trackLight: '#38bdf8',
  },
  // Tank Power: màu xanh lá cây (2HP, chạy thường)
  POWER: {
    main: '#16a34a',
    light: '#86efac',
    dark: '#14532d',
    track: '#052e16',
    trackLight: '#4ade80',
  },
  // Tank Armor: màu nâu đất (4HP, chạy chậm nhất — phân biệt rõ ràng với màu đỏ của P1)
  ARMOR: {
    main: '#7c4a2d',
    light: '#b07b56',
    dark: '#4a2a18',
    track: '#2e190e',
    trackLight: '#946243',
  },
} as const;

function generateEnemyTextures(scene: Phaser.Scene): void {
  const directions: Array<'up' | 'down' | 'left' | 'right'> = ['up', 'down', 'left', 'right'];
  const types = ['BASIC', 'FAST', 'POWER', 'ARMOR'] as const;

  for (const t of types) {
    const pal = ENEMY_PALETTES[t];
    const isArmorBlackWhite = false;

    for (const dir of directions) {
      const key = `tank_${t.toLowerCase()}_${dir}`;
      if (scene.textures.exists(key)) continue;

      const canvas = scene.textures.createCanvas(key, 16, 16);
      if (!canvas) continue;
      const ctx = canvas.getContext();

      ctx.clearRect(0, 0, 16, 16);

      if (dir === 'up') {
        // Tracks
        if (isArmorBlackWhite) {
          // White border around tracks with black interior
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(1, 2, 3, 13);
          ctx.fillRect(12, 2, 3, 13);
          ctx.fillStyle = pal.track;
          ctx.fillRect(2, 3, 1, 11);
          ctx.fillRect(13, 3, 1, 11);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(2, 6, 1, 1);
          ctx.fillRect(2, 10, 1, 1);
          ctx.fillRect(13, 6, 1, 1);
          ctx.fillRect(13, 10, 1, 1);
        } else {
          ctx.fillStyle = pal.track;
          ctx.fillRect(1, 2, 3, 13);
          ctx.fillRect(12, 2, 3, 13);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(1, 3, 3, 2);
          ctx.fillRect(1, 8, 3, 2);
          ctx.fillRect(12, 3, 3, 2);
          ctx.fillRect(12, 8, 3, 2);
        }

        // Body
        ctx.fillStyle = pal.main;
        ctx.fillRect(4, 4, 8, 11);
        ctx.fillStyle = pal.light;
        ctx.fillRect(4, 4, 8, 1);
        ctx.fillRect(4, 4, 1, 11);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(4, 14, 8, 1);
        ctx.fillRect(11, 4, 1, 11);

        // Turret
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.main;
          ctx.fillRect(5, 6, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(6, 7, 4, 4);
          ctx.fillStyle = pal.main;
          ctx.fillRect(7, 8, 2, 2);
        } else {
          ctx.fillStyle = pal.dark;
          ctx.fillRect(5, 6, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(6, 7, 4, 4);
        }

        // Cannon
        ctx.fillStyle = pal.light;
        ctx.fillRect(7, 0, 2, 7);
      } else if (dir === 'down') {
        // Tracks
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(1, 1, 3, 13);
          ctx.fillRect(12, 1, 3, 13);
          ctx.fillStyle = pal.track;
          ctx.fillRect(2, 2, 1, 11);
          ctx.fillRect(13, 2, 1, 11);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(2, 5, 1, 1);
          ctx.fillRect(2, 9, 1, 1);
          ctx.fillRect(13, 5, 1, 1);
          ctx.fillRect(13, 9, 1, 1);
        } else {
          ctx.fillStyle = pal.track;
          ctx.fillRect(1, 1, 3, 13);
          ctx.fillRect(12, 1, 3, 13);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(1, 3, 3, 2);
          ctx.fillRect(1, 8, 3, 2);
          ctx.fillRect(12, 3, 3, 2);
          ctx.fillRect(12, 8, 3, 2);
        }

        // Body
        ctx.fillStyle = pal.main;
        ctx.fillRect(4, 1, 8, 11);
        ctx.fillStyle = pal.light;
        ctx.fillRect(4, 1, 8, 1);
        ctx.fillRect(4, 1, 1, 11);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(4, 11, 8, 1);
        ctx.fillRect(11, 1, 1, 11);

        // Turret
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.main;
          ctx.fillRect(5, 4, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(6, 5, 4, 4);
          ctx.fillStyle = pal.main;
          ctx.fillRect(7, 6, 2, 2);
        } else {
          ctx.fillStyle = pal.dark;
          ctx.fillRect(5, 4, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(6, 5, 4, 4);
        }

        // Cannon
        ctx.fillStyle = pal.light;
        ctx.fillRect(7, 9, 2, 7);
      } else if (dir === 'left') {
        // Tracks
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(2, 1, 13, 3);
          ctx.fillRect(2, 12, 13, 3);
          ctx.fillStyle = pal.track;
          ctx.fillRect(3, 2, 11, 1);
          ctx.fillRect(3, 13, 11, 1);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(6, 2, 1, 1);
          ctx.fillRect(10, 2, 1, 1);
          ctx.fillRect(6, 13, 1, 1);
          ctx.fillRect(10, 13, 1, 1);
        } else {
          ctx.fillStyle = pal.track;
          ctx.fillRect(2, 1, 13, 3);
          ctx.fillRect(2, 12, 13, 3);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(3, 1, 2, 3);
          ctx.fillRect(8, 1, 2, 3);
          ctx.fillRect(3, 12, 2, 3);
          ctx.fillRect(8, 12, 2, 3);
        }

        // Body
        ctx.fillStyle = pal.main;
        ctx.fillRect(4, 4, 11, 8);
        ctx.fillStyle = pal.light;
        ctx.fillRect(4, 4, 11, 1);
        ctx.fillRect(4, 4, 1, 8);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(4, 11, 11, 1);
        ctx.fillRect(14, 4, 1, 8);

        // Turret
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.main;
          ctx.fillRect(6, 5, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(7, 6, 4, 4);
          ctx.fillStyle = pal.main;
          ctx.fillRect(8, 7, 2, 2);
        } else {
          ctx.fillStyle = pal.dark;
          ctx.fillRect(6, 5, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(7, 6, 4, 4);
        }

        // Cannon
        ctx.fillStyle = pal.light;
        ctx.fillRect(0, 7, 7, 2);
      } else if (dir === 'right') {
        // Tracks
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(1, 1, 13, 3);
          ctx.fillRect(1, 12, 13, 3);
          ctx.fillStyle = pal.track;
          ctx.fillRect(2, 2, 11, 1);
          ctx.fillRect(2, 13, 11, 1);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(5, 2, 1, 1);
          ctx.fillRect(9, 2, 1, 1);
          ctx.fillRect(5, 13, 1, 1);
          ctx.fillRect(9, 13, 1, 1);
        } else {
          ctx.fillStyle = pal.track;
          ctx.fillRect(1, 1, 13, 3);
          ctx.fillRect(1, 12, 13, 3);
          ctx.fillStyle = pal.trackLight;
          ctx.fillRect(3, 1, 2, 3);
          ctx.fillRect(8, 1, 2, 3);
          ctx.fillRect(3, 12, 2, 3);
          ctx.fillRect(8, 12, 2, 3);
        }

        // Body
        ctx.fillStyle = pal.main;
        ctx.fillRect(1, 4, 11, 8);
        ctx.fillStyle = pal.light;
        ctx.fillRect(1, 4, 11, 1);
        ctx.fillRect(1, 4, 1, 8);
        ctx.fillStyle = pal.dark;
        ctx.fillRect(1, 11, 11, 1);
        ctx.fillRect(11, 4, 1, 8);

        // Turret
        if (isArmorBlackWhite) {
          ctx.fillStyle = pal.main;
          ctx.fillRect(4, 5, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(5, 6, 4, 4);
          ctx.fillStyle = pal.main;
          ctx.fillRect(6, 7, 2, 2);
        } else {
          ctx.fillStyle = pal.dark;
          ctx.fillRect(4, 5, 6, 6);
          ctx.fillStyle = pal.light;
          ctx.fillRect(5, 6, 4, 4);
        }

        // Cannon
        ctx.fillStyle = pal.light;
        ctx.fillRect(9, 7, 7, 2);
      }

      canvas.refresh();
    }
  }
}

function generateShieldTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('shield_aura')) return;

  const canvas = scene.textures.createCanvas('shield_aura', 18, 18);
  if (!canvas) return;
  const ctx = canvas.getContext();

  ctx.clearRect(0, 0, 18, 18);

  // Outer glowing ring
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(9, 9, 8, 0, Math.PI * 2);
  ctx.stroke();

  // Bright sparkles on diagonals
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(9, 0, 1, 2);
  ctx.fillRect(9, 16, 1, 2);
  ctx.fillRect(0, 9, 2, 1);
  ctx.fillRect(16, 9, 2, 1);

  canvas.refresh();
}

function generateEnemyBulletTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('bullet_enemy')) return;

  const canvas = scene.textures.createCanvas('bullet_enemy', 4, 4);
  if (!canvas) return;
  const ctx = canvas.getContext();

  ctx.fillStyle = '#ef4444'; // Red outer
  ctx.fillRect(0, 0, 4, 4);
  ctx.fillStyle = '#fef08a'; // White-yellow core
  ctx.fillRect(1, 1, 2, 2);
  canvas.refresh();
}

function generateExplosionTextures(scene: Phaser.Scene): void {
  // 1. Small Hit Spark (8x8) for non-lethal impact
  if (!scene.textures.exists('hit_spark')) {
    const canvas = scene.textures.createCanvas('hit_spark', 8, 8);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 8, 8);
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(3, 1, 2, 6);
      ctx.fillRect(1, 3, 6, 2);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(3, 3, 2, 2);
      canvas.refresh();
    }
  }

  // 2. Explosion Frame 1 (16x16) - Initial flash
  if (!scene.textures.exists('explosion_1')) {
    const canvas = scene.textures.createCanvas('explosion_1', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 16, 16);
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(8, 8, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(8, 8, 3, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }

  // 3. Explosion Frame 2 (24x24) - Expanding fireball
  if (!scene.textures.exists('explosion_2')) {
    const canvas = scene.textures.createCanvas('explosion_2', 24, 24);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 24, 24);
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(12, 12, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(12, 12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(12, 12, 3, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }

  // 4. Explosion Frame 3 (32x32) - Maximum blast & smoke
  if (!scene.textures.exists('explosion_3')) {
    const canvas = scene.textures.createCanvas('explosion_3', 32, 32);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 32, 32);
      ctx.fillStyle = '#404040';
      ctx.beginPath();
      ctx.arc(16, 16, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(16, 16, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(16, 16, 5, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }

  // 5. Explosion Frame 4 (24x24) - Dissipating smoke
  if (!scene.textures.exists('explosion_4')) {
    const canvas = scene.textures.createCanvas('explosion_4', 24, 24);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 24, 24);
      ctx.fillStyle = '#262626';
      ctx.beginPath();
      ctx.arc(12, 12, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#737373';
      ctx.beginPath();
      ctx.arc(12, 12, 4, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }
}

/**
 * Creates distinct Eagle Base Explosion textures:
 * Uses radiant white, golden amber, brilliant sunburst rays and shockwave rings.
 * Completely distinct from tank explosion (orange/red).
 */
export function generateEagleExplosionTextures(scene: Phaser.Scene): void {
  // 1. Eagle Explosion Frame 1 (24x24) - Divine golden-white flash core with radiant rays
  if (!scene.textures.exists('eagle_exp_1')) {
    const canvas = scene.textures.createCanvas('eagle_exp_1', 24, 24);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 24, 24);
      // Golden corona
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, Math.PI * 2);
      ctx.fill();
      // Brilliant sun yellow
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(12, 12, 7, 0, Math.PI * 2);
      ctx.fill();
      // Pure white-hot epicenter
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(12, 12, 4, 0, Math.PI * 2);
      ctx.fill();
      // Cross starburst rays
      ctx.fillRect(11, 2, 2, 20);
      ctx.fillRect(2, 11, 20, 2);
      canvas.refresh();
    }
  }

  // 2. Eagle Explosion Frame 2 (36x36) - Expanding radiant gold blast with shockwave ring
  if (!scene.textures.exists('eagle_exp_2')) {
    const canvas = scene.textures.createCanvas('eagle_exp_2', 36, 36);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 36, 36);
      // Outer radiant golden ring
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(18, 18, 16, 0, Math.PI * 2);
      ctx.stroke();
      // Golden explosion body
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(18, 18, 13, 0, Math.PI * 2);
      ctx.fill();
      // Inner amber flame
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(18, 18, 9, 0, Math.PI * 2);
      ctx.fill();
      // White hot core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(18, 18, 5, 0, Math.PI * 2);
      ctx.fill();
      // Star rays
      ctx.fillStyle = '#fef08a';
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const rx = 18 + Math.cos(angle) * 14;
        const ry = 18 + Math.sin(angle) * 14;
        ctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 2, 2);
      }
      canvas.refresh();
    }
  }

  // 3. Eagle Explosion Frame 3 (48x48) - Grand imperial golden nova shockwave
  if (!scene.textures.exists('eagle_exp_3')) {
    const canvas = scene.textures.createCanvas('eagle_exp_3', 48, 48);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 48, 48);
      // Expanding golden shockwave ring
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(24, 24, 22, 0, Math.PI * 2);
      ctx.stroke();
      // Golden smoke clouds
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(24, 24, 17, 0, Math.PI * 2);
      ctx.fill();
      // Amber inner blast
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(24, 24, 12, 0, Math.PI * 2);
      ctx.fill();
      // Pure white light burst
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(24, 24, 7, 0, Math.PI * 2);
      ctx.fill();
      // Radiant golden spark particles
      ctx.fillStyle = '#fef08a';
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
        const px = 24 + Math.cos(angle) * 20;
        const py = 24 + Math.sin(angle) * 20;
        ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
      }
      canvas.refresh();
    }
  }

  // 4. Eagle Explosion Frame 4 (36x36) - Dissipating golden light and smoke aura
  if (!scene.textures.exists('eagle_exp_4')) {
    const canvas = scene.textures.createCanvas('eagle_exp_4', 36, 36);
    if (canvas) {
      const ctx = canvas.getContext();
      ctx.clearRect(0, 0, 36, 36);
      // Fading outer ring
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(18, 18, 15, 0, Math.PI * 2);
      ctx.stroke();
      // Dissipating amber smoke
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.arc(18, 18, 11, 0, Math.PI * 2);
      ctx.fill();
      // Core embers
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(18, 18, 6, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }

  generateSupportItemTextures(scene);
}

/**
 * Generates 4 distinct 16x16 pixel-art Support Item textures:
 * - `item_bomb`: BOMB (Bom — destroys up to 2 alive enemy tanks)
 * - `item_eagle_shield`: EAGLE_SHIELD (Khiên Đại Bàng — 2 steel side walls for 10s)
 * - `item_firepower`: FIREPOWER (Tăng Công Phá — 2x brick/steel/enemy damage for 10s)
 * - `item_speed_boost`: SPEED_BOOST (Tăng Tốc — 2x movement speed for 10s)
 */
export function generateSupportItemTextures(scene: Phaser.Scene): void {
  const drawBadgeFrame = (
    ctx: CanvasRenderingContext2D,
    borderColor: string,
    bgColor: string
  ) => {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = borderColor;
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = bgColor;
    ctx.fillRect(2, 2, 12, 12);
    // Corner rivets
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 2, 1, 1);
    ctx.fillRect(13, 2, 1, 1);
    ctx.fillRect(2, 13, 1, 1);
    ctx.fillRect(13, 13, 1, 1);
  };

  // 1. BOMB (`item_bomb`) - Crimson frame with classic dark bomb & burning fuse spark
  if (!scene.textures.exists('item_bomb')) {
    const canvas = scene.textures.createCanvas('item_bomb', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      drawBadgeFrame(ctx, '#f43f5e', '#4c0519');
      // Bomb spherical body
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(5, 6, 6, 6);
      ctx.fillRect(4, 7, 8, 4);
      ctx.fillRect(6, 5, 4, 8);
      // Highlight
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(5, 7, 2, 2);
      // Fuse cap & spark
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(7, 4, 2, 1);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(9, 3, 2, 1);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(11, 2, 2, 2);
      canvas.refresh();
    }
  }

  // 2. EAGLE_SHIELD (`item_eagle_shield`) - Steel-cyan frame with silver armor shield & gold crest
  if (!scene.textures.exists('item_eagle_shield')) {
    const canvas = scene.textures.createCanvas('item_eagle_shield', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      drawBadgeFrame(ctx, '#38bdf8', '#082f49');
      // Outer metallic shield silhouette
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(4, 3, 8, 6);
      ctx.fillRect(5, 9, 6, 2);
      ctx.fillRect(6, 11, 4, 1);
      ctx.fillRect(7, 12, 2, 1);
      // Inner steel plate
      ctx.fillStyle = '#475569';
      ctx.fillRect(5, 4, 6, 5);
      ctx.fillRect(6, 9, 4, 2);
      // Golden eagle star center
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(7, 5, 2, 4);
      ctx.fillRect(6, 6, 4, 2);
      canvas.refresh();
    }
  }

  // 3. FIREPOWER (`item_firepower`) - Amber-orange frame with twin high-explosive shells / star
  if (!scene.textures.exists('item_firepower')) {
    const canvas = scene.textures.createCanvas('item_firepower', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      drawBadgeFrame(ctx, '#f59e0b', '#451a03');
      // Blazing star / shell core
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(4, 4, 8, 8);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(7, 3, 2, 10);
      ctx.fillRect(3, 7, 10, 2);
      ctx.fillRect(5, 5, 6, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 6, 4, 4);
      canvas.refresh();
    }
  }

  // 4. SPEED_BOOST (`item_speed_boost`) - Emerald-lime frame with double forward chevrons >>
  if (!scene.textures.exists('item_speed_boost')) {
    const canvas = scene.textures.createCanvas('item_speed_boost', 16, 16);
    if (canvas) {
      const ctx = canvas.getContext();
      drawBadgeFrame(ctx, '#10b981', '#064e3b');
      // Double speed chevron arrows pointing UP/RIGHT
      ctx.fillStyle = '#34d399';
      // First chevron
      ctx.fillRect(4, 5, 2, 2);
      ctx.fillRect(6, 7, 2, 2);
      ctx.fillRect(4, 9, 2, 2);
      // Second bright chevron
      ctx.fillStyle = '#a7f3d0';
      ctx.fillRect(8, 5, 2, 2);
      ctx.fillRect(10, 7, 2, 2);
      ctx.fillRect(8, 9, 2, 2);
      canvas.refresh();
    }
  }
}


