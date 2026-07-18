# RouteLag → Zer0 rebrand migration

**Updated:** 2026-07-17  
**Status:** Partially complete — user-facing surfaces and dual-path identity landed; domain cutover and HUD package ID flip remain blocked.

## Goals

1. New builds are visibly **Zer0** (window title, shortcuts, ARP, UI copy, installer names).
2. Existing RouteLag installs keep working (settings, logs, Restore Internet, HUD detection).
3. Do **not** replace working `routelag.com` URLs with nonexistent Zer0 hosts.
4. Do **not** rename engine/tunnel service names mid-flight without dual cleanup.

## Compatibility model

| Surface | Write (new) | Read (legacy) | Notes |
| --- | --- | --- | --- |
| App exe | `Zer0.exe` + alias `RouteLag.exe` | Prefer Zer0 → RouteLag → RouteLag Beta | Packaging dual-ships alias |
| Registry | `Software\Zer0` + dual-write `Software\RouteLag` | Zer0 first, then RouteLag | Desktop `install_info` already dual-read |
| AppData | `%LOCALAPPDATA%\Zer0` | Migrate-once from `%LOCALAPPDATA%\RouteLag` | Marker `.zer0-appdata-migrated`; never deletes legacy |
| Tunnel service | Keep `routelag-engine` | Cleanup also owns `zer0-engine` / `Zer0` | Changing active name would strand tunnels |
| Engine binaries | Keep `RouteLagEngine.exe` / `routelag-wg.exe` | Detect as today | Rename later with aliases |
| HUD package | Keep `RouteLagHUD.exe` / `com.routelag.hud` | Also detect `Zer0HUD.exe` | See `docs/HUD_IDENTITY_MIGRATION.md` |
| Env vars | Prefer `ZER0_*` / `VITE_ZER0_*` | Fall back `ROUTELAG_*` / `VITE_ROUTELAG_*` | Documented below |
| Support URLs | `VITE_ZER0_SUPPORT_BASE_URL` if set | Else `https://routelag.com` | Controlled fallback — no live DNS change |

## Environment variable precedence

### Server (`server/src/config.ts`)

1. `ZER0_<NAME>`
2. `ROUTELAG_<NAME>` (legacy)
3. Safe default

Examples: `ZER0_API_PORT` → `ROUTELAG_API_PORT` → `8787`/`3001`.

**Remove after migration (condition):** after every VPS/staging deploy uses only `ZER0_*` for 30 days with no rollback.

### Desktop Vite

1. `VITE_ZER0_API_URL` → `VITE_ROUTELAG_API_URL` → baked IP default  
2. `VITE_ZER0_BETA_MODE` → `VITE_ROUTELAG_BETA_MODE`  
3. `VITE_ZER0_ENABLE_HUD` → `VITE_ROUTELAG_ENABLE_HUD`  
4. `VITE_ZER0_ENABLE_REPLAY` → `VITE_ROUTELAG_ENABLE_REPLAY`  
5. `VITE_ZER0_SUPPORT_BASE_URL` / `VITE_SUPPORT_BASE_URL` → legacy `https://routelag.com`

### LocalStorage keys

Keep `routelag.*` keys (`routelag.routeToken`, etc.). Renaming would sign users out. **Remove after migration:** only with an explicit read-old/write-new token migrator.

## Domain handling

| Old URL | Zer0 replacement configured? | Action |
| --- | --- | --- |
| `https://routelag.com` | No | Controlled fallback via `supportUrls.ts` |
| `https://routelag.com/support/plans` | No | Same fallback |
| `https://routelag.com/hud` | No | Same fallback |
| `https://routelag.com/downloads/manifest.json` | No | **Blocked** — keep until Zer0 CDN/manifest exists |
| Railway PathGen host (`routelag-stationary-…`) | No | Keep; OAuth redirect update is external |

**Do not modify live DNS in this change set.**

## Reference table

