import type { InstallType } from "./installerApi";
import { formatBytes } from "./installerApi";

export const WIZARD_STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "installType", label: "Install Type" },
  { id: "components", label: "Components" },
  { id: "location", label: "Location" },
  { id: "finish", label: "Finish" },
] as const;

export const INSTALLING_STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "installType", label: "Install Type" },
  { id: "components", label: "Components" },
  { id: "location", label: "Location" },
  { id: "ready", label: "Ready to Install" },
  { id: "installing", label: "Installing" },
  { id: "complete", label: "Finish" },
] as const;

export function installTypeLabel(type: InstallType): string {
  switch (type) {
    case "baseAppHud":
      return "Full Install";
    case "hudOnly":
      return "HUD Only";
    case "custom":
      return "Custom";
    default:
      return "Base App Only";
  }
}

export function backendInstallType(type: InstallType): string {
  switch (type) {
    case "baseAppHud":
      return "full";
    case "hudOnly":
      return "hud_only";
    case "custom":
      return "custom";
    default:
      return "standard";
  }
}

export interface ComponentSelection {
  includeApp: boolean;
  includeEngine: boolean;
  includeHud: boolean;
  includeDesktopShortcut: boolean;
  includeStartMenuShortcut: boolean;
}

export function componentsFromInstallType(
  type: InstallType,
  hudAvailable: boolean,
): ComponentSelection {
  switch (type) {
    case "hudOnly":
      return {
        includeApp: false,
        includeEngine: false,
        includeHud: hudAvailable,
        includeDesktopShortcut: false,
        includeStartMenuShortcut: false,
      };
    case "baseAppHud":
      return {
        includeApp: true,
        includeEngine: true,
        includeHud: hudAvailable,
        includeDesktopShortcut: true,
        includeStartMenuShortcut: true,
      };
    case "custom":
      return {
        includeApp: true,
        includeEngine: true,
        includeHud: hudAvailable,
        includeDesktopShortcut: true,
        includeStartMenuShortcut: true,
      };
    default:
      return {
        includeApp: true,
        includeEngine: true,
        includeHud: false,
        includeDesktopShortcut: true,
        includeStartMenuShortcut: true,
      };
  }
}

export function estimateInstallSize(
  selection: Pick<ComponentSelection, "includeApp" | "includeEngine" | "includeHud">,
  sizes: { appSizeBytes: number; engineSizeBytes: number; hudSizeBytes: number },
): number {
  let total = 0;
  if (selection.includeApp) total += sizes.appSizeBytes;
  if (selection.includeEngine) total += sizes.engineSizeBytes;
  if (selection.includeHud) total += sizes.hudSizeBytes;
  return total;
}

export function formatEstimatedSize(bytes: number): string {
  if (!bytes) return "~0 MB";
  return `~${formatBytes(bytes)}`;
}
