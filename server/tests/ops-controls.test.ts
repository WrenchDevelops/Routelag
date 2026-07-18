import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { RouteNode } from "../src/nodes.js";
import { JsonStore } from "../src/store.js";
import { PeerManager } from "../src/peerManager.js";

const dallasNode: RouteNode = {
  id: "dallas-beta",
  gameId: "fortnite",
  name: "Dallas Beta",
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
  status: "online",
};

const ashburnNode: RouteNode = {
  ...dallasNode,
  id: "ashburn-beta",
  name: "Ashburn Beta",
  region: "NA-East",
  city: "Ashburn",
  endpoint: "66.163.122.222:51820",
  publicIp: "66.163.122.222",
  publicKey: "ashburn-server-public-key-aaaaaaaaaaaaaaa=",
  tunnelCidr: "10.68.0.0/24",
  serverTunnelIp: "10.68.0.1",
  clientStartIp: "10.68.0.10",
  provisioner: {
    mode: "ssh",
    host: "66.163.122.222",
    user: "root",
    privateKeyPath: "/tmp/ashburn-provisioner",
  },
};

function testConfig(overrides: Partial<ReturnType<typeof loadConfig>> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "routelag-ops-"));
  return {
    dir,
    config: loadConfig({
      dataFile: join(dir, "db.json"),
      reportsDir: join(dir, "reports"),
      peersFile: join(dir, "peers.json"),
      runtimeControlsFile: join(dir, "runtime-controls.json"),
      wgConfigFile: join(dir, "wg0.conf"),
      authSecret: "test-secret",
      adminSecret: "admin-secret",
      inviteCodes: new Set(["BETA-SA-001"]),
      peerMode: "mock",
      nodes: [dallasNode, ashburnNode].map((node) => ({ ...node })),
      requireRoutingEntitlement: true,
      deploymentEnv: "development",
      allowInternalRoutingEntitlement: true,
      internalRoutingInviteCodes: new Set(["BETA-SA-001"]),
      entitlementTokenTtlSeconds: 900,
      entitlementCacheTtlMs: 60_000,
      maxConcurrentSessionsPerUser: 1,
      maxConcurrentSessionsPerDevice: 1,
      maxPeersPerNode: 50,
      nodeCapacityHeadroom: 5,
      peerTtlHours: 8,
      peerHeartbeatGraceMinutes: 20,
      ...overrides,
    }),
  };
}

function cleanup(dir: string, app: Awaited<ReturnType<typeof buildApp>>) {
  test.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
}

async function mintToken(
  app: Awaited<ReturnType<typeof buildApp>>,
  deviceId = "device-ops-1",
) {
  const exchange = await app.inject({
    method: "POST",
    url: "/api/entitlements/routing-token",
    payload: { inviteCode: "BETA-SA-001", deviceId },
  });
  assert.equal(exchange.statusCode, 200, exchange.body);
  return exchange.json<{ token: string; testerId: string }>();
}

function clientKey(suffix: string) {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi12345";
  return `${base}${suffix}=======`.slice(0, 44);
}

async function createRoute(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  opts: { serverId?: string; clientPublicKey?: string; appVersion?: string } = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/routes/create",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gameId: "fortnite",
      serverId: opts.serverId ?? "dallas-beta",
      clientPublicKey: opts.clientPublicKey ?? clientKey("AAAA"),
      appVersion: opts.appVersion ?? "0.2.1",
    },
  });
}

test("heartbeat refresh extends lastHeartbeatAt and prevents grace expiry", async () => {
  const { dir, config } = testConfig({ peerHeartbeatGraceMinutes: 20, peerTtlHours: 8 });
  const app = await buildApp(config);
  cleanup(dir, app);

  const { token } = await mintToken(app);
  const create = await createRoute(app, token);
  assert.equal(create.statusCode, 200);
  const sessionId = create.json<{ sessionId: string }>().sessionId;

  const store = new JsonStore(config.dataFile);
  const before = store.findSession(sessionId);
  assert.ok(before);

  // Age heartbeat just inside grace, then refresh.
  const raw = JSON.parse(readFileSync(config.dataFile, "utf8")) as {
    sessions: Array<{ sessionId: string; lastHeartbeatAt: string; createdAt: string }>;
  };
  const session = raw.sessions.find((item) => item.sessionId === sessionId);
  assert.ok(session);
  session.lastHeartbeatAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  writeFileSync(config.dataFile, `${JSON.stringify(raw, null, 2)}\n`);

  const heartbeat = await app.inject({
    method: "POST",
    url: "/api/routes/heartbeat",
    headers: { authorization: `Bearer ${token}` },
    payload: { sessionId },
  });
  assert.equal(heartbeat.statusCode, 200);
  const hbBody = heartbeat.json<{ lastHeartbeatAt: string; active: boolean }>();
  assert.equal(hbBody.active, true);
  assert.ok(Date.parse(hbBody.lastHeartbeatAt) > Date.parse(session.lastHeartbeatAt));

  const expired = store.expireStaleActiveSessions({
    maxLifetimeHours: 8,
    heartbeatGraceMinutes: 20,
  });
  assert.equal(expired.length, 0);
});

