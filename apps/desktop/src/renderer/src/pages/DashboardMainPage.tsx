/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  type ComposeProfile,
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
import type { ReactElement } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { humanizeProfileError } from './profileError'
import { useBetaFlags } from '../hooks/useBetaFlags'
import { useTranslation } from 'react-i18next'

import './DashboardPage.css'
import {
  dismissProfileSwitchError,
  getProfileSwitchSnapshot,
  initProfileSwitchProgress,
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
  signalProfileSwitchStep,
  subscribeProfileSwitchState,
} from './profileSwitchProgress'
import { runBackgroundProjectSetup } from './projectBackgroundSetup'
import {
  ACTIVE_PROFILE_CHANGED_EVENT,
  broadcastActiveProfileChange,
  readDashboardSelectedProfile,
  syncDashboardSelectedProfile,
} from '../lib/activeProfileSync'
import { cancelProjectSetup, readSetupSession } from './projectSetupSession'
import {
  beginnerDepsSummaryKey,
  dataScienceScaffoldOptions,
  defaultBeginnerDataScienceDeps,
  defaultExpertDataScienceDeps,
  expertPythonPackages,
  expertRPackages,
  type DataScienceToolchain,
} from './dataScienceCreateWizard'

export {
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
} from './profileSwitchProgress'

const PREFERRED_EDITOR_KEY = 'dh:preferred_editor_cmd'

function pickPreferredEditorCmd(
  editors: Array<{ name: string; cmd: string }>,
  previous: string
): string {
  try {
    const saved = localStorage.getItem(PREFERRED_EDITOR_KEY)
    if (saved && editors.some((e) => e.cmd === saved)) return saved
  } catch {
    /* ignore */
  }
  if (previous && editors.some((e) => e.cmd === previous)) return previous
  return editors[0]?.cmd ?? ''
}

function persistPreferredEditorCmd(cmd: string): void {
  if (!cmd) return
  try {
    localStorage.setItem(PREFERRED_EDITOR_KEY, cmd)
  } catch {
    /* ignore */
  }
}

import { isAutoComposeMountPath } from '../lib/workspacePath'

interface ProfileDef {
  name: string
  title: string
  description: string
  icon: string
  accent: string
  status: 'live' | 'planned'
  isCustom?: boolean
  baseTemplate?: ComposeProfile
}

const PRESET_PROFILES: ProfileDef[] = [
  {
    name: 'web-dev',
    title: 'Web Development',
    description: 'Dockerized web stack with nginx placeholder and hot-reload friendly layout.',
    icon: 'globe',
    accent: 'var(--accent)',
    status: 'live',
  },
  {
    name: 'data-science',
    title: 'Data Science',
    description: 'Pandas, NumPy, Matplotlib & Jupyter Lab. Standard analytics stack.',
    icon: 'graph',
    accent: 'var(--green)',
    status: 'live',
  },
  {
    name: 'ai-ml',
    title: 'AI/ML Local',
    description: 'PyTorch + Jupyter environment. Ready for CUDA workloads (requires host drivers).',
    icon: 'hubot',
    accent: 'var(--blue)',
    status: 'live',
  },
  {
    name: 'mobile',
    title: 'Mobile App Dev',
    description:
      'Appium test server + JSON mock API. Supports React Native and Flutter sub-templates.',
    icon: 'device-mobile',
    accent: 'var(--green)',
    status: 'live',
  },
  {
    name: 'game-dev',
    title: 'Game Development',
    description:
      'Redis session store + headless game server container for local multiplayer testing.',
    icon: 'play-circle',
    accent: 'var(--yellow)',
    status: 'live',
  },
  {
    name: 'infra',
    title: 'Infra / K8s',
    description:
      'Traefik reverse proxy, Portainer management UI, and Prometheus metrics — full local infra stack.',
    icon: 'server-environment',
    accent: 'var(--purple)',
    status: 'live',
  },
  {
    name: 'desktop-gui',
    title: 'Desktop Qt/GTK',
    description:
      'Xpra remote display server for running and testing native GUI applications in containers.',
    icon: 'window',
    accent: 'var(--cyan)',
    status: 'live',
  },
  {
    name: 'docs',
    title: 'Docs / Writing',
    description: 'Jekyll/Hugo/Docusaurus writing environment.',
    icon: 'book',
    accent: 'var(--red)',
    status: 'live',
  },
  {
    name: 'empty',
    title: 'Empty Minimal',
    description: 'Clean slate alpine image for general scripting.',
    icon: 'blank',
    accent: 'var(--text-muted)',
    status: 'live',
  },
]

interface Toast {
  type: 'success' | 'error'
  message: string
}

