/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM5CorrectionTests, type TestResult } from '../core/testHarnessM5Corrections.ts';
import { CheckCircle2, XCircle, RotateCcw, ShieldCheck, Crosshair, Sparkles, Maximize, Smartphone } from 'lucide-react';

export const TestHarnessCorrectionsPanel: React.FC = () => {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => { setResults(runAllM5CorrectionTests()); setRunning(false); }, 10);
  };

  useEffect(() => { executeTests(); }, []);

  const { passCount, failCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    return { passCount: passed, failCount: failed, allPassed: results.length > 0 && failed === 0 };
  }, [results]);

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,240,255,0.3)]">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-neo-cyan" />
            <h3 className="font-pixel text-3xl text-neo-cyan uppercase">UI POLISH & GAMEPLAY CORRECTIONS</h3>
          </div>
          <p className="text-sm text-gray-400 mt-2">15 TESTS: Center Joysticks, Fullscreen API, Main Menu Return, Single Eagle, 3s Shield Flash.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 border-2 font-pixel text-xl pixel-corners flex items-center gap-2 ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
            {allPassed ? <><ShieldCheck className="w-5 h-5" /> 15/15 PASS</> : <span>{passCount}/15 PASS ({failCount} FAIL)</span>}
          </div>
          <button onClick={executeTests} disabled={running} className="btn-arcade-outline px-4 py-2 flex items-center gap-2">
            <RotateCcw className={`w-5 h-5 ${running ? 'animate-spin' : ''}`} /> RE-RUN
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { icon: <Crosshair className="w-5 h-5" />, title: "CTRL CENTER", desc: "TC01-04 (4)" },
          { icon: <Maximize className="w-5 h-5" />, title: "FULLSCREEN", desc: "TC05-08 (4)" },
          { icon: <RotateCcw className="w-5 h-5" />, title: "MENU RTN", desc: "TC09-11 (3)" },
          { icon: <ShieldCheck className="w-5 h-5" />, title: "1 EAGLE", desc: "TC12-14 (3)" },
          { icon: <Sparkles className="w-5 h-5" />, title: "SHIELD VFX", desc: "TC15 (1)" },
        ].map((g, i) => (
          <div key={i} className="bg-black border-2 border-gray-700 pixel-corners p-4 text-center">
            <div className="text-neo-amber font-pixel text-xl flex items-center justify-center gap-2 mb-2">{g.icon}</div>
            <div className="text-white font-pixel text-lg">{g.title}</div>
            <div className="text-gray-500 font-pixel text-sm">{g.desc}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {results.map((res) => (
          <div key={res.id} className={`p-4 border-2 pixel-corners flex items-start justify-between gap-4 transition-colors ${res.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-pixel text-xl text-neo-cyan px-2 py-1 bg-gray-900 border border-gray-700 pixel-corners">{res.id}</span>
                <span className="font-pixel text-xl text-white uppercase">{res.name}</span>
              </div>
              <p className={`text-sm ${res.passed ? 'text-gray-400' : 'text-neo-rose'}`}>{res.message}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0 pt-1">
              <span className="font-pixel text-lg text-gray-500">{res.durationMs}MS</span>
              {res.passed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-neo-rose" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
