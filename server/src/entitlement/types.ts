/** Account states used for routing entitlement decisions. */
export type RoutingAccountState =
  | "free"
  | "active_paid"
  | "canceled_period_active"
  | "expired"
  | "refunded"
  | "disputed"
  | "internal"
  | "unknown";

export type EntitlementDenialCode =
  | "subscription_required"
  | "subscription_expired"
  | "account_restricted"
  | "entitlement_unavailable"
  | "concurrent_session_limit"
  | "invalid_token"
  | "invite_only_insufficient";

export interface EntitlementDecision {
  entitled: boolean;
  accountState: RoutingAccountState;
  source: "paid" | "internal" | "none";
  /** Absolute ms when paid period / cache entry should be considered ended. */
  periodEndsAtMs: number | null;
  /** Short reason for logs only — never returned raw to clients. */
  reason: string;
  denialCode?: EntitlementDenialCode;
}

export interface EntitlementLookupInput {
  clerkUserId: string;
  /** Optional verified Clerk session JWT claims (plans/features). */
  sessionClaims?: Record<string, unknown>;
}

export interface EntitlementProvider {
  lookup(input: EntitlementLookupInput): Promise<EntitlementDecision>;
}

/** Stable client-facing error payloads (no billing internals). */
export function entitlementErrorBody(code: EntitlementDenialCode): {
  error: string;
  code: EntitlementDenialCode;
} {
  switch (code) {
    case "subscription_required":
      return {
        code,
        error: "A Zer0 Pro subscription is required to start routing.",
      };
    case "subscription_expired":
      return {
        code,
        error: "Your Zer0 Pro subscription has expired. Renew to start routing.",
      };
    case "account_restricted":
      return {
        code,
        error: "This account is restricted from routing. Contact support if you need help.",
      };
    case "entitlement_unavailable":
      return {
        code,
        error: "Subscription verification is temporarily unavailable. Try again shortly.",
      };
    case "concurrent_session_limit":
      return {
        code,
        error: "Routing is already active on another device. End that session first.",
      };
    case "invite_only_insufficient":
      return {
        code,
        error: "A Zer0 Pro subscription is required to start routing.",
      };
    case "invalid_token":
    default:
      return {
        code: "invalid_token",
        error: "Authorization expired. Sign in again and retry.",
      };
  }
}

export function decisionForAccountState(state: RoutingAccountState): EntitlementDecision {
  switch (state) {
    case "active_paid":
      return {
        entitled: true,
        accountState: state,
        source: "paid",
        periodEndsAtMs: null,
        reason: "active_paid",
      };
    case "canceled_period_active":
      return {
        entitled: true,
        accountState: state,
        source: "paid",
        periodEndsAtMs: null,
        reason: "canceled_but_period_active",
      };
    case "internal":
      return {
        entitled: true,
        accountState: state,
        source: "internal",
        periodEndsAtMs: null,
        reason: "internal_allowlist",
      };
    case "expired":
      return {
        entitled: false,
        accountState: state,
        source: "none",
        periodEndsAtMs: null,
        reason: "expired",
        denialCode: "subscription_expired",
      };
    case "refunded":
    case "disputed":
      return {
        entitled: false,
        accountState: state,
        source: "none",
        periodEndsAtMs: null,
        reason: state,
        denialCode: "account_restricted",
      };
    case "free":
    case "unknown":
    default:
      return {
        entitled: false,
        accountState: state === "unknown" ? "unknown" : "free",
        source: "none",
        periodEndsAtMs: null,
        reason: state === "unknown" ? "unknown" : "free",
        denialCode: "subscription_required",
      };
  }
}
