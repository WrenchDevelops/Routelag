/**
 * Low-frequency authenticated route-session heartbeats.
 *
 * Starts only after the server confirms route creation. Stops on disconnect,
 * logout, app exit, ownership change, or permanent server rejection.
 * Temporary outages use bounded backoff and surface a degraded state — they
 * never recreate a route.
 */

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_HEARTBEAT_MIN_INTERVAL_MS = 60 * 1000;
export const DEFAULT_BACKOFF_INITIAL_MS = 15 * 1000;
export const DEFAULT_BACKOFF_MAX_MS = 2 * 60 * 1000;

export type RouteHeartbeatPhase =
  | "idle"
  | "active"
  | "degraded"
  | "stopping"
  | "ended";

export type RouteHeartbeatPermanentReason =
  | "session_missing"
  | "session_expired"
  | "user_blocked"
  | "entitlement_expired"
  | "auth_expired"
  | "account_restricted"
  | "stopped"
  | "logout"
  | "app_exit"
  | "ownership_changed";

export interface RouteHeartbeatResponse {
  sessionId: string;
  active: boolean;
  lastHeartbeatAt: string;
  heartbeatGraceMinutes?: number;
}

export interface RouteHeartbeatHttpError {
  status: number;
  code?: string;
  message: string;
}

export interface RouteHeartbeatDeps {
  heartbeat: (sessionId: string) => Promise<RouteHeartbeatResponse>;
  ensureEntitlement: (options?: { force?: boolean }) => Promise<void>;
  /** Bound device id for this client — optional client-side guard. */
  getDeviceId?: () => string | null;
  /** Expected device id captured when the route was created. */
  expectedDeviceId?: string | null;
  intervalMs?: number;
  minIntervalMs?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  now?: () => number;
  setTimeoutFn?: (fn: () => void | Promise<void>, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
  onPhase?: (phase: RouteHeartbeatPhase, detail?: string) => void;
  onPermanentFailure?: (
    reason: RouteHeartbeatPermanentReason,
    detail: string,
  ) => void;
}

export interface RouteHeartbeatController {
  start(sessionId: string, options?: { intervalMs?: number }): void;
  stop(reason?: RouteHeartbeatPermanentReason): void;
  isRunning(): boolean;
  getPhase(): RouteHeartbeatPhase;
  getActiveSessionId(): string | null;
  getTimerCount(): number;
  /** Test helper — fire the next scheduled tick immediately if one is pending. */
  flushForTests(): Promise<void>;
}

type GlobalHeartbeatSlot = {
  controller: RouteHeartbeatController | null;
  generation: number;
};

function globalSlot(): GlobalHeartbeatSlot {
  const key = "__zer0RouteHeartbeat";
  const root = globalThis as typeof globalThis & {
    [key]?: GlobalHeartbeatSlot;
  };
  if (!root[key]) {
    root[key] = { controller: null, generation: 0 };
  }
  return root[key]!;
}

function asHttpError(error: unknown): RouteHeartbeatHttpError | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  if (typeof candidate.status !== "number") return null;
  return {
    status: candidate.status,
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : error instanceof Error
          ? error.message
          : String(error),
  };
}

function classifyPermanent(
  error: unknown,
): RouteHeartbeatPermanentReason | null {
  const http = asHttpError(error);
  if (!http) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("log in") || msg.includes("authorization expired")) {
        return "auth_expired";
      }
    }
    return null;
  }

  if (http.code === "subscription_expired") return "entitlement_expired";
  if (http.code === "account_restricted") return "account_restricted";
  if (http.code === "invalid_token") return "auth_expired";
  if (http.status === 404) return "session_missing";
  if (http.status === 403) {
    const msg = http.message.toLowerCase();
    if (msg.includes("blocked") || msg.includes("disabled")) return "user_blocked";
    if (msg.includes("expired")) return "entitlement_expired";
    if (http.code === "subscription_required") return "entitlement_expired";
    return "user_blocked";
  }
  if (http.status === 401) return "auth_expired";
  return null;
}

function isTemporary(error: unknown): boolean {
  if (classifyPermanent(error)) return false;
  const http = asHttpError(error);
  if (http) {
    if (http.status >= 500) return true;
    if (http.status === 503) return true;
    if (http.code === "entitlement_unavailable") return true;
    return false;
  }
  return true;
}

