# LuminaDev

Linux developer workstation dashboard, focused on safe click-first flows for Docker, system visibility, and local machine setup.

> **Runtime migration:** Tauri backend port complete. All `ipc_invoke` channels run Rust-native; Node.js bridge removed. File/folder pickers on Tauri use `@tauri-apps/plugin-dialog` from the renderer (not `dh:dialog:*` over invoke). Ongoing work is tracked in [Agent work plan](docs/AGENT_WORK_PLAN.md) and [Stabilization Checklist](docs/STABILIZATION_CHECKLIST.md).

## Project Status (truthful snapshot)

This project is in active development. Features below are split by maturity:

- **Implemented (verified)**:
  - Docker surface: container list/actions/logs plus image/volume/network cleanup flows.
  - Maintenance and Monitor pages with metrics + job runner integration.
  - SSH and Git configuration UI flows.
  - Typed IPC boundaries via `@linux-dev-home/shared` schemas.
- **Partial / evolving**:
  - Tauri migration: core port done; packaging (Flatpak) intentionally last — heavy CI.
  - `dh:docker:install` / `dh:docker:remap-port`: Tauri — install refuses in Flatpak session / without sudo; remap clones then **stops and removes** the source container when stop succeeds (`sourceRemoved` in response).
  - Flatpak packaging and cross-distro consistency.
  - Runtime install/update matrix hardening.
  - Diagnostics and support bundle depth.
- **Planned**:
  - Advanced source-control cloud integrations, extensions, and broader automation.

## Quality Gate Policy

Until Docker vertical slice hardening is complete:

1. No new feature expansion outside Docker vertical slice fixes.
2. All Docker destructive actions must keep confirmation + tested error handling.
3. `smoke` and Docker-related tests must pass before phase expansion.
4. Documentation must use `Implemented / Partial / Planned` wording only.
5. Commit hygiene: no micro-churn commits; each commit must represent one reviewable change with a descriptive message.

## Known Limits

- Flatpak sessions require explicit host overrides for some operations (Docker socket, SSH paths).
- Some cleanup operations are manual-assisted due to host privilege boundaries.
- Electron + Flatpak + native modules (`node-pty`) can require per-system rebuild/runtime tuning.

## 🛠️ Prerequisites

- **Node.js 20+**
- **pnpm** 9 (`corepack enable` recommended)
- **Docker** (optional, for compose stacks and the Docker panel)
- **Build toolchain:** `build-essential`, `python3` (required for native `node-pty` module)

## 🚀 Getting Started

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Rebuild native modules:**
   After install, rebuild native modules for your Electron version:
   ```bash
   cd apps/desktop && pnpm exec electron-rebuild -f -w node-pty
   ```

3. **Development scripts:**
   ```bash
   pnpm dev          # Run electron-vite dev server
   pnpm test         # Run shared package unit tests (Zod)
   pnpm typecheck    # Run TypeScript validation
   pnpm lint         # Run ESLint
   pnpm build        # Build production bundle + copy compose profiles
   ```

## 🐳 Docker CI Image

```bash
docker build -f docker/Dockerfile .
```
The image runs tests, typecheck, lint, and production build inside Node 20.

## 📦 Flatpak & Docker socket

See [docs/DOCKER_FLATPAK.md](docs/DOCKER_FLATPAK.md), [docs/INSTALL_TEST.md](docs/INSTALL_TEST.md), and [docs/FLATHUB_CHECKLIST.md](docs/FLATHUB_CHECKLIST.md).
Privilege behavior matrix and verification steps: [docs/PRIVILEGE_BOUNDARY_MATRIX.md](docs/PRIVILEGE_BOUNDARY_MATRIX.md).

## ✅ Stabilization Tracker

See [docs/STABILIZATION_CHECKLIST.md](docs/STABILIZATION_CHECKLIST.md) for remaining reliability/safety/process closure items and acceptance criteria.
For reusable engineering lessons and incident-driven build process, see [docs/APP_CREATION_PLAYBOOK.md](docs/APP_CREATION_PLAYBOOK.md).
Commit and PR quality rules: [docs/COMMIT_QUALITY_RULES.md](docs/COMMIT_QUALITY_RULES.md).
Documentation audit record: [docs/DOCS_AUDIT_2026-04.md](docs/DOCS_AUDIT_2026-04.md).

## 🌳 Monorepo Layout

- `apps/desktop` — Electron + React UI
- `packages/shared` — Shared types, IPC channel names, Zod schemas
- `docker/compose/*` — Bundled `docker compose` profiles
- `flatpak/` — Flatpak manifest template + notes

## 📜 License

MIT — see [LICENSE](LICENSE).

---
*Built with ❤️ for the Linux Developer Community.*
