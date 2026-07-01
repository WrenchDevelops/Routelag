RouteLag Engine binaries are packaged from this directory.

Release builds should place the Windows engine binaries here before running
`npm.cmd run tauri build`:

- `RouteLagEngine.exe`: RouteLag-branded tunnel service installer/uninstaller.
- `routelag-wg.exe`: RouteLag-branded tunnel tools binary for key generation
  and runtime status.

Local development fallback names are also supported:

- `wireguard.exe`
- `wg.exe`

If these binaries are based on WireGuard, keep the required license and
attribution files in `LICENSES/`. Do not remove attribution from packaged
builds.

The Tauri installer includes this folder through `tauri.conf.json`:

```json
"resources": ["engine/windows"]
```

The app does not look in `C:\Program Files\WireGuard` and does not require the
WireGuard desktop app. If these files are missing, the app reports:

`RouteLag Engine is missing or damaged. Reinstall RouteLag.`
