import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react";

import { api } from "../api";
import { useToast } from "../components/Toast";
import { LegalLinks } from "../components/LegalLinks";
import {
  applyAppPreferences,
  defaultPreferences,
  loadAppPreferences,
  saveAppPreferences,
  type AppPreferences,
} from "../lib/appPreferences";
import { pullAndApplyCloudPreferences, pushCloudPreferences } from "../lib/cloudUserSync";
import { ensurePathGenSession } from "../lib/api";
import { LEGAL_DOCUMENT_VERSION } from "../lib/legalConsent";

export function SettingsPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());
  const [version, setVersion] = useState("...");
  const [busy, setBusy] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      applyAppPreferences(preferences);
      return;
    }
    const saved = saveAppPreferences(preferences);
    void pushCloudPreferences(saved).catch(() => undefined);
  }, [preferences, hydrated]);

  useEffect(() => {
    void api
      .getAppVersion()
      .then(setVersion)
      .catch(() => setVersion("unknown"));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await ensurePathGenSession({
          clerkUserId: user?.id,
          clerkEmail:
            user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress,
          getClerkToken: () => getToken(),
        });
        const cloudPrefs = await pullAndApplyCloudPreferences();
        setPreferences(cloudPrefs);
      } catch {
        // Local preferences remain the source of truth offline.
      } finally {
        setHydrated(true);
      }
    })();
  }, [user?.id]);

  const updatePreference = <Key extends keyof AppPreferences>(
    key: Key,
    value: AppPreferences[Key],
  ) => {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      return saveAppPreferences(next);
    });
  };

  const resetPreferences = () => {
    const next = saveAppPreferences({ ...defaultPreferences });
    setPreferences(next);
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
          <p>Control how Zer0 behaves on this PC.</p>
        </div>
        <button type="button" className="app-settings-reset-link" onClick={resetPreferences}>
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
            label="Check Zer0 Engine on launch"
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
          <ToggleSetting
            label="Show beta routes"
            checked={preferences.showBetaRoutes}
            onChange={(showBetaRoutes) => updatePreference("showBetaRoutes", showBetaRoutes)}
          />
        </SettingsCard>

        <SettingsCard title="App Data" className="app-settings-card-data">
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
            This only affects local Zer0 settings and logs. It does not change your
            subscription, Fortnite data, or saved reports.
          </p>
        </SettingsCard>

        <SettingsCard title="About" className="app-settings-card-about">
          <StatusRow label="Current Version" value={version} />
          <StatusRow label="Update Status" value="You're up to date" tone="success" />
          <StatusRow label="Legal Pack" value={LEGAL_DOCUMENT_VERSION} />
          <div className="app-settings-legal">
            <p className="app-settings-legal-label">Legal & disclosures</p>
            <LegalLinks
              ids={[
                "privacy",
                "terms",
                "acceptable-use",
                "beta-tester-agreement",
                "routing-risk",
                "diagnostics",
                "disclaimers",
              ]}
            />
          </div>
        </SettingsCard>
      </main>
    </div>
  );
}

function SettingsCard({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={["app-settings-card", className].filter(Boolean).join(" ")}>
      <div className="app-settings-card-heading">
        <h2>{title}</h2>
      </div>
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

function StatusRow({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "success";
  value: string;
}) {
  return (
    <div className="app-settings-status-row">
      <span>{label}</span>
      <strong className={tone === "success" ? "success-label" : undefined}>{value}</strong>
    </div>
  );
}
