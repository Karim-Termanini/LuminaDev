import type { BranchEntry } from '@linux-dev-home/shared'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GLASS } from '../layout/GLASS'
import { humanizeCloudAuthError } from './cloudAuthError'
import { computeBaseBranchOptions, defaultBaseBranch } from './gitVcsPrWizardBranch'

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
  const { t } = useTranslation('git')
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

  const label = provider === 'gitlab' ? t('pr.createMR') : t('pr.createPR')
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
        aria-label={label}
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
              {label}
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
            aria-label={t('pr.close')}
          >
            ✕
          </button>
        </div>

        {provider === 'gitlab' ? (
          <p className="hp-muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            {t('pr.gitlabNote', { remote: remoteName })}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Branch row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span className="mono" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 8px' }}>
                {currentBranch}
              </span>
              <span>{t('pr.into')}</span>
              <select
                className="mono"
                aria-label={t('pr.targetBase')}
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
                <option value="">{t('pr.pickBase')}</option>
                {baseOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            {baseOptions.length === 0 ? (
              <p className="hp-muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
                {t('pr.noBaseBranches')}
              </p>
            ) : (
              <p className="hp-muted" style={{ margin: 0, fontSize: 11, lineHeight: 1.45 }}>
                {t('pr.baseNote', { remote: remoteName })}
              </p>
            )}
          </div>

          {/* Title */}
          <input
            ref={titleRef}
            type="text"
            className="mono"
            placeholder={provider === 'gitlab' ? t('pr.titlePlaceholderMR') : t('pr.titlePlaceholderPR')}
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
            placeholder={t('pr.descPlaceholder')}
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
            {t('pr.cancel')}
          </button>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            disabled={busy || !title.trim() || !base.trim()}
            onClick={() => void submit()}
          >
            {busy ? t('pr.creating', { shortLabel }) : t('pr.create', { shortLabel })}
          </button>
        </div>
      </div>
    </div>
  )
}
