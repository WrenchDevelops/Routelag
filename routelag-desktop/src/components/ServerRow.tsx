import type { RouteOption } from "../App";

interface ServerRowProps {
  route: RouteOption;
  selected: boolean;
  onSelect: (routeId: string) => void;
}

export function ServerRow({ onSelect, route, selected }: ServerRowProps) {
  const disabled = route.available === false;
  const location = [route.city, route.country].filter(Boolean).join(", ");
  const detail = disabled
    ? statusLabel(route.status)
    : route.meta || route.ip || "Ready for beta testing";

  return (
    <button
      type="button"
      className={`server-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(route.id)}
      disabled={disabled}
    >
      <span className="server-region-code">{route.country ?? route.region ?? "RL"}</span>
      <span className="server-copy">
        <strong>{route.label}</strong>
        <small>{location || detail}</small>
        {detail && <em>{detail}</em>}
      </span>
      <span className="server-ping">
        <strong>{route.ping}</strong>
        {route.recommended && <small>Beta pick</small>}
      </span>
    </button>
  );
}

function statusLabel(status?: string) {
  if (status === "maintenance") return "Maintenance";
  if (status === "online") return "Online";
  return "Coming soon";
}
