import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import { CLOUD_AUTH_PROVIDER_META } from './cloudAuthMeta'
import { CLOUD_GIT_PROVIDER_THEME, type CloudGitProviderId } from './cloudGitTheme'
import type { useCloudAuth } from './useCloudAuth'

type CloudAuthState = ReturnType<typeof useCloudAuth>

type ScopedVars = React.CSSProperties & {
  '--auth-accent': string
  '--auth-accent-muted': string
  '--auth-surface': string
  '--auth-surface-deep': string
}

export function CloudAuthProviderPanel({
  provider,
  auth,
  showAdvanced = true,
}: {
  provider: CloudGitProviderId
  auth: CloudAuthState
  showAdvanced?: boolean
}): ReactElement {
  const { t } = useTranslation('cloudGit')
  const meta = CLOUD_AUTH_PROVIDER_META[provider]
  const theme = CLOUD_GIT_PROVIDER_THEME[provider]
  const {
    account,
    connecting,
    deviceFlow,
    error,
    oauthSetupNotice,
    patError,
    patHost,
    patProvider,
    patToken,
    showPatForm,
    advGithub,
    advMsg,
    advSaving,
    setPatHost,
    setPatToken,
    setPatProvider,
    setAdvGithub,
    dismissError,
    dismissOauthNotice,
    reportError,
    startDeviceFlow,
    cancelDeviceFlow,
    submitPat,
    disconnect,
    saveAdvOauth,
  } = auth

  const scopedStyle: ScopedVars = {
    '--auth-accent': theme.accent,
    '--auth-accent-muted': theme.accentMuted,
    '--auth-surface': theme.surface,
    '--auth-surface-deep': theme.surfaceDeep,
  }

  const activeDeviceFlow = deviceFlow?.provider === provider ? deviceFlow : null

  return (
    <div className={`settings-auth-panel settings-auth-panel-${provider}`} style={scopedStyle}>
      {oauthSetupNotice ? (
        <div role="status" className="settings-auth-notice">
          <span className="codicon codicon-info" aria-hidden />
          <p>{oauthSetupNotice}</p>
          <button type="button" className="hp-btn settings-auth-notice-dismiss" onClick={dismissOauthNotice} aria-label={t('notice.dismissAria')}>
            {t('notice.dismiss')}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="hp-status-alert error settings-auth-error">
          {error}
          <button type="button" className="settings-auth-error-dismiss" onClick={dismissError} aria-label={t('notice.dismissAria')}>
            ×
          </button>
        </div>
      ) : null}

      {activeDeviceFlow ? (
        <section className="settings-auth-device-flow" aria-labelledby={`auth-device-${provider}`}>
          <div className="settings-auth-device-flow-header">
            <span className="settings-auth-device-emoji" aria-hidden>{meta.tabEmoji}</span>
            <div>
              <h3 id={`auth-device-${provider}`}>{t('oauth.title', { label: t(`provider.${provider}`) })}</h3>
              <p>{t('oauth.deviceInstructions', { label: t(`provider.${provider}`) })}</p>
            </div>
          </div>
          <p className="settings-auth-device-uri">
            {t('oauth.openLabel')}{' '}
            <span className="mono">{activeDeviceFlow.verification_uri}</span>
          </p>
          <div className="settings-auth-device-code mono">{activeDeviceFlow.user_code}</div>
          <div className="settings-auth-device-actions">
            <button
              type="button"
              className="settings-auth-primary-btn"
              onClick={() => {
                void navigator.clipboard.writeText(activeDeviceFlow.user_code).catch(() => { })
                void window.dh.openExternal(activeDeviceFlow.verification_uri).catch(() => {
                  reportError(t('oauth.browserFallback', { uri: activeDeviceFlow.verification_uri }))
                })
              }}
            >
              <span className="codicon codicon-copy" aria-hidden /> {t('oauth.copyOpen')}
            </button>
          </div>
          <div className="settings-auth-device-waiting">
            <span className="codicon codicon-sync codicon-modifier-spin" aria-hidden />
            {t('oauth.waiting')}
            <button type="button" className="settings-auth-link-btn" onClick={cancelDeviceFlow}>
              {t('oauth.cancel')}
            </button>
          </div>
        </section>
      ) : account ? (
        <section className="settings-auth-connected" aria-labelledby={`auth-hero-${provider}`}>
          <div className="settings-auth-connected-main">
            {account.avatar_url ? (
              <img src={account.avatar_url} alt="" className="settings-auth-avatar" />
            ) : (
              <span className={`codicon codicon-${meta.icon} settings-auth-avatar-fallback`} aria-hidden />
            )}
            <div className="settings-auth-connected-text">
              <h3 id={`auth-hero-${provider}`}>{account.username}</h3>
              <span className="settings-auth-status-pill">
                <span className="settings-auth-status-dot" aria-hidden />
                {t('provider.connected')}
              </span>
              <p className="settings-auth-connected-meta">
                {t('provider.connectedAt', { date: account.connected_at.slice(0, 10) })}
              </p>
            </div>
          </div>
          <div className="settings-auth-connected-actions">
            <button type="button" className="hp-btn" onClick={() => void disconnect(provider)}>
              {t('provider.disconnect', { label: t(`provider.${provider}`) })}
            </button>
          </div>
        </section>
      ) : (
        <section className="settings-auth-connect" aria-labelledby={`auth-connect-${provider}`}>
          <div className="settings-auth-connect-header">
            <span className="settings-auth-connect-emoji" aria-hidden>{meta.tabEmoji}</span>
            <div>
              <h3 id={`auth-connect-${provider}`}>{t('provider.connect', { label: t(`provider.${provider}`) })}</h3>
              <p>
                {provider === 'gitlab' ? t('provider.gitlabConnectDesc') : t('provider.githubConnectDesc')}
              </p>
            </div>
          </div>

          {!showPatForm ? (
            provider === 'gitlab' ? (
              <div className="settings-auth-pat-form">
                <input
                  type="text"
                  placeholder={t('host.customPlaceholder')}
                  value={patHost}
                  onChange={(e) => setPatHost(e.target.value)}
                  className="hp-input"
                />
                <input
                  type="password"
                  placeholder={t('pat.placeholder')}
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  className="hp-input"
                />
                <p className="settings-auth-scopes-hint">{t('scopes.required')} {meta.scopes.join(', ')}</p>
                <div className="settings-auth-gitlab-scope-note">
                  <span className="codicon codicon-info" aria-hidden />
                  <span>{t('scopes.gitlabApiNote')}</span>
                </div>
                <button
                  type="button"
                  className="settings-auth-primary-btn"
                  disabled={connecting || !patToken.trim()}
                  onClick={() => void submitPat()}
                >
                  {connecting ? t('pat.verifying') : t('pat.verify')}
                </button>
              </div>
            ) : (
              <div className="settings-auth-connect-actions">
                <button
                  type="button"
                  className="settings-auth-primary-btn"
                  disabled={connecting}
                  onClick={() => void startDeviceFlow(provider)}
                >
                  {connecting ? t('oauth.connecting') : t('provider.connect', { label: t(`provider.${provider}`) })}
                </button>
                <button
                  type="button"
                  className="settings-auth-link-btn"
                  onClick={() => {
                    setPatProvider(provider)
                  }}
                >
                  {t('provider.switchToPat')}
                </button>
              </div>
            )
          ) : (
            <div className="settings-auth-pat-form">
              <input
                type="text"
                placeholder={t('host.customTemplate', { host: provider })}
                value={patHost}
                onChange={(e) => setPatHost(e.target.value)}
                className="hp-input"
              />
              <input
                type="password"
                placeholder={t('pat.placeholder')}
                value={patToken}
                onChange={(e) => setPatToken(e.target.value)}
                className="hp-input"
              />
              <p className="settings-auth-scopes-hint">{t('scopes.required')} {meta.scopes.join(', ')}</p>
              {provider === 'gitlab' ? (
                <div className="settings-auth-gitlab-scope-note">
                  <span className="codicon codicon-info" aria-hidden />
                  <span>{t('scopes.gitlabApiNote')}</span>
                </div>
              ) : null}
              {patError ? <p className="settings-auth-pat-error">{patError}</p> : null}
              <div className="settings-auth-pat-actions">
                <button
                  type="button"
                  className="settings-auth-primary-btn"
                  disabled={connecting || !patToken.trim()}
                  onClick={() => void submitPat()}
                >
                  {connecting ? t('pat.verifying') : t('pat.verify')}
                </button>
                {patProvider !== null ? (
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => {
                      setPatProvider(null)
                      setPatToken('')
                    }}
                  >
                    {t('pat.cancel')}
                  </button>
                ) : null}
              </div>
            </div>
          )}

          <p className="settings-auth-scopes-list">{t('scopes.list')} {meta.scopes.join(', ')}</p>
        </section>
      )}

      {showAdvanced && provider === 'github' ? (
        <details className="settings-auth-advanced">
          <summary>{t('advanced.title')}</summary>
          <div className="settings-auth-advanced-body">
            <p>{t('advanced.desc')}</p>
            <label className="settings-auth-advanced-label">{t('advanced.clientIdLabel')}</label>
            <input
              type="text"
              className="hp-input"
              value={advGithub}
              onChange={(e) => setAdvGithub(e.target.value)}
              placeholder={t('advanced.clientIdPlaceholder')}
              autoComplete="off"
            />
            <div className="settings-auth-advanced-actions">
              <button type="button" className="hp-btn hp-btn-primary" disabled={advSaving} onClick={() => void saveAdvOauth()}>
                {t('advanced.save')}
              </button>
              {advSaving ? <span className="settings-auth-advanced-saving">{t('advanced.saving')}</span> : null}
            </div>
            {advMsg ? <p className="settings-auth-advanced-msg">{advMsg}</p> : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}