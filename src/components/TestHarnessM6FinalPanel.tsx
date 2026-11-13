/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM6FinalTests, type FinalTestCaseResult } from '../core/testHarnessM6Final.ts';
import { CheckCircle2, XCircle, RotateCcw, Flame } from 'lucide-react';

export const TestHarnessM6FinalPanel: React.FC = () => {
  const [results, setResults] = useState<FinalTestCaseResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => { setResults(runAllM6FinalTests().results); setRunning(false); }, 10);
  };

  useEffect(() => { executeTests(); }, []);

  const { passCount, failCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    return { passCount: passed, failCount: failed, allPassed: results.length > 0 && failed === 0 };
  }, [results]);

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-amber pixel-corners p-6 shadow-[0_0_20px_rgba(255,184,0,0.3)] flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-6 h-6 text-neo-amber" />
            <h3 className="font-pixel text-3xl text-neo-amber uppercase">M6 FINAL (24 TESTS)</h3>
          </div>
          <p className="text-sm text-gray-400">Controls Portrait, Canvas Landscape, Respawn P1/Enemy, Continuous Fire.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`px-4 py-2 font-pixel text-2xl border-2 pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
            {passCount}/{results.length} PASS
          </span>
          <button onClick={executeTests} disabled={running} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
            <RotateCcw className={`w-5 h-5 ${running ? 'animate-spin' : ''}`} /> RE-RUN
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {results.map((r) => (
          <div key={r.id} className={`p-4 border-2 pixel-corners transition-all ${r.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-amber bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{r.id}</span>
                  <span>{r.name}</span>
                </div>
                {r.details && <p className="text-sm text-gray-400">{r.details}</p>}
                {r.expected && <p className="text-sm text-green-400 font-pixel text-lg">EXP: {r.expected}</p>}
                {!r.passed && r.actual && <p className="text-sm text-neo-rose font-pixel text-lg font-bold">ACT: {r.actual}</p>}
              </div>
              <div className="shrink-0 pt-1">
                {r.passed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-neo-rose" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
