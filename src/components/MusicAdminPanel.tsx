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
  Download,
  FolderGit2,
  Rocket,
  XCircle,
} from 'lucide-react';
import {
  MusicManager,
  PIXABAY_TARGET_TRACK_SPEC,
  STAGED_LOCAL_PREVIEW_BGM_ID,
  buildGitHubPagesAudioUrl,
  type MusicTrackMetadata,
  type LoopPlaybackConfig,
  type MusicScopeAssignments,
  type SystemAudioConfigDocument,
  type StagedAudioPackage,
  type SoundCatalogEntry,
  type UserRole,
  type GameModeScope,
} from '../core/musicManager.ts';
import { ADMIN_EMAIL } from '../core/authManager.ts';
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
  const [sharedConfig, setSharedConfig] = useState<SystemAudioConfigDocument | null>(() =>
    musicManager.getSharedAudioConfig()
  );
  const [stagedPkg, setStagedPkg] = useState<StagedAudioPackage | null>(() =>
    musicManager.getStagedAudioPackage()
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
  const [selectedStageForAssign, setSelectedStageForAssign] = useState<number>(1);
  const [manualFileName, setManualFileName] = useState<string>('');
  const [manualDisplayName, setManualDisplayName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directUploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const actionSfxInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
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
      setSharedConfig(musicManager.getSharedAudioConfig());
      setStagedPkg(musicManager.getStagedAudioPackage());
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
  }, [musicManager, soundManager]);

  const isAdmin = role === 'ADMIN';

  if (!isAdmin) {
    return null;
  }

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

  const handleDirectUploadAndActivate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusMsg(null);
    musicManager.clearSharedSyncError();
    soundManager.unlock();
    const res = await musicManager.uploadTrack(file, manualDisplayName.trim() || undefined);
    if (res.success && res.catalogEntry) {
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'success',
        text: `Đã tải lên "${res.catalogEntry.displayName}" (v${res.catalogEntry.version}) và kích hoạt thành công trên /system_config/audio! Tất cả người chơi đang trực tuyến đã nhận được bản nhạc mới.`,
      });
    } else if (res.success && res.stagedPackage) {
      setManualFileName(res.stagedPackage.normalizedFileName);
      setManualDisplayName(res.stagedPackage.displayName);
      setStatusMsg({
        type: 'info',
        text: `Đã kiểm tra file "${res.stagedPackage.originalFileName}". Bạn có thể bấm Kích hoạt ngay trong Danh mục Âm thanh bên dưới.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể tải lên và kích hoạt file âm thanh.',
      });
    }
  };

  const handleActivateCatalogEntry = async (entry: SoundCatalogEntry) => {
    setStatusMsg(null);
    soundManager.unlock();
    const res = await musicManager.activateCatalogSound(entry.soundId);
    if (res.success && res.config) {
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'success',
        text: `Đã kích hoạt "${entry.displayName}" (v${res.config.version}) làm nhạc nền hệ thống. Tất cả người chơi sẽ tự động đồng bộ!`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể kích hoạt bản nhạc này.',
      });
    }
  };

  const handleDeleteCatalogEntry = async (entry: SoundCatalogEntry) => {
    setStatusMsg(null);
    const res = await musicManager.deleteCatalogSound(entry.soundId);
    if (res.success) {
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'info',
        text: `Đã xóa "${entry.displayName}" khỏi Danh mục Âm thanh.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'Không thể xóa bản nhạc khỏi danh mục.',
      });
    }
  };

  const handleSelectAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await musicManager.stageAudioFileForGitHubPages(file);
    if (res.success && res.stagedPackage) {
      setManualFileName(res.stagedPackage.normalizedFileName);
      setManualDisplayName(res.stagedPackage.displayName);
      setStatusMsg({
        type: 'info',
        text: `Đã kiểm tra hợp lệ file "${res.stagedPackage.originalFileName}" (${res.stagedPackage.detectedFormat}, ${(res.stagedPackage.fileSize / (1024 * 1024)).toFixed(2)} MB). Bạn có thể bấm "Nghe thử" hoặc "Kích Hoạt Ngay" bên dưới.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text: res.error || 'File nhạc không hợp lệ.',
      });
    }

    e.target.value = '';
  };

  const handleDownloadStagedFile = () => {
    const downloadInfo = musicManager.getStagedAudioDownloadBlob();
    if (!downloadInfo) {
      setStatusMsg({
        type: 'error',
        text: 'Không tìm thấy gói file nhạc đã chuẩn bị để tải xuống.',
      });
      return;
    }
    const url = URL.createObjectURL(downloadInfo.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadInfo.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const handleVerifyAndActivateStaged = async () => {
    setStatusMsg(null);
    soundManager.unlock();
    const res = await musicManager.verifyAndActivateStagedAudioOnGitHubPages();
    if (res.success && res.config) {
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'success',
        text: `Đã kích hoạt "${res.config.displayName || res.config.fileName}" (v${res.config.version}) trên Firestore (/system_config/audio) thành công! Toàn bộ người chơi sẽ tự động tải và phát phiên bản v${res.config.version}.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text:
          res.error ||
          'Chưa thể kích hoạt file âm thanh.',
      });
    }
  };

  const handleVerifyAndActivateManualAsset = async () => {
    const cleanFile = manualFileName.trim();
    if (!cleanFile) {
      setStatusMsg({
        type: 'error',
        text: 'Vui lòng nhập tên file đã đặt trong thư mục public/audio/ (ví dụ: bgm_v1_bantank.mp3).',
      });
      return;
    }
    setStatusMsg(null);
    const res = await musicManager.verifyAndActivateGitHubPagesAsset({
      fileName: cleanFile,
      displayName: manualDisplayName.trim() || undefined,
    });
    if (res.success && res.config) {
      setStatusMsg({
        type: 'success',
        text: `Đã xác minh file ./${res.config.assetPath}?v=${res.config.version} và cập nhật /system_config/audio thành công!`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text:
          res.error ||
          `Không tìm thấy hoặc không thể giải mã file public/audio/${cleanFile}.`,
      });
    }
  };

  const handleToggleSharedEnabled = async () => {
    if (!sharedConfig) return;
    const nextState = !sharedConfig.isEnabled;
    const res = await musicManager.setSharedSystemAudioEnabled(nextState);
    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: nextState
          ? 'Đã BẬT nhạc nền chung toàn hệ thống (/system_config/audio).'
          : 'Đã TẮT nhạc nền chung toàn hệ thống.',
      });
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Không thể cập nhật trạng thái nhạc nền chung.' });
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingTrackId) return;

    const res = await musicManager.replaceTrackFile(replacingTrackId, file);
    if (res.success) {
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'success',
        text: `Đã cập nhật và kích hoạt phiên bản mới cho "${res.track?.displayName}".`,
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
      setSoundCatalog(musicManager.getSoundCatalog());
      setStatusMsg({
        type: 'success',
        text: `Đã gỡ cấu hình bài "${track.displayName}".`,
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
      {/* Top Banner & Role Indicator */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Music className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              Quản Lý Âm Thanh &amp; Nhạc Nền Hệ Thống (Đồng Bộ Thời Gian Thực)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Firebase Storage + Firestore Realtime
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Tải lên &amp; kích hoạt nhạc nền (MP3, OGG, WAV, M4A tối đa 25 MB) • Đồng bộ tức thời tới toàn bộ người chơi qua <code className="text-amber-300 font-mono">/system_config/audio</code> và <code className="text-amber-300 font-mono">/sound_catalog</code>
          </p>
        </div>
      </div>

      {/* Status Alert */}
      {(statusMsg || sharedSyncError || actionSfxError) && (
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-[11px] ${
            sharedSyncError || actionSfxError || statusMsg?.type === 'error'
              ? 'bg-rose-950/70 border-rose-700/60 text-rose-200'
              : statusMsg?.type === 'info'
                ? 'bg-sky-950/70 border-sky-700/60 text-sky-200'
                : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {sharedSyncError || actionSfxError || statusMsg?.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="break-words">{sharedSyncError || actionSfxError || statusMsg?.text}</span>
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

      {/* Shared System Audio Status Card */}
      <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <FileAudio className="w-3.5 h-3.5" />
            <span>
              Cấu hình Nhạc Nền Chung Đang Kích Hoạt (/system_config/audio):{' '}
              {isCloudSyncing
                ? 'Đang kiểm tra & đồng bộ...'
                : sharedConfig
                  ? `${sharedConfig.displayName || sharedConfig.fileName} (v${sharedConfig.version})`
                  : 'Chưa cấu hình nhạc nền Admin'}
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            {sharedConfig ? (
              <>
                Nguồn phát:{' '}
                <strong className="text-neutral-200 font-mono">
                  {sharedConfig.storagePath || buildGitHubPagesAudioUrl(sharedConfig.assetPath, sharedConfig.version)}
                </strong>{' '}
                ({formatBytes(sharedConfig.fileSize)}) • Cập nhật bởi:{' '}
                <strong className="text-emerald-400">{sharedConfig.updatedBy}</strong> • Lúc:{' '}
                <strong className="text-neutral-300 font-mono">
                  {new Date(sharedConfig.updatedAt).toLocaleString('vi-VN')}
                </strong>{' '}
                • Trạng thái:{' '}
                <strong className={sharedConfig.isEnabled ? 'text-emerald-400' : 'text-amber-400'}>
                  {sharedConfig.isEnabled ? 'ĐANG SỬ DỤNG (ĐỒNG BỘ TẤT CẢ NGƯỜI CHƠI)' : 'KHÔNG KÍCH HOẠT'}
                </strong>
              </>
            ) : (
              <>
                Chưa kích hoạt file nhạc hệ thống • Tải lên file âm thanh bên dưới để kích hoạt và đồng bộ cho toàn bộ người chơi.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {sharedConfig && isAdmin && (
            <button
              type="button"
              onClick={() => void handleToggleSharedEnabled()}
              className={`px-2.5 py-1 rounded text-[10px] font-extrabold border transition-all cursor-pointer ${
                sharedConfig.isEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-neutral-900 border-neutral-700 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {sharedConfig.isEnabled ? 'Tạm Tắt Nhạc Chung' : 'Bật Nhạc Chung'}
            </button>
          )}
          <div className="text-[10px] font-mono px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-300">
            Đang phát Stage 1:{' '}
            <strong className="text-emerald-400">
              {effectiveStage1.track ? effectiveStage1.track.displayName : 'Chưa phát (Chờ nhạc Admin)'}
            </strong>{' '}
            ({effectiveStage1.resolvedScope})
          </div>
        </div>
      </div>

      {/* SECTION 1: UPLOAD, ACTIVATE & MANAGE SYSTEM SOUND CATALOG */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <FolderGit2 className="w-4 h-4 text-amber-400" />
            <span>
              1. Tải Lên &amp; Kích Hoạt Nhạc Nền Hệ Thống (/sound_catalog &amp; /system_config/audio)
            </span>
          </div>

          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={directUploadInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm"
                onChange={handleDirectUploadAndActivate}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm"
                onChange={handleSelectAudioFile}
                className="hidden"
              />
              <input
                ref={replaceInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,.m4a,.aac,.webm,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm"
                onChange={handleReplaceFile}
                className="hidden"
              />
              <button
                type="button"
                disabled={isCloudSyncing}
                onClick={() => directUploadInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow active:scale-95 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isCloudSyncing ? 'Đang tải lên & đồng bộ...' : 'Tải Lên & Kích Hoạt Ngay (MP3 / OGG / WAV ≤ 25 MB)'}</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-xs transition-all cursor-pointer"
              >
                <FileAudio className="w-3.5 h-3.5" />
                <span>Kiểm Tra &amp; Nghe Thử Trước</span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Chỉ Admin được quản lý nhạc nền
            </span>
          )}
        </div>

        {/* Sound Catalog Entries List (with Active/Inactive Status, Version, Timestamp & One-Click Activate) */}
        {soundCatalog.length > 0 && (
          <div className="p-3 rounded-xl bg-neutral-900/90 border border-emerald-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-emerald-300 text-xs">
                Danh Mục Âm Thanh Hệ Thống Đã Tải Lên ({soundCatalog.length})
              </span>
              <span className="text-[10px] font-mono text-neutral-400">
                Chọn &quot;Kích hoạt&quot; để phát đồng bộ cho toàn bộ người chơi
              </span>
            </div>
            <div className="space-y-2">
              {soundCatalog.map((entry) => {
                const isCurrentlyActive =
                  Boolean(
                    sharedConfig?.isEnabled &&
                      (sharedConfig.soundId === entry.soundId ||
                        sharedConfig.storagePath === entry.storagePath ||
                        sharedConfig.assetPath === entry.storagePath)
                  ) || entry.isActive;

                return (
                  <div
                    key={entry.soundId}
                    className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                      isCurrentlyActive
                        ? 'bg-emerald-950/30 border-emerald-500/60'
                        : 'bg-neutral-950/80 border-neutral-800'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-white text-xs">{entry.displayName}</span>
                        <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono text-[10px] font-bold">
                          v{entry.version}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            isCurrentlyActive
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          }`}
                        >
                          {isCurrentlyActive ? 'Đang sử dụng' : 'Không kích hoạt'}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-400 flex flex-wrap items-center gap-2">
                        <span>File: {entry.fileName}</span>
                        <span>•</span>
                        <span>{formatBytes(entry.fileSize)}</span>
                        <span>•</span>
                        <span>Cập nhật: {new Date(entry.updatedAt).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isCloudSyncing || isCurrentlyActive}
                        onClick={() => void handleActivateCatalogEntry(entry)}
                        className={`px-2.5 py-1 rounded text-[11px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                          isCurrentlyActive
                            ? 'bg-emerald-500 text-black opacity-90 cursor-default'
                            : 'bg-amber-500 hover:bg-amber-400 text-black shadow'
                        }`}
                      >
                        <Rocket className="w-3 h-3" />
                        <span>{isCurrentlyActive ? 'Đang kích hoạt' : 'Kích hoạt'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isCloudSyncing}
                        onClick={() => void handleDeleteCatalogEntry(entry)}
                        className="p-1.5 rounded bg-neutral-800 hover:bg-rose-900/60 text-rose-400 cursor-pointer"
                        title="Xóa khỏi danh mục"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Staged Audio Package Card (when Admin selects a local file) */}
        {stagedPkg && (
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-extrabold text-[10px]">
                  GÓI NHẠC ĐÃ KIỂM TRA (SẴN SÀNG KÍCH HOẠT)
                </span>
                <span className="font-extrabold text-white text-xs">
                  {stagedPkg.displayName} (Phiên bản dự kiến: v{stagedPkg.targetVersion})
                </span>
              </div>
              <button
                type="button"
                onClick={() => musicManager.clearStagedAudioPackage()}
                className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-rose-400"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Hủy gói nháp</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono bg-neutral-950/90 p-2.5 rounded-lg border border-neutral-800">
              <div>
                <span className="text-neutral-400">Tên file gốc:</span>{' '}
                <strong className="text-neutral-200">{stagedPkg.originalFileName}</strong>
              </div>
              <div>
                <span className="text-neutral-400">Định dạng & Dung lượng:</span>{' '}
                <strong className="text-emerald-400">
                  {stagedPkg.detectedFormat} • {formatBytes(stagedPkg.fileSize)} • {formatDuration(stagedPkg.durationSec)}
                </strong>
              </div>
              <div>
                <span className="text-neutral-400">Đường dẫn mã nguồn (GitHub):</span>{' '}
                <strong className="text-amber-300">{stagedPkg.repositoryPath}</strong>
              </div>
              <div>
                <span className="text-neutral-400">Đường dẫn sau khi build:</span>{' '}
                <strong className="text-sky-300">{stagedPkg.distPath}</strong>
              </div>
              <div className="sm:col-span-2">
                <span className="text-neutral-400">URL phát hành:</span>{' '}
                <strong className="text-emerald-300">{stagedPkg.runtimeUrl}</strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  previewId === STAGED_LOCAL_PREVIEW_BGM_ID
                    ? musicManager.stopPreview()
                    : musicManager.previewTrack(STAGED_LOCAL_PREVIEW_BGM_ID)
                }
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  previewId === STAGED_LOCAL_PREVIEW_BGM_ID
                    ? 'bg-amber-500 text-black'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                }`}
              >
                {previewId === STAGED_LOCAL_PREVIEW_BGM_ID ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-black" />
                    <span>Dừng nghe thử</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Nghe thử bản nháp</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadStagedFile}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-extrabold text-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải File Chuẩn Hóa ({stagedPkg.normalizedFileName})</span>
              </button>

              <button
                type="button"
                disabled={isCloudSyncing}
                onClick={() => void handleVerifyAndActivateStaged()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-xs shadow transition-all cursor-pointer"
              >
                <Rocket className="w-3.5 h-3.5" />
                <span>
                  {isCloudSyncing
                    ? 'Đang kích hoạt & đồng bộ...'
                    : `Kích Hoạt & Đồng Bộ Toàn Hệ Thống (v${stagedPkg.targetVersion})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Direct Activation of Existing File in public/audio/ */}
        <div className="p-3 rounded-lg bg-neutral-900/70 border border-neutral-800 space-y-2">
          <div className="font-bold text-neutral-200 text-[11px]">
            Hoặc kích hoạt trực tiếp file nhạc tĩnh trong <code className="text-amber-300 font-mono">public/audio/</code>:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={manualFileName}
              onChange={(e) => setManualFileName(e.target.value)}
              placeholder="Tên file trong public/audio/ (vd: bgm_v1_bantank.mp3)"
              className="px-2.5 py-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs font-mono"
            />
            <input
              type="text"
              value={manualDisplayName}
              onChange={(e) => setManualDisplayName(e.target.value)}
              placeholder="Tên hiển thị bài nhạc (tùy chọn)"
              className="px-2.5 py-1.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            />
            <button
              type="button"
              disabled={isCloudSyncing}
              onClick={() => void handleVerifyAndActivateManualAsset()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-extrabold text-xs transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Kiểm Tra ./audio/&lt;file&gt; &amp; Kích Hoạt</span>
            </button>
          </div>
        </div>

        {/* Active Library List */}
        {tracks.length === 0 ? (
          <div className="p-4 rounded-lg bg-neutral-900/60 border border-neutral-800/80 text-center text-neutral-400 space-y-1">
            <p className="font-semibold text-neutral-300">Chưa có file nhạc nền tùy chỉnh nào trong thư viện.</p>
            <p className="text-[11px]">
              Nhấn <strong>&quot;Tải Lên &amp; Kích Hoạt Ngay&quot;</strong> để tải file MP3/OGG/WAV lên hệ thống và phát đồng bộ cho toàn bộ người chơi.
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

                    {isAdmin && (
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
                          title="Gỡ bài nhạc"
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
        
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => musicManager.updateLoopConfig({ loop: !loopConfig.loop })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
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
            onClick={() => musicManager.updateLoopConfig({ skipSilence: !loopConfig.skipSilence })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.skipSilence
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Skip Silence</span>
              <span>{loopConfig.skipSilence ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Bỏ qua khoảng lặng thực sự (&lt; -48dB)</p>
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => musicManager.updateLoopConfig({ seamlessLoop: !loopConfig.seamlessLoop })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.seamlessLoop
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <div className="font-extrabold text-xs flex items-center justify-between">
              <span>Seamless Loop</span>
              <span>{loopConfig.seamlessLoop ? 'BẬT' : 'TẮT'}</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-0.5">Chu kỳ lặp liền mạch không ngắt quãng</p>
          </button>

          <button
            type="button"
            disabled={!isAdmin}
            onClick={() => musicManager.updateLoopConfig({ crossfade: !loopConfig.crossfade })}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              loopConfig.crossfade
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
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
            disabled={!isAdmin || !loopConfig.crossfade}
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

          {isAdmin && (
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
              disabled={!isAdmin}
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
              disabled={!isAdmin}
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
                  {(managedStages.length > 0
                    ? managedStages.map((s) => s.id)
                    : [1, 2, 3]
                  ).map((sid) => (
                    <option key={sid} value={sid}>
                      Stage {sid}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-[10px] text-amber-400 font-mono font-bold">Ưu tiên #1 (Cao nhất)</span>
            </div>
            <select
              disabled={!isAdmin}
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

      {/* SECTION 5 (M7.3.10 Section 4): QUẢN LÝ & UPLOAD ÂM THANH HÀNH ĐỘNG (ACTION SFX) */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <FileAudio className="w-4 h-4 text-amber-400" />
            <span>Quản Lý &amp; Upload Âm Thanh Hành Động (Action SFX)</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono text-[10px] font-bold">
            ADMIN ONLY
          </span>
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
                      title="Tạm tắt file tùy chỉnh (quay về 8-Bit mặc định)"
                    >
                      <Square className="w-3 h-3" />
                      <span>Tạm tắt</span>
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
                    title={customTrack ? 'Thay thế file âm thanh' : 'Tải lên file âm thanh'}
                  >
                    <Upload className="w-3 h-3" />
                    <span>{customTrack ? 'Thay thế' : 'Upload'}</span>
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
