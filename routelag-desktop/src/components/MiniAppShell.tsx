import type { ReactNode } from "react";

import type { MiniView } from "../App";
import { DragHeader, type SessionStripProps } from "./DragHeader";

interface MiniAppShellProps {
  children: ReactNode;
  footer?: ReactNode;
  currentView?: MiniView;
  onNavigate?: (view: MiniView) => void;
  sessionStrip?: SessionStripProps | null;
}

export function MiniAppShell({
  children,
  footer,
  currentView,
  onNavigate,
  sessionStrip,
}: MiniAppShellProps) {
  return (
    <main className="app-root">
      <section className="route-card">
        <DragHeader
          currentView={currentView}
          onNavigate={onNavigate}
          sessionStrip={sessionStrip}
        />
        <div className="route-card-content">
          <div className="mini-screen">{children}</div>
          {footer}
        </div>
      </section>
    </main>
  );
}
