# RouteLag MVP

A one-server RouteLag routing tunnel MVP using an Ubuntu 24.04 VPS and a
Windows desktop beta app.

Normal tester flow:

```text
Login -> Select Fortnite -> Select Johannesburg Beta -> Optimize
```

The desktop app creates the RouteLag route session automatically. Testers should
not need to import tunnel files manually.

## Architecture

```text
User PC -> RouteLag Engine -> VPS -> Internet / game servers
```

Current dev server:

- VPS: `102.211.56.103`
- Server name: Johannesburg Beta
- Game: Fortnite
- Tunnel network: `10.66.66.0/24`
- Tunnel port: UDP `51820`

## What This Does

- Installs the tunnel server on an Ubuntu 24.04 VPS
- Creates a full-tunnel route (`AllowedIPs = 0.0.0.0/0`) so traffic exits through the VPS
- Provides a RouteLag API for invite-code login and automatic route sessions
- Lets the desktop app create hidden local RouteLag Engine profiles
- Provides bash scripts for install, status, uninstall, and legacy manual client creation

## What This Does Not Do

- Smart multi-hop routing
- Automatic best-path selection across many regions
- Per-game packet filtering
- DDoS protection or anti-cheat bypass
- Guaranteed lower ping

## Why One VPS Is Not Full ExitLag

ExitLag and similar services use many servers worldwide, intelligent routing,
and protocol optimization to find the lowest-latency path to game servers.

This MVP sends traffic through one VPS. If that VPS is far from the tester or
far from the game servers, ping can get worse. Use Johannesburg Beta to prove
the automatic RouteLag session flow before adding better regional servers.

## Server Setup

Copy this repo to your VPS, then run:

```bash
chmod +x scripts/*.sh
sudo ./scripts/00-check-server.sh
sudo ./scripts/01-install-server.sh
sudo ./scripts/03-status.sh
```

## RouteLag API

The API lives in [`server/`](server/). For local development it can run in mock
peer mode without touching `wg0`.

```bash
cd server
npm install
npm run dev
```

Deploy it on the VPS with `ROUTELAG_PEER_MODE=wg` after `wg0` is active and the
server public key is configured.

## Desktop App

The beta desktop app lives in [`routelag-desktop/`](routelag-desktop/).

```bash
cd routelag-desktop
npm install
npm run build
```

Configure `VITE_ROUTELAG_API_URL` for the API host when building a release.

## Legacy Manual Client Configs

Manual configs are still useful for operator testing:

```bash
sudo ./scripts/02-create-client.sh aiden-pc
```

This manual path should not be the normal tester experience.

## Documentation

- [Automatic routing tunnel](docs/ROUTING-TUNNEL.md)
- [Server setup guide](docs/SETUP.md)
- [Server client management](docs/SERVER-CLIENT-MANAGEMENT.md)
- [Windows manual client](docs/WINDOWS-CLIENT.md)
- [Mac manual client](docs/MAC-CLIENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Uninstall

```bash
sudo ./scripts/04-uninstall.sh
```

This removes tunnel server configuration but does not uninstall packages or
remove SSH firewall rules.
