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
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { TOTAL_CAMPAIGN_STAGES, getCampaignStageSpec } from '../core/campaignStages.ts';
import { useLanguage } from '../core/i18n.ts';

interface M3HudProps {
  state: GameCoreState | null;
  onReset?: () => void;
  onSpawnEnemy: () => void;
  onPause?: () => void;
  isSuperAdmin?: boolean;
  localOnlineRole?: CoopPlayerRole;
  fps?: number;
  peerPingMs?: number | null;
  showOnlineNetStats?: boolean;
}

export const M3Hud: React.FC<M3HudProps> = ({
  state,
  onReset,
  onSpawnEnemy,
  onPause,
  isSuperAdmin = false,
  localOnlineRole,
  fps = 60,
  peerPingMs = null,
  showOnlineNetStats = true,
}) => {
  const { t } = useLanguage();

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
    ? 'bg-red-950/90 border-[#FF0055] text-red-300 animate-pulse shadow-sm shadow-[#FF0055]/30'
    : isWarningTime
    ? 'bg-amber-950/80 border-[#FFB800]/80 text-[#FFB800]'
    : 'bg-[#050510] border-[#00F0FF]/40 text-[#00F0FF]';

  void TOTAL_CAMPAIGN_STAGES;
  return (
    <div className="bg-[#0b0d1e]/95 border border-[#00F0FF]/30 rounded-lg p-4 text-xs flex flex-col gap-3 shadow-xl">
      {/* Top Header: Stage, Countdown Timer, Score, High Score & Lives */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="font-btn flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800] font-bold">
              <span>
                {t('MÀN', 'STAGE')} {state.currentStageId ?? 1} •{' '}
                {state.currentStageName || getCampaignStageSpec(state.currentStageId ?? 1).shortTitle}
              </span>
            </div>
            {state.gameMode === 'TWO_PLAYERS_AI' && (
              <span
                className={`px-1 text-[11px] font-bold ${
                  state.difficulty === 'EXTREME' ? 'text-[#FF0055]' : 'text-[#00F0FF]'
                }`}
              >
                {t('Độ khó:', 'Difficulty:')}{' '}
                {state.difficulty === 'EXTREME'
                  ? t('Thử thách', 'Challenge')
                  : t('Giải trí', 'Casual')}
              </span>
            )}
          </div>

          <div
            data-testid="hud-countdown-timer"
            className={`font-hud flex items-center gap-1.5 px-3 py-1 rounded border transition-colors ${timerBadgeClass}`}
            title={
              state.difficulty === 'EXTREME'
                ? t('Đồng hồ đếm ngược chế độ Thử thách (60s)', 'Challenge Mode Countdown Timer (60s)')
                : t('Đồng hồ đếm ngược chế độ Giải trí (120s)', 'Casual Mode Countdown Timer (120s)')
            }
          >
            <Clock
              className={`w-4 h-4 ${
                isCriticalTime
                  ? 'text-[#FF0055]'
                  : isWarningTime
                  ? 'text-[#FFB800]'
                  : 'text-[#00F0FF]'
              }`}
            />
            <span className="text-xs opacity-85">{t('THỜI GIAN:', 'TIME:')}</span>
            <span className="font-black text-base tracking-wider">
              {formatCountdownMMSS(remainingSeconds)}
            </span>
          </div>

          <div className="font-hud flex items-center gap-1.5 px-3 py-1 rounded bg-[#050510] border border-[#FFB800]/30">
            <Trophy className="w-4 h-4 text-[#FFB800]" />
            <span className="text-neutral-400">XP:</span>
            <span className="text-[#FFB800] font-black text-base">
              {(state.gameMode === 'TWO_PLAYERS_ONLINE' && effectiveOnlineRole === 'GUEST'
                ? state.p2Stats?.score ?? 0
                : state.p1Stats?.score ?? state.score)}{' '}
              XP
            </span>
          </div>

          <div className="font-hud flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#050510] border border-neutral-800 text-sm">
            <span className="text-neutral-500">HIGH XP:</span>
            <span className="text-neutral-200 font-bold">{state.highScore} XP</span>
          </div>

          {state.gameMode === 'TWO_PLAYERS_AI' ? (
            <div
              data-testid="m3hud-coop-ai-summary"
              className="font-hud flex flex-wrap items-center gap-3 px-3 py-1.5 rounded bg-[#050510] border border-[#00F0FF]/45"
            >
              <span className="inline-flex items-center gap-1">
                <Heart className="w-4 h-4 text-[#FF0055] fill-[#FF0055]" />
                <span className="text-neutral-400">P1:</span>
                <span className="text-[#FF0055] font-black text-base">{p1State.lives}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                <span className="text-emerald-300">AI:</span>
                <span className="text-emerald-400 font-black text-base">{state.p2State?.lives ?? 0}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Skull className="w-4 h-4 text-[#FFB800]" />
                <span className="text-neutral-400">{t('Địch:', 'Enemies:')}</span>
                <span className="text-[#FFB800] font-black text-base">
                  {Math.max(0, 30 - state.totalDefeatedEnemies)}
                </span>
              </span>
            </div>
          ) : (
            <div className="font-hud flex items-center gap-1.5 px-3 py-1 rounded bg-[#050510] border border-[#FF0055]/40">
              <Heart className="w-4 h-4 text-[#FF0055] fill-[#FF0055]" />
              <span className="text-neutral-400">{t('MẠNG P1:', 'P1 LIVES:')}</span>
              <span className="text-[#FF0055] font-black text-base">{p1State.lives}</span>
            </div>
          )}

          {p1State.shieldTimer > 0 && (
            <div className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-sky-950/80 border border-[#00F0FF] text-[#00F0FF] text-sm animate-pulse">
              <Shield className="w-3.5 h-3.5 text-[#00F0FF]" />
              <span>{t('KHIÊN P1:', 'P1 SHIELD:')} {p1State.shieldTimer.toFixed(1)}s</span>
            </div>
          )}

          {isCoop && state.p2State && (
            <>
              {state.gameMode !== 'TWO_PLAYERS_AI' && (
                <div className="font-hud flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-950/60 border border-emerald-500/70">
                  <Heart className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                  <span className="text-emerald-300">
                    {t('MẠNG P2 (ONLINE):', 'P2 LIVES (ONLINE):')}
                  </span>
                  <span className="text-emerald-400 font-black text-base">{state.p2State.lives}</span>
                </div>
              )}

              {state.p2State.shieldTimer > 0 && (
                <div className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/80 border border-[#FFB800] text-[#FFB800] text-sm animate-pulse">
                  <Shield className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span>{t('KHIÊN P2:', 'P2 SHIELD:')} {state.p2State.shieldTimer.toFixed(1)}s</span>
                </div>
              )}
            </>
          )}

          {state.itemSystem && state.itemSystem.eagleShieldSecondsRemaining > 0 && (
            <div
              data-testid="hud-eagle-shield-timer"
              className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-950/85 border border-cyan-400 text-cyan-300 text-xs font-bold animate-pulse"
            >
              <Shield className="w-3.5 h-3.5 text-cyan-300" />
              <span>
                {t('KHIÊN ĐẠI BÀNG:', 'EAGLE SHIELD:')}{' '}
                {state.itemSystem.eagleShieldSecondsRemaining}s
              </span>
            </div>
          )}

          {state.itemSystem && state.itemSystem.p1Effects.firepowerSecondsRemaining > 0 && (
            <div
              data-testid="hud-p1-firepower-timer"
              className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/85 border border-amber-400 text-amber-300 text-xs font-bold"
            >
              <span>
                {t('P1 CÔNG PHÁ x2:', 'P1 FIREPOWER x2:')}{' '}
                {state.itemSystem.p1Effects.firepowerSecondsRemaining}s
              </span>
            </div>
          )}

          {state.itemSystem && state.itemSystem.p1Effects.speedBoostSecondsRemaining > 0 && (
            <div
              data-testid="hud-p1-speed-timer"
              className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/85 border border-emerald-400 text-emerald-300 text-xs font-bold"
            >
              <span>
                {t('P1 TĂNG TỐC x2:', 'P1 SPEED x2:')}{' '}
                {state.itemSystem.p1Effects.speedBoostSecondsRemaining}s
              </span>
            </div>
          )}

          {isCoop && state.itemSystem && state.itemSystem.p2Effects.firepowerSecondsRemaining > 0 && (
            <div
              data-testid="hud-p2-firepower-timer"
              className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-amber-950/85 border border-amber-400 text-amber-300 text-xs font-bold"
            >
              <span>
                {t('P2 CÔNG PHÁ x2:', 'P2 FIREPOWER x2:')}{' '}
                {state.itemSystem.p2Effects.firepowerSecondsRemaining}s
              </span>
            </div>
          )}

          {isCoop && state.itemSystem && state.itemSystem.p2Effects.speedBoostSecondsRemaining > 0 && (
            <div
              data-testid="hud-p2-speed-timer"
              className="font-hud flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950/85 border border-emerald-400 text-emerald-300 text-xs font-bold"
            >
              <span>
                {t('P2 TĂNG TỐC x2:', 'P2 SPEED x2:')}{' '}
                {state.itemSystem.p2Effects.speedBoostSecondsRemaining}s
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onPause && (
            <button
              onClick={onPause}
              className="font-btn flex items-center gap-1 px-3 py-1.5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-bold text-[11px] transition-colors shadow cursor-pointer"
            >
              <span>{t('Tạm Dừng (P)', 'Pause (P)')}</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={onSpawnEnemy}
              className="font-btn flex items-center gap-1 px-2.5 py-1.5 rounded bg-red-950/70 hover:bg-red-900 border border-[#FF0055]/60 text-red-300 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              <Cpu className="w-3 h-3" />
              <span>{t('Thả Địch', 'Spawn Enemy')}</span>
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              className="font-btn flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#050510] hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-[11px] font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t('Đặt lại', 'Reset')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Spectator Mode Banner (M7.3.9 Cases B & C) */}
      {isLocalSpectator && (
        <div
          data-testid="hud-spectator-banner"
          className="p-2.5 rounded bg-sky-950/90 border border-[#00F0FF]/50 flex items-center justify-between text-sky-200 font-semibold shadow-md"
        >
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#00F0FF] shrink-0" />
            <span className="text-xs font-bold">
              {t('Bạn đã hết mạng, đang ở chế độ khán giả', 'Out of lives — Spectator Mode active')}
            </span>
          </div>
          <span className="font-hud text-xs px-2 py-0.5 rounded bg-sky-900/80 border border-sky-700 text-sky-200">
            SPECTATOR
          </span>
        </div>
      )}

      {/* Peer Active Leave Notice (M7.3.9 Case E) */}
      {peerLeaveNotice && !state.isGameOver && (
        <div
          data-testid="hud-peer-leave-banner"
          className="p-2.5 rounded bg-amber-950/85 border border-[#FFB800]/50 flex items-center gap-2 text-amber-200 font-semibold shadow-md"
        >
          <UserMinus className="w-4 h-4 text-[#FFB800] shrink-0" />
          <span className="text-xs font-bold">{peerLeaveNotice}</span>
        </div>
      )}

      {/* Stage Clear Banner */}
      {state.isStageClear && (
        <div className="p-3 rounded bg-emerald-950/90 border border-emerald-600 flex items-center justify-between text-emerald-200 font-bold shadow-lg">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-emerald-400" />
            <span className="text-sm">
              {t('CHIẾN THẮNG! Sân đấu đã được bảo vệ thành công!', 'VICTORY! The battlefield has been successfully defended!')}
            </span>
          </div>
          <span className="font-hud text-sm px-2 py-0.5 rounded bg-emerald-800 text-white">{t('CHIẾN THẮNG', 'VICTORY')}</span>
        </div>
      )}

      {/* Game Over Banner */}
      {state.isGameOver && (
        <div className="p-3 rounded bg-red-950/90 border border-[#FF0055] flex items-center gap-2 text-red-200 font-bold shadow-lg animate-pulse">
          <AlertTriangle className="w-5 h-5 text-[#FF0055] shrink-0" />
          <div className="flex flex-col">
            <span className="font-btn text-sm">{t('THẤT BẠI', 'GAME OVER')}</span>
            <span className="text-xs text-red-300 font-normal whitespace-pre-line">
              {formatSentenceLineBreaks(state.gameOverReason ?? t('Thất bại!', 'Defeat!'))}
            </span>
          </div>
        </div>
      )}

      {/* Admin Internal Telemetry & Enemy Progress */}
      {isSuperAdmin && (
        <>
          <div className="bg-[#050510] p-2.5 rounded border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
                <Skull className="w-3.5 h-3.5 text-neutral-400" />
                <span>{t('Tiến độ tiêu diệt địch (Admin)', 'Enemy Defeat Progress (Admin)')}</span>
              </span>
              <span className="font-hud text-sm text-neutral-400">
                <strong className="text-[#FFB800]">{state.totalDefeatedEnemies}</strong> / 30 {t('xe đã hạ', 'defeated')}
              </span>
            </div>

            <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#FFB800] to-emerald-500 transition-all duration-300"
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
                        ? 'bg-[#FF0055] animate-pulse'
                        : 'bg-[#FFB800]'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* P1 State Card */}
            <div
              className={`bg-[#050510] p-3 rounded space-y-1.5 font-mono text-[11px] ${
                isSuperAdmin
                  ? 'border-2 border-[#FF0055] ring-1 ring-[#FF0055]/40 shadow-sm shadow-[#FF0055]/20'
                  : 'border border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                <span className="font-bold text-[#FFB800] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <span>{t('NGƯỜI CHƠI P1', 'PLAYER P1')}</span>
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
                    : 'ONLINE'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-neutral-500">{t('Tọa độ:', 'Coords:')}</span>
                <span className="text-neutral-200">x={p1.x}, y={p1.y}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{t('Hướng nòng:', 'Facing:')}</span>
                <span className="text-[#00F0FF] font-semibold">{p1.direction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{t('Đạn P1:', 'P1 Bullet:')}</span>
                <span className={state.bullet ? 'text-[#FFB800]' : 'text-neutral-500'}>
                  {state.bullet
                    ? `Bay tại (${state.bullet.x.toFixed(0)}, ${state.bullet.y.toFixed(0)})`
                    : t('Sẵn sàng', 'Ready')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">{t('Căn cứ:', 'Base:')}</span>
                <span className={isBaseDestroyed ? 'text-[#FF0055] font-bold' : 'text-emerald-400'}>
                  {isBaseDestroyed ? t('BỊ PHÁ HỦY', 'DESTROYED') : t('AN TOÀN', 'SAFE')}
                </span>
              </div>
            </div>

            {/* Active Enemies List */}
            <div className="bg-[#050510] p-3 rounded border border-neutral-800 space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between border-b border-neutral-800/80 pb-1.5">
                <span className="font-bold text-[#FF0055] flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>{t('ĐỊCH TRÊN SÂN', 'ACTIVE ENEMIES')} ({enemies.length}/5)</span>
                </span>
                <span className="text-neutral-500 text-[10px]">{t('Tối đa 5', 'Max 5')}</span>
              </div>

              {enemies.length === 0 ? (
                <div className="text-neutral-600 italic py-2 text-center text-[10px]">
                  {t('Chưa có xe địch nào trên sân đấu...', 'No active enemy tanks on the battlefield...')}
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
                              ? 'text-white'
                              : e.enemyType === 'FAST'
                              ? 'text-blue-400'
                              : e.enemyType === 'POWER'
                              ? 'text-emerald-400'
                              : 'text-[#b07b56]'
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
                        <span className="text-[#FFB800] font-semibold">{e.aiState}</span>
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

      {/* Hotkeys reminder & Network / FPS telemetry */}
      <div className="text-[10px] text-neutral-500 border-t border-neutral-800 pt-2 flex flex-wrap justify-between items-center gap-1.5">
        <span>
          {t(
            'Điều khiển: W/A/S/D hoặc Mũi tên để di chuyển | Space / J để bắn đạn',
            'Controls: W/A/S/D or Arrow keys to move | Space / J to fire'
          )}
        </span>
        <div className="font-hud flex items-center gap-2 text-sm text-neutral-400">
          {state.gameMode === 'TWO_PLAYERS_ONLINE' && showOnlineNetStats && (
            <span
              data-testid="hud-online-net-stats"
              className="px-1.5 py-0.5 rounded bg-sky-950/70 border border-[#00F0FF]/50 text-[#00F0FF] font-bold"
            >
              Ping: {peerPingMs != null ? `${Math.round(peerPingMs)} ms` : '-- ms'} • {Math.round(fps)} FPS
            </span>
          )}
          {!(state.gameMode === 'TWO_PLAYERS_ONLINE' && showOnlineNetStats) && (
            <span>{Math.round(fps)} FPS</span>
          )}
        </div>
      </div>
    </div>
  );
};
