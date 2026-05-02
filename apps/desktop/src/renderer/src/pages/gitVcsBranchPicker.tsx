import type { BranchEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'

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
  const [newName, setNewName] = useState('')

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

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
      <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Branch
      </label>
      <select
        className="mono"
        value={currentBranch}
        disabled={busy || !currentBranch}
        onChange={(e) => onCheckout(e.target.value)}
        style={{
          minWidth: 200,
          maxWidth: 360,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-panel)',
          color: 'var(--text)',
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
                  {b.name === currentBranch ? ' (current)' : ''}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          className="mono"
          placeholder="new-branch-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
          style={{
            width: 180,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            color: 'var(--text)',
          }}
        />
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !newName.trim()}
          onClick={() => {
            const n = newName.trim()
            if (!n) return
            onCreateBranch(n)
            setNewName('')
          }}
        >
          Create &amp; checkout
        </button>
      </div>
    </div>
  )
}
