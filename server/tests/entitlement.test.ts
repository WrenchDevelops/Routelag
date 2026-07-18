import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import {
  EntitlementCache,
  MapEntitlementProvider,
  UnavailableEntitlementProvider,
  createClerkSessionVerifier,
  type RoutingAccountState,
} from "../src/entitlement/index.js";
import type { RouteNode } from "../src/nodes.js";

const dallasNode: RouteNode = {
  id: "dallas-beta",
  gameId: "fortnite",
  name: "Dallas Beta",
  label: "NA-Central Test Node",
  region: "NA-Central",
  city: "Dallas",
  country: "US",
  available: true,
  endpoint: "216.152.154.137:51820",
  publicIp: "216.152.154.137",
  wireguardPort: 51820,
  publicKey: "/94WFr4JNsNAkn97XN9eoHK4i/4RDFGcpaZJOQb8pFw=",
  tunnelCidr: "10.67.0.0/24",
  serverTunnelIp: "10.67.0.1",
  clientStartIp: "10.67.0.10",
  wgInterface: "wg0",
  targets: [
    {
      id: "fortnite-na-epic",
      ip: "18.88.0.0",
      cidr: "18.88.0.0/16",
      region: "NA",
      protocol: "udp",
      ports: [],
      enabled: true,
    },
  ],
  provisioner: { mode: "local" },
  tags: ["na", "dallas"],
  notes: "",
  debugLabel: "na-central",
  recommended: false,
  pingEstimate: "Test",
};

const CLIENT_KEY = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=";
const ISSUER = "https://clerk.test";

async function setupClerk() {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-kid";
  jwk.alg = "RS256";
  const verifier = createClerkSessionVerifier({
    issuer: ISSUER,
    jwksUrl: `${ISSUER}/.well-known/jwks.json`,
    localKey: publicKey,
  });

  async function mintClerkJwt(
    userId: string,
    claims: Record<string, unknown> = {},
  ): Promise<string> {
    return new SignJWT({
      pla: claims.pla,
      fea: claims.fea,
      subscription_status: claims.subscription_status,
      current_period_end: claims.current_period_end,
      cancel_at_period_end: claims.cancel_at_period_end,
      public_metadata: claims.public_metadata,
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
  }

  return { verifier, mintClerkJwt };
}

function baseConfig(dir: string, overrides: Parameters<typeof loadConfig>[0] = {}) {
  return loadConfig({
    dataFile: join(dir, "db.json"),
    reportsDir: join(dir, "reports"),
    peersFile: join(dir, "peers.json"),
    runtimeControlsFile: join(dir, "runtime-controls.json"),
    wgConfigFile: join(dir, "wg0.conf"),
    authSecret: "entitlement-test-secret",
    inviteCodes: new Set(["BETA-SA-001", "NORMAL-INVITE"]),
    peerMode: "mock",
    nodes: [dallasNode],
    requireRoutingEntitlement: true,
    deploymentEnv: "development",
    allowInternalRoutingEntitlement: true,
    internalRoutingInviteCodes: new Set(["BETA-SA-001"]),
    internalRoutingUserIds: new Set(["user_internal_allow"]),
    entitlementTokenTtlSeconds: 60,
    entitlementCacheTtlMs: 50,
    maxConcurrentSessionsPerUser: 1,
    ...overrides,
  });
}

function cleanup(dir: string, app: Awaited<ReturnType<typeof buildApp>>) {
  test.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

async function exchange(
  app: Awaited<ReturnType<typeof buildApp>>,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url: "/api/entitlements/routing-token",
    payload,
  });
}

async function createRoute(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  extra: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "dallas-beta",
      clientPublicKey: CLIENT_KEY,
      appVersion: "0.2.1",
      ...extra,
    },
  });
}

