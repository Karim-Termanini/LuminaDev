import type { ReactElement } from 'react'
import { useEffect, useState, useMemo } from 'react'
import type { CloudCiCheck } from '@linux-dev-home/shared'
import { GLASS } from '../layout/GLASS'

export type GitVcsCiChecksProps = {
  provider: 'github' | 'gitlab'
  repoPath: string
  remote?: string
  reference: string // branch name
  prUrl?: string
  onClose?: () => void
  onResolveConflicts?: (baseBranch: string) => void
}

export function GitVcsCiChecks({
  provider,
  repoPath,
  remote,
  reference,
  prUrl,
  onClose,
  onResolveConflicts,
}: GitVcsCiChecksProps): ReactElement {
  const [checks, setChecks] = useState<CloudCiCheck[]>([])
  const [mergeable, setMergeable] = useState<boolean | null>(null)
  const [baseBranch, setBaseBranch] = useState<string>('main')
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const fetchChecks = useMemo(() => {
    const active = true
    const run = async (): Promise<void> => {
      if (!reference) return
      setLoading(true)
      try {
        const res = await window.dh.cloudGitGetPrChecks({
          provider,
          repoPath,
          remote,
          reference,
        })
        if (!active) return
        if (!res.ok) {
          setError(res.error ?? 'Failed to fetch checks')
        } else if (res.details) {
          if (res.details.pr_merged === true) {
            setChecks([])
            setMergeable(null)
            setError(null)
            setLoading(false)
            onClose?.()
            return
          }
          setChecks(res.details.checks ?? [])
          setMergeable(res.details.mergeable)
          setBaseBranch(res.details.base_branch ?? 'main')
          setError(null)
          setLastUpdated(new Date())
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (active) setLoading(false)
      }
    }
    return run
  }, [provider, repoPath, remote, reference, onClose])

  useEffect(() => {
    void fetchChecks()
    const timer = setInterval(() => void fetchChecks(), 30000) // Poll every 30s
    return () => clearInterval(timer)
  }, [fetchChecks])

  const stats = useMemo(() => {
    const total = checks.length
    const successful = checks.filter(c => c.conclusion === 'success' || c.status === 'success').length
    const failed = checks.filter(c => c.conclusion === 'failure' || c.conclusion === 'action_required').length
    const inProgress = checks.filter(c => c.status === 'in_progress' || c.status === 'queued').length
    return { total, successful, failed, inProgress }
  }, [checks])

  const hasConflicts = mergeable === false
  const statusColor = (stats.failed > 0 || hasConflicts) ? '#ff5252' : stats.inProgress > 0 ? 'var(--cg-accent, var(--accent))' : '#4caf50'

  return (
    <div
      style={{
        ...GLASS,
        borderRadius: 16,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        border: `1px solid ${stats.failed > 0 || hasConflicts ? 'rgba(255,82,82,0.2)' : 'var(--border)'}`,
        animation: 'hp-fade-in 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {prUrl && (
            <a
              href={prUrl}
              target="_blank"
              rel="noreferrer"
              className="hp-btn hp-btn-sm"
              style={{ textDecoration: 'none' }}
            >
              View on {provider === 'github' ? 'GitHub' : 'GitLab'}
            </a>
          )}
          {onClose && (
            <button type="button" className="hp-btn hp-btn-sm" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'right' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              {hasConflicts ? 'This branch has conflicts' :
               stats.inProgress > 0 ? 'Some checks haven\'t completed yet' : 
               stats.failed > 0 ? 'Checks failed' : 'All checks passed'}
            </h3>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: statusColor,
                boxShadow: `0 0 8px ${statusColor}44`,
                flexShrink: 0,
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {stats.inProgress} in progress, {stats.successful} successful checks
          </div>
        </div>
      </div>

      {mergeable === false && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(255,82,82,0.12)',
            border: '1px solid rgba(255,82,82,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <span className="codicon codicon-warning" style={{ color: '#ff5252', fontSize: 18 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#ff8a80' }}>
              This branch has conflicts that must be resolved
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Resolve conflicts before merging this {provider === 'github' ? 'Pull Request' : 'Merge Request'}.
            </div>
          </div>
          {onResolveConflicts && (
            <button 
              type="button" 
              className="hp-btn hp-btn-primary hp-btn-sm" 
              onClick={async () => {
                setResolving(true)
                try {
                  await onResolveConflicts(baseBranch)
                } finally {
                  setResolving(false)
                }
              }}
              disabled={resolving}
            >
              {resolving ? (
                <>
                  <span className="codicon codicon-loading spin" style={{ marginRight: 6 }} />
                  Resolving...
                </>
              ) : 'Resolve locally'}
            </button>
          )}
        </div>
      )}

      {loading && checks.length === 0 ? (
        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Fetching CI status...
        </div>
      ) : error ? (
        <div style={{ padding: '12px', borderRadius: 8, background: 'rgba(255,82,82,0.08)', color: '#ff8a80', fontSize: 13 }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
          {checks.map((check) => (
            <div 
              key={check.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <div style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                {check.status === 'in_progress' || check.status === 'queued' ? (
                  <span className="codicon codicon-loading spin" style={{ color: 'var(--cg-accent, var(--accent))' }} />
                ) : check.conclusion === 'success' ? (
                  <span className="codicon codicon-check" style={{ color: '#4caf50' }} />
                ) : check.conclusion === 'failure' || check.conclusion === 'action_required' ? (
                  <span className="codicon codicon-error" style={{ color: '#f44336' }} />
                ) : (
                  <span className="codicon codicon-circle-outline" style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {check.name}
                </div>
                {check.details && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {check.details}
                  </div>
                )}
              </div>
              {check.url && (
                <a 
                  href={check.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ color: 'var(--text-muted)', fontSize: 16 }}
                  title="View details"
                >
                  <span className="codicon codicon-link-external" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
        <button 
          type="button" 
          className="hp-btn hp-btn-sm" 
          onClick={() => void fetchChecks()}
          disabled={loading}
          style={{ fontSize: 11 }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  )
}
