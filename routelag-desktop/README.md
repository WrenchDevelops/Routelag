# RouteLag Beta Desktop

RouteLag is a Windows desktop app for private targeted routing tests. The app
ships with RouteLag Engine resources in the installer, so beta testers should
not install a separate tunnel app.

## Current Beta Flow

1. Install RouteLag.
2. Open RouteLag as Administrator when prompted.
3. Click Restore Internet before testing.
4. Log in with a beta invite.
5. Start safe split-route optimization.
6. Test Fortnite.
7. Click End Optimization.
8. Export the RouteLag report ZIP.

## RouteLag Engine

RouteLag Engine is bundled from `src-tauri/engine/windows` into the Tauri
installer resources. Release packaging must provide:

- `RouteLagEngine.exe`
- `routelag-wg.exe`

Local development also supports these fallback filenames:

- `wireguard.exe`
- `wg.exe`

The Tauri bundle includes `engine/windows` through `src-tauri/tauri.conf.json`.
Before building an installer, place the engine binaries and attribution files at:

```txt
src-tauri/engine/windows/RouteLagEngine.exe
src-tauri/engine/windows/routelag-wg.exe
src-tauri/engine/windows/LICENSES/
```

Check the folder without blocking a frontend build:

```powershell
npm.cmd run check:engine:windows
```

Build the installer with the guarded package command:

```powershell
npm.cmd run tauri build
```

If the service binary or tools binary is missing, the guarded installer command
fails before producing a broken installer:

`Bundled RouteLag Engine binaries are missing from src-tauri/engine/windows.`

If either file is missing, RouteLag shows:

`RouteLag Engine is missing or damaged. Reinstall RouteLag.`

RouteLag still blocks full-tunnel policies and only writes targeted route
profiles returned by the beta API.
