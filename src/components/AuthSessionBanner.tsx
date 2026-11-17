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
  getRoleTrademarkBadge,
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
  Settings,
  Info,
  Wrench,
} from 'lucide-react';
import { SessionAlertModal } from './SessionAlertModal.tsx';
import { QuickAudioToggleButton } from './QuickAudioToggleButton.tsx';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage, type SupportedLanguage } from '../core/i18n.ts';

export interface SessionBadgeDisplay {
  label: string;
  badgeStyle: string;
  dotStyle: string;
}

export function formatAccountStatusMessage(
  rawMessage: string | null | undefined,
  status?: SessionStateStatus,
  lang: SupportedLanguage = 'vi'
): string {
  if (!rawMessage) {
    if (status === 'DISPLACED') {
      return lang === 'en'
        ? 'This account is currently active on another device. The current match is paused.'
        : 'Tài khoản này đang được mở trên một thiết bị khác. Trận đấu hiện tại đã tạm dừng.';
    }
    if (status === 'PAUSED_IDLE' || status === 'EXPIRED') {
      return lang === 'en'
        ? 'Account session paused due to inactivity. Please sign in again to continue.'
        : 'Tài khoản đã tạm dừng sau 5 phút không hoạt động. Vui lòng đăng nhập lại để tiếp tục.';
    }
    if (status === 'CONNECTION_LOST_UNVERIFIED') {
      return lang === 'en'
        ? 'Network connection lost while verifying account. Match is paused until reconnected.'
        : 'Mất kết nối mạng khi kiểm tra tài khoản. Trận đấu đang tạm dừng cho đến khi kết nối lại.';
    }
    return '';
  }

  return rawMessage
    .replace(/Phiên đăng nhập đã được mở trên một thiết bị khác/gi, 'Tài khoản này đang được mở trên một thiết bị khác')
    .replace(/Phiên làm việc đã tạm dừng sau 5 phút không hoạt động/gi, 'Tài khoản đã tạm dừng sau 5 phút không hoạt động')
    .replace(/Phiên đăng nhập/gi, 'Tài khoản')
    .replace(/Phiên làm việc/gi, 'Trạng thái online')
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
  hasUser: boolean,
  lang: SupportedLanguage = 'vi'
): SessionBadgeDisplay {
  const isEn = lang === 'en';
  if (isProcessing && !hasUser) {
    return {
      label: isEn ? 'Signing in...' : 'Đang đăng nhập...',
      badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
      dotStyle: 'bg-amber-400 animate-pulse',
    };
  }

  if (!hasUser) {
    return {
      label: isEn ? 'Not signed in' : 'Chưa đăng nhập',
      badgeStyle: 'bg-neutral-800 text-neutral-400 border-neutral-700',
      dotStyle: 'bg-neutral-500',
    };
  }

  // User is authenticated with Google
  switch (status) {
    case 'ACQUIRING':
      return {
        label: isEn ? 'Verifying account...' : 'Đang kiểm tra tài khoản...',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400 animate-pulse',
      };
    case 'ACTIVE':
      if (isHeartbeatInFlight) {
        return {
          label: isEn ? 'Checking connection...' : 'Đang kiểm tra kết nối...',
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
        label: isEn ? 'Connection lost' : 'Mất kết nối',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400',
      };
    case 'DISPLACED':
      return {
        label: isEn ? 'Active on another device' : 'Đang mở ở thiết bị khác',
        badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        dotStyle: 'bg-rose-500',
      };
    case 'PAUSED_IDLE':
    case 'EXPIRED':
      return {
        label: isEn ? 'Paused due to inactivity' : 'Tạm dừng do ngưng thao tác',
        badgeStyle: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
        dotStyle: 'bg-rose-500',
      };
    case 'NO_SESSION':
      return {
        label: isEn ? 'Server disconnected' : 'Chưa kết nối máy chủ',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400',
      };
    case 'HEARTBEAT_REJECTED_UNCLASSIFIED':
    default:
      return {
        label: isEn ? 'Verification required' : 'Cần xác thực',
        badgeStyle: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
        dotStyle: 'bg-amber-400 animate-pulse',
      };
  }
}

interface AuthSessionBannerProps {
  onStartMatchAllowedChange?: (allowed: boolean) => void;
  isBattleScreen?: boolean;
  isSuperAdmin?: boolean;
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onOpenDevTools?: () => void;
}

export const AuthSessionBanner: React.FC<AuthSessionBannerProps> = ({
  onStartMatchAllowedChange,
  isBattleScreen = false,
  isSuperAdmin = false,
  onOpenSettings,
  onOpenSupport,
  onOpenDevTools,
}) => {
  const { lang: language, t } = useLanguage();
  const authManager = AuthManager.getInstance();
  const sessionManager = SessionManager.getInstance();
  const avatarManager = AvatarManager.getInstance();

  const [user, setUser] = useState(() => authManager.getCurrentUser());
  const [session, setSession] = useState<SessionStateSnapshot>(() => sessionManager.getSnapshot());
  const [, setAvatarTick] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (user?.uid) {
      avatarManager.observeUserMetadata(user.uid);
    }
    const unsubAuth = authManager.subscribe((u) => {
      setUser(u);
      if (u?.uid) {
        avatarManager.observeUserMetadata(u.uid);
      }
      if (u && sessionManager.getSnapshot().status === 'NO_SESSION') {
        sessionManager.acquireSession(u.uid);
      }
    });

    const unsubSession = sessionManager.subscribe((s) => {
      setSession(s);
      if (s.status === 'NO_SESSION' && s.message) {
        setFeedbackMsg({ type: 'error', text: formatAccountStatusMessage(s.message, s.status, language) });
      }
      if (onStartMatchAllowedChange) {
        onStartMatchAllowedChange(s.status === 'ACTIVE' || authManager.isTrialMode());
      }
    });

    const unsubAvatar = avatarManager.subscribe(() => {
      setAvatarTick((t) => t + 1);
    });

    return () => {
      unsubAuth();
      unsubSession();
      unsubAvatar();
    };
  }, [authManager, sessionManager, avatarManager, user?.uid, onStartMatchAllowedChange, language]);

  const handleSignIn = async () => {
    setIsProcessing(true);
    setFeedbackMsg(null);
    try {
      const res = await authManager.signInWithGoogle();
      if (!res.isValid) {
        setFeedbackMsg({
          type: 'error',
          text: res.errorMessage || t('Đăng nhập không thành công.', 'Sign-in failed.'),
        });
      }
    } catch (e: any) {
      setFeedbackMsg({
        type: 'error',
        text: e?.message || t('Lỗi đăng nhập Google.', 'Google sign-in error.'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSignOut = async () => {
    setIsProcessing(true);
    try {
      await sessionManager.releaseSessionAndSignOut();
      setFeedbackMsg({
        type: 'success',
        text: t('Đã đăng xuất an toàn.', 'Signed out safely.'),
      });
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
        setFeedbackMsg({
          type: 'error',
          text: formatAccountStatusMessage(res.message, session.status, language),
        });
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
        text: formatAccountStatusMessage(res.message, session.status, language),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isTrialMode = authManager.isTrialMode();

  const badgeInfo = getSessionBadgeInfo(
    session.status,
    isProcessing,
    session.isHeartbeatInFlight ?? false,
    Boolean(user),
    language
  );

  const effectiveAvatarUrl = user
    ? avatarManager.getEffectivePlayerAvatarUrl({
        uid: user.uid,
        photoURL: user.photoURL,
      })
    : null;

  return (
    <>
      {/* Top Banner Status Bar — Frameless Player Name & Unified Action Menu */}
      <div className="bg-[#050510]/95 border-b border-[#00F0FF]/25 px-3 py-1.5 flex items-center justify-between gap-2 text-xs sm:text-sm text-[#EAF4FF] shrink-0 z-40">
        <div className="flex items-center gap-2 min-w-0">
          {user ? (
            (() => {
              const profileMeta = user.uid ? avatarManager.getUserMetadata(user.uid) : null;
              const effectiveUser = {
                ...user,
                displayName: profileMeta?.displayName || user.displayName,
              };
              const displayLabel = getUserDisplayLabel(effectiveUser);
              const userRole = resolveUserRole(user);
              void getRoleNameFrameClasses(userRole);
              const roleTrademarkBadge = getRoleTrademarkBadge(userRole);
              return (
                <div className="flex items-center gap-1.5 px-1 py-0.5 min-w-0">
                  {effectiveAvatarUrl ? (
                    <img
                      src={effectiveAvatarUrl}
                      alt={displayLabel}
                      className="w-5 h-5 rounded-full object-cover shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <UserCheck className="w-4 h-4 text-[#00F0FF] shrink-0" />
                  )}
                  <span className="inline-flex items-baseline font-bold text-[#FFB800] text-sm min-w-0">
                    <span className="truncate max-w-[140px] sm:max-w-[220px]">
                      {displayLabel}
                    </span>
                    {roleTrademarkBadge && (
                      <sup
                        data-testid="role-trademark-badge"
                        className="ml-0.5 text-[10px] font-black leading-none text-[#FFB800] select-none shrink-0"
                      >
                        {roleTrademarkBadge}
                      </sup>
                    )}
                  </span>
                  {badgeInfo.label && (
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium shrink-0 ${badgeInfo.badgeStyle}`}>
                      {badgeInfo.label}
                    </span>
                  )}
                </div>
              );
            })()
          ) : isTrialMode ? (
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-[#FFB800] font-bold">
              <span className="w-2 h-2 rounded-full bg-[#FFB800] animate-pulse" />
              <span>
                {t(
                  'Chơi thử • Stage 1',
                  'Trial • Stage 1'
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[#FFB800]">
              <span className={`w-2 h-2 rounded-full ${badgeInfo.dotStyle}`} />
              <AlertTriangle className="w-4 h-4" />
              <span>
                {isProcessing
                  ? t('Đang đăng nhập...', 'Signing in...')
                  : t(
                      'Chưa đăng nhập',
                      'Not signed in'
                    )}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {isBattleScreen && (
            <>
              <QuickAudioToggleButton frameless />

              {onOpenSettings && !isTrialMode && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  aria-label={t('Cài đặt', 'Settings')}
                  className="flex items-center justify-center p-1.5 rounded bg-transparent hover:bg-white/10 border-0 text-[#EAF4FF] transition-all cursor-pointer shrink-0"
                  title={t('Cài đặt', 'Settings')}
                >
                  <Settings className="w-4 h-4 text-[#FFB800]" />
                </button>
              )}

              {onOpenSupport && (
                <button
                  type="button"
                  onClick={onOpenSupport}
                  aria-label={t('Thông tin', 'Information')}
                  className="flex items-center justify-center p-1.5 rounded bg-transparent hover:bg-white/10 border-0 text-[#EAF4FF] transition-all cursor-pointer shrink-0"
                  title={t('Thông tin', 'Information')}
                >
                  <Info className="w-4 h-4 text-[#00F0FF]" />
                </button>
              )}

              {isSuperAdmin && onOpenDevTools && (
                <button
                  type="button"
                  onClick={onOpenDevTools}
                  className="font-btn flex items-center gap-1 px-2 py-1 rounded bg-transparent hover:bg-white/10 border-0 text-[#EAF4FF] text-xs font-semibold transition-all cursor-pointer shrink-0"
                  title={t('Bảng Kiểm thử & QA (Admin)', 'QA Suite (Admin)')}
                >
                  <Wrench className="w-4 h-4 text-[#FFB800]" />
                  <span className="hidden sm:inline">QA</span>
                </button>
              )}
            </>
          )}

          {user ? (
            <div className="flex items-center gap-1.5">
              {session.status === 'NO_SESSION' && (
                <button
                  onClick={handleRetryAcquire}
                  disabled={isProcessing}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] transition-all font-bold text-xs active:scale-95 disabled:opacity-50"
                  title={t('Thử kết nối lại', 'Retry connection')}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{t('Kết nối', 'Connect')}</span>
                </button>
              )}
              {!isBattleScreen && (
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isProcessing}
                  title={t('Đăng xuất', 'Sign Out')}
                  aria-label={t('Đăng xuất', 'Sign Out')}
                  className="flex items-center justify-center p-1.5 rounded bg-transparent hover:bg-white/10 border-0 text-[#EAF4FF] transition-all font-semibold active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-[#FF0055]" />
                </button>
              )}
            </div>
          ) : !isBattleScreen ? (
            <button
              onClick={handleSignIn}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-bold transition-all shadow active:scale-95 disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {isProcessing
                  ? t('Đang xác thực...', 'Authenticating...')
                  : t('Đăng nhập Google', 'Sign in with Google')}
              </span>
            </button>
          ) : null}
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
          <span className="whitespace-pre-line">
            {formatSentenceLineBreaks(formatAccountStatusMessage(feedbackMsg.text, session.status, language))}
          </span>
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
