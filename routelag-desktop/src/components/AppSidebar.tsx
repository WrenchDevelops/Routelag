import {
  CircleHelp,
  Clapperboard,
  LayoutDashboard,
  MonitorUp,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";

import defaultAvatar from "../assets/default-avatar.svg";
import type { MiniView } from "../App";

export type AppNavItem =
  | "dashboard"
  | "routing"
  | "hud"
  | "replays"
  | "profile"
  | "help"
  | "settings";

interface AppSidebarProps {
  active: AppNavItem;
  onNavigate: (view: MiniView) => void;
  profileImageUrl?: string | null;
}

const NAV_ITEMS: { id: AppNavItem; label: string; view: MiniView; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", view: "games", icon: LayoutDashboard },
  { id: "routing", label: "Routing", view: "routes", icon: Route },
  { id: "hud", label: "HUD", view: "hud", icon: MonitorUp },
  { id: "replays", label: "Replays", view: "replays", icon: Clapperboard },
];

const BOTTOM_NAV_ITEMS: { id: AppNavItem; label: string; view: MiniView; icon: LucideIcon }[] = [
  { id: "help", label: "Help", view: "help", icon: CircleHelp },
  { id: "settings", label: "Settings", view: "settings", icon: Settings },
];

export function AppSidebar({
  active,
  onNavigate,
  profileImageUrl = null,
}: AppSidebarProps) {
  return (
    <aside className="home-nav" aria-label="RouteLag navigation">
      <div className="home-nav-main">
        {NAV_ITEMS.map((item) => (
          <SidebarButton
            key={item.id}
            active={active === item.id}
            icon={item.icon}
            label={item.label}
            onClick={() => onNavigate(item.view)}
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

        <ProfileNavButton
          active={active === "profile"}
          imageUrl={profileImageUrl}
          onClick={() => onNavigate("profile")}
        />
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={active ? "active" : ""}
      onClick={onClick}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

function ProfileNavButton({
  active,
  imageUrl,
  onClick,
}: {
  active: boolean;
  imageUrl?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Profile"
      title="Profile"
      className={`nav-profile-button${active ? " active" : ""}`}
      onClick={onClick}
    >
      <img src={imageUrl || defaultAvatar} alt="" />
    </button>
  );
}
