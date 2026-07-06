import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { RouteOption } from "../App";
import { IS_BETA_DALLAS } from "../lib/betaMode";
import { loadAutoRouteSnapshot } from "../lib/autoRoute";
import { mergeRouteOptions } from "../lib/routeCatalog";
import {
  formatProfileLocation,
  fortniteRegionLabel,
  recommendRouteId,
  resolveUserLocationLabel,
} from "../lib/userLocation";
import type { AutoRouteState, TesterProfile, WireGuardProbeStep } from "../types";

interface RouteSelectPageProps {
  autoRouteBusy: boolean;
  autoRouteState: AutoRouteState;
  busy: boolean;
  cleanupBusy: boolean;
  onAutoRoute: () => void;
  onOptimize: () => void;
  onOpenSession: () => void;
  onRestoreInternet: () => void;
  onSelectRoute: (routeId: string) => void;
  onTestServer: () => void;
  routes: RouteOption[];
  selectedRoute: string;
  serverProbeBusy: boolean;
  serverProbeSteps: WireGuardProbeStep[] | null;
  sessionActive: boolean;
  staleTunnelOnly: boolean;
  testerProfile: TesterProfile;
}

const preferredOrder = ["johannesburg", "dallas"];

const defaultRoutes: RouteCard[] = IS_BETA_DALLAS
  ? [
      {
        available: false,
        city: "Dallas Beta",
        countryName: "United States",
        flag: "US",
        id: "dallas-beta",
        ping: "",
        pingLabel: "",
      },
    ]
  : [
      {
        available: false,
        city: "Johannesburg Beta",
        countryName: "South Africa",
        flag: "ZA",
        id: "johannesburg-beta",
        ping: "",
        pingLabel: "",
      },
      {
        available: false,
        city: "Dallas Beta",
        countryName: "United States",
        flag: "US",
        id: "dallas-beta",
        ping: "",
        pingLabel: "",
      },
    ];

