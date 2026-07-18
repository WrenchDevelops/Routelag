# Zer0 Full Product and Pre-Launch Audit

**Date:** 2026-07-17  
**Product:** Zer0 (formerly RouteLag)  
**Repository:** `c:\Users\bende\OneDrive\Desktop\Lunery\Routelag\Routelag` (`github.com/WrenchDevelops/Routelag`)  
**Auditor mode:** Read-only technical audit (no deploys, no live billing charges, no credential rotation, no store submissions)

**Scope note:** This audit separates **source-code readiness** from **real-world infrastructure readiness**. Claims marked “verified” were exercised in this session. Claims marked “not verified” were inspected in code/docs only.

---

## A. Executive summary

| Gate | Readiness (weighted) | Verdict |
|------|----------------------|---------|
| Overall | **~38%** | Not launchable |
| Private beta | **~32%** | Fails private-beta minimum gate |
| Public beta | **~15%** | Not ready |
| Production | **~8%** | Not ready |

**Highest-risk systems**

1. Windows routing tunnel lifecycle (crash/exit leave WireGuard tunnel services running)
2. PathGen identity spoofing (`clerkUserId` / email trusted without Clerk JWT verification)
3. Paid-routing entitlement not enforced on the VPS API (invite JWT only)
4. Free HUD product rule vs Pro UI paywall
5. Missing VPS monitoring / capacity / emergency kill-switch
6. Incomplete RouteLag → Zer0 identity migration (exe/registry/AppData still RouteLag)

**Major launch blockers**

- App crash / close does **not** tear down the tunnel; recovery is manual “Restore Internet”
- PathGen `/api/auth/login` accepts any `user_*` or email-shaped body → replay IDOR risk
- `/api/routes/create` does not verify Clerk Pro / `unlimited_routing`
- Product definition requires free Overwolf HUD; desktop UI gates HUD behind Pro (`UpgradeGate`)
- No Privacy Policy / Terms of Service
- No in-app updater; default builds unsigned
- No production monitoring/alerting for Dallas/Ashburn
- Clean Windows install + real Fortnite E2E routing **not verified in this audit**
- Rebrand incomplete across installer binaries, domains, HUD package, and docs

**Recommended launch scope (smallest safe private beta)**

Invite-only **internal** testers only (staff / trusted), **Core Dallas routing build** with:

- HUD and Replay **compiled out** (`VITE_ROUTELAG_ENABLE_HUD=false`, `VITE_ROUTELAG_ENABLE_REPLAY=false`)
- Explicit unsigned-build warning
- Mandatory Restore Internet training + emergency cleanup doc
- Hard invite-code rotation; PathGen public login spoof path fixed **before** any non-staff tester
- Cap: ≤5 concurrent users, Dallas node only, Ashburn disabled until SSH provisioning is validated
- No paid checkout; no marketing claims of lower ping

**Final verdict:** **Ready for internal testing only**  
(See section M.)

---

## B. System status table

| System | Status | Evidence | Missing work | Risk | Launch blocker |
|--------|--------|----------|--------------|------|----------------|
| Desktop app (Tauri Zer0) | Partially complete | `routelag-desktop` v0.2.1, `productName: Zer0`, `com.zer0.app`, 1280×720 | Clean-install launch not tested this session; CSP null; RouteLag strings remain | Medium | Soft (internal OK) |
| Branding / rebrand | Partially complete | UI + dual-path identity (exe/registry/AppData/env); domains/HUD package/engine still RouteLag | See `docs/ZER0_REBRAND_MIGRATION.md`; Windows E2E | Medium | Soft |
| Routing engine (local) | Complete but not externally verified | `tunnel.rs`, `route_lag_engine.rs`, engine binaries under `engine/windows/` | Crash auto-cleanup; exit disconnect | **High** | **Yes** |
| Dallas VPS API | Complete but not externally verified | Live `GET http://216.152.154.137:3001/health` → `peerMode:"wg"`, `dallas-beta` online | Monitoring, capacity policy, Fortnite E2E | High | Yes (E2E + safety) |
| Ashburn VPS | Partially complete | Catalog online via Dallas health; endpoint `66.163.122.222:51820`; SSH provisioner | Direct API not exposed; SSH E2E not verified | High | Soft (disable for first beta) |
| Peer provisioning | Complete but not externally verified | `peerManager.ts`; tests mock-only (`ROUTELAG_PEER_MODE=mock` in tests) | Real WG peer create/end under load | High | Yes for non-staff |
| Crash / route cleanup | Implemented but unsafe | `cleanup.rs` Restore Internet works in code; `exit_app` / panic do **not** disconnect | Auto-teardown on exit/crash/reboot | **Critical** | **Yes** |
| Auth (Clerk desktop) | Partially complete | `@clerk/react`, LoginPage | Unify Clerk ↔ route token | Medium | Soft |
| Auth (routing VPS) | Partially complete | Invite HMAC JWT; protects `/api/routes/*` | No paid entitlement check | **High** | **Yes** for paid product |
| Auth (PathGen) | Implemented but unsafe | `pathgen-server/src/app.ts` `isInviteAllowed` trusts `user_*` / email | Verify Clerk JWT server-side | **Critical** | **Yes** if PathGen exposed |
| Billing (Clerk) | Partially complete | `billing.ts` plan `pro`, features routing/replays/hud | Server enforcement; test checkout matrix | High | Yes for paid beta |
| Entitlement enforcement | Missing (server) | Client `UpgradeGate` only; `hasUnlimitedRouting` unused on connect | Server-side checks | **Critical** | **Yes** |
| Replay / PathGen | Partially complete | Osirion pipeline; 15/15 pathgen tests pass; Railway health 200 | Auth fix; accuracy limits; Pro vs free model | High | Soft if disabled |
| Overwolf companion | Partially complete / Blocked by external approval | `overwolf-companion/` unpacked WebApp; still RouteLag-named | Store approval; rebrand; free policy | High | Soft (not in Core beta) |
| HUD runtime (ow-electron) | Partially complete | `routelag-hud` packages `RouteLagHUD`; unsigned | Free access; rebrand; standalone QA | High | Soft |
| HUD Pro paywall | Implemented but unsafe (vs product definition) | `App.tsx` UpgradeGate `hasHud` | Remove paid requirement for HUD | High | **Yes** vs product rules |
| Installer | Partially complete | Custom Tauri installer; outputs Zer0 Setup names; still installs `RouteLag.exe` | Signing; migration; manifest URL | Medium | Soft |
| Auto-updater | Missing | No Tauri updater plugin | Signed update channel | Medium | Soft for private; Yes for public |
| Privacy / ToS | Missing | Only `BETA_DISCLAIMER` / `PRIVACY_WARNING` constants | Legal pages + consent | High | **Yes** before external users |
| Monitoring / alerts | Missing | No Sentry/Datadog/status page found | Node health alerts, on-call | High | **Yes** for private beta gate |
| CI/CD | Missing | No project GitHub Actions | Build/test/sign pipeline | Medium | Soft |
| Automated tests | Partially complete | Server 19/19 pass; PathGen 15/15 pass; no desktop E2E | Routing E2E, installer, billing | High | Soft |
| Docs / support | Partially complete | Ops docs exist; still RouteLag-heavy | Zer0 rebrand docs; status; support SLA | Medium | Soft |
| Firebase residual | Unknown / unused for primary auth | `.firebaserc` project `lunory-61a2a`; deny-all rules | Confirm decommission or document | Low | No |
| Secrets hygiene | Partially complete | `.env` gitignored; local secrets present | Remove desktop `CLERK_SECRET_KEY`; rotate invites; redact `/health` | High | Soft/Yes if exposed |

---

## C. Critical launch blockers

### C1. Tunnel not torn down on crash or exit
- **Severity:** Critical  
- **User impact:** Broken DNS/routes, Fortnite connectivity issues, “internet broken” support load  
- **Technical impact:** `WireGuardTunnel$routelag-engine` can remain installed/running; VPS peer may remain  
- **Files:** `routelag-desktop/src-tauri/src/lib.rs` (`exit_app`), `startup.rs` (panic hook logs only), `cleanup.rs`, `App.tsx` close confirm  
- **Required fix:** On exit/crash/boot, detect and uninstall tunnel service; optional Windows service watchdog; server-side peer TTL  
- **Required test:** Kill process mid-session; reboot with tunnel active; verify routes/DNS restored  
- **Owner:** Desktop routing + VPS peer manager  
- **Complexity:** Large  

### C2. PathGen identity spoofing / replay IDOR
- **Severity:** Critical  
- **User impact:** Attacker can access another user’s replay history / cloud profile namespace  
- **Technical impact:** JWT minted for spoofed `testerId` from client-supplied `clerkUserId`  
- **Files:** `pathgen-server/src/app.ts` (`isInviteAllowed` lines ~236–251), `auth.ts`  
- **Required fix:** Verify Clerk session JWT (JWKS); reject body `clerkUserId` / raw email trust; rotate `PATHGEN_AUTH_SECRET`  
- **Required test:** Attempt login with victim `user_…` without valid Clerk token → 401  
- **Owner:** PathGen  
- **Complexity:** Medium  
- **Status (2026-07-17):** Code fix landed — Clerk JWKS verification, body identity ignored, replay ownership scoped, isolation tests added. See `docs/PATHGEN_IDENTITY_MIGRATION.md`. **Not marked resolved for production until** Railway has `CLERK_ISSUER`/`CLERK_PUBLISHABLE_KEY`, `PATHGEN_AUTH_SECRET` rotated, and a real Clerk session JWT is verified end-to-end (tests use local JWKS mocks).

### C3. Paid routing entitlement not enforced server-side
- **Severity:** Critical (for any paid/public offering); High for invite-only internal
- **User impact:** Invite holders get unlimited routing regardless of subscription
- **Technical impact:** `/api/routes/create` checks invite JWT only (`server/src/app.ts`)
- **Files:** `server/src/app.ts`, `routelag-desktop/src/lib/billing.ts`, connect path in `routeEngine.ts` / `App.tsx`
- **Required fix:** Clerk Backend entitlement check (or signed entitlement token) on create; fail closed
- **Required test:** Non-Pro token cannot create session; expired Pro cannot create
- **Owner:** Routing API + billing
- **Complexity:** Medium
- **Status (2026-07-17):** **Mitigated in code** — `POST /api/entitlements/routing-token` + create requires `routing_entitlement` token; invite-only rejected; automated mock/fixture tests in `server/tests/entitlement.test.ts`. Real Clerk Billing / live webhook refund-dispute paths not exercised against production.
### C4. Free HUD incorrectly Pro-gated
- **Severity:** High (product/policy blocker)  
- **User impact:** Free HUD becomes accidental paid feature  
- **Technical impact:** `UpgradeGate allowed={entitlements.hasHud}` in `App.tsx`  
- **Files:** `App.tsx`, `billing.ts` (`hud` feature), `UpgradeGate.tsx`  
- **Required fix:** Remove Pro gate for HUD; keep HUD free standalone; routing remains paid  
- **Required test:** Free account can open HUD page and launch HUD runtime  
- **Owner:** Desktop product  
- **Complexity:** Small  
- **Status (2026-07-17):** **Mitigated in code** — HUD page no longer wrapped in `UpgradeGate`; `hasHud` entitlement removed; Clerk `hud` key moved to `LEGACY_CLERK_HUD_FEATURE_KEY`; Account Free/Pro marketing corrected; dual `RouteLagHUD.exe`/`Zer0HUD.exe` detection; identity plan in `docs/HUD_IDENTITY_MIGRATION.md`. Automated policy tests: `npm run test:hud-access`. Real Overwolf / Fortnite / VPS runtime not verified in this pass. **Not Overwolf publishing ready.** 

### C5. No Privacy Policy / Terms of Service
- **Severity:** High  
- **User impact:** Legal/compliance exposure for accounts, IP, replays, diagnostics  
- **Files:** Missing; only `types.ts` `BETA_DISCLAIMER` / `PRIVACY_WARNING`  
- **Required fix:** Publish Privacy + ToS + AUP; link in app/installer; show disclaimer on first launch  
- **Required test:** Fresh install shows legal acceptance  
- **Owner:** Product / legal  
- **Complexity:** External dependency  
- **Status (2026-07-17 Prompt 14):** **Partially resolved in local code** — draft legal pack in `docs/legal/` + bundled `/legal/*.md`; first-launch `BetaConsentGate`; links in Settings/Account/Help/Login/installer. Still incomplete until placeholders filled, counsel review, hosted URLs live, and packaged-build acceptance verified. See section **T**.  

### C6. No routing-server monitoring or capacity policy
- **Severity:** High  
- **User impact:** Silent node failure / saturation during beta  
- **Evidence:** No status page, Sentry, or alert routing found; capacity = IP pool + 120 req/min only  
- **Required fix:** Uptime checks on WG UDP + API; CPU/bandwidth alerts; documented concurrent user cap  
- **Required test:** Kill API / WG and confirm alert fires  
- **Owner:** Infrastructure  
- **Complexity:** Medium  

### C7. Clean-install + Fortnite E2E not verified this audit
- **Severity:** High  
- **User impact:** Unknown install/UAC/SmartScreen/Fortnite interaction failures  
- **Evidence:** This audit did not run packaged installer on clean Windows or play Fortnite through tunnel  
- **Required fix:** Execute private-beta checklist matrix (section J)  
- **Required test:** Clean VM install → Optimize Dallas → Fortnite match → Disconnect → Restore  
- **Owner:** QA  
- **Complexity:** Medium (process)  

### C8. Default unsigned installer / no secure updater
- **Severity:** High for public; Medium if testers briefed  
- **Files:** `routelag-installer/packaging/build-installer.ps1`, `packaging/inspect-artifact-safety.ps1`, `routelag-hud/package.json` (`signAndEditExecutable: false`), no Tauri updater  
- **Prompt 7 status:** Auto-update remains **disabled** (manual private-beta updates only). Installer UI + packaging scripts warn for unsigned builds. Signing readiness documented in `routelag-desktop/docs/WINDOWS-INSTALL.md`. Do not add an updater that runs unsigned binaries.  
- **Remaining:** Authenticode cert + sign setup/app/engine/HUD; later signed Tauri updater with pubkey verification  
- **Complexity:** Medium / external (cert)  

---

## D. Rebrand findings

Mid-rebrand update **2026-07-17 (Prompt 6):** user-facing desktop/installer copy and dual-path identity landed (`Zer0.exe` + `RouteLag.exe` alias, dual registry write, AppData migrate-once, `ZER0_*`/`VITE_ZER0_*` env precedence). Canonical runbook: `docs/ZER0_REBRAND_MIGRATION.md`.

Still incomplete for “rebrand done”: domain cutover, HUD package ID flip, engine/tunnel rename, repo folder rename, and real Windows install/upgrade E2E. Source still contains intentional RouteLag compatibility refs.

### Classification legend
- **Replace immediately** — user-visible or wrong brand in shipping surfaces  
- **Preserve temporarily** — needed for migration / dual detection  
- **Preserve permanently** — historical compatibility (rare)  
- **Remove after migration** — once Zer0 cutover complete  
- **Review manually** — package/folder/env renames with breakage risk  

### D1. High-priority remaining RouteLag references

| File / service | Current value | Required replacement | Classification | Break risk |
|----------------|---------------|----------------------|----------------|------------|
| Folders `routelag-desktop`, `routelag-hud`, `routelag-installer`, repo `Routelag` | RouteLag paths | Zer0 names later | Review manually | High if renamed carelessly |
| `routelag-desktop/src-tauri/tauri.conf.json` | `productName: Zer0`, `com.zer0.app` | Keep | Already Zer0 | — |
| `routelag-installer/.../tauri.conf.json` | `identifier: com.zer0.setup` | Keep | Flipped from `com.routelag.setup` (Prompt 7) | Installer webview storage only | Keep |
| Installer packaging | Ships `Zer0.exe` + `RouteLag.exe` alias | Drop alias later | Preserve temporarily | Medium |
| Engine binaries | `RouteLagEngine.exe`, `routelag-wg.exe` | Eventually Zer0Engine; keep aliases | Preserve temporarily | High |
| Registry | Dual-write `Software\Zer0` + `Software\RouteLag` | Zer0-only later | Preserve temporarily | High |
| AppData | Migrate-once RouteLag → Zer0 | Zer0-only later | Preserve temporarily | High |
| `routelag-hud/package.json` | `RouteLagHUD`, `com.routelag.hud` | Zer0 HUD / `com.zer0.hud` | Preserve for approval | Med |
| Help/links `https://routelag.com` | Controlled fallback via `supportUrls.ts` | Zer0 domain when DNS live | Preserve for approval | Med |
| Installer manifest URL | `https://routelag.com/downloads/manifest.json` | Zer0 CDN/manifest | Blocked until CDN ready | High if URL breaks installs |
| PathGen Railway host | `routelag-stationary-server-bot-production.up.railway.app` | Zer0-branded host + OAuth redirect update | Review manually | High (OAuth) |
| Desktop default API | `http://216.152.154.137:3001` in `lib/api.ts` | Keep IP or Zer0 DNS | Review manually | Med |
| Env vars `ROUTELAG_*`, `VITE_ROUTELAG_*` | Legacy with `ZER0_*` preferred | Remove after cutover | Preserve temporarily | High |
| localStorage `routelag.*` keys | Tokens/prefs | Explicit migrator later | Preserve temporarily | High |
| UI / server user-facing strings | Mostly Zer0 after Prompt 6 | Spot leftover docs/NSIS | Replace immediately | Low |
| NSIS legacy installer | Full RouteLag product strings | Zer0 or deprecate | Replace immediately if shipped | Med |
| Docs / README | Mixed; migration doc added | Zer0-first | Replace immediately (docs) | Low |
| Invite code `ROUTELAG-BETA` | Default in config/examples | Keep issued codes | Preserve temporarily | Med |
| Firebase project `lunory-61a2a` | Residual | Document or remove | Review manually | Low |
| GitHub `WrenchDevelops/Routelag` | Old name | Optional rename | Review manually | Med |

