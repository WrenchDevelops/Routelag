import { TOURNAMENT_TESTING_ENABLED } from "../lib/featureFlags";

interface SessionIntegrityBannerProps {
  compact?: boolean;
}

/** Shown while tournament testing is suspended (full-session integrity beta). */
export function SessionIntegrityBanner({ compact = false }: SessionIntegrityBannerProps) {
  if (TOURNAMENT_TESTING_ENABLED) return null;

  return (
    <aside
      className={`session-integrity-banner${compact ? " is-compact" : ""}`}
      role="status"
    >
      <strong>Tournament testing paused</strong>
      <p>
        {compact
          ? "Full-session tunnel only. Connect before launching Epic/Fortnite. Not for competitive queues yet."
          : "Zer0 currently uses a full-session IPv4 tunnel so login, matchmaking, and game traffic share one VPS exit. Connect Optimize before opening Epic Games Launcher or Fortnite. Do not use Optimize for tournament or competitive queues until the integrity test matrix passes. Do not switch servers mid-session."}
      </p>
    </aside>
  );
}
