/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, CheckCircle2, XCircle, Gauge, LayoutTemplate, RefreshCw } from 'lucide-react';
import { runSpeedAndLayoutTests, type SpeedLayoutTestResult } from '../core/testHarnessSpeedAndLayout.ts';

export const TestHarnessSpeedLayoutPanel: React.FC = () => {
  const [suiteResult, setSuiteResult] = useState<{ results: SpeedLayoutTestResult[]; allPassed: boolean; summary: { total: number; passed: number; failed: number }; }>(() => runSpeedAndLayoutTests());
  const handleRunAll = () => { setSuiteResult(runSpeedAndLayoutTests()); };
  const speedTests = suiteResult.results.filter((r) => r.category === 'SPEED_TIMING');
  const layoutTests = suiteResult.results.filter((r) => r.category === 'RESPONSIVE_LAYOUT');

  return (
    <div className="bg-black border-4 border-neo-amber pixel-corners p-6 shadow-[0_0_20px_rgba(255,184,0,0.3)] flex flex-col gap-6 font-display text-white">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-neo-amber pb-4">
        <div>
          <div className="flex items-center gap-3">
            <Gauge className="w-6 h-6 text-neo-amber" />
            <h3 className="font-pixel text-3xl text-neo-amber uppercase">SPEED (60HZ) & LAYOUT</h3>
          </div>
          <p className="text-sm text-gray-400 mt-2">10s = 600 ticks, Zero Catch-up, Max Canvas Responsive</p>
        </div>
        <button onClick={handleRunAll} className="btn-arcade px-6 py-3 flex items-center gap-2 text-xl">
          <RefreshCw className="w-5 h-5" /> RE-RUN ({suiteResult.summary.passed}/{suiteResult.summary.total})
        </button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-pixel text-2xl text-neo-amber uppercase">
          <Gauge className="w-5 h-5" /> 1. SIMULATION SPEED (60HZ)
        </div>
        <div className="grid grid-cols-1 gap-4">
          {speedTests.map((t) => (
            <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-amber">{t.id}</span>
                  <span className="uppercase">{t.name}</span>
                </div>
                {t.passed ? <span className="text-green-400 flex items-center gap-2 font-pixel text-xl"><CheckCircle2 className="w-5 h-5" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2 font-pixel text-xl"><XCircle className="w-5 h-5" /> FAIL</span>}
              </div>
              <div className="bg-gray-900 p-3 border-2 border-gray-800 pixel-corners font-pixel text-lg space-y-2">
                <div className="text-gray-400">EXP: <span className="text-white">{t.expected}</span></div>
                <div className={t.passed ? 'text-green-400' : 'text-neo-rose'}>ACT: <span className="break-all">{t.actual}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-4 border-t-2 border-gray-800">
        <div className="flex items-center gap-2 font-pixel text-2xl text-neo-cyan uppercase">
          <LayoutTemplate className="w-5 h-5" /> 2. RESPONSIVE LAYOUT
        </div>
        <div className="grid grid-cols-1 gap-4">
          {layoutTests.map((t) => (
            <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-cyan">{t.id}</span>
                  <span className="uppercase">{t.name}</span>
                </div>
                {t.passed ? <span className="text-green-400 flex items-center gap-2 font-pixel text-xl"><CheckCircle2 className="w-5 h-5" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2 font-pixel text-xl"><XCircle className="w-5 h-5" /> FAIL</span>}
              </div>
              <div className="bg-gray-900 p-3 border-2 border-gray-800 pixel-corners font-pixel text-lg space-y-2">
                <div className="text-gray-400">EXP: <span className="text-white">{t.expected}</span></div>
                <div className={t.passed ? 'text-green-400' : 'text-neo-rose'}>ACT: <span className="break-all">{t.actual}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
