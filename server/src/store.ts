import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export interface RouteSession {
  sessionId: string;
  testerId: string;
  inviteCode: string;
  publicKey: string;
  clientIp: string;
  gameId: string;
  serverId: string;
  serverName: string;
  endpoint: string;
  allowedIps: string;
  mtu: number;
  appVersion: string;
  createdAt: string;
  endedAt: string | null;
  active: boolean;
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

  createSession(input: Omit<RouteSession, "sessionId" | "createdAt" | "endedAt" | "active">): RouteSession {
    const db = this.read();
    const session: RouteSession = {
      ...input,
      sessionId: `route_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      endedAt: null,
      active: true,
    };
    db.sessions.push(session);
    this.write(db);
    return session;
  }

  endSession(sessionId: string, testerId: string): RouteSession | null {
    const db = this.read();
    const session = db.sessions.find((item) => item.sessionId === sessionId && item.testerId === testerId);
    if (!session) return null;
    session.active = false;
    session.endedAt = session.endedAt ?? new Date().toISOString();
    this.write(db);
    return session;
  }

  findSession(sessionId: string, testerId?: string): RouteSession | null {
    return (
      this.listSessions().find(
        (session) => session.sessionId === sessionId && (!testerId || session.testerId === testerId),
      ) ?? null
    );
  }

  private read(): DbShape {
    if (!existsSync(this.filePath)) {
      return { sessions: [] };
    }
    return JSON.parse(readFileSync(this.filePath, "utf8")) as DbShape;
  }

  private write(db: DbShape): void {
    writeFileSync(this.filePath, `${JSON.stringify(db, null, 2)}\n`);
  }
}
