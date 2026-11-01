/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { GameCoreState } from '../core/types.ts';
import { Crosshair, ShieldAlert, Zap, Compass, RotateCcw, AlertTriangle } from 'lucide-react';

interface PlaytestHudProps {
  state: GameCoreState | null;
  onReset: () => void;
}

export const PlaytestHud: React.FC<PlaytestHudProps> = ({ state, onReset }) => {
  if (!state) {
    return null;
  }

  const p1 = state.p1;
  const bullet = state.bullet;
  const isBaseDestroyed = state.terrain.isBaseDestroyed;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs flex flex-col gap-3">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
        <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
          Bảng Thông số Trận đấu (P1 Live HUD)
        </h3>

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors text-[11px] font-medium"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Đặt lại P1</span>
        </button>
      </div>

      {/* Game Over Banner */}
      {state.isGameOver && (
        <div className="p-2.5 rounded bg-red-950/80 border border-red-700 flex items-center gap-2 text-red-200 font-bold animate-pulse">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{state.gameOverReason ?? 'GAME OVER! Căn cứ đã bị phá hủy.'}</span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
        {/* P1 Tank Stats */}
        <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-400 border-b border-neutral-800/80 pb-1">
            <Compass className="w-3.5 h-3.5" />
            <span>XE TĂNG P1</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Tọa độ:</span>
            <span className="text-neutral-200 font-semibold">x={p1.x}, y={p1.y}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Hướng:</span>
            <span className="text-sky-400 font-semibold">{p1.direction}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Vận tốc:</span>
            <span className="text-neutral-300">60 px/s (1px/tick)</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-neutral-500">Hitbox:</span>
            <span className="text-neutral-400">[{p1.x + 1},{p1.x + 15})×[{p1.y + 1},{p1.y + 15})</span>
          </div>
        </div>

        {/* Bullet Stats */}
        <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-orange-400 border-b border-neutral-800/80 pb-1">
            <Zap className="w-3.5 h-3.5" />
            <span>ĐẠN P1 (Tối đa 1)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Trạng thái:</span>
            <span className={bullet ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
              {bullet ? 'ĐANG BAY (1/1)' : 'SẴN SÀNG (0/1)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Tọa độ:</span>
            <span className="text-neutral-200">
              {bullet ? `x=${bullet.x.toFixed(1)}, y=${bullet.y.toFixed(1)}` : 'Chưa bắn'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Vận tốc:</span>
            <span className="text-neutral-300">160 px/s (~2.67px/t)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Căn cứ:</span>
            <span className={isBaseDestroyed ? 'text-red-400 font-bold' : 'text-emerald-400 font-semibold'}>
              {isBaseDestroyed ? 'BỊ PHÁ HỦY' : 'AN TOÀN'}
            </span>
          </div>
        </div>
      </div>

      {/* Diagnostic Log if any */}
      {state.diagnosticLog && (
        <div className="p-2 rounded bg-neutral-950 border border-neutral-800 font-mono text-[10px] text-amber-300">
          <strong>Chẩn đoán engine:</strong> {state.diagnosticLog}
        </div>
      )}

      {/* Control Guide */}
      <div className="p-2.5 rounded bg-neutral-950 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
        <span className="font-semibold text-neutral-200 block">Hướng dẫn phím điều khiển:</span>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>• Di chuyển: <strong className="text-neutral-200">W, A, S, D</strong> hoặc <strong className="text-neutral-200">Phím Mũi tên</strong></div>
          <div>• Bắn đạn: <strong className="text-neutral-200">Phím Space</strong> hoặc <strong className="text-neutral-200">Phím J</strong></div>
        </div>
        <p className="text-[10px] text-neutral-500 pt-1">
          Hệ thống áp dụng Safe Grid Snapping: Khi rẽ vào khe hẹp 1 ô, xe tự động nắn tim đường nếu lệch &le; 4px.
        </p>
      </div>
    </div>
  );
};
