LuminaDev — Re-Audit Report (Ground-Truth Verified)
Date: 2026-05-26 | Branch: fix/profile-switch-docker-preflight | Methodology: Every claim cross-checked against source files — no assertion trusted without a grep or line read.

Part 1 — Executive Summary
Both audit files — AUDIT_2026-05.md (English, 37 findings) and audit_report.md (Arabic, 18 priority items) — were written against a snapshot of the code that predates a significant body of work on the current branch. Of the 37 originally catalogued issues, 26 have been verified as fully resolved by reading the actual source. 8 audit claims are factually wrong about the current code — the problems they describe never existed in this branch or were resolved before the audit was written. 12 issues are confirmed open and require honest documentation or implementation. Additionally, 3 new structural anomalies were discovered during this verification pass that appear in neither audit file.

The branch is in substantially better shape than both reports suggest. However, several gaps in the Phantom Settings category remain genuine and are quantified below.

Part 2 — Verified Resolved: 26 Closed Issues
The following items were claimed open in the audit files. Direct code reading confirms each is fixed.

2.1 Architectural & Data Integrity
Audit Claim	Finding	Evidence
removableDeps always [] (AUDIT §2.2, AR §3.2)	Fixed. runtime_preview_removable_deps() runs real package-manager dry-runs	lib.rs:3200, runtime_packages.rs:178-244
dh:perf:snapshot startupMs: 150 hardcoded (AR §3.1)	Fixed. Now app_uptime_ms from START_TIME.get().elapsed()	lib.rs:1025, 1030
lib.rs:1605 layout_set default profile stores wrong shape (CodeRabbit critical)	Fixed. Correct value_to_store logic	lib.rs:1605
dh:store:set open to any key, no allowlist (AR §5.2)	Wrong claim. is_allowed_store_key() guards every write	lib.rs:918-919
Runtime join errors silently dropped (AUDIT §minor)	Already fixed. Err(_) => runtimes.push(json!({...installed: false}))	lib.rs:2867-2868
2.2 Profile Cards & Widgets
Audit Claim	Finding	Evidence
4 profile cards stuck at status: 'planned' (AUDIT §4.1)	Fixed. All 9 profiles are 'live', descriptions updated to match actual compose services	DashboardMainPage.tsx:49-57
custom.placeholder case renders production text (AUDIT §4.2)	Fixed. Case removed; falls through to "Unregistered widget type"	DashboardWidgetDeck.tsx
DashboardWidgetsPage not routed (AUDIT §5.4)	Fixed. Routed at <Route path="widgets" element={<DashboardWidgetsPage />} />	App.tsx:72
2.3 Settings — Phantom Contracts (Partially Resolved)
Audit Claim	Finding	Evidence
app_engine_settings ipcTimeoutMs never read (AUDIT §3.2)	Wrong claim. set_global_ipc_timeout(ms) called at startup from store.json AND on every dh:store:set	lib.rs:4209-4211, 931-933
Shortcuts not wired to any dispatch (AUDIT §3.5)	Wrong claim. AppShell.tsx has a full document.addEventListener('keydown', ...) loop that reads shortcuts_settings, builds a chord, looks up the action route, and calls navigate()	AppShell.tsx:54-93
Notification settings never filter toasts (AUDIT §3.4)	Wrong claim. NotificationProvider.tsx reads notification_settings, checks globalMute, and gates severity via severityOrder[settings.minSeverity]	NotificationProvider.tsx:23-34
dh:app:update:check channel absent (AUDIT §8.4)	Wrong claim. Real handler calling api.github.com/repos/Karim-Termanini/LuminaDev/releases/latest exists	lib.rs:4157-4180
SettingsResources shows no disclaimer	Fixed. "CPU and RAM limits are saved but not yet enforced by the job runner — coming in a future release" displayed inline	SettingsResources.tsx:39
SettingsBetaFeatures shows no disclaimer	Fixed. "These flags are saved but not yet read at runtime — coming in a future release"	SettingsBetaFeatures.tsx:32
i18n infrastructure completely absent (AR §8)	Partially wrong. i18n/I18nContext.tsx + translations.ts (54 lines, en-US + ar-SA partial) added; I18nProvider wraps the app in App.tsx:49, 63	App.tsx:23, 49, 58
2.4 CodeRabbit Minor Findings
All 8 minor CodeRabbit findings have been applied:

