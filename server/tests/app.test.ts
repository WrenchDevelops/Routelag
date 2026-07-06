import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { computeAllowedIps } from "../src/nodes.js";
import type { RouteNode } from "../src/nodes.js";
import { normalizeOsirionToPathGen } from "../src/replay/pathgenNormalizer.js";

const testNodes: RouteNode[] = [
  {
    id: "johannesburg-beta",
    gameId: "fortnite",
    name: "Johannesburg Beta",
    label: "South Africa Test Node",
    region: "South Africa",
    city: "Johannesburg",
    country: "ZA",
    available: true,
    endpoint: "102.211.56.103:51820",
    publicIp: "102.211.56.103",
    wireguardPort: 51820,
    publicKey: "server-public-key",
    tunnelCidr: "10.66.66.0/24",
    serverTunnelIp: "10.66.66.1",
    clientStartIp: "10.66.66.10",
    wgInterface: "wg0",
    targets: [],
    provisioner: { mode: "disabled" },
    tags: ["sa", "johannesburg", "beta"],
    notes: "Main local South Africa route for Middle East comparison.",
    debugLabel: "sa-main",
    recommended: true,
    pingEstimate: "Test in Fortnite",
  },
  {
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
    tags: ["na", "nac", "dallas", "beta"],
    notes: "NA-Central test node for targeted Fortnite routing.",
    debugLabel: "na-central",
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
      nodes: testNodes.map((node) => ({ ...node })),
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
    payload: { gameId: "fortnite", serverId: "dallas-beta", clientPublicKey: "abc" },
  });
  assert.equal(create.statusCode, 401);
});

test("lists the Johannesburg and Dallas beta routes", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const response = await app.inject({
    method: "GET",
    url: "/api/servers?game=fortnite",
  });
  assert.equal(response.statusCode, 200);
  const servers = response.json<{ servers: Array<{ id: string; status: string; allowedIps: string[]; tunnelCidr?: string }> }>().servers;
  assert.deepEqual(servers.map((server) => server.id), ["johannesburg-beta", "dallas-beta"]);
  assert.equal(servers.every((server) => server.status === "online"), true);
  assert.deepEqual(
    servers.find((server) => server.id === "dallas-beta")?.allowedIps,
    ["18.88.0.0/16"],
  );
  assert.equal(servers.find((server) => server.id === "dallas-beta")?.tunnelCidr, "10.67.0.0/24");
});

test("creates, reports, and ends a mock route session on Dallas", async () => {
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
      serverId: "dallas-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.2.0",
    },
  });
  assert.equal(create.statusCode, 200);
  const session = create.json<{
    sessionId: string;
    nodeId: string;
    clientAddress: string;
    endpoint: string;
    allowedIps: string;
    serverPublicKey: string;
    targetIps: string[];
  }>();
  assert.equal(session.nodeId, "dallas-beta");
  assert.equal(session.clientAddress, "10.67.0.10/32");
  assert.equal(session.endpoint, "216.152.154.137:51820");
  assert.equal(session.serverPublicKey, "/94WFr4JNsNAkn97XN9eoHK4i/4RDFGcpaZJOQb8pFw=");
  assert.equal(session.allowedIps, "10.67.0.0/24, 18.88.0.0/16");
  assert.deepEqual(session.targetIps, ["18.88.0.0"]);

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

test("computes Dallas WireGuard allowed IPs without full-tunnel entries", () => {
  const dallas = testNodes.find((node) => node.id === "dallas-beta")!;
  const allowedIps = computeAllowedIps(dallas);
  assert.deepEqual(allowedIps, ["10.67.0.0/24", "18.88.0.0/16"]);
  assert.equal(allowedIps.join(", "), "10.67.0.0/24, 18.88.0.0/16");
  assert.equal(allowedIps.includes("0.0.0.0/0"), false);
  assert.equal(allowedIps.includes("::/0"), false);
});

test("Johannesburg does not use Dallas tunnel CIDR or Dallas target IP", () => {
  const johannesburg = testNodes.find((node) => node.id === "johannesburg-beta")!;
  const allowedIps = computeAllowedIps(johannesburg);
  assert.deepEqual(allowedIps, ["10.66.66.0/24"]);
  assert.equal(allowedIps.includes("10.67.0.0/24"), false);
  assert.equal(allowedIps.includes("18.88.0.0/16"), false);
});

test("rejects Johannesburg session when peer provisioning is disabled", async () => {
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
      appVersion: "0.2.0",
    },
  });
  assert.equal(create.statusCode, 409);
  assert.equal(
    create.json<{ error: string }>().error,
    "Peer provisioning is not configured for this node yet.",
  );
});

