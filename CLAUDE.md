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
pnpm smoke                          # Full CI gate: typecheck + test + cargo test + lint (no test:e2e)
pnpm test:roundtrip                 # docker/profile/scaffold contract error roundtrips
pnpm test:e2e                       # Vitest unit: criticalScenarios + moduleAvailability (not browser E2E)
pnpm test:coverage                  # Vitest with coverage

# Run a single test file
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/dockerContract.test.ts
```

## Architecture

**Monorepo** with two packages:
- `packages/shared` — IPC channel names (`IPC` const), Zod request/response schemas, TypeScript types. Built before desktop.
- `apps/desktop` — Tauri desktop app: Rust handlers in `src-tauri`, React renderer.

### IPC data flow

Renderer → `desktopApiBridge.ts` → `invoke` / `ipc_send` → Rust `ipc_invoke` / handlers → host.

- All channel names come from `IPC` in `@linux-dev-home/shared`
- Request payloads validated at the IPC boundary (Zod in shared schemas; Rust in `src-tauri/src/lib.rs`)
- `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` — Tauri transport layer
- Dialogs (`selectFolder`, `filePickOpen`, `filePickSave`) use `@tauri-apps/plugin-dialog` directly in the bridge — they do not go through `ipc_invoke`

### Rust backend (`apps/desktop/src-tauri/`)

`compose_profiles.rs` resolves `docker/compose/<profile>` for `dh:compose:up` / `dh:compose:logs` (repo walk, **`LUMINA_DEV_COMPOSE_ROOT`**, or bundled resources from `tauri.conf.json`). Optional **`LUMINA_DEV_COMPOSE_FULL`** merges `docker-compose.full.yml` when present. **AI Core (forward, not implemented):** proposed subprocess resolution PATH → `KEEL_DEV_TOOLS_ROOT` (default `~/Documents/GitHub`) → bundled resources — see [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) §18 tool registry (`headroom/`, `last30days-skill/`, `Agent-Reach/`). Other domains live in focused modules (`runtime_jobs.rs`, `git_vcs_network.rs`, `git_vcs_file_diff.rs`, etc.); avoid growing new logic only in `lib.rs`.

Single dispatcher in `lib.rs` with two Tauri commands:

- `ipc_invoke` — request/response handlers for all channels
- `ipc_send` — fire-and-forget (terminal write/resize)

Key known limits: `job:start` background tasks use `tokio::async_runtime::spawn` + `AppState.jobs`; runtime jobs update state after completion. **`bash -c` / elevated `sudo|pkexec bash -c`** in **8+ production call sites** (not security-only): `host_exec.rs`, `executor.rs`, `ssh_handlers.rs`, `store_engine.rs`, `system_info.rs`, `monitor_handlers.rs` (journalctl pipelines). Runtime install/discover/verify use **`bash -lc`** in `runtime_install.rs`, `runtime_discover.rs`, `runtime_verify.rs`, `runtime_jobs.rs`, etc. Dynamic user input must use validated quoting or direct `Command` args — see [`docs/APP_CREATION_PLAYBOOK.md`](docs/APP_CREATION_PLAYBOOK.md) §2.8–2.9. `runtime:check-deps` and `runtime:uninstall:preview` are implemented but basic.

### Error contracts

Each domain has:

- `*Error.ts` — `humanize*Error()` — maps `[ERROR_CODE]` strings to user messages (renderer side)
- `*Contract.ts` — `assert*Ok()` — throws typed errors (renderer side)
- `*.contract.test.ts` / `*.error.test.ts` — colocated unit tests

All IPC responses use `{ ok: boolean; error?: string }` shape. Error strings are prefixed with `[ERROR_CODE]`.

### Renderer structure

- `apps/desktop/src/renderer/src/App.tsx` — route definitions
- `pages/` — one file per route + contract/error helpers + tests
- `components/` — shared UI components
- `layout/AppShell.tsx` — nav shell
- `wizard/` — readiness + first-run wizards

### Documentation map

| Doc | Use when |
| --- | --- |
| [`docs/NAMING.md`](docs/NAMING.md) | Product vs npm vs Freedesktop vs repo identifiers |
| [`docs/CORRECTED_AUDIT_REPORT.md`](docs/CORRECTED_AUDIT_REPORT.md) | Independent re-verification (2026-06-19); retracted C1/M10 schema findings |
| [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) | Active backlog, release gate, **§19 stay/delete/transform** |
| [`newCore.md`](newCore.md) | AI Core AC0–AC7 forward track (proxy, graph, headroom, autopilot) — canonical spec |
| [`phasesPlan.md`](phasesPlan.md) | Phase history, architecture rules, known bugs table |
| [`docs/AUDIT.md`](docs/AUDIT.md) | Audit findings, manual page QA checklist |
| [`docs/ROUTE_STATUS.md`](docs/ROUTE_STATUS.md) | Route live/partial/stub truth before changing UI behavior |
| [`docs/SMART_FLOW_VCS.md`](docs/SMART_FLOW_VCS.md) | Git VCS Smart-Flow (`/git?tab=vcs`) roadmap |
| [`docs/STABILIZATION_CHECKLIST.md`](docs/STABILIZATION_CHECKLIST.md) | Stabilization evidence + B5 manual tests |

**Removed from product (do not reintroduce without explicit decision):** Settings Extension tab, dashboard widgets, `layoutGet`/`layoutSet` IPC, `widgetRegistry`.

**Settings** (`/settings`): 14 tabs via `SettingsShell.tsx`; **System** tab edits `/etc/hosts` (pkexec) and `~/.profile` exports via `hostExec`; **Connected accounts** holds GitHub/GitLab auth; no Extension tab.

### Shared package (`packages/shared/src/`)

- `ipc.ts` — `IPC` const with all channel strings + TypeScript types (**138** total; **25** `dh:git:vcs:*`)
- `ipcSchemaMap.ts` — canonical channel → Zod map (**133/133** dispatcher coverage)
- `schemas.ts` — Zod schemas for request/response payloads
- `foundation.ts` — `JobStartRequest` and shared foundation types

**Inventory counts:** use [`docs/SCHEMA_COVERAGE_ANALYSIS.md`](docs/SCHEMA_COVERAGE_ANALYSIS.md) — **138** IPC strings, **133/133** dispatcher Zod map, **106** exported `*RequestSchema` names (informational). Do not cite retired **54**, **~70**, **71**, **134**, or **137**. Graphify community **59**/**70** are cluster IDs, not file or schema counts. **20** routes, **62** Rust `.rs` files, **74** Vitest files (**67** desktop = **65** `*.test.ts` + **2** `*.test.tsx`, + **7** shared). Largest Rust modules (2026-06-20 `wc -l`): `lib.rs` ~**709**, `system_info.rs` ~**1,099**, `runtime_jobs.rs` ~**834** — do not cite retired **~706**, **~1,010**, **~792**. Count with `find … \( -name '*.test.ts' -o -name '*.test.tsx' \)` — `*.test.ts` only undercounts by **2**.

## Commit Rules

- Conventional Commits: `feat|fix|refactor|test|docs|chore: <scope>`
- One commit = one coherent intent; no micro-churn
- No direct commits to `main`; all changes via PR
- If a change affects contracts or behavior, tests go in the same PR
- No AI/tool names in branch names or commit messages

## Agent Communication Rules

- **Post-Task Instructions:** When the agent finishes their work or makes a change, they MUST provide the user with clear, step-by-step instructions on how to manually verify the change. Tell the user what to click, try, or test to ensure the implementation is correct.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
