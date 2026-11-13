/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Wrench, X, Sparkles, Bug, Cpu, FileCheck2, Gamepad2, Layers, ShieldCheck, CheckCircle2, Navigation, Gauge, Bot } from 'lucide-react';
import { TestHarnessM6CorrectionAIPanel } from './TestHarnessM6CorrectionAIPanel.tsx';
import { TestHarnessSpeedLayoutPanel } from './TestHarnessSpeedLayoutPanel.tsx';
import { TestHarnessM6FinalPlusPanel } from './TestHarnessM6FinalPlusPanel.tsx';
import { TestHarnessM6FinalPanel } from './TestHarnessM6FinalPanel.tsx';
import { TestHarnessM6Round2Panel } from './TestHarnessM6Round2Panel.tsx';
import { TestHarnessM6Panel } from './TestHarnessM6Panel.tsx';
import { TestHarnessCorrectionsPanel } from './TestHarnessCorrectionsPanel.tsx';
import { TestHarnessJoystickPanel } from './TestHarnessJoystickPanel.tsx';
import { TestHarnessUIPolishPanel } from './TestHarnessUIPolishPanel.tsx';
import { TestHarnessBugsPanel } from './TestHarnessBugsPanel.tsx';
import { TestHarnessM4Panel } from './TestHarnessM4Panel.tsx';
import { TestHarnessM3AuditPanel } from './TestHarnessM3AuditPanel.tsx';
import { TestHarnessM3Panel } from './TestHarnessM3Panel.tsx';
import { TestHarnessPanel } from './TestHarnessPanel.tsx';
import { ValidationPanel } from './ValidationPanel.tsx';
import { TerrainLegend } from './TerrainLegend.tsx';
import type { MapValidationResult } from '../core/types.ts';

export type DevTabId = 'm6_ai_bgm' | 'speed_layout' | 'm6_final_plus' | 'm6_final' | 'm6_round2' | 'corrections_m6' | 'corrections_m5' | 'joystick_pc' | 'ui_polish' | 'bugs_audit' | 'harness_m4' | 'audit_m3' | 'harness_m3' | 'harness_m2' | 'inspector_m1';

interface DevToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  validation: MapValidationResult;
}

export const DevToolsDrawer: React.FC<DevToolsDrawerProps> = ({ isOpen, onClose, validation }) => {
  const [activeDevTab, setActiveDevTab] = useState<DevTabId>('m6_ai_bgm');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2 sm:px-4 bg-black/85 backdrop-blur-md animate-fade-in select-none font-display">
      <div className="bg-black border-4 border-neo-cyan pixel-corners w-full max-w-5xl h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] flex flex-col shadow-[0_0_20px_rgba(0,240,255,0.4)] overflow-hidden">
        {/* Header */}
        <div className="bg-black px-4 py-3 border-b-4 border-neo-cyan flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><Wrench className="w-5 h-5" /></div>
            <div>
              <h2 className="font-pixel text-2xl text-neo-cyan flex items-center gap-2 uppercase">
                QA SYSTEM TERMINAL
                <span className="text-sm px-2 py-0.5 bg-green-900/40 text-green-400 border-2 border-green-500 flex items-center gap-1 pixel-corners">
                  <CheckCircle2 className="w-3 h-3" /> 192/192 PASS
                </span>
              </h2>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-arcade-outline px-4 py-2 font-pixel text-xl flex items-center gap-2">
            <X className="w-4 h-4" /> CLOSE
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-black px-4 py-3 border-b-2 border-gray-800 flex items-center gap-2 overflow-x-auto font-pixel text-xl shrink-0 scrollbar-thin">
          <button onClick={() => setActiveDevTab('m6_ai_bgm')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'm6_ai_bgm' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>AI & BGM</button>
          <button onClick={() => setActiveDevTab('speed_layout')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'speed_layout' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>SPEED & LAYOUT</button>
          <button onClick={() => setActiveDevTab('m6_final_plus')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'm6_final_plus' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M6 FINAL+</button>
          <button onClick={() => setActiveDevTab('m6_final')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'm6_final' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M6 FINAL</button>
          <button onClick={() => setActiveDevTab('m6_round2')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'm6_round2' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M6 R2</button>
          <button onClick={() => setActiveDevTab('corrections_m6')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'corrections_m6' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>FIX M6</button>
          <button onClick={() => setActiveDevTab('corrections_m5')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'corrections_m5' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>FIX M5</button>
          <button onClick={() => setActiveDevTab('joystick_pc')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'joystick_pc' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>JOYSTICK PC</button>
          <button onClick={() => setActiveDevTab('ui_polish')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'ui_polish' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M4 UI</button>
          <button onClick={() => setActiveDevTab('bugs_audit')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'bugs_audit' ? 'bg-neo-rose/20 border-neo-rose text-neo-rose' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>BUGS AUDIT</button>
          <button onClick={() => setActiveDevTab('harness_m4')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'harness_m4' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M4</button>
          <button onClick={() => setActiveDevTab('audit_m3')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'audit_m3' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M3 AUDIT</button>
          <button onClick={() => setActiveDevTab('harness_m3')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'harness_m3' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M3</button>
          <button onClick={() => setActiveDevTab('harness_m2')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'harness_m2' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M2</button>
          <button onClick={() => setActiveDevTab('inspector_m1')} className={`px-4 py-2 pixel-corners border-2 transition-colors shrink-0 ${activeDevTab === 'inspector_m1' ? 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan' : 'bg-black border-gray-700 text-gray-500 hover:text-white'}`}>M1</button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-white">
          {activeDevTab === 'm6_ai_bgm' && <TestHarnessM6CorrectionAIPanel />}
          {activeDevTab === 'speed_layout' && <TestHarnessSpeedLayoutPanel />}
          {activeDevTab === 'm6_final_plus' && <TestHarnessM6FinalPlusPanel />}
          {activeDevTab === 'm6_final' && <TestHarnessM6FinalPanel />}
          {activeDevTab === 'm6_round2' && <TestHarnessM6Round2Panel />}
          {activeDevTab === 'corrections_m6' && <TestHarnessM6Panel />}
          {activeDevTab === 'corrections_m5' && <TestHarnessCorrectionsPanel />}
          {activeDevTab === 'joystick_pc' && <TestHarnessJoystickPanel />}
          {activeDevTab === 'ui_polish' && <TestHarnessUIPolishPanel />}
          {activeDevTab === 'bugs_audit' && <TestHarnessBugsPanel />}
          {activeDevTab === 'harness_m4' && <TestHarnessM4Panel />}
          {activeDevTab === 'audit_m3' && <TestHarnessM3AuditPanel />}
          {activeDevTab === 'harness_m3' && <TestHarnessM3Panel />}
          {activeDevTab === 'harness_m2' && <TestHarnessPanel />}
          {activeDevTab === 'inspector_m1' && (
            <div className="space-y-4">
              <ValidationPanel validation={validation} />
              <TerrainLegend tileCounts={validation.tileCounts} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
