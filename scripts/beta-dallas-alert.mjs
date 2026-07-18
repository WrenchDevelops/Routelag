#!/usr/bin/env node
/**
 * Alert delivery helper for Dallas beta monitoring.
 *
 * Destinations (no secrets in git):
 *   1) GitHub Issues on WrenchDevelops/Routelag (default; uses gh / GITHUB_TOKEN)
 *   2) Optional Discord ops webhook via DISCORD_WEBHOOK_URL env (never commit)
 *
 * Usage:
 *   node scripts/beta-dallas-alert.mjs --mode outage --result ./monitor-result.json
 *   node scripts/beta-dallas-alert.mjs --mode recovery --result ./monitor-result.json
 *   node scripts/beta-dallas-alert.mjs --mode proof-outage
 *   node scripts/beta-dallas-alert.mjs --mode proof-recovery
 */

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REPO = process.env.MONITOR_GITHUB_REPO || "WrenchDevelops/Routelag";
const LABEL = "dallas-beta-monitor";
const TITLE_PREFIX = "[Dallas beta monitor]";
const OWNER = process.env.MONITOR_OWNER || "WrenchDevelops";

function parseArgs(argv) {
  const out = { mode: "outage", resultPath: "", titleSuffix: "" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--mode") out.mode = argv[++i];
    else if (a === "--result") out.resultPath = argv[++i];
    else if (a === "--title-suffix") out.titleSuffix = argv[++i];
  }
  return out;
}

function gh(args, input) {
  const res = spawnSync("gh", args, {
    encoding: "utf8",
    input,
    env: process.env,
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || "gh failed").trim();
    throw new Error(err.slice(0, 500));
  }
  return (res.stdout || "").trim();
}

function ensureLabel() {
  const list = gh(["label", "list", "-R", REPO, "--limit", "100"]);
  if (!list.split("\n").some((line) => line.startsWith(`${LABEL}\t`) || line.startsWith(`${LABEL} `))) {
    try {
      gh([
        "label",
        "create",
        LABEL,
        "-R",
        REPO,
        "--color",
        "B60205",
        "--description",
        "Dallas Zer0 beta external monitor alerts",
      ]);
    } catch {
      // Race or permissions — continue; issue create may still work without label.
    }
  }
}

function findOpenMonitorIssue() {
  const json = gh([
    "issue",
    "list",
    "-R",
    REPO,
    "--state",
    "open",
    "--json",
    "number,title,url,createdAt,labels",
    "--limit",
    "50",
  ]);
  const issues = JSON.parse(json || "[]");
  const prefixed = issues.filter((i) => String(i.title || "").startsWith(TITLE_PREFIX));
  const labeled = prefixed.filter((i) =>
    Array.isArray(i.labels) && i.labels.some((l) => l.name === LABEL),
  );
  return labeled[0] || prefixed[0] || null;
}

