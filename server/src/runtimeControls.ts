import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Server-side emergency / capacity-adjacent controls that can change without a
 * desktop update. Persisted so API restarts keep the last ops decision.
 *
 * Env vars seed defaults at boot; admin API writes override the file.
 */
export interface RuntimeControlsState {
  /** Reject all new route creates (maintenance / kill switch). */
  maintenanceMode: boolean;
  /** Alias kill switch — same effect as maintenanceMode when true. */
  routingDisabled: boolean;
  disabledNodeIds: string[];
  blockedClerkUserIds: string[];
  blockedTesterIds: string[];
  blockedInviteCodes: string[];
  disabledAppVersions: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface RuntimeControlsSeed {
  maintenanceMode?: boolean;
  routingDisabled?: boolean;
  disabledNodeIds?: string[];
  blockedClerkUserIds?: string[];
  blockedTesterIds?: string[];
  blockedInviteCodes?: string[];
  disabledAppVersions?: string[];
}

const EMPTY: RuntimeControlsState = {
  maintenanceMode: false,
  routingDisabled: false,
  disabledNodeIds: [],
  blockedClerkUserIds: [],
  blockedTesterIds: [],
  blockedInviteCodes: [],
  disabledAppVersions: [],
  updatedAt: null,
  updatedBy: null,
};

export class RuntimeControlsStore {
  private state: RuntimeControlsState;

  constructor(
    private readonly filePath: string,
    seed: RuntimeControlsSeed = {},
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.state = mergeControls(EMPTY, seed);
    if (existsSync(filePath)) {
      this.state = mergeControls(this.state, readControlsFile(filePath));
    } else {
      this.persist();
    }
  }

  get(): RuntimeControlsState {
    return cloneControls(this.state);
  }

  isRoutingCreationBlocked(): boolean {
    return this.state.maintenanceMode || this.state.routingDisabled;
  }

  isNodeDisabled(nodeId: string): boolean {
    return this.state.disabledNodeIds.includes(nodeId);
  }

  isUserBlocked(input: {
    clerkUserId?: string | null;
    testerId?: string | null;
    inviteCode?: string | null;
  }): boolean {
    if (input.clerkUserId && this.state.blockedClerkUserIds.includes(input.clerkUserId)) {
      return true;
    }
    if (input.testerId && this.state.blockedTesterIds.includes(input.testerId)) {
      return true;
    }
    if (input.inviteCode && this.state.blockedInviteCodes.includes(input.inviteCode)) {
      return true;
    }
    return false;
  }

  isAppVersionDisabled(appVersion: string | undefined | null): boolean {
    if (!appVersion || appVersion === "unknown") return false;
    return this.state.disabledAppVersions.includes(appVersion.trim());
  }

  update(
    patch: Partial<RuntimeControlsSeed>,
    updatedBy = "admin",
  ): RuntimeControlsState {
    this.state = {
      ...mergeControls(this.state, patch),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.persist();
    return this.get();
  }

  private persist(): void {
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`);
  }
}

function mergeControls(
  base: RuntimeControlsState,
  patch: RuntimeControlsSeed,
): RuntimeControlsState {
  return {
    maintenanceMode: patch.maintenanceMode ?? base.maintenanceMode,
    routingDisabled: patch.routingDisabled ?? base.routingDisabled,
    disabledNodeIds: uniqueStrings(patch.disabledNodeIds ?? base.disabledNodeIds),
    blockedClerkUserIds: uniqueStrings(
      patch.blockedClerkUserIds ?? base.blockedClerkUserIds,
    ),
    blockedTesterIds: uniqueStrings(patch.blockedTesterIds ?? base.blockedTesterIds),
    blockedInviteCodes: uniqueStrings(
      patch.blockedInviteCodes ?? base.blockedInviteCodes,
    ),
    disabledAppVersions: uniqueStrings(
      patch.disabledAppVersions ?? base.disabledAppVersions,
    ),
    updatedAt: base.updatedAt,
    updatedBy: base.updatedBy,
  };
}

function readControlsFile(filePath: string): RuntimeControlsSeed {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RuntimeControlsState>;
    return {
      maintenanceMode: Boolean(raw.maintenanceMode),
      routingDisabled: Boolean(raw.routingDisabled),
      disabledNodeIds: Array.isArray(raw.disabledNodeIds) ? raw.disabledNodeIds : [],
      blockedClerkUserIds: Array.isArray(raw.blockedClerkUserIds)
        ? raw.blockedClerkUserIds
        : [],
      blockedTesterIds: Array.isArray(raw.blockedTesterIds) ? raw.blockedTesterIds : [],
      blockedInviteCodes: Array.isArray(raw.blockedInviteCodes)
        ? raw.blockedInviteCodes
        : [],
      disabledAppVersions: Array.isArray(raw.disabledAppVersions)
        ? raw.disabledAppVersions
        : [],
    };
  } catch {
    return {};
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cloneControls(state: RuntimeControlsState): RuntimeControlsState {
  return {
    ...state,
    disabledNodeIds: [...state.disabledNodeIds],
    blockedClerkUserIds: [...state.blockedClerkUserIds],
    blockedTesterIds: [...state.blockedTesterIds],
    blockedInviteCodes: [...state.blockedInviteCodes],
    disabledAppVersions: [...state.disabledAppVersions],
  };
}
