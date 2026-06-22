# RouteLag Beta — Troubleshooting

Common issues for the RouteLag Beta desktop app and WireGuard tunnel.

---

## WireGuard Not Installed

**Symptoms:** Banner on Connect screen: "WireGuard for Windows is not installed"

**Fix:**

1. Install from [https://www.wireguard.com/install/](https://www.wireguard.com/install/)
2. Restart RouteLag Beta

---

## Administrator Permission Required

**Symptoms:** Connect/Disconnect disabled or modal appears when clicking Connect

**Fix:**

1. Click **Restart as Administrator** in the modal
2. Approve the Windows UAC prompt
3. After relaunch, status shows **Admin mode**
4. Click **Connect** again

If you denied UAC, RouteLag stays in normal mode. Try Connect again when ready.

RouteLag needs admin only to control the WireGuard tunnel service — not to open the app or run ping tests.

---

## No Config Imported

**Symptoms:** "Import your tester WireGuard config in Settings"

**Fix:**

1. Get your `.conf` from the RouteLag server admin
2. **Settings → Import config file**
3. Select the `.conf` file

---

## Connect Fails / Tunnel Error

**Symptoms:** Status shows **Error** or toast with tunnel failure message

**Checks:**

1. WireGuard for Windows is installed
2. App is running in **Admin mode**
3. Config is imported and valid
4. UDP port `51820` is open on the VPS and your network allows UDP VPN
5. Endpoint in config matches the current VPS IP

**Server-side checks** (admin): see parent repo [TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md)

**View logs:** **Logs** screen or **Settings → Open logs folder**

---

## Connected But No Internet

**Symptoms:** Tunnel shows connected but websites fail and ping fails

**Checks:**

1. Server has IP forwarding and NAT enabled (server admin)
2. Client config has `AllowedIPs = 0.0.0.0/0`
3. Try `ping 1.1.1.1` from RouteLag Connect screen

---

## Public IP Did Not Change

**Symptoms:** Connected but IP before and after look the same

**Checks:**

1. Confirm status is **Connected**
2. Wait a few seconds and refresh (disconnect/reconnect)
3. Verify config is a full tunnel (`AllowedIPs = 0.0.0.0/0`)
4. Check logs for connect errors

---

## Ping Gets Worse

**Symptoms:** Warning on Connect screen or higher in-game ping with tunnel on

**This is expected** when:

- The beta VPS is far from you
- The VPS is far from game servers
- Your direct route was already optimal

**What to do:**

1. Run **Route Test** for both normal and RouteLag routes
2. Compare results
3. Disconnect when the tunnel does not help

RouteLag Beta does not guarantee lower ping.

---

## Fortnite / Epic VPN or Login Errors

**Symptoms:** Epic launcher or Fortnite reports VPN, proxy, or login issues

**Fix:**

1. Click **Disconnect** in RouteLag Beta
2. Wait a few seconds
3. Retry Fortnite

If it persists:

1. Quit RouteLag Beta completely
2. Confirm tunnel is disconnected (status **Disconnected**)
3. Retry Fortnite

RouteLag Beta does not modify Fortnite or bypass anti-cheat. Some networks and games are sensitive to VPN egress IPs.

---

## Diagnostics / Report Export

**Symptoms:** Need to send data to the developer

**Fix:**

1. Go to **Diagnostics**
2. Run **Full Diagnostics**
3. **Copy Report** or **Download Report ZIP**
4. Send via your beta channel (Discord, email)

ZIP contains: `routelag-report.txt`, `routelag-report.json`, `ping-results.csv`, traceroute files, WireGuard status, and app log. All private keys are redacted.

---

## Tunnel Degraded / Reconnect Recommended

**Symptoms:** Connect screen shows "Reconnect Recommended" or tunnel health is degraded

**Fix:**

1. Click **Reconnect Tunnel** (admin mode required)
2. If it keeps failing, run **Diagnostics** and send the ZIP report
3. Check UDP 51820 is not blocked on your network

---

## Route Test Button Disabled

| Button | Requires |
|--------|----------|
| Test Normal Route | Tunnel **disconnected** |
| Test RouteLag Route | Tunnel **connected** |

Disconnect or connect first, then retry.

---

## Logs Empty or Missing

**Fix:**

1. Use the app normally — logs are written on connect/disconnect and errors
2. **Settings → Open logs folder** → `routelag-beta.log`
3. **Logs → Copy logs** to share with support

Private keys are always redacted in logs.

---

## Reset Everything

**Settings → Reset app** removes:

- Imported config
- Logs
- Saved route test result

Use this for a clean retest. Does not uninstall WireGuard.

---

## Manual Tunnel Cleanup

If RouteLag Beta cannot disconnect, run in **elevated PowerShell**:

```powershell
& "C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice routelag-beta
```

---

## Still Stuck?

Collect and send:

1. **Logs → Copy logs**
2. Screenshot of Connect screen (status, IPs, ping)
3. Whether WireGuard GUI shows any `routelag-beta` tunnel
4. Output of server `sudo ./scripts/03-status.sh` (server admin)

See also:

- [Beta Tester Guide](BETA-TESTER-GUIDE.md)
- [Emergency Cleanup](EMERGENCY-CLEANUP.md)
- [Windows Install](WINDOWS-INSTALL.md)
- [Parent server troubleshooting](../../docs/TROUBLESHOOTING.md)
