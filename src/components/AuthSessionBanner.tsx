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
import { AvatarManager } from '../core/avatarManager.ts';
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
    if (status === 'DISPLACED') return 'Tài khoản này đang được mở trên một thiết bị khác. Trận đấu hiện tại đã tạm dừng.';
    if (status === 'PAUSED_IDLE' || status === 'EXPIRED') return 'Tài khoản đã tạm dừng sau 5 phút không hoạt động. Vui lòng đăng nhập lại để tiếp tục.';
    if (status === 'CONNECTION_LOST_UNVERIFIED') return 'Mất kết nối mạng khi kiểm tra tài khoản. Trận đấu đang tạm dừng cho đến khi kết nối lại.';
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
  if (isProcessing && !hasUser) return { label: 'ĐANG ĐĂNG NHẬP...', badgeStyle: 'bg-black text-neo-amber border-neo-amber', dotStyle: 'bg-neo-amber animate-pulse' };
  if (!hasUser) return { label: 'CHƯA ĐĂNG NHẬP', badgeStyle: 'bg-black text-gray-500 border-gray-700', dotStyle: 'bg-gray-500' };

  switch (status) {
    case 'ACQUIRING': return { label: 'ĐANG KIỂM TRA...', badgeStyle: 'bg-black text-neo-amber border-neo-amber', dotStyle: 'bg-neo-amber animate-pulse' };
    case 'ACTIVE':
      if (isHeartbeatInFlight) return { label: 'ĐANG KẾT NỐI...', badgeStyle: 'bg-black text-neo-cyan border-neo-cyan', dotStyle: 'bg-neo-cyan animate-pulse' };
      return { label: '', badgeStyle: 'hidden', dotStyle: 'bg-green-400' };
    case 'CONNECTION_LOST_UNVERIFIED': return { label: 'MẤT KẾT NỐI', badgeStyle: 'bg-black text-neo-amber border-neo-amber', dotStyle: 'bg-neo-amber' };
    case 'DISPLACED': return { label: 'ĐANG MỞ Ở THIẾT BỊ KHÁC', badgeStyle: 'bg-black text-neo-rose border-neo-rose', dotStyle: 'bg-neo-rose' };
    case 'PAUSED_IDLE':
    case 'EXPIRED': return { label: 'TẠM DỪNG (AFK)', badgeStyle: 'bg-black text-neo-rose border-neo-rose', dotStyle: 'bg-neo-rose' };
    case 'NO_SESSION': return { label: 'CHƯA KẾT NỐI MÁY CHỦ', badgeStyle: 'bg-black text-neo-amber border-neo-amber', dotStyle: 'bg-neo-amber' };
    case 'HEARTBEAT_REJECTED_UNCLASSIFIED':
    default: return { label: 'CẦN XÁC THỰC', badgeStyle: 'bg-black text-neo-amber border-neo-amber', dotStyle: 'bg-neo-amber animate-pulse' };
  }
}

interface AuthSessionBannerProps {
  onStartMatchAllowedChange?: (allowed: boolean) => void;
}

