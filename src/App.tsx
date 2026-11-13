/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PhaserGame } from './game/PhaserGame.tsx';
import { TerrainLegend } from './components/TerrainLegend.tsx';
import { M3Hud } from './components/M3Hud.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { StageClearModal } from './components/StageClearModal.tsx';
import {
  TouchControls,
  VirtualJoystick,
  VirtualShootButton,
  type ActiveDirection,
} from './components/TouchControls.tsx';
import { DevToolsDrawer } from './components/DevToolsDrawer.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SupportModal } from './components/SupportModal.tsx';
import { SoundManager } from './core/audio.ts';
import { MusicManager } from './core/musicManager.ts';
import {
  MATCH_TIMER_CONFIG,
  STAGE_1_MAP,
  formatCountdownMMSS,
  getMatchDurationSecondsForDifficulty,
} from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import { GameEngine } from './core/gameEngine.ts';
import {
  CoopOnlineManager,
  type CoopRoomDocument,
  type CoopPlayerRole,
} from './core/coopOnlineManager.ts';
import { useOrientation } from './hooks/useOrientation.ts';
import { useViewportLayout } from './hooks/useViewportLayout.ts';
import type { GameCoreState, InputState } from './core/types.ts';
import { AuthSessionBanner } from './components/AuthSessionBanner.tsx';
import { SessionManager } from './core/sessionManager.ts';
import { AuthManager, isSuperAdminUser } from './core/authManager.ts';
import { WelcomeScreen } from './components/WelcomeScreen.tsx';
import { MainMenuScreen } from './components/MainMenuScreen.tsx';
import { ModeSelectionScreen } from './components/ModeSelectionScreen.tsx';
import { SessionAlertModal } from './components/SessionAlertModal.tsx';
import { GameLogo } from './components/GameLogo.tsx';
import { QuickAudioToggleButton } from './components/QuickAudioToggleButton.tsx';
import {
  RotateCcw,
  Pause,
  Smartphone,
  Wrench,
  Menu,
  X,
  Play,
  Heart,
  Trophy,
  Settings,
  HelpCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
// NHÚNG NEO-RETRO UI COMPONENT
import MobileController from './components/HUD/MobileController.tsx';

export default function App() {
  const authManager = useMemo(() => AuthManager.getInstance(), []);
  const sessionManager = useMemo(() => SessionManager.getInstance(), []);
  const coopManager = useMemo(() => CoopOnlineManager.getInstance(), []);

  const [currentUser, setCurrentUser] = useState(() => authManager.getCurrentUser());
  const [isAuthReady, setIsAuthReady] = useState<boolean>(() => authManager.isAuthReady());
  const [sessionSnapshot, setSessionSnapshot] = useState(() => sessionManager.getSnapshot());
  const [appScreen, setAppScreen] = useState<'WELCOME' | 'MAIN_MENU' | 'MODE_SELECTION' | 'BATTLE'>(() => {
    return authManager.getCurrentUser() ? 'MAIN_MENU' : 'WELCOME';
  });
  const [authProcessing, setAuthProcessing] = useState<boolean>(false);
  const [authErrorMsg, setAuthErrorMsg] = useState<string | null>(null);
  const [logoutSuccessNotice, setLogoutSuccessNotice] = useState<string | null>(null);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [onlineDisconnectMsg, setOnlineDisconnectMsg] = useState<string | null>(null);

  const isSuperAdmin = useMemo(() => isSuperAdminUser(currentUser), [currentUser]);

  const [gameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [, setFps] = useState<number>(60);
  const [difficulty, setDifficulty] = useState<'DEFAULT' | 'EXTREME'>('DEFAULT');
  const [selectedMode, setSelectedMode] = useState<'SOLO' | 'TWO_PLAYERS'>('SOLO');
  const [twoPlayerOption, setTwoPlayerOption] = useState<'P2_AI' | 'P2_REAL'>('P2_AI');
  const [profileRevision, setProfileRevision] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isMatchAllowed, setIsMatchAllowed] = useState<boolean>(false);
  const [isTrialMode, setIsTrialMode] = useState<boolean>(() => authManager.isTrialMode());

  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      SoundManager.getInstance().unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const desktop = window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
    return !desktop;
  });

  useOrientation();

  const [isMenuExpanded, setIsMenuExpanded] = useState<boolean>(false);
  const [isDevDrawerOpen, setIsDevDrawerOpen] = useState<boolean>(false);

  const [landscapeDirection, setLandscapeDirection] = useState<ActiveDirection>(null);
  const [landscapeShooting, setLandscapeShooting] = useState<boolean>(false);
  const landscapeDirRef = useRef<ActiveDirection>(null);

  const layout = useViewportLayout();
  const validation = useMemo(() => validateStageMap(STAGE_1_MAP), []);

  const clearVirtualTouchInputs = useCallback(() => {
    landscapeDirRef.current = null;
    setLandscapeDirection(null);
    setLandscapeShooting(false);
    gameEngine.clearAllInputs();
  }, [gameEngine]);

  const handlePause = useCallback(() => {
    clearVirtualTouchInputs();
    gameEngine.pause();
    setIsPaused(true);
    MusicManager.getInstance().pause();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, clearVirtualTouchInputs]);

  useEffect(() => {
    if (gameState?.matchState === 'PAUSED' && !isPaused) {
      clearVirtualTouchInputs();
      setIsPaused(true);
      MusicManager.getInstance().pause();
    }
  }, [gameState?.matchState, isPaused, clearVirtualTouchInputs]);

  useEffect(() => {
    const onBlurOrVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clearVirtualTouchInputs();
      }
    };
    const onWindowBlur = () => {
      clearVirtualTouchInputs();
    };
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('visibilitychange', onBlurOrVisibility);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('visibilitychange', onBlurOrVisibility);
    };
  }, [clearVirtualTouchInputs]);

  useEffect(() => {
    MusicManager.getInstance().syncRoleFromAuthUser(authManager.getCurrentUser());

    const unsubReady = authManager.subscribeAuthReady((ready) => {
      setIsAuthReady(ready);
    });

    const unsubAuth = authManager.subscribe((u) => {
      setCurrentUser(u);
      MusicManager.getInstance().syncRoleFromAuthUser(u);
      setProfileRevision((r) => r + 1);
      if (u) {
        setIsTrialMode(false);
        setLogoutSuccessNotice(null);
        setAppScreen((prev) => (prev === 'WELCOME' ? 'MAIN_MENU' : prev));
        if (sessionManager.getSnapshot().status === 'NO_SESSION') {
          sessionManager.acquireSession(u.uid);
        }
      } else if (authManager.isAuthReady() && !authManager.isTrialMode()) {
        setIsTrialMode(false);
        setIsDevDrawerOpen(false);
        setAppScreen('WELCOME');
      }
    });

    const unsubSession = sessionManager.subscribe((s) => {
      setSessionSnapshot(s);
      setIsMatchAllowed(s.status === 'ACTIVE');
      if (
        s.status === 'DISPLACED' ||
        s.status === 'PAUSED_IDLE' ||
        s.status === 'CONNECTION_LOST_UNVERIFIED'
      ) {
        handlePause();
      }
    });

    SessionManager.getInstance().setOnPauseGame(() => {
      handlePause();
    });

    return () => {
      unsubReady();
      unsubAuth();
      unsubSession();
    };
  }, [authManager, sessionManager, handlePause]);

  useEffect(() => {
    if (appScreen !== 'BATTLE') return;
    const unsubCoop = coopManager.subscribe((room) => {
      if (gameEngine.getState().gameMode !== 'TWO_PLAYERS_ONLINE') return;
      const localRole = coopManager.getLocalRole();
      if (!room) {
        if (localRole === 'GUEST') {
          setOnlineDisconnectMsg('P1 đã rời trận.');
          handlePause();
        }
        return;
      }
      if (room.status === 'ABANDONED') {
        if (localRole === 'HOST') {
          gameEngine.handlePeerPlayerLeft('P2');
          setGameState({ ...gameEngine.getState() });
          return;
        } else if (localRole === 'GUEST') {
          gameEngine.handlePeerPlayerLeft('P1');
          setOnlineDisconnectMsg('P1 đã rời trận.');
          handlePause();
          return;
        }
      }
      const status = coopManager.evaluatePeerConnectionStatus(Date.now());
      if (status.isTimedOut) {
        setOnlineDisconnectMsg(status.warningMessage || 'Đồng đội đã ngắt kết nối.');
        handlePause();
      }
    });

    const unsubPeerLeave = coopManager.subscribePeerLeave((event) => {
      if (gameEngine.getState().gameMode !== 'TWO_PLAYERS_ONLINE') return;
      const leftPlayer = event.role === 'HOST' ? 'P1' : 'P2';
      gameEngine.handlePeerPlayerLeft(leftPlayer);
      setGameState({ ...gameEngine.getState() });
      if (event.role === 'HOST') {
        setOnlineDisconnectMsg(event.message);
        handlePause();
      }
    });

    return () => {
      unsubCoop();
      unsubPeerLeave();
    };
  }, [appScreen, coopManager, gameEngine, handlePause]);

  const handleResume = useCallback(() => {
    clearVirtualTouchInputs();
    gameEngine.resume();
    setIsPaused(false);
    MusicManager.getInstance().resume();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, clearVirtualTouchInputs]);

  const handleRestart = useCallback(() => {
    clearVirtualTouchInputs();
    gameEngine.restartStage();
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
    setGameState({ ...st });
  }, [gameEngine, clearVirtualTouchInputs]);

  const handleStartMatch = useCallback(
    (mode: 'SOLO' | 'TWO_PLAYERS' = 'SOLO', twoPlayerOption?: 'P2_AI' | 'P2_REAL') => {
      if (sessionSnapshot.status !== 'ACTIVE') return;
      setOnlineDisconnectMsg(null);
      const engineMode = mode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_AI' ? 'TWO_PLAYERS_AI' : 'SOLO';
      gameEngine.startMatch(engineMode, difficulty);
      setIsPaused(false);
      const st = gameEngine.getState();
      MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
      setGameState({ ...st });
      setAppScreen('BATTLE');
    },
    [sessionSnapshot.status, gameEngine, difficulty]
  );

  const handleStartOnlineMatch = useCallback(
    (room: CoopRoomDocument, _role: CoopPlayerRole) => {
      if (sessionSnapshot.status !== 'ACTIVE') return;
      setOnlineDisconnectMsg(null);
      setDifficulty(room.difficulty);
      gameEngine.startMatch('TWO_PLAYERS_ONLINE', room.difficulty);
      setIsPaused(false);
      const st = gameEngine.getState();
      MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
      setGameState({ ...st });
      setAppScreen('BATTLE');
    },
    [sessionSnapshot.status, gameEngine]
  );

  const handleStartTrialMode = useCallback(() => {
    authManager.startTrialMode();
    setIsTrialMode(true);
    setIsMatchAllowed(true);
    setOnlineDisconnectMsg(null);
    setDifficulty('DEFAULT');
    setSelectedMode('SOLO');
    gameEngine.startMatch('SOLO', 'DEFAULT');
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
    setGameState({ ...st });
    setAppScreen('BATTLE');
  }, [authManager, gameEngine]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'trial') {
      params.delete('mode');
      const cleanSearch = params.toString();
      const nextUrl = window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', nextUrl);
      handleStartTrialMode();
    }
  }, [handleStartTrialMode]);

  const handleQuitToMenu = useCallback(() => {
    const wasTrial = authManager.isTrialMode() || isTrialMode;
    if (wasTrial) {
      authManager.exitTrialMode();
      setIsTrialMode(false);
      setIsMatchAllowed(false);
    } else {
      void coopManager.leaveRoom();
    }
    setOnlineDisconnectMsg(null);
    gameEngine.quitToMenu();
    setIsPaused(false);
    MusicManager.getInstance().pause();
    setGameState({ ...gameEngine.getState() });
    setAppScreen(wasTrial || !authManager.getCurrentUser() ? 'WELCOME' : 'MAIN_MENU');
  }, [authManager, isTrialMode, gameEngine, coopManager]);

  const handleSignIn = useCallback(async () => {
    setAuthProcessing(true);
    setAuthErrorMsg(null);
    setLogoutSuccessNotice(null);
    try {
      const res = await authManager.signInWithGoogle();
      if (!res.isValid) {
        setAuthErrorMsg(res.errorMessage || 'Đăng nhập không thành công.');
      } else {
        setAppScreen('MAIN_MENU');
      }
    } catch (err: any) {
      setAuthErrorMsg(err?.message || 'Lỗi khi đăng nhập bằng Google.');
    } finally {
      setAuthProcessing(false);
    }
  }, [authManager]);

  const handleSignOut = useCallback(async () => {
    setAuthProcessing(true);
    try {
      await coopManager.leaveRoom();
      setOnlineDisconnectMsg(null);
      gameEngine.quitToMenu();
      MusicManager.getInstance().pause();
      setIsPaused(false);
      await sessionManager.releaseSessionAndSignOut();
      setAppScreen('WELCOME');
      setLogoutSuccessNotice('Bạn đã đăng xuất an toàn.');
      setAuthErrorMsg(null);
    } finally {
      setAuthProcessing(false);
    }
  }, [gameEngine, sessionManager, coopManager]);

  const handleRetryAcquire = useCallback(async () => {
    if (!currentUser) return;
    setAuthProcessing(true);
    setAuthErrorMsg(null);
    try {
      const res = await sessionManager.acquireSession(currentUser.uid);
      if (!res.success && res.message) {
        setAuthErrorMsg(res.message);
      }
    } finally {
      setAuthProcessing(false);
    }
  }, [currentUser, sessionManager]);

  const handleReauth = useCallback(async () => {
    setAuthProcessing(true);
    try {
      await sessionManager.handleUserReauthenticate();
    } finally {
      setAuthProcessing(false);
    }
  }, [sessionManager]);

  const handleNextStageOrReplay = useCallback(() => {
    if (authManager.isTrialMode() || isTrialMode) {
      handleQuitToMenu();
      return;
    }
    if (!gameEngine.advanceToNextStage()) {
      gameEngine.restartStage();
    }
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
    setGameState({ ...st });
  }, [authManager, isTrialMode, handleQuitToMenu, gameEngine]);

  const handleResetGame = useCallback(() => {
    gameEngine.restartStage();
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'SOLO');
    setGameState({ ...st });
  }, [gameEngine]);

  const handleSpawnNextEnemy = useCallback(() => {
    if (!isSuperAdmin) return;
    gameEngine.spawnEnemyImmediate();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, isSuperAdmin]);

  const handleDifficultyChange = useCallback(
    (diff: 'DEFAULT' | 'EXTREME') => {
      setDifficulty(diff);
      gameEngine.setDifficulty(diff);
      setGameState({ ...gameEngine.getState() });
    },
    [gameEngine]
  );

  const handleTouchInput = useCallback(
    (input: Partial<InputState>) => {
      SessionManager.getInstance().recordUserActivity();
      if (
        gameEngine.getState().gameMode === 'TWO_PLAYERS_ONLINE' &&
        coopManager.getLocalRole() === 'GUEST'
      ) {
        gameEngine.setExternalInputP2(input);
        const p2In = gameEngine.getExternalInputP2();
        void coopManager.submitGuestInput(p2In, Date.now());
      } else {
        gameEngine.setExternalInput(input);
      }
    },
    [gameEngine, coopManager]
  );

  const handleLandscapeDirectionChange = useCallback(
    (dir: ActiveDirection) => {
      SessionManager.getInstance().recordUserActivity();
      landscapeDirRef.current = dir;
      setLandscapeDirection(dir);
      const dirInput: Partial<InputState> = {
        up: dir === 'UP',
        down: dir === 'DOWN',
        left: dir === 'LEFT',
        right: dir === 'RIGHT',
      };
      if (
        gameEngine.getState().gameMode === 'TWO_PLAYERS_ONLINE' &&
        coopManager.getLocalRole() === 'GUEST'
      ) {
        gameEngine.setExternalInputP2(dirInput);
        void coopManager.submitGuestInput(gameEngine.getExternalInputP2(), Date.now());
      } else {
        gameEngine.setExternalInput(dirInput);
      }
    },
    [gameEngine, coopManager]
  );

  const handleLandscapeShootChange = useCallback(
    (shooting: boolean) => {
      SessionManager.getInstance().recordUserActivity();
      setLandscapeShooting(shooting);
      if (
        gameEngine.getState().gameMode === 'TWO_PLAYERS_ONLINE' &&
        coopManager.getLocalRole() === 'GUEST'
      ) {
        gameEngine.setExternalInputP2({ shoot: shooting });
        void coopManager.submitGuestInput(gameEngine.getExternalInputP2(), Date.now());
      } else {
        gameEngine.setExternalInput({
          shoot: shooting,
        });
      }
    },
    [gameEngine, coopManager]
  );

  useEffect(() => {
    if (gameState?.matchState === 'PLAYING') {
      setIsMenuExpanded(false);
    }
  }, [gameState?.matchState]);

  useEffect(() => {
    if (isPaused) {
      landscapeDirRef.current = null;
      setLandscapeDirection(null);
      setLandscapeShooting(false);
    }
  }, [isPaused]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appScreen === 'BATTLE' && gameState?.matchState === 'MENU') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          handleRestart();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appScreen, gameState?.matchState, handleRestart]);

  const isGameOverModalOpen = Boolean(
    gameState && gameState.matchState === 'GAME_OVER'
  );
  const isStageClearModalOpen = Boolean(
    gameState && gameState.matchState === 'STAGE_CLEAR'
  );

  const handleProfileUpdated = useCallback(() => {
    setCurrentUser(authManager.getCurrentUser());
    setProfileRevision((r) => r + 1);
  }, [authManager]);


  // ===================================================================================
  // NHÚNG NEO-RETRO UI CALLBACKS CHO MOBILE CONTROLLER
  // ===================================================================================
  const handleNeoRetroFire = useCallback(() => {
    handleTouchInput({ shoot: true });
    // Reset ngay lập tức để mô phỏng "tap" nếu cần, hoặc quản lý touch state
    setTimeout(() => handleTouchInput({ shoot: false }), 100);
  }, [handleTouchInput]);

  const handleNeoRetroMove = useCallback((dir: 'up' | 'down' | 'left' | 'right' | null) => {
    if (!dir) {
      handleTouchInput({ up: false, down: false, left: false, right: false });
    } else {
      handleTouchInput({
        up: dir === 'up',
        down: dir === 'down',
        left: dir === 'left',
        right: dir === 'right'
      });
    }
  }, [handleTouchInput]);


  if ((!currentUser && (!isTrialMode || appScreen !== 'BATTLE')) || appScreen === 'WELCOME') {
    return (
      <div className="min-h-[100dvh] bg-neo-bg text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-neo-amber selection:text-black">
        {!isAuthReady && (
          <div className="w-full bg-black border-b border-neo-amber px-3 py-1 text-center text-[11px] font-pixel text-neo-amber">
            [ CHECKING SYSTEM STATUS... ]
          </div>
        )}
        <WelcomeScreen
          onSignIn={handleSignIn}
          onStartTrialMode={handleStartTrialMode}
          isProcessing={authProcessing}
          errorMessage={authErrorMsg}
          successMessage={logoutSuccessNotice}
          onClearFeedback={() => {
            setAuthErrorMsg(null);
            setLogoutSuccessNotice(null);
          }}
        />
      </div>
    );
  }

  if (appScreen === 'MAIN_MENU' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-neo-bg text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-neo-amber selection:text-black">
        {isSuperAdmin && (
          <DevToolsDrawer
            isOpen={isDevDrawerOpen}
            onClose={() => setIsDevDrawerOpen(false)}
            validation={validation}
          />
        )}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          isSuperAdmin={isSuperAdmin}
          user={currentUser}
          onProfileUpdated={handleProfileUpdated}
        />

        <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

        <MainMenuScreen
          user={{
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
          }}
          key={`main_menu_${profileRevision}`}
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onPlay={() => setAppScreen('MODE_SELECTION')}
          onSignOut={handleSignOut}
          onRetryAcquire={handleRetryAcquire}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          isSuperAdmin={isSuperAdmin}
        />

        <SessionAlertModal
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onReauth={handleReauth}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      </div>
    );
  }

  if (appScreen === 'MODE_SELECTION' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-neo-bg text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-neo-amber selection:text-black">
        {isSuperAdmin && (
          <DevToolsDrawer
            isOpen={isDevDrawerOpen}
            onClose={() => setIsDevDrawerOpen(false)}
            validation={validation}
          />
        )}

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          isSuperAdmin={isSuperAdmin}
          user={currentUser}
          onProfileUpdated={handleProfileUpdated}
        />

        <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

        <ModeSelectionScreen
          user={{
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
          }}
          firebaseUser={currentUser}
          key={`mode_select_${profileRevision}`}
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onBack={() => setAppScreen('MAIN_MENU')}
          onStartMatch={(mode, opt) => {
            handleStartMatch(mode, opt);
          }}
          onStartOnlineMatch={handleStartOnlineMatch}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          selectedMode={selectedMode}
          onSelectedModeChange={setSelectedMode}
          twoPlayerOption={twoPlayerOption}
          onTwoPlayerOptionChange={setTwoPlayerOption}
          isSuperAdmin={isSuperAdmin}
        />

        <SessionAlertModal
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onReauth={handleReauth}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-neo-bg text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-neo-amber selection:text-black">
      {isSuperAdmin && (
        <DevToolsDrawer
          isOpen={isDevDrawerOpen}
          onClose={() => setIsDevDrawerOpen(false)}
          validation={validation}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        difficulty={difficulty}
        onDifficultyChange={handleDifficultyChange}
        isSuperAdmin={isSuperAdmin}
        user={currentUser}
        onProfileUpdated={handleProfileUpdated}
      />

      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

      <AuthSessionBanner onStartMatchAllowedChange={setIsMatchAllowed} />

      {onlineDisconnectMsg && (
        <div className="bg-neo-rose/20 border-b-2 border-neo-rose px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-white z-40">
          <div className="flex items-center gap-2 font-bold font-pixel text-lg">
            <AlertTriangle className="w-4 h-4 text-neo-rose shrink-0" />
            <span>{onlineDisconnectMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOnlineDisconnectMsg(null);
                void coopManager.retryWebRTCConnection();
              }}
              className="btn-arcade-outline px-3 py-1 text-xs"
            >
              RECONNECT
            </button>
            <button
              type="button"
              onClick={handleQuitToMenu}
              className="btn-arcade px-3 py-1 text-xs !bg-neo-rose !text-white"
            >
              MENU
            </button>
          </div>
        </div>
      )}

      {(!isDesktop && layout.isLandscape) ? (
        <div className="flex-1 flex flex-col justify-start h-[100dvh] max-h-[100dvh] w-full overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          <header className="sticky top-0 z-40 h-8 bg-black/95 backdrop-blur-md border-b-2 border-neo-cyan px-2 flex items-center justify-between text-xs shrink-0 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <div className="flex items-center gap-1.5">
              <span className="font-pixel text-neo-amber text-lg">STAGE {gameState?.currentStageId ?? 1}</span>
              <span className={`w-2 h-2 rounded-sm pixel-corners ${isPaused ? 'bg-neo-amber' : 'bg-neo-cyan animate-pulse'}`} />
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
              {(() => {
                const remSec = typeof gameState?.remainingSeconds === 'number' ? gameState.remainingSeconds : getMatchDurationSecondsForDifficulty(gameState?.difficulty ?? difficulty);
                const isCrit = remSec <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
                return (
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 border-2 font-pixel text-lg ${isCrit ? 'bg-neo-rose/20 border-neo-rose text-neo-rose animate-pulse' : 'bg-black border-neo-cyan text-neo-cyan'}`}>
                    <span>{formatCountdownMMSS(remSec)}</span>
                  </div>
                );
              })()}
              <div className="flex items-center gap-1 text-neo-amber font-pixel text-lg">
                <span className="font-bold">{gameState?.score ?? 0} XP</span>
              </div>
              <div className="flex items-center gap-1 text-neo-rose font-pixel text-lg">
                <Heart className="w-3 h-3 fill-neo-rose" />
                <span>P1×{gameState?.p1State.lives ?? 3}</span>
              </div>
              {(gameState?.gameMode === 'TWO_PLAYERS_AI' || gameState?.gameMode === 'TWO_PLAYERS_ONLINE') && gameState?.p2State && (
                <div className="flex items-center gap-1 text-neo-cyan font-pixel text-lg">
                  <Heart className="w-3 h-3 fill-neo-cyan" />
                  <span>P2×{gameState.p2State.lives}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <QuickAudioToggleButton compact />
              <button type="button" onClick={isPaused ? handleResume : handlePause} className="btn-arcade-outline px-2 py-0.5 text-xs">
                {isPaused ? 'PLAY' : 'PAUSE'}
              </button>
            </div>
          </header>

          <main className="flex-1 flex flex-row items-start justify-center w-full min-h-[calc(100dvh-32px)] px-1 pt-1 pb-1 overflow-x-hidden overflow-y-auto bg-tactical-grid relative">
            <div className="crt-overlay"></div>
            <div style={{ width: `${layout.leftControlWidthPx}px`, minWidth: '90px' }} className="flex-1 self-stretch flex items-center justify-center relative z-10">
              <VirtualJoystick activeDirection={landscapeDirection} onDirectionChange={handleLandscapeDirectionChange} size={layout.isTabletOrDesktop ? 130 : 100} knobSize={layout.isTabletOrDesktop ? 46 : 36} deadZone={12} disabled={isPaused} />
            </div>

            <div style={{ width: `${layout.canvasSizePx}px`, height: `${layout.canvasSizePx}px`, maxWidth: `${layout.canvasSizePx}px`, maxHeight: `${layout.canvasSizePx}px` }} className="flex-none flex items-start justify-center overflow-hidden p-0 relative mx-auto z-10 border-4 border-neo-cyan shadow-[0_0_20px_rgba(0,240,255,0.4)] pixel-corners">
              <PhaserGame mode="battle" engine={gameEngine} onStateUpdate={setGameState} onFpsUpdate={setFps} onPause={handlePause} canvasSizePx={layout.canvasSizePx} />
              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-start pt-2 px-3 pb-3 text-center z-20 overflow-y-auto">
                  <GameLogo className="mb-1.5" />
                  <button type="button" onClick={isMatchAllowed ? handleRestart : undefined} disabled={!isMatchAllowed} className={`btn-arcade py-2 px-5 text-lg mt-4 ${!isMatchAllowed && 'opacity-50'}`}>
                    {isMatchAllowed ? 'START (SPACE)' : 'LOGIN REQUIRED'}
                  </button>
                </div>
              )}
            </div>

            <div style={{ width: `${layout.rightControlWidthPx}px`, minWidth: '90px' }} className="flex-1 self-stretch flex items-center justify-center relative z-10">
              <VirtualShootButton isShooting={landscapeShooting} onShootChange={handleLandscapeShootChange} size={layout.isTabletOrDesktop ? 76 : 64} />
            </div>
          </main>
        </div>
      ) : !isDesktop ? (
        <div className="flex-1 flex flex-col justify-start h-[100dvh] max-h-[100dvh] w-full overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-neo-bg">
          <header className="sticky top-0 z-40 h-10 bg-black/95 backdrop-blur-md border-b-2 border-neo-amber px-2 flex items-center justify-between text-xs shrink-0 shadow-[0_0_15px_rgba(255,184,0,0.3)]">
            <div className="flex items-center gap-2">
              <span className="font-pixel text-neo-amber text-xl">STAGE {gameState?.currentStageId ?? 1}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-pixel text-lg">
              {(() => {
                const remSec = typeof gameState?.remainingSeconds === 'number' ? gameState.remainingSeconds : getMatchDurationSecondsForDifficulty(gameState?.difficulty ?? difficulty);
                const isCrit = remSec <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
                return (
                  <div className={`px-1.5 border-2 ${isCrit ? 'bg-neo-rose/20 border-neo-rose text-neo-rose animate-pulse' : 'bg-black border-neo-cyan text-neo-cyan'}`}>
                    {formatCountdownMMSS(remSec)}
                  </div>
                );
              })()}
              <div className="text-neo-amber">{gameState?.score ?? 0}XP</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <QuickAudioToggleButton compact />
              <button type="button" onClick={() => setIsSettingsOpen(true)} className="p-1 border-2 border-neutral-700 text-neo-amber"><Settings className="w-4 h-4"/></button>
            </div>
          </header>

          <div className="flex-1 flex flex-col items-center justify-start w-full overflow-x-hidden overflow-y-auto px-2 pt-2 pb-2 bg-tactical-grid relative">
            <div className="crt-overlay"></div>
            
            <main style={{ width: `${layout.canvasSizePx}px`, height: `${layout.canvasSizePx}px` }} className="shrink-0 flex items-start justify-center overflow-hidden relative mx-auto pixel-corners border-4 border-neo-amber shadow-[0_0_20px_rgba(255,184,0,0.5)] bg-black z-10">
              <PhaserGame mode="battle" engine={gameEngine} onStateUpdate={setGameState} onFpsUpdate={setFps} onPause={handlePause} canvasSizePx={layout.canvasSizePx} />
              
              {/* NHÚNG NEO-RETRO MOBILE CONTROLLER LÊN TRÊN CANVAS NẾU LÀ MOBILE PORTRAIT VÀ ĐANG PLAYING */}
              {gameState?.matchState === 'PLAYING' && showTouchControls && (
                <MobileController onFire={handleNeoRetroFire} onMove={handleNeoRetroMove} />
              )}

              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-20">
                  <GameLogo className="mb-4 scale-75" />
                  <button type="button" onClick={isMatchAllowed ? handleRestart : undefined} disabled={!isMatchAllowed} className={`btn-arcade py-3 px-6 text-xl ${!isMatchAllowed && 'opacity-50'}`}>
                    {isMatchAllowed ? 'START MATCH' : 'LOGIN TO PLAY'}
                  </button>
                </div>
              )}
            </main>

            <div style={{ minHeight: 'max(28px, env(safe-area-inset-bottom, 28px))' }} className="flex-1 w-full" />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-start w-full bg-tactical-grid relative">
          <div className="crt-overlay"></div>
          <header className="border-b-2 border-neo-amber bg-black/90 px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sticky top-0 z-40">
            <div className="max-w-[1560px] mx-auto flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-pixel text-2xl text-neo-amber">STAGE {gameState?.currentStageId ?? 1}</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-pixel text-lg">
                <QuickAudioToggleButton showLabelOnDesktop />
                {!isTrialMode && (
                  <button type="button" onClick={() => setIsSettingsOpen(true)} className="btn-arcade-outline px-3 py-1">SETTINGS</button>
                )}
                <button type="button" onClick={() => setIsSupportOpen(true)} className="btn-arcade-outline px-3 py-1 !border-neo-cyan !text-neo-cyan">MANUAL</button>
              </div>
            </div>
          </header>

          <main className="max-w-[1560px] mx-auto w-full px-4 pt-4 pb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
            <section className="lg:col-span-8 flex flex-col gap-3">
              <div className="bg-black border-4 border-neo-cyan pixel-corners shadow-[0_0_20px_rgba(0,240,255,0.3)] flex flex-col justify-start">
                <div className="bg-neutral-950 px-4 py-2 border-b-2 border-neo-cyan flex items-center justify-between">
                  <div className="font-pixel text-neo-cyan text-xl">SYSTEM STATUS: {isPaused ? 'PAUSED' : 'ACTIVE'}</div>
                  <div className="flex gap-2">
                    <button onClick={isPaused ? handleResume : handlePause} className="btn-arcade-outline px-2 py-1 text-sm">{isPaused ? 'RESUME' : 'PAUSE'}</button>
                    <button onClick={handleResetGame} className="btn-arcade-outline px-2 py-1 text-sm !border-neo-rose !text-neo-rose">RESET</button>
                  </div>
                </div>
                <div className="p-4 bg-black flex items-start justify-center relative">
                  <div className="w-full max-w-[832px] aspect-square flex items-start justify-center border-2 border-neutral-800">
                    <PhaserGame mode="battle" engine={gameEngine} onStateUpdate={setGameState} onFpsUpdate={setFps} onPause={handlePause} canvasSizePx={layout.canvasSizePx} />
                  </div>
                  {gameState?.matchState === 'MENU' && (
                    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center text-center z-20">
                      <GameLogo className="mb-6" />
                      <button type="button" onClick={isMatchAllowed ? handleRestart : undefined} disabled={!isMatchAllowed} className="btn-arcade py-4 px-8 text-2xl">
                        {isMatchAllowed ? 'PRESS SPACE TO START' : 'LOGIN REQUIRED'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="lg:col-span-4 flex flex-col gap-4">
              <M3Hud state={gameState} onReset={handleResetGame} onSpawnEnemy={handleSpawnNextEnemy} onPause={handlePause} isSuperAdmin={isSuperAdmin} localOnlineRole={coopManager.getLocalRole()} />
            </section>
          </main>
        </div>
      )}

      <PauseModal isOpen={isPaused} onResume={handleResume} onRestart={handleRestart} onQuitToMenu={handleQuitToMenu} onOpenSettings={() => setIsSettingsOpen(true)} isTrialMode={isTrialMode} />
      <GameOverModal isOpen={isGameOverModalOpen} state={gameState} onRestart={handleRestart} onQuitToMenu={handleQuitToMenu} isTrialMode={isTrialMode} />
      <StageClearModal isOpen={isStageClearModalOpen} state={gameState} onNextStageOrReplay={handleNextStageOrReplay} onQuitToMenu={handleQuitToMenu} isTrialMode={isTrialMode} />
    </div>
  );
}
