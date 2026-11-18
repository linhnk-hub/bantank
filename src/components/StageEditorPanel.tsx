/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  Save,
  CheckCircle2,
  XCircle,
  Undo2,
  RotateCcw,
  Eraser,
  Eye,
  Play,
  PowerOff,
  History,
  AlertTriangle,
  Edit3,
  Layers,
  Shield,
} from 'lucide-react';
import { MAP_DIMENSIONS, TILE_METADATA, STAGE_1_MAP } from '../core/constants.ts';
import { TILE_TYPES } from '../core/types.ts';
import { validateStageMap, STAGE_SPAWN_POINTS } from '../core/mapValidator.ts';
import {
  StageManager,
  areStageMapsEqual,
  cloneStageMap,
  createBlankDraftMap,
  type ManagedStageRecord,
  type StageLifecycleStatus,
} from '../core/stageManager.ts';
import { hasRolePermission, type UserRole } from '../core/rbacMatrix.ts';
import { ConfirmationPopupModal } from './ConfirmationPopupModal.tsx';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';

interface StageEditorPanelProps {
  actorRole: UserRole;
  actorEmail: string;
}

const PALETTE_TILES: Array<{
  code: number;
  codeLabel: string;
  name: string;
  vnName: string;
  bgClass: string;
  borderClass: string;
  shortDesc: string;
}> = [
  {
    code: TILE_TYPES.EMPTY,
    codeLabel: '0: EMPTY',
    name: 'EMPTY',
    vnName: 'Đất trống',
    bgClass: 'bg-zinc-950',
    borderClass: 'border-zinc-700',
    shortDesc: 'Xe và đạn đi qua tự do',
  },
  {
    code: TILE_TYPES.BRICK,
    codeLabel: '1: BRICK',
    name: 'BRICK',
    vnName: 'Tường gạch',
    bgClass: 'bg-[#d85024]',
    borderClass: 'border-orange-400',
    shortDesc: 'Phá hủy từng phần khi trúng đạn',
  },
  {
    code: TILE_TYPES.STEEL,
    codeLabel: '2: STEEL',
    name: 'STEEL',
    vnName: 'Tường thép',
    bgClass: 'bg-[#c0c7cb]',
    borderClass: 'border-slate-200',
    shortDesc: 'Chặn xe và triệt tiêu đạn thường',
  },
  {
    code: TILE_TYPES.WATER,
    codeLabel: '3: WATER',
    name: 'WATER',
    vnName: 'Mặt nước',
    bgClass: 'bg-[#3b82f6]',
    borderClass: 'border-blue-300',
    shortDesc: 'Chặn xe tăng, đạn bay qua được',
  },
  {
    code: TILE_TYPES.GRASS,
    codeLabel: '4: GRASS',
    name: 'GRASS',
    vnName: TILE_METADATA[TILE_TYPES.GRASS].vietnameseName,
    bgClass: 'bg-[#22c55e]',
    borderClass: 'border-emerald-300',
    shortDesc: 'Che khuất xe tăng và đạn',
  },
  {
    code: TILE_TYPES.ICE,
    codeLabel: '5: ICE',
    name: 'ICE',
    vnName: 'Mặt băng',
    bgClass: 'bg-[#bae6fd]',
    borderClass: 'border-sky-200',
    shortDesc: 'Xe tăng đi qua trượt quán tính',
  },
  {
    code: TILE_TYPES.BASE,
    codeLabel: '9: BASE',
    name: 'BASE',
    vnName: 'Căn cứ Đại Bàng',
    bgClass: 'bg-[#eab308]',
    borderClass: 'border-amber-300',
    shortDesc: 'Đúng 1 ô tại [12, 6]; trúng đạn là thua',
  },
];

