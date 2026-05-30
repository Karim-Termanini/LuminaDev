## Summary

- What changed and why?
- What risk was reduced?

## Scope Check

- [ ] Changes align with [`MASTER_PLAN.md`](docs/MASTER_PLAN.md) — no reintroduction of removed scope (Extension tab, dashboard widgets) without explicit product decision.
- [ ] Changes are focused and reviewable (no unrelated churn).
- [ ] Destructive/sensitive flows keep explicit confirmations and deterministic `[ERROR_CODE]` errors.

## Test Evidence

- [ ] `pnpm smoke` passed locally.
- [ ] Added/updated tests for changed contract/behavior.
- [ ] Manual verification steps documented when needed.

## Docs Check

- [ ] User-facing wording remains truthful (`Implemented / Partial / Planned / Out of scope`).
- [ ] Updated [`ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) if route maturity changed.
- [ ] Updated [`phasesPlan.md`](phasesPlan.md) or [`MASTER_PLAN.md`](docs/MASTER_PLAN.md) only when phase/backlog status materially changes.

## Notes

- Risks / follow-ups / deferred items:
