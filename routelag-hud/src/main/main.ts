import { app, ipcMain } from "electron";
import { BridgeClient } from "./bridgeClient.js";
import { parseCli } from "./cli.js";
import { FortniteGep } from "./fortniteGep.js";
import { LayoutStore } from "./layoutStore.js";
import { logger } from "./logger.js";
import { OverlayManager } from "./overlayManager.js";
import { WindowManager } from "./windowManager.js";
import { ERROR_CODES, HUD_STATUS_INTERVAL_MS, HUD_VERSION } from "../shared/constants.js";
import type { RouteLagHudLayout, RouteLagHudState } from "../shared/hudTypes.js";
import { ensureOverwolfPackagesBootstrapped } from "./packageBootstrap.js";

const cli = parseCli();

if (cli.showVersion || app.commandLine.hasSwitch("version")) {
  process.stdout.write(`Zer0 HUD Runtime ${HUD_VERSION}\n`);
  process.exit(0);
}

const lock = app.requestSingleInstanceLock({ shutdown: cli.shutdown });
if (!lock) {
  process.stdout.write(`${ERROR_CODES.ALREADY_RUNNING}\n`);
  app.exit(0);
}

const layoutStore = new LayoutStore();
const overlayManager = new OverlayManager();
const windowManager = new WindowManager();
const fortniteGep = new FortniteGep(cli.devDemo);
let bridgeClient: BridgeClient | undefined;
let currentState: RouteLagHudState = fortniteGep.getState();

function syncOverlayState(): void {
  fortniteGep.setOverlayVisible(overlayManager.isVisible());
}

function broadcastState(): void {
  syncOverlayState();
  const state = fortniteGep.getState();
  currentState = state;
  windowManager.sendState(state, cli.devDemo);
  overlayManager.sendState(state, cli.devDemo);
  bridgeClient?.sendState(state);
}

function shutdown(): void {
  bridgeClient?.stop();
  fortniteGep.stop();
  app.quit();
}

function applyLayout(layout: RouteLagHudLayout): void {
  const saved = layoutStore.save(layout);
  overlayManager.sendLayout(saved);
  windowManager.sendLayout(saved);
}

function configureBridge(): void {
  bridgeClient = new BridgeClient(
    (connected) => {
      fortniteGep.setBridgeConnected(connected);
      broadcastState();
    },
    (layout) => {
      applyLayout(layout);
    },
    (command) => {
      if (command === "show") {
        void overlayManager.show().then(() => {
          syncOverlayState();
          broadcastState();
        });
        return;
      }
      overlayManager.hide();
      syncOverlayState();
      broadcastState();
    },
  );
  bridgeClient.start();
}

app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
  const wantsShutdown =
    argv.includes("--shutdown") ||
    Boolean((additionalData as { shutdown?: boolean } | undefined)?.shutdown);

  if (wantsShutdown) {
    shutdown();
    return;
  }

  windowManager.focusRuntimeWindow();
  broadcastState();
});

app.whenReady().then(async () => {
  await ensureOverwolfPackagesBootstrapped();
  logger.info("Zer0 HUD Runtime starting");
  overlayManager.setFortniteDetectedHandler(() => {
    fortniteGep.markFortniteDetected();
    broadcastState();
  });

  await windowManager.createRuntimeWindow();
  fortniteGep.start();
  configureBridge();
  await overlayManager.create();

  fortniteGep.setOverlayStatus(overlayManager.isReady(), overlayManager.getInitError());

  const layout = layoutStore.load();
  windowManager.sendLayout(layout);
  overlayManager.sendLayout(layout);

  fortniteGep.on("state", broadcastState);

  ipcMain.handle("hud:show-overlay", () => {
    void overlayManager.show().then(() => broadcastState());
  });
  ipcMain.handle("hud:hide-overlay", () => {
    overlayManager.hide();
    broadcastState();
  });
  ipcMain.handle("hud:restart", () => {
    app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== "--shutdown") });
    shutdown();
  });
  ipcMain.handle("hud:quit", () => shutdown());

  setInterval(broadcastState, HUD_STATUS_INTERVAL_MS);
  broadcastState();
});

app.on("window-all-closed", (event: Event) => {
  event.preventDefault();
});
