# Zer0 HUD Companion (Overwolf)

Overwolf app that powers the **free live Fortnite HUD**. Zer0 desktop is optional for layout editing;
routing subscription is **not** required.

**Publishing status:** Not Overwolf-store approved/published. Developer / sideload / packaged
ow-electron runtime only. Do not market as an approved Overwolf app.

## Architecture

```txt
Fortnite
  → Zer0 HUD Companion (Overwolf) or Zer0 HUD Runtime (ow-electron)
    → Official Fortnite GEP events
    → Normalizer
    → Overwolf overlay window
    → Optional localhost bridge → Zer0 desktop
```

Zer0 desktop (optional):

- HUD layout editor
- Widget settings
- Account / billing (routing/replays — not HUD entitlement)
- Local bridge on `127.0.0.1:17389`

Companion / HUD Runtime:

- Detects Fortnite (`21216`)
- Registers supported GEP features
- Renders the in-game overlay
- Optionally posts telemetry to Zer0 desktop when paired

## Load in Overwolf

1. Install [Overwolf](https://www.overwolf.com/)
2. Enable developer options
3. Load unpacked extension from this folder: `overwolf-companion/`
4. Open **Zer0 HUD Companion** (works without Zer0 desktop)
5. Optionally open Zer0 desktop and click **Pair with Zer0** for layout sync
6. Launch Fortnite when you want live stats

## Bridge endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/hud/pair` | none (localhost only) | Pairing token |
| `GET` | `/hud/layout` | token | Current HUD layout |
| `POST` | `/hud/telemetry` | token | Live HUD updates |
| `POST` | `/hud/event` | token | Legacy alias |

## Notes

- Missing GEP values render as `--` (no fake stats)
- Overlay layout can be controlled by Zer0 when paired; companion still runs if desktop is closed
- Closing the HUD does not disconnect Zer0 routing
- Closing Zer0 does not terminate the HUD process
- Package / identity migration: see `docs/HUD_IDENTITY_MIGRATION.md`
- User-facing product name is **Zer0 HUD**; Overwolf is the technical runtime
