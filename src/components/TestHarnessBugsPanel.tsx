/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RotateCw, Bug, ShieldAlert, ChevronDown, ChevronUp, Crosshair, Shield, Layers } from 'lucide-react';
import { runAllBugTestCases, type BugTestCaseResult } from '../core/testHarnessM4Bugs.ts';

export const TestHarnessBugsPanel: React.FC = () => {
  const [results, setResults] = useState<BugTestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => { executeAll(); }, []);

  const executeAll = () => {
    setIsRunning(true);
    setTimeout(() => { setResults(runAllBugTestCases()); setIsRunning(false); }, 50);
  };

  const passCount = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && passCount === results.length;

  return (
    <div className="bg-black border-4 border-neo-rose pixel-corners flex flex-col font-display text-white shadow-[0_0_20px_rgba(255,0,85,0.3)]">
      <div className="bg-black px-6 py-4 border-b-2 border-neo-rose flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-neo-rose/20 border-2 border-neo-rose flex items-center justify-center text-neo-rose pixel-corners">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-pixel text-3xl text-neo-rose flex items-center gap-2 uppercase">
              POST-M4 BUG AUDIT
              {allPassed && <span className="px-2 py-1 bg-green-900/40 text-green-400 border-2 border-green-500 font-pixel text-xl pixel-corners ml-2">4/4 FIXED</span>}
            </h2>
            <p className="text-gray-400 text-sm mt-1">AI Targeting, Subtile Bitmask, Base Protection, Enemy Spawn Shield</p>
          </div>
        </div>
        <button onClick={executeAll} disabled={isRunning} className="btn-arcade-outline !border-neo-rose !text-neo-rose px-4 py-2 font-pixel text-xl flex items-center gap-2">
          <RotateCw className={`w-5 h-5 ${isRunning ? 'animate-spin' : ''}`} /> {isRunning ? 'RUNNING...' : 'RE-RUN'}
        </button>
      </div>

      <div className="px-6 py-4 bg-gray-900 border-b-2 border-gray-800 flex items-center justify-between font-pixel text-2xl">
        <div className="flex gap-6">
          <span className="text-gray-400">TOTAL: <span className="text-white">{results.length}</span></span>
          <span className="text-green-400">PASS: {passCount}</span>
          {results.length - passCount > 0 && <span className="text-neo-rose">FAIL: {results.length - passCount}</span>}
        </div>
      </div>

      <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto scrollbar-thin">
        {results.map((tc) => {
          const isExpanded = selectedTc === tc.id;
          return (
            <div key={tc.id} className={`pixel-corners border-2 transition-colors ${tc.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div onClick={() => setSelectedTc(isExpanded ? null : tc.id)} className="px-4 py-3 flex items-center justify-between cursor-pointer">
                <div className="flex items-center gap-4">
                  {tc.passed ? <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" /> : <XCircle className="w-6 h-6 text-neo-rose shrink-0" />}
                  <span className="font-pixel text-2xl text-neo-amber">{tc.id} ({tc.bugNumber})</span>
                  <span className="font-pixel text-xl text-white">{tc.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-2 py-1 font-pixel text-xl pixel-corners border-2 ${tc.passed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t-2 border-gray-800 space-y-4">
                  <p className="text-gray-400 text-sm">{tc.details}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-pixel text-lg">
                    <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners">
                      <span className="text-gray-500 block">EXPECTED:</span>
                      <span className="text-gray-300 break-all">{tc.expected}</span>
                    </div>
                    <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners">
                      <span className="text-gray-500 block">ACTUAL:</span>
                      <span className={`${tc.passed ? 'text-green-400' : 'text-neo-rose'} break-all`}>{tc.actual}</span>
                    </div>
                  </div>
                  {tc.diagnostics && (
                    <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners font-mono text-xs text-gray-400 overflow-x-auto">
                      <span className="text-neo-amber font-pixel text-xl block mb-2">AI DIAGNOSTICS:</span>
                      <pre>{JSON.stringify(tc.diagnostics, null, 2)}</pre>
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
