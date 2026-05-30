# LuminaDev Status Snapshot

Living snapshot updated when the release track changes materially. Phase map: [`phasesPlan.md`](../phasesPlan.md). Stabilization gate: [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md).

**Last updated:** 2026-05-29

---

## Migration / release track

| Stage | Meaning | Status |
| --- | --- | --- |
| 0 | Baseline + freeze | ✅ done |
| 1 | Tauri skeleton + bridge | ✅ done |
| 2 | Rust-native backend port | ✅ done |
| 3 | Renderer parity + UX | ✅ done |
| 4 | Packaging + CI (GitHub Releases / AppImage) | 🔄 in progress — Flatpak abandoned |
| 5 | Release gate (explicit product-ready declaration) | ⬜ open — **not started** |

---

## Product phases

Phases **0–17** shipped per `phasesPlan.md` execution order.

**Removed from scope (2026-05-29):**
- **Phase 10 Extensions** — no Settings Extension tab, no plugin marketplace.
- **Dashboard widgets** — widget deck, layout IPC (`layoutGet`/`layoutSet`), and `/dashboard/widgets` route fully removed from codebase.

**Still partial** (see [`ROUTE_STATUS.md`](./ROUTE_STATUS.md)):
- Settings hosts/env editing
- Runtimes install matrix hardening
- Profiles ↔ dashboard unification
- AppImage end-to-end verification on clean VM

---

## Quality gate

`pnpm smoke` must pass before merge. Release tagging waits on Stage 5 + maintainer sign-off — not on a fixed calendar.

---

## References

| File | Purpose |
| --- | --- |
| [`STABILIZATION_CHECKLIST.md`](./STABILIZATION_CHECKLIST.md) | Stabilization criteria + manual test checklist |
| [`FORWARD_PLAN_2026-05-28.md`](./FORWARD_PLAN_2026-05-28.md) | Post-audit tactical backlog |
| [`SMART_FLOW_VCS.md`](./SMART_FLOW_VCS.md) | Git VCS Smart-Flow blueprint |
