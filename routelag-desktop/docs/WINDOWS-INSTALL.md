# RouteLag Beta — Windows Install

## System Requirements

- Windows 10 or Windows 11 (64-bit)
- Internet connection
- Administrator access (for connect/disconnect only)

## Step 1: Install WireGuard for Windows

RouteLag Beta depends on the official WireGuard Windows app being installed.

1. Visit [https://www.wireguard.com/install/](https://www.wireguard.com/install/)
2. Download **WireGuard for Windows**
3. Run the installer
4. You do **not** need to import your config into the WireGuard GUI — RouteLag Beta manages the tunnel

## Step 2: Install RouteLag Beta

1. Run the RouteLag Beta installer (`RouteLag Beta_*_x64-setup.exe`)
2. Follow the setup wizard
3. Launch RouteLag Beta from the Start menu

The app installs for the current user by default (`%LOCALAPPDATA%`).

## Step 3: First Launch

On first launch:

1. The app opens in **normal mode** — no UAC prompt
2. Go to **Settings** and import your tester `.conf` file
3. Go to **Connect** when ready

## Administrator Permission

RouteLag Beta uses two modes:

| Mode | When | Can do |
|------|------|--------|
| Normal | Default launch | Import config, ping tests, route tests, logs |
| Admin | After UAC elevation | Connect / disconnect tunnel |

When you click **Connect** in normal mode, RouteLag explains why admin is needed and offers **Restart as Administrator**.

RouteLag does **not** modify Fortnite, inject into Fortnite, or interact with anti-cheat. Admin is only used to install/control the standard WireGuard tunnel Windows service.

## App Data Location

```
%APPDATA%\com.routelag.beta\
├── routelag-beta.conf
├── routelag-beta.log
└── route-test-latest.json
```

Configs are **not** stored in Program Files or inside the app install folder.

## Building from Source

Requires [Rust](https://rustup.rs/) and Node.js 18+.

```powershell
cd routelag-desktop
npm install
npm run tauri build
```

Output installer:

```
src-tauri\target\release\bundle\nsis\
```

## Uninstall

1. Windows **Settings → Apps → RouteLag Beta → Uninstall**
2. Optionally delete app data: `%APPDATA%\com.routelag.beta\`

If a tunnel was left connected, open RouteLag Beta as admin and click **Disconnect** before uninstalling, or run in an elevated terminal:

```powershell
& "C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice routelag-beta
```

## See Also

- [Beta Tester Guide](BETA-TESTER-GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
