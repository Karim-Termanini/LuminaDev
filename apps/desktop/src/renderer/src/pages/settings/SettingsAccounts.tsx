import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'

export function SettingsAccounts(): ReactElement {
  const { t } = useTranslation('settings')
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    void window.dh.cloudAuthStatus()
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.accounts) {
          setAccounts([])
          if (!res.ok && res.error) setErr(res.error)
          return
        }
        setAccounts(res.accounts)
      })
      .catch((e: unknown) => { if (!cancelled) setErr(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p className="hp-muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {t('accounts.description')}
      </p>
      {loading ? <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>{t('accounts.loading')}</p> : null}
      {!loading && err ? <div className="hp-status-alert error" style={{ fontSize: 13 }}>{err}</div> : null}
      {!loading && !err && accounts.length === 0 ? <p className="hp-muted" style={{ margin: 0, fontSize: 13 }}>{t('accounts.noAccounts')}</p> : null}
      {!loading && accounts.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.65, color: 'var(--text)' }}>
          {accounts.map((a) => (
            <li key={`${a.provider}:${a.username}`}>
              <span className="mono">{a.provider}</span> — {a.username}
              <Link to={`/git?tab=cloud&provider=${a.provider}`} className="mono"
                style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'none', fontSize: 12 }}>{t('accounts.openLink')}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/git?tab=cloud&provider=github" className="hp-btn hp-btn-primary" style={{ fontSize: 13, textDecoration: 'none' }}>
            <span className="codicon codicon-github" aria-hidden /> {t('accounts.githubTab')}
          </Link>
          <Link to="/git?tab=cloud&provider=gitlab" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
            <span className="codicon codicon-source-control" aria-hidden /> {t('accounts.gitlabTab')}
          </Link>
          <Link to="/git?tab=cloud" className="hp-btn" style={{ fontSize: 13, textDecoration: 'none' }}>
            <span className="codicon codicon-arrow-right" aria-hidden /> {t('accounts.manageOnCloudGit')}
          </Link>
      </div>
    </div>
  )
}