export function createRouteHeartbeatController(
  deps: RouteHeartbeatDeps,
): RouteHeartbeatController {
  const intervalMs = Math.max(
    deps.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
    deps.minIntervalMs ?? DEFAULT_HEARTBEAT_MIN_INTERVAL_MS,
  );
  const backoffInitial = deps.backoffInitialMs ?? DEFAULT_BACKOFF_INITIAL_MS;
  const backoffMax = deps.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
  const setTimeoutFn =
    deps.setTimeoutFn ??
    ((fn: () => void | Promise<void>, ms: number) =>
      globalThis.setTimeout(fn, ms) as unknown as number);
  const clearTimeoutFn =
    deps.clearTimeoutFn ??
    ((id: number) =>
      globalThis.clearTimeout(id as unknown as ReturnType<typeof setTimeout>));

  let phase: RouteHeartbeatPhase = "idle";
  let activeSessionId: string | null = null;
  let timerId: number | null = null;
  let timerCount = 0;
  let generation = 0;
  let backoffMs = backoffInitial;
  let pendingTick: Promise<void> | null = null;
  let tickResolver: (() => void) | null = null;

  const setPhase = (next: RouteHeartbeatPhase, detail?: string) => {
    phase = next;
    deps.onPhase?.(next, detail);
  };

  const clearTimer = () => {
    if (timerId != null) {
      clearTimeoutFn(timerId);
      timerId = null;
    }
  };

  const schedule = (delayMs: number, gen: number) => {
    clearTimer();
    if (gen !== generation || !activeSessionId) return;
    timerCount += 1;
    timerId = setTimeoutFn(() => {
      timerId = null;
      return runTick(gen);
    }, delayMs);
  };

  const failPermanent = (
    reason: RouteHeartbeatPermanentReason,
    detail: string,
    gen: number,
  ) => {
    if (gen !== generation) return;
    clearTimer();
    activeSessionId = null;
    setPhase("ended", detail);
    deps.onPermanentFailure?.(reason, detail);
  };

  const runTick = async (gen: number) => {
    if (gen !== generation || !activeSessionId) return;
    const sessionId = activeSessionId;

    if (deps.expectedDeviceId && deps.getDeviceId) {
      const deviceId = deps.getDeviceId();
      if (deviceId && deviceId !== deps.expectedDeviceId) {
        failPermanent(
          "ownership_changed",
          "Device identity changed; stopping route heartbeat.",
          gen,
        );
        return;
      }
    }

    try {
      await deps.ensureEntitlement();
      if (gen !== generation || activeSessionId !== sessionId) return;

      const result = await deps.heartbeat(sessionId);
      if (gen !== generation || activeSessionId !== sessionId) return;

      if (result.sessionId !== sessionId) {
        failPermanent(
          "session_missing",
          "Heartbeat response session did not match the active route.",
          gen,
        );
        return;
      }
      if (!result.active) {
        failPermanent(
          "session_expired",
          "Route session is no longer active on the server.",
          gen,
        );
        return;
      }

      backoffMs = backoffInitial;
      setPhase("active", `lastHeartbeatAt=${result.lastHeartbeatAt}`);
      schedule(intervalMs, gen);
    } catch (error) {
      if (gen !== generation || activeSessionId !== sessionId) return;

      const permanent = classifyPermanent(error);
      if (permanent) {
        // One forced entitlement refresh for auth expiry before giving up.
        if (permanent === "auth_expired") {
          try {
            await deps.ensureEntitlement({ force: true });
            if (gen !== generation || activeSessionId !== sessionId) return;
            const result = await deps.heartbeat(sessionId);
            if (gen !== generation || activeSessionId !== sessionId) return;
            if (result.active && result.sessionId === sessionId) {
              backoffMs = backoffInitial;
              setPhase("active", `lastHeartbeatAt=${result.lastHeartbeatAt}`);
              schedule(intervalMs, gen);
              return;
            }
          } catch (retryError) {
            const retryPermanent = classifyPermanent(retryError) ?? permanent;
            failPermanent(
              retryPermanent,
              retryError instanceof Error ? retryError.message : String(retryError),
              gen,
            );
            return;
          }
        }
        failPermanent(
          permanent,
          error instanceof Error ? error.message : String(error),
          gen,
        );
        return;
      }

      if (isTemporary(error)) {
        setPhase(
          "degraded",
          error instanceof Error ? error.message : String(error),
        );
        const delay = backoffMs;
        backoffMs = Math.min(backoffMax, Math.max(backoffInitial, backoffMs * 2));
        schedule(delay, gen);
        return;
      }

      failPermanent(
        "session_expired",
        error instanceof Error ? error.message : String(error),
        gen,
      );
    } finally {
      if (tickResolver) {
        const resolve = tickResolver;
        tickResolver = null;
        pendingTick = null;
        resolve();
      }
    }
  };

  return {
    start(sessionId: string, options?: { intervalMs?: number }) {
      const trimmed = sessionId.trim();
      if (!trimmed) {
        throw new Error("Cannot start route heartbeat without a session id.");
      }
      if (
        activeSessionId === trimmed &&
        (phase === "active" || phase === "degraded")
      ) {
        // Same session already heartbeating — do not create a duplicate timer.
        return;
      }

      clearTimer();
      generation += 1;
      const gen = generation;
      activeSessionId = trimmed;
      backoffMs = backoffInitial;
      const cadence = Math.max(
        options?.intervalMs ?? intervalMs,
        deps.minIntervalMs ?? DEFAULT_HEARTBEAT_MIN_INTERVAL_MS,
      );
      setPhase("active", `heartbeat scheduled every ${cadence}ms`);
      // First refresh after the configured cadence — create already stamped lastHeartbeatAt.
      schedule(cadence, gen);
    },

    stop(reason: RouteHeartbeatPermanentReason = "stopped") {
      clearTimer();
      generation += 1;
      const wasActive = activeSessionId != null;
      activeSessionId = null;
      if (
        wasActive ||
        phase === "active" ||
        phase === "degraded" ||
        phase === "stopping"
      ) {
        setPhase("ended", reason);
      } else {
        setPhase("idle");
      }
    },

    isRunning() {
      return (
        activeSessionId != null &&
        (phase === "active" || phase === "degraded" || phase === "stopping")
      );
    },

    getPhase() {
      return phase;
    },

    getActiveSessionId() {
      return activeSessionId;
    },

    getTimerCount() {
      return timerCount;
    },

    async flushForTests() {
      if (timerId == null) return;
      const gen = generation;
      clearTimer();
      pendingTick = new Promise<void>((resolve) => {
        tickResolver = resolve;
      });
      await runTick(gen);
      if (pendingTick) await pendingTick;
    },
  };
}

