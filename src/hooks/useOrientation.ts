/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface OrientationState {
  isLandscape: boolean;
  canLockOrientation: boolean;
  showRotateGuide: boolean;
  requestLandscape: () => Promise<boolean>;
  dismissGuide: () => void;
}

export function useOrientation(): OrientationState {
  const [isLandscape, setIsLandscape] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth > window.innerHeight;
  });

  const [showRotateGuide, setShowRotateGuide] = useState<boolean>(false);

  const checkOrientation = useCallback(() => {
    if (typeof window === 'undefined') return;
    const isLand = window.innerWidth > window.innerHeight;
    setIsLandscape(isLand);
    // If device is already landscape, dismiss any guide
    if (isLand) {
      setShowRotateGuide(false);
    }
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

  const canLockOrientation = typeof screen !== 'undefined' && 'orientation' in screen && 'lock' in screen.orientation;

  const requestLandscape = useCallback(async (): Promise<boolean> => {
    if (typeof screen !== 'undefined' && 'orientation' in screen && 'lock' in (screen.orientation as any)) {
      try {
        // Try locking orientation
        await (screen.orientation as any).lock('landscape');
        setIsLandscape(true);
        setShowRotateGuide(false);
        return true;
      } catch (err) {
        // Many mobile browsers (iOS Safari, non-fullscreen Chrome) reject orientation.lock
        console.warn('Orientation lock failed, activating visual guidance:', err);
        setShowRotateGuide(true);
        return false;
      }
    } else {
      // Fallback: visual guidance modal
      setShowRotateGuide(true);
      return false;
    }
  }, []);

  const dismissGuide = useCallback(() => {
    setShowRotateGuide(false);
  }, []);

  return {
    isLandscape,
    canLockOrientation,
    showRotateGuide,
    requestLandscape,
    dismissGuide,
  };
}
