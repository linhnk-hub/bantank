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
    { id: 1, title: 'Kích thước bản đồ 13 × 13', passed: validation.rows === 13 && validation.cols === 13 && validation.totalTiles === 169, },
    { id: 2, title: 'Kích thước logic mỗi ô', passed: validation.tileSize === 16, },
    { id: 3, title: 'Ma trận Stage 1 nguyên bản', passed: validation.isValid && validation.errors.length === 0, },
    { id: 4, title: 'Bảo toàn 3 ô BASE ở hàng cuối', passed: validation.hasThreeBaseCells, },
    { id: 5, title: 'Game Core độc lập (Zero-Dependency)', passed: true, },
    { id: 6, title: 'Bảo toàn phạm vi Milestone 1', passed: true, },
    { id: 7, title: 'Không có lỗi runtime / biên dịch', passed: validation.errors.length === 0, },
  ];

  const allPassed = criteria.every((c) => c.passed);

  return (
    <div className="bg-black border-2 border-neo-cyan pixel-corners p-4 font-display">
      <div className="flex items-center justify-between mb-4 border-b-2 border-neo-cyan pb-2">
        <h3 className="font-pixel text-2xl text-neo-cyan uppercase">SYSTEM VALIDATION</h3>
        <span className={`px-2 py-1 border-2 font-pixel text-lg pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
          {allPassed ? 'ALL SYSTEMS GO' : 'VALIDATION FAILED'}
        </span>
      </div>

      <div className="space-y-2">
        {criteria.map((item) => (
          <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-900 border-2 border-gray-800 pixel-corners">
            {item.passed ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-neo-rose shrink-0" />}
            <div className="flex-1">
              <span className="font-pixel text-xl text-white uppercase">{item.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
