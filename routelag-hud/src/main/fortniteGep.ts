import { EventEmitter } from "node:events";
import type { overwolf } from "@overwolf/ow-electron";
import { ERROR_CODES, FORTNITE_GAME_ID, HUD_VERSION, LIVE_DATA_STALE_MS, isFortniteGameId } from "../shared/constants.js";
import type { RouteLagHudState } from "../shared/hudTypes.js";
import { logger } from "./logger.js";
import { owApp } from "./owApp.js";
import { bootstrapOverwolfPackages, whenPackageReady } from "./packageBootstrap.js";

const FEATURES = [
  "game_info",
  "kill",
  "killed",
  "killer",
  "death",
  "assist",
  "match",
  "match_info",
  "rank",
  "me",
  "phase",
  "location",
  "team",
  "items",
  "counters",
  "map",
];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

function safeParse(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function asNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true" || value === "True" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === "False" || value === 0 || value === "0") return false;
  return undefined;
}

function pickNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function mergeNumber(target: RouteLagHudState, key: keyof RouteLagHudState, value: number | undefined): void {
  if (value !== undefined) {
    (target as unknown as Record<string, unknown>)[key] = value;
  }
}

type GepPackage = overwolf.packages.OverwolfGameEventPackage;

export class FortniteGep extends EventEmitter {
  private state: RouteLagHudState;
  private gep?: GepPackage;
  private activeGameId = 0;
  private featuresRegistered = false;
  private staleTimer?: NodeJS.Timeout;
  private demoTimer?: NodeJS.Timeout;
  private infoCache: Record<string, Record<string, unknown>> = {};

  constructor(private readonly devDemo: boolean) {
    super();
    this.state = {
      runtimeRunning: true,
      bridgeConnected: false,
      fortniteDetected: false,
      overlayVisible: false,
      liveDataActive: false,
      version: HUD_VERSION,
      lastUpdateAt: Date.now(),
    };
  }

  start(): void {
    if (this.devDemo) {
      this.startDemoData();
      return;
    }

    bootstrapOverwolfPackages();
    void this.bootstrapGep().catch((error: unknown) => {
      logger.warn(ERROR_CODES.GEP_FEATURE_REGISTRATION_FAILED, { error: String(error) });
    });
  }

  stop(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    if (this.demoTimer) clearInterval(this.demoTimer);
  }

  setBridgeConnected(bridgeConnected: boolean): void {
    this.patch({ bridgeConnected });
  }

  setOverlayVisible(overlayVisible: boolean): void {
    this.patch({ overlayVisible });
  }

  setOverlayStatus(overlayReady: boolean, overlayError?: string): void {
    this.patch({ overlayReady, overlayError });
  }

  markFortniteDetected(): void {
    this.patch({ fortniteDetected: true });
  }

  getState(): RouteLagHudState {
    return { ...this.state, materials: this.state.materials ? { ...this.state.materials } : undefined };
  }

  private async bootstrapGep(): Promise<void> {
    const version = await whenPackageReady("gep");
    logger.info(`GEP package ready (${version})`);

    this.gep = owApp().overwolf.packages.gep;
    this.gep.removeAllListeners();

    this.gep.on("game-detected", (event, gameId, name) => {
      if (!isFortniteGameId(Number(gameId))) return;
      logger.info("Fortnite detected by GEP", { gameId, name });
      event.enable();
      this.activeGameId = gameId;
      this.patch({ fortniteDetected: true });
      void this.registerFeatures();
    });

    this.gep.on("game-exit", (_event, gameId) => {
      if (!isFortniteGameId(Number(gameId))) return;
      this.activeGameId = 0;
      this.featuresRegistered = false;
      this.infoCache = {};
      this.patch({
        fortniteDetected: false,
        matchActive: false,
        liveDataActive: false,
        phase: undefined,
      });
    });

    this.gep.on("elevated-privileges-required", (_event, gameId) => {
      if (!isFortniteGameId(Number(gameId))) return;
      logger.warn("Fortnite is elevated — run RouteLag HUD as administrator for live stats");
    });

    this.gep.on("new-info-update", (_event, gameId, update) => {
      if (!isFortniteGameId(Number(gameId))) return;
      this.onInfoUpdate(update);
    });

    this.gep.on("new-game-event", (_event, gameId, update) => {
      if (!isFortniteGameId(Number(gameId))) return;
      this.onGameEvent(update);
    });

    this.gep.on("error", (gameId, error) => {
      if (!isFortniteGameId(Number(gameId))) return;
      logger.warn("GEP error", { error: String(error) });
      this.activeGameId = 0;
    });

    this.staleTimer = setInterval(() => this.refreshLiveDataStatus(), 1000);
  }

