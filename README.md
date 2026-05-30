# LuminaDev

Linux developer workstation dashboard, focused on safe click-first flows for Docker, system visibility, and local machine setup.

> **Runtime:** Tauri-only desktop app. All `ipc_invoke` channels run Rust-native; Electron and Node bridge removed. Distribution target: **GitHub Releases (AppImage)** — Flatpak abandoned.

## Current Status

This project is in active development. Features below are split by maturity:

- **Implemented (verified)**:
  - Docker: containers, images, volumes, networks, cleanup, port remap, per-container stats.
  - Unified `/git` hub (Config, VCS, Cloud tabs) with Smart-Flow VCS (Smart Push, conflict studio, PR wizard).
  - Maintenance / Guardian, Monitor metrics, Profiles CRUD + scaffolding, 14 Settings tabs.
  - System Readiness wizard (Phase 16), elevated theme on primary routes.
  - Typed IPC via `@linux-dev-home/shared` (Zod + Rust validation).
- **Partial / evolving**:
  - Settings: hosts file editing and profile-scoped env files not implemented ([`ROUTE_STATUS.md`](docs/ROUTE_STATUS.md)).
  - Runtimes install/update matrix hardening.
  - AppImage release pipeline E2E on clean VM ([`MASTER_PLAN.md`](docs/MASTER_PLAN.md)).
- **Out of scope (removed 2026-05-29)**:
  - Settings Extension tab / plugin marketplace (Phase 10).
  - Dashboard widget catalog, deck, and layout IPC.

## Documentation

| Doc | Purpose |
| --- | --- |
| [`phasesPlan.md`](phasesPlan.md) | Phase-by-phase history and checklists |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Unified active plan + backlog |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Consolidated audit + page QA checklist |
| [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) | Route live / partial / stub matrix |
| [`docs/STATUS.md`](docs/STATUS.md) | Release track snapshot |
| [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md) | Stabilization gate evidence |
| [`docs/SMART_FLOW_VCS.md`](docs/SMART_FLOW_VCS.md) | Git VCS Smart-Flow blueprint |
| [`CLAUDE.md`](CLAUDE.md) | Agent / contributor architecture guide |

## Quality Gate Policy

All changes must pass the full CI gate before merge. Gate runs are enforced on every PR:

1. `pnpm smoke` (typecheck + test + lint) must pass.
2. Destructive actions (Docker prune/remove, runtime uninstall, profile teardown) must keep confirmation + tested error handling.
3. No feature regression on existing live/partial routes without corresponding test updates.
4. Documentation must use `Implemented / Partial / Planned / Out of scope` wording only.
5. Commit hygiene: no micro-churn commits; each commit must represent one reviewable change with a descriptive message.

## Known Limitations

- **Security boundaries:** Some cleanup operations require manual host steps or Polkit (`pkexec`) for privilege escalation.
- **Terminal:** Line-buffered shell in embedded terminal — not a full PTY (interactive apps like vim may not work).
- **Backend:** ~37 Rust modules; `lib.rs` is a thin IPC dispatcher (~680 lines).

## 🛠️ Prerequisites

- **Node.js 20+**
- **pnpm** 9 (`corepack enable` recommended)
- **Docker** (optional, for compose stacks and the Docker panel)
- **Tauri (default dev):** Rust stable + WebKit/GTK dev packages (see [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)).

## 🚀 Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Development scripts:**
   ```bash
   pnpm dev          # Tauri dev (Rust + Vite renderer)
   pnpm test         # Unit tests (shared + desktop)
   pnpm typecheck    # TypeScript validation
   pnpm lint         # ESLint
   pnpm build        # Renderer bundle + copy compose profiles (CI / Docker friendly)
   pnpm --filter desktop build:tauri   # Full desktop app bundle (Rust + frontend)
   ```

## 🐳 Docker CI Image

```bash
docker build -f docker/Dockerfile .
```
The image runs tests, typecheck, lint, and production build inside Node 20.

## Stabilization & Quality

- Gate: `pnpm smoke` (typecheck + test + lint + Rust tests/clippy)
- Tracker: [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md)
- Audit record: [`docs/AUDIT.md`](docs/AUDIT.md)
- Engineering playbook: [`docs/APP_CREATION_PLAYBOOK.md`](docs/APP_CREATION_PLAYBOOK.md)
- Commit rules: [`docs/COMMIT_QUALITY_RULES.md`](docs/COMMIT_QUALITY_RULES.md)

## 🌳 Monorepo Layout

- `apps/desktop` — Tauri + React UI (Rust backend, WebKit renderer; Electron removed in v0.2.0-alpha)
- `packages/shared` — Shared types, IPC channel names, Zod schemas
- `docker/compose/*` — Bundled `docker compose` profiles

## 📜 License

MIT — see [LICENSE](LICENSE).

---
*Built with ❤️ for the Linux Developer Community.*
