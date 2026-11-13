/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { getSessionBadgeInfo } from './AuthSessionBanner.tsx';
import { CoopOnlineLobbyPanel, type CoopLobbySubView } from './CoopOnlineLobbyModal.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import type { CoopRoomDocument } from '../core/coopOnlineManager.ts';
import {
  ArrowLeft,
  ArrowRight,
  Settings,
  Wrench,
  UserCheck,
  User,
  Bot,
  Globe,
  CheckCircle2,
  Flame,
  Shield,
} from 'lucide-react';

export type GameModeType = 'SOLO' | 'TWO_PLAYERS';
export type TwoPlayerOption = 'P2_AI' | 'P2_REAL';
export type SelectionCardMode = 'SOLO' | 'COOP_AI' | 'COOP_ONLINE';
export type SelectionFlowStep = 'SELECT_MODE' | 'SELECT_DIFFICULTY' | 'COOP_ONLINE_LOBBY';

export interface ModeSelectionScreenProps {
  user: { uid?: string; email: string | null; emailVerified?: boolean; displayName?: string | null; photoURL?: string | null; role?: string | null; };
  firebaseUser?: FirebaseUser | null;
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onBack: () => void;
  onStartMatch: (mode: GameModeType, twoPlayerOption?: TwoPlayerOption) => void;
  onStartOnlineMatch?: (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => void;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools: () => void;
  selectedMode?: GameModeType;
  onSelectedModeChange?: (mode: GameModeType) => void;
  twoPlayerOption?: TwoPlayerOption;
  onTwoPlayerOptionChange?: (opt: TwoPlayerOption) => void;
  isSuperAdmin?: boolean;
}

const RetroTankIconP1: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg viewBox="0 0 32 32" fill="currentColor" className={className} style={{ shapeRendering: 'crispEdges' }}>
    <rect x="4" y="6" width="4" height="20" fill="#B45309" /><rect x="4" y="7" width="2" height="3" fill="#FBBF24" /><rect x="4" y="12" width="2" height="3" fill="#FBBF24" /><rect x="4" y="17" width="2" height="3" fill="#FBBF24" /><rect x="4" y="22" width="2" height="3" fill="#FBBF24" /><rect x="24" y="6" width="4" height="20" fill="#B45309" /><rect x="26" y="7" width="2" height="3" fill="#FBBF24" /><rect x="26" y="12" width="2" height="3" fill="#FBBF24" /><rect x="26" y="17" width="2" height="3" fill="#FBBF24" /><rect x="26" y="22" width="2" height="3" fill="#FBBF24" /><rect x="8" y="8" width="16" height="16" fill="#F59E0B" /><rect x="10" y="10" width="12" height="12" fill="#FBBF24" /><rect x="14" y="2" width="4" height="9" fill="#F59E0B" /><rect x="15" y="2" width="2" height="8" fill="#FDE68A" /><rect x="12" y="12" width="8" height="8" fill="#D97706" /><rect x="14" y="14" width="4" height="4" fill="#FEF3C7" />
  </svg>
);

const RetroTankIconP2: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg viewBox="0 0 32 32" fill="currentColor" className={className} style={{ shapeRendering: 'crispEdges' }}>
    <rect x="4" y="6" width="4" height="20" fill="#047857" /><rect x="4" y="7" width="2" height="3" fill="#34D399" /><rect x="4" y="12" width="2" height="3" fill="#34D399" /><rect x="4" y="17" width="2" height="3" fill="#34D399" /><rect x="4" y="22" width="2" height="3" fill="#34D399" /><rect x="24" y="6" width="4" height="20" fill="#047857" /><rect x="26" y="7" width="2" height="3" fill="#34D399" /><rect x="26" y="12" width="2" height="3" fill="#34D399" /><rect x="26" y="17" width="2" height="3" fill="#34D399" /><rect x="26" y="22" width="2" height="3" fill="#34D399" /><rect x="8" y="8" width="16" height="16" fill="#10B981" /><rect x="10" y="10" width="12" height="12" fill="#34D399" /><rect x="14" y="2" width="4" height="9" fill="#059669" /><rect x="15" y="2" width="2" height="8" fill="#A7F3D0" /><rect x="12" y="12" width="8" height="8" fill="#047857" /><rect x="14" y="14" width="4" height="4" fill="#D1FAE5" />
  </svg>
);

