/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, MessageSquare, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../core/i18n.ts';
import {
  CONTACT_CONTENT_MAX_LENGTH,
  CONTACT_TITLE_MAX_LENGTH,
  submitContactMessage,
  type ContactTag,
} from '../core/contactManager.ts';

export interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
}

export const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  isAuthenticated,
}) => {
  const { t } = useLanguage();
  const [tag, setTag] = useState<ContactTag>('FEEDBACK');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);

  if (!isOpen) return null;

  const remainingChars = Math.max(0, CONTACT_CONTENT_MAX_LENGTH - content.length);

  const handleCloseAll = () => {
    setIsSuccessOpen(false);
    setErrorMsg(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setErrorMsg(t('Vui lòng đăng nhập Google để gửi liên hệ.', 'Please sign in with Google to send a message.'));
      return;
    }

    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle) {
      setErrorMsg(t('Vui lòng nhập tiêu đề.', 'Please enter a subject title.'));
      return;
    }
    if (!cleanContent) {
      setErrorMsg(t('Vui lòng nhập nội dung.', 'Please enter your message content.'));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await submitContactMessage({
        tag,
        title: cleanTitle,
        content: cleanContent,
      });
      setTitle('');
      setContent('');
      setIsSuccessOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(
        msg.includes('permission') || msg.includes('PERMISSION_DENIED')
          ? t('Không thể gửi tin nhắn. Vui lòng kiểm tra đăng nhập Google.', 'Could not send message. Please verify your Google sign-in.')
          : t('Gửi tin nhắn thất bại. Vui lòng thử lại.', 'Failed to send message. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="contact-modal-backdrop"
      className="fixed inset-0 z-[75] bg-[#050510]/92 flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-modal-title"
    >
      {/* Success Confirmation Dialog */}
      {isSuccessOpen && (
        <div
          data-testid="contact-success-dialog"
          className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/80"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-[#0b0d1e] border-2 border-emerald-400/70 rounded-xl w-full max-w-sm p-5 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/60 mx-auto flex items-center justify-center text-emerald-300">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-btn text-base font-black uppercase tracking-wider text-emerald-300">
                {t('Đã gửi thành công', 'Sent Successfully')}
              </h3>
              <p className="text-xs text-neutral-300">
                {t(
                  'Tin nhắn của bạn đã được chuyển tới quản trị viên.',
                  'Your message has been delivered to the administrator.'
                )}
              </p>
            </div>
            <button
              type="button"
              data-testid="contact-success-close-btn"
              onClick={handleCloseAll}
              className="font-btn w-full min-h-[42px] px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#050510] font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              {t('Đóng', 'Close')}
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-xl w-full max-w-lg shadow-[0_0_32px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col animate-neo-fade-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-[#00F0FF]/25 flex items-center justify-between gap-2 bg-[#050510]/95 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/45 flex items-center justify-center text-[#00F0FF] shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h2
              id="contact-modal-title"
              className="font-btn text-sm sm:text-base font-black uppercase tracking-wider text-[#EAF4FF]"
            >
              {t('Tin nhắn', 'Messages')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCloseAll}
            className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label={t('Đóng', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {!isAuthenticated && (
            <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                {t(
                  'Vui lòng đăng nhập tài khoản Google để gửi góp ý hoặc báo lỗi.',
                  'Please sign in with Google to send feedback or bug reports.'
                )}
              </span>
            </div>
          )}

          {errorMsg && (
            <div
              data-testid="contact-error-banner"
              className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tag Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-300">
              {t('Chọn mục đích', 'Select Purpose')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="contact-tag-feedback"
                onClick={() => setTag('FEEDBACK')}
                className={`font-btn min-h-[40px] px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer border ${
                  tag === 'FEEDBACK'
                    ? 'bg-[#00F0FF] text-[#050510] border-[#00F0FF] shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                    : 'bg-[#050510] text-[#EAF4FF] border-neutral-700 hover:border-[#00F0FF]/60'
                }`}
              >
                {t('[Góp ý]', '[Feedback]')}
              </button>
              <button
                type="button"
                data-testid="contact-tag-bug"
                onClick={() => setTag('BUG_REPORT')}
                className={`font-btn min-h-[40px] px-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer border ${
                  tag === 'BUG_REPORT'
                    ? 'bg-[#FFB800] text-[#050510] border-[#FFB800] shadow-[0_0_12px_rgba(255,184,0,0.3)]'
                    : 'bg-[#050510] text-[#EAF4FF] border-neutral-700 hover:border-[#FFB800]/60'
                }`}
              >
                {t('[Báo lỗi]', '[Bug Report]')}
              </button>
            </div>
          </div>

          {/* Title Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="contact-title-input"
              className="block text-xs font-bold uppercase tracking-wider text-neutral-300"
            >
              {t('Tiêu đề', 'Title')}
            </label>
            <input
              id="contact-title-input"
              data-testid="contact-title-input"
              type="text"
              value={title}
              maxLength={CONTACT_TITLE_MAX_LENGTH}
              disabled={!isAuthenticated || isSubmitting}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('Nhập tiêu đề...', 'Enter subject title...')}
              className="w-full px-3 py-2.5 rounded-lg bg-[#050510] border border-neutral-700 text-white placeholder-neutral-500 text-xs sm:text-sm focus:outline-none focus:border-[#00F0FF] disabled:opacity-50"
            />
          </div>

          {/* Content Textarea (max 1000 chars with countdown) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="contact-content-input"
                className="block text-xs font-bold uppercase tracking-wider text-neutral-300"
              >
                {t('Nội dung', 'Content')}
              </label>
              <span
                data-testid="contact-char-countdown"
                className={`text-[11px] font-mono font-bold ${
                  remainingChars <= 50
                    ? 'text-rose-400'
                    : remainingChars <= 200
                      ? 'text-amber-300'
                      : 'text-[#00F0FF]'
                }`}
              >
                {t(`Còn ${remainingChars} / ${CONTACT_CONTENT_MAX_LENGTH} ký tự`, `${remainingChars} / ${CONTACT_CONTENT_MAX_LENGTH} remaining`)}
              </span>
            </div>
            <textarea
              id="contact-content-input"
              data-testid="contact-content-input"
              rows={5}
              value={content}
              maxLength={CONTACT_CONTENT_MAX_LENGTH}
              disabled={!isAuthenticated || isSubmitting}
              onChange={(e) => setContent(e.target.value.slice(0, CONTACT_CONTENT_MAX_LENGTH))}
              placeholder={t('Nhập nội dung (tối đa 1000 ký tự)...', 'Enter your message (up to 1000 characters)...')}
              className="w-full px-3 py-2.5 rounded-lg bg-[#050510] border border-neutral-700 text-white placeholder-neutral-500 text-xs sm:text-sm resize-y focus:outline-none focus:border-[#00F0FF] disabled:opacity-50"
            />
          </div>

          {/* Submit Footer */}
          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCloseAll}
              className="font-btn min-h-[42px] px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              {t('Hủy', 'Cancel')}
            </button>
            <button
              type="submit"
              data-testid="contact-submit-btn"
              disabled={!isAuthenticated || isSubmitting || !title.trim() || !content.trim()}
              className="font-btn min-h-[42px] px-5 py-2 rounded-lg bg-[#FFB800] hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-[#050510] font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? t('Đang gửi...', 'Sending...') : t('Gửi', 'Send')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
