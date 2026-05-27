import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { CloudOauthClientsStoreSchema } from '@linux-dev-home/shared'
import { useTranslation } from 'react-i18next'

import { assertCloudAuthOk } from './cloudAuthContract'
import { CloudGitActivityPanel } from './CloudGitActivityPanel'
import { CLOUD_GIT_PROVIDER_THEME, type CloudGitProviderId } from './cloudGitTheme'
import { humanizeCloudAuthError, isCloudAuthOauthNotConfigured } from './cloudAuthError'

type Provider = CloudGitProviderId
const LAST_TAB_KEY = 'cloud_git_last_tab'
const TAB_EVENT = 'cloud-git:tab-changed'

type DeviceFlowState = {
  provider: Provider
  user_code: string
  verification_uri: string
  device_code: string
  interval: number
}

const PROVIDER_META: Record<Provider, { label: string; icon: string; scopes: string[]; tabEmoji: string }> = {
  github: {
    label: 'GitHub',
    icon: 'github',
    scopes: ['repo', 'read:org', 'read:user', 'notifications'],
    tabEmoji: '🐱',
  },
  gitlab: {
    label: 'GitLab',
    icon: 'source-control',
    scopes: ['api', 'read_api', 'read_user', 'read_repository', 'write_repository'],
    tabEmoji: '🦊',
  },
}

type ScopedVars = React.CSSProperties & {
  '--cg-accent': string
  '--cg-accent-muted': string
  '--cg-surface': string
  '--cg-surface-deep': string
}

