# Git Assistant — Product & Implementation Plan

## For the LuminaDev Team

---

## Executive Summary

**Product Thesis:** Lumina Git = "Set up once, open your project, save your work, send it online — and get plain-language help when Git says no."

**The Shift:** Rename mentally from "Developer Git" to "Git Assistant" (or "Save & Share"). This is not a Git client. This is a helper that lives inside a development environment.

---

## Part 1: Language Reframe (The Beginner Frame)

Every UI string changes. No technical jargon as primary text.

| Today           | New Beginner Frame             |
| --------------- | ------------------------------ |
| Stage / Unstage | Include in save                |
| Commit          | Save snapshot                  |
| Pull            | Get latest                     |
| Push            | Send to GitHub*                |
| Merge conflict  | Same file edited in two places |
| Git Config      | Your Git identity (setup once) |
| Cloud tab       | Connect GitHub                 |
| Remote          | Your online copy               |

*If GitLab support exists: "Send to remote"

**Rule:** Backend can keep `gitVcsStage` and `gitCommit`. The UI never says "stage" or "commit" to a beginner on first contact.

---

## Design standard (MS Dev Home)

All Git Assistant UI uses the shared Lumina design system:

- `hp-card`, `hp-btn`, `hp-input`, `hp-status-alert`, `hp-page-stack` (`theme/global.css`)
- Page shell: `GitAssistantPage.css` — ambient gradients, elevated cards, gradient page title (same family as Monitor / Maintenance)
- Section wrapper: `GitAssistantSection` — card header + codicon per block
- Progress rail: pill steps with accent ring (status only, not forced order)
- Next-action hero: left accent border + codicon lead icon

---

## Part 2: One Page, One Lane (Vertical Journey)

**Eliminate the three-tab model entirely.** Replace with a single vertical scroll page with a sticky "what now" card at the top.

### Page Structure (top to bottom)

