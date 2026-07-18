import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import type { RoutingAccountState } from "./types.js";

export type RoutingTokenType = "invite" | "routing_entitlement";

export interface RoutingTokenClaims {
  tokenType: RoutingTokenType;
  testerId: string;
  inviteCode: string;
  exp: number;
  /** Present on entitlement tokens. */
  clerkUserId?: string;
  deviceId?: string;
  accountState?: RoutingAccountState;
  source?: "paid" | "internal";
  jti?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createInviteToken(
  inviteCode: string,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 14,
): { token: string; testerId: string } {
  const testerId = `tester_${randomUUID()}`;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      tokenType: "invite",
      testerId,
      inviteCode,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    } satisfies RoutingTokenClaims),
  );
  const body = `${header}.${payload}`;
  return { testerId, token: `${body}.${sign(body, secret)}` };
}

export function createRoutingEntitlementToken(
  input: {
    clerkUserId: string;
    deviceId: string;
    accountState: RoutingAccountState;
    source: "paid" | "internal";
    inviteCode?: string;
    ttlSeconds: number;
  },
  secret: string,
): { token: string; testerId: string; exp: number; jti: string } {
  const testerId = `user_${input.clerkUserId}`;
  const exp = Math.floor(Date.now() / 1000) + input.ttlSeconds;
  const jti = randomUUID();
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      tokenType: "routing_entitlement",
      testerId,
      inviteCode: input.inviteCode ?? "",
      clerkUserId: input.clerkUserId,
      deviceId: input.deviceId,
      accountState: input.accountState,
      source: input.source,
      jti,
      exp,
    } satisfies RoutingTokenClaims),
  );
  const body = `${header}.${payload}`;
  return { testerId, token: `${body}.${sign(body, secret)}`, exp, jti };
}

export function verifyRoutingToken(token: string, secret: string): RoutingTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const body = `${parts[0]}.${parts[1]}`;
  const expected = sign(body, secret);
  const actual = parts[2];
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  if (expectedBuffer.length !== actualBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, actualBuffer)) return null;

  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as RoutingTokenClaims;
    if (!claims.testerId || claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    // Legacy invite tokens minted before tokenType existed.
    if (!claims.tokenType) {
      if (!claims.inviteCode) return null;
      return { ...claims, tokenType: "invite" };
    }
    if (claims.tokenType === "invite") {
      if (!claims.inviteCode) return null;
      return claims;
    }
    if (claims.tokenType === "routing_entitlement") {
      if (!claims.clerkUserId || !claims.deviceId || !claims.source || !claims.accountState) {
        return null;
      }
      return claims;
    }
    return null;
  } catch {
    return null;
  }
}