Finding	Status	Evidence
val.split(':') split colon bug in DashboardLogsPage.tsx	Fixed. const [type, ...rest] = val.split(':'); const id = rest.join(':')	DashboardLogsPage.tsx:415
j.logTail.length > 0 without null guard	Fixed. j.logTail && j.logTail.length > 0	DashboardLogsPage.tsx:558
Hardcoded #1e1e1e terminal background (light-theme break)	Fixed. var(--bg-terminal, #1e1e1e)	DashboardLogsPage.tsx:463
Loading vs empty state ambiguity in DashboardKernelsPage	Fixed. runtimesLoaded boolean; shows "No runtimes detected." vs "Loading runtime states..."	DashboardKernelsPage.tsx:43, 64, 200
Progress bars render undefined% or >100%	Fixed. Math.min(100, Math.max(0, ... ?? 0)) in both ActiveJobsStrip.tsx and TopBar.tsx	Lines 58, 61, 178
TopBar notifications: missing aria-expanded, role="dialog", Escape key	Fixed. All three added	TopBar.tsx:108, 134, 40-46
DashboardKernelsPage OPEN LINK for all TCP ports	Fixed. HTTP_PORTS Set whitelist gates link rendering	DashboardKernelsPage.tsx:8, 282
Comment "65-95" doesn't match code >= 60	Fixed. Comment now says "60-95"	DashboardMainPage.tsx:135
2.5 Documentation & Repo Hygiene
Audit Claim	Finding	Evidence
README.md still references Electron (AUDIT §6.1)	Fixed. Now says "Electron removed in v0.2.0-alpha"	README.md:86
PR_BODY.md stale artifact in repo root (AUDIT §6.2)	Fixed. File does not exist	ls confirms absent
thoghts.md stale planning file in repo root (AUDIT §6.6)	Fixed. File does not exist	ls confirms absent
ROUTE_STATUS.md /registry listed as live (AUDIT §6.3)	Fixed. Entry says "Route is a redirect to /git?tab=vcs; no dedicated registry page exists."	ROUTE_STATUS.md:22
Flatpak README — no canonical manifest identified (AUDIT §5.3)	Fixed. First line of flatpak/README.md identifies io.github.karimodora.LinuxDevHome.tauri.yml as the current Tauri manifest	flatpak/README.md:1-3
metainfo.xml — version, URL, Electron mention, no screenshots (AUDIT §4.3)	Fixed. Version 0.2.0-alpha, correct GitHub URL, no Electron text, three screenshot entries	metainfo.xml:15, 20-34
ProfilesPage "STUB" label exposed to user (AUDIT §9)	Fixed. Changed to "LITE"	ProfilesPage.tsx:486
GPU fallback hardcoded "Intel Integrated Graphics" (AUDIT §4.4)	Fixed. setGpu(...? g.result : null) — returns null, no fabricated string	DashboardKernelsPage.tsx:56
docker_install_invoke and docker_remap_port_invoke inline in lib.rs (AUDIT §2.1)	Fixed. Both extracted to docker_ext.rs (651 lines); lib.rs delegates	docker_ext.rs:88, 434
Part 3 — Confirmed Open Issues (12 Genuine Gaps)
These items were verified to still be true in the current code. Each is substantiated.

3.1 lib.rs Remains a Monolith — Partially Improved
lib.rs is currently 4,505 lines — down from 5,026 (docker_ext.rs extraction saved ~520 lines) but still 15× over the stated 300-line dispatcher target in CLAUDE.md. The 12-module extraction plan in phasesPlan.md is ~15% done. Remaining inline handlers include: all Docker list/action/logs/images/volumes/networks/prune/pull/search/tags business logic (not delegated to docker_ext.rs), the full profile switch engine (~120 lines), compose up/down/logs (~60 lines), SSH config and management (~80 lines), and all monitor/security probe code (~200 lines). cloud_auth.rs at 2,650 lines is a secondary monolith with the same maintainability characteristics.

