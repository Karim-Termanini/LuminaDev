# Phase 8 — Settings: Design Spec

**Date:** 2026-05-25
**Approach:** Store-per-tab, no new Rust except one `dh:app:info` handler
**Scope:** All 12 tabs, fully functional UI, store-persisted; backend enforcement deferred

---

## Context

`SettingsPage.tsx` already ships 6 functional tabs (personalization, remote, system, accounts, general, update) and 5 "coming soon" stubs (resources, app-engine, builder, extension, beta). Phase 8 fills in all stubs, adds 6 new tabs, and refactors the monolith into per-tab components.

Phase 9 (Profiles) depends on Phase 8 for profile env var storage. That dependency is satisfied by the existing System tab's profile env editor — no new work required for the unblock.

---

## File Structure

```text
apps/desktop/src/renderer/src/pages/settings/
  SettingsShell.tsx              ← nav rail + tab routing (~120 lines)
  SettingsPersonalization.tsx    ← extracted from current SettingsPage.tsx
  SettingsRemote.tsx             ← extracted
  SettingsSystem.tsx             ← extracted
  SettingsAccounts.tsx           ← extracted
  SettingsGeneral.tsx            ← extracted
  SettingsUpdate.tsx             ← extracted
  SettingsResources.tsx          ← new
  SettingsAppEngine.tsx          ← new
  SettingsBuilder.tsx            ← new
  SettingsExtension.tsx          ← placeholder (Phase 10)
  SettingsBetaFeatures.tsx       ← new (replaces stub)
  SettingsNotification.tsx       ← new
  SettingsShortcuts.tsx          ← new
  SettingsHelpAbout.tsx          ← new
  SettingsDateTime.tsx           ← new
  SettingsLanguages.tsx          ← new

apps/desktop/src/renderer/src/pages/SettingsPage.tsx
  → thin re-export of SettingsShell (keeps /settings route working, no behavior change)
apps/desktop/src/renderer/src/pages/SettingsPage.css
  → unchanged
```

Each tab component is self-contained: owns its state, loads its store key on mount, saves on button press (or immediately for toggles).

---

## Nav Rail

The existing `NAV` array in `SettingsPage.tsx` is moved into `SettingsShell.tsx`. Two new entries added:

| id | Label | Icon | Beta |
|----|-------|------|------|
| `personalization` | Personalization | `color-mode` | |
| `remote` | SSH & remote | `terminal-linux` | |
| `system` | System | `inspect` | |
| `accounts` | Connected accounts | `github` | |
| `general` | General | `settings` | |
| `update` | Update | `arrow-circle-up` | |
| `resources` | Resources | `server-process` | ✓ |
| `app-engine` | App Engine | `server` | ✓ |
| `builder` | Builder | `tools` | ✓ |
| `extension` | Extension | `extensions` | ✓ |
| `beta` | Beta Features | `beaker` | ✓ |
| `notification` | Notification | `bell` | |
| `shortcuts` | Shortcuts | `keyboard` | |
| `help-about` | Help & About | `info` | |
| `datetime` | Date & Time | `clock` | |
| `languages` | Languages | `globe` | |

---

## Store Keys

All reads/writes use existing `dh:store:get` / `dh:store:set` IPC.

### Existing (unchanged)
| Key | Owner tab |
|-----|-----------|
| `appearance` | Personalization |
| `ssh_bookmarks` | Remote |
| `general_settings` | General |
| `update_settings` | Update |
| `projects_home_dir` | General |
| `readiness_wizard_complete` | General (danger zone) |

### New
| Key | Shape | Owner tab |
|-----|-------|-----------|
| `resources_settings` | `{ cpuLimitPercent: number; ramLimitMb: number }` | Resources |
| `app_engine_settings` | `{ ipcTimeoutMs: number; threadPoolSize: number; daemonAutoRestart: boolean }` | App Engine |
| `builder_settings` | `{ cargoPath: string; nodePath: string; pythonPath: string; registryMirror: string }` | Builder |
| `beta_features_state` | `{ [flagKey: string]: boolean }` | Beta Features |
| `notification_settings` | `{ globalMute: boolean; minSeverity: 'info' \| 'warn' \| 'error'; osNotifications: boolean }` | Notification |
| `shortcuts_settings` | `{ [actionKey: string]: string }` | Shortcuts |
| `datetime_settings` | `{ format: '12h' \| '24h'; timezone: string }` | Date & Time |
| `language_settings` | `{ locale: string }` | Languages |

---

## New IPC Handler: `dh:app:info`

One new Rust match arm in `lib.rs` (or a small `app_info.rs` module if preferred):

```rust
"dh:app:info" => {
    Ok(json!({
        "version": env!("CARGO_PKG_VERSION"),
        "buildDate": env!("BUILD_DATE"),      // set in build.rs
        "rustVersion": env!("RUSTC_VERSION"), // set in build.rs
        "platform": std::env::consts::OS,
    }))
}
```

