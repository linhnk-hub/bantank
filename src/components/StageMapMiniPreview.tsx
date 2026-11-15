/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TILE_TYPES } from '../core/types.ts';

interface StageMapMiniPreviewProps {
  map: number[][];
  sizePx?: number;
  locked?: boolean;
  showSpawns?: boolean;
  className?: string;
}

const TILE_COLOR_MAP: Record<number, string> = {
  [TILE_TYPES.EMPTY]: '#0c0c0f',
  [TILE_TYPES.BRICK]: '#b45309',
  [TILE_TYPES.STEEL]: '#94a3b8',
  [TILE_TYPES.WATER]: '#0284c7',
  [TILE_TYPES.GRASS]: '#15803d',
  [TILE_TYPES.ICE]: '#bae6fd',
  [TILE_TYPES.BASE]: '#f59e0b',
};

export const StageMapMiniPreview: React.FC<StageMapMiniPreviewProps> = ({
  map,
  sizePx = 104,
  locked = false,
  showSpawns = false,
  className = '',
}) => {
  const rows = Array.isArray(map) ? map.length : 13;
  const cols = Array.isArray(map) && Array.isArray(map[0]) ? map[0].length : 13;

  return (
    <div
      className={`relative inline-block rounded-lg overflow-hidden border border-neutral-700/80 bg-neutral-950 shrink-0 ${className}`}
      style={{ width: sizePx, height: sizePx }}
      aria-label="Xem trước bản đồ 13x13"
    >
      <svg
        viewBox={`0 0 ${cols} ${rows}`}
        width={sizePx}
        height={sizePx}
        className={`block ${locked ? 'opacity-45 grayscale-[40%]' : ''}`}
        shapeRendering="crispEdges"
      >
        <rect x={0} y={0} width={cols} height={rows} fill="#0c0c0f" />
        {Array.isArray(map) &&
          map.map((row, r) =>
            Array.isArray(row)
              ? row.map((tile, c) => {
                  if (tile === TILE_TYPES.EMPTY) return null;
                  const fill = TILE_COLOR_MAP[tile] || '#0c0c0f';
                  return (
                    <g key={`${r}-${c}`}>
                      <rect x={c} y={r} width={1} height={1} fill={fill} />
                      {tile === TILE_TYPES.BRICK && (
                        <line
                          x1={c}
                          y1={r + 0.5}
                          x2={c + 1}
                          y2={r + 0.5}
                          stroke="#78350f"
                          strokeWidth={0.12}
                        />
                      )}
                      {tile === TILE_TYPES.STEEL && (
                        <rect
                          x={c + 0.2}
                          y={r + 0.2}
                          width={0.6}
                          height={0.6}
                          fill="#e2e8f0"
                          opacity={0.45}
                        />
                      )}
                      {tile === TILE_TYPES.BASE && (
                        <circle cx={c + 0.5} cy={r + 0.5} r={0.28} fill="#fef3c7" />
                      )}
                    </g>
                  );
                })
              : null
          )}
        {showSpawns && (
          <>
            <circle cx={0.5} cy={0.5} r={0.26} fill="#ef4444" />
            <circle cx={6.5} cy={0.5} r={0.26} fill="#ef4444" />
            <circle cx={12.5} cy={0.5} r={0.26} fill="#ef4444" />
            <circle cx={3.5} cy={12.5} r={0.26} fill="#22c55e" />
            <circle cx={9.5} cy={12.5} r={0.26} fill="#38bdf8" />
          </>
        )}
      </svg>
    </div>
  );
};
