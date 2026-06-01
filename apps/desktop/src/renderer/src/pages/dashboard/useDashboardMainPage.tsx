/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ContainerRow,
  type HostMetricsResponse,
  parseStoredActiveProfile,
  resolveActiveProfileName,
  isStoredActiveProfileValid,
  containerBelongsToComposeProject,
  isContainerRunningState,
  type CustomProfileEntry,
  type JobSummary,
} from '@linux-dev-home/shared'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { humanizeProfileError } from '../profileError'
import { useBetaFlags } from '../../hooks/useBetaFlags'
import { useTranslation } from 'react-i18next'
import {
  getProfileSwitchSnapshot,
  initProfileSwitchProgress,
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
  signalProfileSwitchStep,
  subscribeProfileSwitchState,
} from '../profileSwitchProgress'
import { runBackgroundProjectSetup } from '../projectBackgroundSetup'
import {
  ACTIVE_PROFILE_CHANGED_EVENT,
  broadcastActiveProfileChange,
  readDashboardSelectedProfile,
  syncDashboardSelectedProfile,
} from '../../lib/activeProfileSync'
import { cancelProjectSetup, readSetupSession } from '../projectSetupSession'
import {
  dataScienceScaffoldOptions,
  defaultBeginnerDataScienceDeps,
  type DataScienceToolchain,
} from '../dataScienceCreateWizard'
import { isAutoComposeMountPath } from '../../lib/workspacePath'
import {
  PRESET_PROFILES,
  pickPreferredEditorCmd,
  persistPreferredEditorCmd,
  type ProfileDef,
  type Toast,
} from './constants'

