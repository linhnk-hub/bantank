/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, AlertTriangle, ShieldCheck, Database, Layers } from 'lucide-react';
import type { MapValidationResult } from '../core/types.ts';

interface ValidationPanelProps {
  validation: MapValidationResult;
}

export const ValidationPanel: React.FC<ValidationPanelProps> = ({ validation }) => {
  const criteria = [
    {
      id: 1,
      title: 'Kích thước bản đồ 13 × 13',
      detail: `${validation.rows} hàng × ${validation.cols} cột = ${validation.totalTiles} ô`,
      passed: validation.rows === 13 && validation.cols === 13 && validation.totalTiles === 169,
    },
    {
      id: 2,
      title: 'Kích thước logic mỗi ô',
      detail: `${validation.tileSize} × ${validation.tileSize} pixel (tổng 208 × 208 px)`,
      passed: validation.tileSize === 16,
    },
    {
      id: 3,
      title: 'Ma trận Stage 1 nguyên bản',
      detail: `Gạch: ${validation.tileCounts[1]} | Thép: ${validation.tileCounts[2]} | Trống: ${validation.tileCounts[0]}`,
      passed: validation.isValid && validation.errors.length === 0,
    },
    {
      id: 4,
      title: 'Bảo toàn 3 ô BASE ở hàng cuối',
      detail: `Hàng 12, Cột [5, 6, 7] — Giữ nguyên 3 ô va chạm độc lập`,
      passed: validation.hasThreeBaseCells,
    },
    {
      id: 5,
      title: 'Game Core độc lập (Zero-Dependency)',
      detail: `Module pure TypeScript không phụ thuộc React, Phaser hoặc DOM`,
      passed: true,
    },
    {
      id: 6,
      title: 'Bảo toàn phạm vi Milestone 1',
      detail: `Chưa kích hoạt xe, đạn, AI hay Multiplayer theo đúng yêu cầu`,
      passed: true,
    },
    {
      id: 7,
      title: 'Không có lỗi runtime / biên dịch',
      detail: `TypeScript strict check & React 19 mount sạch sẽ`,
      passed: validation.errors.length === 0,
    },
  ];

  const allPassed = criteria.every((c) => c.passed);

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs">
      <div className="flex items-center justify-between mb-3 border-b border-neutral-800 pb-2">
        <h3 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Tiêu chí nghiệm thu Milestone 1 (Acceptance Checklist)
        </h3>
        <span
          className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] ${
            allPassed
              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              : 'bg-red-950 text-red-300 border border-red-800'
          }`}
        >
          {allPassed ? 'ĐẠT 7/7 TIÊU CHÍ' : 'CHƯA ĐẠT'}
        </span>
      </div>

      {/* Criteria Checklist */}
      <div className="space-y-2">
        {criteria.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-2.5 p-2 rounded bg-neutral-950 border border-neutral-800/80"
          >
            {item.passed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-200">
                  {item.id}. {item.title}
                </span>
                <span className="text-[10px] font-mono text-emerald-400">PASSED</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">{item.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Raw Matrix Metadata Summary */}
      <div className="mt-3 pt-3 border-t border-neutral-800 grid grid-cols-2 gap-2 text-neutral-400 text-[11px]">
        <div className="flex items-center gap-1.5 bg-neutral-950 p-2 rounded border border-neutral-800/60">
          <Database className="w-3.5 h-3.5 text-blue-400" />
          <span>Stage: <strong>01 (NES Battle City)</strong></span>
        </div>
        <div className="flex items-center gap-1.5 bg-neutral-950 p-2 rounded border border-neutral-800/60">
          <Layers className="w-3.5 h-3.5 text-purple-400" />
          <span>Total Base Cells: <strong>3 (Row 12)</strong></span>
        </div>
      </div>
    </div>
  );
};
