import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "./api";
import { AdminModal } from "./components/AdminModal";
import { MiniAppShell } from "./components/MiniAppShell";
import { MiniFooterNav } from "./components/MiniFooterNav";
import { ToastProvider, useToast } from "./components/Toast";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { GameSelectPage } from "./pages/GameSelectPage";
import { LoginPage } from "./pages/LoginPage";
import { LogsPage } from "./pages/LogsPage";
import { RouteSelectPage } from "./pages/RouteSelectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { StatsPage } from "./pages/StatsPage";
import { getRouteToken, routeApi } from "./lib/api";
import {
  exportReport as exportRouteReport,
  restoreInternet as restoreRouteInternet,
  runDiagnostics as runRouteDiagnostics,
  startOptimization as startRouteOptimization,
  stopOptimization,
} from "./lib/routeEngine";
import { runAutoRoute as runAutoRouteFlow } from "./lib/autoRoute";
import type { AutoRouteState } from "./types";
import type { AutoTestResponse } from "./lib/api";
import { AutoRoutePage } from "./pages/AutoRoutePage";
import type {
  BetaReportSnapshot,
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
  | "stats"
  | "diagnostics"
  | "settings"
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
}

const gameOptions: GameOption[] = [
  {
    id: "fortnite",
    name: "Fortnite",
    image: "/games/fortnite.jpg",
    tone: "sky",
  },
];

const fallbackRouteOptions: RouteOption[] = [
  {
    id: "johannesburg-beta",
    label: "Johannesburg Beta",
    name: "Johannesburg Beta",
    ping: "API",
    available: false,
    meta: "Main local South Africa route",
    region: "South Africa",
    city: "Johannesburg",
    country: "ZA",
    status: "coming soon",
    recommended: true,
  },
  {
    id: "frankfurt-beta",
    label: "Frankfurt Beta",
    name: "Frankfurt Beta",
    ping: "API",
    available: false,
    meta: "Main Europe/Middle East bridge",
    region: "Europe / Middle East bridge",
    city: "Frankfurt",
    country: "DE",
    status: "coming soon",
    recommended: true,
  },
  {
    id: "london-beta",
    label: "London Beta",
    name: "London Beta",
    ping: "API",
    available: false,
    meta: "Backup Europe bridge",
    region: "Europe backup bridge",
    city: "London",
    country: "GB",
    status: "coming soon",
  },
  {
    id: "amsterdam-beta",
    label: "Amsterdam Beta",
    name: "Amsterdam Beta",
    ping: "API",
    available: false,
    meta: "Extra comparison route",
    region: "Europe comparison route",
    city: "Amsterdam",
    country: "NL",
    status: "coming soon",
  },
];

