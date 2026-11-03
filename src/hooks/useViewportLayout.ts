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
    const headerH = isTablet ? 38 : 36;
    const availH = Math.max(208, h - headerH - 8);

    if (isTablet) {
      // iPad in landscape: controls need 150px each, canvas takes remaining square
      leftControlWidthPx = 150;
      rightControlWidthPx = 150;
      const availW = w - (leftControlWidthPx + rightControlWidthPx);
      canvasSizePx = Math.floor(Math.min(availH, availW));
    } else {
      // Phone in landscape: controls need ~130px each, canvas takes maximum vertical height
      leftControlWidthPx = Math.max(110, Math.floor((w - availH) / 2));
      rightControlWidthPx = leftControlWidthPx;
      const availW = Math.max(208, w - 240);
      canvasSizePx = Math.floor(Math.min(availH, availW));
    }
  } else {
    // Portrait Mode (Phone or iPad/Tablet)
    if (isTablet) {
      const availW = w - 32;
      const availH = h - 280;
      canvasSizePx = Math.floor(Math.min(availW, availH, 728));
    } else {
      const headerH = 38;
      const controlsH = 160;
      const availH = Math.max(208, h - headerH - controlsH - 16);
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
    return calculateLayoutMetrics(window.innerWidth, window.innerHeight, hasFinePointer, maxTouchPoints);
  }, []);

  const [layout, setLayout] = useState<ViewportLayoutState>(getMetrics);

  useEffect(() => {
    const handleUpdate = () => {
      setLayout(getMetrics());
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('orientationchange', handleUpdate, { passive: true });

    // In case mobile browser expands URL bar or address bar
    const timer = setTimeout(handleUpdate, 150);

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('orientationchange', handleUpdate);
      clearTimeout(timer);
    };
  }, [getMetrics]);

  return layout;
}
