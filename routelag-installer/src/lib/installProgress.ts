import type { ComponentSelection } from "./installState";
import { formatEstimatedSize, installTypeLabel } from "./installState";
import type { InstallType } from "./installerApi";

export const INSTALL_FLOW_STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "installType", label: "Install Type" },
  { id: "components", label: "Components" },
  { id: "location", label: "Location" },
  { id: "installing", label: "Installing" },
] as const;

const BACKEND_STEP_ORDER = [
  "prepare",
  "app",
  "engine",
  "hud",
  "uninstaller",
  "registry",
  "shortcuts",
  "finalize",
  "done",
] as const;

export type InstallTaskStatus = "completed" | "installing" | "pending" | "skipped";

export interface InstallTask {
  id: string;
  label: string;
  completeAfter: (typeof BACKEND_STEP_ORDER)[number];
  activeOn: (typeof BACKEND_STEP_ORDER)[number];
  showWhen?: (selection: ComponentSelection) => boolean;
}

export const INSTALL_TASKS: InstallTask[] = [
  {
    id: "base-app",
    label: "Base app files copied",
    completeAfter: "app",
    activeOn: "app",
    showWhen: (s) => s.includeApp,
  },
  {
    id: "engine",
    label: "Routing engine installed",
    completeAfter: "engine",
    activeOn: "engine",
    showWhen: (s) => s.includeEngine,
  },
  {
    id: "replay",
    label: "PathGen Replay installed",
    completeAfter: "app",
    activeOn: "app",
    showWhen: (s) => s.includeApp,
  },
  {
    id: "hud",
    label: "HUD runtime installed",
    completeAfter: "hud",
    activeOn: "hud",
    showWhen: (s) => s.includeHud,
  },
  {
    id: "shortcuts",
    label: "Creating shortcuts",
    completeAfter: "shortcuts",
    activeOn: "shortcuts",
    showWhen: (s) => s.includeDesktopShortcut || s.includeStartMenuShortcut,
  },
];

function stepIndex(step: string): number {
  const index = BACKEND_STEP_ORDER.indexOf(step as (typeof BACKEND_STEP_ORDER)[number]);
  return index === -1 ? 0 : index;
}

export function resolveInstallTaskStatus(
  task: InstallTask,
  currentStep: string,
  done: boolean,
): InstallTaskStatus {
  if (done) return "completed";

  const currentIndex = stepIndex(currentStep);
  const completeIndex = stepIndex(task.completeAfter);
  const activeIndex = stepIndex(task.activeOn);

  if (currentIndex > completeIndex) return "completed";

  if (task.id === "replay") {
    return currentIndex > stepIndex("app") ? "completed" : "pending";
  }

  if (currentIndex < activeIndex) return "pending";
  if (currentIndex === activeIndex) return "installing";

  if (currentIndex > activeIndex && currentIndex <= completeIndex + 1) {
    return currentIndex > completeIndex ? "completed" : "installing";
  }

  return "pending";
}

export function componentsSummary(selection: ComponentSelection): string {
  const parts: string[] = [];
  if (selection.includeApp) parts.push("Base App");
  if (selection.includeHud) parts.push("HUD");
  if (selection.includeApp) parts.push("Replay");
  return parts.length > 0 ? parts.join(", ") : "None";
}

export function installSummaryRows(args: {
  installType: InstallType;
  selection: ComponentSelection;
  installDir: string;
  estimatedSizeBytes: number;
}) {
  return [
    { icon: "cube", label: "Install type", value: installTypeLabel(args.installType) },
    { icon: "components", label: "Components", value: componentsSummary(args.selection) },
    { icon: "folder", label: "Location", value: args.installDir },
    { icon: "size", label: "Required space", value: formatEstimatedSize(args.estimatedSizeBytes) },
  ];
}
