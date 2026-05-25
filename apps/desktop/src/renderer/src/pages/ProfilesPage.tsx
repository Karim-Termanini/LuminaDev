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
  const [activeProfileTemplate, setActiveProfileTemplate] = useState<string | null>(null)
  const [projectPaths, setProjectPaths] = useState<Record<string, string | null>>({})

  async function load(): Promise<void> {
    try {
      const res = (await window.dh.storeGet({ key: 'custom_profiles' })) as { ok: boolean; data: unknown; error?: string }
      if (res.ok && res.data) {
        const parsed = CustomProfilesStoreSchema.parse(res.data)
        setProfiles(parsed)
        void loadExtras(parsed)
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

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadExtras(loadedProfiles: CustomProfileEntry[]): Promise<void> {
    // Load active profile template
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as { ok: boolean; data?: unknown }
      if (ap.ok && typeof ap.data === 'string') setActiveProfileTemplate(ap.data)
    } catch { /* ignore */ }

    // Load linked project paths per profile
    const paths: Record<string, string | null> = {}
    await Promise.all(
      loadedProfiles.map(async (p) => {
        try {
          const res = (await window.dh.storeGet({ key: `project_dir_${p.baseTemplate}` as string })) as { ok: boolean; data?: unknown }
          paths[p.baseTemplate] = (res.ok && typeof res.data === 'string') ? res.data : null
        } catch {
          paths[p.baseTemplate] = null
        }
      })
    )
    setProjectPaths(paths)
  }

  async function save(next: CustomProfileEntry[], msg: string): Promise<void> {
    try {
      const parsed = CustomProfilesStoreSchema.parse(next)
      const res = (await window.dh.storeSet({ key: 'custom_profiles', data: parsed })) as { ok: boolean; error?: string }
      if (res.ok) { setProfiles(parsed); setStatus(msg); void loadExtras(parsed) }
      else setStatus(res.error || 'Failed to save profiles.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  async function setAsActive(template: ComposeProfile): Promise<void> {
    try {
      const res = (await window.dh.storeSet({ key: 'active_profile', data: template })) as { ok: boolean; error?: string }
      if (res.ok) {
        setActiveProfileTemplate(template)
        setStatus(`"${template}" set as active profile.`)
      } else {
        setStatus(res.error || 'Failed to set active profile.')
      }
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
    <div className="profiles-page elevated-page" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 40px' }}>
      <header style={{ paddingBottom: 24, paddingTop: 16 }}>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>PROFILES</div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>Profile Engine Room</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 760, lineHeight: 1.5, fontSize: 15 }}>
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
      <div className="tabs-container">
        {(['builder', 'automation', 'backup'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'builder' && 'Environments'}
            {tab === 'automation' && 'Global Automation'}
            {tab === 'backup' && 'Backup & Sync'}
          </button>
        ))}
      </div>

      {/* Tab Content: Global Boot Automation */}
      {activeTab === 'automation' && (
      <section style={{ padding: '16px 0' }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 20 }}>Global Boot Automation</div>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 800 }}>
          After the Setup Wizard is dismissed, optionally start your active compose stack or refresh the dashboard
          widget layout from disk. Requires Docker for compose; Flatpak needs socket access.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="profiles-list-row" style={{ cursor: 'pointer' }}>
            <div className="row-left">
              <div className="row-icon-box" style={{ background: 'transparent' }}>
                <span className="codicon codicon-play" style={{ fontSize: 24, color: 'var(--text)' }} />
              </div>
              <div className="row-title-area">
                <span className="row-title">Compose up on launch</span>
                <span className="row-subtitle">Automatically start the active profile once per app launch.</span>
              </div>
            </div>
            <div className="row-actions">
              <div className="fluent-toggle">
                <input
                  type="checkbox"
                  checked={onLogin.composeUpForActiveProfile}
                  onChange={(e) => void saveOnLogin({ ...onLogin, composeUpForActiveProfile: e.target.checked })}
                />
                <span className="fluent-slider"></span>
              </div>
            </div>
          </label>

          <label className="profiles-list-row" style={{ cursor: 'pointer' }}>
            <div className="row-left">
              <div className="row-icon-box" style={{ background: 'transparent' }}>
                <span className="codicon codicon-refresh" style={{ fontSize: 24, color: 'var(--text)' }} />
              </div>
              <div className="row-title-area">
                <span className="row-title">Refresh dashboard layout</span>
                <span className="row-subtitle">Reload widgets from layout.json on launch.</span>
              </div>
            </div>
            <div className="row-actions">
              <div className="fluent-toggle">
                <input
                  type="checkbox"
                  checked={onLogin.reloadDashboardLayout}
                  onChange={(e) => void saveOnLogin({ ...onLogin, reloadDashboardLayout: e.target.checked })}
                />
                <span className="fluent-slider"></span>
              </div>
            </div>
          </label>
        </div>
      </section>
      )}

      {/* Tab Content: Profile Builder */}
      {activeTab === 'builder' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Dev Home Style Hero Banner */}
        <div className="dev-home-hero">
          <h2 className="dev-home-hero-title">Get ready to code in minutes</h2>
          <p className="dev-home-hero-subtitle">
            Create and configure custom development environments tailored to your stack. Add environment variables, manage credentials, and build the perfect workspace.
          </p>
          <button type="button" className="dev-home-btn" onClick={openCreateModal}>
            + Create Environment
          </button>
        </div>

        {/* Horizontal Lists */}
        {profiles.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 15 }}>
            No custom environments yet. Click the button above to get started.
          </div>
        ) : (
          <div className="profiles-list-container">
            {profiles.map((p, i) => {
              const envVarCount = (p.envVars || []).length
              const credCount = (p.credentialIds || []).length
              const icon = TEMPLATE_ICONS[p.baseTemplate] || 'blank'
              const isDropdownOpen = openDropdownIdx === i

              return (
                <div key={`${p.name}-${i}`} className="profiles-list-row">
                  <div className="row-left">
                    <div className="row-icon-box">
                      <span className={`codicon codicon-${icon}`} style={{ fontSize: 24, color: '#fff' }} />
                    </div>
                    <div className="row-title-area">
                      <h3 className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.name}
                        {activeProfileTemplate === p.baseTemplate && (
                          <span style={{ fontSize: 11, fontWeight: 700, background: 'color-mix(in srgb, var(--green) 20%, transparent)', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', borderRadius: 20, padding: '2px 8px', letterSpacing: '0.04em' }}>ACTIVE</span>
                        )}
                      </h3>
                      <p className="row-subtitle">
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
                        {p.baseTemplate}
                      </p>
                      {projectPaths[p.baseTemplate] ? (
                        <p className="row-subtitle mono" style={{ fontSize: 11, marginTop: 2, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                          <span className="codicon codicon-folder" style={{ marginRight: 4 }} />
                          {projectPaths[p.baseTemplate]}
                        </p>
                      ) : (
                        <p className="row-subtitle" style={{ fontSize: 11, marginTop: 2, color: 'var(--text-muted)', fontStyle: 'italic' }}>No project linked</p>
                      )}
                    </div>
                  </div>

                  <div className="row-stats">
                    <div className="row-stat-item"><span className="codicon codicon-symbol-property" /> Env Vars: {envVarCount}</div>
                    <div className="row-stat-item"><span className="codicon codicon-key" /> Credentials: {credCount}</div>
                  </div>

                  <div className="row-actions">
                    {activeProfileTemplate !== p.baseTemplate && (
                      <button type="button" className="row-btn" title="Set as active profile in Dashboard" onClick={() => void setAsActive(p.baseTemplate)}>
                        <span className="codicon codicon-check" style={{ marginRight: 4 }} />Set Active
                      </button>
                    )}
                    <button type="button" className="row-btn" onClick={() => openEditModal(i)}>
                      Edit
                    </button>
                    <div style={{ position: 'relative' }}>
                      <button type="button" className="row-btn-icon" onClick={() => setOpenDropdownIdx(isDropdownOpen ? null : i)}>
                        <span className="codicon codicon-ellipsis" />
                      </button>
                      {isDropdownOpen && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: 4,
                          background: 'rgba(20,20,24,0.95)', border: '1px solid rgba(255,255,255,0.1)',
                          backdropFilter: 'blur(16px)',
                          borderRadius: 6, minWidth: 160, zIndex: 100,
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)', padding: 4
                        }}>
                          <button
                            type="button"
                            style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, textAlign: 'left', cursor: 'pointer', borderRadius: 4, marginBottom: 2 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            onClick={() => { void duplicateAt(i); setOpenDropdownIdx(null) }}
                          >
                            <span className="codicon codicon-copy" style={{ marginRight: 8, fontSize: 14 }} /> Duplicate
                          </button>
                          <button
                            type="button"
                            style={{ width: '100%', padding: '10px 12px', border: 'none', background: 'transparent', color: 'var(--red)', fontSize: 13, textAlign: 'left', cursor: 'pointer', borderRadius: 4 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,0,0,0.1)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                            onClick={() => { void removeAt(i); setOpenDropdownIdx(null) }}
                          >
                            <span className="codicon codicon-trash" style={{ marginRight: 8, fontSize: 14 }} /> Delete
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
      <section style={{ padding: '16px 0' }}>
        <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 20 }}>Backup & Sync</div>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 800 }}>
          Export all profiles as JSON for backup and team sharing, or import profiles from a previous export.
        </p>
        
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button type="button" style={{...btn, display: 'flex', alignItems: 'center', gap: 8}} onClick={() => void load()}><span className="codicon codicon-refresh"/> Refresh</button>
          <button type="button" style={{...btn, display: 'flex', alignItems: 'center', gap: 8}} onClick={() => void exportJson()}><span className="codicon codicon-export"/> Export JSON</button>
          <div style={{ flex: 1 }} />
          <button type="button" style={{...btnDanger, display: 'flex', alignItems: 'center', gap: 8}} onClick={() => void save([], 'All profiles cleared.')}><span className="codicon codicon-trash"/> Clear All</button>
        </div>
        
        <div style={{ position: 'relative' }}>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='Paste JSON array like [{"name":"My AI","baseTemplate":"ai-ml","envVars":[]}]'
            style={{
              width: '100%', minHeight: 240, resize: 'vertical',
              background: '#0a0a0d', color: 'var(--text)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: 16, fontFamily: 'var(--font-mono)', fontSize: 13,
              boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.4)'
            }}
          />
        </div>

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" style={{...btn, padding: '12px 24px', background: 'var(--accent)', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 8}} onClick={() => void importJson()}>
            <span className="codicon codicon-add"/> Import JSON
          </button>
        </div>

        {byTemplate.length > 0 && (
          <div style={{ marginTop: 40, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>Profile Coverage</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {byTemplate.map(([k, n]) => (
                <div key={k} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: 20, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`codicon codicon-${TEMPLATE_ICONS[k] || 'blank'}`} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontWeight: 600 }}>{k}</span>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      )}

      {editingProfileIdx !== null && editingData && (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content wide">
            <h2 style={{ margin: '0 0 24px 0', fontSize: 24, fontWeight: 700 }}>Edit Environment</h2>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>SSH Key</div>
              <input
                type="text"
                value={editingData.sshKeyId ?? ''}
                onChange={(e) => setEditingData({ ...editingData, sshKeyId: e.target.value || undefined })}
                placeholder="e.g. host  (leave empty to use system default)"
                className="fluent-input"
                style={{ fontFamily: 'monospace', width: '100%' }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Enter <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>host</code> to use your machine&apos;s default SSH key, or a specific key ID.</p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Environment Variables</div>
              {(editingData.envVars || []).map((ev, vi) => (
                <div key={vi} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={ev.key}
                    onChange={(e) => updateEnvVar(vi, e.target.value, ev.value)}
                    placeholder="KEY"
                    className="fluent-input"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <input
                    type="text"
                    value={ev.value}
                    onChange={(e) => updateEnvVar(vi, ev.key, e.target.value)}
                    placeholder="value"
                    className="fluent-input"
                    style={{ flex: 2, fontFamily: 'monospace' }}
                  />
                  <button type="button" style={{ ...btnSmallDanger, padding: '8px 12px' }} onClick={() => removeEnvVar(vi)}>✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <input
                  type="text"
                  value={envKeyInput}
                  onChange={(e) => setEnvKeyInput(e.target.value)}
                  placeholder="New KEY"
                  className="fluent-input"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <input
                  type="text"
                  value={envValueInput}
                  onChange={(e) => setEnvValueInput(e.target.value)}
                  placeholder="value"
                  className="fluent-input"
                  style={{ flex: 2, fontFamily: 'monospace' }}
                />
                <button type="button" style={{ ...btn, padding: '0 24px' }} onClick={() => addEnvVar(envKeyInput, envValueInput)}>Add</button>
              </div>
            </div>

            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>Credentials</div>
              {(editingData.credentialIds || []).map((credId, ci) => (
                <div key={ci} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <span className="mono" style={{ flex: 1, padding: '10px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 4, fontSize: 13, color: 'var(--text-muted)' }}>{credId}</span>
                  <button type="button" style={{ ...btnSmallDanger, padding: '8px 16px' }} onClick={() => removeCredential(ci)}>Delete</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <input
                  type="text"
                  value={credInputId}
                  onChange={(e) => setCredInputId(e.target.value)}
                  placeholder="Credential ID"
                  className="fluent-input"
                  style={{ flex: 1 }}
                />
                <input
                  type="password"
                  value={credInputValue}
                  onChange={(e) => setCredInputValue(e.target.value)}
                  placeholder="Secret value"
                  className="fluent-input"
                  style={{ flex: 1 }}
                />
                <button type="button" style={{ ...btn, padding: '0 24px' }} onClick={() => addCredential(credInputId, credInputValue)}>Add</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button type="button" style={{ ...btn, padding: '10px 24px' }} onClick={closeEditModal}>Cancel</button>
              <button type="button" className="dev-home-btn" style={{ padding: '10px 24px', margin: 0 }} onClick={() => void saveProfileChanges()}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Create New Profile Modal */}
      {isCreatingProfile && (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content">
            <h2 style={{ margin: '0 0 24px 0', fontSize: 24, fontWeight: 700 }}>Create Environment</h2>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Environment Name</label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g., My Custom Backend"
                className="fluent-input"
                autoFocus
              />
            </div>

            <div style={{ marginBottom: 32 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Base Template</label>
              <select
                value={newProfileTemplate}
                onChange={(e) => setNewProfileTemplate(e.target.value as ComposeProfile)}
                className="fluent-input"
                style={{ appearance: 'none' }}
              >
                {BASE_TEMPLATES.map((template) => (
                  <option key={template} value={template} style={{ background: '#18181c', color: 'var(--text)' }}>
                    {template}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button type="button" style={{ ...btn, padding: '10px 24px' }} onClick={closeCreateModal}>Cancel</button>
              <button
                type="button"
                className="dev-home-btn"
                style={{ padding: '10px 24px', margin: 0 }}
                onClick={() => void saveNewProfile()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btn = { border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s ease' }
const btnDanger = { ...btn, color: 'var(--red)' }
const btnSmallDanger = { ...btn, color: 'var(--red)', padding: '6px 10px', fontSize: 13 }
