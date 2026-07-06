import type { ReactNode } from "react";

import { DragHeader } from "./DragHeader";

interface MiniAppShellProps {
  children: ReactNode;
  footer?: ReactNode;
  onSettings?: () => void;
}

export function MiniAppShell({
  children,
  footer,
  onSettings,
}: MiniAppShellProps) {
  return (
    <main className="app-root">
      <section className="route-card">
        <DragHeader onSettings={onSettings} />
        <div className="route-card-content">
          <div className="mini-screen">{children}</div>
          {footer}
        </div>
      </section>
    </main>
  );
}
