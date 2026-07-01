# RouteLag Restore Cleanup Test Plan

Use this build to verify the cleanup fix only. Do not test full optimization on your main PC yet unless the restore tests below pass first.

## What Changed

This build is meant to fix false Restore Internet warnings and stale UI state.

Expected behavior:

- Restore Internet should treat stopped or missing RouteLag WireGuard services as success.
- The stale warning should disappear immediately after cleanup if no stored session or RouteLag service remains.
- Login/invite state should survive Restore Internet.
- Advanced Repair should stay separate and should not run unless you explicitly click it.

## Test 1: Restore Internet When Logged Out

1. Open RouteLag.
2. Do not log in.
3. Click Restore Internet.
4. Expected result:
   - No crash.
   - No logout issue because you were already logged out.
   - Success text should say:
     `Restore Internet completed. No active RouteLag engine was found, and local route state was cleared.`
   - It should not suggest Advanced Repair unless real internet checks are failing.

## Test 2: Restore Internet When Logged In

1. Log in with your beta invite.
2. Click Restore Internet.
3. Expected result:
   - You should remain logged in.
   - No stale warning should remain if recovery status is clean.
   - Missing/stopped WireGuard tunnel service should not show as a warning.

## Test 3: Stale Warning Clears Immediately

1. If the app shows `Previous optimization did not close cleanly`, click Restore Internet.
2. Expected result:
   - The warning should disappear without restarting the app.
   - The app should return to disconnected/idle state.
   - Settings/login/profile should remain intact.

## Test 4: Try Server Cleanup With No Session

1. If the stale warning panel has Try cleanup server session, click it when no session exists.
2. Expected result:
   - Message should say:
     `No stored server session found. Local state was cleared.`
   - The stale warning should not remain if recovery status is clean.

## Test 5: Windows Service Edge Cases

These are the important bug cases from the report.

Expected success cases:

- `[SC] ControlService FAILED 1062: The service has not been started.`
- `[SC] OpenService FAILED 1060: The specified service does not exist as an installed service.`
- Service says not running, not installed, or does not exist.

These should not make Restore Internet say completed with warnings.

## What Not To Test Yet

- Do not test full tunnel.
- Do not deploy VPS changes.
- Do not change server protocol.
- Do not use Advanced Repair unless normal internet is actually broken after Restore Internet.

## If Something Fails

Export a RouteLag report ZIP and note:

- Whether you were logged in.
- Whether the stale warning was visible before cleanup.
- Whether Restore Internet showed success or warnings.
- Whether Windows internet still worked after cleanup.
