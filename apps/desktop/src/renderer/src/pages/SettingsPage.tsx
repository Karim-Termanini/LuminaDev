import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseAppearance, parseSshBookmarks } from '@linux-dev-home/shared'

import { applyAppearanceAccent, DEFAULT_ACCENT_HEX } from '../theme/applyAccent'

const panel: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  background: 'var(--bg-panel)',
}

const muted: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 14,
  lineHeight: 1.55,
}

const ACCENT_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Violet', hex: '#7c4dff' },
  { label: 'Blue', hex: '#1976d2' },
  { label: 'Green', hex: '#43a047' },
  { label: 'Coral', hex: '#ff7043' },
  { label: 'Teal', hex: '#00897b' },
]

/** Phase 8: cross-cutting preferences; SSH bookmarks share store with `/ssh`; accent persists in `appearance`. */
export function SettingsPage(): ReactElement {
  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT_HEX)
  const [accentBusy, setAccentBusy] = useState(false)
  const [accentMsg, setAccentMsg] = useState<string | null>(null)

  const [hostsPreview, setHostsPreview] = useState<string | null>(null)
  const [hostsErr, setHostsErr] = useState<string | null>(null)
  const [hostsBusy, setHostsBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      setLoadError(null)
      setAccentMsg(null)
      setHostsErr(null)
      setHostsBusy(true)
      try {
        const [bm, ap, hr] = await Promise.all([
          window.dh.storeGet({ key: 'ssh_bookmarks' }),
          window.dh.storeGet({ key: 'appearance' }),
          window.dh.hostExec({ command: 'settings_read_hosts' }),
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
        const h = hr as { ok: boolean; result?: unknown; error?: string }
        if (h.ok && typeof h.result === 'string') {
          setHostsPreview(h.result)
          setHostsErr(null)
        } else {
          setHostsPreview(null)
          setHostsErr(h.error ?? 'Could not read /etc/hosts.')
        }
      } catch (e) {
        setBookmarks([])
        setLoadError(e instanceof Error ? e.message : 'Failed to load settings.')
        setAccentDraft(DEFAULT_ACCENT_HEX)
        setHostsPreview(null)
        setHostsErr(e instanceof Error ? e.message : 'Could not read /etc/hosts.')
      } finally {
        setHostsBusy(false)
      }
    })()
  }, [])

  async function refreshHosts(): Promise<void> {
    setHostsBusy(true)
    setHostsErr(null)
    try {
      const hr = await window.dh.hostExec({ command: 'settings_read_hosts' })
      const h = hr as { ok: boolean; result?: unknown; error?: string }
      if (h.ok && typeof h.result === 'string') {
        setHostsPreview(h.result)
        setHostsErr(null)
      } else {
        setHostsPreview(null)
        setHostsErr(h.error ?? 'Could not read /etc/hosts.')
      }
    } catch (e) {
      setHostsPreview(null)
      setHostsErr(e instanceof Error ? e.message : 'Could not read /etc/hosts.')
    } finally {
      setHostsBusy(false)
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

  return (
    <div style={{ padding: 24, maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          SETTINGS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Settings</h1>
        <p style={{ ...muted, marginTop: 10, maxWidth: 720 }}>
          Phase 8 hub: SSH bookmarks share storage with the SSH page. Accent color is persisted app-wide. Hosts preview is
          read-only; environment tools are still planned.
        </p>
      </header>

      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>SSH bookmarks</h2>
          <Link to="/ssh" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
            Open SSH page →
          </Link>
        </div>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>
          Add, edit, and connect from the SSH workspace. This list stays in sync with the same saved entries.
        </p>
        {loadError ? (
          <p style={{ color: 'var(--red)', marginTop: 12, marginBottom: 0, fontSize: 14 }}>{loadError}</p>
        ) : null}
        {bookmarks.length === 0 && !loadError ? (
          <p style={{ ...muted, marginTop: 14, marginBottom: 0 }}>No bookmarks yet. Create one on the SSH page.</p>
        ) : null}
        {bookmarks.length > 0 ? (
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 12 }}>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Name</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Target</th>
                  <th style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Port</th>
                </tr>
              </thead>
              <tbody>
                {bookmarks.map((b) => (
                  <tr key={b.id}>
                    <td style={{ padding: '10px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{b.name}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                      {b.user}@{b.host}
                    </td>
                    <td style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>{b.port}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section style={panel}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Accent color</h2>
        <p style={{ ...muted, marginTop: 8, marginBottom: 12 }}>
          Updates the global <span className="mono">--accent</span> token (links, nav active state, highlights). Save to
          persist; reset removes the override.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {ACCENT_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              title={p.label}
              onClick={() => setAccentDraft(p.hex)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: accentDraft.toLowerCase() === p.hex ? '2px solid var(--text)' : '1px solid var(--border)',
                background: p.hex,
                cursor: 'pointer',
              }}
            />
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <span className="mono" style={{ color: 'var(--text-muted)' }}>
              Custom
            </span>
            <input
              type="color"
              value={accentDraft}
              onChange={(ev) => setAccentDraft(ev.target.value)}
              style={{ width: 48, height: 36, padding: 0, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            disabled={accentBusy}
            onClick={() => void saveAccent()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
              color: 'var(--accent)',
              fontWeight: 600,
              cursor: accentBusy ? 'wait' : 'pointer',
            }}
          >
            Save accent
          </button>
          <button
            type="button"
            disabled={accentBusy}
            onClick={() => void resetAccent()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontWeight: 500,
              cursor: accentBusy ? 'wait' : 'pointer',
            }}
          >
            Reset to default
          </button>
        </div>
        {accentMsg ? (
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: 'var(--text-muted)' }}>{accentMsg}</p>
        ) : null}
      </section>

      <section style={panel}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Hosts file</h2>
          <button
            type="button"
            disabled={hostsBusy}
            onClick={() => void refreshHosts()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              fontWeight: 600,
              fontSize: 13,
              cursor: hostsBusy ? 'wait' : 'pointer',
            }}
          >
            Refresh preview
          </button>
        </div>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>
          Read-only snapshot of <span className="mono">/etc/hosts</span> (bounded size). Flatpak or sandboxed installs may
          not see the host file; editing is not offered yet.
        </p>
        {hostsErr ? (
          <p style={{ color: 'var(--red)', marginTop: 12, marginBottom: 0, fontSize: 14 }}>{hostsErr}</p>
        ) : null}
        {hostsBusy && hostsPreview === null && !hostsErr ? (
          <p style={{ ...muted, marginTop: 12, marginBottom: 0 }}>Loading hosts preview…</p>
        ) : null}
        {hostsPreview !== null ? (
          <pre
            className="mono"
            style={{
              marginTop: 12,
              marginBottom: 0,
              padding: 12,
              maxHeight: 280,
              overflow: 'auto',
              fontSize: 12,
              lineHeight: 1.45,
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {hostsPreview}
          </pre>
        ) : null}
      </section>

      <section style={{ ...panel, opacity: 0.85 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Environment</h2>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>Planned: profile-scoped env files with diff before apply.</p>
      </section>
    </div>
  )
}
