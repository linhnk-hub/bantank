/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { GameCoreState } from '../core/types.ts';
import {
  MATCH_TIMER_CONFIG,
  formatCountdownMMSS,
  getMatchDurationSecondsForDifficulty,
} from '../core/constants.ts';
import {
  RotateCcw,
  AlertTriangle,
  Trophy,
  Heart,
  Shield,
  Crosshair,
  Cpu,
  Skull,
  User,
  Clock,
  Eye,
  UserMinus,
} from 'lucide-react';
import { CoopOnlineManager, type CoopPlayerRole } from '../core/coopOnlineManager.ts';

interface M3HudProps {
  state: GameCoreState | null;
  onReset?: () => void;
  onSpawnEnemy: () => void;
  onPause?: () => void;
  isSuperAdmin?: boolean;
  localOnlineRole?: CoopPlayerRole;
}

export const M3Hud: React.FC<M3HudProps> = ({
  state,
  onReset,
  onSpawnEnemy,
  onPause,
  isSuperAdmin = false,
  localOnlineRole,
}) => {
  if (!state) {
    return null;
  }

  const p1 = state.p1;
  const p1State = state.p1State;
  const enemies = state.enemies;
  const isBaseDestroyed = state.terrain.isBaseDestroyed;
  const isCoop = state.gameMode === 'TWO_PLAYERS_AI' || state.gameMode === 'TWO_PLAYERS_ONLINE';
  const effectiveOnlineRole =
    localOnlineRole !== undefined
      ? localOnlineRole
      : state.gameMode === 'TWO_PLAYERS_ONLINE'
      ? CoopOnlineManager.getInstance().getRole()
      : null;

  const isLocalP1Spectator = Boolean(
    p1State.isSpectator || (p1State.isDead && p1State.lives <= 0)
  );
  const isLocalP2Spectator = Boolean(
    state.p2State &&
      (state.p2State.isSpectator || (state.p2State.isDead && state.p2State.lives <= 0))
  );
  const isLocalSpectator =
    !state.isGameOver &&
    !state.isStageClear &&
    isCoop &&
    (state.gameMode === 'TWO_PLAYERS_ONLINE' && effectiveOnlineRole === 'GUEST'
      ? isLocalP2Spectator
      : isLocalP1Spectator);

  const peerLeaveNotice =
    state.peerLeaveNotice ||
    (state.gameMode === 'TWO_PLAYERS_ONLINE'
      ? CoopOnlineManager.getInstance().getLastPeerLeaveNotice()
      : null);

  const remainingSeconds =
    typeof state.remainingSeconds === 'number'
      ? state.remainingSeconds
      : getMatchDurationSecondsForDifficulty(state.difficulty);
  const isCriticalTime = remainingSeconds <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
  const isWarningTime =
    !isCriticalTime && remainingSeconds <= MATCH_TIMER_CONFIG.WARNING_THRESHOLD_S;
  const timerBadgeClass = isCriticalTime
    ? 'bg-red-950/90 border-red-500 text-red-300 animate-pulse shadow-sm shadow-red-500/30'
    : isWarningTime
    ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
    : 'bg-neutral-950 border-neutral-800 text-emerald-300';

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-xs flex flex-col gap-3 shadow-xl">
      {/* Top Header: Stage, Countdown Timer, Score, High Score & Lives */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold">
            <span>STAGE {state.currentStageId ?? 1}</span>
          </div>

          <div
            data-testid="hud-countdown-timer"
            className={`flex items-center gap-1.5 px-3 py-1 rounded border font-mono transition-colors ${timerBadgeClass}`}
            title={
              state.difficulty === 'EXTREME'
                ? 'Đồng hồ đếm ngược chế độ Thử thách (60s)'
                : 'Đồng hồ đếm ngược chế độ Giải trí (120s)'
            }
          >
            <Clock
              className={`w-4 h-4 ${
                isCriticalTime
                  ? 'text-red-400'
                  : isWarningTime
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            />
            <span className="text-[11px] opacity-80">THỜI GIAN:</span>
            <span className="font-black text-sm tracking-wider">
              {formatCountdownMMSS(remainingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-950 border border-neutral-800">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-neutral-400 font-mono">XP:</span>
            <span className="text-amber-400 font-black font-mono text-sm">{state.score} XP</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-950 border border-neutral-800 text-[11px]">
            <span className="text-neutral-500 font-mono">HIGH XP:</span>
            <span className="text-neutral-300 font-bold font-mono">{state.highScore} XP</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-950 border border-neutral-800">
            <Heart className="w-4 h-4 text-red-500 fill-red-500" />
            <span className="text-neutral-400 font-mono">MẠNG P1:</span>
            <span className="text-red-400 font-black font-mono text-sm">{p1State.lives}</span>
          </div>

          {p1State.shieldTimer > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950/80 border border-sky-700 text-sky-300 font-mono text-[11px] animate-pulse">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>KHIÊN P1: {p1State.shieldTimer.toFixed(1)}s</span>
            </div>
          )}

          {isCoop && state.p2State && (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-950/60 border border-emerald-800/80">
                <Heart className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <span className="text-emerald-200 font-mono">
                  {state.gameMode === 'TWO_PLAYERS_ONLINE' ? 'MẠNG P2 (ONLINE):' : 'MẠNG P2 (AI):'}
                </span>
                <span className="text-emerald-400 font-black font-mono text-sm">{state.p2State.lives}</span>
              </div>

              {state.p2State.shieldTimer > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-teal-950/80 border border-teal-700 text-teal-300 font-mono text-[11px] animate-pulse">
                  <Shield className="w-3.5 h-3.5 text-teal-400" />
                  <span>KHIÊN P2: {state.p2State.shieldTimer.toFixed(1)}s</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onPause && (
            <button
              onClick={onPause}
              className="flex items-center gap-1 px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] transition-colors shadow"
            >
              <span>Tạm Dừng (P)</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={onSpawnEnemy}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 text-[11px] font-semibold transition-colors"
            >
              <Cpu className="w-3 h-3" />
              <span>Thả Địch</span>
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Spectator Mode Banner (M7.3.9 Cases B & C) */}
      {isLocalSpectator && (
        <div
          data-testid="hud-spectator-banner"
          className="p-2.5 rounded-lg bg-sky-950/90 border border-sky-500/50 flex items-center justify-between text-sky-200 font-semibold shadow-md"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-xs font-bold">
              Bạn đã hết mạng, đang ở chế độ khán giả
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-sky-900/80 border border-sky-700 text-sky-200 font-mono">
            SPECTATOR
          </span>
        </div>
      )}

      {/* Peer Active Leave Notice (M7.3.9 Case E) */}
      {peerLeaveNotice && !state.isGameOver && (
        <div
          data-testid="hud-peer-leave-banner"
          className="p-2.5 rounded-lg bg-amber-950/85 border border-amber-500/50 flex items-center gap-2 text-amber-200 font-semibold shadow-md"
        >
          <UserMinus className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-xs font-bold">{peerLeaveNotice}</span>
        </div>
      )}

      {/* Stage Clear Banner */}
      {state.isStageClear && (
        <div className="p-3 rounded-lg bg-emerald-950/90 border border-emerald-600 flex items-center justify-between text-emerald-200 font-bold shadow-lg">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-400" />
            <span className="text-sm">CHIẾN THẮNG! Sân đấu đã được bảo vệ thành công!</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-800 text-white font-mono">STAGE CLEAR</span>
        </div>
      )}

      {/* Game Over Banner */}
      {state.isGameOver && (
        <div className="p-3 rounded-lg bg-red-950/90 border border-red-700 flex items-center gap-2 text-red-200 font-bold shadow-lg animate-pulse">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm">GAME OVER</span>
            <span className="text-xs text-red-300 font-normal">{state.gameOverReason ?? 'Thất bại!'}</span>
          </div>
        </div>
      )}

      {/* Super Admin Internal Telemetry & Enemy Progress */}
      {isSuperAdmin && (
        <>
          <div className="bg-neutral-950 p-2.5 rounded border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5 text-neutral-400" />
                <span>Tiến độ tiêu diệt địch (Admin)</span>
              </span>
              <span className="font-mono text-neutral-400">
                <strong className="text-amber-400">{state.totalDefeatedEnemies}</strong> / 30 xe đã hạ
              </span>
            </div>

            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
                style={{ width: `${(state.totalDefeatedEnemies / 30) * 100}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-1 pt-1">
              {Array.from({ length: 30 }).map((_, idx) => {
                const isDefeated = idx < state.totalDefeatedEnemies;
                const isActive = !isDefeated && idx < state.totalDefeatedEnemies + enemies.length;
                return (
                  <span
                    key={idx}
                    title={`Địch #${idx + 1}`}
                    className={`w-2.5 h-2.5 rounded-sm transition-all ${
                      isDefeated
                        ? 'bg-neutral-800 opacity-30'
                        : isActive
                        ? 'bg-red-500 animate-pulse'
                        : 'bg-amber-500'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* P1 State Card */}
            <div
              className={`bg-neutral-950 p-3 rounded space-y-1.5 font-mono text-[11px] ${
                isSuperAdmin
                  ? 'border-2 border-red-500 ring-1 ring-red-500/40 shadow-sm shadow-red-500/20'
                  : 'border border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>NGƯỜI CHƠI P1</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    p1State.isDead
                      ? 'bg-red-950 text-red-400'
                      : p1State.shieldTimer > 0
                      ? 'bg-sky-950 text-sky-400'
                      : 'bg-emerald-950 text-emerald-400'
                  }`}
                >
                  {p1State.isDead
                    ? `HỒI SINH (${p1State.respawnTimer.toFixed(1)}s)`
                    : p1State.shieldTimer > 0
                    ? 'BẢO VỆ'
                    : 'HOẠT ĐỘNG'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-neutral-500">Tọa độ:</span>
                <span className="text-neutral-200">x={p1.x}, y={p1.y}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Hướng nòng:</span>
                <span className="text-sky-400 font-semibold">{p1.direction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Đạn P1:</span>
                <span className={state.bullet ? 'text-amber-400' : 'text-neutral-500'}>
                  {state.bullet ? `Bay tại (${state.bullet.x.toFixed(0)}, ${state.bullet.y.toFixed(0)})` : 'Sẵn sàng'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Căn cứ:</span>
                <span className={isBaseDestroyed ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                  {isBaseDestroyed ? 'BỊ PHÁ HỦY' : 'AN TOÀN'}
                </span>
              </div>
            </div>

            {/* Active Enemies List */}
            <div className="bg-neutral-950 p-3 rounded border border-neutral-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                <span className="font-bold text-red-400 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>ĐỊCH TRÊN SÂN ({enemies.length}/5)</span>
                </span>
                <span className="text-neutral-500 text-[10px]">Tối đa 5</span>
              </div>

              {enemies.length === 0 ? (
                <div className="text-neutral-600 italic py-2 text-center text-[10px]">
                  Chưa có xe địch nào trên sân đấu...
                </div>
              ) : (
                <div className="space-y-1">
                  {enemies.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between bg-neutral-900/60 px-2 py-1 rounded text-[10px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-bold ${
                            e.enemyType === 'BASIC'
                              ? 'text-neutral-300'
                              : e.enemyType === 'FAST'
                              ? 'text-cyan-400'
                              : e.enemyType === 'POWER'
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {e.enemyType === 'BASIC'
                            ? 'Basic Tank'
                            : e.enemyType === 'FAST'
                            ? 'Fast Tank'
                            : e.enemyType === 'POWER'
                            ? 'Power Tank'
                            : 'Armor Tank'}
                        </span>
                        <span className="text-neutral-500">HP:{e.hp}/{e.maxHp}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-amber-500 font-semibold">{e.aiState}</span>
                        <span className="text-neutral-400">({Math.round(e.x)},{Math.round(e.y)})</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Hotkeys reminder */}
      <div className="text-[10px] text-neutral-500 border-t border-neutral-800 pt-2 flex flex-wrap justify-between gap-1">
        <span>Điều khiển: W/A/S/D hoặc Mũi tên để di chuyển | Space / J để bắn đạn</span>
        <span className="font-mono text-neutral-400">60 FPS</span>
      </div>
    </div>
  );
};
