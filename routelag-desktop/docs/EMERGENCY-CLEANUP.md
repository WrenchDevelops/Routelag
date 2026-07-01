# Emergency Cleanup

Use Restore Internet in RouteLag first. It stops/removes RouteLag route services,
flushes DNS, and clears stale local route session state.

## Manual Service Cleanup

Run PowerShell or Command Prompt as Administrator:

```powershell
sc stop WireGuardTunnel$routelag-engine
sc delete WireGuardTunnel$routelag-engine
sc stop WireGuardTunnel$routelag-beta
sc delete WireGuardTunnel$routelag-beta
sc stop WireGuardTunnel$RouteLag
sc delete WireGuardTunnel$RouteLag
sc stop WireGuardTunnel$routelag
sc delete WireGuardTunnel$routelag
ipconfig /flushdns
```

Missing or stopped services are safe and expected after a clean shutdown.