function getStatusBadge(status: StageLifecycleStatus) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-600/70 text-emerald-300 text-[10px] font-bold">
        <CheckCircle2 className="w-3 h-3" />
        Đã kích hoạt
      </span>
    );
  }
  if (status === 'INACTIVE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700/60 text-rose-300 text-[10px] font-bold">
        <PowerOff className="w-3 h-3" />
        Ngừng kích hoạt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/90 border border-amber-600/70 text-amber-300 text-[10px] font-bold">
      <Edit3 className="w-3 h-3" />
      Bản nháp
    </span>
  );
}

export const StageEditorPanel: React.FC<StageEditorPanelProps> = ({
  actorRole,
  actorEmail,
}) => {
  const stageManager = useMemo(() => StageManager.getInstance(), []);
  const canEditStages = hasRolePermission(actorRole, 'EDIT_STAGE');

  const [managedStages, setManagedStages] = useState<ManagedStageRecord[]>(() =>
    stageManager.getManagedStages()
  );
  const [selectedStageId, setSelectedStageId] = useState<number>(1);
  const [editingName, setEditingName] = useState<string>('KHỞI ĐẦU');
  const [editingOrderIndex, setEditingOrderIndex] = useState<number>(1);
  const [editingMap, setEditingMap] = useState<number[][]>(() => cloneStageMap(STAGE_1_MAP));
  const [undoStack, setUndoStack] = useState<number[][][]>([]);
  const [selectedTileCode, setSelectedTileCode] = useState<number>(TILE_TYPES.BRICK);
  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [showSpawnLayer, setShowSpawnLayer] = useState<boolean>(true);
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState<number>(0);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    messages: string[];
  } | null>(null);

  const isStrokeUndoPushedRef = useRef<boolean>(false);

  useEffect(() => {
    const syncStages = () => {
      setManagedStages(stageManager.getManagedStages());
    };
    const unsub = stageManager.subscribe(syncStages);
    void stageManager.refreshFromCloudOnce();
    return () => unsub();
  }, [stageManager]);

  const currentManagedStage = useMemo(
    () => managedStages.find((s) => s.id === selectedStageId) ?? managedStages[0] ?? null,
    [managedStages, selectedStageId]
  );

  const handleSelectStageForEdit = (stage: ManagedStageRecord) => {
    setSelectedStageId(stage.id);
    setEditingName(stage.name);
    setEditingOrderIndex(stage.orderIndex);
    setEditingMap(cloneStageMap(stage.draftMap));
    setUndoStack([]);
    setFeedbackBanner(null);
  };

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      setIsPainting(false);
      isStrokeUndoPushedRef.current = false;
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, []);

  const liveMapValidation = useMemo(() => validateStageMap(editingMap), [editingMap, previewRefreshNonce]);

  const spawnMapLookup = useMemo(() => {
    const map = new Map<string, (typeof STAGE_SPAWN_POINTS)[number]>();
    for (const sp of STAGE_SPAWN_POINTS) {
      map.set(`${sp.row}_${sp.col}`, sp);
    }
    return map;
  }, []);

  const pushUndoSnapshot = (snapshot: number[][]) => {
    setUndoStack((prev) => {
      const next = [...prev, cloneStageMap(snapshot)];
      return next.length > 35 ? next.slice(next.length - 35) : next;
    });
  };

  const applyTileAtCell = (
    row: number,
    col: number,
    tileCode: number,
    recordUndo: boolean
  ) => {
    if (!canEditStages) return;
    if (row < 0 || row >= MAP_DIMENSIONS.ROWS || col < 0 || col >= MAP_DIMENSIONS.COLS) {
      return;
    }

    setEditingMap((prev) => {
      if (prev[row]?.[col] === tileCode) {
        return prev;
      }
      if (recordUndo && !isStrokeUndoPushedRef.current) {
        pushUndoSnapshot(prev);
        isStrokeUndoPushedRef.current = true;
      }
      const next = cloneStageMap(prev);
      // If placing BASE (9), automatically clear any previous BASE cell so there is only 1 BASE on the grid
      if (tileCode === TILE_TYPES.BASE) {
        for (let r = 0; r < MAP_DIMENSIONS.ROWS; r++) {
          for (let c = 0; c < MAP_DIMENSIONS.COLS; c++) {
            if (next[r][c] === TILE_TYPES.BASE) {
              next[r][c] = TILE_TYPES.EMPTY;
            }
          }
        }
      }
      next[row][col] = tileCode;
      return next;
    });
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setEditingMap(cloneStageMap(last));
    setFeedbackBanner(null);
  };

  const handleAddStage = () => {
    setFeedbackBanner(null);
    const res = stageManager.createStageDraft({
      actorRole,
      actorEmail,
    });
    if (!res.success || !res.stage) {
      setFeedbackBanner({ type: 'error', messages: res.errors });
      return;
    }
    setManagedStages(stageManager.getManagedStages());
    handleSelectStageForEdit(res.stage);
    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã tạo "${res.stage.name}" ở trạng thái Bản nháp (Phiên bản v${res.stage.version}). Hãy thiết kế bản đồ 13×13 và nhấn Lưu / Kích hoạt.`,
      ],
    });
  };

  const handleSaveStage = async (targetStage?: ManagedStageRecord) => {
    setFeedbackBanner(null);
    const stageToSave = targetStage ?? currentManagedStage;
    if (!stageToSave) return;

    const isSavingSelected = stageToSave.id === selectedStageId;
    const res = stageManager.saveStageDraft({
      id: stageToSave.id,
      name: isSavingSelected ? editingName : stageToSave.name,
      orderIndex: isSavingSelected ? editingOrderIndex : stageToSave.orderIndex,
      map: isSavingSelected ? editingMap : stageToSave.draftMap,
      actorRole,
      actorEmail,
    });

    if (!res.success || !res.stage) {
      setFeedbackBanner({ type: 'error', messages: res.errors });
      return;
    }

    setManagedStages(stageManager.getManagedStages());
    if (isSavingSelected) {
      setEditingName(res.stage.name);
      setEditingOrderIndex(res.stage.orderIndex);
      setEditingMap(cloneStageMap(res.stage.draftMap));
    }

    setIsCloudSyncing(true);
    const cloudRes = await stageManager.syncCatalogToCloud({ actorRole, actorEmail });
    setIsCloudSyncing(false);

    if (!cloudRes.success) {
      setFeedbackBanner({
        type: 'error',
        messages: [
          `Đã lưu bản nháp "${res.stage.name}" (v${res.stage.version}) cục bộ nhưng chưa đồng bộ được lên máy chủ: ${cloudRes.error || 'Lỗi kết nối.'}`,
        ],
      });
      return;
    }

    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã lưu bản nháp "${res.stage.name}" (Phiên bản v${res.stage.version}). Để người chơi thấy bản đồ mới này, hãy nhấn "Kích hoạt".`,
      ],
    });
  };

  const handleActivateStage = async (stage: ManagedStageRecord) => {
    setFeedbackBanner(null);
    // If activating the currently selected stage, first save any pending draft edits if valid
    if (stage.id === selectedStageId && !stage.isOfficialStage1) {
      const saveRes = stageManager.saveStageDraft({
        id: stage.id,
        name: editingName,
        orderIndex: editingOrderIndex,
        map: editingMap,
        actorRole,
        actorEmail,
      });
      if (!saveRes.success) {
        setFeedbackBanner({ type: 'error', messages: saveRes.errors });
        return;
      }
    }

    const res = stageManager.activateStage({
      id: stage.id,
      actorRole,
      actorEmail,
    });

    if (!res.success || !res.stage) {
      setFeedbackBanner({ type: 'error', messages: res.errors });
      return;
    }

    setManagedStages(stageManager.getManagedStages());
    setIsCloudSyncing(true);
    const cloudRes = await stageManager.syncCatalogToCloud({ actorRole, actorEmail });
    setIsCloudSyncing(false);

    if (!cloudRes.success) {
      setFeedbackBanner({
        type: 'error',
        messages: [
          `Đã kích hoạt cục bộ "${res.stage.name}" nhưng không thể đồng bộ lên máy chủ cho người chơi khác: ${cloudRes.error || 'Lỗi Firestore.'}`,
        ],
      });
      return;
    }

    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã kích hoạt & đồng bộ máy chủ màn chơi "${res.stage.name}" (Thứ tự #${res.stage.orderIndex}, Phiên bản hoạt động v${res.stage.activeVersion}). Toàn bộ người chơi đã nhận được bản đồ mới.`,
      ],
    });
  };

  const handleDeactivateStage = async (stage: ManagedStageRecord) => {
    setFeedbackBanner(null);
    const res = stageManager.deactivateStage({
      id: stage.id,
      actorRole,
      actorEmail,
    });
    if (!res.success || !res.stage) {
      setFeedbackBanner({ type: 'error', messages: res.errors });
      return;
    }
    setManagedStages(stageManager.getManagedStages());
    setIsCloudSyncing(true);
    const cloudRes = await stageManager.syncCatalogToCloud({ actorRole, actorEmail });
    setIsCloudSyncing(false);
    if (!cloudRes.success) {
      setFeedbackBanner({
        type: 'error',
        messages: [
          `Đã ngừng kích hoạt cục bộ "${res.stage.name}" nhưng chưa đồng bộ được lên máy chủ: ${cloudRes.error || 'Lỗi Firestore.'}`,
        ],
      });
      return;
    }
    setFeedbackBanner({
      type: 'success',
      messages: [`Đã ngừng kích hoạt & đồng bộ máy chủ cho "${res.stage.name}".`],
    });
  };

  const handleRestorePreviousVersion = async (stage: ManagedStageRecord) => {
    setFeedbackBanner(null);
    const res = stageManager.restorePreviousActiveVersion({
      id: stage.id,
      actorRole,
      actorEmail,
    });
    if (!res.success || !res.stage) {
      setFeedbackBanner({ type: 'error', messages: res.errors });
      return;
    }
    setManagedStages(stageManager.getManagedStages());
    if (stage.id === selectedStageId) {
      handleSelectStageForEdit(res.stage);
    }
    setIsCloudSyncing(true);
    const cloudRes = await stageManager.syncCatalogToCloud({ actorRole, actorEmail });
    setIsCloudSyncing(false);
    if (!cloudRes.success) {
      setFeedbackBanner({
        type: 'error',
        messages: [
          `Đã khôi phục cục bộ "${res.stage.name}" nhưng chưa đồng bộ được lên máy chủ: ${cloudRes.error || 'Lỗi Firestore.'}`,
        ],
      });
      return;
    }
    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã khôi phục & đồng bộ phiên bản hợp lệ trước đó cho "${res.stage.name}" (v${res.stage.version}).`,
      ],
    });
  };

  return (
    <div className="space-y-4">
      <ConfirmationPopupModal
        isOpen={Boolean(feedbackBanner)}
        type={feedbackBanner?.type ?? 'success'}
        messages={feedbackBanner?.messages ?? []}
        onClose={() => setFeedbackBanner(null)}
      />

      {/* Header & Add Stage CTA */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Quản lý màn chơi (Stage) &amp; Thiết kế bản đồ 13×13
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5 whitespace-pre-line">
              {formatSentenceLineBreaks(
                'Stage 1 chính thức được bảo vệ nguyên trạng. Màn chơi mới tạo ở trạng thái Bản nháp cho đến khi bấm Kích hoạt.'
              )}
            </p>
          </div>
          {canEditStages && (
            <button
              type="button"
              onClick={handleAddStage}
              data-testid="btn-add-stage"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm màn chơi
            </button>
          )}
        </div>

        {/* Feedback Banner */}
        {feedbackBanner && (
          <div
            className={`p-2.5 rounded-lg border text-xs space-y-1 ${
              feedbackBanner.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-200'
                : 'bg-rose-950/60 border-rose-700/70 text-rose-200'
            }`}
          >
            {feedbackBanner.messages.map((msg, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                {feedbackBanner.type === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="whitespace-pre-line">{formatSentenceLineBreaks(msg)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stage Table (Đã bỏ cột Tên Stage, Phiên bản, Người chỉnh sửa theo đặc tả) */}
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800">
                <th className="py-2 px-3 font-semibold whitespace-nowrap">Thứ tự</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">Trạng thái</th>
                <th className="py-2 px-3 font-semibold whitespace-nowrap">Cập nhật gần nhất</th>
                <th className="py-2 px-3 font-semibold text-right whitespace-nowrap">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {managedStages.map((stage) => {
                const isSelected = stage.id === selectedStageId;
                const effectiveMap = isSelected ? editingMap : stage.draftMap;
                const hasPendingDraftDiff =
                  !stage.isOfficialStage1 &&
                  (!stage.activeMap ||
                    !areStageMapsEqual(effectiveMap, stage.activeMap) ||
                    (isSelected &&
                      (editingName.trim() !== stage.name ||
                        editingOrderIndex !== stage.orderIndex)));
                const showActivateBtn = stage.status !== 'ACTIVE' || hasPendingDraftDiff;
                return (
                  <tr
                    key={stage.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <td className="py-2 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>Stage #{stage.orderIndex}</span>
                        {stage.isOfficialStage1 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px]">
                            CHÍNH THỨC
                          </span>
                        )}
                        {hasPendingDraftDiff && stage.status === 'ACTIVE' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[9px] font-bold">
                            Chưa kích hoạt bản sửa
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {getStatusBadge(stage.status)}
                    </td>
                    <td className="py-2 px-3 text-zinc-400 font-mono whitespace-nowrap">
                      {new Date(stage.updatedAtMs).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectStageForEdit(stage)}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-zinc-950 border-amber-400'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                          }`}
                        >
                          Sửa
                        </button>
                        {canEditStages && !stage.isOfficialStage1 && (
                          <>
                            <button
                              type="button"
                              disabled={isCloudSyncing}
                              onClick={() => {
                                void handleSaveStage(stage);
                              }}
                              className="px-2 py-1 rounded bg-sky-900/70 hover:bg-sky-800 disabled:opacity-50 border border-sky-700/70 text-sky-200 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Lưu
                            </button>
                            {showActivateBtn && (
                              <button
                                type="button"
                                disabled={isCloudSyncing}
                                onClick={() => {
                                  void handleActivateStage(stage);
                                }}
                                className="px-2 py-1 rounded bg-emerald-900/70 hover:bg-emerald-800 disabled:opacity-50 border border-emerald-700/70 text-emerald-200 text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                Kích hoạt
                              </button>
                            )}
                            {stage.status === 'ACTIVE' && (
                              <button
                                type="button"
                                disabled={isCloudSyncing}
                                onClick={() => {
                                  void handleDeactivateStage(stage);
                                }}
                                className="px-2 py-1 rounded bg-rose-900/70 hover:bg-rose-800 disabled:opacity-50 border border-rose-700/70 text-rose-200 text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                Hủy kích hoạt
                              </button>
                            )}
                            {stage.previousActiveVersions.length > 0 && (
                              <button
                                type="button"
                                disabled={isCloudSyncing}
                                onClick={() => {
                                  void handleRestorePreviousVersion(stage);
                                }}
                                title="Khôi phục phiên bản hợp lệ trước đó"
                                className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-amber-300 text-[10px] font-bold transition-colors cursor-pointer"
                              >
                                <History className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 13x13 Drag-and-Drop Map Editor */}
      {currentManagedStage && (
        <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
            <div>
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                Trình thiết kế bản đồ 13×13 Kéo & Thả — {currentManagedStage.name}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Hỗ trợ kéo-thả ô từ bảng công cụ vào lưới 13×13, nhấp hoặc chạm-kéo để tô nhanh qua nhiều ô liên tiếp.
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {getStatusBadge(currentManagedStage.status)}
              <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px]">
                v{currentManagedStage.version}
              </span>
            </div>
          </div>

          {/* Stage Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                Tên màn chơi (Stage Name)
              </label>
              <input
                type="text"
                value={editingName}
                disabled={!canEditStages || currentManagedStage.isOfficialStage1}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Nhập tên màn chơi..."
                className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100 disabled:opacity-60 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-1">
                Số thứ tự Stage
              </label>
              <input
                type="number"
                min={currentManagedStage.isOfficialStage1 ? 1 : 2}
                max={99}
                value={editingOrderIndex}
                disabled={!canEditStages || currentManagedStage.isOfficialStage1}
                onChange={(e) => setEditingOrderIndex(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-100 disabled:opacity-60 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {currentManagedStage.isOfficialStage1 && (
            <div className="p-2.5 rounded bg-amber-950/40 border border-amber-700/50 text-[11px] text-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="whitespace-pre-line">
                  Đây là <strong>Stage 1 chính thức</strong> của hệ thống và được khóa bảo vệ nguyên trạng.{'\n'}Để thiết kế màn chơi mới, hãy nhấn nút <strong>&quot;Thêm màn chơi&quot;</strong>.
                </span>
              </div>
              {canEditStages && (
                <button
                  type="button"
                  onClick={() => {
                    const res = stageManager.createStageDraft({
                      name: 'Stage 2 - Bản Sao Tùy Chỉnh',
                      baseMap: editingMap,
                      actorRole,
                      actorEmail,
                    });
                    if (res.success && res.stage) {
                      setManagedStages(stageManager.getManagedStages());
                      handleSelectStageForEdit(res.stage);
                      setFeedbackBanner({
                        type: 'success',
                        messages: [
                          `Đã tạo màn chơi mới (Stage #${res.stage.orderIndex}) từ bản sao Stage 1. Hãy chỉnh sửa bản đồ và nhấn Lưu / Kích hoạt.`,
                        ],
                      });
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[10px] whitespace-nowrap cursor-pointer"
                >
                  Sao chép sang Stage mới
                </button>
              )}
            </div>
          )}

          {/* Palette & Editor Toolbar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left column: Top Draggable 7-Tile Cluster + Quick Actions */}
            <div className="lg:col-span-5 space-y-3">
              <div
                data-testid="palette-draggable-cluster"
                className="p-3 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-2.5 select-none"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                    Cụm vật liệu kéo &amp; thả (7 loại địa hình)
                  </div>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Đang chọn:{' '}
                    <strong className="text-amber-300">
                      {TILE_METADATA[selectedTileCode]?.vietnameseName} ({selectedTileCode})
                    </strong>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 select-none">
                  {PALETTE_TILES.map((tile) => {
                    const isSelected = selectedTileCode === tile.code;
                    const canDragTile = canEditStages && !currentManagedStage.isOfficialStage1;
                    return (
                      <button
                        key={tile.code}
                        type="button"
                        draggable={canDragTile}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = 'copy';
                          e.dataTransfer.setData('text/plain', String(tile.code));
                          if (e.dataTransfer.setDragImage) {
                            e.dataTransfer.setDragImage(e.currentTarget, 20, 20);
                          }
                          setSelectedTileCode(tile.code);
                        }}
                        onClick={() => setSelectedTileCode(tile.code)}
                        data-testid={`palette-tile-${tile.code}`}
                        aria-label={`${tile.vnName} (${tile.code})`}
                        title={`${tile.vnName} (${tile.codeLabel})`}
                        className={`w-11 h-11 rounded-lg border-2 flex items-center justify-center transition-all select-none shrink-0 ${
                          canDragTile ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${
                          isSelected
                            ? 'bg-amber-500/25 border-amber-400 ring-2 ring-amber-400/70 scale-105 shadow-md'
                            : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded border flex items-center justify-center text-xs font-black pointer-events-none ${tile.bgClass} ${tile.borderClass}`}
                        >
                          {tile.code === TILE_TYPES.BASE ? '🦅' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editor Action Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedTileCode(TILE_TYPES.EMPTY)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                    selectedTileCode === TILE_TYPES.EMPTY
                      ? 'bg-amber-500 text-zinc-950 border-amber-400'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Xóa ô về EMPTY
                </button>

                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 text-[11px] font-bold border border-zinc-700 transition-colors"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Hoàn tác ({undoStack.length})
                </button>

                <button
                  type="button"
                  onClick={() => setShowSpawnLayer((v) => !v)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[11px] font-bold border transition-colors ${
                    showSpawnLayer
                      ? 'bg-sky-950/90 border-sky-600 text-sky-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showSpawnLayer ? 'Đang hiện lớp Spawn' : 'Đã ẩn lớp Spawn'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPreviewRefreshNonce((n) => n + 1);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold border border-zinc-700 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Làm mới bản xem trước
                </button>

                {canEditStages && !currentManagedStage.isOfficialStage1 && (
                  <button
                    type="button"
                    onClick={() => {
                      pushUndoSnapshot(editingMap);
                      setEditingMap(createBlankDraftMap());
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-[11px] font-bold border border-zinc-700 transition-colors"
                  >
                    Đặt lại khung chuẩn 13×13
                  </button>
                )}
              </div>

              {/* Validation Status Box */}
              <div
                className={`p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                  liveMapValidation.isValid
                    ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300'
                    : 'bg-rose-950/50 border-rose-800/80 text-rose-200'
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    {liveMapValidation.isValid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    {liveMapValidation.isValid
                      ? 'Cấu trúc bản đồ 13×13'
                      : `Phát hiện ${liveMapValidation.errors.length} lỗi cấu trúc bản đồ`}
                  </span>
                  <span className="font-mono text-[10px]">
                    {liveMapValidation.rows}×{liveMapValidation.cols} ({liveMapValidation.totalTiles} ô)
                  </span>
                </div>
                {!liveMapValidation.isValid && (
                  <ul className="list-disc list-inside space-y-0.5 text-[10px] text-rose-300">
                    {liveMapValidation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Save & Activate Primary Buttons */}
              {canEditStages && !currentManagedStage.isOfficialStage1 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={() => {
                      void handleSaveStage();
                    }}
                    data-testid="btn-save-stage-draft"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {isCloudSyncing ? 'Đang lưu...' : 'Lưu màn chơi'}
                  </button>
                  <button
                    type="button"
                    disabled={isCloudSyncing}
                    onClick={() => {
                      void handleActivateStage(currentManagedStage);
                    }}
                    data-testid="btn-activate-stage"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition-colors shadow cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {isCloudSyncing ? 'Đang kích hoạt...' : 'Kích hoạt màn chơi'}
                  </button>
                </div>
              )}
            </div>

            {/* Right column: Interactive 13x13 Grid */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full max-w-[390px] bg-zinc-950 p-2.5 rounded-xl border-2 border-zinc-800 shadow-inner select-none touch-none">
                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono mb-1.5 px-1">
                  <span>LƯỚI BẢN ĐỒ 13×13 (0..12)</span>
                  <span>
                    Đang chọn:{' '}
                    <strong className="text-amber-400">
                      {TILE_METADATA[selectedTileCode]?.vietnameseName} ({selectedTileCode})
                    </strong>
                  </span>
                </div>

                <div
                  className="grid grid-cols-13 gap-[2px] bg-zinc-800 p-[2px] rounded border border-zinc-700 aspect-square w-full"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {editingMap.map((row, rIdx) =>
                    row.map((cellVal, cIdx) => {
                      const spawnOverlay = spawnMapLookup.get(`${rIdx}_${cIdx}`);
                      const tilePalette =
                        PALETTE_TILES.find((t) => t.code === cellVal) ?? PALETTE_TILES[0];

                      return (
                        <div
                          key={`${rIdx}_${cIdx}`}
                          data-testid={`editor-cell-${rIdx}-${cIdx}`}
                          title={`Hàng ${rIdx}, Cột ${cIdx} — ${tilePalette.vnName} (${cellVal})${
                            spawnOverlay ? ` | Vị trí Spawn: ${spawnOverlay.label}` : ''
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault();
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const rawCode = Number(e.dataTransfer.getData('text/plain'));
                            const codeToUse = Number.isNaN(rawCode) ? selectedTileCode : rawCode;
                            isStrokeUndoPushedRef.current = false;
                            applyTileAtCell(rIdx, cIdx, codeToUse, true);
                            isStrokeUndoPushedRef.current = false;
                          }}
                          onPointerDown={(e) => {
                            if (!canEditStages || currentManagedStage.isOfficialStage1) return;
                            e.preventDefault();
                            isStrokeUndoPushedRef.current = false;
                            setIsPainting(true);
                            const codeToUse = e.button === 2 ? TILE_TYPES.EMPTY : selectedTileCode;
                            applyTileAtCell(rIdx, cIdx, codeToUse, true);
                          }}
                          onPointerEnter={() => {
                            if (!isPainting || !canEditStages || currentManagedStage.isOfficialStage1) {
                              return;
                            }
                            applyTileAtCell(rIdx, cIdx, selectedTileCode, false);
                          }}
                          className={`relative w-full h-full flex items-center justify-center text-[8px] font-mono font-bold transition-transform ${
                            tilePalette.bgClass
                          } ${
                            canEditStages && !currentManagedStage.isOfficialStage1
                              ? 'cursor-crosshair hover:brightness-125'
                              : 'cursor-default'
                          }`}
                        >
                          {cellVal === TILE_TYPES.BASE && (
                            <span className="text-[9px] font-black text-zinc-950 drop-shadow">
                              🦅
                            </span>
                          )}

                          {/* Separate Spawn Point Visual Layer (Does NOT overwrite underlying tile code) */}
                          {showSpawnLayer && spawnOverlay && (
                            <span
                              className={`pointer-events-none absolute inset-[1px] rounded-[2px] border flex items-center justify-center text-[8px] font-extrabold tracking-tighter ${
                                spawnOverlay.role === 'P1'
                                  ? 'border-red-500 bg-red-500/35 text-red-200'
                                  : spawnOverlay.role === 'P2'
                                    ? 'border-amber-400 bg-amber-500/35 text-amber-200'
                                    : 'border-sky-400 bg-sky-500/35 text-sky-100'
                              }`}
                            >
                              {spawnOverlay.shortLabel}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Spawn Layer Legend */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 px-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-red-500/40 border border-red-400 inline-block" />
                      P1 [12,3]
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-400 inline-block" />
                      P2 [12,9]
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/40 border border-sky-400 inline-block" />
                      Enemy [0,0], [0,6], [0,12]
                    </span>
                  </div>
                  <span className="font-mono text-zinc-500">Căn cứ chuẩn: [12,6]</span>
                </div>
              </div>
            </div>
          </div>

          {/* Separate Bottom Explanation Cluster: Material Name on Same Row as Explanation Note */}
          <div
            data-testid="palette-notes-cluster"
            className="p-3 rounded-xl bg-zinc-950/90 border border-zinc-800 space-y-2 select-none pointer-events-none"
          >
            <div className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
              Ghi chú giải thích 7 loại vật liệu địa hình
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {PALETTE_TILES.map((tile) => (
                <div
                  key={tile.code}
                  data-testid={`palette-row-${tile.code}`}
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-900/85 border border-zinc-800/80 flex items-center gap-2 text-[11px] select-none pointer-events-none"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center text-[8px] font-black ${tile.bgClass} ${tile.borderClass}`}
                  >
                    {tile.code === TILE_TYPES.BASE ? '🦅' : ''}
                  </span>
                  <div
                    data-testid={`palette-note-${tile.code}`}
                    className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 select-none pointer-events-none"
                  >
                    <span className="font-bold text-amber-300 shrink-0">
                      {tile.vnName} ({tile.codeLabel}):
                    </span>
                    <span className="text-zinc-300 whitespace-pre-line">
                      {formatSentenceLineBreaks(tile.shortDesc)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
