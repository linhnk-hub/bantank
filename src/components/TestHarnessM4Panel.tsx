/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RotateCw, Cpu, Layers, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { runAllM4Tests, type TestCaseM4Result } from '../core/testHarnessM4.ts';

export const TestHarnessM4Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseM4Result[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => { executeAll(); }, []);
  const executeAll = () => { setIsRunning(true); setTimeout(() => { setResults(runAllM4Tests()); setIsRunning(false); }, 50); };

  const passCount = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && passCount === results.length;

  return (
    <div className="bg-black border-4 border-neo-amber pixel-corners flex flex-col font-display text-white shadow-[0_0_20px_rgba(255,184,0,0.3)]">
      <div className="bg-black px-6 py-4 border-b-4 border-neo-amber flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber flex items-center justify-center text-neo-amber pixel-corners"><Cpu className="w-6 h-6" /></div>
          <div>
            <h2 className="font-pixel text-3xl text-neo-amber flex items-center gap-3">
              M4: MATCH LIFECYCLE & CONTROLS
              {allPassed && <span className="px-2 py-1 bg-green-900/40 text-green-400 border-2 border-green-500 text-xl font-pixel pixel-corners">12/12 PASS</span>}
            </h2>
            <p className="text-gray-400 text-sm mt-1">State Machine, Pause Freeze, Time Clamping, Score, High Score & Touch Input</p>
          </div>
        </div>
        <button onClick={executeAll} disabled={isRunning} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
          <RotateCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} /> {isRunning ? 'RUNNING...' : 'RE-RUN'}
        </button>
      </div>

      <div className="px-6 py-3 bg-gray-900 border-b-2 border-gray-800 flex items-center justify-between font-pixel text-2xl">
        <div className="flex gap-8">
          <span className="text-gray-400">TOTAL: <span className="text-white">{results.length}</span></span>
          <span className="text-green-400">PASS: {passCount}</span>
          <span className="text-neo-rose">FAIL: {results.length - passCount}</span>
        </div>
        <div className="text-neo-amber">{allPassed ? '100% M4 SPECS MET' : 'AWAITING FIXES...'}</div>
      </div>

      <div className="divide-y-2 divide-gray-800 max-h-[540px] overflow-y-auto scrollbar-thin">
        {results.map((tc) => {
          const isSelected = selectedTc === tc.id;
          return (
            <div key={tc.id} className={`transition-colors ${isSelected ? 'bg-gray-900' : 'hover:bg-gray-900/50'}`}>
              <div onClick={() => setSelectedTc(isSelected ? null : tc.id)} className="px-6 py-4 flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-4">
                  {tc.passed ? <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" /> : <XCircle className="w-6 h-6 text-neo-rose shrink-0" />}
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-pixel text-2xl text-neo-amber">{tc.id}</span>
                      <span className="font-pixel text-xl text-white uppercase">{tc.name}</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{tc.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 font-pixel text-xl border-2 pixel-corners ${tc.passed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {isSelected ? <ChevronUp className="w-6 h-6 text-gray-500" /> : <ChevronDown className="w-6 h-6 text-gray-500" />}
                </div>
              </div>

              {isSelected && (
                <div className="px-6 pb-6 pt-2 space-y-4">
                  <div className="bg-black border-2 border-gray-700 p-4 pixel-corners">
                    <span className="text-gray-500 font-pixel text-xl mb-2 block">DETAILS:</span>
                    <p className="text-gray-300 font-pixel text-lg">{tc.details}</p>
                  </div>
                  {tc.metrics && Object.keys(tc.metrics).length > 0 && (
                    <div className="bg-black border-2 border-gray-700 p-4 pixel-corners">
                      <span className="text-gray-500 font-pixel text-xl mb-2 block">METRICS:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {Object.entries(tc.metrics).map(([key, val]) => (
                          <div key={key} className="bg-gray-900 border-2 border-gray-800 p-2 pixel-corners font-pixel text-lg">
                            <div className="text-neo-cyan truncate">{key}</div>
                            <div className="text-white truncate">{String(val)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