test("active paid user can create route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_paid", "active_paid"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const clerkSessionToken = await mintClerkJwt("user_paid", { pla: "o:pro" });
  const minted = await exchange(app, {
    clerkSessionToken,
    deviceId: "device-paid",
    // Forged client fields must be ignored:
    entitled: false,
    hasUnlimitedRouting: false,
    plan: "free",
    planSlug: "free",
  });
  assert.equal(minted.statusCode, 200, minted.body);
  const token = minted.json<{ token: string }>().token;

  const create = await createRoute(app, token, {
    entitled: false,
    hasUnlimitedRouting: false,
    planSlug: "free",
  });
  assert.equal(create.statusCode, 200, create.body);
});

test("free user cannot create route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_free", "free"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const clerkSessionToken = await mintClerkJwt("user_free");
  const minted = await exchange(app, {
    clerkSessionToken,
    deviceId: "device-free",
    entitled: true,
    hasUnlimitedRouting: true,
    plan: "pro",
  });
  assert.equal(minted.statusCode, 403);
  assert.equal(minted.json<{ code: string }>().code, "subscription_required");
});

test("expired user cannot create route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_expired", "expired"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const clerkSessionToken = await mintClerkJwt("user_expired");
  const minted = await exchange(app, { clerkSessionToken, deviceId: "device-expired" });
  assert.equal(minted.statusCode, 403);
  assert.equal(minted.json<{ code: string }>().code, "subscription_expired");
});

test("canceled but still active user can create route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([
    ["user_canceled_active", "canceled_period_active"],
  ]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const clerkSessionToken = await mintClerkJwt("user_canceled_active");
  const minted = await exchange(app, {
    clerkSessionToken,
    deviceId: "device-canceled",
  });
  assert.equal(minted.statusCode, 200, minted.body);
  const create = await createRoute(app, minted.json<{ token: string }>().token);
  assert.equal(create.statusCode, 200, create.body);
});

test("refunded user cannot create route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_refunded", "refunded"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const clerkSessionToken = await mintClerkJwt("user_refunded");
  const minted = await exchange(app, { clerkSessionToken, deviceId: "device-refunded" });
  assert.equal(minted.statusCode, 403);
  assert.equal(minted.json<{ code: string }>().code, "account_restricted");
});

test("invalid token cannot create route", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const app = await buildApp(baseConfig(dir));
  cleanup(dir, app);

  const create = await createRoute(app, "not.a.jwt");
  assert.equal(create.statusCode, 401);
});

test("invite-only token without entitlement cannot create route", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const app = await buildApp(baseConfig(dir));
  cleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "NORMAL-INVITE" },
  });
  assert.equal(login.statusCode, 200);
  const inviteToken = login.json<{ token: string }>().token;

  const create = await createRoute(app, inviteToken);
  assert.equal(create.statusCode, 403);
  assert.equal(create.json<{ code: string }>().code, "invite_only_insufficient");

  const exchangeDenied = await exchange(app, {
    inviteCode: "NORMAL-INVITE",
    deviceId: "device-invite-only",
  });
  assert.equal(exchangeDenied.statusCode, 403);
  assert.equal(exchangeDenied.json<{ code: string }>().code, "invite_only_insufficient");
});

test("internal tester allowlist works only in allowed environments", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();

  {
    const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
    const fixtures = new Map<string, RoutingAccountState>();
    const app = await buildApp(
      baseConfig(dir, {
        clerkSessionVerifier: verifier,
        entitlementFixtures: fixtures,
        deploymentEnv: "development",
        allowInternalRoutingEntitlement: true,
        internalRoutingUserIds: new Set(["user_internal_allow"]),
      }),
    );
    cleanup(dir, app);

    const clerkSessionToken = await mintClerkJwt("user_internal_allow");
    const minted = await exchange(app, {
      clerkSessionToken,
      deviceId: "device-internal",
    });
    assert.equal(minted.statusCode, 200, minted.body);
    assert.equal(minted.json<{ source: string }>().source, "internal");
  }

  {
    const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
    const fixtures = new Map<string, RoutingAccountState>();
    const app = await buildApp(
      baseConfig(dir, {
        clerkSessionVerifier: verifier,
        entitlementFixtures: fixtures,
        deploymentEnv: "production",
        allowInternalRoutingEntitlement: true,
        internalRoutingUserIds: new Set(["user_internal_allow"]),
      }),
    );
    cleanup(dir, app);

    const clerkSessionToken = await mintClerkJwt("user_internal_allow");
    const minted = await exchange(app, {
      clerkSessionToken,
      deviceId: "device-internal-prod",
    });
    assert.equal(minted.statusCode, 403);
    assert.equal(minted.json<{ code: string }>().code, "subscription_required");
  }
});

