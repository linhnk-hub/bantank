/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Gauge, LayoutTemplate, RefreshCw } from 'lucide-react';
import { runSpeedAndLayoutTests, type SpeedLayoutTestResult } from '../core/testHarnessSpeedAndLayout.ts';

export const TestHarnessSpeedLayoutPanel: React.FC = () => {
  const [suiteResult, setSuiteResult] = useState<{
    results: SpeedLayoutTestResult[];
    allPassed: boolean;
    summary: { total: number; passed: number; failed: number };
  }>(() => runSpeedAndLayoutTests());

  const handleRunAll = () => {
    setSuiteResult(runSpeedAndLayoutTests());
  };

  const speedTests = suiteResult.results.filter((r) => r.category === 'SPEED_TIMING');
  const layoutTests = suiteResult.results.filter((r) => r.category === 'RESPONSIVE_LAYOUT');

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-neutral-900 to-neutral-900 border border-amber-500/30">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-sm sm:text-base text-white tracking-wide">
              Game Speed (60Hz Ticks) & Responsive Layout
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            10s = 600 ticks, Pause/Resume 0 catch-up, Tab switch 0 catch-up, Phone & Tablet Max Canvas
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunAll}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Chạy Lại ({suiteResult.summary.passed}/{suiteResult.summary.total})</span>
        </button>
      </div>

      {/* Speed & Timing Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-bold text-amber-400 uppercase tracking-wider">
          <Gauge className="w-3.5 h-3.5" />
          <span>1. Tốc Độ Gameplay & Simulation 60Hz ({speedTests.filter(t => t.passed).length}/{speedTests.length} PASS)</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {speedTests.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-xl border text-xs flex flex-col gap-1 transition-colors ${
                t.passed
                  ? 'bg-neutral-900/60 border-neutral-800'
                  : 'bg-rose-950/30 border-rose-800/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-200">
                  <span className="font-mono text-amber-400 text-[11px]">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                {t.passed ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 shrink-0">
                    <XCircle className="w-3.5 h-3.5" /> FAIL
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                <span className="text-neutral-500">Mục tiêu:</span> {t.expected}
              </div>
              <div className={`text-[11px] font-mono ${t.passed ? 'text-emerald-500/90' : 'text-rose-400 font-semibold'}`}>
                {t.actual}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Responsive Viewport Layout Section */}
      <div className="space-y-2 pt-2 border-t border-neutral-800">
        <div className="flex items-center gap-2 px-1 text-xs font-bold text-sky-400 uppercase tracking-wider">
          <LayoutTemplate className="w-3.5 h-3.5" />
          <span>2. Responsive Canvas & Controls Khoảng Cách ({layoutTests.filter(t => t.passed).length}/{layoutTests.length} PASS)</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {layoutTests.map((t) => (
            <div
              key={t.id}
              className={`p-3 rounded-xl border text-xs flex flex-col gap-1 transition-colors ${
                t.passed
                  ? 'bg-neutral-900/60 border-neutral-800'
                  : 'bg-rose-950/30 border-rose-800/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-bold text-neutral-200">
                  <span className="font-mono text-sky-400 text-[11px]">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                {t.passed ? (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 shrink-0">
                    <XCircle className="w-3.5 h-3.5" /> FAIL
                  </span>
                )}
              </div>
              <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                <span className="text-neutral-500">Mục tiêu:</span> {t.expected}
              </div>
              <div className={`text-[11px] font-mono ${t.passed ? 'text-emerald-500/90' : 'text-rose-400 font-semibold'}`}>
                {t.actual}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
