import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAuth, useUser } from "@clerk/react";

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
import { BetaConsentGate } from "./components/BetaConsentGate";
import { AccountPage } from "./pages/AccountPage";
import { MiniAppShell } from "./components/MiniAppShell";
import { MiniFooterNav } from "./components/MiniFooterNav";
import { StartupSplash } from "./components/StartupSplash";
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
import { clearRouteAuth, ensurePathGenSession, getRouteToken, routeApi, ROUTELAG_API_URL } from "./lib/api";
import { IS_BETA_DALLAS } from "./lib/betaMode";
import {
  pullAndApplyCloudPreferences,
  pullCloudUserState,
  pushCloudProfile,
} from "./lib/cloudUserSync";
import { HUD_ENABLED, REPLAY_ENABLED } from "./lib/featureFlags";
import {
  attachClerkUserIdToLegalConsent,
  hasAcceptedCurrentLegal,
} from "./lib/legalConsent";
import { pushNotification } from "./lib/notifications";
import { useEntitlements } from "./lib/billing";
import { UpgradeGate } from "./components/UpgradeGate";
import {
  fallbackRouteOptions,
  mapRoutingNodeToRouteOption,
  mergeRouteOptions,
  resolveRouteOption,
} from "./lib/routeCatalog";
import {
  exportReport as exportRouteReport,
  restoreInternet as restoreRouteInternet,
  resumeRouteHeartbeat,
  runDiagnostics as runRouteDiagnostics,
  startOptimization as startRouteOptimization,
  stopOptimization,
  stopRouteHeartbeat,
  pickLivePingHost,
  type ActiveRouteSession,
} from "./lib/routeEngine";
import { runAutoRoute as runAutoRouteFlow } from "./lib/autoRoute";
import {
  detectPublicIpLocation,
  formatProfileLocation,
  fortniteRegionLabel,
  recommendRouteId,
  resolveAutoRouteRegion,
} from "./lib/userLocation";
import type { AutoRouteState } from "./types";
import type {
  BetaReportSnapshot,
  FortniteReplay,
  HomeReplayCard,
  InlineError,
  LifecycleStressStatus,
  OptimizeState,
  PingResult,
  RecoveryStatus,
  RestoreInternetResult,
  RouteMode,
  TesterProfile,
  TunnelStatus,
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
    if (saved === "hud" && !HUD_ENABLED) return "games";
    if (saved === "replays" && !REPLAY_ENABLED) return "games";
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
  const summary = result.summary?.trim();
  const failed = result.steps
    .filter((step) => !step.ok)
    .map((step) => `${step.step}: ${step.message}`)
    .join("\n");
  const notRestored = (result.not_restored ?? []).join("\n");
  return [summary, failed || notRestored, recoveryDetails(recovery)]
    .filter(Boolean)
    .join("\n\n");
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
  if (recovery.route_service_running) return "Zer0 service still running";
  return "Zer0 service installed but stopped";
}

function apiCleanupSummary(warnings: string[]) {
  const apiWarning = warnings.find((warning) =>
    warning.includes("API route session cleanup failed"),
  );
  return apiWarning ? `Warning: ${apiWarning}` : "Ended";
}

