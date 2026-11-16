/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

export interface ConfirmationPopupModalProps {
  isOpen: boolean;
  type?: 'success' | 'error' | 'info';
  title?: string;
  messages: string[];
  onClose: () => void;
}

export const ConfirmationPopupModal: React.FC<ConfirmationPopupModalProps> = ({
  isOpen,
  type = 'success',
  title,
  messages,
  onClose,
}) => {
  const { t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || messages.length === 0) return null;

  const defaultTitle =
    type === 'error'
      ? t('THÔNG BÁO LỖI THAO TÁC', 'OPERATION ERROR NOTICE')
      : type === 'info'
        ? t('THÔNG BÁO HỆ THỐNG', 'SYSTEM NOTICE')
        : t('XÁC NHẬN THAY ĐỔI THÀNH CÔNG', 'CHANGES SAVED SUCCESSFULLY');

  const borderClass =
    type === 'error'
      ? 'border-[#FF0055] shadow-[#FF0055]/30'
      : type === 'info'
        ? 'border-[#00F0FF] shadow-[#00F0FF]/30'
        : 'border-[#FFB800] shadow-[#FFB800]/30';

  const headerBgClass =
    type === 'error'
      ? 'bg-rose-950/85 border-rose-800/80 text-rose-200'
      : type === 'info'
        ? 'bg-sky-950/85 border-[#00F0FF]/40 text-sky-200'
        : 'bg-amber-950/85 border-[#FFB800]/40 text-amber-200';

  const buttonClass =
    type === 'error'
      ? 'bg-[#FF0055] hover:bg-rose-500 text-white'
      : type === 'info'
        ? 'bg-[#00F0FF] hover:bg-cyan-300 text-[#050510]'
        : 'bg-[#FFB800] hover:bg-amber-400 text-[#050510]';

  return (
    <div
      data-testid="confirmation-popup-modal"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#050510]/80 backdrop-blur-sm animate-fade-in select-none"
    >
      <div
        className={`w-full max-w-md rounded-lg bg-[#0b0d1e] border-2 ${borderClass} shadow-2xl overflow-hidden`}
      >
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${headerBgClass}`}
        >
          <div className="font-btn flex items-center gap-2 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
            {type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-[#FF0055] shrink-0" />
            ) : type === 'info' ? (
              <Info className="w-4 h-4 text-[#00F0FF] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#FFB800] shrink-0" />
            )}
            <span>{title || defaultTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Đóng thông báo', 'Close notice')}
            className="p-1 rounded bg-[#050510]/70 hover:bg-neutral-800 text-neutral-300 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 text-xs text-neutral-100 leading-relaxed max-h-64 overflow-y-auto">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              data-testid="confirmation-popup-message"
              className="p-3 rounded bg-[#050510]/90 border border-neutral-800 flex items-start gap-2.5"
            >
              {type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-[#FF0055] shrink-0 mt-0.5" />
              ) : type === 'info' ? (
                <Info className="w-4 h-4 text-[#00F0FF] shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <span className="break-words whitespace-pre-line">
                {formatSentenceLineBreaks(msg)}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-[#050510] border-t border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            data-testid="confirmation-popup-close-btn"
            onClick={onClose}
            className={`font-btn min-h-[44px] px-5 py-2 rounded font-extrabold text-xs shadow transition-all active:scale-95 cursor-pointer ${buttonClass}`}
          >
            {t('ĐÃ HIỂU / ĐÓNG', 'GOT IT / CLOSE')}
          </button>
        </div>
      </div>
    </div>
  );
};
