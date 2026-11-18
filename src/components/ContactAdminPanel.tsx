/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  MessageSquare,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  CONTACT_PAGE_SIZE,
  fetchContactMessagesForAdmin,
  filterAndSearchContactMessages,
  getContactTagLabel,
  paginateContactMessages,
  updateContactMessageStatus,
  type ContactMessageRecord,
  type ContactSeenFilter,
  type ContactTag,
} from '../core/contactManager.ts';
import { useLanguage } from '../core/i18n.ts';

export const ContactAdminPanel: React.FC = () => {
  const { t, lang } = useLanguage();
  const [messages, setMessages] = useState<ContactMessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<'ALL' | ContactTag>('ALL');
  const [statusFilter, setStatusFilter] = useState<ContactSeenFilter>('ALL');
  const [searchText, setSearchText] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchContactMessagesForAdmin();
      setMessages(list);
    } catch {
      setErrorMsg(
        t(
          'Không thể tải danh sách liên hệ từ Firestore.',
          'Unable to load contact messages from Firestore.'
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const filteredMessages = useMemo(
    () =>
      filterAndSearchContactMessages(messages, {
        tagFilter,
        statusFilter,
        searchText,
      }),
    [messages, tagFilter, statusFilter, searchText]
  );

  const paginated = useMemo(
    () => paginateContactMessages(filteredMessages, pageIndex, CONTACT_PAGE_SIZE),
    [filteredMessages, pageIndex]
  );

  useEffect(() => {
    setPageIndex(0);
  }, [tagFilter, statusFilter, searchText]);

  const handleToggleSeen = async (msg: ContactMessageRecord) => {
    const nextSeen = !msg.isSeen;
    setMutatingId(msg.messageId);
    try {
      await updateContactMessageStatus(msg.messageId, { isSeen: nextSeen });
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === msg.messageId
            ? { ...m, isSeen: nextSeen, seenAtMs: nextSeen ? Date.now() : null }
            : m
        )
      );
    } catch {
      setErrorMsg(t('Cập nhật trạng thái đã xem thất bại.', 'Failed to update seen status.'));
    } finally {
      setMutatingId(null);
    }
  };

  const handleToggleHighlight = async (msg: ContactMessageRecord) => {
    const nextHighlighted = !msg.isHighlighted;
    setMutatingId(msg.messageId);
    try {
      await updateContactMessageStatus(msg.messageId, { isHighlighted: nextHighlighted });
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === msg.messageId ? { ...m, isHighlighted: nextHighlighted } : m
        )
      );
    } catch {
      setErrorMsg(t('Cập nhật đánh dấu quan trọng thất bại.', 'Failed to update highlight status.'));
    } finally {
      setMutatingId(null);
    }
  };

  return (
    <section data-testid="admin-contact-messages-panel" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-amber-500/20 pb-2.5">
        <div className="flex items-center gap-2 font-extrabold text-amber-300 uppercase tracking-wider">
          <MessageSquare className="w-4 h-4 text-[#00F0FF]" />
          <span>{t('HỘP THƯ LIÊN HỆ NGƯỜI CHƠI', 'PLAYER CONTACT INBOX')}</span>
        </div>
        <button
          type="button"
          onClick={() => void loadMessages()}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{t('Làm mới', 'Refresh')}</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            data-testid="admin-contact-search-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={t('Tìm tiêu đề, nội dung, người gửi...', 'Search title, content, sender...')}
            className="w-full pl-8 pr-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-[#00F0FF]"
          />
        </div>

        <select
          data-testid="admin-contact-tag-filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value as 'ALL' | ContactTag)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-[#00F0FF]"
        >
          <option value="ALL">{t('Tất cả phân loại', 'All Tags')}</option>
          <option value="FEEDBACK">{t('[Góp ý]', '[Feedback]')}</option>
          <option value="BUG_REPORT">{t('[Báo lỗi]', '[Bug Report]')}</option>
        </select>

        <select
          data-testid="admin-contact-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ContactSeenFilter)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-white text-xs focus:outline-none focus:border-[#00F0FF]"
        >
          <option value="ALL">{t('Tất cả trạng thái', 'All Statuses')}</option>
          <option value="UNSEEN">{t('Chưa xem', 'Unseen')}</option>
          <option value="SEEN">{t('Đã xem', 'Seen')}</option>
          <option value="HIGHLIGHTED">{t('Quan trọng', 'Highlighted')}</option>
        </select>
      </div>

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-950/70 border border-rose-500/60 text-rose-200 text-xs">
          {errorMsg}
        </div>
      )}

      {/* List (max 5 items per page) */}
      {isLoading && messages.length === 0 ? (
        <div className="p-6 rounded-xl bg-neutral-950/90 border border-neutral-800 text-center text-neutral-400 text-xs">
          {t('Đang tải tin liên hệ...', 'Loading contact messages...')}
        </div>
      ) : paginated.items.length === 0 ? (
        <div className="p-6 rounded-xl bg-neutral-950/90 border border-neutral-800 text-center text-neutral-400 text-xs">
          {t('Không có tin liên hệ nào phù hợp.', 'No matching contact messages.')}
        </div>
      ) : (
        <div className="space-y-2.5" data-testid="admin-contact-list">
          {paginated.items.map((msg) => (
            <div
              key={msg.messageId}
              data-testid={`admin-contact-item-${msg.messageId}`}
              className={`p-3.5 rounded-xl border transition-all space-y-2 ${
                msg.isHighlighted
                  ? 'bg-amber-950/35 border-[#FFB800] shadow-[0_0_16px_rgba(255,184,0,0.2)]'
                  : 'bg-neutral-950/90 border-neutral-800'
              }`}
            >
              {/* Top row: tag + seen status + timestamp */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold font-mono border ${
                      msg.tag === 'BUG_REPORT'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-500/60'
                        : 'bg-sky-950/80 text-[#00F0FF] border-[#00F0FF]/50'
                    }`}
                  >
                    {getContactTagLabel(msg.tag, lang)}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold font-mono border ${
                      msg.isSeen
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/60'
                        : 'bg-neutral-900 text-amber-300 border-amber-500/50'
                    }`}
                  >
                    {msg.isSeen ? t('Đã xem', 'Seen') : t('Chưa xem', 'Unseen')}
                  </span>

                  {msg.isHighlighted && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold font-mono bg-[#FFB800] text-[#050510]">
                      {t('Quan trọng', 'Important')}
                    </span>
                  )}
                </div>

                <span className="text-[10px] font-mono text-neutral-400">
                  {msg.createdAtMs > 0
                    ? new Date(msg.createdAtMs).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')
                    : '--'}
                </span>
              </div>

              {/* Title & Content */}
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-extrabold text-[#EAF4FF] break-words">
                  {msg.title}
                </h4>
                <p className="text-xs text-neutral-300 whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </p>
              </div>

              {/* Footer: Sender info + Seen & Highlight actions */}
              <div className="pt-2 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-neutral-400">
                  <span>{t('Người gửi:', 'Sender:')} </span>
                  <strong className="text-[#FFB800]">{msg.senderName}</strong>{' '}
                  <span className="font-mono text-neutral-400">({msg.senderEmail})</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid={`admin-contact-seen-btn-${msg.messageId}`}
                    disabled={mutatingId === msg.messageId}
                    onClick={() => void handleToggleSeen(msg)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50 border ${
                      msg.isSeen
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 hover:bg-emerald-900/80'
                        : 'bg-neutral-900 text-[#EAF4FF] border-neutral-700 hover:border-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {msg.isSeen
                        ? t('Đã xác nhận xem', 'Confirmed Seen')
                        : t('Xác nhận đã xem', 'Mark Seen')}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid={`admin-contact-highlight-btn-${msg.messageId}`}
                    disabled={mutatingId === msg.messageId}
                    onClick={() => void handleToggleHighlight(msg)}
                    title={t('Đánh dấu góp ý quan trọng', 'Highlight important feedback')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition-all disabled:opacity-50 border ${
                      msg.isHighlighted
                        ? 'bg-[#FFB800] text-[#050510] border-[#FFB800] shadow-[0_0_10px_rgba(255,184,0,0.4)]'
                        : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:border-[#FFB800] hover:text-[#FFB800]'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{t('Quan trọng', 'Highlight')}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer (max 5 items / page) */}
      <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[11px] font-mono text-neutral-400">
          {t('Trang', 'Page')} <strong className="text-white">{paginated.pageIndex + 1}</strong> /{' '}
          <strong className="text-white">{paginated.totalPages}</strong> •{' '}
          {t('Hiển thị', 'Showing')} <strong className="text-white">{paginated.items.length}</strong> /{' '}
          {t(`tối đa ${CONTACT_PAGE_SIZE} tin`, `max ${CONTACT_PAGE_SIZE}`)} ({paginated.totalItems} {t('tin', 'total')})
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginated.pageIndex <= 0}
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{t('Trang trước', 'Prev')}</span>
          </button>
          <button
            type="button"
            disabled={paginated.pageIndex >= paginated.totalPages - 1}
            onClick={() => setPageIndex((p) => Math.min(paginated.totalPages - 1, p + 1))}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>{t('Trang sau', 'Next')}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
