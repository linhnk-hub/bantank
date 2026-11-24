/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ADMIN VERSION & RELEASE HISTORY PANEL
 * Displays every release row with sequential order (STT), version tag, release date/time,
 * and click-to-open structured change details.
 */

import React, { useState } from 'react';
import { CalendarClock, ChevronDown, History, Tag } from 'lucide-react';
import {
  CURRENT_APP_VERSION,
  RELEASE_CHANGELOG,
} from '../core/releaseChangelog.ts';
import { useLanguage } from '../core/i18n.ts';

export const VersionHistoryAdminPanel: React.FC = () => {
  const { lang, t } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleEntry = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      data-testid="admin-version-history-panel"
      className="space-y-4"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-neutral-800 pb-2.5">
        <div className="flex items-center gap-2 font-btn font-extrabold text-[#FFB800] text-xs sm:text-sm uppercase tracking-wider">
          <History className="w-4 h-4 text-[#FFB800] shrink-0" />
          <span>{t('LỊCH SỬ PHIÊN BẢN & CẬP NHẬT', 'VERSION & RELEASE HISTORY')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#00F0FF]/15 border border-[#00F0FF]/45 text-[#00F0FF] font-mono font-bold text-[11px]">
            <Tag className="w-3 h-3 shrink-0" />
            <span>{CURRENT_APP_VERSION}</span>
          </span>
          <span className="text-[11px] font-mono text-neutral-400">
            {RELEASE_CHANGELOG.length} {t('phiên bản', 'releases')}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-neutral-400">
        {t(
          'Danh sách các phiên bản cập nhật theo từng yêu cầu. Bấm vào từng dòng để xem chi tiết đầy đủ các thay đổi.',
          'Chronological log of releases by prompt. Click any row to view full change details.'
        )}
      </p>

      {/* Release Rows */}
      <div
        data-testid="version-history-list"
        className="space-y-2"
      >
        {RELEASE_CHANGELOG.map((entry, idx) => {
          const stt = idx + 1;
          const isExpanded = expandedId === entry.id;
          const title = lang === 'en' ? entry.titleEn : entry.titleVi;

          return (
            <div
              key={entry.id}
              data-testid={`version-history-row-${entry.version}`}
              className={`rounded-xl border transition-colors overflow-hidden ${
                isExpanded
                  ? 'bg-[#070a19] border-[#FFB800]/70 shadow-[0_0_18px_rgba(255,184,0,0.12)]'
                  : 'bg-[#050510]/90 border-neutral-800 hover:border-[#00F0FF]/50'
              }`}
            >
              {/* Summary Row Button */}
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleEntry(entry.id)}
                className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  {/* STT */}
                  <span
                    className={`w-7 h-7 rounded-lg font-mono font-black text-xs flex items-center justify-center shrink-0 border ${
                      isExpanded
                        ? 'bg-[#FFB800] text-[#050510] border-[#FFB800]'
                        : 'bg-[#0b0d1e] text-[#00F0FF] border-[#00F0FF]/35'
                    }`}
                  >
                    {stt}
                  </span>

                  {/* Version & Title */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-black text-xs text-[#FFB800] shrink-0">
                        {entry.version}
                      </span>
                      <span className="font-btn font-bold text-xs sm:text-sm text-[#EAF4FF] truncate">
                        {title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-400 mt-0.5 tabular-nums">
                      <CalendarClock className="w-3 h-3 text-neutral-500 shrink-0" />
                      <span>
                        {t('Phát hành:', 'Released:')} {entry.releasedAt}
                      </span>
                      <span className="text-neutral-600">•</span>
                      <span className="text-neutral-400">
                        {entry.changes.length} {t('hạng mục', 'items')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expand Indicator */}
                <span
                  className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-transform duration-200 ${
                    isExpanded
                      ? 'rotate-180 bg-[#FFB800]/15 border-[#FFB800]/60 text-[#FFB800]'
                      : 'bg-[#0b0d1e] border-neutral-700 text-neutral-400'
                  }`}
                >
                  <ChevronDown className="w-4 h-4" />
                </span>
              </button>

              {/* Expanded Detailed Report */}
              {isExpanded && (
                <div
                  data-testid={`version-history-detail-${entry.version}`}
                  className="px-4 py-3.5 border-t border-neutral-800/90 bg-[#050510]/80 space-y-3"
                >
                  <ol className="space-y-3">
                    {entry.changes.map((item, changeIdx) => {
                      const heading = lang === 'en' ? item.headingEn : item.headingVi;
                      const description =
                        lang === 'en' ? item.descriptionEn : item.descriptionVi;
                      const subPoints =
                        lang === 'en' ? item.subPointsEn : item.subPointsVi;

                      return (
                        <li
                          key={`${entry.id}-chg-${changeIdx}`}
                          className="text-xs text-neutral-200 leading-relaxed"
                        >
                          <div className="flex items-start gap-2">
                            <span className="font-mono font-black text-[#FFB800] shrink-0">
                              {changeIdx + 1}.
                            </span>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <p className="text-[#EAF4FF]">
                                <strong className="font-bold text-amber-300">
                                  {heading}
                                  {description ? ':' : ''}
                                </strong>
                                {description ? ` ${description}` : ''}
                              </p>

                              {subPoints && subPoints.length > 0 && (
                                <ul className="space-y-1 pl-3 border-l-2 border-[#00F0FF]/30">
                                  {subPoints.map((pt, ptIdx) => (
                                    <li
                                      key={`${entry.id}-chg-${changeIdx}-pt-${ptIdx}`}
                                      className="text-[11px] sm:text-xs text-neutral-300 leading-relaxed flex items-start gap-1.5"
                                    >
                                      <span className="text-[#00F0FF] shrink-0">•</span>
                                      <span>{pt}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
