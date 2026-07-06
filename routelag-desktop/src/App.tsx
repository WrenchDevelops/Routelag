import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { api } from "./api";
import {
  applyAppPreferences,
  LAST_VIEW_KEY,
  loadAppPreferences,
} from "./lib/appPreferences";
import {
  loadProfileAvatar,
  saveProfileAvatar,
} from "./lib/profileAvatar";
import { AdminModal } from "./components/AdminModal";
import { AppSidebar } from "./components/AppSidebar";
import type { AppNavItem } from "./components/AppSidebar";
import { AccountPage } from "./pages/AccountPage";
import { MiniAppShell } from "./components/MiniAppShell";
import { MiniFooterNav } from "./components/MiniFooterNav";
import { ToastProvider, useToast } from "./components/Toast";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { HelpCenterPage } from "./pages/HelpCenterPage";
import { HomePage } from "./pages/HomePage";
import { HudOverlayPage } from "./pages/HudOverlayPage";
import { LoginPage } from "./pages/LoginPage";
import { LogsPage } from "./pages/LogsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReplayEnginePage } from "./pages/ReplayEnginePage";
import { RouteSelectPage } from "./pages/RouteSelectPage";
import { LiveSessionPage } from "./pages/LiveSessionPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { clearRouteAuth, getRouteToken, routeApi, ROUTELAG_API_URL } from "./lib/api";
import { IS_BETA_DALLAS } from "./lib/betaMode";
import {
  fallbackRouteOptions,
  mapRoutingNodeToRouteOption,
  mergeRouteOptions,
  resolveRouteOption,
} from "./lib/routeCatalog";
import {
  exportReport as exportRouteReport,
  restoreInternet as restoreRouteInternet,
  runDiagnostics as runRouteDiagnostics,
  startOptimization as startRouteOptimization,
  stopOptimization,
  testWireGuardServer,
  type ActiveRouteSession,
} from "./lib/routeEngine";
import { runAutoRoute as runAutoRouteFlow } from "./lib/autoRoute";
import {
  detectPublicIpLocation,
  formatProfileLocation,
  recommendRouteId,
  resolveAutoRouteRegion,
} from "./lib/userLocation";
import type { AutoRouteState } from "./types";
import type {
  BetaReportSnapshot,
  FortniteReplay,
  InlineError,
  LifecycleStressStatus,
  OptimizeState,
  PingResult,
  RecoveryStatus,
  RestoreInternetResult,
  RouteMode,
  TesterProfile,
  TunnelStatus,
  WireGuardProbeStep,
} from "./types";
import {
  defaultLifecycleStressStatus,
  defaultTesterProfile,
  defaultTunnelStatus,
  normalizeTunnelStatus,
} from "./types";

export type MiniView =
  | "games"
  | "routes"
  | "session"
  | "stats"
  | "diagnostics"
  | "help"
  | "hud"
  | "profile"
  | "replays"
  | "settings"
  | "billing"
  | "logs"
  | "autoRoute";

export type GameId = "cs2" | "fortnite" | "rocket-league" | "rust";

export interface GameOption {
  id: GameId;
  name: string;
  image: string;
  tone: "orange" | "sky" | "blue" | "rose";
}

export interface RouteOption {
  id: string;
  label: string;
  ping: string;
  available?: boolean;
  meta?: string;
  region?: string;
  city?: string;
  country?: string;
  status?: string;
  name?: string;
  ip?: string;
  endpoint?: string;
  notes?: string;
  recommended?: boolean;
  qualityLabel?: string;
  sampleCount?: number;
  gameRegion?: string;
  gameTargetIp?: string;
}

const PRESERVED_ROUTE_STORAGE_KEYS = new Set([
  "routelag.routeToken",
  "routelag.testerId",
  "routelag.inviteCode",
]);
const LIFECYCLE_STRESS_KEY = "routelag.lifecycleStress";
const QUICK_TOOLS_KEY = "routelag.showQuickTools";
const MIN_HOME_LOADER_MS = 450;
const HOME_NAV_PAINT_MS = 80;
const RESTORABLE_VIEWS: MiniView[] = [
  "games",
  "routes",
  "session",
  "hud",
  "replays",
  "help",
  "settings",
  "profile",
  "stats",
];

function loadInitialView(): MiniView {
  const prefs = loadAppPreferences();
  if (!prefs.openLastPage) return "games";
  const saved = window.localStorage.getItem(LAST_VIEW_KEY);
  if (saved && RESTORABLE_VIEWS.includes(saved as MiniView)) {
    return saved as MiniView;
  }
  return "games";
}

function clearRouteRuntimeStorage() {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key))
      .filter(isRouteRuntimeStorageKey);
    keys.forEach((key) => storage.removeItem(key));
  }
}

function isRouteRuntimeStorageKey(key: string) {
  if (PRESERVED_ROUTE_STORAGE_KEYS.has(key)) return false;
  if (!key.startsWith("routelag.")) return false;
  return /(active|cleanup|engine|optimiz|profile|recovery|route|session|stale|tunnel)/i.test(key);
}

function recoveryIsClean(recovery: RecoveryStatus) {
  return (
    !recovery.stale_state_detected &&
    !recovery.stored_session_id &&
    !recovery.route_service_installed &&
    !recovery.route_service_running
  );
}

