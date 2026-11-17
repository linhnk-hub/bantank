/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trophy, Award, RotateCcw, Home, Clock, Heart, Users, Loader2, ShieldCheck } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { getStartingLivesForDifficultyAndMode } from '../core/constants.ts';
import {
  CoopOnlineManager,
  type CoopPlayerRole,
  type CoopPostStageReadyState,
} from '../core/coopOnlineManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { getCampaignStageSpec, TOTAL_CAMPAIGN_STAGES } from '../core/campaignStages.ts';
import { useLanguage } from '../core/i18n.ts';

interface StageClearModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onNextStageOrReplay: () => void;
  onQuitToMenu: () => void;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
  isTrialMode?: boolean;
  localOnlineRole?: CoopPlayerRole;
  postStageReady?: CoopPostStageReadyState | null;
  onTogglePostStageReady?: () => void;
  hasTeammateLeft?: boolean;
}

export const StageClearModal: React.FC<StageClearModalProps> = ({
  isOpen,
  state,
  onNextStageOrReplay,
  onQuitToMenu,
  onReturnToLobby,
  isReturningToLobby = false,
  returnToLobbyError = null,
  isTrialMode = false,
  localOnlineRole,
  postStageReady = null,
  onTogglePostStageReady,
  hasTeammateLeft = false,
}) => {
  const { t } = useLanguage();

  if (!isOpen || !state) return null;

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
  const isNewRecord = localTotalScore >= state.highScore && localTotalScore > 0;
  const elapsedMinutes = Math.floor(state.stageElapsedSeconds / 60);
  const elapsedSeconds = Math.floor(state.stageElapsedSeconds % 60);
  const timeFormatted = `${elapsedMinutes}m ${elapsedSeconds.toString().padStart(2, '0')}s`;

  const currentStageId = state.currentStageId ?? 1;
  const stageName = state.currentStageName || getCampaignStageSpec(currentStageId).name;
  const isFinalCampaignStage = currentStageId >= TOTAL_CAMPAIGN_STAGES;

  const showCoopPostStageReady = Boolean(
    isCoopOnline && !isFinalCampaignStage && onTogglePostStageReady && !hasTeammateLeft
  );
  const isMatchingReadyStage = Boolean(
    postStageReady &&
      postStageReady.stageId === currentStageId &&
      postStageReady.stageRunSeq === state.stageRunSeq
  );
  const p1PostReady = isMatchingReadyStage ? Boolean(postStageReady?.hostReady) : false;
  const p2PostReady = isMatchingReadyStage ? Boolean(postStageReady?.guestReady) : false;
  const myPostReady = isOnlineGuest ? p2PostReady : p1PostReady;
  const localPlayerTag = isOnlineGuest ? 'P2' : 'P1';

  // Milestone 7.4 Campaign Stage 10 Completion Reference: HOÀN THÀNH TOÀN BỘ CHIẾN DỊCH 10 STAGE!
  const finalCampaignBannerText = t(
    'HOÀN THÀNH TOÀN BỘ 10 STAGE!',
    'ALL 10 CAMPAIGN STAGES COMPLETED!'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#050510]/88 backdrop-blur-md pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2 sm:px-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#0b0d1e] border-2 border-[#FFB800] rounded-lg max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col shadow-[0_0_32px_rgba(255,184,0,0.22)] overflow-hidden">
        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 sm:space-y-4 scrollbar-thin">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/40 mb-0.5">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h2 className="font-btn text-xl sm:text-2xl font-black tracking-wider text-[#FFB800] uppercase">
              {isFinalCampaignStage
                ? t('CHINH PHỤC CHIẾN DỊCH!', 'CAMPAIGN CONQUERED!')
                : t('CHIẾN THẮNG MÀN CHƠI!', 'STAGE CLEAR!')}
            </h2>
            <p className="font-hud text-sm sm:text-base text-[#00F0FF] font-bold tracking-wide">
              STAGE {currentStageId} / {TOTAL_CAMPAIGN_STAGES} • {stageName}
            </p>
            {isFinalCampaignStage && (
              <div className="font-btn inline-block px-2.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[10px] font-extrabold">
                {finalCampaignBannerText}
              </div>
            )}
          </div>

          {/* Score & Record Display */}
          <div className="bg-[#050510] border border-[#FFB800]/30 rounded-lg p-3 text-center space-y-1">
            <div className="font-btn text-[11px] text-neutral-400 font-medium">
              {isCoop
                ? t(`TỔNG XP CỦA BẠN (${localPlayerTag})`, `YOUR TOTAL XP (${localPlayerTag})`)
                : t('TỔNG XP TÍCH LŨY', 'TOTAL ACCUMULATED XP')}
            </div>
            <div className="font-hud text-3xl sm:text-4xl font-black text-[#FFB800] tracking-tight">
              {localTotalScore.toLocaleString()} XP
            </div>
            <div className="font-hud flex items-center justify-center gap-1.5 pt-0.5 text-sm">
              <Award className="w-3.5 h-3.5 text-[#FFB800]" />
              <span className="text-neutral-400">High XP:</span>
              <span className="font-bold text-[#EAF4FF]">{state.highScore.toLocaleString()} XP</span>
              {isNewRecord && (
                <span className="font-btn px-1.5 py-0.2 rounded bg-[#FFB800] text-[#050510] font-extrabold text-[10px] animate-pulse">
                  {t('KỶ LỤC MỚI!', 'NEW RECORD!')}
                </span>
              )}
            </div>
          </div>

          {/* Breakdown by Enemy Tier */}
          <div className="bg-[#050510]/85 border border-[#00F0FF]/25 rounded-lg p-3 space-y-2 text-xs">
            <div className="font-btn font-bold text-[#EAF4FF] pb-1 border-b border-neutral-800 flex justify-between items-center">
              <span>
                {isCoop
                  ? t(`THÀNH TÍCH CỦA BẠN (${localPlayerTag})`, `YOUR STATS (${localPlayerTag})`)
                  : t('BẢNG TỔNG KẾT CHIẾN DỊCH', 'STAGE COMBAT SUMMARY')}
              </span>
              <div className="font-hud flex items-center gap-1 text-sm text-[#00F0FF]">
                <Clock className="w-3.5 h-3.5 text-[#00F0FF]" />
                <span>{timeFormatted}</span>
              </div>
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

              <div className="pt-1.5 border-t border-neutral-800/80 flex items-center justify-between font-bold text-emerald-400">
                <span>
                  {isCoop
                    ? t(`Đã tiêu diệt (${localPlayerTag}):`, `Defeated (${localPlayerTag}):`)
                    : t('Đã tiêu diệt:', 'Total Defeated:')}
                </span>
                <span className="font-hud text-sm">
                  {isCoop
                    ? t(
                        `${totalDefeated} xe (Toàn đội: ${state.totalDefeatedEnemies}/30)`,
                        `${totalDefeated} tanks (Team: ${state.totalDefeatedEnemies}/30)`
                      )
                    : t(`${totalDefeated} / 30 xe (Toàn bộ)`, `${totalDefeated} / 30 tanks (All)`)}
                </span>
              </div>

              <div
                data-testid="stageclear-lives-stat"
                className="flex items-center justify-between text-[11px] text-neutral-300 pt-0.5"
              >
                <span className="flex items-center gap-1 text-[#FF0055]">
                  <Heart className="w-3 h-3 fill-[#FF0055]" />
                  {t('Số mạng còn lại:', 'Remaining lives:')}
                </span>
                <span className="font-hud text-sm font-bold text-white">
                  {livesLeft} {t('mạng', 'lives')}
                </span>
              </div>

              {teammateState && (
                <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
                  <span>{teammateLabel}</span>
                  <span className="font-hud text-sm">{teammateLivesLeft} {t('mạng', 'lives')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {showCoopPostStageReady && (
          <div
            data-testid="stageclear-coop-ready-panel"
            className="mx-3 sm:mx-4 mb-2 p-2.5 rounded-lg bg-[#050510]/90 border border-emerald-500/35 space-y-1.5"
          >
            <div className="text-[11px] font-bold text-emerald-300 text-center">
              {t(
                `Sẵn sàng chơi tiếp Stage ${currentStageId + 1} (cả 2 cùng sẵn sàng sẽ tự động vào màn)`,
                `Ready for Stage ${currentStageId + 1} (auto-starts when both players are ready)`
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div
                className={`px-2 py-1 rounded border flex items-center justify-between ${
                  p1PostReady
                    ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <span>P1:</span>
                <span>{p1PostReady ? t('Đã sẵn sàng', 'Ready') : t('Chưa sẵn sàng', 'Not ready')}</span>
              </div>
              <div
                className={`px-2 py-1 rounded border flex items-center justify-between ${
                  p2PostReady
                    ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
              >
                <span>P2:</span>
                <span>{p2PostReady ? t('Đã sẵn sàng', 'Ready') : t('Chưa sẵn sàng', 'Not ready')}</span>
              </div>
            </div>
          </div>
        )}

        {returnToLobbyError && isCoopOnline && (
          <div className="mx-4 mb-2 p-2.5 rounded bg-red-950/75 border border-[#FF0055]/40 text-red-200 text-[11px] font-medium text-center whitespace-pre-line">
            {formatSentenceLineBreaks(returnToLobbyError)}
          </div>
        )}

        {/* Sticky Action Footer: ALWAYS accessible */}
        <div className="p-3 sm:p-4 bg-[#050510]/95 border-t border-neutral-800 flex flex-wrap gap-2 shrink-0 safe-area-inset">
          {showCoopPostStageReady && (
            <button
              type="button"
              data-testid="stageclear-next-ready-btn"
              disabled={isReturningToLobby}
              onClick={onTogglePostStageReady}
              className={`font-btn flex-1 min-w-[115px] min-h-[48px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 px-3 rounded font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-lg active:scale-95 disabled:opacity-60 cursor-pointer ${
                myPostReady
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-[#FFB800] border border-[#FFB800]/50'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>{myPostReady ? t('HỦY SẴN SÀNG', 'CANCEL READY') : t('SẴN SÀNG', 'READY')}</span>
            </button>
          )}

          {isCoopOnline && onReturnToLobby ? (
            <button
              type="button"
              data-testid="stageclear-return-lobby-btn"
              disabled={isReturningToLobby}
              onClick={onReturnToLobby}
              className="font-btn flex-1 min-w-[115px] min-h-[48px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 px-3 rounded bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-lg shadow-[#00F0FF]/20 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {isReturningToLobby ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <Users className="w-4 h-4 shrink-0" />
              )}
              <span>{isReturningToLobby ? t('ĐANG VÀO...', 'ENTERING...') : t('VỀ PHÒNG CHỜ', 'TO LOBBY')}</span>
            </button>
          ) : !isTrialMode ? (
            <button
              type="button"
              data-testid="stageclear-next-btn"
              onClick={onNextStageOrReplay}
              className="font-btn flex-1 min-h-[48px] flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold text-xs whitespace-nowrap shrink-0 transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
              <span>
                {!isFinalCampaignStage
                  ? t(`TIẾP TỤC STAGE ${currentStageId + 1}`, `NEXT STAGE ${currentStageId + 1}`)
                  : t('CHƠI LẠI STAGE 10', 'REPLAY STAGE 10')}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            data-testid={isTrialMode ? 'trial-return-login-btn' : 'stageclear-quit-menu-btn'}
            disabled={isReturningToLobby}
            onClick={onQuitToMenu}
            className={`font-btn flex-1 min-w-[100px] min-h-[48px] flex items-center justify-center gap-1.5 py-2.5 sm:py-3 px-3 rounded font-bold text-xs whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer ${
              isTrialMode
                ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold shadow-lg shadow-[#FFB800]/20'
                : 'bg-[#0b0d1e] hover:bg-neutral-800 text-[#EAF4FF] border border-[#687386]/50'
            }`}
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>{isTrialMode ? t('Quay về màn hình đăng nhập', 'Return to Login') : t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
