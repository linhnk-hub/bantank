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
import { SettingsModal, type SettingsTabId } from './components/SettingsModal.tsx';
import { SupportModal } from './components/SupportModal.tsx';
import { SoundManager } from './core/audio.ts';
import { MusicManager, type GameModeScope } from './core/musicManager.ts';
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
  COOP_ONLINE_CONFIG,
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
  Eye,
} from 'lucide-react';

export default function App() {
  const authManager = useMemo(() => AuthManager.getInstance(), []);
  const sessionManager = useMemo(() => SessionManager.getInstance(), []);
  const coopManager = useMemo(() => CoopOnlineManager.getInstance(), []);

  // Screen View Routing: 'WELCOME' | 'MAIN_MENU' | 'MODE_SELECTION' | 'BATTLE'
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
  const [isReturningToLobby, setIsReturningToLobby] = useState<boolean>(false);
  const [returnToLobbyError, setReturnToLobbyError] = useState<string | null>(null);

  const isSuperAdmin = useMemo(() => isSuperAdminUser(currentUser), [currentUser]);

  // Milestone 4 Game State & Lifecycle
  const [gameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [, setFps] = useState<number>(60);
  const [difficulty, setDifficulty] = useState<'DEFAULT' | 'EXTREME'>('DEFAULT');
  const [selectedMode, setSelectedMode] = useState<'SOLO' | 'TWO_PLAYERS'>('SOLO');
  const [twoPlayerOption, setTwoPlayerOption] = useState<'P2_AI' | 'P2_REAL'>('P2_AI');
  const [profileRevision, setProfileRevision] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('ACCOUNT');
  const [isMatchAllowed, setIsMatchAllowed] = useState<boolean>(false);
  const [isTrialMode, setIsTrialMode] = useState<boolean>(() => authManager.isTrialMode());

  // Desktop PC detection: screen width >= 1024px with fine pointer (mouse/trackpad)
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

  // Sync Home BGM when entering MAIN_MENU / MODE_SELECTION, and pause on WELCOME
  useEffect(() => {
    const mm = MusicManager.getInstance();
    if (appScreen === 'MAIN_MENU' || appScreen === 'MODE_SELECTION') {
      if (currentUser) {
        mm.syncMenuPlayback();
      }
    } else if (appScreen === 'WELCOME') {
      mm.pause();
    }
  }, [appScreen, currentUser]);

  // Safe browser autoplay unlock for Web Audio API
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

  // On desktop PC with fine mouse pointer, default touch controls to hidden to maximize canvas size
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const desktop = window.innerWidth >= 1024 && window.matchMedia('(pointer: fine)').matches;
    return !desktop;
  });

  // Passive orientation detection hook (responds to physical OS rotation only)
  useOrientation();

  // Collapsible Menu & Developer Tools state
  const [isMenuExpanded, setIsMenuExpanded] = useState<boolean>(false);
  const [isDevDrawerOpen, setIsDevDrawerOpen] = useState<boolean>(false);

  // Virtual Controls state for Landscape 3-Column Layout
  const [landscapeDirection, setLandscapeDirection] = useState<ActiveDirection>(null);
  const [landscapeShooting, setLandscapeShooting] = useState<boolean>(false);
  const landscapeDirRef = useRef<ActiveDirection>(null);

  // Screen layout metrics (landscape, phone, tablet, desktop scaling)
  const layout = useViewportLayout();

  // Validate the official Stage 1 map using pure Game Core validator (M1)
  const validation = useMemo(() => validateStageMap(STAGE_1_MAP), []);

  const clearVirtualTouchInputs = useCallback(() => {
    landscapeDirRef.current = null;
    setLandscapeDirection(null);
    setLandscapeShooting(false);
    gameEngine.clearAllInputs();
  }, [gameEngine]);

  const handlePause = useCallback(() => {
    if (gameEngine.getState().gameMode === 'TWO_PLAYERS_ONLINE') {
      return;
    }
    clearVirtualTouchInputs();
    gameEngine.pause();
    setIsPaused(true);
    MusicManager.getInstance().pause();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, clearVirtualTouchInputs]);

  // Synchronize React isPaused state when GameEngine enters PAUSED internally (e.g. Forced Safety Pause)
  useEffect(() => {
    if (gameState?.matchState === 'PAUSED' && !isPaused) {
      clearVirtualTouchInputs();
      setIsPaused(true);
      MusicManager.getInstance().pause();
    }
  }, [gameState?.matchState, isPaused, clearVirtualTouchInputs]);

  // Neutralize any held virtual touch controls when window loses focus or tab becomes hidden
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

  // Global subscription to AuthManager & SessionManager
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

  // Monitor Co-op Online Room for peer disconnection / leave / FINISHED fail-safe during BATTLE
  useEffect(() => {
    if (appScreen !== 'BATTLE') return;
    const unsubCoop = coopManager.subscribe((room) => {
      const engState = gameEngine.getState();
      if (engState.gameMode !== 'TWO_PLAYERS_ONLINE') return;
      if (engState.isGameOver || engState.isStageClear || engState.matchState === 'MENU') return;

      const localRole = coopManager.getLocalRole();
      if (room && room.status === 'FINISHED') {
        if (localRole === 'GUEST') {
          const outcome = room.matchOutcome === 'VICTORY' ? 'VICTORY' : 'GAME_OVER';
          gameEngine.forceFinishFromOnlineRoom(
            outcome,
            typeof room.finalScore === 'number' ? room.finalScore : engState.score
          );
          clearVirtualTouchInputs();
          setGameState({ ...gameEngine.getState() });
        }
        return;
      }

      if (!room) {
        if (localRole === 'GUEST') {
          setOnlineDisconnectMsg('P1 đã rời trận.');
        }
        return;
      }
      if (room.status === 'ABANDONED') {
        if (localRole === 'HOST') {
          // Case E: Guest P2 left while Host P1 is playing -> P1 continues solo without pausing
          gameEngine.handlePeerPlayerLeft('P2');
          setGameState({ ...gameEngine.getState() });
          return;
        } else if (localRole === 'GUEST') {
          gameEngine.handlePeerPlayerLeft('P1');
          setOnlineDisconnectMsg('P1 đã rời trận.');
          return;
        }
      }
      const status = coopManager.evaluatePeerConnectionStatus(Date.now());
      if (status.isTimedOut) {
        setOnlineDisconnectMsg(status.warningMessage || 'Đồng đội đã ngắt kết nối.');
      }
    });

    const unsubPeerLeave = coopManager.subscribePeerLeave((event) => {
      const engState = gameEngine.getState();
      if (engState.gameMode !== 'TWO_PLAYERS_ONLINE') return;
      if (engState.isGameOver || engState.isStageClear || engState.matchState === 'MENU') return;
      const leftPlayer = event.role === 'HOST' ? 'P1' : 'P2';
      gameEngine.handlePeerPlayerLeft(leftPlayer);
      setGameState({ ...gameEngine.getState() });
      if (event.role === 'HOST') {
        setOnlineDisconnectMsg(event.message);
      }
    });

    const heartbeatTimerId = setInterval(() => {
      const engState = gameEngine.getState();
      if (engState.gameMode !== 'TWO_PLAYERS_ONLINE') return;
      if (engState.isGameOver || engState.isStageClear || engState.matchState === 'MENU') return;
      const status = coopManager.evaluatePeerConnectionStatus(Date.now());
      if (status.isTimedOut) {
        setOnlineDisconnectMsg(status.warningMessage || 'Đồng đội đã ngắt kết nối.');
      }
    }, COOP_ONLINE_CONFIG.HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(heartbeatTimerId);
      unsubCoop();
      unsubPeerLeave();
    };
  }, [appScreen, coopManager, gameEngine, clearVirtualTouchInputs]);

  const handleResume = useCallback(() => {
    clearVirtualTouchInputs();
    gameEngine.resume();
    setIsPaused(false);
    MusicManager.getInstance().resume();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, clearVirtualTouchInputs]);

  const getMusicModeFromEngine = useCallback((eng: GameEngine): GameModeScope => {
    const gm = eng.getState().gameMode;
    if (gm === 'TWO_PLAYERS_AI') return 'COOP_AI';
    if (gm === 'TWO_PLAYERS_ONLINE') return 'TWO_PLAYER';
    return 'SOLO';
  }, []);

  const handleRestart = useCallback(() => {
    clearVirtualTouchInputs();
    gameEngine.restartStage();
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(
      st.currentStageId,
      getMusicModeFromEngine(gameEngine)
    );
    setGameState({ ...st });
  }, [gameEngine, clearVirtualTouchInputs, getMusicModeFromEngine]);

  const handleStartMatch = useCallback(
    (mode: 'SOLO' | 'TWO_PLAYERS' = 'SOLO', twoPlayerOption?: 'P2_AI' | 'P2_REAL') => {
      if (sessionSnapshot.status !== 'ACTIVE') return;
      setOnlineDisconnectMsg(null);
      const engineMode = mode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_AI' ? 'TWO_PLAYERS_AI' : 'SOLO';
      gameEngine.startMatch(engineMode, difficulty);
      setIsPaused(false);
      const st = gameEngine.getState();
      MusicManager.getInstance().syncPlaybackWithContext(
        st.currentStageId,
        getMusicModeFromEngine(gameEngine)
      );
      setGameState({ ...st });
      setAppScreen('BATTLE');
    },
    [sessionSnapshot.status, gameEngine, difficulty, getMusicModeFromEngine]
  );

  const handleStartOnlineMatch = useCallback(
    (room: CoopRoomDocument, _role: CoopPlayerRole) => {
      if (sessionManager.getSnapshot().status !== 'ACTIVE') return;
      setOnlineDisconnectMsg(null);
      setIsReturningToLobby(false);
      setReturnToLobbyError(null);
      setDifficulty(room.difficulty);
      gameEngine.startMatch('TWO_PLAYERS_ONLINE', room.difficulty);
      setIsPaused(false);
      const st = gameEngine.getState();
      MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'TWO_PLAYER');
      setGameState({ ...st });
      setAppScreen('BATTLE');
    },
    [sessionManager, gameEngine]
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

  // Support direct navigation from landing.html (?mode=trial)
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
    setIsReturningToLobby(false);
    setReturnToLobbyError(null);
    gameEngine.quitToMenu();
    setIsPaused(false);
    const targetScreen = wasTrial || !authManager.getCurrentUser() ? 'WELCOME' : 'MAIN_MENU';
    if (targetScreen === 'MAIN_MENU') {
      MusicManager.getInstance().syncMenuPlayback();
    } else {
      MusicManager.getInstance().pause();
    }
    setGameState({ ...gameEngine.getState() });
    setAppScreen(targetScreen);
  }, [authManager, isTrialMode, gameEngine, coopManager]);

  const handleReturnToLobby = useCallback(async () => {
    if (!currentUser) {
      setReturnToLobbyError('Vui lòng đăng nhập lại để quay về phòng chờ.');
      return;
    }
    setIsReturningToLobby(true);
    setReturnToLobbyError(null);
    try {
      const res = await coopManager.returnToLobbyFromMatch({
        uid: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        emailVerified: currentUser.emailVerified,
        photoURL: currentUser.photoURL,
      });
      if (!res.success) {
        setReturnToLobbyError(res.message || 'Không thể quay về phòng chờ chung.');
        return;
      }
      setOnlineDisconnectMsg(null);
      clearVirtualTouchInputs();
      gameEngine.quitToMenu();
      setIsPaused(false);
      MusicManager.getInstance().syncMenuPlayback();
      setGameState({ ...gameEngine.getState() });
      setSelectedMode('TWO_PLAYERS');
      setTwoPlayerOption('P2_REAL');
      setAppScreen('MODE_SELECTION');
    } catch (err: any) {
      setReturnToLobbyError(err?.message || 'Lỗi khi quay về phòng chờ chung.');
    } finally {
      setIsReturningToLobby(false);
    }
  }, [currentUser, coopManager, clearVirtualTouchInputs, gameEngine]);

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
    MusicManager.getInstance().syncPlaybackWithContext(
      st.currentStageId,
      getMusicModeFromEngine(gameEngine)
    );
    setGameState({ ...st });
  }, [authManager, isTrialMode, handleQuitToMenu, gameEngine, getMusicModeFromEngine]);

  const handleResetGame = useCallback(() => {
    gameEngine.restartStage();
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(
      st.currentStageId,
      getMusicModeFromEngine(gameEngine)
    );
    setGameState({ ...st });
  }, [gameEngine, getMusicModeFromEngine]);

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

  // Handle touch inputs from either Portrait or Landscape virtual controls
  const handleTouchInput = useCallback(
    (input: Partial<InputState>) => {
      SessionManager.getInstance().recordUserActivity();
      if (
        gameEngine.getState().gameMode === 'TWO_PLAYERS_ONLINE' &&
        coopManager.getLocalRole() === 'GUEST'
      ) {
        gameEngine.setVirtualTouchInputP2(input);
        const p2In = gameEngine.getVirtualTouchInputP2();
        gameEngine.setExternalInputP2(p2In);
        void coopManager.submitGuestInput(p2In, Date.now());
      } else {
        gameEngine.setVirtualTouchInput(input);
        gameEngine.setExternalInput(input);
      }
    },
    [gameEngine, coopManager]
  );

  // Landscape specific multi-touch handlers with independent release
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
        gameEngine.setVirtualTouchInputP2(dirInput);
        const p2In = gameEngine.getVirtualTouchInputP2();
        gameEngine.setExternalInputP2(p2In);
        void coopManager.submitGuestInput(p2In, Date.now());
      } else {
        gameEngine.setVirtualTouchInput(dirInput);
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
        gameEngine.setVirtualTouchInputP2({ shoot: shooting });
        const p2In = gameEngine.getVirtualTouchInputP2();
        gameEngine.setExternalInputP2(p2In);
        void coopManager.submitGuestInput(p2In, Date.now());
      } else {
        gameEngine.setVirtualTouchInput({
          shoot: shooting,
        });
        gameEngine.setExternalInput({
          shoot: shooting,
        });
      }
    },
    [gameEngine, coopManager]
  );

  // Auto-collapse menu when match starts/resumes
  useEffect(() => {
    if (gameState?.matchState === 'PLAYING') {
      setIsMenuExpanded(false);
    }
  }, [gameState?.matchState]);

  // When paused, clear landscape controls
  useEffect(() => {
    if (isPaused) {
      landscapeDirRef.current = null;
      setLandscapeDirection(null);
      setLandscapeShooting(false);
    }
  }, [isPaused]);

  // Listen for Space / Enter to start game when in MENU state during BATTLE
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

  const isCoopOnlineMatch = gameState?.gameMode === 'TWO_PLAYERS_ONLINE';
  const localOnlineRole = isCoopOnlineMatch ? coopManager.getLocalRole() : null;
  const isLocalSpectator = Boolean(
    gameState &&
      !gameState.isGameOver &&
      !gameState.isStageClear &&
      (gameState.gameMode === 'TWO_PLAYERS_ONLINE' || gameState.gameMode === 'TWO_PLAYERS_AI') &&
      (gameState.gameMode === 'TWO_PLAYERS_ONLINE' && localOnlineRole === 'GUEST'
        ? Boolean(
            gameState.p2State &&
              (gameState.p2State.isSpectator ||
                (gameState.p2State.isDead && gameState.p2State.lives <= 0))
          )
        : Boolean(
            gameState.p1State.isSpectator ||
              (gameState.p1State.isDead && gameState.p1State.lives <= 0)
          ))
  );

  // Neutralize touch controls immediately when entering spectator mode
  useEffect(() => {
    if (isLocalSpectator) {
      clearVirtualTouchInputs();
    }
  }, [isLocalSpectator, clearVirtualTouchInputs]);

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

  // View 1: Welcome Screen (Unauthenticated user or initial landing - V.1: Clean screen without Top Menu)
  if ((!currentUser && (!isTrialMode || appScreen !== 'BATTLE')) || appScreen === 'WELCOME') {
    return (
      <div className="min-h-[100dvh] bg-neutral-950 text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
        {!isAuthReady && (
          <div className="w-full bg-neutral-900/90 border-b border-neutral-800 px-3 py-1 text-center text-[11px] font-mono text-amber-300/90">
            Đang kiểm tra trạng thái kết nối...
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

  // View 2: Main Menu Screen (Authenticated user before entering battle)
  if (appScreen === 'MAIN_MENU' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-neutral-950 text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
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
          initialTab={settingsInitialTab}
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
          onOpenSettings={() => {
            setSettingsInitialTab('ACCOUNT');
            setIsSettingsOpen(true);
          }}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          isSuperAdmin={isSuperAdmin}
        />

        {/* Protective Interruption Modal if displaced while on menu */}
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

  // View 2.5: Mode Selection Screen (Select SOLO vs CO-OP AI vs CO-OP ONLINE)
  if (appScreen === 'MODE_SELECTION' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-neutral-950 text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
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
          initialTab={settingsInitialTab}
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
          onOpenSettings={() => {
            setSettingsInitialTab('ACCOUNT');
            setIsSettingsOpen(true);
          }}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          selectedMode={selectedMode}
          onSelectedModeChange={setSelectedMode}
          twoPlayerOption={twoPlayerOption}
          onTwoPlayerOptionChange={setTwoPlayerOption}
          isSuperAdmin={isSuperAdmin}
        />

        {/* Protective Interruption Modal if displaced while on mode selection */}
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

  // View 3: Battle Arena with Canvas (Only mounted when player clicked "Chơi ngay")
  return (
    <div className="min-h-[100dvh] bg-neutral-950 text-neutral-100 flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* Developer & QA Test Suite Drawer (Admin Only) */}
      {isSuperAdmin && (
        <DevToolsDrawer
          isOpen={isDevDrawerOpen}
          onClose={() => setIsDevDrawerOpen(false)}
          validation={validation}
        />
      )}

      {/* Unified Settings Modal (Account + Sound) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
        difficulty={difficulty}
        onDifficultyChange={handleDifficultyChange}
        isSuperAdmin={isSuperAdmin}
        user={currentUser}
        onProfileUpdated={handleProfileUpdated}
      />

      {/* Support Modal */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

      {/* M7.1: Firebase Authentication & Single-Device Session Header Banner */}
      <AuthSessionBanner onStartMatchAllowedChange={setIsMatchAllowed} />

      {/* Co-op Online Peer Disconnection Banner */}
      {onlineDisconnectMsg && (
        <div className="bg-red-950/95 border-b border-red-700 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-red-200 z-40">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{onlineDisconnectMsg}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOnlineDisconnectMsg(null);
                void coopManager.retryWebRTCConnection();
              }}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs cursor-pointer"
            >
              Thử Kết Nối Lại P2P
            </button>
            <button
              type="button"
              onClick={handleQuitToMenu}
              className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer"
            >
              Về Menu Chính
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          LANDSCAPE MODE (Mobile / Tablet 3-Column Ergonomic Layout - Top Aligned)
         ========================================================================= */}
      {(!isDesktop && layout.isLandscape) ? (
        <div className="flex-1 flex flex-col justify-start h-[100dvh] max-h-[100dvh] w-full overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
          {/* Slim Landscape Top HUD (32px) — Sticky Top Menu */}
          <header className="sticky top-0 z-40 h-8 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800 px-2 sm:px-3 flex items-center justify-between text-xs shrink-0 shadow">
            {/* Left: Stage Status */}
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-amber-400 tracking-wider text-xs font-mono">
                STAGE {gameState?.currentStageId ?? 1}
              </span>
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            </div>

            {/* Center: Live Match Metrics (No remaining enemy count per M7.3 IV) */}
            <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono">
              {(() => {
                const remSec =
                  typeof gameState?.remainingSeconds === 'number'
                    ? gameState.remainingSeconds
                    : getMatchDurationSecondsForDifficulty(gameState?.difficulty ?? difficulty);
                const isCrit = remSec <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
                const isWarn = !isCrit && remSec <= MATCH_TIMER_CONFIG.WARNING_THRESHOLD_S;
                return (
                  <div
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold ${
                      isCrit
                        ? 'bg-red-950/90 border-red-500 text-red-300 animate-pulse'
                        : isWarn
                        ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                        : 'bg-neutral-900 border-neutral-700 text-emerald-300'
                    }`}
                    title="Thời gian còn lại của trận đấu"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{formatCountdownMMSS(remSec)}</span>
                  </div>
                );
              })()}
              <div className="flex items-center gap-1 text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <span className="font-bold">{gameState?.score ?? 0} XP</span>
              </div>
              <div className="flex items-center gap-1 text-rose-400 font-bold" title="Mạng P1">
                <Heart className="w-3.5 h-3.5 fill-rose-500" />
                <span>P1×{gameState?.p1State.lives ?? 3}</span>
              </div>
              {(gameState?.gameMode === 'TWO_PLAYERS_AI' || gameState?.gameMode === 'TWO_PLAYERS_ONLINE') && gameState?.p2State && (
                <div className="flex items-center gap-1 text-emerald-400 font-bold" title="Mạng P2">
                  <Heart className="w-3.5 h-3.5 fill-emerald-500" />
                  <span>P2×{gameState.p2State.lives}</span>
                </div>
              )}
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* M7.3.10 Section 3: Quick Audio Mute/Unmute Button */}
              <QuickAudioToggleButton compact />

              {!isCoopOnlineMatch && (
                <button
                  type="button"
                  onClick={isPaused ? handleResume : handlePause}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold shadow cursor-pointer"
                >
                  {isPaused ? <Play className="w-3 h-3 fill-white" /> : <Pause className="w-3 h-3 fill-white" />}
                  <span className="hidden xs:inline">{isPaused ? 'Tiếp tục' : 'Tạm dừng'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setSettingsInitialTab('ACCOUNT');
                  setIsSettingsOpen(true);
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold cursor-pointer"
                title="Cài đặt"
              >
                <Settings className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Cài đặt</span>
              </button>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsDevDrawerOpen(true)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-xs font-semibold cursor-pointer"
                  title="Bảng Kiểm thử & QA (Admin)"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span className="hidden sm:inline">QA</span>
                </button>
              )}
            </div>
          </header>

          {/* Landscape Main 3-Column Combat View - Top Aligned */}
          <main className="flex-1 flex flex-row items-start justify-center w-full min-h-[calc(100dvh-32px)] px-1 sm:px-2 pt-1 pb-1 overflow-x-hidden overflow-y-auto">
            {/* Left Column: Virtual Joystick */}
            <div
              style={{
                width: `${layout.leftControlWidthPx}px`,
                minWidth: '90px',
              }}
              className="flex-1 self-stretch flex items-center justify-center"
            >
              <VirtualJoystick
                activeDirection={landscapeDirection}
                onDirectionChange={handleLandscapeDirectionChange}
                size={layout.isTabletOrDesktop ? 130 : 100}
                knobSize={layout.isTabletOrDesktop ? 46 : 36}
                deadZone={12}
                disabled={isPaused || isLocalSpectator}
              />
            </div>

            {/* Center Column: Game Canvas Maximized 1:1 Aspect Ratio (Top Aligned) */}
            <div
              style={{
                width: `${layout.canvasSizePx}px`,
                height: `${layout.canvasSizePx}px`,
                maxWidth: `${layout.canvasSizePx}px`,
                maxHeight: `${layout.canvasSizePx}px`,
              }}
              className="flex-none flex items-start justify-center overflow-hidden p-0 relative mx-auto"
            >
              <PhaserGame
                mode="battle"
                engine={gameEngine}
                onStateUpdate={setGameState}
                onFpsUpdate={setFps}
                onPause={handlePause}
                canvasSizePx={layout.canvasSizePx}
              />

              {isLocalSpectator && (
                <div
                  data-testid="mobile-spectator-banner"
                  className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-950/90 border border-sky-500/60 text-sky-200 text-[11px] font-bold shadow-lg whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Đã hết mạng — Đang xem đồng đội thi đấu</span>
                </div>
              )}

              {/* In MENU state: Overlay allowing immediate match start */}
              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-start pt-2 px-3 pb-3 text-center z-20 rounded-sm overflow-y-auto">
                  <GameLogo className="mb-1.5" />
                  <p className="text-xs text-amber-300 font-mono font-bold mb-2">
                    STAGE {gameState?.currentStageId ?? 1}
                  </p>
                  <button
                    type="button"
                    onClick={isMatchAllowed ? handleRestart : undefined}
                    disabled={!isMatchAllowed}
                    className={`py-2 px-5 rounded-xl font-extrabold text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 shrink-0 ${
                      isMatchAllowed
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30 cursor-pointer'
                        : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <Play className={`w-3.5 h-3.5 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                    <span>{isMatchAllowed ? 'BẮT ĐẦU TRẬN ĐẤU' : 'ĐĂNG NHẬP GMAIL ĐỂ BẮT ĐẦU'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Column: Virtual Shoot Action Button */}
            <div
              style={{
                width: `${layout.rightControlWidthPx}px`,
                minWidth: '90px',
              }}
              className={`flex-1 self-stretch flex items-center justify-center ${
                isLocalSpectator ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <VirtualShootButton
                isShooting={landscapeShooting}
                onShootChange={handleLandscapeShootChange}
                size={layout.isTabletOrDesktop ? 76 : 64}
              />
            </div>
          </main>
        </div>
      ) : !isDesktop ? (
        /* =========================================================================
            MOBILE / TABLET PORTRAIT MODE (Dedicated 100dvh Top-to-Bottom Stack)
           ========================================================================= */
        <div className="flex-1 flex flex-col justify-start h-[100dvh] max-h-[100dvh] w-full overflow-x-hidden overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-neutral-950">
          {/* Slim Portrait Top HUD — Sticky Top Menu */}
          <header className="sticky top-0 z-40 h-9 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800 px-2.5 sm:px-3 flex items-center justify-between text-xs shrink-0 shadow">
            {/* Left: Stage Status */}
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-amber-400 tracking-wider text-xs font-mono">
                STAGE {gameState?.currentStageId ?? 1}
              </span>
              <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
            </div>

            {/* Center: Live Match Metrics (No remaining enemy count per M7.3 IV) */}
            <div className="flex items-center gap-2 text-xs font-mono">
              {(() => {
                const remSec =
                  typeof gameState?.remainingSeconds === 'number'
                    ? gameState.remainingSeconds
                    : getMatchDurationSecondsForDifficulty(gameState?.difficulty ?? difficulty);
                const isCrit = remSec <= MATCH_TIMER_CONFIG.CRITICAL_THRESHOLD_S;
                const isWarn = !isCrit && remSec <= MATCH_TIMER_CONFIG.WARNING_THRESHOLD_S;
                return (
                  <div
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded border font-bold ${
                      isCrit
                        ? 'bg-red-950/90 border-red-500 text-red-300 animate-pulse'
                        : isWarn
                        ? 'bg-amber-950/80 border-amber-500/80 text-amber-300'
                        : 'bg-neutral-900 border-neutral-700 text-emerald-300'
                    }`}
                    title="Thời gian còn lại của trận đấu"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{formatCountdownMMSS(remSec)}</span>
                  </div>
                );
              })()}
              <div className="flex items-center gap-1 text-amber-400">
                <Trophy className="w-3.5 h-3.5" />
                <span className="font-bold">{gameState?.score ?? 0} XP</span>
              </div>
              <div className="flex items-center gap-1 text-rose-400 font-bold" title="Mạng P1">
                <Heart className="w-3.5 h-3.5 fill-rose-500" />
                <span>P1×{gameState?.p1State.lives ?? 3}</span>
              </div>
              {(gameState?.gameMode === 'TWO_PLAYERS_AI' || gameState?.gameMode === 'TWO_PLAYERS_ONLINE') && gameState?.p2State && (
                <div className="flex items-center gap-1 text-emerald-400 font-bold" title="Mạng P2">
                  <Heart className="w-3.5 h-3.5 fill-emerald-500" />
                  <span>P2×{gameState.p2State.lives}</span>
                </div>
              )}
            </div>

            {/* Right: Quick Action Buttons */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* M7.3.10 Section 3: Quick Audio Mute/Unmute Button */}
              <QuickAudioToggleButton compact />

              <button
                type="button"
                onClick={() => {
                  setSettingsInitialTab('ACCOUNT');
                  setIsSettingsOpen(true);
                }}
                className="p-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 cursor-pointer"
                title="Cài đặt"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsSupportOpen(true)}
                className="p-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-sky-500 text-neutral-300 cursor-pointer"
                title="Hướng dẫn điều khiển"
              >
                <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
              </button>

              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setIsDevDrawerOpen(true)}
                  className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-300 text-[10px] font-semibold cursor-pointer"
                  title="Bảng Kiểm thử & QA (Admin)"
                >
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span>QA</span>
                </button>
              )}
            </div>
          </header>

          {/* Main Content Stack: HUD -> Canvas -> Controls -> Safe Bottom Spacer */}
          <div className="flex-1 flex flex-col items-center justify-start w-full overflow-x-hidden overflow-y-auto px-2 pt-1 pb-2">
            <main
              style={{
                width: `${layout.canvasSizePx}px`,
                height: `${layout.canvasSizePx}px`,
                maxWidth: `${layout.canvasSizePx}px`,
                maxHeight: `${layout.canvasSizePx}px`,
              }}
              className="shrink-0 flex items-start justify-center overflow-hidden relative mx-auto rounded-xl border border-neutral-800 bg-black shadow-2xl mt-0.5 sm:mt-1"
            >
              <PhaserGame
                mode="battle"
                engine={gameEngine}
                onStateUpdate={setGameState}
                onFpsUpdate={setFps}
                onPause={handlePause}
                canvasSizePx={layout.canvasSizePx}
              />

              {/* In MENU state: Overlay allowing immediate match start */}
              {gameState?.matchState === 'MENU' && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-start pt-2 px-3 pb-3 text-center z-20 rounded-xl overflow-y-auto">
                  <GameLogo className="mb-1.5" />
                  <p className="text-xs text-amber-300 font-mono font-bold mb-2">
                    STAGE {gameState?.currentStageId ?? 1}
                  </p>
                  <button
                    type="button"
                    onClick={isMatchAllowed ? handleRestart : undefined}
                    disabled={!isMatchAllowed}
                    className={`py-2 px-5 rounded-xl font-extrabold text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 shrink-0 ${
                      isMatchAllowed
                        ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30 cursor-pointer'
                        : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <Play className={`w-3.5 h-3.5 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                    <span>{isMatchAllowed ? 'BẮT ĐẦU TRẬN ĐẤU' : 'ĐĂNG NHẬP GMAIL ĐỂ BẮT ĐẦU'}</span>
                  </button>
                </div>
              )}
            </main>

            {isLocalSpectator && (
              <div
                data-testid="mobile-spectator-banner"
                className="mt-2 px-3 py-1.5 rounded-lg bg-sky-950/90 border border-sky-500/60 text-sky-200 text-xs font-bold flex items-center gap-2 shadow"
              >
                <Eye className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Bạn đã hết mạng — Đang ở chế độ Xem đồng đội</span>
              </div>
            )}

            {/* Controls Cluster */}
            <div
              style={{
                width: `${layout.canvasSizePx}px`,
                maxWidth: layout.isTabletOrDesktop ? `${Math.max(layout.canvasSizePx, 680)}px` : '440px',
                marginTop: isLocalSpectator ? '12px' : '28px',
              }}
              className={`w-full shrink-0 mx-auto z-20 flex justify-center ${
                isLocalSpectator ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <TouchControls
                onInputChange={handleTouchInput}
                onPauseClick={isPaused ? handleResume : handlePause}
                isPaused={isPaused || isLocalSpectator}
                controlType="joystick"
                disablePause={isCoopOnlineMatch}
              />
            </div>

            <div
              style={{
                minHeight: 'max(28px, env(safe-area-inset-bottom, 28px))',
              }}
              className="flex-1 w-full"
            />
          </div>
        </div>
      ) : (
        /* =========================================================================
            ENLARGED DESKTOP PC MODE (8/4 Grid Layout with Top Alignment)
           ========================================================================= */
        <div className="flex-1 flex flex-col justify-start w-full">
          {/* Header (M7.3.10: Sticky Top Menu with Safe Area & Quick Audio Mute/Unmute) */}
          <header className="border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-md px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sticky top-0 z-40 shadow-md">
            <div className="max-w-[1560px] mx-auto flex items-center justify-between gap-2">
              {/* Stage Indicator */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono font-bold">
                  STAGE {gameState?.currentStageId ?? 1}
                </span>
              </div>

              {/* Header Right Actions */}
              <div className="flex items-center gap-1.5 text-xs">
                {/* M7.3.10 Section 3: Quick Audio Mute/Unmute Button */}
                <QuickAudioToggleButton showLabelOnDesktop />

                {!isTrialMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsInitialTab('ACCOUNT');
                      setIsSettingsOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-200 font-semibold transition-all shadow cursor-pointer"
                    title="Cài đặt Tài khoản & Media"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Cài đặt</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsSupportOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-sky-500 text-neutral-200 font-semibold transition-all shadow cursor-pointer"
                  title="Hướng dẫn điều khiển"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                  <span className="hidden sm:inline">Hướng dẫn</span>
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setIsDevDrawerOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-700 hover:border-amber-500 text-neutral-200 font-semibold transition-all shadow cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">QA Suite</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsMenuExpanded((v) => !v)}
                  className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all sm:hidden"
                  aria-label="Thu gọn/Mở rộng Menu"
                >
                  {isMenuExpanded ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Mobile Expanded Menu Strip */}
            {isMenuExpanded && (
              <div className="mt-2.5 pt-2 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 sm:hidden text-xs animate-fade-in">
                {isSuperAdmin && (
                  <button
                    onClick={() => {
                      setIsDevDrawerOpen(true);
                      setIsMenuExpanded(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-200 font-semibold"
                  >
                    <Wrench className="w-3.5 h-3.5 text-amber-400" />
                    <span>QA Suite</span>
                  </button>
                )}
                <button
                  onClick={() => setShowTouchControls((v) => !v)}
                  className="flex items-center gap-1 py-2 px-3 rounded-lg bg-neutral-800 text-neutral-300 text-xs"
                >
                  <span>Cảm ứng: {showTouchControls ? 'Bật' : 'Tắt'}</span>
                </button>
              </div>
            )}
          </header>

          {/* Main Content Area - Top Aligned */}
          <main className="max-w-[1560px] mx-auto w-full px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            {/* Left Column: Enlarged Phaser Game Canvas */}
            <section className="lg:col-span-8 flex flex-col justify-start gap-3">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col justify-start">
                {/* Viewport Header */}
                <div className="bg-neutral-950 px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                    <span className="font-semibold text-amber-400 font-mono">
                      STAGE {gameState?.currentStageId ?? 1} {isPaused ? '(PAUSED)' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTouchControls((v) => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        showTouchControls
                          ? 'bg-neutral-800 text-amber-400 border-amber-500/40'
                          : 'text-neutral-400 border-neutral-800 hover:text-neutral-200'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Joystick: {showTouchControls ? 'Bật' : 'Tắt'}</span>
                    </button>

                    {!isCoopOnlineMatch && (
                      <>
                        <button
                          onClick={isPaused ? handleResume : handlePause}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold"
                        >
                          <Pause className="w-3 h-3" />
                          <span>{isPaused ? 'Tiếp tục' : 'Tạm dừng (P)'}</span>
                        </button>

                        <button
                          onClick={handleResetGame}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Đặt lại</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Canvas Container - Top Aligned */}
                <div className="p-3 sm:p-4 lg:p-5 bg-neutral-950/80 flex items-start justify-center relative">
                  <div className="w-full max-w-[min(calc(100dvh-140px),832px)] aspect-square flex items-start justify-center">
                    <PhaserGame
                      mode="battle"
                      engine={gameEngine}
                      onStateUpdate={setGameState}
                      onFpsUpdate={setFps}
                      onPause={handlePause}
                      canvasSizePx={layout.canvasSizePx}
                    />
                  </div>

                  {/* In MENU state: Overlay allowing immediate match start */}
                  {gameState?.matchState === 'MENU' && (
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-start pt-4 px-6 pb-4 text-center z-20 rounded-xl overflow-y-auto">
                      <GameLogo className="mb-2" />
                      <p className="text-sm sm:text-base text-amber-400 font-mono font-bold mb-3">
                        STAGE {gameState?.currentStageId ?? 1}
                      </p>
                      <button
                        type="button"
                        onClick={isMatchAllowed ? handleRestart : undefined}
                        disabled={!isMatchAllowed}
                        className={`py-3 px-8 rounded-xl font-extrabold text-sm shadow-xl transition-transform active:scale-95 flex items-center gap-2.5 shrink-0 ${
                          isMatchAllowed
                            ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/30 cursor-pointer'
                            : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                        }`}
                      >
                        <Play className={`w-4 h-4 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                        <span>{isMatchAllowed ? 'BẮT ĐẦU TRẬN ĐẤU (SPACE / ENTER)' : 'ĐĂNG NHẬP GMAIL ĐỂ BẮT ĐẦU'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Viewport Footer */}
                <div className="bg-neutral-950 px-4 py-2 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-sky-400 text-[11px] transition-colors cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                    <span>Xem hướng dẫn điều khiển trong mục Hướng dẫn</span>
                  </button>
                  <div className="text-[11px] text-neutral-500 font-mono">
                    60 FPS
                  </div>
                </div>
              </div>

              {showTouchControls && (
                <div className={isLocalSpectator ? 'pointer-events-none opacity-40' : ''}>
                  <TouchControls
                    onInputChange={handleTouchInput}
                    onPauseClick={isPaused ? handleResume : handlePause}
                    isPaused={isPaused || isLocalSpectator}
                    controlType="joystick"
                    disablePause={isCoopOnlineMatch}
                  />
                </div>
              )}
            </section>

            {/* Right Column: Live Combat HUD & Quick Stats (4 Cols on PC) */}
            <section className="lg:col-span-4 flex flex-col gap-4">
              <M3Hud
                state={gameState}
                onReset={isCoopOnlineMatch ? undefined : handleResetGame}
                onSpawnEnemy={handleSpawnNextEnemy}
                onPause={isCoopOnlineMatch ? undefined : handlePause}
                isSuperAdmin={isSuperAdmin}
                localOnlineRole={localOnlineRole}
              />

              {/* Admin Only: Terrain Legend & QA Quick Access Card */}
              {isSuperAdmin && (
                <>
                  <TerrainLegend tileCounts={validation.tileCounts} />

                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-xs flex flex-col gap-2.5 shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-amber-400" />
                        <span className="font-bold text-white">Bảng Kiểm Thử & QA (Admin)</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                        ADMIN
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDevDrawerOpen(true)}
                      className="w-full py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-amber-400" />
                      <span>Mở Bảng Điều Khiển Kiểm Thử & QA</span>
                    </button>
                  </div>
                </>
              )}
            </section>
          </main>

          {/* Footer */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center text-xs text-neutral-500">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
          <span>•</span>
          <a href="/landing.html" className="hover:text-amber-400 transition-colors">
            Giới thiệu
          </a>
          <span>•</span>
          <a href="/privacy.html" className="hover:text-amber-400 transition-colors">
            Chính sách quyền riêng tư
          </a>
        </div>
      </footer>
        </div>
      )}

      {/* =========================================================================
          MATCH MODALS (Pause, GameOver, StageClear)
         ========================================================================= */}
      <PauseModal
        isOpen={isPaused && !isCoopOnlineMatch}
        onResume={handleResume}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
        isTrialMode={isTrialMode}
      />

      <GameOverModal
        isOpen={isGameOverModalOpen}
        state={gameState}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
        onReturnToLobby={isCoopOnlineMatch ? handleReturnToLobby : undefined}
        isReturningToLobby={isReturningToLobby}
        returnToLobbyError={returnToLobbyError}
        isTrialMode={isTrialMode}
      />

      <StageClearModal
        isOpen={isStageClearModalOpen}
        state={gameState}
        onNextStageOrReplay={handleNextStageOrReplay}
        onQuitToMenu={handleQuitToMenu}
        onReturnToLobby={isCoopOnlineMatch ? handleReturnToLobby : undefined}
        isReturningToLobby={isReturningToLobby}
        returnToLobbyError={returnToLobbyError}
        isTrialMode={isTrialMode}
      />
    </div>
  );
}
