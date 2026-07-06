import { useMemo, type ReactNode } from "react";

import { SafetyErrorPanel } from "../components/SafetyErrorPanel";
import { gameRoutePolicyLabels } from "../lib/routeEngine";
import { OPTIMIZE_PROGRESS_STEPS, optimizeStateLabel } from "../lib/optimizeLabels";
import { fortniteRegionLabel } from "../lib/userLocation";
import type { InlineError, OptimizeState } from "../types";

interface LiveSessionPageProps {
  activeAllowedIps: string | null;
  busy: boolean;
  cleanupBusy: boolean;
  connected: boolean;
  inlineError: InlineError | null;
  optimizeState: OptimizeState;
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

  const routedGameIps = useMemo(
    () => gameRoutePolicyLabels(activeAllowedIps ?? ""),
    [activeAllowedIps],
  );

  return (
    <main className="routing-main routing-session-main">
      <header className="routing-picker-header">
        <div>
          <div className="routing-title-row">
            <button type="button" className="session-back-link" onClick={onBack}>
              Back
            </button>
            <h1>Live Session</h1>
            <span className="fortnite-pill">
              <img src="/games/fortnite.jpg" alt="" />
              Fortnite
            </span>
          </div>
          <p>Your optimized route through {selectedCity}.</p>
        </div>
        {connected && (
          <span className="routing-live-pill">
            <span className="routing-status-dot" />
            Connected
          </span>
        )}
      </header>

      {busyOptimizing && (
        <section className="routing-picker-panel routing-session-progress">
          <div className="routing-loading-ring" />
          <strong>Starting optimization</strong>
          <p>{optimizeStateLabel(optimizeState)}</p>
          <ol className="routing-probe-steps compact">
            {OPTIMIZE_PROGRESS_STEPS.map((step) => (
              <ProbeStepRow
                key={step}
                label={optimizeStateLabel(step)}
                status={probeStepStatusForOptimize(step, optimizeState)}
              />
            ))}
          </ol>
        </section>
      )}

      {inlineError && (
        <SafetyErrorPanel
          error={inlineError}
          onRestore={onRestoreInternet}
          onRetry={onRetry}
          showRepair={false}
        />
      )}

      <section className="routing-picker-panel routing-diagram-panel connected routing-session-panel">
        <div className="route-diagram">
          <RouteNode icon={<UserIcon />} label="You" meta={userLocation} />
          <RouteLine />
          <RouteNode
            active
            icon={<ServerIcon />}
            label={selectedCity}
            meta={selectedCountry}
          />
          <RouteLine />
          <RouteNode
            image="/games/fortnite.jpg"
            icon={<FortniteIcon />}
            label="Fortnite"
            meta={fortniteRegionLabel(selectedRouteId)}
          />
        </div>

        <div className="routing-diagram-summary">
          <span>Path</span>
          <strong>
            You &rarr; {selectedCity} &rarr; Fortnite
          </strong>
          <small>
            {connected
              ? statusLabel
              : busyOptimizing
                ? optimizeStateLabel(optimizeState)
                : "Waiting for connection..."}
          </small>
        </div>

        {connected && (
          <>
            <p className="routing-split-route-note">
              Split-route is active. Only traffic to specific Fortnite IPs is sent through
              Dallas — not all of Fortnite, and not your normal browsing.
            </p>

            {routedGameIps.length > 0 && (
              <div className="routing-routed-targets">
                <span>Routed game IPs</span>
                <strong>{routedGameIps.join(", ")}</strong>
                <small>
                  All Fortnite traffic to 18.88.x.x game servers is routed through Dallas.
                </small>
              </div>
            )}

            <div className="routing-beta-expectation">
              <strong>Why in-game ping may not change</strong>
              <ul>
                <li>
                  The server test ping (e.g. 47 ms to 10.67.0.1) is latency to the Dallas
                  tunnel — not your Fortnite match server.
                </li>
                <li>
                  This is the NA-Central Dallas beta. All 18.88.x.x Fortnite game traffic is
                  routed through the tunnel.
                </li>
                <li>
                  Check Fortnite&apos;s network debug ping during a match — that is the real
                  test.
                </li>
              </ul>
            </div>
          </>
        )}

        <div className="routing-diagram-actions">
          <button
            type="button"
            className="routing-start-button"
            onClick={onEnd}
            disabled={!connected || busyOptimizing || cleanupBusy}
          >
            <BoltIcon />
            {cleanupBusy ? "Ending Session" : "End Optimization"}
          </button>
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
    </main>
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
    return current === "optimized" ? "pass" : stepIndex === 0 ? "running" : "pending";
  }
  if (currentIndex > stepIndex || current === "optimized") return "pass";
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
    <li className={`routing-probe-step ${status}`}>
      <span className="routing-probe-step-icon" aria-hidden="true">
        {status === "pass" ? "✓" : status === "fail" ? "!" : status === "running" ? "…" : "·"}
      </span>
      <span className="routing-probe-step-copy">
        <strong>{label}</strong>
      </span>
    </li>
  );
}

function RouteNode({
  active,
  icon,
  image,
  label,
  meta,
}: {
  active?: boolean;
  icon: ReactNode;
  image?: string;
  label: string;
  meta: string;
}) {
  return (
    <div className={`route-node ${active ? "active" : ""}`}>
      <span className={`route-node-icon ${image ? "route-node-image" : ""}`}>
        {image ? <img src={image} alt="" /> : icon}
      </span>
      <strong>{label}</strong>
      <small>{meta}</small>
    </div>
  );
}

function RouteLine() {
  return (
    <div className="route-line" aria-hidden="true">
      <span className="route-line-bar" />
    </div>
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

function FortniteIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M8 4h9" />
      <path d="M8 4v16" />
      <path d="M8 12h7" />
      <path d="M8 20h4" />
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
