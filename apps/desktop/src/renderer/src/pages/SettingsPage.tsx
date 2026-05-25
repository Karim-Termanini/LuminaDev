import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ConnectedAccount, SshBookmark } from '@linux-dev-home/shared'
import { parseAppearance, parseSshBookmarks } from '@linux-dev-home/shared'

import { applyAppearanceAccent, applyTheme, DEFAULT_ACCENT_HEX } from '../theme/applyAccent'
import { assertSettingsOk } from './settingsContract'
import './SettingsPage.css'

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Violet', hex: '#7c4dff' },
  { label: 'Blue', hex: '#1976d2' },
  { label: 'Green', hex: '#43a047' },
  { label: 'Coral', hex: '#ff7043' },
  { label: 'Teal', hex: '#00897b' },
]

type SettingsNavId = 'personalization' | 'remote' | 'system' | 'accounts' | 'general' | 'update' | 'resources' | 'app-engine' | 'builder' | 'extension' | 'beta'

const NAV: ReadonlyArray<{
  id: SettingsNavId
  label: string
  hint: string
  icon: string
  beta?: boolean
}> = [
  {
    id: 'personalization',
    label: 'Personalization',
    hint: 'Colors & appearance',
    icon: 'color-mode',
  },
  {
    id: 'remote',
    label: 'SSH & remote',
    hint: 'Saved connections',
    icon: 'terminal-linux',
  },
  {
    id: 'system',
    label: 'System',
    hint: 'Hosts & environment',
    icon: 'inspect',
  },
  {
    id: 'accounts',
    label: 'Connected accounts',
    hint: 'GitHub & GitLab',
    icon: 'github',
  },
  {
    id: 'general',
    label: 'General',
    hint: 'Startup, window, telemetry',
    icon: 'settings',
  },
  {
    id: 'update',
    label: 'Update',
    hint: 'Release channel & checks',
    icon: 'arrow-circle-up',
  },
  {
    id: 'resources',
    label: 'Resources',
    hint: 'Coming soon',
    icon: 'server-process',
    beta: true,
  },
  {
    id: 'app-engine',
    label: 'App Engine',
    hint: 'Coming soon',
    icon: 'server',
    beta: true,
  },
  {
    id: 'builder',
    label: 'Builder',
    hint: 'Coming soon',
    icon: 'tools',
    beta: true,
  },
  {
    id: 'extension',
    label: 'Extension',
    hint: 'Coming soon',
    icon: 'extensions',
    beta: true,
  },
  {
    id: 'beta',
    label: 'Beta Features',
    hint: 'Coming soon',
    icon: 'beaker',
    beta: true,
  },
]

function hostExecStringResult(
  res: unknown,
  fallbackError: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const h = res as { ok: boolean; result?: unknown; error?: string }
  if (h.ok && typeof h.result === 'string') return { ok: true, text: h.result }
  return { ok: false, error: h.error ?? fallbackError }
}

type ParsedEnvRow = { key: string; value: string }

function parseProcessEnvText(text: string): ParsedEnvRow[] {
  const rows: ParsedEnvRow[] = []
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    rows.push({ key, value: line.slice(idx + 1) })
  }
  return rows
}

type ParsedHostsRow =
  | { kind: 'comment'; text: string }
  | { kind: 'entry'; ip: string; hostnames: string; raw: string }

function parseHostsText(text: string): ParsedHostsRow[] {
  const out: ParsedHostsRow[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const t = line.trim()
    if (t === '') continue
    if (t.startsWith('#')) {
      out.push({ kind: 'comment', text: t })
      continue
    }
    const noComment = line.split('#')[0]?.trim() ?? ''
    const parts = noComment.split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      out.push({ kind: 'comment', text: t })
      continue
    }
    const ip = parts[0] ?? ''
    const hostnames = parts.slice(1).join(' ')
    out.push({ kind: 'entry', ip, hostnames, raw: t })
  }
  return out
}

const listShell: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--bg-input) 92%, var(--bg-panel))',
  maxHeight: 380,
  overflow: 'auto',
}

function PathSegmentList({ value }: { value: string }): ReactElement {
  const segments = value.split(':').filter(Boolean)
  const [showAll, setShowAll] = useState(false)
  const cap = 8
  const slice = showAll ? segments : segments.slice(0, cap)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, lineHeight: 1.45 }}>
        {slice.map((seg, i) => (
          <li key={i} className="mono" style={{ wordBreak: 'break-all', color: 'var(--text)' }}>
            {seg}
          </li>
        ))}
      </ul>
      {segments.length > cap ? (
        <button type="button" className="hp-btn" style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px' }} onClick={() => setShowAll(!showAll)}>
          {showAll ? `Show fewer (${cap}…)` : `Show all ${segments.length} PATH entries`}
        </button>
      ) : null}
    </div>
  )
}

function EnvValueDisplay({ envKey, value }: { envKey: string; value: string }): ReactElement {
  const [open, setOpen] = useState(false)
  if (envKey === 'PATH' && value.includes(':')) {
    return <PathSegmentList value={value} />
  }
  const long = value.length > 180
  if (!long) {
    return (
      <span className="mono" style={{ fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word', color: 'var(--text)' }}>
        {value}
      </span>
    )
  }
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: open ? 'pre-wrap' : 'normal',
          maxHeight: open ? 'none' : '4.35em',
          overflow: open ? 'visible' : 'hidden',
          color: 'var(--text)',
          maskImage: open ? 'none' : 'linear-gradient(to bottom, #000 50%, transparent)',
        }}
      >
        {value}
      </div>
      <button
        type="button"
        className="hp-btn"
        style={{ marginTop: 8, fontSize: 12, padding: '4px 12px' }}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Show less' : 'Show full value'}
      </button>
    </div>
  )
}

