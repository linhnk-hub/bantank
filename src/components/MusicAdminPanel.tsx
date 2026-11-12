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
  type UserRole,
  type GameModeScope,
} from '../core/musicManager.ts';
import {
  SoundManager,
  GAME_ACTION_SOUND_SLOTS,
  type GameActionSoundId,
  type CustomActionSoundTrack,
} from '../core/audio.ts';

export const MusicAdminPanel: React.FC = () => {
  const musicManager = MusicManager.getInstance();
  const soundManager = SoundManager.getInstance();

  const [role, setRole] = useState<UserRole>(() => musicManager.getUserRole());
  const [tracks, setTracks] = useState<MusicTrackMetadata[]>(() => musicManager.getTracks());
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
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const actionSfxInputRef = useRef<HTMLInputElement | null>(null);
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
  const [targetActionSfxId, setTargetActionSfxId] = useState<GameActionSoundId | null>(null);
  const [actionSfxTracks, setActionSfxTracks] = useState<
    Record<GameActionSoundId, CustomActionSoundTrack | null>
  >(() => soundManager.getAllActionSoundTracks());
  const [isUploadingActionSfx, setIsUploadingActionSfx] = useState<boolean>(false);

  useEffect(() => {
    const unsubMusic = musicManager.subscribe(() => {
      setRole(musicManager.getUserRole());
      setTracks(musicManager.getTracks());
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
    });
    return () => {
      unsubMusic();
      unsubSound();
    };
  }, [musicManager, soundManager]);

  const isSuperAdmin = role === 'SUPER_ADMIN';

  if (!isSuperAdmin) {
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
      const res = await soundManager.uploadActionSound(actionId, file);
      if (res.ok && res.track) {
        setActionSfxTracks(soundManager.getAllActionSoundTracks());
        setStatusMsg({
          type: 'success',
          text: `Đã cập nhật âm thanh hành động [${actionId}] bằng file "${res.track.fileName}" (${res.track.durationSec}s).`,
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

  const handleSelectAudioFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const res = await musicManager.stageAudioFileForGitHubPages(file);
    if (res.success && res.stagedPackage) {
      setManualFileName(res.stagedPackage.normalizedFileName);
      setManualDisplayName(res.stagedPackage.displayName);
      setStatusMsg({
        type: 'info',
        text: `Đã kiểm tra hợp lệ file "${res.stagedPackage.originalFileName}" (${res.stagedPackage.detectedFormat}, ${(res.stagedPackage.fileSize / (1024 * 1024)).toFixed(2)} MB). Bạn có thể bấm "Nghe thử" ngay bên dưới, tải file chuẩn hóa "${res.stagedPackage.normalizedFileName}" đặt vào thư mục public/audio/, push lên GitHub nhánh main rồi bấm "Xác Minh & Kích Hoạt Trên GitHub Pages".`,
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
    const res = await musicManager.verifyAndActivateStagedAudioOnGitHubPages();
    if (res.success && res.config) {
      setStatusMsg({
        type: 'success',
        text: `Đã xác minh file ./${res.config.assetPath}?v=${res.config.version} trên GitHub Pages và kích hoạt cấu hình chung Firestore (/system_config/audio) thành công! Toàn bộ người chơi sẽ tải và phát phiên bản v${res.config.version}.`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text:
          res.error ||
          'Chưa thể kích hoạt: File chưa có mặt trong public/audio/ trên GitHub Pages.',
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
        text: `Đã xác minh file ./${res.config.assetPath}?v=${res.config.version} trên GitHub Pages và cập nhật /system_config/audio thành công!`,
      });
    } else {
      setStatusMsg({
        type: 'error',
        text:
          res.error ||
          `Không tìm thấy hoặc không thể giải mã file public/audio/${cleanFile} trên GitHub Pages.`,
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
          : 'Đã TẮT nhạc nền chung, toàn hệ thống chuyển về nhạc 8-bit mặc định.',
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
      setStatusMsg({
        type: 'info',
        text: `Đã chuẩn bị file mới cho "${res.track?.displayName}". Hãy đặt file vào public/audio/ và xác minh trên GitHub Pages để kích hoạt.`,
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
        text: `Đã gỡ cấu hình bài "${track.displayName}" và khôi phục về nhạc nền 8-bit mặc định.`,
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
          <div className="flex items-center gap-2 flex-wrap">
            <Music className="w-4 h-4 text-amber-400" />
            <h3 className="font-extrabold text-sm text-white">
              Quản Lý Nhạc Nền Dùng Chung (GitHub Pages Static Audio + Firestore)
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              100% Firebase Spark (Không dùng Storage)
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            Lưu file trực tiếp trong <code className="text-amber-300 font-mono">public/audio/</code> (MP3, OGG, WAV tối đa 25 MB) • Phân phối qua GitHub Pages • Đồng bộ cấu hình qua <code className="text-amber-300 font-mono">/system_config/audio</code>
          </p>
        </div>

        {/* Role Indicator (Server-enforced in M7) */}
        <div className="flex items-center gap-1.5 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 shrink-0 text-[10px] font-bold">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-neutral-300">Vai trò:</span>
          <span className={isSuperAdmin ? 'text-amber-400 font-extrabold' : 'text-sky-400'}>
            {isSuperAdmin ? 'Super Admin (linhnk.online@gmail.com)' : 'Người chơi'}
          </span>
        </div>
      </div>

      {/* Status Alert */}
      {(statusMsg || sharedSyncError) && (
        <div
          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-[11px] ${
            sharedSyncError || statusMsg?.type === 'error'
              ? 'bg-rose-950/70 border-rose-700/60 text-rose-200'
              : statusMsg?.type === 'info'
                ? 'bg-sky-950/70 border-sky-700/60 text-sky-200'
                : 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {sharedSyncError || statusMsg?.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{sharedSyncError || statusMsg?.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-[10px] underline opacity-75 hover:opacity-100 shrink-0"
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
                  : 'Chưa cấu hình nhạc nền Super Admin'}
            </span>
          </div>
          <p className="text-[11px] text-neutral-400">
            {sharedConfig ? (
              <>
                Đường dẫn tĩnh:{' '}
                <strong className="text-neutral-200 font-mono">
                  {buildGitHubPagesAudioUrl(sharedConfig.assetPath, sharedConfig.version)}
                </strong>{' '}
                ({formatBytes(sharedConfig.fileSize)}) • Cập nhật bởi:{' '}
                <strong className="text-emerald-400">{sharedConfig.updatedBy}</strong> • Trạng thái:{' '}
                <strong className={sharedConfig.isEnabled ? 'text-emerald-400' : 'text-amber-400'}>
                  {sharedConfig.isEnabled ? 'ĐANG BẬT CHO TẤT CẢ NGƯỜI CHƠI' : 'ĐANG TẮT NHẠC NỀN CHUNG'}
                </strong>
              </>
            ) : (
              <>
                Chưa kích hoạt file nhạc tĩnh trong <code className="font-mono">public/audio/</code> • Hệ thống chỉ phát nhạc nền do Super Admin tải lên.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {sharedConfig && isSuperAdmin && (
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
              {effectiveStage1.track ? effectiveStage1.track.displayName : 'Chưa phát (Chờ nhạc Super Admin)'}
            </strong>{' '}
            ({effectiveStage1.resolvedScope})
          </div>
        </div>
      </div>

      {/* SECTION 1: 2-STEP GITHUB PAGES STATIC AUDIO WORKFLOW */}
      <div className="p-3.5 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-neutral-200">
            <FolderGit2 className="w-4 h-4 text-amber-400" />
            <span>
              1. Quy Trình Cập Nhật File Nhạc Tĩnh Trên GitHub Pages (public/audio/)
            </span>
          </div>

          {isSuperAdmin ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
                onChange={handleSelectAudioFile}
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow active:scale-95 transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Bước 1: Chọn File Nhạc Để Kiểm Tra & Nghe Thử (MP3 / OGG / WAV ≤ 25 MB)</span>
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-rose-400 font-semibold flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Chỉ Super Admin được quản lý nhạc nền
            </span>
          )}
        </div>

        {/* Staged Audio Package Card (when Super Admin selects a local file) */}
        {stagedPkg && (
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-extrabold text-[10px]">
                  GÓI NHẠC ĐÃ KIỂM TRA (CHỜ ĐƯA VÀO PUBLIC/AUDIO/)
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
                <span className="text-neutral-400">URL phát hành GitHub Pages (có cache-busting):</span>{' '}
                <strong className="text-emerald-300">{stagedPkg.runtimeUrl}</strong>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 space-y-1.5 text-[11px] text-neutral-300">
              <div className="font-bold text-amber-300">
                Chỉ dẫn chuẩn đưa file lên GitHub Pages (https://github.com/linhnk-hub/bantank - nhánh main):
              </div>
              <ol className="list-decimal list-inside space-y-1 text-neutral-300">
                <li>
                  Bấm <strong>"Nghe thử bản nháp"</strong> để kiểm tra âm lượng và vòng lặp, sau đó bấm{' '}
                  <strong>"Tải File Chuẩn Hóa ({stagedPkg.normalizedFileName})"</strong>.
                </li>
                <li>
                  Đặt file vừa tải vào đúng thư mục{' '}
                  <code className="px-1.5 py-0.5 rounded bg-neutral-950 text-amber-300 font-mono">
                    {stagedPkg.repositoryPath}
                  </code>{' '}
                  trong kho mã nguồn, sau đó commit &amp; push lên nhánh <code className="font-mono text-white">main</code>.
                </li>
                <li>
                  Sau khi GitHub Pages phát hành xong, bấm nút{' '}
                  <strong>"Bước 2: Xác Minh File Trên GitHub Pages &amp; Kích Hoạt"</strong> bên dưới để hệ thống kiểm tra file thực tế và cập nhật{' '}
                  <code className="font-mono text-amber-300">/system_config/audio</code> trên Firestore.
                </li>
              </ol>
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
                    ? 'Đang kiểm tra trên GitHub Pages...'
                    : `Bước 2: Xác Minh File Trên GitHub Pages & Kích Hoạt (v${stagedPkg.targetVersion})`}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Direct Activation of Existing File in public/audio/ */}
        <div className="p-3 rounded-lg bg-neutral-900/70 border border-neutral-800 space-y-2">
          <div className="font-bold text-neutral-200 text-[11px]">
            Hoặc kích hoạt trực tiếp file nhạc đã có sẵn trong <code className="text-amber-300 font-mono">public/audio/</code> trên GitHub Pages:
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
              Game hiện đang sử dụng nhạc nền 8-bit tích hợp mặc định. Nhấn <strong>"Bước 1: Chọn File Nhạc Để Kiểm Tra &amp; Nghe Thử"</strong> để chuẩn bị file MP3/OGG/WAV (hỗ trợ cả file &gt; 4 MB, tối đa 25 MB).
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

      {/* SECTION 5 (M7.3.10 Section 4): QUẢN LÝ & UPLOAD ÂM THANH HÀNH ĐỘNG (ACTION SFX) */}
      <div className="p-3.5 rounded-xl bg-neutral-950 border border-amber-500/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <FileAudio className="w-4 h-4 text-amber-400" />
            <span>Quản Lý &amp; Upload Âm Thanh Hành Động (Action SFX)</span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
            SUPER ADMIN ONLY
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
            return (
              <div
                key={slot.id}
                data-testid={`admin-action-sfx-row-${slot.id}`}
                className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                  customTrack
                    ? 'bg-amber-950/20 border-amber-500/50'
                    : 'bg-neutral-900/90 border-neutral-800'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-neutral-100 text-xs">{slot.label}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                        customTrack
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}
                    >
                      {customTrack ? 'FILE TÙY CHỈNH' : '8-BIT MẶC ĐỊNH'}
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
                      soundManager.previewActionSound(slot.id);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-300 border border-neutral-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title={`Nghe thử âm thanh ${slot.label}`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Nghe thử</span>
                  </button>

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
