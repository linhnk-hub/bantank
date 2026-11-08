/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
  HelpCircle,
  Gamepad2,
  Smartphone,
  Shield,
  Users,
  Bot,
  Globe,
  Wifi,
  CheckCircle2,
} from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="support-modal-title" className="text-sm font-black uppercase tracking-wider text-white">
                Trung Tâm Hỗ Trợ & Hướng Dẫn
              </h2>
              <p className="text-[11px] text-neutral-400">
                Hướng dẫn cách chơi, điều khiển và khắc phục sự cố cơ bản
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-neutral-300 leading-relaxed">
          {/* 1. Mục tiêu trận đấu */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-amber-400 font-black uppercase tracking-wider">
              <Shield className="w-4 h-4 shrink-0" />
              <span>1. Luật Chơi & Mục Tiêu Chiến Dịch</span>
            </div>
            <ul className="space-y-1.5 text-neutral-300 pl-1">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Bảo vệ Căn cứ Đại Bàng:</strong> Căn cứ nằm ở chính giữa cạnh dưới bản đồ. Nếu Đại Bàng bị trúng đạn của xe địch, trận đấu sẽ kết thúc ngay lập tức (Game Over).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tiêu diệt toàn bộ đội quân xe địch:</strong> Tiêu diệt hết số xe tăng địch trong mỗi màn chơi để hoàn thành Stage và tiến sang chiến trường tiếp theo.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Khiên bảo vệ:</strong> Khi bắt đầu màn chơi hoặc vừa hồi sinh, xe tăng của bạn có <strong>3 giây</strong> khiên bất tử (hiệu ứng hào quang nhấp nháy).
                </span>
              </li>
            </ul>
          </div>

          {/* 2. Điều khiển trên PC & Điện thoại / Tablet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-sky-400 font-black uppercase tracking-wider">
                <Gamepad2 className="w-4 h-4 shrink-0" />
                <span>2A. Điều Khiển Máy Tính (PC)</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-300">
                <li>• <strong>Di chuyển:</strong> Phím <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">W A S D</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">↑ ↓ ← →</kbd></li>
                <li>• <strong>Khai hỏa:</strong> Phím <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">SPACE</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">J</kbd> (giữ để bắn liên thanh)</li>
                <li>• <strong>Tạm dừng:</strong> Phím <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">P</kbd> hoặc <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-amber-300 font-mono">ESC</kbd></li>
              </ul>
            </div>

            <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-black uppercase tracking-wider">
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>2B. Điện Thoại & Máy Tính Bảng</span>
              </div>
              <ul className="space-y-1 text-[11px] text-neutral-300">
                <li>• <strong>Cần gạt ảo (Joystick trái):</strong> Chạm và kéo theo 4 hướng Lên, Xuống, Trái, Phải để điều hướng xe tăng.</li>
                <li>• <strong>Nút KHAI HỎA (Phải):</strong> Chạm hoặc nhấn giữ nút đỏ để bắn đạn liên tục.</li>
                <li>• <strong>Tạm dừng / Cài đặt:</strong> Nhấn biểu tượng trên thanh công cụ phía trên bản đồ.</li>
              </ul>
            </div>
          </div>

          {/* 3. Phân biệt 3 chế độ chơi */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-black uppercase tracking-wider">
              <Users className="w-4 h-4 shrink-0" />
              <span>3. Các Chế Độ Chiến Đấu</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <div className="font-bold text-amber-300 flex items-center gap-1.5 mb-1">
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>1. SOLO (1 Người)</span>
                </div>
                <p className="text-neutral-400">
                  Chiến đấu độc lập điều khiển Chiến xa P1 bảo vệ căn cứ và vượt qua các màn chơi.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>2. CO-OP AI</span>
                </div>
                <p className="text-neutral-400">
                  Sát cánh cùng đồng đội máy P2 thông minh tự động tìm đường, bọc lót căn cứ và tiêu diệt xe địch.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-neutral-900 border border-neutral-800">
                <div className="font-bold text-sky-300 flex items-center gap-1.5 mb-1">
                  <Globe className="w-3.5 h-3.5" />
                  <span>3. CO-OP ONLINE</span>
                </div>
                <p className="text-neutral-400">
                  Tạo phòng hoặc nhập mã phòng 6 ký tự để phối hợp cùng 1 người chơi thật thứ hai qua Internet.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Xử lý sự cố cơ bản */}
          <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 font-black uppercase tracking-wider">
              <Wifi className="w-4 h-4 shrink-0" />
              <span>4. Xử Lý Sự Cố Đăng Nhập & Kết Nối</span>
            </div>
            <ul className="space-y-1 text-[11px] text-neutral-300">
              <li>• <strong>Không mở được cửa sổ đăng nhập Google:</strong> Hãy kiểm tra và cho phép trình duyệt mở cửa sổ bật lên (Popup) trên trang <strong>bantank.online</strong>.</li>
              <li>• <strong>Thông báo tài khoản đang mở ở thiết bị khác:</strong> Mỗi tài khoản Gmail chỉ hoạt động trên 1 thiết bị tại một thời điểm để bảo vệ tiến trình chơi. Nhấn <em>Kết nối lại</em> trên thiết bị bạn muốn sử dụng.</li>
              <li>• <strong>Không tìm thấy phòng Co-op Online:</strong> Đảm bảo cả 2 người chơi nhập đúng mã phòng 6 ký tự, phòng chưa bắt đầu trận và chưa quá 15 phút chờ.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-neutral-800 bg-neutral-950/70 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider transition-all shadow active:scale-95"
          >
            Đã Hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
