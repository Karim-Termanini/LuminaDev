import type { BranchEntry } from '@linux-dev-home/shared'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GLASS } from '../layout/GLASS'
import { humanizeCloudAuthError } from './cloudAuthError'

export type GitVcsPrWizardProps = {
  open: boolean
  provider: 'github' | 'gitlab' | 'other'
  repoPath: string
  remoteName: string
  currentBranch: string
  branches: BranchEntry[]
  onClose: () => void
  onCreated: (url: string) => void
}

/** `origin/main` + remoteName `origin` → `main` for host API base branch. */
export function stripRemoteBranchPrefix(remoteName: string, refShort: string): string | null {
  const prefix = `${remoteName}/`
  if (!refShort.startsWith(prefix)) return null
  const rest = refShort.slice(prefix.length)
  return rest.length > 0 ? rest : null
}

/** Local branch names and `{remote}/x` short names mapped to host branch `x`, excluding the current branch. */
export function computeBaseBranchOptions(
  branches: BranchEntry[],
  currentBranch: string,
  remoteName: string,
): string[] {
  const set = new Set<string>()
  for (const b of branches) {
    if (!b.remote) {
      if (b.name !== currentBranch) set.add(b.name)
      continue
    }
    const stripped = stripRemoteBranchPrefix(remoteName, b.name)
    if (stripped && stripped !== currentBranch) set.add(stripped)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

export function defaultBaseBranch(candidates: string[]): string {
  for (const c of ['main', 'master', 'develop', 'dev']) {
    if (candidates.includes(c)) return c
  }
  return candidates[0] ?? ''
}

function repoFolderLabel(repoPath: string): string {
  const t = repoPath.trim().replace(/[/\\]+$/, '')
  const i = Math.max(t.lastIndexOf('/'), t.lastIndexOf('\\'))
  return i >= 0 ? t.slice(i + 1) : t || 'repository'
}

export function GitVcsPrWizard({
  open,
  provider,
  repoPath,
  remoteName,
  currentBranch,
  branches,
  onClose,
  onCreated,
}: GitVcsPrWizardProps): ReactElement | null {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const baseOptions = useMemo(
    () => computeBaseBranchOptions(branches, currentBranch, remoteName),
    [branches, currentBranch, remoteName],
  )

  const closeSafe = useCallback(() => {
    if (!busy) onClose()
  }, [busy, onClose])

  // Pre-fill defaults when opened
  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setBody('')
    setBase(defaultBaseBranch(baseOptions))
    // Pre-fill title from branch name: feat/add-auth → Add auth
    const parts = currentBranch.replace(/^(feat|fix|chore|docs|refactor|test)[/:]/, '').replace(/[-_]/g, ' ')
    setTitle(parts.charAt(0).toUpperCase() + parts.slice(1))
    const t = window.setTimeout(() => titleRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [open, currentBranch, branches, baseOptions])

  useEffect(() => {
    if (!open) return
    const onDocKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') closeSafe()
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [open, closeSafe])

  if (!open) return null
  if (provider === 'other') return null

  const label = provider === 'gitlab' ? 'Merge Request' : 'Pull Request'
  const shortLabel = provider === 'gitlab' ? 'MR' : 'PR'

  async function submit(): Promise<void> {
    if (!title.trim() || !base.trim()) return
    if (provider === 'other') return
    setBusy(true)
    setError(null)
    try {
      const res = await window.dh.cloudGitCreatePr({
        provider,
        repoPath,
        remote: remoteName,
        title: title.trim(),
        body: body.trim(),
        head: currentBranch,
        base: base.trim(),
      })
      if (!res.ok || !res.url) {
        setError(humanizeCloudAuthError(new Error(res.error ?? `Failed to create ${shortLabel}.`)))
        return
      }
      onCreated(res.url)
      onClose()
    } catch (e) {
      setError(humanizeCloudAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  function handlePanelKeyDown(e: ReactKeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeSafe()
    }
  }

  const folder = repoFolderLabel(repoPath)

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSafe()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Create ${label}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
        tabIndex={-1}
        style={{
          ...GLASS,
          borderRadius: 16,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Create {label}
            </h2>
            <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.45 }}>
              <span className="mono">{folder}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span className="mono">{remoteName}</span>
              <span style={{ opacity: 0.55 }}> · </span>
              <span className="mono">{currentBranch}</span>
            </p>
          </div>
          <button
            type="button"
            className="hp-btn"
            onClick={closeSafe}
            disabled={busy}
            style={{ padding: '3px 9px', fontSize: 14 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {provider === 'gitlab' ? (
          <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            GitLab only accepts a source branch that already exists on{' '}
            <span className="mono">{remoteName}</span>. If you only pushed to another remote (for example GitHub), push this
            branch to GitLab first, then create the merge request.
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Branch row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span className="mono" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px' }}>
                {currentBranch}
              </span>
              <span>into</span>
              <select
                className="mono"
                aria-label="Target base branch"
                value={base}
                disabled={busy}
                onChange={(e) => setBase(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '5px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-panel)',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              >
                <option value="">— pick base branch —</option>
                {baseOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {baseOptions.length === 0 ? (
              <p className="hp-muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
                No other branches found for this remote. Run <span className="mono">Fetch</span>, or create a local base
                branch, then open this wizard again.
              </p>
            ) : (
              <p className="hp-muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
                Base is the branch on the remote you want to merge into (locals and <span className="mono">{remoteName}/…</span>{' '}
                tracking names are listed).
              </p>
            )}
          </div>

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            className="mono"
            placeholder={`${shortLabel} title`}
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 13,
              width: '100%',
              boxSizing: 'border-box',
            }}
          />

          {/* Description */}
          <textarea
            placeholder="Description (optional)"
            value={body}
            disabled={busy}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 13,
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: '#ff8a80',
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255,82,82,0.08)',
              border: '1px solid rgba(255,82,82,0.25)',
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="hp-btn" onClick={closeSafe} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={busy || !title.trim() || !base.trim()}
            onClick={() => void submit()}
          >
            {busy ? `Creating ${shortLabel}…` : `Create ${shortLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}
