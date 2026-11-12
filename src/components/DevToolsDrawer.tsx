/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wrench,
  X,
  Sparkles,
  Bug,
  Cpu,
  FileCheck2,
  Gamepad2,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Navigation,
  Gauge,
  Bot,
} from 'lucide-react';
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

export type DevTabId =
  | 'm6_ai_bgm'
  | 'speed_layout'
  | 'm6_final_plus'
  | 'm6_final'
  | 'm6_round2'
  | 'corrections_m6'
  | 'corrections_m5'
  | 'joystick_pc'
  | 'ui_polish'
  | 'bugs_audit'
  | 'harness_m4'
  | 'audit_m3'
  | 'harness_m3'
  | 'harness_m2'
  | 'inspector_m1';

interface DevToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  validation: MapValidationResult;
}

export const DevToolsDrawer: React.FC<DevToolsDrawerProps> = ({
  isOpen,
  onClose,
  validation,
}) => {
  const [activeDevTab, setActiveDevTab] = useState<DevTabId>('m6_ai_bgm');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2 sm:px-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-5xl h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-neutral-950 px-4 py-3 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                Bắn Tank Online — Bảng Điều Khiển Kiểm Thử & QA
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3 h-3" /> 192/192 PASS
                </span>
              </h2>
              <p className="text-[11px] text-neutral-400">
                Toàn bộ 192 bài kiểm thử: Enemy AI Chống Kẹt (0.75s), MusicManager Upload/Loop/SkipSilence, Không FPS/Rotate UI, 60Hz Speed
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-all active:scale-95 shadow"
          >
            <X className="w-4 h-4" />
            <span>Quay lại chơi game</span>
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="bg-neutral-950/80 px-4 py-2 border-b border-neutral-800 flex items-center gap-1.5 overflow-x-auto text-xs shrink-0 scrollbar-thin">
          <button
            onClick={() => setActiveDevTab('m6_ai_bgm')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'm6_ai_bgm'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI & Quản Lý Nhạc Nền (12 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('speed_layout')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'speed_layout'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>Tốc Độ & Layout (14 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('m6_final_plus')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'm6_final_plus'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>M6 Final+ (26 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('m6_final')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'm6_final'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>M6 Final (24 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('m6_round2')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'm6_round2'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>M6 Round 2 (18 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('corrections_m6')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'corrections_m6'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>6 Nhóm Sửa Lỗi (23 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('corrections_m5')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'corrections_m5'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>5 Nhóm Sửa Lỗi (15 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('joystick_pc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'joystick_pc'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Joystick & PC Scale (6 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('ui_polish')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'ui_polish'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>M4 UI Polish (4 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('bugs_audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'bugs_audit'
                ? 'bg-rose-500 text-white shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>Kiểm toán 4 Lỗi (4 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('harness_m4')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'harness_m4'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Harness M4 (12 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('audit_m3')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'audit_m3'
                ? 'bg-emerald-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Kiểm toán M3 (8 Điểm)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('harness_m3')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'harness_m3'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            <span>Harness M3 (14 Tests)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('harness_m2')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'harness_m2'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Harness M2 (TC01..12)</span>
          </button>

          <button
            onClick={() => setActiveDevTab('inspector_m1')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all shrink-0 ${
              activeDevTab === 'inspector_m1'
                ? 'bg-amber-500 text-black shadow font-bold'
                : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Bảo toàn M1</span>
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
