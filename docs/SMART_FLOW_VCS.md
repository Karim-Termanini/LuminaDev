# Smart-Flow VCS Strategy (“Zero Terminal”)

This document is the **operational blueprint** for evolving Git VCS from “raw Git errors in a panel” into an **intelligent assistant**: the app understands repo state, blocks unsafe actions, explains *why*, and routes the user through merge/rebase/conflict resolution and (later) cloud PR creation—**without requiring a terminal**.

**Design north star (VS Code–class clarity, Lumina simplicity):** prefer **banners + focused modals** over toast spam; prefer **one obvious next step** over a matrix of Git commands; never leak opaque `git(1)` stderr without a humanized layer (`humanizeGitVcsError` + `[GIT_VCS_*]` codes).

**UI reference:** Integration bar layout (Merge / Rebase, refs, FF-only, continue/abort/stash pop) matches the product screenshot committed as:

`docs/images/smart-flow-vcs-integration-bar.png`

**Code today (baseline—do not regress while building phases):**

| Capability | Where |
| --- | --- |
| Merge / rebase / continue / abort / rebase skip / stash pop | Renderer: `apps/desktop/src/renderer/src/pages/gitVcsIntegrateBar.tsx`; page: `GitVcsPage.tsx`; IPC: `dh:git:vcs:*` in `packages/shared` + Tauri handlers |
| Fetch / pull / push | `GitVcsPage.tsx` + `git_vcs_ipc` / `lib.rs` dispatch |
| HTTPS auth via Cloud Git tokens | `GIT_ASKPASS` path (see `CLAUDE.md` / Git VCS notes) |
| Encrypted cloud tokens (PR/MR APIs later) | `apps/desktop/src-tauri/src/cloud_auth.rs` + `dh:cloud:auth:*` / `dh:cloud:git:*` |
| Activity / merge deep links (browser) | `CloudGitActivityPanel.tsx`, `cloudGitMergeViewUrl.ts` |

---

## Phase One — “Smart Push” (verification before side effects)

**Trigger:** user clicks **Push** (today: immediate `gitVcsPush`).

**Desired behavior:**

1. **Silent remote probe (pre-push gate)**  
   - Run a **non-interactive fetch** for the relevant remote (same remote used for Pull/Fetch today).  
   - Compare **upstream** vs **HEAD** (already surfaced as ahead/behind in status—reuse or extend).

2. **If local is behind remote**  
   - **Do not push.**  
   - Show an **Integration Required** state (banner + optional short modal): explain that the server has new commits and the user must integrate first.  
   - Offer **primary actions**: open Integration flow (focus merge/rebase bar), or **Pull** (if policy allows), or **Fetch only** (dismiss).

3. **If local is not behind (clean relative to probed refs)**  
   - Proceed with **Push** as today.

4. **If push fails for policy reasons (protected branch)**  
   - **v0 shipped:** Tauri classifies common host messages into **`[GIT_VCS_PROTECTED_BRANCH]`**; the error panel uses the same amber “soft notice” treatment as integration-required, with **Open Cloud Git** (tab follows the active fetch remote when GitHub/GitLab) and **Dismiss**.  
   - **Still to do:** branch rename / suggest + **create PR/MR wizard** (push to new branch + host API). **Shipped:** **Copy raw error** on `/git-vcs` (full bracketed IPC string).

**Implementation notes:**

- **Fetch cost:** Smart Push implies extra network work; debounce double-clicks; show subtle “Checking remote…” not a blocking spinner unless slow.  
- **False positives:** if no upstream configured, Smart Push should degrade gracefully (either warn “No upstream” or push with existing behavior—product decision).  
- **Contracts:** new errors should remain `[GIT_VCS_*]` prefixed for renderer humanizers.

---

## Phase Two — Integration Bar (already partially present)

**When:** user must integrate (Smart Push blocked *or* manual workflow *or* `git status` shows merge/rebase in progress—see Phase 3 state machine).

**Surface:** the **MERGE / REBASE** card (`GitVcsIntegrateBar`).

**Product rules:**

- **Merge (standard):** available with explicit **other ref** selection.  
- **Safety:** **Fast-forward only** defaults to **on** in `gitVcsIntegrateBar.tsx`.  
- **Rebase:** “apply local commits atop updated server branch.”  
- **Stash pop:** restore stashed work after switching/integrating when appropriate.

