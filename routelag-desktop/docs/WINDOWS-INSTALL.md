# Zer0 Windows Install, Packaging, Signing & Updates

Zer0 (formerly RouteLag) ships a self-contained Windows installer. Testers do
**not** need a separate WireGuard or tunnel app.

This document is the operator guide for **trusted private-beta** packaging.
It does **not** authorize production publishing, DNS changes, store submission,
or live Stripe charges.

## Executable naming (intentional)

| Artifact | Name | Notes |
|---|---|---|
| Desktop app | `Zer0.exe` | Canonical product binary |
| Compatibility alias | `RouteLag.exe` | Same binary; kept for upgrades / recovery |
| Engine service helper | `RouteLagEngine.exe` | Internal engine name (not user-facing brand) |
| WG tools helper | `routelag-wg.exe` | Bundled helper; not standalone WireGuard UI |
| HUD (Full builds) | `RouteLagHUD.exe` | Package ID flip deferred — see `docs/HUD_IDENTITY_MIGRATION.md` |
| Setup | `Zer0-Beta-Core-Setup.exe` / `Zer0-Beta-Full-Setup.exe` | Primary distributor |
| Alias | `Zer0Setup.exe` | Copy of Core setup |
| Uninstaller | `uninstall.exe` | Written into install dir |

Default install directory: `C:\Program Files\Zer0`

## Install (testers)

1. Run the Zer0 setup EXE received from the team.
2. Expect an **unsigned private-beta** SmartScreen / Defender warning — choose
   **More info → Run anyway** only if the file came from the Zer0 team.
3. Approve the Windows **administrator (UAC)** prompt when installing under
   Program Files.
4. Open Zer0. Approve administrator permission again when starting or restoring
   a route session.
5. Prefer **Restore Internet** before the first routing test if a prior session
   may have left state behind.

## Engine health

If Zer0 reports the engine is missing or damaged, the installer did not include
engine resources or the install is corrupted. Reinstall from a fresh setup EXE.

Required engine folder contents (checked before packaging):

```txt
routelag-desktop/src-tauri/engine/windows/RouteLagEngine.exe
routelag-desktop/src-tauri/engine/windows/routelag-wg.exe
routelag-desktop/src-tauri/engine/windows/LICENSES/
```

Optional local-dev fallbacks: `wireguard.exe`, `wg.exe` (must not be required
for released installers).

```powershell
cd routelag-desktop
npm.cmd run check:engine:windows
```

### Runtime dependencies

