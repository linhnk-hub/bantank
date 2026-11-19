/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Award, Home, LogOut, RotateCcw, ShieldAlert, Star } from 'lucide-react';
import type { GameCoreState } from '../core/types.ts';
import { TOTAL_CAMPAIGN_STAGES } from '../core/campaignStages.ts';
import { AuthManager } from '../core/authManager.ts';
import {
  PlayerLevelManager,
  type PlayerLevelProgressInfo,
} from '../core/playerLevelSystem.ts';
import { useLanguage } from '../core/i18n.ts';

export interface GameOverModalProps {
  isOpen: boolean;
  state: GameCoreState | null;
  onRestart: () => void;
  onQuitToMenu: () => void;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
  returnToLobbyError?: string | null;
  isTrialMode?: boolean;
  localOnlineRole?: 'HOST' | 'GUEST' | null;
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
  localOnlineRole = null,
}) => {
  const { lang, t } = useLanguage();
  const levelMgr = PlayerLevelManager.getInstance();
  const uid = AuthManager.getInstance().getCurrentUser()?.uid ?? null;

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
  const isCoopOnline = state.gameMode === 'TWO_PLAYERS_ONLINE';
  const isTwoPlayers =
    state.gameMode === 'TWO_PLAYERS_AI' || state.gameMode === 'TWO_PLAYERS_ONLINE';
  const isOnlineGuest = isCoopOnline && localOnlineRole === 'GUEST';

  const p1Score = state.p1Stats?.score ?? state.score ?? 0;
  const p2Score = state.p2Stats?.score ?? 0;
  const stageTotalXp =
    (state.p1Stats?.stageScore ?? state.score ?? 0) + (state.p2Stats?.stageScore ?? 0);

  const reasonText = state.gameOverReason
    ? state.gameOverReason
    : state.isTimeoutGameOver
      ? t('HẾT THỜI GIAN — CĂN CỨ THẤT THỦ', 'TIME EXPIRED — BASE OVERRUN')
      : state.terrain?.isBaseDestroyed
        ? t('CĂN CỨ ĐẠI BÀNG ĐÃ BỊ PHÁ HỦY', 'EAGLE BASE DESTROYED')
        : t('TOÀN BỘ CHIẾN XA ĐÃ BỊ HẠ', 'ALL BATTLE TANKS DESTROYED');

  const rankLabel =
    levelProgress.xpVerificationStatus === 'VERIFIED'
      ? lang === 'en'
        ? levelProgress.rankNameEn
        : levelProgress.rankNameVi
      : t('Chưa xác minh', 'Unverified');

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#050510]/92 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#0b0d1e] border-2 border-[#FF0055]/80 rounded-xl p-5 sm:p-6 shadow-2xl text-[#EAF4FF] my-auto">
        {/* Header */}
        <div className="text-center border-b border-neutral-800 pb-4 mb-4">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-[#FF0055]/15 text-[#FF0055] border border-[#FF0055]/40 mb-2">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="font-hud text-xs font-bold tracking-widest uppercase text-[#FF0055]">
            {reasonText}
          </div>
          <h2 className="font-btn text-3xl font-black text-[#FF0055] mt-1 uppercase tracking-wider">
            {t('THẤT BẠI', 'GAME OVER')}
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            {t('Dừng chân tại Màn', 'Reached Stage')} {stageId}/{TOTAL_CAMPAIGN_STAGES}: {stageName}
          </p>
        </div>

        {/* Scores & Progression Summary (Hidden High Score XP in Trial Mode) */}
        <div className="bg-[#050510]/90 border border-neutral-800 rounded-xl p-4 mb-5 space-y-2.5 text-xs sm:text-sm">
          <div className="flex justify-between items-center">
            <span className="text-neutral-400">
              {t('XP Người chơi 1 (P1):', 'Player 1 (P1) XP:')}
            </span>
            <span className="font-hud font-bold text-[#FFB800]">{p1Score} XP</span>
          </div>

          {isTwoPlayers && state.p2Stats && (
            <div className="flex justify-between items-center">
              <span className="text-neutral-400">
                {state.gameMode === 'TWO_PLAYERS_AI'
                  ? t('XP Đồng đội A.I (P2):', 'Ally A.I (P2) XP:')
                  : t('XP Đồng đội Online (P2):', 'Online Co-op (P2) XP:')}
              </span>
              <span className="font-hud font-bold text-[#00F0FF]">{p2Score} XP</span>
            </div>
          )}

          {!isTrialMode && (
            <>
              <div className="flex justify-between items-center text-xs">
                <span className="text-neutral-400">
                  {t('XP tiêu diệt địch màn này:', 'Stage Combat XP:')}
                </span>
                <span className="font-hud font-bold text-neutral-200">+{stageTotalXp} XP</span>
              </div>

              <div className="border-t border-neutral-800 pt-2.5 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#0b0d1e] border border-neutral-800 rounded-lg p-2.5">
                  <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-300 fill-yellow-300" />
                    <span>{t('Tổng Sao hiện có', 'Total Stars')}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="font-hud font-black text-yellow-300 text-sm">
                      {levelProgress.starBalance} ⭐
                    </span>
                    <span className="text-[10px] font-hud text-neutral-400">
                      {levelProgress.unconvertedXp}/25 XP
                    </span>
                  </div>
                </div>

                <div className="bg-[#0b0d1e] border border-neutral-800 rounded-lg p-2.5">
                  <div className="text-[10px] uppercase font-bold text-neutral-400 flex items-center gap-1">
                    <Award className="w-3 h-3 text-[#FFB800]" />
                    <span>{t('Quân hàm', 'Rank')}</span>
                  </div>
                  <div className="mt-1 font-btn font-black text-[#FFB800] text-sm truncate">
                    {rankLabel}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {returnToLobbyError && (
          <div className="mb-3 p-2.5 rounded-lg bg-red-950/60 border border-[#FF0055]/40 text-red-300 text-xs text-center">
            {returnToLobbyError}
          </div>
        )}

        {/* Action Buttons */}
        {isTrialMode ? (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={onRestart}
              className="font-btn w-full min-h-[48px] py-3 px-5 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('CHƠI THỬ', 'TRY DEMO')}</span>
            </button>
            <button
              type="button"
              onClick={onQuitToMenu}
              className="font-btn w-full min-h-[46px] py-2.5 px-5 rounded-lg bg-[#050510] hover:bg-neutral-800 text-[#EAF4FF] border border-neutral-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {isOnlineGuest ? (
              <div className="w-full py-3 px-4 rounded-lg bg-[#050510] border border-neutral-700 text-[#FFB800] font-bold text-xs text-center">
                {t(
                  'Đang chờ Chủ phòng (P1) khởi động lại màn chơi...',
                  'Waiting for Room Host (P1) to restart...'
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onRestart}
                className="font-btn w-full min-h-[48px] py-3 px-5 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('CHƠI LẠI', 'PLAY AGAIN')}</span>
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
              className="font-btn w-full min-h-[46px] py-2.5 px-5 rounded-lg bg-[#050510] hover:bg-neutral-800 text-neutral-300 border border-neutral-700 font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
