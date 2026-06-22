# RouteLag Beta — Emergency Cleanup

Use **Emergency Cleanup** when RouteLag is connected but your internet is not working correctly, or when the tunnel service is stuck and you need to restore normal internet quickly.

## In the app

1. Open **Settings** (or use **Emergency Cleanup** on the Connect page when the stuck-tunnel banner appears).
2. Scroll to **Recovery**.
3. Click **Emergency Cleanup**.
4. Confirm the prompt.
5. Approve administrator permission if prompted (Restart as Administrator).

Emergency Cleanup will:

- Stop the `WireGuardTunnel$routelag-beta` Windows service
- Uninstall the RouteLag tunnel service via WireGuard
- Flush DNS with `ipconfig /flushdns`
- Reset the app tunnel status to **Disconnected**

Emergency Cleanup will **not**:

- Uninstall WireGuard for Windows
- Uninstall RouteLag Beta
- Remove your imported `.conf` file

After cleanup, your normal internet should work again. You can reconnect RouteLag from the Connect page when ready.

## Manual commands (Administrator Command Prompt)

If the app cannot run cleanup, run these commands manually:

```bat
sc stop WireGuardTunnel$routelag-beta
"C:\Program Files\WireGuard\wireguard.exe" /uninstalltunnelservice routelag-beta
ipconfig /flushdns
```

If WireGuard is installed in a different location, adjust the path to `wireguard.exe`.

## When to use

- Public IP does not change after connecting
- Ping or DNS fails while the tunnel shows connected
- You cannot disconnect normally from the app
- Fortnite or other apps cannot reach the internet while RouteLag is connected

## After cleanup

1. Verify your public IP is back to normal (Connect page or `curl ifconfig.me` in a browser).
2. If problems persist, reboot your PC.
3. Share logs and a diagnostics ZIP with the RouteLag team if you need help.

See also: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
