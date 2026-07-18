import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import { AdminModal } from "../components/AdminModal";
import { ConnectButton } from "../components/ConnectButton";
import { PingCard } from "../components/PingCard";
import { StatusCard } from "../components/StatusCard";
import { StabilityBanner } from "../components/StabilityBanner";
import { StuckTunnelBanner } from "../components/StuckTunnelBanner";
import { useToast } from "../components/Toast";
import type { PingResult, TunnelHealth, TunnelStatus } from "../types";
import { defaultTunnelStatus } from "../types";

const PING_WORSE_THRESHOLD_MS = 15;

function baselineIpForHealth(ip: string): string | null {
  if (!ip || ip === "—" || ip === "Unavailable" || !ip.includes(".")) {
    return null;
  }
  return ip;
}

export function ConnectPage() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<TunnelStatus>(defaultTunnelStatus());
  const [elevated, setElevated] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [engineInstalled, setEngineInstalled] = useState(true);
  const [serverName, setServerName] = useState<string | null>(null);
  const [ipBefore, setIpBefore] = useState<string>("—");
  const [ipAfter, setIpAfter] = useState<string>("—");
  const [pingBefore, setPingBefore] = useState<PingResult | null>(null);
  const [pingAfter, setPingAfter] = useState<PingResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [tunnelHealth, setTunnelHealth] = useState<TunnelHealth | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const refreshMeta = useCallback(async () => {
    const [elev, cfg, wg, srv, tunnel] = await Promise.all([
      api.isElevated(),
      api.hasConfig(),
      api.isRouteLagEngineAvailable(),
      api.getServerDisplayName(),
      api.tunnelStatus(),
    ]);
    setElevated(elev);
    setHasConfig(cfg);
    setEngineInstalled(wg);
    setServerName(srv);
    setStatus(tunnel);
  }, []);

  const loadBaseline = useCallback(async () => {
    try {
      const ip = await api.getPublicIp();
      setIpBefore(ip);
    } catch {
      setIpBefore("Unavailable");
    }
    try {
      const ping = await api.pingHost();
      setPingBefore(ping);
    } catch {
      setPingBefore(null);
    }
  }, []);

  const refreshHealth = useCallback(async (baselineIp: string) => {
    setTunnelHealth(
      await api.getTunnelHealth(baselineIpForHealth(baselineIp)),
    );
  }, []);

  useEffect(() => {
    void refreshMeta();
    void loadBaseline();
    const statusInterval = window.setInterval(() => {
      void api.tunnelStatus().then(setStatus);
    }, 3000);
    const healthInterval = window.setInterval(() => {
      void refreshHealth(ipBefore);
    }, 15000);
    void refreshHealth(ipBefore);
    return () => {
      window.clearInterval(statusInterval);
      window.clearInterval(healthInterval);
    };
  }, [refreshMeta, loadBaseline, refreshHealth, ipBefore]);

  const handleConnect = async () => {
    if (!hasConfig) {
      showToast("Create or import A Zer0 route profile in Settings first.", "warning");
      return;
    }
    if (!engineInstalled) {
      showToast("Zer0 Engine is missing or damaged. Reinstall Zer0.", "error");
      return;
    }
    if (!elevated) {
      setAdminModalOpen(true);
      return;
    }

    setBusy(true);
    setStatus({ state: "connecting", message: null });
    try {
      await api.connectTunnel();
      await refreshMeta();
      try {
        const ip = await api.getPublicIp();
        setIpAfter(ip);
      } catch {
        setIpAfter("Unavailable");
      }
      try {
        const ping = await api.pingHost();
        setPingAfter(ping);
      } catch {
        setPingAfter(null);
      }
      await refreshHealth(ipBefore);
      showToast("Tunnel connected.", "success");
    } catch (e) {
      setStatus({ state: "error", message: String(e) });
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!elevated) {
      setAdminModalOpen(true);
      return;
    }
    setBusy(true);
    try {
      await api.disconnectTunnel();
      setIpAfter("—");
      setPingAfter(null);
      await refreshMeta();
      await loadBaseline();
      await refreshHealth(ipBefore);
      showToast("Tunnel disconnected.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestartAsAdmin = async () => {
    setAdminLoading(true);
    try {
      await api.restartAsAdmin();
    } catch (e) {
      showToast(String(e), "error");
      setAdminLoading(false);
      setAdminModalOpen(false);
    }
  };

  const handleReconnect = async () => {
    if (!elevated) {
      setAdminModalOpen(true);
      return;
    }
    setReconnecting(true);
    try {
      await api.reconnectTunnel();
      await refreshMeta();
      await refreshHealth(ipBefore);
      showToast("Tunnel reconnected.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setReconnecting(false);
    }
  };

  const runRestoreInternet = async () => {
    setBusy(true);
    try {
      await api.restoreInternet();
      setIpAfter("—");
      setPingAfter(null);
      await refreshMeta();
      await loadBaseline();
      await refreshHealth(ipBefore);
      showToast("Restore Internet completed.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreInternet = () => {
    if (
      !confirm(
        "Restore Internet? This stops The Zer0 tunnel, uninstalls its route service, and flushes DNS. Zer0 stays installed.",
      )
    ) {
      return;
    }
    if (!elevated) {
      setAdminModalOpen(true);
      return;
    }
    void runRestoreInternet();
  };

  const pingWorse =
    pingBefore?.avg_ping_ms != null &&
    pingAfter?.avg_ping_ms != null &&
    pingAfter.avg_ping_ms > pingBefore.avg_ping_ms + PING_WORSE_THRESHOLD_MS;

  const isConnected = status.state === "connected";

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Zer0</h1>
          <p className="mt-1 text-sm text-muted">
            Config: {serverName ?? "No config imported"}
          </p>
        </div>
        <StatusCard status={status} elevated={elevated} />
      </div>

      {!hasConfig && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-amber-100">
          Create or import A Zer0 route profile in Settings before connecting.
        </div>
      )}

      {!engineInstalled && (
        <div className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-red-200">
          Zer0 Engine is missing or damaged. Reinstall Zer0.
        </div>
      )}

      {!elevated && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Connect and Disconnect require administrator permission. Other features
          work in normal mode.
        </div>
      )}

      <StuckTunnelBanner
        health={tunnelHealth}
        onReconnect={() => void handleReconnect()}
        onDisconnect={() => void handleDisconnect()}
        onRestoreInternet={handleRestoreInternet}
        reconnecting={reconnecting}
        busy={busy}
      />

      <StabilityBanner
        health={tunnelHealth?.stuck_tunnel ? null : tunnelHealth}
        onReconnect={() => void handleReconnect()}
        reconnecting={reconnecting}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <PingCard title="Public IP (before tunnel)" value={ipBefore} />
        <PingCard
          title="Public IP (after tunnel)"
          value={isConnected ? ipAfter : "—"}
          highlight={isConnected ? "success" : "default"}
        />
        <PingCard
          title="Ping test"
          value={
            isConnected && pingAfter?.avg_ping_ms != null
              ? `${Math.round(pingAfter.avg_ping_ms)} ms`
              : pingBefore?.avg_ping_ms != null
                ? `${Math.round(pingBefore.avg_ping_ms)} ms`
                : "—"
          }
          subtitle={
            isConnected && pingAfter
              ? `Loss ${pingAfter.packet_loss_pct}%${
                  pingAfter.jitter_ms != null
                    ? ` · Jitter ${Math.round(pingAfter.jitter_ms)} ms`
                    : ""
                }`
              : pingBefore
                ? `Baseline · Loss ${pingBefore.packet_loss_pct}%`
                : undefined
          }
          highlight={pingWorse ? "warning" : "default"}
        />
      </div>

      {pingWorse && (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-amber-100">
          Ping looks worse through the tunnel (+
          {Math.round(
            (pingAfter!.avg_ping_ms ?? 0) - (pingBefore!.avg_ping_ms ?? 0),
          )}
          ms). This can happen when the beta server is far from game servers.
        </div>
      )}

      <div className="mt-auto grid gap-3 sm:grid-cols-2">
        <ConnectButton
          label="Connect"
          variant="connect"
          onClick={() => void handleConnect()}
          disabled={!hasConfig || !engineInstalled || isConnected}
          loading={busy && !isConnected}
        />
        <ConnectButton
          label="Disconnect"
          variant="disconnect"
          onClick={() => void handleDisconnect()}
          disabled={!isConnected && status.state !== "connecting"}
          loading={busy && isConnected}
        />
      </div>

      <AdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onRestartAsAdmin={() => void handleRestartAsAdmin()}
        loading={adminLoading}
      />
    </div>
  );
}
