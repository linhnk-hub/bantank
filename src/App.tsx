/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PhaserGame } from './game/PhaserGame.tsx';
import { TerrainLegend } from './components/TerrainLegend.tsx';
import { M3Hud } from './components/M3Hud.tsx';
import { VsHud, VsTitleStatusLine } from './components/VsHud.tsx';
import { VsResultModal } from './components/VsResultModal.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { StageClearModal } from './components/StageClearModal.tsx';
import {
  TouchControls,
  BattleCenterHudStats,
  VirtualJoystick,
  VirtualShootButton,
  type ActiveDirection,
} from './components/TouchControls.tsx';
import { DevToolsDrawer } from './components/DevToolsDrawer.tsx';
import { SettingsModal, type SettingsTabId } from './components/SettingsModal.tsx';
import { SupportModal } from './components/SupportModal.tsx';
import { ContactModal } from './components/ContactModal.tsx';
import { SoundManager } from './core/audio.ts';
import { MusicManager, type GameModeScope } from './core/musicManager.ts';
import {
  MATCH_TIMER_CONFIG,
  STAGE_1_MAP,
  ENEMY_CONFIG,
  formatCountdownMMSS,
  getMatchDurationSecondsForDifficulty,
  getStartingLivesForDifficultyAndMode,
} from './core/constants.ts';
import { validateStageMap } from './core/mapValidator.ts';
import { GameEngine } from './core/gameEngine.ts';
import { TOTAL_CAMPAIGN_STAGES } from './core/campaignStages.ts';
import { StageProgressionManager } from './core/stageProgression.ts';
import { StageManager } from './core/stageManager.ts';
import {
  CoopOnlineManager,
  COOP_ONLINE_CONFIG,
  type CoopRoomDocument,
  type CoopPlayerRole,
  type CoopPostStageReadyState,
  type CoopRematchReadyState,
} from './core/coopOnlineManager.ts';
import { useOrientation } from './hooks/useOrientation.ts';
import { useViewportLayout } from './hooks/useViewportLayout.ts';
import type { GameCoreState, InputState } from './core/types.ts';
import { isVsGameMode, type VsMode } from './core/vsTypes.ts';
import { AuthSessionBanner } from './components/AuthSessionBanner.tsx';
import { SessionManager } from './core/sessionManager.ts';
import { AuthManager, isSuperAdminUser } from './core/authManager.ts';
import { AvatarManager } from './core/avatarManager.ts';
import { WelcomeScreen } from './components/WelcomeScreen.tsx';
import { MainMenuScreen, type LobbyCardMode } from './components/MainMenuScreen.tsx';
import {
  ModeSelectionScreen,
  type SelectionFlowStep,
  type SelectionCardMode,
} from './components/ModeSelectionScreen.tsx';
import { SessionAlertModal } from './components/SessionAlertModal.tsx';
import { GameLogo } from './components/GameLogo.tsx';
import {
  getShowOnlineNetStatsPreference,
  ONLINE_NET_STATS_PREF_EVENT,
  ONLINE_NET_STATS_STORAGE_KEY,
} from './core/networkStatsPref.ts';
import { PlayerStatsManager } from './core/playerStatsManager.ts';
import {
  buildBattleXpIdentifiers,
  calculateStageAchievementBonus,
} from './core/playerLevelSystem.ts';
import { SystemAuditLogger } from './core/systemAuditLogger.ts';
import { DifficultyConfigManager } from './core/difficultyManager.ts';
import { formatSentenceLineBreaks } from './core/textFormat.ts';
import {
  MaintenanceManager,
  buildMaintenanceNoticeMessage,
} from './core/maintenanceManager.ts';
import { SocialManager } from './core/socialManager.ts';
import { SocialOverlayHub } from './components/SocialOverlayHub.tsx';
import { useLanguage } from './core/i18n.ts';
import {
  RotateCcw,
  Pause,
  Smartphone,
  Wrench,
  Play,
  AlertTriangle,
  Eye,
  LogOut,
  X,
} from 'lucide-react';

