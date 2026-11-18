/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trophy, Users, Loader2, Clock, Heart } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import {
  formatCountdownMMSS,
  getStartingLivesForDifficultyAndMode,
} from '../core/constants.ts';
import { CoopOnlineManager, type CoopPlayerRole } from '../core/coopOnlineManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { getCampaignStageSpec, TOTAL_CAMPAIGN_STAGES } from '../core/campaignStages.ts';
import { useLanguage } from '../core/i18n.ts';

interface GameOverModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
  isTrialMode?: boolean;
  localOnlineRole?: CoopPlayerRole;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  state,
  onRestart,
  onQuitToMenu,
  onReturnToLobby,
  isReturningToLobby = false,
  returnToLobbyError = null,
  isTrialMode = false,
  localOnlineRole,
}) => {
  const { t } = useLanguage();

  if (!isOpen || !state || !state.isGameOver || state.matchState !== 'GAME_OVER') return null;

  const isCoopOnline = state.gameMode === 'TWO_PLAYERS_ONLINE';
  const isCoop = state.gameMode === 'TWO_PLAYERS_AI' || isCoopOnline;
  const effectiveOnlineRole =
    localOnlineRole !== undefined
      ? localOnlineRole
      : isCoopOnline
        ? CoopOnlineManager.getInstance().getRole()
        : null;

  const startingLives = getStartingLivesForDifficultyAndMode(
    state.difficulty ?? 'DEFAULT',
    state.gameMode ?? 'SOLO'
  );
  const localPlayerState =
    isCoopOnline && effectiveOnlineRole === 'GUEST' && state.p2State
      ? state.p2State
      : state.p1State;
  const isLocalEliminated = Boolean(
    localPlayerState.isSpectator ||
      localPlayerState.hasLeftMatch ||
      (localPlayerState.isDead && localPlayerState.lives <= 0)
  );
  const livesLeft = isLocalEliminated
    ? 0
    : Math.max(0, Math.min(startingLives, Number(localPlayerState.lives ?? 0)));
  const livesUsed = Math.max(0, startingLives - livesLeft);

  const teammateState =
    isCoop && state.p2State
      ? isCoopOnline && effectiveOnlineRole === 'GUEST'
        ? state.p1State
        : state.p2State
      : null;
  const teammateEliminated = teammateState
    ? Boolean(
        teammateState.isSpectator ||
          teammateState.hasLeftMatch ||
          (teammateState.isDead && teammateState.lives <= 0)
      )
    : false;
  const teammateLivesLeft = teammateState
    ? teammateEliminated
      ? 0
      : Math.max(0, Math.min(startingLives, Number(teammateState.lives ?? 0)))
    : 0;
  const teammateLabel =
    isCoopOnline && effectiveOnlineRole === 'GUEST'
      ? t('Mạng còn lại của P1:', 'P1 Remaining Lives:')
      : state.gameMode === 'TWO_PLAYERS_AI'
        ? t('Mạng còn lại của Đồng đội AI:', 'AI Partner Remaining Lives:')
        : t('Mạng còn lại của P2:', 'P2 Remaining Lives:');

  const isOnlineGuest = isCoopOnline && effectiveOnlineRole === 'GUEST';
  const localStats = isOnlineGuest
    ? (state.p2Stats ?? {
        score: 0,
        stageScore: 0,
        defeatedCounts: { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 },
      })
    : (state.p1Stats ?? {
        score: state.score,
        stageScore: 0,
        defeatedCounts: state.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 },
      });
  const counts = localStats.defeatedCounts;
  const totalDefeated = counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR;
  const localTotalScore = localStats.score;
  const localStageScore =
    counts.BASIC * 1 + counts.FAST * 2 + counts.POWER * 3 + counts.ARMOR * 5;
  void localStageScore;
  const localPlayerTag = isOnlineGuest ? 'P2' : 'P1';
  const isNewRecord = localTotalScore >= state.highScore && localTotalScore > 0;
  const isTimeout = Boolean(state.isTimeoutGameOver);
  const isBaseDestroyed = Boolean(state.terrain.isBaseDestroyed);
  const causeBadgeLabel = isTimeout
    ? t('THUA DO HẾT THỜI GIAN (00:00)', 'DEFEAT: TIME EXPIRED (00:00)')
    : isBaseDestroyed
    ? t('CĂN CỨ ĐẠI BÀNG BỊ PHÁ HỦY', 'EAGLE HEADQUARTERS DESTROYED')
    : t('HẾT MẠNG CHIẾN ĐẤU', 'OUT OF COMBAT LIVES');

  const currentStageId = state.currentStageId ?? 1;
  const stageName = state.currentStageName || getCampaignStageSpec(currentStageId).name;
  void TOTAL_CAMPAIGN_STAGES;
  void livesUsed;
  const isP2Local = isCoopOnline && effectiveOnlineRole === 'GUEST';
  const isP2Teammate = isCoop && !isP2Local;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#050510]/88 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="flex-1 w-full flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-4 px-2 sm:px-4">
        <div className="bg-[#0b0d1e] border-2 border-[#FF0055] rounded-lg max-w-md w-full flex flex-col shadow-[0_0_32px_rgba(255,0,85,0.25)] overflow-hidden">
          {/* Content Body */}
          <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
            {/* Header */}
            <div className="text-center space-y-1.5">
              <h2 className="font-btn text-xl sm:text-2xl font-black tracking-wider text-[#FF0055] uppercase">
                {t('THẤT BẠI', 'GAME OVER')}
              </h2>
              <p className="font-hud text-sm sm:text-base text-[#00F0FF] font-bold tracking-wide">
                {t('MÀN', 'STAGE')} {currentStageId} • {stageName}
              </p>
              <div className="font-btn inline-flex items-center gap-1.5 px-3 py-1 rounded bg-red-950/90 border border-[#FF0055]/70 text-xs sm:text-sm font-extrabold text-red-100">
                <span>{causeBadgeLabel}</span>
              </div>
            </div>

            {/* Score & Record Display */}
            <div className="bg-[#050510] border border-[#FF0055]/30 rounded-lg p-3 text-center space-y-1">
              <div className="font-btn text-xs text-neutral-400 font-medium">
                {isCoop
                  ? t(`TỔNG XP CỦA BẠN (${localPlayerTag})`, `YOUR TOTAL XP (${localPlayerTag})`)
                  : t('TỔNG XP TÍCH LŨY', 'TOTAL ACCUMULATED XP')}
              </div>
              <div className="font-hud text-3xl sm:text-4xl font-black text-[#FFB800] tracking-tight">
                {localTotalScore.toLocaleString()} XP
              </div>
              {!isTrialMode && (
                <div className="font-hud flex items-center justify-center gap-1.5 pt-0.5 text-sm">
                  <Trophy className="w-3.5 h-3.5 text-[#FFB800]" />
                  <span className="text-neutral-400">{t('Kỷ lục:', 'High XP:')}</span>
                  <span className="font-bold text-[#EAF4FF]">{state.highScore.toLocaleString()} XP</span>
                  {isNewRecord && (
                    <span className="font-btn px-1.5 py-0.2 rounded bg-[#FFB800] text-[#050510] font-extrabold text-[10px] animate-pulse">
                      {t('KỶ LỤC MỚI!', 'NEW RECORD!')}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Unified Statistics Breakdown */}
            <div className="bg-[#050510]/85 border border-[#00F0FF]/25 rounded-lg p-3 space-y-2.5 font-hud text-xs sm:text-sm">
              <div className="font-btn font-bold text-[#EAF4FF] pb-1.5 border-b border-neutral-800 flex justify-between items-center gap-2">
                <span>
                  {isCoop
                    ? t(`THÀNH TÍCH CỦA BẠN (${localPlayerTag})`, `YOUR STATS (${localPlayerTag})`)
                    : t('THỐNG KÊ CHIẾN TÍCH', 'COMBAT STATISTICS')}
                </span>
                <div
                  className={`font-hud flex items-center gap-1 text-xs sm:text-sm shrink-0 ${
                    isTimeout ? 'text-[#FF0055] font-bold' : 'text-[#00F0FF]'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatCountdownMMSS(state.remainingSeconds ?? 0)}</span>
                </div>
              </div>

              <div className="space-y-1.5 font-hud text-xs sm:text-sm">
                <div className="flex items-center justify-between text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-neutral-400 shrink-0" />
                    <span>Basic Tank (1 XP):</span>
                  </span>
                  <span className="font-bold">{counts.BASIC} {t('xe', 'tanks')} = {counts.BASIC * 1} XP</span>
                </div>

                <div className="flex items-center justify-between text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-300 shrink-0" />
                    <span>Fast Tank (2 XP):</span>
                  </span>
                  <span className="font-bold">{counts.FAST} {t('xe', 'tanks')} = {counts.FAST * 2} XP</span>
                </div>

                <div className="flex items-center justify-between text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300 shrink-0" />
                    <span>Power Tank (3 XP):</span>
                  </span>
                  <span className="font-bold">{counts.POWER} {t('xe', 'tanks')} = {counts.POWER * 3} XP</span>
                </div>

                <div className="flex items-center justify-between text-neutral-300">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-black border-2 border-white shrink-0" />
                    <span>Armor Tank (5 XP):</span>
                  </span>
                  <span className="font-bold">{counts.ARMOR} {t('xe', 'tanks')} = {counts.ARMOR * 5} XP</span>
                </div>

                <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-[#FFB800]">
                  <span>
                    {isCoop
                      ? t(`Đã tiêu diệt (${localPlayerTag}):`, `Defeated (${localPlayerTag}):`)
                      : t('Tổng tiêu diệt:', 'Total Defeated:')}
                  </span>
                  <span>
                    {isCoop
                      ? t(
                          `${totalDefeated} xe (Đội: ${state.totalDefeatedEnemies}/30)`,
                          `${totalDefeated} tanks (Team: ${state.totalDefeatedEnemies}/30)`
                        )
                      : t(`${totalDefeated} / 30 xe`, `${totalDefeated} / 30 tanks`)}
                  </span>
                </div>

                <div
                  data-testid="gameover-lives-stat"
                  className="flex items-center justify-between pt-0.5 text-neutral-300"
                >
                  <span className={`flex items-center gap-1.5 ${isP2Local ? 'text-emerald-400' : 'text-[#FF0055]'}`}>
                    <Heart className={`w-3.5 h-3.5 shrink-0 ${isP2Local ? 'fill-emerald-400 text-emerald-400' : 'fill-[#FF0055] text-[#FF0055]'}`} />
                    <span>{t('Số mạng còn lại:', 'Remaining lives:')}</span>
                  </span>
                  <span className={`font-bold ${isP2Local ? 'text-emerald-400' : 'text-white'}`}>
                    {livesLeft} {t('mạng', 'lives')}
                  </span>
                </div>

                {teammateState && (
                  <div className={`flex items-center justify-between pt-0.5 ${isP2Teammate ? 'text-emerald-400' : 'text-neutral-300'}`}>
                    <span>{teammateLabel}</span>
                    <span className={`font-bold ${isP2Teammate ? 'text-emerald-400' : 'text-white'}`}>
                      {teammateLivesLeft} {t('mạng', 'lives')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {returnToLobbyError && isCoopOnline && (
            <div className="mx-4 mb-2 p-2.5 rounded bg-red-950/75 border border-[#FF0055]/40 text-red-200 text-xs font-medium text-center whitespace-pre-line">
              {formatSentenceLineBreaks(returnToLobbyError)}
            </div>
          )}

          {/* Sticky Action Footer */}
          <div className="p-3 sm:p-4 bg-[#050510]/95 border-t border-neutral-800 flex gap-2.5 shrink-0 safe-area-inset">
            {isCoopOnline && onReturnToLobby ? (
              <button
                type="button"
                data-testid="gameover-return-lobby-btn"
                disabled={isReturningToLobby}
                onClick={onReturnToLobby}
                className="font-btn flex-1 min-h-[48px] flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-extrabold text-xs transition-all shadow-lg shadow-[#00F0FF]/20 active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {isReturningToLobby ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Users className="w-4 h-4" />
                )}
                <span>
                  {isReturningToLobby
                    ? t('ĐANG VÀO PHÒNG CHỜ...', 'ENTERING LOBBY...')
                    : t('VỀ PHÒNG CHỜ', 'TO LOBBY')}
                </span>
              </button>
            ) : !isTrialMode ? (
              <button
                type="button"
                onClick={onRestart}
                className="font-btn flex-1 min-h-[48px] flex items-center justify-center py-2.5 sm:py-3 px-3 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold text-xs transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer"
              >
                <span>{t('CHƠI LẠI', 'RETRY')}</span>
              </button>
            ) : null}

            <button
              type="button"
              data-testid={isTrialMode ? 'trial-return-login-btn' : 'gameover-quit-menu-btn'}
              disabled={isReturningToLobby}
              onClick={onQuitToMenu}
              className={`font-btn flex-1 min-h-[48px] flex items-center justify-center py-2.5 sm:py-3 px-3 rounded font-bold text-xs transition-all active:scale-95 cursor-pointer ${
                isTrialMode
                  ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold shadow-lg shadow-[#FFB800]/20'
                  : 'bg-[#0b0d1e] hover:bg-neutral-800 text-[#EAF4FF] border border-[#687386]/50'
              }`}
            >
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Footer on Defeat Screen */}
      <footer className="w-full border-t border-neutral-800 bg-[#050510]/95 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-center text-xs text-[#687386] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
        </div>
      </footer>
    </div>
  );
};
