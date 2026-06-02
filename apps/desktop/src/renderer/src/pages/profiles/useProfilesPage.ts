import {
  CustomProfilesStoreSchema,
  OnLoginAutomationStoreSchema,
  type CustomProfileEntry,
  type OnLoginAutomationStore,
  parseOnLoginAutomation,
  parseStoredActiveProfile,
  resolveActiveProfileName,
} from '@linux-dev-home/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PROFILE_SWITCH_STORAGE_KEY } from '../profileSwitchProgress'
import { broadcastActiveProfileChange } from '../../lib/activeProfileSync'
import {
  findEnvConflicts,
  generateUniqueEnvVars,
  getTemplateEnvPresets,
  partitionBeginnerEnvPresets,
  suggestUniqueProfileName,
  type RuntimeAssignedPort,
} from '../profileEnvConflicts'
import { findSshKeyConflict, suggestUniqueSshKeyName } from '../profileSshKey'
import { isAutoComposeMountPath, isUserLinkedWorkspacePath } from '../../lib/workspacePath'
import { RUNNING_CACHE_KEY, RUNNING_CACHE_TTL } from './constants'
import { fetchRuntimePortsForProfiles } from './ports'

export function useProfilesPage() {
  const { t } = useTranslation('profiles')
  const [profiles, setProfiles] = useState<CustomProfileEntry[]>([])
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'warning' } | null>(
    null
  )
  const [onLogin, setOnLogin] = useState<OnLoginAutomationStore>(() =>
    OnLoginAutomationStoreSchema.parse({})
  )
  const [rowError, setRowError] = useState<Record<number, string>>({})
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
  const [runningProfiles, setRunningProfiles] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<
    Record<string, 'starting' | 'stopping' | 'restarting' | null>
  >({})

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
  const [otherRuntimePorts, setOtherRuntimePorts] = useState<RuntimeAssignedPort[]>([])

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

  const handleGenerateFreshSshKey = useCallback(async () => {
    if (!wizardData?.name.trim()) {
      setSshGenerateError('Enter a profile name on step 1 before generating a key.')
      return
    }
    setIsGeneratingSsh(true)
    setSshGenerateError(null)
    try {
      const keyName = suggestUniqueSshKeyName(
        profiles,
        wizardData.name,
        editingProfileIdx
      )
      const res = await window.dh.sshGenerate({
        target: 'host',
        keyName,
        email: sshEmail.trim() || 'lumina@local',
      })
      const resolvedKeyName = res.keyName ?? keyName
      if (res.ok && resolvedKeyName) {
        setWizardData((prev) => (prev ? { ...prev, sshKeyId: resolvedKeyName } : prev))
      } else {
        setSshGenerateError(res.error || 'Failed to generate SSH key.')
      }
    } catch (e) {
      const err = e as { message?: string } | null
      setSshGenerateError((err && err.message) || String(e))
    }
    setIsGeneratingSsh(false)
  }, [wizardData, profiles, editingProfileIdx, sshEmail])

  const loadExistingCredentials = useCallback(async () => {
    try {
      const res = await window.dh.profileCredentialsList()
      if (res.ok && res.ids) {
        setExistingCredentialIds(res.ids)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (wizardStep === 2) {
      void detectLocalSshKey()
    } else if (wizardStep === 4) {
      void loadExistingCredentials()
    }
  }, [wizardStep, detectLocalSshKey, loadExistingCredentials])

  useEffect(() => {
    if (!wizardData?.name.trim()) {
      setOtherRuntimePorts([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const { others } = await fetchRuntimePortsForProfiles(
          profiles,
          editingProfileIdx,
          { template: wizardData.baseTemplate, profileName: wizardData.name.trim() }
        )
        if (cancelled) return
        setOtherRuntimePorts(others)
      } catch {
        if (!cancelled) {
          setOtherRuntimePorts([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [wizardData, profiles, editingProfileIdx])

  const loadExtras = useCallback(async (loadedProfiles: CustomProfileEntry[]): Promise<void> => {
    // Load active profile template
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as {
        ok: boolean
        data?: unknown
      }
      if (ap.ok) {
        const raw = parseStoredActiveProfile(ap.data)
        setActiveProfileTemplate(resolveActiveProfileName(raw, loadedProfiles))
      }
    } catch {
      /* ignore */
    }

    // Load linked project paths per profile
    const paths: Record<string, string | null> = {}
    const storeGetAny = window.dh.storeGet as (req: {
      key: string
    }) => Promise<{ ok: boolean; data?: unknown }>
    await Promise.all(
      loadedProfiles.map(async (p) => {
        try {
          const res = await storeGetAny({ key: `project_dir_${p.name}` })
          const raw = res.ok && typeof res.data === 'string' ? res.data.trim() : ''
          if (raw && isAutoComposeMountPath(raw, p.name)) {
            paths[p.name] = null
            try {
              await window.dh.storeDelete({ key: `project_dir_${p.name}` })
            } catch {
              /* ignore */
            }
            return
          }
          paths[p.name] = isUserLinkedWorkspacePath(raw, p.name) ? raw : null
        } catch {
          paths[p.name] = null
        }
      })
    )
    setProjectPaths(paths)
  }, []) // stable: only calls window.dh + setState setters

  const checkRunning = useCallback(
    async (profileList: CustomProfileEntry[]): Promise<Set<string>> => {
      if (profileList.length === 0) {
        setRunningProfiles(new Set())
        return new Set()
      }
      try {
        const res = await window.dh.profileRunningStatus({
          names: profileList.map((p) => p.name),
        })
        const running = new Set<string>(res.ok && res.running ? res.running : [])
        setRunningProfiles(running)
        // Only cache non-empty results to avoid overwriting valid state with transient empty
        if (running.size > 0) {
          try {
            localStorage.setItem(
              RUNNING_CACHE_KEY,
              JSON.stringify({ ts: Date.now(), running: [...running] })
            )
          } catch {
            /* ignore */
          }
        }
        return running
      } catch {
        setRunningProfiles(new Set())
        return new Set()
      }
    },
    []
  )

  const refreshRunning = useCallback(async (): Promise<Set<string>> => {
    return checkRunning(profiles)
  }, [profiles, checkRunning])

  useEffect(() => {
    // Serve cached running profiles instantly, then refresh in background
    try {
      const raw = localStorage.getItem(RUNNING_CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; running: string[] }
        if (Date.now() - cached.ts < RUNNING_CACHE_TTL && Array.isArray(cached.running)) {
          setRunningProfiles(new Set(cached.running))
        }
      }
    } catch {
      /* ignore corrupt cache */
    }
    // Check for pending switch from Dashboard (survives navigation)
    try {
      const raw = localStorage.getItem(PROFILE_SWITCH_STORAGE_KEY)
      if (raw) {
        const pending = JSON.parse(raw) as { profile: string; ts: number }
        if (Date.now() - pending.ts < 120_000 && pending.profile) {
          setActionLoading((prev) => ({ ...prev, [pending.profile]: 'starting' as const }))
        }
      }
    } catch {
      /* ignore */
    }
    void checkRunning(profiles)
    const interval = setInterval(() => {
      void checkRunning(profiles)
    }, 10_000)
    return () => clearInterval(interval)
  }, [profiles, checkRunning])

  const load = useCallback(async (): Promise<void> => {
    try {
      const res = (await window.dh.storeGet({ key: 'custom_profiles' })) as {
        ok: boolean
        data: unknown
        error?: string
      }
      if (res.ok && res.data) {
        const parsed = CustomProfilesStoreSchema.parse(res.data)
        setProfiles(parsed)
        void loadExtras(parsed)
      } else if (!res.ok) {
        setStatus({ message: res.error || t('msg.loadFailed'), type: 'warning' })
      }
    } catch (e) {
      setStatus({ message: e instanceof Error ? e.message : String(e), type: 'warning' })
    }
    try {
      const ol = (await window.dh.storeGet({ key: 'on_login_automation' })) as {
        ok: boolean
        data: unknown
      }
      if (ol.ok) setOnLogin(parseOnLoginAutomation(ol.data))
    } catch {
      /* ignore */
    }
  }, [loadExtras, t])

  useEffect(() => {
    void load()
  }, [load])

  async function save(next: CustomProfileEntry[], msg: string): Promise<void> {
    try {
      const parsed = CustomProfilesStoreSchema.parse(next)
      const res = (await window.dh.storeSet({ key: 'custom_profiles', data: parsed })) as {
        ok: boolean
        error?: string
      }
      if (res.ok) {
        setProfiles(parsed)
        setStatus({ message: msg, type: 'success' })
        void loadExtras(parsed)
      } else setStatus({ message: res.error || t('msg.saveFailed'), type: 'warning' })
    } catch (e) {
      setStatus({ message: e instanceof Error ? e.message : String(e), type: 'warning' })
    }
  }

  async function setAsActive(name: string): Promise<void> {
    try {
      const res = (await window.dh.storeSet({ key: 'active_profile', data: name })) as {
        ok: boolean
        error?: string
      }
      if (res.ok) {
        setActiveProfileTemplate(name)
        broadcastActiveProfileChange(name)
        setStatus({ message: t('msg.setActive', { template: name }), type: 'success' })
      } else {
        setStatus({ message: res.error || t('msg.setActiveFailed'), type: 'warning' })
      }
    } catch (e) {
      setStatus({ message: e instanceof Error ? e.message : String(e), type: 'warning' })
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
        setStatus({ message: t('msg.automationSaved'), type: 'success' })
      } else {
        setStatus({ message: res.error || t('msg.automationSaveFailed'), type: 'warning' })
      }
    } catch (e) {
      setStatus({ message: e instanceof Error ? e.message : String(e), type: 'warning' })
    }
  }

  async function removeAt(idx: number): Promise<void> {
    const profile = profiles[idx]
    if (profile) {
      await window.dh.composeDown({ profile: profile.name }).catch(() => {})
      try {
        const ap = (await window.dh.storeGet({ key: 'active_profile' })) as {
          ok: boolean
          data?: unknown
        }
        if (ap.ok && ap.data === profile.name) {
          await window.dh.storeDelete({ key: 'active_profile' })
          setActiveProfileTemplate(null)
        }
      } catch {
        /* ignore */
      }
    }
    const next = profiles.filter((_, i) => i !== idx)
    await save(next, t('msg.removed'))
  }

  async function duplicateAt(idx: number): Promise<void> {
    const p = profiles[idx]
    if (!p) return
    const copyName = suggestUniqueProfileName(`${p.name} Copy`, profiles, null)
    let runtimePorts: RuntimeAssignedPort[] = []
    try {
      const { others } = await fetchRuntimePortsForProfiles(profiles, null)
      runtimePorts = others
    } catch {
      /* use env-only collision avoidance */
    }
    const uniqueEnv = generateUniqueEnvVars(
      p.baseTemplate,
      copyName,
      profiles,
      null,
      p.envVars ?? [],
      runtimePorts
    )
    const next = [...profiles, { ...p, name: copyName, envVars: uniqueEnv }]
    await save(next, t('msg.duplicated'))
  }

  const envConflicts = useMemo(() => {
    if (!wizardData) return []
    return findEnvConflicts(
      profiles,
      wizardData.envVars ?? [],
      editingProfileIdx,
      otherRuntimePorts
    )
  }, [profiles, wizardData, editingProfileIdx, otherRuntimePorts])

  const sshKeyConflict = useMemo(
    () => findSshKeyConflict(profiles, wizardData?.sshKeyId, editingProfileIdx),
    [profiles, wizardData?.sshKeyId, editingProfileIdx]
  )

  const templateEnvPresets = useMemo(() => {
    if (!wizardData) return []
    return getTemplateEnvPresets(
      wizardData.baseTemplate,
      wizardData.name,
      profiles,
      editingProfileIdx,
      otherRuntimePorts
    )
  }, [wizardData, profiles, editingProfileIdx, otherRuntimePorts])

  const beginnerRecommendedPresets = useMemo(() => {
    return partitionBeginnerEnvPresets(templateEnvPresets).recommended
  }, [templateEnvPresets])

  const duplicateProfileName = useMemo(() => {
    if (!wizardData?.name.trim()) return null
    const match = profiles.find(
      (p, idx) =>
        p.name.trim().toLowerCase() === wizardData.name.trim().toLowerCase() &&
        idx !== editingProfileIdx
    )
    return match?.name ?? null
  }, [profiles, wizardData, editingProfileIdx])

  const wizardNextBlocked = useMemo(() => {
    if (!wizardData?.name.trim()) return true
    if (wizardStep === 1 && duplicateProfileName) return true
    if (wizardStep === 2 && sshKeyConflict) return true
    if (wizardStep === 3 && envConflicts.length > 0) return true
    return false
  }, [wizardData, wizardStep, duplicateProfileName, sshKeyConflict, envConflicts.length])

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
      setStatus({ message: t('msg.nameRequired'), type: 'warning' })
      return
    }
    if (duplicateProfileName) {
      setStatus({ message: t('msg.duplicateName'), type: 'warning' })
      return
    }
    let runtimeForSave = otherRuntimePorts
    if (wizardData.name.trim()) {
      try {
        const { others } = await fetchRuntimePortsForProfiles(profiles, editingProfileIdx)
        runtimeForSave = others
      } catch {
        /* keep cached ports from wizard session */
      }
    }
    const saveConflicts = findEnvConflicts(
      profiles,
      wizardData.envVars ?? [],
      editingProfileIdx,
      runtimeForSave
    )
    if (saveConflicts.length > 0) {
      setStatus({ message: t('msg.envConflicts'), type: 'warning' })
      setWizardStep(3)
      return
    }
    const finalData = { ...wizardData, name: wizardData.name.trim() }

    let next: CustomProfileEntry[]
    if (isCreatingProfile) {
      next = [...profiles, finalData]
      await save(next, t('msg.created', { name: finalData.name }))
      try {
        await window.dh.storeDelete({ key: `project_dir_${finalData.name}` })
        setProjectPaths((prev) => ({ ...prev, [finalData.name]: null }))
      } catch {
        /* ignore */
      }
    } else if (editingProfileIdx !== null) {
      next = [...profiles]
      next[editingProfileIdx] = finalData
      await save(next, t('msg.updated', { name: finalData.name }))
    }

    setWizardData(null)
    setIsCreatingProfile(false)
    setEditingProfileIdx(null)
    setOtherRuntimePorts([])
  }

  async function exportJson(): Promise<void> {
    const text = JSON.stringify(profiles, null, 2)
    try {
      await navigator.clipboard.writeText(text)
      setStatus({ message: t('msg.exportCopied'), type: 'success' })
    } catch {
      setImportText(text)
      setStatus({ message: t('msg.exportFallback'), type: 'success' })
    }
  }

  async function importJson(): Promise<void> {
    try {
      const raw = JSON.parse(importText) as unknown
      const parsed = CustomProfilesStoreSchema.parse(raw)
      await save(parsed, t('msg.imported'))
    } catch (e) {
      setStatus({ message: e instanceof Error ? e.message : String(e), type: 'warning' })
    }
  }

  const byTemplate = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of profiles) map.set(p.baseTemplate, (map.get(p.baseTemplate) ?? 0) + 1)
    return [...map.entries()]
  }, [profiles])
  return {
    profiles,
    setProfiles,
    importText,
    setImportText,
    status,
    setStatus,
    onLogin,
    setOnLogin,
    rowError,
    setRowError,
    editingProfileIdx,
    setEditingProfileIdx,
    openDropdownIdx,
    setOpenDropdownIdx,
    credInputId,
    setCredInputId,
    credInputValue,
    setCredInputValue,
    envKeyInput,
    setEnvKeyInput,
    envValueInput,
    setEnvValueInput,
    isCreatingProfile,
    setIsCreatingProfile,
    wizardStep,
    setWizardStep,
    wizardData,
    setWizardData,
    activeTab,
    setActiveTab,
    activeProfileTemplate,
    setActiveProfileTemplate,
    projectPaths,
    setProjectPaths,
    runningProfiles,
    setRunningProfiles,
    actionLoading,
    setActionLoading,
    envMode,
    setEnvMode,
    credMode,
    setCredMode,
    hostSshKey,
    setHostSshKey,
    detectingSsh,
    setDetectingSsh,
    isGeneratingSsh,
    setIsGeneratingSsh,
    sshEmail,
    setSshEmail,
    sshGenerateError,
    setSshGenerateError,
    existingCredentialIds,
    setExistingCredentialIds,
    envBulkInput,
    setEnvBulkInput,
    tagInput,
    setTagInput,
    otherRuntimePorts,
    setOtherRuntimePorts,
    detectLocalSshKey,
    handleGenerateFreshSshKey,
    loadExistingCredentials,
    loadExtras,
    checkRunning,
    refreshRunning,
    load,
    save,
    setAsActive,
    saveOnLogin,
    removeAt,
    duplicateAt,
    openCreateModal,
    openEditModal,
    saveWizardChanges,
    exportJson,
    importJson,
    envConflicts,
    sshKeyConflict,
    templateEnvPresets,
    beginnerRecommendedPresets,
    duplicateProfileName,
    wizardNextBlocked,
    byTemplate,
    t,
  }
}

export type ProfilesPageViewModel = ReturnType<typeof useProfilesPage>
