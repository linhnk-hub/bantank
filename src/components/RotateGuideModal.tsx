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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 font-display">
      <div className="bg-black border-4 border-neo-amber pixel-corners p-8 max-w-sm w-full text-center flex flex-col items-center gap-6 shadow-[0_0_30px_rgba(255,184,0,0.4)]">
        <div className="relative w-24 h-24 flex items-center justify-center bg-black border-2 border-gray-700 pixel-corners">
          <Smartphone className="w-12 h-12 text-neo-amber animate-pulse" />
          <RotateCw className="w-6 h-6 text-neo-cyan absolute -top-2 -right-2 animate-spin" style={{ animationDuration: '4s' }} />
        </div>
        <div>
          <h3 className="font-pixel text-3xl text-white uppercase">ROTATE DEVICE</h3>
          <p className="text-sm text-gray-400 mt-2">Xoay ngang màn hình để trải nghiệm góc nhìn tối ưu và bộ điều khiển D-Pad + Bắn chuyên dụng.</p>
        </div>
        <button onClick={onClose} className="btn-arcade w-full py-4 text-xl">ACKNOWLEDGED</button>
      </div>
    </div>
  );
};