### D2. Migration safety notes

- Installer creates Zer0 shortcuts and cleans old `RouteLag.lnk` / `RouteLag Beta.lnk` — good.
- Default install dir `Program Files\Zer0`; runtime dual-detects Zer0 + RouteLag paths.
- Packaging ships **both** `Zer0.exe` and `RouteLag.exe` (alias) so upgrades and recovery tools keep working; shortcuts/ARP prefer Zer0.
- App-data migrate-once copies routing/settings into `%LOCALAPPDATA%\Zer0` without deleting legacy — see `docs/ZER0_REBRAND_MIGRATION.md`.
- **Remaining risk:** domain/manifest still RouteLag; HUD package ID still RouteLag; real Windows E2E not run this session.

### D3. Zer0 spelling

- Canonical brand **Zer0** is used in UI, Tauri `productName`, installer ARP, and Prompt 6 string pass.
- Invite hint uses `ZER0-BETA` (acceptable).
- Disclaimer / privacy copy now say Zer0 (Prompt 6).

---

## E. Security findings

Secrets are **not printed** below. Local `.env` files exist and are gitignored.

| ID | Severity | Finding | Location | Notes |
|----|----------|---------|----------|-------|
| S1 | Critical | PathGen trusts client `clerkUserId` (`user_*`) and any email without Clerk JWT verify | `pathgen-server/src/app.ts` | Identity spoof → replay IDOR |
| S2 | Critical | Routing create has no paid entitlement check | `server/src/app.ts` | Invite JWT sufficient |
| S3 | High | Hardcoded invite defaults / personal email in source & examples | `server/src/config.ts`, `pathgen-server/src/config.ts`, `.env.example` | Rotate all beta codes |
| S4 | High | Pro gates are client-only | `UpgradeGate.tsx`, `App.tsx`, `billing.ts` | Bypassable |
| S5 | High | Local SSH private key on disk | `server/keys/ashburn-provisioner` | Gitignored; confirm ACLs/backups |
| S6 | High | PathGen `/health` leaks Supabase URL + `service_role` key role | Live Railway health | Strip in production |
| S7 | Medium | `CLERK_SECRET_KEY` present in desktop `.env.local` | `routelag-desktop/.env.local` | Not Vite-bundled today; remove/rotate |
| S8 | Medium | Weak default HMAC secrets if env unset | `server` / `pathgen` `config.ts` | Fail closed in prod |
| S9 | Medium | CORS `origin: true` on both APIs | `app.ts` both servers | Restrict |
| S10 | Medium | Unauthenticated node catalog / candidates / route test | `server/src/app.ts` | Topology leak / abuse |
| S11 | Medium | Client-writable `billingSnapshot` | `cloudUserSync.ts`, users routes | Ignore client billing |
| S12 | Medium | Admin token compare not timing-safe; admin lists invite metadata | `server/src/app.ts` | Use `secureEquals` |
| S13 | Medium | Tauri CSP was `null` | `tauri.conf.json` (desktop + installer) | **Prompt 7:** CSP set; keep reviewing connect-src as domains change |
| S14 | Low | Report upload accepts arbitrary JSON when authed | `/api/reports/upload` | Schema/size limits |
| S15 | Info | Firestore rules deny-all | `firestore.rules` | OK if unused by clients |
| S16 | Info | No Privacy/ToS | repo | Legal review required |
| S17 | Info | `.env` / keys gitignored; not tracked | `.gitignore` | Good baseline |
| S18 | Info | `npm audit` (server + pathgen, omit=dev) | 0 vulnerabilities | Does not prove app security |

**Legal note:** This is not a compliance certification. GDPR/CCPA deletion/export, minor age gates, and international transfer language need professional legal review.

---

## F. Routing readiness

### Architecture (text)

```text
[Fortnite] --UDP to Epic 18.88.0.0/16--> [Windows Zer0 Engine / WireGuard tunnel]
        |                                        |
        |                                 AllowedIPs = tunnelCidr + 18.88.0.0/16
        |                                        |
        v                                        v
   (other traffic stays direct)          [VPS wg0 :51820]
                                                 |
                                          [server Fastify API]
                                          peer create/end via `wg set`
                                                 |
[Zer0 desktop Tauri] --Bearer invite JWT--> Dallas API (also catalogs Ashburn)
[Zer0 desktop] --Clerk--> Clerk Billing (UI only today)
[Zer0 desktop] --PathGen JWT--> Railway PathGen (replays/users)
[HUD runtime / Overwolf] --localhost:17389--> Desktop HUD bridge
```

### Verdicts

| Area | Verdict |
|------|---------|
| Local routing implementation | **Mostly complete in code** — WireGuard split tunnel, full-tunnel blocked, admin required, verification + rollback on failed connect |
| Real VPS connectivity | **Dallas API live (`peerMode=wg`)**; Ashburn listed online via Dallas health; **Fortnite traffic E2E not verified this audit** |
| Crash recovery | **Unsafe** — no auto teardown on crash/exit; relaunch may prompt Restore Internet if stale |
| Route cleanup | **Manual Restore Internet / Emergency Cleanup documented**; Advanced Repair can require reboot |
| Entitlement enforcement | **Invite auth only** — not Clerk Pro |
| Node health monitoring | **API health fields only** — no external monitoring/alerts found |
| Capacity controls | **IP pool (~.10–.254) + 120 req/min** — no per-user concurrent session cap |
| Real Fortnite testing | **Not verified in this audit** |

### Node inventory (from `server/data/nodes.production.json` + live health)

| Node | Public IP | Endpoint | Provisioner | Live health (2026-07-17) |
|------|-----------|----------|-------------|---------------------------|
| Dallas Beta | `216.152.154.137` | `:51820` | local | online, `canStart=true`, API on `:3001` |
| Ashburn Beta | `66.163.122.222` | `:51820` | SSH as root with key path `/opt/routelag-server/keys/ashburn-provisioner` | reported online via Dallas `/health`; Ashburn `:3001` timed out |

Johannesburg exists in defaults/examples as disabled / coming soon — not in production JSON.

### Important behaviors (code)

- Fortnite selection: **`18.88.0.0/16`** NA Epic block (not all traffic)
- DNS: profile injects `1.1.1.1` by default; cleanup flushes DNS cache
- IPv6 game routes: not used; `::/0` blocked
- Latency UI: probes node endpoints / tunnel — **not claimed as in-game Fortnite RTT**; soft copy asks user to check in-game
- Docs drift: `docs/ROUTING-TUNNEL.md` still describes older ME `/32` story vs current NA `/16`

### Untested in this audit (do not treat as working)

Windows reboot with tunnel installed; sleep/wake; VPN conflicts; adapter switches; antivirus; Fortnite before/after Zer0; real Ashburn SSH peer create; multi-hour stability; packet-loss under load.

---

## G. Overwolf readiness

| Area | Verdict |
|------|---------|
| Technical implementation | **Two stacks:** classic Overwolf WebApp (`overwolf-companion`) + shippable **ow-electron** (`routelag-hud`). Desktop also has Tauri overlay editor/preview |
| Free-access enforcement | **Fail vs product definition** — desktop Pro-gates HUD when enabled |
| Standalone launch | **Intended** via `RouteLagHUD.exe`; not E2E-verified this session |
| Launch from Zer0 | **Implemented** (`launch_hud_installer_cmd` / install_info) |
| Overwolf account status | **Unknown** — no approval docs in repo |
| Store approval status | **Not approved / not documented** — do not claim approval |
| Fortnite event support | GEP feature set present (kills, match, phase, etc.); missing → `--` |
| Performance | **Not measured** this audit |
| Policy compliance | Needs Overwolf + Epic/anti-cheat review; no injection found in reviewed paths |

**Product conflict:** Spec says Overwolf HUD is completely free and must not depend on paid Zer0. Current UI treats HUD as Pro when `HUD_ENABLED`.

**Dallas/Core installer builds force `VITE_ROUTELAG_ENABLE_HUD=false`** — HUD hidden in that channel (good for scoped beta; still wrong if Pro-gated when enabled).

---

## H. Replay-parser readiness

| Topic | Status |
|-------|--------|
| Pipeline | Desktop scan → PathGen upload → Osirion → normalize → store (JSON/Supabase) |
| Supported Fortnite versions | **Not version-pinned in code**; depends on Osirion compatibility |
| Tested samples | Unit normalizer tests pass; **no replay corpus listed in repo** |
| Accuracy limitations | Best-effort Osirion key aliases; owner pick can be wrong in squads; accuracy null if hits/shots missing; basic parse players-only by default; deep-analyze quotas (10/mo, 3/day, 120s cooldown) |
| Performance | Upload max 250MB; poll interval 30s; max polls 40; **large-history stress not measured** |
| Failure handling | Failed/timeout jobs with retry; duplicates by hash; binary deleted after Osirion submit |
| User-facing limitations | UI shows `--` for missing; Pro-gated in desktop when enabled |

**Entitlement model:** Product definition does not clearly say replays are free or paid. Code treats replays as **Pro**. PathGen does **not** verify Pro. Resolve explicitly before launch.

---

## I. Test evidence

### Commands run (this audit)

| Command | Result |
|---------|--------|
| `npm test` in `server/` | **19 pass / 0 fail** (mock peer mode) |
| `npm test` in `pathgen-server/` | **15 pass / 0 fail** |
| `npm audit --omit=dev` in `server/` | **0 vulnerabilities** |
| `npm audit --omit=dev` in `pathgen-server/` | **0 vulnerabilities** |
| `npx tsc --noEmit` in `routelag-desktop/` | **Exit 0** (no errors printed) |
| `GET http://216.152.154.137:3001/health` | **200**, `peerMode:"wg"`, Dallas+Ashburn reported online |
| `GET http://66.163.122.222:3001/health` | **Timeout** (API not on Ashburn :3001) |
| `GET https://routelag-stationary-server-bot-production.up.railway.app/health` | **200**, Osirion+Supabase+Epic+Discord configured |

### Not run (explicitly)

- Packaged installer clean Windows install/uninstall
- Code signing verification / SmartScreen
- Desktop `tauri build` / full package
- Live WireGuard connect/disconnect from this machine
- Fortnite match through tunnel
- Crash mid-session restore matrix
- Clerk checkout / webhook / entitlement E2E
- Overwolf store packaging / GEP on live Fortnite
- Replay upload against production Osirion with real `.replay`
- Dependency audit for `routelag-desktop` / `routelag-hud`
- Load/capacity tests
- Sleep/wake, VPN conflict, multi-monitor scaling measurements
- Git secret history scan beyond current tree tracking

**Do not treat mock `peerMode` tests as proof that real routing works.**

---

## J. Private-beta checklist

Ordered by priority. Symbols: `[x]` verified complete · `[~]` partial · `[ ]` missing · `[!]` blocked/unsafe

