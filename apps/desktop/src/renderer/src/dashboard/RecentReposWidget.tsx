import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { assertGitRecentList } from '../pages/registryContract'

const MAX = 6

export function RecentReposWidget(props: { comfortable: boolean }): ReactElement {
  const { t } = useTranslation('dashboard')
  const c = props.comfortable
  const fs = (n: number) => (c ? n + 1 : n)
  const [rows, setRows] = useState<{ path: string; branch: string; dirty: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const raw = await window.dh.gitRecentList()
        const repos = assertGitRecentList(raw)
        const sorted = [...repos].sort((a, b) => b.lastOpened - a.lastOpened).slice(0, MAX)
        const next: { path: string; branch: string; dirty: string }[] = []
        for (const r of sorted) {
          try {
            const st = await window.dh.gitVcsStatus({ repoPath: r.path })
            if (!st.ok) {
              next.push({ path: r.path, branch: '—', dirty: '' })
              continue
            }
            const staged = Array.isArray(st.staged) ? st.staged.length : 0
            const unstaged = Array.isArray(st.unstaged) ? st.unstaged.length : 0
            const dirty = staged + unstaged > 0 ? `${staged + unstaged} Δ` : 'clean'
            const ahead = st.ahead != null && st.ahead > 0 ? `↑${st.ahead}` : ''
            const behind = st.behind != null && st.behind > 0 ? `↓${st.behind}` : ''
            const sync = [ahead, behind].filter(Boolean).join(' ')
            next.push({
              path: r.path,
              branch: (st.branch && String(st.branch)) || '—',
              dirty: [dirty, sync].filter(Boolean).join(' · '),
            })
          } catch {
            next.push({ path: r.path, branch: '—', dirty: '' })
          }
        }
        if (!cancelled) setRows(next)
      } catch {
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: c ? 12 : 8 }}>
      {loading ? (
        <p className="hp-muted" style={{ margin: 0, fontSize: fs(12) }}>
          {t('recentRepos.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="hp-muted" style={{ margin: 0, fontSize: fs(12), lineHeight: 1.45 }}>
          {t('recentRepos.empty.before')}{' '}
          <Link to="/git?tab=vcs">{t('recentRepos.empty.linkText')}</Link>{' '}
          {t('recentRepos.empty.after')}
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: fs(12), lineHeight: 1.5 }}>
          {rows.map((row) => (
            <li key={row.path} style={{ marginBottom: 6 }}>
              <div className="mono" style={{ wordBreak: 'break-all', color: 'var(--text)', fontWeight: 600 }}>
                {row.path}
              </div>
              <div className="mono" style={{ fontSize: fs(11), color: 'var(--text-muted)', marginTop: 2 }}>
                {row.branch}
                {row.dirty ? ` · ${row.dirty}` : ''}
              </div>
              <Link
                to={`/git?tab=vcs&repoPath=${encodeURIComponent(row.path)}`}
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  fontSize: fs(11),
                  fontWeight: 600,
                  color: 'var(--accent)',
                  textDecoration: 'none',
                }}
              >
                {t('recentRepos.openInGitVcs')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
