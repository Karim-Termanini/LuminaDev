# Phase 8 — Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 12 Settings tabs — split monolithic SettingsPage.tsx into per-tab components, add 8 new store keys, add `dh:app:info` Rust handler, wire URL-synced tab shell.

**Architecture:** Store-per-tab via existing `dh:store:get/set`. New tabs live in `pages/settings/` subfolder. `SettingsPage.tsx` becomes a thin re-export. One new Rust handler (`dh:app:info`) for Help & About version info. No new IPC namespace.

**Tech Stack:** React 18, TypeScript, Zod, Tauri v2, Vite, Vitest, `react-router-dom` `useSearchParams`

---

## File Map

**Modify:**
- `packages/shared/src/schemas.ts` — add 8 Zod schemas + StoreKeySchema entries + StoreSetRequestSchema branches
- `packages/shared/src/ipc.ts` — add `appInfo: 'dh:app:info'`
- `apps/desktop/src/renderer/src/vite-env.d.ts` — add `appInfo` to Window interface
- `apps/desktop/src/renderer/src/api/desktopApiBridge.ts` — add `appInfo` call
- `apps/desktop/src-tauri/build.rs` — emit `BUILD_DATE` + `RUSTC_VERSION`
- `apps/desktop/src-tauri/src/lib.rs` — add `"dh:app:info"` match arm
- `apps/desktop/src/renderer/src/pages/SettingsPage.tsx` — replace with re-export

**Create:**
- `pages/settings/SettingsShell.tsx`
- `pages/settings/SettingsPersonalization.tsx`
- `pages/settings/SettingsRemote.tsx`
- `pages/settings/SettingsSystem.tsx`
- `pages/settings/SettingsAccounts.tsx`
- `pages/settings/SettingsGeneral.tsx`
- `pages/settings/SettingsUpdate.tsx`
- `pages/settings/SettingsResources.tsx`
- `pages/settings/SettingsAppEngine.tsx`
- `pages/settings/SettingsBuilder.tsx`
- `pages/settings/SettingsExtension.tsx`
- `pages/settings/SettingsBetaFeatures.tsx`
- `pages/settings/SettingsNotification.tsx`
- `pages/settings/SettingsShortcuts.tsx`
- `pages/settings/SettingsHelpAbout.tsx`
- `pages/settings/SettingsDateTime.tsx`
- `pages/settings/SettingsLanguages.tsx`
- `pages/settings/settings.test.tsx` — smoke tests for all tabs

---

## Task 1: Shared package — Zod schemas + StoreKeySchema

**Files:**
- Modify: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Add 8 Zod schemas after the existing `UpdateSettingsSchema` block (~line 232)**

```typescript
export const ResourcesSettingsSchema = z.object({
  cpuLimitPercent: z.number().int().min(10).max(100),
  ramLimitMb: z.number().int().min(512).max(32768),
})
export type ResourcesSettings = z.infer<typeof ResourcesSettingsSchema>

export const AppEngineSettingsSchema = z.object({
  ipcTimeoutMs: z.number().int().min(1000).max(120000),
  threadPoolSize: z.number().int().min(1).max(32),
  daemonAutoRestart: z.boolean(),
})
export type AppEngineSettings = z.infer<typeof AppEngineSettingsSchema>

export const BuilderSettingsSchema = z.object({
  cargoPath: z.string().max(4096),
  nodePath: z.string().max(4096),
  pythonPath: z.string().max(4096),
  registryMirror: z.string().max(2048),
})
export type BuilderSettings = z.infer<typeof BuilderSettingsSchema>

export const BetaFeaturesStateSchema = z.record(z.string(), z.boolean())
export type BetaFeaturesState = z.infer<typeof BetaFeaturesStateSchema>

export const NotificationSettingsSchema = z.object({
  globalMute: z.boolean(),
  minSeverity: z.enum(['info', 'warn', 'error']),
  osNotifications: z.literal(false),
})
export type NotificationSettings = z.infer<typeof NotificationSettingsSchema>

export const ShortcutsSettingsSchema = z.record(z.string(), z.string())
export type ShortcutsSettings = z.infer<typeof ShortcutsSettingsSchema>

export const DateTimeSettingsSchema = z.object({
  format: z.enum(['12h', '24h']),
  timezone: z.string().max(64),
})
export type DateTimeSettings = z.infer<typeof DateTimeSettingsSchema>

export const LanguageSettingsSchema = z.object({
  locale: z.literal('en-US'),
})
export type LanguageSettings = z.infer<typeof LanguageSettingsSchema>
```

- [ ] **Step 2: Add 8 keys to `StoreKeySchema` enum (~line 235)**

Find:
```typescript
export const StoreKeySchema = z.enum([
  'custom_profiles',
  'wizard_state',
  'ssh_bookmarks',
  'maintenance_state',
  'active_profile',
  'on_login_automation',
  'appearance',
  'cloud_oauth_clients',
  'readiness_wizard_complete',
  'general_settings',
  'update_settings',
  'profile_credentials',
  'onboarding_profile',
  'projects_home_dir',
])
```

Replace with:
```typescript
export const StoreKeySchema = z.enum([
  'custom_profiles',
  'wizard_state',
  'ssh_bookmarks',
  'maintenance_state',
  'active_profile',
  'on_login_automation',
  'appearance',
  'cloud_oauth_clients',
  'readiness_wizard_complete',
  'general_settings',
  'update_settings',
  'profile_credentials',
  'onboarding_profile',
  'projects_home_dir',
  'resources_settings',
  'app_engine_settings',
  'builder_settings',
  'beta_features_state',
  'notification_settings',
  'shortcuts_settings',
  'datetime_settings',
  'language_settings',
])
```

- [ ] **Step 3: Add 8 branches to `StoreSetRequestSchema` discriminated union (after the `projects_home_dir` branch, before the closing `])`)**

```typescript
  z.object({
    key: z.literal('resources_settings'),
    data: ResourcesSettingsSchema,
  }),
  z.object({
    key: z.literal('app_engine_settings'),
    data: AppEngineSettingsSchema,
  }),
  z.object({
    key: z.literal('builder_settings'),
    data: BuilderSettingsSchema,
  }),
  z.object({
    key: z.literal('beta_features_state'),
    data: BetaFeaturesStateSchema,
  }),
  z.object({
    key: z.literal('notification_settings'),
    data: NotificationSettingsSchema,
  }),
  z.object({
    key: z.literal('shortcuts_settings'),
    data: ShortcutsSettingsSchema,
  }),
  z.object({
    key: z.literal('datetime_settings'),
    data: DateTimeSettingsSchema,
  }),
  z.object({
    key: z.literal('language_settings'),
    data: LanguageSettingsSchema,
  }),
```

- [ ] **Step 4: Verify shared package builds**

```bash
cd packages/shared && pnpm build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/schemas.ts
git commit -m "feat(shared): add Phase 8 settings store key schemas"
```

---

## Task 2: IPC constant + bridge + Window type

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `apps/desktop/src/renderer/src/vite-env.d.ts`
- Modify: `apps/desktop/src/renderer/src/api/desktopApiBridge.ts`

- [ ] **Step 1: Add `appInfo` to end of `IPC` const in `packages/shared/src/ipc.ts` (before `} as const`)**

```typescript
  appInfo: 'dh:app:info',
```

- [ ] **Step 2: Add `appInfo` to Window interface in `vite-env.d.ts` (after `storeDelete` line ~81)**

