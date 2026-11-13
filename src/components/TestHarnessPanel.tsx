/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RotateCw, ShieldCheck, Terminal, Cpu } from 'lucide-react';
import { runAllTestCases, runTC01, runTC02, runTC03, runTC04, runTC05, runTC06, runTC07, runTC08, runTC09, runTC10, runTC11, runTC12, type TestCaseResult } from '../core/testHarness.ts';

export const TestHarnessPanel: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => { executeAll(); }, []);

  const executeAll = () => { setIsRunning(true); setTimeout(() => { setResults(runAllTestCases()); setIsRunning(false); }, 50); };
  const executeSingle = (id: string) => {
    let res: TestCaseResult | null = null;
    switch (id) {
      case 'TC-01': res = runTC01(); break; case 'TC-02': res = runTC02(); break; case 'TC-03': res = runTC03(); break; case 'TC-04': res = runTC04(); break; case 'TC-05': res = runTC05(); break; case 'TC-06': res = runTC06(); break; case 'TC-07': res = runTC07(); break; case 'TC-08': res = runTC08(); break; case 'TC-09': res = runTC09(); break; case 'TC-10': res = runTC10(); break; case 'TC-11': res = runTC11(); break; case 'TC-12': res = runTC12(); break;
    }
    if (res) setResults((prev) => prev.map((item) => (item.id === id ? res! : item)));
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 shadow-[0_0_20px_rgba(0,240,255,0.3)] flex flex-col gap-6 font-display text-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-neo-cyan pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><Cpu className="w-6 h-6" /></div>
          <div>
            <h2 className="font-pixel text-3xl text-neo-cyan uppercase">M2 HARNESS (TC-01..12)</h2>
            <p className="text-sm text-gray-400 mt-1">AABB, Grid Snapping, Bullet vs Brick & Base Collision.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className={`px-4 py-2 font-pixel text-2xl border-2 pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
            {passedCount}/{totalCount} PASS
          </span>
          <button onClick={executeAll} disabled={isRunning} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
            <Play className="w-5 h-5" /> {isRunning ? 'RUNNING...' : 'EXECUTE ALL'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[560px] overflow-y-auto scrollbar-thin">
        {results.map((tc) => {
          const isSelected = selectedTc === tc.id;
          return (
            <div key={tc.id} onClick={() => setSelectedTc(isSelected ? null : tc.id)} className={`p-4 border-2 pixel-corners cursor-pointer transition-all ${tc.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'} ${isSelected ? 'border-neo-amber shadow-[0_0_10px_rgba(255,184,0,0.5)]' : ''}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {tc.passed ? <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" /> : <XCircle className="w-6 h-6 text-neo-rose shrink-0" />}
                  <span className="font-pixel text-2xl text-neo-amber">{tc.id}</span>
                  <span className="text-white truncate font-pixel text-xl uppercase">{tc.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 text-sm font-pixel border-2 pixel-corners ${tc.passed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  <button onClick={(e) => { e.stopPropagation(); executeSingle(tc.id); }} className="p-2 border-2 border-gray-600 bg-gray-800 hover:bg-gray-700 text-white pixel-corners"><RotateCw className="w-4 h-4" /></button>
                </div>
              </div>
              
              {isSelected && (
                <div className="mt-4 pt-4 border-t-2 border-gray-800 space-y-2 font-pixel text-lg cursor-auto">
                  <div className="text-gray-400 mb-4">{tc.details}</div>
                  <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners"><span className="text-gray-500">EXP:</span> <span className="text-green-400">{tc.expected}</span></div>
                  <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners"><span className="text-gray-500">ACT:</span> <span className={tc.passed ? 'text-neo-amber' : 'text-neo-rose'}>{tc.actual}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
