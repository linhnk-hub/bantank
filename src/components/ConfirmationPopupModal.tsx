/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';

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
      ? 'THÔNG BÁO LỖI THAO TÁC'
      : type === 'info'
        ? 'THÔNG BÁO HỆ THỐNG'
        : 'XÁC NHẬN THAY ĐỔI THÀNH CÔNG';

  const borderClass =
    type === 'error'
      ? 'border-rose-500/80 shadow-rose-950/60'
      : type === 'info'
        ? 'border-sky-500/80 shadow-sky-950/60'
        : 'border-emerald-500/80 shadow-emerald-950/60';

  const headerBgClass =
    type === 'error'
      ? 'bg-rose-950/80 border-rose-800/80 text-rose-200'
      : type === 'info'
        ? 'bg-sky-950/80 border-sky-800/80 text-sky-200'
        : 'bg-emerald-950/80 border-emerald-800/80 text-emerald-200';

  const buttonClass =
    type === 'error'
      ? 'bg-rose-500 hover:bg-rose-400 text-black'
      : type === 'info'
        ? 'bg-sky-500 hover:bg-sky-400 text-black'
        : 'bg-emerald-500 hover:bg-emerald-400 text-black';

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
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none"
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-neutral-900 border-2 ${borderClass} shadow-2xl overflow-hidden`}
      >
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-2 ${headerBgClass}`}
        >
          <div className="flex items-center gap-2 font-extrabold text-xs sm:text-sm uppercase tracking-wider">
            {type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : type === 'info' ? (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{title || defaultTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng thông báo"
            className="p-1 rounded-lg bg-neutral-900/70 hover:bg-neutral-800 text-neutral-300 hover:text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-2.5 text-xs text-neutral-100 leading-relaxed max-h-64 overflow-y-auto">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              data-testid="confirmation-popup-message"
              className="p-3 rounded-xl bg-neutral-950/90 border border-neutral-800 flex items-start gap-2.5"
            >
              {type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : type === 'info' ? (
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <span className="break-words whitespace-pre-line">
                {formatSentenceLineBreaks(msg)}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-neutral-950 border-t border-neutral-800 flex items-center justify-end">
          <button
            type="button"
            data-testid="confirmation-popup-close-btn"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl font-extrabold text-xs shadow transition-all active:scale-95 cursor-pointer ${buttonClass}`}
          >
            ĐÃ HIỂU / ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
};