- [!] Tunnel auto-cleanup on crash/exit/reboot
- [!] PathGen Clerk JWT verification (no spoofable `user_*` / email login)
- [~] Server-side entitlement model decided (invite-only internal **or** Clerk-enforced paid)
- [~] Paid routing entitlement enforced on VPS for all creates (code + mock tests; live Clerk Billing not E2E'd)
- [x] Free HUD not Pro-gated (when HUD is in scope) — desktop UpgradeGate removed; marketing corrected; Overwolf store path still external / not publishing-ready
- [ ] Privacy Policy + Terms linked in app/installer
- [ ] Monitoring + alerts for Dallas (and Ashburn if enabled)
- [ ] Explicit beta user cap + node capacity cap documented and enforced
- [ ] Clean Windows install/uninstall tested on fresh VM
- [ ] At least one real Dallas Optimize → Fortnite → Disconnect E2E
- [ ] Crash mid-session + Restore Internet verified
- [~] Invite codes rotated; defaults removed from public source
- [~] Unsigned build risk disclosed to testers
- [~] Emergency cleanup docs available (`EMERGENCY-CLEANUP.md`)
- [~] Diagnostics + logs export path present
- [~] Soft ping language (no hard guarantee) — mostly OK; scrub “Optimal Route” marketing if needed
- [x] Full tunnel `0.0.0.0/0` blocked in server+client code paths
- [x] Dallas API reachable with `peerMode=wg` (health probe)
- [x] Server unit tests passing (mock)
- [x] PathGen unit tests passing
- [ ] Rollback / global emergency-disable procedure documented and tested
- [~] HUD/Replay disabled in Dallas Core installer builds (feature flags)
- [ ] Support contact + incident owner named
- [~] Rebrand dual-path does not create duplicate ARP entries (needs install QA)
- [ ] Ashburn disabled or SSH provisioning E2E-proven
- [ ] Remove `CLERK_SECRET_KEY` from desktop env; confirm no secret in renderer bundles

---

## K. Public-launch checklist

Beyond private beta:

- [~] Paid routing entitlement enforced on VPS for all creates (code + mock/fixture tests; live Clerk Billing not E2E'd)
- [ ] Clerk live billing + webhooks + cancel/refund/chargeback entitlement removal tested
- [ ] Prices/UI match Clerk Dashboard live products; no abandoned RouteLag SKUs
- [ ] Code-signed installer + HUD; SmartScreen reputation plan
- [ ] Secure auto-update channel (signed, integrity-checked, no downgrade abuse)
- [~] Complete Zer0 rebrand cutover (exe/registry/AppData dual-path done; domains/HUD package/engine pending — `docs/ZER0_REBRAND_MIGRATION.md`)
- [ ] Overwolf path decided: Store approval **or** clearly non-store ow-electron distribution
- [ ] HUD remains free; routing paid; replay entitlement published
- [ ] Status page; on-call; incident response runbook
- [ ] GDPR/CCPA deletion/export flows
- [ ] Rate limits, concurrent session rules, abuse controls, DDoS playbook
- [ ] Fortnite season/update compatibility process for replays + GEP
- [ ] Performance budgets (idle/connected CPU/RAM) measured on low-end PCs
- [ ] CI: test + build + sign + smoke
- [ ] Legal disclaimers shown on first launch (Epic unaffiliated, no AC interaction)
- [ ] Production secrets rotation complete; `/health` redacted
- [ ] Multi-node capacity + failover policy
- [ ] Customer support tooling without raw DB edits

---

## L. Recommended next implementation order

1. **User networking safety** — auto-disconnect on exit; crash/boot cleanup; peer TTL on VPS  
2. **Credential and secret safety** — fix PathGen auth; redact health; remove desktop Clerk secret; rotate invites/keys as needed (with approval)  
3. **Authentication and authorization** — Clerk JWT verification on PathGen; unify route token issuance  
4. **Subscription-entitlement correctness** — enforce on `/api/routes/create`; define replay free/paid; **unguard HUD**  
5. **Real VPS validation** — Dallas Fortnite E2E; decide Ashburn; add monitoring  
6. **Fortnite compatibility** — document AC stance; test launch order; Epic disclaimer on first run  
7. **Replay accuracy** — corpus tests; null handling; ownership confidence labels  
8. **Overwolf approval requirements** — rebrand companion; free policy; store vs ow-electron decision  
9. **Installer and updater safety** — signing; Zer0.exe cutover with migration; updater  
10. **Monitoring and support readiness** — alerts, caps, status, support path  
11. **UX polish** — remaining RouteLag strings; ping honesty; empty/error states  
12. **Additional features** — multi-hop, extra regions, AI coaching, referrals (keep hidden)

---

## M. Final verdict

> **Prompt 8 addendum (same day):** Recalculated readiness, live probes, and the current verdict live in **section N**. This section M remains the **original** audit verdict for historical context.

### Ready for internal testing only

**Evidence-based reasons:**

1. Substantial desktop + WireGuard routing + Dallas live API (`peerMode=wg`) exist and mock/server tests pass.  
2. Private-beta minimum gate **fails** on crash network safety, PathGen identity security, missing monitoring/capacity policy, missing legal pages, and unverified clean-install/Fortnite E2E.  
3. Product policy conflict: HUD is Pro-gated in UI despite free-HUD requirement.  
4. Rebrand is incomplete at the binary/registry/domain layer.  
5. Billing is client-side; unsuitable for any paid external cohort.

### Smallest safe private-beta scope (after blockers C1–C2 and monitoring minimum)

| Include | Exclude |
|---------|---------|
| Invite-only staff/trusted testers (≤5) | Public signup |
| Core Dallas routing only | Ashburn (until proven) |
| Restore Internet mandatory training | Paid Clerk checkout |
| Unsigned disclosure | Overwolf Store submission |
| Diagnostics/logs | HUD (until ungated + QA) |
| Soft “test in Fortnite” language | Replay/PathGen (until auth fixed) |
| Emergency cleanup doc | Marketing lower-ping guarantees |

---

## Appendix A — Architecture map (packages)

| Package | Path | Role |
|---------|------|------|
| Desktop | `routelag-desktop/` | Tauri 2 + React 19 Zer0 app |
| Routing API | `server/` | Fastify on VPS; WG peers |
| PathGen | `pathgen-server/` | Replays, users, Epic/Discord, Railway |
| Installer | `routelag-installer/` | Custom Zer0 Setup |
| HUD runtime | `routelag-hud/` | ow-electron `RouteLagHUD` |
| Overwolf companion | `overwolf-companion/` | Classic WebApp |
| Scripts | `scripts/` | WG install / SSH deploy helpers |
| Docs | `docs/`, `routelag-desktop/docs/` | Ops + tester guides |

## Appendix B — API inventory (summary)

### Routing server (`server/src/app.ts`)
`GET /health` · `POST /api/auth/login` · `POST /api/beta/login` · `GET /api/games` · `GET /api/servers` · `GET /api/routes/candidates` · `POST /api/routes/test` · `POST /api/routes/create|start` · `POST /api/routes/end|stop` · `GET /api/routes/status/:id` · `GET /api/admin/sessions` · `POST /api/reports/upload` · replay subset under `/api/replays/*`

### PathGen (`pathgen-server`)
`GET /health` · auth login · `/api/replays/*` · `/api/users/me*` · `/api/epic/*` · `/api/discord/*` · `/api/routing/sessions`

## Appendix C — Data collection (high level)

| Category | Why | Where | Retention | Access | Deletion | Consent gap |
|----------|-----|-------|-----------|--------|----------|-------------|
| Clerk account | Auth/billing | Clerk | Clerk policy | Clerk + app | Clerk flows | Need ToS/Privacy |
| Invite/tester IDs | Beta access | VPS/PathGen | Unknown | Admins | Manual | Need policy |
| Routing sessions | Ops | VPS store + optional Supabase | Unknown | Admins | Manual | Need policy |
| Diagnostics reports | Support | `server/data/reports` | Unknown | Admins | Manual | PRIVACY_WARNING only |
| Replays/parsed stats | Product | Osirion + PathGen/Supabase | Unknown | User namespace (spoofable today) | Partial | Need policy |
| Epic/Discord links | Identity | PathGen/Supabase | Unknown | User | Unlink routes | OAuth consent |
| Crash/local logs | Debug | `%LOCALAPPDATA%\RouteLag` | Local | User/support | Uninstall partial | Need policy |

## Appendix D — Manual test matrix (required before any external beta)

| Scenario | Required result |
|----------|-----------------|
| Clean Windows install | Installs; launches without Node/Vite |
| Uninstall | Removes app; optional data wipe; network clean |
| RouteLag → Zer0 upgrade | No duplicate broken installs; settings preserved or migrated |
| New/existing/free/paid/expired accounts | Entitlements match server |
| HUD installed / not installed | Clear CTA; no paywall for HUD |
| Fortnite installed / not; replays on/off | Graceful UX |
| Node online/offline | Clear errors; no stuck tunnel |
| No internet | Understandable offline state |
| App crash while connected | Network restored automatically or one-click restore works |
| Windows restart while connected | Safe recovery |
| Sleep/wake | Reconnect or safe disconnect |
| Display scales 100–200% | Usable 1280×720 UI |
| Multi-monitor | Overlay/HUD correct |

---

## N. Prompt 8 — Controlled private-beta readiness test (2026-07-17 evening)

**Mode:** End-to-end readiness audit only. No production deploy, no live DNS change, no Stripe charges, no Overwolf publish, no credential rotation performed in this pass.  
**Repo HEAD inspected:** `a7907fa157ef30087961f92df9510b8c3ed5a140`  
**Packaged Core installer (local artifact):** `Zer0-Beta-Core-Setup.exe` SHA256 `A273C1D270602D10C4CC764B319516DAD3CB34D4D20F32575712125216F300D4` (unsigned; Prompt 7 build)

### N1. Original readiness (historical — section A / M)

| Gate | Prior readiness | Prior verdict |
|------|-----------------|---------------|
| Overall | ~38% | Not launchable |
| Private beta | ~32% | Fails private-beta minimum gate |
| Public beta | ~15% | Not ready |
| Production | ~8% | Not ready |
| **Final (section M)** | — | **Ready for internal testing only** |

### N2. Blocker reconciliation (Prompts 1–7)

Do **not** treat a code change as a resolved real-world blocker.

| Original blocker | Claimed fix | Evidence | Still requires real test | Current status |
|------------------|-------------|----------|--------------------------|----------------|
| C1 Tunnel not torn down on crash/exit | Exit/`ExitRequested` → `safe_shutdown_routing`; startup stale recovery; peer TTL | Code in `cleanup.rs` / `lib.rs`; Rust unit tests 17/17; docs `EMERGENCY-CLEANUP.md` | Packaged close / force-kill / reboot / live WG restore | **Blocked by external testing** (code partial) |
| C2 PathGen identity spoof / replay IDOR | Clerk JWKS verify; body identity ignored; isolation tests | Local `pathgen-server` **23/23**; migration doc | Live Railway still spoofs (see N4) | **Not resolved on live PathGen**; local code partial |
| C3 Paid routing entitlement server-side | Entitlement token + create enforcement; concurrent caps | Local server **46/46** mock/fixture tests | Live Dallas create with free vs Pro Clerk; deploy entitlement env | **Partially resolved in repo**; live Dallas entitlement deploy **unverified** |
| C4 Free HUD Pro-gated | UpgradeGate removed; `test:hud-access` 10/10 | Automated policy tests pass | Overwolf runtime / Fortnite GEP | **Partially resolved** (desktop policy); Overwolf **unverified** |
| C5 Privacy / ToS | Draft pack + first-launch gate + in-app links (Prompt 14) | `docs/legal/*`; `BetaConsentGate`; `legalConsent` tests 5/5 | Hosted URLs; placeholder fill; counsel review; packaged-build accept | **Partially resolved** (local drafts + UI; not legally complete) |
| C6 Monitoring / capacity / kill-switch | Peer TTL, capacity, admin controls, `/healthz`, probe script | Local ops tests pass; docs in `ROUTING-TUNNEL.md` | Live Dallas missing `/healthz` (404); alert destination not wired; Ashburn still in live catalog | **Partially resolved in repo**; **live monitoring incomplete** |
| C7 Clean-install + Fortnite E2E | Packaging/Core installer built | Installer artifact exists unsigned | Clean VM install, Dallas tunnel, Fortnite session | **Not resolved** (unverified) |
| C8 Unsigned / no updater | Warnings + docs; updater stays disabled | Prompt 7 packaging + `WINDOWS-INSTALL.md` | Authenticode + SmartScreen | **Partially resolved** (acceptable for internal; not public) |
| Rebrand incomplete | Dual-path Zer0 + RouteLag | Prompt 6 migration doc; unit migrate tests | Windows upgrade/uninstall E2E; domains | **Partially resolved** |
| Packaging safety | CSP, URL allowlist, owned-tunnel uninstall cleanup | Prompt 7 builds + artifact scan | Clean install/uninstall on elevated VM | **Partially resolved** |

### N3. Automated verification (this session)

| Command | Result | Evidence class |
|---------|--------|----------------|
| `npm test` in `server/` | **46 pass / 0 fail** | Automated local + mock peer mode |
| `npm run build` in `server/` | **pass** | Automated local |
| `npm audit --omit=dev` in `server/` | **0 vulns** | Dependency audit |
| `npm test` in `pathgen-server/` | **23 pass / 0 fail** | Automated local + mock JWKS |
| `npm run build` in `pathgen-server/` | **pass** | Automated local |
| `npm audit --omit=dev` in `pathgen-server/` | **0 vulns** | Dependency audit |
| `npm run test:hud-access` in `routelag-desktop/` | **10/10** | Automated local |
| `npm run check:engine:windows` | **pass** (engine binaries present) | Automated local |
| `npx tsc --noEmit` in `routelag-desktop/` | **pass** | Type checking |
| `npm run build` (`tsc` + Vite) in `routelag-desktop/` | **pass** | Production frontend build |
| `npm audit --omit=dev` in `routelag-desktop/` | **12 moderate** (transitive `@clerk/ui` → `uuid` / Solana wallet chain) | Dependency audit |
| `cargo test --lib` in `routelag-desktop/src-tauri` | **17/17** | Automated local (Rust) |
| `cargo test --lib` in `routelag-installer/src-tauri` | **5/5** | Automated local (Rust) |
| `npx tsc --noEmit` in `routelag-hud/` | **pass** | Type checking |
| `npm audit --omit=dev` in `routelag-hud/` | **0 vulns** | Dependency audit |
| ESLint / dedicated desktop lint script | **Not configured** | N/A |
| Full `tauri build` / fresh Core installer rebuild this session | **Not re-run** (used Prompt 7 artifact) | Prior build artifact |
| Source secret scan (high-risk patterns) | No `sk_live_` / private keys in scanned src; `service_role` / `supabaseKeyRole` **names** remain in PathGen health code | Secret scan (heuristic) |
| Artifact safety report | Unsigned; `127.0.0.1:1430` metadata hit only | Packaging inspection |

**Do not treat mock `peerMode` or mock JWKS tests as proof of live routing or live Clerk.**

### N4. Live infrastructure probes (read-only; not full VPS validation)

| Probe | Result | Notes |
|-------|--------|-------|
| `GET http://216.152.154.137:3001/health` | **200**, `peerMode:"wg"`, Dallas+Ashburn listed online | Still returns **endpoints / CIDRs / public IPs** (pre–Prompt 5 redaction). Confirms Dallas API up; also confirms **Prompt 5 server not deployed** to this host. |
| `GET http://216.152.154.137:3001/healthz` | **404** | Uptime probe script targets `/healthz` — **will fail** against current live Dallas. |
| `GET http://66.163.122.222:3001/health` | **Timeout** | Ashburn API not exposed on :3001; keep Ashburn **disabled** for beta. |
| `GET` PathGen Railway `/health` | **200** | Still exposes `supabaseUrl` + `supabaseKeyRole:"service_role"`. |
| PathGen `POST /api/auth/login` with spoofed `clerkUserId` / email, **no Clerk JWT** | **200 + token minted** | **Live PathGen auth fix not deployed.** Replay remains unsafe. Token value redacted from this doc. |
| Dallas `POST /api/routes/create` without auth | **401** | Auth required (positive). Does **not** prove entitlement exchange is live. |
| Dallas invalid invite login | **401** | Expected. |

### N5. Packaged Windows / Fortnite / HUD / failure matrix

**Environment notes (this machine):** Windows; session **not elevated**; Fortnite install present; Overwolf present; existing ARP shows both **Zer0 Beta** and **RouteLag Beta** pointing at `C:\Program Files\RouteLag` with `RouteLag.exe` only (no `Zer0.exe`); legacy AppData `RouteLag` present; generic `WireGuardManager` running (not a Zer0 tunnel service). **No packaged install, tunnel, or Fortnite session was executed in this pass** (would mutate network state without elevation/admin consent).

#### Required real tests before trusted private beta

| Test | Status |
|------|--------|
| Install from packaged installer | [ ] Not verified |
| Launch without dev tools | [ ] Not verified |
| Sign in authorized test account | [ ] Not verified |
| Free account cannot start paid routing | [~] Mock/server tests only |
| Authorized/paid can start routing | [~] Mock/server tests only |
| Connect Dallas | [ ] Not verified (real tunnel) |
| Windows tunnel service + route state | [ ] Not verified |
| DNS behavior | [ ] Not verified |
| Internet access while connected | [ ] Not verified |
| Launch Fortnite / real session | [ ] Not verified |
| No crash / anti-cheat errors | [ ] Not verified |
| Disconnect + service removal | [ ] Not verified |
| Route / DNS restoration | [ ] Not verified |
| Force-close + relaunch stale recovery | [ ] Not verified |
| Reboot with active tunnel + recovery | [ ] Not verified |
| Restore Internet | [~] Code + unit tests only |
| Uninstall + no leftover Zer0 tunnel/service | [ ] Not verified |
| Unrelated network software untouched | [~] Unit ownership tests only |

#### Failure tests

| Failure | Status |
|---------|--------|
| Dallas API unavailable | [ ] Not verified (real) |
| Dallas WireGuard unavailable | [ ] Not verified (real) |
| Authentication unavailable | [~] Mock + live 401 without token |
| Entitlement service unavailable | [~] Mock `entitlement_unavailable` 503 |
| Node full | [~] Mock `node_full` |
| Concurrent-session limit | [~] Mock `concurrent_session_limit` |
| Invalid invite | [x] Live Dallas 401 + mock |
| Expired token | [~] Mock PathGen/server |
| App force-kill | [ ] Not verified |
| Server session expires / peer TTL | [~] Mock TTL tests |
| Ethernet ↔ Wi-Fi change | [ ] Not verified |
| Sleep/wake | [ ] Not verified |
| Fortnite closes unexpectedly | [ ] Not verified |
| Zer0 closes while Fortnite running | [ ] Not verified |

#### HUD checks

| Check | Status |
|-------|--------|
| HUD page available to free accounts | [x] Automated `test:hud-access` (when flag on) |
| HUD install/detect separately | [~] Dual exe detection unit tests; Core builds **disable HUD UI** |
| HUD launch without paid routing | [~] Policy tests; Overwolf runtime **not tested** |
| Main app close does not terminate HUD | [~] Code inspection (detached spawn) |
| HUD close does not terminate routing | [ ] Not verified |
| Overwolf runtime / store | [ ] Not verified — **do not publish** |

#### Replay checks

Replay is **disabled in Core installer builds** (`VITE_ROUTELAG_ENABLE_HUD=false`, `VITE_ROUTELAG_ENABLE_REPLAY=false`). Keep disabled: live PathGen still mints tokens from spoofed `clerkUserId`. No real replay corpus parse in this pass.

#### Monitoring checks

| Check | Status |
|-------|--------|
| Dallas API outage → alert | [!] Alert destination **not configured**; live `/healthz` missing |
| Node-disable control | [~] Mock admin controls only |
| Global route-creation disable | [~] Mock maintenance / routingDisabled |
| Peer expiration | [~] Mock TTL + admin expire-peers |
| Emergency peer cleanup | [~] Mock |
| Alert reaches real destination | [ ] Not verified — **private-beta monitoring incomplete** |

### N6. Current readiness (recalculated)

Weighting: private-beta gate requires **verified** (1) tunnel cleanup on real Windows, (2) auth that cannot be spoofed on live services used by testers, (3) server-side entitlement on the live Dallas create path, (4) real Dallas routing E2E, (5) clean install/uninstall, (6) monitoring with a real alert destination. Code + mock tests raise confidence but do not satisfy that gate.

| Gate | Readiness (weighted) | Verdict |
|------|----------------------|---------|
| Internal testing | **~62%** | Improved vs original (~ code hardening + automated suite green) |
| Trusted private beta | **~28%** | Still fails minimum gate (live PathGen unsafe; Windows/Fortnite/monitor unverified; Dallas ops code undeployed) |
| Public beta | **~12%** | Not ready |
| Production | **~7%** | Not ready |

### N7. Resolved blockers (evidence-backed only)

None of C1–C8 are marked **fully resolved** for private beta. Evidence-backed mitigations that **do** land for internal testing:

- Local automated server entitlement + ops-control suite green (mock).
- Local PathGen Clerk verification suite green (mock JWKS) — **not on Railway**.
- Desktop HUD no longer Pro-gated in policy tests; Core channel keeps HUD/Replay compiled out.
- Packaging: unsigned Core installer artifact + safety report; CSP/URL allowlist in repo.
- Exit/startup cleanup implemented in Rust with unit tests — **not Windows-verified**.

### N8. Remaining blockers (exact)

| Blocker | Files / services | Required test / action | Owner |
|---------|------------------|------------------------|-------|
| Live PathGen still spoofs identity | Railway `routelag-stationary-server-bot-production`; local fix in `pathgen-server/src/*` | Deploy Prompt 2; set Clerk issuer env; rotate `PATHGEN_AUTH_SECRET` after deploy; re-probe spoof → 401 | PathGen / ops |
| Prompt 5 server not on Dallas | Live `:3001` lacks `/healthz` + still leaks node endpoints | Deploy server build to Dallas staging/beta host only when approved; verify redacted health | Routing ops |
| Tunnel cleanup unproven on real Windows | `cleanup.rs`, `lib.rs`, installer `network_cleanup.rs` | Elevated packaged matrix (close/kill/reboot/uninstall) | Desktop QA |
| Entitlement on live Dallas unverified | `server/src/entitlement/*`, desktop `routeEngine.ts` | Free vs internal/Pro create against live API with real Clerk test tokens (no live charges) | Routing + billing |
| Clean install / Fortnite E2E | `Zer0-Beta-Core-Setup.exe` | Clean VM → Optimize Dallas → Fortnite → Disconnect → Restore | QA |
| Monitoring alert delivery | `scripts/beta-uptime-probe.sh` + external monitor | Wire Slack/email/PagerDuty; confirm outage alert | Infra |
| Ashburn still offered | `server/data/nodes.production.json` (`ashburn-beta.available: true`); live health lists Ashburn | Disable Ashburn for first beta (`disabledNodeIds` or `available:false`) until SSH E2E proven | Ops |
| Privacy / ToS | Missing | Publish + in-app acceptance | Product / legal |
| Desktop heartbeat not wired | No `/api/routes/heartbeat` client usage found | Wire client heartbeat or rely solely on absolute TTL + document | Desktop |
| Concurrent beta cap ≠ “4 users” product ask | Defaults: max peers/node 50, headroom 5, per-user concurrency 1 | Set tighter ops caps (e.g. effective ≤4 concurrent) via env/admin before invite | Ops |
| Unsigned SmartScreen | Installer AuthSig NotSigned | Brief testers; later Authenticode | Packaging |

### N9. Feature launch states (invite-only private beta target)

| Feature | State |
|---------|-------|
| Core Dallas routing (Windows) | **Internal only** until real E2E + cleanup verified; then candidate for trusted private beta |
| Ashburn routing | **Disabled / blocked** until separately verified |
| Paid Clerk checkout | **Blocked** (billing matrix not live-verified; no live charges) |
| Server entitlement enforcement | **Internal only** (repo ready; live deploy unverified) |
| Invite shell login | **Enabled for private beta** (invite codes) once Dallas configured |
| HUD (Overwolf / ow-electron) | **Disabled by feature flag** in Core builds; free when enabled; Overwolf **not publishing** |
| Replay / PathGen | **Disabled by feature flag** / **Blocked** until live Railway auth fix proven |
| Auto-updater | **Disabled** (manual updates only) |
| Multi-hop / extra regions / AI / referrals | **Removed from current scope** / hidden |
| Monitoring alerts | **Blocked** until destination configured + Dallas `/healthz` live |

### N10. Exact beta configuration (recommended if proceeding after real tests)

| Setting | Value |
|---------|-------|
| Enabled nodes | `dallas-beta` only |
| Ashburn | Disabled (`disabledNodeIds` includes `ashburn-beta` or `available:false`) |
| Tester limit | ≤5 trusted invite-only |
| Concurrent routing users | ≤4 unless new capacity evidence; set `ROUTELAG_MAX_PEERS_PER_NODE` / headroom accordingly (defaults today allow far more) |
| Per-user sessions | `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER=1` |
| Peer TTL | `ROUTELAG_PEER_TTL_HOURS=8` (or tighter) |
| Entitlement | `ROUTELAG_REQUIRE_ROUTING_ENTITLEMENT=true`; Clerk issuer/JWKS configured on Dallas |
| Internal allowlist | Non-production only; disabled when `ROUTELAG_DEPLOYMENT_ENV=production` |
| Feature flags (Core) | `VITE_ROUTELAG_ENABLE_HUD=false`, `VITE_ROUTELAG_ENABLE_REPLAY=false` |
| Required monitoring | External uptime on live `/healthz` **after deploy**; admin status pull; alert destination configured |
| Recovery docs | `routelag-desktop/docs/EMERGENCY-CLEANUP.md`, `BETA-TESTER-GUIDE.md`, Restore Internet training |
| Tester warning | Unsigned build; no ping guarantees; Restore Internet first; report anti-cheat anomalies immediately |
| Build / installer | Desktop app `0.2.1`; installer artifact SHA256 `A273C1D2…F300D4`; desktop release exe SHA256 `AFCA9E2E…B8C7B1` |
| Server version (package) | `0.1.0` — **confirm live Dallas git/build after any deploy** |
| Emergency disable | Admin `PUT /api/admin/controls` with `routingDisabled` / `maintenanceMode`; `POST /api/admin/nodes/dallas-beta/expire-peers`; local Restore Internet |

### N11. Rollback / immediate beta suspension criteria

Suspend the beta immediately if any of:

1. User loses normal internet after disconnect and Restore Internet does not recover.
2. Stale tunnels cannot be automatically recovered on relaunch (elevated) or via documented Restore Internet.
3. Unauthorized routing access (free/forged token creates routes on live Dallas).
4. Replay cross-account access (PathGen IDOR) — keep Replay off; if enabled and observed, suspend Replay immediately.
5. Node capacity failure / saturation affecting non-testers or host networking.
6. Credible anti-cheat / Fortnite integrity concern linked to Zer0.
7. Unbounded peer growth on Dallas `wg0`.
8. Monitoring outage with no compensating manual watch.
9. Credential exposure (invite secrets, admin secret, Clerk secrets, SSH keys).

### N12. Final verdict (Prompt 8)

### Ready for internal testing only

**Not** ready for tightly controlled trusted private beta, broader private beta, public beta, or production.

**Why (gate language):** Tunnel cleanup, live PathGen authentication, live Dallas entitlement deploy, real Dallas routing, clean installation, and monitoring alert delivery have **not** all been verified. Live PathGen spoof probe **failed** the auth gate. Live Dallas is behind local ops/health code. Packaged Windows + Fortnite matrices were **not** executed in this session.

---

## O. Prompt 9 — Deploy and verify PathGen Clerk authentication fix (2026-07-17 late evening)

**Evidence classes used:** Local code · Live beta deployment · Mock testing (pre-deploy suite) · Real external verification (Railway + Clerk Backend API session JWTs)

### O1. Pre-deployment snapshot

| Item | Value |
|------|-------|
| Railway workspace | Elizabeth Bender's Projects |
| Railway project | `Routelag bot` (`8403b85c-6f18-4841-989f-20689dd5d744`) |
| Railway service | `Routelag-Stationary-Server-bot` (`6dfd2e21-780b-4f84-8a73-e1a65b4ad7d5`) |
| Environment | `production` (`82d7fe98-07e1-47b5-81f9-3c5e3db911cf`) |
| Public URL | `https://routelag-stationary-server-bot-production.up.railway.app` |
| **Rollback release** | git `953dbe46c105f49b3d3b922243f129a814af9565` · deployment `7183d541-528e-4ad7-8809-843f35323ed0` |
| Pre-fix live behavior | Spoof `clerkUserId` / email without JWT → **200 + token** (unsafe) |
| Pre-fix `/health` | Exposed `supabaseUrl` + `supabaseKeyRole:"service_role"` |

**Env var names present before Clerk config (names only; values never printed):**  
`BASIC_PARSE_PLAYERS_ONLY`, `DEEP_ANALYZE_*`, `DISCORD_*`, `EPIC_*`, `OSIRION_*`, `PATHGEN_AUTH_SECRET`, `PATHGEN_HOST`, `PATHGEN_INVITE_CODES`, `PATHGEN_SERVICE_API_KEY`, `PORT`, `RAILWAY_*`, `REPLAY_*`, `SUPABASE_*`

**Missing before deploy (blocking):** `CLERK_ISSUER`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWKS_URL`, `NODE_ENV` / `PATHGEN_*` auth locks.

**Clerk config applied before code deploy (pk_test instance):**

| Variable | Status |
|----------|--------|
| `CLERK_ISSUER` | Set → `https://crucial-clam-33.clerk.accounts.dev` |
| `CLERK_PUBLISHABLE_KEY` | Set (`pk_test_…`, len 55) |
| `CLERK_JWKS_URL` | Set → issuer `/.well-known/jwks.json` (JWKS reachable, 1 key) |
| `CLERK_AUDIENCES` | Not set (audience check skipped) |
| `CLERK_AUTHORIZED_PARTIES` | Not set (azp check skipped) |
| `NODE_ENV` / `PATHGEN_ENV` | `production` |
| `PATHGEN_ALLOW_INVITE_LOGIN` | `false` |
| `PATHGEN_REQUIRE_CLERK_SUBJECT` | `true` |
| `PATHGEN_AUTH_SECRET` | Present (rotated after healthy auth proof) |

Config backup (names + rollback IDs only): `pathgen-server/secrets/pre-deploy-backups/prompt9-*.json` (gitignored).

### O2. Local verification before deploy

| Check | Result | Class |
|-------|--------|-------|
| `npm test` in `pathgen-server/` | **23/23** then **24/24** after isolation hotfix | Local + mock JWKS |
| `npm run build` | pass | Local |
| Fixed files present | `clerkAuth.ts`, `auth.ts`, `app.ts`, replay/user ownership routes, health redact | Local code |

### O3. Deployment

| Step | Result |
|------|--------|
| Deploy target | PathGen Railway service only (no desktop / routing VPS / HUD / installer) |
| Ship path | Push to `WrenchDevelops/Routelag-Stationary-Server-bot` `main` → Railway GitHub deploy; second push required manual `railway redeploy --from-source` |
| Auth fix commit | `2b849847be99b5d471cf1f6118c893d96160bbe4` |
| Isolation hotfix commit | `6947ebc923ab7dbd9865ed748748d2d7b722b37c` |
| Live version after hotfix | `0.1.0+6947ebc` (`service: pathgen`) |
| Post-rotation deployment | `34cd3183-da9d-4709-91ac-ae79fae9f67c` (secret rotate redeploy; same git SHA) |
| Health after deploy | `{"ok":true,"service":"pathgen","version":"0.1.0+6947ebc"}` only — no Supabase/Clerk/secret fields |
| Logs | No JWT-shaped strings observed in recent tail; startup still logs Supabase URL internally (not public health) |
| Invite login | Live invite-only `/api/auth/login` + `/api/beta/login` → **401** |

**Hotfix found during live isolation (not in original mock suite):**  
`migrateInviteOwnership("clerk")` treated the shared Clerk sentinel invite as a migratable code and moved jobs across accounts. Fixed before completion gate: skip `"clerk"` / emails; only allowlisted invites migrate; cloud hydrate refuses to overwrite another tester’s rows. Regression test added.

### O4. Required live test table

| Live test | Expected | Actual | Status |
|-----------|----------|--------|--------|
| Spoof `clerkUserId` without JWT | 401 | 401 | Pass |
| Spoof email without JWT | 401 | 401 | Pass |
| Invalid signature / random JWT | 401 | 401 | Pass |
| Expired JWT | 401 | 401 | Pass |
| Untrusted signing key | 401 | 401 | Pass |
| Wrong issuer | 401 | 401 | Pass |
| Wrong audience / azp | 401 when configured | **N/A** — `CLERK_AUDIENCES` / `CLERK_AUTHORIZED_PARTIES` not set | N/A |
| Body identity override | Ignored | Ignored — testerId = `stableClerkTesterId(JWT.sub)`; invite claim forced to `clerk` | Pass |
| Valid Clerk JWT exchange | 200 | 200 + PathGen token minted (token values redacted) | Pass |
| Cross-account replay/job read | 403/404 | **404** (job read + list exclusion) after hotfix | Pass |
| Cross-account replay/job delete | 403/404 | **404** | Pass |
| Old PathGen token after rotation | Rejected | **401** on `/api/replays/quota` and `/api/replays/jobs` | Pass |
| New token after rotation | Usable | **200** quota with freshly exchanged token | Pass |
| Desktop-equivalent exchange | Succeeds | `pathgenLogin` contract (Bearer Clerk JWT + `clerkSessionToken`) → **200** | Pass |
| Full desktop GUI session | Optional proof | **Not executed** (API contract verified; Replay UI still feature-flagged off in Core builds) | Partial |

Real Clerk JWTs were minted via Clerk Backend API (`sk_test_`) for an existing user + one disposable test user. Token values were never written into this audit.

### O5. Small Deployment Audit

| Field | Detail |
|-------|--------|
| **Original blocker** | Live Railway PathGen accepted client-supplied `clerkUserId` / email without Clerk JWT and minted PathGen tokens (replay IDOR risk). |
| **Exact files or services changed** | **Local/deploy repo** `pathgen-server` → GitHub `Routelag-Stationary-Server-bot`: `src/clerkAuth.ts` (new), `src/auth.ts`, `src/app.ts`, `src/config.ts`, `src/replays/replayStore.ts`, `src/replays/routes.ts`, `src/users/*`, `src/routing/routes.ts`, tests, `.env.example`, `README.md`, `package.json` (+ `jose`). **Service:** Railway `Routelag-Stationary-Server-bot` only. |
| **Configuration changed** | Added `CLERK_ISSUER`, `CLERK_PUBLISHABLE_KEY`, `CLERK_JWKS_URL`, `NODE_ENV=production`, `PATHGEN_ENV=production`, `PATHGEN_ALLOW_INVITE_LOGIN=false`, `PATHGEN_REQUIRE_CLERK_SUBJECT=true`. **Rotated** `PATHGEN_AUTH_SECRET` after healthy auth proof. Audience/azp left unset. |
| **Deployment target** | Live Railway production PathGen (`routelag-stationary-server-bot-production.up.railway.app`). Not staging. Not desktop/VPS/HUD. |
| **Tests run** | Local `npm test` **24/24**; `npm run build` pass. |
| **Live probes performed** | Negative spoof/JWT matrix; positive Clerk exchange; body override; invite reject; cross-account job isolation; secret rotation reject/re-mint; health redact; desktop API-contract exchange. |
| **Results** | Spoof path closed; Clerk JWT required; identity from JWT `sub` only; isolation holds after hotfix; health minimal; secret rotated; old tokens dead. |
| **Rollback procedure** | Prefer **disable PathGen / keep Replay off** over restoring spoofable auth. If ops emergency only: Railway rollback to deployment `7183d541-528e-4ad7-8809-843f35323ed0` / git `953dbe4` **and immediately disable Replay + public login**; do **not** re-expose spoofable login. Clerk env vars can remain. Re-rotate `PATHGEN_AUTH_SECRET` if rolling back after the new secret. |
| **Remaining risks** | (1) `CLERK_AUDIENCES` / `CLERK_AUTHORIZED_PARTIES` unset — weaker JWT binding than fully locked desktop azp/aud. (2) Brief window before isolation hotfix could have reassigned some `inviteCode:"clerk"` jobs in local/cloud store during probes — ops should review `pathgen_replay_jobs` ownership if any real user data existed. (3) Full packaged desktop GUI PathGen login not exercised. (4) Replay product still should stay feature-flagged off in Core builds until broader beta gates pass. (5) Using `pk_test_` Clerk on Railway production PathGen — acceptable for trusted private beta only; move to `pk_live_` before public. |
| **Blocker status** | **Resolved** (PathGen live auth / spoof / isolation / health / secret rotation gate) |
| **Safe for** | **Trusted private beta** (PathGen authentication). **Not** a green light for public beta or for enabling Replay in Core marketing builds by itself. Overall product remains limited by other section-N blockers (tunnel E2E, Dallas entitlement deploy, monitoring, legal, etc.). |
| **Exact next step** | Keep Replay disabled in Core installer flags; optionally set `CLERK_AUTHORIZED_PARTIES` / `CLERK_AUDIENCES` to the desktop app identities; audit Supabase `pathgen_replay_jobs` rows touched during Prompt 9 probes; proceed to next private-beta blocker (Dallas entitlement live deploy or Windows tunnel E2E). |

### O6. Completion gate checklist

| Gate | Met? |
|------|------|
| Deployed service rejects spoofed identity | Yes |
| Real Clerk JWT succeeds | Yes |
| Cross-account replay tests fail safely | Yes (after hotfix `6947ebc`) |
| `PATHGEN_AUTH_SECRET` rotated | Yes |
| Desktop completes the real exchange | Yes at API-contract level (`ensurePathGenSession` / `pathgenLogin`); GUI not run |
| Public health endpoint redacted | Yes |
| Replay enablement | **Remain disabled** in Core builds until product owners explicitly re-enable after other beta gates |

---

## P. Prompt 10 — Deploy hardened routing server to Dallas beta (2026-07-17 / 2026-07-18)

**Evidence classes used:** Local code · Mock testing (pre-deploy suite) · Real external verification (public Dallas probes only) · **Live beta deployment: not started**

### P1. Pre-deployment snapshot (public / local only)

| Item | Value |
|------|-------|
| Target host | `216.152.154.137` (Dallas beta API `:3001`, WG `:51820`) |
| Deploy path (documented) | `/opt/routelag-server` via `scripts/deploy-server-to-dallas.mjs` |
| Process manager (documented) | `systemctl` unit `routelag-api` |
| SSH access this session | **Blocked** — `Permission denied (publickey,password)` in BatchMode; no local SSH private key; no stored Dallas password in env / Credential Manager / repo secrets |
| Local server package | `routelag-server@0.1.0` |

**Live Dallas before deploy (real external verification):**

| Probe | Result |
|-------|--------|
| `GET http://216.152.154.137:3001/health` | **200** — still **unredacted** (exposes `endpoint`, `publicIp`, `tunnelCidr`, `serverTunnelIp` for Dallas + Ashburn) |
| `GET http://216.152.154.137:3001/healthz` | **404** — new build **not** active |
| Ashburn in catalog | Listed `online` / `canStart:true` via Dallas health |

**Could not record on-host (requires SSH):** current systemd unit file, live `.env` names/values, UFW rules, `wg show`, active peers, peers.json / runtime-controls.json. **No backup was taken** because SSH never opened.

### P2. Local pre-deploy gate (completed)

| Check | Result | Class |
|-------|--------|-------|
| `npm test` in `server/` | **46/46 pass** | Mock testing |
| `npm run build` in `server/` | **pass** (`tsc`) | Local code |
| Hardened features present in repo | Entitlement exchange/enforce, peer TTL, heartbeat, capacity, per-user/device concurrency, node/global/user/app emergency controls, expire-peers, redacted `/health`, `/healthz` | Local code |

### P3. Required beta configuration (planned — not applied)

Use existing env names from `server/src/config.ts` / `server/.env.example` (ZER0_* preferred, ROUTELAG_* legacy fallback). Planned Dallas beta values:

| Intent | Env name(s) | Planned value |
|--------|-------------|---------------|
| Dallas API bind | `ROUTELAG_API_HOST` / `ZER0_API_HOST` | `0.0.0.0` |
| Port | `ROUTELAG_API_PORT` | `3001` |
| Beta mode | `ROUTELAG_BETA_MODE` | `dallas` |
| Peer mode | `ROUTELAG_PEER_MODE` | `wg` |
| Dallas enabled / Ashburn off | `ROUTELAG_DISABLED_NODE_IDS` | `ashburn-beta` (and/or nodes.json with Ashburn unavailable) |
| Max active peers (cap 4) | `ROUTELAG_MAX_PEERS_PER_NODE` + `ROUTELAG_NODE_CAPACITY_HEADROOM` | e.g. `5` + `1` → effective create limit **4** |
| Per-user / per-device | `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER` / `_PER_DEVICE` | `1` / `1` |
| Entitlement required | `ROUTELAG_REQUIRE_ROUTING_ENTITLEMENT` | `true` |
| Non-prod allowlist (not generic prod bypass) | `ROUTELAG_DEPLOYMENT_ENV` + `ROUTELAG_ALLOW_INTERNAL_ROUTING_ENTITLEMENT` + `ROUTELAG_INTERNAL_ROUTING_USER_IDS` | `internal` (or `staging`), `true`, explicit Clerk `user_…` subjects only |
| Admin secret | `ROUTELAG_ADMIN_SECRET` | Must be set (non-placeholder) on VPS |
| Peer TTL / heartbeat | `ROUTELAG_PEER_TTL_HOURS` / `ROUTELAG_PEER_HEARTBEAT_GRACE_MINUTES` | keep `8` / `20` unless shortened for TTL test |
| Clerk JWKS | `CLERK_ISSUER` / `CLERK_JWKS_URL` / `CLERK_PUBLISHABLE_KEY` (+ optional `CLERK_SECRET_KEY`) | pk_test instance already used for PathGen |

**Local `server/.env` is not safe to copy to Dallas as-is:** `ROUTELAG_PEER_MODE=mock`, localhost bind, placeholder-looking auth/admin secrets, no entitlement/Clerk/capacity beta knobs.

**Desktop `.env.local` has `pk_test` / `sk_test` Clerk keys** usable for live auth tests after deploy — values not written here.

### P4. Deployment

| Step | Result |
|------|--------|
| Backup app / peers / controls / systemd / WG | **Not performed** (no SSH) |
| Maintenance mode entry | **Not performed** |
| Upload / extract / `npm ci` / restart `routelag-api` | **Not performed** |
| Live entitlement / peer / emergency matrix | **Not performed** |

### P5. Required live control table (incomplete)

| Live control | Result | Evidence | Remaining risk |
|--------------|--------|----------|----------------|
| `/healthz` | **Fail (pre-deploy)** | Live **404** | Uptime probes fail against current host |
| Redacted `/health` | **Fail (pre-deploy)** | Live still leaks endpoints/CIDRs/IPs | Info disclosure |
| Free-user denial | Not run | — | Unauthorized routing if old build remains |
| Internal tester allow | Not run | — | — |
| Forged entitlement denial | Not run | — | — |
| Per-user concurrency | Not run | — | — |
| Capacity cap of 4 | Not run | — | Defaults on old build allow far more |
| Heartbeat | Not run | — | — |
| Peer end | Not run | — | — |
| Peer TTL | Not run | — | Abandoned peers may linger |
| Maintenance mode | Not run | — | — |
| Dallas disable | Not run | — | — |
| Ashburn disabled | **Fail (pre-deploy)** | Live health lists Ashburn online | Ashburn offered to clients |
| Emergency peer cleanup | Not run | — | — |

### P6. Small Deployment Audit

| Field | Detail |
|-------|--------|
| **Original blocker** | Live Dallas still on pre–Prompt 5/ops build: `/healthz` 404, `/health` leaks node endpoints/CIDRs/IPs, entitlement/capacity/emergency controls only verified locally, Ashburn still offered. |
| **Exact files or services changed** | **None on Dallas.** Local verification only against existing `server/` tree. |
| **Configuration changed** | None on live VPS. |
| **Deployment target** | Intended: Dallas live beta VPS `216.152.154.137` `/opt/routelag-server` + `routelag-api`. **Not deployed.** Not staging. Not Ashburn. Not PathGen/Railway. |
| **Tests run** | Local `server` **46/46**; `npm run build` pass. |
| **Live probes performed** | Public `/health` (200, leaky) and `/healthz` (404). SSH BatchMode denied. |
| **Results** | Pre-deploy gates green locally; live host unchanged; deploy **stopped** for missing SSH credentials. |
| **Rollback procedure** | N/A this session (no deploy). Documented intended rollback after a future deploy: restore pre-deploy tarball of `/opt/routelag-server` + prior `.env` + `data/*` + systemd unit from backup dir, `systemctl restart routelag-api`, re-probe `/healthz` + peer create/end. |
| **Remaining risks** | Entire Prompt 10 completion gate unmet on the real server. Old build remains authoritative for testers. |
| **Blocker status** | **Blocked** |
| **Safe for** | **Internal testing** of local code only. **Not** safe to call Dallas live entitlement/ops ready for trusted private beta. |
| **Exact next step** | Provide Dallas **root SSH password** (or install an agent SSH key for `root@216.152.154.137`), then resume Prompt 10: backup → maintenance → deploy hardened build → apply beta env (cap 4, Ashburn disabled, entitlement + Clerk + admin secret) → run full live auth/peer/emergency matrix → exit maintenance only after gates pass. Do not fabricate env names; do not live-charge billing. |

### P7. Completion gate checklist

| Gate | Met? |
|------|------|
| New server build active on Dallas | No |
| `/healthz` works | No (404) |
| Public health redacted | No |
| Ashburn disabled | No |
| Free users cannot create routes | Unverified live |
| Internal authorized users can create routes | Unverified live |
| Real peers create/remove | Unverified live |
| Capacity limited to 4 | Unverified live |
| Emergency controls work | Unverified live |
| No test peer remains | N/A (no peer tests) |

---

## Q. Prompt 11 — Desktop route heartbeats (2026-07-17 / 2026-07-18)

### Q1. Classification

| Layer | Status |
|-------|--------|
| Local code | Heartbeat client wired in desktop `routeEngine` / `routeHeartbeat` / API client |
| Staging deployment | Not used |
| Live beta deployment | Dallas still on pre–Prompt 10 health surface (`/healthz` 404); heartbeat path exists (401 unauthenticated) but **no** authenticated live cadence/TTL proof this session |
| Mock testing | Desktop unit tests with fake timers (17/17) |
| Real external verification | Public probes only — no approved-tester Dallas connect |

### Q2. Inspect findings (before change)

| Area | Finding |
|------|---------|
| Server | `POST /api/routes/heartbeat` already implemented; refreshes `lastHeartbeatAt`; recommended cadence 5 min in create response `expiresAtHint` |
| Desktop | **No** client calls to `/api/routes/heartbeat` |
| Fallback | Absolute peer TTL still protects abandoned peers, but active sessions without heartbeats risk grace expiry |
| Lifecycle | Connect/disconnect/close/rollback/logout paths existed without heartbeat start/stop |

### Q3. Local code changes

| File | Change |
|------|--------|
| `routelag-desktop/src/lib/routeHeartbeat.ts` | **New** controller: 5‑min cadence, singleton/no duplicate timers, bounded backoff, permanent vs temporary failure classification, device bind, entitlement refresh (force on auth expiry) |
| `routelag-desktop/src/lib/routeHeartbeat.test.ts` | **New** deterministic tests (17) |
| `routelag-desktop/src/lib/api.ts` | `heartbeatRouteSession()`; create response `expiresAtHint` typing |
| `routelag-desktop/src/lib/routeEngine.ts` | Start heartbeat after server confirms create; stop on disconnect/rollback/restore; resume helper; permanent-failure callback hook |
| `routelag-desktop/src/App.tsx` | Logout/close stop; resume after reload when tunnel+session active; safe disconnect on permanent rejection |
| `routelag-desktop/src/types.ts` / `optimizeLabels.ts` / `LiveSessionPage.tsx` | `degraded` optimize state + UI copy |
| `routelag-desktop/package.json` | `test:heartbeat` / `test` scripts |

**Not changed:** Dallas VPS config, PathGen, billing, Overwolf publish, production DNS, server heartbeat contract (already present).

### Q4. Behavior map (desktop)

| Route state | Heartbeat |
|-------------|-----------|
| Starting (pre-create) | Off |
| Server create confirmed | Timer scheduled (first tick after cadence) |
| Active / optimized | Running |
| Degraded (temp outage) | Running with bounded backoff; UI degraded |
| Ending / disconnect starts | Stopped immediately |
| Ended / rollback / restore | Stopped |
| Stale local leftovers | Not auto-recreated from heartbeat failure |
| Recovery-required | Resume only if local active session **and** tunnel connected/connecting |

Stops also on: logout, app close, session ownership/device mismatch, permanent 401/403/404.

### Q5. Required tests (automated)

| Scenario | Expected | Automated result | Live result |
|----------|----------|------------------|-------------|
| Route becomes active | Heartbeat starts after create | **Pass** (schedule after `start`) | Not run — no authenticated Dallas connect |
| No heartbeat before create | No timer/requests | **Pass** | N/A |
| Five-minute cadence | 300_000 ms | **Pass** | Not run |
| Duplicate timers prevented | One timer | **Pass** | Not run |
| Normal disconnect | Heartbeat stops | **Pass** | Not run |
| Logout / app exit | Heartbeat stops | **Pass** | Not run |
| Desktop force-kill | Heartbeat stops; peer expires via grace/TTL | Client stop on exit wired; **server TTL not live-proven** | Not run |
| Temporary outage | Bounded retry / degraded | **Pass** | Not run |
| Entitlement expires | Safe disconnect | **Pass** | Not run |
| Session missing | Safe disconnect | **Pass** | Not run |
| User blocked | Safe disconnect | **Pass** | Not run |
| Maintenance | Degraded; no new route | **Pass** | Not run |
| Wrong device ID | Rejected locally | **Pass** | Not run |
| Duplicate renderer load | One timer | **Pass** | Not run |

### Q6. Commands run

| Check | Class | Result |
|-------|-------|--------|
| `npm run test:heartbeat` (desktop) | Mock testing | **17/17 pass** |
| `npx tsc --noEmit` + `npm run build` (desktop) | Local code | **pass** |
| `cargo test` (`routelag-desktop/src-tauri`) | Local code | **17 passed** |
| `npm test` + `npm run build` (server) | Mock / local | **46/46 pass**; build pass |
| `GET /healthz` Dallas | Live probe | **404** (Prompt 10 still blocked) |
| `POST /api/routes/heartbeat` unauthenticated | Live probe | **401** (route present; auth required) |

### Q7. Small Deployment Audit

| Field | Detail |
|-------|--------|
| **Original blocker** | Desktop never called `/api/routes/heartbeat`; active sessions could hit heartbeat grace expiry despite absolute TTL fallback. |
| **Exact files or services changed** | Desktop files listed in Q3 only. **No** Dallas/service deploy. |
| **Configuration changed** | None on VPS. Client uses server `recommendedHeartbeatMinutes` (default 5) with ≥1 min floor. |
| **Deployment target** | Local code only. Intended live target remains Dallas `216.152.154.137:3001` after Prompt 10. |
| **Tests run** | Desktop heartbeat 17/17; desktop tsc+build; Rust 17; server 46/46 + build. |
| **Live probes performed** | `/healthz` 404; unauthenticated heartbeat **401**. No internal-tester connect; no `lastHeartbeatAt` cadence proof; no abandoned-peer expiry proof. |
| **Results** | Local wiring + negative/positive unit tests **pass**. Completion gate for **trusted private beta** (real Dallas heartbeats + abandoned expiry) **not met**. |
| **Rollback procedure** | Revert desktop commits/files in Q3; rebuild desktop. No server rollback needed (server unchanged). |
| **Remaining risks** | Prompt 10 deploy still blocked; live grace/TTL behavior unverified on Dallas; first live heartbeat still waits one cadence after create (by design); logout while connected triggers async stop best-effort. |
| **Blocker status** | **Partially resolved** |
| **Safe for** | **Internal testing** of local desktop builds. **Not** yet safe to mark trusted private beta complete for heartbeats. |
| **Exact next step** | Finish Prompt 10 Dallas deploy, then connect an approved internal tester, confirm server `peer_heartbeat` / `lastHeartbeatAt` updates ~every 5 minutes, force-kill desktop and confirm peer expiry after grace/TTL, relaunch for stale recovery, then normal disconnect with no further heartbeats. |

### Q8. Completion gate

| Gate | Met? |
|------|------|
| Desktop sends authenticated heartbeats while routing | Local code **yes**; live Dallas **unverified** |
| Deployed Dallas shows real heartbeat updates | **No** |
| Abandoned session expires automatically | Server logic exists; **live unproven** this session |
| Mark resolved for trusted private beta | **No** — remains partial until live matrix passes |

---

## R. Prompt 12 — Configure real monitoring and alert delivery (2026-07-17 / 2026-07-18)

**Evidence classes used:** Local code · Live beta deployment (Dallas public probes only; no VPS config change) · Mock/proof testing (controlled failing probe) · Real external verification (GitHub Issues alert + recovery to owner **WrenchDevelops**) · Staging deployment: not used

### R1. Pre-state

| Item | Finding |
|------|---------|
| Dallas `/health` | **200**, ~100–135 ms; still unredacted; lists `dallas-beta` online |
| Dallas `/healthz` | **404** (Prompt 10 still undeployed) |
| SSH to Dallas | Still unavailable (no local private key) |
| External monitor | None previously |
| Alert destination | None previously |
| Existing code | `/healthz` + admin `/api/admin/status` + `scripts/beta-uptime-probe.sh` in repo; not wired live |

### R2. Approach chosen (no-cost / existing tooling)

| Choice | Detail |
|--------|--------|
| External monitor | GitHub Actions `.github/workflows/dallas-beta-monitor.yml` on public repo `WrenchDevelops/Routelag` (probes from GitHub runners, **not** from Dallas) |
| Probe | `scripts/beta-dallas-monitor.mjs` — prefer `/healthz`, fall back `/health`; latency; node id check; optional admin metrics |
| Alert destination | GitHub Issues labeled `dallas-beta-monitor` → named owner **WrenchDevelops** |
| Optional Discord | Repo secret `DISCORD_WEBHOOK_URL` (unset this session — not sent) |
| Optional admin metrics | Repo secret `DALLAS_ADMIN_TOKEN` (unset — **stopped** host/WG/counter live checks rather than guessing secrets) |
| Paid vendors | Not signed up (UptimeRobot/Better Stack not required) |

### R3. Thresholds documented

See `docs/BETA_MONITORING.md`. Minimums applied:

| Signal | Beta threshold |
|--------|----------------|
| API health unavailable | 2 consecutive external checks |
| API latency | > 2000 ms (runner→API) |
| CPU | load1m ≥ 0.85 (admin) |
| Memory | > 85% (admin) |
| Disk | > 80% (admin) |
| Peer count | ≥ 4 (admin) |
| Peer cleanup failure | any `peerExpireFail` (admin) |
| Repeated route-create failures | `peerCreateFail` ≥ 3 (admin) |
| WireGuard stopped | VPS/runbook (not public HTTP) |
| Process restart loop | journal/`startedAt` heuristic (runbook) |

### R4. Files added/changed (local code only; no Dallas VPS edit)

| Path | Change |
|------|--------|
| `.github/workflows/dallas-beta-monitor.yml` | Scheduled ~5 min + workflow_dispatch external probe/alert |
| `scripts/beta-dallas-monitor.mjs` | Public (+ optional admin) probe |
| `scripts/beta-dallas-alert.mjs` | GitHub Issue (+ optional Discord) delivery |
| `scripts/beta-uptime-probe.sh` | `/healthz` with `/health` fallback |
| `docs/BETA_MONITORING.md` | Thresholds + final table |
| `docs/BETA_INCIDENT_RUNBOOK.md` | Concise beta incident runbook |
| `docs/ZER0_FULL_PRODUCT_LAUNCH_AUDIT_2026-07-17.md` | Prompt 12 subsection (this section) |

Working-tree-only (not part of monitoring commit if dirty with unrelated prior edits): `docs/ROUTING-TUNNEL.md`, `server/.env.example` — canonical monitoring docs are `BETA_MONITORING.md` / runbook.

**Not changed:** Dallas systemd/env, production DNS, billing, Overwolf, PathGen.

### R5. Required proof tests

| Test | Method | Result |
|------|--------|--------|
| Controlled failing probe without killing routing | `PROBE_URL=…/healthz` (404) locally; GHA `force_fail=true` ×2 | **Pass** — local exit 1; GHA second run failed and alerted |
| Alert generated | Local proof + GHA consecutive fail | **Pass** — [#1](https://github.com/WrenchDevelops/Routelag/issues/1) (local proof), [#3](https://github.com/WrenchDevelops/Routelag/issues/3) (GHA external) |
| Alert reaches real destination | GitHub Issues for **WrenchDevelops** | **Pass** |
| Restore normal service probe | Default `/health` 200 + GHA healthy dispatch | **Pass** — [run 29630694001](https://github.com/WrenchDevelops/Routelag/actions/runs/29630694001), [run 29630727217](https://github.com/WrenchDevelops/Routelag/actions/runs/29630727217) |
| Recovery notification | proof-recovery + GHA healthy after #3 | **Pass** — [#1](https://github.com/WrenchDevelops/Routelag/issues/1) and [#3](https://github.com/WrenchDevelops/Routelag/issues/3) closed with recovery |
| Monitor displays correct Dallas node | Healthy result `dallas-beta` | **Pass** |
| No secrets/user data in alert | Scanned #1/#3 bodies | **Pass** |
| Intentional WG/API kill for users | **Not performed** | N/A by design |

### R6. Final monitor table (session)

| Monitor | Active | Threshold | Alert destination | Test alert received |
|---------|--------|-----------|-------------------|---------------------|
| API health | **Yes** — GHA scheduled + dispatch proven | 2 consecutive fails | GitHub Issues → WrenchDevelops | **Yes** (#1 local, **#3 from GHA**) |
| API latency | **Yes** | > 2000 ms | Same | Enforced (healthy ~100 ms) |
| WireGuard state | Partial | service stopped | Runbook / future admin | **No** live WG probe |
| CPU | Blocked pending `DALLAS_ADMIN_TOKEN` | load1m ≥ 0.85 | Same | Skipped |
| Memory | Blocked pending admin token | > 85% | Same | Skipped |
| Disk | Blocked pending admin token | > 80% | Same | Skipped |
| Peer count | Blocked pending admin token | ≥ 4 | Same | Skipped |
| Peer cleanup failure | Blocked pending admin token | expire fail > 0 | Same | Skipped |
| Entitlement failure | Pending Prompt 10 + admin | create/entitlement errors | Same | Not live |

### R7. Small Deployment Audit

| Field | Detail |
|-------|--------|
| **Original blocker** | Monitoring code/probes existed but `/healthz` undeployed, no external monitor, no alert destination, no real outage alert received. |
| **Exact files or services changed** | Files in R4. GitHub label `dallas-beta-monitor` created. Issues #1/#2 created for proof. **No** Dallas VPS files/services changed. |
| **Configuration changed** | GitHub Issues alert routing to owner WrenchDevelops. Optional secrets `DISCORD_WEBHOOK_URL` / `DALLAS_ADMIN_TOKEN` **not** set. |
| **Deployment target** | Local repo + GitHub Actions on `WrenchDevelops/Routelag` (external). **Not** Dallas live binary deploy. **Not** staging. **Not** PathGen/Railway. |
| **Tests run** | Healthy Dallas probe (pass); `/healthz` 404 fail probe (pass); FORCE_FAIL (pass); local proof outage/recovery issues; **GHA** healthy success; **GHA** force_fail ×2 → issue #3; **GHA** recovery close #3; secret pattern scan (pass). |
| **Live probes performed** | `GET /health` 200; `GET /healthz` 404; latency ~100–135 ms; node `dallas-beta` present; external GHA runners confirmed. |
| **Results** | API health + latency external monitoring **active** on `main` with real owner alert + recovery proven from GitHub runners. Host/WG/peer-counter monitors documented but **not** live without admin token + VPS access. `/healthz` still 404 on Dallas. |
| **Rollback procedure** | Disable/delete workflow `.github/workflows/dallas-beta-monitor.yml`; close monitor issues; remove label if desired. No Dallas rollback needed (unchanged). |
| **Remaining risks** | GHA cron drift; cache-based consecutive-failure state can reset; `/health` still leaky until Prompt 10; admin/WG/CPU/mem/disk/peer failure alerts inactive without secrets/SSH; Discord not wired; entitlement monitors pending live entitlement deploy. |
| **Blocker status** | **Partially resolved** |
| **Safe for** | **Internal testing**; **Trusted private beta** for **API up/down + latency alerts to owner WrenchDevelops**. **Not** public beta. Full ops monitoring (WG/host/peer counters) still incomplete. |
| **Exact next step** | (1) Set GitHub secret `DALLAS_ADMIN_TOKEN` to the **live** Dallas admin secret (not local mock `.env`). (2) Optionally set `DISCORD_WEBHOOK_URL`. (3) Finish Prompt 10 so `/healthz` is live. (4) Re-verify admin metric alerts once token is set. |

### R8. Completion gate

| Gate | Met? |
|------|------|
| External monitor active | **Yes** — workflow on `main`, schedule `*/5 * * * *`, healthy GHA run succeeded |
| Real test alert received | **Yes** — #1 (local proof), **#3 (GHA external force_fail)** |
| Recovery alert received | **Yes** — #1 and #3 closed with recovery |
| Incident runbook documented | **Yes** — `docs/BETA_INCIDENT_RUNBOOK.md` |
| Named owner/destination receives future alerts | **Yes** — WrenchDevelops via `dallas-beta-monitor` issues |
| Full metric set (WG/CPU/mem/disk/peer failures) live | **No** — blocked on admin token + VPS |
| Mark fully resolved for trusted private beta | **Partial** — API health/latency alerting **yes**; full ops matrix **no** |

---

## S. Prompt 13 — Elevated clean-Windows routing + Fortnite matrix (2026-07-17 / 2026-07-18)

**Evidence classes used:** Local code (artifact inventory only) · Live beta deployment (Dallas health read-only) · Mock testing (none this session) · Real external verification (**blocked** — matrix not executed)

**Verdict upfront:** **Blocked** before install / tunnel / Fortnite. No Windows networking mutation, no installer run, no Dallas peer create, no Fortnite launch through Zer0 in this pass.

### S1. Safety gate (stop conditions evaluated first)

| Safety requirement | Observed on `DESKTOP-VKFPGSR` | Gate |
|--------------------|-------------------------------|------|
| Elevated clean Windows VM **or** dedicated beta-test machine | Bare-metal Windows **11 Home** (`Manufacturer=System manufacturer`, `Model=System Product Name`, `HypervisorPresent=False`); **not** a clean VM; looks like a daily-use host | **FAIL** |
| Session elevated (Administrator) | `net session` / principal check → **not elevated** | **FAIL** |
| VM snapshot or restore point | Restore-point query unavailable without elevation; no Hyper-V VM inventory available | **FAIL / unverified** |
| No irreplaceable network configuration | Active Ethernet only; gateway `172.16.0.1`; DNS `1.1.1.1`/`1.0.0.1`; public IP `209.50.154.xxx` (last octet redacted) | Caution — home/lab LAN |
| Restore Internet instructions outside VM | Doc present in repo: `routelag-desktop/docs/EMERGENCY-CLEANUP.md` | Pass (doc only) |
| Dallas emergency controls accessible | Live Dallas still pre–Prompt 10 (`/healthz` **404**; `/health` still lists node endpoints); admin/expire-peers surface **not** confirmed live | **FAIL for trusted emergency ops** |
| HUD + Replay disabled | Required for Core channel; audited Core installer **missing** so packaged flags not re-verified this session | Incomplete |
| Ashburn disabled | Live health still lists `ashburn-beta` **online** | **FAIL** (ops config) |
| Unrelated VPN present and must remain untouched | `WireGuardManager` service **Running** (Automatic) — unrelated to Zer0 tunnel naming | Risk amplifier — matrix must not touch it; reinforces clean-VM preference |
| Fresh / clean install baseline | Existing **RouteLag Beta** + **Zer0 Beta** ARP both point at `C:\Program Files\RouteLag` with `RouteLag.exe` only (no `Zer0.exe`); `%LOCALAPPDATA%\RouteLag` present; `%LOCALAPPDATA%\Zer0` missing | **FAIL** for “fresh install” without dedicated clean snapshot |
| Audited Core installer present with matching SHA256 | Expected `routelag-desktop/dist/installers/Zer0-Beta-Core-Setup.exe` SHA256 `A273C1D2…F300D4` → **MISSING** (output dir absent) | **FAIL** |

**Stop decision:** Per Prompt 13 safety rules (“do not run on important daily-use machine unless explicitly approved” + required elevated clean VM/dedicated machine + snapshot + Restore Internet outside VM + Dallas emergency controls), the matrix was **not started**. Asking to “run Prompt 13” on this workspace host is **not** treated as explicit approval to mutate this daily-use machine’s networking while the other gates also fail.

### S2. Test artifact inventory (no silent hash substitution)

| Item | Expected (Prompt 7 / N10) | Found this session | Match? |
|------|---------------------------|--------------------|--------|
| Git commit (repo HEAD) | Prompt 7 era artifact | `9d3075667edffdd62f4dc0e8e6af4cba431bb9b9` (“Document Prompt 12…”) | N/A for missing installer |
| Installer path | `…/routelag-desktop/dist/installers/Zer0-Beta-Core-Setup.exe` | **Missing** (`dist/installers` does not exist) | **No** |
| Installer SHA256 | `A273C1D270602D10C4CC764B319516DAD3CB34D4D20F32575712125216F300D4` | Not computable (file absent) | **No** |
| Desktop release exe (build tree) | `AFCA9E2E98316CB6AEA789985A4A4939C3DF11FB5FA98F2A93D7B872D5B8C7B1` | `routelag-desktop\src-tauri\target\release\routelag-desktop.exe` = **same SHA256** | **Yes** (local build tree only) |
| Installed desktop exe | Audited Core payload | `C:\Program Files\RouteLag\RouteLag.exe` = `958862B0…E137B9` | **Different** — not the audited payload |
| Routing engine (build tree + installed) | Record SHA256 | `RouteLagEngine.exe` = `34947BF9C4AFE05C5223EBF151458E7DD3BF0FA05144413A1E0143B056109C51` | Recorded |
| Packager shell (`routelag-setup.exe`) | Not the audited Core distributor | `routelag-installer\…\routelag-setup.exe` SHA256 `B7BA3DAB…8552D0` | Different artifact class — **not used** |
| Legacy Downloads installers | — | `RouteLag Beta v0.1.2/0.1.4 x64 Setup.exe` present under Downloads | **Not** Core Zer0 audited artifact |
| Server version (Dallas live) | Confirm after Prompt 10 | `/health` → `ok=true`, `peerMode=wg`; **no** `version`/`git` fields; `/healthz` **404** | Pre–Prompt 10 surface |
| Dallas configuration version | Cap 4, Ashburn disabled, entitlement on | Live nodes: `dallas-beta` + `ashburn-beta` both online | **Not** beta-hardened config |

**Policy followed:** Did **not** silently substitute `routelag-setup.exe`, NSIS legacy setups, or the older installed `RouteLag.exe` for the audited `Zer0-Beta-Core-Setup.exe`.

### S3. Baseline capture (read-only; before any install — install never started)

| Field | Value (redacted where needed) |
|-------|-------------------------------|
| Windows | Windows 11 Home · build/kernel reported as NT 10.0.26200 |
| Administrator status | **No** (agent shell not elevated) |
| Active adapters | Ethernet **Up** — Intel I211 Gigabit (`04-D9-F5-1F-0B-CB`) |
| DNS | Ethernet → `1.1.1.1`, `1.0.0.1` |
| Route table | Default via `172.16.0.1` on `172.16.0.26`; no persistent routes; no Zer0/WG tunnel routes observed |
| Existing VPN software | `WireGuardManager` Running/Automatic; SSTP service present |
| Existing WireGuard tunnel services | **None** matching `WireGuardTunnel$` / routelag / zer0 names |
| Firewall profiles | Domain/Private/Public all Enabled |
| Link state | Ethernet up; no Wi-Fi adapter observed this session |
| Public IP | `209.50.154.xxx` (octet redacted) |
| Basic connectivity | TCP 8.8.8.8:53 success; ICMP to 1.1.1.1 success |
| Fortnite | Installed `++Fortnite+Release-41.20-CL-55550516-Windows` at `C:\Program Files\Epic Games\Fortnite` |
| Epic Games Launcher | `20.1.4-0+UE5` |
| Anti-cheat services | `EasyAntiCheat_EOS` present, **Stopped** (idle); Epic Online Services stopped |
| Private credentials | **Not** collected / **not** written |

### S4. Matrix execution status

All scenarios below are **Not executed** because the safety gate failed. No local network restoration claim is asserted beyond “baseline left unchanged.”

| Scenario | Result | Local network restored | Server peer removed | Evidence |
|----------|--------|------------------------|---------------------|----------|
| Fresh Zer0 installation | **Not executed** | N/A (no install) | N/A | Audited installer missing; host not clean/elevated |
| Launch without Node/Rust/Vite | **Not executed** | N/A | N/A | — |
| Shortcut / ARP / AppData / migration / unsigned warning / admin explain / Restore Internet UX | **Not executed** | N/A | N/A | Pre-existing dual ARP RouteLag+Zer0 → same `RouteLag` path observed only as baseline dirt |
| Auth matrix (invalid invite / free Clerk / approved / forged entitlement / concurrent / logged-out) | **Not executed** | N/A | N/A | Would also need live Dallas entitlement (Prompt 10 still blocked) for forged/free gates |
| Real Dallas routing | **Not executed** | N/A | N/A | No `POST /api/routes/create`; no WG peer intentionally created |
| Fortnite through tunnel | **Not executed** | N/A | N/A | Fortnite present but not launched for Zer0 E2E |
| Normal disconnect | **Not executed** | — | — | — |
| Normal close while connected | **Not executed** | — | — | — |
| Force-kill recovery | **Not executed** | — | — | — |
| Reboot recovery | **Not executed** | — | — | — |
| Ethernet/Wi-Fi change | **Not executed** | — | — | No Wi-Fi adapter on this host |
| Sleep/wake | **Not executed** | — | — | — |
| API unavailable / entitlement unavailable / maintenance / node disabled / session expired / app blocked / capacity full / auth expires | **Not executed** | — | — | Failure UX not exercised on packaged app |
| Uninstall (preserve data / full wipe) | **Not executed** | — | — | Would risk daily-use install + unrelated `WireGuardManager` |

### S5. Live probes performed (read-only only)

| Probe | Class | Result |
|-------|-------|--------|
| Dallas `GET /health` | Live beta (read-only) | **200** `ok=true` `peerMode=wg`; nodes `dallas-beta`,`ashburn-beta` online; still endpoint-leaky pre–Prompt 10 shape |
| Dallas `GET /healthz` | Live beta | **404** |
| Local route/DNS/service inventory | Local baseline | No Zer0-owned tunnel service; DNS/routes healthy |
| Artifact hunt + SHA256 of build-tree desktop/engine | Local code | Desktop release hash matches Prompt 7 record; Core Setup artifact absent |
| Fortnite / Epic / EAC presence | Local baseline | Present; EAC idle |

**Not performed:** install, elevate, route create, peer inspect, Fortnite session, disconnect/close/kill/reboot/network-change/uninstall, any billing charge, any DNS change, any Overwolf publish.

### S6. Completion gate (Prompt 13)

| Gate | Met? |
|------|------|
| Normal disconnect passes | **No** — not run |
| Normal close passes | **No** — not run |
| Force-kill recovery passes | **No** — not run |
| Reboot recovery passes | **No** — not run |
| Uninstall passes | **No** — not run |
| Unrelated VPN untouched (under test) | **N/A** — matrix not run; baseline `WireGuardManager` left alone |
| Real Dallas route create/end passes | **No** — not run |
| Fortnite launches without Zer0-related anti-cheat error | **No** — not run |
| Mark C1 / C7 tunnel + clean-install blockers resolved | **No** |

### S7. Small Deployment Audit

| Field | Value |
|-------|-------|
| **Original blocker** | C7 Clean-install + Fortnite E2E unverified; C1 tunnel lifecycle unproven on real Windows (also N8 “Tunnel cleanup unproven” / “Clean install / Fortnite E2E”). |
| **Exact files or services changed** | **None.** Audit doc only (`docs/ZER0_FULL_PRODUCT_LAUNCH_AUDIT_2026-07-17.md` section S). No installer, desktop binary, Dallas VPS, DNS, or service mutation. |
| **Configuration changed** | None |
| **Deployment target** | None (matrix blocked pre-deploy / pre-install). Intended future target: elevated **clean Windows VM or dedicated beta machine** + audited Core installer + live Dallas (preferably post–Prompt 10) with Ashburn disabled. |
| **Tests run** | Read-only baseline inventory + Dallas health/healthz probes + artifact/hash verification. **Zero** packaged install / routing / Fortnite matrix cases. |
| **Live probes performed** | Dallas `/health` 200; `/healthz` 404; local adapter/DNS/route/service/Fortnite presence checks. |
| **Results** | Safety gate **failed**. Audited `Zer0-Beta-Core-Setup.exe` **missing**. Host not elevated, not a clean VM, dirty prior RouteLag/Zer0 ARP install, unrelated `WireGuardManager` running, Ashburn still offered live. Matrix **not executed**. |
| **Rollback procedure** | N/A — no changes applied. If a future run leaves the machine broken: follow `routelag-desktop/docs/EMERGENCY-CLEANUP.md` Restore Internet; Dallas admin expire-peers / maintenance **after** Prompt 10 surfaces are live; restore VM snapshot. |
| **Remaining risks** | Largest private-beta risk unchanged: crash/close/reboot/uninstall behavior of the Windows tunnel is still **unproven**. Using this daily-use host would risk the running unrelated WireGuard manager and the user’s LAN. Missing Core installer means any ad-hoc rebuild would need a **new** audited SHA256 before claims can attach to Prompt 7. Live Dallas entitlement + Ashburn disable still pending Prompt 10. |
| **Blocker status** | **Blocked** |
| **Safe for** | **Internal testing** only (code/automated prior evidence). **Not** safe to claim trusted private beta or public beta on the basis of this prompt. |
| **Exact next step** | (1) Provision or designate an **elevated clean Windows VM / dedicated beta PC** with a snapshot + Restore Internet printed/offline copy. (2) Rebuild or restore `Zer0-Beta-Core-Setup.exe`, record new SHA256 if rebuild, or recover the Prompt 7 artifact hash `A273C1D2…F300D4`. (3) Prefer finishing **Prompt 10** (Dallas hardened deploy, Ashburn disabled, entitlement live, emergency controls) before or in parallel with the matrix. (4) Explicitly approve running the matrix on that dedicated host. (5) Re-run Prompt 13 end-to-end and only then reconsider C1/C7. |

---

## T. Prompt 14 — Zer0 Beta Privacy, Terms, Consent, and Tester Agreement (2026-07-17)

### T1. Scope and classes of work

| Class | This prompt |
|-------|-------------|
| Local code | **Yes** — legal drafts, consent gate, links, installer acknowledgement, unit tests |
| Staging deployment | **No** |
| Live beta deployment | **No** |
| Mock testing | **Yes** — `legalConsent` storage unit tests |
| Real external verification | **No** — hosted `/legal/*` URLs not published; packaged-build UI not executed |

**Not claimed:** legal compliance, GDPR/CCPA/COPPA certification, or that documents are ready for public beta.

### T2. Draft documents added

| Document | Path |
|----------|------|
| Pack index | `docs/legal/README.md` |
| Placeholders | `docs/legal/PLACEHOLDERS.md` |
| Privacy Policy | `docs/legal/PRIVACY_POLICY.md` |
| Terms of Service | `docs/legal/TERMS_OF_SERVICE.md` |
| Acceptable Use Policy | `docs/legal/ACCEPTABLE_USE_POLICY.md` |
| Private Beta Tester Agreement | `docs/legal/PRIVATE_BETA_TESTER_AGREEMENT.md` |
| Routing & Network Risk Disclosure | `docs/legal/ROUTING_AND_NETWORK_RISK_DISCLOSURE.md` |
| Diagnostic & Telemetry Disclosure | `docs/legal/DIAGNOSTIC_AND_TELEMETRY_DISCLOSURE.md` |
| Fortnite / third-party disclaimer | `docs/legal/FORTNITE_AND_THIRD_PARTY_DISCLAIMER.md` |
| Data inventory (code-backed) | `docs/legal/DATA_INVENTORY.md` |
| Professional legal-review checklist | `docs/legal/LEGAL_REVIEW_CHECKLIST.md` |
| Bundled in-app copies | `routelag-desktop/public/legal/*.md` |

**Document version:** `2026-07-17.1`

### T3. Placeholder list requiring owner input

All `{{…}}` fields listed in `docs/legal/PLACEHOLDERS.md`, including: legal company name, company address, support email, privacy contact, governing jurisdiction, effective date, minimum age, all retention durations, refund policy, arbitration/dispute terms, beta confidentiality period. **No invented legal identities or addresses.**

### T4. Data inventory summary

Full table: `docs/legal/DATA_INVENTORY.md`. Confirmed collected (not exhaustive): Clerk IDs/email, device ID, route sessions, selected node, tunnel IP, connection times, latency/loss measurements, local logs/crash logs, optional public IP in diagnostics, Clerk billing snapshots, localhost HUD telemetry, replay pipeline when enabled (disabled in Core installer builds). Support communications are user-mediated/external.

### T5. Application screens / files changed

| Surface | File(s) | Change |
|---------|---------|--------|
| First-launch gate | `BetaConsentGate.tsx`, `App.tsx` | Blocks Login/app until all acknowledgements + save |
| Consent storage | `lib/legalConsent.ts` | Version, timestamp, optional Clerk user id, app version, ack IDs |
| Doc viewer | `LegalDocModal.tsx`, `LegalLinks.tsx` | In-app draft viewer (no paid gate) |
| Support URLs | `lib/supportUrls.ts` | Hosted `/legal/*` URL constants |
| Settings → About | `SettingsPage.tsx` | Legal pack version + links |
| Account | `AccountPage.tsx` | Legal links (free to view) |
| Help Center | `HelpCenterPage.tsx` | Legal & disclosures section |
| Login | `LoginPage.tsx` | Compact legal links |
| Styles | `design-system.css` | Consent + modal + link styles |
| Installer welcome | `routelag-installer/.../WelcomePage.tsx`, `App.tsx`, `styles.css` | Links + required acknowledgement checkbox |
| Legacy NSIS footer | `routelag-desktop/installer/routelag-installer.nsi` | Privacy/Terms mention |
| Tests | `legalConsent.test.ts`, `package.json` | 5 unit tests wired into `npm test` |

### T6. Required acknowledgements (first launch)

Private-beta status; unsigned-build warning; network-routing risk; no guaranteed ping reduction; Restore Internet procedure; diagnostic collection; Privacy Policy; Terms; Beta Tester Agreement. Documents also cover AUP, HUD separate/free/optional, replay described-but-disabled-in-Core, Epic/ExitLag non-affiliation, no traffic-content sale, not Tebex.

### T7. Minor-user / privacy-law flags (not independently resolved)

Flagged in `LEGAL_REVIEW_CHECKLIST.md`: minimum age, parental consent, payment by minors, replay data from minors, IP/device data, US state privacy laws, GDPR/UK GDPR if international testers participate.

### T8. Tests run

| Test | Result |
|------|--------|
| `npm run test:legal-consent` | **5/5 pass** |
| `npm test` (desktop: hud-access + heartbeat + legal-consent) | **Pass** |
| `npx tsc --noEmit` (desktop) | **Pass** |
| Packaged-build first-launch UI | **Not run** |
| Hosted URL HTTP probes | **Not run** (URLs not published) |

### T9. UI verification

| Check | Result |
|-------|--------|
| Code paths for gate before Login/authenticated UI | Present (`canUseApp = legalAccepted && authenticated`) |
| In-app docs load from `/legal/*.md` | Bundled under `public/legal/` |
| Screenshots from packaged EXE | **Not available** this pass |

### T10. Completion gate (Prompt 14)

| Gate | Met? |
|------|------|
| All placeholders filled | **No** |
| Qualified owner/lawyer review | **No** |
| Hosted document URLs exist | **No** |
| First-launch acceptance verified in packaged build | **No** |

→ Blocker remains **partially resolved**.

### T11. Small Deployment Audit

| Field | Value |
|-------|-------|
| **Original blocker** | C5 — No Privacy Policy / Terms of Service (also private-beta legal/consent gate). |
| **Exact files or services changed** | See T2–T5. **No** Dallas/PathGen/Railway/DNS/service deploys. **No** Overwolf publish. **No** billing charges. |
| **Configuration changed** | None on servers. LocalStorage key `zer0.legalConsent.v1` used by desktop after acceptance. |
| **Deployment target** | **Local code only** (not staging, not live beta). |
| **Tests run** | `legalConsent` 5/5; full desktop `npm test`; desktop `tsc --noEmit`. |
| **Live probes performed** | None (no hosting yet). |
| **Results** | Draft legal pack + first-launch consent + multi-surface links implemented in repo. Placeholders remain. Hosted URLs absent. Packaged acceptance unverified. |
| **Rollback procedure** | Revert Prompt 14 desktop/installer/docs commits; clear `localStorage` key `zer0.legalConsent.v1` on tester machines if needed. No server rollback required. |
| **Remaining risks** | Documents are drafts with empty legal identity fields; counsel not engaged; minors/international privacy unresolved; hosted 404s if users click “(web)” before publish; acceptance not proven in unsigned Core installer yet. |
| **Blocker status** | **Partially resolved** |
| **Safe for** | **Internal testing** of the consent UX and draft text. **Not** safe to treat as counsel-approved for trusted private beta distribution beyond tightly controlled testers who already accept unsigned software risk. **Not** public beta. |
| **Exact next step** | (1) Owner fills `docs/legal/PLACEHOLDERS.md`. (2) Qualified lawyer reviews pack + inventory. (3) Publish HTML mirrors to support domain `/legal/*`. (4) Rebuild packaged Core installer and verify first-launch gate + document viewer. (5) Only then reconsider C5 toward resolved for trusted private beta. |

---

*End of audit report — 2026-07-17 (sections A–M original; N Prompt 8; O Prompt 9; P Prompt 10 blocked; Q Prompt 11 partial; R Prompt 12 monitoring **partially resolved**; S Prompt 13 Windows/Fortnite matrix **blocked**; T Prompt 14 legal/consent **partially resolved**). Section U (Prompt 15) appended below.*

---

## U. Prompt 15 — Final Trusted Private-Beta Gate Re-Audit (2026-07-17 / 2026-07-18)

**Evidence classes used:** Local code · Mock testing (full automated reruns) · Live beta deployment probes (PathGen Railway + Dallas public API + GHA monitor history) · Real external verification (PathGen spoof/exchange; Dallas health; monitoring destination) · Staging deployment: **not used** · No new deploys · No live billing charges · No Overwolf publish · No production DNS changes

**Required beta configuration (target):** Windows only · ≤5 invited testers · ≤4 concurrent routing sessions · Dallas only · Ashburn disabled · HUD optional/free · Replay disabled unless PathGen live auth passed (it passed — still keep Replay off for Core) · No live public checkout · No guaranteed lower-ping claim · Unsigned installer warning · Manual updates · Real monitoring alert destination active

### U1. Prompt 9–14 reconciliation

| Prompt | Blocker | Prior status | Re-audit status | Required proof this session |
|--------|---------|--------------|-----------------|------------------------------|
| 9 | PathGen spoof / isolation | **Resolved** live | **Still Resolved** | Spoof `clerkUserId` / email → **401**; valid Clerk exchange → **200** (token redacted); health minimal `0.1.0+6947ebc` |
| 10 | Dallas hardened deploy | **Blocked** (no SSH) | **Still Blocked** | `/healthz` still **404**; `/health` still endpoint-leaky + lists Ashburn; entitlement/cap/emergency surfaces not live |
| 11 | Desktop heartbeats | **Partially resolved** (local) | **Partially resolved** | Local heartbeat suite **17/17**; live authenticated cadence / peer TTL **not** proven (needs Prompt 10 + tester session) |
| 12 | Monitoring alerts | **Partially resolved** | **Partially resolved** (API monitor still active) | Healthy local probe **200** `/health` ~101 ms `dallas-beta`; prior GHA alert+recovery issues #1/#3 remain proven; admin metrics still skipped (no `DALLAS_ADMIN_TOKEN`) |
| 13 | Clean Windows + Fortnite matrix | **Blocked** | **Still Blocked** | Audited Core installer **missing**; no elevated clean VM; no tunnel/Fortnite/uninstall run |
| 14 | Legal / consent | **Partially resolved** | **Partially resolved** | Local consent tests **5/5**; placeholders unfilled; hosted URLs absent; packaged first-launch **not** verified |

### U2. Automated suite reruns (exact commands + results)

| Suite | Command | Result | Class |
|-------|---------|--------|-------|
| Server | `npm test` in `server/` | **46/46 pass** | Local + mock |
| Server build | `npm run build` in `server/` | **pass** | Local |
| Server audit | `npm audit --omit=dev` in `server/` | **0 vulnerabilities** | Local |
| PathGen | `npm test` in `pathgen-server/` | **24/24 pass** | Local + mock JWKS |
| PathGen build | `npm run build` in `pathgen-server/` | **pass** | Local |
| PathGen audit | `npm audit --omit=dev` in `pathgen-server/` | **0 vulnerabilities** | Local |
| Desktop unit | `npm test` in `routelag-desktop/` (`hud-access` + `heartbeat` + `legal-consent`) | **10 + 17 + 5 = 32/32 pass** | Local |
| Desktop typecheck | `npx tsc --noEmit` in `routelag-desktop/` | **pass** | Local |
| Desktop production build | `npm run build` in `routelag-desktop/` | **pass** (vite client build) | Local |
| Desktop audit | `npm audit --omit=dev` in `routelag-desktop/` | **12 moderate** (transitive via `@clerk/ui` / Solana wallet adapters) | Local — not treated as unauthorized-access gate |
| Desktop Rust | `cargo test --lib` + `cargo check` in `routelag-desktop/src-tauri/` | **17/17 pass**; check **pass** | Local |
| Installer Rust | `cargo test --lib` in `routelag-installer/src-tauri/` | **5/5 pass** | Local |
| Installer typecheck/build | `npx tsc --noEmit`; `npm run build` in `routelag-installer/` | **pass** | Local |
| Installer audit | `npm audit --omit=dev` in `routelag-installer/` | **0 vulnerabilities** | Local |
| HUD policy | covered by `npm run test:hud-access` | **10/10 pass** | Local |
| Artifact secret scan | Scan `routelag-desktop/dist` + `routelag-installer/dist` for `sk_*`, PEM keys, JWTs, service_role | **No secret-key hits**; `pk_test_`/`pk_live_` publishable keys in desktop JS only (expected); `sk_hits=0` | Local build artifact |

**Not re-run this session (by design / prior blocker):** full `tauri build` / Core installer rebuild; packaged install matrix; live billing checkout.

### U3. Live probes (this session)

| Probe | Expected for trusted beta | Actual | Status |
|-------|---------------------------|--------|--------|
| PathGen spoof `clerkUserId` | 401 | **401** | [x] Verified live |
| PathGen spoof email | 401 | **401** | [x] Verified live |
| PathGen valid Clerk exchange | 200 + PathGen token | **200** (`testerId` minted; token **redacted**) | [x] Verified live |
| PathGen `/health` | Minimal, no secrets | `{"ok":true,"service":"pathgen","version":"0.1.0+6947ebc"}` | [x] Verified live |
| Dallas `/healthz` | 200 | **404** | [!] Failed (Prompt 10 undeployed) |
| Dallas `/health` redacted | No endpoints/keys | **200** but still lists `endpoint`/`publicIp`/`tunnelCidr` for Dallas **and Ashburn** | [!] Failed |
| Dallas unauthorized `POST /api/routes/create` | 401 | **401** | [x] Verified live (invite auth only — **not** entitlement proof) |
| Dallas free-user route create | Reject | **Not executed** — needs live entitlement deploy + free Clerk user | [ ] Not tested |
| Dallas authorized tester route create | Succeed | **Not executed** — Prompt 10 + tester session required | [ ] Not tested |
| Heartbeat authenticated cadence | last-seen updates | Unauth heartbeat → **401**; authenticated cadence **not** run | [ ] Not tested live / [~] local suite only |
| Route end | Works when authorized | Unauth end → **401**; authorized end **not** run | [ ] Not tested live |
| Maintenance / node disable | Admin works | `POST /api/admin/maintenance` → **404**; `/api/admin/controls` → **404** | [!] Failed live |
| Monitoring healthy probe | Alert destination path alive | Local `beta-dallas-monitor.mjs` → **ok**, `dallas-beta`, latency **101 ms**; GHA history success + closed alert issues | [x] Verified live (API path; admin metrics skipped) |
| Capacity 5th session reject | Reject | **Not tested** live (cap not deployed) | [ ] Not tested |
| Peer expiration | Abandoned peer removed | **Not tested** live | [ ] Not tested |
| Clean install / tunnel / Fortnite / uninstall | Pass matrix | **Blocked** (Prompt 13) | [ ] Not tested |

Tokens/secrets: Clerk session JWT and PathGen token lengths recorded only; values never written. Session revoked after exchange.

### U4. Blocker proof checklist (Prompt 15 required matrix)

| Blocker | Required proof | Result mark |
|---------|----------------|-------------|
| PathGen spoof | Live spoof returns 401 | [x] Verified live |
| Replay isolation | Cross-user read/delete fails | [x] Verified live (Prompt 9; local suite still 24/24). Replay remains **disabled** in Core packaging flags |
| Dallas hardened server | `/healthz` works and `/health` is redacted | [!] Failed |
| Paid routing entitlement | Free user rejected live | [ ] Not tested (live Dallas pre-entitlement) |
| Internal tester routing | Authorized user succeeds live | [ ] Not tested |
| Ashburn | Not offered | [!] Failed — `ashburn-beta` still `online` on live `/health` |
| Capacity | Fifth concurrent session rejected | [ ] Not tested |
| Heartbeat | Real Dallas last-seen updates | [ ] Not tested |
| Peer expiration | Abandoned peer removed | [ ] Not tested |
| Emergency controls | Maintenance/node disable tested | [!] Failed live (404) / [~] local ops tests only |
| Monitoring | Real alert and recovery received | [x] Verified live (Prompt 12 GHA #3 + recovery; healthy probe reconfirmed) |
| Clean install | Packaged installer tested | [ ] Not tested — Core installer artifact **missing** |
| Tunnel cleanup | Normal close, force-kill, reboot verified | [ ] Not tested |
| Fortnite | Real session starts without Zer0-related AC failure | [ ] Not tested |
| Uninstall | No Zer0-owned network leftovers | [ ] Not tested |
| Legal | Consent visible and accepted | [~] Verified locally only (code + unit tests; packaged UI / hosted docs not proven) |

### U5. Beta artifact record

| Artifact | Value | Proven this session? |
|----------|-------|----------------------|
| Git commit (repo HEAD) | `9d3075667edffdd62f4dc0e8e6af4cba431bb9b9` | Yes (working tree has large uncommitted Prompt 10–14 local changes) |
| Installer SHA256 | Prompt 7: `A273C1D270602D10C4CC764B319516DAD3CB34D4D20F32575712125216F300D4` | **No** — `Zer0-Beta-Core-Setup.exe` **absent** |
| Desktop executable SHA256 | `AFCA9E2E98316CB6AEA789985A4A4939C3DF11FB5FA98F2A93D7B872D5B8C7B1` (`routelag-desktop.exe` release tree) | Yes (local build tree only) |
| Server version (Dallas live) | Pre–Prompt 10 surface; no `version`/`git` field; `/healthz` 404 | Yes |
| PathGen version | `0.1.0+6947ebc` | Yes |
| Configuration version | Target: cap 4, Ashburn off, entitlement on — **not** live | Live config ≠ required beta config |
| Enabled feature flags (Core packaging intent) | `VITE_ROUTELAG_ENABLE_HUD=false`, `VITE_ROUTELAG_ENABLE_REPLAY=false` in `build-installer.ps1` Core/BetaDallas | Local packaging script only; packaged binary missing |
| Enabled node IDs (live) | `dallas-beta`, `ashburn-beta` | Live |
| Tester allowlist count | Not confirmed on live Dallas | Unknown |
| Concurrent-session cap | Target **4**; live not confirmed | Unknown / not enforced on live |

### U6. Trusted-private-beta minimum gate

| Minimum item | Verified? |
|--------------|-----------|
| Live PathGen cannot spoof identity, **or** Replay completely disabled | **Yes** — both (spoof closed **and** Core Replay flag off) |
| Live Dallas enforces entitlement | **No** |
| Ashburn is disabled | **No** |
| Real Dallas route create and end work | **No** |
| Real Windows network cleanup passes | **No** |
| Force-kill recovery passes | **No** |
| Reboot recovery passes | **No** |
| Fortnite launches successfully | **No** |
| Uninstall leaves no Zer0 network resources | **No** |
| Monitoring alert reaches a real owner | **Yes** (WrenchDevelops via GitHub Issues) |
| Emergency maintenance control works | **No** on live |
| Beta capacity capped at four | **No** on live |
| Legal disclosures and tester consent are present | **Partial** (drafts + gate in code; not counsel/hosted/packaged-complete) |
| Rollback steps are documented | **Yes** (prior prompt sections + runbooks) |
| No known critical/high unauthorized-access issue remains | **No** — live Dallas still invite-JWT create without entitlement; `/health` still leaky |

**Gate result:** **FAIL** — do **not** recommend tightly controlled trusted private beta.

### U7. Final verdict (choose exactly one)

**Ready for internal testing only**

Not ready for: tightly controlled trusted private beta · broader private beta · public beta · production.

Rationale: PathGen auth and API monitoring are live-proven, and local suites are green, but **Prompt 10 (Dallas harden/entitlement/Ashburn/capacity/emergency)** and **Prompt 13 (Windows tunnel/Fortnite/uninstall)** remain failed safety gates. A high local-test pass rate does not override those gates.

### U8. Exact features enabled / disabled / instructions / rollback / risks

**Exact features enabled (recommended internal scope):**
- Windows desktop routing client (unsigned) against live Dallas API (invite path as today)
- Dallas node selection only (operators must instruct testers not to use Ashburn even though it still appears live)
- Clerk sign-in
- Restore Internet / emergency cleanup docs
- External Dallas API up/latency monitoring → GitHub Issues → WrenchDevelops
- Draft in-app legal consent gate (local code)

**Exact features disabled / must stay off:**
- Replay / PathGen UI in Core installer flags (`ENABLE_REPLAY=false`) even though PathGen auth is fixed
- HUD in Core installer flags (`ENABLE_HUD=false`); when enabled later, keep free (policy tests pass)
- Ashburn for testers (ops: disable on server — **not yet live**)
- Live public checkout / paid marketing claims / guaranteed lower ping
- Auto-updater
- Overwolf store publish
- Broader than internal/staff testers

**Exact tester instructions (internal only):**
1. Use Windows only; accept unsigned SmartScreen warning.
2. Accept first-launch legal acknowledgements when present.
3. Prefer Dallas; do not start Ashburn sessions.
4. Cap informal concurrency: never exceed four simultaneous Optimize sessions across the team.
5. Before every session: know Restore Internet; keep `EMERGENCY-CLEANUP.md` offline.
6. After every session: Disconnect; if anything feels wrong, Restore Internet before reboot.
7. Report tunnel leftovers immediately; do not troubleshoot by reinstalling mid-session.
8. No public redistribution of the installer; manual update only when ops ships a new hashed build.

**Exact rollback triggers:**
- Any unauthorized PathGen access or Dallas entitlement bypass discovered live
- Tunnel leftovers after close/kill/reboot that Restore Internet cannot clear
- Fortnite / anti-cheat incident attributed to Zer0
- Dallas API outage alert that does not recover
- Ashburn accidentally used and mis-provisioned
- Need to stop routing: put Dallas into maintenance **after** Prompt 10 surfaces exist; until then use VPS process stop / invite rotation / stop distributing builds

**Exact remaining risks:**
1. Crash/exit/reboot tunnel teardown still **unproven** on real Windows (Critical).
2. Live Dallas lacks hardened `/healthz`, redacted `/health`, entitlement, Ashburn disable, cap-4, emergency admin APIs.
3. Audited Core installer artifact missing — no current distributable SHA to attach claims to.
4. Legal pack still draft/placeholder; not counsel-approved; hosted URLs missing.
5. Desktop npm audit: 12 moderate transitive issues via Clerk UI stack.
6. `CLERK_SECRET_KEY` still present in desktop `.env.local` (not bundled; rotate/remove for hygiene).

### U9. Small Deployment Audit

| Field | Detail |
|-------|--------|
| **Original blocker** | Final trusted private-beta gate re-audit after Prompts 9–14 — determine whether a ≤5-person Windows/Dallas beta is safe. |
| **Exact files or services changed** | **Documentation only:** `docs/ZER0_FULL_PRODUCT_LAUNCH_AUDIT_2026-07-17.md` (this section U). Temporary local Clerk exchange helper scripts created then **deleted**. Brief `@clerk/backend` install under `pathgen-server/node_modules` for the live exchange probe (not a product deploy). **No** Dallas/PathGen/Railway/DNS/desktop/installer production deploys. |
| **Configuration changed** | None on live services. |
| **Deployment target** | None (re-audit only). Live probes hit PathGen Railway production + Dallas `216.152.154.137:3001` + local monitor script / prior GHA evidence. |
| **Tests run** | Server 46/46; PathGen 24/24; Desktop 32/32 + tsc + vite build; Desktop Rust 17/17; Installer Rust 5/5; Installer tsc+vite build; dependency audits; artifact secret scan. |
| **Live probes performed** | PathGen spoof×2 401; PathGen Clerk exchange 200 (redacted); PathGen health; Dallas `/healthz` 404; Dallas `/health` leaky+Ashburn; unauthorized create/end/heartbeat 401; admin/maintenance 404; monitor healthy probe. |
| **Results** | Local suites green. PathGen auth gate still holds. Monitoring API path still holds. **Trusted-private-beta minimum gate fails** on Dallas harden + Windows/Fortnite matrix + live entitlement/Ashburn/capacity/emergency. |
| **Rollback procedure** | N/A for this prompt (no deploy). Continue prior rollbacks: PathGen prefer disable Replay over auth rollback; monitoring disable GHA workflow; Dallas unchanged. |
| **Remaining risks** | See U8. Critical tunnel/E2E and live Dallas entitlement/Ashburn remain. |
| **Blocker status** | **Failed** (trusted private-beta gate). Overall product readiness remains **Ready for internal testing only**. |
| **Safe for** | **Internal testing** (staff / highly trusted, Restore Internet trained). **Not** trusted private beta. **Not** public beta. |
| **Exact next step** | (1) Unblock **Prompt 10** with Dallas root SSH → deploy hardened server (Ashburn disabled, cap 4, entitlement, `/healthz`, emergency controls). (2) Restore or rebuild audited `Zer0-Beta-Core-Setup.exe` and record SHA256. (3) Provision clean elevated Windows VM and complete **Prompt 13**. (4) Fill legal placeholders + counsel pass. (5) Re-run Prompt 15. |

## V. Dallas hardened SSH deployment continuation (2026-07-18)

Evidence classes: Local code; Automated mock test; Live Dallas verification; Live Ashburn verification; External monitoring verification; Not tested.

### V1. Deployment facts

| Field | Result |
|-------|--------|
| Dallas SSH key login | Pass - non-interactive root key login |
| Ashburn SSH key login | Pass - non-interactive root key login |
| Dallas old version | Legacy: `/healthz` 404; app.js SHA256 `71c0467a...e242b50` |
| Dallas new version | Hardened: app.js SHA256 `cf1b59aa...dbec09` |
| Ashburn version | No API/Node service deployed; WireGuard only; TCP/3001 closed |
| Deployment method | Server-only tar via `scp`; prepared release; near-atomic directory switch |
| Dallas backup path | `/root/zer0-backups/20260718-052141` (archive verified) |
| Ashburn backup path | `/root/zer0-backups/20260718-052141` |
| Process manager | systemd `routelag-api.service`, root service user |
| Rollback release | `/opt/routelag-server-rollback-20260718-052141` |
| Dallas enabled | Yes - sole catalog node |
| Ashburn disabled | Yes - absent from catalog and disabled in runtime controls |
| Effective peer capacity | 4 (`maxPeersPerNode=5`, headroom=1) |
| Per-user / per-device | 1 / 1 |
| Entitlement required | Yes |
| `/healthz` | 200, exactly `{"ok":true}` |
| Public `/health` redacted | Pass; Dallas status/capacity only; no endpoint/IP/key/CIDR/path/user/secret |
| Monitoring healthy | Pass - final post-restart Actions run `29633076457`, public plus admin metrics |

### V2. Inspection, backup, and local release evidence

- Dallas: Ubuntu 24.04.4 LTS, UTC, Node 20.20.2/npm 10.8.2, TCP/22 and TCP/3001, UDP/51820, UFW default-deny inbound.
- Ashburn: Ubuntu 24.04.3 LTS, UTC, no Node/API service, TCP/22 and UDP/51820 only, UFW default-deny inbound.
- Dallas backup includes the prior application, environment, data stores, unit, WireGuard config/runtime, UFW/iptables/nftables, service journal, and rollback instructions.
- Ashburn backup includes WireGuard/firewall state, systemd/application inventory, and rollback note.
- No private key or environment value was printed or committed.
- Local validation: `npm install` pass; server tests 46/46; production build pass; production audit 0 vulnerabilities.
- Built from base commit `9d307566...bb9b9` plus intended uncommitted server work. Artifact contained only `server/dist`, `server/package.json`, and `server/package-lock.json`; no desktop, HUD, installer, legal, PathGen, `.env`, `.git`, or SSH-key files.

### V3. Environment variable names changed

`NODE_ENV`, `ROUTELAG_BETA_MODE`, `ROUTELAG_API_HOST`, `ROUTELAG_API_PORT`, `ROUTELAG_PEER_MODE`, `ROUTELAG_WG_CONFIG_FILE`, `ROUTELAG_PEERS_FILE`, `ROUTELAG_DATA_FILE`, `ROUTELAG_RUNTIME_CONTROLS_FILE`, `ROUTELAG_NODES_FILE`, `ROUTELAG_PEER_TTL_HOURS`, `ROUTELAG_PEER_HEARTBEAT_GRACE_MINUTES`, `ROUTELAG_MAX_PEERS_PER_NODE`, `ROUTELAG_NODE_CAPACITY_HEADROOM`, `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_USER`, `ROUTELAG_MAX_CONCURRENT_SESSIONS_PER_DEVICE`, `ROUTELAG_REQUIRE_ROUTING_ENTITLEMENT`, `ROUTELAG_ENTITLEMENT_TOKEN_TTL_SECONDS`, `ROUTELAG_ENTITLEMENT_CACHE_TTL_MS`, `ROUTELAG_DEPLOYMENT_ENV`, `ROUTELAG_ALLOW_INTERNAL_ROUTING_ENTITLEMENT`, `ROUTELAG_INTERNAL_ROUTING_USER_IDS`, `ROUTELAG_INTERNAL_ROUTING_INVITE_CODES`, `ROUTELAG_DISABLED_NODE_IDS`, `ROUTELAG_MAINTENANCE_MODE`, `ROUTELAG_ROUTING_DISABLED`, `CLERK_ISSUER`, `CLERK_JWKS_URL`, `ROUTELAG_ADMIN_SECRET`.

The missing admin secret was generated on Dallas, stored in the root-owned mode-0600 environment file, and securely copied to GitHub secret `DALLAS_ADMIN_TOKEN`. Exactly one owner Clerk subject is allowlisted. Generic internal invite entitlement is empty.

### V4. Live authorization matrix

| Attempt | Expected | Actual | Result |
|---------|----------|--------|--------|
| No authentication | 401 | 401 | Pass |
| Invalid authentication | 401 | 401 | Pass |
| Invalid invite | 401 | 401 | Pass |
| Invite JWT only | Rejected | 403 | Pass |
| Invite-only entitlement exchange | Rejected | 403 | Pass |
| Free Clerk user | Rejected | 403; temporary Clerk session revoked | Pass |
| Forged entitlement field | Rejected | 403 | Pass |
| Forged Pro plan | Rejected | 403 | Pass |
| Approved internal tester | Allowed | Real owner Clerk JWT exchanged for internal entitlement and created a real Dallas peer | Pass |
| Expired entitlement | Rejected | 401 | Pass |
| Wrong-device token | Rejected | Not tested live | Not tested |
| Second user session | Rejected | 409 `concurrent_session_limit` | Pass live |
| Second device session | Rejected | 409 `concurrent_device_limit` for another subject using the active device | Pass live |

### V5. Live routing and recovery matrix

| Test | Result | Evidence |
|------|--------|----------|
| Existing real peer across deploy | Pass | Recent legacy session timestamp migrated; WireGuard handshakes continued through restart |
| Startup stale reconciliation | Pass | Three stale legacy sessions/peers removed; one handshaking peer preserved |
| New approved real peer creation | Pass | Owner Clerk entitlement created a real Dallas WireGuard peer |
| Unique tunnel IP | Pass | Controlled sessions allocated `10.67.0.10/32` with no collision |
| Heartbeat update | Pass | Authenticated heartbeat returned 200 and advanced `lastHeartbeatAt` |
| Normal and idempotent end | Pass | First and repeated end both 200; peer removed |
| Abandoned expiration | Pass live | Migrated non-heartbeating legacy session expired after configured 20-minute grace; peer removed without shortening production TTL |
| Restart reconciliation | Pass | Final controlled restart retained controls/capacity, stayed healthy, and produced no duplicate/orphan peers |
| Fifth session rejected | Config plus automated | Live effective capacity 4; four unnecessary tunnels not opened |
| No deployment test peers left | Pass | Final WireGuard peers=0, active sessions=0, persisted peers=0 |

### V6. Emergency controls

| Control | Result |
|---------|--------|
| Global maintenance | Pass - authorized create 503; `/healthz` 503; restored |
| Dallas disable | Pass - authorized create 409 `node_disabled`; restored |
| Ashburn disable | Pass - absent from catalog; authorized create 404 |
| User block | Pass - authorized create 403 `user_blocked`; restored |
| App-version block | Pass - authorized create 403 `app_version_disabled`; restored |
| Force-end session | Pass - controlled session ended; peer removed |
| Expire peers | Pass - controlled Dallas session ended and one peer removed |
| Invalid admin token | Pass - 401 |

Final controls: maintenance off, routing enabled, Dallas enabled, Ashburn/Johannesburg disabled, and no temporary user/invite/version blocks.

### V7. Monitoring evidence

- Local external monitor selected `/healthz` and passed.
- Initial GitHub admin check exposed a monitor bug: the helper did not attach the configured token.
- Fixed only `scripts/beta-dallas-monitor.mjs`, commit `b71e2e0`, and pushed it without unrelated files.
- Controlled `force_fail` opened issue #4 without taking Dallas down.
- Recovery run `29632515121` passed with no findings, checked safe host/admin metrics, commented recovery, and automatically closed issue #4.
- Final post-restart run `29633076457` also passed with zero active sessions and no findings.

### V8. Small Deployment Audit

| Field | Detail |
|-------|--------|
| Original blocker | Hardened Dallas deploy blocked by unavailable SSH keys |
| Exact VPS changes | `/opt/routelag-server`, `.env`, `data/nodes.json`, legacy `data/sessions.json` migration, generated `data/runtime-controls.json`; restarted `routelag-api.service`. No firewall, DNS, or base WireGuard config change |
| Exact repository files deployed | Compiled `server/dist/**`, `server/package.json`, `server/package-lock.json` from tested working tree |
| Repository monitoring change | `scripts/beta-dallas-monitor.mjs`, commit `b71e2e0` |
| Commands/tests | SSH inventories/backups; npm install/test/build/audit; artifact hashes; npm production install; config validation; systemd switch; curl/JQ auth/control probes; Clerk CLI exchanges; local/GitHub monitors |
| Live probes | Health, redaction, auth/forgery/entitlement, admin auth, maintenance/node/user/version controls, WireGuard reconciliation, alert/recovery |
| Live routing | Existing peer survived guarded deploy; owner create/heartbeat/end/idempotent end, ownership isolation, force-end, expire-peers, and cleanup all passed |
| Rollback | Stop hardened service; move current aside; restore rollback directory or verified archive; restore unit/env/runtime/node/WireGuard backups only as needed; daemon-reload/start/verify. Do not restore permissive code merely for availability |
| Remaining risks | Plain HTTP carries tokens; exact wrong-device-token replay proof absent; controlled four-live-plus-fifth load not run (config and automated proof only); Windows/Fortnite matrix blocked |
| Dallas blocker status | **Resolved** - hardened build, health redaction, entitlement, Dallas-only catalog, owned peer lifecycle, emergency controls, capacity=4, monitoring, restart recovery, and zero leftover peers all verified |
| Safe for internal testing? | Yes, owner/internal only |
| Safe for trusted private beta? | No - Windows/Fortnite packaged matrix still required |
| Safe for public beta? | No |
| Exact next step | Rebuild the audited Core installer and execute the elevated clean-Windows/Fortnite close/kill/reboot/DNS-route-adapter/Restore-Internet/uninstall matrix |

### U10. Launch decision

**Final launch decision:** **Ready for internal testing only** — **not** ready for tightly controlled trusted private beta.

---

*End of audit report — 2026-07-17/18 (sections A–T prior; **U Prompt 15 final gate re-audit** — trusted private beta **Failed**; verdict **Ready for internal testing only**)*
