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
} from 'lucide-react';
import {
  runAllM3TestCases,
  runM301,
  runM302,
  runM303,
  runM304,
  runM305,
  runM306,
  runM307,
  runM308,
  runM309,
  runM310,
  runM311,
  runM312,
  runM313,
  runM314,
  type TestCaseResult,
} from '../core/testHarnessM3.ts';

export const TestHarnessM3Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [selectedTc, setSelectedTc] = useState<string | null>(null);

  useEffect(() => {
    executeAll();
  }, []);

  const executeAll = () => {
    setIsRunning(true);
    setTimeout(() => {
      const allResults = runAllM3TestCases();
      setResults(allResults);
      setIsRunning(false);
    }, 50);
  };

  const executeSingle = (id: string) => {
    let res: TestCaseResult | null = null;
    switch (id) {
      case 'M3-01': res = runM301(); break;
      case 'M3-02': res = runM302(); break;
      case 'M3-03': res = runM303(); break;
      case 'M3-04': res = runM304(); break;
      case 'M3-05': res = runM305(); break;
      case 'M3-06': res = runM306(); break;
      case 'M3-07': res = runM307(); break;
      case 'M3-08': res = runM308(); break;
      case 'M3-09': res = runM309(); break;
      case 'M3-10': res = runM310(); break;
      case 'M3-11': res = runM311(); break;
      case 'M3-12': res = runM312(); break;
      case 'M3-13': res = runM313(); break;
      case 'M3-14': res = runM314(); break;
    }

    if (res) {
      setResults((prev) => prev.map((item) => (item.id === id ? res! : item)));
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = totalCount > 0 && passedCount === totalCount;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs flex flex-col gap-3 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <div>
            <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
              <span>Hệ thống Kiểm thử M3 (Enemy AI & Combat: M3-01..14)</span>
            </h2>
            <p className="text-[11px] text-neutral-400">
              Kiểm tra tính tất định của AI Enemy, LoS 80px, A* Pathfinding, va chạm đạn & mạng P1
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded font-mono font-bold text-xs border ${
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

      {/* Tests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[560px] overflow-y-auto pr-1">
        {results.map((tc) => {
          const isSelected = selectedTc === tc.id;
          return (
            <div
              key={tc.id}
              className={`p-2.5 rounded border transition-all ${
                tc.passed
                  ? 'bg-neutral-950/80 border-neutral-800 hover:border-neutral-700'
                  : 'bg-red-950/20 border-red-800/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                  onClick={() => setSelectedTc(isSelected ? null : tc.id)}
                >
                  {tc.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span className="font-mono font-bold text-neutral-200 shrink-0">{tc.id}</span>
                  <span className="text-neutral-300 truncate font-medium">{tc.name}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                      tc.passed ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'
                    }`}
                  >
                    {tc.passed ? 'PASS' : 'FAIL'}
                  </span>

                  <button
                    onClick={() => executeSingle(tc.id)}
                    title="Chạy riêng ca này"
                    className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>

                  <button
                    onClick={() => setSelectedTc(isSelected ? null : tc.id)}
                    className="p-1 rounded text-neutral-500 hover:text-neutral-300"
                  >
                    {isSelected ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Collapsible Details */}
              {isSelected && (
                <div className="mt-2.5 pt-2 border-t border-neutral-800/80 space-y-1 font-mono text-[11px]">
                  <div className="text-neutral-400 italic font-sans">{tc.details}</div>
                  <div>
                    <span className="text-neutral-500">Dự kiến: </span>
                    <span className="text-emerald-400">{tc.expected}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Thực tế: </span>
                    <span className="text-amber-300">{tc.actual}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
