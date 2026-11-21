/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

interface PauseModalProps {
  isOpen: boolean;
  onResume: () => void;
  onRestart: () => void;
  onQuitToMenu: () => void;
  isTrialMode?: boolean;
  belowHeader?: boolean;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  onResume,
  onRestart,
  onQuitToMenu,
  isTrialMode = false,
  belowHeader = false,
}) => {
  const { t } = useLanguage();
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      data-testid="pause-modal-overlay"
      className={`fixed inset-0 ${
        belowHeader ? 'z-[35] pt-14 sm:pt-16' : 'z-50 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6'
      } flex items-start justify-center overflow-y-auto bg-[#050510]/90 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 select-none animate-neo-fade-in`}
    >
      <div className="bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-lg max-w-sm w-full max-h-[calc(100dvh-4rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl text-center space-y-4 sm:space-y-5 scrollbar-thin">
        {!showQuitConfirm ? (
          <>
            <div>
              <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded bg-[#FFB800]/15 text-[#FFB800] border border-[#FFB800]/40 mb-2">
                <span className="font-hud font-black text-xl sm:text-2xl">||</span>
              </div>
              <h3 className="font-btn text-base sm:text-lg font-black tracking-wide text-[#EAF4FF] uppercase">
                {t('Tạm dừng chiến đấu', 'Battle Paused')}
              </h3>
            </div>

            <div className="space-y-2 sm:space-y-2.5">
              <button
                type="button"
                onClick={onResume}
                className="font-btn w-full min-h-[48px] flex items-center justify-center py-2.5 sm:py-3 px-4 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-extrabold text-xs sm:text-sm transition-all shadow-lg shadow-[#FFB800]/20 active:scale-95 cursor-pointer"
              >
                <span>{t('TIẾP TỤC', 'RESUME')}</span>
              </button>

              {!isTrialMode && (
                <button
                  type="button"
                  onClick={onRestart}
                  className="font-btn w-full min-h-[48px] flex items-center justify-center py-2 sm:py-2.5 px-4 rounded bg-[#050510] hover:bg-neutral-800 text-[#EAF4FF] font-bold text-xs transition-colors border border-[#00F0FF]/40 active:scale-95 cursor-pointer"
                >
                  <span>{t('CHƠI LẠI MÀN NÀY', 'RESTART STAGE')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => (isTrialMode ? onQuitToMenu() : setShowQuitConfirm(true))}
                className="font-btn w-full min-h-[48px] flex items-center justify-center py-2 sm:py-2.5 px-4 rounded bg-red-950/40 hover:bg-red-900/50 text-red-300 font-semibold text-xs transition-colors border border-[#FF0055]/40 active:scale-95 cursor-pointer"
              >
                <span>{t('VỀ TRANG CHỦ', 'RETURN HOME')}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded bg-[#FF0055]/15 text-[#FF0055] border border-[#FF0055]/40">
              <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h4 className="font-btn text-sm font-bold text-[#EAF4FF]">{t('Xác nhận thoát', 'Confirm Exit')}</h4>
              <p className="text-xs text-neutral-300 mt-1 whitespace-pre-line">
                {formatSentenceLineBreaks(
                  t(
                    'Bạn có chắc chắn muốn thoát trận đấu?. Dữ liệu sẽ không được ghi nhận.',
                    'Are you sure you want to leave the battle?. Match progress will not be saved.'
                  )
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowQuitConfirm(false)}
                className="font-btn flex-1 min-h-[48px] py-2 sm:py-2.5 px-3 rounded bg-[#050510] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 font-bold text-xs transition-colors active:scale-95 cursor-pointer"
              >
                {t('TIẾP TỤC CHƠI', 'KEEP PLAYING')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQuitConfirm(false);
                  onQuitToMenu();
                }}
                className="font-btn flex-1 min-h-[48px] py-2 sm:py-2.5 px-3 rounded bg-[#FF0055] hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow-lg shadow-[#FF0055]/30 active:scale-95 cursor-pointer"
              >
                {t('VỀ TRANG CHỦ', 'RETURN HOME')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
