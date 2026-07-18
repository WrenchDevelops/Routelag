import { useCallback, useEffect, useState } from "react";

import { api } from "../api";
import { LogsPanel } from "../components/LogsPanel";
import { useToast } from "../components/Toast";

export function LogsPage() {
  const { showToast } = useToast();
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await api.readLogs());
    } catch (e) {
      setLogs(`Failed to load logs: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs);
      showToast("Logs copied to clipboard.", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Logs</h1>
        <p className="mt-1 text-sm text-muted">
          Connection events, command errors, and Zer0 Service status.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <LogsPanel logs={logs} onCopy={() => void handleCopy()} loading={loading} />
      </div>
    </div>
  );
}
