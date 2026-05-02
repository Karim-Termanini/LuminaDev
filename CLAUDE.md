# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                        # Install all deps
pnpm dev                            # Tauri dev (needs Rust + WebKit deps locally)
pnpm test                           # Unit tests (`@linux-dev-home/shared` build, then shared + desktop Vitest)
pnpm typecheck                      # TypeScript across workspace
pnpm lint                           # ESLint
pnpm build                          # Renderer production bundle + copy compose profiles
pnpm smoke                          # Full CI gate: typecheck + test + lint
pnpm test:integration               # Docker IPC integration tests (needs Docker daemon)
pnpm test:e2e                       # Critical scenarios E2E
pnpm test:coverage                  # Vitest with coverage

# Run a single test file
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/dockerContract.test.ts
```

## Architecture

**Monorepo** with two packages:
- `packages/shared` — IPC channel names (`IPC` const), Zod request/response schemas, TypeScript types, widget registry. Built before desktop.
- `apps/desktop` — Tauri desktop app: Rust handlers in `src-tauri`, React renderer.

### IPC data flow

Renderer → `desktopApiBridge.ts` → `invoke` / `ipc_send` → Rust `ipc_invoke` / handlers → host.

- All channel names come from `IPC` in `@linux-dev-home/shared`
- Request payloads validated at the IPC boundary (Zod in shared schemas; Rust in `src-tauri/src/lib.rs`)
- `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` — Tauri transport layer
- Dialogs (`selectFolder`, `filePickOpen`, `filePickSave`) use `@tauri-apps/plugin-dialog` directly in the bridge — they do not go through `ipc_invoke`

### Rust backend (`apps/desktop/src-tauri/`)

`compose_profiles.rs` resolves `docker/compose/<profile>` for `dh:compose:up` / `dh:compose:logs` (repo walk, `LUMINA_DEV_COMPOSE_ROOT`, or bundled resources from `tauri.conf.json`). Optional **`LUMINA_DEV_COMPOSE_FULL`** merges `docker-compose.full.yml` when present. Other domains live in focused modules (`runtime_jobs.rs`, `git_vcs_network.rs`, `git_vcs_file_diff.rs`, etc.); avoid growing new logic only in `lib.rs`.

Single dispatcher in `lib.rs` with two Tauri commands:

- `ipc_invoke` — request/response handlers for all channels
- `ipc_send` — fire-and-forget (terminal write/resize)

Key known limits: `job:start` background tasks use `tokio::async_runtime::spawn` + `AppState.jobs`; runtime jobs update state after completion. Security probes use `bash -c` internally. `runtime:check-deps` and `runtime:uninstall:preview` are implemented but basic.

### Error contracts

Each domain has:

- `*Error.ts` — `humanize*Error()` — maps `[ERROR_CODE]` strings to user messages (renderer side)
- `*Contract.ts` — `assert*Ok()` — throws typed errors (renderer side)
- `*.contract.test.ts` / `*.error.test.ts` — colocated unit tests

All IPC responses use `{ ok: boolean; error?: string }` shape. Error strings are prefixed with `[ERROR_CODE]`.

### Renderer structure

- `apps/desktop/src/renderer/src/App.tsx` — route definitions
- `pages/` — one file per route + contract/error helpers + tests
- **`docs/SMART_FLOW_VCS.md`** — “Zero Terminal” / Smart-Flow VCS roadmap (Smart Push, conflict studio, PR wizard, banners); handoff doc for future `/git-vcs` work
- **`SettingsPage.tsx`** — `/settings`: category rail + `hp-*` cards; `storeGet`/`storeSet` for `ssh_bookmarks` / `appearance`; `hostExec` commands `settings_read_hosts`, `settings_process_env` (see `HostExecRequestSchema` in shared + `dh:host:exec` match arms in `lib.rs`); accent applied via `applyAppearanceAccent` / `syncAppearanceFromStore`
- `components/` — shared UI components
- `layout/AppShell.tsx` — nav shell
- `wizard/` — onboarding wizard on first launch

### Shared package (`packages/shared/src/`)

- `ipc.ts` — `IPC` const with all channel strings + TypeScript types
- `schemas.ts` — Zod schemas for all request/response payloads
- `foundation.ts` — `SessionKind` (flatpak vs native), `DashboardLayoutFile`, `JobStartRequest`
- `widgetRegistry.ts` — registered widget types for dashboard

## Commit Rules

- Conventional Commits: `feat|fix|refactor|test|docs|chore: <scope>`
- One commit = one coherent intent; no micro-churn
- No direct commits to `main`; all changes via PR
- If a change affects contracts or behavior, tests go in the same PR
- No AI/tool names in branch names or commit messages

## Flatpak Notes

Flatpak sessions require host overrides for Docker socket, SSH paths, and terminal PTY. See `docs/DOCKER_FLATPAK.md` and `docs/PRIVILEGE_BOUNDARY_MATRIX.md`.
