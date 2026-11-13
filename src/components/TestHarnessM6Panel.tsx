/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { runAllM6Tests, type TestCaseM6Result } from '../core/testHarnessM6.ts';
import { CheckCircle2, XCircle, RotateCcw, Monitor, ShieldCheck, Flame, Smartphone, Gauge } from 'lucide-react';

export const TestHarnessM6Panel: React.FC = () => {
  const [results, setResults] = useState<TestCaseM6Result[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => {
      const res = runAllM6Tests();
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
            <Monitor className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              BANTANK ONLINE – GAMEPLAY & RESPONSIVE DISPLAY CORRECTIONS (23 TESTS)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Kiểm thử 6 nhóm vấn đề: Khôi phục Canvas PC (624px, 728px, 832px), Căn cứ 1 Eagle + 2 Tường gạch, Thanh FPS & Ping --, Khiên địch 1s nhấp nháy, Hiệu ứng đạn trúng & vụ nổ 0.7s, Tối ưu diện tích di động (100dvh).
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
                  <span>23/23 PASS</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5" />
                  <span>
                    {passCount}/{results.length} PASS ({failCount} FAIL)
                  </span>
                </>
              )}
            </span>
          </div>

          <button
            type="button"
            onClick={executeTests}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs shadow transition-all active:scale-95"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
            <span>Chạy lại</span>
          </button>
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold mb-1">
            <Monitor className="w-3.5 h-3.5" />
            <span>PC Integer Scale</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            1366×768 (624px, 3x), 1440/1560×900 (728px, 3.5x), 1920×1080 (832px, 4x) sắc nét 1:1.
          </p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-1.5 text-blue-400 font-bold mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>1 Eagle + Gạch bảo vệ</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Eagle tại (12, 6); gạch (12, 5) và (12, 7) bảo vệ cánh, nhận đạn phá sub-tile không Game Over.
          </p>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold mb-1">
            <Gauge className="w-3.5 h-3.5" />
            <span>FPS Thực & Ping --</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            FPS đo đạc 500ms chu kỳ, Ping -- trung thực không số giả, hiệu ứng nổ 0.7s chuẩn M3.
          </p>
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow">
        <div className="overflow-x-auto max-h-[500px] scrollbar-thin">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-950 text-neutral-400 sticky top-0 z-10 border-b border-neutral-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold w-24">Mã Test</th>
                <th className="py-2.5 px-3 font-semibold">Tên Kiểm Thử & Mô Tả Kỳ Vọng</th>
                <th className="py-2.5 px-3 font-semibold w-24 text-center">Kết Quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono text-[11px]">
              {results.map((r) => (
                <tr
                  key={r.id}
                  className={`hover:bg-neutral-800/40 transition-colors ${
                    !r.passed ? 'bg-rose-950/20' : ''
                  }`}
                >
                  <td className="py-2 px-3 font-bold text-amber-400 align-top">{r.id}</td>
                  <td className="py-2 px-3 align-top font-sans">
                    <div className="font-semibold text-white mb-0.5">{r.name}</div>
                    <div className="text-[11px] text-neutral-400 mb-1">{r.details}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">
                      Kỳ vọng: <span className="text-neutral-300">{r.expected}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-center align-middle font-sans">
                    {r.passed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" /> PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                        <XCircle className="w-3 h-3" /> FAIL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
