# Zer0 Dallas beta — monitoring thresholds and wiring

**Date:** 2026-07-17 / 2026-07-18  
**Scope:** Trusted private beta — Dallas node only (`216.152.154.137:3001`)  
**Evidence classes:** Local code · Live beta probe · Real external verification (GitHub-hosted) · Mock/proof tests

## Architecture

| Layer | Role |
|-------|------|
| Public HTTP | `GET /healthz` preferred; `GET /health` fallback while Prompt 10 undeployed |
| External monitor | GitHub Actions workflow `.github/workflows/dallas-beta-monitor.yml` (not on Dallas) |
| Probe script | `scripts/beta-dallas-monitor.mjs` |
| Alert script | `scripts/beta-dallas-alert.mjs` |
| Primary destination | GitHub Issues labeled `dallas-beta-monitor` → owner **WrenchDevelops** |
| Optional destination | Discord ops webhook via repo secret `DISCORD_WEBHOOK_URL` (never in git) |
| Host / WG / counters | `GET /api/admin/status` when secret `DALLAS_ADMIN_TOKEN` is set |

## Beta thresholds (explicit)

| Signal | Threshold | Assumption |
|--------|-----------|------------|
| `/healthz` or `/health` unavailable | **2 consecutive** external checks | Schedule ≈ every 5 minutes; GitHub cron may drift |
| API latency | **> 2000 ms** | Measured from GitHub runner to Dallas API — not Fortnite RTT |
| CPU | **1m load average ≥ 0.85** | Host exposes loadavg via admin status; not Windows % |
| Memory | **> 85% used** | From admin `host.memoryUsedPercent` |
| Disk | **> 80% used** | From admin `host.diskUsedPercent` |
| Peer count | **≥ 4** (beta capacity) | Matches trusted-beta concurrent cap |
| Peer cleanup / expire failure | **any `peerExpireFail` > 0** in process window | In-process counter; resets on restart |
| Route/peer create failures | **≥ 3** `peerCreateFail` | Repeated create failures |
| Peer remove failures | **≥ 3** `peerRemoveFail` | Cleanup path unhealthy |
| WireGuard service stopped | **systemd `wg-quick@wg0` inactive** | Requires VPS shell / future agent — not public HTTP |
| Process restart loop | **`metrics.startedAt` flips repeatedly within 15 min** | Detected by admin poller comparing snapshots (manual/runbook until automated) |
| Capacity rejection spike | **≥ 5** `capacityRejected` | Node full / policy |
| Auth failure spike | **≥ 20** `authFailures` | Invite/entitlement abuse or outage |
| Entitlement-service failure | Create path rejects with entitlement errors / admin notes | Full signal after Prompt 10 entitlement deploy |
| Node disabled / global maintenance | `/healthz` **503** or health `status=maintenance` | Expected during emergency; alert if **unexpected** |

## What public HTTP can and cannot prove

| Monitor | Public HTTP | Admin token | VPS shell |
|---------|-------------|-------------|-----------|
| API health | Yes | — | — |
| API latency | Yes | — | — |
| Dallas node listed | Yes (`/health` nodes) | Better | — |
| WireGuard service state | Indirect only | Indirect | **Yes** |
| Peer count | Coarse capacity | **Yes** | `wg show` |
| Peer create/remove/cleanup failures | No | **Yes** | logs |
| CPU / memory / disk | No | **Yes** | Yes |
| Bandwidth saturation | No | No (not exported yet) | `iftop` / vnstat |
| Process restart count | No | startedAt heuristic | journalctl |
| Entitlement failures | No | metrics / logs | logs |

## Secrets (never commit)

| Secret / var | Where | Purpose |
|--------------|-------|---------|
| `DALLAS_ADMIN_TOKEN` | GitHub Actions secret | Optional admin status metrics |
| `DISCORD_WEBHOOK_URL` | GitHub Actions secret | Optional Discord delivery |
| `DALLAS_API_BASE` | GitHub Actions variable (optional) | Override API base |

Local proof can use env vars; do not write webhook URLs into the repo or audit bodies.

## Controlled proof procedure (does not kill live routing)

1. Point probe at a known failing URL (`PROBE_URL=https://httpstat.us/503`) **or** `FORCE_FAIL=1`.
2. Run two consecutive failing evaluations (or proof alert mode once for destination test).
3. Confirm GitHub Issue alert created for owner `WrenchDevelops`.
4. Optional: confirm Discord message if webhook secret configured.
5. Restore probe to Dallas `API_BASE`.
6. Confirm recovery comment + issue closed.
7. Confirm alert text has **no** secrets or user data.
8. Confirm healthy probe names **dallas-beta**.

Do **not** stop WireGuard or kill `routelag-api` for proof while external users may be connected.

## Final monitor table

| Monitor | Active | Threshold | Alert destination | Test alert received |
|---------|--------|-----------|-------------------|---------------------|
| API health | Yes (script + GHA; `/health` fallback until `/healthz` live) | 2 consecutive failures | GitHub Issues → **WrenchDevelops** (+ optional Discord) | **Yes** — proof outage [#1](https://github.com/WrenchDevelops/Routelag/issues/1) |
| API latency | Yes | > 2000 ms | Same | Threshold enforced in probe (healthy sample ~100–135 ms) |
| WireGuard state | Partial (runbook / VPS) | service stopped | Same when detected | Not via public HTTP this session |
| CPU | When `DALLAS_ADMIN_TOKEN` set | load1m ≥ 0.85 | Same | Skipped — token not configured |
| Memory | When admin token set | > 85% | Same | Skipped — token not configured |
| Disk | When admin token set | > 80% | Same | Skipped — token not configured |
| Peer count | When admin token set | ≥ 4 | Same | Skipped — token not configured |
| Peer cleanup failure | When admin token set | expire fail > 0 | Same | Skipped — token not configured |
| Entitlement failure | Partial until live entitlement + admin | create/entitlement errors | Same | Pending Prompt 10 deploy |

**Recovery proof:** issue [#1](https://github.com/WrenchDevelops/Routelag/issues/1) closed with recovery comments; separate recovery record [#2](https://github.com/WrenchDevelops/Routelag/issues/2).

## Related docs

- Incident runbook: `docs/BETA_INCIDENT_RUNBOOK.md`
- Tunnel ops: `docs/ROUTING-TUNNEL.md`
- Launch audit Prompt 12 subsection in `docs/ZER0_FULL_PRODUCT_LAUNCH_AUDIT_2026-07-17.md`
