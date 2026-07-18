import { existsSync, readFileSync, statfsSync } from "node:fs";
import { loadavg, freemem, totalmem } from "node:os";

/**
 * Best-effort host resource snapshot for admin monitoring.
 * Returns null fields when the platform cannot provide a value (e.g. Windows
 * without /proc). Never throws.
 */
export interface HostResourcesSnapshot {
  platform: NodeJS.Platform;
  cpuLoad1m: number | null;
  memoryUsedPercent: number | null;
  memoryFreeMb: number | null;
  diskFreeMb: number | null;
  diskUsedPercent: number | null;
}

export function readHostResources(diskPath = process.cwd()): HostResourcesSnapshot {
  const memFree = freemem();
  const memTotal = totalmem();
  const memoryFreeMb = Number.isFinite(memFree) ? Math.round(memFree / (1024 * 1024)) : null;
  const memoryUsedPercent =
    Number.isFinite(memFree) && Number.isFinite(memTotal) && memTotal > 0
      ? Math.round(((memTotal - memFree) / memTotal) * 100)
      : null;

  let cpuLoad1m: number | null = null;
  try {
    const loads = loadavg();
    cpuLoad1m = Number.isFinite(loads[0]) ? Math.round(loads[0] * 100) / 100 : null;
  } catch {
    cpuLoad1m = null;
  }

  let diskFreeMb: number | null = null;
  let diskUsedPercent: number | null = null;
  try {
    if (typeof statfsSync === "function") {
      const stats = statfsSync(diskPath);
      const total = Number(stats.blocks) * Number(stats.bsize);
      const free = Number(stats.bfree) * Number(stats.bsize);
      if (total > 0) {
        diskFreeMb = Math.round(free / (1024 * 1024));
        diskUsedPercent = Math.round(((total - free) / total) * 100);
      }
    } else if (existsSync("/proc/mounts")) {
      // Older Node without statfs — leave disk null rather than guess.
      void readFileSync;
    }
  } catch {
    diskFreeMb = null;
    diskUsedPercent = null;
  }

  return {
    platform: process.platform,
    cpuLoad1m,
    memoryUsedPercent,
    memoryFreeMb,
    diskFreeMb,
    diskUsedPercent,
  };
}
