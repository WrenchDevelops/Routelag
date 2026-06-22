import { useEffect, useState } from "react";

import { api } from "../api";
import { AdminModal } from "../components/AdminModal";
import { useToast } from "../components/Toast";
import type { ConfigIdentity } from "../types";

export function SettingsPage() {
  const { showToast } = useToast();
  const [hasConfig, setHasConfig] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [identity, setIdentity] = useState<ConfigIdentity | null>(null);
  const [version, setVersion] = useState("");
  const [elevated, setElevated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  const refresh = async () => {
    const [exists, ver, elev] = await Promise.all([
      api.hasConfig(),
      api.getAppVersion(),
      api.isElevated(),
    ]);
    setHasConfig(exists);
    setVersion(ver);
    setElevated(elev);
    if (exists) {
      try {
        const [previewText, configIdentity] = await Promise.all([
          api.redactConfig(),
          api.getConfigIdentity(),
        ]);
        setPreview(previewText);
        setIdentity(configIdentity);
      } catch {
        setPreview(null);
        setIdentity(null);
      }
    } else {
      setPreview(null);
      setIdentity(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleImport = async () => {
    setBusy(true);
    try {
      await api.importConfig();
      await refresh();
      showToast("Config imported.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm("Remove the imported WireGuard config?")) return;
    setBusy(true);
    try {
      await api.removeConfig();
      await refresh();
      showToast("Config removed.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        "Reset RouteLag Beta? This removes your config, logs, and saved test results. Your tester profile is kept.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.resetApp();
      await refresh();
      showToast("App reset.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const runEmergencyCleanup = async () => {
    setBusy(true);
    try {
      await api.emergencyCleanup();
      await refresh();
      showToast("Emergency cleanup completed.", "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleEmergencyCleanup = () => {
    if (
      !confirm(
        "Run Emergency Cleanup? This stops the RouteLag tunnel, uninstalls the tunnel service, and flushes DNS. WireGuard and RouteLag stay installed. Your config file is not removed.",
      )
    ) {
      return;
    }
    if (!elevated) {
      setAdminModalOpen(true);
      return;
    }
    void runEmergencyCleanup();
  };

  const handleRestartAsAdmin = async () => {
    setAdminLoading(true);
    try {
      await api.restartAsAdmin();
    } catch (e) {
      showToast(String(e), "error");
      setAdminLoading(false);
      setAdminModalOpen(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your tester config and app data.
        </p>
        {version && (
          <p className="mt-1 font-mono text-xs text-muted">Version {version}</p>
        )}
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-white">WireGuard config</h2>
        <p className="mt-1 text-sm text-muted">
          Status: {hasConfig ? "Imported" : "Not imported"}
        </p>
        {identity && (
          <dl className="mt-3 grid gap-1 text-sm text-gray-300">
            <div>
              <dt className="text-muted">Config name</dt>
              <dd className="font-mono">{identity.original_filename}</dd>
            </div>
            {identity.address && (
              <div>
                <dt className="text-muted">Address</dt>
                <dd className="font-mono">{identity.address}</dd>
              </div>
            )}
            {identity.endpoint && (
              <div>
                <dt className="text-muted">Endpoint</dt>
                <dd className="font-mono">{identity.endpoint}</dd>
              </div>
            )}
            {identity.dns && (
              <div>
                <dt className="text-muted">DNS</dt>
                <dd className="font-mono">{identity.dns}</dd>
              </div>
            )}
            {identity.mtu != null && (
              <div>
                <dt className="text-muted">MTU</dt>
                <dd className="font-mono">{identity.mtu}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            Import config file
          </button>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={!hasConfig || busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-50"
          >
            Remove config
          </button>
        </div>
        {preview && (
          <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs text-gray-300 cursor-text">
            {preview}
          </pre>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-white">Preferences</h2>
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between text-sm text-muted">
            <span>Start with Windows</span>
            <input type="checkbox" disabled className="opacity-40" />
          </label>
          <p className="text-xs text-muted">Coming soon</p>
          <label className="flex items-center justify-between text-sm text-muted">
            <span>Custom DNS</span>
            <input type="checkbox" disabled className="opacity-40" />
          </label>
          <p className="text-xs text-muted">Coming soon</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-white">Diagnostics</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              void api.openLogsFolder().catch((e) => showToast(String(e), "error"))
            }
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-200 hover:bg-white/5"
          >
            Open logs folder
          </button>
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={busy}
            className="rounded-lg border border-error/40 px-4 py-2 text-sm text-red-200 hover:bg-error/10 disabled:opacity-50"
          >
            Reset app
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-error/30 bg-card p-4">
        <h2 className="text-sm font-medium text-white">Recovery</h2>
        <p className="mt-1 text-sm text-muted">
          Stop the tunnel and restore normal internet without uninstalling
          WireGuard or RouteLag.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={handleEmergencyCleanup}
            disabled={busy}
            className="rounded-lg border border-error/40 px-4 py-2 text-sm text-red-200 hover:bg-error/10 disabled:opacity-50"
          >
            Emergency Cleanup
          </button>
        </div>
      </section>

      <AdminModal
        open={adminModalOpen}
        onClose={() => setAdminModalOpen(false)}
        onRestartAsAdmin={() => void handleRestartAsAdmin()}
        loading={adminLoading}
      />
    </div>
  );
}
