import {
  CustomProfilesStoreSchema,
  OnLoginAutomationStoreSchema,
  type ComposeProfile,
  type CustomProfileEntry,
  type OnLoginAutomationStore,
  parseOnLoginAutomation,
} from '@linux-dev-home/shared'
import './ProfilesPage.css'
import type { ReactElement } from 'react'
import React, { useEffect, useMemo, useState } from 'react'

const BASE_TEMPLATES = [
  'web-dev',
  'data-science',
  'ai-ml',
  'mobile',
  'game-dev',
  'infra',
  'desktop-gui',
  'docs',
  'empty',
]

const TEMPLATE_ICONS: Record<string, string> = {
  'web-dev': 'globe',
  'data-science': 'graph',
  'ai-ml': 'hubot',
  'mobile': 'device-mobile',
  'game-dev': 'play-circle',
  'infra': 'server-environment',
  'desktop-gui': 'window',
  'docs': 'book',
  'empty': 'blank',
}

export function ProfilesPage(): ReactElement {
  const [profiles, setProfiles] = useState<CustomProfileEntry[]>([])
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [onLogin, setOnLogin] = useState<OnLoginAutomationStore>(() =>
    OnLoginAutomationStoreSchema.parse({}),
  )
  const [editingProfileIdx, setEditingProfileIdx] = useState<number | null>(null)
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null)
  const [editingData, setEditingData] = useState<CustomProfileEntry | null>(null)
  const [credInputId, setCredInputId] = useState('')
  const [credInputValue, setCredInputValue] = useState('')
  const [envKeyInput, setEnvKeyInput] = useState('')
  const [envValueInput, setEnvValueInput] = useState('')
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')
  const [newProfileTemplate, setNewProfileTemplate] = useState<ComposeProfile>('web-dev')
  const [activeTab, setActiveTab] = useState<'builder' | 'automation' | 'backup'>('builder')

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

  function openCreateModal(): void {
    setIsCreatingProfile(true)
    setNewProfileName('')
    setNewProfileTemplate('web-dev')
  }

  function closeCreateModal(): void {
    setIsCreatingProfile(false)
    setNewProfileName('')
    setNewProfileTemplate('web-dev')
  }

  async function saveNewProfile(): Promise<void> {
    if (!newProfileName.trim()) {
      setStatus('Profile name is required.')
      return
    }
    const newProfile: CustomProfileEntry = {
      name: newProfileName.trim(),
      baseTemplate: newProfileTemplate,
      envVars: [],
      credentialIds: [],
    }
    const next = [...profiles, newProfile]
    await save(next, `Profile "${newProfileName.trim()}" created.`)
    closeCreateModal()
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
    <div className="profiles-page elevated-page" style={{ maxWidth: 1320, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <header style={{ paddingBottom: 24, paddingTop: 0 }}>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>PROFILES</div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Profile Engine Room</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 760, lineHeight: 1.5 }}>
          Build, edit, and manage custom profiles. To switch profiles, use the Dashboard command center. Here you can CRUD profiles, set global launch automation, and backup/sync your configuration.
        </p>
      </header>

      {status && (
        <div className={`hp-status-alert ${isOk(status) ? 'success' : 'warning'}`} style={{ marginBottom: 24 }}>
          <span style={{ fontSize: 16 }}>{isOk(status) ? '✔' : '⚠'}</span>
          <span>{status}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 0, marginBottom: 24 }}>
        {(['builder', 'automation', 'backup'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '14px 20px',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 14,
              fontWeight: activeTab === tab ? 700 : 600,
              cursor: 'pointer',
              borderBottom: activeTab === tab ? '2px solid var(--accent)' : 'transparent',
              transition: 'all 0.2s ease',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'builder' && 'Profile Builder'}
            {tab === 'automation' && 'Global Automation'}
            {tab === 'backup' && 'Backup & Sync'}
          </button>
        ))}
      </div>

      {/* Tab Content: Global Boot Automation */}
      {activeTab === 'automation' && (
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
      )}

      {/* Tab Content: Profile Builder */}
      {activeTab === 'builder' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Hero Banner */}
        <div style={{
          width: 'calc(100% + 40px)',
          marginLeft: '-20px',
          marginRight: '-20px',
          marginBottom: 24,
          padding: '48px 40px',
          background: 'linear-gradient(135deg, rgba(13, 115, 119, 0.4) 0%, rgba(20, 255, 236, 0.15) 100%)',
          border: '1px solid rgba(20, 255, 236, 0.2)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: '40%', height: '100%', opacity: 0.05 }}>
            <div style={{
              width: '100%',
              height: '100%',
              background: 'radial-gradient(circle at 80% 20%, rgba(20, 255, 236, 0.3) 0%, transparent 70%)',
            }} />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              Get ready to code in minutes
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.85)', maxWidth: 580, marginBottom: 20, lineHeight: 1.6 }}>
              Create and configure custom development environments tailored to your stack. Add environment variables, manage credentials, and build the perfect workspace.
            </p>
            <button
              type="button"
              style={{
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#fff',
                color: '#0d7377',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = '0 8px 24px rgba(20, 255, 236, 0.3)'
                el.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement
                el.style.boxShadow = 'none'
                el.style.transform = 'translateY(0)'
              }}
              onClick={openCreateModal}
            >
              + Create Environment
            </button>
          </div>
        </div>

        {/* Profiles List */}
        {profiles.length === 0 ? (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}>
            No custom environments yet. Click the button above to get started.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {profiles.map((p, i) => {
              const envVarCount = (p.envVars || []).length
              const credCount = (p.credentialIds || []).length
              const icon = TEMPLATE_ICONS[p.baseTemplate] || 'blank'
              const isDropdownOpen = openDropdownIdx === i

              return (
                <div
                  key={`${p.name}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 16px',
                    background: 'var(--bg-widget)',
                    border: '1px solid var(--border)',
                    transition: 'all 0.15s ease',
                    borderTop: i === 0 ? '1px solid var(--border)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'rgba(124, 77, 255, 0.4)'
                    el.style.background = 'color-mix(in srgb, var(--accent) 3%, var(--bg-widget))'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--border)'
                    el.style.background = 'var(--bg-widget)'
                  }}
                >
                  {/* Icon Box */}
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, rgba(124, 77, 255, 0.15) 0%, rgba(124, 77, 255, 0.05) 100%)',
                    border: '1px solid rgba(124, 77, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span className={`codicon codicon-${icon}`} style={{ fontSize: 24, color: 'var(--accent)' }} />
                  </div>

                  {/* Profile Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.baseTemplate}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}>
                    <div>Env vars: <strong style={{ color: 'var(--text)' }}>{envVarCount}</strong></div>
                    <div>Credentials: <strong style={{ color: 'var(--text)' }}>{credCount}</strong></div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                    <button
                      type="button"
                      style={{
                        ...btnSmall,
                        padding: '6px 12px',
                        fontSize: 12,
                      }}
                      onClick={() => openEditModal(i)}
                    >
                      Edit
                    </button>
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        style={{
                          ...btnSmall,
                          padding: '6px 10px',
                          fontSize: 12,
                        }}
                        onClick={() => setOpenDropdownIdx(isDropdownOpen ? null : i)}
                      >
                        ⋯
                      </button>
                      {isDropdownOpen && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: 4,
                          background: 'var(--bg-widget)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          minWidth: 140,
                          zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        }}>
                          <button
                            type="button"
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text)',
                              fontSize: 12,
                              textAlign: 'left',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border)',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              const el = e.currentTarget as HTMLElement
                              el.style.background = 'rgba(124, 77, 255, 0.1)'
                            }}
                            onMouseLeave={(e) => {
                              const el = e.currentTarget as HTMLElement
                              el.style.background = 'transparent'
                            }}
                            onClick={() => {
                              void duplicateAt(i)
                              setOpenDropdownIdx(null)
                            }}
                          >
                            Duplicate
                          </button>
                          <button
                            type="button"
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--red)',
                              fontSize: 12,
                              textAlign: 'left',
                              cursor: 'pointer',
                              transition: 'background 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              const el = e.currentTarget as HTMLElement
                              el.style.background = 'rgba(255, 0, 0, 0.1)'
                            }}
                            onMouseLeave={(e) => {
                              const el = e.currentTarget as HTMLElement
                              el.style.background = 'transparent'
                            }}
                            onClick={() => {
                              void removeAt(i)
                              setOpenDropdownIdx(null)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* Tab Content: Backup & Sync */}
      {activeTab === 'backup' && (
      <section style={card}>
        <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 16 }}>Backup & Sync</div>
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

        {byTemplate.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Profile Coverage</div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              Number of custom profiles per base template:
            </p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {byTemplate.map(([k, n]) => (
                <li key={k} className="mono" style={{ marginBottom: 4, fontSize: 12 }}>{k}: {n} profile{n !== 1 ? 's' : ''}</li>
              ))}
            </ul>
          </div>
        )}
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

      {/* Create New Profile Modal */}
      {isCreatingProfile && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-widget)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: 20, fontWeight: 700 }}>Create Custom Profile</h2>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Profile Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., My Custom Backend"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Base Template</label>
              <select
                value={newProfileTemplate}
                onChange={(e) => setNewProfileTemplate(e.target.value as ComposeProfile)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  color: 'var(--text)',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              >
                {BASE_TEMPLATES.map((template) => (
                  <option key={template} value={template} style={{ background: '#1a1a1a', color: 'var(--text)' }}>
                    {template}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} onClick={closeCreateModal}>Cancel</button>
              <button
                type="button"
                style={{ ...btn, background: 'var(--accent)', color: '#fff' }}
                onClick={() => void saveNewProfile()}
              >
                Save Profile
              </button>
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
