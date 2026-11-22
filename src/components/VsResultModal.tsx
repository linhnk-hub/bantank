/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Crown, Heart, LogOut, Shuffle, Swords, Trophy } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { VS_TANK_COLOR_SPEC } from '../core/vsTypes.ts';
import { useLanguage } from '../core/i18n.ts';

interface VsResultModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onReplay: () => void;
  onQuitToMenu: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
}

export const VsResultModal: React.FC<VsResultModalProps> = ({
  isOpen,
  state,
  onReplay,
  onQuitToMenu,
  isReturningToLobby = false,
  returnToLobbyError = null,
}) => {
  const { t } = useLanguage();
  const vs = state?.vsState;
  const outcome = vs?.outcome;

  if (!isOpen || !vs || !outcome) return null;

  const isTeam1Winner = outcome.winnerTeam === 'TEAM_1';
  const winnerLabel = isTeam1Winner ? t('ĐỘI 1', 'TEAM 1') : t('ĐỘI 2', 'TEAM 2');
  const loserLabel = isTeam1Winner ? t('ĐỘI 2', 'TEAM 2') : t('ĐỘI 1', 'TEAM 1');

  return (
    <div
      data-testid="vs-result-modal"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#050510]/92 p-3 sm:p-4 select-none overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-xl border-2 border-[#FFB800] bg-[#0b0d1e] shadow-2xl overflow-hidden my-auto">
        {/* Top Banner */}
        <div
          className={`px-5 py-4 border-b border-neutral-800 text-center flex flex-col items-center gap-1.5 ${
            isTeam1Winner
              ? 'bg-gradient-to-b from-red-950/80 to-[#0b0d1e]'
              : 'bg-gradient-to-b from-amber-950/80 to-[#0b0d1e]'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-widest text-neutral-300">
            <Swords className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>
              {vs.mode === 'VS_P1_P2' ? 'VS • P1 vs P2' : 'VS • P1 + A.I vs P2 + A.I'}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 mt-1">
            <Trophy
              className={`w-7 h-7 ${isTeam1Winner ? 'text-red-400' : 'text-[#FFB800]'}`}
            />
            <h2
              data-testid="vs-result-winner-heading"
              className={`font-btn text-xl sm:text-2xl font-black uppercase tracking-wider ${
                isTeam1Winner ? 'text-red-400' : 'text-[#FFB800]'
              }`}
            >
              {winnerLabel} {t('THẮNG!', 'WINS!')}
            </h2>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs font-btn font-black">
            <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/60 text-emerald-300">
              {winnerLabel}: WIN
            </span>
            <span className="px-2.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/50 text-rose-300">
              {loserLabel}: LOSS
            </span>
          </div>

          {/* Opponent Left Forfeit Notice (M7.8 Section XIV) */}
          {outcome.reason === 'OPPONENT_LEFT' && (
            <div
              data-testid="vs-result-opponent-left-notice"
              className="mt-2 px-3 py-1.5 rounded bg-rose-950/80 border border-[#FF0055]/75 text-rose-200 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0 text-[#FF0055]" />
              <span>
                {t(
                  outcome.reasonTextVi || 'Đối thủ đã rời trận',
                  outcome.reasonTextEn || 'Opponent left the match'
                )}
              </span>
            </div>
          )}

          {/* Mandatory 50/50 Simultaneous Elimination Notice */}
          {outcome.decidedByRandom5050 && (
            <div
              data-testid="vs-result-random-5050-notice"
              className="mt-2 px-3 py-1.5 rounded bg-amber-950/80 border border-[#FFB800]/70 text-[#FFB800] text-xs font-bold flex items-center gap-1.5"
            >
              <Shuffle className="w-3.5 h-3.5 shrink-0" />
              <span>Kết quả phân định ngẫu nhiên 50/50</span>
            </div>
          )}
        </div>

        {/* Team Summary Cards */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* TEAM 1 Card */}
            <div
              className={`rounded-lg border p-3 flex flex-col gap-1.5 ${
                outcome.team1Result === 'WIN'
                  ? 'bg-red-950/40 border-red-400/70'
                  : 'bg-[#050510] border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-btn text-xs font-black text-red-400">{t('ĐỘI 1', 'TEAM 1')}</span>
                <span
                  data-testid="vs-result-team1-outcome"
                  className={`font-btn text-[10px] font-black px-1.5 py-0.5 rounded ${
                    outcome.team1Result === 'WIN'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {outcome.team1Result === 'WIN' ? (
                    <span className="inline-flex items-center gap-1">
                      <Crown className="w-3 h-3" /> WIN
                    </span>
                  ) : (
                    'LOSS'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                <span>{t('Tổng tiêu diệt:', 'Total Kills:')}</span>
                <span className="font-black text-white">{vs.team1.totalKills}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                <span>{t('Mạng còn lại:', 'Lives Left:')}</span>
                <span className="font-black text-red-400 flex items-center gap-1">
                  <Heart className="w-3 h-3 fill-red-400" />
                  {vs.team1.totalLivesRemaining}
                </span>
              </div>
            </div>

            {/* TEAM 2 Card */}
            <div
              className={`rounded-lg border p-3 flex flex-col gap-1.5 ${
                outcome.team2Result === 'WIN'
                  ? 'bg-amber-950/40 border-[#FFB800]/70'
                  : 'bg-[#050510] border-neutral-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-btn text-xs font-black text-[#FFB800]">{t('ĐỘI 2', 'TEAM 2')}</span>
                <span
                  data-testid="vs-result-team2-outcome"
                  className={`font-btn text-[10px] font-black px-1.5 py-0.5 rounded ${
                    outcome.team2Result === 'WIN'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  {outcome.team2Result === 'WIN' ? (
                    <span className="inline-flex items-center gap-1">
                      <Crown className="w-3 h-3" /> WIN
                    </span>
                  ) : (
                    'LOSS'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                <span>{t('Tổng tiêu diệt:', 'Total Kills:')}</span>
                <span className="font-black text-white">{vs.team2.totalKills}</span>
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-neutral-300">
                <span>{t('Mạng còn lại:', 'Lives Left:')}</span>
                <span className="font-black text-[#FFB800] flex items-center gap-1">
                  <Heart className="w-3 h-3 fill-[#FFB800]" />
                  {vs.team2.totalLivesRemaining}
                </span>
              </div>
            </div>
          </div>

          {/* Per-Tank Combat Breakdown */}
          <div className="rounded-lg border border-neutral-800 bg-[#050510] overflow-hidden">
            <div className="px-3 py-1.5 bg-neutral-900/90 border-b border-neutral-800 text-[10px] font-btn font-black uppercase tracking-wider text-neutral-400 grid grid-cols-12">
              <span className="col-span-4">{t('Xe tăng', 'Tank')}</span>
              <span className="col-span-2 text-center">{t('Đội', 'Team')}</span>
              <span className="col-span-2 text-center">{t('Hạ', 'Kills')}</span>
              <span className="col-span-2 text-center">{t('Bị hạ', 'Deaths')}</span>
              <span className="col-span-2 text-right">{t('Mạng', 'Lives')}</span>
            </div>
            <div className="divide-y divide-neutral-800/80 text-xs font-mono">
              {vs.combatants.map((c) => {
                const colorSpec = VS_TANK_COLOR_SPEC[c.role];
                return (
                  <div key={c.id} className="px-3 py-2 grid grid-cols-12 items-center">
                    <span className={`col-span-4 font-btn font-bold flex items-center gap-1.5 ${colorSpec.badgeTextClass}`}>
                      <span
                        className="w-2.5 h-2.5 rounded-xs border border-white/30 shrink-0"
                        style={{ backgroundColor: colorSpec.hex }}
                      />
                      {c.label}
                    </span>
                    <span
                      className={`col-span-2 text-center text-[10px] font-bold ${
                        c.team === 'TEAM_1' ? 'text-red-400' : 'text-yellow-400'
                      }`}
                    >
                      {c.team === 'TEAM_1' ? 'T1' : 'T2'}
                    </span>
                    <span className="col-span-2 text-center font-black text-emerald-400">
                      {c.kills}
                    </span>
                    <span className="col-span-2 text-center text-rose-400">{c.deaths}</span>
                    <span className="col-span-2 text-right font-bold text-neutral-200">
                      {c.lives}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[10px] text-center font-mono text-neutral-500">
            {t(
              'Chế độ VS không cộng XP, Sao, Xu và không ảnh hưởng tiến trình Chiến Dịch.',
              'VS Mode grants 0 XP, 0 Stars, 0 Coins and does not affect Campaign progression.'
            )}
          </p>

          {returnToLobbyError && (
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-[#FF0055]/40 text-red-300 text-xs text-center">
              {returnToLobbyError}
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              data-testid="vs-result-replay-btn"
              disabled={isReturningToLobby}
              onClick={onReplay}
              className="font-btn min-h-[46px] py-2.5 px-4 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center shadow-lg cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
            >
              <span>
                {isReturningToLobby
                  ? t('ĐANG VỀ PHÒNG...', 'RETURNING...')
                  : t('VỀ LẠI PHÒNG', 'RETURN TO ROOM')}
              </span>
            </button>
            <button
              type="button"
              data-testid="vs-result-menu-btn"
              onClick={onQuitToMenu}
              className="font-btn min-h-[46px] py-2.5 px-4 rounded-lg bg-[#050510] hover:bg-neutral-800 border border-neutral-700 text-neutral-200 font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center cursor-pointer transition-transform active:scale-95"
            >
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
