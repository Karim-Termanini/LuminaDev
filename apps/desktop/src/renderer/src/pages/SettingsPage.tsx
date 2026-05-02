import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseSshBookmarks } from '@linux-dev-home/shared'

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

/** Phase 8: central place for cross-cutting preferences; SSH bookmarks read the same store as `/ssh`. */
export function SettingsPage(): ReactElement {
  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadBookmarks = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await window.dh.storeGet({ key: 'ssh_bookmarks' })
      if (res.ok) {
        setBookmarks(parseSshBookmarks(res.data))
      } else {
        setBookmarks([])
        setLoadError(res.error ?? 'Could not read ssh_bookmarks.')
      }
    } catch (e) {
      setBookmarks([])
      setLoadError(e instanceof Error ? e.message : 'Failed to load bookmarks.')
    }
  }, [])

  useEffect(() => {
    void loadBookmarks()
  }, [loadBookmarks])

  return (
    <div style={{ padding: 24, maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          SETTINGS
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Settings</h1>
        <p style={{ ...muted, marginTop: 10, maxWidth: 720 }}>
          Phase 8 hub: SSH bookmarks share storage with the SSH page. Hosts editor, environment variables, and theme
          controls will land here next.
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
                    <td style={{ padding: '10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>
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

      <section style={{ ...panel, opacity: 0.85 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Hosts file</h2>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>Planned: safe `/etc/hosts` editing with previews and warnings.</p>
      </section>

      <section style={{ ...panel, opacity: 0.85 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Environment</h2>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>Planned: profile-scoped env files with diff before apply.</p>
      </section>

      <section style={{ ...panel, opacity: 0.85 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Theme</h2>
        <p style={{ ...muted, marginTop: 8, marginBottom: 0 }}>Planned: accent and design-token pilot across routes.</p>
      </section>
    </div>
  )
}