export function CloudGitPage(): ReactElement {
  const { t } = useTranslation('cloudGit')
  const [searchParams, setSearchParams] = useSearchParams()

  const parseTab = (raw: string | null): Provider => (raw === 'gitlab' ? 'gitlab' : 'github')

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [activeTab, setActiveTab] = useState<Provider>(() => parseTab(searchParams.get('provider')))
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  const [patProvider, setPatProvider] = useState<Provider | null>(null)
  const [patToken, setPatToken] = useState('')
  const [patHost, setPatHost] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthSetupNotice, setOauthSetupNotice] = useState<string | null>(null)
  const [patError, setPatError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [advGithub, setAdvGithub] = useState('')
  const [advMsg, setAdvMsg] = useState<string | null>(null)
  const [advSaving, setAdvSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const theme = CLOUD_GIT_PROVIDER_THEME[activeTab]
  const account = accounts.find((a) => a.provider === activeTab) ?? null
  const meta = PROVIDER_META[activeTab]
  const effectivePatProvider: Provider | null =
    patProvider ?? (activeTab === 'gitlab' && !account ? 'gitlab' : null)
  const showPatForm = effectivePatProvider === activeTab

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

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
    return () => stopPoll()
  }, [refreshStatus, stopPoll])

  useEffect(() => {
    if (deviceFlow) setActiveTab(deviceFlow.provider)
  }, [deviceFlow])

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
      window.dispatchEvent(
        new CustomEvent(TAB_EVENT, {
          detail: { tab: activeTab },
        }),
      )
    } catch {
      // Non-fatal: keep URL as source of truth.
    }
  }, [activeTab])

  useEffect(() => {
    if (patProvider && patProvider !== activeTab) {
      setPatProvider(null)
      setPatToken('')
      setPatError(null)
    }
  }, [activeTab, patProvider])

  useEffect(() => {
    void (async () => {
      const raw = await window.dh.storeGet({ key: 'cloud_oauth_clients' })
      const bag = raw as { ok?: boolean; data?: unknown }
      if (!bag.ok || bag.data == null || typeof bag.data !== 'object') return
      const parsed = CloudOauthClientsStoreSchema.safeParse(bag.data)
      if (parsed.success) {
        setAdvGithub(parsed.data.github_client_id ?? '')
      }
    })()
  }, [])

  const applyCloudAuthFailure = useCallback((e: unknown): void => {
    if (isCloudAuthOauthNotConfigured(e)) {
      setOauthSetupNotice(humanizeCloudAuthError(e))
      setError(null)
      return
    }
    setOauthSetupNotice(null)
    setError(humanizeCloudAuthError(e))
  }, [])

  const startDeviceFlow = async (provider: Provider): Promise<void> => {
    setError(null)
    setOauthSetupNotice(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectStart(provider)
      assertCloudAuthOk(res)
      setDeviceFlow({
        provider,
        user_code: res.user_code!,
        verification_uri: res.verification_uri!,
        device_code: res.device_code!,
        interval: res.interval ?? 5,
      })
      startPoll(provider, res.device_code!, res.interval ?? 5)
    } catch (e) {
      applyCloudAuthFailure(e)
    } finally {
      setConnecting(false)
    }
  }

  const startPoll = (provider: Provider, device_code: string, interval: number): void => {
    stopPoll()
    const ms = Math.max(interval, 3) * 1000
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const res = await window.dh.cloudAuthConnectPoll({ provider, device_code })
          if (!res.ok) {
            stopPoll()
            setDeviceFlow(null)
            applyCloudAuthFailure(new Error(res.error ?? t('oauth.pollFailed')))
            return
          }
          if (res.status === 'complete') {
            stopPoll()
            setDeviceFlow(null)
            await refreshStatus()
          } else if (res.status === 'expired') {
            stopPoll()
            setDeviceFlow(null)
            setError(t('oauth.expired'))
          } else if (res.status === 'denied') {
            stopPoll()
            setDeviceFlow(null)
            setError(t('oauth.denied'))
          }
        } catch {
          // Network hiccup — keep polling
        }
      })()
    }, ms)
  }

  const cancelDeviceFlow = (): void => {
    stopPoll()
    setDeviceFlow(null)
    setError(null)
    setOauthSetupNotice(null)
  }

  const submitPat = async (): Promise<void> => {
    const provider = patProvider ?? (activeTab === 'gitlab' && !account ? 'gitlab' : null)
    if (!provider || !patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({
        provider,
        token: patToken.trim(),
        host: patHost.trim() || undefined,
      })
      assertCloudAuthOk(res)
      setPatProvider(null)
      setPatToken('')
      setPatHost('')
      setOauthSetupNotice(null)
      await refreshStatus()
    } catch (e) {
      setPatError(humanizeCloudAuthError(e))
    } finally {
      setConnecting(false)
    }
  }

  const saveAdvOauth = async (): Promise<void> => {
    setAdvMsg(null)
    setAdvSaving(true)
    try {
      const data = CloudOauthClientsStoreSchema.parse({
        github_client_id: advGithub.trim() || undefined,
      })
      const res = await window.dh.storeSet({ key: 'cloud_oauth_clients', data })
      if (!res.ok) throw new Error(res.error ?? t('oauth.couldNotSave'))
      setAdvMsg(t('oauth.saved', { label: t('provider.github') }))
    } catch (e) {
      setAdvMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvSaving(false)
    }
  }

  const disconnect = async (provider: Provider): Promise<void> => {
    try {
      const res = await window.dh.cloudAuthDisconnect({ provider })
      assertCloudAuthOk(res)
      await refreshStatus()
    } catch (e) {
      applyCloudAuthFailure(e)
    }
  }

  if (loading) {
    return <div style={{ padding: '48px 32px', color: 'var(--text-muted)' }}>{t('page.loading')}</div>
  }

  const scopedStyle: ScopedVars = {
    '--cg-accent': theme.accent,
    '--cg-accent-muted': theme.accentMuted,
    '--cg-surface': theme.surface,
    '--cg-surface-deep': theme.surfaceDeep,
  }

  return (
    <div
      className="elevated-page"
      style={{
        minHeight: '100%',
        padding: '28px 32px 48px',
        maxWidth: 1040,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ marginBottom: 22 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
          {t('page.title')}
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14, lineHeight: 1.55 }}>
          {t('page.desc')}
        </p>
      </header>

      {oauthSetupNotice ? (
        <div
          role="status"
          className="hp-card"
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            borderColor: 'color-mix(in srgb, var(--accent) 38%, var(--border))',
            background: 'color-mix(in srgb, var(--accent) 10%, var(--bg-widget))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span
              className="codicon codicon-info"
              style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)', fontSize: 18 }}
              aria-hidden
            />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text)', flex: 1, minWidth: 0 }}>
              {oauthSetupNotice}
            </p>
            <button
              type="button"
              onClick={() => setOauthSetupNotice(null)}
              className="hp-btn"
              style={{ flexShrink: 0, padding: '4px 10px', fontSize: 12 }}
              aria-label={t('notice.dismissAria')}
            >
              {t('notice.dismiss')}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: '12px 16px',
            background: 'color-mix(in srgb, var(--red) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)',
            borderRadius: 8,
            color: 'var(--red)',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label={t('host.label')}
        style={{
          display: 'flex',
          gap: 8,
          padding: 6,
          borderRadius: 16,
          marginBottom: 24,
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
        }}
      >
        {(['github', 'gitlab'] as const).map((p) => {
          const tTab = CLOUD_GIT_PROVIDER_THEME[p]
          const active = activeTab === p
          const m = PROVIDER_META[p]
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={deviceFlow !== null && p !== deviceFlow.provider}
              onClick={() => {
                setActiveTab(p)
                const next = new URLSearchParams(searchParams)
                next.set('provider', p)
                setSearchParams(next, { replace: true })
              }}
              style={{
                flex: 1,
                minHeight: 52,
                padding: '10px 18px',
                borderRadius: 11,
                outline: 'none',
                cursor: deviceFlow !== null && p !== deviceFlow.provider ? 'not-allowed' : 'pointer',
                opacity: deviceFlow !== null && p !== deviceFlow.provider ? 0.4 : 1,
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'var(--font-ui)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                border: active
                  ? `1px solid color-mix(in srgb, ${tTab.accent} 45%, var(--border))`
                  : '1px solid transparent',
                background: active
                  ? `color-mix(in srgb, ${tTab.accent} 14%, var(--bg-panel))`
                  : 'transparent',
                color: active ? tTab.accent : 'var(--text)',
                boxShadow: active ? `0 2px 12px color-mix(in srgb, ${tTab.accent} 20%, transparent)` : 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <span aria-hidden style={{ fontSize: 18 }}>{m.tabEmoji}</span>
              <span className={`codicon codicon-${m.icon}`} style={{ fontSize: 19 }} aria-hidden />
              <span>{t(`provider.${p}`)}</span>
            </button>
          )
        })}
      </div>

      <div style={scopedStyle}>
        {deviceFlow && deviceFlow.provider === activeTab ? (
          <div
            className="hp-card"
            style={{
              padding: '28px 26px',
              marginBottom: 20,
              borderColor: 'var(--cg-accent-muted)',
              background: `linear-gradient(165deg, var(--cg-surface) 0%, var(--bg-widget) 55%)`,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: 'var(--text)' }}>
              {t('oauth.title', { label: t(`provider.${deviceFlow.provider}`) })}
            </div>
            <p className="hp-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              {t('oauth.deviceInstructions', { label: t(`provider.${deviceFlow.provider}`) })}
            </p>
            <p className="hp-muted" style={{ fontSize: 13, marginBottom: 22 }}>
              {t('oauth.openLabel')}{' '}
              <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all' }}>
                {deviceFlow.verification_uri}
              </span>
            </p>
            <div
              className="mono"
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'var(--cg-accent)',
                marginBottom: 22,
                userSelect: 'all',
              }}
            >
              {deviceFlow.user_code}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(deviceFlow.user_code).catch(() => { })
                  void window.dh.openExternal(deviceFlow.verification_uri).catch(() => {
                    setError(
                      t('oauth.browserFallback', { uri: deviceFlow.verification_uri }),
                    )
                  })
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: `1px solid var(--cg-accent-muted)`,
                  background: 'var(--cg-accent)',
                  color: '#0d1117',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span className="codicon codicon-copy" aria-hidden /> {t('oauth.copyOpen')}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
              <span className="codicon codicon-sync codicon-modifier-spin" aria-hidden style={{ flexShrink: 0 }} />
              {t('oauth.waiting')}
              <button
                type="button"
                onClick={cancelDeviceFlow}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 13,
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                {t('oauth.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 20,
              alignItems: 'start',
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.06em',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                {t('account.title')}
              </div>
              <section
                aria-labelledby={`cloud-git-hero-${activeTab}`}
                style={{
                  borderRadius: 18,
                  padding: '28px 26px',
                  marginBottom: 0,
                  border: `1px solid var(--cg-accent-muted)`,
                  background: `linear-gradient(145deg, var(--cg-surface) 0%, var(--bg-widget) 50%, var(--cg-surface-deep) 100%)`,
                  boxShadow: '0 18px 48px rgba(0,0,0,0.22)',
                }}
              >
                {account ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22, alignItems: 'center' }}>
                    {account.avatar_url ? (
                      <img
                        src={account.avatar_url}
                        alt=""
                        style={{
                          width: 80,
                          height: 80,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: `3px solid var(--cg-accent-muted)`,
                          boxShadow: `0 0 0 4px var(--cg-surface-deep)`,
                        }}
                      />
                    ) : (
                      <span
                        className="codicon codicon-account"
                        style={{ fontSize: 72, color: 'var(--cg-accent)', opacity: 0.5 }}
                        aria-hidden
                      />
                    )}
                    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                      <h2 id={`cloud-git-hero-${activeTab}`} style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                        {account.username}
                      </h2>
                      <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 12px',
                            borderRadius: 999,
                            background: 'var(--cg-surface-deep)',
                            border: `1px solid var(--cg-accent-muted)`,
                            color: 'var(--cg-accent)',
                            fontWeight: 650,
                            fontSize: 12,
                            letterSpacing: '0.03em',
                          }}
                        >
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: 'var(--cg-accent)',
                              boxShadow: '0 0 8px var(--cg-accent)',
                            }}
                            aria-hidden
                          />
                          {t('provider.connected')}
                        </span>
                        <span className="hp-muted" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                          {t('provider.connectedAt', { date: account.connected_at.slice(0, 10) })}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void disconnect(activeTab)}
                      className="hp-btn"
                      style={{
                        marginLeft: 'auto',
                        borderColor: 'var(--cg-accent-muted)',
                        color: 'var(--text)',
                      }}
                    >
                      {t('provider.disconnect', { label: t(`provider.${activeTab}`) })}
                    </button>
                  </div>
                ) : (
                  <div>
                    <h2 id={`cloud-git-hero-${activeTab}`} style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                      {t('provider.connect', { label: t(`provider.${activeTab}`) })}
                    </h2>
                    {activeTab === 'gitlab' ? (
                      <p className="hp-muted" style={{ margin: '12px 0 20px', fontSize: 14, lineHeight: 1.55, maxWidth: 520 }}>
                        {t('provider.gitlabConnectDesc')}
                      </p>
                    ) : (
                      <p className="hp-muted" style={{ margin: '12px 0 20px', fontSize: 14, lineHeight: 1.55, maxWidth: 520 }}>
                        {t('provider.githubConnectDesc')}
                      </p>
                    )}
                    {!showPatForm ? (
                      activeTab === 'gitlab' ? (
                        // GitLab uses PAT only — show form directly
                        <div style={{ maxWidth: 420 }}>
                          <input
                            type="text"
                            placeholder={t('host.customPlaceholder')}
                            value={patHost}
                            onChange={(e) => setPatHost(e.target.value)}
                            className="hp-input"
                            style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
                          />
                          <input
                            type="password"
                            placeholder={t('pat.placeholder')}
                            value={patToken}
                            onChange={(e) => setPatToken(e.target.value)}
                            className="hp-input"
                            style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
                          />
                          <p className="hp-muted" style={{ fontSize: 11, margin: '0 0 10px' }}>
                            {t('scopes.required')} {PROVIDER_META['gitlab'].scopes.join(', ')}
                          </p>
                          <div
                            style={{
                              fontSize: 11,
                              padding: '6px 10px',
                              background: 'color-mix(in srgb, var(--orange) 10%, transparent)',
                              border: '1px solid color-mix(in srgb, var(--orange) 20%, transparent)',
                              borderRadius: 6,
                              color: 'var(--orange)',
                              marginBottom: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span className="codicon codicon-info" style={{ fontSize: 13 }} />
                            <span>{t('scopes.gitlabApiNote')}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 10 }}>
                            <button
                              type="button"
                              disabled={connecting || !patToken.trim()}
                              onClick={() => void submitPat()}
                              style={{
                                padding: '10px 18px',
                                borderRadius: 10,
                                border: 'none',
                                background: 'var(--cg-accent)',
                                color: '#1a0b05',
                                fontWeight: 650,
                                fontSize: 13,
                                cursor: connecting ? 'wait' : 'pointer',
                              }}
                            >
                              {connecting ? t('pat.verifying') : t('pat.verify')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={connecting}
                            onClick={() => void startDeviceFlow(activeTab)}
                            style={{
                              padding: '12px 22px',
                              borderRadius: 10,
                              border: 'none',
                              background: 'var(--cg-accent)',
                              color: '#0d1117',
                              fontWeight: 700,
                              fontSize: 14,
                              cursor: connecting ? 'wait' : 'pointer',
                              display: 'inline-flex',
                            }}
                          >
                            {connecting ? t('oauth.connecting') : t('provider.connect', { label: t(`provider.${activeTab}`) })}
                          </button>
                          <button
                            type="button"
                            style={{
                              display: 'block',
                              marginTop: 14,
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              fontSize: 13,
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                            onClick={() => {
                              setPatProvider(activeTab)
                              setPatError(null)
                            }}
                          >
                            {t('provider.switchToPat')}
                          </button>
                        </>
                      )
                    ) : (
                      <div style={{ maxWidth: 420 }}>
                        <input
                          type="text"
                          placeholder={t('host.customTemplate', { host: activeTab })}
                          value={patHost}
                          onChange={(e) => setPatHost(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
                        />
                        <input
                          type="password"
                          placeholder={t('pat.placeholder')}
                          value={patToken}
                          onChange={(e) => setPatToken(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
                        />
                        <p className="hp-muted" style={{ fontSize: 11, margin: '0 0 10px' }}>
                          {t('scopes.required')} {PROVIDER_META[activeTab].scopes.join(', ')}
                        </p>
                        {activeTab === 'gitlab' && (
                          <div
                            style={{
                              fontSize: 11,
                              padding: '6px 10px',
                              background: 'rgba(255,160,0,0.1)',
                              border: '1px solid rgba(255,160,0,0.2)',
                              borderRadius: 6,
                              color: '#ffb74d',
                              marginBottom: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <span className="codicon codicon-info" style={{ fontSize: 13 }} />
                            <span>{t('scopes.gitlabApiNote')}</span>
                          </div>
                        )}
                        {patError ? <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{patError}</p> : null}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            disabled={connecting || !patToken.trim()}
                            onClick={() => void submitPat()}
                            style={{
                              padding: '10px 18px',
                              borderRadius: 10,
                              border: 'none',
                              background: 'var(--cg-accent)',
                              color: activeTab === 'github' ? '#0d1117' : '#1a0b05',
                              fontWeight: 650,
                              fontSize: 13,
                              cursor: connecting ? 'wait' : 'pointer',
                            }}
                          >
                            {t('pat.verify')}
                          </button>
                          {patProvider !== null ? (
                            <button
                              type="button"
                              className="hp-btn"
                              onClick={() => {
                                setPatProvider(null)
                                setPatToken('')
                                setPatError(null)
                              }}
                            >
                              {t('pat.cancel')}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                    <p className="hp-muted" style={{ margin: '18px 0 0', fontSize: 12, lineHeight: 1.5 }}>
                      {t('scopes.list')} {meta.scopes.join(', ')}
                    </p>
                  </div>
                )}
              </section>
            </div>
            <CloudGitActivityPanel
              provider={activeTab}
              label={meta.label}
              repoPath={searchParams.get('repoPath') ?? undefined}
            />
          </div>
        )}
      </div>

      <section style={{ marginTop: 8 }}>
        <details style={{ maxWidth: '100%' }}>
          <summary className="hp-muted" style={{ cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
            {t('advanced.title')}
          </summary>
          <div className="hp-card" style={{ marginTop: 12, padding: 16 }}>
            <p className="hp-muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.5 }}>
              {t('advanced.desc')}
            </p>
            <label className="hp-muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              {t('advanced.clientIdLabel')}
            </label>
            <input
              type="text"
              className="hp-input"
              value={advGithub}
              onChange={(e) => setAdvGithub(e.target.value)}
              placeholder={t('advanced.clientIdPlaceholder')}
              autoComplete="off"
              style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div className="hp-row-wrap" style={{ gap: 10, alignItems: 'center' }}>
              <button type="button" className="hp-btn hp-btn-primary" disabled={advSaving} onClick={() => void saveAdvOauth()}>
                {t('advanced.save')}
              </button>
              {advSaving ? <span className="hp-muted" style={{ fontSize: 12 }}>{t('advanced.saving')}</span> : null}
            </div>
            {advMsg ? (
              <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45 }}>
                {advMsg}
              </p>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  )
}
