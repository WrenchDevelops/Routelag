# Diagnostic and Telemetry Disclosure

**Document version:** `2026-07-18.1`  
**Effective date:** `2026-07-18`  
**Operator:** WrenchDevelops  
**Privacy contact:** Zer0 in-app Help Center (mark as privacy)

## Why we collect technical data

During private beta, Zer0 collects **technical routing and diagnostic information** to operate nodes, enforce entitlement, debug failures, and support testers.

## What is collected (high level)

| Category | Examples | Default |
|----------|----------|---------|
| Account | Clerk user id, email (if present) | Required for signed-in features |
| Device | Local device UUID | Created on first use |
| Routing | Node id, tunnel IP, session times, app version | When you start a route |
| Performance | Latency / loss measurements for scoring | When testing/auto-routing |
| Diagnostics | Logs, ping results, tunnel status, optional **public IP** | Local; shared only if you export/upload |
| Crash | Local startup crash log | Local |
| HUD | Live game overlay stats | Localhost only in current code |
| Replay | Files/stats via PathGen/Osirion | **Feature disabled** in Core beta builds |
| Billing | Plan/entitlement snapshot via Clerk | When subscribed / checked |

## What we do **not** do (product policy)

- Inspect or sell **user traffic content** inside the tunnel  
- Require a paid subscription to read legal documents  

## Your choices

- Decline first-launch legal acceptance → do not use Zer0  
- Toggle **include public IP** off before generating diagnostic reports  
- Clear local logs/cache in Settings  
- Disconnect routing / sign out  
- Uninstall  

## Support uploads

Diagnostic upload endpoints may exist for authorized testers. Desktop may primarily rely on **local export** plus manual support contact. Only share reports with the Zer0 team; they can contain network identifiers.

## Retention

- Local diagnostics/logs: until you clear them or uninstall  
- Uploaded reports: up to 90 days  
- Routing sessions: up to 90 days after session end  
- Account records: while your account remains active, then up to 90 days after a deletion request  

## Contact

Zer0 in-app Help Center (privacy or support)