**Automatic affordances:** when in MERGING/REBASING state, **Continue / Abort / Skip (rebase)** must remain obvious (already present); pair with **Phase 3 banner** so the user never wonders “what mode am I in?”

---

## Phase Three — Conflict Resolution Studio (“Conflict Mode”)

**When:** merge/rebase stops with conflicts (`git status` shows unmerged paths).

**Enter Conflict Mode (renderer state + styling):**

1. **Affected files list**  
   - **v0 shipped:** `parse_porcelain_v1` marks all unmerged XY pairs (`U*`, `*U`, `AA`, `DD`) as status **`C`**; `GitVcsFileList` sorts conflict rows to the top, uses a **red row + ⚠ badge**, and shows a short **“Unresolved merge conflicts”** hint above unstaged.  
   - **Still to do:** open the 3-way resolver on click (not only text diff).

2. **Resolution Studio (3-way merge UI)** — *new major component*  
   - **Left:** “Yours” (current / ours—define precisely per merge vs rebase).  
   - **Right:** “Theirs” / incoming.  
   - **Center:** merged result (editable).  
   - **Chunk actions:** Accept current / Accept incoming / Accept both (and optionally “Reset chunk”).  
   - Persist edits by writing the working tree file (and optionally auto-stage policy—product decision).

3. **Continuity**  
   - Global **Continue integration** CTA enabled when `git diff`/`status` indicates conflicts cleared **and** conflicts are staged (or define a rule).  
   - Wire to existing **`gitVcsMergeContinue` / `gitVcsRebaseContinue`**.

**Backend / data needs:**

- Reliable **unmerged path listing** (status already returns staged/unstaged—verify conflict entries are distinguishable).  
- Optional: `git diff --name-only --diff-filter=U` via a small IPC for accuracy.  
- Large files / binaries: resolver should **refuse** or **fall back** to “open in external editor” honestly.

---

## Phase Four — PR/MR Wizard (“Bridge to Cloud”)

**When:** branch is integrated and successfully **pushed** to a host for which we have a **Cloud Git token** (GitHub/GitLab; include self-hosted hosts once API base is modeled per remote).

**UI:**

- Primary CTA evolves: **Push → Create Pull Request** (contextual).  
- In-app **wizard** (modal or dedicated drawer):  
  - **Title** prefilled from **latest commit subject** (and truncate/sanitize).  
  - **Description** markdown/plain editor.  
  - **Target branch** selector (default: repo default branch if discoverable via API; else manual).  
  - **Create** → call provider API with stored token.

**After success:**

- Show **inline success** with **Open PR/MR** link + **Copy link**; optionally deep link to Lumina Cloud Git activity.

**IPC / security:**

- New channels e.g. `dh:cloud:git:pr-create` / `dh:cloud:git:mr-create` (exact names TBD) validated with Zod in `packages/shared`.  
- Rust: `cloud_git_ipc.rs` + provider methods using `EncryptedFileStore` creds.  
- Errors: `[CLOUD_GIT_*]` / `[CLOUD_AUTH_*]` humanized in renderer.

---

## Technical roadmap (for agents)

Work in **vertical slices** (each shippable behind a small flag if needed). Suggested order:

### 1) Git state machine + intelligent banners (foundation) — **v0 shipped**

- **Rust:** `apps/desktop/src-tauri/src/git_vcs_repo_state.rs` — `dh:git:vcs:status` now includes `gitOperation` (`none` \| `merging` \| `rebasing`) via `MERGE_HEAD` / `REBASE_HEAD`, plus `conflictFileCount` from `git diff --diff-filter=U`.  
- **Renderer:** `GitVcsStateBanner.tsx` on `/git-vcs` (`GitVcsPage.tsx`) shows an amber **status banner** with next-step copy when merging/rebasing or when unmerged paths remain.  
- **Next:** cherry-pick / bisect states, tighter integration with file list highlighting (Phase 3), and automated tests around the status payload.

### 2) Smart Push + protected branch dialog (behavioral win) — **prefetch gate + protected notice shipped**

