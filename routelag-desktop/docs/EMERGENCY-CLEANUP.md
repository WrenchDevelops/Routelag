# Emergency Cleanup / Restore Internet

Zer0 (formerly RouteLag) must fail safe: a user must not be left with a running
owned tunnel after the app exits, crashes, or reboots. Restore Internet is the
emergency local recovery path and does **not** require a successful login.

Use **Restore Internet** in Zer0 first. It stops/removes owned Zer0 and legacy
RouteLag WireGuard tunnel services, flushes DNS, clears the routing-active
marker, and clears stale local route session state.

## Normal disconnect behavior

1. End Optimization / disconnect runs local Restore Internet (stop + uninstall
   owned services, flush DNS, clear local markers).
2. Then the desktop app calls `POST /api/routes/end` when a session id is known.
3. The UI is only treated as clean after critical local cleanup is attempted.
4. If the API is unreachable, local internet restoration still completes; the
   UI reports that the server peer may remain until TTL expiry.

## What happens on close

1. Window close is intercepted while routing may be active.
2. If confirmation is enabled and the tunnel is connected, Zer0 asks before
   ending routing.
3. The app attempts `stopOptimization` (local cleanup + server end).
4. Rust `exit_app` / close / exit handlers also run `safe_shutdown_routing`
   (idempotent local cleanup) as a safety net.

The title-bar close button routes through the window close path so the same
cleanup runs.

## What happens after a crash

A process cannot reliably run cleanup after every hard crash, force-kill, or
power loss. Panic hooks do **not** solve force-kill.

Defenses:

- `routing-active.marker` written before tunnel install
- Startup stale-tunnel detection for owned Zer0/RouteLag services
- Elevated startup auto-recovery via Restore Internet when leftovers are found
- Server peer TTL (`ROUTELAG_PEER_TTL_HOURS`, default `8`; `0` disables)

## What happens after reboot

WireGuard tunnel services may auto-start with Windows. On next Zer0 launch:

1. Startup recovery inspects owned services + markers.
2. If elevated, Zer0 attempts Restore Internet automatically.
3. If not elevated, the UI shows the stale-state banner and Restore Internet
   remains available without auth for local cleanup.

## How Restore Internet works

Order of operations (local session markers are cleared **last**):

1. Stop owned tunnel services (`WireGuardTunnel$…`)
2. Uninstall owned tunnel profiles (engine + `sc delete` fallback)
3. Flush DNS cache
4. Clear DNS backup diagnostic snapshot (missing backup = already safe)
5. Verify no owned services remain installed/running
6. Clear local route profile, session file, and routing-active marker

Owned profiles only (never unrelated VPNs):

- `routelag-engine`, `routelag-beta`, `RouteLag`, `routelag`
- `zer0-engine`, `Zer0`, `zer0`

Results include `summary`, `restored`, and `not_restored` so the UI can say
exactly what succeeded.

## Manual recovery steps

Run PowerShell or Command Prompt as Administrator:

```powershell
sc stop WireGuardTunnel$routelag-engine
sc delete WireGuardTunnel$routelag-engine
sc stop WireGuardTunnel$routelag-beta
sc delete WireGuardTunnel$routelag-beta
sc stop WireGuardTunnel$RouteLag
sc delete WireGuardTunnel$RouteLag
sc stop WireGuardTunnel$routelag
sc delete WireGuardTunnel$routelag
sc stop WireGuardTunnel$zer0-engine
sc delete WireGuardTunnel$zer0-engine
sc stop WireGuardTunnel$Zer0
sc delete WireGuardTunnel$Zer0
sc stop WireGuardTunnel$zer0
sc delete WireGuardTunnel$zer0
ipconfig /flushdns
```

Then delete local markers if needed:

```text
%LOCALAPPDATA%\RouteLag\routing-active.marker
%LOCALAPPDATA%\RouteLag\route-session.json
%LOCALAPPDATA%\RouteLag\routelag-engine.conf
%LOCALAPPDATA%\RouteLag\dns-backup.json
```

Missing or stopped services are safe and expected after a clean shutdown.

## Server peer expiration dependency

Abandoned VPS peers are removed when:

- The client successfully calls `/api/routes/end`, or
- Server TTL expires (`ROUTELAG_PEER_TTL_HOURS`, default 8 hours)

Until TTL fires after a client crash, the peer may remain active on the VPS.

## Exact remaining scenarios requiring real Windows testing

These were **not** verified on a packaged Windows build in this change set:

1. Close while connected restores routes/DNS/services/adapters
2. Force-kill then relaunch recovers internet
3. Reboot with auto-started owned tunnel then Zer0 startup recovery
4. Restore Internet with corrupted local session files on a live adapter
5. Confirm unrelated WireGuard/VPN services are untouched on a multi-VPN PC
