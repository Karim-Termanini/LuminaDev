# LuminaDev

Linux developer workstation dashboard, focused on safe click-first flows for Docker, system visibility, and local machine setup.

> **Runtime migration:** Tauri backend port complete. All `ipc_invoke` channels run Rust-native; Node.js bridge removed. File/folder pickers on Tauri use `@tauri-apps/plugin-dialog` from the renderer (not `dh:dialog:*` over invoke). Ongoing work is tracked in [Agent work plan](docs/AGENT_WORK_PLAN.md) and [Stabilization Checklist](docs/STABILIZATION_CHECKLIST.md).

## Current Status

This project is in active development. Features below are split by maturity:

- **Implemented (verified)**:
  - Docker surface: container list/actions/logs plus image/volume/network cleanup flows.
  - Maintenance and Monitor pages with metrics + job runner integration.
  - SSH and Git configuration UI flows.
  - Typed IPC boundaries via `@linux-dev-home/shared` schemas.
- **Partial / evolving**:
  - `dh:docker:install` / `dh:docker:remap-port`: install wizard (distro + sudo) and port-remap clone flow; remap stops and removes the source container on success (`sourceRemoved` in response).
  - **Settings** (`/settings`): personalization (accent), read-only SSH bookmark overview, structured **hosts** and **process env** diagnostics. Host file editing and profile-scoped env files are not implemented yet ([`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md)).
  - Runtime install/update matrix hardening.
  - Diagnostics and support bundle depth.
- **Planned**:
  - Extensions, theme rollout, and broader automation.

## Quality Gate Policy

Until Docker vertical slice hardening is complete:

1. No new feature expansion outside Docker vertical slice fixes.
2. All Docker destructive actions must keep confirmation + tested error handling.
3. `smoke` and Docker-related tests must pass before phase expansion.
4. Documentation must use `Implemented / Partial / Planned` wording only.
5. Commit hygiene: no micro-churn commits; each commit must represent one reviewable change with a descriptive message.

## Known Limitations

- **Security boundaries:** Some cleanup operations are manual-assisted due to host privilege boundaries.
- **Modularization:** `apps/desktop/src-tauri/src/lib.rs` was partially modularized in Alpha 0.2.0; remaining IPC domains will be split in future iterations.

## 🛠️ Prerequisites

- **Node.js 20+**
- **pnpm** 9 (`corepack enable` recommended)
- **Docker** (optional, for compose stacks and the Docker panel)
- **Tauri (default dev):** Rust stable, and on Linux the WebKit/GTK dev packages your distro documents for Tauri v2 (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).
- **Tauri:** Rust stable + WebKit/GTK dev packages (see [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/)).

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

## 📦 Flatpak

Distributed as a Flatpak with full host permissions (`--filesystem=host`, `--device=all`, `--socket=system-bus`). No sandbox overrides required — Docker socket, SSH, PTY, and `/proc` all work out of the box.

## ✅ Stabilization Tracker

See [docs/STABILIZATION_CHECKLIST.md](docs/STABILIZATION_CHECKLIST.md) for remaining reliability/safety/process closure items and acceptance criteria.
Snapshot (stages + PRs + what’s left): [docs/STATUS.md](docs/STATUS.md).
Route behavior matrix (live vs partial vs stub): [docs/ROUTE_STATUS.md](docs/ROUTE_STATUS.md).
For reusable engineering lessons and incident-driven build process, see [docs/APP_CREATION_PLAYBOOK.md](docs/APP_CREATION_PLAYBOOK.md).
Commit and PR quality rules: [docs/COMMIT_QUALITY_RULES.md](docs/COMMIT_QUALITY_RULES.md).
Documentation audit record: [docs/DOCS_AUDIT_2026-04.md](docs/DOCS_AUDIT_2026-04.md).

## 🌳 Monorepo Layout

- `apps/desktop` — Tauri + React UI (Electron stack kept under `dev:electron` / `build:electron` until removed)
- `packages/shared` — Shared types, IPC channel names, Zod schemas
- `docker/compose/*` — Bundled `docker compose` profiles
- `flatpak/` — Flatpak manifest template + notes

## 📜 License

MIT — see [LICENSE](LICENSE).

---
*Built with ❤️ for the Linux Developer Community.*
