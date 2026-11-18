/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Crosshair,
  Pause,
  Heart,
  Skull,
  ShieldAlert,
  Trophy,
  Clock,
} from 'lucide-react';
import { VirtualJoystick } from './VirtualJoystick.tsx';
import type { GameCoreState, InputState } from '../core/types.ts';
import {
  ENEMY_CONFIG,
  MATCH_TIMER_CONFIG,
  formatCountdownMMSS,
  getMatchDurationSecondsForDifficulty,
  getStartingLivesForDifficultyAndMode,
} from '../core/constants.ts';
import { SessionManager } from '../core/sessionManager.ts';
import { useLanguage } from '../core/i18n.ts';

export type ActiveDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | null;

export { VirtualJoystick } from './VirtualJoystick.tsx';

export interface VirtualDPadProps {
  activeDirection: ActiveDirection;
  onDirectionChange: (dir: ActiveDirection) => void;
}

export const VirtualDPad: React.FC<VirtualDPadProps> = ({
  activeDirection,
  onDirectionChange,
}) => {
  const activeDirRef = useRef<ActiveDirection>(activeDirection);
  activeDirRef.current = activeDirection;

  return (
    <div
      translate="no"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="battle-touch-lock notranslate relative w-36 h-36 flex items-center justify-center select-none touch-none shrink-0"
    >
      {/* D-Pad Cross Background */}
      <div className="absolute w-12 h-36 bg-[#0b0d1e] rounded-lg border border-[#00F0FF]/30 pointer-events-none" />
      <div className="absolute w-36 h-12 bg-[#0b0d1e] rounded-lg border border-[#00F0FF]/30 pointer-events-none" />

      {/* Center Pivot Indicator */}
      <div className="absolute w-9 h-9 rounded-full bg-[#050510] border border-[#FFB800]/50 pointer-events-none z-10 flex items-center justify-center shadow-inner">
        <div className="w-3 h-3 rounded-full bg-[#FFB800] shadow-sm" />
      </div>

      {/* UP Button (48px standard touch target) */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onDirectionChange('UP');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'UP') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'UP') onDirectionChange(null);
        }}
        className={`absolute top-0 w-12 h-12 rounded-t-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'UP'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
        }`}
        aria-label="Di chuyển Lên"
      >
        <ArrowUp className="w-5 h-5 stroke-[3]" />
      </button>

      {/* DOWN Button */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onDirectionChange('DOWN');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'DOWN') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'DOWN') onDirectionChange(null);
        }}
        className={`absolute bottom-0 w-12 h-12 rounded-b-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'DOWN'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
        }`}
        aria-label="Di chuyển Xuống"
      >
        <ArrowDown className="w-5 h-5 stroke-[3]" />
      </button>

      {/* LEFT Button */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onDirectionChange('LEFT');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'LEFT') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'LEFT') onDirectionChange(null);
        }}
        className={`absolute left-0 w-12 h-12 rounded-l-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'LEFT'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
        }`}
        aria-label="Di chuyển Trái"
      >
        <ArrowLeft className="w-5 h-5 stroke-[3]" />
      </button>

      {/* RIGHT Button */}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onDirectionChange('RIGHT');
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'RIGHT') onDirectionChange(null);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          if (activeDirRef.current === 'RIGHT') onDirectionChange(null);
        }}
        className={`absolute right-0 w-12 h-12 rounded-r-lg flex items-center justify-center z-20 transition-all ${
          activeDirection === 'RIGHT'
            ? 'bg-[#FFB800] text-[#050510] shadow-lg scale-95'
            : 'bg-[#0b0d1e] text-[#EAF4FF] hover:bg-neutral-800 active:bg-[#FFB800] active:text-[#050510]'
        }`}
        aria-label="Di chuyển Phải"
      >
        <ArrowRight className="w-5 h-5 stroke-[3]" />
      </button>
    </div>
  );
};

export interface VirtualShootButtonProps {
  isShooting: boolean;
  onShootChange: (shooting: boolean) => void;
  size?: number;
  showKeyboardHint?: boolean;
}

