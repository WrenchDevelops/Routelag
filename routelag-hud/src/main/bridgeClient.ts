import { logger } from "./logger.js";
import { ERROR_CODES } from "../shared/constants.js";
import type { RouteLagHudLayout } from "../shared/hudTypes.js";
import type { RouteLagHudState } from "../shared/hudTypes.js";
import { desktopLayoutToHudLayout } from "../shared/layoutConverter.js";
import { toTelemetryPayload } from "../shared/telemetryPayload.js";

const PAIR_URL = "http://127.0.0.1:17389/hud/pair";
const TELEMETRY_URL = "http://127.0.0.1:17389/hud/telemetry";
const RUNTIME_URL = "http://127.0.0.1:17389/hud/runtime";

type ConnectionHandler = (connected: boolean) => void;
type LayoutHandler = (layout: RouteLagHudLayout) => void;
type OverlayCommandHandler = (command: "show" | "hide") => void;

type RuntimeResponse = {
  overlayShow?: boolean;
  overlayHide?: boolean;
  layoutRevision?: number;
  layout?: unknown;
};

export class BridgeClient {
  private stopped = false;
  private startedAt = 0;
  private retryTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private token?: string;
  private connected = false;
  private lastErrorLogAt = 0;
  private lastLayoutRevision = 0;

  constructor(
    private readonly onConnection: ConnectionHandler,
    private readonly onLayout: LayoutHandler,
    private readonly onOverlayCommand: OverlayCommandHandler,
  ) {}

  start(): void {
    this.stopped = false;
    this.startedAt = Date.now();
    void this.pollRuntime();
    this.pollTimer = setInterval(() => {
      void this.pollRuntime();
    }, 2000);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.setConnected(false);
  }

  sendState(state: RouteLagHudState): void {
    if (!this.token) return;
    void this.postTelemetry(toTelemetryPayload(state));
  }

  private async pollRuntime(): Promise<void> {
    if (this.stopped) return;
    try {
      if (!this.token) {
        await this.pair();
      }
      if (!this.token) return;

      const response = await fetch(RUNTIME_URL, {
        method: "GET",
        headers: {
          "X-RouteLag-HUD-Token": this.token,
        },
      });

      if (response.status === 401) {
        this.token = undefined;
        throw new Error("Unauthorized");
      }
      if (!response.ok) {
        throw new Error(`Runtime poll failed (${response.status})`);
      }

      const payload = (await response.json()) as RuntimeResponse;
      this.setConnected(true);

      if (payload.overlayShow) this.onOverlayCommand("show");
      if (payload.overlayHide) this.onOverlayCommand("hide");

      const revision = Number(payload.layoutRevision ?? 0);
      const shouldRefreshLayout = revision > this.lastLayoutRevision || Boolean(payload.overlayShow);
      if (shouldRefreshLayout) {
        this.lastLayoutRevision = Math.max(this.lastLayoutRevision, revision);
        const converted = desktopLayoutToHudLayout(payload.layout);
        if (converted) this.onLayout(converted);
      }
    } catch {
      this.logConnectError();
      this.setConnected(false);
      this.scheduleReconnect();
    }
  }

  private async pair(): Promise<void> {
    const response = await fetch(PAIR_URL, { method: "GET" });
    if (!response.ok) {
      throw new Error(`Pairing failed (${response.status})`);
    }
    const payload = (await response.json()) as { token?: string };
    if (!payload.token) {
      throw new Error("Pairing response missing token");
    }
    this.token = payload.token;
  }

  private async postTelemetry(payload: unknown): Promise<void> {
    if (!this.token) return;
    const response = await fetch(TELEMETRY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RouteLag-HUD-Token": this.token,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      this.token = undefined;
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      throw new Error(`Telemetry rejected (${response.status})`);
    }

    this.setConnected(true);
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    this.onConnection(connected);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.retryTimer) return;
    const elapsed = Date.now() - this.startedAt;
    const delay = elapsed < 30000 ? 2000 : 10000;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.pollRuntime();
    }, delay);
  }

  private logConnectError(): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt > 10000) {
      logger.warn(ERROR_CODES.BRIDGE_CONNECT_FAILED);
      this.lastErrorLogAt = now;
    }
  }
}