let configuredDeps: RouteHeartbeatDeps | null = null;

export function configureRouteHeartbeat(deps: RouteHeartbeatDeps): void {
  configuredDeps = deps;
}

/**
 * Replace the singleton controller (used after renderer reload / test reset).
 * Clears any previous timer first.
 */
export function resetRouteHeartbeatForTests(): void {
  const slot = globalSlot();
  slot.controller?.stop("stopped");
  slot.controller = null;
  slot.generation += 1;
  configuredDeps = null;
}

export function startRouteHeartbeat(
  sessionId: string,
  options?: {
    intervalMs?: number;
    deps?: RouteHeartbeatDeps;
  },
): RouteHeartbeatController {
  const slot = globalSlot();
  const deps = options?.deps ?? configuredDeps;
  if (!deps) {
    throw new Error(
      "configureRouteHeartbeat() or deps must be provided before starting heartbeats.",
    );
  }

  const existing = slot.controller;
  if (
    existing?.isRunning() &&
    existing.getActiveSessionId() === sessionId.trim() &&
    !options?.deps
  ) {
    // Same session, same singleton — prevent duplicate timers on renderer reload.
    return existing;
  }

  if (existing) {
    existing.stop("stopped");
  }
  if (options?.deps) {
    configuredDeps = options.deps;
  }
  const controller = createRouteHeartbeatController(deps);
  slot.controller = controller;
  controller.start(sessionId, { intervalMs: options?.intervalMs });
  return controller;
}

export function stopRouteHeartbeat(
  reason: RouteHeartbeatPermanentReason = "stopped",
): void {
  const slot = globalSlot();
  if (!slot.controller) return;
  slot.controller.stop(reason);
}

export function getRouteHeartbeatController(): RouteHeartbeatController | null {
  return globalSlot().controller;
}

export function isRouteHeartbeatRunning(): boolean {
  return Boolean(globalSlot().controller?.isRunning());
}

export function getRouteHeartbeatSessionId(): string | null {
  return globalSlot().controller?.getActiveSessionId() ?? null;
}

/** Resume after renderer reload when a local active session still exists. */
export function resumeRouteHeartbeatIfNeeded(
  sessionId: string | null | undefined,
  options?: { intervalMs?: number; deps?: RouteHeartbeatDeps },
): boolean {
  const trimmed = sessionId?.trim();
  if (!trimmed) return false;
  const existing = globalSlot().controller;
  if (existing?.isRunning() && existing.getActiveSessionId() === trimmed) {
    return true;
  }
  startRouteHeartbeat(trimmed, options);
  return true;
}
