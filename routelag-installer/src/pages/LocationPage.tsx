import { formatEstimatedSize, installTypeLabel } from "../lib/installState";
import { formatBytes } from "../lib/installerApi";
import type { InstallType } from "../lib/installerApi";

export function LocationPage({
  installDir,
  onInstallDirChange,
  onBrowse,
  estimatedSizeBytes,
  availableSpaceBytes,
  installType,
  baseInstallDetected,
  hudOnlyAcknowledged,
  onHudOnlyAcknowledgedChange,
}: {
  installDir: string;
  onInstallDirChange: (dir: string) => void;
  onBrowse: () => void;
  estimatedSizeBytes: number;
  availableSpaceBytes: number | null;
  installType: InstallType;
  baseInstallDetected?: boolean;
  hudOnlyAcknowledged?: boolean;
  onHudOnlyAcknowledgedChange?: (checked: boolean) => void;
}) {
  const needsHudOnlyAcknowledgement = installType === "hudOnly" && !baseInstallDetected;

  return (
    <div className="page page-wide">
      <h1 className="page-title">Choose Install Location</h1>
      <p className="page-subtitle">Select where Zer0 should be installed.</p>

      <div className="location-card">
        <label className="location-label" htmlFor="install-dir">
          Install location
        </label>
        <div className="location-input-row">
          <input
            id="install-dir"
            className="location-input"
            type="text"
            value={installDir}
            onChange={(event) => onInstallDirChange(event.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={onBrowse}>
            Browse
          </button>
        </div>
      </div>

      <div className="location-meta">
        <div className="location-meta-row">
          <span className="location-meta-label">Required space</span>
          <span className="location-meta-value">{formatEstimatedSize(estimatedSizeBytes)}</span>
        </div>
        <div className="location-meta-row">
          <span className="location-meta-label">Available space</span>
          <span className="location-meta-value">
            {availableSpaceBytes != null ? formatBytes(availableSpaceBytes) : "Calculating…"}
          </span>
        </div>
        <div className="location-meta-row">
          <span className="location-meta-label">Install type</span>
          <span className="location-meta-value">{installTypeLabel(installType)}</span>
        </div>
      </div>

      <p className="page-note">
        Installing under Program Files requires Windows administrator permission (UAC). Approving
        the prompt is required to finish install. Starting Optimization later also requires admin.
      </p>

      {needsHudOnlyAcknowledgement ? (
        <label className="hud-only-ack">
          <input
            type="checkbox"
            checked={!!hudOnlyAcknowledged}
            onChange={(event) => onHudOnlyAcknowledgedChange?.(event.target.checked)}
          />
          <span>
            Zer0 Base App is required to launch and manage the HUD Runtime. I confirm this
            path is an existing Zer0 install or a manual install target I want to use.
          </span>
        </label>
      ) : null}
    </div>
  );
}
