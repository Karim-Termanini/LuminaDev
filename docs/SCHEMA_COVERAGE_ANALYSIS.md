# Zod Schema Coverage Analysis

**Last updated:** 2026-06-19 (Phase 18 P10)

## Source of truth

Do **not** cite retired figures (**54**, **~70**, **70/137**, **134**, **137**) from P13-era audits. Those counted different things (manual schema subsets, graphify community IDs, stale `IPC` sizes).

**Authoritative dispatcher coverage:** `IPC_REQUEST_SCHEMAS` in `packages/shared/src/ipcSchemaMap.ts` — **133/133** (100%). Guard: `packages/shared/test/ipcSchemaCoverage.test.ts`.

Run live counts after any IPC or schema change:

```bash
cd packages/shared && pnpm exec vitest run test/ipcSchemaCoverage.test.ts

# IPC channel strings (expect 138)
node -e "const fs=require('fs');const s=fs.readFileSync('packages/shared/src/ipc.ts','utf8');console.log([...s.matchAll(/'dh:[^']+'/g)].length)"

# Git VCS namespace (expect 25)
node -e "const fs=require('fs');const s=fs.readFileSync('packages/shared/src/ipc.ts','utf8');console.log([...s.matchAll(/'dh:git:vcs:[^']+'/g)].length)"

# Exported RequestSchema names (informational — includes aliases; not channel coverage)
rg -c 'export const \\w+RequestSchema' packages/shared/src/schemas.ts packages/shared/src/foundation.ts

# Vitest files (expect 63 desktop + 5 shared = 68)
find apps/desktop -name '*.test.ts' -o -name '*.test.tsx' | wc -l
find packages/shared/test -name '*.test.ts' | wc -l

# Rust .rs under src-tauri/src (expect 62)
find apps/desktop/src-tauri/src -name '*.rs' | wc -l
```

## Current metrics (2026-06-19)

| Metric | Value | Notes |
| --- | --- | --- |
| Total `IPC` channel strings | **138** | `Object.values(IPC)` in `ipc.ts` |
| Excluded (dialog plugins + terminal events) | **5** | Not in `IPC_REQUEST_SCHEMAS` |
| Dispatcher channels (`ipc_invoke` / `ipc_send`) | **133** | |
| Channels in `IPC_REQUEST_SCHEMAS` | **133** (100%) | |
| Payload channels (non-`EmptyRequestSchema`) | **~104** | From `ipcSchemaCoverageStats()` |
| No-payload channels (`EmptyRequestSchema`) | **~29** | List/status/check channels |
| Exported `*RequestSchema` consts | **106** | **103** in `schemas.ts` + **3** in `foundation.ts` — many are aliases of the same Zod object |
| `dh:git:vcs:*` channels | **25** | All wired ipc.ts → bridge → Rust |
| Git VCS UI-active (`window.dh.gitVcs*` in `pages/`) | **16** | Git Assistant + changes panel + remote sync |
| Git VCS legacy (bridge only / contract tests) | **9** | Pro Git tab UI removed — handlers kept |

### Git VCS channel breakdown

**UI-active (16):** `status`, `branches`, `remotes`, `diff`, `stage`, `unstage`, `commit`, `pull`, `push`, `fetch`, `checkout`, `stash`, `merge-continue`, `merge-abort`, `rebase-continue`, `rebase-abort`.

**Legacy / contract-only (9):** `merge`, `rebase`, `stash-pop`, `rebase-skip`, `rename-branch`, `conflict-diff`, `conflict-hunks`, `resolve-conflict`, `resolve-hunk`.

First-pass audits claimed **28** `dh:git:vcs:*` channels — incorrect.

## Counting methodology (M7)

| What you might see | What it measured | Status |
| --- | --- | --- |
| **54** | P13 manual “documented schemas” subset | **Retired** |
| **~70** / **70/137** | Partial export count or graphify community **70** | **Retired** — community ID ≠ schema count |
| **91** / **94** | Lines matching `RequestSchema` in exports + `z.infer` types | **Informational only** — not dispatcher coverage |
| **106** | `export const *RequestSchema` in `schemas.ts` + `foundation.ts` | **Informational** — aliases inflate vs unique Zod objects |
| **133/133** | `IPC_REQUEST_SCHEMAS` map entries | **Authoritative** for boundary coverage |
| **138** | `IPC` const size | **Authoritative** total channel strings |

**Rule:** For “do we have Zod for every dispatcher channel?” use **133/133** only. Export-line counts are for maintainers auditing alias sprawl, not release gates.

## Excluded channels (intentionally outside map)

| Channel | Reason |
| --- | --- |
| `dh:dialog:folder` | `@tauri-apps/plugin-dialog` |
| `dh:dialog:file:open` | `@tauri-apps/plugin-dialog` |
| `dh:dialog:file:save` | `@tauri-apps/plugin-dialog` |
| `dh:terminal:data` | Tauri event listener |
| `dh:terminal:exit` | Tauri event listener |

## Architecture

```
Renderer → desktopApiBridge.ts → ipc_invoke / ipc_send → Rust handlers
                ↑
    IPC_REQUEST_SCHEMAS (packages/shared/src/ipcSchemaMap.ts)
    *RequestSchema exports (packages/shared/src/schemas.ts + foundation.ts)
```

**P10 scope:** TypeScript Zod definitions + canonical channel map. The bridge does **not** call `.parse()` on every invoke yet; Rust still validates ad hoc.

## Guards

| Guard | Location | Purpose |
| --- | --- | --- |
| Channel name parity TS ↔ Rust | `apps/desktop/src-tauri/src/ipc_contract_tests.rs` | Prevents drift in channel strings |
| Schema map completeness | `packages/shared/test/ipcSchemaCoverage.test.ts` | Every dispatcher channel has a Zod schema |
| Payload roundtrips | `packages/shared/test/schemas.test.ts` | P10 batch parse tests |

## Follow-up (post-P10)

- Wire `desktopApiBridge.ts` to `.parse()` with `IPC_REQUEST_SCHEMAS` (optional hardening).
- Response `*ResponseSchema` Zod (out of P10 scope).