- **`GitVcsPage.runPush`:** silent `gitVcsFetch` for the active fetch remote, then `gitVcsStatus`; if `behind > 0`, push is **skipped** and a **`[GIT_VCS_INTEGRATION_REQUIRED]`** notice appears (amber panel with **Pull latest**, **Fetch only**, **Dismiss**).  
- **Protected branch:** `git_vcs_network.rs` (`git_network_with_auth`) maps host stderr to **`[GIT_VCS_PROTECTED_BRANCH]`** when messages match (e.g. “protected branch”, GH006, rulesets, pre-receive hook declined); **`GitVcsPage`** shows **Open Cloud Git** + **Dismiss**.  
- **Still to do:** PR/MR wizard dialog + branch rename/suggest after protected push; optional “checking remote…” subtext on slow fetch. **Copy raw error** on the Git op error panel is **shipped**.

### 3) Conflict Mode file list + staging loop (no 3-way UI yet)

- Highlight conflicted paths; guide user to existing diff panel + stage.  
- **`dh:git:vcs:diff` (unstaged):** `git_vcs_file_diff.rs` — if `git diff -- path` is empty and `git ls-files -u` lists the path, fall back to **`git diff --cc`** then **`git diff :2 -- path`** so the diff panel often shows merge context.  
- Validate “Continue” enabled only when safe.

### 4) Visual Conflict Resolver (3-way) — largest UI piece

- New component suite under `apps/desktop/src/renderer/src/pages/gitVcsConflict/` (name flexible).  
- **Partial:** combined / ours-vs-worktree diffs are surfaced via existing `gitVcsDiff` + `GitVcsDiffPanel` (raw `@@@` hunks fall back to `<pre>`). Full side-by-side hunk UI still needs dedicated IPC if we want `:1/:2/:3` blobs without relying on porcelain/combined diff.

### 5) Cloud PR Bridge (API)

- GitHub: create PR REST (`POST /repos/{owner}/{repo}/pulls`).  
- GitLab: create MR REST (`POST /projects/:id/merge_requests`).  
- Requires robust **remote → owner/repo / project id** parsing (reuse `parse_github_gitlab_remote` / self-hosted extensions from `cloud_auth.rs` where possible).

### 6) Integration bar polish

- **FF-only default on:** shipped. **Still to do:** keyboard focus + a11y review on the ref picker and action row.

---

## Open backlog (not shipped yet)

These are the **largest remaining Smart-Flow / Git VCS** items called out in product planning; everything else in this doc is either shipped as v0 or tracked in smaller bullets above.

| Backlog item | What “done” looks like |
| --- | --- |
| **Branch rename + create PR/MR wizard** | When direct push is impossible (e.g. protected default branch): suggest a safe branch name, `git checkout -b` / push there, then a wizard calling Cloud Git APIs to open a PR/MR with prefilled title/body and target branch (`Phase Four`). |
| **True 3-way conflict UI** | Dedicated resolver (ours / theirs / result + per-hunk actions), optional new IPC for stage blobs; today: conflict rows + merge-aware diff + editor (`Phase Three`). |

**Also shipped from the same planning thread:** **Copy raw error** on `/git-vcs` copies the full `opErrorRaw` string (including `[GIT_VCS_*]` prefix) for logs, issues, and support.

---

## Explicit non-goals (until re-scoped)

- Replacing **all** Git CLI usage with libgit2 (not required for blueprint).  
- Server-side merge resolution (always local-first).  
- Notifications inbox / mentions (separate Cloud Git roadmap; see `docs/ROUTE_STATUS.md`).

---

## Agent checklist before claiming a phase “done”

- [ ] `pnpm typecheck` / `pnpm smoke` (or the narrowest relevant gate from `CLAUDE.md`).  
- [ ] Renderer humanized errors for any new `[GIT_VCS_*]` / `[CLOUD_*]` codes.  
- [ ] `docs/ROUTE_STATUS.md` updated if `/git-vcs` or `/cloud-git` behavior materially changes.  
- [ ] No new long-running network calls without cancelation on unmount / remote change.

---

## Maintainer note

This blueprint is **intentionally larger than a single PR**. Keep changes **contract-first** (`packages/shared`), **IPC-second** (Tauri), **UI-third** (React), and prefer **feature flags** if a phase risks destabilizing daily dogfooding.
