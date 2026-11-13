/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RotateCw, Cpu, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { runAllM3TestCases, runM301, runM302, runM303, runM304, runM305, runM306, runM307, runM308, runM309, runM310, runM311, runM312, runM313, runM314, type TestCaseResult } from '../core/testHarnessM3.ts';

export const TestHarnessM3Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => { executeAll(); }, []);

  const executeAll = () => { setIsRunning(true); setTimeout(() => { setResults(runAllM3TestCases()); setIsRunning(false); }, 50); };
  const executeSingle = (id: string) => {
    let res: TestCaseResult | null = null;
    switch (id) {
      case 'M3-01': res = runM301(); break; case 'M3-02': res = runM302(); break; case 'M3-03': res = runM303(); break; case 'M3-04': res = runM304(); break; case 'M3-05': res = runM305(); break; case 'M3-06': res = runM306(); break; case 'M3-07': res = runM307(); break; case 'M3-08': res = runM308(); break; case 'M3-09': res = runM309(); break; case 'M3-10': res = runM310(); break; case 'M3-11': res = runM311(); break; case 'M3-12': res = runM312(); break; case 'M3-13': res = runM313(); break; case 'M3-14': res = runM314(); break;
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
            <h2 className="font-pixel text-3xl text-neo-cyan uppercase">M3 HARNESS (M3-01..14)</h2>
            <p className="text-sm text-gray-400 mt-1">Enemy AI Determinism, LoS 80px, A* Pathfinding, Collision & P1 Lives.</p>
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
            <div key={tc.id} className={`p-4 border-2 pixel-corners transition-all ${tc.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setSelectedTc(isSelected ? null : tc.id)}>
                  {tc.passed ? <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" /> : <XCircle className="w-6 h-6 text-neo-rose shrink-0" />}
                  <span className="font-pixel text-2xl text-neo-amber">{tc.id}</span>
                  <span className="text-white truncate font-pixel text-xl uppercase">{tc.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-1 text-sm font-pixel border-2 pixel-corners ${tc.passed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  <button onClick={() => executeSingle(tc.id)} className="p-2 border-2 border-gray-600 bg-gray-800 hover:bg-gray-700 text-white pixel-corners"><RotateCw className="w-4 h-4" /></button>
                  <button onClick={() => setSelectedTc(isSelected ? null : tc.id)} className="p-2 text-gray-400 hover:text-white">{isSelected ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>
                </div>
              </div>
              
              {isSelected && (
                <div className="mt-4 pt-4 border-t-2 border-gray-800 space-y-2 font-pixel text-lg">
                  <div className="text-gray-400 mb-4">{tc.details}</div>
                  <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners"><span className="text-gray-500">EXP:</span> <span className="text-green-400">{tc.expected}</span></div>
                  <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners"><span className="text-gray-500">ACT:</span> <span className="text-neo-amber">{tc.actual}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
