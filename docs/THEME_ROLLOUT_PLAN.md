# Theme & surface rollout plan (post–Maintenance pilot)

Maintenance introduced a **scoped “product surface”**: ambient gradients, gradient hero typography, icon-backed tab rails, elevated cards, KPI chips, hover-lift tiles, diagnostics rows with state accent, and terminal-style output panels — all under a **page root class** (`.maint-page`) plus a **co-located stylesheet** (`MaintenancePage.css`) so the global `hp-*` system stays intact.

This document is the agreed roadmap to **generalize that look** across the app without a big-bang rewrite.

## Principles

1. **Scope by page** — Each route (or feature area) gets a root class (e.g. `.docker-page`, `.git-page`) and optional `FeaturePage.css`. Avoid bloating `global.css` with route-specific rules.
2. **Reuse tokens** — Continue using `var(--accent)`, `var(--bg-widget)`, `var(--border)`, codicons, and existing `hp-btn` / `hp-card` / `hp-input`. Overrides target **children of the page root** (same pattern as `.maint-page .hp-card`).
3. **Progressive enhancement** — Ship one route at a time; keep layouts and IPC behavior unchanged; only elevate **hierarchy, spacing, motion, and readability**.
4. **Truth in chrome** — Nav / badges (`AppShell`) stay aligned with **`docs/ROUTE_STATUS.md`**; “wow” UI must not imply `live` where the matrix says `partial` or `stub`.

## Extractable building blocks (from Maintenance)

| Block | Reuse on other pages |
| --- | --- |
| Hero (eyebrow + gradient title + subcopy) | Any primary “hub” route (Docker, Git, System) |
| Tab / section rail (icons + short + full label @ wide) | Multi-tab pages (Docker, Runtimes) |
| Elevated `.hp-card` under page root | All dense dashboards |
| KPI / metric pills | System, Docker summary, Guardian widget |
| Grid tiles with left accent + hover lift | Cards, service lists, layer summaries |
| Toolbar row (primary + secondary + toggles) | Integrity-style action strips |
| Output / log panel (`pre` in dark inset) | Logs, diagnostics, job tail |

## Suggested rollout order

| Priority | Area | Rationale |
| --- | --- | --- |
| 1 | **`/system` (Monitor)** | Same “health” story as Maintenance; metrics + pills fit naturally |
| 2 | **`/docker`** | High traffic; tables + actions benefit from toolbar + card elevation |
| 3 | **`/git-config`** | Already feature-rich; hero + section rails reduce visual noise |
| 4 | **`/runtimes`** | Wizard-like steps; tiles and status panels match the new language |
| 5 | **`/dashboard` main** | Touches many widgets; do after patterns stabilize |
| 6 | **Shared shell** | Optional: subtle app-wide background (very low contrast) *or* keep per-page only |

## Engineering checklist (each PR)

- [ ] Page root class + dedicated `*Page.css` import
- [ ] No new colors outside existing CSS variables unless adding to `:root` once globally
- [ ] Codicon names verified against bundled `@vscode/codicons`
- [ ] Contrast and focus rings (`:focus-visible`) preserved
- [ ] Update **`docs/ROUTE_STATUS.md`** only when behavior status changes
- [ ] **Smoke**: `pnpm` / `bash scripts/smoke-ci.sh` (or workspace equivalent) before merge

## Non-goals (for now)

- Replacing the entire design system or switching font stack
- Full Fluent / WinUI clone (we borrow *philosophy*: clear hierarchy, strong actions, no copy-paste hacks)
- Animations heavier than ~200ms hover / transition on interactive elements

## Reference files (pilot)

- `apps/desktop/src/renderer/src/pages/MaintenancePage.tsx`
- `apps/desktop/src/renderer/src/pages/MaintenancePage.css`
- `apps/desktop/src/renderer/src/theme/global.css` (baseline tokens and `hp-*`)

When this plan is mostly done, consider promoting repeated patterns into **`theme/surfaces.css`** or small React primitives (e.g. `PageHero`, `KpiStrip`) — only after two or three pages prove the same structure.
