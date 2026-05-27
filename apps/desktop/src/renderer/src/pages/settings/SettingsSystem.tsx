import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

function hostExecStringResult(
  res: unknown,
  fallbackError: string,
): { ok: true; text: string } | { ok: false; error: string } {
  const h = res as { ok: boolean; result?: unknown; error?: string }
  if (h.ok && typeof h.result === 'string') return { ok: true, text: h.result }
  return { ok: false, error: h.error ?? fallbackError }
}

type ParsedEnvRow = { key: string; value: string }

function parseProcessEnvText(text: string): ParsedEnvRow[] {
  const rows: ParsedEnvRow[] = []
  for (const line of text.split('\n')) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    rows.push({ key, value: line.slice(idx + 1) })
  }
  return rows
}

type ParsedHostsRow =
  | { kind: 'comment'; text: string }
  | { kind: 'entry'; ip: string; hostnames: string; raw: string }

function parseHostsText(text: string): ParsedHostsRow[] {
  const out: ParsedHostsRow[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const t = line.trim()
    if (t === '') continue
    if (t.startsWith('#')) {
      out.push({ kind: 'comment', text: t })
      continue
    }
    const noComment = line.split('#')[0]?.trim() ?? ''
    const parts = noComment.split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      out.push({ kind: 'comment', text: t })
      continue
    }
    const ip = parts[0] ?? ''
    const hostnames = parts.slice(1).join(' ')
    out.push({ kind: 'entry', ip, hostnames, raw: t })
  }
  return out
}

const listShell: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: 'color-mix(in srgb, var(--bg-input) 92%, var(--bg-panel))',
  maxHeight: 380,
  overflow: 'auto',
}

function PathSegmentList({ value }: { value: string }): ReactElement {
  const { t } = useTranslation('settings')
  const segments = value.split(':').filter(Boolean)
  const [showAll, setShowAll] = useState(false)
  const cap = 8
  const slice = showAll ? segments : segments.slice(0, cap)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, lineHeight: 1.45 }}>
        {slice.map((seg, i) => (
          <li key={i} className="mono" style={{ wordBreak: 'break-all', color: 'var(--text)' }}>
            {seg}
          </li>
        ))}
      </ul>
      {segments.length > cap ? (
        <button type="button" className="hp-btn" style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px' }} onClick={() => setShowAll(!showAll)}>
          {showAll ? t('system.showFewer', { count: cap }) : t('system.showAllPath', { count: segments.length })}
        </button>
      ) : null}
    </div>
  )
}

function EnvValueDisplay({ envKey, value }: { envKey: string; value: string }): ReactElement {
  const { t } = useTranslation('settings')
  const [open, setOpen] = useState(false)
  if (envKey === 'PATH' && value.includes(':')) {
    return <PathSegmentList value={value} />
  }
  const long = value.length > 180
  if (!long) {
    return (
      <span className="mono" style={{ fontSize: 12, lineHeight: 1.55, wordBreak: 'break-word', color: 'var(--text)' }}>
        {value}
      </span>
    )
  }
  return (
    <div>
      <div
        className="mono"
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          wordBreak: 'break-word',
          whiteSpace: open ? 'pre-wrap' : 'normal',
          maxHeight: open ? 'none' : '4.35em',
          overflow: open ? 'visible' : 'hidden',
          color: 'var(--text)',
          maskImage: open ? 'none' : 'linear-gradient(to bottom, #000 50%, transparent)',
        }}
      >
        {value}
      </div>
      <button
        type="button"
        className="hp-btn"
        style={{ marginTop: 8, fontSize: 12, padding: '4px 12px' }}
        onClick={() => setOpen(!open)}
      >
        {open ? t('system.showLess') : t('system.showFullValue')}
      </button>
    </div>
  )
}