export const VirtualShootButton: React.FC<VirtualShootButtonProps> = ({
  isShooting,
  onShootChange,
  size = 76,
  showKeyboardHint = false,
}) => {
  const { t } = useLanguage();
  const isCompact = size < 70;
  const iconSize = isCompact ? 20 : 26;

  // Active continuous shoot activity recorder
  useEffect(() => {
    if (!isShooting) return;
    SessionManager.getInstance().recordUserActivity();
    const interval = setInterval(() => {
      SessionManager.getInstance().recordUserActivity();
    }, 1000);
    return () => clearInterval(interval);
  }, [isShooting]);

  // Global pointerup fallback in case pointerup fired outside captured target
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isShooting) {
        onShootChange(false);
      }
    };
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isShooting, onShootChange]);

  return (
    <div
      translate="no"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="battle-touch-lock notranslate flex flex-col items-center gap-1 select-none touch-none shrink-0"
    >
      <button
        type="button"
        style={{
          width: `${size}px`,
          height: `${size}px`,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          if (typeof window !== 'undefined') {
            try { window.getSelection()?.removeAllRanges(); } catch (_) {}
          }
          SessionManager.getInstance().recordUserActivity();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
          onShootChange(true);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          onShootChange(false);
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
          onShootChange(false);
        }}
        className={`font-btn rounded-full flex flex-col items-center justify-center gap-0.5 transition-all shadow-xl active:scale-95 ${
          isShooting
            ? 'bg-[#FF0055] text-white shadow-[#FF0055]/50 scale-95 border-2 border-amber-300'
            : 'bg-[#FF0055]/90 hover:bg-[#FF0055] text-white shadow-[#FF0055]/35 border-2 border-rose-300'
        }`}
        aria-label={t('Bắn đạn', 'Fire')}
      >
        <Crosshair style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
        <span className={`${isCompact ? 'text-[10px]' : 'text-xs'} font-black tracking-widest uppercase`}>
          {t('BẮN', 'FIRE')}
        </span>
      </button>
      {showKeyboardHint && !isCompact && <span className="font-hud text-xs text-neutral-500">SPACE / J</span>}
    </div>
  );
};

export interface BattleCenterHudStatsProps {
  gameState?: GameCoreState | null;
  difficulty?: 'DEFAULT' | 'EXTREME';
  localOnlineRole?: 'HOST' | 'GUEST' | null;
}

const EnemyTankHudIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    className={className}
    style={{ shapeRendering: 'crispEdges' }}
    aria-hidden="true"
  >
    {/* Left & Right Treads */}
    <rect x="2" y="3" width="2" height="11" fill="#B45309" />
    <rect x="12" y="3" width="2" height="11" fill="#B45309" />
    {/* Tank Hull */}
    <rect x="4" y="4" width="8" height="9" fill="#FFB800" />
    {/* Turret & Barrel */}
    <rect x="7" y="1" width="2" height="4" fill="#FEF08A" />
    <rect x="6" y="6" width="4" height="5" fill="#78350F" />
  </svg>
);

