# LuminaDev

Linux developer workstation dashboard — click-first flows for Docker, Git, profiles, runtimes, system visibility, and local environment setup.

**Stack:** Tauri 2 + React renderer + Rust IPC backend. Shared contracts in `@linux-dev-home/shared` (Zod + TypeScript types).

**Distribution:** Native builds only. Target is **GitHub Releases (AppImage)**. Flatpak was abandoned (2026-05-28).

---

## What works today

| Area | Maturity | Summary |
| --- | --- | --- |
| [`/docker`](docs/ROUTE_STATUS.md) | **live** | Containers, images, volumes, networks, cleanup, port remap, per-container stats |
| [`/git`](docs/ROUTE_STATUS.md) | **live** | Unified hub — Config, VCS (Smart-Flow), Cloud Git |
| [`/dashboard`](docs/ROUTE_STATUS.md) | partial | Profile preset grid, metrics strip, kernels/logs sub-routes |
| [`/profiles`](docs/ROUTE_STATUS.md) | partial | CRUD, compose variants, scaffolding (incl. data-science Python/R/both) |
| [`/runtimes`](docs/ROUTE_STATUS.md) | partial | 17 language toolchains — status, install, uninstall preview |
| [`/ssh`](docs/ROUTE_STATUS.md) | partial | Keygen, GitHub test, remote setup, bookmarks |
| [`/system`](docs/ROUTE_STATUS.md) | partial | CPU/RAM/disk metrics, processes, security snapshot |
| [`/maintenance`](docs/ROUTE_STATUS.md) | partial | Guardian health score, diagnostics bundle, scheduled tasks |
| [`/settings`](docs/ROUTE_STATUS.md) | partial | 14 tabs — Dev Home layout, Connected accounts auth, System hosts/~/.profile editing |
| [`/terminal`](docs/ROUTE_STATUS.md) | partial | Embedded shell (line-buffered, not full PTY) |

Route-level detail: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md).

**Removed from scope (2026-05-29):** Settings Extension tab / plugin marketplace; dashboard widget catalog and layout IPC.

---

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable`)
- Rust stable + [Tauri v2 Linux deps](https://v2.tauri.app/start/prerequisites/)
- Docker (optional — compose profiles and Docker panel)

---

## Quick start

```bash
pnpm install
pnpm dev          # Tauri dev (Rust + Vite)
pnpm smoke        # Full CI gate: typecheck, test, lint, cargo test/clippy
```

Other scripts:

```bash
pnpm test         # Vitest (shared + desktop)
pnpm typecheck    # TypeScript across workspace
pnpm lint         # ESLint
pnpm build        # Renderer bundle + compose profiles
pnpm --filter desktop build:tauri   # Production desktop bundle
pnpm pack:linux   # Linux packaging helper
```

---

## Monorepo layout

```
apps/desktop/          Tauri app — src-tauri/ (Rust), renderer/ (React)
packages/shared/       IPC channel names, Zod schemas, shared types
docker/compose/        Bundled compose profiles (web-dev, data-science, …)
```

Rust backend: ~37 domain modules; `lib.rs` is a thin IPC dispatcher only. See [`CLAUDE.md`](CLAUDE.md) for architecture and agent guidance.

---

## Quality gate

All PRs must pass **`pnpm smoke`** before merge.

- Destructive flows (Docker prune, runtime uninstall, profile teardown) require confirmation and tested `[ERROR_CODE]` errors.
- No regression on live/partial routes without test updates.
- Docs use **Implemented / Partial / Planned / Out of scope** only.
- Conventional Commits; one coherent intent per commit — see [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`docs/COMMIT_QUALITY_RULES.md`](docs/COMMIT_QUALITY_RULES.md).

---

## Documentation

| Document | Purpose |
| --- | --- |
| [`phasesPlan.md`](phasesPlan.md) | Phase history, architecture rules, known-bugs table |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Active backlog and release priorities |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Consolidated audit + manual QA checklist |
| [`docs/STATUS.md`](docs/STATUS.md) | Release track snapshot |
| [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md) | Stabilization gate evidence |
| [`docs/SMART_FLOW_VCS.md`](docs/SMART_FLOW_VCS.md) | Git Smart-Flow VCS blueprint |
| [`docs/APP_CREATION_PLAYBOOK.md`](docs/APP_CREATION_PLAYBOOK.md) | Engineering lessons / incident log |
| [`docs/INSTALL_TEST.md`](docs/INSTALL_TEST.md) | Native / AppImage install verification |

---

## Known limitations

- Embedded terminal is line-buffered — interactive TUI apps (vim, htop) may not work; use external terminal fallback.
- Runtime install and some Docker flows need Polkit/sudo on the host.
- AppImage E2E verification on a clean VM is not yet signed off ([`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md)).

---

## Docker CI image

```bash
docker build -f docker/Dockerfile .
```

Runs workspace typecheck, tests, lint, and production build inside Node 20.

---

## License

MIT — see [LICENSE](LICENSE).
test change
test change
