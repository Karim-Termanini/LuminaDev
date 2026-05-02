import type { FileEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useMemo } from 'react'

const STATUS_STYLE: Record<
  FileEntry['status'],
  { label: string; color: string; bg: string }
> = {
  M: { label: 'M', color: '#ffc107', bg: 'rgba(255, 193, 7, 0.12)' },
  A: { label: 'A', color: '#00e676', bg: 'rgba(0, 230, 118, 0.12)' },
  D: { label: 'D', color: '#ff5252', bg: 'rgba(255, 82, 82, 0.12)' },
  R: { label: 'R', color: '#7c4dff', bg: 'rgba(124, 77, 255, 0.12)' },
  '?': { label: '?', color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)' },
  C: { label: '⚠', color: '#ff5252', bg: 'rgba(255, 82, 82, 0.18)' },
}

export type GitVcsFileListProps = {
  staged: FileEntry[]
  unstaged: FileEntry[]
  selected: { path: string; staged: boolean } | null
  busy: boolean
  onSelect: (path: string, staged: boolean) => void
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onResolveConflicts?: () => void
}

function FileRow(props: {
  entry: FileEntry
  staged: boolean
  active: boolean
  busy: boolean
  onSelect: () => void
  onStageOne: () => void
  onUnstageOne: () => void
}): ReactElement {
  const st = STATUS_STYLE[props.entry.status]
  const conflict = props.entry.status === 'C'
  const label = props.entry.oldPath
    ? `${props.entry.oldPath} → ${props.entry.path}`
    : props.entry.path

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={conflict ? `Merge conflict: ${label}` : label}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          props.onSelect()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        background: props.active
          ? 'rgba(124, 77, 255, 0.12)'
          : conflict
            ? 'rgba(255, 82, 82, 0.08)'
            : 'transparent',
        border: props.active
          ? '1px solid rgba(124, 77, 255, 0.35)'
          : conflict
            ? '1px solid rgba(255, 82, 82, 0.45)'
            : '1px solid transparent',
        borderLeft: conflict ? '3px solid #ff5252' : undefined,
      }}
    >
      <span
        className="mono"
        title={conflict ? 'Merge conflict — resolve, then stage' : 'Status'}
        style={{
          fontSize: 11,
          fontWeight: 700,
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
          color: st.color,
          background: st.bg,
          flexShrink: 0,
        }}
      >
        {st.label}
      </span>
      <span
        className="mono"
        title={label}
        style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
      {props.staged ? (
        <button
          type="button"
          className="hp-btn"
          disabled={props.busy}
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={(e) => {
            e.stopPropagation()
            props.onUnstageOne()
          }}
        >
          −
        </button>
      ) : (
        <button
          type="button"
          className="hp-btn"
          disabled={props.busy}
          style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={(e) => {
            e.stopPropagation()
            props.onStageOne()
          }}
        >
          +
        </button>
      )}
    </div>
  )
}

export function GitVcsFileList({
  staged,
  unstaged,
  selected,
  busy,
  onSelect,
  onStage,
  onUnstage,
  onResolveConflicts,
}: GitVcsFileListProps): ReactElement {
  const unstagedSorted = useMemo(
    () =>
      [...unstaged].sort((a, b) => {
        const ac = a.status === 'C' ? 0 : 1
        const bc = b.status === 'C' ? 0 : 1
        if (ac !== bc) return ac - bc
        return a.path.localeCompare(b.path)
      }),
    [unstaged],
  )
  const hasUnmerged = unstagedSorted.some((f) => f.status === 'C')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 200 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Staged ({staged.length})</div>
          {staged.length > 0 ? (
            <button
              type="button"
              className="hp-btn"
              disabled={busy}
              style={{ fontSize: 12 }}
              onClick={() => onUnstage(staged.map((f) => f.path))}
            >
              Unstage all
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {staged.length === 0 ? (
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Nothing staged
            </div>
          ) : (
            staged.map((f) => (
              <FileRow
                key={`s:${f.path}`}
                entry={f}
                staged
                busy={busy}
                active={selected?.path === f.path && selected.staged === true}
                onSelect={() => onSelect(f.path, true)}
                onStageOne={() => {}}
                onUnstageOne={() => onUnstage([f.path])}
              />
            ))
          )}
        </div>
      </section>
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>Unstaged ({unstaged.length})</div>
          {unstaged.length > 0 ? (
            <button
              type="button"
              className="hp-btn"
              disabled={busy}
              style={{ fontSize: 12 }}
              onClick={() => onStage(unstaged.map((f) => f.path))}
            >
              Stage all
            </button>
          ) : null}
        </div>
        {hasUnmerged ? (
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: '#ff8a80',
              marginBottom: 10,
              padding: '8px 12px',
              background: 'rgba(255, 82, 82, 0.08)',
              borderRadius: 8,
              border: '1px solid rgba(255, 82, 82, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span aria-hidden>⚠</span>
              <span>Unresolved merge conflicts.</span>
            </div>
            {onResolveConflicts && (
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ fontSize: 10, padding: '4px 8px', background: '#ff5252', borderColor: '#ff5252' }}
                onClick={onResolveConflicts}
              >
                RESOLVE IN STUDIO
              </button>
            )}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {unstaged.length === 0 ? (
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Working tree clean
            </div>
          ) : (
            unstagedSorted.map((f) => (
              <FileRow
                key={`u:${f.path}`}
                entry={f}
                staged={false}
                busy={busy}
                active={selected?.path === f.path && selected.staged === false}
                onSelect={() => onSelect(f.path, false)}
                onStageOne={() => onStage([f.path])}
                onUnstageOne={() => {}}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}
