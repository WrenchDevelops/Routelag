# Zer0 Privacy Data Inventory (Code-Backed)

**Document version:** `2026-07-17.1`  
**As-of:** 2026-07-17  
**Method:** Repository + known infrastructure inspection (desktop, routing server, PathGen, HUD).  
**Rule:** Do **not** claim “not collected” unless confirmed absent in code/infra.

| Data category | Collected? | Purpose | Storage | Retention | Shared with | User control |
|---------------|------------|---------|---------|-----------|-------------|--------------|
| Account identity (name/avatar via Clerk) | **Yes** | Auth UI, support | Clerk; local UI | Clerk policy; `{{DATA_RETENTION_ACCOUNT}}` | Clerk | Clerk account settings; sign out |
| Clerk user ID | **Yes** | Auth, entitlement, PathGen sync, route sessions | Clerk JWT; Supabase `pathgen_users`; route session fields; localStorage | `{{DATA_RETENTION_ACCOUNT}}` | PathGen/Supabase; routing API | Sign out; deletion request to `{{PRIVACY_CONTACT}}` |
| Clerk session ID | **Yes** (in JWT claims when present) | Session validation | Transient / PathGen auth path | Session lifetime | PathGen | Sign out |
| Email | **Yes** (when Clerk provides) | Account sync, invite correlation | Clerk; Supabase; local PathGen session opts | `{{DATA_RETENTION_ACCOUNT}}` | Clerk; PathGen | Clerk email settings; deletion request |
| Public WAN IP | **Yes** (diagnostics lookup; optional in reports, default on) | Diagnostics / support | Local report JSON/ZIP; optional upload to routing `reports` dir | Local until clear; uploads `{{DATA_RETENTION_DIAGNOSTICS}}` | ipify/ifconfig at lookup; support if shared | Uncheck include public IP; don’t export |
| HTTP client IP at API | **Possible** (server access logs; not a dedicated user profile field found) | Ops / abuse | Server logs | `{{DATA_RETENTION_LOGS}}` | Hosting operator | N/A (server-side) |
| Device identifiers | **Yes** (`routelag.deviceId` UUID) | Concurrent session limits, binding | localStorage; `RouteSession.deviceId` | Until storage cleared; sessions `{{DATA_RETENTION_ROUTING}}` | Routing API | Clear site data / reinstall |
| Route session records | **Yes** | Operate tunnels, cleanup, history | VPS JSON DB; Supabase `routing_sessions` | `{{DATA_RETENTION_ROUTING}}` (no automated purge policy found in code) | Routing admins; PathGen cloud | End session; deletion request |
| Selected node | **Yes** | Routing | Session store | `{{DATA_RETENTION_ROUTING}}` | Routing/PathGen | Choose node / disconnect |
| Tunnel IP (WG peer) | **Yes** | Peer config | Session + peers store | Session lifetime / `{{DATA_RETENTION_ROUTING}}` | Node infrastructure | Disconnect |
| Connection times | **Yes** (`createdAt`, heartbeats, `endedAt`) | Lifecycle, expiry | Session store; Supabase | `{{DATA_RETENTION_ROUTING}}` | Routing/PathGen | Disconnect |
| Latency / packet loss | **Yes** | Auto-route scoring, UI, diagnostics | Ephemeral API; local diagnostics; node metrics (ops) | Mostly ephemeral / local; `{{DATA_RETENTION_DIAGNOSTICS}}` if exported | Routing API during test | Don’t run tests / don’t export |
| Application logs | **Yes** (local) | Debug | `%LOCALAPPDATA%\Zer0\logs` (+ legacy paths) | Until clear/uninstall | Support if user shares | Settings → Clear logs |
| Crash reports | **Yes** (local startup crash log); **no** Sentry/Crashlytics found | Debug | Local AppData / temp | Until clear | Support if shared | Delete files / clear logs |
| Replay files | **Yes when feature enabled**; **disabled in Core/Dallas installer builds** | Match analytics | PathGen upload tmp; Osirion processing; Supabase job/stats (parsed) | `{{DATA_RETENTION_REPLAY}}` | Osirion; PathGen | Don’t upload; feature off in Core |
| Replay statistics | **Yes when enabled** | Display analytics | PathGen/Supabase | `{{DATA_RETENTION_REPLAY}}` | PathGen | Delete request; feature off in Core |
| HUD data | **Yes, locally** | Overlay | Localhost bridge `127.0.0.1:17389`; Overwolf localStorage token | Session-local | Local desktop only (current code) | Don’t install/launch HUD |
| Billing data | **Yes** via Clerk Billing | Paid routing entitlement | Clerk; `billing_snapshot` on PathGen users (flags/period, not full PAN) | Clerk + `{{DATA_RETENTION_ACCOUNT}}` | Clerk + processors | Manage in Clerk/Account UI |
| Support communications | **Indirect** (user-mediated) | Support | External support site/email; local exports | Unknown (external) + local | Support staff | Don’t contact / redact exports |
| Invite / tester codes | **Yes** | Beta gate | localStorage; server tester records | Beta period / `{{DATA_RETENTION_ACCOUNT}}` | Routing API | Sign out / clear storage |
| App version | **Yes** | Support, session metadata | Sessions, diagnostics | With session/diagnostics | Routing/PathGen | N/A |

## Explicit non-claims

- **Traffic content inspection/sale:** Product policy forbids inspecting or selling user traffic **content**. Tunnel **metadata** (node, peer IP, timers, measurements) **is** processed.  
- **Tebex:** Not used; billing path is Clerk.  
- **Firebase/Firestore as primary identity store:** Residual Firebase config exists with deny-all rules; primary cloud path is Clerk + Supabase/PathGen.  
- **Hosted Privacy/Terms URLs:** Not confirmed live as of this inventory; drafts live in-repo and bundled for in-app viewing.

## Minor-user flag (unresolved)

This inventory does **not** resolve COPPA/age-gate design. See LEGAL_REVIEW_CHECKLIST.md.
