# RouteLag Setup (custom installer bootstrapper)

A frameless, dark, custom-UI Windows installer for RouteLag, built the same way as
`routelag-desktop` (Tauri v2 + React/TypeScript) instead of a themed NSIS/MSI wizard. There is
no native Windows installer chrome anywhere in this flow — the only native OS dialog the user
ever sees is the UAC consent prompt when the actual privileged install begins.

## Why not NSIS

The previous installer (`routelag-desktop/installer/*.nsi`) reskinned NSIS's `NsDialogs` with
custom colors/fonts, but was still a native Win32 dialog host underneath (native title bar,
native buttons, native `instfiles` page). This project instead renders 100% of its UI itself.

## Architecture

- **`routelag-setup.exe`** — the visible installer. Launches **unelevated** so the whole wizard
  (Welcome → Install Type → Components → Ready → Installing → Complete) is browsable without a
  UAC prompt.
- **`routelag-uninstall.exe`** — same binary crate, same UI shell, different entry point. Gets
  copied into the install directory as `uninstall.exe` at install time.
- **Elevation on demand**: clicking **Install RouteLag** relaunches the current exe elevated
  (`ShellExecuteW` verb `runas`, `--elevated-worker <job-file>`) to perform the actual
  `C:\Program Files\RouteLag` file copy + registry writes headlessly (no window). The
  non-elevated UI tails a progress file written by that worker and reflects it live. See
  `src-tauri/src/elevate.rs` and `src-tauri/src/lib.rs::spawn_worker`.
- **Self-contained single EXE**: the payload (app + engine + optional HUD files, plus a
  `manifest.json`) is zipped and appended directly onto the end of `routelag-setup.exe` by
  `packaging/build-installer.ps1`, with a small 24-byte footer so `src-tauri/src/payload.rs` can
  find and read it straight out of the running exe — no bundled resource folder, no second file
  to distribute.
- **Add HUD Runtime later**: launching the Full installer while a Core install already exists
  (detected via the `HKCU\Software\RouteLag` registry keys) skips straight to a short "Add HUD
  Runtime" page that only touches the `hud/` folder — it doesn't re-copy the app or engine.

## Building

On machines with a restricted PowerShell execution policy, use `npm.cmd` (not `npm`)
and never invoke `.ps1` files directly:

```powershell
# from routelag-installer/
npm.cmd install
npm.cmd run installer:core                 # Core only
npm.cmd run installer                      # Core (+ Full if HUD build output is present)
npm.cmd run installer:full                 # Full only
npm.cmd run installer:dev                  # reuse existing routelag-desktop/engine/hud output

# equivalent one-liner without npm scripts:
powershell -ExecutionPolicy Bypass -File .\packaging\build-installer.ps1 -Core
```

Output: `routelag-desktop/dist/installers/RouteLag-Beta-{Core,Full}-Setup.exe`.

## Development

Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.

**Live UI editing (needs Vite running):**

```powershell
npm.cmd run tauri:dev
```

This starts the Vite dev server and opens the installer window at `http://127.0.0.1:1430`.
Do not run `src-tauri\target\debug\routelag-setup.exe` directly for this workflow.

**Standalone UI preview (no Vite, bundled assets):**

```powershell
npm.cmd run build
cargo build --release --manifest-path src-tauri/Cargo.toml --features custom-protocol
.\src-tauri\target\release\routelag-setup.exe
```

The frontend must be built into `dist/` before compiling Rust. Without `dist/`,
release builds fail at compile time instead of shipping an installer that tries
to load the Vite dev server.

**Production installer EXE (with RouteLag payload):**

```powershell
npm.cmd run installer:core
```

Output: `routelag-desktop/dist/installers/RouteLag-Beta-Core-Setup.exe`

With no payload appended, `has_payload()` returns `false` and the UI falls back to a
`hudIncluded: false` manifest so the wizard still renders for UI iteration.

## Registry / uninstall compatibility

Writes the same `HKCU\Software\RouteLag` keys the old NSIS installer did
(`InstallPath`, `Version`, `EngineInstalled`, `HudRuntimeInstalled`, `HudRuntimePath`,
`InstallType`), so `routelag-desktop/src-tauri/src/install_info.rs` and
`launch_hud_installer_cmd` keep working unchanged. Also adds a proper
`HKLM\...\Uninstall\RouteLag Beta` Add/Remove Programs entry, since installs are now
machine-wide.
