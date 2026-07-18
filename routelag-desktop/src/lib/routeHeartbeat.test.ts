/**
 * Deterministic tests for desktop route heartbeats.
 * Run: npm run test:heartbeat
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  createRouteHeartbeatController,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  resetRouteHeartbeatForTests,
  resumeRouteHeartbeatIfNeeded,
  startRouteHeartbeat,
  stopRouteHeartbeat,
  type RouteHeartbeatDeps,
  type RouteHeartbeatPermanentReason,
  type RouteHeartbeatPhase,
  type RouteHeartbeatResponse,
} from "./routeHeartbeat.ts";

class TestApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "TestApiError";
    this.status = status;
    this.code = code;
  }
}

type Scheduled = { id: number; ms: number; fn: () => void | Promise<void> };

function createFakeTimers() {
  let nextId = 1;
  const scheduled: Scheduled[] = [];
  return {
    scheduled,
    setTimeoutFn(fn: () => void | Promise<void>, ms: number) {
      const id = nextId++;
      scheduled.push({ id, ms, fn });
      return id;
    },
    clearTimeoutFn(id: number) {
      const index = scheduled.findIndex((item) => item.id === id);
      if (index >= 0) scheduled.splice(index, 1);
    },
    async fireNext() {
      const next = scheduled.shift();
      if (!next) return null;
      await next.fn();
      return next;
    },
  };
}

function okHeartbeat(sessionId: string): RouteHeartbeatResponse {
  return {
    sessionId,
    active: true,
    lastHeartbeatAt: new Date().toISOString(),
    heartbeatGraceMinutes: 20,
  };
}

function baseDeps(
  overrides: Partial<RouteHeartbeatDeps> & {
    heartbeatImpl?: (sessionId: string) => Promise<RouteHeartbeatResponse>;
  } = {},
) {
  const timers = createFakeTimers();
  const heartbeats: string[] = [];
  const phases: Array<{ phase: RouteHeartbeatPhase; detail?: string }> = [];
  const permanents: Array<{ reason: RouteHeartbeatPermanentReason; detail: string }> =
    [];
  let entitlementCalls = 0;
  let forceCalls = 0;

  const deps: RouteHeartbeatDeps = {
    intervalMs: 5 * 60 * 1000,
    minIntervalMs: 1000,
    backoffInitialMs: 1000,
    backoffMaxMs: 4000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    ensureEntitlement: async (options) => {
      entitlementCalls += 1;
      if (options?.force) forceCalls += 1;
    },
    heartbeat: async (sessionId) => {
      heartbeats.push(sessionId);
      if (overrides.heartbeatImpl) return overrides.heartbeatImpl(sessionId);
      return okHeartbeat(sessionId);
    },
    onPhase: (phase, detail) => phases.push({ phase, detail }),
    onPermanentFailure: (reason, detail) => permanents.push({ reason, detail }),
    ...overrides,
  };

  return {
    deps,
    timers,
    heartbeats,
    phases,
    permanents,
    get entitlementCalls() {
      return entitlementCalls;
    },
    get forceCalls() {
      return forceCalls;
    },
  };
}

afterEach(() => {
  resetRouteHeartbeatForTests();
});

describe("route heartbeat lifecycle", () => {
  it("does not heartbeat before start (route creation)", async () => {
    const ctx = baseDeps();
    createRouteHeartbeatController(ctx.deps);
    assert.equal(ctx.heartbeats.length, 0);
    assert.equal(ctx.timers.scheduled.length, 0);
  });

  it("begins heartbeat scheduling only after start with a session id", async () => {
    const ctx = baseDeps();
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-1");
    assert.equal(controller.isRunning(), true);
    assert.equal(controller.getActiveSessionId(), "sess-1");
    assert.equal(ctx.heartbeats.length, 0);
    assert.equal(ctx.timers.scheduled.length, 1);
    assert.equal(ctx.timers.scheduled[0]?.ms, 5 * 60 * 1000);
  });

  it("uses five-minute cadence by default", async () => {
    const ctx = baseDeps();
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-cadence");
    assert.equal(ctx.timers.scheduled[0]?.ms, DEFAULT_HEARTBEAT_INTERVAL_MS);
    await ctx.timers.fireNext();
    assert.equal(ctx.heartbeats.length, 1);
    assert.equal(ctx.timers.scheduled[0]?.ms, DEFAULT_HEARTBEAT_INTERVAL_MS);
  });

  it("prevents duplicate timers for the same session", async () => {
    const ctx = baseDeps();
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-dup");
    controller.start("sess-dup");
    controller.start("sess-dup");
    assert.equal(controller.getTimerCount(), 1);
    assert.equal(ctx.timers.scheduled.length, 1);
  });

  it("stops heartbeat on disconnect", async () => {
    const ctx = baseDeps();
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-stop");
    controller.stop("stopped");
    assert.equal(controller.isRunning(), false);
    assert.equal(ctx.timers.scheduled.length, 0);
    assert.equal(ctx.heartbeats.length, 0);
  });

  it("stops heartbeat on logout", async () => {
    const ctx = baseDeps();
    startRouteHeartbeat("sess-logout", { deps: ctx.deps });
    stopRouteHeartbeat("logout");
    assert.equal(ctx.timers.scheduled.length, 0);
  });

  it("stops heartbeat on application exit", async () => {
    const ctx = baseDeps();
    startRouteHeartbeat("sess-exit", { deps: ctx.deps });
    stopRouteHeartbeat("app_exit");
    assert.equal(ctx.timers.scheduled.length, 0);
  });

  it("refreshes entitlement before each heartbeat tick", async () => {
    const ctx = baseDeps();
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-ent");
    await ctx.timers.fireNext();
    assert.ok(ctx.entitlementCalls >= 1);
    assert.equal(ctx.heartbeats.length, 1);
  });

  it("uses bounded backoff on temporary server outage", async () => {
    let calls = 0;
    const ctx = baseDeps({
      heartbeatImpl: async () => {
        calls += 1;
        if (calls <= 2) {
          throw new TestApiError("server error", 500);
        }
        return okHeartbeat("sess-tmp");
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-tmp");
    await ctx.timers.fireNext();
    assert.equal(controller.getPhase(), "degraded");
    assert.equal(ctx.timers.scheduled[0]?.ms, 1000);
    await ctx.timers.fireNext();
    assert.equal(controller.getPhase(), "degraded");
    assert.equal(ctx.timers.scheduled[0]?.ms, 2000);
    await ctx.timers.fireNext();
    assert.equal(controller.getPhase(), "active");
    assert.equal(ctx.timers.scheduled[0]?.ms, 5 * 60 * 1000);
    assert.equal(ctx.permanents.length, 0);
  });

  it("session missing triggers safe permanent disconnect", async () => {
    const ctx = baseDeps({
      heartbeatImpl: async () => {
        throw new TestApiError("Active route session not found", 404);
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-gone");
    await ctx.timers.fireNext();
    assert.equal(controller.isRunning(), false);
    assert.equal(ctx.permanents[0]?.reason, "session_missing");
    assert.equal(ctx.timers.scheduled.length, 0);
  });

  it("user blocked triggers safe permanent disconnect", async () => {
    const ctx = baseDeps({
      heartbeatImpl: async () => {
        throw new TestApiError("Account disabled", 403);
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-block");
    await ctx.timers.fireNext();
    assert.equal(ctx.permanents[0]?.reason, "user_blocked");
    assert.equal(controller.isRunning(), false);
  });

  it("maintenance response does not create a new route (degraded retry only)", async () => {
    const ctx = baseDeps({
      heartbeatImpl: async () => {
        throw new TestApiError("Maintenance", 503);
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-maint");
    await ctx.timers.fireNext();
    assert.equal(controller.getPhase(), "degraded");
    assert.equal(controller.getActiveSessionId(), "sess-maint");
    assert.equal(ctx.permanents.length, 0);
    assert.equal(ctx.heartbeats.length, 1);
  });

  it("old route session cannot heartbeat another session", async () => {
    const seen: string[] = [];
    const ctx = baseDeps({
      heartbeatImpl: async (sessionId) => {
        seen.push(sessionId);
        return okHeartbeat(sessionId);
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-a");
    await ctx.timers.fireNext();
    controller.start("sess-b");
    await ctx.timers.fireNext();
    assert.deepEqual(seen, ["sess-a", "sess-b"]);
    assert.equal(controller.getActiveSessionId(), "sess-b");
    // Only one timer pending for the active session.
    assert.equal(ctx.timers.scheduled.length, 1);
  });

  it("wrong device id is rejected without sending heartbeat", async () => {
    const ctx = baseDeps({
      expectedDeviceId: "device-a",
      getDeviceId: () => "device-b",
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-device");
    await ctx.timers.fireNext();
    assert.equal(ctx.heartbeats.length, 0);
    assert.equal(ctx.permanents[0]?.reason, "ownership_changed");
    assert.equal(controller.isRunning(), false);
  });

  it("renderer reload resume does not create duplicate timers", async () => {
    const ctx = baseDeps();
    startRouteHeartbeat("sess-reload", { deps: ctx.deps });
    const firstTimers = ctx.timers.scheduled.length;
    resumeRouteHeartbeatIfNeeded("sess-reload");
    resumeRouteHeartbeatIfNeeded("sess-reload");
    assert.equal(ctx.timers.scheduled.length, firstTimers);
    assert.equal(firstTimers, 1);
  });

  it("entitlement expiry triggers permanent disconnect after failed refresh", async () => {
    const ctx = baseDeps({
      heartbeatImpl: async () => {
        throw new TestApiError("expired", 403, "subscription_expired");
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-ent-exp");
    await ctx.timers.fireNext();
    assert.equal(ctx.permanents[0]?.reason, "entitlement_expired");
    assert.equal(controller.isRunning(), false);
  });

  it("auth expiry forces entitlement refresh before giving up", async () => {
    let calls = 0;
    const ctx = baseDeps({
      heartbeatImpl: async (sessionId) => {
        calls += 1;
        if (calls === 1) {
          throw new TestApiError("Authorization expired", 401, "invalid_token");
        }
        return okHeartbeat(sessionId);
      },
    });
    const controller = createRouteHeartbeatController(ctx.deps);
    controller.start("sess-auth");
    await ctx.timers.fireNext();
    assert.ok(ctx.forceCalls >= 1);
    assert.equal(controller.getPhase(), "active");
    assert.equal(ctx.permanents.length, 0);
  });
});
