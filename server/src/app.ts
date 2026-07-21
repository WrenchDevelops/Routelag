import { timingSafeEqual } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";

import { createToken, verifyToken, type TokenClaims } from "./auth.js";
import {
  buildClerkSessionVerifier,
  buildEntitlementProvider,
  type ServerConfig,
} from "./config.js";
import {
  EntitlementCache,
  EntitlementService,
  entitlementErrorBody,
} from "./entitlement/index.js";
import { readHostResources } from "./hostResources.js";
import {
  capacityUsedPercent,
  computeAllowedIps,
  effectiveNodeCapacity,
  findNode,
  nodeHealthCheck,
  nodeRoutingMode,
  nodeStatus,
  publicHealthNode,
  publicNode,
  canStartNode,
  targetIps as nodeTargetIps,
} from "./nodes.js";
import { OpsMetrics } from "./opsMetrics.js";
import { PeerManager, PeerProvisioningDisabledError } from "./peerManager.js";
import { RuntimeControlsStore } from "./runtimeControls.js";
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
  const metrics = new OpsMetrics();
  const controls = new RuntimeControlsStore(config.runtimeControlsFile, {
    maintenanceMode: config.maintenanceMode,
    routingDisabled: config.routingDisabled,
    disabledNodeIds: config.disabledNodeIds,
    blockedClerkUserIds: config.blockedClerkUserIds,
    blockedTesterIds: config.blockedTesterIds,
    blockedInviteCodes: config.blockedInviteCodes,
    disabledAppVersions: config.disabledAppVersions,
  });
  const entitlementCache = new EntitlementCache(config.entitlementCacheTtlMs);
  const allowInternal =
    config.allowInternalRoutingEntitlement && config.deploymentEnv !== "production";
  const entitlements = new EntitlementService({
    provider: buildEntitlementProvider(config),
    cache: entitlementCache,
    clerkVerifier: buildClerkSessionVerifier(config),
    authSecret: config.authSecret,
    entitlementTtlSeconds: config.entitlementTokenTtlSeconds,
    requireEntitlement: config.requireRoutingEntitlement,
    allowInternalInviteEntitlement: allowInternal,
    internalInviteCodes: config.internalRoutingInviteCodes,
    maxConcurrentSessionsPerUser: config.maxConcurrentSessionsPerUser,
  });
  const nodeCapacityLimit = effectiveNodeCapacity(
    config.maxPeersPerNode,
    config.nodeCapacityHeadroom,
  );

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
    if (request.url.startsWith("/api/entitlements/")) {
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
      metrics.authFailures += 1;
      await reply.code(401).send(entitlementErrorBody("invalid_token"));
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
    if (!safeEqual(token, config.adminSecret)) {
      metrics.adminAuthFailures += 1;
      app.log.warn({ event: "admin_auth_failure" }, "Admin authentication failed");
      await reply.code(401).send({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  function isNodeAcceptingRoutes(nodeId: string): boolean {
    if (controls.isRoutingCreationBlocked()) return false;
    if (controls.isNodeDisabled(nodeId)) return false;
    const node = findNode(config.nodes, nodeId);
    if (!node) return false;
    if (!canStartNode(node)) return false;
    if (nodeStatus(node) === "maintenance") return false;
    const used = store.countActiveSessionsForNode(nodeId);
    return used < nodeCapacityLimit;
  }

  function buildPublicHealth() {
    const active = store.activeSessions();
    const controlState = controls.get();
    const routingEnabled = !controls.isRoutingCreationBlocked();
    const nodes = config.nodes.map((node) => {
      const used = active.filter((session) => session.nodeId === node.id).length;
      const disabled =
        controls.isNodeDisabled(node.id) ||
        !canStartNode(node) ||
        nodeStatus(node) === "maintenance";
      const full = !disabled && used >= nodeCapacityLimit;
      const acceptingRoutes = routingEnabled && !disabled && !full;
      return publicHealthNode(node, {
        acceptingRoutes,
        capacityState: disabled ? "disabled" : full ? "full" : "ok",
        usedPercent: capacityUsedPercent(used, nodeCapacityLimit),
      });
    });
    const nodesAcceptingRoutes = nodes.filter((node) => node.acceptingRoutes).length;
    const status = !routingEnabled
      ? "maintenance"
      : nodesAcceptingRoutes === 0
        ? "degraded"
        : "ok";
    return {
      ok: status !== "maintenance",
      status,
      routingEnabled,
      peerMode: config.peerMode,
      capacity: {
        activeSessions: active.length,
        nodesAcceptingRoutes,
      },
      nodes,
      // External uptime monitors: expect HTTP 200 and status !== "maintenance".
      uptimeProbe: "GET /health",
    };
  }

  app.get("/health", async () => buildPublicHealth());

  // Minimal probe for external uptime checkers that only need HTTP success.
  app.get("/healthz", async (_request, reply) => {
    if (controls.isRoutingCreationBlocked()) {
      return reply.code(503).send({ ok: false, status: "maintenance" });
    }
    return { ok: true };
  });

  async function removeSessionPeer(
    session: { sessionId: string; nodeId: string; publicKey: string; clientIp: string },
    event: string,
    reason: string,
  ): Promise<boolean> {
    const node = findNode(config.nodes, session.nodeId);
    if (!node) {
      app.log.warn(
        {
          event,
          reason,
          sessionId: session.sessionId,
          selectedNode: session.nodeId,
        },
        "Session peer cleanup skipped — node missing",
      );
      return false;
    }
    try {
      await peers.removePeer(node, session.publicKey);
      metrics.peerRemoveOk += 1;
      app.log.info(
        {
          event,
          reason,
          sessionId: session.sessionId,
          selectedNode: session.nodeId,
          clientTunnelIp: session.clientIp,
          wgSet: config.peerMode === "wg" ? "success" : "mock",
        },
        "WireGuard peer removed",
      );
      return true;
    } catch (error) {
      metrics.peerRemoveFail += 1;
      app.log.error(
        {
          event: `${event}_failed`,
          reason,
          sessionId: session.sessionId,
          selectedNode: session.nodeId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to remove WireGuard peer",
      );
      return false;
    }
  }

  async function expireAbandonedPeers(reason: string) {
    const expired = store.expireStaleActiveSessions({
      maxLifetimeHours: config.peerTtlHours,
      heartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
    });
    for (const session of expired) {
      const removed = await removeSessionPeer(session, "peer_expired", reason);
      if (removed) {
        metrics.peerExpired += 1;
        app.log.info(
          {
            event: "peer_expired",
            reason,
            sessionId: session.sessionId,
            selectedNode: session.nodeId,
            clientTunnelIp: session.clientIp,
            ttlHours: config.peerTtlHours,
            heartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
          },
          "Expired abandoned WireGuard peer",
        );
      } else {
        metrics.peerExpireFail += 1;
      }
    }
    return expired.length;
  }

  /**
   * After API restart: remove persisted WireGuard peers that no longer have an
   * active session, then run normal TTL/heartbeat expiry.
   */
  async function reconcileAfterRestart() {
    const activeKeys = new Set(
      store.activeSessions().map((session) => `${session.nodeId}:${session.publicKey}`),
    );
    for (const peer of peers.listPersistedPeers()) {
      const key = `${peer.nodeId}:${peer.publicKey}`;
      if (activeKeys.has(key)) continue;
      const node = findNode(config.nodes, peer.nodeId);
      if (!node) {
        continue;
      }
      try {
        await peers.removePeer(node, peer.publicKey);
        metrics.orphanPeersRemoved += 1;
        app.log.info(
          {
            event: "peer_orphan_removed",
            reason: "api_restart_reconcile",
            selectedNode: peer.nodeId,
            clientTunnelIp: peer.clientIp,
          },
          "Removed orphaned WireGuard peer after API restart",
        );
      } catch (error) {
        metrics.peerRemoveFail += 1;
        app.log.error(
          {
            event: "peer_orphan_remove_failed",
            selectedNode: peer.nodeId,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to remove orphaned WireGuard peer",
        );
      }
    }
    await expireAbandonedPeers("api_startup");
  }

  await reconcileAfterRestart();

  // Periodic server-side safety net for clients that crash / force-kill / reboot
  // without calling /api/routes/end.
  let expireTimer: NodeJS.Timeout | null = null;
  const expiryEnabled = config.peerTtlHours > 0 || config.peerHeartbeatGraceMinutes > 0;
  if (expiryEnabled) {
    const lifetimeMs =
      config.peerTtlHours > 0 ? config.peerTtlHours * 60 * 60 * 1000 : Number.POSITIVE_INFINITY;
    const graceMs =
      config.peerHeartbeatGraceMinutes > 0
        ? config.peerHeartbeatGraceMinutes * 60 * 1000
        : Number.POSITIVE_INFINITY;
    const cadenceBasis = Math.min(lifetimeMs, graceMs);
    const intervalMs = Number.isFinite(cadenceBasis)
      ? Math.min(15 * 60 * 1000, Math.max(60_000, cadenceBasis / 8))
      : 15 * 60 * 1000;
    expireTimer = setInterval(() => {
      void expireAbandonedPeers("interval");
    }, intervalMs);
    if (typeof expireTimer.unref === "function") {
      expireTimer.unref();
    }
    app.addHook("onClose", async () => {
      if (expireTimer) clearInterval(expireTimer);
    });
  }

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
      metrics.authFailures += 1;
      app.log.warn({ event: "beta_login_failure", codeProvided: Boolean(inviteCode) }, "Beta login failed");
      return reply.code(401).send({ error: "Invalid invite code" });
    }
    if (controls.isUserBlocked({ inviteCode })) {
      metrics.userBlockedRejected += 1;
      app.log.warn(
        { event: "beta_login_blocked", inviteCode: maskInviteCode(inviteCode) },
        "Beta login blocked by emergency control",
      );
      return reply.code(403).send({ error: "Account disabled", code: "user_blocked" });
    }
    const auth = createToken(inviteCode, config.authSecret);
    app.log.info(
      { event: "beta_login_success", testerId: auth.testerId, inviteCode: maskInviteCode(inviteCode) },
      "Beta login succeeded",
    );
    return {
      token: auth.token,
      testerId: auth.testerId,
      /**
       * Invite tokens authenticate the beta client but do not grant paid routing.
       * Clients must call /api/entitlements/routing-token before creating routes.
       */
      routingEntitlementRequired: config.requireRoutingEntitlement,
    };
  }

  app.post<{
    Body: {
      clerkSessionToken?: string;
      inviteCode?: string;
      deviceId?: string;
      /** Forged client fields — ignored by the server. */
      entitled?: unknown;
      hasUnlimitedRouting?: unknown;
      plan?: unknown;
      planSlug?: unknown;
    };
  }>("/api/entitlements/routing-token", async (request, reply) => {
    const result = await entitlements.exchange(request.body ?? {});
    if (!result.ok) {
      app.log.warn(
        {
          event: "routing_entitlement_denied",
          code: result.body.code,
          hasClerkToken: Boolean(request.body?.clerkSessionToken),
          hasInvite: Boolean(request.body?.inviteCode),
        },
        "Routing entitlement exchange denied",
      );
      return reply.code(result.status).send(result.body);
    }
    app.log.info(
      {
        event: "routing_entitlement_issued",
        testerId: result.testerId,
        accountState: result.accountState,
        source: result.source,
        exp: result.exp,
      },
      "Routing entitlement token issued",
    );
    return {
      token: result.token,
      testerId: result.testerId,
      expiresAt: result.exp,
      accountState: result.accountState,
      source: result.source,
    };
  });

  app.get("/api/games", async () => ({ games }));

  await registerReplayRoutes(app, config, replayStore);

  app.get<{ Querystring: { game?: string } }>("/api/servers", async (request) => ({
    servers: config.nodes
      .filter((node) => !request.query.game || node.gameId === request.query.game)
      .map((node) => {
        const base = publicNode(node);
        const disabled = controls.isNodeDisabled(node.id);
        const globallyBlocked = controls.isRoutingCreationBlocked();
        return {
          ...base,
          available: base.available && !disabled && !globallyBlocked,
          status: disabled || globallyBlocked ? "maintenance" : base.status,
          acceptingRoutes: isNodeAcceptingRoutes(node.id),
        };
      }),
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
      /** Forged client entitlement fields — ignored. */
      entitled?: unknown;
      hasUnlimitedRouting?: unknown;
      plan?: unknown;
      planSlug?: unknown;
      routePlan?: {
        type: "single" | "chain";
        serverId?: string;
        entryServerId?: string;
        exitServerId?: string;
      };
    },
    reply: FastifyReply,
  ) {
    // Discard any client-supplied entitlement booleans / plan names.
    void body.entitled;
    void body.hasUnlimitedRouting;
    void body.plan;
    void body.planSlug;

    if (controls.isRoutingCreationBlocked()) {
      metrics.maintenanceRejected += 1;
      app.log.warn({ event: "route_create_rejected", reason: "maintenance" }, "Route create blocked");
      return reply.code(503).send({
        error: "Routing is temporarily unavailable",
        code: "maintenance_mode",
      });
    }

    if (
      controls.isUserBlocked({
        clerkUserId: tester.clerkUserId,
        testerId: tester.testerId,
        inviteCode: tester.inviteCode,
      })
    ) {
      metrics.userBlockedRejected += 1;
      return reply.code(403).send({ error: "Account disabled", code: "user_blocked" });
    }

    if (controls.isAppVersionDisabled(body.appVersion)) {
      metrics.appVersionRejected += 1;
      return reply.code(403).send({
        error: "This application version is no longer allowed to create routes",
        code: "app_version_disabled",
      });
    }

    const entitlementDenial = entitlements.assertCanCreateRoute(tester);
    if (entitlementDenial) {
      const status = entitlementDenial === "invalid_token" ? 401 : 403;
      return reply.code(status).send(entitlementErrorBody(entitlementDenial));
    }

    await expireAbandonedPeers("before_create");
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
    if (!node.available || nodeStatus(node) === "maintenance") {
      return reply.code(409).send({ error: "Server not available yet", code: "node_unavailable" });
    }
    if (controls.isNodeDisabled(node.id)) {
      metrics.nodeDisabledRejected += 1;
      return reply.code(409).send({
        error: "Server temporarily disabled",
        code: "node_disabled",
      });
    }
    if (!node.endpoint || !node.publicKey) {
      return reply.code(409).send({ error: "Server is missing route endpoint or public key" });
    }

    let allowedIps: string[];
    try {
      allowedIps = [...computeAllowedIps(node), ...config.devExtraRoutes];
    } catch {
      return reply.code(409).send({
        error:
          "Unsafe route policy blocked. Zer0 beta servers must use a valid full-session or targeted split route policy.",
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

    const activeCount = store.countActiveSessionsForSubject({
      clerkUserId: tester.clerkUserId,
      testerId: tester.testerId,
    });
    if (activeCount >= entitlements.maxConcurrentSessionsPerUser) {
      metrics.concurrentRejected += 1;
      return reply.code(409).send(entitlementErrorBody("concurrent_session_limit"));
    }

    if (
      config.maxConcurrentSessionsPerDevice > 0 &&
      tester.deviceId &&
      store.countActiveSessionsForDevice(tester.deviceId) >= config.maxConcurrentSessionsPerDevice
    ) {
      metrics.concurrentRejected += 1;
      return reply.code(409).send({
        error: "Device already has the maximum number of active route sessions",
        code: "concurrent_device_limit",
      });
    }

    if (store.findActiveByPublicKey(clientPublicKey)) {
      return reply.code(409).send({
        error: "This peer public key is already assigned to an active session",
        code: "duplicate_peer",
      });
    }

    const nodeActive = store.countActiveSessionsForNode(node.id);
    if (nodeActive >= nodeCapacityLimit) {
      metrics.capacityRejected += 1;
      app.log.warn(
        {
          event: "route_create_rejected",
          reason: "node_full",
          selectedNode: node.id,
          activeOnNode: nodeActive,
          capacityLimit: nodeCapacityLimit,
        },
        "Node at capacity",
      );
      return reply.code(503).send({
        error: "No routing capacity available on this node",
        code: "node_full",
      });
    }

    if (!config.nodes.some((candidate) => isNodeAcceptingRoutes(candidate.id))) {
      metrics.capacityRejected += 1;
      return reply.code(503).send({
        error: "No routing nodes are currently available",
        code: "no_node_available",
      });
    }

    let clientIp: string;
    try {
      clientIp = peers.allocateIp(node, store.activeSessions());
    } catch {
      metrics.capacityRejected += 1;
      return reply.code(503).send({
        error: "No routing capacity available on this node",
        code: "node_full",
      });
    }

    if (store.findActiveByClientIp(node.id, clientIp)) {
      metrics.capacityRejected += 1;
      return reply.code(503).send({
        error: "No routing capacity available on this node",
        code: "duplicate_ip",
      });
    }

    const targetIpList = nodeTargetIps(node);

    try {
      await peers.createPeer(node, clientPublicKey, clientIp, tester.testerId);
      metrics.peerCreateOk += 1;
    } catch (error) {
      metrics.peerCreateFail += 1;
      if (error instanceof PeerProvisioningDisabledError) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error(
        {
          event: "peer_create_failed",
          selectedNode: node.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "WireGuard peer creation failed",
      );
      throw error;
    }
    app.log.info(
      {
        event: "peer_created",
        selectedNode: node.id,
        clientTunnelIp: clientIp,
        wgSet: config.peerMode === "wg" ? "success" : "mock",
      },
      "WireGuard peer provisioned",
    );

    const entitlementExpiresAt =
      tester.tokenType === "routing_entitlement"
        ? new Date(tester.exp * 1000).toISOString()
        : null;

    let session;
    try {
      session = store.createSession({
        testerId: tester.testerId,
        inviteCode: tester.inviteCode,
        clerkUserId: tester.clerkUserId ?? null,
        deviceId: tester.deviceId ?? null,
        entitlementExpiresAt,
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
    } catch (error) {
      await removeSessionPeer(
        {
          sessionId: "unpersisted",
          nodeId: node.id,
          publicKey: clientPublicKey,
          clientIp,
        },
        "peer_create_rollback",
        "session_persist_failed",
      );
      throw error;
    }

    app.log.info(
      {
        event: "optimization_started",
        selectedNode: node.id,
        endpoint: node.endpoint,
        clientTunnelIp: clientIp,
        routingMode: nodeRoutingMode(node),
        targetIps: targetIpList,
        allowedTargetedRoutes: session.allowedIps,
        serverPeerAllowedIps: clientIp,
        clerkUserId: session.clerkUserId,
        deviceId: session.deviceId,
      },
      "Zer0 optimization session created",
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
      routingMode: nodeRoutingMode(node),
      targetIps: targetIpList,
      serverName: node.name,
      serverId: node.id,
      tunnelCidr: node.tunnelCidr,
      serverTunnelIp: node.serverTunnelIp,
      publicIp: node.publicIp,
      entitlementExpiresAt: session.entitlementExpiresAt,
      expiresAtHint: {
        maxLifetimeHours: config.peerTtlHours,
        heartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
        recommendedHeartbeatMinutes: 5,
      },
    };
  }

  app.post<{ Body: { sessionId: string } }>("/api/routes/heartbeat", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const sessionId = request.body?.sessionId?.trim();
    if (!sessionId) {
      return reply.code(400).send({ error: "sessionId is required" });
    }
    if (
      controls.isUserBlocked({
        clerkUserId: tester.clerkUserId,
        testerId: tester.testerId,
        inviteCode: tester.inviteCode,
      })
    ) {
      metrics.userBlockedRejected += 1;
      return reply.code(403).send({ error: "Account disabled", code: "user_blocked" });
    }
    const updated = store.touchHeartbeat(sessionId, tester.testerId);
    if (!updated) {
      return reply.code(404).send({ error: "Active route session not found" });
    }
    metrics.heartbeatOk += 1;
    app.log.info(
      {
        event: "peer_heartbeat",
        sessionId: updated.sessionId,
        selectedNode: updated.nodeId,
        lastHeartbeatAt: updated.lastHeartbeatAt,
      },
      "Route session heartbeat refreshed",
    );
    return {
      sessionId: updated.sessionId,
      active: true,
      lastHeartbeatAt: updated.lastHeartbeatAt,
      heartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
    };
  });

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
    if (session.active) {
      if (removePeerFromWg) {
        await removeSessionPeer(session, "peer_removed", "client_end");
      }
      app.log.info(
        {
          event: "optimization_stopped",
          selectedNode: session.nodeId,
          endpoint: session.endpoint,
          clientTunnelIp: session.clientIp,
          cleanup: removePeerFromWg ? "success" : "session_only",
        },
        "Zer0 optimization session ended",
      );
    }
    // Idempotent: ending an already-inactive session is success.
    const ended = store.endSession(session.sessionId, tester.testerId);
    return { sessionId: ended?.sessionId ?? session.sessionId, active: false };
  }

  app.get<{ Params: { sessionId: string } }>("/api/routes/status/:sessionId", async (request, reply) => {
    const tester = (request as AuthedRequest).tester;
    const session = store.findSession(request.params.sessionId, tester.testerId);
    if (!session) return reply.code(404).send({ error: "Route session not found" });
    const node = findNode(config.nodes, session.nodeId);
    const status = node
      ? await peers.getPeerStatus(node, session.publicKey)
      : { latestHandshake: null, transferRx: null, transferTx: null, active: false };
    return {
      sessionId: session.sessionId,
      ...status,
      active: session.active,
      lastHeartbeatAt: session.lastHeartbeatAt,
      createdAt: session.createdAt,
    };
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
        lastHeartbeatAt: session.lastHeartbeatAt,
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

  app.get("/api/admin/controls", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return {
      controls: controls.get(),
      capacity: {
        maxPeersPerNode: config.maxPeersPerNode,
        nodeCapacityHeadroom: config.nodeCapacityHeadroom,
        effectivePerNode: nodeCapacityLimit,
        maxConcurrentSessionsPerUser: config.maxConcurrentSessionsPerUser,
        maxConcurrentSessionsPerDevice: config.maxConcurrentSessionsPerDevice,
        peerTtlHours: config.peerTtlHours,
        peerHeartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
      },
    };
  });

  app.put<{
    Body: {
      maintenanceMode?: boolean;
      routingDisabled?: boolean;
      disabledNodeIds?: string[];
      blockedClerkUserIds?: string[];
      blockedTesterIds?: string[];
      blockedInviteCodes?: string[];
      disabledAppVersions?: string[];
    };
  }>("/api/admin/controls", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const next = controls.update(request.body ?? {}, "admin");
    app.log.warn(
      {
        event: "admin_controls_updated",
        maintenanceMode: next.maintenanceMode,
        routingDisabled: next.routingDisabled,
        disabledNodeIds: next.disabledNodeIds,
        blockedClerkUserIdsCount: next.blockedClerkUserIds.length,
        blockedTesterIdsCount: next.blockedTesterIds.length,
        blockedInviteCodesCount: next.blockedInviteCodes.length,
        disabledAppVersions: next.disabledAppVersions,
      },
      "Emergency / ops controls updated",
    );
    return { controls: next };
  });

  app.get("/api/admin/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const active = store.activeSessions();
    return {
      health: buildPublicHealth(),
      controls: controls.get(),
      metrics: metrics.snapshot(),
      host: readHostResources(),
      nodes: config.nodes.map((node) => ({
        ...nodeHealthCheck(node),
        disabled: controls.isNodeDisabled(node.id),
        activeSessions: active.filter((session) => session.nodeId === node.id).length,
        capacityLimit: nodeCapacityLimit,
        acceptingRoutes: isNodeAcceptingRoutes(node.id),
      })),
      peerLifecycle: {
        peerTtlHours: config.peerTtlHours,
        peerHeartbeatGraceMinutes: config.peerHeartbeatGraceMinutes,
        recommendedHeartbeatMinutes: 5,
      },
    };
  });

  app.post<{ Params: { sessionId: string } }>(
    "/api/admin/sessions/:sessionId/end",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const session = store.findSession(request.params.sessionId);
      if (!session) return reply.code(404).send({ error: "Route session not found" });
      if (session.active) {
        await removeSessionPeer(session, "peer_removed", "admin_end");
      }
      const ended = store.endSessionById(session.sessionId);
      app.log.warn(
        {
          event: "admin_session_ended",
          sessionId: session.sessionId,
          selectedNode: session.nodeId,
        },
        "Admin force-ended route session",
      );
      return { sessionId: ended?.sessionId ?? session.sessionId, active: false };
    },
  );

  app.post<{ Params: { nodeId: string } }>(
    "/api/admin/nodes/:nodeId/expire-peers",
    async (request, reply) => {
      if (!(await requireAdmin(request, reply))) return;
      const node = findNode(config.nodes, request.params.nodeId);
      if (!node) return reply.code(404).send({ error: "Node not found" });
      const ended = store.endActiveSessionsForNode(node.id);
      let removed = 0;
      for (const session of ended) {
        if (await removeSessionPeer(session, "peer_expired", "admin_node_expire")) {
          removed += 1;
          metrics.peerExpired += 1;
        }
      }
      app.log.warn(
        {
          event: "admin_node_peers_expired",
          selectedNode: node.id,
          endedSessions: ended.length,
          peersRemoved: removed,
        },
        "Admin expired all peers on node",
      );
      return {
        nodeId: node.id,
        endedSessions: ended.length,
        peersRemoved: removed,
      };
    },
  );

  app.post<{ Body: unknown }>("/api/reports/upload", async (request) => {
    const tester = (request as AuthedRequest).tester;
    const fileName = `${Date.now()}-${tester.testerId}.json`;
    writeFileSync(join(config.reportsDir, fileName), `${JSON.stringify(request.body, null, 2)}\n`);
    return { ok: true };
  });

  return app;
}

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function maskInviteCode(code: string): string {
  if (code.length <= 4) return "****";
  return `${code.slice(0, 4)}***`;
}
