/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { runAllM6FinalPlusTests, type FinalPlusTestCaseResult } from '../core/testHarnessM6FinalPlus.ts';
import { CheckCircle2, XCircle, RotateCcw, Sparkles, Check, Shield } from 'lucide-react';

export const TestHarnessM6FinalPlusPanel: React.FC = () => {
  const [results, setResults] = useState<FinalPlusTestCaseResult[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const eagleCanvasRef = useRef<HTMLCanvasElement>(null);
  const ruinedCanvasRef = useRef<HTMLCanvasElement>(null);

  const executeTests = () => {
    setRunning(true);
    setTimeout(() => {
      const res = runAllM6FinalPlusTests();
      setResults(res.results);
      setRunning(false);
    }, 10);
  };

  useEffect(() => {
    executeTests();
  }, []);

  // Render live 16x16 Royal Eagle pixel art preview (scaled 4x to 64x64)
  useEffect(() => {
    if (eagleCanvasRef.current) {
      const ctx = eagleCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, 16, 16);

        // Granite Pedestal
        ctx.fillStyle = '#1e1e24';
        ctx.fillRect(1, 13, 14, 3);
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(2, 13, 12, 1);
        ctx.fillStyle = '#52525b';
        ctx.fillRect(3, 14, 10, 1);
        ctx.fillStyle = '#71717a';
        ctx.fillRect(4, 13, 8, 1);

        // Wings
        ctx.fillStyle = '#78350f';
        ctx.fillRect(1, 2, 14, 9);
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(1, 2, 4, 3);
        ctx.fillRect(0, 4, 4, 4);
        ctx.fillRect(1, 7, 4, 3);
        ctx.fillRect(11, 2, 4, 3);
        ctx.fillRect(12, 4, 4, 4);
        ctx.fillRect(11, 7, 4, 3);
        ctx.fillStyle = '#eab308';
        ctx.fillRect(2, 3, 3, 2);
        ctx.fillRect(1, 5, 3, 3);
        ctx.fillRect(2, 7, 3, 2);
        ctx.fillRect(11, 3, 3, 2);
        ctx.fillRect(12, 5, 3, 3);
        ctx.fillRect(11, 7, 3, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(1, 2, 2, 1);
        ctx.fillRect(0, 4, 1, 2);
        ctx.fillRect(13, 2, 2, 1);
        ctx.fillRect(15, 4, 1, 2);

        // Shield
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(5, 6, 6, 5);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(6, 7, 4, 3);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 7, 2, 3);
        ctx.fillRect(6, 8, 4, 1);

        // Talons & Tail
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(4, 11, 2, 2);
        ctx.fillRect(10, 11, 2, 2);
        ctx.fillStyle = '#ca8a04';
        ctx.fillRect(6, 11, 4, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 12, 2, 1);

        // Crown & Head
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(6, 1, 4, 4);
        ctx.fillRect(5, 3, 6, 2);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(7, 3, 2, 3);
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(7, 4, 2, 1);
        ctx.fillStyle = '#09090b';
        ctx.fillRect(6, 2, 1, 1);
        ctx.fillRect(9, 2, 1, 1);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 0, 2, 1);
        ctx.fillRect(6, 1, 1, 1);
        ctx.fillRect(9, 1, 1, 1);
      }
    }

    if (ruinedCanvasRef.current) {
      const ctx = ruinedCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#18181b';
        ctx.fillRect(1, 12, 14, 4);
        ctx.fillStyle = '#27272a';
        ctx.fillRect(2, 13, 5, 2);
        ctx.fillRect(9, 12, 5, 3);
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(3, 9, 4, 3);
        ctx.fillRect(9, 8, 4, 4);
        ctx.fillRect(1, 11, 3, 2);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(2, 7, 3, 2);
        ctx.fillRect(10, 6, 3, 2);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(3, 8, 2, 1);
        ctx.fillRect(11, 7, 2, 1);
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(6, 9, 4, 3);
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(7, 10, 2, 2);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(4, 11, 1, 1);
        ctx.fillRect(8, 9, 1, 1);
        ctx.fillRect(12, 11, 1, 1);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(5, 12, 1, 1);
        ctx.fillRect(7, 8, 1, 1);
        ctx.fillRect(11, 10, 1, 1);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 7, 1, 1);
        ctx.fillRect(10, 9, 1, 1);
      }
    }
  }, []);

  const { passCount, allPassed } = useMemo(() => {
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    return {
      passCount: passed,
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
              M6 FINAL+ CORRECTION – KHÓA 60 FPS, ÂM THANH P1 NỔ, ĐIỂM XP & TÁCH BẠCH XU (26 TESTS)
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Kiểm toán toàn diện: Bỏ tùy chọn FPS (khóa cứng 60 FPS 60Hz physics), Âm thanh P1 nổ độc quyền (P1_EXPLOSION) tuân thủ match lifecycle, Bảng điểm XP mới (1, 2, 3, 5 XP với Armor = 5 XP), Tách bạch hoàn toàn XP và Xu (zero auto-conversion), và Biểu tượng Đại Bàng Hoàng Gia 16×16px tại [12, 6].
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

      {/* Royal Eagle Pixel Art Preview Card */}
      <div className="bg-neutral-900/80 border border-amber-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <Shield className="w-4 h-4" />
            <span>Biểu Tượng Đại Bàng Hoàng Gia Mới (16×16px Logic tại Ô [12, 6])</span>
          </div>
          <p className="text-[11px] text-neutral-300">
            Thiết kế quân sự cổ điển với đầu đại bàng trắng ngà đội vương miện vàng, đôi cánh sải rộng 3 lớp lông ánh kim, khiên phù hiệu đỏ thẫm chính giữa và bệ đá hoa cương kiên cố.
          </p>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-center gap-1">
            <canvas
              ref={eagleCanvasRef}
              width={16}
              height={16}
              style={{ imageRendering: 'pixelated' }}
              className="w-14 h-14 rounded border border-amber-500/50 bg-black shadow-lg"
            />
            <span className="text-[10px] font-mono text-amber-300 font-bold">Nguyên vẹn</span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <canvas
              ref={ruinedCanvasRef}
              width={16}
              height={16}
              style={{ imageRendering: 'pixelated' }}
              className="w-14 h-14 rounded border border-rose-500/50 bg-black shadow-lg"
            />
            <span className="text-[10px] font-mono text-rose-400 font-bold">Đổ nát (Ruined)</span>
          </div>
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

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                  r.passed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {r.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