test("user cannot end another user's route", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([
    ["user_a", "active_paid"],
    ["user_b", "active_paid"],
  ]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const tokenA = (
    await exchange(app, {
      clerkSessionToken: await mintClerkJwt("user_a"),
      deviceId: "device-a",
    })
  ).json<{ token: string }>().token;
  const tokenB = (
    await exchange(app, {
      clerkSessionToken: await mintClerkJwt("user_b"),
      deviceId: "device-b",
    })
  ).json<{ token: string }>().token;

  const create = await createRoute(app, tokenA);
  assert.equal(create.statusCode, 200);
  const sessionId = create.json<{ sessionId: string }>().sessionId;

  const endAsB = await app.inject({
    method: "POST",
    url: "/api/routes/end",
    headers: { authorization: `Bearer ${tokenB}` },
    payload: { sessionId },
  });
  assert.equal(endAsB.statusCode, 404);
});

test("concurrent-session limit is enforced", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_multi", "active_paid"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
      maxConcurrentSessionsPerUser: 1,
    }),
  );
  cleanup(dir, app);

  const token = (
    await exchange(app, {
      clerkSessionToken: await mintClerkJwt("user_multi"),
      deviceId: "device-1",
    })
  ).json<{ token: string }>().token;

  const first = await createRoute(app, token);
  assert.equal(first.statusCode, 200, first.body);

  const second = await createRoute(app, token);
  assert.equal(second.statusCode, 409);
  assert.equal(second.json<{ code: string }>().code, "concurrent_session_limit");
});

test("cached entitlement expires and re-checks provider", async () => {
  const cache = new EntitlementCache(30);
  const provider = new MapEntitlementProvider(
    new Map<string, RoutingAccountState>([["user_cache", "active_paid"]]),
  );
  cache.set("user_cache", await provider.lookup({ clerkUserId: "user_cache" }));
  assert.equal(cache.get("user_cache")?.entitled, true);

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(cache.get("user_cache"), null);

  provider.set("user_cache", "expired");
  const next = await provider.lookup({ clerkUserId: "user_cache" });
  assert.equal(next.entitled, false);
  assert.equal(next.denialCode, "subscription_expired");
});

test("billing backend unavailable fails closed on exchange", async () => {
  const { mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: async (token) => {
        if (!token) return null;
        return {
          clerkUserId: "user_outage",
          claims: {},
        };
      },
      entitlementProvider: new UnavailableEntitlementProvider(),
    }),
  );
  cleanup(dir, app);

  const minted = await exchange(app, {
    clerkSessionToken: await mintClerkJwt("user_outage"),
    deviceId: "device-outage",
  });
  assert.equal(minted.statusCode, 503);
  assert.equal(minted.json<{ code: string }>().code, "entitlement_unavailable");
});

test("forged client entitlement fields are ignored", async () => {
  const { verifier, mintClerkJwt } = await setupClerk();
  const dir = mkdtempSync(join(tmpdir(), "rl-ent-"));
  const fixtures = new Map<string, RoutingAccountState>([["user_forge", "free"]]);
  const app = await buildApp(
    baseConfig(dir, {
      clerkSessionVerifier: verifier,
      entitlementFixtures: fixtures,
    }),
  );
  cleanup(dir, app);

  const minted = await exchange(app, {
    clerkSessionToken: await mintClerkJwt("user_forge"),
    deviceId: "device-forge",
    entitled: true,
    hasUnlimitedRouting: true,
    plan: "pro",
    planSlug: "pro",
  });
  assert.equal(minted.statusCode, 403);
  assert.equal(minted.json<{ code: string }>().code, "subscription_required");
});