```
┌─────────────────────────────────────────────────────────────┐
│  ● Setup   ○ Project   ○ Save   ○ Share                    │  ← progress rail
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NEXT: Connect GitHub so you can send your work online.    │
│                                         [ Connect ]         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your project: ~/LuminaProjects/awesome-app                │
│  Branch: main                                              │
│                                                             │
│  Changed files (3)                                         │
│  ☑ README.md                                               │
│  ☑ src/app.py                                              │
│  ☐ tests/test_app.py                                       │
│                                                             │
│  What did you change?                                      │
│  [____________________________________]                    │
│                                                             │
│  [ Save snapshot ]                                         │
│                                                             │
│  ── (only appears when saved & ahead of remote) ──        │
│                                                             │
│  [ Get latest ]    [ Send to GitHub ]                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Progress Rail Rules

The rail must **reflect the user's actual status**, not decorative steps. It is **not** a forced workflow order (pull is allowed before save). Subtitle: *“Status indicators — not a required order.”* Each step: complete (●), incomplete (○), or active (current focus). Steps are **clickable** for navigation.

| Step    | When active                          | When complete                                                                 | Incomplete (guide user) |
| ------- | ------------------------------------ | ----------------------------------------------------------------------------- | ----------------------- |
| Setup   | First time user, or any checklist ⚠ | All four checklist items ✓ (name/email, credential helper, GitHub, default branch) | Any setup item failing |
| Project | No folder selected                   | Folder selected, repo valid                                                   | No repo open |
| Save    | Uncommitted changes exist            | Working tree clean (saved or no local changes)                                | Dirty files |
| Share   | User should sync online but is blocked | **GitHub connected** (push auth ready) **and** nothing left to push           | **GitHub not connected → Share stays incomplete** even if local tree is clean; unpushed commits → incomplete |

**Share + GitHub:** Connecting GitHub is encouraged in Setup, but until push auth works, **Share is incomplete**. That steers users who skipped Connect toward the Share step and the sticky Next card (“Connect GitHub so you can send your work online”).

**Implementation:** `computeGitProgressRail()` (or equivalent) from the same status payload as `computeGitVcsNextAction`; add renderer tests for GitHub-disconnected → Share incomplete.

Example rail when GitHub is not connected but project is open:

```text
● Setup   ● Project   ● Save   ○ Share
```

---

## Part 3: One Primary Button Rule

**`computeGitVcsNextAction` already exists in the codebase.** Make it the WHOLE UI, not a hint under twelve other controls.

### Next Action Decision Matrix

Priority order (first match wins). **GitHub never blocks local commit.**

| Priority | State | Primary (dual label) | Always-visible secondary |
| --- | --- | --- | --- |
| 1 | No folder open | Open project | — |
| 2 | Merge conflicts | Open in editor | — |
| 3 | Merge/rebase in progress (no conflicts) | git merge --continue | Abort |
| 4 | Behind remote | git pull | git commit when also dirty |
| 5 | Uncommitted changes | git commit / commit message | git pull when behind |
| 6 | Ahead + clean + GitHub connected | git push | git pull |
| 7 | Ahead + clean + GitHub **not** connected | Connect GitHub | — (local commits already saved) |
| 8 | Clean + offline | — (all good) | Optional Connect GitHub link in Share section only |

**Local-only rule:** Idle users without GitHub see “All good”, not Connect GitHub. Connect appears only when `ahead > 0` and push is the logical next step.

**Non-linear Git:** Progress rail is **status**, not sequence. `git pull` is available whenever `behind > 0`, including before commit.

### Dual labels (beginner + pro)

| Control | Primary (visible) | Sub-label (muted) |
| --- | --- | --- |
| Stage checkbox column | stage | include in save |
| Commit button | git commit | Save snapshot |
| Pull | git pull | Get latest |
| Push | git push | Send to GitHub |

### Branch management

Minimal **branch** bar on the project section: switch local branches + create branch (`git checkout -b`). Dirty switch → modal (save first; stash via terminal per honest ceiling).

### Editor open + conflict refresh

- Resolve editor via `dh:editor:list` + `dh:preferred_editor_cmd` store (same as dashboard), fallback `code`.
- On window `focus` / `visibilitychange`, re-run `gitVcsStatus` so conflict state clears after external edits.

### Rust IPC (no `#[deprecated]`)

Keep unused handlers for tests; document in `git_vcs_ipc.rs` module comment and `@deprecated` JSDoc on `IPC` consts only — avoids `deny(warnings)` CI risk. Delete channels in a later zero-reference pass.

---

## Part 4: What to Keep, Shrink, Cut

### Keep (Beginner-Critical)

- Identity (name + email) — stored once
- Git Doctor — but only as "Fix issues" on failed checklist items
- Open folder / recents list
- Clone with folder picker (not raw path input)
- Changed files list with checkboxes
- Short diff preview ("what changed in this file?")
- Save snapshot + Get latest + Send to GitHub
- Humanized errors + state banners ("Someone else updated the project first")
- Simple GitHub connect (token or OAuth) for HTTPS push

### Shrink to "Help Me" Modals (Not Default UI)

- **Dirty checkout** → Modal: "You have unsaved changes. Save first, or stash temporarily." Two buttons: Save, or Stash & Switch.
- **Behind remote** → Modal: "Get latest before sending." ONE button: Get latest. No merge vs rebase choice.
- **Conflicts** → Modal: "This needs a code editor. We'll open the files for you." Open VS Code/Cursor at conflict paths.

**Rule:** Lumina does NOT pretend to be a merge IDE for beginners. Honest ceiling.

### Cut from Lumina Git entirely (Rust IPC kept, `#[deprecated]` — see Part 9)

- Legacy three-tab hub (`GitVcsPage`, Config inspector, Cloud activity tab)
- Config Inspector raw key table
- Preset matrix (one preset only, not five)
- Provider rail with multiple remotes
- Pipelines / CI on this page
- Protected-branch bypass wizard
- Copy raw IPC error (move to Settings → Developer if anywhere)
- Stash list / pop UI
- Rebase UI
- Cherry-pick UI
- Bisect UI

