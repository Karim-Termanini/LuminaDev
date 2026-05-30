# LuminaDev

Linux developer workstation dashboard, focused on safe click-first flows for Docker, system visibility, and local machine setup.

> **Runtime migration:** Tauri backend port complete. All `ipc_invoke` channels run Rust-native; Node.js bridge removed. File/folder pickers on Tauri use `@tauri-apps/plugin-dialog` from the renderer (not `dh:dialog:*` over invoke). Ongoing work is tracked in the [Stabilization Checklist](docs/STABILIZATION_CHECKLIST.md).

## Current Status

This project is in active development. Features below are split by maturity:

- **Implemented (verified)**:
  - Docker surface: container list/actions/logs plus image/volume/network cleanup flows; per-container stats polling.
  - Maintenance and Monitor pages with metrics + job runner integration.
  - SSH and Git configuration UI flows; unified `/git` hub (Config, VCS, Cloud tabs).
  - Elevated theme across primary routes (Phase 15 complete).
  - Typed IPC boundaries via `@linux-dev-home/shared` schemas.
- **Partial / evolving**:
  - `dh:docker:install` / `dh:docker:remap-port`: install wizard (distro + sudo) and port-remap clone flow; remap stops and removes the source container on success (`sourceRemoved` in response).
  - **Settings** (`/settings`): personalization (accent), read-only SSH bookmark overview, structured **hosts** and **process env** diagnostics. Host file editing and profile-scoped env files are not implemented yet ([`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md)).
  - Runtime install/update matrix hardening.
  - Diagnostics and support bundle depth.
- **Out of scope (removed 2026-05-29):**
  - Settings **Extension** tab / plugin marketplace (Phase 10) — UI and infrastructure removed.
  - Dashboard **widget catalog/deck** and layout IPC — fully removed from shared, Rust, and renderer.

## Quality Gate Policy

All changes must pass the full CI gate before merge. Gate runs are enforced on every PR:

1. `pnpm smoke` (typecheck + test + lint) must pass.
2. Destructive actions (Docker prune/remove, runtime uninstall, profile teardown) must keep confirmation + tested error handling.
3. No feature regression on existing live/partial routes without corresponding test updates.
4. Documentation must use `Implemented / Partial / Planned` (or `Out of scope`) wording only.
5. Commit hygiene: no micro-churn commits; each commit must represent one reviewable change with a descriptive message.

## Known Limitations

- **Security boundaries:** Some cleanup operations are manual-assisted due to host privilege boundaries.
- **Modularization:** `apps/desktop/src-tauri/src/lib.rs` fully modularized into 33 domain modules (37 Rust source files total, Phase 16 complete).

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

## ✅ Stabilization Tracker

See [docs/STABILIZATION_CHECKLIST.md](docs/STABILIZATION_CHECKLIST.md) for remaining reliability/safety/process closure items and acceptance criteria.
Snapshot (stages + PRs + what’s left): [docs/STATUS.md](docs/STATUS.md).
Route behavior matrix (live vs partial vs stub): [docs/ROUTE_STATUS.md](docs/ROUTE_STATUS.md).
For reusable engineering lessons and incident-driven build process, see [docs/APP_CREATION_PLAYBOOK.md](docs/APP_CREATION_PLAYBOOK.md).
Commit and PR quality rules: [docs/COMMIT_QUALITY_RULES.md](docs/COMMIT_QUALITY_RULES.md).
Documentation audit record: [docs/DOCS_AUDIT_2026-04.md](docs/DOCS_AUDIT_2026-04.md).

## 🌳 Monorepo Layout

- `apps/desktop` — Tauri + React UI (Rust backend, WebKit renderer; Electron removed in v0.2.0-alpha)
- `packages/shared` — Shared types, IPC channel names, Zod schemas
- `docker/compose/*` — Bundled `docker compose` profiles

## 📜 License

MIT — see [LICENSE](LICENSE).

---
*Built with ❤️ for the Linux Developer Community.*
