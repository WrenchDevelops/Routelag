import { invoke } from "@tauri-apps/api/core";

import { listen, type UnlistenFn } from "@tauri-apps/api/event";



export type InstallerMode = "setup" | "uninstall";



export interface PayloadManifest {

  version: string;

  hudIncluded: boolean;

  appSizeBytes: number;

  engineSizeBytes: number;

  hudSizeBytes: number;

  channel?: string;

  downloadRequired?: boolean;

}



export interface ExistingInstall {

  installPath: string;

  version: string;

  engineInstalled: boolean;

  hudRuntimeInstalled: boolean;

  hudRuntimePath: string | null;

  installType: number;

}



export interface ProgressLine {

  step: string;

  message: string;

  percent: number;

  currentComponent?: string | null;

  fileName?: string | null;

  downloadedBytes?: number | null;

  totalBytes?: number | null;

  bytesPerSecond?: number | null;

  done: boolean;

  success: boolean;

  error: string | null;

}



export type InstallType = "baseApp" | "baseAppHud" | "hudOnly" | "custom";



export interface StartInstallArgs {

  installDir: string;

  installType: string;

  includeApp: boolean;

  includeEngine: boolean;

  includeHud: boolean;

  includeDesktopShortcut: boolean;

  includeStartMenuShortcut: boolean;

}



export interface StartUninstallArgs {

  installDir: string;

  removeUserData: boolean;

}



const PROGRESS_EVENT = "install-progress";



export const installerApi = {

  getMode: () => invoke<InstallerMode>("get_mode"),

  hasPayload: () => invoke<boolean>("has_payload"),

  getManifest: () => invoke<PayloadManifest>("get_manifest"),

  getExistingInstall: () => invoke<ExistingInstall | null>("get_existing_install"),

  defaultInstallDir: () => invoke<string>("default_install_dir"),

  browseInstallDir: (current: string) => invoke<string | null>("browse_install_dir", { current }),

  getDiskSpace: (path: string) => invoke<number>("get_disk_space", { path }),

  startInstall: (args: StartInstallArgs) =>

    invoke<void>("start_install", args as unknown as Record<string, unknown>),

  startAddHud: (args: { installDir: string }) =>

    invoke<void>("start_add_hud", args as unknown as Record<string, unknown>),

  startUninstall: (args: StartUninstallArgs) =>

    invoke<void>("start_uninstall", args as unknown as Record<string, unknown>),

  launchApp: (args: { installDir: string }) =>

    invoke<void>("launch_app", args as unknown as Record<string, unknown>),

  exitApp: () => invoke<void>("exit_app"),

  onProgress: (handler: (line: ProgressLine) => void): Promise<UnlistenFn> =>

    listen<ProgressLine>(PROGRESS_EVENT, (event) => handler(event.payload)),

};



export function formatBytes(bytes: number): string {

  if (!bytes || bytes <= 0) return "0 MB";

  const mb = bytes / (1024 * 1024);

  if (mb < 1024) return `${mb.toFixed(0)} MB`;

  return `${(mb / 1024).toFixed(2)} GB`;

}

