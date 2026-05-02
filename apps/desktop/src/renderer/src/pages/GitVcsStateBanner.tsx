import type { ReactElement } from 'react'

export type GitVcsOperation = 'none' | 'merging' | 'rebasing'

export function GitVcsStateBanner({
  operation,
  conflictFileCount,
}: {
  operation: GitVcsOperation
  conflictFileCount: number
}): ReactElement | null {
  if (operation === 'none' && conflictFileCount === 0) {
    return null
  }

  const conflictBit =
    conflictFileCount > 0
      ? ` ${conflictFileCount} file${conflictFileCount === 1 ? '' : 's'} still have merge conflicts to resolve.`
      : ''

  let title = ''
  let body = ''
  if (operation === 'merging') {
    title = 'Merge in progress'
    body = `Resolve conflicts in your editor, stage the fixed paths, then use Continue merge in the integration section below. Abort merge discards this merge.${conflictBit}`
  } else if (operation === 'rebasing') {
    title = 'Rebase in progress'
    body = `Resolve conflicts, stage, then Continue rebase—or Skip rebase commit when Git skipped a redundant patch. Abort rebase stops the replay.${conflictBit}`
  } else {
    title = 'Unmerged paths detected'
    body = `Git still lists files with merge conflicts.${conflictBit} Stage resolutions after editing, or inspect the repo if this state looks wrong.`
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
      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{body}</div>
    </div>
  )
}
