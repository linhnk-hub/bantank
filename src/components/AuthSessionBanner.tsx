/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  AuthManager,
  getUserDisplayLabel,
  resolveUserRole,
  getRoleNameFrameClasses,
} from '../core/authManager.ts';
import { SessionManager, type SessionStateSnapshot, type SessionStateStatus } from '../core/sessionManager.ts';
import {
  LogIn,
  LogOut,
  ShieldAlert,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { SessionAlertModal } from './SessionAlertModal.tsx';

export interface SessionBadgeDisplay {
  label: string;
  badgeStyle: string;
  dotStyle: string;
}

export function formatAccountStatusMessage(
  rawMessage: string | null | undefined,
  status?: SessionStateStatus
): string {
  if (!rawMessage) {
    if (status === 'DISPLACED') {
      return 'Tài khoản này đang được mở trên một thiết bị khác. Trận đấu hiện tại đã tạm dừng.';
    }
    if (status === 'PAUSED_IDLE' || status === 'EXPIRED') {
      return 'Tài khoản đã tạm dừng sau 5 phút không hoạt động. Vui lòng đăng nhập lại để tiếp tục.';
    }
    if (status === 'CONNECTION_LOST_UNVERIFIED') {
      return 'Mất kết nối mạng khi kiểm tra tài khoản. Trận đấu đang tạm dừng cho đến khi kết nối lại.';
    }
    return '';
  }

  return rawMessage
    .replace(/Phiên đăng nhập đã được mở trên một thiết bị khác/gi, 'Tài khoản này đang được mở trên một thiết bị khác')
    .replace(/Phiên làm việc đã tạm dừng sau 5 phút không hoạt động/gi, 'Tài khoản đã tạm dừng sau 5 phút không hoạt động')
    .replace(/Phiên đăng nhập/gi, 'Tài khoản')
    .replace(/Phiên làm việc/gi, 'Trạng thái hoạt động')
    .replace(/Phiên hoạt động/gi, 'Đã xác thực')
    .replace(/Bị chiếm phiên/gi, 'Đang mở ở thiết bị khác')
    .replace(/Phiên hết hạn/gi, 'Tạm dừng do ngưng thao tác')
    .replace(/quyền gia hạn phiên/gi, 'kết nối bảo mật tài khoản')
    .replace(/kích hoạt phiên/gi, 'kết nối máy chủ')
    .replace(/khởi tạo phiên/gi, 'kết nối máy chủ')
    .replace(/phiên chơi/gi, 'kết nối tài khoản');
}

export function getSessionBadgeInfo(
  status: SessionStateStatus,
  isProcessing: boolean,
  isHeartbeatInFlight: boolean,
  hasUser: boolean
): SessionBadgeDisplay {
  if (isProcessing && !hasUser) {
    return {
      label: 'Đang đăng nhập...',
      badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
      dotStyle: 'bg-amber-400 animate-pulse',
    };
  }

  if (!hasUser) {
    return {
      label: 'Chưa đăng nhập',
      badgeStyle: 'bg-neutral-800 text-neutral-400 border-neutral-700',
      dotStyle: 'bg-neutral-500',
    };
  }

  // User is authenticated with Google
  switch (status) {
    case 'ACQUIRING':
      return {
        label: 'Đang kiểm tra tài khoản...',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400 animate-pulse',
      };
    case 'ACTIVE':
      if (isHeartbeatInFlight) {
        return {
          label: 'Đang kiểm tra kết nối...',
          badgeStyle: 'bg-sky-950/80 text-sky-300 border-sky-800/80',
          dotStyle: 'bg-sky-400 animate-pulse',
        };
      }
      return {
        label: '',
        badgeStyle: 'hidden',
        dotStyle: 'bg-emerald-400',
      };
    case 'CONNECTION_LOST_UNVERIFIED':
      return {
        label: 'Mất kết nối',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400',
      };
    case 'DISPLACED':
      return {
        label: 'Đang mở ở thiết bị khác',
        badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        dotStyle: 'bg-rose-500',
      };
    case 'PAUSED_IDLE':
    case 'EXPIRED':
      return {
        label: 'Tạm dừng do ngưng thao tác',
        badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        dotStyle: 'bg-rose-500',
      };
    case 'NO_SESSION':
      return {
        label: 'Chưa kết nối máy chủ',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400',
      };
    case 'HEARTBEAT_REJECTED_UNCLASSIFIED':
    default:
      return {
        label: 'Cần xác thực',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400 animate-pulse',
      };
  }
}

interface AuthSessionBannerProps {
  onStartMatchAllowedChange?: (allowed: boolean) => void;
}

export const AuthSessionBanner: React.FC<AuthSessionBannerProps> = ({
  onStartMatchAllowedChange,
}) => {
  const authManager = AuthManager.getInstance();
  const sessionManager = SessionManager.getInstance();

  const [user, setUser] = useState(() => authManager.getCurrentUser());
  const [session, setSession] = useState<SessionStateSnapshot>(() => sessionManager.getSnapshot());
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  useEffect(() => {
    const unsubAuth = authManager.subscribe((u) => {
      setUser(u);
      if (u && sessionManager.getSnapshot().status === 'NO_SESSION') {
        sessionManager.acquireSession(u.uid);
      }
    });

    const unsubSession = sessionManager.subscribe((s) => {
      setSession(s);
      if (s.status === 'NO_SESSION' && s.message) {
        setFeedbackMsg({ type: 'error', text: formatAccountStatusMessage(s.message, s.status) });
      }
      if (onStartMatchAllowedChange) {
        onStartMatchAllowedChange(s.status === 'ACTIVE');
      }
    });

    return () => {
      unsubAuth();
      unsubSession();
    };
  }, [authManager, sessionManager, onStartMatchAllowedChange]);

  const handleSignIn = async () => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await authManager.signInWithGoogle();
      if (!res.isValid) {
        setFeedbackMsg({
          type: 'error',
          text: res.errorMessage || 'Đăng nhập không thành công.',
        });
      }
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: e?.message || 'Lỗi đăng nhập Google.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    setIsProcessing(true);
    try {
      await sessionManager.releaseSessionAndSignOut();
      setFeedbackMsg({ type: 'success', text: 'Đã đăng xuất an toàn.' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetryAcquire = async () => {
    if (!user) return;
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await sessionManager.acquireSession(user.uid);
      if (!res.success && res.message) {
        setFeedbackMsg({ type: 'error', text: formatAccountStatusMessage(res.message, session.status) });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReauth = async () => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await sessionManager.handleUserReauthenticate();
      setFeedbackMsg({
        type: res.success ? 'success' : 'error',
        text: formatAccountStatusMessage(res.message, session.status),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user)
  );

  return (
    <>
      {/* Top Banner Status Bar */}
      <div className="bg-neutral-950/90 border-b border-neutral-800/80 px-3 py-1.5 flex items-center justify-between text-xs text-neutral-300 shrink-0">
        <div className="flex items-center gap-2">
          {user ? (
            <div
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-neutral-900/90 ${getRoleNameFrameClasses(
                resolveUserRole(user)
              )}`}
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={getUserDisplayLabel(user)}
                  className="w-5 h-5 rounded-full object-cover border border-amber-500/40 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              <span className="font-bold text-amber-300 truncate max-w-[160px] sm:max-w-[220px]">
                {getUserDisplayLabel(user)}
              </span>
              {badgeInfo.label && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400">
              <span className={`w-2 h-2 rounded-full ${badgeInfo.dotStyle}`} />
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Đang đăng nhập...' : 'Chưa đăng nhập (Cần Gmail cá nhân để chơi)'}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-1.5">
              {session.status === 'NO_SESSION' && (
                <button
                  onClick={handleRetryAcquire}
                  disabled={isProcessing}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black transition-all font-bold text-[11px] active:scale-95 disabled:opacity-50"
                  title="Thử kết nối lại máy chủ"
                >
                  <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>Kết nối máy chủ</span>
                </button>
              )}
              <button
                onClick={handleSignOut}
                disabled={isProcessing}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all font-semibold active:scale-95 disabled:opacity-50"
              >
                <LogOut className="w-3 h-3 text-red-400" />
                <span>Đăng xuất</span>
              </button>
            </div>
          ) : (
            <button
              onClick={handleSignIn}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-black font-bold transition-all shadow active:scale-95 disabled:opacity-50"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Đang xác thực...' : 'Đăng nhập Google'}</span>
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`px-3 py-1.5 text-[11px] font-medium flex items-center justify-between ${
            feedbackMsg.type === 'error'
              ? 'bg-red-950/90 text-red-300 border-b border-red-800/80'
              : 'bg-emerald-950/90 text-emerald-300 border-b border-emerald-800/80'
          }`}
        >
          <span>{formatAccountStatusMessage(feedbackMsg.text, session.status)}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-neutral-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Protective Interruption Modal */}
      <SessionAlertModal
        session={session}
        isProcessing={isProcessing}
        onReauth={handleReauth}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    </>
  );
};
