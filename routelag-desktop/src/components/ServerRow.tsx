import type { RouteOption } from "../App";

interface ServerRowProps {
  route: RouteOption;
  selected: boolean;
  onSelect: (routeId: string) => void;
}

export function ServerRow({ onSelect, route, selected }: ServerRowProps) {
  const disabled = route.available === false;
  const location = routeSubtitle(route);
  const status = statusLabel(route.status, route.available);
  const ping = formatPing(route.ping);

  return (
    <button
      type="button"
      className={`server-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(route.id)}
      disabled={disabled}
    >
      <span className="server-region-code">{route.country ?? route.region ?? "RL"}</span>
      <span className="server-copy">
        <strong>
          {route.label}
          {route.recommended && !disabled && (
            <span className="routing-recommended-badge">Recommended</span>
          )}
        </strong>
        <small>{location}</small>
        <div className="server-row-details">
          <span>
            Status: <em className="routing-mono">{status}</em>
          </span>
          <span>
            Estimated ping: <em className="routing-mono">{ping}</em>
          </span>
          <span>
            Route type: <em className="routing-mono">Single server</em>
          </span>
        </div>
      </span>
    </button>
  );
}

function routeSubtitle(route: RouteOption) {
  if (route.meta) return route.meta;
  const location = [route.city, route.country].filter(Boolean).join(", ");
  return location || "RouteLag beta server";
}

function statusLabel(status?: string, available?: boolean) {
  if (available === false) {
    if (status === "maintenance") return "Maintenance";
    return "Coming soon";
  }
  if (status === "maintenance") return "Maintenance";
  if (status === "online" || available) return "Online";
  return "Online";
}

function formatPing(ping?: string) {
  if (!ping || ping === "API" || ping === "Test") return "--";
  return ping;
}
