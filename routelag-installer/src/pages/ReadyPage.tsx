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

      <p className="ready-admin-note">
        {requiresAdmin
          ? "Windows will ask for administrator permission when the install starts."
          : "Windows may ask for administrator permission when you start optimizing later."}
      </p>
    </div>
  );
}
