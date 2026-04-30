# Page Audit — Live vs Static vs Broken

Go through each section, run the app, verify the check. Mark `[x]` verified, `[!]` broken/needs fix, `[-]` intentionally static.

---

## Dashboard (`/dashboard`)

**DashboardMainPage**
- [ ] Docker container pills update every 4s
- [ ] CPU/RAM/DISK metrics show real numbers
- [ ] Custom profiles load from store (empty = "No custom profiles yet")
- [ ] Compose profile buttons call `composeUp()` — need Docker running
- [!] "planned" profile cards visible but disabled — intentional or remove?
- [-] Update notification card is static ("Check Flathub…") — placeholder until ship

**DashboardKernelsPage**
- [ ] GPU label shows real GPU name or "GPU: unavailable"
- [ ] docker/ssh/nginx service states show active/inactive/unknown
- [ ] Security snapshot loads (firewall/selinux/ssh config)
- [!] `colorFor()` uses loose `==` instead of `===` (line ~142) — minor bug

**DashboardLogsPage**
- [ ] Jobs list polls every 2s — shows running/done/failed jobs
- [ ] Compose logs fetch on button click
- [-] Profile selector options are hardcoded (web-dev etc.) — intentional

**DashboardWidgetsPage**
- [ ] Widget layout loads and renders
- [ ] Reorder/save calls `layoutSet()` IPC

---

## Monitor (`/system`)

- [ ] CPU%, RAM, SWAP, DISK show real numbers (2s refresh)
- [ ] Top processes list loads
- [ ] Listening ports table loads
- [ ] Security snapshot (firewall, SELinux, SSH auth, failed logins, risky ports)
- [ ] GitHub commits feed loads (fetches public GitHub API — may rate-limit)
- [-] `diskReadMbps`, `diskWriteMbps`, `netRxMbps`, `netTxMbps` always 0 — known, needs two-pass `/proc` read
- [!] Potential crash: `security?.riskyOpenPorts.join()` if undefined (~line 154)

**SystemPage** (`/workstation` if routed — check if this is a separate route)
- [ ] Metrics card shows CPU/RAM/DISK
- [ ] Docker containers (6 max)
- [ ] GPU detected
- [!] `setInterval` result not stored in ref → cleanup may leak

---

## Docker (`/docker`) — mostly LIVE

- [ ] Container list (5s refresh)
- [ ] Start/Stop/Restart/Remove work
- [ ] Logs modal loads real logs
- [ ] Images/Volumes/Networks tabs functional
- [ ] Create container form works
- [ ] Cleanup prune preview shows counts
- [!] `installedFeatures` state initialized as all-false, never refreshed → install wizard always thinks Docker missing
- [-] Example images/credentials are dev defaults (postgres/root) — intentional for quick start

---

## SSH (`/ssh`)

- [ ] SSH key generation works
- [ ] Public key + fingerprint display
- [ ] GitHub SSH test shows output
- [ ] SSH terminal session opens and accepts input
- [ ] Remote key setup (requires sshpass installed)
- [ ] SSH bookmarks save/load from store
- [-] Password stored in component state only — intentional (never persisted to disk)

---

## Git Config (`/git-config`)

- [ ] Config entries load from `git config --global --list`
- [ ] Set name/email/branch/editor saves
- [ ] Sensitive key masking toggle
- [!] **Mask logic inverted** (~line 152-159): unmask toggle shows `●●●●` and masked shows plain — needs fix
- [-] Quick-set buttons (main/master, code/vim/nano) are hardcoded — intentional

---

## Registry (`/registry`)

- [ ] Recent git repos list loads
- [ ] Git clone with folder picker works
- [ ] Docker Hub search returns real results
- [ ] Open image on Docker Hub link works
- [!] Git URL field has hardcoded placeholder `octocat/Hello-World` (~line 10) — should be empty
- [!] Docker Hub link for official images may build wrong URL (~line 195)

---

## Profiles (`/profiles`)

- [ ] Profiles load from store (empty on fresh install)
- [ ] Add/delete/export/import profiles
- [ ] JSON export copies to clipboard
- [-] Template list is local — intentional (user-defined content)

---

## Terminal (`/terminal`)

- [ ] Terminal opens, shell prompt appears
- [ ] Input works (type commands, see output)
- [ ] Resize sends correct cols/rows
- [ ] "Open external terminal" button works or shows error
- [!] Potential listener leak if component unmounts mid-session
- [-] No PTY (line-buffered) — interactive apps like vim/htop won't work

---

## Runtimes (`/runtimes`)

- [ ] Runtime status list loads (node/python/go/rust/java installed + version)
- [ ] Available versions fetch (Node/Go/Python from API; others = `["latest"]`)
- [ ] Dependency check shows installed/missing tools
- [ ] Install job starts, shows running state, updates to done/failed
- [ ] Uninstall preview shows package list for distro
- [!] `runtimeUninstallPreview()` called on every checkbox toggle — should debounce
- [-] Versions cached in localStorage — intentional (avoids repeated API calls)
- [-] `removableDeps` always empty — no real dep graph implemented

---

## Maintenance (`/maintenance`)

- [ ] Health score calculates from real metrics
- [ ] Systemd service status snapshot loads
- [ ] Cleanup prune preview shows counts
- [ ] Compose profile launch/logs work
- [ ] Diagnostics bundle creates real file
- [ ] Job list shows running/completed tasks
- [!] Score calculation: `memPct`/`diskPct` derived from `m` before null check (~line 142-144)
- [!] Log check for 'already latest' is case-sensitive after `.toLowerCase()` (~line 165) — redundant bug
- [-] Guardian thresholds (CPU>85, RAM>90 etc.) hardcoded — intentional policy values
- [-] OPS command templates hardcoded — intentional quick-access

---

## Summary of real bugs to fix

| # | Page | Bug | Severity |
|---|------|-----|----------|
| 1 | GitConfigPage | Mask toggle logic inverted | High — UX broken |
| 2 | DockerPage | `installedFeatures` never refreshed | Medium — install wizard always shows wrong state |
| 3 | RegistryPage | Placeholder URL `octocat/Hello-World` in prod | Low — cosmetic |
| 4 | RegistryPage | Docker Hub link broken for official images | Low |
| 5 | MonitorPage | `security?.riskyOpenPorts.join()` potential crash | Medium |
| 6 | MaintenancePage | `memPct`/`diskPct` from potentially null `m` | Medium |
| 7 | RuntimesPage | `uninstallPreview` IPC on every checkbox change | Low — performance |
| 8 | SystemPage | `setInterval` not stored → cleanup leak | Low |
| 9 | DashboardKernelsPage | `==` vs `===` in `colorFor()` | Low |

