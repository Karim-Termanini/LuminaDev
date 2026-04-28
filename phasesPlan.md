
## Principles

1. **Click-first UX** — Every flow has **buttons, wizards, and status chips**; terminal is **optional** (advanced / “show command”).
2. **Two trust levels** — **Inside Flatpak / user home** (no root: `rustup`, `nvm`, user pip) vs **host / system** (needs **PolicyKit / sudo** or documented “run outside Flatpak” path). Make this explicit in UI so users are never surprised.
3. **One IPC + schema layer** — Extend `@linux-dev-home/shared` Zod schemas for every new action; main process does **policy checks**, **timeouts**, and **allowlists** (you already have patterns for host exec / git / docker).
4. **Profiles = data, not only compose** — A profile is a **JSON document**: enabled nav items, dashboard widget layout, compose stacks to start, env presets, optional post-actions. **Custom dashboard** = user-defined profile or “scratch layout.”

---

## Phase 0 — Foundations (do this before big features)

**Status (implemented):** widget registry + `dashboard-layout.json` in Electron `userData`; responsive profile grid + Add widget / Custom profile entry points; demo job runner (`jobStart` / `jobsList` / `jobCancel`) with footer strip; session banner (`FLATPAK_ID` vs native) + link to `docs/DOCKER_FLATPAK.md` on GitHub.

| Item | Why |
|------|-----|
| **Widget registry + layout store** | “Add widget” needs a registry (id, title, min size, IPC deps) and persisted layout (e.g. `electron-store` or JSON in app config dir). |
| **Dashboard grid** | Replace fixed `repeat(3, …)` with a **responsive grid** + **“+ Add widget”** and **“+ Custom profile”** entry points. |
| **Task runner abstraction** | Long jobs (install Rust, `docker pull`) need **progress**, **cancel**, **log tail** in UI—not raw terminal. Reuse one pattern (job id + IPC poll/stream). |
| **Privilege / environment banner** | Small persistent strip: “Flatpak session” vs “Host tools” + link to docs. |

---

## Phase 1 — Dashboard: 3 → 9+ profiles + custom

- **Six additional preset cards** (copy `ProfileCard` pattern): e.g. *Mobile*, *Game dev*, *Infra/K8s*, *Desktop Qt*, *Docs/Writing*, *Empty minimal* — each maps to a **compose profile id** + optional **widget pack**.
- **Custom profile card** → wizard: name → pick base template → choose compose stacks → choose default widgets → save to **profiles store**.
- **“Custom layout”** on dashboard: **edit mode** (drag placeholders first; real drag-drop later) + **Add widget** opens a **picker modal** (list from widget registry).

Deliverable: **9 preset cards** on the grid plus **N user-saved custom cards** (wizard → typed JSON store `custom_profiles`, no SQL). Compose folders use a small **Alpine `sleep infinity` stub** until real stack definitions replace them.

---

## Phase 2 — Docker surface (click-first)

Order by dependency:

1. **Detect / explain** — Docker installed? socket reachable? (reuse errors you already surface.)
2. **Install** — OS-specific **buttons** that trigger **documented** flows (e.g. open distro doc, or host helper script with consent)—**do not** pretend `apt` works inside Flatpak.
3. **Containers** — list / start / stop / restart / remove / logs (modal with follow tail, no terminal required).
4. **Images** — list / pull (with tag picker) / remove / prune unused (with confirm + dry-run summary).
5. **Volumes & networks** — list / inspect / remove (with “in use by” warning when API allows).
6. **Cleanup** — guided “Prune stopped”, “Prune images”, “Prune volumes” with **checkboxes** and **estimated reclaim** where Docker API supports it.

Route: extend **Workstation** or add **/docker** in nav when the section gets large.

---

## Phase 3 — SSH (keys + GitHub check)

- **Generate key** (ed25519 default): path under `~/.ssh`, passphrase optional (use OS keyring later if you want).
- **Copy public key** — button + “Copied” toast.
- **Show fingerprint** — small readonly field.
- **“Test GitHub”** — non-destructive: `ssh -T git@github.com` style check via **controlled** host command or **HTTPS API** ping (document which you implement; both can be “one click”).
- **Flatpak note** — `~/.ssh` must be in **allowed paths**; document `flatpak override` if needed.

---

## Phase 4 — Git configuration UI

- **Set name / email / default branch / default editor** — form + **Validate** + **Apply** (write `git config --global` via allowlisted exec or libgit2 if you prefer).
- **List all** — `git config --global --list` parsed into a **sortable table** with search; **sensitive values** masked optional toggle.

---

## Phase 5 — Monitor overview (heavy read-only)

Back with **aggregated IPC** to avoid 50 round-trips:

- **Host metrics** (extend current metrics): CPU/mem/disk/net summaries.
- **Top N processes** — parse `/proc` or `ps` with **strict caps** (sample interval, max rows); degrade gracefully in sandbox.
- **Per-container stats** — Docker API stats stream (throttled).
- **LAN** — optional simple discovery is **high effort / privacy sensitive**; phase as “later” or “show interfaces + IPs only” first.
- **Service statistics** — start with **systemd user units** or **static snapshot**; full systemd list may need permissions.

