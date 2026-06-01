import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { CloudAuthProvider } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'

import { CloudAuthProviderPanel } from '../CloudAuthProviderPanel'
import { CLOUD_AUTH_PROVIDERS } from '../cloudAuthMeta'
import { CLOUD_GIT_PROVIDER_THEME, type CloudGitProviderId } from '../cloudGitTheme'
import { useCloudAuth } from '../useCloudAuth'
import { SettingsCard, SettingsFeedback, SettingsSegmented, SettingsStack } from './SettingsUi'

function parseProvider(raw: string | null): CloudGitProviderId {
  return raw === 'gitlab' ? 'gitlab' : 'github'
}

export function SettingsAccounts(): ReactElement {
  const { t } = useTranslation('settings')
  const [searchParams, setSearchParams] = useSearchParams()
  const providerFromUrl = parseProvider(searchParams.get('provider'))
  const [activeProvider, setActiveProvider] = useState<CloudGitProviderId>(providerFromUrl)
  const auth = useCloudAuth(activeProvider)

  const [syncedUrl, setSyncedUrl] = useState(providerFromUrl)
  if (providerFromUrl !== syncedUrl) {
    setSyncedUrl(providerFromUrl)
    if (!auth.deviceFlow) setActiveProvider(providerFromUrl)
  }
  const flowProvider = auth.deviceFlow?.provider
  if (flowProvider && flowProvider !== activeProvider) {
    setActiveProvider(flowProvider)
  }

  const byProvider = useMemo(() => {
    const map = new Map<CloudAuthProvider, (typeof auth.accounts)[number]>()
    for (const a of auth.accounts) map.set(a.provider, a)
    return map
  }, [auth.accounts])

  function selectProvider(provider: CloudGitProviderId): void {
    setActiveProvider(provider)
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'accounts')
    next.set('provider', provider)
    setSearchParams(next, { replace: true })
  }

  const deviceFlowLocksTabs = auth.deviceFlow !== null

  return (
    <SettingsStack>
      <div className="settings-accounts-glance" role="list" aria-label={t('accounts.glanceLabel')}>
        {CLOUD_AUTH_PROVIDERS.map((id) => {
          const acct = byProvider.get(id)
          const theme = CLOUD_GIT_PROVIDER_THEME[id]
          const active = activeProvider === id
          return (
            <button
              key={id}
              type="button"
              role="listitem"
              className={`settings-accounts-glance-chip${active ? ' is-active' : ''}${acct ? ' is-connected' : ''}`}
              disabled={deviceFlowLocksTabs && auth.deviceFlow?.provider !== id}
              onClick={() => selectProvider(id)}
              style={{ '--glance-accent': theme.accent } as React.CSSProperties}
            >
              <span className={`codicon codicon-${id === 'github' ? 'github' : 'source-control'}`} aria-hidden />
              <span className="settings-accounts-glance-name">{t(id === 'github' ? 'accounts.githubLabel' : 'accounts.gitlabLabel')}</span>
              <span className="settings-accounts-glance-status">
                {acct ? acct.username : t('accounts.notConnected')}
              </span>
            </button>
          )
        })}
      </div>

      <SettingsSegmented
        value={activeProvider}
        options={CLOUD_AUTH_PROVIDERS.map((id) => ({
          value: id,
          label: t(id === 'github' ? 'accounts.githubLabel' : 'accounts.gitlabLabel'),
          icon: id === 'github' ? 'github' : 'source-control',
        }))}
        onChange={(id) => {
          if (deviceFlowLocksTabs && auth.deviceFlow?.provider !== id) return
          selectProvider(id)
        }}
      />

      <SettingsCard className="settings-accounts-auth-card">
        {auth.loading ? <SettingsFeedback tone="muted">{t('accounts.loading')}</SettingsFeedback> : null}
        {!auth.loading ? (
          <CloudAuthProviderPanel provider={activeProvider} auth={auth} showAdvanced />
        ) : null}
      </SettingsCard>

      <SettingsCard title={t('accounts.workflowsTitle')} description={t('accounts.workflowsDesc')}>
        <Link
          to="/git"
          className="hp-btn hp-btn-primary settings-accounts-cloud-link"
          style={{ textDecoration: 'none' }}
        >
          <span className="codicon codicon-cloud" aria-hidden />
          {t('accounts.openCloudGit')}
        </Link>
      </SettingsCard>
    </SettingsStack>
  )
}
