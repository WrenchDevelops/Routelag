# RouteLag — Server Client Management

Guide for VPS operators managing WireGuard beta testers on the RouteLag server.

## One config per tester

Create a **unique** WireGuard config for each beta tester:

```bash
sudo ./scripts/02-create-client.sh tester-name
```

Example:

```bash
sudo ./scripts/02-create-client.sh aiden-pc
sudo ./scripts/02-create-client.sh jane-laptop
```

Each config gets:

- A unique private/public keypair
- A dedicated tunnel IP in `10.66.66.0/24`
- Its own `[Peer]` block in `/etc/wireguard/wg0.conf`

Send each tester **only their own** `.conf` file. Never reuse or share one config between multiple testers.

## Why one config per tester

- You can revoke one tester without affecting others
- Handshakes and transfer stats map to a single peer
- Leaked configs can be revoked individually
- Diagnostics reports identify which config was used

## List clients and check handshakes

```bash
sudo ./scripts/03-status.sh
```

Or directly:

```bash
sudo wg show wg0
```

Look for each peer's **latest handshake**:

- Recent seconds/minutes → peer is connected
- Hours/days ago → peer is disconnected or offline
- No handshake line → peer has never connected

## Revoke a tester manually

1. SSH to the server as root.
2. Back up the server config:

   ```bash
   cp /etc/wireguard/wg0.conf /etc/wireguard/wg0.conf.bak.$(date +%Y%m%d)
   ```

3. Edit `/etc/wireguard/wg0.conf` and remove the entire `[Peer]` block for that tester (including the `# client-name` comment and `PublicKey` / `AllowedIPs` lines).
4. Apply the change **without restarting** (preferred):

   ```bash
   wg syncconf wg0 <(wg-quick strip wg0)
   ```

   Or restart the service (brief disconnect for all peers):

   ```bash
   systemctl restart wg-quick@wg0
   ```

5. Verify the peer is gone:

   ```bash
   wg show wg0
   ```

6. Optionally delete the client config file:

   ```bash
   rm /root/routelag-mvp/clients/tester-name.conf
   ```

The revoked tester can no longer connect. Their old `.conf` file will not work even if they still have a copy.

## Restart WireGuard safely

**Preferred (no full restart):** apply config changes with `wg syncconf` as shown above.

**Full restart** (disconnects all peers briefly):

```bash
systemctl restart wg-quick@wg0
sleep 2
systemctl status wg-quick@wg0 --no-pager
wg show wg0
```

Peers reconnect automatically when testers click Connect in RouteLag Beta (or activate the tunnel in the WireGuard app).

## Create a replacement config

If a tester needs a new config after revocation:

```bash
sudo ./scripts/02-create-client.sh tester-name-v2
```

Use a new name if the old client file still exists.

## Security reminders

- Never commit `.conf` files or private keys to git
- Transfer configs over SCP/SFTP, not public chat
- Revoke immediately if a config is shared publicly
- One tester = one peer = one config

See also: [SETUP.md](SETUP.md) · [WINDOWS-CLIENT.md](WINDOWS-CLIENT.md)
