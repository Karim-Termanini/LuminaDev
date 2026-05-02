import type { BranchEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'

import type { GitVcsOperation } from './GitVcsStateBanner'

export type GitVcsIntegrateBarProps = {
  repoPath: string
  branches: BranchEntry[]
  currentBranch: string
  busy: boolean
  /** From `dh:git:vcs:status` — controls which continue/abort actions are enabled. */
  gitOperation: GitVcsOperation
  onMerge: (branch: string, ffOnly: boolean) => Promise<void>
  onRebase: (onto: string) => Promise<void>
  onStashPop: () => Promise<void>
  onMergeContinue: () => Promise<void>
  onRebaseContinue: () => Promise<void>
  onRebaseSkip: () => Promise<void>
  onMergeAbort: () => Promise<void>
  onRebaseAbort: () => Promise<void>
}

function sortLocals(a: BranchEntry, b: BranchEntry): number {
  if (a.current !== b.current) return a.current ? -1 : 1
  return a.name.localeCompare(b.name)
}

export function GitVcsIntegrateBar({
  repoPath,
  branches,
  currentBranch,
  busy,
  gitOperation,
  onMerge,
  onRebase,
  onStashPop,
  onMergeContinue,
  onRebaseContinue,
  onRebaseSkip,
  onMergeAbort,
  onRebaseAbort,
}: GitVcsIntegrateBarProps): ReactElement {
  const [otherRef, setOtherRef] = useState('')
  const [ffOnly, setFfOnly] = useState(true)

  const { locals, remotes } = useMemo(() => {
    const rem = branches.filter((b) => b.remote).sort((a, b) => a.name.localeCompare(b.name))
    let loc = branches.filter((b) => !b.remote).sort(sortLocals)
    if (loc.length === 0 && currentBranch) {
      loc = [{ name: currentBranch, remote: false, current: true }]
    } else if (currentBranch && !loc.some((b) => b.name === currentBranch)) {
      const synth: BranchEntry = { name: currentBranch, remote: false, current: true }
      loc = [synth, ...loc.map((b) => ({ ...b, current: false }))]
    }
    return { locals: loc, remotes: rem }
  }, [branches, currentBranch])

  const canIntegrate = otherRef.trim().length > 0
  const idle = gitOperation === 'none'
  const merging = gitOperation === 'merging'
  const rebasing = gitOperation === 'rebasing'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'rgba(20, 20, 24, 0.35)',
      }}
    >
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.04 }}>
        MERGE / REBASE
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <label className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Other ref
        </label>
        <select
          className="mono"
          aria-label="Branch or remote ref to merge or rebase with"
          value={otherRef}
          disabled={busy || !repoPath.trim()}
          onChange={(e) => setOtherRef(e.target.value)}
          style={{
            minWidth: 220,
            maxWidth: 400,
            padding: '8px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-panel)',
            color: 'var(--text)',
            fontSize: 12,
          }}
        >
          <option value="">Select branch or remote ref…</option>
          <optgroup label="Local branches">
            {locals.map((b) => (
              <option key={`l:${b.name}`} value={b.name}>
                {b.name}
                {b.name === currentBranch ? ' (current)' : ''}
              </option>
            ))}
          </optgroup>
          {remotes.length > 0 ? (
            <optgroup label="Remote-tracking">
              {remotes.map((b) => (
                <option key={`r:${b.name}`} value={b.name}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={ffOnly}
            disabled={busy}
            onChange={(e) => setFfOnly(e.target.checked)}
          />
          Fast-forward only (merge)
        </label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !canIntegrate || !idle}
          title="git merge — merges the selected ref into the current branch"
          onClick={() => void onMerge(otherRef.trim(), ffOnly)}
        >
          Merge into current
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !canIntegrate || !idle}
          title="git rebase — replays current commits on top of the selected ref"
          onClick={() => void onRebase(otherRef.trim())}
        >
          Rebase onto
        </button>
        <span style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} aria-hidden />
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !merging}
          title="After resolving merge conflicts and staging, completes the merge commit (git merge --continue)"
          onClick={() => void onMergeContinue()}
        >
          Continue merge
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !rebasing}
          title="After resolving conflicts and staging, continues the rebase (git rebase --continue)"
          onClick={() => void onRebaseContinue()}
        >
          Continue rebase
        </button>
        <button
          type="button"
          className="hp-btn"
          disabled={busy || !rebasing}
          title="Skips the current patch during a rebase (git rebase --skip)"
          onClick={() => void onRebaseSkip()}
        >
          Skip rebase commit
        </button>
        <button type="button" className="hp-btn" disabled={busy || !idle} onClick={() => void onStashPop()}>
          Stash pop
        </button>
        <button type="button" className="hp-btn" disabled={busy || !merging} onClick={() => void onMergeAbort()}>
          Abort merge
        </button>
        <button type="button" className="hp-btn" disabled={busy || !rebasing} onClick={() => void onRebaseAbort()}>
          Abort rebase
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, maxWidth: 720 }}>
        Merge and rebase run locally in this repo. If Git stops for conflicts, fix files in your editor, stage
        resolved paths, then use Continue merge or Continue rebase. Skip rebase commit drops the current replayed
        commit when appropriate. Use abort to discard the in-progress operation. Stash pop applies the latest stash
        entry.
      </p>
    </div>
  )
}
