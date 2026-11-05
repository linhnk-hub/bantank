/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface OrientationState {
  isLandscape: boolean;
}

/**
 * Passive orientation detection hook.
 * Automatically detects whether the user's device is in Portrait or Landscape
 * when they physically rotate their phone/tablet (via OS rotation).
 * Never forces or locks screen orientation, and never displays rotate prompts.
 */
export function useOrientation(): OrientationState {
  const [isLandscape, setIsLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });

  const checkOrientation = useCallback(() => {
    if (typeof window === 'undefined') return;
    setIsLandscape(window.innerWidth > window.innerHeight);
  }, []);

  useEffect(() => {
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [checkOrientation]);

  return {
    isLandscape,
  };
}
