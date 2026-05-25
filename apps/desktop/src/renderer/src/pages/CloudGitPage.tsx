import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConnectedAccount } from '@linux-dev-home/shared'
import { CloudOauthClientsStoreSchema } from '@linux-dev-home/shared'

import { assertCloudAuthOk } from './cloudAuthContract'
import { CloudGitActivityPanel } from './CloudGitActivityPanel'
import { CLOUD_GIT_PROVIDER_THEME, type CloudGitProviderId } from './cloudGitTheme'
import { humanizeCloudAuthError, isCloudAuthOauthNotConfigured } from './cloudAuthError'

type Provider = CloudGitProviderId

type DeviceFlowState = {
  provider: Provider
  user_code: string
  verification_uri: string
  device_code: string
  interval: number
}

const PROVIDER_META: Record<Provider, { label: string; icon: string; scopes: string[]; emoji: string }> = {
  github: {
    label: 'GitHub',
    icon: 'github',
    scopes: ['repo', 'read:org', 'read:user', 'notifications'],
    emoji: '🐱',
  },
  gitlab: {
    label: 'GitLab',
    icon: 'source-control',
    scopes: ['api', 'read_api', 'read_user', 'read_repository', 'write_repository'],
    emoji: '🦊',
  },
}

export function CloudGitPage(): ReactElement {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  // patProvider + patToken: one active PAT form at a time
  const [patProvider, setPatProvider] = useState<Provider | null>(null)
  const [patToken, setPatToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [oauthSetupNotice, setOauthSetupNotice] = useState<string | null>(null)
  const [patError, setPatError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  // Advanced GitHub OAuth client ID
  const [advGithub, setAdvGithub] = useState('')
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
      if (parsed.success) setAdvGithub(parsed.data.github_client_id ?? '')
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
            stopPoll(); setDeviceFlow(null)
            applyCloudAuthFailure(new Error(res.error ?? 'Poll failed'))
            return
          }
          if (res.status === 'complete') {
            stopPoll(); setDeviceFlow(null); await refreshStatus()
          } else if (res.status === 'expired') {
            stopPoll(); setDeviceFlow(null)
            setError('Code expired — click Connect to try again.')
          } else if (res.status === 'denied') {
            stopPoll(); setDeviceFlow(null)
            setError('Authorization was denied on the provider side.')
          }
        } catch { /* Network hiccup — keep polling */ }
      })()
    }, ms)
  }

  const cancelDeviceFlow = (): void => {
    stopPoll(); setDeviceFlow(null); setError(null); setOauthSetupNotice(null)
  }

  const submitPat = async (provider: Provider): Promise<void> => {
    if (!patToken.trim()) return
    setPatError(null)
    setConnecting(true)
    try {
      const res = await window.dh.cloudAuthConnectPat({ provider, token: patToken.trim() })
      assertCloudAuthOk(res)
      setPatProvider(null); setPatToken(''); setOauthSetupNotice(null)
      await refreshStatus()
    } catch (e) {
      setPatError(humanizeCloudAuthError(e))
    } finally {
      setConnecting(false)
    }
  }

  const saveAdvOauth = async (): Promise<void> => {
    setAdvMsg(null); setAdvSaving(true)
    try {
      const data = CloudOauthClientsStoreSchema.parse({ github_client_id: advGithub.trim() || undefined })
      const res = await window.dh.storeSet({ key: 'cloud_oauth_clients', data })
      if (!res.ok) throw new Error(res.error ?? 'Could not save.')
      setAdvMsg('Saved. Use Connect on the GitHub section to start device flow with this client ID.')
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
    return (
      <div style={{ padding: '64px 32px', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 20 }} />
        Loading accounts…
      </div>
    )
  }

  return (
    <div
      className="elevated-page"
      style={{ minHeight: '100%', padding: '28px 32px 64px', maxWidth: 1040, margin: '0 auto', boxSizing: 'border-box' }}
    >
      {/* Page Header */}
      <header style={{ marginBottom: 32 }}>
        <h1 className="hp-title" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
          Cloud Git
        </h1>
        <p className="hp-muted" style={{ marginTop: 10, maxWidth: 560, fontSize: 14, lineHeight: 1.6 }}>
          Connect your GitHub and GitLab accounts. Tokens are stored locally and power HTTPS remotes on the Git VCS page.
        </p>
      </header>

      {/* Global notices */}
      {oauthSetupNotice && (
        <div className="hp-card" role="status" style={{ marginBottom: 20, padding: '14px 16px', borderColor: 'color-mix(in srgb, var(--accent) 38%, var(--border))', background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-widget))' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span className="codicon codicon-info" style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)', fontSize: 18 }} aria-hidden />
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text)', flex: 1 }}>{oauthSetupNotice}</p>
            <button type="button" onClick={() => setOauthSetupNotice(null)} className="hp-btn" style={{ flexShrink: 0, padding: '4px 10px', fontSize: 12 }}>Dismiss</button>
          </div>
        </div>
      )}
      {error && (
        <div style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', borderRadius: 10, color: 'var(--red)', marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Two provider sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        {(['github', 'gitlab'] as const).map((p) => {
          const t = CLOUD_GIT_PROVIDER_THEME[p]
          const m = PROVIDER_META[p]
          const acct = accounts.find((a) => a.provider === p) ?? null
          const isFlowing = deviceFlow?.provider === p
          const isPatOpen = patProvider === p

          return (
            <section key={p} aria-labelledby={`cg-hdr-${p}`}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `color-mix(in srgb, ${t.accent} 14%, var(--bg-widget))`,
                  border: `1px solid color-mix(in srgb, ${t.accent} 35%, var(--border))`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className={`codicon codicon-${m.icon}`} style={{ fontSize: 22, color: t.accent }} aria-hidden />
                </div>
                <div>
                  <h2 id={`cg-hdr-${p}`} style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                    {m.emoji} {m.label}
                  </h2>
                  <span style={{ fontSize: 12, fontWeight: 600, color: acct ? t.accent : 'var(--text-muted)' }}>
                    {acct ? '● Connected' : '○ Not connected'}
                  </span>
                </div>
              </div>

              {/* Provider card */}
              <div className="hp-card" style={{
                padding: '24px 26px',
                border: `1px solid color-mix(in srgb, ${t.accent} ${acct ? 35 : 20}%, var(--border))`,
              }}>
                {/* ── Device flow in progress ── */}
                {isFlowing && deviceFlow ? (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, color: 'var(--text)' }}>
                      Connecting to {m.label}…
                    </div>
                    <p className="hp-muted" style={{ fontSize: 13, marginBottom: 8 }}>
                      Open this URL in your browser, then enter the code below:
                    </p>
                    <p style={{ margin: '0 0 16px', fontSize: 13 }}>
                      <span className="mono" style={{ color: 'var(--text)', wordBreak: 'break-all' }}>{deviceFlow.verification_uri}</span>
                    </p>
                    <div className="mono" style={{ fontSize: 34, fontWeight: 700, letterSpacing: '0.14em', color: t.accent, marginBottom: 20, userSelect: 'all' }}>
                      {deviceFlow.user_code}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(deviceFlow.user_code).catch(() => {})
                          void window.dh.openExternal(deviceFlow.verification_uri).catch(() => {
                            setError(`Could not open browser. Open ${deviceFlow.verification_uri} manually.`)
                          })
                        }}
                        style={{ padding: '10px 18px', borderRadius: 10, border: `1px solid color-mix(in srgb, ${t.accent} 40%, transparent)`, background: t.accent, color: '#0d1117', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className="codicon codicon-copy" aria-hidden /> Copy &amp; open browser
                      </button>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                        <span className="codicon codicon-sync codicon-modifier-spin" aria-hidden />
                        Waiting for authorization…
                      </span>
                      <button type="button" onClick={cancelDeviceFlow}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                        Cancel
                      </button>
                    </div>
                  </div>

                /* ── Already connected ── */
                ) : acct ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
                    {acct.avatar_url
                      ? <img src={acct.avatar_url} alt="" style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: `3px solid color-mix(in srgb, ${t.accent} 45%, transparent)` }} />
                      : <span className="codicon codicon-account" style={{ fontSize: 60, color: t.accent, opacity: 0.55 }} aria-hidden />
                    }
                    <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 700 }}>{acct.username}</div>
                      <div style={{ marginTop: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 999, background: `color-mix(in srgb, ${t.accent} 12%, var(--bg-widget))`, border: `1px solid color-mix(in srgb, ${t.accent} 30%, var(--border))`, color: t.accent, fontWeight: 650, fontSize: 12 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, boxShadow: `0 0 8px ${t.accent}` }} aria-hidden />
                          Connected · HTTPS ready
                        </span>
                      </div>
                      <div className="hp-muted" style={{ fontSize: 12, marginTop: 8 }}>
                        Linked {acct.connected_at.slice(0, 10)} · token stored locally for Git over HTTPS
                      </div>
                    </div>
                    <button type="button" onClick={() => void disconnect(p)} className="hp-btn"
                      style={{ borderColor: `color-mix(in srgb, ${t.accent} 40%, var(--border))` }}>
                      Disconnect {m.label}
                    </button>
                  </div>

                /* ── Not connected ── */
                ) : (
                  <div>
                    <p className="hp-muted" style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, maxWidth: 520 }}>
                      {p === 'gitlab'
                        ? <>Paste a <strong>personal access token</strong> from GitLab (Preferences → Access Tokens). Include the <strong>api</strong> scope for Merge Requests and full CI access.</>
                        : <>Sign in via browser (device flow) or paste a personal access token. Credentials stay on this machine and power HTTPS remotes.</>
                      }
                    </p>

                    {/* GitLab: always show PAT form */}
                    {p === 'gitlab' ? (
                      <div style={{ maxWidth: 440 }}>
                        <input type="password"
                          placeholder="Paste GitLab personal access token"
                          value={patProvider === 'gitlab' ? patToken : ''}
                          onChange={(e) => { setPatProvider('gitlab'); setPatToken(e.target.value) }}
                          onFocus={() => { if (patProvider !== 'gitlab') { setPatProvider('gitlab'); setPatToken('') } }}
                          className="hp-input"
                          style={{ width: '100%', marginBottom: 6, boxSizing: 'border-box' }}
                        />
                        <p className="hp-muted" style={{ fontSize: 11, margin: '0 0 10px' }}>
                          Required scopes: {m.scopes.join(', ')}
                        </p>
                        <div style={{ fontSize: 11, padding: '6px 10px', background: 'color-mix(in srgb, var(--orange) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--orange) 20%, transparent)', borderRadius: 8, color: 'var(--orange)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="codicon codicon-info" style={{ fontSize: 13 }} />
                          <span>Make sure the <strong>api</strong> scope is selected so Merge Requests and CI work correctly.</span>
                        </div>
                        {patError && patProvider === 'gitlab' && (
                          <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{patError}</p>
                        )}
                        <button type="button"
                          disabled={connecting || !(patProvider === 'gitlab' ? patToken : '').trim()}
                          onClick={() => void submitPat('gitlab')}
                          style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: t.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: connecting ? 'wait' : 'pointer' }}>
                          {connecting && patProvider === 'gitlab' ? 'Verifying…' : 'Verify & save'}
                        </button>
                      </div>

                    /* GitHub: device flow button or PAT form */
                    ) : isPatOpen ? (
                      <div style={{ maxWidth: 440 }}>
                        <input type="password"
                          placeholder="Paste GitHub personal access token"
                          value={patToken}
                          onChange={(e) => setPatToken(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%', marginBottom: 6, boxSizing: 'border-box' }}
                        />
                        <p className="hp-muted" style={{ fontSize: 11, margin: '0 0 12px' }}>
                          Required scopes: {m.scopes.join(', ')}
                        </p>
                        {patError && patProvider === 'github' && (
                          <p style={{ color: 'var(--red)', fontSize: 12, margin: '0 0 10px' }}>{patError}</p>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button type="button"
                            disabled={connecting || !patToken.trim()}
                            onClick={() => void submitPat('github')}
                            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: t.accent, color: '#0d1117', fontWeight: 700, fontSize: 13, cursor: connecting ? 'wait' : 'pointer' }}>
                            {connecting && patProvider === 'github' ? 'Verifying…' : 'Verify & save'}
                          </button>
                          <button type="button" className="hp-btn"
                            onClick={() => { setPatProvider(null); setPatToken(''); setPatError(null) }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button type="button"
                          disabled={connecting || (deviceFlow !== null && deviceFlow.provider !== 'github')}
                          onClick={() => void startDeviceFlow('github')}
                          style={{ padding: '12px 22px', borderRadius: 10, border: 'none', background: t.accent, color: '#0d1117', fontWeight: 700, fontSize: 14, cursor: connecting ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                          <span className={`codicon codicon-${m.icon}`} aria-hidden />
                          {connecting ? 'Connecting…' : `Connect ${m.label}`}
                        </button>
                        <button type="button"
                          style={{ display: 'block', marginTop: 12, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}
                          onClick={() => { setPatProvider('github'); setPatToken(''); setPatError(null) }}>
                          Use a personal access token instead
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Activity panel — only shown when connected */}
              {acct && (
                <div style={{ marginTop: 18 }}>
                  <CloudGitActivityPanel provider={p} label={m.label} />
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Advanced: GitHub OAuth client ID */}
      <section style={{ marginTop: 40 }}>
        <details>
          <summary className="hp-muted" style={{ cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
            Advanced: GitHub OAuth client ID (device flow)
          </summary>
          <div className="hp-card" style={{ marginTop: 12, padding: 18 }}>
            <p className="hp-muted" style={{ margin: '0 0 14px', fontSize: 12, lineHeight: 1.55 }}>
              Public OAuth application client ID from GitHub developer settings. Stored locally in{' '}
              <span className="mono">store.json</span>. Used only for GitHub browser device flow when the build does not embed a default client ID.
            </p>
            <label className="hp-muted" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              GitHub client ID
            </label>
            <input type="text" className="hp-input"
              value={advGithub}
              onChange={(e) => setAdvGithub(e.target.value)}
              placeholder="e.g. Iv1.…"
              autoComplete="off"
              style={{ width: '100%', marginBottom: 12, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="hp-btn hp-btn-primary" disabled={advSaving} onClick={() => void saveAdvOauth()}>
                Save client ID
              </button>
              {advSaving && <span className="hp-muted" style={{ fontSize: 12 }}>Saving…</span>}
            </div>
            {advMsg && <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45 }}>{advMsg}</p>}
          </div>
        </details>
      </section>
    </div>
  )
}