`build.rs` sets `BUILD_DATE` and `RUSTC_VERSION` using only stdlib — no new crates:
- `BUILD_DATE`: format `SystemTime::now()` as `YYYY-MM-DD` via `std::time`
- `RUSTC_VERSION`: run `std::process::Command::new("rustc").arg("--version")` and capture stdout

No new Tauri command — goes through existing `ipc_invoke` dispatcher.

Also add `IPC.APP_INFO = 'dh:app:info'` to `packages/shared/src/ipc.ts`.

---

## Tab Specs

### Resources
- CPU limit: labeled slider 10–100 step 5 + number input (paired, bidirectional)
- RAM allocation: labeled slider 512–16384 step 512 MB + number input
- Defaults: `{ cpuLimitPercent: 80, ramLimitMb: 4096 }`
- Save button → `resources_settings`
- Inline note: "These limits will be enforced by the job runner in a future release."

### App Engine
- IPC timeout: number input (ms), min 1000 max 120000, default 30000
- Thread pool size: number input 1–32, default 4
- Daemon auto-restart: toggle switch, default true
- Save button → `app_engine_settings`
- Inline note: "Daemon behaviors take effect on next app launch."

### Builder
- Cargo path: text input + folder-browse button (`selectFolder`)
- Node path: text input + folder-browse button
- Python path: text input + folder-browse button
- Registry mirror: text input (URL format, no browse)
- Placeholders: `"auto-detect"` for paths, `"https://registry.npmjs.org"` for mirror
- Save button → `builder_settings`

### Extension
- Unchanged "Coming in a future release" placeholder (Phase 10 scope)

### Beta Features
Three hardcoded flags (object keys in `beta_features_state`):
- `enable_experimental_terminal_multiplexer` — "Experimental terminal multiplexer (xterm.js multi-pane)"
- `enable_ai_commit_suggestions` — "AI commit message suggestions (requires API key)"
- `enable_profile_auto_switch` — "Auto-switch profile on project directory change"

Toggle rows auto-save immediately on toggle (no Save button). Read on mount from `beta_features_state`.

### Notification
- Global mute: toggle row — mutes all in-app toasts
- Minimum severity: select — Info / Warnings & above / Errors only
- OS native notifications: toggle — calls `window.__TAURI__.notification` when enabled
- Save button → `notification_settings`

### Shortcuts
Hardcoded action list with default bindings:

| Action key | Label | Default |
|-----------|-------|---------|
| `open_terminal` | Open terminal | `Ctrl+Alt+T` |
| `toggle_sidebar` | Toggle sidebar | `Ctrl+B` |
| `focus_search` | Focus search | `Ctrl+K` |
| `go_dashboard` | Go to Dashboard | `Alt+1` |
| `go_docker` | Go to Docker | `Alt+2` |
| `go_git` | Go to Git | `Alt+3` |

UI: table with action name, current binding chip, and "Record" button per row. Clicking "Record" puts that row into capture mode — next keydown event builds a chord string (`Ctrl+Shift+X` etc.). Escape cancels capture. Save all → `shortcuts_settings`.

### Help & About
Static layout, no save button:
- App name: "LuminaDev"
- Version: from `dh:app:info` response
- Build date: from `dh:app:info` response
- Platform: from `dh:app:info` response
- Rust version: from `dh:app:info` response
- GitHub link (opens via Tauri `openUrl`)
- License: MIT

### Date & Time
- Time format: two-button toggle — "12-hour" / "24-hour"
- Timezone: searchable `<select>` populated from `Intl.supportedValuesOf('timeZone')`
- Default timezone: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Save → `datetime_settings`, side-effect: sets `document.documentElement.dataset.timeformat`

### Languages
- Locale dropdown: en-US (English), fr-FR (Français), de-DE (Deutsch), es-ES (Español), ar-SA (العربية), zh-CN (中文)
- Note shown: "Full translations coming in a future release. Selecting a non-English locale sets the document language attribute."
- Save → `language_settings`, side-effect: sets `document.documentElement.lang`

---

## Error Handling

All tab components follow the existing pattern:
- Load errors shown inline as `hp-status-alert error`
- Save success: inline green message, auto-clears after 3 s
- Save failure: inline red message, persists until next save attempt

No changes to `settingsContract.ts` or `settingsError.ts` — `assertSettingsOk` already covers all store operations.

---

## Testing

- No new contract test files needed (store contract already tested via `assertSettingsOk`)
- `SettingsShell` nav switching: verify each tab renders without crashing (smoke)
- `SettingsShortcuts` chord capture: unit test the key event → chord string builder function
- `SettingsDateTime` timezone population: verify `Intl.supportedValuesOf` produces non-empty list

---

## Out of Scope

- Backend enforcement of Resources/App Engine limits (Phase 10+)
- Real i18n string translation (Phase 10+)
- Actual shortcut interception in the app (Phase 10+)
- Extension enable/disable (Phase 10)
- OS notification delivery (requires Tauri notification plugin setup — deferred)
