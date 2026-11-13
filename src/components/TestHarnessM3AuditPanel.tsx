/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import {
  runAllAuditTestCases,
  runAuditA,
  runAuditB,
  runAuditC,
  runAuditD,
  runAuditE,
  runAuditF,
  runAuditG,
  runAuditH,
  type AuditTestCaseResult,
} from '../core/testHarnessM3Audit.ts';
import { Play, CheckCircle2, XCircle, RefreshCw, FileText, ShieldAlert } from 'lucide-react';

const INDIVIDUAL_RUNNERS: Record<string, () => AuditTestCaseResult> = {
  'AUDIT-A': runAuditA,
  'AUDIT-B': runAuditB,
  'AUDIT-C': runAuditC,
  'AUDIT-D': runAuditD,
  'AUDIT-E': runAuditE,
  'AUDIT-F': runAuditF,
  'AUDIT-G': runAuditG,
  'AUDIT-H': runAuditH,
};

export function TestHarnessM3AuditPanel() {
  const [results, setResults] = useState<AuditTestCaseResult[]>(() => runAllAuditTestCases());
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRunAll = () => {
    setRunningId('ALL');
    setTimeout(() => {
      setResults(runAllAuditTestCases());
      setRunningId(null);
    }, 40);
  };

  const handleRunSingle = (id: string) => {
    const runner = INDIVIDUAL_RUNNERS[id];
    if (!runner) return;

    setRunningId(id);
    setTimeout(() => {
      const res = runner();
      setResults((prev) => prev.map((item) => (item.id === id ? res : item)));
      setRunningId(null);
    }, 40);
  };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  return (
    <div className="flex flex-col gap-5">
      {/* Header & Controls */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-neutral-100">
              Kiểm toán Kỹ thuật M3 (A – H Audit Harness)
            </h2>
            <span
              className={`px-2 py-0.5 text-xs font-mono font-bold rounded ${
                allPassed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
              }`}
            >
              {passedCount}/{totalCount} ĐẠT (PASS)
            </span>
          </div>
          <p className="text-xs text-neutral-400 max-w-2xl">
            Bộ kiểm chứng toàn diện 8 điểm bắt buộc của M3: Khiên bảo vệ P1 & triệt tiêu đạn (A), Chấm điểm mục tiêu 30/40/20/10 (B), Căn góc & nhịp bắn &lt;= 4px (C), Đón đầu tối đa 48px (D), Bộ điều phối phân hướng sườn (E), Tuần tra PRNG LRU (F), Spawn an toàn (G), Hủy đạn khi P1 chết & chờ hồi sinh (H).
          </p>
        </div>

        <button
          onClick={handleRunAll}
          disabled={runningId !== null}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${runningId === 'ALL' ? 'animate-spin' : ''}`} />
          Chạy toàn bộ 8 ca kiểm toán
        </button>
      </div>

      {/* Test Cases Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-950/80 border-b border-neutral-800 text-neutral-400 font-mono">
                <th className="py-3 px-4 w-28">Mã ca / Điểm</th>
                <th className="py-3 px-4 w-52">Tên hạng mục kiểm toán</th>
                <th className="py-3 px-4 w-24 text-center">Kết quả</th>
                <th className="py-3 px-4">Đặc tả kỳ vọng (Expected) & Kết quả thực tế (Actual)</th>
                <th className="py-3 px-4 w-24 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {results.map((tc) => (
                <tr key={tc.id} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="py-3 px-4 font-bold">
                    <span className="text-emerald-400">{tc.id}</span>
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-[10px]">
                      Mục {tc.item}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-sans font-medium text-neutral-200">
                    <div>{tc.name}</div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">{tc.details}</div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {tc.passed ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 rounded font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-950/80 text-red-400 border border-red-800/60 rounded font-bold text-[11px]">
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 space-y-1 font-mono">
                    <div className="text-neutral-400 text-[11px]">
                      <span className="text-neutral-300 font-semibold">Kỳ vọng:</span> {tc.expected}
                    </div>
                    <div className={tc.passed ? 'text-emerald-400/90 text-[11px]' : 'text-red-400 text-[11px]'}>
                      <span className="text-neutral-300 font-semibold">Thực tế:</span> {tc.actual}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleRunSingle(tc.id)}
                      disabled={runningId !== null}
                      title={`Chạy lại ca ${tc.id}`}
                      className="inline-flex items-center justify-center p-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 rounded transition-colors cursor-pointer"
                    >
                      <Play className={`w-3.5 h-3.5 ${runningId === tc.id ? 'animate-pulse text-emerald-400' : ''}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
