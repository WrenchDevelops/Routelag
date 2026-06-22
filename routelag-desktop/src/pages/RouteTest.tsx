import { useEffect, useState } from "react";

import { api } from "../api";
import { PingCard } from "../components/PingCard";
import { useToast } from "../components/Toast";
import type { RouteTestResult, TunnelStatus } from "../types";
import { defaultTunnelStatus } from "../types";

export function RouteTestPage() {
  const { showToast } = useToast();
  const [latest, setLatest] = useState<RouteTestResult | null>(null);
  const [status, setStatus] = useState<TunnelStatus>(defaultTunnelStatus());
  const [busy, setBusy] = useState<"normal" | "routelag" | null>(null);

  useEffect(() => {
    void api.loadRouteTest().then(setLatest);
    void api.tunnelStatus().then(setStatus);
  }, []);

  const runTest = async (mode: "normal" | "routelag") => {
    setBusy(mode);
    try {
      const result = await api.runRouteTest(mode);
      setLatest(result);
      setStatus(await api.tunnelStatus());
      showToast(
        `${mode === "normal" ? "Normal" : "RouteLag"} route test saved.`,
        "success",
      );
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Route Test</h1>
        <p className="mt-1 text-sm text-muted">
          Compare your normal internet path vs the RouteLag tunnel.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void runTest("normal")}
          disabled={busy !== null || status.state === "connected"}
          className="rounded-xl bg-card border border-border px-4 py-4 text-left hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <p className="font-medium text-white">Test Normal Route</p>
          <p className="mt-1 text-sm text-muted">
            Tunnel must be disconnected
          </p>
          {busy === "normal" && (
            <p className="mt-2 text-xs text-accent cursor-wait">Running...</p>
          )}
        </button>
        <button
          type="button"
          onClick={() => void runTest("routelag")}
          disabled={busy !== null || status.state !== "connected"}
          className="rounded-xl bg-card border border-border px-4 py-4 text-left hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <p className="font-medium text-white">Test RouteLag Route</p>
          <p className="mt-1 text-sm text-muted">Tunnel must be connected</p>
          {busy === "routelag" && (
            <p className="mt-2 text-xs text-accent cursor-wait">Running...</p>
          )}
        </button>
      </div>

      {latest ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PingCard
            title="Latest test"
            value={latest.mode === "routelag" ? "RouteLag route" : "Normal route"}
            subtitle={new Date(latest.tested_at).toLocaleString()}
          />
          <PingCard
            title="Average ping"
            value={
              latest.avg_ping_ms != null
                ? `${Math.round(latest.avg_ping_ms)} ms`
                : "—"
            }
          />
          <PingCard
            title="Packet loss"
            value={`${latest.packet_loss_pct}%`}
          />
          <PingCard
            title="Jitter"
            value={
              latest.jitter_ms != null
                ? `${Math.round(latest.jitter_ms)} ms`
                : "—"
            }
          />
          <PingCard
            title="Public IP"
            value={latest.public_ip ?? "—"}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted">
          No saved test results yet. Run a route test to save the latest result
          locally.
        </div>
      )}
    </div>
  );
}
