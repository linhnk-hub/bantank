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
  Lock,
  Sliders,
  Layers,
  AlertCircle,
  CheckCircle2,
  FileAudio,
  RotateCcw,
  Rocket,
  Film,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  MusicManager,
  SHARED_SYSTEM_BGM_ID,
  STAGED_LOCAL_PREVIEW_BGM_ID,
  type MusicTrackMetadata,
  type LoopPlaybackConfig,
  type MusicScopeAssignments,
  type SystemMediaConfigDocument,
  type HomeBackgroundVideoConfig,
  type SoundCatalogEntry,
  type UserRole,
  type GameModeScope,
} from '../core/musicManager.ts';
import {
  SoundManager,
  GAME_ACTION_SOUND_SLOTS,
  type GameActionSoundId,
  type CustomActionSoundTrack,
} from '../core/audio.ts';
import { StageManager, type ManagedStageRecord } from '../core/stageManager.ts';

export const MusicAdminPanel: React.FC = () => {
  const musicManager = MusicManager.getInstance();
  const soundManager = SoundManager.getInstance();

  const [role, setRole] = useState<UserRole>(() => musicManager.getUserRole());
  const [tracks, setTracks] = useState<MusicTrackMetadata[]>(() => musicManager.getTracks());
  const [soundCatalog, setSoundCatalog] = useState<SoundCatalogEntry[]>(() =>
    musicManager.getSoundCatalog()
  );
  const [loopConfig, setLoopConfig] = useState<LoopPlaybackConfig>(() => musicManager.getLoopConfig());
  const [assignments, setAssignments] = useState<MusicScopeAssignments>(() => musicManager.getAssignments());
  const [previewId, setPreviewId] = useState<string | null>(() => musicManager.getPreviewTrackId());
  const [sharedMediaConfig, setSharedMediaConfig] = useState<SystemMediaConfigDocument | null>(() =>
    musicManager.getSharedMediaConfig()
  );
  const [homeVideoConfig, setHomeVideoConfig] = useState<HomeBackgroundVideoConfig | null>(() =>
    musicManager.getHomeVideoConfig()
  );
  const [homeVideoUrl, setHomeVideoUrl] = useState<string | null>(() => musicManager.getHomeVideoUrl());
  const [isHomeVideoLoading, setIsHomeVideoLoading] = useState<boolean>(() =>
    musicManager.isHomeVideoLoading()
  );
  const [homeVideoError, setHomeVideoError] = useState<string | null>(() =>
    musicManager.getHomeVideoError()
  );
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(() =>
    musicManager.isCloudSyncing()
  );
  const [sharedSyncError, setSharedSyncError] = useState<string | null>(() =>
    musicManager.getSharedSyncError()
  );

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isLoopDirty, setIsLoopDirty] = useState<boolean>(false);
  const [isAssignmentsDirty, setIsAssignmentsDirty] = useState<boolean>(false);

  // Draft local values for Home Video opacity/loop/enabled before clicking Kích hoạt
  const [videoOpacityDraft, setVideoOpacityDraft] = useState<number>(
    () => musicManager.getHomeVideoConfig()?.opacity ?? 0.35
  );
  const [videoLoopDraft, setVideoLoopDraft] = useState<boolean>(
    () => musicManager.getHomeVideoConfig()?.loop ?? true
  );
  const [videoEnabledDraft, setVideoEnabledDraft] = useState<boolean>(
    () => musicManager.getHomeVideoConfig()?.isEnabled ?? true
  );
  const [isVideoDirty, setIsVideoDirty] = useState<boolean>(false);

  const multiUploadInputRef = useRef<HTMLInputElement | null>(null);
  const videoUploadInputRef = useRef<HTMLInputElement | null>(null);
  const actionSfxInputRef = useRef<HTMLInputElement | null>(null);
  const [targetActionSfxId, setTargetActionSfxId] = useState<GameActionSoundId | null>(null);
  const [actionSfxTracks, setActionSfxTracks] = useState<
    Record<GameActionSoundId, CustomActionSoundTrack | null>
  >(() => soundManager.getAllActionSoundTracks());
  const [actionSfxError, setActionSfxError] = useState<string | null>(() =>
    soundManager.getCloudActionSfxError()
  );
  const [managedStages, setManagedStages] = useState<ManagedStageRecord[]>(() =>
    StageManager.getInstance().getManagedStages()
  );
  const [isUploadingBatch, setIsUploadingBatch] = useState<boolean>(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState<boolean>(false);
  const [isUploadingActionSfx, setIsUploadingActionSfx] = useState<boolean>(false);

  useEffect(() => {
    const stageManager = StageManager.getInstance();
    const unsubMusic = musicManager.subscribe(() => {
      setRole(musicManager.getUserRole());
      setTracks(musicManager.getTracks());
      setSoundCatalog(musicManager.getSoundCatalog());
      setLoopConfig(musicManager.getLoopConfig());
      setAssignments(musicManager.getAssignments());
      setPreviewId(musicManager.getPreviewTrackId());
      setSharedMediaConfig(musicManager.getSharedMediaConfig());
      const nextHv = musicManager.getHomeVideoConfig();
      setHomeVideoConfig(nextHv);
      if (nextHv && !isVideoDirty) {
        setVideoOpacityDraft(nextHv.opacity);
        setVideoLoopDraft(nextHv.loop);
        setVideoEnabledDraft(nextHv.isEnabled);
      }
      setHomeVideoUrl(musicManager.getHomeVideoUrl());
      setIsHomeVideoLoading(musicManager.isHomeVideoLoading());
      setHomeVideoError(musicManager.getHomeVideoError());
      setIsCloudSyncing(musicManager.isCloudSyncing());
      setSharedSyncError(musicManager.getSharedSyncError());
    });
    const unsubSound = soundManager.subscribe(() => {
      setActionSfxTracks(soundManager.getAllActionSoundTracks());
      setActionSfxError(soundManager.getCloudActionSfxError());
    });
    const unsubStages = stageManager.subscribe(() => {
      setManagedStages(stageManager.getManagedStages());
    });
    return () => {
      unsubMusic();
      unsubSound();
      unsubStages();
    };
  }, [musicManager, soundManager, isVideoDirty]);

  const isAdmin = role === 'ADMIN';
  if (!isAdmin) {
    return null;
  }

  // Danh sách file âm thanh duy nhất để hiển thị & chọn gán
  const selectableTracks: MusicTrackMetadata[] = tracks.filter((t) => {
    if (t.id === STAGED_LOCAL_PREVIEW_BGM_ID) return false;
    if (t.id === SHARED_SYSTEM_BGM_ID && soundCatalog.some((c) => c.storagePath === t.storagePathOrUrl)) {
      return false;
    }
    return true;
  });

  const sortedStages: ManagedStageRecord[] =
    managedStages.length > 0
      ? [...managedStages].sort((a, b) => a.orderIndex - b.orderIndex)
      : [];

  const handleMultiAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    e.target.value = '';

    setStatusMsg(null);
    musicManager.clearSharedSyncError();
    soundManager.unlock();
    setIsUploadingBatch(true);

    try {
      const res = await musicManager.uploadMultipleAudioFiles(files, {
        autoActivateSingle: false,
      });
      setSoundCatalog(musicManager.getSoundCatalog());
      setTracks(musicManager.getTracks());

      if (res.uploaded.length > 0 && res.failed.length === 0) {
        setStatusMsg({
          type: 'success',
          text: `Đã tải lên thành công ${res.uploaded.length} file âm thanh vào thư viện Media. Hãy chọn file áp dụng cho Nhạc nền / Stage bên dưới rồi bấm "Kích hoạt".`,
        });
      } else if (res.uploaded.length > 0 && res.failed.length > 0) {
        setStatusMsg({
          type: 'info',
          text: `Đã tải lên ${res.uploaded.length} file. ${res.failed.length} file lỗi: ${res.failed
            .map((f) => `${f.fileName} (${f.error})`)
            .join('; ')}`,
        });
      } else if (res.failed.length > 0) {
        setStatusMsg({
          type: 'error',
          text: res.failed.map((f) => `${f.fileName}: ${f.error}`).join(' | '),
        });
      }
    } finally {
      setIsUploadingBatch(false);
    }
  };

  const handleDeleteTrackOrCatalog = async (track: MusicTrackMetadata) => {
    setStatusMsg(null);
    const inCatalog = soundCatalog.some((c) => c.soundId === track.id);
    if (inCatalog) {
      const res = await musicManager.deleteCatalogSound(track.id);
      if (res.success) {
        setSoundCatalog(musicManager.getSoundCatalog());
        setTracks(musicManager.getTracks());
        setStatusMsg({
          type: 'info',
          text: `Đã xóa "${track.displayName}" khỏi thư viện âm thanh.`,
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || 'Không thể xóa file âm thanh.',
        });
      }
    } else if (musicManager.deleteTrack(track.id)) {
      setTracks(musicManager.getTracks());
      setStatusMsg({
        type: 'info',
        text: `Đã gỡ "${track.displayName}" khỏi thư viện.`,
      });
    }
  };

  const handleStartRename = (track: MusicTrackMetadata) => {
    setEditingId(track.id);
    setEditingName(track.displayName);
  };

  const handleConfirmRename = (trackId: string) => {
    if (musicManager.renameTrack(trackId, editingName)) {
      setStatusMsg({ type: 'success', text: 'Đã cập nhật tên hiển thị file âm thanh.' });
    }
    setEditingId(null);
  };

  const handleUpdateLoopField = (partial: Partial<LoopPlaybackConfig>) => {
    musicManager.updateLoopConfig(partial);
    setIsLoopDirty(true);
  };

  const handleActivateLoopConfig = async () => {
    setStatusMsg(null);
    const res = await musicManager.activateLoopConfigSystemWide();
    if (res.success) {
      setIsLoopDirty(false);
      setStatusMsg({
        type: 'success',
        text: 'Đã kích hoạt cấu hình vòng lặp liên tục (áp dụng cho Nhạc nền Trang chủ và Nhạc nền Stage) trên toàn hệ thống!',
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể kích hoạt cấu hình vòng lặp lên hệ thống.',
      });
    }
  };

  const handleActivateAssignments = async () => {
    setStatusMsg(null);
    const res = await musicManager.activateMediaAssignmentsSystemWide();
    if (res.success) {
      setIsAssignmentsDirty(false);
      setStatusMsg({
        type: 'success',
        text: 'Đã kích hoạt & đồng bộ phân bổ Nhạc nền (Trang chủ, Toàn Game, Solo, 2 - AI, 2P và từng Stage) cho tất cả người chơi!',
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể lưu cấu hình phạm vi âm thanh lên Firestore.',
      });
    }
  };

  const handleUploadHomeVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusMsg(null);
    setIsUploadingVideo(true);
    try {
      const res = await musicManager.uploadHomeBackgroundVideo(file, {
        opacity: videoOpacityDraft,
        loop: videoLoopDraft,
      });
      if (res.success && res.homeVideo) {
        setIsVideoDirty(false);
        setVideoOpacityDraft(res.homeVideo.opacity);
        setVideoLoopDraft(res.homeVideo.loop);
        setVideoEnabledDraft(res.homeVideo.isEnabled);
        setStatusMsg({
          type: 'success',
          text: `Đã tải lên & kích hoạt video nền "${res.homeVideo.displayName}" cho Trang chủ!`,
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || 'Không thể tải lên video nền .mp4.',
        });
      }
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleActivateStaticIntroVideo = async () => {
    setStatusMsg(null);
    setIsUploadingVideo(true);
    try {
      const res = await musicManager.activateStaticIntroVideo({
        opacity: videoOpacityDraft,
        loop: videoLoopDraft,
      });
      if (res.success && res.homeVideo) {
        setIsVideoDirty(false);
        setVideoOpacityDraft(res.homeVideo.opacity);
        setVideoLoopDraft(res.homeVideo.loop);
        setVideoEnabledDraft(res.homeVideo.isEnabled);
        setStatusMsg({
          type: 'success',
          text: 'Đã kích hoạt video nền mặc định (intro-bantank.mp4) cho Trang chủ!',
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || 'Không thể kích hoạt video nền mặc định.',
        });
      }
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const handleActivateHomeVideoSettings = async () => {
    setStatusMsg(null);
    const res = await musicManager.updateHomeVideoSettings({
      opacity: videoOpacityDraft,
      loop: videoLoopDraft,
      isEnabled: videoEnabledDraft,
    });
    if (res.success) {
      setIsVideoDirty(false);
      setStatusMsg({
        type: 'success',
        text: 'Đã kích hoạt & đồng bộ cấu hình Video nền Trang chủ (độ mờ, lặp lại, bật/tắt) toàn hệ thống!',
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể cập nhật cấu hình video nền.',
      });
    }
  };

  const handleDeleteHomeVideo = async () => {
    setStatusMsg(null);
    const res = await musicManager.deleteHomeBackgroundVideo();
    if (res.success) {
      setIsVideoDirty(false);
      setStatusMsg({
        type: 'info',
        text: 'Đã gỡ video nền Trang chủ.',
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể xóa video nền Trang chủ.',
      });
    }
  };

  const handleActionSfxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const actionId = targetActionSfxId;
    setTargetActionSfxId(null);
    if (!file || !actionId) return;

    setIsUploadingActionSfx(true);
    try {
      const res = await soundManager.uploadActionSound(actionId, file, { autoActivate: false });
      if (res.ok && res.track) {
        setActionSfxTracks(soundManager.getAllActionSoundTracks());
        setStatusMsg({
          type: 'info',
          text: `Đã tải lên file "${res.track.fileName}" (${res.track.durationSec}s) cho [${actionId}]. Hãy bấm nút "Kích hoạt" để áp dụng cho toàn bộ người chơi.`,
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || 'Không thể tải lên file âm thanh hành động.',
        });
      }
    } finally {
      setIsUploadingActionSfx(false);
    }
  };

  const handleActivateActionSfx = (actionId: GameActionSoundId, label: string) => {
    soundManager.unlock();
    const res = soundManager.activateActionSound(actionId);
    if (res.ok && res.track) {
      setActionSfxTracks(soundManager.getAllActionSoundTracks());
      setStatusMsg({
        type: 'success',
        text: `Đã kích hoạt âm thanh "${res.track.fileName}" cho "${label}" và đồng bộ cho toàn bộ người chơi.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể kích hoạt âm thanh hành động.',
      });
    }
  };

  const handleDeactivateActionSfx = (actionId: GameActionSoundId, label: string) => {
    const res = soundManager.deactivateActionSound(actionId);
    if (res.ok) {
      setActionSfxTracks(soundManager.getAllActionSoundTracks());
      setStatusMsg({
        type: 'info',
        text: `Đã tạm tắt file tùy chỉnh cho "${label}" (giữ lại file đã tải lên, phát lại 8-Bit mặc định).`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể tạm tắt âm thanh hành động.',
      });
    }
  };

  const handleDeleteActionSfx = (actionId: GameActionSoundId, label: string) => {
    const res = soundManager.deleteActionSound(actionId);
    if (res.ok) {
      setActionSfxTracks(soundManager.getAllActionSoundTracks());
      setStatusMsg({
        type: 'info',
        text: `Đã xóa file tùy chỉnh và khôi phục âm thanh 8-Bit mặc định cho "${label}".`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể xóa âm thanh hành động.',
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

  const trackLabelForId = (id: string | null | undefined) => {
    if (!id) return 'Chưa gán';
    return selectableTracks.find((t) => t.id === id)?.displayName || 'Đã chọn';
  };

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Top Banner */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Music className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              Quản Lý Media, Nhạc Nền &amp; Video Hệ Thống
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Đồng Bộ Thời Gian Thực
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Tải lên nhiều file âm thanh (MP3, OGG, WAV, M4A ≤ 25 MB) và video nền (.mp4 ≤ 100 MB) để gán cho Trang chủ, Chế độ chơi &amp; từng Stage.
          </p>
        </div>
        {sharedMediaConfig && (
          <div className="text-[10px] font-mono text-neutral-400 shrink-0">
            Cập nhật lúc: {new Date(sharedMediaConfig.updatedAt).toLocaleString('vi-VN')}
          </div>
        )}
      </div>

      {/* Status Alert */}
      {(statusMsg || sharedSyncError || actionSfxError || homeVideoError) && (
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-[11px] ${
            sharedSyncError || actionSfxError || homeVideoError || statusMsg?.type === 'error'
              ? 'bg-rose-950/70 border-rose-700/60 text-rose-200'
              : statusMsg?.type === 'info'
                ? 'bg-sky-950/70 border-sky-700/60 text-sky-200'
                : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {sharedSyncError || actionSfxError || homeVideoError || statusMsg?.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="break-words">
              {sharedSyncError || actionSfxError || homeVideoError || statusMsg?.text}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatusMsg(null);
              musicManager.clearSharedSyncError();
              soundManager.clearCloudActionSfxError();
            }}
            className="text-[10px] underline opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* SECTION 1: MULTI-FILE AUDIO UPLOAD & LIBRARY */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <FileAudio className="w-4 h-4 text-amber-400" />
            <span>1. Thư Viện File Âm Thanh ({selectableTracks.length} file)</span>
          </div>

          {isAdmin ? (
            <div>
              <input
                ref={multiUploadInputRef}
                type="file"
                multiple
                accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm"
                onChange={handleMultiAudioUpload}
                className="hidden"
              />
              <button
                type="button"
                data-testid="media-multi-upload-btn"
                disabled={isCloudSyncing || isUploadingBatch}
                onClick={() => multiUploadInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow active:scale-95 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {isUploadingBatch || isCloudSyncing
                    ? 'Đang tải lên thư viện...'
                    : 'Tải Lên Nhiều File Âm Thanh (MP3 / OGG / WAV / M4A)'}
                </span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Chỉ Admin được quản lý Media
            </span>
          )}
        </div>

        {selectableTracks.length === 0 ? (
          <div className="p-4 rounded-lg bg-neutral-900/60 border border-neutral-800/80 text-center text-neutral-400 space-y-1">
            <p className="font-semibold text-neutral-300">Chưa có file âm thanh nào trong thư viện.</p>
            <p className="text-[11px]">
              Nhấn <strong>&quot;Tải Lên Nhiều File Âm Thanh&quot;</strong> để chọn một hoặc nhiều bài nhạc, sau đó gán cho Trang chủ, Chế độ chơi và từng Stage bên dưới.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {selectableTracks.map((track) => {
              const usageLabels = musicManager.getTrackUsageLabels(track.id);
              const isPreviewing = previewId === track.id;

              return (
                <div
                  key={track.id}
                  className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                >
                  <div className="space-y-1 flex-1 min-w-0">
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
                            className="p-1 rounded bg-emerald-500 text-black cursor-pointer"
                            title="Lưu tên"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-extrabold text-white text-xs">{track.displayName}</span>
                      )}

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 truncate max-w-[200px]">
                        {track.fileName}
                      </span>

                      {usageLabels.length > 0 ? (
                        usageLabels.map((lbl) => (
                          <span
                            key={lbl}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          >
                            {lbl}
                          </span>
                        ))
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400">
                          Sẵn sàng gán
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-400 font-mono">
                      <span>Thời lượng: {formatDuration(track.durationSec)}</span>
                      <span>Dung lượng: {formatBytes(track.sizeBytes)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        isPreviewing
                          ? musicManager.stopPreview()
                          : musicManager.previewTrack(track.id)
                      }
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
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

                    <button
                      type="button"
                      onClick={() => handleStartRename(track)}
                      className="p-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
                      title="Đổi tên hiển thị"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={isCloudSyncing}
                      onClick={() => void handleDeleteTrackOrCatalog(track)}
                      className="p-1.5 rounded bg-neutral-800 hover:bg-rose-900/60 text-rose-400 cursor-pointer disabled:opacity-50"
                      title="Xóa khỏi thư viện"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: LOOP, SKIP SILENCE & CROSSFADE (WITH SYSTEM-WIDE ACTIVATE BUTTON) */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-neutral-200">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>2. Cấu Hình Vòng Lặp Liên Tục – Skip Silence &amp; Crossfade</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Áp dụng cho âm thanh <strong className="text-neutral-200">Nhạc nền Trang chủ</strong> và{' '}
              <strong className="text-neutral-200">Nhạc nền Stage</strong> trên toàn hệ thống.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isLoopDirty && (
              <span className="text-[10px] font-semibold text-amber-300">
                Chưa đồng bộ toàn hệ thống
              </span>
            )}
            <button
              type="button"
              data-testid="loop-activate-btn"
              disabled={isCloudSyncing}
              onClick={() => void handleActivateLoopConfig()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow active:scale-95 transition-all cursor-pointer"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Kích hoạt</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => handleUpdateLoopField({ loop: !loopConfig.loop })}
            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              loopConfig.loop
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Loop Tự Động</span>
              <span>{loopConfig.loop ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Tự động phát lại khi hết bài</p>
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => handleUpdateLoopField({ skipSilence: !loopConfig.skipSilence })}
            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              loopConfig.skipSilence
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Skip Silence</span>
              <span>{loopConfig.skipSilence ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Bỏ qua khoảng lặng (&lt; -48dB)</p>
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => handleUpdateLoopField({ seamlessLoop: !loopConfig.seamlessLoop })}
            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              loopConfig.seamlessLoop
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Seamless Loop</span>
              <span>{loopConfig.seamlessLoop ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Chu kỳ lặp liền mạch</p>
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => handleUpdateLoopField({ crossfade: !loopConfig.crossfade })}
            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              loopConfig.crossfade
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Crossfade</span>
              <span>{loopConfig.crossfade ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Chồng mượt cuối &amp; đầu bài</p>
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
            disabled={!isAdmin || !loopConfig.crossfade}
            value={loopConfig.crossfadeDurationSec}
            onChange={(e) =>
              handleUpdateLoopField({ crossfadeDurationSec: parseFloat(e.target.value) })
            }
            className="flex-1 accent-emerald-500 cursor-pointer h-1.5 bg-neutral-800 rounded"
          />
          <span className="font-mono text-emerald-400 font-bold w-12 text-right">
            {loopConfig.crossfadeDurationSec.toFixed(1)}s
          </span>
        </div>
      </div>

      {/* SECTION 3: SCOPE ASSIGNMENT (NHẠC NỀN TRANG CHỦ, TOÀN GAME, SOLO, 2 - AI, 2P, TẤT CẢ STAGE) */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-neutral-200">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>3. Phạm Vi Áp Dụng Âm Thanh</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Chọn file cho Nhạc nền Trang chủ, Toàn Game, từng chế độ (Solo, 2 - AI, 2P) và từng Stage đang có, sau đó bấm <strong>Kích hoạt</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAssignmentsDirty && (
              <span className="text-[10px] font-semibold text-amber-300">
                Có thay đổi chưa kích hoạt
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                musicManager.resetAllAssignmentsToDefault();
                setIsAssignmentsDirty(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt lại mặc định</span>
            </button>
            <button
              type="button"
              data-testid="media-assignments-activate-btn"
              disabled={isCloudSyncing}
              onClick={() => void handleActivateAssignments()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow active:scale-95 transition-all cursor-pointer"
            >
              <Rocket className="w-3.5 h-3.5" />
              <span>Kích hoạt</span>
            </button>
          </div>
        </div>

        {/* 3A. Nhạc nền Trang chủ & Toàn Bộ Game */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>Nhạc nền &gt; Trang chủ</span>
              <span className="text-[10px] text-amber-300 font-mono">
                {trackLabelForId(assignments.homeTrackId)}
              </span>
            </div>
            <select
              data-testid="assign-home-select"
              disabled={!isAdmin}
              value={assignments.homeTrackId ?? ''}
              onChange={(e) => {
                musicManager.assignToHome(e.target.value ? e.target.value : null);
                setIsAssignmentsDirty(true);
              }}
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Theo Nhạc nền Toàn Game / Tắt --</option>
              {selectableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.fileName})
                </option>
              ))}
            </select>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>Nhạc nền &gt; Toàn Bộ Game</span>
              <span className="text-[10px] text-neutral-400 font-mono">
                {trackLabelForId(assignments.globalTrackId)}
              </span>
            </div>
            <select
              data-testid="assign-global-select"
              disabled={!isAdmin}
              value={assignments.globalTrackId ?? ''}
              onChange={(e) => {
                musicManager.assignToGlobal(e.target.value ? e.target.value : null);
                setIsAssignmentsDirty(true);
              }}
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Tắt / Chưa chọn file --</option>
              {selectableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.fileName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3B. Chế độ chơi: Solo (1P), 2 - AI, 2P */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>Chế độ: Solo (1P)</span>
              <span className="text-[10px] text-sky-400 font-mono">
                {assignments.modeTracks.SOLO ? 'Riêng' : 'Kế thừa'}
              </span>
            </div>
            <select
              data-testid="assign-mode-solo-select"
              disabled={!isAdmin}
              value={assignments.modeTracks.SOLO ?? ''}
              onChange={(e) => {
                musicManager.assignToMode('SOLO' as GameModeScope, e.target.value ? e.target.value : null);
                setIsAssignmentsDirty(true);
              }}
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Kế thừa Toàn Game --</option>
              {selectableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.fileName})
                </option>
              ))}
            </select>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>Chế độ: 2 - AI</span>
              <span className="text-[10px] text-sky-400 font-mono">
                {assignments.modeTracks.COOP_AI ? 'Riêng' : 'Kế thừa'}
              </span>
            </div>
            <select
              data-testid="assign-mode-coop-ai-select"
              disabled={!isAdmin}
              value={assignments.modeTracks.COOP_AI ?? ''}
              onChange={(e) => {
                musicManager.assignToMode('COOP_AI' as GameModeScope, e.target.value ? e.target.value : null);
                setIsAssignmentsDirty(true);
              }}
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Kế thừa Toàn Game --</option>
              {selectableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.fileName})
                </option>
              ))}
            </select>
          </div>

          <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 space-y-1.5">
            <div className="font-bold text-neutral-200 flex items-center justify-between">
              <span>Chế độ: 2P</span>
              <span className="text-[10px] text-sky-400 font-mono">
                {assignments.modeTracks.TWO_PLAYER ? 'Riêng' : 'Kế thừa'}
              </span>
            </div>
            <select
              data-testid="assign-mode-two-player-select"
              disabled={!isAdmin}
              value={assignments.modeTracks.TWO_PLAYER ?? ''}
              onChange={(e) => {
                musicManager.assignToMode('TWO_PLAYER' as GameModeScope, e.target.value ? e.target.value : null);
                setIsAssignmentsDirty(true);
              }}
              className="w-full p-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Kế thừa Toàn Game --</option>
              {selectableTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName} ({t.fileName})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3C. Nhạc Stage — Hiển thị danh sách toàn bộ Stage đang có */}
        <div className="p-3 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300 text-xs">
              Nhạc Stage &gt; Danh Sách Stage Đang Có ({sortedStages.length > 0 ? sortedStages.length : 1})
            </span>
            <span className="text-[10px] text-neutral-400 font-mono">
              Ưu tiên cao nhất khi vào từng màn chơi
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
            {(sortedStages.length > 0
              ? sortedStages
              : [{ id: 1, name: 'Stage 1 (Chính thức)', orderIndex: 1, status: 'ACTIVE' as const }]
            ).map((stage) => (
              <div
                key={stage.id}
                className="p-2 rounded-lg bg-neutral-950 border border-neutral-800 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-neutral-100 text-[11px] truncate">
                    Stage {stage.orderIndex}: {stage.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                      stage.status === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {stage.status === 'ACTIVE' ? 'Đang mở' : 'Bản nháp'}
                  </span>
                </div>
                <select
                  data-testid={`assign-stage-${stage.id}-select`}
                  disabled={!isAdmin}
                  value={assignments.stageTracks[stage.id] ?? ''}
                  onChange={(e) => {
                    musicManager.assignToStage(stage.id, e.target.value ? e.target.value : null);
                    setIsAssignmentsDirty(true);
                  }}
                  className="w-full p-1.5 rounded bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs"
                >
                  <option value="">-- Kế thừa từ Chế độ chơi / Toàn Game --</option>
                  {selectableTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.displayName} ({t.fileName})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 4: HOME BACKGROUND VIDEO (.mp4) WITH OPACITY & LOOP */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-bold text-neutral-200">
              <Film className="w-4 h-4 text-amber-400" />
              <span>4. Video Chạy Nền Trang Chủ (.mp4)</span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Tải lên video định dạng <code className="text-amber-300 font-mono">.mp4</code> (tối đa 100 MB) để chạy nền Trang chủ với độ mờ và vòng lặp liên tục.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={videoUploadInputRef}
              type="file"
              accept=".mp4,video/mp4"
              onChange={handleUploadHomeVideo}
              className="hidden"
            />
            <button
              type="button"
              data-testid="upload-home-video-btn"
              disabled={isCloudSyncing || isUploadingVideo}
              onClick={() => videoUploadInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-extrabold text-xs shadow transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploadingVideo ? 'Đang tải video...' : 'Upload Video (.mp4)'}</span>
            </button>
            <button
              type="button"
              data-testid="use-default-intro-video-btn"
              disabled={isCloudSyncing || isUploadingVideo}
              onClick={() => void handleActivateStaticIntroVideo()}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 font-bold text-[11px] transition-all cursor-pointer disabled:opacity-50"
            >
              Dùng video có sẵn
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
          {/* Controls */}
          <div className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 space-y-3">
            <div className="text-[11px] text-neutral-300 flex items-center justify-between gap-2">
              <span>File hiện tại:</span>
              <strong className="text-amber-300 font-mono truncate max-w-[220px]">
                {homeVideoConfig ? `${homeVideoConfig.fileName} (${formatBytes(homeVideoConfig.fileSize)})` : 'Chưa cài đặt'}
              </strong>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!homeVideoConfig}
                onClick={() => {
                  setVideoEnabledDraft((v) => !v);
                  setIsVideoDirty(true);
                }}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 ${
                  videoEnabledDraft
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="font-extrabold text-[11px] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    {videoEnabledDraft ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    Hiển thị
                  </span>
                  <span>{videoEnabledDraft ? 'BẬT' : 'TẮT'}</span>
                </div>
              </button>

              <button
                type="button"
                disabled={!homeVideoConfig}
                onClick={() => {
                  setVideoLoopDraft((v) => !v);
                  setIsVideoDirty(true);
                }}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-40 ${
                  videoLoopDraft
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="font-extrabold text-[11px] flex items-center justify-between">
                  <span>Lặp lại (Loop)</span>
                  <span>{videoLoopDraft ? 'BẬT' : 'TẮT'}</span>
                </div>
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-neutral-300 font-semibold">Độ mờ video nền (Opacity):</span>
                <span className="font-mono font-bold text-amber-300">
                  {Math.round(videoOpacityDraft * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                disabled={!homeVideoConfig}
                value={videoOpacityDraft}
                onChange={(e) => {
                  setVideoOpacityDraft(parseFloat(e.target.value));
                  setIsVideoDirty(true);
                }}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-neutral-800 rounded disabled:opacity-40"
              />
            </div>

            {homeVideoConfig && (
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  data-testid="activate-home-video-btn"
                  disabled={isCloudSyncing}
                  onClick={() => void handleActivateHomeVideoSettings()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow cursor-pointer"
                >
                  <Rocket className="w-3.5 h-3.5" />
                  <span>{isVideoDirty ? 'Kích hoạt thay đổi' : 'Kích hoạt'}</span>
                </button>
                <button
                  type="button"
                  disabled={isCloudSyncing}
                  onClick={() => void handleDeleteHomeVideo()}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa</span>
                </button>
              </div>
            )}
          </div>

          {/* Preview Card */}
          <div className="relative h-36 rounded-lg border border-neutral-800 bg-neutral-950 overflow-hidden flex items-center justify-center">
            {isHomeVideoLoading ? (
              <span className="text-[11px] text-neutral-400 font-mono">Đang tải video xem trước...</span>
            ) : homeVideoUrl && videoEnabledDraft ? (
              <>
                <video
                  src={homeVideoUrl}
                  autoPlay
                  muted
                  playsInline
                  loop={videoLoopDraft}
                  style={{ opacity: videoOpacityDraft }}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
                <div className="relative z-10 px-3 py-1 rounded bg-neutral-950/75 border border-neutral-700 text-[10px] font-mono text-amber-300">
                  Xem trước độ mờ {Math.round(videoOpacityDraft * 100)}% • {videoLoopDraft ? 'Loop' : '1 lần'}
                </div>
              </>
            ) : (
              <span className="text-[11px] text-neutral-500">
                {homeVideoConfig ? 'Video nền đang tạm tắt' : 'Chưa có video nền Trang chủ'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 5: ACTION SFX */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <FileAudio className="w-4 h-4 text-amber-400" />
            <span>5. Âm thanh hành động (Action SFX)</span>
          </div>
        </div>

        <p className="text-[11px] text-neutral-400 leading-relaxed">
          Tải lên hoặc thay thế file âm thanh riêng (<code>.mp3</code>, <code>.ogg</code>, <code>.wav</code>) cho từng hành động chiến đấu trong game. Nếu chưa tải file riêng, hệ thống tự động sử dụng bộ tổng hợp âm thanh 8-Bit mặc định.
        </p>

        <input
          ref={actionSfxInputRef}
          type="file"
          accept=".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav"
          onChange={handleActionSfxFileChange}
          className="hidden"
        />

        <div className="space-y-2">
          {GAME_ACTION_SOUND_SLOTS.map((slot) => {
            const customTrack = actionSfxTracks[slot.id];
            const isCustomActive = Boolean(customTrack && customTrack.isActive !== false);
            return (
              <div
                key={slot.id}
                data-testid={`admin-action-sfx-row-${slot.id}`}
                className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  isCustomActive
                    ? 'bg-emerald-950/20 border-emerald-500/50'
                    : customTrack
                      ? 'bg-amber-950/20 border-amber-500/50'
                      : 'bg-neutral-900/90 border-neutral-800'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-neutral-100 text-xs">{slot.label}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                        isCustomActive
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                          : customTrack
                            ? 'bg-amber-950/90 text-amber-300 border-amber-500/40'
                            : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {isCustomActive
                        ? 'ĐANG KÍCH HOẠT'
                        : customTrack
                          ? 'CHƯA KÍCH HOẠT'
                          : '8-BIT MẶC ĐỊNH'}
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400">{slot.description}</p>
                  {customTrack && (
                    <div className="text-[10px] font-mono text-amber-300/90 truncate">
                      File: {customTrack.fileName} • {customTrack.durationSec}s •{' '}
                      {(customTrack.fileSizeBytes / 1024).toFixed(1)} KB
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.unlock();
                      soundManager.previewActionSound(slot.id, true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-neutral-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title={`Nghe thử âm thanh ${slot.label}`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Nghe thử</span>
                  </button>

                  {customTrack && !isCustomActive && (
                    <button
                      type="button"
                      data-testid={`admin-action-sfx-activate-${slot.id}`}
                      onClick={() => handleActivateActionSfx(slot.id, slot.label)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/50 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                      title={`Kích hoạt âm thanh tùy chỉnh cho ${slot.label}`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Kích hoạt</span>
                    </button>
                  )}

                  {customTrack && isCustomActive && (
                    <button
                      type="button"
                      data-testid={`admin-action-sfx-deactivate-${slot.id}`}
                      onClick={() => handleDeactivateActionSfx(slot.id, slot.label)}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="Dùng file 8-Bit mặc định"
                    >
                      <Square className="w-3 h-3" />
                      <span>Mặc định</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={isUploadingActionSfx}
                    onClick={() => {
                      setTargetActionSfxId(slot.id);
                      actionSfxInputRef.current?.click();
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                    title="Upload file âm thanh"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload</span>
                  </button>

                  {customTrack && (
                    <button
                      type="button"
                      onClick={() => handleDeleteActionSfx(slot.id, slot.label)}
                      className="px-2 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      title="Xóa file tùy chỉnh và khôi phục 8-Bit mặc định"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Xóa</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
