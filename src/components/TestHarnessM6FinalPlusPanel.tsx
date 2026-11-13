/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { runAllM6FinalPlusTests, type FinalPlusTestCaseResult } from '../core/testHarnessM6FinalPlus.ts';
import { CheckCircle2, XCircle, RotateCcw, Sparkles, Shield } from 'lucide-react';

export const TestHarnessM6FinalPlusPanel: React.FC = () => {
  const [results, setResults] = useState<FinalPlusTestCaseResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const eagleCanvasRef = useRef<HTMLCanvasElement>(null);
  const ruinedCanvasRef = useRef<HTMLCanvasElement>(null);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => { setResults(runAllM6FinalPlusTests().results); setRunning(false); }, 10);
  };

  useEffect(() => { executeTests(); }, []);

  useEffect(() => {
    if (eagleCanvasRef.current) {
      const ctx = eagleCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#1e1e24'; ctx.fillRect(1, 13, 14, 3); ctx.fillStyle = '#3f3f46'; ctx.fillRect(2, 13, 12, 1); ctx.fillStyle = '#52525b'; ctx.fillRect(3, 14, 10, 1); ctx.fillStyle = '#71717a'; ctx.fillRect(4, 13, 8, 1);
        ctx.fillStyle = '#78350f'; ctx.fillRect(1, 2, 14, 9); ctx.fillStyle = '#ca8a04'; ctx.fillRect(1, 2, 4, 3); ctx.fillRect(0, 4, 4, 4); ctx.fillRect(1, 7, 4, 3); ctx.fillRect(11, 2, 4, 3); ctx.fillRect(12, 4, 4, 4); ctx.fillRect(11, 7, 4, 3); ctx.fillStyle = '#eab308'; ctx.fillRect(2, 3, 3, 2); ctx.fillRect(1, 5, 3, 3); ctx.fillRect(2, 7, 3, 2); ctx.fillRect(11, 3, 3, 2); ctx.fillRect(12, 5, 3, 3); ctx.fillRect(11, 7, 3, 2); ctx.fillStyle = '#fef08a'; ctx.fillRect(1, 2, 2, 1); ctx.fillRect(0, 4, 1, 2); ctx.fillRect(13, 2, 2, 1); ctx.fillRect(15, 4, 1, 2);
        ctx.fillStyle = '#991b1b'; ctx.fillRect(5, 6, 6, 5); ctx.fillStyle = '#dc2626'; ctx.fillRect(6, 7, 4, 3); ctx.fillStyle = '#fef08a'; ctx.fillRect(7, 7, 2, 3); ctx.fillRect(6, 8, 4, 1);
        ctx.fillStyle = '#ea580c'; ctx.fillRect(4, 11, 2, 2); ctx.fillRect(10, 11, 2, 2); ctx.fillStyle = '#ca8a04'; ctx.fillRect(6, 11, 4, 2); ctx.fillStyle = '#fef08a'; ctx.fillRect(7, 12, 2, 1);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(6, 1, 4, 4); ctx.fillRect(5, 3, 6, 2); ctx.fillStyle = '#f97316'; ctx.fillRect(7, 3, 2, 3); ctx.fillStyle = '#ea580c'; ctx.fillRect(7, 4, 2, 1); ctx.fillStyle = '#09090b'; ctx.fillRect(6, 2, 1, 1); ctx.fillRect(9, 2, 1, 1); ctx.fillStyle = '#fef08a'; ctx.fillRect(7, 0, 2, 1); ctx.fillRect(6, 1, 1, 1); ctx.fillRect(9, 1, 1, 1);
      }
    }
    if (ruinedCanvasRef.current) {
      const ctx = ruinedCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#18181b'; ctx.fillRect(1, 12, 14, 4); ctx.fillStyle = '#27272a'; ctx.fillRect(2, 13, 5, 2); ctx.fillRect(9, 12, 5, 3); ctx.fillStyle = '#3f3f46'; ctx.fillRect(3, 9, 4, 3); ctx.fillRect(9, 8, 4, 4); ctx.fillRect(1, 11, 3, 2); ctx.fillStyle = '#78350f'; ctx.fillRect(2, 7, 3, 2); ctx.fillRect(10, 6, 3, 2); ctx.fillStyle = '#b45309'; ctx.fillRect(3, 8, 2, 1); ctx.fillRect(11, 7, 2, 1); ctx.fillStyle = '#450a0a'; ctx.fillRect(6, 9, 4, 3); ctx.fillStyle = '#7f1d1d'; ctx.fillRect(7, 10, 2, 2); ctx.fillStyle = '#dc2626'; ctx.fillRect(4, 11, 1, 1); ctx.fillRect(8, 9, 1, 1); ctx.fillRect(12, 11, 1, 1); ctx.fillStyle = '#f97316'; ctx.fillRect(5, 12, 1, 1); ctx.fillRect(7, 8, 1, 1); ctx.fillRect(11, 10, 1, 1); ctx.fillStyle = '#fef08a'; ctx.fillRect(7, 7, 1, 1); ctx.fillRect(10, 9, 1, 1);
      }
    }
  }, []);

  const { passCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    return { passCount: passed, allPassed: results.length > 0 && passed === results.length };
  }, [results]);

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 shadow-[0_0_20px_rgba(0,240,255,0.3)] flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-6 h-6 text-neo-cyan" />
            <h3 className="font-pixel text-3xl text-neo-cyan uppercase">M6 FINAL+ CORRECTION (26 TESTS)</h3>
          </div>
          <p className="text-sm text-gray-400">Fixed 60 FPS, P1 SFX, XP Balancing, Zero Coin, Royal Eagle 16x16.</p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`px-4 py-2 font-pixel text-2xl border-2 pixel-corners ${allPassed ? 'bg-green-900/40 text-green-400 border-green-500' : 'bg-neo-rose/20 text-neo-rose border-neo-rose'}`}>
            {passCount}/{results.length} PASS
          </span>
          <button onClick={executeTests} disabled={running} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
            <RotateCcw className={`w-5 h-5 ${running ? 'animate-spin' : ''}`} /> RE-RUN
          </button>
        </div>
      </div>

      <div className="bg-black border-2 border-neo-amber pixel-corners p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-neo-amber font-pixel text-2xl uppercase">
            <Shield className="w-5 h-5" /> <span>ROYAL EAGLE ASSET (16x16)</span>
          </div>
          <p className="text-sm text-gray-400 max-w-xl">
            Tài sản mỹ thuật mới với biểu tượng đại bàng trắng, vương miện vàng, cánh lông kim và khiên đỏ.
          </p>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col items-center gap-2">
            <canvas ref={eagleCanvasRef} width={16} height={16} className="w-20 h-20 rounded border-2 border-neo-amber bg-black pixel-corners shadow-[0_0_15px_rgba(255,184,0,0.5)]" />
            <span className="font-pixel text-lg text-neo-amber">INTACT</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <canvas ref={ruinedCanvasRef} width={16} height={16} className="w-20 h-20 rounded border-2 border-neo-rose bg-black pixel-corners shadow-[0_0_15px_rgba(255,0,85,0.5)]" />
            <span className="font-pixel text-lg text-neo-rose">RUINED</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {results.map((r) => (
          <div key={r.id} className={`p-4 border-2 pixel-corners transition-all ${r.passed ? 'bg-black border-gray-700 hover:border-green-500' : 'bg-neo-rose/20 border-neo-rose'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-cyan bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{r.id}</span>
                  <span>{r.name}</span>
                </div>
                {r.details && <p className="text-sm text-gray-400">{r.details}</p>}
                {r.expected && <p className="text-sm text-green-400 font-pixel text-lg">EXP: {r.expected}</p>}
                {!r.passed && r.actual && <p className="text-sm text-neo-rose font-pixel text-lg font-bold">ACT: {r.actual}</p>}
              </div>
              <div className="shrink-0 pt-1">
                {r.passed ? <CheckCircle2 className="w-6 h-6 text-green-400" /> : <XCircle className="w-6 h-6 text-neo-rose" />}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
