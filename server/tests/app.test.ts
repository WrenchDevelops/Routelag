import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { RouteServerConfig } from "../src/config.js";

const betaServers: RouteServerConfig[] = [
  {
    id: "johannesburg-beta",
    gameId: "fortnite",
    name: "Johannesburg Beta",
    region: "South Africa",
    city: "Johannesburg",
    country: "ZA",
    status: "online",
    endpointHost: "102.211.56.103",
    endpoint: "102.211.56.103:51820",
    serverPublicKey: "server-public-key",
    allowedIps: "15.184.0.10/32 15.184.0.11/32",
    mtu: 1280,
    notes: "Main local South Africa route for Middle East comparison.",
    debugLabel: "sa-main",
    recommended: true,
    pingEstimate: "Test in Fortnite",
  },
  {
    id: "frankfurt-beta",
    gameId: "fortnite",
    name: "Frankfurt Beta",
    region: "Europe / Middle East bridge",
    city: "Frankfurt",
    country: "DE",
    status: "online",
    endpointHost: "198.51.100.20",
    endpoint: "198.51.100.20:51820",
    serverPublicKey: "server-public-key",
    allowedIps: "15.184.0.10/32 15.184.0.11/32",
    mtu: 1280,
    notes: "Main Europe/Middle East bridge.",
    debugLabel: "eu-me-main",
    recommended: true,
    pingEstimate: "Test in Fortnite",
  },
  {
    id: "london-beta",
    gameId: "fortnite",
    name: "London Beta",
    region: "Europe backup bridge",
    city: "London",
    country: "GB",
    status: "online",
    endpointHost: "198.51.100.30",
    endpoint: "198.51.100.30:51820",
    serverPublicKey: "server-public-key",
    allowedIps: "15.184.0.10/32 15.184.0.11/32",
    mtu: 1280,
    notes: "Backup Europe bridge.",
    debugLabel: "eu-backup",
    recommended: false,
    pingEstimate: "Test in Fortnite",
  },
  {
    id: "amsterdam-beta",
    gameId: "fortnite",
    name: "Amsterdam Beta",
    region: "Europe comparison route",
    city: "Amsterdam",
    country: "NL",
    status: "online",
    endpointHost: "198.51.100.40",
    endpoint: "198.51.100.40:51820",
    serverPublicKey: "server-public-key",
    allowedIps: "15.184.0.10/32 15.184.0.11/32",
    mtu: 1280,
    notes: "Extra comparison route.",
    debugLabel: "eu-compare",
    recommended: false,
    pingEstimate: "Test in Fortnite",
  },
];

function testConfig() {
  const dir = mkdtempSync(join(tmpdir(), "routelag-server-"));
  return {
    dir,
    config: loadConfig({
      dataFile: join(dir, "db.json"),
      reportsDir: join(dir, "reports"),
      authSecret: "test-secret",
      adminSecret: "admin-secret",
      inviteCodes: new Set(["BETA-SA-001"]),
      peerMode: "mock",
      routeServers: betaServers,
    }),
  };
}

test("rejects invalid invite and protects route creation", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const badLogin = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "NOPE" },
  });
  assert.equal(badLogin.statusCode, 401);

  const create = await app.inject({
    method: "POST",
    url: "/api/routes/create",
    payload: { gameId: "fortnite", serverId: "johannesburg-beta", clientPublicKey: "abc" },
  });
  assert.equal(create.statusCode, 401);
});

test("lists the four South Africa Middle East beta routes", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const response = await app.inject({
    method: "GET",
    url: "/api/servers?game=fortnite",
  });
  assert.equal(response.statusCode, 200);
  const servers = response.json<{ servers: Array<{ id: string; status: string; allowedIps: string[] }> }>().servers;
  assert.deepEqual(
    servers.map((server) => server.id),
    ["johannesburg-beta", "frankfurt-beta", "london-beta", "amsterdam-beta"],
  );
  assert.equal(servers.every((server) => server.status === "online"), true);
  assert.equal(servers.every((server) => server.allowedIps.every((ip) => ip.endsWith("/32"))), true);
});