export function DashboardMainPage(): ReactElement {
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
  const logsContainerRef = useRef<HTMLDivElement>(null)
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
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [installLogs])

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

  return (
    <div className="dashboard-split-layout">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            background: toast.type === 'success' ? 'var(--green)' : 'var(--orange)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
            zIndex: 2000,
            animation: 'slideInRight 0.3s ease-out',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            maxWidth: toast.type === 'error' ? 480 : 320,
          }}
        >
          <span
            className={`codicon ${toast.type === 'success' ? 'codicon-check' : 'codicon-error'}`}
            style={{ fontSize: 16, flexShrink: 0 }}
          />
          <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.45 }}>
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              opacity: 0.7,
              flexShrink: 0,
              marginLeft: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7'
            }}
          >
            <span className="codicon codicon-close" style={{ fontSize: 16 }} />
          </button>
        </div>
      )}

      {/* LEFT: Main View */}
      <div className="dashboard-main-view">
        {selectedProfile ? (
          <>
            {/* Hero Section */}
            <div className="profile-hero">
              <span
                className={`codicon codicon-${selectedProfile.icon}`}
                style={{ fontSize: 48, color: selectedProfile.accent }}
              />
              <h2 style={{ margin: '16px 0 8px', fontSize: 28, fontWeight: 700 }}>
                {selectedProfile.title}
              </h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, maxWidth: 600 }}>
                {selectedProfile.description}
              </p>
            </div>

            {/* Initialize Button */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => setConfirmModalOpen(true)}
                disabled={
                  (swState.active && swState.targetProfile === selectedProfileName) ||
                  (isProfileActiveInStore && profileStackRunning)
                }
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    isProfileActiveInStore && profileStackRunning
                      ? 'var(--green)'
                      : selectedProfile.accent,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor:
                    isProfileActiveInStore && profileStackRunning ? 'default' : 'pointer',
                  opacity:
                    isProfileActiveInStore && profileStackRunning
                      ? 0.6
                      : swState.active && swState.targetProfile === selectedProfileName
                        ? 0.8
                        : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                {swState.active && swState.targetProfile === selectedProfileName && (
                  <span
                    className="codicon codicon-loading"
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                )}
                {selectedProfile.status === 'planned'
                  ? t('main.btn.comingSoon')
                  : isProfileInitializing
                    ? t('main.btn.initializing')
                    : isProfileActiveInStore && profileStackRunning
                      ? t('main.btn.currentlyActive')
                      : isProfileActiveInStore
                        ? t('main.btn.startStack')
                        : activeProfile
                          ? t('main.btn.switchToThis')
                          : t('main.btn.initialize')}
              </button>
              {betaFlags['enable_profile_auto_switch'] && (
                <div
                  title={t('main.btn.autoSwitchOn')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 20,
                    background: 'rgba(124, 77, 255, 0.12)',
                    border: '1px solid rgba(124, 77, 255, 0.3)',
                    fontSize: 11,
                    color: 'var(--accent)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span className="codicon codicon-sync" style={{ fontSize: 11 }} />
                  {t('main.btn.autoSwitchOn')}
                </div>
              )}
            </div>

            {swState.active && swState.targetProfile === selectedProfileName && (
              <div
                style={{
                  marginTop: 20,
                  padding: '16px 20px',
                  borderRadius: 10,
                  background: swState.failed ? 'rgba(180,40,40,0.15)' : 'rgba(0,0,0,0.35)',
                  border: swState.failed
                    ? '1px solid rgba(220,80,80,0.55)'
                    : `1px solid ${selectedProfile.accent}44`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    marginBottom: swState.failed ? 12 : 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {swState.failed && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          color: '#f87171',
                          marginBottom: 6,
                        }}
                      >
                        {t('main.switch.setupFailed')}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: swState.failed ? '#fecaca' : selectedProfile.accent,
                        lineHeight: 1.45,
                        wordBreak: 'break-word',
                        display: 'block',
                      }}
                    >
                      {swState.step || t('main.switch.step.starting')}
                    </span>
                  </div>
                  {!swState.failed && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {Math.round(swState.progress)}%
                    </span>
                  )}
                </div>
                {!swState.failed && (
                  <div
                    style={{
                      width: '100%',
                      height: 4,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${swState.progress}%`,
                        height: '100%',
                        background: selectedProfile.accent,
                        borderRadius: 2,
                        transition: 'width 0.4s ease-out',
                        boxShadow: `0 0 8px ${selectedProfile.accent}80`,
                      }}
                    />
                  </div>
                )}
                {!swState.failed && canCancelWorkspaceSetup && (
                  <button
                    type="button"
                    disabled={setupCancelling}
                    onClick={() => void handleCancelWorkspaceSetup()}
                    style={{
                      marginTop: 12,
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(180,40,40,0.25)',
                      color: '#fecaca',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: setupCancelling ? 'wait' : 'pointer',
                      opacity: setupCancelling ? 0.7 : 1,
                    }}
                  >
                    {setupCancelling
                      ? t('main.switch.cancellingSetup')
                      : t('main.switch.cancelSetup')}
                  </button>
                )}
                {swState.failed && (
                  <button
                    type="button"
                    onClick={() => dismissProfileSwitchError()}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(0,0,0,0.25)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t('main.switch.dismissError')}
                  </button>
                )}
              </div>
            )}

            {/* Project Health Bar */}
            {isProfileReady && (
              <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(
                  [
                    {
                      label: t('main.health.git'),
                      status: gitStatus
                        ? gitStatus.conflictFileCount > 0
                          ? 'error'
                          : gitStatus.staged.length + gitStatus.unstaged.length > 0
                            ? 'warn'
                            : 'ok'
                        : 'unknown',
                    },
                    {
                      label: t('main.health.services'),
                      status:
                        profileContainers.length === 0
                          ? 'unknown'
                          : runningProfileContainers.length > 0
                            ? 'ok'
                            : 'warn',
                    },
                    {
                      label: t('main.health.storage'),
                      status: m
                        ? diskUsedPct > 85
                          ? 'error'
                          : diskUsedPct > 70
                            ? 'warn'
                            : 'ok'
                        : 'unknown',
                    },
                    { label: t('main.health.build'), status: 'unknown' as const },
                    { label: t('main.health.deps'), status: 'unknown' as const },
                    {
                      label: t('main.health.env'),
                      status: projectPath ? ('ok' as const) : ('unknown' as const),
                    },
                  ] as Array<{ label: string; status: 'ok' | 'warn' | 'error' | 'unknown' }>
                ).map((chip) => {
                  const colorMap = {
                    ok: 'var(--green)',
                    warn: 'var(--yellow)',
                    error: 'var(--red)',
                    unknown: 'var(--text-muted)',
                  }
                  const bgMap = {
                    ok: 'rgba(0,230,118,0.1)',
                    warn: 'rgba(255,193,7,0.1)',
                    error: 'rgba(255,82,82,0.1)',
                    unknown: 'rgba(255,255,255,0.04)',
                  }
                  const borderMap = {
                    ok: 'rgba(0,230,118,0.25)',
                    warn: 'rgba(255,193,7,0.25)',
                    error: 'rgba(255,82,82,0.25)',
                    unknown: 'rgba(255,255,255,0.08)',
                  }
                  const c = colorMap[chip.status]
                  const bg = bgMap[chip.status]
                  const border = borderMap[chip.status]
                  return (
                    <div
                      key={chip.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 20,
                        background: bg,
                        border: `1px solid ${border}`,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: c,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {chip.label}
                      </span>
                      <span style={{ color: c, fontWeight: 700, fontSize: 11 }}>
                        {chip.status.toUpperCase()}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {isProfileInitializing && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.metrics.title')}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('main.metrics.pending')}
                  </p>
                </div>
              </div>
            )}

            {/* Section 2: System Metrics (Live) - Moved Up */}
            {isProfileReady && m && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.metrics.title')}</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 16,
                    }}
                  >
                    <DashboardMetricBar
                      label={t('main.metrics.cpu')}
                      valueText={`${m.cpuUsagePercent.toFixed(0)}%`}
                      percent={m.cpuUsagePercent}
                    />
                    <DashboardMetricBar
                      label={t('main.metrics.ram')}
                      valueText={`${((m.totalMemMb - m.freeMemMb) / 1024).toFixed(1)} / ${(m.totalMemMb / 1024).toFixed(1)} GB`}
                      percent={ramUsedPct}
                    />
                    <DashboardMetricBar
                      label={t('main.metrics.disk')}
                      valueText={t('main.projectPath.freeGb', { free: m.diskFreeGb.toFixed(0) })}
                      percent={diskUsedPct}
                    />
                  </div>
                </div>
              </div>
            )}

            {isProfileInitializing && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.workspace.title')}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('main.workspace.pending')}
                  </p>
                </div>
              </div>
            )}

            {/* Workspace & Project Management */}
            {isProfileReady && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.workspace.title')}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          marginBottom: 8,
                          display: 'block',
                        }}
                      >
                        {t('main.workspace.projectPath')}
                      </label>
                      {!projectPath ? (
                        <>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              color: 'var(--text-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {t('main.workspace.noProjectHint')}
                          </p>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              readOnly
                              value={t('main.workspace.noProject')}
                              style={{
                                flex: 1,
                                minWidth: 220,
                                padding: '10px 14px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text-muted)',
                                fontSize: 13,
                              }}
                            />
                            <button
                              onClick={handleLinkProject}
                              style={{
                                padding: '0 16px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t('main.workspace.linkExisting')}
                            </button>
                            <button
                              onClick={() => openCreateWorkspaceWizard()}
                              style={{
                                padding: '0 16px',
                                borderRadius: 6,
                                border: 'none',
                                background: selectedProfile.accent,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t('main.workspace.createNew')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 12 }}>
                          <input
                            type="text"
                            readOnly
                            value={projectPath}
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(0,0,0,0.2)',
                              color: 'var(--text)',
                              fontSize: 13,
                            }}
                          />
                          <button
                            onClick={async () => {
                              setProjectPath(null)
                              await window.dh.storeDelete({
                                key: `project_dir_${selectedProfileName}`,
                              })
                              setToast({
                                type: 'success',
                                message: t('main.toast.projectUnlinked'),
                              })
                            }}
                            style={{
                              padding: '0 16px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,0,0,0.1)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = 'rgba(255,0,0,0.2)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = 'rgba(255,0,0,0.1)')
                            }
                          >
                            {t('main.workspace.unlinkProject')}
                          </button>
                        </div>
                      )}
                    </div>
                    {projectPath && (
                      <div>
                        <label
                          style={{
                            fontSize: 13,
                            color: 'var(--text-muted)',
                            marginBottom: 8,
                            display: 'block',
                          }}
                        >
                          {t('main.workspace.openInEditor')}
                        </label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <select
                            value={selectedEditorCmd}
                            onChange={(e) => {
                              setSelectedEditorCmd(e.target.value)
                              persistPreferredEditorCmd(e.target.value)
                            }}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(0,0,0,0.2)',
                              color: 'var(--text)',
                              fontSize: 13,
                              minWidth: 200,
                            }}
                          >
                            {installedEditors.length === 0 && (
                              <option value="">{t('main.workspace.noEditors')}</option>
                            )}
                            {installedEditors.map((ed) => (
                              <option key={ed.name} value={ed.cmd}>
                                {ed.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={handleOpenEditor}
                            disabled={!selectedEditorCmd}
                            style={{
                              padding: '0 16px',
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--green)',
                              color: '#fff',
                              cursor: selectedEditorCmd ? 'pointer' : 'not-allowed',
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {t('main.workspace.openIDE')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Git Status Panel */}
            {isProfileReady && projectPath && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3
                    className="dashboard-widget-title"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span className="codicon codicon-git-branch" aria-hidden />
                    {t('main.git.title')}
                    {gitStatus && (
                      <span
                        className="mono"
                        style={{
                          marginLeft: 4,
                          fontSize: 12,
                          color: 'var(--accent)',
                          fontWeight: 400,
                        }}
                      >
                        {gitStatus.branch}
                      </span>
                    )}
                  </h3>
                  {gitStatus ? (
                    <>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-arrow-up"
                            style={{ color: 'var(--green)', fontSize: 12 }}
                            aria-hidden
                          />
                          {gitStatus.ahead} {t('main.git.ahead')}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-arrow-down"
                            style={{ color: 'var(--yellow)', fontSize: 12 }}
                            aria-hidden
                          />
                          {gitStatus.behind} {t('main.git.behind')}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-edit"
                            style={{ color: 'var(--accent)', fontSize: 12 }}
                            aria-hidden
                          />
                          {gitStatus.staged.length + gitStatus.unstaged.length}{' '}
                          {t('main.git.changed')}
                          {gitStatus.staged.length > 0 && (
                            <span style={{ color: 'var(--green)', fontSize: 11 }}>
                              ({gitStatus.staged.length} {t('main.git.staged')})
                            </span>
                          )}
                        </span>
                        {gitStatus.conflictFileCount > 0 && (
                          <span
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                          >
                            <span
                              className="codicon codicon-warning"
                              style={{ color: 'var(--red)', fontSize: 12 }}
                              aria-hidden
                            />
                            <span style={{ color: 'var(--red)' }}>
                              {gitStatus.conflictFileCount} {t('main.git.conflicts')}
                            </span>
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-git-commit"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.commit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-cloud-upload"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.push')}
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-cloud-download"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.pull')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('main.git.notRepo')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Active Jobs Panel */}
            {isProfileReady && jobs.some((j) => j.state === 'running') && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.activeJobs.title')}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {jobs
                      .filter((j) => j.state === 'running')
                      .map((j) => {
                        const pct = Math.min(100, Math.max(0, j.progress ?? 0))
                        return (
                          <div
                            key={j.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 6,
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{j.kind}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {pct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 4,
                                  borderRadius: 2,
                                  background: 'rgba(255,255,255,0.08)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: selectedProfile.accent,
                                    borderRadius: 2,
                                    transition: 'width 0.4s ease-out',
                                  }}
                                />
                              </div>
                              {j.logTail && j.logTail.length > 0 && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: 'var(--text-muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {j.logTail[j.logTail.length - 1]}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void window.dh.jobCancel({ id: j.id })}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 4,
                                border: '1px solid rgba(255,82,82,0.3)',
                                background: 'rgba(255,82,82,0.08)',
                                color: '#ff5252',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {t('main.activeJobs.cancel')}
                            </button>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Analytics Grid (Activity + Container Status Side-by-Side) */}
            {isProfileReady && selectedProfileName && (
              <div
                style={{
                  marginTop: 32,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
                  gap: 20,
                }}
              >
                <ActivityChart data={activityData} />
                <ResourceDonutChart data={resourceAllocation} />
              </div>
            )}

            {/* Section 4: Active Containers + Services Grid */}
            <div
              style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
            >
              {/* Active Containers Table */}
              {activeProfile && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('main.containers.title')}
                  </h3>
                  {profileContainers.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.name')}
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.state')}
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.image')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileContainers.map((row) => (
                            <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 12px' }}>{row.name}</td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  color:
                                    row.state === 'running' ? 'var(--green)' : 'var(--text-muted)',
                                }}
                              >
                                {row.state}
                              </td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  color: 'var(--text-muted)',
                                  fontSize: 12,
                                }}
                              >
                                {row.image}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 13,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      {t('main.containers.empty')}
                    </div>
                  )}
                </div>
              )}

              {/* Running Services */}
              {selectedProfileName && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('main.services.title')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {runningProfileContainers.length > 0 ? (
                      runningProfileContainers.map((c) => {
                        const isRunning = isContainerRunningState(c.state)
                        const isPending = c.state.toLowerCase().includes('restarting')
                        const dotColor = isRunning
                          ? 'var(--green)'
                          : isPending
                            ? 'var(--yellow)'
                            : 'var(--text-muted)'
                        const portMatches = [...c.ports.matchAll(/(\d+)->(\d+)\/(\w+)/g)]
                        return (
                          <div
                            key={c.id}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: portMatches.length > 0 ? 8 : 0,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: dotColor,
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
                                >
                                  {c.name}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {c.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => navigate('/docker')}
                                  title={t('main.services.viewDocker')}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                  }}
                                >
                                  <span className="codicon codicon-link-external" aria-hidden />
                                </button>
                              </div>
                            </div>
                            {portMatches.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                  paddingLeft: 16,
                                }}
                              >
                                {portMatches.map((m, i) => {
                                  const hostPort = parseInt(m[1], 10)
                                  const HTTP_PORTS = new Set([
                                    80, 443, 3000, 3001, 4200, 5000, 5173, 8000, 8080, 8443, 9000,
                                  ])
                                  return (
                                    <span
                                      key={i}
                                      style={{
                                        fontSize: 11,
                                        color: 'var(--accent)',
                                        background: 'rgba(var(--accent-rgb, 100,149,237), 0.1)',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {HTTP_PORTS.has(hostPort) ? (
                                        <a
                                          href={`http://localhost:${hostPort}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ color: 'inherit', textDecoration: 'none' }}
                                        >
                                          :{hostPort}
                                        </a>
                                      ) : (
                                        t('main.ports.protocol', {
                                          protocol: m[3].toUpperCase(),
                                          port: hostPort,
                                        })
                                      )}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div
                        style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                      >
                        {t('main.services.empty')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Recent Activity Feed at Bottom */}
            {selectedProfileName && (
              <div style={{ marginTop: 32 }}>
                <EventFeed events={liveEvents} />
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <span className="codicon codicon-person-add" style={{ fontSize: 48, opacity: 0.3 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>
                {t('main.noProfiles.title')}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>{t('main.noProfiles.description')}</p>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: Profile Sidebar */}
      <div className="dashboard-sidebar">
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {t('main.sidebar.title')}
        </h3>
        <div className="profile-list">
          {allProfiles.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              {t('main.sidebar.empty')}
            </p>
          )}
          {allProfiles.map((prof) => (
            <button
              key={prof.name}
              type="button"
              onClick={() => setSelectedProfileName(prof.name)}
              className={`profile-list-item ${selectedProfileName === prof.name ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border:
                  selectedProfileName === prof.name
                    ? `1px solid ${prof.accent}`
                    : '1px solid var(--border)',
                borderRadius: 6,
                background:
                  selectedProfileName === prof.name
                    ? `color-mix(in srgb, ${prof.accent} 8%, var(--bg-widget))`
                    : 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                marginBottom: 8,
                transition: 'all 0.2s ease',
              }}
            >
              <span
                className={`codicon codicon-${prof.icon}`}
                style={{ fontSize: 16, color: prof.accent, flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {prof.title}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: activeProfile === prof.name ? prof.accent : 'var(--border)',
                  flexShrink: 0,
                }}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModalOpen && selectedProfile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-widget)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
              {t('main.confirm.title')}
            </h3>
            <p
              style={{
                margin: '0 0 20px',
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {activeProfile ? (
                <>
                  {t('main.confirm.composeDown')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{activeProfile}</strong>,{' '}
                  {t('main.confirm.thenStart')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{selectedProfile.title}</strong>?
                </>
              ) : (
                <>
                  {t('main.confirm.start')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{selectedProfile.title}</strong>?
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {t('main.confirm.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitch}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 6,
                  background: selectedProfile.accent,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {t('main.confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {createProjectModalOpen && selectedProfile && (
        <div className="fluent-modal-overlay">
          <div className="fluent-modal-content" style={{ maxWidth: isDataScience ? 520 : 400 }}>
            {isScaffolding ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 20 }}>{scaffoldStatusText}</h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
                  {t('main.createProject.settingUp', { name: createProjectName })}
                </p>

                <div
                  style={{
                    width: '100%',
                    height: 6,
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: 3,
                    overflow: 'hidden',
                    marginBottom: 24,
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
                  }}
                >
                  <div
                    style={{
                      width: `${scaffoldProgress}%`,
                      height: '100%',
                      background: selectedProfile.accent,
                      borderRadius: 3,
                      transition: 'width 0.4s ease-out',
                      boxShadow: `0 0 10px ${selectedProfile.accent}`,
                    }}
                  />
                </div>

                {installLogs.length > 0 && (
                  <div
                    style={{
                      marginTop: 24,
                      textAlign: 'left',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                      overflow: 'hidden',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    }}
                  >
                    {/* Terminal Header */}
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#ff5f56',
                        }}
                      />
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#ffbd2e',
                        }}
                      />
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: '#27c93f',
                        }}
                      />
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          fontFamily: 'sans-serif',
                          letterSpacing: 0.5,
                        }}
                      >
                        {t('main.createProject.installProgress')}
                      </span>
                    </div>
                    {/* Terminal Body */}
                    <div
                      ref={logsContainerRef}
                      style={{
                        padding: 12,
                        height: 140,
                        overflowY: 'auto',
                        fontFamily: '"Fira Code", monospace, Consolas',
                        fontSize: 12,
                        color: '#a9adc1',
                        lineHeight: 1.5,
                      }}
                    >
                      {installLogs.map((log, i) => (
                        <div key={i} style={{ marginBottom: 4, wordBreak: 'break-all' }}>
                          <span style={{ color: selectedProfile.accent, marginRight: 8 }}>❯</span>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : !isDataScience && !isWebDev ? (
              <>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>
                  {t('main.createProject.title')}
                </h2>
                <p
                  style={{
                    margin: '0 0 24px',
                    color: 'var(--text-muted)',
                    fontSize: 15,
                    lineHeight: 1.6,
                  }}
                >
                  {t('main.createProject.description', {
                    profile: selectedProfile.title,
                    path: projectsHomeDir,
                  })}
                </p>
                <input
                  type="text"
                  autoFocus
                  value={createProjectName}
                  onChange={(e) => setCreateProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitCreateProject()
                  }}
                  placeholder={t('main.createProject.placeholder')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.2)',
                    color: 'var(--text)',
                    fontSize: 16,
                    marginBottom: 20,
                    outline: 'none',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = selectedProfile.accent
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  }}
                />
                {(selectedProfile?.baseTemplate || selectedProfile?.name) === 'mobile' && (
                  <div style={{ marginBottom: 20 }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                        fontWeight: 600,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('main.createProject.mobileFramework')}
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['react-native', 'flutter'] as const).map((fw) => (
                        <button
                          key={fw}
                          type="button"
                          onClick={() => setMobileSubTemplate(fw)}
                          style={{
                            flex: 1,
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: `1px solid ${mobileSubTemplate === fw ? selectedProfile.accent : 'rgba(255,255,255,0.1)'}`,
                            background:
                              mobileSubTemplate === fw
                                ? `${selectedProfile.accent}22`
                                : 'rgba(0,0,0,0.2)',
                            color:
                              mobileSubTemplate === fw
                                ? selectedProfile.accent
                                : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 14,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {fw === 'react-native'
                            ? t('main.createProject.reactNative')
                            : t('main.createProject.flutter')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(suggestedPorts).length > 0 && (
                  <div
                    style={{
                      marginBottom: 20,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                        marginBottom: 8,
                      }}
                    >
                      {t('main.createProject.servicesPorts')}
                    </div>
                    {Object.entries(suggestedPorts).map(([svc, port]) => (
                      <div
                        key={svc}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            color: 'var(--text-muted)',
                            textTransform: 'capitalize',
                          }}
                        >
                          {svc.replace('_', ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontFamily: 'monospace',
                            color: selectedProfile.accent,
                          }}
                        >
                          :{port}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      closeCreateProjectModal()
                      setSuggestedPorts({})
                    }}
                    style={{
                      padding: '10px 24px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                    }}
                  >
                    {t('main.createProject.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={submitCreateProject}
                    disabled={!createProjectName.trim()}
                    style={{
                      padding: '10px 24px',
                      border: 'none',
                      borderRadius: 6,
                      background: createProjectName.trim()
                        ? selectedProfile.accent
                        : 'rgba(255,255,255,0.1)',
                      color: createProjectName.trim() ? '#fff' : 'var(--text-muted)',
                      cursor: createProjectName.trim() ? 'pointer' : 'not-allowed',
                      fontWeight: 600,
                      fontSize: 14,
                      boxShadow: createProjectName.trim()
                        ? `0 4px 12px ${selectedProfile.accent}40`
                        : 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (createProjectName.trim()) {
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = `0 6px 16px ${selectedProfile.accent}60`
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (createProjectName.trim()) {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = `0 4px 12px ${selectedProfile.accent}40`
                      }
                    }}
                  >
                    {t('main.createProject.create')}
                  </button>
                </div>
              </>
            ) : isDataScience || isWebDev ? (
              <>
                <h2 style={{ margin: '0 0 16px 0', fontSize: 24, fontWeight: 700 }}>
                  {isDataScience
                    ? t('main.createProject.setupWizard', { profile: 'Data Science' })
                    : t('main.createProject.setupWizard', { profile: 'Web Development' })}
                </h2>

                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      style={{
                        flex: 1,
                        height: 4,
                        borderRadius: 2,
                        background:
                          step <= createProjectStep
                            ? selectedProfile.accent
                            : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.3s ease',
                      }}
                    />
                  ))}
                </div>

                {createProjectStep === 1 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step1')}
                    </p>

                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('main.createProject.projectName')}
                    </strong>
                    <input
                      type="text"
                      autoFocus
                      value={createProjectName}
                      onChange={(e) => setCreateProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && createProjectName.trim()) setCreateProjectStep(2)
                      }}
                      placeholder={
                        isDataScience
                          ? t('main.createProject.placeholderDataScience')
                          : t('main.createProject.placeholderWebDev')
                      }
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'var(--text)',
                        fontSize: 16,
                        marginBottom: 20,
                        outline: 'none',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                        transition: 'border-color 0.2s ease',
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = selectedProfile.accent
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      }}
                    />

                    {isDataScience ? (
                      <>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.toolchain', 'Toolchain')}
                        </strong>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                          {(['python', 'r', 'both'] as const).map((tc) => (
                            <button
                              key={tc}
                              type="button"
                              onClick={() => {
                                setCreateProjectToolchain(tc)
                                setCreateProjectDeps(
                                  createProjectDepsMode === 'beginner'
                                    ? defaultBeginnerDataScienceDeps(tc)
                                    : defaultExpertDataScienceDeps(tc)
                                )
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                borderRadius: 8,
                                border: `1px solid ${createProjectToolchain === tc ? selectedProfile.accent : 'rgba(255,255,255,0.1)'}`,
                                background:
                                  createProjectToolchain === tc
                                    ? `${selectedProfile.accent}22`
                                    : 'rgba(0,0,0,0.2)',
                                color:
                                  createProjectToolchain === tc
                                    ? selectedProfile.accent
                                    : 'var(--text-muted)',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: 14,
                                transition: 'all 0.2s ease',
                                textTransform: 'capitalize',
                              }}
                            >
                              {tc}
                            </button>
                          ))}
                        </div>

                        {createProjectToolchain !== 'r' && (
                          <>
                            <strong
                              style={{
                                display: 'block',
                                marginBottom: 8,
                                fontSize: 13,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('main.createProject.pythonVersion')}
                            </strong>
                            <select
                              value={createProjectPythonVer}
                              onChange={(e) => setCreateProjectPythonVer(e.target.value)}
                              style={{
                                width: '100%',
                                padding: '12px 16px',
                                borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text)',
                                fontSize: 16,
                                marginBottom: 32,
                                outline: 'none',
                                appearance: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="latest">
                                {t('main.createProject.latestStableJupyter')}
                              </option>
                              <option value="3.11">{t('main.createProject.python311')}</option>
                              <option value="3.10">{t('main.createProject.python310')}</option>
                              <option value="3.9">{t('main.createProject.python39')}</option>
                              <option value="3.8">{t('main.createProject.python38')}</option>
                            </select>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.nodeVersion')}
                        </strong>
                        <select
                          value={createProjectPythonVer} // We are reusing the state variable for simplicity
                          onChange={(e) => setCreateProjectPythonVer(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'var(--text)',
                            fontSize: 16,
                            marginBottom: 32,
                            outline: 'none',
                            appearance: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="latest">{t('main.createProject.latestStable22')}</option>
                          <option value="20">{t('main.createProject.node20')}</option>
                          <option value="18">{t('main.createProject.node18')}</option>
                        </select>
                      </>
                    )}
                  </div>
                )}
                {createProjectStep === 2 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step2')}
                    </p>

                    <strong
                      style={{
                        display: 'block',
                        marginBottom: 8,
                        fontSize: 13,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {t('main.createProject.pgVersion')}
                    </strong>
                    <select
                      value={createProjectPostgresVer}
                      onChange={(e) => setCreateProjectPostgresVer(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.2)',
                        color: 'var(--text)',
                        fontSize: 16,
                        marginBottom: 20,
                        outline: 'none',
                        appearance: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="16">{t('main.createProject.pg16')}</option>
                      <option value="15">{t('main.createProject.pg15')}</option>
                      <option value="14">{t('main.createProject.pg14')}</option>
                      <option value="13">{t('main.createProject.pg13')}</option>
                    </select>

                    <div
                      style={{
                        background: 'rgba(0,0,0,0.2)',
                        padding: 16,
                        borderRadius: 8,
                        border: `1px solid ${selectedProfile.accent}50`,
                        marginBottom: 32,
                      }}
                    >
                      <strong
                        style={{ display: 'block', marginBottom: 8, color: selectedProfile.accent }}
                      >
                        {t('main.createProject.isolatedEnv')}
                      </strong>
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                        {t('main.createProject.isolatedDesc')}
                      </p>
                    </div>
                  </div>
                )}
                {createProjectStep === 3 && (
                  <div style={{ animation: 'fade-in 0.3s ease' }}>
                    <p
                      style={{
                        margin: '0 0 24px',
                        color: 'var(--text-muted)',
                        fontSize: 15,
                        lineHeight: 1.6,
                      }}
                    >
                      {t('main.createProject.step3')}
                    </p>

                    <div style={{ marginBottom: 20 }}>
                      <strong
                        style={{
                          display: 'block',
                          marginBottom: 12,
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: 1,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {t('main.createProject.scaffoldFiles')}
                      </strong>
                      {isDataScience ? (
                        <>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={createProjectNotebook}
                              onChange={(e) => setCreateProjectNotebook(e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {dsNotebookLabel(createProjectToolchain)}
                            </span>
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 16,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={createProjectMainPy}
                              onChange={(e) => setCreateProjectMainPy(e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {dsMainScriptLabel(createProjectToolchain)}
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              marginBottom: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={true}
                              readOnly
                              style={{ width: 16, height: 16, accentColor: selectedProfile.accent }}
                            />
                            <span style={{ fontSize: 14 }}>
                              {t('main.createProject.viteReact')}
                            </span>
                          </label>
                        </>
                      )}
                    </div>

                    <div style={{ marginBottom: 20 }}>
                      {isDataScience && createProjectDepsMode === 'beginner' ? (
                        <div
                          style={{
                            padding: 16,
                            borderRadius: 8,
                            border: `1px solid ${selectedProfile.accent}40`,
                            background: `${selectedProfile.accent}12`,
                          }}
                        >
                          <strong
                            style={{
                              display: 'block',
                              marginBottom: 8,
                              fontSize: 13,
                              color: selectedProfile.accent,
                            }}
                          >
                            {t('main.createProject.beginnerDepsTitle')}
                          </strong>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 14,
                              color: 'var(--text-muted)',
                              lineHeight: 1.55,
                            }}
                          >
                            {t(beginnerDepsSummaryKey(createProjectToolchain))}
                          </p>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {t('main.createProject.beginnerDepsNote')}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setCreateProjectDepsMode('expert')
                              setCreateProjectDeps(
                                defaultExpertDataScienceDeps(createProjectToolchain)
                              )
                            }}
                            style={{
                              padding: 0,
                              border: 'none',
                              background: 'transparent',
                              color: selectedProfile.accent,
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            {t('main.createProject.showAdvancedPackages')}
                          </button>
                        </div>
                      ) : isDataScience && createProjectToolchain === 'both' ? (
                        <>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 12,
                            }}
                          >
                            <strong
                              style={{
                                fontSize: 12,
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                                color: 'var(--text-muted)',
                              }}
                            >
                              {t('main.createProject.corePythonLibs')}
                            </strong>
                            <button
                              type="button"
                              onClick={() => {
                                setCreateProjectDepsMode('beginner')
                                setCreateProjectDeps(
                                  defaultBeginnerDataScienceDeps(createProjectToolchain)
                                )
                              }}
                              style={{
                                padding: 0,
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text-muted)',
                                fontSize: 12,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                              }}
                            >
                              {t('main.createProject.useRecommendedSet')}
                            </button>
                          </div>
                          {renderDataSciencePackageGrid(expertPythonPackages('both'))}
                          <strong
                            style={{
                              display: 'block',
                              marginTop: 20,
                              marginBottom: 12,
                              fontSize: 12,
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {t('main.createProject.coreBothR')}
                          </strong>
                          {renderDataSciencePackageGrid(expertRPackages('both'))}
                        </>
                      ) : (
                        <>
                          {isDataScience && (
                            <div style={{ marginBottom: 12 }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setCreateProjectDepsMode('beginner')
                                  setCreateProjectDeps(
                                    defaultBeginnerDataScienceDeps(createProjectToolchain)
                                  )
                                }}
                                style={{
                                  padding: 0,
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'var(--text-muted)',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                }}
                              >
                                {t('main.createProject.useRecommendedSet')}
                              </button>
                            </div>
                          )}
                          <strong
                            style={{
                              display: 'block',
                              marginBottom: 12,
                              fontSize: 12,
                              textTransform: 'uppercase',
                              letterSpacing: 1,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {isDataScience
                              ? createProjectToolchain === 'r'
                                ? t('main.createProject.coreRLibs')
                                : t('main.createProject.corePythonLibs')
                              : t('main.createProject.coreNPMLibs')}
                          </strong>
                          {isDataScience ? (
                            renderDataSciencePackageGrid(
                              createProjectToolchain === 'r'
                                ? expertRPackages('r')
                                : expertPythonPackages(createProjectToolchain)
                            )
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              {[
                                'tailwindcss',
                                'react-router-dom',
                                'axios',
                                'zod',
                                'framer-motion',
                                'lucide-react',
                                'zustand',
                                'react-query',
                              ].map((dep) => (
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
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={Object.keys(createProjectDeps).includes(dep)}
                                    onChange={(e) => {
                                      if (e.target.checked)
                                        setCreateProjectDeps({
                                          ...createProjectDeps,
                                          [dep]: 'latest',
                                        })
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
                                    }}
                                  />
                                  <span style={{ fontSize: 14 }}>{dep}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {installedEditors.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <strong
                          style={{
                            display: 'block',
                            marginBottom: 8,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('main.createProject.preferredEditor')}
                        </strong>
                        <select
                          value={selectedEditorCmd}
                          onChange={(e) => {
                            setSelectedEditorCmd(e.target.value)
                            persistPreferredEditorCmd(e.target.value)
                          }}
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(0,0,0,0.2)',
                            color: 'var(--text)',
                            fontSize: 16,
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {installedEditors.map((ed) => (
                            <option key={ed.name} value={ed.cmd}>
                              {ed.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div
                      style={{
                        marginBottom: 8,
                        paddingTop: 16,
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={createProjectAutoInstall}
                          onChange={(e) => setCreateProjectAutoInstall(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: selectedProfile.accent }}
                        />
                        <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>
                          {t('main.createProject.autoInstall')}
                        </span>
                      </label>
                      <p
                        style={{ margin: '6px 0 0 28px', fontSize: 12, color: 'var(--text-muted)' }}
                      >
                        {isDataScience && createProjectDepsMode === 'beginner'
                          ? t('main.createProject.autoInstallBeginner')
                          : t('main.createProject.autoInstallDesc', {
                              lockfile: isDataScience
                                ? createProjectToolchain === 'both'
                                  ? t('main.createProject.lockfileBoth')
                                  : createProjectToolchain === 'r'
                                    ? t('main.createProject.installR')
                                    : t('main.createProject.requirementsTxt')
                                : t('main.createProject.packageJson'),
                            })}
                      </p>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: 20,
                    marginTop: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={closeCreateProjectModal}
                    style={{
                      padding: '10px 20px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 14,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#fff'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-muted)'
                    }}
                  >
                    {t('main.createProject.cancel')}
                  </button>

                  {createProjectStep > 1 && (
                    <button
                      type="button"
                      onClick={() => setCreateProjectStep((s) => s - 1)}
                      style={{
                        padding: '10px 24px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      }}
                    >
                      {t('main.createProject.back')}
                    </button>
                  )}

                  {createProjectStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setCreateProjectStep((s) => s + 1)}
                      disabled={createProjectStep === 1 && !createProjectName.trim()}
                      style={{
                        padding: '10px 24px',
                        border: 'none',
                        borderRadius: 6,
                        background:
                          createProjectStep === 1 && !createProjectName.trim()
                            ? 'rgba(255,255,255,0.1)'
                            : selectedProfile.accent,
                        color:
                          createProjectStep === 1 && !createProjectName.trim()
                            ? 'var(--text-muted)'
                            : '#fff',
                        cursor:
                          createProjectStep === 1 && !createProjectName.trim()
                            ? 'not-allowed'
                            : 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {t('main.createProject.next')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitCreateProject}
                      style={{
                        padding: '10px 24px',
                        border: 'none',
                        borderRadius: 6,
                        background: selectedProfile.accent,
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 14,
                        boxShadow: `0 4px 12px ${selectedProfile.accent}40`,
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-1px)'
                        e.currentTarget.style.boxShadow = `0 6px 16px ${selectedProfile.accent}60`
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = `0 4px 12px ${selectedProfile.accent}40`
                      }}
                    >
                      {t('main.createProject.scaffoldProject')}
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityChart(props: {
  data: Array<{ label: string; cpu: number; ram: number }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  const maxVal = 100
  return (
    <div className="dashboard-widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 className="dashboard-widget-title">{t('main.activity.title')}</h3>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: 200,
          padding: '16px 0',
          overflow: 'hidden',
        }}
      >
        {props.data.map((d, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              flex: 1,
            }}
          >
            <div style={{ display: 'flex', gap: 2, height: 140, alignItems: 'flex-end' }}>
              <div
                style={{
                  width: 8,
                  height: `${Math.max(2, (d.cpu / maxVal) * 120)}px`,
                  background: 'var(--accent)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s ease',
                }}
                title={`${t('main.activity.cpu')} ${d.cpu.toFixed(0)}%`}
              />
              <div
                style={{
                  width: 8,
                  height: `${Math.max(2, (d.ram / maxVal) * 120)}px`,
                  background: 'var(--green)',
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s ease',
                }}
                title={`${t('main.activity.ram')} ${d.ram.toFixed(0)}%`}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {i === 0 || i === Math.floor(props.data.length / 2) || i === props.data.length - 1
                ? d.label
                : '\u00A0'}
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          marginTop: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('main.activity.cpu')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, background: 'var(--green)', borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('main.activity.ram')}</span>
        </div>
      </div>
    </div>
  )
}

function ResourceDonutChart(props: {
  data: Array<{ label: string; value: number; color: string }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  const total = props.data.reduce((sum, d) => sum + d.value, 0)
  const normalized =
    total > 0
      ? props.data.map((d) => ({ ...d, percent: (d.value / total) * 100 }))
      : props.data.map((d) => ({ ...d, percent: 0 }))

  let conic = ''
  if (total === 0) {
    conic = 'var(--border)'
  } else {
    conic = 'conic-gradient('
    let angle = 0
    normalized.forEach((d, i) => {
      const sliceAngle = (d.percent / 100) * 360
      conic += `${d.color} ${angle}deg, ${d.color} ${angle + sliceAngle}deg${i < normalized.length - 1 ? ', ' : ''}`
      angle += sliceAngle
    })
    conic += ')'
  }

  return (
    <div className="dashboard-widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3 className="dashboard-widget-title">{t('main.containerStatus.title')}</h3>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
        <div
          style={{
            position: 'relative',
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: conic,
            flexShrink: 0,
          }}
        >
          {/* Inner donut cutout */}
          <div
            style={{
              position: 'absolute',
              inset: 28,
              borderRadius: '50%',
              background: 'var(--bg-widget)',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 140 }}>
          {normalized.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  background: d.color,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {d.label}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {d.percent.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EventFeed(props: {
  events: Array<{ id: string; icon: string; color: string; title: string; time: string }>
}): ReactElement {
  const { t } = useTranslation('dashboard')
  return (
    <div className="dashboard-widget">
      <h3 className="dashboard-widget-title">{t('main.recentActivity.title')}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {props.events.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              padding: '12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: e.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                className={`codicon codicon-${e.icon}`}
                style={{ fontSize: 14, color: '#fff' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{e.title}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{e.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DashboardMetricBar(props: {
  label: string
  valueText: string
  percent: number
  subline?: string
  barColor?: string
}): ReactElement {
  const pct = Number.isFinite(props.percent) ? Math.min(100, Math.max(0, props.percent)) : 0
  const tone =
    props.barColor ?? (pct > 85 ? 'var(--red)' : pct > 60 ? 'var(--yellow)' : 'var(--green)')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
          {props.label}
        </span>
        <strong style={{ fontSize: 13, color: tone }}>{props.valueText}</strong>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 4,
          background: 'color-mix(in srgb, var(--border) 80%, transparent)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 4,
            background: tone,
            transition: 'width 0.35s ease-out',
          }}
        />
      </div>
      {props.subline && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{props.subline}</span>
      )}
    </div>
  )
}
