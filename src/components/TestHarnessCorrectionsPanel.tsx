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
    setTimeout(() => {
      const res = runAllM5CorrectionTests();
      setResults(res);
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
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              BANTANK ONLINE – UI POLISH & GAMEPLAY CORRECTIONS (15 TESTS)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Kiểm thử 5 nhóm vấn đề: Căn giữa Joystick/Nút bắn, Fullscreen API, Sửa nút Về Menu, Thiết kế 1 Eagle duy nhất, Hiệu ứng Khiên nhấp nháy 3s.
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
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>15/15 PASS</span>
                </>
              ) : (
                <span>{passCount}/15 PASS ({failCount} FAIL)</span>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={executeTests}
            disabled={running}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 active:scale-95 transition-all shadow"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            <span>Chạy lại</span>
          </button>
        </div>
      </div>

      {/* 5 Issue Group Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2 text-center">
          <div className="text-amber-400 font-bold flex items-center justify-center gap-1">
            <Crosshair className="w-3 h-3" />
            <span>Căn Giữa Control</span>
          </div>
          <div className="text-neutral-400 text-[10px] mt-0.5">TC01 - TC04 (4 tests)</div>
        </div>

        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2 text-center">
          <div className="text-sky-400 font-bold flex items-center justify-center gap-1">
            <Maximize className="w-3 h-3" />
            <span>Fullscreen API</span>
          </div>
          <div className="text-neutral-400 text-[10px] mt-0.5">TC05 - TC08 (4 tests)</div>
        </div>

        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2 text-center">
          <div className="text-emerald-400 font-bold flex items-center justify-center gap-1">
            <RotateCcw className="w-3 h-3" />
            <span>Sửa Nút Về Menu</span>
          </div>
          <div className="text-neutral-400 text-[10px] mt-0.5">TC09 - TC11 (3 tests)</div>
        </div>

        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2 text-center">
          <div className="text-yellow-400 font-bold flex items-center justify-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <span>1 Eagle Duy Nhất</span>
          </div>
          <div className="text-neutral-400 text-[10px] mt-0.5">TC12 - TC14 (3 tests)</div>
        </div>

        <div className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2 text-center col-span-2 sm:col-span-1">
          <div className="text-purple-400 font-bold flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Shield Nhấp Nháy</span>
          </div>
          <div className="text-neutral-400 text-[10px] mt-0.5">TC15 (1 test)</div>
        </div>
      </div>

      {/* Test Items List */}
      <div className="space-y-2">
        {results.map((res) => (
          <div
            key={res.id}
            className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs transition-colors ${
              res.passed
                ? 'bg-neutral-900/60 border-neutral-800 hover:border-emerald-500/40'
                : 'bg-rose-950/20 border-rose-900/50'
            }`}
          >
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-neutral-400 text-[11px] px-1.5 py-0.5 rounded bg-neutral-800">
                  {res.id}
                </span>
                <span className="font-semibold text-white">{res.name}</span>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  res.passed ? 'text-neutral-400' : 'text-rose-400 font-mono'
                }`}
              >
                {res.message}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-neutral-500">
                {res.durationMs}ms
              </span>
              {res.passed ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
