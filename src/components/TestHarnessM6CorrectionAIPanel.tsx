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

  const sysTests = suiteResult.results.filter((t) => t.id === 'TC-CORR-01' || t.id === 'TC-CORR-02' || t.id === 'TC-CORR-03');
  const aiTests = suiteResult.results.filter((t) => t.id === 'TC-CORR-04' || t.id === 'TC-CORR-05' || t.id === 'TC-CORR-06' || t.id === 'TC-CORR-07' || t.id === 'TC-CORR-08');
  const bgmTests = suiteResult.results.filter((t) => t.id === 'TC-CORR-09' || t.id === 'TC-CORR-10' || t.id === 'TC-CORR-11' || t.id === 'TC-CORR-12');

  return (
    <div className="space-y-6 font-display text-white">
      <div className="bg-black border-4 border-neo-cyan pixel-corners p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,240,255,0.3)]">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Bot className="w-6 h-6 text-neo-cyan" />
            <h3 className="font-pixel text-3xl text-neo-cyan uppercase">M6 FINAL POLISH QA</h3>
          </div>
          <p className="text-sm text-gray-400">12 TESTS: Anti-Stuck, No FPS UI, MusicManager Core.</p>
        </div>

        <button onClick={handleRunAll} className="btn-arcade-outline px-6 py-3 flex items-center gap-2">
          <RefreshCw className="w-5 h-5" /> RE-RUN ({suiteResult.summary.passed}/{suiteResult.summary.total})
        </button>
      </div>

      <MusicAdminPanel />

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-pixel text-2xl text-neo-amber uppercase">
          <Cpu className="w-5 h-5" /> 1. ENEMY AI & ANTI-STUCK
        </div>
        <div className="grid grid-cols-1 gap-4">
          {aiTests.map((t) => (
            <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-amber bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                {t.passed ? <span className="text-green-400 flex items-center gap-2 font-pixel text-xl"><CheckCircle2 className="w-5 h-5" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2 font-pixel text-xl"><XCircle className="w-5 h-5" /> FAIL</span>}
              </div>
              <p className="text-sm text-gray-400">{t.details}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-pixel text-2xl text-neo-cyan uppercase">
          <ShieldAlert className="w-5 h-5" /> 2. UI CLEANUP (FPS/ROTATE)
        </div>
        <div className="grid grid-cols-1 gap-4">
          {sysTests.map((t) => (
            <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-neo-cyan bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                {t.passed ? <span className="text-green-400 flex items-center gap-2 font-pixel text-xl"><CheckCircle2 className="w-5 h-5" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2 font-pixel text-xl"><XCircle className="w-5 h-5" /> FAIL</span>}
              </div>
              <p className="text-sm text-gray-400">{t.details}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 font-pixel text-2xl text-purple-400 uppercase">
          <Music className="w-5 h-5" /> 3. MUSIC MANAGER CORE
        </div>
        <div className="grid grid-cols-1 gap-4">
          {bgmTests.map((t) => (
            <div key={t.id} className={`p-4 border-2 pixel-corners transition-all ${t.passed ? 'bg-black border-gray-700' : 'bg-neo-rose/20 border-neo-rose'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 font-pixel text-xl text-white">
                  <span className="text-purple-400 bg-gray-900 px-2 py-1 border border-gray-700 pixel-corners">{t.id}</span>
                  <span>{t.name}</span>
                </div>
                {t.passed ? <span className="text-green-400 flex items-center gap-2 font-pixel text-xl"><CheckCircle2 className="w-5 h-5" /> PASS</span> : <span className="text-neo-rose flex items-center gap-2 font-pixel text-xl"><XCircle className="w-5 h-5" /> FAIL</span>}
              </div>
              <p className="text-sm text-gray-400">{t.details}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
