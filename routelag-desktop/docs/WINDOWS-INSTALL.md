# Windows Install

RouteLag Beta includes its own RouteLag Engine. Testers do not need to install
any separate tunnel app.

## Install

1. Run the RouteLag installer.
2. Open RouteLag.
3. Approve Administrator permission when RouteLag needs to start or stop a
   route session.
4. Click Restore Internet before the first test.
5. Log in with the beta invite code.

## Engine Health

If RouteLag shows `RouteLag Engine is missing or damaged. Reinstall RouteLag.`,
the installer did not include the required engine resources or the install is
corrupted. Reinstall RouteLag.

## Installer Build Checklist

Before running `npm.cmd run tauri build`, the Windows engine folder must contain
the bundled RouteLag Engine files:

```txt
src-tauri/engine/windows/RouteLagEngine.exe
src-tauri/engine/windows/routelag-wg.exe
src-tauri/engine/windows/LICENSES/
```

Development builds may also use `wireguard.exe` and `wg.exe` as fallback names.
The released installer should still present this only as RouteLag Engine and
must not require `C:\Program Files\WireGuard`.

You can check the folder first:

```powershell
npm.cmd run check:engine:windows
```

If the binaries are missing, `npm.cmd run tauri build` fails before producing an
installer:

`Bundled RouteLag Engine binaries are missing. Place RouteLagEngine.exe and routelag-wg.exe in src-tauri/engine/windows before building the installer.`

## Safety

RouteLag does not modify Fortnite, inject into Fortnite, or interact with
anti-cheat. Administrator permission is used to install/control the RouteLag
Service route session and restore normal internet.
