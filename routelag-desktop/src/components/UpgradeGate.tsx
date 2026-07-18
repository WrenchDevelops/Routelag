import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

interface UpgradeGateProps {
  allowed: boolean;
  loaded: boolean;
  title: string;
  description: string;
  onUpgrade: () => void;
  children: ReactNode;
}

export function UpgradeGate({
  allowed,
  loaded,
  title,
  description,
  onUpgrade,
  children,
}: UpgradeGateProps) {
  if (!loaded) {
    return (
      <div className="upgrade-gate" aria-busy="true">
        <div className="upgrade-gate-card upgrade-gate-loading">
          <div className="upgrade-gate-spinner" aria-hidden="true" />
          <p>Checking subscription…</p>
        </div>
      </div>
    );
  }

  if (allowed) return <>{children}</>;

  return (
    <div className="upgrade-gate">
      <div className="upgrade-gate-card">
        <span className="upgrade-gate-badge">
          <Sparkles size={12} aria-hidden="true" />
          Pro
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <button type="button" className="upgrade-gate-cta" onClick={onUpgrade}>
          View Pro plans
        </button>
      </div>
    </div>
  );
}
