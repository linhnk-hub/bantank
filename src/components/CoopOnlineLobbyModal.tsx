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
} from 'lucide-react';
import type { User } from 'firebase/auth';
import {
  CoopOnlineManager,
  type CoopRoomDocument,
  type CoopPlayerRole,
} from '../core/coopOnlineManager.ts';

interface CoopOnlineLobbyPanelProps {
  user: User | null;
  difficulty: 'DEFAULT' | 'EXTREME';
  onBackToDifficulty: () => void;
  onOnlineMatchStarted: (room: CoopRoomDocument, role: 'HOST' | 'GUEST') => void;
}

export const CoopOnlineLobbyPanel: React.FC<CoopOnlineLobbyPanelProps> = ({
  user,
  difficulty,
  onBackToDifficulty,
  onOnlineMatchStarted,
}) => {
  const coopManager = CoopOnlineManager.getInstance();
  const [room, setRoom] = useState<CoopRoomDocument | null>(() => coopManager.getCurrentRoom());
  const [role, setRole] = useState<CoopPlayerRole>(() => coopManager.getRole());
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = coopManager.subscribe((updatedRoom, updatedRole) => {
      setRoom(updatedRoom);
      setRole(updatedRole);
      if (
        updatedRoom &&
        updatedRoom.status === 'PLAYING' &&
        (updatedRole === 'HOST' || updatedRole === 'GUEST')
      ) {
        onOnlineMatchStarted(updatedRoom, updatedRole);
      }
    });
    return unsub;
  }, [coopManager, onOnlineMatchStarted]);

  const handleCreateRoom = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await coopManager.createRoom(user, difficulty);
      if (!res.success) {
        setErrorMsg(res.message || 'Không thể tạo phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = await coopManager.joinRoom(joinCodeInput, user);
      if (!res.success) {
        setErrorMsg(res.message || 'Không thể tham gia phòng.');
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyCode = async () => {
    if (!room) return;
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

  // Nếu chưa ở trong phòng: Hiển thị 2 lựa chọn TẠO PHÒNG và THAM GIA PHÒNG
  if (!room || room.status === 'ABANDONED' || room.status === 'EXPIRED') {
    return (
      <div className="space-y-4">
        {room && (room.status === 'ABANDONED' || room.status === 'EXPIRED') && (
          <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-2">
            <span>{room.disconnectReason || 'Phòng chơi trước đã kết thúc.'}</span>
            <button
              onClick={() => void coopManager.leaveRoom()}
              className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-[11px]"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Lựa chọn 1: TẠO PHÒNG */}
          <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-sky-500/40 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-500/30">
                  Chủ Phòng • P1
                </span>
              </div>
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Tạo Phòng Mới
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Khởi tạo phòng chơi Co-op Online với độ khó{' '}
                <strong className={difficulty === 'EXTREME' ? 'text-rose-400' : 'text-amber-300'}>
                  {difficulty === 'EXTREME' ? 'HARD' : 'NORMAL'}
                </strong>{' '}
                và nhận mã phòng 6 ký tự để gửi cho đồng đội.
              </p>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={isBusy}
              className="w-full py-3 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
              <span>Tạo Phòng Ngay</span>
            </button>
          </div>

          {/* Lựa chọn 2: THAM GIA PHÒNG */}
          <form
            onSubmit={handleJoinRoom}
            className="p-4 sm:p-5 rounded-2xl bg-neutral-900/90 border border-emerald-500/40 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <LogIn className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                  Đồng Đội • P2
                </span>
              </div>
              <h3 className="text-base font-black uppercase tracking-wider text-white">
                Tham Gia Phòng
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Nhập mã phòng 6 ký tự từ Chủ phòng (P1) để kết nối vào chiến trường với vai trò Chiến xa P2.
              </p>
              <div className="pt-1">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="NHẬP MÃ 6 KÝ TỰ (VD: TK2026)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-950 border border-neutral-700 focus:border-emerald-400 focus:outline-none text-center font-mono text-sm font-black tracking-[0.25em] text-emerald-300 uppercase placeholder:tracking-normal placeholder:font-sans placeholder:text-xs placeholder:text-neutral-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isBusy || joinCodeInput.trim().length !== 6}
              className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.99] disabled:opacity-50"
            >
              {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              <span>Vào Phòng Bằng Mã</span>
            </button>
          </form>
        </div>

        <div className="flex justify-start pt-1">
          <button
            onClick={onBackToDifficulty}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-bold text-neutral-300 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại chọn độ khó</span>
          </button>
        </div>
      </div>
    );
  }

  // Đang ở trong phòng chờ (WAITING)
  const bothPresent = Boolean(room.hostUid && room.guestUid);
  const bothReady = Boolean(bothPresent && room.hostReady && room.guestReady);
  const myReady = role === 'HOST' ? room.hostReady : room.guestReady;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-neutral-900/95 border border-sky-500/40 space-y-4 shadow-2xl">
      {/* Room Header & Code */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Phòng Chờ Co-op Online
              </span>
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${
                  room.difficulty === 'EXTREME'
                    ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                    : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                }`}
              >
                {room.difficulty === 'EXTREME' ? (
                  <>
                    <Flame className="w-3 h-3" /> HARD
                  </>
                ) : (
                  <>
                    <Shield className="w-3 h-3" /> NORMAL
                  </>
                )}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400">
              {bothPresent
                ? 'Đã đủ 2/2 người chơi! Hãy nhấn Sẵn sàng để xuất kích.'
                : 'Đang chờ người chơi thứ 2 nhập mã phòng...'}
            </p>
          </div>
        </div>

        {/* Room Code Box */}
        <div className="flex items-center gap-2 bg-neutral-950 border border-sky-500/40 rounded-xl px-3 py-1.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
              Mã Phòng (6 Ký Tự)
            </div>
            <div className="font-mono text-base font-black tracking-[0.2em] text-sky-300">
              {room.roomCode}
            </div>
          </div>
          <button
            onClick={handleCopyCode}
            className="p-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 transition-all"
            title="Sao chép mã phòng"
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
                ? 'Đã thiết lập kênh P2P trực tiếp (WebRTC DataChannel) – Tiết kiệm 100% hạn mức Firestore trong trận!'
                : room.rtcConnectionState === 'FAILED'
                  ? coopManager.getWebrtcErrorMessage() ||
                    'Kết nối P2P trực tiếp (WebRTC) thất bại. Vui lòng thử kết nối lại hoặc rời phòng an toàn.'
                  : 'Đang thiết lập kênh P2P trực tiếp (WebRTC DataChannel) qua Firestore Signaling...'}
            </span>
          </div>
          {room.rtcConnectionState === 'FAILED' && (
            <button
              type="button"
              onClick={handleRetryWebRTC}
              disabled={isBusy}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-wider shrink-0"
            >
              Thử Kết Nối Lại P2P
            </button>
          )}
        </div>
      )}

      {/* 2 Player Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Slot P1: Host */}
        <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-amber-500/40 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {room.hostPhotoURL ? (
              <img
                src={room.hostPhotoURL}
                alt={room.hostDisplayName}
                className="w-9 h-9 rounded-full object-cover border border-amber-500/50 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                Người Chơi 1 (Chủ Phòng)
              </div>
              <div className="text-xs font-bold text-white truncate">
                {room.hostDisplayName}
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
            {room.hostReady ? 'Đã Sẵn Sàng' : 'Chưa Sẵn Sàng'}
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
                {room.guestPhotoURL ? (
                  <img
                    src={room.guestPhotoURL}
                    alt={room.guestDisplayName || 'P2'}
                    className="w-9 h-9 rounded-full object-cover border border-emerald-500/50 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    Người Chơi 2 (Đồng Đội)
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    {room.guestDisplayName || 'Chiến Binh P2'}
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
                {room.guestReady ? 'Đã Sẵn Sàng' : 'Chưa Sẵn Sàng'}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2.5 text-neutral-500 py-1">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span className="text-xs">Đang chờ Người chơi 2 nhập mã phòng...</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-800">
        <button
          onClick={handleLeaveLobby}
          disabled={isBusy}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs transition-all"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Rời Phòng</span>
        </button>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleToggleReady}
            disabled={isBusy}
            className={`px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              myReady
                ? 'bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{myReady ? 'Hủy Sẵn Sàng' : 'Báo Sẵn Sàng'}</span>
          </button>

          {role === 'HOST' && (
            <button
              onClick={handleHostStartMatch}
              disabled={isBusy || !bothReady}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4 fill-black" />
              <span>Bắt Đầu Trận Online</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