test("creates, reports, and ends a mock route session", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json<{ token: string }>().token;

  const create = await app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "johannesburg-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.2.0",
    },
  });
  assert.equal(create.statusCode, 200);
  const session = create.json<{
    sessionId: string;
    clientAddress: string;
    endpoint: string;
    allowedIps: string;
  }>();
  assert.equal(session.clientAddress, "10.66.66.2/32");
  assert.equal(session.endpoint, "102.211.56.103:51820");
  assert.equal(session.allowedIps, "15.184.0.10/32 15.184.0.11/32");

  const status = await app.inject({
    method: "GET",
    url: `/api/routes/status/${session.sessionId}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json<{ active: boolean }>().active, true);

  const end = await app.inject({
    method: "POST",
    url: "/api/routes/end",
    headers: { authorization: `Bearer ${token}` },
    payload: { sessionId: session.sessionId },
  });
  assert.equal(end.statusCode, 200);
  assert.equal(end.json<{ active: boolean }>().active, false);
});

test("blocks beta routes that are not targeted IPv4 host routes", async () => {
  const { dir, config } = testConfig();
  config.routeServers = [
    {
      ...betaServers[0],
      allowedIps: "0.0.0.0/0",
    },
  ];
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  const create = await app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "johannesburg-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.1.2",
    },
  });
  assert.equal(create.statusCode, 409);
  assert.match(create.json<{ error: string }>().error, /targeted IPv4 \/32/);
});

test("admin sessions require admin auth and expose beta session metadata", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const unauthorized = await app.inject({
    method: "GET",
    url: "/api/admin/sessions",
  });
  assert.equal(unauthorized.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  await app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "frankfurt-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.1.2",
    },
  });

  const sessions = await app.inject({
    method: "GET",
    url: "/api/admin/sessions",
    headers: { "x-admin-token": "admin-secret" },
  });
  assert.equal(sessions.statusCode, 200);
  const body = sessions.json<{ sessions: Array<{ serverId: string; inviteCode: string; allowedIps: string }> }>();
  assert.equal(body.sessions[0].serverId, "frankfurt-beta");
  assert.equal(body.sessions[0].inviteCode, "BETA-SA-001");
  assert.equal(body.sessions[0].allowedIps, "15.184.0.10/32 15.184.0.11/32");
});

test("returns auto route candidates for fortnite middle-east", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  const response = await app.inject({
    method: "GET",
    url: "/api/routes/candidates?game=fortnite&region=middle-east",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 200);

  const body = response.json<{ candidates: Array<{ id: string; type: string; canStart: boolean; estimateOnly: boolean; chainSupported: boolean }> }>();
  const { candidates } = body;

  // 1 direct + 4 single-hop + 3 chain (Johannesburg → Frankfurt/London/Amsterdam)
  assert.equal(candidates.length, 8);

  const direct = candidates.find((c) => c.type === "direct");
  assert.ok(direct, "should have a direct candidate");
  assert.equal(direct?.canStart, false);
  assert.equal(direct?.estimateOnly, false);

  const singles = candidates.filter((c) => c.type === "single");
  assert.equal(singles.length, 4);
  assert.deepEqual(
    singles.map((c) => c.id),
    ["johannesburg-beta", "frankfurt-beta", "london-beta", "amsterdam-beta"],
  );
  // All single-hop servers are online in testConfig so all can start
  assert.equal(singles.every((c) => c.canStart), true);

  const chains = candidates.filter((c) => c.type === "chain");
  assert.equal(chains.length, 3);
  assert.equal(chains.every((c) => c.canStart === false), true);
  assert.equal(chains.every((c) => c.estimateOnly === true), true);
  assert.equal(chains.every((c) => c.chainSupported === false), true);
});

test("POST /api/routes/test ranks direct vs single with known measurements", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  // Frankfurt has much lower latency than direct
  const response = await app.inject({
    method: "POST",
    url: "/api/routes/test",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      game: "fortnite",
      region: "middle-east",
      directMeasurement: { latencyMs: 120, jitterMs: 25, packetLossPct: 0, method: "icmp" },
      clientMeasurements: [
        { nodeId: "johannesburg-beta", latencyMs: 20, jitterMs: 5, packetLossPct: 0, method: "icmp" },
        { nodeId: "frankfurt-beta", latencyMs: 85, jitterMs: 8, packetLossPct: 0, method: "icmp" },
        { nodeId: "london-beta", latencyMs: 95, jitterMs: 10, packetLossPct: 0, method: "icmp" },
        { nodeId: "amsterdam-beta", latencyMs: 90, jitterMs: 12, packetLossPct: 0, method: "icmp" },
      ],
    },
  });
  assert.equal(response.statusCode, 200);

  const result = response.json<{
    rankedRoutes: Array<{ candidate: { id: string; type: string }; score: number }>;
    recommendedRoute: { candidate: { type: string } } | null;
    directIsBetter: boolean;
    chainRoutesAvailable: boolean;
  }>();

  // Johannesburg (20ms latency) should rank first (lowest score)
  assert.equal(result.rankedRoutes[0].candidate.id, "johannesburg-beta");
  assert.equal(result.directIsBetter, false);
  assert.ok(result.recommendedRoute, "should have a recommendation");
  assert.equal(result.chainRoutesAvailable, false);
});

test("POST /api/routes/test recommends direct when RouteLag is not meaningfully better", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  // All RouteLag nodes are only 2ms better — below the 5ms threshold
  const response = await app.inject({
    method: "POST",
    url: "/api/routes/test",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      game: "fortnite",
      region: "middle-east",
      directMeasurement: { latencyMs: 50, jitterMs: 10, packetLossPct: 0, method: "icmp" },
      clientMeasurements: [
        { nodeId: "johannesburg-beta", latencyMs: 49, jitterMs: 10, packetLossPct: 0, method: "icmp" },
        { nodeId: "frankfurt-beta", latencyMs: 49, jitterMs: 10, packetLossPct: 0, method: "icmp" },
        { nodeId: "london-beta", latencyMs: 49, jitterMs: 10, packetLossPct: 0, method: "icmp" },
        { nodeId: "amsterdam-beta", latencyMs: 49, jitterMs: 10, packetLossPct: 0, method: "icmp" },
      ],
    },
  });
  assert.equal(response.statusCode, 200);
  const result = response.json<{ directIsBetter: boolean; recommendedRoute: { candidate: { type: string } } | null }>();
  assert.equal(result.directIsBetter, true);
  assert.equal(result.recommendedRoute?.candidate.type, "direct");
});

test("rejects chain route creation with clear message", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  const create = await app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "johannesburg-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      routePlan: {
        type: "chain",
        entryServerId: "johannesburg-beta",
        exitServerId: "frankfurt-beta",
      },
    },
  });
  assert.equal(create.statusCode, 409);
  assert.equal(
    create.json<{ error: string }>().error,
    "Multi-hop routing is not available in this build.",
  );
});

test("creates session via routePlan.type=single (backward compat with legacy body)", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;

  const create = await app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: "johannesburg-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.1.3",
      routePlan: { type: "single", serverId: "johannesburg-beta" },
    },
  });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json<{ serverId: string }>().serverId, "johannesburg-beta");
});

function tCleanup(dir: string, app: Awaited<ReturnType<typeof buildApp>>) {
  test.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
}
