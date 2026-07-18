import { app, screen } from "electron";
import { join } from "node:path";
import type {
  ActiveGameInfo,
  GameInfo,
  GameLaunchEvent,
  IOverwolfOverlayApi,
  OverlayBrowserWindow,
} from "@overwolf/ow-electron-packages-types/overlay";
import { PassthroughType } from "@overwolf/ow-electron-packages-types/overlay";
import { ERROR_CODES, FORTNITE_GAME_ID, isFortniteGameId, OVERLAY_DEV_MODE_HELP } from "../shared/constants.js";
import type { RouteLagHudLayout, RouteLagHudState } from "../shared/hudTypes.js";
import { logger } from "./logger.js";
import { waitForOverlayApi } from "./packageBootstrap.js";

const OVERLAY_NAME = "routelag-hud-overlay";

export class OverlayManager {
  private overlay?: OverlayBrowserWindow;
  private api?: IOverwolfOverlayApi;
  private pendingLayout?: RouteLagHudLayout;
  private shouldShow = false;
  private gameInjected = false;
  private readyPromise?: Promise<void>;
  private onFortniteDetected?: () => void;
  private initError?: string;

  getInitError(): string | undefined {
    return this.initError;
  }

  isReady(): boolean {
    return Boolean(this.api);
  }

  setFortniteDetectedHandler(handler: () => void): void {
    this.onFortniteDetected = handler;
  }

  async create(): Promise<void> {
    this.readyPromise = this.bootstrap();
    await this.readyPromise;
  }

  async show(): Promise<void> {
    this.shouldShow = true;
    await this.readyPromise;

    if (!this.api) {
      logger.warn("HUD_OVERLAY_API_MISSING");
      return;
    }

    if (!this.gameInjected) {
      logger.info("Overlay show requested — requesting Fortnite injection");
      await this.requestInjection();
      return;
    }

    await this.showOverlayWindow();
  }

  hide(): void {
    this.shouldShow = false;
    this.overlay?.window.hide();
  }

  isVisible(): boolean {
    return this.gameInjected && Boolean(this.overlay?.window.isVisible());
  }

  sendState(state: RouteLagHudState, devDemo: boolean): void {
    this.overlay?.window.webContents.send("hud:state", { state, devDemo });
  }

  sendLayout(layout: RouteLagHudLayout): void {
    this.pendingLayout = layout;
    this.overlay?.window.webContents.send("hud:layout", layout);
  }

  private async bootstrap(): Promise<void> {
    try {
      this.api = await waitForOverlayApi();
      this.api.removeAllListeners();
      logger.info("Overlay API acquired");

      await this.api.registerGames({ gamesIds: [FORTNITE_GAME_ID], includeUnsupported: false });
      logger.info("Overlay registered for Fortnite");

      this.api.on("game-launched", (event: GameLaunchEvent, gameInfo: GameInfo) => {
        if (!this.isFortnite(gameInfo)) return;
        if (gameInfo.processInfo?.isElevated) {
          logger.warn("Fortnite is elevated — run Zer0 HUD as administrator");
          return;
        }
        logger.info("Fortnite launched — injecting overlay");
        this.onFortniteDetected?.();
        event.inject();
      });

      this.api.on("game-injected", (gameInfo: GameInfo) => {
        if (!this.isFortnite(gameInfo)) return;
        this.gameInjected = true;
        logger.info("Fortnite overlay injected");
        this.onFortniteDetected?.();
        if (this.shouldShow) {
          void this.showOverlayWindow();
        }
      });

      this.api.on("game-exit", (gameInfo: GameInfo) => {
        if (!this.isFortnite(gameInfo)) return;
        this.gameInjected = false;
        this.hide();
      });

      this.api.on("game-window-changed", (windowInfo) => {
        if (!this.overlay?.window || windowInfo.size.width <= 0 || windowInfo.size.height <= 0) return;
        this.overlay.window.setBounds({
          x: 0,
          y: 0,
          width: windowInfo.size.width,
          height: windowInfo.size.height,
        });
      });

      this.api.on("game-injection-error", (gameInfo: GameInfo, error: string) => {
        if (!this.isFortnite(gameInfo)) return;
        logger.warn("HUD_OVERLAY_INJECTION_ERROR", { error });
      });

      await this.requestInjection();
    } catch (error) {
      const message = String(error);
      this.initError = message.includes("Overlay API unavailable")
        ? OVERLAY_DEV_MODE_HELP
        : message;
      logger.warn(ERROR_CODES.OVERLAY_CREATE_FAILED, { error: message });
    }
  }

  private async requestInjection(): Promise<void> {
    if (!this.api) return;
    try {
      await (this.api as IOverwolfOverlayApi & {
        requestGameInjection?: (classId: number) => Promise<void>;
      }).requestGameInjection?.(FORTNITE_GAME_ID);
    } catch (error) {
      logger.info("Fortnite injection not available yet", { error: String(error) });
    }
  }

  private async showOverlayWindow(): Promise<void> {
    const window = await this.ensureWindow();
    if (!window) return;
    if (this.pendingLayout) {
      window.window.webContents.send("hud:layout", this.pendingLayout);
    }
    window.window.showInactive();
    logger.info("Overlay window shown");
  }

  private isFortnite(gameInfo: GameInfo): boolean {
    return isFortniteGameId(gameInfo.id) || isFortniteGameId(gameInfo.classId);
  }

  private async ensureWindow(): Promise<OverlayBrowserWindow | undefined> {
    if (this.overlay) return this.overlay;
    if (!this.api) return undefined;

    const active = this.api.getActiveGameInfo();
    const bounds = this.boundsForGame(active);

    try {
      this.overlay = await this.api.createWindow({
        name: OVERLAY_NAME,
        width: bounds.width,
        height: bounds.height,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        show: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: false,
        hasShadow: false,
        backgroundColor: "#00000000",
        passthrough: PassthroughType.PassThrough,
        webPreferences: {
          preload: join(app.getAppPath(), "dist", "preload", "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          devTools: false,
        },
      });

      this.overlay.window.setIgnoreMouseEvents(true, { forward: true });
      await this.overlay.window.loadFile(
        join(app.getAppPath(), "dist", "renderer", "overlay", "index.html"),
      );
      return this.overlay;
    } catch (error) {
      logger.warn("HUD_OVERLAY_CREATE_FAILED", { error: String(error) });
      return undefined;
    }
  }

  private boundsForGame(active: ActiveGameInfo | undefined) {
    const size = active?.gameWindowInfo.size;
    if (size && size.width > 0 && size.height > 0) {
      return { width: size.width, height: size.height };
    }
    const display = screen.getPrimaryDisplay().bounds;
    return { width: display.width, height: display.height };
  }
}
