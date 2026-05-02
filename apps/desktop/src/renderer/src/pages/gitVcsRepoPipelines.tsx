import type { CloudPipelineEntry } from '@linux-dev-home/shared'
import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { humanizeCloudAuthError } from './cloudAuthError'
import { CLOUD_GIT_PROVIDER_THEME } from './cloudGitTheme'
import type { GitProviderFamily } from './gitVcsProviderHost'

const CARD = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'rgba(20, 20, 24, 0.35)',
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
    <div style={{ ...CARD, ...scopedStyle }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: 0.04 }}>
        CI / PIPELINES (THIS REPO)
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        Latest runs for remote <span className="mono">{remoteName}</span> via your{' '}
        <Link to={`/cloud-git?tab=${provider}`} style={{ color: 'var(--cg-accent, var(--accent))' }}>
          Cloud Git
        </Link>{' '}
        account.
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
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading pipelines…</div>
      ) : errDisplay ? (
        <div role="alert" style={{ fontSize: 13, color: '#f87171' }}>
          {errDisplay}
        </div>
      ) : pipelines.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No recent runs returned for this repository.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pipelines.map((row) => (
            <li
              key={row.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'baseline',
                gap: 8,
                fontSize: 13,
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                paddingBottom: 6,
              }}
            >
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--cg-accent, var(--accent))', fontWeight: 600, textDecoration: 'none' }}
              >
                {row.name}
              </a>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {row.status}
              </span>
              {row.updatedAt ? (
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {row.updatedAt}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
