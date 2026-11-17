/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Info, LogOut, Menu, Settings, Wrench, X } from 'lucide-react';
import { useLanguage } from '../core/i18n.ts';

export interface TopMenuActionDrawerProps {
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools?: () => void;
  onExit?: () => void;
  exitLabel?: string;
  isSuperAdmin?: boolean;
  isExitDisabled?: boolean;
  hideSettings?: boolean;
}

/**
 * Unified Top Menu Horizontal Slide-Out Action Drawer:
 * - Hamburger 3-line button on the right
 * - Clicking toggles a smooth horizontal slide from right to left revealing Settings, Info, (QA), Exit
 * - Excludes audio toggle on authenticated/battle screens per design spec
 */
export const TopMenuActionDrawer: React.FC<TopMenuActionDrawerProps> = ({
  onOpenSettings,
  onOpenSupport,
  onOpenDevTools,
  onExit,
  exitLabel,
  isSuperAdmin = false,
  isExitDisabled = false,
  hideSettings = false,
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isOpen]);

  const resolvedExitLabel = exitLabel || t('Thoát', 'Exit');

  return (
    <div
      ref={containerRef}
      data-testid="top-menu-action-drawer"
      className="flex items-center justify-end gap-1 shrink-0"
    >
      {/* Horizontal slide-out tray (slides from right to left alongside hamburger button) */}
      <div
        data-testid="top-menu-slide-tray"
        aria-hidden={!isOpen}
        className={`flex items-center justify-end gap-1 overflow-hidden transition-all duration-250 ease-out ${
          isOpen
            ? 'max-w-[220px] opacity-100 translate-x-0 pointer-events-auto mr-0.5'
            : 'max-w-0 opacity-0 translate-x-4 pointer-events-none'
        }`}
      >
        {!hideSettings && onOpenSettings && (
          <button
            type="button"
            tabIndex={isOpen ? 0 : -1}
            data-testid="top-menu-drawer-settings-btn"
            onClick={() => {
              setIsOpen(false);
              onOpenSettings();
            }}
            aria-label={t('Cài đặt', 'Settings')}
            title={t('Cài đặt', 'Settings')}
            className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none text-[#FFB800] hover:text-[#00F0FF] transition-colors cursor-pointer active:scale-95 shrink-0 touch-manipulation"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        {onOpenSupport && (
          <button
            type="button"
            tabIndex={isOpen ? 0 : -1}
            data-testid="top-menu-drawer-info-btn"
            onClick={() => {
              setIsOpen(false);
              onOpenSupport();
            }}
            aria-label={t('Thông tin', 'Information')}
            title={t('Thông tin', 'Information')}
            className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none text-[#00F0FF] hover:text-[#FFB800] transition-colors cursor-pointer active:scale-95 shrink-0 touch-manipulation"
          >
            <Info className="w-4 h-4" />
          </button>
        )}

        {isSuperAdmin && onOpenDevTools && (
          <button
            type="button"
            tabIndex={isOpen ? 0 : -1}
            data-testid="top-menu-drawer-qa-btn"
            onClick={() => {
              setIsOpen(false);
              onOpenDevTools();
            }}
            aria-label="QA (Admin)"
            title="QA (Admin)"
            className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none text-[#FFB800] hover:text-[#00F0FF] transition-colors cursor-pointer active:scale-95 shrink-0 touch-manipulation"
          >
            <Wrench className="w-4 h-4" />
          </button>
        )}

        {onExit && (
          <button
            type="button"
            tabIndex={isOpen ? 0 : -1}
            data-testid="top-menu-drawer-exit-btn"
            onClick={() => {
              setIsOpen(false);
              onExit();
            }}
            disabled={isExitDisabled}
            aria-label={resolvedExitLabel}
            title={resolvedExitLabel}
            className="flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none text-[#FF0055] hover:text-rose-400 transition-colors cursor-pointer active:scale-95 disabled:opacity-50 shrink-0 touch-manipulation"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 3-Line Hamburger Toggle Button */}
      <button
        type="button"
        data-testid="top-menu-hamburger-btn"
        aria-expanded={isOpen}
        aria-label={isOpen ? t('Đóng menu', 'Close menu') : t('Mở menu', 'Open menu')}
        title={isOpen ? t('Đóng menu', 'Close menu') : t('Menu chức năng', 'Menu')}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center justify-center min-w-[36px] min-h-[36px] p-1.5 bg-transparent border-0 shadow-none transition-colors cursor-pointer active:scale-95 shrink-0 touch-manipulation ${
          isOpen ? 'text-[#00F0FF]' : 'text-[#EAF4FF] hover:text-[#FFB800]'
        }`}
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
};
