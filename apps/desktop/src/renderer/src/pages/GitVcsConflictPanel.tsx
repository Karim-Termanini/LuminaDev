import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

export type GitVcsConflictPanelProps = {
  repoPath: string
  filePath: string
  busy: boolean
  onResolved: () => void
  onError: (msg: string) => void
}

export function GitVcsConflictPanel({
  repoPath,
  filePath,
  busy,
  onResolved,
  onError,
}: GitVcsConflictPanelProps): ReactElement {
  const [ours, setOurs] = useState<string | null>(null)
  const [theirs, setTheirs] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (!repoPath || !filePath) return
    setLoading(true)
    setOurs(null)
    setTheirs(null)
    window.dh
      .gitVcsConflictDiff({ repoPath, filePath })
      .then((res) => {
        if (!res.ok) { onError(res.error ?? 'Failed to load conflict diff.'); return }
        setOurs(res.ours ?? '')
        setTheirs(res.theirs ?? '')
      })
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [repoPath, filePath, onError])

  async function resolve(resolution: 'ours' | 'theirs'): Promise<void> {
    setResolving(true)
    try {
      const res = await window.dh.gitVcsResolveConflict({ repoPath, filePath, resolution })
      if (!res.ok) { onError(res.error ?? 'Failed to resolve conflict.'); return }
      onResolved()
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      setResolving(false)
    }
  }

  const isDisabled = busy || resolving

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 14 }}>
        Loading conflict diff…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.04 }}>
            CONFLICT
          </span>
          <span className="mono" style={{ marginLeft: 10, fontSize: 13 }}>
            {filePath}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={isDisabled}
            onClick={() => void resolve('ours')}
          >
            Keep mine (ours)
          </button>
          <button
            type="button"
            className="hp-btn"
            disabled={isDisabled}
            onClick={() => void resolve('theirs')}
          >
            Take theirs
          </button>
        </div>
      </div>

      {/* Two-column diff */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', gap: 0 }}>
        <ConflictSide label="Current (ours)" content={ours} accent="#69f0ae" />
        <ConflictSide
          label="Incoming (theirs)"
          content={theirs}
          accent="#82b1ff"
          borderLeft
        />
      </div>
    </div>
  )
}

function ConflictSide({
  label,
  content,
  accent,
  borderLeft,
}: {
  label: string
  content: string | null
  accent: string
  borderLeft?: boolean
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderLeft: borderLeft ? '1px solid var(--border)' : undefined,
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: accent,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          letterSpacing: 0.03,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '10px 12px',
          fontSize: 12,
          lineHeight: 1.6,
          fontFamily: 'monospace',
          overflow: 'auto',
          flex: 1,
          whiteSpace: 'pre',
          color: 'var(--text)',
          background: 'transparent',
        }}
      >
        {content ?? '(empty)'}
      </pre>
    </div>
  )
}
