/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SessionManager, type SessionStateSnapshot } from '../core/sessionManager.ts';
import { formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { ShieldAlert, WifiOff, RefreshCw, LogOut, Clock, Play } from 'lucide-react';
import { useLanguage } from '../core/i18n.ts';

export interface SessionAlertModalProps {
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onReauth: () => Promise<void>;
  onSignIn?: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onContinueSession?: () => void;
}

export const SessionAlertModal: React.FC<SessionAlertModalProps> = ({
  session,
  isProcessing,
  onReauth,
  onSignOut,
  onContinueSession,
}) => {
  const { t } = useLanguage();

  const isIdleWarning =
    session.status === 'ACTIVE' && Boolean(session.isIdleWarningVisible);

  const showModal =
    isIdleWarning ||
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' ||
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'CONNECTION_LOST_UNVERIFIED';

  if (!showModal) return null;

  const handleContinue = () => {
    if (onContinueSession) {
      onContinueSession();
    } else {
      SessionManager.getInstance().continueSession();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 bg-[#050510]/88 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-[#0b0d1e] border-2 border-[#FFB800]/60 rounded-lg max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded mx-auto flex items-center justify-center bg-[#FFB800]/15 border border-[#FFB800]/40 text-[#FFB800]">
          {isIdleWarning ? (
            <Clock className="w-7 h-7 text-[#FFB800] animate-pulse" />
          ) : session.status === 'CONNECTION_LOST_UNVERIFIED' ? (
            <WifiOff className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7 text-[#FF0055]" />
          )}
        </div>

        <div>
          <h3 className="font-btn text-base sm:text-lg font-black text-[#EAF4FF]">
            {isIdleWarning &&
              t('Cảnh Báo Phiên Sắp Hết Hạn Không Hoạt Động', 'Idle Session Expiration Warning')}
            {!isIdleWarning &&
              session.status === 'DISPLACED' &&
              t('Tài khoản đang đăng nhập trên thiết bị khác', 'Account Active on Another Device')}
            {!isIdleWarning &&
              session.status === 'PAUSED_IDLE' &&
              t('Tài khoản bị tạm dừng do không hoạt động', 'Session Paused Due to Inactivity')}
            {!isIdleWarning &&
              session.status === 'CONNECTION_LOST_UNVERIFIED' &&
              t('Kết nối bị gián đoạn', 'Connection Interrupted')}
            {!isIdleWarning &&
              session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' &&
              t('Bảo vệ tài khoản người dùng', 'Account Security Protection')}
          </h3>
          {isIdleWarning ? (
            <p className="text-xs sm:text-sm text-neutral-300 mt-2 leading-relaxed whitespace-pre-line">
              {t(
                'Bạn đã không thao tác trong hơn 14 phút.',
                'You have been inactive for over 14 minutes.'
              )}
              {'\n'}
              {t('Game sẽ tự động kết thúc sau ', 'Session will automatically end in ')}
              <strong className="font-hud text-[#FFB800] text-lg">
                {session.idleRemainingSeconds ?? 60} {t('giây', 'seconds')}
              </strong>{' '}
              {t('nữa để bảo vệ tài khoản.', 'to protect your account.')}
              {'\n'}
              {t('Nhấn ', 'Click ')}
              <strong>&quot;{t('Tiếp tục phiên', 'Continue Session')}&quot;</strong>
              {t(' để duy trì đăng nhập.', ' to stay signed in.')}
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-neutral-300 mt-2 leading-relaxed whitespace-pre-line">
              {formatSentenceLineBreaks(
                formatAccountStatusMessage(session.message, session.status) ||
                  t(
                    'Không thể xác minh kết nối bảo mật tài khoản. Trận đấu đang tạm dừng để bảo vệ tài khoản.',
                    'Unable to verify secure account connection. The match is paused to protect your account.'
                  )
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {isIdleWarning && (
            <button
              type="button"
              onClick={handleContinue}
              data-testid="btn-continue-session"
              className="font-btn w-full min-h-[48px] flex items-center justify-center gap-2 py-2.5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] text-xs font-extrabold transition-all shadow cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{t('Tiếp tục phiên', 'Continue Session')}</span>
            </button>
          )}

          {!isIdleWarning && session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="font-btn w-full min-h-[48px] flex items-center justify-center gap-2 py-2.5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] text-xs font-bold transition-all shadow disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? t('Đang kiểm tra...', 'Verifying...') : t('Xác thực lại', 'Re-authenticate')}</span>
            </button>
          )}

          {!isIdleWarning && session.status === 'CONNECTION_LOST_UNVERIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="font-btn w-full min-h-[48px] flex items-center justify-center gap-2 py-2.5 rounded bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] text-xs font-bold transition-all shadow disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? t('Đang kết nối lại...', 'Reconnecting...') : t('Kết nối lại', 'Reconnect')}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="session-alert-signout-btn"
            onClick={onSignOut}
            disabled={isProcessing}
            className="font-btn w-full min-h-[48px] flex items-center justify-center gap-2 py-2.5 rounded bg-[#050510] hover:bg-neutral-800 text-[#EAF4FF] text-xs font-semibold transition-all border border-[#FF0055]/50 disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#FF0055]" />
            <span>{t('Đăng xuất tài khoản', 'Sign Out')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