function recoveryDetails(recovery: RecoveryStatus) {
  const services = recovery.stale_services.length
    ? recovery.stale_services
        .map(
          (service) =>
            `${service.service_name}: installed=${service.installed} running=${service.running}`,
        )
        .join("\n")
    : "none";
  const cleanup = recovery.last_cleanup_result
    ? recovery.last_cleanup_result.steps
        .map((step) => `${step.ok ? "OK" : "WARN"} ${step.step}: ${step.message}`)
        .join("\n")
    : "none";
  return [
    `staleStateDetected=${recovery.stale_state_detected}`,
    `storedSessionId=${recovery.stored_session_id ?? "none"}`,
    `routeServiceInstalled=${recovery.route_service_installed}`,
    `routeServiceRunning=${recovery.route_service_running}`,
    `routeProfileExists=${recovery.route_profile_exists}`,
    `services:\n${services}`,
    `lastCleanupResult:\n${cleanup}`,
  ].join("\n");
}

function restoreWarningDetails(
  result: RestoreInternetResult,
  recovery: RecoveryStatus,
) {
  const failed = result.steps
    .filter((step) => !step.ok)
    .map((step) => `${step.step}: ${step.message}`)
    .join("\n");
  return [failed, recoveryDetails(recovery)].filter(Boolean).join("\n\n");
}

function loadLifecycleStressStatus(): LifecycleStressStatus {
  try {
    const stored = window.localStorage.getItem(LIFECYCLE_STRESS_KEY);
    if (!stored) return defaultLifecycleStressStatus();
    return { ...defaultLifecycleStressStatus(), ...JSON.parse(stored) };
  } catch {
    return defaultLifecycleStressStatus();
  }
}

function serviceLeftoverSummary(recovery: RecoveryStatus) {
  if (!recovery.route_service_installed) return "None";
  if (recovery.route_service_running) return "RouteLag service still running";
  return "RouteLag service installed but stopped";
}

function apiCleanupSummary(warnings: string[]) {
  const apiWarning = warnings.find((warning) =>
    warning.includes("API route session cleanup failed"),
  );
  return apiWarning ? `Warning: ${apiWarning}` : "Ended";
}

