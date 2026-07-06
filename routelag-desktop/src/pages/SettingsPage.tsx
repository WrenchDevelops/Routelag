import { useEffect, useState } from "react";

import { api } from "../api";
import { useToast } from "../components/Toast";
import {
  applyAppPreferences,
  defaultPreferences,
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
} from "../lib/appPreferences";

export function SettingsPage() {
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const [version, setVersion] = useState("...");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    applyAppPreferences(preferences);
    saveAppPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    void api
      .getAppVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  const updatePreference = <Key extends keyof AppPreferences>(
    key: Key,
    value: AppPreferences[Key],
  ) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const resetPreferences = () => {
    setPreferences(defaultPreferences);
    showToast("Settings reset to defaults.", "info");
  };

  const clearCache = () => {
    window.sessionStorage.clear();
    showToast("App cache cleared.", "success");
  };

  const clearLogs = async () => {
    setBusy("logs");
    try {
      await api.clearLogs();
      showToast("Logs cleared.", "success");
    } catch (error) {
      showToast(`Could not clear logs: ${String(error)}`, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="app-settings-view">
      <header className="app-settings-header">
        <div>
          <h1>Settings</h1>
          <p>Control how RouteLag behaves on this PC.</p>
        </div>
        <button type="button" onClick={resetPreferences}>
          Reset to default
        </button>
      </header>

      <main className="app-settings-grid">
        <SettingsCard title="Behavior">
          <ToggleSetting
            label="Open to last used page"
            checked={preferences.openLastPage}
            onChange={(openLastPage) => updatePreference("openLastPage", openLastPage)}
          />
          <ToggleSetting
            label="Check RouteLag Engine on launch"
            checked={preferences.checkEngineOnLaunch}
            onChange={(checkEngineOnLaunch) =>
              updatePreference("checkEngineOnLaunch", checkEngineOnLaunch)
            }
          />
          <ToggleSetting
            label="Confirm before closing while optimized"
            checked={preferences.confirmCloseOptimized}
            onChange={(confirmCloseOptimized) =>
              updatePreference("confirmCloseOptimized", confirmCloseOptimized)
            }
          />
          <ToggleSetting
            label="Reduce animations"
            checked={preferences.reduceAnimations}
            onChange={(reduceAnimations) =>
              updatePreference("reduceAnimations", reduceAnimations)
            }
          />
        </SettingsCard>

        <SettingsCard title="App Data">
          <div className="app-settings-button-row">
            <button type="button" onClick={clearCache}>
              Clear Cache
            </button>
            <button type="button" disabled={busy === "logs"} onClick={() => void clearLogs()}>
              {busy === "logs" ? "Clearing..." : "Clear Logs"}
            </button>
            <button type="button" onClick={resetPreferences}>
              Reset Settings
            </button>
          </div>
          <p className="app-settings-warning">
            This only affects local RouteLag settings and logs. It does not change your
            subscription, Fortnite data, or saved reports.
          </p>
        </SettingsCard>

        <SettingsCard title="About">
          <StatusRow label="Current Version" value={version} />
          <StatusRow label="Update Status" value="You're up to date" />
        </SettingsCard>
      </main>
    </div>
  );
}

function SettingsCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="app-settings-card">
      <h2>{title}</h2>
      <div className="app-settings-card-body">{children}</div>
    </section>
  );
}

function ToggleSetting({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="app-settings-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="app-settings-toggle" aria-hidden="true" />
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-settings-status-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
