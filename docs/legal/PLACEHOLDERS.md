# Placeholders requiring owner input

**Do not invent** legal identities, addresses, or contact details.  
Replace each `{{PLACEHOLDER}}` in the draft documents before public/hosted publication.

| Placeholder | Meaning | Example format (do not treat as real) |
|-------------|---------|----------------------------------------|
| `{{LEGAL_COMPANY_NAME}}` | Legal entity operating Zer0 | Registered company name |
| `{{COMPANY_ADDRESS}}` | Registered / principal business address | Street, city, region, postal, country |
| `{{SUPPORT_EMAIL}}` | General support contact | support@… |
| `{{PRIVACY_CONTACT}}` | Privacy inquiries contact | privacy@… or same as support |
| `{{GOVERNING_JURISDICTION}}` | Governing law / venue | e.g. State of X, Country Y |
| `{{EFFECTIVE_DATE}}` | Document effective date | YYYY-MM-DD |
| `{{MINIMUM_AGE}}` | Minimum age to use Zer0 / beta | Integer (years) |
| `{{DATA_RETENTION_ACCOUNT}}` | Account / identity retention | e.g. “while account active + N days” |
| `{{DATA_RETENTION_ROUTING}}` | Route session / tunnel metadata retention | Duration or “until deleted” |
| `{{DATA_RETENTION_DIAGNOSTICS}}` | Local / uploaded diagnostic retention | Duration |
| `{{DATA_RETENTION_REPLAY}}` | Replay job / stats retention (when enabled) | Duration |
| `{{DATA_RETENTION_LOGS}}` | Server / app log retention | Duration |
| `{{REFUND_POLICY}}` | Refunds for paid plans during beta | Short policy text |
| `{{ARBITRATION_OR_DISPUTE_TERMS}}` | Arbitration / court / informal dispute | Full clause or “TBD — counsel” |
| `{{BETA_CONFIDENTIALITY_PERIOD}}` | How long beta secrecy lasts | e.g. “until public launch + N days” |

## Owner checklist before hosting

- [ ] Fill every placeholder above  
- [ ] Confirm payment processor name (Clerk Billing; **not** Tebex)  
- [ ] Confirm support domain for hosted URLs  
- [ ] Confirm whether international testers are invited (GDPR/UK GDPR implications)  
- [ ] Confirm minor participation policy  
- [ ] Counsel review (see LEGAL_REVIEW_CHECKLIST.md)  
