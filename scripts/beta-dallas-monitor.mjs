#!/usr/bin/env node
/**
 * External Dallas beta probe for Zer0 trusted private beta.
 *
 * Usage:
 *   node scripts/beta-dallas-monitor.mjs
 *   API_BASE=http://216.152.154.137:3001 node scripts/beta-dallas-monitor.mjs
 *   PROBE_URL=https://httpstat.us/503 node scripts/beta-dallas-monitor.mjs   # controlled fail test
 *
 * Exit codes:
 *   0 healthy
 *   1 unhealthy / threshold breach
 *   2 misconfiguration
 *
 * Never prints secrets, tokens, peer keys, or user identifiers.
 */

import { writeFileSync } from "node:fs";

const DEFAULT_API_BASE = "http://216.152.154.137:3001";
const DEFAULT_NODE_ID = "dallas-beta";
const DEFAULT_LATENCY_MS = Number(process.env.LATENCY_THRESHOLD_MS || 2000);
const DEFAULT_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 10000);

function redactUrl(url) {
  try {
    const u = new URL(url);
    u.username = "";
    u.password = "";
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return "[invalid-url]";
  }
}

function sanitizeBody(text) {
  if (!text) return "";
  return String(text)
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted-clerk]")
    .replace(/pk_(live|test)_[A-Za-z0-9]+/g, "[redacted-clerk]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[redacted-webhook]")
    .replace(/x-admin-token["']?\s*[:=]\s*["']?[^"'&\s]+/gi, "x-admin-token=[redacted]")
    .slice(0, 800);
}

