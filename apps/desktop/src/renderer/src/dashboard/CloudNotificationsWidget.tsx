import type { CloudIssueEntry, CloudPipelineEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type Provider = 'github' | 'gitlab'

type NotifRow =
  | { kind: 'pipeline'; provider: Provider; entry: CloudPipelineEntry }
  | { kind: 'issue'; provider: Provider; entry: CloudIssueEntry }

const LABEL: Record<Provider, string> = { github: 'GitHub', gitlab: 'GitLab' }

export function CloudNotificationsWidget(props: { comfortable: boolean }): ReactElement {
  const c = props.comfortable
  const fs = (t: number) => (c ? t + 1 : t)
  const [rows, setRows] = useState<NotifRow[]>([])
  const [loading, setLoading] = useState(true)
  const [noAccounts, setNoAccounts] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const authRes = await window.dh.cloudAuthStatus()
        const accounts: Provider[] =
          authRes.ok && Array.isArray(authRes.accounts)
            ? (authRes.accounts as { provider: Provider }[]).map((a) => a.provider)
            : []

        if (accounts.length === 0) {
          if (!cancelled) { setNoAccounts(true); setLoading(false) }
          return
        }

        const next: NotifRow[] = []

        await Promise.all(
          accounts.map(async (provider) => {
            try {
              const [pipeRes, issueRes] = await Promise.all([
                window.dh.cloudGitPipelines({ provider, limit: 20 }),
                window.dh.cloudGitIssues({ provider, limit: 20 }),
              ])
              if (pipeRes.ok && Array.isArray(pipeRes.pipelines)) {
                for (const p of pipeRes.pipelines as CloudPipelineEntry[]) {
                  if (p.status === 'failed' || p.status === 'failure') {
                    next.push({ kind: 'pipeline', provider, entry: p })
                  }
                }
              }
              if (issueRes.ok && Array.isArray(issueRes.issues)) {
                for (const i of issueRes.issues as CloudIssueEntry[]) {
                  next.push({ kind: 'issue', provider, entry: i })
                }
              }
            } catch {
              // skip provider on error
            }
          }),
        )

        if (!cancelled) {
          next.sort((a, b) => {
            const ta = a.kind === 'pipeline' ? a.entry.updatedAt : a.entry.updatedAt
            const tb = b.kind === 'pipeline' ? b.entry.updatedAt : b.entry.updatedAt
            return tb.localeCompare(ta)
          })
          setRows(next.slice(0, 10))
          setNoAccounts(false)
        }
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <p className="hp-muted" style={{ margin: 0, fontSize: fs(12) }}>
        Loading notifications…
      </p>
    )
  }

  if (noAccounts) {
    return (
      <p className="hp-muted" style={{ margin: 0, fontSize: fs(12), lineHeight: 1.45 }}>
        Connect GitHub or GitLab in{' '}
        <Link to="/git?tab=cloud">Cloud Git</Link> to see notifications.
      </p>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="hp-muted" style={{ margin: 0, fontSize: fs(12) }}>
        No failed pipelines or open issues.
      </p>
    )
  }

  return (
    <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: c ? 10 : 7 }}>
      {rows.map((row, i) => {
        const isPipeline = row.kind === 'pipeline'
        const url = isPipeline ? row.entry.url : row.entry.url
        const title = isPipeline ? `${row.entry.repo}: ${row.entry.name}` : row.entry.title
        const meta = isPipeline
          ? `Failed pipeline · ${LABEL[row.provider]}`
          : `Open issue · ${LABEL[row.provider]} · ${row.entry.repo}`
        const color = isPipeline ? 'var(--red, #ff5252)' : 'var(--accent)'
        const icon = isPipeline ? '✕' : '!'

        return (
          <li key={`${row.kind}-${row.provider}-${i}`}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span
                style={{
                  flexShrink: 0,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: color,
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
                aria-hidden
              >
                {icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    fontSize: fs(12),
                    fontWeight: 600,
                    color: 'var(--text)',
                    textDecoration: 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={title}
                >
                  {title}
                </a>
                <span style={{ fontSize: fs(10), color: 'var(--text-muted)' }}>{meta}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
