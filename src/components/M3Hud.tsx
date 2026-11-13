/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { GameCoreState } from '../core/types.ts';
import { MATCH_TIMER_CONFIG, formatCountdownMMSS, getMatchDurationSecondsForDifficulty } from '../core/constants.ts';
import { RotateCcw, AlertTriangle, Trophy, Heart, Shield, Crosshair, Cpu, Skull, User, Clock, Eye, UserMinus } from 'lucide-react';
import { CoopOnlineManager, type CoopPlayerRole } from '../core/coopOnlineManager.ts';

interface M3HudProps {
  state: GameCoreState | null;
  onReset: () => void;
  onSpawnEnemy: () => void;
  onPause?: () => void;
  isSuperAdmin?: boolean;
  localOnlineRole?: CoopPlayerRole;
}

export const M3Hud: React.FC<M3HudProps> = ({ state, onReset, onSpawnEnemy, onPause, isSuperAdmin = false, localOnlineRole }) => {
  if (!state) return null;

  const p1 = state.p1; const p1State = state.p1State; const enemies = state.enemies;
  const isBaseDestroyed = state.terrain.isBaseDestroyed;
  const isCoop = state.gameMode === 'TWO_PLAYERS_AI' || state.gameMode === 'TWO_PLAYERS_ONLINE';
  const effectiveOnlineRole = localOnlineRole !== undefined ? localOnlineRole : state.gameMode === 'TWO_PLAYERS_ONLINE' ? CoopOnlineManager.getInstance().getRole() : null;

  const isLocalP1Spectator = Boolean(p1State.isSpectator || (p1State.isDead && p1State.lives <= 0));
  const isLocalP2Spectator = Boolean(state.p2State && (state.p2State.isSpectator || (state.p2State.isDead && state.p2State.lives <= 0)));
  const isLocalSpectator = !state.isGameOver && !state.isStageClear && isCoop && (state.gameMode === 'TWO_PLAYERS_ONLINE' && effectiveOnlineRole === 'GUEST' ? isLocalP2Spectator : isLocalP1Spectator);

  const peerLeaveNotice = state.peerLeaveNotice || (state.gameMode === 'TWO_PLAYERS_ONLINE' ? CoopOnlineManager.getInstance().getLastPeerLeaveNotice() : null);

  const remainingSeconds = typeof state.remainingSeconds === 'number' ? state.remainingSeconds : getMatchDurationSecondsForDifficulty(state.difficulty);
  const isCriticalTime = remainingSeconds <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;

  return (
    <div className="bg-black border-2 border-neo-cyan pixel-corners p-4 text-xs flex flex-col gap-4 shadow-[0_0_15px_rgba(0,240,255,0.3)] font-display">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-neo-cyan pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-neo-amber/20 border-2 border-neo-amber text-neo-amber font-pixel text-2xl pixel-corners">
            <span>STAGE {state.currentStageId ?? 1}</span>
          </div>
          <div className={`flex items-center gap-2 px-4 py-1 border-2 font-pixel text-2xl pixel-corners transition-colors ${isCriticalTime ? 'bg-neo-rose/20 border-neo-rose text-neo-rose animate-pulse' : 'bg-black border-neo-cyan text-neo-cyan'}`}>
            <Clock className="w-5 h-5" /><span>{formatCountdownMMSS(remainingSeconds)}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-black border-2 border-neo-amber text-neo-amber font-pixel text-2xl pixel-corners">
            <Trophy className="w-5 h-5" /><span>{state.score} XP</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-black border-2 border-neo-rose text-neo-rose font-pixel text-2xl pixel-corners">
            <Heart className="w-5 h-5 fill-neo-rose" /><span>P1×{p1State.lives}</span>
          </div>
          {isCoop && state.p2State && (
            <div className="flex items-center gap-2 px-3 py-1 bg-black border-2 border-neo-cyan text-neo-cyan font-pixel text-2xl pixel-corners">
              <Heart className="w-5 h-5 fill-neo-cyan" /><span>P2×{state.p2State.lives}</span>
            </div>
          )}
        </div>
      </div>

      {isLocalSpectator && (
        <div className="p-3 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-between text-neo-cyan font-pixel text-xl pixel-corners shadow-[0_0_10px_rgba(0,240,255,0.5)]">
          <div className="flex items-center gap-2"><Eye className="w-5 h-5" /><span>SPECTATOR MODE ACTIVE</span></div>
        </div>
      )}

      {peerLeaveNotice && !state.isGameOver && (
        <div className="p-3 bg-neo-amber/20 border-2 border-neo-amber flex items-center gap-2 text-neo-amber font-pixel text-xl pixel-corners">
          <UserMinus className="w-5 h-5" /><span>{peerLeaveNotice}</span>
        </div>
      )}

      {state.isStageClear && (
        <div className="p-4 bg-green-900/40 border-2 border-green-500 flex items-center justify-between text-green-400 font-pixel text-3xl pixel-corners shadow-[0_0_15px_rgba(34,197,94,0.5)]">
          <div className="flex items-center gap-3"><Trophy className="w-8 h-8" /><span>MISSION ACCOMPLISHED!</span></div>
        </div>
      )}

      {state.isGameOver && (
        <div className="p-4 bg-neo-rose/20 border-2 border-neo-rose flex items-center gap-3 text-neo-rose font-pixel text-3xl pixel-corners shadow-[0_0_15px_rgba(255,0,85,0.5)] animate-pulse">
          <AlertTriangle className="w-8 h-8 shrink-0" />
          <div className="flex flex-col"><span>GAME OVER</span><span className="text-xl text-neo-rose">{state.gameOverReason ?? 'MISSION FAILED'}</span></div>
        </div>
      )}
    </div>
  );
};