function buildBody({ mode, result, proof }) {
  const checkedAt = result?.checkedAt || new Date().toISOString();
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const lines = [
    `## ${proof ? "PROOF TEST" : "ALERT"} — ${mode}`,
    "",
    `- **Monitor:** Dallas Zer0 beta external probe`,
    `- **Owner / destination:** GitHub Issues → @${OWNER}`,
    `- **Checked at:** ${checkedAt}`,
    `- **API base:** ${result?.apiBase || "n/a"}`,
    `- **Probe path:** ${result?.probePath || "n/a"}`,
    `- **HTTP status:** ${result?.httpStatus ?? "n/a"}`,
    `- **Latency ms:** ${result?.latencyMs ?? "n/a"}`,
    `- **Target node:** ${result?.targetNode || "dallas-beta"}`,
    `- **Findings:** ${findings.length ? findings.map((f) => `\`${f}\``).join(", ") : "_none_"}`,
    "",
    "### Safety",
    "- This alert intentionally omits secrets, tokens, peer keys, and user data.",
    "- Do not paste production credentials into comments.",
    "",
    "### Runbook",
    "See `docs/BETA_INCIDENT_RUNBOOK.md`.",
  ];
  if (proof) {
    lines.push("", "> Controlled proof test — not necessarily a real Dallas outage.");
  }
  return lines.join("\n");
}

async function notifyDiscord(content) {
  const url = process.env.DISCORD_WEBHOOK_URL || process.env.ZER0_OPS_DISCORD_WEBHOOK || "";
  if (!url) {
    return { sent: false, reason: "DISCORD_WEBHOOK_URL unset" };
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(url)) {
    return { sent: false, reason: "discord_webhook_url_invalid_shape" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: content.slice(0, 1800),
      allowed_mentions: { parse: [] },
    }),
  });
  return { sent: res.ok || res.status === 204, status: res.status };
}

async function main() {
  const args = parseArgs(process.argv);
  const proof = args.mode.startsWith("proof-");
  const mode = proof ? args.mode.replace(/^proof-/, "") : args.mode;

  let result = {
    checkedAt: new Date().toISOString(),
    apiBase: process.env.API_BASE || "http://216.152.154.137:3001",
    probePath: process.env.PROBE_PATH || "proof",
    httpStatus: mode === "outage" ? 503 : 200,
    latencyMs: null,
    targetNode: "dallas-beta",
    findings: mode === "outage" ? ["proof_or_reported_outage"] : [],
  };

  if (args.resultPath) {
    if (!existsSync(args.resultPath)) {
      throw new Error(`result file missing: ${args.resultPath}`);
    }
    result = JSON.parse(readFileSync(args.resultPath, "utf8"));
  }

  ensureLabel();
  const title = `${TITLE_PREFIX} ${args.titleSuffix || (proof ? "PROOF" : "ALERT")} — API/routing unavailable`
    .replace(/\s+/g, " ")
    .trim();

  let issueUrl = null;
  let issueNumber = null;
  let action = null;

  if (mode === "outage") {
    const existing = findOpenMonitorIssue();
    const body = buildBody({ mode: "outage", result, proof });
    if (existing) {
      gh(["issue", "comment", String(existing.number), "-R", REPO, "--body", body]);
      issueUrl = existing.url;
      issueNumber = existing.number;
      action = "commented_existing";
    } else {
      const created = gh([
        "issue",
        "create",
        "-R",
        REPO,
        "--title",
        title,
        "--label",
        LABEL,
        "--body",
        body,
      ]);
      issueUrl = created;
      const open = findOpenMonitorIssue();
      issueNumber = open?.number ?? null;
      action = "created";
    }
  } else if (mode === "recovery") {
    const existing = findOpenMonitorIssue();
    const body = buildBody({ mode: "recovery", result, proof });
    if (existing) {
      gh(["issue", "comment", String(existing.number), "-R", REPO, "--body", body]);
      gh([
        "issue",
        "close",
        String(existing.number),
        "-R",
        REPO,
        "--reason",
        "completed",
        "--comment",
        "Recovery confirmed by external monitor.",
      ]);
      issueUrl = existing.url;
      issueNumber = existing.number;
      action = "closed_recovered";
    } else {
      const created = gh([
        "issue",
        "create",
        "-R",
        REPO,
        "--title",
        `${TITLE_PREFIX} ${proof ? "PROOF" : ""} recovery`.replace(/\s+/g, " ").trim(),
        "--label",
        LABEL,
        "--body",
        body,
      ]);
      const numMatch = created.match(/\/issues\/(\d+)/);
      issueNumber = numMatch ? Number(numMatch[1]) : null;
      if (issueNumber) {
        gh([
          "issue",
          "close",
          String(issueNumber),
          "-R",
          REPO,
          "--reason",
          "completed",
        ]);
      }
      issueUrl = created;
      action = "created_and_closed_recovery";
    }
  } else {
    throw new Error(`unknown mode: ${args.mode}`);
  }

  const discord = await notifyDiscord(
    `Zer0 Dallas beta monitor **${mode}**${proof ? " (proof)" : ""} — ${issueUrl || "no issue url"}`,
  );

  const summary = {
    ok: true,
    destination: "github_issues",
    repo: REPO,
    owner: OWNER,
    label: LABEL,
    mode,
    proof,
    action,
    issueNumber,
    issueUrl,
    discord,
    secretsIncluded: false,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err).slice(0, 400) }));
  process.exit(1);
});
