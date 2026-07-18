import { GlowButton } from "../components/GlowButton";
import type { LifecycleStressStatus, TesterProfile } from "../types";

interface DiagnosticsPageProps {
  busy: string | null;
  lifecycleStress: LifecycleStressStatus;
  testerProfile: TesterProfile;
  onBack: () => void;
  onCancel: () => void;
  onExport: () => void;
  onReconnect: () => void;
  onRun: () => void;
  onRunAdvanced: () => void;
  onTesterProfileChange: (patch: Partial<TesterProfile>) => void;
}

export function DiagnosticsPage({
  busy,
  lifecycleStress,
  testerProfile,
  onBack,
  onCancel,
  onExport,
  onReconnect,
  onRun,
  onRunAdvanced,
  onTesterProfileChange,
}: DiagnosticsPageProps) {
  const running = busy === "diagnostics";
  const updateNumber = (
    key: "normal_fortnite_ping_ms" | "johannesburg_fortnite_ping_ms" | "dallas_fortnite_ping_ms",
    value: string,
  ) => {
    onTesterProfileChange({ [key]: value ? Number(value) : null });
  };

  return (
    <div className="tool-view">
      <header className="tool-header">
        <button type="button" className="back-link" onClick={onBack}>
          Back
        </button>
        <div>
          <h1>Advanced Diagnostics</h1>
          <p>SA Fortnite Middle East beta</p>
        </div>
        <span className="header-spacer" />
      </header>

      <section className="utility-panel beta-notes-panel">
        <span className="panel-label">Tester Notes</span>
        <div className="tester-notes-grid">
          <TextField
            label="Tester"
            value={testerProfile.tester_name}
            onChange={(tester_name) => onTesterProfileChange({ tester_name })}
          />
          <TextField
            label="City"
            value={testerProfile.country_city}
            onChange={(country_city) => onTesterProfileChange({ country_city })}
          />
          <TextField
            label="ISP"
            value={testerProfile.isp}
            onChange={(isp) => onTesterProfileChange({ isp })}
          />
          <label className="mini-field">
            <span>Connection</span>
            <select
              value={testerProfile.connection_type}
              onChange={(event) =>
                onTesterProfileChange({ connection_type: event.target.value })
              }
            >
              <option value="">Select</option>
              <option value="Ethernet">Ethernet</option>
              <option value="Wi-Fi">Wi-Fi</option>
            </select>
          </label>
          <TextField
            label="Region"
            value={testerProfile.fortnite_region || "Middle East"}
            onChange={(fortnite_region) => onTesterProfileChange({ fortnite_region })}
          />
          <NumberField
            label="OFF ping"
            value={testerProfile.normal_fortnite_ping_ms}
            onChange={(value) => updateNumber("normal_fortnite_ping_ms", value)}
          />
          <NumberField
            label="Johannesburg"
            value={testerProfile.johannesburg_fortnite_ping_ms}
            onChange={(value) => updateNumber("johannesburg_fortnite_ping_ms", value)}
          />
          <NumberField
            label="Dallas"
            value={testerProfile.dallas_fortnite_ping_ms}
            onChange={(value) => updateNumber("dallas_fortnite_ping_ms", value)}
          />
          <TextField
            label="Best route"
            value={testerProfile.best_route}
            onChange={(best_route) => onTesterProfileChange({ best_route })}
          />
          <TextField
            label="Packet loss"
            value={testerProfile.packet_loss_notes}
            onChange={(packet_loss_notes) =>
              onTesterProfileChange({ packet_loss_notes })
            }
          />
          <label className="mini-field mini-field-wide">
            <span>Any issues?</span>
            <textarea
              value={testerProfile.any_issues || testerProfile.notes}
              onChange={(event) =>
                onTesterProfileChange({
                  any_issues: event.target.value,
                  notes: event.target.value,
                })
              }
              rows={2}
            />
          </label>
        </div>
      </section>

      <section className="utility-panel">
        <span className="panel-label">Network Information</span>
        <div className="diagnostic-grid">
          <InfoItem label="Servers" value="JHB / FRA / LON / AMS" />
          <InfoItem label="Engine" value="Zer0 Engine" />
          <InfoItem label="Reports" value="Local export" />
          <InfoItem label="Privacy" value="IP and ping" />
        </div>
      </section>
      <section className="utility-panel">
        <span className="panel-label">Lifecycle Stress Checklist</span>
        <div className="diagnostic-grid lifecycle-grid">
          <InfoItem label="Start/stop cycles" value={String(lifecycleStress.start_stop_cycles)} />
          <InfoItem label="Last start" value={lifecycleStress.last_start_time ?? "Not run"} />
          <InfoItem label="Last stop" value={lifecycleStress.last_stop_time ?? "Not run"} />
          <InfoItem label="Cleanup" value={lifecycleStress.cleanup_result} />
          <InfoItem label="Service leftovers" value={lifecycleStress.service_leftover_status} />
          <InfoItem label="API cleanup" value={lifecycleStress.api_cleanup_result} />
          <InfoItem label="Route mode" value={routeModeLabel(lifecycleStress.route_mode)} />
        </div>
      </section>
      <section className="utility-panel">
        <span className="panel-label">Diagnostic Tests</span>
        <GlowButton onClick={onRun} disabled={running}>
          {running ? "Running..." : "Run Diagnostics"}
        </GlowButton>
        <div className="action-grid">
          {running ? (
            <button type="button" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button type="button" onClick={onRunAdvanced}>
              Advanced Trace
            </button>
          )}
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

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mini-field">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function routeModeLabel(mode: LifecycleStressStatus["route_mode"]) {
  switch (mode) {
    case "split_route":
      return "Split route";
    case "full_tunnel":
      return "Full tunnel blocked";
    case "invalid":
      return "Invalid blocked";
    default:
      return "Unknown";
  }
}
