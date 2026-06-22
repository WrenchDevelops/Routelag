# RouteLag Beta — Tester Guide

Welcome to the RouteLag Beta desktop app. This guide walks you through setup, testing, and reporting results.

## Before You Start

You need:

- A Windows PC
- [WireGuard for Windows](https://www.wireguard.com/install/) installed
- Your personal `.conf` file from the RouteLag team
- RouteLag Beta installer (`.exe`)

## Step 1: Install Prerequisites

1. Install **WireGuard for Windows** from [wireguard.com/install](https://www.wireguard.com/install/)
2. Install **RouteLag Beta** from the provided installer
3. Launch RouteLag Beta — it opens in **normal mode** (no admin required)

## Step 2: Get Your Config File

If you do not have a config yet, the server admin creates one:

```bash
sudo ./scripts/02-create-client.sh your-pc-name
```

Copy it to your PC:

```powershell
scp root@102.211.56.103:/root/routelag-mvp/clients/your-pc-name.conf .
```

**Keep this file private.** It contains your WireGuard private key.

## Step 3: Import Config

1. Open RouteLag Beta
2. Go to **Settings**
3. Click **Import config file**
4. Select your `.conf` file

You should see a redacted preview (private key hidden).

## Step 4: Note Your Baseline

1. Go to **Connect**
2. Make sure you are **Disconnected**
3. Note **Public IP (before tunnel)** and the baseline ping

## Step 5: Connect

1. Click **Connect**
2. If you see the administrator modal, click **Restart as Administrator**
3. Approve the Windows UAC prompt — the app relaunches in **admin mode**
4. Click **Connect** again

Expected results when connected:

- Status shows **Connected**
- **Public IP (after tunnel)** shows the VPS IP (e.g. `102.211.56.103`)
- Ping test runs through the tunnel

## Step 6: Run Route Tests

### Normal route (tunnel off)

1. **Disconnect** first
2. Go to **Route Test**
3. Click **Test Normal Route**

### RouteLag route (tunnel on)

1. **Connect** first
2. Click **Test RouteLag Route**

Compare average ping, packet loss, and jitter. Results are saved automatically.

## Step 7: Test In-Game (Fortnite)

RouteLag Beta does **not** touch the Fortnite process. You are only changing your system network route.

1. Note in-game ping **without** RouteLag
2. Connect RouteLag
3. Note in-game ping **with** RouteLag
4. Compare

If ping is higher with RouteLag on, the beta server location may not help for your region. That is useful feedback.

### If Epic shows VPN / login errors

1. **Disconnect** RouteLag
2. Retry Fortnite
3. If it still fails, fully quit RouteLag Beta

## Step 8: Run Full Diagnostics (Recommended)

1. Go to **Diagnostics**
2. Choose whether to include your public IP
3. Click **Run Full Diagnostics**
4. If connected, allow a temporary disconnect for the normal-route phase
5. Review **Route Score** and **Recommendation**
6. Click **Copy Report** or **Download Report ZIP** and send to the RouteLag team

Reports never include private keys.

## Step 10: Disconnect When Done

Always disconnect when you are finished:

1. Go to **Connect**
2. Click **Disconnect**

All traffic returns to your normal connection immediately.

If your internet is stuck after connecting, use **Emergency Cleanup** in Settings. See [Emergency Cleanup](EMERGENCY-CLEANUP.md).

## Tester Profile

On the **Diagnostics** page, fill in your tester profile (name, Discord, location, ISP, Fortnite pings, etc.). It is saved locally and included when you export a diagnostics report.

Reset app clears config and test results but **keeps** your tester profile.

## Submit Feedback and Logs

When reporting issues, include:

1. What you were doing (connect, route test, gaming)
2. Screenshot of the Connect screen (status + IPs)
3. Copied logs from **Logs → Copy logs**

Send to your RouteLag beta contact.

## What We Are Testing

- Does import + connect + disconnect work reliably?
- Does your public IP change when connected?
- How does ping compare: normal vs RouteLag route?
- Any Epic/Fortnite login or VPN warnings?
- Any WireGuard or admin permission issues?

Thank you for testing RouteLag Beta.
