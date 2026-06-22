# Mac Client Setup

How to connect your Mac to the RouteLag MVP WireGuard tunnel.

## Step 1: Install WireGuard

Option A — **Mac App Store** (recommended):

1. Open the App Store
2. Search for **WireGuard**
3. Install the app by WireGuard Development Team

Option B — **Official website**:

1. Go to [https://www.wireguard.com/install/](https://www.wireguard.com/install/)
2. Download the macOS version
3. Open the `.dmg` and drag WireGuard to Applications

## Step 2: Copy the Client Config

From Terminal on your Mac:

```bash
scp root@102.211.56.103:/root/routelag-mvp/clients/aiden-pc.conf ~/Downloads/
```

## Step 3: Import the Config

1. Open **WireGuard** from Applications
2. Click **Import Tunnel(s) from File** in the menu bar, or press `⌘O`
3. Select `aiden-pc.conf` from Downloads
4. Alternatively, drag and drop the `.conf` file onto the WireGuard window

The tunnel appears in the sidebar.

## Step 4: Activate the Tunnel

1. Select the tunnel in the sidebar
2. Click **Activate**, or toggle the switch
3. macOS may ask for permission to add VPN configurations — click **Allow**

Status should show as active with a recent handshake time.

## Step 5: Verify Public IP Changed

**Before connecting:**

```bash
curl -4 ifconfig.me
```

Note your home IP.

**With the tunnel active:**

```bash
curl -4 ifconfig.me
```

It should show `102.211.56.103`.

You can also visit [https://ifconfig.me](https://ifconfig.me) in Safari or Chrome.

## Step 6: Test Ping

```bash
ping -c 4 1.1.1.1
```

You should get replies. If not, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Step 7: Test Game Ping

1. Check in-game latency with the tunnel **off**
2. Activate the tunnel
3. Check in-game latency with the tunnel **on**
4. Compare results

A distant VPS often increases ping to U.S. game servers. That is normal for this MVP.

## Step 8: Disconnect When Not Needed

1. Open WireGuard from the menu bar or Applications
2. Click **Deactivate**

Traffic returns to your normal connection immediately.

## Tips

- The config file contains a private key — keep it secure and do not commit it to git
- Create one client config per device using `02-create-client.sh` on the server
- WireGuard runs efficiently on macOS with minimal battery impact, but disconnect when not in use

## See Also

- [Server setup](SETUP.md)
- [Troubleshooting](TROUBLESHOOTING.md)
