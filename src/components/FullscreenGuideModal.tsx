/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Maximize, Share, PlusSquare, X } from 'lucide-react';

interface FullscreenGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullscreenGuideModal: React.FC<FullscreenGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 select-none animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-sm w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-5 space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white"
          aria-label="Đóng hướng dẫn"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Maximize className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-white">Chế độ Toàn Màn Hình</h3>
            <p className="text-xs text-neutral-400">Hướng dẫn cho thiết bị di động & iOS</p>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-neutral-300 leading-relaxed bg-neutral-950 p-3.5 rounded-xl border border-neutral-800">
          <p className="font-semibold text-amber-400">
            Trình duyệt hạn chế Fullscreen API tự động (như Safari trên iPhone):
          </p>
          <div className="space-y-2 pt-1">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                1
              </span>
              <span>
                Nhấn nút <strong className="text-white flex inline-flex items-center gap-1"><Share className="w-3 h-3" /> Chia sẻ</strong> ở thanh công cụ trình duyệt.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                2
              </span>
              <span>
                Chọn <strong className="text-white flex inline-flex items-center gap-1"><PlusSquare className="w-3 h-3" /> Thêm vào MH chính</strong> (Add to Home Screen).
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                3
              </span>
              <span>
                Mở game từ màn hình chính để trải nghiệm <strong className="text-amber-400">toàn màn hình 100%</strong> không bị che bởi thanh địa chỉ!
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs transition-colors shadow-lg shadow-amber-500/20"
        >
          ĐÃ HIỂU, TIẾP TỤC CHƠI
        </button>
      </div>
    </div>
  );
};
