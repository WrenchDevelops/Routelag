import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { createToken, verifyToken, type TokenClaims } from "./auth.js";
import type { ServerConfig } from "./config.js";
import {
  computeAllowedIps,
  findNode,
  nodeHealthCheck,
  publicNode,
  targetIps as nodeTargetIps,
} from "./nodes.js";
import { PeerManager, PeerProvisioningDisabledError } from "./peerManager.js";
import { JsonStore } from "./store.js";
import { ReplayStore } from "./replay/replayStore.js";
import { registerReplayRoutes } from "./replay/routes.js";
import { buildCandidates, listRouteTargetsForGame } from "./autoRoute/candidates.js";
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
  const replayStore = new ReplayStore(config.dataFile);
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
    if (request.url.startsWith("/api/replays/osirion/webhook")) {
      return;
    }
    if (
      !request.url.startsWith("/api/routes") &&
      !request.url.startsWith("/api/reports") &&
      !request.url.startsWith("/api/replays")
    ) {
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

  app.get("/health", async () => ({
    ok: true,
    peerMode: config.peerMode,
    betaMode: config.betaMode,
    nodes: config.nodes.map(nodeHealthCheck),
  }));

  app.post<{ Body: { inviteCode?: string; emailOrInvite?: string; code?: string } }>(
    "/api/auth/login",
    async (request, reply) => handleInviteLogin(request, reply),
  );

  app.post<{ Body: { code?: string; inviteCode?: string; emailOrInvite?: string } }>(
    "/api/beta/login",
    async (request, reply) => {
      const inviteCode = (
        request.body.code ??
        request.body.inviteCode ??
        request.body.emailOrInvite ??
        ""
      ).trim();
      return handleInviteLogin(
        {
          ...request,
          body: { inviteCode },
        } as typeof request,
        reply,
      );
    },
  );

  async function handleInviteLogin(
    request: FastifyRequest<{ Body: { inviteCode?: string; emailOrInvite?: string } }>,
    reply: FastifyReply,
  ) {
    const inviteCode = (request.body.inviteCode ?? request.body.emailOrInvite ?? "").trim();
    if (!config.inviteCodes.has(inviteCode)) {
      app.log.warn({ event: "beta_login_failure", codeProvided: Boolean(inviteCode) }, "Beta login failed");
      return reply.code(401).send({ error: "Invalid invite code" });
    }
    const auth = createToken(inviteCode, config.authSecret);
    app.log.info(
      { event: "beta_login_success", testerId: auth.testerId, inviteCode: maskInviteCode(inviteCode) },
      "Beta login succeeded",
    );
    return { token: auth.token, testerId: auth.testerId };
  }

  app.get("/api/games", async () => ({ games }));

  await registerReplayRoutes(app, config, replayStore);

  app.get<{ Querystring: { game?: string } }>("/api/servers", async (request) => ({
    servers: config.nodes
      .filter((node) => !request.query.game || node.gameId === request.query.game)
      .map(publicNode),
  }));

  app.get<{ Querystring: { game?: string; region?: string } }>(
    "/api/routes/candidates",
    async (request) => {
      const game = request.query.game ?? "fortnite";
      const gameNodes = config.nodes.filter((node) => node.gameId === game);
      const candidates = buildCandidates(config.nodes, game);
      return {
        nodes: gameNodes.map(publicNode),
        candidates,
        targets: listRouteTargetsForGame(config.nodes, game),
      };
    },
  );

  app.post<{ Body: RouteTestRequest }>("/api/routes/test", async (request) => {
    const { game = "fortnite" } = request.body;
    const candidates = buildCandidates(config.nodes, game);
    const nodeMetrics = loadNodeMetrics();
    const result = rankRoutes(request.body, candidates, nodeMetrics);
    return result;
  });

  app.post<{
    Body: {
      gameId: string;
      serverId: string;
      nodeId?: string;
      clientPublicKey: string;
      appVersion?: string;
      routePlan?: {
        type: "single" | "chain";
        serverId?: string;
        entryServerId?: string;
        exitServerId?: string;
      };
    };
  }>("/api/routes/create", async (request, reply) =>
    createRouteSession((request as AuthedRequest).tester, request.body, reply),
  );

  app.post<{
    Body: {
      nodeId?: string;
      serverId?: string;
      gameId?: string;
      clientPublicKey?: string;
      appVersion?: string;
    };
  }>("/api/routes/start", async (request, reply) => {
    const body = request.body;
    return createRouteSession(
      (request as AuthedRequest).tester,
      {
        gameId: body.gameId ?? "fortnite",
        serverId: body.nodeId ?? body.serverId ?? "",
        clientPublicKey: body.clientPublicKey ?? "",
        appVersion: body.appVersion,
      },
      reply,
    );
  });

  async function createRouteSession(
    tester: TokenClaims,
    body: {
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
    },
    reply: FastifyReply,
  ) {
    const { gameId, clientPublicKey, appVersion = "unknown", routePlan } = body;

    // Chain routing is not implemented in this build
    if (routePlan?.type === "chain") {
      return reply
        .code(409)
        .send({ error: "Multi-hop routing is not available in this build." });
    }

    // Resolve nodeId: prefer routePlan.serverId, then top-level serverId (legacy) / nodeId
    const nodeId = routePlan?.serverId ?? body.serverId;
    const node = findNode(config.nodes, nodeId);
    if (!node || node.gameId !== gameId) return reply.code(404).send({ error: "Server not found" });
    if (!node.available) return reply.code(409).send({ error: "Server not available yet" });
    if (!node.endpoint || !node.publicKey) {
      return reply.code(409).send({ error: "Server is missing route endpoint or public key" });
    }

    let allowedIps: string[];
    try {
      allowedIps = [...computeAllowedIps(node), ...config.devExtraRoutes];
    } catch {
      return reply.code(409).send({
        error:
          "Unsafe route policy blocked. RouteLag beta servers must use targeted game routes only (no full tunnel).",
      });
    }

    if (node.provisioner.mode === "disabled") {
      return reply
        .code(409)
        .send({ error: "Peer provisioning is not configured for this node yet." });
    }
    if (!/^[A-Za-z0-9+/=]{32,64}$/.test(clientPublicKey)) {
      return reply.code(400).send({ error: "Invalid client public key" });
    }

    const clientIp = peers.allocateIp(node, store.activeSessions());
    const targetIpList = nodeTargetIps(node);

    try {
      await peers.createPeer(node, clientPublicKey, clientIp, tester.testerId);
    } catch (error) {
      if (error instanceof PeerProvisioningDisabledError) {
        return reply.code(409).send({ error: error.message });
      }
      throw error;
    }
    app.log.info(
      {
        event: "peer_created",
        selectedNode: node.id,
        clientTunnelIp: clientIp,
        wgSet: node.provisioner.mode === "local" && config.peerMode === "wg" ? "success" : "mock",
      },
      "WireGuard peer provisioned",
    );
    const session = store.createSession({
      testerId: tester.testerId,
      inviteCode: tester.inviteCode,
      nodeId: node.id,
      publicKey: clientPublicKey,
      clientIp,
      gameId,
      serverName: node.name,
      endpoint: node.endpoint,
      allowedIps: allowedIps.join(", "),
      mtu: node.mtu ?? config.defaultMtu,
      appVersion,
    });

    app.log.info(
      {
        event: "optimization_started",
        selectedNode: node.id,
        endpoint: node.endpoint,
        clientTunnelIp: clientIp,
        targetIps: targetIpList,
        allowedTargetedRoutes: session.allowedIps,
        serverPeerAllowedIps: clientIp,
      },
      "RouteLag optimization session created",
    );

    return {
      sessionId: session.sessionId,
      nodeId: node.id,
      clientAddress: session.clientIp,
      clientIp: session.clientIp.replace(/\/32$/, ""),
      serverPublicKey: node.publicKey,
      endpoint: node.endpoint,
      dns: config.defaultDns,
      mtu: session.mtu,
      allowedIps: session.allowedIps,
      allowedIpCount: allowedIps.length,
      targetIps: targetIpList,
      serverName: node.name,
      serverId: node.id,
      tunnelCidr: node.tunnelCidr,
      serverTunnelIp: node.serverTunnelIp,
    };
  }

  app.post<{ Body: { sessionId: string } }>("/api/routes/end", async (request, reply) =>
    endRouteSession(request, reply, true),
  );

  app.post<{ Body: { sessionId: string } }>("/api/routes/stop", async (request, reply) =>
    endRouteSession(request, reply, false),
  );

  async function endRouteSession(
    request: FastifyRequest<{ Body: { sessionId: string } }>,
    reply: FastifyReply,
    removePeerFromWg: boolean,
  ) {
    const tester = (request as AuthedRequest).tester;
    const session = store.findSession(request.body.sessionId, tester.testerId);
    if (!session) return reply.code(404).send({ error: "Route session not found" });
    const node = findNode(config.nodes, session.nodeId);
    if (session.active) {
      if (removePeerFromWg && node) {
        try {
          await peers.removePeer(node, session.publicKey);
          app.log.info(
            {
              event: "peer_removed",
              selectedNode: session.nodeId,
              clientTunnelIp: session.clientIp,
              wgSet: node.provisioner.mode === "local" && config.peerMode === "wg" ? "success" : "mock",
            },
            "WireGuard peer removed",
          );
        } catch (error) {
          app.log.error(
            {
              event: "optimization_stopped",
              selectedNode: session.nodeId,
              endpoint: session.endpoint,
              clientTunnelIp: session.clientIp,
              cleanup: "failure",
              error: error instanceof Error ? error.message : String(error),
            },
            "RouteLag peer cleanup failed",
          );
          throw error;
        }
      }
      app.log.info(
        {
          event: "optimization_stopped",
          selectedNode: session.nodeId,
          endpoint: session.endpoint,
          clientTunnelIp: session.clientIp,
          cleanup: removePeerFromWg ? "success" : "session_only",
        },
        "RouteLag optimization session ended",
      );
    }
    const ended = store.endSession(session.sessionId, tester.testerId);
    return { sessionId: ended?.sessionId, active: false };
  }

  app.get<{ Params: { sessionId: string } }>("/api/routes/status/:sessionId", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const session = store.findSession(request.params.sessionId, tester.testerId);
    if (!session) return reply.code(404).send({ error: "Route session not found" });
    const node = findNode(config.nodes, session.nodeId);
    const status = node
      ? await peers.getPeerStatus(node, session.publicKey)
      : { latestHandshake: null, transferRx: null, transferTx: null, active: false };
    return { sessionId: session.sessionId, ...status, active: session.active };
  });

  app.get<{ Querystring: { active?: string } }>("/api/admin/sessions", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const sessions =
      request.query.active === "true" ? store.activeSessions() : store.listSessions();
    const result = [];
    for (const session of sessions) {
      const node = findNode(config.nodes, session.nodeId);
      const status =
        session.active && node
          ? await peers.getPeerStatus(node, session.publicKey).catch(() => null)
          : null;
      result.push({
        sessionId: session.sessionId,
        testerId: session.testerId,
        inviteCode: session.inviteCode,
        gameId: session.gameId,
        nodeId: session.nodeId,
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

function maskInviteCode(code: string): string {
  if (code.length <= 4) return "****";
  return `${code.slice(0, 4)}***`;
}
