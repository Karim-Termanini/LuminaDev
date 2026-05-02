import type { BranchEntry } from '@linux-dev-home/shared'
import type { KeyboardEvent, ReactElement } from 'react'
import { useMemo, useRef, useState } from 'react'

export type GitVcsBranchPickerProps = {
  branches: BranchEntry[]
  currentBranch: string
  busy: boolean
  onCheckout: (name: string) => void
  onCreateBranch: (name: string) => void
}

function sortLocals(a: BranchEntry, b: BranchEntry): number {
  if (a.current !== b.current) return a.current ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function GitVcsBranchPicker({
  branches,
  currentBranch,
  busy,
  onCheckout,
  onCreateBranch,
}: GitVcsBranchPickerProps): ReactElement {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { localOptions, remotes } = useMemo(() => {
    const rem = branches.filter((b) => b.remote).sort((a, b) => a.name.localeCompare(b.name))
    let loc = branches.filter((b) => !b.remote).sort(sortLocals)
    if (loc.length === 0 && currentBranch) {
      loc = [{ name: currentBranch, remote: false, current: true }]
    } else if (currentBranch && !loc.some((b) => b.name === currentBranch)) {
      const synth: BranchEntry = { name: currentBranch, remote: false, current: true }
      loc = [synth, ...loc.map((b) => ({ ...b, current: false }))]
    }
    return { localOptions: loc, remotes: rem }
  }, [branches, currentBranch])

  const emptyList = localOptions.length === 0 && remotes.length === 0

  function openCreate(): void {
    setCreating(true)
    setNewName('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cancelCreate(): void {
    setCreating(false)
    setNewName('')
  }

  function commitCreate(): void {
    const n = newName.trim()
    if (!n) return
    onCreateBranch(n)
    setCreating(false)
    setNewName('')
  }

  function handleInputKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') commitCreate()
    if (e.key === 'Escape') cancelCreate()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span className="codicon codicon-git-branch" style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
      <select
        className="mono"
        aria-label="Current branch"
        value={currentBranch}
        disabled={busy || !currentBranch}
        onChange={(e) => onCheckout(e.target.value)}
        style={{
          minWidth: 140,
          maxWidth: 280,
          padding: '6px 8px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          color: 'var(--text)',
          fontSize: 13,
        }}
      >
        {emptyList ? (
          <option value={currentBranch}>{currentBranch || '—'}</option>
        ) : (
          <>
            <optgroup label="Local branches">
              {localOptions.map((b) => (
                <option key={`l:${b.name}`} value={b.name}>
                  {b.name}
                </option>
              ))}
            </optgroup>
            {remotes.length > 0 ? (
              <optgroup label="Remote branches">
                {remotes.map((b) => (
                  <option key={`r:${b.name}`} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </>
        )}
      </select>

      {creating ? (
        <>
          <input
            ref={inputRef}
            type="text"
            className="mono"
            placeholder="new-branch-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleInputKey}
            disabled={busy}
            style={{
              width: 170,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 13,
            }}
          />
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={busy || !newName.trim()}
            onClick={commitCreate}
            style={{ whiteSpace: 'nowrap' }}
          >
            Create
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={cancelCreate}>
            ✕
          </button>
        </>
      ) : (
        <button
          type="button"
          className="hp-btn"
          disabled={busy}
          title="Create and checkout a new branch"
          onClick={openCreate}
          style={{ padding: '4px 8px', fontSize: 16, lineHeight: 1 }}
        >
          +
        </button>
      )}
    </div>
  )
}
