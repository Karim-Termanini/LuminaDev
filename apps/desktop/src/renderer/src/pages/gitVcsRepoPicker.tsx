import type { GitRepoEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'

export type GitVcsRepoPickerProps = {
  value: string
  onChange: (path: string) => void
  recents: GitRepoEntry[]
  onOpenFolder: () => void
  highlightPath?: string | null
}

export function GitVcsRepoPicker({
  value,
  onChange,
  recents,
  onOpenFolder,
  highlightPath,
}: GitVcsRepoPickerProps): ReactElement {
  const sorted = [...recents].sort((a, b) => b.lastOpened - a.lastOpened)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Repository
      </label>
      <select
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: '1 1 280px',
          minWidth: 200,
          maxWidth: 520,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          color: 'var(--text)',
        }}
      >
        <option value="">— Select —</option>
        {sorted.map((r) => (
          <option key={r.path} value={r.path}>
            {highlightPath && r.path === highlightPath ? `⚡ ${r.path}` : r.path}
          </option>
        ))}
      </select>
      <button type="button" className="hp-btn" onClick={() => void onOpenFolder()}>
        Open folder…
      </button>
    </div>
  )
}
