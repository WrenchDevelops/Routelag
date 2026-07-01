import type { RouteOption } from "../App";
import { GlowButton } from "../components/GlowButton";
import { ServerRow } from "../components/ServerRow";

interface RouteSelectPageProps {
  busy: boolean;
  autoRouteBusy: boolean;
  onBack: () => void;
  routes: RouteOption[];
  selectedRoute: string;
  onOptimize: () => void;
  onAutoRoute: () => void;
  onSelectRoute: (routeId: string) => void;
}

export function RouteSelectPage({
  busy,
  autoRouteBusy,
  onBack,
  onOptimize,
  onAutoRoute,
  onSelectRoute,
  routes,
  selectedRoute,
}: RouteSelectPageProps) {
  const selected = routes.find((route) => route.id === selectedRoute);
  const optimizeDisabled = busy || autoRouteBusy || !selected || selected.available === false;
  const autoRouteDisabled = busy || autoRouteBusy;

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
        <h1>Routelag</h1>
        <h2>South Africa Middle East Beta Test</h2>
        <p>Private Fortnite route comparison. Results vary by ISP and route.</p>
      </div>

      <section className="beta-checklist">
        <strong>Test flow</strong>
        <ol>
          <li>Set Fortnite matchmaking region to Middle East.</li>
          <li>Optionally click Auto Route to find the best server automatically.</li>
          <li>Play one match with RouteLag OFF and screenshot ping/loss.</li>
          <li>Test each beta route, clicking End Optimization between routes.</li>
          <li>Export the RouteLag report ZIP after the final route.</li>
        </ol>
      </section>

      <div className="server-list">
        {routes.map((route) => (
          <ServerRow
            key={route.id}
            route={route}
            selected={selectedRoute === route.id}
            onSelect={onSelectRoute}
          />
        ))}
      </div>

      <button
        type="button"
        className="auto-route-find-btn"
        onClick={onAutoRoute}
        disabled={autoRouteDisabled}
      >
        {autoRouteBusy ? "Testing routes…" : "Auto Route — Find best route"}
      </button>

      <GlowButton onClick={onOptimize} disabled={optimizeDisabled}>
        {busy ? "Optimizing..." : selected?.available === false ? "Server unavailable" : "Optimize"}
      </GlowButton>
    </div>
  );
}