export const AuthSessionBanner: React.FC<AuthSessionBannerProps> = ({ onStartMatchAllowedChange }) => {
  const authManager = AuthManager.getInstance();
  const sessionManager = SessionManager.getInstance();
  const avatarManager = AvatarManager.getInstance();

  const [user, setUser] = useState(() => authManager.getCurrentUser());
  const [session, setSession] = useState<SessionStateSnapshot>(() => sessionManager.getSnapshot());
  const [, setAvatarTick] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
        onStartMatchAllowedChange(s.status === 'ACTIVE' || authManager.isTrialMode());
      }
    });

    const unsubAvatar = avatarManager.subscribe(() => setAvatarTick((t) => t + 1));
    return () => { unsubAuth(); unsubSession(); unsubAvatar(); };
  }, [authManager, sessionManager, avatarManager, onStartMatchAllowedChange]);

  const handleSignIn = async () => {
    setIsProcessing(true); setFeedbackMsg(null);
    try {
      const res = await authManager.signInWithGoogle();
      if (!res.isValid) setFeedbackMsg({ type: 'error', text: res.errorMessage || 'Đăng nhập không thành công.' });
    } catch (e: any) { setFeedbackMsg({ type: 'error', text: e?.message || 'Lỗi đăng nhập Google.' }); }
    finally { setIsProcessing(false); }
  };

  const handleSignOut = async () => {
    setIsProcessing(true);
    try {
      await sessionManager.releaseSessionAndSignOut();
      setFeedbackMsg({ type: 'success', text: 'Đã đăng xuất an toàn.' });
    } finally { setIsProcessing(false); }
  };

  const handleRetryAcquire = async () => {
    if (!user) return;
    setIsProcessing(true); setFeedbackMsg(null);
    try {
      const res = await sessionManager.acquireSession(user.uid);
      if (!res.success && res.message) setFeedbackMsg({ type: 'error', text: formatAccountStatusMessage(res.message, session.status) });
    } finally { setIsProcessing(false); }
  };

  const handleReauth = async () => {
    setIsProcessing(true); setFeedbackMsg(null);
    try {
      const res = await sessionManager.handleUserReauthenticate();
      setFeedbackMsg({ type: res.success ? 'success' : 'error', text: formatAccountStatusMessage(res.message, session.status) });
    } finally { setIsProcessing(false); }
  };

  const isTrialMode = authManager.isTrialMode();
  const badgeInfo = getSessionBadgeInfo(session.status, isProcessing, session.isHeartbeatInFlight ?? false, Boolean(user));
  const effectiveAvatarUrl = user ? avatarManager.getEffectivePlayerAvatarUrl({ uid: user.uid, photoURL: user.photoURL }) : null;

  return (
    <>
      <div className="bg-black/90 border-b-2 border-neo-amber/50 px-3 py-1.5 flex items-center justify-between text-xs text-white shrink-0 font-display">
        <div className="flex items-center gap-2">
          {user ? (
            <div className={`flex items-center gap-2 px-2 py-0.5 rounded-sm bg-black border border-neo-amber ${getRoleNameFrameClasses(resolveUserRole(user))}`}>
              {effectiveAvatarUrl ? (
                <img src={effectiveAvatarUrl} alt={getUserDisplayLabel(user)} className="w-5 h-5 pixel-corners object-cover border border-neo-amber shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-neo-cyan shrink-0" />
              )}
              <span className="font-pixel text-lg text-neo-amber truncate max-w-[160px] sm:max-w-[220px]">
                {getUserDisplayLabel(user)}
              </span>
              {badgeInfo.label && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-pixel ${badgeInfo.badgeStyle}`}>
                  {badgeInfo.label}
                </span>
              )}
            </div>
          ) : isTrialMode ? (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-black border border-neo-amber text-neo-amber font-pixel text-lg">
              <span className="w-2 h-2 rounded-sm bg-neo-amber animate-pulse" />
              <span>TRIAL MODE • STAGE 1 (NO SAVE)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-neo-amber font-pixel text-lg">
              <span className={`w-2 h-2 rounded-sm ${badgeInfo.dotStyle}`} />
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'AUTHENTICATING...' : 'NO LOGIN (REQUIRE GMAIL)'}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-1.5">
              {session.status === 'NO_SESSION' && (
                <button onClick={handleRetryAcquire} disabled={isProcessing} className="btn-arcade-outline px-2 py-0.5 text-xs flex items-center gap-1" title="Thử kết nối lại máy chủ">
                  <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>RECONNECT</span>
                </button>
              )}
              <button onClick={handleSignOut} disabled={isProcessing} className="btn-arcade-outline !border-neo-rose !text-neo-rose px-2.5 py-1 flex items-center gap-1">
                <LogOut className="w-3 h-3" />
                <span>LOGOUT</span>
              </button>
            </div>
          ) : (
            <button onClick={handleSignIn} disabled={isProcessing} className="btn-arcade px-3 py-1 flex items-center gap-1.5 text-xs">
              <LogIn className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'AUTH...' : 'GOOGLE LOGIN'}</span>
            </button>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div className={`px-3 py-1.5 font-pixel text-lg flex items-center justify-between ${feedbackMsg.type === 'error' ? 'bg-black text-neo-rose border-b-2 border-neo-rose' : 'bg-black text-neo-cyan border-b-2 border-neo-cyan'}`}>
          <span>{formatAccountStatusMessage(feedbackMsg.text, session.status)}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-gray-400 hover:text-white px-1">✕</button>
        </div>
      )}

      <SessionAlertModal session={session} isProcessing={isProcessing} onReauth={handleReauth} onSignIn={handleSignIn} onSignOut={handleSignOut} />
    </>
  );
};
