/**
 * Support / marketing URLs.
 *
 * Domain policy (rebrand): do NOT replace a working RouteLag URL with a
 * nonexistent Zer0 URL. When a Zer0 domain is configured (DNS + site live),
 * set VITE_ZER0_SUPPORT_BASE_URL (or VITE_SUPPORT_BASE_URL). Until then,
 * fall back to the known RouteLag host so installers and help links keep working.
 */

const LEGACY_SUPPORT_BASE = "https://routelag.com";

function configuredZer0SupportBase(): string | null {
  const candidates = [
    import.meta.env.VITE_ZER0_SUPPORT_BASE_URL,
    import.meta.env.VITE_SUPPORT_BASE_URL,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed.replace(/\/+$/, "");
  }
  return null;
}

/** Canonical support site base (Zer0 env if set, else legacy RouteLag). */
export const SUPPORT_BASE_URL = configuredZer0SupportBase() ?? LEGACY_SUPPORT_BASE;

/** True when still using the legacy RouteLag host as a controlled fallback. */
export const SUPPORT_USES_LEGACY_DOMAIN = configuredZer0SupportBase() == null;

export const PLANS_URL = `${SUPPORT_BASE_URL}/support/plans`;
export const HUD_INFO_URL = `${SUPPORT_BASE_URL}/hud`;

/** Hosted legal paths (publish drafts from docs/legal before relying on these). */
export const PRIVACY_POLICY_URL = `${SUPPORT_BASE_URL}/legal/privacy`;
export const TERMS_OF_SERVICE_URL = `${SUPPORT_BASE_URL}/legal/terms`;
export const ACCEPTABLE_USE_URL = `${SUPPORT_BASE_URL}/legal/acceptable-use`;
export const BETA_TESTER_AGREEMENT_URL = `${SUPPORT_BASE_URL}/legal/beta-tester-agreement`;
export const ROUTING_RISK_URL = `${SUPPORT_BASE_URL}/legal/routing-risk`;
export const DIAGNOSTICS_DISCLOSURE_URL = `${SUPPORT_BASE_URL}/legal/diagnostics`;
export const THIRD_PARTY_DISCLAIMER_URL = `${SUPPORT_BASE_URL}/legal/disclaimers`;
