# Zer0 Private Beta — Legal & Disclosure Pack

**Status:** Private-beta documents filled for Zer0 / WrenchDevelops (counsel review still recommended before public launch).  
**Document version:** `2026-07-18.1`  
**Scope:** Windows desktop Zer0 app (paid/authorized game routing), optional free Overwolf HUD, future replay parsing.  
**Operator:** WrenchDevelops · Effective `2026-07-18`

## Documents in this pack

| File | Purpose |
|------|---------|
| [PRIVACY_POLICY.md](./PRIVACY_POLICY.md) | What data is collected and why |
| [TERMS_OF_SERVICE.md](./TERMS_OF_SERVICE.md) | Use of Zer0 during private beta |
| [ACCEPTABLE_USE_POLICY.md](./ACCEPTABLE_USE_POLICY.md) | Prohibited uses |
| [PRIVATE_BETA_TESTER_AGREEMENT.md](./PRIVATE_BETA_TESTER_AGREEMENT.md) | Tester obligations & NDA-style limits |
| [ROUTING_AND_NETWORK_RISK_DISCLOSURE.md](./ROUTING_AND_NETWORK_RISK_DISCLOSURE.md) | Tunnel / routing risks & Restore Internet |
| [DIAGNOSTIC_AND_TELEMETRY_DISCLOSURE.md](./DIAGNOSTIC_AND_TELEMETRY_DISCLOSURE.md) | Logs, diagnostics, optional public IP |
| [FORTNITE_AND_THIRD_PARTY_DISCLAIMER.md](./FORTNITE_AND_THIRD_PARTY_DISCLAIMER.md) | Epic / ExitLag / Overwolf disclaimers |
| [DATA_INVENTORY.md](./DATA_INVENTORY.md) | Code-backed privacy inventory |
| [LEGAL_REVIEW_CHECKLIST.md](./LEGAL_REVIEW_CHECKLIST.md) | Professional legal-review checklist |
| [PLACEHOLDERS.md](./PLACEHOLDERS.md) | Owner-filled fields (do not invent) |

## Intended public URL paths (hosting pending)

When the support site is updated, publish mirrors at:

- `{SUPPORT_BASE}/legal/privacy`
- `{SUPPORT_BASE}/legal/terms`
- `{SUPPORT_BASE}/legal/acceptable-use`
- `{SUPPORT_BASE}/legal/beta-tester-agreement`
- `{SUPPORT_BASE}/legal/routing-risk`
- `{SUPPORT_BASE}/legal/diagnostics`
- `{SUPPORT_BASE}/legal/disclaimers`

Until hosted, the desktop app serves the same drafts from bundled `/legal/*.md` (in-app viewer). Legal documents must remain readable **without** a paid subscription.

## Application integration

- First-launch consent gate (desktop)
- Links in Settings → About, Account, Help Center, Login
- Installer Welcome acknowledgements + links
- Stored locally: document version, acceptance timestamp, optional Clerk user ID, app version

## Completion gate (Prompt 14)

Remains **partially resolved** until:

1. All placeholders in [PLACEHOLDERS.md](./PLACEHOLDERS.md) are filled by the owner  
2. A qualified owner or lawyer reviews the documents  
3. Hosted document URLs exist on the support domain  
4. First-launch acceptance is verified in a packaged build  