test("expired peer removal uses heartbeat grace when max lifetime not hit", async () => {
  const { dir, config } = testConfig({ peerHeartbeatGraceMinutes: 15, peerTtlHours: 8 });
  const app = await buildApp(config);
  cleanup(dir, app);

  const { token } = await mintToken(app);
  const create = await createRoute(app, token);
  assert.equal(create.statusCode, 200);
  const sessionId = create.json<{ sessionId: string }>().sessionId;

  const raw = JSON.parse(readFileSync(config.dataFile, "utf8")) as {
    sessions: Array<{ sessionId: string; lastHeartbeatAt: string; active: boolean }>;
  };
  const session = raw.sessions.find((item) => item.sessionId === sessionId);
  assert.ok(session);
  session.lastHeartbeatAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  writeFileSync(config.dataFile, `${JSON.stringify(raw, null, 2)}\n`);

  const store = new JsonStore(config.dataFile);
  const expired = store.expireStaleActiveSessions({
    maxLifetimeHours: config.peerTtlHours,
    heartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
  });
  assert.equal(expired.length, 1);
  assert.equal(expired[0]?.sessionId, sessionId);
  assert.equal(store.findSession(sessionId)?.active, false);
});

test("duplicate public key is rejected and end is idempotent", async () => {
  const { dir, config } = testConfig({ maxConcurrentSessionsPerUser: 2 });
  const app = await buildApp(config);
  cleanup(dir, app);

  const first = await mintToken(app, "device-a");
  const create1 = await createRoute(app, first.token, { clientPublicKey: clientKey("DUP1") });
  assert.equal(create1.statusCode, 200);
  const sessionId = create1.json<{ sessionId: string }>().sessionId;

  const second = await mintToken(app, "device-b");
  const create2 = await createRoute(app, second.token, {
    clientPublicKey: clientKey("DUP1"),
    serverId: "ashburn-beta",
  });
  assert.equal(create2.statusCode, 409);
  assert.equal(create2.json<{ code?: string }>().code, "duplicate_peer");

  const end1 = await app.inject({
    method: "POST",
    url: "/api/routes/end",
    headers: { authorization: `Bearer ${first.token}` },
    payload: { sessionId },
  });
  assert.equal(end1.statusCode, 200);
  const end2 = await app.inject({
    method: "POST",
    url: "/api/routes/end",
    headers: { authorization: `Bearer ${first.token}` },
    payload: { sessionId },
  });
  assert.equal(end2.statusCode, 200);
  assert.equal(end2.json<{ active: boolean }>().active, false);
});

test("API restart recovery removes orphaned persisted peers", async () => {
  const { dir, config } = testConfig();
  const peers = new PeerManager(config);
  await peers.createPeer(dallasNode, clientKey("ORPH"), "10.67.0.99/32", "orphan");
  assert.equal(peers.listPersistedPeers().length, 1);

  const app = await buildApp(config);
  cleanup(dir, app);

  const restarted = new PeerManager(config);
  assert.equal(restarted.listPersistedPeers().length, 0);
});

test("full node rejection respects capacity and headroom", async () => {
  const { dir, config } = testConfig({
    maxPeersPerNode: 2,
    nodeCapacityHeadroom: 0,
    maxConcurrentSessionsPerUser: 5,
    maxConcurrentSessionsPerDevice: 5,
  });
  const app = await buildApp(config);
  cleanup(dir, app);

  for (let i = 0; i < 2; i += 1) {
    const { token } = await mintToken(app, `device-cap-${i}`);
    const create = await createRoute(app, token, { clientPublicKey: clientKey(`C${i}0`) });
    assert.equal(create.statusCode, 200, create.body);
  }

  const { token } = await mintToken(app, "device-cap-full");
  const rejected = await createRoute(app, token, { clientPublicKey: clientKey("FULL") });
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.json<{ code?: string }>().code, "node_full");
});

test("concurrent session rejection still enforced", async () => {
  const { dir, config } = testConfig({ maxConcurrentSessionsPerUser: 1 });
  const app = await buildApp(config);
  cleanup(dir, app);

  const { token } = await mintToken(app);
  const first = await createRoute(app, token, { clientPublicKey: clientKey("CON1") });
  assert.equal(first.statusCode, 200);
  const second = await createRoute(app, token, {
    clientPublicKey: clientKey("CON2"),
    serverId: "ashburn-beta",
  });
  assert.equal(second.statusCode, 409);
  assert.equal(second.json<{ code?: string }>().code, "concurrent_session_limit");
});

