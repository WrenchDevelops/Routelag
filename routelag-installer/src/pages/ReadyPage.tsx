import { formatEstimatedSize, installTypeLabel } from "../lib/installState";
import type { ComponentSelection } from "../lib/installState";

export function ReadyPage({
  installDir,
  installType,
  selection,
  estimatedSizeBytes,
  requiresAdmin,
}: {
  installDir: string;
  installType: import("../lib/installerApi").InstallType;
  selection: ComponentSelection;
  estimatedSizeBytes: number;
  requiresAdmin: boolean;
}) {
  const components = [
    selection.includeApp ? "Zer0 App" : null,
    selection.includeEngine ? "Zer0 Engine" : null,
    selection.includeHud ? "Zer0 HUD Runtime" : null,
    selection.includeDesktopShortcut ? "Desktop Shortcut" : null,
    selection.includeStartMenuShortcut ? "Start Menu Shortcut" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="page page-wide ready-page">
      <h1 className="page-title">Ready to Install</h1>
      <p className="page-subtitle">Review your setup before installing Zer0.</p>

      {requiresAdmin ? (
        <div className="installer-callout installer-callout-warning" role="status">
          <strong>Administrator permission required.</strong> Installing to Program Files will show
          a Windows UAC prompt. Approve it to continue. Zer0 routing also needs admin later to
          start or restore a route session.
        </div>
      ) : (
        <div className="installer-callout" role="status">
          This location does not require elevation for file copy. Starting Optimization later still
          needs Windows administrator permission.
        </div>
      )}

      <div className="ready-summary-card">
        <div className="ready-summary-meta">
          <div className="ready-summary-section">
            <span className="ready-summary-label">Installation Type</span>
            <span className="ready-summary-value">{installTypeLabel(installType)}</span>
          </div>
          <div className="ready-summary-section">
            <span className="ready-summary-label">Estimated Size</span>
            <span className="ready-summary-value">{formatEstimatedSize(estimatedSizeBytes)}</span>
          </div>
        </div>
        <div className="ready-summary-section">
          <span className="ready-summary-label">Install Location</span>
          <span className="ready-summary-value">{installDir}</span>
        </div>
        <div className="ready-summary-section">
          <span className="ready-summary-label">Components</span>
          <ul className="ready-summary-components">
            {components.map((item) => (
              <li key={item}>
                <span className="ready-check" aria-hidden="true">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
