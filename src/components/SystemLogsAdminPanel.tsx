/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * M7.5.1 – PHẦN 4 & PHẦN 5: ADMIN "LOG HỆ THỐNG" PANEL
 * - Strictly accessible ONLY to sole ADMIN (`linhnk2013@gmail.com`).
 * - Sub-tabs:
 *   1. Log hệ thống (14 daily categories, severity/category/date/search filters, pagination, sanitized detail modal)
 *   2. Lịch sử người chơi (per-UID activity timeline & quick UID selector)
 *   3. Lưu trữ & Dọn dẹp (Permanent Audit vs Temporary Operational Logs, 9-step idempotent archive-verify-cleanup sweep, archive restore viewer)
 * - Full-pagination BACKUP DỮ LIỆU LOG (`JSON` & `CSV`) with byte/parse integrity verification.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  X,
} from 'lucide-react';
import {
  ALL_SYSTEM_LOG_CATEGORIES,
  SystemAuditLogger,
  type ArchiveBatchRecord,
  type ArchiveManifestRecord,
  type BackupExportFormat,
  type BackupExportScope,
  type SystemAuditLogEntry,
  type SystemLogCategory,
  type SystemLogSeverity,
  type TemporaryOperationalLogBuffer,
} from '../core/systemAuditLogger.ts';
import type { AuthIdentityLike } from '../core/authManager.ts';

export interface SystemLogsAdminPanelProps {
  user?: AuthIdentityLike | null;
}

type AdminLogSubTab = 'SYSTEM_LOGS' | 'PLAYER_HISTORY' | 'ARCHIVE_CLEANUP';

const PAGE_SIZE = 15;

