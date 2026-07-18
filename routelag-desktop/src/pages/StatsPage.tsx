import { Activity, ArrowLeft, Download, ShieldCheck } from "lucide-react";

import { GlowButton } from "../components/GlowButton";
import { MiniPingGraph } from "../components/MiniPingGraph";
import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
import { optimizeStateLabel } from "../lib/optimizeLabels";
import type {
  BetaReportSnapshot,
  InlineError,
  OptimizeState,
  PingResult,
  RouteMode,
  TunnelStatus,
} from "../types";

interface StatsPageProps {
  busy: string | null;
  hasConfig: boolean;
  message: string | null;
  inlineError: InlineError | null;
  optimizeState: OptimizeState;
  ping: PingResult | null;
  publicIp: string;
  routeMode: RouteMode | null;
  betaReport: BetaReportSnapshot | null;
  status: TunnelStatus;
  statusLabel: string;
  statusTone: string;
  onBack: () => void;
  onEnd: () => void;
  onExport: () => void;
  onRepairWindowsNetwork: () => void;
  onRestoreInternet: () => void;
  onSettings: () => void;
  onStart: () => void;
}

export function StatsPage({
  busy,
  hasConfig,
  inlineError,
  message,
  onBack,
  onEnd,
  onExport,
  onRestoreInternet,
  onRepairWindowsNetwork,
  onSettings,
  onStart,
  optimizeState,
  ping,
  publicIp,
  routeMode,
  betaReport,
  status,
  statusLabel,
  statusTone,
}: StatsPageProps) {
  const connected = status.state === "connected";
  const pingValue =
    ping?.avg_ping_ms != null ? `${Math.round(ping.avg_ping_ms)}ms` : "—";
  const jitterValue =
    ping?.jitter_ms != null ? `${Math.round(ping.jitter_ms)}ms` : "—";
  const lossValue =
    ping?.packet_loss_pct != null ? `${ping.packet_loss_pct}%` : "—";
  const routedIp = connected ? publicIp || "Connected" : hasConfig ? "Ready" : "Config needed";
  const transitioning =
    optimizeState !== "idle" && optimizeState !== "optimized" && optimizeState !== "error";
  const stateLabel = optimizeStateLabel(optimizeState);
  const statusText = resultStateLabel(betaReport?.cleanup_result, routeMode, statusLabel);
  const sessionState = connected ? "Optimized" : transitioning ? stateLabel : "Idle";

  return (
    <div className="stats-view">
      <header className="stats-header">
        <div className="stats-header-copy">
          <button type="button" className="back-link" onClick={onBack}>
            <ArrowLeft size={14} aria-hidden="true" />
            Back
          </button>
          <h1>Network Analytics</h1>
          <p>Live ping, route health, and session status for this PC.</p>
        </div>
      </header>

      <div className="stats-primary-grid">
        <section className="dashboard-card stats-chart-card" aria-labelledby="stats-chart-title">
          <div className="dashboard-card-heading">
            <h2 id="stats-chart-title">
              <Activity size={16} aria-hidden="true" />
              Ping Over Time
            </h2>
            <span className={connected || (ping?.samples_ms?.length ?? 0) > 1 ? "live-label" : "muted-label"}>
              {connected ? "Live" : (ping?.samples_ms?.length ?? 0) > 1 ? "Recent" : "Standby"}
            </span>
          </div>
          <div className="stats-chart-body">
            <MiniPingGraph samples={ping?.samples_ms ?? []} emptyLabel="Waiting for ping samples" />
          </div>
        </section>

        <div className="stats-side-stack">
          <section className="dashboard-card stats-snapshot-card" aria-labelledby="stats-snapshot-title">
            <div className="dashboard-card-heading">
              <h2 id="stats-snapshot-title">Network Snapshot</h2>
              <span className={connected ? "success-label" : "muted-label"}>
                {connected ? "Active" : "Standby"}
              </span>
            </div>
            <dl className="stats-metric-list">
              <div>
                <dt>Average Ping</dt>
                <dd>{pingValue}</dd>
              </div>
              <div>
                <dt>Jitter</dt>
                <dd>{jitterValue}</dd>
              </div>
              <div>
                <dt>Packet Loss</dt>
                <dd>{lossValue}</dd>
              </div>
            </dl>
          </section>

          <section className="dashboard-card stats-status-card" aria-labelledby="stats-status-title">
            <div className="dashboard-card-heading">
              <h2 id="stats-status-title">Route Status</h2>
            </div>
            <div className="stats-status-body">
              <div className={`connection-orbit${connected ? " is-live" : ""}`}>
                <span>
                  <ShieldCheck size={18} fill="currentColor" aria-hidden="true" />
                </span>
              </div>
              <div className="stats-status-copy">
                <strong className={`tone-${statusTone}`}>{statusText}</strong>
                <p>
                  Routed IP <em>{routedIp}</em>
                </p>
                <span className={connected ? "success-label" : "muted-label"}>{sessionState}</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {message && (
        <div className="compact-alert">
          <span>{message}</span>
          {!hasConfig && (
            <button type="button" onClick={onSettings}>
              Settings
            </button>
          )}
        </div>
      )}

      {inlineError && (
        <SafetyErrorPanel
          error={inlineError}
          onRepair={onRepairWindowsNetwork}
          onRestore={onRestoreInternet}
          onRetry={onStart}
          showRepair={!isEngineMissingError(inlineError)}
        />
      )}

      <div className="stats-actions">
        <GlowButton
          onClick={connected ? onEnd : onStart}
          disabled={transitioning || busy === "connect" || busy === "disconnect"}
        >
          {connected
            ? transitioning || busy === "disconnect"
              ? stateLabel
              : "End Optimization"
            : transitioning || busy === "connect"
              ? stateLabel
              : "Start Optimization"}
        </GlowButton>
        <button
          type="button"
          className="download-report-btn"
          onClick={onExport}
          disabled={busy === "export"}
        >
          <Download size={15} aria-hidden="true" />
          {busy === "export" ? "Downloading..." : "Download Report"}
        </button>
      </div>
    </div>
  );
}

function isEngineMissingError(error: InlineError) {
  const message = `${error.title} ${error.message}`.toLowerCase();
  return message.includes("engine") && message.includes("missing");
}

function resultStateLabel(
  cleanupResult: string | null | undefined,
  routeMode: RouteMode | null,
  fallback: string,
) {
  if (cleanupResult === "Optimization ended cleanly") return "Optimization ended cleanly";
  if (cleanupResult === "Restore Internet completed") return "Restore Internet completed";
  if (cleanupResult === "Cleanup warning") return "Cleanup warning";
  if (cleanupResult === "Cleanup failed") return "Cleanup failed";
  if (routeMode === "split_route") return "Safe split-route active";
  if (routeMode === "full_tunnel") return "Blocked";
  return fallback;
}
