# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                        # Install all deps
pnpm dev                            # Tauri dev (default shell; needs Rust + WebKit deps locally)
pnpm test                           # Unit tests (shared + desktop)
pnpm typecheck                      # TypeScript across workspace
pnpm lint                           # ESLint
pnpm build                          # Renderer production bundle + copy compose profiles (no Rust)
pnpm smoke                          # Full CI gate: typecheck + test + lint
pnpm test:integration               # Docker IPC integration tests (needs Docker daemon)
pnpm test:e2e                       # Critical scenarios E2E
pnpm test:coverage                  # Vitest with coverage

# Run a single test file
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/dockerContract.test.ts

# Legacy Electron shell (optional)
cd apps/desktop && pnpm dev:electron

# Electron native PTY rebuild (only if you use dev:electron / build:electron)
cd apps/desktop && pnpm exec electron-rebuild -f -w node-pty
```

## Architecture

**Monorepo** with two packages:
- `packages/shared` — IPC channel names (`IPC` const), Zod request/response schemas, TypeScript types, widget registry. Built before desktop.
- `apps/desktop` — **Tauri-first** desktop app: Rust handlers in `src-tauri`, React renderer. **Electron** (`electron-vite`, main, preload) remains for parity and `pack:linux` until fully retired.

### IPC data flow

**Tauri (default):** Renderer → `desktopApiBridge.ts` → `invoke` / `ipc_send` → Rust `ipc_invoke` / handlers → host.

**Electron (legacy):** Renderer → `window.dh.*` → preload (`contextBridge`) → `ipcMain` → Node/Docker/OS.

- `window.dh` typed in `apps/desktop/src/preload/index.ts` when running under Electron.
- All channel names come from `IPC` in `@linux-dev-home/shared`
- All request payloads validated at the IPC boundary (Zod in shared schemas; Rust or Node entry points).
- `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` — Tauri transport; when `__TAURI_INTERNALS__` is absent, falls back to `window.dh`.

### Main process (`apps/desktop/src/main/index.ts`) — Electron only

Registers `ipcMain.handle` for the legacy shell: Docker (dockerode), SSH, Git (simple-git), terminal (`node-pty`), metrics, job runner, layout/store, compose profiles. **Shipped path uses Rust** in `src-tauri/src/lib.rs`.

### Error contracts

Each domain has:
- `*Error.ts` — `*ErrorCode` enum + `*ErrorString()` classifier (main process side)
- `*Contract.ts` — `assert*Ok()` helper that throws typed errors (renderer side)
- `*.contract.test.ts` / `*.error.test.ts` — colocated unit tests

All IPC responses use `{ ok: boolean; error?: string }` shape. Error strings are prefixed with `[ERROR_CODE]` for structured handling.

### Renderer structure

- `apps/desktop/src/renderer/src/App.tsx` — route definitions
- `pages/` — one file per route, contains both page component and its contract/error helpers + tests
- `components/` — shared UI components
- `layout/AppShell.tsx` — nav shell wrapping all routes
- `wizard/` — onboarding wizard shown on first launch

### Shared package (`packages/shared/src/`)

- `ipc.ts` — `IPC` object with all channel name strings + TypeScript types (`ContainerRow`, `HostMetrics`, etc.)
- `schemas.ts` — Zod schemas for all request/response payloads
- `foundation.ts` — `SessionKind` (flatpak vs native), `DashboardLayoutFile`, `JobStartRequest` schemas
- `widgetRegistry.ts` — registered widget types for dashboard

## Quality Gate Policy

Active freeze: no new feature expansion outside Docker vertical slice until hardening is complete. All Docker destructive actions must keep confirmation + error handling. `smoke` and Docker tests must pass before phase expansion.

## Commit Rules

- Conventional Commits: `feat|fix|refactor|test|docs|chore: <scope>`
- One commit = one coherent intent; no micro-churn
- No direct commits to `main`; all changes via PR
- If a change affects contracts or behavior, tests go in the same PR

## Flatpak Notes

Flatpak sessions require host overrides for Docker socket access and SSH paths. Some cleanup ops are manual-assisted due to host privilege boundaries. See `docs/DOCKER_FLATPAK.md` and `docs/PRIVILEGE_BOUNDARY_MATRIX.md`.