function AppContent() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const pathGenSessionOptions = {
    clerkUserId: user?.id,
    clerkEmail:
      user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress,
    getClerkToken: () => getToken(),
  };
  const [showSplash, setShowSplash] = useState(true);
  const dismissSplash = useCallback(() => setShowSplash(false), []);
  const { showToast } = useToast();
  const entitlements = useEntitlements();
  const [legalAccepted, setLegalAccepted] = useState(() => hasAcceptedCurrentLegal());
  const [consentAppVersion, setConsentAppVersion] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(() => Boolean(getRouteToken()));
  const [showQuickTools, setShowQuickTools] = useState(
    () => window.localStorage.getItem(QUICK_TOOLS_KEY) === "true",
  );
  const [view, setView] = useState<MiniView>(loadInitialView);
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
  const [homeReplays, setHomeReplays] = useState<HomeReplayCard[]>([]);
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
  const knownReplayPathsRef = useRef<Set<string> | null>(null);
  const lossAlertAtRef = useRef(0);
  const heartbeatSafeDisconnectRef = useRef(false);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

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

  const handleHeartbeatPermanentFailure = useCallback(
    (reason: string, detail: string) => {
      if (heartbeatSafeDisconnectRef.current) return;
      heartbeatSafeDisconnectRef.current = true;
      setInlineError({
        title: "Route session ended by server",
        message:
          reason === "user_blocked"
            ? "This account can no longer route. Zer0 is restoring your network."
            : reason === "entitlement_expired" || reason === "auth_expired"
              ? "Routing authorization expired. Zer0 is restoring your network."
              : "The server route session is no longer valid. Zer0 is restoring your network.",
        details: detail,
        canRestore: true,
      });
      void (async () => {
        try {
          await stopOptimization({ onState: setOptimizeState });
          setRouteMode(null);
          setActiveAllowedIps(null);
          await refreshMeta();
          showToast("Route ended safely after server rejection.", "info");
        } catch {
          try {
            await restoreRouteInternet();
          } catch {
            // Local restore best-effort.
          }
        } finally {
          heartbeatSafeDisconnectRef.current = false;
          setOptimizeState("idle");
        }
      })();
    },
    [refreshMeta, showToast],
  );

  const routeLifecycleOptions = useCallback(
    () => ({
      onState: setOptimizeState,
      getClerkToken: () => getTokenRef.current(),
      onHeartbeatPermanentFailure: handleHeartbeatPermanentFailure,
    }),
    [handleHeartbeatPermanentFailure],
  );

  const refreshStats = useCallback(async () => {
    await refreshMeta();
    try {
      setPublicIp(await api.getPublicIp());
    } catch {
      setPublicIp("Unavailable");
    }
    try {
      const nextPing = await api.pingHost();
      setPing(nextPing);
      if (
        nextPing.packet_loss_pct != null &&
        nextPing.packet_loss_pct > 2 &&
        Date.now() - lossAlertAtRef.current > 10 * 60_000
      ) {
        lossAlertAtRef.current = Date.now();
        pushNotification({
          kind: "routing",
          title: "Packet loss detected",
          body: `${Math.round(nextPing.packet_loss_pct)}% loss on the current path. Consider switching routes.`,
          href: "routes",
        });
      }
    } catch {
      setPing(null);
    }
  }, [refreshMeta]);

  const loadHomeDashboard = useCallback(async () => {
    setHomeStatsLoading(true);
    setHomeReplaysLoading(REPLAY_ENABLED);

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

    const replaysTask = REPLAY_ENABLED
      ? (async () => {
          try {
            const local = await api.listFortniteReplays().catch(() => [] as FortniteReplay[]);
            const known = knownReplayPathsRef.current;
            if (known) {
              const fresh = local.filter((replay) => !known.has(replay.path));
              if (fresh.length) {
                pushNotification({
                  id: `replay-local-${fresh[0].path}`,
                  kind: "replay",
                  title: "New replay detected",
                  body: "Open PathGen to upload and analyze your latest match.",
                  href: "replays",
                });
              }
            }
            knownReplayPathsRef.current = new Set(local.map((replay) => replay.path));

            let cards: HomeReplayCard[] = local.slice(0, 3).map((replay) => ({
              id: replay.path,
              name: replay.name,
              path: replay.path,
              modified_at: replay.modified_at,
              parsed: false,
            }));

            const sessionReady = await ensurePathGenSession(pathGenSessionOptions);
            if (sessionReady) {
              const parsed = await routeApi.getParsedReplays().catch(() => []);
              if (parsed.length > 0) {
                const byName = new Map(
                  parsed.map((replay) => [replay.fileName.toLowerCase(), replay]),
                );
                // Prefer PathGen summaries (real Place / Kills / Damage).
                cards = parsed
                  .slice()
                  .sort((a, b) => {
                    const aTime = Date.parse(String(a.startedAt ?? a.parsedAt ?? a.createdAt)) || 0;
                    const bTime = Date.parse(String(b.startedAt ?? b.parsedAt ?? b.createdAt)) || 0;
                    return bTime - aTime;
                  })
                  .slice(0, 3)
                  .map((replay) => ({
                    id: replay.id,
                    name: replay.fileName,
                    modified_at: String(replay.startedAt ?? replay.parsedAt ?? replay.createdAt),
                    placement: replay.placement,
                    eliminations: replay.eliminations,
                    damageDealt: replay.damageDealt,
                    parsed: true,
                  }));

                // Enrich local-only rows when PathGen has fewer than 3.
                if (cards.length < 3) {
                  for (const localReplay of local) {
                    if (cards.length >= 3) break;
                    const match = byName.get(localReplay.name.toLowerCase());
                    if (match && cards.some((card) => card.id === match.id)) continue;
                    if (match) {
                      cards.push({
                        id: match.id,
                        name: match.fileName,
                        path: localReplay.path,
                        modified_at: localReplay.modified_at,
                        placement: match.placement,
                        eliminations: match.eliminations,
                        damageDealt: match.damageDealt,
                        parsed: true,
                      });
                    } else if (!cards.some((card) => card.path === localReplay.path)) {
                      cards.push({
                        id: localReplay.path,
                        name: localReplay.name,
                        path: localReplay.path,
                        modified_at: localReplay.modified_at,
                        parsed: false,
                      });
                    }
                  }
                }
              }
            }

            setHomeReplays(cards.slice(0, 3));
          } catch {
            setHomeReplays([]);
          } finally {
            setHomeReplaysLoading(false);
          }
        })()
      : Promise.resolve().then(() => {
          setHomeReplays([]);
          setHomeReplaysLoading(false);
        });

    await Promise.all([statsTask, replaysTask]);
  }, [pathGenSessionOptions.clerkUserId, pathGenSessionOptions.clerkEmail]);

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
        void pushCloudProfile(next).catch(() => undefined);
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
        if (recovery.stale_state_detected && !recovery.active_route_session) {
          setInlineError({
            title: "Previous optimization did not close cleanly",
            message:
              "Zer0 found leftover tunnel state from an earlier run. Click Restore Internet before starting a new optimization.",
            details: recoveryDetails(recovery),
            canRestore: true,
          });
        }
      })
      .catch(() => undefined);
  }, [refreshMeta]);

  useEffect(() => {
    if (!authenticated) return;
    const prefs = loadAppPreferences();
    if (!prefs.checkEngineOnLaunch) return;
    void api.isRouteLagEngineAvailable().then((ok) => {
      if (!ok) {
        showToast("Zer0 Engine was not found on this PC.", "error");
        pushNotification({
          id: "engine-missing",
          kind: "update",
          title: "Engine missing",
          body: "Zer0 Engine was not found on this PC. Reinstall to restore routing.",
          href: "settings",
        });
      }
    });
  }, [authenticated, showToast]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let closing = false;
    try {
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          if (closing) return;
          event.preventDefault();

          const connected =
            statusRef.current.state === "connected" ||
            statusRef.current.state === "connecting";
          const prefs = loadAppPreferences();

          if (connected && prefs.confirmCloseOptimized) {
            try {
              const confirmed = await ask(
                "Zer0 is still optimized. End routing and close the app?",
                {
                  title: "Zer0 is optimized",
                  kind: "warning",
                  okLabel: "End and Close",
                  cancelLabel: "Stay",
                },
              );
              if (!confirmed) {
                return;
              }
            } catch {
              // If the dialog fails, still attempt safe cleanup before exit.
            }
          }

          closing = true;
          try {
            if (connected || optimizeState !== "idle") {
              stopRouteHeartbeat("app_exit");
              await stopOptimization({ onState: setOptimizeState });
            } else {
              stopRouteHeartbeat("app_exit");
            }
          } catch {
            stopRouteHeartbeat("app_exit");
            try {
              await restoreRouteInternet();
            } catch {
              // Rust exit_app still runs local safe_shutdown_routing.
            }
          }

          try {
            await api.exitApp();
          } catch {
            closing = false;
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => undefined);
    } catch {
      // Browser previews do not expose the Tauri window bridge.
    }
    return () => {
      unlisten?.();
    };
  }, [optimizeState]);

  useEffect(() => {
    if (!authenticated) {
      setHomeStatsLoading(false);
      setHomeReplaysLoading(false);
      return;
    }
    void loadHomeDashboard();
  }, [authenticated, loadHomeDashboard]);

  useEffect(() => {
    void api
      .getAppVersion()
      .then(setConsentAppVersion)
      .catch(() => setConsentAppVersion(null));
  }, []);

  useEffect(() => {
    if (!legalAccepted || !user?.id) return;
    attachClerkUserIdToLegalConsent(user.id);
  }, [legalAccepted, user?.id]);

  useEffect(() => {
    if (!authenticated) return;
    void (async () => {
      try {
        await ensurePathGenSession(pathGenSessionOptions);
        const local = await api.getTesterProfile().catch(() => defaultTesterProfile());
        const { profile } = await pullCloudUserState({
          ...defaultTesterProfile(),
          ...local,
          fortnite_region: local.fortnite_region || "Middle East",
        });
        setTesterProfile(profile);
        // Keep local disk copy aligned with cloud when cloud had newer fields.
        void api.saveTesterProfile(profile).catch(() => undefined);
        void pullAndApplyCloudPreferences().catch(() => undefined);
      } catch {
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
      }
    })();
    void api.loadBetaReportSnapshot().then(setBetaReport).catch(() => undefined);
    void routeApi
      .getRoutingNodes(selectedGame)
      .then((nodes) => {
        const mapped = nodes
          .filter(
            (node) =>
              !IS_BETA_DALLAS ||
              node.id === "dallas-beta" ||
              node.id === "ashburn-beta" ||
              node.id === "virginia-beta",
          )
          .map((node) => mapRoutingNodeToRouteOption(node));
        setRoutes(mapped.length ? mergeRouteOptions(mapped) : fallbackRouteOptions);
        setSelectedRoute((current) => {
          const availableRoutes = mapped.filter((route) => route.available !== false);
          if (availableRoutes.some((route) => route.id === current)) return current;
          return availableRoutes[0]?.id ?? mapped[0]?.id ?? current;
        });
      })
      .catch(() => setRoutes(fallbackRouteOptions));
  }, [authenticated, selectedGame, pathGenSessionOptions.clerkUserId, pathGenSessionOptions.clerkEmail]);

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
    optimizeState === "degraded" ||
    (tunnelConnected && hasStoredSession && hasConfig);
  const staleTunnelOnly =
    tunnelConnected && !hasStoredSession && !optimizingNow && optimizeState !== "optimized" && optimizeState !== "degraded";

  useEffect(() => {
    if (view !== "session" && view !== "routes" && busy !== "connect") {
      return;
    }
    const interval = window.setInterval(() => {
      void api.tunnelStatus().then(setStatus).catch(() => undefined);
      if (view === "session" && sessionActive) {
        void api
          .pingHost(pickLivePingHost(activeAllowedIps))
          .then(setPing)
          .catch(() => setPing(null));
      }
    }, 6000);
    return () => window.clearInterval(interval);
  }, [activeAllowedIps, busy, sessionActive, view]);

  useEffect(() => {
    if (view === "profile") void refreshSettings();
    if (view === "logs") {
      void api
        .readLogs()
        .then(setLogs)
        .catch((e) => setLogs(`Failed to load logs: ${String(e)}`));
    }
  }, [refreshSettings, view]);

  const openView = useCallback((nextView: MiniView) => {
    if (nextView === "hud" && !HUD_ENABLED) {
      showToast("HUD is coming soon.", "info");
      return;
    }
    if (nextView === "replays" && !REPLAY_ENABLED) {
      showToast("Replay Engine is coming soon.", "info");
      return;
    }

    setMessage(null);
    if (nextView !== "stats" && nextView !== "routes" && nextView !== "session") {
      setInlineError((error) =>
        error?.title === "Previous optimization did not close cleanly" ? error : null,
      );
    }

    setView(nextView);
  }, [showToast]);

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

  const setErrorFromUnknown = (error: unknown, title = "Zer0 could not continue") => {
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
      canRetry: nextMessage.includes("Zer0 servers are unreachable"),
      canRestore:
        nextMessage.includes("internet") ||
        nextMessage.includes("rollback") ||
        nextMessage.includes("cleanup") ||
        nextMessage.includes("Previous optimization"),
    });
    setMessage(nextMessage);
  };

  /** Admin elevation failures: toast first; click opens restart modal. No page switch. */
  const notifyAdminRequired = (message: string) => {
    showToast(message, "error", {
      onClick: () => setAdminModalOpen(true),
    });
  };

  const login = async (inviteCode: string) => {
    setBusy("login");
    setLoginAccepted(false);
    setInlineError(null);
    try {
      await routeApi.login(inviteCode);
      void api.logClientEvent(`beta_login_success api_url=${ROUTELAG_API_URL}`).catch(() => undefined);
      console.log("[Zer0] Authenticated against API", { apiBaseUrl: ROUTELAG_API_URL });
      setLoginAccepted(true);
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setAuthenticated(true);
      setView("games");
      showToast("Logged in to Zer0.", "success");
    } catch (e) {
      setLoginAccepted(false);
      const nextMessage = friendlyError(e);
      showToast(`Sign in failed: ${nextMessage}`, "error");
      setMessage(nextMessage);
    } finally {
      setBusy(null);
    }
  };

  const updateShowQuickTools = (enabled: boolean) => {
    setShowQuickTools(enabled);
    window.localStorage.setItem(QUICK_TOOLS_KEY, String(enabled));
  };

  const logout = () => {
    stopRouteHeartbeat("logout");
    const connected =
      statusRef.current.state === "connected" ||
      statusRef.current.state === "connecting";
    if (connected || optimizeState === "optimized" || optimizeState === "degraded") {
      void stopOptimization({ onState: setOptimizeState }).catch(() => {
        void restoreRouteInternet().catch(() => undefined);
      });
    }
    clearRouteAuth();
    setAuthenticated(false);
    setLoginAccepted(false);
    setBusy(null);
    setInlineError(null);
    setMessage(null);
    setView("games");
    showToast("Logged out of Zer0.", "info");
  };

  useEffect(() => {
    const onLogout = () => {
      stopRouteHeartbeat("logout");
      clearRouteAuth();
      setAuthenticated(false);
      setLoginAccepted(false);
      setBusy(null);
      setInlineError(null);
      setMessage(null);
      setView("games");
    };
    window.addEventListener("routelag:logout", onLogout);
    return () => window.removeEventListener("routelag:logout", onLogout);
  }, []);

  useEffect(() => {
    if (!authenticated) {
      stopRouteHeartbeat("logout");
      return;
    }
    void resumeRouteHeartbeat(routeLifecycleOptions()).catch(() => undefined);
  }, [authenticated, routeLifecycleOptions]);

  const startAutoRoute = async () => {
    setAutoRouteState("probing");
    setInlineError(null);
    try {
      if (IS_BETA_DALLAS) {
        setSelectedRoute("dallas-beta");
        setAutoRouteState("done");
        showToast("Dallas selected for this build.", "success");
        pushNotification({
          kind: "routing",
          title: "Route switched",
          body: "Dallas was selected for lower latency.",
          href: "routes",
        });
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

      let chosenRouteId =
        recommended?.candidate.type === "single" &&
        recommended.candidate.serverId &&
        startableRouteIds.includes(recommended.candidate.serverId)
          ? recommended.candidate.serverId
          : null;
      if (!chosenRouteId) {
        const bestSingle = result.testResult.rankedRoutes.find(
          (route) =>
            route.candidate.type === "single" &&
            route.candidate.serverId &&
            startableRouteIds.includes(route.candidate.serverId),
        );
        chosenRouteId =
          bestSingle?.candidate.serverId ??
          recommendRouteId(locationLabel, routeIds, null, startableRouteIds);
      }
      if (chosenRouteId) setSelectedRoute(chosenRouteId);
      setAutoRouteState("done");
      showToast("Auto Route found a recommended server.", "success");
      const city =
        resolveRouteOption(chosenRouteId ?? selectedRoute, routes)?.city ||
        "A recommended server";
      pushNotification({
        kind: "routing",
        title: "Route switched",
        body: `${city} was selected for lower latency.`,
        href: "routes",
      });
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
          `Selected ${fallbackId === "dallas-beta" ? "Dallas" : "Johannesburg"} based on your location.`,
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
          "Zer0 Engine is missing or damaged. Reinstall Zer0.",
          "Zer0 Engine missing",
        );
        setView("routes");
        return;
      }
      if (!meta.elev) {
        notifyAdminRequired(
          "Administrator permission is required to start an Optimization session.",
        );
        return;
      }
      setView("session");
      setStatus({ state: "connecting", message: null });
      const routeSession = await startRouteOptimization(selectedGame, serverId, {
        ...routeLifecycleOptions(),
      });
      setRouteMode(routeSession.routeMode);
      setActiveAllowedIps(routeSession.allowedIps);
      setInlineError(null);
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
          : "Zer0 Optimization started.",
        "success",
      );
      const optimizedCity =
        resolveRouteOption(serverId, routes)?.city ?? serverId;
      pushNotification({
        kind: "routing",
        title: "Route active",
        body: `Fortnite traffic is optimized through ${optimizedCity}.`,
        href: "session",
      });
    } catch (e) {
      const nextMessage = friendlyError(e);
      if (isAdminPermissionError(e)) {
        notifyAdminRequired(nextMessage);
        setStatus({ state: "disconnected", message: null });
        return;
      }
      setStatus({ state: "error", message: nextMessage });
      setErrorFromUnknown(e, "Optimization did not start safely");
      setView("session");
    } finally {
      setBusy(null);
      setOptimizeState((state) => {
        if (state === "optimized" || state === "idle" || state === "degraded") return state;
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
        notifyAdminRequired(
          "Administrator permission is required to end an Optimization session.",
        );
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
              ? "Zer0 restored the local connection, but one cleanup step reported a warning."
              : "Zer0 tried to end optimization, but cleanup could not fully complete.",
          details: result.warnings.join("\n"),
          canRestore: true,
        });
      }
      setView("routes");
    } catch (e) {
      if (isAdminPermissionError(e)) {
        notifyAdminRequired(friendlyError(e));
        return;
      }
      setErrorFromUnknown(e, "End Optimization failed");
      setView("routes");
    } finally {
      setBusy(null);
      setOptimizeState("idle");
    }
  };

  const reconnect = async () => {
    setBusy("reconnect");
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        notifyAdminRequired(
          "Administrator permission is required to reconnect Zer0 Engine.",
        );
        return;
      }
      await api.reconnectTunnel();
      await refreshStats();
      showToast("Zer0 Engine reconnected.", "success");
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
    if (!confirm("Clear the saved Zer0 route profile?")) return;
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
        notifyAdminRequired(
          "Administrator permission is required for Restore Internet.",
        );
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
              ? "Zer0 still sees local recovery state after cleanup."
              : "A Zer0 cleanup step reported a failure that could still affect Zer0 networking.",
          details: restoreWarningDetails(result, recovery),
          canRestore: true,
        });
      } else {
        const success =
          "Restore Internet completed. No active Zer0 Engine was found, and local route state was cleared.";
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
        notifyAdminRequired(
          "Administrator permission is required for Windows network repair.",
        );
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

  const navPingLabel =
    ping?.avg_ping_ms == null ? "--" : String(Math.round(ping.avg_ping_ms));

  const selectedRouteOption = resolveRouteOption(selectedRoute, routes);
  const sessionConnecting =
    busy === "connect" ||
    ["preflight", "creating_server_session", "writing_profile", "starting_engine", "verifying_connection"].includes(
      optimizeState,
    );
  const sessionStrip = authenticated
    ? {
        connected: tunnelConnected,
        connecting: sessionConnecting,
        actionBusy: busy === "connect" || busy === "disconnect" || busy === "cleanup",
        routeCity:
          selectedRouteOption?.city ??
          selectedRouteOption?.label?.replace(/\s*Beta$/i, "") ??
          null,
        regionLabel: fortniteRegionLabel(
          selectedRoute,
          selectedRouteOption?.gameRegion,
        ),
        pingMs: ping?.avg_ping_ms == null ? null : Math.round(ping.avg_ping_ms),
        hudOn: HUD_ENABLED,
        replayCaptureOn: REPLAY_ENABLED,
        onConnect: () => {
          setSelectedGame("fortnite");
          void startOptimization();
        },
        onDisconnect: () => void endOptimization(),
        onOpenHud: HUD_ENABLED ? () => openView("hud") : undefined,
        onOpenReplays: REPLAY_ENABLED ? () => openView("replays") : undefined,
      }
    : null;

  const canUseApp = legalAccepted && authenticated;

  return (
    <>
      {showSplash && <StartupSplash onDone={dismissSplash} />}
      <MiniAppShell
        currentView={canUseApp ? view : undefined}
        onNavigate={canUseApp ? openView : undefined}
        sessionStrip={canUseApp ? sessionStrip : null}
        footer={
          canUseApp && showQuickTools && view !== "games" && (
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
      {!legalAccepted && (
        <BetaConsentGate
          appVersion={consentAppVersion}
          clerkUserId={user?.id}
          onAccepted={() => setLegalAccepted(true)}
        />
      )}
      {legalAccepted && !authenticated && (
        <LoginPage
          accepted={loginAccepted}
          busy={busy === "login"}
          onLogin={(code) => login(code)}
        />
      )}
      {canUseApp && (
        <div
          className="home-dashboard"
          hidden={view !== "games"}
          aria-hidden={view !== "games"}
        >
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
          userLocation={formatProfileLocation(testerProfile) || "Your location"}
          onNavigate={openView}
          onOptimize={(routeId) => {
            setSelectedGame("fortnite");
            setSelectedRoute(routeId);
            void startOptimizationForServer(routeId);
          }}
          onSelectRoute={setSelectedRoute}
        />
          </div>
        </div>
      )}
      {canUseApp && view === "routes" && (
        <div className={`home-dashboard ${view === "routes" ? "routing-dashboard" : ""}`}>
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
        <RouteSelectPage
          autoRouteBusy={autoRouteState === "probing" || autoRouteState === "ranking"}
          autoRouteState={autoRouteState}
          busy={busy === "connect"}
          onAutoRoute={() => void startAutoRoute()}
          onOptimize={() => {
            void startOptimization();
          }}
          onOpenSession={() => {
            if (!sessionActive && !staleTunnelOnly) {
              showToast("Start optimization from Routing first.", "info");
              setView("routes");
              return;
            }
            setView("session");
          }}
          onRestoreInternet={() => void restoreInternet()}
          onSelectRoute={setSelectedRoute}
          routes={routes}
          selectedRoute={selectedRoute}
          sessionActive={sessionActive}
          staleTunnelOnly={staleTunnelOnly}
          testerProfile={testerProfile}
        />
          </div>
        </div>
      )}
      {canUseApp && view === "session" && (
        <div className="home-dashboard routing-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
        <LiveSessionPage
          activeAllowedIps={activeAllowedIps}
          busy={busy === "connect"}
          cleanupBusy={busy === "cleanup" || busy === "disconnect"}
          connected={
            !optimizingNow &&
            (sessionActive || (tunnelConnected && hasConfig && Boolean(activeAllowedIps)))
          }
          inlineError={inlineError}
          optimizeState={optimizeState}
          ping={ping}
          selectedCity={
            resolveRouteOption(selectedRoute, routes)?.city ??
            resolveRouteOption(selectedRoute, routes)?.label ??
            "Zer0"
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
      {canUseApp && view === "stats" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
      {canUseApp && view === "diagnostics" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
      {canUseApp && view === "profile" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
      {canUseApp && REPLAY_ENABLED && view === "replays" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
            <UpgradeGate
              allowed={entitlements.hasReplays}
              loaded={entitlements.isLoaded}
              title="Replays are a Pro feature"
              description="Subscribe to Pro to unlock unlimited replay parsing and PathGen insights."
              onUpgrade={() => openView("billing")}
            >
              <ReplayEnginePage />
            </UpgradeGate>
          </div>
        </div>
      )}
      {canUseApp && HUD_ENABLED && view === "hud" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
            <HudOverlayPage />
          </div>
        </div>
      )}
      {canUseApp && view === "settings" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
            <SettingsPage />
          </div>
        </div>
      )}
      {canUseApp && view === "billing" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
          />
          <div className="app-page-slot">
            <AccountPage />
          </div>
        </div>
      )}
      {canUseApp && view === "help" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
      {canUseApp && view === "logs" && (
        <div className="home-dashboard">
          <AppSidebar
            active={activeNavItem(view)}
            onNavigate={openView}
            profileImageUrl={profileImageUrl}
            pingLabel={navPingLabel}
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
      return "settings";
    case "settings":
      return "settings";
    case "help":
      return "settings";
    case "replays":
      return "replays";
    case "stats":
    case "diagnostics":
    case "logs":
      return "analytics";
    default:
      return "dashboard";
  }
}

async function checkRouteLagEngine() {
  return api.isRouteLagEngineAvailable();
}

function friendlyError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    switch (code) {
      case "subscription_required":
      case "invite_only_insufficient":
        return "A Zer0 Pro subscription is required to start routing.";
      case "subscription_expired":
        return "Your Zer0 Pro subscription has expired. Renew to start routing.";
      case "account_restricted":
        return "This account is restricted from routing. Contact support if you need help.";
      case "entitlement_unavailable":
        return "Subscription verification is temporarily unavailable. Try again shortly.";
      case "concurrent_session_limit":
        return "Routing is already active on another device. End that session first.";
      case "invalid_token":
        return "Authorization expired. Sign in again and retry.";
      default:
        break;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("administrator permission")) {
    return "Administrator permission is required for this Zer0 Optimization action. Restart as Administrator and try again.";
  }
  if (
    message.includes("WireGuard for Windows") ||
    message.includes("WireGuard is not installed") ||
    message.includes("missing or damaged") ||
    message.includes("Engine tooling is not installed")
  ) {
    return "Zer0 Engine is missing or damaged. Reinstall Zer0.";
  }
  return message;
}

function isAdminPermissionError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return message.includes("administrator permission");
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
