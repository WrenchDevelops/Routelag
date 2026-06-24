import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { createToken, verifyToken, type TokenClaims } from "./auth.js";
import type { ServerConfig } from "./config.js";
import { PeerManager } from "./peerManager.js";
import { JsonStore } from "./store.js";

interface AuthedRequest extends FastifyRequest {
  tester: TokenClaims;
}

const games = [{ id: "fortnite", name: "Fortnite" }];
const servers = [
  {
    id: "johannesburg-beta",
    gameId: "fortnite",
    name: "Johannesburg Beta",
    region: "ZA",
    endpointIp: "102.211.56.103",
    available: true,
    label: "Dev Server",
  },
  { id: "na-central", gameId: "fortnite", name: "NA-Central", region: "US", available: false },
  { id: "na-east", gameId: "fortnite", name: "NA-East", region: "US", available: false },
  { id: "na-west", gameId: "fortnite", name: "NA-West", region: "US", available: false },
  { id: "europe", gameId: "fortnite", name: "Europe", region: "EU", available: false },
];

export async function buildApp(config: ServerConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const store = new JsonStore(config.dataFile);
  const peers = new PeerManager(config);

  await app.register(cors, {
    origin: true,
  });

  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
  });

  app.decorateRequest("tester", null);
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/routes") && !request.url.startsWith("/api/reports")) {
      return;
    }
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    const tester = token ? verifyToken(token, config.authSecret) : null;
    if (!tester) {
      await reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    (request as AuthedRequest).tester = tester;
  });

  app.get("/health", async () => ({ ok: true, peerMode: config.peerMode }));

  app.post<{ Body: { inviteCode?: string; emailOrInvite?: string } }>("/api/auth/login", async (request, reply) => {
    const inviteCode = (request.body.inviteCode ?? request.body.emailOrInvite ?? "").trim();
    if (!config.inviteCodes.has(inviteCode)) {
      return reply.code(401).send({ error: "Invalid invite code" });
    }
    const auth = createToken(inviteCode, config.authSecret);
    return { token: auth.token, testerId: auth.testerId };
  });

  app.get("/api/games", async () => ({ games }));

  app.get<{ Querystring: { game?: string } }>("/api/servers", async (request) => ({
    servers: servers.filter((server) => !request.query.game || server.gameId === request.query.game),
  }));

  app.post<{
    Body: { gameId: string; serverId: string; clientPublicKey: string; appVersion?: string };
  }>("/api/routes/create", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const { gameId, serverId, clientPublicKey, appVersion = "unknown" } = request.body;
    const server = servers.find((item) => item.id === serverId && item.gameId === gameId);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    if (!server.available) return reply.code(409).send({ error: "Server not available yet" });
    if (!/^[A-Za-z0-9+/=]{32,64}$/.test(clientPublicKey)) {
      return reply.code(400).send({ error: "Invalid client public key" });
    }

    const clientIp = peers.allocateIp(store.activeSessions());
    await peers.createPeer(clientPublicKey, clientIp);
    const session = store.createSession({
      testerId: tester.testerId,
      publicKey: clientPublicKey,
      clientIp,
      gameId,
      serverId,
      appVersion,
    });

    return {
      sessionId: session.sessionId,
      clientAddress: session.clientIp,
      serverPublicKey: config.serverPublicKey,
      endpoint: config.endpoint,
      dns: config.defaultDns,
      mtu: config.defaultMtu,
      allowedIps: config.allowedIps,
      serverName: server.name,
    };
  });

  app.post<{ Body: { sessionId: string } }>("/api/routes/end", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const session = store.findSession(request.body.sessionId, tester.testerId);
    if (!session) return reply.code(404).send({ error: "Route session not found" });
    if (session.active) await peers.removePeer(session.publicKey);
    const ended = store.endSession(session.sessionId, tester.testerId);
    return { sessionId: ended?.sessionId, active: false };
  });

  app.get<{ Params: { sessionId: string } }>("/api/routes/status/:sessionId", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const session = store.findSession(request.params.sessionId, tester.testerId);
    if (!session) return reply.code(404).send({ error: "Route session not found" });
    const status = await peers.getPeerStatus(session.publicKey);
    return { sessionId: session.sessionId, ...status, active: session.active };
  });

  app.post<{ Body: unknown }>("/api/reports/upload", async (request) => {
    const tester = (request as AuthedRequest).tester;
    const fileName = `${Date.now()}-${tester.testerId}.json`;
    writeFileSync(join(config.reportsDir, fileName), `${JSON.stringify(request.body, null, 2)}\n`);
    return { ok: true };
  });

  return app;
}
