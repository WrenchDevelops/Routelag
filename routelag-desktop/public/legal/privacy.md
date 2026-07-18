# Zer0 Privacy Policy (Private Beta Draft)

**Document version:** `2026-07-17.1`  
**Effective date:** `{{EFFECTIVE_DATE}}`  
**Operator:** `{{LEGAL_COMPANY_NAME}}` (`{{COMPANY_ADDRESS}}`)  
**Privacy contact:** `{{PRIVACY_CONTACT}}`  
**Support:** `{{SUPPORT_EMAIL}}`

> **Draft notice.** This document is a product-prepared draft for a tightly controlled private beta. It is **not** legal advice and is **not** a certification of GDPR, CCPA, COPPA, or other compliance.

## 1. Who we are

Zer0 is a **Windows desktop application** that provides **paid or authorized game-routing** functionality, currently focused on **Fortnite**. An optional separate **free Overwolf HUD** may be available. Replay parsing may be offered later and is **disabled** in current Core private-beta installer builds.

Zer0 is operated by `{{LEGAL_COMPANY_NAME}}`. Zer0 is **not affiliated with or endorsed by Epic Games** or **ExitLag**.

## 2. Scope

This policy describes information processed when you:

- Install or use the Zer0 Windows app  
- Authenticate (including via Clerk)  
- Create routing / tunnel sessions  
- Export or upload diagnostic reports  
- Optionally use the Overwolf HUD  
- Use replay features **if/when enabled**  
- Contact support  

## 3. Information we process

The following categories reflect **current repository and infrastructure behavior**. See [DATA_INVENTORY.md](./DATA_INVENTORY.md) for code-backed detail. We do **not** claim a category is unused unless confirmed.

### 3.1 Account and identity

- Clerk user identifiers and session identifiers  
- Email address associated with your Clerk account (when provided)  
- Optional linked Discord / Epic identities when you connect them  
- Invite / tester codes used to unlock private-beta access  

**Purpose:** authentication, entitlement, account sync, abuse prevention.  
**Storage:** Clerk; PathGen/Supabase user records; local app storage for session tokens.  
**Retention:** `{{DATA_RETENTION_ACCOUNT}}`.

### 3.2 Device and session identifiers

- Client-generated device ID (local storage)  
- Route session IDs, app version, heartbeat timestamps  

**Purpose:** concurrent-session limits, support, operational integrity.  
**Retention:** `{{DATA_RETENTION_ROUTING}}`.

### 3.3 Network and routing data

- Selected routing node / server  
- Tunnel (WireGuard peer) IP allocated for your session  
- Connection / session start and end times  
- Client-measured latency, jitter, and packet-loss used for route scoring  
- Public WAN IP when included in diagnostics (default include; user can disable for reports)  

**Purpose:** provide routing, score routes, diagnose connectivity, operate nodes.  
**Important:** Zer0 is designed to route game traffic for authorized use. Zer0 **must not inspect or sell the content of user traffic** (payloads inside encrypted tunnels). Technical metadata needed to operate the tunnel may still be processed.

**Retention:** `{{DATA_RETENTION_ROUTING}}`.

### 3.4 Diagnostics, logs, and crash information

- Local application logs under Zer0 AppData paths  
- Optional diagnostic ZIP / report contents (may include public IP, ISP/network hints, ping results, tunnel status)  
- Startup crash logs stored locally  
- Server request logs on routing / PathGen infrastructure (operational)  

**Purpose:** debugging and support during private beta.  
**Retention:** local until cleared/uninstall; uploaded reports `{{DATA_RETENTION_DIAGNOSTICS}}`; logs `{{DATA_RETENTION_LOGS}}`.

### 3.5 Billing

- Subscription / plan status via **Clerk Billing** (not Tebex)  
- Billing snapshot fields synced for entitlement (plan flags / period) — **not** full payment card numbers in Zer0 app databases  

**Purpose:** authorize paid routing features.  
**Shared with:** Clerk and its payment processors under Clerk’s terms.

### 3.6 HUD (optional, free, separate)

- Live Fortnite overlay telemetry (e.g. ping, health, materials) exchanged on **localhost** between Overwolf and the desktop bridge  
- **Not** sent to Zer0 cloud APIs in current code  

**Purpose:** optional overlay only. Subject to Overwolf and Fortnite availability. **Not** a guaranteed part of paid routing.

### 3.7 Replay (disabled in Core beta builds; described before enablement)

When enabled, replay binaries or derived stats may be uploaded to PathGen, processed by a third-party parser (Osirion), and stored as job/stats records.

**Purpose:** match analytics for authorized users.  
**Retention:** `{{DATA_RETENTION_REPLAY}}`.  
**Status:** disabled in shipped Core/Dallas installer builds until PathGen is cleared for live use.

### 3.8 Support communications

- Messages and attachments you send via support contact channels  
- Diagnostic exports you choose to share  

## 4. Legal bases / reasons for processing (high level)

Private-beta processing is primarily to:

- Provide the service you request  
- Authenticate and enforce entitlement  
- Maintain security and prevent abuse  
- Debug and improve reliability with a small trusted tester group  
- Comply with law where applicable  

Formal legal-basis mapping for GDPR/UK GDPR (if international testers join) requires counsel — see LEGAL_REVIEW_CHECKLIST.md.

## 5. Sharing

We may share data with:

| Recipient | Why |
|-----------|-----|
| Clerk | Auth and billing |
| Infrastructure hosts (e.g. VPS, Supabase) | Operate routing / PathGen |
| Osirion | Replay parsing **when replay is enabled** |
| Overwolf | Only insofar as you install/use the HUD on Overwolf’s platform |
| Support operators | When you contact us |
| Professional advisors / authorities | When legally required |

We do **not** sell personal information for advertising. We do **not** sell user traffic content.

## 6. International transfers

Servers and vendors may be located outside your country. Transfer safeguards for GDPR/UK GDPR are **pending professional review** if testers outside the operating jurisdiction participate.

## 7. Retention

See placeholders in §3 and PLACEHOLDERS.md. Exact durations must be set by the owner before hosted publication.

## 8. Your controls

- Sign out / disconnect routing  
- Disable “include public IP” on diagnostic exports  
- Clear local logs / cache in Settings  
- Uninstall the app  
- Contact `{{PRIVACY_CONTACT}}` for access, correction, or deletion requests  

Automated export/delete self-service is **not** fully implemented in the current product; requests are handled manually during private beta.

## 9. Children and minors

Minimum age: `{{MINIMUM_AGE}}`. Zer0 **may be used by minors** in some households. Parental consent, payment-by-minors rules, and child-specific privacy laws require **professional legal review** and are **not** independently resolved by this draft. See LEGAL_REVIEW_CHECKLIST.md.

## 10. Security

We use industry-standard controls appropriate to a small private beta (TLS to APIs where configured, access-limited servers, local tunnel crypto). No method of transmission or storage is 100% secure.

## 11. Changes

We may update this policy. Material changes for beta will bump the **document version**; the app may require re-acknowledgement.

## 12. Contact

Privacy: `{{PRIVACY_CONTACT}}`  
Support: `{{SUPPORT_EMAIL}}`  
Address: `{{COMPANY_ADDRESS}}`  
Governing jurisdiction (for notices): `{{GOVERNING_JURISDICTION}}`