  private async registerFeatures(): Promise<void> {
    if (!this.gep || this.featuresRegistered || !isFortniteGameId(this.activeGameId)) return;
    try {
      await this.gep.setRequiredFeatures(FORTNITE_GAME_ID, FEATURES);
      this.featuresRegistered = true;
      logger.info("Fortnite GEP features registered");
      const info = await this.gep.getInfo(FORTNITE_GAME_ID);
      this.applyInfoBlob(info);
    } catch (error) {
      this.featuresRegistered = false;
      logger.warn(ERROR_CODES.GEP_FEATURE_REGISTRATION_FAILED, { error: String(error) });
    }
  }

  private onInfoUpdate(update: unknown): void {
    const record = asRecord(update);
    if (!record) return;

    const category = typeof record.category === "string" ? record.category : "misc";
    const key = typeof record.key === "string" ? record.key : "value";
    const value = safeParse(record.value);
    if (!this.infoCache[category]) this.infoCache[category] = {};
    this.infoCache[category][key] = asRecord(value) ?? { value };

    const next = { ...this.state };
    this.applyInfoRecord(next, { [category]: this.infoCache[category] });
    next.fortniteDetected = true;
    next.liveDataActive = true;
    next.lastUpdateAt = Date.now();
    this.patch(next);
  }

  private onGameEvent(update: unknown): void {
    const record = asRecord(update);
    if (!record) return;

    const key = typeof record.key === "string" ? record.key : typeof record.name === "string" ? record.name : "";
    const data = asRecord(safeParse(record.value)) ?? record;
    const next = { ...this.state };

    if (key === "kill") mergeNumber(next, "kills", asNumber(data.count) ?? (next.kills ?? 0) + 1);
    if (key === "death" || key === "killed") mergeNumber(next, "deaths", asNumber(data.count) ?? (next.deaths ?? 0) + 1);
    if (key === "assist") mergeNumber(next, "assists", asNumber(data.count) ?? (next.assists ?? 0) + 1);
    if (key === "matchStart" || key === "match_start") next.matchActive = true;
    if (key === "matchEnd" || key === "match_end") next.matchActive = false;

    next.fortniteDetected = true;
    next.liveDataActive = true;
    next.lastUpdateAt = Date.now();
    this.patch(next);
  }

  private applyInfoBlob(info: unknown): void {
    const record = asRecord(info);
    if (!record) return;
    const next = { ...this.state };
    this.applyInfoRecord(next, record);
    next.fortniteDetected = true;
    next.liveDataActive = true;
    next.lastUpdateAt = Date.now();
    this.patch(next);
  }

