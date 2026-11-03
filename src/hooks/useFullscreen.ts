/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface FullscreenState {
  isFullscreen: boolean;
  isFullscreenSupported: boolean;
  showFullscreenGuide: boolean;
  toggleFullscreen: () => Promise<boolean>;
  dismissGuide: () => void;
}

export function useFullscreen(): FullscreenState {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return Boolean(
      document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
    );
  });

  const [showFullscreenGuide, setShowFullscreenGuide] = useState<boolean>(false);

  const isFullscreenSupported =
    typeof document !== 'undefined' &&
    Boolean(
      document.fullscreenEnabled ||
        (document as any).webkitFullscreenEnabled ||
        document.documentElement.requestFullscreen ||
        (document.documentElement as any).webkitRequestFullscreen
    );

  const updateFullscreenStatus = useCallback(() => {
    if (typeof document === 'undefined') return;
    const active = Boolean(
      document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
    );
    setIsFullscreen(active);
    if (active) {
      setShowFullscreenGuide(false);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.addEventListener('fullscreenchange', updateFullscreenStatus);
    document.addEventListener('webkitfullscreenchange', updateFullscreenStatus);
    document.addEventListener('mozfullscreenchange', updateFullscreenStatus);
    document.addEventListener('MSFullscreenChange', updateFullscreenStatus);

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenStatus);
      document.removeEventListener('webkitfullscreenchange', updateFullscreenStatus);
      document.removeEventListener('mozfullscreenchange', updateFullscreenStatus);
      document.removeEventListener('MSFullscreenChange', updateFullscreenStatus);
    };
  }, [updateFullscreenStatus]);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    if (typeof document === 'undefined') return false;

    // Check if currently fullscreen -> exit
    const doc = document as any;
    const isCurrentlyFs = Boolean(
      doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
    );

    if (isCurrentlyFs) {
      try {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        }
        setIsFullscreen(false);
        return true;
      } catch (err) {
        console.warn('Exit fullscreen failed:', err);
        return false;
      }
    } else {
      // Enter fullscreen
      const el = document.documentElement as any;
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        } else {
          // Unsupported browser (e.g. iOS Safari on iPhone)
          setShowFullscreenGuide(true);
          return false;
        }
        setIsFullscreen(true);
        return true;
      } catch (err) {
        console.warn('Request fullscreen failed or denied:', err);
        // Show fallback instruction
        setShowFullscreenGuide(true);
        return false;
      }
    }
  }, []);

  const dismissGuide = useCallback(() => {
    setShowFullscreenGuide(false);
  }, []);

  return {
    isFullscreen,
    isFullscreenSupported,
    showFullscreenGuide,
    toggleFullscreen,
    dismissGuide,
  };
}
