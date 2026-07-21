import { useEffect, useMemo, useRef, useState } from "react";

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
import type { AutoRouteState, TesterProfile } from "../types";
import { SessionIntegrityBanner } from "../components/SessionIntegrityBanner";

interface RouteSelectPageProps {
  autoRouteBusy: boolean;
  autoRouteState: AutoRouteState;
  busy: boolean;
  onAutoRoute: () => void;
  onOptimize: () => void;
  onOpenSession: () => void;
  onRestoreInternet: () => void;
  onSelectRoute: (routeId: string) => void;
  routes: RouteOption[];
  selectedRoute: string;
  sessionActive: boolean;
  staleTunnelOnly: boolean;
  testerProfile: TesterProfile;
}

const preferredOrder = ["johannesburg", "dallas", "ashburn"];

const defaultRoutes: RouteCard[] = IS_BETA_DALLAS
  ? [
      {
        available: false,
        city: "Dallas",
        countryName: "United States",
        flag: "US",
        id: "dallas-beta",
        ping: "",
        pingLabel: "",
      },
      {
        available: false,
        city: "Ashburn",
        countryName: "United States",
        flag: "US",
        id: "ashburn-beta",
        ping: "",
        pingLabel: "",
      },
    ]
  : [
      {
        available: false,
        city: "Johannesburg",
        countryName: "South Africa",
        flag: "ZA",
        id: "johannesburg-beta",
        ping: "",
        pingLabel: "",
      },
      {
        available: false,
        city: "Dallas",
        countryName: "United States",
        flag: "US",
        id: "dallas-beta",
        ping: "",
        pingLabel: "",
      },
      {
        available: false,
        city: "Ashburn",
        countryName: "United States",
        flag: "US",
        id: "ashburn-beta",
        ping: "",
        pingLabel: "",
      },
    ];

