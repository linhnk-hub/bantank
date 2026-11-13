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

export const FullscreenGuideModal: React.FC<FullscreenGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-4 select-none animate-in fade-in duration-150 font-display">
      <div className="bg-black border-4 border-neo-amber pixel-corners max-w-sm w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] overflow-y-auto p-6 space-y-6 shadow-[0_0_20px_rgba(255,184,0,0.4)] relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black border-2 border-neo-amber text-neo-amber pixel-corners hover:bg-neo-amber hover:text-black transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 border-b-2 border-neo-amber pb-4">
          <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber flex items-center justify-center text-neo-amber pixel-corners shrink-0">
            <Maximize className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-2xl font-pixel text-white uppercase">Fullscreen Mode</h3>
            <p className="text-sm text-gray-400">Mobile & iOS Optimization</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-gray-300 bg-black p-4 border-2 border-gray-800 pixel-corners">
          <p className="font-pixel text-xl text-neo-amber">Lưu ý cho thiết bị di động:</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="font-pixel text-2xl text-neo-cyan mt-0.5">1</span>
              <span>Nhấn nút <strong className="text-white inline-flex items-center gap-1"><Share className="w-4 h-4" /> Chia sẻ</strong> trên trình duyệt.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-pixel text-2xl text-neo-cyan mt-0.5">2</span>
              <span>Chọn <strong className="text-white inline-flex items-center gap-1"><PlusSquare className="w-4 h-4" /> Thêm vào MH chính</strong>.</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="font-pixel text-2xl text-neo-cyan mt-0.5">3</span>
              <span>Mở game từ màn hình chính để tận hưởng góc nhìn <strong className="text-neo-amber">toàn cảnh 100%</strong> chuẩn Arcade!</span>
            </div>
          </div>
        </div>

        <button onClick={onClose} className="btn-arcade w-full py-4 text-xl">
          ĐÃ HIỂU (CONTINUE)
        </button>
      </div>
    </div>
  );
};
