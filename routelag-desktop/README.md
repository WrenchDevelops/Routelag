# RouteLag Beta

A lightweight Windows desktop app for beta testers to connect to a WireGuard-based gaming tunnel.

RouteLag Beta is a **routing/tunnel testing app**. It is not full ExitLag yet. It currently supports **one beta server** and **one tunnel config per tester**.

```
Your PC → WireGuard tunnel → RouteLag VPS → Internet / game servers
```

## What RouteLag Beta Does

- Imports a WireGuard `.conf` file from your tester
- Stores the config locally in your app data folder
- Connects and disconnects a system-level WireGuard tunnel (`routelag-beta`)
- Shows public IP before and after the tunnel
- Runs basic ping and route comparison tests
- Shows redacted connection logs for troubleshooting

## What RouteLag Beta Does NOT Do

- Modify Fortnite or any game process
- Inject into games or read game memory
- Automate input or alter gameplay packets
- Bypass bans or interact with anti-cheat
- Guarantee lower ping
- Smart multi-hop routing or per-game rules

RouteLag Beta only manages a **normal system-level WireGuard tunnel**, the same kind the official WireGuard for Windows app uses.

## Requirements

1. **Windows 10/11**
2. **[WireGuard for Windows](https://www.wireguard.com/install/)** installed
3. A tester WireGuard `.conf` file (provided by the RouteLag team)
4. **Administrator permission** — required only for **Connect** and **Disconnect**, not to open the app

## Quick Start

### 1. Install WireGuard for Windows

Download and install from [wireguard.com/install](https://www.wireguard.com/install/).

### 2. Get your tester config

Your config is generated on the RouteLag server. From your PC:

```powershell
scp root@YOUR_VPS_IP:/root/routelag-mvp/clients/your-name.conf .
```

See the parent repo [server README](../README.md) for full server setup.

### 3. Import your config

1. Open **RouteLag Beta**
2. Go to **Settings**
3. Click **Import config file**
4. Select your `.conf` file

The config is stored in:

```
%APPDATA%\com.routelag.beta\routelag-beta.conf
```

Private keys are never shown in logs.

### 4. Connect

1. Go to **Connect**
2. Click **Connect**
3. If prompted, click **Restart as Administrator** and approve the Windows UAC prompt
4. Click **Connect** again after the app relaunches elevated

When connected, your public IP should change to the VPS IP.

### 5. Disconnect

1. Click **Disconnect** (admin mode required)
2. Your traffic returns to your normal internet connection

Disconnect when you are done testing or gaming.

## Route Test

Use **Route Test** to compare:

- **Test Normal Route** — tunnel must be **off**
- **Test RouteLag Route** — tunnel must be **on**

Results (average ping, packet loss, jitter, public IP) are saved locally.

If ping is **worse** through the tunnel, that can be normal when the beta server is far from you or from game servers.

## Diagnostics

The **Diagnostics** screen runs full network tests for beta reporting:

- **Run Full Diagnostics** — normal route + RouteLag tunnel (ping, traceroute, DNS, MTU)
- **Route Score** and plain-English **Recommendation**
- **Tunnel Health** monitor while connected (every 15 seconds)
- **Copy Report** or **Download Report ZIP** for the developer

You can exclude your public IP from reports. Private keys are always redacted.

## Submit Logs

1. Go to **Logs**
2. Click **Copy logs**
3. Send the pasted text to the RouteLag team (Discord, email, etc.)

Or use **Settings → Open logs folder** and attach `routelag-beta.log`.

Logs are redacted — private keys are never included.

## Fortnite / Epic Games Warning

RouteLag Beta does **not** modify Fortnite or bypass anti-cheat.

If Epic Games or Fortnite shows **VPN**, **proxy**, or **login** errors while RouteLag is connected:

1. Click **Disconnect** in RouteLag Beta
2. Wait a few seconds
3. Retry Fortnite

If problems continue, quit RouteLag Beta completely and test without the tunnel.

## Build from Source (Windows)

```powershell
cd routelag-desktop
npm install
npm run tauri build
```

Installer output:

```
src-tauri\target\release\bundle\nsis\RouteLag Beta_0.1.0_x64-setup.exe
```

## Documentation

- [Beta Tester Guide](docs/BETA-TESTER-GUIDE.md)
- [Windows Install](docs/WINDOWS-INSTALL.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Parent Repo

Server setup and client config generation: [../README.md](../README.md)
