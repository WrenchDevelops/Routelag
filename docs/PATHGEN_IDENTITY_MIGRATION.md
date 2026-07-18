# PathGen identity & replay ownership migration

## Why

PathGen previously trusted client-supplied `clerkUserId` / email on `/api/auth/login`.
Identity is now **only** taken from a cryptographically verified Clerk session JWT
(JWKS: signature, issuer, audience when configured, authorized party, expiration, subject).

PathGen-issued tokens include the verified Clerk `sub` and are short-lived (default 2h).

## Identity map (current)

| Step | Source of identity |
|------|--------------------|
| Clerk desktop login | Clerk |
| Desktop `getToken()` | Clerk session JWT |
| `POST /api/auth/login` | Verifies Clerk JWT → mints PathGen JWT with `clerkUserId=sub` |
| Replay upload / list / read / delete | PathGen JWT → `testerId = stableClerkTesterId(sub)` |
| Profile / identity write | PathGen JWT tester only (body `clerkUserId` ignored) |

## Record keying

- **Canonical key:** Clerk subject (`user_…`) → `tester_id = sha256("clerk:"+sub)[:24]` prefixed `tester_`
- **Legacy key:** invite-code hash `tester_id = sha256(INVITE)[:24]` (dev invite login only)
- **Email:** never an authorization key. May exist on `clerk_email` for display/ops only.

## Safe migration rules

1. On verified Clerk login, if the client also sends an **allowlisted invite code**, PathGen may
   migrate local/cloud rows whose `invite_code` matches that code onto the Clerk `tester_id`
   **only when** the legacy row has no `clerk_user_id`, or it already equals the verified subject.
2. If a legacy row is already bound to a **different** Clerk user → **do not merge**.
   Log `pathgen_identity_merge_blocked` for manual review.
3. Never merge solely because two clients sent the same email.
4. Do not silently orphan: invite-owned local replays remain readable under invite login in
   non-production until an explicit Clerk+invite link migrates them.

## Manual review checklist

Query / export rows where:

- `clerk_user_id` is null but `clerk_email` is set
- Multiple `tester_id` values share the same `clerk_email`
- `pathgen_identity_merge_blocked` appears in logs

For each conflict: confirm ownership with the user out-of-band, then assign the Clerk subject
server-side (ops only).

## Production configuration

Required:

- `CLERK_ISSUER` or `CLERK_PUBLISHABLE_KEY` (derives issuer)
- `CLERK_JWKS_URL` (optional; defaults to `{issuer}/.well-known/jwks.json`)
- Optional: `CLERK_AUDIENCES`, `CLERK_AUTHORIZED_PARTIES`
- `PATHGEN_AUTH_SECRET` (rotate after this fix — old forged mint path could have issued tokens)

Hard locks when `NODE_ENV` / `PATHGEN_ENV` / Railway production:

- `allowInviteLogin = false`
- `requireClerkSubject = true`

Dev-only invite login: `PATHGEN_ALLOW_INVITE_LOGIN=true` (ignored in production).

## Secret exposure notes

- `PATHGEN_AUTH_SECRET` lives in server env / local `.env` (gitignored). Not embedded in desktop.
- Desktop must **not** ship `CLERK_SECRET_KEY` (publishable key only).
- Do not log full JWTs or raw replay payloads.
