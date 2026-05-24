import {
  CustomProfilesStoreSchema,
  OnLoginAutomationStoreSchema,
  type CustomProfileEntry,
  type OnLoginAutomationStore,
  parseOnLoginAutomation,
} from '@linux-dev-home/shared'
import './ProfilesPage.css'
import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'

export function ProfilesPage(): ReactElement {
  const [profiles, setProfiles] = useState<CustomProfileEntry[]>([])
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [onLogin, setOnLogin] = useState<OnLoginAutomationStore>(() =>
    OnLoginAutomationStoreSchema.parse({}),
  )
  const [expandedProfileIdx, setExpandedProfileIdx] = useState<number | null>(null)
  const [editingProfileIdx, setEditingProfileIdx] = useState<number | null>(null)
  const [editingData, setEditingData] = useState<CustomProfileEntry | null>(null)
  const [credInputId, setCredInputId] = useState('')
  const [credInputValue, setCredInputValue] = useState('')
  const [envKeyInput, setEnvKeyInput] = useState('')
  const [envValueInput, setEnvValueInput] = useState('')

  async function load(): Promise<void> {
    try {
      const res = (await window.dh.storeGet({ key: 'custom_profiles' })) as { ok: boolean; data: unknown; error?: string }
      if (res.ok && res.data) {
        const parsed = CustomProfilesStoreSchema.parse(res.data)
        setProfiles(parsed)
      } else if (!res.ok) {
        setStatus(res.error || 'Failed to load profiles.')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
    try {
      const ol = (await window.dh.storeGet({ key: 'on_login_automation' })) as { ok: boolean; data: unknown }
      if (ol.ok) setOnLogin(parseOnLoginAutomation(ol.data))
    } catch { /* ignore */ }
  }

  useEffect(() => { void load() }, [])

  async function save(next: CustomProfileEntry[], msg: string): Promise<void> {
    try {
      const parsed = CustomProfilesStoreSchema.parse(next)
      const res = (await window.dh.storeSet({ key: 'custom_profiles', data: parsed })) as { ok: boolean; error?: string }
      if (res.ok) { setProfiles(parsed); setStatus(msg) }
      else setStatus(res.error || 'Failed to save profiles.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveOnLogin(next: OnLoginAutomationStore): Promise<void> {
    try {
      const parsed = OnLoginAutomationStoreSchema.parse(next)
      const res = (await window.dh.storeSet({ key: 'on_login_automation', data: parsed })) as {
        ok: boolean
        error?: string
      }
      if (res.ok) {
        setOnLogin(parsed)
        setStatus('On-login automation preferences saved.')
      } else {
        setStatus(res.error || 'Failed to save on-login automation.')
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function removeAt(idx: number): Promise<void> {
    const next = profiles.filter((_, i) => i !== idx)
    await save(next, 'Profile removed.')
  }

  async function duplicateAt(idx: number): Promise<void> {
    const p = profiles[idx]
    if (!p) return
    const next = [...profiles, { ...p, name: `${p.name} Copy` }]
    await save(next, 'Profile duplicated.')
  }

  function openEditModal(idx: number): void {
    const p = profiles[idx]
    if (!p) return
    setEditingProfileIdx(idx)
    setEditingData({ ...p })
    setCredInputId('')
    setCredInputValue('')
    setEnvKeyInput('')
    setEnvValueInput('')
  }

  function closeEditModal(): void {
    setEditingProfileIdx(null)
    setEditingData(null)
    setCredInputId('')
    setCredInputValue('')
    setEnvKeyInput('')
    setEnvValueInput('')
  }

  function updateEnvVar(varIdx: number, key: string, value: string): void {
    if (!editingData) return
    const vars = [...(editingData.envVars || [])]
    vars[varIdx] = { key, value }
    setEditingData({ ...editingData, envVars: vars })
  }

  function addEnvVar(key: string, value: string): void {
    if (!editingData || !key.trim() || !value.trim()) return
    const vars = [...(editingData.envVars || []), { key: key.trim(), value: value.trim() }]
    setEditingData({ ...editingData, envVars: vars })
    setEnvKeyInput('')
    setEnvValueInput('')
  }

  function removeEnvVar(varIdx: number): void {
    if (!editingData) return
    const vars = (editingData.envVars || []).filter((_, i) => i !== varIdx)
    setEditingData({ ...editingData, envVars: vars })
  }

  function addCredential(id: string, value: string): void {
    if (!editingData || !id.trim() || !value.trim()) return
    const credIds = [...(editingData.credentialIds || []), id.trim()]
    setEditingData({ ...editingData, credentialIds: credIds })
    void window.dh.profileCredentialsStore({ id: id.trim(), value: value.trim() })
    setCredInputId('')
    setCredInputValue('')
  }

  function removeCredential(credIdx: number): void {
    if (!editingData) return
    const oldIds = editingData.credentialIds || []
    const credId = oldIds[credIdx]
    if (credId) void window.dh.profileCredentialsDelete({ id: credId })
    const credIds = oldIds.filter((_, i) => i !== credIdx)
    setEditingData({ ...editingData, credentialIds: credIds })
  }

  async function saveProfileChanges(): Promise<void> {
    if (editingProfileIdx === null || !editingData) return
    const next = [...profiles]
    next[editingProfileIdx] = editingData
    await save(next, 'Profile updated.')
    closeEditModal()
  }

  async function exportJson(): Promise<void> {
    const text = JSON.stringify(profiles, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Profiles JSON copied to clipboard.')
    } catch {
      setImportText(text)
      setStatus('Clipboard unavailable; JSON put in import box below.')
    }
  }

  async function importJson(): Promise<void> {
    try {
      const raw = JSON.parse(importText) as unknown
      const parsed = CustomProfilesStoreSchema.parse(raw)
      await save(parsed, 'Profiles imported.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const byTemplate = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of profiles) map.set(p.baseTemplate, (map.get(p.baseTemplate) ?? 0) + 1)
    return [...map.entries()]
  }, [profiles])

  const isOk = (s: string) => /copied|saved|removed|duplicated|imported|cleared|set to/i.test(s)

  return (
    <div className="profiles-page elevated-page" style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>PROFILES</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Profile Engine Room</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 760, lineHeight: 1.5 }}>
          Build, edit, and manage custom profiles. To switch profiles, use the Dashboard command center. Here you can CRUD profiles, set global launch automation, and backup/sync your configuration.
        </p>
      </header>

      {status && (
        <div className={`hp-status-alert ${isOk(status) ? 'success' : 'warning'}`}>
          <span style={{ fontSize: 16 }}>{isOk(status) ? '✔' : '⚠'}</span>
          <span>{status}</span>
        </div>
      )}

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Global Boot Automation</div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: 720 }}>
          After the Setup Wizard is dismissed, optionally start your active compose stack or refresh the dashboard
          widget layout from disk. Requires Docker for compose; Flatpak needs socket access.
        </p>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={onLogin.composeUpForActiveProfile}
            onChange={(e) => void saveOnLogin({ ...onLogin, composeUpForActiveProfile: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: 14 }}>
            <strong>Compose up</strong> for the active profile once per app launch (if an active profile is set).
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={onLogin.reloadDashboardLayout}
            onChange={(e) => void saveOnLogin({ ...onLogin, reloadDashboardLayout: e.target.checked })}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: 14 }}>
            <strong>Refresh dashboard layout</strong> from <span className="mono">layout.json</span> on launch.
          </span>
        </label>
      </section>

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Profile Builder</div>
        {profiles.length === 0 ? (
          <div style={{ color: 'var(--text-muted)' }}>
            No custom profiles yet. Create one from scratch or import JSON below using the Backup & Sync section.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 10 }}>
            {profiles.map((p, i) => {
              const isExpanded = expandedProfileIdx === i
              const envVars = p.envVars || []
              return (
                <article
                  key={`${p.name}-${i}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    background: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, flex: 1 }}>{p.name}</div>
                  </div>
                  <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>
                    base: {p.baseTemplate}
                  </div>

                  {isExpanded && (
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Environment Variables</div>
                      {envVars.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>None configured.</div>
                      ) : (
                        <div style={{ marginBottom: 8 }}>
                          {envVars.map((ev, vi) => (
                            <div key={vi} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                              <span className="mono">{ev.key}</span> = <span className="mono">{ev.value.substring(0, 40)}{ev.value.length > 40 ? '...' : ''}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {p.credentialIds && p.credentialIds.length > 0 && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Credentials</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.credentialIds.length} credential{p.credentialIds.length !== 1 ? 's' : ''}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={btnSmall}
                      onClick={() => setExpandedProfileIdx(isExpanded ? null : i)}
                    >
                      {isExpanded ? 'Collapse' : 'Details'}
                    </button>
                    <button type="button" style={btnSmall} onClick={() => openEditModal(i)}>Edit</button>
                    <button type="button" style={btnSmall} onClick={() => void duplicateAt(i)}>Duplicate</button>
                    <button type="button" style={btnSmallDanger} onClick={() => void removeAt(i)}>Delete</button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Backup & Sync</div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Export all profiles as JSON for backup and team sharing, or import profiles from a previous export.
        </p>
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={btn} onClick={() => void load()}>Refresh Data</button>
          <button type="button" style={btn} onClick={() => void exportJson()}>Export as JSON</button>
          <button type="button" style={btnDanger} onClick={() => void save([], 'All profiles cleared.')}>Clear All</button>
        </div>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='Paste JSON array like [{"name":"My AI","baseTemplate":"ai-ml","envVars":[]}]'
          style={{
            width: '100%', minHeight: 140, resize: 'vertical',
            background: '#0a0a0a', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: 10, fontFamily: 'var(--font-mono)', fontSize: 12,
          }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button type="button" style={btn} onClick={() => void importJson()}>Import JSON</button>
        </div>
      </section>

      {byTemplate.length > 0 && (
        <section style={card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Profile Coverage</div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
            Number of custom profiles per base template:
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {byTemplate.map(([k, n]) => (
              <li key={k} className="mono" style={{ marginBottom: 4, fontSize: 12 }}>{k}: {n} profile{n !== 1 ? 's' : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {editingProfileIdx !== null && editingData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-widget)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, maxWidth: 600, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 700 }}>Edit Profile: {editingData.name}</h2>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Environment Variables</div>
              {(editingData.envVars || []).map((ev, vi) => (
                <div key={vi} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={ev.key}
                    onChange={(e) => updateEnvVar(vi, e.target.value, ev.value)}
                    placeholder="KEY"
                    style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <input
                    type="text"
                    value={ev.value}
                    onChange={(e) => updateEnvVar(vi, ev.key, e.target.value)}
                    placeholder="value"
                    style={{ flex: 2, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}
                  />
                  <button type="button" style={{ ...btnSmallDanger, padding: '5px 8px' }} onClick={() => removeEnvVar(vi)}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  value={envKeyInput}
                  onChange={(e) => setEnvKeyInput(e.target.value)}
                  placeholder="New KEY"
                  style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}
                />
                <input
                  type="text"
                  value={envValueInput}
                  onChange={(e) => setEnvValueInput(e.target.value)}
                  placeholder="value"
                  style={{ flex: 2, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontFamily: 'monospace', fontSize: 12 }}
                />
                <button type="button" style={btnSmall} onClick={() => addEnvVar(envKeyInput, envValueInput)}>Add</button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Credentials</div>
              {(editingData.credentialIds || []).map((credId, ci) => (
                <div key={ci} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <span className="mono" style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', borderRadius: 4, fontSize: 12, color: 'var(--text-muted)' }}>{credId}</span>
                  <button type="button" style={{ ...btnSmallDanger, padding: '5px 8px' }} onClick={() => removeCredential(ci)}>Delete</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={credInputId}
                  onChange={(e) => setCredInputId(e.target.value)}
                  placeholder="Credential ID"
                  style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                />
                <input
                  type="password"
                  value={credInputValue}
                  onChange={(e) => setCredInputValue(e.target.value)}
                  placeholder="Secret value"
                  style={{ flex: 1, padding: '8px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 12 }}
                />
                <button type="button" style={btnSmall} onClick={() => addCredential(credInputId, credInputValue)}>Add</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} onClick={closeEditModal}>Cancel</button>
              <button type="button" style={{ ...btn, background: 'var(--accent)', color: '#fff' }} onClick={() => void saveProfileChanges()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const card = { background: 'var(--bg-widget)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }
const btn = { border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', borderRadius: 8, padding: '9px 13px', cursor: 'pointer', fontWeight: 600 }
const btnDanger = { ...btn, color: 'var(--red)' }
const btnSmall = { ...btn, padding: '5px 10px', fontSize: 12 }
const btnSmallDanger = { ...btnSmall, color: 'var(--red)' }
