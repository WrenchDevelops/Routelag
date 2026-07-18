import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../api";
import { DiagnosticsSummaryCards, RouteComparisonCard } from "../components/DiagnosticsCards";
import { useToast } from "../components/Toast";
import type { DiagnosticsReport, MtuTestResult, TesterProfile, TunnelHealth } from "../types";
import { defaultTesterProfile, PRIVACY_WARNING } from "../types";

export function DiagnosticsPage() {
  const { showToast } = useToast();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [health, setHealth] = useState<TunnelHealth | null>(null);
  const [mtu, setMtu] = useState<MtuTestResult | null>(null);
  const [profile, setProfile] = useState<TesterProfile>(defaultTesterProfile());
  const [includePublicIp, setIncludePublicIp] = useState(true);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [disconnectModal, setDisconnectModal] = useState(false);
  const saveTimer = useRef<number | null>(null);

  const refresh = async () => {
    const [diag, h, m, savedProfile] = await Promise.all([
      api.loadDiagnostics(),
      api.getTunnelHealth(),
      api.runMtuTest().catch(() => null),
      api.getTesterProfile(),
    ]);
    setReport(diag);
    setHealth(h);
    if (m) setMtu(m);
    else if (diag) setMtu(diag.mtu);
    setProfile(savedProfile);
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void api.getTunnelHealth().then(setHealth);
    }, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const persistProfile = useCallback(
    (next: TesterProfile) => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      saveTimer.current = window.setTimeout(() => {
        void api
          .saveTesterProfile(next)
          .then(() => showToast("Tester profile saved.", "success"))
          .catch((e) => showToast(String(e), "error"));
      }, 500);
    },
    [showToast],
  );

  const updateProfile = (patch: Partial<TesterProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      persistProfile(next);
      return next;
    });
  };

  const runDiagnostics = async (disconnectForNormal: boolean) => {
    setRunning(true);
    setDisconnectModal(false);
    try {
      const result = await api.runFullDiagnostics({
        disconnectForNormal,
        includePublicIp,
        skipTunnelPhase: true,
        includeTraceroute: false,
      });
      setReport(result);
      setMtu(result.mtu);
      setHealth(await api.getTunnelHealth());
      showToast("Full diagnostics completed.", "success");
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Disconnect temporarily") || msg.includes("tunnel is connected")) {
        setDisconnectModal(true);
      } else if (msg.includes("Connect RouteLag") || msg.includes("Connect Zer0")) {
        showToast(
          "Connect the tunnel in admin mode first, then run diagnostics again.",
          "warning",
        );
      } else {
        showToast(msg, "error");
      }
    } finally {
      setRunning(false);
    }
  };

  const handleRunClick = async () => {
    await runDiagnostics(false);
  };

  const handleCopyReport = async () => {
    try {
      const text = await api.copyReportText();
      await navigator.clipboard.writeText(text);
      showToast("Report copied to clipboard.", "success");
    } catch (e) {
      showToast(String(e), "error");
    }
  };

  const handleDownloadZip = async () => {
    setExporting(true);
    try {
      const path = await api.exportReportZip();
      showToast(`Report saved to ${path}`, "success");
    } catch (e) {
      showToast(String(e), "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Diagnostics</h1>
        <p className="mt-1 text-sm text-muted">
          Network-only diagnostics for beta testing. Does not touch Fortnite or
          game processes.
        </p>
      </div>

      <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-amber-100">
        {PRIVACY_WARNING}
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={includePublicIp}
          onChange={(e) => setIncludePublicIp(e.target.checked)}
          className="rounded border-border"
        />
        Include public IP in report
      </label>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-white">Tester Profile</h2>
        <p className="mt-1 text-sm text-muted">
          Saved locally and included in diagnostics exports.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-gray-300">
            Tester name
            <input
              type="text"
              value={profile.tester_name}
              onChange={(e) => updateProfile({ tester_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            Discord username
            <input
              type="text"
              value={profile.discord_username}
              onChange={(e) => updateProfile({ discord_username: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            State/country
            <input
              type="text"
              value={profile.state_country}
              onChange={(e) => updateProfile({ state_country: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            ISP
            <input
              type="text"
              value={profile.isp}
              onChange={(e) => updateProfile({ isp: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            Ethernet or Wi-Fi
            <select
              value={profile.connection_type}
              onChange={(e) => updateProfile({ connection_type: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-pointer"
            >
              <option value="">Select...</option>
              <option value="Ethernet">Ethernet</option>
              <option value="Wi-Fi">Wi-Fi</option>
            </select>
          </label>
          <label className="text-sm text-gray-300">
            Fortnite region
            <input
              type="text"
              value={profile.fortnite_region}
              onChange={(e) => updateProfile({ fortnite_region: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            Normal Fortnite ping (ms)
            <input
              type="number"
              min={0}
              value={profile.normal_fortnite_ping_ms ?? ""}
              onChange={(e) =>
                updateProfile({
                  normal_fortnite_ping_ms: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300">
            Zer0 Fortnite ping (ms)
            <input
              type="number"
              min={0}
              value={profile.routelag_fortnite_ping_ms ?? ""}
              onChange={(e) =>
                updateProfile({
                  routelag_fortnite_ping_ms: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
          <label className="text-sm text-gray-300 sm:col-span-2">
            Notes
            <textarea
              value={profile.notes}
              onChange={(e) => updateProfile({ notes: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white cursor-text"
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void handleRunClick()}
          disabled={running}
          className="rounded-xl bg-accent px-6 py-3 text-base font-semibold text-white hover:bg-accent/90 disabled:cursor-wait disabled:opacity-60"
        >
          {running ? "Running diagnostics..." : "Run Full Diagnostics"}
        </button>
        <button
          type="button"
          onClick={() => void handleCopyReport()}
          disabled={!report}
          className="rounded-xl border border-border bg-card px-5 py-3 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-40"
        >
          Copy Report
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadZip()}
          disabled={!report || exporting}
          className="rounded-xl border border-border bg-card px-5 py-3 text-sm text-gray-200 hover:bg-white/5 disabled:opacity-40"
        >
          {exporting ? "Exporting..." : "Download Report ZIP"}
        </button>
      </div>

      {running && (
        <p className="text-sm text-accent cursor-wait">
          Testing the current route, DNS, MTU, and machine info. This run does
          not connect or disconnect Zer0.
        </p>
      )}

      <DiagnosticsSummaryCards report={report} health={health} mtu={mtu} />

      <RouteComparisonCard report={report} />

      {report?.wireguard && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-white">Zer0 Engine</h3>
          <div className="mt-3 grid gap-2 font-mono text-xs text-gray-300 sm:grid-cols-2">
            {report.wireguard.endpoint && (
              <p>Endpoint: {report.wireguard.endpoint}</p>
            )}
            {report.wireguard.allowed_ips && (
              <p>Allowed IPs: {report.wireguard.allowed_ips}</p>
            )}
            {report.wireguard.transfer_rx && (
              <p>RX: {report.wireguard.transfer_rx}</p>
            )}
            {report.wireguard.transfer_tx && (
              <p>TX: {report.wireguard.transfer_tx}</p>
            )}
          </div>
        </div>
      )}

      {mtu && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-white">MTU probe results</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {mtu.probes.map((p) => (
              <span
                key={p.mtu}
                className={`rounded-lg px-3 py-1 text-sm font-mono ${
                  p.success
                    ? "bg-success/15 text-success"
                    : "bg-error/15 text-error"
                }`}
              >
                {p.mtu}: {p.success ? "OK" : "FAIL"}
              </span>
            ))}
          </div>
          {!mtu.best_mtu && (
            <p className="mt-3 text-sm text-warning">
              MTU test failed at all sizes. Recommended MTU: 1280 (do not
              auto-apply — confirm in Settings later).
            </p>
          )}
        </div>
      )}

      {disconnectModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-white">
              Disconnect for normal route test?
            </h2>
            <p className="mt-3 text-sm text-gray-300">
              Diagnostics no longer disconnects or reconnects Zer0 by
              default. Use Restore Internet first if the tunnel is stuck.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDisconnectModal(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void runDiagnostics(true)}
                className="rounded-lg bg-accent px-4 py-2 text-sm text-white"
              >
                Run safe diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
