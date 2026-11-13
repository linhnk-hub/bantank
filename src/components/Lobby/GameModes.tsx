import React from 'react';
import { motion } from 'motion/react';
import { Gamepad2, Users, Zap } from 'lucide-react';

const GAME_MODES = [
  { id: 'solo', title: 'SOLO & AI', desc: 'Sinh tồn trước 30 xe địch', icon: <Gamepad2 size={32} /> },
  { id: 'coop', title: 'CO-OP ONLINE', desc: 'WebRTC P2P Multiplayer', icon: <Users size={32} /> },
  { id: 'trial', title: 'CHƠI THỬ', desc: 'Trải nghiệm ngay (No Login)', icon: <Zap size={32} /> }
];

export default function GameModes() {
  return (
    <div className="flex flex-col h-full bg-neo-bg text-white bg-tactical-grid overflow-hidden relative">
      <div className="crt-overlay absolute inset-0 z-0"></div>
      
      {/* Top HUD */}
      <header className="relative z-10 flex justify-between items-center p-4 border-b-2 border-neo-amber/30 bg-black/50">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-neo-amber/20 border-2 border-neo-amber pixel-corners flex items-center justify-center">
            {/* Avatar Placeholder */}
            <span className="font-pixel text-xl">P1</span>
          </div>
          <div className="flex flex-col">
            <span className="font-pixel text-2xl text-neo-amber">COMMANDER</span>
            <div className="w-24 h-2 bg-gray-800 mt-1"><div className="h-full bg-neo-cyan w-3/4"></div></div>
          </div>
        </div>
        <div className="font-pixel text-neo-amber text-3xl">999 XP</div>
      </header>

      {/* Center Showcase (Sprite / 3D Model placeholder) */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
         <img src="/logo-bantank.png" className="w-40 h-40 object-contain drop-shadow-[0_0_30px_rgba(255,184,0,0.6)] animate-pulse pixel-corners" alt="Tank" />
      </div>

      {/* Bottom Menu (Touch-friendly Swipe Carousel) */}
      <div className="relative z-10 pb-6 pt-4 px-4 bg-gradient-to-t from-black via-black/90 to-transparent">
        <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar gap-4 pb-4">
          {GAME_MODES.map((mode) => (
            <motion.div 
              key={mode.id}
              whileTap={{ scale: 0.95 }}
              className="min-w-[260px] snap-center bg-black border-2 border-neo-cyan p-6 pixel-corners cursor-pointer"
            >
              <div className="text-neo-cyan mb-3 drop-shadow-[0_0_10px_rgba(0,240,255,0.8)]">{mode.icon}</div>
              <h3 className="font-pixel text-3xl text-white uppercase mb-1">{mode.title}</h3>
              <p className="font-display text-sm text-gray-400">{mode.desc}</p>
            </motion.div>
          ))}
        </div>
        
        <button className="btn-arcade w-full py-4 text-3xl font-bold mt-2">
          START MATCHING
        </button>
      </div>
    </div>
  );
}
