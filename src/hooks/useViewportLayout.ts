/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface ViewportLayoutState {
  width: number;
  height: number;
  isLandscape: boolean;
  isTablet: boolean;
  isDesktopPC: boolean;
  isTabletOrDesktop: boolean;
  isPhoneLandscape: boolean;
  canvasSizePx: number;
  leftControlWidthPx: number;
  rightControlWidthPx: number;
}

export function calculateLayoutMetrics(
  w: number,
  h: number,
  hasFinePointer: boolean = false,
  maxTouchPoints: number = 5
): ViewportLayoutState {
  const isLandscape = w > h;
  const isTablet = Math.min(w, h) >= 600 && Math.max(w, h) >= 900;
  const isDesktopPC = w >= 1024 && hasFinePointer && maxTouchPoints <= 2;
  const isTabletOrDesktop = isTablet || isDesktopPC;
  const isPhoneLandscape = isLandscape && !isTablet && !isDesktopPC;

  let canvasSizePx = 208;
  let leftControlWidthPx = 130;
  let rightControlWidthPx = 130;

  if (isDesktopPC) {
    // Desktop PC: generous view up to 832px (4x integer scale of 208)
    const availH = h - 140;
    canvasSizePx = Math.min(availH, 832);
    leftControlWidthPx = 0;
    rightControlWidthPx = 0;
  } else if (isLandscape) {
    // Landscape Mode (Phone or iPad/Tablet)
    // Sized to 98% of available height after top HUD (36px) to maximize square canvas area
    const availH = Math.floor((h - 36) * 0.98);

    if (isTablet) {
      // iPad in landscape: controls need 140px each, canvas takes remaining square up to ~717px
      const availW = w - (140 + 140);
      canvasSizePx = Math.floor(Math.min(availH, availW));
      leftControlWidthPx = Math.floor((w - canvasSizePx) / 2);
      rightControlWidthPx = leftControlWidthPx;
    } else {
      // Phone in landscape: canvas takes maximized vertical square (346px on 390h)
      const availW = Math.max(208, w - 240);
      canvasSizePx = Math.floor(Math.min(availH, availW));
      leftControlWidthPx = Math.max(140, Math.floor((w - canvasSizePx) / 2));
      rightControlWidthPx = leftControlWidthPx;
    }
  } else {
    // Portrait Mode (Phone or iPad/Tablet)
    if (isTablet) {
      const availW = w - 32;
      const availH = h - 280;
      canvasSizePx = Math.floor(Math.min(availW, availH, 728));
    } else {
      // Phone portrait:
      // Reserve: header (36px) + separation (28px) + controls (140px) + safe bottom (28px) = 232px
      const reservedH = 232;
      const availH = Math.max(208, h - reservedH);
      const availW = Math.max(208, w - 16);
      canvasSizePx = Math.floor(Math.min(availH, availW));
    }
    leftControlWidthPx = 0;
    rightControlWidthPx = 0;
  }

  // Ensure minimum valid size
  canvasSizePx = Math.max(208, Math.floor(canvasSizePx));

  return {
    width: w,
    height: h,
    isLandscape,
    isTablet,
    isDesktopPC,
    isTabletOrDesktop,
    isPhoneLandscape,
    canvasSizePx,
    leftControlWidthPx,
    rightControlWidthPx,
  };
}

export function useViewportLayout(): ViewportLayoutState {
  const getMetrics = useCallback((): ViewportLayoutState => {
    if (typeof window === 'undefined') {
      return {
        width: 1024,
        height: 768,
        isLandscape: true,
        isTablet: false,
        isDesktopPC: true,
        isTabletOrDesktop: true,
        isPhoneLandscape: false,
        canvasSizePx: 624,
        leftControlWidthPx: 0,
        rightControlWidthPx: 0,
      };
    }
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const maxTouchPoints = navigator.maxTouchPoints || 0;
    // Use window.visualViewport if available for Safari toolbar accounting
    const vv = window.visualViewport;
    const w = vv ? Math.round(vv.width) : window.innerWidth;
    const h = vv ? Math.round(vv.height) : window.innerHeight;
    return calculateLayoutMetrics(w, h, hasFinePointer, maxTouchPoints);
  }, []);

  const [layout, setLayout] = useState<ViewportLayoutState>(getMetrics);

  useEffect(() => {
    const handleUpdate = () => {
      setLayout(getMetrics());
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleUpdate, { passive: true });
      vv.addEventListener('scroll', handleUpdate, { passive: true });
    }

    // In case mobile browser dynamically expands or collapses URL/toolbar
    const timer1 = setTimeout(handleUpdate, 100);
    const timer2 = setTimeout(handleUpdate, 300);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      if (vv) {
        vv.removeEventListener('resize', handleUpdate);
        vv.removeEventListener('scroll', handleUpdate);
      }
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [getMetrics]);

  return layout;
}