export function RouteSelectPage({
  autoRouteBusy,
  autoRouteState,
  busy,
  cleanupBusy,
  onAutoRoute,
  onOptimize,
  onOpenSession,
  onRestoreInternet,
  onSelectRoute,
  onTestServer,
  routes,
  selectedRoute,
  serverProbeBusy,
  serverProbeSteps,
  sessionActive,
  staleTunnelOnly,
  testerProfile,
}: RouteSelectPageProps) {
  const [userLocation, setUserLocation] = useState(
    () => formatProfileLocation(testerProfile) || "Detecting location...",
  );
  const routeCards = useMemo(() => makeRouteCards(routes), [routes]);

  useEffect(() => {
    let cancelled = false;
    void resolveUserLocationLabel(testerProfile).then((label) => {
      if (!cancelled) setUserLocation(label);
    });
    return () => {
      cancelled = true;
    };
  }, [testerProfile.country_city, testerProfile.state_country]);

  const autoSnapshot = useMemo(() => loadAutoRouteSnapshot(), [autoRouteState]);
  const recommendedId = useMemo(
    () =>
      recommendRouteId(
        userLocation,
        routeCards.map((route) => route.id),
        autoSnapshot?.recommended_route_id,
        routeCards.filter((route) => route.available).map((route) => route.id),
      ),
    [autoSnapshot?.recommended_route_id, routeCards, userLocation],
  );
  const recommended =
    routeCards.find((route) => route.id === recommendedId) ??
    routeCards.find((route) => route.available) ??
    routeCards[0];

  const appliedRecommendationRef = useRef(false);
  useEffect(() => {
    if (appliedRecommendationRef.current) return;
    if (userLocation === "Detecting location...") return;
    if (sessionActive || staleTunnelOnly) return;
    onSelectRoute(recommendedId);
    appliedRecommendationRef.current = true;
  }, [onSelectRoute, recommendedId, sessionActive, staleTunnelOnly, userLocation]);

  const selected = routeCards.find((route) => route.id === selectedRoute) ?? recommended;
  const busyOptimizing = busy || autoRouteBusy || serverProbeBusy;
  const optimizeDisabled =
    busyOptimizing ||
    sessionActive ||
    staleTunnelOnly ||
    !selected ||
    selected.available === false;
  const testDisabled = busyOptimizing || sessionActive || staleTunnelOnly || !selected;

  return (
    <main className="routing-main routing-picker-main">
      <header className="routing-picker-header">
        <div>
          <div className="routing-title-row">
            <h1>Routing</h1>
            <span className="fortnite-pill">
              <img src="/games/fortnite.jpg" alt="" />
              Fortnite
            </span>
          </div>
          <p>Choose the best RouteLag server for Fortnite.</p>
        </div>
      </header>

      {sessionActive && (
        <button type="button" className="routing-session-banner" onClick={onOpenSession}>
          <span className="routing-status-dot" />
          RouteLag is connected from your last session — view live stats
        </button>
      )}

      {staleTunnelOnly && (
        <div className="routing-stale-tunnel-banner">
          <span>
            RouteLag tunnel is still connected, but no active session was found. Use Restore
            Internet before starting again.
          </span>
          <button type="button" onClick={onRestoreInternet}>
            Restore Internet
          </button>
        </div>
      )}

      <div className="routing-picker-layout">
        {autoRouteBusy && (
          <div className="routing-auto-overlay">
            <div className="routing-auto-modal">
              <div className="routing-loading-ring" />
              <strong>
                {autoRouteState === "probing" ? "Testing routes" : "Finding best route"}
              </strong>
              <p>Checking RouteLag servers for Fortnite. This takes a few seconds.</p>
            </div>
          </div>
        )}

        {serverProbeBusy && (
          <div className="routing-auto-overlay">
            <div className="routing-auto-modal routing-probe-modal">
              <div className="routing-loading-ring" />
              <strong>Testing WireGuard server</strong>
              <p>Connecting briefly to verify the server and tunnel, then cleaning up.</p>
              {serverProbeSteps && (
                <ol className="routing-probe-steps">
                  {serverProbeSteps.map((step) => (
                    <ProbeStepRow
                      key={step.id}
                      label={step.label}
                      status={step.status}
                      detail={step.detail}
                    />
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}

        <section className="routing-picker-panel routing-server-panel">
          <div className="routing-panel-heading">
            <h2>Servers</h2>
            <p>Select the best server for your connection.</p>
          </div>

          <div className="routing-card-list">
            <button
              type="button"
              className="routing-server-card routing-auto-card-v2"
              onClick={onAutoRoute}
              disabled={busyOptimizing}
            >
              <span className="routing-server-icon routing-auto-icon">
                <SparkIcon />
              </span>
              <span className="routing-server-copy">
                <strong>Auto</strong>
                <small>Recommended</small>
                <em>Let RouteLag choose the best server.</em>
              </span>
              <span className="routing-recommended-chip">Best</span>
            </button>

            {routeCards.map((route) => (
              <button
                type="button"
                key={route.id}
                className={`routing-server-card ${route.id === selected.id ? "selected" : ""}`}
                onClick={() => onSelectRoute(route.id)}
                disabled={route.available === false}
              >
                <CountryFlag code={route.flag} />
                <span className="routing-server-copy">
                  <strong>
                    {route.city}
                    {route.id === recommendedId ? (
                      <span className="routing-recommended-badge">Recommended</span>
                    ) : null}
                  </strong>
                  <small>{route.countryName}</small>
                  <em>
                    <span className="routing-status-dot" />
                    {route.available === false ? "Unavailable" : "Online"}
                    {route.pingLabel ? ` · ${route.pingLabel}` : ""}
                  </em>
                </span>
                <span
                  className={`routing-radio ${route.id === selected.id ? "selected" : ""}`}
                  aria-hidden="true"
                >
                  {route.id === selected.id && <CheckIcon />}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="routing-picker-panel routing-diagram-panel">
          <div className="routing-panel-heading">
            <h2>Route Diagram</h2>
            <p>Optimized route for Fortnite.</p>
          </div>

          <div className="route-diagram">
            <RouteNode icon={<UserIcon />} label="You" meta={userLocation} />
            <RouteLine />
            <RouteNode
              active
              badge={selected.id === recommendedId ? "Recommended" : undefined}
              icon={<ServerIcon />}
              label={selected.city}
              meta={selected.countryName}
            />
            <RouteLine />
            <RouteNode
              image="/games/fortnite.jpg"
              icon={<FortniteIcon />}
              label="Fortnite"
              meta={fortniteRegionLabel(selected.id, selected.gameRegion)}
            />
          </div>

          <div className="routing-diagram-summary">
            <span>Path</span>
            <strong>You &rarr; {selected.city} &rarr; Fortnite</strong>
            <small>
              {sessionActive
                ? "Connected — open live session for stats"
                : "Pick a server, then press Start Optimization"}
            </small>
          </div>

          {serverProbeSteps && !serverProbeBusy && (
            <section className="routing-probe-results">
              <div className="routing-panel-heading">
                <h2>Server Test Results</h2>
                <p>Latest WireGuard probe for {selected.city}.</p>
              </div>
              <ol className="routing-probe-steps">
                {serverProbeSteps.map((step) => (
                  <ProbeStepRow
                    key={step.id}
                    label={step.label}
                    status={step.status}
                    detail={step.detail}
                  />
                ))}
              </ol>
            </section>
          )}

          <div className="routing-diagram-actions">
            <button
              type="button"
              className="routing-start-button"
              onClick={sessionActive ? onOpenSession : onOptimize}
              disabled={sessionActive ? false : optimizeDisabled}
            >
              <BoltIcon />
              {sessionActive ? "View Live Session" : "Start Optimization"}
            </button>
            <button
              type="button"
              className="routing-test-button"
              onClick={onTestServer}
              disabled={testDisabled}
            >
              <WrenchIcon />
              {serverProbeBusy ? "Testing Server" : "Test WireGuard Server"}
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
      </div>
    </main>
  );
}

interface RouteCard {
  available?: boolean;
  city: string;
  countryName: string;
  flag: string;
  gameRegion?: string;
  gameTargetIp?: string;
  id: string;
  ping: string;
  pingLabel: string;
}

function makeRouteCards(routes: RouteOption[]): RouteCard[] {
  const catalogRoutes = mergeRouteOptions(routes);
  const apiRoutes = catalogRoutes
    .map((route) => {
      const city = normalizeCity(route.city || route.name || route.label, route.id);
      return {
        available: route.available,
        city,
        countryName: countryName(route.country, route.region, city, route.id, route.meta),
        flag: routeFlag(route.country, city, route.id),
        gameRegion: route.gameRegion,
        gameTargetIp: route.gameTargetIp,
        id: route.id,
        ping: route.ping,
        pingLabel: cleanPing(route.ping),
      };
    })
    .filter((route) => preferredOrder.includes(routeCityKey(route.city, route.id)))
    .sort(
      (a, b) =>
        preferredOrder.indexOf(routeCityKey(a.city, a.id)) -
        preferredOrder.indexOf(routeCityKey(b.city, b.id)),
    );

  return defaultRoutes.map((fallback) => {
    const match = apiRoutes.find((route) => route.id === fallback.id);
    const merged = match ? { ...fallback, ...match } : fallback;
    return {
      ...merged,
      city: normalizeCity(merged.city, merged.id),
      countryName: countryName(
        undefined,
        undefined,
        merged.city,
        merged.id,
        merged.countryName,
      ),
      available: merged.available,
    };
  });
}

function routeCityKey(city: string, id: string) {
  if (id === "dallas-beta") return "dallas";
  return city.toLowerCase();
}

function normalizeCity(value: string, id?: string) {
  if (id === "dallas-beta") return "Dallas Beta";
  const lower = value.toLowerCase();
  if (lower.includes("johannesburg")) return "Johannesburg Beta";
  if (lower.includes("dallas")) return "Dallas Beta";
  return value.replace(/\s+beta$/i, "");
}

function countryName(
  country: string | undefined,
  region: string | undefined,
  city: string,
  id?: string,
  _meta?: string,
) {
  if (id === "dallas-beta" || city === "Dallas Beta") {
    return "United States";
  }
  if (city === "Johannesburg Beta" || city === "Johannesburg") return "South Africa";
  switch (country) {
    case "ZA":
      return "South Africa";
    case "US":
      return "United States";
    default:
      return region || country || "RouteLag";
  }
}

function routeFlag(country: string | undefined, city: string, id?: string) {
  if (id === "dallas-beta" || city === "Dallas Beta" || country === "US") return "US";
  if (city === "Johannesburg Beta" || city === "Johannesburg" || country === "ZA") return "ZA";
  return "RL";
}

function cleanPing(ping: string) {
  if (!ping || ping === "API" || ping === "Test" || ping === "Soon") return "";
  return ping;
}

function ProbeStepRow({
  detail,
  label,
  status,
}: {
  detail?: string;
  label: string;
  status: WireGuardProbeStep["status"];
}) {
  return (
    <li className={`routing-probe-step ${status}`}>
      <span className="routing-probe-step-icon" aria-hidden="true">
        {status === "pass" ? "✓" : status === "fail" ? "!" : status === "running" ? "…" : "·"}
      </span>
      <span className="routing-probe-step-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </li>
  );
}

function RouteNode({
  active,
  badge,
  icon,
  image,
  label,
  meta,
}: {
  active?: boolean;
  badge?: string;
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
      {badge && <em>{badge}</em>}
      <strong>{label}</strong>
      <small>{meta}</small>
    </div>
  );
}

function CountryFlag({ code }: { code: string }) {
  const normalized = code.toUpperCase();
  if (normalized === "US") {
    return (
      <span className="routing-server-flag routing-flag-us" aria-hidden="true">
        <img src="/flags/us.png" alt="" />
      </span>
    );
  }

  return (
    <span
      className={`routing-server-flag routing-flag-${code.toLowerCase()}`}
      aria-hidden="true"
    >
      <span />
    </span>
  );
}

function RouteLine() {
  return (
    <div className="route-line" aria-hidden="true">
      <span className="route-line-bar" />
    </div>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />
      <path d="m5 16 .8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="m7 12 3 3 7-7" />
    </svg>
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

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-3.3-3.3 2.1-2.1Z" />
    </svg>
  );
}
