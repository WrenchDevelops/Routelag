import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

function testConfig() {
  const dir = mkdtempSync(join(tmpdir(), "routelag-server-"));
  return {
    dir,
    config: loadConfig({
      dataFile: join(dir, "db.json"),
      reportsDir: join(dir, "reports"),
      authSecret: "test-secret",
      inviteCodes: new Set(["BETA-WRENCH-001"]),
      peerMode: "mock",
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

test("creates, reports, and ends a mock route session", async () => {
  const { dir, config } = testConfig();
  const app = await buildApp(config);
  tCleanup(dir, app);

  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { inviteCode: "BETA-WRENCH-001" },
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
  const session = create.json<{ sessionId: string; clientAddress: string }>();
  assert.equal(session.clientAddress, "10.66.66.2/32");

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

function tCleanup(dir: string, app: Awaited<ReturnType<typeof buildApp>>) {
  test.after(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });
}
