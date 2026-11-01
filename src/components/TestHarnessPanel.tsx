/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Play, RotateCw, ShieldCheck, Terminal, Cpu } from 'lucide-react';
import {
  runAllTestCases,
  runTC01,
  runTC02,
  runTC03,
  runTC04,
  runTC05,
  runTC06,
  runTC07,
  runTC08,
  runTC09,
  runTC10,
  runTC11,
  runTC12,
  type TestCaseResult,
} from '../core/testHarness.ts';

export const TestHarnessPanel: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  // Automatically execute test harness on mount
  useEffect(() => {
    executeAll();
  }, []);

  const executeAll = () => {
    setIsRunning(true);
    setTimeout(() => {
      const allResults = runAllTestCases();
      setResults(allResults);
      setIsRunning(false);
    }, 50);
  };

  const executeSingle = (id: string) => {
    let res: TestCaseResult | null = null;
    switch (id) {
      case 'TC-01': res = runTC01(); break;
      case 'TC-02': res = runTC02(); break;
      case 'TC-03': res = runTC03(); break;
      case 'TC-04': res = runTC04(); break;
      case 'TC-05': res = runTC05(); break;
      case 'TC-06': res = runTC06(); break;
      case 'TC-07': res = runTC07(); break;
      case 'TC-08': res = runTC08(); break;
      case 'TC-09': res = runTC09(); break;
      case 'TC-10': res = runTC10(); break;
      case 'TC-11': res = runTC11(); break;
      case 'TC-12': res = runTC12(); break;
    }

    if (res) {
      setResults((prev) => prev.map((item) => (item.id === id ? res! : item)));
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-neutral-100">
            Hệ thống Kiểm thử Tự động (Deterministic Test Harness TC-01..12)
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 rounded font-mono font-bold text-[11px] border ${
              allPassed
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-red-950 text-red-300 border-red-800'
            }`}
          >
            {passedCount}/{totalCount} PASS
          </span>

          <button
            onClick={executeAll}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold transition-colors disabled:opacity-50 text-xs shadow-sm"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>{isRunning ? 'Đang chạy...' : 'Chạy lại tất cả'}</span>
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-neutral-400">
        Bộ ca kiểm thử toán học thực thi trực tiếp trên pure Game Core, kiểm định AABB nửa kín, Safe Grid Snapping, phá gạch 8x8 px, và xử lý Căn cứ. TC-10 chạy bằng fixture cô lập hoàn toàn.
      </p>

      {/* Test List */}
      <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
        {results.map((tc) => {
          const isSelected = selectedTc === tc.id;
          return (
            <div
              key={tc.id}
              onClick={() => setSelectedTc(isSelected ? null : tc.id)}
              className={`p-2.5 rounded border transition-all cursor-pointer ${
                tc.passed
                  ? 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
                  : 'bg-red-950/30 border-red-800 hover:border-red-700'
              } ${isSelected ? 'ring-1 ring-amber-500/50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {tc.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-mono font-bold text-neutral-300 shrink-0">
                    {tc.id}
                  </span>
                  <span className="font-medium text-neutral-200 truncate">
                    {tc.name}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                      tc.passed
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : 'bg-red-950 text-red-400 border border-red-800/60'
                    }`}
                  >
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      executeSingle(tc.id);
                    }}
                    className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    title="Chạy lại ca này"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Details and math view */}
              <div className="mt-2 text-[11px] text-neutral-400 space-y-1 border-t border-neutral-800/80 pt-1.5">
                <p className="text-neutral-300">{tc.details}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 font-mono text-[10px] bg-black/50 p-1.5 rounded">
                  <div>
                    <span className="text-neutral-500">Kỳ vọng: </span>
                    <span className="text-emerald-400">{tc.expected}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Thực tế: </span>
                    <span className={tc.passed ? 'text-neutral-300' : 'text-red-400'}>
                      {tc.actual}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
