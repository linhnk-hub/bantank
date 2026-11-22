/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Trophy } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import type { CoopPostStageReadyState } from '../core/coopOnlineManager.ts';
import { SCORE_VALUES } from '../core/scoreManager.ts';
import { TOTAL_CAMPAIGN_STAGES } from '../core/campaignStages.ts';
import { getStartingLivesForDifficultyAndMode } from '../core/constants.ts';
import { AuthManager } from '../core/authManager.ts';
import {
  PlayerLevelManager,
  calculateStageAchievementBonus,
  type PlayerLevelProgressInfo,
} from '../core/playerLevelSystem.ts';
import { useLanguage } from '../core/i18n.ts';

export interface StageClearModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onNextStageOrReplay: () => void;
  onQuitToMenu: () => void;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
  isTrialMode?: boolean;
  localOnlineRole?: 'HOST' | 'GUEST' | null;
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
  localOnlineRole = null,
  postStageReady = null,
  onTogglePostStageReady,
  hasTeammateLeft = false,
}) => {
  const { lang, t } = useLanguage();
  const levelMgr = PlayerLevelManager.getInstance();
  const currentUser = AuthManager.getInstance().getCurrentUser();
  const uid = currentUser?.uid ?? null;

  const [levelProgress, setLevelProgress] = useState<PlayerLevelProgressInfo>(() =>
    levelMgr.getLevelProgressForUid(uid)
  );

  useEffect(() => {
    const sync = () => {
      const latestUid = AuthManager.getInstance().getCurrentUser()?.uid ?? null;
      setLevelProgress(levelMgr.getLevelProgressForUid(latestUid));
    };
    sync();
    return levelMgr.subscribeExternalSync(sync);
  }, [levelMgr, isOpen, state?.tickCount]);

  if (!isOpen || !state) return null;

  const stageId = state.currentStageId ?? 1;
  const stageName = state.currentStageName || `Stage ${stageId}`;
  const isFinalStage = stageId >= TOTAL_CAMPAIGN_STAGES;
  const isCoopOnline = state.gameMode === 'TWO_PLAYERS_ONLINE';
  const isTwoPlayers =
    state.gameMode === 'TWO_PLAYERS_AI' || state.gameMode === 'TWO_PLAYERS_ONLINE';
  const isOnlineGuest = isCoopOnline && localOnlineRole === 'GUEST';

  const p1Counts = state.p1Stats?.defeatedCounts ?? state.defeatedCounts ?? {
    BASIC: 0,
    FAST: 0,
    POWER: 0,
    ARMOR: 0,
  };
  const p2Counts = state.p2Stats?.defeatedCounts ?? {
    BASIC: 0,
    FAST: 0,
    POWER: 0,
    ARMOR: 0,
  };

  const p1StageXp =
    state.p1Stats?.stageScore ??
    p1Counts.BASIC * SCORE_VALUES.BASIC +
      p1Counts.FAST * SCORE_VALUES.FAST +
      p1Counts.POWER * SCORE_VALUES.POWER +
      p1Counts.ARMOR * SCORE_VALUES.ARMOR;
  const p2StageXp =
    state.p2Stats?.stageScore ??
    p2Counts.BASIC * SCORE_VALUES.BASIC +
      p2Counts.FAST * SCORE_VALUES.FAST +
      p2Counts.POWER * SCORE_VALUES.POWER +
      p2Counts.ARMOR * SCORE_VALUES.ARMOR;

  const localStageXp = isOnlineGuest ? p2StageXp : p1StageXp;
  const startingLives = getStartingLivesForDifficultyAndMode(
    state.difficulty ?? 'DEFAULT',
    state.gameMode ?? 'SOLO'
  );
  const localRemainingLives = isOnlineGuest
    ? (state.p2State?.lives ?? startingLives)
    : (state.p1State?.lives ?? startingLives);
  const localLivesLost = Math.max(0, startingLives - localRemainingLives);

  const achievementBonus = calculateStageAchievementBonus({
    isStageClear: true,
    livesLost: localLivesLost,
    stageElapsedSeconds: state.stageElapsedSeconds ?? 0,
    matchDurationSeconds: state.matchDurationSeconds ?? 120,
  });

  const rows = [
    {
      label: t('Tank Thường (Basic)', 'Basic Tank'),
      unitXp: SCORE_VALUES.BASIC,
      p1Count: p1Counts.BASIC,
      p2Count: p2Counts.BASIC,
      color: 'text-slate-100',
    },
    {
      label: t('Tank Nhanh (Fast)', 'Fast Tank'),
      unitXp: SCORE_VALUES.FAST,
      p1Count: p1Counts.FAST,
      p2Count: p2Counts.FAST,
      color: 'text-sky-300',
    },
    {
      label: t('Tank Hỏa Lực (Power)', 'Power Tank'),
      unitXp: SCORE_VALUES.POWER,
      p1Count: p1Counts.POWER,
      p2Count: p2Counts.POWER,
      color: 'text-emerald-300',
    },
    {
      label: t('Tank Thiết Giáp (Armor)', 'Armor Tank'),
      unitXp: SCORE_VALUES.ARMOR,
      p1Count: p1Counts.ARMOR,
      p2Count: p2Counts.ARMOR,
      color: 'text-amber-500',
    },
  ];

  const hasMatchingPostStageReady = Boolean(
    postStageReady &&
      postStageReady.stageId === stageId &&
      postStageReady.stageRunSeq === state.stageRunSeq
  );
  const hostReady = hasMatchingPostStageReady ? Boolean(postStageReady?.hostReady) : false;
  const guestReady = hasMatchingPostStageReady ? Boolean(postStageReady?.guestReady) : false;
  const localReady = isOnlineGuest ? guestReady : hostReady;

  const rankLabel =
    levelProgress.xpVerificationStatus === 'VERIFIED'
      ? lang === 'en'
        ? levelProgress.rankNameEn
        : levelProgress.rankNameVi
      : t('Chưa xác minh', 'Unverified');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#050510]/90 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#0b0d1e] border-2 border-[#FFB800]/80 rounded-xl p-5 sm:p-6 shadow-2xl text-[#EAF4FF] my-auto">
        {/* Header */}
        <div className="text-center border-b border-neutral-800 pb-4 mb-4">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/40 mb-2">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="font-hud text-xs font-bold tracking-widest uppercase text-[#FFB800]">
            {isFinalStage
              ? t(
                  'HOÀN THÀNH TOÀN BỘ CHIẾN DỊCH 10 STAGE',
                  `COMPLETED ALL ${TOTAL_CAMPAIGN_STAGES} CAMPAIGN STAGES`
                )
              : t('HOÀN THÀNH NHIỆM VỤ', 'MISSION ACCOMPLISHED')}
          </div>
          <h2 className="font-btn text-2xl sm:text-3xl font-black text-[#EAF4FF] mt-1 uppercase tracking-wide">
            {isFinalStage
              ? t('CHIẾN THẮNG', 'VICTORY')
              : `${t('QUA MÀN', 'STAGE CLEAR')} ${stageId}: ${stageName}`}
          </h2>
        </div>

        {/* Enemy Breakdown Table */}
        <div className="bg-[#050510]/90 border border-neutral-800 rounded-xl p-3.5 sm:p-4 mb-4">
          <div className="grid grid-cols-12 text-xs font-bold uppercase text-neutral-400 border-b border-neutral-800 pb-2 mb-2">
            <div className="col-span-6">{t('Loại Xe Địch', 'Enemy Type')}</div>
            <div className="col-span-3 text-right text-red-400">{t('P1 Diệt', 'P1 Kills')}</div>
            {isTwoPlayers && (
              <div className="col-span-3 text-right text-[#00F0FF]">
                {state.gameMode === 'TWO_PLAYERS_AI'
                  ? t('A.I Diệt', 'A.I Kills')
                  : t('P2 Diệt', 'P2 Kills')}
              </div>
            )}
          </div>

          <div className="space-y-2 text-xs sm:text-sm">
            {rows.map((r) => (
              <div key={r.label} className="grid grid-cols-12 items-center">
                <div className={`col-span-6 font-semibold ${r.color}`}>
                  {r.label}{' '}
                  <span className="text-[11px] text-neutral-500 font-hud">({r.unitXp} XP)</span>
                </div>
                <div className="col-span-3 text-right font-hud">
                  <span className="text-neutral-200">{r.p1Count}</span>
                  <span className="text-neutral-500 text-[11px] ml-1">
                    ({r.p1Count * r.unitXp} XP)
                  </span>
                </div>
                {isTwoPlayers && (
                  <div className="col-span-3 text-right font-hud">
                    <span className="text-neutral-200">{r.p2Count}</span>
                    <span className="text-neutral-500 text-[11px] ml-1">
                      ({r.p2Count * r.unitXp} XP)
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800 mt-3 pt-3 grid grid-cols-12 items-center text-xs sm:text-sm font-bold">
            <div className="col-span-6 text-neutral-300">
              {t('XP Tiêu Diệt Địch', 'Enemy Kill XP')}
            </div>
            <div className="col-span-3 text-right font-hud text-[#FFB800]">
              +{p1StageXp} XP
            </div>
            {isTwoPlayers && (
              <div className="col-span-3 text-right font-hud text-[#00F0FF]">
                +{p2StageXp} XP
              </div>
            )}
          </div>
        </div>

        {/* Achievement Bonus, Stars & Military Rank (Hidden high-score/rank persistence details in Trial Mode) */}
        {!isTrialMode && (
          <div className="bg-[#050510]/90 border border-[#FFB800]/30 rounded-xl p-3.5 sm:p-4 mb-4 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-neutral-400 font-semibold">
                {t('XP tiêu diệt địch:', 'Combat Kill XP:')}
              </span>
              <span className="font-hud font-bold text-[#EAF4FF]">+{localStageXp} XP</span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-neutral-400 font-semibold">
                  {t('XP thưởng thành tích màn:', 'Stage Achievement Bonus XP:')}
                </div>
                <div className="text-[11px] text-amber-300/90 mt-0.5">
                  {lang === 'en' ? achievementBonus.labelEn : achievementBonus.labelVi}
                </div>
              </div>
              <span
                className={`font-hud font-black shrink-0 ${
                  achievementBonus.bonusXp > 0 ? 'text-emerald-400' : 'text-neutral-400'
                }`}
              >
                +{achievementBonus.bonusXp} XP
              </span>
            </div>

            <div className="border-t border-neutral-800 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-[#0b0d1e] border border-neutral-800 rounded-lg p-2.5">
                <div className="text-[10px] uppercase font-bold text-neutral-400">
                  <span>{t('Tổng Sao hiện có', 'Total Stars')}</span>
                </div>
                <div className="mt-1 flex items-baseline">
                  <span className="text-yellow-300 font-black font-hud text-sm">
                    {levelProgress.starBalance} ⭐
                  </span>
                </div>
              </div>

              <div className="bg-[#0b0d1e] border border-neutral-800 rounded-lg p-2.5">
                <div className="text-[10px] uppercase font-bold text-neutral-400">
                  <span>{t('Quân hàm hiện tại', 'Military Rank')}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-[#FFB800] font-btn font-black text-sm truncate">
                    {rankLabel}
                  </span>
                  <span className="text-[11px] font-hud text-neutral-400 shrink-0">
                    {levelProgress.xpVerificationStatus === 'VERIFIED' &&
                    levelProgress.totalXp !== null
                      ? `${levelProgress.totalXp} XP`
                      : '--'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Co-op Online Post-Stage Ready Sync Panel */}
        {isCoopOnline && !isFinalStage && !hasTeammateLeft && (
          <div
            data-testid="stageclear-coop-ready-panel"
            className="mb-4 p-3.5 rounded-xl bg-[#050510]/90 border border-[#00F0FF]/35 space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#00F0FF] uppercase">
                {t('Đồng bộ qua màn Co-op Online', 'Co-op Online Stage Sync')}
              </span>
              <span className="text-neutral-400">
                P1: {hostReady ? t('Sẵn sàng', 'Ready') : t('Đang chờ', 'Waiting')} • P2:{' '}
                {guestReady ? t('Sẵn sàng', 'Ready') : t('Đang chờ', 'Waiting')}
              </span>
            </div>
            {onTogglePostStageReady && (
              <button
                type="button"
                onClick={onTogglePostStageReady}
                className={`font-btn w-full min-h-[44px] py-2.5 px-4 rounded-lg font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  localReady
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-[#050510]'
                    : 'bg-[#00F0FF] hover:bg-cyan-300 text-[#050510]'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {localReady
                    ? t('ĐÃ SẴN SÀNG MÀN TIẾP THEO', 'READY FOR NEXT STAGE')
                    : t('SẴN SÀNG MÀN TIẾP THEO', 'READY FOR NEXT STAGE')}
                </span>
              </button>
            )}
          </div>
        )}

        {returnToLobbyError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-950/60 border border-[#FF0055]/40 text-red-300 text-xs text-center">
            {returnToLobbyError}
          </div>
        )}

        {/* Action Buttons */}
        {isTrialMode ? (
          <div className="space-y-2.5">
            <div className="w-full py-2.5 px-4 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center leading-relaxed">
              {t(
                'Bạn đã hoàn thành Màn 1 Chơi thử! Đăng nhập để chơi toàn bộ chiến dịch và lưu tiến độ Quân hàm.',
                'You cleared Demo Stage 1! Sign in to play the full campaign and save your Military Rank.'
              )}
            </div>
            <button
              type="button"
              onClick={onNextStageOrReplay}
              className="font-btn w-full min-h-[48px] py-3 px-5 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#FFB800]/25 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('CHƠI THỬ', 'TRY DEMO')}</span>
            </button>
            <button
              type="button"
              onClick={onQuitToMenu}
              className="font-btn w-full min-h-[46px] py-2.5 px-5 rounded-lg bg-[#050510] hover:bg-neutral-800 text-[#EAF4FF] border border-neutral-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {(!isCoopOnline || isFinalStage || !isOnlineGuest) && (
              <button
                type="button"
                onClick={onNextStageOrReplay}
                className="font-btn w-full min-h-[48px] py-3 px-5 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#FFB800]/25 active:scale-95 cursor-pointer"
              >
                {isFinalStage
                  ? t('CHƠI LẠI TỪ MÀN 1', 'PLAY AGAIN FROM STAGE 1')
                  : t('TIẾP TỤC MÀN TIẾP THEO →', 'NEXT STAGE →')}
              </button>
            )}

            {isCoopOnline && onReturnToLobby && (
              <button
                type="button"
                onClick={onReturnToLobby}
                disabled={isReturningToLobby}
                className="font-btn w-full min-h-[46px] py-2.5 px-5 rounded-lg bg-[#050510] hover:bg-neutral-800 text-[#00F0FF] border border-[#00F0FF]/40 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isReturningToLobby
                  ? t('Đang về phòng Co-op...', 'Returning to Lobby...')
                  : t('VỀ PHÒNG CHỜ CO-OP', 'RETURN TO CO-OP LOBBY')}
              </button>
            )}

            <button
              type="button"
              onClick={onQuitToMenu}
              className="font-btn w-full min-h-[46px] py-2.5 px-5 rounded-lg bg-[#050510] hover:bg-neutral-800 text-neutral-300 border border-neutral-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
