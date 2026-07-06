import type { IOverwolfOverlayApi } from "@overwolf/ow-electron-packages-types/overlay";
import type { overwolf } from "@overwolf/ow-electron";
import { app } from "electron";
import { logger } from "./logger.js";
import { owApp } from "./owApp.js";

type OWPackages = overwolf.packages.OverwolfPackageManager & {
  overlay?: IOverwolfOverlayApi;
  gep?: overwolf.packages.OverwolfGameEventPackage;
};

const readyVersions = new Map<string, string>();
const pending = new Map<string, Array<{ resolve: (version: string) => void; reject: (error: Error) => void }>>();

let listenersAttached = false;
let cachedOverlayApi: IOverwolfOverlayApi | undefined;

function packages(): OWPackages | undefined {
  return owApp().overwolf?.packages as OWPackages | undefined;
}

function readOverlayApi(manager: OWPackages | undefined): IOverwolfOverlayApi | undefined {
  if (!manager) return undefined;
  const api = manager.overlay;
  if (api && typeof api.on === "function") {
    return api;
  }
  return undefined;
}

function captureOverlayApi(manager: OWPackages | undefined): IOverwolfOverlayApi | undefined {
  const api = readOverlayApi(manager);
  if (api) {
    cachedOverlayApi = api;
  }
  return api;
}

export function bootstrapOverwolfPackages(): void {
  const manager = packages();
  if (!manager) {
    logger.warn("Overwolf package manager unavailable at bootstrap");
    return;
  }

  if (listenersAttached) return;
  listenersAttached = true;

  logger.info("Overwolf package manager ready", {
    logs: manager.logsFolderPath,
    hasGep: Boolean(manager.gep),
    hasOverlay: Boolean(readOverlayApi(manager)),
  });

  manager.on("ready", (_event, packageName, version) => {
    logger.info(`Overwolf package ready: ${packageName} (${version})`);
    readyVersions.set(packageName, version);

    if (packageName === "overlay") {
      const api = captureOverlayApi(manager);
      logger.info("Overlay API capture on ready", { captured: Boolean(api) });
      if (!api) {
        const keys = Object.getOwnPropertyNames(manager).filter((key) => !key.startsWith("_"));
        logger.warn("Overlay package ready but API missing", { keys });
      }
    }

    const waiters = pending.get(packageName);
    if (waiters?.length) {
      pending.delete(packageName);
      for (const waiter of waiters) waiter.resolve(version);
    }
  });

  manager.on("failed-to-initialize", (_event, packageName) => {
    logger.warn(`Overwolf package failed: ${packageName}`);
    const waiters = pending.get(packageName);
    if (waiters?.length) {
      pending.delete(packageName);
      for (const waiter of waiters) {
        waiter.reject(new Error(`Overwolf package failed to initialize: ${packageName}`));
      }
    }
  });

  manager.on("updated", (_event, packageName, version) => {
    logger.info(`Overwolf package updated: ${packageName} (${version})`);
    if (packageName === "overlay") {
      const api = captureOverlayApi(manager);
      if (api) {
        logger.info("Overlay API captured after package update");
      }
    }
  });

  for (const packageName of ["gep", "overlay"] as const) {
    const version = readyVersions.get(packageName);
    if (version) continue;
    if (packageName === "overlay" && captureOverlayApi(manager)) {
      readyVersions.set(packageName, "cached");
      continue;
    }
    if (packageName === "gep" && manager.gep) {
      readyVersions.set(packageName, "cached");
    }
  }
}

export function ensureOverwolfPackagesBootstrapped(): Promise<void> {
  bootstrapOverwolfPackages();
  if (packages()) return Promise.resolve();
  return app.whenReady().then(() => {
    bootstrapOverwolfPackages();
  });
}

export function whenPackageReady(packageName: string): Promise<string> {
  bootstrapOverwolfPackages();

  const existing = readyVersions.get(packageName);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const waiters = pending.get(packageName) ?? [];
      pending.set(
        packageName,
        waiters.filter((waiter) => waiter.resolve !== resolve),
      );
      reject(new Error(`Timed out waiting for Overwolf package: ${packageName}`));
    }, 90_000);

    const queue = pending.get(packageName) ?? [];
    queue.push({
      resolve: (version) => {
        clearTimeout(timeout);
        resolve(version);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    });
    pending.set(packageName, queue);
  });
}

export async function waitForOverlayApi(): Promise<IOverwolfOverlayApi> {
  await ensureOverwolfPackagesBootstrapped();

  if (cachedOverlayApi) return cachedOverlayApi;

  await whenPackageReady("overlay");

  const immediate = captureOverlayApi(packages());
  if (immediate) return immediate;

  for (let attempt = 0; attempt < 600; attempt += 1) {
    const api = captureOverlayApi(packages());
    if (api) return api;
    if (attempt % 40 === 0) {
      const manager = packages();
      logger.info("Waiting for overlay API", {
        attempt,
        keys: manager ? Object.getOwnPropertyNames(manager).filter((key) => !key.startsWith("_")) : [],
      });
    }
    await sleep(50);
  }

  throw new Error("Overlay API unavailable after overlay package ready");
}

export function overlayApi(): IOverwolfOverlayApi | undefined {
  return cachedOverlayApi ?? captureOverlayApi(packages());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