test("blocks beta routes that are not targeted IPv4 host routes", async () => {
  const { dir, config } = testConfig();
  const dallas = testNodes.find((node) => node.id === "dallas-beta")!;
  config.nodes = [
    {
      ...dallas,
      targets: [
        {
          id: "unsafe-broad-route",
          ip: "192.168.0.0",
          cidr: "192.168.0.0/16",
          region: "unsafe",
          enabled: true,
        },
      ],
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
      serverId: "dallas-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.1.2",
    },
  });
  assert.equal(create.statusCode, 409);
  assert.match(create.json<{ error: string }>().error, /targeted game routes only/);
});

test("admin sessions require admin auth and expose node metadata", async () => {
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
      serverId: "dallas-beta",
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
  const body = sessions.json<{ sessions: Array<{ nodeId: string; inviteCode: string; allowedIps: string }> }>();
  assert.equal(body.sessions[0].nodeId, "dallas-beta");
  assert.equal(body.sessions[0].inviteCode, "BETA-SA-001");
  assert.match(body.sessions[0].allowedIps, /10\.67\.0\.0\/24/);
});

test("returns auto route candidates and nodes for fortnite", async () => {
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

  const body = response.json<{
    nodes: Array<{ id: string; available: boolean }>;
    candidates: Array<{
      id: string;
      type: string;
      canStart: boolean;
      estimateOnly: boolean;
      chainSupported: boolean;
      label?: string;
      status?: string;
      gameRouteCidrs?: string[];
    }>;
    targets: Array<{ id: string; cidr: string; nodeId: string }>;
  }>();
  const { nodes, candidates, targets } = body;

  assert.deepEqual(nodes.map((n) => n.id), ["johannesburg-beta", "dallas-beta"]);

  // 1 direct + 2 single-hop + 1 chain (Johannesburg → Dallas)
  assert.equal(candidates.length, 4);

  const direct = candidates.find((c) => c.type === "direct");
  assert.ok(direct, "should have a direct candidate");
  assert.equal(direct?.canStart, false);
  assert.equal(direct?.estimateOnly, false);

  const singles = candidates.filter((c) => c.type === "single");
  assert.equal(singles.length, 2);
  assert.deepEqual(singles.map((c) => c.id), ["johannesburg-beta", "dallas-beta"]);
  assert.equal(singles.find((c) => c.id === "johannesburg-beta")?.canStart, false);
  assert.equal(singles.find((c) => c.id === "dallas-beta")?.canStart, true);

  const dallas = singles.find((c) => c.id === "dallas-beta");
  assert.equal(dallas?.label, "Dallas Beta");
  assert.equal(dallas?.status, "online");
  assert.deepEqual(dallas?.gameRouteCidrs, ["18.88.0.0/16"]);
  assert.deepEqual(
    targets.filter((target) => target.nodeId === "dallas-beta").map((target) => target.cidr),
    ["18.88.0.0/16"],
  );
  assert.deepEqual(
    targets.filter((target) => target.nodeId === "johannesburg-beta"),
    [],
  );

  const chains = candidates.filter((c) => c.type === "chain");
  assert.equal(chains.length, 1);
  assert.equal(chains[0].id, "johannesburg-beta--dallas-beta");
  assert.equal(chains.every((c) => c.canStart === false), true);
  assert.equal(chains.every((c) => c.estimateOnly === true), true);
  assert.equal(chains.every((c) => c.chainSupported === false), true);
});

test("health endpoint reports node status", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ ok: boolean; peerMode: string; nodes: Array<{ id: string; online: boolean; endpoint: string | null; canStart: boolean }> }>();
  assert.equal(body.ok, true);
  assert.equal(body.peerMode, "mock");
  assert.equal(body.nodes.length, 2);
  const dallas = body.nodes.find((node) => node.id === "dallas-beta");
  assert.equal(dallas?.endpoint, "216.152.154.137:51820");
  assert.equal(dallas?.canStart, true);
  const johannesburg = body.nodes.find((node) => node.id === "johannesburg-beta");
  assert.equal(johannesburg?.canStart, false);
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
        { nodeId: "dallas-beta", latencyMs: 85, jitterMs: 8, packetLossPct: 0, method: "icmp" },
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
        { nodeId: "dallas-beta", latencyMs: 49, jitterMs: 10, packetLossPct: 0, method: "icmp" },
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
        exitServerId: "dallas-beta",
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
      serverId: "dallas-beta",
      clientPublicKey: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890+/=",
      appVersion: "0.1.3",
      routePlan: { type: "single", serverId: "dallas-beta" },
    },
  });
  assert.equal(create.statusCode, 200);
  assert.equal(create.json<{ serverId: string }>().serverId, "dallas-beta");
});

