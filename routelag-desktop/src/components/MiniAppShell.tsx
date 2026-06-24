import type { ReactNode } from "react";

import { DragHeader } from "./DragHeader";

interface MiniAppShellProps {
  children: ReactNode;
  onSettings: () => void;
}

export function MiniAppShell({ children, onSettings }: MiniAppShellProps) {
  return (
    <main className="app-root">
      <section className="route-card">
        <DragHeader onSettings={onSettings} />
        <div className="route-card-content">{children}</div>
      </section>
    </main>
  );
}
