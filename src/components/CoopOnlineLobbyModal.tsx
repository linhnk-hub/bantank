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
import { CoopOnlineManager, type CoopRoomDocument, type CoopPlayerRole } from '../core/coopOnlineManager.ts';
import { resolveUserRole, getRoleNameFrameClasses } from '../core/authManager.ts';
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
  user, difficulty, onDifficultyChange, onBackToDifficulty: _onBackToDifficulty, onOnlineMatchStarted, subView: controlledSubView, onSubViewChange,
}) => {
  const coopManager = CoopOnlineManager.getInstance();
  const avatarManager = AvatarManager.getInstance();
  const [room, setRoom] = useState<CoopRoomDocument | null>(() => coopManager.getCurrentRoom());
  const [role, setRole] = useState<CoopPlayerRole>(() => coopManager.getRole());
  const [internalSubView, setInternalSubView] = useState<CoopLobbySubView>('MAIN');

  const subView = controlledSubView ?? internalSubView;
  const setSubView = (nextView: CoopLobbySubView) => { setInternalSubView(nextView); onSubViewChange?.(nextView); };

  const [createDifficulty, setCreateDifficulty] = useState<'DEFAULT' | 'EXTREME'>(difficulty);
  const [createHasPassword, setCreateHasPassword] = useState<boolean>(true);
  const [createPasswordInput, setCreatePasswordInput] = useState<string>('');

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [needsPasswordForCode, setNeedsPasswordForCode] = useState<boolean>(false);
  const [quickJoinEmptyMsg, setQuickJoinEmptyMsg] = useState<string | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setRoleTick] = useState(0);

  useEffect(() => { setCreateDifficulty(difficulty); }, [difficulty]);

  useEffect(() => {
    const unsub = coopManager.subscribe((updatedRoom, updatedRole) => {
      setRoom(updatedRoom); setRole(updatedRole);
      if (updatedRoom) {
        if (updatedRoom.hostUid) void avatarManager.fetchUserMetadataOnce(updatedRoom.hostUid).then(() => setRoleTick((t) => t + 1));
        if (updatedRoom.guestUid) void avatarManager.fetchUserMetadataOnce(updatedRoom.guestUid).then(() => setRoleTick((t) => t + 1));
      }
      if (updatedRoom && updatedRoom.status === 'PLAYING' && (updatedRole === 'HOST' || updatedRole === 'GUEST')) {
        onDifficultyChange?.(updatedRoom.difficulty);
        onOnlineMatchStarted(updatedRoom, updatedRole);
      }
    });
    return unsub;
  }, [coopManager, avatarManager, onOnlineMatchStarted, onDifficultyChange]);

  const handleConfirmCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(null); setQuickJoinEmptyMsg(null); setIsBusy(true);
    try {
      onDifficultyChange?.(createDifficulty);
      const res = await coopManager.createRoom(user, createDifficulty, undefined, { hasPassword: createHasPassword, password: createHasPassword ? createPasswordInput : undefined });
      if (!res.success) setErrorMsg(res.message || 'Không thể tạo phòng.');
    } finally { setIsBusy(false); }
  };

  const handleQuickJoinRoom = async () => {
    setErrorMsg(null); setQuickJoinEmptyMsg(null); setIsBusy(true);
    try {
      const res = await coopManager.quickJoinRoom(user);
      if (!res.success) {
        if (res.errorCode === 'NO_AVAILABLE_PUBLIC_ROOM') setQuickJoinEmptyMsg(res.message || 'Hiện chưa có phòng trống');
        else setErrorMsg(res.message || 'Không thể vào nhanh lúc này.');
      }
    } finally { setIsBusy(false); }
  };

  const handleJoinRoomByCode = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg(null); setQuickJoinEmptyMsg(null); setIsBusy(true);
    try {
      const res = await coopManager.joinRoom(joinCodeInput, user, Date.now(), { password: joinPasswordInput.trim() ? joinPasswordInput : undefined });
      if (!res.success) {
        if (res.errorCode === 'PASSWORD_REQUIRED' || res.errorCode === 'WRONG_PASSWORD') setNeedsPasswordForCode(true);
        setErrorMsg(res.message || 'Không thể tham gia phòng.');
      }
    } finally { setIsBusy(false); }
  };

  const handleCopyCode = async () => {
    if (!room || !coopManager.isRoomSignalingReady()) return;
    try { await navigator.clipboard.writeText(room.roomCode); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const handleToggleReady = async () => {
    if (!room || !role) return;
    setErrorMsg(null); setIsBusy(true);
    try {
      const currentReady = role === 'HOST' ? room.hostReady : room.guestReady;
      const res = await coopManager.setPlayerReady(!currentReady);
      if (!res.success) setErrorMsg(res.message || 'Lỗi cập nhật trạng thái Sẵn sàng.');
    } finally { setIsBusy(false); }
  };

  const handleHostStartMatch = async () => {
    if (!room || !user || role !== 'HOST') return;
    setErrorMsg(null); setIsBusy(true);
    try {
      onDifficultyChange?.(room.difficulty);
      const res = await coopManager.startOnlineMatch(user.uid);
      if (!res.success) setErrorMsg(res.message || 'Chưa thể bắt đầu trận đấu.');
    } finally { setIsBusy(false); }
  };

  const handleLeaveLobby = async () => {
    setIsBusy(true);
    try { await coopManager.leaveRoom(); setSubView('MAIN'); setErrorMsg(null); setQuickJoinEmptyMsg(null); }
    finally { setIsBusy(false); }
  };

  const handleRetryWebRTC = async () => {
    setErrorMsg(null); setIsBusy(true);
    try {
      const res = await coopManager.retryWebRTCConnection();
      if (!res.success && res.message) setErrorMsg(res.message);
    } finally { setIsBusy(false); }
  };

  const signalingReady = coopManager.isRoomSignalingReady();

  if (!room || !signalingReady || room.status === 'ABANDONED' || room.status === 'EXPIRED') {
    return (
      <div className="space-y-4 font-display">
        {room && (room.status === 'ABANDONED' || room.status === 'EXPIRED') && (
          <div className="p-3 rounded-sm bg-black border-2 border-neo-amber text-neo-amber font-pixel text-xl flex items-center justify-between gap-2 pixel-corners">
            <span>{room.disconnectReason || 'PREVIOUS SESSION TERMINATED.'}</span>
            <button type="button" onClick={() => void coopManager.leaveRoom()} className="btn-arcade-outline px-3 py-1 text-sm">CLOSE</button>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-sm bg-black border-2 border-neo-rose text-neo-rose font-pixel text-xl flex items-center gap-2 pixel-corners">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {subView === 'MAIN' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-black border-4 border-neo-cyan pixel-corners shadow-[0_0_15px_rgba(0,240,255,0.3)] flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><PlusCircle className="w-6 h-6" /></div>
                  <span className="font-pixel text-xl text-neo-cyan border-b-2 border-neo-cyan uppercase">HOST • P1</span>
                </div>
                <h3 className="font-pixel text-3xl text-white uppercase mt-4">1. CREATE ROOM</h3>
                <p className="text-sm text-gray-400">Thiết lập độ khó và cấu hình bảo mật phòng cho chiến dịch Co-op.</p>
              </div>
              <button type="button" onClick={() => { setErrorMsg(null); setQuickJoinEmptyMsg(null); setSubView('CREATE'); }} className="btn-arcade w-full py-4 text-xl flex items-center justify-center gap-2">
                <PlusCircle className="w-5 h-5" /> CREATE ROOM
              </button>
            </div>

            <div className="p-6 bg-black border-4 border-neo-amber pixel-corners shadow-[0_0_15px_rgba(255,184,0,0.3)] flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber flex items-center justify-center text-neo-amber pixel-corners"><LogIn className="w-6 h-6" /></div>
                  <span className="font-pixel text-xl text-neo-amber border-b-2 border-neo-amber uppercase">GUEST • P2</span>
                </div>
                <h3 className="font-pixel text-3xl text-white uppercase mt-4">2. JOIN ROOM</h3>
                <p className="text-sm text-gray-400">Tìm kiếm phòng đang mở hoặc nhập mã 6 ký tự để hội quân.</p>
              </div>
              <button type="button" onClick={() => { setErrorMsg(null); setQuickJoinEmptyMsg(null); setSubView('JOIN'); }} className="btn-arcade w-full py-4 text-xl flex items-center justify-center gap-2">
                <LogIn className="w-5 h-5" /> JOIN ROOM
              </button>
            </div>
          </div>
        )}

        {subView === 'CREATE' && (
          <form onSubmit={handleConfirmCreateRoom} className="p-6 bg-black border-4 border-neo-cyan pixel-corners shadow-[0_0_20px_rgba(0,240,255,0.4)] space-y-6">
            <div className="flex items-center gap-4 border-b-2 border-neo-cyan pb-4">
              <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><PlusCircle className="w-6 h-6" /></div>
              <div>
                <h3 className="font-pixel text-3xl text-white uppercase">CREATE NEW ROOM (P1)</h3>
                <p className="text-sm text-gray-400">Tùy chỉnh thông số chiến trường</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block font-pixel text-xl text-neo-amber uppercase">1. LỰA CHỌN ĐỘ KHÓ</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button type="button" onClick={() => setCreateDifficulty('DEFAULT')} className={`p-4 border-2 pixel-corners text-left flex items-center justify-between transition-colors ${createDifficulty === 'DEFAULT' ? 'bg-neo-amber/20 border-neo-amber shadow-[0_0_10px_rgba(255,184,0,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex items-center gap-3">
                    <Shield className={`w-6 h-6 ${createDifficulty === 'DEFAULT' ? 'text-neo-amber' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-pixel text-2xl text-white">GIẢI TRÍ</div>
                      <div className="text-xs text-gray-400">3 mạng • Cân bằng cổ điển</div>
                    </div>
                  </div>
                </button>
                <button type="button" onClick={() => setCreateDifficulty('EXTREME')} className={`p-4 border-2 pixel-corners text-left flex items-center justify-between transition-colors ${createDifficulty === 'EXTREME' ? 'bg-neo-rose/20 border-neo-rose shadow-[0_0_10px_rgba(255,0,85,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex items-center gap-3">
                    <Flame className={`w-6 h-6 ${createDifficulty === 'EXTREME' ? 'text-neo-rose' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-pixel text-2xl text-white">THỬ THÁCH</div>
                      <div className="text-xs text-gray-400">1 mạng • Áp lực cao</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block font-pixel text-xl text-neo-cyan uppercase">2. BẢO MẬT PHÒNG</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button type="button" onClick={() => setCreateHasPassword(true)} className={`p-4 border-2 pixel-corners text-left flex items-center justify-between transition-colors ${createHasPassword ? 'bg-neo-cyan/20 border-neo-cyan shadow-[0_0_10px_rgba(0,240,255,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex items-center gap-3">
                    <Lock className={`w-6 h-6 ${createHasPassword ? 'text-neo-cyan' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-pixel text-2xl text-white">PRIVATE (MẬT KHẨU)</div>
                    </div>
                  </div>
                </button>
                <button type="button" onClick={() => setCreateHasPassword(false)} className={`p-4 border-2 pixel-corners text-left flex items-center justify-between transition-colors ${!createHasPassword ? 'bg-neo-amber/20 border-neo-amber shadow-[0_0_10px_rgba(255,184,0,0.5)]' : 'bg-black border-gray-700'}`}>
                  <div className="flex items-center gap-3">
                    <Unlock className={`w-6 h-6 ${!createHasPassword ? 'text-neo-amber' : 'text-gray-500'}`} />
                    <div>
                      <div className="font-pixel text-2xl text-white">PUBLIC (CÔNG KHAI)</div>
                    </div>
                  </div>
                </button>
              </div>

              {createHasPassword && (
                <div className="p-4 bg-black border-2 border-neo-cyan pixel-corners mt-4">
                  <label className="block font-pixel text-xl text-neo-cyan mb-2">NHẬP MẬT KHẨU PHÒNG:</label>
                  <input type="password" maxLength={32} value={createPasswordInput} onChange={(e) => setCreatePasswordInput(e.target.value)} placeholder="PASSWORD..." className="w-full px-4 py-3 bg-black border-2 border-gray-700 focus:border-neo-cyan focus:outline-none font-pixel text-2xl text-white pixel-corners" />
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t-2 border-neutral-800">
              <button type="submit" disabled={isBusy} className="btn-arcade px-8 py-4 text-xl flex items-center gap-2">
                {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                CONFIRM & CREATE
              </button>
            </div>
          </form>
        )}

        {subView === 'JOIN' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 bg-black border-4 border-neo-amber pixel-corners shadow-[0_0_15px_rgba(255,184,0,0.3)] flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-4 border-b-2 border-neo-amber pb-3">
                  <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber flex items-center justify-center text-neo-amber pixel-corners"><Zap className="w-6 h-6" /></div>
                  <h3 className="font-pixel text-3xl text-white uppercase">QUICK JOIN</h3>
                </div>
                <p className="text-sm text-gray-400">Tự động tìm kiếm và ghép phòng công khai (Public) trống.</p>
                {quickJoinEmptyMsg && (
                  <div className="mt-4 p-3 bg-black border-2 border-neo-rose text-neo-rose font-pixel text-xl pixel-corners flex items-center justify-between">
                    <span>{quickJoinEmptyMsg}</span>
                    <button type="button" onClick={handleQuickJoinRoom} className="btn-arcade-outline !border-neo-rose !text-neo-rose px-3 py-1">RETRY</button>
                  </div>
                )}
              </div>
              <button type="button" disabled={isBusy} onClick={handleQuickJoinRoom} className="btn-arcade w-full py-4 text-xl flex items-center justify-center gap-2">
                {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />} QUICK MATCH
              </button>
            </div>

            <form onSubmit={handleJoinRoomByCode} className="p-6 bg-black border-4 border-neo-cyan pixel-corners shadow-[0_0_15px_rgba(0,240,255,0.3)] flex flex-col justify-between space-y-6">
              <div>
                <div className="flex items-center gap-3 mb-4 border-b-2 border-neo-cyan pb-3">
                  <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><LogIn className="w-6 h-6" /></div>
                  <h3 className="font-pixel text-3xl text-white uppercase">JOIN BY CODE</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block font-pixel text-xl text-neo-cyan mb-2">ROOM CODE (6 CHARS):</label>
                    <input type="text" maxLength={6} value={joinCodeInput} onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} placeholder="ENTER CODE..." className="w-full px-4 py-3 bg-black border-2 border-gray-700 focus:border-neo-cyan focus:outline-none text-center font-pixel text-3xl tracking-[0.2em] text-white uppercase pixel-corners" />
                  </div>
                  <div>
                    <label className="block font-pixel text-xl text-neo-cyan mb-2 flex justify-between">
                      <span>PASSWORD:</span>
                      {needsPasswordForCode && <span className="text-neo-rose">REQUIRED!</span>}
                    </label>
                    <input type="password" maxLength={32} value={joinPasswordInput} onChange={(e) => setJoinPasswordInput(e.target.value)} placeholder="LEAVE BLANK IF PUBLIC..." className={`w-full px-4 py-3 bg-black border-2 font-pixel text-2xl text-white focus:outline-none pixel-corners ${needsPasswordForCode ? 'border-neo-rose focus:border-neo-rose' : 'border-gray-700 focus:border-neo-cyan'}`} />
                  </div>
                </div>
              </div>

              <button type="submit" disabled={isBusy || joinCodeInput.trim().length !== 6} className="btn-arcade w-full py-4 text-xl flex items-center justify-center gap-2">
                {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />} JOIN ROOM
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // ĐANG Ở TRONG PHÒNG CHỜ (WAITING)
  // ===========================================================================
  const bothPresent = Boolean(room.hostUid && room.guestUid);
  const p2pConnected = room.rtcConnectionState === 'CONNECTED';
  const bothReady = Boolean(bothPresent && room.hostReady && room.guestReady && p2pConnected);
  const myReady = role === 'HOST' ? room.hostReady : room.guestReady;

  const hostRole = resolveUserRole({ uid: room.hostUid, email: role === 'HOST' ? user?.email : null });
  const guestRole = resolveUserRole({ uid: room.guestUid, email: role === 'GUEST' ? user?.email : null });
  const hostFrameClasses = getRoleNameFrameClasses(hostRole);
  const guestFrameClasses = getRoleNameFrameClasses(guestRole);

  const lobbyStatusSummaryText = !bothPresent
    ? 'AWAITING P2 ARRIVAL...'
    : room.hostReady && room.guestReady
      ? 'SYSTEM READY. AWAITING COMMANDER (P1) START.'
      : room.hostReady && !room.guestReady
        ? 'P1 READY. AWAITING P2 CONFIRMATION.'
        : !room.hostReady && room.guestReady
          ? 'P2 READY. AWAITING P1 CONFIRMATION.'
          : 'P2 JOINED. INITIATE READY STATE.';

  return (
    <div className="p-6 bg-black border-4 border-neo-cyan pixel-corners shadow-[0_0_20px_rgba(0,240,255,0.4)] space-y-6 font-display">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-neo-cyan pb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners"><Globe className="w-6 h-6" /></div>
          <div>
            <div className="font-pixel text-3xl text-white uppercase flex items-center gap-3">
              LOBBY STATUS
              <span className={`px-2 py-1 text-sm border-2 pixel-corners ${room.difficulty === 'EXTREME' ? 'bg-neo-rose/20 text-neo-rose border-neo-rose' : 'bg-neo-amber/20 text-neo-amber border-neo-amber'}`}>
                {room.difficulty === 'EXTREME' ? 'HARDCORE' : 'NORMAL'}
              </span>
              <span className={`px-2 py-1 text-sm border-2 pixel-corners ${room.hasPassword ? 'bg-neo-cyan/20 text-neo-cyan border-neo-cyan' : 'bg-green-900/20 text-green-400 border-green-500'}`}>
                {room.hasPassword ? 'PRIVATE' : 'PUBLIC'}
              </span>
            </div>
            <p className="font-pixel text-xl text-gray-400 mt-1 animate-pulse">{lobbyStatusSummaryText}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-black border-2 border-neo-cyan pixel-corners px-4 py-2">
          <div>
            <div className="font-pixel text-lg text-neo-cyan">ROOM CODE</div>
            <div className="font-pixel text-4xl text-white tracking-[0.2em]">{room.roomCode}</div>
          </div>
          <button type="button" onClick={handleCopyCode} className="p-3 bg-neo-cyan/20 hover:bg-neo-cyan/40 border-2 border-neo-cyan text-neo-cyan pixel-corners transition-colors">
            {copied ? <Check className="w-6 h-6 text-white" /> : <Copy className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-black border-2 border-neo-rose text-neo-rose font-pixel text-xl pixel-corners flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" /><span>{errorMsg}</span>
        </div>
      )}

      {bothPresent && (
        <div className={`p-4 border-2 pixel-corners font-pixel text-xl flex items-center justify-between gap-3 ${room.rtcConnectionState === 'CONNECTED' ? 'bg-green-900/20 border-green-500 text-green-400' : room.rtcConnectionState === 'FAILED' ? 'bg-neo-rose/20 border-neo-rose text-neo-rose' : 'bg-neo-cyan/20 border-neo-cyan text-neo-cyan'}`}>
          <div className="flex items-center gap-3">
            {room.rtcConnectionState === 'CONNECTED' ? <Check className="w-6 h-6 shrink-0" /> : room.rtcConnectionState === 'FAILED' ? <AlertCircle className="w-6 h-6 shrink-0" /> : <Loader2 className="w-6 h-6 animate-spin shrink-0" />}
            <span>
              {room.rtcConnectionState === 'CONNECTED' ? 'P2P CONNECTION ESTABLISHED. READY FOR BATTLE.' : room.rtcConnectionState === 'FAILED' ? coopManager.getWebrtcErrorMessage() || 'P2P CONNECTION FAILED.' : 'ESTABLISHING P2P CONNECTION...'}
            </span>
          </div>
          {room.rtcConnectionState === 'FAILED' && (
            <button type="button" onClick={handleRetryWebRTC} disabled={isBusy} className="btn-arcade-outline px-4 py-2">RETRY P2P</button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* P1 */}
        <div className="p-4 bg-black border-2 border-neo-amber pixel-corners flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber text-neo-amber pixel-corners flex items-center justify-center shrink-0"><UserCheck className="w-6 h-6" /></div>
            <div className="min-w-0">
              <div className="font-pixel text-xl text-neo-amber">COMMANDER (P1)</div>
              <div className={`font-pixel text-2xl text-white truncate max-w-[160px] ${hostFrameClasses}`}>{room.hostDisplayName}</div>
            </div>
          </div>
          <span className={`font-pixel text-2xl px-3 py-1 border-2 pixel-corners shrink-0 ${room.hostReady ? 'bg-green-900/20 text-green-400 border-green-500' : 'bg-black text-gray-500 border-gray-700'}`}>
            {room.hostReady ? 'READY' : 'STANDBY'}
          </span>
        </div>

        {/* P2 */}
        <div className={`p-4 bg-black border-2 pixel-corners flex items-center justify-between ${room.guestUid ? 'border-neo-cyan' : 'border-dashed border-gray-700'}`}>
          {room.guestUid ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 bg-neo-cyan/20 border-2 border-neo-cyan text-neo-cyan pixel-corners flex items-center justify-center shrink-0"><Users className="w-6 h-6" /></div>
                <div className="min-w-0">
                  <div className="font-pixel text-xl text-neo-cyan">ALLY (P2)</div>
                  <div className={`font-pixel text-2xl text-white truncate max-w-[160px] ${guestFrameClasses}`}>{room.guestDisplayName || 'FIGHTER'}</div>
                </div>
              </div>
              <span className={`font-pixel text-2xl px-3 py-1 border-2 pixel-corners shrink-0 ${room.guestReady ? 'bg-green-900/20 text-green-400 border-green-500' : 'bg-black text-gray-500 border-gray-700'}`}>
                {room.guestReady ? 'READY' : 'STANDBY'}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-3 text-gray-500 font-pixel text-2xl">
              <Loader2 className="w-6 h-6 animate-spin text-neo-cyan" /> AWAITING P2...
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t-2 border-neutral-800">
        <button type="button" onClick={handleLeaveLobby} disabled={isBusy} className="btn-arcade-outline !border-gray-500 !text-gray-400 px-6 py-3 text-lg flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> ABORT
        </button>

        <div className="flex items-center gap-3">
          <button type="button" onClick={handleToggleReady} disabled={isBusy || (role === 'GUEST' && !room.guestUid)} className={`btn-arcade-outline px-6 py-3 text-lg flex items-center gap-2 ${myReady ? '!border-neo-rose !text-neo-rose' : '!border-green-500 !text-green-400'}`}>
            <ShieldCheck className="w-5 h-5" /> {myReady ? 'CANCEL READY' : 'SET READY'}
          </button>

          {role === 'HOST' && (
            <button type="button" onClick={handleHostStartMatch} disabled={isBusy || !bothReady} className={`btn-arcade px-8 py-3 text-lg flex items-center gap-2 ${(!bothReady) && 'opacity-50'}`}>
              <Play className="w-5 h-5" /> INITIATE LAUNCH
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
