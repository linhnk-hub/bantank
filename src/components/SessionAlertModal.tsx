/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SessionManager, type SessionStateSnapshot } from '../core/sessionManager.ts';
import { formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import { ShieldAlert, WifiOff, RefreshCw, LogIn, Clock, Play } from 'lucide-react';

export interface SessionAlertModalProps {
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onReauth: () => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onContinueSession?: () => void;
}

export const SessionAlertModal: React.FC<SessionAlertModalProps> = ({
  session, isProcessing, onReauth, onSignIn, onSignOut, onContinueSession,
}) => {
  const isIdleWarning = session.status === 'ACTIVE' && Boolean(session.isIdleWarningVisible);
  const showModal = isIdleWarning || session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' || session.status === 'DISPLACED' || session.status === 'PAUSED_IDLE' || session.status === 'CONNECTION_LOST_UNVERIFIED';

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 font-display">
      <div className="bg-black border-4 border-neo-rose pixel-corners p-8 max-w-md w-full text-center shadow-[0_0_30px_rgba(255,0,85,0.4)]">
        <ShieldAlert className="w-12 h-12 text-neo-rose mx-auto mb-4" />
        <h3 className="font-pixel text-3xl text-white uppercase mb-2">SYSTEM ALERT</h3>
        <p className="text-gray-400 text-sm mb-6">{isIdleWarning ? `IDLE TIMEOUT IN ${session.idleRemainingSeconds}s` : formatAccountStatusMessage(session.message, session.status)}</p>
        
        <div className="flex flex-col gap-4">
          {isIdleWarning ? (
            <button onClick={() => onContinueSession ? onContinueSession() : SessionManager.getInstance().continueSession()} className="btn-arcade py-4 text-xl flex justify-center gap-2"><Play className="w-5 h-5" /> CONTINUE</button>
          ) : session.status === 'CONNECTION_LOST_UNVERIFIED' ? (
            <button onClick={onReauth} disabled={isProcessing} className="btn-arcade py-4 text-xl !bg-neo-cyan flex justify-center gap-2"><RefreshCw className="w-5 h-5" /> RECONNECT</button>
          ) : (
            <>
              {session.status !== 'ACTIVE' && <button onClick={onSignIn} disabled={isProcessing} className="btn-arcade py-4 text-xl flex justify-center gap-2"><LogIn className="w-5 h-5" /> RE-LOGIN</button>}
              <button onClick={onSignOut} disabled={isProcessing} className="btn-arcade-outline py-3 text-lg !border-gray-500 !text-gray-400">LOGOUT</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
