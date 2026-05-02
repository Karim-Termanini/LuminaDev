import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { CloudOauthClientsStoreSchema } from '@linux-dev-home/shared'

import { assertCloudAuthOk } from './cloudAuthContract'
import { humanizeCloudAuthError, isCloudAuthOauthNotConfigured } from './cloudAuthError'

type Provider = 'github' | 'gitlab'

type DeviceFlowState = {
  provider: Provider
  user_code: string
  verification_uri: string
  device_code: string
  interval: number
}

const PROVIDER_META: Record<Provider, { label: string; icon: string; scopes: string[] }> = {
  github: {
    label: 'GitHub',
    icon: 'github',
    scopes: ['repo', 'read:org', 'read:user', 'notifications'],
  },
  gitlab: {
    label: 'GitLab',
    icon: 'source-control',
    scopes: ['read_api', 'read_user', 'read_repository', 'write_repository'],
  },
}

export function CloudGitPage(): ReactElement {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  const [patProvider, setPatProvider] = useState<Provider | null>(null)
  const [patToken, setPatToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthSetupNotice, setOauthSetupNotice] = useState<string | null>(null)
  const [patError, setPatError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [advGithub, setAdvGithub] = useState('')
  const [advGitlab, setAdvGitlab] = useState('')
  const [advMsg, setAdvMsg] = useState<string | null>(null)
  const [advSaving, setAdvSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
    void (async () => {
      const raw = await window.dh.storeGet({ key: 'cloud_oauth_clients' })
      const bag = raw as { ok?: boolean; data?: unknown }
      if (!bag.ok || bag.data == null || typeof bag.data !== 'object') return
      const parsed = CloudOauthClientsStoreSchema.safeParse(bag.data)
      if (parsed.success) {
        setAdvGithub(parsed.data.github_client_id ?? '')
        setAdvGitlab(parsed.data.gitlab_client_id ?? '')
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
            applyCloudAuthFailure(new Error(res.error ?? 'Poll failed'))
            return
          }
          if (res.status === 'complete') {
            stopPoll()
            setDeviceFlow(null)
            await refreshStatus()
          } else if (res.status === 'expired') {
            stopPoll()
            setDeviceFlow(null)
            setError('Code expired — click Connect to try again.')
          } else if (res.status === 'denied') {
            stopPoll()
            setDeviceFlow(null)
            setError('Authorization was denied on the provider side.')
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
    if (!patProvider || !patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({
        provider: patProvider,
        token: patToken.trim(),
      })
      assertCloudAuthOk(res)
      setPatProvider(null)
      setPatToken('')
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
        gitlab_client_id: advGitlab.trim() || undefined,
      })
      const res = await window.dh.storeSet({ key: 'cloud_oauth_clients', data })
      if (!res.ok) throw new Error(res.error ?? 'Could not save.')
      setAdvMsg('Saved. Use Connect again to start device flow with these client IDs.')
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
    return <div style={{ padding: '48px 32px', color: 'var(--text-muted)' }}>Loading…</div>
  }

  const connectedProviders = new Set(accounts.map((a) => a.provider as Provider))

  return (
    <div
      style={{
        minHeight: '100%',
        padding: '28px 32px 48px',
        maxWidth: 900,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1 className="hp-title" style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em' }}>
          Cloud Git
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14 }}>
          Connect GitHub and GitLab for upcoming PRs, issues, and CI/CD views. Use device flow (browser) or a personal
          access token—both are supported. If device flow says the app is not registered, add OAuth client IDs under
          Advanced below (or set <span className="mono">LUMINA_*_OAUTH_CLIENT_ID</span> when launching).
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
              aria-label="Dismiss notice"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(255,82,82,0.1)',
            border: '1px solid rgba(255,82,82,0.3)',
            borderRadius: 8,
            color: '#ff8a80',
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {deviceFlow ? (
        <div className="hp-card" style={{ padding: '32px 28px', marginBottom: 24, maxWidth: 480 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            Connecting to {PROVIDER_META[deviceFlow.provider].label}
          </div>
          <p className="hp-muted" style={{ fontSize: 13, marginBottom: 24 }}>
            Enter this code at{' '}
            <span className="mono" style={{ color: 'var(--text)' }}>
              {deviceFlow.verification_uri}
            </span>
          </p>
          <div
            className="mono"
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: 'var(--accent)',
              marginBottom: 24,
              userSelect: 'all',
            }}
          >
            {deviceFlow.user_code}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              onClick={() => {
                void navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {})
                void window.open(deviceFlow.verification_uri, '_blank')
              }}
            >
              <span className="codicon codicon-copy" aria-hidden /> Copy & open browser
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <span className="codicon codicon-sync codicon-modifier-spin" aria-hidden style={{ flexShrink: 0 }} />
            Waiting for authorization…
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
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {accounts.length > 0 ? (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 650, marginBottom: 14 }}>Connected accounts</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {accounts.map((a) => (
              <div
                key={a.provider}
                className="hp-card"
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                {a.avatar_url ? (
                  <img
                    src={a.avatar_url}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    className="codicon codicon-account"
                    style={{ fontSize: 28, color: 'var(--text-muted)' }}
                    aria-hidden
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.username}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '1px 7px',
                        borderRadius: 4,
                        background: 'rgba(124,77,255,0.12)',
                        color: 'var(--accent)',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        marginRight: 8,
                      }}
                    >
                      {a.provider.toUpperCase()}
                    </span>
                    Connected {a.connected_at.slice(0, 10)}
                  </div>
                </div>
                <button
                  type="button"
                  className="hp-btn"
                  style={{ fontSize: 12 }}
                  onClick={() => void disconnect(a.provider as Provider)}
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!deviceFlow ? (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 650, marginBottom: 14 }}>
            {accounts.length > 0 ? 'Add another account' : 'Connect an account'}
          </h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(['github', 'gitlab'] as Provider[])
              .filter((p) => !connectedProviders.has(p))
              .map((p) => {
                const meta = PROVIDER_META[p]
                const isPat = patProvider === p
                return (
                  <div
                    key={p}
                    className="hp-card"
                    style={{ padding: '22px 24px', minWidth: 260, maxWidth: 340, flex: '1 1 260px' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span
                        className={`codicon codicon-${meta.icon}`}
                        style={{ fontSize: 22, color: 'var(--accent)' }}
                        aria-hidden
                      />
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{meta.label}</span>
                    </div>
                    <p className="hp-muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                      Scopes: {meta.scopes.join(', ')}
                    </p>
                    {!isPat ? (
                      <>
                        <button
                          type="button"
                          className="hp-btn hp-btn-primary"
                          style={{ width: '100%', marginBottom: 8 }}
                          disabled={connecting}
                          onClick={() => void startDeviceFlow(p)}
                        >
                          Connect {meta.label}
                        </button>
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: 0,
                            textDecoration: 'underline',
                            width: '100%',
                          }}
                          onClick={() => {
                            setPatProvider(p)
                            setPatError(null)
                          }}
                        >
                          Use a token instead
                        </button>
                      </>
                    ) : (
                      <div>
                        <input
                          type="password"
                          placeholder="Paste personal access token"
                          value={patToken}
                          onChange={(e) => setPatToken(e.target.value)}
                          className="hp-input"
                          style={{
                            width: '100%',
                            marginBottom: 8,
                            boxSizing: 'border-box',
                          }}
                        />
                        {patError ? (
                          <p style={{ color: '#ff8a80', fontSize: 12, margin: '0 0 8px' }}>{patError}</p>
                        ) : null}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="hp-btn hp-btn-primary"
                            style={{ flex: 1 }}
                            disabled={connecting || !patToken.trim()}
                            onClick={() => void submitPat()}
                          >
                            Verify & save
                          </button>
                          <button
                            type="button"
                            className="hp-btn"
                            onClick={() => {
                              setPatProvider(null)
                              setPatToken('')
                              setPatError(null)
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 28 }}>
        <details style={{ maxWidth: 640 }}>
          <summary className="hp-muted" style={{ cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
            Advanced: OAuth client IDs (device flow)
          </summary>
          <div className="hp-card" style={{ marginTop: 12, padding: 16 }}>
            <p className="hp-muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.5 }}>
              Public OAuth application client IDs from your GitHub / GitLab developer settings. Stored locally in{' '}
              <span className="mono">store.json</span>. Required for browser device flow unless the build already
              embeds defaults.
            </p>
            <label className="hp-muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              GitHub client ID
            </label>
            <input
              type="text"
              className="hp-input"
              value={advGithub}
              onChange={(e) => setAdvGithub(e.target.value)}
              placeholder="e.g. Iv1.…"
              autoComplete="off"
              style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <label className="hp-muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              GitLab client ID
            </label>
            <input
              type="text"
              className="hp-input"
              value={advGitlab}
              onChange={(e) => setAdvGitlab(e.target.value)}
              placeholder="Application ID from GitLab OAuth app"
              autoComplete="off"
              style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div className="hp-row-wrap" style={{ gap: 10, alignItems: 'center' }}>
              <button type="button" className="hp-btn hp-btn-primary" disabled={advSaving} onClick={() => void saveAdvOauth()}>
                Save client IDs
              </button>
              {advSaving ? <span className="hp-muted" style={{ fontSize: 12 }}>Saving…</span> : null}
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
