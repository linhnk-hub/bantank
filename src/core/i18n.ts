/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export type SupportedLanguage = 'vi' | 'en';

export const LANGUAGE_STORAGE_KEY = 'bantank_lang_pref_v1';
export const LANGUAGE_CHANGE_EVENT = 'bantank:language-changed';

/**
 * Priority:
 * 1. Existing saved user preference in localStorage ('vi' | 'en').
 * 2. Vietnamese ('vi') default for new users or visitors without a saved preference.
 * Never overwrites or auto-switches based on browser navigator.language.
 */
export function getSavedLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') {
    return 'vi';
  }
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw === 'en' || raw === 'vi') {
      return raw;
    }
  } catch {
    // Ignore storage read errors in restricted environments
  }
  return 'vi';
}

export function setSavedLanguage(lang: SupportedLanguage): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized: SupportedLanguage = lang === 'en' ? 'en' : 'vi';
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage write errors
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = normalized;
  }
  try {
    window.dispatchEvent(
      new CustomEvent<SupportedLanguage>(LANGUAGE_CHANGE_EVENT, { detail: normalized })
    );
  } catch {
    // Ignore custom event dispatch errors
  }
}

/**
 * Selects the localized string based on active language ('vi' default, 'en' secondary).
 */
export function tx(lang: SupportedLanguage, viText: string, enText: string): string {
  return lang === 'en' ? enText : viText;
}

/**
 * React hook subscribing to live language changes without reloading the page
 * or resetting active game state.
 */
export function useLanguage(): {
  lang: SupportedLanguage;
  setLang: (next: SupportedLanguage) => void;
  t: (viText: string, enText: string) => string;
} {
  const [lang, setLangState] = useState<SupportedLanguage>(() => getSavedLanguage());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCustomChange = (e: Event) => {
      const custom = e as CustomEvent<SupportedLanguage>;
      if (custom.detail === 'vi' || custom.detail === 'en') {
        setLangState(custom.detail);
      } else {
        setLangState(getSavedLanguage());
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY) {
        setLangState(getSavedLanguage());
      }
    };

    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleCustomChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleCustomChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setLang = (next: SupportedLanguage) => {
    setLangState(next);
    setSavedLanguage(next);
  };

  const t = (viText: string, enText: string): string => (lang === 'en' ? enText : viText);

  return { lang, setLang, t };
}
