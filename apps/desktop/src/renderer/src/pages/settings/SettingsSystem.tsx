import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { hostsHasChanges, hostsLineDiff } from './settingsHostsDiff'
import {
  SettingsCard,
  SettingsDataTable,
  SettingsFeedback,
  SettingsSegmented,
  SettingsStack,
} from './SettingsUi'

type SystemView = 'overview' | 'hosts' | 'shell'

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
  const [hostsBusy, setHostsBusy] = useState(true)
  const [hostsEditing, setHostsEditing] = useState(false)
  const [hostsDraft, setHostsDraft] = useState('')
  const [hostsSaving, setHostsSaving] = useState(false)
  const [hostsSaveMsg, setHostsSaveMsg] = useState<string | null>(null)
  const [hostsSaveReview, setHostsSaveReview] = useState(false)

  const [profileEnvContent, setProfileEnvContent] = useState<string | null>(null)
  const [profileEnvPath, setProfileEnvPath] = useState('')
  const [profileEnvBusy, setProfileEnvBusy] = useState(true)
  const [profileEnvErr, setProfileEnvErr] = useState<string | null>(null)
  const [profileEnvNewKey, setProfileEnvNewKey] = useState('')
  const [profileEnvNewVal, setProfileEnvNewVal] = useState('')
  const [profileEnvDiff, setProfileEnvDiff] = useState<{ key: string; value: string; action: 'set' | 'remove' } | null>(null)
  const [profileEnvSaving, setProfileEnvSaving] = useState(false)
  const [systemView, setSystemView] = useState<SystemView>('overview')

  const [envPreview, setEnvPreview] = useState<string | null>(null)
  const [envErr, setEnvErr] = useState<string | null>(null)
  const [envBusy, setEnvBusy] = useState(true)

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

  const hostsDiffLines = useMemo(() => {
    if (!hostsSaveReview || hostsPreview === null) return []
    return hostsLineDiff(hostsPreview, hostsDraft)
  }, [hostsSaveReview, hostsPreview, hostsDraft])

  useEffect(() => {
    void Promise.all([
      window.dh.hostExec({ command: 'settings_read_hosts' }),
      window.dh.hostExec({ command: 'settings_process_env' }),
      window.dh.hostExec({ command: 'settings_read_profile_env' }),
    ]).then(([hr, er, pr]) => {
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
      const profileRes = pr as { ok: boolean; result?: string; path?: string; error?: string }
      if (profileRes.ok) {
        setProfileEnvContent(profileRes.result ?? '')
        setProfileEnvPath(profileRes.path ?? '~/.profile')
        setProfileEnvErr(null)
      } else {
        setProfileEnvErr(profileRes.error ?? t('system.failedReadProfile'))
      }
    }).catch((e: unknown) => {
      setHostsPreview(null)
      setHostsErr(e instanceof Error ? e.message : t('system.failedReadHosts'))
      setEnvPreview(null)
      setEnvErr(e instanceof Error ? e.message : t('system.failedEnvPreview'))
      setProfileEnvErr(e instanceof Error ? e.message : t('system.failedReadProfile'))
    }).finally(() => {
      setHostsBusy(false)
      setEnvBusy(false)
      setProfileEnvBusy(false)
    })
  }, [t])

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

  function beginHostsSaveReview(): void {
    setHostsSaveMsg(null)
    if (!hostsHasChanges(hostsPreview ?? '', hostsDraft)) {
      setHostsSaveMsg(t('system.hostsNoChanges'))
      return
    }
    setHostsSaveReview(true)
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
        setHostsSaveReview(false)
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
    <SettingsStack>
      <div className="settings-system-toolbar">
        <SettingsSegmented
          value={systemView}
          options={[
            { value: 'overview', label: t('system.tabOverview'), icon: 'pulse' },
            { value: 'hosts', label: t('system.tabHostsEdit'), icon: 'edit' },
            { value: 'shell', label: t('system.tabShellEnv'), icon: 'terminal' },
          ]}
          onChange={setSystemView}
        />
      </div>

      {systemView === 'overview' ? (
        <div className="settings-system-diagnostics">
          <SettingsCard
            title={t('system.hostsFile')}
            description={t('system.hostsFileDesc')}
            className="settings-system-card"
          >
            <div className="settings-system-card-actions">
              <button type="button" className="hp-btn" disabled={hostsBusy} onClick={() => void refreshHosts()}>
                <span className="codicon codicon-refresh" aria-hidden />
                {t('system.refresh')}
              </button>
              <button type="button" className="hp-btn hp-btn-primary" onClick={() => setSystemView('hosts')}>
                <span className="codicon codicon-edit" aria-hidden />
                {t('system.edit')}
              </button>
            </div>
            {hostsPreview !== null && parsedHostsRows.length > 0 ? (
              <div className="settings-system-search-block">
                <div className="settings-system-search">
                  <span className="codicon codicon-search" aria-hidden />
                  <input
                    type="search" className="hp-input" placeholder={t('system.filterLines')}
                    value={hostsFilter} onChange={(e) => setHostsFilter(e.target.value)}
                    aria-label={t('system.filterHostsLabel')}
                  />
                </div>
                <p className="settings-system-meta">
                  {t('system.showingLines', { count: filteredHostsRows.length, total: parsedHostsRows.length })}
                </p>
              </div>
            ) : null}
            {hostsErr ? <div className="hp-status-alert error">{hostsErr}</div> : null}
            {hostsBusy && hostsPreview === null && !hostsErr ? (
              <SettingsFeedback tone="muted">{t('system.loading')}</SettingsFeedback>
            ) : null}
            {hostsPreview !== null && parsedHostsRows.length === 0 && !hostsErr ? (
              <pre className="settings-system-raw mono">{hostsPreview}</pre>
            ) : null}
            {hostsPreview !== null && parsedHostsRows.length > 0 && filteredHostsRows.length === 0 && !hostsErr ? (
              <SettingsFeedback tone="muted">{t('system.noLinesMatch')}</SettingsFeedback>
            ) : null}
            {hostsPreview !== null && filteredHostsRows.length > 0 ? (
              <SettingsDataTable>
                <thead>
                  <tr>
                    <th style={{ width: 148 }}>{t('system.address')}</th>
                    <th>{t('system.hostNames')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHostsRows.map((row, i) =>
                    row.kind === 'comment' ? (
                      <tr key={`c-${i}-${row.text.slice(0, 32)}`} className="settings-system-row-comment">
                        <td colSpan={2}>{row.text}</td>
                      </tr>
                    ) : (
                      <tr key={`e-${i}-${row.ip}-${row.hostnames.slice(0, 20)}`}>
                        <td className="mono settings-system-ip">{row.ip}</td>
                        <td>{row.hostnames}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </SettingsDataTable>
            ) : null}
          </SettingsCard>

          <SettingsCard
            title={t('system.environment')}
            description={t('system.environmentDesc')}
            className="settings-system-card"
          >
            <div className="settings-system-card-actions">
              <button type="button" className="hp-btn" disabled={envBusy} onClick={() => void refreshEnv()}>
                <span className="codicon codicon-refresh" aria-hidden />
                {t('system.refresh')}
              </button>
            </div>
            {envPreview !== null && parsedEnvRows.length > 0 ? (
              <div className="settings-system-search-block">
                <div className="settings-system-search">
                  <span className="codicon codicon-search" aria-hidden />
                  <input
                    type="search" className="hp-input" placeholder={t('system.filterEnv')}
                    value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}
                    aria-label={t('system.filterEnvLabel')}
                  />
                </div>
                <p className="settings-system-meta">
                  {t('system.showingVariables', { count: filteredEnvRows.length, total: parsedEnvRows.length })}
                </p>
              </div>
            ) : null}
            {envErr ? <div className="hp-status-alert error">{envErr}</div> : null}
            {envBusy && envPreview === null && !envErr ? (
              <SettingsFeedback tone="muted">{t('system.loading')}</SettingsFeedback>
            ) : null}
            {envPreview !== null && parsedEnvRows.length === 0 && !envErr ? (
              <pre className="settings-system-raw mono">{envPreview}</pre>
            ) : null}
            {envPreview !== null && parsedEnvRows.length > 0 && filteredEnvRows.length === 0 && !envErr ? (
              <SettingsFeedback tone="muted">{t('system.noVariablesMatch')}</SettingsFeedback>
            ) : null}
            {envPreview !== null && filteredEnvRows.length > 0 ? (
              <SettingsDataTable>
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>{t('system.name')}</th>
                    <th>{t('system.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEnvRows.map((row, i) => (
                    <tr key={`${row.key}-${i}`}>
                      <td className="settings-system-env-key">{row.key}</td>
                      <td><EnvValueDisplay envKey={row.key} value={row.value} /></td>
                    </tr>
                  ))}
                </tbody>
              </SettingsDataTable>
            ) : null}
          </SettingsCard>
        </div>
      ) : null}

      {systemView === 'hosts' ? (
        <SettingsCard
          title={t('system.hostsEditor')}
          description={t('system.hostsEditorDesc')}
          className="settings-system-card settings-system-card-wide"
        >
          <div className="settings-system-card-actions">
            {!hostsEditing ? (
              <button type="button" className="hp-btn hp-btn-primary" disabled={hostsBusy}
                onClick={() => { setHostsDraft(hostsPreview ?? ''); setHostsSaveMsg(null); setHostsSaveReview(false); setHostsEditing(true) }}>
                <span className="codicon codicon-edit" aria-hidden /> {t('system.edit')}
              </button>
            ) : (
              <>
                <button type="button" className="hp-btn" onClick={() => { setHostsEditing(false); setHostsSaveReview(false) }} disabled={hostsSaving}>{t('system.cancel')}</button>
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => beginHostsSaveReview()} disabled={hostsSaving || hostsSaveReview}>
                  {t('system.reviewSave')}
                </button>
              </>
            )}
          </div>
          {hostsEditing ? (
            <textarea
              value={hostsDraft} onChange={(e) => setHostsDraft(e.target.value)} rows={18} className="mono settings-system-textarea"
            />
          ) : (
            <SettingsFeedback tone="muted">{t('system.hostsEditorIdle')}</SettingsFeedback>
          )}
          {hostsSaveMsg ? (
            <SettingsFeedback tone={hostsSaveMsg === t('system.saved') ? 'success' : hostsSaveMsg === t('system.hostsNoChanges') ? 'muted' : 'error'}>
              {hostsSaveMsg}
            </SettingsFeedback>
          ) : null}
          {hostsSaveReview ? (
            <div className="settings-system-diff">
              <div className="settings-system-diff-title">{t('system.previewChange')}</div>
              <pre className="mono settings-system-diff-pre">
                {hostsDiffLines.length > 0 ? hostsDiffLines.join('\n') : t('system.hostsNoDiffLines')}
              </pre>
              <div className="settings-system-card-actions">
                <button type="button" className="hp-btn" onClick={() => setHostsSaveReview(false)} disabled={hostsSaving}>{t('system.cancel')}</button>
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void saveHosts()} disabled={hostsSaving}>
                  {hostsSaving ? t('system.saving') : t('system.apply')}
                </button>
              </div>
            </div>
          ) : null}
        </SettingsCard>
      ) : null}

      {systemView === 'shell' ? (
        <SettingsCard
          title={t('system.profileEnv')}
          description={t('system.profileEnvDesc', { path: profileEnvPath || '~/.profile' })}
          className="settings-system-card settings-system-card-wide"
        >
          <div className="settings-system-card-actions">
            <button type="button" className="hp-btn" disabled={profileEnvBusy} onClick={() => void loadProfileEnv()}>
              <span className="codicon codicon-refresh" aria-hidden /> {profileEnvContent === null ? t('system.load') : t('system.refresh')}
            </button>
            <Link to="/profiles" className="hp-btn" style={{ textDecoration: 'none' }}>
              {t('system.openProfiles')}
            </Link>
          </div>
          <div className="hp-status-alert warning settings-system-callout">
            <p style={{ margin: 0 }}>{t('system.profileEnvComposeNote')}</p>
          </div>
          {profileEnvErr ? <div className="hp-status-alert error">{profileEnvErr}</div> : null}
          {profileEnvContent !== null ? (
            <>
              {parsedProfileExports.length > 0 ? (
                <SettingsDataTable>
                  <thead>
                    <tr>
                      <th style={{ width: 180 }}>{t('system.name')}</th>
                      <th>{t('system.value')}</th>
                      <th style={{ width: 88 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {parsedProfileExports.map((row) => (
                      <tr key={row.key}>
                        <td className="mono settings-system-env-key">{row.key}</td>
                        <td className="mono settings-system-env-val">{row.value}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="hp-btn settings-system-remove-btn"
                            onClick={() => setProfileEnvDiff({ key: row.key, value: row.value, action: 'remove' })}>
                            {t('system.remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </SettingsDataTable>
              ) : (
                <SettingsFeedback tone="muted">{t('system.noExportLines', { path: profileEnvPath })}</SettingsFeedback>
              )}
              <div className="settings-system-add-row">
                <input type="text" className="mono hp-input" placeholder={t('system.keyPlaceholder')} value={profileEnvNewKey}
                  onChange={(e) => setProfileEnvNewKey(e.target.value)} />
                <span className="settings-system-eq">=</span>
                <input type="text" className="hp-input flex-grow" placeholder={t('system.valuePlaceholder')} value={profileEnvNewVal}
                  onChange={(e) => setProfileEnvNewVal(e.target.value)} />
                <button type="button" className="hp-btn hp-btn-primary"
                  disabled={!profileEnvNewKey.trim()}
                  onClick={() => setProfileEnvDiff({ key: profileEnvNewKey.trim(), value: profileEnvNewVal, action: 'set' })}>
                  {t('system.addUpdate')}
                </button>
              </div>
            </>
          ) : null}
          {profileEnvDiff ? (
            <div className="settings-system-diff">
              <div className="settings-system-diff-title">{t('system.previewChange')}</div>
              <pre className="mono settings-system-diff-pre" style={{ color: profileEnvDiff.action === 'remove' ? 'var(--red)' : 'var(--green)' }}>
                {profileEnvDiff.action === 'remove'
                  ? `- export ${profileEnvDiff.key}=...`
                  : `+ export ${profileEnvDiff.key}=${profileEnvDiff.value}`}
              </pre>
              <div className="settings-system-card-actions">
                <button type="button" className="hp-btn" onClick={() => setProfileEnvDiff(null)} disabled={profileEnvSaving}>{t('system.cancel')}</button>
                <button type="button" className="hp-btn hp-btn-primary" onClick={() => void applyProfileEnvDiff()} disabled={profileEnvSaving}>
                  {profileEnvSaving ? t('system.applying') : t('system.apply')}
                </button>
              </div>
            </div>
          ) : null}
        </SettingsCard>
      ) : null}
    </SettingsStack>
  )
}
