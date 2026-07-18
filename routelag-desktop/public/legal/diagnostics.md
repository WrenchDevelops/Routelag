# Diagnostic and Telemetry Disclosure (Private Beta Draft)

**Document version:** `2026-07-17.1`  
**Effective date:** `{{EFFECTIVE_DATE}}`  
**Operator:** `{{LEGAL_COMPANY_NAME}}`  
**Privacy contact:** `{{PRIVACY_CONTACT}}`

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

Exact inventory: [DATA_INVENTORY.md](./DATA_INVENTORY.md).

## What we do **not** do (product policy)

- Inspect or sell **user traffic content** inside the tunnel  
- Use Tebex  
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
- Uploaded reports: `{{DATA_RETENTION_DIAGNOSTICS}}`  
- Routing sessions: `{{DATA_RETENTION_ROUTING}}`  
- Account records: `{{DATA_RETENTION_ACCOUNT}}`  

## Contact

`{{PRIVACY_CONTACT}}` · `{{SUPPORT_EMAIL}}`
