# RouteLag Routing Tunnel

This is the RouteLag private beta route tunnel.

Normal tester flow:

```text
Login -> Select Fortnite -> Select beta route -> Optimize
```

The tester does not import tunnel files manually. The desktop app creates a
local keypair, sends only the public key to the RouteLag API, receives route
details, writes a hidden local RouteLag Engine profile, and starts the route.

## South Africa to Middle East Beta Servers

- Johannesburg Beta
- Frankfurt Beta
- London Beta
- Amsterdam Beta, or Paris if that server was purchased instead

Each route is configured independently by the API. A route should only be marked
online when its endpoint, server public key, and captured Fortnite Middle East
IPv4 `/32` AllowedIPs are configured.

## Tunnel Defaults

- OS: Ubuntu 24
- Tunnel network: `10.66.66.0/24`
- Server tunnel IP: `10.66.66.1`
- Route port: UDP `51820`
- Default DNS: `1.1.1.1`
- Default MTU: `1280`
- Full tunnel routes such as `0.0.0.0/0` and `::/0` are blocked.

## Pieces

1. Desktop app generates a local client keypair.
2. Desktop exchanges a Clerk session JWT for a short-lived **routing entitlement
   token** via `POST /api/entitlements/routing-token` (invite codes alone are not
   sufficient for paid routing).
3. Desktop app calls `POST /api/routes/create` with the entitlement Bearer token
   and the client public key.
4. RouteLag API assigns a client IP from the node tunnel pool.
5. RouteLag API adds the peer to `wg0`.
6. Desktop app writes a hidden local RouteLag Engine profile.
7. Desktop app starts the local tunnel service.

The backend never receives the client private key.

## Paid routing entitlement

Routing is paid. The Overwolf HUD is free and must not require a routing
subscription.

### Auth vs entitlement

- **Authentication** identifies the caller (Clerk session verified via JWKS, or
  an explicit internal allowlist identity).
- **Entitlement** is a separate check: active paid routing, canceled-but-still
  within paid period, or explicit internal tester allowlist.
- Client-sent booleans (`entitled`, `hasUnlimitedRouting`, `plan`) are ignored.
- Invite JWT login unlocks the beta client shell only; it cannot create routes
  when `ROUTELAG_REQUIRE_ROUTING_ENTITLEMENT=true` (default).

### Token flow

1. `POST /api/entitlements/routing-token` with `{ clerkSessionToken, deviceId }`
2. Server verifies Clerk JWT, resolves entitlement (cache → provider), mints a
   short-lived HMAC entitlement token (default TTL 15 minutes)
3. `POST /api/routes/create` requires that entitlement token
4. Concurrent sessions per subject are capped
   (`ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER`, default `1`)

### Account policy

| Account state | Create route | Keep existing route | Reason |
|---|---|---|---|
| Free | No | Until peer TTL / user ends (no new creates) | No paid entitlement |
| Active paid | Yes | Yes (refresh entitlement token while active) | Paid |
| Canceled, period active | Yes | Yes until paid period ends | Still entitled |
| Expired | No | Until peer TTL / user ends | Period ended |
| Refunded | No | Until peer TTL / user ends; no new creates | Account restricted |
| Disputed | No | Until peer TTL / user ends; no new creates | Account restricted |
| Internal tester | Yes (allowlist only, non-production) | Yes | Explicit allowlist |
| Billing service unavailable | No (fail closed) | Keep existing until peer TTL | Documented outage behavior |

### Cache and outages

- Entitlement results are cached server-side with a bounded TTL
  (`ROUTELAG_ENTITLEMENT_CACHE_TTL_MS`, default 60s). Clients cannot extend it.
- If Clerk / billing lookup is unavailable, **create fails closed** (`503`
  `entitlement_unavailable`). Existing tunnels are not torn down solely because
  of a short entitlement-token TTL; abandoned peers still expire via
  `ROUTELAG_PEER_TTL_HOURS`.
- Internal allowlists are disabled when `ROUTELAG_DEPLOYMENT_ENV=production`.

### Long-running sessions

- Creating a route requires a fresh (or unexpired) entitlement token.
- The desktop refreshes the entitlement token before create; refresh re-checks
  billing via the server cache/provider.
- Peer TTL remains the abandoned-session safety net.

## Peer Creation

For the MVP, the API can run directly on the VPS and manage `wg0` locally:

```bash
wg set wg0 peer CLIENT_PUBLIC_KEY allowed-ips 10.66.66.12/32
```

The API stores the route session with the session ID, tester ID, optional
Clerk user / device IDs, public key, client tunnel IP, game/server IDs,
timestamps, and active state.

## Peer Revocation

When the tester clicks End Optimization, the desktop app stops the local route
and calls `POST /api/routes/end`. The API removes the peer:

```bash
wg set wg0 peer CLIENT_PUBLIC_KEY remove
```

If a session is already inactive, ending it should be harmless.

### Abandoned peer TTL and heartbeat

If the desktop app crashes, is force-killed, or Windows reboots before
`/api/routes/end`, the VPS peer can remain until server-side expiry.

