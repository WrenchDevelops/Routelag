import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ExternalLink,
  Gamepad2,
  MonitorUp,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Zap,
} from "lucide-react";

import type { MiniView, RouteOption } from "../App";
import type { HomeReplayCard, OptimizeState, PingResult, TunnelStatus } from "../types";
import { HUD_ENABLED, REPLAY_ENABLED } from "../lib/featureFlags";

interface HomePageProps {
  busy: string | null;
  optimizeState: OptimizeState;
  routes: RouteOption[];
  selectedRoute: string;
  status: TunnelStatus;
  statusLabel: string;
  testerName?: string;
  userLocation?: string;
  ping?: PingResult | null;
  pingLoading?: boolean;
  replays?: HomeReplayCard[];
  replaysLoading?: boolean;
  onNavigate: (view: MiniView) => void;
  onOptimize: (routeId: string) => void;
  onSelectRoute?: (routeId: string) => void;
}

export function HomePage({
  busy,
  optimizeState,
  onNavigate,
  onOptimize,
  onSelectRoute,
  ping = null,
  pingLoading = false,
  replays = [],
  replaysLoading = false,
  routes,
  selectedRoute,
  status,
  userLocation = "Your location",
}: HomePageProps) {
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [pickedRoute, setPickedRoute] = useState(selectedRoute);
  const [routeMenuOpen, setRouteMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const routeMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPickedRoute(selectedRoute), [selectedRoute]);
  useEffect(() => {
    if (!routeMenuOpen && !moreMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (routeMenuOpen && !routeMenuRef.current?.contains(target)) setRouteMenuOpen(false);
      if (moreMenuOpen && !moreMenuRef.current?.contains(target)) setMoreMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRouteMenuOpen(false);
      setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [routeMenuOpen, moreMenuOpen]);

  const routeChoices = routes.filter((route) => route.available !== false);
  const activeRoute =
    routeChoices.find((route) => route.id === pickedRoute) ??
    routeChoices.find((route) => route.recommended) ??
    routeChoices[0] ??
    routes[0];
  const connected = status.state === "connected";
  const optimizing =
    busy === "connect" ||
    ["preflight", "creating_server_session", "writing_profile", "starting_engine", "verifying_connection"].includes(optimizeState);
  const pingValue = ping?.avg_ping_ms == null ? null : Math.round(ping.avg_ping_ms);
  const jitterValue = ping?.jitter_ms == null ? null : Math.round(ping.jitter_ms);
  const lossValue = ping?.packet_loss_pct ?? null;
  const city = activeRoute?.city || activeRoute?.label?.replace(/\s*Beta$/i, "") || "Best Route";
  const country = activeRoute?.country || activeRoute?.region || "United States";
  const stability = lossValue != null && lossValue > 2 ? "Needs attention" : "High stability";
  const connectLabel = optimizing ? "Optimizing…" : connected ? "Optimized" : "Connect";
  const [splashActive, setSplashActive] = useState(false);
  const [splashStyle, setSplashStyle] = useState<CSSProperties>({
    ["--splash-x" as string]: "50%",
    ["--splash-y" as string]: "50%",
  });

  const captureSplashOrigin = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setSplashStyle({
      ["--splash-x" as string]: `${Math.min(100, Math.max(0, x)).toFixed(2)}%`,
      ["--splash-y" as string]: `${Math.min(100, Math.max(0, y)).toFixed(2)}%`,
    });
  };

  const selectRoute = (id: string) => {
    setPickedRoute(id);
    onSelectRoute?.(id);
    setRouteMenuOpen(false);
  };

  const openRouteMenu = () => {
    setMoreMenuOpen(false);
    setRouteMenuOpen((open) => !open);
  };

  const openMoreMenu = () => {
    setRouteMenuOpen(false);
    setMoreMenuOpen((open) => !open);
  };

  const goTo = (view: MiniView) => {
    setMoreMenuOpen(false);
    setRouteMenuOpen(false);
    onNavigate(view);
  };

  return (
    <div className="home-page-shell is-ready">
      <main className="home-main home-dashboard-v2">
        <div className="dashboard-primary-grid">
          <section
            className={`dashboard-card quick-connect-card${routeMenuOpen || moreMenuOpen ? " has-menu-open" : ""}`}
            aria-labelledby="quick-connect-title"
          >
            <div className="dashboard-card-heading quick-connect-heading">
              <h1 id="quick-connect-title">Quick Connect</h1>
              <div className="quick-connect-more" ref={moreMenuRef}>
                <button
                  type="button"
                  className={`icon-button-on-accent${moreMenuOpen ? " is-open" : ""}`}
                  aria-label="More connection options"
                  aria-haspopup="menu"
                  aria-expanded={moreMenuOpen}
                  onClick={openMoreMenu}
                >
                  <MoreHorizontal size={20} aria-hidden="true" />
                </button>
                <div
                  className={`quick-connect-more-menu${moreMenuOpen ? " is-open" : ""}`}
                  role="menu"
                  aria-hidden={!moreMenuOpen}
                >
                  <button type="button" role="menuitem" tabIndex={moreMenuOpen ? 0 : -1} onClick={() => goTo("routes")}>
                    View all routes
                  </button>
                  <button type="button" role="menuitem" tabIndex={moreMenuOpen ? 0 : -1} onClick={() => goTo("session")}>
                    Live session
                  </button>
                  <button type="button" role="menuitem" tabIndex={moreMenuOpen ? 0 : -1} onClick={() => goTo("stats")}>
                    Network stats
                  </button>
                  <button type="button" role="menuitem" tabIndex={moreMenuOpen ? 0 : -1} onClick={() => goTo("settings")}>
                    Settings
                  </button>
                </div>
              </div>
            </div>

            <div className="quick-connect-copy">
              <span className="accent-status-pill"><Zap size={12} fill="currentColor" /> Optimal Route</span>
              <div className="quick-route-select" ref={routeMenuRef}>
                <button
                  type="button"
                  className={`quick-route-trigger${routeMenuOpen ? " is-open" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={routeMenuOpen}
                  onClick={openRouteMenu}
                >
                  <span>{city}, {country}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                <ul
                  className={`quick-route-menu${routeMenuOpen ? " is-open" : ""}`}
                  role="listbox"
                  aria-label="Optimal route"
                  aria-hidden={!routeMenuOpen}
                >
                  {routeChoices.map((route) => (
                    <li key={route.id} role="option" aria-selected={route.id === activeRoute?.id}>
                      <button
                        type="button"
                        className={route.id === activeRoute?.id ? "is-selected" : undefined}
                        tabIndex={routeMenuOpen ? 0 : -1}
                        onClick={() => selectRoute(route.id)}
                      >
                        <span>{route.city || route.label}</span><em>{route.ping}</em>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      className="quick-route-menu-more"
                      tabIndex={routeMenuOpen ? 0 : -1}
                      onClick={() => goTo("routes")}
                    >
                      View all routes
                    </button>
                  </li>
                </ul>
              </div>
              <div className="quick-route-meta">
                <strong>{pingLoading ? "…" : pingValue != null ? `${pingValue}ms` : activeRoute?.ping || "—"}</strong>
                <span aria-hidden="true" />
                <em>{stability}</em>
              </div>
            </div>

            <QuickConnectDecoration />
            <button
              type="button"
              className={`quick-connect-button${connected ? " is-optimized" : ""}${optimizing ? " is-optimizing" : ""}${splashActive ? " is-splashing" : ""}`}
              disabled={optimizing || connected || !activeRoute}
              style={splashStyle}
              onPointerEnter={(event) => {
                captureSplashOrigin(event);
                setSplashActive(true);
              }}
              onPointerLeave={() => setSplashActive(false)}
              onClick={() => activeRoute && onOptimize(activeRoute.id)}
            >
              <span className="quick-connect-liquid quick-connect-liquid--primary" aria-hidden="true" />
              <span className="quick-connect-liquid quick-connect-liquid--trail" aria-hidden="true" />
              <span className="quick-connect-liquid quick-connect-liquid--mist" aria-hidden="true" />
              <span className="quick-connect-label">{connectLabel}</span>
              {connected ? (
                <Check size={18} aria-hidden="true" />
              ) : (
                <Zap size={19} fill="currentColor" aria-hidden="true" />
              )}
            </button>
          </section>

          <section className="dashboard-card route-map-card" aria-labelledby="route-map-title">
            <div className="dashboard-card-heading">
              <h2 id="route-map-title">Route Map</h2>
              <span className="live-label">{connected ? "Live" : "Ready"}</span>
            </div>
            <WorldRouteMap
              activeRoute={activeRoute}
              connected={connected || optimizing}
              latencyMs={pingValue}
              onSelectRoute={selectRoute}
              routes={routes}
              userLocation={userLocation}
            />
          </section>

          <div className="dashboard-status-stack">
            <section className="dashboard-card connection-status-card" aria-labelledby="connection-status-title">
              <div className="dashboard-card-heading"><h2 id="connection-status-title">Connection Status</h2></div>
              <div className="connection-status-body">
                <div className={`connection-orbit${connected ? " is-live" : ""}`}>
                  <span><ShieldCheck size={20} fill="currentColor" /></span>
                </div>
                <div><strong>{connected ? "Protected" : optimizing ? "Connecting" : "Ready"}</strong><p>Your connection is secure<br />and optimized.</p></div>
              </div>
            </section>

            <section className="dashboard-card network-boost-card" aria-labelledby="network-boost-title">
              <div className="dashboard-card-heading">
                <h2 id="network-boost-title">Network Boost</h2>
                <span className={connected ? "success-label" : "muted-label"}>{connected ? "Active" : "Standby"}</span>
              </div>
              <dl>
                <div><dt>Adaptive Routing</dt><dd>{connected ? "Enabled" : "Ready"}<i>✓</i></dd></div>
                <div><dt>Packet Optimization</dt><dd>{lossValue != null && lossValue <= 2 ? "Enabled" : "Monitoring"}<i>✓</i></dd></div>
                <div><dt>Traffic Prioritization</dt><dd>{connected ? "High" : "Auto"}<i>✓</i></dd></div>
              </dl>
            </section>
          </div>
        </div>

        <div className="dashboard-utility-grid">
          <section
            className={`dashboard-card overlay-card${!HUD_ENABLED ? " is-feature-disabled" : ""}`}
            aria-labelledby="overlay-card-title"
          >
            <div className="dashboard-card-heading">
              <h2 id="overlay-card-title"><MonitorUp size={18} /> Overlay HUD</h2>
              {HUD_ENABLED ? (
                <button type="button" className={overlayEnabled ? "enabled-state" : "muted-label"} onClick={() => setOverlayEnabled((value) => !value)}>
                  <span />{overlayEnabled ? "Enabled" : "Hidden"}
                </button>
              ) : (
                <span className="muted-label">Coming soon</span>
              )}
            </div>
            <p className="card-description">
              {HUD_ENABLED
                ? "Free separate Overwolf HUD — no routing subscription required"
                : "In-game overlay is temporarily unavailable in this build."}
            </p>
            <div className={`hud-preview-strip${overlayEnabled && HUD_ENABLED ? " is-enabled" : ""}`}>
              <span className="hud-preview-strip__thumb" aria-hidden="true">
                <img src="/games/fortnite.jpg" alt="" />
              </span>
              <HudMetric value={pingValue == null ? "—" : String(pingValue)} label="PING ms" />
              <HudMetric value={lossValue == null ? "—" : `${lossValue}%`} label="LOSS" />
              <HudMetric value={jitterValue == null ? "—" : String(jitterValue)} label="JITTER" />
              <HudMetric value="NA East" label="SERVER" />
              <HudMetric value="—" label="KILLS" />
              <HudMetric value="—" label="DMG DEALT" />
              <HudMetric value="—" label="DMG TAKEN" />
              <HudMetric value="—" label="NET DMG" />
            </div>
            <div className="dashboard-card-actions">
              <button
                type="button"
                className="secondary-accent-button"
                disabled={!HUD_ENABLED}
                onClick={() => onNavigate("hud")}
              >
                Configure Overlay
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={!HUD_ENABLED}
                onClick={() => onNavigate("hud")}
              >
                Preview <ExternalLink size={14} />
              </button>
            </div>
          </section>

          <section className="dashboard-card active-game-card" aria-labelledby="active-game-title">
            <div className="dashboard-card-heading"><h2 id="active-game-title"><Gamepad2 size={18} /> Active Game</h2></div>
            <div className="active-game-summary">
              <img src="/games/fortnite.jpg" alt="Fortnite" />
              <div><strong>Fortnite</strong><span>Battle Royale</span></div>
            </div>
            <dl className="active-game-meta">
              <div><dt>Server</dt><dd>{city}</dd></div>
              <div><dt>Region</dt><dd>{country}</dd></div>
            </dl>
            <div className="dashboard-card-actions">
              <button type="button" className="secondary-button game-settings-button" onClick={() => onNavigate("settings")}><Settings size={15} /> Game Settings</button>
            </div>
          </section>

          <section
            className={`dashboard-card recent-replays-card${!REPLAY_ENABLED ? " is-feature-disabled" : ""}`}
            aria-labelledby="recent-replays-title"
          >
            <div className="dashboard-card-heading">
              <h2 id="recent-replays-title">Recent Replays</h2>
              {REPLAY_ENABLED ? (
                <button type="button" className="view-all-link" onClick={() => onNavigate("replays")}>View All <ChevronRight size={15} /></button>
              ) : (
                <span className="muted-label">Coming soon</span>
              )}
            </div>
            <div className="dashboard-replay-list">
              {!REPLAY_ENABLED ? (
                <div className="dashboard-empty-row">Replay Engine is temporarily unavailable in this build.</div>
              ) : replaysLoading ? (
                <div className="dashboard-empty-row">Loading replays…</div>
              ) : replays.length ? (
                replays.slice(0, 3).map((replay) => (
                  <button type="button" className="dashboard-replay-row" key={replay.id} onClick={() => onNavigate("replays")}>
                    <img src="/games/fortnite.jpg" alt="" />
                    <span className="replay-game"><strong>Fortnite</strong><small>{formatRelativeTime(replay.modified_at)}</small></span>
                    <ReplayMetric value={formatPlace(replay.placement)} label="Place" />
                    <ReplayMetric value={formatStat(replay.eliminations)} label="Kills" />
                    <ReplayMetric value={formatStat(replay.damageDealt)} label="Damage" />
                  </button>
                ))
              ) : (
                <button type="button" className="dashboard-empty-row" onClick={() => onNavigate("replays")}>Import a replay to see match analytics <ChevronRight size={15} /></button>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function HudMetric({ value, label }: { value: string; label: string }) {
  return <span className="hud-preview-metric"><strong>{value}</strong><small>{label}</small></span>;
}

function ReplayMetric({ value, label }: { value: string; label: string }) {
  return <span className="dashboard-replay-metric"><strong>{value}</strong><small>{label}</small></span>;
}

function formatPlace(value: number | null | undefined) {
  if (value == null) return "—";
  return `#${value}`;
}

function formatStat(value: number | null | undefined) {
  if (value == null) return "—";
  return Math.round(value).toLocaleString();
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const hours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

function QuickConnectDecoration() {
  return (
    <svg className="quick-connect-decoration" viewBox="0 0 360 250" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id="quickDots" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,.22)" />
        </pattern>
      </defs>
      <g className="quick-connect-globe">
        <path d="M182 49l25-18 40 4 24 21 28 7 2 35-23 17-21-5-14 21-26-10-8-27-29-15z" fill="url(#quickDots)" />
      </g>
      <g className="quick-connect-waves">
        <path
          className="quick-connect-wave quick-connect-wave--soft"
          d="M-40 226c22-30 42 22 66-8s40 26 66-8 46 20 68-6 48 28 70 4 44 20 68-2 36 4 52 10"
          fill="none"
          stroke="rgba(255,255,255,.14)"
          strokeWidth="1.4"
        />
        <path
          className="quick-connect-wave"
          d="M-40 222c22-30 42 22 66-8s40 26 66-8 46 20 68-6 48 28 70 4 44 20 68-2 36 4 52 10"
          fill="none"
          stroke="rgba(255,255,255,.34)"
          strokeWidth="1.35"
        />
      </g>
    </svg>
  );
}

type MapPoint = { x: number; y: number };

const MIN_MAP_ZOOM = 0.7;
const MAX_MAP_ZOOM = 8;

const MAP_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  ashburn: { lat: 39.04, lng: -77.49 },
  dallas: { lat: 32.78, lng: -96.8 },
  johannesburg: { lat: -26.2, lng: 28.05 },
  virginia: { lat: 37.43, lng: -78.66 },
  philadelphia: { lat: 39.95, lng: -75.17 },
  "new york": { lat: 40.71, lng: -74.01 },
  london: { lat: 51.51, lng: -0.13 },
  frankfurt: { lat: 50.11, lng: 8.68 },
  paris: { lat: 48.86, lng: 2.35 },
  chicago: { lat: 41.88, lng: -87.63 },
  miami: { lat: 25.76, lng: -80.19 },
  "los angeles": { lat: 34.05, lng: -118.24 },
  singapore: { lat: 1.35, lng: 103.82 },
  tokyo: { lat: 35.68, lng: 139.69 },
};

const GAME_REGIONS: Record<string, { label: string; lat: number; lng: number }> = {
  "na-east": { label: "Fortnite NA East · Virginia", lat: 37.432, lng: -78.657 },
  "na-central": { label: "Fortnite NAC · Dallas", lat: 32.777, lng: -96.797 },
  "na-west": { label: "Fortnite NAW · Oregon", lat: 45.52, lng: -122.68 },
  europe: { label: "Fortnite EU · Frankfurt", lat: 50.111, lng: 8.682 },
  brazil: { label: "Fortnite BR · São Paulo", lat: -23.551, lng: -46.633 },
  asia: { label: "Fortnite Asia · Tokyo", lat: 35.676, lng: 139.65 },
  "middle east": { label: "Fortnite ME · Bahrain", lat: 26.224, lng: 50.588 },
  oceania: { label: "Fortnite OCE · Sydney", lat: -33.869, lng: 151.209 },
};

const FORTNITE_PRIMARY_REGIONS = ["na-central", "na-west", "europe", "brazil", "asia", "middle east", "oceania"];

const ROUTELAG_RELAYS: RouteOption[] = [
  { id: "ashburn-beta", label: "Ashburn", city: "Ashburn", country: "United States", region: "NA-East", ping: "Offline", available: false },
  { id: "dallas-beta", label: "Dallas", city: "Dallas", country: "United States", region: "NA-Central", gameRegion: "NA-Central", ping: "Offline", available: false },
  { id: "johannesburg-beta", label: "Johannesburg", city: "Johannesburg", country: "South Africa", region: "ZA", gameRegion: "Middle East", ping: "Offline", available: false },
];

function projectPoint(lat: number, lng: number): MapPoint {
  return { x: 40 + ((lng + 180) / 360) * 540, y: 33 + ((90 - lat) / 180) * 190 };
}

function lookupLocation(label: string, fallback: { lat: number; lng: number }) {
  const normalized = label.toLowerCase();
  const match = Object.entries(MAP_LOCATIONS).find(([key]) => normalized.includes(key));
  return match?.[1] ?? fallback;
}

function routeCurve(from: MapPoint, to: MapPoint) {
  const lift = Math.min(48, Math.max(18, Math.abs(to.x - from.x) * 0.18));
  return `M${from.x} ${from.y} Q${(from.x + to.x) / 2} ${Math.min(from.y, to.y) - lift} ${to.x} ${to.y}`;
}

function separateNearbyPoint(point: MapPoint, anchor: MapPoint, minimumDistance = 4): MapPoint {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minimumDistance) return point;
  if (distance < 0.1) return { x: anchor.x - minimumDistance, y: anchor.y - 1 };
  const scale = minimumDistance / distance;
  return { x: anchor.x + dx * scale, y: anchor.y + dy * scale };
}

function WorldRouteMap({
  activeRoute,
  connected,
  latencyMs,
  onSelectRoute,
  routes,
  userLocation,
}: {
  activeRoute?: RouteOption;
  connected: boolean;
  latencyMs: number | null;
  onSelectRoute: (routeId: string) => void;
  routes: RouteOption[];
  userLocation: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pan, setPan] = useState<MapPoint>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const relayLocation = lookupLocation(activeRoute?.city || activeRoute?.label || "Dallas", { lat: 32.78, lng: -96.8 });
  const userGeo = lookupLocation(userLocation, { lat: 39.95, lng: -75.17 });
  const inferredGameRegion = activeRoute?.id === "johannesburg-beta"
    ? "Middle East"
    : activeRoute?.id === "ashburn-beta"
      ? "NA-East"
      : "NA-Central";
  const regionKey = (activeRoute?.gameRegion || inferredGameRegion).toLowerCase();
  const gameRegion = GAME_REGIONS[regionKey] ?? GAME_REGIONS[regionKey.replace("-", " ")] ?? GAME_REGIONS["na-central"];
  const user = projectPoint(userGeo.lat, userGeo.lng);
  const relay = projectPoint(relayLocation.lat, relayLocation.lng);
  const game = separateNearbyPoint(projectPoint(gameRegion.lat, gameRegion.lng), relay);
  const detailScale = 1.12 / Math.pow(zoom, 1.04);
  const midpoint = { x: (user.x + relay.x + game.x) / 3, y: (user.y + relay.y + game.y) / 3 };
  const routeSpan = Math.max(
    Math.max(user.x, relay.x, game.x) - Math.min(user.x, relay.x, game.x),
    (Math.max(user.y, relay.y, game.y) - Math.min(user.y, relay.y, game.y)) * 1.8,
  );
  const focusZoom = Math.min(3.4, Math.max(1.1, 310 / Math.max(45, routeSpan)));
  const focus = zoom > 1 ? midpoint : { x: 310, y: 130 };
  const transform = `translate(${310 + pan.x - focus.x * zoom} ${130 + pan.y - focus.y * zoom}) scale(${zoom})`;
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const knownRelayIds = new Set(ROUTELAG_RELAYS.map((route) => route.id));
  const visibleRoutes = [
    ...ROUTELAG_RELAYS.map((fallback) => ({ ...fallback, ...routeById.get(fallback.id) })),
    ...routes.filter((route) => !knownRelayIds.has(route.id) && (route.city || route.label)),
  ];

  useEffect(() => {
    if (connected) {
      setZoom(focusZoom);
      setPan({ x: 0, y: 0 });
    }
  }, [activeRoute?.id, connected, focusZoom]);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage) return;
    const zoomWithWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((value) => {
        const normalizedDelta = Math.max(-120, Math.min(120, event.deltaY));
        const next = value * Math.exp(-normalizedDelta * 0.0015);
        return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, next));
      });
    };
    stage.addEventListener("wheel", zoomWithWheel, { passive: false });
    return () => stage.removeEventListener("wheel", zoomWithWheel);
  }, []);

  return (
    <div
      className={`route-map-stage${isDragging ? " is-dragging" : ""}`}
      ref={mapStageRef}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button, [role='button']")) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        setIsDragging(true);
      }}
      onPointerMove={(event) => {
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const dx = ((event.clientX - drag.x) * 620) / bounds.width;
        const dy = ((event.clientY - drag.y) * 260) / bounds.height;
        dragStateRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        setPan((value) => ({ x: value.x + dx, y: value.y + dy }));
      }}
      onPointerUp={(event) => {
        if (dragStateRef.current?.pointerId !== event.pointerId) return;
        dragStateRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setIsDragging(false);
      }}
      onPointerCancel={() => {
        dragStateRef.current = null;
        setIsDragging(false);
      }}
    >
      <svg className="world-route-map" viewBox="0 0 620 260" preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Route visualization from ${userLocation} through ${activeRoute?.city || "the selected relay"} to ${gameRegion.label}`}>
        <defs>
          <pattern id="worldDots" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / Math.pow(zoom, 1.08)})`}><circle cx="1.4" cy="1.4" r="1.1" fill="#d7d8d6" /></pattern>
          <filter id="mapNodeShadow"><feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#ff3b12" floodOpacity=".24" /></filter>
        </defs>
        <g className="route-map-viewport" transform={transform}>
          <g fill="url(#worldDots)" opacity=".82">
            <path d="M60 79l30-30 67-19 55 16 18 26-25 15-9 28-29 10-17 29-29-5-9-31-29-10z" />
            <path d="M178 145l25 5 19 28-5 50-22 29-15-41-14-35z" />
            <path d="M271 61l32-21 52 8 20-14 92 11 56 30-15 23-42 7-13 25-35-1-12 23-32-7-28-32-35 4-28-24z" />
            <path d="M329 127l40 5 21 36-16 63-35 18-30-48 4-45z" />
            <path d="M502 177l31-11 27 18-9 26-38 5-23-19z" />
          </g>
          {visibleRoutes.map((route) => {
            const location = lookupLocation(route.city || route.label, { lat: 0, lng: 0 });
            const point = projectPoint(location.lat, location.lng);
            const selected = route.id === activeRoute?.id;
            return (
              <g
                key={route.id}
                className={`relay-map-node${selected ? " is-selected" : ""}${route.recommended ? " is-recommended" : ""}`}
                role="button"
                aria-label={`${route.city || route.label} relay${route.available === false ? ", unavailable" : ""}`}
                tabIndex={0}
                transform={`translate(${point.x} ${point.y})`}
                onClick={() => route.available !== false && onSelectRoute(route.id)}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && route.available !== false) onSelectRoute(route.id);
                }}
                onMouseEnter={() => setHoveredId(route.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <g transform={`scale(${detailScale})`}>
                  {route.recommended && <circle className="relay-recommended-ring" r="8" />}
                  <circle className="relay-hit-area" r="14" />
                  <circle className="relay-dot" r={selected ? 4.5 : 3} />
                  {hoveredId === route.id && (
                    <g className="map-tooltip" transform="translate(0 -24)">
                      <rect x="-48" y="-18" width="96" height="30" rx="8" />
                      <text y="-5">{route.city || route.label}</text>
                      <text className="map-tooltip-meta" y="6">{route.ping || "Relay"}{route.recommended ? " · Optimal" : ""}</text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
          {FORTNITE_PRIMARY_REGIONS.map((key) => {
            const server = GAME_REGIONS[key];
            const point = projectPoint(server.lat, server.lng);
            const active = key === regionKey;
            if (active) return null;
            const tooltipId = `fortnite-${key}`;
            return (
              <g
                key={key}
                className={`fortnite-map-node${active ? " is-active" : ""}`}
                transform={`translate(${point.x} ${point.y})`}
                onMouseEnter={() => setHoveredId(tooltipId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <g transform={`scale(${detailScale})`}>
                  <circle className="fortnite-node-ring" r="6" />
                  <circle className="fortnite-node-dot" r="2.4" />
                  {hoveredId === tooltipId && (
                    <g className="map-tooltip" transform="translate(0 -20)">
                      <rect x="-56" y="-12" width="112" height="22" rx="7" />
                      <text y="2">{server.label}</text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
          <path className={`route-arc${connected ? " is-live" : ""}`} d={routeCurve(user, relay)} />
          <path className={`route-arc route-arc--second${connected ? " is-live" : ""}`} d={routeCurve(relay, game)} />
          {connected && (
            <g>
              <animateMotion dur="2.8s" repeatCount="indefinite" path={routeCurve(user, relay)} />
              <g transform={`scale(${detailScale})`}>
                <circle className="route-packet" r="3" />
              </g>
            </g>
          )}
          {connected && (
            <g>
              <animateMotion begin="1.1s" dur="2.8s" repeatCount="indefinite" path={routeCurve(relay, game)} />
              <g transform={`scale(${detailScale})`}>
                <circle className="route-packet route-packet--second" r="3" />
              </g>
            </g>
          )}
          <MapEndpoint point={user} eyebrow="You" label={userLocation} kind="user" scale={detailScale} />
          <MapEndpoint point={relay} eyebrow="Relay" label={activeRoute?.city || activeRoute?.label || "Selected relay"} kind="relay" scale={detailScale} />
          <MapEndpoint point={game} eyebrow="Game server" label={gameRegion.label.replace("Fortnite ", "")} kind="game" align="end" scale={detailScale} />
        </g>
      </svg>
      <div className={`route-map-status${connected ? " is-live" : ""}`}>
        <span />{connected ? "Optimized route" : "Route preview"}{latencyMs != null ? ` · ${latencyMs}ms` : ""}
      </div>
      <div className="map-controls" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_MAP_ZOOM} onClick={() => setZoom((value) => Math.min(MAX_MAP_ZOOM, value + 0.3))}><Plus size={17} /></button>
        <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_MAP_ZOOM} onClick={() => setZoom((value) => Math.max(MIN_MAP_ZOOM, value - 0.3))}>−</button>
        <button type="button" aria-label="Focus on current route" onClick={() => { setZoom(focusZoom); setPan({ x: 0, y: 0 }); }}><Crosshair size={16} /></button>
      </div>
    </div>
  );
}

function MapEndpoint({ point, eyebrow, label, kind, scale, align = "start" }: { point: MapPoint; eyebrow: string; label: string; kind: "user" | "relay" | "game"; scale: number; align?: "start" | "end" }) {
  const textX = align === "end" ? -12 : 12;
  return (
    <g className={`map-endpoint map-endpoint--${kind}`} transform={`translate(${point.x} ${point.y})`}>
      <g transform={`scale(${scale})`} filter="url(#mapNodeShadow)">
        <circle className="map-node-halo" r="10" />
        <circle className="map-node-core" r={kind === "relay" ? 5 : 4.5} />
        <g className="map-node-label" transform={`translate(${textX} -8)`} textAnchor={align}>
          <text className="map-node-eyebrow">{eyebrow}</text>
          <text className="map-node-name" y="11">{label}</text>
        </g>
      </g>
    </g>
  );
}
