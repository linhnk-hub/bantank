/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { runAllUIPolishTests, type UIPolishTestCaseResult } from '../core/testHarnessM4UIPolish.ts';
import { CheckCircle2, XCircle, Play, Sparkles } from 'lucide-react';

export const TestHarnessUIPolishPanel: React.FC = () => {
  const [results, setResults] = useState<UIPolishTestCaseResult[]>(() => runAllUIPolishTests());
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleRunAll = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runAllUIPolishTests();
      setResults(res);
      setIsRunning(false);
    }, 100);
  };

  const passCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passCount === totalCount;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 shadow-xl flex flex-col gap-4 text-xs select-none">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-white">
            Kiểm toán M4 UI Polish (4 Hạng Mục)
          </h2>
          <span
            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
              allPassed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400'
            }`}
          >
            {passCount}/{totalCount} PASS
          </span>
        </div>

        <button
          type="button"
          onClick={handleRunAll}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold active:scale-95 transition-all shadow"
        >
          <Play className="w-3.5 h-3.5 fill-black" />
          <span>{isRunning ? 'Đang chạy...' : 'Chạy lại 4 Tests'}</span>
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {results.map((r) => (
          <div
            key={r.id}
            className={`p-3 rounded-lg border transition-all ${
              r.passed
                ? 'bg-neutral-950/70 border-emerald-900/40 hover:border-emerald-700/60'
                : 'bg-red-950/40 border-red-800/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 font-mono">
                <span className="font-bold text-amber-400">{r.id}</span>
                <span className="text-neutral-200 font-sans font-semibold">{r.name}</span>
              </div>
              <div className="flex items-center gap-1 font-bold">
                {r.passed ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-red-400">
                    <XCircle className="w-3.5 h-3.5" /> FAIL
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-neutral-400 mb-2 leading-relaxed">{r.details}</p>

            <div className="bg-neutral-900/90 p-2 rounded text-[10px] font-mono space-y-1 border border-neutral-800">
              <div className="text-neutral-400">
                <strong className="text-neutral-300">Kỳ vọng:</strong> {r.expected}
              </div>
              <div className={r.passed ? 'text-emerald-400' : 'text-red-400'}>
                <strong className="text-neutral-300">Thực tế:</strong> {r.actual}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