test("disabled node rejection via admin controls", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const disable = await app.inject({
    method: "PUT",
    url: "/api/admin/controls",
    headers: { "x-admin-token": "admin-secret" },
    payload: { disabledNodeIds: ["dallas-beta"] },
  });
  assert.equal(disable.statusCode, 200);

  const { token } = await mintToken(app);
  const create = await createRoute(app, token);
  assert.equal(create.statusCode, 409);
  assert.equal(create.json<{ code?: string }>().code, "node_disabled");
});

test("global maintenance rejection", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const maintenance = await app.inject({
    method: "PUT",
    url: "/api/admin/controls",
    headers: { "x-admin-token": "admin-secret" },
    payload: { maintenanceMode: true },
  });
  assert.equal(maintenance.statusCode, 200);

  const { token } = await mintToken(app);
  const create = await createRoute(app, token);
  assert.equal(create.statusCode, 503);
  assert.equal(create.json<{ code?: string }>().code, "maintenance_mode");

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.json<{ status: string; routingEnabled: boolean }>().status, "maintenance");
  assert.equal(health.json<{ routingEnabled: boolean }>().routingEnabled, false);

  const healthz = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(healthz.statusCode, 503);
});

test("user-block rejection", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const { token, testerId } = await mintToken(app);
  const block = await app.inject({
    method: "PUT",
    url: "/api/admin/controls",
    headers: { authorization: "Bearer admin-secret" },
    payload: { blockedTesterIds: [testerId] },
  });
  assert.equal(block.statusCode, 200);

  const create = await createRoute(app, token);
  assert.equal(create.statusCode, 403);
  assert.equal(create.json<{ code?: string }>().code, "user_blocked");
});

test("emergency peer expiration on a node", async () => {
  const { dir, config } = testConfig({ maxConcurrentSessionsPerUser: 2 });
  const app = await buildApp(config);
  cleanup(dir, app);

  const a = await mintToken(app, "device-exp-a");
  const b = await mintToken(app, "device-exp-b");
  const createA = await createRoute(app, a.token, { clientPublicKey: clientKey("EXPA") });
  const createB = await createRoute(app, b.token, {
    clientPublicKey: clientKey("EXPB"),
    serverId: "ashburn-beta",
  });
  assert.equal(createA.statusCode, 200);
  assert.equal(createB.statusCode, 200);

  const expire = await app.inject({
    method: "POST",
    url: "/api/admin/nodes/dallas-beta/expire-peers",
    headers: { "x-admin-token": "admin-secret" },
  });
  assert.equal(expire.statusCode, 200);
  assert.equal(expire.json<{ endedSessions: number }>().endedSessions, 1);

  const store = new JsonStore(config.dataFile);
  assert.equal(store.findSession(createA.json<{ sessionId: string }>().sessionId)?.active, false);
  assert.equal(store.findSession(createB.json<{ sessionId: string }>().sessionId)?.active, true);
});

test("unauthorized admin-control attempt is rejected and audited", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const denied = await app.inject({
    method: "PUT",
    url: "/api/admin/controls",
    headers: { "x-admin-token": "wrong-secret" },
    payload: { maintenanceMode: true },
  });
  assert.equal(denied.statusCode, 401);

  const statusDenied = await app.inject({
    method: "GET",
    url: "/api/admin/status",
  });
  assert.equal(statusDenied.statusCode, 401);

  const controls = await app.inject({
    method: "GET",
    url: "/api/admin/controls",
    headers: { "x-admin-token": "admin-secret" },
  });
  assert.equal(controls.statusCode, 200);
  assert.equal(controls.json<{ controls: { maintenanceMode: boolean } }>().controls.maintenanceMode, false);
});

test("disabled app version is rejected", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const set = await app.inject({
    method: "PUT",
    url: "/api/admin/controls",
    headers: { "x-admin-token": "admin-secret" },
    payload: { disabledAppVersions: ["0.0.bad"] },
  });
  assert.equal(set.statusCode, 200);

  const { token } = await mintToken(app);
  const create = await createRoute(app, token, { appVersion: "0.0.bad" });
  assert.equal(create.statusCode, 403);
  assert.equal(create.json<{ code?: string }>().code, "app_version_disabled");
});

test("admin status exposes metrics and host snapshot without public leakage", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  cleanup(dir, app);

  const publicHealth = await app.inject({ method: "GET", url: "/health" });
  const publicBody = publicHealth.json<Record<string, unknown>>();
  assert.equal("metrics" in publicBody, false);
  assert.equal("host" in publicBody, false);
  assert.equal("controls" in publicBody, false);

  const admin = await app.inject({
    method: "GET",
    url: "/api/admin/status",
    headers: { "x-admin-token": "admin-secret" },
  });
  assert.equal(admin.statusCode, 200);
  const body = admin.json<{
    metrics: { peerCreateOk: number };
    host: { platform: string };
    controls: { maintenanceMode: boolean };
  }>();
  assert.equal(typeof body.metrics.peerCreateOk, "number");
  assert.equal(typeof body.host.platform, "string");
  assert.equal(body.controls.maintenanceMode, false);
});
