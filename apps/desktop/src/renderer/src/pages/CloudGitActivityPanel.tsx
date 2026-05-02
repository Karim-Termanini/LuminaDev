import type { CloudPipelineEntry, CloudPullRequestEntry, GitRepoEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { humanizeCloudAuthError } from './cloudAuthError'
import { assertGitRecentList } from './registryContract'

type Provider = 'github' | 'gitlab'

const WEB: Record<Provider, { prs: string; ci: string }> = {
  github: {
    prs: 'https://github.com/pulls',
    ci: 'https://github.com/marketplace?type=actions',
  },
  gitlab: {
    prs: 'https://gitlab.com/dashboard/merge_requests',
    ci: 'https://gitlab.com/dashboard/pipelines',
  },
}

export function CloudGitActivityPanel({ provider, label }: { provider: Provider; label: string }): ReactElement {
  const urls = WEB[provider]
  const [prLimit, setPrLimit] = useState(12)
  const [pipelineLimit, setPipelineLimit] = useState(8)
  const [prLoading, setPrLoading] = useState(true)
  const [ciLoading, setCiLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prs, setPrs] = useState<CloudPullRequestEntry[]>([])
  const [pipelines, setPipelines] = useState<CloudPipelineEntry[]>([])
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [recents, setRecents] = useState<GitRepoEntry[]>([])

  useEffect(() => {
    void window.dh
      .gitRecentList()
      .then((res) => {
        setRecents(assertGitRecentList(res))
      })
      .catch(() => setRecents([]))
  }, [])

  useEffect(() => {
    setPrLimit(12)
    setPipelineLimit(8)
  }, [provider])

  useEffect(() => {
    let cancelled = false
    setPrLoading(true)
    setError(null)
    void window.dh
      .cloudGitPrs({ provider, limit: prLimit })
      .then((res) => {
        if (cancelled) return
        if (res.ok && Array.isArray(res.prs)) {
          setPrs(res.prs)
          return
        }
        setPrs([])
        if (!res.ok && res.error) setError(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPrs([])
          setError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setPrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, prLimit])

  useEffect(() => {
    let cancelled = false
    setCiLoading(true)
    setPipelineError(null)
    void window.dh
      .cloudGitPipelines({ provider, limit: pipelineLimit })
      .then((res) => {
        if (cancelled) return
        if (res.ok && Array.isArray(res.pipelines)) {
          setPipelines(res.pipelines)
          return
        }
        setPipelines([])
        if (!res.ok && res.error) setPipelineError(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPipelines([])
          setPipelineError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setCiLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, pipelineLimit])

  const needsReconnect = (raw: string | null): boolean =>
    !!raw &&
    (raw.includes('[CLOUD_AUTH_INVALID_TOKEN]') ||
      raw.includes('[CLOUD_AUTH_NOT_CONNECTED]'))

  const scrollToReconnect = (): void => {
    document.getElementById(`cloud-git-hero-${provider}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const localPathByRepo = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of recents) {
      const p = r.path.replace(/\\/g, '/')
      const parts = p.split('/').filter(Boolean)
      const base = parts[parts.length - 1]?.toLowerCase() ?? ''
      if (base && !map.has(base)) map.set(base, r.path)
    }
    return map
  }, [recents])

  const localRepoPathFor = (repoSlug: string): string | null => {
    const parts = repoSlug.split('/').filter(Boolean)
    const base = parts[parts.length - 1]?.toLowerCase() ?? ''
    return (base && localPathByRepo.get(base)) || null
  }

  return (
    <section
      aria-labelledby="cloud-git-activity-heading"
      style={{
        borderRadius: 18,
        padding: '22px 20px',
        border: '1px solid var(--cg-accent-muted)',
        background: `linear-gradient(160deg, var(--cg-surface-deep) 0%, var(--bg-widget) 45%)`,
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div>
        <h2 id="cloud-git-activity-heading" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          Activity
        </h2>
        <p className="hp-muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          Open PRs/MRs and recent CI runs for <strong>{label}</strong> (account-scoped). Use browser shortcuts for the
          full provider UI.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="hp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 6 }}>Pull requests</div>
          {prLoading ? <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>Loading…</p> : null}
          {!prLoading && error ? (
            <div style={{ margin: '0 0 12px' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#ff8a80', lineHeight: 1.45 }}>
                {humanizeCloudAuthError(new Error(error))}
              </p>
              {needsReconnect(error) ? (
                <button type="button" className="hp-btn hp-btn-primary" style={{ marginTop: 10, fontSize: 12 }} onClick={scrollToReconnect}>
                  Reconnect {label}
                </button>
              ) : null}
            </div>
          ) : null}
          {!prLoading && !error && prs.length === 0 ? (
            <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45 }}>
              No open PRs/MRs found for your account.
            </p>
          ) : null}
          {!prLoading && !error && prs.length > 0 ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Showing {prs.length} · request limit {prLimit}
            </div>
          ) : null}
          {!prLoading && !error && prs.length > 0 ? (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
              {prs.map((pr) => (
                <li key={pr.id} style={{ marginBottom: 4 }}>
                  <a
                    href={pr.url}
                    onClick={(e) => {
                      e.preventDefault()
                      void window.dh.openExternal(pr.url)
                    }}
                    style={{ color: 'var(--text)', textDecoration: 'none' }}
                    title={pr.title}
                  >
                    {pr.title}
                  </a>
                  <span className="mono" style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                    {pr.repo}
                  </span>
                  {localRepoPathFor(pr.repo) ? (
                    <Link
                      to={`/git-vcs?repoPath=${encodeURIComponent(localRepoPathFor(pr.repo) ?? '')}`}
                      className="mono"
                      style={{
                        marginLeft: 8,
                        color: 'var(--cg-accent, var(--accent))',
                        textDecoration: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      Open in Lumina VCS
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {!prLoading &&
          !error &&
          (prLimit > 12 || (prs.length >= prLimit && prLimit < 50)) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {prs.length >= prLimit && prLimit < 50 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setPrLimit((n) => Math.min(50, n + 12))}
                >
                  Show more
                </button>
              ) : null}
              {prLimit > 12 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setPrLimit(12)}
                >
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="hp-btn"
            style={{ borderColor: 'var(--cg-accent-muted)', fontSize: 12 }}
            onClick={() => void window.dh.openExternal(urls.prs)}
          >
            <span className="codicon codicon-link-external" aria-hidden /> View on {label}
          </button>
        </div>
        <div className="hp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 6 }}>CI / pipelines</div>
          {ciLoading ? <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>Loading…</p> : null}
          {!ciLoading && pipelineError ? (
            <div style={{ margin: '0 0 12px' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#ff8a80', lineHeight: 1.45 }}>
                {humanizeCloudAuthError(new Error(pipelineError))}
              </p>
              {needsReconnect(pipelineError) ? (
                <button type="button" className="hp-btn hp-btn-primary" style={{ marginTop: 10, fontSize: 12 }} onClick={scrollToReconnect}>
                  Reconnect {label}
                </button>
              ) : null}
            </div>
          ) : null}
          {!ciLoading && !pipelineError && pipelines.length === 0 ? (
            <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45 }}>
              No recent pipelines found for your account.
            </p>
          ) : null}
          {!ciLoading && !pipelineError && pipelines.length > 0 ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Showing {pipelines.length} · request limit {pipelineLimit}
            </div>
          ) : null}
          {!ciLoading && !pipelineError && pipelines.length > 0 ? (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
              {pipelines.map((p) => (
                <li key={p.id} style={{ marginBottom: 4 }}>
                  <a
                    href={p.url}
                    onClick={(e) => {
                      e.preventDefault()
                      void window.dh.openExternal(p.url)
                    }}
                    style={{ color: 'var(--text)', textDecoration: 'none' }}
                    title={`${p.name} (${p.status})`}
                  >
                    {p.name}
                  </a>
                  <span className="mono" style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                    {p.repo}
                  </span>
                  <span
                    className="mono"
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      color: p.status === 'success' ? '#4caf50' : p.status === 'failed' ? '#ff8a80' : 'var(--text-muted)',
                    }}
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {!ciLoading &&
          !pipelineError &&
          (pipelineLimit > 8 || (pipelines.length >= pipelineLimit && pipelineLimit < 50)) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {pipelines.length >= pipelineLimit && pipelineLimit < 50 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setPipelineLimit((n) => Math.min(50, n + 8))}
                >
                  Show more
                </button>
              ) : null}
              {pipelineLimit > 8 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setPipelineLimit(8)}
                >
                  Reset
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="hp-btn"
            style={{ borderColor: 'var(--cg-accent-muted)', fontSize: 12 }}
            onClick={() => void window.dh.openExternal(urls.ci)}
          >
            <span className="codicon codicon-link-external" aria-hidden /> Open CI on {label}
          </button>
        </div>
      </div>
    </section>
  )
}
