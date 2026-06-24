import { useCallback, useEffect, useState } from "react";

import { api } from "./api";
import { AdminModal } from "./components/AdminModal";
import { MiniAppShell } from "./components/MiniAppShell";
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
  runDiagnostics as runRouteDiagnostics,
  startOptimization as startRouteOptimization,
  stopOptimization,
} from "./lib/routeEngine";
import type { PingResult, TunnelStatus } from "./types";
import { defaultTunnelStatus, normalizeTunnelStatus } from "./types";

export type MiniView =
  | "games"
  | "routes"
  | "stats"
  | "diagnostics"
  | "settings"
  | "logs";

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
  name?: string;
  ip?: string;
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

const routeOptions: RouteOption[] = [
  {
    id: "johannesburg-beta",
    label: "JOHANNESBURG BETA",
    name: "Johannesburg Beta",
    ip: "102.211.56.103",
    ping: "285ms",
    available: true,
    meta: "Dev Server",
    region: "ZA",
    qualityLabel: "Dev Server",
    sampleCount: 12,
  },
  {
    id: "na-central",
    label: "NA-CENTRAL",
    name: "NA-Central",
    ping: "Soon",
    available: false,
  },
  {
    id: "na-east",
    label: "NA-EAST",
    name: "NA-East",
    ping: "Soon",
    available: false,
  },
  {
    id: "na-west",
    label: "NA-WEST",
    name: "NA-West",
    ping: "Soon",
    available: false,
  },
  {
    id: "europe",
    label: "EUROPE",
    name: "Europe",
    ping: "Soon",
    available: false,
  },
];

