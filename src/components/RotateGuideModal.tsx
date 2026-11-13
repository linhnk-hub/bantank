/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Smartphone, RotateCw, X, Check } from 'lucide-react';

interface RotateGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RotateGuideModal: React.FC<RotateGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 bg-black/85 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-neutral-900 border-2 border-amber-500/80 rounded-2xl p-6 max-w-sm w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto shadow-2xl text-center flex flex-col items-center gap-4">
        {/* Animated Rotating Phone Graphic */}
        <div className="relative w-24 h-24 flex items-center justify-center bg-neutral-950 rounded-2xl border border-neutral-800 shadow-inner">
          <Smartphone className="w-12 h-12 text-amber-400 animate-pulse" />
          <RotateCw className="w-6 h-6 text-sky-400 absolute -top-1 -right-1 animate-spin" style={{ animationDuration: '4s' }} />
        </div>

        <div className="space-y-1.5">
          <h3 className="text-base font-extrabold text-white tracking-wide uppercase">
            Xoay ngang thiết bị
          </h3>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Để có trải nghiệm điều khiển tốt nhất (<strong>D-Pad bên Trái — Canvas ở Giữa — Bắn bên Phải</strong>):
          </p>
        </div>

        {/* Step-by-step guidance */}
        <div className="w-full bg-neutral-950 p-3 rounded-xl border border-neutral-800 text-left space-y-2 text-xs text-neutral-300">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            <span>Bật tính năng <strong>Tự động xoay màn hình (Auto-Rotate)</strong> trong thanh cài đặt nhanh của máy.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
            <span>Xoay ngang điện thoại hoặc máy tính bảng để game tự chuyển bố cục tối ưu.</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex w-full gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Đã hiểu</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 text-xs flex items-center justify-center transition-all"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
