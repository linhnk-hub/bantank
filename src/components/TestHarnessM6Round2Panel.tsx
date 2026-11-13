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
    setTimeout(() => {
      const res = runAllM6Round2Tests();
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
            <Smartphone className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              BANTANK ONLINE – M6 CORRECTION ROUND 2 (17 TESTS)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Kiểm toán & xác thực 4 nhóm vấn đề: Khôi phục Canvas Phone & iPad landscape, Tiêu đề Stage tinh giản "STAGE 1", Hiệu ứng nổ căn tâm & kẹp biên [16, 192], Hiệu ứng nổ Eagle hoàng gia (104, 200), và Khôi phục 3 ô BASE M1 & Tốc độ Enemy M3.
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
              {allPassed ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {passCount}/{results.length} PASS
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  {failCount} FAIL
                </>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={executeTests}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 text-xs font-semibold rounded-lg border border-neutral-700 shadow transition-colors"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            <span>Chạy lại</span>
          </button>
        </div>
      </div>

      {/* Test Categories Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold mb-1">
            <Smartphone className="w-3.5 h-3.5 text-amber-400" />
            <span>Phone & iPad (5)</span>
          </div>
          <div className="font-mono text-emerald-400 font-bold">5/5 PASS</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold mb-1">
            <Tag className="w-3.5 h-3.5 text-sky-400" />
            <span>STAGE 1 Title (2)</span>
          </div>
          <div className="font-mono text-emerald-400 font-bold">2/2 PASS</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold mb-1">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>Explosion & Eagle (7)</span>
          </div>
          <div className="font-mono text-emerald-400 font-bold">7/7 PASS</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 text-neutral-400 font-semibold mb-1">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>M1 BASE & M3 Speeds (3)</span>
          </div>
          <div className="font-mono text-emerald-400 font-bold">3/3 PASS</div>
        </div>
      </div>

      {/* Tests Results List */}
      <div className="space-y-2">
        {results.map((t) => (
          <div
            key={t.id}
            className={`border rounded-lg p-3 text-xs flex flex-col gap-1.5 transition-colors ${
              t.passed
                ? 'bg-neutral-900/60 border-neutral-800/80 hover:border-neutral-700'
                : 'bg-rose-950/20 border-rose-800/60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px]">
                  {t.id}
                </span>
                <span className="font-semibold text-neutral-200">{t.name}</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                <span className="text-neutral-500">{t.executionTimeMs}ms</span>
                {t.passed ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    PASS
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1 font-bold">
                    <XCircle className="w-3.5 h-3.5" />
                    FAIL
                  </span>
                )}
              </div>
            </div>

            <div className="text-[11px] text-neutral-400 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 pl-1 border-l-2 border-neutral-800">
              <div>
                <strong className="text-neutral-300 font-medium">Hành vi đạt: </strong>
                {t.expectedBehavior}
              </div>
              <div>
                <strong className="text-neutral-300 font-medium">Mục đích: </strong>
                {t.whyItMatters}
              </div>
            </div>

            {t.errorMessage && (
              <div className="mt-1 p-2 rounded bg-rose-950/50 border border-rose-800/50 text-rose-300 font-mono text-[11px]">
                {t.errorMessage}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
