import { useEffect, useMemo, useState } from "react";

import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
import { gameRoutePolicyLabels, tunnelGatewayHost } from "../lib/routeEngine";
import { OPTIMIZE_PROGRESS_STEPS, optimizeStateLabel } from "../lib/optimizeLabels";
import { fortniteRegionLabel } from "../lib/userLocation";
import type { InlineError, OptimizeState, PingResult } from "../types";

interface LiveSessionPageProps {
  activeAllowedIps: string | null;
  busy: boolean;
  cleanupBusy: boolean;
  connected: boolean;
  inlineError: InlineError | null;
  optimizeState: OptimizeState;
  ping: PingResult | null;
  selectedCity: string;
  selectedCountry: string;
  selectedRouteId: string;
  statusLabel: string;
  userLocation: string;
  onBack: () => void;
  onEnd: () => void;
  onRestoreInternet: () => void;
  onRetry: () => void;
}

export function LiveSessionPage({
  activeAllowedIps,
  busy,
  cleanupBusy,
  connected,
  inlineError,
  optimizeState,
  ping,
  selectedCity,
  selectedCountry,
  selectedRouteId,
  statusLabel,
  userLocation,
  onBack,
  onEnd,
  onRestoreInternet,
  onRetry,
}: LiveSessionPageProps) {
  const busyOptimizing =
    busy ||
    optimizeState === "preflight" ||
    optimizeState === "creating_server_session" ||
    optimizeState === "writing_profile" ||
    optimizeState === "starting_engine" ||
    optimizeState === "verifying_connection";

  const routedGamePolicy = useMemo(() => {
    const labels = gameRoutePolicyLabels(activeAllowedIps ?? "");
    if (labels.length) return labels.join(", ");
    return "18.88.x.x (Fortnite NA)";
  }, [activeAllowedIps]);

  const tunnelHost = tunnelGatewayHost(activeAllowedIps ?? "") ?? null;
  const tunnelPingMs =
    ping?.avg_ping_ms != null ? Math.round(ping.avg_ping_ms) : null;
  const serverLabel = selectedCity || "Zer0 server";

  const showBlockingError =
    inlineError &&
    !(connected && inlineError.title === "Previous optimization did not close cleanly");

  const sessionStatus = busyOptimizing
    ? { tone: "starting" as const, label: "Starting route...", detail: optimizeStateLabel(optimizeState) }
    : optimizeState === "degraded" && connected
      ? {
          tone: "starting" as const,
          label: "Route degraded",
          detail:
            "Optimization is still active locally. Zer0 is retrying server heartbeats with bounded backoff.",
        }
      : connected
      ? {
          tone: "active" as const,
          label: "Route active",
          detail: `Fortnite game traffic is routed through ${serverLabel}.`,
        }
      : optimizeState === "error"
        ? { tone: "error" as const, label: "Connection failed", detail: statusLabel }
        : {
            tone: "idle" as const,
            label: "No active session",
            detail: "Start optimization from Routing to connect.",
          };

  const [statusExpanded, setStatusExpanded] = useState(false);
  const showCheckNotice =
    busyOptimizing || optimizeState === "error" || optimizeState === "degraded";
  const checkNoticeLabel = busyOptimizing
    ? optimizeStateLabel(optimizeState)
    : optimizeState === "degraded"
      ? optimizeStateLabel("degraded")
      : sessionStatus.label;

  useEffect(() => {
    if (!showCheckNotice) setStatusExpanded(false);
  }, [showCheckNotice]);

  return (
    <main className="routing-main routing-session-main routing-session-view">
      <header className="routing-picker-header routing-session-header">
        <div>
          <div className="routing-title-row">
            <button
              type="button"
              className="session-back-link"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onBack}
            >
              Back
            </button>
            <h1>Live Session</h1>
            <span className="fortnite-pill">
              <img src="/games/fortnite.jpg" alt="" />
              Fortnite
            </span>
          </div>
          <p>
            {selectedCity
              ? `${selectedCity} split-route to Fortnite ${fortniteRegionLabel(selectedRouteId)}.`
              : "Optimized route session for Fortnite."}
          </p>
        </div>
      </header>

      {showBlockingError && (
        <SafetyErrorPanel
          error={inlineError}
          onRestore={onRestoreInternet}
          onRetry={onRetry}
          showRepair={false}
        />
      )}

      <div className={`routing-session-body${connected ? " has-health" : ""}`}>
        {connected && (
          <section className="routing-session-health">
            <h2>Session health</h2>
            <ul>
              <HealthRow ok label="Tunnel" detail={`Connected via Zer0 Engine`} />
              <HealthRow
                ok
                label={`${serverLabel} server`}
                detail={
                  tunnelHost
                    ? tunnelPingMs != null
                      ? `${tunnelPingMs} ms to ${tunnelHost}`
                      : `Reachable at ${tunnelHost}`
                    : "Tunnel gateway reachable"
                }
              />
              <HealthRow
                ok
                label="Fortnite route"
                detail={`Game IPs ${routedGamePolicy} â†’ ${serverLabel}`}
              />
            </ul>
            <p className="routing-session-health-tip">
              Your normal browsing stays direct. Only Fortnite traffic uses the {serverLabel} tunnel.
              Check in-game network debug during a match to see if ping improved.
            </p>
          </section>
        )}

        <section className="routing-picker-panel routing-diagram-panel routing-session-panel">
          <div className="route-diagram">
            <div className="route-diagram-rail">
              <span className="route-node-icon">
                <UserIcon />
              </span>
              <span className={`route-connector${connected ? " is-live" : ""}`} aria-hidden="true" />
              <span className={`route-node-icon${connected ? " active" : ""}`}>
                <ServerIcon />
              </span>
              <span className={`route-connector${connected ? " is-live" : ""}`} aria-hidden="true" />
              <span className="route-node-icon route-node-image">
                <img src="/games/fortnite.jpg" alt="" />
              </span>
            </div>

            <div className="route-diagram-captions">
              <div className="route-caption">
                <strong>You</strong>
                <small>{userLocation}</small>
              </div>
              <div className="route-caption">
                <strong>{selectedCity}</strong>
                <small>{selectedCountry}</small>
              </div>
              <div className="route-caption">
                <strong>Fortnite</strong>
                <small>{fortniteRegionLabel(selectedRouteId)}</small>
              </div>
            </div>
          </div>

          <div className="routing-diagram-actions">
            {connected ? (
              <button
                type="button"
                className="routing-start-button"
                onClick={onEnd}
                disabled={busyOptimizing || cleanupBusy}
              >
                <BoltIcon />
                {cleanupBusy ? "Ending Session" : "End Optimization"}
              </button>
            ) : (
              <button
                type="button"
                className="routing-start-button"
                onClick={onBack}
                disabled={busyOptimizing || cleanupBusy}
              >
                <BoltIcon />
                Go to Routing
              </button>
            )}
            <button
              type="button"
              className="routing-restore-button"
              onClick={onRestoreInternet}
              disabled={cleanupBusy}
            >
              {cleanupBusy ? "Restoring Internet" : "Restore Internet"}
            </button>
          </div>
        </section>
      </div>

      {showCheckNotice && (
        <aside
          className={`session-check-toast session-check-toast-${sessionStatus.tone}${statusExpanded ? " is-expanded" : ""}`}
          aria-live="polite"
        >
          <button
            type="button"
            className="session-check-toast-toggle"
            aria-expanded={statusExpanded}
            aria-controls="session-check-toast-panel"
            onClick={() => setStatusExpanded((open) => !open)}
          >
            {busyOptimizing ? (
              <span className="session-check-toast-spinner" aria-hidden="true" />
            ) : (
              <span className="session-check-toast-dot" aria-hidden="true" />
            )}
            <span className="session-check-toast-copy">
              <strong>{busyOptimizing ? "Starting route..." : sessionStatus.label}</strong>
              <small>{checkNoticeLabel}</small>
            </span>
            <span className="session-check-toast-chevron" aria-hidden="true">
              <ChevronIcon />
            </span>
          </button>

          {statusExpanded && (
            <div id="session-check-toast-panel" className="session-check-toast-panel">
              {busyOptimizing ? (
                <ol className="session-check-toast-steps">
                  {OPTIMIZE_PROGRESS_STEPS.map((step) => (
                    <ProbeStepRow
                      key={step}
                      label={optimizeStateLabel(step)}
                      status={probeStepStatusForOptimize(step, optimizeState)}
                    />
                  ))}
                </ol>
              ) : (
                <p className="session-check-toast-detail">{sessionStatus.detail}</p>
              )}
            </div>
          )}
        </aside>
      )}
    </main>
  );
}

function HealthRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className={ok ? "ok" : "warn"}>
      <span aria-hidden="true">{ok ? "✓" : "!"}</span>
      <div>
        <strong>{label}</strong>
        <small>{detail}</small>
      </div>
    </li>
  );
}

function probeStepStatusForOptimize(
  step: OptimizeState,
  current: OptimizeState,
): "pending" | "running" | "pass" | "fail" | "skip" {
  const order = OPTIMIZE_PROGRESS_STEPS;
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(current);
  if (currentIndex === -1) {
    return current === "optimized" || current === "degraded"
      ? "pass"
      : stepIndex === 0
        ? "running"
        : "pending";
  }
  if (currentIndex > stepIndex || current === "optimized" || current === "degraded") {
    return "pass";
  }
  if (currentIndex === stepIndex) return "running";
  return "pending";
}

function ProbeStepRow({
  label,
  status,
}: {
  label: string;
  status: "pending" | "running" | "pass" | "fail" | "skip";
}) {
  return (
    <li className={`session-check-toast-step ${status}`}>
      <span className="session-check-toast-step-icon" aria-hidden="true">
        {status === "pass" ? "✓" : status === "fail" ? "!" : status === "running" ? "…" : "·"}
      </span>
      <span>{label}</span>
    </li>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 4h14v6H5z" />
      <path d="M5 14h14v6H5z" />
      <path d="M8 7h.01" />
      <path d="M8 17h.01" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
