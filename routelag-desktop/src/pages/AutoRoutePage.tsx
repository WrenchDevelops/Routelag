import { useState } from "react";

import { GlowButton } from "../components/GlowButton";
import type { AutoRouteState } from "../types";
import type { AutoTestResponse } from "../lib/api";

type AutoRankedRoute = AutoTestResponse["rankedRoutes"][number];

interface AutoRoutePageProps {
  state: AutoRouteState;
  result: AutoTestResponse | null;
  error: string | null;
  onBack: () => void;
  onStartRecommended: () => void;
  onChooseManually: () => void;
  busy: boolean;
}

export function AutoRoutePage({
  state,
  result,
  error,
  onBack,
  onStartRecommended,
  onChooseManually,
  busy,
}: AutoRoutePageProps) {
  const [showDetails, setShowDetails] = useState(false);

  const recommended = result?.recommendedRoute;
  const canStartRecommended =
    result != null &&
    recommended != null &&
    recommended.candidate.type === "single" &&
    recommended.candidate.canStart &&
    !result.directIsBetter;

  return (
    <div className="route-view">
      <div className="rl-glow-top" />
      <header className="server-top-bar">
        <button type="button" className="back-link" onClick={onBack}>
          Back
        </button>
        <span className="header-spacer" />
      </header>

      <div className="route-heading">
        <h1>Auto Route</h1>
        <h2>Find best route</h2>
        <p>Testing available routes for South Africa → Middle East.</p>
      </div>

      {(state === "probing" || state === "ranking") && (
        <div className="auto-route-status">
          <div className="auto-route-spinner" />
          <p className="auto-route-status-text">
            {state === "probing" ? "Probing Zer0 nodes…" : "Ranking routes…"}
          </p>
          <p className="auto-route-status-sub">This takes a few seconds.</p>
        </div>
      )}

      {state === "error" && (
        <div className="auto-route-error-panel">
          <p className="auto-route-error-title">Auto Route failed</p>
          <p className="auto-route-error-msg">{error ?? "Unknown error."}</p>
          <GlowButton onClick={onChooseManually}>Choose Manually</GlowButton>
        </div>
      )}

      {state === "done" && result != null && (
        <>
          <RecommendationCard result={result} />

          {showDetails && (
            <div className="auto-route-score-table">
              <p className="auto-route-score-heading">Route scores (lower is better)</p>
              {result.rankedRoutes.map((route) => (
                <RouteScoreRow key={route.candidate.id} route={route} />
              ))}
              {result.warnings.length > 0 && (
                <div className="auto-route-warnings">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="auto-route-warning-item">
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="auto-route-actions">
            <GlowButton
              onClick={onStartRecommended}
              disabled={busy || !canStartRecommended}
            >
              {busy
                ? "Starting…"
                : canStartRecommended
                  ? "Start Recommended Route"
                  : result.directIsBetter
                    ? "Direct looks best"
                    : "Start Recommended Route"}
            </GlowButton>

            <button
              type="button"
              className="auto-route-secondary-btn"
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? "Hide details" : "View Details"}
            </button>

            <button
              type="button"
              className="auto-route-secondary-btn"
              onClick={onChooseManually}
            >
              Choose Manually
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RecommendationCard({ result }: { result: AutoTestResponse }) {
  const recommended = result.recommendedRoute;
  if (!recommended) return null;

  const isDirect = recommended.candidate.type === "direct" || result.directIsBetter;
  const reason = result.reasons[0] ?? "";

  return (
    <div className={`auto-route-rec-card ${isDirect ? "auto-route-rec-direct" : "auto-route-rec-routelag"}`}>
      <p className="auto-route-rec-label">Recommended route</p>
      <p className="auto-route-rec-name">
        {isDirect ? "Direct (Zer0 OFF)" : recommended.candidate.label}
      </p>
      <p className="auto-route-rec-score">
        Score: {recommended.score.toFixed(0)}
      </p>
      {reason.length > 0 && (
        <p className="auto-route-rec-reason">{reason}</p>
      )}
    </div>
  );
}

function RouteScoreRow({ route }: { route: AutoRankedRoute }) {
  const isChain = route.candidate.type === "chain";
  const isDirect = route.candidate.type === "direct";

  return (
    <div className="auto-route-score-row">
      <div className="auto-route-score-row-left">
        <span className="auto-route-score-label">{route.candidate.label}</span>
        {isChain && (
          <span className="auto-route-badge auto-route-badge-estimate">
            Multi-hop coming soon
          </span>
        )}
        {route.measurementStatus === "unavailable" && !isChain && (
          <span className="auto-route-badge auto-route-badge-warn">No data</span>
        )}
        {route.measurementStatus === "estimated" && !isDirect && (
          <span className="auto-route-badge auto-route-badge-est">Est.</span>
        )}
      </div>
      <div className="auto-route-score-row-right">
        <span className="auto-route-score-value">{route.score.toFixed(0)}</span>
        <span className="auto-route-score-breakdown">
          {route.breakdown.latencyMs.toFixed(0)}ms ·{" "}
          {route.breakdown.jitterMs.toFixed(0)}ms jitter ·{" "}
          {route.breakdown.packetLossPct.toFixed(1)}% loss
        </span>
      </div>
    </div>
  );
}
