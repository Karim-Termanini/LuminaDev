# Git VCS — Interactive Version Control Design

**Phase 12, Subsystem 2 of 4**
**Date:** 2026-05-02
**Status:** Approved — ready for implementation planning

---

## Scope

Visual git workflow for local repositories: status, stage/unstage, diff viewer, commit, push/pull, branch list/create/checkout. No merge conflict resolution UI.

Out of scope: merge conflicts, rebase, stash, tag management, blame view.

---

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Route | `/git-vcs` — dedicated page | Workflow ops (daily) must not live in settings (one-time); needs full canvas |
| Repo picker | Recent repos dropdown + active profile ⚡ highlighted + "Open folder…" | Combines speed (recents) with context-awareness (profile) |
| Scope | Status + stage/unstage + diff viewer + commit + push/pull + branches (create/checkout) | Full vertical slice; diff is safety tool; branches needed to avoid VS Code dependency |
| Layout | Left panel (file list) + right panel (diff) + top bar (repo/branch/push/pull) + bottom bar (commit) | Side-panel = industry standard; widescreen-optimal |
| Backend | Shell out to `git` CLI | Consistent with codebase; Flatpak-safe; zero new dependencies |
| Auth | Auto-detect: SSH remotes use existing keys; HTTPS remotes inject via `GIT_ASKPASS` helper | Covers all developers; secure credential passing |

---

## Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  REPO BAR  [ ⚡ lumina-dev ▾ ]   [ main ▾ ]  Pull  Push  │
├──────────────────────┬──────────────────────────────────┤
│  FILE LIST           │  DIFF PANEL                      │
│  ─ Staged (3)  [−all]│  src/auth.ts                     │
│    M auth.ts         │  @@ -12,7 +12,9 @@               │
│    A bridge.ts       │  - old line (red)                 │
│  ─ Unstaged (2)[+all]│  + new line (green)               │
│    M config.ts       │  (resizable divider)              │
│    ? App.tsx         │                                   │
├──────────────────────┴──────────────────────────────────┤
│  COMMIT BAR  [ feat: add auth layer _____________ ] Commit│
└─────────────────────────────────────────────────────────┘
```

**Empty state:** when no repo is open — glassmorphic hero with large "Pick a Repository to Start" CTA button.

---

## File Status Badges

| Badge | Color | Meaning |
|---|---|---|
| `M` | Yellow | Modified |
| `A` | Green | Added / new file |
| `D` | Red | Deleted |
| `R` | Blue | Renamed |
| `?` | Purple | Untracked |
| `C` | Orange | Conflict (UU state) — staging disabled |

---

## IPC Channels

All channels follow `{ ok: boolean; error?: string }` shape. All shell out to system `git`.

### New channels in `packages/shared/src/ipc.ts`

| Channel | Request | Response |
|---|---|---|
| `dh:git:vcs:status` | `{ repoPath }` | `{ ok, branch, ahead, behind, staged: FileEntry[], unstaged: FileEntry[] }` |
| `dh:git:vcs:diff` | `{ repoPath, filePath, staged: boolean }` | `{ ok, diff: string \| null, binary: boolean }` — raw unified diff, max 512 KB |
| `dh:git:vcs:stage` | `{ repoPath, filePaths: string[] }` | `{ ok }` |
| `dh:git:vcs:unstage` | `{ repoPath, filePaths: string[] }` | `{ ok }` |
| `dh:git:vcs:commit` | `{ repoPath, message }` | `{ ok, sha }` |
| `dh:git:vcs:push` | `{ repoPath, remote?: string, branch?: string }` | `{ ok, jobId }` — streaming via job runner |
| `dh:git:vcs:pull` | `{ repoPath }` | `{ ok, jobId }` — streaming via job runner |
| `dh:git:vcs:branches` | `{ repoPath }` | `{ ok, branches: BranchEntry[], current }` |
| `dh:git:vcs:checkout` | `{ repoPath, branch, create?: boolean }` | `{ ok }` |

### `FileEntry` shape

```typescript
{ path: string; status: 'M' | 'A' | 'D' | 'R' | '?' | 'C'; oldPath?: string }
```

### `BranchEntry` shape

```typescript
{ name: string; remote: boolean; current: boolean }
```

---

## Rust Backend (`lib.rs` dispatch arms)

### `dh:git:vcs:status`

```bash
git -C <repoPath> status --porcelain=v1 -u
git -C <repoPath> rev-parse --abbrev-ref HEAD
git -C <repoPath> rev-list --count @{u}..HEAD   # ahead (0 if no upstream)
git -C <repoPath> rev-list --count HEAD..@{u}   # behind (0 if no upstream)
```

If either `rev-list` command fails (no upstream tracking branch), return `ahead: null, behind: null`. Renderer shows no ahead/behind indicator when null.

Parse porcelain output: first char = staged status, second = unstaged status.

### `dh:git:vcs:diff`

```bash
# unstaged: git diff -- <file>
# staged:   git diff --cached -- <file>
# untracked: git diff --no-index /dev/null <file>
```

- Detect binary: output contains `"Binary files"` → return `{ ok: true, diff: null, binary: true }`
- Size cap: if raw diff > 512 KB → return `{ ok: false, error: "[GIT_VCS_DIFF_TOO_LARGE] ..." }`

### `dh:git:vcs:stage` / `dh:git:vcs:unstage`

```bash
git -C <repoPath> add -- <files...>
git -C <repoPath> restore --staged -- <files...>
```

### `dh:git:vcs:commit`

```bash
git -C <repoPath> commit -m "<message>"
```

Parse SHA from output line matching `^\[.* ([0-9a-f]+)\]`.

### `dh:git:vcs:push` / `dh:git:vcs:pull`

Spawns a streaming job (existing job runner). Before spawning, checks remote URL:

- `git@` prefix → run as-is (SSH keys handle auth)
- `https://` prefix → inject `GIT_ASKPASS`:
  1. Look up token from `EncryptedFileStore` by matching URL host (`github.com` → GitHub token, `gitlab.com` → GitLab token)
  2. Write temp script to `{app_data}/git-askpass-{uuid}.sh` with `chmod 700`:
     ```sh
     #!/bin/sh
     echo "<token>"
     ```
  3. Set env: `GIT_ASKPASS={script_path}`, `GIT_TERMINAL_PROMPT=0`
  4. Delete script in `finally` block after command completes

