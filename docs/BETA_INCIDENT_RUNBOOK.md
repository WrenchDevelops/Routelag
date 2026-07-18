# Zer0 Dallas beta — incident runbook

**Audience:** Beta owner / on-call (`WrenchDevelops`)  
**Node:** Dallas `216.152.154.137` (API `:3001`, WireGuard `:51820`)  
**Alert channel:** GitHub Issues `dallas-beta-monitor` (+ optional Discord webhook)

Keep responses minimal. Prefer maintenance mode over killing active peer tunnels when testers may be connected.

---

## 0. Triage (first 2 minutes)

1. Open the alert issue — note findings (`http_*`, `latency_*`, `node_offline`, etc.).
2. From a machine **outside** Dallas:  
   `node scripts/beta-dallas-monitor.mjs`
3. Classify: **API down** vs **degraded** vs **false positive** (GitHub runner blip).
4. If real: post a short status comment on the issue; notify active testers if routing is impacted.

---

## API down

**Symptoms:** `/health` or `/healthz` non-200; monitor findings `http_*` / timeout.

1. SSH to Dallas (when credentials available): `systemctl status routelag-api`
2. Logs: `journalctl -u routelag-api -n 100 --no-pager`
3. Restart once: `systemctl restart routelag-api`
4. Re-probe externally; close alert on recovery.
5. If restart loops → **Emergency maintenance mode** (below) and roll back deployment.

---

## WireGuard down

**Symptoms:** API up but tunnels fail; `wg show wg0` empty/error; `wg-quick@wg0` inactive.

1. `systemctl status wg-quick@wg0`
2. `wg show wg0`
3. `systemctl restart wg-quick@wg0` then `wg show wg0`
4. Confirm forwarding/NAT: `sysctl net.ipv4.ip_forward`; `iptables -t nat -S POSTROUTING`
5. Do not delete `wg0` config casually — restore from backup if unit fails.

---

## Node full

**Symptoms:** capacity rejections; peer count ≥ beta limit (4); clients cannot create routes.

1. `GET /api/admin/status` (admin token) — check `capacity` / active sessions.
2. Expire stale peers: `POST /api/admin/nodes/dallas-beta/expire-peers`
3. Confirm desktop heartbeats / TTL are working (Prompt 11).
4. If still full: ask idle testers to disconnect; temporarily lower marketing concurrency.

---

## High CPU

**Symptoms:** admin `cpuLoad1m` ≥ 0.85 sustained; host sluggish.

1. `top` / `uptime` on VPS.
2. Identify runaway `node` / scan / backup jobs.
3. If API storm: enable maintenance mode; rate-limit already present (120 req/min).
4. After cool-down, exit maintenance and re-probe.

---

## High memory

**Symptoms:** memory used > 85%.

1. Inspect `routelag-api` RSS; check for peer/session leak.
2. Restart API **only after** maintenance mode if testers active.
3. Run expire-peers / orphan cleanup; verify peer file sizes under `/opt/routelag-server/data`.

---

## Disk pressure

**Symptoms:** disk used > 80%.

1. `df -h`; clear old logs (`journalctl --vacuum-time=2d`), old backups, replay uploads if any on this host.
2. Do not delete active `data/peers` / session stores without backup.
3. If disk critical: maintenance mode → free space → restart API.

---

## Peer leak

**Symptoms:** `wg show` peer count >> active sessions; many stale handshakes.

1. Compare admin sessions vs `wg show wg0`.
2. `POST /api/admin/nodes/dallas-beta/expire-peers`
3. Investigate desktop disconnect / heartbeat failures.
4. Document leftover peers before/after for audit.

---

## Failed peer cleanup

**Symptoms:** `peerExpireFail` / `peerRemoveFail` counters rising; logs `peer_remove` errors.

1. Check WG permissions and `wg` binary.
2. Inspect API logs for remove errors.
3. Manual: remove orphan peer with `wg set wg0 peer <key> remove` only if confirmed orphan.
4. Fix root cause before returning to beta traffic.

---

## Clerk outage

**Symptoms:** entitlement exchange failures; login/session verification errors (after entitlement deploy).

1. Confirm [Clerk status](https://status.clerk.com/).
2. Do **not** disable auth to “keep beta running.”
3. If internal testers blocked: use documented internal entitlement allowlist only if already configured for beta.
4. Notify testers of auth dependency.

---

## Entitlement outage

**Symptoms:** Pro/internal users cannot create routes; free users correctly denied.

1. Check Dallas env: entitlement required flag, Clerk issuer/JWKS.
2. Admin status / logs for entitlement errors.
3. Maintenance message to testers; avoid shipping an auth bypass.

---

## Emergency maintenance mode

1. `POST /api/admin/controls` with admin token: `{ "maintenanceMode": true }`  
   (or boot env `ROUTELAG_MAINTENANCE_MODE=true` + restart)
2. Confirm `/healthz` → **503** (after Prompt 10) or health `status=maintenance`.
3. Existing tunnels may continue until expired/ended — communicate to testers.
4. Exit: set `maintenanceMode: false`; confirm external monitor recovery alert.

---

## Disable Dallas

1. Prefer maintenance mode first.
2. Or admin controls: disable node id `dallas-beta` / add to disabled node ids.
3. Confirm clients cannot select Dallas for new routes.
4. Re-enable only after probes green.

---

## Remove all active beta peers

1. Notify testers (disconnect / Restore Internet on Windows).
2. `POST /api/admin/nodes/dallas-beta/expire-peers`
3. Verify `wg show wg0` peer list.
4. Confirm desktop Restore Internet path for anyone still broken locally.

---

## Notify testers

- Post on the GitHub alert issue + Discord ops (if configured).
- Include: impact window, whether to use Restore Internet, when to retry.
- Never include admin tokens, invite codes, or peer private keys.

---

## Roll back server deployment

1. Maintenance mode on.
2. Restore pre-deploy backup tarball of `/opt/routelag-server` (app, `.env`, `data/*`, systemd unit).
3. `systemctl restart routelag-api` (+ `wg-quick@wg0` if touched).
4. External probe green; recovery alert; exit maintenance.
5. Record rollback in the launch audit doc.

---

## Related

- Thresholds / wiring: `docs/BETA_MONITORING.md`
- Tunnel ops: `docs/ROUTING-TUNNEL.md`