async function fetchWithTimeout(url, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json, text/plain, */*", ...headers },
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function evaluateHealthPayload(body, nodeId) {
  const findings = [];
  if (!body || typeof body !== "object") {
    return { nodeOk: null, findings: ["body_not_json"] };
  }
  if (body.status === "maintenance" || body.ok === false) {
    findings.push("status_maintenance_or_not_ok");
  }
  if (body.routingEnabled === false) {
    findings.push("routing_disabled");
  }
  let nodeOk = null;
  if (Array.isArray(body.nodes)) {
    const node = body.nodes.find((n) => n && (n.id === nodeId || n.name === nodeId));
    if (!node) {
      findings.push(`node_missing:${nodeId}`);
      nodeOk = false;
    } else {
      const online = node.online === true || node.status === "online";
      const accepting =
        node.acceptingRoutes === undefined ? true : Boolean(node.acceptingRoutes);
      nodeOk = online && accepting !== false;
      if (!online) findings.push(`node_offline:${nodeId}`);
      if (accepting === false) findings.push(`node_not_accepting:${nodeId}`);
    }
  }
  return { nodeOk, findings };
}

async function probeAdminStatus(apiBase, adminToken, thresholds) {
  if (!adminToken) {
    return {
      checked: false,
      skipped: true,
      reason: "ADMIN_TOKEN unset — host/metrics checks skipped (safe stop)",
    };
  }
  const url = `${apiBase.replace(/\/$/, "")}/api/admin/status`;
  const res = await fetchWithTimeout(url, thresholds.timeoutMs, {
    authorization: `Bearer ${adminToken}`,
  });
  if (res.status === 401 || res.status === 403) {
    return { checked: true, healthy: false, findings: ["admin_auth_failed"] };
  }
  if (!res.ok) {
    return {
      checked: true,
      healthy: false,
      findings: [`admin_status_http_${res.status}`],
    };
  }
  const body = parseJsonSafe(res.text);
  if (!body) {
    return { checked: true, healthy: false, findings: ["admin_status_invalid_json"] };
  }

  const findings = [];
  const host = body.host || {};
  const metrics = body.metrics || {};
  const health = body.health || {};
  const capacity = health.capacity || {};

  if (typeof host.memoryUsedPercent === "number" && host.memoryUsedPercent > thresholds.memoryPct) {
    findings.push(`memory_above_${thresholds.memoryPct}:${host.memoryUsedPercent}`);
  }
  if (typeof host.diskUsedPercent === "number" && host.diskUsedPercent > thresholds.diskPct) {
    findings.push(`disk_above_${thresholds.diskPct}:${host.diskUsedPercent}`);
  }
  // cpuLoad1m is load average, not percent. Treat > cores-ish: alert if load1m >= 0.85 * assumed 1-core baseline * scale.
  // Beta assumption: alert when 1-minute load average >= CPU_LOAD_THRESHOLD (default 0.85).
  if (typeof host.cpuLoad1m === "number" && host.cpuLoad1m >= thresholds.cpuLoad) {
    findings.push(`cpu_load_above_${thresholds.cpuLoad}:${host.cpuLoad1m}`);
  }
  if (
    typeof capacity.activeSessions === "number" &&
    typeof thresholds.peerLimit === "number" &&
    capacity.activeSessions >= thresholds.peerLimit
  ) {
    findings.push(`peer_count_at_limit:${capacity.activeSessions}/${thresholds.peerLimit}`);
  }
  if ((metrics.peerExpireFail || 0) > 0) findings.push(`peer_expire_fail:${metrics.peerExpireFail}`);
  if ((metrics.peerCreateFail || 0) >= thresholds.peerCreateFail) {
    findings.push(`peer_create_fail_spike:${metrics.peerCreateFail}`);
  }
  if ((metrics.peerRemoveFail || 0) >= thresholds.peerRemoveFail) {
    findings.push(`peer_remove_fail_spike:${metrics.peerRemoveFail}`);
  }
  if ((metrics.authFailures || 0) >= thresholds.authFailSpike) {
    findings.push(`auth_failure_spike:${metrics.authFailures}`);
  }
  if ((metrics.capacityRejected || 0) >= thresholds.capacityRejectSpike) {
    findings.push(`capacity_reject_spike:${metrics.capacityRejected}`);
  }

  // Entitlement failures are not a dedicated counter on older builds; treat repeated create fails + auth as proxy.
  return {
    checked: true,
    healthy: findings.length === 0,
    findings,
    summary: {
      memoryUsedPercent: host.memoryUsedPercent ?? null,
      diskUsedPercent: host.diskUsedPercent ?? null,
      cpuLoad1m: host.cpuLoad1m ?? null,
      activeSessions: capacity.activeSessions ?? null,
      peerCreateFail: metrics.peerCreateFail ?? 0,
      peerRemoveFail: metrics.peerRemoveFail ?? 0,
      peerExpireFail: metrics.peerExpireFail ?? 0,
      authFailures: metrics.authFailures ?? 0,
      capacityRejected: metrics.capacityRejected ?? 0,
      processStartedAt: metrics.startedAt ?? null,
    },
  };
}

async function main() {
  const apiBase = (process.env.API_BASE || DEFAULT_API_BASE).replace(/\/$/, "");
  const nodeId = process.env.EXPECTED_NODE_ID || DEFAULT_NODE_ID;
  const forceFail = process.env.FORCE_FAIL === "1" || process.env.FORCE_FAIL === "true";
  const probeUrlOverride = process.env.PROBE_URL || "";
  const outPath = process.env.MONITOR_RESULT_PATH || "";

  const thresholds = {
    latencyMs: DEFAULT_LATENCY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    memoryPct: Number(process.env.MEMORY_THRESHOLD_PCT || 85),
    diskPct: Number(process.env.DISK_THRESHOLD_PCT || 80),
    cpuLoad: Number(process.env.CPU_LOAD_THRESHOLD || 0.85),
    peerLimit: Number(process.env.PEER_COUNT_LIMIT || 4),
    peerCreateFail: Number(process.env.PEER_CREATE_FAIL_THRESHOLD || 3),
    peerRemoveFail: Number(process.env.PEER_REMOVE_FAIL_THRESHOLD || 3),
    authFailSpike: Number(process.env.AUTH_FAIL_SPIKE_THRESHOLD || 20),
    capacityRejectSpike: Number(process.env.CAPACITY_REJECT_SPIKE || 5),
  };

  const result = {
    ok: false,
    monitor: "dallas-beta-external",
    targetNode: nodeId,
    apiBase: redactUrl(apiBase),
    checkedAt: new Date().toISOString(),
    probePath: null,
    httpStatus: null,
    latencyMs: null,
    findings: [],
    admin: null,
    assumptions: [
      "Prefer GET /healthz; fall back to GET /health while Prompt 10 undeployed.",
      "API latency threshold default 2000ms from GitHub Actions runners (not game RTT).",
      "CPU uses 1m load average >= 0.85 (not Windows %); refine after Dallas deploy.",
      "Peer limit default 4 (trusted beta capacity).",
      "WireGuard service state requires VPS/admin access — not proven by public HTTP alone.",
    ],
  };

  if (forceFail) {
    result.findings.push("force_fail");
    result.ok = false;
    printAndExit(result, outPath, 1);
    return;
  }

  let probeUrl = probeUrlOverride;
  let probePath = probeUrlOverride ? "override" : null;
  let probeRes;

  if (!probeUrl) {
    const healthzUrl = `${apiBase}/healthz`;
    probeRes = await fetchWithTimeout(healthzUrl, thresholds.timeoutMs);
    if (probeRes.status === 404) {
      probeUrl = `${apiBase}/health`;
      probePath = "/health";
      probeRes = await fetchWithTimeout(probeUrl, thresholds.timeoutMs);
    } else {
      probeUrl = healthzUrl;
      probePath = "/healthz";
    }
  } else {
    probeRes = await fetchWithTimeout(probeUrl, thresholds.timeoutMs);
  }

  result.probePath = probePath || redactUrl(probeUrl);
  result.httpStatus = probeRes.status;
  result.latencyMs = probeRes.latencyMs;

  if (!probeRes.ok) {
    result.findings.push(`http_${probeRes.status}`);
  }
  if (probeRes.latencyMs > thresholds.latencyMs) {
    result.findings.push(`latency_above_${thresholds.latencyMs}ms:${probeRes.latencyMs}`);
  }

  const body = parseJsonSafe(probeRes.text);
  if (probePath === "/health" || (body && (body.nodes || body.status))) {
    const evalResult = evaluateHealthPayload(body, nodeId);
    result.findings.push(...evalResult.findings);
    result.nodePresent = evalResult.nodeOk;
  } else if (probePath === "/healthz") {
    if (body && body.ok === false) result.findings.push("healthz_ok_false");
    if (probeRes.status === 503) result.findings.push("healthz_maintenance");
  } else if (!body && probeRes.ok) {
    // Non-JSON success (rare) — treat HTTP ok as pass for override tests only.
  }

  const adminToken = process.env.ADMIN_TOKEN || process.env.ZER0_ADMIN_SECRET || "";
  result.admin = await probeAdminStatus(apiBase, adminToken, thresholds);
  if (result.admin.checked && result.admin.healthy === false) {
    result.findings.push(...(result.admin.findings || []));
  } else if (result.admin.skipped) {
    result.findings.push("admin_metrics_skipped_no_token");
  }

  // Public probe success does not require admin token; admin skip is informational only.
  const blocking = result.findings.filter((f) => f !== "admin_metrics_skipped_no_token");
  result.ok = blocking.length === 0 && probeRes.ok;
  result.findings = result.findings;
  result.sanitizedBodySnippet = sanitizeBody(probeRes.text);

  printAndExit(result, outPath, result.ok ? 0 : 1);
}

function printAndExit(result, outPath, code) {
  const line = JSON.stringify(result, null, 2);
  console.log(line);
  if (outPath) {
    writeFileSync(outPath, line, "utf8");
  }
  // Use process.exitCode instead of process.exit to avoid rare libuv crashes on Windows.
  process.exitCode = code;
}

main().catch((err) => {
  const message = err && err.name === "AbortError" ? "probe_timeout" : "probe_exception";
  const result = {
    ok: false,
    monitor: "dallas-beta-external",
    checkedAt: new Date().toISOString(),
    findings: [message],
    error: String(err && err.message ? err.message : err).slice(0, 200),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
});
