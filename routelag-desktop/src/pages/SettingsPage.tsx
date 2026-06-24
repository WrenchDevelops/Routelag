import { GlowButton } from "../components/GlowButton";

interface SettingsPageProps {
  busy: string | null;
  elevated: boolean;
  hasConfig: boolean;
  onBack: () => void;
  wgInstalled: boolean;
  onImport: () => void;
  onRemove: () => void;
}

export function SettingsPage({
  busy,
  elevated,
  hasConfig,
  onBack,
  onImport,
  onRemove,
  wgInstalled,
}: SettingsPageProps) {
  return (
    <div className="settings-view">
      <section className="tester-config-card">
        <button type="button" className="back-link settings-back" onClick={onBack}>
          Back
        </button>
        <h1>RouteLag Setup</h1>
        <InfoTile title="Route Profile" value={hasConfig ? "Ready" : "Created on Optimize"} />
        <InfoTile title="Admin" value={elevated ? "Ready" : "Required"} />
        <InfoTile title="RouteLag Engine" value={wgInstalled ? "Ready" : "Missing"} />
        <div className="tester-actions">
          <GlowButton onClick={onImport} disabled={busy === "import"}>
            {busy === "import" ? "Importing..." : "Import Legacy Profile"}
          </GlowButton>
          <button
            type="button"
            onClick={onRemove}
            disabled={!hasConfig || busy === "remove"}
          >
            {busy === "remove" ? "Clearing..." : "Clear Profile"}
          </button>
        </div>
      </section>
    </div>
  );
}

function InfoTile({ title, value }: { title: string; value: string }) {
  return (
    <div className="info-tile">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