export default function App() {
  const { t } = useLanguage();
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
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState<boolean>(false);
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState<number>(0);
  const [activeLobbyRoom, setActiveLobbyRoom] = useState<CoopRoomDocument | null>(() =>
    coopManager.getCurrentRoom()
  );
  const [showOnlineExitConfirm, setShowOnlineExitConfirm] = useState<boolean>(false);
  const [isTopMenuOpenInBattle, setIsTopMenuOpenInBattle] = useState<boolean>(false);
  const topMenuTriggeredPauseRef = useRef<boolean>(false);
  const [onlineDisconnectMsg, setOnlineDisconnectMsg] = useState<string | null>(null);
  const [isReturningToLobby, setIsReturningToLobby] = useState<boolean>(false);
  const [returnToLobbyError, setReturnToLobbyError] = useState<string | null>(null);

  const isSuperAdmin = useMemo(() => isSuperAdminUser(currentUser), [currentUser]);

  // Milestone 4 Game State & Lifecycle
  const [gameEngine] = useState<GameEngine>(() => new GameEngine());
  const [gameState, setGameState] = useState<GameCoreState | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(60);
  const [peerPingMs, setPeerPingMs] = useState<number | null>(() => coopManager.getPeerPingMs());
  const [showOnlineNetStats, setShowOnlineNetStats] = useState<boolean>(() =>
    getShowOnlineNetStatsPreference()
  );
  const [difficulty, setDifficulty] = useState<'DEFAULT' | 'EXTREME'>('DEFAULT');
  const [selectedMode, setSelectedMode] = useState<'SOLO' | 'TWO_PLAYERS'>('SOLO');
  const [twoPlayerOption, setTwoPlayerOption] = useState<'P2_AI' | 'P2_REAL'>('P2_AI');
  const [selectedLobbyMode, setSelectedLobbyMode] = useState<LobbyCardMode>('SOLO');
  const [modeSelectionInitialStep, setModeSelectionInitialStep] =
    useState<SelectionFlowStep>('SELECT_MODE');
  const [modeSelectionInitialCard, setModeSelectionInitialCard] =
    useState<SelectionCardMode>('SOLO');
  const [, setProfileRevision] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId>('ACCOUNT');
  const [isMatchAllowed, setIsMatchAllowed] = useState<boolean>(false);
  const [isTrialMode, setIsTrialMode] = useState<boolean>(() => authManager.isTrialMode());
  const [postStageReady, setPostStageReady] = useState<CoopPostStageReadyState | null>(() =>
    coopManager.getPostStageReadyState()
  );
  const [rematchReady, setRematchReady] = useState<CoopRematchReadyState | null>(() =>
    coopManager.getRematchReadyState()
  );
  const [maintenanceInterruptAlert, setMaintenanceInterruptAlert] = useState<string | null>(null);

  // Sync live peer Ping, active lobby room, post-stage/rematch ready status & online network telemetry toggle preference
  useEffect(() => {
    const unsubPing = coopManager.subscribe((room) => {
      setPeerPingMs(coopManager.getPeerPingMs());
      setActiveLobbyRoom(room);
    });
    const unsubPostStageReady = coopManager.subscribePostStageReady((nextReady) => {
      setPostStageReady(nextReady);
    });
    const unsubRematchReady = coopManager.subscribeRematchReady((nextReady) => {
      setRematchReady(nextReady);
    });
    const unsubAvatar = AvatarManager.getInstance().subscribe(() => {
      setCurrentUser(authManager.getCurrentUser());
      setProfileRevision((r) => r + 1);
    });
    const handlePrefEvent = () => {
      setShowOnlineNetStats(getShowOnlineNetStatsPreference());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ONLINE_NET_STATS_STORAGE_KEY) {
        setShowOnlineNetStats(getShowOnlineNetStatsPreference());
      }
    };
    window.addEventListener(ONLINE_NET_STATS_PREF_EVENT, handlePrefEvent);
    window.addEventListener('storage', handleStorage);
    return () => {
      unsubPing();
      unsubPostStageReady();
      unsubRematchReady();
      unsubAvatar();
      window.removeEventListener(ONLINE_NET_STATS_PREF_EVENT, handlePrefEvent);
      window.removeEventListener('storage', handleStorage);
    };
  }, [coopManager, authManager]);

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

  // Autoplay Home BGM immediately on WELCOME, MAIN_MENU, and MODE_SELECTION without waiting for login/click
  useEffect(() => {
    const mm = MusicManager.getInstance();
    if (
      appScreen === 'WELCOME' ||
      appScreen === 'MAIN_MENU' ||
      appScreen === 'MODE_SELECTION'
    ) {
      SoundManager.getInstance().unlock();
      mm.syncMenuPlayback();
    }
  }, [appScreen, currentUser]);

  // Eager audio unlock + static SFX preload + global audit/stats/difficulty/maintenance initialization on mount
  useEffect(() => {
    SystemAuditLogger.getInstance().installGlobalBrowserCaptureListeners();
    PlayerStatsManager.getInstance();
    DifficultyConfigManager.getInstance().startCloudSync();
    MaintenanceManager.getInstance().startCloudSync();
    SoundManager.getInstance().unlock();
    void SoundManager.getInstance().preloadStaticActionSfxBinaries();
    MusicManager.getInstance().preloadStaticBgmBuffers();
    const unlockAudio = () => {
      SoundManager.getInstance().unlock();
      MusicManager.getInstance().unlockFromUserGesture();
    };
    window.addEventListener('pointerdown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('pointerup', unlockAudio, { capture: true, passive: true });
    window.addEventListener('touchend', unlockAudio, { capture: true, passive: true });
    window.addEventListener('click', unlockAudio, { capture: true, passive: true });
    window.addEventListener('keydown', unlockAudio, { capture: true, passive: true });
    window.addEventListener('touchstart', unlockAudio, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, true);
      window.removeEventListener('pointerup', unlockAudio, true);
      window.removeEventListener('touchend', unlockAudio, true);
      window.removeEventListener('click', unlockAudio, true);
      window.removeEventListener('keydown', unlockAudio, true);
      window.removeEventListener('touchstart', unlockAudio, true);
    };
  }, []);

  // Default touch controls & center battle HUD to visible across devices
  const [showTouchControls, setShowTouchControls] = useState<boolean>(true);

  // Passive orientation detection hook (responds to physical OS rotation only)
  useOrientation();

  // Collapsible Menu & Developer Tools state
  const [, setIsMenuExpanded] = useState<boolean>(false);
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
    const gm = gameEngine.getState().gameMode;
    if (gm === 'TWO_PLAYERS_ONLINE' || isVsGameMode(gm)) {
      return;
    }
    clearVirtualTouchInputs();
    gameEngine.pause();
    setIsPaused(true);
    MusicManager.getInstance().pause();
    setGameState({ ...gameEngine.getState() });
  }, [gameEngine, clearVirtualTouchInputs]);

  // M7.8 Section III: Tie Online Presence strictly to existing AuthManager + SessionManager (NO independent Session system)
  useEffect(() => {
    const socialMgr = SocialManager.getInstance();
    if (currentUser && !isTrialMode && sessionSnapshot.status === 'ACTIVE') {
      socialMgr.startPresenceForSession(
        currentUser,
        sessionSnapshot.status,
        sessionSnapshot.sessionId
      );
    } else {
      void socialMgr.stopPresence();
    }
  }, [currentUser, isTrialMode, sessionSnapshot.status, sessionSnapshot.sessionId]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void SocialManager.getInstance().stopPresence();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      void SocialManager.getInstance().stopPresence();
    };
  }, []);

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
    const initialAuthUser = authManager.getCurrentUser();
    MusicManager.getInstance().syncRoleFromAuthUser(initialAuthUser);
    StageManager.getInstance().syncCloudAuthUser(initialAuthUser);

    const unsubReady = authManager.subscribeAuthReady((ready) => {
      setIsAuthReady(ready);
    });

    const unsubAuth = authManager.subscribe((u) => {
      setCurrentUser(u);
      MusicManager.getInstance().syncRoleFromAuthUser(u);
      StageManager.getInstance().syncCloudAuthUser(u);
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

  // Enforce System Maintenance Mode: automatically sign out all non-Admin players and show maintenance notice modal
  useEffect(() => {
    const maintMgr = MaintenanceManager.getInstance();
    const enforceMaintenanceIfNeeded = () => {
      const cfg = maintMgr.getConfig();
      if (!cfg.isActive) {
        setMaintenanceInterruptAlert(null);
        return;
      }
      const activeUser = authManager.getCurrentUser();
      if (isSuperAdminUser(activeUser)) {
        return;
      }
      const inTrial = authManager.isTrialMode() || isTrialMode;
      const inActiveScreen =
        appScreen === 'BATTLE' ||
        appScreen === 'MAIN_MENU' ||
        appScreen === 'MODE_SELECTION';
      if (activeUser || inTrial || inActiveScreen) {
        clearVirtualTouchInputs();
        gameEngine.pause();
        setIsPaused(true);
        MusicManager.getInstance().pause();
        SoundManager.getInstance().stopAllActiveActionSources();
        void coopManager.leaveRoom();
        coopManager.clearPostStageReadyState();
        coopManager.clearRematchReadyState();
        if (inTrial) {
          authManager.exitTrialMode();
          setIsTrialMode(false);
          setIsMatchAllowed(false);
        }
        if (activeUser) {
          AvatarManager.getInstance().clearSessionStateOnSignOut();
          StageManager.getInstance().stopCloudSync();
          void sessionManager.releaseSessionAndSignOut();
          setCurrentUser(null);
        }
        const noticeMsg =
          cfg.message || buildMaintenanceNoticeMessage(cfg.startAtMs, cfg.endAtMs);
        setMaintenanceInterruptAlert(noticeMsg);
      }
    };

    enforceMaintenanceIfNeeded();
    return maintMgr.subscribe(() => {
      enforceMaintenanceIfNeeded();
    });
  }, [
    authManager,
    sessionManager,
    coopManager,
    gameEngine,
    clearVirtualTouchInputs,
    isTrialMode,
    appScreen,
  ]);

  // Monitor Co-op Online & VS Online Room for peer disconnection / leave / FINISHED fail-safe during BATTLE
  useEffect(() => {
    if (appScreen !== 'BATTLE') return;

    const triggerVsOpponentForfeit = (leavingRole: 'P1' | 'P2') => {
      const engState = gameEngine.getState();
      if (!isVsGameMode(engState.gameMode)) return;
      if (engState.vsState?.phase === 'FINISHED') return;
      gameEngine.forfeitVsMatch(leavingRole);
      clearVirtualTouchInputs();
      const updated = gameEngine.getState();
      if (coopManager.getLocalRole() === 'HOST') {
        void coopManager.onHostSimulationFrame(0, updated, Date.now());
      }
      setShowOnlineExitConfirm(false);
      setGameState({ ...updated });
    };

    const unsubCoop = coopManager.subscribe((room) => {
      const engState = gameEngine.getState();
      const isVsOnline = isVsGameMode(engState.gameMode);
      const isCoopOnline = engState.gameMode === 'TWO_PLAYERS_ONLINE';
      if (!isCoopOnline && !isVsOnline) return;
      if (engState.matchState === 'MENU') return;

      const localRole = coopManager.getLocalRole();

      if (isVsOnline) {
        if (engState.vsState?.phase === 'FINISHED') return;
        if (room && room.status === 'WAITING') return;
        const opponentVsRole: 'P1' | 'P2' = localRole === 'GUEST' ? 'P1' : 'P2';
        if (!room || room.status === 'ABANDONED') {
          triggerVsOpponentForfeit(opponentVsRole);
          return;
        }
        const status = coopManager.evaluatePeerConnectionStatus();
        if (status.isTimedOut) {
          triggerVsOpponentForfeit(opponentVsRole);
        }
        return;
      }

      if (engState.isGameOver || engState.isStageClear) return;

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
      const status = coopManager.evaluatePeerConnectionStatus();
      if (status.isTimedOut) {
        setOnlineDisconnectMsg(status.warningMessage || 'Đồng đội đã ngắt kết nối.');
      }
    });

    const unsubPeerLeave = coopManager.subscribePeerLeave((event) => {
      const engState = gameEngine.getState();
      if (isVsGameMode(engState.gameMode)) {
        const leavingRole: 'P1' | 'P2' = event.role === 'HOST' ? 'P1' : 'P2';
        triggerVsOpponentForfeit(leavingRole);
        return;
      }
      if (engState.gameMode !== 'TWO_PLAYERS_ONLINE') return;
      if (engState.isGameOver || engState.matchState === 'MENU') return;
      const leftPlayer = event.role === 'HOST' ? 'P1' : 'P2';
      gameEngine.handlePeerPlayerLeft(leftPlayer);
      setGameState({ ...gameEngine.getState() });
      if (event.role === 'HOST' && !engState.isStageClear) {
        setOnlineDisconnectMsg(event.message);
      }
    });

    const heartbeatTimerId = setInterval(() => {
      const engState = gameEngine.getState();
      const isVsOnline = isVsGameMode(engState.gameMode);
      const isCoopOnline = engState.gameMode === 'TWO_PLAYERS_ONLINE';
      if (!isCoopOnline && !isVsOnline) return;
      if (engState.matchState === 'MENU') return;

      if (isVsOnline) {
        if (engState.vsState?.phase === 'FINISHED') return;
        const status = coopManager.evaluatePeerConnectionStatus();
        if (status.isTimedOut) {
          const opponentVsRole: 'P1' | 'P2' = coopManager.getLocalRole() === 'GUEST' ? 'P1' : 'P2';
          triggerVsOpponentForfeit(opponentVsRole);
        }
        return;
      }

      if (engState.isGameOver || engState.isStageClear) return;
      const status = coopManager.evaluatePeerConnectionStatus();
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
    topMenuTriggeredPauseRef.current = false;
    setIsTopMenuOpenInBattle(false);
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
    topMenuTriggeredPauseRef.current = false;
    setIsTopMenuOpenInBattle(false);
    gameEngine.restartStage();
    setIsPaused(false);
    const st = gameEngine.getState();
    MusicManager.getInstance().syncPlaybackWithContext(
      Math.max(1, st.currentStageId),
      getMusicModeFromEngine(gameEngine)
    );
    setGameState({ ...st });
  }, [gameEngine, clearVirtualTouchInputs, getMusicModeFromEngine]);

  // M7.8 Section II: VS runs exclusively on 2 separate devices via VS Online Lobby (NO local same-device VS)
  const handleOpenVsOnlineLobby = useCallback((vsMode: VsMode) => {
    setModeSelectionInitialCard(vsMode);
    setModeSelectionInitialStep('COOP_ONLINE_LOBBY');
    setAppScreen('MODE_SELECTION');
  }, []);

  const launchVerifiedMatch = useCallback(
    (
      mode: 'SOLO' | 'TWO_PLAYERS' = 'SOLO',
      twoPlayerOption?: 'P2_AI' | 'P2_REAL',
      stageId: number = 1
    ) => {
      if (sessionManager.getSnapshot().status !== 'ACTIVE') {
        return;
      }
      setOnlineDisconnectMsg(null);
      const engineMode = mode === 'TWO_PLAYERS' && twoPlayerOption === 'P2_AI' ? 'TWO_PLAYERS_AI' : 'SOLO';
      const startRes = gameEngine.startMatch(engineMode, difficulty, {
        stageId,
        uid: currentUser?.uid ?? null,
        isTrialMode: false,
        enforceProgression: true,
      });
      if (!startRes.success) {
        return;
      }
      setIsPaused(false);
      const st = gameEngine.getState();
      SoundManager.getInstance().stopAllActiveActionSources();
      MusicManager.getInstance().syncPlaybackWithContext(
        st.currentStageId,
        getMusicModeFromEngine(gameEngine)
      );
      SystemAuditLogger.getInstance().recordEvent({
        severity: 'INFO',
        category: 'CAMPAIGN_STAGE_EVENT',
        eventType: 'MATCH_START',
        message: `Bắt đầu trận đấu Stage ${st.currentStageId} (${engineMode} • ${difficulty}).`,
        uid: currentUser?.uid ?? null,
        stageId: st.currentStageId,
        gameMode: engineMode,
        source: 'App.handleStartMatch',
        outcome: 'SUCCESS',
      });
      setGameState({ ...st });
      setAppScreen('BATTLE');
    },
    [currentUser?.uid, gameEngine, difficulty, getMusicModeFromEngine]
  );

  const handleStartMatch = useCallback(
    (
      mode: 'SOLO' | 'TWO_PLAYERS' = 'SOLO',
      twoPlayerOption?: 'P2_AI' | 'P2_REAL',
      stageId: number = 1
    ) => {
      const liveStatus = sessionManager.getSnapshot().status;
      if (liveStatus === 'ACTIVE') {
        launchVerifiedMatch(mode, twoPlayerOption, stageId);
        return;
      }
      // Do not start match while session ownership is unconfirmed; if in transitional ACQUIRING/NO_SESSION state,
      // wait for session acquisition to confirm ACTIVE ownership before launching.
      if ((liveStatus === 'ACQUIRING' || liveStatus === 'NO_SESSION') && currentUser?.uid) {
        void sessionManager.ensureActiveSessionForAction(currentUser.uid).then((res) => {
          if (res.allowed && sessionManager.getSnapshot().status === 'ACTIVE') {
            launchVerifiedMatch(mode, twoPlayerOption, stageId);
          }
        });
      }
    },
    [currentUser?.uid, launchVerifiedMatch]
  );

  // M7.8 Section X: Home Menu SOLO direct battle entry with stage picker
  const handleStartSoloDirect = useCallback(
    (stageId?: number) => {
      const uid = currentUser?.uid ?? '';
      const unlockedStage = uid
        ? Math.min(
            10,
            Math.max(
              1,
              StageProgressionManager.getInstance().getUnlockedStageForUser(uid, isSuperAdmin)
            )
          )
        : 1;
      const targetStage =
        typeof stageId === 'number' && Number.isFinite(stageId)
          ? Math.min(isSuperAdmin ? 10 : unlockedStage, Math.max(1, Math.floor(stageId)))
          : unlockedStage;
      setSelectedMode('SOLO');
      setSelectedLobbyMode('SOLO');
      handleStartMatch('SOLO', undefined, targetStage);
    },
    [currentUser?.uid, isSuperAdmin, handleStartMatch]
  );

  const handleStartOnlineMatch = useCallback(
    (room: CoopRoomDocument, role: CoopPlayerRole): boolean => {
      const sessStatus = sessionManager.getSnapshot().status;
      if (sessStatus === 'DISPLACED' || sessStatus === 'PAUSED_IDLE') {
        return false;
      }
      setOnlineDisconnectMsg(null);
      setShowOnlineExitConfirm(false);
      setIsReturningToLobby(false);
      setReturnToLobbyError(null);
      coopManager.clearPostStageReadyState();
      coopManager.clearRematchReadyState();
      coopManager.markMatchTransitionActive();

      const roomMode = room.roomMode || 'COOP_ONLINE';
      if (roomMode === 'VS_P1_P2' || roomMode === 'VS_P1_AI_P2_AI') {
        const startRes = gameEngine.startMatch(roomMode, 'DEFAULT', {
          uid: currentUser?.uid ?? null,
          isTrialMode: false,
          enforceProgression: false,
        });
        if (!startRes.success) {
          return false;
        }
        setIsPaused(false);
        const st = gameEngine.getState();
        SoundManager.getInstance().stopAllActiveActionSources();
        MusicManager.getInstance().syncPlaybackWithContext(1, 'SOLO');
        SystemAuditLogger.getInstance().recordEvent({
          severity: 'INFO',
          category: 'CAMPAIGN_STAGE_EVENT',
          eventType: 'MATCH_START',
          message: `Bắt đầu trận VS Online (${roomMode}) phòng ${room.roomCode} (${role}).`,
          uid: currentUser?.uid ?? null,
          roomCode: room.roomCode,
          stageId: 1,
          gameMode: roomMode,
          source: 'App.handleStartOnlineMatch',
          outcome: 'SUCCESS',
        });
        setGameState({ ...st });
        setAppScreen('BATTLE');
        return true;
      }

      setDifficulty(room.difficulty);
      const stageId = room.selectedStageId ?? 1;
      const startRes = gameEngine.startMatch('TWO_PLAYERS_ONLINE', room.difficulty, {
        stageId,
        uid: currentUser?.uid ?? null,
        isTrialMode: false,
        enforceProgression: role === 'HOST',
      });
      if (!startRes.success) {
        return false;
      }
      setIsPaused(false);
      const st = gameEngine.getState();
      SoundManager.getInstance().stopAllActiveActionSources();
      MusicManager.getInstance().syncPlaybackWithContext(st.currentStageId, 'TWO_PLAYER');
      SystemAuditLogger.getInstance().recordEvent({
        severity: 'INFO',
        category: 'CAMPAIGN_STAGE_EVENT',
        eventType: 'MATCH_START',
        message: `Bắt đầu trận Co-op Online phòng ${room.roomCode} • Stage ${st.currentStageId} (${role}).`,
        uid: currentUser?.uid ?? null,
        roomCode: room.roomCode,
        stageId: st.currentStageId,
        gameMode: 'TWO_PLAYERS_ONLINE',
        source: 'App.handleStartOnlineMatch',
        outcome: 'SUCCESS',
      });
      setGameState({ ...st });
      setAppScreen('BATTLE');
      return true;
    },
    [sessionManager, currentUser?.uid, gameEngine, coopManager]
  );

  const handleStartTrialMode = useCallback(() => {
    if (MaintenanceManager.getInstance().isMaintenanceActive()) {
      const cfg = MaintenanceManager.getInstance().getConfig();
      setAuthErrorMsg(
        cfg.message || buildMaintenanceNoticeMessage(cfg.startAtMs, cfg.endAtMs)
      );
      return;
    }
    authManager.startTrialMode();
    setIsTrialMode(true);
    setIsMatchAllowed(true);
    setOnlineDisconnectMsg(null);
    setDifficulty('DEFAULT');
    setSelectedMode('SOLO');
    gameEngine.startMatch('SOLO', 'DEFAULT', {
      stageId: 1,
      uid: null,
      isTrialMode: true,
      enforceProgression: true,
    });
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
    setShowOnlineExitConfirm(false);
    setIsTopMenuOpenInBattle(false);
    topMenuTriggeredPauseRef.current = false;
    if (wasTrial) {
      authManager.exitTrialMode();
      setIsTrialMode(false);
      setIsMatchAllowed(false);
    } else {
      void coopManager.leaveRoom();
      coopManager.clearPostStageReadyState();
      coopManager.clearRematchReadyState();
    }
    setOnlineDisconnectMsg(null);
    setIsReturningToLobby(false);
    setReturnToLobbyError(null);
    gameEngine.quitToMenu();
    setIsPaused(false);
    SoundManager.getInstance().stopAllActiveActionSources();
    const targetScreen = wasTrial || !authManager.getCurrentUser() ? 'WELCOME' : 'MAIN_MENU';
    MusicManager.getInstance().syncMenuPlayback();
    setGameState({ ...gameEngine.getState() });
    setAppScreen(targetScreen);
  }, [authManager, isTrialMode, gameEngine, coopManager]);

  // M7.8 Section XIV: Confirm Exit from Online Battle (CO-OP ONLINE or VS ONLINE)
  const handleConfirmOnlineBattleExit = useCallback(() => {
    const engState = gameEngine.getState();
    setShowOnlineExitConfirm(false);
    if (isVsGameMode(engState.gameMode)) {
      const localRole = coopManager.getLocalRole();
      const leavingVsRole: 'P1' | 'P2' = localRole === 'GUEST' ? 'P2' : 'P1';
      if (engState.vsState?.phase !== 'FINISHED') {
        gameEngine.forfeitVsMatch(leavingVsRole);
        const updated = gameEngine.getState();
        if (localRole === 'HOST') {
          void coopManager.onHostSimulationFrame(0, updated, Date.now());
        }
      }
      void coopManager.leaveRoom('Đối thủ đã rời trận');
      setOnlineDisconnectMsg(null);
      setIsReturningToLobby(false);
      setReturnToLobbyError(null);
      gameEngine.quitToMenu();
      setIsPaused(false);
      SoundManager.getInstance().stopAllActiveActionSources();
      MusicManager.getInstance().syncMenuPlayback();
      setGameState({ ...gameEngine.getState() });
      setAppScreen('MAIN_MENU');
      return;
    }
    handleQuitToMenu();
  }, [gameEngine, coopManager, handleQuitToMenu]);

  // M7.8 Section XIII: Opening 3-line Top Menu in SOLO / CO-OP A.I pauses gameplay completely & shows Pause overlay.
  // Closing the drawer (e.g. clicking PauseModal buttons or opening a sub-modal) MUST NOT auto-resume so Restart / Return Home click handlers fire reliably.
  const handleBattleTopMenuOpenChange = useCallback(
    (isOpen: boolean) => {
      const gm = gameEngine.getState().gameMode;
      const isOnlineMode = gm === 'TWO_PLAYERS_ONLINE' || isVsGameMode(gm);
      if (isOnlineMode) return;
      setIsTopMenuOpenInBattle(isOpen);
      if (isOpen) {
        const st = gameEngine.getState();
        if (st.matchState === 'PLAYING') {
          topMenuTriggeredPauseRef.current = true;
          handlePause();
        }
      }
    },
    [gameEngine, handlePause]
  );

  const handleReturnToLobby = useCallback(async () => {
    if (!currentUser) {
      setReturnToLobbyError('Vui lòng đăng nhập lại để quay về phòng chờ.');
      return;
    }
    const prevMode = gameEngine.getState().gameMode;
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
        // Fallback for VS matches where opponent forfeited / closed the room
        if (prevMode === 'VS_P1_P2' || prevMode === 'VS_P1_AI_P2_AI') {
          void coopManager.leaveRoom();
          setOnlineDisconnectMsg(null);
          clearVirtualTouchInputs();
          coopManager.clearPostStageReadyState();
          coopManager.clearRematchReadyState();
          gameEngine.quitToMenu();
          setIsPaused(false);
          SoundManager.getInstance().stopAllActiveActionSources();
          MusicManager.getInstance().syncMenuPlayback();
          setGameState({ ...gameEngine.getState() });
          handleOpenVsOnlineLobby(prevMode);
          return;
        }
        setReturnToLobbyError(res.message || 'Không thể quay về phòng chờ chung.');
        return;
      }
      setOnlineDisconnectMsg(null);
      clearVirtualTouchInputs();
      coopManager.clearPostStageReadyState();
      coopManager.clearRematchReadyState();
      gameEngine.quitToMenu();
      setIsPaused(false);
      SoundManager.getInstance().stopAllActiveActionSources();
      MusicManager.getInstance().syncMenuPlayback();
      setGameState({ ...gameEngine.getState() });
      if (prevMode === 'VS_P1_P2' || prevMode === 'VS_P1_AI_P2_AI') {
        setModeSelectionInitialCard(prevMode);
        setModeSelectionInitialStep('COOP_ONLINE_LOBBY');
      } else {
        setSelectedMode('TWO_PLAYERS');
        setTwoPlayerOption('P2_REAL');
        setModeSelectionInitialCard('COOP_ONLINE');
        setModeSelectionInitialStep('COOP_ONLINE_LOBBY');
      }
      setAppScreen('MODE_SELECTION');
    } catch (err: any) {
      setReturnToLobbyError(err?.message || 'Lỗi khi quay về phòng chờ chung.');
    } finally {
      setIsReturningToLobby(false);
    }
  }, [currentUser, coopManager, clearVirtualTouchInputs, gameEngine, handleOpenVsOnlineLobby]);

  const handleSignIn = useCallback(async () => {
    setAuthProcessing(true);
    setAuthErrorMsg(null);
    setLogoutSuccessNotice(null);
    try {
      const res = await authManager.signInWithGoogle();
      if (!res.isValid) {
        setAuthErrorMsg(res.errorMessage || 'Đăng nhập không thành công.');
      } else {
        const signedInUser = authManager.getCurrentUser();
        if (
          MaintenanceManager.getInstance().isMaintenanceActive() &&
          !isSuperAdminUser(signedInUser)
        ) {
          const cfg = MaintenanceManager.getInstance().getConfig();
          await sessionManager.releaseSessionAndSignOut();
          setCurrentUser(null);
          setAppScreen('WELCOME');
          setAuthErrorMsg(
            cfg.message || buildMaintenanceNoticeMessage(cfg.startAtMs, cfg.endAtMs)
          );
          return;
        }
        setAppScreen('MAIN_MENU');
      }
    } catch (err: any) {
      setAuthErrorMsg(err?.message || 'Lỗi khi đăng nhập bằng Google.');
    } finally {
      setAuthProcessing(false);
    }
  }, [authManager, sessionManager]);

  const handleSignOut = useCallback(async () => {
    setAuthProcessing(true);
    try {
      await coopManager.leaveRoom();
      coopManager.clearPostStageReadyState();
      coopManager.clearRematchReadyState();
      setOnlineDisconnectMsg(null);
      gameEngine.quitToMenu();
      MusicManager.getInstance().pause();
      setIsPaused(false);
      AvatarManager.getInstance().clearSessionStateOnSignOut();
      StageManager.getInstance().stopCloudSync();
      await sessionManager.releaseSessionAndSignOut();
      setCurrentUser(null);
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
    const prevMode = gameEngine.getState().gameMode;
    const advanced = gameEngine.advanceToNextStage();
    if (!advanced) {
      if (prevMode === 'TWO_PLAYERS_ONLINE') {
        return;
      }
      gameEngine.restartStage();
    }
    setIsPaused(false);
    const st = gameEngine.getState();
    if (prevMode === 'TWO_PLAYERS_ONLINE' && advanced) {
      coopManager.advanceHostToNextOnlineStage(st.currentStageId, st.stageRunSeq, st);
    }
    MusicManager.getInstance().syncPlaybackWithContext(
      st.currentStageId,
      getMusicModeFromEngine(gameEngine)
    );
    setGameState({ ...st });
  }, [authManager, isTrialMode, handleQuitToMenu, gameEngine, getMusicModeFromEngine, coopManager]);

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
  // M7.8 Section II: VS Online routes touch inputs strictly by online role (HOST = P1, GUEST = P2), no same-device switcher
  const handleTouchInput = useCallback(
    (input: Partial<InputState>) => {
      SessionManager.getInstance().recordUserActivity();
      const gm = gameEngine.getState().gameMode;
      const isOnlinePeerMode = gm === 'TWO_PLAYERS_ONLINE' || isVsGameMode(gm);
      if (isOnlinePeerMode && coopManager.getLocalRole() === 'GUEST') {
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
      const gm = gameEngine.getState().gameMode;
      const isOnlinePeerMode = gm === 'TWO_PLAYERS_ONLINE' || isVsGameMode(gm);
      if (isOnlinePeerMode && coopManager.getLocalRole() === 'GUEST') {
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
      const gm = gameEngine.getState().gameMode;
      const isOnlinePeerMode = gm === 'TWO_PLAYERS_ONLINE' || isVsGameMode(gm);
      if (isOnlinePeerMode && coopManager.getLocalRole() === 'GUEST') {
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
  const isVsMatch = isVsGameMode(gameState?.gameMode);
  const isOnlineBattleMode = isCoopOnlineMatch || isVsMatch;
  const localOnlineRole = isOnlineBattleMode ? coopManager.getLocalRole() : null;
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

  const isVsResultModalOpen = Boolean(
    isVsMatch && gameState?.vsState?.phase === 'FINISHED' && gameState?.vsState?.outcome
  );
  const isGameOverModalOpen = Boolean(
    !isVsMatch && gameState && gameState.matchState === 'GAME_OVER'
  );
  const isStageClearModalOpen = Boolean(
    !isVsMatch && gameState && gameState.matchState === 'STAGE_CLEAR'
  );

  const recordedGuestOnlineClearKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !isStageClearModalOpen ||
      !gameState ||
      gameState.gameMode !== 'TWO_PLAYERS_ONLINE' ||
      isTrialMode ||
      !currentUser?.uid ||
      coopManager.getLocalRole() !== 'GUEST' ||
      gameState.terrain.isBaseDestroyed ||
      gameState.totalDefeatedEnemies < ENEMY_CONFIG.TOTAL_COUNT
    ) {
      return;
    }
    const stageId = gameState.currentStageId ?? 1;
    const clearKey = `${coopManager.getCurrentRoom()?.roomCode || 'coop'}:${stageId}:${gameState.stageRunSeq}`;
    if (recordedGuestOnlineClearKeyRef.current === clearKey) return;
    recordedGuestOnlineClearKeyRef.current = clearKey;

    const progMgr = StageProgressionManager.getInstance();
    if (stageId <= progMgr.getUnlockedStageForUser(currentUser.uid, false)) {
      const token = progMgr.issueMatchSessionToken(
        currentUser.uid,
        stageId,
        'TWO_PLAYERS_ONLINE'
      );
      const proof = progMgr.mintStageClearProof({
        sessionToken: token,
        totalDefeatedEnemies: gameState.totalDefeatedEnemies,
        isBaseDestroyed: false,
        isStageClear: true,
      });
      if (proof) {
        progMgr.verifyAndRecordStageClear(currentUser.uid, proof);
      }
    }
  }, [isStageClearModalOpen, gameState, isTrialMode, currentUser?.uid, coopManager]);

  const hasTeammateLeft = Boolean(
    gameState &&
      (gameState.peerLeaveNotice ||
        gameState.p2State?.hasLeftMatch ||
        (isCoopOnlineMatch &&
          coopManager.hasPeerActivelyLeft(localOnlineRole === 'HOST' ? 'GUEST' : 'HOST')))
  );

  const handleTogglePostStageReady = useCallback(() => {
    const st = gameEngine.getState();
    if (st.gameMode !== 'TWO_PLAYERS_ONLINE') return;
    const role = coopManager.getLocalRole();
    const cur = coopManager.getPostStageReadyState();
    const stageId = st.currentStageId ?? 1;
    const seq = st.stageRunSeq;
    const isMatching = Boolean(cur && cur.stageId === stageId && cur.stageRunSeq === seq);
    const currentReady = isMatching
      ? role === 'GUEST'
        ? Boolean(cur?.guestReady)
        : Boolean(cur?.hostReady)
      : false;
    coopManager.setPostStageReady(stageId, seq, !currentReady);
  }, [gameEngine, coopManager]);

  const guestSyncedStageMusicRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      appScreen !== 'BATTLE' ||
      !gameState ||
      gameState.gameMode !== 'TWO_PLAYERS_ONLINE' ||
      coopManager.getLocalRole() !== 'GUEST'
    ) {
      guestSyncedStageMusicRef.current = null;
      return;
    }
    const stg = gameState.currentStageId ?? 1;
    if (guestSyncedStageMusicRef.current !== stg) {
      guestSyncedStageMusicRef.current = stg;
      MusicManager.getInstance().syncPlaybackWithContext(stg, 'TWO_PLAYER');
    }
  }, [appScreen, gameState?.gameMode, gameState?.currentStageId, coopManager]);

  const autoAdvancedStageKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !isStageClearModalOpen ||
      !gameState ||
      gameState.gameMode !== 'TWO_PLAYERS_ONLINE' ||
      coopManager.getLocalRole() !== 'HOST' ||
      hasTeammateLeft
    ) {
      return;
    }
    const stageId = gameState.currentStageId ?? 1;
    if (stageId >= TOTAL_CAMPAIGN_STAGES) return;
    if (
      !postStageReady ||
      postStageReady.stageId !== stageId ||
      postStageReady.stageRunSeq !== gameState.stageRunSeq ||
      !postStageReady.hostReady ||
      !postStageReady.guestReady
    ) {
      return;
    }
    const advKey = `${stageId}:${gameState.stageRunSeq}`;
    if (autoAdvancedStageKeyRef.current === advKey) return;
    autoAdvancedStageKeyRef.current = advKey;
    handleNextStageOrReplay();
  }, [
    isStageClearModalOpen,
    gameState,
    postStageReady,
    coopManager,
    hasTeammateLeft,
    handleNextStageOrReplay,
  ]);

  const handleRequestRematchPrompt = useCallback(() => {
    const st = gameEngine.getState();
    if (st.gameMode !== 'TWO_PLAYERS_ONLINE') return;
    if (coopManager.getLocalRole() !== 'HOST') return;
    coopManager.requestCoopRematchPrompt(st.currentStageId ?? 1, st.stageRunSeq);
  }, [gameEngine, coopManager]);

  const handleToggleRematchReady = useCallback(() => {
    const st = gameEngine.getState();
    if (st.gameMode !== 'TWO_PLAYERS_ONLINE') return;
    const role = coopManager.getLocalRole();
    const cur = coopManager.getRematchReadyState();
    const stageId = st.currentStageId ?? 1;
    const seq = st.stageRunSeq;
    const isMatching = Boolean(cur && cur.stageId === stageId && cur.stageRunSeq === seq);
    const currentReady = isMatching
      ? role === 'GUEST'
        ? Boolean(cur?.guestReady)
        : Boolean(cur?.hostReady)
      : false;
    coopManager.setCoopRematchReady(stageId, seq, !currentReady);
  }, [gameEngine, coopManager]);

  const autoRematchStageKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !isGameOverModalOpen ||
      !gameState ||
      gameState.gameMode !== 'TWO_PLAYERS_ONLINE' ||
      coopManager.getLocalRole() !== 'HOST' ||
      hasTeammateLeft
    ) {
      return;
    }
    const stageId = gameState.currentStageId ?? 1;
    if (
      !rematchReady ||
      !rematchReady.requestedByHost ||
      rematchReady.stageId !== stageId ||
      rematchReady.stageRunSeq !== gameState.stageRunSeq ||
      !rematchReady.hostReady ||
      !rematchReady.guestReady
    ) {
      return;
    }
    const rematchKey = `${stageId}:${gameState.stageRunSeq}`;
    if (autoRematchStageKeyRef.current === rematchKey) return;
    autoRematchStageKeyRef.current = rematchKey;

    clearVirtualTouchInputs();
    gameEngine.restartStage();
    setIsPaused(false);
    const nextSt = gameEngine.getState();
    coopManager.notifyCoopRematchStart(nextSt.currentStageId ?? 1, nextSt.stageRunSeq, nextSt);
    MusicManager.getInstance().syncPlaybackWithContext(
      Math.max(1, nextSt.currentStageId),
      'TWO_PLAYER'
    );
    setGameState({ ...nextSt });
  }, [
    isGameOverModalOpen,
    gameState,
    rematchReady,
    coopManager,
    hasTeammateLeft,
    clearVirtualTouchInputs,
    gameEngine,
  ]);

  // M7.5.1 & M7.5.2: Record per-UID completed match outcome (WIN / LOSS) with exact per-player enemy XP breakdown (zero bonus XP)
  // BTO-VS-GAMEPLAY-V1.2 Isolation Guard: VS matches grant 0 XP, 0 Stars, 0 Xu and NEVER record Campaign stats.
  useEffect(() => {
    if (isTrialMode || !currentUser?.uid || !gameState) return;
    if (isVsGameMode(gameState.gameMode)) return;
    if (!isStageClearModalOpen && !isGameOverModalOpen) return;
    const outcome: 'WIN' | 'LOSS' = isStageClearModalOpen ? 'WIN' : 'LOSS';
    const stageId = gameState.currentStageId ?? 1;
    const isOnlineGuest =
      gameState.gameMode === 'TWO_PLAYERS_ONLINE' && coopManager.getLocalRole() === 'GUEST';
    const roomCode =
      gameState.gameMode === 'TWO_PLAYERS_ONLINE'
        ? (coopManager.getCurrentRoom()?.roomCode ?? null)
        : null;
    const localPlayerStats = isOnlineGuest
      ? gameState.p2Stats
      : gameState.p1Stats;
    const counts = localPlayerStats?.defeatedCounts ??
      (isOnlineGuest
        ? { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 }
        : gameState.defeatedCounts || { BASIC: 0, FAST: 0, POWER: 0, ARMOR: 0 });
    const combatEarnedXp =
      (counts.BASIC || 0) * 1 +
      (counts.FAST || 0) * 2 +
      (counts.POWER || 0) * 3 +
      (counts.ARMOR || 0) * 5;
    const startingLives = getStartingLivesForDifficultyAndMode(
      gameState.difficulty,
      gameState.gameMode
    );
    const currentLives = isOnlineGuest
      ? (gameState.p2State?.lives ?? startingLives)
      : (gameState.p1State?.lives ?? startingLives);
    const livesLost = Math.max(0, startingLives - currentLives);
    const achievementBonus =
      outcome === 'WIN'
        ? calculateStageAchievementBonus({
            isStageClear: true,
            livesLost,
            stageElapsedSeconds: gameState.stageElapsedSeconds ?? 0,
            matchDurationSeconds: gameState.matchDurationSeconds || 120,
          })
        : { bonusXp: 0, noLifeLostMet: false, halfTimeMet: false, reasonCode: 'NONE' as const };
    const stageEarnedXp = combatEarnedXp + achievementBonus.bonusXp;
    const localTotalXp = (localPlayerStats
      ? localPlayerStats.score
      : isOnlineGuest
        ? 0
        : gameState.score) + achievementBonus.bonusXp;
    const matchInstanceId = gameState.matchInstanceId || gameEngine.getMatchInstanceId();
    const { runKey, xpEventId } = buildBattleXpIdentifiers({
      uid: currentUser.uid,
      gameMode: gameState.gameMode || 'SOLO',
      matchInstanceId,
      stageId,
      stageRunSeq: gameState.stageRunSeq,
      outcome,
      roomCode,
    });
    PlayerStatsManager.getInstance().recordMatchOutcome({
      uid: currentUser.uid,
      runKey,
      xpEventId,
      outcome,
      stageId,
      gameMode: gameState.gameMode || 'SOLO',
      earnedScoreXp: stageEarnedXp,
      achievementBonusXp: achievementBonus.bonusXp,
      runTotalScoreXp: localTotalXp,
      defeatedByType: counts,
      roomCode,
    });
  }, [
    isStageClearModalOpen,
    isGameOverModalOpen,
    gameState,
    gameEngine,
    isTrialMode,
    currentUser?.uid,
    coopManager,
  ]);

  const handleProfileUpdated = useCallback(() => {
    setCurrentUser(authManager.getCurrentUser());
    setProfileRevision((r) => r + 1);
  }, [authManager]);

  const handleMaintenanceExitToMenu = useCallback(() => {
    setMaintenanceInterruptAlert(null);
    setOnlineDisconnectMsg(null);
    setIsReturningToLobby(false);
    setReturnToLobbyError(null);
    gameEngine.quitToMenu();
    setIsPaused(false);
    SoundManager.getInstance().stopAllActiveActionSources();
    MusicManager.getInstance().syncMenuPlayback();
    setGameState({ ...gameEngine.getState() });
    setAppScreen('WELCOME');
  }, [gameEngine]);

  const maintenanceModalOverlay = maintenanceInterruptAlert ? (
    <div
      data-testid="active-maintenance-interrupt-modal"
      className="fixed inset-0 z-[130] flex items-center justify-center bg-[#050510]/92 p-4 select-none"
    >
      <div className="w-full max-w-md rounded-lg border-2 border-[#FFB800] bg-[#0b0d1e] shadow-2xl overflow-hidden animate-neo-fade-in">
        <div className="px-5 py-3.5 border-b border-neutral-800 bg-amber-950/50 flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-[#FFB800] shrink-0" />
          <h3 className="font-btn text-sm font-black uppercase tracking-wider text-[#FFB800]">
            {t('THÔNG BÁO BẢO TRÌ HỆ THỐNG', 'SYSTEM MAINTENANCE NOTICE')}
          </h3>
        </div>
        <div className="p-5 space-y-3 text-center">
          <p className="text-xs sm:text-sm text-neutral-100 font-semibold leading-relaxed whitespace-pre-line">
            {formatSentenceLineBreaks(maintenanceInterruptAlert)}
          </p>
        </div>
        <div className="px-5 py-3.5 border-t border-neutral-800 bg-[#050510]/90 flex items-center justify-center">
          <button
            type="button"
            data-testid="maintenance-exit-to-menu-btn"
            onClick={handleMaintenanceExitToMenu}
            className="font-btn w-full min-h-[48px] py-2.5 px-5 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-black text-xs sm:text-sm uppercase tracking-wider transition-all shadow-lg cursor-pointer"
          >
            {t('Về trang chủ', 'Return Home')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const socialOverlayHubElement = currentUser && !isTrialMode ? (
    <SocialOverlayHub
      currentUser={currentUser}
      sessionStatus={sessionSnapshot.status}
      isBattleScreen={appScreen === 'BATTLE'}
      isFriendsModalOpen={isFriendsModalOpen}
      onCloseFriendsModal={() => setIsFriendsModalOpen(false)}
      activeLobbyRoom={activeLobbyRoom}
      onPendingFriendRequestsChange={setPendingFriendRequestsCount}
    />
  ) : null;

  // View 1: Welcome Screen (Unauthenticated user or initial landing - V.1: Clean screen without Top Menu)
  if (
    !maintenanceInterruptAlert &&
    ((!currentUser && (!isTrialMode || appScreen !== 'BATTLE')) || appScreen === 'WELCOME')
  ) {
    return (
      <div className="min-h-[100dvh] bg-[#050510] text-[#EAF4FF] flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-[#FFB800] selection:text-black">
        {!isAuthReady && (
          <div className="w-full bg-[#0b0d1e]/90 border-b border-[#00F0FF]/30 px-3 py-1 text-center text-[11px] font-mono text-[#FFB800]/90">
            {t('Đang kiểm tra trạng thái kết nối...', 'Checking connection status...')}
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
        {maintenanceModalOverlay}
      </div>
    );
  }

  // View 2: Main Menu Screen (Authenticated user before entering battle)
  if (appScreen === 'MAIN_MENU' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-[#050510] text-[#EAF4FF] flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-[#FFB800] selection:text-black">
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

        <ContactModal
          isOpen={isContactOpen}
          onClose={() => setIsContactOpen(false)}
          isAuthenticated={Boolean(currentUser && !isTrialMode)}
        />

        <MainMenuScreen
          user={{
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
          }}
          session={sessionSnapshot}
          isProcessing={authProcessing}
          selectedLobbyMode={selectedLobbyMode}
          onSelectLobbyMode={(lobbyMode) => {
            setSelectedLobbyMode(lobbyMode);
            setModeSelectionInitialCard(lobbyMode);
            if (lobbyMode === 'SOLO') {
              setSelectedMode('SOLO');
            } else if (lobbyMode === 'COOP_AI') {
              setSelectedMode('TWO_PLAYERS');
              setTwoPlayerOption('P2_AI');
            } else {
              setSelectedMode('TWO_PLAYERS');
              setTwoPlayerOption('P2_REAL');
            }
          }}
          onConfirmMode={(lobbyMode) => {
            setSelectedLobbyMode(lobbyMode);
            setModeSelectionInitialCard(lobbyMode);
            if (lobbyMode === 'SOLO') {
              setSelectedMode('SOLO');
              setModeSelectionInitialStep('SELECT_DIFFICULTY');
            } else if (lobbyMode === 'COOP_AI') {
              setSelectedMode('TWO_PLAYERS');
              setTwoPlayerOption('P2_AI');
              setModeSelectionInitialStep('SELECT_DIFFICULTY');
            } else {
              setSelectedMode('TWO_PLAYERS');
              setTwoPlayerOption('P2_REAL');
              setModeSelectionInitialStep('COOP_ONLINE_LOBBY');
            }
            setAppScreen('MODE_SELECTION');
          }}
          onStartSoloDirect={handleStartSoloDirect}
          onStartVsMatch={handleOpenVsOnlineLobby}
          onPlay={() => {
            setModeSelectionInitialCard(selectedLobbyMode);
            setModeSelectionInitialStep('SELECT_MODE');
            setAppScreen('MODE_SELECTION');
          }}
          onSignOut={handleSignOut}
          onRetryAcquire={handleRetryAcquire}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          onOpenSettings={() => {
            setSettingsInitialTab('ACCOUNT');
            setIsSettingsOpen(true);
          }}
          onOpenFriends={() => setIsFriendsModalOpen(true)}
          pendingFriendRequestsCount={pendingFriendRequestsCount}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenContact={() => setIsContactOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          isSuperAdmin={isSuperAdmin}
        />

        {socialOverlayHubElement}

        {/* Protective Interruption Modal if displaced while on menu */}
        <SessionAlertModal
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onReauth={handleReauth}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
        {maintenanceModalOverlay}
      </div>
    );
  }

  // View 2.5: Mode Selection Screen (Select SOLO vs CO-OP AI vs CO-OP ONLINE)
  if (appScreen === 'MODE_SELECTION' && currentUser) {
    return (
      <div className="min-h-[100dvh] bg-[#050510] text-[#EAF4FF] flex flex-col justify-start font-sans select-none overflow-x-hidden selection:bg-[#FFB800] selection:text-black">
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

        <ContactModal
          isOpen={isContactOpen}
          onClose={() => setIsContactOpen(false)}
          isAuthenticated={Boolean(currentUser && !isTrialMode)}
        />

        <ModeSelectionScreen
          user={{
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
          }}
          firebaseUser={currentUser}
          key={`mode_select_${modeSelectionInitialCard}_${modeSelectionInitialStep}`}
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onBack={() => setAppScreen('MAIN_MENU')}
          onStartMatch={(mode, opt, stageId) => {
            handleStartMatch(mode, opt, stageId);
          }}
          onStartOnlineMatch={handleStartOnlineMatch}
          onStartVsMatch={handleOpenVsOnlineLobby}
          difficulty={difficulty}
          onDifficultyChange={handleDifficultyChange}
          onOpenSettings={() => {
            setSettingsInitialTab('ACCOUNT');
            setIsSettingsOpen(true);
          }}
          onOpenFriends={() => setIsFriendsModalOpen(true)}
          pendingFriendRequestsCount={pendingFriendRequestsCount}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenContact={() => setIsContactOpen(true)}
          onOpenDevTools={() => setIsDevDrawerOpen(true)}
          selectedMode={selectedMode}
          onSelectedModeChange={setSelectedMode}
          twoPlayerOption={twoPlayerOption}
          onTwoPlayerOptionChange={setTwoPlayerOption}
          initialFlowStep={modeSelectionInitialStep}
          initialCardMode={modeSelectionInitialCard}
          isSuperAdmin={isSuperAdmin}
        />

        {socialOverlayHubElement}

        {/* Protective Interruption Modal if displaced while on mode selection */}
        <SessionAlertModal
          session={sessionSnapshot}
          isProcessing={authProcessing}
          onReauth={handleReauth}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
        {maintenanceModalOverlay}
      </div>
    );
  }

  const currentBattleStageSpec = StageManager.getInstance().getLiveCampaignStageView(
    Math.max(1, gameState?.currentStageId ?? 1)
  );
  const centeredStageTitle = isVsMatch
    ? gameState?.gameMode === 'VS_P1_P2'
      ? t('ĐẤU ĐỐI KHÁNG VS: P1 vs P2', 'VERSUS ARENA: P1 vs P2')
      : t('ĐẤU ĐỐI KHÁNG VS: P1 + A.I vs P2 + A.I', 'VERSUS ARENA: P1 + A.I vs P2 + A.I')
    : `${t('MÀN', 'STAGE')} ${currentBattleStageSpec.id}: ${currentBattleStageSpec.shortTitle.toUpperCase()}`;

  // View 3: Battle Arena with Canvas (Only mounted when player clicked "Chơi ngay")
  return (
    <div
      translate="no"
      className="notranslate min-h-[100dvh] bg-[#050510] text-[#EAF4FF] flex flex-col justify-between font-sans select-none overflow-x-hidden selection:bg-[#FFB800] selection:text-black"
    >
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

      {/* Support / Info Modal */}
      <SupportModal isOpen={isSupportOpen} onClose={() => setIsSupportOpen(false)} />

      {/* Contact / Feedback Modal */}
      <ContactModal
        isOpen={isContactOpen}
        onClose={() => setIsContactOpen(false)}
        isAuthenticated={Boolean(currentUser && !isTrialMode)}
      />

      {/* Top Battle Header: Player Name + Horizontal Slide-Out Menu (SOLO/CO-OP AI) OR Single Exit Button (CO-OP ONLINE/VS ONLINE) */}
      <AuthSessionBanner
        onStartMatchAllowedChange={setIsMatchAllowed}
        isBattleScreen={true}
        onlineBattleExitMode={isOnlineBattleMode}
        onRequestExitOnlineMatch={() => setShowOnlineExitConfirm(true)}
        onTopMenuOpenChange={handleBattleTopMenuOpenChange}
        isSuperAdmin={isSuperAdmin}
        onOpenSettings={() => {
          setSettingsInitialTab('ACCOUNT');
          setIsSettingsOpen(true);
        }}
        onOpenFriends={currentUser && !isTrialMode ? () => setIsFriendsModalOpen(true) : undefined}
        pendingFriendRequestsCount={pendingFriendRequestsCount}
        onOpenSupport={() => setIsSupportOpen(true)}
        onOpenContact={() => setIsContactOpen(true)}
        onOpenDevTools={() => setIsDevDrawerOpen(true)}
        onQuitToHome={handleQuitToMenu}
      />

      {/* Co-op Online Peer Disconnection Banner */}
      {onlineDisconnectMsg && (
        <div className="bg-red-950/95 border-b border-[#FF0055] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-red-200 z-40">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-[#FF0055] shrink-0" />
            <span className="whitespace-pre-line">{formatSentenceLineBreaks(onlineDisconnectMsg)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOnlineDisconnectMsg(null);
                void coopManager.retryWebRTCConnection();
              }}
              className="font-btn px-3 py-1 rounded bg-[#FFB800] hover:bg-amber-400 text-[#050510] font-bold text-xs cursor-pointer"
            >
              {t('Thử Kết Nối Lại P2P', 'Retry P2P Connection')}
            </button>
            <button
              type="button"
              onClick={handleQuitToMenu}
              className="font-btn px-3 py-1 rounded bg-[#FF0055] hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
            >
              {t('Về trang chủ', 'Return Home')}
            </button>
            <button
              type="button"
              onClick={() => setOnlineDisconnectMsg(null)}
              className="p-1 rounded bg-red-900/60 hover:bg-red-800/80 text-red-100 cursor-pointer"
              aria-label={t('Đóng', 'Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Centered Stage Headline Across All Battle Views + VS Status Line + Ping/FPS in Co-op Online & VS Online */}
      <div
        data-testid="battle-stage-center-banner"
        className="w-full py-1.5 px-2.5 sm:px-4 bg-[#050510]/90 border-b border-[#00F0FF]/15 flex flex-col items-center justify-center gap-1 shrink-0 z-30"
      >
        <div className="flex items-center justify-center gap-2 min-w-0 max-w-full">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isPaused ? 'bg-[#FFB800]' : 'bg-emerald-500 animate-pulse'}`} />
          <h2
            data-testid="battle-stage-center-title"
            className="font-btn font-black text-[#FFB800] tracking-wider text-xs sm:text-sm md:text-base uppercase text-center truncate"
          >
            {centeredStageTitle}
          </h2>
        </div>
        {isVsMatch && <VsTitleStatusLine state={gameState} />}
        {(isCoopOnlineMatch || isVsMatch) && showOnlineNetStats && (
          <span
            data-testid={layout.isLandscape ? 'landscape-online-net-stats' : 'portrait-online-net-stats'}
            className="px-2 py-0.5 rounded bg-sky-950/75 border border-[#00F0FF]/50 text-[#00F0FF] text-[11px] sm:text-xs font-bold shrink-0 whitespace-nowrap"
          >
            Ping: {peerPingMs != null ? `${Math.round(peerPingMs)}ms` : '--ms'} • {Math.round(fps)}fps
          </span>
        )}
      </div>

      {/* =========================================================================
          LANDSCAPE MODE (Mobile / Tablet 3-Column Ergonomic Layout - Top Aligned)
         ========================================================================= */}
      {(!isDesktop && layout.isLandscape) ? (
        <div
          translate="no"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="battle-touch-lock notranslate flex-1 flex flex-col justify-start w-full overflow-hidden"
        >
          {/* Landscape Main 3-Column Combat View */}
          <main className="flex-1 flex flex-row items-center justify-center w-full px-1 sm:px-2 pt-1 pb-1 overflow-x-hidden overflow-y-auto gap-1.5">
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

            {/* Center Column: Game Canvas */}
            <div className="flex-none flex flex-col items-center justify-center gap-1.5 mx-auto">
              <div
                style={{
                  boxSizing: 'content-box',
                  width: `${layout.canvasSizePx}px`,
                  height: `${layout.canvasSizePx}px`,
                  maxWidth: `${layout.canvasSizePx}px`,
                  maxHeight: `${layout.canvasSizePx}px`,
                }}
                className="flex-none flex items-center justify-center overflow-hidden p-0 relative mx-auto rounded-md border-2 border-[#00F0FF]/35 bg-black"
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
                    className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1 rounded bg-sky-950/90 border border-[#00F0FF]/60 text-sky-200 text-xs font-bold shadow-lg whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#00F0FF] shrink-0" />
                    <span>{t('Đang xem đồng đội', 'Spectating teammate')}</span>
                  </div>
                )}

                {gameState?.matchState === 'MENU' && (
                  <div className="absolute inset-0 bg-[#050510]/92 flex flex-col items-center justify-start pt-2 px-3 pb-3 text-center z-20 rounded-sm overflow-y-auto">
                    <GameLogo className="mb-1.5" />
                    <p className="font-btn text-xs text-[#FFB800] font-bold mb-2">
                      {centeredStageTitle}
                    </p>
                    <button
                      type="button"
                      onClick={isMatchAllowed ? handleRestart : undefined}
                      disabled={!isMatchAllowed}
                      className={`font-btn py-2 px-5 rounded font-extrabold text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 shrink-0 ${
                        isMatchAllowed
                          ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] shadow-[#FFB800]/30 cursor-pointer'
                          : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                      }`}
                    >
                      <Play className={`w-3.5 h-3.5 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                      <span>
                        {isMatchAllowed
                          ? t('BẮT ĐẦU TRẬN ĐẤU', 'START BATTLE')
                          : t('ĐĂNG NHẬP GMAIL ĐỂ BẮT ĐẦU', 'SIGN IN WITH GMAIL TO START')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Battle Center HUD Stats / VS Compact HUD (above Pause) + Virtual Shoot Button */}
            <div
              style={{
                width: `${layout.rightControlWidthPx}px`,
                minWidth: '110px',
              }}
              className={`flex-1 self-stretch flex flex-col items-center justify-center gap-2 ${
                isLocalSpectator ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <BattleCenterHudStats
                gameState={gameState}
                difficulty={difficulty}
                localOnlineRole={localOnlineRole}
              />
              {!isOnlineBattleMode && (
                <button
                  type="button"
                  onClick={isPaused ? handleResume : handlePause}
                  className="font-btn px-2.5 py-1 rounded-full bg-[#0b0d1e] hover:bg-neutral-800 border border-[#FFB800]/50 text-[#FFB800] text-[11px] font-black flex items-center gap-1 shadow cursor-pointer"
                >
                  {isPaused ? <Play className="w-3 h-3 fill-[#FFB800]" /> : <Pause className="w-3 h-3 fill-[#FFB800]" />}
                  <span>PAUSE</span>
                </button>
              )}
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
            MOBILE / TABLET PORTRAIT MODE (Top-to-Bottom Stack)
           ========================================================================= */
        <div
          translate="no"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className="battle-touch-lock notranslate flex-1 flex flex-col justify-start w-full overflow-hidden bg-[#050510]"
        >
          {/* Main Content Stack: Canvas -> Controls (VS lives displayed inside TouchControls center HUD) */}
          <div className="flex-1 flex flex-col items-center justify-start w-full overflow-hidden px-2 pt-1 pb-2">
            <main
              style={{
                boxSizing: 'content-box',
                width: `${layout.canvasSizePx}px`,
                height: `${layout.canvasSizePx}px`,
                maxWidth: `${layout.canvasSizePx}px`,
                maxHeight: `${layout.canvasSizePx}px`,
              }}
              className="shrink-0 flex items-center justify-center overflow-hidden relative mx-auto rounded-lg border-2 border-[#00F0FF]/35 bg-black shadow-2xl mt-0.5 sm:mt-1"
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
                <div className="absolute inset-0 bg-[#050510]/92 flex flex-col items-center justify-start pt-2 px-3 pb-3 text-center z-20 rounded-lg overflow-y-auto">
                  <GameLogo className="mb-1.5" />
                  <p className="font-btn text-xs sm:text-sm text-[#FFB800] font-bold mb-2">
                    {centeredStageTitle}
                  </p>
                  <button
                    type="button"
                    onClick={isMatchAllowed ? handleRestart : undefined}
                    disabled={!isMatchAllowed}
                    className={`font-btn py-2 px-5 rounded font-extrabold text-xs sm:text-sm shadow-lg transition-transform active:scale-95 flex items-center gap-1.5 shrink-0 ${
                      isMatchAllowed
                        ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] shadow-[#FFB800]/30 cursor-pointer'
                        : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                    }`}
                  >
                    <Play className={`w-4 h-4 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                    <span>
                      {isMatchAllowed
                        ? t('BẮT ĐẦU TRẬN ĐẤU', 'START BATTLE')
                        : t('ĐĂNG NHẬP ĐỂ BẮT ĐẦU', 'SIGN IN TO START')}
                    </span>
                  </button>
                </div>
              )}
            </main>

            {isLocalSpectator && (
              <div
                data-testid="mobile-spectator-banner"
                className="mt-2 px-3 py-1.5 rounded bg-sky-950/90 border border-[#00F0FF]/60 text-sky-200 text-xs sm:text-sm font-bold flex items-center gap-2 shadow"
              >
                <Eye className="w-4 h-4 text-[#00F0FF] shrink-0" />
                <span>{t('Đã hết mạng — Đang xem đồng đội', 'Out of lives — Spectating teammate')}</span>
              </div>
            )}

            {/* Controls Cluster with Center Battle HUD Stats between Joystick and Shoot Button, above Pause */}
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
                disablePause={isOnlineBattleMode}
                gameState={gameState}
                difficulty={difficulty}
                localOnlineRole={localOnlineRole}
              />
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            ENLARGED DESKTOP PC MODE (8/4 Grid Layout with Top Alignment)
           ========================================================================= */
        <div className="flex-1 flex flex-col justify-start w-full">
          {/* Main Content Area - Top Aligned */}
          <main className="max-w-[1560px] mx-auto w-full px-3 sm:px-4 lg:px-6 pt-3 sm:pt-4 pb-6 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            {/* Left Column: Enlarged Phaser Game Canvas */}
            <section className="lg:col-span-8 flex flex-col justify-start gap-3">
              <div className="bg-[#0b0d1e] border border-[#00F0FF]/30 rounded-lg overflow-hidden shadow-2xl flex flex-col justify-start">
                {/* Viewport Header */}
                <div className="bg-[#050510] px-4 py-2.5 border-b border-neutral-800 flex items-center justify-between text-xs">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-[#FFB800]' : 'bg-emerald-500 animate-pulse'}`} />
                      <span className="font-btn font-semibold text-[#FFB800]">
                        {centeredStageTitle} {isPaused ? '(PAUSED)' : ''}
                      </span>
                    </div>
                    {isVsMatch && <VsTitleStatusLine state={gameState} />}
                    {(isCoopOnlineMatch || isVsMatch) && showOnlineNetStats && (
                      <span
                        data-testid="desktop-online-net-stats"
                        className="font-hud px-2 py-0.5 rounded bg-sky-950/75 border border-[#00F0FF]/50 text-[#00F0FF] text-xs font-bold"
                      >
                        Ping: {peerPingMs != null ? `${Math.round(peerPingMs)} ms` : '-- ms'} • {Math.round(fps)} FPS
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTouchControls((v) => !v)}
                      className={`font-btn flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                        showTouchControls
                          ? 'bg-[#0b0d1e] text-[#FFB800] border-[#FFB800]/50'
                          : 'text-neutral-400 border-neutral-800 hover:text-neutral-200'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Joystick: {showTouchControls ? t('Bật', 'On') : t('Tắt', 'Off')}</span>
                    </button>

                    {!isOnlineBattleMode && (
                      <>
                        <button
                          onClick={isPaused ? handleResume : handlePause}
                          className="font-btn flex items-center gap-1 px-2.5 py-1 rounded bg-[#0b0d1e] hover:bg-neutral-800 border border-[#FFB800]/40 text-neutral-200 text-[11px] font-semibold cursor-pointer"
                        >
                          <Pause className="w-3 h-3" />
                          <span>{isPaused ? t('Tiếp tục', 'Resume') : t('Tạm dừng (P)', 'Pause (P)')}</span>
                        </button>

                        <button
                          onClick={handleResetGame}
                          className="font-btn flex items-center gap-1 px-2.5 py-1 rounded bg-[#0b0d1e] hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-[11px] cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{t('Đặt lại', 'Reset')}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Canvas Container - Top Aligned */}
                <div className="p-3 sm:p-4 lg:p-5 bg-[#050510]/90 flex items-start justify-center relative">
                  <div className="w-full max-w-[min(calc(100dvh-140px),832px)] aspect-square flex items-center justify-center rounded-md border-2 border-[#00F0FF]/35 bg-black overflow-hidden">
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
                    <div className="absolute inset-0 bg-[#050510]/92 flex flex-col items-center justify-start pt-4 px-6 pb-4 text-center z-20 rounded-lg overflow-y-auto">
                      <GameLogo className="mb-2" />
                      <p className="font-btn text-sm sm:text-base text-[#FFB800] font-bold mb-3">
                        {centeredStageTitle}
                      </p>
                      <button
                        type="button"
                        onClick={isMatchAllowed ? handleRestart : undefined}
                        disabled={!isMatchAllowed}
                        className={`font-btn py-3 px-8 rounded font-extrabold text-sm shadow-xl transition-transform active:scale-95 flex items-center gap-2.5 shrink-0 ${
                          isMatchAllowed
                            ? 'bg-[#FFB800] hover:bg-amber-400 text-[#050510] shadow-[#FFB800]/30 cursor-pointer'
                            : 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed'
                        }`}
                      >
                        <Play className={`w-4 h-4 ${isMatchAllowed ? 'fill-black' : 'fill-neutral-500'}`} />
                        <span>
                          {isMatchAllowed
                            ? t('BẮT ĐẦU TRẬN ĐẤU (SPACE / ENTER)', 'START BATTLE (SPACE / ENTER)')
                            : t('ĐĂNG NHẬP GMAIL ĐỂ BẮT ĐẦU', 'SIGN IN WITH GMAIL TO START')}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Viewport Footer */}
                <div className="bg-[#050510] px-4 py-2 border-t border-neutral-800 flex flex-wrap items-center justify-between text-xs gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSupportOpen(true)}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-[#00F0FF] text-[11px] transition-colors cursor-pointer"
                  >
                    <span>{t('Xem hướng dẫn điều khiển trong mục Thông tin', 'View controls guide in Information')}</span>
                  </button>
                  <div className="font-hud flex items-center gap-2 text-sm">
                    <span className="text-neutral-500">{Math.round(fps)} FPS</span>
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
                    disablePause={isOnlineBattleMode}
                    gameState={gameState}
                    difficulty={difficulty}
                    localOnlineRole={localOnlineRole}
                    showKeyboardHint={true}
                  />
                </div>
              )}
            </section>

            {/* Right Column: Live Combat HUD & Quick Stats (4 Cols on PC) */}
            <section className="lg:col-span-4 flex flex-col gap-4">
              {isVsMatch ? (
                <VsHud
                  state={gameState}
                  localOnlineRole={localOnlineRole}
                />
              ) : (
                <M3Hud
                  state={gameState}
                  onReset={isCoopOnlineMatch ? undefined : handleResetGame}
                  onSpawnEnemy={handleSpawnNextEnemy}
                  onPause={isCoopOnlineMatch ? undefined : handlePause}
                  isSuperAdmin={isSuperAdmin}
                  localOnlineRole={localOnlineRole}
                  fps={fps}
                  peerPingMs={peerPingMs}
                  showOnlineNetStats={showOnlineNetStats}
                />
              )}

              {/* Admin Only: Terrain Legend & QA Quick Access Card */}
              {isSuperAdmin && (
                <>
                  <TerrainLegend tileCounts={validation.tileCounts} />

                  <div className="bg-[#0b0d1e] border border-[#FFB800]/30 rounded-lg p-4 text-xs flex flex-col gap-2.5 shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-[#FFB800]" />
                        <span className="font-btn font-bold text-white">
                          {t('Bảng Kiểm Thử & QA (Admin)', 'QA & Test Suite (Admin)')}
                        </span>
                      </div>
                      <span className="font-btn px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                        ADMIN
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsDevDrawerOpen(true)}
                      className="font-btn w-full py-2 px-3 rounded bg-[#050510] hover:bg-neutral-800 border border-[#FFB800]/40 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5 text-[#FFB800]" />
                      <span>{t('Mở Bảng Điều Khiển Kiểm Thử & QA', 'Open QA & Test Suite Console')}</span>
                    </button>
                  </div>
                </>
              )}
            </section>
          </main>
        </div>
      )}

      {/* Universal Battle Footer across all screens (Landscape, Portrait, Desktop) */}
      <footer className="relative z-10 w-full border-t border-neutral-800 bg-[#050510]/90 px-4 py-2.5 text-center text-xs text-[#687386] shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <span>© 2026 Bắn Tank Online</span>
        </div>
      </footer>

      {/* =========================================================================
          MATCH MODALS (Pause, Online Exit Confirm, GameOver, StageClear, VsResult)
         ========================================================================= */}
      <PauseModal
        isOpen={
          isPaused &&
          !isOnlineBattleMode &&
          !isSettingsOpen &&
          !isSupportOpen &&
          !isContactOpen &&
          !isFriendsModalOpen &&
          !isDevDrawerOpen
        }
        onResume={handleResume}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
        isTrialMode={isTrialMode}
        belowHeader={isTopMenuOpenInBattle}
      />

      {/* M7.8 Section XIV: Online Battle Exit Confirmation Modal (CO-OP ONLINE & VS ONLINE) */}
      {showOnlineExitConfirm && isOnlineBattleMode && (
        <div
          data-testid="online-battle-exit-confirm-modal"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#050510]/92 p-4 select-none animate-neo-fade-in"
        >
          <div className="w-full max-w-md rounded-xl border-2 border-[#FF0055] bg-[#0b0d1e] shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-neutral-800 bg-rose-950/40 flex items-center gap-2.5">
              <LogOut className="w-5 h-5 text-[#FF0055] shrink-0" />
              <h3 className="font-btn text-sm sm:text-base font-black text-white uppercase tracking-wide">
                {t('Bạn có chắc chắn muốn rời trận đấu?', 'Are you sure you want to leave the match?')}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed">
                {t(
                  'Rời trận sẽ được xử lý theo quy tắc của chế độ đang chơi.',
                  'Leaving the match will be handled according to the rules of the active game mode.'
                )}
              </p>
              {isVsMatch && (
                <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-500/40 rounded-lg p-2.5">
                  {t(
                    'Trong VS Online, xác nhận rời trận sẽ xử thắng cho đối thủ với lý do "Đối thủ đã rời trận".',
                    'In VS Online, confirming exit forfeits the match and awards victory to your opponent ("Opponent left the match").'
                  )}
                </p>
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-neutral-800 bg-[#050510]/90 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="online-exit-stay-btn"
                onClick={() => setShowOnlineExitConfirm(false)}
                className="font-btn min-h-[46px] py-2.5 px-4 rounded-lg bg-[#0b0d1e] hover:bg-neutral-800 border border-[#00F0FF]/50 text-[#00F0FF] font-black text-xs uppercase tracking-wider cursor-pointer active:scale-95 transition-transform"
              >
                {t('Ở lại trận đấu', 'Stay in Match')}
              </button>
              <button
                type="button"
                data-testid="online-exit-confirm-btn"
                onClick={handleConfirmOnlineBattleExit}
                className="font-btn min-h-[46px] py-2.5 px-4 rounded-lg bg-[#FF0055] hover:bg-rose-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer shadow-lg shadow-[#FF0055]/30 active:scale-95 transition-transform"
              >
                {t('Xác nhận rời trận', 'Confirm Leave Match')}
              </button>
            </div>
          </div>
        </div>
      )}

      <GameOverModal
        isOpen={isGameOverModalOpen}
        state={gameState}
        onRestart={handleRestart}
        onQuitToMenu={handleQuitToMenu}
        onReturnToLobby={isCoopOnlineMatch ? handleReturnToLobby : undefined}
        isReturningToLobby={isReturningToLobby}
        returnToLobbyError={returnToLobbyError}
        onDismissReturnError={() => setReturnToLobbyError(null)}
        isTrialMode={isTrialMode}
        localOnlineRole={localOnlineRole}
        rematchReady={rematchReady}
        onRequestRematchPrompt={isCoopOnlineMatch ? handleRequestRematchPrompt : undefined}
        onToggleRematchReady={isCoopOnlineMatch ? handleToggleRematchReady : undefined}
        hasTeammateLeft={hasTeammateLeft}
      />

      <StageClearModal
        isOpen={isStageClearModalOpen}
        state={gameState}
        onNextStageOrReplay={handleNextStageOrReplay}
        onQuitToMenu={handleQuitToMenu}
        onReturnToLobby={isCoopOnlineMatch ? handleReturnToLobby : undefined}
        isReturningToLobby={isReturningToLobby}
        returnToLobbyError={returnToLobbyError}
        onDismissReturnError={() => setReturnToLobbyError(null)}
        isTrialMode={isTrialMode}
        localOnlineRole={localOnlineRole}
        postStageReady={postStageReady}
        onTogglePostStageReady={isCoopOnlineMatch ? handleTogglePostStageReady : undefined}
        hasTeammateLeft={hasTeammateLeft}
      />

      <VsResultModal
        isOpen={isVsResultModalOpen}
        state={gameState}
        onReplay={() => {
          void handleReturnToLobby();
        }}
        isReturningToLobby={isReturningToLobby}
        returnToLobbyError={returnToLobbyError}
        onDismissReturnError={() => setReturnToLobbyError(null)}
        onQuitToMenu={handleQuitToMenu}
      />

      {socialOverlayHubElement}
      {maintenanceModalOverlay}
    </div>
  );
}
