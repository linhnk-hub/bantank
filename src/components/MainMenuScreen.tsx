/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import { getUserDisplayLabel, resolveUserRole, getRoleNameFrameClasses } from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { getSessionBadgeInfo, formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import { Play, LogOut, Settings, Wrench, RefreshCw, UserCheck, AlertCircle, HelpCircle } from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';

export interface MainMenuScreenProps {
  user: { uid?: string; email: string | null; emailVerified?: boolean; providerIds?: string[]; displayName?: string | null; photoURL?: string | null; };
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onPlay: () => void;
  onSignOut: () => Promise<void>;
  onRetryAcquire: () => Promise<void>;
  difficulty?: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (d: 'DEFAULT' | 'EXTREME') => void;
  onOpenSettings: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools: () => void;
  isSuperAdmin?: boolean;
}

export const MainMenuScreen: React.FC<MainMenuScreenProps> = ({
  user, session, isProcessing, onPlay, onSignOut, onRetryAcquire, onOpenSettings, onOpenSupport, onOpenDevTools, isSuperAdmin = false,
}) => {
  const isSessionActive = session.status === 'ACTIVE';
  const avatarManager = AvatarManager.getInstance();
  const [avatarError, setAvatarError] = useState(false);
  const [, setAvatarTick] = useState(0);

  useEffect(() => {
    avatarManager.observeCatalog();
    if (user.uid) { avatarManager.observeUserMetadata(user.uid); void avatarManager.fetchUserMetadataOnce(user.uid); }
    const unsub = avatarManager.subscribe(() => { setAvatarTick((t) => t + 1); setAvatarError(false); });
    return unsub;
  }, [avatarManager, user.uid]);

  const resolvedAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({ uid: user.uid, photoURL: user.photoURL });
  useEffect(() => { setAvatarError(false); }, [resolvedAvatarUrl]);

  const badgeInfo = getSessionBadgeInfo(session.status, isProcessing, session.isHeartbeatInFlight ?? false, Boolean(user));
  const displayLabel = getUserDisplayLabel(user);
  const userRole = resolveUserRole(user);
  const roleFrameClasses = getRoleNameFrameClasses(userRole);
  const hasRealSessionFailure = !isSessionActive && session.status !== 'ACQUIRING' && Boolean(session.message && session.message.trim().length > 0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter') && isSessionActive && !isProcessing) { e.preventDefault(); onPlay(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSessionActive, isProcessing, onPlay]);

  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neo-bg text-neutral-100 select-none overflow-x-hidden overflow-y-auto pb-[max(0.5rem,env(safe-area-inset-bottom))] font-display">
      <div className="tactical-grid-bg absolute inset-0 pointer-events-none" />
      <div className="crt-overlay absolute inset-0 pointer-events-none z-0" />

      <header className="sticky top-0 z-40 w-full border-b-2 border-neo-amber bg-black/95 backdrop-blur-md px-4 py-3 shrink-0 shadow-[0_0_15px_rgba(255,184,0,0.3)]">
        <div className="max-w-6xl mx-auto flex items-center justify-between min-w-0">
          <div className={`flex items-center gap-2 px-3 py-1 border-2 border-neo-amber pixel-corners bg-black text-xl font-pixel ${roleFrameClasses}`}>
            {resolvedAvatarUrl && !avatarError ? (
              <img src={resolvedAvatarUrl} alt={displayLabel} className="w-6 h-6 object-cover border-2 border-neo-amber pixel-corners shrink-0" onError={() => setAvatarError(true)} />
            ) : (
              <UserCheck className="w-5 h-5 text-neo-cyan shrink-0" />
            )}
            <span className="font-bold text-neo-amber truncate max-w-[200px]">{displayLabel}</span>
            {badgeInfo.label && (
              <span className={`hidden xs:inline-block px-2 py-1 border-2 font-pixel text-sm ${badgeInfo.badgeStyle}`}>{badgeInfo.label}</span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <QuickAudioToggleButton />
            <button type="button" onClick={onOpenSettings} className="btn-arcade-outline px-3 py-1 flex items-center gap-2" title="Cài đặt">
              <Settings className="w-4 h-4" /><span className="hidden sm:inline">SETTINGS</span>
            </button>
            {isSuperAdmin && (
              <button type="button" onClick={onOpenDevTools} className="btn-arcade-outline !border-neo-cyan !text-neo-cyan px-3 py-1 flex items-center gap-2" title="QA">
                <Wrench className="w-4 h-4" /><span className="hidden sm:inline">QA</span>
              </button>
            )}
            <button type="button" onClick={onSignOut} disabled={isProcessing} className="btn-arcade-outline !border-neo-rose !text-neo-rose px-3 py-1 flex items-center gap-2" title="Đăng xuất">
              <LogOut className="w-4 h-4" /><span className="hidden sm:inline">LOGOUT</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-4xl mx-auto w-full">
        <div className="w-full max-w-lg flex flex-col items-center text-center">
          <div className="mb-8"><GameLogo /></div>

          {hasRealSessionFailure && (
            <div className="w-full mb-6 p-4 bg-black border-2 border-neo-rose text-neo-rose font-pixel text-xl pixel-corners flex flex-col gap-3 shadow-[0_0_15px_rgba(255,0,85,0.4)]">
              <div className="flex items-center gap-2 text-2xl"><AlertCircle className="w-6 h-6" /><span>LỖI PHIÊN ĐĂNG NHẬP</span></div>
              <p className="text-sm font-display text-gray-300">{formatAccountStatusMessage(session.message, session.status)}</p>
              <button type="button" onClick={onRetryAcquire} disabled={isProcessing} className="btn-arcade-outline !border-neo-rose !text-neo-rose py-2 px-4 flex items-center justify-center gap-2">
                <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                <span>{isProcessing ? 'RETRYING...' : 'RECONNECT'}</span>
              </button>
            </div>
          )}

          <div className="w-full flex flex-col gap-4">
            <button type="button" onClick={isSessionActive ? onPlay : onRetryAcquire} disabled={isProcessing} className={`w-full py-5 px-8 font-pixel text-3xl uppercase flex items-center justify-center gap-3 ${!isProcessing ? 'btn-arcade' : 'bg-gray-800 text-gray-500 cursor-not-allowed border-2 border-gray-600 pixel-corners'}`}>
              <Play className="w-6 h-6" /> CHỌN CHẾ ĐỘ CHƠI
            </button>

            <div className="w-full grid grid-cols-2 gap-4 mt-2">
              <button type="button" onClick={onOpenSettings} className="btn-arcade-outline py-4 font-pixel text-xl flex items-center justify-center gap-2">
                <Settings className="w-5 h-5" /> SETTINGS
              </button>
              <button type="button" onClick={onOpenSupport} className="btn-arcade-outline !border-neo-cyan !text-neo-cyan py-4 font-pixel text-xl flex items-center justify-center gap-2">
                <HelpCircle className="w-5 h-5" /> MANUAL
              </button>
            </div>
          </div>
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
