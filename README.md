# KeelDev

Linux developer workstation dashboard — click-first flows for Docker, Git, profiles, runtimes, system visibility, and local environment setup.

**Stack:** Tauri 2 + React renderer + Rust IPC backend. Shared contracts in `@linux-dev-home/shared` (Zod + TypeScript types). Naming: [`docs/NAMING.md`](docs/NAMING.md).

**Distribution:** Native builds only. Target is **GitHub Releases (AppImage)**. Flatpak was abandoned (2026-05-28).

---

## What works today

| Area | Maturity | Summary |
| --- | --- | --- |
| [`/docker`](docs/ROUTE_STATUS.md) | **live** | Containers, images, volumes, networks, cleanup, port remap, per-container stats |
| [`/git`](docs/ROUTE_STATUS.md) | **live** | Git Assistant — Setup → Project → Save → Share |
| [`/dashboard`](docs/ROUTE_STATUS.md) | partial | Profile preset grid, metrics strip, kernels/logs sub-routes; **Create project** modal with data-science scaffolding (Python/R/both via `dataScienceCreateWizard`) |
| [`/profiles`](docs/ROUTE_STATUS.md) | partial | Custom-named environments — CRUD, duplicate, export/import, compose variants, Set Active / switch (**no** project scaffolding — see `/dashboard`) |
| [`/runtimes`](docs/ROUTE_STATUS.md) | partial | 7 language toolchains (Node, Python, Java, Go, Rust, PHP, .NET) — status, install, uninstall preview |
| [`/ssh`](docs/ROUTE_STATUS.md) | partial | Keygen, GitHub test, remote setup, bookmarks |
| [`/dashboard/monitor`](docs/ROUTE_STATUS.md) | live | CPU/RAM/disk metrics, processes, security snapshot (`/system` redirects) |
| [`/maintenance`](docs/ROUTE_STATUS.md) | partial | Guardian health score, diagnostics bundle, scheduled tasks |
| [`/settings`](docs/ROUTE_STATUS.md) | partial | 14 tabs — Dev Home layout, Connected accounts auth, System hosts/~/.profile editing |
| [`/system-readiness`](docs/ROUTE_STATUS.md) | live | Host readiness report + fix actions (`SystemReadinessPage`); also first-run **ReadinessWizard** before main shell |
| [`/terminal`](docs/ROUTE_STATUS.md) | partial | xterm + host PTY session (`portable_pty`); experimental multiplexer (beta) |

Route-level detail: [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md).

**Verified inventory (2026-06-19):** **138** IPC channels · **133/133** dispatcher Zod map · **20** routes · **25** `dh:git:vcs:*` · **62** Rust `.rs` under `src-tauri/src` · **71** Vitest files (**64** desktop = **62** `*.test.ts` + **2** `*.test.tsx`, + **7** shared) · **0** renderer `ipc_invoke` bypasses. Guards: `ipcSchemaCoverage.test.ts`, `ipcSchemaSourceDistParity.test.ts`. Full audit closure: [`docs/CORRECTED_AUDIT_REPORT.md`](docs/CORRECTED_AUDIT_REPORT.md).

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
pnpm test              # Vitest (shared + desktop; all contract/error tests)
pnpm test:roundtrip    # Contract error roundtrips (docker, profile, scaffold)
pnpm test:e2e          # Vitest unit smoke (critical scenarios + module imports)
pnpm typecheck         # TypeScript across workspace
pnpm lint              # ESLint
pnpm build             # Renderer bundle + compose profiles
pnpm --filter desktop build:tauri   # Production desktop bundle
pnpm pack:linux        # Linux packaging helper
```

Architecture map: [`graphify-out/GRAPH_REPORT.md`](graphify-out/GRAPH_REPORT.md) (@ `fc9c8fa`). Regenerate after structural changes: `graphify update .`

---

## Monorepo layout

```
apps/desktop/          Tauri app — src-tauri/ (Rust), renderer/ (React)
packages/shared/       IPC channel names, Zod schemas, shared types
docker/compose/        Bundled compose profiles (web-dev, data-science, …)
```

Rust backend: **36 domain `mod` declarations** (**62** `.rs` source files under `src-tauri/src/`); `lib.rs` is a thin IPC dispatcher only. See [`CLAUDE.md`](CLAUDE.md) for architecture and agent guidance.

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

- Embedded terminal uses a real PTY (`portable_pty` via `terminal_pty.rs`); full-screen TUIs may still differ slightly from native terminal emulators — **Open External Terminal** fallback available.
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
