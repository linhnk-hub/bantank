/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AuthManager } from '../core/authManager.ts';
import { SessionManager, type SessionStateSnapshot } from '../core/sessionManager.ts';
import {
  LogIn,
  LogOut,
  ShieldAlert,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';

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

  const handleReauth = async () => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await sessionManager.handleUserReauthenticate();
      setFeedbackMsg({
        type: res.success ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 1. Session Alert Modal for unclassified pause, displaced, or idle timeout
  const showModal =
    session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' ||
    session.status === 'DISPLACED' ||
    session.status === 'PAUSED_IDLE' ||
    session.status === 'CONNECTION_LOST_UNVERIFIED';

  return (
    <>
      {/* Top Banner Status Bar */}
      <div className="bg-neutral-950/90 border-b border-neutral-800/80 px-3 py-1.5 flex items-center justify-between text-xs text-neutral-300 shrink-0">
        <div className="flex items-center gap-2">
          {user ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-semibold text-neutral-200 truncate max-w-[140px] sm:max-w-[200px]">
                {user.email}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                {session.status === 'ACTIVE' ? 'Phiên hợp lệ' : 'Đang đồng bộ...'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Chưa đăng nhập (Cần Gmail cá nhân để chơi)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <button
              onClick={handleSignOut}
              disabled={isProcessing}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-all font-semibold active:scale-95 disabled:opacity-50"
            >
              <LogOut className="w-3 h-3 text-red-400" />
              <span>Đăng xuất</span>
            </button>
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
          <span>{feedbackMsg.text}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-neutral-400 hover:text-white px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Protective Interruption Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center bg-amber-500/10 border border-amber-500/30 text-amber-400">
              {session.status === 'CONNECTION_LOST_UNVERIFIED' ? (
                <WifiOff className="w-6 h-6" />
              ) : (
                <ShieldAlert className="w-6 h-6" />
              )}
            </div>

            <div>
              <h3 className="text-base font-extrabold text-white">
                {session.status === 'DISPLACED' && 'Tài Khoản Đang Mở Ở Thiết Bị Khác'}
                {session.status === 'PAUSED_IDLE' && 'Phiên Đăng Nhập Hết Hạn'}
                {session.status === 'CONNECTION_LOST_UNVERIFIED' && 'Mất Kết Nối Máy Chủ'}
                {session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && 'Bảo Vệ Tài Khoản Người Chơi'}
              </h3>
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                {session.message ||
                  'Không thể xác minh quyền gia hạn phiên. Trận đấu đang tạm dừng để bảo vệ tài khoản.'}
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {session.status === 'HEARTBEAT_REJECTED_UNCLASSIFIED' && (
                <button
                  onClick={handleReauth}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-all shadow disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Đang kiểm tra...' : 'Thử xác thực lại'}</span>
                </button>
              )}

              {session.status === 'CONNECTION_LOST_UNVERIFIED' && (
                <button
                  onClick={handleReauth}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Đang kết nối lại...' : 'Kết nối lại máy chủ'}</span>
                </button>
              )}

              {session.status !== 'ACTIVE' && (
                <button
                  onClick={handleSignIn}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold transition-all border border-neutral-700"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Đăng nhập lại bằng Google</span>
                </button>
              )}

              <button
                onClick={handleSignOut}
                disabled={isProcessing}
                className="w-full py-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 text-[11px] transition-all"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
