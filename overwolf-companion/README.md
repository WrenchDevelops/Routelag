# RouteLag HUD Companion (Overwolf)

Overwolf app that powers the **live Fortnite HUD**. RouteLag desktop remains the editor/controller.

## Architecture

```txt
Fortnite
  → RouteLag HUD Companion (Overwolf)
  → Official Fortnite GEP events
  → Normalizer
  → Overwolf overlay window
  → Localhost bridge → RouteLag desktop
```

RouteLag desktop:

- HUD layout editor
- Widget settings
- Account / billing
- Local bridge on `127.0.0.1:17389`

Companion:

- Detects Fortnite (`21216`)
- Registers supported GEP features
- Renders the in-game overlay
- Posts telemetry to RouteLag

## Load in Overwolf

1. Install [Overwolf](https://www.overwolf.com/)
2. Enable developer options
3. Load unpacked extension from this folder: `overwolf-companion/`
4. Start **RouteLag** desktop first
5. Open **RouteLag HUD Companion** settings and click **Pair with RouteLag**
6. Launch Fortnite

## Bridge endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/hud/pair` | none (localhost only) | Pairing token |
| `GET` | `/hud/layout` | token | Current HUD layout |
| `POST` | `/hud/telemetry` | token | Live HUD updates |
| `POST` | `/hud/event` | token | Legacy alias |

## Notes

- Missing GEP values render as `--` (no fake stats)
- Overlay layout is controlled by RouteLag and polled by the companion
- User-facing product name is **RouteLag HUD**; Overwolf is the technical runtime
