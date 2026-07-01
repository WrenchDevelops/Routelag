# Windows QA Checklist

Run on Windows 10/11 with no separate tunnel app installed.

- [ ] `C:\Program Files\WireGuard` is absent.
- [ ] RouteLag installer includes RouteLag Engine resources.
- [ ] RouteLag opens without prompting for external tunnel installation.
- [ ] Restore Internet completes.
- [ ] Login works.
- [ ] Safe split-route optimization starts.
- [ ] Full tunnel is blocked if returned by API.
- [ ] Targeted `/32` routes appear while active.
- [ ] Normal internet works while active.
- [ ] End Optimization removes targeted routes.
- [ ] Restore Internet cleans new and legacy RouteLag route services.
- [ ] Report ZIP includes RouteLag Engine status and tester notes.