function AccountsSummarySection(): ReactElement {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    void window.dh
      .cloudAuthStatus()
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.accounts) {
          setAccounts([])
          if (!res.ok && res.error) setErr(res.error)
          return
        }
        setAccounts(res.accounts)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        GitHub supports device flow or a PAT; GitLab uses a personal access token only. Manage accounts on the Cloud Git
        page.
      </p>
      {loading ? (
        <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
          Loading…
        </p>
      ) : err ? (
        <div className="hp-status-alert error" style={{ fontSize: 13 }}>
          {err}
        </div>
      ) : accounts.length === 0 ? (
        <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>
          No accounts linked yet.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.65, color: 'var(--text)' }}>
          {accounts.map((a) => (
            <li key={`${a.provider}:${a.username}`}>
              <span className="mono">{a.provider}</span> — {a.username}
              <Link
                to={`/git?tab=cloud&provider=${a.provider}`}
                className="mono"
                style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}
              >
                open
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Link
          to="/git?tab=cloud&provider=github"
          className="hp-btn hp-btn-primary"
          style={{ fontSize: 13, textDecoration: 'none' }}
        >
          <span className="codicon codicon-github" aria-hidden />
          GitHub tab
        </Link>
        <Link to="/git?tab=cloud&provider=gitlab" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
          <span className="codicon codicon-source-control" aria-hidden />
          GitLab tab
        </Link>
        <Link to="/git?tab=cloud" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
          <span className="codicon codicon-arrow-right" aria-hidden />
          Manage on Cloud Git page
        </Link>
      </div>
    </div>
  )
}