| Control | Env | Default | Notes |
|---|---|---|---|
| Absolute max lifetime | `ROUTELAG_PEER_TTL_HOURS` | `8` | Ends session + removes peer regardless of heartbeats. `0` disables. |
| Disconnected grace | `ROUTELAG_PEER_HEARTBEAT_GRACE_MINUTES` | `20` | Ends session if no heartbeat. `0` disables. |
| Client heartbeat | `POST /api/routes/heartbeat` | every ~5 min | Refresh only; low traffic. |

- The API also expires stale sessions before each create and on a periodic timer.
- Local Windows Restore Internet does not require the API to succeed.
- Ending a route (`POST /api/routes/end`) is idempotent.

### Capacity (trusted private beta)

These are configuration values, not fabricated hardware claims. Assumptions:

- Each node uses a `/24` tunnel starting at `.10` → ~245 usable client IPs.
- Trusted-beta defaults stay far below the IP pool so ops headroom remains.

| Control | Env | Default |
|---|---|---|
| Max peers per node | `ROUTELAG_MAX_PEERS_PER_NODE` | `50` |
| Reserved headroom | `ROUTELAG_NODE_CAPACITY_HEADROOM` | `5` |
| Effective create limit | _(derived)_ | `max - headroom` (45 with defaults) |
| Per-user concurrency | `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER` | `1` |
| Per-device concurrency | `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_DEVICE` | `1` |

When a node is full, create returns `503` with `code: node_full`. When no node
can accept routes, create returns `503` with `code: no_node_available`.
Unhealthy / disabled / maintenance nodes are excluded from selection.

### Emergency controls (server-side)

Authenticated with `ROUTELAG_ADMIN_SECRET` via `Authorization: Bearer …` or
`x-admin-token`. No public unauthenticated kill endpoint. Changes persist in
`ROUTELAG_RUNTIME_CONTROLS_FILE` and do not require a desktop update.

| Action | How |
|---|---|
| View controls | `GET /api/admin/controls` |
| Update controls | `PUT /api/admin/controls` |
| Maintenance / disable all new routes | `{ "maintenanceMode": true }` or `{ "routingDisabled": true }` |
| Disable a node | `{ "disabledNodeIds": ["dallas-beta"] }` |
| Block compromised account | `{ "blockedClerkUserIds": […] }` / `blockedTesterIds` / `blockedInviteCodes` |
| Disable an app version | `{ "disabledAppVersions": ["0.1.0"] }` |
| Expire all peers on a node | `POST /api/admin/nodes/:nodeId/expire-peers` |
| Force-end one session | `POST /api/admin/sessions/:sessionId/end` |
| Ops dashboard | `GET /api/admin/status` (metrics + host resources) |

Boot-time seeds: `ROUTELAG_MAINTENANCE_MODE`, `ROUTELAG_ROUTING_DISABLED`,
`ROUTELAG_DISABLED_NODE_IDS`, `ROUTELAG_BLOCKED_*`, `ROUTELAG_DISABLED_APP_VERSIONS`.

Existing client tunnels are not torn down solely by maintenance mode (new
creates are rejected). Use node expire-peers or session end to revoke access.
Local internet restoration remains a desktop/client concern.

### Health and monitoring

Public probes (safe for external uptime monitors):

- `GET /health` — status, routingEnabled, coarse capacity, per-node
  acceptingRoutes / usedPercent. Does **not** expose endpoints, tunnel CIDRs,
  public IPs, secrets, or admin controls.
- `GET /healthz` — minimal `{ ok: true }` or HTTP 503 in maintenance.

Admin-only:

- `GET /api/admin/status` — counters (peer create/remove/expire failures,
  capacity rejections, auth failures), host CPU/memory/disk when available,
  node capacity, controls.

Beta monitoring plan (no paid vendor required):

1. External GitHub Actions workflow `.github/workflows/dallas-beta-monitor.yml`
   probes `/healthz` (fallback `/health`) from outside the VPS every ~5 minutes.
2. Alerts open GitHub Issues labeled `dallas-beta-monitor` for owner
   `WrenchDevelops` (optional Discord via secret `DISCORD_WEBHOOK_URL`).
3. On the VPS, use `scripts/03-status.sh` for WireGuard handshake / NAT checks.
4. Tail API logs for `peer_created`, `peer_expired`, `peer_create_failed`,
   `route_create_rejected`, `admin_*`, `admin_auth_failure`.
5. Optionally set GitHub secret `DALLAS_ADMIN_TOKEN` so the monitor can pull
   `/api/admin/status` (CPU/memory/disk/peer failure counters).

Thresholds + proof procedure: `docs/BETA_MONITORING.md`  
Incident runbook: `docs/BETA_INCIDENT_RUNBOOK.md`

## Check Status

On the VPS:

```bash
wg show wg0
```

Look for `latest handshake`, `transfer`, and the tester peer public key. The API
status endpoint parses this output for active sessions.

## Restart The Route Tunnel

```bash
systemctl restart wg-quick@wg0
wg show wg0
```

If traffic does not exit through the VPS, confirm forwarding and NAT:

```bash
sysctl net.ipv4.ip_forward
iptables -t nat -S POSTROUTING
```

## Private Beta Goal

The beta compares RouteLag OFF, Johannesburg, Frankfurt, London, and
Amsterdam/Paris for South African Fortnite players using the Middle East
matchmaking region. The winning route is the best combination of low ping, low
packet loss, fewer spikes, and stable gameplay for the tester's ISP.
