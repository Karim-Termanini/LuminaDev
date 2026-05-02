import type { ReactElement } from 'react'
import { parseUnifiedDiff } from './gitVcsDiffParser'

export type GitVcsDiffPanelProps = {
  fileLabel: string | null
  diff: string | null
  binary: boolean
}

export function GitVcsDiffPanel({ fileLabel, diff, binary }: GitVcsDiffPanelProps): ReactElement {
  if (!fileLabel) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          border: '1px dashed var(--border)',
          borderRadius: 10,
          minHeight: 200,
        }}
      >
        Select a file to view its diff
      </div>
    )
  }

  if (binary) {
    return (
      <div
        style={{
          flex: 1,
          padding: 16,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        <div className="mono" style={{ marginBottom: 8, color: 'var(--text)' }}>
          {fileLabel}
        </div>
        Binary file changes cannot be displayed here.
      </div>
    )
  }

  if (!diff?.trim()) {
    return (
      <div
        style={{
          flex: 1,
          padding: 16,
          borderRadius: 10,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}
      >
        <div className="mono" style={{ marginBottom: 8, color: 'var(--text)' }}>
          {fileLabel}
        </div>
        No textual diff (empty or new empty file).
      </div>
    )
  }

  const hunks = parseUnifiedDiff(diff)

  return (
    <div
      style={{
        flex: 1,
        overflow: 'auto',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--bg-panel)',
      }}
    >
      <div
        className="mono"
        style={{
          position: 'sticky',
          top: 0,
          padding: '10px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.25)',
          fontSize: 12,
        }}
      >
        {fileLabel}
      </div>
      <div style={{ padding: 8, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, lineHeight: 1.45 }}>
        {hunks.length === 0 ? (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{diff}</pre>
        ) : (
          hunks.map((hunk, hi) => (
            <div key={`${hunk.header}-${hi}`} style={{ marginBottom: 12 }}>
              <div style={{ color: 'var(--accent)', marginBottom: 4 }}>{hunk.header}</div>
              {hunk.lines.map((ln, i) => {
                const bg =
                  ln.type === '+'
                    ? 'rgba(0, 230, 118, 0.08)'
                    : ln.type === '-'
                      ? 'rgba(255, 82, 82, 0.08)'
                      : 'transparent'
                const border =
                  ln.type === '+' ? 'rgba(0, 230, 118, 0.25)' : ln.type === '-' ? 'rgba(255, 82, 82, 0.25)' : 'transparent'
                return (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 44px 1fr',
                      gap: 6,
                      padding: '1px 4px',
                      background: bg,
                      borderLeft: `2px solid ${border}`,
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{ln.oldNum ?? ''}</span>
                    <span style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{ln.newNum ?? ''}</span>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      <span style={{ opacity: 0.65, marginRight: 6 }}>{ln.type}</span>
                      {ln.content}
                    </span>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
