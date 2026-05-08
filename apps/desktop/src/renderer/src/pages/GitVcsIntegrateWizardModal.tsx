import type { BranchEntry, GitRemoteEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { GLASS } from '../layout/GLASS'
import { classifyGitRemoteUrl, type GitProviderFamily } from './gitVcsProviderHost'

export type IntegrateMethod = 'merge' | 'rebase' | 'fast-forward'

function trackingRemoteName(refShortName: string): string | null {
  const i = refShortName.indexOf('/')
  if (i <= 0) return null
  return refShortName.slice(0, i)
}

/** Whether a remote-tracking ref (e.g. `origin/main`) belongs to the same host family as the toolbar fetch remote. */
function remoteBranchMatchesFilter(
  refShortName: string,
  gitRemotes: GitRemoteEntry[],
  filter: GitProviderFamily,
): boolean {
  if (filter === 'other') return true
  const remoteName = trackingRemoteName(refShortName)
  if (!remoteName) return false
  const url = gitRemotes.find((r) => r.name === remoteName)?.fetchUrl
  if (!url?.trim()) return false
  return classifyGitRemoteUrl(url) === filter
}

/** Remote + local branch names for merge/rebase targets (excludes current local branch). */
function buildIntegrateRefGroups(
  branches: BranchEntry[],
  currentBranch: string,
  gitRemotes: GitRemoteEntry[],
  remoteProviderFilter: GitProviderFamily,
): { remotes: string[]; locals: string[] } {
  const cur = currentBranch.trim()
  const seen = new Set<string>()
  const remotes: string[] = []
  const locals: string[] = []
  const push = (name: string, bucket: 'remote' | 'local'): void => {
    const n = name.trim()
    if (!n || seen.has(n)) return
    const entry = branches.find((b) => b.name === n)
    if (entry && !entry.remote && n === cur) return
    seen.add(n)
    if (bucket === 'remote') remotes.push(n)
    else locals.push(n)
  }
  for (const b of branches.filter((x) => x.remote).sort((a, c) => a.name.localeCompare(c.name))) {
    if (!remoteBranchMatchesFilter(b.name, gitRemotes, remoteProviderFilter)) continue
    push(b.name, 'remote')
  }
  for (const b of branches.filter((x) => !x.remote).sort((a, c) => a.name.localeCompare(c.name))) {
    push(b.name, 'local')
  }
  return { remotes, locals }
}

export type GitVcsIntegrateWizardModalProps = {
  isOpen: boolean
  repoPath: string
  currentBranch: string
  /** Local + remote branches from `git branch`; drives suggestions. */
  branchOptions: BranchEntry[]
  /** Used to classify `remote/branch` rows (GitHub vs GitLab vs other). */
  gitRemotes: GitRemoteEntry[]
  /** Match toolbar fetch remote: only that host’s remote-tracking branches are listed (locals always listed). */
  remoteProviderFilter: GitProviderFamily
  suggestedTarget?: string
  onClose: () => void
  onAction: (method: IntegrateMethod, target: string) => Promise<void>
  busy: boolean
}

export function GitVcsIntegrateWizardModal({
  isOpen,
  currentBranch,
  branchOptions,
  gitRemotes,
  remoteProviderFilter,
  suggestedTarget,
  onClose,
  onAction,
  busy,
}: GitVcsIntegrateWizardModalProps): ReactElement | null {
  const [target, setTarget] = useState(suggestedTarget ?? '')
  const [method, setMethod] = useState<IntegrateMethod>('merge')

  const { remotes: remoteRefs, locals: localRefs } = useMemo(
    () => buildIntegrateRefGroups(branchOptions, currentBranch, gitRemotes, remoteProviderFilter),
    [branchOptions, currentBranch, gitRemotes, remoteProviderFilter],
  )
  const refSuggestions = useMemo(() => [...remoteRefs, ...localRefs], [remoteRefs, localRefs])

  useEffect(() => {
    if (!isOpen) return
    setMethod('merge')
    setTarget(suggestedTarget ?? '')
  }, [isOpen, suggestedTarget])

  const [localLoading, setLocalLoading] = useState(false)

  if (!isOpen) return null

  const handleRun = async () => {
    if (!target.trim()) return
    setLocalLoading(true)
    try {
      await onAction(method, target.trim())
    } finally {
      setLocalLoading(false)
    }
  }

  const isWorking = busy || localLoading

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100, // Higher than conflict wizard
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          ...GLASS,
          borderRadius: 16,
          width: 500,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          animation: 'hp-modal-pop 0.25s cubic-bezier(0.2, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 24px 16px', background: 'var(--bg-secondary)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Integrate Changes</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Bringing updates from another branch into <span className="mono" style={{ color: 'var(--accent)' }}>{currentBranch}</span>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Target Selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Branch or remote ref to merge/rebase from
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.45 }}>
              Choose a branch below or type any ref. That ref is merged/rebased <em>into</em>{' '}
              <span className="mono">{currentBranch || 'this branch'}</span>. For Push or New PR only, close this
              dialog.
              {remoteProviderFilter === 'github' ? (
                <>
                  {' '}
                  Remote suggestions are <strong>GitHub</strong> remotes only (same host as your fetch remote).
                </>
              ) : null}
              {remoteProviderFilter === 'gitlab' ? (
                <>
                  {' '}
                  Remote suggestions are <strong>GitLab</strong> remotes only (same host as your fetch remote).
                </>
              ) : null}
            </p>
            {refSuggestions.length > 0 ? (
              <select
                className="mono hp-input"
                value={refSuggestions.includes(target) ? target : ''}
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy}
                autoFocus
                style={{ width: '100%', fontSize: 13, marginBottom: 10 }}
                aria-label="Pick a branch to integrate from"
              >
                <option value="">— Choose branch —</option>
                {remoteRefs.length > 0 ? (
                  <optgroup label="Remote">
                    {remoteRefs.map((r) => (
                      <option key={`r:${r}`} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {localRefs.length > 0 ? (
                  <optgroup label="Local">
                    {localRefs.map((r) => (
                      <option key={`l:${r}`} value={r}>
                        {r}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            ) : null}
            <label
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}
            >
              Ref to integrate from
            </label>
            <input
              className="hp-input mono"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={refSuggestions.length > 0 ? 'Matches the menu above; edit here if needed' : 'e.g. origin/main'}
              autoFocus={refSuggestions.length === 0}
              disabled={busy}
              style={{ width: '100%', fontSize: 14 }}
              aria-label="Branch or remote ref to merge or rebase from"
            />
          </div>

          {/* Method Selection */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>
              Strategy
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div 
                onClick={() => !busy && setMethod('merge')}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${method === 'merge' ? 'var(--accent)' : 'var(--border)'}`,
                  background: method === 'merge' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>Merge</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Combine histories. Creates a merge commit.</div>
              </div>
              <div 
                onClick={() => !busy && setMethod('rebase')}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${method === 'rebase' ? 'var(--accent)' : 'var(--border)'}`,
                  background: method === 'rebase' ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                  cursor: busy ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>Rebase</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Replay your work on top of the target history.</div>
              </div>
            </div>
          </div>

          {/* Quick Note */}
          <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            <span style={{ fontWeight: 600 }}>Tip:</span> LuminaDev will automatically open the Resolution Studio if conflicts occur during the process.
            <br />
            <span style={{ fontWeight: 600 }}>Scope:</span> This only updates your <span className="mono">{currentBranch || 'current branch'}</span> in this
            clone (local merge/rebase). It does <strong>not</strong> merge a pull or merge request on GitHub/GitLab—you still push, then complete the MR/PR
            on the website (or merge via API) when you are ready.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="hp-btn" onClick={onClose} disabled={isWorking}>Cancel</button>
          <button 
            className="hp-btn hp-btn-primary" 
            onClick={handleRun} 
            disabled={isWorking || !target.trim()}
            style={{ minWidth: 100 }}
          >
            {isWorking ? (
              <>
                <span className="codicon codicon-loading spin" style={{ marginRight: 6 }} />
                Working...
              </>
            ) : method === 'merge' ? 'Start Merge' : 'Start Rebase'}
          </button>
        </div>
      </div>
    </div>
  )
}