export function SettingsSystem(): ReactElement {
  const { t } = useTranslation('settings')
  const [hostsPreview, setHostsPreview] = useState<string | null>(null)
  const [hostsErr, setHostsErr] = useState<string | null>(null)
  const [hostsBusy, setHostsBusy] = useState(false)
  const [hostsEditing, setHostsEditing] = useState(false)
  const [hostsDraft, setHostsDraft] = useState('')
  const [hostsSaving, setHostsSaving] = useState(false)
  const [hostsSaveMsg, setHostsSaveMsg] = useState<string | null>(null)

  const [profileEnvContent, setProfileEnvContent] = useState<string | null>(null)
  const [profileEnvPath, setProfileEnvPath] = useState('')
  const [profileEnvBusy, setProfileEnvBusy] = useState(false)
  const [profileEnvErr, setProfileEnvErr] = useState<string | null>(null)
  const [profileEnvNewKey, setProfileEnvNewKey] = useState('')
  const [profileEnvNewVal, setProfileEnvNewVal] = useState('')
  const [profileEnvDiff, setProfileEnvDiff] = useState<{ key: string; value: string; action: 'set' | 'remove' } | null>(null)
  const [profileEnvSaving, setProfileEnvSaving] = useState(false)

  const [envPreview, setEnvPreview] = useState<string | null>(null)
  const [envErr, setEnvErr] = useState<string | null>(null)
  const [envBusy, setEnvBusy] = useState(false)

  const [envFilter, setEnvFilter] = useState('')
  const [hostsFilter, setHostsFilter] = useState('')

  const parsedEnvRows = useMemo(() => (envPreview ? parseProcessEnvText(envPreview) : []), [envPreview])
  const parsedHostsRows = useMemo(() => (hostsPreview ? parseHostsText(hostsPreview) : []), [hostsPreview])

  const filteredEnvRows = useMemo(() => {
    const q = envFilter.trim().toLowerCase()
    if (!q) return parsedEnvRows
    return parsedEnvRows.filter((r) => r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q))
  }, [parsedEnvRows, envFilter])

  const filteredHostsRows = useMemo(() => {
    const q = hostsFilter.trim().toLowerCase()
    if (!q) return parsedHostsRows
    return parsedHostsRows.filter((row) => {
      if (row.kind === 'comment') return row.text.toLowerCase().includes(q)
      return (
        row.ip.toLowerCase().includes(q) ||
        row.hostnames.toLowerCase().includes(q) ||
        row.raw.toLowerCase().includes(q)
      )
    })
  }, [parsedHostsRows, hostsFilter])

  const parsedProfileExports = useMemo(() => {
    if (!profileEnvContent) return []
    return profileEnvContent.split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('export '))
      .map((l) => {
        const rest = l.slice('export '.length)
        const eq = rest.indexOf('=')
        if (eq < 0) return null
        return { key: rest.slice(0, eq), value: rest.slice(eq + 1).replace(/^["']|["']$/g, '') }
      })
      .filter(Boolean) as { key: string; value: string }[]
  }, [profileEnvContent])

  useEffect(() => {
    setHostsBusy(true)
    setEnvBusy(true)
    void Promise.all([
      window.dh.hostExec({ command: 'settings_read_hosts' }),
      window.dh.hostExec({ command: 'settings_process_env' }),
    ]).then(([hr, er]) => {
      const hostsParsed = hostExecStringResult(hr, t('system.failedReadHosts'))
      if (hostsParsed.ok) {
        setHostsPreview(hostsParsed.text)
        setHostsErr(null)
      } else {
        setHostsPreview(null)
        setHostsErr(hostsParsed.error)
      }
      const envParsed = hostExecStringResult(er, t('system.failedEnvPreview'))
      if (envParsed.ok) {
        setEnvPreview(envParsed.text)
        setEnvErr(null)
      } else {
        setEnvPreview(null)
        setEnvErr(envParsed.error)
      }
    }).catch((e: unknown) => {
      setHostsPreview(null)
      setHostsErr(e instanceof Error ? e.message : t('system.failedReadHosts'))
      setEnvPreview(null)
      setEnvErr(e instanceof Error ? e.message : t('system.failedEnvPreview'))
    }).finally(() => {
      setHostsBusy(false)
      setEnvBusy(false)
    })
  }, [])

  async function refreshHosts(): Promise<void> {
    setHostsBusy(true)
    setHostsErr(null)
    try {
      const hr = await window.dh.hostExec({ command: 'settings_read_hosts' })
      const parsed = hostExecStringResult(hr, t('system.failedReadHosts'))
      if (parsed.ok) {
        setHostsPreview(parsed.text)
        setHostsErr(null)
      } else {
        setHostsPreview(null)
        setHostsErr(parsed.error)
      }
    } catch (e) {
      setHostsPreview(null)
      setHostsErr(e instanceof Error ? e.message : t('system.failedReadHosts'))
    } finally {
      setHostsBusy(false)
    }
  }

  async function refreshEnv(): Promise<void> {
    setEnvBusy(true)
    setEnvErr(null)
    try {
      const er = await window.dh.hostExec({ command: 'settings_process_env' })
      const parsed = hostExecStringResult(er, t('system.failedEnvPreview'))
      if (parsed.ok) {
        setEnvPreview(parsed.text)
        setEnvErr(null)
      } else {
        setEnvPreview(null)
        setEnvErr(parsed.error)
      }
    } catch (e) {
      setEnvPreview(null)
      setEnvErr(e instanceof Error ? e.message : t('system.failedEnvPreview'))
    } finally {
      setEnvBusy(false)
    }
  }

  async function saveHosts(): Promise<void> {
    setHostsSaving(true)
    setHostsSaveMsg(null)
    try {
      const res = await window.dh.hostExec({ command: 'settings_write_hosts', content: hostsDraft })
      if ((res as { ok: boolean }).ok) {
        setHostsSaveMsg(t('system.saved'))
        setHostsPreview(hostsDraft)
        setHostsEditing(false)
      } else {
        setHostsSaveMsg((res as { error?: string }).error ?? t('system.saveFailed'))
      }
    } catch (e) {
      setHostsSaveMsg(e instanceof Error ? e.message : t('system.saveFailed'))
    } finally {
      setHostsSaving(false)
    }
  }

  async function loadProfileEnv(): Promise<void> {
    setProfileEnvBusy(true)
    setProfileEnvErr(null)
    try {
      const res = await window.dh.hostExec({ command: 'settings_read_profile_env' }) as { ok: boolean; result?: string; path?: string; error?: string }
      if (res.ok) {
        setProfileEnvContent(res.result ?? '')
        setProfileEnvPath(res.path ?? '~/.profile')
      } else {
        setProfileEnvErr(res.error ?? t('system.failedReadProfile'))
      }
    } catch (e) {
      setProfileEnvErr(e instanceof Error ? e.message : t('system.failedReadProfile'))
    } finally {
      setProfileEnvBusy(false)
    }
  }

  async function applyProfileEnvDiff(): Promise<void> {
    if (!profileEnvDiff) return
    setProfileEnvSaving(true)
    try {
      const res = await window.dh.hostExec({
        command: 'settings_write_profile_env',
        action: profileEnvDiff.action,
        key: profileEnvDiff.key,
        value: profileEnvDiff.value,
      }) as { ok: boolean; error?: string }
      if (res.ok) {
        setProfileEnvDiff(null)
        setProfileEnvNewKey('')
        setProfileEnvNewVal('')
        await loadProfileEnv()
      } else {
        setProfileEnvErr(res.error ?? t('system.writeFailed'))
        setProfileEnvDiff(null)
      }
    } catch (e) {
      setProfileEnvErr(e instanceof Error ? e.message : t('system.writeFailed'))
    } finally {
      setProfileEnvSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Hosts file preview */}
      <section>
        <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{t('system.hostsFile')}</div>
            <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
              {t('system.hostsFileDesc')}
            </p>
          </div>
          <button type="button" className="hp-btn" disabled={hostsBusy} onClick={() => void refreshHosts()}>
            <span className="codicon codicon-refresh" aria-hidden />
            {t('system.refresh')}
          </button>
        </div>
        {hostsPreview !== null && parsedHostsRows.length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <div className="hp-row" style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
              <span
                className="codicon codicon-search"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                aria-hidden
              />
              <input
                type="search" className="hp-input" placeholder={t('system.filterLines')}
                value={hostsFilter} onChange={(e) => setHostsFilter(e.target.value)}
                aria-label={t('system.filterHostsLabel')} style={{ paddingLeft: 36, width: '100%' }}
              />
            </div>
            <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {t('system.showingLines', { count: filteredHostsRows.length, total: parsedHostsRows.length })}
            </p>
          </div>
        ) : null}
        {hostsErr ? <div className="hp-status-alert error">{hostsErr}</div> : null}
        {hostsBusy && hostsPreview === null && !hostsErr ? (
          <p className="hp-muted" style={{ marginTop: 12 }}>{t('system.loading')}</p>
        ) : null}
        {hostsPreview !== null && parsedHostsRows.length === 0 && !hostsErr ? (
          <pre className="mono" style={{ marginTop: 12, padding: 14, fontSize: 12, lineHeight: 1.5, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {hostsPreview}
          </pre>
        ) : null}
        {hostsPreview !== null && parsedHostsRows.length > 0 && filteredHostsRows.length === 0 && !hostsErr ? (
          <p className="hp-muted">{t('system.noLinesMatch')}</p>
        ) : null}
        {hostsPreview !== null && filteredHostsRows.length > 0 ? (
          <div style={listShell}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-widget)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', width: 148 }}>
                    {t('system.address')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('system.hostNames')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredHostsRows.map((row, i) =>
                  row.kind === 'comment' ? (
                    <tr key={`c-${i}-${row.text.slice(0, 32)}`} style={{ background: 'color-mix(in srgb, var(--text-muted) 6%, transparent)' }}>
                      <td colSpan={2} style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.45 }}>
                        {row.text}
                      </td>
                    </tr>
                  ) : (
                    <tr key={`e-${i}-${row.ip}-${row.hostnames.slice(0, 20)}`}
                      style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                      <td className="mono" style={{ padding: '10px 14px', verticalAlign: 'top', color: 'var(--accent)', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.ip}
                      </td>
                      <td style={{ padding: '10px 14px', verticalAlign: 'top', wordBreak: 'break-word' }}>
                        {row.hostnames}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Environment preview */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{t('system.environment')}</div>
            <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520 }}>
              {t('system.environmentDesc')}
            </p>
          </div>
          <button type="button" className="hp-btn" disabled={envBusy} onClick={() => void refreshEnv()}>
            <span className="codicon codicon-refresh" aria-hidden />
            {t('system.refresh')}
          </button>
        </div>
        {envPreview !== null && parsedEnvRows.length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            <div className="hp-row" style={{ position: 'relative', width: '100%', maxWidth: 420 }}>
              <span
                className="codicon codicon-search"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                aria-hidden
              />
              <input
                type="search" className="hp-input" placeholder={t('system.filterEnv')}
                value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}
                aria-label={t('system.filterEnvLabel')} style={{ paddingLeft: 36, width: '100%' }}
              />
            </div>
            <p className="hp-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
              {t('system.showingVariables', { count: filteredEnvRows.length, total: parsedEnvRows.length })}
            </p>
          </div>
        ) : null}
        {envErr ? <div className="hp-status-alert error">{envErr}</div> : null}
        {envBusy && envPreview === null && !envErr ? (
          <p className="hp-muted" style={{ marginTop: 12 }}>{t('system.loading')}</p>
        ) : null}
        {envPreview !== null && parsedEnvRows.length === 0 && !envErr ? (
          <p className="hp-muted mono" style={{ fontSize: 12, lineHeight: 1.5 }}>{envPreview}</p>
        ) : null}
        {envPreview !== null && parsedEnvRows.length > 0 && filteredEnvRows.length === 0 && !envErr ? (
          <p className="hp-muted">{t('system.noVariablesMatch')}</p>
        ) : null}
        {envPreview !== null && filteredEnvRows.length > 0 ? (
          <div style={listShell}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-widget)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', width: 200 }}>
                    {t('system.name')}
                  </th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('system.value')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredEnvRows.map((row, i) => (
                  <tr key={`${row.key}-${i}`}
                    style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'color-mix(in srgb, var(--accent) 4%, transparent)' }}>
                    <td style={{ padding: '12px 14px', verticalAlign: 'top', fontWeight: 650, color: 'var(--text)', fontSize: 13 }}>
                      {row.key}
                    </td>
                    <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                      <EnvValueDisplay envKey={row.key} value={row.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Hosts editor */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{t('system.hostsEditor')}</div>
            <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520, fontSize: 13 }}>
              {t('system.hostsEditorDesc')}
            </p>
          </div>
          {!hostsEditing ? (
            <button type="button" className="hp-btn" disabled={hostsBusy}
              onClick={() => { setHostsDraft(hostsPreview ?? ''); setHostsSaveMsg(null); setHostsEditing(true) }}>
              <span className="codicon codicon-edit" aria-hidden /> {t('system.edit')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="hp-btn" onClick={() => setHostsEditing(false)} disabled={hostsSaving}>{t('system.cancel')}</button>
              <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveHosts()} disabled={hostsSaving}>
                {hostsSaving ? t('system.saving') : t('system.save')}
              </button>
            </div>
          )}
        </div>
        {hostsEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={hostsDraft} onChange={(e) => setHostsDraft(e.target.value)} rows={14} className="mono"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 12, resize: 'vertical', fontFamily: 'monospace' }}
            />
            {hostsSaveMsg ? (
              <p style={{ margin: 0, fontSize: 12, color: hostsSaveMsg === t('system.saved') ? 'var(--green)' : 'var(--red)' }}>{hostsSaveMsg}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Profile-scoped env */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div className="hp-row-wrap" style={{ justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
          <div>
            <div style={{ fontWeight: 650, fontSize: 14 }}>{t('system.profileEnv')} ({profileEnvPath || '~/.profile'})</div>
            <p className="hp-muted" style={{ margin: '6px 0 0', maxWidth: 520, fontSize: 13 }}>
              {t('system.profileEnvDesc')}
            </p>
          </div>
          <button type="button" className="hp-btn" disabled={profileEnvBusy} onClick={() => void loadProfileEnv()}>
            <span className="codicon codicon-refresh" aria-hidden /> {profileEnvContent === null ? t('system.load') : t('system.refresh')}
          </button>
        </div>
        {profileEnvErr ? <div className="hp-status-alert error" style={{ marginBottom: 10 }}>{profileEnvErr}</div> : null}
        {profileEnvContent !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {parsedProfileExports.length > 0 ? (
              <div style={listShell}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <tbody>
                    {parsedProfileExports.map((row) => (
                      <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 650, width: 180 }} className="mono">{row.key}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }} className="mono">{row.value}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <button type="button" className="hp-btn" style={{ fontSize: 11, padding: '3px 10px', color: 'var(--red)' }}
                            onClick={() => setProfileEnvDiff({ key: row.key, value: row.value, action: 'remove' })}>
                            {t('system.remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="hp-muted" style={{ fontSize: 13 }}>{t('system.noExportLines', { path: profileEnvPath })}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" className="mono hp-input" placeholder={t('system.keyPlaceholder')} value={profileEnvNewKey}
                onChange={(e) => setProfileEnvNewKey(e.target.value)} style={{ width: 140, fontSize: 12 }} />
              <span style={{ color: 'var(--text-muted)' }}>=</span>
              <input type="text" className="hp-input" placeholder={t('system.valuePlaceholder')} value={profileEnvNewVal}
                onChange={(e) => setProfileEnvNewVal(e.target.value)} style={{ flex: '1 1 160px', fontSize: 12 }} />
              <button type="button" className="hp-btn hp-btn-primary" style={{ fontSize: 12 }}
                disabled={!profileEnvNewKey.trim()}
                onClick={() => setProfileEnvDiff({ key: profileEnvNewKey.trim(), value: profileEnvNewVal, action: 'set' })}>
                {t('system.addUpdate')}
              </button>
            </div>
          </div>
        ) : null}
        {profileEnvDiff ? (
          <div style={{ marginTop: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(124,77,255,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t('system.previewChange')}</div>
            <pre className="mono" style={{ margin: 0, fontSize: 12, color: profileEnvDiff.action === 'remove' ? 'var(--red)' : 'var(--green)' }}>
              {profileEnvDiff.action === 'remove'
                ? `- export ${profileEnvDiff.key}=...`
                : `+ export ${profileEnvDiff.key}=${profileEnvDiff.value}`}
            </pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="hp-btn" onClick={() => setProfileEnvDiff(null)} disabled={profileEnvSaving}>{t('system.cancel')}</button>
              <button type="button" className="hp-btn hp-btn-primary" onClick={() => void applyProfileEnvDiff()} disabled={profileEnvSaving}>
                {profileEnvSaving ? t('system.applying') : t('system.apply')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
