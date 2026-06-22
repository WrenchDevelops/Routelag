# RouteLag Beta — Windows Acceptance Test Checklist

Run this checklist on a **Windows 10/11** machine with WireGuard for Windows installed and a valid tester `.conf` file.

## Prerequisites

- [ ] WireGuard for Windows installed
- [ ] RouteLag Beta built or installed (`npm run tauri build` or NSIS installer)
- [ ] Tester `.conf` file available (from `02-create-client.sh`)

## Import and Storage

- [ ] App opens without UAC prompt (normal mode)
- [ ] Settings → Import config file selects `.conf` successfully
- [ ] Redacted preview shows `[REDACTED]` for PrivateKey
- [ ] Config stored at `%APPDATA%\com.routelag.beta\routelag-beta.conf`
- [ ] Logs do not contain private key after import

## Connect / Disconnect

- [ ] Connect click in normal mode shows admin modal with Fortnite disclaimer
- [ ] Restart as Administrator triggers UAC and relaunches app
- [ ] After elevation, Connect installs `WireGuardTunnel$routelag-beta` service
- [ ] Status shows **Connected**
- [ ] Public IP (after tunnel) shows VPS IP
- [ ] Disconnect uninstalls tunnel service
- [ ] Status shows **Disconnected**
- [ ] Public IP returns to home IP

## Network Tests

- [ ] Ping test returns average ms on Connect screen
- [ ] Route Test → Normal (disconnected) saves result locally
- [ ] Route Test → RouteLag (connected) saves result locally
- [ ] Warning appears if tunnel ping is worse than baseline

## Logs

- [ ] Logs screen shows connection events
- [ ] WireGuard service status snippet appended
- [ ] Copy logs works
- [ ] Open logs folder opens `%APPDATA%\com.routelag.beta\`

## Settings

- [ ] Remove config works (tunnel disconnected first if needed)
- [ ] Reset app clears config, logs, and route test file
- [ ] Emergency Cleanup stops tunnel, flushes DNS, keeps WireGuard and app installed ([EMERGENCY-CLEANUP.md](EMERGENCY-CLEANUP.md))
- [ ] Tester profile saves on Diagnostics and appears in exported report
- [ ] App version shown in Settings and Logs

## Negative Cases

- [ ] Connect without config shows clear error
- [ ] Connect without WireGuard installed shows install message
- [ ] UAC denial returns to normal mode with clean error
- [ ] Route test with wrong tunnel state shows toast error

## Notes

Record tester name, date, Windows version, and any failures for the beta team.
