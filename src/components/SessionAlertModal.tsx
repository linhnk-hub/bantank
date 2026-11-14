/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SessionManager, type SessionStateSnapshot } from '../core/sessionManager.ts';
import { formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import { ShieldAlert, WifiOff, RefreshCw, LogOut, Clock, Play } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-md w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-amber-500/10 border border-amber-500/30 text-amber-400">
          {isIdleWarning ? (
            <Clock className="w-7 h-7 text-amber-400 animate-pulse" />
          ) : session.status === 'CONNECTION_LOST_UNVERIFIED' ? (
            <WifiOff className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7 text-rose-500" />
          )}
        </div>

        <div>
          <h3 className="text-base sm:text-lg font-black text-white">
            {isIdleWarning && 'Cảnh Báo Phiên Sắp Hết Hạn Không Hoạt Động'}
            {!isIdleWarning && session.status === 'DISPLACED' && 'Tài khoản đang đăng nhập trên thiết bị khác'}
            {!isIdleWarning && session.status === 'PAUSED_IDLE' && 'Tài khoản bị tạm dừng do không hoạt động'}
            {!isIdleWarning && session.status === 'CONNECTION_LOST_UNVERIFIED' && 'Mất kết nối máy chủ'}
            {!isIdleWarning && session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && 'Bảo vệ tài khoản người dùng'}
          </h3>
          {isIdleWarning ? (
            <p className="text-xs sm:text-sm text-neutral-300 mt-2 leading-relaxed">
              Bạn đã không thao tác trong hơn 14 phút. Game sẽ tự động kết thúc sau{' '}
              <strong className="text-amber-400 font-mono text-base">
                {session.idleRemainingSeconds ?? 60} giây
              </strong>{' '}
              nữa để bảo vệ tài khoản. Nhấn <strong>"Tiếp tục phiên"</strong> để duy trì đăng nhập.
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-neutral-300 mt-2 leading-relaxed">
              {formatAccountStatusMessage(session.message, session.status) ||
                'Không thể xác minh kết nối bảo mật tài khoản. Trận đấu đang tạm dừng để bảo vệ tài khoản.'}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {isIdleWarning && (
            <button
              type="button"
              onClick={handleContinue}
              data-testid="btn-continue-session"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold transition-all shadow cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Tiếp tục phiên</span>
            </button>
          )}

          {!isIdleWarning && session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Đang kiểm tra...' : 'Xác thực lại'}</span>
            </button>
          )}

          {!isIdleWarning && session.status === 'CONNECTION_LOST_UNVERIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Đang kết nối lại...' : 'Kết nối lại'}</span>
            </button>
          )}

          <button
            type="button"
            data-testid="session-alert-signout-btn"
            onClick={onSignOut}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-all border border-neutral-700 disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Đăng xuất tài khoản</span>
          </button>
        </div>
      </div>
    </div>
  );
};

