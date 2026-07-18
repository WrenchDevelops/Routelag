import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import type { RouteLagHudLayout, RouteLagHudState } from "../shared/hudTypes.js";

export class WindowManager {
  private runtimeWindow?: BrowserWindow;

  async createRuntimeWindow(): Promise<void> {
    Menu.setApplicationMenu(null);
    this.runtimeWindow = new BrowserWindow({
      width: 420,
      height: 520,
      minWidth: 360,
      minHeight: 420,
      title: "Zer0 HUD Runtime",
      backgroundColor: "#101016",
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(app.getAppPath(), "dist", "preload", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
      },
    });

    this.runtimeWindow.setMenuBarVisibility(false);
    await this.runtimeWindow.loadFile(join(app.getAppPath(), "dist", "renderer", "desktop", "index.html"));
    this.runtimeWindow.show();
  }

  focusRuntimeWindow(): void {
    if (!this.runtimeWindow) return;
    if (this.runtimeWindow.isMinimized()) this.runtimeWindow.restore();
    this.runtimeWindow.show();
    this.runtimeWindow.focus();
  }

  sendState(state: RouteLagHudState, devDemo: boolean): void {
    this.runtimeWindow?.webContents.send("hud:state", { state, devDemo });
  }

  sendLayout(layout: RouteLagHudLayout): void {
    this.runtimeWindow?.webContents.send("hud:layout", layout);
  }
}
