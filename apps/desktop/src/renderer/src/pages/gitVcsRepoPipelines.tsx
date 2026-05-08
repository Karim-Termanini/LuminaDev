import type { CloudPipelineEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { humanizeCloudAuthError } from './cloudAuthError'
import { CLOUD_GIT_PROVIDER_THEME } from './cloudGitTheme'
import type { GitProviderFamily } from './gitVcsProviderHost'
import { GLASS } from '../layout/GLASS'

function pipelineStatusPill(status: string): { label: string; bg: string; color: string } {
  const s = status.trim().toLowerCase()
  if (s.includes('success') || s === 'passed' || s === 'completed')
    return { label: status, bg: 'rgba(76, 175, 80, 0.18)', color: '#a5d6a7' }
  if (s.includes('fail') || s.includes('error') || s.includes('cancel'))
    return { label: status, bg: 'rgba(244, 67, 54, 0.16)', color: '#ffab91' }
  if (s.includes('progress') || s.includes('pending') || s.includes('running') || s.includes('queued') || s.includes('waiting'))
    return { label: status, bg: 'rgba(129, 212, 250, 0.14)', color: '#81d4fa' }
  return { label: status, bg: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }
}

function formatPipelineTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return iso
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(t))
  } catch {
    return iso
  }
}

export function GitVcsRepoPipelines({
  repoPath,
  remoteName,
  provider,
  ambiguousHost = false,
  onAmbiguousTokenChange,
}: {
  repoPath: string
  remoteName: string
  provider: GitProviderFamily
  /** Both Cloud accounts linked and remote host did not identify GitHub vs GitLab; user picks API token. */
  ambiguousHost?: boolean
  onAmbiguousTokenChange?: (next: 'github' | 'gitlab') => void
}): ReactElement | null {
  const [pipelines, setPipelines] = useState<CloudPipelineEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [errRaw, setErrRaw] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath.trim() || provider === 'other') {
      setPipelines([])
      setErrRaw(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setErrRaw(null)
    void window.dh
      .cloudGitPipelines({
        provider,
        limit: 12,
        repoPath: repoPath.trim(),
        remote: remoteName,
      })
      .then((res) => {
        if (cancelled) return
        if (res.ok && Array.isArray(res.pipelines)) {
          setPipelines(res.pipelines as CloudPipelineEntry[])
          return
        }
        setPipelines([])
        if (!res.ok && res.error) setErrRaw(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPipelines([])
          setErrRaw(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repoPath, remoteName, provider])

  if (!repoPath.trim() || provider === 'other') {
    return null
  }

  const theme = CLOUD_GIT_PROVIDER_THEME[provider]
  const scopedStyle = {
    '--cg-accent': theme.accent,
    '--cg-accent-muted': theme.accentMuted,
    '--cg-surface': theme.surface,
    '--cg-surface-deep': theme.surfaceDeep,
  } as CSSProperties

  const errDisplay = errRaw ? humanizeCloudAuthError(new Error(errRaw)) : null

  return (
    <div
      style={{
        ...GLASS,
        ...scopedStyle,
        borderRadius: 16,
        padding: '16px 18px',
        border: '1px solid color-mix(in srgb, var(--cg-accent, var(--accent)) 22%, var(--border))',
        background: 'color-mix(in srgb, var(--cg-accent, var(--accent)) 5%, var(--bg-widget))',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div
            className="mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'var(--cg-accent-muted, var(--text-muted))',
              marginBottom: 4,
            }}
          >
            CI · THIS REPO
          </div>
          <div style={{ fontSize: 15, fontWeight: 650, color: 'var(--text)', lineHeight: 1.3 }}>Pipelines</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>
            Latest runs for <span className="mono">{remoteName}</span> via{' '}
            <Link to={`/git?tab=cloud&provider=${provider}`} style={{ color: 'var(--cg-accent, var(--accent))' }}>
              Cloud Git
            </Link>
            .
          </div>
        </div>
        <span
          className={`codicon ${provider === 'gitlab' ? 'codicon-repo' : 'codicon-github'}`}
          style={{ fontSize: 22, color: 'var(--cg-accent, var(--accent))', opacity: 0.85, flexShrink: 0 }}
          aria-hidden
        />
      </div>

      {ambiguousHost && onAmbiguousTokenChange ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className="hp-muted" style={{ fontSize: 11 }}>
            Token for CI API
          </span>
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              className={provider === 'github' ? 'hp-btn hp-btn-primary' : 'hp-btn'}
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => onAmbiguousTokenChange('github')}
            >
              GitHub
            </button>
            <button
              type="button"
              className={provider === 'gitlab' ? 'hp-btn hp-btn-primary' : 'hp-btn'}
              style={{ fontSize: 11, padding: '4px 10px' }}
              onClick={() => onAmbiguousTokenChange('gitlab')}
            >
              GitLab
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>Loading pipelines…</div>
      ) : errDisplay ? (
        <div role="alert" style={{ fontSize: 13, color: '#f87171', padding: '4px 0' }}>
          {errDisplay}
        </div>
      ) : pipelines.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 0' }}>No recent runs for this repository.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pipelines.map((row) => {
            const pill = pipelineStatusPill(row.status)
            return (
              <li
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--cg-accent, var(--accent))',
                    fontWeight: 600,
                    fontSize: 13,
                    textDecoration: 'none',
                    minWidth: 0,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.name}
                </a>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span
                    className="mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: pill.bg,
                      color: pill.color,
                    }}
                  >
                    {pill.label}
                  </span>
                  {row.updatedAt ? (
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatPipelineTime(row.updatedAt)}
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