function AppContent() {
  const { showToast } = useToast();
  const [authenticated, setAuthenticated] = useState(() => Boolean(getRouteToken()));
  const [view, setView] = useState<MiniView>("games");
  const [selectedRoute, setSelectedRoute] = useState("johannesburg-beta");
  const [routes, setRoutes] = useState<RouteOption[]>(routeOptions);
  const [status, setStatus] = useState<TunnelStatus>(defaultTunnelStatus());
  const [hasConfig, setHasConfig] = useState(false);
  const [elevated, setElevated] = useState(false);
  const [wgInstalled, setWgInstalled] = useState(true);
  const [publicIp, setPublicIp] = useState("192.193.1.1");
  const [ping, setPing] = useState<PingResult | null>(null);
  const [logs, setLogs] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const statusView = normalizeTunnelStatus(status);

  const refreshMeta = useCallback(async () => {
    const [cfg, elev, wg, tunnel] = await Promise.all([
      api.hasConfig(),
      api.isElevated(),
      api.isWireguardInstalled(),
      api.tunnelStatus(),
    ]);
    setHasConfig(cfg);
    setElevated(elev);
    setWgInstalled(wg);
    setStatus(tunnel);
    return { cfg, elev, wg };
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

  const refreshSettings = useCallback(async () => {
    await refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    void refreshMeta();
    const interval = window.setInterval(() => {
      void api.tunnelStatus().then(setStatus).catch(() => undefined);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [refreshMeta]);

  useEffect(() => {
    if (!authenticated) return;
    void routeApi
      .getServers("fortnite")
      .then((servers) => {
        const mapped = servers.map<RouteOption>((server) => ({
          id: server.id,
          label: server.name.toUpperCase(),
          name: server.name,
          region: server.region,
          ip: server.endpointIp,
          meta: server.label,
          available: server.available,
          ping: server.available ? "285ms" : "Soon",
          qualityLabel: server.label,
        }));
        setRoutes(mapped.length ? mapped : routeOptions);
      })
      .catch(() => setRoutes(routeOptions));
  }, [authenticated]);

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

  const login = async (inviteCode: string) => {
    setBusy("login");
    try {
      await routeApi.login(inviteCode);
      setAuthenticated(true);
      setView("games");
      showToast("Logged in to RouteLag Beta.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const startOptimization = async () => {
    setBusy("connect");
    setMessage(null);
    try {
      const meta = await refreshMeta();
      const route = routes.find((item) => item.id === selectedRoute);
      if (!route) {
        showToast("Select a RouteLag server first.", "warning");
        return;
      }
      if (route.available === false) {
        showToast("Server not available yet.", "warning");
        return;
      }
      if (!authenticated) {
        setMessage("Log in with your beta invite code first.");
        setAuthenticated(false);
        setView("stats");
        showToast("Log in before optimizing.", "warning");
        return;
      }
      if (!meta.wg) {
        setMessage("RouteLag Engine tooling is required before optimizing.");
        setView("stats");
        showToast("Install RouteLag Engine tooling first.", "error");
        return;
      }
      if (!meta.elev) {
        setAdminModalOpen(true);
        return;
      }
      setView("stats");
      setStatus({ state: "connecting", message: null });
      await startRouteOptimization("fortnite", selectedRoute);
      await refreshStats();
      showToast("RouteLag optimization started.", "success");
    } catch (e) {
      const nextMessage = String(e);
      setStatus({ state: "error", message: nextMessage });
      setMessage(nextMessage);
      setView("stats");
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const endOptimization = async () => {
    setBusy("disconnect");
    setMessage(null);
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setAdminModalOpen(true);
        return;
      }
      await stopOptimization();
      await refreshStats();
      showToast("RouteLag optimization ended.", "success");
    } catch (e) {
      const nextMessage = String(e);
      setMessage(nextMessage);
      showToast(nextMessage, "error");
    } finally {
      setBusy(null);
    }
  };

  const reconnect = async () => {
    setBusy("reconnect");
    try {
      const meta = await refreshMeta();
      if (!meta.elev) {
        setAdminModalOpen(true);
        return;
      }
      await api.reconnectTunnel();
      await refreshStats();
      showToast("Tunnel reconnected.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const runDiagnostics = async () => {
    setBusy("diagnostics");
    try {
      await runRouteDiagnostics();
      showToast("Diagnostics completed.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const exportReport = async () => {
    setBusy("export");
    try {
      const path = await exportRouteReport();
      showToast(`Report saved to ${path}`, "success");
    } catch (e) {
      showToast(String(e), "error");
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
      showToast(String(e), "error");
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
      showToast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <MiniAppShell onSettings={() => openView("settings")}>
      {!authenticated && (
        <LoginPage busy={busy === "login"} onLogin={(code) => login(code)} />
      )}
      {authenticated && view === "games" && (
        <GameSelectPage
          games={gameOptions}
          onSelect={(game) => {
            if (game.id !== "fortnite") {
              showToast(`${game.name} support is coming soon.`, "info");
              return;
            }
            openView("routes");
          }}
        />
      )}
      {authenticated && view === "routes" && (
        <RouteSelectPage
          busy={busy === "connect"}
          onBack={() => openView("games")}
          routes={routes}
          selectedRoute={selectedRoute}
          onSelectRoute={setSelectedRoute}
          onOptimize={() => void startOptimization()}
        />
      )}
      {authenticated && view === "stats" && (
        <StatsPage
          busy={busy}
          hasConfig={hasConfig}
          message={message}
          ping={ping}
          publicIp={publicIp}
          status={status}
          statusLabel={statusView.label}
          statusTone={statusView.tone}
          onBack={() => openView("games")}
          onEnd={() => void endOptimization()}
          onExport={() => void exportReport()}
          onStart={() => void startOptimization()}
          onSettings={() => openView("settings")}
        />
      )}
      {authenticated && view === "diagnostics" && (
        <DiagnosticsPage
          busy={busy}
          onBack={() => openView("stats")}
          onExport={() => void exportReport()}
          onReconnect={() => void reconnect()}
          onRun={() => void runDiagnostics()}
        />
      )}
      {authenticated && view === "settings" && (
        <SettingsPage
          busy={busy}
          elevated={elevated}
          hasConfig={hasConfig}
          wgInstalled={wgInstalled}
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

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
