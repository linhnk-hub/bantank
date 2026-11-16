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
  Tablet,
  Shield,
  Users,
  Bot,
  Globe,
  Wifi,
  CheckCircle2,
  Keyboard,
} from 'lucide-react';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#050510]/88 backdrop-blur-md flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div className="bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-lg w-full max-w-2xl shadow-2xl overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between bg-[#050510]/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#FFB800]/15 border border-[#FFB800]/40 flex items-center justify-center text-[#FFB800]">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="support-modal-title" className="font-btn text-sm font-black uppercase tracking-wider text-[#EAF4FF]">
                {t('Hướng dẫn', 'How to Play & Guide')}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer"
            title={t('Đóng', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs text-neutral-300 leading-relaxed">
          {/* 1. Mục tiêu trận đấu */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2">
            <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
              <Shield className="w-4 h-4 shrink-0" />
              <span>{t('1. Luật chơi & Mục tiêu', '1. Rules & Objectives')}</span>
            </div>
            <ul className="space-y-1.5 text-neutral-300 pl-1">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span className="whitespace-pre-line">
                  <strong>{t('Bảo vệ căn cứ Đại bàng:', 'Protect Eagle Base:')}</strong>{' '}
                  {formatSentenceLineBreaks(
                    t(
                      'Căn cứ nằm ở chính giữa cạnh dưới bản đồ. Nếu Đại bàng bị trúng đạn của xe địch, trận đấu sẽ kết thúc ngay lập tức (Game Over).',
                      'The headquarters sits at the bottom center of the map. If an enemy shell hits the Eagle, the match ends immediately (Game Over).'
                    )
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>{t('Tiêu diệt toàn bộ đội quân xe địch:', 'Eliminate All Enemy Tanks:')}</strong>{' '}
                  {t(
                    'Tiêu diệt hết số xe tăng địch trong mỗi màn chơi để hoàn thành Stage và tiến sang chiến trường tiếp theo.',
                    'Destroy all 30 enemy tanks in each stage to clear the mission and unlock the next battlefield.'
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <strong>{t('Khiên bảo vệ:', 'Spawn Shield:')}</strong>{' '}
                  {t(
                    'Khi bắt đầu màn chơi hoặc vừa hồi sinh, xe tăng của bạn có 3 giây khiên bất tử (hiệu ứng hào quang nhấp nháy).',
                    'At stage start or respawn, your tank receives a 3-second invulnerability shield.'
                  )}
                </span>
              </li>
            </ul>
          </div>

          {/* 2. Hướng dẫn điều khiển đầy đủ: Bàn phím PC, Cảm ứng Mobile, Cảm ứng Tablet */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-3">
            <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
              <Gamepad2 className="w-4 h-4 shrink-0" />
              <span>
                {t(
                  '2. Hướng Dẫn Điều Khiển (PC, Điện Thoại & Máy Tính Bảng)',
                  '2. Controls Guide (PC, Smartphone & Tablet)'
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 2A. Bàn phím PC */}
              <div className="p-3 rounded bg-[#0b0d1e] border border-neutral-800 space-y-1.5">
                <div className="font-btn flex items-center gap-1.5 text-[#00F0FF] font-bold">
                  <Keyboard className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('Bàn phím PC', 'PC Keyboard')}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-neutral-300">
                  <li>
                    • <strong>{t('Di chuyển:', 'Move:')}</strong>{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">WASD</kbd> {t('hoặc', 'or')}{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">{t('Mũi tên', 'Arrows')}</kbd>
                  </li>
                  <li>
                    • <strong>{t('Bắn đạn:', 'Fire:')}</strong>{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">Space</kbd> {t('hoặc', 'or')}{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">J</kbd>
                  </li>
                  <li>
                    • <strong>{t('Tạm dừng:', 'Pause:')}</strong>{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">P</kbd> {t('hoặc', 'or')}{' '}
                    <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-[#FFB800] font-mono">ESC</kbd>
                  </li>
                </ul>
              </div>

              {/* 2B. Cảm ứng Mobile */}
              <div className="p-3 rounded bg-[#0b0d1e] border border-neutral-800 space-y-1.5">
                <div className="font-btn flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Smartphone className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('Cảm ứng Mobile', 'Mobile Touch')}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-neutral-300">
                  <li>
                    • <strong>{t('Chế độ Dọc:', 'Portrait Mode:')}</strong>{' '}
                    {t(
                      'Cụm phím ảo Joystick trái + Nút Khai Hỏa phải tách biệt bên dưới bản đồ.',
                      'Left Virtual Joystick + Right Single-Shot Fire button positioned below the battlefield.'
                    )}
                  </li>
                  <li>
                    • <strong>{t('Chế độ Ngang:', 'Landscape Mode:')}</strong>{' '}
                    {t(
                      'Bố cục 3 cột tiện dụng (Joystick bên trái, bản đồ ở giữa, nút Bắn bên phải).',
                      'Ergonomic 3-column layout (Joystick left, battlefield center, Fire button right).'
                    )}
                  </li>
                </ul>
              </div>

              {/* 2C. Cảm ứng Tablet */}
              <div className="p-3 rounded bg-[#0b0d1e] border border-neutral-800 space-y-1.5">
                <div className="font-btn flex items-center gap-1.5 text-[#FFB800] font-bold">
                  <Tablet className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('Cảm ứng Tablet', 'Tablet Touch')}</span>
                </div>
                <ul className="space-y-1 text-[11px] text-neutral-300">
                  <li>
                    • <strong>{t('Cụm điều khiển lớn:', 'Scaled Controls:')}</strong>{' '}
                    {t(
                      'Tự động mở rộng kích thước cần gạt Joystick và nút Khai Hỏa phù hợp màn hình lớn.',
                      'Automatically scales Joystick and Fire button dimensions for tablet screens.'
                    )}
                  </li>
                  <li>
                    • <strong>{t('Xoay tự động:', 'Auto Orientation:')}</strong>{' '}
                    {t(
                      'Tương thích mượt mà cả chiều dọc (Portrait) và chiều ngang (Landscape).',
                      'Seamlessly supports both Portrait and Landscape orientations.'
                    )}
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* 3. Phân biệt 3 chế độ chơi */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2.5">
            <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
              <Users className="w-4 h-4 shrink-0" />
              <span>{t('3. Các chế độ chơi', '3. Game Modes')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-neutral-800">
                <div className="font-btn font-bold text-[#FFB800] flex items-center gap-1.5 mb-1">
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>SOLO</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'Chiến đấu độc lập điều khiển chiến xa bảo vệ căn cứ và vượt qua các màn chơi.',
                    'Command Tank P1 solo to defend the headquarters and conquer all 10 campaign stages.'
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-neutral-800">
                <div className="font-btn font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>CO-OP AI</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'Sát cánh cùng đồng đội AI thông minh để bảo vệ căn cứ và vượt qua các màn chơi.',
                    'Fight alongside an intelligent AI Tank P2 partner to defend the base and clear stages.'
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-neutral-800">
                <div className="font-btn font-bold text-[#00F0FF] flex items-center gap-1.5 mb-1">
                  <Globe className="w-3.5 h-3.5" />
                  <span>CO-OP ONLINE</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'Tạo phòng hoặc nhập mã phòng 6 ký tự để phối hợp cùng người chơi P2 qua Internet.',
                    'Create a room or enter a 6-character BTxxxx code to team up with Player 2 online.'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 4. Xử lý sự cố cơ bản */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-1.5">
            <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
              <Wifi className="w-4 h-4 shrink-0" />
              <span>{t('4. Xử lý sự cố kết nối', '4. Connection Troubleshooting')}</span>
            </div>
            <ul className="space-y-1 text-[11px] text-neutral-300">
              <li className="whitespace-pre-line">
                • <strong>{t('Không mở được cửa sổ đăng nhập:', 'Login popup blocked:')}</strong>{' '}
                {formatSentenceLineBreaks(
                  t(
                    'Hãy kiểm tra và cho phép trình duyệt mở cửa sổ bật lên (Popup) trên trang bantank.online.',
                    'Please allow browser popups for bantank.online when signing in with Google.'
                  )
                )}
              </li>
              <li className="whitespace-pre-line">
                • <strong>{t('Thông báo tài khoản đang mở ở thiết bị khác:', 'Account active on another device:')}</strong>{' '}
                {formatSentenceLineBreaks(
                  t(
                    'Mỗi tài khoản Gmail chỉ online trên 1 thiết bị tại một thời điểm để bảo vệ tiến trình chơi. Nhấn Kết nối lại trên thiết bị bạn muốn sử dụng.',
                    'Each Gmail account is active on one device at a time to protect your progress. Click Reconnect on the device you want to use.'
                  )
                )}
              </li>
              <li className="whitespace-pre-line">
                • <strong>{t('Không tìm thấy phòng Co-op Online:', 'Co-op Online room not found:')}</strong>{' '}
                {formatSentenceLineBreaks(
                  t(
                    'Đảm bảo cả 2 người chơi nhập đúng mã phòng, chưa bắt đầu trận và chưa quá 15 phút chờ.',
                    'Ensure both players enter the exact room code before the match starts and within the 15-minute lobby window.'
                  )
                )}
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-neutral-800 bg-[#050510]/90 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="font-btn min-h-[44px] px-5 py-2 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs uppercase tracking-wider transition-all shadow active:scale-95 cursor-pointer"
          >
            {t('Đã hiểu & Đóng', 'Got It & Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
