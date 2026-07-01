# RouteLag Beta

Private Windows desktop beta for targeted Fortnite route testing.

Current beta tester flow:

```text
Login -> Select Fortnite -> Test Johannesburg / Frankfurt / London / Amsterdam
```

The desktop app creates the RouteLag route session automatically. Testers should
not need to import tunnel files manually.

## Architecture

```text
User PC -> RouteLag Engine -> selected RouteLag VPS -> targeted game IPs
```

Current South Africa to Middle East beta routes:

- Johannesburg Beta
- Frankfurt Beta
- London Beta
- Amsterdam Beta, or Paris if that server was purchased instead

Shared beta scope:

- Game: Fortnite
- Fortnite matchmaking region: Middle East
- Tunnel network: `10.66.66.0/24`
- Tunnel port: UDP `51820`
- Route mode: targeted IPv4 `/32` AllowedIPs only

## What This Does

- Installs RouteLag tunnel servers on Ubuntu 24.04 VPS nodes
- Creates targeted host routes for configured Fortnite destination IPs
- Provides a RouteLag API for invite-code login and automatic route sessions
- Lets the desktop app create hidden local RouteLag Engine profiles
- Provides bash scripts for install, status, uninstall, and operator testing

## What This Does Not Do

- Smart multi-hop routing
- Automatic best-path selection across many regions
- Per-game packet filtering
- DDoS protection or anti-cheat bypass
- Guaranteed lower ping
- Full-device VPN routing

## Private Beta Goal

This beta does not try to prove that RouteLag always lowers ping. It compares
RouteLag OFF, Johannesburg, Frankfurt, London, and Amsterdam/Paris to find which
route gives South African Fortnite players the best Middle East server
stability for their ISP.

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
server public key, endpoint, and captured Fortnite Middle East `/32` AllowedIPs
are configured.

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
