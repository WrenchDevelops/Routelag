import type { EntitlementCache } from "./cache.js";
import type { ClerkSessionVerifier } from "./clerkAuth.js";
import {
  createRoutingEntitlementToken,
  type RoutingTokenClaims,
} from "./token.js";
import type { EntitlementDecision, EntitlementProvider } from "./types.js";
import { entitlementErrorBody, type EntitlementDenialCode } from "./types.js";

export interface EntitlementServiceOptions {
  provider: EntitlementProvider;
  cache: EntitlementCache;
  clerkVerifier: ClerkSessionVerifier | null;
  authSecret: string;
  entitlementTtlSeconds: number;
  requireEntitlement: boolean;
  allowInternalInviteEntitlement: boolean;
  internalInviteCodes: Set<string>;
  maxConcurrentSessionsPerUser: number;
}

export interface ExchangeResultOk {
  ok: true;
  token: string;
  testerId: string;
  exp: number;
  accountState: string;
  source: "paid" | "internal";
}

export interface ExchangeResultErr {
  ok: false;
  status: number;
  body: { error: string; code: EntitlementDenialCode };
}

export class EntitlementService {
  constructor(private readonly options: EntitlementServiceOptions) {}

  get requireEntitlement(): boolean {
    return this.options.requireEntitlement;
  }

  get maxConcurrentSessionsPerUser(): number {
    return this.options.maxConcurrentSessionsPerUser;
  }

  /**
   * Exchange a verified Clerk session (or internal invite) for a short-lived
   * routing entitlement token. Ignores any client-supplied plan/entitled fields.
   */
  async exchange(input: {
    clerkSessionToken?: string;
    inviteCode?: string;
    deviceId?: string;
    /** Ignored — present only so forged client fields are demonstrably unused. */
    entitled?: unknown;
    hasUnlimitedRouting?: unknown;
    plan?: unknown;
    planSlug?: unknown;
  }): Promise<ExchangeResultOk | ExchangeResultErr> {
    const deviceId = (input.deviceId ?? "").trim();
    if (!deviceId || deviceId.length > 128) {
      return {
        ok: false,
        status: 400,
        body: { error: "A valid deviceId is required.", code: "invalid_token" },
      };
    }

    // Explicitly discard forged client entitlement fields.
    void input.entitled;
    void input.hasUnlimitedRouting;
    void input.plan;
    void input.planSlug;

    const clerkSessionToken = (input.clerkSessionToken ?? "").trim();
    if (clerkSessionToken) {
      if (!this.options.clerkVerifier) {
        return {
          ok: false,
          status: 503,
          body: entitlementErrorBody("entitlement_unavailable"),
        };
      }
      const identity = await this.options.clerkVerifier(clerkSessionToken);
      if (!identity) {
        return {
          ok: false,
          status: 401,
          body: entitlementErrorBody("invalid_token"),
        };
      }

      const decision = await this.resolveEntitlement(identity.clerkUserId, identity.claims);
      if (!decision.entitled) {
        return {
          ok: false,
          status: denialStatus(decision.denialCode),
          body: entitlementErrorBody(decision.denialCode ?? "subscription_required"),
        };
      }

      const minted = createRoutingEntitlementToken(
        {
          clerkUserId: identity.clerkUserId,
          deviceId,
          accountState: decision.accountState,
          source: decision.source === "internal" ? "internal" : "paid",
          inviteCode: (input.inviteCode ?? "").trim() || undefined,
          ttlSeconds: this.options.entitlementTtlSeconds,
        },
        this.options.authSecret,
      );

      return {
        ok: true,
        token: minted.token,
        testerId: minted.testerId,
        exp: minted.exp,
        accountState: decision.accountState,
        source: decision.source === "internal" ? "internal" : "paid",
      };
    }

    const inviteCode = (input.inviteCode ?? "").trim();
    if (
      inviteCode &&
      this.options.allowInternalInviteEntitlement &&
      this.options.internalInviteCodes.has(inviteCode)
    ) {
      const syntheticUserId = `internal_invite:${inviteCode}`;
      const minted = createRoutingEntitlementToken(
        {
          clerkUserId: syntheticUserId,
          deviceId,
          accountState: "internal",
          source: "internal",
          inviteCode,
          ttlSeconds: this.options.entitlementTtlSeconds,
        },
        this.options.authSecret,
      );
      return {
        ok: true,
        token: minted.token,
        testerId: minted.testerId,
        exp: minted.exp,
        accountState: "internal",
        source: "internal",
      };
    }

    if (inviteCode && !clerkSessionToken) {
      return {
        ok: false,
        status: 403,
        body: entitlementErrorBody("invite_only_insufficient"),
      };
    }

    return {
      ok: false,
      status: 401,
      body: entitlementErrorBody("invalid_token"),
    };
  }

  async resolveEntitlement(
    clerkUserId: string,
    sessionClaims?: Record<string, unknown>,
  ): Promise<EntitlementDecision> {
    const cached = this.options.cache.get(clerkUserId);
    if (cached) return cached;

    const decision = await this.options.provider.lookup({
      clerkUserId,
      sessionClaims,
    });
    this.options.cache.set(clerkUserId, decision);
    return decision;
  }

  /**
   * Create requires a routing_entitlement token when enforcement is on.
   * Invite-only tokens are rejected.
   */
  assertCanCreateRoute(claims: RoutingTokenClaims): EntitlementDenialCode | null {
    if (!this.options.requireEntitlement) return null;
    if (claims.tokenType !== "routing_entitlement") {
      return "invite_only_insufficient";
    }
    if (!claims.clerkUserId || !claims.deviceId) {
      return "invalid_token";
    }
    if (claims.source !== "paid" && claims.source !== "internal") {
      return "subscription_required";
    }
    return null;
  }

  subjectKey(claims: RoutingTokenClaims): string {
    return claims.clerkUserId ?? claims.testerId;
  }
}

function denialStatus(code: EntitlementDenialCode | undefined): number {
  switch (code) {
    case "entitlement_unavailable":
      return 503;
    case "invalid_token":
      return 401;
    case "concurrent_session_limit":
      return 409;
    default:
      return 403;
  }
}