/** Settings hub: personalization, remote bookmarks overview, read-only system previews. */
export function SettingsPage(): ReactElement {
  const [navId, setNavId] = useState<SettingsNavId>('personalization')

  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  // General settings
  const [generalSettings, setGeneralSettings] = useState<{ startupBehavior?: string; windowSize?: { width: number; height: number }; telemetry?: boolean }>({})
  const [generalMsg, setGeneralMsg] = useState<string | null>(null)
  const [generalBusy, setGeneralBusy] = useState(false)
  const [wizardResetMsg, setWizardResetMsg] = useState<string | null>(null)
  const [wizardResetBusy, setWizardResetBusy] = useState(false)

  // Projects home directory
  const [projectsHomeDir, setProjectsHomeDir] = useState('~/LuminaProjects')
  const [projectsHomeDirBusy, setProjectsHomeDirBusy] = useState(false)
  const [projectsHomeDirMsg, setProjectsHomeDirMsg] = useState<string | null>(null)

  // Update settings
  const [updateSettings, setUpdateSettings] = useState<{ releaseChannel: string; checkOnStartup: boolean; lastChecked?: number }>({ releaseChannel: 'stable', checkOnStartup: true })
  const [updateMsg, setUpdateMsg] = useState<string | null>(null)
  const [updateBusy, setUpdateBusy] = useState(false)

  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')

  const [hostsPreview, setHostsPreview] = useState<string | null>(null)
  const [hostsErr, setHostsErr] = useState<string | null>(null)
  const [hostsBusy, setHostsBusy] = useState(false)
  const [hostsEditing, setHostsEditing] = useState(false)
  const [hostsDraft, setHostsDraft] = useState('')
  const [hostsSaving, setHostsSaving] = useState(false)
  const [hostsSaveMsg, setHostsSaveMsg] = useState<string | null>(null)

  const [profileEnvContent, setProfileEnvContent] = useState<string | null>(null)
  const [profileEnvPath, setProfileEnvPath] = useState('')
  const [profileEnvBusy, setProfileEnvBusy] = useState(false)
  const [profileEnvErr, setProfileEnvErr] = useState<string | null>(null)
  const [profileEnvNewKey, setProfileEnvNewKey] = useState('')
  const [profileEnvNewVal, setProfileEnvNewVal] = useState('')
  const [profileEnvDiff, setProfileEnvDiff] = useState<{ key: string; value: string; action: 'set' | 'remove' } | null>(null)
  const [profileEnvSaving, setProfileEnvSaving] = useState(false)

  const [envPreview, setEnvPreview] = useState<string | null>(null)
  const [envErr, setEnvErr] = useState<string | null>(null)
  const [envBusy, setEnvBusy] = useState(false)

  const [envFilter, setEnvFilter] = useState('')
  const [hostsFilter, setHostsFilter] = useState('')

  const parsedEnvRows = useMemo(() => (envPreview ? parseProcessEnvText(envPreview) : []), [envPreview])
  const parsedHostsRows = useMemo(() => (hostsPreview ? parseHostsText(hostsPreview) : []), [hostsPreview])

  const filteredEnvRows = useMemo(() => {
    const q = envFilter.trim().toLowerCase()
    if (!q) return parsedEnvRows
    return parsedEnvRows.filter((r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q))
  }, [parsedEnvRows, envFilter])

  const filteredHostsRows = useMemo(() => {
    const q = hostsFilter.trim().toLowerCase()
    if (!q) return parsedHostsRows
    return parsedHostsRows.filter((row) => {
      if (row.kind === 'comment') return row.text.toLowerCase().includes(q)
      return (
        row.ip.toLowerCase().includes(q) ||
        row.hostnames.toLowerCase().includes(q) ||
        row.raw.toLowerCase().includes(q)
      )
    })
  }, [parsedHostsRows, hostsFilter])

  useEffect(() => {
    void (async () => {
      setLoadError(null)
      setAccentMsg(null)
      setHostsErr(null)
      setEnvErr(null)
      setHostsBusy(true)
      setEnvBusy(true)
      try {
        const [bm, ap, hr, er, gs, us, phd] = await Promise.all([
          window.dh.storeGet({ key: 'ssh_bookmarks' }),
          window.dh.storeGet({ key: 'appearance' }),
          window.dh.hostExec({ command: 'settings_read_hosts' }),
          window.dh.hostExec({ command: 'settings_process_env' }),
          window.dh.storeGet({ key: 'general_settings' }),
          window.dh.storeGet({ key: 'update_settings' }),
          window.dh.storeGet({ key: 'projects_home_dir' }),
        ])
        if (bm.ok) {
          setBookmarks(parseSshBookmarks(bm.data))
        } else {
          setBookmarks([])
          setLoadError(bm.error ?? 'Could not read ssh_bookmarks.')
        }
        if (ap.ok) {
          const parsed = parseAppearance(ap.data)
          setAccentDraft(parsed.accent ?? DEFAULT_ACCENT_HEX)
          setThemeMode(parsed.theme ?? 'dark')
        } else {
          setAccentDraft(DEFAULT_ACCENT_HEX)
        }
        const hostsParsed = hostExecStringResult(hr, 'Could not read /etc/hosts.')
        if (hostsParsed.ok) {
          setHostsPreview(hostsParsed.text)
          setHostsErr(null)
        } else {
          setHostsPreview(null)
          setHostsErr(hostsParsed.error)
        }
        const envParsed = hostExecStringResult(er, 'Could not load environment preview.')
        if (envParsed.ok) {
          setEnvPreview(envParsed.text)
          setEnvErr(null)
        } else {
          setEnvPreview(null)
          setEnvErr(envParsed.error)
        }
        if (gs.ok && gs.data && typeof gs.data === 'object') {
          setGeneralSettings(gs.data as typeof generalSettings)
        } else {
          setGeneralSettings({})
        }
        if (us.ok && us.data && typeof us.data === 'object') {
          setUpdateSettings(us.data as typeof updateSettings)
        } else {
          setUpdateSettings({ releaseChannel: 'stable', checkOnStartup: true })
        }
        const phdResult = phd as { ok: boolean; data?: unknown }
        if (phdResult.ok && typeof phdResult.data === 'string' && phdResult.data.trim()) {
          setProjectsHomeDir(phdResult.data.trim())
        }
      } catch (e) {
        setBookmarks([])
        setLoadError(e instanceof Error ? e.message : 'Failed to load settings.')
        setAccentDraft(DEFAULT_ACCENT_HEX)
        setHostsPreview(null)
        setHostsErr(e instanceof Error ? e.message : 'Could not read /etc/hosts.')
        setEnvPreview(null)
        setEnvErr(e instanceof Error ? e.message : 'Could not load environment preview.')
      } finally {
        setHostsBusy(false)
        setEnvBusy(false)
      }
    })()
  }, [])

  async function refreshHosts(): Promise<void> {
    setHostsBusy(true)
    setHostsErr(null)
    try {
      const hr = await window.dh.hostExec({ command: 'settings_read_hosts' })
      const parsed = hostExecStringResult(hr, 'Could not read /etc/hosts.')
      if (parsed.ok) {
        setHostsPreview(parsed.text)
        setHostsErr(null)
      } else {
        setHostsPreview(null)
        setHostsErr(parsed.error)
      }
    } catch (e) {
      setHostsPreview(null)
      setHostsErr(e instanceof Error ? e.message : 'Could not read /etc/hosts.')
    } finally {
      setHostsBusy(false)
    }
  }

  async function refreshEnv(): Promise<void> {
    setEnvBusy(true)
    setEnvErr(null)
    try {
      const er = await window.dh.hostExec({ command: 'settings_process_env' })
      const parsed = hostExecStringResult(er, 'Could not load environment preview.')
      if (parsed.ok) {
        setEnvPreview(parsed.text)
        setEnvErr(null)
      } else {
        setEnvPreview(null)
        setEnvErr(parsed.error)
      }
    } catch (e) {
      setEnvPreview(null)
      setEnvErr(e instanceof Error ? e.message : 'Could not load environment preview.')
    } finally {
      setEnvBusy(false)
    }
  }

  async function saveHosts(): Promise<void> {
    setHostsSaving(true)
    setHostsSaveMsg(null)
    try {
      const res = await window.dh.hostExec({ command: 'settings_write_hosts', content: hostsDraft })
      if ((res as { ok: boolean }).ok) {
        setHostsSaveMsg('Saved.')
        setHostsPreview(hostsDraft)
        setHostsEditing(false)
      } else {
        setHostsSaveMsg((res as { error?: string }).error ?? 'Save failed.')
      }
    } catch (e) {
      setHostsSaveMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setHostsSaving(false)
    }
  }

  async function loadProfileEnv(): Promise<void> {
    setProfileEnvBusy(true)
    setProfileEnvErr(null)
    try {
      const res = await window.dh.hostExec({ command: 'settings_read_profile_env' }) as { ok: boolean; result?: string; path?: string; error?: string }
      if (res.ok) {
        setProfileEnvContent(res.result ?? '')
        setProfileEnvPath(res.path ?? '~/.profile')
      } else {
        setProfileEnvErr(res.error ?? 'Failed to read profile.')
      }
    } catch (e) {
      setProfileEnvErr(e instanceof Error ? e.message : 'Failed to read profile.')
    } finally {
      setProfileEnvBusy(false)
    }
  }

  async function applyProfileEnvDiff(): Promise<void> {
    if (!profileEnvDiff) return
    setProfileEnvSaving(true)
    try {
      const res = await window.dh.hostExec({
        command: 'settings_write_profile_env',
        action: profileEnvDiff.action,
        key: profileEnvDiff.key,
        value: profileEnvDiff.value,
      }) as { ok: boolean; error?: string }
      if (res.ok) {
        setProfileEnvDiff(null)
        setProfileEnvNewKey('')
        setProfileEnvNewVal('')
        await loadProfileEnv()
      } else {
        setProfileEnvErr(res.error ?? 'Write failed.')
        setProfileEnvDiff(null)
      }
    } catch (e) {
      setProfileEnvErr(e instanceof Error ? e.message : 'Write failed.')
    } finally {
      setProfileEnvSaving(false)
    }
  }

  async function saveGeneralSettings(): Promise<void> {
    setGeneralBusy(true)
    setGeneralMsg(null)
    try {
      const data = {
        startupBehavior: generalSettings.startupBehavior as 'default' | 'minimized' | undefined,
        windowSize: generalSettings.windowSize,
        telemetry: generalSettings.telemetry,
      }
      const res = await window.dh.storeSet({ key: 'general_settings', data })
      assertSettingsOk(res)
      setGeneralMsg('Saved.')
      setTimeout(() => setGeneralMsg(null), 3000)
    } catch (e) {
      setGeneralMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setGeneralBusy(false)
    }
  }

  async function saveUpdateSettings(): Promise<void> {
    setUpdateBusy(true)
    setUpdateMsg(null)
    try {
      const data = {
        releaseChannel: updateSettings.releaseChannel as 'stable' | 'alpha',
        checkOnStartup: updateSettings.checkOnStartup,
        lastChecked: Date.now(),
      }
      const res = await window.dh.storeSet({ key: 'update_settings', data })
      assertSettingsOk(res)
      setUpdateSettings(data)
      setUpdateMsg('Saved.')
      setTimeout(() => setUpdateMsg(null), 3000)
    } catch (e) {
      setUpdateMsg(e instanceof Error ? e.message : 'Save failed.')
    } finally {
      setUpdateBusy(false)
    }
  }

  const parsedProfileExports = useMemo(() => {
    if (!profileEnvContent) return []
    return profileEnvContent.split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('export '))
          .map((l) => {
            const rest = l.slice('export '.length)
            const eq = rest.indexOf('=')
            if (eq < 0) return null
            return { key: rest.slice(0, eq), value: rest.slice(eq + 1).replace(/^["']|["']$/g, '') }
          })
          .filter(Boolean) as { key: string; value: string }[]
  }, [profileEnvContent])

  async function saveAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({
        key: 'appearance',
        data: { accent: accentDraft, theme: themeMode },
      })
      if (!res.ok) {
        setAccentMsg(res.error ?? 'Could not save appearance.')
        return
      }
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
      if (!res.ok) {
        setAccentMsg(res.error ?? 'Could not reset appearance.')
        return
      }
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

  const activeNav = NAV.find((n) => n.id === navId) ?? NAV[0]

  return (
    <div className="settings-page elevated-page" style={{ padding: '28px 32px 48px', maxWidth: 1040 }}>
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
          Settings
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Personalize Linux Dev Home, review saved SSH targets, see linked cloud Git providers, and inspect read-only
          system context when something behaves differently in Flatpak or native installs.
        </p>
      </header>

      <div
        className="settings-layout-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)',
          gap: 32,
          alignItems: 'start',
        }}
      >
        <nav
          aria-label="Settings categories"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            position: 'sticky',
            top: 12,
          }}
        >
          {NAV.map((item) => {
            const active = item.id === navId
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setNavId(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  textAlign: 'left',
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: active ? 'color-mix(in srgb, var(--accent) 45%, var(--border))' : 'transparent',
                  background: active
                    ? 'color-mix(in srgb, var(--accent) 14%, var(--bg-widget))'
                    : 'color-mix(in srgb, var(--bg-widget) 88%, transparent)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  boxShadow: active ? '0 1px 0 rgba(255,255,255,0.04)' : 'none',
                }}
              >
                <span
                  className={`codicon codicon-${item.icon}`}
                  style={{
                    fontSize: 20,
                    marginTop: 2,
                    opacity: active ? 1 : 0.85,
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                  aria-hidden
                />
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
              <h2 className="hp-card-title" style={{ fontSize: 16 }}>
                {activeNav.label}
              </h2>
              <p className="hp-card-subtitle" style={{ fontSize: 13 }}>
                {activeNav.id === 'personalization' &&
                  'Choose an accent color for links, highlights, and focus across the app. Save to keep it after restart.'}
                {activeNav.id === 'remote' &&
                  'These entries are the same as on the SSH page. Open there to add, edit, or connect.'}
                {activeNav.id === 'system' &&
                  'Read-only diagnostics: hosts file and a small set of process environment variables (no profile editing yet).'}
                {activeNav.id === 'accounts' &&
                  'Overview of accounts stored for GitHub and GitLab. Manage tokens on the Cloud Git page (GitHub device flow or PAT; GitLab PAT).'}
              </p>
            </div>

            {navId === 'personalization' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Theme toggle */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Color theme</div>
                    <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>Choose between a dark or light interface.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['dark', 'light'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setThemeMode(t); applyTheme(t) }}
                        style={{
                          padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                          border: themeMode === t ? '2px solid var(--accent)' : '1px solid var(--border)',
                          background: themeMode === t ? 'var(--accent-dim)' : 'var(--bg-input)',
                          color: themeMode === t ? 'var(--accent)' : 'var(--text)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span className={`codicon codicon-${t === 'dark' ? 'moon' : 'sun'}`} style={{ marginRight: 6 }} aria-hidden />
                        {t === 'dark' ? 'Dark' : 'Light'}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '14px 0',
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Accent color</div>
                    <p className="hp-muted" style={{ margin: 0, maxWidth: 360 }}>
                      Controls the global <span className="mono">--accent</span> design token.
                    </p>
                  </div>
                  <div className="hp-row-wrap" style={{ gap: 10 }}>
                    {ACCENT_PRESETS.map((p) => (
                      <button
                        key={p.hex}
                        type="button"
                        title={p.label}
                        onClick={() => setAccentDraft(p.hex)}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          border:
                            accentDraft.toLowerCase() === p.hex
                              ? '2px solid var(--text)'
                              : '1px solid var(--border)',
                          background: p.hex,
                          cursor: 'pointer',
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
                        }}
                      />
                    ))}
                    <label
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 10,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                        paddingLeft: 4,
                      }}
                    >
                      Custom
                      <input
                        type="color"
                        value={accentDraft}
                        onChange={(ev) => setAccentDraft(ev.target.value)}
                        style={{
                          width: 44,
                          height: 40,
                          padding: 0,
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          cursor: 'pointer',
                          background: 'var(--bg-input)',
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="hp-row-wrap">
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    disabled={accentBusy}
                    onClick={() => void saveAccent()}
                  >
                    Save
                  </button>
                  <button type="button" className="hp-btn" disabled={accentBusy} onClick={() => void resetAccent()}>
                    Reset to default
                  </button>
                </div>
                {accentMsg ? (
                  <div
                    className={`hp-status-alert ${
                      accentMsg.toLowerCase().includes('could not') || accentMsg.toLowerCase().includes('failed')
                        ? 'error'
                        : 'success'
                    }`}
                    style={{ marginTop: 4 }}
                  >
                    {accentMsg}
                  </div>
                ) : null}
              </div>
            ) : null}

            {navId === 'remote' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="hp-row-wrap" style={{ justifyContent: 'space-between' }}>
                  <span className="hp-muted" style={{ fontSize: 13 }}>
                    {bookmarks.length === 1 ? '1 saved bookmark' : `${bookmarks.length} saved bookmarks`}
                  </span>
                  <Link to="/ssh" className="hp-btn hp-btn-primary" style={{ textDecoration: 'none' }}>
                    <span className="codicon codicon-arrow-right" aria-hidden />
                    Manage on SSH page
                  </Link>
                </div>
                {loadError ? <div className="hp-status-alert error">{loadError}</div> : null}
                {bookmarks.length === 0 && !loadError ? (
                  <p className="hp-muted" style={{ margin: 0 }}>
                    No bookmarks yet. Add one on the SSH page — it will show up here automatically.
                  </p>
                ) : null}
                {bookmarks.length > 0 ? (
                  <div className="hp-table-wrap">
                    <table className="hp-table">
                      <thead>
                        <tr>
                          <th className="hp-table-cell hp-table-head">Name</th>
                          <th className="hp-table-cell hp-table-head">Target</th>
                          <th className="hp-table-cell hp-table-head" style={{ width: 72 }}>
                            Port
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {bookmarks.map((b) => (
                          <tr key={b.id} className="hp-table-row">
                            <td className="hp-table-cell" style={{ fontWeight: 600 }}>
                              {b.name}
                            </td>
                            <td className="hp-table-cell mono" style={{ fontFamily: 'var(--font-mono)' }}>
                              {b.user}@{b.host}
                            </td>
                            <td className="hp-table-cell">{b.port}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {navId === 'system' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                <section>
                  <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>Hosts file</div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
                        Parsed into address and names. Flatpak may show the sandbox copy, not the host.
                      </p>
                    </div>
                    <button type="button" className="hp-btn" disabled={hostsBusy} onClick={() => void refreshHosts()}>
                      <span className="codicon codicon-refresh" aria-hidden />
                      Refresh
                    </button>
                  </div>
                  {hostsPreview !== null && parsedHostsRows.length > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <div className="hp-row" style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                        <span
                          className="codicon codicon-search"
                          style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                            pointerEvents: 'none',
                          }}
                          aria-hidden
                        />
                        <input
                          type="search"
                          className="hp-input"
                          placeholder="Filter lines…"
                          value={hostsFilter}
                          onChange={(e) => setHostsFilter(e.target.value)}
                          aria-label="Filter hosts lines"
                          style={{ paddingLeft: 36, width: '100%' }}
                        />
                      </div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                        Showing {filteredHostsRows.length} of {parsedHostsRows.length} lines
                      </p>
                    </div>
                  ) : null}
                  {hostsErr ? <div className="hp-status-alert error">{hostsErr}</div> : null}
                  {hostsBusy && hostsPreview === null && !hostsErr ? (
                    <p className="hp-muted" style={{ marginTop: 12 }}>
                      Loading…
                    </p>
                  ) : null}
                  {hostsPreview !== null && parsedHostsRows.length === 0 && !hostsErr ? (
                    <pre
                      className="mono"
                      style={{
                        marginTop: 12,
                        padding: 14,
                        fontSize: 12,
                        lineHeight: 1.5,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {hostsPreview}
                    </pre>
                  ) : null}
                  {hostsPreview !== null && parsedHostsRows.length > 0 && filteredHostsRows.length === 0 && !hostsErr ? (
                    <p className="hp-muted">No lines match the filter.</p>
                  ) : null}
                  {hostsPreview !== null && filteredHostsRows.length > 0 ? (
                    <div style={listShell}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-widget)', zIndex: 1 }}>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 14px',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                width: 148,
                              }}
                            >
                              Address
                            </th>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 14px',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                              }}
                            >
                              Host names
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredHostsRows.map((row, i) =>
                            row.kind === 'comment' ? (
                              <tr
                                key={`c-${i}-${row.text.slice(0, 32)}`}
                                style={{
                                  background: 'color-mix(in srgb, var(--text-muted) 6%, transparent)',
                                }}
                              >
                                <td
                                  colSpan={2}
                                  style={{
                                    padding: '8px 14px',
                                    fontSize: 12,
                                    color: 'var(--text-muted)',
                                    fontStyle: 'italic',
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {row.text}
                                </td>
                              </tr>
                            ) : (
                              <tr
                                key={`e-${i}-${row.ip}-${row.hostnames.slice(0, 20)}`}
                                style={{
                                  borderTop: '1px solid var(--border)',
                                  background:
                                    i % 2 === 0
                                      ? 'transparent'
                                      : 'color-mix(in srgb, var(--accent) 4%, transparent)',
                                }}
                              >
                                <td
                                  className="mono"
                                  style={{
                                    padding: '10px 14px',
                                    verticalAlign: 'top',
                                    color: 'var(--accent)',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {row.ip}
                                </td>
                                <td style={{ padding: '10px 14px', verticalAlign: 'top', wordBreak: 'break-word' }}>
                                  {row.hostnames}
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>

                <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>Environment</div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
                        Variables as a searchable list. PATH is split into directories so it is easier to scan.
                      </p>
                    </div>
                    <button type="button" className="hp-btn" disabled={envBusy} onClick={() => void refreshEnv()}>
                      <span className="codicon codicon-refresh" aria-hidden />
                      Refresh
                    </button>
                  </div>
                  {envPreview !== null && parsedEnvRows.length > 0 ? (
                    <div style={{ marginBottom: 10 }}>
                      <div className="hp-row" style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
                        <span
                          className="codicon codicon-search"
                          style={{
                            position: 'absolute',
                            left: 12,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                            pointerEvents: 'none',
                          }}
                          aria-hidden
                        />
                        <input
                          type="search"
                          className="hp-input"
                          placeholder="Filter by name or value…"
                          value={envFilter}
                          onChange={(e) => setEnvFilter(e.target.value)}
                          aria-label="Filter environment variables"
                          style={{ paddingLeft: 36, width: '100%' }}
                        />
                      </div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
                        Showing {filteredEnvRows.length} of {parsedEnvRows.length} variables
                      </p>
                    </div>
                  ) : null}
                  {envErr ? <div className="hp-status-alert error">{envErr}</div> : null}
                  {envBusy && envPreview === null && !envErr ? (
                    <p className="hp-muted" style={{ marginTop: 12 }}>
                      Loading…
                    </p>
                  ) : null}
                  {envPreview !== null && parsedEnvRows.length === 0 && !envErr ? (
                    <p className="hp-muted mono" style={{ fontSize: 12, lineHeight: 1.5 }}>
                      {envPreview}
                    </p>
                  ) : null}
                  {envPreview !== null && parsedEnvRows.length > 0 && filteredEnvRows.length === 0 && !envErr ? (
                    <p className="hp-muted">No variables match the filter.</p>
                  ) : null}
                  {envPreview !== null && filteredEnvRows.length > 0 ? (
                    <div style={listShell}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-widget)', zIndex: 1 }}>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 14px',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                width: 200,
                              }}
                            >
                              Name
                            </th>
                            <th
                              style={{
                                textAlign: 'left',
                                padding: '10px 14px',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                              }}
                            >
                              Value
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEnvRows.map((row, i) => (
                            <tr
                              key={`${row.key}-${i}`}
                              style={{
                                borderTop: '1px solid var(--border)',
                                background:
                                  i % 2 === 0
                                    ? 'transparent'
                                    : 'color-mix(in srgb, var(--accent) 4%, transparent)',
                              }}
                            >
                              <td
                                style={{
                                  padding: '12px 14px',
                                  verticalAlign: 'top',
                                  fontWeight: 650,
                                  color: 'var(--text)',
                                  fontSize: 13,
                                }}
                              >
                                {row.key}
                              </td>
                              <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                <EnvValueDisplay envKey={row.key} value={row.value} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>
              </div>
            ) : null}

            {navId === 'accounts' ? <AccountsSummarySection /> : null}

            {/* General Tab */}
            {navId === 'general' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Startup behavior</div>
                  <select
                    value={(generalSettings.startupBehavior ?? 'default') as string}
                    onChange={(e) => setGeneralSettings((prev) => ({ ...prev, startupBehavior: e.target.value as 'default' | 'minimized' }))}
                    className="hp-input"
                    style={{ fontSize: 13 }}
                  >
                    <option value="default">Default (show app window)</option>
                    <option value="minimized">Minimized (start in background)</option>
                  </select>
                </div>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Telemetry</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={generalSettings.telemetry ?? false}
                      onChange={(e) => setGeneralSettings((prev) => ({ ...prev, telemetry: e.target.checked }))}
                    />
                    <span style={{ fontSize: 13 }}>Send usage data to help improve LuminaDev</span>
                  </label>
                </div>
                <div style={{ paddingTop: 8 }}>
                  <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveGeneralSettings()} disabled={generalBusy} style={{ fontSize: 13, padding: '8px 16px' }}>
                    {generalBusy ? 'Saving…' : 'Save'}
                  </button>
                  {generalMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: generalMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{generalMsg}</p> : null}
                </div>

                {/* Projects Home Directory */}
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Projects Home Directory</div>
                  <p className="hp-muted" style={{ margin: '0 0 10px', fontSize: 13 }}>
                    Where new projects are scaffolded. Set during setup wizard — change here any time.
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      className="hp-input"
                      style={{ fontSize: 13, flex: 1, minWidth: 200 }}
                      value={projectsHomeDir}
                      onChange={(e) => setProjectsHomeDir(e.target.value)}
                      placeholder="~/LuminaProjects"
                    />
                    <button
                      type="button"
                      className="hp-btn"
                      style={{ fontSize: 13, padding: '8px 12px' }}
                      title="Browse for folder"
                      onClick={() => {
                        void window.dh.selectFolder().then((p) => {
                          if (p) setProjectsHomeDir(p)
                        })
                      }}
                    >
                      <span className="codicon codicon-folder-open" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="hp-btn hp-btn-primary"
                      style={{ fontSize: 13, padding: '8px 16px' }}
                      disabled={projectsHomeDirBusy || !projectsHomeDir.trim()}
                      onClick={() => {
                        setProjectsHomeDirBusy(true)
                        setProjectsHomeDirMsg(null)
                        void window.dh.storeSet({ key: 'projects_home_dir', data: projectsHomeDir.trim() })
                          .then(() => { setProjectsHomeDirMsg('Saved.') })
                          .catch((e: unknown) => { setProjectsHomeDirMsg(e instanceof Error ? e.message : 'Save failed.') })
                          .finally(() => {
                            setProjectsHomeDirBusy(false)
                            setTimeout(() => setProjectsHomeDirMsg(null), 3000)
                          })
                      }}
                    >
                      {projectsHomeDirBusy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {projectsHomeDirMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: projectsHomeDirMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{projectsHomeDirMsg}</p> : null}
                </div>

                {/* Danger Zone */}
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: 'var(--red)' }}>Danger Zone</div>
                  <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                    Reset the setup wizard so it runs again on next app launch. Useful if you changed your system configuration or want to reconfigure Git identity and profile preferences.
                  </p>
                  <button
                    type="button"
                    className="hp-btn"
                    style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--red)', color: 'var(--red)' }}
                    disabled={wizardResetBusy}
                    onClick={() => {
                      setWizardResetBusy(true)
                      setWizardResetMsg(null)
                      void window.dh.storeSet({ key: 'readiness_wizard_complete', data: false }).then(() => {
                        setWizardResetMsg('Setup wizard will run on next launch.')
                      }).catch((e: unknown) => {
                        setWizardResetMsg(e instanceof Error ? e.message : 'Failed to reset wizard.')
                      }).finally(() => {
                        setWizardResetBusy(false)
                      })
                    }}
                  >
                    <span className="codicon codicon-refresh" aria-hidden />
                    {wizardResetBusy ? 'Resetting…' : 'Run Setup Wizard Again'}
                  </button>
                  {wizardResetMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{wizardResetMsg}</p> : null}
                </div>
              </div>
            ) : null}

            {/* Update Tab */}
            {navId === 'update' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ paddingTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Release channel</div>
                  <select
                    value={updateSettings.releaseChannel ?? 'stable'}
                    onChange={(e) => setUpdateSettings((prev) => ({ ...prev, releaseChannel: e.target.value as 'stable' | 'alpha' }))}
                    className="hp-input"
                    style={{ fontSize: 13 }}
                  >
                    <option value="stable">Stable (recommended)</option>
                    <option value="alpha">Alpha (early features, frequent updates)</option>
                  </select>
                </div>
                <div style={{ paddingTop: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={updateSettings.checkOnStartup ?? true}
                      onChange={(e) => setUpdateSettings((prev) => ({ ...prev, checkOnStartup: e.target.checked }))}
                    />
                    <span style={{ fontSize: 13 }}>Check for updates on app startup</span>
                  </label>
                </div>
                <div style={{ paddingTop: 8 }}>
                  {updateSettings.lastChecked ? <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Last checked: {new Date(updateSettings.lastChecked).toLocaleDateString()}</p> : <p className="hp-muted" style={{ margin: 0, fontSize: 12 }}>Never checked</p>}
                </div>
                <div style={{ paddingTop: 8 }}>
                  <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveUpdateSettings()} disabled={updateBusy} style={{ fontSize: 13, padding: '8px 16px' }}>
                    {updateBusy ? 'Saving…' : 'Save'}
                  </button>
                  {updateMsg ? <p style={{ margin: '8px 0 0', fontSize: 12, color: updateMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{updateMsg}</p> : null}
                </div>
              </div>
            ) : null}

            {/* Placeholder Tabs */}
            {(navId === 'resources' || navId === 'app-engine' || navId === 'builder' || navId === 'extension' || navId === 'beta') ? (
              <div style={{ paddingTop: 12, textAlign: 'center' }}>
                <span className="codicon codicon-beaker" style={{ fontSize: 32, opacity: 0.4, marginBottom: 12, display: 'block' }} />
                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Coming in a future release</p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 320 }}>
                  See the <Link to="/settings" style={{ color: 'var(--accent)' }}>roadmap</Link> for planned features and timeline.
                </p>
              </div>
            ) : null}
          </div>

          {navId === 'system' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28, marginTop: 28 }}>
              {/* Hosts Editor */}
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 14 }}>/etc/hosts editor</div>
                    <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520, fontSize: 13 }}>
                      Edit requires sudo. Changes take effect immediately.
                    </p>
                  </div>
                  {!hostsEditing ? (
                    <button
                      type="button"
                      className="hp-btn"
                      disabled={hostsBusy}
                      onClick={() => {
                        setHostsDraft(hostsPreview ?? '')
                        setHostsSaveMsg(null)
                        setHostsEditing(true)
                      }}
                    >
                      <span className="codicon codicon-edit" aria-hidden /> Edit
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="hp-btn" onClick={() => setHostsEditing(false)} disabled={hostsSaving}>Cancel</button>
                      <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveHosts()} disabled={hostsSaving}>
                        {hostsSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
                {hostsEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      value={hostsDraft}
                      onChange={(e) => setHostsDraft(e.target.value)}
                      rows={14}
                      className="mono"
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                        borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--bg-input)', color: 'var(--text)', fontSize: 12,
                        resize: 'vertical', fontFamily: 'monospace',
                      }}
                    />
                    {hostsSaveMsg ? (
                      <p style={{ margin: 0, fontSize: 12, color: hostsSaveMsg === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{hostsSaveMsg}</p>
                    ) : null}
                  </div>
                ) : null}
              </section>

              {/* Profile-scoped env */}
              <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 650, fontSize: 14 }}>Profile environment ({profileEnvPath || '~/.profile'})</div>
                    <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520, fontSize: 13 }}>
                      Add or remove <span className="mono">export KEY=VALUE</span> lines. Changes apply on next login/shell.
                    </p>
                  </div>
                  <button type="button" className="hp-btn" disabled={profileEnvBusy} onClick={() => void loadProfileEnv()}>
                    <span className="codicon codicon-refresh" aria-hidden /> {profileEnvContent === null ? 'Load' : 'Refresh'}
                  </button>
                </div>
                {profileEnvErr ? <div className="hp-status-alert error" style={{ marginBottom: 10 }}>{profileEnvErr}</div> : null}
                {profileEnvContent !== null ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {parsedProfileExports.length > 0 ? (
                      <div style={listShell}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <tbody>
                            {parsedProfileExports.map((row) => (
                              <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '10px 14px', fontWeight: 650, width: 180 }} className="mono">{row.key}</td>
                                <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }} className="mono">{row.value}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="hp-btn"
                                    style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red)' }}
                                    onClick={() => setProfileEnvDiff({ key: row.key, value: row.value, action: 'remove' })}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="hp-muted" style={{ fontSize: 13 }}>No export lines found in {profileEnvPath}.</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="mono hp-input"
                        placeholder="KEY"
                        value={profileEnvNewKey}
                        onChange={(e) => setProfileEnvNewKey(e.target.value)}
                        style={{ width: 140, fontSize: 12 }}
                      />
                      <span style={{ color: 'var(--text-muted)' }}>=</span>
                      <input
                        type="text"
                        className="hp-input"
                        placeholder="value"
                        value={profileEnvNewVal}
                        onChange={(e) => setProfileEnvNewVal(e.target.value)}
                        style={{ flex: '1 1 160px', fontSize: 12 }}
                      />
                      <button
                        type="button"
                        className="hp-btn hp-btn-primary"
                        style={{ fontSize: 12 }}
                        disabled={!profileEnvNewKey.trim()}
                        onClick={() => setProfileEnvDiff({ key: profileEnvNewKey.trim(), value: profileEnvNewVal, action: 'set' })}
                      >
                        Add / Update
                      </button>
                    </div>
                  </div>
                ) : null}
                {/* Diff confirmation modal */}
                {profileEnvDiff ? (
                  <div style={{
                    marginTop: 12, padding: '14px 16px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'rgba(124,77,255,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Preview change</div>
                    <pre className="mono" style={{ margin: 0, fontSize: 12, color: profileEnvDiff.action === 'remove' ? 'var(--red)' : 'var(--green)' }}>
                      {profileEnvDiff.action === 'remove'
                        ? `- export ${profileEnvDiff.key}=...`
                        : `+ export ${profileEnvDiff.key}=${profileEnvDiff.value}`}
                    </pre>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="hp-btn" onClick={() => setProfileEnvDiff(null)} disabled={profileEnvSaving}>Cancel</button>
                      <button type="button" className="hp-btn hp-btn-primary" onClick={() => void applyProfileEnvDiff()} disabled={profileEnvSaving}>
                        {profileEnvSaving ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
