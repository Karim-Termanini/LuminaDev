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
