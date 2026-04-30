# Visual Unification Walkthrough

This document tracks the cross-page visual unification work for `Docker`, `SSH`, and `Git Config`.

## What was added

- A shared design-system layer in `apps/desktop/src/renderer/src/theme/global.css`:
  - `.hp-card`
  - `.hp-btn`, `.hp-btn-primary`, `.hp-btn-danger`
  - `.hp-input`
  - `.hp-status-alert` (+ `success`, `warning`, `error`)

## Where it is used

- `apps/desktop/src/renderer/src/pages/DockerPage.tsx`
  - Unified cards/buttons/inputs and cleanup preview blocks
  - Standardized status messaging and action controls
- `apps/desktop/src/renderer/src/pages/SshPage.tsx`
  - Unified wizard-like identity cards and primary actions
  - Standardized status alert treatment for setup/test operations
- `apps/desktop/src/renderer/src/pages/GitConfigPage.tsx`
  - Unified form cards, button variants, and status alerts
  - Consistent control styling for filter/sort/masking tools

## UX outcomes

- Buttons, cards, and inputs now share one visual language across Phase 2/3/4 surfaces.
- Success/warning/error feedback follows a consistent status-alert system.
- Future UI changes can be done in one place (`global.css`) instead of per-page style rewrites.

## Verification

- `pnpm smoke` — runs workspace `typecheck` (includes desktop), shared `test`, and `lint` via `scripts/smoke-ci.sh` (timestamped `[smoke-ci …]` lines; uses `npx pnpm@9.14.2` if `pnpm` is not on `PATH`).
- `pnpm --filter desktop typecheck`
- `pnpm lint`

Both pass after this unification pass.

---

## Phase sign-off matrix (Phases 0–6)

Two-column audit against `phasesPlan.md`. **This section is a historical implementation walkthrough, not a release sign-off or quality-gate approval.**
Use `README.md` status labels (`Implemented / Partial / Planned`) as the canonical public status.
Here, **Done** = matched the implementation intent at audit time; **Partial** = usable gap vs doc; **Later** = explicitly deferred in doc or roadmap.

| Deliverable (phase) | Status |
|---------------------|--------|
| Phase 0 — Widget registry + persisted `dashboard-layout.json` | Done |
| Phase 0 — Responsive grid + Add widget + Custom profile entry | Done |
| Phase 0 — Job runner (`jobStart` / `jobsList` / `jobCancel`) + footer strip | Done |
| Phase 0 — Session banner (Flatpak vs native) + doc link | Done |
| Phase 1 — Six extra preset cards + compose ids (9+ total) | Done (`DashboardMainPage`) |
| Phase 1 — Custom profile wizard → `custom_profiles` store | Done |
| Phase 1 — Custom layout: edit mode drag | Done — HTML5 drag-and-drop reorder with persisted layout save (`DashboardWidgetsPage` + `DashboardWidgetDeck`) |
| Phase 1 — Add widget → picker from registry | Done (`AddWidgetModal` + `DashboardWidgetsPage`) |
| Phase 2 — Detect / explain Docker | Done (`DockerPage` + errors) |
| Phase 2 — Install OS-specific (honest Flatpak/host) | Done |
| Phase 2 — Containers / images / volumes / networks / cleanup | Done |
| Phase 3 — SSH generate / copy / fingerprint / test GitHub | Done (`SshPage`) |
| Phase 3 — Flatpak `~/.ssh` note | Done — explicit override guidance added in `SshPage` header |
| Phase 4 — Set identity + defaults + Apply | Done |
| Phase 4 — Validate before apply | Done — **Validate** button + shared checks (`GitConfigPage`) |
| Phase 4 — List global config: sortable table, search, mask/reveal | Done |
| Phase 5 — Aggregated metrics + top processes + Docker list | Done (`MonitorPage` `/system`) |
| Phase 5 — Per-container stats stream (throttled) | Partial / Later |
| Phase 5 — LAN discovery | Later (per plan) |
| Phase 5 — systemd snapshot | Partial (verify depth vs doc) |
| Phase 5 — Tabs: Overview \| Processes \| Docker \| Disk \| Network | Done — tab strip with anchor navigation to section blocks on `MonitorPage` |
| Phase 6 — Recommended path + deps checklist + job + logs | Done (`RuntimesPage` + main jobs) |
| Phase 6 — Job progress reflects long installs | Done — **throttled stream + time spine** in main process |
| Phase 6 — Ship 2–3 languages first then template | Done in practice (many runtimes shipped) |

---

## Agent B documentation & verification (maintenance track)

This section records the **docs + checklist + smoke** closure for Agent B (not a second visual pass).

| Area | Where |
|------|--------|
| Flatpak / install / remap UX copy | `apps/desktop/src/renderer/src/pages/dockerError.ts` — `*_NOT_SUPPORTED` messages note **likely Flatpak** where applicable |
| Sandboxing rationale | `docs/DOCKER_FLATPAK.md` — **Limitations in Flatpak** |
| Manual checklist + expected UI | `docs/STABILIZATION_CHECKLIST.md` — B5 + **Known limits** table (**Expected UI Response**) |
| Local Flatpak build issues | `flatpak/README.md` — Troubleshooting (cache, extensions, state vs target filesystem) |
| Role boundaries | `docs/AGENT_B_HANDOFF.md` |

**Verification command:** `bash scripts/smoke-ci.sh` (workspace typecheck, `vitest` shared + desktop, ESLint). Latest gate should stay green on `main` before release tagging.

**Handoff:** New UI-only work stays in **Agent B** scope; Rust IPC and heavy CI remain **Agent A** per `docs/AGENT_WORK_PLAN.md`.

---

## Agent A — A4 hardening (host exec + terminal lifecycle)

| Item | Detail |
|------|--------|
| Fewer `bash -lc` probes | Prefer direct reads (`/etc/os-release`, `/proc/uptime`) and direct CLI (`docker --version`, `systemctl`, `nvidia-smi`) where safe in `apps/desktop/src-tauri/src/lib.rs`. |
| Timeouts | `exec_output_limit` / `exec_result_limit` with `CMD_TIMEOUT_DEFAULT` (180s), `CMD_TIMEOUT_SHORT` (30s) for probes and `curl`, `CMD_TIMEOUT_LONG` (900s) for `git clone`, install steps under `sudo`. |
| `HOST_COMMAND_TIMEOUT` | Returned on wall-clock exceed; humanized in `dockerError`, `gitError`, `sshError`, `dashboardError`, `runtimeError`. |
| **`dh:terminal:close`** | Declared in `packages/shared/src/ipc.ts`; Tauri `ipc_send` removes `ChildStdin` from map; Electron **kills** the PTY via `ipcMain.on(IPC.terminalClose, …)`. Renderer calls `window.dh.terminalClose(id)` on unmount for **TerminalPage**, **DockerTerminalModal**, **SshPage** embed; **SshPage** disconnect uses `terminalClose`. |