export const ModeSelectionScreen: React.FC<ModeSelectionScreenProps> = ({
  user, firebaseUser, session, isProcessing, onBack, onStartMatch, onStartOnlineMatch, difficulty, onDifficultyChange, onOpenSettings, onOpenDevTools, selectedMode: controlledMode, onSelectedModeChange, twoPlayerOption: controlledTwoPlayerOption, onTwoPlayerOptionChange, isSuperAdmin = false,
}) => {
  const deriveInitialCardMode = (): SelectionCardMode => {
    if (controlledMode === 'TWO_PLAYERS') return controlledTwoPlayerOption === 'P2_REAL' ? 'COOP_ONLINE' : 'COOP_AI';
    return 'SOLO';
  };

  const [cardMode, setCardMode] = useState<SelectionCardMode>(deriveInitialCardMode);
  const [flowStep, setFlowStep] = useState<SelectionFlowStep>('SELECT_MODE');
  const avatarManager = AvatarManager.getInstance();
  const effectiveUid = user.uid || firebaseUser?.uid || '';
  const [avatarError, setAvatarError] = useState(false);
  const [, setAvatarTick] = useState(0);

  useEffect(() => {
    avatarManager.observeCatalog();
    if (effectiveUid) avatarManager.observeUserMetadata(effectiveUid);
    const unsub = avatarManager.subscribe(() => { setAvatarTick((t) => t + 1); setAvatarError(false); });
    return unsub;
  }, [avatarManager, effectiveUid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({ uid: effectiveUid, photoURL: user?.photoURL });
  useEffect(() => { setAvatarError(false); }, [resolvedAvatarUrl]);

  const handleSelectCardMode = (next: SelectionCardMode) => {
    setCardMode(next);
    if (next === 'SOLO') onSelectedModeChange?.('SOLO');
    else if (next === 'COOP_AI') { onSelectedModeChange?.('TWO_PLAYERS'); onTwoPlayerOptionChange?.('P2_AI'); }
    else { onSelectedModeChange?.('TWO_PLAYERS'); onTwoPlayerOptionChange?.('P2_REAL'); }
  };

  const isSessionActive = session.status === 'ACTIVE';
  const displayLabel = getUserDisplayLabel(user);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);
  const badgeInfo = getSessionBadgeInfo(session.status, isProcessing, session.isHeartbeatInFlight ?? false, Boolean(user));

  const handleConfirmCardMode = (next: SelectionCardMode, e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleSelectCardMode(next);
    if (next === 'COOP_ONLINE') setFlowStep('COOP_ONLINE_LOBBY');
    else setFlowStep('SELECT_DIFFICULTY');
  };

  const handleConfirmDifficulty = (nextDiff: 'DEFAULT' | 'EXTREME', e?: React.MouseEvent) => {
    e?.stopPropagation();
    onDifficultyChange(nextDiff);
    if (!isSessionActive || isProcessing) return;
    if (cardMode === 'SOLO') onStartMatch('SOLO', 'P2_AI');
    else if (cardMode === 'COOP_AI') onStartMatch('TWO_PLAYERS', 'P2_AI');
    else if (cardMode === 'COOP_ONLINE') setFlowStep('COOP_ONLINE_LOBBY');
  };

  const [onlineLobbySubView, setOnlineLobbySubView] = useState<CoopLobbySubView>('MAIN');

  const handleTopBack = () => {
    if (flowStep === 'COOP_ONLINE_LOBBY') {
      if (onlineLobbySubView !== 'MAIN') setOnlineLobbySubView('MAIN');
      else setFlowStep('SELECT_MODE');
    } else if (flowStep === 'SELECT_DIFFICULTY') setFlowStep('SELECT_MODE');
    else onBack();
  };

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neo-bg text-neutral-100 select-none overflow-x-hidden overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))] font-display">
      <div className="tactical-grid-bg absolute inset-0 pointer-events-none" />
      <div className="crt-overlay absolute inset-0 pointer-events-none z-0" />

      <header className="sticky top-0 z-40 w-full border-b-2 border-neo-amber bg-black/95 backdrop-blur-md px-4 py-3 shrink-0 shadow-[0_0_15px_rgba(255,184,0,0.3)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between min-w-0">
          <button type="button" onClick={handleTopBack} className="btn-arcade-outline px-3 py-1 flex items-center gap-2" title="Quay lại">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">BACK</span>
          </button>

          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-2 px-3 py-1 border-2 border-neo-amber pixel-corners bg-black text-xs min-w-0 ${roleFrameClasses}`}>
              {resolvedAvatarUrl && !avatarError ? (
                <img src={resolvedAvatarUrl} alt={displayLabel} className="w-5 h-5 rounded-sm object-cover border border-neo-amber shrink-0" onError={() => setAvatarError(true)} />
              ) : (
                <UserCheck className="w-4 h-4 text-neo-cyan shrink-0" />
              )}
              <span className="font-pixel text-lg text-neo-amber truncate max-w-[125px] sm:max-w-[180px]">{displayLabel}</span>
            </div>
            <QuickAudioToggleButton />
            <button type="button" onClick={onOpenSettings} className="btn-arcade-outline px-2 py-1" title="Cài đặt">
              <Settings className="w-4 h-4" />
            </button>
            {isSuperAdmin && (
              <button type="button" onClick={onOpenDevTools} className="btn-arcade-outline !border-neo-cyan !text-neo-cyan px-2 py-1" title="QA">
                <Wrench className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 pt-6 pb-8 max-w-5xl mx-auto w-full">
        <div className="w-full max-w-4xl flex flex-col items-center text-center">
          
          {flowStep === 'SELECT_MODE' && (
            <>
              <div className="mb-8 flex flex-col items-center">
                <h1 className="text-4xl sm:text-6xl font-pixel text-white uppercase glitch-text">SELECT MISSION</h1>
              </div>

              <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div onClick={() => handleSelectCardMode('SOLO')} className={`p-6 border-4 pixel-corners text-left flex flex-col justify-between cursor-pointer transition-colors ${cardMode === 'SOLO' ? 'bg-neo-amber/20 border-neo-amber shadow-[0_0_15px_rgba(255,184,0,0.5)]' : 'bg-black border-gray-700 hover:border-gray-500'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-pixel text-xl text-neo-amber">SINGLE PLAYER</span>
                      <div className={`w-4 h-4 border-2 ${cardMode === 'SOLO' ? 'bg-neo-amber border-neo-amber' : 'border-gray-500'}`} />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <RetroTankIconP1 className="w-12 h-12" />
                      <h2 className="text-2xl font-pixel text-white uppercase">1. SOLO</h2>
                    </div>
                    <p className="text-sm text-gray-400">Chiến dịch 1 người chơi. Điều khiển Chiến xa tiêu diệt toàn bộ quân địch và bảo vệ Căn cứ.</p>
                  </div>
                  <div className="mt-6 pt-4 border-t-2 border-gray-800">
                    <button type="button" onClick={(e) => handleConfirmCardMode('SOLO', e)} className="btn-arcade w-full py-3 text-xl flex items-center justify-center gap-2">CONFIRM <ArrowRight className="w-5 h-5"/></button>
                  </div>
                </div>

                <div onClick={() => handleSelectCardMode('COOP_AI')} className={`p-6 border-4 pixel-corners text-left flex flex-col justify-between cursor-pointer transition-colors ${cardMode === 'COOP_AI' ? 'bg-neo-cyan/20 border-neo-cyan shadow-[0_0_15px_rgba(0,240,255,0.5)]' : 'bg-black border-gray-700 hover:border-gray-500'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-pixel text-xl text-neo-cyan">P1 + AI ALLY</span>
                      <div className={`w-4 h-4 border-2 ${cardMode === 'COOP_AI' ? 'bg-neo-cyan border-neo-cyan' : 'border-gray-500'}`} />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex gap-1"><RetroTankIconP1 className="w-8 h-8" /><RetroTankIconP2 className="w-8 h-8" /></div>
                      <h2 className="text-2xl font-pixel text-white uppercase">2. CO-OP AI</h2>
                    </div>
                    <p className="text-sm text-gray-400">Người chơi sát cánh cùng Chiến xa P2 AI thông minh: tìm đường, bọc lót căn cứ và khóa bắn nhầm.</p>
                  </div>
                  <div className="mt-6 pt-4 border-t-2 border-gray-800">
                    <button type="button" onClick={(e) => handleConfirmCardMode('COOP_AI', e)} className="btn-arcade w-full py-3 text-xl !bg-neo-cyan flex items-center justify-center gap-2">CONFIRM <ArrowRight className="w-5 h-5"/></button>
                  </div>
                </div>

                <div onClick={() => handleSelectCardMode('COOP_ONLINE')} className={`p-6 border-4 pixel-corners text-left flex flex-col justify-between cursor-pointer transition-colors ${cardMode === 'COOP_ONLINE' ? 'bg-neo-rose/20 border-neo-rose shadow-[0_0_15px_rgba(255,0,85,0.5)]' : 'bg-black border-gray-700 hover:border-gray-500'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="font-pixel text-xl text-neo-rose">P1 + P2 ONLINE</span>
                      <div className={`w-4 h-4 border-2 ${cardMode === 'COOP_ONLINE' ? 'bg-neo-rose border-neo-rose' : 'border-gray-500'}`} />
                    </div>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex gap-1"><RetroTankIconP1 className="w-8 h-8" /><RetroTankIconP2 className="w-8 h-8" /></div>
                      <h2 className="text-2xl font-pixel text-white uppercase">3. ONLINE</h2>
                    </div>
                    <p className="text-sm text-gray-400">Tạo phòng hoặc Tham gia phòng (Vào nhanh / Mã phòng) để phối hợp trực tuyến qua Internet.</p>
                  </div>
                  <div className="mt-6 pt-4 border-t-2 border-gray-800">
                    <button type="button" onClick={(e) => handleConfirmCardMode('COOP_ONLINE', e)} className="btn-arcade w-full py-3 text-xl !bg-neo-rose !text-white flex items-center justify-center gap-2">CONFIRM <ArrowRight className="w-5 h-5"/></button>
                  </div>
                </div>
              </div>
            </>
          )}

          {flowStep === 'SELECT_DIFFICULTY' && (
            <>
              <div className="mb-8 flex flex-col items-center">
                <div className="font-pixel text-xl text-neo-amber mb-2 border-b-2 border-neo-amber pb-1">
                  SELECTED: {cardMode === 'SOLO' ? 'SOLO' : cardMode === 'COOP_AI' ? 'CO-OP AI' : 'ONLINE'}
                </div>
                <h1 className="text-4xl sm:text-6xl font-pixel text-white uppercase glitch-text">SELECT DIFFICULTY</h1>
              </div>

              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6 text-left">
                <div onClick={() => onDifficultyChange('DEFAULT')} className={`p-6 border-4 pixel-corners cursor-pointer transition-colors ${difficulty === 'DEFAULT' ? 'bg-neo-cyan/20 border-neo-cyan shadow-[0_0_15px_rgba(0,240,255,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-pixel text-3xl text-neo-cyan">NORMAL (GIẢI TRÍ)</span>
                    <div className={`w-4 h-4 border-2 ${difficulty === 'DEFAULT' ? 'bg-neo-cyan border-neo-cyan' : 'border-gray-500'}`} />
                  </div>
                  <p className="text-sm text-gray-400">3 mạng khởi đầu • Nhịp độ cân bằng chuẩn cổ điển.</p>
                  <div className="mt-6 pt-4 border-t-2 border-gray-800">
                    <button type="button" disabled={!isSessionActive || isProcessing} onClick={(e) => handleConfirmDifficulty('DEFAULT', e)} className="btn-arcade w-full py-3 text-xl !bg-neo-cyan flex justify-center gap-2">START <ArrowRight className="w-5 h-5"/></button>
                  </div>
                </div>

                <div onClick={() => onDifficultyChange('EXTREME')} className={`p-6 border-4 pixel-corners cursor-pointer transition-colors ${difficulty === 'EXTREME' ? 'bg-neo-rose/20 border-neo-rose shadow-[0_0_15px_rgba(255,0,85,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-pixel text-3xl text-neo-rose">HARDCORE (THỬ THÁCH)</span>
                    <div className={`w-4 h-4 border-2 ${difficulty === 'EXTREME' ? 'bg-neo-rose border-neo-rose' : 'border-gray-500'}`} />
                  </div>
                  <p className="text-sm text-gray-400">1 mạng duy nhất • Áp lực cao • Không khoan nhượng.</p>
                  <div className="mt-6 pt-4 border-t-2 border-gray-800">
                    <button type="button" disabled={!isSessionActive || isProcessing} onClick={(e) => handleConfirmDifficulty('EXTREME', e)} className="btn-arcade w-full py-3 text-xl !bg-neo-rose !text-white flex justify-center gap-2">START <ArrowRight className="w-5 h-5"/></button>
                  </div>
                </div>
              </div>
            </>
          )}

          {flowStep === 'COOP_ONLINE_LOBBY' && (
            <div className="w-full text-left">
              <div className="mb-8 text-center border-b-4 border-neo-cyan pb-4">
                <h1 className="text-4xl sm:text-6xl font-pixel text-white uppercase glitch-text">CO-OP MULTIPLAYER</h1>
              </div>
              <CoopOnlineLobbyPanel
                user={firebaseUser ?? (user as any)}
                difficulty={difficulty}
                onDifficultyChange={onDifficultyChange}
                subView={onlineLobbySubView}
                onSubViewChange={setOnlineLobbySubView}
                onBackToDifficulty={() => setFlowStep('SELECT_MODE')}
                onOnlineMatchStarted={(room, role) => { if (onStartOnlineMatch) onStartOnlineMatch(room, role); }}
              />
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 w-full border-t-2 border-neutral-800 bg-black/60 px-4 py-4 text-center font-pixel text-xl text-gray-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
          <span>© 2026 BẮN TANK ONLINE</span><span>•</span>
          <a href="/landing.html" className="hover:text-neo-amber transition-colors">INTEL</a><span>•</span>
          <a href="/privacy.html" className="hover:text-neo-amber transition-colors">PRIVACY</a>
        </div>
      </footer>
    </div>
  );
};