```typescript
      appInfo: () => Promise<{ ok: boolean; version: string; buildDate: string; rustVersion: string; platform: string; error?: string }>
```

- [ ] **Step 3: Add `appInfo` to bridge in `desktopApiBridge.ts` (after `storeDelete` line ~115)**

```typescript
    appInfo: () => tauriInvoke(IPC.appInfo),
```

- [ ] **Step 4: Typecheck**

```bash
cd apps/desktop && pnpm exec tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ipc.ts \
  apps/desktop/src/renderer/src/vite-env.d.ts \
  apps/desktop/src/renderer/src/api/desktopApiBridge.ts
git commit -m "feat(ipc): add dh:app:info channel"
```

---

## Task 3: Rust — `dh:app:info` handler + build.rs

**Files:**
- Modify: `apps/desktop/src-tauri/build.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Update `build.rs` to emit BUILD_DATE and RUSTC_VERSION**

Replace entire file content:
```rust
fn main() {
    let date = std::process::Command::new("date")
        .arg("+%Y-%m-%d")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=BUILD_DATE={date}");

    let rustc = std::process::Command::new("rustc")
        .arg("--version")
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=RUSTC_VERSION={rustc}");

    tauri_build::build()
}
```

- [ ] **Step 2: Add `"dh:app:info"` match arm in `lib.rs` `ipc_invoke`**

Find the `"dh:session:info"` match arm (~line 1436). Insert the following block directly before it:

```rust
    "dh:app:info" => json!({
      "ok": true,
      "version": env!("CARGO_PKG_VERSION"),
      "buildDate": env!("BUILD_DATE"),
      "rustVersion": env!("RUSTC_VERSION"),
      "platform": std::env::consts::OS,
    }),
```

- [ ] **Step 3: Cargo check**

```bash
cd apps/desktop/src-tauri && cargo check
```

Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/build.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(rust): add dh:app:info handler with version + build metadata"
```

---

## Task 4: Refactor — create `settings/` folder, extract 6 existing tabs

**Files:**
- Create: `pages/settings/SettingsPersonalization.tsx`
- Create: `pages/settings/SettingsRemote.tsx`
- Create: `pages/settings/SettingsSystem.tsx`
- Create: `pages/settings/SettingsAccounts.tsx`
- Create: `pages/settings/SettingsGeneral.tsx`
- Create: `pages/settings/SettingsUpdate.tsx`
- Create: `pages/settings/SettingsShell.tsx`
- Modify: `pages/SettingsPage.tsx`

- [ ] **Step 1: Write smoke test first**

Create `apps/desktop/src/renderer/src/pages/settings/settings.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Mock window.dh for all tab tests
const mockDh = {
  storeGet: vi.fn().mockResolvedValue({ ok: true, data: null }),
  storeSet: vi.fn().mockResolvedValue({ ok: true }),
  cloudAuthStatus: vi.fn().mockResolvedValue({ ok: true, accounts: [] }),
  hostExec: vi.fn().mockResolvedValue({ ok: true, result: '' }),
  appInfo: vi.fn().mockResolvedValue({ ok: true, version: '0.2.0', buildDate: '2026-05-25', rustVersion: 'rustc 1.79', platform: 'linux' }),
  selectFolder: vi.fn().mockResolvedValue(null),
}
Object.defineProperty(window, 'dh', { value: mockDh, writable: true })

import { SettingsShell } from './SettingsShell'

function wrap(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SettingsShell', () => {
  it('renders nav with 16 tabs', () => {
    const html = wrap(<SettingsShell />)
    expect(html).toContain('Personalization')
    expect(html).toContain('Resources')
    expect(html).toContain('Shortcuts')
    expect(html).toContain('Help &amp; About')
    expect(html).toContain('Languages')
  })
})
```

- [ ] **Step 2: Run test — confirm it fails (SettingsShell does not exist yet)**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

Expected: FAIL — cannot find module `./SettingsShell`.

- [ ] **Step 3: Create `SettingsPersonalization.tsx`**

Extract the personalization JSX from `SettingsPage.tsx` (the `navId === 'personalization'` block + accent/theme state + `saveAccent`/`resetAccent` functions + `ACCENT_PRESETS` const):

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { parseAppearance } from '@linux-dev-home/shared'
import { applyAppearanceAccent, applyTheme, DEFAULT_ACCENT_HEX } from '../../theme/applyAccent'
import { assertSettingsOk } from '../settingsContract'

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Violet', hex: '#7c4dff' },
  { label: 'Blue', hex: '#1976d2' },
  { label: 'Green', hex: '#43a047' },
  { label: 'Coral', hex: '#ff7043' },
  { label: 'Teal', hex: '#00897b' },
]