- Windows 10/11 x64.
- No separate WireGuard for Windows install is required for private beta.
- Visual C++ redistributables: if a tester hits a missing-DLL error for the
  engine, install the latest [VC++ x64 redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
  and re-test. Prefer bundling any confirmed-required runtime DLLs into
  `engine/windows` once identified on a clean VM.
- The packaged app must be built with Cargo feature `custom-protocol` so it
  embeds the frontend and **does not** load the Vite dev server
  (`http://127.0.0.1:1420`). Packaging scripts force this.

## Building installers (do not publish)

From `routelag-desktop` (or `routelag-installer`):

```powershell
npm.cmd install
npm.cmd run check:engine:windows
npm.cmd run installer:core          # Core: app + engine
# npm.cmd run installer:full        # Full: + HUD (requires HUD build)
# npm.cmd run installer:beta:dallas # Dallas API bake-in (HTTP IP — private beta only)
```

Output directory: `routelag-desktop/dist/installers/`

After every build, run artifact inspection (hash + secret scan):

```powershell
powershell -ExecutionPolicy Bypass -File ..\routelag-installer\packaging\inspect-artifact-safety.ps1
```

### Production frontend / Tauri notes

- Installer packaging builds the desktop frontend with Vite (`sourcemap: false`).
- HUD + Replay UI are forced off in shipped desktop builds
  (`VITE_ROUTELAG_ENABLE_HUD=false`, `VITE_ROUTELAG_ENABLE_REPLAY=false`,
  Cargo `disable-hud`).
- CSP is set in `tauri.conf.json` (not `null`).
- External URLs open only through an allowlisted Rust command.
- Auto-update is **disabled** (no Tauri updater plugin). Do not add an updater
  that downloads and executes unsigned binaries.

## RouteLag → Zer0 migration

- New installs write Zer0 registry + ARP (`Zer0 Beta`) and dual-write legacy
  RouteLag keys for upgrade compatibility.
- AppData migrates once from `%LOCALAPPDATA%\RouteLag` → `%LOCALAPPDATA%\Zer0`
  without deleting legacy data.
- Shortcuts use Zer0 names; legacy RouteLag shortcuts are removed.
- See `docs/ZER0_REBRAND_MIGRATION.md`.

## Install failure & networking safety

- The installer **never** starts a route session or creates a tunnel for the user.
- Before replacing files, install/uninstall stop Zer0 processes and best-effort
  disconnect **owned** tunnel profiles only
  (`routelag-engine`, `routelag-beta`, `RouteLag`, `routelag`, `zer0-engine`,
  `Zer0`, `zer0`).
- Unrelated WireGuard / VPN software is never uninstalled.
- If install fails mid-copy, re-run setup. Owned tunnels should already be
  stopped; use **Restore Internet** in Zer0 (or the manual `sc` steps in
  `EMERGENCY-CLEANUP.md`) if networking still looks wrong.

## Uninstall behavior

| Removed always | Optional (checkbox) | Never removed |
|---|---|---|
| `Zer0.exe` / `RouteLag.exe`, engine, HUD, resources, `uninstall.exe` | `%LOCALAPPDATA%\Zer0` + legacy RouteLag AppData / Roaming | Other apps' WireGuard tunnels |
| Desktop + Start Menu Zer0 shortcuts | | System WireGuard for Windows package |
| ARP `Zer0 Beta` (+ legacy RouteLag Beta) | | Unrelated VPN clients |
| Owned Zer0/RouteLag tunnel services (best-effort) | | User's other network adapters |

Default: **preserve user data**. Check “Remove Zer0 user data…” for a full wipe.

## Signing readiness (do not purchase a cert in this task)

### Current state

- Signing is **opt-in** and off by default.
- Enabled only when `WINDOWS_SIGNING_ENABLED=true` and a PFX is provided.
- HUD packaging sets `signAndEditExecutable: false`.
- Private-beta builds are expected to be **unsigned** until a cert is available.

### Required certificate (when ready)

- **Authenticode code-signing certificate** (OV minimum for SmartScreen reputation
  build-up; EV preferred for faster reputation).
- Timestamping: required (`http://timestamp.digicert.com`, SHA-256).

### Files that must be signed

1. Final setup EXE **after** payload append (`Zer0-Beta-*-Setup.exe`).
2. Ideally also: `Zer0.exe`, `RouteLagEngine.exe`, `routelag-wg.exe`,
   `uninstall.exe`, and HUD `RouteLagHUD.exe` (and major HUD DLLs).

### CI secret storage (when CI exists)

- Store PFX + password in CI secret store (never in git).
- Env: `WINDOWS_SIGNING_ENABLED`, `WINDOWS_CERT_PATH`, `WINDOWS_CERT_PASSWORD`.

### Verification commands

```powershell
signtool verify /pa /v .\Zer0-Beta-Core-Setup.exe
Get-AuthenticodeSignature .\Zer0-Beta-Core-Setup.exe
```

### SmartScreen expectations (unsigned)

- First-run “Windows protected your PC” / unrecognized app is **expected**.
- Unsigned builds are **not** production-ready for public distribution.
- Safe for: internal testing and **trusted private beta** with explicit warning.

## Updates (manual private beta)

Auto-update is intentionally **disabled**.

Manual update steps for private beta:

1. Run **Restore Internet** / disconnect in Zer0 if a session is active.
2. Close Zer0 and HUD.
3. Run the new `Zer0-Beta-*-Setup.exe` over the existing install (same folder).
4. Launch Zer0 and confirm version / engine health.
5. Do **not** download “update EXEs” from unofficial mirrors.

When a signed updater is added later, it must use Tauri’s signed update
mechanism (pubkey + signature verification). Never ship an updater that runs
unsigned payloads.

## Security checklist before handing a build to testers

- [ ] `custom-protocol` used for desktop + installer release binaries
- [ ] Engine binaries present; `check:engine:windows` passes
- [ ] No `.env` / private keys / `sk_live` / PFX in payload
- [ ] No production source maps in `dist/`
- [ ] Unsigned-build warning visible in installer UI
- [ ] Admin requirement explained before install
- [ ] Artifact hashes recorded; do not publish hashes as a release channel yet

## Safety

Zer0 does not modify Fortnite, inject into Fortnite, or interact with
anti-cheat. Administrator permission is used to install/control the owned
route session and restore normal internet.
