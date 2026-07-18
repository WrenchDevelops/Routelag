import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface RouteSession {
  sessionId: string;
  testerId: string;
  inviteCode: string;
  /** Stable account subject when entitlement tokens are used. */
  clerkUserId: string | null;
  /** Client device / install identifier bound at entitlement exchange. */
  deviceId: string | null;
  /** ISO timestamp when the entitlement that authorized create expires. */
  entitlementExpiresAt: string | null;
  nodeId: string;
  publicKey: string;
  clientIp: string;
  gameId: string;
  serverName: string;
  endpoint: string;
  allowedIps: string;
  mtu: number;
  appVersion: string;
  createdAt: string;
  /** Last successful heartbeat (or createdAt until first heartbeat). */
  lastHeartbeatAt: string;
  endedAt: string | null;
  active: boolean;
}

export interface SessionExpireOptions {
  /** Absolute max lifetime from createdAt. <=0 disables. */
  maxLifetimeHours: number;
  /** Max idle time from lastHeartbeatAt. <=0 disables. */
  heartbeatGraceMinutes: number;
}

interface DbShape {
  sessions: RouteSession[];
}

export class JsonStore {
  constructor(private readonly filePath: string) {}

  listSessions(): RouteSession[] {
    return this.read().sessions;
  }

  activeSessions(): RouteSession[] {
    return this.listSessions().filter((session) => session.active);
  }

  countActiveSessionsForSubject(subject: {
    clerkUserId?: string | null;
    testerId?: string;
  }): number {
    return this.activeSessions().filter((session) => {
      if (subject.clerkUserId) {
        return session.clerkUserId === subject.clerkUserId;
      }
      if (subject.testerId) {
        return session.testerId === subject.testerId;
      }
      return false;
    }).length;
  }

  countActiveSessionsForDevice(deviceId: string | null | undefined): number {
    if (!deviceId) return 0;
    return this.activeSessions().filter((session) => session.deviceId === deviceId).length;
  }

  countActiveSessionsForNode(nodeId: string): number {
    return this.activeSessions().filter((session) => session.nodeId === nodeId).length;
  }

  findActiveByPublicKey(publicKey: string): RouteSession | null {
    return (
      this.activeSessions().find((session) => session.publicKey === publicKey) ?? null
    );
  }

  findActiveByClientIp(nodeId: string, clientIp: string): RouteSession | null {
    const normalized = clientIp.replace(/\/32$/, "");
    return (
      this.activeSessions().find(
        (session) =>
          session.nodeId === nodeId &&
          session.clientIp.replace(/\/32$/, "") === normalized,
      ) ?? null
    );
  }

  createSession(
    input: Omit<
      RouteSession,
      "sessionId" | "createdAt" | "lastHeartbeatAt" | "endedAt" | "active"
    >,
  ): RouteSession {
    const db = this.read();
    const now = new Date().toISOString();
    const session: RouteSession = {
      ...input,
      clerkUserId: input.clerkUserId ?? null,
      deviceId: input.deviceId ?? null,
      entitlementExpiresAt: input.entitlementExpiresAt ?? null,
      sessionId: `route_${randomUUID()}`,
      createdAt: now,
      lastHeartbeatAt: now,
      endedAt: null,
      active: true,
    };
    db.sessions.push(session);
    this.write(db);
    return session;
  }

  touchHeartbeat(sessionId: string, testerId: string, now = new Date()): RouteSession | null {
    const db = this.read();
    const session = db.sessions.find(
      (item) => item.sessionId === sessionId && item.testerId === testerId,
    );
    if (!session || !session.active) return null;
    session.lastHeartbeatAt = now.toISOString();
    this.write(db);
    return { ...session };
  }

  endSession(sessionId: string, testerId: string): RouteSession | null {
    const db = this.read();
    const session = db.sessions.find(
      (item) => item.sessionId === sessionId && item.testerId === testerId,
    );
    if (!session) return null;
    if (!session.active && session.endedAt) {
      return { ...session };
    }
    session.active = false;
    session.endedAt = session.endedAt ?? new Date().toISOString();
    this.write(db);
    return { ...session };
  }

  /** Admin / emergency end — no tester ownership check. Idempotent. */
  endSessionById(sessionId: string, now = new Date()): RouteSession | null {
    const db = this.read();
    const session = db.sessions.find((item) => item.sessionId === sessionId);
    if (!session) return null;
    if (!session.active && session.endedAt) {
      return { ...session };
    }
    session.active = false;
    session.endedAt = session.endedAt ?? now.toISOString();
    this.write(db);
    return { ...session };
  }

