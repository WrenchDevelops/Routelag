import { formatEstimatedSize, installTypeLabel } from "../lib/installState";
import type { ComponentSelection } from "../lib/installState";

export function ReadyPage({
  installDir,
  installType,
  selection,
  estimatedSizeBytes,
}: {
  installDir: string;
  installType: import("../lib/installerApi").InstallType;
  selection: ComponentSelection;
  estimatedSizeBytes: number;
}) {
  const components = [
    selection.includeApp ? "RouteLag App" : null,
    selection.includeEngine ? "RouteLag Engine" : null,
    selection.includeHud ? "RouteLag HUD Runtime" : null,
    selection.includeDesktopShortcut ? "Desktop Shortcut" : null,
    selection.includeStartMenuShortcut ? "Start Menu Shortcut" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="page page-wide">
      <h1 className="page-title">Ready to Install</h1>
      <p className="page-subtitle">Review your setup before installing RouteLag.</p>

      <div className="ready-summary-card">
        <div className="ready-summary-section">
          <span className="ready-summary-label">Installation Type</span>
          <span className="ready-summary-value">{installTypeLabel(installType)}</span>
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
        <div className="ready-summary-section">
          <span className="ready-summary-label">Estimated Size</span>
          <span className="ready-summary-value">{formatEstimatedSize(estimatedSizeBytes)}</span>
        </div>
      </div>
    </div>
  );
}
