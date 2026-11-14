/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
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
  Zap,
  RefreshCw,
  KeyRound,
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
} from '../core/authManager.ts';
import { AvatarManager } from '../core/avatarManager.ts';

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

  // Join Room state (M7.3.7 Mục VI.5.3)
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [needsPasswordForCode, setNeedsPasswordForCode] = useState<boolean>(false);
  const [quickJoinEmptyMsg, setQuickJoinEmptyMsg] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setRoleTick] = useState(0);

  useEffect(() => {
    setCreateDifficulty(difficulty);
  }, [difficulty]);

  useEffect(() => {
    const unsub = coopManager.subscribe((updatedRoom, updatedRole) => {
      setRoom(updatedRoom);
      setRole(updatedRole);
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
      if (
        updatedRoom &&
        updatedRoom.status === 'PLAYING' &&
        (updatedRole === 'HOST' || updatedRole === 'GUEST')
      ) {
        onDifficultyChange?.(updatedRoom.difficulty);
        onOnlineMatchStarted(updatedRoom, updatedRole);
      }
    });
    return unsub;
  }, [coopManager, avatarManager, onOnlineMatchStarted, onDifficultyChange]);

  const handleConfirmCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setQuickJoinEmptyMsg(null);
    setIsBusy(true);
    try {
      onDifficultyChange?.(createDifficulty);
      const res = await coopManager.createRoom(user, createDifficulty, undefined, {
        hasPassword: createHasPassword,
        password: createHasPassword ? createPasswordInput : undefined,
      });
      if (!res.success) {
        setErrorMsg(res.message || 'Không thể tạo phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleQuickJoinRoom = async () => {
    setErrorMsg(null);
    setQuickJoinEmptyMsg(null);
    setIsBusy(true);
    try {
      const res = await coopManager.quickJoinRoom(user);
      if (!res.success) {
        if (res.errorCode === 'NO_AVAILABLE_PUBLIC_ROOM') {
          setQuickJoinEmptyMsg(res.message || 'Hiện chưa có phòng trống');
        } else {
          setErrorMsg(res.message || 'Không thể vào nhanh lúc này.');
        }
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoomByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setQuickJoinEmptyMsg(null);
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
      setQuickJoinEmptyMsg(null);
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
  if (!room || !signalingReady || room.status === 'ABANDONED' || room.status === 'EXPIRED') {
    return (
      <div className="space-y-4">
        {room && (room.status === 'ABANDONED' || room.status === 'EXPIRED') && (
          <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2">
            <span>{room.disconnectReason || 'Phòng chơi trước đã kết thúc.'}</span>
            <button
              type="button"
              onClick={() => void coopManager.leaveRoom()}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[11px] cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* MÀN HÌNH ĐẦU TIÊN (MAIN): CHỈ HIỂN THỊ 2 LỰA CHỌN CHÍNH: 1. TẠO PHÒNG & 2. THAM GIA PHÒNG */}
        {subView === 'MAIN' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. TẠO PHÒNG */}
              <div className="p-5 rounded-2xl bg-neutral-900/90 border-2 border-sky-500/40 hover:border-sky-400 transition-all flex flex-col justify-between space-y-4 shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                      <PlusCircle className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-500/30">
                      Chủ Phòng • P1
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                    1. TẠO PHÒNG
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Thiết lập độ khó chiến dịch (Giải trí / Thử thách) và chế độ bảo mật phòng (Có mật khẩu hoặc Không mật khẩu).
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setQuickJoinEmptyMsg(null);
                    setSubView('CREATE');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>TẠO PHÒNG</span>
                </button>
              </div>

              {/* 2. THAM GIA PHÒNG */}
              <div className="p-5 rounded-2xl bg-neutral-900/90 border-2 border-emerald-500/40 hover:border-emerald-400 transition-all flex flex-col justify-between space-y-4 shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <LogIn className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      Đồng Đội • P2
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-white">
                    2. THAM GIA PHÒNG
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Chọn <strong>Vào nhanh</strong> để ghép vào phòng công khai đang chờ, hoặc <strong>Vào bằng mã phòng</strong> định dạng <span className="font-mono text-sky-300 font-bold">BTxxxx</span>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setQuickJoinEmptyMsg(null);
                    setSubView('JOIN');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] cursor-pointer"
                >
                  <LogIn className="w-4 h-4" />
                  <span>THAM GIA PHÒNG</span>
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
                    CẤU HÌNH PHÒNG
                  </h3>

                </div>
              </div>
            </div>

            {/* 1. Chọn độ khó */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-300">
                1. Chọn độ khó
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreateDifficulty('DEFAULT')}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                    createDifficulty === 'DEFAULT'
                      ? 'bg-amber-950/40 border-amber-500 text-amber-200 ring-1 ring-amber-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Shield className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <div className="font-black text-xs sm:text-sm">Giải trí</div>
                      <div className="text-[10px] text-neutral-400">3 mạng • 120s • Cân bằng</div>
                    </div>
                  </div>
                  {createDifficulty === 'DEFAULT' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500 text-black font-black font-mono">
                      ĐANG CHỌN
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCreateDifficulty('EXTREME')}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                    createDifficulty === 'EXTREME'
                      ? 'bg-rose-950/40 border-rose-500 text-rose-200 ring-1 ring-rose-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Flame className="w-5 h-5 text-rose-400 shrink-0" />
                    <div>
                      <div className="font-black text-xs sm:text-sm">Thử thách</div>
                      <div className="text-[10px] text-neutral-400">3 mạng • 60s • Áp lực cao</div>
                    </div>
                  </div>
                  {createDifficulty === 'EXTREME' && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-600 text-white font-black font-mono">
                      ĐANG CHỌN
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* 2. Cấu hình mật khẩu phòng */}
            <div className="space-y-2.5">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-sky-300">
                2. Chế độ bảo mật phòng
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Mặc định: Có mật khẩu */}
                <button
                  type="button"
                  onClick={() => setCreateHasPassword(true)}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                    createHasPassword
                      ? 'bg-sky-950/40 border-sky-500 text-sky-200 ring-1 ring-sky-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-5 h-5 text-sky-400 shrink-0" />
                    <div>
                      <div className="font-black text-xs sm:text-sm">Có mật khẩu</div>
                    </div>
                  </div>
                  {createHasPassword && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500 text-black font-black font-mono">
                      ĐANG CHỌN
                    </span>
                  )}
                </button>

                {/* Tùy chọn: Không mật khẩu */}
                <button
                  type="button"
                  onClick={() => setCreateHasPassword(false)}
                  className={`p-3.5 rounded-xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${
                    !createHasPassword
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500/30'
                      : 'bg-neutral-950/70 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Unlock className="w-5 h-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-black text-xs sm:text-sm">Không mật khẩu</div>
                    </div>
                  </div>
                  {!createHasPassword && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500 text-black font-black font-mono">
                      ĐANG CHỌN
                    </span>
                  )}
                </button>
              </div>

              {createHasPassword && (
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-sky-500/30 space-y-1.5">
                  <label className="block text-[11px] font-bold text-sky-200 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                    <span>Nhập mật khẩu phòng (3 – 32 ký tự):</span>
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
                <span>XÁC NHẬN TẠO PHÒNG</span>
              </button>
            </div>
          </form>
        )}

        {/* LUỒNG 2: THAM GIA PHÒNG (M7.3.7 MỤC VI.5.3: A. VÀO NHANH / B. VÀO BẰNG MÃ PHÒNG) */}
        {subView === 'JOIN' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* A. VÀO NHANH */}
              <div className="p-5 rounded-2xl bg-neutral-900/95 border border-emerald-500/40 flex flex-col justify-between space-y-4 shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Zap className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                      Phòng Công Khai
                    </span>
                  </div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    A. VÀO NHANH
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Tự động tìm và vào ngay phòng công khai (không mật khẩu) đang ở trạng thái chờ.
                  </p>

                  {quickJoinEmptyMsg && (
                    <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between gap-2">
                      <span className="font-bold">{quickJoinEmptyMsg}</span>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={handleQuickJoinRoom}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <RefreshCw className={`w-3 h-3 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>Thử lại</span>
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleQuickJoinRoom}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4" />
                  )}
                  <span>VÀO PHÒNG</span>
                </button>
              </div>

              {/* B. VÀO BẰNG MÃ PHÒNG */}
              <form
                onSubmit={handleJoinRoomByCode}
                className="p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 flex flex-col justify-between space-y-4 shadow-xl"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                      <LogIn className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-500/30">
                      Định dạng BTxxxx
                    </span>
                  </div>
                  <h3 className="text-base font-black uppercase tracking-wider text-white">
                    B. VÀO BẰNG MÃ PHÒNG
                  </h3>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold">
                      Mã phòng (BTxxxx — BT + 4 ký tự chữ/số):
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={joinCodeInput}
                      onChange={(e) =>
                        setJoinCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                      }
                      placeholder="VD: BT4829"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 focus:border-sky-400 focus:outline-none text-center font-mono text-sm font-black tracking-[0.25em] text-sky-300 uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-neutral-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-neutral-400 mb-1 uppercase font-bold flex items-center justify-between">
                      <span>Mật khẩu phòng (Nếu phòng có khóa):</span>
                      {needsPasswordForCode && (
                        <span className="text-amber-300 font-mono">Bắt buộc nhập mật khẩu</span>
                      )}
                    </label>
                    <input
                      type="password"
                      maxLength={32}
                      value={joinPasswordInput}
                      onChange={(e) => setJoinPasswordInput(e.target.value)}
                      placeholder="Để trống nếu là phòng Không mật khẩu"
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
                  disabled={isBusy || !/^BT[A-Z0-9]{4}$/.test(joinCodeInput.trim())}
                  className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>XÁC NHẬN VÀO PHÒNG</span>
                </button>
              </form>
            </div>
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

  // Thông điệp trạng thái phòng chờ chính xác theo tiến trình thực tế (Sửa lỗi Hạng mục 6 - Mục VII.6.1 & VII.6.2)
  const lobbyStatusSummaryText = !bothPresent
    ? 'Đang chờ P2 tham gia phòng...'
    : room.hostReady && room.guestReady
      ? 'Cả 2 người chơi đã Sẵn sàng! Chủ phòng (P1) có thể Bắt đầu trận đấu.'
      : room.hostReady && !room.guestReady
        ? 'P1 (Chủ phòng) đã Sẵn sàng — Đang chờ P2 bấm Sẵn sàng.'
        : !room.hostReady && room.guestReady
          ? 'P2 (Đồng đội) đã Sẵn sàng — Đang chờ Chủ phòng (P1) bấm Sẵn sàng.'
          : 'P2 đã vào phòng (2/2)! Hãy nhấn sẵn sàng để xuất kích.';

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 space-y-4 shadow-2xl">
      {/* Room Header & Code */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Phòng Chờ Co-op Online
              </span>
              {/* Độ khó do P1 chọn — hiển thị rõ cho cả P1 và P2 (P2 chỉ đọc) */}
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                  room.difficulty === 'EXTREME'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                }`}
                title="Độ khó phòng do Chủ phòng (P1) thiết lập"
              >
                {room.difficulty === 'EXTREME' ? (
                  <>
                    <Flame className="w-3 h-3" /> Độ khó: Thử thách
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3" /> Độ khó: Giải trí
                  </>
                )}
              </span>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                  room.hasPassword
                    ? 'bg-sky-950/80 text-sky-300 border-sky-500/40'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {room.hasPassword ? (
                  <>
                    <Lock className="w-3 h-3" /> Có mật khẩu
                  </>
                ) : (
                  <>
                    <Unlock className="w-3 h-3" /> Phòng công khai
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-neutral-300 mt-0.5 font-medium">
              {lobbyStatusSummaryText}
            </p>
          </div>
        </div>

        {/* Room Code Box */}
        <div className="flex items-center gap-2 bg-neutral-950 border border-sky-500/40 rounded-xl px-3 py-1.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
              Mã phòng (BTxxxx)
            </div>
            <div className="font-mono text-base font-black tracking-[0.2em] text-sky-300">
              {room.roomCode}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopyCode}
            className="p-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 transition-all cursor-pointer"
            title="Copy mã phòng"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorMsg}</span>
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
            <span>
              {room.rtcConnectionState === 'CONNECTED'
                ? 'Kết nối máy chủ thành công!'
                : room.rtcConnectionState === 'FAILED'
                  ? coopManager.getWebrtcErrorMessage() ||
                    'Kết nối máy chủ thất bại. Kết nối lại hoặc rời phòng.'
                  : 'Đang kết nối máy chủ'}
            </span>
          </div>
          {room.rtcConnectionState === 'FAILED' && (
            <button
              type="button"
              onClick={handleRetryWebRTC}
              disabled={isBusy}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-wider shrink-0 cursor-pointer"
            >
              Kết nối lại
            </button>
          )}
        </div>
      )}

      {/* 2 Player Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Slot P1: Host */}
        <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-amber-500/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                P1 (Chủ phòng)
              </div>
              <div
                className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-900 text-xs font-bold text-white truncate max-w-[165px] ${hostFrameClasses}`}
              >
                <span className="truncate">{room.hostDisplayName}</span>
              </div>
            </div>
          </div>
          <span
            className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border shrink-0 ${
              room.hostReady
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                : 'bg-neutral-900 text-neutral-400 border-neutral-700'
            }`}
          >
            {room.hostReady ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
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
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    P2 (Đồng đội)
                  </div>
                  <div
                    className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-900 text-xs font-bold text-white truncate max-w-[165px] ${guestFrameClasses}`}
                  >
                    <span className="truncate">{room.guestDisplayName || 'Chiến Binh P2'}</span>
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border shrink-0 ${
                  room.guestReady
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                }`}
              >
                {room.guestReady ? 'Đã sẵn sàng' : 'Chưa sẵn sàng'}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2.5 text-neutral-500 py-1">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span className="text-xs">Đang chờ P2 tham gia phòng...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800">
        <button
          type="button"
          onClick={handleLeaveLobby}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-all cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Rời phòng</span>
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
            <span>{myReady ? 'Hủy sẵn sàng' : 'Sẵn sàng'}</span>
          </button>

          {role === 'HOST' && (
            <button
              type="button"
              onClick={handleHostStartMatch}
              disabled={isBusy || !bothReady}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Vào trận</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
