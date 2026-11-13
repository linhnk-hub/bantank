/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  Bug,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Shield,
  Layers,
} from 'lucide-react';
import { runAllBugTestCases, type BugTestCaseResult } from '../core/testHarnessM4Bugs.ts';

export const TestHarnessBugsPanel: React.FC = () => {
  const [results, setResults] = useState<BugTestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => {
    executeAll();
  }, []);

  const executeAll = () => {
    setIsRunning(true);
    setTimeout(() => {
      const allResults = runAllBugTestCases();
      setResults(allResults);
      setIsRunning(false);
    }, 50);
  };

  const passCount = results.filter((r) => r.passed).length;
  const allPassed = results.length > 0 && passCount === results.length;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow-xl flex flex-col text-xs">
      {/* Header */}
      <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Bug className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="font-bold text-neutral-100 flex items-center gap-2">
              Kiểm Toán 4 Lỗi Thực Tế Sau M4
              {allPassed && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  4/4 SỬA TRIỆT ĐỂ & PASS
                </span>
              )}
            </h2>
            <p className="text-[11px] text-neutral-400">
              Rà soát & kiểm chứng: AI Targeting, Gạch ảo (Subtile Bitmask), Tường bảo vệ Base, Khiên Spawn Địch
            </p>
          </div>
        </div>

        <button
          onClick={executeAll}
          disabled={isRunning}
          className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer text-xs"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Đang chạy...' : 'Chạy lại 4 Test'}
        </button>
      </div>

      {/* Overview Status Bar */}
      <div className="px-4 py-2.5 bg-neutral-950/50 border-b border-neutral-800 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-3">
          <span className="text-neutral-400">
            Tổng số ca kiểm thử:{' '}
            <strong className="text-neutral-200">{results.length}</strong>
          </span>
          <span className="text-emerald-400">
            Đạt: <strong>{passCount}</strong>
          </span>
          {results.length - passCount > 0 && (
            <span className="text-rose-400">
              Lỗi: <strong>{results.length - passCount}</strong>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-neutral-400">
          Tỷ lệ hoàn thành:
          <span className="font-bold text-emerald-400">
            {results.length > 0 ? Math.round((passCount / results.length) * 100) : 0}%
          </span>
        </div>
      </div>

      {/* Test Cases List */}
      <div className="p-4 space-y-2.5 max-h-[500px] overflow-y-auto">
        {results.map((tc) => {
          const isExpanded = selectedTc === tc.id;
          return (
            <div
              key={tc.id}
              className={`rounded border transition-colors ${
                tc.passed
                  ? 'border-neutral-800 bg-neutral-950/40 hover:border-neutral-700'
                  : 'border-rose-900/60 bg-rose-950/20 hover:border-rose-700'
              }`}
            >
              <div
                onClick={() => setSelectedTc(isExpanded ? null : tc.id)}
                className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  {tc.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-mono text-neutral-400 text-[11px] font-bold">
                    {tc.id} (LỖI {tc.bugNumber})
                  </span>
                  <span className="font-medium text-neutral-200">{tc.name}</span>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      tc.passed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                  )}
                </div>
              </div>

              {/* Collapsible Details */}
              {isExpanded && (
                <div className="px-3.5 pb-3 pt-1 border-t border-neutral-800/60 text-[11px] space-y-2">
                  <p className="text-neutral-400">{tc.details}</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[10px]">
                    <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800">
                      <span className="text-neutral-500 block mb-0.5">Kỳ vọng:</span>
                      <span className="text-neutral-300 break-all">{tc.expected}</span>
                    </div>
                    <div className="bg-neutral-900/80 p-2 rounded border border-neutral-800">
                      <span className="text-neutral-500 block mb-0.5">Thực tế:</span>
                      <span
                        className={tc.passed ? 'text-emerald-400 break-all' : 'text-rose-400 break-all'}
                      >
                        {tc.actual}
                      </span>
                    </div>
                  </div>

                  {tc.diagnostics && (
                    <div className="bg-neutral-950 p-2 rounded border border-neutral-800 font-mono text-[10px] text-neutral-400 overflow-x-auto">
                      <span className="text-amber-400 block font-bold mb-1">
                        Chi tiết Log Kiểm Toán AI (diagnostics):
                      </span>
                      <pre>{JSON.stringify(tc.diagnostics, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
