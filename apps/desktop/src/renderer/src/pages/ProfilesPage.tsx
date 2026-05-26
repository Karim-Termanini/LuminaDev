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
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

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
  const [credInputId, setCredInputId] = useState('')
  const [credInputValue, setCredInputValue] = useState('')
  const [envKeyInput, setEnvKeyInput] = useState('')
  const [envValueInput, setEnvValueInput] = useState('')
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardData, setWizardData] = useState<CustomProfileEntry | null>(null)
  const [activeTab, setActiveTab] = useState<'builder' | 'automation' | 'backup'>('builder')
  const [activeProfileTemplate, setActiveProfileTemplate] = useState<string | null>(null)
  const [projectPaths, setProjectPaths] = useState<Record<string, string | null>>({})

  // Beginner vs Expert Mode states
  const [envMode, setEnvMode] = useState<'beginner' | 'expert'>('beginner')
  const [credMode, setCredMode] = useState<'beginner' | 'expert'>('beginner')

  // SSH helper states
  const [hostSshKey, setHostSshKey] = useState<string | null>(null)
  const [detectingSsh, setDetectingSsh] = useState(false)
  const [isGeneratingSsh, setIsGeneratingSsh] = useState(false)
  const [sshEmail, setSshEmail] = useState('lumina@local')
  const [sshGenerateError, setSshGenerateError] = useState<string | null>(null)

  // Credential helper states
  const [existingCredentialIds, setExistingCredentialIds] = useState<string[]>([])

  // Env bulk input
  const [envBulkInput, setEnvBulkInput] = useState('')
  const [tagInput, setTagInput] = useState('')

  const detectLocalSshKey = useCallback(async () => {
    setDetectingSsh(true)
    try {
      const res = await window.dh.sshGetPub({ target: 'host' })
      if (res.ok && res.pub) {
        setHostSshKey(res.pub)
      } else {
        setHostSshKey(null)
      }
    } catch {
      setHostSshKey(null)
    }
    setDetectingSsh(false)
  }, [])

  const loadExistingCredentials = useCallback(async () => {
    try {
      const res = await window.dh.profileCredentialsList()
      if (res.ok && res.ids) {
        setExistingCredentialIds(res.ids)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (wizardStep === 2) {
      void detectLocalSshKey()
    } else if (wizardStep === 4) {
      void loadExistingCredentials()
    }
  }, [wizardStep, detectLocalSshKey, loadExistingCredentials])

  const loadExtras = useCallback(async (loadedProfiles: CustomProfileEntry[]): Promise<void> => {
    // Load active profile template
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as { ok: boolean; data?: unknown }
      if (ap.ok && typeof ap.data === 'string') setActiveProfileTemplate(ap.data)
    } catch { /* ignore */ }

    // Load linked project paths per profile
    const paths: Record<string, string | null> = {}
    const storeGetAny = window.dh.storeGet as (req: { key: string }) => Promise<{ ok: boolean; data?: unknown }>
    await Promise.all(
      loadedProfiles.map(async (p) => {
        try {
          const res = await storeGetAny({ key: `project_dir_${p.baseTemplate}` })
          paths[p.baseTemplate] = (res.ok && typeof res.data === 'string') ? res.data : null
        } catch {
          paths[p.baseTemplate] = null
        }
      })
    )
    setProjectPaths(paths)
  }, []) // stable: only calls window.dh + setState setters

  const load = useCallback(async (): Promise<void> => {
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
  }, [loadExtras])

  useEffect(() => { void load() }, [load])

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
    const profile = profiles[idx]
    if (profile) {
      await invoke('ipc_invoke', { channel: 'dh:compose:down', payload: { profile: profile.name } }).catch(() => {})
      try {
        const ap = (await window.dh.storeGet({ key: 'active_profile' })) as { ok: boolean; data?: unknown }
        if (ap.ok && ap.data === profile.name) {
          await window.dh.storeDelete({ key: 'active_profile' })
          setActiveProfileTemplate(null)
        }
      } catch { /* ignore */ }
    }
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
    setEditingProfileIdx(null)
    setWizardStep(1)
    setEnvMode('beginner')
    setCredMode('beginner')
    setEnvBulkInput('')
    setTagInput('')
    setWizardData({
      name: '',
      baseTemplate: 'web-dev',
      description: '',
      tags: [],
      composeVariant: 'stub',
      envVars: [],
      credentialIds: [],
    })
  }

  function openEditModal(idx: number): void {
    const p = profiles[idx]
    if (!p) return
    setIsCreatingProfile(false)
    setEditingProfileIdx(idx)
    setWizardStep(1)
    setEnvMode('beginner')
    setCredMode('beginner')
    setEnvBulkInput('')
    setTagInput('')
    setWizardData({ ...p })
    setCredInputId('')
    setCredInputValue('')
    setEnvKeyInput('')
    setEnvValueInput('')
  }

  async function saveWizardChanges(): Promise<void> {
    if (!wizardData) return
    if (!wizardData.name.trim()) {
      setStatus('Profile name is required.')
      return
    }
    const finalData = { ...wizardData, name: wizardData.name.trim() }
    
    let next: CustomProfileEntry[]
    if (isCreatingProfile) {
      next = [...profiles, finalData]
      await save(next, `Profile "${finalData.name}" created.`)
    } else if (editingProfileIdx !== null) {
      next = [...profiles]
      next[editingProfileIdx] = finalData
      await save(next, `Profile "${finalData.name}" updated.`)
    }
    
    setWizardData(null)
    setIsCreatingProfile(false)
    setEditingProfileIdx(null)
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
                      {/* Description */}
                      {p.description && (
                        <p className="row-subtitle" style={{ fontSize: 12, marginTop: 2, color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.description}
                        </p>
                      )}
                      {/* Tags */}
                      {(p.tags ?? []).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {(p.tags ?? []).map((tag) => (
                            <span key={tag} style={{
                              fontSize: 10, padding: '1px 7px', borderRadius: 12, fontWeight: 600,
                              background: 'rgba(124,77,255,0.1)', border: '1px solid rgba(124,77,255,0.2)', color: 'var(--text-muted)',
                            }}>{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="row-stats">
                    <div className="row-stat-item"><span className="codicon codicon-symbol-property" /> Env Vars: {envVarCount}</div>
                    <div className="row-stat-item"><span className="codicon codicon-key" /> Credentials: {credCount}</div>
                  </div>

                  <div className="row-actions">
                    {/* Compose variant toggle */}
                    <button
                      type="button"
                      className="row-btn"
                      title={`Switch to ${(p.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub'} compose stack`}
                      onClick={() => {
                        const next = profiles.map((prof, pi) =>
                          pi === i ? { ...prof, composeVariant: ((prof.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub') as 'stub' | 'full' } : prof
                        )
                        void save(next, `"${p.name}" switched to ${(p.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub'} stack.`)
                      }}
                    >
                      <span className="codicon codicon-layers" style={{ marginRight: 4 }} />
                      {(p.composeVariant ?? 'stub') === 'stub' ? 'LITE' : 'FULL'}
                    </button>
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

      {wizardData && (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content wizard-container" style={{ display: 'flex', flexDirection: 'row', width: '850px', maxWidth: '95vw', height: '600px', padding: 0, overflow: 'hidden' }}>
            
            {/* LEFT SIDEBAR: Steps Indicator */}
            <div style={{ width: '220px', background: 'rgba(0,0,0,0.15)', borderRight: '1px solid var(--border)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isCreatingProfile ? 'Create Profile' : 'Edit Profile'}
              </div>
              {[
                { step: 1, label: '1. General' },
                { step: 2, label: '2. SSH Key' },
                { step: 3, label: '3. Env Variables' },
                { step: 4, label: '4. Credentials' },
                { step: 5, label: '5. Review & Save' }
              ].map((s) => {
                const isActive = wizardStep === s.step
                const isCompleted = wizardStep > s.step
                return (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => {
                      if (wizardData.name.trim() || s.step === 1) {
                        setWizardStep(s.step)
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      textAlign: 'left',
                      padding: '10px 12px',
                      borderRadius: 6,
                      background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: 'none',
                      color: isActive ? 'var(--text)' : isCompleted ? 'var(--green)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: isActive ? 600 : 500,
                      transition: 'all 0.2s ease',
                      width: '100%'
                    }}
                  >
                    <span className="codicon codicon-check" style={{ marginRight: 8, opacity: isCompleted ? 1 : 0, fontSize: 14 }} />
                    <span style={{ flex: 1 }}>{s.label}</span>
                  </button>
                )
              })}
            </div>

            {/* RIGHT MAIN PANEL: Step Content */}
            <div style={{ flex: 1, padding: '32px', display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {wizardStep === 1 && (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>General Information</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.4 }}>
                      Choose a descriptive name and a base development stack for your environment.
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Profile Name</label>
                      <input
                        type="text"
                        value={wizardData.name}
                        onChange={(e) => setWizardData({ ...wizardData, name: e.target.value })}
                        placeholder="e.g. Frontend App"
                        className="fluent-input"
                        style={{ width: '100%' }}
                        autoFocus
                      />
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Base Template</label>
                      <select
                        value={wizardData.baseTemplate}
                        onChange={(e) => setWizardData({ ...wizardData, baseTemplate: e.target.value as ComposeProfile })}
                        className="fluent-input"
                        style={{ appearance: 'none', width: '100%' }}
                        disabled={!isCreatingProfile}
                      >
                        {BASE_TEMPLATES.map((template) => (
                          <option key={template} value={template} style={{ background: '#18181c', color: 'var(--text)' }}>
                            {template}
                          </option>
                        ))}
                      </select>
                      {!isCreatingProfile && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                          Base template cannot be changed after creation to preserve workspace mappings.
                        </p>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                        Description <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional)</span>
                      </label>
                      <textarea
                        value={wizardData.description ?? ''}
                        onChange={(e) => setWizardData({ ...wizardData, description: e.target.value || undefined })}
                        placeholder="e.g. My frontend workspace for project X"
                        className="fluent-input"
                        style={{ width: '100%', minHeight: 72, resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>

                    {/* Tags */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                        Tags <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 12 }}>(optional, press Enter)</span>
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {(wizardData.tags ?? []).map((tag, ti) => (
                          <span
                            key={tag}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: 'rgba(124,77,255,0.12)', border: '1px solid rgba(124,77,255,0.3)',
                              color: 'var(--text)', borderRadius: 20, padding: '2px 10px', fontSize: 12,
                            }}
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => setWizardData({ ...wizardData, tags: (wizardData.tags ?? []).filter((_, i) => i !== ti) })}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
                              aria-label="Remove tag"
                              title="Remove tag"
                            >✕</button>
                          </span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && tagInput.trim()) {
                              e.preventDefault()
                              const current = wizardData.tags ?? []
                              if (current.length < 10 && !current.includes(tagInput.trim())) {
                                setWizardData({ ...wizardData, tags: [...current, tagInput.trim()] })
                              }
                              setTagInput('')
                            }
                          }}
                          placeholder="e.g. frontend, react, work"
                          className="fluent-input"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          style={{ ...btn, padding: '0 16px' }}
                          onClick={() => {
                            if (!tagInput.trim()) return
                            const current = wizardData.tags ?? []
                            if (current.length < 10 && !current.includes(tagInput.trim())) {
                              setWizardData({ ...wizardData, tags: [...current, tagInput.trim()] })
                            }
                            setTagInput('')
                          }}
                        >Add</button>
                      </div>
                    </div>

                    {/* Compose Variant */}
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Compose Stack</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {(['stub', 'full'] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setWizardData({ ...wizardData, composeVariant: v })}
                            style={{
                              padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                              border: '1px solid',
                              borderColor: (wizardData.composeVariant ?? 'stub') === v ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
                              background: (wizardData.composeVariant ?? 'stub') === v ? 'rgba(124,77,255,0.15)' : 'rgba(255,255,255,0.04)',
                              color: (wizardData.composeVariant ?? 'stub') === v ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                          >
                            {v === 'stub' ? 'Stub (lightweight)' : 'Full (all services)'}
                          </button>
                        ))}
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                        Stub runs a minimal Alpine container. Full starts the complete stack (nginx, postgres, etc).
                      </p>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>SSH Configuration</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.4 }}>
                      SSH keys allow your development containers to securely authenticate and communicate with private repositories (e.g., GitHub, GitLab).
                    </p>

                    {/* Explanatory Note Card */}
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 20,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: 'var(--text-muted)'
                    }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="codicon codicon-info" style={{ color: 'var(--accent)' }} />
                        <span>Guide: How to choose?</span>
                      </div>
                      • <strong>Beginners (Recommended):</strong> Use your default host SSH key (click the auto-detect button below or type <code>host</code>).<br />
                      • <strong>Experts:</strong> Enter a custom SSH key filename located in your local <code>~/.ssh/</code> directory.<br />
                      • <strong>Skip:</strong> Leave this field empty if you do not require repository authentication inside your containers.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>SSH Key ID</label>
                        <input
                          type="text"
                          value={wizardData.sshKeyId ?? ''}
                          onChange={(e) => setWizardData({ ...wizardData, sshKeyId: e.target.value || undefined })}
                          placeholder="e.g. host or id_ed25519"
                          className="fluent-input"
                          style={{ fontFamily: 'monospace', width: '100%' }}
                        />
                        {wizardData.sshKeyId && profiles.find((p, idx) => p.sshKeyId === wizardData.sshKeyId && idx !== editingProfileIdx) && (
                          <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.25)' }}>
                            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span className="codicon codicon-warning" />
                              This SSH key is already used by profile "{profiles.find((p, idx) => p.sshKeyId === wizardData.sshKeyId && idx !== editingProfileIdx)?.name}". Each profile should have its own key.
                            </p>
                            <button
                              type="button"
                              className="dev-home-btn"
                              style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                              onClick={async () => {
                                const safeName = `id_ed25519_${wizardData.name.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'profile'}`;
                                const res = await window.dh.sshGenerate({ target: 'host', keyName: safeName });
                                if (res.ok && res.keyName) {
                                  setWizardData({ ...wizardData, sshKeyId: res.keyName });
                                }
                              }}
                            >
                              Generate fresh key for this profile
                            </button>
                          </div>
                        )}
                      </div>

                      {/* SSH Helper Actions */}
                      <div style={{
                        background: 'rgba(0, 0, 0, 0.15)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Local SSH Tools & Helpers:</div>
                        
                        {detectingSsh ? (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scanning your system for local SSH keys...</span>
                        ) : hostSshKey ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 12 }}>
                              <span className="codicon codicon-check" />
                              <span>Default SSH key found on your machine!</span>
                            </div>
                            <button
                              type="button"
                              className="dev-home-btn"
                              style={{ alignSelf: 'flex-start', fontSize: 12, padding: '6px 12px', margin: 0 }}
                              onClick={() => setWizardData({ ...wizardData, sshKeyId: 'host' })}
                            >
                              Use Default Host Key (host)
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ color: 'var(--yellow)', fontSize: 12 }}>
                              No default SSH key (id_ed25519) detected on your system.
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                type="text"
                                value={sshEmail}
                                onChange={(e) => setSshEmail(e.target.value)}
                                placeholder="email@example.com"
                                className="fluent-input"
                                style={{ fontSize: 12, padding: '6px 10px', width: '200px' }}
                              />
                              <button
                                type="button"
                                className="dev-home-btn"
                                style={{ fontSize: 12, padding: '6px 12px', margin: 0 }}
                                disabled={isGeneratingSsh}
                                onClick={async () => {
                                  setIsGeneratingSsh(true);
                                  setSshGenerateError(null);
                                  try {
                                    const res = await window.dh.sshGenerate({ target: 'host', email: sshEmail.trim() });
                                    if (res.ok) {
                                      await detectLocalSshKey();
                                      setWizardData({ ...wizardData, sshKeyId: 'host' });
                                    } else {
                                      setSshGenerateError(res.error || 'Failed to generate SSH key.');
                                    }
                                  } catch (e) {
                                    const err = e as { message?: string } | null;
                                    setSshGenerateError((err && err.message) || String(e));
                                  }
                                  setIsGeneratingSsh(false);
                                }}
                              >
                                {isGeneratingSsh ? 'Generating...' : 'Generate New Key Now'}
                              </button>
                            </div>
                            {sshGenerateError && (
                              <p style={{ color: 'var(--red)', fontSize: 12, margin: 0 }}>{sshGenerateError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Environment Variables</h3>
                      {/* Mode Toggle tabs */}
                      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => setEnvMode('beginner')}
                          style={{
                            background: envMode === 'beginner' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: envMode === 'beginner' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                          }}
                        >
                          Beginner
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnvMode('expert')}
                          style={{
                            background: envMode === 'expert' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: envMode === 'expert' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                          }}
                        >
                          Expert
                        </button>
                      </div>
                    </div>

                    {envMode === 'beginner' ? (
                      <div>
                        {/* Friendly Beginner Explanation */}
                        <div style={{
                          background: 'rgba(124, 77, 255, 0.05)',
                          border: '1px solid rgba(124, 77, 255, 0.15)',
                          borderRadius: 8,
                          padding: 16,
                          marginBottom: 20,
                          fontSize: 13,
                          lineHeight: 1.5
                        }}>
                          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="codicon codicon-star-full" style={{ color: 'var(--accent)' }} />
                            <span>Recommended: Keep it simple!</span>
                          </div>
                          Environment variables define configuration values such as ports or application modes. **If you are unsure, you can safely skip this step!** The environment will run correctly using defaults.
                        </div>

                        {/* Quick Presets Buttons */}
                        <div style={{ marginBottom: 20 }}>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)' }}>
                            Quick Presets (Click to toggle):
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {[
                              { key: 'PORT', value: '3000', label: 'Web Port (PORT=3000)' },
                              { key: 'NODE_ENV', value: 'development', label: 'Dev Mode (NODE_ENV=development)' },
                              { key: 'DEBUG', value: '*', label: 'Full Debug logs (DEBUG=*)' },
                              { key: 'DATABASE_URL', value: 'postgresql://postgres:postgres@db:5432/db', label: 'Default DB connection' }
                            ].map((preset) => {
                              const alreadyAdded = (wizardData.envVars || []).some(v => v.key === preset.key);
                              return (
                                <button
                                  key={preset.key}
                                  type="button"
                                  className="dev-home-btn"
                                  style={{
                                    fontSize: 11,
                                    padding: '6px 12px',
                                    margin: 0,
                                    borderColor: alreadyAdded ? 'var(--green)' : 'var(--border)',
                                    background: alreadyAdded ? 'rgba(76, 175, 80, 0.08)' : 'transparent',
                                    color: alreadyAdded ? 'var(--green)' : 'var(--text)'
                                  }}
                                  onClick={() => {
                                    if (alreadyAdded) {
                                      // Remove
                                      const vars = (wizardData.envVars || []).filter(v => v.key !== preset.key);
                                      setWizardData({ ...wizardData, envVars: vars });
                                    } else {
                                      // Add
                                      const vars = [...(wizardData.envVars || []), { key: preset.key, value: preset.value }];
                                      setWizardData({ ...wizardData, envVars: vars });
                                    }
                                  }}
                                >
                                  {alreadyAdded ? '✓ ' : '+ '} {preset.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Current List Display */}
                        {(wizardData.envVars || []).length > 0 && (
                          <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Currently Configured Variables:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(wizardData.envVars || []).map((ev, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'monospace', background: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: 4 }}>
                                  <span>{ev.key} = {ev.value}</span>
                                  <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }} onClick={() => {
                                    const vars = (wizardData.envVars || []).filter((_, idx) => idx !== i);
                                    setWizardData({ ...wizardData, envVars: vars });
                                  }}>✕</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {/* Expert Mode */}
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 16,
                          fontSize: 12,
                          color: 'var(--text-muted)'
                        }}>
                          <strong>Expert Mode:</strong> Add variables manually or copy-paste raw <code>.env</code> file contents below.
                        </div>

                        {/* Bulk paste input */}
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Bulk Import (.env):</label>
                          <textarea
                            value={envBulkInput}
                            onChange={(e) => setEnvBulkInput(e.target.value)}
                            placeholder="PASTE HERE:&#10;API_KEY=12345&#10;DATABASE_URL=postgres://..."
                            className="fluent-input"
                            style={{ width: '100%', height: '60px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
                          />
                          <button
                            type="button"
                            className="dev-home-btn"
                            style={{ marginTop: 6, fontSize: 11, padding: '4px 10px', margin: 0 }}
                            onClick={() => {
                              if (!envBulkInput.trim()) return;
                              const parsed: Array<{ key: string, value: string }> = [];
                              envBulkInput.split('\n').forEach(line => {
                                const trimmed = line.trim();
                                if (!trimmed || trimmed.startsWith('#')) return;
                                const eqIdx = trimmed.indexOf('=');
                                if (eqIdx > 0) {
                                  const key = trimmed.slice(0, eqIdx).trim();
                                  const value = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                                  if (key) parsed.push({ key, value });
                                }
                              });
                              if (parsed.length > 0) {
                                const current = wizardData.envVars || [];
                                const merged = [...current];
                                parsed.forEach(item => {
                                  const existingIdx = merged.findIndex(x => x.key === item.key);
                                  if (existingIdx >= 0) {
                                    merged[existingIdx] = item;
                                  } else {
                                    merged.push(item);
                                  }
                                });
                                setWizardData({ ...wizardData, envVars: merged });
                                setEnvBulkInput('');
                              }
                            }}
                          >
                            Parse & Import Environment Variables
                          </button>
                        </div>

                        {/* Standard Builder List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '180px', overflowY: 'auto', marginBottom: 16, paddingRight: 4 }}>
                          {(wizardData.envVars || []).map((ev, vi) => (
                            <div key={vi} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <input
                                type="text"
                                value={ev.key}
                                onChange={(e) => {
                                  const vars = [...(wizardData.envVars || [])];
                                  vars[vi] = { ...vars[vi], key: e.target.value };
                                  setWizardData({ ...wizardData, envVars: vars });
                                }}
                                placeholder="KEY"
                                className="fluent-input"
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                              />
                              <input
                                type="text"
                                value={ev.value}
                                onChange={(e) => {
                                  const vars = [...(wizardData.envVars || [])];
                                  vars[vi] = { ...vars[vi], value: e.target.value };
                                  setWizardData({ ...wizardData, envVars: vars });
                                }}
                                placeholder="value"
                                className="fluent-input"
                                style={{ flex: 2, fontFamily: 'monospace', fontSize: 13 }}
                              />
                              <button type="button" style={{ ...btnSmallDanger, padding: '8px 12px' }} onClick={() => {
                                const vars = (wizardData.envVars || []).filter((_, i) => i !== vi);
                                setWizardData({ ...wizardData, envVars: vars });
                              }}>✕</button>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          <input
                            type="text"
                            value={envKeyInput}
                            onChange={(e) => setEnvKeyInput(e.target.value)}
                            placeholder="NEW_KEY"
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
                          <button type="button" style={{ ...btn, padding: '0 20px' }} onClick={() => {
                            if (!envKeyInput.trim() || !envValueInput.trim()) return;
                            const vars = [...(wizardData.envVars || []), { key: envKeyInput.trim(), value: envValueInput.trim() }];
                            setWizardData({ ...wizardData, envVars: vars });
                            setEnvKeyInput('');
                            setEnvValueInput('');
                          }}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {wizardStep === 4 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Credential Store</h3>
                      {/* Mode Toggle tabs */}
                      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
                        <button
                          type="button"
                          onClick={() => setCredMode('beginner')}
                          style={{
                            background: credMode === 'beginner' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: credMode === 'beginner' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                          }}
                        >
                          Beginner
                        </button>
                        <button
                          type="button"
                          onClick={() => setCredMode('expert')}
                          style={{
                            background: credMode === 'expert' ? 'rgba(255,255,255,0.1)' : 'transparent',
                            color: credMode === 'expert' ? 'var(--text)' : 'var(--text-muted)',
                            border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600
                          }}
                        >
                          Expert
                        </button>
                      </div>
                    </div>

                    {credMode === 'beginner' ? (
                      <div>
                        {/* Friendly Beginner Explanation */}
                        <div style={{
                          background: 'rgba(124, 77, 255, 0.05)',
                          border: '1px solid rgba(124, 77, 255, 0.15)',
                          borderRadius: 8,
                          padding: 16,
                          marginBottom: 20,
                          fontSize: 13,
                          lineHeight: 1.5
                        }}>
                          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="codicon codicon-shield" style={{ color: 'var(--accent)' }} />
                            <span>Secure Secret Storage: Do you need it?</span>
                          </div>
                          The credential store securely encrypts and stores access tokens or secrets (e.g. GitHub tokens). **You can safely skip this step if you are not working with private clouds or registries!**
                        </div>

                        {/* Quick Presets Recommendation Buttons */}
                        <div style={{ marginBottom: 20 }}>
                          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)' }}>
                            Recommended Secret Templates:
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {[
                              { id: 'GITHUB_TOKEN', desc: 'GitHub Personal Access Token' },
                              { id: 'NPM_TOKEN', desc: 'NPM Registry Private Token' },
                              { id: 'AWS_ACCESS_KEY_ID', desc: 'AWS IAM Access Key ID' }
                            ].map((preset) => {
                              const alreadyLinked = (wizardData.credentialIds || []).includes(preset.id);
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  className="dev-home-btn"
                                  style={{
                                    fontSize: 11,
                                    padding: '8px 12px',
                                    margin: 0,
                                    borderColor: alreadyLinked ? 'var(--green)' : 'var(--border)',
                                    background: alreadyLinked ? 'rgba(76, 175, 80, 0.08)' : 'transparent',
                                    color: alreadyLinked ? 'var(--green)' : 'var(--text)'
                                  }}
                                  onClick={() => {
                                    setCredInputId(preset.id);
                                  }}
                                >
                                  {alreadyLinked ? '✓ Linked: ' : '+ Configure: '} {preset.desc} ({preset.id})
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Add Credential Value Form if Preset Selected */}
                        {credInputId && (
                          <div style={{ background: 'rgba(0, 0, 0, 0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                              <span>Enter secret value for: <code>{credInputId}</code></span>
                              <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => setCredInputId('')}>Cancel</button>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                              <input
                                type="password"
                                value={credInputValue}
                                onChange={(e) => setCredInputValue(e.target.value)}
                                placeholder="Paste secret token value here..."
                                className="fluent-input"
                                style={{ flex: 1 }}
                              />
                              <button
                                type="button"
                                style={{ ...btn, padding: '0 20px' }}
                                onClick={() => {
                                  if (!credInputValue.trim()) return;
                                  const credIds = [...(wizardData.credentialIds || []), credInputId];
                                  setWizardData({ ...wizardData, credentialIds: credIds });
                                  void window.dh.profileCredentialsStore({ id: credInputId, value: credInputValue.trim() });
                                  setCredInputId('');
                                  setCredInputValue('');
                                }}
                              >
                                Save & Link
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Currently Linked Credentials list */}
                        {(wizardData.credentialIds || []).length > 0 && (
                          <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Currently Linked Secrets:</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(wizardData.credentialIds || []).map((credId, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontFamily: 'monospace', background: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: 4 }}>
                                  <span>🔒 {credId}</span>
                                  <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }} onClick={() => {
                                    const oldIds = wizardData.credentialIds || [];
                                    const cId = oldIds[i];
                                    if (cId) void window.dh.profileCredentialsDelete({ id: cId });
                                    const credIds = oldIds.filter((_, idx) => idx !== i);
                                    setWizardData({ ...wizardData, credentialIds: credIds });
                                  }}>Delete</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        {/* Expert Mode */}
                        <div style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 16,
                          fontSize: 12,
                          color: 'var(--text-muted)'
                        }}>
                          <strong>Advanced Credentials Management:</strong> Define custom credential keys and secret values, or link previously saved secrets.
                        </div>

                        {/* Existing Credentials to link */}
                        {existingCredentialIds.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>
                              Existing System Credentials (Click to link):
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {existingCredentialIds.map(id => {
                                const alreadyLinked = (wizardData.credentialIds || []).includes(id);
                                return (
                                  <button
                                    key={id}
                                    type="button"
                                    className="dev-home-btn"
                                    style={{
                                      fontSize: 11,
                                      padding: '4px 8px',
                                      margin: 0,
                                      borderColor: alreadyLinked ? 'var(--green)' : 'var(--border)',
                                      color: alreadyLinked ? 'var(--green)' : 'var(--text)'
                                    }}
                                    onClick={() => {
                                      if (alreadyLinked) {
                                        const credIds = (wizardData.credentialIds || []).filter(c => c !== id);
                                        setWizardData({ ...wizardData, credentialIds: credIds });
                                      } else {
                                        const credIds = [...(wizardData.credentialIds || []), id];
                                        setWizardData({ ...wizardData, credentialIds: credIds });
                                      }
                                    }}
                                  >
                                    {alreadyLinked ? '✓ ' : '+ '} {id}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Standard builder/list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '150px', overflowY: 'auto', marginBottom: 16, paddingRight: 4 }}>
                          {(wizardData.credentialIds || []).map((credId, ci) => (
                            <div key={ci} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <span style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'monospace' }}>
                                {credId}
                              </span>
                              <button type="button" style={{ ...btnSmallDanger, padding: '8px 16px' }} onClick={() => {
                                const oldIds = wizardData.credentialIds || [];
                                const cId = oldIds[ci];
                                if (cId) void window.dh.profileCredentialsDelete({ id: cId });
                                const credIds = oldIds.filter((_, i) => i !== ci);
                                setWizardData({ ...wizardData, credentialIds: credIds });
                              }}>Delete</button>
                            </div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          <input
                            type="text"
                            value={credInputId}
                            onChange={(e) => setCredInputId(e.target.value)}
                            placeholder="CREDENTIAL_ID"
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
                          <button type="button" style={{ ...btn, padding: '0 20px' }} onClick={() => {
                            if (!credInputId.trim() || !credInputValue.trim()) return;
                            const cId = credInputId.trim();
                            const credIds = [...(wizardData.credentialIds || []), cId];
                            setWizardData({ ...wizardData, credentialIds: credIds });
                            void window.dh.profileCredentialsStore({ id: cId, value: credInputValue.trim() });
                            setCredInputId('');
                            setCredInputValue('');
                          }}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {wizardStep === 5 && (
                  <div>
                    <h3 style={{ margin: '0 0 8px 0', fontSize: 20, fontWeight: 700 }}>Review Configuration</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.4 }}>
                      Check your configuration profile options before deploying.
                    </p>

                    <div style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Profile Name:</span>
                        <span>{wizardData.name}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Base Template:</span>
                        <span>{wizardData.baseTemplate}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>SSH Key:</span>
                        <span style={{ fontFamily: 'monospace' }}>{wizardData.sshKeyId || 'system default'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Compose Stack:</span>
                        <span style={{ textTransform: 'uppercase', fontSize: 12, fontWeight: 700, color: (wizardData.composeVariant ?? 'stub') === 'full' ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {wizardData.composeVariant ?? 'stub'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Description:</span>
                        <span style={{ color: wizardData.description ? 'var(--text)' : 'var(--text-muted)', fontStyle: wizardData.description ? 'normal' : 'italic', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {wizardData.description || 'none'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Tags:</span>
                        <span style={{ color: (wizardData.tags ?? []).length > 0 ? 'var(--text)' : 'var(--text-muted)', fontStyle: (wizardData.tags ?? []).length > 0 ? 'normal' : 'italic' }}>
                          {(wizardData.tags ?? []).length > 0 ? (wizardData.tags ?? []).join(', ') : 'none'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        <span style={{ fontWeight: 600 }}>Environment Variables:</span>
                        <span>{(wizardData.envVars || []).length} variable(s)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: 600 }}>Linked Credentials:</span>
                        <span>{(wizardData.credentialIds || []).length} secret(s)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* FOOTER ACTIONS */}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 20, marginTop: 16 }}>
                <button
                  type="button"
                  style={{ ...btn, padding: '10px 20px' }}
                  onClick={() => {
                    setWizardData(null)
                    setIsCreatingProfile(false)
                    setEditingProfileIdx(null)
                  }}
                >
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                  {wizardStep > 1 && (
                    <button
                      type="button"
                      style={{ ...btn, padding: '10px 20px' }}
                      onClick={() => setWizardStep(wizardStep - 1)}
                    >
                      Back
                    </button>
                  )}
                  {wizardStep < 5 ? (
                    <button
                      type="button"
                      className="dev-home-btn"
                      style={{ padding: '10px 24px', margin: 0 }}
                      disabled={!wizardData.name.trim()}
                      onClick={() => setWizardStep(wizardStep + 1)}
                    >
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dev-home-btn"
                      style={{ padding: '10px 24px', margin: 0 }}
                      onClick={() => void saveWizardChanges()}
                    >
                      {isCreatingProfile ? 'Deploy Environment' : 'Apply Changes'}
                    </button>
                  )}
                </div>
              </div>

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
