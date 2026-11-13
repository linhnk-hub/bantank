/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { runAllJoystickTests, type JoystickTestCaseResult } from '../core/testHarnessM4Joystick.ts';
import { CheckCircle2, XCircle, Play, Gamepad2 } from 'lucide-react';

export const TestHarnessJoystickPanel: React.FC = () => {
  const [results, setResults] = useState<JoystickTestCaseResult[]>(() => runAllJoystickTests());
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleRunAll = () => {
    setIsRunning(true); setTimeout(() => { setResults(runAllJoystickTests()); setIsRunning(false); }, 100);
  };

  const passCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passCount === totalCount;

  return (
    <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 shadow-[0_0_20px_rgba(0,240,255,0.3)] flex flex-col gap-6 font-display text-white">
      <div className="flex items-center justify-between pb-4 border-b-2 border-neo-cyan">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><Gamepad2 className="w-6 h-6" /></div>
          <div>
            <h2 className="font-pixel text-3xl text-neo-cyan uppercase">JOYSTICK & PC SCALE AUDIT</h2>
            <span className={`inline-block mt-2 px-3 py-1 font-pixel text-xl border-2 pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
              {passCount}/{totalCount} PASS
            </span>
          </div>
        </div>

        <button type="button" onClick={handleRunAll} disabled={isRunning} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
          <Play className="w-5 h-5" /> {isRunning ? 'RUNNING...' : 'EXECUTE 6 TESTS'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {results.map((r) => (
          <div key={r.id} className={`p-4 border-2 pixel-corners transition-all ${r.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="font-pixel text-2xl text-neo-amber bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{r.id}</span>
                <span className="font-pixel text-xl text-white uppercase">{r.name}</span>
              </div>
              <div className="font-pixel text-2xl">
                {r.passed ? <span className="text-green-400 flex items-center gap-2"><CheckCircle2 className="w-6 h-6" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2"><XCircle className="w-6 h-6" /> FAIL</span>}
              </div>
            </div>

            <p className="text-sm text-gray-400 mb-4">{r.details}</p>

            <div className="bg-gray-900 p-3 border-2 border-gray-700 pixel-corners font-pixel text-lg space-y-2">
              <div className="text-gray-400">EXPECTED: <span className="text-white break-all">{r.expected}</span></div>
              <div className={r.passed ? 'text-green-400' : 'text-neo-rose'}>ACTUAL: <span className="break-all">{r.actual}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
