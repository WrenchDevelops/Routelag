# Zer0 Setup (custom installer bootstrapper)

A frameless, dark, custom-UI Windows installer for **Zer0** (formerly RouteLag),
built the same way as `routelag-desktop` (Tauri v2 + React/TypeScript).

Canonical packaging / signing / update docs:
`routelag-desktop/docs/WINDOWS-INSTALL.md`

## Architecture

- **`routelag-setup.exe`** — visible installer (unelevated wizard). Product name: **Zer0 Setup**.
- **`routelag-uninstall.exe`** — embedded into setup; written as `uninstall.exe` at install time.
- **Elevation on demand**: Install triggers UAC (`runas`) for Program Files writes.
- **Self-contained payload**: zip of `app/` + `engine/` (+ optional `hud/`) appended to the setup EXE.
- Default install dir: `C:\Program Files\Zer0`
- Registry: dual-write `HKCU\Software\Zer0` + legacy `Software\RouteLag` for migration.
- ARP display name: **Zer0 Beta**

## Building

```powershell
# from routelag-installer/
npm.cmd install
npm.cmd run installer:core                 # Core only
npm.cmd run installer                      # Core (+ Full if HUD build output is present)
npm.cmd run installer:full                 # Full only
npm.cmd run installer:dev                  # reuse existing desktop/engine/hud output
```

Output: `routelag-desktop/dist/installers/Zer0-Beta-{Core,Full}-Setup.exe`

Signing (optional):

```powershell
$env:WINDOWS_SIGNING_ENABLED = "true"
$env:WINDOWS_CERT_PATH = "C:\path\to\cert.pfx"
$env:WINDOWS_CERT_PASSWORD = "***"
```

Default builds are **unsigned** — private-beta only. Auto-update is disabled.

After build, `packaging/inspect-artifact-safety.ps1` records SHA-256 hashes and
runs a heuristic secret/dev-URL scan.

## Safety behaviors

- Install/uninstall disconnect **owned** Zer0/RouteLag tunnel services only.
- Uninstall does not remove unrelated WireGuard/VPN software.
- User data wipe is opt-in.
- Installer UI warns about unsigned builds and admin requirements.

## Development

```powershell
npm.cmd run tauri:dev   # Vite + installer UI at http://127.0.0.1:1430
```

Release builds require `custom-protocol` so the EXE does not load the Vite dev server.