export function useDashboardMainPage() {
  const navigate = useNavigate()
  const betaFlags = useBetaFlags()
  const { t } = useTranslation('dashboard')
  const [docker, setDocker] = useState<
    { ok: true; rows: ContainerRow[] } | { ok: false; error: string } | null
  >(null)
  const [snap, setSnap] = useState<HostMetricsResponse | null>(null)
  const [metricsHistory, setMetricsHistory] = useState<Array<{ cpu: number; ram: number }>>(() =>
    Array.from({ length: 15 }, () => ({ cpu: 0, ram: 0 }))
  )
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [swState, setSwState] = useState(getProfileSwitchSnapshot)
  const [setupCancelling, setSetupCancelling] = useState(false)
  const [activeProfile, setActiveProfile] = useState<string | null>(null)
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null)
  const [customProfiles, setCustomProfiles] = useState<CustomProfileEntry[]>([])
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const profileSelectionInitialized = useRef(false)
  const lastSyncedActiveRef = useRef<string | null>(null)

  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [installedEditors, setInstalledEditors] = useState<Array<{ name: string; cmd: string }>>([])
  const [selectedEditorCmd, setSelectedEditorCmd] = useState<string>('')
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false)
  const [createProjectStep, setCreateProjectStep] = useState(1)
  const [createProjectName, setCreateProjectName] = useState('')
  const [createProjectToolchain, setCreateProjectToolchain] = useState<'python' | 'r' | 'both'>(
    'python'
  )
  const [createProjectPythonVer, setCreateProjectPythonVer] = useState('latest')
  const [createProjectPostgresVer, setCreateProjectPostgresVer] = useState('16')
  const [createProjectDeps, setCreateProjectDeps] = useState<Record<string, string>>({})
  const [createProjectAutoInstall, setCreateProjectAutoInstall] = useState(true)
  const [createProjectDepsMode, setCreateProjectDepsMode] = useState<'beginner' | 'expert'>(
    'beginner'
  )
  const [createProjectNotebook, setCreateProjectNotebook] = useState(true)
  const [createProjectMainPy, setCreateProjectMainPy] = useState(false)
  const [isScaffolding, setIsScaffolding] = useState(false)
  const [projectsHomeDir, setProjectsHomeDir] = useState('~/LuminaProjects')
  const [scaffoldProgress, setScaffoldProgress] = useState(0)
  const scaffoldStatusText = useMemo(() => {
    if (scaffoldProgress >= 100) return t('main.scaffold.finished')
    if (scaffoldProgress >= 40) return t('main.scaffold.installingDeps')
    return t('main.scaffold.startingDocker')
  }, [scaffoldProgress, t])
  const [installLogs, setInstallLogs] = useState<string[]>([])
  const [mobileSubTemplate, setMobileSubTemplate] = useState<'react-native' | 'flutter'>(
    'react-native'
  )
  const [suggestedPorts, setSuggestedPorts] = useState<Record<string, number>>({})

  type GitStatusData = {
    branch: string
    ahead: number
    behind: number
    staged: Array<{ status: string; path: string }>
    unstaged: Array<{ status: string; path: string }>
    conflictFileCount: number
  }
  const [gitStatus, setGitStatus] = useState<GitStatusData | null>(null)

  useEffect(() => {
    let unlisten: () => void
    listen<string>('project-install-log', (event) => {
      setInstallLogs((prev) => {
        const next = [...prev.slice(-49), event.payload]
        return next
      })
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  useEffect(() => {
    initProfileSwitchProgress()
    const unsub = subscribeProfileSwitchState(() => setSwState(getProfileSwitchSnapshot()))
    setSwState(getProfileSwitchSnapshot())
    return unsub
  }, [])

  useEffect(() => {
    let interval: any
    if (isScaffolding) {
      setScaffoldProgress(5)
      interval = setInterval(() => {
        setScaffoldProgress((prev) => {
          if (prev >= 90) return prev
          const increment = Math.max(0.5, (90 - prev) / 10)
          return prev + increment
        })
      }, 800)
    } else {
      setScaffoldProgress(100)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isScaffolding])

  useEffect(() => {
    if (!projectPath) {
      setGitStatus(null)
      return
    }
    const fetchGit = async () => {
      try {
        const gs = (await invoke('ipc_invoke', {
          channel: 'dh:git:vcs:status',
          payload: { repoPath: projectPath },
        })) as any
        if (gs.ok) {
          setGitStatus({
            branch: gs.branch ?? 'unknown',
            ahead: gs.ahead ?? 0,
            behind: gs.behind ?? 0,
            staged: gs.staged ?? [],
            unstaged: gs.unstaged ?? [],
            conflictFileCount: gs.conflictFileCount ?? 0,
          })
        } else {
          setGitStatus(null)
        }
      } catch {
        setGitStatus(null)
      }
    }
    void fetchGit()
    const id = setInterval(() => void fetchGit(), 10000)
    return () => clearInterval(id)
  }, [projectPath])

  const allProfiles = useMemo(() => {
    const customDefs = customProfiles.map((p) => {
      const preset = PRESET_PROFILES.find((pr) => pr.name === p.baseTemplate)
      return {
        name: p.name,
        title: p.name,
        description: t('profile.customDesc', { base: preset?.title || p.baseTemplate }),
        icon: preset?.icon || 'blank',
        accent: preset?.accent || 'var(--text-muted)',
        status: 'live' as ProfileDef['status'],
        isCustom: true,
        baseTemplate: p.baseTemplate,
      }
    })
    if (customDefs.length > 0) return customDefs
    return []
  }, [customProfiles, t])

  const refresh = useCallback(async () => {
    try {
      const d = (await window.dh.dockerList()) as
        | { ok: true; rows: ContainerRow[] }
        | { ok: false; error: string }
      setDocker(d)
    } catch (e) {
      setDocker({ ok: false, error: e instanceof Error ? e.message : String(e) })
    }
    try {
      const m = (await window.dh.metrics()) as HostMetricsResponse & { ok: boolean; error?: string }
      if (m.ok && m.metrics) {
        setSnap(m)
        const ramPct =
          m.metrics.totalMemMb > 0
            ? ((m.metrics.totalMemMb - m.metrics.freeMemMb) / m.metrics.totalMemMb) * 100
            : 0
        setMetricsHistory((prev) => {
          const next = [...prev, { cpu: m.metrics.cpuUsagePercent, ram: ramPct }]
          if (next.length > 15) {
            return next.slice(next.length - 15)
          }
          return next
        })
      }
    } catch {
      // silently fail, keep last metrics
    }
    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(list) ? list : [])
    } catch {
      setJobs([])
    }
    let customProfilesList: CustomProfileEntry[] = []
    try {
      const cp = (await window.dh.storeGet({ key: 'custom_profiles' })) as {
        ok: boolean
        data?: unknown
      }
      if (cp.ok && Array.isArray(cp.data)) {
        customProfilesList = cp.data as CustomProfileEntry[]
        setCustomProfiles(customProfilesList)
      }
    } catch {
      /* keep last known */
    }
    try {
      const ap = (await window.dh.storeGet({ key: 'active_profile' })) as {
        ok: boolean
        data?: unknown
      }
      const raw = ap.ok ? parseStoredActiveProfile(ap.data) : null
      if (customProfilesList.length === 0) {
        if (raw !== null) {
          await window.dh.storeDelete({ key: 'active_profile' })
        }
        setActiveProfile(null)
      } else if (raw !== null) {
        const resolved = resolveActiveProfileName(raw, customProfilesList)
        if (resolved !== null && isStoredActiveProfileValid(raw, customProfilesList)) {
          setActiveProfile(resolved)
          if (resolved !== raw && customProfilesList.length > 0) {
            await window.dh.storeSet({ key: 'active_profile', data: resolved })
          }
        } else {
          await window.dh.storeDelete({ key: 'active_profile' })
          setActiveProfile(null)
        }
      } else {
        setActiveProfile(null)
      }
    } catch {
      /* keep last known */
    }
    try {
      const phd = (await window.dh.storeGet({ key: 'projects_home_dir' } as any)) as {
        ok: boolean
        data?: unknown
      }
      if (phd.ok && typeof phd.data === 'string' && phd.data.trim()) {
        setProjectsHomeDir(phd.data.trim())
      }
    } catch {
      /* keep default */
    }

    invoke('ipc_invoke', { channel: 'dh:editor:list' })
      .then((res: any) => {
        if (res.ok && res.editors) {
          setInstalledEditors(res.editors)
          setSelectedEditorCmd((prev) => pickPreferredEditorCmd(res.editors, prev))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedProfileName) {
      setProjectPath(null)
      return
    }

    setProjectPath(null)
    const profileForLoad = selectedProfileName
    let cancelled = false

    void (async () => {
      try {
        const p = (await window.dh.storeGet({
          key: `project_dir_${profileForLoad}`,
        } as any)) as { ok: boolean; data?: unknown }
        if (cancelled) return

        if (!p.ok || !p.data || typeof p.data !== 'string') {
          setProjectPath(null)
          return
        }

        const storedPath = p.data.trim()
        if (!storedPath || isAutoComposeMountPath(storedPath, profileForLoad)) {
          setProjectPath(null)
          await window.dh.storeDelete({ key: `project_dir_${profileForLoad}` })
          return
        }

        const res = (await invoke('ipc_invoke', {
          channel: 'dh:fs:exists',
          payload: { path: storedPath },
        })) as { ok?: boolean; exists?: boolean }
        if (cancelled) return

        if (res.ok && res.exists) {
          setProjectPath(storedPath)
        } else {
          setProjectPath(null)
          await window.dh.storeDelete({ key: `project_dir_${profileForLoad}` })
        }
      } catch {
        if (!cancelled) setProjectPath(null)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedProfileName])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 4000)
    return () => clearInterval(id)
  }, [refresh])

  // Keep dashboard selection aligned with store `active_profile` (authoritative over localStorage).
  useEffect(() => {
    if (allProfiles.length === 0) return
    const names = new Set(allProfiles.map((p) => p.name))

    if (activeProfile && names.has(activeProfile)) {
      if (lastSyncedActiveRef.current !== activeProfile) {
        lastSyncedActiveRef.current = activeProfile
        setSelectedProfileName(activeProfile)
        syncDashboardSelectedProfile(activeProfile)
      }
      if (!profileSelectionInitialized.current) profileSelectionInitialized.current = true
      return
    }

    if (!profileSelectionInitialized.current) {
      profileSelectionInitialized.current = true
      const saved = readDashboardSelectedProfile()
      const next =
        (saved && names.has(saved) ? saved : null) ??
        allProfiles[0]?.name ??
        null
      if (next) setSelectedProfileName(next)
    }
  }, [allProfiles, activeProfile])

  useEffect(() => {
    if (selectedProfileName) {
      syncDashboardSelectedProfile(selectedProfileName)
    }
  }, [selectedProfileName])

  useEffect(() => {
    const onActiveProfileChanged = (event: Event): void => {
      const name = (event as CustomEvent<string>).detail
      if (!name || !allProfiles.some((p) => p.name === name)) return
      lastSyncedActiveRef.current = name
      setActiveProfile(name)
      setSelectedProfileName(name)
    }
    window.addEventListener(ACTIVE_PROFILE_CHANGED_EVENT, onActiveProfileChanged)
    return () => window.removeEventListener(ACTIVE_PROFILE_CHANGED_EVENT, onActiveProfileChanged)
  }, [allProfiles])

  const showToast = (
    message: string,
    type: 'success' | 'error',
    opts?: { persist?: boolean }
  ): void => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToast({ type, message })
    if (type === 'success' && !opts?.persist) {
      toastTimerRef.current = setTimeout(() => setToast(null), 8000)
    }
  }

  const handleCancelWorkspaceSetup = async (): Promise<void> => {
    if (!selectedProfileName || setupCancelling) return
    setSetupCancelling(true)
    try {
      await cancelProjectSetup(selectedProfileName)
      showToast(t('main.toast.setupCancelled'), 'success')
    } finally {
      setSetupCancelling(false)
    }
  }

  const activeSetupSession =
    swState.active && !swState.failed && selectedProfileName ? readSetupSession() : null
  const canCancelWorkspaceSetup = activeSetupSession?.profileName === selectedProfileName

  const handleLinkProject = async () => {
    if (!selectedProfileName) return
    try {
      const selected = await window.dh.selectFolder()
      if (selected && typeof selected === 'string') {
        setProjectPath(selected)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: selected,
        } as any)
        showToast(t('main.toast.linkedWorkspace'), 'success')
      }
    } catch {
      /* empty */
    }
  }

  const openProjectInEditor = async (path: string, cmd: string): Promise<boolean> => {
    if (!path || !cmd) return false
    persistPreferredEditorCmd(cmd)
    const res = (await invoke('ipc_invoke', {
      channel: 'dh:editor:open',
      payload: { path, cmd },
    })) as { ok?: boolean; error?: string }
    if (!res.ok) {
      showToast(res.error || t('main.toast.failedOpenIDE'), 'error', { persist: true })
      return false
    }
    return true
  }

  const handleOpenEditor = async () => {
    if (!projectPath || !selectedEditorCmd) return
    await openProjectInEditor(projectPath, selectedEditorCmd)
  }

  const closeCreateProjectModal = (): void => {
    setIsScaffolding(false)
    setCreateProjectModalOpen(false)
    setCreateProjectStep(1)
    setCreateProjectName('')
    setCreateProjectToolchain('python')
    setCreateProjectDepsMode('beginner')
    setCreateProjectAutoInstall(true)
    setMobileSubTemplate('react-native')
    setInstallLogs([])
  }

  const maybeStartBackgroundSetup = (
    projectPath: string,
    template: 'data-science' | 'web-dev',
    toolchain?: 'python' | 'r' | 'both'
  ): void => {
    if (!selectedProfileName) return
    const name = createProjectName.trim()
    showToast(t('main.toast.createdProject', { name }), 'success')
    if (!createProjectAutoInstall) return
    void runBackgroundProjectSetup({
      profileName: selectedProfileName,
      projectName: name,
      projectPath,
      template,
      toolchain,
      onToast: showToast,
    })
  }

  const submitCreateProject = async () => {
    if (!selectedProfileName || !createProjectName.trim()) return
    const name = createProjectName.trim()
    const path = `${projectsHomeDir}/${selectedProfileName}/${name}`
    const targetTemplate = selectedProfile.baseTemplate || selectedProfile.name

    setIsScaffolding(true)
    setInstallLogs([])
    setToast({ type: 'success', message: t('main.toast.scaffolding', { name }) })

    if (targetTemplate === 'data-science') {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:scaffold',
        payload: {
          path,
          template: 'data-science',
          options: dataScienceScaffoldOptions(createProjectToolchain, createProjectDeps, {
            createNotebook: createProjectNotebook,
            createMainScript: createProjectMainPy,
          }),
        },
      })) as any

      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        await window.dh.storeSet({
          key: `python_version_${selectedProfileName}`,
          data: createProjectPythonVer,
        } as any)
        await window.dh.storeSet({
          key: `postgres_version_${selectedProfileName}`,
          data: createProjectPostgresVer,
        } as any)

        closeCreateProjectModal()
        if (selectedEditorCmd) {
          void openProjectInEditor(res.path, selectedEditorCmd)
        }
        maybeStartBackgroundSetup(res.path, 'data-science', createProjectToolchain)
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedScaffold') })
      }
    } else if (targetTemplate === 'web-dev') {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:scaffold',
        payload: {
          path,
          template: 'web-dev',
          options: {
            dependencies: createProjectDeps,
            devDependencies: {},
          },
        },
      })) as any

      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        await window.dh.storeSet({
          key: `node_version_${selectedProfileName}`,
          data: createProjectPythonVer,
        } as any) // Reusing the same state variable for now
        await window.dh.storeSet({
          key: `postgres_version_${selectedProfileName}`,
          data: createProjectPostgresVer,
        } as any)

        closeCreateProjectModal()
        if (selectedEditorCmd) {
          void openProjectInEditor(res.path, selectedEditorCmd)
        }
        maybeStartBackgroundSetup(res.path, 'web-dev')
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedScaffold') })
      }
    } else if (targetTemplate === 'mobile') {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:scaffold',
        payload: { path, template: 'mobile', subTemplate: mobileSubTemplate },
      })) as any
      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        setToast({ type: 'success', message: t('main.toast.createdProject', { name }) })
        closeCreateProjectModal()
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedMobileScaffold') })
      }
    } else if (targetTemplate === 'ai-ml') {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:scaffold',
        payload: { path, template: 'ai-ml' },
      })) as any
      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        setToast({ type: 'success', message: t('main.toast.createdProject', { name }) })
        closeCreateProjectModal()
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedAIMLScaffold') })
      }
    } else if (targetTemplate === 'docs') {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:scaffold',
        payload: { path, template: 'docs' },
      })) as any
      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        setToast({ type: 'success', message: t('main.toast.createdProject', { name }) })
        closeCreateProjectModal()
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedDocsScaffold') })
      }
    } else {
      const res = (await invoke('ipc_invoke', {
        channel: 'dh:project:ensure_dir',
        payload: { path },
      })) as any
      if (res.ok) {
        setProjectPath(res.path)
        await window.dh.storeSet({
          key: `project_dir_${selectedProfileName}`,
          data: res.path,
        } as any)
        setToast({ type: 'success', message: t('main.toast.createdProject', { name }) })
        closeCreateProjectModal()
      } else {
        setIsScaffolding(false)
        setToast({ type: 'error', message: res.error || t('main.toast.failedCreateProject') })
      }
    }
  }

  async function handleConfirmSwitch(): Promise<void> {
    if (!selectedProfileName) return
    setConfirmModalOpen(false)
    signalProfileSwitchStarting(selectedProfileName, { skipPoll: true })
    const isRestart = activeProfile === selectedProfileName
    showToast(
      isRestart
        ? t('main.toast.restarting', { name: selectedProfileName })
        : t('main.toast.switching', { name: selectedProfileName }),
      'success'
    )

    try {
      const r = await window.dh.profileSwitch({
        from: activeProfile ?? undefined,
        to: selectedProfileName,
      })
      if (!r.ok) {
        const errMsg = r.error ?? r.log ?? 'Unknown error'
        signalProfileSwitchFailed(errMsg)
        showToast(humanizeProfileError(errMsg), 'error', { persist: true })
        return
      }
      signalProfileSwitchStep('Stack running', 100)
      setTimeout(() => signalProfileSwitchDone(), 800)
      try {
        await window.dh.storeSet({ key: 'active_profile', data: selectedProfileName })
        setActiveProfile(selectedProfileName)
        broadcastActiveProfileChange(selectedProfileName)
      } catch {
        setActiveProfile(selectedProfileName)
        broadcastActiveProfileChange(selectedProfileName)
      }
      showToast(t('main.toast.switched', { name: selectedProfileName }), 'success')
      void refresh()
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      signalProfileSwitchFailed(errMsg)
      showToast(errMsg, 'error', { persist: true })
    }
  }

  const selectedProfile = allProfiles.find((p) => p.name === selectedProfileName) ?? allProfiles[0]
  const isDataScience = selectedProfile?.baseTemplate === 'data-science'
  const isWebDev = selectedProfile?.baseTemplate === 'web-dev'

  const dsNotebookLabel = (tc: DataScienceToolchain): string => {
    if (tc === 'r') return t('main.createProject.generateNotebookR')
    if (tc === 'both') return t('main.createProject.generateNotebookBoth')
    return t('main.createProject.generateNotebook')
  }

  const dsMainScriptLabel = (tc: DataScienceToolchain): string => {
    if (tc === 'r') return t('main.createProject.generateMainR')
    if (tc === 'both') return t('main.createProject.generateMainBoth')
    return t('main.createProject.generateMainPy')
  }

  const renderDataSciencePackageGrid = (packageNames: readonly string[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {packageNames.map((dep) => (
        <div
          key={dep}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: Object.keys(createProjectDeps).includes(dep)
              ? `${selectedProfile.accent}20`
              : 'rgba(255,255,255,0.02)',
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${Object.keys(createProjectDeps).includes(dep) ? selectedProfile.accent : 'rgba(255,255,255,0.05)'}`,
            transition: 'all 0.2s',
          }}
        >
          <input
            type="checkbox"
            checked={Object.keys(createProjectDeps).includes(dep)}
            onChange={(e) => {
              if (e.target.checked) setCreateProjectDeps({ ...createProjectDeps, [dep]: 'latest' })
              else {
                const newDeps = { ...createProjectDeps }
                delete newDeps[dep]
                setCreateProjectDeps(newDeps)
              }
            }}
            style={{
              width: 16,
              height: 16,
              accentColor: selectedProfile.accent,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 14,
              color: Object.keys(createProjectDeps).includes(dep) ? '#fff' : 'var(--text-muted)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {dep}
          </span>
          {Object.keys(createProjectDeps).includes(dep) && (
            <input
              type="text"
              placeholder="latest"
              value={createProjectDeps[dep] === 'latest' ? '' : createProjectDeps[dep]}
              onChange={(e) =>
                setCreateProjectDeps({
                  ...createProjectDeps,
                  [dep]: e.target.value,
                })
              }
              style={{
                width: 55,
                padding: '2px 6px',
                fontSize: 12,
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff',
                borderRadius: 4,
                outline: 'none',
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
  const isProfileInitializing =
    Boolean(selectedProfileName) &&
    swState.active &&
    swState.targetProfile === selectedProfileName

  // Keep selectedProfileName in sync with what's actually displayed (guards against stale localStorage names)
  useEffect(() => {
    if (selectedProfile && selectedProfileName !== selectedProfile.name) {
      setSelectedProfileName(selectedProfile.name)
    }
  }, [selectedProfile, selectedProfileName])
  const m = snap?.metrics
  const ramUsedPct = useMemo(() => {
    if (!m || m.totalMemMb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.totalMemMb - m.freeMemMb) / m.totalMemMb) * 100))
  }, [m])
  const diskUsedPct = useMemo(() => {
    if (!m || m.diskTotalGb <= 0) return 0
    return Math.min(100, Math.max(0, ((m.diskTotalGb - m.diskFreeGb) / m.diskTotalGb) * 100))
  }, [m])
  const profileContainers = useMemo(() => {
    if (!docker || !docker.ok || !selectedProfileName) return []
    return docker.rows.filter((c) =>
      containerBelongsToComposeProject(c.name, selectedProfileName)
    )
  }, [docker, selectedProfileName])
  const runningProfileContainers = useMemo(() => {
    return profileContainers.filter((c) => isContainerRunningState(c.state))
  }, [profileContainers])
  const profileStackRunning = useMemo(() => {
    return runningProfileContainers.length > 0
  }, [runningProfileContainers])
  const isProfileActiveInStore = Boolean(selectedProfileName) && activeProfile === selectedProfileName
  const isProfileReady =
    isProfileActiveInStore && profileStackRunning && !isProfileInitializing

  const openCreateWorkspaceWizard = useCallback((): void => {
    if (!selectedProfile || !selectedProfileName) return
    if (isDataScience) {
      setCreateProjectDepsMode('beginner')
      setCreateProjectDeps(defaultBeginnerDataScienceDeps(createProjectToolchain))
    } else if (isWebDev) {
      setCreateProjectDeps({
        tailwindcss: 'latest',
        'react-router-dom': 'latest',
      })
    } else {
      setCreateProjectDeps({})
    }
    setCreateProjectStep(1)
    setCreateProjectName('')
    setCreateProjectModalOpen(true)
    const tmpl = selectedProfile.baseTemplate || selectedProfile.name
    void invoke('ipc_invoke', {
      channel: 'dh:ports:suggest',
      payload: {
        template: tmpl,
        profile: selectedProfileName,
        subTemplate: mobileSubTemplate,
      },
    })
      .then((r: any) => {
        if (r.ok && r.ports) setSuggestedPorts(r.ports)
      })
      .catch(() => {})
  }, [
    selectedProfile,
    selectedProfileName,
    isDataScience,
    isWebDev,
    createProjectToolchain,
    mobileSubTemplate,
  ])

  const activityData = useMemo(() => {
    return metricsHistory.map((item, idx) => ({
      label:
        idx === metricsHistory.length - 1
          ? t('main.activity.now')
          : t('main.activity.ago', { seconds: (metricsHistory.length - 1 - idx) * 4 }),
      cpu: item.cpu,
      ram: item.ram,
    }))
  }, [metricsHistory, t])

  const resourceAllocation = useMemo(() => {
    if (profileContainers.length === 0) {
      return [
        { label: t('main.resourceAllocation.running'), value: 0, color: 'var(--green)' },
        { label: t('main.resourceAllocation.exited'), value: 0, color: 'var(--text-muted)' },
        { label: t('main.resourceAllocation.paused'), value: 0, color: 'var(--yellow)' },
      ]
    }
    let running = 0
    let exited = 0
    let paused = 0
    for (const c of profileContainers) {
      const state = c.state.toLowerCase()
      if (state.includes('running') || state.includes('up')) {
        running++
      } else if (state.includes('paused')) {
        paused++
      } else {
        exited++
      }
    }
    return [
      { label: t('main.resourceAllocation.running'), value: running, color: 'var(--green)' },
      { label: t('main.resourceAllocation.exited'), value: exited, color: 'var(--text-muted)' },
      { label: t('main.resourceAllocation.paused'), value: paused, color: 'var(--yellow)' },
    ]
  }, [profileContainers, t])

  const liveEvents = useMemo(() => {
    if (jobs.length === 0) {
      return [
        {
          id: 'no-jobs',
          icon: 'info',
          color: 'rgba(255,255,255,0.1)',
          title: t('main.activity.noJobs.title'),
          time: t('main.activity.noJobs.time'),
        },
      ]
    }
    return jobs.map((j) => {
      let icon = 'server'
      let color = 'var(--accent)'
      if (j.state === 'running') {
        icon = 'play'
        color = 'var(--yellow)'
      } else if (j.state === 'failed') {
        icon = 'error'
        color = 'var(--orange)'
      } else if (j.state === 'completed') {
        icon = 'check'
        color = 'var(--green)'
      }
      return {
        id: j.id,
        icon,
        color,
        title: t('main.activity.jobPrefix', { kind: j.kind, state: j.state }),
        time:
          j.state === 'running'
            ? t('main.activity.progress', {
                progress: j.progress,
                log: j.logTail[j.logTail.length - 1] || t('main.activity.jobRunning'),
              })
            : j.logTail[j.logTail.length - 1] || t('main.activity.completed'),
      }
    })
  }, [jobs, t])

  return {
    docker,
    snap,
    metricsHistory,
    jobs,
    toast,
    swState,
    setupCancelling,
    activeProfile,
    selectedProfileName,
    customProfiles,
    confirmModalOpen,
    projectPath,
    installedEditors,
    selectedEditorCmd,
    createProjectModalOpen,
    createProjectStep,
    createProjectName,
    createProjectToolchain,
    createProjectPythonVer,
    createProjectPostgresVer,
    createProjectDeps,
    createProjectAutoInstall,
    createProjectDepsMode,
    createProjectNotebook,
    createProjectMainPy,
    isScaffolding,
    projectsHomeDir,
    scaffoldProgress,
    installLogs,
    mobileSubTemplate,
    suggestedPorts,
    gitStatus,
    scaffoldStatusText,
    allProfiles,
    refresh,
    ramUsedPct,
    diskUsedPct,
    profileContainers,
    runningProfileContainers,
    profileStackRunning,
    openCreateWorkspaceWizard,
    activityData,
    resourceAllocation,
    liveEvents,
    handleConfirmSwitch,
    navigate,
    betaFlags,
    t,
    showToast,
    handleCancelWorkspaceSetup,
    activeSetupSession,
    canCancelWorkspaceSetup,
    handleLinkProject,
    openProjectInEditor,
    handleOpenEditor,
    closeCreateProjectModal,
    maybeStartBackgroundSetup,
    submitCreateProject,
    selectedProfile,
    isDataScience,
    isWebDev,
    dsNotebookLabel,
    dsMainScriptLabel,
    renderDataSciencePackageGrid,
    isProfileInitializing,
    m,
    isProfileActiveInStore,
    isProfileReady,
    setDocker,
    setSnap,
    setMetricsHistory,
    setJobs,
    setToast,
    setSwState,
    setSetupCancelling,
    setActiveProfile,
    setSelectedProfileName,
    setCustomProfiles,
    setConfirmModalOpen,
    setProjectPath,
    setInstalledEditors,
    setSelectedEditorCmd,
    setCreateProjectModalOpen,
    setCreateProjectStep,
    setCreateProjectName,
    setCreateProjectToolchain,
    setCreateProjectPythonVer,
    setCreateProjectPostgresVer,
    setCreateProjectDeps,
    setCreateProjectAutoInstall,
    setCreateProjectDepsMode,
    setCreateProjectNotebook,
    setCreateProjectMainPy,
    setIsScaffolding,
    setProjectsHomeDir,
    setScaffoldProgress,
    setInstallLogs,
    setMobileSubTemplate,
    setSuggestedPorts,
    setGitStatus,
  }
}

export type DashboardMainViewModel = ReturnType<typeof useDashboardMainPage>
