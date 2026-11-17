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
      className={`inline-flex items-center justify-center rounded border border-[#687386]/60 bg-[#0b0d1e]/95 font-btn text-xs leading-none select-none shrink-0 ${
        compact
          ? 'w-[76px] h-[36px] min-w-[76px] min-h-[36px] px-1 py-0.5'
          : 'w-[84px] h-[38px] min-w-[84px] min-h-[38px] px-1.5 py-1'
      } ${className}`}
    >
      <button
        type="button"
        data-testid="lang-btn-vi"
        onClick={() => handleSelect('vi')}
        aria-pressed={lang === 'vi'}
        className={`w-[30px] h-[26px] rounded-sm font-extrabold tracking-wider uppercase transition-colors cursor-pointer flex items-center justify-center ${
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
        className={`w-[30px] h-[26px] rounded-sm font-extrabold tracking-wider uppercase transition-colors cursor-pointer flex items-center justify-center ${
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
