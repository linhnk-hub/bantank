/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlertTriangle,
  Clock,
  Crosshair,
  Flame,
  Heart,
  Pause,
  RotateCcw,
  Shield,
  Skull,
  Swords,
} from 'lucide-react';
import { formatCountdownMMSS } from '../core/constants.ts';
import type { GameCoreState } from '../core/types.ts';
import type { VsCombatantState, VsMatchState } from '../core/vsTypes.ts';
import { useLanguage } from '../core/i18n.ts';

interface VsHudProps {
  state: GameCoreState | null;
  compact?: boolean;
  onPause?: () => void;
  onReset?: () => void;
}

const CombatantRow: React.FC<{ c: VsCombatantState; accent: 'red' | 'amber' }> = ({
  c,
  accent,
}) => {
  const { t } = useLanguage();
  const isRed = accent === 'red';

  return (
    <div
      data-testid={`vs-hud-combatant-${c.role.toLowerCase()}`}
      className={`rounded-md border px-2.5 py-2 flex flex-col gap-1.5 transition-colors ${
        c.inDangerZone
          ? 'bg-rose-950/70 border-[#FF0055] animate-pulse'
          : c.eliminatedPermanently
            ? 'bg-neutral-950/70 border-neutral-800 opacity-65'
            : isRed
              ? 'bg-red-950/25 border-red-500/35'
              : 'bg-amber-950/25 border-[#FFB800]/35'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-sm shrink-0 ${
              c.eliminatedPermanently
                ? 'bg-neutral-600'
                : isRed
                  ? c.isAI
                    ? 'bg-rose-400'
                    : 'bg-red-500'
                  : c.isAI
                    ? 'bg-cyan-400'
                    : 'bg-[#FFB800]'
            }`}
          />
          <span className="font-btn font-black text-xs text-white tracking-wider truncate">
            {c.label}
          </span>
          {c.isAI && (
            <span className="font-mono text-[9px] font-bold px-1 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-300">
              A.I
            </span>
          )}
        </div>

        {/* Remaining Lives Hearts */}
        <div
          data-testid={`vs-hud-lives-${c.role.toLowerCase()}`}
          className="flex items-center gap-1 shrink-0"
          title={t('Mạng còn lại', 'Remaining lives')}
        >
          {[0, 1, 2].map((idx) => (
            <Heart
              key={idx}
              className={`w-3.5 h-3.5 ${
                idx < c.lives
                  ? isRed
                    ? 'text-red-500 fill-red-500'
                    : 'text-[#FFB800] fill-[#FFB800]'
                  : 'text-neutral-700'
              }`}
            />
          ))}
          <span className="font-hud text-xs font-black text-neutral-200 ml-0.5">{c.lives}</span>
        </div>
      </div>

      {/* Status Row: Respawn / Protection / Danger / Eliminated / Kills */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px]">
        <div className="flex flex-wrap items-center gap-1">
          {c.eliminatedPermanently ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-400 font-bold uppercase">
              <Skull className="w-3 h-3" />
              {t('ĐÃ LOẠI', 'ELIMINATED')}
            </span>
          ) : c.isDead && c.respawnTicksRemaining > 0 ? (
            <span
              data-testid={`vs-hud-respawn-${c.role.toLowerCase()}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-[#FFB800]/60 text-[#FFB800] font-mono font-bold"
            >
              <Clock className="w-3 h-3" />
              {t(`Hồi sinh: ${c.respawnSecondsRemaining}s`, `Respawn: ${c.respawnSecondsRemaining}s`)}
            </span>
          ) : c.protectionTicksRemaining > 0 ? (
            <span
              data-testid={`vs-hud-shield-${c.role.toLowerCase()}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-950/80 border border-[#00F0FF]/60 text-[#00F0FF] font-mono font-bold"
            >
              <Shield className="w-3 h-3" />
              {t(`Bảo vệ: ${c.protectionSecondsRemaining}s`, `Shield: ${c.protectionSecondsRemaining}s`)}
            </span>
          ) : (
            <span className="text-emerald-400 font-bold uppercase tracking-wide">
              {t('Sẵn sàng', 'Active')}
            </span>
          )}

          {c.inDangerZone && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FF0055] text-white font-black uppercase">
              <AlertTriangle className="w-3 h-3" />
              {t('NGUY HIỂM!', 'DANGER!')}
            </span>
          )}
        </div>

        <span className="font-mono text-neutral-300 font-bold flex items-center gap-1">
          <Crosshair className="w-3 h-3 text-neutral-400" />
          {c.kills}
        </span>
      </div>
    </div>
  );
};