| Reference | Location | Classification | Action taken | Compatibility reason | Removal date/condition |
| --- | --- | --- | --- | --- | --- |
| UI “RouteLag” strings (disclaimer, settings, help, banners) | `routelag-desktop/src/**` | Replace now | Replaced with Zer0 | User-facing brand | Done |
| Window / productName Zer0 | `tauri.conf.json` | Replace now | Already Zer0 | — | Done |
| Packaged app exe | `build-installer.ps1` | Replace now + Preserve | Ships `Zer0.exe` + `RouteLag.exe` alias | Upgrades / kill / ARP | Drop alias after ≥1 release + support notice |
| Installer Tauri id | `routelag-installer/.../tauri.conf.json` | Replace now | `com.zer0.setup` (was `com.routelag.setup`) | Installer webview only | Keep |
| `RouteLagEngine.exe` / `routelag-wg.exe` | engine + `route_lag_engine.rs` | Preserve for migration | Unchanged | Live tunnel tooling | After engine rename + dual detect |
| Tunnel name `routelag-engine` | `config.rs` / cleanup | Preserve for migration | Unchanged; cleanup dual-owns Zer0 names | Restore Internet on old installs | After forced reconnect migration window |
| `Software\RouteLag` | installer `registry.rs` | Preserve for migration | Dual-write Zer0+RouteLag; dual-delete on uninstall | Old tools / upgrades | After all clients ≥ dual-write build |
| `Software\Zer0` | installer `registry.rs` | Replace now | Now written | Canonical metadata | Keep |
| `%LOCALAPPDATA%\RouteLag` | `startup.rs`, uninstall | Preserve for migration | Migrate-once into Zer0; dual log write; uninstall cleans both | Settings / crash logs / Restore Internet | After migrate marker ubiquitous + support window |
| `%LOCALAPPDATA%\Zer0` | `startup.rs` | Replace now | Canonical write target | New installs | Keep |
| `RouteLagHUD.exe` / `com.routelag.hud` | `routelag-hud` | Preserve for external approval | Dual-detect only; package ID not flipped | Overwolf/ow-electron continuity | After HUD packaging plan in `HUD_IDENTITY_MIGRATION.md` |
| `Zer0HUD.exe` | desktop detect | Preserve for migration | Detected; not yet shipped | Future package | When HUD ships under Zer0 name |
| Bridge `X-RouteLag-HUD-Token` | HUD bridge | Preserve for migration | Unchanged | Wire protocol | After dual-header bridge |
| localStorage `routelag.*` | `lib/api.ts` | Preserve for migration | Unchanged | Auth sessions | Explicit token migrator |
| `ROUTELAG_*` env | server / VPS | Preserve for migration | `ZER0_*` preferred, legacy fallback | Live VPS | 30 days after ZER0-only deploys |
| `VITE_ROUTELAG_*` | desktop build | Preserve for migration | `VITE_ZER0_*` preferred | CI / packaging scripts | After packaging scripts updated |
| `https://routelag.com` help/plans/hud | `supportUrls.ts` | Preserve for external approval | Controlled fallback; override via env | Working links; no Zer0 DNS yet | When Zer0 site + DNS live |
| Manifest `routelag.com/downloads/…` | installer `install_manifest.rs` | Unknown / blocked | Left unchanged | Breaks online installer if swapped blindly | When Zer0 CDN/manifest exists |
| Folder names `routelag-*` | repo | Internal code name only | Unchanged | Repo / cargo paths | Optional later rename |
| NSIS legacy installer | `routelag-desktop/installer/` | Remove after migration | Not primary path; custom Tauri installer is primary | Historical | After NSIS fully deprecated |
| Overwolf companion display | `overwolf-companion/` | Preserve for external approval | Display already Zer0; store not published | Store approval history | After store decision |
| Dallas setup filename | packaging | Replace now | `Zer0-Beta-Dallas-Setup.exe` | Brand consistency | Done |
| API session messages | `server/src/app.ts`, autoRoute | Replace now | Zer0 wording | Client-visible | Done |
| Invite codes `ROUTELAG-BETA` | server defaults | Preserve for migration | Unchanged | Issued beta codes | After codes rotated |

## Required test matrix

| Test | Method | Result (2026-07-17) |
| --- | --- | --- |
| Fresh Zer0 AppData path | Code + unit (`startup` migrate tests) | Automated local: pass |
| Existing RouteLag settings discovery | Code inspection + migrate-once unit | Automated local: pass (unit) |
| Settings migration | Unit test copies conf/meta | Automated local: pass |
| Log migration | Best-effort logs copy in migrate | Automated local: unit covers marker; full log tree not asserted |
| Old tunnel service detection | Code inspection (`cleanup.rs` owned names) | Inspected only |
| Restore Internet with old service name | Code inspection | Inspected only — **needs Real Windows testing** |
| Old / new HUD detection | Existing `install_info` unit tests | Automated local: pass |
| No duplicate shortcuts | Code: create only `Zer0.lnk`; remove legacy names | Inspected only |
| No duplicate auto-start | No new auto-start added | Inspected only |
| Uninstall both AppData trees | Code updated | Inspected only — **needs Real Windows testing** |
| Reinstall / upgrade exe dual-ship | Packaging script updated | Inspected only — **needs Real Windows testing** |

## What is intentionally NOT complete

- Live DNS / Zer0 website
- Online installer manifest host swap
- HUD `com.routelag.hud` → `com.zer0.hud` package flip
- Engine binary rename
- Tunnel service rename away from `routelag-engine`
- Repo folder rename `routelag-*`
- Full Windows install/upgrade/uninstall E2E
- Fortnite / VPS verification

## Related docs

- `docs/HUD_IDENTITY_MIGRATION.md`
- `docs/PATHGEN_IDENTITY_MIGRATION.md`
- `docs/ZER0_FULL_PRODUCT_LAUNCH_AUDIT_2026-07-17.md` (section D)
