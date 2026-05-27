import type { BranchEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('git')
  const [expanded, setExpanded] = useState(false)
  const [otherRef, setOtherRef] = useState('')
  const [ffOnly, setFfOnly] = useState(true)

  const idle = gitOperation === 'none'
  const merging = gitOperation === 'merging'
  const rebasing = gitOperation === 'rebasing'
  const inOperation = !idle

  // Auto-expand when mid-operation; collapse when operation ends
  useEffect(() => {
    if (inOperation) setExpanded(true)
    else setExpanded(false)
  }, [inOperation])

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

  if (!expanded) {
    return (
      <button
        type="button"
        style={{
          all: 'unset',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '4px 0',
        }}
        onClick={() => setExpanded(true)}
        disabled={busy}
      >
        <span className="codicon codicon-git-merge" style={{ fontSize: 13 }} aria-hidden />
        {t('integrate.label')}
      </button>
    )
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.04 }}>
          {merging ? t('integrate.inProgress.merge') : rebasing ? t('integrate.inProgress.rebase') : t('integrate.title')}
        </span>
        {idle ? (
          <button
            type="button"
            className="hp-btn"
            style={{ fontSize: 12, padding: '2px 8px' }}
            onClick={() => setExpanded(false)}
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Mid-operation: show only relevant continue/abort actions */}
      {merging ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onMergeContinue()}>
            {t('integrate.continueMerge')}
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={() => void onMergeAbort()}>
            {t('integrate.abortMerge')}
          </button>
        </div>
      ) : rebasing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" className="hp-btn hp-btn-primary" disabled={busy} onClick={() => void onRebaseContinue()}>
            {t('integrate.continueRebase')}
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={() => void onRebaseSkip()}>
            {t('integrate.skipCommit')}
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={() => void onRebaseAbort()}>
            {t('integrate.abortRebase')}
          </button>
        </div>
      ) : (
        /* Idle: full form */
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <select
              className="mono"
              aria-label={t('integrate.branchLabel')}
              value={otherRef}
              disabled={busy || !repoPath.trim()}
              onChange={(e) => setOtherRef(e.target.value)}
              style={{
                minWidth: 220,
                maxWidth: 400,
                padding: '7px 10px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="">{t('integrate.selectBranch')}</option>
              <optgroup label={t('integrate.localBranches')}>
                {locals.map((b) => (
                  <option key={`l:${b.name}`} value={b.name}>
                    {b.name}
                    {b.name === currentBranch ? ` ${t('integrate.current')}` : ''}
                  </option>
                ))}
              </optgroup>
              {remotes.length > 0 ? (
                <optgroup label={t('integrate.remoteTracking')}>
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
              <input type="checkbox" checked={ffOnly} disabled={busy} onChange={(e) => setFfOnly(e.target.checked)} />
              {t('integrate.ffOnly')}
            </label>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="hp-btn"
              disabled={busy || !canIntegrate}
              onClick={() => void onMerge(otherRef.trim(), ffOnly)}
            >
              {t('integrate.merge')}
            </button>
            <button
              type="button"
              className="hp-btn"
              disabled={busy || !canIntegrate}
              onClick={() => void onRebase(otherRef.trim())}
            >
              {t('integrate.rebase')}
            </button>
            <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} aria-hidden />
            <button type="button" className="hp-btn" disabled={busy} onClick={() => void onStashPop()}>
              {t('integrate.stashPop')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