export const VsHud: React.FC<VsHudProps> = ({ state, compact = false, onPause, onReset }) => {
  const { t } = useLanguage();
  const vs: VsMatchState | null | undefined = state?.vsState;
  if (!vs) return null;

  const isSuddenDeath = vs.phase === 'SUDDEN_DEATH';
  const isTransition = vs.phase === 'SUDDEN_DEATH_TRANSITION';
  const team1Members = vs.combatants.filter((c) => c.team === 'TEAM_1');
  const team2Members = vs.combatants.filter((c) => c.team === 'TEAM_2');

  const timerDisplay = isSuddenDeath
    ? formatCountdownMMSS(vs.suddenDeathElapsedSeconds)
    : isTransition
      ? '00:00'
      : formatCountdownMMSS(vs.normalRemainingSeconds);

  if (compact) {
    return (
      <div
        data-testid="vs-hud-compact"
        className="w-full max-w-[540px] mx-auto px-2 py-1.5 bg-[#0b0d1e]/95 border border-[#00F0FF]/30 rounded-lg shadow-lg flex flex-col gap-1.5 text-[11px]"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Team 1 Compact */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-btn font-black text-red-400">PHE 1</span>
            <span className="font-hud font-black text-white bg-red-950/70 border border-red-500/40 px-1.5 py-0.5 rounded">
              {vs.team1.totalKills}
            </span>
            <span className="text-[10px] text-neutral-300 font-mono">
              ♥{vs.team1.totalLivesRemaining}
            </span>
          </div>

          {/* Center Phase + Timer */}
          <div className="flex flex-col items-center">
            <span
              className={`font-btn text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                isSuddenDeath
                  ? 'bg-[#FF0055] text-white animate-pulse'
                  : isTransition
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#050510] text-[#00F0FF] border border-[#00F0FF]/40'
              }`}
            >
              {isSuddenDeath
                ? 'SUDDEN DEATH'
                : isTransition
                  ? t('CHUYỂN HIỆP', 'TRANSITION')
                  : t('HIỆP CHÍNH', 'NORMAL')}
            </span>
            <span className="font-hud text-sm font-black text-[#FFB800] leading-tight mt-0.5">
              {timerDisplay}
            </span>
          </div>

          {/* Team 2 Compact */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] text-neutral-300 font-mono">
              ♥{vs.team2.totalLivesRemaining}
            </span>
            <span className="font-hud font-black text-white bg-amber-950/70 border border-[#FFB800]/40 px-1.5 py-0.5 rounded">
              {vs.team2.totalKills}
            </span>
            <span className="font-btn font-black text-[#FFB800]">PHE 2</span>
          </div>
        </div>

        {/* Per-tank mini status pills */}
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="flex flex-wrap gap-1">
            {team1Members.map((c) => (
              <span
                key={c.id}
                className={`px-1.5 py-0.5 rounded border font-mono font-bold ${
                  c.inDangerZone
                    ? 'bg-[#FF0055] border-white text-white'
                    : c.eliminatedPermanently
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-500'
                      : 'bg-red-950/40 border-red-500/40 text-red-200'
                }`}
              >
                {c.label}:♥{c.lives}
                {c.isDead && c.respawnTicksRemaining > 0
                  ? ` ⏳${c.respawnSecondsRemaining}s`
                  : c.protectionTicksRemaining > 0
                    ? ` 🛡${c.protectionSecondsRemaining}s`
                    : ''}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            {team2Members.map((c) => (
              <span
                key={c.id}
                className={`px-1.5 py-0.5 rounded border font-mono font-bold ${
                  c.inDangerZone
                    ? 'bg-[#FF0055] border-white text-white'
                    : c.eliminatedPermanently
                      ? 'bg-neutral-900 border-neutral-700 text-neutral-500'
                      : 'bg-amber-950/40 border-[#FFB800]/40 text-amber-200'
                }`}
              >
                {c.label}:♥{c.lives}
                {c.isDead && c.respawnTicksRemaining > 0
                  ? ` ⏳${c.respawnSecondsRemaining}s`
                  : c.protectionTicksRemaining > 0
                    ? ` 🛡${c.protectionSecondsRemaining}s`
                    : ''}
              </span>
            ))}
          </div>
        </div>

        {/* Sudden Death Shrink Info & Danger Alert */}
        {isSuddenDeath && (
          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-rose-950/60 border border-[#FF0055]/60 text-[10px] font-mono">
            <span className="text-rose-200 font-bold">
              {t(`Thu hẹp cấp ${vs.safeZone.shrinkLevel}`, `Shrink Lv.${vs.safeZone.shrinkLevel}`)}
            </span>
            <span
              className={`font-black ${
                vs.safeZone.isShrinkImminent ? 'text-[#FFB800] animate-pulse' : 'text-white'
              }`}
            >
              {t(
                `Thu hẹp sau: ${vs.safeZone.secondsUntilNextShrink}s`,
                `Next shrink: ${vs.safeZone.secondsUntilNextShrink}s`
              )}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="vs-hud-desktop"
      className="bg-[#0b0d1e] border-2 border-[#00F0FF]/35 rounded-lg p-4 shadow-2xl flex flex-col gap-3.5"
    >
      {/* Header: Mode + Phase Badge */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Swords className="w-4 h-4 text-[#FF0055] shrink-0" />
          <span className="font-btn font-black text-xs uppercase tracking-wider text-white truncate">
            {vs.mode === 'VS_P1_P2' ? 'VS: P1 vs P2' : 'VS: P1 + A.I vs P2 + A.I'}
          </span>
        </div>
        <span
          data-testid="vs-hud-phase-badge"
          className={`font-btn px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 ${
            isSuddenDeath
              ? 'bg-[#FF0055] text-white animate-pulse'
              : isTransition
                ? 'bg-[#FFB800] text-black'
                : 'bg-sky-950 border border-[#00F0FF]/50 text-[#00F0FF]'
          }`}
        >
          {isSuddenDeath
            ? 'SUDDEN DEATH'
            : isTransition
              ? t('CHUYỂN HIỆP', 'TRANSITION')
              : t('CHÍNH THỨC', 'NORMAL')}
        </span>
      </div>

      {/* Match Clock & Sudden Death Shrink Panel */}
      <div
        className={`rounded-lg border p-3 flex flex-col items-center gap-1.5 ${
          isSuddenDeath
            ? 'bg-rose-950/45 border-[#FF0055]/70'
            : 'bg-[#050510] border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
          {isSuddenDeath ? (
            <Flame className="w-3.5 h-3.5 text-[#FF0055]" />
          ) : (
            <Clock className="w-3.5 h-3.5 text-[#FFB800]" />
          )}
          <span>
            {isSuddenDeath
              ? t('HIỆP PHỤ SINH TỬ (KHÔNG GIỚI HẠN)', 'SUDDEN DEATH (UNLIMITED)')
              : isTransition
                ? t('ĐANG HOÀN TẤT HỒI SINH...', 'COMPLETING PENDING RESPAWNS...')
                : t('THỜI GIAN CHÍNH THỨC (3:00)', 'OFFICIAL MATCH TIMER (3:00)')}
          </span>
        </div>
        <div
          data-testid="vs-hud-timer"
          className={`font-hud text-3xl font-black tracking-widest ${
            isSuddenDeath
              ? 'text-[#FF0055]'
              : vs.normalRemainingSeconds <= 20
                ? 'text-rose-400 animate-pulse'
                : 'text-[#FFB800]'
          }`}
        >
          {timerDisplay}
        </div>

        {isSuddenDeath && (
          <div className="w-full mt-1 pt-2 border-t border-rose-500/30 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-rose-200 font-bold">
                {t('Cấp thu hẹp bản đồ:', 'Map Shrink Level:')}
              </span>
              <span
                data-testid="vs-hud-shrink-level"
                className="font-black text-white px-2 py-0.5 rounded bg-[#FF0055]/40 border border-[#FF0055]"
              >
                LV.{vs.safeZone.shrinkLevel}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-neutral-300">
                {t('Thu hẹp kế tiếp (20s):', 'Next Shrink (20s):')}
              </span>
              <span
                data-testid="vs-hud-next-shrink"
                className={`font-black ${
                  vs.safeZone.isShrinkImminent ? 'text-[#FFB800] animate-pulse' : 'text-[#00F0FF]'
                }`}
              >
                {vs.safeZone.secondsUntilNextShrink}s
              </span>
            </div>
          </div>
        )}

        {vs.anyTankInDangerZone && (
          <div
            data-testid="vs-hud-danger-warning"
            className="w-full mt-1 px-2.5 py-1.5 rounded bg-[#FF0055] text-white text-[11px] font-btn font-black uppercase tracking-wider flex items-center justify-center gap-1.5 animate-pulse"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{t('CẢNH BÁO: NGOÀI VÙNG AN TOÀN!', 'WARNING: OUTSIDE SAFE ZONE!')}</span>
          </div>
        )}
      </div>

      {/* TEAM 1 Panel */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-btn font-black text-xs uppercase tracking-wider text-red-400">
            {t('PHE 1 (TEAM 1)', 'TEAM 1')}
          </span>
          <span
            data-testid="vs-hud-team1-kills"
            className="font-mono text-xs font-black text-white px-2 py-0.5 rounded bg-red-950/70 border border-red-500/40"
          >
            {t(`Tiêu diệt: ${vs.team1.totalKills}`, `Kills: ${vs.team1.totalKills}`)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {team1Members.map((c) => (
            <CombatantRow key={c.id} c={c} accent="red" />
          ))}
        </div>
      </div>

      {/* TEAM 2 Panel */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-btn font-black text-xs uppercase tracking-wider text-[#FFB800]">
            {t('PHE 2 (TEAM 2)', 'TEAM 2')}
          </span>
          <span
            data-testid="vs-hud-team2-kills"
            className="font-mono text-xs font-black text-white px-2 py-0.5 rounded bg-amber-950/70 border border-[#FFB800]/40"
          >
            {t(`Tiêu diệt: ${vs.team2.totalKills}`, `Kills: ${vs.team2.totalKills}`)}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {team2Members.map((c) => (
            <CombatantRow key={c.id} c={c} accent="amber" />
          ))}
        </div>
      </div>

      {/* Keyboard Controls Quick Reference */}
      <div className="rounded bg-[#050510] border border-neutral-800 px-3 py-2 text-[11px] font-mono text-neutral-300 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-red-400 font-bold">P1:</span>
          <span>W A S D • Space / J</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[#FFB800] font-bold">P2:</span>
          <span>↑ ↓ ← → • Enter / K / Num0</span>
        </div>
      </div>

      {/* Action Buttons */}
      {(onPause || onReset) && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="font-btn py-2 px-3 rounded bg-[#050510] hover:bg-neutral-800 border border-[#FFB800]/50 text-[#FFB800] text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>{t('Tạm dừng', 'Pause')}</span>
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="font-btn py-2 px-3 rounded bg-[#050510] hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t('Đấu lại', 'Restart')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
