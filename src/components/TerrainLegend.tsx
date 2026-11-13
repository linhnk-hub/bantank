/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TILE_METADATA } from '../core/constants.ts';
import { TILE_TYPES } from '../core/types.ts';

interface TerrainLegendProps {
  tileCounts: Record<number, number>;
}

export const TerrainLegend: React.FC<TerrainLegendProps> = ({ tileCounts }) => {
  const tileList = [
    TILE_TYPES.EMPTY,
    TILE_TYPES.BRICK,
    TILE_TYPES.STEEL,
    TILE_TYPES.BASE,
    TILE_TYPES.WATER,
    TILE_TYPES.GRASS,
    TILE_TYPES.ICE,
  ];

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
          Chú giải địa hình (Terrain Legend)
        </h3>
        <span className="text-[11px] text-neutral-400 font-mono">16 × 16 px / Tile</span>
      </div>

      <div className="space-y-2.5">
        {tileList.map((typeId) => {
          const meta = TILE_METADATA[typeId];
          const count = tileCounts[typeId] || 0;
          const isPresent = meta.presentInStage1;

          return (
            <div
              key={typeId}
              className={`p-2 rounded border transition-all ${
                isPresent
                  ? 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                  : 'bg-neutral-950/40 border-dashed border-neutral-800/60 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {/* Miniature Tile Preview */}
                  <div
                    className="w-5 h-5 rounded-sm border border-neutral-700 flex items-center justify-center font-mono font-bold text-[10px] shadow-sm"
                    style={{ backgroundColor: meta.colorHex }}
                  >
                    <span className="text-black drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]">
                      {typeId}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-neutral-200">
                      {meta.name} ({typeId})
                    </span>
                    <span className="ml-1.5 text-neutral-400">
                      — {meta.vietnameseName}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isPresent ? (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono text-[10px] border border-emerald-800/50">
                      Stage 1: {count} ô
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px]">
                      Dự trữ màn sau (0 ô)
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-neutral-400 pl-7 leading-relaxed">
                {meta.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
