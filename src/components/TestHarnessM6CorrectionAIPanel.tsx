/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bot, CheckCircle2, XCircle, RefreshCw, Music, ShieldAlert, Cpu } from 'lucide-react';
import { runAllM6CorrectionAITests } from '../core/testHarnessM6CorrectionAI.ts';
import { MusicAdminPanel } from './MusicAdminPanel.tsx';

export const TestHarnessM6CorrectionAIPanel: React.FC = () => {
  const [suiteResult, setSuiteResult] = useState(() => runAllM6CorrectionAITests());

  const handleRunAll = () => {
    setSuiteResult(runAllM6CorrectionAITests());
  };

  const sysTests = suiteResult.results.filter(
    (t) => t.id === 'TC-CORR-01' || t.id === 'TC-CORR-02' || t.id === 'TC-CORR-03'
  );
  const aiTests = suiteResult.results.filter(
    (t) =>
      t.id === 'TC-CORR-04' ||
      t.id === 'TC-CORR-05' ||
      t.id === 'TC-CORR-06' ||
      t.id === 'TC-CORR-07' ||
      t.id === 'TC-CORR-08'
  );
  const bgmTests = suiteResult.results.filter(
    (t) =>
      t.id === 'TC-CORR-09' ||
      t.id === 'TC-CORR-10' ||
      t.id === 'TC-CORR-11' ||
      t.id === 'TC-CORR-12'
  );

  return (
    <div className="space-y-5 select-none">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-neutral-900 to-neutral-900 border border-amber-500/30">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-amber-400" />
            <h3 className="font-extrabold text-sm sm:text-base text-white tracking-wide">
              M6 Final Polish: Enemy AI Anti-Stuck, No FPS/Rotate UI & MusicManager Admin
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            12/12 Tests • Stuck Detection (0.75s), Passive Orientation, MusicManager (MP3/OGG/WAV, Skip Silence, Seamless Loop, Crossfade, Scope Priority)
          </p>
        </div>

        <button
          type="button"
          onClick={handleRunAll}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Chạy Lại ({suiteResult.summary.passed}/{suiteResult.summary.total})</span>
        </button>
      </div>

      {/* Interactive Music Admin Panel directly inside QA Drawer as well */}
      <MusicAdminPanel />

      {/* Section 1: Enemy AI Active Movement & Anti-Stuck */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-bold text-amber-400 uppercase tracking-wider">
          <Cpu className="w-3.5 h-3.5" />
          <span>1. Khắc Phục Enemy Đứng Yên & Chống Kẹt AI ({aiTests.filter((t) => t.passed).length}/{aiTests.length} PASS)</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {aiTests.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-amber-400">{t.id}</span>
                  <span className="font-semibold text-neutral-200">{t.name}</span>
                </div>
                <p className="text-[11px] text-neutral-400">{t.details}</p>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                  t.passed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {t.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {t.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Eliminate FPS & Screen Rotate Button */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-bold text-sky-400 uppercase tracking-wider">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>2. Loại Bỏ FPS & Nút Xoay Ngang Màn Hình ({sysTests.filter((t) => t.passed).length}/{sysTests.length} PASS)</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {sysTests.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sky-400">{t.id}</span>
                  <span className="font-semibold text-neutral-200">{t.name}</span>
                </div>
                <p className="text-[11px] text-neutral-400">{t.details}</p>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                  t.passed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {t.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {t.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 3: MusicManager Upload, Skip Silence, Loop, Crossfade & Priority */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs font-bold text-purple-400 uppercase tracking-wider">
          <Music className="w-3.5 h-3.5" />
          <span>3. Kiểm Thử MusicManager: Upload, Skip Silence, Loop & Ưu Tiên ({bgmTests.filter((t) => t.passed).length}/{bgmTests.length} PASS)</span>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {bgmTests.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-lg bg-neutral-950/70 border border-neutral-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-purple-400">{t.id}</span>
                  <span className="font-semibold text-neutral-200">{t.name}</span>
                </div>
                <p className="text-[11px] text-neutral-400">{t.details}</p>
              </div>

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 flex items-center gap-1 ${
                  t.passed
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {t.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {t.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
