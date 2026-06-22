# Server Setup Guide

Step-by-step instructions for setting up RouteLag MVP on your Ubuntu 24.04 VPS.

## Before You Start

### Maxko Panel Checklist

Log into your Maxko VPS panel and verify:

- [ ] VPS is **powered on**
- [ ] **Ubuntu 24.04** is installed
- [ ] **UDP port 51820** is allowed in the provider firewall / security group
- [ ] **VNC or console access** is available (recovery if SSH breaks)
- [ ] **Reinstall OS** option is available (last-resort recovery)

### What You Need

- VPS IP: `102.211.56.103`
- SSH user: `root`
- SSH client on your local machine (Terminal on Mac, PowerShell or PuTTY on Windows)

Do **not** store your SSH password in this repository.

## Step 1: Connect to the VPS

```bash
ssh root@102.211.56.103
```

## Step 2: Get the Repo onto the VPS

Option A — if you have the files locally, copy them with `scp`:

```bash
# Run from your local machine
scp -r routelag-mvp root@102.211.56.103:/root/routelag-mvp
```

Option B — create the directory and upload files manually via SFTP or paste content.

```bash
# On the VPS
mkdir -p /root/routelag-mvp
cd /root/routelag-mvp
```

## Step 3: Make Scripts Executable

```bash
cd /root/routelag-mvp
chmod +x scripts/*.sh
```

## Step 4: Run Pre-Flight Check

```bash
sudo ./scripts/00-check-server.sh
```

Review the output:

- Ubuntu version should be 24.04
- Public IP should match your VPS IP
- Default interface is usually `eth0` (note it for troubleshooting)
- UDP 51820 will not be listening yet — that is normal before install

## Step 5: Install WireGuard Server

```bash
sudo ./scripts/01-install-server.sh
```

This script:

1. Installs WireGuard, UFW, and diagnostic tools
2. Generates server keys
3. Creates `/etc/wireguard/wg0.conf`
4. Enables IP forwarding and NAT
5. Configures UFW (SSH first, then WireGuard)
6. Starts `wg-quick@wg0`

At the end, note the **server public key** and **endpoint** printed on screen.

### Re-running the install script

Safe to re-run. If WireGuard is already active, the script skips config regeneration unless you pass `--force`:

```bash
sudo ./scripts/01-install-server.sh --force
```

`--force` regenerates the server config and may remove existing peer entries.

## Step 6: Open UDP 51820 in Provider Firewall

Even if UFW allows the port, your **hosting provider** may block it separately.

In the Maxko panel:

1. Find firewall / security group settings
2. Add an inbound rule: **UDP 51820** from **any** (or your home IP for tighter security)
3. Save and apply

## Step 7: Create a Client

```bash
sudo ./scripts/02-create-client.sh aiden-pc
```

Replace `aiden-pc` with any name (letters, numbers, hyphens).

The config is saved to `clients/aiden-pc.conf`.

## Step 8: Check Status

```bash
sudo ./scripts/03-status.sh
```

Confirm:

- `wg-quick@wg0` is active
- UFW shows rules for SSH (22) and WireGuard (51820)
- IP forwarding is enabled

## Step 9: Copy Config to Your PC

From your **local** machine:

```bash
scp root@102.211.56.103:/root/routelag-mvp/clients/aiden-pc.conf .
```

Then follow [WINDOWS-CLIENT.md](WINDOWS-CLIENT.md) or [MAC-CLIENT.md](MAC-CLIENT.md).

## Rebooting Safely

After installation, a reboot is safe. WireGuard starts automatically on boot.

```bash
sudo reboot
```

Wait 1–2 minutes, then reconnect:

```bash
ssh root@102.211.56.103
sudo ./scripts/03-status.sh
```

## Recovering If SSH Breaks

If you cannot SSH after running a script:

### Option 1: VNC / Console Access

1. Open VNC or serial console in the Maxko panel
2. Log in as `root`
3. Check UFW:

   ```bash
   ufw status
   ufw allow 22/tcp
   ufw allow OpenSSH
   ```

4. Check SSH service:

   ```bash
   systemctl status ssh
   systemctl restart ssh
   ```

### Option 2: Provider Firewall

Ensure TCP port 22 is open in the Maxko panel firewall, not just UFW.

### Option 3: Reinstall OS

As a last resort, reinstall Ubuntu 24.04 from the Maxko panel and start over. This wipes the VPS.

## Uninstall

To remove WireGuard server configuration without uninstalling packages:

```bash
sudo ./scripts/04-uninstall.sh
```

## Next Steps

- [Server client management](SERVER-CLIENT-MANAGEMENT.md) — create, revoke, and monitor beta testers
- [Windows client setup](WINDOWS-CLIENT.md)
- [Mac client setup](MAC-CLIENT.md)
- [Troubleshooting](TROUBLESHOOTING.md)