test("replay upload requires auth and rejects non-replay files", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const unauthorized = await app.inject({
    method: "GET",
    url: "/api/replays/jobs",
  });
  assert.equal(unauthorized.statusCode, 401);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;
  const upload = await app.inject({
    method: "POST",
    url: "/api/replays/upload",
    headers: {
      authorization: `Bearer ${token}`,
      ...multipartHeaders("not-a-replay.txt", "hello"),
    },
    payload: multipartBody("not-a-replay.txt", "hello"),
  });
  assert.equal(upload.statusCode, 400);
  assert.match(upload.json<{ error: string }>().error, /\.replay/);
});

test("replay upload rejects files larger than configured max", async () => {
  const { dir, config } = testConfig();
  config.replayUploadMaxMb = 0.000001;
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-SA-001" },
  });
  const token = login.json<{ token: string }>().token;
  const upload = await app.inject({
    method: "POST",
    url: "/api/replays/upload",
    headers: {
      authorization: `Bearer ${token}`,
      ...multipartHeaders("match.replay", "x".repeat(10_000)),
    },
    payload: multipartBody("match.replay", "x".repeat(10_000)),
  });
  assert.equal(upload.statusCode, 413);
  assert.match(upload.json<{ error: string }>().error, /large/i);
});

test("normalizes Osirion match data into PathGen replay without inventing missing fields", () => {
  const replay = normalizeOsirionToPathGen({
    jobId: "job_1",
    userId: "tester_1",
    fileName: "match.replay",
    fileHash: "abc123",
    createdAt: "2026-07-03T00:00:00.000Z",
    match: {
      info: { matchId: "match_1", gameMode: "Battle Royale", lengthMs: 620000 },
      players: [{ isReplayOwner: true, eliminations: 4, shots: 10, hits: 3 }],
      events: {},
    },
  });
  assert.equal(replay.summary.status, "parsed");
  assert.equal(replay.summary.id, "match_1");
  assert.equal(replay.summary.eliminations, 4);
  assert.equal(replay.summary.accuracy, 30);
  assert.equal(replay.summary.placement, null);
  assert.deepEqual(replay.keyMoments, []);
  assert.equal("rawProviderMetadata" in replay, true);
});

test("beta login alias and route start/stop aliases work on Dallas", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/beta/login",
    payload: { code: "BETA-SA-001" },
  });
  assert.equal(login.statusCode, 200);
  const token = login.json<{ token: string }>().token;

  const start = await app.inject({
    method: "POST",
    url: "/api/routes/start",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      nodeId: "dallas-beta",
      clientPublicKey: "abcdefghijklmnopqrstuvwxyz0123456789+/=",
    },
  });
  assert.equal(start.statusCode, 200);
  const body = start.json<{ sessionId: string; nodeId: string; targetIps: string[] }>();
  assert.equal(body.nodeId, "dallas-beta");
  assert.deepEqual(body.targetIps, ["18.88.0.0"]);

  const stop = await app.inject({
    method: "POST",
    url: "/api/routes/stop",
    headers: { authorization: `Bearer ${token}` },
    payload: { sessionId: body.sessionId },
  });
  assert.equal(stop.statusCode, 200);
  assert.equal(stop.json<{ active: boolean }>().active, false);
});

test("dallas beta mode exposes only the Dallas node", async () => {
  const dir = mkdtempSync(join(tmpdir(), "routelag-server-"));
  const config = loadConfig({
    dataFile: join(dir, "db.json"),
    reportsDir: join(dir, "reports"),
    authSecret: "test-secret",
    betaMode: "dallas",
    nodes: testNodes.filter((node) => node.id === "dallas-beta"),
  });
  const app = await buildApp(config);
  tCleanup(dir, app);

  const response = await app.inject({
    method: "GET",
    url: "/api/servers?game=fortnite",
  });
  const servers = response.json<{ servers: Array<{ id: string }> }>().servers;
  assert.deepEqual(
    servers.map((server) => server.id),
    ["dallas-beta"],
  );
});

function tCleanup(dir: string, app: Awaited<ReturnType<typeof buildApp>>) {
  test.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

function multipartHeaders(fileName: string, content: string) {
  const body = multipartBody(fileName, content);
  return {
    "content-type": "multipart/form-data; boundary=routeLagTestBoundary",
    "content-length": Buffer.byteLength(body).toString(),
  };
}

function multipartBody(fileName: string, content: string) {
  return [
    "--routeLagTestBoundary",
    `Content-Disposition: form-data; name="file"; filename="${fileName}"`,
    "Content-Type: application/octet-stream",
    "",
    content,
    "--routeLagTestBoundary--",
    "",
  ].join("\r\n");
}
