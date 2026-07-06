import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("routeLagHud", {
  onState: (callback: (payload: { state: Record<string, unknown>; devDemo: boolean }) => void) => {
    ipcRenderer.on("hud:state", (_event, payload) => callback(payload));
  },
  onLayout: (callback: (layout: Record<string, unknown>) => void) => {
    ipcRenderer.on("hud:layout", (_event, layout) => callback(layout));
  },
  showOverlay: () => ipcRenderer.invoke("hud:show-overlay"),
  hideOverlay: () => ipcRenderer.invoke("hud:hide-overlay"),
  restartHud: () => ipcRenderer.invoke("hud:restart"),
  quitHud: () => ipcRenderer.invoke("hud:quit"),
});