Impact: Git merge conflicts for any contributor touching two different features; no unit-testable isolated modules; full Tauri runtime required for any Rust test against these paths.

3.2 perf snapshot — Heap Fields Are Approximations, Type Drift Exists
dh:perf:snapshot at lib.rs:1027-1035 now returns startupMs as real app uptime, but heapUsedMb: rss_mb / 2 ("Best-effort estimate for system-bound binaries") and heapTotalMb: rss_mb are still fabricated from RSS — which is virtual memory resident set, not heap. For a Rust binary, heap and RSS are fundamentally different values; this division is arbitrary.

More critically: packages/shared/src/ipc.ts:174-179 exports PerfSnapshot with startupMs, heapUsedMb, heapTotalMb fields. MaintenancePage.tsx:29 uses a local narrowed type { rssMb: number; uptimeSec: number } that discards those fields. The shared type and the actual response are out of sync — any new consumer importing the canonical shared type will see fields that do not correspond to documented reality.

3.3 SettingsAppEngine — threadPoolSize and daemonAutoRestart Not Wired
ipcTimeoutMs is genuinely wired (verified in §2.3). However threadPoolSize (saved as 1–32) and daemonAutoRestart (toggle) are stored but never read. The Rust tokio runtime uses its default thread pool regardless. daemonAutoRestart has no daemon supervisor to control. The UI message "Daemon behaviors take effect immediately when saved" (SettingsAppEngine.tsx:37) is misleading for these two fields — ipcTimeoutMs does take effect immediately, the others do not.

3.4 update_settings checkOnStartup Not Triggered at Launch
dh:app:update:check exists and calls the real GitHub releases API. The "Check now" button works. However, checkOnStartup in update_settings is never read at startup. The lib.rs .setup() hook (lines 4205-4215) only reads app_engine_settings — it does not check update_settings.checkOnStartup and fire an update check. A user who enables this toggle will never receive an automatic startup check. The "Last checked" field will stay "Never checked" unless they click manually.

3.5 i18n Infrastructure Is Scaffolding Only
I18nProvider wraps the app and translations.ts covers 32 Settings-specific keys in en-US and ar-SA. However:

useTranslation() is used in exactly one component outside the provider itself: SettingsLanguages.tsx
The remaining 100+ components across all pages use hardcoded English strings — no t() call
ar-SA translations are declared but the language picker in SettingsLanguages.tsx still shows French, German, Spanish, Chinese as disabled "coming soon" (only en-US and ar-SA are in the translation table)
The infrastructure exists but the wiring covers <1% of the app surface
The audit_report.md §8 claim of "no i18n infrastructure at all" is now partially incorrect — infrastructure exists. But the claim that all UI text is hardcoded English remains ~99% true in practice.

3.6 resources_settings CPU/RAM Limits Not Enforced (Correctly Labelled)
Cgroups enforcement is absent and remains absent. The disclaimer is present (SettingsResources.tsx:39). This is correctly communicated. The gap itself is not resolved — it is acknowledged. Future work requires a Linux cgroups v2 / systemd scope integration in runtime_jobs.rs.

3.7 beta_features_state Consumed Nowhere
SettingsBetaFeatures.tsx saves feature flags. No code in any .tsx or .ts file outside the settings directory reads beta_features_state to gate visibility or behaviour. The disclaimer exists. The flags are inert. This is the one phantom setting where even partial wiring is zero.

3.8 Version String Hardcoded in Update Check
lib.rs:4167 contains let current_version = "v0.2.0-alpha" — a literal string. Rust crates normally use env!("CARGO_PKG_VERSION") to embed the version at compile time, making it impossible to accidentally ship a comparison against a stale version string. If the version is bumped in Cargo.toml without touching this line, the update check will always return updateAvailable: true against every release.

3.9 SettingsNotification — "Filters applied immediately" Claim Needs Clarification
SettingsNotification.tsx:37 saves with the message "Filters are applied immediately to all new notifications." This is true for new toasts fired after the save, because NotificationProvider re-reads the store. But globalMute: true will not dismiss already-visible toasts in the notification panel. The wording could mislead users into thinking active toasts are retroactively suppressed.

