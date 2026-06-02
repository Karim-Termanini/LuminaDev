# LuminaDev Status Snapshot

Living snapshot updated when the release track changes materially.

**Last updated:** 2026-06-02 (comprehensive audit sweep complete; RuntimesPage split; graphify 10,503 nodes)

| Doc | Role |
| --- | --- |
| [`phasesPlan.md`](../phasesPlan.md) | Phase history + architecture standards |
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | Unified active plan + backlog |
| [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md) | Knowledge-graph architecture map (@ `fc9c8fa`) |
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

**Still partial / open** ([`ROUTE_STATUS.md`](./ROUTE_STATUS.md), [`MASTER_PLAN.md`](./MASTER_PLAN.md) §9, §17):

- AppImage E2E on clean VM (Tauri **Stage 4** packaging — distinct from product **Phase 5** Monitor, which shipped)
- **Phase 18 — IPC boundary hardening:** P9/P12 bridge ✅ (0 renderer bypasses); P10 Zod (~70/137 channels); P19 RuntimesPage split ✅
- **Tests:** contract + `test:roundtrip` + `test:e2e`; CI `unit-roundtrip-contracts` (P11 ✅)
- **Compose stacks:** 9 preset dirs; only `web-dev` has `docker-compose.full.yml` — other presets default to Alpine stub unless `LUMINA_DEV_COMPOSE_FULL` + full file exist

## Architecture snapshot (graphify @ `fc9c8fa`)

| Layer | Community | Hub / notes |
| --- | --- | --- |
| Dispatcher | **59** | `lib.rs` → `ipc_invoke` — thin router ✅ (~706 lines) |
| Channel parity | **132** | `ipc_contract_tests.rs` — `ipc.ts` channels ⊆ `lib.rs` arms |
| Contracts | **57**, **70** | `ipc.ts` (137 channels) + `schemas.ts` (~70 `RequestSchema`) |
| Bridge | **78** | `desktopApiBridge.ts` — all renderer IPC via `window.dh` ✅ |
| Subprocess spine | **38**, **54** | `host_exec.rs` — `exec_output_limit` (82 edges), `cmd_timeout_short` (79) |
| Profiles | **53** | Switch progress + background scaffold coupling |
| Git Assistant | **48**, **122** | Editor resolve, clone, `computeGitAssistantNextAction` |
| Renderer bypass | — | **0** direct `invoke('ipc_invoke')` bypasses (P9/P12 ✅ 2026-06-02) |

**Graph corpus:** 409 files · 273 communities (i18n clusters 0–26 are low-signal for planning).

Regenerate after code changes: `graphify update .` (see [`.cursor/rules/graphify.mdc`](../.cursor/rules/graphify.mdc)). Use `graphify query "<question>"` before broad grep.

## Product phases vs Tauri migration stages

**Product phases** (0–17 in `phasesPlan.md`) track feature delivery — e.g. **Phase 5 Monitor** is ✅ shipped.

**Tauri migration stages** (table above) track release engineering — **Stage 4** (AppImage/CI) is 🔄 in progress; **Stage 5** (maintainer sign-off) remains ⬜ open.

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
| [`graphify-out/GRAPH_REPORT.md`](../graphify-out/GRAPH_REPORT.md) | Architecture knowledge graph |
