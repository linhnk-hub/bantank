/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const UNIFIED_LOGO_SIZE_PX = 320;
export const UNIFIED_LOGO_SRC = '/logo-bantank.png';
export const UNIFIED_LOGO_FALLBACK_SRC = 'https://i.ibb.co/Rkf42RD9/bantank.png';
export const UNIFIED_LOGO_CLASSES = 'unified-game-logo w-80 h-80 object-contain drop-shadow-[0_0_20px_rgba(255,184,0,0.6)] select-none p-0 m-0 pixel-corners border-2 border-neo-amber bg-black';

export interface GameLogoProps {
  alt?: string;
  className?: string;
  testId?: string;
}

export const GameLogo: React.FC<GameLogoProps> = ({
  alt = 'Chiến trường huyền thoại',
  className = '',
  testId = 'unified-game-logo',
}) => {
  return (
    <img
      src={UNIFIED_LOGO_SRC}
      alt={alt}
      width={UNIFIED_LOGO_SIZE_PX}
      height={UNIFIED_LOGO_SIZE_PX}
      data-testid={testId}
      className={`${UNIFIED_LOGO_CLASSES} ${className}`.trim()}
      onError={(e) => {
        if (e.currentTarget.src !== UNIFIED_LOGO_FALLBACK_SRC) {
          e.currentTarget.src = UNIFIED_LOGO_FALLBACK_SRC;
        }
      }}
    />
  );
};
