# Professional Legal-Review Checklist (Zer0 Private Beta)

**Document version:** `2026-07-17.1`  
**Purpose:** Flag issues for a qualified owner/lawyer. **Do not treat drafts as compliance.**

## Status legend

- ☐ Open  
- ☑ Done  

---

## A. Placeholders & identity

- ☐ Fill `{{LEGAL_COMPANY_NAME}}`  
- ☐ Fill `{{COMPANY_ADDRESS}}`  
- ☐ Fill `{{SUPPORT_EMAIL}}` / `{{PRIVACY_CONTACT}}`  
- ☐ Fill `{{GOVERNING_JURISDICTION}}`  
- ☐ Fill `{{EFFECTIVE_DATE}}`  
- ☐ Confirm trade-name vs legal-entity usage (“Zer0”)  

## B. Minors / age (FLAGGED — not independently resolved)

- ☐ Set `{{MINIMUM_AGE}}` with counsel  
- ☐ Parental-consent mechanism if minors may test  
- ☐ Payment-by-minors / guardian billing rules  
- ☐ Replay data from minors (when replay enabled)  
- ☐ IP / device ID treatment for child users  
- ☐ UI age gate vs honor-system acknowledgement  

## C. US state privacy (FLAGGED)

- ☐ CCPA/CPRA “sale”/“share” analysis (esp. diagnostics vendors, Osirion)  
- ☐ Sensitive data categories (precise geolocation inference from IP)  
- ☐ Consumer request workflows (access/delete) beyond manual email  
- ☐ Other state laws if testers reside outside home state  

## D. GDPR / UK GDPR (FLAGGED if international testers)

- ☐ Lawful basis mapping per processing purpose  
- ☐ International transfer mechanism (SCCs, etc.)  
- ☐ DPA with processors (Clerk, host, Supabase, Osirion, Overwolf as applicable)  
- ☐ Retention schedules finalized (`{{DATA_RETENTION_*}}`)  
- ☐ Records of processing activities  

## E. Product-specific disclosures

- ☐ Latency non-guarantee language approved  
- ☐ Unsigned-build warning approved  
- ☐ Restore Internet / network-risk disclosure approved  
- ☐ Epic / Fortnite non-affiliation approved  
- ☐ ExitLag non-affiliation approved  
- ☐ HUD separate/free/optional language approved  
- ☐ Replay-disabled-but-described language approved  
- ☐ No traffic-content inspection/sale commitment reviewed for accuracy vs logging  

## F. Commercial terms

- ☐ `{{REFUND_POLICY}}` for Clerk Billing beta charges  
- ☐ `{{ARBITRATION_OR_DISPUTE_TERMS}}` (or explicit court venue)  
- ☐ Limitation of liability enforceability in `{{GOVERNING_JURISDICTION}}`  
- ☐ Beta confidentiality / redistribution terms  

## G. Security & breach

- ☐ Incident notification commitments  
- ☐ Tester communication channel for security findings  

## H. Publication & product gate

- ☐ Host drafts at support-domain `/legal/*` URLs  
- ☐ Verify in-app links open without paid subscription  
- ☐ Verify first-launch acceptance in **packaged** build  
- ☐ Re-acceptance strategy when `LEGAL_DOCUMENT_VERSION` bumps  
- ☐ Installer links match hosted URLs  

## I. Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Product owner | | | |
| Qualified counsel | | | |
| Engineering (accuracy of inventory) | | | |

**Until A–H are complete and signed off, Prompt 14 remains at most partially resolved.**
