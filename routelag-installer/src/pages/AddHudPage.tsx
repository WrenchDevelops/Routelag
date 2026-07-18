import { formatBytes } from "../lib/installerApi";

export function AddHudPage({ installPath, hudSizeBytes }: { installPath: string; hudSizeBytes: number }) {
  return (
    <div className="page page-wide">
      <h1 className="page-title">Add HUD Runtime</h1>
      <p className="page-subtitle">
        Zer0 is already installed. This adds the HUD Runtime for live Fortnite overlays without
        changing your existing app or engine.
      </p>
      <div className="location-meta">
        <div className="location-meta-row">
          <span className="location-meta-label">Install location</span>
          <span className="location-meta-value">{installPath}</span>
        </div>
        <div className="location-meta-row">
          <span className="location-meta-label">HUD Runtime size</span>
          <span className="location-meta-value">{formatBytes(hudSizeBytes)}</span>
        </div>
      </div>
      <p className="page-note">Zer0 will close briefly during install.</p>
    </div>
  );
}
