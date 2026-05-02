import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseAppearance, parseSshBookmarks } from '@linux-dev-home/shared'

import { applyAppearanceAccent, DEFAULT_ACCENT_HEX } from '../theme/applyAccent'

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Violet', hex: '#7c4dff' },
  { label: 'Blue', hex: '#1976d2' },
  { label: 'Green', hex: '#43a047' },
  { label: 'Coral', hex: '#ff7043' },
  { label: 'Teal', hex: '#00897b' },
]

type SettingsNavId = 'personalization' | 'remote' | 'system'

const NAV: ReadonlyArray<{
  id: SettingsNavId
  label: string
  hint: string
  /** Codicon suffix only, e.g. `color-mode` → `codicon codicon-color-mode` */
  icon: string
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
]

function hostExecStringResult(
  res: unknown,
  fallbackError: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const h = res as { ok: boolean; result?: unknown; error?: string }
  if (h.ok && typeof h.result === 'string') return { ok: true, text: h.result }
  return { ok: false, error: h.error ?? fallbackError }
}

const codeBox: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 0,
  padding: 14,
  maxHeight: 320,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.5,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'var(--font-mono)',
}

/** Settings hub: personalization, remote bookmarks overview, read-only system previews. */
export function SettingsPage(): ReactElement {
  const [navId, setNavId] = useState<SettingsNavId>('personalization')

  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)

  const [hostsPreview, setHostsPreview] = useState<string | null>(null)
  const [hostsErr, setHostsErr] = useState<string | null>(null)
  const [hostsBusy, setHostsBusy] = useState(false)

  const [envPreview, setEnvPreview] = useState<string | null>(null)
  const [envErr, setEnvErr] = useState<string | null>(null)
  const [envBusy, setEnvBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      setLoadError(null)
      setAccentMsg(null)
      setHostsErr(null)
      setEnvErr(null)
      setHostsBusy(true)
      setEnvBusy(true)
      try {
        const [bm, ap, hr, er] = await Promise.all([
          window.dh.storeGet({ key: 'ssh_bookmarks' }),
          window.dh.storeGet({ key: 'appearance' }),
          window.dh.hostExec({ command: 'settings_read_hosts' }),
          window.dh.hostExec({ command: 'settings_process_env' }),
        ])
        if (bm.ok) {
          setBookmarks(parseSshBookmarks(bm.data))
        } else {
          setBookmarks([])
          setLoadError(bm.error ?? 'Could not read ssh_bookmarks.')
        }
        if (ap.ok) {
          const hex = parseAppearance(ap.data).accent
          setAccentDraft(hex ?? DEFAULT_ACCENT_HEX)
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

  async function saveAccent(): Promise<void> {
    setAccentBusy(true)
    setAccentMsg(null)
    try {
      const res = await window.dh.storeSet({
        key: 'appearance',
        data: { accent: accentDraft },
      })
      if (!res.ok) {
        setAccentMsg(res.error ?? 'Could not save appearance.')
        return
      }
      applyAppearanceAccent(accentDraft)
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
      const res = await window.dh.storeSet({ key: 'appearance', data: {} })
      if (!res.ok) {
        setAccentMsg(res.error ?? 'Could not reset appearance.')
        return
      }
      setAccentDraft(DEFAULT_ACCENT_HEX)
      applyAppearanceAccent(undefined)
      setAccentMsg('Restored default accent.')
    } catch (e) {
      setAccentMsg(e instanceof Error ? e.message : 'Reset failed.')
    } finally {
      setAccentBusy(false)
    }
  }

  const activeNav = NAV.find((n) => n.id === navId) ?? NAV[0]

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 32px 48px',
        maxWidth: 1040,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
          Settings
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Personalize Linux Dev Home, review saved SSH targets, and inspect read-only system context when something
          behaves differently in Flatpak or native installs.
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
              </p>
            </div>

            {navId === 'personalization' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                  <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>Hosts file</div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
                        Read-only view of <span className="mono">/etc/hosts</span>. In Flatpak you may see the sandbox
                        copy, not the host.
                      </p>
                    </div>
                    <button type="button" className="hp-btn" disabled={hostsBusy} onClick={() => void refreshHosts()}>
                      <span className="codicon codicon-refresh" aria-hidden />
                      Refresh
                    </button>
                  </div>
                  {hostsErr ? <div className="hp-status-alert error">{hostsErr}</div> : null}
                  {hostsBusy && hostsPreview === null && !hostsErr ? (
                    <p className="hp-muted" style={{ marginTop: 12 }}>
                      Loading…
                    </p>
                  ) : null}
                  {hostsPreview !== null ? <pre style={codeBox}>{hostsPreview}</pre> : null}
                </section>

                <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                  <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 650, fontSize: 14 }}>Environment</div>
                      <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
                        Allowlisted variables from this app process (not a login shell). Useful for PATH and Flatpak
                        detection.
                      </p>
                    </div>
                    <button type="button" className="hp-btn" disabled={envBusy} onClick={() => void refreshEnv()}>
                      <span className="codicon codicon-refresh" aria-hidden />
                      Refresh
                    </button>
                  </div>
                  {envErr ? <div className="hp-status-alert error">{envErr}</div> : null}
                  {envBusy && envPreview === null && !envErr ? (
                    <p className="hp-muted" style={{ marginTop: 12 }}>
                      Loading…
                    </p>
                  ) : null}
                  {envPreview !== null ? <pre style={codeBox}>{envPreview}</pre> : null}
                </section>
              </div>
            ) : null}
          </div>

          <p className="hp-muted" style={{ marginTop: 18, fontSize: 12, textAlign: 'right' }}>
            Profile-scoped env files and hosts editing are not available yet.
          </p>
        </main>
      </div>
    </div>
  )
}
