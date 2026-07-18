# HUD identity & free-product migration

## Product rule

Zer0 HUD is **free**, a **separate application**, and **independent of paid routing**.

| Capability | Free account | Paid account | Desktop required | Routing required |
| --- | --- | --- | --- | --- |
| Install HUD | Yes | Yes | No | No |
| Launch HUD directly | Yes | Yes | No | No |
| Launch HUD from Zer0 | Yes | Yes | Yes (launcher only) | No |
| Use routing | No (Pro) | Yes | Yes | Yes |
| View replay data | No (Pro) | Yes | Yes | No |

## Current package identifiers (preserve)

| Surface | Current ID | Notes |
| --- | --- | --- |
| ow-electron `appId` | `com.routelag.hud` | Do not rename without migration |
| ow-electron `productName` / exe | `RouteLagHUD` / `RouteLagHUD.exe` | Desktop still detects this first |
| npm package folder | `routelag-hud` | Repo path; rename later |
| Bridge header | `X-RouteLag-HUD-Token` | Wire protocol; keep for compatibility |
| AppData logs (legacy) | `%LOCALAPPDATA%\RouteLag\hud` | Still detected |
| Overwolf companion folder | `overwolf-companion/` | Unpacked sideload; not store-published |

## Proposed Zer0 identifiers (not switched yet)

| Surface | Proposed ID | Migration requirement |
| --- | --- | --- |
| ow-electron `appId` | `com.zer0.hud` | Dual-install detection + optional uninstall of old appId |
| Executable | `Zer0HUD.exe` | Desktop already probes this name; ship dual-detect first |
| AppData | `%LOCALAPPDATA%\Zer0\hud` | Dual-read already; dual-write when packaging flips |
| Registry | `HKCU\Software\Zer0` `HudRuntimePath` | Dual-read already |
| Display name | Zer0 HUD / Zer0 HUD Companion | User-facing strings updated; store submission later |

## Compatibility rules

1. **Do not** change `com.routelag.hud` / `RouteLagHUD.exe` in a shipping build until an installer migration plan exists.
2. Desktop `install_info` must detect **both** `RouteLagHUD.exe` and `Zer0HUD.exe`.
3. Prefer launching the legacy exe when both exist (installed base).
4. User-facing copy should say **Zer0**; protocol/package IDs may remain RouteLag until migration.
5. Never present the companion as Overwolf-store approved until approval exists.
6. No Tebex. No fake internal HUD launcher that bypasses Overwolf/ow-electron requirements.

## Lifecycle

- `launch_hud_installer_cmd` uses detached `Command::spawn` — closing Zer0 must not kill HUD.
- Zer0 exit stops the **desktop HUD bridge** and desktop preview window only.
- Installer/uninstaller may terminate HUD processes during repair/uninstall (`RouteLagHUD.exe` and `Zer0HUD.exe`).
- Closing HUD must not call routing disconnect APIs (HUD has no routing control).

## Clerk billing

- Paid features: `unlimited_routing`, `replays`.
- Legacy Clerk feature key `hud` (`LEGACY_CLERK_HUD_FEATURE_KEY`) must **not** gate UI.
- Account plan marketing strips HUD from Pro lists and lists **Free HUD Overlay** on Free.
