import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { NodeMetrics, NodeMetricsFile } from "./types.js";

const DEFAULT_METRICS_PATH = resolve("data/node-metrics.json");

export function loadNodeMetrics(filePath = DEFAULT_METRICS_PATH): Map<string, NodeMetrics> {
  if (!existsSync(filePath)) return new Map();
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8")) as NodeMetricsFile;
    return new Map(data.nodes.map((node) => [node.id, node]));
  } catch {
    return new Map();
  }
}

export function saveNodeMetrics(
  metrics: Map<string, NodeMetrics>,
  filePath = DEFAULT_METRICS_PATH,
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const data: NodeMetricsFile = {
    nodes: [...metrics.values()],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