3.10 Flatpak Submission — Phase 14 Still Incomplete
flatpak/README.md correctly identifies the canonical manifest. However, three of five Phase 14 checklist items remain open:

Screenshot images referenced in metainfo.xml (docs/images/screenshot-*.png) do not exist in the repository — the Flathub validator will reject them as broken image URLs
Reproducible offline build not verified
Cross-distro smoke (Fedora Silverblue) not run
3.11 Docker Password Security Surface Unchanged
docker_ext.rs:126 receives body.get("password") — the sudo password travels as a plaintext JSON string through Tauri IPC. While Tauri IPC is process-local (not a network socket), the password is materialized as a Rust String in the handler's memory. The phasesPlan.md Phase 16 note recommends pkexec (Polkit) which eliminates password-in-payload entirely. This observation from AUDIT §7.1 remains valid and unaddressed.

3.12 DashboardLogsPage.tsx line 267 — Remaining logTail Access Risk
DashboardLogsPage.tsx:267: job.logTail.join('\r\n') — no null guard, inside the "unified view" rendering path. The CodeRabbit fix at line 558 added a guard for the job-list render path, but this earlier occurrence in the unified log assembly code at line 267 was not caught. job.logTail can be undefined if the job response schema omits it.

Part 4 — Newly Discovered Issues (Not in Either Audit)
4.1 Shared PerfSnapshot Type Out of Sync With Backend Contract
As described in §3.2: packages/shared/src/ipc.ts exports PerfSnapshot with four fields (startupMs, rssMb, heapUsedMb, heapTotalMb). The Rust handler returns all four. MaintenancePage.tsx defines its own narrowed local type ignoring two. The shared type is the contract definition and should be the source of truth — but startupMs here represents app uptime (not startup duration), and heap values are RSS-derived approximations. Either the type should be updated to document these semantics accurately, or the fields should be removed from the response and type.

4.2 SettingsAppEngine Misleads With "Daemon behaviors take effect immediately"
Covered in §3.3 but worth isolating: the save-success message (SettingsAppEngine.tsx:26) says "Daemon behaviors take effect on next app launch" — but the in-page description says "take effect immediately when saved" (line 37). These two lines contradict each other within the same component. ipcTimeoutMs takes effect immediately (via set_global_ipc_timeout). threadPoolSize and daemonAutoRestart only take effect at next launch (if ever). The two claims cannot both be true simultaneously.

4.3 dh:app:update:check Current Version Hardcoded as String Literal
lib.rs:4167: let current_version = "v0.2.0-alpha"; — this is a maintenance hazard. The canonical version is already in apps/desktop/src-tauri/Cargo.toml. The correct pattern is env!("CARGO_PKG_VERSION") with a v prefix prepended, ensuring the check always compares against the actual built version. As-is, if Cargo.toml is bumped, this comparison silently breaks (always reports an update as available, or never, depending on tag format).

Part 5 — Category-by-Category Verdict on Phantom Settings (Section 3 from audit_report.md)
The user's section specifically asked about five settings sub-categories. Here is the precise, code-verified status of each:

resources_settings (SettingsResources.tsx)
Status: Unimplemented — Correctly Disclosed. Sliders save CPU/RAM values. No Rust code reads these to apply cgroup constraints. The disclaimer is accurate and present. The audit claim is still true for the enforcement gap, but the transparency gap (no disclosure) is closed.

app_engine_settings (SettingsAppEngine.tsx)
Status: Partially Implemented — Partially Misleading.

ipcTimeoutMs: Genuinely wired. Reads from store.json at startup AND updates the global timeout atomically on save. The audit report's claim that this does nothing was incorrect.
threadPoolSize: Not wired. tokio uses system defaults regardless.
daemonAutoRestart: Not wired. No daemon supervisor exists.
The on-screen description contradicts itself (immediate vs. next launch), and no disclaimer distinguishes the wired field from the two unwired ones. A user changing threadPoolSize from 4 to 16 will see no effect.