  /**
   * Mark expired active sessions inactive. Returns expired sessions (with
   * publicKey/nodeId) so the caller can remove WireGuard peers.
   *
   * A session expires when either:
   * - absolute max lifetime from createdAt is exceeded, or
   * - heartbeat grace from lastHeartbeatAt is exceeded.
   *
   * Entitlement period end is enforced at create time (and via short-lived
   * entitlement tokens). Abandoned-peer cleanup uses peer TTL / heartbeat
   * only so a short entitlement-token TTL cannot tear down an in-match session.
   */
  expireStaleActiveSessions(
    ttlHoursOrOptions: number | SessionExpireOptions,
    now = new Date(),
  ): RouteSession[] {
    const options = normalizeExpireOptions(ttlHoursOrOptions);
    if (options.maxLifetimeHours <= 0 && options.heartbeatGraceMinutes <= 0) {
      return [];
    }
    const lifetimeCutoffMs =
      options.maxLifetimeHours > 0
        ? now.getTime() - options.maxLifetimeHours * 60 * 60 * 1000
        : null;
    const heartbeatCutoffMs =
      options.heartbeatGraceMinutes > 0
        ? now.getTime() - options.heartbeatGraceMinutes * 60 * 1000
        : null;

    const db = this.read();
    const expired: RouteSession[] = [];
    for (const session of db.sessions) {
      if (!session.active) continue;
      const createdMs = DateParseSafe(session.createdAt);
      const heartbeatMs =
        DateParseSafe(session.lastHeartbeatAt) ?? createdMs ?? DateParseSafe(session.createdAt);
      const pastLifetime =
        lifetimeCutoffMs != null && createdMs != null && createdMs <= lifetimeCutoffMs;
      const pastHeartbeat =
        heartbeatCutoffMs != null && heartbeatMs != null && heartbeatMs <= heartbeatCutoffMs;
      if (!pastLifetime && !pastHeartbeat) continue;
      session.active = false;
      session.endedAt = session.endedAt ?? now.toISOString();
      expired.push({ ...session });
    }
    if (expired.length) {
      this.write(db);
    }
    return expired;
  }

  /** End all active sessions on a node. Returns ended sessions for peer removal. */
  endActiveSessionsForNode(nodeId: string, now = new Date()): RouteSession[] {
    const db = this.read();
    const ended: RouteSession[] = [];
    for (const session of db.sessions) {
      if (!session.active || session.nodeId !== nodeId) continue;
      session.active = false;
      session.endedAt = session.endedAt ?? now.toISOString();
      ended.push({ ...session });
    }
    if (ended.length) {
      this.write(db);
    }
    return ended;
  }

  findSession(sessionId: string, testerId?: string): RouteSession | null {
    return (
      this.listSessions().find(
        (session) =>
          session.sessionId === sessionId && (!testerId || session.testerId === testerId),
      ) ?? null
    );
  }

  private read(): DbShape {
    if (!existsSync(this.filePath)) {
      return { sessions: [] };
    }
    const raw = JSON.parse(readFileSync(this.filePath, "utf8")) as {
      sessions?: Array<Partial<RouteSession> & { sessionId: string; testerId: string }>;
    };
    return {
      sessions: (raw.sessions ?? []).map((session) => {
        const createdAt = session.createdAt ?? new Date(0).toISOString();
        return {
          sessionId: session.sessionId,
          testerId: session.testerId,
          inviteCode: session.inviteCode ?? "",
          clerkUserId: session.clerkUserId ?? null,
          deviceId: session.deviceId ?? null,
          entitlementExpiresAt: session.entitlementExpiresAt ?? null,
          nodeId: session.nodeId ?? "",
          publicKey: session.publicKey ?? "",
          clientIp: session.clientIp ?? "",
          gameId: session.gameId ?? "",
          serverName: session.serverName ?? "",
          endpoint: session.endpoint ?? "",
          allowedIps: session.allowedIps ?? "",
          mtu: session.mtu ?? 1280,
          appVersion: session.appVersion ?? "unknown",
          createdAt,
          lastHeartbeatAt: session.lastHeartbeatAt ?? createdAt,
          endedAt: session.endedAt ?? null,
          active: Boolean(session.active),
        };
      }),
    };
  }

  private write(db: DbShape): void {
    writeFileSync(this.filePath, `${JSON.stringify(db, null, 2)}\n`);
  }
}

function normalizeExpireOptions(
  ttlHoursOrOptions: number | SessionExpireOptions,
): SessionExpireOptions {
  if (typeof ttlHoursOrOptions === "number") {
    return {
      maxLifetimeHours: ttlHoursOrOptions,
      heartbeatGraceMinutes: 0,
    };
  }
  return {
    maxLifetimeHours: ttlHoursOrOptions.maxLifetimeHours,
    heartbeatGraceMinutes: ttlHoursOrOptions.heartbeatGraceMinutes,
  };
}

function DateParseSafe(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
