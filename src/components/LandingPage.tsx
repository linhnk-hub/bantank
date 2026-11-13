/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Play, Gamepad2, Shield, Users, Bot, Globe, Clock, Trophy, Volume2, Smartphone, Keyboard, Tablet, CheckCircle2, Menu, X, AlertCircle, Sparkles, FileText, Mail, ExternalLink, Crosshair, Award, Layers } from 'lucide-react';

export const LANDING_SUPPORT_CONTACT = {
  brandName: 'Bắn Tank Online',
  officialDomain: 'https://bantank.online/',
  supportEmail: 'admin@bantank.online',
  privacyPolicyUrl: '/privacy.html',
  copyrightYear: 2026,
} as const;

export interface LandingPageProps {
  currentUser?: { uid?: string; email: string | null; displayName?: string | null; photoURL?: string | null; } | null;
  onSignIn: () => Promise<void> | void;
  onEnterGame?: () => void;
  onStartTrialMode?: () => void;
  isProcessing?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onClearFeedback?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser = null, onSignIn, onEnterGame, onStartTrialMode, isProcessing = false, errorMessage = null, successMessage = null, onClearFeedback,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = Boolean(currentUser);

  const handlePrimaryPlayAction = () => {
    if (onClearFeedback) onClearFeedback();
    if (isAuthenticated && onEnterGame) { onEnterGame(); return; }
    void onSignIn();
  };

  const handleTrialAction = () => {
    if (onClearFeedback) onClearFeedback();
    if (onStartTrialMode) onStartTrialMode();
  };