function AppContent() {
  const { showToast } = useToast();
  const [authenticated, setAuthenticated] = useState(() => Boolean(getRouteToken()));
  const [showQuickTools, setShowQuickTools] = useState(
    () => window.localStorage.getItem(QUICK_TOOLS_KEY) === "true",
  );
  const [view, setView] = useState<MiniView>(loadInitialView);
  const [homeLoading, setHomeLoading] = useState(false);
  const [homeMounted, setHomeMounted] = useState(true);
  const homeNavTimerRef = useRef<number | null>(null);
  const homeNavSwitchRef = useRef<number | null>(null);
  const homeNavFinishRef = useRef<number | null>(null);
  const homeNavStartedAtRef = useRef<number | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameId>("fortnite");
  const [selectedRoute, setSelectedRoute] = useState(
    IS_BETA_DALLAS ? "dallas-beta" : "johannesburg-beta",
  );
  const [routes, setRoutes] = useState<RouteOption[]>(fallbackRouteOptions);
  const [status, setStatus] = useState<TunnelStatus>(defaultTunnelStatus());
  const statusRef = useRef(status);
  statusRef.current = status;
  const [hasConfig, setHasConfig] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [engineInstalled, setEngineInstalled] = useState(true);
  const [publicIp, setPublicIp] = useState("192.193.1.1");
  const [ping, setPing] = useState<PingResult | null>(null);
  const [homeReplays, setHomeReplays] = useState<FortniteReplay[]>([]);
  const [homeStatsLoading, setHomeStatsLoading] = useState(
    () => Boolean(getRouteToken()),
  );
  const [homeReplaysLoading, setHomeReplaysLoading] = useState(
    () => Boolean(getRouteToken()),
  );
  const [logs, setLogs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [loginAccepted, setLoginAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  const [optimizeState, setOptimizeState] = useState<OptimizeState>("idle");
  const [activeRouteSession, setActiveRouteSession] = useState<ActiveRouteSession | null>(
    null,
  );
  const [routeMode, setRouteMode] = useState<RouteMode | null>(null);
  const [activeAllowedIps, setActiveAllowedIps] = useState<string | null>(null);
  const [serverProbeBusy, setServerProbeBusy] = useState(false);
  const [serverProbeSteps, setServerProbeSteps] = useState<WireGuardProbeStep[] | null>(
    null,
  );
  const [betaReport, setBetaReport] = useState<BetaReportSnapshot | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile>(
    defaultTesterProfile,
  );
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(() =>
    loadProfileAvatar(),
  );
  const [lifecycleStress, setLifecycleStress] = useState<LifecycleStressStatus>(
    loadLifecycleStressStatus,
  );
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [autoRouteState, setAutoRouteState] = useState<AutoRouteState>("idle");
  const diagnosticsRunId = useRef(0);

  const statusView = normalizeTunnelStatus(status);
  const refreshMeta = useCallback(async () => {
    const [cfg, elev, wg, tunnel, active] = await Promise.all([
      api.hasConfig(),
      api.isElevated(),
      api.isRouteLagEngineAvailable(),
      api.tunnelStatus(),
      api.loadActiveRouteSession(),
    ]);
    setHasConfig(cfg);
    setElevated(elev);
    setEngineInstalled(wg);
    setStatus(tunnel);
    setActiveRouteSession(active);
    return { cfg, elev, wg, active, tunnel };
  }, []);

  const refreshStats = useCallback(async () => {
    await refreshMeta();
    try {
      setPublicIp(await api.getPublicIp());
    } catch {
      setPublicIp("Unavailable");
    }
    try {
      setPing(await api.pingHost());
    } catch {
      setPing(null);
    }
  }, [refreshMeta]);

  const loadHomeDashboard = useCallback(async () => {
    setHomeStatsLoading(true);
    setHomeReplaysLoading(true);

    const statsTask = (async () => {
      try {
        setPublicIp(await api.getPublicIp());
      } catch {
        setPublicIp("Unavailable");
      }
      try {
        setPing(await api.pingHost());
      } catch {
        setPing(null);
      } finally {
        setHomeStatsLoading(false);
      }
    })();

    const replaysTask = api
      .listFortniteReplays()
      .then(setHomeReplays)
      .catch(() => setHomeReplays([]))
      .finally(() => setHomeReplaysLoading(false));

    await Promise.all([statsTask, replaysTask]);
  }, []);

  const resetRouteRuntimeUi = useCallback((recovery?: RecoveryStatus) => {
    clearRouteRuntimeStorage();
    setOptimizeState("idle");
    setStatus(defaultTunnelStatus());
    setRouteMode(null);
    setActiveAllowedIps(null);
    setActiveRouteSession(null);
    setHasConfig(false);
    setMessage(null);
    if (!recovery || recoveryIsClean(recovery)) {
      setInlineError(null);
    }
  }, []);

  const updateLifecycleStress = useCallback(
    (
      updater:
        | Partial<LifecycleStressStatus>
        | ((current: LifecycleStressStatus) => LifecycleStressStatus),
    ) => {
      setLifecycleStress((current) => {
        const next =
          typeof updater === "function"
            ? updater(current)
            : { ...current, ...updater };
        window.localStorage.setItem(LIFECYCLE_STRESS_KEY, JSON.stringify(next));
        return next;
      });
    },
    [],
  );

  const refreshSettings = useCallback(async () => {
    await refreshMeta();
  }, [refreshMeta]);

  const updateTesterProfile = useCallback(
    (patch: Partial<TesterProfile>) => {
      setTesterProfile((current) => {
        const next = { ...current, ...patch };
        void api.saveTesterProfile(next).catch(() => undefined);
        return next;
      });
    },
    [],
  );

  const updateProfileImage = useCallback((imageUrl: string | null) => {
    saveProfileAvatar(imageUrl);
    setProfileImageUrl(imageUrl);
  }, []);

  useEffect(() => {
    applyAppPreferences();
  }, []);

  useEffect(() => {
    if (authenticated && RESTORABLE_VIEWS.includes(view)) {
      window.localStorage.setItem(LAST_VIEW_KEY, view);
    }
  }, [authenticated, view]);

  useEffect(() => {
    void refreshMeta();
    void api
      .getRecoveryStatus()
      .then((recovery) => {
        if (recovery.stale_state_detected) {
          setInlineError({
            title: "Previous optimization did not close cleanly",
            message:
              "RouteLag found a stored route session or tunnel service from an earlier run. Restore Internet before starting another optimization.",
            details: recoveryDetails(recovery),
            canRestore: true,
          });
        }
      })
      .catch(() => undefined);
    if (view !== "session" && view !== "routes" && busy !== "connect") {
      return;
    }
    const interval = window.setInterval(() => {
      void api.tunnelStatus().then(setStatus).catch(() => undefined);
    }, 6000);
    return () => window.clearInterval(interval);
  }, [busy, refreshMeta, view]);

  useEffect(() => {
    if (!authenticated) return;
    const prefs = loadAppPreferences();
    if (!prefs.checkEngineOnLaunch) return;
    void api.isRouteLagEngineAvailable().then((ok) => {
      if (!ok) {
        showToast("RouteLag Engine was not found on this PC.", "error");
      }
    });
  }, [authenticated, showToast]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        const prefs = loadAppPreferences();
        if (!prefs.confirmCloseOptimized || statusRef.current.state !== "connected") {
          return;
        }
        event.preventDefault();
        try {
          const confirmed = await ask(
            "RouteLag is still optimized. Close the app anyway?",
            {
              title: "RouteLag is optimized",
              kind: "warning",
              okLabel: "Close",
              cancelLabel: "Stay",
            },
          );
          if (confirmed) {
            await api.exitApp();
          }
        } catch {
          await api.exitApp();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!authenticated) {
      setHomeStatsLoading(false);
      setHomeReplaysLoading(false);
      return;
    }
    void loadHomeDashboard();
  }, [authenticated, loadHomeDashboard]);

  useEffect(() => {
    if (!authenticated) return;
    void api
      .getTesterProfile()
      .then((profile) =>
        setTesterProfile({
          ...defaultTesterProfile(),
          ...profile,
          fortnite_region: profile.fortnite_region || "Middle East",
        }),
      )
      .catch(() => undefined);
    void api.loadBetaReportSnapshot().then(setBetaReport).catch(() => undefined);
    void routeApi
      .getRoutingNodes(selectedGame)
      .then((nodes) => {
        const mapped = nodes
          .filter((node) => !IS_BETA_DALLAS || node.id === "dallas-beta")
          .map((node) => mapRoutingNodeToRouteOption(node));
        setRoutes(mapped.length ? mergeRouteOptions(mapped) : fallbackRouteOptions);
        setSelectedRoute((current) => {
          const availableRoutes = mapped.filter((route) => route.available !== false);
          if (availableRoutes.some((route) => route.id === current)) return current;
          return availableRoutes[0]?.id ?? mapped[0]?.id ?? current;
        });
      })
      .catch(() => setRoutes(fallbackRouteOptions));
  }, [authenticated, selectedGame]);

  const optimizingNow =
    optimizeState === "preflight" ||
    optimizeState === "creating_server_session" ||
    optimizeState === "writing_profile" ||
    optimizeState === "starting_engine" ||
    optimizeState === "verifying_connection";
  const tunnelConnected = status.state === "connected";
  const hasStoredSession = Boolean(activeRouteSession?.session_id);
  const sessionActive =
    optimizingNow ||
    optimizeState === "optimized" ||
    (tunnelConnected && hasStoredSession && hasConfig);
  const staleTunnelOnly =
    tunnelConnected && !hasStoredSession && !optimizingNow && optimizeState !== "optimized";

  useEffect(() => {
    if (view === "stats" || (view === "routes" && !sessionActive)) void refreshStats();
    if (view === "profile") void refreshSettings();
    if (view === "logs") {
      void api
        .readLogs()
        .then(setLogs)
        .catch((e) => setLogs(`Failed to load logs: ${String(e)}`));
    }
  }, [refreshSettings, refreshStats, sessionActive, view]);

  const finishHomeLoading = useCallback(() => {
    const hideLoader = () => {
      if (homeNavTimerRef.current != null) {
        window.clearTimeout(homeNavTimerRef.current);
        homeNavTimerRef.current = null;
      }
      if (homeNavSwitchRef.current != null) {
        window.clearTimeout(homeNavSwitchRef.current);
        homeNavSwitchRef.current = null;
      }
      if (homeNavFinishRef.current != null) {
        window.clearTimeout(homeNavFinishRef.current);
        homeNavFinishRef.current = null;
      }
      homeNavStartedAtRef.current = null;
      setHomeLoading(false);
    };

    const started = homeNavStartedAtRef.current;
    if (started == null) {
      setHomeLoading(false);
      return;
    }

    const remaining = Math.max(0, MIN_HOME_LOADER_MS - (Date.now() - started));
    if (remaining > 0) {
      homeNavFinishRef.current = window.setTimeout(hideLoader, remaining);
    } else {
      hideLoader();
    }
  }, []);

  const openView = (nextView: MiniView) => {
    setMessage(null);
    if (nextView !== "stats" && nextView !== "routes" && nextView !== "session") {
      setInlineError((error) =>
        error?.title === "Previous optimization did not close cleanly" ? error : null,
      );
    }

    // Force the loader to paint before Home mounts/unhides. Without flushSync,
    // React can batch the loader away and the UI looks frozen.
    if (nextView === "games" && view !== "games") {
      homeNavStartedAtRef.current = Date.now();
      flushSync(() => {
        setHomeLoading(true);
        setHomeMounted(true);
      });

      if (homeNavTimerRef.current != null) {
        window.clearTimeout(homeNavTimerRef.current);
      }
      if (homeNavSwitchRef.current != null) {
        window.clearTimeout(homeNavSwitchRef.current);
      }
      if (homeNavFinishRef.current != null) {
        window.clearTimeout(homeNavFinishRef.current);
      }

      // Safety: never leave the loader up forever.
      homeNavTimerRef.current = window.setTimeout(() => {
        finishHomeLoading();
        homeNavTimerRef.current = null;
      }, 3000);

      // Hide the current page immediately (homeLoading) and give WebView2 time to paint the spinner.
      homeNavSwitchRef.current = window.setTimeout(() => {
        homeNavSwitchRef.current = null;
        window.requestAnimationFrame(() => {
          setView("games");
          window.requestAnimationFrame(() => {
            finishHomeLoading();
          });
        });
      }, HOME_NAV_PAINT_MS);
      return;
    }

    if (nextView !== "games") {
      finishHomeLoading();
    }
    setView(nextView);
  };

  const restartAsAdmin = async () => {
    setAdminLoading(true);
    try {
      await api.restartAsAdmin();
    } catch (e) {
      showToast(String(e), "error");
      setAdminLoading(false);
      setAdminModalOpen(false);
    }
  };

  const setErrorFromUnknown = (error: unknown, title = "RouteLag could not continue") => {
    const nextMessage = friendlyError(error);
    const toastMessage =
      title && title !== nextMessage && !nextMessage.startsWith(title)
        ? `${title}: ${nextMessage}`
        : nextMessage;
    showToast(toastMessage, "error");
    setInlineError({
      title,
      message: nextMessage,
      details: error instanceof Error ? error.stack ?? error.message : String(error),
      canRetry: nextMessage.includes("RouteLag servers are unreachable"),
      canRestore:
        nextMessage.includes("internet") ||
        nextMessage.includes("rollback") ||
        nextMessage.includes("cleanup") ||
        nextMessage.includes("Previous optimization"),
    });
    setMessage(nextMessage);
  };

  const login = async (inviteCode: string) => {
    setBusy("login");
    setLoginAccepted(false);
    setInlineError(null);
    try {
      await routeApi.login(inviteCode);
      void api.logClientEvent(`beta_login_success api_url=${ROUTELAG_API_URL}`).catch(() => undefined);
      console.log("[RouteLag] Authenticated against API", { apiBaseUrl: ROUTELAG_API_URL });
      setLoginAccepted(true);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setAuthenticated(true);
      setView("games");
      showToast("Logged in to RouteLag Beta.", "success");
    } catch (e) {
      setLoginAccepted(false);
      setErrorFromUnknown(e, "Sign in failed");
    } finally {
      setBusy(null);
    }
  };

  const updateShowQuickTools = (enabled: boolean) => {
    setShowQuickTools(enabled);
    window.localStorage.setItem(QUICK_TOOLS_KEY, String(enabled));
  };

  const logout = () => {
    clearRouteAuth();
    setAuthenticated(false);
    setLoginAccepted(false);
    setBusy(null);
    setInlineError(null);
    setMessage(null);
    setView("games");
    showToast("Logged out of RouteLag Beta.", "info");
  };

  const startAutoRoute = async () => {
    setAutoRouteState("probing");
    setInlineError(null);
    try {
      if (IS_BETA_DALLAS) {
        setSelectedRoute("dallas-beta");
        setAutoRouteState("done");
        showToast("Dallas Beta selected for this build.", "success");
        return;
      }

      const locationLabel =
        formatProfileLocation(testerProfile) || (await detectPublicIpLocation()) || "";
      const region = resolveAutoRouteRegion(locationLabel);
      const result = await runAutoRouteFlow(selectedGame, region);
      setAutoRouteState("ranking");
      const recommended = result.testResult.recommendedRoute;
      const routeIds = routes.map((route) => route.id);
      const startableRouteIds = routes
        .filter((route) => route.available !== false)
        .map((route) => route.id);

      if (
        recommended?.candidate.type === "single" &&
        recommended.candidate.serverId &&
        startableRouteIds.includes(recommended.candidate.serverId)
      ) {
        setSelectedRoute(recommended.candidate.serverId);
      } else {
        const bestSingle = result.testResult.rankedRoutes.find(
          (route) =>
            route.candidate.type === "single" &&
            route.candidate.serverId &&
            startableRouteIds.includes(route.candidate.serverId),
        );
        if (bestSingle?.candidate.serverId) {
          setSelectedRoute(bestSingle.candidate.serverId);
        } else {
          setSelectedRoute(recommendRouteId(locationLabel, routeIds, null, startableRouteIds));
        }
      }
      setAutoRouteState("done");
      showToast("Auto Route found a recommended server.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const locationLabel =
        formatProfileLocation(testerProfile) || (await detectPublicIpLocation().catch(() => null)) || "";
      const fallbackId = recommendRouteId(
        locationLabel,
        routes.map((route) => route.id),
        null,
        routes.filter((route) => route.available !== false).map((route) => route.id),
      );
      if (fallbackId) {
        setSelectedRoute(fallbackId);
        setAutoRouteState("done");
        showToast(
          `Selected ${fallbackId === "dallas-beta" ? "Dallas Beta" : "Johannesburg Beta"} based on your location.`,
          "info",
        );
        return;
      }
      setAutoRouteState("error");
      showToast(`Auto Route failed: ${msg}`, "error");
    }
  };

  const startOptimization = async () => {
    await startOptimizationForServer(selectedRoute);
  };

  const testSelectedServer = async () => {
    setServerProbeBusy(true);
    setServerProbeSteps(null);
    setMessage(null);
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setErrorFromUnknown(
          "Administrator permission is required to test the WireGuard server.",
          "Administrator permission required",
        );
        setAdminModalOpen(true);
        return;
      }
      if (!meta.wg) {
        setErrorFromUnknown(
          "RouteLag Engine is missing or damaged. Reinstall RouteLag.",
          "RouteLag Engine missing",
        );
        return;
      }
      const result = await testWireGuardServer(selectedGame, selectedRoute, {
        onStep: setServerProbeSteps,
        cleanup: true,
      });
      if (result.ok) {
        showToast("WireGuard server test passed.", "success");
        setMessage("WireGuard server test passed. Safe to start optimization.");
      } else {
        const failed = result.steps.find((step) => step.status === "fail");
        setErrorFromUnknown(
          failed?.detail ?? "WireGuard server test failed.",
          "Server test failed",
        );
        showToast("WireGuard server test failed. See step details.", "error");
      }
    } catch (e) {
      setErrorFromUnknown(e, "Server test failed");
      showToast(friendlyError(e), "error");
    } finally {
      setServerProbeBusy(false);
      await refreshMeta();
    }
  };

  const startOptimizationForServer = async (serverId: string) => {
    setBusy("connect");
    setMessage(null);
    setInlineError(null);
    setOptimizeState("preflight");
    try {
      const meta = await refreshMeta();
      const route = resolveRouteOption(serverId, routes);
      if (!route) {
        setErrorFromUnknown("No routing node selected.", "Optimization blocked");
        return;
      }
      if (route.available === false) {
        setErrorFromUnknown("Server not available yet.", "Optimization blocked");
        return;
      }
      if (!route.id || route.id !== serverId) {
        setErrorFromUnknown("No routing node selected.", "Optimization blocked");
        return;
      }
      if (!authenticated) {
        setErrorFromUnknown("Log in with your beta invite code first.", "Optimization blocked");
        setAuthenticated(false);
        setView("routes");
        return;
      }
      if (!meta.wg) {
        setErrorFromUnknown(
          "RouteLag Engine is missing or damaged. Reinstall RouteLag.",
          "RouteLag Engine missing",
        );
        setView("routes");
        return;
      }
      if (!meta.elev) {
        setErrorFromUnknown(
          "Administrator permission is required to start an Optimization session.",
          "Administrator permission required",
        );
        setAdminModalOpen(true);
        return;
      }
      setView("session");
      setStatus({ state: "connecting", message: null });
      const routeSession = await startRouteOptimization(selectedGame, serverId, {
        onState: setOptimizeState,
      });
      setRouteMode(routeSession.routeMode);
      setActiveAllowedIps(routeSession.allowedIps);
      setBetaReport(await api.loadBetaReportSnapshot().catch(() => null));
      updateLifecycleStress((current) => ({
        ...current,
        start_stop_cycles: current.start_stop_cycles + 1,
        last_start_time: new Date().toLocaleString(),
        cleanup_result: "Session active",
        service_leftover_status: "Not checked",
        api_cleanup_result: "Session active",
        route_mode: routeSession.routeMode,
      }));
      await refreshStats();
      setMessage(routeSession.routeMode === "split_route" ? "Optimization active." : null);
      showToast(
        routeSession.routeMode === "split_route"
          ? "Optimization active."
          : "RouteLag optimization started.",
        "success",
      );
    } catch (e) {
      const nextMessage = friendlyError(e);
      setStatus({ state: "error", message: nextMessage });
      setErrorFromUnknown(e, "Optimization did not start safely");
      setView("session");
    } finally {
      setBusy(null);
      setOptimizeState((state) => {
        if (state === "optimized" || state === "idle") return state;
        if (state === "preflight") return "idle";
        return "error";
      });
    }
  };

  const endOptimization = async () => {
    setBusy("disconnect");
    setMessage(null);
    setInlineError(null);
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setErrorFromUnknown(
          "Administrator permission is required to end an Optimization session.",
          "Administrator permission required",
        );
        setAdminModalOpen(true);
        return;
      }
      const result = await stopOptimization({ onState: setOptimizeState });
      const recovery = await api.getRecoveryStatus();
      updateLifecycleStress((current) => ({
        ...current,
        last_stop_time: new Date().toLocaleString(),
        cleanup_result: result.status,
        service_leftover_status: serviceLeftoverSummary(recovery),
        api_cleanup_result: apiCleanupSummary(result.warnings),
        route_mode: routeMode ?? current.route_mode,
      }));
      setRouteMode(null);
      setActiveAllowedIps(null);
      setBetaReport(await api.loadBetaReportSnapshot().catch(() => null));
      await refreshStats();
      if (result.status === "ended") {
        setMessage("Optimization ended cleanly.");
        showToast("Optimization ended cleanly.", "success");
      } else {
        setInlineError({
          title:
            result.status === "ended_with_warning"
              ? "Optimization ended with warnings"
              : "Cleanup needs attention",
          message:
            result.status === "ended_with_warning"
              ? "RouteLag restored the local connection, but one cleanup step reported a warning."
              : "RouteLag tried to end optimization, but cleanup could not fully complete.",
          details: result.warnings.join("\n"),
          canRestore: true,
        });
      }
    } catch (e) {
      setErrorFromUnknown(e, "End Optimization failed");
    } finally {
      setBusy(null);
      setOptimizeState("idle");
      setView("routes");
    }
  };

  const reconnect = async () => {
    setBusy("reconnect");
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setMessage("Administrator permission is required to reconnect RouteLag Engine.");
        setAdminModalOpen(true);
        return;
      }
      await api.reconnectTunnel();
      await refreshStats();
      showToast("RouteLag Engine reconnected.", "success");
    } catch (e) {
      const nextMessage = friendlyError(e);
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const runDiagnostics = async (includeTraceroute = false) => {
    const runId = diagnosticsRunId.current + 1;
    diagnosticsRunId.current = runId;
    setBusy("diagnostics");
    setInlineError(null);
    try {
      await runRouteDiagnostics({ includeTraceroute });
      setBetaReport(await api.loadBetaReportSnapshot().catch(() => null));
      if (diagnosticsRunId.current === runId) {
        showToast("Diagnostics completed.", "success");
      }
    } catch (e) {
      if (diagnosticsRunId.current === runId) {
        setErrorFromUnknown(e, "Diagnostics did not complete");
      }
    } finally {
      if (diagnosticsRunId.current === runId) {
        setBusy(null);
      }
    }
  };

  const cancelDiagnostics = () => {
    diagnosticsRunId.current += 1;
    setBusy(null);
    showToast("Diagnostics cancelled.", "info");
  };

  const exportReport = async () => {
    setBusy("export");
    try {
      await api.saveTesterProfile(testerProfile);
      const diagnostics = await api.loadDiagnostics().catch(() => null);
      if (!diagnostics) {
        await runRouteDiagnostics({ includeTraceroute: false });
      }
      setBetaReport(await api.loadBetaReportSnapshot().catch(() => null));
      const path = await exportRouteReport();
      showToast(`Report saved to ${path}`, "success");
    } catch (e) {
      const nextMessage = friendlyError(e);
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const importConfig = async () => {
    setBusy("import");
    try {
      await api.importConfig();
      await refreshSettings();
      showToast("Config imported.", "success");
    } catch (e) {
      const nextMessage = friendlyError(e);
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const removeConfig = async () => {
    if (!confirm("Clear the saved RouteLag route profile?")) return;
    setBusy("remove");
    try {
      await api.removeConfig();
      await refreshSettings();
      showToast("Config removed.", "success");
    } catch (e) {
      const nextMessage = friendlyError(e);
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const restoreInternet = async () => {
    setBusy("cleanup");
    setMessage(null);
    setInlineError(null);
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setErrorFromUnknown(
          "Administrator permission is required for Restore Internet.",
          "Administrator permission required",
        );
        setAdminModalOpen(true);
        return;
      }
      const result = await restoreRouteInternet(meta.active?.session_id);
      await api.forceClearLocalRouteState().catch(() => undefined);
      const recovery = await api.getRecoveryStatus();
      updateLifecycleStress((current) => ({
        ...current,
        cleanup_result: result.ok ? "restore_ok" : "restore_warning",
        service_leftover_status: serviceLeftoverSummary(recovery),
        api_cleanup_result: meta.active?.session_id ? "Best effort" : current.api_cleanup_result,
      }));
      setRouteMode(null);
      setActiveAllowedIps(null);
      setBetaReport(await api.loadBetaReportSnapshot().catch(() => null));
      await refreshStats();
      resetRouteRuntimeUi(recovery);
      if (!result.ok || !recoveryIsClean(recovery)) {
        setInlineError({
          title: result.ok
            ? "Restore Internet needs attention"
            : "Restore Internet completed with warnings",
          message:
            result.ok
              ? "RouteLag still sees local recovery state after cleanup."
              : "A RouteLag cleanup step reported a failure that could still affect RouteLag networking.",
          details: restoreWarningDetails(result, recovery),
          canRestore: true,
        });
      } else {
        const success =
          "Restore Internet completed. No active RouteLag engine was found, and local route state was cleared.";
        setMessage(success);
        if (recoveryIsClean(recovery)) setInlineError(null);
        showToast(success, "success");
      }
    } catch (e) {
      setErrorFromUnknown(e, "Restore Internet failed");
    } finally {
      setBusy(null);
    }
  };

  const repairWindowsNetwork = async () => {
    setBusy("repair");
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setErrorFromUnknown(
          "Administrator permission is required for Windows network repair.",
          "Administrator permission required",
        );
        setAdminModalOpen(true);
        return;
      }
      const result = await api.repairWindowsNetwork();
      setInlineError({
        title: result.ok ? "Windows network repair applied" : "Windows repair had warnings",
        message:
          "Restart your PC to finish applying the Windows network repair commands.",
        details: result.steps
          .map((step) => `${step.ok ? "OK" : "WARN"} ${step.step}: ${step.message}`)
          .join("\n"),
        canRestore: true,
      });
    } catch (e) {
      setErrorFromUnknown(e, "Windows network repair failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {homeLoading &&
        createPortal(
          <div
            className="home-page-loader"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading home"
          >
            <div className="home-page-loader-ring" />
          </div>,
          document.body,
        )}
      <MiniAppShell
        onSettings={authenticated ? () => openView("settings") : undefined}
        footer={
          authenticated && showQuickTools && view !== "games" && !homeLoading && (
            <MiniFooterNav
              cleanupBusy={busy === "cleanup"}
              onDiagnostics={() => openView("diagnostics")}
              onRestoreInternet={() => void restoreInternet()}
              onExport={() => void exportReport()}
              onLogs={() => openView("logs")}
            />
          )
        }
      >
      {!authenticated && (
        <LoginPage
          accepted={loginAccepted}
          busy={busy === "login"}
          error={inlineError}
          onLogin={(code) => login(code)}
        />
      )}
      {authenticated && homeMounted && (
        <div
          className="home-dashboard"
          hidden={view !== "games"}
          aria-hidden={view !== "games"}
        >
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <HomePage
          busy={busy}
          optimizeState={optimizeState}
          ping={ping}
          pingLoading={homeStatsLoading}
          replays={homeReplays}
          replaysLoading={homeReplaysLoading}
          routes={routes}
          selectedRoute={selectedRoute}
          status={status}
          statusLabel={statusView.label}
          testerName={testerProfile.tester_name}
          onAutoRoute={() => void startAutoRoute()}
          onDiagnostics={() => openView("diagnostics")}
          onLogs={() => openView("logs")}
          onNavigate={openView}
          onOptimize={(routeId) => {
            setSelectedGame("fortnite");
            setSelectedRoute(routeId);
            setView("session");
            void startOptimizationForServer(routeId);
          }}
          onRestoreInternet={() => void restoreInternet()}
          onReady={finishHomeLoading}
        />
          </div>
        </div>
      )}
      {authenticated && view === "routes" && !homeLoading && (
        <div className={`home-dashboard ${view === "routes" ? "routing-dashboard" : ""}`}>
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <RouteSelectPage
          autoRouteBusy={autoRouteState === "probing" || autoRouteState === "ranking"}
          autoRouteState={autoRouteState}
          busy={busy === "connect"}
          cleanupBusy={busy === "cleanup"}
          onAutoRoute={() => void startAutoRoute()}
          onOptimize={() => {
            setView("session");
            void startOptimization();
          }}
          onOpenSession={() => setView("session")}
          onRestoreInternet={() => void restoreInternet()}
          onSelectRoute={setSelectedRoute}
          onTestServer={() => void testSelectedServer()}
          routes={routes}
          selectedRoute={selectedRoute}
          serverProbeBusy={serverProbeBusy}
          serverProbeSteps={serverProbeSteps}
          sessionActive={sessionActive}
          staleTunnelOnly={staleTunnelOnly}
          testerProfile={testerProfile}
        />
          </div>
        </div>
      )}
      {authenticated && view === "session" && !homeLoading && (
        <div className="home-dashboard routing-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <LiveSessionPage
          activeAllowedIps={activeAllowedIps}
          busy={busy === "connect"}
          cleanupBusy={busy === "cleanup" || busy === "disconnect"}
          connected={sessionActive && !optimizingNow}
          inlineError={inlineError}
          optimizeState={optimizeState}
          selectedCity={
            resolveRouteOption(selectedRoute, routes)?.city ??
            resolveRouteOption(selectedRoute, routes)?.label ??
            "RouteLag"
          }
          selectedCountry={
            resolveRouteOption(selectedRoute, routes)?.country ??
            resolveRouteOption(selectedRoute, routes)?.region ??
            ""
          }
          selectedRouteId={selectedRoute}
          statusLabel={statusView.label}
          userLocation={formatProfileLocation(testerProfile) || "Your location"}
          onBack={() => setView("routes")}
          onEnd={() => void endOptimization()}
          onRestoreInternet={() => void restoreInternet()}
          onRetry={() => {
            setView("session");
            void startOptimization();
          }}
        />
          </div>
        </div>
      )}
      {authenticated && view === "stats" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <StatsPage
          busy={busy}
          hasConfig={hasConfig}
          inlineError={inlineError}
          message={message}
          optimizeState={optimizeState}
          ping={ping}
          publicIp={publicIp}
          routeMode={routeMode}
          betaReport={betaReport}
          status={status}
          statusLabel={statusView.label}
          statusTone={statusView.tone}
          onBack={() => openView("games")}
          onEnd={() => void endOptimization()}
          onExport={() => void exportReport()}
          onRepairWindowsNetwork={() => void repairWindowsNetwork()}
          onRestoreInternet={() => void restoreInternet()}
          onStart={() => void startOptimization()}
          onSettings={() => openView("settings")}
        />
          </div>
        </div>
      )}
      {authenticated && view === "diagnostics" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <DiagnosticsPage
          busy={busy}
          lifecycleStress={lifecycleStress}
          testerProfile={testerProfile}
          onBack={() => openView("stats")}
          onExport={() => void exportReport()}
          onCancel={() => cancelDiagnostics()}
          onReconnect={() => void reconnect()}
          onRun={() => void runDiagnostics(false)}
          onRunAdvanced={() => void runDiagnostics(true)}
          onTesterProfileChange={updateTesterProfile}
        />
          </div>
        </div>
      )}
      {authenticated && view === "profile" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <ProfilePage
          busy={busy}
          elevated={elevated}
          hasConfig={hasConfig}
          engineInstalled={engineInstalled}
          testerProfile={testerProfile}
          profileImageUrl={profileImageUrl}
          showQuickTools={showQuickTools}
          onBack={() => openView("games")}
          onImport={() => void importConfig()}
          onLogout={logout}
          onRemove={() => void removeConfig()}
          onProfileImageChange={updateProfileImage}
          onTesterProfileChange={updateTesterProfile}
          onShowQuickToolsChange={updateShowQuickTools}
        />
          </div>
        </div>
      )}
      {authenticated && view === "replays" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
            <ReplayEnginePage />
          </div>
        </div>
      )}
      {authenticated && view === "hud" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
            <HudOverlayPage />
          </div>
        </div>
      )}
      {authenticated && view === "settings" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
            <SettingsPage />
          </div>
        </div>
      )}
      {authenticated && view === "billing" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
            <AccountPage />
          </div>
        </div>
      )}
      {authenticated && view === "help" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <HelpCenterPage
          busy={busy}
          engineInstalled={engineInstalled}
          onAdvancedRepair={() => void repairWindowsNetwork()}
          onCheckEngine={checkRouteLagEngine}
          onExportReport={() => void exportReport()}
          onOpenLogs={() => openView("logs")}
          onRestoreInternet={() => void restoreInternet()}
        />
          </div>
        </div>
      )}
      {authenticated && view === "logs" && !homeLoading && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
          />
          <div className="app-page-slot">
        <LogsPage logs={logs} onBack={() => openView("stats")} />
          </div>
        </div>
      )}
      </MiniAppShell>
      <AdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onRestartAsAdmin={() => void restartAsAdmin()}
        loading={adminLoading}
      />
    </>
  );
}

function activeNavItem(view: MiniView): AppNavItem {
  switch (view) {
    case "routes":
    case "session":
    case "autoRoute":
      return "routing";
    case "hud":
      return "hud";
    case "profile":
    case "billing":
      return "profile";
    case "settings":
      return "settings";
    case "help":
      return "help";
    case "replays":
      return "replays";
    default:
      return "dashboard";
  }
}

async function checkRouteLagEngine() {
  return api.isRouteLagEngineAvailable();
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("administrator permission")) {
    return "Administrator permission is required for this RouteLag Optimization action. Restart as Administrator and try again.";
  }
  if (
    message.includes("WireGuard for Windows") ||
    message.includes("WireGuard is not installed") ||
    message.includes("missing or damaged") ||
    message.includes("RouteLag Engine tooling is not installed")
  ) {
    return "RouteLag Engine is missing or damaged. Reinstall RouteLag.";
  }
  return message;
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
