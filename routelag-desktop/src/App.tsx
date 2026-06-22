import { useState } from "react";

import { Sidebar } from "./components/Sidebar";
import { ToastProvider } from "./components/Toast";
import { ConnectPage } from "./pages/Connect";
import { DiagnosticsPage } from "./pages/Diagnostics";
import { LogsPage } from "./pages/Logs";
import { RouteTestPage } from "./pages/RouteTest";
import { SettingsPage } from "./pages/Settings";
import type { PageId } from "./types";
import { BETA_DISCLAIMER } from "./types";

function AppContent() {
  const [page, setPage] = useState<PageId>("connect");

  return (
    <div className="flex h-full bg-bg">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-6">
        <div className="flex min-h-0 flex-1 flex-col gap-6">
          {page === "connect" && <ConnectPage />}
          {page === "route-test" && <RouteTestPage />}
          {page === "diagnostics" && <DiagnosticsPage />}
          {page === "settings" && <SettingsPage />}
          {page === "logs" && <LogsPage />}
        </div>
        <p className="mt-6 shrink-0 border-t border-border pt-4 text-xs leading-relaxed text-muted">
          {BETA_DISCLAIMER}
        </p>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
