/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  PlusCircle,
  LogIn,
  Copy,
  Check,
  Users,
  ShieldCheck,
  Play,
  ArrowLeft,
  AlertCircle,
  Loader2,
  UserCheck,
  Flame,
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Map as MapIcon,
  UserX,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  CoopOnlineManager,
  type CoopRoomDocument,
  type CoopPlayerRole,
} from '../core/coopOnlineManager.ts';
import {
  resolveUserRole,
  getRoleNameFrameClasses,
  getRoleTrademarkBadge,
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { StageProgressionManager } from '../core/stageProgression.ts';
import { StageManager } from '../core/stageManager.ts';
import { StageMapMiniPreview } from './StageMapMiniPreview.tsx';
import { useLanguage } from '../core/i18n.ts';

export type CoopLobbySubView = 'MAIN' | 'CREATE' | 'JOIN';

interface CoopOnlineLobbyPanelProps {
  user: User | null;
  difficulty: 'DEFAULT' | 'EXTREME';
  onDifficultyChange?: (diff: 'DEFAULT' | 'EXTREME') => void;
  onBackToDifficulty: () => void;
  onOnlineMatchStarted: (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => void;
  subView?: CoopLobbySubView;
  onSubViewChange?: (view: CoopLobbySubView) => void;
}

export const CoopOnlineLobbyPanel: React.FC<CoopOnlineLobbyPanelProps> = ({
  user,
  difficulty,
  onDifficultyChange,
  onBackToDifficulty: _onBackToDifficulty,
  onOnlineMatchStarted,
  subView: controlledSubView,
  onSubViewChange,
}) => {
  const { t } = useLanguage();
  const coopManager = CoopOnlineManager.getInstance();
  const avatarManager = AvatarManager.getInstance();
  const [room, setRoom] = useState<CoopRoomDocument | null>(() => coopManager.getCurrentRoom());
  const [role, setRole] = useState<CoopPlayerRole>(() => coopManager.getRole());
  const [internalSubView, setInternalSubView] = useState<CoopLobbySubView>('MAIN');

  const subView = controlledSubView ?? internalSubView;
  const setSubView = (nextView: CoopLobbySubView) => {
    setInternalSubView(nextView);
    onSubViewChange?.(nextView);
  };

  // Create Room config state (M7.3.7 Mục VI.5.2)
  const [createDifficulty, setCreateDifficulty] = useState<'DEFAULT' | 'EXTREME'>(difficulty);
  const [createHasPassword, setCreateHasPassword] = useState<boolean>(true); // Mặc định: Có mật khẩu
  const [createPasswordInput, setCreatePasswordInput] = useState<string>('');
  const [userStageProgress, setUserStageProgress] = useState(() =>
    StageProgressionManager.getInstance().getUserStageProgressSnapshot(user?.uid)
  );
  const [createStageId, setCreateStageId] = useState<number>(() =>
    StageProgressionManager.getInstance().getUnlockedStageForUser(user?.uid, false)
  );

  // Join Room state (M7.3.7 Mục VI.5.3)
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [needsPasswordForCode, setNeedsPasswordForCode] = useState<boolean>(false);
  const [kickedNotice, setKickedNotice] = useState<string | null>(() =>
    coopManager.getLastKickedNotice()
  );

  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setRoleTick] = useState(0);
  const [hostAvatarBroken, setHostAvatarBroken] = useState(false);
  const [guestAvatarBroken, setGuestAvatarBroken] = useState(false);

  const onOnlineMatchStartedRef = useRef(onOnlineMatchStarted);
  const onDifficultyChangeRef = useRef(onDifficultyChange);
  const launchedMatchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onOnlineMatchStartedRef.current = onOnlineMatchStarted;
  }, [onOnlineMatchStarted]);

  useEffect(() => {
    onDifficultyChangeRef.current = onDifficultyChange;
  }, [onDifficultyChange]);

  useEffect(() => {
    setCreateDifficulty(difficulty);
  }, [difficulty]);

  const stageManager = StageManager.getInstance();
  const [, setStageCatalogRev] = useState(0);

  useEffect(() => {
    return stageManager.subscribe(() => {
      setStageCatalogRev((r) => r + 1);
    });
  }, [stageManager]);

  useEffect(() => {
    const progMgr = StageProgressionManager.getInstance();
    const syncProg = () => {
      const snap = progMgr.getUserStageProgressSnapshot(user?.uid);
      setUserStageProgress(snap);
      setCreateStageId((prev) => (prev > snap.unlockedStage ? snap.unlockedStage : prev));
    };
    syncProg();
    return progMgr.subscribe(syncProg);
  }, [user?.uid]);

  useEffect(() => {
    const handleRoomTransition = (
      updatedRoom: CoopRoomDocument | null,
      updatedRole: CoopPlayerRole
    ) => {
      if (
        updatedRoom &&
        updatedRoom.status === 'PLAYING' &&
        (updatedRole === 'HOST' || updatedRole === 'GUEST')
      ) {
        const matchKey = `${updatedRoom.roomCode}:${updatedRoom.createdAt}`;
        if (launchedMatchKeyRef.current !== matchKey) {
          launchedMatchKeyRef.current = matchKey;
          onDifficultyChangeRef.current?.(updatedRoom.difficulty);
          onOnlineMatchStartedRef.current(updatedRoom, updatedRole);
        }
      } else {
        launchedMatchKeyRef.current = null;
      }
    };

    const unsub = coopManager.subscribe((updatedRoom, updatedRole) => {
      setRoom(updatedRoom);
      setRole(updatedRole);
      setKickedNotice(coopManager.getLastKickedNotice());
      if (updatedRoom) {
        if (updatedRoom.hostUid) {
          void avatarManager.fetchUserMetadataOnce(updatedRoom.hostUid).then(() => {
            setRoleTick((t) => t + 1);
          });
        }
        if (updatedRoom.guestUid) {
          void avatarManager.fetchUserMetadataOnce(updatedRoom.guestUid).then(() => {
            setRoleTick((t) => t + 1);
          });
        }
      }
      handleRoomTransition(updatedRoom, updatedRole);
    });

    handleRoomTransition(coopManager.getCurrentRoom(), coopManager.getRole());
    const unsubAvatar = avatarManager.subscribe(() => {
      setHostAvatarBroken(false);
      setGuestAvatarBroken(false);
      setRoleTick((t) => t + 1);
    });

    return () => {
      unsub();
      unsubAvatar();
    };
  }, [coopManager, avatarManager]);

  // Fail-safe cho Guest (P2) khi cả hai đã Sẵn sàng: chủ động đồng bộ trạng thái phòng từ máy chủ đề phòng snapshot/P2P bị trễ
  useEffect(() => {
    if (
      !room ||
      room.status !== 'WAITING' ||
      role !== 'GUEST' ||
      !room.hostReady ||
      !room.guestReady
    ) {
      return;
    }
    const pollTimer = setInterval(() => {
      void coopManager.refreshRoomFromCloud(true);
    }, 1200);
    return () => clearInterval(pollTimer);
  }, [coopManager, role, room?.roomCode, room?.status, room?.hostReady, room?.guestReady]);

  const handleConfirmCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    coopManager.clearLastKickedNotice();
    setKickedNotice(null);
    setIsBusy(true);
    try {
      onDifficultyChange?.(createDifficulty);
      const res = await coopManager.createRoom(user, createDifficulty, undefined, {
        hasPassword: createHasPassword,
        password: createHasPassword ? createPasswordInput : undefined,
        stageId: createStageId,
      });
      if (!res.success) {
        setErrorMsg(res.message || 'Không thể tạo phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoomByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    coopManager.clearLastKickedNotice();
    setKickedNotice(null);
    setIsBusy(true);
    try {
      const res = await coopManager.joinRoom(joinCodeInput, user, Date.now(), {
        password: joinPasswordInput.trim() ? joinPasswordInput : undefined,
      });
      if (!res.success) {
        if (res.errorCode === 'PASSWORD_REQUIRED' || res.errorCode === 'WRONG_PASSWORD') {
          setNeedsPasswordForCode(true);
        }
        setErrorMsg(res.message || 'Không thể tham gia phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleKickGuest = async () => {
    if (!room || role !== 'HOST' || !room.guestUid) return;
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await coopManager.kickGuest();
      if (!res.success) {
        setErrorMsg(res.message || 'Không thể mời P2 ra khỏi phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!room || !coopManager.isRoomSignalingReady()) return;
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleToggleReady = async () => {
    if (!room || !role) return;
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const currentReady = role === 'HOST' ? room.hostReady : room.guestReady;
      const res = await coopManager.setPlayerReady(!currentReady);
      if (!res.success) {
        setErrorMsg(res.message || 'Lỗi cập nhật trạng thái Sẵn sàng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleHostStartMatch = async () => {
    if (!room || !user || role !== 'HOST') return;
    setErrorMsg(null);
    setIsBusy(true);
    try {
      onDifficultyChange?.(room.difficulty);
      const res = await coopManager.startOnlineMatch(user.uid);
      if (!res.success) {
        setErrorMsg(res.message || 'Chưa thể bắt đầu trận đấu.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleLeaveLobby = async () => {
    setIsBusy(true);
    try {
      await coopManager.leaveRoom();
      setSubView('MAIN');
      setErrorMsg(null);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRetryWebRTC = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await coopManager.retryWebRTCConnection();
      if (!res.success && res.message) {
        setErrorMsg(res.message);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const signalingReady = coopManager.isRoomSignalingReady();

  // ===========================================================================
  // CHƯA Ở TRONG PHÒNG CHỜ: ĐIỀU HƯỚNG 3 BƯỚC (MAIN / CREATE / JOIN)
  // ===========================================================================
  if (
    !room ||
    !signalingReady ||
    room.status === 'FINISHED' ||
    room.status === 'ABANDONED' ||
    room.status === 'EXPIRED'
  ) {
    return (
      <div className="space-y-4">
        {kickedNotice && (
          <div
            data-testid="coop-lobby-kicked-notice"
            className="p-3 rounded-xl bg-amber-950/75 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="whitespace-pre-line">{formatSentenceLineBreaks(kickedNotice)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                coopManager.clearLastKickedNotice();
                setKickedNotice(null);
              }}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[11px] shrink-0 whitespace-nowrap cursor-pointer"
            >
              {t('Đóng', 'Close')}
            </button>
          </div>
        )}

        {room && (room.status === 'ABANDONED' || room.status === 'EXPIRED') && (
          <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2">
            <span className="whitespace-pre-line">
              {formatSentenceLineBreaks(
                room.disconnectReason || t('Phòng chơi trước đã kết thúc.', 'Previous room has ended.')
              )}
            </span>
            <button
              type="button"
              onClick={() => void coopManager.leaveRoom()}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[11px] cursor-pointer"
            >
              {t('Đóng', 'Close')}
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="whitespace-pre-line">{formatSentenceLineBreaks(errorMsg)}</span>
          </div>
        )}

        {/* MÀN HÌNH ĐẦU TIÊN (MAIN): CHỈ HIỂN THỊ 2 LỰA CHỌN CHÍNH: 1. TẠO PHÒNG & 2. THAM GIA PHÒNG */}
        {subView === 'MAIN' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. TẠO PHÒNG */}
              <div className="p-5 rounded-lg neo-bevel-card bg-[#0b0d1e]/95 border-2 border-[#00F0FF]/50 hover:border-[#00F0FF] transition-all flex flex-col justify-between space-y-4 shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded bg-[#00F0FF]/15 border border-[#00F0FF]/40 flex items-center justify-center text-[#00F0FF]">
                      <PlusCircle className="w-6 h-6" />
                    </div>
                    <span className="font-btn text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded bg-[#051624] text-[#00F0FF] border border-[#00F0FF]/40">
                      {t('Chủ Phòng • P1', 'Room Host • P1')}
                    </span>
                  </div>
                  <h3 className="font-btn text-base sm:text-lg font-black uppercase tracking-wider text-[#EAF4FF]">
                    {t('1. TẠO PHÒNG', '1. CREATE ROOM')}
                  </h3>
                  <p className="text-xs text-[#EAF4FF]/80 leading-relaxed">
                    {t(
                      'Thiết lập độ khó chiến dịch (Giải trí / Thử thách) và chế độ bảo mật phòng (Có mật khẩu hoặc Không mật khẩu).',
                      'Configure campaign difficulty (Casual / Challenge) and room security mode (Password-protected or Public).'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="coop-lobby-open-create-btn"
                  onClick={() => {
                    setErrorMsg(null);
                    setSubView('CREATE');
                  }}
                  className="font-btn w-full min-h-[48px] py-3 px-4 neo-clip-corner bg-[#00F0FF] hover:bg-cyan-300 text-[#050510] font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] cursor-pointer touch-manipulation"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{t('TẠO PHÒNG', 'CREATE ROOM')}</span>
                </button>
              </div>

              {/* 2. THAM GIA PHÒNG */}
              <div className="p-5 rounded-lg neo-bevel-card bg-[#0b0d1e]/95 border-2 border-[#FFB800]/50 hover:border-[#FFB800] transition-all flex flex-col justify-between space-y-4 shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded bg-[#FFB800]/15 border border-[#FFB800]/40 flex items-center justify-center text-[#FFB800]">
                      <LogIn className="w-6 h-6" />
                    </div>
                    <span className="font-btn text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded bg-[#120e05] text-[#FFB800] border border-[#FFB800]/40">
                      {t('Đồng Đội • P2', 'Partner • P2')}
                    </span>
                  </div>
                  <h3 className="font-btn text-base sm:text-lg font-black uppercase tracking-wider text-[#EAF4FF]">
                    {t('2. THAM GIA PHÒNG', '2. JOIN ROOM')}
                  </h3>
                  <p className="text-xs text-[#EAF4FF]/80 leading-relaxed">
                    {t(
                      'Nhập Mã phòng định dạng BTxxxx (và mật khẩu nếu phòng có khóa) để tham gia phối hợp cùng đồng đội.',
                      'Enter a BTxxxx room code (and password if locked) to join and fight alongside your partner.'
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="coop-lobby-open-join-btn"
                  onClick={() => {
                    setErrorMsg(null);
                    setSubView('JOIN');
                  }}
                  className="font-btn w-full min-h-[48px] py-3 px-4 neo-clip-corner bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] cursor-pointer touch-manipulation"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{t('THAM GIA PHÒNG', 'JOIN ROOM')}</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* LUỒNG 1: TẠO PHÒNG (M7.3.7 MỤC VI.5.2) */}
        {subView === 'CREATE' && (
          <form
            onSubmit={handleConfirmCreateRoom}
            className="p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                    {t('CẤU HÌNH PHÒNG', 'ROOM CONFIGURATION')}
                  </h3>
                </div>
              </div>
            </div>

            {/* 1. Chọn độ khó */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-300">
                {t('1. Chọn độ khó', '1. Select Difficulty')}
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setCreateDifficulty('DEFAULT')}
                  className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                    createDifficulty === 'DEFAULT'
                      ? 'bg-amber-950/40 border-amber-500 text-amber-200 ring-1 ring-amber-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-black text-xs sm:text-sm truncate">
                        {t('Giải trí', 'Casual')}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        {t('3 mạng • 120s', '3 Lives • 120s')}
                      </div>
                    </div>
                  </div>
                  {createDifficulty === 'DEFAULT' && (
                    <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-amber-500 text-black font-black font-mono shrink-0">
                      {t('CHỌN', 'ON')}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCreateDifficulty('EXTREME')}
                  className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                    createDifficulty === 'EXTREME'
                      ? 'bg-rose-950/40 border-rose-500 text-rose-200 ring-1 ring-rose-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-black text-xs sm:text-sm truncate">
                        {t('Thử thách', 'Challenge')}
                      </div>
                      <div className="text-[10px] text-neutral-400 truncate">
                        {t('1 mạng • 60s', '1 Life • 60s')}
                      </div>
                    </div>
                  </div>
                  {createDifficulty === 'EXTREME' && (
                    <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-rose-600 text-white font-black font-mono shrink-0">
                      {t('CHỌN', 'ON')}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 2. Cấu hình mật khẩu phòng */}
            <div className="space-y-2.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-sky-300">
                {t('2. Chế độ bảo mật phòng', '2. Room Security Mode')}
              </label>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {/* Mặc định: Có mật khẩu */}
                <button
                  type="button"
                  onClick={() => setCreateHasPassword(true)}
                  className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                    createHasPassword
                      ? 'bg-sky-950/40 border-sky-500 text-sky-200 ring-1 ring-sky-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400 shrink-0" />
                    <div className="font-black text-xs sm:text-sm truncate">
                      {t('Có mật khẩu', 'Password')}
                    </div>
                  </div>
                  {createHasPassword && (
                    <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-sky-500 text-black font-black font-mono shrink-0">
                      {t('CHỌN', 'ON')}
                    </span>
                  )}
                </button>

                {/* Tùy chọn: Không mật khẩu */}
                <button
                  type="button"
                  onClick={() => setCreateHasPassword(false)}
                  className={`p-2.5 sm:p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                    !createHasPassword
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Unlock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
                    <div className="font-black text-xs sm:text-sm truncate">
                      {t('Không mật khẩu', 'No Password')}
                    </div>
                  </div>
                  {!createHasPassword && (
                    <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded bg-emerald-500 text-black font-black font-mono shrink-0">
                      {t('CHỌN', 'ON')}
                    </span>
                  )}
                </button>
              </div>

              {createHasPassword && (
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-sky-500/30 space-y-1.5">
                  <label className="block text-[11px] font-bold text-sky-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {t(
                        'Nhập mật khẩu phòng (3 – 32 ký tự):',
                        'Enter room password (3 – 32 characters):'
                      )}
                    </span>
                  </label>
                  <input
                    type="password"
                    maxLength={32}
                    value={createPasswordInput}
                    onChange={(e) => setCreatePasswordInput(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-700 focus:border-sky-400 focus:outline-none text-xs sm:text-sm font-mono text-white"
                  />
                </div>
              )}
            </div>

            {/* 3. Chọn Màn chiến dịch */}
            {(() => {
              const liveStageSpecs = stageManager.getLiveCampaignStageViews();
              const chosenSpec = stageManager.getLiveCampaignStageView(createStageId);
              return (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                      {t('3. Chọn Màn chiến dịch', '3. Select Campaign Stage')}
                    </label>
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                    {liveStageSpecs.map((stage) => {
                      const isUnlocked = stage.id <= userStageProgress.unlockedStage;
                      const isSelected = createStageId === stage.id;
                      return (
                        <button
                          key={stage.id}
                          type="button"
                          onClick={() => {
                            if (!isUnlocked) {
                              setErrorMsg(
                                t(
                                  `Màn ${stage.id} đang bị khóa. Cần hoàn thành Màn ${stage.id - 1} để mở khóa.`,
                                  `Stage ${stage.id} is locked. Complete Stage ${stage.id - 1} to unlock.`
                                )
                              );
                              return;
                            }
                            setErrorMsg(null);
                            setCreateStageId(stage.id);
                          }}
                          className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
                            !isUnlocked
                              ? 'bg-neutral-950/60 border-neutral-800 text-neutral-600 cursor-not-allowed opacity-65'
                              : isSelected
                                ? 'bg-amber-500 border-amber-300 text-black font-black cursor-pointer'
                                : 'bg-neutral-950 border-neutral-700 text-neutral-200 hover:border-amber-500/60 cursor-pointer'
                          }`}
                        >
                          <span className="text-[10px] font-mono font-extrabold">S{stage.id}</span>
                          {!isUnlocked && <Lock className="w-2.5 h-2.5 text-neutral-600" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 flex items-center gap-3">
                    <StageMapMiniPreview map={chosenSpec.map} sizePx={72} showSpawns />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-mono font-black text-xs text-white truncate">
                        {chosenSpec.name}
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-snug whitespace-pre-line">
                        {formatSentenceLineBreaks(chosenSpec.terrainFocus)}
                      </p>
                      <div className="text-[10px] font-mono text-amber-300/90">
                        {t('30 địch:', '30 Enemies:')} Basic {chosenSpec.enemyComposition.BASIC} • Fast {chosenSpec.enemyComposition.FAST} • Power {chosenSpec.enemyComposition.POWER} • Armor {chosenSpec.enemyComposition.ARMOR}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-neutral-800">
              <button
                type="submit"
                disabled={isBusy}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                <span>{t('XÁC NHẬN TẠO PHÒNG', 'CONFIRM CREATE ROOM')}</span>
              </button>
            </div>
          </form>
        )}

        {/* LUỒNG 2: THAM GIA PHÒNG BẰNG MÃ PHÒNG (VÀO NHANH ĐÃ TẮT) */}
        {subView === 'JOIN' && (
          <div className="max-w-lg mx-auto">
            <form
              onSubmit={handleJoinRoomByCode}
              className="p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 flex flex-col justify-between space-y-4 shadow-xl"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                    <LogIn className="w-5 h-5" />
                  </div>
                </div>
                <h3 className="text-base font-black uppercase tracking-wider text-white">
                  {t('VÀO BẰNG MÃ PHÒNG', 'JOIN WITH ROOM CODE')}
                </h3>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">
                    {t('Mã phòng:', 'Room Code:')}
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={joinCodeInput}
                    onChange={(e) => {
                      const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      if (raw.length === 0) {
                        setJoinCodeInput('');
                        return;
                      }
                      if (raw === 'B') {
                        setJoinCodeInput('B');
                        return;
                      }
                      const body = raw.startsWith('BT') ? raw.slice(2) : raw.replace(/^B/, '');
                      const digits = body.replace(/[^0-9]/g, '').slice(0, 4);
                      setJoinCodeInput(`BT${digits}`);
                    }}
                    placeholder={t('VD: BT4829', 'e.g. BT4829')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 focus:border-sky-400 focus:outline-none text-center font-mono text-sm font-black tracking-[0.25em] text-sky-300 uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-neutral-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold flex items-center justify-between">
                    <span>
                      {t('Mật khẩu phòng (Nếu phòng có khóa):', 'Room Password (if locked):')}
                    </span>
                    {needsPasswordForCode && (
                      <span className="text-amber-300 font-mono">
                        {t('Bắt buộc nhập mật khẩu', 'Password required')}
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    maxLength={32}
                    value={joinPasswordInput}
                    onChange={(e) => setJoinPasswordInput(e.target.value)}
                    placeholder={t(
                      'Để trống nếu là phòng Không mật khẩu',
                      'Leave blank if public room'
                    )}
                    className={`w-full px-3.5 py-2 rounded-xl bg-neutral-950 border text-xs font-mono text-white focus:outline-none ${
                      needsPasswordForCode
                        ? 'border-amber-500 focus:border-amber-400'
                        : 'border-neutral-700 focus:border-sky-400'
                    }`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy || !/^BT[0-9]{4}$/.test(joinCodeInput.trim())}
                className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {isBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{t('XÁC NHẬN VÀO PHÒNG', 'CONFIRM JOIN ROOM')}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // ĐANG Ở TRONG PHÒNG CHỜ (WAITING) — HẠNG MỤC 5 & HẠNG MỤC 6
  // ===========================================================================
  const bothPresent = Boolean(room.hostUid && room.guestUid);
  const p2pConnected = room.rtcConnectionState === 'CONNECTED';
  const bothReady = Boolean(bothPresent && room.hostReady && room.guestReady && p2pConnected);
  const myReady = role === 'HOST' ? room.hostReady : room.guestReady;

  const hostRole = resolveUserRole({
    uid: room.hostUid,
    email: role === 'HOST' ? user?.email : null,
  });
  const guestRole = resolveUserRole({
    uid: room.guestUid,
    email: role === 'GUEST' ? user?.email : null,
  });
  const hostFrameClasses = getRoleNameFrameClasses(hostRole);
  const guestFrameClasses = getRoleNameFrameClasses(guestRole);
  const hostTrademarkBadge = getRoleTrademarkBadge(hostRole);
  const guestTrademarkBadge = getRoleTrademarkBadge(guestRole);
  const resolvedHostName =
    avatarManager.getUserMetadata(room.hostUid)?.displayName || room.hostDisplayName;
  const resolvedGuestName =
    (room.guestUid ? avatarManager.getUserMetadata(room.guestUid)?.displayName : null) ||
    room.guestDisplayName ||
    t('Chiến Binh P2', 'Warrior P2');

  // Thông điệp trạng thái phòng chờ chính xác theo tiến trình thực tế (Sửa lỗi Hạng mục 6 - Mục VII.6.1 & VII.6.2)
  const lobbyStatusSummaryText = !bothPresent
    ? t('Đang chờ P2 tham gia phòng...', 'Waiting for P2 to join the room...')
    : room.hostReady && room.guestReady
      ? t(
          'Cả 2 người chơi đã Sẵn sàng! Chủ phòng (P1) có thể Bắt đầu trận đấu.',
          'Both players are Ready! Host (P1) can start the match.'
        )
      : room.hostReady && !room.guestReady
        ? t(
            'P1 (Chủ phòng) đã Sẵn sàng — Đang chờ P2 bấm Sẵn sàng.',
            'P1 (Host) is Ready — Waiting for P2 to click Ready.'
          )
        : !room.hostReady && room.guestReady
          ? t(
              'P2 (Đồng đội) đã Sẵn sàng — Đang chờ Chủ phòng (P1) bấm Sẵn sàng.',
              'P2 (Partner) is Ready — Waiting for Host (P1) to click Ready.'
            )
          : t(
              'P2 đã vào phòng (2/2)! Hãy nhấn sẵn sàng để xuất kích.',
              'P2 joined the room (2/2)! Click Ready to deploy.'
            );

  void lobbyStatusSummaryText;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 space-y-4 shadow-2xl">
      {/* Room Header & Code */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-white">
              {t('PHÒNG CHỜ CO-OP ONLINE', 'CO-OP ONLINE WAITING ROOM')}
            </div>
            <div className="flex items-center flex-wrap gap-1.5 mt-1">
              {/* Độ khó do P1 chọn — nằm ngay dưới tiêu đề PHÒNG CHỜ CO-OP ONLINE */}
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                  room.difficulty === 'EXTREME'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                }`}
                title={t(
                  'Độ khó phòng do Chủ phòng (P1) thiết lập',
                  'Room difficulty configured by Host (P1)'
                )}
              >
                {room.difficulty === 'EXTREME' ? (
                  <>
                    <Flame className="w-3 h-3" /> {t('Độ khó: Thử thách', 'Difficulty: Challenge')}
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3" /> {t('Độ khó: Giải trí', 'Difficulty: Casual')}
                  </>
                )}
              </span>

              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                  room.hasPassword
                    ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {room.hasPassword ? (
                  <>
                    <Lock className="w-3 h-3" /> {t('CÓ MẬT KHẨU', 'PASSWORD PROTECTED')}
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" /> {t('PHÒNG CÔNG KHAI', 'PUBLIC ROOM')}
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Room Code Box */}
        <div className="flex items-center gap-2 bg-neutral-950 border border-sky-500/40 rounded-xl px-3 py-1.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
              {t('Mã phòng', 'Room Code')}
            </div>
            <div className="font-mono text-base font-black tracking-[0.2em] text-sky-300">
              {room.roomCode}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyCode}
            className="p-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 transition-all cursor-pointer"
            title={t('Copy mã phòng', 'Copy room code')}
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="whitespace-pre-line">{formatSentenceLineBreaks(errorMsg)}</span>
        </div>
      )}

      {bothPresent && (
        <div
          className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
            room.rtcConnectionState === 'CONNECTED'
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
              : room.rtcConnectionState === 'FAILED'
                ? 'bg-red-950/70 border-red-500/50 text-red-200'
                : 'bg-sky-950/50 border-sky-500/40 text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {room.rtcConnectionState === 'CONNECTED' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : room.rtcConnectionState === 'FAILED' ? (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-sky-400 shrink-0" />
            )}
            <span className="whitespace-pre-line">
              {room.rtcConnectionState === 'CONNECTED'
                ? t('Kết nối máy chủ thành công!', 'Server connection established!')
                : room.rtcConnectionState === 'FAILED'
                  ? formatSentenceLineBreaks(
                      coopManager.getWebrtcErrorMessage() ||
                        t(
                          'Kết nối máy chủ thất bại. Kết nối lại hoặc rời phòng.',
                          'Server connection failed. Reconnect or leave room.'
                        )
                    )
                  : t('Đang kết nối máy chủ', 'Connecting to server...')}
            </span>
          </div>
          {room.rtcConnectionState === 'FAILED' && (
            <button
              type="button"
              onClick={handleRetryWebRTC}
              disabled={isBusy}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-wider shrink-0 cursor-pointer"
            >
              {t('Kết nối lại', 'Reconnect')}
            </button>
          )}
        </div>
      )}

      {/* Selected Stage Banner + Host Stage Switcher */}
      {(() => {
        const lobbyStageId = room.selectedStageId ?? 1;
        const liveStageSpecs = stageManager.getLiveCampaignStageViews();
        const lobbyStageSpec = stageManager.getLiveCampaignStageView(lobbyStageId);
        return (
          <div
            data-testid="coop-lobby-stage-panel"
            className="p-3.5 rounded-xl bg-neutral-950/85 border border-neutral-800 space-y-2.5"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300 font-mono uppercase">
                <MapIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {t('Màn chơi phòng:', 'Room Stage:')} {lobbyStageSpec.name}
                </span>
              </div>
              <span className="text-[10px] font-mono text-neutral-400">
                {role === 'HOST'
                  ? t('Chủ phòng (P1) chọn Màn', 'Host (P1) selects Stage')
                  : t('Đồng bộ từ Chủ phòng (P1)', 'Synced from Host (P1)')}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <StageMapMiniPreview map={lobbyStageSpec.map} sizePx={68} showSpawns />
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] text-neutral-300 leading-snug whitespace-pre-line">
                  {formatSentenceLineBreaks(lobbyStageSpec.terrainFocus)}
                </p>
                <div className="text-[10px] font-mono text-neutral-400">
                  {t('30 xe địch:', '30 Enemy Tanks:')} Basic {lobbyStageSpec.enemyComposition.BASIC} • Fast {lobbyStageSpec.enemyComposition.FAST} • Power {lobbyStageSpec.enemyComposition.POWER} • Armor {lobbyStageSpec.enemyComposition.ARMOR}
                </div>
              </div>
            </div>

            {role === 'HOST' && (
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1 pt-1">
                {liveStageSpecs.map((stage) => {
                  const isUnlocked = stage.id <= userStageProgress.unlockedStage;
                  const isSelected = lobbyStageId === stage.id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      disabled={isBusy}
                      data-testid={`coop-lobby-stage-btn-${stage.id}`}
                      onClick={() => {
                        if (!isUnlocked) {
                          setErrorMsg(
                            t(
                              `Màn ${stage.id} đang bị khóa. Cần hoàn thành Màn ${stage.id - 1} để mở khóa.`,
                              `Stage ${stage.id} is locked. Complete Stage ${stage.id - 1} to unlock.`
                            )
                          );
                          return;
                        }
                        setErrorMsg(null);
                        const res = coopManager.setRoomStage(stage.id, user?.uid);
                        if (!res.success) {
                          setErrorMsg(
                            res.message ||
                              t(
                                `Không thể chọn Màn ${stage.id}.`,
                                `Unable to select Stage ${stage.id}.`
                              )
                          );
                        }
                      }}
                      className={`py-1.5 rounded-lg border text-[10px] font-mono font-extrabold flex items-center justify-center gap-0.5 transition-all ${
                        !isUnlocked
                          ? 'bg-neutral-900/60 border-neutral-800 text-neutral-600 cursor-not-allowed opacity-60'
                          : isSelected
                            ? 'bg-amber-500 border-amber-300 text-black cursor-pointer'
                            : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-amber-500/60 cursor-pointer'
                      }`}
                    >
                      <span>S{stage.id}</span>
                      {!isUnlocked && <Lock className="w-2.5 h-2.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 2 Player Slots */}
      {(() => {
        const hostAvatarUrl = avatarManager.getEffectivePlayerAvatarUrl({
          uid: room.hostUid,
          photoURL: role === 'HOST' ? user?.photoURL : null,
        });
        const guestAvatarUrl = room.guestUid
          ? avatarManager.getEffectivePlayerAvatarUrl({
              uid: room.guestUid,
              photoURL: role === 'GUEST' ? user?.photoURL : null,
            })
          : null;

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Slot P1: Host */}
            <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-amber-500/40 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 overflow-hidden flex items-center justify-center text-amber-300 shrink-0">
                  {hostAvatarUrl && !hostAvatarBroken ? (
                    <img
                      src={hostAvatarUrl}
                      alt={room.hostDisplayName}
                      data-testid="coop-lobby-host-avatar"
                      className="w-full h-full object-cover"
                      onError={() => setHostAvatarBroken(true)}
                    />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    {t('P1 (Chủ phòng)', 'P1 (Host)')}
                  </div>
                  <div
                    className={`mt-0.5 inline-flex items-baseline px-2 py-0.5 rounded-md bg-neutral-900 text-xs font-bold text-white max-w-[165px] ${hostFrameClasses}`}
                  >
                    <span className="truncate">{resolvedHostName}</span>
                    {hostTrademarkBadge && (
                      <sup
                        data-testid="role-trademark-badge"
                        className="ml-0.5 text-[9px] font-black leading-none text-amber-300 select-none shrink-0"
                      >
                        {hostTrademarkBadge}
                      </sup>
                    )}
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border shrink-0 whitespace-nowrap ${
                  room.hostReady
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                }`}
              >
                {room.hostReady
                  ? t('Đã sẵn sàng', 'Ready')
                  : t('Chưa sẵn sàng', 'Not Ready')}
              </span>
            </div>

            {/* Slot P2: Guest */}
            <div
              className={`p-3.5 rounded-xl bg-neutral-950/80 border flex items-center justify-between gap-2 ${
                room.guestUid ? 'border-emerald-500/40' : 'border-dashed border-neutral-800'
              }`}
            >
              {room.guestUid ? (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 overflow-hidden flex items-center justify-center text-emerald-300 shrink-0">
                      {guestAvatarUrl && !guestAvatarBroken ? (
                        <img
                          src={guestAvatarUrl}
                          alt={resolvedGuestName}
                          data-testid="coop-lobby-guest-avatar"
                          className="w-full h-full object-cover"
                          onError={() => setGuestAvatarBroken(true)}
                        />
                      ) : (
                        <Users className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                        {t('P2 (Đồng đội)', 'P2 (Partner)')}
                      </div>
                      <div
                        className={`mt-0.5 inline-flex items-baseline px-2 py-0.5 rounded-md bg-neutral-900 text-xs font-bold text-white max-w-[165px] ${guestFrameClasses}`}
                      >
                        <span className="truncate">{resolvedGuestName}</span>
                        {guestTrademarkBadge && (
                          <sup
                            data-testid="role-trademark-badge"
                            className="ml-0.5 text-[9px] font-black leading-none text-amber-300 select-none shrink-0"
                          >
                            {guestTrademarkBadge}
                          </sup>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border shrink-0 whitespace-nowrap ${
                        room.guestReady
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {room.guestReady
                        ? t('Đã sẵn sàng', 'Ready')
                        : t('Chưa sẵn sàng', 'Not Ready')}
                    </span>
                    {role === 'HOST' && room.status === 'WAITING' && (
                      <button
                        type="button"
                        data-testid="coop-lobby-kick-guest-btn"
                        disabled={isBusy}
                        onClick={handleKickGuest}
                        title={t(
                          'Mời người chơi P2 ra khỏi phòng',
                          'Remove P2 from the room'
                        )}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-200 font-bold text-[10px] uppercase flex items-center gap-1 shrink-0 whitespace-nowrap transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        <UserX className="w-3 h-3 shrink-0" />
                        <span>{t('Mời ra', 'Kick')}</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2.5 text-neutral-500 py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  <span className="text-xs">
                    {t('Đang chờ P2 tham gia phòng...', 'Waiting for P2 to join the room...')}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800">
        <button
          type="button"
          onClick={handleLeaveLobby}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t('Rời phòng', 'Leave Room')}</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleToggleReady}
            disabled={isBusy || (role === 'GUEST' && !room.guestUid)}
            className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 ${
              myReady
                ? 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{myReady ? t('Hủy sẵn sàng', 'Unready') : t('Sẵn sàng', 'Ready')}</span>
          </button>

          {role === 'HOST' && (
            <button
              type="button"
              onClick={handleHostStartMatch}
              disabled={isBusy || !bothReady}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-300 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>{t('Vào trận', 'Start Match')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
