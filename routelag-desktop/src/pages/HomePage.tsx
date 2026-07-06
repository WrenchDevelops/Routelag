import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Activity,
  BadgeCheck,
  ChevronDown,
  Eraser,
  Route,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";

import type { MiniView, RouteOption } from "../App";
import type { FortniteReplay, OptimizeState, PingResult, TunnelStatus } from "../types";

interface HomePageProps {
  busy: string | null;
  optimizeState: OptimizeState;
  routes: RouteOption[];
  selectedRoute: string;
  status: TunnelStatus;
  statusLabel: string;
  testerName?: string;
  /** Optional already-loaded ping from the app shell. Home never fetches this itself. */
  ping?: PingResult | null;
  pingLoading?: boolean;
  replays?: FortniteReplay[];
  replaysLoading?: boolean;
  onAutoRoute: () => void;
  onDiagnostics: () => void;
  onLogs: () => void;
  onNavigate: (view: MiniView) => void;
  onOptimize: (routeId: string) => void;
  onRestoreInternet: () => void;
  onReady?: () => void;
}

export function HomePage({
  busy,
  optimizeState,
  onAutoRoute,
  onDiagnostics,
  onLogs,
  onNavigate,
  onOptimize,
  onRestoreInternet,
  onReady,
  ping = null,
  pingLoading = false,
  replays = [],
  replaysLoading = false,
  routes,
  selectedRoute,
  status,
  statusLabel,
  testerName,
}: HomePageProps) {
  const [overlayEnabled, setOverlayEnabled] = useState(true);

  useEffect(() => {
    // Home is render-only. Signal ready on the next paint with no network/disk work.
    const id = window.setTimeout(() => onReady?.(), 0);
    return () => window.clearTimeout(id);
  }, [onReady]);

  const selected = routes.find((route) => route.id === selectedRoute) ?? routes[0];
  const startableRoutes = routes.filter((route) => route.available !== false);
  const recommended =
    startableRoutes.find((route) => route.recommended) ??
    startableRoutes[0] ??
    selected;
  const connected = status.state === "connected";
  const busyOptimizing =
    busy === "connect" ||
    optimizeState === "preflight" ||
    optimizeState === "creating_server_session" ||
    optimizeState === "writing_profile" ||
    optimizeState === "starting_engine" ||
    optimizeState === "verifying_connection";

  const userName = testerName?.trim() || "Wrench";
  const pingValue = ping?.avg_ping_ms != null ? Math.round(ping.avg_ping_ms) : null;
  const jitterValue = ping?.jitter_ms != null ? Math.round(ping.jitter_ms) : null;
  const lossValue = ping?.packet_loss_pct ?? null;
  const quality = pingLoading
    ? "Loading"
    : getRouteQuality(ping, connected, statusLabel);
  const statusMeterStyle = {
    "--status-progress": `${pingLoading ? 12 : getStatusMeterValue(pingValue)}%`,
  } as CSSProperties;
  const recentSessions = useMemo(() => makeRecentSessions(replays), [replays]);
  const routePingLabel = pingLoading
    ? "..."
    : formatMeasuredPing(recommended?.ping, pingValue);
  const optimizeStatusLabel = busyOptimizing
    ? "Optimizing"
    : connected
      ? "Optimized"
      : pingLoading
        ? "Loading"
        : "Ready";
  const optimizeStatusTone = busyOptimizing
    ? "tone-warning"
    : connected
      ? "tone-success"
      : pingLoading
        ? "tone-muted"
        : "tone-success";

  return (
    <div className="home-page-shell is-ready">
    <main className="home-main">
        <section className="home-hero" aria-label="RouteLag overview">
          <img src="/dashboard-hero.png" alt="" decoding="async" loading="eager" />
          <div className="home-hero-shade" aria-hidden="true" />
          <div className="home-hero-copy">
            <span>Welcome back,</span>
            <h1>
              {userName}
              <BadgeCheck className="home-verified" size={22} strokeWidth={2.25} aria-hidden="true" />
            </h1>
            <p>Let's get you the best connection.</p>
          </div>
        </section>

        <section className="home-card home-optimize-card">
          <div className="home-section-title">
            <h2>Optimize Connection</h2>
            <span className={`home-pill ${optimizeStatusTone}`}>
              {pingLoading && <span className="home-pill-spinner" aria-hidden="true" />}
              {optimizeStatusLabel}
            </span>
          </div>
          <div className="home-game-row">
            <img src="/games/fortnite.jpg" alt="" decoding="async" loading="lazy" />
            <div>
              <strong>Fortnite</strong>
              <span>{recommended?.label ?? "Johannesburg Beta"}</span>
            </div>
            <em>
              {pingLoading ? (
                <span className="home-inline-loading">
                  <span className="home-inline-spinner" aria-hidden="true" />
                </span>
              ) : (
                routePingLabel
              )}
              <small>Ping</small>
            </em>
          </div>
          <div className="home-actions-row">
            <button type="button" onClick={() => onNavigate("routes")} disabled={busy === "connect"}>
              <span className="home-action-leading">
                <Route size={16} strokeWidth={2} aria-hidden="true" />
                Best Route
              </span>
              <ChevronDown size={16} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="home-primary-action"
              onClick={() => recommended && onOptimize(recommended.id)}
              disabled={busyOptimizing || !recommended || recommended.available === false}
            >
              <Zap size={16} strokeWidth={2.25} aria-hidden="true" />
              {busyOptimizing ? "Optimizing" : connected ? "Optimized" : "Optimize Now"}
            </button>
          </div>
        </section>

        <section className="home-card home-status-card">
          <div className="home-section-title">
            <h2>Connection Status</h2>
            {pingLoading && (
              <span className="home-pill tone-muted">
                <span className="home-pill-spinner" aria-hidden="true" />
                Loading
              </span>
            )}
          </div>
          <div className={`home-status-body${pingLoading ? " is-loading" : ""}`}>
            <div className="home-ping-meter" style={statusMeterStyle}>
              <div className="home-ping-meter-core">
                {pingLoading ? (
                  <span className="home-meter-spinner" aria-label="Loading ping" />
                ) : (
                  <>
                    <strong>{pingValue ?? "--"}</strong>
                    <span>ms</span>
                    <small>{quality}</small>
                  </>
                )}
              </div>
            </div>
            <dl className="home-status-list">
              <div>
                <dt>
                  <Wifi size={15} strokeWidth={2} aria-hidden="true" />
                  Ping
                </dt>
                <dd>
                  {pingLoading ? (
                    <span className="home-inline-spinner" aria-hidden="true" />
                  ) : pingValue != null ? (
                    `${pingValue} ms`
                  ) : (
                    "--"
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Activity size={15} strokeWidth={2} aria-hidden="true" />
                  Jitter
                </dt>
                <dd>
                  {pingLoading ? (
                    <span className="home-inline-spinner" aria-hidden="true" />
                  ) : jitterValue != null ? (
                    `${jitterValue} ms`
                  ) : (
                    "--"
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
                  Packet Loss
                </dt>
                <dd>
                  {pingLoading ? (
                    <span className="home-inline-spinner" aria-hidden="true" />
                  ) : lossValue != null ? (
                    `${lossValue}%`
                  ) : (
                    "--"
                  )}
                </dd>
              </div>
              <div>
                <dt>
                  <Route size={15} strokeWidth={2} aria-hidden="true" />
                  Route Quality
                </dt>
                <dd>
                  {pingLoading ? (
                    <span className="home-inline-spinner" aria-hidden="true" />
                  ) : (
                    quality
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="home-card home-overlay-card">
          <div className="home-section-title">
            <h2>Game Overlay</h2>
            <span className={`home-pill ${overlayEnabled ? "tone-success" : "tone-muted"}`}>
              {overlayEnabled ? "Active" : "Hidden"}
            </span>
          </div>
          <p className="home-card-subtitle">Monitor your performance in-game.</p>
          <div className="home-overlay-preview">
            <div className="home-overlay-stat-panel">
              <div>
                <strong>842</strong>
                <span>Damage Dealt</span>
              </div>
              <div>
                <strong>516</strong>
                <span>Damage Taken</span>
              </div>
              <div>
                <strong>+326</strong>
                <span>Net Damage</span>
              </div>
            </div>
            <MiniWaveIcon />
          </div>
          <button type="button" onClick={() => setOverlayEnabled((value) => !value)}>
            <Settings size={16} strokeWidth={2} aria-hidden="true" />
            Configure Overlay
          </button>
        </section>

        <section className="home-card home-sessions-card">
          <div className="home-section-title">
            <h2>Recent Sessions</h2>
            <button type="button" onClick={() => onNavigate("replays")}>View All</button>
          </div>
          <div className="home-session-list">
            {replaysLoading ? (
              <div className="home-sessions-loading" aria-busy="true" aria-live="polite">
                <span className="home-meter-spinner" aria-hidden="true" />
                <p>Loading recent sessions...</p>
              </div>
            ) : recentSessions.length ? (
              recentSessions.map((session) => (
                <div className="home-session" key={session.id}>
                  <img src="/fortnite-logo-mark.png" alt="" decoding="async" loading="lazy" />
                  <div>
                    <strong>Fortnite</strong>
                    <span>{session.detail}</span>
                  </div>
                  <span className="home-parsed-badge">Parsed</span>
                </div>
              ))
            ) : (
              <p className="home-empty">No recent Fortnite sessions found.</p>
            )}
          </div>
        </section>

        <section className="home-card home-tools-card">
          <div className="home-section-title">
            <h2>Quick Tools</h2>
          </div>
          <div className="home-tool-grid">
            <button type="button" onClick={onAutoRoute}>
              <Sparkles size={20} strokeWidth={2} aria-hidden="true" />
              WiFi/FPS Boost
            </button>
            <button type="button" onClick={onDiagnostics}>
              <Activity size={20} strokeWidth={2} aria-hidden="true" />
              Network Diagnose
            </button>
            <button type="button" onClick={onRestoreInternet} disabled={busy === "cleanup"}>
              <Eraser size={20} strokeWidth={2} aria-hidden="true" />
              Clear Game Cache
            </button>
            <button type="button" onClick={onLogs}>
              <ScrollText size={20} strokeWidth={2} aria-hidden="true" />
              View Routing Log
            </button>
          </div>
        </section>
    </main>
    </div>
  );
}

function getRouteQuality(ping: PingResult | null, connected: boolean, statusLabel: string) {
  if (!ping?.avg_ping_ms) return connected ? statusLabel : "Checking";
  if (ping.packet_loss_pct > 2) return "Unstable";
  if (ping.avg_ping_ms <= 35) return "Excellent";
  if (ping.avg_ping_ms <= 70) return "Good";
  return "Fair";
}

function getStatusMeterValue(pingValue: number | null) {
  if (pingValue == null) return 0;
  return Math.max(4, Math.min(100, pingValue));
}

function formatMeasuredPing(routePing: string | undefined, pingValue: number | null) {
  if (routePing && /\d+\s*ms/i.test(routePing)) return routePing;
  if (pingValue != null) return `${pingValue} ms`;
  return "--";
}

function makeRecentSessions(replays: FortniteReplay[]) {
  return replays.slice(0, 3).map((replay) => ({
    id: replay.path,
    detail: formatReplayTime(replay.modified_at),
  }));
}

function formatReplayTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MiniWaveIcon() {
  return (
    <svg className="home-wave" viewBox="0 0 260 54" preserveAspectRatio="none">
      <path d="M0 42c28-12 45-19 73-7 27 12 43 1 65-8 35-15 55 11 85 4 16-4 25-9 37-8" />
      <path d="M0 51c29-10 48-13 78-4 29 9 45-3 68-10 30-10 54 9 83 2 14-3 20-5 31-4" />
    </svg>
  );
}
