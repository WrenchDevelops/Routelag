# Windows Client Setup

How to connect your Windows PC to the RouteLag MVP WireGuard tunnel.

## Step 1: Install WireGuard

1. Go to [https://www.wireguard.com/install/](https://www.wireguard.com/install/)
2. Download **WireGuard for Windows**
3. Run the installer and follow the prompts
4. Launch **WireGuard** from the Start menu

## Step 2: Copy the Client Config

From PowerShell or Command Prompt on your PC (not on the VPS):

```bash
scp root@102.211.56.103:/root/routelag-mvp/clients/aiden-pc.conf .
```

Save the file somewhere easy to find, e.g. `C:\Users\YourName\Downloads\aiden-pc.conf`.

## Step 3: Import the Config

1. Open the **WireGuard** app
2. Click **Import tunnel(s) from file** (bottom-left)
3. Select `aiden-pc.conf`
4. The tunnel appears in the list (named after the file, e.g. `aiden-pc`)

## Step 4: Activate the Tunnel

1. Select the tunnel in the list
2. Click **Activate**
3. Status should change to **Active**

If activation fails, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Step 5: Verify Public IP Changed

**Before connecting**, open PowerShell:

```powershell
curl -4 ifconfig.me
```

Note your home IP address.

**With the tunnel active**, run the same command:

```powershell
curl -4 ifconfig.me
```

It should now show `102.211.56.103` (your VPS IP).

You can also visit [https://ifconfig.me](https://ifconfig.me) in a browser.

## Step 6: Test Ping

```powershell
ping 1.1.1.1
```

You should get replies. If ping fails, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Step 7: Test Game Ping

1. Note your in-game ping **without** the tunnel
2. Activate the tunnel
3. Note your in-game ping **with** the tunnel
4. Compare the results

If ping is higher with the tunnel on, the VPS location is likely not helping for that game. This is expected for a single distant VPS.

## Step 8: Disconnect When Not Needed

When you are done gaming or testing:

1. Open WireGuard
2. Click **Deactivate**

Your traffic returns to your normal internet connection immediately.

Only keep the tunnel active when you need it — all traffic routes through the VPS while connected.

## Tips

- WireGuard can be set to start on boot — leave this off unless you always want the tunnel
- The config file contains a private key — do not share it
- Create separate client configs per device with `02-create-client.sh`

## See Also

- [Server setup](SETUP.md)
- [Troubleshooting](TROUBLESHOOTING.md)
