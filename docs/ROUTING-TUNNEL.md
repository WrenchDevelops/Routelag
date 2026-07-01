# RouteLag Routing Tunnel

This is the RouteLag private beta route tunnel.

Normal tester flow:

```text
Login -> Select Fortnite -> Select beta route -> Optimize
```

The tester does not import tunnel files manually. The desktop app creates a
local keypair, sends only the public key to the RouteLag API, receives route
details, writes a hidden local RouteLag Engine profile, and starts the route.

## South Africa to Middle East Beta Servers

- Johannesburg Beta
- Frankfurt Beta
- London Beta
- Amsterdam Beta, or Paris if that server was purchased instead

Each route is configured independently by the API. A route should only be marked
online when its endpoint, server public key, and captured Fortnite Middle East
IPv4 `/32` AllowedIPs are configured.

## Tunnel Defaults

- OS: Ubuntu 24
- Tunnel network: `10.66.66.0/24`
- Server tunnel IP: `10.66.66.1`
- Route port: UDP `51820`
- Default DNS: `1.1.1.1`
- Default MTU: `1280`
- Full tunnel routes such as `0.0.0.0/0` and `::/0` are blocked.

## Pieces

1. Desktop app generates a local client keypair.
2. Desktop app calls `POST /api/routes/create` with the client public key.
3. RouteLag API assigns a client IP from `10.66.66.2-10.66.66.254`.
4. RouteLag API adds the peer to `wg0`.
5. Desktop app writes a hidden local RouteLag Engine profile.
6. Desktop app starts the local tunnel service.

The backend never receives the client private key.

## Peer Creation

For the MVP, the API can run directly on the VPS and manage `wg0` locally:

```bash
wg set wg0 peer CLIENT_PUBLIC_KEY allowed-ips 10.66.66.12/32
```

The API stores the route session with the session ID, tester ID, public key,
client tunnel IP, game/server IDs, timestamps, and active state.

## Peer Revocation

When the tester clicks End Optimization, the desktop app stops the local route
and calls `POST /api/routes/end`. The API removes the peer:

```bash
wg set wg0 peer CLIENT_PUBLIC_KEY remove
```

If a session is already inactive, ending it should be harmless.

## Check Status

On the VPS:

```bash
wg show wg0
```

Look for `latest handshake`, `transfer`, and the tester peer public key. The API
status endpoint parses this output for active sessions.

## Restart The Route Tunnel

```bash
systemctl restart wg-quick@wg0
wg show wg0
```

If traffic does not exit through the VPS, confirm forwarding and NAT:

```bash
sysctl net.ipv4.ip_forward
iptables -t nat -S POSTROUTING
```

## Private Beta Goal

The beta compares RouteLag OFF, Johannesburg, Frankfurt, London, and
Amsterdam/Paris for South African Fortnite players using the Middle East
matchmaking region. The winning route is the best combination of low ping, low
packet loss, fewer spikes, and stable gameplay for the tester's ISP.
