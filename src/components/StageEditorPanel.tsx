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
  cloneStageMap,
  createBlankDraftMap,
  type ManagedStageRecord,
  type StageLifecycleStatus,
} from '../core/stageManager.ts';
import { hasRolePermission, type UserRole } from '../core/rbacMatrix.ts';

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
    vnName: 'Bụi cỏ',
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
  const [editingName, setEditingName] = useState<string>('Stage 1 - Mặt Trận Khởi Đầu');
  const [editingOrderIndex, setEditingOrderIndex] = useState<number>(1);
  const [editingMap, setEditingMap] = useState<number[][]>(() => cloneStageMap(STAGE_1_MAP));
  const [undoStack, setUndoStack] = useState<number[][][]>([]);
  const [selectedTileCode, setSelectedTileCode] = useState<number>(TILE_TYPES.BRICK);
  const [isPainting, setIsPainting] = useState<boolean>(false);
  const [showSpawnLayer, setShowSpawnLayer] = useState<boolean>(true);
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState<number>(0);
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

  const handleSaveStage = (targetStage?: ManagedStageRecord) => {
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
    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã lưu bản nháp "${res.stage.name}" (Phiên bản v${res.stage.version}). Các trận đang diễn ra không bị ảnh hưởng.`,
      ],
    });
  };

  const handleActivateStage = (stage: ManagedStageRecord) => {
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
    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã kích hoạt màn chơi "${res.stage.name}" (Thứ tự #${res.stage.orderIndex}, Phiên bản hoạt động v${res.stage.activeVersion}).`,
      ],
    });
  };

  const handleDeactivateStage = (stage: ManagedStageRecord) => {
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
    setFeedbackBanner({
      type: 'success',
      messages: [`Đã ngừng kích hoạt màn chơi "${res.stage.name}".`],
    });
  };

  const handleRestorePreviousVersion = (stage: ManagedStageRecord) => {
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
    setFeedbackBanner({
      type: 'success',
      messages: [
        `Đã khôi phục phiên bản hợp lệ trước đó cho "${res.stage.name}" (v${res.stage.version}).`,
      ],
    });
  };

  return (
    <div className="space-y-4">
      {/* Header & Add Stage CTA */}
      <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4" />
              Quản lý danh sách màn chơi (Stage) & Thiết kế bản đồ 13×13
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Stage 1 chính thức luôn được bảo toàn nguyên trạng. Màn chơi mới tạo mặc định ở trạng thái Bản nháp cho đến khi nhấn Kích hoạt.
            </p>
          </div>
          {canEditStages && (
            <button
              type="button"
              onClick={handleAddStage}
              data-testid="btn-add-stage"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow"
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
                <span>{msg}</span>
              </div>
            ))}
          </div>
        )}

        {/* Stage Table */}
        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800">
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Thứ tự</th>
                <th className="py-2 px-2.5 font-semibold">Tên Stage</th>
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Trạng thái</th>
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Phiên bản</th>
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Cập nhật gần nhất</th>
                <th className="py-2 px-2.5 font-semibold whitespace-nowrap">Người chỉnh sửa</th>
                <th className="py-2 px-2.5 font-semibold text-right whitespace-nowrap">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {managedStages.map((stage) => {
                const isSelected = stage.id === selectedStageId;
                return (
                  <tr
                    key={stage.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-500/10' : 'hover:bg-zinc-900/50'
                    }`}
                  >
                    <td className="py-2 px-2.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                      #{stage.orderIndex}
                      {stage.isOfficialStage1 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px]">
                          CHÍNH THỨC
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 font-semibold text-zinc-100">
                      {stage.name}
                    </td>
                    <td className="py-2 px-2.5 whitespace-nowrap">
                      {getStatusBadge(stage.status)}
                    </td>
                    <td className="py-2 px-2.5 font-mono text-zinc-300 whitespace-nowrap">
                      v{stage.version}
                      {stage.activeVersion !== null && (
                        <span className="text-[10px] text-emerald-400 ml-1">
                          (Active: v{stage.activeVersion})
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 text-zinc-400 whitespace-nowrap">
                      {new Date(stage.updatedAtMs).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2 px-2.5 text-zinc-300 truncate max-w-[140px]">
                      {stage.updatedBy}
                    </td>
                    <td className="py-2 px-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSelectStageForEdit(stage)}
                          className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
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
                              onClick={() => handleSaveStage(stage)}
                              className="px-2 py-1 rounded bg-sky-900/70 hover:bg-sky-800 border border-sky-700/70 text-sky-200 text-[10px] font-bold transition-colors"
                            >
                              Lưu
                            </button>
                            {stage.status !== 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => handleActivateStage(stage)}
                                className="px-2 py-1 rounded bg-emerald-900/70 hover:bg-emerald-800 border border-emerald-700/70 text-emerald-200 text-[10px] font-bold transition-colors"
                              >
                                Kích hoạt
                              </button>
                            )}
                            {stage.status === 'ACTIVE' && (
                              <button
                                type="button"
                                onClick={() => handleDeactivateStage(stage)}
                                className="px-2 py-1 rounded bg-rose-900/70 hover:bg-rose-800 border border-rose-700/70 text-rose-200 text-[10px] font-bold transition-colors"
                              >
                                Ngừng kích hoạt
                              </button>
                            )}
                            {stage.previousActiveVersions.length > 0 && (
                              <button
                                type="button"
                                onClick={() => handleRestorePreviousVersion(stage)}
                                title="Khôi phục phiên bản hợp lệ trước đó"
                                className="px-1.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 text-[10px] font-bold transition-colors"
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
                <span>
                  Đây là <strong>Stage 1 chính thức</strong> của hệ thống và được khóa bảo vệ nguyên trạng. Để thiết kế màn chơi mới, hãy nhấn nút <strong>"Thêm màn chơi"</strong>.
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
                    }
                  }}
                  className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[10px] whitespace-nowrap"
                >
                  Sao chép sang Stage mới
                </button>
              )}
            </div>
          )}

          {/* Palette & Editor Toolbar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Left column: 7-Tile Palette + Quick Actions */}
            <div className="lg:col-span-5 space-y-3">
              <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                Bảng công cụ 7 loại địa hình (Kéo thả hoặc Chọn để vẽ)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTE_TILES.map((tile) => {
                  const isSelected = selectedTileCode === tile.code;
                  return (
                    <button
                      key={tile.code}
                      type="button"
                      draggable={canEditStages}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(tile.code));
                        setSelectedTileCode(tile.code);
                      }}
                      onClick={() => setSelectedTileCode(tile.code)}
                      data-testid={`palette-tile-${tile.code}`}
                      className={`p-2 rounded-lg border text-left transition-all flex items-start gap-2 ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400/50'
                          : 'bg-zinc-950/90 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded border shrink-0 mt-0.5 ${tile.bgClass} ${tile.borderClass}`}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-zinc-100 truncate">
                          {tile.codeLabel}
                        </div>
                        <div className="text-[10px] text-amber-300/90 font-medium truncate">
                          {tile.vnName}
                        </div>
                        <div className="text-[9px] text-zinc-500 leading-tight mt-0.5 line-clamp-2">
                          {tile.shortDesc}
                        </div>
                      </div>
                    </button>
                  );
                })}
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
                      ? 'Cấu trúc bản đồ 13×13 hợp lệ (Đạt chuẩn)'
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
                    onClick={() => handleSaveStage()}
                    data-testid="btn-save-stage-draft"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors shadow"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Lưu màn chơi (Bản nháp)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActivateStage(currentManagedStage)}
                    data-testid="btn-activate-stage"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Kích hoạt màn chơi
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
                                  ? 'border-amber-400 bg-amber-500/35 text-amber-200'
                                  : spawnOverlay.role === 'P2'
                                    ? 'border-emerald-400 bg-emerald-500/35 text-emerald-200'
                                    : 'border-rose-400 bg-rose-500/35 text-rose-100'
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
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-400 inline-block" />
                      P1 [12,3]
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/40 border border-emerald-400 inline-block" />
                      P2 [12,9]
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/40 border border-rose-400 inline-block" />
                      Enemy [0,0], [0,6], [0,12]
                    </span>
                  </div>
                  <span className="font-mono text-zinc-500">Căn cứ chuẩn: [12,6]</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