  return (
    <div className="min-h-[100dvh] w-full bg-neo-bg text-neutral-100 font-display selection:bg-neo-amber selection:text-black overflow-x-hidden flex flex-col justify-start">
      <div className="crt-overlay"></div>
      
      <header className="sticky top-0 z-40 w-full bg-neo-bg/90 backdrop-blur-md border-b-2 border-neo-amber/50 pt-[env(safe-area-inset-top)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-3 group focus:outline-none">
            <img src="/logo-bantank.png" alt="Logo" className="w-10 h-10 sm:w-11 sm:h-11 object-contain pixel-corners border-2 border-neo-amber bg-black p-1 shadow-[0_0_10px_rgba(255,184,0,0.5)] group-hover:border-white transition-colors" />
            <div className="flex flex-col">
              <span className="text-base sm:text-2xl font-pixel uppercase tracking-wider text-white group-hover:text-neo-amber transition-colors glitch-text">Bắn Tank Online</span>
              <span className="text-[10px] text-neo-cyan font-bold hidden sm:inline uppercase">Tactical Warfare 60Hz</span>
            </div>
          </a>
          
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-bold text-gray-400 uppercase tracking-widest">
            <a href="#gioi-thieu" className="hover:text-neo-amber transition-colors py-1">Intel</a>
            <a href="#tinh-nang" className="hover:text-neo-amber transition-colors py-1">Specs</a>
            <a href="#che-do-choi" className="hover:text-neo-amber transition-colors py-1">Modes</a>
            <a href="#huong-dan" className="hover:text-neo-amber transition-colors py-1">Manual</a>
          </nav>
          
          <div className="hidden sm:flex items-center gap-3">
            {!isAuthenticated && onStartTrialMode && (
              <button type="button" onClick={handleTrialAction} disabled={isProcessing} className="px-4 py-2 bg-black border-2 border-neo-cyan text-neo-cyan font-pixel text-lg hover:bg-neo-cyan hover:text-black transition-colors">TRIAL</button>
            )}
            <button type="button" onClick={handlePrimaryPlayAction} disabled={isProcessing} className="btn-arcade px-6 py-2 font-pixel text-lg flex items-center gap-2">
              <Play className="w-4 h-4 fill-current" /> {isProcessing ? 'AUTH...' : isAuthenticated ? 'ENTER' : 'START'}
            </button>
          </div>
          
          <div className="flex items-center gap-2 sm:hidden">
            <button type="button" onClick={handlePrimaryPlayAction} disabled={isProcessing} className="btn-arcade px-3 py-1 font-pixel text-lg">START</button>
            <button type="button" onClick={() => setMobileMenuOpen((v) => !v)} className="p-2 bg-black border-2 border-neo-amber text-neo-amber">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1 relative">
        <section className="relative py-16 lg:py-28 overflow-hidden border-b-4 border-neo-amber">
          <div className="tactical-grid-bg absolute inset-0"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center flex flex-col items-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 border-2 border-neo-cyan bg-neo-cyan/10 text-neo-cyan text-sm font-pixel uppercase tracking-widest animate-pulse">
              <span>[ SYSTEM ONLINE - 60Hz TICKRATE ]</span>
            </div>
            <h1 className="font-pixel text-6xl sm:text-8xl lg:text-[100px] uppercase text-white mb-6 glitch-text leading-none">
              BẮN TANK <br className="sm:hidden" /><span className="text-neo-amber drop-shadow-[0_0_20px_rgba(255,184,0,0.8)]">ONLINE</span>
            </h1>
            <p className="font-display text-base sm:text-xl text-gray-300 font-medium max-w-2xl mb-10 border-l-4 border-neo-rose pl-4 text-left sm:text-center sm:border-l-0 sm:pl-0 mx-auto">
              Chiến trường 2D thời gian thực. Điều khiển chiến xa tiêu diệt 30 xe địch. Cứu căn cứ trước khi đồng hồ điểm 00:00. 
            </p>
            <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto">
              <button type="button" onClick={handlePrimaryPlayAction} disabled={isProcessing} className="btn-arcade px-10 py-5 font-pixel text-2xl sm:text-3xl flex items-center justify-center gap-3 w-full sm:w-auto">
                <Play className="w-6 h-6 fill-current" /> INSERT COIN
              </button>
              {onStartTrialMode && (
                <button type="button" onClick={handleTrialAction} disabled={isProcessing} className="btn-arcade-outline px-10 py-5 font-pixel text-2xl sm:text-3xl w-full sm:w-auto">
                  FREE TRIAL
                </button>
              )}
            </div>
          </div>
        </section>

        <section id="gioi-thieu" className="py-16 lg:py-24 bg-neo-bg border-b-2 border-neutral-900 scroll-mt-20 relative">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12">
              <h2 className="font-pixel text-4xl sm:text-5xl text-neo-amber mb-4">{">"} INTEL_BRIEFING</h2>
              <p className="text-gray-400 font-display">Chiến thuật 2D Top-Down cổ điển giao thoa với công nghệ WebRTC hiện đại.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <article className="bg-black border-2 border-neutral-800 p-6 pixel-corners hover:border-neo-amber transition-colors group">
                <div className="font-pixel text-5xl text-neutral-800 group-hover:text-neo-amber mb-4">01</div>
                <h3 className="font-display font-bold text-xl text-white mb-2 uppercase">Mục tiêu & Luật chơi</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Tiêu diệt toàn bộ 30 xe địch. Bảo vệ Căn Cứ. Tránh hết thời gian.</p>
              </article>
              <article className="bg-black border-2 border-neutral-800 p-6 pixel-corners hover:border-neo-cyan transition-colors group">
                <div className="font-pixel text-5xl text-neutral-800 group-hover:text-neo-cyan mb-4">02</div>
                <h3 className="font-display font-bold text-xl text-white mb-2 uppercase">Địa hình 60Hz</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Tương tác vật lý 60fps mượt mà với Tường gạch, Tường thép, Rừng cây, Sông nước, Băng tuyết.</p>
              </article>
              <article className="bg-black border-2 border-neutral-800 p-6 pixel-corners hover:border-neo-rose transition-colors group">
                <div className="font-pixel text-5xl text-neutral-800 group-hover:text-neo-rose mb-4">03</div>
                <h3 className="font-display font-bold text-xl text-white mb-2 uppercase">Chế độ Đa dạng</h3>
                <p className="text-sm text-gray-400 leading-relaxed">Solo, Phối hợp AI, hoặc Co-op Online 2 người qua mạng Internet.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="che-do-choi" className="py-16 lg:py-24 bg-neo-bg border-b-2 border-neutral-900 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12">
              <h2 className="font-pixel text-4xl sm:text-5xl text-neo-cyan mb-4">{">"} SELECT_MODE</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <article className="bg-black border-l-4 border-neo-amber p-8 hover:bg-neutral-900/50 transition-colors">
                <h3 className="font-pixel text-4xl text-white mb-2">SOLO CAMPAIGN</h3>
                <p className="text-neo-amber font-bold text-sm uppercase mb-4 tracking-widest">Single Player / AI Assist</p>
                <p className="text-gray-400 mb-6">Chiến đấu đơn độc hoặc gọi đồng minh AI hỗ trợ phòng thủ. Khởi đầu hoàn hảo để kiếm XP và nâng cấp huy hiệu.</p>
                <button onClick={handlePrimaryPlayAction} className="btn-arcade-outline inline-block px-6 py-2 font-pixel text-xl">INITIALIZE</button>
              </article>
              <article className="bg-black border-l-4 border-neo-cyan p-8 hover:bg-neutral-900/50 transition-colors">
                <h3 className="font-pixel text-4xl text-white mb-2">CO-OP ONLINE</h3>
                <p className="text-neo-cyan font-bold text-sm uppercase mb-4 tracking-widest">P2P WEBRTC MULTIPLAYER</p>
                <p className="text-gray-400 mb-6">Tạo phòng nhanh, mời bạn bè bằng mã Code 6 chữ số. Đồng bộ hóa 60 ticks/s mang lại cảm giác bắn mượt mà nhất.</p>
                <button onClick={handlePrimaryPlayAction} className="btn-arcade-outline !border-neo-cyan !text-neo-cyan !shadow-neo-cyan inline-block px-6 py-2 font-pixel text-xl" style={{boxShadow: '4px 4px 0px rgba(0, 240, 255, 0.3)'}}>CONNECT</button>
              </article>
            </div>
          </div>
        </section>

        <section id="huong-dan" className="py-16 lg:py-24 bg-neo-bg border-b-4 border-neo-amber scroll-mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-pixel text-4xl sm:text-5xl text-white mb-12">{">"} CONTROLS</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="bg-black border-2 border-neutral-800 p-8 pixel-corners">
                <h3 className="font-display font-bold text-neo-amber uppercase mb-6 tracking-widest">Desktop (PC)</h3>
                <div className="flex justify-center items-center gap-8 font-pixel text-2xl text-white">
                  <div className="text-center">
                    <div className="grid grid-cols-3 gap-2 mb-2 opacity-80">
                      <div></div><div className="border-2 border-gray-500 p-2">W</div><div></div>
                      <div className="border-2 border-gray-500 p-2">A</div><div class="border-2 border-gray-500 p-2">S</div><div className="border-2 border-gray-500 p-2">D</div>
                    </div>
                    <span className="text-sm text-gray-500">MOVE</span>
                  </div>
                  <div className="text-center">
                    <div className="border-2 border-neo-rose p-2 px-12 mb-2 text-neo-rose">SPACE / J</div>
                    <span className="text-sm text-gray-500">FIRE</span>
                  </div>
                </div>
              </div>
              <div className="bg-black border-2 border-neutral-800 p-8 pixel-corners">
                <h3 className="font-display font-bold text-neo-cyan uppercase mb-6 tracking-widest">Mobile / Tablet</h3>
                <div className="flex justify-center items-center gap-8 font-pixel text-2xl text-white">
                  <div className="text-center">
                    <div className="w-20 h-20 border-2 border-gray-500 rounded-full flex items-center justify-center mb-2 mx-auto opacity-80">
                      <span className="text-3xl">+</span>
                    </div>
                    <span className="text-sm text-gray-500">D-PAD (LEFT)</span>
                  </div>
                  <div className="text-center">
                    <div className="w-20 h-20 bg-neo-rose/20 border-4 border-neo-rose rounded-full flex items-center justify-center mb-2 mx-auto shadow-[0_0_15px_rgba(255,0,85,0.4)]"></div>
                    <span className="text-sm text-gray-500">TAP TO FIRE (RIGHT)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-black text-gray-500 text-xs sm:text-sm py-8 border-t border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 font-pixel text-xl text-white">
            <img src="/logo-bantank.png" alt="Logo" className="w-6 h-6 pixel-corners" />
            BẮN TANK ONLINE © 2026
          </div>
          <div className="flex gap-6 font-display font-bold">
            <a href="/privacy.html" className="hover:text-neo-amber transition-colors">Privacy Policy</a>
            <a href="mailto:admin@bantank.online" className="hover:text-neo-amber transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
