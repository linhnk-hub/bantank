/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo } from 'react';
import { PhaserGame } from './game/PhaserGame.tsx';
import { TerrainLegend } from './components/TerrainLegend.tsx';
import { ValidationPanel } from './components/ValidationPanel.tsx';
import { STAGE_1_MAP, MAP_DIMENSIONS } from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import type { SceneTileHoverInfo } from './game/scenes/StageViewerScene.ts';
import { Grid, Hash, Info, Crosshair, Terminal } from 'lucide-react';

export default function App() {
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showCoords, setShowCoords] = useState<boolean>(false);
  const [hoverInfo, setHoverInfo] = useState<SceneTileHoverInfo | null>(null);

  // Validate the official Stage 1 map using pure Game Core validator
  const validation = useMemo(() => validateStageMap(STAGE_1_MAP), []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur px-4 py-3 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center font-black text-black shadow-lg shadow-amber-500/20 text-sm">
              BT
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                BanTank Online
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
                  Milestone 1: Project Setup & Stage 1 Map
                </span>
              </h1>
              <p className="text-xs text-neutral-400">
                Tích hợp React + Phaser 3 + Pure Game Core | 13×13 Ô (16×16 px/ô)
              </p>
            </div>
          </div>

          {/* Interactive Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGrid((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                showGrid
                  ? 'bg-neutral-800 text-amber-400 border-amber-500/40 shadow-sm'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
              title="Bật/Tắt đường lưới 13x13"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Lưới (Grid): {showGrid ? 'Bật' : 'Tắt'}</span>
            </button>

            <button
              onClick={() => setShowCoords((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                showCoords
                  ? 'bg-neutral-800 text-amber-400 border-amber-500/40 shadow-sm'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-neutral-200'
              }`}
              title="Bật/Tắt hiển thị tọa độ từng ô [Hàng, Cột]"
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Tọa độ ô: {showCoords ? 'Bật' : 'Tắt'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Phaser 3 Canvas Map Viewer (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col gap-3">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl flex flex-col">
            {/* Viewport Header */}
            <div className="bg-neutral-950 px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold text-neutral-200">
                  Phaser 3 Pixel Canvas (208 × 208 logic px)
                </span>
              </div>
              <div className="text-neutral-400 font-mono text-[11px] flex items-center gap-2">
                <span>Scale: Crisp Pixel-Art</span>
                <span>•</span>
                <span>Aspect 1:1</span>
              </div>
            </div>

            {/* Game Canvas Container */}
            <div className="p-4 bg-neutral-950/60 flex items-center justify-center min-h-[380px] sm:min-h-[460px]">
              <PhaserGame
                showGrid={showGrid}
                showCoords={showCoords}
                onTileHover={setHoverInfo}
              />
            </div>

            {/* Viewport Footer: Tile Inspector */}
            <div className="bg-neutral-950 px-4 py-2 border-t border-neutral-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-neutral-400">Kiểm tra ô chuột trỏ:</span>
                {hoverInfo ? (
                  <span className="font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/50">
                    Hàng {hoverInfo.row}, Cột {hoverInfo.col} — {hoverInfo.tileName} (ID: {hoverInfo.tileType})
                    {hoverInfo.tileType === 9 && (
                      <span className="ml-1 text-amber-300 font-bold">★ Căn cứ BASE</span>
                    )}
                  </span>
                ) : (
                  <span className="text-neutral-500 italic">
                    Di chuột vào bản đồ để kiểm tra tọa độ
                  </span>
                )}
              </div>

              <div className="text-[11px] text-neutral-500">
                Stage 1 • {MAP_DIMENSIONS.ROWS}x{MAP_DIMENSIONS.COLS} Tiles
              </div>
            </div>
          </div>

          {/* Note on Milestone Scope */}
          <div className="p-3.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-xs text-neutral-400 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-neutral-200">
                Tuân thủ nghiêm ngặt phạm vi Milestone 1
              </p>
              <p className="mt-0.5 text-neutral-400">
                Chưa kích hoạt xe tăng di chuyển, đạn bắn, AI hoặc Multiplayer. Hệ thống tập trung bảo toàn ma trận Stage 1, kích thước 16x16px mỗi ô và 3 ô BASE ở đáy bản đồ theo đúng yêu cầu kiểm định.
              </p>
            </div>
          </div>
        </section>

        {/* Right Column: Validation Checklist & Terrain Legend (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* Automated Validation Checklist */}
          <ValidationPanel validation={validation} />

          {/* Terrain Legend */}
          <TerrainLegend tileCounts={validation.tileCounts} />

          {/* Raw Matrix Snippet */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs">
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-neutral-800">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                Dữ liệu ma trận Stage 1 (Raw Matrix)
              </span>
              <span className="font-mono text-[10px] text-neutral-400">13 × 13 Rows</span>
            </div>
            <pre className="font-mono text-[10px] leading-tight text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800/80 overflow-x-auto select-all">
              {JSON.stringify(STAGE_1_MAP, null, 2)}
            </pre>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        BanTank Online • Milestone 1 hoàn tất • Đang chờ phê duyệt để chuyển sang Milestone 2 (Player 1 Movement & Grid Physics)
      </footer>
    </div>
  );
}
