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
  const tileList = [TILE_TYPES.EMPTY, TILE_TYPES.BRICK, TILE_TYPES.STEEL, TILE_TYPES.BASE, TILE_TYPES.WATER, TILE_TYPES.GRASS, TILE_TYPES.ICE];

  return (
    <div className="bg-black border-2 border-neo-cyan pixel-corners p-4 text-xs font-display">
      <div className="flex items-center justify-between mb-4 border-b-2 border-neo-cyan pb-2">
        <h3 className="font-pixel text-2xl text-neo-cyan uppercase">TERRAIN LEGEND</h3>
        <span className="text-gray-400 font-pixel text-lg">16x16 PX/TILE</span>
      </div>

      <div className="space-y-3">
        {tileList.map((typeId) => {
          const meta = TILE_METADATA[typeId];
          const count = tileCounts[typeId] || 0;
          const isPresent = meta.presentInStage1;

          return (
            <div key={typeId} className={`p-3 border-2 pixel-corners transition-all ${isPresent ? 'bg-black border-gray-700 hover:border-neo-cyan' : 'bg-gray-900 border-dashed border-gray-800 opacity-60'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 border-2 border-gray-500 flex items-center justify-center font-pixel text-sm text-black" style={{ backgroundColor: meta.colorHex }}>
                    {typeId}
                  </div>
                  <div>
                    <span className="font-pixel text-xl text-white uppercase">{meta.name}</span>
                    <span className="ml-2 text-gray-500 font-pixel text-lg uppercase">— {meta.vietnameseName}</span>
                  </div>
                </div>
                <div>
                  {isPresent ? (
                    <span className="px-2 py-1 bg-neo-cyan/20 text-neo-cyan border-2 border-neo-cyan font-pixel text-lg pixel-corners">STAGE 1: {count}</span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-800 text-gray-500 border-2 border-gray-700 font-pixel text-lg pixel-corners">N/A</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 pl-9 leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
