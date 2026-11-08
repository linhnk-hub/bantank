/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Music,
  Upload,
  Play,
  Square,
  Trash2,
  Edit3,
  Check,
  RefreshCw,
  ShieldCheck,
  Lock,
  Sliders,
  Layers,
  AlertCircle,
  CheckCircle2,
  FileAudio,
  RotateCcw,
} from 'lucide-react';
import {
  MusicManager,
  PIXABAY_TARGET_TRACK_SPEC,
  type MusicTrackMetadata,
  type LoopPlaybackConfig,
  type MusicScopeAssignments,
  type UserRole,
  type GameModeScope,
} from '../core/musicManager.ts';

export const MusicAdminPanel: React.FC = () => {
  const musicManager = MusicManager.getInstance();

  const [role, setRole] = useState<UserRole>(() => musicManager.getUserRole());
  const [tracks, setTracks] = useState<MusicTrackMetadata[]>(() => musicManager.getTracks());
  const [loopConfig, setLoopConfig] = useState<LoopPlaybackConfig>(() => musicManager.getLoopConfig());
  const [assignments, setAssignments] = useState<MusicScopeAssignments>(() => musicManager.getAssignments());
  const [previewId, setPreviewId] = useState<string | null>(() => musicManager.getPreviewTrackId());

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [selectedStageForAssign, setSelectedStageForAssign] = useState<number>(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = musicManager.subscribe(() => {
      setRole(musicManager.getUserRole());
      setTracks(musicManager.getTracks());
      setLoopConfig(musicManager.getLoopConfig());
      setAssignments(musicManager.getAssignments());
      setPreviewId(musicManager.getPreviewTrackId());
    });
    return unsub;
  }, [musicManager]);

  const isSuperAdmin = role === 'SUPER_ADMIN';

  if (!isSuperAdmin) {
    return null;
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let uploadedCount = 0;
    let lastErr = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await musicManager.uploadTrack(file);
      if (res.success) {
        uploadedCount++;
      } else {
        lastErr = res.error || 'Lỗi không xác định';
      }
    }

    if (uploadedCount > 0) {
      setStatusMsg({
        type: 'success',
        text: `Đã tải lên thành công ${uploadedCount} bài nhạc vào thư viện (nhạc đang phát hiện tại được giữ nguyên, không bị tự động thay thế).`,
      });
    } else if (lastErr) {
      setStatusMsg({ type: 'error', text: lastErr });
    }

    e.target.value = '';
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingTrackId) return;

    const res = await musicManager.replaceTrackFile(replacingTrackId, file);
    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: `Đã thay thế file âm thanh cho bài "${res.track?.displayName}" thành công.`,
      });
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Lỗi thay thế file.' });
    }

    setReplacingTrackId(null);
    e.target.value = '';
  };

  const handleStartRename = (track: MusicTrackMetadata) => {
    setEditingId(track.id);
    setEditingName(track.displayName);
  };

  const handleConfirmRename = (trackId: string) => {
    if (musicManager.renameTrack(trackId, editingName)) {
      setStatusMsg({ type: 'success', text: 'Đã đổi tên hiển thị bài nhạc.' });
    }
    setEditingId(null);
  };

  const handleDelete = (track: MusicTrackMetadata) => {
    if (musicManager.deleteTrack(track.id)) {
      setStatusMsg({
        type: 'success',
        text: `Đã xóa bài "${track.displayName}" khỏi thư viện và gỡ các phạm vi áp dụng liên quan.`,
      });
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs} (${sec.toFixed(1)}s)`;
  };

  const effectiveStage1 = musicManager.resolveEffectiveTrack(1, 'SOLO');

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Top Banner & Role Switcher */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              Hệ Thống Quản Lý & Upload Nhạc Nền (MusicManager)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Tách biệt Game Core & SFX
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Hỗ trợ MP3, OGG, WAV • Skip Silence tự động • Seamless Loop & Crossfade • Phân cấp ưu tiên Stage → Mode → Toàn Game
          </p>
        </div>

        {/* Role Indicator (Server-enforced in M7) */}
        <div className="flex items-center gap-1.5 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 shrink-0 text-[10px] font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-neutral-300">Vai trò:</span>
          <span className={isSuperAdmin ? 'text-amber-400 font-extrabold' : 'text-sky-400'}>
            {isSuperAdmin ? 'Super Admin' : 'Người chơi'}
          </span>
        </div>
      </div>

      {/* Status Alert */}
      {statusMsg && (
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-[11px] ${
            statusMsg.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
              : 'bg-rose-950/70 border-rose-700/60 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-[10px] underline opacity-75 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Pixabay Target Track Info Card (Waiting for User 8-Bit File) */}
      <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <FileAudio className="w-3.5 h-3.5" />
            <span>Bản nhạc nguồn mục tiêu: {PIXABAY_TARGET_TRACK_SPEC.title}</span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Tác giả: <strong className="text-neutral-200">{PIXABAY_TARGET_TRACK_SPEC.author}</strong> • Thời lượng gốc: <strong className="text-neutral-200">{PIXABAY_TARGET_TRACK_SPEC.durationText}</strong> • Trạng thái: <span className="text-amber-400 font-semibold">Sẵn sàng nhận file MP3/OGG/WAV 8-bit từ máy tính</span>
          </p>
        </div>

        <div className="text-[10px] font-mono px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300 shrink-0">
          Đang phát Stage 1: <strong className="text-emerald-400">{effectiveStage1.track ? effectiveStage1.track.displayName : '8-Bit Arcade Mặc Định'}</strong> ({effectiveStage1.resolvedScope})
        </div>
      </div>

      {/* SECTION 1: UPLOAD & LIBRARY LIST */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <Upload className="w-4 h-4 text-amber-400" />
            <span>1. Thư Viện Nhạc Nền Đã Tải Lên ({tracks.length} bài)</span>
          </div>

          {isSuperAdmin ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
                onChange={handleReplaceFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow active:scale-95 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Tải File Nhạc Lên (MP3 / OGG / WAV)</span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Chỉ Super Admin được tải lên & chỉnh sửa
            </span>
          )}
        </div>

        {tracks.length === 0 ? (
          <div className="p-4 rounded-lg bg-neutral-900/60 border border-neutral-800/80 text-center text-neutral-400 space-y-1">
            <p className="font-semibold text-neutral-300">Chưa có file nhạc nền tùy chỉnh nào trong thư viện.</p>
            <p className="text-[11px]">
              Game hiện đang sử dụng nhạc nền 8-bit tích hợp mặc định. Nhấn <strong>"Tải File Nhạc Lên"</strong> để thêm file MP3/OGG/WAV (ví dụ bản 8-bit chuyển đổi từ <em>Gaming - Gaming Music</em>).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((track) => {
              const usageLabels = musicManager.getTrackUsageLabels(track.id);
              const isPreviewing = previewId === track.id;

              return (
                <div
                  key={track.id}
                  className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {editingId === track.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="px-2 py-0.5 rounded bg-neutral-950 border border-amber-500 text-white text-xs font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRename(track.id)}
                            className="p-1 rounded bg-emerald-500 text-black"
                            title="Lưu tên"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-extrabold text-white text-xs">{track.displayName}</span>
                      )}

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300">
                        {track.fileName}
                      </span>

                      {usageLabels.length > 0 ? (
                        usageLabels.map((lbl) => (
                          <span
                            key={lbl}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          >
                            Đang gán: {lbl}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400">
                          Trong thư viện (Chưa gán)
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 font-mono">
                      <span>Thời lượng: {formatDuration(track.durationSec)}</span>
                      <span>Dung lượng: {formatBytes(track.sizeBytes)}</span>
                      <span>
                        Skip Silence: cắt đầu {track.trimBounds.leadingSilenceDetectedSec}s / cuối {track.trimBounds.trailingSilenceDetectedSec}s
                      </span>
                    </div>
                  </div>

                  {/* Track Action Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        isPreviewing
                          ? musicManager.stopPreview()
                          : musicManager.previewTrack(track.id)
                      }
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                        isPreviewing
                          ? 'bg-amber-500 text-black'
                          : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                      }`}
                    >
                      {isPreviewing ? (
                        <>
                          <Square className="w-3 h-3 fill-black" />
                          <span>Dừng thử</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Nghe thử</span>
                        </>
                      )}
                    </button>

                    {isSuperAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleStartRename(track)}
                          className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                          title="Đổi tên hiển thị"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setReplacingTrackId(track.id);
                            replaceInputRef.current?.click();
                          }}
                          className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sky-400"
                          title="Thay thế file nhạc"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(track)}
                          className="p-1.5 rounded bg-neutral-800 hover:bg-rose-900/60 text-rose-400"
                          title="Xóa bài nhạc"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: LOOP, SKIP SILENCE & CROSSFADE */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>2. Cấu Hình Vòng Lặp Liên Tục – Skip Silence & Crossfade</span>
          </div>
          <span className="text-[10px] text-neutral-400 font-mono">
            Bảo toàn nhịp trống & nhạc cụ đầu/cuối
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={!isSuperAdmin}
            onClick={() => musicManager.updateLoopConfig({ loop: !loopConfig.loop })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.loop
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isSuperAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Loop Tự Động</span>
              <span>{loopConfig.loop ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Tự động phát lại khi hết bài</p>
          </button>

          <button
            type="button"
            disabled={!isSuperAdmin}
            onClick={() => musicManager.updateLoopConfig({ skipSilence: !loopConfig.skipSilence })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.skipSilence
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isSuperAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Skip Silence</span>
              <span>{loopConfig.skipSilence ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Bỏ qua khoảng lặng thực sự (&lt; -48dB)</p>
          </button>

          <button
            type="button"
            disabled={!isSuperAdmin}
            onClick={() => musicManager.updateLoopConfig({ seamlessLoop: !loopConfig.seamlessLoop })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.seamlessLoop
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isSuperAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Seamless Loop</span>
              <span>{loopConfig.seamlessLoop ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Chu kỳ lặp liền mạch không ngắt quãng</p>
          </button>

          <button
            type="button"
            disabled={!isSuperAdmin}
            onClick={() => musicManager.updateLoopConfig({ crossfade: !loopConfig.crossfade })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.crossfade
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isSuperAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Crossfade</span>
              <span>{loopConfig.crossfade ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Chồng mượt cuối & đầu bài tránh tiếng click</p>
          </button>
        </div>

        {/* Crossfade Duration Slider */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-neutral-300 font-semibold shrink-0">
            Thời gian Crossfade:
          </span>
          <input
            type="range"
            min="0.1"
            max="3.0"
            step="0.1"
            disabled={!isSuperAdmin || !loopConfig.crossfade}
            value={loopConfig.crossfadeDurationSec}
            onChange={(e) =>
              musicManager.updateLoopConfig({ crossfadeDurationSec: parseFloat(e.target.value) })
            }
            className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-neutral-800 rounded"
          />
          <span className="font-mono text-emerald-400 font-bold w-12 text-right">
            {loopConfig.crossfadeDurationSec.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* SECTION 3: SCOPE ASSIGNMENT & PRIORITY HIERARCHY */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>3. Phạm Vi Áp Dụng & Thứ Tự Ưu Tiên (Stage Riêng → Chế Độ Chơi → Toàn Game)</span>
          </div>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => musicManager.resetAllAssignmentsToDefault()}
              className="flex items-center gap-1 px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-semibold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Khôi phục Mặc định Toàn bộ</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Scope 1: Global All Game */}
          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>1. Toàn Bộ Game</span>
              <span className="text-[10px] text-neutral-400 font-mono">Ưu tiên #3</span>
            </div>
            <select
              disabled={!isSuperAdmin}
              value={assignments.globalTrackId ?? ''}
              onChange={(e) =>
                musicManager.assignToGlobal(e.target.value ? e.target.value : null)
              }
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Nhạc 8-Bit Mặc Định Tích Hợp --</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Scope 2: Game Mode */}
          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>2. Chế Độ Chơi (Solo 1P)</span>
              <span className="text-[10px] text-sky-400 font-mono">Ưu tiên #2</span>
            </div>
            <select
              disabled={!isSuperAdmin}
              value={assignments.modeTracks.SOLO ?? ''}
              onChange={(e) =>
                musicManager.assignToMode('SOLO' as GameModeScope, e.target.value ? e.target.value : null)
              }
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Kế thừa từ Toàn Bộ Game --</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Scope 3: Specific Stage */}
          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span>3. Stage Cụ Thể:</span>
                <select
                  value={selectedStageForAssign}
                  onChange={(e) => setSelectedStageForAssign(Number(e.target.value))}
                  className="bg-neutral-950 border border-neutral-700 rounded px-1.5 py-0.5 text-amber-400 font-mono text-[11px]"
                >
                  <option value={1}>Stage 1</option>
                  <option value={2}>Stage 2</option>
                  <option value={3}>Stage 3</option>
                </select>
              </div>
              <span className="text-[10px] text-amber-400 font-mono font-bold">Ưu tiên #1 (Cao nhất)</span>
            </div>
            <select
              disabled={!isSuperAdmin}
              value={assignments.stageTracks[selectedStageForAssign] ?? ''}
              onChange={(e) =>
                musicManager.assignToStage(
                  selectedStageForAssign,
                  e.target.value ? e.target.value : null
                )
              }
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Kế thừa từ Chế Độ Chơi --</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