### Required escape hatch (only path for “advanced” Git)

Permanent footer (canonical copy):

```text
Need more than save, send, and sync? Use VS Code, Cursor, your terminal, or GitHub directly for advanced Git operations.
```

No advanced page, no beta flag, no pro toggle inside Lumina.

---

## Part 5: Setup as Checklist (Not Settings Dashboard)

Replace the Config overview (health scores, four dimensions, inspector) with a **4-item checklist**.

### The Checklist

| Item                                       | Status indicator | Fix action                                |
| ------------------------------------------ | ---------------- | ----------------------------------------- |
| Your name and email set                    | ✓ / ⚠            | [Set name & email] → opens simple form    |
| Safe password storage (credential helper)  | ✓ / ⚠            | [Configure credential helper] → one-click |
| GitHub connected (optional but encouraged) | ✓ / ⚠            | [Connect GitHub] → OAuth or token         |
| Default branch = main                      | ✓ / ⚠            | [Set main as default] → one-click         |

### Git Doctor Becomes

- Hidden until user clicks "Fix issues" on a failed checklist item
- OR appears inline: "⚠ Name missing — [Fix now]"
- No standalone Git Doctor dashboard page

**Green checkmarks, not a health dashboard.** Extra Git keys live in Settings only if still needed for identity — not a Git dashboard.

---

## Part 6: Clone & Open (Match Rest of Lumina)

Beginners do not think in "target directory paths."

### Clone Flow

1. User clicks "Clone repository"
2. Prompt: "Repository URL" (paste from GitHub)
3. "Choose folder" (same folder picker as Project Create)
4. Click "Clone"
5. Progress indicator shows
6. Complete → "Project ready — you can start editing"

### Open Flow

1. User clicks "Open project"
2. Folder picker dialog (not raw path input)
3. Recents chips shown above picker
4. After selection → repo loads, page updates

### After Clone/Open

- Auto-select repo in state
- Show "Project ready — you can start editing" toast
- Focus on changed files area

---

## Part 7: Conflict & "Someone Else Changed It" Philosophy

**Core principle:** Beginners do not understand rebase. Lumina is traffic control, not conflict studio.

### Rules Table

| Situation                                            | Beginner UX                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| Behind remote (user clicks Send)                     | Block send. Show: "Someone else updated the project first. Get latest before sending." Button: [Get latest] |
| Behind remote (user clicks Get latest)               | Default: merge (not rebase) — matches Beginner Safe preset. No option presented. |
| Conflict after pull                                  | Stop. Show: "Two people edited the same file in different ways. This needs a code editor." Button: [Open in Editor] + link to 3-step doc |
| Merge in progress (user returns)                     | Show one card: "Finish merging in your editor, then come back and tap Continue." Buttons: [Continue] [Abort merge] |
| User tries to switch branch with uncommitted changes | Modal: "You have unsaved changes. Save first, or stash temporarily." |

### What We Don't Do

- No in-app conflict resolution editor
- No "Accept Current / Accept Incoming / Accept Both" buttons
- No visual diff merge tool
- No rebase UI

**Honest ceiling saves hundreds of hours of maintenance.**

---

## Part 8: Cloud Tab → One Card

Fold "Cloud" into **Setup step 3** entirely.

### Cloud Card (appears when GitHub not connected)

```
┌─────────────────────────────────────────┐
│  Connect GitHub                         │
│                                         │
│  Send your work online and collaborate │
│  with your team.                        │
│                                         │
│  [Connect GitHub]  (opens OAuth/token) │
└─────────────────────────────────────────┘
```

### After Connected

```
┌─────────────────────────────────────────┐
│  GitHub: yourusername ✓                 │
│                                         │
│  Your recent repositories:              │
│  • awesome-app                          │
│  • learning-python                      │
│  • team-project                         │
│                                         │
│  [Open in GitHub →]                     │
└─────────────────────────────────────────┘
```

### What We Don't Do

