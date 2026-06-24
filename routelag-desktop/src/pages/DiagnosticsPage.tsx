import { GlowButton } from "../components/GlowButton";

interface DiagnosticsPageProps {
  busy: string | null;
  onBack: () => void;
  onExport: () => void;
  onReconnect: () => void;
  onRun: () => void;
}

export function DiagnosticsPage({
  busy,
  onBack,
  onExport,
  onReconnect,
  onRun,
}: DiagnosticsPageProps) {
  return (
    <div className="tool-view">
      <header className="tool-header">
        <button type="button" className="back-link" onClick={onBack}>
          ← Back
        </button>
        <div>
          <h1>Advanced Diagnostics</h1>
          <p>Network Analysis & Troubleshooting</p>
        </div>
        <span className="header-spacer" />
      </header>
      <section className="utility-panel">
        <span className="panel-label">Network Information</span>
        <div className="diagnostic-grid">
          <InfoItem label="Server" value="Johannesburg Beta" />
          <InfoItem label="Tunnel" value="RouteLag Engine" />
          <InfoItem label="Reports" value="Local export" />
          <InfoItem label="Privacy" value="IP and ping" />
        </div>
      </section>
      <section className="utility-panel">
        <span className="panel-label">Diagnostic Tests</span>
        <GlowButton onClick={onRun} disabled={busy === "diagnostics"}>
          {busy === "diagnostics" ? "Running..." : "Run Diagnostics"}
        </GlowButton>
        <div className="action-grid">
          <button type="button" onClick={onExport} disabled={busy === "export"}>
            Export Report
          </button>
          <button type="button" onClick={onReconnect} disabled={busy === "reconnect"}>
            Reconnect
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}
