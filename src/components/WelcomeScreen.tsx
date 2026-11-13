/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, CheckCircle2, Gamepad2 } from 'lucide-react';
import { GameLogo } from './GameLogo.tsx';

export interface WelcomeScreenProps {
  onSignIn: () => Promise<void>;
  onStartTrialMode?: () => void;
  isProcessing: boolean;
  errorMessage: string | null;
  successMessage: string | null;
  onClearFeedback: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onSignIn, onStartTrialMode, isProcessing, errorMessage, successMessage, onClearFeedback,
}) => {
  return (
    <div className="relative h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-start bg-neo-bg text-neutral-100 select-none overflow-x-hidden overflow-y-auto pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.25rem,env(safe-area-inset-bottom))] font-display">
      <div className="tactical-grid-bg absolute inset-0 pointer-events-none" />
      <div className="crt-overlay absolute inset-0 pointer-events-none z-0" />

      <div className="relative z-20 max-w-xl mx-auto w-full px-4 pt-4">
        {successMessage && (
          <div className="mb-4 p-4 bg-black border-2 border-green-500 text-green-400 font-pixel text-xl pixel-corners flex items-center justify-between shadow-[0_0_15px_rgba(34,197,94,0.3)]">
            <div className="flex items-center gap-3"><CheckCircle2 className="w-6 h-6" /><span>{successMessage}</span></div>
            <button onClick={onClearFeedback} className="text-green-500 hover:text-white px-2">✕</button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 p-4 bg-black border-2 border-neo-rose text-neo-rose font-pixel text-xl pixel-corners flex items-center justify-between shadow-[0_0_15px_rgba(255,0,85,0.3)]">
            <div className="flex items-center gap-3"><AlertCircle className="w-6 h-6" /><span>{errorMessage}</span></div>
            <button onClick={onClearFeedback} className="text-neo-rose hover:text-white px-2">✕</button>
          </div>
        )}
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8 max-w-4xl mx-auto w-full">
        <div className="flex flex-col items-center text-center max-w-2xl w-full">
          <div className="mb-8"><GameLogo /></div>
          
          <h1 className="text-4xl sm:text-6xl font-pixel text-white uppercase glitch-text mb-12 border-b-4 border-neo-amber pb-4">
            SYSTEM BOOT...
          </h1>

          <div className="w-full max-w-md flex flex-col items-center gap-4 px-4">
            <button
              type="button" onClick={onSignIn} disabled={isProcessing}
              className="btn-arcade w-full py-5 text-2xl flex items-center justify-center gap-3"
            >
              {isProcessing ? (
                 <span className="animate-pulse">AUTHENTICATING...</span>
              ) : (
                <>
                  <svg className="w-6 h-6 bg-white rounded-full p-1" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l2.85 2.22c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  GOOGLE LOGIN
                </>
              )}
            </button>

            {onStartTrialMode && (
              <button type="button" onClick={onStartTrialMode} disabled={isProcessing} className="btn-arcade-outline w-full py-4 text-xl flex items-center justify-center gap-3">
                <Gamepad2 className="w-5 h-5" /> FREE TRIAL
              </button>
            )}
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
