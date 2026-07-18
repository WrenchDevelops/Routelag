import {
  decisionForAccountState,
  type EntitlementDecision,
  type EntitlementLookupInput,
  type EntitlementProvider,
  type RoutingAccountState,
} from "./types.js";
import { extractBillingHintsFromClaims } from "./clerkAuth.js";

/** In-memory fixture map used by unit tests and local mock mode. */
export class MapEntitlementProvider implements EntitlementProvider {
  constructor(private readonly states: Map<string, RoutingAccountState>) {}

  async lookup(input: EntitlementLookupInput): Promise<EntitlementDecision> {
    const state = this.states.get(input.clerkUserId) ?? "free";
    return decisionForAccountState(state);
  }

  set(clerkUserId: string, state: RoutingAccountState): void {
    this.states.set(clerkUserId, state);
  }
}

/**
 * Resolves entitlement from verified Clerk session JWT claims first, then
 * optionally from Clerk Backend Billing when a secret key is configured.
 *
 * Does not trust client-supplied plan booleans.
 */
export class ClerkClaimsEntitlementProvider implements EntitlementProvider {
  constructor(
    private readonly options: {
      secretKey?: string;
      /** When true and backend lookup fails, return entitlement_unavailable. */
      failClosedOnBackendError?: boolean;
      fetchImpl?: typeof fetch;
    } = {},
  ) {}

  async lookup(input: EntitlementLookupInput): Promise<EntitlementDecision> {
    const claims = input.sessionClaims ?? {};
    const restricted = readRestrictedState(claims);
    if (restricted) return decisionForAccountState(restricted);

    const hints = extractBillingHintsFromClaims(claims);
    if (hints.hasProPlan || hints.hasUnlimitedRouting) {
      const canceledActive = isCanceledButPeriodActive(claims);
      if (canceledActive) return decisionForAccountState("canceled_period_active");
      return decisionForAccountState("active_paid");
    }

    if (this.options.secretKey) {
      try {
        const backend = await lookupClerkBilling(
          input.clerkUserId,
          this.options.secretKey,
          this.options.fetchImpl ?? fetch,
        );
        if (backend) return backend;
      } catch {
        if (this.options.failClosedOnBackendError !== false) {
          return {
            entitled: false,
            accountState: "unknown",
            source: "none",
            periodEndsAtMs: null,
            reason: "billing_backend_error",
            denialCode: "entitlement_unavailable",
          };
        }
      }
    }

    return decisionForAccountState("free");
  }
}

/**
 * Wraps a base provider with an explicit internal-tester allowlist.
 * Allowlist is only honored when `enabled` is true (non-production envs).
 */
export class AllowlistEntitlementProvider implements EntitlementProvider {
  constructor(
    private readonly base: EntitlementProvider,
    private readonly options: {
      enabled: boolean;
      userIds: Set<string>;
    },
  ) {}

  async lookup(input: EntitlementLookupInput): Promise<EntitlementDecision> {
    if (this.options.enabled && this.options.userIds.has(input.clerkUserId)) {
      return decisionForAccountState("internal");
    }
    return this.base.lookup(input);
  }
}

/** Provider that always reports billing unavailable (for outage tests). */
export class UnavailableEntitlementProvider implements EntitlementProvider {
  async lookup(): Promise<EntitlementDecision> {
    return {
      entitled: false,
      accountState: "unknown",
      source: "none",
      periodEndsAtMs: null,
      reason: "forced_unavailable",
      denialCode: "entitlement_unavailable",
    };
  }
}

function readRestrictedState(claims: Record<string, unknown>): RoutingAccountState | null {
  const status = String(claims.subscription_status ?? claims.billing_status ?? "").toLowerCase();
  if (status === "refunded" || status === "chargeback") return "refunded";
  if (status === "disputed" || status === "dispute") return "disputed";
  const meta = claims.public_metadata;
  if (meta && typeof meta === "object") {
    const routing = (meta as Record<string, unknown>).routing_restriction;
    if (routing === "refunded") return "refunded";
    if (routing === "disputed") return "disputed";
  }
  return null;
}

function isCanceledButPeriodActive(claims: Record<string, unknown>): boolean {
  const status = String(claims.subscription_status ?? "").toLowerCase();
  if (status === "canceled" || status === "cancelled") {
    const periodEnd = Number(claims.current_period_end ?? claims.period_ends_at ?? 0);
    if (Number.isFinite(periodEnd) && periodEnd * (periodEnd < 1e12 ? 1000 : 1) > Date.now()) {
      return true;
    }
  }
  return Boolean(claims.cancel_at_period_end) && Boolean(
    extractBillingHintsFromClaims(claims).hasProPlan ||
      extractBillingHintsFromClaims(claims).hasUnlimitedRouting,
  );
}

async function lookupClerkBilling(
  clerkUserId: string,
  secretKey: string,
  fetchImpl: typeof fetch,
): Promise<EntitlementDecision | null> {
  // Clerk Billing Commerce API — best-effort; JWT claims remain primary.
  const url = new URL("https://api.clerk.com/v1/billing/subscription_items");
  url.searchParams.set("payer_type", "user");
  url.searchParams.set("payer_id", clerkUserId);

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
    },
  });

  if (response.status === 404) return decisionForAccountState("free");
  if (!response.ok) {
    throw new Error(`clerk_billing_http_${response.status}`);
  }

  const body = (await response.json()) as {
    data?: Array<{
      status?: string | null;
      canceled_at?: number | null;
      ended_at?: number | null;
      period_end?: number | null;
      plan?: { slug?: string | null; is_default?: boolean | null; has_base_fee?: boolean | null } | null;
    }>;
  };

  const items = body.data ?? [];
  for (const item of items) {
    const status = String(item.status ?? "").toLowerCase();
    if (status === "refunded" || status === "chargeback") {
      return decisionForAccountState("refunded");
    }
    if (status === "disputed") {
      return decisionForAccountState("disputed");
    }
    if (status === "expired" || status === "ended") {
      continue;
    }

    const plan = item.plan;
    const isPaidPlan =
      plan?.slug === "pro" ||
      (plan != null && plan.is_default === false && Boolean(plan.has_base_fee));

    if (!isPaidPlan) continue;

    if (status === "active" || status === "past_due" || status === "trialing") {
      if (item.canceled_at && item.period_end && item.period_end * 1000 > Date.now()) {
        return {
          ...decisionForAccountState("canceled_period_active"),
          periodEndsAtMs: item.period_end * 1000,
        };
      }
      return decisionForAccountState("active_paid");
    }

    if (
      (status === "canceled" || status === "cancelled") &&
      item.period_end &&
      item.period_end * 1000 > Date.now()
    ) {
      return {
        ...decisionForAccountState("canceled_period_active"),
        periodEndsAtMs: item.period_end * 1000,
      };
    }
  }

  if (items.some((item) => String(item.status ?? "").toLowerCase() === "expired")) {
    return decisionForAccountState("expired");
  }

  return decisionForAccountState("free");
}
