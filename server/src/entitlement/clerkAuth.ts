import { createRemoteJWKSet, jwtVerify, type JWTPayload, type KeyLike } from "jose";

export interface ClerkIdentity {
  clerkUserId: string;
  email?: string;
  sessionId?: string;
  /** Raw verified payload for plan/feature claim inspection. */
  claims: Record<string, unknown>;
}

export interface ClerkVerifyOptions {
  issuer: string;
  jwksUrl: string;
  audiences?: string[];
  authorizedParties?: string[];
  /** Test-only: local JWKS / key material instead of remote fetch. */
  localKey?: KeyLike | Uint8Array;
  clockToleranceSec?: number;
}

export type ClerkSessionVerifier = (token: string) => Promise<ClerkIdentity | null>;

const remoteJwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwks(jwksUrl: string) {
  let cached = remoteJwksCache.get(jwksUrl);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(jwksUrl));
    remoteJwksCache.set(jwksUrl, cached);
  }
  return cached;
}

export function createClerkSessionVerifier(options: ClerkVerifyOptions): ClerkSessionVerifier {
  const issuer = options.issuer.replace(/\/$/, "");
  const audiences = (options.audiences ?? []).map((value) => value.trim()).filter(Boolean);
  const authorizedParties = (options.authorizedParties ?? [])
    .map((value) => value.trim())
    .filter(Boolean);

  return async (token: string): Promise<ClerkIdentity | null> => {
    const raw = token.trim();
    if (!raw || raw.split(".").length !== 3) return null;

    try {
      const verifyOpts: {
        issuer: string;
        audience?: string | string[];
        clockTolerance?: number;
      } = {
        issuer,
        clockTolerance: options.clockToleranceSec ?? 5,
      };
      if (audiences.length === 1) verifyOpts.audience = audiences[0];
      if (audiences.length > 1) verifyOpts.audience = audiences;

      const { payload } = options.localKey
        ? await jwtVerify(raw, options.localKey, verifyOpts)
        : await jwtVerify(raw, getRemoteJwks(options.jwksUrl), verifyOpts);
      return identityFromPayload(payload, authorizedParties);
    } catch {
      return null;
    }
  };
}

function identityFromPayload(
  payload: JWTPayload,
  authorizedParties: string[],
): ClerkIdentity | null {
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub.startsWith("user_")) return null;

  if (authorizedParties.length > 0) {
    const azp = typeof payload.azp === "string" ? payload.azp.trim() : "";
    if (!azp || !authorizedParties.includes(azp)) return null;
  }

  const email =
    (typeof payload.email === "string" && payload.email) ||
    (typeof payload.primary_email_address === "string" && payload.primary_email_address) ||
    undefined;

  const sessionId = typeof payload.sid === "string" ? payload.sid : undefined;

  return {
    clerkUserId: sub,
    ...(email ? { email } : {}),
    ...(sessionId ? { sessionId } : {}),
    claims: payload as Record<string, unknown>,
  };
}

/** Derive Clerk Frontend API host / issuer from a publishable key (pk_test_ / pk_live_). */
export function issuerFromPublishableKey(publishableKey: string): string | null {
  const trimmed = publishableKey.trim();
  const match = trimmed.match(/^pk_(test|live)_(.+)$/);
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[2], "base64").toString("utf8").replace(/\0/g, "").trim();
    const host = decoded.replace(/\$$/, "").trim();
    if (!host || host.includes("://")) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

export function jwksUrlForIssuer(issuer: string): string {
  return `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`;
}

/**
 * Inspect Clerk session JWT plan/feature claims without trusting the client.
 * Clerk Billing commonly encodes plans in `pla` and features in `fea`.
 */
export function extractBillingHintsFromClaims(claims: Record<string, unknown>): {
  hasProPlan: boolean;
  hasUnlimitedRouting: boolean;
} {
  const planText = serializeClaim(claims.pla ?? claims.plan ?? claims.plans);
  const featureText = serializeClaim(claims.fea ?? claims.feature ?? claims.features);

  const hasProPlan =
    /\bpro\b/i.test(planText) ||
    planText.includes(":pro") ||
    planText.includes("o:pro");

  const hasUnlimitedRouting =
    /unlimited_routing/i.test(featureText) ||
    featureText.includes("unlimited_routing");

  return { hasProPlan, hasUnlimitedRouting };
}

function serializeClaim(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(serializeClaim).join(" ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
