import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { CloudOauthClientsStoreSchema } from '@linux-dev-home/shared'

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
  const [searchParams, setSearchParams] = useSearchParams()

  const parseTab = (raw: string | null): Provider => (raw === 'gitlab' ? 'gitlab' : 'github')

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [activeTab, setActiveTab] = useState<Provider>(() => parseTab(searchParams.get('tab')))
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  const [patProvider, setPatProvider] = useState<Provider | null>(null)
  const [patToken, setPatToken] = useState('')
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
    const next = parseTab(searchParams.get('tab'))
    setActiveTab((cur) => (cur === next ? cur : next))
  }, [searchParams])

  useEffect(() => {
    const q = parseTab(searchParams.get('tab'))
    if (q === activeTab) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', activeTab)
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
    const provider = patProvider ?? (activeTab === 'gitlab' && !account ? 'gitlab' : null)
    if (!provider || !patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({
        provider,
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
      })
      const res = await window.dh.storeSet({ key: 'cloud_oauth_clients', data })
      if (!res.ok) throw new Error(res.error ?? 'Could not save.')
      setAdvMsg('Saved. Use Connect on the GitHub tab again to start device flow with this client ID.')
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

  const scopedStyle: ScopedVars = {
    '--cg-accent': theme.accent,
    '--cg-accent-muted': theme.accentMuted,
    '--cg-surface': theme.surface,
    '--cg-surface-deep': theme.surfaceDeep,
  }

  return (
    <div
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
          Cloud Git
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14, lineHeight: 1.55 }}>
          Choose a provider below. Each tab scopes the layout and accent to that host—PRs and CI views will follow the
          same pattern. Tokens are stored locally for HTTPS Git on the Git VCS page.
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

      <div
        role="tablist"
        aria-label="Git host"
        style={{
          display: 'flex',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          marginBottom: 20,
          background: 'var(--bg-panel)',
        }}
      >
        {(['github', 'gitlab'] as const).map((p) => {
          const t = CLOUD_GIT_PROVIDER_THEME[p]
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
                next.set('tab', p)
                setSearchParams(next, { replace: true })
              }}
              style={{
                flex: 1,
                padding: '16px 18px',
                border: 'none',
                cursor: deviceFlow !== null && p !== deviceFlow.provider ? 'not-allowed' : 'pointer',
                opacity: deviceFlow !== null && p !== deviceFlow.provider ? 0.45 : 1,
                fontSize: 15,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: active ? t.surfaceDeep : 'transparent',
                color: active ? t.accent : 'var(--text-muted)',
                boxShadow: active ? `inset 0 -3px 0 ${t.accent}` : undefined,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {m.tabEmoji ? <span aria-hidden>{m.tabEmoji}</span> : null}
              <span className={`codicon codicon-${m.icon}`} style={{ fontSize: 20, opacity: active ? 1 : 0.75 }} aria-hidden />
              <span>{m.label}</span>
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
              Connecting to {PROVIDER_META[deviceFlow.provider].label}
            </div>
            <p className="hp-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              On GitHub, approve the app and enter this user code if prompted. Keep this page open
              until it shows connected — Lumina polls in the background. If the browser step succeeds
              but this screen never finishes, the OAuth Client ID is usually wrong: set your own under{' '}
              <strong>Advanced</strong> (or use a <strong>personal access token</strong> on this tab).
            </p>
            <p className="hp-muted" style={{ fontSize: 13, marginBottom: 22 }}>
              Open:{' '}
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
                  void navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {})
                  void window.dh.openExternal(deviceFlow.verification_uri).catch(() => {
                    setError(
                      `Could not open the browser automatically. Open ${deviceFlow.verification_uri} manually and paste the code above.`,
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
                <span className="codicon codicon-copy" aria-hidden /> Copy & open browser
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
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
                Account & security
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
                      Connected · HTTPS ready
                    </span>
                    <span className="hp-muted" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                      Linked {account.connected_at.slice(0, 10)} · token stored locally for Git over HTTPS
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
                  Disconnect {meta.label}
                </button>
              </div>
            ) : (
              <div>
                <h2 id={`cloud-git-hero-${activeTab}`} style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                  Connect {meta.label}
                </h2>
                {activeTab === 'gitlab' ? (
                  <p className="hp-muted" style={{ margin: '12px 0 20px', fontSize: 14, lineHeight: 1.55, maxWidth: 520 }}>
                    Paste a <strong>personal access token</strong> from GitLab (Preferences → Access Tokens, or the same
                    path on your self-managed instance). Include the <strong>api</strong> scope so merge requests and API
                    actions work. Credentials stay on this machine and power HTTPS remotes on the Git VCS page.
                  </p>
                ) : (
                  <p className="hp-muted" style={{ margin: '12px 0 20px', fontSize: 14, lineHeight: 1.55, maxWidth: 520 }}>
                    Sign in with device flow (browser) or paste a personal access token. Credentials stay on this machine
                    and power HTTPS remotes on the Git VCS page.
                  </p>
                )}
                {!showPatForm ? (
                  <>
                    <button
                      type="button"
                      disabled={connecting}
                      onClick={() => void startDeviceFlow('github')}
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
                      Connect {meta.label}
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
                        setPatProvider('github')
                        setPatError(null)
                      }}
                    >
                      Use a personal access token instead
                    </button>
                  </>
                ) : (
                  <div style={{ maxWidth: 420 }}>
                    <input
                      type="password"
                      placeholder="Paste personal access token"
                      value={patToken}
                      onChange={(e) => setPatToken(e.target.value)}
                      className="hp-input"
                      style={{ width: '100%', marginBottom: 4, boxSizing: 'border-box' }}
                    />
                    <p className="hp-muted" style={{ fontSize: 11, margin: '0 0 10px' }}>
                      Required scopes: {PROVIDER_META[activeTab].scopes.join(', ')}
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
                        <span>Ensure the 'api' scope is enabled to create and manage Merge Requests.</span>
                      </div>
                    )}
                    {patError ? <p style={{ color: '#ff8a80', fontSize: 12, margin: '0 0 10px' }}>{patError}</p> : null}
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
                        Verify & save
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
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                <p className="hp-muted" style={{ margin: '18px 0 0', fontSize: 12, lineHeight: 1.5 }}>
                  Scopes: {meta.scopes.join(', ')}
                </p>
              </div>
            )}
          </section>
            </div>
            <CloudGitActivityPanel provider={activeTab} label={meta.label} />
          </div>
        )}
      </div>

      <section style={{ marginTop: 8 }}>
        <details style={{ maxWidth: '100%' }}>
          <summary className="hp-muted" style={{ cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
            Advanced: GitHub OAuth client ID (device flow)
          </summary>
          <div className="hp-card" style={{ marginTop: 12, padding: 16 }}>
            <p className="hp-muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.5 }}>
              Public OAuth application client ID from GitHub developer settings. Stored locally in{' '}
              <span className="mono">store.json</span>. Used only for GitHub browser device flow when the build does not
              embed a default client ID.
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
