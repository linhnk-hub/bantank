/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, HelpCircle, Gamepad2, Smartphone, Tablet, Shield, Users, Bot, Globe, Wifi, CheckCircle2, Keyboard } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 overflow-y-auto font-display select-none">
      <div className="bg-black border-4 border-neo-cyan rounded-sm w-full max-w-2xl shadow-[0_0_30px_rgba(0,240,255,0.4)] overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col pixel-corners">
        <div className="px-6 py-4 border-b-2 border-neo-cyan flex items-center justify-between bg-black shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-neo-cyan/20 border-2 border-neo-cyan flex items-center justify-center text-neo-cyan pixel-corners">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h2 className="font-pixel text-3xl text-white uppercase tracking-wider">
              OPERATING MANUAL
            </h2>
          </div>
          <button onClick={onClose} className="p-2 border-2 border-gray-700 hover:border-neo-cyan text-gray-400 hover:text-neo-cyan transition-colors pixel-corners">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto text-sm text-gray-300 leading-relaxed scrollbar-thin">
          <div className="bg-black border-2 border-gray-800 p-4 pixel-corners space-y-3">
            <div className="flex items-center gap-2 font-pixel text-2xl text-neo-amber uppercase">
              <Shield className="w-5 h-5 shrink-0" />
              <span>1. MISSION OBJECTIVES</span>
            </div>
            <ul className="space-y-2 pl-2">
              <li className="flex items-start gap-3">
                <span className="text-neo-amber font-pixel text-xl mt-0.5">X</span>
                <span><strong>Bảo vệ Căn cứ Đại Bàng:</strong> Căn cứ nằm ở chính giữa cạnh dưới bản đồ. Nếu Đại Bàng bị trúng đạn của xe địch, trận đấu sẽ kết thúc ngay lập tức (Game Over).</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-neo-amber font-pixel text-xl mt-0.5">X</span>
                <span><strong>Tiêu diệt toàn bộ đội quân xe địch:</strong> Tiêu diệt hết số xe tăng địch trong mỗi màn chơi để hoàn thành Stage và tiến sang chiến trường tiếp theo.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-neo-amber font-pixel text-xl mt-0.5">X</span>
                <span><strong>Khiên bảo vệ:</strong> Khi bắt đầu màn chơi hoặc vừa hồi sinh, xe tăng của bạn có <strong>3 giây</strong> khiên bất tử (hiệu ứng hào quang nhấp nháy).</span>
              </li>
            </ul>
          </div>

          <div className="bg-black border-2 border-gray-800 p-4 pixel-corners space-y-4">
            <div className="flex items-center gap-2 font-pixel text-2xl text-neo-cyan uppercase">
              <Gamepad2 className="w-5 h-5 shrink-0" />
              <span>2. CONTROLS INTERFACE</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-900 border-2 border-gray-700 pixel-corners space-y-2">
                <div className="flex items-center gap-2 text-white font-pixel text-xl"><Keyboard className="w-4 h-4" /> PC</div>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• <strong>Move:</strong> <kbd className="text-neo-cyan font-mono">WASD</kbd> or <kbd className="text-neo-cyan font-mono">Arrows</kbd></li>
                  <li>• <strong>Fire:</strong> <kbd className="text-neo-rose font-mono">Space</kbd> or <kbd className="text-neo-rose font-mono">J</kbd></li>
                  <li>• <strong>Pause:</strong> <kbd className="text-neo-amber font-mono">P</kbd> or <kbd className="text-neo-amber font-mono">ESC</kbd></li>
                </ul>
              </div>
              <div className="p-4 bg-gray-900 border-2 border-gray-700 pixel-corners space-y-2">
                <div className="flex items-center gap-2 text-white font-pixel text-xl"><Smartphone className="w-4 h-4" /> MOBILE</div>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• <strong>Dọc:</strong> Joystick trái + Nút Bắn phải tách biệt dưới map.</li>
                  <li>• <strong>Ngang:</strong> Bố cục 3 cột (Joy - Map - Fire) tối ưu 2 ngón cái.</li>
                </ul>
              </div>
              <div className="p-4 bg-gray-900 border-2 border-gray-700 pixel-corners space-y-2">
                <div className="flex items-center gap-2 text-white font-pixel text-xl"><Tablet className="w-4 h-4" /> TABLET</div>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• <strong>Auto Scale:</strong> Điều khiển tự mở rộng trên màn hình lớn.</li>
                  <li>• <strong>Multi-touch:</strong> Vừa di chuyển vừa bắn liên tục không trễ.</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-black border-2 border-gray-800 p-4 pixel-corners space-y-3">
            <div className="flex items-center gap-2 font-pixel text-2xl text-neo-rose uppercase">
              <Users className="w-5 h-5 shrink-0" />
              <span>3. COMBAT MODES</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 bg-gray-900 border-2 border-gray-700 pixel-corners">
                <div className="font-pixel text-xl text-neo-amber flex items-center gap-2 mb-2"><Gamepad2 className="w-4 h-4" /> 1. SOLO</div>
                <p className="text-gray-400">Chiến đấu độc lập điều khiển Chiến xa P1 bảo vệ căn cứ và vượt qua các màn chơi.</p>
              </div>
              <div className="p-3 bg-gray-900 border-2 border-gray-700 pixel-corners">
                <div className="font-pixel text-xl text-neo-cyan flex items-center gap-2 mb-2"><Bot className="w-4 h-4" /> 2. CO-OP AI</div>
                <p className="text-gray-400">Sát cánh cùng đồng đội máy P2 thông minh tự động tìm đường, bọc lót căn cứ và tiêu diệt xe địch.</p>
              </div>
              <div className="p-3 bg-gray-900 border-2 border-gray-700 pixel-corners">
                <div className="font-pixel text-xl text-neo-rose flex items-center gap-2 mb-2"><Globe className="w-4 h-4" /> 3. ONLINE</div>
                <p className="text-gray-400">Tạo phòng hoặc nhập mã phòng 6 ký tự để phối hợp cùng 1 người chơi thật thứ hai qua Internet.</p>
              </div>
            </div>
          </div>

          <div className="bg-black border-2 border-gray-800 p-4 pixel-corners space-y-2">
            <div className="flex items-center gap-2 font-pixel text-2xl text-green-400 uppercase">
              <Wifi className="w-5 h-5 shrink-0" />
              <span>4. TROUBLESHOOTING</span>
            </div>
            <ul className="space-y-1 text-xs text-gray-400">
              <li>• <strong>Không mở được cửa sổ đăng nhập Google:</strong> Hãy kiểm tra và cho phép trình duyệt mở cửa sổ bật lên (Popup) trên trang <strong>bantank.online</strong>.</li>
              <li>• <strong>Thông báo tài khoản đang mở ở thiết bị khác:</strong> Mỗi tài khoản Gmail chỉ hoạt động trên 1 thiết bị tại một thời điểm để bảo vệ tiến trình chơi. Nhấn <em>Kết nối lại</em> trên thiết bị bạn muốn sử dụng.</li>
              <li>• <strong>Không tìm thấy phòng Co-op Online:</strong> Đảm bảo cả 2 người chơi nhập đúng mã phòng 6 ký tự, phòng chưa bắt đầu trận và chưa quá 15 phút chờ.</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 border-t-2 border-neo-cyan bg-black flex items-center justify-end shrink-0">
          <button onClick={onClose} className="btn-arcade px-8 py-3 text-xl">ACKNOWLEDGE</button>
        </div>
      </div>
    </div>
  );
};
