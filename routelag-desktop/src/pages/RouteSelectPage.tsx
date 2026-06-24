import type { RouteOption } from "../App";
import { GlowButton } from "../components/GlowButton";
import { ServerRow } from "../components/ServerRow";

interface RouteSelectPageProps {
  busy: boolean;
  onBack: () => void;
  routes: RouteOption[];
  selectedRoute: string;
  onOptimize: () => void;
  onSelectRoute: (routeId: string) => void;
}

export function RouteSelectPage({
  busy,
  onBack,
  onOptimize,
  onSelectRoute,
  routes,
  selectedRoute,
}: RouteSelectPageProps) {
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
        <h2>Choose the Best Route</h2>
        <p>Optimizing your ping to a game server</p>
      </div>

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

      <GlowButton onClick={onOptimize} disabled={busy}>
        {busy ? "Optimizing..." : "Optimize"}
      </GlowButton>
    </div>
  );
}