- No PR/MR wizard inside Lumina
- No activity feed of team commits
- No CI/CD pipeline display
- No issues list
- No releases list

After push, open GitHub in browser for PR creation. One line of code.

---

## Part 9: Implementation Strategy (Pragmatic)

**Do NOT rewrite Rust backend.** Renderer-only refactor.

### Rust IPC — keep, document, do not `#[deprecated]` in Rust

Channels the new UI no longer calls **stay in Rust and `packages/shared`** for contract tests. Mark with **JSDoc `@deprecated` on `IPC` consts** and module comment in `git_vcs_ipc.rs` — not `#[deprecated]` on functions (avoids warning-as-error CI). Delete only after a zero-reference audit.

### New File Structure

```
src/pages/git/
├── GitAssistantPage.tsx          ← sole /git route
│   ├── GitSetupChecklist.tsx     (from GitConfigPage, subset)
│   ├── GitProjectBar.tsx         (repo picker + clone + open)
│   ├── GitNextStepCard.tsx       (from FlowHints + nextAction)
│   ├── GitChangesPanel.tsx       (simplified file list with checkboxes)
│   └── GitSaveShareBar.tsx       (commit + pull + push only)
```

**Delete (G1):** tabbed `DeveloperGitPage` shell, `GitVcsPage`, integrate bar, conflict resolver, CI panel, cloud tab components, `?tab=config|vcs|cloud` routing. No `GitAdvancedPage`. No Git mode flags in store.

### Reuse Existing Backend

| Backend               | Used by Beginner UI                |
| --------------------- | ---------------------------------- |
| `gitVcsNextAction`    | Primary button logic               |
| `GitVcsFileList`      | Changed files display              |
| `humanizeGitVcsError` | Error banners                      |
| Git Doctor IPC        | Fix actions on checklist           |
| Cloud auth            | GitHub connection                  |
| `gitVcsStage`         | Include in save (checkbox → stage) |
| `gitVcsCommit`        | Save snapshot                      |
| `gitVcsPull`          | Get latest                         |
| `gitVcsPush`          | Send to GitHub                     |

### Rollout

1. Ship `GitAssistantPage` as the only `/git` experience
2. Delete legacy tabbed Git UI in the same PR series (no parallel “pro” surface)
3. Update `ROUTE_STATUS.md` — `/git` = Git Assistant only
4. Bookmarks to `/git?tab=*` redirect to `/git` or 404 per router policy

---

## Part 10: What You Gain

| Metric         | Improvement                                                  |
| -------------- | ------------------------------------------------------------ |
| Cognitive load | ~70% less visible surface                                    |
| UI code        | ~60% fewer lines                                             |
| Bug surface    | ~80% fewer Git-related edge cases                            |
| Maintenance    | One UX path to test and document                             |
| Positioning    | Lumina = "Linux dev environment + Docker + runtimes" — Git is enabling glue, not a second product |
| Honest scope   | Beginners get hand-holding; pros are told to use their toolchain — no half-built GitKraken |

---

## Part 11: Risks to Accept

| Risk                                        | Mitigation                                                   |
| ------------------------------------------- | ------------------------------------------------------------ |
| Intermediate users lose in-app merge/rebase | Document external-tool path clearly in one place. Footer link. |
| Some users expect full Git client           | Product thesis is beginner-first. This is a deliberate trade-off. |
| Power users want merge/rebase/PR in-app     | Footer + docs: editor, terminal, or GitHub. No Lumina advanced Git. |

**Decision:** Acceptable if product thesis is beginner-first. Document once, clearly.

---

## Part 12: Success Criteria

### Phase 1 (Ship)

- [ ] Beginner page loads without errors
- [ ] Setup checklist shows 4 items
- [ ] User can open/clone a repository
- [ ] User can save snapshot (commit)
- [ ] User can get latest (pull)
- [ ] User can send to GitHub (push)
- [ ] Next action card always shows correct primary button
- [ ] Humanized error messages appear on failures
- [ ] Conflicts open in external editor
- [ ] Legacy tabbed Git UI removed; no pro toggle or second route
- [ ] Progress rail matches status (Share incomplete when GitHub not connected)
- [ ] Footer uses canonical copy above
- [ ] Pro-only IPC documented in shared; channels retained (no Rust `#[deprecated]`)

