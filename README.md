# RouteLag MVP

A simple single-server gaming tunnel using WireGuard on Ubuntu 24.04.

Route your PC traffic through a VPS:

```
User PC → WireGuard tunnel → VPS → Internet / game servers
```

This is a **basic MVP** — not a full ExitLag-style service. A Windows desktop beta app is available in [`routelag-desktop/`](routelag-desktop/).

## What This Does

- Installs WireGuard on an Ubuntu 24.04 VPS
- Creates a full-tunnel VPN (`AllowedIPs = 0.0.0.0/0`) so all traffic exits through the VPS
- Generates client configs for Windows and Mac WireGuard apps
- Provides bash scripts for install, client creation, status, and uninstall

## What This Does NOT Do

- Smart multi-hop routing
- Automatic best-path selection
- Per-game routing rules
- DDoS protection or anti-cheat bypass
- A polished desktop app
- Guaranteed lower ping

## Why One VPS Is Not Full ExitLag

ExitLag and similar services use **many servers worldwide**, intelligent routing, and protocol optimization to find the lowest-latency path to game servers.

This MVP sends **all** your traffic through **one** VPS. If that VPS is far from you or far from the game servers, your ping will likely **get worse**, not better.

Your VPS (`102.211.56.103`) may be geographically distant from U.S. game servers. Use this MVP to learn how WireGuard tunneling works — not as a production lag-reduction tool.

## Requirements

- Ubuntu 24.04 VPS with root SSH access
- UDP port `51820` open (VPS firewall + provider panel)
- WireGuard client app on Windows or Mac
- Basic comfort with SSH and the terminal

## Quick Start

Copy this repo to your VPS, then run:

```bash
chmod +x scripts/*.sh
sudo ./scripts/00-check-server.sh
sudo ./scripts/01-install-server.sh
sudo ./scripts/02-create-client.sh aiden-pc
sudo ./scripts/03-status.sh
```

## Copy Client Config to Your PC

From your local computer:

```bash
scp root@102.211.56.103:/root/routelag-mvp/clients/aiden-pc.conf .
```

Adjust the path if you cloned the repo elsewhere on the VPS.

## Import into WireGuard

1. Open the WireGuard app on your PC
2. Click **Import tunnel(s) from file** (Windows) or **Import Tunnel(s) from File** (Mac)
3. Select `aiden-pc.conf`
4. Click **Activate** / toggle the tunnel on

See detailed guides:

- [Windows setup](docs/WINDOWS-CLIENT.md)
- [Mac setup](docs/MAC-CLIENT.md)

## Test the Tunnel

**Before connecting** — note your public IP:

```bash
curl -4 ifconfig.me
```

**Connect** the WireGuard tunnel, then run the same command. It should show `102.211.56.103` (your VPS IP).

**Ping test:**

```bash
ping 1.1.1.1
```

**Game ping test** — compare in-game latency with the tunnel on vs. off. If ping is worse with the tunnel on, that is expected for a distant VPS.

## Repository Structure

```
routelag-mvp/
├── README.md
├── scripts/
│   ├── 00-check-server.sh    # Pre-flight diagnostics
│   ├── 01-install-server.sh  # Install and configure WireGuard
│   ├── 02-create-client.sh   # Create a client config
│   ├── 03-status.sh          # Show server status
│   ├── 04-uninstall.sh       # Remove server config
│   └── lib.sh                # Shared helpers
├── clients/                  # Generated client configs (gitignored)
└── docs/
    ├── SETUP.md
    ├── WINDOWS-CLIENT.md
    ├── MAC-CLIENT.md
    └── TROUBLESHOOTING.md
```

## Documentation

- [Server setup guide](docs/SETUP.md) — step-by-step VPS setup including Maxko panel checks
- [Server client management](docs/SERVER-CLIENT-MANAGEMENT.md) — one config per tester, revoke peers, check handshakes
- [Windows client](docs/WINDOWS-CLIENT.md)
- [Mac client](docs/MAC-CLIENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Warning

This VPS may be far from U.S. game servers. Connecting through it can **increase** your ping instead of reducing it. Always test with the tunnel on and off before assuming it helps.

## Uninstall

```bash
sudo ./scripts/04-uninstall.sh
```

This removes WireGuard server configuration but does not uninstall packages or remove SSH firewall rules.