export const BattleCenterHudStats: React.FC<BattleCenterHudStatsProps> = ({
  gameState,
  difficulty = 'DEFAULT',
  localOnlineRole = null,
}) => {
  const { t } = useLanguage();
  const stageId = gameState?.currentStageId ?? 1;
  const stageName = gameState?.currentStageName || `${t('Màn', 'Stage')} ${stageId}`;
  const isTwoPlayer =
    gameState?.gameMode === 'TWO_PLAYERS_AI' ||
    gameState?.gameMode === 'TWO_PLAYERS_ONLINE';
  const isCoopOnline = gameState?.gameMode === 'TWO_PLAYERS_ONLINE';

  const p1Lives =
    gameState?.p1State.lives ??
    getStartingLivesForDifficultyAndMode(
      gameState?.difficulty ?? difficulty,
      gameState?.gameMode ?? 'SOLO'
    );
  const p2Lives = gameState?.p2State?.lives ?? 0;

  const totalEnemies = ENEMY_CONFIG.TOTAL_COUNT;
  const sumCounts = (counts?: { BASIC: number; FAST: number; POWER: number; ARMOR: number }) =>
    counts ? counts.BASIC + counts.FAST + counts.POWER + counts.ARMOR : 0;
  const enemiesKilled =
    isCoopOnline && localOnlineRole === 'GUEST'
      ? sumCounts(gameState?.p2Stats?.defeatedCounts)
      : gameState?.totalDefeatedEnemies ?? sumCounts(gameState?.p1Stats?.defeatedCounts);
  const remainingEnemies = Math.max(
    0,
    totalEnemies - (gameState?.totalDefeatedEnemies ?? 0)
  );

  const xpScore =
    isCoopOnline && localOnlineRole === 'GUEST'
      ? gameState?.p2Stats?.score ?? 0
      : gameState?.p1Stats?.score ?? gameState?.score ?? 0;

  const remSec =
    typeof gameState?.remainingSeconds === 'number'
      ? gameState.remainingSeconds
      : getMatchDurationSecondsForDifficulty(gameState?.difficulty ?? difficulty);
  const isCrit = remSec <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
  const isWarn = !isCrit && remSec <= MATCH_TIMER_CONFIG.WARNING_THRESHOLD_S;

  return (
    <div
      data-testid="battle-center-hud"
      translate="no"
      className="battle-touch-lock notranslate w-full max-w-[236px] sm:max-w-[280px] rounded-md bg-[#0b0d1e]/95 border border-[#00F0FF]/40 px-2 py-1.5 shadow-inner flex flex-col gap-1"
    >
      {/* Hidden stage name for test compatibility (Stage name is shown centered above the arena) */}
      <span data-testid="battle-hud-stage-name" className="hidden">
        {stageName}
      </span>

      {/* Top Row: Countdown Timer */}
      <div className="flex items-center justify-center border-b border-neutral-800 pb-1">
        <span
          data-testid="battle-hud-timer"
          className={`font-hud inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs sm:text-sm font-bold shrink-0 ${
            isCrit
              ? 'bg-red-950/90 text-red-300 border border-[#FF0055] animate-pulse'
              : isWarn
                ? 'bg-amber-950/80 text-[#FFB800]'
                : 'text-[#00F0FF]'
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{formatCountdownMMSS(remSec)}</span>
        </span>
      </div>

      {/* Tactical Metrics Grid */}
      {isCoopOnline ? (
        <div className="flex flex-col gap-1.5 font-hud text-xs sm:text-sm leading-tight">
          {/* Row 1: Full-width Combined P1/P2 Lives matching 2 upper slots */}
          <div
            data-testid="battle-hud-lives"
            className="w-full flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#050510]/90 border border-[#FF0055]/35"
          >
            <Heart className="w-3.5 h-3.5 text-[#FF0055] fill-[#FF0055] shrink-0" />
            <div className="flex items-center justify-end gap-3 font-extrabold text-right whitespace-nowrap">
              <span className="text-[#FF0055]">P1:{p1Lives}</span>
              <span className="text-emerald-400">P2:{p2Lives}</span>
            </div>
          </div>

          {/* Row 2: 3 Columns — Remaining Enemies, Local Player Kills, XP */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* Remaining Enemies */}
            <div
              data-testid="battle-hud-enemies-remaining"
              className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#050510]/90 border border-[#FFB800]/35 min-w-0"
            >
              <EnemyTankHudIcon className="w-3.5 h-3.5 shrink-0" />
              <span className="font-extrabold text-[#FFB800] text-right whitespace-nowrap">
                {remainingEnemies}
              </span>
            </div>

            {/* Kills */}
            <div
              data-testid="battle-hud-kills"
              className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#050510]/90 border border-[#00F0FF]/35 min-w-0"
            >
              <Skull className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
              <span className="font-extrabold text-[#00F0FF] text-right whitespace-nowrap">
                {enemiesKilled}
              </span>
            </div>

            {/* XP Score (replaced Trophy icon with XP text) */}
            <div
              data-testid="battle-hud-xp"
              className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#050510]/90 border border-emerald-500/35 min-w-0"
            >
              <span className="font-black text-emerald-400 shrink-0 text-[11px] sm:text-xs">
                XP
              </span>
              <span className="font-extrabold text-emerald-400 text-right whitespace-nowrap">
                {xpScore}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 font-hud text-xs sm:text-sm leading-tight">
          {/* Lives / Health */}
          <div
            data-testid="battle-hud-lives"
            className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#050510]/90 border border-[#FF0055]/35"
          >
            <Heart className="w-3.5 h-3.5 text-[#FF0055] fill-[#FF0055] shrink-0" />
            <div className="flex items-center justify-end gap-1.5 font-extrabold text-right whitespace-nowrap">
              {isTwoPlayer ? (
                <>
                  <span className="text-[#FF0055]">P1:{p1Lives}</span>
                  <span className="text-emerald-400">P2:{p2Lives}</span>
                </>
              ) : (
                <span className="text-[#FF0055]">×{p1Lives}</span>
              )}
            </div>
          </div>

          {/* Remaining Enemies (Tank Icon) */}
          <div
            data-testid="battle-hud-enemies-remaining"
            className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#050510]/90 border border-[#FFB800]/35"
          >
            <EnemyTankHudIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-extrabold text-[#FFB800] text-right whitespace-nowrap">
              {remainingEnemies}
            </span>
          </div>

          {/* Kills */}
          <div
            data-testid="battle-hud-kills"
            className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#050510]/90 border border-[#00F0FF]/35"
          >
            <Skull className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
            <span className="font-extrabold text-[#00F0FF] text-right whitespace-nowrap">{enemiesKilled}</span>
          </div>

          {/* XP Score */}
          <div
            data-testid="battle-hud-xp"
            className="flex items-center justify-between gap-2 px-2.5 py-1 rounded bg-[#050510]/90 border border-emerald-500/35"
          >
            <Trophy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-extrabold text-emerald-400 text-right whitespace-nowrap">{xpScore}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export interface TouchControlsProps {
  onInputChange: (input: Partial<InputState>) => void;
  onPauseClick: () => void;
  isPaused: boolean;
  controlType?: 'joystick' | 'dpad';
  disablePause?: boolean;
  gameState?: GameCoreState | null;
  difficulty?: 'DEFAULT' | 'EXTREME';
  localOnlineRole?: 'HOST' | 'GUEST' | null;
  showKeyboardHint?: boolean;
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  onInputChange,
  onPauseClick,
  isPaused,
  controlType = 'joystick',
  disablePause = false,
  gameState,
  difficulty = 'DEFAULT',
  localOnlineRole = null,
  showKeyboardHint = false,
}) => {
  const { t } = useLanguage();
  const [activeDirection, setActiveDirection] = useState<ActiveDirection>(null);
  const [isShooting, setIsShooting] = useState<boolean>(false);

  // References to preserve state across multi-touch callbacks
  const activeDirRef = useRef<ActiveDirection>(null);
  const isShootingRef = useRef<boolean>(false);

  // When paused or window blurs, immediately release all inputs
  useEffect(() => {
    if (isPaused) {
      activeDirRef.current = null;
      isShootingRef.current = false;
      setActiveDirection(null);
      setIsShooting(false);
      onInputChange({ up: false, down: false, left: false, right: false, shoot: false });
    }
  }, [isPaused, onInputChange]);

  useEffect(() => {
    const handleBlur = () => {
      activeDirRef.current = null;
      isShootingRef.current = false;
      setActiveDirection(null);
      setIsShooting(false);
      onInputChange({ up: false, down: false, left: false, right: false, shoot: false });
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [onInputChange]);

  const handleDirectionChange = useCallback(
    (dir: ActiveDirection) => {
      activeDirRef.current = dir;
      setActiveDirection(dir);
      // Strictly prevent diagonal movement: exactly one direction or none
      onInputChange({
        up: dir === 'UP',
        down: dir === 'DOWN',
        left: dir === 'LEFT',
        right: dir === 'RIGHT',
      });
    },
    [onInputChange]
  );

  const handleShootChange = useCallback(
    (shooting: boolean) => {
      isShootingRef.current = shooting;
      setIsShooting(shooting);
      // Releasing or pressing shooting NEVER affects active movement direction
      onInputChange({
        shoot: shooting,
      });
    },
    [onInputChange]
  );

  return (
    <div
      translate="no"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="battle-touch-lock notranslate w-full flex items-center justify-between gap-1.5 sm:gap-3 select-none touch-none py-2 px-2.5 sm:px-6 md:px-8 bg-[#050510]/90 rounded-lg border border-[#00F0FF]/30 shadow-xl"
    >
      {/* Left Column: Virtual Joystick aligned to left hand zone */}
      <div className="flex items-center justify-start shrink-0">
        {controlType === 'joystick' ? (
          <VirtualJoystick
            activeDirection={activeDirection}
            onDirectionChange={handleDirectionChange}
            size={112}
            knobSize={42}
            deadZone={14}
            disabled={isPaused}
          />
        ) : (
          <VirtualDPad
            activeDirection={activeDirection}
            onDirectionChange={handleDirectionChange}
          />
        )}
      </div>

      {/* Center Column: Battle Stats HUD (Stage Name, Lives, Enemies, Kills, XP) stacked ABOVE the Pause Button */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1.5 min-w-0">
        <BattleCenterHudStats
          gameState={gameState}
          difficulty={difficulty}
          localOnlineRole={localOnlineRole}
        />

        {!disablePause && (
          <button
            type="button"
            data-testid="battle-center-pause-btn"
            onClick={onPauseClick}
            className="font-btn px-3 py-1 rounded-full bg-[#0b0d1e] border border-[#FFB800]/50 hover:bg-neutral-800 text-[#FFB800] flex items-center justify-center gap-1.5 transition-transform active:scale-95 shadow text-[11px] font-black uppercase tracking-wider cursor-pointer"
            aria-label={t('Tạm dừng', 'Pause')}
          >
            <Pause className="w-3.5 h-3.5 fill-[#FFB800]" />
            <span>PAUSE</span>
          </button>
        )}
      </div>

      {/* Right Column: Shoot Action Button aligned to right hand zone */}
      <div className="flex items-center justify-end shrink-0">
        <VirtualShootButton
          isShooting={isShooting}
          onShootChange={handleShootChange}
          size={76}
          showKeyboardHint={showKeyboardHint}
        />
      </div>
    </div>
  );
};
