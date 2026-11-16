/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage, type SupportedLanguage } from '../core/i18n.ts';

export interface LanguageSelectorProps {
  className?: string;
  compact?: boolean;
}

/**
 * Neo-Retro VI | EN Language Selector.
 * Switches language immediately in place without reloading the page or resetting game state.
 */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  className = '',
  compact = false,
}) => {
  const { lang, setLang } = useLanguage();

  const handleSelect = (target: SupportedLanguage) => {
    if (target !== lang) {
      setLang(target);
    }
  };

  return (
    <div
      data-testid="language-selector"
      role="group"
      aria-label={lang === 'en' ? 'Language selector VI or EN' : 'Chọn ngôn ngữ VI hoặc EN'}
      className={`inline-flex items-center border border-[#687386]/60 bg-[#050510]/90 font-btn text-[11px] leading-none select-none shrink-0 ${
        compact ? 'min-h-[34px] px-1 py-0.5' : 'min-h-[38px] px-1.5 py-1'
      } ${className}`}
    >
      <button
        type="button"
        data-testid="lang-btn-vi"
        onClick={() => handleSelect('vi')}
        aria-pressed={lang === 'vi'}
        className={`min-w-[28px] min-h-[26px] px-1.5 py-1 font-extrabold tracking-wider uppercase transition-colors cursor-pointer ${
          lang === 'vi'
            ? 'bg-[#FFB800] text-[#050510] shadow-[0_0_8px_rgba(255,184,0,0.45)]'
            : 'text-[#687386] hover:text-[#EAF4FF]'
        }`}
      >
        VI
      </button>
      <span className="px-0.5 text-[#687386] font-mono select-none" aria-hidden="true">
        |
      </span>
      <button
        type="button"
        data-testid="lang-btn-en"
        onClick={() => handleSelect('en')}
        aria-pressed={lang === 'en'}
        className={`min-w-[28px] min-h-[26px] px-1.5 py-1 font-extrabold tracking-wider uppercase transition-colors cursor-pointer ${
          lang === 'en'
            ? 'bg-[#00F0FF] text-[#050510] shadow-[0_0_8px_rgba(0,240,255,0.45)]'
            : 'text-[#687386] hover:text-[#EAF4FF]'
        }`}
      >
        EN
      </button>
    </div>
  );
};
