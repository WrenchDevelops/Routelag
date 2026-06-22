import type { PageId } from "../types";

const items: { id: PageId; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "route-test", label: "Route Test" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "settings", label: "Settings" },
  { id: "logs", label: "Logs" },
];

interface SidebarProps {
  active: PageId;
  onNavigate: (page: PageId) => void;
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-card/50 p-4">
      <div className="mb-8">
        <p className="text-lg font-semibold text-white">RouteLag</p>
        <p className="text-xs text-accent">Beta</p>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              active === item.id
                ? "bg-accent/20 text-white"
                : "text-muted hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <p className="mt-auto pt-6 text-xs text-muted">RouteLag Beta</p>
    </aside>
  );
}
