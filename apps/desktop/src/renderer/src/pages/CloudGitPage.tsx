import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'

import { settingsAccountsHref } from './settingsAccountsHref'
import { CLOUD_AUTH_PROVIDER_META } from './cloudAuthMeta'
import { CloudGitActivityPanel } from './CloudGitActivityPanel'
import { CLOUD_GIT_PROVIDER_THEME, type CloudGitProviderId } from './cloudGitTheme'
import './CloudGitPage.css'

const LAST_TAB_KEY = 'cloud_git_last_tab'
const TAB_EVENT = 'cloud-git:tab-changed'

type ScopedVars = React.CSSProperties & {
  '--cg-accent': string
  '--cg-accent-muted': string
  '--cg-surface': string
  '--cg-surface-deep': string
}

function parseTab(raw: string | null): CloudGitProviderId {
  return raw === 'gitlab' ? 'gitlab' : 'github'
}

export function CloudGitPage(): ReactElement {
  const { t } = useTranslation('cloudGit')
  const [searchParams, setSearchParams] = useSearchParams()
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [activeTab, setActiveTab] = useState<CloudGitProviderId>(() => parseTab(searchParams.get('provider')))
  const [loading, setLoading] = useState(true)

  const theme = CLOUD_GIT_PROVIDER_THEME[activeTab]
  const account = accounts.find((a) => a.provider === activeTab) ?? null
  const meta = CLOUD_AUTH_PROVIDER_META[activeTab]

  const refreshStatus = useCallback(async () => {
    try {
      const res = await window.dh.cloudAuthStatus()
      if (res.ok && Array.isArray(res.accounts)) setAccounts(res.accounts)
      else setAccounts([])
    } catch {
      setAccounts([])
    }
  }, [])

  useEffect(() => {
    void refreshStatus().finally(() => setLoading(false))
  }, [refreshStatus])

  useEffect(() => {
    const next = parseTab(searchParams.get('provider'))
    setActiveTab((cur) => (cur === next ? cur : next))
  }, [searchParams])

  useEffect(() => {
    const q = parseTab(searchParams.get('provider'))
    if (q === activeTab) return
    const next = new URLSearchParams(searchParams)
    next.set('provider', activeTab)
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_TAB_KEY, activeTab)
      window.dispatchEvent(new CustomEvent(TAB_EVENT, { detail: { tab: activeTab } }))
    } catch {
      // Non-fatal
    }
  }, [activeTab])

  if (loading) {
    return <div className="cloud-git-loading">{t('page.loading')}</div>
  }

  const scopedStyle: ScopedVars = {
    '--cg-accent': theme.accent,
    '--cg-accent-muted': theme.accentMuted,
    '--cg-surface': theme.surface,
    '--cg-surface-deep': theme.surfaceDeep,
  }

  return (
    <div className="cloud-git-page">
      <header className="cloud-git-header">
        <h1 className="hp-title cloud-git-title">{t('page.title')}</h1>
        <p className="hp-muted cloud-git-desc">{t('page.desc')}</p>
      </header>

      <div role="tablist" aria-label={t('host.label')} className="cloud-git-tabs">
        {(['github', 'gitlab'] as const).map((p) => {
          const tTab = CLOUD_GIT_PROVIDER_THEME[p]
          const active = activeTab === p
          const m = CLOUD_AUTH_PROVIDER_META[p]
          const connected = accounts.some((a) => a.provider === p)
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(p)
                const next = new URLSearchParams(searchParams)
                next.set('provider', p)
                setSearchParams(next, { replace: true })
              }}
              className={`cloud-git-tab${active ? ' is-active' : ''}`}
              style={{
                '--tab-accent': tTab.accent,
              } as React.CSSProperties}
            >
              <span aria-hidden className="cloud-git-tab-emoji">{m.tabEmoji}</span>
              <span className={`codicon codicon-${m.icon}`} aria-hidden />
              <span>{t(`provider.${p}`)}</span>
              {!connected ? <span className="cloud-git-tab-badge">{t('page.notConnectedShort')}</span> : null}
            </button>
          )
        })}
      </div>

      <div className="cloud-git-body" style={scopedStyle}>
        {!account ? (
          <div className="cloud-git-disconnected hp-status-alert warning">
            <span className="codicon codicon-account" aria-hidden />
            <div>
              <strong>{t('page.notConnectedTitle', { label: t(`provider.${activeTab}`) })}</strong>
              <p>{t('page.notConnectedDesc')}</p>
            </div>
            <Link to={settingsAccountsHref(activeTab)} className="hp-btn hp-btn-primary cloud-git-connect-link">
              {t('page.connectInSettings')}
            </Link>
          </div>
        ) : (
          <div className="cloud-git-account-strip">
            {account.avatar_url ? (
              <img src={account.avatar_url} alt="" className="cloud-git-account-avatar" />
            ) : (
              <span className={`codicon codicon-${meta.icon} cloud-git-account-avatar-fallback`} aria-hidden />
            )}
            <div>
              <span className="cloud-git-account-name">{account.username}</span>
              <span className="cloud-git-account-meta">{t('provider.connected')}</span>
            </div>
            <Link to={settingsAccountsHref(activeTab)} className="hp-btn cloud-git-manage-link">
              {t('page.manageAccount')}
            </Link>
          </div>
        )}

        <CloudGitActivityPanel
          provider={activeTab}
          label={meta.label}
          repoPath={searchParams.get('repoPath') ?? undefined}
        />
      </div>
    </div>
  )
}
