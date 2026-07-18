import {
  BarChart3,
  Clapperboard,
  LayoutDashboard,
  MonitorUp,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { MiniView } from "../App";
import { HUD_ENABLED, REPLAY_ENABLED } from "../lib/featureFlags";

export type AppNavItem =
  | "dashboard"
  | "routing"
  | "hud"
  | "replays"
  | "analytics"
  | "settings";

interface AppSidebarProps {
  active: AppNavItem;
  onNavigate: (view: MiniView) => void;
  profileImageUrl?: string | null;
  pingLabel?: string;
}

const NAV_ITEMS: {
  id: AppNavItem;
  label: string;
  view: MiniView;
  icon: LucideIcon;
  disabled?: boolean;
  disabledHint?: string;
}[] = [
  { id: "dashboard", label: "Dashboard", view: "games", icon: LayoutDashboard },
  { id: "routing", label: "Routing", view: "routes", icon: Route },
  {
    id: "hud",
    label: "HUD",
    view: "hud",
    icon: MonitorUp,
    disabled: !HUD_ENABLED,
    disabledHint: "HUD coming soon",
  },
  {
    id: "replays",
    label: "Replays",
    view: "replays",
    icon: Clapperboard,
    disabled: !REPLAY_ENABLED,
    disabledHint: "Replay Engine coming soon",
  },
  { id: "analytics", label: "Analytics", view: "stats", icon: BarChart3 },
];

const BOTTOM_NAV_ITEMS: { id: AppNavItem; label: string; view: MiniView; icon: LucideIcon }[] = [
  { id: "settings", label: "Settings", view: "settings", icon: Settings },
];

export function AppSidebar({
  active,
  onNavigate,
  pingLabel = "--",
}: AppSidebarProps) {
  return (
    <aside className="home-nav" aria-label="Zer0 navigation">
      <button
        type="button"
        className="home-nav-brand"
        aria-label="Open Zer0 dashboard"
        data-tooltip="Zer0 home"
        onClick={() => onNavigate("games")}
      >
        <span className="home-nav-brand-mark">
          <img src="/routelag-logo.png" alt="" />
        </span>
      </button>

      <div className="home-nav-main">
        {NAV_ITEMS.map((item) => (
          <SidebarButton
            key={item.id}
            active={active === item.id}
            disabled={item.disabled}
            icon={item.icon}
            label={item.disabled ? item.disabledHint ?? `${item.label} unavailable` : item.label}
            onClick={() => {
              if (!item.disabled) onNavigate(item.view);
            }}
          />
        ))}
      </div>

      <div className="home-nav-bottom">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <SidebarButton
            key={item.id}
            active={active === item.id}
            icon={item.icon}
            label={item.label}
            onClick={() => onNavigate(item.view)}
          />
        ))}

        <div className="nav-ping" aria-label={`System ping ${pingLabel} milliseconds`}>
          <strong>{pingLabel}</strong>
          <span>ms</span>
        </div>
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  disabled = false,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      data-tooltip={label}
      className={`${active ? "active" : ""}${disabled ? " is-disabled" : ""}`.trim()}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