Single **“Monitor”** page with **tabs**: Overview | Processes | Docker | Disk | Network.

---

## Phase 6 — Install runtimes (Python, Rust, Go, Node, Java, C/C++, PHP, …)

- **Per stack: “Recommended path”** card — **User install** (rustup, nvm, pipx, go install to `~/go`, etc.) vs **System install** (opens PolicyKit flow or shows **exact** one-line for host terminal—only if unavoidable).
- **Dependencies** — each language page lists **build deps** (e.g. `build-essential`, `openssl-devel`) as **read-only checklist** + “Mark done” for humans (honest UX without silent `sudo`).
- **Progress jobs** — rustup/node install = long-running job with log viewer **collapsible**.

Ship **2–3 languages first** (Node + Rust + Python), then template-copy for the rest.

---

## Phase 7 — Maintenance

Define **what “Guardian layers” means in code** (otherwise it stays marketing):

- **System overview** — aggregate health from metrics + docker + disk.
- **Infrastructure status** — compose profile health + last run times.
- **Maintenance tasks** — user-defined checklist + optional cron hints (copy command only if needed).
- **Active tasks** — surface **running job runner** from Phase 0.

---

## Phase 8 — Settings

- **Hosts editor** — could mean `/etc/hosts` (needs root + strong warnings) or **“SSH hosts / app bookmarks”** (no root). Split into two features to avoid accidental destructive edits.
- **Environment variables** — user session env file vs **profile-scoped env** (safer); show diff preview before apply.

---

## Phase 9 — Profiles (product-level)

- **Profile manager** page: duplicate, export/import JSON, **set active profile**, **on login actions** (optional): start compose stacks, open dashboard layout.
- Link **Dashboard** preset cards to the same **profile store** so you don’t maintain two sources of truth.

---

## Phase 10 — Extensions

- **Extension model v0**: “plugins” = **extra widgets + optional IPC namespaces** loaded from a **signed/allowlisted** folder; no arbitrary binary download at first.
- Later: versioned API, marketplace—only after v0 is stable.

---

## Phase 11 — First-run wizard (beginners)

- **Steps**: Welcome → Environment (Flatpak vs native) → Docker check → Git identity → SSH key (optional) → Pick starter profile → Finish.
- **Skippable** every step; **resume** if closed mid-way.
- Store `onboardingCompleted` flag; entry from **Help** menu too.

---

## Phase 12 — Advanced Source Control Integrations (GitHub & GitLab)

This phase turns the app into a true daily driver for software engineers managing repositories and cloud source control platforms.

- **Authentication**: Secure storage of Personal Access Tokens (PAT) or OAuth for both **GitHub** and **GitLab**.
- **Interactive Version Control**: Visual interface for `Commit`, `Push`, `Pull`, and `Sync` without needing a terminal. Branch management (checkout, create, merge).
- **Cloud Dashboards (API Integration)**: 
  - **Pull Requests / Merge Requests**: View open PRs/MRs, requested reviews, and merge status.
  - **Issues Tracking**: List open issues assigned to the user across repositories.
  - **CI/CD Pipelines**: Real-time status of GitHub Actions and GitLab CI/CD pipelines (Success, Failure, In Progress) for the active local repo.
  - **Releases & Tags**: Overview of the latest releases.
- **Repository Widgets**: A dedicated dashboard widget displaying a summary of all active local repositories (status, uncommitted changes, behind/ahead commits) and another widget for cloud notifications (Mentions, Failed Pipelines).

---

## Navigation (sidebar)

You currently have **5** nav items; you will need more. Plan:

- Group under **collapse sections**: *Develop*, *Operate*, *System*, *Settings*.
- Add routes incrementally: `/docker`, `/ssh`, `/git-config`, `/install`, `/monitor`, `/maintenance`, `/profiles`, `/extensions`, `/wizard` (or modal wizard on first launch).

---

## Risks (short)

| Risk | Mitigation |
|------|------------|
| Flatpak can’t run `sudo` / package managers | Honest UI + host helper or “open in host terminal” as last resort only. |
| Security (host exec) | Keep allowlists, timeouts, user confirmation for destructive ops. |
| Scope explosion | **Vertical slices** per phase; ship Phase 0–1 before Docker expansion. |

---

## Suggested order of execution

1. **Phase 0 + Phase 1** (widgets + dashboard profiles) — visible win, low risk.  
2. **Phase 11** (wizard) — onboarding for beginners.  
3. **Phase 2 Docker** — core power user value.  
4. **Phase 4 Git** + **Phase 3 SSH** — small, clear IPC.  
5. **Phase 6 Install** (2–3 languages first).  
6. **Phase 5 Monitor** (incremental tabs).  
7. **Phase 7–10** (maintenance, settings, profiles productization, extensions).
8. **Phase 12 Cloud Git** (advanced GitHub & GitLab, CI/CD, PRs, UI Sync).
