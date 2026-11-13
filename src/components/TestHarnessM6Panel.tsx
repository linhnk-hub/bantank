/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM6Tests, type TestCaseM6Result } from '../core/testHarnessM6.ts';
import { CheckCircle2, XCircle, RotateCcw, Monitor, ShieldCheck, Gauge } from 'lucide-react';

export const TestHarnessM6Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseM6Result[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => { setResults(runAllM6Tests()); setRunning(false); }, 10);
  };

  useEffect(() => { executeTests(); }, []);

  const { passCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    return { passCount: passed, allPassed: results.length > 0 && passed === results.length };
  }, [results]);

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-amber pixel-corners p-6 shadow-[0_0_20px_rgba(255,184,0,0.3)] flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Monitor className="w-6 h-6 text-neo-amber" />
            <h3 className="font-pixel text-3xl text-neo-amber uppercase">M6 GAMEPLAY & RESPONSIVE (23 TESTS)</h3>
          </div>
          <p className="text-sm text-gray-400">PC Canvas Scale, 1 Eagle + 2 Bricks, FPS/Ping, Shield Flash, Mobile 100dvh.</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4">
          <div className="flex items-center gap-2 text-neo-amber font-pixel text-xl mb-2"><Monitor className="w-4 h-4" /> PC Integer Scale</div>
          <p className="text-sm text-gray-400">1366x768 (624px, 3x), 1440x900 (728px, 3.5x), 1920x1080 (832px, 4x).</p>
        </div>
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4">
          <div className="flex items-center gap-2 text-neo-cyan font-pixel text-xl mb-2"><ShieldCheck className="w-4 h-4" /> 1 Eagle + Bricks</div>
          <p className="text-sm text-gray-400">Eagle (12, 6); gạch (12, 5) và (12, 7) bảo vệ cánh, nhận đạn phá sub-tile.</p>
        </div>
        <div className="bg-black border-2 border-gray-700 pixel-corners p-4">
          <div className="flex items-center gap-2 text-green-400 font-pixel text-xl mb-2"><Gauge className="w-4 h-4" /> FPS & Ping</div>
          <p className="text-sm text-gray-400">FPS đo đạc 500ms chu kỳ, Ping trung thực không số giả.</p>
        </div>
      </div>

      <div className="bg-black border-2 border-gray-700 pixel-corners overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
          <table className="w-full text-left">
            <thead className="bg-gray-900 sticky top-0 z-10 border-b-2 border-gray-700 font-pixel text-xl text-gray-400">
              <tr>
                <th className="py-4 px-6 w-32">ID</th>
                <th className="py-4 px-6">TEST DESCRIPTION & EXP</th>
                <th className="py-4 px-6 w-32 text-center">RESULT</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-800 font-display text-sm">
              {results.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-900/50 transition-colors ${!r.passed ? 'bg-neo-rose/20' : ''}`}>
                  <td className="py-4 px-6 font-pixel text-2xl text-neo-amber align-top">{r.id}</td>
                  <td className="py-4 px-6 align-top">
                    <div className="font-bold text-white uppercase mb-1">{r.name}</div>
                    <div className="text-gray-400 mb-2">{r.details}</div>
                    <div className="font-pixel text-lg text-gray-500">EXP: <span className="text-gray-300">{r.expected}</span></div>
                  </td>
                  <td className="py-4 px-6 text-center align-middle">
                    {r.passed ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-900/40 text-green-400 border-2 border-green-500 pixel-corners font-pixel text-xl">
                        <CheckCircle2 className="w-5 h-5" /> PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1 bg-neo-rose/20 text-neo-rose border-2 border-neo-rose pixel-corners font-pixel text-xl">
                        <XCircle className="w-5 h-5" /> FAIL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
