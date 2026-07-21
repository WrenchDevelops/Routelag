# RouteLag Private Beta (full-session integrity)

RouteLag includes RouteLag Engine. Do not install a separate WireGuard app.

**Tournament / competitive testing is paused.** This build uses a full-session
IPv4 tunnel so Epic login, matchmaking, and Fortnite share one VPS exit IP.

## Test Flow

1. Install RouteLag.
2. Open RouteLag as Administrator.
3. Click Restore Internet first.
4. Log in with your beta code.
5. **Close Epic Games Launcher and Fortnite** if they are open.
6. Select a beta route (e.g. Dallas / Ashburn).
7. Start Optimize and wait until Connected (egress IP must match the VPS).
8. Then open Epic / Fortnite for non-competitive integrity tests only.
9. Do not switch servers or reconnect after queueing.
10. End Optimization when finished.
11. Export the RouteLag report ZIP and send it back.

After every test, click End Optimization before switching routes.

If anything feels broken, click Restore Internet. Do not click Repair Windows
Network unless Restore Internet does not fix normal internet.

Live Session shows handshake age, TX/RX, egress IP, DNS, IPv6 leak status, and
route mode. The on-screen ping is a tunnel connectivity check — **not** Fortnite
match RTT.

## Send Back

- Your city
- Your ISP
- Ethernet or Wi-Fi
- Egress IP while Connected (should match the selected VPS)
- Any matchmaking / load failures
- RouteLag report ZIP
- Client WG profile, VPS `wg show`, and one failed-queue log set if something fails
