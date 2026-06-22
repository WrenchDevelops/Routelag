# Troubleshooting

Common issues and fixes for RouteLag MVP.

## SSH Connection Refused

**Symptoms:** `ssh: connect to host 102.211.56.103 port 22: Connection refused`

**Checks:**

1. VPS is powered on in the Maxko panel
2. Correct IP address
3. Provider firewall allows **TCP 22**
4. SSH service is running (use VNC/console if needed):

   ```bash
   systemctl status ssh
   systemctl restart ssh
   ```

5. UFW allows SSH:

   ```bash
   ufw allow 22/tcp
   ufw allow OpenSSH
   ufw status
   ```

**Recovery:** Use VNC/console access from the Maxko panel. See [SETUP.md](SETUP.md#recovering-if-ssh-breaks).

---

## WireGuard Handshake Not Happening

**Symptoms:** Tunnel shows active on client but no handshake, or "Unable to connect"

**Checks:**

1. **Provider firewall** — UDP 51820 must be open in Maxko panel (not just UFW)
2. **UFW on VPS:**

   ```bash
   ufw status | grep 51820
   ufw allow 51820/udp
   ```

3. **WireGuard service running:**

   ```bash
   systemctl status wg-quick@wg0
   sudo ./scripts/03-status.sh
   ```

4. **Correct endpoint** in client config — should be `102.211.56.103:51820`
5. **Server public key** in client config matches server:

   ```bash
   cat /etc/wireguard/server_public.key
   ```

6. **Client peer registered** on server:

   ```bash
   wg show wg0
   ```

---

## UDP 51820 Blocked

**Symptoms:** Handshake never completes, client times out

**Fix:**

1. Maxko panel → firewall → add inbound **UDP 51820**
2. On VPS:

   ```bash
   ufw allow 51820/udp comment 'WireGuard'
   ```

3. Test from another machine (if `nc` is available):

   ```bash
   nc -u -v 102.211.56.103 51820
   ```

Some networks (school, corporate, public WiFi) block UDP. Try from a different network or mobile hotspot.

---

## WireGuard Connects But No Internet

**Symptoms:** Handshake succeeds, but websites do not load and ping fails

**Checks:**

1. **IP forwarding enabled:**

   ```bash
   sysctl net.ipv4.ip_forward
   # Should output: net.ipv4.ip_forward = 1
   ```

   If `0`:

   ```bash
   sudo ./scripts/01-install-server.sh
   ```

2. **NAT masquerade rules exist:**

   ```bash
   iptables -t nat -L POSTROUTING -n -v | grep MASQUERADE
   ```

   If missing, restart WireGuard:

   ```bash
   systemctl restart wg-quick@wg0
   ```

3. **Wrong default interface** — if your VPS uses something other than `eth0` (e.g. `ens3`):

   ```bash
   ip route get 1.1.1.1
   ```

   If the interface differs from what's in `/etc/wireguard/wg0.conf` PostUp/PostDown rules, regenerate config:

   ```bash
   sudo ./scripts/01-install-server.sh --force
   sudo ./scripts/02-create-client.sh <client-name>   # re-create client if needed
   ```

4. **UFW blocking forwarded traffic:**

   ```bash
   # Check /etc/ufw/sysctl.conf has:
   # net.ipv4.ip_forward=1

   # Edit DEFAULT_FORWARD_POLICY in /etc/default/ufw to ACCEPT if needed:
   DEFAULT_FORWARD_POLICY="ACCEPT"
   ```

   Then:

   ```bash
   ufw reload
   systemctl restart wg-quick@wg0
   ```

---

## UFW Blocking Traffic

**Symptoms:** SSH works but WireGuard or forwarded traffic fails

**Never run:**

```bash
ufw reset    # Dangerous — can remove SSH access
iptables -F  # Dangerous — flushes all rules
```

**Safe fixes:**

```bash
ufw allow OpenSSH
ufw allow 22/tcp
ufw allow 51820/udp
ufw status numbered
```

---

## DNS Not Working

**Symptoms:** IP-based tests work (`ping 1.1.1.1`) but domain names fail

**Fix:**

1. Confirm client config has:

   ```ini
   DNS = 1.1.1.1
   ```

2. Re-import the config or edit in the WireGuard app
3. On Windows, try `ipconfig /flushdns` after connecting
4. On Mac, try `sudo dscacheutil -flushcache`

---

## Wrong Default Interface

**Symptoms:** Handshake works, partial connectivity, NAT rules point to wrong interface

**Diagnose:**

```bash
ip route get 1.1.1.1
# Look for "dev eth0" or "dev ens3" etc.
grep PostUp /etc/wireguard/wg0.conf
```

**Fix:** Regenerate server config with correct interface:

```bash
sudo ./scripts/01-install-server.sh --force
```

Re-add clients with `02-create-client.sh` if peer entries were lost.

---

## Ping Gets Worse

**Symptoms:** In-game or `ping` latency is higher with tunnel on

**This is expected** when:

- The VPS is far from you (extra hop to tunnel)
- The VPS is far from game servers (traffic routes through a distant location)
- Your direct route to game servers was already optimal

**What to do:**

1. Test with tunnel **off** — note ping
2. Test with tunnel **on** — compare
3. If worse, disconnect when gaming — this MVP is for learning, not production lag reduction

A VPS in a different continent from game servers will almost always add latency.

---

## Restart WireGuard

```bash
systemctl restart wg-quick@wg0
```

Check status after restart:

```bash
sudo ./scripts/03-status.sh
```

---

## Check Logs

```bash
journalctl -u wg-quick@wg0 -n 100 --no-pager
```

Look for errors related to:

- `iptables` / permission denied
- Invalid key format
- Address already in use (port 51820 conflict)

---

## Client Config Already Exists

**Symptoms:** `02-create-client.sh` fails with "already exists"

**Fix:** Use a different client name, or remove the old config on the server:

```bash
rm clients/old-name.conf
# Also remove the [Peer] block from /etc/wireguard/wg0.conf manually
systemctl restart wg-quick@wg0
```

---

## Reinstall from Scratch

```bash
sudo ./scripts/04-uninstall.sh
sudo ./scripts/01-install-server.sh
sudo ./scripts/02-create-client.sh aiden-pc
```

Copy the new client config to your PC and re-import.

---

## Still Stuck?

Run the full diagnostic and share output:

```bash
sudo ./scripts/00-check-server.sh
sudo ./scripts/03-status.sh
```

Check:

- Maxko panel: VPS on, UDP 51820 open, VNC available
- Client config endpoint and keys are current
- You are testing from a network that allows UDP VPN traffic
