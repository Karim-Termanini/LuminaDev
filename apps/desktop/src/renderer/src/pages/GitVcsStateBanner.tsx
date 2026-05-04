import type { ReactElement } from 'react'

export type GitVcsOperation = 'none' | 'merging' | 'rebasing'

export function GitVcsStateBanner({
  operation,
  conflictFileCount,
  onOpenResolutionStudio,
  onContinueOperation,
  onAbortOperation,
}: {
  operation: GitVcsOperation
  conflictFileCount: number
  onOpenResolutionStudio: () => void
  onContinueOperation: () => void
  onAbortOperation: () => void
}): ReactElement | null {
  if (operation === 'none' && conflictFileCount === 0) {
    return null
  }


  let title = ''
  let body = ''
  if (operation === 'merging') {
    title = 'Merge in progress'
    body = conflictFileCount > 0 
      ? `You have ${conflictFileCount} file(s) with conflicts. Use the Resolution Studio to pick which changes to keep.`
      : 'All conflicts are resolved! You can now conclude the merge to save your changes.'
  } else if (operation === 'rebasing') {
    title = 'Rebase in progress'
    body = conflictFileCount > 0
      ? `Rebase paused due to ${conflictFileCount} conflicted file(s).`
      : 'No conflicts remaining. Continue rebase to apply the next commit.'
  } else {
    title = 'Unmerged paths detected'
    body = `Git still lists ${conflictFileCount} file(s) with merge conflicts.`
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        border: '1px solid rgba(255, 183, 77, 0.45)',
        background: 'linear-gradient(90deg, rgba(255, 183, 77, 0.12) 0%, rgba(255, 138, 128, 0.06) 100%)',
        color: 'var(--text)',
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, flex: 1 }}>{body}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {conflictFileCount > 0 ? (
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={onOpenResolutionStudio}
              style={{ padding: '4px 12px', fontSize: 12 }}
            >
              <span className="codicon codicon-tools" style={{ marginRight: 6 }} />
              Open Resolution Studio
            </button>
          ) : operation !== 'none' ? (
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={onContinueOperation}
              style={{ padding: '4px 12px', fontSize: 12, background: 'var(--success)', border: 'none' }}
            >
              <span className="codicon codicon-check" style={{ marginRight: 6 }} />
              Conclude {operation === 'merging' ? 'Merge' : 'Rebase'}
            </button>
          ) : null}
          {operation !== 'none' && (
            <button
              type="button"
              className="hp-btn"
              onClick={onAbortOperation}
              style={{ padding: '4px 12px', fontSize: 12, opacity: 0.8 }}
            >
              Abort
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
