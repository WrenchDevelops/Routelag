# VPS hardening checklist (full-session beta)

Run on **every** routing node (Dallas, Ashburn, etc.) before tournament or competitive testing. Do not open inbound game-port ranges (`12000-65000`); clients are behind stateful NAT.

## 1. Kill legacy unsafe agents

```bash
sudo pkill -f routelag-vps-agent.js || true
sudo ss -lntup | grep -E ':3000|:9999|:51820|:3001'
```

If anything still listens on `3000` or `9999`:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j DROP
sudo iptables -I INPUT 1 -p udp --dport 9999 -j DROP
# or via UFW (also applied by install scripts):
sudo ufw deny 3000/tcp
sudo ufw deny 9999/udp
```

## 2. Confirm WireGuard + NAT (not tun0)

```bash
ip route show default          # note <WAN_IF>: eth0 / ens3 / enp1s0
systemctl is-active wg-quick@wg0
sudo wg show
sudo iptables -t nat -L POSTROUTING -n -v
sudo iptables -L FORWARD -n -v
```

Expect interface **`wg0`**, MASQUERADE on the detected WAN iface, and an active handshake path once a client connects.

## 3. Peer mode must be real WireGuard

On the API host (`routelag-api`):

```bash
grep -E 'PEER_MODE|ZER0_PEER_MODE|ROUTELAG_PEER_MODE' /opt/routelag-server/.env || true
```

Must be `wg` (`ROUTELAG_PEER_MODE=wg` or `ZER0_PEER_MODE=wg`). Default in source is `mock` — mock will not add peers to `wg0`.

## 4. Sysctl + PostUp template

Install scripts write `/etc/sysctl.d/99-routelag-forwarding.conf`:

```conf
net.ipv4.ip_forward=1
net.ipv4.conf.all.rp_filter=2
net.ipv4.conf.default.rp_filter=2
```

Apply: `sudo sysctl --system`

WireGuard `PostUp` should accept forward from `%i` → WAN, established return, MASQUERADE the tunnel subnet, and clamp TCP MSS. Re-run `01-install-node.sh --force` (or edit `/etc/wireguard/wg0.conf` and restart `wg-quick@wg0`) if live config is still the old blanket FORWARD rules.

## 5. Firewall inbound allowlist

Allowed inbound:

- SSH (22/tcp)
- WireGuard (51820/udp)
- API 3001/tcp only if intentionally public (prefer localhost / trusted nets)

Do **not** expose thousands of UDP game ports inbound on the VPS.

## 6. Competitive gate

Until the full-session desktop build passes the tournament test matrix, do not advertise Optimize for competitive/tournament play. Connect the tunnel **before** opening Epic Games Launcher or Fortnite.
