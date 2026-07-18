/**
 * Private-beta legal consent storage and document catalog.
 * Document version must bump when hosted drafts change in a material way.
 */

export const LEGAL_DOCUMENT_VERSION = "2026-07-17.1";

export const LEGAL_CONSENT_STORAGE_KEY = "zer0.legalConsent.v1";

/** Acknowledgement IDs required before first-launch continue. */
export const REQUIRED_LEGAL_ACK_IDS = [
  "private_beta",
  "unsigned_build",
  "network_risk",
  "no_ping_guarantee",
  "restore_internet",
  "diagnostics",
  "privacy_policy",
  "terms",
  "beta_tester_agreement",
] as const;

export type LegalAckId = (typeof REQUIRED_LEGAL_ACK_IDS)[number];

export interface LegalConsentRecord {
  documentVersion: string;
  acceptedAt: string;
  clerkUserId: string | null;
  appVersion: string | null;
  acknowledgements: LegalAckId[];
}

export type LegalDocId =
  | "privacy"
  | "terms"
  | "acceptable-use"
  | "beta-tester-agreement"
  | "routing-risk"
  | "diagnostics"
  | "disclaimers";

export interface LegalDocMeta {
  id: LegalDocId;
  title: string;
  /** Bundled markdown path served by Vite/Tauri webview. */
  bundledPath: string;
  /** Intended hosted path under SUPPORT_BASE_URL (may 404 until published). */
  hostedPath: string;
}

export const LEGAL_DOCUMENTS: LegalDocMeta[] = [
  {
    id: "privacy",
    title: "Privacy Policy",
    bundledPath: "/legal/privacy.md",
    hostedPath: "/legal/privacy",
  },
  {
    id: "terms",
    title: "Terms of Service",
    bundledPath: "/legal/terms.md",
    hostedPath: "/legal/terms",
  },
  {
    id: "acceptable-use",
    title: "Acceptable Use Policy",
    bundledPath: "/legal/acceptable-use.md",
    hostedPath: "/legal/acceptable-use",
  },
  {
    id: "beta-tester-agreement",
    title: "Private Beta Tester Agreement",
    bundledPath: "/legal/beta-tester-agreement.md",
    hostedPath: "/legal/beta-tester-agreement",
  },
  {
    id: "routing-risk",
    title: "Routing & Network Risk Disclosure",
    bundledPath: "/legal/routing-risk.md",
    hostedPath: "/legal/routing-risk",
  },
  {
    id: "diagnostics",
    title: "Diagnostic & Telemetry Disclosure",
    bundledPath: "/legal/diagnostics.md",
    hostedPath: "/legal/diagnostics",
  },
  {
    id: "disclaimers",
    title: "Fortnite & Third-Party Disclaimer",
    bundledPath: "/legal/disclaimers.md",
    hostedPath: "/legal/disclaimers",
  },
];

export const LEGAL_ACK_LABELS: Record<LegalAckId, string> = {
  private_beta:
    "I understand Zer0 is a private beta and may be unstable or incomplete.",
  unsigned_build:
    "I understand this build may be unsigned and Windows may show SmartScreen/Defender warnings.",
  network_risk:
    "I understand network routing can disrupt connectivity and I accept the routing risk disclosure.",
  no_ping_guarantee:
    "I understand Zer0 does not guarantee lower latency or better game results.",
  restore_internet:
    "I know how to use Restore Internet / emergency cleanup if my connection breaks.",
  diagnostics:
    "I understand Zer0 collects technical routing and diagnostic information as described in the disclosures.",
  privacy_policy: "I have read and agree to the Privacy Policy.",
  terms: "I have read and agree to the Terms of Service.",
  beta_tester_agreement:
    "I have read and agree to the Private Beta Tester Agreement.",
};

function isAckId(value: unknown): value is LegalAckId {
  return (
    typeof value === "string" &&
    (REQUIRED_LEGAL_ACK_IDS as readonly string[]).includes(value)
  );
}

export function loadLegalConsent(): LegalConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LegalConsentRecord>;
    if (
      typeof parsed.documentVersion !== "string" ||
      typeof parsed.acceptedAt !== "string" ||
      !Array.isArray(parsed.acknowledgements)
    ) {
      return null;
    }
    const acknowledgements = parsed.acknowledgements.filter(isAckId);
    return {
      documentVersion: parsed.documentVersion,
      acceptedAt: parsed.acceptedAt,
      clerkUserId: typeof parsed.clerkUserId === "string" ? parsed.clerkUserId : null,
      appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : null,
      acknowledgements,
    };
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentLegal(
  version: string = LEGAL_DOCUMENT_VERSION,
): boolean {
  const record = loadLegalConsent();
  if (!record || record.documentVersion !== version) return false;
  return REQUIRED_LEGAL_ACK_IDS.every((id) => record.acknowledgements.includes(id));
}

export function saveLegalConsent(input: {
  clerkUserId?: string | null;
  appVersion?: string | null;
  acknowledgements?: LegalAckId[];
  documentVersion?: string;
}): LegalConsentRecord {
  const acknowledgements = input.acknowledgements ?? [...REQUIRED_LEGAL_ACK_IDS];
  const record: LegalConsentRecord = {
    documentVersion: input.documentVersion ?? LEGAL_DOCUMENT_VERSION,
    acceptedAt: new Date().toISOString(),
    clerkUserId: input.clerkUserId ?? null,
    appVersion: input.appVersion ?? null,
    acknowledgements,
  };
  window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent("zer0:legal-consent"));
  return record;
}

/** Attach Clerk user id after sign-in without changing acceptance timestamp/version. */
export function attachClerkUserIdToLegalConsent(clerkUserId: string): LegalConsentRecord | null {
  const existing = loadLegalConsent();
  if (!existing || !clerkUserId) return existing;
  if (existing.clerkUserId === clerkUserId) return existing;
  const next: LegalConsentRecord = { ...existing, clerkUserId };
  window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function getLegalDoc(id: LegalDocId): LegalDocMeta | undefined {
  return LEGAL_DOCUMENTS.find((doc) => doc.id === id);
}
