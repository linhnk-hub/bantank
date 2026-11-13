import React, { useEffect } from 'react';

interface Props {
  onFire: () => void;
  onMove: (direction: 'up' | 'down' | 'left' | 'right' | null) => void;
}

export default function MobileController({ onFire, onMove }: Props) {
  // Chống thu phóng (zoom/scroll) trên mobile web
  useEffect(() => {
    const preventDefault = (e: Event) => e.preventDefault();
    document.addEventListener('touchmove', preventDefault, { passive: false });
    return () => document.removeEventListener('touchmove', preventDefault);
  }, []);

  const handleTouch = (dir: 'up' | 'down' | 'left' | 'right') => {
    onMove(dir);
  };
  const handleTouchEnd = () => {
    onMove(null);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-50 flex justify-between items-end p-6 pb-12 sm:pb-8">
      {/* HUD Info */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 border-2 border-neo-rose px-6 py-2 pixel-corners pointer-events-auto shadow-[0_0_10px_rgba(255,0,85,0.3)]">
        <span className="font-pixel text-3xl text-neo-rose animate-pulse">01:59</span>
      </div>

      {/* D-PAD Left */}
      <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1 w-40 h-40 opacity-60 hover:opacity-100 transition-opacity">
        <div /> 
        <button 
          className="bg-neo-cyan/20 border-2 border-neo-cyan pixel-corners active:bg-neo-cyan active:shadow-[0_0_15px_rgba(0,240,255,0.8)]" 
          onTouchStart={() => handleTouch('up')} onTouchEnd={handleTouchEnd} onMouseDown={() => handleTouch('up')} onMouseUp={handleTouchEnd}
        /> 
        <div />
        <button 
          className="bg-neo-cyan/20 border-2 border-neo-cyan pixel-corners active:bg-neo-cyan active:shadow-[0_0_15px_rgba(0,240,255,0.8)]" 
          onTouchStart={() => handleTouch('left')} onTouchEnd={handleTouchEnd} onMouseDown={() => handleTouch('left')} onMouseUp={handleTouchEnd}
        />
        <div className="bg-neo-cyan/10 flex items-center justify-center"><div className="w-2 h-2 bg-neo-cyan rounded-full"></div></div>
        <button 
          className="bg-neo-cyan/20 border-2 border-neo-cyan pixel-corners active:bg-neo-cyan active:shadow-[0_0_15px_rgba(0,240,255,0.8)]" 
          onTouchStart={() => handleTouch('right')} onTouchEnd={handleTouchEnd} onMouseDown={() => handleTouch('right')} onMouseUp={handleTouchEnd}
        />
        <div /> 
        <button 
          className="bg-neo-cyan/20 border-2 border-neo-cyan pixel-corners active:bg-neo-cyan active:shadow-[0_0_15px_rgba(0,240,255,0.8)]" 
          onTouchStart={() => handleTouch('down')} onTouchEnd={handleTouchEnd} onMouseDown={() => handleTouch('down')} onMouseUp={handleTouchEnd}
        /> 
        <div />
      </div>

      {/* FIRE Button Right */}
      <div className="pointer-events-auto w-32 h-32 opacity-80 hover:opacity-100 mr-4">
        <button 
          className="w-full h-full rounded-full bg-black border-[6px] border-neo-rose flex items-center justify-center active:bg-neo-rose active:scale-95 transition-all shadow-[0_0_20px_rgba(255,0,85,0.5)]"
          onTouchStart={onFire}
          onMouseDown={onFire}
        >
          <span className="font-pixel text-3xl font-bold text-white tracking-widest">FIRE</span>
        </button>
      </div>
    </div>
  );
}
