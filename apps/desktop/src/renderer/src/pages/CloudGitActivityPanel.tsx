import type {
  CloudIssueEntry,
  CloudPipelineEntry,
  CloudPullRequestEntry,
  CloudReleaseEntry,
  GitRepoEntry,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { humanizeCloudAuthError } from './cloudAuthError'
import { assertGitRecentList } from './registryContract'

type Provider = 'github' | 'gitlab'

const WEB: Record<Provider, { prs: string; ci: string; issues: string; releases: string }> = {
  github: {
    prs: 'https://github.com/pulls',
    ci: 'https://github.com/marketplace?type=actions',
    issues: 'https://github.com/issues',
    releases: 'https://github.com/explore',
  },
  gitlab: {
    prs: 'https://gitlab.com/dashboard/merge_requests',
    ci: 'https://gitlab.com/dashboard/pipelines',
    issues: 'https://gitlab.com/dashboard/issues',
    releases: 'https://gitlab.com/explore/projects/topics',
  },
}

export function CloudGitActivityPanel({ provider, label }: { provider: Provider; label: string }): ReactElement {
  const urls = WEB[provider]
  const [prLimit, setPrLimit] = useState(12)
  const [pipelineLimit, setPipelineLimit] = useState(8)
  const [issueLimit, setIssueLimit] = useState(10)
  const [releaseLimit, setReleaseLimit] = useState(8)
  const [prLoading, setPrLoading] = useState(true)
  const [ciLoading, setCiLoading] = useState(true)
  const [issueLoading, setIssueLoading] = useState(true)
  const [releaseLoading, setReleaseLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [prs, setPrs] = useState<CloudPullRequestEntry[]>([])
  const [pipelines, setPipelines] = useState<CloudPipelineEntry[]>([])
  const [pipelineError, setPipelineError] = useState<string | null>(null)
  const [issues, setIssues] = useState<CloudIssueEntry[]>([])
  const [issueError, setIssueError] = useState<string | null>(null)
  const [releases, setReleases] = useState<CloudReleaseEntry[]>([])
  const [releaseError, setReleaseError] = useState<string | null>(null)
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
    setIssueLimit(10)
    setReleaseLimit(8)
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

  useEffect(() => {
    let cancelled = false
    setIssueLoading(true)
    setIssueError(null)
    void window.dh
      .cloudGitIssues({ provider, limit: issueLimit })
      .then((res) => {
        if (cancelled) return
        if (res.ok && Array.isArray(res.issues)) {
          setIssues(res.issues)
          return
        }
        setIssues([])
        if (!res.ok && res.error) setIssueError(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setIssues([])
          setIssueError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setIssueLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, issueLimit])

  useEffect(() => {
    let cancelled = false
    setReleaseLoading(true)
    setReleaseError(null)
    void window.dh
      .cloudGitReleases({ provider, limit: releaseLimit })
      .then((res) => {
        if (cancelled) return
        if (res.ok && Array.isArray(res.releases)) {
          setReleases(res.releases)
          return
        }
        setReleases([])
        if (!res.ok && res.error) setReleaseError(res.error)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setReleases([])
          setReleaseError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setReleaseLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [provider, releaseLimit])

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
          PRs/MRs, assigned issues, CI, and latest releases for <strong>{label}</strong> (account-scoped). Open in
          browser for the full provider UI.
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
          <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 6 }}>Issues assigned to you</div>
          {issueLoading ? <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>Loading…</p> : null}
          {!issueLoading && issueError ? (
            <div style={{ margin: '0 0 12px' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#ff8a80', lineHeight: 1.45 }}>
                {humanizeCloudAuthError(new Error(issueError))}
              </p>
              {needsReconnect(issueError) ? (
                <button type="button" className="hp-btn hp-btn-primary" style={{ marginTop: 10, fontSize: 12 }} onClick={scrollToReconnect}>
                  Reconnect {label}
                </button>
              ) : null}
            </div>
          ) : null}
          {!issueLoading && !issueError && issues.length === 0 ? (
            <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45 }}>
              No open assigned issues found.
            </p>
          ) : null}
          {!issueLoading && !issueError && issues.length > 0 ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Showing {issues.length} · request limit {issueLimit}
            </div>
          ) : null}
          {!issueLoading && !issueError && issues.length > 0 ? (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
              {issues.map((it) => (
                <li key={it.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 10px' }}>
                    <a
                      href={it.url}
                      onClick={(e) => {
                        e.preventDefault()
                        void window.dh.openExternal(it.url)
                      }}
                      className="mono"
                      style={{
                        color: 'var(--text)',
                        textDecoration: 'none',
                        flex: '1 1 200px',
                        minWidth: 0,
                        wordBreak: 'break-word',
                      }}
                      title={it.title}
                    >
                      <span style={{ fontWeight: 600 }}>{it.title}</span>
                    </a>
                    <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {it.repo}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {it.state}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {!issueLoading &&
          !issueError &&
          (issueLimit > 10 || (issues.length >= issueLimit && issueLimit < 50)) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {issues.length >= issueLimit && issueLimit < 50 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setIssueLimit((n) => Math.min(50, n + 10))}
                >
                  Show more
                </button>
              ) : null}
              {issueLimit > 10 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setIssueLimit(10)}
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
            onClick={() => void window.dh.openExternal(urls.issues)}
          >
            <span className="codicon codicon-link-external" aria-hidden /> Issues on {label}
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
                <li key={p.id} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      gap: '6px 12px',
                    }}
                  >
                    <a
                      href={p.url}
                      onClick={(e) => {
                        e.preventDefault()
                        void window.dh.openExternal(p.url)
                      }}
                      className="mono"
                      style={{
                        color: 'var(--text)',
                        textDecoration: 'none',
                        flex: '1 1 200px',
                        minWidth: 0,
                        wordBreak: 'break-word',
                      }}
                      title={`${p.repo} @ ${p.name} (${p.status})`}
                    >
                      <span style={{ fontWeight: 650 }}>{p.repo}</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {p.name}</span>
                    </a>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color:
                          p.status === 'success'
                            ? '#4caf50'
                            : p.status === 'failed'
                              ? '#ff8a80'
                              : 'var(--text-muted)',
                      }}
                    >
                      {p.status}
                    </span>
                  </div>
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
        <div className="hp-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 650, fontSize: 14, marginBottom: 6 }}>Latest releases</div>
          {releaseLoading ? <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12 }}>Loading…</p> : null}
          {!releaseLoading && releaseError ? (
            <div style={{ margin: '0 0 12px' }}>
              <p style={{ margin: 0, fontSize: 12, color: '#ff8a80', lineHeight: 1.45 }}>
                {humanizeCloudAuthError(new Error(releaseError))}
              </p>
              {needsReconnect(releaseError) ? (
                <button type="button" className="hp-btn hp-btn-primary" style={{ marginTop: 10, fontSize: 12 }} onClick={scrollToReconnect}>
                  Reconnect {label}
                </button>
              ) : null}
            </div>
          ) : null}
          {!releaseLoading && !releaseError && releases.length === 0 ? (
            <p className="hp-muted" style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.45 }}>
              No recent releases found across your repos.
            </p>
          ) : null}
          {!releaseLoading && !releaseError && releases.length > 0 ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Showing {releases.length} · request limit {releaseLimit}
            </div>
          ) : null}
          {!releaseLoading && !releaseError && releases.length > 0 ? (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
              {releases.map((r) => (
                <li key={r.id} style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 10px' }}>
                    <a
                      href={r.url}
                      onClick={(e) => {
                        e.preventDefault()
                        void window.dh.openExternal(r.url)
                      }}
                      className="mono"
                      style={{
                        color: 'var(--text)',
                        textDecoration: 'none',
                        flex: '1 1 200px',
                        minWidth: 0,
                        wordBreak: 'break-word',
                      }}
                      title={r.title}
                    >
                      <span style={{ fontWeight: 650 }}>{r.repo}</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {r.tag}</span>
                    </a>
                    {r.title && r.title !== r.tag ? (
                      <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                        {r.title}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {!releaseLoading &&
          !releaseError &&
          (releaseLimit > 8 || (releases.length >= releaseLimit && releaseLimit < 50)) ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              {releases.length >= releaseLimit && releaseLimit < 50 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setReleaseLimit((n) => Math.min(50, n + 8))}
                >
                  Show more
                </button>
              ) : null}
              {releaseLimit > 8 ? (
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12, borderColor: 'var(--cg-accent-muted)' }}
                  onClick={() => setReleaseLimit(8)}
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
            onClick={() => void window.dh.openExternal(urls.releases)}
          >
            <span className="codicon codicon-link-external" aria-hidden /> Browse releases on {label}
          </button>
        </div>
      </div>
    </section>
  )
}