### Phase 2 (Validate)

- [ ] 5 beginner users complete full flow without asking for help
- [ ] No support tickets about "how do I stage" or "what is rebase"
- [ ] Average time from open to first push < 2 minutes
- [ ] Zero crashes on clone/pull/push flows

### Phase 3 (Iterate)

- [ ] Add diff preview toggle
- [ ] Add recents list
- [ ] Add "Open in GitHub" after push

---

## Summary for the Team

| What We're Building          | What We're NOT Building |
| ---------------------------- | ----------------------- |
| Git Assistant (Save & Share) | Git client              |
| One page, one lane           | Three tabs              |
| One primary button           | Twelve controls         |
| Setup checklist              | Health dashboard        |
| Open in editor for conflicts | Merge conflict resolver |
| Open on GitHub for PR        | PR wizard               |
| Honest external tool path    | Advanced page / pro toggle / second Git UI |

**The new user journey:**
1. Open Lumina → Git page
2. Setup: name, email, credential helper, GitHub (optional)
3. Open or clone project
4. Make changes → check files you want to save
5. Write what you changed → Save snapshot
6. Send to GitHub
7. Open GitHub to create PR

**No staging. No rebase. No merge conflicts inside Lumina. No confusion.**

---

## One Line for the Team

> "Set up once, open your project, save your work, send it online — and get plain-language help when Git says no. Everything else is someone else's job."

---

**Status:** Ready for implementation. Tracked in `docs/MASTER_PLAN.md` §6 (G1–G3).
**Owner:** TBD
**Target completion:** 2 weeks for Phase 1 (G1)
**Git modes:** One only — no feature flags



########################

### Tier 1 — Daily-driver gaps (do these first)

What blocks *you* using LuminaDev as the main workstation tool:

| Gap                                  | Why it matters for one user                                  |
| :----------------------------------- | :----------------------------------------------------------- |
| Settings hosts + profile env editing | You hit real `/etc/hosts` and env files; read-only diagnostics are not enough |
| Runtimes install matrix              | Broken or flaky install on your distro (Fedora/Arch/Ubuntu) blocks real projects |
| Profiles ↔ dashboard alignment       | Wrong active profile / compose state wastes time every session |
| Git VCS density / simple mode        | `/git?tab=vcs` is pro-oriented; you still need a calmer default flow |

Pick one of these and finish it before opening the next. Docs treat them as equal P2; your order should follow what annoys you most in daily use.

### Tier 2 — Opportunistic cleanup

- P4 file splits (`DockerPage`, `GitConfigPage`, `ProfilesPage`) — when you are already editing those files
- P7 theme picker — after core flows work
- Cloud Git inbox / API merge — only if you need them

### Tier 3 — Release (end)

When Tier 1 is good enough for *your* workflow:

1. AppImage build on a clean VM
2. Cross-distro smoke (your distros)
3. Stage 5 sign-off + tag

`docs/AUDIT.md` and `docs/MASTER_PLAN.md` still list AppImage as P0 because they assume a public release gate. For your situation, treat it as P-last.

------

## What to ignore

- Extension tab, dashboard widgets, Flatpak, Resources tab — removed; do not revisit
- Cosmetic theme rollout beyond what you need
- Chasing “all routes live” in `ROUTE_STATUS.md` for marketing accuracy

------

## Practical sequence

Now     →  Close the gap that blocks your daily workflow (hosts / runtimes / profiles / git UX)

Next    →  Next daily-driver gap

Last    →  AppImage + tag when you would ship to yourself on a fresh machine

**Out of scope:** Smart-Flow / in-app merge / PR wizard / `GitAdvancedPage` — use editor, terminal, or GitHub instead.