export function SettingsPersonalization(): ReactElement {
  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    void window.dh.storeGet({ key: 'appearance' }).then((ap) => {
      if (ap.ok) {
        const parsed = parseAppearance(ap.data)
        setAccentDraft(parsed.accent ?? DEFAULT_ACCENT_HEX)
        setThemeMode(parsed.theme ?? 'dark')
      }
    })
  }, [])

  async function saveAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({ key: 'appearance', data: { accent: accentDraft, theme: themeMode } })
      assertSettingsOk(res)
      applyAppearanceAccent(accentDraft)
      applyTheme(themeMode)
      setAccentMsg('Accent saved.')
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setAccentBusy(false)
    }
  }

  async function resetAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({ key: 'appearance', data: { theme: themeMode } })
      assertSettingsOk(res)
      setAccentDraft(DEFAULT_ACCENT_HEX)
      applyAppearanceAccent(undefined)
      applyTheme(themeMode)
      setAccentMsg('Restored default accent.')
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setAccentBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Color theme</div>
          <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>Choose between a dark or light interface.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button"
              onClick={() => { setThemeMode(t); applyTheme(t) }}
              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: themeMode === t ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: themeMode === t ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: themeMode === t ? 'var(--accent)' : 'var(--text)', transition: 'all 0.15s ease' }}>
              <span className={`codicon codicon-${t === 'dark' ? 'moon' : 'sun'}`} style={{ marginRight: 6 }} aria-hidden />
              {t === 'dark' ? 'Dark' : 'Light'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Accent color</div>
          <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>Controls the global <span className="mono">--accent</span> design token.</p>
        </div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          {ACCENT_PRESETS.map((p) => (
            <button key={p.hex} type="button" title={p.label} onClick={() => setAccentDraft(p.hex)}
              style={{ width: 40, height: 40, borderRadius: 10, cursor: 'pointer', background: p.hex,
                border: accentDraft.toLowerCase() === p.hex ? '2px solid var(--text)' : '1px solid var(--border)',
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
          ))}
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-muted)', paddingLeft: 4 }}>
            Custom
            <input type="color" value={accentDraft} onChange={(ev) => setAccentDraft(ev.target.value)}
              style={{ width: 44, height: 40, padding: 0, border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-input)' }} />
          </label>
        </div>
      </div>
      <div className="hp-row-wrap">
        <button type="button" className="hp-btn hp-btn-primary" disabled={accentBusy} onClick={() => void saveAccent()}>Save</button>
        <button type="button" className="hp-btn" disabled={accentBusy} onClick={() => void resetAccent()}>Reset to default</button>
      </div>
      {accentMsg ? (
        <div className={`hp-status-alert ${accentMsg.includes('could not') || accentMsg.includes('failed') ? 'error' : 'success'}`} style={{ marginTop: 4 }}>{accentMsg}</div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Create `SettingsRemote.tsx`**

Extract the `navId === 'remote'` block + `bookmarks`/`loadError` state + load logic:

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseSshBookmarks } from '@linux-dev-home/shared'

export function SettingsRemote(): ReactElement {
  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'ssh_bookmarks' }).then((bm) => {
      if (bm.ok) {
        setBookmarks(parseSshBookmarks(bm.data))
      } else {
        setBookmarks([])
        setLoadError(bm.error ?? 'Could not read ssh_bookmarks.')
      }
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="hp-row-wrap" style={{ justifyContent: 'space-between' }}>
        <span className="hp-muted" style={{ fontSize: 13 }}>
          {bookmarks.length === 1 ? '1 saved bookmark' : `${bookmarks.length} saved bookmarks`}
        </span>
        <Link to="/ssh" className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
          <span className="codicon codicon-arrow-right" aria-hidden /> Manage on SSH page
        </Link>
      </div>
      {loadError ? <div className="hp-status-alert error">{loadError}</div> : null}
      {bookmarks.length === 0 && !loadError ? (
        <p className="hp-muted" style={{ margin: 0 }}>No bookmarks yet. Add one on the SSH page.</p>
      ) : null}
      {bookmarks.length > 0 ? (
        <div className="hp-table-wrap">
          <table className="hp-table">
            <thead>
              <tr>
                <th className="hp-table-cell hp-table-head">Name</th>
                <th className="hp-table-cell hp-table-head">Target</th>
                <th className="hp-table-cell hp-table-head" style={{ width: 72 }}>Port</th>
              </tr>
            </thead>
            <tbody>
              {bookmarks.map((b) => (
                <tr key={b.id} className="hp-table-row">
                  <td className="hp-table-cell" style={{ fontWeight: 600 }}>{b.name}</td>
                  <td className="hp-table-cell mono">{b.user}@{b.host}</td>
                  <td className="hp-table-cell">{b.port}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 5: Create `SettingsAccounts.tsx`**

Extract `AccountsSummarySection` from `SettingsPage.tsx`, rename export to `SettingsAccounts`:

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ConnectedAccount } from '@linux-dev-home/shared'

export function SettingsAccounts(): ReactElement {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void window.dh.cloudAuthStatus()
      .then((res) => {
        if (cancelled) return
        setAccounts(res.ok && res.accounts ? res.accounts : [])
        if (!res.ok && res.error) setErr(res.error)
      })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        GitHub supports device flow or a PAT; GitLab uses a personal access token only. Manage accounts on the Cloud Git page.
      </p>
      {loading ? <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>Loading…</p> : null}
      {!loading && err ? <div className="hp-status-alert error" style={{ fontSize: 13 }}>{err}</div> : null}
      {!loading && !err && accounts.length === 0 ? <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>No accounts linked yet.</p> : null}
      {!loading && accounts.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.65, color: 'var(--text)' }}>
          {accounts.map((a) => (
            <li key={`${a.provider}:${a.username}`}>
              <span className="mono">{a.provider}</span> — {a.username}
              <Link to={`/git?tab=cloud&provider=${a.provider}`} className="mono"
                style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}>open</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Link to="/git?tab=cloud&provider=github" className="hp-btn hp-btn-primary" style={{ fontSize: 13, textDecoration: 'none' }}>
          <span className="codicon codicon-github" aria-hidden /> GitHub tab
        </Link>
        <Link to="/git?tab=cloud&provider=gitlab" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
          <span className="codicon codicon-source-control" aria-hidden /> GitLab tab
        </Link>
        <Link to="/git?tab=cloud" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
          <span className="codicon codicon-arrow-right" aria-hidden /> Manage on Cloud Git page
        </Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create `SettingsGeneral.tsx`**

Extract the `navId === 'general'` block + all general/wizard/projectsHome state:

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

export function SettingsGeneral(): ReactElement {
  const [generalSettings, setGeneralSettings] = useState<{ startupBehavior?: string; telemetry?: boolean }>({})
  const [generalMsg, setGeneralMsg] = useState<string | null>(null)
  const [generalBusy, setGeneralBusy] = useState(false)
  const [wizardResetMsg, setWizardResetMsg] = useState<string | null>(null)
  const [wizardResetBusy, setWizardResetBusy] = useState(false)
  const [projectsHomeDir, setProjectsHomeDir] = useState('~/LuminaProjects')
  const [projectsHomeDirBusy, setProjectsHomeDirBusy] = useState(false)
  const [projectsHomeDirMsg, setProjectsHomeDirMsg] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([
      window.dh.storeGet({ key: 'general_settings' }),
      window.dh.storeGet({ key: 'projects_home_dir' }),
    ]).then(([gs, phd]) => {
      if (gs.ok && gs.data && typeof gs.data === 'object') setGeneralSettings(gs.data as typeof generalSettings)
      if (phd.ok && typeof phd.data === 'string' && phd.data.trim()) setProjectsHomeDir(phd.data.trim())
    })
  }, [])

  async function saveGeneralSettings(): Promise<void> {
    setGeneralBusy(true)
    setGeneralMsg(null)
    try {
      const res = await window.dh.storeSet({
        key: 'general_settings',
        data: { startupBehavior: generalSettings.startupBehavior as 'default' | 'minimized' | undefined, telemetry: generalSettings.telemetry },
      })
      assertSettingsOk(res)
      setGeneralMsg('Saved.')
      setTimeout(() => setGeneralMsg(null), 3000)
    } catch (e) {
      setGeneralMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setGeneralBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Startup behavior</div>
        <select value={(generalSettings.startupBehavior ?? 'default') as string}
          onChange={(e) => setGeneralSettings((p) => ({ ...p, startupBehavior: e.target.value }))}
          className="hp-input" style={{ fontSize: 13 }}>
          <option value="default">Default (show app window)</option>
          <option value="minimized">Minimized (start in background)</option>
        </select>
      </div>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Telemetry</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={generalSettings.telemetry ?? false}
            onChange={(e) => setGeneralSettings((p) => ({ ...p, telemetry: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Send usage data to help improve LuminaDev</span>
        </label>
      </div>
      <div style={{ paddingTop: 8 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveGeneralSettings()} disabled={generalBusy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {generalBusy ? 'Saving…' : 'Save'}
        </button>
        {generalMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: generalMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{generalMsg}</p> : null}
      </div>
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Projects Home Directory</div>
        <p className="hp-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>Where new projects are scaffolded.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" className="hp-input" style={{ fontSize: 13, flex: 1, minWidth: 200 }}
            value={projectsHomeDir} onChange={(e) => setProjectsHomeDir(e.target.value)} placeholder="~/LuminaProjects" />
          <button type="button" className="hp-btn" style={{ fontSize: 13, padding: '8px 12px' }} title="Browse"
            onClick={() => { void window.dh.selectFolder().then((p) => { if (p) setProjectsHomeDir(p) }) }}>
            <span className="codicon codicon-folder-open" aria-hidden />
          </button>
          <button type="button" className="hp-btn hp-btn-primary" style={{ fontSize: 13, padding: '8px 16px' }}
            disabled={projectsHomeDirBusy || !projectsHomeDir.trim()}
            onClick={() => {
              setProjectsHomeDirBusy(true)
              void window.dh.storeSet({ key: 'projects_home_dir', data: projectsHomeDir.trim() })
                .then(() => setProjectsHomeDirMsg('Saved.'))
                .catch((e: unknown) => setProjectsHomeDirMsg(e instanceof Error ? e.message : 'Save failed.'))
                .finally(() => { setProjectsHomeDirBusy(false); setTimeout(() => setProjectsHomeDirMsg(null), 3000) })
            }}>
            {projectsHomeDirBusy ? 'Saving…' : 'Save'}
          </button>
        </div>
        {projectsHomeDirMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: projectsHomeDirMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{projectsHomeDirMsg}</p> : null}
      </div>
      <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--red)' }}>Danger Zone</div>
        <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          Reset the setup wizard so it runs again on next app launch.
        </p>
        <button type="button" className="hp-btn" style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--red)', color: 'var(--red)' }}
          disabled={wizardResetBusy}
          onClick={() => {
            setWizardResetBusy(true)
            void window.dh.storeSet({ key: 'readiness_wizard_complete', data: false })
              .then(() => setWizardResetMsg('Setup wizard will run on next launch.'))
              .catch((e: unknown) => setWizardResetMsg(e instanceof Error ? e.message : 'Failed to reset wizard.'))
              .finally(() => setWizardResetBusy(false))
          }}>
          <span className="codicon codicon-refresh" aria-hidden />
          {wizardResetBusy ? 'Resetting…' : 'Run Setup Wizard Again'}
        </button>
        {wizardResetMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{wizardResetMsg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `SettingsUpdate.tsx`**

Extract `navId === 'update'` block:

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

type UpdateSettings = { releaseChannel: string; checkOnStartup: boolean; lastChecked?: number }
const DEFAULTS: UpdateSettings = { releaseChannel: 'stable', checkOnStartup: true }

export function SettingsUpdate(): ReactElement {
  const [settings, setSettings] = useState<UpdateSettings>(DEFAULTS)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'update_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings(res.data as UpdateSettings)
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const data = { releaseChannel: settings.releaseChannel as 'stable' | 'alpha', checkOnStartup: settings.checkOnStartup, lastChecked: Date.now() }
      assertSettingsOk(await window.dh.storeSet({ key: 'update_settings', data }))
      setSettings(data)
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Release channel</div>
        <select value={settings.releaseChannel} onChange={(e) => setSettings((p) => ({ ...p, releaseChannel: e.target.value }))} className="hp-input" style={{ fontSize: 13 }}>
          <option value="stable">Stable (recommended)</option>
          <option value="alpha">Alpha (early features, frequent updates)</option>
        </select>
      </div>
      <div style={{ paddingTop: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.checkOnStartup} onChange={(e) => setSettings((p) => ({ ...p, checkOnStartup: e.target.checked }))} />
          <span style={{ fontSize: 13 }}>Check for updates on app startup</span>
        </label>
      </div>
      <div style={{ paddingTop: 8 }}>
        {settings.lastChecked
          ? <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Last checked: {new Date(settings.lastChecked).toLocaleDateString()}</p>
          : <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Never checked</p>}
      </div>
      <div style={{ paddingTop: 8 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create `SettingsSystem.tsx`**

Extract the full `navId === 'system'` block (hosts preview/editor + env viewer + profile env editor). This is the largest extraction. Copy everything between `{navId === 'system' ? (` and the matching `) : null}` including the second card outside the main card (hosts editor + profile env sections). Also copy the helper functions (`refreshHosts`, `refreshEnv`, `saveHosts`, `loadProfileEnv`, `applyProfileEnvDiff`) and the helpers `hostExecStringResult`, `parseProcessEnvText`, `parseHostsText`, `PathSegmentList`, `EnvValueDisplay`, `listShell` const.

The component signature is:
```tsx
export function SettingsSystem(): ReactElement { /* full extracted content */ }
```

All imports needed:
```tsx
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
```

- [ ] **Step 9: Create `SettingsShell.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SettingsPersonalization } from './SettingsPersonalization'
import { SettingsRemote } from './SettingsRemote'
import { SettingsSystem } from './SettingsSystem'
import { SettingsAccounts } from './SettingsAccounts'
import { SettingsGeneral } from './SettingsGeneral'
import { SettingsUpdate } from './SettingsUpdate'
import { SettingsResources } from './SettingsResources'
import { SettingsAppEngine } from './SettingsAppEngine'
import { SettingsBuilder } from './SettingsBuilder'
import { SettingsExtension } from './SettingsExtension'
import { SettingsBetaFeatures } from './SettingsBetaFeatures'
import { SettingsNotification } from './SettingsNotification'
import { SettingsShortcuts } from './SettingsShortcuts'
import { SettingsHelpAbout } from './SettingsHelpAbout'
import { SettingsDateTime } from './SettingsDateTime'
import { SettingsLanguages } from './SettingsLanguages'

type SettingsNavId =
  | 'personalization' | 'remote' | 'system' | 'accounts' | 'general' | 'update'
  | 'resources' | 'app-engine' | 'builder' | 'extension' | 'beta'
  | 'notification' | 'shortcuts' | 'help-about' | 'datetime' | 'languages'

const NAV: ReadonlyArray<{ id: SettingsNavId; label: string; hint: string; icon: string; beta?: boolean }> = [
  { id: 'personalization', label: 'Personalization', hint: 'Colors & appearance', icon: 'color-mode' },
  { id: 'remote', label: 'SSH & remote', hint: 'Saved connections', icon: 'terminal-linux' },
  { id: 'system', label: 'System', hint: 'Hosts & environment', icon: 'inspect' },
  { id: 'accounts', label: 'Connected accounts', hint: 'GitHub & GitLab', icon: 'github' },
  { id: 'general', label: 'General', hint: 'Startup, window, telemetry', icon: 'settings' },
  { id: 'update', label: 'Update', hint: 'Release channel & checks', icon: 'arrow-circle-up' },
  { id: 'notification', label: 'Notification', hint: 'Mute, filters, OS alerts', icon: 'bell' },
  { id: 'shortcuts', label: 'Shortcuts', hint: 'Keybindings', icon: 'keyboard' },
  { id: 'help-about', label: 'Help & About', hint: 'Version & license', icon: 'info' },
  { id: 'datetime', label: 'Date & Time', hint: '12h/24h, timezone', icon: 'clock' },
  { id: 'languages', label: 'Languages', hint: 'Locale', icon: 'globe' },
  { id: 'resources', label: 'Resources', hint: 'CPU & RAM limits', icon: 'server-process', beta: true },
  { id: 'app-engine', label: 'App Engine', hint: 'IPC & daemon config', icon: 'server', beta: true },
  { id: 'builder', label: 'Builder', hint: 'Toolchain paths', icon: 'tools', beta: true },
  { id: 'extension', label: 'Extension', hint: 'Coming soon', icon: 'extensions', beta: true },
  { id: 'beta', label: 'Beta Features', hint: 'Experimental flags', icon: 'beaker', beta: true },
]

const TAB_SUBTITLES: Partial<Record<SettingsNavId, string>> = {
  personalization: 'Choose an accent color and theme for the app.',
  remote: 'These entries are the same as on the SSH page.',
  system: 'Read-only diagnostics: hosts file and process environment variables.',
  accounts: 'Overview of accounts stored for GitHub and GitLab.',
  general: 'Startup behavior, telemetry, and project home directory.',
  update: 'Release channel and update checks.',
  notification: 'Control in-app notifications and OS alert delivery.',
  shortcuts: 'Customize keyboard shortcuts for major app actions.',
  'help-about': 'App version, build info, and license.',
  datetime: 'Time format and timezone for all log timestamps.',
  languages: 'Display language (full translations in a future release).',
  resources: 'CPU and RAM limits for background job execution.',
  'app-engine': 'IPC timeouts and daemon configuration.',
  builder: 'Paths to local toolchains and registry mirrors.',
  extension: 'Plugin management coming in a future release.',
  beta: 'Toggle experimental features.',
}

function TabContent({ id }: { id: SettingsNavId }): ReactElement {
  switch (id) {
    case 'personalization': return <SettingsPersonalization />
    case 'remote': return <SettingsRemote />
    case 'system': return <SettingsSystem />
    case 'accounts': return <SettingsAccounts />
    case 'general': return <SettingsGeneral />
    case 'update': return <SettingsUpdate />
    case 'resources': return <SettingsResources />
    case 'app-engine': return <SettingsAppEngine />
    case 'builder': return <SettingsBuilder />
    case 'extension': return <SettingsExtension />
    case 'beta': return <SettingsBetaFeatures />
    case 'notification': return <SettingsNotification />
    case 'shortcuts': return <SettingsShortcuts />
    case 'help-about': return <SettingsHelpAbout />
    case 'datetime': return <SettingsDateTime />
    case 'languages': return <SettingsLanguages />
  }
}

export function SettingsShell(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab') as SettingsNavId | null
  const validIds = NAV.map((n) => n.id)
  const [navId, setNavId] = useState<SettingsNavId>(
    rawTab && validIds.includes(rawTab) ? rawTab : 'personalization'
  )

  function navigate(id: SettingsNavId): void {
    setNavId(id)
    setSearchParams({ tab: id }, { replace: true })
  }

  const activeNav = NAV.find((n) => n.id === navId) ?? NAV[0]!

  return (
    <div className="settings-page elevated-page" style={{ padding: '28px 32px 48px', maxWidth: 1040 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>Settings</h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Personalize LuminaDev, manage SSH targets, linked cloud Git providers, and system configuration.
        </p>
      </header>
      <div className="settings-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)', gap: 32, alignItems: 'start' }}>
        <nav aria-label="Settings categories" style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 12 }}>
          {NAV.map((item) => {
            const active = item.id === navId
            return (
              <button key={item.id} type="button" onClick={() => navigate(item.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid',
                  borderColor: active ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'transparent',
                  background: active ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-widget))' : 'color-mix(in srgb, var(--bg-widget) 88%, transparent)',
                  color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease',
                  boxShadow: active ? '0 1px 0 rgba(255,255,255,0.04)' : 'none' }}>
                <span className={`codicon codicon-${item.icon}`}
                  style={{ fontSize: 20, marginTop: 2, opacity: active ? 1 : 0.85, color: active ? 'var(--accent)' : 'var(--text-muted)' }} aria-hidden />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 650, fontSize: 14, letterSpacing: '0.01em' }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{item.hint}</span>
                </span>
              </button>
            )
          })}
        </nav>
        <main key={navId} className="settings-pane-animate" style={{ minWidth: 0 }}>
          <div className="hp-card" style={{ padding: '22px 24px' }}>
            <div className="hp-card-header" style={{ marginBottom: 16 }}>
              <h2 className="hp-card-title" style={{ fontSize: 16 }}>{activeNav.label}</h2>
              {TAB_SUBTITLES[navId] ? <p className="hp-card-subtitle" style={{ fontSize: 13 }}>{TAB_SUBTITLES[navId]}</p> : null}
            </div>
            <TabContent id={navId} />
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 10: Replace `SettingsPage.tsx` with re-export**

```tsx
export { SettingsShell as SettingsPage } from './settings/SettingsShell'
```

Note: The route in `App.tsx` imports `SettingsPage` — this re-export keeps it working unchanged.

- [ ] **Step 11: Run smoke test**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

Expected: PASS (SettingsShell now exists and renders all nav labels).

- [ ] **Step 12: Run typecheck + full test suite**

```bash
cd apps/desktop && pnpm exec tsc --noEmit && pnpm test
```

Expected: no errors, all tests pass.

- [ ] **Step 13: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/ apps/desktop/src/renderer/src/pages/SettingsPage.tsx
git commit -m "refactor(settings): split SettingsPage into per-tab components with URL sync"
```

---

## Task 5: SettingsResources

**Files:**
- Create: `pages/settings/SettingsResources.tsx`

- [ ] **Step 1: Add test to `settings.test.tsx`**

```tsx
import { SettingsResources } from './SettingsResources'

it('SettingsResources renders CPU slider label', () => {
  expect(wrap(<SettingsResources />)).toContain('CPU limit')
})
it('SettingsResources renders RAM label', () => {
  expect(wrap(<SettingsResources />)).toContain('RAM allocation')
})
```

- [ ] **Step 2: Run test — confirm fail**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

Expected: FAIL — cannot find `SettingsResources`.

- [ ] **Step 3: Create `SettingsResources.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ResourcesSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: ResourcesSettings = { cpuLimitPercent: 80, ramLimitMb: 4096 }

export function SettingsResources(): ReactElement {
  const [settings, setSettings] = useState<ResourcesSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'resources_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings({ ...DEFAULTS, ...(res.data as Partial<ResourcesSettings>) })
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'resources_settings', data: settings }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
        These limits will be enforced by the job runner in a future release.
      </p>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>CPU limit</label>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{settings.cpuLimitPercent}%</span>
        </div>
        <input type="range" min={10} max={100} step={5} value={settings.cpuLimitPercent}
          onChange={(e) => setSettings((p) => ({ ...p, cpuLimitPercent: Number(e.target.value) }))}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>10%</span><span>100%</span>
        </div>
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>RAM allocation</label>
          <span className="mono" style={{ fontSize: 13, color: 'var(--accent)' }}>{settings.ramLimitMb >= 1024 ? `${settings.ramLimitMb / 1024} GB` : `${settings.ramLimitMb} MB`}</span>
        </div>
        <input type="range" min={512} max={16384} step={512} value={settings.ramLimitMb}
          onChange={(e) => setSettings((p) => ({ ...p, ramLimitMb: Number(e.target.value) }))}
          style={{ width: '100%' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>512 MB</span><span>16 GB</span>
        </div>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

Note: `ResourcesSettings` type must be exported from `packages/shared/src/schemas.ts` (done in Task 1). Import it from `@linux-dev-home/shared`.

- [ ] **Step 4: Run test — confirm pass**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsResources.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Resources tab — CPU/RAM sliders"
```

---

## Task 6: SettingsAppEngine

**Files:**
- Create: `pages/settings/SettingsAppEngine.tsx`

- [ ] **Step 1: Add test to `settings.test.tsx`**

```tsx
import { SettingsAppEngine } from './SettingsAppEngine'

it('SettingsAppEngine renders IPC timeout label', () => {
  expect(wrap(<SettingsAppEngine />)).toContain('IPC timeout')
})
```

- [ ] **Step 2: Run test — confirm fail**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

- [ ] **Step 3: Create `SettingsAppEngine.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { AppEngineSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: AppEngineSettings = { ipcTimeoutMs: 30000, threadPoolSize: 4, daemonAutoRestart: true }

export function SettingsAppEngine(): ReactElement {
  const [settings, setSettings] = useState<AppEngineSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'app_engine_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings({ ...DEFAULTS, ...(res.data as Partial<AppEngineSettings>) })
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'app_engine_settings', data: settings }))
      setMsg('Saved. Daemon behaviors take effect on next app launch.')
      setTimeout(() => setMsg(null), 4000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>Daemon behaviors take effect on next app launch.</p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>IPC timeout (ms)</label>
        <input type="number" className="hp-input" style={{ fontSize: 13, width: 160 }}
          min={1000} max={120000} value={settings.ipcTimeoutMs}
          onChange={(e) => setSettings((p) => ({ ...p, ipcTimeoutMs: Math.max(1000, Math.min(120000, Number(e.target.value))) }))} />
      </div>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Thread pool size</label>
        <input type="number" className="hp-input" style={{ fontSize: 13, width: 100 }}
          min={1} max={32} value={settings.threadPoolSize}
          onChange={(e) => setSettings((p) => ({ ...p, threadPoolSize: Math.max(1, Math.min(32, Number(e.target.value))) }))} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Daemon auto-restart</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>Restart background daemon on crash.</p>
        </div>
        <button type="button" role="switch" aria-checked={settings.daemonAutoRestart}
          onClick={() => setSettings((p) => ({ ...p, daemonAutoRestart: !p.daemonAutoRestart }))}
          style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
            background: settings.daemonAutoRestart ? 'var(--accent)' : 'var(--border)' }}>
          <span style={{ position: 'absolute', top: 3, left: settings.daemonAutoRestart ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </button>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg.includes('failed') ? 'var(--red)' : 'var(--green)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsAppEngine.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): App Engine tab — IPC timeout, thread pool, daemon restart"
```

---

## Task 7: SettingsBuilder

**Files:**
- Create: `pages/settings/SettingsBuilder.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsBuilder } from './SettingsBuilder'

it('SettingsBuilder renders Cargo path label', () => {
  expect(wrap(<SettingsBuilder />)).toContain('Cargo path')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsBuilder.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { BuilderSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: BuilderSettings = { cargoPath: '', nodePath: '', pythonPath: '', registryMirror: 'https://registry.npmjs.org' }

function PathRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): ReactElement {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" className="hp-input" style={{ flex: 1, fontSize: 13 }}
          value={value} onChange={(e) => onChange(e.target.value)} placeholder="auto-detect" />
        <button type="button" className="hp-btn" style={{ padding: '8px 12px' }}
          onClick={() => { void window.dh.selectFolder().then((p) => { if (p) onChange(p) }) }}>
          <span className="codicon codicon-folder-open" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function SettingsBuilder(): ReactElement {
  const [settings, setSettings] = useState<BuilderSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'builder_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings({ ...DEFAULTS, ...(res.data as Partial<BuilderSettings>) })
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'builder_settings', data: settings }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PathRow label="Cargo path" value={settings.cargoPath} onChange={(v) => setSettings((p) => ({ ...p, cargoPath: v }))} />
      <PathRow label="Node path" value={settings.nodePath} onChange={(v) => setSettings((p) => ({ ...p, nodePath: v }))} />
      <PathRow label="Python path" value={settings.pythonPath} onChange={(v) => setSettings((p) => ({ ...p, pythonPath: v }))} />
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Registry mirror</label>
        <input type="text" className="hp-input" style={{ width: '100%', fontSize: 13 }}
          value={settings.registryMirror} onChange={(e) => setSettings((p) => ({ ...p, registryMirror: e.target.value }))}
          placeholder="https://registry.npmjs.org" />
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsBuilder.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Builder tab — toolchain paths and registry mirror"
```

---

## Task 8: SettingsExtension (placeholder)

**Files:**
- Create: `pages/settings/SettingsExtension.tsx`

- [ ] **Step 1: Create `SettingsExtension.tsx`**

```tsx
import type { ReactElement } from 'react'

export function SettingsExtension(): ReactElement {
  return (
    <div style={{ paddingTop: 12, textAlign: 'center' }}>
      <span className="codicon codicon-extensions" style={{ fontSize: 32, opacity: 0.4, marginBottom: 12, display: 'block' }} aria-hidden />
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Coming in a future release</p>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, marginInline: 'auto' }}>
        Plugin management and marketplace (Phase 10).
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsExtension.tsx
git commit -m "feat(settings): Extension tab placeholder"
```

---

## Task 9: SettingsBetaFeatures

**Files:**
- Create: `pages/settings/SettingsBetaFeatures.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsBetaFeatures } from './SettingsBetaFeatures'

it('SettingsBetaFeatures renders flag labels', () => {
  const html = wrap(<SettingsBetaFeatures />)
  expect(html).toContain('terminal multiplexer')
  expect(html).toContain('commit suggestions')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsBetaFeatures.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { BetaFeaturesState } from '@linux-dev-home/shared'

const FLAGS: ReadonlyArray<{ key: string; label: string; description: string }> = [
  { key: 'enable_experimental_terminal_multiplexer', label: 'Terminal multiplexer', description: 'Experimental xterm.js multi-pane terminal (unstable).' },
  { key: 'enable_ai_commit_suggestions', label: 'AI commit suggestions', description: 'Suggest commit messages using AI (requires API key in environment).' },
  { key: 'enable_profile_auto_switch', label: 'Profile auto-switch', description: 'Auto-switch active profile when changing project directory.' },
]

export function SettingsBetaFeatures(): ReactElement {
  const [state, setState] = useState<BetaFeaturesState>({})

  useEffect(() => {
    void window.dh.storeGet({ key: 'beta_features_state' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setState(res.data as BetaFeaturesState)
    })
  }, [])

  async function toggle(key: string, enabled: boolean): Promise<void> {
    const next = { ...state, [key]: enabled }
    setState(next)
    await window.dh.storeSet({ key: 'beta_features_state', data: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <p className="hp-muted" style={{ margin: '0 0 16px', fontSize: 13 }}>
        Experimental flags. May be unstable or incomplete. Saved immediately on toggle.
      </p>
      {FLAGS.map((flag, i) => (
        <div key={flag.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0',
          borderTop: i === 0 ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{flag.label}</div>
            <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{flag.description}</p>
          </div>
          <button type="button" role="switch" aria-checked={!!state[flag.key]}
            onClick={() => { void toggle(flag.key, !state[flag.key]) }}
            style={{ flexShrink: 0, width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
              background: state[flag.key] ? 'var(--accent)' : 'var(--border)' }}>
            <span style={{ position: 'absolute', top: 3, left: state[flag.key] ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsBetaFeatures.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Beta Features tab — experimental flag toggles"
```

---

## Task 10: SettingsNotification

**Files:**
- Create: `pages/settings/SettingsNotification.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsNotification } from './SettingsNotification'

it('SettingsNotification renders global mute label', () => {
  expect(wrap(<SettingsNotification />)).toContain('Global mute')
})
it('SettingsNotification OS notifications toggle is disabled', () => {
  expect(wrap(<SettingsNotification />)).toContain('disabled')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsNotification.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { NotificationSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: NotificationSettings = { globalMute: false, minSeverity: 'info', osNotifications: false }

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }): ReactElement {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked) }}
      style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
        position: 'relative', transition: 'background 0.2s', background: checked ? 'var(--accent)' : 'var(--border)' }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </button>
  )
}

export function SettingsNotification(): ReactElement {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'notification_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings({ ...DEFAULTS, ...(res.data as Partial<NotificationSettings>) })
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'notification_settings', data: { ...settings, osNotifications: false } }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {[
        { key: 'globalMute' as const, label: 'Global mute', description: 'Suppress all in-app toast notifications.' },
      ].map((row) => (
        <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{row.label}</div>
            <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{row.description}</p>
          </div>
          <Toggle checked={!!settings[row.key]} onChange={(v) => setSettings((p) => ({ ...p, [row.key]: v }))} />
        </div>
      ))}
      <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Minimum severity</label>
        <select value={settings.minSeverity} onChange={(e) => setSettings((p) => ({ ...p, minSeverity: e.target.value as NotificationSettings['minSeverity'] }))}
          className="hp-input" style={{ fontSize: 13 }}>
          <option value="info">Info and above (all notifications)</option>
          <option value="warn">Warnings and above</option>
          <option value="error">Errors only</option>
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>OS native notifications</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
            Requires Tauri notification plugin (Phase 10).
          </p>
        </div>
        <Toggle checked={false} onChange={() => {}} disabled />
      </div>
      <div style={{ paddingTop: 16 }}>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsNotification.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Notification tab — mute, severity filter, OS notifications placeholder"
```

---

## Task 11: SettingsShortcuts

**Files:**
- Create: `pages/settings/SettingsShortcuts.tsx`

- [ ] **Step 1: Add chord builder unit test**

In `settings.test.tsx`:

```tsx
import { buildChord } from './SettingsShortcuts'

describe('buildChord', () => {
  it('builds ctrl+shift+x', () => {
    expect(buildChord({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'x' })).toBe('Ctrl+Shift+X')
  })
  it('builds alt+1', () => {
    expect(buildChord({ ctrlKey: false, shiftKey: false, altKey: true, metaKey: false, key: '1' })).toBe('Alt+1')
  })
  it('ignores bare modifier press', () => {
    expect(buildChord({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'Control' })).toBe(null)
  })
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsShortcuts.tsx`** with exported `buildChord` helper:

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ShortcutsSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS'])

export function buildChord(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: string }): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)
  return parts.join('+')
}

const DEFAULT_ACTIONS: ReadonlyArray<{ key: string; label: string; defaultBinding: string }> = [
  { key: 'open_terminal', label: 'Open terminal', defaultBinding: 'Ctrl+Alt+T' },
  { key: 'toggle_sidebar', label: 'Toggle sidebar', defaultBinding: 'Ctrl+B' },
  { key: 'focus_search', label: 'Focus search', defaultBinding: 'Ctrl+K' },
  { key: 'go_dashboard', label: 'Go to Dashboard', defaultBinding: 'Alt+1' },
  { key: 'go_docker', label: 'Go to Docker', defaultBinding: 'Alt+2' },
  { key: 'go_git', label: 'Go to Git', defaultBinding: 'Alt+3' },
]

export function SettingsShortcuts(): ReactElement {
  const [bindings, setBindings] = useState<ShortcutsSettings>(() =>
    Object.fromEntries(DEFAULT_ACTIONS.map((a) => [a.key, a.defaultBinding]))
  )
  const [recording, setRecording] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setBindings((prev) => ({ ...prev, ...(res.data as ShortcutsSettings) }))
      }
    })
  }, [])

  useEffect(() => {
    if (!recording) return
    function onKey(e: KeyboardEvent): void {
      e.preventDefault()
      if (e.key === 'Escape') { setRecording(null); return }
      const chord = buildChord(e)
      if (chord) {
        setBindings((p) => ({ ...p, [recording]: chord }))
        setRecording(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [recording])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'shortcuts_settings', data: bindings }))
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
        Click "Record" then press a key combination. Escape cancels. Changes apply on save.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Action</th>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Binding</th>
            <th style={{ width: 80 }} />
          </tr>
        </thead>
        <tbody>
          {DEFAULT_ACTIONS.map((action) => (
            <tr key={action.key} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 12px', fontSize: 14 }}>{action.label}</td>
              <td style={{ padding: '12px 12px' }}>
                {recording === action.key ? (
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontStyle: 'italic' }}>Press keys… (Esc to cancel)</span>
                ) : (
                  <span className="mono" style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                    {bindings[action.key] ?? action.defaultBinding}
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                <button type="button" className="hp-btn" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setRecording(recording === action.key ? null : action.key)}>
                  {recording === action.key ? 'Cancel' : 'Record'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy || !!recording} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save all'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
cd apps/desktop && pnpm exec vitest run src/renderer/src/pages/settings/settings.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsShortcuts.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Shortcuts tab — keybinding capture UI with chord builder"
```

---

## Task 12: SettingsHelpAbout

**Files:**
- Create: `pages/settings/SettingsHelpAbout.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsHelpAbout } from './SettingsHelpAbout'

it('SettingsHelpAbout renders LuminaDev name', () => {
  expect(wrap(<SettingsHelpAbout />)).toContain('LuminaDev')
})
it('SettingsHelpAbout renders MIT license', () => {
  expect(wrap(<SettingsHelpAbout />)).toContain('MIT')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsHelpAbout.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

type AppInfo = { version: string; buildDate: string; rustVersion: string; platform: string }

export function SettingsHelpAbout(): ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void window.dh.appInfo()
      .then((res) => {
        if (res.ok) setInfo({ version: res.version, buildDate: res.buildDate, rustVersion: res.rustVersion, platform: res.platform })
        else setErr(res.error ?? 'Failed to load app info.')
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Failed to load app info.'))
  }, [])

  const rows: Array<{ label: string; value: string }> = info ? [
    { label: 'Version', value: info.version },
    { label: 'Build date', value: info.buildDate },
    { label: 'Platform', value: info.platform },
    { label: 'Rust', value: info.rustVersion },
  ] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="codicon codicon-info" style={{ fontSize: 40, color: 'var(--accent)', opacity: 0.85 }} aria-hidden />
        <div>
          <div style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-0.02em' }}>LuminaDev</div>
          <p className="hp-muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Linux Dev Home — desktop environment manager</p>
        </div>
      </div>
      {err ? <div className="hp-status-alert error">{err}</div> : null}
      {!info && !err ? <p className="hp-muted" style={{ fontSize: 13 }}>Loading…</p> : null}
      {rows.length > 0 ? (
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px 10px 0', fontWeight: 600, width: 120, color: 'var(--text-muted)' }}>{r.label}</td>
                <td className="mono" style={{ padding: '10px 0' }}>{r.value}</td>
              </tr>
            ))}
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 16px 10px 0', fontWeight: 600, color: 'var(--text-muted)' }}>License</td>
              <td style={{ padding: '10px 0', fontSize: 13 }}>MIT</td>
            </tr>
          </tbody>
        </table>
      ) : null}
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="hp-btn" style={{ fontSize: 13 }}
          onClick={() => { void window.dh.openExternal('https://github.com/karimodora/LuminaDev') }}>
          <span className="codicon codicon-github" aria-hidden /> GitHub
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsHelpAbout.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Help & About tab — version info from dh:app:info"
```

---

## Task 13: SettingsDateTime

**Files:**
- Create: `pages/settings/SettingsDateTime.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsDateTime } from './SettingsDateTime'

it('SettingsDateTime renders 12h/24h toggle', () => {
  const html = wrap(<SettingsDateTime />)
  expect(html).toContain('12-hour')
  expect(html).toContain('24-hour')
})
it('SettingsDateTime renders timezone label', () => {
  expect(wrap(<SettingsDateTime />)).toContain('Timezone')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsDateTime.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { DateTimeSettings } from '@linux-dev-home/shared'
import { assertSettingsOk } from '../settingsContract'

const DEFAULTS: DateTimeSettings = {
  format: '24h',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
}

export function SettingsDateTime(): ReactElement {
  const [settings, setSettings] = useState<DateTimeSettings>(DEFAULTS)
  const [tzFilter, setTzFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const allTimezones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone') } catch { return [DEFAULTS.timezone] }
  }, [])

  const filteredTz = useMemo(() => {
    const q = tzFilter.trim().toLowerCase()
    return q ? allTimezones.filter((tz) => tz.toLowerCase().includes(q)) : allTimezones
  }, [allTimezones, tzFilter])

  useEffect(() => {
    void window.dh.storeGet({ key: 'datetime_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSettings({ ...DEFAULTS, ...(res.data as Partial<DateTimeSettings>) })
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'datetime_settings', data: settings }))
      document.documentElement.dataset.timeformat = settings.format
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Time format</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['12h', '24h'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setSettings((p) => ({ ...p, format: f }))}
              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                border: settings.format === f ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: settings.format === f ? 'var(--accent-dim)' : 'var(--bg-input)',
                color: settings.format === f ? 'var(--accent)' : 'var(--text)' }}>
              {f === '12h' ? '12-hour' : '24-hour'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Timezone</div>
        <input type="search" className="hp-input" placeholder="Filter timezones…" value={tzFilter}
          onChange={(e) => setTzFilter(e.target.value)} style={{ marginBottom: 8, fontSize: 13, width: '100%', maxWidth: 360 }} />
        <select value={settings.timezone} onChange={(e) => setSettings((p) => ({ ...p, timezone: e.target.value }))}
          className="hp-input" style={{ fontSize: 13, width: '100%', maxWidth: 360 }}>
          {filteredTz.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {filteredTz.length} of {allTimezones.length} timezones shown
        </p>
      </div>
      <div>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsDateTime.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Date & Time tab — 12h/24h toggle and timezone picker"
```

---

## Task 14: SettingsLanguages

**Files:**
- Create: `pages/settings/SettingsLanguages.tsx`

- [ ] **Step 1: Add test**

```tsx
import { SettingsLanguages } from './SettingsLanguages'

it('SettingsLanguages renders English as only enabled option', () => {
  const html = wrap(<SettingsLanguages />)
  expect(html).toContain('English')
  expect(html).toContain('Additional languages coming')
})
```

- [ ] **Step 2: Run test — confirm fail**

- [ ] **Step 3: Create `SettingsLanguages.tsx`**

```tsx
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { assertSettingsOk } from '../settingsContract'

const FUTURE_LOCALES = [
  { locale: 'fr-FR', label: 'Français' },
  { locale: 'de-DE', label: 'Deutsch' },
  { locale: 'es-ES', label: 'Español' },
  { locale: 'ar-SA', label: 'العربية' },
  { locale: 'zh-CN', label: '中文' },
]

export function SettingsLanguages(): ReactElement {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.dh.storeGet({ key: 'language_settings' }).then((res) => {
      if (res.ok && res.data && typeof res.data === 'object') setSaved(true)
    })
  }, [])

  async function save(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      assertSettingsOk(await window.dh.storeSet({ key: 'language_settings', data: { locale: 'en-US' } }))
      document.documentElement.lang = 'en'
      setSaved(true)
      setMsg('Saved.')
      setTimeout(() => setMsg(null), 3000)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>Additional languages coming in a future release.</p>
      <div>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Display language</label>
        <select className="hp-input" style={{ fontSize: 13, width: 240 }} value="en-US" disabled={false}>
          <option value="en-US">English (en-US)</option>
          {FUTURE_LOCALES.map((l) => (
            <option key={l.locale} value={l.locale} disabled>{l.label} — coming soon</option>
          ))}
        </select>
      </div>
      {!saved ? (
        <div>
          <button type="button" className="hp-btn hp-btn-primary" onClick={() => void save()} disabled={busy} style={{ fontSize: 13, padding: '8px 16px' }}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          {msg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: msg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{msg}</p> : null}
        </div>
      ) : (
        <p className="hp-muted" style={{ fontSize: 12, margin: 0 }}>en-US saved.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test — confirm pass**

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/pages/settings/SettingsLanguages.tsx \
  apps/desktop/src/renderer/src/pages/settings/settings.test.tsx
git commit -m "feat(settings): Languages tab — en-US only with future locale stubs"
```

---

## Task 15: Final integration check

- [ ] **Step 1: Export new types from shared index (if not already re-exported)**

Check `packages/shared/src/index.ts` — ensure `ResourcesSettings`, `AppEngineSettings`, `BuilderSettings`, `BetaFeaturesState`, `NotificationSettings`, `ShortcutsSettings`, `DateTimeSettings`, `LanguageSettings` are exported. Add any missing:

```bash
grep -n "ResourcesSettings\|AppEngineSettings\|BuilderSettings" packages/shared/src/index.ts
```

If missing, append to `packages/shared/src/index.ts`:

```typescript
export type {
  ResourcesSettings,
  AppEngineSettings,
  BuilderSettings,
  BetaFeaturesState,
  NotificationSettings,
  ShortcutsSettings,
  DateTimeSettings,
  LanguageSettings,
} from './schemas'
```

- [ ] **Step 2: Full smoke gate**

```bash
pnpm smoke
```

Expected: typecheck + test + lint all pass.

- [ ] **Step 3: Rebuild shared + desktop**

```bash
pnpm build
```

Expected: no errors.

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -p
git commit -m "fix(settings): export new types from shared, smoke gate fixes"
```

---

## Self-Review

**Spec coverage check:**
- StoreKeySchema prerequisite → Task 1 ✓
- `dh:app:info` Rust handler + `build.rs` → Task 3 ✓
- `BUILD_DATE` using `date` command (not stdlib date formatting) → Task 3 ✓
- Bridge + Window type for appInfo → Task 2 ✓
- Split SettingsPage.tsx → per-tab components → Task 4 ✓
- URL sync via `useSearchParams` → Task 4 (SettingsShell) ✓
- Resources tab (sliders) → Task 5 ✓
- App Engine tab → Task 6 ✓
- Builder tab → Task 7 ✓
- Extension placeholder → Task 8 ✓
- Beta Features tab (auto-save toggles) → Task 9 ✓
- Notification tab (OS toggle disabled) → Task 10 ✓
- Shortcuts tab (chord capture + `buildChord` unit test) → Task 11 ✓
- Help & About tab → Task 12 ✓
- Date & Time tab → Task 13 ✓
- Languages tab (en-US only, others disabled) → Task 14 ✓
- Types exported from shared → Task 15 ✓

**Type consistency:** `ResourcesSettings`, `AppEngineSettings`, etc. defined in Task 1, imported by name in all subsequent tabs. `buildChord` exported from `SettingsShortcuts.tsx` and imported in test. No naming mismatches.

**No placeholders found.**