const PRESERVED_ROUTE_STORAGE_KEYS = new Set([
  "routelag.routeToken",
  "routelag.testerId",
  "routelag.inviteCode",
]);
const LIFECYCLE_STRESS_KEY = "routelag.lifecycleStress";

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
  const [view, setView] = useState<MiniView>("games");
  const [selectedGame, setSelectedGame] = useState<GameId>("fortnite");
  const [selectedRoute, setSelectedRoute] = useState("johannesburg-beta");
  const [routes, setRoutes] = useState<RouteOption[]>(fallbackRouteOptions);
  const [status, setStatus] = useState<TunnelStatus>(defaultTunnelStatus());
  const [hasConfig, setHasConfig] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [engineInstalled, setEngineInstalled] = useState(true);
  const [publicIp, setPublicIp] = useState("192.193.1.1");
  const [ping, setPing] = useState<PingResult | null>(null);
  const [logs, setLogs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<InlineError | null>(null);
  const [optimizeState, setOptimizeState] = useState<OptimizeState>("idle");
  const [routeMode, setRouteMode] = useState<RouteMode | null>(null);
  const [betaReport, setBetaReport] = useState<BetaReportSnapshot | null>(null);
  const [testerProfile, setTesterProfile] = useState<TesterProfile>(
    defaultTesterProfile,
  );
  const [lifecycleStress, setLifecycleStress] = useState<LifecycleStressStatus>(
    loadLifecycleStressStatus,
  );
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [autoRouteState, setAutoRouteState] = useState<AutoRouteState>("idle");
  const [autoRouteResult, setAutoRouteResult] = useState<AutoTestResponse | null>(null);
  const [autoRouteError, setAutoRouteError] = useState<string | null>(null);
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
    return { cfg, elev, wg, active };
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

  const resetRouteRuntimeUi = useCallback((recovery?: RecoveryStatus) => {
    clearRouteRuntimeStorage();
    setOptimizeState("idle");
    setStatus(defaultTunnelStatus());
    setRouteMode(null);
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
    const interval = window.setInterval(() => {
      void api.tunnelStatus().then(setStatus).catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [refreshMeta]);

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
      .getServers(selectedGame)
      .then((servers) => {
        const mapped = servers.map<RouteOption>((server) => ({
          id: server.id,
          label: server.name,
          name: server.name,
          region: server.region,
          city: server.city,
          country: server.country,
          ip: server.endpointHost ?? server.endpointIp,
          endpoint: server.endpoint,
          meta: server.recommended
            ? "Recommended for South Africa -> Middle East testing"
            : server.notes,
          notes: server.notes,
          available: server.available,
          status: server.status,
          ping: server.available
            ? server.pingEstimate ?? "Test"
            : server.status === "maintenance"
              ? "Maint"
              : "Soon",
          qualityLabel: server.debugLabel ?? server.label,
          recommended: server.recommended,
        }));
        setRoutes(mapped.length ? mapped : fallbackRouteOptions);
        if (mapped.length && !mapped.some((route) => route.id === selectedRoute)) {
          setSelectedRoute(mapped.find((route) => route.available)?.id ?? mapped[0].id);
        }
      })
      .catch(() => setRoutes(fallbackRouteOptions));
  }, [authenticated, selectedGame, selectedRoute]);

  useEffect(() => {
    if (view === "stats") void refreshStats();
    if (view === "settings") void refreshSettings();
    if (view === "logs") {
      void api
        .readLogs()
        .then(setLogs)
        .catch((e) => setLogs(`Failed to load logs: ${String(e)}`));
    }
  }, [refreshSettings, refreshStats, view]);

  const openView = (nextView: MiniView) => {
    setMessage(null);
    if (nextView !== "stats") {
      setInlineError((error) =>
        error?.title === "Previous optimization did not close cleanly" ? error : null,
      );
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
    setInlineError(null);
    try {
      await routeApi.login(inviteCode);
      setAuthenticated(true);
      setView("games");
      showToast("Logged in to RouteLag Beta.", "success");
    } catch (e) {
      setErrorFromUnknown(e, "Sign in failed");
    } finally {
      setBusy(null);
    }
  };

  const startAutoRoute = async () => {
    setAutoRouteState("probing");
    setAutoRouteResult(null);
    setAutoRouteError(null);
    setInlineError(null);
    openView("autoRoute");
    try {
      setAutoRouteState("probing");
      const result = await runAutoRouteFlow(selectedGame, "middle-east");
      setAutoRouteState("ranking");
      setAutoRouteResult(result.testResult);
      setAutoRouteState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAutoRouteError(msg);
      setAutoRouteState("error");
      showToast("Auto Route failed. You can still choose manually.", "error");
    }
  };

  const startRecommendedRoute = async () => {
    const recommended = autoRouteResult?.recommendedRoute;
    if (!recommended || recommended.candidate.type !== "single" || !recommended.candidate.serverId) {
      showToast("No single-hop route to start. Choose manually.", "error");
      return;
    }
    setSelectedRoute(recommended.candidate.serverId);
    await startOptimizationForServer(recommended.candidate.serverId);
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
      const route = routes.find((item) => item.id === serverId);
      if (!route) {
        setErrorFromUnknown("Select a RouteLag server first.", "Optimization blocked");
        return;
      }
      if (route.available === false) {
        setErrorFromUnknown("Server not available yet.", "Optimization blocked");
        return;
      }
      if (!authenticated) {
        setErrorFromUnknown("Log in with your beta invite code first.", "Optimization blocked");
        setAuthenticated(false);
        setView("stats");
        return;
      }
      if (!meta.wg) {
        setErrorFromUnknown(
          "RouteLag Engine is missing or damaged. Reinstall RouteLag.",
          "RouteLag Engine missing",
        );
        setView("stats");
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
      setView("stats");
      setStatus({ state: "connecting", message: null });
      const routeSession = await startRouteOptimization(selectedGame, serverId, {
        onState: setOptimizeState,
      });
      setRouteMode(routeSession.routeMode);
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
      setView("stats");
    } finally {
      setBusy(null);
      setOptimizeState((state) => (state === "optimized" ? state : "error"));
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
      <MiniAppShell
        onSettings={() => openView("settings")}
        footer={
          authenticated && (
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
          busy={busy === "login"}
          error={inlineError}
          onLogin={(code) => login(code)}
        />
      )}
      {authenticated && view === "games" && (
        <GameSelectPage
          games={gameOptions}
          onSelect={(game) => {
            if (game.id !== "fortnite") {
              showToast(`${game.name} support is coming soon.`, "info");
              return;
            }
            setSelectedGame(game.id);
            openView("routes");
          }}
        />
      )}
      {authenticated && view === "routes" && (
        <RouteSelectPage
          busy={busy === "connect"}
          autoRouteBusy={autoRouteState === "probing" || autoRouteState === "ranking"}
          onBack={() => openView("games")}
          routes={routes}
          selectedRoute={selectedRoute}
          onSelectRoute={setSelectedRoute}
          onOptimize={() => void startOptimization()}
          onAutoRoute={() => void startAutoRoute()}
        />
      )}
      {authenticated && view === "autoRoute" && (
        <AutoRoutePage
          state={autoRouteState}
          result={autoRouteResult}
          error={autoRouteError}
          busy={busy === "connect"}
          onBack={() => openView("routes")}
          onStartRecommended={() => void startRecommendedRoute()}
          onChooseManually={() => openView("routes")}
        />
      )}
      {authenticated && view === "stats" && (
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
      )}
      {authenticated && view === "diagnostics" && (
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
      )}
      {authenticated && view === "settings" && (
        <SettingsPage
          busy={busy}
          elevated={elevated}
          hasConfig={hasConfig}
          engineInstalled={engineInstalled}
          onBack={() => openView("games")}
          onImport={() => void importConfig()}
          onRemove={() => void removeConfig()}
        />
      )}
      {authenticated && view === "logs" && (
        <LogsPage logs={logs} onBack={() => openView("stats")} />
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
