import { GlowButton } from "../components/GlowButton";
import { MiniPingGraph } from "../components/MiniPingGraph";
import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
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
    ping?.avg_ping_ms != null ? `${Math.round(ping.avg_ping_ms)}ms` : "N/A";
  const routedIp = connected ? publicIp : hasConfig ? "Ready" : "Config needed";
  const transitioning =
    optimizeState !== "idle" && optimizeState !== "optimized" && optimizeState !== "error";
  const stateLabel = optimizeStateLabel(optimizeState);

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
        <MiniPingGraph samples={ping?.samples_ms ?? []} />
        <span>Time</span>
      </section>

      <section className="route-summary">
        <div className="route-metric-row">
          <span>
            <i className="legend-dot legend-muted" />Routed IP
          </span>
          <strong>{routedIp}</strong>
          <em>{pingValue}</em>
        </div>
        <div className="route-metric-row route-status-row">
          <span>Status</span>
          <strong className={`tone-${statusTone}`}>
            {resultStateLabel(betaReport?.cleanup_result, routeMode, statusLabel)}
          </strong>
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

function optimizeStateLabel(state: OptimizeState) {
  switch (state) {
    case "preflight":
      return "Checking...";
    case "creating_server_session":
      return "Creating session...";
    case "writing_profile":
      return "Preparing...";
    case "starting_engine":
      return "Starting...";
    case "verifying_connection":
      return "Verifying...";
    case "stopping":
      return "Ending...";
    case "rollback":
      return "Restoring...";
    default:
      return "Working...";
  }
}
