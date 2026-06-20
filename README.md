# KeelDev

Linux developer workstation dashboard — click-first flows for Docker, Git, profiles, runtimes, system visibility, and local environment setup.

**Stack:** Tauri 2 + React renderer + Rust IPC backend. Shared contracts in `@linux-dev-home/shared` (Zod + TypeScript types). Naming: [`docs/NAMING.md`](docs/NAMING.md).

**Distribution:** Native builds only. Target is **GitHub Releases (AppImage)**. Flatpak was abandoned (2026-05-28).

---

## What works today

| Area | Maturity | Summary |
| --- | --- | --- |
| Area | Maturity | Summary |
| --- | --- | --- |
| `/docker` | **live** | Containers, images, volumes, networks, cleanup, port remap, per-container stats |
| `/git` | **live** | Git Assistant — Setup → Project → Save → Share |
| `/dashboard` | partial | Profile preset grid, metrics strip, kernels/logs sub-routes; **Create project** modal with data-science scaffolding (Python/R/both via `dataScienceCreateWizard`) |
| `/profiles` | partial | Custom-named environments — CRUD, duplicate, export/import, compose variants, Set Active / switch (**no** project scaffolding — see `/dashboard`) |
| `/runtimes` | partial | 7 language toolchains (Node, Python, Java, Go, Rust, PHP, .NET) — status, install, uninstall preview |
| `/ssh` | partial | Keygen, GitHub test, remote setup, bookmarks |
| `/dashboard/monitor` | live | CPU/RAM/disk metrics, processes, security snapshot (`/system` redirects) |
| `/maintenance` | partial | Guardian health score, diagnostics bundle, scheduled tasks |
| `/settings` | partial | 14 tabs — Dev Home layout, Connected accounts auth, System hosts/~/.profile editing |
| `/system-readiness` | live | Host readiness report + fix actions (`SystemReadinessPage`); also first-run **ReadinessWizard** before main shell |
| `/terminal` | partial | xterm + host PTY session (`portable_pty`); experimental multiplexer (beta) |

**Verified inventory (2026-06-20):** **138** IPC channels · **133/133** dispatcher Zod map · **20** routes · **25** `dh:git:vcs:*` · **62** Rust `.rs` under `src-tauri/src` · largest modules `lib.rs` **709** / `system_info.rs` **1,099** / `runtime_jobs.rs` **834** lines · **74** Vitest files (**67** desktop = **65** `*.test.ts` + **2** `*.test.tsx`, + **7** shared) · **0** renderer `ipc_invoke` bypasses. Guards: `ipcSchemaCoverage.test.ts`, `ipcSchemaSourceDistParity.test.ts`.

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

Refer to the following active guidelines and policies:

- [CLAUDE.md](CLAUDE.md) — Architecture summary, CLI commands, and agent guidelines.
- [CONTRIBUTING.md](CONTRIBUTING.md) — Setup instructions and contribution guidelines.
- [docs/NAMING.md](docs/NAMING.md) — Product and codebase naming conventions.
- [docs/BRANCHING.md](docs/BRANCHING.md) — Git branching and packaging rules.
- [docs/COMMIT_QUALITY_RULES.md](docs/COMMIT_QUALITY_RULES.md) — Mandatory commit quality standard.

---

## Known limitations

- Embedded terminal uses a real PTY (`portable_pty` via `terminal_pty.rs`); full-screen TUIs may still differ slightly from native terminal emulators — **Open External Terminal** fallback available.
- Runtime install and some Docker flows need Polkit/sudo on the host.
- AppImage E2E verification on a clean VM is pending final sign-off.

---

## Docker CI image

```bash
docker build -f docker/Dockerfile .
```

Runs workspace typecheck, tests, lint, and production build inside Node 20.

---

## License

MIT — see [LICENSE](LICENSE).