update_settings (SettingsUpdate.tsx)
Status: Partially Implemented — Missing Startup Trigger.
The handler dh:app:update:check is real and calls api.github.com. The "Check now" button works. However checkOnStartup: true is never acted upon — the lib.rs setup hook does not read this flag. Additionally the current version is a hardcoded string literal (§4.3). The UI accurately describes the feature but silently fails to deliver the automatic part.

notification_settings (SettingsNotification.tsx)
Status: Implemented — Better Than Audit Claims. NotificationProvider.tsx reads notification_settings on mount, applies globalMute and minSeverity to all subsequent toast calls. The audit's claim ("never filtered through this store") is factually wrong for the current branch. OS native notifications remain hardcoded off (Phase 10). That toggle is disabled in the UI and the save call forces osNotifications: false — this is honest handling.

language_settings (SettingsLanguages.tsx) and i18n
Status: Infrastructure scaffolded, coverage minimal. I18nProvider is present, wrapping the entire app in App.tsx. translations.ts covers 32 keys in en-US and ar-SA. SettingsLanguages.tsx uses t() for its own labels. All other 100+ pages use hardcoded English. The framework exists to extend — but 99% of strings remain outside it. The audit claim of "no i18n infrastructure" is now slightly wrong, but the claim that "the app is hardcoded English" is still operationally correct.

Part 6 — Priority Matrix (Current Branch State)
Priority	Item	Action Required
P0 — Functional correctness	DashboardLogsPage.tsx:267 null guard on job.logTail	Fix unguarded .join()
P0 — Data integrity	PerfSnapshot shared type vs actual response drift	Align type with actual fields OR update fields to be meaningful
P0 — Correctness	Update check version "v0.2.0-alpha" literal	Replace with env!("CARGO_PKG_VERSION")
P1 — Honesty	SettingsAppEngine dual "take effect" claims	Clarify which fields are live vs. future-only; add per-field notes
P1 — Feature completeness	checkOnStartup never fires	Read flag at startup; fire dh:app:update:check conditionally
P1 — Flatpak release	Screenshot images referenced in metainfo.xml don't exist	Add placeholder images or use <screenshots> section with text-only captions
P2 — Architecture	lib.rs still 4,505 lines	Continue module extraction (SSH, monitor, compose into dedicated files)
P2 — Security	Docker install password as plaintext in JSON payload	Replace with pkexec / polkit escalation
P2 — i18n completeness	useTranslation only in SettingsLanguages	Wire t() across at least all Settings pages
P3 — Transparency	beta_features_state inert	Add note or hook one flag to a real gate
P3 — Resources	cgroups enforcement absent	Implement or add stronger disclaimer (Phase X)
P3 — Type hygiene	cloud_auth.rs at 2,650 lines	Extract token refresh / OAuth flow into sub-modules
Part 7 — Summary Counts (Verified)
Category	Audit Claimed Open	Verified Fixed	Still Open	Wrong/Stale Claim
Architectural (lib.rs, monolith)	2	1 partial (docker_ext.rs extracted)	1 (still large)	—
Phantom settings contracts	7	3 (ipcTimeoutMs, shortcuts, notifications)	4 (resources, threadPool, checkOnStartup, beta)	3 incorrect claims
Static / fabricated data	5	4 (perf fake fields partially, profiles, GPU, placeholder)	1 (heap fields)	1
Incomplete deliverables	5	4 (widgets route, profiles, metainfo, ROUTE_STATUS)	1 (Flatpak screenshots)	—
Documentation contradictions	6	6 (README, PR_BODY, thoghts, ROUTE_STATUS, flatpak README, metainfo)	0	—
Security observations	3	0	3 (password, sshpass, store-set — though store-set was already gated)	1
Missing features	4	2 (update:check handler, DashboardWidgets)	2 (checkOnStartup auto, i18n coverage)	—
Minor debt	6	6 (all CodeRabbit items applied)	0	—
Total	38	26 confirmed fixed	12 confirmed open	8 false claims
The application has crossed from "significant audit exposure" into "known technical debt with honest disclosure in most visible cases." The remaining P0 items are small in scope but high in user-trust impact; the P1–P3 items are accurately characterised as future-phase work in most places where the UI already shows them.