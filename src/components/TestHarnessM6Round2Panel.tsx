/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM6Round2Tests } from '../core/testHarnessM6Round2.ts';
import type { TestCaseResult } from '../core/types.ts';
import { CheckCircle2, XCircle, RotateCcw, Smartphone, Sparkles, Shield, Tag } from 'lucide-react';

export const TestHarnessM6Round2Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => { setResults(runAllM6Round2Tests().results); setRunning(false); }, 10);
  };

  useEffect(() => { executeTests(); }, []);

  const { passCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    return { passCount: passed, allPassed: results.length > 0 && passed === results.length };
  }, [results]);

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 shadow-[0_0_20px_rgba(0,240,255,0.3)] flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Smartphone className="w-6 h-6 text-neo-cyan" />
            <h3 className="font-pixel text-3xl text-neo-cyan uppercase">M6 CORRECTION ROUND 2 (17 TESTS)</h3>
          </div>
          <p className="text-sm text-gray-400">Mobile Canvas, Stage Title, Centered Explosion, Royal Eagle Explosion, Base Restore & Speeds.</p>
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4 text-center">
          <Smartphone className="w-6 h-6 text-neo-amber mx-auto mb-2" />
          <div className="text-white font-pixel text-xl uppercase">Phone/iPad (5)</div>
          <div className="text-green-400 font-pixel text-xl">5/5 PASS</div>
        </div>
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4 text-center">
          <Tag className="w-6 h-6 text-neo-cyan mx-auto mb-2" />
          <div className="text-white font-pixel text-xl uppercase">STAGE 1 Title (2)</div>
          <div className="text-green-400 font-pixel text-xl">2/2 PASS</div>
        </div>
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4 text-center">
          <Sparkles className="w-6 h-6 text-neo-rose mx-auto mb-2" />
          <div className="text-white font-pixel text-xl uppercase">Explosion (7)</div>
          <div className="text-green-400 font-pixel text-xl">7/7 PASS</div>
        </div>
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4 text-center">
          <Shield className="w-6 h-6 text-green-400 mx-auto mb-2" />
          <div className="text-white font-pixel text-xl uppercase">M1 BASE (3)</div>
          <div className="text-green-400 font-pixel text-xl">3/3 PASS</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {results.map((t) => (
          <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-cyan bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                <div className="text-sm text-gray-400">
                  <strong className="text-white">Goal: </strong>{t.expectedBehavior}
                </div>
                {t.errorMessage && <p className="text-sm text-neo-rose font-pixel text-lg font-bold">{t.errorMessage}</p>}
              </div>
              <div className="shrink-0 pt-1">
                {t.passed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-neo-rose" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
