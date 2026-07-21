# Routing and Network Risk Disclosure

**Document version:** `2026-07-18.1`  
**Effective date:** `2026-07-18`  
**Operator:** WrenchDevelops

> **Read carefully before enabling Zer0 routing.**

## What routing does

Zer0 can create a system network route / tunnel (WireGuard-based engine) so selected game traffic is sent via Zer0 nodes. This changes how your PC reaches the internet for those destinations.

## No latency guarantee

Zer0 does **not** guarantee:

- Lower ping than your normal connection  
- Stable improvement every session  
- Better Fortnite matchmaking or competitive results  

Measured latency can be better, worse, or unchanged depending on ISP, region, node load, Wi-Fi, and Epic infrastructure.

## Risks you accept

1. **Connectivity loss** — misconfigured routes, crashes, force-kill, sleep/wake, or reboot can leave you unable to reach the internet until cleanup  
2. **Game / login issues** — VPN-like routing can occasionally break Epic login, party, or voice  
3. **Conflicts** — other VPN/tunnel software (including WireGuard managers) may conflict  
4. **Security surface** — traffic metadata and tunnel endpoints are visible to Zer0 operators; encrypted tunnel contents are not sold or inspected as product policy  
5. **Beta instability** — nodes may restart; entitlement or API outages can end sessions  

## Restore Internet / emergency recovery

Before testing, know how to recover:

1. Use in-app **Restore Internet** (Help Center / quick tools)  
2. If the app will not start, use the Emergency Cleanup steps in the Zer0 Help Center / beta materials (keep an offline copy for beta machines)  
3. Contact support through the Zer0 Help Center if recovery fails  

## Administrator permission

Zer0 may require administrator permission to control the routing engine. Granting admin rights increases system impact; only install builds received from the Zer0 team.

## Unsigned builds

Private-beta installers may be **Authenticode-unsigned**. SmartScreen warnings can be expected. Do not run builds from untrusted sources.

## Fortnite / anti-cheat

Zer0 is designed **not** to modify Fortnite, inject into Fortnite, or interact with anti-cheat. Network routing alone can still be treated differently by publishers; compliance with Epic rules remains your responsibility. See also the third-party disclaimer.
