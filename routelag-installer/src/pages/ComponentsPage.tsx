import { CheckboxRow } from "../components/CheckboxRow";
import type { ComponentSelection } from "../lib/installState";
import { formatEstimatedSize, installTypeLabel } from "../lib/installState";
import type { InstallType } from "../lib/installerApi";

export function ComponentsPage({
  installType,
  selection,
  onSelectionChange,
  installDir,
  estimatedSizeBytes,
}: {
  installType: InstallType;
  selection: ComponentSelection;
  onSelectionChange: (next: ComponentSelection) => void;
  installDir: string;
  estimatedSizeBytes: number;
}) {
  const hudOnlyMode = !selection.includeApp && !selection.includeEngine;
  const lockBaseComponents = !hudOnlyMode;

  const update = (patch: Partial<ComponentSelection>) => {
    onSelectionChange({ ...selection, ...patch });
  };

  return (
    <div className="page page-wide page-split">
      <div className="page-main">
        <h1 className="page-title">Choose Components</h1>
        <p className="page-subtitle">Select what Zer0 should install.</p>

        <div className="checkbox-list">
          <CheckboxRow
            title="Zer0 App"
            badge="Required"
            description="Core desktop app, routing dashboard, settings, and account."
            checked={selection.includeApp}
            locked={lockBaseComponents}
            disabled={hudOnlyMode}
            onChange={(checked) => update({ includeApp: checked })}
          />
          <CheckboxRow
            title="Zer0 Engine"
            badge="Required for routing"
            description="Handles network optimization and route controls."
            checked={selection.includeEngine}
            locked={lockBaseComponents}
            disabled={hudOnlyMode}
            onChange={(checked) => update({ includeEngine: checked })}
          />
          <CheckboxRow
            title="Zer0 HUD Runtime"
            badge="Optional"
            description="Required for live Fortnite HUD overlays."
            checked={selection.includeHud}
            locked={hudOnlyMode}
            onChange={(checked) => update({ includeHud: checked })}
          />
          <CheckboxRow
            title="Desktop Shortcut"
            badge="Optional"
            description="Adds a Zer0 shortcut to your desktop."
            checked={selection.includeDesktopShortcut}
            disabled={hudOnlyMode}
            onChange={(checked) => update({ includeDesktopShortcut: checked })}
          />
          <CheckboxRow
            title="Start Menu Shortcut"
            badge="Optional"
            description="Adds Zer0 to the Windows Start Menu."
            checked={selection.includeStartMenuShortcut}
            disabled={hudOnlyMode}
            onChange={(checked) => update({ includeStartMenuShortcut: checked })}
          />
        </div>
      </div>

      <aside className="summary-card">
        <h2 className="summary-card-title">Selected Install</h2>
        <dl className="summary-card-list">
          <div className="summary-card-row">
            <dt>Type</dt>
            <dd>{installTypeLabel(installType)}</dd>
          </div>
          <div className="summary-card-row">
            <dt>Estimated size</dt>
            <dd>{formatEstimatedSize(estimatedSizeBytes)}</dd>
          </div>
          <div className="summary-card-row">
            <dt>Install path</dt>
            <dd>{installDir}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