  private applyInfoRecord(next: RouteLagHudState, info: Record<string, unknown>): void {
    const gameInfo = asRecord(safeParse(info.game_info)) ?? asRecord(info.game_info);
    const me = asRecord(safeParse(info.me)) ?? asRecord(info.me);
    const phase = asRecord(safeParse(info.phase)) ?? asRecord(info.phase);
    const counters = asRecord(safeParse(info.counters)) ?? asRecord(info.counters);
    const rank = asRecord(safeParse(info.rank)) ?? asRecord(info.rank);
    const matchInfo = asRecord(safeParse(info.match_info)) ?? asRecord(info.match_info);
    const items = safeParse(info.items);
    const map = asRecord(safeParse(info.map)) ?? asRecord(info.map);

    if (gameInfo) {
      const matchActive = asBoolean(gameInfo.match_started ?? gameInfo.matchStarted);
      if (matchActive !== undefined) next.matchActive = matchActive;
      mergeNumber(next, "fps", pickNumber(gameInfo, ["fps", "framerate"]));
      mergeNumber(next, "ping", pickNumber(gameInfo, ["ping", "latency"]));
    }
    if (me) {
      mergeNumber(next, "health", pickNumber(me, ["health", "hp"]));
      mergeNumber(next, "shield", pickNumber(me, ["shield", "shields"]));
      mergeNumber(next, "overShield", pickNumber(me, ["overshield", "overShield"]));
    }
    if (phase) {
      const nextPhase = phase.phase ?? phase.name ?? phase.state ?? phase.value;
      if (typeof nextPhase === "string" && nextPhase.trim()) next.phase = nextPhase;
    }
    if (typeof info.phase === "string" && info.phase.trim()) next.phase = info.phase;
    if (counters) {
      mergeNumber(next, "kills", pickNumber(counters, ["kills"]));
      mergeNumber(next, "deaths", pickNumber(counters, ["deaths"]));
      mergeNumber(next, "assists", pickNumber(counters, ["assists"]));
      mergeNumber(next, "placement", pickNumber(counters, ["placement", "rank"]));
      mergeNumber(next, "damageDealt", pickNumber(counters, [
        "damage_dealt",
        "damageDealt",
        "damage_to_players",
        "damageToPlayers",
        "damage_done",
        "damageDone",
      ]));
      mergeNumber(next, "damageTaken", pickNumber(counters, [
        "damage_taken",
        "damageTaken",
        "damage_taken_from_players",
        "damageTakenFromPlayers",
      ]));
    }
    if (rank) {
      mergeNumber(next, "placement", pickNumber(rank, ["placement", "rank"]));
      mergeNumber(next, "totalPlayers", pickNumber(rank, ["totalPlayers", "total_players"]));
    }
    if (matchInfo) {
      mergeNumber(next, "totalPlayers", pickNumber(matchInfo, ["totalPlayers", "total_players"]));
      mergeNumber(next, "ping", pickNumber(matchInfo, ["ping", "latency"]));
    }
    if (map) {
      mergeNumber(next, "ping", pickNumber(map, ["ping", "latency"]));
    }
    if (Array.isArray(items)) {
      next.inventory = items.map((item, index) => {
        const itemRecord = asRecord(item) ?? {};
        return {
          slot: asNumber(itemRecord.slot) ?? index,
          name: typeof itemRecord.name === "string" ? itemRecord.name : undefined,
          rarity: typeof itemRecord.rarity === "string" ? itemRecord.rarity : undefined,
          count: asNumber(itemRecord.count),
          ammo: asNumber(itemRecord.ammo),
        };
      });
    }
  }

  private refreshLiveDataStatus(): void {
    if (this.state.liveDataActive && Date.now() - this.state.lastUpdateAt > LIVE_DATA_STALE_MS) {
      this.patch({ liveDataActive: false });
    }
  }

  private startDemoData(): void {
    if (!this.devDemo) return;
    let tick = 0;
    this.demoTimer = setInterval(() => {
      tick += 1;
      this.patch({
        fortniteDetected: true,
        liveDataActive: true,
        matchActive: true,
        phase: "DEMO DATA",
        ping: 18 + (tick % 5),
        fps: 140 + (tick % 10),
        kills: tick % 8,
        damageDealt: 420 + tick * 3,
        damageTaken: 110 + tick,
        health: 100,
        shield: 50 + (tick % 50),
        placement: 20 - (tick % 10),
        materials: { wood: 420, stone: 310, metal: 190 },
        lastUpdateAt: Date.now(),
      });
    }, 1000);
  }

  private patch(patch: Partial<RouteLagHudState>): void {
    this.state = {
      ...this.state,
      ...patch,
      version: HUD_VERSION,
      runtimeRunning: true,
      lastUpdateAt: patch.lastUpdateAt ?? this.state.lastUpdateAt,
    };
    this.emit("state", this.getState());
  }
}
