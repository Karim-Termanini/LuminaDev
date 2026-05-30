# LuminaDev Status Snapshot

Living snapshot updated when the release track changes materially.

**Last updated:** 2026-05-30

| Doc | Role |
| --- | --- |
| [`phasesPlan.md`](../phasesPlan.md) | Phase history + architecture standards |
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | Unified active plan + backlog |
| [`AUDIT.md`](./AUDIT.md) | Consolidated audit + page QA |
| [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md) | Stabilization gate evidence |
| [`ROUTE_STATUS.md`](./ROUTE_STATUS.md) | Route maturity matrix |

---

## Migration / release track

| Stage | Meaning | Status |
| --- | --- | --- |
| 0 | Baseline + freeze | ✅ done |
| 1 | Tauri skeleton + bridge | ✅ done |
| 2 | Rust-native backend port | ✅ done |
| 3 | Renderer parity + UX | ✅ done |
| 4 | Packaging + CI (GitHub Releases / AppImage) | 🔄 in progress |
| 5 | Release gate (explicit product-ready declaration) | ⬜ open |

Flatpak / Flathub pathway **abandoned** (2026-05-28). No Flatpak manifest in repo.

---

## Product phases

Phases **0–17** shipped per `phasesPlan.md`.

**Removed from scope (2026-05-29):**
- Phase 10 Extensions — Settings Extension tab, plugin marketplace
- Dashboard widgets — deck, layout IPC, `/dashboard/widgets` route

**Still partial** ([`ROUTE_STATUS.md`](./ROUTE_STATUS.md)):
- Settings hosts/env file editing
- Runtimes install matrix hardening
- Profiles ↔ dashboard unification
- AppImage E2E on clean VM

---

## Quality gate

`pnpm smoke` must pass before merge. Release tagging waits on Stage 5 + maintainer sign-off.

---

## References

| File | Purpose |
| --- | --- |
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | Unified plan + backlog |
| [`AUDIT.md`](./AUDIT.md) | Audit + manual QA checklist |
| [`SMART_FLOW_VCS.md`](./SMART_FLOW_VCS.md) | Git Smart-Flow blueprint |
| [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md) | Stabilization + B5 tests |