export const SystemLogsAdminPanel: React.FC<SystemLogsAdminPanelProps> = ({ user }) => {
  const logger = SystemAuditLogger.getInstance();
  const hasAdminAccess = logger.canAccessSystemLogs(user);

  const [subTab, setSubTab] = useState<AdminLogSubTab>('SYSTEM_LOGS');
  const [tick, setTick] = useState<number>(0);

  // Filter states
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<SystemLogSeverity | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<SystemLogCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedPlayerUid, setSelectedPlayerUid] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Detail & Archive Restore modal states
  const [selectedEntry, setSelectedEntry] = useState<SystemAuditLogEntry | null>(null);
  const [restoredArchiveView, setRestoredArchiveView] = useState<{
    batch: ArchiveBatchRecord;
    manifest: ArchiveManifestRecord;
  } | null>(null);

  // Archive & Sweep states
  const [verifiedManifests, setVerifiedManifests] = useState<ArchiveManifestRecord[]>([]);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [isSyncingCloudAudit, setIsSyncingCloudAudit] = useState<boolean>(false);

  // Backup states
  const [backupFormat, setBackupFormat] = useState<BackupExportFormat>('JSON');
  const [backupScope, setBackupScope] = useState<BackupExportScope>('DATE_RANGE');
  const [backupTargetUid, setBackupTargetUid] = useState<string>('');
  const [isExportingBackup, setIsExportingBackup] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    const unsub = logger.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsub;
  }, [logger]);

  useEffect(() => {
    if (!hasAdminAccess) return;
    let cancelled = false;
    void logger.listVerifiedArchivesForAdmin(user).then((res) => {
      if (!cancelled && res.success) {
        setVerifiedManifests(res.manifests);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hasAdminAccess, logger, user, tick]);

  useEffect(() => {
    if (!hasAdminAccess) return;
    setIsSyncingCloudAudit(true);
    void logger
      .syncFirestoreRoleAuditLogsForAdmin(user)
      .finally(() => setIsSyncingCloudAudit(false));
  }, [hasAdminAccess, logger, user]);

  // Reset pagination to page 1 when filters or sub-tab change
  useEffect(() => {
    setPage(1);
  }, [subTab, startDate, endDate, severityFilter, categoryFilter, searchQuery, selectedPlayerUid]);

  const operationalBuffers = useMemo<TemporaryOperationalLogBuffer[]>(() => {
    if (!hasAdminAccess) return [];
    const res = logger.getOperationalBuffersForAdmin(user);
    return res.success ? res.buffers : [];
  }, [hasAdminAccess, logger, user, tick]);

  const loggedPlayers = useMemo(() => {
    if (!hasAdminAccess) return [];
    return logger.getUniqueLoggedPlayersForAdmin(user);
  }, [hasAdminAccess, logger, user, tick]);

  const queryResult = useMemo(() => {
    if (!hasAdminAccess) {
      return {
        success: false,
        items: [] as SystemAuditLogEntry[],
        totalItems: 0,
        totalPages: 1,
        currentPage: 1,
        pageSize: PAGE_SIZE,
        criticalCount: 0,
        errorCount: 0,
      };
    }
    if (subTab === 'PLAYER_HISTORY') {
      return logger.queryPlayerActivityHistory(
        {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          severity: severityFilter,
          category: categoryFilter,
          searchQuery: searchQuery || undefined,
          uid: selectedPlayerUid || undefined,
          page,
          pageSize: PAGE_SIZE,
        },
        user
      );
    }
    return logger.querySystemLogs(
      {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        severity: severityFilter,
        category: categoryFilter,
        searchQuery: searchQuery || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
      user
    );
  }, [
    hasAdminAccess,
    subTab,
    startDate,
    endDate,
    severityFilter,
    categoryFilter,
    searchQuery,
    selectedPlayerUid,
    page,
    logger,
    user,
    tick,
  ]);

  const globalCriticalSummary = useMemo(() => {
    if (!hasAdminAccess) return { criticalCount: 0, stuckArchiveBuffers: 0 };
    const allRes = logger.querySystemLogs({ page: 1, pageSize: 1 }, user);
    const stuckArchiveBuffers = operationalBuffers.filter(
      (b) => b.status === 'ARCHIVE_PENDING' && b.retryCount > 0
    ).length;
    return {
      criticalCount: allRes.criticalCount,
      stuckArchiveBuffers,
    };
  }, [hasAdminAccess, logger, operationalBuffers, user, tick]);

  if (!hasAdminAccess) {
    return (
      <div
        data-testid="system-logs-access-denied"
        className="p-5 rounded-xl bg-rose-950/80 border border-rose-700 text-rose-200 flex items-center gap-3 text-xs"
      >
        <Lock className="w-5 h-5 text-rose-400 shrink-0" />
        <div>
          <div className="font-extrabold uppercase">TỪ CHỐI TRUY CẬP LOG HỆ THỐNG</div>
          <p className="text-rose-200/80 mt-0.5">
            Chỉ tài khoản ADMIN duy nhất mới được phép xem, sao lưu hoặc quản lý nhật ký hệ thống.
          </p>
        </div>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const categoryLabelMap = new Map(ALL_SYSTEM_LOG_CATEGORIES.map((c) => [c.id, c.label]));

  const renderSeverityBadge = (sev: SystemLogSeverity) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-mono font-extrabold uppercase">
            CRITICAL
          </span>
        );
      case 'ERROR':
        return (
          <span className="px-2 py-0.5 rounded bg-rose-950/90 border border-rose-600/70 text-rose-300 text-[10px] font-mono font-bold uppercase">
            ERROR
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-600/70 text-amber-300 text-[10px] font-mono font-bold uppercase">
            WARN
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] font-mono font-bold uppercase">
            INFO
          </span>
        );
    }
  };

  const handleRunArchiveSweep = async () => {
    setFeedback(null);
    setIsSweeping(true);
    try {
      const res = await logger.sweepStaleArchivePendingLogs({ actorOverride: user });
      if (!res.success) {
        setFeedback({
          type: 'error',
          text: 'Không đủ quyền thực hiện quét lưu trữ log tạm.',
        });
      } else {
        setFeedback({
          type: res.retainedKeys.length > 0 ? 'error' : 'success',
          text:
            res.sweptCount === 0
              ? 'Không có vùng log tạm thời nào đã kết thúc hoặc bị kẹt ARCHIVE_PENDING.'
              : `Đã quét ${res.sweptCount} vùng log tạm: Lưu trữ & dọn thành công ${res.cleanedKeys.length}, giữ lại an toàn ${res.retainedKeys.length}.`,
        });
      }
      const manRes = await logger.listVerifiedArchivesForAdmin(user);
      if (manRes.success) setVerifiedManifests(manRes.manifests);
    } finally {
      setIsSweeping(false);
    }
  };

  const handleRestoreArchive = async (archiveId: string) => {
    setFeedback(null);
    const res = await logger.restoreArchiveBatch(archiveId, user);
    if (!res.success || !res.batch || !res.manifest) {
      setFeedback({
        type: 'error',
        text: res.errorMessage || 'Không thể khôi phục gói lưu trữ.',
      });
      return;
    }
    setRestoredArchiveView({ batch: res.batch, manifest: res.manifest });
  };

  const handleExportBackup = async () => {
    setFeedback(null);
    setIsExportingBackup(true);
    try {
      const res = await logger.exportBackupLogs(
        {
          format: backupFormat,
          scope: backupScope,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          targetUid: backupScope === 'SINGLE_PLAYER' ? backupTargetUid.trim() : undefined,
          triggerBrowserDownload: true,
        },
        user
      );
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `Đã sao lưu ${res.fileName} (${res.exportedLogCount ?? 0} log kiểm toán + ${
            res.archivedEventCount ?? 0
          } sự kiện lưu trữ • ${formatBytes(res.byteSize ?? 0)} • Checksum ${res.checksum}). Dữ liệu gốc được giữ nguyên.`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: res.errorMessage || 'Sao lưu dữ liệu log thất bại.',
        });
      }
    } finally {
      setIsExportingBackup(false);
    }
  };

  return (
    <section
      data-testid="system-logs-admin-panel"
      className="p-4 rounded-xl bg-neutral-950/90 border border-red-500/40 space-y-4 text-xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-2 font-extrabold text-red-300 uppercase tracking-wider">
          <Terminal className="w-4 h-4 text-red-400" />
          <span>LOG HỆ THỐNG • KIỂM TOÁN, SAO LƯU &amp; LƯU TRỮ</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] text-neutral-400">
          <span>Chỉ ADMIN duy nhất</span>
          <button
            type="button"
            disabled={isSyncingCloudAudit}
            onClick={() => {
              setIsSyncingCloudAudit(true);
              void logger
                .syncFirestoreRoleAuditLogsForAdmin(user)
                .finally(() => setIsSyncingCloudAudit(false));
            }}
            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingCloudAudit ? 'animate-spin' : ''}`} />
            <span>Đồng bộ Audit</span>
          </button>
        </div>
      </div>

      {/* Critical Error / Archive Failure Banner */}
      {(globalCriticalSummary.criticalCount > 0 ||
        globalCriticalSummary.stuckArchiveBuffers > 0) && (
        <div
          data-testid="system-logs-critical-banner"
          className="p-3 rounded-xl bg-rose-950/90 border-2 border-rose-500 text-rose-100 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <div className="font-extrabold text-xs uppercase text-rose-200">
                CẢNH BÁO NGHIÊM TRỌNG HỆ THỐNG ({globalCriticalSummary.criticalCount} CRITICAL •{' '}
                {globalCriticalSummary.stuckArchiveBuffers} log tạm chờ lưu trữ lại)
              </div>
              <p className="text-[11px] text-rose-200/90">
                Phát hiện sự kiện mức CRITICAL hoặc tiến trình lưu trữ log tạm thời chưa hoàn tất. Hệ thống đã giữ nguyên toàn bộ log tạm, tuyệt đối không xóa dữ liệu.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSubTab('SYSTEM_LOGS');
                setSeverityFilter('CRITICAL');
              }}
              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-[11px] cursor-pointer"
            >
              Lọc CRITICAL
            </button>
            {globalCriticalSummary.stuckArchiveBuffers > 0 && (
              <button
                type="button"
                disabled={isSweeping}
                onClick={() => void handleRunArchiveSweep()}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] cursor-pointer disabled:opacity-50"
              >
                Thử lưu trữ lại
              </button>
            )}
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-950/80 border-rose-700 text-rose-200'
              : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="break-words">{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-white px-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            data-testid="subtab-system-logs"
            onClick={() => setSubTab('SYSTEM_LOGS')}
            className={`px-3 py-1.5 rounded-lg font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subTab === 'SYSTEM_LOGS'
                ? 'bg-amber-500 text-black'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Log hệ thống</span>
          </button>
          <button
            type="button"
            data-testid="subtab-player-history"
            onClick={() => setSubTab('PLAYER_HISTORY')}
            className={`px-3 py-1.5 rounded-lg font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subTab === 'PLAYER_HISTORY'
                ? 'bg-amber-500 text-black'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lịch sử người chơi ({loggedPlayers.length})</span>
          </button>
          <button
            type="button"
            data-testid="subtab-archive-cleanup"
            onClick={() => setSubTab('ARCHIVE_CLEANUP')}
            className={`px-3 py-1.5 rounded-lg font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors ${
              subTab === 'ARCHIVE_CLEANUP'
                ? 'bg-amber-500 text-black'
                : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>
              Lưu trữ &amp; Dọn dẹp ({verifiedManifests.length} gói • {operationalBuffers.length} tạm)
            </span>
          </button>
        </div>

        <div className="font-mono text-[11px] text-neutral-400 tabular-nums">
          Tổng khớp lọc: <strong className="text-white">{queryResult.totalItems}</strong> • ERROR:{' '}
          <strong className="text-rose-300">{queryResult.errorCount}</strong> • CRITICAL:{' '}
          <strong className="text-rose-400">{queryResult.criticalCount}</strong>
        </div>
      </div>

      {/* BACKUP DỮ LIỆU LOG Toolbar (PHẦN 4.5) */}
      <div
        data-testid="backup-logs-panel"
        className="p-3 rounded-xl bg-neutral-900/90 border border-amber-500/30 space-y-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-extrabold text-amber-300 flex items-center gap-1.5 uppercase">
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>BACKUP DỮ LIỆU LOG (ĐẦY ĐỦ CÁC TRANG • KHÔNG XÓA LOG GỐC)</span>
          </div>
          <span className="text-[10px] font-mono text-neutral-400">
            Tự động ẩn Token / Secret / Password trước khi xuất
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div>
            <label className="block text-[10px] text-neutral-400 mb-1">Định dạng file</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setBackupFormat('JSON')}
                className={`py-1.5 px-2 rounded-lg border font-mono font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                  backupFormat === 'JSON'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>JSON</span>
              </button>
              <button
                type="button"
                onClick={() => setBackupFormat('CSV')}
                className={`py-1.5 px-2 rounded-lg border font-mono font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer ${
                  backupFormat === 'CSV'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                }`}
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[10px] text-neutral-400 mb-1">Phạm vi sao lưu</label>
            <select
              data-testid="backup-scope-select"
              value={backupScope}
              onChange={(e) => setBackupScope(e.target.value as BackupExportScope)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="DATE_RANGE">Toàn bộ Log hệ thống theo khoảng ngày đang lọc</option>
              <option value="ALL_PLAYERS_IN_RANGE">
                Toàn bộ người chơi trong khoảng ngày đang lọc
              </option>
              <option value="SINGLE_PLAYER">Theo 1 người chơi cụ thể (UID)</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              data-testid="backup-logs-download-btn"
              disabled={isExportingBackup}
              onClick={() => void handleExportBackup()}
              className="w-full py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingBackup ? 'Đang xuất...' : `Tải Backup (${backupFormat})`}</span>
            </button>
          </div>
        </div>

        {backupScope === 'SINGLE_PLAYER' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <input
              type="text"
              value={backupTargetUid}
              onChange={(e) => setBackupTargetUid(e.target.value)}
              placeholder="Nhập UID người chơi cần backup..."
              className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white font-mono text-xs"
            />
            <select
              value={backupTargetUid}
              onChange={(e) => setBackupTargetUid(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
            >
              <option value="">-- Chọn nhanh từ người chơi đã ghi log --</option>
              {loggedPlayers.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.displayName || p.userEmail || p.uid} ({p.uid})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* =====================================================================
          SUB-TAB 1 & 2: SYSTEM LOGS & PLAYER ACTIVITY HISTORY
         ===================================================================== */}
      {(subTab === 'SYSTEM_LOGS' || subTab === 'PLAYER_HISTORY') && (
        <div className="space-y-3">
          {/* Filter Bar */}
          <div className="p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-bold text-neutral-300">
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                <span>Bộ lọc &amp; Tìm kiếm nâng cao</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setSeverityFilter('ALL');
                  setCategoryFilter('ALL');
                  setSearchQuery('');
                  setSelectedPlayerUid('');
                }}
                className="text-[11px] text-neutral-400 hover:text-amber-300 underline cursor-pointer"
              >
                Xóa bộ lọc
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-neutral-400 mb-0.5">Từ ngày (UTC)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 mb-0.5">Đến ngày (UTC)</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 mb-0.5">Mức độ</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as SystemLogSeverity | 'ALL')}
                  className="w-full px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
                >
                  <option value="ALL">Tất cả mức độ</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARN</option>
                  <option value="ERROR">ERROR</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-neutral-400 mb-0.5">Nhóm sự kiện (14 nhóm)</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as SystemLogCategory | 'ALL')}
                  className="w-full px-2 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
                >
                  <option value="ALL">Tất cả 14 nhóm sự kiện</option>
                  {ALL_SYSTEM_LOG_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo UID, tên người chơi, email, mã phòng BTxxxx, thông điệp..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-white text-xs"
                />
              </div>

              {subTab === 'PLAYER_HISTORY' && (
                <select
                  value={selectedPlayerUid}
                  onChange={(e) => setSelectedPlayerUid(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-neutral-950 border border-neutral-700 text-neutral-200 text-xs"
                >
                  <option value="">-- Tất cả người chơi ({loggedPlayers.length} UID) --</option>
                  {loggedPlayers.map((p) => (
                    <option key={p.uid} value={p.uid}>
                      {p.displayName || p.userEmail || p.uid} • {p.eventCount} sự kiện
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Log Table */}
          {queryResult.items.length === 0 ? (
            <div className="py-8 text-center text-neutral-400 bg-neutral-900/40 rounded-xl border border-neutral-800">
              Không có bản ghi nhật ký nào khớp bộ lọc hiện tại.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-900/50">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                    <th className="py-2 px-2.5 font-bold whitespace-nowrap">Thời gian</th>
                    <th className="py-2 px-2.5 font-bold whitespace-nowrap">Mức độ</th>
                    <th className="py-2 px-2.5 font-bold whitespace-nowrap">Nhóm / Sự kiện</th>
                    <th className="py-2 px-2.5 font-bold">Nội dung</th>
                    <th className="py-2 px-2.5 font-bold whitespace-nowrap">Người chơi / Phòng</th>
                    <th className="py-2 px-2.5 font-bold text-right whitespace-nowrap">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/70">
                  {queryResult.items.map((item) => (
                    <tr key={item.logId} className="hover:bg-neutral-900/90 transition-colors">
                      <td className="py-2 px-2.5 font-mono text-[11px] text-neutral-300 whitespace-nowrap tabular-nums">
                        {new Date(item.timestampMs).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {renderSeverityBadge(item.severity)}
                          {item.repeatCount > 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono text-[10px]">
                              ×{item.repeatCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-amber-300 text-[11px]">
                          {item.eventType}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {categoryLabelMap.get(item.category) || item.category}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 max-w-[280px]">
                        <div className="text-neutral-200 truncate" title={item.message}>
                          {item.message}
                        </div>
                        {item.sanitizedError && (
                          <div
                            className="text-[10px] font-mono text-rose-300 truncate"
                            title={item.sanitizedError}
                          >
                            {item.sanitizedError}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-mono text-[10px] text-neutral-300 whitespace-nowrap">
                        <div>{item.displayName || item.userEmail || item.uid || 'Hệ thống'}</div>
                        <div className="text-neutral-500">
                          {item.roomCode ? `Phòng ${item.roomCode}` : ''}
                          {item.stageId ? ` • Stage ${item.stageId}` : ''}
                        </div>
                      </td>
                      <td className="py-2 px-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedEntry(item)}
                          className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-amber-400" />
                          <span>Xem</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-mono text-neutral-400 tabular-nums">
              Trang <strong className="text-white">{queryResult.currentPage}</strong> /{' '}
              <strong className="text-white">{queryResult.totalPages}</strong> ({PAGE_SIZE} bản ghi/trang)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={queryResult.currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Trang trước</span>
              </button>
              <button
                type="button"
                disabled={queryResult.currentPage >= queryResult.totalPages}
                onClick={() => setPage((p) => Math.min(queryResult.totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <span>Trang sau</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: ARCHIVE & 9-STEP IDEMPOTENT CLEANUP
         ===================================================================== */}
      {subTab === 'ARCHIVE_CLEANUP' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-neutral-900/90 border border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 flex-1 min-w-[240px]">
              <div className="font-extrabold text-emerald-300 uppercase">
                Quy trình 9 bước Archive-Before-Delete (Idempotent &amp; Fail-Safe)
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Log kiểm toán vĩnh viễn không bao giờ bị xóa khi đăng xuất, đóng phòng hoặc backup. Log tạm thời của phiên/phòng chỉ được xóa sau khi lưu trữ vĩnh viễn, đọc ngược kiểm tra kích thước &gt; 0, khớp số bản ghi, khớp checksum và xác nhận trạng thái <code className="font-mono text-emerald-300">ARCHIVED_VERIFIED</code>.
              </p>
            </div>
            <button
              type="button"
              data-testid="sweep-archive-pending-btn"
              disabled={isSweeping}
              onClick={() => void handleRunArchiveSweep()}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSweeping ? 'animate-spin' : ''}`} />
              <span>{isSweeping ? 'Đang quét lưu trữ...' : 'Quét & Dọn Log Đã Kết Thúc'}</span>
            </button>
          </div>

          {/* Active / Pending Temporary Operational Buffers */}
          <div className="space-y-2">
            <div className="font-bold text-amber-300">
              1. Vùng Log Tạm Thời Hiện Hành ({operationalBuffers.length})
            </div>
            {operationalBuffers.length === 0 ? (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-400">
                Hiện không có vùng log tạm nào đang mở hoặc chờ lưu trữ.
              </div>
            ) : (
              <div className="space-y-1.5">
                {operationalBuffers.map((buf) => (
                  <div
                    key={buf.scopeKey}
                    className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 font-mono text-[11px]">
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{buf.scopeKey}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            buf.status === 'ARCHIVE_PENDING'
                              ? 'bg-amber-950 text-amber-300 border border-amber-600/60'
                              : 'bg-sky-950 text-sky-300 border border-sky-600/60'
                          }`}
                        >
                          {buf.status} {buf.isEnded ? '(Đã kết thúc)' : '(Đang hoạt động)'}
                        </span>
                      </div>
                      <div className="text-neutral-400 text-[10px]">
                        Sự kiện: {buf.events.length} • Lần thử lưu trữ: {buf.retryCount}
                        {buf.lastError ? ` • Lỗi gần nhất: ${buf.lastError}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Verified Permanent Archives */}
          <div className="space-y-2">
            <div className="font-bold text-emerald-300">
              2. Kho Lưu Trữ Vĩnh Viễn Đã Xác Minh Checksum ({verifiedManifests.length})
            </div>
            {verifiedManifests.length === 0 ? (
              <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 text-neutral-400">
                Chưa có gói lưu trữ phiên/phòng nào hoàn tất.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {verifiedManifests.map((man) => (
                  <div
                    key={man.archiveId}
                    className="p-2.5 rounded-lg bg-neutral-900 border border-emerald-800/40 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 font-mono text-[11px]">
                      <div className="font-bold text-emerald-200 flex items-center gap-2">
                        <span>{man.archiveId}</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/50 text-[9px]">
                          {man.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-neutral-400 tabular-nums">
                        {man.eventCount} sự kiện • {formatBytes(man.byteSize)} • Checksum:{' '}
                        {man.checksum} • {new Date(man.verifiedAtMs).toLocaleString('vi-VN')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestoreArchive(man.archiveId)}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-amber-300 font-bold text-[11px] cursor-pointer"
                    >
                      Khôi phục &amp; Xem
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          LOG DETAIL MODAL (SANITIZED METADATA & STACK)
         ===================================================================== */}
      {selectedEntry && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2 font-extrabold text-white">
                {renderSeverityBadge(selectedEntry.severity)}
                <span className="font-mono text-xs">{selectedEntry.logId}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-neutral-500">Thời điểm:</span>{' '}
                  <span className="text-white">
                    {new Date(selectedEntry.timestampMs).toISOString()}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Phân vùng ngày:</span>{' '}
                  <span className="text-amber-300">{selectedEntry.datePartition}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Nhóm / Sự kiện:</span>{' '}
                  <span className="text-emerald-300">
                    {selectedEntry.category} / {selectedEntry.eventType}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Nguồn / Kết quả:</span>{' '}
                  <span className="text-neutral-200">
                    {selectedEntry.source} ({selectedEntry.outcome})
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">UID / Email:</span>{' '}
                  <span className="text-neutral-200">
                    {selectedEntry.uid || '--'} / {selectedEntry.userEmail || '--'}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Phiên / Phòng:</span>{' '}
                  <span className="text-neutral-200">
                    {selectedEntry.sessionId || '--'} / {selectedEntry.roomCode || '--'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 whitespace-pre-wrap break-words">
                {selectedEntry.message}
              </div>

              {selectedEntry.sanitizedError && (
                <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-200 whitespace-pre-wrap break-words">
                  <div className="font-bold text-rose-300 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Chi tiết lỗi (đã ẩn dữ liệu nhạy cảm):</span>
                  </div>
                  {selectedEntry.sanitizedError}
                  {selectedEntry.sanitizedStack ? `\n\n${selectedEntry.sanitizedStack}` : ''}
                </div>
              )}

              <div>
                <div className="text-neutral-400 mb-1">Metadata (Sanitized):</div>
                <pre className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] text-emerald-200 overflow-x-auto">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          RESTORED ARCHIVE VIEWER MODAL
         ===================================================================== */}
      {restoredArchiveView && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-emerald-600/60 rounded-2xl w-full max-w-2xl max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
              <div className="font-extrabold text-emerald-300 font-mono text-xs">
                GÓI LƯU TRỮ ĐÃ XÁC MINH: {restoredArchiveView.manifest.archiveId} (Checksum OK:{' '}
                {restoredArchiveView.manifest.checksum})
              </div>
              <button
                type="button"
                onClick={() => setRestoredArchiveView(null)}
                className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 text-xs font-mono">
              {restoredArchiveView.batch.events.map((ev) => (
                <div
                  key={ev.eventId}
                  className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-amber-300">
                    <span>
                      {ev.eventType} • {ev.eventId}
                    </span>
                    <span>{new Date(ev.timestampMs).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="text-neutral-200">{ev.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
