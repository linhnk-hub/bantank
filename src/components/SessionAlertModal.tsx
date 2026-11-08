/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { SessionStateSnapshot } from '../core/sessionManager.ts';
import { formatAccountStatusMessage } from './AuthSessionBanner.tsx';
import { ShieldAlert, WifiOff, RefreshCw, LogIn } from 'lucide-react';

export interface SessionAlertModalProps {
  session: SessionStateSnapshot;
  isProcessing: boolean;
  onReauth: () => Promise<void>;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const SessionAlertModal: React.FC<SessionAlertModalProps> = ({
  session,
  isProcessing,
  onReauth,
  onSignIn,
  onSignOut,
}) => {
  const showModal =
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' ||
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'CONNECTION_LOST_UNVERIFIED';

  if (!showModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl flex flex-col gap-4 text-center">
        <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center bg-amber-500/10 border border-amber-500/30 text-amber-400">
          {session.status === 'CONNECTION_LOST_UNVERIFIED' ? (
            <WifiOff className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7 text-rose-500" />
          )}
        </div>

        <div>
          <h3 className="text-base sm:text-lg font-black text-white">
            {session.status === 'DISPLACED' && 'Tài Khoản Đang Mở Ở Thiết Bị Khác'}
            {session.status === 'PAUSED_IDLE' && 'Tài Khoản Tạm Dừng Do Không Hoạt Động'}
            {session.status === 'CONNECTION_LOST_UNVERIFIED' && 'Mất Kết Nối Máy Chủ'}
            {session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && 'Bảo Vệ Tài Khoản Người Chơi'}
          </h3>
          <p className="text-xs sm:text-sm text-neutral-300 mt-2 leading-relaxed">
            {formatAccountStatusMessage(session.message, session.status) ||
              'Không thể xác minh kết nối bảo mật tài khoản. Trận đấu đang tạm dừng để bảo vệ tài khoản.'}
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Đang kiểm tra...' : 'Thử xác thực lại'}</span>
            </button>
          )}

          {session.status === 'CONNECTION_LOST_UNVERIFIED' && (
            <button
              onClick={onReauth}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              <span>{isProcessing ? 'Đang kết nối lại...' : 'Kết nối lại máy chủ'}</span>
            </button>
          )}

          {session.status !== 'ACTIVE' && (
            <button
              onClick={onSignIn}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-all border border-neutral-700"
            >
              <LogIn className="w-4 h-4" />
              <span>Đăng nhập lại bằng Google</span>
            </button>
          )}

          <button
            onClick={onSignOut}
            disabled={isProcessing}
            className="w-full py-2 rounded-xl text-neutral-400 hover:text-neutral-200 text-xs transition-all"
          >
            Đăng xuất tài khoản an toàn
          </button>
        </div>
      </div>
    </div>
  );
};
