import type { RouteOption } from "../App";

interface ServerRowProps {
  route: RouteOption;
  selected: boolean;
  onSelect: (routeId: string) => void;
}

export function ServerRow({ onSelect, route, selected }: ServerRowProps) {
  const disabled = route.available === false;

  return (
    <button
      type="button"
      className={`server-row ${selected ? "selected" : ""}`}
      onClick={() => onSelect(route.id)}
      disabled={disabled}
    >
      <img className="server-flag" src="/sa-flag.webp" alt="" />
      <span className="server-copy">
        <strong>{route.label}</strong>
        <small>{disabled ? "Coming Soon" : route.ip}</small>
      </span>
      <span className="server-ping">
        <strong>{disabled ? "Soon" : route.ping}</strong>
      </span>
    </button>
  );
}