### `dh:git:vcs:branches`

```bash
git -C <repoPath> branch -a --format="%(refname:short) %(HEAD)"
```

Separate local from `remotes/` prefixed entries.

### `dh:git:vcs:checkout`

```bash
# existing branch:  git -C <repoPath> checkout <branch>
# create + checkout: git -C <repoPath> checkout -b <branch>
```

---

## Frontend Components

### New files

| File | Purpose |
|---|---|
| `pages/GitVcsPage.tsx` | Root — layout shell, state owner, auto-refresh (3s poll) |
| `pages/gitVcsRepoPicker.tsx` | Repo dropdown (⚡ active profile first, recents, "Open folder…") |
| `pages/gitVcsBranchPicker.tsx` | Branch dropdown — list, create input, checkout |
| `pages/gitVcsFileList.tsx` | Staged/unstaged sections with badges, stage/unstage all buttons |
| `pages/gitVcsDiffPanel.tsx` | Diff renderer: hunk display, binary banner, too-large banner |
| `pages/gitVcsCommitBar.tsx` | Commit message input + Commit button |
| `pages/gitVcsError.ts` | `humanizeGitVcsError()` |
| `pages/gitVcsContract.ts` | `assertGitVcsOk()` |
| `pages/gitVcsContract.test.ts` | Response shape tests |
| `pages/gitVcsError.test.ts` | Error humanizer tests |

### State (in `GitVcsPage`)

```typescript
repoPath: string | null
branch: string
ahead: number
behind: number
staged: FileEntry[]
unstaged: FileEntry[]
selectedFile: { path: string; staged: boolean } | null
diff: string | null
diffBinary: boolean
pushPullJobId: string | null
error: string | null
authError: boolean   // true when error code is GIT_VCS_AUTH_FAILED
```

All child components receive props and fire callbacks. No context.

**Resizable divider:** drag-handle `div` between file list and diff panel; mouse event handlers update `leftPanelWidth` in local `useState` (default 35%, min 20%, max 70%).

### Diff rendering

Raw unified diff parsed in renderer into hunks:

```typescript
type DiffHunk = {
  header: string                              // "@@ -12,7 +12,9 @@"
  lines: Array<{ type: '+' | '-' | ' '; content: string; oldNum?: number; newNum?: number }>
}
```

Lines rendered in monospace, `+` green, `-` red, ` ` neutral. Line numbers on both sides. No syntax highlighting in v1.

**Special states in `gitVcsDiffPanel.tsx`:**
- Binary file → styled banner: "Binary file — changes cannot be displayed"
- Too large → banner: "This file is too large to preview here — open it in your code editor"
- No file selected → neutral empty state: "Select a file to view changes"

### Auth error handling in `GitVcsPage`

When push/pull job fails with `[GIT_VCS_AUTH_FAILED]`:
- Set `authError: true`
- Render inline error banner with **"Connect account →"** `NavLink` to `/cloud-git`
- Not just plain text — actionable link

### Push/Pull job output

Push/pull returns `jobId` → page polls `jobsList` (existing IPC) → streams output lines into a log panel that slides up from the commit bar area. Same pattern as runtime install jobs. Dismissible.

---

## Error Codes

| Code | Human message |
|---|---|
| `[GIT_VCS_NOT_A_REPO]` | "This folder is not a Git repository." |
| `[GIT_VCS_NO_STAGED]` | "Stage at least one file before committing." |
| `[GIT_VCS_EMPTY_MESSAGE]` | "Commit message cannot be empty." |
| `[GIT_VCS_PUSH_REJECTED]` | "Remote rejected push. Pull the latest changes first, then push again." |
| `[GIT_VCS_AUTH_FAILED]` | "No credentials for this remote." + "Connect account →" link to `/cloud-git` |
| `[GIT_VCS_DIFF_TOO_LARGE]` | "This file is too large to preview here — open it in your code editor." |
| `[GIT_VCS_NETWORK]` | "Network error during push/pull. Check your connection and try again." |

---

## Testing

### Renderer (Vitest)

- `gitVcsContract.test.ts` — response shape assertions for all 9 channels
- `gitVcsError.test.ts` — `humanizeGitVcsError()` covers all 7 codes

### Rust (unit)

- Askpass script write / `chmod 700` / cleanup round-trip
- Diff size cap: raw string > 512 KB returns `[GIT_VCS_DIFF_TOO_LARGE]`
- Remote URL scheme detection: `git@` → SSH, `https://` → HTTPS with askpass injection
- Porcelain status parsing: staged vs unstaged, all badge types including `?` and `C`
- Binary file detection from diff output

No mocking of live git repos in unit tests — integration tests only when real repo available.

---

## Nav + Route Status

- AppShell nav: `{ to: '/git-vcs', label: 'Git VCS', icon: 'source-control', status: 'partial' }`
- `docs/ROUTE_STATUS.md`: new row — `partial` — "Status, stage/unstage, diff viewer, commit, push/pull (HTTPS + SSH), branches (list/create/checkout)"
- Dashboard widget pointer: planned for subsystem 4 (repo widgets)
