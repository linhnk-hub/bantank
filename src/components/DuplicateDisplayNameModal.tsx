/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MANDATORY DUPLICATE DISPLAY NAME RESOLUTION MODAL
 * Displayed immediately upon login when the account's initial/email display name
 * collides with an existing display name in the system.
 * Blocks entry until the user saves a unique display name (or signs out).
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, ShieldAlert, UserCheck } from 'lucide-react';
import { AvatarManager } from '../core/avatarManager.ts';
import {
  DISPLAY_NAME_MIN_LENGTH,
  normalizeDisplayName,
} from '../core/displayNameRegistry.ts';
import { useLanguage } from '../core/i18n.ts';

export interface DuplicateDisplayNameModalProps {
  isOpen: boolean;
  conflictedName: string;
  userEmail: string | null;
  onResolved: (newDisplayName: string) => void;
  onSignOut: () => void;
}

export const DuplicateDisplayNameModal: React.FC<DuplicateDisplayNameModalProps> = ({
  isOpen,
  conflictedName,
  userEmail,
  onResolved,
  onSignOut,
}) => {
  const { t } = useLanguage();
  const [newName, setNewName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNewName('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, conflictedName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleaned = normalizeDisplayName(newName);
    if (!cleaned) {
      setErrorMsg(
        t('Vui lòng nhập tên hiển thị mới.', 'Please enter a new display name.')
      );
      return;
    }
    if (cleaned.length < DISPLAY_NAME_MIN_LENGTH) {
      setErrorMsg(
        t(
          `Tên hiển thị phải có tối thiểu ${DISPLAY_NAME_MIN_LENGTH} ký tự.`,
          `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters.`
        )
      );
      return;
    }
    if (
      conflictedName &&
      cleaned.toLowerCase() === normalizeDisplayName(conflictedName).toLowerCase()
    ) {
      setErrorMsg(
        t(
          'Tên bị trùng trong hệ thống. Vui lòng chọn một tên khác hoàn toàn.',
          'Name already exists in the system. Please choose a different name.'
        )
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await AvatarManager.getInstance().updateDisplayName(cleaned);
      if (!res.success) {
        setErrorMsg(
          res.errorCode === 'DUPLICATE_DISPLAY_NAME'
            ? t(
                'Tên bị trùng trong hệ thống. Vui lòng nhập tên hiển thị khác.',
                'Name already exists in the system. Please enter a different display name.'
              )
            : res.message ||
              t(
                'Không thể cập nhật tên hiển thị. Vui lòng thử lại.',
                'Failed to update display name. Please try again.'
              )
        );
        return;
      }
      onResolved(cleaned);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="duplicate-display-name-modal"
      className="fixed inset-0 z-[130] bg-[#050510]/96 backdrop-blur-md flex items-center justify-center p-4 select-none"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="duplicate-name-modal-title"
    >
      <div className="w-full max-w-md bg-[#0b0d1e] border-2 border-[#FF0055] rounded-xl shadow-[0_0_40px_rgba(255,0,85,0.35)] overflow-hidden animate-neo-fade-in">
        {/* Header */}
        <div className="px-5 py-4 bg-rose-950/55 border-b border-[#FF0055]/45 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#FF0055]/20 border border-[#FF0055] flex items-center justify-center text-[#FF0055] shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="duplicate-name-modal-title"
              className="font-btn text-sm sm:text-base font-black uppercase tracking-wider text-white"
            >
              {t('Tên bị trùng trong hệ thống', 'Name Already Exists in System')}
            </h2>
            <p className="text-[11px] text-rose-200/85">
              {t(
                'Bắt buộc đổi tên duy nhất trước khi tiếp tục',
                'A unique display name is required before continuing'
              )}
            </p>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="p-3.5 rounded-lg bg-[#050510] border border-amber-500/45 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {t('Tên bị trùng trong hệ thống:', 'Conflicting name in system:')}
              </span>
            </div>
            <p className="font-btn text-sm font-black text-[#FF0055] break-words pl-6">
              {conflictedName || userEmail || '—'}
            </p>
            <p className="text-[11px] text-neutral-300 leading-relaxed pl-6">
              {t(
                'Mỗi tài khoản trong hệ thống chỉ được sử dụng một tên hiển thị duy nhất. Vui lòng đặt lại tên mới ngay bên dưới (không trùng với bất kỳ tài khoản nào đã có).',
                'Every account in the system must have a unique display name. Please enter a new display name below that is not already taken.'
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="forced-unique-display-name-input"
              className="block text-xs font-btn font-bold uppercase tracking-wider text-[#00F0FF]"
            >
              {t('Tên hiển thị mới (duy nhất)', 'New Unique Display Name')}
            </label>
            <input
              id="forced-unique-display-name-input"
              data-testid="forced-display-name-input"
              type="text"
              autoFocus
              maxLength={32}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder={t(
                'Nhập tên mới (2 – 32 ký tự)...',
                'Enter new name (2 – 32 chars)...'
              )}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#050510] border-2 border-[#00F0FF]/55 focus:border-[#00F0FF] focus:outline-none text-sm font-bold text-white placeholder:text-neutral-500"
            />
            <div className="flex items-center justify-between text-[10px] text-neutral-400">
              <span>
                {t(
                  'Không phân biệt chữ hoa/thường khi kiểm tra trùng.',
                  'Uniqueness check is case-insensitive.'
                )}
              </span>
              <span>{normalizeDisplayName(newName).length}/32</span>
            </div>
          </div>

          {errorMsg && (
            <div
              data-testid="forced-display-name-error"
              className="p-3 rounded-lg bg-red-950/75 border border-[#FF0055] text-red-200 text-xs flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#FF0055] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-1 flex flex-col gap-2">
            <button
              type="submit"
              data-testid="forced-display-name-submit"
              disabled={isSubmitting || normalizeDisplayName(newName).length < DISPLAY_NAME_MIN_LENGTH}
              className="font-btn w-full min-h-[46px] py-2.5 px-4 rounded-lg bg-[#FFB800] hover:bg-amber-400 disabled:opacity-45 disabled:cursor-not-allowed text-[#050510] font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <CheckCircle2 className="w-4 h-4 animate-pulse" />
                  <span>{t('Đang kiểm tra & lưu...', 'Checking & Saving...')}</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>{t('Đổi tên & Tiếp tục', 'Rename & Continue')}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onSignOut}
              disabled={isSubmitting}
              className="font-btn w-full py-2 px-4 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('Đăng xuất tài khoản khác', 'Sign Out')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
