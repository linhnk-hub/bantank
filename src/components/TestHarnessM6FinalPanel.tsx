/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM6FinalTests, type FinalTestCaseResult } from '../core/testHarnessM6Final.ts';
import { CheckCircle2, XCircle, RotateCcw, Smartphone, Flame, Shield, Check } from 'lucide-react';

export const TestHarnessM6FinalPanel: React.FC = () => {
  const [results, setResults] = useState<FinalTestCaseResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => {
      const res = runAllM6FinalTests();
      setResults(res.results);
      setRunning(false);
    }, 10);
  };

  useEffect(() => {
    executeTests();
  }, []);

  const { passCount, failCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    return {
      passCount: passed,
      failCount: failed,
      allPassed: results.length > 0 && failed === 0,
    };
  }, [results]);

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              BẮN TANK ONLINE – UI, RESPAWN & CONTINUOUS FIRE (24 TESTS)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Kiểm toán 5 nhóm: Nâng cao controls Portrait tránh Safari, Viền Canvas Landscape mỏng & tối đa hóa diện tích, Hồi sinh P1/Enemy tránh điểm spawn nghẽn 2s, Đổi tên hiển thị "Bắn Tank Online", và Nhấn giữ bắn liên tục.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span
              className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1 ${
                allPassed
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {allPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {passCount}/{results.length} PASS
            </span>
          </div>

          <button
            onClick={executeTests}
            disabled={running}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-all active:scale-95 disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            <span>Chạy lại</span>
          </button>
        </div>
      </div>

      {/* Test List */}
      <div className="space-y-2">
        {results.map((r) => (
          <div
            key={r.id}
            className={`p-3 rounded-lg border text-xs transition-all ${
              r.passed
                ? 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700'
                : 'bg-rose-950/20 border-rose-900/50 text-rose-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded ${
                      r.passed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {r.id}
                  </span>
                  <span className="font-semibold text-neutral-200">{r.name}</span>
                </div>

                {r.details && (
                  <p className="text-[11px] text-neutral-400 pl-1">{r.details}</p>
                )}

                {r.expected && (
                  <p className="text-[11px] text-emerald-400/90 pl-1 font-mono flex items-center gap-1">
                    <Check className="w-3 h-3 inline text-emerald-500" />
                    {r.expected}
                  </p>
                )}

                {!r.passed && r.actual && (
                  <p className="text-[11px] text-rose-400 pl-1 font-mono font-bold">
                    {r.actual}
                  </p>
                )}
              </div>

              <div className="shrink-0 pt-0.5">
                {r.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
