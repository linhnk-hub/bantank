/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { runAllAuditTestCases, runAuditA, runAuditB, runAuditC, runAuditD, runAuditE, runAuditF, runAuditG, runAuditH, type AuditTestCaseResult } from '../core/testHarnessM3Audit.ts';
import { Play, CheckCircle2, XCircle, RefreshCw, ShieldAlert } from 'lucide-react';

const INDIVIDUAL_RUNNERS: Record<string, () => AuditTestCaseResult> = {
  'AUDIT-A': runAuditA, 'AUDIT-B': runAuditB, 'AUDIT-C': runAuditC, 'AUDIT-D': runAuditD, 'AUDIT-E': runAuditE, 'AUDIT-F': runAuditF, 'AUDIT-G': runAuditG, 'AUDIT-H': runAuditH,
};

export function TestHarnessM3AuditPanel() {
  const [results, setResults] = useState<AuditTestCaseResult[]>(() => runAllAuditTestCases());
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleRunAll = () => { setRunningId('ALL'); setTimeout(() => { setResults(runAllAuditTestCases()); setRunningId(null); }, 40); };
  const handleRunSingle = (id: string) => { const runner = INDIVIDUAL_RUNNERS[id]; if (!runner) return; setRunningId(id); setTimeout(() => { const res = runner(); setResults((prev) => prev.map((item) => (item.id === id ? res : item))); setRunningId(null); }, 40); };

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const allPassed = passedCount === totalCount;

  return (
    <div className="flex flex-col gap-6 font-display text-white">
      <div className="bg-black border-4 border-neo-amber pixel-corners p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-[0_0_20px_rgba(255,184,0,0.3)]">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber flex items-center justify-center text-neo-amber pixel-corners"><ShieldAlert className="w-6 h-6" /></div>
            <h2 className="font-pixel text-3xl text-neo-amber uppercase">M3 TECH AUDIT (A-H)</h2>
          </div>
          <p className="text-sm text-gray-400 mt-2">8 Mandatory Checks: Shields, Scoring, Alignment, Interception, Flanking, PRNG Patrol, Safe Spawns, Bullet Cancellation.</p>
        </div>

        <div className="flex flex-col items-end gap-4 shrink-0">
          <span className={`px-4 py-2 font-pixel text-2xl border-2 pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
            {passedCount}/{totalCount} PASSED
          </span>
          <button onClick={handleRunAll} disabled={runningId !== null} className="btn-arcade px-6 py-3 flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${runningId === 'ALL' ? 'animate-spin' : ''}`} /> RUN FULL AUDIT
          </button>
        </div>
      </div>

      <div className="bg-black border-2 border-gray-700 pixel-corners overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-900 border-b-2 border-gray-700 font-pixel text-xl text-gray-400">
                <th className="py-4 px-6 w-32">ID / PRJ</th>
                <th className="py-4 px-6 w-64">AUDIT ITEM</th>
                <th className="py-4 px-6 w-32 text-center">STATUS</th>
                <th className="py-4 px-6">SPECS (EXPECTED vs ACTUAL)</th>
                <th className="py-4 px-6 w-24 text-center">EXEC</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-800 font-pixel text-lg">
              {results.map((tc) => (
                <tr key={tc.id} className="hover:bg-gray-900/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="text-neo-cyan font-bold text-2xl">{tc.id}</div>
                    <div className="inline-block mt-1 px-2 py-1 bg-gray-800 text-gray-400 text-sm pixel-corners">SEC {tc.item}</div>
                  </td>
                  <td className="py-4 px-6 font-display font-bold text-white text-sm">
                    <div className="uppercase">{tc.name}</div>
                    <div className="text-xs text-gray-500 mt-1 normal-case">{tc.details}</div>
                  </td>
                  <td className="py-4 px-6 text-center">
                    {tc.passed ? (
                      <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-900/40 text-green-400 border-2 border-green-500 pixel-corners text-xl">
                        <CheckCircle2 className="w-5 h-5" /> PASS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 px-3 py-1 bg-neo-rose/20 text-neo-rose border-2 border-neo-rose pixel-corners text-xl">
                        <XCircle className="w-5 h-5" /> FAIL
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 space-y-2 text-sm">
                    <div className="text-gray-400"><span className="text-gray-500">EXP:</span> {tc.expected}</div>
                    <div className={tc.passed ? 'text-green-400' : 'text-neo-rose'}><span className="text-gray-500">ACT:</span> {tc.actual}</div>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <button onClick={() => handleRunSingle(tc.id)} disabled={runningId !== null} className="p-3 bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 pixel-corners text-white transition-colors">
                      <Play className={`w-5 h-5 ${runningId === tc.id ? 'animate-pulse text-neo-cyan' : ''}`} />
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
