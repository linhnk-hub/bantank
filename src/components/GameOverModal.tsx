/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw, Home, Skull, Trophy, Clock, ShieldAlert, Users, Loader2 } from 'lucide-react';
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#050510]/88 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2 sm:px-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#0b0d1e] border-2 border-[#FF0055] rounded-lg max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-[0_0_32px_rgba(255,0,85,0.25)] overflow-hidden">
        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-4 scrollbar-thin">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded bg-[#FF0055]/15 text-[#FF0055] border border-[#FF0055]/40 mb-0.5">
              {isTimeout ? (
                <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : isBaseDestroyed ? (
                <ShieldAlert className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Skull className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>
            <h2 className="font-pixel text-lg sm:text-xl font-black tracking-wider text-[#FF0055] uppercase">
              GAME OVER
            </h2>
            <div className="font-btn inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-red-950/90 border border-[#FF0055]/70 text-[10px] sm:text-[11px] font-bold text-red-200">
              <span>{causeBadgeLabel}</span>
            </div>
          </div>

          {/* Score & Record Display */}
          <div className="bg-[#050510] border border-[#FF0055]/30 rounded-lg p-3 text-center space-y-1">
            <div className="font-btn text-[11px] text-neutral-400 font-medium">
              {isCoop
                ? t(`TỔNG XP CỦA BẠN (${localPlayerTag})`, `YOUR TOTAL XP (${localPlayerTag})`)
                : t('TỔNG XP TRẬN NÀY', 'MATCH TOTAL XP')}
            </div>
            <div className="font-hud text-3xl sm:text-4xl font-black text-[#FFB800] tracking-tight">
              {localTotalScore.toLocaleString()} XP
            </div>
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
          </div>

          {/* Statistics Breakdown */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3 space-y-2 text-xs">
            <div className="font-btn font-bold text-[#EAF4FF] pb-1 border-b border-neutral-800 flex justify-between gap-2 flex-wrap">
              <span>
                {isCoop
                  ? t(`THÀNH TÍCH CỦA BẠN (${localPlayerTag})`, `YOUR STATS (${localPlayerTag})`)
                  : t('THỐNG KÊ CHIẾN TÍCH', 'COMBAT STATISTICS')}
              </span>
              <span className="font-hud text-sm text-[#FFB800]">
                STAGE {state.currentStageId ?? 1}/{TOTAL_CAMPAIGN_STAGES} •{' '}
                {state.currentStageName || getCampaignStageSpec(state.currentStageId ?? 1).shortTitle}
              </span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] sm:text-xs">
              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white border border-neutral-400" />
                  Basic Tank (1 XP):
                </span>
                <span className="font-hud text-sm">{counts.BASIC} {t('xe', 'tanks')} = {counts.BASIC * 1} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-300" />
                  Fast Tank (2 XP):
                </span>
                <span className="font-hud text-sm">{counts.FAST} {t('xe', 'tanks')} = {counts.FAST * 2} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-300" />
                  Power Tank (3 XP):
                </span>
                <span className="font-hud text-sm">{counts.POWER} {t('xe', 'tanks')} = {counts.POWER * 3} XP</span>
              </div>

              <div className="flex items-center justify-between text-neutral-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-black border-2 border-white" />
                  Armor Tank (5 XP):
                </span>
                <span className="font-hud text-sm">{counts.ARMOR} {t('xe', 'tanks')} = {counts.ARMOR * 5} XP</span>
              </div>

              <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-[#FFB800]">
                <span>
                  {isCoop
                    ? t(`Tiêu diệt (${localPlayerTag}):`, `Defeated (${localPlayerTag}):`)
                    : t('Tổng tiêu diệt:', 'Total Defeated:')}
                </span>
                <span className="font-hud text-sm">
                  {isCoop
                    ? t(
                        `${totalDefeated} xe (Toàn đội: ${state.totalDefeatedEnemies}/30)`,
                        `${totalDefeated} tanks (Team: ${state.totalDefeatedEnemies}/30)`
                      )
                    : t(`${totalDefeated} / 30 xe`, `${totalDefeated} / 30 tanks`)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                <span>{t('Thời gian còn lại:', 'Remaining time:')}</span>
                <span className={`font-hud text-sm ${isTimeout ? 'text-[#FF0055] font-bold' : 'text-neutral-200'}`}>
                  {formatCountdownMMSS(state.remainingSeconds ?? 0)}
                </span>
              </div>

              <div
                data-testid="gameover-lives-stat"
                className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5"
              >
                <span>{t('Mạng đã dùng / còn lại:', 'Lives used / remaining:')}</span>
                <span className="font-hud text-sm">
                  {t(
                    `${livesUsed} đã dùng / ${livesLeft} còn lại`,
                    `${livesUsed} used / ${livesLeft} remaining`
                  )}
                </span>
              </div>

              {teammateState && (
                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                  <span>{teammateLabel}</span>
                  <span className="font-hud text-sm">{teammateLivesLeft} {t('còn lại', 'remaining')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {returnToLobbyError && isCoopOnline && (
          <div className="mx-4 mb-2 p-2.5 rounded bg-red-950/75 border border-[#FF0055]/40 text-red-200 text-[11px] font-medium text-center whitespace-pre-line">
            {formatSentenceLineBreaks(returnToLobbyError)}
          </div>
        )}

        {/* Sticky Action Footer: ALWAYS accessible on short landscape viewports */}
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
              className="font-btn flex-1 min-h-[48px] flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold text-xs transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('CHƠI LẠI', 'RETRY')}</span>
            </button>
          ) : null}

          <button
            type="button"
            data-testid={isTrialMode ? 'trial-return-login-btn' : 'gameover-quit-menu-btn'}
            disabled={isReturningToLobby}
            onClick={onQuitToMenu}
            className={`font-btn flex-1 min-h-[48px] flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded font-bold text-xs transition-all active:scale-95 cursor-pointer ${
              isTrialMode
                ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold shadow-lg shadow-[#FFB800]/20'
                : 'bg-[#0b0d1e] hover:bg-neutral-800 text-[#EAF4FF] border border-[#687386]/50'
            }`}
          >
            <Home className="w-4 h-4" />
            <span>{isTrialMode ? t('Quay về màn hình đăng nhập', 'Return to Login') : t('THOÁT VỀ TRANG CHỦ', 'EXIT TO HOME')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
