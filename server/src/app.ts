import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { createToken, verifyToken, type TokenClaims } from "./auth.js";
import {
  allowedIpsAreTargeted,
  splitAllowedIps,
  type RouteServerConfig,
  type ServerConfig,
} from "./config.js";
import { PeerManager } from "./peerManager.js";
import { JsonStore } from "./store.js";
import { buildCandidates } from "./autoRoute/candidates.js";
import { loadNodeMetrics } from "./autoRoute/nodeMetrics.js";
import { rankRoutes } from "./autoRoute/scoring.js";
import type { RouteTestRequest } from "./autoRoute/types.js";

interface AuthedRequest extends FastifyRequest {
  tester: TokenClaims;
}

const games = [{ id: "fortnite", name: "Fortnite" }];

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

  async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    const header = request.headers.authorization;
    const bearer = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const token = bearer || String(request.headers["x-admin-token"] ?? "");
    if (!config.adminSecret) {
      await reply.code(404).send({ error: "Not found" });
      return false;
    }
    if (token !== config.adminSecret) {
      await reply.code(401).send({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

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
    servers: config.routeServers
      .filter((server) => !request.query.game || server.gameId === request.query.game)
      .map(publicServer),
  }));

  app.get<{ Querystring: { game?: string; region?: string } }>(
    "/api/routes/candidates",
    async (request) => {
      const game = request.query.game ?? "fortnite";
      const candidates = buildCandidates(config.routeServers, game);
      return { candidates };
    },
  );

  app.post<{ Body: RouteTestRequest }>("/api/routes/test", async (request) => {
    const { game = "fortnite" } = request.body;
    const candidates = buildCandidates(config.routeServers, game);
    const nodeMetrics = loadNodeMetrics();
    const result = rankRoutes(request.body, candidates, nodeMetrics);
    return result;
  });

  app.post<{
    Body: {
      gameId: string;
      serverId: string;
      clientPublicKey: string;
      appVersion?: string;
      routePlan?: {
        type: "single" | "chain";
        serverId?: string;
        entryServerId?: string;
        exitServerId?: string;
      };
    };
  }>("/api/routes/create", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const { gameId, clientPublicKey, appVersion = "unknown", routePlan } = request.body;

    // Chain routing is not implemented in this build
    if (routePlan?.type === "chain") {
      return reply
        .code(409)
        .send({ error: "Multi-hop routing is not available in this build." });
    }

    // Resolve serverId: prefer routePlan.serverId, then top-level serverId
    const serverId = routePlan?.serverId ?? request.body.serverId;
    const server = config.routeServers.find((item) => item.id === serverId && item.gameId === gameId);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    if (server.status !== "online") return reply.code(409).send({ error: "Server not available yet" });
    if (!server.endpoint || !server.serverPublicKey) {
      return reply.code(409).send({ error: "Server is missing route endpoint or public key" });
    }
    if (!allowedIpsAreTargeted(server.allowedIps)) {
      return reply.code(409).send({
        error:
          "Unsafe route policy blocked. RouteLag beta servers must use targeted IPv4 /32 AllowedIPs only.",
      });
    }
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
      serverName: server.name,
      inviteCode: tester.inviteCode,
      endpoint: server.endpoint,
      allowedIps: server.allowedIps,
      mtu: server.mtu,
      appVersion,
    });

    return {
      sessionId: session.sessionId,
      clientAddress: session.clientIp,
      serverPublicKey: server.serverPublicKey,
      endpoint: server.endpoint,
      dns: config.defaultDns,
      mtu: server.mtu,
      allowedIps: server.allowedIps,
      allowedIpCount: splitAllowedIps(server.allowedIps).length,
      serverName: server.name,
      serverId: server.id,
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

  app.get<{ Querystring: { active?: string } }>("/api/admin/sessions", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const sessions =
      request.query.active === "true" ? store.activeSessions() : store.listSessions();
    const result = [];
    for (const session of sessions) {
      const status = session.active
        ? await peers.getPeerStatus(session.publicKey).catch(() => null)
        : null;
      result.push({
        sessionId: session.sessionId,
        testerId: session.testerId,
        inviteCode: session.inviteCode,
        gameId: session.gameId,
        serverId: session.serverId,
        serverName: session.serverName,
        peerTunnelIp: session.clientIp,
        endpoint: session.endpoint,
        allowedIps: session.allowedIps,
        createdAt: session.createdAt,
        endedAt: session.endedAt,
        active: session.active,
        bytesTransferredRx: status?.transferRx ?? null,
        bytesTransferredTx: status?.transferTx ?? null,
        latestHandshake: status?.latestHandshake ?? null,
        errors: [],
      });
    }
    return { sessions: result };
  });

  app.post<{ Body: unknown }>("/api/reports/upload", async (request) => {
    const tester = (request as AuthedRequest).tester;
    const fileName = `${Date.now()}-${tester.testerId}.json`;
    writeFileSync(join(config.reportsDir, fileName), `${JSON.stringify(request.body, null, 2)}\n`);
    return { ok: true };
  });

  return app;
}

function publicServer(server: RouteServerConfig) {
  return {
    id: server.id,
    gameId: server.gameId,
    name: server.name,
    region: server.region,
    city: server.city,
    country: server.country,
    status: server.status,
    available: server.status === "online",
    endpointIp: server.endpointHost || undefined,
    endpointHost: server.endpointHost || undefined,
    endpoint: server.endpoint || undefined,
    allowedIps: splitAllowedIps(server.allowedIps),
    mtu: server.mtu,
    label: server.debugLabel,
    notes: server.notes,
    debugLabel: server.debugLabel,
    recommended: server.recommended,
    pingEstimate: server.pingEstimate,
  };
}
