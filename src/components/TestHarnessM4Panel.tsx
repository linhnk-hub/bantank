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
  Cpu,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { runAllM4Tests, type TestCaseM4Result } from '../core/testHarnessM4.ts';

export const TestHarnessM4Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseM4Result[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => {
    executeAll();
  }, []);

  const executeAll = () => {
    setIsRunning(true);
    setTimeout(() => {
      const allResults = runAllM4Tests();
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
          <div className="w-6 h-6 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="font-bold text-neutral-100 flex items-center gap-2">
              Test Harness M4: Match Lifecycle & Controls
              {allPassed && (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                  12/12 PASS
                </span>
              )}
            </h2>
            <p className="text-[11px] text-neutral-400">
              Kiểm thử tự động State Machine, Pause Freeze, Time Clamping, Score, High Score & Touch Input
            </p>
          </div>
        </div>

        <button
          onClick={executeAll}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors shadow disabled:opacity-50"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Đang chạy...' : 'Chạy lại 12 Test'}</span>
        </button>
      </div>

      {/* Summary Scorecard */}
      <div className="px-4 py-2.5 bg-neutral-950/60 border-b border-neutral-800 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">Tổng ca kiểm thử:</span>
            <span className="font-mono font-bold text-white">{results.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-400">Đạt (PASS):</span>
            <span className="font-mono font-bold text-emerald-400">{passCount}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-red-400">Thất bại (FAIL):</span>
            <span className="font-mono font-bold text-red-400">{results.length - passCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allPassed ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              100% Tiêu chuẩn M4 đạt yêu cầu
            </span>
          ) : (
            <span className="text-amber-400 font-medium">
              Đang hoàn thiện các ca kiểm thử...
            </span>
          )}
        </div>
      </div>

      {/* Test Cases List */}
      <div className="divide-y divide-neutral-800/80 max-h-[540px] overflow-y-auto">
        {results.map((tc) => {
          const isSelected = selectedTc === tc.id;
          return (
            <div
              key={tc.id}
              className={`transition-colors ${isSelected ? 'bg-neutral-800/40' : 'hover:bg-neutral-800/20'}`}
            >
              <div
                onClick={() => setSelectedTc(isSelected ? null : tc.id)}
                className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  {tc.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">{tc.id}</span>
                      <span className="font-semibold text-neutral-200">{tc.name}</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 line-clamp-1">{tc.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      tc.passed
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/10 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>
                  {isSelected ? (
                    <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
                  )}
                </div>
              </div>

              {/* Collapsible Details */}
              {isSelected && (
                <div className="px-4 pb-3 pt-1 border-t border-neutral-800/50 bg-neutral-950/40 text-[11px] space-y-2">
                  <div>
                    <span className="text-neutral-400 font-medium">Chi tiết kiểm thử:</span>
                    <p className="text-neutral-300 font-mono mt-0.5">{tc.details}</p>
                  </div>

                  {tc.metrics && Object.keys(tc.metrics).length > 0 && (
                    <div>
                      <span className="text-neutral-400 font-medium">Chỉ số thực tế (Metrics):</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                        {Object.entries(tc.metrics).map(([key, val]) => (
                          <div
                            key={key}
                            className="bg-neutral-900 border border-neutral-800 rounded p-1.5 font-mono"
                          >
                            <div className="text-[10px] text-neutral-500 truncate">{key}</div>
                            <div className="font-bold text-neutral-200 truncate">{String(val)}</div>
                          </div>
                        ))}
                      </div>
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