export function RouteSelectPage({
  autoRouteBusy,
  autoRouteState,
  busy,
  onAutoRoute,
  onOptimize,
  onOpenSession,
  onRestoreInternet,
  onSelectRoute,
  routes,
  selectedRoute,
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
    if (!recommendedId) return;
    onSelectRoute(recommendedId);
    appliedRecommendationRef.current = true;
  }, [onSelectRoute, recommendedId, sessionActive, staleTunnelOnly, userLocation]);

  useEffect(() => {
    if (!routeCards.length) return;
    if (routeCards.some((route) => route.id === selectedRoute)) return;
    const next = recommended?.id ?? routeCards[0]?.id;
    if (next) onSelectRoute(next);
  }, [onSelectRoute, recommended?.id, routeCards, selectedRoute]);

  const selected = routeCards.find((route) => route.id === selectedRoute) ?? recommended;
  const busyOptimizing = busy || autoRouteBusy;
  const optimizeDisabled =
    busyOptimizing ||
    sessionActive ||
    staleTunnelOnly ||
    !selected ||
    selected.available === false;

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
          <p>Choose the best Zer0 server for Fortnite.</p>
        </div>
      </header>

      {sessionActive && (
        <button type="button" className="routing-session-banner" onClick={onOpenSession}>
          <span className="routing-status-dot" />
          Zer0 is connected from your last session — view live stats
        </button>
      )}

      <SessionIntegrityBanner />

      {staleTunnelOnly && (
        <div className="routing-stale-tunnel-banner">
          <span>
            Zer0 tunnel is still connected, but no active session was found. Use Restore
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
              <p>Checking Zer0 servers for Fortnite. This takes a few seconds.</p>
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
              disabled={busyOptimizing || routeCards.length === 0}
            >
              <span className="routing-server-icon routing-auto-icon">
                <SparkIcon />
              </span>
              <span className="routing-server-copy">
                <strong>Auto</strong>
                <small>Recommended</small>
                <em>Let Zer0 choose the best server.</em>
              </span>
              <span className="routing-recommended-chip">Best</span>
            </button>

            {routeCards.map((route) => (
              <button
                type="button"
                key={route.id}
                className={`routing-server-card ${route.id === selected?.id ? "selected" : ""}`}
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
                  className={`routing-radio ${route.id === selected?.id ? "selected" : ""}`}
                  aria-hidden="true"
                >
                  {route.id === selected?.id && <CheckIcon />}
                </span>
              </button>
            ))}

            {!routeCards.length && (
              <div className="routing-empty-state">
                <strong>No servers available</strong>
                <p>Check your connection and try refreshing routes.</p>
              </div>
            )}
          </div>
        </section>

        <section className="routing-picker-panel routing-diagram-panel">
          <div className="routing-panel-heading">
            <h2>Route Diagram</h2>
            <p>Full-session tunnel for Fortnite (temporary integrity mode).</p>
          </div>

          {selected ? (
            <>
              <div className="route-diagram">
                <div className="route-diagram-rail">
                  <span className="route-node-icon">
                    <UserIcon />
                  </span>
                  <span className="route-connector" aria-hidden="true" />
                  <span className="route-node-icon active">
                    <ServerIcon />
                  </span>
                  <span className="route-connector" aria-hidden="true" />
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
                    {selected.id === recommendedId ? (
                      <em className="route-caption-badge">Recommended</em>
                    ) : (
                      <span className="route-caption-spacer" aria-hidden="true" />
                    )}
                    <strong>{selected.city}</strong>
                    <small>{selected.countryName}</small>
                  </div>
                  <div className="route-caption">
                    <strong>Fortnite</strong>
                    <small>{fortniteRegionLabel(selected.id, selected.gameRegion)}</small>
                  </div>
                </div>
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
            </>
          ) : (
            <div className="routing-empty-state routing-empty-state-panel">
              <strong>No route selected</strong>
              <p>Choose a server on the left to preview the optimized path.</p>
            </div>
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
  if (id === "ashburn-beta" || id === "virginia-beta") return "ashburn";
  if (id === "johannesburg-beta") return "johannesburg";
  return city.toLowerCase().replace(/\s+beta$/i, "");
}

function normalizeCity(value: string, id?: string) {
  if (id === "dallas-beta") return "Dallas";
  if (id === "ashburn-beta" || id === "virginia-beta") return "Ashburn";
  if (id === "johannesburg-beta") return "Johannesburg";
  const lower = value.toLowerCase();
  if (lower.includes("johannesburg")) return "Johannesburg";
  if (lower.includes("dallas")) return "Dallas";
  if (lower.includes("ashburn") || lower.includes("virginia")) return "Ashburn";
  return value.replace(/\s+beta$/i, "").trim();
}

function countryName(
  country: string | undefined,
  region: string | undefined,
  city: string,
  id?: string,
  _meta?: string,
) {
  if (id === "dallas-beta" || city === "Dallas" || city === "Dallas Beta") {
    return "United States";
  }
  if (
    id === "ashburn-beta" ||
    id === "virginia-beta" ||
    city === "Ashburn" ||
    city === "Ashburn Beta"
  ) {
    return "United States";
  }
  if (city === "Johannesburg Beta" || city === "Johannesburg") return "South Africa";
  switch (country) {
    case "ZA":
      return "South Africa";
    case "US":
      return "United States";
    default:
      return region || country || "Zer0";
  }
}

function routeFlag(country: string | undefined, city: string, id?: string) {
  if (
    id === "dallas-beta" ||
    id === "ashburn-beta" ||
    id === "virginia-beta" ||
    city === "Dallas" ||
    city === "Ashburn" ||
    city === "Dallas Beta" ||
    city === "Ashburn Beta" ||
    country === "US"
  ) {
    return "US";
  }
  if (city === "Johannesburg Beta" || city === "Johannesburg" || country === "ZA") return "ZA";
  return "RL";
}

function cleanPing(ping: string) {
  if (!ping || ping === "API" || ping === "Test" || ping === "Soon") return "";
  return ping;
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

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" />
    </svg>
  );
}
