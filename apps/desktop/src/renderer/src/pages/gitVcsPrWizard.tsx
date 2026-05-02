import type { BranchEntry } from '@linux-dev-home/shared'
import type { KeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GLASS } from '../layout/GLASS'

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

function defaultBase(branches: BranchEntry[], current: string): string {
  const locals = branches.filter((b) => !b.remote).map((b) => b.name)
  for (const candidate of ['main', 'master', 'develop', 'dev']) {
    if (locals.includes(candidate) && candidate !== current) return candidate
  }
  return locals.find((n) => n !== current) ?? ''
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

  const localBranches = useMemo(
    () => branches.filter((b) => !b.remote).map((b) => b.name),
    [branches],
  )

  // Pre-fill defaults when opened
  useEffect(() => {
    if (!open) return
    setError(null)
    setBusy(false)
    setBody('')
    setBase(defaultBase(branches, currentBranch))
    // Pre-fill title from branch name: feat/add-auth → Add auth
    const parts = currentBranch.replace(/^(feat|fix|chore|docs|refactor|test)[/:]/, '').replace(/[-_]/g, ' ')
    setTitle(parts.charAt(0).toUpperCase() + parts.slice(1))
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [open, currentBranch, branches])

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
        setError(res.error ?? `Failed to create ${shortLabel}.`)
        return
      }
      onCreated(res.url)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Create ${label}`}
      onKeyDown={handleKey}
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
        style={{
          ...GLASS,
          borderRadius: 16,
          padding: '28px 28px 24px',
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            Create {label}
          </h2>
          <button
            type="button"
            className="hp-btn"
            onClick={onClose}
            disabled={busy}
            style={{ padding: '3px 9px', fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Branch row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
            <span className="mono" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px' }}>
              {currentBranch}
            </span>
            <span>→</span>
            <select
              className="mono"
              aria-label="Target base branch"
              value={base}
              disabled={busy}
              onChange={(e) => setBase(e.target.value)}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-panel)',
                color: 'var(--text)',
                fontSize: 13,
              }}
            >
              <option value="">— pick base branch —</option>
              {localBranches
                .filter((n) => n !== currentBranch)
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
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
          <button type="button" className="hp-btn" onClick={onClose} disabled={busy}>
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
