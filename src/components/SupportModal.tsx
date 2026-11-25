/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  X,
  Info,
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
  Lock,
  Mail,
  Swords,
  MessageSquare,
} from 'lucide-react';
import { formatSentenceLineBreaks } from '../core/textFormat.ts';
import { useLanguage } from '../core/i18n.ts';

export type SupportTabId = 'ABOUT' | 'POLICY' | 'GUIDE';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SupportTabId;
}

export const SupportModal: React.FC<SupportModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'ABOUT',
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<SupportTabId>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[75] bg-[#050510]/92 flex items-start justify-center pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] px-3 sm:px-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div className="bg-[#0b0d1e] border-2 border-[#00F0FF]/50 rounded-xl w-full max-w-2xl shadow-[0_0_32px_rgba(0,0,0,0.85)] overflow-hidden max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col animate-neo-fade-in">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-[#00F0FF]/25 flex items-center justify-between gap-2 bg-[#050510]/95 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F0FF]/15 border border-[#00F0FF]/45 flex items-center justify-center text-[#00F0FF] shrink-0">
              <Info className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="support-modal-title"
                className="font-btn text-sm sm:text-base font-black uppercase tracking-wider text-[#EAF4FF]"
              >
                {t('Thông tin', 'Information')}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={t('Đóng', 'Close')}
            aria-label={t('Đóng', 'Close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Tab Navigation Bar: Giới thiệu | Chính sách | Hướng dẫn */}
        <div
          data-testid="support-modal-tabs"
          className="grid grid-cols-3 gap-1.5 px-3 sm:px-5 py-2.5 bg-[#050510]/95 border-b border-neutral-800 shrink-0"
        >
          <button
            type="button"
            data-testid="support-tab-about"
            onClick={() => setActiveTab('ABOUT')}
            className={`font-btn min-h-[40px] px-2 py-1.5 rounded text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'ABOUT'
                ? 'bg-[#FFB800] text-[#050510] shadow-[0_0_12px_rgba(255,184,0,0.35)]'
                : 'bg-[#0b0d1e] text-[#EAF4FF] border border-[#687386]/40 hover:border-[#FFB800]/60'
            }`}
          >
            <span>{t('Giới thiệu', 'About')}</span>
          </button>

          <button
            type="button"
            data-testid="support-tab-policy"
            onClick={() => setActiveTab('POLICY')}
            className={`font-btn min-h-[40px] px-2 py-1.5 rounded text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'POLICY'
                ? 'bg-[#00F0FF] text-[#050510] shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                : 'bg-[#0b0d1e] text-[#EAF4FF] border border-[#687386]/40 hover:border-[#00F0FF]/60'
            }`}
          >
            <span>{t('Chính sách', 'Policy')}</span>
          </button>

          <button
            type="button"
            data-testid="support-tab-guide"
            onClick={() => setActiveTab('GUIDE')}
            className={`font-btn min-h-[40px] px-2 py-1.5 rounded text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer ${
              activeTab === 'GUIDE'
                ? 'bg-[#FFB800] text-[#050510] shadow-[0_0_12px_rgba(255,184,0,0.35)]'
                : 'bg-[#0b0d1e] text-[#EAF4FF] border border-[#687386]/40 hover:border-[#FFB800]/60'
            }`}
          >
            <span>{t('Hướng dẫn', 'Guide')}</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs sm:text-sm text-neutral-300 leading-relaxed">
          {/* TAB 1: GIỚI THIỆU */}
          {activeTab === 'ABOUT' && (
            <div className="space-y-3.5" data-testid="support-panel-about">
              <div className="bg-[#050510]/85 border border-[#FFB800]/35 rounded-lg p-3.5 space-y-2">
                <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
                  <svg
                    viewBox="0 0 32 32"
                    className="w-5 h-5 shrink-0"
                    style={{ shapeRendering: 'crispEdges' }}
                    aria-hidden="true"
                  >
                    <rect x="4" y="6" width="4" height="20" fill="#B45309" />
                    <rect x="4" y="8" width="2" height="3" fill="#FBBF24" />
                    <rect x="4" y="14" width="2" height="3" fill="#FBBF24" />
                    <rect x="4" y="20" width="2" height="3" fill="#FBBF24" />
                    <rect x="24" y="6" width="4" height="20" fill="#B45309" />
                    <rect x="26" y="8" width="2" height="3" fill="#FBBF24" />
                    <rect x="26" y="14" width="2" height="3" fill="#FBBF24" />
                    <rect x="26" y="20" width="2" height="3" fill="#FBBF24" />
                    <rect x="8" y="8" width="16" height="16" fill="#D97706" />
                    <rect x="10" y="10" width="12" height="12" fill="#F59E0B" />
                    <rect x="14" y="2" width="4" height="9" fill="#D97706" />
                    <rect x="15" y="2" width="2" height="8" fill="#FDE68A" />
                    <rect x="12" y="12" width="8" height="8" fill="#92400E" />
                    <rect x="14" y="14" width="4" height="4" fill="#FEF3C7" />
                  </svg>
                  <span>{t('Bắn Tank Online – CHIẾN TRƯỜNG HUYỀN THOẠI', 'Bắn Tank Online – LEGENDARY BATTLEFIELD')}</span>
                </div>
                <p className="text-neutral-200">
                  {t(
                    'Trò chơi bắn xe tăng cổ điển được tái hiện trực tiếp trên trình duyệt với đồ họa Neo-Retro sắc nét, tốc độ 60 FPS mượt mà trên cả máy tính, điện thoại và máy tính bảng.',
                    'The classic tank battle game reimagined directly in your browser with crisp Neo-Retro visuals and smooth 60 FPS gameplay across PC, mobile, and tablet.'
                  )}
                </p>
              </div>

              <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2">
                <div className="font-btn flex items-center gap-2 text-[#00F0FF] font-black uppercase tracking-wider">
                  <Gamepad2 className="w-4 h-4 shrink-0" />
                  <span>{t('Tính năng nổi bật', 'Key Features')}</span>
                </div>
                <ul className="space-y-1.5 text-neutral-300 pl-1">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('Chiến dịch 10 Màn:', '10-Stage Campaign:')}</strong>{' '}
                      {t(
                        'Mỗi màn chơi gồm 30 xe tăng địch (Basic Tank, Fast Tank, Power Tank, Armor Tank) với địa hình chiến thuật đa dạng.',
                        'Each stage features 30 enemy tanks (Basic Tank, Fast Tank, Power Tank, Armor Tank) across tactical terrains.'
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('3 Nhóm Chế độ Chiến đấu (SOLO • CO-OP • VS ONLINE):', '3 Battle Mode Groups (SOLO • CO-OP • VS ONLINE):')}</strong>{' '}
                      {t(
                        'SOLO vào trận trực tiếp; CO-OP gồm CO-OP A.I và CO-OP ONLINE (2 thiết bị); VS ONLINE đối kháng trực tuyến trên 2 thiết bị riêng biệt (P1 vs P2 và P1 + A.I vs P2 + A.I).',
                        'SOLO launches directly into battle; CO-OP includes CO-OP A.I and 2-device CO-OP ONLINE; VS ONLINE offers real-time 2-device PvP (P1 vs P2 and P1 + A.I vs P2 + A.I).'
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('Hệ thống Xã hội & Kết bạn:', 'Social & Friends System:')}</strong>{' '}
                      {t(
                        'Hiển thị người chơi đang Online, Chat chung thời gian thực, tìm kiếm tài khoản Online/Offline, quản lý Bạn bè (kết bạn, lời mời, xóa bạn, mời vào phòng), Chat riêng 1-1 và Chặn người chơi.',
                        'Live Online presence, real-time Global Chat, Online/Offline account search, Friends management (requests, unfriend, room invites), 1-on-1 Private Chat, and independent Block controls.'
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{t('Hệ thống 17 Cấp bậc Quân hàm & Sao ⭐:', '17 Military Ranks & Star ⭐ Economy:')}</strong>{' '}
                      {t(
                        'Tích lũy điểm Kinh nghiệm (XP) qua từng trận chiến dịch, thăng tiến từ Binh nhì lên Đại tướng và tự động quy đổi 25 XP = 1 Sao ⭐ theo tài khoản Google cá nhân.',
                        'Earn Experience (XP) across campaign matches, advance from Private to General across 17 military ranks, and auto-convert 25 XP = 1 Star ⭐ synced to your Google account.'
                      )}
                    </span>
                  </li>
                </ul>
                <div className="pt-2 border-t border-neutral-800/80">
                  <a
                    href="/landing.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="support-about-details-link"
                    className="inline-flex items-center text-[#FFB800] hover:text-amber-300 font-bold underline"
                  >
                    {t('[Chi tiết]', '[Details]')}
                  </a>
                </div>
              </div>

              <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2">
                <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>{t('Liên hệ', 'Contact')}</span>
                </div>
                <div className="space-y-2 text-neutral-300">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{t('Email liên hệ:', 'Contact Email:')}</span>
                    <a
                      href="mailto:admin@bantank.online"
                      className="text-[#00F0FF] hover:text-cyan-300 font-bold underline"
                    >
                      admin@bantank.online
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CHÍNH SÁCH QUYỀN RIÊNG TƯ */}
          {activeTab === 'POLICY' && (
            <div className="space-y-3.5" data-testid="support-panel-policy">
              <div className="bg-[#050510]/85 border border-[#00F0FF]/35 rounded-lg p-3.5 space-y-2">
                <div className="font-btn flex items-center gap-2 text-[#00F0FF] font-black uppercase tracking-wider">
                  <Lock className="w-4 h-4 shrink-0" />
                  <span>{t('1. Dữ liệu Tài khoản & Xác thực', '1. Account Data & Authentication')}</span>
                </div>
                <p className="text-neutral-200">
                  {t(
                    'Trò chơi sử dụng xác thực Google OAuth chính thức (Firebase Authentication). Hệ thống chỉ ghi nhận UID, địa chỉ Gmail cá nhân, tên hiển thị và ảnh đại diện bạn chọn để đồng bộ tiến trình màn chơi và cấp độ.',
                    'The game uses official Google OAuth (Firebase Authentication). We only store your UID, personal Gmail address, display name, and chosen avatar to sync stage progression and level.'
                  )}
                </p>
              </div>

              <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2">
                <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>{t('2. Bảo vệ Phiên đăng nhập & Co-op', '2. Single Login Session & Co-op Security')}</span>
                </div>
                <ul className="space-y-1.5 text-neutral-300 pl-1">
                  <li>
                    • <strong>{t('Một thiết bị tại một thời điểm:', 'Single Active Device:')}</strong>{' '}
                    {t(
                      'Mỗi tài khoản chỉ hoạt động trên 1 thiết bị cùng lúc nhằm chống xung đột dữ liệu XP và tiến độ Màn chơi.',
                      'Each account is active on one device at a time to prevent XP and stage progression conflicts.'
                    )}
                  </li>
                  <li>
                    • <strong>{t('Kết nối P2P Co-op Online:', 'P2P Co-op Online:')}</strong>{' '}
                    {t(
                      'Chế độ 2 người trực tuyến sử dụng WebRTC DataChannel để đồng bộ trạng thái trận đấu thời gian thực và tự động hủy phòng khi kết thúc.',
                      'Online 2-player mode uses WebRTC DataChannel for real-time match sync and automatically cleans up rooms after completion.'
                    )}
                  </li>
                  <li>
                    • <strong>{t('Cam kết quyền riêng tư:', 'Privacy Commitment:')}</strong>{' '}
                    {t(
                      'Không chia sẻ dữ liệu cá nhân cho bên thứ ba, không chạy quảng cáo theo dõi.',
                      'We never sell or share personal data with third parties and do not run tracking ads.'
                    )}
                  </li>
                </ul>
                <div className="pt-2 border-t border-neutral-800/80">
                  <a
                    href="/privacy.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="support-policy-details-link"
                    className="inline-flex items-center text-[#00F0FF] hover:text-cyan-300 font-bold underline"
                  >
                    {t('[Chi tiết]', '[Details]')}
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HƯỚNG DẪN */}
          {activeTab === 'GUIDE' && (
            <>
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
                    'Tiêu diệt hết số xe tăng địch trong mỗi màn chơi để hoàn thành và tiến sang chiến trường tiếp theo.',
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
                    • <strong>{t('Tạm dừng / Thoát:', 'Pause / Exit:')}</strong>{' '}
                    {t(
                      'SOLO & CO-OP A.I dùng phím P / ESC hoặc nút 3 gạch để tạm dừng. CO-OP ONLINE & VS ONLINE không tạm dừng — dùng nút Thoát trên thanh đầu trang.',
                      'SOLO & CO-OP A.I use P / ESC or the hamburger menu to pause. CO-OP ONLINE & VS ONLINE cannot be paused — use the top Exit button.'
                    )}
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

          {/* 3. Phân biệt các chế độ chơi (SOLO, CO-OP A.I, CO-OP ONLINE, VS ONLINE) */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2.5">
            <div className="font-btn flex items-center gap-2 text-[#FFB800] font-black uppercase tracking-wider">
              <Users className="w-4 h-4 shrink-0" />
              <span>{t('3. Các chế độ chơi & Màu xe tăng VS', '3. Game Modes & VS Tank Colors')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-neutral-800">
                <div className="font-btn font-bold text-[#FFB800] flex items-center gap-1.5 mb-1">
                  <Gamepad2 className="w-3.5 h-3.5" />
                  <span>SOLO</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'Nhấn SOLO từ màn hình chính để vào trận ngay. Chiến đấu độc lập bảo vệ căn cứ Đại Bàng qua 10 màn chiến dịch.',
                    'Tap SOLO on Home to enter battle directly. Defend the Eagle Base solo across 10 campaign stages.'
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-neutral-800">
                <div className="font-btn font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>CO-OP A.I</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'Sát cánh cùng đồng đội A.I thông minh để bảo vệ căn cứ. Hỗ trợ tạm dừng bằng nút 3 gạch hoặc P / ESC.',
                    'Fight alongside an intelligent A.I partner to defend the base. Supports pause via hamburger menu or P / ESC.'
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
                    'Tạo phòng hoặc nhập mã phòng 4 chữ số cùng người chơi P2 trên 2 thiết bị riêng. Không tạm dừng; dùng nút Thoát để rời trận.',
                    'Create or join a 4-digit room with Player 2 on 2 separate devices. No pause; use Exit to leave match.'
                  )}
                </p>
              </div>
              <div className="p-2.5 rounded bg-[#0b0d1e] border border-[#FF0055]/40">
                <div className="font-btn font-bold text-[#FF0055] flex items-center gap-1.5 mb-1">
                  <Swords className="w-3.5 h-3.5" />
                  <span>VS ONLINE (2 Thiết bị)</span>
                </div>
                <p className="text-neutral-400">
                  {t(
                    'P1 vs P2 và P1 + A.I vs P2 + A.I trên 2 thiết bị riêng (Host = P1 Đỏ, AI_1 = Xanh biển nhạt, Guest = P2 Vàng, AI_2 = Xám). 2 phút, 3 mạng, Sudden Death thu hẹp mỗi 20s, không hòa. Rời trận sẽ xử thắng đối thủ ("Đối thủ đã rời trận").',
                    'P1 vs P2 and P1 + A.I vs P2 + A.I across 2 devices (Host = Red P1, Light Sky AI_1, Guest = Yellow P2, Gray AI_2). 2 min, 3 lives, 20s Sudden Death shrink, no draw. Leaving forfeits ("Opponent left the match").'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* 4. Hệ thống Xã hội, Chat & Bạn bè */}
          <div className="bg-[#050510]/85 border border-neutral-800 rounded-lg p-3.5 space-y-2">
            <div className="font-btn flex items-center gap-2 text-[#00F0FF] font-black uppercase tracking-wider">
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span>{t('4. Online, Chat chung, Tìm kiếm & Bạn bè', '4. Online, Global Chat, Search & Friends')}</span>
            </div>
            <ul className="space-y-1 text-[11px] text-neutral-300">
              <li>
                • <strong>{t('Nút Online nổi:', 'Floating Online Button:')}</strong>{' '}
                {t(
                  'Xem danh sách người chơi đang Online, trò chuyện tại Chat chung (tối đa 300 ký tự) hoặc tìm tài khoản Online/Offline theo tên hoặc mã người chơi.',
                  'View Online players, chat in real-time Global Chat (max 300 chars), or search Online/Offline players by display name or player tag.'
                )}
              </li>
              <li>
                • <strong>{t('Mục Bạn bè trên Menu đầu trang:', 'Top Menu Friends Hub:')}</strong>{' '}
                {t(
                  'Quản lý 4 tab (Bạn bè, Lời mời nhận, Lời mời gửi, Đã xóa bạn), gửi lời mời vào phòng và mở Chat riêng 1-1.',
                  'Manage 4 tabs (Friends, Received, Sent, Deleted Friends), send room invites, and open 1-on-1 Private Chat.'
                )}
              </li>
              <li>
                • <strong>{t('Chặn & Xóa bạn độc lập:', 'Independent Block & Unfriend:')}</strong>{' '}
                {t(
                  'Xóa bạn không xóa lịch sử chat và không tự động Chặn; Chặn sẽ khóa tin nhắn riêng nhưng vẫn giữ nguyên lịch sử trò chuyện.',
                  'Unfriending preserves chat history and does not auto-Block; Blocking restricts private messages without deleting chat history.'
                )}
              </li>
            </ul>
          </div>

          {/* 5. Xử lý sự cố cơ bản */}
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-neutral-800 bg-[#050510]/95 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="font-btn min-h-[42px] px-5 py-2 rounded-lg bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs uppercase tracking-wider transition-all shadow active:scale-95 cursor-pointer"
          >
            {t('Đóng', 'Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
