import { OptionCard } from "../components/OptionCard";
import type { InstallType } from "../lib/installerApi";

function CubeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4 5 8v8l7 4 7-4V8l-7-4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 8l7 4 7-4M12 12v8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14c3-4 4-8 4-8s-4 1-8 4c0 0 1.5 2.5 4 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 15 7 21l5-2M15 15l2 6-5-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" />
    </svg>
  );
}

function HudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function InstallTypePage({
  installType,
  hudAvailable,
  onChange,
  onCustomize,
}: {
  installType: InstallType;
  hudAvailable: boolean;
  onChange: (type: InstallType) => void;
  onCustomize?: () => void;
}) {
  return (
    <div className="install-type-page">
      <header className="install-type-header">
        <h1 className="installer-title install-type-title">
          Choose your <span className="text-accent">install type</span>
        </h1>
        <p className="installer-subtitle">Select what you want to install on this PC.</p>
      </header>

      <div className="option-grid">
        <OptionCard
          title="Base App Only"
          description="Installs the Zer0 desktop app for routing and replay features. HUD not included."
          icon={<CubeIcon />}
          selected={installType === "baseApp"}
          onSelect={() => onChange("baseApp")}
        />
        <OptionCard
          title="Full Install"
          description={
            hudAvailable
              ? "Installs the Zer0 desktop app plus the optional HUD runtime for in-game overlays."
              : "Installs the Zer0 desktop app. HUD requires the Full installer package."
          }
          icon={<RocketIcon />}
          recommended={hudAvailable}
          unavailable={!hudAvailable}
          selected={installType === "baseAppHud"}
          onSelect={() => onChange("baseAppHud")}
        />
        <OptionCard
          title="HUD Only"
          description={
            hudAvailable
              ? "Installs only the Zer0 HUD runtime. Use this if the main app is already installed."
              : "Requires the Full installer package and an existing Zer0 install."
          }
          icon={<HudIcon />}
          unavailable={!hudAvailable}
          selected={installType === "hudOnly"}
          onSelect={() => onChange("hudOnly")}
        />
      </div>

      <p className="install-type-note">
        <span className="install-type-note-icon" aria-hidden="true">
          i
        </span>
        {hudAvailable
          ? "You can change or repair installed components later."
          : "HUD options need the Full installer package. This build installs the base app only."}
      </p>

      {onCustomize ? (
        <button type="button" className="install-type-customize link-btn" onClick={onCustomize}>
          Customize components
        </button>
      ) : null}
    </div>
  );
}
