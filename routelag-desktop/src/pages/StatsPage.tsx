import { GlowButton } from "../components/GlowButton";
import { MiniPingGraph } from "../components/MiniPingGraph";
import type { PingResult, TunnelStatus } from "../types";

interface StatsPageProps {
  busy: string | null;
  hasConfig: boolean;
  message: string | null;
  ping: PingResult | null;
  publicIp: string;
  status: TunnelStatus;
  statusLabel: string;
  statusTone: string;
  onBack: () => void;
  onEnd: () => void;
  onExport: () => void;
  onSettings: () => void;
  onStart: () => void;
}

export function StatsPage({
  busy,
  hasConfig,
  message,
  onBack,
  onEnd,
  onExport,
  onSettings,
  onStart,
  ping,
  publicIp,
  status,
  statusLabel,
  statusTone,
}: StatsPageProps) {
  const connected = status.state === "connected";
  const pingValue =
    ping?.avg_ping_ms != null ? `${Math.round(ping.avg_ping_ms)}ms` : "N/A";
  const routedIp = connected ? publicIp : hasConfig ? "Ready" : "Config needed";

  return (
    <div className="stats-view">
      <header className="ping-header">
        <button type="button" className="back-link" onClick={onBack}>
          Back
        </button>
        <h1>Routelag</h1>
        <span className="header-spacer" />
      </header>

      <section className="chart-box">
        <span>Ping</span>
        <MiniPingGraph />
        <span>Time</span>
      </section>

      <section className="route-summary">
        <div className="route-metric-row">
          <span><i className="legend-dot legend-muted" />Routed IP</span>
          <strong>{routedIp}</strong>
          <em>{pingValue}</em>
        </div>
        <div className="route-metric-row route-status-row">
          <span>Status</span>
          <strong className={`tone-${statusTone}`}>{statusLabel}</strong>
          <em>{connected ? "0.0%" : "Idle"}</em>
        </div>
      </section>

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

      <div className="stats-actions">
        <GlowButton
          onClick={connected ? onEnd : onStart}
          disabled={busy === "connect" || busy === "disconnect"}
        >
          {connected
            ? busy === "disconnect"
              ? "Ending..."
              : "End Optimization"
            : busy === "connect"
              ? "Starting..."
              : "Start Routing"}
        </GlowButton>
        <button
          type="button"
          className="download-report-btn"
          onClick={onExport}
          disabled={busy === "export"}
        >
          {busy === "export" ? "Downloading..." : "Download Report"}
        </button>
      </div>
    </div>
  );
}
